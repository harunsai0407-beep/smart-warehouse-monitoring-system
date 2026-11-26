# 📦 PackRange – Live Arrival Index

**Every package counted. Every missing range identified.**

PackRange is a smart warehouse package-tracking system designed to efficiently manage package IDs arriving in random order. It maintains sorted, non-overlapping intervals of received package IDs, automatically merges consecutive ranges, detects duplicate arrivals, and identifies missing package ranges.

## 🚀 Problem Statement

In a warehouse, packages may arrive in any order. Tracking every individual package ID using a large array becomes inefficient when IDs can reach 1 billion.

PackRange solves this problem using **ordered interval indexing**, storing continuous ranges instead of tracking every possible ID individually.

## ✨ Key Features

- **Live Package Tracking:** Add package IDs as they arrive.
- **Automatic Interval Merging:** Merge consecutive package ID ranges.
- **Duplicate Detection:** Ignore package IDs that have already been received.
- **Missing Range Detection:** Identify missing package IDs within a specified range.
- **Large ID Support:** Handle package IDs up to 1 billion.
- **Efficient Storage:** Store intervals instead of allocating an enormous array.
- **Demonstration Mode:** Showcase interval merging, duplicate handling, and large package IDs.
- **Performance Testing:** Test the system with up to 50,000 unique package IDs.

## 🧠 How It Works

PackRange maintains package IDs as sorted, non-overlapping intervals.

For example, consider the following package arrivals:

`1, 3, 7, 2, 6`

The interval index changes as follows:

| Package Arrives | Current Intervals |
|---|---|
| 1 | [1, 1] |
| 3 | [1, 1], [3, 3] |
| 7 | [1, 1], [3, 3], [7, 7] |
| 2 | [1, 3], [7, 7] |
| 6 | [1, 3], [6, 7] |

Final result:

**Received intervals:** `[[1, 3], [6, 7]]`

