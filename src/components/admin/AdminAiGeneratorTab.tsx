import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  BookOpen,
  ShieldAlert,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Save,
  ExternalLink,
} from 'lucide-react';
import {
  ApprovedSource,
  Category,
  CompetitionConfig,
  QuestionDifficulty,
  QuestionType,
  ScoringSettings,
} from '../../types';
import { aiService, GeneratedGroundedQuestion } from '../../services/aiService';
import { dataService } from '../../lib/dataService';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../../constants';

interface AdminAiGeneratorTabProps {
  categories: Category[];
  sources: ApprovedSource[];
  scoringSettings: ScoringSettings;
  competitionConfig: CompetitionConfig;
  actorEmail: string;
}

export const AdminAiGeneratorTab: React.FC<AdminAiGeneratorTabProps> = ({
  categories,
  sources,
  scoringSettings,
  competitionConfig,
  actorEmail,
}) => {
  const [categoryId, setCategoryId] = useState(categories[0]?.id || '');
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('medium');
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>(['multiple_choice']);
  const [count, setCount] = useState<number>(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [insufficientNotice, setInsufficientNotice] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<GeneratedGroundedQuestion[]>([]);
  const [saveAsApproved, setSaveAsApproved] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || categories[0],
    [categories, categoryId]
  );

  const approvedWhitelist = useMemo(() => sources.filter((s) => s.isApproved), [sources]);

  const effectiveSources = useMemo(() => {
    if (selectedSourceIds.length > 0) {
      return approvedWhitelist.filter((s) => selectedSourceIds.includes(s.id));
    }
    if (activeCategory?.linkedSourceIds && activeCategory.linkedSourceIds.length > 0) {
      const linked = approvedWhitelist.filter((s) => activeCategory.linkedSourceIds!.includes(s.id));
      if (linked.length > 0) return linked;
    }
    const catMapped = approvedWhitelist.filter((s) => s.linkedCategoryIds?.includes(activeCategory?.id || ''));
    return catMapped.length > 0 ? catMapped : approvedWhitelist;
  }, [approvedWhitelist, selectedSourceIds, activeCategory]);

  const handleGenerate = async () => {
    if (!activeCategory) return;
    if (approvedWhitelist.length === 0) {
      setErrorMsg('لا توجد مصادر شيعية معتمدة في القائمة البيضاء حالياً. أضف مصدراً وفعّله أولاً.');
      return;
    }

    setIsGenerating(true);
    setErrorMsg(null);
    setInsufficientNotice(null);
    setSavedSuccess(null);
    setPreviewList([]);

    try {
      const res = await aiService.generateGroundedQuestions({
        categoryName: activeCategory.name,
        categoryDescription: activeCategory.description,
        approvedSources: effectiveSources,
        difficulty,
        questionTypes: questionTypes.length > 0 ? questionTypes : ['multiple_choice'],
        count,
        existingQuestions: (activeCategory.questions || []).map((q) => q.text),
        scoringSettings,
        autoApproveVerifiedAI: competitionConfig.autoApproveVerifiedAI,
      });

      if (res.insufficientSource || res.questions.length === 0) {
        setInsufficientNotice(
          res.message ||
            'المصادر المعتمدة المحددة لا تحتوي على مادة نصية كافية حالياً لتوليد أسئلة دقيقة دون تخمين.'
        );
      } else {
        setPreviewList(res.questions);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'تعذر الاتصال بمحرك التوليد الموثق.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveGenerated = async () => {
    if (!activeCategory || previewList.length === 0) return;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      for (const q of previewList) {
        const finalStatus =
          saveAsApproved && !q.needsManualVerification ? 'approved' : q.reviewStatus || 'pending';
        await dataService.addQuestion(activeCategory.id, {
          text: q.text,
          answer: q.answer,
          points: q.points,
          questionType: q.questionType,
          difficulty: q.difficulty,
          options: q.options,
          source: q.sourceName,
          sourceName: q.sourceName,
          sourceUrl: q.sourceUrl,
          sourceId: q.sourceId,
          volumePageOrHadith: q.volumePageOrHadith,
          originalExcerpt: q.originalExcerpt,
          hint: q.hint,
          needsManualVerification: q.needsManualVerification,
          verificationNote: q.verificationNote,
          reviewStatus: finalStatus,
        });
      }

      await dataService.logActivity({
        action: 'توليد وحفظ أسئلة موثقة بالذكاء الاصطناعي',
        targetType: 'question',
        targetName: `${activeCategory.name} (${previewList.length} سؤال)`,
        actorEmail,
      });

      setSavedSuccess(`تم حفظ ${previewList.length} سؤال في قسم «${activeCategory.name}» بنجاح.`);
      setPreviewList([]);
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ أثناء حفظ الأسئلة.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 text-right">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">
          محرك توليد الأسئلة الموثق (حصراً من المصادر الشيعية المعتمدة)
        </h2>
        <p className="text-xs text-slate-600 mt-1">
          يمنع المحرك منعاً باتاً الاعتماد على الذاكرة العامة أو المواقع غير المعتمدة، ويرفض التوليد إذا لم تتوفر نصوص كافية في القائمة البيضاء.
        </p>
      </div>

      {/* Strict Grounding Guard Card */}
      <div className="p-4 rounded-2xl bg-[#0B192C] text-[#FAF7F2] border border-[#C9A24D]/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-[#C9A24D] shrink-0" />
          <div>
            <div className="font-bold text-sm text-[#D9B768]">حالة المصادر المفعلة للتوليد</div>
            <div className="text-xs text-slate-300 mt-0.5">
              يعتمد التوليد حالياً على <strong className="text-white">{effectiveSources.length}</strong> مصدر معتمد من أصل{' '}
              {approvedWhitelist.length} مصدر في القائمة البيضاء.
            </div>
          </div>
        </div>
        <span className="text-xs font-bold text-emerald-300">الاستناد الإلزامي مفعل ✓</span>
      </div>

      {/* Generator Controls */}
      <div className="surface-card rounded-2xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-bold text-[#0B192C] block mb-1.5">القسم الثقافي المستهدف</label>
            <select
              value={activeCategory?.id || ''}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setSelectedSourceIds([]);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-[#0B192C]"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#0B192C] block mb-1.5">مستوى الصعوبة</label>
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-[#0B192C]"
            >
              {(Object.keys(DIFFICULTY_LABELS) as QuestionDifficulty[]).map((d) => (
                <option key={d} value={d}>
                  {DIFFICULTY_LABELS[d]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-[#0B192C] block mb-1.5">عدد الأسئلة المطلوب (١ - ١٠)</label>
            <input
              type="number"
              min={1}
              max={10}
              value={count}
              onChange={(e) => setCount(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold font-mono text-[#0B192C]"
            />
          </div>
        </div>

        {/* Question Types */}
        <div>
          <label className="text-xs font-bold text-[#0B192C] block mb-2">أنواع الأسئلة المطلوبة</label>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((qt) => {
              const selected = questionTypes.includes(qt);
              return (
                <button
                  key={qt}
                  type="button"
                  onClick={() =>
                    setQuestionTypes((prev) =>
                      selected ? (prev.length > 1 ? prev.filter((x) => x !== qt) : prev) : [...prev, qt]
                    )
                  }
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold cursor-pointer ${
                    selected
                      ? 'bg-[#0B192C] text-[#D9B768] border-[#C9A24D]'
                      : 'bg-[#FAF7F2] text-slate-600 border-[#E6DFD1]'
                  }`}
                >
                  {QUESTION_TYPE_LABELS[qt]}
                </button>
              );
            })}
          </div>
        </div>

        {/* Specific Source Filter */}
        <div>
          <label className="text-xs font-bold text-[#0B192C] block mb-2">
            تحديد مصادر بعينها (اتركه فارغاً لاستخدام المصادر المرتبطة بالقسم تلقائياً)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {approvedWhitelist.map((src) => {
              const picked = selectedSourceIds.includes(src.id);
              const hasExcerpt = Boolean(src.verifiedExcerpt && src.verifiedExcerpt.trim().length >= 40);
              return (
                <button
                  key={src.id}
                  type="button"
                  onClick={() =>
                    setSelectedSourceIds((prev) =>
                      picked ? prev.filter((x) => x !== src.id) : [...prev, src.id]
                    )
                  }
                  className={`p-3 rounded-xl border text-right text-xs transition-all cursor-pointer ${
                    picked
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold'
                      : 'bg-[#FAF7F2] border-[#E6DFD1] text-slate-700 hover:border-[#C9A24D]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-bold">{src.name}</span>
                    {hasExcerpt && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 truncate">
                    {hasExcerpt ? 'يحتوي نصاً موثقاً' : src.url || 'بحاجة لنص مقتبس أو فحص رابط'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={saveAsApproved}
              onChange={(e) => setSaveAsApproved(e.target.checked)}
              className="rounded border-[#E6DFD1]"
            />
            <span>اعتماد الأسئلة الموثقة مباشرة عند الحفظ (تُستثنى الأسئلة المحتاجة لمراجعة يدوية)</span>
          </label>

          <button
            type="button"
            disabled={isGenerating || approvedWhitelist.length === 0}
            onClick={handleGenerate}
            className="px-6 py-3 bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" /> : <Sparkles className="w-4 h-4 text-[#C9A24D]" />}
            <span>{isGenerating ? 'جاري الاستخراج والتوليد الموثق...' : 'توليد الأسئلة من المصادر المعتمدة'}</span>
          </button>
        </div>
      </div>

      {/* Notices */}
      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {insufficientNotice && (
        <div className="p-5 rounded-2xl bg-[#F7F1DF] border border-[#C9A24D] text-[#0B192C] text-xs font-bold space-y-1.5">
          <div className="flex items-center gap-2 text-[#9B7729]">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>تنبيه عدم كفاية النص المصدري المعتمد</span>
          </div>
          <p className="text-slate-700 leading-relaxed">{insufficientNotice}</p>
          <p className="text-slate-600">
            لضمان عدم التوليد من الذاكرة العامة: انتقل إلى قسم «إدارة المصادر المعتمدة»، واضغط «فحص قراءة الرابط» أو أضف مقتطفاً نصياً موثقاً من الكتاب/المرجع.
          </p>
        </div>
      )}

      {savedSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          <span>{savedSuccess}</span>
        </div>
      )}

      {/* Generated Preview */}
      {previewList.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display font-bold text-lg text-[#0B192C]">
              معاينة الأسئلة المولدة ({previewList.length})
            </h3>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveGenerated}
              className="px-6 py-3 bg-[#0F766E] hover:bg-[#0D5F59] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>حفظ جميع الأسئلة في البنك</span>
            </button>
          </div>

          <div className="space-y-3">
            {previewList.map((q, idx) => (
              <div key={idx} className="surface-card rounded-2xl p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 font-bold text-[#9B7729]">
                    <span>#{idx + 1}</span>
                    <span>•</span>
                    <span>{QUESTION_TYPE_LABELS[q.questionType]}</span>
                    <span>•</span>
                    <span>{DIFFICULTY_LABELS[q.difficulty]} ({q.points} نقطة)</span>
                  </div>
                  {q.needsManualVerification && (
                    <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      يتطلب مراجعة إدارية يدوية
                    </span>
                  )}
                </div>

                <h4 className="font-bold text-base text-[#0B192C]">{q.text}</h4>
                <p className="text-sm font-bold text-emerald-800">الإجابة الصحيحة: {q.answer}</p>

                {q.options && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {q.options.map((o, oIdx) => (
                      <div key={oIdx} className="px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold">
                        {oIdx + 1}. {o}
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#0B192C]">
                    <span>
                      المصدر: {q.sourceName} {q.volumePageOrHadith ? `— (${q.volumePageOrHadith})` : ''}
                    </span>
                    {q.sourceUrl && q.sourceUrl.startsWith('http') && (
                      <a
                        href={q.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#0F766E] hover:underline flex items-center gap-1"
                      >
                        <span>الرابط المعتمد</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  {q.originalExcerpt && (
                    <p className="text-slate-600 leading-relaxed">النص المستخرج: «{q.originalExcerpt}»</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
