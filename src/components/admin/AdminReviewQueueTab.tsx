import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  XCircle,
  Archive,
  Edit3,
  AlertTriangle,
  BookOpen,
  ExternalLink,
  RefreshCcw,
  Loader2,
  Check,
  X,
  Film,
} from 'lucide-react';
import { Category, Question, ReviewStatus } from '../../types';
import { dataService } from '../../lib/dataService';
import { aiService } from '../../services/aiService';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../../constants';
import { areVideoClipsApproved, formatTimeMMSS } from '../../services/videoService';

interface AdminReviewQueueTabProps {
  categories: Category[];
  actorEmail: string;
  onOpenVideoStudio?: (catId: string, questionId: string) => void;
}

export const AdminReviewQueueTab: React.FC<AdminReviewQueueTabProps> = ({
  categories,
  actorEmail,
  onOpenVideoStudio,
}) => {
  const [filterMode, setFilterMode] = useState<'pending' | 'manual' | 'rejected' | 'archived'>('pending');
  const [editingItem, setEditingItem] = useState<{ catId: string; q: Question } | null>(null);
  const [rephrasingId, setRephrasingId] = useState<string | null>(null);

  const items = useMemo(() => {
    const out: { catId: string; catName: string; q: Question }[] = [];
    categories.forEach((c) => {
      (c.questions || []).forEach((q) => {
        const status: ReviewStatus = q.reviewStatus || 'approved';
        if (filterMode === 'pending' && status === 'pending') out.push({ catId: c.id, catName: c.name, q });
        else if (filterMode === 'manual' && q.needsManualVerification && status !== 'rejected')
          out.push({ catId: c.id, catName: c.name, q });
        else if (filterMode === 'rejected' && status === 'rejected') out.push({ catId: c.id, catName: c.name, q });
        else if (filterMode === 'archived' && status === 'archived') out.push({ catId: c.id, catName: c.name, q });
      });
    });
    return out;
  }, [categories, filterMode]);

  const counts = useMemo(() => {
    let pending = 0;
    let manual = 0;
    let rejected = 0;
    let archived = 0;
    categories.forEach((c) => {
      (c.questions || []).forEach((q) => {
        const status: ReviewStatus = q.reviewStatus || 'approved';
        if (status === 'pending') pending++;
        if (q.needsManualVerification && status !== 'rejected') manual++;
        if (status === 'rejected') rejected++;
        if (status === 'archived') archived++;
      });
    });
    return { pending, manual, rejected, archived };
  }, [categories]);

  const [clipWarning, setClipWarning] = useState<string | null>(null);

  const handleSetStatus = async (catId: string, q: Question, nextStatus: ReviewStatus) => {
    const hasVideo = Boolean(q.videoUrl || (q.videoClips && q.videoClips.length > 0));
    if (nextStatus === 'approved' && hasVideo && !areVideoClipsApproved(q.videoClips, q.clipApproved)) {
      setClipWarning('لا يمكن اعتماد سؤال مرتبط بفيديو قبل مراجعة واعتماد المقطع المقتطع في استوديو الفيديو.');
      return;
    }
    setClipWarning(null);
    await dataService.updateQuestion(catId, q.id, {
      reviewStatus: nextStatus,
      needsManualVerification: nextStatus === 'approved' ? false : q.needsManualVerification,
      reviewedBy: actorEmail,
      reviewedAt: new Date().toISOString(),
    });
    await dataService.logActivity({
      action:
        nextStatus === 'approved'
          ? 'اعتماد سؤال للمسابقة'
          : nextStatus === 'rejected'
            ? 'رفض سؤال في المراجعة'
            : 'أرشفة سؤال',
      targetType: 'question',
      targetName: q.text.slice(0, 50),
      actorEmail,
    });
  };

  const handleRephrase = async (catId: string, q: Question) => {
    setRephrasingId(q.id);
    try {
      const nextText = await aiService.rephraseText(q.text, 'question');
      if (nextText && nextText !== q.text) {
        await dataService.updateQuestion(catId, q.id, { text: nextText });
      }
    } finally {
      setRephrasingId(null);
    }
  };

  return (
    <div className="space-y-6 text-right">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">مراجعة واعتماد الأسئلة</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          لا يظهر أي سؤال في شاشات التنافس المباشر قبل اعتماده رسمياً من صاحب الصلاحية أو المشرف المفوض
        </p>
      </div>

      {clipWarning && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>{clipWarning}</span>
          </span>
          <button type="button" onClick={() => setClipWarning(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'pending', label: `بانتظار الاعتماد (${counts.pending})` },
          { id: 'manual', label: `تحتاج تحقق يدوي (${counts.manual})` },
          { id: 'rejected', label: `المرفوضة (${counts.rejected})` },
          { id: 'archived', label: `المؤرشفة (${counts.archived})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterMode(tab.id as any)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold cursor-pointer ${
              filterMode === tab.id
                ? 'bg-[#0B192C] text-[#D9B768]'
                : 'bg-white border border-[#E6DFD1] text-[#0B192C] hover:bg-[#FAF7F2]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="surface-card rounded-2xl p-12 text-center text-slate-400">
          <CheckCircle2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="font-bold text-sm">لا توجد أسئلة ضمن هذه القائمة حالياً.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map(({ catId, catName, q }) => (
            <div key={`${catId}-${q.id}`} className="surface-card rounded-2xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold">
                  <span className="text-[#9B7729]">{catName}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-[#0B192C]">{QUESTION_TYPE_LABELS[q.questionType || 'multiple_choice']}</span>
                  <span className="text-slate-300">•</span>
                  <span className="text-slate-600">{DIFFICULTY_LABELS[q.difficulty || 'medium']}</span>
                </div>

                {q.needsManualVerification && (
                  <span className="text-xs font-bold text-amber-700 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    {q.verificationNote || 'تنبيه: يرجى التحقق من النص والمصدر يدوياً'}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-base text-[#0B192C]">{q.text}</h4>
                <p className="text-sm font-bold text-emerald-800">الإجابة: {q.answer}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 font-bold text-[#0B192C]">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4 text-[#9B7729]" />
                    <span>
                      المصدر: {q.sourceName || q.source || 'غير محدد'}
                      {q.volumePageOrHadith ? ` — (${q.volumePageOrHadith})` : ''}
                    </span>
                  </span>
                  {q.sourceUrl && q.sourceUrl.startsWith('http') && (
                    <a
                      href={q.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#0F766E] hover:underline flex items-center gap-1"
                    >
                      <span>فتح المرجع</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {q.originalExcerpt && <p className="text-slate-600">النص المقتبس: «{q.originalExcerpt}»</p>}
                {q.videoClips && q.videoClips.length > 0 && (
                  <div className="pt-1.5 border-t border-[#E6DFD1] flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-bold text-[#0B192C]">
                      <Film className="w-3.5 h-3.5 text-[#9B7729]" />
                      <span>
                        مقطع الفيديو: {formatTimeMMSS(q.videoClips[0].startTime)} - {formatTimeMMSS(q.videoClips[0].endTime)} ({q.videoClips[0].duration}ث)
                      </span>
                      <span className={areVideoClipsApproved(q.videoClips, q.clipApproved) ? 'text-[#0F766E]' : 'text-amber-700'}>
                        • {areVideoClipsApproved(q.videoClips, q.clipApproved) ? 'المقطع معتمد' : 'يتطلب اعتماد المقطع'}
                      </span>
                    </span>
                    {onOpenVideoStudio && (
                      <button
                        type="button"
                        onClick={() => onOpenVideoStudio(catId, q.id)}
                        className="px-2.5 py-1 rounded-lg bg-[#0B192C] text-[#D9B768] font-bold cursor-pointer"
                      >
                        مراجعة في استوديو الفيديو
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E6DFD1]">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetStatus(catId, q, 'approved')}
                    className="px-4 py-2 bg-[#0F766E] hover:bg-[#0D5F59] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>اعتماد للنشر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatus(catId, q, 'rejected')}
                    className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>رفض</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatus(catId, q, 'archived')}
                    className="px-4 py-2 bg-[#FAF7F2] hover:bg-[#F3EFE6] text-slate-700 border border-[#E6DFD1] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Archive className="w-3.5 h-3.5" />
                    <span>أرشفة</span>
                  </button>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleRephrase(catId, q)}
                    disabled={rephrasingId === q.id}
                    className="px-3.5 py-2 bg-white border border-[#E6DFD1] hover:bg-[#FAF7F2] text-[#0B192C] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    {rephrasingId === q.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5 text-[#9B7729]" />}
                    <span>إعادة صياغة</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingItem({ catId, q })}
                    className="px-3.5 py-2 bg-white border border-[#E6DFD1] hover:bg-[#FAF7F2] text-[#0B192C] text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Inline Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden">
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between">
              <h3 className="font-display font-bold text-base">تعديل وتدقيق السؤال</h3>
              <button type="button" onClick={() => setEditingItem(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <label className="text-xs font-bold text-[#0B192C] block">نص السؤال</label>
              <textarea
                rows={3}
                value={editingItem.q.text}
                onChange={(e) => setEditingItem({ ...editingItem, q: { ...editingItem.q, text: e.target.value } })}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
              />
              <label className="text-xs font-bold text-[#0B192C] block">الإجابة</label>
              <input
                type="text"
                value={editingItem.q.answer}
                onChange={(e) => setEditingItem({ ...editingItem, q: { ...editingItem.q, answer: e.target.value } })}
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
              />
              <label className="text-xs font-bold text-[#0B192C] block">المرجع / الجزء والصفحة</label>
              <input
                type="text"
                value={editingItem.q.volumePageOrHadith || ''}
                onChange={(e) =>
                  setEditingItem({
                    ...editingItem,
                    q: { ...editingItem.q, volumePageOrHadith: e.target.value },
                  })
                }
                className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
              />
              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl border border-[#E6DFD1] text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await dataService.updateQuestion(editingItem.catId, editingItem.q.id, {
                      text: editingItem.q.text,
                      answer: editingItem.q.answer,
                      volumePageOrHadith: editingItem.q.volumePageOrHadith,
                    });
                    setEditingItem(null);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
                >
                  حفظ التعديل
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
