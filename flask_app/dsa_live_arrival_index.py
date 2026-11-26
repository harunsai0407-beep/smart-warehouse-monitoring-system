"""
Live Arrival Index (DSA Reference Implementation)
Uses sortedcontainers.SortedDict to maintain sorted, non-overlapping,
maximally merged closed intervals (start, end) incrementally.
"""

from __future__ import annotations

import random
import time
import unittest
from typing import Dict, List, Optional, Tuple

from sortedcontainers import SortedDict

MAX_PACKAGE_ID = 1_000_000_000
MAX_UNIQUE_PACKAGES = 50_000


class LiveArrivalIndex:
    """
    Maintains sorted, disjoint closed intervals (start, end) in a balanced
    ordered map (SortedDict: start -> end) without allocating arrays up to 10^9
    or re-sorting received IDs.
    """

    def __init__(
        self,
        max_package_id: int = MAX_PACKAGE_ID,
        max_unique_packages: int = MAX_UNIQUE_PACKAGES,
    ) -> None:
        self.max_package_id = max_package_id
        self.max_unique_packages = max_unique_packages
        self._intervals: SortedDict[int, int] = SortedDict()
        self._unique_count = 0
        self._duplicates_ignored = 0
        self._total_calls = 0
        self._bridge_merges = 0

    def _validate_id(self, value: int, name: str = "package_id") -> int:
        if isinstance(value, bool) or not isinstance(value, int):
            raise TypeError(f"{name} must be an integer, got {type(value).__name__}.")
        if value < 0:
            raise ValueError(f"{name} must be nonnegative, got {value}.")
        if value > self.max_package_id:
            raise ValueError(
                f"{name} must be <= {self.max_package_id:,}, got {value:,}."
            )
        return value

    def add_package(self, package_id: int) -> str:
        """
        Incrementally insert package_id in O(log K) time, where K <= 50,000
        is the current number of disjoint intervals.

        Returns the handled case label:
          - 'DUPLICATE_IGNORED'
          - 'CREATE_NEW'
          - 'EXTEND_LEFT'
          - 'EXTEND_RIGHT_BACKWARDS'
          - 'MERGE_BOTH'
        """
        pid = self._validate_id(package_id, "package_id")
        self._total_calls += 1

        keys = self._intervals.keys()
        n = len(self._intervals)
        idx = self._intervals.bisect_right(pid)

        prev_start: Optional[int] = keys[idx - 1] if idx > 0 else None
        prev_end: Optional[int] = (
            self._intervals[prev_start] if prev_start is not None else None
        )
        next_start: Optional[int] = keys[idx] if idx < n else None
        next_end: Optional[int] = (
            self._intervals[next_start] if next_start is not None else None
        )

        # Duplicate check: already covered by [prev_start, prev_end]
        if prev_start is not None and prev_end is not None and pid <= prev_end:
            self._duplicates_ignored += 1
            return "DUPLICATE_IGNORED"

        if self._unique_count >= self.max_unique_packages:
            raise OverflowError(
                f"Maximum capacity of {self.max_unique_packages:,} unique IDs reached."
            )

        self._unique_count += 1
        touch_left = prev_end is not None and prev_end + 1 == pid
        touch_right = next_start is not None and pid + 1 == next_start

        # Case 4: Merge both adjacent intervals
        if (
            touch_left
            and touch_right
            and prev_start is not None
            and next_start is not None
            and next_end is not None
        ):
            del self._intervals[next_start]
            self._intervals[prev_start] = next_end
            self._bridge_merges += 1
            return "MERGE_BOTH"

        # Case 2: Extend left interval rightward
        if touch_left and prev_start is not None:
            self._intervals[prev_start] = pid
            return "EXTEND_LEFT"

        # Case 3: Extend right interval backwards (leftward)
        if touch_right and next_start is not None and next_end is not None:
            del self._intervals[next_start]
            self._intervals[pid] = next_end
            return "EXTEND_RIGHT_BACKWARDS"

        # Case 1: Create new standalone interval (pid, pid)
        self._intervals[pid] = pid
        return "CREATE_NEW"

    def get_intervals(self) -> List[Tuple[int, int]]:
        """
        Return all active disjoint intervals as sorted (start, end) tuples
        in O(K) time without sorting.
        """
        return [(start, end) for start, end in self._intervals.items()]

    def get_missing_ranges(self, start: int, end: int) -> List[Tuple[int, int]]:
        """
        Return sorted missing (gap_start, gap_end) tuples within [start, end]
        in O(log K + M) time, where M is the number of intervals intersecting [start, end].
        """
        left = self._validate_id(start, "start")
        right = self._validate_id(end, "end")
        if left > right:
            raise ValueError(f"Invalid bounds: start ({left}) > end ({right}).")

        keys = self._intervals.keys()
        idx = self._intervals.bisect_right(left)
        pos = idx - 1 if idx > 0 and self._intervals[keys[idx - 1]] >= left else idx

        missing: List[Tuple[int, int]] = []
        cursor = left

        for iv_start in self._intervals.islice(pos):
            if iv_start > right:
                break
            iv_end = self._intervals[iv_start]

            if iv_start > cursor:
                missing.append((cursor, min(right, iv_start - 1)))

            if iv_end + 1 > cursor:
                cursor = iv_end + 1

            if cursor > right:
                break

        if cursor <= right:
            missing.append((cursor, right))

        return missing

    def get_statistics(self) -> Dict[str, object]:
        """Return index statistics in O(log K) time."""
        interval_count = len(self._intervals)
        keys = self._intervals.keys()
        min_id = keys[0] if interval_count > 0 else None
        max_id = self._intervals[keys[-1]] if interval_count > 0 else None
        compression = (
            round(self._unique_count / interval_count, 2) if interval_count > 0 else 0.0
        )
        return {
            "unique_count": self._unique_count,
            "interval_count": interval_count,
            "duplicates_ignored": self._duplicates_ignored,
            "total_calls": self._total_calls,
            "bridge_merges": self._bridge_merges,
            "compression_ratio": compression,
            "min_id": min_id,
            "max_id": max_id,
        }

    def reset_index(self) -> None:
        """Clear all stored intervals and reset counters."""
        self._intervals.clear()
        self._unique_count = 0
        self._duplicates_ignored = 0
        self._total_calls = 0
        self._bridge_merges = 0


# ---------------------------------------------------------------------------
# Comprehensive Unit & 50,000-ID Scale Test Suite
# ---------------------------------------------------------------------------
class TestLiveArrivalIndexDSA(unittest.TestCase):
    def setUp(self) -> None:
        self.index = LiveArrivalIndex()

    def test_four_insertion_cases_and_duplicates(self) -> None:
        # Case 1: Create new interval
        self.assertEqual(self.index.add_package(10), "CREATE_NEW")
        self.assertEqual(self.index.add_package(14), "CREATE_NEW")
        self.assertEqual(self.index.get_intervals(), [(10, 10), (14, 14)])

        # Case 2: Extend left interval rightward
        self.assertEqual(self.index.add_package(11), "EXTEND_LEFT")
        self.assertEqual(self.index.get_intervals(), [(10, 11), (14, 14)])

        # Case 3: Extend right interval backwards
        self.assertEqual(self.index.add_package(13), "EXTEND_RIGHT_BACKWARDS")
        self.assertEqual(self.index.get_intervals(), [(10, 11), (13, 14)])

        # Duplicate check inside existing interval
        self.assertEqual(self.index.add_package(10), "DUPLICATE_IGNORED")
        self.assertEqual(self.index.add_package(14), "DUPLICATE_IGNORED")

        # Case 4: Merge both intervals
        self.assertEqual(self.index.add_package(12), "MERGE_BOTH")
        self.assertEqual(self.index.get_intervals(), [(10, 14)])
        self.assertEqual(self.index.add_package(12), "DUPLICATE_IGNORED")

        stats = self.index.get_statistics()
        self.assertEqual(stats["unique_count"], 5)
        self.assertEqual(stats["interval_count"], 1)
        self.assertEqual(stats["duplicates_ignored"], 3)
        self.assertEqual(stats["bridge_merges"], 1)

    def test_validation_and_billion_boundaries(self) -> None:
        with self.assertRaises(ValueError):
            self.index.add_package(-1)
        with self.assertRaises(ValueError):
            self.index.add_package(MAX_PACKAGE_ID + 1)
        with self.assertRaises(TypeError):
            self.index.add_package(True)  # type: ignore[arg-type]
        with self.assertRaises(TypeError):
            self.index.add_package("100")  # type: ignore[arg-type]

        # Zero and 1,000,000,000 must work cleanly
        self.assertEqual(self.index.add_package(0), "CREATE_NEW")
        self.assertEqual(self.index.add_package(MAX_PACKAGE_ID), "CREATE_NEW")
        self.assertEqual(
            self.index.get_missing_ranges(0, MAX_PACKAGE_ID),
            [(1, MAX_PACKAGE_ID - 1)],
        )

    def test_bounded_missing_ranges_edge_cases(self) -> None:
        # Empty index returns full query span
        self.assertEqual(self.index.get_missing_ranges(0, 1_000_000_000), [(0, 1_000_000_000)])

        for pid in [5, 6, 7, 10, 11, 15]:
            self.index.add_package(pid)

        # Partial overlaps on both query ends + internal gaps
        self.assertEqual(
            self.index.get_missing_ranges(6, 16),
            [(8, 9), (12, 14), (16, 16)],
        )
        # Fully covered sub-range
        self.assertEqual(self.index.get_missing_ranges(5, 7), [])
        # Single-point missing range
        self.assertEqual(self.index.get_missing_ranges(8, 8), [(8, 8)])
        # Invalid query bounds
        with self.assertRaises(ValueError):
            self.index.get_missing_ranges(20, 10)

    def test_reset_index(self) -> None:
        self.index.add_package(42)
        self.index.reset_index()
        self.assertEqual(self.index.get_intervals(), [])
        self.assertEqual(self.index.get_statistics()["unique_count"], 0)
        self.assertEqual(self.index.get_statistics()["interval_count"], 0)

    def test_50000_unique_ids_scale_and_invariants(self) -> None:
        rng = random.Random(42)
        # 50,000 unique IDs scattered up to 1,000,000,000
        unique_ids = rng.sample(range(0, MAX_PACKAGE_ID + 1), 50_000)

        t0 = time.perf_counter()
        for pid in unique_ids:
            self.index.add_package(pid)
        elapsed_insert = time.perf_counter() - t0

        # Duplicate still allowed at capacity; 50,001st unique ID rejected
        self.assertEqual(self.index.add_package(unique_ids[0]), "DUPLICATE_IGNORED")
        with self.assertRaises(OverflowError):
            # Pick an ID guaranteed not in unique_ids
            candidate = 0
            unique_set = set(unique_ids)
            while candidate in unique_set:
                candidate += 1
            self.index.add_package(candidate)

        intervals = self.index.get_intervals()
        total_covered = sum(end - start + 1 for start, end in intervals)
        self.assertEqual(total_covered, 50_000)

        # Verify strictly sorted, non-overlapping, and non-adjacent invariants
        for i in range(1, len(intervals)):
            self.assertLess(intervals[i - 1][1] + 1, intervals[i][0])

        q0 = time.perf_counter()
        missing = self.index.get_missing_ranges(0, MAX_PACKAGE_ID)
        elapsed_query = time.perf_counter() - q0

        total_missing = sum(end - start + 1 for start, end in missing)
        self.assertEqual(total_missing + total_covered, MAX_PACKAGE_ID + 1)

        # Should easily complete in well under 1 second
        self.assertLess(elapsed_insert, 2.0)
        self.assertLess(elapsed_query, 0.5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
