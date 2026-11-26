import React, { useState } from 'react';
import { CheckCircle2, Play, ShieldAlert } from 'lucide-react';
import { BenchmarkPattern, BenchmarkRunResult, runScaleBenchmark } from '../engine/benchmark';

const PATTERN_OPTIONS: { id: BenchmarkPattern; label: string; desc: string }[] = [
  {
    id: 'random_1b',
    label: 'Random Sparse (0 .. 1,000,000,000)',
    desc: 'Uniformly scattered IDs across the 1-billion namespace, producing maximum sparse range gaps.',
  },
  {
    id: 'adversarial_even_odd',
    label: 'Adversarial Even IDs (0, 2, 4, ...)',
    desc: 'Worst-case fragmentation where zero intervals ever merge (K = N = 50,000 nodes).',
  },
  {
    id: 'clustered_warehouse',
    label: 'Clustered Warehouse Docks (40 Docks)',
    desc: 'Realistic contiguous shipment runs with periodic broken number skips.',
  },
  {
    id: 'heavy_duplicates',
    label: 'Heavy Duplicate Scans',
    desc: 'Repeated scans hitting existing intervals to verify O(log K) duplicate ignore speed.',
  },
];

const VOLUME_OPTIONS = [5_000, 25_000, 50_000];

export const StressBenchmark: React.FC = () => {
  const [pattern, setPattern] = useState<BenchmarkPattern>('random_1b');
  const [count, setCount] = useState<number>(50_000);
  const [runs, setRuns] = useState<BenchmarkRunResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const handleRun = () => {
    setIsRunning(true);
    // Defer slightly so button state paints before synchronous benchmark
    setTimeout(() => {
      const res = runScaleBenchmark(pattern, count);
      setRuns((prev) => [res, ...prev].slice(0, 8));
      setIsRunning(false);
    }, 16);
  };

  const latest = runs[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              50,000-ID Scale & Invariant Benchmark
            </h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Executes the live AVL IntervalIndex in-browser up to 50,000 operations across 0..1,000,000,000,
              then runs a full [0, 1B] missing-range query and verifies sorted, disjoint, non-adjacent invariants.
            </p>
          </div>

          <button
            type="button"
            disabled={isRunning}
            onClick={handleRun}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            {isRunning ? 'Running Benchmark...' : `Run ${count.toLocaleString('en-US')} ID Benchmark`}
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          <div className="lg:col-span-8 space-y-3">
            <p className="text-xs font-semibold text-slate-500">Workload Pattern</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PATTERN_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPattern(opt.id)}
                  className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                    pattern === opt.id
                      ? 'border-sky-600 bg-sky-50/40'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-900">{opt.label}</p>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500">Arrival Volume</p>
            <div className="space-y-2">
              {VOLUME_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setCount(v)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-xs transition-colors cursor-pointer ${
                    count === v
                      ? 'border-sky-600 bg-sky-50/40 text-slate-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <span className="font-mono tabular-nums">{v.toLocaleString('en-US')} scans</span>
                  <span className="text-[11px] text-slate-500">
                    {v === 50_000 ? 'Full target load' : 'Quick check'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Latest Run Telemetry */}
      {latest && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              {latest.invariantsVerified ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700">All Structural Invariants Verified</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span className="text-red-700">Invariant Failure</span>
                </>
              )}
              <span className="text-slate-400 font-normal" aria-hidden="true">·</span>
              <span className="text-slate-600 font-normal">{latest.invariantNote}</span>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {latest.opsPerSecond.toLocaleString('en-US')} inserts/sec
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x divide-slate-200">
            <div className="p-4">
              <p className="text-[11px] text-slate-500">Insert Time</p>
              <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                {latest.insertElapsedMs.toFixed(1)} ms
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500">[0, 1B] Query Time</p>
              <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-sky-700">
                {latest.queryElapsedMs.toFixed(2)} ms
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500">Unique IDs</p>
              <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                {latest.uniqueCount.toLocaleString('en-US')}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500">Disjoint Intervals</p>
              <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                {latest.intervalCount.toLocaleString('en-US')}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500">AVL Height</p>
              <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                {latest.treeHeight}
              </p>
            </div>
            <div className="p-4">
              <p className="text-[11px] text-slate-500">Missing Ranges</p>
              <p className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                {latest.missingRangesInFullSpan.toLocaleString('en-US')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Run History Table */}
      {runs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-3.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-900">Benchmark Run History</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-5">Pattern</th>
                  <th className="py-2.5 px-4 text-right">Ops</th>
                  <th className="py-2.5 px-4 text-right">Unique</th>
                  <th className="py-2.5 px-4 text-right">Intervals (K)</th>
                  <th className="py-2.5 px-4 text-right">AVL Height</th>
                  <th className="py-2.5 px-4 text-right">Insert (ms)</th>
                  <th className="py-2.5 px-5 text-right">Query [0,1B] (ms)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {runs.map((r, i) => (
                  <tr key={i} className="hover:bg-slate-50/80">
                    <td className="py-2.5 px-5 font-sans font-medium text-slate-900">
                      {PATTERN_OPTIONS.find((p) => p.id === r.pattern)?.label}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">
                      {r.targetOps.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">
                      {r.uniqueCount.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">
                      {r.intervalCount.toLocaleString('en-US')}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-700">{r.treeHeight}</td>
                    <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                      {r.insertElapsedMs.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-5 text-right font-semibold text-sky-700">
                      {r.queryElapsedMs.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
