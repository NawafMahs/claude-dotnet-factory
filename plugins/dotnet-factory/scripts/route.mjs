// Decide which reviewers a change needs, and on which model, from the diff and the job's risk
// (no LLM judgment).
//
// Usage: node route.mjs [--job <id>] [--base <ref>] [--risk low|medium|high] [--add <reviewer,...>]
//   Prints: ROUTE: code-reviewer, db-reviewer  (why…)
//   With --job, writes .factory/jobs/<id>/route.md:
//     line 1  ROUTE: <reviewers>            (parsed by job.mjs / the dashboard)
//     line 2  MODELS: <reviewer>=<model>, … (pass each as the Agent tool's `model`)
//     line 3  BASE: <ref> (<source>)        (pass to reviewers as their diff base)
//   Base: the job's start commit (meta.json) so only this job's changes count; --base overrides.
//   Risk: --risk, else task.md's first line ("TASK: <track> · risk <level>"), else medium.
//   --add adds reviewers the plan's risk calls for. Removal is not possible: the diff sets the floor.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, changedFiles, git, gitRoot, jobScope, matchesAny, readJson } from './lib.mjs';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

export function route(files, addedLines, config) {
  const picked = new Map();
  for (const r of config.always || []) picked.set(r, 'always');
  for (const rule of config.rules || []) {
    const byPath = [...files.keys()].find((p) => matchesAny(p, rule.when_paths || []));
    const pattern = (rule.when_added_lines || []).find((re) => new RegExp(re).test(addedLines));
    if (byPath || pattern) {
      if (!picked.has(rule.reviewer)) picked.set(rule.reviewer, byPath ? `${rule.why}: ${byPath}` : `${rule.why}: added line matches /${pattern}/`);
    }
  }
  return picked;
}

export function modelFor(reviewer, risk, config) {
  const table = config.models?.[risk] || config.models?.medium || {};
  return table[reviewer] || table.default || 'sonnet';
}

function jobRisk(root, jobId) {
  if (!jobId) return null;
  const p = join(root, '.factory', 'jobs', jobId, 'task.md');
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8').split('\n')[0].match(/risk\s+(low|medium|high)/i)?.[1]?.toLowerCase() || null;
}

function main() {
  const root = gitRoot();
  if (!root) { console.log('ROUTE: not inside a git repository'); process.exit(1); }
  const checks = readJson(join(root, '.factory', 'checks.json'), {});
  const jobId = arg('--job');
  const scope = arg('--base') ? { base: arg('--base'), ignore: [], source: 'given' } : jobScope(root, jobId, checks.base_branch);
  const base = scope.base;
  const config = readJson(join(PLUGIN_ROOT, 'config', 'routing.json'));
  const extra = readJson(join(root, '.factory', 'routing.json'));
  if (extra) {
    config.always = [...new Set([...(config.always || []), ...(extra.always || [])])];
    config.rules = [...config.rules, ...(extra.rules || [])];
    for (const [k, v] of Object.entries(extra.models || {})) config.models[k] = { ...(config.models?.[k] || {}), ...v };
  }
  const risk = (arg('--risk') || jobRisk(root, jobId) || 'medium').toLowerCase();

  const filesMap = changedFiles(root, base, scope.ignore);
  let added = ''; // only added lines of this scope's files are scanned for content rules
  const paths = [...filesMap.keys()];
  if (paths.length) {
    const spec = paths.length <= 300 ? ['--', ...paths] : [];
    try {
      const diff = (base ? git(root, ['diff', '-U0', `${base}...HEAD`, ...spec]) : '') + git(root, ['diff', '-U0', 'HEAD', ...spec]);
      added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).join('\n');
    } catch { /* no HEAD yet */ }
  }

  const picked = route(filesMap, added, config);
  for (const r of (arg('--add') || '').split(',').map((s) => s.trim()).filter(Boolean)) if (!picked.has(r)) picked.set(r, 'added by plan risk');

  const reviewers = [...picked.keys()];
  const line = `ROUTE: ${reviewers.join(', ')}`;
  const models = `MODELS: ${reviewers.map((r) => `${r}=${modelFor(r, risk, config)}`).join(', ')}`;
  const baseLine = `BASE: ${base || 'HEAD (working tree)'} (${scope.source}) · risk ${risk} · ${filesMap.size} file(s)`;
  if (jobId) {
    const dir = join(root, '.factory', 'jobs', jobId);
    if (existsSync(dir)) {
      writeFileSync(join(dir, 'route.md'), [line, models, baseLine, '', '## Why', ...[...picked].map(([r, why]) => `- \`${r}\` — ${why}`), ''].join('\n'));
    }
  }
  console.log([line, models, baseLine].join('\n') + '\n' + [...picked].filter(([, w]) => w !== 'always').map(([r, w]) => `(${r}: ${w})`).join(' '));
}

main();
