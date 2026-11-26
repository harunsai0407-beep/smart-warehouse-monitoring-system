import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, GitMerge, Plus, ZoomIn } from 'lucide-react';
import { InsertionStepResult, Interval, formatInterval } from '../engine/IntervalIndex';

interface IntervalNumberLineProps {
  intervals: Interval[];
  missingRanges: Interval[];
  lastStep: InsertionStepResult | null;
  viewL: number;
  viewR: number;
  totalIntervalCount: number;
  viewMode: 'query' | 'active';
  onToggleViewMode: (mode: 'query' | 'active') => void;
  onQuickInsert: (id: number) => void;
  onZoomBounds?: (L: number, R: number) => void;
}

interface HoveredSegment {
  kind: 'present' | 'missing';
  start: number;
  end: number;
  count: number;
}

interface HeatmapBucket {
  index: number;
  start: number;
  end: number;
  capacity: number;
  coveredIds: number;
  intervalHits: number;
  densityPct: number;
  firstMissingId: number | null;
}

type CoverageSubView = 'combined' | 'line' | 'heatmap';

export const IntervalNumberLine: React.FC<IntervalNumberLineProps> = ({
  intervals,
  missingRanges,
  lastStep,
  viewL,
  viewR,
  totalIntervalCount,
  viewMode,
  onToggleViewMode,
  onQuickInsert,
  onZoomBounds,
}) => {
  const [hovered, setHovered] = useState<HoveredSegment | null>(null);
  const [subView, setSubView] = useState<CoverageSubView>('combined');
  const [selectedBucket, setSelectedBucket] = useState<HeatmapBucket | null>(null);

  const span = Math.max(1, viewR - viewL + 1);

  const renderPresent = useMemo(() => {
    const clamped = intervals
      .map((iv) => ({
        start: Math.max(viewL, iv.start),
        end: Math.min(viewR, iv.end),
      }))
      .filter((iv) => iv.end >= iv.start);

    if (clamped.length <= 240) {
      return { items: clamped, sampled: false, totalInWindow: clamped.length };
    }

    const bins = 240;
    const binSize = span / bins;
    const merged: Interval[] = [];
    const occupied = new Array<boolean>(bins).fill(false);

    for (const iv of clamped) {
      const b0 = Math.max(0, Math.min(bins - 1, Math.floor((iv.start - viewL) / binSize)));
      const b1 = Math.max(0, Math.min(bins - 1, Math.floor((iv.end - viewL) / binSize)));
      for (let b = b0; b <= b1; b++) occupied[b] = true;
    }

    let runStart = -1;
    for (let b = 0; b < bins; b++) {
      if (occupied[b] && runStart === -1) runStart = b;
      if ((!occupied[b] || b === bins - 1) && runStart !== -1) {
        const endBin = occupied[b] ? b : b - 1;
        merged.push({
          start: Math.floor(viewL + runStart * binSize),
          end: Math.min(viewR, Math.floor(viewL + (endBin + 1) * binSize - 1)),
        });
        runStart = -1;
      }
    }

    return { items: merged, sampled: true, totalInWindow: clamped.length };
  }, [intervals, viewL, viewR, span]);

  const renderMissing = useMemo(() => {
    return missingRanges.length <= 160 ? missingRanges : missingRanges.slice(0, 160);
  }, [missingRanges]);

  // Compute exact arrival density buckets across [viewL, viewR] without allocating span-sized arrays
  const heatmapData = useMemo(() => {
    const bucketCount = Math.min(48, span);
    const buckets: HeatmapBucket[] = [];
    let ivIdx = 0;

    // Advance ivIdx to first interval ending >= viewL
    while (ivIdx < intervals.length && intervals[ivIdx].end < viewL) {
      ivIdx++;
    }

    let peakBucket: HeatmapBucket | null = null;
    let activeBuckets = 0;

    for (let b = 0; b < bucketCount; b++) {
      const bStart = viewL + Math.floor((b * span) / bucketCount);
      const bEnd =
        b === bucketCount - 1
          ? viewR
          : Math.max(bStart, viewL + Math.floor(((b + 1) * span) / bucketCount) - 1);
      const capacity = bEnd - bStart + 1;

      while (ivIdx < intervals.length && intervals[ivIdx].end < bStart) {
        ivIdx++;
      }

      let coveredIds = 0;
      let intervalHits = 0;
      let cursor = bStart;
      let firstMissingId: number | null = null;

      let j = ivIdx;
      while (j < intervals.length && intervals[j].start <= bEnd) {
        const iv = intervals[j];
        const ovStart = Math.max(bStart, iv.start);
        const ovEnd = Math.min(bEnd, iv.end);
        if (ovEnd >= ovStart) {
          coveredIds += ovEnd - ovStart + 1;
          intervalHits += 1;
          if (firstMissingId === null && ovStart > cursor) {
            firstMissingId = cursor;
          }
          if (ovEnd + 1 > cursor) {
            cursor = ovEnd + 1;
          }
        }
        if (iv.end <= bEnd) {
          j++;
        } else {
          break;
        }
      }

      if (firstMissingId === null && cursor <= bEnd) {
        firstMissingId = cursor;
      }

      const densityPct = Math.min(100, (coveredIds / capacity) * 100);
      if (coveredIds > 0) activeBuckets += 1;

      const bucket: HeatmapBucket = {
        index: b,
        start: bStart,
        end: bEnd,
        capacity,
        coveredIds,
        intervalHits,
        densityPct,
        firstMissingId,
      };
      if (!peakBucket || bucket.densityPct > peakBucket.densityPct || (bucket.densityPct === peakBucket.densityPct && bucket.coveredIds > peakBucket.coveredIds)) {
        peakBucket = bucket;
      }
      buckets.push(bucket);
    }

    return { buckets, peakBucket, activeBuckets };
  }, [intervals, viewL, viewR, span]);

  const ticks = useMemo(() => {
    const count = 5;
    return Array.from({ length: count + 1 }, (_, i) => {
      const value = Math.round(viewL + ((viewR - viewL) * i) / count);
      const pct = (i / count) * 100;
      return { value, pct };
    });
  }, [viewL, viewR]);

  const toPct = (val: number) => ((val - viewL) / span) * 100;
  const toWidthPct = (start: number, end: number) => Math.max(0.45, ((end - start + 1) / span) * 100);

  const showBridgeAnimation =
    lastStep?.caseId === 'BRIDGE_MERGE' &&
    lastStep.prevBefore !== null &&
    lastStep.nextBefore !== null;

  const visibleChips = useMemo(() => intervals.slice(0, 10), [intervals]);

  const getHeatCellClass = (pct: number) => {
    if (pct <= 0) return 'bg-[#070D19] border-[#1B2A44] hover:border-amber-500/60';
    if (pct < 25) return 'bg-emerald-950/80 border-emerald-800/70 hover:border-emerald-400';
    if (pct < 60) return 'bg-emerald-800/75 border-emerald-600/70 hover:border-emerald-300';
    if (pct < 100) return 'bg-emerald-600/85 border-emerald-400/80 hover:border-emerald-200';
    return 'bg-emerald-400 border-emerald-200 hover:border-white';
  };

  const activeInspectorBucket = selectedBucket ?? heatmapData.peakBucket;

  return (
    <div className="bg-[#0C1526] border border-[#1B2A44] rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100">
            Visual Interval &amp; Density Coverage
          </h2>
          <p className="text-xs text-slate-400 font-mono tabular-nums mt-0.5">
            Window [{viewL.toLocaleString('en-US')} .. {viewR.toLocaleString('en-US')}]
            <span className="mx-1.5" aria-hidden="true">·</span>
            Span {span.toLocaleString('en-US')} IDs
            {renderPresent.sampled && (
              <>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>Density-bucketed ({renderPresent.totalInWindow.toLocaleString('en-US')} intervals)</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Sub-view Switcher: Combined / Number Line / Density Heatmap */}
          <div className="flex items-center gap-1 p-1 bg-[#070D19] border border-[#1B2A44] rounded-lg">
            <button
              type="button"
              onClick={() => setSubView('combined')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'combined'
                  ? 'bg-[#162744] text-emerald-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Combined
            </button>
            <button
              type="button"
              onClick={() => setSubView('line')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'line'
                  ? 'bg-[#162744] text-emerald-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Number Line
            </button>
            <button
              type="button"
              onClick={() => setSubView('heatmap')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subView === 'heatmap'
                  ? 'bg-[#162744] text-emerald-300'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Density Heatmap
            </button>
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#070D19] border border-[#1B2A44] rounded-lg">
            <button
              type="button"
              onClick={() => onToggleViewMode('query')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'query'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Query [L, R]
            </button>
            <button
              type="button"
              onClick={() => onToggleViewMode('active')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                viewMode === 'active'
                  ? 'bg-emerald-600 text-white'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              Active Span
            </button>
          </div>
        </div>
      </div>

      {/* Bridge Merge Animation Strip */}
      <AnimatePresence mode="wait">
        {showBridgeAnimation && lastStep && (
          <motion.div
            key={`bridge-${lastStep.timestamp}-${lastStep.id}`}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="mb-4 p-3.5 bg-emerald-950/35 border border-emerald-500/40 rounded-xl"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300 mb-2">
              <GitMerge className="w-4 h-4 shrink-0" />
              <span>Bridge Merge Executed</span>
              <span className="text-slate-400 font-normal">·</span>
              <span className="font-mono text-slate-200 font-normal">
                Package {lastStep.id.toLocaleString('en-US')} joined two adjacent intervals
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-mono tabular-nums">
              <motion.span
                initial={{ x: -8, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="px-2.5 py-1 rounded-md bg-[#091224] border border-[#1B2A44] text-slate-300"
              >
                [{lastStep.prevBefore!.start.toLocaleString('en-US')},{' '}
                {lastStep.prevBefore!.end.toLocaleString('en-US')}]
              </motion.span>
              <motion.span
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="px-2 py-1 rounded-md bg-emerald-600 text-white font-semibold"
              >
                +{lastStep.id.toLocaleString('en-US')}
              </motion.span>
              <motion.span
                initial={{ x: 8, opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="px-2.5 py-1 rounded-md bg-[#091224] border border-[#1B2A44] text-slate-300"
              >
                [{lastStep.nextBefore!.start.toLocaleString('en-US')},{' '}
                {lastStep.nextBefore!.end.toLocaleString('en-US')}]
              </motion.span>
              <ArrowRight className="w-4 h-4 text-emerald-400 shrink-0" />
              <motion.span
                initial={{ scale: 0.94, opacity: 0.7 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.28 }}
                className="px-3 py-1 rounded-md bg-emerald-500/20 border border-emerald-400 text-emerald-200 font-semibold"
              >
                [{lastStep.resultingInterval.start.toLocaleString('en-US')},{' '}
                {lastStep.resultingInterval.end.toLocaleString('en-US')}]
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Number Line Section */}
      {(subView === 'combined' || subView === 'line') && (
        <div>
          <div className="flex flex-wrap items-center gap-5 text-xs text-slate-300 mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-block w-4 h-2.5 rounded-xs bg-emerald-500" aria-hidden="true" />
              <span>Received Interval (Emerald)</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-4 h-2.5 rounded-xs border border-amber-500/80 bg-amber-500/20"
                aria-hidden="true"
              />
              <span>Missing Range (Amber · Click to Scan)</span>
            </div>
            <div className="ml-auto text-slate-400 font-mono tabular-nums">
              Total intervals: {totalIntervalCount.toLocaleString('en-US')}
            </div>
          </div>

          <div className="relative select-none">
            <svg
              viewBox="0 0 1000 76"
              className="w-full h-20 overflow-visible"
              role="img"
              aria-label="Interval number line showing received intervals in green and missing gaps in amber"
            >
              <defs>
                <pattern
                  id="navyMissingHatch"
                  width="8"
                  height="8"
                  patternTransform="rotate(45 0 0)"
                  patternUnits="userSpaceOnUse"
                >
                  <rect width="8" height="8" fill="#1F160B" />
                  <line x1="0" y1="0" x2="0" y2="8" stroke="#F59E0B" strokeWidth="2" strokeOpacity="0.55" />
                </pattern>
              </defs>

              <rect
                x="0"
                y="14"
                width="1000"
                height="34"
                rx="4"
                fill="#070D19"
                stroke="#1B2A44"
                strokeWidth="1"
              />

              {renderMissing.map((gap, idx) => {
                const x = (toPct(gap.start) / 100) * 1000;
                const w = Math.max(3, (toWidthPct(gap.start, gap.end) / 100) * 1000);
                return (
                  <rect
                    key={`gap-${gap.start}-${idx}`}
                    x={x}
                    y="15"
                    width={Math.min(1000 - x, w)}
                    height="32"
                    fill="url(#navyMissingHatch)"
                    stroke="#F59E0B"
                    strokeOpacity="0.35"
                    strokeWidth="0.75"
                    className="cursor-pointer transition-opacity hover:opacity-80"
                    onMouseEnter={() =>
                      setHovered({
                        kind: 'missing',
                        start: gap.start,
                        end: gap.end,
                        count: gap.end - gap.start + 1,
                      })
                    }
                    onClick={() => onQuickInsert(gap.start)}
                  />
                );
              })}

              {renderPresent.items.map((iv, idx) => {
                const x = (toPct(iv.start) / 100) * 1000;
                const w = Math.max(4, (toWidthPct(iv.start, iv.end) / 100) * 1000);
                const isRecentlyUpdated =
                  lastStep?.accepted &&
                  iv.start <= lastStep.resultingInterval.end &&
                  iv.end >= lastStep.resultingInterval.start;

                return (
                  <rect
                    key={`iv-${iv.start}-${idx}`}
                    x={x}
                    y="14"
                    width={Math.min(1000 - x, w)}
                    height="34"
                    rx="2"
                    fill={isRecentlyUpdated ? '#34D399' : '#10B981'}
                    stroke={isRecentlyUpdated ? '#ECFDF5' : '#059669'}
                    strokeWidth={isRecentlyUpdated ? '1.5' : '0.75'}
                    className="cursor-pointer transition-opacity hover:opacity-90"
                    onMouseEnter={() =>
                      setHovered({
                        kind: 'present',
                        start: iv.start,
                        end: iv.end,
                        count: iv.end - iv.start + 1,
                      })
                    }
                  />
                );
              })}

              {ticks.map((t, idx) => {
                const x = (t.pct / 100) * 1000;
                const anchor = idx === 0 ? 'start' : idx === ticks.length - 1 ? 'end' : 'middle';
                return (
                  <g key={`tick-${idx}`} transform={`translate(${x}, 48)`}>
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#334155" strokeWidth="1" />
                    <text
                      x="0"
                      y="20"
                      textAnchor={anchor}
                      className="fill-slate-400 text-[11px] font-mono tabular-nums"
                    >
                      {t.value.toLocaleString('en-US')}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="mt-2 pt-2.5 border-t border-[#1B2A44] flex flex-wrap items-center justify-between gap-3 text-xs min-h-[30px]">
            {hovered ? (
              <>
                <div className="flex items-center gap-2.5 text-slate-300">
                  <span
                    className={`font-semibold ${
                      hovered.kind === 'present' ? 'text-emerald-400' : 'text-amber-400'
                    }`}
                  >
                    {hovered.kind === 'present' ? 'Received Interval' : 'Missing Range'}
                  </span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums font-medium text-slate-100">
                    [{formatInterval(hovered)}]
                  </span>
                  <span className="text-slate-600" aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {hovered.count.toLocaleString('en-US')} {hovered.count === 1 ? 'ID' : 'IDs'}
                  </span>
                </div>
                {hovered.kind === 'missing' && (
                  <button
                    type="button"
                    onClick={() => onQuickInsert(hovered.start)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Scan {hovered.start.toLocaleString('en-US')}
                  </button>
                )}
              </>
            ) : (
              <span className="text-slate-400">
                Hover any emerald block or amber gap to inspect exact bounds. Click any missing gap to scan its first ID.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Arrival Cluster Density Heatmap View */}
      {(subView === 'combined' || subView === 'heatmap') && (
        <div className={subView === 'combined' ? 'mt-4 pt-4 border-t border-[#1B2A44]' : ''}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-xs font-semibold text-slate-200">
                Arrival Cluster Density Heatmap
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5 font-mono tabular-nums">
                {heatmapData.buckets.length} bucket segments · {heatmapData.activeBuckets} active clusters
                {heatmapData.peakBucket && heatmapData.peakBucket.coveredIds > 0 && (
                  <>
                    <span className="mx-1.5" aria-hidden="true">·</span>
                    <span>
                      Peak [{heatmapData.peakBucket.start.toLocaleString('en-US')}–{heatmapData.peakBucket.end.toLocaleString('en-US')}] ({heatmapData.peakBucket.densityPct.toFixed(0)}%)
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* 5-step Density Legend */}
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span>0%</span>
              <span className="w-3.5 h-3.5 rounded-xs bg-[#070D19] border border-[#1B2A44]" title="0% Empty" />
              <span className="w-3.5 h-3.5 rounded-xs bg-emerald-950/80 border border-emerald-800/70" title="1–24% Sparse" />
              <span className="w-3.5 h-3.5 rounded-xs bg-emerald-800/75 border border-emerald-600/70" title="25–59% Moderate" />
              <span className="w-3.5 h-3.5 rounded-xs bg-emerald-600/85 border border-emerald-400/80" title="60–99% Dense" />
              <span className="w-3.5 h-3.5 rounded-xs bg-emerald-400 border border-emerald-200" title="100% Full Cluster" />
              <span>100%</span>
            </div>
          </div>

          {/* 12x4 / Responsive Cluster Grid */}
          <div
            className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 gap-1.5"
            role="grid"
            aria-label="Arrival interval density heatmap"
          >
            {heatmapData.buckets.map((bucket) => {
              const isSelected = selectedBucket?.index === bucket.index;
              return (
                <button
                  key={`hm-${bucket.index}-${bucket.start}`}
                  type="button"
                  onMouseEnter={() => setSelectedBucket(bucket)}
                  onFocus={() => setSelectedBucket(bucket)}
                  onClick={() => setSelectedBucket(bucket)}
                  title={`[${bucket.start.toLocaleString('en-US')} .. ${bucket.end.toLocaleString('en-US')}]: ${bucket.coveredIds.toLocaleString('en-US')} / ${bucket.capacity.toLocaleString('en-US')} (${bucket.densityPct.toFixed(1)}%)`}
                  className={`h-7 rounded-xs border transition-colors cursor-pointer relative ${getHeatCellClass(
                    bucket.densityPct
                  )} ${isSelected ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-[#0C1526]' : ''}`}
                >
                  <span className="sr-only">
                    Bucket {bucket.start} to {bucket.end}, {bucket.densityPct.toFixed(0)} percent filled
                  </span>
                </button>
              );
            })}
          </div>

          {/* Heatmap Cell Inspector */}
          {activeInspectorBucket && (
            <div className="mt-3 pt-3 border-t border-[#1B2A44] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2.5 text-slate-300">
                <span className="font-semibold text-emerald-300">
                  {selectedBucket ? 'Selected Cluster Bucket' : 'Highest-Density Bucket'}
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-100">
                  [{activeInspectorBucket.start.toLocaleString('en-US')} .. {activeInspectorBucket.end.toLocaleString('en-US')}]
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-300">
                  {activeInspectorBucket.coveredIds.toLocaleString('en-US')} / {activeInspectorBucket.capacity.toLocaleString('en-US')} IDs ({activeInspectorBucket.densityPct.toFixed(1)}%)
                </span>
                <span className="text-slate-600" aria-hidden="true">·</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {activeInspectorBucket.intervalHits} interval(s)
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {onZoomBounds && activeInspectorBucket.start <= activeInspectorBucket.end && (
                  <button
                    type="button"
                    onClick={() => onZoomBounds(activeInspectorBucket.start, activeInspectorBucket.end)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-200 bg-[#070D19] border border-[#1B2A44] hover:bg-[#111E36] rounded-md transition-colors cursor-pointer"
                  >
                    <ZoomIn className="w-3 h-3 text-emerald-400" />
                    Inspect Range
                  </button>
                )}
                {activeInspectorBucket.firstMissingId !== null && (
                  <button
                    type="button"
                    onClick={() => onQuickInsert(activeInspectorBucket.firstMissingId!)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 rounded-md transition-colors cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Scan {activeInspectorBucket.firstMissingId.toLocaleString('en-US')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Discrete Visual Received Interval Strip */}
      {visibleChips.length > 0 && (
        <div className="mt-4 pt-3 border-t border-[#1B2A44]">
          <p className="text-[11px] font-medium text-slate-400 mb-2">
            Visual Received Intervals (Active Window Preview)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {visibleChips.map((iv, idx) => {
              const nextIv = visibleChips[idx + 1];
              const gapCount = nextIv ? nextIv.start - iv.end - 1 : null;
              const isHighlighted =
                lastStep?.resultingInterval.start === iv.start &&
                lastStep?.resultingInterval.end === iv.end;

              return (
                <React.Fragment key={`chip-${iv.start}-${iv.end}`}>
                  <motion.div
                    layout
                    transition={{ duration: 0.18 }}
                    className={`px-2.5 py-1.5 rounded-md border text-xs font-mono tabular-nums ${
                      isHighlighted
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 font-semibold'
                        : 'bg-[#091224] border-emerald-500/30 text-emerald-300'
                    }`}
                  >
                    [{iv.start.toLocaleString('en-US')}, {iv.end.toLocaleString('en-US')}]
                  </motion.div>
                  {gapCount !== null && (
                    <button
                      type="button"
                      onClick={() => onQuickInsert(iv.end + 1)}
                      title={`Missing ${gapCount} IDs — click to scan ${iv.end + 1}`}
                      className="px-2 py-1 rounded-md border border-dashed border-amber-500/45 bg-amber-500/10 text-[11px] font-mono tabular-nums text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                    >
                      gap {gapCount.toLocaleString('en-US')}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
