import { lstatSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { reviewedScreenshot } from './public-assets.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const findings = [];
const publicAssets = JSON.parse(readFileSync(new URL('../docs/public-assets.json', import.meta.url), 'utf8'));
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  [
    'internal URL',
    /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9.-]+\.local)(?=[:/\s"']|$)/i,
  ],
];

// Scan Git publication inputs, including tracked files in otherwise ignored
// directories. Python caches/build outputs are not publication inputs; the
// final ZIP has a separate strict allowlist and content check.
const inputs = new Set(
  execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean),
);
for (const relative of inputs) {
  const full = path.join(root, relative);
  let entry;
  try {
    entry = lstatSync(full);
  } catch (error) {
    if (error.code === 'ENOENT') continue; // A deletion pending in the worktree.
    throw error;
  }
  if (entry.isSymbolicLink() || !entry.isFile()) {
    findings.push(`${relative}: symlinks are not permitted in publication inputs`);
    continue;
  }
  if (/(?:^|\/)(?:\.env(?:\..*)?|secrets?\.ya?ml|configuration\.ya?ml|\.storage|id_rsa|id_ed25519)$/i.test(relative))
    findings.push(`${relative}: sensitive filename`);
  const media = /\.(?:svg|png|jpe?g|webp|pdf|zip|ha_backup)$/i.test(relative);
  if (media && !reviewedScreenshot(relative, readFileSync(full), publicAssets))
    findings.push(`${relative}: media requires an explicit public-asset review before admission`);
  if (entry.size > 2_000_000) {
    findings.push(`${relative}: oversized publication input`);
    continue;
  }
  if (media) continue;
  const body = readFileSync(full, 'utf8');
  for (const [reason, pattern] of patterns) if (pattern.test(body)) findings.push(`${relative}: ${reason}`);
}
if (findings.length) {
  console.error('Public boundary review failed (contents are deliberately not logged):');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else
  console.log(
    'Public boundary checks passed. Human review of all staged files and history is still required before publication.',
  );
