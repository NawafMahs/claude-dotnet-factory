// PreToolUse guard. Usage (as a hook): node guard.mjs shell|write  < hook-input.json
//
// Returns a permission decision for risky shell commands and secret-bearing writes:
//   deny -> never allowed from an agent; the user runs it themself.
//   ask  -> the user must approve it in the permission prompt.
// Anything else passes through untouched (no output). Fails open on internal errors so
// a guard bug never bricks a session; the principles still forbid the same actions.
//
// Per-repo overrides: <repo>/.factory/guard.json
//   { "protected_branches": ["trunk", "Development"], "allow": ["<regex>", ...] }
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gitRoot, readJson, readStdinJson, globToRegExp } from './lib.mjs';

export const DEFAULT_PROTECTED = ['main', 'master', 'develop', 'development', 'release/*', 'production', 'prod', 'staging'];
const LOCAL_SERVERS = /^(\.|localhost|127\.0\.0\.1|::1|\(local\)|\(localdb\)\\.*|\.\\.*|localhost\\.*|localhost,\d+)$/i;

const deny = (reason) => ({ decision: 'deny', reason });
const ask = (reason) => ({ decision: 'ask', reason });

// Split a command line into simple commands on ; && || | and newlines (quotes respected).
export function splitCommands(cmd) {
  const out = [];
  let cur = '', q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { cur += c; if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if (c === ';' || c === '\n' || c === '|' || (c === '&' && cmd[i + 1] === '&')) {
      if (c === '&' || (c === '|' && cmd[i + 1] === '|')) i++;
      out.push(cur.trim()); cur = ''; continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

export function tokens(simple) {
  return (simple.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((t) => t.replace(/^["']|["']$/g, ''));
}

function isProtected(branch, protectedList) {
  const b = branch.replace(/^refs\/heads\//, '');
  return protectedList.some((p) => globToRegExp(p).test(b));
}

function checkGitPush(t, protectedList) {
  const args = t.slice(t.indexOf('push') + 1);
  const force = args.some((a) => /^(--force|--force-with-lease(=.*)?|--force-if-includes|-f|-[a-zA-Z]*f[a-zA-Z]*)$/.test(a) && !/^--follow-tags$/.test(a)) || args.some((a) => /^\+/.test(a));
  if (args.includes('--mirror')) return deny('git push --mirror rewrites every ref on the remote.');
  const positional = args.filter((a) => !a.startsWith('-'));
  const refspecs = positional.slice(1); // first positional is the remote
  const targets = refspecs.map((r) => r.replace(/^\+/, '').split(':').pop()).filter(Boolean);
  const hitsProtected = targets.some((b) => isProtected(b, protectedList));
  const deleting = args.includes('--delete') || args.includes('-d') || refspecs.some((r) => r.startsWith(':'));
  if (deleting && (hitsProtected || refspecs.some((r) => isProtected(r.slice(1), protectedList)))) return deny('Deleting a protected branch on the remote.');
  if (force && hitsProtected) return deny(`Force-push to a protected branch (${targets.join(', ')}).`);
  if (force) return ask('Force-push rewrites remote history. Approve only if this is your own feature branch.');
  if (hitsProtected) return ask(`Direct push to a protected branch (${targets.join(', ')}). Shared branches normally change through an MR/PR.`);
  if (deleting) return ask('Deleting a remote branch.');
  return null;
}

function sqlServerArg(t) {
  for (let i = 0; i < t.length; i++) {
    if (/^(-S|--server|-ServerInstance|-Server|-h|--host)$/i.test(t[i]) && t[i + 1]) return t[i + 1];
    const m = t[i].match(/^-S(.+)$/);
    if (m) return m[1];
  }
  const cs = t.join(' ').match(/(?:Server|Data Source|Host)\s*=\s*([^;"']+)/i);
  return cs ? cs[1].trim() : null;
}

const DESTRUCTIVE_SQL = /\b(DROP\s+(TABLE|DATABASE|SCHEMA|VIEW|PROCEDURE|FUNCTION|INDEX|COLUMN)|TRUNCATE\s+TABLE|DELETE\s+FROM|UPDATE\s+\S+\s+SET|ALTER\s+(TABLE|DATABASE)|INSERT\s+INTO|MERGE\s+INTO|EXEC(UTE)?\s+sp_rename)\b/i;

export function evaluateShell(command, cfg = {}) {
  const protectedList = cfg.protected_branches?.length ? [...DEFAULT_PROTECTED, ...cfg.protected_branches] : DEFAULT_PROTECTED;
  if ((cfg.allow || []).some((r) => new RegExp(r, 'i').test(command))) return null;

  let worst = null;
  const rank = { ask: 1, deny: 2 };
  const take = (r) => { if (r && (!worst || rank[r.decision] > rank[worst.decision])) worst = r; };

  for (const simple of splitCommands(command)) {
    const t = tokens(simple);
    const low = t.map((x) => x.toLowerCase());
    const has = (re) => re.test(simple);

    // --- git ---
    const gi = low.indexOf('git');
    if (gi !== -1) {
      let j = gi + 1;
      while (j < t.length && /^(-C|-c|--git-dir|--work-tree)$/.test(t[j])) j += 2; // skip global options with a value
      const g = t.slice(j);
      const sub = (g[0] || '').toLowerCase();
      if (sub === 'push') take(checkGitPush(g, protectedList));
      if (sub === 'reset' && g.includes('--hard')) take(ask('git reset --hard discards uncommitted work.'));
      if (sub === 'clean' && g.some((a) => /^-[a-z]*f/.test(a) || a === '--force')) take(ask('git clean -f deletes untracked files (possibly the user\'s work).'));
      if (sub === 'checkout' && (g.includes('--') || g.includes('.')) && !g.includes('-b')) take(ask('git checkout -- <paths> discards uncommitted changes.'));
      if (sub === 'restore' && !g.includes('--staged')) take(ask('git restore discards uncommitted changes.'));
      if (sub === 'stash' && (g[1] === 'drop' || g[1] === 'clear')) take(ask('Dropping stashed work.'));
      if (sub === 'branch' && g.some((a) => a === '-D' || a === '--delete' && g.includes('--force'))) take(ask('Force-deleting a local branch.'));
      if (sub === 'filter-branch' || sub === 'filter-repo') take(deny('History rewrite of the whole repository.'));
      if (sub === 'update-ref' && g.includes('-d')) take(ask('Deleting a ref.'));
      if (g.includes('--no-verify')) take(ask('--no-verify skips the repository\'s hooks.'));
      if (sub === 'merge' || sub === 'rebase') {
        // Merging/rebasing locally is fine; merging INTO a protected branch is checked via current branch by the caller.
        if (cfg.currentBranch && isProtected(cfg.currentBranch, protectedList)) take(ask(`git ${sub} while on protected branch ${cfg.currentBranch}.`));
      }
      if (sub === 'commit' && cfg.currentBranch && isProtected(cfg.currentBranch, protectedList)) take(ask(`Committing directly on protected branch ${cfg.currentBranch}.`));
    }

    // --- merge requests / pull requests ---
    if (/^(glab)$/.test(low[0] || '') && low[1] === 'mr' && /^(merge|approve)$/.test(low[2] || '')) take(ask(`glab mr ${low[2]}: merging/approving is the human reviewer's call.`));
    if (low[0] === 'gh' && low[1] === 'pr' && /^(merge|review)$/.test(low[2] || '')) take(ask(`gh pr ${low[2]}: merging/approving is the human reviewer's call.`));
    if (low[0] === 'az' && low.includes('pr') && (has(/--status\s+completed/i) || has(/--auto-complete\s+true/i))) take(ask('Completing an Azure DevOps PR merges it.'));

    // --- EF Core ---
    if (low[0] === 'dotnet' && low[1] === 'ef') {
      if (low[2] === 'database' && (low[3] === 'update' || low[3] === 'drop')) {
        const conn = sqlServerArg(t);
        const remote = conn && !LOCAL_SERVERS.test(conn);
        take(remote ? deny(`dotnet ef database ${low[3]} against non-local server "${conn}". Run it yourself after review.`) : ask(`dotnet ef database ${low[3]} changes a database schema. Confirm the target is your local DB.`));
      }
      if (low[2] === 'migrations' && low[3] === 'remove') take(ask('Removing an EF migration (may already be applied elsewhere).'));
    }

    // --- raw SQL clients ---
    if (/^(sqlcmd|invoke-sqlcmd|psql|mysql|osql)$/.test(low[0] || '') || low.includes('invoke-sqlcmd')) {
      const server = sqlServerArg(t);
      const remote = server && !LOCAL_SERVERS.test(server);
      const destructive = DESTRUCTIVE_SQL.test(simple) || low.some((x) => /^(-i|-inputfile)$/.test(x));
      if (remote && destructive) take(deny(`Data/schema change against non-local server "${server}". Run it yourself after review.`));
      else if (remote) take(ask(`Query against non-local server "${server}".`));
      else if (destructive) take(ask('SQL that changes data or schema (or runs a script file). Confirm the target and the statement.'));
    }

    // --- filesystem ---
    if (/^(rm)$/.test(low[0] || '') && low.some((x) => /^-[a-z]*r[a-z]*f|^-[a-z]*f[a-z]*r|^--recursive$/.test(x))) {
      const targets = t.slice(1).filter((x) => !x.startsWith('-'));
      if (targets.some((x) => /^(\/|~|\/\*|[a-z]:[\\/]?|\$home|\.|\*)$/i.test(x))) take(deny('Recursive delete of a root, home or current directory.'));
      else take(ask(`Recursive delete: ${targets.join(' ')}`));
    }
    if (/^(remove-item|rd|rmdir|del|ri)$/.test(low[0] || '') && low.some((x) => /^-r(ecurse)?$/.test(x) || x === '/s')) {
      const targets = t.slice(1).filter((x) => !x.startsWith('-') && !x.startsWith('/'));
      if (targets.some((x) => /^([a-z]:[\\/]?|~|\$home|\$env:userprofile|\.|\*)$/i.test(x))) take(deny('Recursive delete of a drive root, home or current directory.'));
      else take(ask(`Recursive delete: ${targets.join(' ')}`));
    }

    // --- secrets on the command line ---
    if (/\b(cat|type|get-content|gc)\b/i.test(low[0] || '') && t.slice(1).some((x) => /(^|[\\/])(\.env(\..*)?|secrets?\.json|.*\.pfx|.*\.pem|id_rsa|id_ed25519)$/i.test(x))) {
      take(ask('Printing a secrets file into the transcript.'));
    }
  }
  return worst;
}

export const SECRET_PATTERNS = [
  [/-----BEGIN (RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/, 'a private key'],
  [/\bghp_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{60,}\b/, 'a GitHub token'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'a GitLab token'],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}\b/, 'an Anthropic API key'],
  [/\bsk-(proj-)?[A-Za-z0-9_-]{32,}\b/, 'an OpenAI API key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, 'a Slack token'],
  [/\bAccountKey=[A-Za-z0-9+/=]{40,}/, 'an Azure storage key'],
];
const PASSWORD_IN_CONN = /\b(Password|Pwd)\s*=\s*(?!\s*[;"']|\s*\$\{|\s*\{\{|\s*<|\s*\*+|\s*(your|change|xxx|placeholder))[^;"'\s]{3,}/i;

export function evaluateWrite(toolName, input) {
  const path = String(input.file_path || '').replace(/\\/g, '/');
  if (/(^|\/)\.git\//.test(path)) return deny('Writing inside .git/ directly.');
  if (/(^|\/)\.factory\/(checks|guard|routing)\.json$/i.test(path)) {
    return ask('Changing the factory gate/guard/routing config for this repo. Approve only if you asked for it.');
  }
  const texts = [];
  if (typeof input.content === 'string') texts.push(input.content);
  if (typeof input.new_string === 'string') texts.push(input.new_string);
  if (Array.isArray(input.edits)) for (const e of input.edits) if (typeof e?.new_string === 'string') texts.push(e.new_string);
  const text = texts.join('\n');
  for (const [re, what] of SECRET_PATTERNS) if (re.test(text)) return deny(`The content contains what looks like ${what}. Reference it from configuration / user-secrets instead.`);
  if (PASSWORD_IN_CONN.test(text)) return ask('The content contains a literal password in a connection string. Prefer user-secrets or environment variables.');
  return null;
}

// Whole-file reads of large code/data files are the biggest avoidable token cost (e.g. an 8,800-line
// service). Force range reads: locate with graphify / grep -n, then Read with offset+limit.
const RANGE_READ_EXT = /\.(cs|cshtml|razor|vb|fs|js|mjs|cjs|ts|tsx|jsx|vue|sql|json|xml|resx|config|csproj|props|targets|css|scss|less|html?|py|ps1|ya?ml|log|txt|csv)$/i;
export const DEFAULT_MAX_FULL_READ_LINES = 400;

export function evaluateRead(input, cfg = {}) {
  const path = String(input.file_path || '');
  if (input.limit != null || input.offset != null || input.pages) return null; // already a range read
  if (!RANGE_READ_EXT.test(path) || /(^|[\\/])\.factory[\\/]/.test(path)) return null;
  let size;
  try { size = statSync(path).size; } catch { return null; }
  const max = Number(cfg.max_full_read_lines) || DEFAULT_MAX_FULL_READ_LINES;
  if (size < max * 40) return null; // cheap pre-check: cannot exceed max lines
  const lines = size > 8 * 1024 * 1024 ? Infinity : readFileSync(path, 'utf8').split('\n').length;
  if (lines <= max) return null;
  return deny(`${path} has ${lines === Infinity ? 'millions of bytes /' : lines} lines. Read by range instead: find the symbol with \`graphify explain "<Symbol>"\` or \`grep -n\`, then Read with offset and limit (about 150 lines around it).`);
}

function currentBranch(root) {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

function main() {
  const kind = process.argv[2];
  const input = readStdinJson();
  const cwd = input.cwd || process.cwd();
  const root = gitRoot(cwd);
  const cfg = (root && readJson(join(root, '.factory', 'guard.json'), {})) || {};
  let result = null;
  if (kind === 'shell') {
    const command = String(input.tool_input?.command || '');
    if (root) cfg.currentBranch = currentBranch(root);
    result = evaluateShell(command, cfg);
  } else if (kind === 'write') {
    result = evaluateWrite(input.tool_name, input.tool_input || {});
  } else if (kind === 'read') {
    const ti = { ...(input.tool_input || {}) };
    if (ti.file_path && !isAbsolute(ti.file_path)) ti.file_path = join(cwd, ti.file_path);
    result = evaluateRead(ti, cfg);
  }
  if (!result) return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: result.decision,
      permissionDecisionReason: `[dotnet-factory guard] ${result.reason}`,
    },
  }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch { /* fail open */ }
}
