import React, { useRef } from 'react';
import {
  X,
  Volume2,
  Volume1,
  VolumeX,
  Sparkles,
  Maximize2,
  Minimize2,
  RotateCcw,
  ShieldCheck,
  History,
  BarChart3,
  Play,
  Sliders,
} from 'lucide-react';
import {
  DEFAULT_SOUND_VOLUMES,
  SOUND_CATEGORY_META,
  SoundCategory,
  SoundEffectType,
  SoundVolumes,
} from '../../services/soundService';
import { PWAInstallButton } from '../ui/PWAInstallButton';

interface PublicSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  enableSounds: boolean;
  onToggleSounds: () => void;
  soundVolumes: SoundVolumes;
  onChangeSoundVolume: (category: SoundCategory, volume: number) => void;
  onResetSoundVolumes: () => void;
  onPreviewSound: (type: SoundEffectType, overrideVolume?: number) => void;
  enableVisualEffects: boolean;
  onToggleVisualEffects: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  hasSavedSession: boolean;
  onResetSavedSession: () => void;
  onOpenAdmin: () => void;
  onOpenRecent?: () => void;
  onOpenStats?: () => void;
  timerDuration: number;
  competitionName?: string;
  logoUrl?: string;
}

export const PublicSettingsModal: React.FC<PublicSettingsModalProps> = ({
  isOpen,
  onClose,
  enableSounds,
  onToggleSounds,
  soundVolumes,
  onChangeSoundVolume,
  onResetSoundVolumes,
  onPreviewSound,
  enableVisualEffects,
  onToggleVisualEffects,
  isFullscreen,
  onToggleFullscreen,
  hasSavedSession,
  onResetSavedSession,
  onOpenAdmin,
  onOpenRecent,
  onOpenStats,
  competitionName,
  logoUrl,
}) => {
  const lastNonZeroRef = useRef<Partial<Record<SoundCategory, number>>>({});

  if (!isOpen) return null;

  const handleToggleCategoryMute = (cat: SoundCategory) => {
    const current = soundVolumes[cat] ?? DEFAULT_SOUND_VOLUMES[cat];
    if (current > 0) {
      lastNonZeroRef.current[cat] = current;
      onChangeSoundVolume(cat, 0);
    } else {
      const restored = lastNonZeroRef.current[cat] || DEFAULT_SOUND_VOLUMES[cat] || 0.7;
      onChangeSoundVolume(cat, restored);
    }
  };

  return (
    <div className="fixed inset-0 z-[9990] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] flex flex-col bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden text-right">
        <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between border-b border-[#C9A24D]/30 shrink-0">
          <div>
            <span className="text-[11px] font-bold text-[#D9B768]">تخصيص تجربة العرض والصوتيات</span>
            <h3 className="font-display font-extrabold text-lg">إعدادات المشغل والجلسة</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
          {/* Master Sound Toggle + Per-Category Volume Mixer */}
          <div className="rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] overflow-hidden">
            <div className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {enableSounds ? (
                  <Volume2 className="w-5 h-5 text-[#0F766E] shrink-0" />
                ) : (
                  <VolumeX className="w-5 h-5 text-slate-400 shrink-0" />
                )}
                <div>
                  <div className="font-bold text-sm text-[#0B192C]">المؤثرات والتنبيهات الصوتية</div>
                  <div className="text-xs text-slate-500">تحكم شامل ومستقل لكل نوع تنبيه صوتي</div>
                </div>
              </div>
              <button
                type="button"
                onClick={onToggleSounds}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer shrink-0 transition-colors ${
                  enableSounds ? 'bg-[#0F766E] text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {enableSounds ? 'مفعلة' : 'صامت'}
              </button>
            </div>

            {/* Individual Volume Sliders per Alert Category */}
            <div
              className={`px-4 pb-4 pt-3 border-t border-[#E6DFD1]/80 space-y-3 transition-opacity ${
                enableSounds ? 'opacity-100' : 'opacity-45 pointer-events-none'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                <span className="inline-flex items-center gap-1.5 text-[#0B192C]">
                  <Sliders className="w-3.5 h-3.5 text-[#9B7729]" />
                  <span>مستوى الصوت لكل نوع تنبيه</span>
                </span>
                <button
                  type="button"
                  onClick={onResetSoundVolumes}
                  className="text-[#9B7729] hover:text-[#0B192C] underline underline-offset-2 cursor-pointer"
                >
                  إعادة الضبط الافتراضي
                </button>
              </div>

              <div className="space-y-2.5">
                {SOUND_CATEGORY_META.map((cat) => {
                  const vol = soundVolumes[cat.id] ?? DEFAULT_SOUND_VOLUMES[cat.id];
                  const pct = Math.round(vol * 100);
                  const isMuted = pct === 0;
                  return (
                    <div
                      key={cat.id}
                      className="p-3 rounded-xl bg-white border border-[#E6DFD1] space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-[#0B192C] flex items-center gap-1.5">
                            <span>{cat.label}</span>
                            {cat.id === 'turnSwitch' && (
                              <span className="px-1.5 py-0.5 rounded bg-[#C9A24D]/15 text-[#9B7729] text-[10px] font-extrabold">
                                60 ث ← 30 ث
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">{cat.description}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPreviewSound(cat.previewSound, isMuted ? 0.6 : vol)}
                          className="px-2.5 py-1 rounded-lg bg-[#FAF7F2] hover:bg-[#0B192C] hover:text-[#D9B768] border border-[#E6DFD1] text-[#0B192C] text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                          title={`تجربة ${cat.label}`}
                        >
                          <Play className="w-3 h-3" />
                          <span>تجربة</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleToggleCategoryMute(cat.id)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                            isMuted
                              ? 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                              : 'bg-[#FAF7F2] text-[#0B192C] hover:bg-[#F3EFE6]'
                          }`}
                          title={isMuted ? 'إلغاء كتم هذا التنبيه' : 'كتم هذا التنبيه'}
                        >
                          {isMuted ? (
                            <VolumeX className="w-3.5 h-3.5" />
                          ) : pct < 50 ? (
                            <Volume1 className="w-3.5 h-3.5 text-[#9B7729]" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5 text-[#0F766E]" />
                          )}
                        </button>

                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={5}
                          value={pct}
                          aria-label={`مستوى صوت ${cat.label}`}
                          onChange={(e) => onChangeSoundVolume(cat.id, Number(e.target.value) / 100)}
                          className="flex-1 h-1.5 rounded-lg appearance-none bg-[#E6DFD1] accent-[#C9A24D] cursor-pointer"
                        />

                        <span className="w-10 text-left font-mono font-bold text-xs tabular-nums text-[#0B192C]">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="w-5 h-5 text-[#9B7729]" />
              <div>
                <div className="font-bold text-sm text-[#0B192C]">التأثيرات البصرية والاحتفال</div>
                <div className="text-xs text-slate-500">الانتقالات الناعمة وقصاصات التتويج</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleVisualEffects}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                enableVisualEffects ? 'bg-[#0B192C] text-[#D9B768]' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {enableVisualEffects ? 'مفعلة' : 'مخفضة'}
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isFullscreen ? (
                <Minimize2 className="w-5 h-5 text-[#0B192C]" />
              ) : (
                <Maximize2 className="w-5 h-5 text-[#0B192C]" />
              )}
              <div>
                <div className="font-bold text-sm text-[#0B192C]">وضع العرض التلفزيوني</div>
                <div className="text-xs text-slate-500">توقيت السؤال: 60 ث للفريق الأول • 30 ث للفريق الثاني</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleFullscreen}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] cursor-pointer"
            >
              {isFullscreen ? 'إنهاء التكبير' : 'ملء الشاشة'}
            </button>
          </div>

          {(onOpenRecent || onOpenStats) && (
            <div className="grid grid-cols-2 gap-2.5">
              {onOpenRecent && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRecent();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[#0B192C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <History className="w-4 h-4 text-[#9B7729]" />
                  <span>سجل المسابقات</span>
                </button>
              )}
              {onOpenStats && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenStats();
                  }}
                  className="py-2.5 px-3 rounded-xl bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[#0B192C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-[#9B7729]" />
                  <span>الإحصائيات</span>
                </button>
              )}
            </div>
          )}

          {hasSavedSession && (
            <button
              type="button"
              onClick={() => {
                onResetSavedSession();
                onClose();
              }}
              className="w-full py-3 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              <span>مسح الجلسة المحفوظة محلياً والبدء من جديد</span>
            </button>
          )}

          <PWAInstallButton
            competitionName={competitionName}
            logoUrl={logoUrl}
            variant="modal"
          />

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAdmin();
            }}
            className="w-full py-3 px-4 rounded-xl bg-[#0B192C] hover:bg-[#13253E] text-[#D9B768] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>دخول لوحة تحكم الإدارة والمصادر</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PublicSettingsModal;
