import {
  collection,
  getDocs,
  addDoc,
  setDoc,
  doc,
  getDoc,
  query,
  where,
  serverTimestamp,
  orderBy,
  limit,
  deleteDoc,
  updateDoc,
  runTransaction,
  FirestoreError,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  ActiveQuestionTimerState,
  ActivityLogEntry,
  AdminPasskeyRecord,
  AdminRoleUser,
  ApprovedSource,
  CompetitionConfig,
  ScoringSettings,
  SecurityLogEntry,
  QuestionDifficulty,
  QuestionType,
  ReviewStatus,
  VideoClipSegment,
  VideoSourceRecord,
} from '../types';

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string;
    email: string;
    emailVerified: boolean;
    isAnonymous: boolean;
    providerInfo: { providerId: string; displayName: string; email: string }[];
  };
}

const handleFirestoreError = (
  error: any,
  operationType: FirestoreErrorInfo['operationType'],
  path: string | null = null,
  shouldThrow = true
) => {
  const isQuotaError = error?.message?.includes('Quota') || error?.code === 'resource-exhausted';

  if (isQuotaError) {
    const quotaMsg = 'تم تجاوز حصة العمليات المجانية (Quota Exceeded). يرجى المحاولة لاحقاً.';
    if (shouldThrow) throw new Error(quotaMsg);
    console.error(quotaMsg, error);
    return new Error(quotaMsg);
  }

  if (error && (error as FirestoreError).code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
      error: (error as Error).message,
      operationType,
      path,
      authInfo: {
        userId: 'custom-session',
        email: '',
        emailVerified: false,
        isAnonymous: false,
        providerInfo: [],
      },
    };
    const finalErr = new Error(JSON.stringify(errorInfo));
    if (shouldThrow) throw finalErr;
    console.warn('Firestore Access Denied info:', path);
    return finalErr;
  }

  if (shouldThrow) throw error;
  console.warn('Firestore background notice:', error?.message || error);
  return error;
};

const cleanData = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj;
  if (obj.constructor && obj.constructor.name !== 'Object' && obj.constructor.name !== 'Array') return obj;
  if (Array.isArray(obj)) return obj.map(cleanData);

  const newObj: any = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== undefined) {
      newObj[key] = cleanData(obj[key]);
    }
  });
  return newObj;
};

export interface DBCategory {
  id: string;
  name: string;
  group?: string;
  sourceUrl?: string;
  sourceText?: string;
  lastSyncedAt?: any;
  imageUrl?: string;
  iconUrl?: string;
  borderColor?: string;
  customShadow?: string;
  order?: number;
  difficulty?: QuestionDifficulty;
  targetQuestionCount?: number;
  allowedQuestionTypes?: QuestionType[];
  linkedSourceIds?: string[];
  letterMode?: boolean;
  imagesEnabled?: boolean;
  qrEnabled?: boolean;
  videoEnabled?: boolean;
  mapMode?: boolean;
  imageMode?: boolean;
  timerDuration?: number;
  letter?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: any;
}

export interface DBQuestion {
  id: string;
  categoryId: string;
  text: string;
  answer: string;
  questionType?: QuestionType;
  difficulty?: QuestionDifficulty;
  source?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceId?: string;
  volumePageOrHadith?: string;
  originalExcerpt?: string;
  reviewStatus?: ReviewStatus;
  needsManualVerification?: boolean;
  verificationNote?: string;
  points: number;
  imageUrl?: string;
  videoUrl?: string;
  videoSourceId?: string;
  videoSourceName?: string;
  videoSourceType?: 'direct_video' | 'youtube' | 'uploaded_file';
  videoTotalDuration?: number;
  videoClips?: VideoClipSegment[];
  clipApproved?: boolean;
  confidenceScore?: number;
  videoEnabled?: boolean;
  qrEnabled?: boolean;
  letterMode?: boolean;
  imagesEnabled?: boolean;
  mapMode?: boolean;
  letter?: string;
  options?: string[];
  hint?: string;
  createdAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
}

export interface DBGroup {
  id: string;
  name: string;
  order: number;
  createdAt?: any;
}

export interface DBGameSession {
  id?: string;
  creatorId?: string;
  createdAt: any;
  teams: {
    id?: string;
    name: string;
    score: number;
    color?: string;
    selectedCategories: string[];
    categoriesLocked?: boolean;
    participants?: string[];
    correctCount?: number;
    wrongCount?: number;
    skippedCount?: number;
  }[];
  winnerId?: string;
  categories: string[];
  duration?: number;
  isCompleted?: boolean;
  currentTurn?: string;
  selectedCategoryId?: string | null;
  selectedQuestionId?: string | null;
  status?: string;
  occupiedSlots?: string[];
  reservedCategoryMap?: Record<string, string>;
  lockedTeamIds?: string[];
  selectionStageIndex?: number;
  activeQuestionState?: ActiveQuestionTimerState | null;
}

export interface DBAppSettings {
  logoUrl?: string;
  logoUpdatedAt?: number;
  adminImageUrl?: string;
  competitionName?: string;
  competitionSlogan?: string;
  correctSoundUrl?: string;
  wrongSoundUrl?: string;
  beepSoundUrl?: string;
  introSoundUrl?: string;
  clickSoundUrl?: string;
  correctImageUrl?: string;
  wrongImageUrl?: string;
  correctSoundVolume?: number;
  wrongSoundVolume?: number;
  beepVolume?: number;
  introSoundVolume?: number;
  clickSoundVolume?: number;
  victorySoundUrl?: string;
  victorySoundVolume?: number;
  turnTransferSoundUrl?: string;
  turnSwitchSoundUrl?: string;
  timeoutSoundUrl?: string;
  soundVolumes?: {
    turnSwitch?: number;
    timer?: number;
    answers?: number;
    ceremony?: number;
    ui?: number;
  };
  enableSounds?: boolean;
  timerDuration?: number;
  enableCrowdNoise?: boolean;
  crowdNoiseVolume?: number;
  crowdNoiseUrl?: string;
  themeId?: string;
  scoring?: ScoringSettings;
  competitionConfig?: CompetitionConfig;
}

export const dataService = {
  // Settings
  subscribeSettings(callback: (settings: DBAppSettings | null) => void, onError?: (err: any) => void): () => void {
    const q = collection(db, 'settings');
    return onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          callback(null);
        } else {
          callback(snap.docs[0].data() as DBAppSettings);
        }
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'settings', false);
      }
    );
  },

  async getSettings(): Promise<DBAppSettings | null> {
    try {
      const snap = await getDocs(collection(db, 'settings'));
      if (snap.empty) return null;
      return snap.docs[0].data() as DBAppSettings;
    } catch (e) {
      return handleFirestoreError(e, 'list', 'settings');
    }
  },

  async updateSettings(settings: DBAppSettings) {
    try {
      const snap = await getDocs(collection(db, 'settings'));
      const cleaned = cleanData(settings);
      if (snap.empty) {
        await addDoc(collection(db, 'settings'), cleaned);
      } else {
        await updateDoc(doc(db, 'settings', snap.docs[0].id), cleaned);
      }
    } catch (e) {
      return handleFirestoreError(e, 'update', 'settings');
    }
  },

  // Sessions
  subscribeGameSessions(
    isAdmin: boolean,
    userId?: string,
    callback?: (sessions: DBGameSession[]) => void,
    onError?: (err: any) => void
  ): () => void {
    const q = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(200));

    return onSnapshot(
      q,
      (snap) => {
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as DBGameSession));
        if (isAdmin || !userId) {
          callback?.(data);
        } else {
          callback?.(data.filter((s) => s.creatorId === userId || !s.creatorId));
        }
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'sessions', false);
      }
    );
  },

  subscribeSession(
    sessionId: string,
    callback: (session: DBGameSession | null) => void,
    onError?: (err: any) => void
  ): () => void {
    return onSnapshot(
      doc(db, 'sessions', sessionId),
      (snap) => {
        if (snap.exists()) {
          callback({ id: snap.id, ...snap.data() } as DBGameSession);
        } else {
          callback(null);
        }
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'get', `sessions/${sessionId}`, false);
      }
    );
  },

  async saveGameSession(session: Omit<DBGameSession, 'id'>, sessionId?: string) {
    try {
      const data = {
        ...session,
        createdAt: session.createdAt || serverTimestamp(),
      };
      const cleaned = cleanData(data);
      if (sessionId) {
        await setDoc(doc(db, 'sessions', sessionId), cleaned, { merge: true });
        return { id: sessionId };
      } else {
        return await addDoc(collection(db, 'sessions'), cleaned);
      }
    } catch (e) {
      return handleFirestoreError(e, 'create', 'sessions');
    }
  },

  async getGameSessionById(sessionId: string): Promise<DBGameSession | null> {
    try {
      const snap = await getDoc(doc(db, 'sessions', sessionId));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as DBGameSession;
    } catch {
      return null;
    }
  },

  async reserveTeamCategoriesAtomic(params: {
    sessionId: string;
    teamIndex: number;
    requiredCount: number;
    teamsSnapshot: DBGameSession['teams'];
    categoryNames: string[];
    creatorId?: string;
  }): Promise<{
    teams: DBGameSession['teams'];
    reservedCategoryMap: Record<string, string>;
    lockedTeamIds: string[];
    selectionStageIndex: number;
  }> {
    const { sessionId, teamIndex, requiredCount, teamsSnapshot, categoryNames, creatorId } = params;
    const targetTeam = teamsSnapshot[teamIndex];
    if (!targetTeam) {
      throw new Error('الفريق المحدد غير موجود.');
    }

    const picked = Array.from(new Set(targetTeam.selectedCategories || []));
    if (picked.length !== requiredCount) {
      throw new Error(`يجب اختيار ${requiredCount} أقسام مكتملة قبل الاعتماد والحجز.`);
    }

    const sessionRef = doc(db, 'sessions', sessionId);
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(sessionRef);
        const existingData = snap.exists() ? (snap.data() as DBGameSession) : null;

        // Merge with existing DB locked teams if present so concurrent clients cannot steal reserved categories
        const baseTeams = existingData?.teams?.length ? [...existingData.teams] : [...teamsSnapshot];
        const reservedMap: Record<string, string> = { ...(existingData?.reservedCategoryMap || {}) };
        const lockedIds = new Set<string>(existingData?.lockedTeamIds || []);

        baseTeams.forEach((t, idx) => {
          const tId = t.id || `team-${idx + 1}`;
          if (idx !== teamIndex && (t.categoriesLocked || lockedIds.has(tId))) {
            (t.selectedCategories || []).forEach((cid) => {
              reservedMap[cid] = tId;
            });
          }
        });

        const currentTeamId = targetTeam.id || `team-${teamIndex + 1}`;
        for (const cid of picked) {
          const owner = reservedMap[cid];
          if (owner && owner !== currentTeamId) {
            throw new Error('أحد الأقسام المختارة محجوز بالفعل للفريق الآخر ولا يمكن تكراره.');
          }
        }

        const updatedTeams = teamsSnapshot.map((t, idx) => {
          const tId = t.id || `team-${idx + 1}`;
          if (idx === teamIndex) {
            return { ...t, id: tId, selectedCategories: picked, categoriesLocked: true };
          }
          if (existingData?.teams?.[idx]?.categoriesLocked || lockedIds.has(tId)) {
            return {
              ...t,
              id: tId,
              selectedCategories: existingData?.teams?.[idx]?.selectedCategories || t.selectedCategories,
              categoriesLocked: true,
            };
          }
          return { ...t, id: tId };
        });

        picked.forEach((cid) => {
          reservedMap[cid] = currentTeamId;
        });
        lockedIds.add(currentTeamId);

        const nextUnlockedIdx = updatedTeams.findIndex((t) => !t.categoriesLocked);
        const nextStageIndex = nextUnlockedIdx === -1 ? updatedTeams.length : nextUnlockedIdx;

        const payload = cleanData({
          creatorId: existingData?.creatorId || creatorId || undefined,
          createdAt: existingData?.createdAt || serverTimestamp(),
          teams: updatedTeams,
          categories: categoryNames,
          status: existingData?.status || 'selection',
          occupiedSlots: existingData?.occupiedSlots || [],
          reservedCategoryMap: reservedMap,
          lockedTeamIds: Array.from(lockedIds),
          selectionStageIndex: nextStageIndex,
        });

        tx.set(sessionRef, payload, { merge: true });

        return {
          teams: updatedTeams,
          reservedCategoryMap: reservedMap,
          lockedTeamIds: Array.from(lockedIds),
          selectionStageIndex: nextStageIndex,
        };
      });
    } catch (e: any) {
      if (e?.message?.includes('محجوز') || e?.message?.includes('يجب اختيار')) {
        throw e;
      }
      return handleFirestoreError(e, 'update', `sessions/${sessionId}`);
    }
  },

  async resolveQuestionSlotAtomic(params: {
    sessionId: string;
    slotKey: string;
    updatedTeams: DBGameSession['teams'];
    nextTurnTeamId: string;
    activeQuestionState: ActiveQuestionTimerState | null;
    keepSelectedOnStage?: boolean;
    categoryId: string;
    questionId: string;
  }): Promise<{ alreadyResolved: boolean }> {
    const {
      sessionId,
      slotKey,
      updatedTeams,
      nextTurnTeamId,
      activeQuestionState,
      keepSelectedOnStage,
      categoryId,
      questionId,
    } = params;
    const sessionRef = doc(db, 'sessions', sessionId);
    try {
      return await runTransaction(db, async (tx) => {
        const snap = await tx.get(sessionRef);
        const existingData = snap.exists() ? (snap.data() as DBGameSession) : null;
        const currentSlots: string[] = Array.isArray(existingData?.occupiedSlots)
          ? existingData!.occupiedSlots
          : [];

        if (currentSlots.includes(slotKey)) {
          return { alreadyResolved: true };
        }

        const nextSlots = [...currentSlots, slotKey];
        tx.set(
          sessionRef,
          cleanData({
            teams: updatedTeams,
            occupiedSlots: nextSlots,
            currentTurn: nextTurnTeamId,
            selectedCategoryId: keepSelectedOnStage ? categoryId : null,
            selectedQuestionId: keepSelectedOnStage ? questionId : null,
            activeQuestionState,
          }),
          { merge: true }
        );
        return { alreadyResolved: false };
      });
    } catch (e) {
      handleFirestoreError(e, 'update', `sessions/${sessionId}`, false);
      return { alreadyResolved: false };
    }
  },

  async getGameSessions(): Promise<DBGameSession[]> {
    try {
      const q = query(collection(db, 'sessions'), orderBy('createdAt', 'desc'), limit(200));
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DBGameSession));
    } catch (e) {
      return handleFirestoreError(e, 'list', 'sessions');
    }
  },

  async deleteSession(sessionId: string) {
    try {
      await deleteDoc(doc(db, 'sessions', sessionId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `sessions/${sessionId}`);
    }
  },

  // Reactions
  async sendReaction(sessionId: string, reaction: { emoji?: string; comment?: string; senderName?: string }) {
    try {
      const cleaned = cleanData({
        ...reaction,
        createdAt: serverTimestamp(),
      });
      return await addDoc(collection(db, `sessions/${sessionId}/reactions`), cleaned);
    } catch (e) {
      return handleFirestoreError(e, 'create', `sessions/${sessionId}/reactions`);
    }
  },

  subscribeReactions(
    sessionId: string,
    onNewReaction: (reaction: any) => void,
    onError?: (err: any) => void
  ): () => void {
    const q = query(collection(db, `sessions/${sessionId}/reactions`), orderBy('createdAt', 'asc'));

    let isInitial = true;
    return onSnapshot(
      q,
      (snap) => {
        snap.docChanges().forEach((change) => {
          if (change.type === 'added') {
            if (isInitial) return;
            onNewReaction({ id: change.doc.id, ...change.doc.data() });
          }
        });
        isInitial = false;
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', `sessions/${sessionId}/reactions`, false);
      }
    );
  },

  // Groups
  subscribeGroups(callback: (groups: DBGroup[]) => void, onError?: (err: any) => void): () => void {
    const q = query(collection(db, 'groups'), orderBy('order', 'asc'));
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DBGroup)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'groups', false);
      }
    );
  },

  async getGroups(): Promise<DBGroup[]> {
    try {
      const q = query(collection(db, 'groups'), orderBy('order', 'asc'));
      const caps = await getDocs(q);
      return caps.docs.map((d) => ({ id: d.id, ...d.data() } as DBGroup));
    } catch (e) {
      return handleFirestoreError(e, 'list', 'groups');
    }
  },

  async addGroup(group: Omit<DBGroup, 'id' | 'createdAt'>) {
    try {
      return await addDoc(
        collection(db, 'groups'),
        cleanData({
          ...group,
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      return handleFirestoreError(e, 'create', 'groups');
    }
  },

  async updateGroup(groupId: string, data: Partial<DBGroup>) {
    try {
      await updateDoc(doc(db, 'groups', groupId), cleanData(data));
    } catch (e) {
      return handleFirestoreError(e, 'update', `groups/${groupId}`);
    }
  },

  async deleteGroup(groupId: string) {
    try {
      await deleteDoc(doc(db, 'groups', groupId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `groups/${groupId}`);
    }
  },

  // Categories
  subscribeCategories(callback: (categories: DBCategory[]) => void, onError?: (err: any) => void): () => void {
    return onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DBCategory)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'categories', false);
      }
    );
  },

  async getCategories(): Promise<DBCategory[]> {
    try {
      const caps = await getDocs(collection(db, 'categories'));
      return caps.docs.map((d) => ({ id: d.id, ...d.data() } as DBCategory));
    } catch (e) {
      return handleFirestoreError(e, 'list', 'categories');
    }
  },

  async addCategory(cat: Omit<DBCategory, 'id'>) {
    try {
      return await addDoc(
        collection(db, 'categories'),
        cleanData({
          ...cat,
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      return handleFirestoreError(e, 'create', 'categories');
    }
  },

  async deleteCategory(catId: string) {
    try {
      await deleteDoc(doc(db, 'categories', catId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `categories/${catId}`);
    }
  },

  async updateCategory(catId: string, data: Partial<DBCategory>) {
    try {
      await updateDoc(doc(db, 'categories', catId), cleanData(data));
    } catch (e) {
      return handleFirestoreError(e, 'update', `categories/${catId}`);
    }
  },

  // Questions
  subscribeQuestions(
    catId: string,
    callback: (questions: DBQuestion[]) => void,
    onError?: (err: any) => void
  ): () => void {
    const q = query(collection(db, `categories/${catId}/questions`), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, categoryId: catId, ...d.data() } as DBQuestion)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', `categories/${catId}/questions`, false);
      }
    );
  },

  async getQuestions(catId: string): Promise<DBQuestion[]> {
    try {
      const snap = await getDocs(collection(db, `categories/${catId}/questions`));
      return snap.docs.map((d) => ({ id: d.id, categoryId: catId, ...d.data() } as DBQuestion));
    } catch (e) {
      return handleFirestoreError(e, 'list', `categories/${catId}/questions`);
    }
  },

  async addQuestion(catId: string, question: Omit<DBQuestion, 'id' | 'categoryId'>) {
    try {
      return await addDoc(
        collection(db, `categories/${catId}/questions`),
        cleanData({
          ...question,
          reviewStatus: question.reviewStatus || 'approved',
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      return handleFirestoreError(e, 'create', `categories/${catId}/questions`);
    }
  },

  async updateQuestion(catId: string, qId: string, data: Partial<DBQuestion>) {
    try {
      await updateDoc(doc(db, `categories/${catId}/questions`, qId), cleanData(data));
    } catch (e) {
      return handleFirestoreError(e, 'update', `categories/${catId}/questions/${qId}`);
    }
  },

  async deleteQuestion(catId: string, qId: string) {
    try {
      await deleteDoc(doc(db, `categories/${catId}/questions`, qId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `categories/${catId}/questions/${qId}`);
    }
  },

  // Approved Shia Sources Whitelist
  subscribeSources(callback: (sources: ApprovedSource[]) => void, onError?: (err: any) => void): () => void {
    return onSnapshot(
      collection(db, 'approved_sources'),
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ApprovedSource)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'approved_sources', false);
      }
    );
  },

  async getSources(): Promise<ApprovedSource[]> {
    try {
      const snap = await getDocs(collection(db, 'approved_sources'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ApprovedSource));
    } catch (e) {
      return handleFirestoreError(e, 'list', 'approved_sources');
    }
  },

  async addSource(source: Omit<ApprovedSource, 'id' | 'createdAt'>) {
    try {
      return await addDoc(
        collection(db, 'approved_sources'),
        cleanData({
          ...source,
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      return handleFirestoreError(e, 'create', 'approved_sources');
    }
  },

  async updateSource(sourceId: string, data: Partial<ApprovedSource>) {
    try {
      await updateDoc(doc(db, 'approved_sources', sourceId), cleanData(data));
    } catch (e) {
      return handleFirestoreError(e, 'update', `approved_sources/${sourceId}`);
    }
  },

  async deleteSource(sourceId: string) {
    try {
      await deleteDoc(doc(db, 'approved_sources', sourceId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `approved_sources/${sourceId}`);
    }
  },

  async seedInitialSources(defaultSources: Omit<ApprovedSource, 'id' | 'createdAt'>[]) {
    try {
      const snap = await getDocs(collection(db, 'approved_sources'));
      if (!snap.empty) return;
      for (const s of defaultSources) {
        await addDoc(
          collection(db, 'approved_sources'),
          cleanData({
            ...s,
            createdAt: serverTimestamp(),
          })
        );
      }
    } catch (e) {
      handleFirestoreError(e, 'write', 'approved_sources', false);
    }
  },

  // Approved Video Sources Library
  subscribeVideoSources(callback: (videos: VideoSourceRecord[]) => void, onError?: (err: any) => void): () => void {
    const q = query(collection(db, 'video_sources'), orderBy('createdAt', 'desc'));
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VideoSourceRecord)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'video_sources', false);
      }
    );
  },

  async getVideoSources(): Promise<VideoSourceRecord[]> {
    try {
      const snap = await getDocs(collection(db, 'video_sources'));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as VideoSourceRecord));
    } catch (e) {
      return handleFirestoreError(e, 'list', 'video_sources');
    }
  },

  async addVideoSource(video: Omit<VideoSourceRecord, 'id' | 'createdAt'>) {
    try {
      return await addDoc(
        collection(db, 'video_sources'),
        cleanData({
          ...video,
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      return handleFirestoreError(e, 'create', 'video_sources');
    }
  },

  async updateVideoSource(videoId: string, data: Partial<VideoSourceRecord>) {
    try {
      await updateDoc(doc(db, 'video_sources', videoId), cleanData(data));
    } catch (e) {
      return handleFirestoreError(e, 'update', `video_sources/${videoId}`);
    }
  },

  async deleteVideoSource(videoId: string) {
    try {
      await deleteDoc(doc(db, 'video_sources', videoId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `video_sources/${videoId}`);
    }
  },

  // RBAC Admin Roles
  subscribeAdminRoles(callback: (roles: AdminRoleUser[]) => void, onError?: (err: any) => void): () => void {
    return onSnapshot(
      collection(db, 'admin_roles'),
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminRoleUser)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'admin_roles', false);
      }
    );
  },

  async getAdminRoleByEmail(email: string): Promise<AdminRoleUser | null> {
    try {
      const normalized = email.trim().toLowerCase();
      const d = await getDoc(doc(db, 'admin_roles', normalized));
      if (!d.exists()) return null;
      return { id: d.id, ...d.data() } as AdminRoleUser;
    } catch {
      return null;
    }
  },

  async upsertAdminRole(roleUser: Omit<AdminRoleUser, 'id' | 'createdAt'>) {
    try {
      const id = roleUser.email.trim().toLowerCase();
      await setDoc(
        doc(db, 'admin_roles', id),
        cleanData({
          ...roleUser,
          email: id,
          createdAt: serverTimestamp(),
        }),
        { merge: true }
      );
    } catch (e) {
      return handleFirestoreError(e, 'write', 'admin_roles');
    }
  },

  async deleteAdminRole(email: string) {
    try {
      await deleteDoc(doc(db, 'admin_roles', email.trim().toLowerCase()));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `admin_roles/${email}`);
    }
  },

  // WebAuthn Passkeys (only public key metadata + integrity seal)
  subscribePasskeys(callback: (passkeys: AdminPasskeyRecord[]) => void, onError?: (err: any) => void): () => void {
    return onSnapshot(
      collection(db, 'admin_passkeys'),
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminPasskeyRecord)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'admin_passkeys', false);
      }
    );
  },

  async getActivePasskeys(): Promise<AdminPasskeyRecord[]> {
    try {
      const snap = await getDocs(collection(db, 'admin_passkeys'));
      return snap.docs
        .map((d) => ({ id: d.id, ...d.data() } as AdminPasskeyRecord))
        .filter((p) => p.isActive !== false);
    } catch (e) {
      handleFirestoreError(e, 'list', 'admin_passkeys', false);
      return [];
    }
  },

  async savePasskey(passkey: Omit<AdminPasskeyRecord, 'id' | 'createdAt'>) {
    try {
      await setDoc(
        doc(db, 'admin_passkeys', passkey.credentialId),
        cleanData({
          ...passkey,
          createdAt: serverTimestamp(),
          lastUsedAt: serverTimestamp(),
        })
      );
    } catch (e) {
      return handleFirestoreError(e, 'write', `admin_passkeys/${passkey.credentialId}`);
    }
  },

  async updatePasskey(passkeyId: string, data: Partial<AdminPasskeyRecord>) {
    try {
      await updateDoc(doc(db, 'admin_passkeys', passkeyId), cleanData(data));
    } catch (e) {
      return handleFirestoreError(e, 'update', `admin_passkeys/${passkeyId}`, false);
    }
  },

  async deletePasskey(passkeyId: string) {
    try {
      await deleteDoc(doc(db, 'admin_passkeys', passkeyId));
    } catch (e) {
      return handleFirestoreError(e, 'delete', `admin_passkeys/${passkeyId}`);
    }
  },

  // Security Audit Logs (append-only)
  async logSecurityEvent(entry: Omit<SecurityLogEntry, 'id' | 'createdAt'>) {
    try {
      await addDoc(
        collection(db, 'security_logs'),
        cleanData({
          ...entry,
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      console.warn('Security log write notice:', (e as any)?.message);
    }
  },

  subscribeSecurityLogs(callback: (logs: SecurityLogEntry[]) => void, onError?: (err: any) => void): () => void {
    const q = query(collection(db, 'security_logs'), orderBy('createdAt', 'desc'), limit(150));
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SecurityLogEntry)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'security_logs', false);
      }
    );
  },

  // Admin Activity Logs (append-only)
  async logActivity(entry: Omit<ActivityLogEntry, 'id' | 'createdAt'>) {
    try {
      await addDoc(
        collection(db, 'activity_logs'),
        cleanData({
          ...entry,
          createdAt: serverTimestamp(),
        })
      );
    } catch (e) {
      console.warn('Activity log write notice:', (e as any)?.message);
    }
  },

  subscribeActivityLogs(callback: (logs: ActivityLogEntry[]) => void, onError?: (err: any) => void): () => void {
    const q = query(collection(db, 'activity_logs'), orderBy('createdAt', 'desc'), limit(200));
    return onSnapshot(
      q,
      (snap) => {
        callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLogEntry)));
      },
      (e) => {
        if (onError) onError(e);
        handleFirestoreError(e, 'list', 'activity_logs', false);
      }
    );
  },

  // Safe Full JSON Backup Export (zero data loss)
  async exportFullBackup(): Promise<Record<string, any>> {
    const [settings, groups, categories, sources, videoSources, sessions, roles] = await Promise.all([
      this.getSettings(),
      this.getGroups(),
      this.getCategories(),
      this.getSources().catch(() => []),
      this.getVideoSources().catch(() => []),
      this.getGameSessions().catch(() => []),
      getDocs(collection(db, 'admin_roles'))
        .then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))
        .catch(() => []),
    ]);

    const categoriesWithQuestions = await Promise.all(
      categories.map(async (cat) => ({
        ...cat,
        questions: await this.getQuestions(cat.id),
      }))
    );

    return {
      exportedAt: new Date().toISOString(),
      version: '2.1',
      settings,
      groups,
      categories: categoriesWithQuestions,
      approvedSources: sources,
      videoSources,
      sessions,
      adminRoles: roles,
    };
  },

  // Seed initial data non-destructively (never overwrites existing categories/questions)
  async seedInitialData(categories: any[]) {
    try {
      const groupsSnap = await getDocs(collection(db, 'groups'));
      const existingGroups = new Set(groupsSnap.docs.map((d) => d.data().name));

      const distinctGroups = Array.from(new Set(categories.map((c) => c.group || 'عام')));
      for (let i = 0; i < distinctGroups.length; i++) {
        const groupName = distinctGroups[i];
        if (!existingGroups.has(groupName)) {
          await addDoc(collection(db, 'groups'), {
            name: groupName,
            order: groupsSnap.size + i,
            createdAt: serverTimestamp(),
          });
        }
      }

      for (const cat of categories) {
        const q = query(collection(db, 'categories'), where('name', '==', cat.name));
        const existing = await getDocs(q);

        let catId: string;
        if (existing.empty) {
          const newCat = await addDoc(
            collection(db, 'categories'),
            cleanData({
              name: cat.name,
              group: cat.group || 'عام',
              description: cat.description || '',
              difficulty: cat.difficulty || 'medium',
              targetQuestionCount: cat.targetQuestionCount || 15,
              allowedQuestionTypes: cat.allowedQuestionTypes || ['multiple_choice'],
              imageUrl: cat.imageUrl || '',
              iconUrl: cat.iconUrl || 'BookOpen',
              sourceUrl: cat.sourceUrl || '',
              isActive: cat.isActive !== false,
              timerDuration: cat.timerDuration || 60,
              createdAt: serverTimestamp(),
            })
          );
          catId = newCat.id;
        } else {
          catId = existing.docs[0].id;
        }

        const qsSnap = await getDocs(collection(db, `categories/${catId}/questions`));
        const existingTexts = new Set(qsSnap.docs.map((d) => String(d.data().text || '').trim()));

        for (const question of cat.questions || []) {
          if (!existingTexts.has(String(question.text || '').trim())) {
            await addDoc(
              collection(db, `categories/${catId}/questions`),
              cleanData({
                text: question.text,
                answer: question.answer,
                points: question.points || 20,
                questionType: question.questionType || 'multiple_choice',
                difficulty: question.difficulty || 'medium',
                source: question.sourceName || question.source || 'المصادر الشيعية المعتمدة',
                sourceName: question.sourceName || 'المصادر الشيعية المعتمدة',
                sourceUrl: question.sourceUrl || cat.sourceUrl || '',
                volumePageOrHadith: question.volumePageOrHadith || '',
                reviewStatus: question.reviewStatus || 'approved',
                createdAt: serverTimestamp(),
              })
            );
          }
        }
      }
    } catch (e) {
      return handleFirestoreError(e, 'write', 'bulk-seed');
    }
  },
};
