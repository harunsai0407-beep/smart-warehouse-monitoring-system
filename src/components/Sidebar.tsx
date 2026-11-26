import React from 'react';
import {
  Activity,
  BarChart3,
  Clock,
  GitMerge,
  Layers,
  Play,
  RotateCcw,
  Search,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { IndexStats } from '../engine/IntervalIndex';

export type WorkspaceSection = 'overview' | 'intervals' | 'missing' | 'history';

interface SidebarProps {
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  stats: IndexStats;
  loading: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onRunDemo: (mode: 'guided' | 'bridge_demo' | 'stress_5k' | 'stress_50k') => Promise<void>;
  onReset: () => Promise<void>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  stats,
  loading,
  mobileOpen,
  onCloseMobile,
  onRunDemo,
  onReset,
}) => {
  const capacityPct = Math.min(
    100,
    Math.round((stats.uniqueCount / Math.max(1, stats.capacityLimit)) * 100)
  );

  const navItems: { id: WorkspaceSection; label: string; icon: React.ReactNode; count?: number }[] = [
    {
      id: 'overview',
      label: 'Operations Overview',
      icon: <BarChart3 className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'intervals',
      label: 'Sorted Intervals',
      icon: <Layers className="w-4 h-4 shrink-0" />,
      count: stats.intervalCount,
    },
    {
      id: 'missing',
      label: 'Missing-Range Finder',
      icon: <Search className="w-4 h-4 shrink-0" />,
    },
    {
      id: 'history',
      label: 'Arrival History',
      icon: <Clock className="w-4 h-4 shrink-0" />,
      count: stats.totalScans,
    },
  ];

  const handleNavClick = (id: WorkspaceSection) => {
    onSelectSection(id);
    onCloseMobile();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#091224] border-r border-[#1B2A44] text-slate-200 select-none">
      {/* Brand Lockup */}
      <div className="h-16 px-5 border-b border-[#1B2A44] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => handleNavClick('overview')}
          className="text-left cursor-pointer"
        >
          <span className="block text-sm font-display font-bold tracking-wide text-slate-100 whitespace-nowrap">
            LIVE ARRIVAL INDEX
          </span>
          <span className="block text-[11px] text-emerald-400 font-medium whitespace-nowrap">
            Smart Warehouse Monitor
          </span>
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-400 hover:text-slate-100 rounded-lg cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Primary Workspace Navigation */}
      <div className="px-3 py-4 flex-1 overflow-y-auto space-y-6">
        <div>
          <p className="px-3 text-[11px] font-semibold text-slate-400 mb-2">
            Monitor Views
          </p>
          <nav className="space-y-1" aria-label="Sidebar navigation">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-300 hover:bg-[#111E36] hover:text-slate-100 border border-transparent'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <span className={active ? 'text-emerald-400' : 'text-slate-400'}>
                      {item.icon}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.count !== undefined && (
                    <span className="font-mono tabular-nums text-[11px] text-slate-400">
                      {item.count.toLocaleString('en-US')}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Demonstration & Stress Controls */}
        <div className="pt-4 border-t border-[#1B2A44]">
          <p className="px-3 text-[11px] font-semibold text-slate-400 mb-2">
            Demonstration Scenarios
          </p>
          <div className="space-y-1.5">
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                onRunDemo('guided');
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-[#111E36] rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Guided Warehouse Demo</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                onRunDemo('bridge_demo');
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-emerald-300 hover:bg-[#111E36] rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              <GitMerge className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="truncate">Trigger Bridge Merge</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                onRunDemo('stress_5k');
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#111E36] rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              <Activity className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">Load 5,000 Scans</span>
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                onRunDemo('stress_50k');
                onCloseMobile();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-[#111E36] rounded-lg transition-colors cursor-pointer disabled:opacity-50 text-left"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Load 50,000 Capacity</span>
            </button>
          </div>
        </div>

        {/* Reset Action */}
        <div className="pt-4 border-t border-[#1B2A44]">
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              onReset();
              onCloseMobile();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-500/30 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset Arrival Index</span>
          </button>
        </div>
      </div>

      {/* Real Capacity Meter (Derived Strictly From Backend Stats) */}
      <div className="p-4 border-t border-[#1B2A44] bg-[#070D19]/70 space-y-2">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400 font-medium">Shift ID Capacity</span>
          <span className="font-mono tabular-nums text-slate-200">
            {capacityPct}%
          </span>
        </div>
        <div className="h-1.5 w-full bg-[#152238] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-[width] duration-200"
            style={{ width: `${capacityPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
          <span>{stats.uniqueCount.toLocaleString('en-US')} used</span>
          <span>{stats.capacityLimit.toLocaleString('en-US')} max</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Backdrop + Panel */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/65"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
