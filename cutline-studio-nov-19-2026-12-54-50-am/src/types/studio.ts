export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface CaptionSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words: CaptionWord[];
}

export type SceneCutType = 'hook' | 'speaker-shift' | 'b-roll' | 'topic-pivot' | 'climax';

export interface SceneBoundary {
  id: string;
  start: number;
  end: number;
  label: string;
  cutType: SceneCutType;
  cropFocusX: number; // 0 (left) to 100 (right)
  energy: 'low' | 'medium' | 'high';
}

export interface ExtractedClip {
  id: string;
  rank: number;
  title: string;
  hookLine: string;
  rationale: string;
  startTime: number;
  endTime: number;
  duration: number;
  pacing: 'Steady' | 'Dynamic' | 'Rapid';
  platformTitle: string;
  suggestedHashtags: string[];
  scenes: SceneBoundary[];
  captions: CaptionSegment[];
}

export type SubtitlePresetId =
  | 'kinetic-word'
  | 'editorial-lower'
  | 'bold-impact'
  | 'clean-minimal';

export interface SubtitleStyleConfig {
  preset: SubtitlePresetId;
  fontFamily: 'Outfit' | 'Plus Jakarta Sans' | 'JetBrains Mono';
  fontSize: number; // px relative to preview scale (16 - 34)
  positionY: number; // % from top (15 - 88)
  primaryColor: string;
  highlightColor: string;
  backgroundOpacity: number; // 0 - 0.9
  uppercase: boolean;
  showSpeakerLabel: boolean;
  maxWordsPerLine: number; // 2 - 6
}

export type FramingMode = 'smart-crop-9-16' | 'split-9-16' | 'letterbox-9-16';

export interface TranscriptCue {
  start: number;
  duration: number;
  text: string;
}

export interface VideoProject {
  id: string;
  sourceType: 'youtube' | 'upload' | 'demo';
  title: string;
  channelOrAuthor: string;
  youtubeId?: string;
  youtubeUrl?: string;
  videoObjectUrl?: string;
  posterImageUrl?: string;
  duration: number;
  width: number;
  height: number;
  transcriptSummary: string;
  clips: ExtractedClip[];
  createdAt: string;
}

export type AnalysisStage =
  | 'idle'
  | 'ingesting'
  | 'detecting-scenes'
  | 'scoring-clips'
  | 'error';
