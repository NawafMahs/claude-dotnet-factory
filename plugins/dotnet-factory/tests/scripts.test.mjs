// End-to-end tests of the scripts as the hooks/skills call them, on a throwaway git repo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.SOFTWARE_FACTORY_HOME = mkdtempSync(join(tmpdir(), 'factory-home-')); // keep the real registry clean
const S = join(dirname(dirname(fileURLToPath(import.meta.url))), 'scripts');
const node = (script, args, cwd, input) => spawnSync(process.execPath, [join(S, script), ...args], { cwd, input, encoding: 'utf8' });

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'factory-test-'));
  const g = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 't@t'); g('config', 'user.name', 't');
  mkdirSync(join(dir, 'src', 'Migrations'), { recursive: true });
  writeFileSync(join(dir, 'src', 'Service.cs'), 'class S {}\n');
  writeFileSync(join(dir, 'src', 'appsettings.Production.json'), '{}\n');
  g('add', '.'); g('commit', '-qm', 'init');
  g('checkout', '-qb', 'feat/x');
  return { dir, g };
}

test('hooks: guard emits a PreToolUse decision; plain commands emit nothing', () => {
  const { dir } = repo();
  const out = node('guard.mjs', ['shell'], dir, JSON.stringify({ cwd: dir, tool_name: 'Bash', tool_input: { command: 'git push --force origin main' } }));
  const json = JSON.parse(out.stdout);
  assert.equal(json.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(json.hookSpecificOutput.permissionDecision, 'deny');
  const quiet = node('guard.mjs', ['shell'], dir, JSON.stringify({ cwd: dir, tool_name: 'Bash', tool_input: { command: 'git status' } }));
  assert.equal(quiet.stdout, '');
  assert.equal(quiet.status, 0);
  const bad = node('guard.mjs', ['shell'], dir, 'not json');
  assert.equal(bad.status, 0, 'fails open on garbage input');
  rmSync(dir, { recursive: true, force: true });
});

test('hooks: guard reads repo guard.json and current branch', () => {
  const { dir, g } = repo();
  mkdirSync(join(dir, '.factory'));
  writeFileSync(join(dir, '.factory', 'guard.json'), JSON.stringify({ protected_branches: ['feat/x'] }));
  const out = node('guard.mjs', ['shell'], dir, JSON.stringify({ cwd: dir, tool_input: { command: 'git commit -m x' } }));
  assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, 'ask');
  rmSync(dir, { recursive: true, force: true });
});

test('hooks: session context includes principles and repo state', () => {
  const { dir } = repo();
  const out = node('session-context.mjs', [], dir, JSON.stringify({ cwd: dir }));
  const ctx = JSON.parse(out.stdout).hookSpecificOutput.additionalContext;
  assert.match(ctx, /Only what was asked/);
  assert.ok(ctx.length < 2200, `session context stays small (${ctx.length} chars)`);
  assert.match(ctx, /No factory profile yet/);
  rmSync(dir, { recursive: true, force: true });
});

test('job: init hides .factory from git, new creates a job, status follows the files', () => {
  const { dir, g } = repo();
  assert.match(node('job.mjs', ['init'], dir).stdout, /exclude/);
  assert.match(readFileSync(join(dir, '.git', 'info', 'exclude'), 'utf8'), /\/\.factory\//);
  assert.match(node('job.mjs', ['init'], dir).stdout, /already/);
  const id = node('job.mjs', ['new', 'Fix examiner SMS soft-fail!'], dir).stdout.trim();
  assert.match(id, /^\d{8}-\d{4}-fix-examiner-sms-soft-fail$/);
  const jd = join(dir, '.factory', 'jobs', id);
  const st = () => node('job.mjs', ['status', id], dir).stdout;
  writeFileSync(join(jd, 'task.md'), 'TASK: bug');
  assert.match(st(), / new /);
  writeFileSync(join(jd, 'plan.md'), 'PLAN: DRAFT');
  assert.match(st(), /awaiting-approval/);
  writeFileSync(join(jd, 'plan.md'), 'PLAN: APPROVED');
  assert.match(st(), / planned /);
  assert.equal(g('status', '--porcelain').toString(), '', '.factory is invisible to git');
  rmSync(dir, { recursive: true, force: true });
});

test('gate: NO-CHECKS, PASS, FAIL, protected path', () => {
  const { dir, g } = repo();
  node('job.mjs', ['init'], dir);
  const id = node('job.mjs', ['new', 'gate test'], dir).stdout.trim();
  let r = node('gate.mjs', ['--job', id], dir);
  assert.equal(r.status, 3); assert.match(r.stdout, /NO-CHECKS/);

  const checks = (run) => writeFileSync(join(dir, '.factory', 'checks.json'), JSON.stringify({
    base_branch: 'main',
    checks: [{ name: 'build', run }],
    protected_paths: ['**/appsettings.Production.json'],
  }));
  checks(`"${process.execPath}" -e "process.exit(0)"`);
  writeFileSync(join(dir, 'src', 'Service.cs'), 'class S { int x; }\n');
  r = node('gate.mjs', ['--job', id], dir);
  assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /^GATE: PASS/);
  assert.match(readFileSync(join(dir, '.factory', 'jobs', id, 'checks.md'), 'utf8'), /^GATE: PASS[\s\S]*M src\/Service.cs/);

  checks(`"${process.execPath}" -e "console.error('CS1002: ; expected'); process.exit(1)"`);
  r = node('gate.mjs', ['--job', id], dir);
  assert.equal(r.status, 1); assert.match(r.stdout, /^GATE: FAIL/);
  assert.match(readFileSync(join(dir, '.factory', 'jobs', id, 'checks.md'), 'utf8'), /CS1002/);

  checks(`"${process.execPath}" -e "process.exit(0)"`);
  writeFileSync(join(dir, 'src', 'appsettings.Production.json'), '{"x":1}\n');
  g('add', 'src'); g('commit', '-qm', 'change prod settings');
  r = node('gate.mjs', ['--job', id], dir);
  assert.equal(r.status, 1); assert.match(r.stdout, /protected changed: M src\/appsettings.Production.json/);
  rmSync(dir, { recursive: true, force: true });
});

test('dashboard: state lists registered repos and jobs; file API refuses traversal', async () => {
  const { dir } = repo();
  node('job.mjs', ['init'], dir);
  const id = node('job.mjs', ['new', 'Show examiner name'], dir).stdout.trim();
  const jd = join(dir, '.factory', 'jobs', id);
  writeFileSync(join(jd, 'task.md'), 'TASK: feature · risk high\n\n## Request (verbatim)\n> Show examiner name');
  writeFileSync(join(jd, 'plan.md'), 'PLAN: DRAFT\n\n## Summary\n- one\n- two\n');
  const { spawn } = await import('node:child_process');
  const port = 4900 + Math.floor(Math.random() * 90);
  const srv = spawn(process.execPath, [join(S, 'dashboard.mjs'), '--port', String(port)], { cwd: dir });
  try {
    await new Promise((ok, bad) => { srv.stdout.on('data', (d) => /DASHBOARD:/.test(d) && ok()); setTimeout(() => bad(new Error('server did not start')), 8000); });
    const base = `http://127.0.0.1:${port}`;
    const st = await (await fetch(`${base}/api/state`)).json();
    const r = st.repos.find((x) => x.root.replace(/\\/g, '/').toLowerCase() === dir.replace(/\\/g, '/').toLowerCase());
    assert.ok(r, 'repo registered');
    const j = r.jobs.find((x) => x.id === id);
    assert.equal(j.title, 'Show examiner name');
    assert.equal(j.column, 'human');
    assert.equal(j.needsYou, true);
    assert.equal(j.risk, 'high');
    assert.deepEqual(j.summaries['plan.md'].summary, ['one', 'two']);
    const f = await fetch(`${base}/api/file?repo=${r.index}&job=${id}&name=plan.md`);
    assert.match(await f.text(), /^PLAN: DRAFT/);
    for (const q of [`job=..&name=checks.json`, `job=${id}&name=..%2F..%2Fchecks.json`, `job=${id}&name=x.cs`]) {
      assert.equal((await fetch(`${base}/api/file?repo=${r.index}&${q}`)).status, 404, q);
    }
    assert.equal((await fetch(`${base}/api/state`, { method: 'POST' })).status, 405);
    assert.match(await (await fetch(base)).text(), /<title>Software Factory<\/title>/);
  } finally {
    const exited = new Promise((ok) => srv.once('exit', ok));
    srv.kill();
    await exited; // Windows keeps the folder locked while the server's cwd is in it
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

test('job scope: only changes made after the job started count; user changes are ignored', () => {
  const { dir, g } = repo();
  // history already on the branch before the job: a migration + payment change
  writeFileSync(join(dir, 'src', 'Migrations', 'Old.cs'), 'class M {}\n');
  g('add', 'src'); g('commit', '-qm', 'earlier branch work');
  // the user's own uncommitted change before the job starts
  writeFileSync(join(dir, 'src', 'UserScratch.cs'), 'class U { [AllowAnonymous] void X() {} }\n');
  node('job.mjs', ['init'], dir);
  writeFileSync(join(dir, '.factory', 'checks.json'), JSON.stringify({ base_branch: 'main', checks: [{ name: 'ok', run: `"${process.execPath}" -e "0"` }] }));
  const id = node('job.mjs', ['new', 'scoped job'], dir).stdout.trim();
  const meta = JSON.parse(readFileSync(join(dir, '.factory', 'jobs', id, 'meta.json'), 'utf8'));
  assert.match(meta.base_commit, /^[0-9a-f]{40}$/);
  assert.deepEqual(meta.preexisting, ['src/UserScratch.cs']);

  writeFileSync(join(dir, 'src', 'Service.cs'), 'class S { int y; }\n'); // the job's change
  writeFileSync(join(dir, '.factory', 'jobs', id, 'task.md'), 'TASK: small fix · risk low');
  const out = node('route.mjs', ['--job', id], dir).stdout;
  assert.match(out, /^ROUTE: code-reviewer$/m, 'branch history and user files do not pull in db/security reviewers');
  assert.match(out, /^MODELS: code-reviewer=sonnet$/m);
  assert.match(out, /^BASE: [0-9a-f]{40} \(job start\) · risk low · 1 file\(s\)$/m);
  const gate = node('gate.mjs', ['--job', id], dir);
  assert.equal(gate.status, 0, gate.stdout);
  const md = readFileSync(join(dir, '.factory', 'jobs', id, 'checks.md'), 'utf8');
  assert.match(md, /- M src\/Service.cs/);
  assert.doesNotMatch(md, /UserScratch|Old\.cs/);
  assert.match(md, /1 pre-existing user change\(s\) ignored/);
  rmSync(dir, { recursive: true, force: true });
});

test('route: models follow risk', () => {
  const { dir } = repo();
  node('job.mjs', ['init'], dir);
  writeFileSync(join(dir, '.factory', 'checks.json'), JSON.stringify({ base_branch: 'main', checks: [] }));
  writeFileSync(join(dir, 'src', 'Service.cs'), 'class S { [AllowAnonymous] void M() {} }\n');
  const models = (risk) => node('route.mjs', ['--risk', risk], dir).stdout.split('\n').find((l) => l.startsWith('MODELS:'));
  assert.equal(models('low'), 'MODELS: code-reviewer=sonnet, security-reviewer=sonnet');
  assert.equal(models('medium'), 'MODELS: code-reviewer=sonnet, security-reviewer=opus');
  assert.equal(models('high'), 'MODELS: code-reviewer=opus, security-reviewer=opus');
  rmSync(dir, { recursive: true, force: true });
});

test('route: reviewers follow the diff; --add appends; job status tracks reviews', () => {
  const { dir, g } = repo();
  node('job.mjs', ['init'], dir);
  writeFileSync(join(dir, '.factory', 'checks.json'), JSON.stringify({ base_branch: 'main', checks: [{ name: 'x', run: 'echo' }] }));
  const id = node('job.mjs', ['new', 'route test'], dir).stdout.trim();

  writeFileSync(join(dir, 'src', 'Service.cs'), 'class S { void M() {} }\n');
  assert.match(node('route.mjs', ['--job', id], dir).stdout, /^ROUTE: code-reviewer\s/);

  writeFileSync(join(dir, 'src', 'Migrations', '2026_AddX.cs'), 'class M {}\n');
  g('add', 'src'); g('commit', '-qm', 'migration');
  writeFileSync(join(dir, 'src', 'Service.cs'), 'class S { [AllowAnonymous] void M() {} }\n');
  const out = node('route.mjs', ['--job', id, '--add', 'ui-reviewer'], dir).stdout;
  assert.match(out, /^ROUTE: code-reviewer, db-reviewer, security-reviewer, ui-reviewer/);
  assert.match(readFileSync(join(dir, '.factory', 'jobs', id, 'route.md'), 'utf8'), /db-reviewer.*Migrations/);

  const jd = join(dir, '.factory', 'jobs', id);
  writeFileSync(join(jd, 'checks.md'), 'GATE: PASS');
  writeFileSync(join(jd, 'review-code.md'), 'VERDICT: PASS');
  assert.match(node('job.mjs', ['status', id], dir).stdout, /reviewing.*db-reviewer, security-reviewer, ui-reviewer/);
  for (const l of ['db', 'security']) writeFileSync(join(jd, `review-${l}.md`), 'VERDICT: PASS');
  writeFileSync(join(jd, 'review-ui.md'), 'VERDICT: CHANGES');
  assert.match(node('job.mjs', ['status', id], dir).stdout, /changes-requested/);
  writeFileSync(join(jd, 'review-ui.md'), 'VERDICT: PASS');
  assert.match(node('job.mjs', ['status', id], dir).stdout, / reviewed /);
  rmSync(dir, { recursive: true, force: true });
});
