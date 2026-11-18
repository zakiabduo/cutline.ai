import React, { useState } from 'react';
import {
  Check,
  Download,
  FileCode2,
  FileText,
  Film,
  Loader2,
  X,
} from 'lucide-react';
import type {
  ExtractedClip,
  FramingMode,
  SubtitleStyleConfig,
  VideoProject,
} from '../types/studio';
import {
  formatShortDuration,
  generateSrt,
  generateVtt,
} from '../utils/shortsEngine';
import { exportShortToWebm } from '../utils/videoFrameExtractor';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: VideoProject;
  clip: ExtractedClip;
  subtitleStyle: SubtitleStyleConfig;
  framingMode: FramingMode;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  project,
  clip,
  subtitleStyle,
  framingMode,
}) => {
  const [rendering, setRendering] = useState(false);
  const [renderPct, setRenderPct] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [renderDone, setRenderDone] = useState(false);
  const [attachedFileUrl, setAttachedFileUrl] = useState<string | undefined>(
    undefined
  );

  if (!isOpen) return null;

  const slug = clip.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'short-clip';

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadSrt = () => {
    const srt = generateSrt(clip.captions, clip.startTime);
    triggerDownload(new Blob([srt], { type: 'text/plain;charset=utf-8' }), `${slug}.srt`);
  };

  const handleDownloadVtt = () => {
    const vtt = generateVtt(clip.captions, clip.startTime);
    triggerDownload(new Blob([vtt], { type: 'text/vtt;charset=utf-8' }), `${slug}.vtt`);
  };

  const handleDownloadCutSheet = () => {
    const payload = {
      projectTitle: project.title,
      youtubeUrl: project.youtubeUrl ?? null,
      clip: {
        id: clip.id,
        title: clip.title,
        platformTitle: clip.platformTitle,
        startTime: clip.startTime,
        endTime: clip.endTime,
        duration: clip.duration,
        framingMode,
        subtitleStyle,
        scenes: clip.scenes,
        captions: clip.captions,
      },
    };
    triggerDownload(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json;charset=utf-8',
      }),
      `${slug}-cutsheet.json`
    );
  };

  const handleRenderWebm = async () => {
    setRendering(true);
    setRenderPct(0);
    setRenderError(null);
    setRenderDone(false);

    try {
      const videoUrl = attachedFileUrl ?? project.videoObjectUrl;
      const blob = await exportShortToWebm({
        clip,
        style: subtitleStyle,
        framingMode,
        videoObjectUrl: videoUrl,
        posterImageUrl: project.posterImageUrl,
        onProgress: setRenderPct,
      });
      triggerDownload(blob, `${slug}-9x16.webm`);
      setRenderDone(true);
    } catch (err) {
      setRenderError(
        err instanceof Error ? err.message : 'Unable to render 9:16 WebM clip.'
      );
    } finally {
      setRendering(false);
    }
  };

  const canRenderVideoDirectly =
    Boolean(project.videoObjectUrl) ||
    Boolean(attachedFileUrl) ||
    project.sourceType === 'demo';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
    >
      <div className="w-full max-w-xl rounded-2xl border border-white/[0.12] bg-[#13161C] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div>
            <h2
              id="export-modal-title"
              className="font-display text-lg font-semibold text-[#F4F5F7]"
            >
              Export 9:16 Short &amp; Captions
            </h2>
            <p className="text-xs text-[#9CA3AF] mt-0.5">
              {clip.title} · {formatShortDuration(clip.duration)} · {clip.scenes.length} scenes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close export modal"
            className="p-2 rounded-lg text-[#9CA3AF] hover:text-white hover:bg-white/[0.06] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Render Video Card */}
          <div className="p-4 rounded-xl border border-white/[0.1] bg-[#0B0D11] space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <Film className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-[#F4F5F7]">
                    Render 9:16 Vertical Video (.webm)
                  </h3>
                  <p className="text-xs text-[#9CA3AF] mt-0.5 leading-relaxed">
                    Burns your active{' '}
                    <span className="text-[#E5E7EB]">
                      {subtitleStyle.preset === 'kinetic-word'
                        ? 'Kinetic Word'
                        : subtitleStyle.preset === 'bold-impact'
                        ? 'Bold Impact'
                        : subtitleStyle.preset === 'editorial-lower'
                        ? 'Editorial Lower'
                        : 'Clean Minimal'}
                    </span>{' '}
                    subtitles and{' '}
                    <span className="text-[#E5E7EB]">
                      {framingMode === 'smart-crop-9-16'
                        ? 'Smart Crop 9:16'
                        : framingMode === 'split-9-16'
                        ? 'Split 9:16'
                        : '16:9 Fit'}
                    </span>{' '}
                    framing directly into a vertical 720×1280 clip.
                  </p>
                </div>
              </div>
            </div>

            {project.sourceType === 'youtube' && !attachedFileUrl && (
              <div className="p-3 rounded-lg bg-[#13161C] border border-white/[0.08] text-xs text-[#D1D5DB] space-y-2">
                <p>
                  YouTube stream playback runs inside YouTube’s protected embed. To burn subtitles directly into a downloadable `.webm` file, attach the local source video file below (or export `.srt` / `.vtt` / Cut Sheet directly).
                </p>
                <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1D222D] hover:bg-[#252C3A] text-xs font-medium text-white cursor-pointer">
                  <span>Attach Local Video for Burn-In</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) setAttachedFileUrl(URL.createObjectURL(f));
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            )}

            {renderError && (
              <p className="text-xs text-red-400">{renderError}</p>
            )}

            {rendering && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono-tabular text-[#D1D5DB]">
                  <span>Encoding vertical frames &amp; burned-in subtitles...</span>
                  <span>{renderPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-[#1D222D] overflow-hidden">
                  <div
                    className="h-full bg-amber-400 transition-all duration-150"
                    style={{ width: `${renderPct}%` }}
                  />
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={rendering || !canRenderVideoDirectly}
              onClick={handleRenderWebm}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs font-semibold hover:bg-white transition-colors disabled:opacity-40 cursor-pointer"
            >
              {rendering ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering Short ({renderPct}%)...</span>
                </>
              ) : renderDone ? (
                <>
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>Rendered! Click to Download Again</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Render &amp; Download 9:16 WebM</span>
                </>
              )}
            </button>
          </div>

          {/* Subtitle & Cut-Sheet Deliverables */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button
              type="button"
              onClick={handleDownloadSrt}
              className="p-3 rounded-xl border border-white/[0.1] bg-[#0B0D11] hover:border-white/[0.22] text-left transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-400 mb-2" />
              <div className="text-xs font-semibold text-[#F4F5F7]">
                SubRip (.srt)
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Standard YouTube &amp; Premiere captions
              </p>
            </button>

            <button
              type="button"
              onClick={handleDownloadVtt}
              className="p-3 rounded-xl border border-white/[0.1] bg-[#0B0D11] hover:border-white/[0.22] text-left transition-colors cursor-pointer"
            >
              <FileText className="w-4 h-4 text-amber-400 mb-2" />
              <div className="text-xs font-semibold text-[#F4F5F7]">
                WebVTT (.vtt)
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Web &amp; mobile player track format
              </p>
            </button>

            <button
              type="button"
              onClick={handleDownloadCutSheet}
              className="p-3 rounded-xl border border-white/[0.1] bg-[#0B0D11] hover:border-white/[0.22] text-left transition-colors cursor-pointer"
            >
              <FileCode2 className="w-4 h-4 text-amber-400 mb-2" />
              <div className="text-xs font-semibold text-[#F4F5F7]">
                Cut Sheet (.json)
              </div>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                Scene boundaries, crops &amp; timings
              </p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
