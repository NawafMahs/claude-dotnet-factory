// SessionStart hook: inject the engineering principles plus a one-paragraph view of
// this repository's factory state. Never fails the session.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLUGIN_ROOT, git, gitRoot, readStdinJson } from './lib.mjs';

function main() {
  const input = readStdinJson();
  const cwd = input.cwd || process.cwd();
  const parts = [readFileSync(join(PLUGIN_ROOT, 'principles.md'), 'utf8').trim()];

  const root = gitRoot(cwd);
  if (root) {
    const f = join(root, '.factory');
    const lines = ['', '## This repository'];
    if (existsSync(join(f, 'profile.md'))) {
      lines.push(`- Factory profile: \`${join(f, 'profile.md')}\` (read it before working here).`);
    } else {
      lines.push('- No factory profile yet. Before a non-trivial task, suggest `/dotnet-factory:discover`.');
    }
    if (existsSync(join(f, 'checks.json'))) lines.push('- Gate: `.factory/checks.json` defines the checks (`/dotnet-factory:verify`).');
    const graph = join(root, 'graphify-out', 'graph.json');
    if (existsSync(graph)) {
      const built = statSync(graph).mtime;
      let since = 0;
      try { since = Number(git(root, ['rev-list', '--count', `--since=${built.toISOString()}`, 'HEAD']).trim()) || 0; } catch { /* shallow or empty */ }
      lines.push(since > 0
        ? `- Knowledge graph built ${built.toISOString().slice(0, 10)}, ${since} commit(s) since: run \`graphify update .\` (AST only, no LLM tokens) before relying on it. Then query it before reading code.`
        : '- Knowledge graph `graphify-out/` is current: query it before reading code.');
    }
    if (existsSync(join(f, 'knowledge'))) {
      const n = readdirSync(join(f, 'knowledge')).filter((x) => x.endsWith('.md')).length;
      if (n) lines.push(`- ${n} knowledge note(s) in \`.factory/knowledge/\`; check \`INDEX.md\` before re-investigating.`);
    }
    if (existsSync(join(f, 'jobs'))) {
      const open = readdirSync(join(f, 'jobs')).filter((j) => existsSync(join(f, 'jobs', j, 'task.md')) && !existsSync(join(f, 'jobs', j, 'delivery.md')));
      if (open.length) lines.push(`- Open factory jobs: ${open.slice(-5).join(', ')}.`);
    }
    parts.push(lines.join('\n'));
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: parts.join('\n') },
  }));
}

try { main(); } catch { /* never block a session on our context */ }
