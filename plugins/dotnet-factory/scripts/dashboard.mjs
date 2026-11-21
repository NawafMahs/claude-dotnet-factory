// Read-only factory dashboard: a kanban of every job in every registered repo.
//
//   node dashboard.mjs [--port 4777]
//
// Serves http://127.0.0.1:<port>/ (local only). Repos come from ~/.software-factory/repos.json
// (job.mjs init registers them) plus the repo you start it in. The page polls /api/state.
// It never changes anything: approvals and feedback stay in the Claude Code chat.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { PLUGIN_ROOT, gitRoot } from './lib.mjs';
import { listRepos, readJobs, registerRepo } from './jobs.mjs';

const argPort = process.argv.indexOf('--port');
const PORT = Number(argPort === -1 ? 4777 : process.argv[argPort + 1]);
const PAGE = join(PLUGIN_ROOT, 'dashboard', 'index.html');
const MAX_FILE = 256 * 1024;

const here = gitRoot();
if (here && existsSync(join(here, '.factory'))) registerRepo(here);

function repos() {
  return listRepos().filter((r) => existsSync(join(r, '.factory')));
}

function state() {
  return {
    now: Date.now(),
    repos: repos().map((root, i) => ({ index: i, root, name: basename(root), jobs: readJobs(root) })),
  };
}

function fileText(url) {
  const repo = repos()[Number(url.searchParams.get('repo'))];
  const job = url.searchParams.get('job') || '';
  const name = url.searchParams.get('name') || '';
  if (!repo || !/^[\w.-]+$/.test(job) || !/^[\w.-]+\.(md|json|log)$/.test(name)) return null;
  const jobDir = resolve(repo, '.factory', 'jobs', job);
  const path = resolve(jobDir, name);
  if (!path.startsWith(jobDir + sep) || !existsSync(path)) return null;
  const size = statSync(path).size;
  const text = readFileSync(path, 'utf8');
  return size > MAX_FILE ? `… (showing the last ${MAX_FILE / 1024} KB of ${Math.round(size / 1024)} KB)\n` + text.slice(-MAX_FILE) : text;
}

const send = (res, code, type, body) => {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'read-only');
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, 'text/html; charset=utf-8', readFileSync(PAGE));
    if (url.pathname === '/api/state') return send(res, 200, 'application/json', JSON.stringify(state()));
    if (url.pathname === '/api/file') {
      const text = fileText(url);
      return text === null ? send(res, 404, 'text/plain', 'not found') : send(res, 200, 'text/plain; charset=utf-8', text);
    }
    send(res, 404, 'text/plain', 'not found');
  } catch (e) {
    send(res, 500, 'text/plain', String(e?.message || e));
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`DASHBOARD: already running at http://127.0.0.1:${PORT}/`);
    process.exit(0);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`DASHBOARD: http://127.0.0.1:${PORT}/  (${repos().length} repo(s): ${repos().map((r) => basename(r)).join(', ') || 'none yet'})`);
});
