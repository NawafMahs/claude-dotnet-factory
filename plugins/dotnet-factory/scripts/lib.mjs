// Shared helpers for dotnet-factory scripts. Node built-ins only.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

export function readStdinJson() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function gitRoot(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
}

// The diff base for a job: the commit HEAD was on when the job started (meta.json base_commit),
// so a job is judged on its own changes, not on everything already on the branch. Files that
// were already uncommitted when the job started (meta.json preexisting) belong to the user and
// are ignored. Without a job (or for old jobs) it falls back to checks.json base_branch.
export function jobScope(root, jobId, fallbackBase) {
  const meta = jobId ? readJson(join(root, '.factory', 'jobs', jobId, 'meta.json'), {}) : {};
  if (meta?.base_commit) return { base: meta.base_commit, ignore: meta.preexisting || [], source: 'job start' };
  return { base: fallbackBase || null, ignore: [], source: fallbackBase ? 'branch base' : 'working tree' };
}

// Files changed vs <base>...HEAD plus uncommitted/untracked changes. Map path -> status letter (A/M/D/R).
// Ignores the factory's own .factory/ folder and any path in `ignore`.
export function changedFiles(root, base, ignore = []) {
  const files = collectChanged(root, base);
  for (const p of ignore) files.delete(p);
  return files;
}

function collectChanged(root, base) {
  const files = new Map();
  if (base) {
    try {
      for (const line of git(root, ['diff', '--name-status', `${base}...HEAD`]).split('\n').filter(Boolean)) {
        const [status, ...paths] = line.split('\t');
        files.set(paths[0], status[0]);
        if (paths[1]) files.set(paths[1], 'A');
      }
    } catch { /* base missing: fall back to the working tree only */ }
  }
  for (const line of git(root, ['status', '--porcelain', '-uall']).split('\n').filter(Boolean)) {
    const status = line.slice(0, 2).trim()[0] || 'M';
    const path = line.slice(3).split(' -> ').pop().replace(/^"|"$/g, '');
    if (path.startsWith('.factory/')) continue;
    files.set(path, status === '?' ? 'A' : status);
  }
  return files;
}

export function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8').replace(/^﻿/, ''));
}

export function factoryDir(root) {
  return join(root, '.factory');
}

// Minimal glob → RegExp. Supports **, *, ? and {a,b}. Paths use forward slashes.
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = glob.indexOf('}', i);
      re += '(?:' + glob.slice(i + 1, end).split(',').map(escape).join('|') + ')';
      i = end;
    } else re += escape(c);
  }
  return new RegExp('^' + re + '$', 'i');
}

function escape(s) {
  return s.replace(/[.+^$()|[\]\\]/g, '\\$&');
}

export function matchesAny(path, globs) {
  const p = path.replace(/\\/g, '/');
  return globs.some((g) => globToRegExp(g).test(p));
}
