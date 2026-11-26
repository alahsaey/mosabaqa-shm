import React from 'react';
import { motion } from 'framer-motion';
import {
  Play,
  RotateCcw,
  BookOpen,
  Users,
  Clock,
  Award,
  CheckCircle2,
  ShieldCheck,
  Settings,
  Layers,
  Sparkles,
} from 'lucide-react';
import { Category, CompetitionConfig, ScoringSettings } from '../../types';
import { BRAND_ASSETS, getCategoryFallbackImage } from '../../lib/assets';
import { BrandIcon } from '../ui/BrandIcon';
import { DIFFICULTY_LABELS } from '../../constants';

interface HomeViewProps {
  competitionName: string;
  competitionSlogan: string;
  logoUrl?: string;
  categories: Category[];
  approvedSourcesCount: number;
  completedSessionsCount: number;
  dbConnected: 'connecting' | 'connected' | 'error';
  hasSavedActiveGame: boolean;
  competitionConfig: CompetitionConfig;
  scoringSettings: ScoringSettings;
  onStartNewGame: () => void;
  onResumeGame: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  competitionName,
  competitionSlogan,
  logoUrl,
  categories,
  approvedSourcesCount,
  completedSessionsCount,
  dbConnected,
  hasSavedActiveGame,
  competitionConfig,
  scoringSettings,
  onStartNewGame,
  onResumeGame,
  onOpenSettings,
  onOpenAdmin,
}) => {
  const activeCategories = categories.filter((c) => c.isActive !== false);
  const totalApprovedQuestions = activeCategories.reduce(
    (sum, cat) =>
      sum +
      (cat.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length,
    0
  );

  const resolvedLogo =
    logoUrl && logoUrl.trim() && !logoUrl.includes('flaticon.com') && !logoUrl.includes('icons8.com')
      ? logoUrl
      : BRAND_ASSETS.emblem;

  return (
    <div className="space-y-12 pb-16">
      {/* Hero Broadcast Stage Section */}
      <section className="relative overflow-hidden rounded-3xl bg-[#0B192C] text-[#FAF7F2] border border-[#C9A24D]/35 shadow-xl">
        <div
          className="absolute inset-0 opacity-25 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: `url(${BRAND_ASSETS.heroStage})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-l from-[#0B192C] via-[#0B192C]/92 to-[#0B192C]/75 pointer-events-none" />

        <div className="relative z-10 px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-8 space-y-6 text-right">
            <div className="flex items-center gap-4">
              <img
                src={resolvedLogo}
                alt={competitionName}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-[#C9A24D]/70 shadow-lg bg-[#13253E]"
                onError={(e) => {
                  e.currentTarget.src = BRAND_ASSETS.emblem;
                }}
              />
              <div>
                <p className="text-xs sm:text-sm font-bold text-[#D9B768] tracking-wide">
                  المنصة الثقافية التلفزيونية التفاعلية
                </p>
                <h1 className="font-display font-black text-3xl sm:text-5xl text-white leading-tight mt-1">
                  {competitionName}
                </h1>
              </div>
            </div>

            <p className="text-base sm:text-lg text-[#FAF7F2]/85 max-w-2xl leading-relaxed font-medium">
              {competitionSlogan}
            </p>

            {/* Primary Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onStartNewGame}
                className="px-7 py-4 bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-display font-extrabold text-base sm:text-lg rounded-2xl shadow-lg transition-colors flex items-center gap-2.5 cursor-pointer"
              >
                <Play className="w-5 h-5 fill-current" />
                <span>بدء مسابقة جديدة</span>
              </button>

              {hasSavedActiveGame && (
                <button
                  type="button"
                  onClick={onResumeGame}
                  className="px-6 py-4 bg-[#13253E] hover:bg-[#1D3554] text-[#FAF7F2] border border-[#C9A24D]/45 font-bold text-sm sm:text-base rounded-2xl transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4 text-[#C9A24D]" />
                  <span>استئناف المسابقة الحالية</span>
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSettings}
                className="px-5 py-4 bg-white/10 hover:bg-white/15 text-white border border-white/15 font-semibold text-sm rounded-2xl transition-colors flex items-center gap-2 cursor-pointer"
              >
                <Settings className="w-4 h-4 text-[#C9A24D]" />
                <span>خيارات المسابقة</span>
              </button>
            </div>
          </div>

          {/* Right/End Readout Panel */}
          <div className="lg:col-span-4 bg-[#13253E]/90 border border-[#C9A24D]/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-xs font-bold text-[#D9B768]">جاهزية المنصة والاتصال</span>
              <span
                className={`text-xs font-bold flex items-center gap-1.5 ${
                  dbConnected === 'connected'
                    ? 'text-emerald-300'
                    : dbConnected === 'connecting'
                      ? 'text-[#D9B768]'
                      : 'text-rose-300'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {dbConnected === 'connected' ? 'متصل بالسحابة' : dbConnected === 'connecting' ? 'جاري التحقق' : 'وضع محلي'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-right">
              <div className="p-3 rounded-xl bg-[#0B192C]/70 border border-white/10">
                <div className="text-2xl font-extrabold text-white tabular-nums">{activeCategories.length}</div>
                <div className="text-xs text-slate-300 mt-0.5">الأقسام النشطة</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B192C]/70 border border-white/10">
                <div className="text-2xl font-extrabold text-[#D9B768] tabular-nums">{totalApprovedQuestions}</div>
                <div className="text-xs text-slate-300 mt-0.5">أسئلة معتمدة</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B192C]/70 border border-white/10">
                <div className="text-2xl font-extrabold text-emerald-300 tabular-nums">{approvedSourcesCount}</div>
                <div className="text-xs text-slate-300 mt-0.5">مصادر موثقة</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0B192C]/70 border border-white/10">
                <div className="text-2xl font-extrabold text-white tabular-nums">{completedSessionsCount}</div>
                <div className="text-xs text-slate-300 mt-0.5">مسابقات مكتملة</div>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenAdmin}
              className="w-full py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-[#D9B768] flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>بوابة المشرف والمصادر المعتمدة</span>
            </button>
          </div>
        </div>
      </section>

      {/* How to Play & Competition Format */}
      <section className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">نظام المسابقة وآلية اللعب</h2>
            <p className="text-sm text-slate-600 mt-1">
              منافسة ثقافية منظمة بنظام الفرق والجولات الموثقة بالمصادر الشيعية المعتمدة
            </p>
          </div>
          <span className="text-xs font-semibold text-[#9B7729]">
            {competitionConfig.teamCount} فرق • {competitionConfig.categoriesPerTeam} أقسام لكل فريق • 60 ث للفريق الأول و30 ث للثاني
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="surface-card rounded-2xl p-6 space-y-3">
            <div className="w-11 h-11 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#0B192C]">١. تجهيز الفريقين والمشاركين</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              تسمية الفريقين، إضافة أسماء المتسابقين المشاركين في كل فريق، وتخصيص ألوان الهوية قبل انطلاق الجولة.
            </p>
          </div>

          <div className="surface-card rounded-2xl p-6 space-y-3">
            <div className="w-11 h-11 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#0B192C]">
              ٢. اختيار {competitionConfig.categoriesPerTeam} أقسام لكل فريق
            </h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              يختار كل فريق {competitionConfig.categoriesPerTeam} أقسام ثقافية من القائمة المعتمدة، مع مراجعة وتأكيد الاختيارات قبل البدء.
            </p>
          </div>

          <div className="surface-card rounded-2xl p-6 space-y-3">
            <div className="w-11 h-11 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <h3 className="font-display font-bold text-lg text-[#0B192C]">٣. منصة الأسئلة والتتويج</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              تظهر الأسئلة بمؤقت زمني مزدوج (60 ث للأول و30 ث للثاني)، ونقاط مرنة تبدأ من {scoringSettings.easyPoints} نقطة، وصولاً لمنصة التتويج وإصدار الشهادات.
            </p>
          </div>
        </div>
      </section>

      {/* Cultural Categories Showcase */}
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">الأقسام الثقافية المتاحة</h2>
            <p className="text-sm text-slate-600 mt-1">
              مختارة وموثقة بمصادر شيعية معتمدة ومراجعة إدارياً لضمان الدقة العلمية
            </p>
          </div>
          <button
            type="button"
            onClick={onStartNewGame}
            className="px-4 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-[#C9A24D]" />
            <span>اختيار الأقسام والبدء</span>
          </button>
        </div>

        {activeCategories.length === 0 ? (
          <div className="surface-card rounded-2xl p-10 text-center text-slate-500">
            <BookOpen className="w-10 h-10 mx-auto text-slate-300 mb-3" />
            <p className="font-bold">لا توجد أقسام نشطة حالياً. يمكن للمشرف إضافة وتفعيل الأقسام من لوحة التحكم.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {activeCategories.map((cat, idx) => {
              const approvedCount = (cat.questions || []).filter(
                (q) => !q.reviewStatus || q.reviewStatus === 'approved'
              ).length;
              const imgSrc =
                cat.imageUrl &&
                cat.imageUrl.trim() &&
                !cat.imageUrl.includes('unsplash.com') &&
                !cat.imageUrl.includes('pollinations.ai')
                  ? cat.imageUrl
                  : getCategoryFallbackImage(cat.group);

              return (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.04, 0.25) }}
                  className="surface-card rounded-2xl overflow-hidden flex flex-col hover:border-[#C9A24D] transition-colors"
                >
                  <div className="relative h-36 bg-[#0B192C] overflow-hidden">
                    <img
                      src={imgSrc}
                      alt={cat.name}
                      loading="lazy"
                      className="w-full h-full object-cover opacity-85"
                      onError={(e) => {
                        e.currentTarget.src = getCategoryFallbackImage(cat.group);
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/35 to-transparent" />
                    <div className="absolute bottom-3 right-3 left-3 flex items-center justify-between text-white">
                      <span className="text-xs font-bold text-[#D9B768]">{cat.group || 'عام'}</span>
                      <span className="text-xs font-mono text-white/90 tabular-nums">{approvedCount} سؤال</span>
                    </div>
                  </div>

                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3 text-right">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-[#F3EFE6] text-[#0B192C] flex items-center justify-center shrink-0">
                          <BrandIcon name={cat.iconUrl} className="w-4 h-4" />
                        </span>
                        <h3 className="font-display font-bold text-base text-[#0B192C] truncate">{cat.name}</h3>
                      </div>
                      <p className="text-xs text-slate-600 mt-2 line-clamp-2 leading-relaxed">
                        {cat.description || 'أسئلة ثقافية ومعرفية متدرجة الصعوبة ومربوطة بالمراجع المعتمدة.'}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-[#E6DFD1] flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                      <span>المستوى: {DIFFICULTY_LABELS[cat.difficulty || 'medium']}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#9B7729]" />
                        60 / 30 ث
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default HomeView;
