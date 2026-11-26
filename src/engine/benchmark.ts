import { IntervalIndex, MAX_PACKAGE_ID } from './IntervalIndex';

export type BenchmarkPattern =
  | 'random_1b'
  | 'adversarial_even_odd'
  | 'clustered_warehouse'
  | 'heavy_duplicates';

export interface BenchmarkRunResult {
  pattern: BenchmarkPattern;
  targetOps: number;
  uniqueCount: number;
  duplicateCount: number;
  intervalCount: number;
  treeHeight: number;
  insertElapsedMs: number;
  queryElapsedMs: number;
  opsPerSecond: number;
  compressionRatio: number;
  missingRangesInFullSpan: number;
  invariantsVerified: boolean;
  invariantNote: string;
}

export function runScaleBenchmark(pattern: BenchmarkPattern, count: number): BenchmarkRunResult {
  const index = new IntervalIndex();
  const ids = new Array<number>(count);

  if (pattern === 'random_1b') {
    for (let i = 0; i < count; i++) {
      ids[i] = Math.floor(Math.random() * (MAX_PACKAGE_ID + 1));
    }
  } else if (pattern === 'adversarial_even_odd') {
    // Worst-case interval fragmentation: 0, 2, 4, ... forces K = N intervals with zero merges
    for (let i = 0; i < count; i++) {
      ids[i] = (i * 2) % MAX_PACKAGE_ID;
    }
  } else if (pattern === 'clustered_warehouse') {
    // Simulates 40 loading docks receiving contiguous shipment runs with occasional skips
    const dockCount = 40;
    const dockStarts = Array.from({ length: dockCount }, (_, d) => d * 24_000_000 + 1_000);
    for (let i = 0; i < count; i++) {
      const dock = i % dockCount;
      const offset = Math.floor(i / dockCount);
      const jitter = offset % 17 === 0 ? 3 : 0; // introduce periodic broken number gaps
      ids[i] = Math.min(MAX_PACKAGE_ID, dockStarts[dock] + offset + jitter);
    }
  } else {
    // Heavy duplicates: 50,000+ scans across 5,000 unique IDs
    const poolSize = Math.max(500, Math.floor(count / 8));
    for (let i = 0; i < count; i++) {
      ids[i] = (Math.floor(Math.random() * poolSize) * 199_999) % (MAX_PACKAGE_ID + 1);
    }
  }

  const t0 = performance.now();
  for (let i = 0; i < count; i++) {
    index.insert(ids[i]);
  }
  const insertElapsedMs = performance.now() - t0;

  const q0 = performance.now();
  const fullQuery = index.queryMissing(0, MAX_PACKAGE_ID);
  const queryElapsedMs = performance.now() - q0;

  // Verify structural invariants: strictly sorted, non-overlapping, non-adjacent (end + 1 < next.start)
  const all = index.getAllIntervals(count + 5);
  let valid = true;
  let totalFromIntervals = 0;
  let note = 'Sorted, disjoint, and maximally merged across all nodes.';

  for (let i = 0; i < all.length; i++) {
    const cur = all[i];
    if (cur.start > cur.end || cur.start < 0 || cur.end > MAX_PACKAGE_ID) {
      valid = false;
      note = `Invalid interval bounds at index ${i}`;
      break;
    }
    totalFromIntervals += cur.end - cur.start + 1;
    if (i > 0 && all[i - 1].end + 1 >= cur.start) {
      valid = false;
      note = `Unmerged or overlapping intervals at index ${i - 1} and ${i}`;
      break;
    }
  }

  if (valid && totalFromIntervals !== index.getUniqueCount()) {
    valid = false;
    note = `Unique count mismatch: ${totalFromIntervals} vs ${index.getUniqueCount()}`;
  }

  const uniqueCount = index.getUniqueCount();
  const intervalCount = index.getIntervalCount();

  return {
    pattern,
    targetOps: count,
    uniqueCount,
    duplicateCount: index.getDuplicateCount(),
    intervalCount,
    treeHeight: index.getTreeHeight(),
    insertElapsedMs,
    queryElapsedMs,
    opsPerSecond: insertElapsedMs > 0 ? Math.round((count / insertElapsedMs) * 1000) : count * 1000,
    compressionRatio: intervalCount > 0 ? Number((uniqueCount / intervalCount).toFixed(2)) : 0,
    missingRangesInFullSpan: fullQuery.missingRanges.length,
    invariantsVerified: valid,
    invariantNote: note,
  };
}
