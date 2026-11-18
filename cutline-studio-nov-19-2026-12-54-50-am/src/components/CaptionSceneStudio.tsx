import React, { useState } from 'react';
import {
  Check,
  Copy,
  Loader2,
  Plus,
  Scissors,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  CaptionSegment,
  ExtractedClip,
  SceneBoundary,
  SubtitlePresetId,
  SubtitleStyleConfig,
} from '../types/studio';
import { formatTimecode, getPresetDefaults } from '../utils/shortsEngine';

export type InspectorTab = 'captions' | 'style' | 'scenes' | 'metadata';

interface CaptionSceneStudioProps {
  clip: ExtractedClip;
  activeTab: InspectorTab;
  onTabChange: (tab: InspectorTab) => void;
  currentTime: number;
  subtitleStyle: SubtitleStyleConfig;
  onUpdateStyle: (next: SubtitleStyleConfig) => void;
  onUpdateCaptionText: (captionId: string, text: string) => void;
  onAddCaption: () => void;
  onDeleteCaption: (captionId: string) => void;
  onReplaceCaptions: (captions: CaptionSegment[]) => void;
  onUpdateScene: (sceneId: string, patch: Partial<SceneBoundary>) => void;
  onUpdateClipMeta: (patch: Partial<ExtractedClip>) => void;
  onSeek: (time: number) => void;
}

export const CaptionSceneStudio: React.FC<CaptionSceneStudioProps> = ({
  clip,
  activeTab,
  onTabChange,
  currentTime,
  subtitleStyle,
  onUpdateStyle,
  onUpdateCaptionText,
  onAddCaption,
  onDeleteCaption,
  onReplaceCaptions,
  onUpdateScene,
  onUpdateClipMeta,
  onSeek,
}) => {
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [copiedMeta, setCopiedMeta] = useState(false);

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'captions', label: 'Captions' },
    { id: 'style', label: 'Style' },
    { id: 'scenes', label: 'Scenes' },
    { id: 'metadata', label: 'Metadata' },
  ];

  const presets: Array<{ id: SubtitlePresetId; name: string; desc: string }> = [
    {
      id: 'kinetic-word',
      name: 'Kinetic Word',
      desc: 'Word-by-word highlight with crisp dark backdrop',
    },
    {
      id: 'bold-impact',
      name: 'Bold Impact',
      desc: 'Uppercase high-punch typography for hooks',
    },
    {
      id: 'editorial-lower',
      name: 'Editorial Lower',
      desc: 'Full-phrase clean broadcast subtitle bar',
    },
    {
      id: 'clean-minimal',
      name: 'Clean Minimal',
      desc: 'Monospace technical caption treatment',
    },
  ];

  const handleAiRewrite = async (mode: 'punchy' | 'concise' | 'spanish' | 'french') => {
    if (clip.captions.length === 0) return;
    setRewriteBusy(true);
    setRewriteError(null);
    try {
      const resp = await fetch('/api/captions/rewrite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captions: clip.captions,
          mode,
        }),
      });
      const data = (await resp.json()) as {
        error?: string;
        captions?: CaptionSegment[];
      };
      if (!resp.ok || !data.captions) {
        throw new Error(data.error || 'Failed to rewrite captions.');
      }
      onReplaceCaptions(data.captions);
    } catch (err) {
      setRewriteError(err instanceof Error ? err.message : 'AI rewrite failed.');
    } finally {
      setRewriteBusy(false);
    }
  };

  const handleCopyMetadata = async () => {
    const text = `${clip.platformTitle}\n\n${clip.hookLine}\n\n${clip.suggestedHashtags.join(
      ' '
    )}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMeta(true);
      setTimeout(() => setCopiedMeta(false), 1800);
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <aside
      aria-label="Captions, subtitle style, and scene inspector"
      className="w-full lg:w-[360px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.08] bg-[#101318] flex flex-col min-h-0"
    >
      {/* Inspector Tabs */}
      <div className="p-3 border-b border-white/[0.08]">
        <div
          role="tablist"
          aria-label="Inspector sections"
          className="flex items-center gap-1 p-0.5 rounded-lg bg-[#0B0D11] border border-white/[0.06]"
        >
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#1D222D] text-[#F4F5F7]'
                    : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'captions' && (
          <div className="space-y-4">
            {/* AI Caption Assistant Bar */}
            <div className="p-3 rounded-xl border border-white/[0.08] bg-[#13171F] space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#F4F5F7] flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span>AI Caption Polish</span>
                </span>
                {rewriteBusy && (
                  <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={rewriteBusy}
                  onClick={() => handleAiRewrite('punchy')}
                  className="py-1.5 px-2.5 rounded-lg bg-[#0B0D11] border border-white/[0.08] hover:border-amber-400/50 text-[11px] font-medium text-[#D1D5DB] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Make Punchier
                </button>
                <button
                  type="button"
                  disabled={rewriteBusy}
                  onClick={() => handleAiRewrite('concise')}
                  className="py-1.5 px-2.5 rounded-lg bg-[#0B0D11] border border-white/[0.08] hover:border-amber-400/50 text-[11px] font-medium text-[#D1D5DB] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Trim 30% Tighter
                </button>
                <button
                  type="button"
                  disabled={rewriteBusy}
                  onClick={() => handleAiRewrite('spanish')}
                  className="py-1.5 px-2.5 rounded-lg bg-[#0B0D11] border border-white/[0.08] hover:border-amber-400/50 text-[11px] font-medium text-[#D1D5DB] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Translate Spanish
                </button>
                <button
                  type="button"
                  disabled={rewriteBusy}
                  onClick={() => handleAiRewrite('french')}
                  className="py-1.5 px-2.5 rounded-lg bg-[#0B0D11] border border-white/[0.08] hover:border-amber-400/50 text-[11px] font-medium text-[#D1D5DB] hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Translate French
                </button>
              </div>
              {rewriteError && (
                <p className="text-[11px] text-red-400">{rewriteError}</p>
              )}
            </div>

            {/* Editable Captions List */}
            <div className="space-y-2">
              {clip.captions.map((cap, index) => {
                const isActive =
                  currentTime >= cap.start - 0.03 && currentTime <= cap.end + 0.03;
                return (
                  <div
                    key={cap.id}
                    className={`p-3 rounded-xl border transition-colors ${
                      isActive
                        ? 'bg-[#181D26] border-amber-400/50'
                        : 'bg-[#13171F] border-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <button
                        type="button"
                        onClick={() => onSeek(cap.start + 0.05)}
                        className="font-mono-tabular text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                      >
                        {formatTimecode(cap.start)} – {formatTimecode(cap.end)}
                      </button>
                      <div className="flex items-center gap-2">
                        {cap.speaker && (
                          <span className="text-[11px] text-[#9CA3AF]">
                            {cap.speaker}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => onDeleteCaption(cap.id)}
                          aria-label={`Delete caption line ${index + 1}`}
                          className="p-1 text-[#6B7280] hover:text-red-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <textarea
                      aria-label={`Caption line ${index + 1}`}
                      rows={2}
                      value={cap.text}
                      onChange={(e) => onUpdateCaptionText(cap.id, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0D11] border border-white/[0.08] text-xs text-[#F4F5F7] leading-relaxed focus:outline-none focus:border-amber-400 resize-none"
                    />
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={onAddCaption}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-white/[0.1] bg-[#13171F] hover:bg-[#191E28] text-xs font-medium text-[#D1D5DB] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Add Subtitle Line</span>
            </button>
          </div>
        )}

        {activeTab === 'style' && (
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold text-[#F4F5F7] mb-2.5">
                Subtitle Preset
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p) => {
                  const selected = subtitleStyle.preset === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        onUpdateStyle({
                          ...subtitleStyle,
                          ...getPresetDefaults(p.id),
                        })
                      }
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-[#181D26] border-amber-400/60'
                          : 'bg-[#13171F] border-white/[0.07] hover:border-white/[0.16]'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#F4F5F7]">
                        {p.name}
                      </div>
                      <p className="text-[11px] text-[#9CA3AF] mt-1 leading-snug">
                        {p.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3.5 pt-2 border-t border-white/[0.08]">
              <div>
                <label
                  htmlFor="subtitle-font-select"
                  className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
                >
                  Typography Face
                </label>
                <select
                  id="subtitle-font-select"
                  value={subtitleStyle.fontFamily}
                  onChange={(e) =>
                    onUpdateStyle({
                      ...subtitleStyle,
                      fontFamily: e.target.value as SubtitleStyleConfig['fontFamily'],
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#0B0D11] border border-white/[0.1] text-xs text-[#F4F5F7] focus:outline-none focus:border-amber-400"
                >
                  <option value="Outfit">Outfit (Modern Display)</option>
                  <option value="Plus Jakarta Sans">Plus Jakarta Sans (Editorial)</option>
                  <option value="JetBrains Mono">JetBrains Mono (Technical)</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="subtitle-size-range" className="text-[#D1D5DB]">
                    Font Size
                  </label>
                  <span className="font-mono-tabular text-[#9CA3AF]">
                    {subtitleStyle.fontSize}px
                  </span>
                </div>
                <input
                  id="subtitle-size-range"
                  type="range"
                  min={16}
                  max={34}
                  value={subtitleStyle.fontSize}
                  onChange={(e) =>
                    onUpdateStyle({
                      ...subtitleStyle,
                      fontSize: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="subtitle-pos-range" className="text-[#D1D5DB]">
                    Vertical Position
                  </label>
                  <span className="font-mono-tabular text-[#9CA3AF]">
                    {subtitleStyle.positionY}%
                  </span>
                </div>
                <input
                  id="subtitle-pos-range"
                  type="range"
                  min={20}
                  max={86}
                  value={subtitleStyle.positionY}
                  onChange={(e) =>
                    onUpdateStyle({
                      ...subtitleStyle,
                      positionY: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="subtitle-words-range" className="text-[#D1D5DB]">
                    Words per Cue
                  </label>
                  <span className="font-mono-tabular text-[#9CA3AF]">
                    {subtitleStyle.maxWordsPerLine}
                  </span>
                </div>
                <input
                  id="subtitle-words-range"
                  type="range"
                  min={2}
                  max={7}
                  value={subtitleStyle.maxWordsPerLine}
                  onChange={(e) =>
                    onUpdateStyle({
                      ...subtitleStyle,
                      maxWordsPerLine: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <label htmlFor="subtitle-bg-range" className="text-[#D1D5DB]">
                    Backdrop Opacity
                  </label>
                  <span className="font-mono-tabular text-[#9CA3AF]">
                    {Math.round(subtitleStyle.backgroundOpacity * 100)}%
                  </span>
                </div>
                <input
                  id="subtitle-bg-range"
                  type="range"
                  min={0}
                  max={90}
                  value={Math.round(subtitleStyle.backgroundOpacity * 100)}
                  onChange={(e) =>
                    onUpdateStyle({
                      ...subtitleStyle,
                      backgroundOpacity: Number(e.target.value) / 100,
                    })
                  }
                  className="w-full accent-amber-400 cursor-pointer"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#D1D5DB] mb-2">
                  Active Word Highlight Color
                </span>
                <div className="flex items-center gap-2">
                  {['#F59E0B', '#EF4444', '#38BDF8', '#10B981', '#FFFFFF'].map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      aria-label={`Highlight color ${hex}`}
                      onClick={() =>
                        onUpdateStyle({ ...subtitleStyle, highlightColor: hex })
                      }
                      style={{ backgroundColor: hex }}
                      className={`w-7 h-7 rounded-lg border-2 cursor-pointer transition-transform ${
                        subtitleStyle.highlightColor === hex
                          ? 'border-white scale-110'
                          : 'border-white/20'
                      }`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <label htmlFor="uppercase-toggle" className="text-xs text-[#D1D5DB]">
                  Uppercase Text
                </label>
                <input
                  id="uppercase-toggle"
                  type="checkbox"
                  checked={subtitleStyle.uppercase}
                  onChange={(e) =>
                    onUpdateStyle({ ...subtitleStyle, uppercase: e.target.checked })
                  }
                  className="w-4 h-4 accent-amber-400 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <label htmlFor="speaker-toggle" className="text-xs text-[#D1D5DB]">
                  Show Speaker Name
                </label>
                <input
                  id="speaker-toggle"
                  type="checkbox"
                  checked={subtitleStyle.showSpeakerLabel}
                  onChange={(e) =>
                    onUpdateStyle({
                      ...subtitleStyle,
                      showSpeakerLabel: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-amber-400 cursor-pointer"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'scenes' && (
          <div className="space-y-3">
            <p className="text-xs text-[#9CA3AF] leading-relaxed">
              AI-detected scene cuts inside this clip. Adjust the horizontal crop focus per scene to keep active speakers centered in 9:16.
            </p>

            {clip.scenes.map((scene, idx) => {
              const isCurrent =
                currentTime >= scene.start - 0.03 && currentTime <= scene.end + 0.03;
              return (
                <div
                  key={scene.id}
                  className={`p-3.5 rounded-xl border space-y-2.5 ${
                    isCurrent
                      ? 'bg-[#181D26] border-amber-400/50'
                      : 'bg-[#13171F] border-white/[0.07]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onSeek(scene.start + 0.05)}
                      className="text-xs font-semibold text-[#F4F5F7] hover:text-amber-300 flex items-center gap-1.5 cursor-pointer text-left"
                    >
                      <Scissors className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span>
                        {idx + 1}. {scene.label}
                      </span>
                    </button>
                    <span className="font-mono-tabular text-[11px] text-[#9CA3AF] shrink-0">
                      {formatTimecode(scene.start)} – {formatTimecode(scene.end)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                    <span>{scene.cutType}</span>
                    <span aria-hidden="true">·</span>
                    <span>{scene.energy} energy</span>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] text-[#D1D5DB] mb-1">
                      <label htmlFor={`crop-focus-${scene.id}`}>
                        9:16 Horizontal Crop Focus
                      </label>
                      <span className="font-mono-tabular">{scene.cropFocusX}%</span>
                    </div>
                    <input
                      id={`crop-focus-${scene.id}`}
                      type="range"
                      min={0}
                      max={100}
                      value={scene.cropFocusX}
                      onChange={(e) => {
                        onUpdateScene(scene.id, {
                          cropFocusX: Number(e.target.value),
                        });
                        onSeek(scene.start + 0.2);
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'metadata' && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="short-title-input"
                className="block text-xs font-medium text-[#D1D5DB] mb-1.5"
              >
                YouTube Shorts Title
              </label>
              <input
                id="short-title-input"
                type="text"
                value={clip.platformTitle}
                onChange={(e) =>
                  onUpdateClipMeta({ platformTitle: e.target.value })
                }
                className="w-full px-3 py-2 rounded-lg bg-[#0B0D11] border border-white/[0.1] text-xs text-[#F4F5F7] focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <span className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                Opening Hook Line
              </span>
              <p className="p-3 rounded-xl bg-[#13171F] border border-white/[0.07] text-xs text-[#E5E7EB] leading-relaxed">
                {clip.hookLine}
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                AI Engagement Rationale
              </span>
              <p className="p-3 rounded-xl bg-[#13171F] border border-white/[0.07] text-xs text-[#9CA3AF] leading-relaxed">
                {clip.rationale}
              </p>
            </div>

            <div>
              <span className="block text-xs font-medium text-[#D1D5DB] mb-1.5">
                Suggested Hashtags
              </span>
              <p className="text-xs text-amber-300 font-mono-tabular leading-relaxed">
                {clip.suggestedHashtags.join(' ')}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyMetadata}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border border-white/[0.12] bg-[#13171F] hover:bg-[#191E28] text-xs font-medium text-[#F4F5F7] transition-colors cursor-pointer"
            >
              {copiedMeta ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Copied Title &amp; Tags</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Title, Hook &amp; Hashtags</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
