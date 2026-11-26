import unittest
from interval_index import LiveArrivalIndex, MAX_PACKAGE_ID


class TestLiveArrivalIndex(unittest.TestCase):
    def test_four_cases_and_boundaries(self) -> None:
        idx = LiveArrivalIndex()
        self.assertEqual(idx.insert(0)["caseId"], "NEW_STANDALONE")
        self.assertEqual(idx.insert(MAX_PACKAGE_ID)["caseId"], "NEW_STANDALONE")
        self.assertEqual(idx.insert(0)["caseId"], "DUPLICATE")
        self.assertEqual(idx.insert(1)["caseId"], "EXTEND_LEFT")
        self.assertEqual(idx.insert(3)["caseId"], "NEW_STANDALONE")
        self.assertEqual(idx.insert(2)["caseId"], "BRIDGE_MERGE")
        self.assertEqual(idx.insert(MAX_PACKAGE_ID - 1)["caseId"], "EXTEND_RIGHT")

        items, total = idx.get_intervals(0, 10)
        self.assertEqual(total, 2)
        self.assertEqual(items, [
            {"start": 0, "end": 3},
            {"start": MAX_PACKAGE_ID - 1, "end": MAX_PACKAGE_ID},
        ])

    def test_bounded_missing_query(self) -> None:
        idx = LiveArrivalIndex()
        for pkg_id in [10, 11, 12, 15, 16, 20]:
            idx.insert(pkg_id)

        res = idx.query_missing(9, 22)
        self.assertEqual(res["missingRanges"], [
            {"start": 9, "end": 9},
            {"start": 13, "end": 14},
            {"start": 17, "end": 19},
            {"start": 21, "end": 22},
        ])
        self.assertEqual(res["missingCount"], 8)
        self.assertEqual(res["presentCount"], 6)

    def test_50000_unique_ids_and_merge_collapse(self) -> None:
        idx = LiveArrivalIndex()
        for i in range(25_000):
            idx.insert(i * 2)
        self.assertEqual(idx.get_stats()["intervalCount"], 25_000)

        for i in range(24_999):
            idx.insert(i * 2 + 1)
        self.assertEqual(idx.get_stats()["intervalCount"], 1)
        self.assertEqual(idx.get_stats()["uniqueCount"], 49_999)


if __name__ == "__main__":
    unittest.main()
