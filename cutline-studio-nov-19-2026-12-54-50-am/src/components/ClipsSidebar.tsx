import React, { useMemo, useState } from 'react';
import { Film, Plus } from 'lucide-react';
import type { ExtractedClip, VideoProject } from '../types/studio';
import { formatShortDuration, formatTimecode } from '../utils/shortsEngine';

interface ClipsSidebarProps {
  project: VideoProject;
  activeClipId: string;
  onSelectClip: (clipId: string) => void;
  onCreateCustomClip: () => void;
  onOpenSourceModal: () => void;
}

type PacingFilter = 'All' | 'Rapid' | 'Dynamic' | 'Steady';

export const ClipsSidebar: React.FC<ClipsSidebarProps> = ({
  project,
  activeClipId,
  onSelectClip,
  onCreateCustomClip,
  onOpenSourceModal,
}) => {
  const [pacingFilter, setPacingFilter] = useState<PacingFilter>('All');
  const [imgFailed, setImgFailed] = useState(false);

  const filteredClips = useMemo(() => {
    if (pacingFilter === 'All') return project.clips;
    return project.clips.filter((c) => c.pacing === pacingFilter);
  }, [project.clips, pacingFilter]);

  const filterOptions: PacingFilter[] = ['All', 'Rapid', 'Dynamic', 'Steady'];

  return (
    <aside
      aria-label="Source video and extracted Shorts clips"
      className="w-full lg:w-[320px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.08] bg-[#101318] flex flex-col min-h-0"
    >
      {/* Source Video Summary */}
      <div className="p-4 border-b border-white/[0.08]">
        <div className="flex items-start gap-3">
          <div className="w-20 h-12 rounded-md overflow-hidden bg-[#181C24] border border-white/[0.08] shrink-0 flex items-center justify-center">
            {project.posterImageUrl && !imgFailed ? (
              <img
                src={project.posterImageUrl}
                alt={project.title}
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <Film className="w-5 h-5 text-[#6B7280]" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-sm font-semibold text-[#F4F5F7] line-clamp-2 leading-snug">
              {project.title}
            </h1>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-[#9CA3AF] truncate">
              <span className="truncate">{project.channelOrAuthor}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular shrink-0">
                {formatShortDuration(project.duration)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-[#9CA3AF]">
          <span>
            <strong className="text-[#F4F5F7] font-mono-tabular">
              {project.clips.length}
            </strong>{' '}
            extracted {project.clips.length === 1 ? 'short' : 'shorts'}
          </span>
          <button
            type="button"
            onClick={onOpenSourceModal}
            className="text-amber-400 hover:text-amber-300 font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 rounded-sm"
          >
            Switch Source
          </button>
        </div>
      </div>

      {/* Pacing Filter */}
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Filter clips by pacing"
          className="flex items-center gap-1 p-0.5 bg-[#0B0D11] rounded-lg border border-white/[0.06] w-full"
        >
          {filterOptions.map((option) => {
            const active = pacingFilter === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setPacingFilter(option)}
                className={`flex-1 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#1D222D] text-[#F4F5F7]'
                    : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>

      {/* Extracted Clips List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {filteredClips.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#9CA3AF]">
            <p>No clips match the {pacingFilter} pacing filter.</p>
            <button
              type="button"
              onClick={() => setPacingFilter('All')}
              className="mt-2 text-amber-400 hover:text-amber-300 font-medium cursor-pointer"
            >
              Show all clips
            </button>
          </div>
        ) : (
          filteredClips.map((clip: ExtractedClip) => {
            const isSelected = clip.id === activeClipId;
            return (
              <button
                key={clip.id}
                type="button"
                onClick={() => onSelectClip(clip.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  isSelected
                    ? 'bg-[#181D26] border-amber-400/60'
                    : 'bg-[#13171F] border-white/[0.07] hover:border-white/[0.16] hover:bg-[#161B24]'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-mono-tabular text-xs font-semibold text-amber-400 shrink-0">
                    Clip {clip.rank}
                  </span>
                  <span className="font-mono-tabular text-[11px] text-[#9CA3AF] shrink-0">
                    {formatTimecode(clip.startTime)} – {formatTimecode(clip.endTime)}
                  </span>
                </div>

                <h2 className="mt-1.5 font-display text-sm font-semibold text-[#F4F5F7] leading-snug">
                  {clip.title}
                </h2>

                <p className="mt-1.5 text-xs text-[#9CA3AF] line-clamp-2 leading-relaxed">
                  {clip.hookLine}
                </p>

                <div className="mt-2.5 pt-2 border-t border-white/[0.06] flex items-center gap-2 text-[11px] text-[#9CA3AF]">
                  <span className="font-mono-tabular text-[#D1D5DB]">
                    {formatShortDuration(clip.duration)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">
                    {clip.scenes.length} {clip.scenes.length === 1 ? 'scene' : 'scenes'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{clip.pacing} pacing</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Custom Clip Action */}
      <div className="p-3 border-t border-white/[0.08]">
        <button
          type="button"
          onClick={onCreateCustomClip}
          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg border border-white/[0.12] bg-[#141820] hover:bg-[#1A202B] text-xs font-medium text-[#F4F5F7] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Add Custom Clip Segment</span>
        </button>
      </div>
    </aside>
  );
};
