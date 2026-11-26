const MAX_PACKAGE_ID = 1_000_000_000;
const PAGE_SIZE = 20;

const state = {
  stats: null,
  intervals: [],
  totalIntervals: 0,
  intervalPage: 0,
  missing: null,
  history: [],
  queryL: 95,
  queryR: 130,
  viewMode: "query",
  activeTab: "intervals",
};

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}

function showError(msg) {
  const banner = document.getElementById("errorBanner");
  if (!msg) {
    banner.textContent = "";
    banner.classList.add("hidden");
    return;
  }
  banner.textContent = msg;
  banner.classList.remove("hidden");
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function refreshAll() {
  showError(null);
  const [statsRes, ivRes, missRes] = await Promise.all([
    apiJson("/api/stats"),
    apiJson(`/api/intervals?offset=${state.intervalPage * PAGE_SIZE}&limit=${PAGE_SIZE}`),
    apiJson(`/api/missing?l=${state.queryL}&r=${state.queryR}&limit=250`),
  ]);

  state.stats = statsRes.stats;
  state.history = statsRes.history || [];
  state.intervals = ivRes.intervals || [];
  state.totalIntervals = ivRes.totalIntervals || 0;
  state.missing = missRes;

  renderStats();
  renderNumberLine();
  renderIntervalsTable();
  renderMissingTable();
  renderHistoryTable();
  renderQuickButtons();
  renderLatestDecision();
}

function renderStats() {
  const s = state.stats;
  if (!s) return;
  document.getElementById("statUnique").textContent = fmt(s.uniqueCount);
  document.getElementById("statIntervals").textContent = fmt(s.intervalCount);
  document.getElementById("statDuplicates").textContent = fmt(s.duplicateCount);
  document.getElementById("statScans").textContent = `${fmt(s.totalScans)} scans`;
  document.getElementById("statMerges").textContent = fmt(s.bridgeMergeCount);
  document.getElementById("statCompression").textContent = `${Number(s.compressionRatio).toFixed(1)}x`;
  document.getElementById("totalStoredLabel").textContent = `Stored intervals: ${fmt(s.intervalCount)}`;
  document.getElementById("activeBoundsLabel").textContent =
    s.minId !== null && s.maxId !== null
      ? `Active Range: [${fmt(s.minId)} .. ${fmt(s.maxId)}]`
      : "Active Range: Empty";
}

function renderNumberLine() {
  const svg = document.getElementById("numberLineSvg");
  const s = state.stats;
  let viewL = state.queryL;
  let viewR = state.queryR;
  if (state.viewMode === "active" && s && s.minId !== null && s.maxId !== null) {
    viewL = s.minId;
    viewR = Math.max(s.minId, s.maxId);
  }
  const span = Math.max(1, viewR - viewL + 1);
  document.getElementById("numberLineMeta").textContent = `Window [${fmt(viewL)} .. ${fmt(viewR)}] · Span ${fmt(span)} IDs`;

  const svgParts = [
    `<defs>
      <pattern id="flaskMissingHatch" width="8" height="8" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
        <rect width="8" height="8" fill="#1E1B12"></rect>
        <line x1="0" y1="0" x2="0" y2="8" stroke="#F59E0B" stroke-width="2" stroke-opacity="0.45"></line>
      </pattern>
    </defs>`,
    `<rect x="0" y="14" width="1000" height="34" rx="4" fill="#070D19" stroke="#1E2E4A" stroke-width="1"></rect>`,
  ];

  const missingList = (state.missing?.missingRanges || []).slice(0, 160);
  for (const gap of missingList) {
    if (gap.end < viewL || gap.start > viewR) continue;
    const gs = Math.max(viewL, gap.start);
    const ge = Math.min(viewR, gap.end);
    const x = ((gs - viewL) / span) * 1000;
    const w = Math.max(3, ((ge - gs + 1) / span) * 1000);
    svgParts.push(
      `<rect x="${x}" y="15" width="${Math.min(1000 - x, w)}" height="32" fill="url(#flaskMissingHatch)" class="gap-bar" data-start="${gs}" data-end="${ge}" style="cursor:pointer"></rect>`
    );
  }

  for (const iv of state.intervals) {
    if (iv.end < viewL || iv.start > viewR) continue;
    const cs = Math.max(viewL, iv.start);
    const ce = Math.min(viewR, iv.end);
    const x = ((cs - viewL) / span) * 1000;
    const w = Math.max(4, ((ce - cs + 1) / span) * 1000);
    svgParts.push(
      `<rect x="${x}" y="14" width="${Math.min(1000 - x, w)}" height="34" rx="2" fill="#10B981" class="iv-bar" data-start="${iv.start}" data-end="${iv.end}"></rect>`
    );
  }

  for (let i = 0; i <= 5; i++) {
    const val = Math.round(viewL + ((viewR - viewL) * i) / 5);
    const x = (i / 5) * 1000;
    const anchor = i === 0 ? "start" : i === 5 ? "end" : "middle";
    svgParts.push(
      `<g transform="translate(${x}, 48)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#334155" stroke-width="1"></line>
        <text x="0" y="20" text-anchor="${anchor}" fill="#94A3B8" font-size="11" font-family="JetBrains Mono, monospace">${fmt(val)}</text>
      </g>`
    );
  }

  svg.innerHTML = svgParts.join("");

  svg.querySelectorAll(".gap-bar").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const start = Number(el.dataset.start);
      const end = Number(el.dataset.end);
      document.getElementById("hoverInspector").textContent =
        `Missing Gap [${fmt(start)} – ${fmt(end)}] · ${fmt(end - start + 1)} ID(s) · Click to scan ${fmt(start)}`;
    });
    el.addEventListener("click", () => scanSingle(Number(el.dataset.start)));
  });

  svg.querySelectorAll(".iv-bar").forEach((el) => {
    el.addEventListener("mouseenter", () => {
      const start = Number(el.dataset.start);
      const end = Number(el.dataset.end);
      document.getElementById("hoverInspector").textContent =
        `Present Interval [${fmt(start)} – ${fmt(end)}] · ${fmt(end - start + 1)} consecutive ID(s)`;
    });
  });
}

function renderIntervalsTable() {
  const tbody = document.getElementById("intervalsBody");
  if (state.intervals.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:2rem;">No intervals recorded yet. Scan an ID or run Guided Demo.</td></tr>`;
  } else {
    tbody.innerHTML = state.intervals
      .map((iv, idx) => {
        const rank = state.intervalPage * PAGE_SIZE + idx + 1;
        const nextIv = state.intervals[idx + 1];
        const gap = nextIv ? `${fmt(nextIv.start - iv.end - 1)} missing` : "—";
        const ext = iv.end < MAX_PACKAGE_ID ? `<button type="button" class="btn btn-ghost scan-ext-btn" data-id="${iv.end + 1}">+ Scan ${fmt(iv.end + 1)}</button>` : "";
        return `<tr>
          <td class="mono">${rank}</td>
          <td class="mono accent-green">[${fmt(iv.start)}, ${fmt(iv.end)}]</td>
          <td class="right mono">${fmt(iv.end - iv.start + 1)}</td>
          <td class="right mono accent-amber">${gap}</td>
          <td class="right">${ext}</td>
        </tr>`;
      })
      .join("");

    tbody.querySelectorAll(".scan-ext-btn").forEach((btn) => {
      btn.addEventListener("click", () => scanSingle(Number(btn.dataset.id)));
    });
  }

  const totalPages = Math.max(1, Math.ceil(state.totalIntervals / PAGE_SIZE));
  document.getElementById("intervalsPageInfo").textContent =
    state.totalIntervals === 0
      ? "0 intervals"
      : `Page ${state.intervalPage + 1} / ${totalPages} (${fmt(state.totalIntervals)} total)`;
  document.getElementById("prevPageBtn").disabled = state.intervalPage === 0;
  document.getElementById("nextPageBtn").disabled = state.intervalPage >= totalPages - 1;
}

function renderMissingTable() {
  const m = state.missing;
  const tbody = document.getElementById("missingBody");
  if (!m) return;

  const span = m.queryR - m.queryL + 1;
  const cov = span > 0 ? ((m.presentCount / span) * 100).toFixed(2) : "0.00";
  document.getElementById("missingStatsText").textContent =
    `Missing IDs: ${fmt(m.missingCount)} | Coverage: ${cov}% | ${m.elapsedMs} ms (${m.scannedIntervals} intervals scanned)`;

  if (!m.missingRanges || m.missingRanges.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#34d399;padding:2rem;">Zero missing IDs in [${fmt(m.queryL)}, ${fmt(m.queryR)}].</td></tr>`;
    return;
  }

  tbody.innerHTML = m.missingRanges
    .slice(0, 50)
    .map((gap, idx) => {
      const label = gap.start === gap.end ? fmt(gap.start) : `${fmt(gap.start)}–${fmt(gap.end)}`;
      return `<tr>
        <td class="mono">${idx + 1}</td>
        <td class="mono accent-amber">${label}</td>
        <td class="right mono">${fmt(gap.end - gap.start + 1)}</td>
        <td class="right"><button type="button" class="btn btn-ghost fill-gap-btn" data-id="${gap.start}">+ Scan ${fmt(gap.start)}</button></td>
      </tr>`;
    })
    .join("");

  tbody.querySelectorAll(".fill-gap-btn").forEach((btn) => {
    btn.addEventListener("click", () => scanSingle(Number(btn.dataset.id)));
  });
}

function renderHistoryTable() {
  const tbody = document.getElementById("historyBody");
  if (state.history.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:2rem;">No arrival scans yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.history
    .map((ev) => {
      const cls = ev.caseId === "DUPLICATE" ? "accent-amber" : ev.caseId === "BRIDGE_MERGE" ? "accent-green" : "";
      const delta = ev.intervalDelta > 0 ? `+${ev.intervalDelta}` : `${ev.intervalDelta}`;
      return `<tr>
        <td class="mono">${fmt(ev.id)}</td>
        <td class="${cls}">${ev.caseLabel}</td>
        <td class="mono">[${fmt(ev.resultingInterval.start)}, ${fmt(ev.resultingInterval.end)}]</td>
        <td class="right mono">${delta}</td>
      </tr>`;
    })
    .join("");
}

function renderQuickButtons() {
  const extendBtn = document.getElementById("quickExtendBtn");
  const bridgeBtn = document.getElementById("quickBridgeBtn");
  const dupBtn = document.getElementById("quickDuplicateBtn");

  const nextExtend = state.intervals.length > 0 ? Math.min(MAX_PACKAGE_ID, state.intervals[0].end + 1) : 100;
  extendBtn.textContent = `Extend (+${fmt(nextExtend)})`;
  extendBtn.dataset.id = String(nextExtend);

  let bridgeId = null;
  for (let i = 0; i < state.intervals.length - 1; i++) {
    if (state.intervals[i].end + 2 === state.intervals[i + 1].start) {
      bridgeId = state.intervals[i].end + 1;
      break;
    }
  }
  bridgeBtn.disabled = bridgeId === null;
  bridgeBtn.textContent = bridgeId !== null ? `Bridge (${fmt(bridgeId)})` : "No 1-Gap Bridge";
  bridgeBtn.dataset.id = bridgeId !== null ? String(bridgeId) : "";

  const dupId = state.intervals.length > 0 ? state.intervals[0].start : null;
  dupBtn.disabled = dupId === null;
  dupBtn.textContent = dupId !== null ? `Duplicate (${fmt(dupId)})` : "No Duplicate";
  dupBtn.dataset.id = dupId !== null ? String(dupId) : "";
}

function renderLatestDecision() {
  const box = document.getElementById("latestDecision");
  const latest = state.history[0];
  if (!latest) {
    box.textContent = "Awaiting arrival scan.";
    return;
  }
  box.innerHTML = `<strong class="${latest.caseId === "BRIDGE_MERGE" ? "accent-green" : latest.caseId === "DUPLICATE" ? "accent-amber" : ""}">${latest.caseLabel}</strong> · ID <span class="mono">${fmt(latest.id)}</span><br/>${latest.explanation}`;
}

async function scanSingle(id) {
  try {
    await apiJson("/api/arrivals", { method: "POST", body: JSON.stringify({ id }) });
    await refreshAll();
  } catch (err) {
    showError(err.message);
  }
}

async function runDemo(mode) {
  try {
    const res = await apiJson("/api/demo", { method: "POST", body: JSON.stringify({ mode }) });
    state.intervalPage = 0;
    if (mode === "guided") {
      state.queryL = 95;
      state.queryR = 130;
    } else {
      state.queryL = 0;
      state.queryR = res.stats?.maxId ?? 130;
    }
    document.getElementById("queryLInput").value = String(state.queryL);
    document.getElementById("queryRInput").value = String(state.queryR);
    await refreshAll();
  } catch (err) {
    showError(err.message);
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  document.getElementById("panelIntervals").classList.toggle("hidden", tab !== "intervals");
  document.getElementById("panelMissing").classList.toggle("hidden", tab !== "missing");
  document.getElementById("panelHistory").classList.toggle("hidden", tab !== "history");
  document.getElementById("tabIntervals").classList.toggle("active", tab === "intervals");
  document.getElementById("tabMissing").classList.toggle("active", tab === "missing");
  document.getElementById("tabHistory").classList.toggle("active", tab === "history");
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("singleScanForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = document.getElementById("singleIdInput").value.trim();
    if (!raw) return showError("Enter a nonnegative integer package ID.");
    await scanSingle(raw);
    document.getElementById("singleIdInput").value = "";
  });

  document.getElementById("batchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const raw = document.getElementById("batchInput").value;
    try {
      await apiJson("/api/arrivals", { method: "POST", body: JSON.stringify({ raw }) });
      document.getElementById("batchInput").value = "";
      state.intervalPage = 0;
      await refreshAll();
    } catch (err) {
      showError(err.message);
    }
  });

  document.getElementById("missingQueryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const l = Number(document.getElementById("queryLInput").value.replace(/,/g, ""));
    const r = Number(document.getElementById("queryRInput").value.replace(/,/g, ""));
    if (!Number.isInteger(l) || !Number.isInteger(r) || l < 0 || r > MAX_PACKAGE_ID || l > r) {
      return showError("Enter valid integer bounds 0 <= L <= R <= 1,000,000,000.");
    }
    state.queryL = l;
    state.queryR = r;
    await refreshAll();
    switchTab("missing");
  });

  document.getElementById("toggleBatchBtn").addEventListener("click", () => {
    document.getElementById("batchForm").classList.toggle("hidden");
  });

  document.getElementById("quickExtendBtn").addEventListener("click", (e) => {
    scanSingle(Number(e.currentTarget.dataset.id));
  });
  document.getElementById("quickBridgeBtn").addEventListener("click", (e) => {
    if (e.currentTarget.dataset.id) scanSingle(Number(e.currentTarget.dataset.id));
  });
  document.getElementById("quickDuplicateBtn").addEventListener("click", (e) => {
    if (e.currentTarget.dataset.id) scanSingle(Number(e.currentTarget.dataset.id));
  });
  document.getElementById("quickRandomBtn").addEventListener("click", () => {
    scanSingle(Math.floor(Math.random() * (MAX_PACKAGE_ID + 1)));
  });

  document.getElementById("resetBtn").addEventListener("click", async () => {
    await apiJson("/api/reset", { method: "POST" });
    state.intervalPage = 0;
    await refreshAll();
  });

  document.getElementById("topDemoBtn").addEventListener("click", () => runDemo("guided"));
  document.getElementById("demoGuidedBtn").addEventListener("click", () => runDemo("guided"));
  document.getElementById("demoBridgeBtn").addEventListener("click", () => runDemo("bridge_demo"));
  document.getElementById("demo5kBtn").addEventListener("click", () => runDemo("stress_5k"));
  document.getElementById("demo50kBtn").addEventListener("click", () => runDemo("stress_50k"));

  document.getElementById("presetSmallBtn").addEventListener("click", async () => {
    state.queryL = 95;
    state.queryR = 130;
    document.getElementById("queryLInput").value = "95";
    document.getElementById("queryRInput").value = "130";
    await refreshAll();
  });
  document.getElementById("presetActiveBtn").addEventListener("click", async () => {
    if (state.stats?.minId === null) return;
    state.queryL = state.stats.minId;
    state.queryR = state.stats.maxId;
    document.getElementById("queryLInput").value = String(state.queryL);
    document.getElementById("queryRInput").value = String(state.queryR);
    await refreshAll();
  });
  document.getElementById("presetFullBtn").addEventListener("click", async () => {
    state.queryL = 0;
    state.queryR = MAX_PACKAGE_ID;
    document.getElementById("queryLInput").value = "0";
    document.getElementById("queryRInput").value = String(MAX_PACKAGE_ID);
    await refreshAll();
  });

  document.getElementById("tabIntervals").addEventListener("click", () => switchTab("intervals"));
  document.getElementById("tabMissing").addEventListener("click", () => switchTab("missing"));
  document.getElementById("tabHistory").addEventListener("click", () => switchTab("history"));

  document.getElementById("modeQueryBtn").addEventListener("click", () => {
    state.viewMode = "query";
    document.getElementById("modeQueryBtn").classList.add("active");
    document.getElementById("modeActiveBtn").classList.remove("active");
    renderNumberLine();
  });
  document.getElementById("modeActiveBtn").addEventListener("click", () => {
    state.viewMode = "active";
    document.getElementById("modeActiveBtn").classList.add("active");
    document.getElementById("modeQueryBtn").classList.remove("active");
    renderNumberLine();
  });

  document.getElementById("prevPageBtn").addEventListener("click", async () => {
    if (state.intervalPage > 0) {
      state.intervalPage -= 1;
      await refreshAll();
    }
  });
  document.getElementById("nextPageBtn").addEventListener("click", async () => {
    state.intervalPage += 1;
    await refreshAll();
  });

  document.getElementById("copyMissingBtn").addEventListener("click", async () => {
    if (!state.missing) return;
    const list = state.missing.missingRanges.map((g) => (g.start === g.end ? `${g.start}` : `${g.start}-${g.end}`)).join(", ");
    await navigator.clipboard.writeText(`Missing [${state.missing.queryL}, ${state.missing.queryR}]: ${list || "None"}`);
  });

  document.getElementById("exportMissingBtn").addEventListener("click", () => {
    if (!state.missing) return;
    const blob = new Blob([JSON.stringify(state.missing, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `missing-${state.missing.queryL}-${state.missing.queryR}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  refreshAll().catch((err) => showError(err.message));
});
