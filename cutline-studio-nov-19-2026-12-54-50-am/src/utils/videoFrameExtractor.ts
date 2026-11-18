import type {
  ExtractedClip,
  FramingMode,
  SubtitleStyleConfig,
} from '../types/studio';
import {
  calculateCropRect,
  chunkWordsForDisplay,
  getActiveCaptionAtTime,
  getActiveSceneAtTime,
  getActiveWordIndex,
} from './shortsEngine';

export interface SampledVideoFrame {
  timestamp: number;
  mimeType: string;
  dataBase64: string;
}

export interface ExtractedVideoInfo {
  duration: number;
  width: number;
  height: number;
  frames: SampledVideoFrame[];
}

export async function extractKeyframesFromVideoFile(
  file: File,
  maxFrames = 10,
  onProgress?: (pct: number) => void
): Promise<ExtractedVideoInfo> {
  const objectUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = objectUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('Could not decode uploaded video file.'));
    });

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 30;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const targetW = 512;
    const targetH = Math.max(180, Math.round((height / width) * targetW));
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');

    const frameCount = Math.min(maxFrames, Math.max(4, Math.floor(duration / 4)));
    const frames: SampledVideoFrame[] = [];

    for (let i = 0; i < frameCount; i++) {
      const timestamp = Number(
        (((i + 0.5) / frameCount) * Math.max(1, duration - 0.5)).toFixed(2)
      );
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = timestamp;
      });

      ctx.drawImage(video, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
      const dataBase64 = dataUrl.split(',')[1] ?? '';
      frames.push({
        timestamp,
        mimeType: 'image/jpeg',
        dataBase64,
      });
      onProgress?.(Math.round(((i + 1) / frameCount) * 100));
    }

    return { duration, width, height, frames };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawSubtitleOnCanvas(
  ctx: CanvasRenderingContext2D,
  clip: ExtractedClip,
  currentTime: number,
  style: SubtitleStyleConfig,
  canvasWidth: number,
  canvasHeight: number
) {
  const activeCaption = getActiveCaptionAtTime(clip.captions, currentTime);
  if (!activeCaption) return;

  const activeWordIdx = getActiveWordIndex(activeCaption, currentTime);
  const { words, startIdx } = chunkWordsForDisplay(
    activeCaption.words,
    activeWordIdx,
    style.maxWordsPerLine
  );
  if (words.length === 0) return;

  const scaleFactor = canvasWidth / 360;
  const fontPx = Math.round(style.fontSize * scaleFactor);
  const fontFamilyMap: Record<SubtitleStyleConfig['fontFamily'], string> = {
    Outfit: 'Outfit, sans-serif',
    'Plus Jakarta Sans': '"Plus Jakarta Sans", sans-serif',
    'JetBrains Mono': '"JetBrains Mono", monospace',
  };

  ctx.save();
  ctx.font = `700 ${fontPx}px ${fontFamilyMap[style.fontFamily]}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const displayTokens = words.map((w) =>
    style.uppercase ? w.text.toUpperCase() : w.text
  );
  const spaceWidth = ctx.measureText(' ').width;
  const tokenWidths = displayTokens.map((t) => ctx.measureText(t).width);
  const totalTextWidth =
    tokenWidths.reduce((acc, w) => acc + w, 0) +
    spaceWidth * Math.max(0, displayTokens.length - 1);

  const centerY = (style.positionY / 100) * canvasHeight;
  const padX = Math.round(16 * scaleFactor);
  const padY = Math.round(10 * scaleFactor);
  const boxW = Math.min(canvasWidth - 40, totalTextWidth + padX * 2);
  const boxH = fontPx * 1.45 + padY * 2;
  const boxX = (canvasWidth - boxW) / 2;
  const boxY = centerY - boxH / 2;

  if (style.backgroundOpacity > 0.02) {
    ctx.fillStyle = `rgba(11, 13, 17, ${style.backgroundOpacity})`;
    drawRoundedRect(ctx, boxX, boxY, boxW, boxH, Math.round(10 * scaleFactor));
    ctx.fill();
  }

  let cursorX = (canvasWidth - totalTextWidth) / 2;
  for (let i = 0; i < displayTokens.length; i++) {
    const isHighlighted = startIdx + i === activeWordIdx;
    const token = displayTokens[i];

    ctx.lineWidth = Math.max(2, Math.round(3 * scaleFactor));
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(token, cursorX, centerY);

    ctx.fillStyle = isHighlighted ? style.highlightColor : style.primaryColor;
    ctx.fillText(token, cursorX, centerY);
    cursorX += tokenWidths[i] + spaceWidth;
  }

  if (style.showSpeakerLabel && activeCaption.speaker) {
    const labelFontPx = Math.round(11 * scaleFactor);
    ctx.font = `600 ${labelFontPx}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = style.highlightColor;
    ctx.textAlign = 'center';
    ctx.fillText(
      activeCaption.speaker.toUpperCase(),
      canvasWidth / 2,
      boxY - Math.round(12 * scaleFactor)
    );
  }
  ctx.restore();
}

export async function exportShortToWebm(options: {
  clip: ExtractedClip;
  style: SubtitleStyleConfig;
  framingMode: FramingMode;
  videoObjectUrl?: string;
  posterImageUrl?: string;
  onProgress: (pct: number) => void;
}): Promise<Blob> {
  const { clip, style, framingMode, videoObjectUrl, posterImageUrl, onProgress } = options;
  const width = 720;
  const height = 1280;
  const fps = 24;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to initialize canvas for export.');

  let sourceVideo: HTMLVideoElement | null = null;
  let posterImg: HTMLImageElement | null = null;

  if (videoObjectUrl) {
    sourceVideo = document.createElement('video');
    sourceVideo.src = videoObjectUrl;
    sourceVideo.muted = true;
    sourceVideo.playsInline = true;
    await new Promise<void>((resolve, reject) => {
      sourceVideo!.onloadeddata = () => resolve();
      sourceVideo!.onerror = () => reject(new Error('Failed to load source video for export.'));
    });
  } else if (posterImageUrl) {
    posterImg = new Image();
    posterImg.crossOrigin = 'anonymous';
    posterImg.src = posterImageUrl;
    await new Promise<void>((resolve, reject) => {
      posterImg!.onload = () => resolve();
      posterImg!.onerror = () => reject(new Error('Failed to load visual frame for export.'));
    });
  }

  const stream = canvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 3_200_000,
  });

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const clipDuration = Math.max(3, clip.endTime - clip.startTime);
  const totalFrames = Math.ceil(clipDuration * fps);

  const recordingDone = new Promise<Blob>((resolve) => {
    recorder.onstop = () => {
      resolve(new Blob(chunks, { type: 'video/webm' }));
    };
  });

  recorder.start(250);

  for (let f = 0; f < totalFrames; f++) {
    const t = clip.startTime + f / fps;
    const activeScene = getActiveSceneAtTime(clip.scenes, t);
    const focusX = activeScene?.cropFocusX ?? 50;

    if (sourceVideo) {
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          sourceVideo!.removeEventListener('seeked', onSeeked);
          resolve();
        };
        sourceVideo!.addEventListener('seeked', onSeeked);
        sourceVideo!.currentTime = t;
      });
    }

    ctx.fillStyle = '#0B0D11';
    ctx.fillRect(0, 0, width, height);

    const drawSource = sourceVideo ?? posterImg;
    if (drawSource) {
      const srcW = sourceVideo ? sourceVideo.videoWidth || 1920 : posterImg!.naturalWidth || 1920;
      const srcH = sourceVideo ? sourceVideo.videoHeight || 1080 : posterImg!.naturalHeight || 1080;

      if (framingMode === 'letterbox-9-16') {
        const drawW = width;
        const drawH = Math.round((srcH / srcW) * drawW);
        const drawY = Math.round((height - drawH) / 2);
        ctx.drawImage(drawSource, 0, drawY, drawW, drawH);
      } else if (framingMode === 'split-9-16') {
        // Top half: Left speaker/detail, Bottom half: Right speaker/detail
        const halfH = height / 2;
        const topRect = calculateCropRect(srcW, srcH, width / halfH, 18);
        const botRect = calculateCropRect(srcW, srcH, width / halfH, 82);
        ctx.drawImage(drawSource, topRect.sx, topRect.sy, topRect.sw, topRect.sh, 0, 0, width, halfH - 2);
        ctx.drawImage(drawSource, botRect.sx, botRect.sy, botRect.sw, botRect.sh, 0, halfH + 2, width, halfH - 2);
      } else {
        const rect = calculateCropRect(srcW, srcH, 9 / 16, focusX);
        ctx.drawImage(drawSource, rect.sx, rect.sy, rect.sw, rect.sh, 0, 0, width, height);
      }
    }

    // Subtle readability bottom scrim
    const scrim = ctx.createLinearGradient(0, height * 0.55, 0, height);
    scrim.addColorStop(0, 'rgba(0,0,0,0)');
    scrim.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, height * 0.55, width, height * 0.45);

    drawSubtitleOnCanvas(ctx, clip, t, style, width, height);

    onProgress(Math.min(99, Math.round(((f + 1) / totalFrames) * 100)));
    await new Promise((r) => setTimeout(r, 1000 / fps));
  }

  recorder.stop();
  onProgress(100);
  return recordingDone;
}
