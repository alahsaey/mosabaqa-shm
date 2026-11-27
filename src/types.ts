/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestionDifficulty = 'easy' | 'medium' | 'hard' | 'expert';

export type QuestionType =
  | 'multiple_choice'
  | 'true_false'
  | 'complete_phrase'
  | 'who_said'
  | 'historical'
  | 'doctrinal'
  | 'fiqh'
  | 'islamic_figures'
  | 'occasions_events';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'archived';

export type Team = {
  id: string;
  name: string;
  score: number;
  selectedCategories: string[];
  categoriesLocked?: boolean;
  color?: string;
  participants?: string[];
  correctCount?: number;
  wrongCount?: number;
  skippedCount?: number;
};

export type Question = {
  id: string;
  categoryId?: string;
  text: string;
  answer: string;
  points: number;
  isAnswered: boolean;
  questionType?: QuestionType;
  difficulty?: QuestionDifficulty;
  options?: string[];
  hint?: string;
  source?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceId?: string;
  volumePageOrHadith?: string;
  originalExcerpt?: string;
  reviewStatus?: ReviewStatus;
  needsManualVerification?: boolean;
  verificationNote?: string;
  imageUrl?: string;
  videoUrl?: string;
  videoSourceId?: string;
  videoSourceName?: string;
  videoSourceType?: 'direct_video' | 'youtube' | 'uploaded_file';
  videoTotalDuration?: number;
  videoClips?: VideoClipSegment[];
  clipApproved?: boolean;
  confidenceScore?: number;
  qrEnabled?: boolean;
  letterMode?: boolean;
  imagesEnabled?: boolean;
  mapMode?: boolean;
  letter?: string;
  createdAt?: any;
  reviewedAt?: any;
  reviewedBy?: string;
};

export type VideoTranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

export type VideoClipSegment = {
  id: string;
  label?: string;
  startTime: number;
  endTime: number;
  duration: number;
  transcriptExcerpt: string;
  sceneDescription: string;
  confidence: number;
  provesAnswer: boolean;
  isApproved: boolean;
  cachedClipUrl?: string;
};

export type VideoSourceRecord = {
  id: string;
  title: string;
  videoUrl: string;
  streamUrl?: string;
  sourceType: 'direct_video' | 'youtube' | 'uploaded_file';
  approvedSourceId?: string;
  sourceName: string;
  sourceUrl?: string;
  totalDuration: number;
  thumbnailUrl?: string;
  transcriptSegments?: VideoTranscriptSegment[];
  fullTranscript?: string;
  status: 'idle' | 'processing' | 'ready' | 'restricted' | 'error';
  statusMessage?: string;
  restrictsDirectDownload?: boolean;
  isApproved: boolean;
  createdAt?: any;
};

export type Category = {
  id: string;
  name: string;
  questions: Question[];
  imageUrl?: string;
  iconUrl?: string;
  group?: string;
  sourceUrl?: string;
  sourceText?: string;
  lastSyncedAt?: any;
  borderColor?: string;
  customShadow?: string;
  order?: number;
  difficulty?: QuestionDifficulty;
  targetQuestionCount?: number;
  allowedQuestionTypes?: QuestionType[];
  linkedSourceIds?: string[];
  imagesEnabled?: boolean;
  letterMode?: boolean;
  qrEnabled?: boolean;
  videoEnabled?: boolean;
  mapMode?: boolean;
  imageMode?: boolean;
  timerDuration?: number;
  letter?: string;
  description?: string;
  isActive?: boolean;
  createdAt?: any;
};

export type ApprovedSourceType =
  | 'كتاب'
  | 'موقع إلكتروني'
  | 'موسوعة شيعية'
  | 'بحث علمي'
  | 'محاضرة موثقة'
  | 'مرجع فقهي';

export type ApprovedSource = {
  id: string;
  name: string;
  sourceType: ApprovedSourceType;
  author: string;
  publisher: string;
  url: string;
  classification: string;
  linkedCategoryIds: string[];
  isApproved: boolean;
  verifiedExcerpt?: string;
  lastCheckedAt?: any;
  lastCheckOk?: boolean;
  lastCheckMessage?: string;
  notes?: string;
  createdAt?: any;
};

export type UserRole = 'super_admin' | 'admin' | 'operator';

export type AdminPermissionKey =
  | 'manage_categories'
  | 'manage_questions'
  | 'approve_questions'
  | 'generate_ai'
  | 'manage_sources'
  | 'manage_scoring'
  | 'manage_settings'
  | 'view_reports'
  | 'manage_security'
  | 'manage_users';

export type SystemUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  passwordSalt: string;
  passwordHash: string;
  passwordIterations: number;
  permissions: Record<AdminPermissionKey, boolean>;
  isActive: boolean;
  isProtected?: boolean;
  biometricEnabled: boolean;
  credentialIds: string[];
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  createdBy?: string;
};

export type AuthSessionUser = {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  permissions: Record<AdminPermissionKey, boolean>;
  biometricEnabled: boolean;
  authMethod: 'password' | 'webauthn';
  isProtected?: boolean;
};

export type AdminRoleUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'owner' | 'subadmin';
  permissions: Record<AdminPermissionKey, boolean>;
  isActive: boolean;
  addedBy?: string;
  createdAt?: any;
};

export type AdminPasskeyRecord = {
  id: string;
  credentialId: string;
  userId: string;
  username: string;
  fullName?: string;
  role?: UserRole;
  publicKeyB64: string;
  counter: number;
  transports?: string[];
  rpId: string;
  deviceName: string;
  userEmailMasked?: string;
  isActive: boolean;
  integrityHash: string;
  verificationMode?: 'server' | 'client';
  createdAt?: any;
  lastUsedAt?: any;
};

export type SecurityLogEntry = {
  id?: string;
  eventType:
    | 'password_login_success'
    | 'password_login_failed'
    | 'password_login_blocked'
    | 'biometric_enrolled'
    | 'biometric_login_success'
    | 'biometric_login_failed'
    | 'biometric_revoked'
    | 'user_created'
    | 'user_updated'
    | 'user_deleted'
    | 'password_changed'
    | 'role_updated'
    | 'security_setting_changed'
    | 'admin_logout';
  email?: string;
  username?: string;
  actorName?: string;
  deviceName?: string;
  authMethod?: 'password' | 'webauthn' | 'system';
  result: 'success' | 'failed' | 'blocked';
  details?: string;
  createdAt?: any;
};

export type ActivityLogEntry = {
  id?: string;
  action: string;
  targetType?: 'category' | 'question' | 'source' | 'settings' | 'competition' | 'security';
  targetName?: string;
  actorEmail: string;
  details?: string;
  createdAt?: any;
};

export type ScoringSettings = {
  basePoints: number;
  easyPoints: number;
  mediumPoints: number;
  hardPoints: number;
  expertPoints: number;
  correctBonus: number;
  deductOnWrong: boolean;
  wrongDeductionAmount: number;
  questionsPerRound: number;
  calculationMode: 'total_points' | 'accuracy_weighted';
};

export type CompetitionConfig = {
  teamCount: number;
  categoriesPerTeam: number;
  timerDuration: number;
  allowReplay: boolean;
  showAnswerAfterTimeout: boolean;
  winnerCalculationMode: 'highest_score' | 'accuracy_tiebreaker';
  autoApproveVerifiedAI: boolean;
  enableVisualEffects: boolean;
  enableSoundEffects: boolean;
  enableBackgroundAmbience: boolean;
};

export type GameState = 'welcome' | 'setup' | 'selection' | 'question' | 'result';

export type ActiveQuestionPhase = 'first' | 'second' | 'expired' | 'resolved';

export type ActiveQuestionTimerState = {
  categoryId: string;
  questionId: string;
  primaryTeamId: string;
  secondaryTeamId: string;
  answeringTeamId: string;
  phase: ActiveQuestionPhase;
  phase1DurationSec: number;
  phase2DurationSec: number;
  questionOpenedAtServerMs: number;
  phaseStartedAtServerMs: number;
  phaseEndsAtServerMs: number;
  isPaused?: boolean;
  pausedRemainingMs?: number | null;
  phase1Attempted?: boolean;
  phase2Attempted?: boolean;
  resolvedTeamId?: string | null;
  resolvedOutcome?: 'correct' | 'wrong' | 'timeout' | 'skip' | null;
  transferReason?: 'timeout' | 'wrong' | null;
};

export type GameSession = {
  teams: Team[];
  categories: Category[];
  currentTurn: string;
  selectedCategoryId: string | null;
  selectedQuestionId: string | null;
  status: GameState;
  occupiedSlots: string[];
  reservedCategoryMap?: Record<string, string>;
  lockedTeamIds?: string[];
  selectionStageIndex?: number;
  activeQuestionState?: ActiveQuestionTimerState | null;
  startedAtMs?: number;
  lastActiveStatus?: Exclude<GameState, 'welcome' | 'result'>;
  answeredHistory?: {
    questionId: string;
    categoryId: string;
    teamId: string;
    isCorrect: boolean;
    pointsDelta: number;
    answeredAt: number;
  }[];
};
