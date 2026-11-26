import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Play, RotateCcw, Check, X } from 'lucide-react';
import { InsertionStepResult, IntervalIndex } from '../engine/IntervalIndex';
import { FOUR_INSERTION_CASES } from '../data/hackathonBlueprint';

interface GuidedScenario {
  label: string;
  sequence: number[];
  notes: string[];
}

const GUIDED_SCENARIO: GuidedScenario = {
  label: 'Broken Range Recovery Sequence',
  sequence: [100, 105, 101, 103, 101, 102, 104],
  notes: [
    'ID 100 arrives on an empty index -> Case 2: Standalone [100, 100].',
    'ID 105 arrives isolated -> Case 2: Standalone [105, 105].',
    'ID 101 touches 100.end + 1 -> Case 3a: Extend Left to [100, 101].',
    'ID 103 arrives between 101 and 105 -> Case 2: Standalone [103, 103].',
    'ID 101 arrives again -> Case 1: Duplicate ignored cleanly.',
    'ID 102 bridges [100, 101] and [103, 103] -> Case 4: Merge into [100, 103].',
    'ID 104 bridges [100, 103] and [105, 105] -> Case 4: Merge into [100, 105].',
  ],
};

export const CaseVisualizer: React.FC = () => {
  const [stepIdx, setStepIdx] = useState(0);
  const [selectedCase, setSelectedCase] = useState<number>(4);

  const history = useMemo(() => {
    const idx = new IntervalIndex();
    const snapshots: {
      step: InsertionStepResult;
      beforeIntervals: { start: number; end: number }[];
      afterIntervals: { start: number; end: number }[];
      note: string;
    }[] = [];

    GUIDED_SCENARIO.sequence.forEach((id, i) => {
      const beforeIntervals = idx.getAllIntervals();
      const step = idx.insert(id);
      const afterIntervals = idx.getAllIntervals();
      snapshots.push({
        step,
        beforeIntervals,
        afterIntervals,
        note: GUIDED_SCENARIO.notes[i],
      });
    });

    return snapshots;
  }, []);

  const current = history[stepIdx];
  const touchLeft =
    current.step.prevBefore !== null && current.step.prevBefore.end + 1 === current.step.id;
  const touchRight =
    current.step.nextBefore !== null && current.step.id + 1 === current.step.nextBefore.start;
  const isDuplicate =
    current.step.prevBefore !== null && current.step.id <= current.step.prevBefore.end;

  return (
    <div className="space-y-6">
      {/* Interactive Step-Through Simulator */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Interactive 4-Case Step Simulator
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Step through how <code className="font-mono text-slate-700">insert(id)</code> inspects only{' '}
              <code className="font-mono text-slate-700">prev = floor(id)</code> and{' '}
              <code className="font-mono text-slate-700">next = ceil(id)</code> in O(log K) time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStepIdx(0)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
            <button
              type="button"
              disabled={stepIdx === 0}
              onClick={() => setStepIdx((s) => Math.max(0, s - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              type="button"
              disabled={stepIdx >= history.length - 1}
              onClick={() => setStepIdx((s) => Math.min(history.length - 1, s + 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Next Step
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Sequence Timeline Strip */}
        <div className="py-4 flex flex-wrap items-center gap-2 border-b border-slate-100">
          <span className="text-xs font-medium text-slate-500 mr-2">Arrival Sequence:</span>
          {GUIDED_SCENARIO.sequence.map((id, i) => (
            <button
              key={`${id}-${i}`}
              type="button"
              onClick={() => setStepIdx(i)}
              className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-lg border transition-colors cursor-pointer ${
                i === stepIdx
                  ? 'bg-slate-900 text-white border-slate-900'
                  : i < stepIdx
                  ? 'bg-sky-50 text-sky-800 border-sky-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              #{i + 1}: {id}
            </button>
          ))}
        </div>

        {/* Step Evaluation Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-5">
          {/* Left: Neighbor Pointers & Boolean Checks */}
          <div className="lg:col-span-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">
                Step {stepIdx + 1} of {history.length}
              </span>
              <span className="text-xs font-semibold text-sky-700">
                {current.step.caseLabel}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[11px] font-medium text-slate-500">prev = floor(id)</p>
                <p className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                  {current.step.prevBefore
                    ? `[${current.step.prevBefore.start}, ${current.step.prevBefore.end}]`
                    : 'null'}
                </p>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <p className="text-[11px] font-medium text-sky-700">Incoming ID</p>
                <p className="mt-1 text-sm font-mono tabular-nums font-bold text-sky-900">
                  {current.step.id}
                </p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[11px] font-medium text-slate-500">next = ceil(id)</p>
                <p className="mt-1 text-sm font-mono tabular-nums font-semibold text-slate-900">
                  {current.step.nextBefore
                    ? `[${current.step.nextBefore.start}, ${current.step.nextBefore.end}]`
                    : 'null'}
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <code className="font-mono text-slate-700">prev !== null && id &lt;= prev.end</code>
                <span className={`inline-flex items-center gap-1 font-medium ${isDuplicate ? 'text-amber-700' : 'text-slate-400'}`}>
                  {isDuplicate ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  {isDuplicate ? 'True (Duplicate)' : 'False'}
                </span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <code className="font-mono text-slate-700">prev !== null && prev.end + 1 === id</code>
                <span className={`inline-flex items-center gap-1 font-medium ${touchLeft ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {touchLeft ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  {touchLeft ? 'True (Touch Left)' : 'False'}
                </span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <code className="font-mono text-slate-700">next !== null && id + 1 === next.start</code>
                <span className={`inline-flex items-center gap-1 font-medium ${touchRight ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {touchRight ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                  {touchRight ? 'True (Touch Right)' : 'False'}
                </span>
              </div>
            </div>
          </div>

          {/* Right: Before / After State */}
          <div className="lg:col-span-6 space-y-4">
            <p className="text-xs font-semibold text-slate-500">State Transition</p>

            <div className="space-y-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-[11px] font-medium text-slate-500 mb-2">Before Insertion</p>
                <div className="flex flex-wrap gap-2 font-mono text-xs tabular-nums">
                  {current.beforeIntervals.length === 0 ? (
                    <span className="text-slate-400">[] (Empty Index)</span>
                  ) : (
                    current.beforeIntervals.map((iv) => (
                      <span
                        key={`b-${iv.start}`}
                        className="px-2.5 py-1 bg-white border border-slate-200 rounded-md text-slate-700"
                      >
                        [{iv.start}, {iv.end}]
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 bg-sky-50/50 border border-sky-200 rounded-lg">
                <p className="text-[11px] font-medium text-sky-700 mb-2">After Insertion</p>
                <div className="flex flex-wrap gap-2 font-mono text-xs tabular-nums">
                  {current.afterIntervals.map((iv) => {
                    const isResult =
                      iv.start === current.step.resultingInterval.start &&
                      iv.end === current.step.resultingInterval.end;
                    return (
                      <span
                        key={`a-${iv.start}`}
                        className={`px-2.5 py-1 rounded-md border font-medium ${
                          isResult
                            ? 'bg-sky-600 text-white border-sky-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        [{iv.start}, {iv.end}]
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed pt-1">
              {current.note}
            </p>
          </div>
        </div>
      </div>

      {/* Reference Matrix of the Four Canonical Insertion Cases */}
      <div className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              The Four Canonical Insertion Cases
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a case to highlight its condition, interval count delta, and state transition.
            </p>
          </div>
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {FOUR_INSERTION_CASES.map((c) => (
              <button
                key={c.caseNumber}
                type="button"
                onClick={() => setSelectedCase(c.caseNumber)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  selectedCase === c.caseNumber
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Case {c.caseNumber}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FOUR_INSERTION_CASES.map((c) => {
            const active = selectedCase === c.caseNumber;
            return (
              <button
                key={c.caseNumber}
                type="button"
                onClick={() => setSelectedCase(c.caseNumber)}
                className={`text-left p-5 rounded-xl border transition-colors cursor-pointer ${
                  active
                    ? 'border-sky-600 bg-sky-50/40'
                    : 'border-slate-200 bg-white hover:bg-slate-50/70'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">
                    {c.caseNumber}. {c.name}
                  </span>
                  <span className="text-xs font-mono tabular-nums text-slate-500">
                    {c.intervalDelta} · {c.complexity}
                  </span>
                </div>
                <p className="mt-2 text-xs font-mono text-sky-800 bg-slate-100/80 px-2.5 py-1.5 rounded-md overflow-x-auto">
                  {c.condition}
                </p>
                <p className="mt-2.5 text-xs text-slate-600 leading-relaxed">{c.action}</p>
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px] font-mono tabular-nums text-slate-500">
                  <span>{c.exampleBefore}</span>
                  <Play className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-slate-800">+{c.exampleInput}</span>
                  <Play className="w-3 h-3 text-slate-400" />
                  <span className="font-semibold text-sky-700">{c.exampleAfter}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
