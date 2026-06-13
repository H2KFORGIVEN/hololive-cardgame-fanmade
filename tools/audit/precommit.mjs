#!/usr/bin/env node
// Phase 1.2 — Pre-commit gate.
//
// Runs effect-coverage.mjs --diff. If HIGH severity went up, exits 1
// to block the commit. Otherwise exits 0. Prints summary either way.
//
// Install as a git pre-commit hook:
//   ln -sf ../../tools/audit/precommit.mjs .git/hooks/pre-commit
// Or call from package.json scripts / lefthook / husky.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const auditScript = path.join(__dirname, 'effect-coverage.mjs');

console.log('[precommit] Running effect-coverage audit…');

const r = spawnSync('node', [auditScript, '--diff'], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..', '..'),
});

if (r.status !== 0) {
  console.error('\n❌ Pre-commit blocked: effect-handler regression detected.');
  console.error('   Either fix the handlers or update the baseline (intentionally) with:');
  console.error('     node tools/audit/effect-coverage.mjs --baseline\n');
  process.exit(1);
}

console.log('[precommit] ✓ No new HIGH severity issues. Allowing commit.');
process.exit(0);
