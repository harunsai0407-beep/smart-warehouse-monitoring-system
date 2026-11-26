export interface TeamRole {
  role: string;
  student: string;
  focus: string;
  deliverables: string[];
}

export interface HourBlock {
  window: string;
  title: string;
  goal: string;
  tasks: { owner: string; task: string }[];
  checkpoint: string;
}

export interface ComplexityRow {
  operation: string;
  naiveArray: string;
  hashSetOnly: string;
  intervalAvl: string;
  notes: string;
}

export const PROBLEM_BRIEF = {
  title: "The Warehouse's Broken Number Ranges",
  context:
    'A regional fulfillment hub scans incoming parcels in real time. Each package carries a nonnegative integer ID between 0 and 1,000,000,000, and up to 50,000 unique IDs arrive per shift in arbitrary, out-of-order sequences with occasional duplicate scans.',
  whyNaiveFails: [
    'Allocating a boolean/bitset array up to 1,000,000,000 requires ~125 MB (bitset) to 1 GB (byte array) per shift, wasting 99.99% of RAM for 50,000 packages.',
    'Storing IDs in an unsorted list or HashSet makes bounded missing-range queries [L, R] scan up to (R - L + 1) integers or sort 50,000 IDs repeatedly.',
    'Supervisors need instant answers to "Which manifests are missing between ID 10,400,000 and 10,450,000?" without freezing the scanner UI.',
  ],
  proposedSolution:
    'Maintain a Live Arrival Index of sorted, non-overlapping, maximally merged closed intervals [start, end] inside a self-balancing Binary Search Tree (AVL Tree / TreeMap) keyed by interval start.',
  coreInvariants: [
    'Sorted: For any two consecutive intervals i and i+1, interval[i].start < interval[i+1].start.',
    'Non-overlapping & Maximally Merged: interval[i].end + 1 < interval[i+1].start (at least one missing ID between any two stored intervals).',
    'Space Proportional to Gaps: At most K <= N <= 50,000 interval nodes are stored in memory regardless of whether IDs reach 1,000,000,000.',
  ],
};

export const FOUR_INSERTION_CASES = [
  {
    caseNumber: 1,
    name: 'Duplicate / Already Covered',
    condition: 'prev !== null && prev.start <= id && id <= prev.end',
    action: 'Ignore insertion (increment duplicate counter only).',
    intervalDelta: '0 intervals',
    exampleBefore: '[100, 105], [110, 112]',
    exampleInput: '103',
    exampleAfter: '[100, 105], [110, 112]',
    complexity: 'O(log K)',
  },
  {
    caseNumber: 2,
    name: 'Standalone New Interval',
    condition: '(prev === null || prev.end + 1 < id) && (next === null || id + 1 < next.start)',
    action: 'Insert a new single-element interval [id, id].',
    intervalDelta: '+1 interval',
    exampleBefore: '[100, 105], [110, 112]',
    exampleInput: '107',
    exampleAfter: '[100, 105], [107, 107], [110, 112]',
    complexity: 'O(log K)',
  },
  {
    caseNumber: 3,
    name: 'Extend Adjacent Interval (Left or Right)',
    condition: 'prev.end + 1 === id (extend left) OR id + 1 === next.start (extend right)',
    action: 'Update prev.end = id OR update next.start = id in-place (preserves BST order).',
    intervalDelta: '0 intervals',
    exampleBefore: '[100, 105], [110, 112]',
    exampleInput: '106 (or 109)',
    exampleAfter: '[100, 106], [110, 112]',
    complexity: 'O(log K)',
  },
  {
    caseNumber: 4,
    name: 'Bridge & Merge Two Intervals',
    condition: 'prev.end + 1 === id && id + 1 === next.start',
    action: 'Set prev.end = next.end and delete next from the balanced tree.',
    intervalDelta: '-1 interval',
    exampleBefore: '[100, 105], [107, 112]',
    exampleInput: '106',
    exampleAfter: '[100, 112]',
    complexity: 'O(log K)',
  },
];

export const COMPLEXITY_TABLE: ComplexityRow[] = [
  {
    operation: 'Insert Package ID (up to 10^9)',
    naiveArray: 'O(1) write, O(U) init',
    hashSetOnly: 'O(1) avg',
    intervalAvl: 'O(log K) worst-case',
    notes: 'K <= N <= 50,000; AVL height <= 22 even under adversarial gaps.',
  },
  {
    operation: 'Ignore Duplicate Scan',
    naiveArray: 'O(1)',
    hashSetOnly: 'O(1) avg',
    intervalAvl: 'O(log K)',
    notes: 'Single floor(id) lookup checks prev.start <= id <= prev.end.',
  },
  {
    operation: 'Bounded Missing Query [L, R]',
    naiveArray: 'O(R - L + 1)',
    hashSetOnly: 'O(min(R - L, N log N))',
    intervalAvl: 'O(log K + M)',
    notes: 'M = overlapping intervals in [L, R]; [0, 10^9] runs in microseconds.',
  },
  {
    operation: 'Memory Footprint (N = 50,000)',
    naiveArray: 'O(U) ~ 125 MB - 1 GB',
    hashSetOnly: 'O(N) ~ 2-4 MB',
    intervalAvl: 'O(K) <= 50k nodes',
    notes: 'Contiguous runs compress thousands of IDs into a single [s, e] node.',
  },
];

export const ARCHITECTURE_LAYERS = [
  {
    layer: '1. Ingestion & Validation',
    responsibility: 'Parses single scans or bulk manifest drops, rejects negative, non-integer, or > 1,000,000,000 IDs before touching state.',
    module: 'validatePackageId() + Batch Parser',
  },
  {
    layer: '2. AVL Interval Index Engine',
    responsibility: 'Maintains sorted disjoint intervals [start, end] with subtree sizes and heights. Executes the 4 insertion cases in O(log K).',
    module: 'src/engine/IntervalIndex.ts',
  },
  {
    layer: '3. Bounded Missing-Range Query Engine',
    responsibility: 'Pruned in-order traversal over [L, R] using a moving cursor to emit exact missing intervals without array allocation.',
    module: 'queryMissing(L, R)',
  },
  {
    layer: '4. Interactive Workbench & Stress Lab',
    responsibility: 'Proportional SVG number-line visualization, paginated interval ledger, 4-case step inspector, and 50,000-ID benchmark runner.',
    module: 'React + TypeScript UI',
  },
];

export const TECH_STACK = [
  {
    category: 'Core Algorithm',
    choice: 'TypeScript AVL Interval Tree',
    why: 'Strict O(log K) worst-case guarantees even on 50,000 alternating odd/even IDs, plus zero external dependencies.',
  },
  {
    category: 'Frontend UI',
    choice: 'React 19 + Vite + Tailwind CSS',
    why: 'Instant hot reload for beginners, clean state updates, and crisp tabular-nums data grids.',
  },
  {
    category: 'Visualization',
    choice: 'Native Responsive SVG Number Line',
    why: 'Renders intervals up to 1,000,000,000 cleanly by normalizing coordinates to the active viewport window.',
  },
  {
    category: 'Optional Backend Persistence',
    choice: 'Node + Express REST API',
    why: 'Cleanly wraps index.insert() and index.queryMissing() if the team wants multi-scanner persistence.',
  },
];

export const TEAM_ROLES: TeamRole[] = [
  {
    role: 'Role A — DSA & Core Engine Lead',
    student: 'Student 1',
    focus: 'Interval data structure, 4 insertion cases, and edge-case unit tests.',
    deliverables: ['IntervalIndex class', 'floor/ceil + merge logic', '10+ edge-case unit assertions'],
  },
  {
    role: 'Role B — Query & Benchmark Lead',
    student: 'Student 2',
    focus: 'Bounded missing-range query [L, R], validation, and 50k stress test script.',
    deliverables: ['queryMissing(L, R)', 'CSV/JSON export', '50,000-ID latency & invariant verifier'],
  },
  {
    role: 'Role C — Workbench & Number-Line UI',
    student: 'Student 3',
    focus: 'Scanner input controls, preset triggers, and proportional SVG interval bar.',
    deliverables: ['Package ID input + batch loader', 'SVG received/missing visualizer', 'Interval table'],
  },
  {
    role: 'Role D — Case Visualizer & Pitch Lead',
    student: 'Student 4',
    focus: 'Step-by-step 4-case educational explainer, architecture diagram, and 3-minute demo script.',
    deliverables: ['Interactive 4-case walkthrough', 'Missing-range query panel', 'Hackathon pitch & demo'],
  },
];

export const SIX_HOUR_PLAN: HourBlock[] = [
  {
    window: 'Hour 0:00 – 1:00',
    title: 'Alignment, Contract & Scaffolding',
    goal: 'Lock the TypeScript interfaces so all 4 students can code in parallel without blocking each other.',
    tasks: [
      { owner: 'Student 1 & 2', task: 'Agree on Interval { start, end }, insert(id), and queryMissing(L, R) function signatures.' },
      { owner: 'Student 3 & 4', task: 'Scaffold React + Tailwind layout with mock data matching those exact interfaces.' },
    ],
    checkpoint: 'App compiles locally and everybody runs the same repo branch.',
  },
  {
    window: 'Hour 1:00 – 2:30',
    title: 'Core Interval Engine & Naive Test Harness',
    goal: 'Build and verify all 4 insertion cases before connecting to the UI.',
    tasks: [
      { owner: 'Student 1', task: 'Implement sorted disjoint intervals (start with SortedArray + binary search, or AVL if comfortable) with the 4 cases.' },
      { owner: 'Student 2', task: 'Implement queryMissing(L, R) cursor sweep and write an automated test checking [0, 10^9] and boundary merges.' },
      { owner: 'Student 3 & 4', task: 'Build Package Scanner form, Query [L, R] form, and KPI metric cards.' },
    ],
    checkpoint: 'All 4 insertion cases pass unit checks for IDs 0, 10^9, duplicates, and bridge merges.',
  },
  {
    window: 'Hour 2:30 – 4:00',
    title: 'Integration & Visual Number Line',
    goal: 'Wire the live DSA engine into the React UI and render real intervals.',
    tasks: [
      { owner: 'Student 1 & 2', task: 'Upgrade engine to AVL Tree (if started with array) and build 50,000-ID benchmark runner.' },
      { owner: 'Student 3', task: 'Render proportional SVG number line showing solid received intervals vs hatched missing gaps.' },
      { owner: 'Student 4', task: 'Build the live Event Log showing which of the 4 cases each scan triggered.' },
    ],
    checkpoint: 'End-to-end live demo works: typing an ID updates the SVG bar, interval table, and missing query instantly.',
  },
  {
    window: 'Hour 4:00 – 5:00',
    title: '50k Scale Hardening & Edge Cases',
    goal: 'Stress-test performance, pagination, and input guardrails.',
    tasks: [
      { owner: 'Student 1 & 2', task: 'Run 50,000 adversarial alternating IDs + 1,000,000,000 boundary tests; verify < 100ms runtime.' },
      { owner: 'Student 3 & 4', task: 'Add pagination to the intervals table so 50k intervals never freeze the DOM.' },
    ],
    checkpoint: '50k stress test passes with zero invariant errors and smooth UI frame rate.',
  },
  {
    window: 'Hour 5:00 – 6:00',
    title: 'Case Explainer, Polish & Demo Rehearsal',
    goal: 'Freeze new features at 5:15, polish visual clarity, and rehearse the live pitch.',
    tasks: [
      { owner: 'Student 4', task: 'Prepare 3-minute live demo flow: Problem (1B array crash) -> 4 Cases -> Live Merge -> [L, R] Query -> 50k Benchmark.' },
      { owner: 'All', task: 'Verify zero console errors, responsive layout, and exportable missing-range report.' },
    ],
    checkpoint: 'Demo-ready production build verified cleanly.',
  },
];
