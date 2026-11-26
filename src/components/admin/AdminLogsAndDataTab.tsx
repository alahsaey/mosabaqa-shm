import React, { useState, useEffect } from 'react';
import {
  Download,
  Upload,
  Save,
  Volume2,
  RotateCcw,
  Activity,
  BarChart3,
  CheckCircle2,
  Loader2,
  Image as ImageIcon,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { ActivityLogEntry, Category } from '../../types';
import { dataService, DBAppSettings, DBGameSession } from '../../lib/dataService';
import { BRAND_ASSETS } from '../../lib/assets';
import {
  appendLogoCacheBuster,
  isValidCustomLogoUrl,
  processUploadedLogoFile,
  syncDynamicPwaBranding,
} from '../../services/pwaBrandingService';
import {
  DEFAULT_SOUND_VOLUMES,
  normalizeSoundVolumes,
  SOUND_CATEGORY_META,
  SoundCategory,
  soundService,
  SoundVolumes,
} from '../../services/soundService';

interface AdminLogsAndDataTabProps {
  mode: 'reports' | 'activity_logs' | 'general_settings';
  categories: Category[];
  sessions: DBGameSession[];
  activityLogs: ActivityLogEntry[];
  settings: DBAppSettings;
  actorEmail: string;
}

export const AdminLogsAndDataTab: React.FC<AdminLogsAndDataTabProps> = ({
  mode,
  categories,
  sessions,
  activityLogs,
  settings,
  actorEmail,
}) => {
  const [compName, setCompName] = useState(settings.competitionName || 'مسابقة ابوالفواطم');
  const [compSlogan, setCompSlogan] = useState(
    settings.competitionSlogan || 'منصة ثقافية معرفية تنافسية مستندة إلى المصادر المعتبرة'
  );
  const [logoUrl, setLogoUrl] = useState(settings.logoUrl || '');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [correctUrl, setCorrectUrl] = useState(settings.correctSoundUrl || '');
  const [wrongUrl, setWrongUrl] = useState(settings.wrongSoundUrl || '');
  const [victoryUrl, setVictoryUrl] = useState(settings.victorySoundUrl || '');
  const [turnTransferUrl, setTurnTransferUrl] = useState(settings.turnTransferSoundUrl || '');
  const [timeoutUrl, setTimeoutUrl] = useState(settings.timeoutSoundUrl || '');
  const [soundVolumes, setSoundVolumes] = useState<SoundVolumes>(() =>
    normalizeSoundVolumes(settings.soundVolumes)
  );
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setCompName(settings.competitionName || 'مسابقة ابوالفواطم');
    setCompSlogan(
      settings.competitionSlogan || 'منصة ثقافية معرفية تنافسية مستندة إلى المصادر المعتبرة'
    );
    setLogoUrl(settings.logoUrl || '');
    setCorrectUrl(settings.correctSoundUrl || '');
    setWrongUrl(settings.wrongSoundUrl || '');
    setVictoryUrl(settings.victorySoundUrl || '');
    setTurnTransferUrl(settings.turnTransferSoundUrl || '');
    setTimeoutUrl(settings.timeoutSoundUrl || '');
    setSoundVolumes(normalizeSoundVolumes(settings.soundVolumes));
  }, [settings]);

  const handleUploadLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice('يرجى اختيار ملف صورة صالح (PNG أو JPG أو WebP).');
      return;
    }
    setUploadingLogo(true);
    setNotice(null);
    try {
      const optimizedDataUrl = await processUploadedLogoFile(file);
      setLogoUrl(optimizedDataUrl);
      setNotice('تم تجهيز الشعار بمقاس 512×512 بنجاح. اضغط «حفظ الإعدادات» لتحديث أيقونة التطبيق فوراً.');
    } catch {
      setNotice('تعذر معالجة ملف الصورة. يرجى المحاولة بصورة أخرى.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveGeneral = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const nowStamp = Date.now();
      const trimmedLogo = logoUrl.trim();
      const cacheBustedLogo =
        trimmedLogo && isValidCustomLogoUrl(trimmedLogo)
          ? appendLogoCacheBuster(trimmedLogo, nowStamp)
          : '';
      const resolvedName = compName.trim() || 'مسابقة ابوالفواطم';
      const resolvedSlogan = compSlogan.trim();

      await dataService.updateSettings({
        competitionName: resolvedName,
        competitionSlogan: resolvedSlogan,
        logoUrl: cacheBustedLogo,
        logoUpdatedAt: nowStamp,
        correctSoundUrl: correctUrl.trim(),
        wrongSoundUrl: wrongUrl.trim(),
        victorySoundUrl: victoryUrl.trim(),
        turnTransferSoundUrl: turnTransferUrl.trim(),
        timeoutSoundUrl: timeoutUrl.trim(),
        soundVolumes,
      });

      await syncDynamicPwaBranding({
        logoUrl: cacheBustedLogo,
        logoUpdatedAt: nowStamp,
        competitionName: resolvedName,
        competitionSlogan: resolvedSlogan,
      });

      await dataService.logActivity({
        action: 'تحديث الإعدادات العامة وشعار التطبيق (PWA) والصوتيات',
        targetType: 'settings',
        actorEmail,
      });
      setLogoUrl(cacheBustedLogo);
      setNotice('تم حفظ الإعدادات وتحديث شعار وأيقونة تثبيت التطبيق (PWA) مع تجاوز الكاش تلقائياً.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadBackup = async () => {
    setExporting(true);
    try {
      const backup = await dataService.exportFullBackup();
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `abo_alfawazem_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await dataService.logActivity({
        action: 'تصدير نسخة احتياطية كاملة (JSON)',
        targetType: 'settings',
        actorEmail,
      });
      setNotice('تم تنزيل النسخة الاحتياطية الكاملة بنجاح.');
    } finally {
      setExporting(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (Array.isArray(json.categories)) {
        await dataService.seedInitialData(json.categories);
      }
      if (Array.isArray(json.approvedSources)) {
        await dataService.seedInitialSources(json.approvedSources);
      }
      await dataService.logActivity({
        action: 'استعادة آمنة لنسخة احتياطية (دمج دون حذف)',
        targetType: 'settings',
        actorEmail,
      });
      setNotice('تمت الاستعادة والدمج بنجاح دون فقدان أي بيانات حالية.');
    } catch {
      setNotice('ملف النسخة الاحتياطية غير صالح.');
    }
  };

  if (mode === 'activity_logs') {
    return (
      <div className="space-y-6 text-right">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">سجل النشاطات الإدارية</h2>
          <p className="text-xs text-slate-600 mt-0.5">توثيق جميع التعديلات على الأقسام، الأسئلة، المصادر، والإعدادات</p>
        </div>

        <div className="surface-card rounded-2xl p-6 space-y-2.5">
          {activityLogs.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">لا توجد نشاطات مسجلة بعد.</p>
          ) : (
            activityLogs.map((log, i) => {
              const dt = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar-SA') : 'حديث';
              return (
                <div key={log.id || i} className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2.5">
                    <Activity className="w-4 h-4 text-[#9B7729] shrink-0" />
                    <div>
                      <span className="font-bold text-[#0B192C]">{log.action}</span>
                      {log.targetName && <span className="text-slate-600 mr-2">({log.targetName})</span>}
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{log.actorEmail}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{dt}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  if (mode === 'reports') {
    const allQs = categories.flatMap((c) => c.questions || []);
    const approvedCount = allQs.filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length;
    const completedCount = sessions.filter((s) => s.isCompleted).length;

    return (
      <div className="space-y-6 text-right">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">التقارير والإحصائيات الشاملة</h2>
          <p className="text-xs text-slate-600 mt-0.5">ملخص الجاهزية المعرفية ونشاط الفرق والمسابقات</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="surface-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-500">الأسئلة الجاهزة للتنافس</span>
            <div className="text-3xl font-extrabold text-[#0F766E] font-mono mt-2">{approvedCount}</div>
          </div>
          <div className="surface-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-500">إجمالي المسابقات المسجلة</span>
            <div className="text-3xl font-extrabold text-[#0B192C] font-mono mt-2">{sessions.length}</div>
          </div>
          <div className="surface-card rounded-2xl p-5">
            <span className="text-xs font-bold text-slate-500">المسابقات المكتملة</span>
            <div className="text-3xl font-extrabold text-[#9B7729] font-mono mt-2">{completedCount}</div>
          </div>
        </div>

        <div className="surface-card rounded-2xl p-6 space-y-3">
          <h3 className="font-display font-bold text-base text-[#0B192C] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#9B7729]" />
            <span>جاهزية كل قسم مقابل الهدف المطلوب</span>
          </h3>
          <div className="space-y-3">
            {categories.map((cat) => {
              const target = cat.targetQuestionCount || 15;
              const current = (cat.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length;
              const pct = Math.min(100, Math.round((current / target) * 100));
              return (
                <div key={cat.id} className="space-y-1">
                  <div className="flex justify-between text-xs font-bold text-[#0B192C]">
                    <span>{cat.name}</span>
                    <span className="font-mono tabular-nums">
                      {current} / {target} (%{pct})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#FAF7F2] border border-[#E6DFD1] overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: pct >= 100 ? '#0F766E' : '#C9A24D',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-right max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">الإعدادات العامة والنسخ الاحتياطي</h2>
          <p className="text-xs text-slate-600 mt-0.5">تخصيص اسم المسابقة، المؤثرات الصوتية، وتصدير أو استيراد البيانات بأمان</p>
        </div>
        <button
          type="button"
          onClick={handleSaveGeneral}
          disabled={saving}
          className="px-5 py-2.5 bg-[#0B192C] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-[#C9A24D]" />}
          <span>حفظ الإعدادات</span>
        </button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{notice}</span>
        </div>
      )}

      <div className="surface-card rounded-2xl p-6 space-y-5">
        <h3 className="font-display font-bold text-base text-[#0B192C]">هوية المنصة وشعار أيقونة التطبيق (PWA)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[#0B192C] block mb-1">عنوان المسابقة</label>
            <input
              type="text"
              value={compName}
              onChange={(e) => setCompName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[#0B192C] block mb-1">العبارة التعريفية</label>
            <input
              type="text"
              value={compSlogan}
              onChange={(e) => setCompSlogan(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
            />
          </div>
        </div>

        {/* Dynamic PWA App Icon & Logo Manager */}
        <div className="pt-4 border-t border-[#E6DFD1] grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-4 flex items-center gap-3.5 p-3.5 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1]">
            <div className="relative shrink-0">
              <img
                src={isValidCustomLogoUrl(logoUrl) ? logoUrl : BRAND_ASSETS.emblem}
                alt="معاينة شعار التطبيق"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-[#C9A24D] bg-[#0B192C] shadow-sm"
                onError={(e) => {
                  e.currentTarget.src = BRAND_ASSETS.emblem;
                }}
              />
              <span className="absolute -bottom-1 -left-1 w-6 h-6 rounded-lg bg-[#0B192C] border border-[#C9A24D] flex items-center justify-center">
                <Smartphone className="w-3.5 h-3.5 text-[#D9B768]" />
              </span>
            </div>
            <div className="min-w-0 space-y-1">
              <div className="text-xs font-extrabold text-[#0B192C]">معاينة أيقونة الجوال</div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                تُحدّث تلقائياً أيقونة التثبيت (192 و 512)، أيقونة الآيفون، وأيقونة المتصفح.
              </p>
            </div>
          </div>

          <div className="md:col-span-8 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <label className="px-4 py-2 rounded-xl bg-[#0B192C] hover:bg-[#13253E] text-[#D9B768] text-xs font-bold inline-flex items-center gap-2 cursor-pointer transition-colors">
                {uploadingLogo ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                <span>{uploadingLogo ? 'جاري معالجة الشعار...' : 'رفع شعار جديد من الجهاز'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={handleUploadLogoFile}
                  disabled={uploadingLogo}
                  className="hidden"
                />
              </label>

              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl('')}
                  className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>استعادة الشعار الافتراضي</span>
                </button>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">
                أو أدخل رابط شعار مباشر (HTTPS — يُضاف له معامل زمني تلقائي ?v= لتحديث الكاش)
              </label>
              <input
                type="text"
                value={logoUrl.startsWith('data:image/') ? '' : logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder={
                  logoUrl.startsWith('data:image/')
                    ? 'تم رفع صورة شعار مدمجة بنجاح — يمكنك لصق رابط بديل هنا إذا رغبت'
                    : 'https://example.com/logo.png'
                }
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-mono dir-ltr"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display font-bold text-base text-[#0B192C] flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-[#9B7729]" />
            <span>المؤثرات الصوتية ومستوى كل نوع تنبيه</span>
          </h3>
          <button
            type="button"
            onClick={() => setSoundVolumes({ ...DEFAULT_SOUND_VOLUMES })}
            className="text-xs font-bold text-[#9B7729] hover:text-[#0B192C] inline-flex items-center gap-1 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>استعادة المستويات الافتراضية</span>
          </button>
        </div>

        {/* Per-Alert-Type Default Volume Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SOUND_CATEGORY_META.map((cat) => {
            const pct = Math.round((soundVolumes[cat.id] ?? DEFAULT_SOUND_VOLUMES[cat.id]) * 100);
            const customUrlForCat =
              cat.id === 'turnSwitch'
                ? turnTransferUrl
                : cat.id === 'answers'
                  ? correctUrl
                  : cat.id === 'ceremony'
                    ? victoryUrl
                    : cat.id === 'timer'
                      ? timeoutUrl
                      : '';
            return (
              <div key={cat.id} className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-bold text-[#0B192C]">{cat.label}</div>
                    <div className="text-[11px] text-slate-500">{cat.description}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      soundService.play(cat.previewSound, {
                        customUrl: customUrlForCat,
                        volume: pct > 0 ? pct / 100 : 0.6,
                      })
                    }
                    className="px-2.5 py-1 rounded-lg bg-white border border-[#E6DFD1] hover:bg-[#0B192C] hover:text-[#D9B768] text-xs font-bold cursor-pointer shrink-0 transition-colors"
                  >
                    تجربة
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={pct}
                    onChange={(e) =>
                      setSoundVolumes((prev) => ({
                        ...prev,
                        [cat.id as SoundCategory]: Number(e.target.value) / 100,
                      }))
                    }
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

        {/* Optional Custom Audio URLs */}
        <div className="pt-3 border-t border-[#E6DFD1] space-y-3">
          <div className="text-xs font-bold text-slate-600">
            روابط صوتية مخصصة (اختيارية — عند تركها فارغة تُستخدم النغمات التلفزيونية المدمجة)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                label: 'انتقال الوقت للفريق الثاني (60 ← 30 ث)',
                val: turnTransferUrl,
                set: setTurnTransferUrl,
                test: 'turnTransfer' as const,
                vol: soundVolumes.turnSwitch,
              },
              {
                label: 'انتهاء الوقت الكامل',
                val: timeoutUrl,
                set: setTimeoutUrl,
                test: 'timeout' as const,
                vol: soundVolumes.timer,
              },
              {
                label: 'صوت الإجابة الصحيحة',
                val: correctUrl,
                set: setCorrectUrl,
                test: 'correct' as const,
                vol: soundVolumes.answers,
              },
              {
                label: 'صوت الإجابة الخاطئة',
                val: wrongUrl,
                set: setWrongUrl,
                test: 'wrong' as const,
                vol: soundVolumes.answers,
              },
              {
                label: 'صوت الفوز والتتويج',
                val: victoryUrl,
                set: setVictoryUrl,
                test: 'victory' as const,
                vol: soundVolumes.ceremony,
              },
            ].map((item) => (
              <div key={item.label} className="space-y-1.5">
                <label className="text-xs font-bold text-[#0B192C] block">{item.label}</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={item.val}
                    onChange={(e) => item.set(e.target.value)}
                    placeholder="اختياري: رابط MP3..."
                    className="flex-1 px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-mono dir-ltr"
                  />
                  <button
                    type="button"
                    onClick={() => soundService.play(item.test, { customUrl: item.val, volume: item.vol || 0.7 })}
                    className="px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold cursor-pointer"
                  >
                    تجربة
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-card rounded-2xl p-6 space-y-4">
        <h3 className="font-display font-bold text-base text-[#0B192C]">النسخ الاحتياطي والدمج الآمن (Zero Data Loss)</h3>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleDownloadBackup}
            disabled={exporting}
            className="px-5 py-3 bg-[#0B192C] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-[#C9A24D]" />}
            <span>تصدير نسخة احتياطية كاملة (JSON)</span>
          </button>

          <label className="px-5 py-3 bg-white border border-[#E6DFD1] hover:bg-[#FAF7F2] text-[#0B192C] text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4 text-[#9B7729]" />
            <span>استيراد ودمج نسخة احتياطية</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>
        </div>
      </div>
    </div>
  );
};
