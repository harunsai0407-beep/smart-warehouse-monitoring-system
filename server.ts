import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  IntervalIndex,
  MAX_PACKAGE_ID,
  TARGET_UNIQUE_CAPACITY,
  validatePackageId,
  type InsertionStepResult,
} from './src/engine/IntervalIndex.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const arrivalIndex = new IntervalIndex();

function seedGuidedDemo(): { steps: InsertionStepResult[]; mode: string } {
  arrivalIndex.clear();
  const demoIds = [
    100, 101, 102,
    104, 105, 106,
    103, // Bridge merge: [100,102] + 103 + [104,106] -> [100,106]
    105, // Duplicate detection inside [100,106]
    110, 111, 112,
    115, 116,
    120,
    999_999_997, 999_999_999,
    999_999_998, // Bridge merge near 1 billion
  ];

  const steps: InsertionStepResult[] = [];
  for (const id of demoIds) {
    steps.push(arrivalIndex.insert(id));
  }
  return { steps, mode: 'guided' };
}

// Seed initial realistic state on boot so dashboard opens populated
seedGuidedDemo();

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '5mb' }));

  // POST /api/arrivals -> Accepts { id } or { ids: [...] } or { raw: "100, 101" }
  app.post('/api/arrivals', (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      let candidates: Array<string | number> = [];

      if (body.id !== undefined && body.id !== null && body.id !== '') {
        candidates = [body.id];
      } else if (Array.isArray(body.ids)) {
        candidates = body.ids;
      } else if (typeof body.raw === 'string') {
        candidates = body.raw
          .split(/[\s,;]+/)
          .map((s: string) => s.trim())
          .filter(Boolean);
      } else {
        res.status(400).json({ error: 'Provide "id", "ids", or "raw" package IDs.' });
        return;
      }

      if (candidates.length === 0) {
        res.status(400).json({ error: 'At least one nonnegative integer package ID is required.' });
        return;
      }

      const validIds: number[] = [];
      for (const item of candidates) {
        const check = validatePackageId(item);
        if (!check.ok) {
          res.status(400).json({ error: check.error });
          return;
        }
        validIds.push(check.value);
      }

      // Atomic capacity check before mutating state on batches
      const currentUnique = arrivalIndex.getUniqueCount();
      if (currentUnique + validIds.length > TARGET_UNIQUE_CAPACITY) {
        const seenNew = new Set<number>();
        for (const id of validIds) {
          if (!arrivalIndex.contains(id)) {
            seenNew.add(id);
          }
        }
        if (currentUnique + seenNew.size > TARGET_UNIQUE_CAPACITY) {
          res.status(400).json({
            error: `Batch rejected: adding ${seenNew.size.toLocaleString('en-US')} new unique IDs would exceed the ${TARGET_UNIQUE_CAPACITY.toLocaleString('en-US')} unique package limit.`,
          });
          return;
        }
      }

      const results: InsertionStepResult[] = [];
      let lastStep: InsertionStepResult | null = null;
      let insertedCount = 0;
      let duplicateCount = 0;

      for (const id of validIds) {
        const step = arrivalIndex.insert(id);
        lastStep = step;
        if (step.accepted) insertedCount += 1;
        else duplicateCount += 1;
        if (results.length < 50) {
          results.push(step);
        }
      }

      res.status(200).json({
        processed: validIds.length,
        insertedCount,
        duplicateCount,
        lastStep,
        results,
        stats: arrivalIndex.getStats(),
        history: arrivalIndex.getHistory(50),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to process arrival.';
      res.status(400).json({ error: message });
    }
  });

  // GET /api/intervals?offset=0&limit=50
  app.get('/api/intervals', (req: Request, res: Response) => {
    const rawOffset = Number(req.query.offset ?? 0);
    const rawLimit = Number(req.query.limit ?? 50);
    const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;

    const lQuery = req.query.l ?? req.query.L;
    const rQuery = req.query.r ?? req.query.R;

    if (lQuery !== undefined && rQuery !== undefined) {
      const checkL = validatePackageId(String(lQuery));
      const checkR = validatePackageId(String(rQuery));
      if (!checkL.ok || !checkR.ok || checkL.value > checkR.value) {
        res.status(400).json({ error: 'Invalid filter range [L, R].' });
        return;
      }
      const overlapping = arrivalIndex.getOverlappingIntervals(checkL.value, checkR.value);
      res.json({
        intervals: overlapping.slice(0, limit),
        totalIntervals: arrivalIndex.getIntervalCount(),
        overlappingCount: overlapping.length,
        offset: 0,
        limit,
      });
      return;
    }

    const intervals = arrivalIndex.getIntervalSlice(offset, limit);
    res.json({
      intervals,
      totalIntervals: arrivalIndex.getIntervalCount(),
      offset,
      limit,
    });
  });

  // GET /api/missing?l=95&r=130&limit=200
  app.get('/api/missing', (req: Request, res: Response) => {
    const rawL = req.query.l ?? req.query.L ?? '0';
    const rawR = req.query.r ?? req.query.R ?? String(MAX_PACKAGE_ID);
    const rawLimit = Number(req.query.limit ?? 200);
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 200;

    const checkL = validatePackageId(String(rawL));
    if (!checkL.ok) {
      res.status(400).json({ error: `Lower bound L: ${checkL.error}` });
      return;
    }
    const checkR = validatePackageId(String(rawR));
    if (!checkR.ok) {
      res.status(400).json({ error: `Upper bound R: ${checkR.error}` });
      return;
    }
    if (checkL.value > checkR.value) {
      res.status(400).json({ error: 'Lower bound L must be <= upper bound R.' });
      return;
    }

    const result = arrivalIndex.queryMissing(checkL.value, checkR.value, limit);
    res.json(result);
  });

  // GET /api/stats
  app.get('/api/stats', (_req: Request, res: Response) => {
    res.json({
      stats: arrivalIndex.getStats(),
      history: arrivalIndex.getHistory(60),
    });
  });

  // POST /api/reset
  app.post('/api/reset', (_req: Request, res: Response) => {
    arrivalIndex.clear();
    res.json({
      reset: true,
      stats: arrivalIndex.getStats(),
      history: [],
    });
  });

  // POST /api/demo
  app.post('/api/demo', (req: Request, res: Response) => {
    const mode = String(req.body?.mode ?? 'guided');

    if (mode === 'stress_5k' || mode === 'stress_50k') {
      const target = mode === 'stress_50k' ? 50_000 : 5_000;
      arrivalIndex.clear();
      const t0 = performance.now();
      for (let i = 0; i < target; i++) {
        const id =
          i % 6 === 0
            ? Math.floor(Math.random() * (MAX_PACKAGE_ID + 1))
            : 100_000 + Math.floor(Math.random() * Math.floor(target * 1.4));
        arrivalIndex.insert(id);
      }
      const elapsedMs = performance.now() - t0;
      res.json({
        mode,
        elapsedMs: Number(elapsedMs.toFixed(2)),
        stats: arrivalIndex.getStats(),
        history: arrivalIndex.getHistory(40),
      });
      return;
    }

    if (mode === 'bridge_demo') {
      // Inject a guaranteed bridge-merge pair right at the top of active range
      const maxId = arrivalIndex.getMaxId() ?? 200;
      const base = Math.min(MAX_PACKAGE_ID - 10, maxId + 5);
      arrivalIndex.insert(base);
      arrivalIndex.insert(base + 2);
      const mergeStep = arrivalIndex.insert(base + 1);
      res.json({
        mode,
        lastStep: mergeStep,
        stats: arrivalIndex.getStats(),
        history: arrivalIndex.getHistory(40),
      });
      return;
    }

    const guided = seedGuidedDemo();
    res.json({
      mode: guided.mode,
      lastStep: guided.steps[guided.steps.length - 1] ?? null,
      stats: arrivalIndex.getStats(),
      history: arrivalIndex.getHistory(40),
    });
  });

  // Serve Vite in dev or dist/ in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Live Arrival Index server listening on http://localhost:${PORT}`);
  });
}

createServer();
