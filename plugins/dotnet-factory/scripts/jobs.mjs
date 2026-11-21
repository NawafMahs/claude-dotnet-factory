// Read factory jobs back from their files. Import-safe (no side effects).
// State is only the files in .factory/jobs/<id>/; this module derives stage and card data.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8').replace(/^﻿/, '') : null);
const first = (p) => read(p)?.split('\n')[0].trim() ?? null;

export function stage(dir) {
  const has = (f) => existsSync(join(dir, f));
  const reviews = readdirSync(dir).filter((f) => /^review-.*\.md$/.test(f));
  if (has('delivery.md')) return ['delivered', first(join(dir, 'delivery.md'))];
  const build = first(join(dir, 'build.md'));
  if (build?.includes('BLOCKED')) return ['blocked', 'builder is blocked: read build.md and decide'];
  const gate = first(join(dir, 'checks.md'));
  if (reviews.length && has('route.md')) {
    const missing = routedReviewers(dir).filter((r) => !reviews.includes(`review-${lens(r)}.md`));
    if (missing.length) return ['reviewing', `waiting for ${missing.join(', ')}`];
    if (reviews.some((f) => (first(join(dir, f)) || '').includes('CHANGES'))) return ['changes-requested', 'address findings, re-run the gate, re-review'];
    return ['reviewed', 'ready for /dotnet-factory:deliver (with your OK)'];
  }
  if (gate) return [gate.includes('PASS') ? 'gated' : 'gate-failed', gate.includes('PASS') ? 'route + review' : 'fix and re-run the gate'];
  if (build) return ['built', 'run the gate (/dotnet-factory:verify)'];
  const plan = first(join(dir, 'plan.md'));
  if (plan?.includes('APPROVED')) return ['planned', 'build'];
  if (plan) return ['awaiting-approval', 'the user must approve plan.md'];
  if (has('context.md')) return ['investigated', 'plan'];
  if (has('task.md')) return ['new', 'investigate'];
  return ['empty', 'write task.md'];
}

export const lens = (reviewer) => reviewer.replace(/^.*:/, '').replace(/-reviewer$/, '');

function routedReviewers(dir) {
  return (first(join(dir, 'route.md')) || '').replace(/^ROUTE:\s*/, '').split(',').map((s) => s.trim()).filter(Boolean);
}

// Dashboard column for each stage, and whether the job waits on the user.
export const COLUMN = {
  empty: 'intake', new: 'intake', investigated: 'plan',
  'awaiting-approval': 'human', blocked: 'human', reviewed: 'human',
  planned: 'build', built: 'build', 'gate-failed': 'build', 'changes-requested': 'build',
  gated: 'review', reviewing: 'review',
  delivered: 'done',
};

function summary(text) {
  if (!text) return [];
  const m = text.match(/## Summary\s*\n([\s\S]*?)(\n## |\n*$)/);
  return m ? m[1].split('\n').map((l) => l.replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean).slice(0, 5) : [];
}

export function readJob(jobsDir, id) {
  const dir = join(jobsDir, id);
  const files = readdirSync(dir).filter((f) => !f.startsWith('.'));
  const meta = JSON.parse(read(join(dir, 'meta.json')) || '{}');
  const [st, next] = stage(dir);
  const task = read(join(dir, 'task.md')) || '';
  const head = task.split('\n')[0];
  const track = head.match(/TASK:\s*([\w-]+(?: [\w-]+)?)/i)?.[1]?.replace(/\s*·.*/, '') || null;
  const risk = head.match(/risk\s+(low|medium|high)/i)?.[1]?.toLowerCase() || null;
  const quote = task.match(/^>\s*(.+)$/m)?.[1];
  const title = meta.title || quote?.slice(0, 80) || id.replace(/^\d{8}-\d{4}-/, '').replace(/-/g, ' ');

  const routed = existsSync(join(dir, 'route.md')) ? routedReviewers(dir) : [];
  const reviewFiles = files.filter((f) => /^review-.*\.md$/.test(f)).map((f) => f.slice(7, -3));
  const lenses = [...new Set([...routed.map(lens), ...reviewFiles])];
  const reviews = lenses.map((l) => {
    const v = first(join(dir, `review-${l}.md`));
    return { lens: l, verdict: v ? (v.includes('CHANGES') ? 'changes' : v.includes('PASS') ? 'pass' : 'unknown') : 'pending' };
  });

  const gateLine = first(join(dir, 'checks.md'));
  const gate = gateLine ? (gateLine.includes('PASS') ? 'pass' : 'fail') : null;
  const gateRuns = (read(join(dir, 'checks.log'))?.match(/^===== /gm) || []).length;
  const uiLine = first(join(dir, 'ui-verify.md'));
  const ui = uiLine ? (uiLine.includes('PASS') ? 'pass' : uiLine.includes('FAIL') ? 'fail' : 'partial') : null;
  const delivery = first(join(dir, 'delivery.md'));
  const mr = delivery?.match(/https?:\/\/\S+/)?.[0] || null;

  const times = files.map((f) => statSync(join(dir, f)).mtimeMs);
  const created = meta.created ? Date.parse(meta.created) : Math.min(statSync(dir).birthtimeMs || Infinity, ...times, Date.now());
  const updated = Math.max(created, ...times);

  return {
    id, title, track, risk, stage: st, next, column: COLUMN[st] || 'intake',
    needsYou: COLUMN[st] === 'human',
    gate, gateRuns, ui, reviews, mr,
    branch: meta.branch || null,
    created, updated,
    files: files.filter((f) => /\.(md|json|log)$/.test(f)).sort(),
    summaries: Object.fromEntries(['context.md', 'plan.md', 'build.md', 'checks.md', 'delivery.md'].filter((f) => files.includes(f)).map((f) => [f, { first: first(join(dir, f)), summary: summary(read(join(dir, f))) }])),
  };
}

export function readJobs(root) {
  const jobsDir = join(root, '.factory', 'jobs');
  if (!existsSync(jobsDir)) return [];
  return readdirSync(jobsDir).filter((j) => statSync(join(jobsDir, j)).isDirectory()).sort().map((j) => {
    try { return readJob(jobsDir, j); } catch (e) { return { id: j, title: j, stage: 'error', next: String(e.message), column: 'intake', reviews: [], files: [], summaries: {} }; }
  });
}

// ---- repo registry (so one dashboard shows every repo the factory works in) ----
export const HOME = process.env.SOFTWARE_FACTORY_HOME || join(homedir(), '.software-factory');
export const REGISTRY = join(HOME, 'repos.json');

export function listRepos() {
  try { return JSON.parse(readFileSync(REGISTRY, 'utf8')).repos || []; } catch { return []; }
}

export function registerRepo(root) {
  const repos = listRepos();
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  if (repos.some((r) => norm(r) === norm(root))) return false;
  mkdirSync(HOME, { recursive: true });
  writeFileSync(REGISTRY, JSON.stringify({ repos: [...repos, root] }, null, 2));
  return true;
}
