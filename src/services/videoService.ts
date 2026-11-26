import { ApprovedSource, QuestionDifficulty, ScoringSettings, VideoClipSegment, VideoTranscriptSegment } from '../types';
import { getAdminAuthHeaders } from '../lib/adminAuthHeaders';

export interface VideoInspectResult {
  sourceType: 'direct_video' | 'youtube' | 'uploaded_file';
  title: string;
  thumbnailUrl?: string;
  totalDuration: number;
  transcriptSegments: VideoTranscriptSegment[];
  fullTranscript: string;
  restrictsDirectDownload: boolean;
  status: 'idle' | 'ready' | 'restricted' | 'error';
  message: string;
}

export interface VideoJobProgress {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  stepLabel: string;
  result?: any;
  error?: string;
}

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.includes('youtu.be')) {
      const id = u.pathname.replace(/^\/+/, '').split('/')[0];
      return id && id.length === 11 ? id : null;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v && v.length === 11) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'embed' || p === 'shorts' || p === 'live');
      if (idx >= 0 && parts[idx + 1]?.length === 11) return parts[idx + 1];
    }
    return null;
  } catch {
    return null;
  }
}

export function formatTimeMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export function parseTimeInputToSeconds(input: string): number {
  const cleaned = input.trim();
  if (!cleaned) return 0;
  if (/^\d+$/.test(cleaned)) return Math.max(0, Number(cleaned));
  const parts = cleaned.split(':').map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Math.max(0, parts[0] || 0);
}

export const videoService = {
  async uploadVideoFile(
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<{ fileId: string; streamUrl: string; totalDuration: number; hasAudio: boolean; fileSize: number }> {
    const authHeaders = await getAdminAuthHeaders();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/video/upload', true);
      xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
      xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
      Object.entries(authHeaders).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v);
      });

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && onProgress) {
          onProgress(Math.round((evt.loaded / evt.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(data);
          } else {
            reject(new Error(data.error || 'فشل رفع ملف الفيديو للخادم.'));
          }
        } catch {
          reject(new Error('استجابة غير صالحة من الخادم أثناء الرفع.'));
        }
      };

      xhr.onerror = () => reject(new Error('تعذر الاتصال بالخادم أثناء رفع الملف.'));
      xhr.send(file);
    });
  },

  async inspectVideo(params: { videoUrl?: string; streamUrl?: string }): Promise<VideoInspectResult> {
    const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/video/inspect', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'تعذر قراءة بيانات الفيديو.');
    }
    return data as VideoInspectResult;
  },

  async exportPhysicalClip(params: {
    videoUrl?: string;
    streamUrl?: string;
    startTime: number;
    endTime: number;
    restrictsDirectDownload?: boolean;
  }): Promise<{ cachedClipUrl: string; duration: number; message: string }> {
    const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch('/api/video/export-clip', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'تعذر تصدير المقطع المقتطع.');
    }
    return data;
  },

  async runAnalysisJob(
    params: {
      mode: 'match_question' | 'generate_from_video' | 'transcribe_only';
      videoUrl?: string;
      streamUrl?: string;
      videoTitle?: string;
      totalDuration?: number;
      transcriptSegments?: VideoTranscriptSegment[];
      manualTranscript?: string;
      approvedSource?: ApprovedSource;
      questionText?: string;
      answerText?: string;
      categoryName?: string;
      count?: number;
      difficulty?: QuestionDifficulty;
      scoringSettings?: ScoringSettings;
    },
    onJobUpdate?: (job: VideoJobProgress) => void
  ): Promise<VideoJobProgress> {
    const startHeaders = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
    const startRes = await fetch('/api/video/analyze', {
      method: 'POST',
      headers: startHeaders,
      body: JSON.stringify(params),
    });
    const startData = await startRes.json();
    if (!startRes.ok || !startData.jobId) {
      throw new Error(startData.error || 'تعذر بدء مهمة تحليل الفيديو.');
    }

    const jobId = String(startData.jobId);

    while (true) {
      await new Promise((r) => setTimeout(r, 1400));
      const pollHeaders = await getAdminAuthHeaders();
      const pollRes = await fetch(`/api/video/jobs/${encodeURIComponent(jobId)}`, {
        headers: pollHeaders,
      });
      const job = (await pollRes.json()) as VideoJobProgress;
      if (!pollRes.ok) {
        throw new Error((job as any)?.error || 'تعذر متابعة حالة تحليل الفيديو.');
      }
      onJobUpdate?.(job);

      if (job.status === 'completed') {
        return job;
      }
      if (job.status === 'failed') {
        throw new Error(job.error || 'فشل تحليل الفيديو في الخلفية.');
      }
    }
  },
};

export function areVideoClipsApproved(clips?: VideoClipSegment[], clipApproved?: boolean): boolean {
  if (!Array.isArray(clips) || clips.length === 0) return false;
  return Boolean(clipApproved) || clips.some((c) => c.isApproved);
}
