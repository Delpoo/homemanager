import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const excluded = new Set(['.git', 'node_modules', '.work']);
const findings = [];
const patterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['GitHub credential', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['JWT credential', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/],
  ['internal URL', /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9.-]+\.local)(?=[:/\s"']|$)/i]
];

function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && excluded.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join('/');
    if (entry.isSymbolicLink()) { findings.push(`${relative}: symlinks are not permitted in publication inputs`); continue; }
    if (entry.isDirectory()) { visit(full); continue; }
    if (/(?:^|\/)(?:\.env(?:\..*)?|secrets?\.ya?ml|configuration\.ya?ml|\.storage|id_rsa|id_ed25519)$/i.test(relative)) findings.push(`${relative}: sensitive filename`);
    if (/\.(?:svg|png|jpe?g|webp|pdf|zip|ha_backup)$/i.test(relative)) findings.push(`${relative}: media requires an explicit public-asset review before admission`);
    if (statSync(full).size > 2_000_000) { findings.push(`${relative}: oversized publication input`); continue; }
    const body = readFileSync(full, 'utf8');
    for (const [reason, pattern] of patterns) if (pattern.test(body)) findings.push(`${relative}: ${reason}`);
  }
}
visit(root);
if (findings.length) {
  console.error('Public boundary review failed (contents are deliberately not logged):');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exitCode = 1;
} else console.log('Public boundary checks passed. Human review of all staged files and history is still required before publication.');
