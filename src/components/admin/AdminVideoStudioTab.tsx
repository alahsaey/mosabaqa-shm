import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Film,
  Upload,
  Link as LinkIcon,
  Sparkles,
  Play,
  Pause,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  RefreshCcw,
  Plus,
  Trash2,
  Loader2,
  Clock,
  BookOpen,
  FileText,
  Download,
  Check,
} from 'lucide-react';
import {
  ApprovedSource,
  Category,
  Question,
  QuestionDifficulty,
  ScoringSettings,
  VideoClipSegment,
  VideoSourceRecord,
  VideoTranscriptSegment,
} from '../../types';
import { dataService } from '../../lib/dataService';
import {
  extractYouTubeVideoId,
  formatTimeMMSS,
  parseTimeInputToSeconds,
  VideoJobProgress,
  videoService,
} from '../../services/videoService';
import { DIFFICULTY_LABELS } from '../../constants';

interface AdminVideoStudioTabProps {
  categories: Category[];
  sources: ApprovedSource[];
  videoSources: VideoSourceRecord[];
  scoringSettings: ScoringSettings;
  actorEmail: string;
  initialQuestionSelection?: { catId: string; questionId: string } | null;
}

declare global {
  interface Window {
    YT?: any;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export const AdminVideoStudioTab: React.FC<AdminVideoStudioTabProps> = ({
  categories,
  sources,
  videoSources,
  scoringSettings,
  actorEmail,
  initialQuestionSelection,
}) => {
  const approvedTextSources = useMemo(() => sources.filter((s) => s.isApproved), [sources]);

  // Add / Upload Video Source form state
  const [newTitle, setNewTitle] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newApprovedSourceId, setNewApprovedSourceId] = useState(approvedTextSources[0]?.id || '');
  const [manualTranscriptInput, setManualTranscriptInput] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [inspecting, setInspecting] = useState(false);

  // Active workspace selection
  const [selectedVideoId, setSelectedVideoId] = useState<string>(videoSources[0]?.id || '');
  const [selectedCatId, setSelectedCatId] = useState<string>(
    initialQuestionSelection?.catId || categories[0]?.id || ''
  );
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(
    initialQuestionSelection?.questionId || ''
  );
  const [studioMode, setStudioMode] = useState<'match' | 'generate'>('match');

  // Job Progress
  const [activeJob, setActiveJob] = useState<VideoJobProgress | null>(null);
  const [runningJob, setRunningJob] = useState(false);

  // AI Video Question Generation state
  const [genDifficulty, setGenDifficulty] = useState<QuestionDifficulty>('medium');
  const [genCount, setGenCount] = useState(3);
  const [generatedQuestions, setGeneratedQuestions] = useState<any[]>([]);

  // Interactive Clip Editor state
  const [editorClips, setEditorClips] = useState<VideoClipSegment[]>([]);
  const [activeClipIdx, setActiveClipIdx] = useState(0);
  const [editorAlert, setEditorAlert] = useState<string | null>(null);
  const [editorSuccess, setEditorSuccess] = useState<string | null>(null);
  const [savingClip, setSavingClip] = useState(false);
  const [exportingPhysical, setExportingPhysical] = useState(false);

  // Preview Player State
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewYtContainerRef = useRef<HTMLDivElement | null>(null);
  const previewYtPlayerRef = useRef<any>(null);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<'start' | 'end' | null>(null);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewingClipOnly, setPreviewingClipOnly] = useState(false);

  // Manual MM:SS text fields synced with activeClip
  const activeClip = editorClips[activeClipIdx] || null;
  const [startInputStr, setStartInputStr] = useState('00:00');
  const [endInputStr, setEndInputStr] = useState('00:30');

  useEffect(() => {
    if (!newApprovedSourceId && approvedTextSources[0]?.id) {
      setNewApprovedSourceId(approvedTextSources[0].id);
    }
  }, [approvedTextSources, newApprovedSourceId]);

  useEffect(() => {
    if (initialQuestionSelection?.catId && initialQuestionSelection?.questionId) {
      setSelectedCatId(initialQuestionSelection.catId);
      setSelectedQuestionId(initialQuestionSelection.questionId);
      setStudioMode('match');
    }
  }, [initialQuestionSelection]);

  useEffect(() => {
    if (!selectedVideoId && videoSources[0]?.id) {
      setSelectedVideoId(videoSources[0].id);
    }
  }, [videoSources, selectedVideoId]);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCatId) || categories[0],
    [categories, selectedCatId]
  );

  const selectedQuestion: Question | undefined = useMemo(() => {
    const qs = selectedCategory?.questions || [];
    return qs.find((q) => q.id === selectedQuestionId) || qs[0];
  }, [selectedCategory, selectedQuestionId]);

  useEffect(() => {
    if (selectedCategory && !selectedCategory.questions.some((q) => q.id === selectedQuestionId)) {
      setSelectedQuestionId(selectedCategory.questions[0]?.id || '');
    }
  }, [selectedCategory, selectedQuestionId]);

  const selectedVideo: VideoSourceRecord | undefined = useMemo(() => {
    if (selectedQuestion?.videoSourceId) {
      const byQ = videoSources.find((v) => v.id === selectedQuestion.videoSourceId);
      if (byQ) return byQ;
    }
    return videoSources.find((v) => v.id === selectedVideoId) || videoSources[0];
  }, [videoSources, selectedVideoId, selectedQuestion?.videoSourceId]);

  // Load existing clips when selectedQuestion changes
  useEffect(() => {
    if (!selectedQuestion) {
      setEditorClips([]);
      return;
    }
    if (selectedQuestion.videoClips && selectedQuestion.videoClips.length > 0) {
      setEditorClips(selectedQuestion.videoClips);
      setActiveClipIdx(0);
      if (selectedQuestion.videoSourceId) setSelectedVideoId(selectedQuestion.videoSourceId);
    } else {
      setEditorClips([]);
    }
    setEditorAlert(selectedQuestion.needsManualVerification ? selectedQuestion.verificationNote || null : null);
    setEditorSuccess(null);
  }, [selectedQuestion?.id]);

  // Sync MM:SS text inputs when active clip bounds change
  useEffect(() => {
    if (activeClip) {
      setStartInputStr(formatTimeMMSS(activeClip.startTime));
      setEndInputStr(formatTimeMMSS(activeClip.endTime));
    }
  }, [activeClip?.id, activeClip?.startTime, activeClip?.endTime]);

  const effectiveMediaUrl = selectedVideo?.streamUrl || selectedVideo?.videoUrl || selectedQuestion?.videoUrl || '';
  const ytId = useMemo(() => extractYouTubeVideoId(effectiveMediaUrl), [effectiveMediaUrl]);
  const totalDuration = useMemo(() => {
    const d = Number(selectedVideo?.totalDuration || selectedQuestion?.videoTotalDuration || 0);
    if (d > 0) return d;
    if (activeClip && activeClip.endTime > 0) return Math.max(activeClip.endTime + 30, 120);
    return 180;
  }, [selectedVideo?.totalDuration, selectedQuestion?.videoTotalDuration, activeClip]);

  // Setup YouTube IFrame preview player for admin timeline review
  useEffect(() => {
    if (!ytId || !previewYtContainerRef.current) return;
    let destroyed = false;
    let poll: number | null = null;

    const initYt = () => {
      if (destroyed || !previewYtContainerRef.current || !window.YT?.Player) return;
      if (previewYtPlayerRef.current?.destroy) {
        try {
          previewYtPlayerRef.current.destroy();
        } catch {}
      }
      previewYtPlayerRef.current = new window.YT.Player(previewYtContainerRef.current, {
        videoId: ytId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (ev: any) => {
            setPreviewPlaying(ev.data === window.YT.PlayerState.PLAYING);
          },
        },
      });
      poll = window.setInterval(() => {
        const p = previewYtPlayerRef.current;
        if (!p || typeof p.getCurrentTime !== 'function') return;
        const t = Number(p.getCurrentTime() || 0);
        setPreviewCurrentTime(t);
      }, 250);
    };

    if (window.YT?.Player) {
      initYt();
    } else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        initYt();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const s = document.createElement('script');
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }

    return () => {
      destroyed = true;
      if (poll) window.clearInterval(poll);
      if (previewYtPlayerRef.current?.destroy) {
        try {
          previewYtPlayerRef.current.destroy();
        } catch {}
        previewYtPlayerRef.current = null;
      }
    };
  }, [ytId]);

  // Enforce stop at endTime during "Preview Trimmed Clip"
  useEffect(() => {
    if (!previewingClipOnly || !activeClip) return;
    if (previewCurrentTime >= activeClip.endTime) {
      setPreviewingClipOnly(false);
      if (ytId && previewYtPlayerRef.current) {
        previewYtPlayerRef.current.pauseVideo();
      } else if (previewVideoRef.current) {
        previewVideoRef.current.pause();
      }
    }
  }, [previewingClipOnly, previewCurrentTime, activeClip?.endTime, ytId]);

  // Timeline Dragging pointer handler
  useEffect(() => {
    if (!draggingHandle || !activeClip) return;

    const handleMove = (e: PointerEvent) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      // Support RTL/LTR cleanly using left->right math on visual bar
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const sec = Math.round(ratio * totalDuration);

      updateActiveClip((c) => {
        if (draggingHandle === 'start') {
          const nextStart = Math.max(0, Math.min(c.endTime - 3, sec));
          return { ...c, startTime: nextStart, duration: c.endTime - nextStart };
        } else {
          const nextEnd = Math.min(totalDuration, Math.max(c.startTime + 3, sec));
          return { ...c, endTime: nextEnd, duration: nextEnd - c.startTime };
        }
      });
    };

    const handleUp = () => setDraggingHandle(null);
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [draggingHandle, totalDuration, activeClip?.id]);

  const updateActiveClip = (updater: (clip: VideoClipSegment) => VideoClipSegment) => {
    setEditorClips((prev) => prev.map((c, idx) => (idx === activeClipIdx ? updater(c) : c)));
  };

  const seekPreviewTo = (seconds: number, autoPlay = false) => {
    const clamped = Math.max(0, Math.min(totalDuration, seconds));
    setPreviewCurrentTime(clamped);
    if (ytId && previewYtPlayerRef.current) {
      previewYtPlayerRef.current.seekTo(clamped, true);
      if (autoPlay) previewYtPlayerRef.current.playVideo();
    } else if (previewVideoRef.current) {
      previewVideoRef.current.currentTime = clamped;
      if (autoPlay) previewVideoRef.current.play().catch(() => {});
    }
  };

  const handlePreviewTrimmedClip = () => {
    if (!activeClip) return;
    setPreviewingClipOnly(true);
    seekPreviewTo(activeClip.startTime, true);
  };

  const handleUploadLocalVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const srcObj = approvedTextSources.find((s) => s.id === newApprovedSourceId);
    if (!srcObj) {
      setEditorAlert('يرجى تحديد مصدر شيعي معتمد أولاً قبل رفع الفيديو.');
      return;
    }

    setUploadProgress(1);
    setEditorAlert(null);
    try {
      const uploaded = await videoService.uploadVideoFile(file, (pct) => setUploadProgress(pct));
      const title = newTitle.trim() || file.name.replace(/\.[^.]+$/, '');
      const docRef = await dataService.addVideoSource({
        title,
        videoUrl: uploaded.streamUrl,
        streamUrl: uploaded.streamUrl,
        sourceType: 'uploaded_file',
        approvedSourceId: srcObj.id,
        sourceName: srcObj.name,
        sourceUrl: srcObj.url,
        totalDuration: uploaded.totalDuration,
        status: 'ready',
        statusMessage: `تم رفع الملف بنجاح (المدة: ${formatTimeMMSS(uploaded.totalDuration)}).`,
        restrictsDirectDownload: false,
        isApproved: true,
      });
      if (docRef?.id) setSelectedVideoId(docRef.id);
      setNewTitle('');
      setEditorSuccess('تم رفع الفيديو وحفظه في مكتبة المصادر المرئية المعتمدة.');
    } catch (err: any) {
      setEditorAlert(err?.message || 'فشل رفع ملف الفيديو.');
    } finally {
      setUploadProgress(null);
    }
  };

  const handleAddAndInspectVideoUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl.trim()) return;
    const srcObj = approvedTextSources.find((s) => s.id === newApprovedSourceId);
    if (!srcObj) {
      setEditorAlert('يجب ربط الفيديو بمصدر شيعي معتمد أولاً.');
      return;
    }

    setInspecting(true);
    setEditorAlert(null);
    setEditorSuccess(null);
    try {
      const info = await videoService.inspectVideo({ videoUrl: newUrl.trim() });
      const manualSegs: VideoTranscriptSegment[] =
        info.transcriptSegments.length === 0 && manualTranscriptInput.trim()
          ? [{ start: 0, end: Math.max(30, info.totalDuration || 300), text: manualTranscriptInput.trim() }]
          : info.transcriptSegments;

      const docRef = await dataService.addVideoSource({
        title: newTitle.trim() || info.title || 'فيديو ثقافي معتمد',
        videoUrl: newUrl.trim(),
        sourceType: info.sourceType,
        approvedSourceId: srcObj.id,
        sourceName: srcObj.name,
        sourceUrl: srcObj.url,
        totalDuration: info.totalDuration,
        thumbnailUrl: info.thumbnailUrl || '',
        transcriptSegments: manualSegs,
        fullTranscript: manualSegs.map((s) => s.text).join(' '),
        status: info.status,
        statusMessage: info.message,
        restrictsDirectDownload: info.restrictsDirectDownload,
        isApproved: true,
      });

      if (docRef?.id) setSelectedVideoId(docRef.id);
      setNewTitle('');
      setNewUrl('');
      setManualTranscriptInput('');
      setEditorSuccess(info.message);
    } catch (err: any) {
      setEditorAlert(err?.message || 'تعذر جلب بيانات الفيديو.');
    } finally {
      setInspecting(false);
    }
  };

  const handleTranscribeVideo = async () => {
    if (!selectedVideo) return;
    setRunningJob(true);
    setEditorAlert(null);
    setEditorSuccess(null);
    try {
      const finished = await videoService.runAnalysisJob(
        {
          mode: 'transcribe_only',
          videoUrl: selectedVideo.videoUrl,
          streamUrl: selectedVideo.streamUrl,
          videoTitle: selectedVideo.title,
          totalDuration: selectedVideo.totalDuration,
          manualTranscript: manualTranscriptInput,
        },
        (job) => setActiveJob(job)
      );

      if (finished.result) {
        await dataService.updateVideoSource(selectedVideo.id, {
          totalDuration: finished.result.totalDuration,
          transcriptSegments: finished.result.transcriptSegments,
          fullTranscript: finished.result.fullTranscript,
          status: 'ready',
          statusMessage: `تم استخراج ${finished.result.transcriptSegments?.length || 0} مقطع نصي زمني بنجاح.`,
        });
        setEditorSuccess('تم تحويل الصوت إلى نص زمني وحفظه مع الفيديو الأصلي.');
      }
    } catch (err: any) {
      setEditorAlert(err?.message || 'تعذر تفريغ النص الصوتي.');
    } finally {
      setRunningJob(false);
    }
  };

  const handleAiMatchQuestion = async () => {
    if (!selectedVideo || !selectedQuestion) {
      setEditorAlert('يرجى اختيار الفيديو المعتمد والسؤال أولاً.');
      return;
    }

    setRunningJob(true);
    setEditorAlert(null);
    setEditorSuccess(null);

    try {
      const finished = await videoService.runAnalysisJob(
        {
          mode: 'match_question',
          videoUrl: selectedVideo.videoUrl,
          streamUrl: selectedVideo.streamUrl,
          videoTitle: selectedVideo.title,
          totalDuration: selectedVideo.totalDuration,
          transcriptSegments: selectedVideo.transcriptSegments || [],
          manualTranscript: manualTranscriptInput,
          questionText: selectedQuestion.text,
          answerText: selectedQuestion.answer,
        },
        (job) => setActiveJob(job)
      );

      const res = finished.result;
      if (res) {
        if (res.transcriptSegments?.length && (!selectedVideo.transcriptSegments || selectedVideo.transcriptSegments.length === 0)) {
          await dataService.updateVideoSource(selectedVideo.id, {
            totalDuration: res.totalDuration,
            transcriptSegments: res.transcriptSegments,
            fullTranscript: res.fullTranscript,
            status: 'ready',
          });
        }

        const clips: VideoClipSegment[] = Array.isArray(res.clips) ? res.clips : [];
        setEditorClips(clips);
        setActiveClipIdx(0);

        if (res.needsManualVerification || clips.length === 0) {
          setEditorAlert(
            res.verificationNote ||
              'تنبيه دقة: لم يتم التأكد بنسبة عالية من أن المشهد يثبت الإجابة. يرجى مراجعة الخط الزمني وتعديله يدوياً قبل الاعتماد.'
          );
        } else {
          setEditorSuccess(`تم تحديد ${clips.length} مشهد بدقة عالية (${res.overallConfidence}%). راجع المعاينة ثم اضغط اعتماد المقطع.`);
        }
      }
    } catch (err: any) {
      setEditorAlert(err?.message || 'تعذر مطابقة السؤال مع مشاهد الفيديو.');
    } finally {
      setRunningJob(false);
    }
  };

  const handleGenerateQuestionsFromVideo = async () => {
    if (!selectedVideo) return;
    const linkedSource = approvedTextSources.find((s) => s.id === selectedVideo.approvedSourceId) || {
      id: selectedVideo.approvedSourceId || '',
      name: selectedVideo.sourceName,
      sourceType: 'محاضرة موثقة' as const,
      author: '',
      publisher: '',
      url: selectedVideo.sourceUrl || selectedVideo.videoUrl,
      classification: '',
      linkedCategoryIds: [],
      isApproved: selectedVideo.isApproved,
    };

    if (!linkedSource.isApproved) {
      setEditorAlert('يمنع التوليد من فيديو غير مرتبط بمصدر شيعي معتمد ومفعل.');
      return;
    }

    setRunningJob(true);
    setEditorAlert(null);
    setEditorSuccess(null);
    try {
      const finished = await videoService.runAnalysisJob(
        {
          mode: 'generate_from_video',
          videoUrl: selectedVideo.videoUrl,
          streamUrl: selectedVideo.streamUrl,
          videoTitle: selectedVideo.title,
          totalDuration: selectedVideo.totalDuration,
          transcriptSegments: selectedVideo.transcriptSegments || [],
          manualTranscript: manualTranscriptInput,
          approvedSource: linkedSource,
          categoryName: selectedCategory?.name || 'ثقافة إسلامية',
          count: genCount,
          difficulty: genDifficulty,
          scoringSettings,
        },
        (job) => setActiveJob(job)
      );

      const qs = finished.result?.questions || [];
      setGeneratedQuestions(qs);
      if (qs.length > 0) {
        setEditorSuccess(`تم توليد ${qs.length} أسئلة مرتبطة بمشاهدها الزمنية. يمكنك حفظها لقائمة المراجعة أو تحرير مقاطعها.`);
      } else {
        setEditorAlert('لم تتوفر مقاطع واضحة تكفي لتوليد أسئلة موثقة من هذا الفيديو.');
      }
    } catch (err: any) {
      setEditorAlert(err?.message || 'تعذر توليد أسئلة من الفيديو.');
    } finally {
      setRunningJob(false);
    }
  };

  const handleExportPhysicalClip = async () => {
    if (!activeClip || !selectedVideo) return;
    setExportingPhysical(true);
    setEditorAlert(null);
    try {
      const res = await videoService.exportPhysicalClip({
        videoUrl: selectedVideo.videoUrl,
        streamUrl: selectedVideo.streamUrl,
        startTime: activeClip.startTime,
        endTime: activeClip.endTime,
        restrictsDirectDownload: selectedVideo.restrictsDirectDownload,
      });
      updateActiveClip((c) => ({ ...c, cachedClipUrl: res.cachedClipUrl }));
      setEditorSuccess(res.message);
    } catch (err: any) {
      setEditorAlert(err?.message || 'تعذر تصدير المقطع.');
    } finally {
      setExportingPhysical(false);
    }
  };

  const handleApproveAndSaveClips = async () => {
    if (!selectedCategory || !selectedQuestion || !selectedVideo || editorClips.length === 0) {
      setEditorAlert('يرجى تحديد سؤال ومقطع واحد على الأقل قبل الاعتماد.');
      return;
    }

    if (!selectedVideo.isApproved) {
      setEditorAlert('مصدر الفيديو غير معتمد في قائمة المصادر الشيعية المعتمدة.');
      return;
    }

    const approvedClips = editorClips.map((c) => ({
      ...c,
      duration: Math.max(1, c.endTime - c.startTime),
      isApproved: true,
      provesAnswer: true,
    }));

    setSavingClip(true);
    setEditorAlert(null);
    try {
      await dataService.updateQuestion(selectedCategory.id, selectedQuestion.id, {
        videoSourceId: selectedVideo.id,
        videoUrl: selectedVideo.streamUrl || selectedVideo.videoUrl,
        videoSourceName: selectedVideo.sourceName,
        videoSourceType: selectedVideo.sourceType,
        videoTotalDuration: totalDuration,
        videoClips: approvedClips,
        clipApproved: true,
        confidenceScore: approvedClips[0]?.confidence || 100,
        originalExcerpt: approvedClips[0]?.transcriptExcerpt || selectedQuestion.originalExcerpt || '',
        needsManualVerification: false,
      });

      await dataService.logActivity({
        action: 'اعتماد وربط مقطع فيديو بسؤال',
        targetType: 'question',
        targetName: selectedQuestion.text.slice(0, 50),
        actorEmail,
        details: `${approvedClips.length} مقطع (${formatTimeMMSS(approvedClips[0].startTime)} - ${formatTimeMMSS(approvedClips[0].endTime)})`,
      });

      setEditorClips(approvedClips);
      setEditorSuccess('تم اعتماد المقطع وربطه بالسؤال بنجاح. سيظهر هذا المشهد المقتطع فقط أثناء المسابقة.');
    } catch (err: any) {
      setEditorAlert(err?.message || 'تعذر حفظ اعتماد المقطع.');
    } finally {
      setSavingClip(false);
    }
  };

  const handleAddManualClip = () => {
    const start = Math.min(Math.max(0, Math.floor(previewCurrentTime)), Math.max(0, totalDuration - 20));
    const end = Math.min(totalDuration, start + 25);
    const nextClip: VideoClipSegment = {
      id: `clip_${Date.now()}_${editorClips.length}`,
      label: `المشهد ${editorClips.length + 1}`,
      startTime: start,
      endTime: end,
      duration: Math.max(3, end - start),
      transcriptExcerpt: '',
      sceneDescription: 'مقطع محدد من الخط الزمني',
      confidence: 100,
      provesAnswer: true,
      isApproved: false,
    };
    setEditorClips((prev) => {
      const next = [...prev, nextClip];
      setActiveClipIdx(next.length - 1);
      return next;
    });
  };

  const handleSaveGeneratedQuestion = async (gq: any, idx: number) => {
    if (!selectedCategory || !selectedVideo) return;
    await dataService.addQuestion(selectedCategory.id, {
      ...gq,
      videoSourceId: selectedVideo.id,
      videoUrl: selectedVideo.streamUrl || selectedVideo.videoUrl,
      videoSourceName: selectedVideo.sourceName,
      videoSourceType: selectedVideo.sourceType,
      videoTotalDuration: totalDuration,
      reviewStatus: 'pending',
    });
    await dataService.logActivity({
      action: 'حفظ سؤال مولد من الفيديو للمراجعة',
      targetType: 'question',
      targetName: gq.text.slice(0, 50),
      actorEmail,
    });
    setGeneratedQuestions((prev) => prev.filter((_, i) => i !== idx));
    setEditorSuccess('تم حفظ السؤال في قائمة المراجعة مع مقطعه الزمني.');
  };

  return (
    <div className="space-y-6 text-right">
      {/* Header & Mode Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">
            استوديو الفيديو الذكي واقتطاع المشاهد
          </h2>
          <p className="text-xs text-slate-600 mt-0.5">
            جلب الفيديوهات المعتمدة، تفريغ الكلام إلى نص زمني، واقتطاع المشهد الذي يثبت الإجابة بدقة دون عرض الفيديو كاملاً
          </p>
        </div>

        <div className="flex bg-white border border-[#E6DFD1] rounded-xl p-1 gap-1">
          <button
            type="button"
            onClick={() => setStudioMode('match')}
            className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              studioMode === 'match' ? 'bg-[#0B192C] text-[#D9B768]' : 'text-[#0B192C] hover:bg-[#FAF7F2]'
            }`}
          >
            ربط واقتطاع لسؤال
          </button>
          <button
            type="button"
            onClick={() => setStudioMode('generate')}
            className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
              studioMode === 'generate' ? 'bg-[#0B192C] text-[#D9B768]' : 'text-[#0B192C] hover:bg-[#FAF7F2]'
            }`}
          >
            توليد أسئلة من الفيديو
          </button>
        </div>
      </div>

      {/* Feedback & Job Progress Bar */}
      {activeJob && runningJob && (
        <div className="p-4 rounded-2xl bg-[#0B192C] text-white border border-[#C9A24D]/50 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="flex items-center gap-2 text-[#D9B768]">
              <Loader2 className="w-4 h-4 animate-spin" />
              {activeJob.stepLabel}
            </span>
            <span className="font-mono tabular-nums">{activeJob.progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-[#C9A24D] transition-all duration-300"
              style={{ width: `${activeJob.progress}%` }}
            />
          </div>
        </div>
      )}

      {editorAlert && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <span className="flex-1">{editorAlert}</span>
        </div>
      )}

      {editorSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
          <span className="flex-1">{editorSuccess}</span>
        </div>
      )}

      {/* Top Grid: Video Sources Library & Import */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Add Approved Video Form */}
        <div className="lg:col-span-5 surface-card rounded-2xl p-5 space-y-4">
          <h3 className="font-display font-bold text-base text-[#0B192C] flex items-center gap-2">
            <Film className="w-4 h-4 text-[#9B7729]" />
            <span>إضافة فيديو من مصدر معتمد</span>
          </h3>

          <form onSubmit={handleAddAndInspectVideoUrl} className="space-y-3">
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">المصدر الشيعي المعتمد</label>
              <select
                value={newApprovedSourceId}
                onChange={(e) => setNewApprovedSourceId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
              >
                {approvedTextSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">عنوان الفيديو / المحاضرة (اختياري)</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="مثال: محاضرة سيرة الإمام الحسن (ع)"
                className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">رابط الفيديو (YouTube أو MP4/WebM مباشر)</label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-mono dir-ltr"
                />
                <button
                  type="submit"
                  disabled={inspecting || !newUrl.trim()}
                  className="px-4 py-2 bg-[#0B192C] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {inspecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LinkIcon className="w-3.5 h-3.5 text-[#C9A24D]" />}
                  <span>جلب</span>
                </button>
              </div>
            </div>

            {/* Direct File Upload */}
            <div className="pt-2 border-t border-[#E6DFD1] flex items-center justify-between gap-2">
              <label className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-dashed border-[#C9A24D] text-xs font-bold text-[#0B192C] flex items-center justify-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4 text-[#9B7729]" />
                <span>
                  {uploadProgress !== null ? `جاري الرفع ${uploadProgress}%...` : 'أو رفع ملف فيديو / صوت محلي'}
                </span>
                <input
                  type="file"
                  accept="video/*,audio/*"
                  onChange={handleUploadLocalVideo}
                  className="hidden"
                />
              </label>
            </div>
          </form>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">
              نص مفرغ اختياري (مفيد إذا كان الفيديو الخارجي بدون ترجمة نصية مفعلة)
            </label>
            <textarea
              rows={2}
              value={manualTranscriptInput}
              onChange={(e) => setManualTranscriptInput(e.target.value)}
              placeholder="[00:45] نص الكلام مع التوقيتات أو النص الكامل..."
              className="w-full px-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs"
            />
          </div>
        </div>

        {/* Saved Video Sources Library */}
        <div className="lg:col-span-7 surface-card rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-[#0B192C]">
              مكتبة الفيديوهات المعتمدة ({videoSources.length})
            </h3>
            {selectedVideo && (!selectedVideo.transcriptSegments || selectedVideo.transcriptSegments.length === 0) && (
              <button
                type="button"
                disabled={runningJob}
                onClick={handleTranscribeVideo}
                className="px-3.5 py-1.5 rounded-lg bg-[#0B192C] text-[#D9B768] text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>تفريغ الصوت إلى نص</span>
              </button>
            )}
          </div>

          {videoSources.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-bold">
              أضف رابط فيديو أو ارفع ملفاً للبدء في استخراج المقاطع الذكية.
            </div>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {videoSources.map((vid) => {
                const isSelected = vid.id === selectedVideo?.id;
                return (
                  <div
                    key={vid.id}
                    onClick={() => setSelectedVideoId(vid.id)}
                    className={`p-3.5 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-[#0B192C] text-white border-[#C9A24D]'
                        : 'bg-[#FAF7F2] hover:bg-[#F3EFE6] text-[#0B192C] border-[#E6DFD1]'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="font-bold text-xs truncate">{vid.title}</div>
                      <div className={`text-[11px] flex flex-wrap items-center gap-2 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                        <span className="flex items-center gap-1">
                          <BookOpen className="w-3 h-3 text-[#C9A24D]" />
                          {vid.sourceName}
                        </span>
                        <span className="font-mono tabular-nums">• {formatTimeMMSS(vid.totalDuration)}</span>
                        <span>
                          • {vid.transcriptSegments?.length ? `${vid.transcriptSegments.length} فقرة نصية` : 'بانتظار التفريغ'}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        dataService.deleteVideoSource(vid.id);
                      }}
                      className={`p-1.5 rounded-lg cursor-pointer ${
                        isSelected ? 'text-rose-300 hover:bg-white/10' : 'text-rose-600 hover:bg-rose-50'
                      }`}
                      title="حذف من القائمة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Mode Specific Control Strip */}
      {studioMode === 'match' ? (
        <div className="surface-card rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-[260px]">
              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">القسم</label>
                <select
                  value={selectedCatId}
                  onChange={(e) => setSelectedCatId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.questions.length})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-[#0B192C] block mb-1">السؤال المستهدف للربط</label>
                <select
                  value={selectedQuestion?.id || ''}
                  onChange={(e) => setSelectedQuestionId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
                >
                  {(selectedCategory?.questions || []).map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.clipApproved ? '✓ [فيديو معتمد] ' : ''}
                      {q.text.slice(0, 75)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              disabled={runningJob || !selectedVideo || !selectedQuestion}
              onClick={handleAiMatchQuestion}
              className="px-5 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {runningJob ? <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" /> : <Sparkles className="w-4 h-4 text-[#C9A24D]" />}
              <span>تحليل الفيديو واقتطاع المشهد بالذكاء الاصطناعي</span>
            </button>
          </div>

          {selectedQuestion && (
            <div className="p-3.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <div className="font-bold text-[#0B192C]">السؤال: {selectedQuestion.text}</div>
                <div className="font-bold text-emerald-800">الإجابة المطلوب إثباتها: {selectedQuestion.answer}</div>
              </div>
              {editorClips.length === 0 && selectedVideo && (
                <button
                  type="button"
                  onClick={handleAddManualClip}
                  className="px-3.5 py-2 rounded-lg bg-white border border-[#E6DFD1] text-xs font-bold text-[#0B192C] flex items-center gap-1.5 cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5 text-[#9B7729]" />
                  <span>إدراج مقطع يدوي على الخط الزمني</span>
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="surface-card rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">القسم المستهدف</label>
              <select
                value={selectedCatId}
                onChange={(e) => setSelectedCatId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">الصعوبة</label>
              <select
                value={genDifficulty}
                onChange={(e) => setGenDifficulty(e.target.value as QuestionDifficulty)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold"
              >
                {(Object.keys(DIFFICULTY_LABELS) as QuestionDifficulty[]).map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-[#0B192C] block mb-1">عدد الأسئلة</label>
              <input
                type="number"
                min={1}
                max={8}
                value={genCount}
                onChange={(e) => setGenCount(Number(e.target.value))}
                className="w-full px-3 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-mono font-bold"
              />
            </div>

            <button
              type="button"
              disabled={runningJob || !selectedVideo}
              onClick={handleGenerateQuestionsFromVideo}
              className="px-5 py-2.5 bg-[#0B192C] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {runningJob ? <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" /> : <Sparkles className="w-4 h-4 text-[#C9A24D]" />}
              <span>توليد أسئلة ومقاطع من الفيديو</span>
            </button>
          </div>

          {generatedQuestions.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-[#E6DFD1]">
              {generatedQuestions.map((gq, idx) => {
                const clip = gq.videoClips?.[0];
                return (
                  <div key={idx} className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="space-y-1 flex-1 min-w-[240px]">
                      <div className="font-bold text-[#0B192C]">{gq.text}</div>
                      <div className="font-bold text-emerald-800">الإجابة: {gq.answer}</div>
                      {clip && (
                        <div className="text-[11px] text-slate-600 font-mono">
                          المقطع المقترح: {formatTimeMMSS(clip.startTime)} ← {formatTimeMMSS(clip.endTime)} ({clip.duration}ث) • ثقة {clip.confidence}%
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSaveGeneratedQuestion(gq, idx)}
                      className="px-4 py-2 bg-[#0F766E] text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>إرسال لقائمة المراجعة</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Interactive Timeline Review & Trimming Editor */}
      {selectedVideo && (
        <div className="surface-card rounded-2xl overflow-hidden">
          <div className="p-4 bg-[#0B192C] text-white flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Scissors className="w-4 h-4 text-[#C9A24D]" />
              <span className="font-display font-bold text-sm">محرر المراجعة والاقتطاع الزمني: {selectedVideo.title}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddManualClip}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-[#C9A24D]" />
                <span>إضافة مقطع</span>
              </button>

              {activeClip && (
                <button
                  type="button"
                  onClick={handlePreviewTrimmedClip}
                  className="px-3.5 py-1.5 rounded-lg bg-[#C9A24D] text-[#0B192C] text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>معاينة الجزء المقتطع</span>
                </button>
              )}
            </div>
          </div>

          <div className="p-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Video Preview + Visual Timeline Scrubber */}
            <div className="lg:col-span-7 space-y-4">
              <div className="aspect-video rounded-2xl overflow-hidden bg-black border border-[#E6DFD1]">
                {ytId ? (
                  <div ref={previewYtContainerRef} className="w-full h-full" />
                ) : (
                  <video
                    ref={previewVideoRef}
                    src={effectiveMediaUrl}
                    controls
                    playsInline
                    onTimeUpdate={(e) => setPreviewCurrentTime(e.currentTarget.currentTime)}
                    onPlay={() => setPreviewPlaying(true)}
                    onPause={() => setPreviewPlaying(false)}
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* Interactive Timeline Bar */}
              <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] space-y-3" dir="ltr">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-600 tabular-nums">
                  <span>00:00</span>
                  <span className="font-bold text-[#0B192C]">
                    المؤشر الحالي: {formatTimeMMSS(previewCurrentTime)} {previewPlaying ? '▶' : ''}
                  </span>
                  <span>{formatTimeMMSS(totalDuration)}</span>
                </div>

                <div
                  ref={timelineRef}
                  onClick={(e) => {
                    if (!timelineRef.current) return;
                    const rect = timelineRef.current.getBoundingClientRect();
                    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
                    seekPreviewTo(Math.round(ratio * totalDuration), false);
                  }}
                  className="relative h-10 rounded-xl bg-slate-200 border border-[#E6DFD1] cursor-pointer select-none overflow-hidden"
                >
                  {/* Render all clips on timeline */}
                  {editorClips.map((c, idx) => {
                    const leftPct = (c.startTime / Math.max(1, totalDuration)) * 100;
                    const widthPct = Math.max(1.5, ((c.endTime - c.startTime) / Math.max(1, totalDuration)) * 100);
                    const isActive = idx === activeClipIdx;
                    return (
                      <div
                        key={c.id || idx}
                        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveClipIdx(idx);
                        }}
                        className={`absolute top-0 bottom-0 transition-colors ${
                          isActive ? 'bg-[#C9A24D]/55 border-x-2 border-[#0B192C]' : 'bg-[#0B192C]/25'
                        }`}
                      />
                    );
                  })}

                  {/* Active Start & End Draggable Handles */}
                  {activeClip && (
                    <>
                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle('start');
                        }}
                        style={{ left: `${(activeClip.startTime / Math.max(1, totalDuration)) * 100}%` }}
                        title="اسحب لتحديد بداية المقطع"
                        className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-[#0B192C] hover:bg-[#13253E] text-[#D9B768] flex items-center justify-center cursor-ew-resize z-10"
                      >
                        |
                      </button>

                      <button
                        type="button"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setDraggingHandle('end');
                        }}
                        style={{ left: `${(activeClip.endTime / Math.max(1, totalDuration)) * 100}%` }}
                        title="اسحب لتحديد نهاية المقطع"
                        className="absolute top-0 bottom-0 w-3 -translate-x-1/2 bg-[#0F766E] hover:bg-[#0D5F59] text-white flex items-center justify-center cursor-ew-resize z-10"
                      >
                        |
                      </button>
                    </>
                  )}

                  {/* Current Playhead */}
                  <div
                    style={{ left: `${(previewCurrentTime / Math.max(1, totalDuration)) * 100}%` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-rose-600 pointer-events-none z-20"
                  />
                </div>
              </div>

              {/* Transcript Spoken Segments Browser */}
              {selectedVideo.transcriptSegments && selectedVideo.transcriptSegments.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-[#0B192C]">
                    التفريغ النصي الزمني (انقر للقفز إلى اللحظة أو ضبط البداية/النهاية دون بتر الكلام)
                  </div>
                  <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-1.5 border border-[#E6DFD1] rounded-xl p-2.5 bg-[#FAF7F2]">
                    {selectedVideo.transcriptSegments.map((seg, i) => (
                      <div
                        key={i}
                        className="p-2 rounded-lg bg-white border border-[#E6DFD1] flex flex-wrap items-center justify-between gap-2 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => seekPreviewTo(seg.start, true)}
                          className="text-right flex-1 min-w-[180px] hover:text-[#9B7729] cursor-pointer"
                        >
                          <span className="font-mono font-bold text-[#9B7729] ml-2">
                            [{formatTimeMMSS(seg.start)}]
                          </span>
                          <span className="text-[#0B192C]">{seg.text}</span>
                        </button>
                        {activeClip && (
                          <div className="flex gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveClip((c) => {
                                  const s = Math.min(Math.floor(seg.start), c.endTime - 3);
                                  return { ...c, startTime: s, duration: c.endTime - s };
                                })
                              }
                              className="px-2 py-0.5 rounded bg-[#FAF7F2] border border-[#E6DFD1] text-[10px] font-bold cursor-pointer"
                            >
                              بداية
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveClip((c) => {
                                  const e = Math.max(Math.ceil(seg.end), c.startTime + 3);
                                  return { ...c, endTime: Math.min(totalDuration, e), duration: Math.min(totalDuration, e) - c.startTime };
                                })
                              }
                              className="px-2 py-0.5 rounded bg-[#FAF7F2] border border-[#E6DFD1] text-[10px] font-bold cursor-pointer"
                            >
                              نهاية
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Active Clip Fine-Tuning & Approval Panel */}
            <div className="lg:col-span-5 space-y-4">
              {editorClips.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {editorClips.map((c, idx) => (
                    <button
                      key={c.id || idx}
                      type="button"
                      onClick={() => setActiveClipIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                        idx === activeClipIdx
                          ? 'bg-[#0B192C] text-[#D9B768]'
                          : 'bg-[#FAF7F2] border border-[#E6DFD1] text-[#0B192C]'
                      }`}
                    >
                      {c.label || `المشهد ${idx + 1}`}
                    </button>
                  ))}
                </div>
              )}

              {activeClip ? (
                <div className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#0B192C] flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#9B7729]" />
                      المدة المقتطعة: <strong className="font-mono">{formatTimeMMSS(activeClip.endTime - activeClip.startTime)}</strong>
                    </span>
                    <span className="text-xs font-mono font-bold text-[#0F766E]">
                      الثقة: {activeClip.confidence}%
                    </span>
                  </div>

                  {/* Manual Start/End Inputs + Speech Padding +/- Nudges */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#0B192C] block">توقيت البداية</label>
                      <input
                        type="text"
                        value={startInputStr}
                        onChange={(e) => setStartInputStr(e.target.value)}
                        onBlur={() => {
                          const s = Math.min(parseTimeInputToSeconds(startInputStr), activeClip.endTime - 2);
                          updateActiveClip((c) => ({ ...c, startTime: s, duration: c.endTime - s }));
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#E6DFD1] text-xs font-mono font-bold text-center"
                      />
                      <div className="flex justify-center gap-1">
                        {[-5, -1, 1, 5].map((delta) => (
                          <button
                            key={delta}
                            type="button"
                            onClick={() =>
                              updateActiveClip((c) => {
                                const s = Math.max(0, Math.min(c.endTime - 2, c.startTime + delta));
                                return { ...c, startTime: s, duration: c.endTime - s };
                              })
                            }
                            className="px-1.5 py-0.5 rounded bg-white border border-[#E6DFD1] text-[10px] font-mono cursor-pointer"
                          >
                            {delta > 0 ? `+${delta}ث` : `${delta}ث`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-bold text-[#0B192C] block">توقيت النهاية</label>
                      <input
                        type="text"
                        value={endInputStr}
                        onChange={(e) => setEndInputStr(e.target.value)}
                        onBlur={() => {
                          const eSec = Math.min(totalDuration, Math.max(activeClip.startTime + 2, parseTimeInputToSeconds(endInputStr)));
                          updateActiveClip((c) => ({ ...c, endTime: eSec, duration: eSec - c.startTime }));
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#E6DFD1] text-xs font-mono font-bold text-center"
                      />
                      <div className="flex justify-center gap-1">
                        {[-5, -1, 1, 5].map((delta) => (
                          <button
                            key={delta}
                            type="button"
                            onClick={() =>
                              updateActiveClip((c) => {
                                const eSec = Math.min(totalDuration, Math.max(c.startTime + 2, c.endTime + delta));
                                return { ...c, endTime: eSec, duration: eSec - c.startTime };
                              })
                            }
                            className="px-1.5 py-0.5 rounded bg-white border border-[#E6DFD1] text-[10px] font-mono cursor-pointer"
                          >
                            {delta > 0 ? `+${delta}ث` : `${delta}ث`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#0B192C] block mb-1">وصف مختصر للمشهد</label>
                    <input
                      type="text"
                      value={activeClip.sceneDescription}
                      onChange={(e) => updateActiveClip((c) => ({ ...c, sceneDescription: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#E6DFD1] text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-[#0B192C] block mb-1">النص المستخرج من المقطع</label>
                    <textarea
                      rows={3}
                      value={activeClip.transcriptExcerpt}
                      onChange={(e) => updateActiveClip((c) => ({ ...c, transcriptExcerpt: e.target.value }))}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-[#E6DFD1] text-xs"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-[#E6DFD1]">
                    <button
                      type="button"
                      disabled={savingClip || !selectedQuestion}
                      onClick={handleApproveAndSaveClips}
                      className="w-full py-3 bg-[#0F766E] hover:bg-[#0D5F59] text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {savingClip ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      <span>اعتماد المقطع وربطه بالسؤال</span>
                    </button>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={runningJob || !selectedQuestion}
                        onClick={handleAiMatchQuestion}
                        className="py-2.5 px-3 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCcw className="w-3.5 h-3.5 text-[#9B7729]" />
                        <span>إعادة التحليل بالذكاء</span>
                      </button>

                      {!selectedVideo.restrictsDirectDownload && (
                        <button
                          type="button"
                          disabled={exportingPhysical}
                          onClick={handleExportPhysicalClip}
                          className="py-2.5 px-3 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {exportingPhysical ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-[#9B7729]" />}
                          <span>تصدير مقطع MP4</span>
                        </button>
                      )}
                    </div>

                    {editorClips.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditorClips((prev) => prev.filter((_, idx) => idx !== activeClipIdx));
                          setActiveClipIdx(0);
                        }}
                        className="w-full py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 rounded-xl cursor-pointer"
                      >
                        حذف هذا المقطع الفرعي
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-[#FAF7F2] border border-dashed border-[#E6DFD1] text-center text-xs text-slate-500 space-y-2">
                  <Scissors className="w-7 h-7 mx-auto text-[#9B7729]" />
                  <p className="font-bold">اختر سؤالاً واضغط على «تحليل الفيديو واقتطاع المشهد» أو أضف مقطعاً يدوياً للمعاينة والتحرير.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
