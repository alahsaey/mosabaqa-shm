import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  FileText,
  Sparkles,
  Loader2,
  X,
  BookOpen,
  Film,
} from 'lucide-react';
import {
  ApprovedSource,
  Category,
  Question,
  QuestionDifficulty,
  QuestionType,
  ReviewStatus,
  ScoringSettings,
} from '../../types';
import { dataService } from '../../lib/dataService';
import { aiService } from '../../services/aiService';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../../constants';
import { areVideoClipsApproved, formatTimeMMSS } from '../../services/videoService';

interface AdminQuestionsBankTabProps {
  categories: Category[];
  sources: ApprovedSource[];
  scoringSettings: ScoringSettings;
  actorEmail: string;
  onOpenVideoStudio?: (catId: string, questionId: string) => void;
}

export const AdminQuestionsBankTab: React.FC<AdminQuestionsBankTabProps> = ({
  categories,
  sources,
  scoringSettings,
  actorEmail,
  onOpenVideoStudio,
}) => {
  const [selectedCatId, setSelectedCatId] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ReviewStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [editingModal, setEditingModal] = useState<{
    catId: string;
    question: Partial<Question>;
  } | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkCatId, setBulkCatId] = useState<string>(categories[0]?.id || '');
  const [bulkText, setBulkText] = useState('');
  const [bulkSourceName, setBulkSourceName] = useState('');
  const [bulkParsing, setBulkParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingOptions, setGeneratingOptions] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const flatQuestions = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list: { catId: string; catName: string; q: Question }[] = [];
    categories.forEach((c) => {
      if (selectedCatId !== 'all' && c.id !== selectedCatId) return;
      (c.questions || []).forEach((q) => {
        const status: ReviewStatus = q.reviewStatus || 'approved';
        if (statusFilter !== 'all' && status !== statusFilter) return;
        if (
          term &&
          !q.text.toLowerCase().includes(term) &&
          !q.answer.toLowerCase().includes(term) &&
          !(q.sourceName || q.source || '').toLowerCase().includes(term)
        ) {
          return;
        }
        list.push({ catId: c.id, catName: c.name, q });
      });
    });
    return list;
  }, [categories, selectedCatId, statusFilter, searchTerm]);

  const pointsByDifficulty = (diff: QuestionDifficulty): number => {
    if (diff === 'easy') return scoringSettings.easyPoints;
    if (diff === 'hard') return scoringSettings.hardPoints;
    if (diff === 'expert') return scoringSettings.expertPoints;
    return scoringSettings.mediumPoints;
  };

  const openNewQuestion = () => {
    const defaultCat = selectedCatId !== 'all' ? selectedCatId : categories[0]?.id || '';
    if (!defaultCat) return;
    setEditingModal({
      catId: defaultCat,
      question: {
        text: '',
        answer: '',
        questionType: 'multiple_choice',
        difficulty: 'medium',
        points: scoringSettings.mediumPoints,
        options: ['', '', '', ''],
        sourceName: sources[0]?.name || '',
        sourceUrl: sources[0]?.url || '',
        volumePageOrHadith: '',
        originalExcerpt: '',
        reviewStatus: 'approved',
        needsManualVerification: false,
      },
    });
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingModal || !editingModal.catId) return;
    const { catId, question } = editingModal;
    if (!question.text?.trim() || !question.answer?.trim()) return;

    setSaving(true);
    try {
      const cleanOpts = (question.options || []).map((o) => o.trim()).filter(Boolean);
      const payload = {
        text: question.text.trim(),
        answer: question.answer.trim(),
        questionType: question.questionType || 'multiple_choice',
        difficulty: question.difficulty || 'medium',
        points: Number(question.points) || pointsByDifficulty(question.difficulty || 'medium'),
        options: cleanOpts.length > 0 ? cleanOpts : undefined,
        sourceName: question.sourceName?.trim() || 'المصادر الشيعية المعتمدة',
        source: question.sourceName?.trim() || 'المصادر الشيعية المعتمدة',
        sourceUrl: question.sourceUrl?.trim() || '',
        volumePageOrHadith: question.volumePageOrHadith?.trim() || '',
        originalExcerpt: question.originalExcerpt?.trim() || '',
        reviewStatus: question.reviewStatus || 'approved',
        needsManualVerification: Boolean(question.needsManualVerification),
        hint: question.hint?.trim() || undefined,
      };

      if (question.id) {
        await dataService.updateQuestion(catId, question.id, payload);
        await dataService.logActivity({
          action: 'تعديل سؤال في البنك',
          targetType: 'question',
          targetName: payload.text.slice(0, 50),
          actorEmail,
        });
      } else {
        await dataService.addQuestion(catId, payload as any);
        await dataService.logActivity({
          action: 'إضافة سؤال يدوي جديد',
          targetType: 'question',
          targetName: payload.text.slice(0, 50),
          actorEmail,
        });
      }
      setEditingModal(null);
      setFeedback('تم حفظ السؤال وتوثيقه بنجاح.');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoOptions = async () => {
    if (!editingModal?.question.text || !editingModal?.question.answer) return;
    setGeneratingOptions(true);
    try {
      const opts = await aiService.generateOptions(editingModal.question.text, editingModal.question.answer);
      setEditingModal({
        ...editingModal,
        question: { ...editingModal.question, options: opts },
      });
    } finally {
      setGeneratingOptions(false);
    }
  };

  const handleBulkImport = async () => {
    const targetCat = bulkCatId || categories[0]?.id;
    if (!targetCat || !bulkText.trim()) return;
    setBulkParsing(true);
    try {
      const parsed = await aiService.parseBulkQuestions({
        rawText: bulkText,
        sourceName: bulkSourceName || 'المصادر الشيعية المعتمدة',
      });
      for (const q of parsed) {
        await dataService.addQuestion(targetCat, {
          text: q.text,
          answer: q.answer,
          points: q.points || scoringSettings.mediumPoints,
          difficulty: q.difficulty || 'medium',
          questionType: q.questionType || 'multiple_choice',
          options: q.options || [],
          sourceName: q.sourceName || bulkSourceName || 'المصادر الشيعية المعتمدة',
          source: q.sourceName || bulkSourceName || 'المصادر الشيعية المعتمدة',
          volumePageOrHadith: q.volumePageOrHadith || '',
          reviewStatus: 'pending',
          needsManualVerification: true,
        });
      }
      await dataService.logActivity({
        action: 'استيراد دفعة أسئلة للمراجعة',
        targetType: 'question',
        targetName: `${parsed.length} سؤال`,
        actorEmail,
      });
      setBulkModalOpen(false);
      setBulkText('');
      setFeedback(`تم استيراد ${parsed.length} سؤال وإحالتها لقائمة المراجعة الإدارية.`);
    } catch (err: any) {
      setFeedback(err?.message || 'فشل تحليل النص المرفق.');
    } finally {
      setBulkParsing(false);
    }
  };

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">بنك الأسئلة العام</h2>
          <p className="text-xs text-slate-600 mt-0.5">استعراض وتعديل وتوثيق جميع الأسئلة عبر كافة الأقسام</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setBulkCatId(selectedCatId !== 'all' ? selectedCatId : categories[0]?.id || '');
              setBulkModalOpen(true);
            }}
            className="px-4 py-2.5 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-[#9B7729]" />
            <span>استيراد نص جماعي</span>
          </button>

          <button
            type="button"
            onClick={openNewQuestion}
            className="px-5 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-[#C9A24D]" />
            <span>إضافة سؤال جديد</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="surface-card rounded-2xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={selectedCatId}
          onChange={(e) => setSelectedCatId(e.target.value)}
          className="px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-[#0B192C]"
        >
          <option value="all">جميع الأقسام ({categories.length})</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.questions?.length || 0})
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-[#0B192C]"
        >
          <option value="all">كل الحالات</option>
          <option value="approved">معتمد وجاهز</option>
          <option value="pending">قيد المراجعة</option>
          <option value="rejected">مرفوض</option>
          <option value="archived">مؤرشف</option>
        </select>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="بحث في نص السؤال أو الإجابة أو المصدر..."
            className="w-full pr-9 pl-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold text-[#0B192C]"
          />
        </div>
      </div>

      {/* Questions List */}
      <div className="space-y-3">
        {flatQuestions.slice(0, 80).map(({ catId, catName, q }) => {
          const status = q.reviewStatus || 'approved';
          return (
            <div key={`${catId}-${q.id}`} className="surface-card rounded-2xl p-5 flex flex-col sm:flex-row justify-between gap-4">
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="text-[#9B7729]">{catName}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-[#0B192C]">{QUESTION_TYPE_LABELS[q.questionType || 'multiple_choice']}</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono text-slate-600">{q.points} نقطة</span>
                  <span className="text-slate-300">•</span>
                  <span
                    className={
                      status === 'approved'
                        ? 'text-emerald-700'
                        : status === 'pending'
                          ? 'text-amber-700'
                          : 'text-rose-700'
                    }
                  >
                    {status === 'approved' ? 'معتمد' : status === 'pending' ? 'بانتظار المراجعة' : status === 'rejected' ? 'مرفوض' : 'مؤرشف'}
                  </span>
                </div>

                <h4 className="font-bold text-sm text-[#0B192C]">{q.text}</h4>
                <p className="text-xs text-emerald-800 font-bold">الإجابة: {q.answer}</p>

                <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#9B7729]" />
                    <span>
                      {q.sourceName || q.source || 'بدون مصدر مسجل'}
                      {q.volumePageOrHadith ? ` (${q.volumePageOrHadith})` : ''}
                    </span>
                  </span>
                  {q.videoClips && q.videoClips.length > 0 && (
                    <span
                      className={`flex items-center gap-1 font-bold ${
                        areVideoClipsApproved(q.videoClips, q.clipApproved) ? 'text-[#0F766E]' : 'text-amber-700'
                      }`}
                    >
                      <Film className="w-3.5 h-3.5" />
                      <span>
                        {q.videoClips.length} مقطع ({formatTimeMMSS(q.videoClips[0].startTime)} - {formatTimeMMSS(q.videoClips[0].endTime)})
                        {areVideoClipsApproved(q.videoClips, q.clipApproved) ? ' • معتمد' : ' • بانتظار اعتماد المقطع'}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 shrink-0">
                {onOpenVideoStudio && (
                  <button
                    type="button"
                    onClick={() => onOpenVideoStudio(catId, q.id)}
                    className="px-3 py-1.5 rounded-lg bg-[#0B192C] hover:bg-[#13253E] text-[#D9B768] text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    <span>{q.videoClips?.length ? 'تحرير المشهد' : 'ربط فيديو'}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditingModal({ catId, question: q })}
                  className="px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-xs font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل</span>
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await dataService.deleteQuestion(catId, q.id);
                    await dataService.logActivity({
                      action: 'حذف سؤال',
                      targetType: 'question',
                      targetName: q.text.slice(0, 40),
                      actorEmail,
                    });
                  }}
                  className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  title="حذف السؤال"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}

        {flatQuestions.length === 0 && (
          <div className="surface-card rounded-2xl p-10 text-center text-slate-400 text-sm font-bold">
            لا توجد أسئلة مطابقة للتصفية الحالية.
          </div>
        )}
      </div>

      {/* Add/Edit Question Modal */}
      {editingModal && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm overflow-y-auto">
          <form
            onSubmit={handleSaveQuestion}
            className="w-full max-w-2xl bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden my-8"
          >
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between">
              <h3 className="font-display font-extrabold text-lg">
                {editingModal.question.id ? 'تعديل السؤال وتوثيق المصدر' : 'إضافة سؤال موثق جديد'}
              </h3>
              <button type="button" onClick={() => setEditingModal(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {!editingModal.question.id && (
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">القسم</label>
                  <select
                    value={editingModal.catId}
                    onChange={(e) => setEditingModal({ ...editingModal, catId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">نص السؤال</label>
                <textarea
                  rows={2}
                  required
                  value={editingModal.question.text || ''}
                  onChange={(e) =>
                    setEditingModal({
                      ...editingModal,
                      question: { ...editingModal.question, text: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">الإجابة الصحيحة</label>
                <input
                  type="text"
                  required
                  value={editingModal.question.answer || ''}
                  onChange={(e) =>
                    setEditingModal({
                      ...editingModal,
                      question: { ...editingModal.question, answer: e.target.value },
                    })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">نوع السؤال</label>
                  <select
                    value={editingModal.question.questionType || 'multiple_choice'}
                    onChange={(e) =>
                      setEditingModal({
                        ...editingModal,
                        question: { ...editingModal.question, questionType: e.target.value as QuestionType },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  >
                    {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((qt) => (
                      <option key={qt} value={qt}>
                        {QUESTION_TYPE_LABELS[qt]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">الصعوبة</label>
                  <select
                    value={editingModal.question.difficulty || 'medium'}
                    onChange={(e) => {
                      const d = e.target.value as QuestionDifficulty;
                      setEditingModal({
                        ...editingModal,
                        question: {
                          ...editingModal.question,
                          difficulty: d,
                          points: pointsByDifficulty(d),
                        },
                      });
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  >
                    {(Object.keys(DIFFICULTY_LABELS) as QuestionDifficulty[]).map((d) => (
                      <option key={d} value={d}>
                        {DIFFICULTY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">النقاط</label>
                  <input
                    type="number"
                    value={editingModal.question.points || 20}
                    onChange={(e) =>
                      setEditingModal({
                        ...editingModal,
                        question: { ...editingModal.question, points: Number(e.target.value) },
                      })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold font-mono"
                  />
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[#0B192C]">خيارات الاختيار المتعدد (اختياري)</label>
                  <button
                    type="button"
                    onClick={handleAutoOptions}
                    disabled={generatingOptions}
                    className="text-xs font-bold text-[#9B7729] flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    {generatingOptions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    <span>توليد خيارات منطقية</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={(editingModal.question.options || [])[idx] || ''}
                      onChange={(e) => {
                        const next = [...(editingModal.question.options || ['', '', '', ''])];
                        next[idx] = e.target.value;
                        setEditingModal({
                          ...editingModal,
                          question: { ...editingModal.question, options: next },
                        });
                      }}
                      placeholder={`خيار ${idx + 1}`}
                      className="px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
                    />
                  ))}
                </div>
              </div>

              {/* Shia Source Attribution */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-[#E6DFD1]">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">المصدر الشيعي المعتمد</label>
                  <input
                    type="text"
                    value={editingModal.question.sourceName || ''}
                    onChange={(e) =>
                      setEditingModal({
                        ...editingModal,
                        question: { ...editingModal.question, sourceName: e.target.value },
                      })
                    }
                    placeholder="مثال: بحار الأنوار / نهج البلاغة"
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">الجزء / الصفحة / رقم الحديث</label>
                  <input
                    type="text"
                    value={editingModal.question.volumePageOrHadith || ''}
                    onChange={(e) =>
                      setEditingModal({
                        ...editingModal,
                        question: { ...editingModal.question, volumePageOrHadith: e.target.value },
                      })
                    }
                    placeholder="مثال: ج16 ص42 أو الخطبة 193"
                    className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">النص المقتبس من المصدر</label>
                <textarea
                  rows={2}
                  value={editingModal.question.originalExcerpt || ''}
                  onChange={(e) =>
                    setEditingModal({
                      ...editingModal,
                      question: { ...editingModal.question, originalExcerpt: e.target.value },
                    })
                  }
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
                />
              </div>
            </div>

            <div className="p-5 bg-[#FAF7F2] border-t border-[#E6DFD1] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingModal(null)}
                className="px-4 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#0B192C] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>حفظ السؤال</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bulk Import Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden">
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between">
              <h3 className="font-display font-extrabold text-lg">استيراد أسئلة من نص موثق</h3>
              <button type="button" onClick={() => setBulkModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <select
                value={bulkCatId}
                onChange={(e) => setBulkCatId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              <input
                type="text"
                value={bulkSourceName}
                onChange={(e) => setBulkSourceName(e.target.value)}
                placeholder="اسم المصدر الشيعي الموثق لهذه الدفعة..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
              />

              <textarea
                rows={7}
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="الصق هنا نص الأسئلة والأجوبة لاستخراجها وتوجيهها لقائمة المراجعة..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  disabled={bulkParsing || !bulkText.trim()}
                  onClick={handleBulkImport}
                  className="px-5 py-2.5 rounded-xl bg-[#0B192C] text-white text-xs font-bold flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {bulkParsing && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>استخراج وإرسال للمراجعة</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
