import { ActiveQuestionTimerState } from '../types';

const OFFSET_CACHE_KEY = 'abf_server_clock_offset_ms_v1';

class TimeSyncService {
  private offsetMs = 0;
  private synced = false;
  private syncingPromise: Promise<number> | null = null;

  constructor() {
    try {
      const saved = sessionStorage.getItem(OFFSET_CACHE_KEY);
      if (saved !== null) {
        const parsed = Number(saved);
        if (Number.isFinite(parsed)) {
          this.offsetMs = parsed;
        }
      }
    } catch {}
  }

  getOffsetMs(): number {
    return this.offsetMs;
  }

  isSynced(): boolean {
    return this.synced;
  }

  getSyncedNowMs(): number {
    return Date.now() + this.offsetMs;
  }

  async syncServerClock(force = false): Promise<number> {
    if (this.syncingPromise && !force) {
      return this.syncingPromise;
    }

    this.syncingPromise = (async () => {
      try {
        const t0 = Date.now();
        const res = await fetch('/api/time', {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
        const t1 = Date.now();
        if (!res.ok) return this.offsetMs;
        const data = await res.json();
        const serverTime = Number(data?.serverTime);
        if (Number.isFinite(serverTime) && serverTime > 0) {
          const estimatedClientAtMidpoint = Math.round((t0 + t1) / 2);
          this.offsetMs = serverTime - estimatedClientAtMidpoint;
          this.synced = true;
          try {
            sessionStorage.setItem(OFFSET_CACHE_KEY, String(this.offsetMs));
          } catch {}
        }
      } catch {
        // Keep last known offset silently if temporarily offline
      } finally {
        this.syncingPromise = null;
      }
      return this.offsetMs;
    })();

    return this.syncingPromise;
  }
}

export const timeSyncService = new TimeSyncService();

export interface TimerSnapshotResult {
  phase: 'first' | 'second' | 'expired' | 'resolved';
  answeringTeamId: string;
  remainingMs: number;
  remainingSec: number;
  autoTransitionedToSecond: boolean;
  autoExpiredAll: boolean;
  newPhaseStartedAt?: number;
  newPhaseEndsAt?: number;
}

export function computeEffectiveTimerSnapshot(
  state: ActiveQuestionTimerState | null | undefined,
  syncedNowMs: number
): TimerSnapshotResult | null {
  if (!state) return null;

  if (state.phase === 'resolved') {
    return {
      phase: 'resolved',
      answeringTeamId: state.resolvedTeamId || state.answeringTeamId,
      remainingMs: 0,
      remainingSec: 0,
      autoTransitionedToSecond: false,
      autoExpiredAll: false,
    };
  }

  if (state.phase === 'expired') {
    return {
      phase: 'expired',
      answeringTeamId: state.secondaryTeamId,
      remainingMs: 0,
      remainingSec: 0,
      autoTransitionedToSecond: false,
      autoExpiredAll: false,
    };
  }

  if (state.isPaused && typeof state.pausedRemainingMs === 'number') {
    const clamped = Math.max(0, state.pausedRemainingMs);
    return {
      phase: state.phase,
      answeringTeamId: state.answeringTeamId,
      remainingMs: clamped,
      remainingSec: Math.ceil(clamped / 1000),
      autoTransitionedToSecond: false,
      autoExpiredAll: false,
    };
  }

  if (state.phase === 'first') {
    const diffMs = state.phaseEndsAtServerMs - syncedNowMs;
    if (diffMs > 0) {
      return {
        phase: 'first',
        answeringTeamId: state.primaryTeamId,
        remainingMs: diffMs,
        remainingSec: Math.ceil(diffMs / 1000),
        autoTransitionedToSecond: false,
        autoExpiredAll: false,
      };
    }

    // Phase 1 expired: compute Phase 2 exact bounds without granting extra time
    const p2StartMs = state.phaseEndsAtServerMs;
    const p2EndMs = p2StartMs + state.phase2DurationSec * 1000;
    const p2DiffMs = p2EndMs - syncedNowMs;

    if (p2DiffMs > 0) {
      return {
        phase: 'second',
        answeringTeamId: state.secondaryTeamId,
        remainingMs: p2DiffMs,
        remainingSec: Math.ceil(p2DiffMs / 1000),
        autoTransitionedToSecond: true,
        autoExpiredAll: false,
        newPhaseStartedAt: p2StartMs,
        newPhaseEndsAt: p2EndMs,
      };
    }

    return {
      phase: 'expired',
      answeringTeamId: state.secondaryTeamId,
      remainingMs: 0,
      remainingSec: 0,
      autoTransitionedToSecond: false,
      autoExpiredAll: true,
    };
  }

  // state.phase === 'second'
  const diffMs = state.phaseEndsAtServerMs - syncedNowMs;
  if (diffMs > 0) {
    return {
      phase: 'second',
      answeringTeamId: state.secondaryTeamId,
      remainingMs: diffMs,
      remainingSec: Math.ceil(diffMs / 1000),
      autoTransitionedToSecond: false,
      autoExpiredAll: false,
    };
  }

  return {
    phase: 'expired',
    answeringTeamId: state.secondaryTeamId,
    remainingMs: 0,
    remainingSec: 0,
    autoTransitionedToSecond: false,
    autoExpiredAll: true,
  };
}
