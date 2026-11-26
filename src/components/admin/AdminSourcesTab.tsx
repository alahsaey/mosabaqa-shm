import React, { useState } from 'react';
import {
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCcw,
  ExternalLink,
  X,
  Loader2,
  Power,
} from 'lucide-react';
import { ApprovedSource, ApprovedSourceType, Category } from '../../types';
import { dataService } from '../../lib/dataService';
import { aiService } from '../../services/aiService';

const SOURCE_TYPES: ApprovedSourceType[] = [
  'كتاب',
  'موسوعة شيعية',
  'مرجع فقهي',
  'موقع إلكتروني',
  'بحث علمي',
  'محاضرة موثقة',
];

interface AdminSourcesTabProps {
  sources: ApprovedSource[];
  categories: Category[];
  actorEmail: string;
}

export const AdminSourcesTab: React.FC<AdminSourcesTabProps> = ({ sources, categories, actorEmail }) => {
  const [editing, setEditing] = useState<Partial<ApprovedSource> | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const openNew = () => {
    setEditing({
      name: '',
      sourceType: 'كتاب',
      author: '',
      publisher: '',
      url: 'https://',
      classification: '',
      linkedCategoryIds: [],
      isApproved: true,
      verifiedExcerpt: '',
      notes: '',
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editing.name?.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: editing.name.trim(),
        sourceType: editing.sourceType || 'كتاب',
        author: editing.author?.trim() || '',
        publisher: editing.publisher?.trim() || '',
        url: editing.url?.trim() || '',
        classification: editing.classification?.trim() || '',
        linkedCategoryIds: editing.linkedCategoryIds || [],
        isApproved: editing.isApproved !== false,
        verifiedExcerpt: editing.verifiedExcerpt?.trim() || '',
        notes: editing.notes?.trim() || '',
      };

      if (editing.id) {
        await dataService.updateSource(editing.id, payload);
        await dataService.logActivity({
          action: 'تحديث مصدر شيعي معتمد',
          targetType: 'source',
          targetName: payload.name,
          actorEmail,
        });
      } else {
        await dataService.addSource(payload);
        await dataService.logActivity({
          action: 'إضافة مصدر شيعي للقائمة البيضاء',
          targetType: 'source',
          targetName: payload.name,
          actorEmail,
        });
      }
      setEditing(null);
      setNotice('تم حفظ بيانات المصدر في القائمة البيضاء المعتمدة.');
    } finally {
      setSaving(false);
    }
  };

  const handleCheckUrl = async (src: ApprovedSource) => {
    if (!src.url || !src.url.startsWith('http')) {
      setNotice('هذا المصدر لا يملك رابط URL قابلاً للفحص. يمكنك إدخال نص المرجع المقتبس يدوياً.');
      return;
    }
    setCheckingId(src.id);
    setNotice(null);
    try {
      const res = await aiService.verifySourceContent(src.url);
      await dataService.updateSource(src.id, {
        lastCheckOk: res.ok,
        lastCheckMessage: res.message,
        lastCheckedAt: new Date().toISOString(),
        verifiedExcerpt:
          res.ok && res.extractedText && (!src.verifiedExcerpt || src.verifiedExcerpt.length < 100)
            ? res.extractedText.slice(0, 6000)
            : src.verifiedExcerpt,
      });
      setNotice(`نتيجة فحص «${src.name}»: ${res.message}`);
    } finally {
      setCheckingId(null);
    }
  };

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">إدارة المصادر الشيعية المعتمدة (Whitelist)</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            قائمة المصادر الموثوقة التي يُلزم محرك الذكاء الاصطناعي بالاستناد إليها حصرياً دون سواها
          </p>
        </div>

        <button
          type="button"
          onClick={openNew}
          className="px-5 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C9A24D]" />
          <span>إضافة مصدر معتمد</span>
        </button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-[#F7F1DF] border border-[#C9A24D] text-[#0B192C] text-xs font-bold flex items-center justify-between">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sources.map((src) => (
          <div
            key={src.id}
            className={`surface-card rounded-2xl p-5 flex flex-col justify-between space-y-4 ${
              !src.isApproved ? 'opacity-65' : ''
            }`}
          >
            <div className="space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-display font-bold text-base text-[#0B192C] truncate">{src.name}</h4>
                    <p className="text-[11px] font-bold text-[#9B7729]">
                      {src.sourceType} • {src.author || 'غير محدد'}
                    </p>
                  </div>
                </div>

                <span
                  className={`inline-flex items-center gap-1 text-xs font-bold ${
                    src.isApproved ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {src.isApproved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                  {src.isApproved ? 'معتمد' : 'معطل'}
                </span>
              </div>

              {src.classification && (
                <p className="text-xs text-slate-600">التصنيف العلمي: {src.classification}</p>
              )}

              {src.url && src.url.startsWith('http') && (
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-[#0F766E] hover:underline inline-flex items-center gap-1 dir-ltr"
                >
                  <span>{src.url}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}

              <div className="p-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-[11px] text-slate-600">
                {src.verifiedExcerpt && src.verifiedExcerpt.length > 20
                  ? `نص مرجعي محفوظ (${src.verifiedExcerpt.length} حرف) • جاهز للاستخراج المباشر.`
                  : src.lastCheckMessage || 'لم يتم حفظ مقتبس نصي بعد — اضغط «فحص قراءة الرابط» أو أضف مقتطفاً من الكتاب.'}
              </div>
            </div>

            <div className="pt-3 border-t border-[#E6DFD1] flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleCheckUrl(src)}
                  disabled={checkingId === src.id}
                  className="px-3 py-1.5 rounded-lg bg-[#0B192C] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  {checkingId === src.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCcw className="w-3.5 h-3.5 text-[#C9A24D]" />}
                  <span>فحص قراءة الرابط</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(src)}
                  className="px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-xs font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>تعديل / مقتطف</span>
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => dataService.updateSource(src.id, { isApproved: !src.isApproved })}
                  className="p-1.5 rounded-lg hover:bg-[#FAF7F2] text-[#9B7729] cursor-pointer"
                  title={src.isApproved ? 'تعطيل الاعتماد' : 'تفعيل الاعتماد'}
                >
                  <Power className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await dataService.deleteSource(src.id);
                    await dataService.logActivity({
                      action: 'حذف مصدر من القائمة البيضاء',
                      targetType: 'source',
                      targetName: src.name,
                      actorEmail,
                    });
                  }}
                  className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600 cursor-pointer"
                  title="حذف المصدر"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Source Modal */}
      {editing && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm overflow-y-auto">
          <form
            onSubmit={handleSave}
            className="w-full max-w-2xl bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden my-8"
          >
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between">
              <h3 className="font-display font-extrabold text-lg">
                {editing.id ? 'تعديل المصدر المعتمد' : 'إضافة مصدر شيعي موثوق'}
              </h3>
              <button type="button" onClick={() => setEditing(null)} className="cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">اسم المصدر / الكتاب</label>
                  <input
                    type="text"
                    required
                    value={editing.name || ''}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">نوع المصدر</label>
                  <select
                    value={editing.sourceType || 'كتاب'}
                    onChange={(e) => setEditing({ ...editing, sourceType: e.target.value as ApprovedSourceType })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  >
                    {SOURCE_TYPES.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">المؤلف / المرجع</label>
                  <input
                    type="text"
                    value={editing.author || ''}
                    onChange={(e) => setEditing({ ...editing, author: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">الجهة الناشرة</label>
                  <input
                    type="text"
                    value={editing.publisher || ''}
                    onChange={(e) => setEditing({ ...editing, publisher: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">الرابط الإلكتروني (اختياري للكتب)</label>
                  <input
                    type="text"
                    value={editing.url || ''}
                    onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-mono dir-ltr"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">التصنيف العلمي</label>
                  <input
                    type="text"
                    value={editing.classification || ''}
                    onChange={(e) => setEditing({ ...editing, classification: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">
                  النص المقتبس الموثق (يستخدمه الذكاء الاصطناعي مباشرة في التوليد دون تخمين)
                </label>
                <textarea
                  rows={5}
                  value={editing.verifiedExcerpt || ''}
                  onChange={(e) => setEditing({ ...editing, verifiedExcerpt: e.target.value })}
                  placeholder="الصق هنا فصولاً أو أحاديث أو نصوصاً معتمدة من الكتاب أو المرجع ليولد المحرك أسئلته منها حرفياً..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs leading-relaxed"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">الأقسام المرتبطة</label>
                <div className="flex flex-wrap gap-1.5">
                  {categories.map((c) => {
                    const checked = (editing.linkedCategoryIds || []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          const cur = editing.linkedCategoryIds || [];
                          setEditing({
                            ...editing,
                            linkedCategoryIds: checked ? cur.filter((x) => x !== c.id) : [...cur, c.id],
                          });
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold cursor-pointer ${
                          checked
                            ? 'bg-[#0B192C] text-[#D9B768] border-[#C9A24D]'
                            : 'bg-[#FAF7F2] text-slate-600 border-[#E6DFD1]'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-5 bg-[#FAF7F2] border-t border-[#E6DFD1] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
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
                <span>حفظ المصدر</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
