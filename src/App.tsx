/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { dataService, DBAppSettings, DBGameSession, DBGroup } from './lib/dataService';
import {
  ActiveQuestionTimerState,
  ApprovedSource,
  AuthSessionUser,
  Category,
  CompetitionConfig,
  GameSession,
  Question,
  ScoringSettings,
  Team,
} from './types';
import {
  DEFAULT_COMPETITION_CONFIG,
  DEFAULT_COMPETITION_NAME,
  DEFAULT_COMPETITION_SLOGAN,
  DEFAULT_SCORING_SETTINGS,
  INITIAL_APPROVED_SOURCES,
  INITIAL_CATEGORIES,
} from './constants';
import { authService } from './services/authService';
import {
  DEFAULT_SOUND_VOLUMES,
  getSoundCategory,
  loadLocalSoundVolumes,
  normalizeSoundVolumes,
  saveLocalSoundVolumes,
  SOUND_VOLUMES_STORAGE_KEY,
  SoundCategory,
  SoundEffectType,
  soundService,
  SoundVolumes,
} from './services/soundService';
import { timeSyncService } from './services/timeSyncService';
import {
  appendLogoCacheBuster,
  isValidCustomLogoUrl,
  syncDynamicPwaBranding,
} from './services/pwaBrandingService';
import SiteHeader from './components/ui/SiteHeader';
import HomeView from './components/game/HomeView';
import SetupView from './components/game/SetupView';
import SelectionView from './components/game/SelectionView';
import GameStageView from './components/game/GameStageView';
import ResultsView from './components/game/ResultsView';
import PublicSettingsModal from './components/game/PublicSettingsModal';
import AdminAuthModal from './components/AdminAuthModal';
import { Heart, Loader2, Send, Trophy, Users } from 'lucide-react';
import { BRAND_ASSETS } from './lib/assets';

const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const StatisticsDashboard = lazy(() => import('./components/StatisticsDashboard'));
const RecentCompetitions = lazy(() => import('./components/RecentCompetitions'));

const ACTIVE_SESSION_STORAGE_KEY = 'abf_active_session_v2';
const ACTIVE_SESSION_ID_KEY = 'abf_active_session_id_v2';

function createInitialTeams(teamCount: number): Team[] {
  const palette = ['#0B192C', '#9B7729', '#0F766E', '#991B1B'];
  const count = Math.max(2, Math.min(4, teamCount || 2));
  return Array.from({ length: count }).map((_, i) => ({
    id: `team-${i + 1}`,
    name: i === 0 ? 'الفريق الأول' : i === 1 ? 'الفريق الثاني' : `الفريق ${i + 1}`,
    score: 0,
    selectedCategories: [],
    color: palette[i % palette.length],
    participants: [],
    correctCount: 0,
    wrongCount: 0,
    skippedCount: 0,
  }));
}

export default function App() {
  // Navigation & Overlays
  const [viewMode, setViewMode] = useState<'game' | 'admin' | 'stats' | 'recent'>('game');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showPublicSettings, setShowPublicSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Custom Username/Password + WebAuthn Auth State (in-memory session)
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(() => authService.getCurrentUser());
  const isAdmin = Boolean(authUser);
  const isOwner = authUser?.role === 'super_admin';

  // Firestore Live Data
  const [dbConnected, setDbConnected] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [categories, setCategories] = useState<Category[]>(INITIAL_CATEGORIES);
  const [groups, setGroups] = useState<DBGroup[]>([]);
  const [sources, setSources] = useState<ApprovedSource[]>([]);
  const [appSettings, setAppSettings] = useState<DBAppSettings>({});
  const [completedSessionsCount, setCompletedSessionsCount] = useState(0);

  // Runtime Preferences
  const [enableSounds, setEnableSounds] = useState(true);
  const [enableVisuals, setEnableVisuals] = useState(true);
  const [soundVolumes, setSoundVolumes] = useState<SoundVolumes>(
    () => loadLocalSoundVolumes() || DEFAULT_SOUND_VOLUMES
  );
  const hasLocalVolumeOverrideRef = useRef<boolean>(loadLocalSoundVolumes() !== null);

  // Game Session State (persisted safely in localStorage & Firestore)
  const [sessionId, setSessionId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(ACTIVE_SESSION_ID_KEY);
    } catch {
      return null;
    }
  });
  const [gameStartTimestamp, setGameStartTimestamp] = useState<number>(Date.now());
  const [gameDuration, setGameDuration] = useState<number>(0);

  const [session, setSession] = useState<GameSession>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.teams)) {
          return {
            ...parsed,
            categories: parsed.categories?.length ? parsed.categories : INITIAL_CATEGORIES,
            reservedCategoryMap: parsed.reservedCategoryMap || {},
            lockedTeamIds: parsed.lockedTeamIds || [],
          };
        }
      }
    } catch {}
    return {
      teams: createInitialTeams(2),
      categories: INITIAL_CATEGORIES,
      currentTurn: 'team-1',
      selectedCategoryId: null,
      selectedQuestionId: null,
      status: 'welcome',
      occupiedSlots: [],
      reservedCategoryMap: {},
      lockedTeamIds: [],
      activeQuestionState: null,
      answeredHistory: [],
    };
  });

  // Spectator QR Mode (?session=...&mode=contestant)
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const contestantSessionId = urlParams.get('mode') === 'contestant' ? urlParams.get('session') : null;
  const [spectatorSession, setSpectatorSession] = useState<DBGameSession | null>(null);
  const [reactions, setReactions] = useState<any[]>([]);
  const [spectatorName, setSpectatorName] = useState('');
  const [spectatorMsg, setSpectatorMsg] = useState('');

  const seedingDoneRef = useRef(false);

  const scoringSettings: ScoringSettings = useMemo(
    () => ({ ...DEFAULT_SCORING_SETTINGS, ...(appSettings.scoring || {}) }),
    [appSettings.scoring]
  );

  const competitionConfig: CompetitionConfig = useMemo(
    () => ({
      ...DEFAULT_COMPETITION_CONFIG,
      ...(appSettings.competitionConfig || {}),
      timerDuration: appSettings.competitionConfig?.timerDuration || appSettings.timerDuration || 60,
    }),
    [appSettings]
  );

  const competitionName = appSettings.competitionName || DEFAULT_COMPETITION_NAME;
  const competitionSlogan = appSettings.competitionSlogan || DEFAULT_COMPETITION_SLOGAN;
  const resolvedAppLogoUrl = useMemo(() => {
    if (!isValidCustomLogoUrl(appSettings.logoUrl)) return undefined;
    return appendLogoCacheBuster(appSettings.logoUrl!, appSettings.logoUpdatedAt);
  }, [appSettings.logoUrl, appSettings.logoUpdatedAt]);

  // Dynamically update Web App Manifest, Favicon, Apple Touch Icon, and SW cache whenever settings change
  useEffect(() => {
    syncDynamicPwaBranding({
      logoUrl: appSettings.logoUrl,
      logoUpdatedAt: appSettings.logoUpdatedAt,
      competitionName,
      competitionSlogan,
    }).catch(() => {});
  }, [appSettings.logoUrl, appSettings.logoUpdatedAt, competitionName, competitionSlogan]);

  // Sound helper using soundService (supports per-category volume control, custom URLs, and Web Audio synth)
  const getCustomSoundUrl = useCallback(
    (type: SoundEffectType): string | undefined => {
      const urlMap: Partial<Record<SoundEffectType, string | undefined>> = {
        correct: appSettings.correctSoundUrl,
        wrong: appSettings.wrongSoundUrl,
        victory: appSettings.victorySoundUrl,
        intro: appSettings.introSoundUrl,
        click: appSettings.clickSoundUrl,
        tick: appSettings.beepSoundUrl,
        turnTransfer: appSettings.turnTransferSoundUrl,
        turnSwitch: appSettings.turnSwitchSoundUrl,
        timeout: appSettings.timeoutSoundUrl,
      };
      return urlMap[type];
    },
    [appSettings]
  );

  const playSound = useCallback(
    (type: SoundEffectType) => {
      if (!enableSounds) return;
      const category = getSoundCategory(type);
      const categoryVol = soundVolumes[category] ?? DEFAULT_SOUND_VOLUMES[category];
      if (categoryVol <= 0.001) return;
      soundService.play(type, {
        enabled: enableSounds,
        customUrl: getCustomSoundUrl(type),
        volume: categoryVol,
      });
    },
    [enableSounds, soundVolumes, getCustomSoundUrl]
  );

  const handlePreviewSound = useCallback(
    (type: SoundEffectType, overrideVolume?: number) => {
      const category = getSoundCategory(type);
      const vol = overrideVolume ?? soundVolumes[category] ?? DEFAULT_SOUND_VOLUMES[category];
      soundService.play(type, {
        enabled: true,
        customUrl: getCustomSoundUrl(type),
        volume: vol,
      });
    },
    [soundVolumes, getCustomSoundUrl]
  );

  const handleChangeSoundVolume = useCallback((category: SoundCategory, volume: number) => {
    hasLocalVolumeOverrideRef.current = true;
    setSoundVolumes((prev) => {
      const next = normalizeSoundVolumes({ ...prev, [category]: volume });
      saveLocalSoundVolumes(next);
      return next;
    });
  }, []);

  const handleResetSoundVolumes = useCallback(() => {
    hasLocalVolumeOverrideRef.current = false;
    try {
      localStorage.removeItem(SOUND_VOLUMES_STORAGE_KEY);
    } catch {}
    setSoundVolumes(normalizeSoundVolumes(appSettings.soundVolumes));
  }, [appSettings.soundVolumes]);

  // Sync runtime preferences from saved settings
  useEffect(() => {
    if (appSettings.enableSounds !== undefined) {
      setEnableSounds(appSettings.enableSounds);
    }
    if (appSettings.competitionConfig?.enableVisualEffects !== undefined) {
      setEnableVisuals(appSettings.competitionConfig.enableVisualEffects);
    }
    if (appSettings.soundVolumes && !hasLocalVolumeOverrideRef.current) {
      setSoundVolumes(normalizeSoundVolumes(appSettings.soundVolumes));
    }
  }, [appSettings.enableSounds, appSettings.competitionConfig?.enableVisualEffects, appSettings.soundVolumes]);

  // Subscribe to custom in-memory auth session updates
  useEffect(() => {
    return authService.subscribeSession((sessionUser) => {
      setAuthUser(sessionUser);
    });
  }, []);

  // Live Firestore Subscriptions (Categories + Questions, Groups, Sources, Settings, Sessions count)
  useEffect(() => {
    let questionUnsubs: (() => void)[] = [];

    const unsubSettings = dataService.subscribeSettings(
      (s) => {
        setDbConnected('connected');
        if (s) setAppSettings(s);
      },
      () => setDbConnected('error')
    );

    const unsubGroups = dataService.subscribeGroups((g) => {
      setGroups(g);
    });

    const unsubSources = dataService.subscribeSources((srcs) => {
      setSources(srcs);
    });

    const unsubSessions = dataService.subscribeGameSessions(false, authUser?.id, (list) => {
      setCompletedSessionsCount(list.filter((s) => s.isCompleted).length);
    });

    const unsubCategories = dataService.subscribeCategories((dbCats) => {
      setDbConnected('connected');
      questionUnsubs.forEach((u) => u());
      questionUnsubs = [];

      if (dbCats.length === 0) {
        setCategories(INITIAL_CATEGORIES);
        return;
      }

      // Initialize categories map and subscribe to each category's questions
      const catStateMap: Record<string, Category> = {};
      dbCats.forEach((dc) => {
        catStateMap[dc.id] = {
          ...dc,
          questions: [],
        } as Category;
      });

      setCategories(Object.values(catStateMap));

      dbCats.forEach((dc) => {
        const uq = dataService.subscribeQuestions(dc.id, (qs) => {
          catStateMap[dc.id] = {
            ...dc,
            questions: qs.map((q) => ({ ...q, isAnswered: false })),
          } as Category;
          setCategories(Object.values(catStateMap));
        });
        questionUnsubs.push(uq);
      });
    });

    return () => {
      unsubSettings();
      unsubGroups();
      unsubSources();
      unsubSessions();
      unsubCategories();
      questionUnsubs.forEach((u) => u());
    };
  }, [authUser?.id]);

  // Seed initial categories & Shia sources safely ONCE when owner/admin signs in and collections are empty
  useEffect(() => {
    if (!isAdmin || !authUser || seedingDoneRef.current) return;
    seedingDoneRef.current = true;

    (async () => {
      try {
        const existingSources = await dataService.getSources();
        if (existingSources.length === 0) {
          await dataService.seedInitialSources(INITIAL_APPROVED_SOURCES);
        }
        const existingCats = await dataService.getCategories();
        if (existingCats.length === 0) {
          await dataService.seedInitialData(INITIAL_CATEGORIES);
        }
      } catch {}
    })();
  }, [isAdmin, authUser]);

  // Keep session categories fresh with live Firestore categories
  useEffect(() => {
    setSession((prev) => ({
      ...prev,
      categories,
    }));
  }, [categories]);

  // Persist active session in localStorage across refreshes
  useEffect(() => {
    try {
      const toStore = {
        ...session,
        categories: [], // avoid bloating localStorage with large question payloads
      };
      localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(toStore));
    } catch {}
  }, [session]);

  // Live Spectator Reactions Subscription
  useEffect(() => {
    const activeId = contestantSessionId || sessionId;
    if (!activeId) return;
    const unsubR = dataService.subscribeReactions(activeId, (reaction) => {
      setReactions((prev) => [...prev.slice(-15), reaction]);
    });
    let unsubS = () => {};
    if (contestantSessionId) {
      unsubS = dataService.subscribeSession(contestantSessionId, setSpectatorSession);
    }
    return () => {
      unsubR();
      unsubS();
    };
  }, [contestantSessionId, sessionId]);

  // Server Clock Sync & Active Cloud Session Hydration across refreshes
  useEffect(() => {
    timeSyncService.syncServerClock(true).catch(() => {});
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        timeSyncService.syncServerClock(true).catch(() => {});
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);

    if (sessionId && !contestantSessionId) {
      dataService
        .getGameSessionById(sessionId)
        .then((cloud) => {
          if (!cloud || cloud.isCompleted) return;
          setSession((prev) => {
            if (prev.status === 'welcome' && !prev.teams?.some((t) => t.selectedCategories?.length)) {
              return prev;
            }
            const mergedTeams: Team[] = (cloud.teams?.length ? cloud.teams : prev.teams).map((ct, idx) => ({
              id: ct.id || prev.teams[idx]?.id || `team-${idx + 1}`,
              name: ct.name,
              score: ct.score ?? 0,
              selectedCategories: ct.selectedCategories || [],
              categoriesLocked: Boolean(ct.categoriesLocked),
              color: ct.color || prev.teams[idx]?.color,
              participants: ct.participants || [],
              correctCount: ct.correctCount || 0,
              wrongCount: ct.wrongCount || 0,
              skippedCount: ct.skippedCount || 0,
            }));
            return {
              ...prev,
              teams: mergedTeams,
              currentTurn: cloud.currentTurn || prev.currentTurn,
              selectedCategoryId:
                cloud.selectedCategoryId !== undefined ? cloud.selectedCategoryId : prev.selectedCategoryId,
              selectedQuestionId:
                cloud.selectedQuestionId !== undefined ? cloud.selectedQuestionId : prev.selectedQuestionId,
              occupiedSlots: Array.isArray(cloud.occupiedSlots)
                ? Array.from(new Set([...(prev.occupiedSlots || []), ...cloud.occupiedSlots]))
                : prev.occupiedSlots,
              reservedCategoryMap: cloud.reservedCategoryMap || prev.reservedCategoryMap || {},
              lockedTeamIds: cloud.lockedTeamIds || prev.lockedTeamIds || [],
              selectionStageIndex:
                typeof cloud.selectionStageIndex === 'number'
                  ? cloud.selectionStageIndex
                  : prev.selectionStageIndex,
              activeQuestionState:
                cloud.activeQuestionState !== undefined ? cloud.activeQuestionState : prev.activeQuestionState,
            };
          });
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [sessionId, contestantSessionId]);

  // Fullscreen listener
  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Persist GameSession snapshot to Firestore
  const syncSessionToCloud = useCallback(
    async (nextSession: GameSession, isCompleted = false, overrideDuration?: number) => {
      if (dbConnected === 'error') return;
      try {
        const maxScore = Math.max(...nextSession.teams.map((t) => t.score), 0);
        const topTeams = nextSession.teams.filter((t) => t.score === maxScore);
        const winnerId =
          isCompleted && topTeams.length === 1
            ? topTeams[0].id
            : isCompleted && topTeams.length > 1
              ? 'draw'
              : undefined;

        const pickedCatNames = Array.from(
          new Set(
            nextSession.teams
              .flatMap((t) => t.selectedCategories || [])
              .map((cid) => categories.find((c) => c.id === cid)?.name || cid)
          )
        );

        const res = await dataService.saveGameSession(
          {
            creatorId: authUser?.id || undefined,
            createdAt: undefined,
            teams: nextSession.teams.map((t) => ({
              id: t.id,
              name: t.name,
              score: t.score,
              color: t.color,
              selectedCategories: t.selectedCategories || [],
              categoriesLocked: Boolean(t.categoriesLocked),
              participants: t.participants || [],
              correctCount: t.correctCount || 0,
              wrongCount: t.wrongCount || 0,
              skippedCount: t.skippedCount || 0,
            })),
            winnerId,
            categories: pickedCatNames,
            duration: overrideDuration,
            isCompleted,
            currentTurn: nextSession.currentTurn,
            selectedCategoryId: nextSession.selectedCategoryId,
            selectedQuestionId: nextSession.selectedQuestionId,
            status: nextSession.status,
            occupiedSlots: nextSession.occupiedSlots,
            reservedCategoryMap: nextSession.reservedCategoryMap || {},
            lockedTeamIds: nextSession.lockedTeamIds || [],
            selectionStageIndex: nextSession.selectionStageIndex,
            activeQuestionState: nextSession.activeQuestionState || null,
          },
          sessionId || undefined
        );

        if (res && res.id && !sessionId) {
          setSessionId(res.id);
          try {
            localStorage.setItem(ACTIVE_SESSION_ID_KEY, res.id);
          } catch {}
          return res.id;
        }
        return sessionId;
      } catch {
        return sessionId;
      }
    },
    [dbConnected, categories, authUser?.id, sessionId]
  );

  // Game Flow Handlers
  const handleStartNewGame = () => {
    playSound('intro');
    const nowMs = Date.now();
    const freshTeams = createInitialTeams(competitionConfig.teamCount);
    const next: GameSession = {
      teams: freshTeams,
      categories,
      currentTurn: freshTeams[0].id,
      selectedCategoryId: null,
      selectedQuestionId: null,
      status: 'setup',
      lastActiveStatus: 'setup',
      startedAtMs: nowMs,
      occupiedSlots: [],
      reservedCategoryMap: {},
      lockedTeamIds: [],
      selectionStageIndex: 0,
      activeQuestionState: null,
      answeredHistory: [],
    };
    setSessionId(null);
    try {
      localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
    } catch {}
    setSession(next);
    setGameStartTimestamp(nowMs);
    setViewMode('game');
  };

  const handleProceedToSelection = async () => {
    const next: GameSession = {
      ...session,
      status: 'selection',
      lastActiveStatus: 'selection',
    };
    setSession(next);
    await syncSessionToCloud(next, false);
  };

  const handleLockTeamCategories = async (teamIndex: number, requiredCountOverride?: number) => {
    const configuredCount = Math.max(1, competitionConfig.categoriesPerTeam || 3);
    const requiredCount = Math.max(1, requiredCountOverride || configuredCount);
    const targetTeam = session.teams[teamIndex];
    if (!targetTeam) {
      throw new Error('الفريق غير موجود.');
    }

    const picked: string[] = Array.from(new Set<string>(targetTeam.selectedCategories || []));
    if (picked.length !== requiredCount) {
      throw new Error(`يجب اختيار ${requiredCount} أقسام مكتملة قبل الاعتماد والحجز.`);
    }

    // Strict programmatic exclusivity check against all other locked teams
    const existingReserved: Record<string, string> = { ...(session.reservedCategoryMap || {}) };
    session.teams.forEach((t, idx) => {
      if (idx !== teamIndex && t.categoriesLocked) {
        (t.selectedCategories || []).forEach((cid) => {
          existingReserved[cid] = t.id;
        });
      }
    });

    for (const cid of picked) {
      const owner = existingReserved[cid];
      if (owner && owner !== targetTeam.id) {
        throw new Error('تم حجز هذا القسم مسبقاً بواسطة الفريق الآخر ولا يمكن تكراره.');
      }
    }

    // Ensure session document exists in Firestore before atomic transaction
    let activeSid = sessionId;
    if (!activeSid && dbConnected !== 'error') {
      activeSid = (await syncSessionToCloud({ ...session, status: 'selection' }, false)) || null;
    }

    const pickedCatNames: string[] = Array.from(
      new Set<string>(
        session.teams
          .flatMap((t) => t.selectedCategories || [])
          .map((cid) => categories.find((c) => c.id === cid)?.name || cid)
      )
    );

    if (activeSid && dbConnected !== 'error') {
      const atomicRes = await dataService.reserveTeamCategoriesAtomic({
        sessionId: activeSid,
        teamIndex,
        requiredCount,
        teamsSnapshot: session.teams.map((t) => ({
          id: t.id,
          name: t.name,
          score: t.score,
          color: t.color,
          selectedCategories: t.selectedCategories || [],
          categoriesLocked: Boolean(t.categoriesLocked),
          participants: t.participants || [],
          correctCount: t.correctCount || 0,
          wrongCount: t.wrongCount || 0,
          skippedCount: t.skippedCount || 0,
        })),
        categoryNames: pickedCatNames,
        creatorId: authUser?.id || undefined,
      });

      setSession((prev) => ({
        ...prev,
        teams: prev.teams.map((t, idx) => ({
          ...t,
          selectedCategories: atomicRes.teams[idx]?.selectedCategories || t.selectedCategories,
          categoriesLocked: Boolean(atomicRes.teams[idx]?.categoriesLocked),
        })),
        reservedCategoryMap: atomicRes.reservedCategoryMap,
        lockedTeamIds: atomicRes.lockedTeamIds,
        selectionStageIndex: atomicRes.selectionStageIndex,
      }));
      return;
    }

    // Fallback if temporarily offline (still enforces strict lock in local state & storage)
    const nextReserved = { ...existingReserved };
    picked.forEach((cid) => {
      nextReserved[cid] = targetTeam.id;
    });
    const nextLockedIds = Array.from(new Set([...(session.lockedTeamIds || []), targetTeam.id]));
    const nextTeams = session.teams.map((t, idx) =>
      idx === teamIndex ? { ...t, selectedCategories: picked, categoriesLocked: true } : t
    );
    const nextUnlocked = nextTeams.findIndex((t) => !t.categoriesLocked);

    setSession((prev) => ({
      ...prev,
      teams: nextTeams,
      reservedCategoryMap: nextReserved,
      lockedTeamIds: nextLockedIds,
      selectionStageIndex: nextUnlocked === -1 ? nextTeams.length : nextUnlocked,
    }));
  };

  const handleConfirmCategoriesAndStart = async () => {
    const startedAt = Date.now();
    setGameStartTimestamp(startedAt);
    const next: GameSession = {
      ...session,
      status: 'question',
      lastActiveStatus: 'question',
      startedAtMs: startedAt,
      currentTurn: session.teams[0]?.id || 'team-1',
      selectedCategoryId: null,
      selectedQuestionId: null,
      activeQuestionState: null,
    };
    setSession(next);
    await syncSessionToCloud(next, false);
  };

  const handleSelectQuestion = async (categoryId: string, questionId: string) => {
    const slotKey = `${categoryId}:${questionId}`;
    if (session.occupiedSlots.includes(slotKey)) return;

    await timeSyncService.syncServerClock().catch(() => {});
    const now = timeSyncService.getSyncedNowMs();

    const primaryTeam = session.teams.find((t) => t.id === session.currentTurn) || session.teams[0];
    const secondaryTeam =
      session.teams.find((t) => t.id !== primaryTeam?.id) || session.teams[1] || primaryTeam;

    const timerState: ActiveQuestionTimerState = {
      categoryId,
      questionId,
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
    };

    const next: GameSession = {
      ...session,
      selectedCategoryId: categoryId,
      selectedQuestionId: questionId,
      activeQuestionState: timerState,
    };

    setSession(next);
    await syncSessionToCloud(next, false);
  };

  const handleUpdateActiveQuestionState = useCallback(
    (nextState: ActiveQuestionTimerState) => {
      setSession((prev) => {
        const next: GameSession = {
          ...prev,
          activeQuestionState: nextState,
        };
        syncSessionToCloud(next, false).catch(() => {});
        return next;
      });
    },
    [syncSessionToCloud]
  );

  const handleRecordWrongAttempt = useCallback(
    async ({
      categoryId,
      questionId,
      teamId,
      phase,
    }: {
      categoryId: string;
      questionId: string;
      teamId: string;
      phase: 'first' | 'second';
    }) => {
      const slotKey = `${categoryId}:${questionId}`;
      if (session.occupiedSlots.includes(slotKey)) return;

      playSound('wrong');
      if (phase === 'first') {
        window.setTimeout(() => {
          playSound('turnTransfer');
        }, 340);
      }
      const delta = scoringSettings.deductOnWrong ? -Math.abs(scoringSettings.wrongDeductionAmount || 0) : 0;
      const now = timeSyncService.getSyncedNowMs();

      const updatedTeams = session.teams.map((t) => {
        if (t.id !== teamId) return t;
        return {
          ...t,
          score: Math.max(0, t.score + delta),
          wrongCount: (t.wrongCount || 0) + 1,
        };
      });

      const currentTimer = session.activeQuestionState;
      const secondaryId =
        currentTimer?.secondaryTeamId ||
        session.teams.find((t) => t.id !== teamId)?.id ||
        teamId;

      const nextTimerState: ActiveQuestionTimerState | null = currentTimer
        ? phase === 'first'
          ? {
              ...currentTimer,
              phase: 'second',
              answeringTeamId: secondaryId,
              phaseStartedAtServerMs: now,
              phaseEndsAtServerMs: now + (currentTimer.phase2DurationSec || 30) * 1000,
              isPaused: false,
              pausedRemainingMs: null,
              phase1Attempted: true,
              transferReason: 'wrong',
            }
          : {
              ...currentTimer,
              phase: 'resolved',
              phase2Attempted: true,
              resolvedTeamId: teamId,
              resolvedOutcome: 'wrong',
            }
        : null;

      const next: GameSession = {
        ...session,
        teams: updatedTeams,
        activeQuestionState: nextTimerState,
        answeredHistory: [
          ...(session.answeredHistory || []),
          {
            questionId,
            categoryId,
            teamId,
            isCorrect: false,
            pointsDelta: delta,
            answeredAt: Date.now(),
          },
        ],
      };

      setSession(next);
      await syncSessionToCloud(next, false);
    },
    [session, scoringSettings, playSound, syncSessionToCloud]
  );

  const handleExpireQuestion = useCallback(
    async (categoryId: string, questionId: string) => {
      const slotKey = `${categoryId}:${questionId}`;
      if (session.occupiedSlots.includes(slotKey)) return;

      const updatedOccupied = [...session.occupiedSlots, slotKey];
      const currentIdx = session.teams.findIndex((t) => t.id === session.currentTurn);
      const nextTurnTeam = session.teams[(currentIdx + 1) % session.teams.length] || session.teams[0];

      const expiredState: ActiveQuestionTimerState | null = session.activeQuestionState
        ? {
            ...session.activeQuestionState,
            phase: 'expired',
            resolvedOutcome: 'timeout',
            isPaused: false,
            pausedRemainingMs: null,
          }
        : null;

      let atomicSaved = false;
      if (sessionId && dbConnected !== 'error') {
        const atomic = await dataService.resolveQuestionSlotAtomic({
          sessionId,
          slotKey,
          updatedTeams: session.teams.map((t) => ({
            id: t.id,
            name: t.name,
            score: t.score,
            color: t.color,
            selectedCategories: t.selectedCategories || [],
            categoriesLocked: Boolean(t.categoriesLocked),
            participants: t.participants || [],
            correctCount: t.correctCount || 0,
            wrongCount: t.wrongCount || 0,
            skippedCount: t.skippedCount || 0,
          })),
          nextTurnTeamId: nextTurnTeam.id,
          activeQuestionState: expiredState,
          keepSelectedOnStage: true,
          categoryId,
          questionId,
        });
        if (atomic.alreadyResolved) return;
        atomicSaved = true;
      }

      const next: GameSession = {
        ...session,
        occupiedSlots: updatedOccupied,
        currentTurn: nextTurnTeam.id,
        activeQuestionState: expiredState,
      };
      setSession(next);
      if (!atomicSaved) {
        await syncSessionToCloud(next, false);
      }
    },
    [session, sessionId, dbConnected, syncSessionToCloud]
  );

  const handleJudgeQuestion = async ({
    categoryId,
    questionId,
    outcome,
    targetTeamId,
    stayOnReveal = false,
  }: {
    categoryId: string;
    questionId: string;
    outcome: 'correct' | 'wrong' | 'skip';
    targetTeamId: string;
    stayOnReveal?: boolean;
  }) => {
    const slotKey = `${categoryId}:${questionId}`;
    // Prevent duplicate scoring or submitting more than once for the same question
    if (session.occupiedSlots.includes(slotKey)) {
      return;
    }

    const cat = session.categories.find((c) => c.id === categoryId);
    const q = cat?.questions.find((item) => item.id === questionId);

    const basePts =
      q?.points && q.points > 0
        ? q.points
        : q?.difficulty === 'easy'
          ? scoringSettings.easyPoints
          : q?.difficulty === 'hard'
            ? scoringSettings.hardPoints
            : q?.difficulty === 'expert'
              ? scoringSettings.expertPoints
              : scoringSettings.mediumPoints;

    let delta = 0;
    if (outcome === 'correct') {
      playSound('correct');
      delta = basePts + (scoringSettings.correctBonus || 0);
    } else if (outcome === 'wrong') {
      playSound('wrong');
      delta = scoringSettings.deductOnWrong ? -Math.abs(scoringSettings.wrongDeductionAmount || 0) : 0;
    } else {
      playSound('click');
    }

    const updatedTeams = session.teams.map((t) => {
      if (t.id !== targetTeamId) return t;
      return {
        ...t,
        score: Math.max(0, t.score + delta),
        correctCount: (t.correctCount || 0) + (outcome === 'correct' ? 1 : 0),
        wrongCount: (t.wrongCount || 0) + (outcome === 'wrong' ? 1 : 0),
        skippedCount: (t.skippedCount || 0) + (outcome === 'skip' ? 1 : 0),
      };
    });

    const updatedOccupied = [...session.occupiedSlots, slotKey];
    const currentIdx = updatedTeams.findIndex((t) => t.id === session.currentTurn);
    const nextTurnTeam = updatedTeams[(currentIdx + 1) % updatedTeams.length] || updatedTeams[0];

    const resolvedState: ActiveQuestionTimerState | null = session.activeQuestionState
      ? {
          ...session.activeQuestionState,
          phase: 'resolved',
          isPaused: true,
          pausedRemainingMs: 0,
          resolvedTeamId: targetTeamId,
          resolvedOutcome: outcome,
        }
      : null;

    let atomicSaved = false;
    if (sessionId && dbConnected !== 'error') {
      const atomic = await dataService.resolveQuestionSlotAtomic({
        sessionId,
        slotKey,
        updatedTeams: updatedTeams.map((t) => ({
          id: t.id,
          name: t.name,
          score: t.score,
          color: t.color,
          selectedCategories: t.selectedCategories || [],
          categoriesLocked: Boolean(t.categoriesLocked),
          participants: t.participants || [],
          correctCount: t.correctCount || 0,
          wrongCount: t.wrongCount || 0,
          skippedCount: t.skippedCount || 0,
        })),
        nextTurnTeamId: nextTurnTeam.id,
        activeQuestionState: stayOnReveal ? resolvedState : null,
        keepSelectedOnStage: stayOnReveal,
        categoryId,
        questionId,
      });
      if (atomic.alreadyResolved) return;
      atomicSaved = true;
    }

    const next: GameSession = {
      ...session,
      teams: updatedTeams,
      occupiedSlots: updatedOccupied,
      currentTurn: nextTurnTeam.id,
      selectedCategoryId: stayOnReveal ? categoryId : null,
      selectedQuestionId: stayOnReveal ? questionId : null,
      activeQuestionState: stayOnReveal ? resolvedState : null,
      answeredHistory: [
        ...(session.answeredHistory || []),
        {
          questionId,
          categoryId,
          teamId: targetTeamId,
          isCorrect: outcome === 'correct',
          pointsDelta: delta,
          answeredAt: Date.now(),
        },
      ],
    };

    setSession(next);
    if (!atomicSaved) {
      await syncSessionToCloud(next, false);
    }
  };

  const handleFinishCompetition = async () => {
    const startRef = session.startedAtMs || gameStartTimestamp;
    const dur = Math.max(1, Math.round((Date.now() - startRef) / 1000));
    setGameDuration(dur);
    const next: GameSession = {
      ...session,
      status: 'result',
      lastActiveStatus: undefined,
      selectedCategoryId: null,
      selectedQuestionId: null,
      activeQuestionState: null,
    };
    setSession(next);
    await syncSessionToCloud(next, true, dur);
  };

  const handleReplaySameTeams = () => {
    const nowMs = Date.now();
    const resetTeams = session.teams.map((t) => ({
      ...t,
      score: 0,
      selectedCategories: [],
      categoriesLocked: false,
      correctCount: 0,
      wrongCount: 0,
      skippedCount: 0,
    }));
    setSessionId(null);
    try {
      localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
    } catch {}
    setGameStartTimestamp(nowMs);
    setSession({
      teams: resetTeams,
      categories,
      currentTurn: resetTeams[0].id,
      selectedCategoryId: null,
      selectedQuestionId: null,
      status: 'selection',
      lastActiveStatus: 'selection',
      startedAtMs: nowMs,
      occupiedSlots: [],
      reservedCategoryMap: {},
      lockedTeamIds: [],
      selectionStageIndex: 0,
      activeQuestionState: null,
      answeredHistory: [],
    });
  };

  const handleAdminAuthSuccess = (user: AuthSessionUser) => {
    setAuthUser(user);
    setShowAuthModal(false);
    setViewMode('admin');
  };

  const handleAdminLogout = async () => {
    await authService.logout();
    setAuthUser(null);
    setViewMode('game');
  };

  // Dedicated Spectator QR View
  if (contestantSessionId) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] text-[#0B192C] p-6" dir="rtl">
        <div className="max-w-xl mx-auto space-y-6">
          <div className="p-6 rounded-3xl bg-[#0B192C] text-white border border-[#C9A24D]/40 text-center space-y-2">
            <img
              src={resolvedAppLogoUrl || BRAND_ASSETS.emblem}
              alt={competitionName}
              className="w-16 h-16 rounded-2xl mx-auto border border-[#C9A24D]/60 object-cover"
              onError={(e) => {
                e.currentTarget.src = BRAND_ASSETS.emblem;
              }}
            />
            <h1 className="font-display font-extrabold text-2xl">{competitionName}</h1>
            <p className="text-xs text-[#D9B768]">بث المتابعة المباشر للجمهور</p>
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <h2 className="font-display font-bold text-base flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#9B7729]" />
              <span>النتائج المباشرة</span>
            </h2>
            {(spectatorSession?.teams || []).map((t, i) => (
              <div
                key={i}
                className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-[#9B7729]" />
                  <span className="font-bold text-sm">{t.name}</span>
                </div>
                <span className="font-mono font-extrabold text-2xl text-[#0B192C] tabular-nums">{t.score}</span>
              </div>
            ))}
          </div>

          <div className="surface-card rounded-2xl p-5 space-y-3">
            <h3 className="font-display font-bold text-sm flex items-center gap-2">
              <Heart className="w-4 h-4 text-rose-600" />
              <span>أرسل تشجيعك للفرق</span>
            </h3>
            <input
              type="text"
              value={spectatorName}
              onChange={(e) => setSpectatorName(e.target.value)}
              placeholder="اسمك (اختياري)..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={spectatorMsg}
                onChange={(e) => setSpectatorMsg(e.target.value)}
                placeholder="اكتب رسالة تشجيع..."
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!spectatorMsg.trim()) return;
                  await dataService.sendReaction(contestantSessionId, {
                    emoji: '👏',
                    senderName: spectatorName.trim() || 'مشاهد',
                    comment: spectatorMsg.trim(),
                  });
                  setSpectatorMsg('');
                }}
                className="px-4 py-2.5 bg-[#0B192C] text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 text-[#C9A24D]" />
                <span>إرسال</span>
              </button>
            </div>
            <div className="flex justify-center gap-2 pt-1">
              {['👏', '🏆', '✨', '🌟'].map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() =>
                    dataService.sendReaction(contestantSessionId, {
                      emoji: em,
                      senderName: spectatorName.trim() || 'مشجع',
                    })
                  }
                  className="px-4 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-lg hover:bg-[#F3EFE6] cursor-pointer"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const lazyViewFallback = (
    <div className="min-h-screen bg-[#FAF7F2] text-[#0B192C] flex flex-col items-center justify-center gap-3 p-6" dir="rtl">
      <div className="w-12 h-12 rounded-2xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center shadow-lg">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
      <p className="font-display font-bold text-sm text-[#0B192C]">جاري تحميل الشاشة...</p>
    </div>
  );

  // Admin Dashboard Full Shell (code-split)
  if (viewMode === 'admin' && authUser) {
    return (
      <Suspense fallback={lazyViewFallback}>
        <AdminDashboard
          categories={categories}
          groups={groups}
          sources={sources}
          settings={appSettings}
          scoringSettings={scoringSettings}
          competitionConfig={competitionConfig}
          currentUser={authUser}
          onBackToApp={() => setViewMode('game')}
          onLogout={handleAdminLogout}
          playSound={playSound}
        />
      </Suspense>
    );
  }

  if (viewMode === 'stats') {
    return (
      <Suspense fallback={lazyViewFallback}>
        <StatisticsDashboard
          onBack={() => setViewMode('game')}
          isAdmin={isAdmin}
          currentUserId={authUser?.id}
          playSound={playSound}
        />
      </Suspense>
    );
  }

  if (viewMode === 'recent') {
    return (
      <Suspense fallback={lazyViewFallback}>
        <RecentCompetitions
          onBack={() => setViewMode('game')}
          isAdmin={isAdmin}
          currentUserId={authUser?.id}
          playSound={playSound}
        />
      </Suspense>
    );
  }

  const stageLabel =
    session.status === 'setup'
      ? 'تجهيز الفرق'
      : session.status === 'selection'
        ? 'اختيار الأقسام'
        : session.status === 'question'
          ? 'جولات التنافس المباشر'
          : session.status === 'result'
            ? 'منصة التتويج والنتائج'
            : undefined;

  const hasSavedActiveGame =
    session.status !== 'result' &&
    Boolean(
      session.lastActiveStatus ||
        session.status !== 'welcome' ||
        session.occupiedSlots.length > 0 ||
        session.teams.some((t) => (t.selectedCategories || []).length > 0)
    );

  const handleNavigateHomePreservingSession = () => {
    setSession((prev) => ({
      ...prev,
      lastActiveStatus:
        prev.status !== 'welcome' && prev.status !== 'result'
          ? prev.status
          : prev.lastActiveStatus,
      status: 'welcome',
    }));
  };

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#0F172A] flex flex-col" dir="rtl">
      <SiteHeader
        competitionName={competitionName}
        logoUrl={resolvedAppLogoUrl}
        dbConnected={dbConnected}
        enableSounds={enableSounds}
        onToggleSounds={() => setEnableSounds((s) => !s)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        onGoHome={() => {
          playSound('click');
          handleNavigateHomePreservingSession();
        }}
        onOpenStats={() => {
          playSound('click');
          setViewMode('stats');
        }}
        onOpenRecent={() => {
          playSound('click');
          setViewMode('recent');
        }}
        onOpenSettings={() => {
          playSound('click');
          setShowPublicSettings(true);
        }}
        onOpenAdmin={() => {
          playSound('click');
          if (isAdmin) {
            setViewMode('admin');
          } else {
            setShowAuthModal(true);
          }
        }}
        isAdmin={isAdmin}
        adminEmail={authUser ? `@${authUser.username}` : undefined}
        stageLabel={stageLabel}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 pt-8">
        {session.status === 'welcome' && (
          <HomeView
            competitionName={competitionName}
            competitionSlogan={competitionSlogan}
            logoUrl={resolvedAppLogoUrl}
            categories={categories}
            approvedSourcesCount={sources.filter((s) => s.isApproved).length}
            completedSessionsCount={completedSessionsCount}
            dbConnected={dbConnected}
            hasSavedActiveGame={hasSavedActiveGame}
            competitionConfig={competitionConfig}
            scoringSettings={scoringSettings}
            onStartNewGame={handleStartNewGame}
            onResumeGame={() => {
              playSound('click');
              setSession((prev) => {
                const allLocked =
                  prev.teams.length > 0 &&
                  prev.teams.every((t) => t.categoriesLocked && (t.selectedCategories || []).length > 0);
                const targetStatus =
                  prev.lastActiveStatus ||
                  (allLocked || prev.occupiedSlots.length > 0
                    ? 'question'
                    : prev.teams.some((t) => (t.selectedCategories || []).length > 0)
                      ? 'selection'
                      : 'setup');
                return {
                  ...prev,
                  status: targetStatus,
                };
              });
            }}
            onOpenSettings={() => {
              playSound('click');
              setShowPublicSettings(true);
            }}
            onOpenAdmin={() => {
              playSound('click');
              if (isAdmin) {
                setViewMode('admin');
              } else {
                setShowAuthModal(true);
              }
            }}
          />
        )}

        {session.status === 'setup' && (
          <SetupView
            teams={session.teams}
            competitionConfig={competitionConfig}
            scoringSettings={scoringSettings}
            onUpdateTeams={(teams) => setSession((prev) => ({ ...prev, teams }))}
            onBack={() => setSession((prev) => ({ ...prev, status: 'welcome' }))}
            onProceedToSelection={handleProceedToSelection}
            playSound={playSound}
          />
        )}

        {session.status === 'selection' && (
          <SelectionView
            teams={session.teams}
            categories={categories}
            competitionConfig={competitionConfig}
            reservedCategoryMap={session.reservedCategoryMap}
            lockedTeamIds={session.lockedTeamIds}
            onUpdateTeams={(teams) => setSession((prev) => ({ ...prev, teams }))}
            onLockTeamCategories={handleLockTeamCategories}
            onBackToSetup={() => setSession((prev) => ({ ...prev, status: 'setup' }))}
            onConfirmAndStart={handleConfirmCategoriesAndStart}
            playSound={playSound}
          />
        )}

        {session.status === 'question' && (
          <GameStageView
            session={session}
            sessionId={sessionId}
            competitionConfig={competitionConfig}
            scoringSettings={scoringSettings}
            reactions={reactions}
            onSelectQuestion={handleSelectQuestion}
            onBackToBoard={() =>
              setSession((prev) => {
                const next: GameSession = {
                  ...prev,
                  selectedCategoryId: null,
                  selectedQuestionId: null,
                  activeQuestionState: null,
                };
                syncSessionToCloud(next, false).catch(() => {});
                return next;
              })
            }
            onSwitchTurn={(teamId) => setSession((prev) => ({ ...prev, currentTurn: teamId }))}
            onUpdateActiveQuestionState={handleUpdateActiveQuestionState}
            onRecordWrongAttempt={handleRecordWrongAttempt}
            onExpireQuestion={handleExpireQuestion}
            onJudgeQuestion={handleJudgeQuestion}
            onFinishCompetition={handleFinishCompetition}
            onReturnHome={handleNavigateHomePreservingSession}
            playSound={playSound}
          />
        )}

        {session.status === 'result' && (
          <ResultsView
            teams={session.teams}
            gameDuration={gameDuration}
            competitionName={competitionName}
            competitionSlogan={competitionSlogan}
            competitionConfig={competitionConfig}
            onReplaySameTeams={handleReplaySameTeams}
            onNewGame={handleStartNewGame}
            onGoHome={() => setSession((prev) => ({ ...prev, status: 'welcome', lastActiveStatus: undefined }))}
            playSound={playSound}
          />
        )}
      </main>

      <PublicSettingsModal
        isOpen={showPublicSettings}
        onClose={() => setShowPublicSettings(false)}
        enableSounds={enableSounds}
        onToggleSounds={() => setEnableSounds((s) => !s)}
        soundVolumes={soundVolumes}
        onChangeSoundVolume={handleChangeSoundVolume}
        onResetSoundVolumes={handleResetSoundVolumes}
        onPreviewSound={handlePreviewSound}
        enableVisualEffects={enableVisuals}
        onToggleVisualEffects={() => setEnableVisuals((v) => !v)}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        hasSavedSession={hasSavedActiveGame}
        onResetSavedSession={() => {
          localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
          localStorage.removeItem(ACTIVE_SESSION_ID_KEY);
          setSessionId(null);
          setSession({
            teams: createInitialTeams(competitionConfig.teamCount),
            categories,
            currentTurn: 'team-1',
            selectedCategoryId: null,
            selectedQuestionId: null,
            status: 'welcome',
            lastActiveStatus: undefined,
            occupiedSlots: [],
            reservedCategoryMap: {},
            lockedTeamIds: [],
            selectionStageIndex: 0,
            activeQuestionState: null,
            answeredHistory: [],
          });
        }}
        onOpenAdmin={() => {
          if (isAdmin) setViewMode('admin');
          else setShowAuthModal(true);
        }}
        onOpenRecent={() => {
          playSound('click');
          setViewMode('recent');
        }}
        onOpenStats={() => {
          playSound('click');
          setViewMode('stats');
        }}
        timerDuration={competitionConfig.timerDuration}
        competitionName={competitionName}
        logoUrl={resolvedAppLogoUrl}
      />

      <AdminAuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        onSuccess={handleAdminAuthSuccess}
        playSound={playSound}
      />
    </div>
  );
}
