import React, { useState, useEffect } from 'react';
import { Save, Loader2, CheckCircle2, Trophy, Sliders } from 'lucide-react';
import { CompetitionConfig, ScoringSettings } from '../../types';
import { dataService } from '../../lib/dataService';

interface AdminScoringAndConfigTabProps {
  mode: 'scoring' | 'competition_config';
  scoringSettings: ScoringSettings;
  competitionConfig: CompetitionConfig;
  actorEmail: string;
}

export const AdminScoringAndConfigTab: React.FC<AdminScoringAndConfigTabProps> = ({
  mode,
  scoringSettings,
  competitionConfig,
  actorEmail,
}) => {
  const [scoring, setScoring] = useState<ScoringSettings>(scoringSettings);
  const [config, setConfig] = useState<CompetitionConfig>(competitionConfig);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setScoring(scoringSettings);
  }, [scoringSettings]);

  useEffect(() => {
    setConfig(competitionConfig);
  }, [competitionConfig]);

  const handleSave = async () => {
    setSaving(true);
    setSavedNotice(false);
    try {
      await dataService.updateSettings({
        scoring,
        competitionConfig: config,
        timerDuration: config.timerDuration,
        enableSounds: config.enableSoundEffects,
      });
      await dataService.logActivity({
        action: mode === 'scoring' ? 'تحديث نظام النقاط والدرجات' : 'تحديث إعدادات المسابقة وقواعد التنافس',
        targetType: 'settings',
        actorEmail,
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-right max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">
            {mode === 'scoring' ? 'إعدادات نظام النقاط والاحتساب' : 'إعدادات المسابقة وآلية الجولات'}
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            {mode === 'scoring'
              ? 'تحديد قيمة السؤال حسب الصعوبة، مكافآت الإجابة الصحيحة، وخصم الإجابات الخاطئة'
              : 'ضبط عدد الفرق والأقسام والمؤقت الزمني وسياسات المراجعة والتكرار'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" /> : <Save className="w-4 h-4 text-[#C9A24D]" />}
          <span>حفظ الإعدادات</span>
        </button>
      </div>

      {savedNotice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>تم حفظ وتطبيق الإعدادات على جميع الشاشات بنجاح.</span>
        </div>
      )}

      {mode === 'scoring' ? (
        <div className="surface-card rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 font-display font-bold text-base text-[#0B192C] border-b border-[#E6DFD1] pb-3">
            <Trophy className="w-5 h-5 text-[#9B7729]" />
            <span>درجات الأسئلة والمكافآت والخصومات</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">المستوى السهل</label>
              <input
                type="number"
                value={scoring.easyPoints}
                onChange={(e) => setScoring({ ...scoring, easyPoints: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">المستوى المتوسط</label>
              <input
                type="number"
                value={scoring.mediumPoints}
                onChange={(e) => setScoring({ ...scoring, mediumPoints: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">المستوى الصعب</label>
              <input
                type="number"
                value={scoring.hardPoints}
                onChange={(e) => setScoring({ ...scoring, hardPoints: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">مستوى الخبير</label>
              <input
                type="number"
                value={scoring.expertPoints}
                onChange={(e) => setScoring({ ...scoring, expertPoints: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">مكافأة إضافية للإجابة الصحيحة</label>
              <input
                type="number"
                min={0}
                value={scoring.correctBonus}
                onChange={(e) => setScoring({ ...scoring, correctBonus: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">عدد الأسئلة المقترح لكل فريق في الجولة</label>
              <input
                type="number"
                min={1}
                max={30}
                value={scoring.questionsPerRound}
                onChange={(e) => setScoring({ ...scoring, questionsPerRound: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <label className="flex items-center gap-2.5 text-xs font-bold text-[#0B192C] cursor-pointer">
              <input
                type="checkbox"
                checked={scoring.deductOnWrong}
                onChange={(e) => setScoring({ ...scoring, deductOnWrong: e.target.checked })}
              />
              <span>تفعيل خصم نقاط عند الإجابة الخاطئة</span>
            </label>

            {scoring.deductOnWrong && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600">قيمة الخصم:</span>
                <input
                  type="number"
                  min={0}
                  value={scoring.wrongDeductionAmount}
                  onChange={(e) => setScoring({ ...scoring, wrongDeductionAmount: Number(e.target.value) })}
                  className="w-24 px-3 py-2 rounded-xl bg-white border border-[#E6DFD1] text-xs font-mono font-bold"
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="surface-card rounded-2xl p-6 space-y-6">
          <div className="flex items-center gap-2 font-display font-bold text-base text-[#0B192C] border-b border-[#E6DFD1] pb-3">
            <Sliders className="w-5 h-5 text-[#9B7729]" />
            <span>ضوابط المسابقة والعرض التلفزيوني</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">عدد الفرق المتنافسة</label>
              <input
                type="number"
                min={2}
                max={4}
                value={config.teamCount}
                onChange={(e) => setConfig({ ...config, teamCount: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">عدد الأقسام لكل فريق</label>
              <input
                type="number"
                min={1}
                max={6}
                value={config.categoriesPerTeam}
                onChange={(e) => setConfig({ ...config, categoriesPerTeam: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">المؤقت الافتراضي (ثانية)</label>
              <input
                type="number"
                min={10}
                max={300}
                value={config.timerDuration}
                onChange={(e) => setConfig({ ...config, timerDuration: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold"
              />
            </div>
          </div>

          <div className="space-y-3">
            {[
              {
                key: 'allowReplay',
                label: 'السماح بإعادة اللعب بنفس الفريقين من شاشة النتائج',
              },
              {
                key: 'showAnswerAfterTimeout',
                label: 'كشف الإجابة الصحيحة والمصدر تلقائياً عند انتهاء المؤقت',
              },
              {
                key: 'enableVisualEffects',
                label: 'تفعيل التأثيرات البصرية وقصاصات التتويج',
              },
              {
                key: 'enableSoundEffects',
                label: 'تفعيل المؤثرات الصوتية عند الإجابات وانتهاء الوقت',
              },
              {
                key: 'autoApproveVerifiedAI',
                label: 'السماح بالاعتماد المباشر للأسئلة المولدة الموثقة بالكامل (عدا التي تحتاج مراجعة يدوية)',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center gap-3 text-xs font-bold text-[#0B192C] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={Boolean((config as any)[item.key])}
                  onChange={(e) => setConfig({ ...config, [item.key]: e.target.checked })}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
