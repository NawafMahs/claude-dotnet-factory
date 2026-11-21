// Factory job bookkeeping. State is just the files in the job folder; this script
// creates folders and reads the stage back. It never edits stage files itself.
//
//   node job.mjs init                 create .factory/, hide it from git (.git/info/exclude), register the repo for the dashboard
//   node job.mjs new "<short title>"  create .factory/jobs/<yyyymmdd-hhmm>-<slug>/ (+ meta.json) and print its id
//   node job.mjs status [<id>]        one line per job: id, stage, next step
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changedFiles, gitRoot, git } from './lib.mjs';
import { readJobs, registerRepo, stage } from './jobs.mjs';

const root = gitRoot();
if (!root) { console.error('job: not inside a git repository'); process.exit(1); }
const F = join(root, '.factory');
const JOBS = join(F, 'jobs');

function init() {
  for (const d of [F, JOBS, join(F, 'knowledge')]) mkdirSync(d, { recursive: true });
  const exclude = join(root, '.git', 'info', 'exclude');
  const current = existsSync(exclude) ? readFileSync(exclude, 'utf8') : '';
  if (!/^\/?\.factory\/?\s*$/m.test(current)) {
    mkdirSync(join(root, '.git', 'info'), { recursive: true });
    appendFileSync(exclude, `${current.endsWith('\n') || !current ? '' : '\n'}# personal software factory state (not shared)\n/.factory/\n`);
    console.log('init: .factory/ created and added to .git/info/exclude');
  } else console.log('init: .factory/ already set up');
  if (registerRepo(root)) console.log('init: repo registered for the dashboard');
}

function slug(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';
}

function newJob(title) {
  if (!existsSync(F)) init();
  else registerRepo(root);
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const id = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${slug(title)}`;
  mkdirSync(join(JOBS, id), { recursive: true });
  let branch = null, base_commit = null;
  try {
    branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    base_commit = git(root, ['rev-parse', 'HEAD']).trim();
  } catch { /* no commits yet */ }
  // Uncommitted changes that exist before the job starts are the user's: gate/route ignore them.
  const preexisting = [...changedFiles(root, null).keys()];
  writeFileSync(join(JOBS, id, 'meta.json'), JSON.stringify({ title: title.trim(), created: d.toISOString(), branch, base_commit, preexisting }, null, 2));
  if (preexisting.length) console.error(`note: ${preexisting.length} pre-existing uncommitted change(s) recorded as the user's and excluded from this job's gate/review scope`);
  console.log(id);
}

function status(id) {
  if (!existsSync(JOBS)) { console.log('status: no jobs (run init)'); return; }
  const jobs = readJobs(root).filter((j) => !id || j.id === id);
  if (id && !jobs.length) console.log(`${id}  missing`);
  for (const j of jobs) console.log(`${j.id}  ${j.stage}  → ${j.next}`);
}

export { stage };

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'init') init();
else if (cmd === 'new') newJob(rest.join(' '));
else if (cmd === 'status') status(rest[0]);
else { console.error('usage: job.mjs init | new "<title>" | status [<id>]'); process.exit(2); }
