import React from 'react';
import { Plus } from 'lucide-react';

export type StudioNavSection = 'source' | 'clips' | 'captions' | 'export';

interface TopBarProps {
  activeSection: StudioNavSection;
  onNavigate: (section: StudioNavSection) => void;
  onOpenNewVideo: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeSection,
  onNavigate,
  onOpenNewVideo,
}) => {
  const navItems: Array<{ id: StudioNavSection; label: string }> = [
    { id: 'source', label: 'Source' },
    { id: 'clips', label: 'Clips' },
    { id: 'captions', label: 'Captions' },
    { id: 'export', label: 'Export' },
  ];

  return (
    <header className="h-14 shrink-0 border-b border-white/[0.08] bg-[#0B0D11] px-4 lg:px-6 flex items-center justify-between gap-8">
      {/* Zone 1: Single-element wordmark */}
      <a
        href="#top"
        onClick={(e) => {
          e.preventDefault();
          onNavigate('clips');
        }}
        className="font-display text-lg font-bold tracking-tight text-[#F4F5F7] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 rounded-sm"
      >
        Cutline
      </a>

      {/* Zone 2: 4 concise single-line nav links */}
      <nav aria-label="Studio workspace" className="hidden md:flex items-center gap-7">
        {navItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              className={`relative py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 rounded-sm cursor-pointer ${
                isActive
                  ? 'text-[#F4F5F7]'
                  : 'text-[#9CA3AF] hover:text-[#F4F5F7]'
              }`}
            >
              {item.label}
              {isActive && (
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 -bottom-[13px] h-[2px] bg-amber-400"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center shrink-0">
        <button
          type="button"
          onClick={onOpenNewVideo}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#F4F5F7] text-[#0B0D11] text-xs font-semibold hover:bg-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          <span>New Video</span>
        </button>
      </div>
    </header>
  );
};
