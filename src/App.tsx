import { useCallback, useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import {
  IndexStats,
  InsertionStepResult,
  Interval,
  MAX_PACKAGE_ID,
  MissingRangeResult,
  TARGET_UNIQUE_CAPACITY,
} from './engine/IntervalIndex';
import { LiveWorkbench } from './components/LiveWorkbench';
import { Sidebar, WorkspaceSection } from './components/Sidebar';
import { ToastContainer, ToastItem, ToastTone } from './components/ToastContainer';

const PAGE_SIZE = 20;

const INITIAL_STATS: IndexStats = {
  uniqueCount: 0,
  intervalCount: 0,
  duplicateCount: 0,
  bridgeMergeCount: 0,
  totalScans: 0,
  treeHeight: 0,
  compressionRatio: 0,
  minId: null,
  maxId: null,
  capacityLimit: TARGET_UNIQUE_CAPACITY,
  maxPackageId: MAX_PACKAGE_ID,
};

export default function App() {
  const [stats, setStats] = useState<IndexStats>(INITIAL_STATS);
  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [totalIntervals, setTotalIntervals] = useState(0);
  const [intervalPage, setIntervalPage] = useState(0);
  const [missingResult, setMissingResult] = useState<MissingRangeResult | null>(null);
  const [windowIntervals, setWindowIntervals] = useState<Interval[]>([]);
  const [windowMissing, setWindowMissing] = useState<Interval[]>([]);
  const [viewMode, setViewMode] = useState<'query' | 'active'>('query');
  const [history, setHistory] = useState<InsertionStepResult[]>([]);
  const [lastStep, setLastStep] = useState<InsertionStepResult | null>(null);
  const [queryL, setQueryL] = useState(95);
  const [queryR, setQueryR] = useState(130);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<WorkspaceSection>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const pushToast = useCallback((tone: ToastTone, title: string, detail: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [{ id, tone, title, detail }, ...prev].slice(0, 3));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshView = useCallback(
    async (page = intervalPage, lBound = queryL, rBound = queryR, mode = viewMode) => {
      const [statsRes, ivRes, missRes] = await Promise.all([
        fetch('/api/stats'),
        fetch(`/api/intervals?offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`),
        fetch(`/api/missing?l=${lBound}&r=${rBound}&limit=250`),
      ]);

      let nextStats: IndexStats | null = null;
      if (statsRes.ok) {
        const sData = await statsRes.json();
        nextStats = sData.stats;
        setStats(sData.stats);
        setHistory(sData.history ?? []);
        if (sData.history?.length > 0) {
          setLastStep(sData.history[0]);
        } else {
          setLastStep(null);
        }
      }

      if (ivRes.ok) {
        const iData = await ivRes.json();
        setIntervals(iData.intervals ?? []);
        setTotalIntervals(iData.totalIntervals ?? 0);
      }

      let queryMissingData: MissingRangeResult | null = null;
      if (missRes.ok) {
        queryMissingData = await missRes.json();
        setMissingResult(queryMissingData);
      }

      // Fetch exact overlapping intervals & missing ranges for the Number-Line window [viewL, viewR]
      const wL =
        mode === 'active' && nextStats?.minId !== null && nextStats?.minId !== undefined
          ? nextStats.minId
          : lBound;
      const wR =
        mode === 'active' && nextStats?.maxId !== null && nextStats?.maxId !== undefined
          ? Math.max(wL, nextStats.maxId)
          : rBound;

      const winIvRes = await fetch(`/api/intervals?l=${wL}&r=${wR}&limit=500`);
      if (winIvRes.ok) {
        const wData = await winIvRes.json();
        setWindowIntervals(wData.intervals ?? []);
      }

      if (wL === lBound && wR === rBound && queryMissingData) {
        setWindowMissing(queryMissingData.missingRanges ?? []);
      } else {
        const winMissRes = await fetch(`/api/missing?l=${wL}&r=${wR}&limit=250`);
        if (winMissRes.ok) {
          const wmData = await winMissRes.json();
          setWindowMissing(wmData.missingRanges ?? []);
        }
      }
    },
    [intervalPage, queryL, queryR, viewMode]
  );

  useEffect(() => {
    refreshView(0, 95, 130, 'query').catch(() => {
      setApiError('Unable to reach backend index service.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleViewMode = async (mode: 'query' | 'active') => {
    setViewMode(mode);
    await refreshView(intervalPage, queryL, queryR, mode);
  };

  const handleScanSingle = async (id: number) => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/arrivals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? 'Failed to insert package ID.');
        pushToast('error', 'Arrival Rejected', data.error ?? 'Invalid package ID.');
        return;
      }
      const step: InsertionStepResult | null = data.lastStep ?? null;
      if (step) {
        setLastStep(step);
        const tone: ToastTone =
          step.caseId === 'BRIDGE_MERGE'
            ? 'merge'
            : step.caseId === 'DUPLICATE'
            ? 'warning'
            : 'success';
        pushToast(tone, step.caseLabel, step.explanation);
      }
      await refreshView(intervalPage, queryL, queryR, viewMode);
    } catch {
      setApiError('Network error while calling POST /api/arrivals.');
    } finally {
      setLoading(false);
    }
  };

  const handleScanBatch = async (raw: string) => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/arrivals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? 'Failed to process batch.');
        pushToast('error', 'Batch Rejected', data.error ?? 'Invalid batch payload.');
        return;
      }
      if (data.lastStep) setLastStep(data.lastStep);
      pushToast(
        'success',
        'Batch Processed',
        `${data.insertedCount} inserted, ${data.duplicateCount} duplicates ignored.`
      );
      setIntervalPage(0);
      await refreshView(0, queryL, queryR, viewMode);
    } catch {
      setApiError('Network error while calling POST /api/arrivals.');
    } finally {
      setLoading(false);
    }
  };

  const handleQueryMissing = async (L: number, R: number, forceQueryView = false) => {
    setLoading(true);
    setApiError(null);
    const nextMode = forceQueryView ? 'query' : viewMode;
    if (forceQueryView && viewMode !== 'query') {
      setViewMode('query');
    }
    try {
      const res = await fetch(`/api/missing?l=${L}&r=${R}&limit=250`);
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? 'Missing-range query failed.');
        pushToast('error', 'Query Invalid', data.error ?? 'Check bounds [L, R].');
        return;
      }
      setQueryL(L);
      setQueryR(R);
      setMissingResult(data);
      await refreshView(intervalPage, L, R, nextMode);
      pushToast(
        'info',
        `Query [${L.toLocaleString('en-US')}, ${R.toLocaleString('en-US')}]`,
        `${data.missingCount.toLocaleString('en-US')} missing across ${data.totalMissingRanges.toLocaleString('en-US')} range(s).`
      );
    } catch {
      setApiError('Network error while calling GET /api/missing.');
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = async (nextPage: number) => {
    setIntervalPage(nextPage);
    await refreshView(nextPage, queryL, queryR, viewMode);
  };

  const handleRunDemo = async (mode: 'guided' | 'bridge_demo' | 'stress_5k' | 'stress_50k') => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApiError(data.error ?? 'Demo failed.');
        pushToast('error', 'Demo Failed', data.error ?? 'Unable to load demonstration.');
        return;
      }
      const nextL = mode === 'guided' ? 95 : mode === 'bridge_demo' ? queryL : 0;
      const nextR =
        mode === 'guided'
          ? 130
          : mode === 'bridge_demo'
          ? Math.max(queryR, data.stats?.maxId ?? queryR)
          : data.stats?.maxId ?? 130;
      setQueryL(nextL);
      setQueryR(Math.max(nextL, nextR));
      setIntervalPage(0);
      await refreshView(0, nextL, Math.max(nextL, nextR), viewMode);

      if (mode === 'bridge_demo') {
        pushToast(
          'merge',
          'Bridge Merge Showcase',
          'Two adjacent intervals joined into a single continuous range.'
        );
      } else if (mode === 'stress_50k' || mode === 'stress_5k') {
        pushToast(
          'success',
          `${mode === 'stress_50k' ? '50,000' : '5,000'}-ID Load Complete`,
          `Indexed ${data.stats?.uniqueCount.toLocaleString('en-US')} unique IDs in ${data.elapsedMs} ms.`
        );
      } else {
        pushToast(
          'info',
          'Guided Demo Loaded',
          'Populated merges, duplicate detections, and a 1-billion boundary interval.'
        );
      }
    } catch {
      setApiError('Network error while calling POST /api/demo.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/reset', { method: 'POST' });
      if (!res.ok) {
        setApiError('Reset failed.');
        return;
      }
      setIntervalPage(0);
      await refreshView(0, queryL, queryR, viewMode);
      pushToast('info', 'Index Reset', 'All arrival intervals and counters cleared.');
    } catch {
      setApiError('Network error while calling POST /api/reset.');
    } finally {
      setLoading(false);
    }
  };

  const breadcrumbLabel =
    activeSection === 'overview'
      ? 'Operations Overview'
      : activeSection === 'intervals'
      ? 'Sorted Intervals'
      : activeSection === 'missing'
      ? 'Missing-Range Finder'
      : 'Arrival History';

  return (
    <div className="min-h-screen flex bg-[#070D19] text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        stats={stats}
        loading={loading}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        onRunDemo={handleRunDemo}
        onReset={handleReset}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-[#091224] border-b border-[#1B2A44] sticky top-0 z-30">
          <div className="px-4 sm:px-6 h-16 flex items-center justify-between gap-6">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation sidebar"
                className="lg:hidden p-2 text-slate-300 hover:text-slate-100 bg-[#0C1526] border border-[#1B2A44] rounded-lg cursor-pointer shrink-0"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 text-xs sm:text-sm truncate">
                <span className="text-slate-400 whitespace-nowrap">Warehouse Monitor</span>
                <span className="text-slate-600" aria-hidden="true">/</span>
                <span className="font-medium text-slate-100 truncate">{breadcrumbLabel}</span>
              </div>
            </div>

            <div className="shrink-0">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleRunDemo('guided')}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
              >
                Run Guided Demo
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 py-6">
          <div className="mb-5">
            <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-slate-100 text-balance">
              Live Arrival Index – Smart Warehouse Monitor
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-3xl">
              Incremental disjoint interval tracking with duplicate detection, bridge merging, and bounded missing-range queries across IDs 0 to 1,000,000,000.
            </p>
          </div>

          <LiveWorkbench
            stats={stats}
            intervals={intervals}
            windowIntervals={windowIntervals}
            windowMissing={windowMissing}
            viewMode={viewMode}
            onToggleViewMode={handleToggleViewMode}
            totalIntervals={totalIntervals}
            intervalPage={intervalPage}
            pageSize={PAGE_SIZE}
            missingResult={missingResult}
            history={history}
            lastStep={lastStep}
            queryL={queryL}
            queryR={queryR}
            loading={loading}
            apiError={apiError}
            activeSection={activeSection}
            onSelectSection={setActiveSection}
            onScanSingle={handleScanSingle}
            onScanBatch={handleScanBatch}
            onQueryMissing={handleQueryMissing}
            onPageChange={handlePageChange}
            onRunDemo={handleRunDemo}
            onReset={handleReset}
            onNotify={pushToast}
          />
        </main>

        <footer className="border-t border-[#1B2A44] bg-[#091224] mt-8">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-400">
            <span>LIVE ARRIVAL INDEX – SMART WAREHOUSE MONITOR</span>
            <span className="font-mono tabular-nums">
              Balanced Ordered Interval Map · Capacity 50,000 Unique IDs
            </span>
          </div>
        </footer>
      </div>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
