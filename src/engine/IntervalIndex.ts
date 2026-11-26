export const MAX_PACKAGE_ID = 1_000_000_000;
export const TARGET_UNIQUE_CAPACITY = 50_000;

export interface Interval {
  start: number;
  end: number;
}

export type InsertionCaseId =
  | 'DUPLICATE'
  | 'NEW_STANDALONE'
  | 'EXTEND_LEFT'
  | 'EXTEND_RIGHT'
  | 'BRIDGE_MERGE';

export interface InsertionStepResult {
  id: number;
  accepted: boolean;
  caseId: InsertionCaseId;
  canonicalCase: 1 | 2 | 3 | 4;
  caseLabel: string;
  explanation: string;
  prevBefore: Interval | null;
  nextBefore: Interval | null;
  resultingInterval: Interval;
  intervalDelta: number;
  totalUnique: number;
  intervalCount: number;
  treeHeight: number;
  timestamp: string;
}

export interface MissingRangeResult {
  queryL: number;
  queryR: number;
  missingRanges: Interval[];
  totalMissingRanges: number;
  missingCount: number;
  presentCount: number;
  scannedIntervals: number;
  elapsedMs: number;
}

export interface IndexStats {
  uniqueCount: number;
  intervalCount: number;
  duplicateCount: number;
  bridgeMergeCount: number;
  totalScans: number;
  treeHeight: number;
  compressionRatio: number;
  minId: number | null;
  maxId: number | null;
  capacityLimit: number;
  maxPackageId: number;
}

class AVLNode {
  start: number;
  end: number;
  height: number = 1;
  size: number = 1;
  left: AVLNode | null = null;
  right: AVLNode | null = null;

  constructor(start: number, end: number) {
    this.start = start;
    this.end = end;
  }
}

export function formatInterval(iv: Interval): string {
  return iv.start === iv.end
    ? iv.start.toLocaleString('en-US')
    : `${iv.start.toLocaleString('en-US')}–${iv.end.toLocaleString('en-US')}`;
}

export function formatCompactInterval(iv: Interval): string {
  return iv.start === iv.end ? `${iv.start}` : `${iv.start}-${iv.end}`;
}

export function validatePackageId(
  raw: string | number
): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw === 'boolean' || raw === null || raw === undefined) {
    return { ok: false, error: 'Package ID must be a nonnegative integer.' };
  }
  const str = String(raw).trim().replace(/,/g, '');
  if (!str || !/^\d+$/.test(str)) {
    return { ok: false, error: 'Package ID must be a nonnegative whole integer.' };
  }
  const num = Number(str);
  if (!Number.isSafeInteger(num) || num < 0 || num > MAX_PACKAGE_ID) {
    return {
      ok: false,
      error: `Package ID must be between 0 and ${MAX_PACKAGE_ID.toLocaleString('en-US')}.`,
    };
  }
  return { ok: true, value: num };
}

export class IntervalIndex {
  private root: AVLNode | null = null;
  private uniqueCount = 0;
  private duplicateCount = 0;
  private bridgeMergeCount = 0;
  private operationCount = 0;
  private history: InsertionStepResult[] = [];

  clear(): void {
    this.root = null;
    this.uniqueCount = 0;
    this.duplicateCount = 0;
    this.bridgeMergeCount = 0;
    this.operationCount = 0;
    this.history = [];
  }

  getUniqueCount(): number {
    return this.uniqueCount;
  }

  getDuplicateCount(): number {
    return this.duplicateCount;
  }

  getBridgeMergeCount(): number {
    return this.bridgeMergeCount;
  }

  getOperationCount(): number {
    return this.operationCount;
  }

  getIntervalCount(): number {
    return this.root ? this.root.size : 0;
  }

  getTreeHeight(): number {
    return this.root ? this.root.height : 0;
  }

  getMinId(): number | null {
    let cur = this.root;
    if (!cur) return null;
    while (cur.left) cur = cur.left;
    return cur.start;
  }

  getMaxId(): number | null {
    let cur = this.root;
    if (!cur) return null;
    while (cur.right) cur = cur.right;
    return cur.end;
  }

  getHistory(limit = 100): InsertionStepResult[] {
    return this.history.slice(0, limit);
  }

  getStats(): IndexStats {
    const intervalCount = this.getIntervalCount();
    return {
      uniqueCount: this.uniqueCount,
      intervalCount,
      duplicateCount: this.duplicateCount,
      bridgeMergeCount: this.bridgeMergeCount,
      totalScans: this.operationCount,
      treeHeight: this.getTreeHeight(),
      compressionRatio:
        intervalCount > 0 ? Number((this.uniqueCount / intervalCount).toFixed(2)) : 0,
      minId: this.getMinId(),
      maxId: this.getMaxId(),
      capacityLimit: TARGET_UNIQUE_CAPACITY,
      maxPackageId: MAX_PACKAGE_ID,
    };
  }

  private recordHistory(entry: InsertionStepResult): void {
    this.history.unshift(entry);
    if (this.history.length > 150) {
      this.history.length = 150;
    }
  }

  insert(id: number): InsertionStepResult {
    if (!Number.isInteger(id) || id < 0 || id > MAX_PACKAGE_ID) {
      throw new RangeError(`ID ${id} out of bounds [0, ${MAX_PACKAGE_ID}]`);
    }

    const prev = this.findFloor(id);
    const next = this.findCeilStrict(id);
    const prevBefore: Interval | null = prev ? { start: prev.start, end: prev.end } : null;
    const nextBefore: Interval | null = next ? { start: next.start, end: next.end } : null;
    const timestamp = new Date().toISOString();

    // Case 1: Duplicate / Already Covered
    if (prev && id <= prev.end) {
      this.operationCount += 1;
      this.duplicateCount += 1;
      const result: InsertionStepResult = {
        id,
        accepted: false,
        caseId: 'DUPLICATE',
        canonicalCase: 1,
        caseLabel: 'Duplicate Ignored',
        explanation: `ID ${id.toLocaleString('en-US')} already exists inside [${prev.start.toLocaleString('en-US')}, ${prev.end.toLocaleString('en-US')}].`,
        prevBefore,
        nextBefore,
        resultingInterval: { start: prev.start, end: prev.end },
        intervalDelta: 0,
        totalUnique: this.uniqueCount,
        intervalCount: this.getIntervalCount(),
        treeHeight: this.getTreeHeight(),
        timestamp,
      };
      this.recordHistory(result);
      return result;
    }

    if (this.uniqueCount >= TARGET_UNIQUE_CAPACITY) {
      throw new RangeError(
        `Unique package limit (${TARGET_UNIQUE_CAPACITY.toLocaleString('en-US')}) reached. Reset index to ingest more unique IDs.`
      );
    }

    this.operationCount += 1;
    this.uniqueCount += 1;

    const touchLeft = prev !== null && prev.end + 1 === id;
    const touchRight = next !== null && id + 1 === next.start;

    // Case 4: Bridge & Merge two adjacent intervals
    if (touchLeft && touchRight && prev && next) {
      const mergedStart = prev.start;
      const mergedEnd = next.end;
      const nextStartToDelete = next.start;
      prev.end = mergedEnd;
      this.root = this.deleteNode(this.root, nextStartToDelete);
      this.bridgeMergeCount += 1;
      const result: InsertionStepResult = {
        id,
        accepted: true,
        caseId: 'BRIDGE_MERGE',
        canonicalCase: 4,
        caseLabel: 'Bridge Merge',
        explanation: `ID ${id.toLocaleString('en-US')} bridged [${prevBefore!.start.toLocaleString('en-US')}, ${prevBefore!.end.toLocaleString('en-US')}] and [${nextBefore!.start.toLocaleString('en-US')}, ${nextBefore!.end.toLocaleString('en-US')}] into [${mergedStart.toLocaleString('en-US')}, ${mergedEnd.toLocaleString('en-US')}].`,
        prevBefore,
        nextBefore,
        resultingInterval: { start: mergedStart, end: mergedEnd },
        intervalDelta: -1,
        totalUnique: this.uniqueCount,
        intervalCount: this.getIntervalCount(),
        treeHeight: this.getTreeHeight(),
        timestamp,
      };
      this.recordHistory(result);
      return result;
    }

    // Case 3a: Extend Left Interval Rightward
    if (touchLeft && prev) {
      prev.end = id;
      const result: InsertionStepResult = {
        id,
        accepted: true,
        caseId: 'EXTEND_LEFT',
        canonicalCase: 3,
        caseLabel: 'Extend Left',
        explanation: `ID ${id.toLocaleString('en-US')} extended [${prevBefore!.start.toLocaleString('en-US')}, ${prevBefore!.end.toLocaleString('en-US')}] rightward.`,
        prevBefore,
        nextBefore,
        resultingInterval: { start: prev.start, end: id },
        intervalDelta: 0,
        totalUnique: this.uniqueCount,
        intervalCount: this.getIntervalCount(),
        treeHeight: this.getTreeHeight(),
        timestamp,
      };
      this.recordHistory(result);
      return result;
    }

    // Case 3b: Extend Right Interval Leftward
    if (touchRight && next) {
      next.start = id;
      const result: InsertionStepResult = {
        id,
        accepted: true,
        caseId: 'EXTEND_RIGHT',
        canonicalCase: 3,
        caseLabel: 'Extend Right',
        explanation: `ID ${id.toLocaleString('en-US')} extended [${nextBefore!.start.toLocaleString('en-US')}, ${nextBefore!.end.toLocaleString('en-US')}] leftward.`,
        prevBefore,
        nextBefore,
        resultingInterval: { start: id, end: next.end },
        intervalDelta: 0,
        totalUnique: this.uniqueCount,
        intervalCount: this.getIntervalCount(),
        treeHeight: this.getTreeHeight(),
        timestamp,
      };
      this.recordHistory(result);
      return result;
    }

    // Case 2: Standalone New Interval
    this.root = this.insertNode(this.root, id, id);
    const result: InsertionStepResult = {
      id,
      accepted: true,
      caseId: 'NEW_STANDALONE',
      canonicalCase: 2,
      caseLabel: 'New Interval',
      explanation: `ID ${id.toLocaleString('en-US')} created standalone interval [${id.toLocaleString('en-US')}, ${id.toLocaleString('en-US')}].`,
      prevBefore,
      nextBefore,
      resultingInterval: { start: id, end: id },
      intervalDelta: 1,
      totalUnique: this.uniqueCount,
      intervalCount: this.getIntervalCount(),
      treeHeight: this.getTreeHeight(),
      timestamp,
    };
    this.recordHistory(result);
    return result;
  }

  queryMissing(L: number, R: number, maxReturnedRanges = 500): MissingRangeResult {
    const t0 = performance.now();
    if (!Number.isInteger(L) || !Number.isInteger(R) || L < 0 || R > MAX_PACKAGE_ID || L > R) {
      throw new RangeError(`Invalid query bounds [${L}, ${R}]`);
    }

    const overlapping: Interval[] = [];
    this.collectOverlapping(this.root, L, R, overlapping);

    const allMissing: Interval[] = [];
    let cursor = L;
    let presentCount = 0;

    for (let i = 0; i < overlapping.length; i++) {
      const iv = overlapping[i];
      const clampedStart = Math.max(L, iv.start);
      const clampedEnd = Math.min(R, iv.end);
      if (clampedEnd >= clampedStart) {
        presentCount += clampedEnd - clampedStart + 1;
      }

      if (iv.start > cursor) {
        allMissing.push({ start: cursor, end: Math.min(R, iv.start - 1) });
      }
      if (iv.end + 1 > cursor) {
        cursor = iv.end + 1;
      }
      if (cursor > R) {
        break;
      }
    }

    if (cursor <= R) {
      allMissing.push({ start: cursor, end: R });
    }

    const totalSpan = R - L + 1;
    const missingCount = totalSpan - presentCount;
    const elapsedMs = performance.now() - t0;

    return {
      queryL: L,
      queryR: R,
      missingRanges: allMissing.slice(0, maxReturnedRanges),
      totalMissingRanges: allMissing.length,
      missingCount,
      presentCount,
      scannedIntervals: overlapping.length,
      elapsedMs,
    };
  }

  getOverlappingIntervals(L: number, R: number): Interval[] {
    const out: Interval[] = [];
    this.collectOverlapping(this.root, L, R, out);
    return out;
  }

  getIntervalSlice(offset: number, limit: number): Interval[] {
    const total = this.getIntervalCount();
    if (offset >= total || limit <= 0) return [];
    const endIdx = Math.min(total - 1, offset + limit - 1);
    const out: Interval[] = [];
    this.collectByRank(this.root, 0, offset, endIdx, out);
    return out;
  }

  getAllIntervals(maxLimit = 50_000): Interval[] {
    return this.getIntervalSlice(0, maxLimit);
  }

  contains(id: number): boolean {
    const floor = this.findFloor(id);
    return floor !== null && id <= floor.end;
  }

  private heightOf(n: AVLNode | null): number {
    return n ? n.height : 0;
  }

  private sizeOf(n: AVLNode | null): number {
    return n ? n.size : 0;
  }

  private updateMeta(n: AVLNode): void {
    n.height = 1 + Math.max(this.heightOf(n.left), this.heightOf(n.right));
    n.size = 1 + this.sizeOf(n.left) + this.sizeOf(n.right);
  }

  private balanceFactor(n: AVLNode | null): number {
    return n ? this.heightOf(n.left) - this.heightOf(n.right) : 0;
  }

  private rotateRight(y: AVLNode): AVLNode {
    const x = y.left!;
    const t2 = x.right;
    x.right = y;
    y.left = t2;
    this.updateMeta(y);
    this.updateMeta(x);
    return x;
  }

  private rotateLeft(x: AVLNode): AVLNode {
    const y = x.right!;
    const t2 = y.left;
    y.left = x;
    x.right = t2;
    this.updateMeta(x);
    this.updateMeta(y);
    return y;
  }

  private rebalance(node: AVLNode): AVLNode {
    this.updateMeta(node);
    const bf = this.balanceFactor(node);
    if (bf > 1) {
      if (this.balanceFactor(node.left) < 0) {
        node.left = this.rotateLeft(node.left!);
      }
      return this.rotateRight(node);
    }
    if (bf < -1) {
      if (this.balanceFactor(node.right) > 0) {
        node.right = this.rotateRight(node.right!);
      }
      return this.rotateLeft(node);
    }
    return node;
  }

  private insertNode(node: AVLNode | null, start: number, end: number): AVLNode {
    if (!node) return new AVLNode(start, end);
    if (start < node.start) {
      node.left = this.insertNode(node.left, start, end);
    } else if (start > node.start) {
      node.right = this.insertNode(node.right, start, end);
    } else {
      node.end = end;
      return node;
    }
    return this.rebalance(node);
  }

  private minNode(node: AVLNode): AVLNode {
    let cur = node;
    while (cur.left) cur = cur.left;
    return cur;
  }

  private deleteNode(node: AVLNode | null, start: number): AVLNode | null {
    if (!node) return null;
    if (start < node.start) {
      node.left = this.deleteNode(node.left, start);
    } else if (start > node.start) {
      node.right = this.deleteNode(node.right, start);
    } else {
      if (!node.left || !node.right) {
        return node.left ?? node.right;
      }
      const succ = this.minNode(node.right);
      node.start = succ.start;
      node.end = succ.end;
      node.right = this.deleteNode(node.right, succ.start);
    }
    return this.rebalance(node);
  }

  private findFloor(key: number): AVLNode | null {
    let cur = this.root;
    let best: AVLNode | null = null;
    while (cur) {
      if (cur.start <= key) {
        best = cur;
        cur = cur.right;
      } else {
        cur = cur.left;
      }
    }
    return best;
  }

  private findCeilStrict(key: number): AVLNode | null {
    let cur = this.root;
    let best: AVLNode | null = null;
    while (cur) {
      if (cur.start > key) {
        best = cur;
        cur = cur.left;
      } else {
        cur = cur.right;
      }
    }
    return best;
  }

  private collectOverlapping(node: AVLNode | null, L: number, R: number, out: Interval[]): void {
    if (!node) return;
    if (node.start > L) {
      this.collectOverlapping(node.left, L, R, out);
    }
    if (node.end >= L && node.start <= R) {
      out.push({ start: node.start, end: node.end });
    }
    if (node.start <= R) {
      this.collectOverlapping(node.right, L, R, out);
    }
  }

  private collectByRank(
    node: AVLNode | null,
    baseRank: number,
    lo: number,
    hi: number,
    out: Interval[]
  ): void {
    if (!node) return;
    const leftSize = this.sizeOf(node.left);
    const curRank = baseRank + leftSize;

    if (curRank > lo && node.left) {
      this.collectByRank(node.left, baseRank, lo, hi, out);
    }
    if (curRank >= lo && curRank <= hi) {
      out.push({ start: node.start, end: node.end });
    }
    if (curRank < hi && node.right) {
      this.collectByRank(node.right, curRank + 1, lo, hi, out);
    }
  }
}
