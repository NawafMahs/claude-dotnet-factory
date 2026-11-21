import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateShell, evaluateWrite, evaluateRead } from '../scripts/guard.mjs';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('large code files must be read by range', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-read-'));
  const big = join(dir, 'TransactionsService.cs');
  writeFileSync(big, Array.from({ length: 900 }, (_, i) => `    var line${i} = ${i}; // some code here`).join('\n'));
  const small = join(dir, 'Small.cs');
  writeFileSync(small, 'class S {}\n');
  const md = join(dir, 'notes.md');
  writeFileSync(md, 'x\n'.repeat(2000));
  mkdirSync(join(dir, '.factory'));
  const job = join(dir, '.factory', 'checks.log');
  writeFileSync(job, 'x\n'.repeat(2000));
  const r = (input, cfg) => evaluateRead(input, cfg)?.decision ?? 'allow';
  assert.equal(r({ file_path: big }), 'deny');
  assert.match(evaluateRead({ file_path: big }).reason, /900 lines.*graphify explain/);
  assert.equal(r({ file_path: big, offset: 100, limit: 150 }), 'allow');
  assert.equal(r({ file_path: big, limit: 150 }), 'allow');
  assert.equal(r({ file_path: small }), 'allow');
  assert.equal(r({ file_path: md }), 'allow', 'markdown docs are not code');
  assert.equal(r({ file_path: job }), 'allow', 'factory stage files are exempt');
  assert.equal(r({ file_path: big }, { max_full_read_lines: 1000 }), 'allow', 'threshold is configurable');
  assert.equal(r({ file_path: join(dir, 'missing.cs') }), 'allow');
});

const d = (cmd, cfg) => evaluateShell(cmd, cfg)?.decision ?? 'allow';
const w = (input) => evaluateWrite('Write', input)?.decision ?? 'allow';

test('ordinary commands pass through', () => {
  for (const c of [
    'git status --porcelain',
    'git log --oneline -20',
    'git diff origin/Development...HEAD',
    'git push -u origin fix/tm-report-search',
    'git checkout -b feat/new-thing',
    'git restore --staged App.Api/Controllers/X.cs',
    'git add App.Api/Controllers/X.cs',
    'git commit -m "fix(api): x"',
    'dotnet build App.sln -nologo',
    'dotnet test',
    'dotnet ef migrations add AddExaminerId',
    'sqlcmd -S . -d AppDb -Q "SELECT TOP 10 * FROM Transactions"',
    'glab mr create --draft --title x',
    'gh pr create --draft',
    'rm -f build.log',
    'Remove-Item _tmp\\x.txt',
    'git push --follow-tags origin feat/x',
  ]) assert.equal(d(c, { currentBranch: 'feat/x' }), 'allow', c);
});

test('force push: ask on feature branch, deny on protected', () => {
  assert.equal(d('git push --force origin feat/x'), 'ask');
  assert.equal(d('git push -f'), 'ask');
  assert.equal(d('git push --force-with-lease origin feat/x'), 'ask');
  assert.equal(d('git push origin +feat/x'), 'ask');
  assert.equal(d('git push --force origin main'), 'deny');
  assert.equal(d('git push -f origin HEAD:main'), 'deny');
  assert.equal(d('git push origin +Development'), 'deny');
  assert.equal(d('git -C C:/repo push --force origin release/2.1'), 'deny');
});

test('direct push / delete of protected branches', () => {
  assert.equal(d('git push origin main'), 'ask');
  assert.equal(d('git push origin HEAD:Development'), 'ask');
  assert.equal(d('git push origin --delete main'), 'deny');
  assert.equal(d('git push origin :main'), 'deny');
  assert.equal(d('git push origin --delete feat/old'), 'ask');
  assert.equal(d('git push --mirror'), 'deny');
  assert.equal(d('git push origin qa-env', { protected_branches: ['qa-env'] }), 'ask');
});

test('discarding user work asks', () => {
  for (const c of ['git reset --hard', 'git reset --hard origin/main', 'git clean -fd', 'git clean -xfd', 'git checkout -- .', 'git checkout .', 'git restore App.Api/x.cs', 'git stash drop', 'git stash clear', 'git branch -D feat/x', 'git commit --no-verify -m x']) {
    assert.equal(d(c, { currentBranch: 'feat/x' }), 'ask', c);
  }
  assert.equal(d('git filter-branch --tree-filter x'), 'deny');
});

test('committing or merging on a protected branch asks', () => {
  assert.equal(d('git commit -m x', { currentBranch: 'main' }), 'ask');
  assert.equal(d('git merge feat/x', { currentBranch: 'Development' }), 'ask');
  assert.equal(d('git merge origin/Development', { currentBranch: 'feat/x' }), 'allow');
});

test('merging MRs/PRs asks', () => {
  assert.equal(d('glab mr merge 970'), 'ask');
  assert.equal(d('glab mr approve 970'), 'ask');
  assert.equal(d('gh pr merge 12 --squash'), 'ask');
  assert.equal(d('az repos pr update --id 5 --status completed'), 'ask');
});

test('EF Core database commands', () => {
  assert.equal(d('dotnet ef database update'), 'ask');
  assert.equal(d('dotnet ef database update --connection "Server=.;Database=X;Trusted_Connection=True"'), 'ask');
  assert.equal(d('dotnet ef database update --connection "Server=PROD-SQL01\\SQL2019;Database=X"'), 'deny');
  assert.equal(d('dotnet ef database drop -f'), 'ask');
  assert.equal(d('dotnet ef migrations remove'), 'ask');
});

test('raw SQL clients', () => {
  assert.equal(d('sqlcmd -S . -Q "DELETE FROM Transactions WHERE Id = 1"'), 'ask');
  assert.equal(d('sqlcmd -S localhost -i Add_ExaminerId_To_Transactions.sql'), 'ask');
  assert.equal(d('sqlcmd -S PROD-SQL01\\SQL2019 -Q "SELECT 1"'), 'ask');
  assert.equal(d('sqlcmd -S PROD-SQL01\\SQL2019 -Q "UPDATE Transactions SET Status = 2"'), 'deny');
  assert.equal(d('Invoke-Sqlcmd -ServerInstance 10.0.0.5 -Query "DROP TABLE X"'), 'deny');
  assert.equal(d('psql -h dev-db.internal -c "TRUNCATE TABLE x"'), 'deny');
  assert.equal(d('sqlcmd -S (localdb)\\MSSQLLocalDB -Q "SELECT 1"'), 'allow');
});

test('recursive deletes', () => {
  assert.equal(d('rm -rf node_modules'), 'ask');
  assert.equal(d('rm -rf /'), 'deny');
  assert.equal(d('rm -rf ~'), 'deny');
  assert.equal(d('rm -rf .'), 'deny');
  assert.equal(d('Remove-Item -Recurse -Force bin'), 'ask');
  assert.equal(d('Remove-Item -Recurse -Force C:\\'), 'deny');
});

test('chained commands take the worst decision', () => {
  assert.equal(d('git add x.cs && git commit -m x && git push --force origin main'), 'deny');
  assert.equal(d('dotnet build; git reset --hard'), 'ask');
  assert.equal(d('echo "git push --force origin main"'), 'allow'); // quoted text, not a command
});

test('allow list overrides', () => {
  assert.equal(d('git push --force origin feat/x', { allow: ['^git push --force origin feat/'] }), 'allow');
});

test('secrets in writes', () => {
  assert.equal(w({ file_path: 'a.cs', content: 'var k = "ghp_' + 'a'.repeat(36) + '";' }), 'deny');
  assert.equal(w({ file_path: 'a.cs', content: 'key: glpat-abcdefghij1234567890' }), 'deny');
  assert.equal(w({ file_path: 'a.cs', content: '-----BEGIN RSA PRIVATE KEY-----\nabc' }), 'deny');
  assert.equal(w({ file_path: 'a.cs', content: 'sk-ant-api03-' + 'x'.repeat(30) }), 'deny');
  assert.equal(w({ file_path: 'appsettings.json', content: '"Default": "Server=x;Database=y;User Id=sa;Password=S3cret!;"' }), 'ask');
  assert.equal(w({ file_path: 'appsettings.json', content: '"Default": "Server=.;Database=y;Trusted_Connection=True;"' }), 'allow');
  assert.equal(w({ file_path: 'appsettings.json', content: '"Default": "Server=x;Password=${DB_PASSWORD};"' }), 'allow');
  assert.equal(w({ file_path: 'appsettings.json', content: '"Default": "Server=x;Password=;"' }), 'allow');
  assert.equal(w({ file_path: 'C:/repo/.git/config', content: 'x' }), 'deny');
  assert.equal(w({ file_path: 'C:/repo/.factory/checks.json', content: '{}' }), 'ask');
  assert.equal(w({ file_path: 'C:/repo/.factory/jobs/x/build.md', content: 'STATUS: READY' }), 'allow');
  assert.equal(evaluateWrite('Edit', { file_path: 'x.cs', new_string: 'AKIAABCDEFGHIJKLMNOP' })?.decision, 'deny');
  assert.equal(evaluateWrite('MultiEdit', { file_path: 'x.cs', edits: [{ new_string: 'ok' }, { new_string: 'xoxb-1234567890-abc' }] })?.decision, 'deny');
});
