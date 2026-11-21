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
  ['signed-or-authenticated-url-review', /[?&](?:access_token|auth_token|api_key|X-Amz-Signature|csrfKey)=[^\s"'&]+/i],
  ['machine-identifier-review', /["']?(?:ComputerName|MachineName|MachineGuid|SerialNumber|HardwareId)["']?\s*[:=]\s*["'][^"']+["']/i]
];
const findings = []; let blobs = 0, bytes = 0;
if (!current) {
  for (const ref of git('for-each-ref', '--format=%(refname)').toString().trim().split('\n').filter(Boolean)) {
    if (rules[0][1].test(ref)) findings.push({path: '<ref-name>', category: 'personal-directory'});
  }
  for (const oid of git('rev-list', '--all').toString().trim().split('\n').filter(Boolean)) {
    const metadata = git('cat-file', 'commit', oid).toString('utf8');
    for (const [category, pattern] of rules) if (pattern.test(metadata)) findings.push({oid, path: '<commit-metadata>', category});
    for (const line of metadata.split('\n').filter(l => /^(author|committer) /.test(l))) {
      if (!/ <[^<>]+@(?:users\.noreply\.github\.com|richaudio\.invalid)> /.test(line)) {
        findings.push({oid, path: '<commit-identity>', category: 'nonapproved-email-review'});
      }
    }
    for (const name of git('ls-tree', '-r', '--name-only', oid).toString().split('\n')) {
      if (rules[0][1].test(name)) findings.push({oid, path: '<historical-filename>', category: 'personal-directory'});
    }
  }
}
// Check every filename, including two paths that reference the same blob.
// Blob deduplication must not hide a restricted extension behind a benign name.
const restrictedAssetPath = path => /\.(?:exe|dll|asi|rpf|awc|ybn|ymap|ytyp|ydr|ytd|yft|wav|f32le|pcm|rasoundmap-context|flac|ogg|mp3|zip|7z|pdb|ratile|pending)$/i.test(path);
for (const [oid, path] of entries) if (restrictedAssetPath(path)) {
  findings.push({oid, path, category: 'binary-or-restricted-asset-review'});
}
for (const [oid, path] of objects) {
  if (git('cat-file', '-t', oid).toString().trim() !== 'blob') continue;
  const content = git('cat-file', 'blob', oid); blobs++; bytes += content.length;
  if (restrictedAssetPath(path)) continue;
  if (content.subarray(0, 24).toString().startsWith('RichAudio-Acoustic-Tile\n') ||
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
