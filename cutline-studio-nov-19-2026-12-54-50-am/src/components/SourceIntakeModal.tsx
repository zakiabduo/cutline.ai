import React, { useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileVideo,
  Link2,
  Loader2,
  Scissors,
  Upload,
  X,
} from 'lucide-react';
import type { AnalysisStage, ExtractedClip, VideoProject } from '../types/studio';
import { DEMO_PROJECTS } from '../data/demoProjects';
import { extractYouTubeVideoId, formatShortDuration } from '../utils/shortsEngine';
import { extractKeyframesFromVideoFile } from '../utils/videoFrameExtractor';

interface SourceIntakeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProjectLoaded: (project: VideoProject) => void;
}

type IntakeTab = 'youtube' | 'upload' | 'samples';

export const SourceIntakeModal: React.FC<SourceIntakeModalProps> = ({
  isOpen,
  onClose,
  onProjectLoaded,
}) => {
  const [activeTab, setActiveTab] = useState<IntakeTab>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [manualTranscript, setManualTranscript] = useState('');
  const [clipCount, setClipCount] = useState(3);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTranscript, setUploadTranscript] = useState('');
  const [stage, setStage] = useState<AnalysisStage>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isBusy =
    stage === 'ingesting' ||
    stage === 'detecting-scenes' ||
    stage === 'scoring-clips';

  const handleAnalyzeYouTube = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const videoId = extractYouTubeVideoId(youtubeUrl);
    if (!videoId) {
      setErrorMsg(
        'Enter a valid YouTube link (for example: https://www.youtube.com/watch?v=... or https://youtu.be/...).'
      );
      return;
    }

    try {
      setStage('ingesting');
      setStatusMessage('Fetching YouTube metadata and timed captions...');

      const inspectResp = await fetch('/api/youtube/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl.trim() }),
      });

      const inspectData = (await inspectResp.json()) as {
        error?: string;
        videoId: string;
        canonicalUrl: string;
        title: string;
        author: string;
        thumbnailUrl: string;
        duration: number;
        description: string;
        transcriptCues: Array<{ start: number; duration: number; text: string }>;
        hasCaptions: boolean;
      };

      if (!inspectResp.ok) {
        throw new Error(inspectData.error || 'Failed to inspect YouTube video.');
      }

      setStage('detecting-scenes');
      setStatusMessage(
        inspectData.hasCaptions
          ? `Extracted ${inspectData.transcriptCues.length} caption cues. Running AI scene detection & hook scoring...`
          : 'Analyzing video context and generating engaging Shorts cuts with Gemini...'
      );

      const analyzeResp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'youtube',
          title: inspectData.title,
          author: inspectData.author,
          duration: inspectData.duration,
          youtubeUrl: inspectData.canonicalUrl,
          transcriptCues: inspectData.transcriptCues,
          transcriptText:
            manualTranscript.trim() ||
            (inspectData.description
              ? `Video Description:\n${inspectData.description}`
              : ''),
          clipTargetCount: clipCount,
        }),
      });

      const analyzeData = (await analyzeResp.json()) as {
        error?: string;
        transcriptSummary: string;
        clips: ExtractedClip[];
      };

      if (!analyzeResp.ok) {
        throw new Error(analyzeData.error || 'AI clip extraction failed.');
      }

      if (!analyzeData.clips || analyzeData.clips.length === 0) {
        throw new Error('No clips were returned by AI analysis.');
      }

      setStage('scoring-clips');
      const nextProject: VideoProject = {
        id: `yt-${inspectData.videoId}-${Date.now()}`,
        sourceType: 'youtube',
        title: inspectData.title,
        channelOrAuthor: inspectData.author,
        youtubeId: inspectData.videoId,
        youtubeUrl: inspectData.canonicalUrl,
        posterImageUrl: inspectData.thumbnailUrl,
        duration: inspectData.duration,
        width: 1920,
        height: 1080,
        transcriptSummary: analyzeData.transcriptSummary,
        clips: analyzeData.clips,
        createdAt: new Date().toISOString(),
      };

      setStage('idle');
      onProjectLoaded(nextProject);
      onClose();
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze YouTube video.');
    }
  };

  const handleAnalyzeUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedFile) {
      setErrorMsg('Select an MP4, WebM, or MOV video file to analyze.');
      return;
    }

    try {
      setStage('ingesting');
      setStatusMessage('Sampling video keyframes locally for AI scene detection...');

      const extracted = await extractKeyframesFromVideoFile(selectedFile, 10, (pct) => {
        setStatusMessage(`Sampling keyframes from video (${pct}%)...`);
      });

      setStage('detecting-scenes');
      setStatusMessage(
        `Sending ${extracted.frames.length} keyframes to Gemini for visual scene detection & captioning...`
      );

      const finalTitle =
        uploadTitle.trim() || selectedFile.name.replace(/\.[^.]+$/, '');

      const analyzeResp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: 'upload',
          title: finalTitle,
          author: 'Local Studio Upload',
          duration: extracted.duration,
          frames: extracted.frames,
          transcriptText: uploadTranscript.trim(),
          clipTargetCount: clipCount,
        }),
      });

      const analyzeData = (await analyzeResp.json()) as {
        error?: string;
        transcriptSummary: string;
        clips: ExtractedClip[];
      };

      if (!analyzeResp.ok) {
        throw new Error(analyzeData.error || 'AI video analysis failed.');
      }

      const objectUrl = URL.createObjectURL(selectedFile);
      const firstFrameDataUrl = extracted.frames[0]
        ? `data:image/jpeg;base64,${extracted.frames[0].dataBase64}`
        : undefined;

      const nextProject: VideoProject = {
        id: `upload-${Date.now()}`,
        sourceType: 'upload',
        title: finalTitle,
        channelOrAuthor: 'Local Upload',
        videoObjectUrl: objectUrl,
        posterImageUrl: firstFrameDataUrl,
        duration: extracted.duration,
        width: extracted.width,
        height: extracted.height,
        transcriptSummary: analyzeData.transcriptSummary,
        clips: analyzeData.clips,
        createdAt: new Date().toISOString(),
      };

      setStage('idle');
      onProjectLoaded(nextProject);
      onClose();
    } catch (err) {
      setStage('error');
      setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze uploaded video.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="source-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-2xl rounded-2xl border border-white/[0.12] bg-[#13161C] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4">
          <div>
            <h2
              id="source-modal-title"
              className="font-display text-lg font-semibold text-[#F4F5F7]"
            >
              Load Long-Form Video
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              Extract engaging Shorts with AI scene detection, speaker framing, and timed subtitles.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            aria-label="Close source modal"
            className="p-2 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="px-6 pt-4">
          <div
            role="tablist"
            aria-label="Video source options"
            className="flex items-center gap-1 p-1 rounded-xl bg-[#0B0D11] border border-white/[0.06]"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'youtube'}
              onClick={() => {
                setActiveTab('youtube');
                setErrorMsg(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'youtube'
                  ? 'bg-[#1D222D] text-[#F4F5F7]'
                  : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>YouTube URL</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'upload'}
              onClick={() => {
                setActiveTab('upload');
                setErrorMsg(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'upload'
                  ? 'bg-[#1D222D] text-[#F4F5F7]'
                  : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
              }`}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload Video File</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'samples'}
              onClick={() => {
                setActiveTab('samples');
                setErrorMsg(null);
              }}
              className={`flex-1 inline-flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'samples'
                  ? 'bg-[#1D222D] text-[#F4F5F7]'
                  : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
              }`}
            >
              <FileVideo className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Studio Samples</span>
            </button>
          </div>
        </div>

        <div className="p-6 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-xl border border-red-500/40 bg-red-950/30 flex items-start gap-2.5 text-xs text-red-200"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {isBusy && (
            <div className="mb-4 p-4 rounded-xl border border-amber-400/30 bg-amber-950/20 flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-[#F4F5F7]">{statusMessage}</p>
                <p className="text-[#9CA3AF] mt-0.5">
                  Detecting scene shifts, hook boundaries, and word-level subtitle cues.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'youtube' && (
            <form onSubmit={handleAnalyzeYouTube} className="space-y-4">
              <div>
                <label
                  htmlFor="youtube-url-input"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  YouTube Video Link
                </label>
                <input
                  id="youtube-url-input"
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  disabled={isBusy}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0D11] border border-white/[0.12] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="yt-clip-count"
                    className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                  >
                    Shorts to Extract
                  </label>
                  <select
                    id="yt-clip-count"
                    value={clipCount}
                    onChange={(e) => setClipCount(Number(e.target.value))}
                    disabled={isBusy}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0B0D11] border border-white/[0.12] text-sm text-[#F4F5F7] focus:outline-none focus:border-amber-400"
                  >
                    <option value={2}>Top 2 Clips</option>
                    <option value={3}>Top 3 Clips</option>
                    <option value={4}>Top 4 Clips</option>
                    <option value={5}>Top 5 Clips</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-[#9CA3AF] leading-relaxed">
                    Server extracts public YouTube captions when available and runs Gemini AI scene &amp; hook detection.
                  </p>
                </div>
              </div>

              <div>
                <label
                  htmlFor="yt-manual-transcript"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Optional Transcript or Key Timestamps
                </label>
                <textarea
                  id="yt-manual-transcript"
                  rows={3}
                  value={manualTranscript}
                  onChange={(e) => setManualTranscript(e.target.value)}
                  disabled={isBusy}
                  placeholder="Optional: paste a transcript or topic notes if the YouTube video has captions disabled..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0D11] border border-white/[0.12] text-xs text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isBusy}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#9CA3AF] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isBusy ? 'Analyzing...' : 'Analyze & Extract Shorts'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'upload' && (
            <form onSubmit={handleAnalyzeUpload} className="space-y-4">
              <div>
                <label
                  htmlFor="video-file-input"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Select Local Video (MP4, WebM, MOV)
                </label>
                <label
                  htmlFor="video-file-input"
                  className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border border-dashed border-white/[0.18] bg-[#0B0D11] hover:border-amber-400/60 transition-colors cursor-pointer text-center"
                >
                  <Upload className="w-6 h-6 text-[#9CA3AF]" aria-hidden="true" />
                  {selectedFile ? (
                    <div className="text-xs">
                      <p className="font-semibold text-[#F4F5F7] flex items-center justify-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>{selectedFile.name}</span>
                      </p>
                      <p className="text-[#9CA3AF] mt-1 font-mono-tabular">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB · Ready for frame sampling &amp; direct WebM export
                      </p>
                    </div>
                  ) : (
                    <div className="text-xs text-[#9CA3AF]">
                      <span className="font-medium text-[#F4F5F7]">Click to choose a video file</span>
                      <p className="mt-1">
                        Keyframes are sampled locally in your browser—even large recordings analyze quickly.
                      </p>
                    </div>
                  )}
                  <input
                    id="video-file-input"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/*"
                    disabled={isBusy}
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      setSelectedFile(f);
                      if (f && !uploadTitle) {
                        setUploadTitle(f.name.replace(/\.[^.]+$/, ''));
                      }
                    }}
                    className="sr-only"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="upload-title-input"
                    className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                  >
                    Project Title
                  </label>
                  <input
                    id="upload-title-input"
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Podcast Episode 18"
                    disabled={isBusy}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0D11] border border-white/[0.12] text-sm text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label
                    htmlFor="upload-clip-count"
                    className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                  >
                    Shorts to Extract
                  </label>
                  <select
                    id="upload-clip-count"
                    value={clipCount}
                    onChange={(e) => setClipCount(Number(e.target.value))}
                    disabled={isBusy}
                    className="w-full px-3 py-2.5 rounded-xl bg-[#0B0D11] border border-white/[0.12] text-sm text-[#F4F5F7] focus:outline-none focus:border-amber-400"
                  >
                    <option value={2}>Top 2 Clips</option>
                    <option value={3}>Top 3 Clips</option>
                    <option value={4}>Top 4 Clips</option>
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="upload-transcript-input"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Optional Spoken Context / Script
                </label>
                <textarea
                  id="upload-transcript-input"
                  rows={2}
                  value={uploadTranscript}
                  onChange={(e) => setUploadTranscript(e.target.value)}
                  disabled={isBusy}
                  placeholder="Optional: paste speaker names, topic summary, or transcript lines to guide captioning..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B0D11] border border-white/[0.12] text-xs text-[#F4F5F7] placeholder:text-[#6B7280] focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isBusy}
                  className="px-4 py-2 rounded-lg text-xs font-medium text-[#9CA3AF] hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBusy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs font-semibold hover:bg-white transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Scissors className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{isBusy ? 'Detecting Scenes...' : 'Detect Scenes & Extract'}</span>
                </button>
              </div>
            </form>
          )}

          {activeTab === 'samples' && (
            <div className="space-y-3">
              {DEMO_PROJECTS.map((sample) => (
                <div
                  key={sample.id}
                  className="p-3.5 rounded-xl border border-white/[0.08] bg-[#0B0D11] flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <img
                    src={sample.posterImageUrl}
                    alt={sample.title}
                    referrerPolicy="no-referrer"
                    className="w-full sm:w-32 h-20 rounded-lg object-cover shrink-0 border border-white/[0.08]"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-sm font-semibold text-[#F4F5F7] line-clamp-1">
                      {sample.title}
                    </h3>
                    <p className="text-xs text-[#9CA3AF] mt-1 line-clamp-2">
                      {sample.transcriptSummary}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                      <span>{sample.channelOrAuthor}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {formatShortDuration(sample.duration)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">
                        {sample.clips.length} AI clips
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onProjectLoaded(sample);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-lg bg-[#1D222D] hover:bg-[#262D3B] text-xs font-semibold text-[#F4F5F7] transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                  >
                    Load Project
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
