import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  GitMerge,
  Layers,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import {
  IndexStats,
  InsertionStepResult,
  Interval,
  MAX_PACKAGE_ID,
  MissingRangeResult,
  formatCompactInterval,
  formatInterval,
  validatePackageId,
} from '../engine/IntervalIndex';
import { IntervalNumberLine } from './IntervalNumberLine';
import { WorkspaceSection } from './Sidebar';

interface LiveWorkbenchProps {
  stats: IndexStats;
  intervals: Interval[];
  windowIntervals: Interval[];
  windowMissing: Interval[];
  viewMode: 'query' | 'active';
  onToggleViewMode: (mode: 'query' | 'active') => Promise<void>;
  totalIntervals: number;
  intervalPage: number;
  pageSize: number;
  missingResult: MissingRangeResult | null;
  history: InsertionStepResult[];
  lastStep: InsertionStepResult | null;
  queryL: number;
  queryR: number;
  loading: boolean;
  apiError: string | null;
  activeSection: WorkspaceSection;
  onSelectSection: (section: WorkspaceSection) => void;
  onScanSingle: (id: number) => Promise<void>;
  onScanBatch: (raw: string) => Promise<void>;
  onQueryMissing: (L: number, R: number, forceQueryView?: boolean) => Promise<void>;
  onPageChange: (page: number) => Promise<void>;
  onRunDemo: (mode: 'guided' | 'bridge_demo' | 'stress_5k' | 'stress_50k') => Promise<void>;
  onReset: () => Promise<void>;
  onNotify: (tone: 'success' | 'merge' | 'warning' | 'error' | 'info', title: string, detail: string) => void;
}

type DataTab = 'intervals' | 'missing' | 'history';

export const LiveWorkbench: React.FC<LiveWorkbenchProps> = ({
  stats,
  intervals,
  windowIntervals,
  windowMissing,
  viewMode,
  onToggleViewMode,
  totalIntervals,
  intervalPage,
  pageSize,
  missingResult,
  history,
  lastStep,
  queryL,
  queryR,
  loading,
  apiError,
  activeSection,
  onSelectSection,
  onScanSingle,
  onScanBatch,
  onQueryMissing,
  onPageChange,
  onRunDemo,
  onReset,
  onNotify,
}) => {
  const [singleInput, setSingleInput] = useState('');
  const [singleError, setSingleError] = useState<string | null>(null);

  const [batchText, setBatchText] = useState('');
  const [showBatchBox, setShowBatchBox] = useState(false);

  const [lInput, setLInput] = useState(String(queryL));
  const [rInput, setRInput] = useState(String(queryR));
  const [queryError, setQueryError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DataTab>('intervals');
  const [missingPage, setMissingPage] = useState(0);
  const [copiedSummary, setCopiedSummary] = useState(false);

  React.useEffect(() => {
    setLInput(String(queryL));
    setRInput(String(queryR));
    setQueryError(null);
    setMissingPage(0);
  }, [queryL, queryR]);

  React.useEffect(() => {
    if (activeSection === 'intervals') setActiveTab('intervals');
    else if (activeSection === 'missing') setActiveTab('missing');
    else if (activeSection === 'history') setActiveTab('history');
  }, [activeSection]);

  const [viewL, viewR] = useMemo(() => {
    if (viewMode === 'active' && stats.minId !== null && stats.maxId !== null) {
      return [stats.minId, Math.max(stats.minId, stats.maxId)];
    }
    return [queryL, queryR];
  }, [viewMode, stats.minId, stats.maxId, queryL, queryR]);

  const totalIntervalPages = Math.max(1, Math.ceil(totalIntervals / pageSize));

  const missingRanges = missingResult?.missingRanges ?? [];
  const MISSING_PAGE_SIZE = 20;
  const totalMissingPages = Math.max(1, Math.ceil(missingRanges.length / MISSING_PAGE_SIZE));
  const safeMissingPage = Math.min(missingPage, totalMissingPages - 1);
  const pagedMissing = useMemo(() => {
    const start = safeMissingPage * MISSING_PAGE_SIZE;
    return missingRanges.slice(start, start + MISSING_PAGE_SIZE);
  }, [missingRanges, safeMissingPage]);

  const smartExtendId = useMemo(() => {
    if (intervals.length === 0) return 100;
    return Math.min(MAX_PACKAGE_ID, intervals[0].end + 1);
  }, [intervals]);

  const smartBridgeId = useMemo(() => {
    for (let i = 0; i < intervals.length - 1; i++) {
      if (intervals[i].end + 2 === intervals[i + 1].start) {
        return intervals[i].end + 1;
      }
    }
    return null;
  }, [intervals]);

  const smartDuplicateId = useMemo(() => {
    return intervals.length > 0 ? intervals[0].start : null;
  }, [intervals]);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePackageId(singleInput);
    if (!check.ok) {
      setSingleError(check.error);
      return;
    }
    setSingleError(null);
    await onScanSingle(check.value);
    setSingleInput('');
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchText.trim()) return;
    await onScanBatch(batchText);
    setBatchText('');
  };

  const handleQuerySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const checkL = validatePackageId(lInput);
    const checkR = validatePackageId(rInput);
    if (!checkL.ok) {
      setQueryError(`Lower bound L: ${checkL.error}`);
      return;
    }
    if (!checkR.ok) {
      setQueryError(`Upper bound R: ${checkR.error}`);
      return;
    }
    if (checkL.value > checkR.value) {
      setQueryError('Lower bound L must be less than or equal to upper bound R.');
      return;
    }
    setQueryError(null);
    await onQueryMissing(checkL.value, checkR.value);
    setActiveTab('missing');
    onSelectSection('missing');
  };

  const handleExportMissingJson = () => {
    if (!missingResult) return;
    const payload = {
      queryBounds: { L: missingResult.queryL, R: missingResult.queryR },
      missingCount: missingResult.missingCount,
      presentCount: missingResult.presentCount,
      totalMissingRanges: missingResult.totalMissingRanges,
      missingRanges: missingResult.missingRanges.map((r) => formatCompactInterval(r)),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `missing-ranges-${missingResult.queryL}-${missingResult.queryR}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(
      'info',
      'Missing Report Exported',
      `Downloaded JSON report for [${missingResult.queryL.toLocaleString('en-US')}, ${missingResult.queryR.toLocaleString('en-US')}].`
    );
  };

  const handleCopySummary = async () => {
    if (!missingResult) return;
    const preview = missingResult.missingRanges
      .slice(0, 40)
      .map((r) => formatCompactInterval(r))
      .join(', ');
    const text = `Query [${missingResult.queryL}, ${missingResult.queryR}]: ${missingResult.missingCount.toLocaleString('en-US')} missing across ${missingResult.totalMissingRanges.toLocaleString('en-US')} range(s) -> ${preview || 'None'}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 1800);
      onNotify('info', 'Copied to Clipboard', 'Missing-range summary copied.');
    } catch {
      onNotify('warning', 'Clipboard Unavailable', 'Unable to access clipboard in this browser context.');
    }
  };

  const coveragePct =
    missingResult && missingResult.queryR >= missingResult.queryL
      ? (
          (missingResult.presentCount / (missingResult.queryR - missingResult.queryL + 1)) *
          100
        ).toFixed(2)
      : '0.00';

  const switchTab = (tab: DataTab) => {
    setActiveTab(tab);
    onSelectSection(tab);
  };

  return (
    <div className="space-y-6">
      {apiError && (
        <div
          role="alert"
          className="px-4 py-3 bg-red-950/60 border border-red-500/40 rounded-xl flex items-center gap-2.5 text-xs text-red-200"
        >
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{apiError}</span>
        </div>
      )}

      {/* Animated Live Arrival Indicator Bar */}
      <AnimatePresence mode="wait">
        {lastStep ? (
          <motion.div
            key={`arrival-${lastStep.timestamp}-${lastStep.id}`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="bg-[#0C1526] border border-[#1B2A44] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    lastStep.caseId === 'DUPLICATE' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                    lastStep.caseId === 'DUPLICATE' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
              </span>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold text-slate-100">Latest Arrival</span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-semibold text-emerald-300">
                    ID {lastStep.id.toLocaleString('en-US')}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span
                    className={`font-semibold ${
                      lastStep.caseId === 'DUPLICATE'
                        ? 'text-amber-300'
                        : lastStep.caseId === 'BRIDGE_MERGE'
                        ? 'text-emerald-300'
                        : 'text-sky-300'
                    }`}
                  >
                    {lastStep.caseLabel}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 truncate max-w-2xl">
                  {lastStep.explanation}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-mono tabular-nums shrink-0">
              <span className="text-slate-300">
                Interval [{lastStep.resultingInterval.start.toLocaleString('en-US')},{' '}
                {lastStep.resultingInterval.end.toLocaleString('en-US')}]
              </span>
              <span
                className={
                  lastStep.intervalDelta < 0
                    ? 'text-emerald-400 font-semibold'
                    : lastStep.intervalDelta > 0
                    ? 'text-sky-300'
                    : 'text-slate-400'
                }
              >
                {lastStep.intervalDelta > 0
                  ? `+${lastStep.intervalDelta} interval`
                  : lastStep.intervalDelta < 0
                  ? `${lastStep.intervalDelta} interval`
                  : '0 delta'}
              </span>
            </div>
          </motion.div>
        ) : (
          <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>Arrival stream idle — scan a package ID or load a demonstration batch to begin monitoring.</span>
            <button
              type="button"
              onClick={() => onRunDemo('guided')}
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Start Guided Demo
            </button>
          </div>
        )}
      </AnimatePresence>

      {/* 5-Column Enterprise Warehouse Statistics Cards */}
      <section
        id="overview"
        aria-label="Warehouse statistics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Unique Packages</span>
            <Layers className="w-3.5 h-3.5 text-slate-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
              {stats.uniqueCount.toLocaleString('en-US')}
            </span>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              / {stats.capacityLimit.toLocaleString('en-US')}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400 font-mono tabular-nums">
            Max ID bound: {stats.maxPackageId.toLocaleString('en-US')}
          </p>
        </div>

        <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Sorted Intervals</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-emerald-400 font-mono tabular-nums">
              {stats.intervalCount.toLocaleString('en-US')}
            </span>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              height {stats.treeHeight}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Disjoint closed intervals
          </p>
        </div>

        <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Duplicates Ignored</span>
            <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
              {stats.duplicateCount.toLocaleString('en-US')}
            </span>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {stats.totalScans.toLocaleString('en-US')} scans
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Rejected in O(log K)
          </p>
        </div>

        <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Bridge Merges</span>
            <GitMerge className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-emerald-400 font-mono tabular-nums">
              {stats.bridgeMergeCount.toLocaleString('en-US')}
            </span>
            <span className="text-xs text-slate-400">joins</span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Adjacent ranges collapsed
          </p>
        </div>

        <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-4 sm:p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-medium">Compression Ratio</span>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold text-slate-100 font-mono tabular-nums">
              {stats.compressionRatio.toFixed(1)}x
            </span>
            <span className="text-xs text-slate-400">IDs/node</span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">
            Memory saved vs raw array
          </p>
        </div>
      </section>

      {/* Main Two-Zone Warehouse Monitor */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Stage (8 cols) */}
        <div className="xl:col-span-8 space-y-6">
          <IntervalNumberLine
            intervals={windowIntervals}
            missingRanges={windowMissing}
            lastStep={lastStep}
            viewL={viewL}
            viewR={viewR}
            totalIntervalCount={totalIntervals}
            viewMode={viewMode}
            onToggleViewMode={onToggleViewMode}
            onQuickInsert={onScanSingle}
            onZoomBounds={async (L, R) => {
              await onQueryMissing(L, R, true);
            }}
          />

          {/* Data Inspection Tabs */}
          <div id="ledger" className="bg-[#0C1526] border border-[#1B2A44] rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-3.5 border-b border-[#1B2A44]">
              <div className="flex items-center gap-1 p-1 bg-[#070D19] border border-[#1B2A44] rounded-lg overflow-x-auto">
                <button
                  type="button"
                  onClick={() => switchTab('intervals')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'intervals'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  Live Sorted Intervals ({totalIntervals.toLocaleString('en-US')})
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('missing')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'missing'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  Missing Ranges ({missingResult?.totalMissingRanges.toLocaleString('en-US') ?? 0})
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('history')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === 'history'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-100'
                  }`}
                >
                  Arrival History ({history.length})
                </button>
              </div>

              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                Active Range:{' '}
                {stats.minId !== null && stats.maxId !== null
                  ? `[${stats.minId.toLocaleString('en-US')} .. ${stats.maxId.toLocaleString('en-US')}]`
                  : 'Empty'}
              </span>
            </div>

            {/* TAB 1: Live Sorted Intervals */}
            {activeTab === 'intervals' && (
              <div>
                {totalIntervals === 0 ? (
                  <div className="p-10 text-center">
                    <Layers className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-200">
                      No arrival intervals recorded
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Enter a package ID in the scanner deck or start Guided Demo to populate sorted non-overlapping intervals.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onRunDemo('guided')}
                        className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer"
                      >
                        Run Guided Demo
                      </button>
                      <button
                        type="button"
                        onClick={() => onScanSingle(100)}
                        className="px-4 py-2 text-xs font-medium text-slate-200 bg-[#070D19] border border-[#1B2A44] hover:bg-[#132038] rounded-lg transition-colors cursor-pointer"
                      >
                        Scan ID 100
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#1B2A44] bg-[#091224] text-[11px] font-semibold text-slate-400">
                            <th className="py-2.5 px-5">#</th>
                            <th className="py-2.5 px-4">Interval [Start, End]</th>
                            <th className="py-2.5 px-4 text-right">Consecutive IDs</th>
                            <th className="py-2.5 px-4 text-right">Gap to Next</th>
                            <th className="py-2.5 px-5 text-right">Extend Right</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#152238] text-xs">
                          {intervals.map((iv, idx) => {
                            const rank = intervalPage * pageSize + idx + 1;
                            const nextIv = intervals[idx + 1];
                            const gapAfter = nextIv ? nextIv.start - iv.end - 1 : null;
                            const len = iv.end - iv.start + 1;
                            const canExtend = iv.end < MAX_PACKAGE_ID;
                            const isUpdated =
                              lastStep?.resultingInterval.start === iv.start &&
                              lastStep?.resultingInterval.end === iv.end;

                            return (
                              <tr
                                key={`${iv.start}-${iv.end}`}
                                className={`transition-colors ${
                                  isUpdated
                                    ? 'bg-emerald-950/25 hover:bg-emerald-950/35'
                                    : 'hover:bg-[#111E36]'
                                }`}
                              >
                                <td className="py-2.5 px-5 font-mono tabular-nums text-slate-500">
                                  {rank}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-emerald-300">
                                  [{iv.start.toLocaleString('en-US')}, {iv.end.toLocaleString('en-US')}]
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                                  {len.toLocaleString('en-US')}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-400">
                                  {gapAfter !== null ? `${gapAfter.toLocaleString('en-US')} missing` : '—'}
                                </td>
                                <td className="py-2.5 px-5 text-right">
                                  {canExtend && (
                                    <button
                                      type="button"
                                      onClick={() => onScanSingle(iv.end + 1)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/30 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                                    >
                                      <Plus className="w-3 h-3" />
                                      Scan {(iv.end + 1).toLocaleString('en-US')}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-5 py-3 border-t border-[#1B2A44] flex items-center justify-between text-xs text-slate-400 bg-[#091224]">
                      <span className="font-mono tabular-nums">
                        Showing {(intervalPage * pageSize + 1).toLocaleString('en-US')}–
                        {Math.min((intervalPage + 1) * pageSize, totalIntervals).toLocaleString('en-US')} of{' '}
                        {totalIntervals.toLocaleString('en-US')} intervals
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={intervalPage === 0}
                          onClick={() => onPageChange(Math.max(0, intervalPage - 1))}
                          className="p-1.5 border border-[#1B2A44] bg-[#0C1526] rounded-md disabled:opacity-40 hover:bg-[#111E36] cursor-pointer disabled:cursor-not-allowed"
                          aria-label="Previous intervals page"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-2 font-mono tabular-nums text-slate-200">
                          {intervalPage + 1} / {totalIntervalPages}
                        </span>
                        <button
                          type="button"
                          disabled={intervalPage >= totalIntervalPages - 1}
                          onClick={() => onPageChange(Math.min(totalIntervalPages - 1, intervalPage + 1))}
                          className="p-1.5 border border-[#1B2A44] bg-[#0C1526] rounded-md disabled:opacity-40 hover:bg-[#111E36] cursor-pointer disabled:cursor-not-allowed"
                          aria-label="Next intervals page"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB 2: Bounded Missing Ranges */}
            {activeTab === 'missing' && (
              <div>
                <div className="px-5 py-3.5 bg-[#091224] border-b border-[#1B2A44] flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                    <span>
                      Missing IDs:{' '}
                      <strong className="font-mono tabular-nums text-amber-400">
                        {(missingResult?.missingCount ?? 0).toLocaleString('en-US')}
                      </strong>
                    </span>
                    <span className="text-slate-600" aria-hidden="true">|</span>
                    <span>
                      Coverage:{' '}
                      <strong className="font-mono tabular-nums text-emerald-400">
                        {coveragePct}%
                      </strong>
                    </span>
                    <span className="text-slate-600" aria-hidden="true">|</span>
                    <span className="font-mono tabular-nums text-slate-400">
                      {(missingResult?.elapsedMs ?? 0).toFixed(3)} ms ({missingResult?.scannedIntervals ?? 0} intervals scanned)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopySummary}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#0C1526] border border-[#1B2A44] hover:bg-[#111E36] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedSummary ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      type="button"
                      onClick={handleExportMissingJson}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-200 bg-[#0C1526] border border-[#1B2A44] hover:bg-[#111E36] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export JSON
                    </button>
                  </div>
                </div>

                {missingRanges.length === 0 ? (
                  <div className="p-10 text-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2.5" />
                    <p className="text-sm font-medium text-slate-100">
                      Zero missing packages in [{queryL.toLocaleString('en-US')}, {queryR.toLocaleString('en-US')}]
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Every integer ID inside the queried bounds is present and merged.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-[#1B2A44] bg-[#091224] text-[11px] font-semibold text-slate-400">
                            <th className="py-2.5 px-5">#</th>
                            <th className="py-2.5 px-4">Missing Range</th>
                            <th className="py-2.5 px-4 text-right">Missing Count</th>
                            <th className="py-2.5 px-5 text-right">Fill Gap</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#152238] text-xs">
                          {pagedMissing.map((gap, idx) => {
                            const rank = safeMissingPage * MISSING_PAGE_SIZE + idx + 1;
                            const count = gap.end - gap.start + 1;
                            return (
                              <tr key={`${gap.start}-${gap.end}`} className="hover:bg-[#111E36] transition-colors">
                                <td className="py-2.5 px-5 font-mono tabular-nums text-slate-500">
                                  {rank}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-amber-300">
                                  {formatInterval(gap)}
                                </td>
                                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                                  {count.toLocaleString('en-US')}
                                </td>
                                <td className="py-2.5 px-5 text-right">
                                  <button
                                    type="button"
                                    onClick={() => onScanSingle(gap.start)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/15 border border-emerald-500/30 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                                  >
                                    <Plus className="w-3 h-3" />
                                    Scan {gap.start.toLocaleString('en-US')}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {totalMissingPages > 1 && (
                      <div className="px-5 py-3 border-t border-[#1B2A44] flex items-center justify-between text-xs text-slate-400 bg-[#091224]">
                        <span className="font-mono tabular-nums">
                          Page {safeMissingPage + 1} of {totalMissingPages} ({missingRanges.length.toLocaleString('en-US')} ranges returned)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={safeMissingPage === 0}
                            onClick={() => setMissingPage((p) => Math.max(0, p - 1))}
                            className="p-1.5 border border-[#1B2A44] bg-[#0C1526] rounded-md disabled:opacity-40 hover:bg-[#111E36] cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Previous missing ranges page"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={safeMissingPage >= totalMissingPages - 1}
                            onClick={() => setMissingPage((p) => Math.min(totalMissingPages - 1, p + 1))}
                            className="p-1.5 border border-[#1B2A44] bg-[#0C1526] rounded-md disabled:opacity-40 hover:bg-[#111E36] cursor-pointer disabled:cursor-not-allowed"
                            aria-label="Next missing ranges page"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* TAB 3: Arrival History Table */}
            {activeTab === 'history' && (
              <div>
                {history.length === 0 ? (
                  <div className="p-10 text-center">
                    <Clock className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-200">
                      No arrival history recorded yet
                    </p>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Every scanned package ID, duplicate detection, and bridge merge event is logged here with timestamps.
                    </p>
                    <button
                      type="button"
                      onClick={() => onRunDemo('guided')}
                      className="mt-4 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer"
                    >
                      Run Guided Demo
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#091224] border-b border-[#1B2A44] text-[11px] font-semibold text-slate-400">
                        <tr>
                          <th className="py-2.5 px-5">Time (UTC)</th>
                          <th className="py-2.5 px-4">Package ID</th>
                          <th className="py-2.5 px-4">Classification</th>
                          <th className="py-2.5 px-4">Resulting Interval</th>
                          <th className="py-2.5 px-5 text-right">Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#152238] text-xs">
                        {history.map((ev, i) => {
                          const timeLabel = ev.timestamp
                            ? ev.timestamp.slice(11, 19)
                            : '—';
                          return (
                            <tr key={`${ev.id}-${ev.timestamp}-${i}`} className="hover:bg-[#111E36]">
                              <td className="py-2.5 px-5 font-mono tabular-nums text-slate-500">
                                {timeLabel}
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums font-medium text-slate-100">
                                {ev.id.toLocaleString('en-US')}
                              </td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={`font-medium ${
                                    ev.caseId === 'DUPLICATE'
                                      ? 'text-amber-400'
                                      : ev.caseId === 'BRIDGE_MERGE'
                                      ? 'text-emerald-400'
                                      : 'text-sky-300'
                                  }`}
                                >
                                  {ev.caseLabel}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300">
                                [{ev.resultingInterval.start.toLocaleString('en-US')},{' '}
                                {ev.resultingInterval.end.toLocaleString('en-US')}]
                              </td>
                              <td className="py-2.5 px-5 text-right font-mono tabular-nums text-slate-400">
                                {ev.intervalDelta > 0
                                  ? `+${ev.intervalDelta}`
                                  : ev.intervalDelta < 0
                                  ? `${ev.intervalDelta}`
                                  : '0'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Control Deck (4 cols) */}
        <div className="xl:col-span-4 space-y-5">
          {/* Package ID Entry */}
          <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-100">Package ID Entry</h2>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                0 .. 1,000,000,000
              </span>
            </div>

            <form onSubmit={handleSingleSubmit} className="space-y-2.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={singleInput}
                  onChange={(e) => {
                    setSingleInput(e.target.value);
                    if (singleError) setSingleError(null);
                  }}
                  placeholder="Enter ID (e.g. 103)"
                  aria-label="Package ID"
                  className="flex-1 min-w-0 px-3 py-2 text-sm font-mono tabular-nums bg-[#070D19] text-slate-100 placeholder:text-slate-500 border border-[#1B2A44] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
                >
                  Scan ID
                </button>
              </div>
              {singleError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{singleError}</span>
                </p>
              )}
            </form>

            <div className="mt-4 pt-4 border-t border-[#1B2A44]">
              <p className="text-[11px] font-medium text-slate-400 mb-2">
                Quick Operations
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onScanSingle(smartExtendId)}
                  className="px-2.5 py-2 text-xs font-medium text-slate-200 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-left cursor-pointer truncate"
                >
                  Extend (+{smartExtendId.toLocaleString('en-US')})
                </button>
                <button
                  type="button"
                  disabled={smartBridgeId === null}
                  onClick={() => smartBridgeId !== null && onScanSingle(smartBridgeId)}
                  className="px-2.5 py-2 text-xs font-medium text-emerald-300 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed truncate"
                >
                  {smartBridgeId !== null
                    ? `Bridge (${smartBridgeId.toLocaleString('en-US')})`
                    : 'No 1-Gap Bridge'}
                </button>
                <button
                  type="button"
                  disabled={smartDuplicateId === null}
                  onClick={() => smartDuplicateId !== null && onScanSingle(smartDuplicateId)}
                  className="px-2.5 py-2 text-xs font-medium text-amber-300 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-left cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed truncate"
                >
                  {smartDuplicateId !== null
                    ? `Duplicate (${smartDuplicateId.toLocaleString('en-US')})`
                    : 'No Duplicate Yet'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onScanSingle(Math.floor(Math.random() * (MAX_PACKAGE_ID + 1)))
                  }
                  className="px-2.5 py-2 text-xs font-medium text-slate-200 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-left cursor-pointer truncate"
                >
                  Random 1B ID
                </button>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchBox((v) => !v)}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#111E36] hover:bg-[#172846] border border-[#1B2A44] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  {showBatchBox ? 'Hide Batch Input' : 'Batch Paste IDs'}
                </button>
                <button
                  type="button"
                  onClick={onReset}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-500/30 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

            {showBatchBox && (
              <form onSubmit={handleBatchSubmit} className="mt-4 pt-4 border-t border-[#1B2A44] space-y-2">
                <label className="block text-xs font-medium text-slate-300">
                  Batch IDs (comma, space, or newline separated)
                </label>
                <textarea
                  rows={3}
                  value={batchText}
                  onChange={(e) => setBatchText(e.target.value)}
                  placeholder="100, 101, 102, 104, 103, 999999999"
                  className="w-full px-3 py-2 text-xs font-mono bg-[#070D19] text-slate-100 placeholder:text-slate-500 border border-[#1B2A44] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-1.5 px-3 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  Submit Batch
                </button>
              </form>
            )}
          </div>

          {/* Bounded Missing-Range Finder */}
          <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="text-sm font-semibold text-slate-100">Bounded Missing-Range Finder</h2>
              <Search className="w-4 h-4 text-emerald-400" />
            </div>

            <form onSubmit={handleQuerySubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Lower Bound L
                  </label>
                  <input
                    type="text"
                    value={lInput}
                    onChange={(e) => setLInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#070D19] text-slate-100 border border-[#1B2A44] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Upper Bound R
                  </label>
                  <input
                    type="text"
                    value={rInput}
                    onChange={(e) => setRInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-[#070D19] text-slate-100 border border-[#1B2A44] rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  />
                </div>
              </div>

              {queryError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400" role="alert">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{queryError}</span>
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Find Missing Ranges in [L, R]
              </button>
            </form>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onQueryMissing(95, 130)}
                className="px-2.5 py-1 text-[11px] font-mono text-slate-300 bg-[#070D19] border border-[#1B2A44] hover:bg-[#111E36] rounded-md transition-colors cursor-pointer"
              >
                [95, 130]
              </button>
              <button
                type="button"
                disabled={stats.minId === null || stats.maxId === null}
                onClick={() =>
                  stats.minId !== null &&
                  stats.maxId !== null &&
                  onQueryMissing(stats.minId, stats.maxId)
                }
                className="px-2.5 py-1 text-[11px] font-mono text-slate-300 bg-[#070D19] border border-[#1B2A44] hover:bg-[#111E36] rounded-md transition-colors cursor-pointer disabled:opacity-40"
              >
                [Active Min, Max]
              </button>
              <button
                type="button"
                onClick={() => onQueryMissing(0, MAX_PACKAGE_ID)}
                className="px-2.5 py-1 text-[11px] font-mono text-slate-300 bg-[#070D19] border border-[#1B2A44] hover:bg-[#111E36] rounded-md transition-colors cursor-pointer"
              >
                [0, 1,000,000,000]
              </button>
            </div>
          </div>

          {/* Demonstration Mode */}
          <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">Demonstration Mode</h2>
              <GitMerge className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={() => onRunDemo('guided')}
                className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-left cursor-pointer"
              >
                Guided Demo (Merges + Duplicates + 1B ID)
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => onRunDemo('bridge_demo')}
                className="px-3 py-2 text-xs font-medium text-emerald-300 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-left cursor-pointer"
              >
                Trigger Bridge Merge Showcase
              </button>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onRunDemo('stress_5k')}
                  className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-center cursor-pointer"
                >
                  Load 5,000 IDs
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => onRunDemo('stress_50k')}
                  className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#070D19] hover:bg-[#111E36] border border-[#1B2A44] rounded-lg transition-colors text-center cursor-pointer"
                >
                  Load 50,000 IDs
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
