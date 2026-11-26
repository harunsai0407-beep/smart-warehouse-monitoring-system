from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import threading
import time
from typing import Any, Dict, List, Optional, Tuple

from sortedcontainers import SortedDict

MAX_PACKAGE_ID = 1_000_000_000
MAX_UNIQUE_IDS = 50_000


def validate_package_id(raw: Any) -> int:
    """Validate that raw represents a nonnegative integer in [0, 1_000_000_000]."""
    if isinstance(raw, bool) or raw is None:
        raise ValueError("Package ID must be a nonnegative integer.")
    if isinstance(raw, int):
        val = raw
    elif isinstance(raw, str):
        cleaned = raw.strip().replace(",", "")
        if not cleaned or not cleaned.isdigit():
            raise ValueError(f"Invalid package ID '{raw}'. Must be a nonnegative whole integer.")
        val = int(cleaned)
    else:
        raise ValueError("Package ID must be a nonnegative integer.")

    if val < 0 or val > MAX_PACKAGE_ID:
        raise ValueError(f"Package ID {val} out of bounds [0, {MAX_PACKAGE_ID:,}].")
    return val


class LiveArrivalIndex:
    """
    Incremental disjoint-interval index backed by sortedcontainers.SortedDict.
    Maps interval start -> interval end while preserving:
      1. Strictly sorted keys (start)
      2. Non-overlapping, non-adjacent intervals (prev.end + 1 < next.start)
      3. O(log K) insertions and O(log K + M) bounded missing-range queries
    """

    def __init__(
        self,
        max_package_id: int = MAX_PACKAGE_ID,
        max_unique_ids: int = MAX_UNIQUE_IDS,
    ) -> None:
        self.max_package_id = max_package_id
        self.max_unique_ids = max_unique_ids
        self._lock = threading.RLock()
        self._intervals: SortedDict[int, int] = SortedDict()
        self._unique_count = 0
        self._duplicate_count = 0
        self._bridge_merge_count = 0
        self._total_scans = 0
        self._history: deque[Dict[str, Any]] = deque(maxlen=150)

    def reset(self) -> None:
        with self._lock:
            self._intervals.clear()
            self._unique_count = 0
            self._duplicate_count = 0
            self._bridge_merge_count = 0
            self._total_scans = 0
            self._history.clear()

    def insert(self, pkg_id: int) -> Dict[str, Any]:
        pkg_id = validate_package_id(pkg_id)

        with self._lock:
            keys = self._intervals.keys()
            n = len(self._intervals)
            idx = self._intervals.bisect_right(pkg_id)

            prev_start: Optional[int] = keys[idx - 1] if idx > 0 else None
            prev_end: Optional[int] = self._intervals[prev_start] if prev_start is not None else None
            next_start: Optional[int] = keys[idx] if idx < n else None
            next_end: Optional[int] = self._intervals[next_start] if next_start is not None else None

            prev_before = {"start": prev_start, "end": prev_end} if prev_start is not None else None
            next_before = {"start": next_start, "end": next_end} if next_start is not None else None
            timestamp = datetime.now(timezone.utc).isoformat()

            # Case 1: Duplicate / Already Covered
            if prev_start is not None and prev_end is not None and pkg_id <= prev_end:
                self._total_scans += 1
                self._duplicate_count += 1
                event = {
                    "id": pkg_id,
                    "accepted": False,
                    "caseId": "DUPLICATE",
                    "canonicalCase": 1,
                    "caseLabel": "Duplicate Ignored",
                    "explanation": f"ID {pkg_id:,} already lies inside [{prev_start:,}, {prev_end:,}].",
                    "prevBefore": prev_before,
                    "nextBefore": next_before,
                    "resultingInterval": {"start": prev_start, "end": prev_end},
                    "intervalDelta": 0,
                    "totalUnique": self._unique_count,
                    "intervalCount": len(self._intervals),
                    "timestamp": timestamp,
                }
                self._history.appendleft(event)
                return event

            if self._unique_count >= self.max_unique_ids:
                raise ValueError(
                    f"Unique package capacity ({self.max_unique_ids:,}) reached. Reset index to continue."
                )

            self._total_scans += 1
            self._unique_count += 1

            touch_left = prev_end is not None and prev_end + 1 == pkg_id
            touch_right = next_start is not None and pkg_id + 1 == next_start

            # Case 4: Bridge Merge (joins prev and next into one interval)
            if touch_left and touch_right and prev_start is not None and next_start is not None and next_end is not None:
                del self._intervals[next_start]
                self._intervals[prev_start] = next_end
                self._bridge_merge_count += 1
                event = {
                    "id": pkg_id,
                    "accepted": True,
                    "caseId": "BRIDGE_MERGE",
                    "canonicalCase": 4,
                    "caseLabel": "Bridge Merge",
                    "explanation": (
                        f"ID {pkg_id:,} bridged [{prev_start:,}, {prev_end:,}] and "
                        f"[{next_start:,}, {next_end:,}] into [{prev_start:,}, {next_end:,}]."
                    ),
                    "prevBefore": prev_before,
                    "nextBefore": next_before,
                    "resultingInterval": {"start": prev_start, "end": next_end},
                    "intervalDelta": -1,
                    "totalUnique": self._unique_count,
                    "intervalCount": len(self._intervals),
                    "timestamp": timestamp,
                }
                self._history.appendleft(event)
                return event

            # Case 3a: Extend Left Interval Rightward
            if touch_left and prev_start is not None:
                self._intervals[prev_start] = pkg_id
                event = {
                    "id": pkg_id,
                    "accepted": True,
                    "caseId": "EXTEND_LEFT",
                    "canonicalCase": 3,
                    "caseLabel": "Extend Left",
                    "explanation": f"ID {pkg_id:,} extended [{prev_start:,}, {prev_end:,}] rightward.",
                    "prevBefore": prev_before,
                    "nextBefore": next_before,
                    "resultingInterval": {"start": prev_start, "end": pkg_id},
                    "intervalDelta": 0,
                    "totalUnique": self._unique_count,
                    "intervalCount": len(self._intervals),
                    "timestamp": timestamp,
                }
                self._history.appendleft(event)
                return event

            # Case 3b: Extend Right Interval Leftward
            if touch_right and next_start is not None and next_end is not None:
                del self._intervals[next_start]
                self._intervals[pkg_id] = next_end
                event = {
                    "id": pkg_id,
                    "accepted": True,
                    "caseId": "EXTEND_RIGHT",
                    "canonicalCase": 3,
                    "caseLabel": "Extend Right",
                    "explanation": f"ID {pkg_id:,} extended [{next_start:,}, {next_end:,}] leftward.",
                    "prevBefore": prev_before,
                    "nextBefore": next_before,
                    "resultingInterval": {"start": pkg_id, "end": next_end},
                    "intervalDelta": 0,
                    "totalUnique": self._unique_count,
                    "intervalCount": len(self._intervals),
                    "timestamp": timestamp,
                }
                self._history.appendleft(event)
                return event

            # Case 2: Standalone New Interval
            self._intervals[pkg_id] = pkg_id
            event = {
                "id": pkg_id,
                "accepted": True,
                "caseId": "NEW_STANDALONE",
                "canonicalCase": 2,
                "caseLabel": "New Interval",
                "explanation": f"ID {pkg_id:,} created standalone interval [{pkg_id:,}, {pkg_id:,}].",
                "prevBefore": prev_before,
                "nextBefore": next_before,
                "resultingInterval": {"start": pkg_id, "end": pkg_id},
                "intervalDelta": 1,
                "totalUnique": self._unique_count,
                "intervalCount": len(self._intervals),
                "timestamp": timestamp,
            }
            self._history.appendleft(event)
            return event

    def get_intervals(self, offset: int = 0, limit: int = 50) -> Tuple[List[Dict[str, int]], int]:
        with self._lock:
            total = len(self._intervals)
            if offset >= total or limit <= 0:
                return [], total
            stop = min(total, offset + limit)
            items = [
                {"start": s, "end": self._intervals[s]}
                for s in self._intervals.islice(offset, stop)
            ]
            return items, total

    def get_overlapping_intervals(self, left: int, right: int, limit: int = 500) -> List[Dict[str, int]]:
        with self._lock:
            keys = self._intervals.keys()
            idx = self._intervals.bisect_right(left)
            pos = idx - 1 if idx > 0 and self._intervals[keys[idx - 1]] >= left else idx
            out: List[Dict[str, int]] = []
            for s in self._intervals.islice(pos):
                if s > right or len(out) >= limit:
                    break
                out.append({"start": s, "end": self._intervals[s]})
            return out

    def query_missing(self, left: int, right: int, max_ranges: int = 250) -> Dict[str, Any]:
        t0 = time.perf_counter()
        left = validate_package_id(left)
        right = validate_package_id(right)
        if left > right:
            raise ValueError("Lower bound L must be <= upper bound R.")

        with self._lock:
            keys = self._intervals.keys()
            idx = self._intervals.bisect_right(left)
            pos = idx - 1 if idx > 0 and self._intervals[keys[idx - 1]] >= left else idx

            missing: List[Dict[str, int]] = []
            cursor = left
            present_count = 0
            scanned = 0

            for s in self._intervals.islice(pos):
                if s > right:
                    break
                e = self._intervals[s]
                scanned += 1
                clamped_s = max(left, s)
                clamped_e = min(right, e)
                if clamped_e >= clamped_s:
                    present_count += clamped_e - clamped_s + 1

                if s > cursor:
                    missing.append({"start": cursor, "end": min(right, s - 1)})
                if e + 1 > cursor:
                    cursor = e + 1
                if cursor > right:
                    break

            if cursor <= right:
                missing.append({"start": cursor, "end": right})

            total_span = right - left + 1
            elapsed_ms = (time.perf_counter() - t0) * 1000.0

            return {
                "queryL": left,
                "queryR": right,
                "missingRanges": missing[:max_ranges],
                "totalMissingRanges": len(missing),
                "missingCount": total_span - present_count,
                "presentCount": present_count,
                "scannedIntervals": scanned,
                "elapsedMs": round(elapsed_ms, 4),
            }

    def get_stats(self) -> Dict[str, Any]:
        with self._lock:
            interval_count = len(self._intervals)
            keys = self._intervals.keys()
            min_id = keys[0] if interval_count > 0 else None
            max_id = self._intervals[keys[-1]] if interval_count > 0 else None
            ratio = round(self._unique_count / interval_count, 2) if interval_count > 0 else 0.0
            return {
                "uniqueCount": self._unique_count,
                "intervalCount": interval_count,
                "duplicateCount": self._duplicate_count,
                "bridgeMergeCount": self._bridge_merge_count,
                "totalScans": self._total_scans,
                "compressionRatio": ratio,
                "minId": min_id,
                "maxId": max_id,
                "capacityLimit": self.max_unique_ids,
                "maxPackageId": self.max_package_id,
            }

    def get_history(self, limit: int = 60) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._history)[:limit]
