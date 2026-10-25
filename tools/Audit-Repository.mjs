// Read-only Git audit. Reports locations/categories, never matched private values.
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
const git = (...args) => execFileSync('git', args, {maxBuffer: 64 * 1024 * 1024});
const current = process.argv.includes('--current');
const outputIndex = process.argv.indexOf('--output');
const objects = new Map();
const entries = current ? git('ls-files', '-s').toString().trim().split('\n').map(l => {
  const m = l.match(/^\d+ ([a-f0-9]+) \d\t(.+)$/); return m ? [m[1], m[2]] : null;
}).filter(Boolean) : git('rev-list', '--objects', '--all').toString().trim().split('\n').map(l => {
  const space = l.indexOf(' '); return [space < 0 ? l : l.slice(0, space), space < 0 ? '' : l.slice(space + 1)];
});
for (const [oid, path] of entries) if (!objects.has(oid)) objects.set(oid, path);
const rules = [
  ['personal-directory', /[A-Z]:[\\/]+Users[\\/]+(?!Public(?:[\\/]|$)|Default(?:[\\/]|$))[^\s"'<>]+/i],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['credential-pattern', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|AKIA[A-Z0-9]{16})\b/],
  ['machine-identifier-review', /["']?(?:ComputerName|MachineName|MachineGuid|SerialNumber|HardwareId)["']?\s*[:=]\s*["'][^"']+["']/i]
];
const findings = []; let blobs = 0, bytes = 0;
for (const [oid, path] of objects) {
  if (git('cat-file', '-t', oid).toString().trim() !== 'blob') continue;
  const content = git('cat-file', 'blob', oid); blobs++; bytes += content.length;
  if (/\.(?:exe|dll|asi|rpf|awc|ybn|ymap|ytyp|ydr|ytd|yft|wav|flac|ogg|mp3|zip|7z|pdb)$/i.test(path) ||
      content.subarray(0, 2).toString() === 'MZ' || content.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4])) || content.includes(0)) {
    findings.push({oid, path, category: 'binary-or-restricted-asset-review'}); continue;
  }
  const lines = content.toString('utf8').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) for (const [category, pattern] of rules) {
    if (pattern.test(lines[i])) findings.push({oid, path, line: i + 1, category});
  }
}
const report = {schemaVersion: 1, scope: current ? 'index' : 'all-reachable-history',
  head: git('rev-parse', 'HEAD').toString().trim(), commits: Number(git('rev-list', '--count', '--all').toString()),
  blobs, bytes, findings, pushAllowedByAutomatedChecks: findings.length === 0,
  limitations: 'Pattern screening is not a proof of absence of secrets or redistribution rights. Review origins and findings before any push.'};
const counts = {};
for (const finding of findings) counts[finding.category] = (counts[finding.category] || 0) + 1;
if (outputIndex >= 0) writeFileSync(process.argv[outputIndex + 1], JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({scope: report.scope, commits: report.commits, blobs, bytes, counts, pushAllowed: report.pushAllowedByAutomatedChecks}));
process.exitCode = findings.length ? 2 : 0;
