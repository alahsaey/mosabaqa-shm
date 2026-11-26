import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Search,
  AlertCircle,
  Sparkles,
  Check,
  BookOpen,
  Lock,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { Category, CompetitionConfig, Team } from '../../types';
import { getBespokeCategoryImage, resolveCategoryImage } from '../../lib/assets';
import { BrandIcon } from '../ui/BrandIcon';
import { DIFFICULTY_LABELS } from '../../constants';

interface SelectionViewProps {
  teams: Team[];
  categories: Category[];
  competitionConfig: CompetitionConfig;
  reservedCategoryMap?: Record<string, string>;
  lockedTeamIds?: string[];
  onUpdateTeams: (teams: Team[]) => void;
  onLockTeamCategories: (teamIndex: number, requiredCountOverride?: number) => Promise<void>;
  onBackToSetup: () => void;
  onConfirmAndStart: () => void;
  playSound?: (type: 'click' | 'correct' | 'wrong' | 'turnSwitch') => void;
}

export const SelectionView: React.FC<SelectionViewProps> = ({
  teams,
  categories,
  competitionConfig,
  reservedCategoryMap = {},
  lockedTeamIds = [],
  onUpdateTeams,
  onLockTeamCategories,
  onBackToSetup,
  onConfirmAndStart,
  playSound,
}) => {
  const activeCategories = useMemo(
    () =>
      categories.filter((c) => {
        if (c.isActive === false) return false;
        const approvedQs = (c.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved');
        return approvedQs.length > 0;
      }),
    [categories]
  );

  const configuredPerTeam = Math.max(1, competitionConfig.categoriesPerTeam || 3);
  const maxFairPerTeam =
    activeCategories.length > 0
      ? Math.max(1, Math.floor(activeCategories.length / Math.max(1, teams.length)))
      : configuredPerTeam;
  const requiredPerTeam = Math.min(configuredPerTeam, maxFairPerTeam);
  const hasReducedQuota =
    activeCategories.length > 0 && activeCategories.length < teams.length * configuredPerTeam;

  const isTeamLocked = (team: Team, idx: number) =>
    Boolean(team.categoriesLocked) || lockedTeamIds.includes(team.id || `team-${idx + 1}`);

  const firstUnlockedIdx = useMemo(() => {
    const idx = teams.findIndex((t, i) => !isTeamLocked(t, i));
    return idx === -1 ? Math.max(0, teams.length - 1) : idx;
  }, [teams, lockedTeamIds]);

  const allTeamsLocked = useMemo(
    () => teams.length > 0 && teams.every((t, i) => isTeamLocked(t, i) && (t.selectedCategories || []).length >= requiredPerTeam),
    [teams, lockedTeamIds, requiredPerTeam]
  );

  const [activeTeamIndex, setActiveTeamIndex] = useState<number>(firstUnlockedIdx);
  const [selectedGroup, setSelectedGroup] = useState<string>('الكل');
  const [searchTerm, setSearchTerm] = useState('');
  const [isReviewing, setIsReviewing] = useState<boolean>(allTeamsLocked);
  const [lockingTeam, setLockingTeam] = useState(false);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  // Keep activeTeamIndex aligned with database lock state after reloads/hydrations
  useEffect(() => {
    if (allTeamsLocked) {
      setIsReviewing(true);
      return;
    }
    if (teams[activeTeamIndex] && isTeamLocked(teams[activeTeamIndex], activeTeamIndex)) {
      setActiveTeamIndex(firstUnlockedIdx);
    }
  }, [allTeamsLocked, firstUnlockedIdx, teams, activeTeamIndex]);

  const groups = useMemo(() => {
    const unique = Array.from(new Set(activeCategories.map((c) => c.group || 'عام')));
    return ['الكل', ...unique];
  }, [activeCategories]);

  // Build authoritative map of categories reserved by OTHER locked teams
  const reservedByOtherTeam = useMemo(() => {
    const map: Record<string, { teamId: string; teamName: string; teamIndex: number }> = {};
    const currentTeamId = teams[activeTeamIndex]?.id || `team-${activeTeamIndex + 1}`;

    // From reservedCategoryMap persisted in DB
    Object.entries<string>(reservedCategoryMap).forEach(([catId, ownerId]) => {
      if (ownerId && ownerId !== currentTeamId) {
        const ownerIdx = teams.findIndex((t, i) => (t.id || `team-${i + 1}`) === ownerId);
        const ownerTeam = ownerIdx >= 0 ? teams[ownerIdx] : undefined;
        map[catId] = {
          teamId: ownerId,
          teamName: ownerTeam?.name || 'الفريق الأول',
          teamIndex: ownerIdx >= 0 ? ownerIdx : 0,
        };
      }
    });

    // Also from any locked team's selectedCategories directly
    teams.forEach((t, idx) => {
      const tId = t.id || `team-${idx + 1}`;
      if (tId !== currentTeamId && isTeamLocked(t, idx)) {
        (t.selectedCategories || []).forEach((catId) => {
          if (!map[catId]) {
            map[catId] = {
              teamId: tId,
              teamName: t.name,
              teamIndex: idx,
            };
          }
        });
      }
    });

    return map;
  }, [reservedCategoryMap, teams, activeTeamIndex, lockedTeamIds]);

  const filteredCategories = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const list = activeCategories.filter((c) => {
      const matchGroup = selectedGroup === 'الكل' || (c.group || 'عام') === selectedGroup;
      const matchSearch =
        !term ||
        c.name.toLowerCase().includes(term) ||
        (c.description || '').toLowerCase().includes(term);
      return matchGroup && matchSearch;
    });

    // Place available (unreserved) categories first, and reserved disabled categories afterwards
    return [...list].sort((a, b) => {
      const aReserved = Boolean(reservedByOtherTeam[a.id]) ? 1 : 0;
      const bReserved = Boolean(reservedByOtherTeam[b.id]) ? 1 : 0;
      return aReserved - bReserved;
    });
  }, [activeCategories, selectedGroup, searchTerm, reservedByOtherTeam]);

  const currentTeam = teams[activeTeamIndex] || teams[0];
  const currentTeamLocked = currentTeam ? isTeamLocked(currentTeam, activeTeamIndex) : false;
  const currentSelectedCount = (currentTeam?.selectedCategories || []).length;
  const currentTeamComplete = currentSelectedCount === requiredPerTeam;

  const availableUnreservedCount = useMemo(
    () => activeCategories.filter((c) => !reservedByOtherTeam[c.id]).length,
    [activeCategories, reservedByOtherTeam]
  );

  const handleToggleCategory = (catId: string) => {
    if (!currentTeam || currentTeamLocked || lockingTeam) return;
    setSelectionError(null);

    // Hard guard: prevent selecting any category reserved by another team
    if (reservedByOtherTeam[catId]) {
      playSound?.('wrong');
      const owner = reservedByOtherTeam[catId];
      setSelectionError(
        owner.teamIndex === 0
          ? 'هذا القسم تم الاختيار بواسطة الفريق الأول ولا يمكن اختياره مرة أخرى.'
          : `هذا القسم محجوز مسبقاً بواسطة ${owner.teamName}.`
      );
      return;
    }

    const currentSelected = currentTeam.selectedCategories || [];
    const alreadyPicked = currentSelected.includes(catId);

    if (alreadyPicked) {
      playSound?.('click');
      const next = [...teams];
      next[activeTeamIndex] = {
        ...currentTeam,
        selectedCategories: currentSelected.filter((id) => id !== catId),
      };
      onUpdateTeams(next);
      return;
    }

    if (currentSelected.length >= requiredPerTeam) {
      playSound?.('wrong');
      setSelectionError(`الحد الأقصى المسموح به لهذا الفريق هو ${requiredPerTeam} أقسام فقط.`);
      return;
    }

    playSound?.('correct');
    const updatedSelected = [...currentSelected, catId];
    const next = [...teams];
    next[activeTeamIndex] = {
      ...currentTeam,
      selectedCategories: updatedSelected,
    };
    onUpdateTeams(next);
  };

  const handleConfirmCurrentTeam = async () => {
    if (!currentTeam || currentTeamLocked || !currentTeamComplete || lockingTeam) {
      if (!currentTeamComplete) {
        playSound?.('wrong');
        setSelectionError(`يجب اختيار ${requiredPerTeam} أقسام مكتملة لـ ${currentTeam?.name} قبل الاعتماد.`);
      }
      return;
    }

    setSelectionError(null);
    setLockingTeam(true);
    try {
      await onLockTeamCategories(activeTeamIndex, requiredPerTeam);
      const nextIdx = activeTeamIndex + 1;
      if (nextIdx < teams.length) {
        playSound?.('turnSwitch');
        setActiveTeamIndex(nextIdx);
        setSelectedGroup('الكل');
        setSearchTerm('');
      } else {
        playSound?.('correct');
        setIsReviewing(true);
      }
    } catch (err: any) {
      playSound?.('wrong');
      setSelectionError(err?.message || 'تعذر حفظ واعتماد اختيارات الفريق. يرجى المحاولة مجدداً.');
    } finally {
      setLockingTeam(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-right">
          <p className="text-xs font-bold text-[#9B7729]">
            الخطوة ٢ من ٣ • اختيار الأقسام الثقافية (حجز حصري لكل فريق)
          </p>
          <h1 className="font-display font-extrabold text-3xl text-[#0B192C] mt-1">
            {isReviewing
              ? 'مراجعة واعتماد أقسام الفريقين'
              : `اختيارات ${currentTeam?.name} (${currentSelectedCount} / ${requiredPerTeam})`}
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            يختار كل فريق {requiredPerTeam} أقسام خاصة به دون تكرار؛ وبمجرد اعتماد الفريق الأول يتم حجز أقسامه في قاعدة البيانات تلقائياً.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            playSound?.('click');
            onBackToSetup();
          }}
          className="px-4 py-2.5 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>تعديل أسماء الفرق</span>
        </button>
      </div>

      {/* Sequential Teams Lock Progress Header */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team, idx) => {
          const pickedIds = team.selectedCategories || [];
          const locked = isTeamLocked(team, idx);
          const isCurrent = activeTeamIndex === idx && !isReviewing;
          const isWaitingForPrevious = idx > 0 && !locked && !isTeamLocked(teams[idx - 1], idx - 1);
          const progressPct = Math.min(100, Math.round((pickedIds.length / requiredPerTeam) * 100));

          return (
            <div
              key={team.id}
              className={`p-5 rounded-2xl border text-right transition-all ${
                isCurrent
                  ? 'bg-[#0B192C] text-white border-[#C9A24D] shadow-lg'
                  : locked
                    ? 'bg-emerald-50/70 text-[#0B192C] border-emerald-300'
                    : 'bg-white text-[#0B192C] border-[#E6DFD1] opacity-75'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 rounded-xl text-white font-bold flex items-center justify-center shrink-0 border border-white/20"
                    style={{ backgroundColor: team.color || '#0B192C' }}
                  >
                    {locked ? <Lock className="w-4 h-4" /> : idx + 1}
                  </span>
                  <div>
                    <div className="font-display font-bold text-lg">{team.name}</div>
                    <div
                      className={`text-xs font-semibold ${
                        isCurrent ? 'text-[#D9B768]' : locked ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {locked
                        ? 'تم اعتماد الاختيارات وحجز الأقسام في قاعدة البيانات'
                        : isCurrent
                          ? 'جاري اختيار الأقسام لهذا الفريق الآن'
                          : isWaitingForPrevious
                            ? `بانتظار اعتماد اختيارات ${teams[idx - 1]?.name}`
                            : 'جاهز للاختيار'}
                    </div>
                  </div>
                </div>

                <div className="text-left">
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-bold ${
                      locked ? 'text-emerald-700' : isCurrent ? 'text-[#D9B768]' : 'text-slate-600'
                    }`}
                  >
                    {locked && <CheckCircle2 className="w-4 h-4" />}
                    <span className="tabular-nums">
                      {pickedIds.length} / {requiredPerTeam}
                    </span>
                  </span>
                </div>
              </div>

              <div className="mt-3 h-2 rounded-full bg-slate-200/40 overflow-hidden border border-black/5">
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${progressPct}%`,
                    backgroundColor: locked ? '#0F766E' : '#C9A24D',
                  }}
                />
              </div>

              {pickedIds.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pickedIds.map((cid) => {
                    const cat = categories.find((c) => c.id === cid);
                    return (
                      <span
                        key={cid}
                        className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border inline-flex items-center gap-1 ${
                          isCurrent
                            ? 'bg-white/10 border-white/15 text-white'
                            : locked
                              ? 'bg-white border-emerald-200 text-emerald-900'
                              : 'bg-[#FAF7F2] border-[#E6DFD1] text-[#0B192C]'
                        }`}
                      >
                        {locked && <Lock className="w-3 h-3 text-emerald-600" />}
                        <span>{cat?.name || cid}</span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasReducedQuota && (
        <div className="p-4 rounded-2xl bg-[#F7F1DF] border border-[#C9A24D]/50 text-[#0B192C] text-xs font-bold flex items-center gap-2.5 text-right">
          <AlertCircle className="w-4 h-4 text-[#9B7729] shrink-0" />
          <span>
            عدد الأقسام النشطة حالياً ({activeCategories.length}) أقل من المطلوب ({teams.length * configuredPerTeam})؛ تم ضبط الحصة تلقائياً إلى ({requiredPerTeam}) قسم لكل فريق لضمان توزيع عادل دون تكرار.
          </span>
        </div>
      )}

      {selectionError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2.5 text-right">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{selectionError}</span>
        </div>
      )}

      {/* Review Mode vs Sequential Selection Grid */}
      {isReviewing ? (
        <div className="surface-card rounded-3xl p-6 sm:p-8 space-y-6 text-right">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6DFD1] pb-4">
            <div>
              <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">
                مراجعة الاختيارات المحجوزة قبل بدء المسابقة
              </h2>
              <p className="text-xs text-slate-600 mt-1">
                تم حجز {requiredPerTeam} أقسام مستقلة لكل فريق دون أي تكرار وتوثيقها في قاعدة البيانات
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              محفوظة ومقفلة في قاعدة البيانات
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {teams.map((team) => (
              <div key={team.id} className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-bold text-lg text-[#0B192C]">{team.name}</h3>
                  <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    مكتمل ومحجوز ({requiredPerTeam})
                  </span>
                </div>
                <div className="space-y-2">
                  {(team.selectedCategories || []).map((cid) => {
                    const cat = categories.find((c) => c.id === cid);
                    const qCount = (cat?.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length;
                    return (
                      <div
                        key={cid}
                        className="p-3 rounded-xl bg-white border border-[#E6DFD1] flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2.5">
                          <BrandIcon name={cat?.iconUrl} className="w-4 h-4 text-[#9B7729]" />
                          <span className="font-bold text-sm text-[#0B192C]">{cat?.name}</span>
                        </div>
                        <span className="text-xs font-mono text-slate-500 tabular-nums">{qCount} سؤال</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => {
                playSound?.('correct');
                onConfirmAndStart();
              }}
              className="px-8 py-4 bg-[#0B192C] hover:bg-[#13253E] text-white font-display font-extrabold text-base rounded-2xl shadow-lg flex items-center gap-3 cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-[#C9A24D]" />
              <span>بدء المسابقة والانتقال لجولات الأسئلة</span>
              <ArrowLeft className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Active Turn Selection Info Strip */}
          {activeTeamIndex > 0 && (
            <div className="p-4 rounded-2xl bg-[#0B192C] text-white border border-[#C9A24D]/40 flex flex-wrap items-center justify-between gap-3 text-right">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
                <Lock className="w-4 h-4 text-[#C9A24D] shrink-0" />
                <span>
                  أقسام {teams[0]?.name} محجوزة ومغلقة. اختر الآن {requiredPerTeam} أقسام لـ{' '}
                  <strong className="text-[#D9B768]">{currentTeam?.name}</strong> من الأقسام المتاحة ({availableUnreservedCount} متاح).
                </span>
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="surface-card rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {groups.map((grp) => (
                <button
                  key={grp}
                  type="button"
                  onClick={() => {
                    playSound?.('click');
                    setSelectedGroup(grp);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    selectedGroup === grp
                      ? 'bg-[#0B192C] text-white'
                      : 'bg-[#FAF7F2] text-slate-700 hover:bg-[#F3EFE6] border border-[#E6DFD1]'
                  }`}
                >
                  {grp}
                </button>
              ))}
            </div>

            <div className="relative sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ابحث عن قسم..."
                className="w-full pr-10 pl-3 py-2 bg-[#FAF7F2] border border-[#E6DFD1] rounded-xl text-xs font-semibold text-[#0B192C] focus:outline-none focus:border-[#C9A24D]"
              />
            </div>
          </div>

          {/* Categories Selection Grid */}
          {filteredCategories.length === 0 ? (
            <div className="surface-card rounded-2xl p-10 text-center text-slate-500">
              <BookOpen className="w-10 h-10 mx-auto text-slate-300 mb-3" />
              <p className="font-bold">لا توجد أقسام مطابقة أو تحتوي على أسئلة معتمدة.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCategories.map((cat) => {
                const approvedQuestions = (cat.questions || []).filter(
                  (q) => !q.reviewStatus || q.reviewStatus === 'approved'
                );
                const isSelectedByCurrent = (currentTeam?.selectedCategories || []).includes(cat.id);
                const reservedOwner = reservedByOtherTeam[cat.id];
                const isReservedByOther = Boolean(reservedOwner);
                const isLimitReached =
                  !isSelectedByCurrent && currentSelectedCount >= requiredPerTeam;
                const isDisabled = currentTeamLocked || isReservedByOther || isLimitReached;

                const imgSrc = resolveCategoryImage(cat);

                return (
                  <button
                    key={cat.id}
                    type="button"
                    disabled={isDisabled}
                    aria-disabled={isDisabled}
                    onClick={() => handleToggleCategory(cat.id)}
                    className={`group rounded-2xl border overflow-hidden text-right transition-all flex flex-col ${
                      isReservedByOther
                        ? 'bg-slate-100 border-slate-200 opacity-65 cursor-not-allowed grayscale-[35%]'
                        : isSelectedByCurrent
                          ? 'bg-[#0B192C] text-white border-[#C9A24D] ring-2 ring-[#C9A24D]/40 shadow-lg cursor-pointer'
                          : isLimitReached
                            ? 'bg-white/60 border-[#E6DFD1] opacity-55 cursor-not-allowed'
                            : 'bg-white border-[#E6DFD1] hover:border-[#C9A24D] shadow-sm cursor-pointer'
                    }`}
                  >
                    <div className="relative h-32 w-full bg-[#0B192C] overflow-hidden">
                      <img
                        src={imgSrc}
                        alt={cat.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className={`w-full h-full object-cover ${
                          isReservedByOther ? 'opacity-40' : 'opacity-80 group-hover:scale-105 transition-transform duration-300'
                        }`}
                        onError={(e) => {
                          e.currentTarget.src = getBespokeCategoryImage(cat);
                        }}
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0B192C] via-[#0B192C]/35 to-transparent" />
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2">
                        {isReservedByOther ? (
                          <span className="px-2.5 py-1 rounded-lg bg-[#0B192C]/90 border border-[#C9A24D]/50 text-[#D9B768] text-[11px] font-bold flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {reservedOwner.teamIndex === 0
                                ? 'تم الاختيار بواسطة الفريق الأول'
                                : `تم الاختيار بواسطة ${reservedOwner.teamName}`}
                            </span>
                          </span>
                        ) : isSelectedByCurrent ? (
                          <span className="w-7 h-7 rounded-lg bg-[#C9A24D] text-[#0B192C] flex items-center justify-center font-bold shadow">
                            <Check className="w-4 h-4" />
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-[#0B192C]/80 text-[#FAF7F2] text-[11px] font-bold font-mono tabular-nums">
                            {approvedQuestions.length} سؤال
                          </span>
                        )}
                      </div>
                      <div className="absolute bottom-2.5 right-3 left-3 flex items-center justify-between text-xs text-[#D9B768] font-bold">
                        <span>{cat.group || 'عام'}</span>
                        <span>{DIFFICULTY_LABELS[cat.difficulty || 'medium']}</span>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-2 w-full">
                      <div>
                        <div className="flex items-center gap-2">
                          <BrandIcon
                            name={cat.iconUrl}
                            className={`w-4 h-4 shrink-0 ${
                              isReservedByOther
                                ? 'text-slate-400'
                                : isSelectedByCurrent
                                  ? 'text-[#C9A24D]'
                                  : 'text-[#9B7729]'
                            }`}
                          />
                          <h3
                            className={`font-display font-bold text-base truncate ${
                              isReservedByOther ? 'text-slate-500' : ''
                            }`}
                          >
                            {cat.name}
                          </h3>
                        </div>
                        <p
                          className={`text-xs mt-1.5 line-clamp-2 leading-relaxed ${
                            isReservedByOther
                              ? 'text-slate-400'
                              : isSelectedByCurrent
                                ? 'text-slate-300'
                                : 'text-slate-600'
                          }`}
                        >
                          {cat.description || 'مجموعة أسئلة ثقافية موثقة ومتدرجة الصعوبة.'}
                        </p>
                      </div>

                      {isReservedByOther && (
                        <div className="pt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
                          <Lock className="w-3.5 h-3.5 text-[#9B7729] shrink-0" />
                          <span>
                            {reservedOwner.teamIndex === 0
                              ? 'تم الاختيار بواسطة الفريق الأول'
                              : `تم الاختيار بواسطة ${reservedOwner.teamName}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Readiness Guard & Lock Confirmation Button */}
          <div className="surface-card rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 text-xs font-bold text-right">
              {currentTeamComplete ? (
                <>
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                  <span className="text-emerald-900">
                    {activeTeamIndex < teams.length - 1
                      ? `اكتملت اختيارات ${currentTeam?.name}. اضغط لاعتماد وحجز الأقسام والانتقال لـ ${teams[activeTeamIndex + 1]?.name}.`
                      : `اكتملت اختيارات ${currentTeam?.name}. اضغط لاعتماد الاختيارات والمراجعة النهائية.`}
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-[#9B7729] shrink-0" />
                  <span className="text-slate-700">
                    يجب أن يختار {currentTeam?.name} عدد ({requiredPerTeam}) أقسام قبل السماح بالاعتماد والحجز (متبقي {Math.max(0, requiredPerTeam - currentSelectedCount)}).
                  </span>
                </>
              )}
            </div>

            <button
              type="button"
              disabled={!currentTeamComplete || lockingTeam || currentTeamLocked}
              onClick={handleConfirmCurrentTeam}
              className="px-7 py-3.5 bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-45 disabled:cursor-not-allowed text-white font-display font-bold text-sm rounded-xl flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {lockingTeam ? (
                <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" />
              ) : (
                <Lock className="w-4 h-4 text-[#C9A24D]" />
              )}
              <span>
                {activeTeamIndex === 0
                  ? 'اعتماد اختيارات الفريق الأول وحجزها'
                  : activeTeamIndex < teams.length - 1
                    ? `اعتماد وحجز اختيارات ${currentTeam?.name}`
                    : 'اعتماد الاختيارات والمراجعة النهائية'}
              </span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SelectionView;
