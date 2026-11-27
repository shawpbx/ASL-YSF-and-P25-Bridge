import React from 'react';
import { Activity, Sliders, Container, FileCode2, Radio, X } from 'lucide-react';
import { BridgeConfig } from '../shared/bridgeTypes';

export type NavSection = 'overview' | 'audio' | 'docker' | 'config';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  config: BridgeConfig;
  linkedLegs: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'audio', label: 'Audio & Transcoding', icon: Sliders },
  { id: 'docker', label: 'Docker Stack', icon: Container },
  { id: 'config', label: 'Config & Files', icon: FileCode2 },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  config,
  linkedLegs,
  mobileOpen,
  onCloseMobile,
}) => {
  const navContent = (
    <div className="flex h-full flex-col bg-white border-r border-slate-200">
      {/* Brand header */}
      <div className="flex h-14 items-center justify-between px-5 border-b border-slate-200">
        <div className="flex items-center gap-2.5 min-w-0">
          <Radio className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
          <span className="font-display text-sm font-semibold tracking-tight text-slate-900 whitespace-nowrap truncate">
            ASL {config.aslNode} Bridge
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md focus-visible:outline-2 focus-visible:outline-blue-600"
          aria-label="Close navigation menu"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Workspace Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Workspace sections">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectSection(item.id);
                onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap text-left focus-visible:outline-2 focus-visible:outline-blue-600 ${
                isActive
                  ? 'bg-slate-100 text-slate-900 font-semibold'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon
                className={`h-4 w-4 shrink-0 ${isActive ? 'text-blue-700' : 'text-slate-400'}`}
                aria-hidden="true"
              />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Quiet Bridge Reference Summary */}
      <div className="border-t border-slate-200 px-5 py-4 space-y-2 text-xs text-slate-600">
        <div className="font-medium text-slate-900">Bridge Endpoints</div>
        <div className="space-y-1.5 font-mono tabular-nums text-[12px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">AllStarLink</span>
            <span className="text-slate-900 font-medium">{config.aslNode}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">YSF Reflector</span>
            <span className="text-slate-900 font-medium">{config.ysfReflectorId}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">P25 Reflector</span>
            <span className="text-slate-900 font-medium">{config.p25ReflectorId}</span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
            <span className="text-slate-500">Callsign</span>
            <span className="text-slate-900 font-medium">{config.callsign}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Active Legs</span>
            <span className={linkedLegs === 3 ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {linkedLegs} / 3 Ready
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop persistent sidebar */}
      <aside className="hidden lg:block w-[248px] shrink-0 h-screen sticky top-0">{navContent}</aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div className="fixed inset-0 bg-slate-900/40" onClick={onCloseMobile} aria-hidden="true" />
          <div className="relative z-50 w-[264px] max-w-[82vw] h-full">{navContent}</div>
        </div>
      )}
    </>
  );
};
