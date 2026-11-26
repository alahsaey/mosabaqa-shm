import React, { useRef, useState } from 'react';
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
  Sparkles,
  Link2,
  Upload,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  RotateCcw,
} from 'lucide-react';
import { ApprovedSource, Category, QuestionDifficulty, QuestionType } from '../../types';
import { dataService, DBGroup } from '../../lib/dataService';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../../constants';
import { BrandIcon, BRAND_ICON_OPTIONS } from '../ui/BrandIcon';
import {
  getBespokeCategoryImage,
  isLegacyDefaultCategoryImage,
  resolveCategoryImage,
} from '../../lib/assets';
import {
  generateAICategoryImage,
  processCategoryImageUpload,
  validateExternalImageUrl,
} from '../../services/categoryImageService';

type ImageModeTab = 'ai' | 'url' | 'upload';

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
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Per-card quick AI image refresh state
  const [refreshingCardId, setRefreshingCardId] = useState<string | null>(null);

  // Modal Image Studio state
  const [imageTab, setImageTab] = useState<ImageModeTab>('ai');
  const [customImageSet, setCustomImageSet] = useState(false);
  const [autoGenerateOnCreate, setAutoGenerateOnCreate] = useState(true);
  const [directUrlInput, setDirectUrlInput] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [imageBusyLabel, setImageBusyLabel] = useState('');
  const [imageError, setImageError] = useState<string | null>(null);
  const [imageNotice, setImageNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const resetModalImageState = (cat: Partial<Category> | null, isNew: boolean) => {
    setImageError(null);
    setImageNotice(null);
    setImageBusy(false);
    setImageBusyLabel('');
    setAutoGenerateOnCreate(isNew);

    const existingUrl = (cat?.imageUrl || '').trim();
    const hasCustom = Boolean(existingUrl && !isLegacyDefaultCategoryImage(existingUrl));
    setCustomImageSet(hasCustom);

    if (existingUrl.startsWith('data:image/')) {
      setImageTab('upload');
      setDirectUrlInput('');
    } else if (/^https?:\/\//i.test(existingUrl) && !existingUrl.includes('pollinations.ai')) {
      setImageTab('url');
      setDirectUrlInput(existingUrl);
    } else {
      setImageTab('ai');
      setDirectUrlInput('');
    }
  };

  const openNewModal = () => {
    const draft: Partial<Category> = {
      name: '',
      group: groups[0]?.name || 'دينية',
      description: '',
      difficulty: 'medium',
      targetQuestionCount: 15,
      allowedQuestionTypes: ['multiple_choice', 'historical', 'islamic_figures'],
      linkedSourceIds: [],
      iconUrl: 'BookOpen',
      imageUrl: '',
      timerDuration: 60,
      isActive: true,
    };
    setEditingCat(draft);
    resetModalImageState(draft, true);
  };

  const openEditModal = (cat: Category) => {
    const resolved = resolveCategoryImage(cat);
    const draft: Partial<Category> = { ...cat, imageUrl: resolved };
    setEditingCat(draft);
    resetModalImageState(cat, false);
  };

  const closeModal = () => {
    if (saving || imageBusy) return;
    setEditingCat(null);
    setImageError(null);
    setImageNotice(null);
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

  // Quick "تحديث الصورة ✨" button directly on a category card
  const handleQuickRefreshCardImage = async (cat: Category) => {
    if (refreshingCardId) return;
    setRefreshingCardId(cat.id);
    setMessage(null);
    setErrorBanner(null);

    try {
      const result = await generateAICategoryImage({
        name: cat.name,
        description: cat.description,
        group: cat.group,
      });

      await dataService.updateCategory(cat.id, { imageUrl: result.imageUrl });
      await dataService.logActivity({
        action: 'تحديث صورة قسم بالذكاء الاصطناعي',
        targetType: 'category',
        targetName: cat.name,
        actorEmail,
      });
      setMessage(`تم توليد وتحديث غلاف قسم «${cat.name}» بنجاح.`);
    } catch (err: any) {
      setErrorBanner(err?.message || `تعذر توليد صورة جديدة لقسم «${cat.name}». يرجى المحاولة مجدداً.`);
    } finally {
      setRefreshingCardId(null);
    }
  };

  // Modal: Generate AI image
  const handleGenerateModalAIImage = async () => {
    if (!editingCat) return;
    const catName = (editingCat.name || '').trim();
    if (!catName) {
      setImageError('يرجى إدخال اسم القسم أولاً حتى يتم توليد صورة متوافقة مع موضوعه.');
      return;
    }

    setImageError(null);
    setImageNotice(null);
    setImageBusy(true);
    setImageBusyLabel('جاري التوليد بالذكاء الاصطناعي...');
    try {
      const result = await generateAICategoryImage({
        name: catName,
        description: editingCat.description || '',
        group: editingCat.group || '',
      });
      setEditingCat((prev) => (prev ? { ...prev, imageUrl: result.imageUrl } : prev));
      setCustomImageSet(true);
      setImageNotice('تم توليد صورة فنية تراثية متوافقة مع القسم بنجاح.');
    } catch (err: any) {
      setImageError(err?.message || 'تعذر توليد الصورة حالياً. يمكنك إعادة المحاولة أو رفع صورة من الجهاز.');
    } finally {
      setImageBusy(false);
      setImageBusyLabel('');
    }
  };

  // Modal: Apply Direct External URL
  const handleApplyDirectUrl = async () => {
    if (!editingCat) return;
    setImageError(null);
    setImageNotice(null);
    setImageBusy(true);
    setImageBusyLabel('جاري التحقق من رابط الصورة ومعاينتها...');
    try {
      const validatedUrl = await validateExternalImageUrl(directUrlInput);
      setEditingCat((prev) => (prev ? { ...prev, imageUrl: validatedUrl } : prev));
      setCustomImageSet(true);
      setImageNotice('تم التحقق من الرابط وتطبيق الصورة بنجاح.');
    } catch (err: any) {
      setImageError(err?.message || 'الرابط غير صالح أو لا يشير إلى صورة قابلة للعرض.');
    } finally {
      setImageBusy(false);
      setImageBusyLabel('');
    }
  };

  // Modal: Upload Local File (Canvas-resized JPEG Data URL)
  const handleLocalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editingCat) return;

    setImageError(null);
    setImageNotice(null);
    setImageBusy(true);
    setImageBusyLabel('جاري معالجة وضغط الصورة المرفوعة...');
    try {
      const { dataUrl, sizeKb } = await processCategoryImageUpload(file);
      setEditingCat((prev) => (prev ? { ...prev, imageUrl: dataUrl } : prev));
      setCustomImageSet(true);
      setImageNotice(`تم رفع الصورة ومعالجتها بنجاح (الحجم المحسّن: ${sizeKb} كيلوبايت).`);
    } catch (err: any) {
      setImageError(err?.message || 'تعذر قراءة ملف الصورة.');
    } finally {
      setImageBusy(false);
      setImageBusyLabel('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRestoreBespokeDefault = () => {
    if (!editingCat) return;
    const bespoke = getBespokeCategoryImage(editingCat);
    setEditingCat({ ...editingCat, imageUrl: bespoke });
    setCustomImageSet(true);
    setDirectUrlInput('');
    setImageError(null);
    setImageNotice('تمت استعادة الغلاف التراثي الافتراضي المناسب لهذا القسم.');
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCat || !editingCat.name?.trim()) return;
    setSaving(true);
    setMessage(null);
    setErrorBanner(null);
    setImageError(null);

    try {
      const cleanName = editingCat.name.trim();
      let finalImageUrl = (editingCat.imageUrl || '').trim();

      // Auto-generate matching AI image when creating a new category with no custom cover chosen
      if (!editingCat.id && !customImageSet && autoGenerateOnCreate) {
        setImageBusy(true);
        setImageBusyLabel('جاري توليد غلاف تلقائي متوافق للقسم الجديد...');
        try {
          const generated = await generateAICategoryImage({
            name: cleanName,
            description: editingCat.description || '',
            group: editingCat.group || 'دينية',
          });
          finalImageUrl = generated.imageUrl;
        } catch {
          // Graceful fallback to bespoke artwork matching the category's topic
          finalImageUrl = getBespokeCategoryImage({
            name: cleanName,
            description: editingCat.description,
            group: editingCat.group,
          });
        } finally {
          setImageBusy(false);
          setImageBusyLabel('');
        }
      }

      if (!finalImageUrl || isLegacyDefaultCategoryImage(finalImageUrl)) {
        finalImageUrl = getBespokeCategoryImage({
          id: editingCat.id,
          name: cleanName,
          description: editingCat.description,
          group: editingCat.group,
        });
      }

      const payload = {
        name: cleanName,
        group: editingCat.group || 'دينية',
        description: editingCat.description || '',
        difficulty: editingCat.difficulty || 'medium',
        targetQuestionCount: Number(editingCat.targetQuestionCount) || 15,
        allowedQuestionTypes: editingCat.allowedQuestionTypes || ['multiple_choice'],
        linkedSourceIds: editingCat.linkedSourceIds || [],
        iconUrl: editingCat.iconUrl || 'BookOpen',
        imageUrl: finalImageUrl,
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
        setMessage('تم تحديث القسم وصورته بنجاح.');
      } else {
        await dataService.addCategory(payload as any);
        await dataService.logActivity({
          action: 'إنشاء قسم ثقافي جديد',
          targetType: 'category',
          targetName: payload.name,
          actorEmail,
        });
        setMessage('تمت إضافة القسم الجديد وتعيين صورته بنجاح.');
      }
      setEditingCat(null);
    } catch (err: any) {
      setErrorBanner(err?.message || 'حدث خطأ أثناء حفظ القسم.');
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

  const modalPreviewSrc = editingCat ? resolveCategoryImage(editingCat) : '';

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">إدارة الأقسام والتصنيفات</h2>
          <p className="text-xs text-slate-600 mt-0.5">
            تخصيص صور وأغلفة الأقسام بالذكاء الاصطناعي أو الرفع المباشر، وإدارة الصعوبة والمصادر المعتمدة
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
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{message}</span>
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-rose-700 hover:text-rose-900 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {categories.map((cat) => {
          const approvedCount = (cat.questions || []).filter(
            (q) => !q.reviewStatus || q.reviewStatus === 'approved'
          ).length;
          const totalCount = (cat.questions || []).length;
          const active = cat.isActive !== false;
          const linkedNames = sources
            .filter(
              (s) => (cat.linkedSourceIds || []).includes(s.id) || s.linkedCategoryIds?.includes(cat.id)
            )
            .map((s) => s.name);
          const coverSrc = resolveCategoryImage(cat);
          const isRefreshingThis = refreshingCardId === cat.id;

          return (
            <div
              key={cat.id}
              className={`surface-card rounded-2xl overflow-hidden flex flex-col justify-between ${
                !active ? 'opacity-65' : ''
              }`}
            >
              {/* Category Cover Thumbnail with Quick AI Regenerate */}
              <div className="relative h-36 bg-[#0B192C] overflow-hidden">
                <img
                  src={coverSrc}
                  alt={cat.name}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover opacity-90"
                  onError={(e) => {
                    e.currentTarget.src = getBespokeCategoryImage(cat);
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/35 to-transparent" />

                {/* Top row: Status + One-Click AI Image Refresh */}
                <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${
                      active
                        ? 'bg-emerald-950/80 border-emerald-400/40 text-emerald-200'
                        : 'bg-slate-900/80 border-slate-500/40 text-slate-300'
                    }`}
                  >
                    {active ? 'نشط' : 'موقوف'}
                  </span>

                  <button
                    type="button"
                    disabled={Boolean(refreshingCardId)}
                    onClick={() => handleQuickRefreshCardImage(cat)}
                    title="توليد صورة جديدة بالذكاء الاصطناعي لهذا القسم"
                    className="px-2.5 py-1 rounded-lg bg-[#0B192C]/85 hover:bg-[#C9A24D] text-[#D9B768] hover:text-[#0B192C] border border-[#C9A24D]/50 text-[11px] font-bold flex items-center gap-1 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {isRefreshingThis ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    <span>{isRefreshingThis ? 'جاري التوليد...' : 'تحديث الصورة ✨'}</span>
                  </button>
                </div>

                {/* Bottom row: Group & Difficulty */}
                <div className="absolute bottom-2.5 right-3 left-3 flex items-center justify-between text-[11px] font-bold">
                  <span className="text-[#D9B768]">{cat.group || 'عام'}</span>
                  <span className="text-white/90">{DIFFICULTY_LABELS[cat.difficulty || 'medium']}</span>
                </div>

                {/* Loading overlay when regenerating this card */}
                {isRefreshingThis && (
                  <div className="absolute inset-0 bg-[#0B192C]/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 text-white">
                    <Loader2 className="w-6 h-6 animate-spin text-[#C9A24D]" />
                    <span className="text-xs font-bold text-[#D9B768]">جاري توليد غلاف متوافق...</span>
                  </div>
                )}
              </div>

              <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center shrink-0">
                      <BrandIcon name={cat.iconUrl} className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-display font-bold text-base text-[#0B192C] truncate">
                        {cat.name}
                      </h4>
                    </div>
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
                      onClick={() => openEditModal(cat)}
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
                {editingCat.id ? 'تعديل القسم الثقافي وغلافه' : 'إضافة قسم ثقافي جديد'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving || imageBusy}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar">
              {/* Name & Group */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">اسم القسم</label>
                  <input
                    type="text"
                    required
                    value={editingCat.name || ''}
                    onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })}
                    placeholder="مثال: الصحيفة السجادية"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold focus:outline-none focus:border-[#C9A24D]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">التصنيف / المجموعة</label>
                  <select
                    value={editingCat.group || 'دينية'}
                    onChange={(e) => setEditingCat({ ...editingCat, group: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold focus:outline-none focus:border-[#C9A24D]"
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

              {/* Description */}
              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">وصف القسم</label>
                <textarea
                  rows={2}
                  value={editingCat.description || ''}
                  onChange={(e) => setEditingCat({ ...editingCat, description: e.target.value })}
                  placeholder="وصف مختصر لمحتوى القسم (يُستخدم أيضاً في توليد صورة الغلاف بالذكاء الاصطناعي)"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold focus:outline-none focus:border-[#C9A24D]"
                />
              </div>

              {/* Category Cover Image Studio (3 Flexible Modes + Live Preview) */}
              <div className="rounded-2xl border border-[#E6DFD1] bg-[#FAF7F2] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-[#0B192C] text-[#C9A24D] flex items-center justify-center">
                      <ImageIcon className="w-4 h-4" />
                    </span>
                    <div>
                      <h4 className="font-display font-bold text-sm text-[#0B192C]">غلاف وصورة القسم</h4>
                      <p className="text-[11px] text-slate-500">
                        اختر توليداً ذكياً متوافقاً مع الهوية التراثية، أو رابطاً مباشراً، أو رفع صورة من جهازك
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={imageBusy}
                    onClick={handleRestoreBespokeDefault}
                    className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[11px] font-bold text-slate-600 flex items-center gap-1 cursor-pointer disabled:opacity-45"
                    title="استعادة التصميم التراثي المناسب للقسم"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>الافتراضي</span>
                  </button>
                </div>

                {/* Live 4:3 Preview + Mode Selector Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start">
                  {/* Live Cover Preview */}
                  <div className="sm:col-span-5">
                    <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-[#0B192C] border-2 border-[#C9A24D]/45 shadow-sm">
                      <img
                        src={modalPreviewSrc}
                        alt={editingCat.name || 'معاينة غلاف القسم'}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.src = getBespokeCategoryImage(editingCat);
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C]/85 via-transparent to-transparent" />
                      <div className="absolute bottom-2 right-2.5 left-2.5 flex items-center justify-between text-[11px] font-bold text-white">
                        <span className="truncate">{editingCat.name?.trim() || 'معاينة الغلاف'}</span>
                        <span className="text-[#D9B768] shrink-0 mr-2">{editingCat.group || 'دينية'}</span>
                      </div>

                      {imageBusy && (
                        <div className="absolute inset-0 bg-[#0B192C]/82 backdrop-blur-[2px] flex flex-col items-center justify-center gap-2 px-3 text-center">
                          <Loader2 className="w-6 h-6 animate-spin text-[#C9A24D]" />
                          <span className="text-[11px] font-bold text-[#D9B768]">
                            {imageBusyLabel || 'جاري التوليد...'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3-Mode Selector & Controls */}
                  <div className="sm:col-span-7 space-y-3">
                    <div className="grid grid-cols-3 gap-1.5 bg-white p-1 rounded-xl border border-[#E6DFD1]">
                      <button
                        type="button"
                        onClick={() => {
                          setImageTab('ai');
                          setImageError(null);
                        }}
                        className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          imageTab === 'ai'
                            ? 'bg-[#0B192C] text-[#D9B768]'
                            : 'text-slate-600 hover:bg-[#FAF7F2]'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5 shrink-0" />
                        <span>ذكاء اصطناعي</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setImageTab('url');
                          setImageError(null);
                        }}
                        className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          imageTab === 'url'
                            ? 'bg-[#0B192C] text-[#D9B768]'
                            : 'text-slate-600 hover:bg-[#FAF7F2]'
                        }`}
                      >
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>رابط مباشر</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setImageTab('upload');
                          setImageError(null);
                        }}
                        className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                          imageTab === 'upload'
                            ? 'bg-[#0B192C] text-[#D9B768]'
                            : 'text-slate-600 hover:bg-[#FAF7F2]'
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>رفع صورة</span>
                      </button>
                    </div>

                    {/* Mode 1: AI Generation */}
                    {imageTab === 'ai' && (
                      <div className="space-y-2.5 bg-white p-3 rounded-xl border border-[#E6DFD1]">
                        <p className="text-[11px] text-slate-600 leading-relaxed">
                          يُولّد صورة فنية بطابع إسلامي تراثي دافئ (كحلي وذهبي وإضاءة فوانيس بدون وجوه) مستلهمة تلقائياً من اسم القسم ووصفه.
                        </p>

                        <button
                          type="button"
                          disabled={imageBusy}
                          onClick={handleGenerateModalAIImage}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                        >
                          {imageBusy ? (
                            <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" />
                          ) : customImageSet ? (
                            <RefreshCw className="w-4 h-4 text-[#C9A24D]" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-[#C9A24D]" />
                          )}
                          <span>
                            {imageBusy
                              ? 'جاري التوليد...'
                              : customImageSet
                                ? 'توليد تصميم آخر بالذكاء الاصطناعي ✨'
                                : 'توليد صورة متوافقة بالذكاء الاصطناعي ✨'}
                          </span>
                        </button>

                        {!editingCat.id && (
                          <label className="flex items-center gap-2 text-[11px] font-bold text-[#0B192C] pt-1 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={autoGenerateOnCreate}
                              onChange={(e) => setAutoGenerateOnCreate(e.target.checked)}
                              className="w-4 h-4 rounded accent-[#0B192C]"
                            />
                            <span>توليد صورة تلقائياً عند الحفظ إذا لم يتم اختيار صورة</span>
                          </label>
                        )}
                      </div>
                    )}

                    {/* Mode 2: Direct Image URL */}
                    {imageTab === 'url' && (
                      <div className="space-y-2.5 bg-white p-3 rounded-xl border border-[#E6DFD1]">
                        <label className="text-[11px] font-bold text-[#0B192C] block">
                          رابط الصورة المباشر (HTTPS)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="url"
                            dir="ltr"
                            value={directUrlInput}
                            onChange={(e) => setDirectUrlInput(e.target.value)}
                            placeholder="https://example.com/category-cover.jpg"
                            className="flex-1 px-3 py-2 rounded-lg bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-mono text-left focus:outline-none focus:border-[#C9A24D]"
                          />
                          <button
                            type="button"
                            disabled={imageBusy || !directUrlInput.trim()}
                            onClick={handleApplyDirectUrl}
                            className="px-3.5 py-2 rounded-lg bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-45 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                          >
                            معاينة
                          </button>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          يتم التحقق من قابلية تحميل الرابط قبل تطبيقه وحفظه كغلاف رسمي للقسم.
                        </p>
                      </div>
                    )}

                    {/* Mode 3: Local File Upload */}
                    {imageTab === 'upload' && (
                      <div className="space-y-2.5 bg-white p-3 rounded-xl border border-[#E6DFD1]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLocalFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={imageBusy}
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full py-5 px-4 rounded-xl border-2 border-dashed border-[#C9A24D]/60 hover:border-[#0B192C] bg-[#FAF7F2] hover:bg-[#F3EFE6] transition-colors flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer disabled:opacity-50"
                        >
                          <Upload className="w-5 h-5 text-[#9B7729]" />
                          <span className="text-xs font-bold text-[#0B192C]">
                            اضغط لاختيار صورة من جهازك (JPG / PNG / WebP)
                          </span>
                          <span className="text-[11px] text-slate-500">
                            يتم قصّها تلقائياً بمقاس 4:3 وضغطها بذكاء للحفظ السريع في قاعدة البيانات
                          </span>
                        </button>
                      </div>
                    )}

                    {/* Inline Feedback for Image Actions */}
                    {imageError && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>{imageError}</span>
                      </div>
                    )}

                    {imageNotice && !imageError && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-[11px] font-bold flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span>{imageNotice}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Difficulty, Target Count, Timer */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">
                    مستوى الصعوبة الافتراضي
                  </label>
                  <select
                    value={editingCat.difficulty || 'medium'}
                    onChange={(e) =>
                      setEditingCat({ ...editingCat, difficulty: e.target.value as QuestionDifficulty })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                  >
                    {(Object.keys(DIFFICULTY_LABELS) as QuestionDifficulty[]).map((d) => (
                      <option key={d} value={d}>
                        {DIFFICULTY_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">
                    العدد المستهدف للأسئلة
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={editingCat.targetQuestionCount || 15}
                    onChange={(e) =>
                      setEditingCat({ ...editingCat, targetQuestionCount: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-[#0B192C] block mb-1">
                    مؤقت القسم (ثانية)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={300}
                    value={editingCat.timerDuration || 60}
                    onChange={(e) =>
                      setEditingCat({ ...editingCat, timerDuration: Number(e.target.value) })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold font-mono"
                  />
                </div>
              </div>

              {/* Icon Picker */}
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

              {/* Allowed Question Types */}
              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1.5">
                  أنواع الأسئلة المسموحة
                </label>
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
                            allowedQuestionTypes: selected
                              ? cur.filter((x) => x !== qt)
                              : [...cur, qt],
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

              {/* Linked Approved Sources */}
              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1.5">
                  المصادر الشيعية المعتمدة المرتبطة
                </label>
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
                            linkedSourceIds: picked
                              ? cur.filter((x) => x !== src.id)
                              : [...cur, src.id],
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
                disabled={saving || imageBusy}
                onClick={closeModal}
                className="px-4 py-2.5 rounded-xl border border-[#E6DFD1] bg-white text-xs font-bold text-slate-700 disabled:opacity-45 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={saving || imageBusy}
                className="px-6 py-2.5 rounded-xl bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
              >
                {(saving || imageBusy) && <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" />}
                <span>{saving ? 'جاري الحفظ...' : 'حفظ القسم'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
