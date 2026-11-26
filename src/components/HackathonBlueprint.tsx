import React from 'react';
import {
  ARCHITECTURE_LAYERS,
  COMPLEXITY_TABLE,
  FOUR_INSERTION_CASES,
  PROBLEM_BRIEF,
  SIX_HOUR_PLAN,
  TEAM_ROLES,
  TECH_STACK,
} from '../data/hackathonBlueprint';
import { ArrowRight } from 'lucide-react';

export const HackathonBlueprint: React.FC = () => {
  return (
    <div className="space-y-8">
      {/* 1. Problem & Proposed Solution */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <p className="text-xs font-semibold text-sky-700 mb-1">01. Problem Statement</p>
          <h2 className="text-lg font-semibold text-slate-900">{PROBLEM_BRIEF.title}</h2>
          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            {PROBLEM_BRIEF.context}
          </p>
          <ul className="mt-4 space-y-2.5 text-xs text-slate-700">
            {PROBLEM_BRIEF.whyNaiveFails.map((point, idx) => (
              <li key={idx} className="flex gap-2.5 leading-relaxed">
                <span className="font-mono font-semibold text-amber-700 shrink-0">0{idx + 1}.</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6">
          <p className="text-xs font-semibold text-emerald-700 mb-1">02. Proposed Solution & Data Structure</p>
          <h2 className="text-lg font-semibold text-slate-900">
            Balanced BST (AVL / TreeMap) of Disjoint Intervals
          </h2>
          <p className="mt-2.5 text-sm text-slate-600 leading-relaxed">
            {PROBLEM_BRIEF.proposedSolution}
          </p>
          <ul className="mt-4 space-y-2.5 text-xs text-slate-700">
            {PROBLEM_BRIEF.coreInvariants.map((inv, idx) => (
              <li key={idx} className="flex gap-2.5 leading-relaxed">
                <span className="font-mono font-semibold text-sky-700 shrink-0">INV-{idx + 1}</span>
                <span>{inv}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 2. System Architecture */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold text-sky-700 mb-1">03. System Architecture</p>
          <h2 className="text-lg font-semibold text-slate-900">
            Four-Layer Modular Pipeline
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {ARCHITECTURE_LAYERS.map((item, idx) => (
            <div key={item.layer} className="relative p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-semibold text-slate-900">{item.layer}</span>
                {idx < ARCHITECTURE_LAYERS.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-400 hidden lg:block" />
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{item.responsibility}</p>
              <p className="mt-3 pt-2.5 border-t border-slate-200 text-[11px] font-mono text-sky-700">
                {item.module}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Four Insertion Cases Summary */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <p className="text-xs font-semibold text-sky-700 mb-1">04. Core Algorithm</p>
          <h2 className="text-lg font-semibold text-slate-900">
            Four Insertion Cases (floor & ceil Lookup)
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-5">Case</th>
                <th className="py-2.5 px-4">Condition</th>
                <th className="py-2.5 px-4">Tree Action</th>
                <th className="py-2.5 px-4">Example</th>
                <th className="py-2.5 px-5 text-right">Complexity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {FOUR_INSERTION_CASES.map((c) => (
                <tr key={c.caseNumber} className="hover:bg-slate-50/70">
                  <td className="py-3 px-5 font-semibold text-slate-900 whitespace-nowrap">
                    {c.caseNumber}. {c.name}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-sky-800">{c.condition}</td>
                  <td className="py-3 px-4 text-slate-600">{c.action}</td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-700 whitespace-nowrap">
                    {c.exampleBefore} + {c.exampleInput} -&gt; {c.exampleAfter}
                  </td>
                  <td className="py-3 px-5 text-right font-mono tabular-nums text-slate-900">
                    {c.complexity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Complexity Matrix & Tech Stack */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200">
            <p className="text-xs font-semibold text-sky-700 mb-1">05. Complexity Analysis</p>
            <h2 className="text-base font-semibold text-slate-900">
              Naive Array vs HashSet vs AVL Interval Index
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-5">Operation</th>
                  <th className="py-2.5 px-4">Naive Array (10^9)</th>
                  <th className="py-2.5 px-4">HashSet Only</th>
                  <th className="py-2.5 px-5">AVL Interval Index</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {COMPLEXITY_TABLE.map((row) => (
                  <tr key={row.operation}>
                    <td className="py-3 px-5 font-medium text-slate-900">
                      <div>{row.operation}</div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">{row.notes}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-amber-800">{row.naiveArray}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{row.hashSetOnly}</td>
                    <td className="py-3 px-5 font-mono text-[11px] font-semibold text-emerald-700">
                      {row.intervalAvl}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6">
          <p className="text-xs font-semibold text-sky-700 mb-1">06. Technology Stack & Features</p>
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Chosen Stack for a 6-Hour Sprint
          </h2>
          <div className="space-y-3.5">
            {TECH_STACK.map((t) => (
              <div key={t.category} className="pb-3 border-b border-slate-100 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">{t.choice}</span>
                  <span className="text-slate-500">{t.category}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">{t.why}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 5. 4-Student Role Split & 6-Hour Plan */}
      <section className="bg-white border border-slate-200 rounded-xl p-6">
        <div className="mb-5">
          <p className="text-xs font-semibold text-sky-700 mb-1">07. Execution Roadmap</p>
          <h2 className="text-lg font-semibold text-slate-900">
            6-Hour Hackathon Development Plan (4 Beginner Students)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {TEAM_ROLES.map((r) => (
            <div key={r.role} className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <p className="text-[11px] font-mono text-sky-700">{r.student}</p>
              <h3 className="text-xs font-semibold text-slate-900 mt-0.5">{r.role}</h3>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-relaxed">{r.focus}</p>
              <ul className="mt-3 pt-2.5 border-t border-slate-200 space-y-1 text-[11px] text-slate-700">
                {r.deliverables.map((d) => (
                  <li key={d}>· {d}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border border-slate-200 rounded-xl divide-y divide-slate-200">
          {SIX_HOUR_PLAN.map((block) => (
            <div key={block.window} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-3">
                <span className="text-xs font-mono font-semibold text-sky-700">{block.window}</span>
                <h4 className="text-sm font-semibold text-slate-900 mt-0.5">{block.title}</h4>
                <p className="text-xs text-slate-500 mt-1">{block.goal}</p>
              </div>
              <div className="lg:col-span-6 space-y-1.5">
                {block.tasks.map((t, idx) => (
                  <div key={idx} className="text-xs text-slate-700 leading-relaxed">
                    <span className="font-semibold text-slate-900">{t.owner}:</span> {t.task}
                  </div>
                ))}
              </div>
              <div className="lg:col-span-3 flex items-start">
                <div className="w-full p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-lg text-[11px] text-emerald-900">
                  <span className="font-semibold block">Checkpoint</span>
                  {block.checkpoint}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
