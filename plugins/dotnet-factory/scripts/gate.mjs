// The deterministic gate: do this repo's checks pass, and were protected paths left alone?
//
// Usage: node gate.mjs [--job <id>] [--base <ref>]
//   Reads <repo>/.factory/checks.json:
//     { "base_branch": "origin/Development",
//       "checks": [ { "name": "build", "run": "dotnet build App.sln -nologo -v q", "timeout_sec": 900,
//                     "cwd": ".", "shell": "pwsh" } ],
//       "protected_paths": ["**/appsettings.Production.json"] }
//   Prints exactly one line: GATE: PASS|FAIL|NO-CHECKS ...  Exit 0 = PASS, 1 = FAIL, 3 = not configured.
//   With --job, writes .factory/jobs/<id>/checks.md (first line = verdict) and checks.log.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedFiles, git, gitRoot, jobScope, matchesAny, readJson } from './lib.mjs';

const TAIL = 60;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
}

function runCheck(root, check) {
  const start = Date.now();
  const opts = {
    cwd: join(root, check.cwd || '.'),
    encoding: 'utf8',
    timeout: (check.timeout_sec || 900) * 1000,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  };
  const res = check.shell === 'pwsh' || check.shell === 'powershell'
    ? spawnSync(check.shell === 'pwsh' ? 'pwsh' : 'powershell', ['-NoProfile', '-NonInteractive', '-Command', check.run], opts)
    : spawnSync(check.run, { ...opts, shell: true });
  const out = `${res.stdout || ''}${res.stderr || ''}${res.error ? `\n${res.error.message}` : ''}`;
  const timedOut = res.error?.code === 'ETIMEDOUT' || res.signal === 'SIGTERM';
  return { name: check.name, run: check.run, code: timedOut ? 'timeout' : res.status, ok: res.status === 0 && !timedOut, seconds: Math.round((Date.now() - start) / 1000), out };
}

function main() {
  const root = gitRoot();
  if (!root) { console.log('GATE: NO-CHECKS not inside a git repository'); process.exit(3); }
  const cfg = readJson(join(root, '.factory', 'checks.json'));
  if (!cfg?.checks?.length) { console.log('GATE: NO-CHECKS .factory/checks.json is missing or empty; run /dotnet-factory:discover'); process.exit(3); }

  const jobId = arg('--job');
  const scope = arg('--base') ? { base: arg('--base'), ignore: [], source: 'given' } : jobScope(root, jobId, cfg.base_branch);
  const base = scope.base;
  const files = changedFiles(root, base, scope.ignore);
  const protectedHits = [...files].filter(([p, s]) => s !== 'A' && matchesAny(p, cfg.protected_paths || [])).map(([p, s]) => `${s} ${p}`);

  const results = cfg.checks.map((c) => runCheck(root, c));
  const pass = results.every((r) => r.ok) && protectedHits.length === 0;
  const verdict = pass ? 'PASS' : 'FAIL';
  let commit = '';
  try { commit = git(root, ['rev-parse', '--short', 'HEAD']).trim(); } catch { /* no commits */ }

  const summaryLine = `GATE: ${verdict} (${results.map((r) => `${r.name} ${r.ok ? 'ok' : `exit ${r.code}`} ${r.seconds}s`).join(', ')}) · ${files.size} changed file(s)` + (protectedHits.length ? ` · protected changed: ${protectedHits.join(', ')}` : '');

  if (jobId) {
    const dir = join(root, '.factory', 'jobs', jobId);
    if (!existsSync(dir)) { console.log(`GATE: FAIL job folder ${dir} does not exist`); process.exit(1); }
    const md = [
      `GATE: ${verdict}`,
      `COMMIT: ${commit || '(none)'}${base ? ` · BASE: ${base}` : ''}`,
      '',
      '## Summary',
      ...results.map((r) => `- \`${r.name}\` ${r.ok ? 'passed' : `failed (${r.code})`} in ${r.seconds}s`),
      `- Protected paths: ${protectedHits.length ? 'CHANGED ' + protectedHits.join(', ') : 'none changed'}`,
      `- ${files.size} changed file(s) vs ${base || 'working tree'} (${scope.source}${scope.ignore.length ? `; ${scope.ignore.length} pre-existing user change(s) ignored` : ''})`,
      '',
      '## Changed files',
      ...([...files].map(([p, s]) => `- ${s} ${p}`)),
      '',
      ...results.filter((r) => !r.ok).flatMap((r) => [`## Failure: ${r.name}`, '```', `> ${r.run}`, ...r.out.trimEnd().split('\n').slice(-TAIL), '```', '']),
    ].join('\n');
    writeFileSync(join(dir, 'checks.md'), md);
    appendFileSync(join(dir, 'checks.log'), `\n===== ${new Date().toISOString()} ${verdict}\n` + results.map((r) => `----- ${r.name}: ${r.run}\n${r.out}`).join('\n'));
  }
  console.log(summaryLine);
  process.exit(pass ? 0 : 1);
}

main();
