import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Film,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { VideoClipSegment } from '../../types';
import { extractYouTubeVideoId, formatTimeMMSS } from '../../services/videoService';

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface BoundedVideoClipPlayerProps {
  videoUrl: string;
  clips: VideoClipSegment[];
  sourceName?: string;
  answerRevealed?: boolean;
}

let ytApiPromise: Promise<void> | null = null;
function loadYouTubeIframeApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.YT && window.YT.Player) return Promise.resolve();
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise<void>((resolve) => {
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      resolve();
    };
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
  return ytApiPromise;
}

export const BoundedVideoClipPlayer: React.FC<BoundedVideoClipPlayerProps> = ({
  videoUrl,
  clips,
  sourceName,
  answerRevealed = false,
}) => {
  const approvedClips = useMemo(() => {
    const filtered = (clips || []).filter((c) => c.isApproved);
    return filtered.length > 0 ? filtered : clips || [];
  }, [clips]);

  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const activeClip = approvedClips[activeClipIndex] || approvedClips[0];

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasEnded, setHasEnded] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [relativeTime, setRelativeTime] = useState(0);

  const isPlayingRef = useRef(false);
  const isMutedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<any>(null);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const isPhysicalExportedClip = Boolean(activeClip?.cachedClipUrl);
  const ytVideoId = useMemo(
    () => (isPhysicalExportedClip ? null : extractYouTubeVideoId(videoUrl)),
    [videoUrl, isPhysicalExportedClip]
  );

  const clipStart = isPhysicalExportedClip ? 0 : Math.max(0, Number(activeClip?.startTime || 0));
  const clipEnd = isPhysicalExportedClip
    ? Math.max(1, Number(activeClip?.duration || (activeClip ? activeClip.endTime - activeClip.startTime : 15)))
    : Math.max(clipStart + 1, Number(activeClip?.endTime || clipStart + 15));
  const clipDuration = Math.max(1, clipEnd - clipStart);

  // Reset state when switching clip
  useEffect(() => {
    setIsPlaying(false);
    setHasEnded(false);
    setRelativeTime(0);
  }, [activeClip?.id, videoUrl]);

  // Direct HTML5 <video> bounded clamp
  useEffect(() => {
    if (ytVideoId || !videoRef.current || !activeClip) return;
    const el = videoRef.current;

    const handleLoaded = () => {
      try {
        el.currentTime = clipStart;
      } catch {}
    };

    const handleTimeUpdate = () => {
      const cur = el.currentTime;
      if (cur < clipStart - 0.35) {
        el.currentTime = clipStart;
        setRelativeTime(0);
        return;
      }
      if (cur >= clipEnd) {
        el.pause();
        el.currentTime = clipStart;
        setIsPlaying(false);
        setHasEnded(true);
        setRelativeTime(clipDuration);
        return;
      }
      setRelativeTime(Math.max(0, Math.min(clipDuration, cur - clipStart)));
    };

    const handleSeeking = () => {
      if (el.currentTime < clipStart || el.currentTime > clipEnd) {
        el.currentTime = Math.max(clipStart, Math.min(clipEnd, el.currentTime));
      }
    };

    const handlePlay = () => {
      if (el.currentTime < clipStart || el.currentTime >= clipEnd) {
        el.currentTime = clipStart;
      }
      setIsPlaying(true);
      setHasEnded(false);
    };

    const handlePause = () => setIsPlaying(false);

    el.addEventListener('loadedmetadata', handleLoaded);
    el.addEventListener('timeupdate', handleTimeUpdate);
    el.addEventListener('seeking', handleSeeking);
    el.addEventListener('play', handlePlay);
    el.addEventListener('pause', handlePause);

    return () => {
      el.removeEventListener('loadedmetadata', handleLoaded);
      el.removeEventListener('timeupdate', handleTimeUpdate);
      el.removeEventListener('seeking', handleSeeking);
      el.removeEventListener('play', handlePlay);
      el.removeEventListener('pause', handlePause);
    };
  }, [ytVideoId, activeClip?.id, clipStart, clipEnd, clipDuration]);

  // YouTube IFrame Bounded Controller
  useEffect(() => {
    if (!ytVideoId || !ytContainerRef.current || !activeClip) return;
    let destroyed = false;
    let pollId: number | null = null;

    loadYouTubeIframeApi().then(() => {
      if (destroyed || !ytContainerRef.current || !window.YT?.Player) return;

      if (ytPlayerRef.current?.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
      }

      ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
        videoId: ytVideoId,
        playerVars: {
          controls: 0,
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          start: Math.floor(clipStart),
          end: Math.ceil(clipEnd),
        },
        events: {
          onReady: (ev: any) => {
            try {
              ev.target.seekTo(clipStart, true);
              ev.target.pauseVideo();
              if (isMutedRef.current) ev.target.mute();
            } catch {}
          },
          onStateChange: (ev: any) => {
            const state = ev.data;
            if (state === window.YT.PlayerState.PLAYING) {
              isPlayingRef.current = true;
              setIsPlaying(true);
              setHasEnded(false);
            } else if (state === window.YT.PlayerState.PAUSED) {
              isPlayingRef.current = false;
              setIsPlaying(false);
            } else if (state === window.YT.PlayerState.ENDED) {
              isPlayingRef.current = false;
              setIsPlaying(false);
              setHasEnded(true);
              setRelativeTime(clipDuration);
            }
          },
        },
      });

      pollId = window.setInterval(() => {
        const player = ytPlayerRef.current;
        if (!player || typeof player.getCurrentTime !== 'function') return;
        const t = Number(player.getCurrentTime() || 0);
        if (t < clipStart - 0.8 && isPlayingRef.current) {
          player.seekTo(clipStart, true);
          return;
        }
        if (t >= clipEnd) {
          player.pauseVideo();
          player.seekTo(clipStart, true);
          isPlayingRef.current = false;
          setIsPlaying(false);
          setHasEnded(true);
          setRelativeTime(clipDuration);
          return;
        }
        if (t >= clipStart) {
          setRelativeTime(Math.max(0, Math.min(clipDuration, t - clipStart)));
        }
      }, 220);
    });

    return () => {
      destroyed = true;
      if (pollId) window.clearInterval(pollId);
      if (ytPlayerRef.current?.destroy) {
        try {
          ytPlayerRef.current.destroy();
        } catch {}
        ytPlayerRef.current = null;
      }
    };
  }, [ytVideoId, activeClip?.id, clipStart, clipEnd, clipDuration]);

  if (!activeClip) return null;

  const togglePlay = () => {
    if (ytVideoId) {
      const p = ytPlayerRef.current;
      if (!p) return;
      if (isPlaying) {
        p.pauseVideo();
      } else {
        if (hasEnded || relativeTime >= clipDuration - 0.4) {
          p.seekTo(clipStart, true);
          setRelativeTime(0);
          setHasEnded(false);
        }
        p.playVideo();
      }
      return;
    }

    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (hasEnded || v.currentTime < clipStart || v.currentTime >= clipEnd - 0.3) {
        v.currentTime = clipStart;
        setRelativeTime(0);
        setHasEnded(false);
      }
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const handleReplay = () => {
    setHasEnded(false);
    setRelativeTime(0);
    if (ytVideoId) {
      const p = ytPlayerRef.current;
      if (p) {
        p.seekTo(clipStart, true);
        p.playVideo();
      }
      return;
    }
    const v = videoRef.current;
    if (v) {
      v.currentTime = clipStart;
      v.play().catch(() => {});
    }
  };

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (ytVideoId && ytPlayerRef.current) {
      if (next) ytPlayerRef.current.mute();
      else ytPlayerRef.current.unMute();
    } else if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const handleBoundedScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rel = Math.max(0, Math.min(clipDuration, Number(e.target.value) || 0));
    setRelativeTime(rel);
    setHasEnded(false);
    const absTarget = clipStart + rel;
    if (ytVideoId && ytPlayerRef.current) {
      ytPlayerRef.current.seekTo(absTarget, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime = absTarget;
    }
  };

  const mediaSrc = activeClip.cachedClipUrl || videoUrl;

  return (
    <div className="rounded-2xl bg-[#07111E] border border-[#C9A24D]/45 overflow-hidden shadow-xl">
      {/* Compact Broadcast Clip Header */}
      <div className="px-4 py-2.5 bg-[#0B192C] border-b border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2 font-bold text-[#D9B768]">
          <Film className="w-4 h-4 text-[#C9A24D]" />
          <span>مشهد موثق مرتبط بالسؤال</span>
          {sourceName && <span className="text-slate-400 font-normal">• {sourceName}</span>}
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-slate-300 tabular-nums">
          <Clock className="w-3.5 h-3.5 text-[#C9A24D]" />
          <span>المدة المقتطعة: {formatTimeMMSS(clipDuration)}</span>
        </div>
      </div>

      {/* Multi-clip switcher (only if question spans multiple approved clips) */}
      {approvedClips.length > 1 && (
        <div className="px-4 py-2 bg-[#0B192C]/80 border-b border-white/10 flex flex-wrap gap-2">
          {approvedClips.map((c, idx) => (
            <button
              key={c.id || idx}
              type="button"
              onClick={() => setActiveClipIndex(idx)}
              className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                idx === activeClipIndex
                  ? 'bg-[#C9A24D] text-[#0B192C]'
                  : 'bg-white/10 text-slate-300 hover:bg-white/15'
              }`}
            >
              {c.label || `المشهد ${idx + 1}`} ({formatTimeMMSS(c.duration || c.endTime - c.startTime)})
            </button>
          ))}
        </div>
      )}

      {/* Viewport */}
      <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
        {ytVideoId ? (
          <>
            <div ref={ytContainerRef} className="w-full h-full pointer-events-none select-none" />
            {/* Transparent protective shield prevents clicking external YouTube links/logos */}
            <div
              onClick={togglePlay}
              className="absolute inset-0 z-10 cursor-pointer flex items-center justify-center"
              title={isPlaying ? 'إيقاف مؤقت' : 'تشغيل المشهد'}
            >
              {!isPlaying && (
                <div className="w-16 h-16 rounded-full bg-[#0B192C]/90 border-2 border-[#C9A24D] text-[#D9B768] flex items-center justify-center shadow-2xl">
                  {hasEnded ? <RotateCcw className="w-7 h-7" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <video
              ref={videoRef}
              src={mediaSrc}
              playsInline
              preload="metadata"
              controlsList="nodownload noplaybackrate"
              disablePictureInPicture
              muted={isMuted}
              onClick={togglePlay}
              className="w-full h-full object-contain cursor-pointer"
            />
            {!isPlaying && (
              <button
                type="button"
                onClick={togglePlay}
                className="absolute z-10 w-16 h-16 rounded-full bg-[#0B192C]/90 border-2 border-[#C9A24D] text-[#D9B768] flex items-center justify-center shadow-2xl cursor-pointer"
                aria-label={hasEnded ? 'إعادة تشغيل المشهد' : 'تشغيل المشهد'}
              >
                {hasEnded ? <RotateCcw className="w-7 h-7" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
              </button>
            )}
          </>
        )}
      </div>

      {/* Strictly Bounded Custom Control Bar (Scrubbing ONLY within [0 .. clipDuration]) */}
      <div className="px-4 py-3 bg-[#0B192C] border-t border-white/10 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="px-3.5 py-1.5 rounded-lg bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
          <span>{isPlaying ? 'إيقاف' : 'تشغيل'}</span>
        </button>

        <button
          type="button"
          onClick={handleReplay}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <RotateCcw className="w-3.5 h-3.5 text-[#C9A24D]" />
          <span>إعادة المشهد</span>
        </button>

        {/* Bounded Scrub Bar */}
        <div className="flex-1 flex items-center gap-2 min-w-[140px]">
          <span className="text-[11px] font-mono text-slate-300 tabular-nums">
            {formatTimeMMSS(relativeTime)}
          </span>
          <input
            type="range"
            min={0}
            max={clipDuration}
            step={0.5}
            value={relativeTime}
            onChange={handleBoundedScrub}
            aria-label="شريط تقديم المشهد المقتطع"
            className="flex-1 accent-[#C9A24D] cursor-pointer h-1.5 bg-white/20 rounded-lg"
          />
          <span className="text-[11px] font-mono text-[#D9B768] tabular-nums">
            {formatTimeMMSS(clipDuration)}
          </span>
        </div>

        <button
          type="button"
          onClick={toggleMute}
          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-200 cursor-pointer"
          aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Show verified scene excerpt & description AFTER answer is revealed to avoid spoilers */}
      {answerRevealed && (activeClip.sceneDescription || activeClip.transcriptExcerpt) && (
        <div className="px-4 py-3 bg-[#07111E] border-t border-white/10 space-y-1 text-xs text-right">
          <div className="flex items-center gap-1.5 font-bold text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>الشاهد من المشهد الموثق</span>
          </div>
          {activeClip.sceneDescription && <p className="text-slate-300">{activeClip.sceneDescription}</p>}
          {activeClip.transcriptExcerpt && (
            <p className="text-slate-200 bg-[#13253E]/70 p-2.5 rounded-xl border border-white/10 mt-1">
              «{activeClip.transcriptExcerpt}»
            </p>
          )}
        </div>
      )}
    </div>
  );
};
