import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEMO_PROJECTS } from './data/demoProjects';
import type {
  CaptionSegment,
  ExtractedClip,
  FramingMode,
  SceneBoundary,
  SubtitleStyleConfig,
  VideoProject,
} from './types/studio';
import {
  clampClipRange,
  DEFAULT_SUBTITLE_STYLE,
  splitCaptionIntoWords,
} from './utils/shortsEngine';
import { TopBar, type StudioNavSection } from './components/TopBar';
import { ClipsSidebar } from './components/ClipsSidebar';
import { VerticalPreviewStage } from './components/VerticalPreviewStage';
import {
  CaptionSceneStudio,
  type InspectorTab,
} from './components/CaptionSceneStudio';
import { SourceIntakeModal } from './components/SourceIntakeModal';
import { ExportModal } from './components/ExportModal';

const STYLE_STORAGE_KEY = 'cutline_subtitle_style_v1';

function loadInitialStyle(): SubtitleStyleConfig {
  try {
    const raw = localStorage.getItem(STYLE_STORAGE_KEY);
    if (!raw) return DEFAULT_SUBTITLE_STYLE;
    return { ...DEFAULT_SUBTITLE_STYLE, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SUBTITLE_STYLE;
  }
}

type MobilePane = 'clips' | 'preview' | 'inspector';

export default function App() {
  const [project, setProject] = useState<VideoProject>(DEMO_PROJECTS[0]);
  const [activeClipId, setActiveClipId] = useState<string>(
    DEMO_PROJECTS[0].clips[0].id
  );
  const [currentTime, setCurrentTime] = useState<number>(
    DEMO_PROJECTS[0].clips[0].startTime + 0.5
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [showSafeZones, setShowSafeZones] = useState<boolean>(false);
  const [framingMode, setFramingMode] = useState<FramingMode>('smart-crop-9-16');
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>(
    loadInitialStyle
  );

  const [navSection, setNavSection] = useState<StudioNavSection>('clips');
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('captions');
  const [mobilePane, setMobilePane] = useState<MobilePane>('preview');
  const [sourceModalOpen, setSourceModalOpen] = useState<boolean>(false);
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);

  const activeClip = useMemo<ExtractedClip>(() => {
    return (
      project.clips.find((c) => c.id === activeClipId) ?? project.clips[0]
    );
  }, [project.clips, activeClipId]);

  useEffect(() => {
    try {
      localStorage.setItem(STYLE_STORAGE_KEY, JSON.stringify(subtitleStyle));
    } catch {
      // Ignore storage quota errors
    }
  }, [subtitleStyle]);

  // Playback tick inside active clip bounds
  useEffect(() => {
    if (!isPlaying) return;
    const intervalMs = 50;
    const timer = window.setInterval(() => {
      setCurrentTime((prev) => {
        const next = prev + intervalMs / 1000;
        if (next >= activeClip.endTime) {
          if (isLooping) {
            return activeClip.startTime;
          }
          setIsPlaying(false);
          return activeClip.endTime;
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [isPlaying, isLooping, activeClip.startTime, activeClip.endTime]);

  const handleSelectClip = useCallback(
    (clipId: string) => {
      const target = project.clips.find((c) => c.id === clipId);
      if (!target) return;
      setActiveClipId(clipId);
      setCurrentTime(target.startTime + 0.25);
      setIsPlaying(false);
      setMobilePane('preview');
    },
    [project.clips]
  );

  const handleProjectLoaded = useCallback((nextProject: VideoProject) => {
    setProject(nextProject);
    const firstClip = nextProject.clips[0];
    if (firstClip) {
      setActiveClipId(firstClip.id);
      setCurrentTime(firstClip.startTime + 0.25);
    }
    setIsPlaying(false);
    setNavSection('clips');
  }, []);

  const updateActiveClip = useCallback(
    (updater: (clip: ExtractedClip) => ExtractedClip) => {
      setProject((prev) => ({
        ...prev,
        clips: prev.clips.map((c) =>
          c.id === activeClip.id ? updater(c) : c
        ),
      }));
    },
    [activeClip.id]
  );

  const handleUpdateCaptionText = useCallback(
    (captionId: string, text: string) => {
      updateActiveClip((clip) => ({
        ...clip,
        captions: clip.captions.map((cap) =>
          cap.id === captionId
            ? {
                ...cap,
                text,
                words: splitCaptionIntoWords(text, cap.start, cap.end),
              }
            : cap
        ),
      }));
    },
    [updateActiveClip]
  );

  const handleAddCaption = useCallback(() => {
    updateActiveClip((clip) => {
      const lastCap = clip.captions[clip.captions.length - 1];
      const start = lastCap
        ? Math.min(clip.endTime - 1.5, lastCap.end)
        : clip.startTime;
      const end = Math.min(clip.endTime, start + 2.5);
      const text = 'New subtitle line';
      const nextCap: CaptionSegment = {
        id: `cap-${Date.now()}`,
        start: Number(start.toFixed(2)),
        end: Number(end.toFixed(2)),
        text,
        words: splitCaptionIntoWords(text, start, end),
      };
      return {
        ...clip,
        captions: [...clip.captions, nextCap],
      };
    });
  }, [updateActiveClip]);

  const handleDeleteCaption = useCallback(
    (captionId: string) => {
      updateActiveClip((clip) => ({
        ...clip,
        captions: clip.captions.filter((c) => c.id !== captionId),
      }));
    },
    [updateActiveClip]
  );

  const handleReplaceCaptions = useCallback(
    (captions: CaptionSegment[]) => {
      updateActiveClip((clip) => ({
        ...clip,
        captions,
      }));
    },
    [updateActiveClip]
  );

  const handleUpdateScene = useCallback(
    (sceneId: string, patch: Partial<SceneBoundary>) => {
      updateActiveClip((clip) => ({
        ...clip,
        scenes: clip.scenes.map((s) =>
          s.id === sceneId ? { ...s, ...patch } : s
        ),
      }));
    },
    [updateActiveClip]
  );

  const handleUpdateClipRange = useCallback(
    (rawStart: number, rawEnd: number) => {
      const clamped = clampClipRange(rawStart, rawEnd, project.duration, 5);
      updateActiveClip((clip) => ({
        ...clip,
        startTime: clamped.start,
        endTime: clamped.end,
        duration: Number((clamped.end - clamped.start).toFixed(1)),
      }));
      setCurrentTime((t) =>
        Math.max(clamped.start, Math.min(clamped.end, t))
      );
    },
    [project.duration, updateActiveClip]
  );

  const handleUpdateClipMeta = useCallback(
    (patch: Partial<ExtractedClip>) => {
      updateActiveClip((clip) => ({
        ...clip,
        ...patch,
      }));
    },
    [updateActiveClip]
  );

  const handleCreateCustomClip = useCallback(() => {
    const start = Math.min(
      Math.max(0, project.duration - 25),
      Math.round(activeClip.endTime + 5)
    );
    const end = Math.min(project.duration, start + 25);
    const newId = `clip-custom-${Date.now()}`;
    const introText = 'Custom segment hook starts right here.';
    const nextClip: ExtractedClip = {
      id: newId,
      rank: project.clips.length + 1,
      title: `Custom Segment #${project.clips.length + 1}`,
      hookLine: introText,
      rationale: 'User-defined custom highlight segment.',
      startTime: start,
      endTime: end,
      duration: Number((end - start).toFixed(1)),
      pacing: 'Dynamic',
      platformTitle: `Highlight Segment #${project.clips.length + 1} #shorts`,
      suggestedHashtags: ['#shorts', '#highlights'],
      scenes: [
        {
          id: `sc-custom-${Date.now()}`,
          start,
          end,
          label: 'Custom Scene Focus',
          cutType: 'topic-pivot',
          cropFocusX: 50,
          energy: 'medium',
        },
      ],
      captions: [
        {
          id: `cap-custom-${Date.now()}`,
          start,
          end: Math.min(end, start + 4),
          text: introText,
          words: splitCaptionIntoWords(introText, start, Math.min(end, start + 4)),
        },
      ],
    };

    setProject((prev) => ({
      ...prev,
      clips: [...prev.clips, nextClip],
    }));
    setActiveClipId(newId);
    setCurrentTime(start + 0.2);
    setIsPlaying(false);
  }, [activeClip.endTime, project.clips.length, project.duration]);

  const handleNavigate = (section: StudioNavSection) => {
    setNavSection(section);
    if (section === 'source') {
      setSourceModalOpen(true);
    } else if (section === 'clips') {
      setMobilePane('clips');
    } else if (section === 'captions') {
      setInspectorTab('captions');
      setMobilePane('inspector');
    } else if (section === 'export') {
      setExportModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-[#0B0D11] text-[#F4F5F7] lg:overflow-hidden">
      <TopBar
        activeSection={navSection}
        onNavigate={handleNavigate}
        onOpenNewVideo={() => setSourceModalOpen(true)}
      />

      {/* Mobile Pane Switcher (< lg only) */}
      <div className="lg:hidden px-4 py-2 border-b border-white/[0.08] bg-[#101318] flex items-center gap-1">
        {(
          [
            { id: 'clips', label: 'Clips' },
            { id: 'preview', label: '9:16 Preview' },
            { id: 'inspector', label: 'Captions & Style' },
          ] as const
        ).map((pane) => (
          <button
            key={pane.id}
            type="button"
            onClick={() => setMobilePane(pane.id)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mobilePane === pane.id
                ? 'bg-[#1D222D] text-[#F4F5F7]'
                : 'text-[#9CA3AF] hover:text-white'
            }`}
          >
            {pane.label}
          </button>
        ))}
      </div>

      {/* 3-Pane Studio Workbench */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">
        <div
          className={`${
            mobilePane === 'clips' ? 'flex' : 'hidden'
          } lg:flex flex-col min-h-0`}
        >
          <ClipsSidebar
            project={project}
            activeClipId={activeClip.id}
            onSelectClip={handleSelectClip}
            onCreateCustomClip={handleCreateCustomClip}
            onOpenSourceModal={() => setSourceModalOpen(true)}
          />
        </div>

        <div
          className={`${
            mobilePane === 'preview' ? 'flex' : 'hidden'
          } lg:flex flex-1 min-w-0 min-h-0 flex-col`}
        >
          <VerticalPreviewStage
            project={project}
            clip={activeClip}
            currentTime={currentTime}
            isPlaying={isPlaying}
            isLooping={isLooping}
            showSafeZones={showSafeZones}
            framingMode={framingMode}
            subtitleStyle={subtitleStyle}
            onTogglePlay={() => setIsPlaying((p) => !p)}
            onSeek={(t) =>
              setCurrentTime(
                Math.max(activeClip.startTime, Math.min(activeClip.endTime, t))
              )
            }
            onToggleLoop={() => setIsLooping((l) => !l)}
            onToggleSafeZones={() => setShowSafeZones((s) => !s)}
            onChangeFramingMode={setFramingMode}
            onUpdateClipRange={handleUpdateClipRange}
            onOpenExport={() => setExportModalOpen(true)}
          />
        </div>

        <div
          className={`${
            mobilePane === 'inspector' ? 'flex' : 'hidden'
          } lg:flex flex-col min-h-0`}
        >
          <CaptionSceneStudio
            clip={activeClip}
            activeTab={inspectorTab}
            onTabChange={setInspectorTab}
            currentTime={currentTime}
            subtitleStyle={subtitleStyle}
            onUpdateStyle={setSubtitleStyle}
            onUpdateCaptionText={handleUpdateCaptionText}
            onAddCaption={handleAddCaption}
            onDeleteCaption={handleDeleteCaption}
            onReplaceCaptions={handleReplaceCaptions}
            onUpdateScene={handleUpdateScene}
            onUpdateClipMeta={handleUpdateClipMeta}
            onSeek={(t) =>
              setCurrentTime(
                Math.max(activeClip.startTime, Math.min(activeClip.endTime, t))
              )
            }
          />
        </div>
      </div>

      <SourceIntakeModal
        isOpen={sourceModalOpen}
        onClose={() => setSourceModalOpen(false)}
        onProjectLoaded={handleProjectLoaded}
      />

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        project={project}
        clip={activeClip}
        subtitleStyle={subtitleStyle}
        framingMode={framingMode}
      />
    </div>
  );
}
