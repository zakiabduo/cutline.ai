import React, { useEffect, useRef } from 'react';
import {
  Eye,
  Heart,
  MessageSquare,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  Share2,
} from 'lucide-react';
import type {
  ExtractedClip,
  FramingMode,
  SubtitleStyleConfig,
  VideoProject,
} from '../types/studio';
import {
  chunkWordsForDisplay,
  formatTimecode,
  getActiveCaptionAtTime,
  getActiveSceneAtTime,
  getActiveWordIndex,
} from '../utils/shortsEngine';

interface VerticalPreviewStageProps {
  project: VideoProject;
  clip: ExtractedClip;
  currentTime: number;
  isPlaying: boolean;
  isLooping: boolean;
  showSafeZones: boolean;
  framingMode: FramingMode;
  subtitleStyle: SubtitleStyleConfig;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onToggleLoop: () => void;
  onToggleSafeZones: () => void;
  onChangeFramingMode: (mode: FramingMode) => void;
  onUpdateClipRange: (startTime: number, endTime: number) => void;
  onOpenExport: () => void;
}

export const VerticalPreviewStage: React.FC<VerticalPreviewStageProps> = ({
  project,
  clip,
  currentTime,
  isPlaying,
  isLooping,
  showSafeZones,
  framingMode,
  subtitleStyle,
  onTogglePlay,
  onSeek,
  onToggleLoop,
  onToggleSafeZones,
  onChangeFramingMode,
  onUpdateClipRange,
  onOpenExport,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const activeScene = getActiveSceneAtTime(clip.scenes, currentTime);
  const activeCaption = getActiveCaptionAtTime(clip.captions, currentTime);
  const activeWordIdx = getActiveWordIndex(activeCaption, currentTime);
  const focusX = activeScene?.cropFocusX ?? 50;

  // Sync HTML5 video element when playing uploaded local videos
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !project.videoObjectUrl) return;

    if (Math.abs(vid.currentTime - currentTime) > 0.35) {
      vid.currentTime = currentTime;
    }

    if (isPlaying && vid.paused) {
      vid.play().catch(() => {});
    } else if (!isPlaying && !vid.paused) {
      vid.pause();
    }
  }, [currentTime, isPlaying, project.videoObjectUrl]);

  const { words: visibleWords, startIdx } = activeCaption
    ? chunkWordsForDisplay(
        activeCaption.words,
        activeWordIdx,
        subtitleStyle.maxWordsPerLine
      )
    : { words: [], startIdx: 0 };

  const fontClass =
    subtitleStyle.fontFamily === 'Outfit'
      ? 'font-display'
      : subtitleStyle.fontFamily === 'JetBrains Mono'
      ? 'font-mono-tabular'
      : 'font-sans';

  const clipSpan = Math.max(1, clip.endTime - clip.startTime);
  const relativeTime = Math.max(0, Math.min(clipSpan, currentTime - clip.startTime));
  const playheadPct = (relativeTime / clipSpan) * 100;

  // Subtle Ken Burns motion on demo still frames during playback
  const demoPanOffset =
    project.sourceType === 'demo'
      ? Math.sin((relativeTime / Math.max(1, clipSpan)) * Math.PI * 2) * 1.4
      : 0;

  const framingOptions: Array<{ id: FramingMode; label: string }> = [
    { id: 'smart-crop-9-16', label: 'Smart Crop 9:16' },
    { id: 'split-9-16', label: 'Split 9:16' },
    { id: 'letterbox-9-16', label: '16:9 Fit' },
  ];

  const renderVisualMedia = () => {
    if (project.videoObjectUrl) {
      if (framingMode === 'split-9-16') {
        return (
          <div className="w-full h-full flex flex-col gap-0.5 bg-black">
            <video
              ref={videoRef}
              src={project.videoObjectUrl}
              muted
              playsInline
              className="w-full h-1/2 object-cover"
              style={{ objectPosition: '18% 50%' }}
            />
            <video
              src={project.videoObjectUrl}
              muted
              playsInline
              className="w-full h-1/2 object-cover"
              style={{ objectPosition: '82% 50%' }}
            />
          </div>
        );
      }

      return (
        <video
          ref={videoRef}
          src={project.videoObjectUrl}
          muted
          playsInline
          className={`w-full h-full transition-all duration-300 ${
            framingMode === 'letterbox-9-16' ? 'object-contain' : 'object-cover'
          }`}
          style={
            framingMode === 'smart-crop-9-16'
              ? { objectPosition: `${focusX}% 50%` }
              : undefined
          }
        />
      );
    }

    if (project.sourceType === 'youtube' && project.youtubeId) {
      const startSec = Math.floor(clip.startTime);
      const endSec = Math.ceil(clip.endTime);
      const embedUrl = `https://www.youtube.com/embed/${project.youtubeId}?start=${startSec}&end=${endSec}&rel=0&modestbranding=1&playsinline=1`;
      return (
        <div className="relative w-full h-full bg-black overflow-hidden">
          {framingMode === 'letterbox-9-16' ? (
            <div className="w-full h-full flex items-center justify-center">
              <iframe
                src={embedUrl}
                title={clip.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full aspect-video border-0"
              />
            </div>
          ) : (
            <div className="w-full h-full relative overflow-hidden">
              <iframe
                src={embedUrl}
                title={clip.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute top-0 h-full border-0"
                style={{
                  width: '316%',
                  left: `${-(focusX / 100) * 216}%`,
                }}
              />
            </div>
          )}
        </div>
      );
    }

    // Demo visual canvas-like frame with smooth AI speaker crop tracking
    if (project.posterImageUrl) {
      if (framingMode === 'split-9-16') {
        return (
          <div className="w-full h-full flex flex-col gap-0.5 bg-black">
            <img
              src={project.posterImageUrl}
              alt={`${clip.title} top camera`}
              referrerPolicy="no-referrer"
              className="w-full h-1/2 object-cover transition-transform duration-500"
              style={{
                objectPosition: '18% 45%',
                transform: `scale(${isPlaying ? 1.04 : 1})`,
              }}
            />
            <img
              src={project.posterImageUrl}
              alt={`${clip.title} bottom camera`}
              referrerPolicy="no-referrer"
              className="w-full h-1/2 object-cover transition-transform duration-500"
              style={{
                objectPosition: '82% 45%',
                transform: `scale(${isPlaying ? 1.04 : 1})`,
              }}
            />
          </div>
        );
      }

      return (
        <img
          src={project.posterImageUrl}
          alt={clip.title}
          referrerPolicy="no-referrer"
          className={`w-full h-full transition-all duration-500 ${
            framingMode === 'letterbox-9-16' ? 'object-contain' : 'object-cover'
          }`}
          style={{
            objectPosition: `${Math.max(
              0,
              Math.min(100, focusX + demoPanOffset)
            )}% 50%`,
            transform: isPlaying && framingMode !== 'letterbox-9-16' ? 'scale(1.03)' : 'scale(1)',
          }}
        />
      );
    }

    return (
      <div className="w-full h-full bg-[#13161C] flex items-center justify-center text-xs text-[#9CA3AF]">
        No video frame available
      </div>
    );
  };

  return (
    <main className="flex-1 min-w-0 bg-[#0B0D11] flex flex-col min-h-0 overflow-y-auto">
      {/* Top Toolbar */}
      <div className="px-4 lg:px-6 py-3 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-0.5 rounded-lg bg-[#13161C] border border-white/[0.08]">
          {framingOptions.map((opt) => {
            const active = framingMode === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeFramingMode(opt.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#222834] text-[#F4F5F7]'
                    : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleSafeZones}
            aria-pressed={showSafeZones}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showSafeZones
                ? 'border-amber-400/50 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.1] bg-[#13161C] text-[#9CA3AF] hover:text-[#F4F5F7]'
            }`}
          >
            <Eye className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Shorts Safe Zone</span>
          </button>

          <button
            type="button"
            onClick={onOpenExport}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#C2410C] hover:bg-[#EA580C] text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Export Short</span>
          </button>
        </div>
      </div>

      {/* Center 9:16 Vertical Preview Stage */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 min-h-[420px]">
        <div
          data-testid="vertical-preview-frame"
          className="relative w-full max-w-[300px] sm:max-w-[320px] aspect-[9/16] rounded-2xl overflow-hidden border border-white/[0.14] bg-black shadow-2xl select-none"
        >
          {renderVisualMedia()}

          {/* Scrim for subtitle legibility */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 via-black/30 to-transparent"
          />

          {/* Active Scene Indicator (quiet top-left overlay) */}
          {activeScene && (
            <div className="pointer-events-none absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] font-medium text-white/90 drop-shadow">
              <span className="truncate max-w-[190px] bg-black/55 px-2 py-0.5 rounded">
                {activeScene.label}
              </span>
              <span className="font-mono-tabular bg-black/55 px-2 py-0.5 rounded">
                X:{activeScene.cropFocusX}%
              </span>
            </div>
          )}

          {/* Live Customized Subtitle Overlay */}
          {visibleWords.length > 0 && (
            <div
              data-testid="live-subtitle-overlay"
              className="pointer-events-none absolute inset-x-3 flex flex-col items-center text-center transition-all duration-150"
              style={{
                top: `${subtitleStyle.positionY}%`,
                transform: 'translateY(-50%)',
              }}
            >
              {subtitleStyle.showSpeakerLabel && activeCaption?.speaker && (
                <span
                  className="mb-1 text-[10px] font-semibold tracking-wider uppercase drop-shadow"
                  style={{ color: subtitleStyle.highlightColor }}
                >
                  {activeCaption.speaker}
                </span>
              )}

              <div
                className={`px-3 py-1.5 rounded-lg leading-tight ${fontClass}`}
                style={{
                  backgroundColor:
                    subtitleStyle.backgroundOpacity > 0.02
                      ? `rgba(11, 13, 17, ${subtitleStyle.backgroundOpacity})`
                      : 'transparent',
                  fontSize: `${Math.round(subtitleStyle.fontSize * 0.85)}px`,
                  fontWeight: 700,
                }}
              >
                {visibleWords.map((w, idx) => {
                  const isHighlighted = startIdx + idx === activeWordIdx;
                  const text = subtitleStyle.uppercase ? w.text.toUpperCase() : w.text;
                  return (
                    <span
                      key={`${w.start}-${idx}`}
                      className="inline-block mx-[2.5px] transition-transform duration-100"
                      style={{
                        color: isHighlighted
                          ? subtitleStyle.highlightColor
                          : subtitleStyle.primaryColor,
                        textShadow:
                          subtitleStyle.backgroundOpacity <= 0.05
                            ? '0 2px 2px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), -1px -1px 0 rgba(0,0,0,0.95)'
                            : '0 2px 6px rgba(0,0,0,0.9)',
                        transform:
                          subtitleStyle.preset === 'kinetic-word' && isHighlighted
                            ? 'scale(1.08)'
                            : 'scale(1)',
                      }}
                    >
                      {text}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Optional YouTube Shorts Safe-Zone Overlay */}
          {showSafeZones && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 border-2 border-dashed border-amber-400/50"
            >
              <div className="absolute right-2.5 bottom-20 flex flex-col items-center gap-3 text-white/60">
                <Heart className="w-5 h-5" />
                <MessageSquare className="w-5 h-5" />
                <Share2 className="w-5 h-5" />
              </div>
              <div className="absolute left-3 right-14 bottom-4 text-[10px] text-white/75 leading-tight">
                <p className="font-semibold truncate">@{project.channelOrAuthor}</p>
                <p className="truncate opacity-80">{clip.platformTitle}</p>
              </div>
            </div>
          )}
        </div>

        {/* Transport Bar */}
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSeek(clip.startTime)}
            aria-label="Jump to clip start"
            className="p-2 rounded-lg border border-white/[0.1] bg-[#13161C] text-[#9CA3AF] hover:text-white transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Pause preview' : 'Play preview'}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs font-semibold hover:bg-white transition-colors cursor-pointer"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Play Clip</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            aria-pressed={isLooping}
            aria-label="Toggle loop clip"
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              isLooping
                ? 'border-amber-400/50 bg-amber-500/10 text-amber-300'
                : 'border-white/[0.1] bg-[#13161C] text-[#9CA3AF] hover:text-white'
            }`}
          >
            <Repeat className="w-4 h-4" />
          </button>

          <span className="font-mono-tabular text-xs text-[#D1D5DB] ml-1">
            {formatTimecode(relativeTime)} / {formatTimecode(clipSpan)}
          </span>
        </div>
      </div>

      {/* Scene Detection & Trim Timeline */}
      <div className="border-t border-white/[0.08] bg-[#101318] px-4 lg:px-6 py-3.5 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-medium text-[#F4F5F7]">Scene Timeline</span>
            <span className="text-[#9CA3AF] font-mono-tabular">
              Source {formatTimecode(clip.startTime)} → {formatTimecode(clip.endTime)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="trim-start-input" className="text-[#9CA3AF]">
              In
            </label>
            <input
              id="trim-start-input"
              type="number"
              step="0.5"
              min={0}
              max={Math.max(0, clip.endTime - 5)}
              value={clip.startTime}
              onChange={(e) => onUpdateClipRange(Number(e.target.value), clip.endTime)}
              className="w-16 px-2 py-1 rounded bg-[#0B0D11] border border-white/[0.1] font-mono-tabular text-xs text-[#F4F5F7]"
            />
            <label htmlFor="trim-end-input" className="text-[#9CA3AF]">
              Out
            </label>
            <input
              id="trim-end-input"
              type="number"
              step="0.5"
              min={clip.startTime + 5}
              max={project.duration}
              value={clip.endTime}
              onChange={(e) => onUpdateClipRange(clip.startTime, Number(e.target.value))}
              className="w-16 px-2 py-1 rounded bg-[#0B0D11] border border-white/[0.1] font-mono-tabular text-xs text-[#F4F5F7]"
            />
          </div>
        </div>

        {/* Interactive Scrubber & Scene Cut Track */}
        <div className="space-y-1.5">
          {/* Scene Boundaries Bar */}
          <div
            className="relative h-7 rounded-lg bg-[#0B0D11] border border-white/[0.08] overflow-hidden flex cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              onSeek(clip.startTime + ratio * clipSpan);
            }}
          >
            {clip.scenes.map((scene, idx) => {
              const widthPct = ((scene.end - scene.start) / clipSpan) * 100;
              const isCurrent = activeScene?.id === scene.id;
              return (
                <div
                  key={scene.id}
                  style={{ width: `${Math.max(5, widthPct)}%` }}
                  className={`h-full px-2 flex items-center justify-between border-r border-white/[0.1] last:border-r-0 text-[10px] truncate transition-colors ${
                    isCurrent ? 'bg-amber-500/20 text-amber-200' : 'text-[#9CA3AF]'
                  }`}
                  title={`${scene.label} (${scene.cutType})`}
                >
                  <span className="truncate">
                    {idx + 1}. {scene.label}
                  </span>
                </div>
              );
            })}

            {/* Playhead Needle */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 w-[2px] bg-amber-400"
              style={{ left: `${playheadPct}%` }}
            />
          </div>

          {/* Caption Segments Bar */}
          <div className="relative h-4 rounded bg-[#0B0D11] border border-white/[0.06] overflow-hidden">
            {clip.captions.map((cap) => {
              const leftPct = ((cap.start - clip.startTime) / clipSpan) * 100;
              const widthPct = ((cap.end - cap.start) / clipSpan) * 100;
              const isCurrent = activeCaption?.id === cap.id;
              return (
                <button
                  key={cap.id}
                  type="button"
                  onClick={() => onSeek(cap.start + 0.05)}
                  title={cap.text}
                  style={{
                    left: `${Math.max(0, leftPct)}%`,
                    width: `${Math.max(2, widthPct)}%`,
                  }}
                  className={`absolute top-0.5 bottom-0.5 rounded-sm border transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-amber-400/50 border-amber-300'
                      : 'bg-white/10 border-white/10 hover:bg-white/20'
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
};
