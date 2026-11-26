from __future__ import annotations

import random
import re
import time
from typing import Any, Dict, List

from flask import Flask, jsonify, render_template, request

from interval_index import LiveArrivalIndex, MAX_PACKAGE_ID, validate_package_id

app = Flask(__name__)
arrival_index = LiveArrivalIndex()


def seed_guided_demo() -> Dict[str, Any]:
    arrival_index.reset()
    demo_ids = [
        100, 101, 102,
        104, 105, 106,
        103,          # Bridge merge: [100,102] + 103 + [104,106] -> [100,106]
        105,          # Duplicate detection inside [100,106]
        110, 111, 112,
        115, 116,
        120,
        999_999_997, 999_999_999,
        999_999_998,  # Bridge merge near 1,000,000,000
    ]
    last_step = None
    for pkg_id in demo_ids:
        last_step = arrival_index.insert(pkg_id)
    return {"mode": "guided", "lastStep": last_step}


# Pre-populate realistic sample state on startup
seed_guided_demo()


@app.get("/")
def home() -> str:
    return render_template("index.html")


@app.post("/api/arrivals")
def post_arrivals():
    body = request.get_json(silent=True) or {}
    candidates: List[Any] = []

    if body.get("id") not in (None, ""):
        candidates = [body["id"]]
    elif isinstance(body.get("ids"), list):
        candidates = body["ids"]
    elif isinstance(body.get("raw"), str):
        candidates = [tok for tok in re.split(r"[\s,;]+", body["raw"].strip()) if tok]
    else:
        return jsonify({"error": 'Provide "id", "ids", or "raw" package IDs.'}), 400

    if not candidates:
        return jsonify({"error": "At least one nonnegative integer package ID is required."}), 400

    try:
        validated = [validate_package_id(item) for item in candidates]
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    results = []
    last_step = None
    inserted_count = 0
    duplicate_count = 0

    try:
        for pkg_id in validated:
            step = arrival_index.insert(pkg_id)
            last_step = step
            if step["accepted"]:
                inserted_count += 1
            else:
                duplicate_count += 1
            if len(results) < 50:
                results.append(step)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({
        "processed": len(validated),
        "insertedCount": inserted_count,
        "duplicateCount": duplicate_count,
        "lastStep": last_step,
        "results": results,
        "stats": arrival_index.get_stats(),
        "history": arrival_index.get_history(50),
    })


@app.get("/api/intervals")
def get_intervals():
    try:
        offset = max(0, int(request.args.get("offset", 0)))
        limit = min(500, max(1, int(request.args.get("limit", 50))))
    except ValueError:
        return jsonify({"error": "offset and limit must be integers."}), 400

    raw_l = request.args.get("l") or request.args.get("L")
    raw_r = request.args.get("r") or request.args.get("R")

    if raw_l is not None and raw_r is not None:
        try:
            left = validate_package_id(raw_l)
            right = validate_package_id(raw_r)
            if left > right:
                raise ValueError("Lower bound L must be <= upper bound R.")
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

        overlapping = arrival_index.get_overlapping_intervals(left, right, limit)
        stats = arrival_index.get_stats()
        return jsonify({
            "intervals": overlapping,
            "totalIntervals": stats["intervalCount"],
            "overlappingCount": len(overlapping),
            "offset": 0,
            "limit": limit,
        })

    items, total = arrival_index.get_intervals(offset, limit)
    return jsonify({
        "intervals": items,
        "totalIntervals": total,
        "offset": offset,
        "limit": limit,
    })


@app.get("/api/missing")
def get_missing():
    raw_l = request.args.get("l") or request.args.get("L") or "0"
    raw_r = request.args.get("r") or request.args.get("R") or str(MAX_PACKAGE_ID)
    try:
        limit = min(1000, max(1, int(request.args.get("limit", 250))))
        result = arrival_index.query_missing(raw_l, raw_r, max_ranges=limit)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify(result)


@app.get("/api/stats")
def get_stats():
    return jsonify({
        "stats": arrival_index.get_stats(),
        "history": arrival_index.get_history(60),
    })


@app.post("/api/reset")
def post_reset():
    arrival_index.reset()
    return jsonify({
        "reset": True,
        "stats": arrival_index.get_stats(),
        "history": [],
    })


@app.post("/api/demo")
def post_demo():
    body = request.get_json(silent=True) or {}
    mode = str(body.get("mode", "guided"))

    if mode in ("stress_5k", "stress_50k"):
        target = 50_000 if mode == "stress_50k" else 5_000
        arrival_index.reset()
        t0 = time.perf_counter()
        for i in range(target):
            if i % 6 == 0:
                pkg_id = random.randint(0, MAX_PACKAGE_ID)
            else:
                pkg_id = 100_000 + random.randint(0, int(target * 1.4))
            arrival_index.insert(pkg_id)
        elapsed_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        return jsonify({
            "mode": mode,
            "elapsedMs": elapsed_ms,
            "stats": arrival_index.get_stats(),
            "history": arrival_index.get_history(40),
        })

    if mode == "bridge_demo":
        stats = arrival_index.get_stats()
        base = min(MAX_PACKAGE_ID - 10, (stats["maxId"] or 200) + 5)
        arrival_index.insert(base)
        arrival_index.insert(base + 2)
        merge_step = arrival_index.insert(base + 1)
        return jsonify({
            "mode": mode,
            "lastStep": merge_step,
            "stats": arrival_index.get_stats(),
            "history": arrival_index.get_history(40),
        })

    seeded = seed_guided_demo()
    return jsonify({
        "mode": seeded["mode"],
        "lastStep": seeded["lastStep"],
        "stats": arrival_index.get_stats(),
        "history": arrival_index.get_history(40),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
