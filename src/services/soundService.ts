// Web Audio API procedural broadcast sound effects with per-category volume control & optional custom audio URL override

export type SoundEffectType =
  | 'correct'
  | 'wrong'
  | 'victory'
  | 'intro'
  | 'click'
  | 'tick'
  | 'reveal'
  | 'turnTransfer'
  | 'turnSwitch'
  | 'timeout';

export type SoundCategory = 'turnSwitch' | 'timer' | 'answers' | 'ceremony' | 'ui';

export type SoundVolumes = Record<SoundCategory, number>;

export const SOUND_VOLUMES_STORAGE_KEY = 'abf_sound_volumes_v1';

export const DEFAULT_SOUND_VOLUMES: SoundVolumes = {
  turnSwitch: 0.8,
  timer: 0.65,
  answers: 0.75,
  ceremony: 0.7,
  ui: 0.45,
};

export interface SoundCategoryMeta {
  id: SoundCategory;
  label: string;
  description: string;
  previewSound: SoundEffectType;
}

export const SOUND_CATEGORY_META: SoundCategoryMeta[] = [
  {
    id: 'turnSwitch',
    label: 'تبديل الأدوار وانتقال الوقت',
    description: 'نغمة انتهاء وقت الفريق الأول وبدء وقت الفريق الثاني وتبديل الدور',
    previewSound: 'turnTransfer',
  },
  {
    id: 'timer',
    label: 'المؤقت والعد التنازلي',
    description: 'دقات الثواني العشر الأخيرة وتنبيه انتهاء الوقت الكامل',
    previewSound: 'tick',
  },
  {
    id: 'answers',
    label: 'الإجابات (صحيحة وخاطئة)',
    description: 'تنبيهات اعتماد الإجابة الصحيحة أو الخاطئة',
    previewSound: 'correct',
  },
  {
    id: 'ceremony',
    label: 'التتويج وكشف الأسئلة',
    description: 'أصوات افتتاح السؤال وبداية الجولة ومنصة التتويج',
    previewSound: 'victory',
  },
  {
    id: 'ui',
    label: 'نقرات الواجهة والأزرار',
    description: 'أصوات التنقل والاختيار السريع في اللوحة',
    previewSound: 'click',
  },
];

export function getSoundCategory(type: SoundEffectType): SoundCategory {
  switch (type) {
    case 'turnTransfer':
    case 'turnSwitch':
      return 'turnSwitch';
    case 'tick':
    case 'timeout':
      return 'timer';
    case 'correct':
    case 'wrong':
      return 'answers';
    case 'victory':
    case 'intro':
    case 'reveal':
      return 'ceremony';
    case 'click':
    default:
      return 'ui';
  }
}

export function clampVolume(val: unknown, fallback: number): number {
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(1, Math.round(num * 100) / 100));
}

export function normalizeSoundVolumes(raw?: Partial<Record<SoundCategory, unknown>> | null): SoundVolumes {
  return {
    turnSwitch: clampVolume(raw?.turnSwitch, DEFAULT_SOUND_VOLUMES.turnSwitch),
    timer: clampVolume(raw?.timer, DEFAULT_SOUND_VOLUMES.timer),
    answers: clampVolume(raw?.answers, DEFAULT_SOUND_VOLUMES.answers),
    ceremony: clampVolume(raw?.ceremony, DEFAULT_SOUND_VOLUMES.ceremony),
    ui: clampVolume(raw?.ui, DEFAULT_SOUND_VOLUMES.ui),
  };
}

export function loadLocalSoundVolumes(): SoundVolumes | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem(SOUND_VOLUMES_STORAGE_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object') {
      return normalizeSoundVolumes(parsed);
    }
  } catch {}
  return null;
}

export function saveLocalSoundVolumes(volumes: SoundVolumes): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_VOLUMES_STORAGE_KEY, JSON.stringify(normalizeSoundVolumes(volumes)));
  } catch {}
}

class SoundService {
  private ctx: AudioContext | null = null;
  private activeAudios: Set<HTMLAudioElement> = new Set();

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    volume = 0.2,
    delay = 0,
    endFreq?: number
  ) {
    const ctx = this.getAudioContext();
    if (!ctx || volume <= 0.001) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (typeof endFreq === 'number' && endFreq > 0) {
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + duration);
    }
    const peak = Math.max(0.002, Math.min(1, volume));
    gain.gain.setValueAtTime(0.0008, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.018, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.025);
  }

  stopAll() {
    this.activeAudios.forEach((audio) => {
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
    });
    this.activeAudios.clear();
  }

  play(
    type: SoundEffectType,
    options?: {
      enabled?: boolean;
      customUrl?: string;
      volume?: number;
    }
  ) {
    if (options?.enabled === false) return;
    const vol = Math.max(0, Math.min(1, options?.volume ?? 0.6));
    if (vol <= 0.001) return;

    if (options?.customUrl && options.customUrl.trim()) {
      try {
        const audio = new Audio(options.customUrl.trim());
        audio.volume = vol;
        this.activeAudios.add(audio);
        audio.onended = () => this.activeAudios.delete(audio);
        audio.play().catch(() => {
          this.activeAudios.delete(audio);
          this.playSynth(type, vol);
        });
        return;
      } catch {
        // fallback to Web Audio synth
      }
    }

    this.playSynth(type, vol);
  }

  private playSynth(type: SoundEffectType, volume: number) {
    if (volume <= 0.001) return;
    const v = Math.min(0.5, volume * 0.5);
    switch (type) {
      case 'click':
        this.playTone(620, 0.06, 'sine', v * 0.45);
        break;
      case 'reveal':
        this.playTone(440, 0.12, 'triangle', v * 0.55, 0);
        this.playTone(660, 0.18, 'triangle', v * 0.5, 0.07);
        break;
      case 'tick':
        this.playTone(880, 0.075, 'sine', v * 0.42);
        break;
      case 'turnTransfer':
        // Distinctive two-stage TV broadcast cue:
        // Stage 1: Crisp closing tone signaling Team 1's 60s ended
        this.playTone(392.0, 0.15, 'triangle', v * 0.72, 0);
        this.playTone(587.33, 0.15, 'sine', v * 0.35, 0);
        // Stage 2: Bright ascending 3-note chime signaling Team 2's 30s turn has started
        this.playTone(659.25, 0.14, 'triangle', v * 0.8, 0.19);
        this.playTone(783.99, 0.14, 'triangle', v * 0.82, 0.31);
        this.playTone(987.77, 0.3, 'triangle', v * 0.88, 0.43);
        this.playTone(493.88, 0.3, 'sine', v * 0.3, 0.43);
        break;
      case 'turnSwitch':
        // Clean, warm 2-note ascending transition chime for general turn handoffs
        this.playTone(587.33, 0.12, 'triangle', v * 0.62, 0);
        this.playTone(880.0, 0.22, 'triangle', v * 0.68, 0.11);
        this.playTone(440.0, 0.2, 'sine', v * 0.22, 0.11);
        break;
      case 'timeout':
        // Distinct double low broadcast time-expired buzzer (end of full question time)
        this.playTone(311.13, 0.2, 'triangle', v * 0.75, 0, 293.66);
        this.playTone(155.56, 0.2, 'sawtooth', v * 0.25, 0);
        this.playTone(233.08, 0.38, 'triangle', v * 0.78, 0.23, 207.65);
        this.playTone(116.54, 0.38, 'sawtooth', v * 0.25, 0.23);
        break;
      case 'correct':
        this.playTone(523.25, 0.14, 'triangle', v * 0.8, 0);
        this.playTone(659.25, 0.16, 'triangle', v * 0.8, 0.09);
        this.playTone(783.99, 0.28, 'triangle', v * 0.85, 0.18);
        break;
      case 'wrong':
        this.playTone(260, 0.18, 'sawtooth', v * 0.45, 0);
        this.playTone(195, 0.28, 'sawtooth', v * 0.4, 0.14);
        break;
      case 'victory':
        this.playTone(523.25, 0.16, 'triangle', v * 0.85, 0);
        this.playTone(659.25, 0.16, 'triangle', v * 0.85, 0.12);
        this.playTone(783.99, 0.18, 'triangle', v * 0.85, 0.24);
        this.playTone(1046.5, 0.45, 'triangle', v * 0.9, 0.36);
        break;
      case 'intro':
        this.playTone(392.0, 0.22, 'sine', v * 0.55, 0);
        this.playTone(493.88, 0.22, 'sine', v * 0.55, 0.15);
        this.playTone(587.33, 0.36, 'sine', v * 0.65, 0.3);
        break;
    }
  }
}

export const soundService = new SoundService();
