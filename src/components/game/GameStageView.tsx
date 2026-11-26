import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Clock,
  Pause,
  Play,
  Lightbulb,
  CheckCircle2,
  XCircle,
  SkipForward,
  BookOpen,
  ExternalLink,
  Sparkles,
  QrCode,
  Copy,
  Check,
  ArrowRight,
  ArrowLeft,
  Flag,
  Loader2,
  Users,
  Lock,
  AlertTriangle,
  Timer,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import {
  ActiveQuestionTimerState,
  Category,
  CompetitionConfig,
  GameSession,
  Question,
  QuestionDifficulty,
  ScoringSettings,
} from '../../types';
import { DIFFICULTY_LABELS, QUESTION_TYPE_LABELS } from '../../constants';
import { aiService } from '../../services/aiService';
import { BrandIcon } from '../ui/BrandIcon';
import { BoundedVideoClipPlayer } from './BoundedVideoClipPlayer';
import { areVideoClipsApproved } from '../../services/videoService';
import { computeEffectiveTimerSnapshot, timeSyncService } from '../../services/timeSyncService';
import { SoundEffectType } from '../../services/soundService';

interface GameStageViewProps {
  session: GameSession;
  sessionId: string | null;
  competitionConfig: CompetitionConfig;
  scoringSettings: ScoringSettings;
  reactions: { id?: string; emoji?: string; comment?: string; senderName?: string }[];
  onSelectQuestion: (categoryId: string, questionId: string) => void;
  onBackToBoard: () => void;
  onSwitchTurn: (teamId: string) => void;
  onUpdateActiveQuestionState: (nextState: ActiveQuestionTimerState) => void;
  onRecordWrongAttempt: (params: {
    categoryId: string;
    questionId: string;
    teamId: string;
    phase: 'first' | 'second';
  }) => Promise<void>;
  onExpireQuestion: (categoryId: string, questionId: string) => Promise<void>;
  onJudgeQuestion: (params: {
    categoryId: string;
    questionId: string;
    outcome: 'correct' | 'wrong' | 'skip';
    targetTeamId: string;
    stayOnReveal?: boolean;
  }) => Promise<void>;
  onFinishCompetition: () => void;
  onReturnHome: () => void;
  playSound?: (type: SoundEffectType) => void;
}

export const GameStageView: React.FC<GameStageViewProps> = ({
  session,
  sessionId,
  competitionConfig,
  scoringSettings,
  reactions,
  onSelectQuestion,
  onBackToBoard,
  onSwitchTurn,
  onUpdateActiveQuestionState,
  onRecordWrongAttempt,
  onExpireQuestion,
  onJudgeQuestion,
  onFinishCompetition,
  onReturnHome,
  playSound,
}) => {
  const boardTurnTeam = session.teams.find((t) => t.id === session.currentTurn) || session.teams[0];

  const selectedCategory: Category | undefined = useMemo(
    () => session.categories.find((c) => c.id === session.selectedCategoryId),
    [session.categories, session.selectedCategoryId]
  );

  const selectedQuestion: Question | undefined = useMemo(
    () => selectedCategory?.questions.find((q) => q.id === session.selectedQuestionId),
    [selectedCategory, session.selectedQuestionId]
  );

  const activeQState = useMemo(() => {
    if (!selectedQuestion || !selectedCategory) return null;
    if (
      session.activeQuestionState &&
      session.activeQuestionState.questionId === selectedQuestion.id &&
      session.activeQuestionState.categoryId === selectedCategory.id
    ) {
      return session.activeQuestionState;
    }
    return null;
  }, [selectedQuestion, selectedCategory, session.activeQuestionState]);

  const [syncedNowMs, setSyncedNowMs] = useState<number>(() => timeSyncService.getSyncedNowMs());
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [hintText, setHintText] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState(false);
  const [showSpectatorQr, setShowSpectatorQr] = useState(false);
  const [copiedSpectatorLink, setCopiedSpectatorLink] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const lastTickSecondRef = useRef<number>(-1);
  const transferSentKeyRef = useRef<string>('');
  const expireSentKeyRef = useRef<string>('');
  const legacyInitKeyRef = useRef<string>('');
  const submittingRef = useRef<boolean>(false);
  const autoReturnTimeoutRef = useRef<number | null>(null);

  // Reset local stage state cleanly ONLY when selected question changes
  useEffect(() => {
    if (autoReturnTimeoutRef.current) {
      window.clearTimeout(autoReturnTimeoutRef.current);
      autoReturnTimeoutRef.current = null;
    }
    setSelectedOption(null);
    setHintText(selectedQuestion?.hint || null);
    setStatusFeedback(null);
    lastTickSecondRef.current = -1;
    submittingRef.current = false;
    transferSentKeyRef.current = '';
    expireSentKeyRef.current = '';

    if (selectedQuestion && selectedCategory) {
      const slotKey = `${selectedCategory.id}:${selectedQuestion.id}`;
      const alreadyOccupied = session.occupiedSlots.includes(slotKey);
      const stateResolved =
        activeQState?.phase === 'resolved' || activeQState?.phase === 'expired';
      setAnswerRevealed(alreadyOccupied || stateResolved);
      if (!alreadyOccupied && !stateResolved) {
        playSound?.('reveal');
        timeSyncService.syncServerClock().catch(() => {});

        if (!activeQState && legacyInitKeyRef.current !== slotKey) {
          legacyInitKeyRef.current = slotKey;
          const now = timeSyncService.getSyncedNowMs();
          const primaryTeam =
            session.teams.find((t) => t.id === session.currentTurn) || session.teams[0];
          const secondaryTeam =
            session.teams.find((t) => t.id !== primaryTeam?.id) || session.teams[1] || primaryTeam;
          if (primaryTeam && secondaryTeam) {
            onUpdateActiveQuestionState({
              categoryId: selectedCategory.id,
              questionId: selectedQuestion.id,
              primaryTeamId: primaryTeam.id,
              secondaryTeamId: secondaryTeam.id,
              answeringTeamId: primaryTeam.id,
              phase: 'first',
              phase1DurationSec: 60,
              phase2DurationSec: 30,
              questionOpenedAtServerMs: now,
              phaseStartedAtServerMs: now,
              phaseEndsAtServerMs: now + 60_000,
              isPaused: false,
              pausedRemainingMs: null,
              phase1Attempted: false,
              phase2Attempted: false,
              resolvedTeamId: null,
              resolvedOutcome: null,
              transferReason: null,
            });
          }
        }
      }
    } else {
      setAnswerRevealed(false);
    }
  }, [selectedQuestion?.id, selectedCategory?.id]);

  // Authoritative 200ms timer heartbeat computed strictly from server-synced timestamps
  useEffect(() => {
    if (!selectedQuestion || !selectedCategory || !activeQState) return;
    if (activeQState.phase === 'resolved' || activeQState.phase === 'expired') return;

    const tick = () => {
      const now = timeSyncService.getSyncedNowMs();
      setSyncedNowMs(now);

      const snap = computeEffectiveTimerSnapshot(activeQState, now);
      if (!snap) return;

      const qKey = `${selectedCategory.id}:${selectedQuestion.id}`;

      // Beep on last 10 seconds
      if (
        (snap.phase === 'first' || snap.phase === 'second') &&
        !activeQState.isPaused &&
        snap.remainingSec > 0 &&
        snap.remainingSec <= 10 &&
        lastTickSecondRef.current !== snap.remainingSec
      ) {
        lastTickSecondRef.current = snap.remainingSec;
        playSound?.('tick');
      }

      // Automatic Phase 1 (60s) -> Phase 2 (30s) transition without host intervention
      if (snap.autoTransitionedToSecond && transferSentKeyRef.current !== qKey) {
        transferSentKeyRef.current = qKey;
        lastTickSecondRef.current = -1;
        setSelectedOption(null);
        playSound?.('turnTransfer');
        onUpdateActiveQuestionState({
          ...activeQState,
          phase: 'second',
          answeringTeamId: activeQState.secondaryTeamId,
          phaseStartedAtServerMs: snap.newPhaseStartedAt || activeQState.phaseEndsAtServerMs,
          phaseEndsAtServerMs:
            snap.newPhaseEndsAt || activeQState.phaseEndsAtServerMs + activeQState.phase2DurationSec * 1000,
          isPaused: false,
          pausedRemainingMs: null,
          transferReason: 'timeout',
        });
      }

      // Automatic Phase 2 (30s) Expiration -> Close question & advance
      if (snap.autoExpiredAll && expireSentKeyRef.current !== qKey) {
        expireSentKeyRef.current = qKey;
        submittingRef.current = true;
        playSound?.('timeout');
        if (competitionConfig.showAnswerAfterTimeout) {
          setAnswerRevealed(true);
        }
        onExpireQuestion(selectedCategory.id, selectedQuestion.id);
        autoReturnTimeoutRef.current = window.setTimeout(() => {
          onBackToBoard();
        }, 3200);
      }
    };

    tick();
    const intervalId = window.setInterval(tick, 200);
    return () => window.clearInterval(intervalId);
  }, [
    selectedQuestion?.id,
    selectedCategory?.id,
    activeQState,
    competitionConfig.showAnswerAfterTimeout,
    onUpdateActiveQuestionState,
    onExpireQuestion,
    onBackToBoard,
    playSound,
  ]);

  useEffect(() => {
    return () => {
      if (autoReturnTimeoutRef.current) {
        window.clearTimeout(autoReturnTimeoutRef.current);
      }
    };
  }, []);

  const timerSnapshot = useMemo(() => {
    if (!activeQState) return null;
    return computeEffectiveTimerSnapshot(activeQState, syncedNowMs);
  }, [activeQState, syncedNowMs]);

  const slotKey = selectedCategory && selectedQuestion ? `${selectedCategory.id}:${selectedQuestion.id}` : '';
  const isSlotOccupied = Boolean(slotKey && session.occupiedSlots.includes(slotKey));

  const currentPhase = timerSnapshot?.phase || activeQState?.phase || 'first';
  const isResolved = currentPhase === 'resolved' || isSlotOccupied;
  const isExpired = currentPhase === 'expired';
  const isQuestionLocked = isResolved || isExpired;

  const primaryTeam =
    session.teams.find((t) => t.id === (activeQState?.primaryTeamId || boardTurnTeam?.id)) || boardTurnTeam;
  const secondaryTeam =
    session.teams.find(
      (t) => t.id === (activeQState?.secondaryTeamId || '') && t.id !== primaryTeam?.id
    ) ||
    session.teams.find((t) => t.id !== primaryTeam?.id) ||
    primaryTeam;

  const answeringTeam =
    currentPhase === 'second' || currentPhase === 'expired'
      ? secondaryTeam
      : session.teams.find((t) => t.id === (timerSnapshot?.answeringTeamId || activeQState?.answeringTeamId)) ||
        primaryTeam;

  const phaseTotalSec =
    currentPhase === 'second'
      ? activeQState?.phase2DurationSec || 30
      : activeQState?.phase1DurationSec || 60;

  const timeLeft = timerSnapshot ? timerSnapshot.remainingSec : phaseTotalSec;
  const timerPct =
    isExpired || isResolved
      ? 0
      : Math.max(0, Math.min(100, (timeLeft / Math.max(1, phaseTotalSec)) * 100));

  // Categories chosen by the participating teams
  const boardCategories = useMemo(() => {
    const pickedIds = Array.from(new Set(session.teams.flatMap((t) => t.selectedCategories || [])));
    if (pickedIds.length === 0) return session.categories;
    return pickedIds
      .map((id) => session.categories.find((c) => c.id === id))
      .filter((c): c is Category => Boolean(c));
  }, [session.teams, session.categories]);

  const computeQuestionPoints = (q: Question): number => {
    if (typeof q.points === 'number' && q.points > 0) return q.points;
    const diff: QuestionDifficulty = q.difficulty || 'medium';
    if (diff === 'easy') return scoringSettings.easyPoints;
    if (diff === 'hard') return scoringSettings.hardPoints;
    if (diff === 'expert') return scoringSettings.expertPoints;
    return scoringSettings.mediumPoints;
  };

  const getSlotQuestions = (cat: Category): Question[] => {
    const approved = (cat.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved');
    const diffRank: Record<string, number> = { easy: 1, medium: 2, hard: 3, expert: 4 };
    return [...approved].sort(
      (a, b) =>
        (diffRank[a.difficulty || 'medium'] || 2) - (diffRank[b.difficulty || 'medium'] || 2) ||
        computeQuestionPoints(a) - computeQuestionPoints(b)
    );
  };

  const totalAnsweredCount = session.occupiedSlots.length;
  const maxBoardQuestions = boardCategories.reduce((sum, c) => sum + getSlotQuestions(c).length, 0);
  const remainingBoardQuestions = boardCategories.reduce(
    (sum, c) =>
      sum + getSlotQuestions(c).filter((q) => !session.occupiedSlots.includes(`${c.id}:${q.id}`)).length,
    0
  );
  const allBoardCompleted = maxBoardQuestions > 0 && remainingBoardQuestions === 0;
  const targetRoundLimit =
    scoringSettings.questionsPerRound > 0
      ? Math.min(maxBoardQuestions, scoringSettings.questionsPerRound * Math.max(1, session.teams.length))
      : maxBoardQuestions;

  const spectatorUrl =
    typeof window !== 'undefined' && sessionId
      ? `${window.location.origin}/?session=${encodeURIComponent(sessionId)}&mode=contestant`
      : '';

  const effectiveOptions = useMemo(() => {
    if (!selectedQuestion) return [];
    if (selectedQuestion.options && selectedQuestion.options.length > 0) {
      return selectedQuestion.options;
    }
    if (selectedQuestion.questionType === 'true_false') {
      return ['صح', 'خطأ'];
    }
    return [];
  }, [selectedQuestion]);

  const normalizeArabic = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[أإآا]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي');

  const handleTogglePause = () => {
    if (!activeQState || isQuestionLocked || answerRevealed) return;
    const now = timeSyncService.getSyncedNowMs();
    if (activeQState.isPaused) {
      const rem = Math.max(1000, activeQState.pausedRemainingMs || phaseTotalSec * 1000);
      onUpdateActiveQuestionState({
        ...activeQState,
        isPaused: false,
        pausedRemainingMs: null,
        phaseEndsAtServerMs: now + rem,
      });
    } else {
      const rem = Math.max(0, activeQState.phaseEndsAtServerMs - now);
      onUpdateActiveQuestionState({
        ...activeQState,
        isPaused: true,
        pausedRemainingMs: rem,
      });
    }
  };

  const handleConfirmOption = async () => {
    if (
      !selectedOption ||
      !selectedQuestion ||
      !selectedCategory ||
      !activeQState ||
      isQuestionLocked ||
      submittingRef.current
    ) {
      return;
    }

    // Strict check: only the team owning the active phase can submit once
    if (currentPhase === 'first' && activeQState.phase1Attempted) return;
    if (currentPhase === 'second' && activeQState.phase2Attempted) return;

    submittingRef.current = true;
    const isMatch = normalizeArabic(selectedOption) === normalizeArabic(selectedQuestion.answer);

    try {
      if (isMatch) {
        // Correct answer -> immediately stop timer, reveal, lock & score ONCE
        setAnswerRevealed(true);
        setStatusFeedback(
          `إجابة صحيحة! تم إيقاف المؤقت واعتماد النقاط لـ ${answeringTeam.name}.`
        );
        await onJudgeQuestion({
          categoryId: selectedCategory.id,
          questionId: selectedQuestion.id,
          outcome: 'correct',
          targetTeamId: answeringTeam.id,
          stayOnReveal: true,
        });
        return;
      }

      // Wrong answer
      if (currentPhase === 'first' && secondaryTeam && secondaryTeam.id !== primaryTeam.id) {
        setSelectedOption(null);
        setStatusFeedback(
          `إجابة خاطئة من ${primaryTeam.name}! انتقل السؤال إلى ${secondaryTeam.name} لمدة 30 ثانية.`
        );
        await onRecordWrongAttempt({
          categoryId: selectedCategory.id,
          questionId: selectedQuestion.id,
          teamId: primaryTeam.id,
          phase: 'first',
        });
      } else {
        setAnswerRevealed(true);
        setStatusFeedback(`إجابة خاطئة من ${answeringTeam.name}! تم إغلاق السؤال.`);
        await onJudgeQuestion({
          categoryId: selectedCategory.id,
          questionId: selectedQuestion.id,
          outcome: 'wrong',
          targetTeamId: answeringTeam.id,
          stayOnReveal: true,
        });
      }
    } finally {
      if (currentPhase === 'first' && !isMatch) {
        submittingRef.current = false;
      }
    }
  };

  const handleHostJudge = async (outcome: 'correct' | 'wrong' | 'skip') => {
    if (!selectedCategory || !selectedQuestion || isQuestionLocked || submittingRef.current) return;
    submittingRef.current = true;

    try {
      if (outcome === 'wrong' && currentPhase === 'first' && secondaryTeam && secondaryTeam.id !== primaryTeam.id) {
        setSelectedOption(null);
        setStatusFeedback(
          `إجابة خاطئة من ${primaryTeam.name}! انتقل السؤال إلى ${secondaryTeam.name} لمدة 30 ثانية.`
        );
        await onRecordWrongAttempt({
          categoryId: selectedCategory.id,
          questionId: selectedQuestion.id,
          teamId: primaryTeam.id,
          phase: 'first',
        });
        submittingRef.current = false;
        return;
      }

      if (outcome === 'correct') {
        setAnswerRevealed(true);
      }

      await onJudgeQuestion({
        categoryId: selectedCategory.id,
        questionId: selectedQuestion.id,
        outcome,
        targetTeamId: answeringTeam.id,
      });
    } catch {
      submittingRef.current = false;
    }
  };

  const handleRequestHint = async () => {
    if (!selectedQuestion || loadingHint || hintText) return;
    setLoadingHint(true);
    playSound?.('click');
    const h = await aiService.generateHint(
      selectedQuestion.text,
      selectedQuestion.answer,
      selectedQuestion.originalExcerpt
    );
    setHintText(h);
    setLoadingHint(false);
  };

  const handleCopySpectator = async () => {
    if (!spectatorUrl) return;
    try {
      await navigator.clipboard.writeText(spectatorUrl);
      setCopiedSpectatorLink(true);
      playSound?.('click');
      setTimeout(() => setCopiedSpectatorLink(false), 2500);
    } catch {}
  };

  // Host keyboard shortcuts (Space: pause/resume, 1-4: pick option, Enter: confirm option, Escape: back to board)
  useEffect(() => {
    if (!selectedQuestion || !selectedCategory) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' && !isQuestionLocked && !answerRevealed) {
        e.preventDefault();
        handleTogglePause();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        playSound?.('click');
        onBackToBoard();
      } else if (!answerRevealed && !isQuestionLocked && effectiveOptions.length > 0) {
        const idx = Number(e.key) - 1;
        if (idx >= 0 && idx < effectiveOptions.length && /^[1-4]$/.test(e.key)) {
          e.preventDefault();
          playSound?.('click');
          setSelectedOption(effectiveOptions[idx]);
        } else if (e.key === 'Enter' && selectedOption) {
          e.preventDefault();
          handleConfirmOption();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    selectedQuestion?.id,
    selectedCategory?.id,
    isQuestionLocked,
    answerRevealed,
    effectiveOptions,
    selectedOption,
    activeQState,
  ]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-16">
      {/* Responsive Live Scoreboard (2-team TV split OR 3-4 team balanced grid) */}
      <div
        className={
          session.teams.length <= 2
            ? 'grid grid-cols-1 md:grid-cols-12 gap-4 items-stretch'
            : 'space-y-4'
        }
      >
        <div
          className={
            session.teams.length <= 2
              ? 'contents'
              : `grid grid-cols-1 sm:grid-cols-2 ${session.teams.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-4`
          }
        >
          {session.teams.map((team) => {
            const isTurn = selectedQuestion
              ? team.id === answeringTeam?.id && !isQuestionLocked
              : team.id === boardTurnTeam?.id;
            const isLockedOut = Boolean(selectedQuestion && !isQuestionLocked && team.id !== answeringTeam?.id);
            const color = team.color || '#0B192C';

            return (
              <div
                key={team.id}
                onClick={() => {
                  if (!selectedQuestion && team.id !== boardTurnTeam?.id) {
                    playSound?.('turnSwitch');
                    onSwitchTurn(team.id);
                  }
                }}
                className={`${session.teams.length <= 2 ? 'md:col-span-5' : ''} rounded-2xl p-4 sm:p-5 border transition-all text-right ${
                  !selectedQuestion ? 'cursor-pointer' : ''
                } ${
                  isTurn
                    ? 'bg-[#0B192C] text-white border-[#C9A24D] shadow-lg ring-2 ring-[#C9A24D]/35'
                    : 'bg-white text-[#0B192C] border-[#E6DFD1]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-11 h-11 rounded-xl text-white font-display font-extrabold text-lg flex items-center justify-center shrink-0 border border-white/25"
                      style={{ backgroundColor: color }}
                    >
                      {team.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-display font-extrabold text-lg truncate">{team.name}</h2>
                        {isTurn && (
                          <span className="text-[11px] font-bold text-[#D9B768] whitespace-nowrap">
                            {selectedQuestion
                              ? `• يملك حق الإجابة (${phaseTotalSec} ث)`
                              : '• الدور الحالي'}
                          </span>
                        )}
                        {isLockedOut && (
                          <span className="text-[11px] font-bold text-slate-400 inline-flex items-center gap-1 whitespace-nowrap">
                            <Lock className="w-3 h-3" />
                            {currentPhase === 'first' ? 'ينتظر انتهاء وقت الفريق الأول' : 'انتهى وقته'}
                          </span>
                        )}
                      </div>
                      {team.participants && team.participants.length > 0 && (
                        <p className={`text-xs truncate mt-0.5 ${isTurn ? 'text-slate-300' : 'text-slate-500'}`}>
                          {team.participants.join('، ')}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-left shrink-0">
                    <div
                      className={`text-3xl font-extrabold font-mono tabular-nums ${
                        isTurn ? 'text-[#D9B768]' : 'text-[#0B192C]'
                      }`}
                    >
                      {team.score}
                    </div>
                    <div className={`text-[11px] font-semibold ${isTurn ? 'text-slate-300' : 'text-slate-500'}`}>
                      نقطة
                    </div>
                  </div>
                </div>

                <div
                  className={`mt-3 pt-2.5 border-t flex items-center justify-between text-[11px] font-semibold ${
                    isTurn ? 'border-white/10 text-slate-300' : 'border-[#E6DFD1] text-slate-600'
                  }`}
                >
                  <span>
                    صحيحة: {team.correctCount || 0} • خاطئة: {team.wrongCount || 0}
                  </span>
                  {!selectedQuestion && !isTurn && (
                    <span className="text-[#9B7729] font-bold">اضغط لنقل الدور</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Center / Bottom Stage Controls */}
        <div
          className={
            session.teams.length <= 2
              ? 'md:col-span-2 surface-card rounded-2xl p-4 flex flex-col justify-between items-center text-center gap-2'
              : 'surface-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3'
          }
        >
          <div className={session.teams.length <= 2 ? '' : 'flex items-center gap-3'}>
            <div className="text-[11px] font-bold text-slate-500">تقدم الأسئلة</div>
            <div className="text-lg font-extrabold font-mono text-[#0B192C] tabular-nums mt-0.5">
              {totalAnsweredCount} / {Math.max(totalAnsweredCount, targetRoundLimit)}
            </div>
          </div>

          <div className={session.teams.length <= 2 ? 'w-full space-y-1.5' : 'flex items-center gap-2'}>
            {sessionId && (
              <button
                type="button"
                onClick={() => {
                  playSound?.('click');
                  setShowSpectatorQr((v) => !v);
                }}
                className={`${session.teams.length <= 2 ? 'w-full' : ''} py-1.5 px-3 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[#0B192C] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer`}
              >
                <QrCode className="w-3.5 h-3.5 text-[#9B7729]" />
                <span>مشاركة الجمهور</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                playSound?.('victory');
                onFinishCompetition();
              }}
              className={`${session.teams.length <= 2 ? 'w-full' : ''} py-1.5 px-3 rounded-lg bg-[#0B192C] hover:bg-[#13253E] text-[#D9B768] text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer`}
            >
              <Flag className="w-3.5 h-3.5" />
              <span>إنهاء وإعلان النتيجة</span>
            </button>
          </div>
        </div>
      </div>

      {/* Optional Spectator QR Box */}
      {showSpectatorQr && sessionId && (
        <div className="surface-card rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-right">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-white border border-[#E6DFD1] rounded-xl shrink-0">
              <QRCodeSVG value={spectatorUrl} size={88} />
            </div>
            <div>
              <h3 className="font-display font-bold text-base text-[#0B192C]">شاشة متابعة وتفاعل الجمهور</h3>
              <p className="text-xs text-slate-600 mt-1">
                امسح الرمز أو شارك الرابط لمتابعة النتائج مباشرة وإرسال التفاعلات التشجيعية للفرق.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopySpectator}
              className="px-4 py-2 bg-[#0B192C] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
            >
              {copiedSpectatorLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSpectatorLink ? 'تم نسخ الرابط' : 'نسخ رابط المتابعة'}</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN AREA: Either Question TV Stage OR Category Board */}
      {selectedQuestion && selectedCategory ? (
        <div className="bg-[#0B192C] text-[#FAF7F2] rounded-3xl border border-[#C9A24D]/40 shadow-2xl overflow-hidden">
          {/* TV Stage Header */}
          <div className="px-6 py-4 bg-[#07111E] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-right">
              <button
                type="button"
                onClick={() => {
                  playSound?.('click');
                  onBackToBoard();
                }}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>اللوحة</span>
              </button>
              <div>
                <div className="text-xs text-[#D9B768] font-bold">
                  {selectedCategory.name} • {QUESTION_TYPE_LABELS[selectedQuestion.questionType || 'multiple_choice']} •{' '}
                  {DIFFICULTY_LABELS[selectedQuestion.difficulty || 'medium']}
                </div>
                <div className="text-xs text-slate-200 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>صاحب حق الإجابة حالياً:</span>
                  <strong className="text-[#D9B768] font-display text-sm">{answeringTeam?.name}</strong>
                  <span className="text-slate-400">
                    ({currentPhase === 'first' ? 'المدة: 60 ثانية' : currentPhase === 'second' ? 'المدة: 30 ثانية' : isExpired ? 'انتهى الوقت' : 'تم الحسم'})
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="px-3.5 py-1.5 rounded-xl bg-[#13253E] border border-[#C9A24D]/50 text-[#D9B768] font-bold text-sm tabular-nums">
                {computeQuestionPoints(selectedQuestion)} نقطة
              </div>

              {/* Authoritative Synchronized Countdown Readout */}
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
                  isExpired
                    ? 'bg-rose-950/80 border-rose-500/60'
                    : timeLeft <= 10 && !isResolved
                      ? 'bg-rose-950/70 border-rose-500/50'
                      : 'bg-[#13253E] border-[#C9A24D]/40'
                }`}
              >
                <Clock
                  className={`w-5 h-5 ${
                    isExpired || (timeLeft <= 10 && !isResolved) ? 'text-rose-400' : 'text-[#C9A24D]'
                  }`}
                />
                <span
                  className={`font-mono font-extrabold text-xl tabular-nums min-w-[42px] text-center ${
                    isExpired || (timeLeft <= 10 && !isResolved) ? 'text-rose-300' : 'text-white'
                  }`}
                >
                  {isResolved ? '✓' : timeLeft}
                </span>
                <span className="text-[11px] font-bold text-slate-300">
                  {isResolved ? 'توقف' : `/ ${phaseTotalSec} ث`}
                </span>
                {!isQuestionLocked && !answerRevealed && (
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="p-1 text-slate-300 hover:text-white cursor-pointer border-r border-white/15 pr-2"
                    title={activeQState?.isPaused ? 'استئناف المؤقت' : 'إيقاف مؤقت'}
                  >
                    {activeQState?.isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Visual Turn Transfer Indicator & Two-Phase Timeline */}
          <div className="px-6 py-3 bg-[#0E1E34] border-b border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Phase 1 Pill */}
              <div
                className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 ${
                  currentPhase === 'first'
                    ? 'bg-[#C9A24D] text-[#0B192C] border-[#D9B768]'
                    : 'bg-white/5 text-slate-400 border-white/10 line-through'
                }`}
              >
                <Timer className="w-3.5 h-3.5" />
                <span>١. {primaryTeam?.name} (60 ثانية)</span>
              </div>

              <ArrowLeft className="w-4 h-4 text-[#C9A24D] shrink-0" />

              {/* Phase 2 Pill */}
              <div
                className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 ${
                  currentPhase === 'second'
                    ? 'bg-[#C9A24D] text-[#0B192C] border-[#D9B768] shadow'
                    : currentPhase === 'expired'
                      ? 'bg-rose-950/60 text-rose-300 border-rose-500/40'
                      : 'bg-white/5 text-slate-400 border-white/10'
                }`}
              >
                <Timer className="w-3.5 h-3.5" />
                <span>٢. {secondaryTeam?.name} (30 ثانية)</span>
              </div>
            </div>

            <div className="text-slate-300 font-semibold">
              {currentPhase === 'first' && (
                <span>
                  الدور للفريق الأول في السؤال (<strong className="text-white">{primaryTeam?.name}</strong>)
                </span>
              )}
              {currentPhase === 'second' && (
                <span className="text-[#D9B768] font-bold">
                  انتقل الدور إلى {secondaryTeam?.name} — المتبقي {timeLeft} ثانية
                </span>
              )}
              {isExpired && <span className="text-rose-300 font-bold">انتهى وقت الإجابة لكلا الفريقين</span>}
              {isResolved && !isExpired && (
                <span className="text-emerald-300 font-bold">تم حسم السؤال وإيقاف العداد</span>
              )}
            </div>
          </div>

          {/* Timer Progress Line */}
          <div className="h-2 w-full bg-[#13253E]">
            <div
              className="h-full transition-all duration-200 ease-linear"
              style={{
                width: `${timerPct}%`,
                backgroundColor: timeLeft <= 10 || isExpired ? '#B91C1C' : '#C9A24D',
              }}
            />
          </div>

          {/* Transfer & Timeout Clear Alert Banners */}
          {currentPhase === 'second' && !isQuestionLocked && (
            <div className="mx-6 mt-6 p-4 rounded-2xl bg-[#C9A24D]/15 border border-[#C9A24D]/50 text-right flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-[#D9B768] shrink-0" />
              <div>
                <div className="font-display font-extrabold text-sm sm:text-base text-[#D9B768]">
                  {activeQState?.transferReason === 'wrong'
                    ? 'إجابة خاطئة! انتقل السؤال إلى الفريق الثاني'
                    : 'انتهى الوقت! انتقل السؤال إلى الفريق الثاني'}
                </div>
                <div className="text-xs text-slate-200 mt-0.5">
                  يملك <strong className="text-white">{secondaryTeam?.name}</strong> حق الإجابة على نفس السؤال الآن خلال 30 ثانية (يُمنع {primaryTeam?.name} من الإجابة).
                </div>
              </div>
            </div>
          )}

          {isExpired && (
            <div className="mx-6 mt-6 p-4 rounded-2xl bg-rose-950/70 border border-rose-500/50 text-right flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <XCircle className="w-6 h-6 text-rose-400 shrink-0" />
                <div>
                  <div className="font-display font-extrabold text-base text-rose-200">انتهى وقت الإجابة</div>
                  <div className="text-xs text-rose-100/80 mt-0.5">
                    انتهت مهلة الـ 30 ثانية دون إجابة صحيحة. سيتم إغلاق السؤال والانتقال للوحة تلقائياً.
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={onBackToBoard}
                className="px-4 py-2 rounded-xl bg-white/15 hover:bg-white/20 text-white text-xs font-bold cursor-pointer"
              >
                العودة للوحة الآن
              </button>
            </div>
          )}

          {statusFeedback && !isExpired && (
            <div
              className={`mx-6 mt-6 p-4 rounded-2xl border text-right text-xs sm:text-sm font-bold flex flex-wrap items-center justify-between gap-3 ${
                isResolved
                  ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                  : 'bg-white/10 border-white/15 text-[#D9B768]'
              }`}
            >
              <span>{statusFeedback}</span>
              {isResolved && (
                <button
                  type="button"
                  onClick={onBackToBoard}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                >
                  العودة للوحة الأسئلة
                </button>
              )}
            </div>
          )}

          {/* TV Question Body */}
          <div className="p-6 sm:p-10 space-y-8 text-right">
            {selectedQuestion.letter && (
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-xl bg-[#13253E] border border-[#C9A24D]/40 text-sm font-bold text-[#D9B768]">
                <span>الحرف المعتمد:</span>
                <span className="text-xl text-white font-display">{selectedQuestion.letter}</span>
              </div>
            )}

            <h2 className="font-display font-extrabold text-2xl sm:text-4xl text-white leading-relaxed">
              {selectedQuestion.text}
            </h2>

            {selectedQuestion.imageUrl && (
              <div className="max-w-lg rounded-2xl overflow-hidden border border-white/15 bg-[#07111E]">
                <img
                  src={selectedQuestion.imageUrl}
                  alt="وسائط السؤال"
                  className="w-full max-h-64 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            {selectedQuestion.videoUrl &&
              areVideoClipsApproved(selectedQuestion.videoClips, selectedQuestion.clipApproved) &&
              selectedQuestion.videoClips && (
                <div className="max-w-3xl">
                  <BoundedVideoClipPlayer
                    videoUrl={selectedQuestion.videoUrl}
                    clips={selectedQuestion.videoClips}
                    sourceName={selectedQuestion.videoSourceName || selectedQuestion.sourceName}
                    answerRevealed={answerRevealed}
                  />
                </div>
              )}

            {/* Interactive Options (if MCQ or True/False) */}
            {effectiveOptions.length > 0 && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {effectiveOptions.map((opt, idx) => {
                    const isPicked = selectedOption === opt;
                    const isCorrectOpt = normalizeArabic(opt) === normalizeArabic(selectedQuestion.answer);
                    let styleClass =
                      'bg-[#13253E] border-white/15 text-white hover:border-[#C9A24D]/70';

                    if (answerRevealed) {
                      if (isCorrectOpt) {
                        styleClass = 'bg-emerald-900/70 border-emerald-400 text-white';
                      } else if (isPicked && !isCorrectOpt) {
                        styleClass = 'bg-rose-900/70 border-rose-400 text-rose-100';
                      } else {
                        styleClass = 'bg-[#13253E]/50 border-white/10 text-slate-400';
                      }
                    } else if (isPicked) {
                      styleClass = 'bg-[#C9A24D] border-[#D9B768] text-[#0B192C] font-extrabold';
                    }

                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={answerRevealed || isQuestionLocked}
                        onClick={() => {
                          playSound?.('click');
                          setSelectedOption(opt);
                        }}
                        className={`p-4 rounded-2xl border text-right font-bold text-base sm:text-lg transition-all flex items-center gap-3 ${
                          answerRevealed || isQuestionLocked ? 'cursor-not-allowed' : 'cursor-pointer'
                        } ${styleClass}`}
                      >
                        <span className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center font-mono text-sm shrink-0">
                          {idx + 1}
                        </span>
                        <span className="flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>

                {!answerRevealed && !isQuestionLocked && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={!selectedOption || isQuestionLocked}
                      onClick={handleConfirmOption}
                      className="px-7 py-3 bg-[#C9A24D] hover:bg-[#D9B768] disabled:opacity-40 disabled:cursor-not-allowed text-[#0B192C] font-display font-extrabold text-sm rounded-xl cursor-pointer transition-colors"
                    >
                      اعتماد الإجابة لـ {answeringTeam?.name}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Smart Hint Area */}
            <div className="flex flex-wrap items-center gap-3">
              {!hintText && !answerRevealed && !isQuestionLocked && (
                <button
                  type="button"
                  onClick={handleRequestHint}
                  disabled={loadingHint}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#D9B768] text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  {loadingHint ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />}
                  <span>عرض تلميح علمي</span>
                </button>
              )}

              {!answerRevealed && (
                <button
                  type="button"
                  onClick={() => {
                    playSound?.('reveal');
                    setAnswerRevealed(true);
                    if (activeQState && !isQuestionLocked) {
                      onUpdateActiveQuestionState({
                        ...activeQState,
                        isPaused: true,
                        pausedRemainingMs: Math.max(0, activeQState.phaseEndsAtServerMs - timeSyncService.getSyncedNowMs()),
                      });
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-[#C9A24D]" />
                  <span>كشف الإجابة والمصدر</span>
                </button>
              )}
            </div>

            {hintText && (
              <div className="p-4 rounded-2xl bg-[#13253E] border border-[#C9A24D]/40 text-sm text-[#FAF7F2] flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-[#C9A24D] shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold text-[#D9B768] block mb-0.5">تلميح موجه:</span>
                  <span>{hintText}</span>
                </div>
              </div>
            )}

            {/* Answer Reveal & Shia Source Attribution */}
            {answerRevealed && (
              <div className="p-6 rounded-2xl bg-[#07111E] border border-emerald-500/40 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <span className="text-xs font-bold text-emerald-400">الإجابة الصحيحة المعتمدة</span>
                    <h3 className="font-display font-extrabold text-2xl sm:text-3xl text-white mt-1">
                      {selectedQuestion.answer}
                    </h3>
                  </div>
                </div>

                {/* Source Documentation Box */}
                <div className="pt-3 border-t border-white/10 space-y-2 text-xs text-slate-300">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-bold text-[#D9B768]">
                      <BookOpen className="w-4 h-4" />
                      <span>
                        المصدر: {selectedQuestion.sourceName || selectedQuestion.source || 'المصادر الشيعية المعتمدة'}
                        {selectedQuestion.volumePageOrHadith ? ` — (${selectedQuestion.volumePageOrHadith})` : ''}
                      </span>
                    </div>

                    {selectedQuestion.sourceUrl && selectedQuestion.sourceUrl.startsWith('http') && (
                      <a
                        href={selectedQuestion.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-emerald-300 hover:underline font-semibold"
                      >
                        <span>رابط المرجع</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>

                  {selectedQuestion.originalExcerpt && (
                    <p className="p-3 rounded-xl bg-[#13253E]/70 border border-white/10 text-slate-200 leading-relaxed">
                      «{selectedQuestion.originalExcerpt}»
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Host Judging Controls (locked to the exact team owning the current phase) */}
            <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
              {isQuestionLocked ? (
                <button
                  type="button"
                  onClick={onBackToBoard}
                  className="px-6 py-3 bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-display font-extrabold text-sm rounded-xl flex items-center gap-2 cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>الانتقال إلى السؤال التالي على اللوحة</span>
                </button>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      disabled={isQuestionLocked}
                      onClick={() => handleHostJudge('correct')}
                      className="px-5 py-3 bg-[#0F766E] hover:bg-[#0D5F59] disabled:opacity-45 text-white font-bold text-sm rounded-xl flex items-center gap-2 cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>إجابة صحيحة لـ {answeringTeam.name}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isQuestionLocked}
                      onClick={() => handleHostJudge('wrong')}
                      className="px-5 py-3 bg-[#B91C1C] hover:bg-[#991B1B] disabled:opacity-45 text-white font-bold text-sm rounded-xl flex items-center gap-2 cursor-pointer"
                    >
                      <XCircle className="w-4 h-4" />
                      <span>
                        {currentPhase === 'first'
                          ? `إجابة خاطئة من ${primaryTeam.name} (نقل للثاني)`
                          : `إجابة خاطئة من ${secondaryTeam.name}`}
                      </span>
                    </button>
                  </div>

                  <button
                    type="button"
                    disabled={isQuestionLocked}
                    onClick={() => handleHostJudge('skip')}
                    className="px-4 py-3 bg-white/10 hover:bg-white/15 disabled:opacity-45 text-slate-200 font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer"
                  >
                    <SkipForward className="w-4 h-4" />
                    <span>تخطي وإغلاق السؤال</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Category & Question Slots Board */
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2 text-right">
            <div>
              <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">لوحة جولات المسابقة</h2>
              <p className="text-xs text-slate-600 mt-0.5">
                الدور الحالي لـ <strong className="text-[#9B7729]">{boardTurnTeam?.name}</strong> — 60 ثانية للفريق الأول، وإذا لم يجب ينتقل السؤال للثاني 30 ثانية
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                playSound?.('click');
                onReturnHome();
              }}
              className="px-3.5 py-2 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-xs font-bold text-[#0B192C] rounded-xl cursor-pointer"
            >
              حفظ والعودة للرئيسية
            </button>
          </div>

          {allBoardCompleted && (
            <div className="p-6 rounded-3xl bg-[#0B192C] text-white border-2 border-[#C9A24D] shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4 text-right">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#C9A24D]/20 border border-[#C9A24D] text-[#D9B768] flex items-center justify-center shrink-0">
                  <Flag className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-xl text-white">اكتملت جميع أسئلة اللوحة بنجاح!</h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    تمت الإجابة على كافة الأسئلة المعتمدة في الأقسام المختارة. انتقل الآن إلى منصة التتويج وإصدار الشهادات.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  playSound?.('victory');
                  onFinishCompetition();
                }}
                className="px-6 py-3 bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-display font-extrabold text-sm rounded-xl flex items-center gap-2 cursor-pointer shrink-0"
              >
                <Sparkles className="w-4 h-4" />
                <span>عرض النتائج ومنصة التتويج</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {boardCategories.map((cat) => {
              const slots = getSlotQuestions(cat);
              const remaining = slots.filter((q) => !session.occupiedSlots.includes(`${cat.id}:${q.id}`)).length;
              const ownerTeam = session.teams.find((t) => (t.selectedCategories || []).includes(cat.id));

              return (
                <div key={cat.id} className="surface-card rounded-2xl p-5 space-y-4 text-right">
                  <div className="flex items-center justify-between gap-2 border-b border-[#E6DFD1] pb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-9 h-9 rounded-xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center shrink-0">
                        <BrandIcon name={cat.iconUrl} className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-base text-[#0B192C] truncate">{cat.name}</h3>
                        <span className="text-[11px] text-slate-500">
                          {ownerTeam ? `اختيار: ${ownerTeam.name}` : cat.group || 'عام'}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-[#9B7729] tabular-nums shrink-0">
                      متبقي {remaining}
                    </span>
                  </div>

                  {slots.length === 0 ? (
                    <p className="text-xs text-slate-400 py-4 text-center">لا توجد أسئلة معتمدة في هذا القسم.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 max-h-[340px] overflow-y-auto custom-scrollbar pr-0.5">
                      {slots.map((q, qIdx) => {
                        const slotKey = `${cat.id}:${q.id}`;
                        const used = session.occupiedSlots.includes(slotKey);
                        const pts = computeQuestionPoints(q);
                        return (
                          <button
                            key={q.id}
                            type="button"
                            disabled={used}
                            onClick={() => {
                              playSound?.('click');
                              onSelectQuestion(cat.id, q.id);
                            }}
                            className={`py-3 px-2 rounded-xl border text-center transition-all ${
                              used
                                ? 'bg-[#F3EFE6] border-[#E6DFD1] text-slate-400 line-through cursor-not-allowed'
                                : 'bg-[#FAF7F2] hover:bg-[#0B192C] hover:text-white border-[#E6DFD1] hover:border-[#C9A24D] text-[#0B192C] cursor-pointer shadow-xs'
                            }`}
                          >
                            <div className="font-mono font-extrabold text-base tabular-nums">{pts}</div>
                            <div className="text-[10px] opacity-75">سؤال {qIdx + 1}</div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spectator Reactions Bar (if spectators sent reactions) */}
      {reactions.length > 0 && (
        <div className="surface-card rounded-2xl p-4 space-y-2 text-right">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0B192C]">
            <Users className="w-4 h-4 text-[#9B7729]" />
            <span>تفاعلات الجمهور المباشرة</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {reactions.slice(-6).map((r, i) => (
              <div
                key={r.id || i}
                className="px-3 py-1.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold text-[#0B192C] flex items-center gap-1.5"
              >
                {r.emoji && <span>{r.emoji}</span>}
                {r.senderName && <strong className="text-[#9B7729]">{r.senderName}:</strong>}
                {r.comment && <span>{r.comment}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GameStageView;
