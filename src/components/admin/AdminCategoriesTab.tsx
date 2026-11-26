import React, { useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  FolderPlus,
  Check,
  X,
  Power,
  Loader2,
  BookOpen,
} from 'lucide-react';
import { ApprovedSource, Category, QuestionDifficulty, QuestionType } from '../../types';
import { dataService, DBGroup } from '../../lib/dataService';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../../constants';
import { BrandIcon, BRAND_ICON_OPTIONS } from '../ui/BrandIcon';
import { BRAND_ASSETS, getCategoryFallbackImage } from '../../lib/assets';

interface AdminCategoriesTabProps {
  categories: Category[];
  groups: DBGroup[];
  sources: ApprovedSource[];
  actorEmail: string;
}

export const AdminCategoriesTab: React.FC<AdminCategoriesTabProps> = ({
  categories,
  groups,
  sources,
  actorEmail,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [editingCat, setEditingCat] = useState<Partial<Category> | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const openNewModal = () => {
    setEditingCat({
      name: '',
      group: groups[0]?.name || 'دينية',
      description: '',
      difficulty: 'medium',
      targetQuestionCount: 15,
      allowedQuestionTypes: ['multiple_choice', 'historical', 'islamic_figures'],
      linkedSourceIds: [],
      iconUrl: 'BookOpen',
      imageUrl: BRAND_ASSETS.categoryReligious,
      timerDuration: 60,
      isActive: true,
    });
  };

  const handleAddGroup = async () => {
    const clean = newGroupName.trim();
    if (!clean) return;
    await dataService.addGroup({ name: clean, order: groups.length });
    await dataService.logActivity({
      action: 'إضافة تصنيف رئيسي',
      targetType: 'category',
      targetName: clean,
      actorEmail,
    });
    setNewGroupName('');
  };

  const handleDeleteGroup = async (grp: DBGroup) => {
    await dataService.deleteGroup(grp.id);
    await dataService.logActivity({
      action: 'حذف تصنيف رئيسي',
      targetType: 'category',
      targetName: grp.name,
      actorEmail,
    });
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat || !editingCat.name?.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        name: editingCat.name.trim(),
        group: editingCat.group || 'دينية',
        description: editingCat.description || '',
        difficulty: editingCat.difficulty || 'medium',
        targetQuestionCount: Number(editingCat.targetQuestionCount) || 15,
        allowedQuestionTypes: editingCat.allowedQuestionTypes || ['multiple_choice'],
        linkedSourceIds: editingCat.linkedSourceIds || [],
        iconUrl: editingCat.iconUrl || 'BookOpen',
        imageUrl: editingCat.imageUrl || getCategoryFallbackImage(editingCat.group),
        timerDuration: Number(editingCat.timerDuration) || 60,
        isActive: editingCat.isActive !== false,
      };

      if (editingCat.id) {
        await dataService.updateCategory(editingCat.id, payload);
        await dataService.logActivity({
          action: 'تعديل قسم ثقافي',
          targetType: 'category',
          targetName: payload.name,
          actorEmail,
        });
        setMessage('تم تحديث القسم بنجاح.');
      } else {
        await dataService.addCategory(payload as any);
        await dataService.logActivity({
          action: 'إنشاء قسم ثقافي جديد',
          targetType: 'category',
          targetName: payload.name,
          actorEmail,
        });
        setMessage('تمت إضافة القسم بنجاح.');
      }
      setEditingCat(null);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cat: Category) => {
    const nextState = cat.isActive === false;
    await dataService.updateCategory(cat.id, { isActive: nextState });
    await dataService.logActivity({
      action: nextState ? 'تفعيل قسم ثقافي' : 'إيقاف قسم ثقافي مؤقتاً',
      targetType: 'category',
      targetName: cat.name,
      actorEmail,
    });
  };

  const handleDeleteCategory = async (cat: Category) => {
    await dataService.deleteCategory(cat.id);
    await dataService.logActivity({
      action: 'حذف قسم ثقافي',
      targetType: 'category',
      targetName: cat.name,
      actorEmail,
    });
  };

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">إدارة الأقسام والتصنيفات</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            تحديد اسم القسم، الوصف، الصعوبة، عدد الأسئلة المستهدف، والمصادر المعتمدة المرتبطة به
          </p>
        </div>

        <button
          type="button"
          onClick={openNewModal}
          className="px-5 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#C9A24D]" />
          <span>إضافة قسم جديد</span>
        </button>
      </div>

      {message && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
          {message}
        </div>
      )}

      {/* Groups Bar */}
      <div className="surface-card rounded-2xl p-5 space-y-3">
        <h3 className="font-display font-bold text-sm text-[#0B192C] flex items-center gap-2">
          <FolderPlus className="w-4 h-4 text-[#9B7729]" />
          <span>المجموعات / التصنيفات الرئيسية</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          {groups.map((grp) => (
            <span
              key={grp.id}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-[#0B192C]"
            >
              <span>{grp.name}</span>
              <button
                type="button"
                onClick={() => handleDeleteGroup(grp)}
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
                title="حذف المجموعة"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 max-w-md">
          <input
            type="text"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="اسم مجموعة جديدة (مثال: الفقه والعقائد)"
            className="flex-1 px-3.5 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold focus:outline-none focus:border-[#C9A24D]"
          />
          <button
            type="button"
            onClick={handleAddGroup}
            className="px-4 py-2 bg-[#0B192C] text-white rounded-xl text-xs font-bold cursor-pointer"
          >
            إضافة
          </button>
        </div>
      </div>

      {/* Categories Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const approvedCount = (cat.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length;
          const totalCount = (cat.questions || []).length;
          const active = cat.isActive !== false;
          const linkedNames = sources
            .filter((s) => (cat.linkedSourceIds || []).includes(s.id) || s.linkedCategoryIds?.includes(cat.id))
            .map((s) => s.name);

          return (
            <div
              key={cat.id}
              className={`surface-card rounded-2xl p-5 flex flex-col justify-between space-y-4 ${
                !active ? 'opacity-65' : ''
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-10 h-10 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center shrink-0">
                      <BrandIcon name={cat.iconUrl} className="w-5 h-5" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-base text-[#0B192C] truncate">{cat.name}</h4>
                      <span className="text-[11px] font-semibold text-[#9B7729]">
                        {cat.group || 'عام'} • {DIFFICULTY_LABELS[cat.difficulty || 'medium']}
                      </span>
                    </div>
                  </div>
                  <span className={`text-[11px] font-bold ${active ? 'text-emerald-700' : 'text-slate-400'}`}>
                    {active ? 'نشط' : 'موقوف'}
                  </span>
                </div>

                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                  {cat.description || 'لا يوجد وصف مسجل لهذا القسم.'}
                </p>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-bold">
                  <div className="p-2 rounded-lg bg-[#FAF7F2] border border-[#E6DFD1] text-[#0B192C] tabular-nums">
                    المعتمد: {approvedCount} / {cat.targetQuestionCount || 15}
                  </div>
                  <div className="p-2 rounded-lg bg-[#FAF7F2] border border-[#E6DFD1] text-slate-600 tabular-nums">
                    الإجمالي: {totalCount} سؤال
                  </div>
                </div>

                {linkedNames.length > 0 && (
                  <div className="text-[11px] text-slate-500 flex items-start gap-1.5">
                    <BookOpen className="w-3.5 h-3.5 text-[#9B7729] shrink-0 mt-0.5" />
                    <span className="line-clamp-1">المصادر: {linkedNames.join('، ')}</span>
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#E6DFD1] flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setEditingCat(cat)}
                    className="px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-xs font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>تعديل</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleActive(cat)}
                    className="px-3 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-xs font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                    title={active ? 'إيقاف مؤقت' : 'تفعيل'}
                  >
                    <Power className="w-3.5 h-3.5 text-[#9B7729]" />
                    <span>{active ? 'إيقاف' : 'تفعيل'}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteCategory(cat)}
                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                  title="حذف القسم"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Category Edit / Add Modal */}
      {editingCat && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm overflow-y-auto">
          <form
            onSubmit={handleSaveCategory}
            className="w-full max-w-2xl bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden my-8"
          >
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between">
              <h3 className="font-display font-extrabold text-lg">
                {editingCat.id ? 'تعديل القسم الثقافي' : 'إضافة قسم ثقافي جديد'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">اسم القسم</label>
                  <input
                    type="text"
                    required
                    value={editingCat.name || ''}
                    onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">التصنيف / المجموعة</label>
                  <select
                    value={editingCat.group || 'دينية'}
                    onChange={(e) => setEditingCat({ ...editingCat, group: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  >
                    {groups.map((g) => (
                      <option key={g.id} value={g.name}>
                        {g.name}
                      </option>
                    ))}
                    {!groups.some((g) => g.name === editingCat.group) && (
                      <option value={editingCat.group || 'دينية'}>{editingCat.group || 'دينية'}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">وصف القسم</label>
                <textarea
                  rows={2}
                  value={editingCat.description || ''}
                  onChange={(e) => setEditingCat({ ...editingCat, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">مستوى الصعوبة الافتراضي</label>
                  <select
                    value={editingCat.difficulty || 'medium'}
                    onChange={(e) =>
                      setEditingCat({ ...editingCat, difficulty: e.target.value as QuestionDifficulty })
                    }
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
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">العدد المستهدف للأسئلة</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={editingCat.targetQuestionCount || 15}
                    onChange={(e) =>
                      setEditingCat({ ...editingCat, targetQuestionCount: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">مؤقت القسم (ثانية)</label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={editingCat.timerDuration || 60}
                    onChange={(e) => setEditingCat({ ...editingCat, timerDuration: Number(e.target.value) })}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">أيقونة القسم</label>
                <div className="flex flex-wrap gap-2">
                  {BRAND_ICON_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setEditingCat({ ...editingCat, iconUrl: opt.value })}
                      className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                        editingCat.iconUrl === opt.value
                          ? 'bg-[#0B192C] text-white border-[#C9A24D]'
                          : 'bg-[#FAF7F2] text-[#0B192C] border-[#E6DFD1]'
                      }`}
                    >
                      <BrandIcon name={opt.value} className="w-4 h-4" />
                      <span>{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1.5">أنواع الأسئلة المسموحة</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((qt) => {
                    const selected = (editingCat.allowedQuestionTypes || []).includes(qt);
                    return (
                      <button
                        key={qt}
                        type="button"
                        onClick={() => {
                          const cur = editingCat.allowedQuestionTypes || [];
                          setEditingCat({
                            ...editingCat,
                            allowedQuestionTypes: selected ? cur.filter((x) => x !== qt) : [...cur, qt],
                          });
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold cursor-pointer ${
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

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1.5">المصادر الشيعية المعتمدة المرتبطة</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                  {sources.map((src) => {
                    const picked = (editingCat.linkedSourceIds || []).includes(src.id);
                    return (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => {
                          const cur = editingCat.linkedSourceIds || [];
                          setEditingCat({
                            ...editingCat,
                            linkedSourceIds: picked ? cur.filter((x) => x !== src.id) : [...cur, src.id],
                          });
                        }}
                        className={`p-2.5 rounded-xl border text-right text-xs font-bold flex items-center justify-between cursor-pointer ${
                          picked
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-900'
                            : 'bg-[#FAF7F2] border-[#E6DFD1] text-slate-700'
                        }`}
                      >
                        <span className="truncate">{src.name}</span>
                        {picked && <Check className="w-4 h-4 text-emerald-700 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-5 bg-[#FAF7F2] border-t border-[#E6DFD1] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingCat(null)}
                className="px-4 py-2.5 rounded-xl border border-[#E6DFD1] bg-white text-xs font-bold text-slate-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-[#0B192C] text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>حفظ القسم</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
