import type {
  CaptionSegment,
  CaptionWord,
  SceneBoundary,
  SubtitleStyleConfig,
} from '../types/studio';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyleConfig = {
  preset: 'kinetic-word',
  fontFamily: 'Outfit',
  fontSize: 24,
  positionY: 74,
  primaryColor: '#FFFFFF',
  highlightColor: '#F59E0B',
  backgroundOpacity: 0.72,
  uppercase: false,
  showSpeakerLabel: false,
  maxWordsPerLine: 4,
};

export function extractYouTubeVideoId(rawUrl: string): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Support bare 11-char YouTube ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  if (host === 'youtu.be') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  }

  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtube-nocookie.com'
  ) {
    const vParam = parsed.searchParams.get('v');
    if (vParam && /^[A-Za-z0-9_-]{11}$/.test(vParam)) {
      return vParam;
    }

    const segments = parsed.pathname.split('/').filter(Boolean);
    if (
      segments.length >= 2 &&
      (segments[0] === 'shorts' || segments[0] === 'embed' || segments[0] === 'live')
    ) {
      const id = segments[1];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
  }

  return null;
}

export function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

export function formatShortDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  if (safe < 60) return `${safe}s`;
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return rem === 0 ? `${mins}m` : `${mins}m ${rem}s`;
}

export function formatSrtTimestamp(seconds: number): string {
  const safeMs = Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * 1000));
  const hours = Math.floor(safeMs / 3_600_000);
  const mins = Math.floor((safeMs % 3_600_000) / 60_000);
  const secs = Math.floor((safeMs % 60_000) / 1000);
  const ms = safeMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(
    secs
  ).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

export function formatVttTimestamp(seconds: number): string {
  return formatSrtTimestamp(seconds).replace(',', '.');
}

export function splitCaptionIntoWords(
  text: string,
  start: number,
  end: number
): CaptionWord[] {
  const cleaned = text.trim().replace(/\s+/g, ' ');
  if (!cleaned) return [];

  const tokens = cleaned.split(' ');
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart + 0.2, end);
  const totalDuration = safeEnd - safeStart;

  // Weight word duration slightly by character length for natural cadence
  const weights = tokens.map((token) => Math.max(2, token.replace(/[^a-zA-Z0-9]/g, '').length));
  const weightSum = weights.reduce((acc, w) => acc + w, 0);

  let cursor = safeStart;
  return tokens.map((token, idx) => {
    const share = (weights[idx] / weightSum) * totalDuration;
    const wordStart = cursor;
    const wordEnd = idx === tokens.length - 1 ? safeEnd : cursor + share;
    cursor = wordEnd;
    return {
      text: token,
      start: Number(wordStart.toFixed(3)),
      end: Number(wordEnd.toFixed(3)),
    };
  });
}

export function getActiveCaptionAtTime(
  captions: CaptionSegment[],
  currentTime: number
): CaptionSegment | null {
  for (const cap of captions) {
    if (currentTime >= cap.start - 0.03 && currentTime <= cap.end + 0.03) {
      return cap;
    }
  }
  return null;
}

export function getActiveWordIndex(
  caption: CaptionSegment | null,
  currentTime: number
): number {
  if (!caption || caption.words.length === 0) return -1;
  for (let i = 0; i < caption.words.length; i++) {
    const w = caption.words[i];
    if (currentTime >= w.start - 0.02 && currentTime <= w.end + 0.04) {
      return i;
    }
  }
  if (currentTime < caption.words[0].start) return 0;
  return caption.words.length - 1;
}

export function getActiveSceneAtTime(
  scenes: SceneBoundary[],
  currentTime: number
): SceneBoundary | null {
  for (const scene of scenes) {
    if (currentTime >= scene.start - 0.03 && currentTime <= scene.end + 0.03) {
      return scene;
    }
  }
  return scenes[0] ?? null;
}

export function chunkWordsForDisplay(
  words: CaptionWord[],
  activeWordIndex: number,
  maxWordsPerLine: number
): { words: CaptionWord[]; startIdx: number } {
  if (words.length === 0) return { words: [], startIdx: 0 };
  const chunkSize = Math.max(2, Math.min(8, maxWordsPerLine));
  if (words.length <= chunkSize) return { words, startIdx: 0 };

  const safeActive = Math.max(0, Math.min(words.length - 1, activeWordIndex));
  const chunkIndex = Math.floor(safeActive / chunkSize);
  const startIdx = chunkIndex * chunkSize;
  return {
    words: words.slice(startIdx, startIdx + chunkSize),
    startIdx,
  };
}

export function generateSrt(captions: CaptionSegment[], clipStart: number): string {
  return captions
    .map((cap, idx) => {
      const relStart = Math.max(0, cap.start - clipStart);
      const relEnd = Math.max(relStart + 0.2, cap.end - clipStart);
      return `${idx + 1}\n${formatSrtTimestamp(relStart)} --> ${formatSrtTimestamp(relEnd)}\n${cap.text.trim()}`;
    })
    .join('\n\n')
    .concat(captions.length > 0 ? '\n' : '');
}

export function generateVtt(captions: CaptionSegment[], clipStart: number): string {
  const cues = captions
    .map((cap) => {
      const relStart = Math.max(0, cap.start - clipStart);
      const relEnd = Math.max(relStart + 0.2, cap.end - clipStart);
      return `${formatVttTimestamp(relStart)} --> ${formatVttTimestamp(relEnd)}\n${cap.text.trim()}`;
    })
    .join('\n\n');
  return `WEBVTT\n\n${cues}${cues ? '\n' : ''}`;
}

export function clampClipRange(
  start: number,
  end: number,
  maxDuration: number,
  minClipSeconds = 5
): { start: number; end: number } {
  const safeMax = Math.max(minClipSeconds, maxDuration);
  let s = Math.max(0, Math.min(start, safeMax - minClipSeconds));
  let e = Math.max(s + minClipSeconds, Math.min(end, safeMax));
  if (e - s < minClipSeconds) {
    s = Math.max(0, e - minClipSeconds);
  }
  return {
    start: Number(s.toFixed(2)),
    end: Number(e.toFixed(2)),
  };
}

export function calculateCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio = 9 / 16,
  focusXPercent = 50
): { sx: number; sy: number; sw: number; sh: number } {
  const sw = Math.min(sourceWidth, Math.round(sourceHeight * targetAspectRatio));
  const sh = Math.min(sourceHeight, Math.round(sw / targetAspectRatio));
  const maxOffsetX = Math.max(0, sourceWidth - sw);
  const clampedFocus = Math.max(0, Math.min(100, focusXPercent)) / 100;
  const sx = Math.round(maxOffsetX * clampedFocus);
  const sy = Math.round(Math.max(0, (sourceHeight - sh) / 2));
  return {
    sx,
    sy,
    sw,
    sh,
  };
}

export function getPresetDefaults(
  preset: SubtitleStyleConfig['preset']
): Partial<SubtitleStyleConfig> {
  switch (preset) {
    case 'kinetic-word':
      return {
        preset: 'kinetic-word',
        fontFamily: 'Outfit',
        fontSize: 25,
        positionY: 74,
        primaryColor: '#FFFFFF',
        highlightColor: '#F59E0B',
        backgroundOpacity: 0.72,
        uppercase: false,
        maxWordsPerLine: 4,
      };
    case 'bold-impact':
      return {
        preset: 'bold-impact',
        fontFamily: 'Outfit',
        fontSize: 28,
        positionY: 70,
        primaryColor: '#FFFFFF',
        highlightColor: '#EF4444',
        backgroundOpacity: 0,
        uppercase: true,
        maxWordsPerLine: 3,
      };
    case 'editorial-lower':
      return {
        preset: 'editorial-lower',
        fontFamily: 'Plus Jakarta Sans',
        fontSize: 19,
        positionY: 80,
        primaryColor: '#F4F5F7',
        highlightColor: '#38BDF8',
        backgroundOpacity: 0.82,
        uppercase: false,
        maxWordsPerLine: 6,
      };
    case 'clean-minimal':
      return {
        preset: 'clean-minimal',
        fontFamily: 'JetBrains Mono',
        fontSize: 18,
        positionY: 76,
        primaryColor: '#F9FAFB',
        highlightColor: '#10B981',
        backgroundOpacity: 0.55,
        uppercase: false,
        maxWordsPerLine: 5,
      };
  }
}
