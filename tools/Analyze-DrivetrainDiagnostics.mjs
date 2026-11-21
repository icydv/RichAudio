import {readFileSync, writeFileSync, statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function analyze(text) {
  const rows = text.split(/\r?\n/).filter(x => x.trim()).map(x => JSON.parse(x));
  if (rows.some(x => x.DiagnosticSchemaVersion !== 1 || x.DiagnosticOnly !== true)) throw new Error('Unsupported diagnostic schema');
  const sessions = new Set(rows.map(x => x.SessionId));
  if (sessions.size > 1) throw new Error('Mixed diagnostic sessions');
  const groups = new Map(), last = new Map(), shifts = [], prepare = [];
  let observations = 0, samples = 0;
  for (const frame of rows.filter(x => x.Kind === 'diagnostic_sample')) {
    samples++; prepare.push(frame.PrepareMs ?? 0);
    for (const v of frame.Vehicles) {
      observations++;
      const key = JSON.stringify([frame.Context, v.Role, v.EngineRunning?.value ?? 'unavailable', v.Model?.value ?? 'unavailable']);
      if (!groups.has(key)) groups.set(key, {context: frame.Context, role: v.Role, engineOn: v.EngineRunning?.value ?? null, model: v.Model?.value ?? null, count: 0, finite: 0, nonfinite: 0, exceptions: 0, unavailable: 0, validatedAvailable: 0, rawMin: null, rawMax: null, speedMin: null, speedMax: null, gears: new Set(), repeated: new Map()});
      const g = groups.get(key), raw = v.RawRpm;
      g.count++;
      if (raw?.GetterStatus === 'returned' && raw.IsFinite === true && Number.isFinite(raw.RawValue)) {
        g.finite++; g.rawMin = g.rawMin === null ? raw.RawValue : Math.min(g.rawMin, raw.RawValue); g.rawMax = g.rawMax === null ? raw.RawValue : Math.max(g.rawMax, raw.RawValue);
        const token = String(raw.RawValue); if (g.repeated.has(token) || g.repeated.size < 32) g.repeated.set(token, (g.repeated.get(token) ?? 0) + 1);
      } else if (raw?.GetterStatus === 'exception') g.exceptions++;
      else if (raw?.IsFinite === false) g.nonfinite++;
      else g.unavailable++;
      if (v.ValidatedRpmRatio?.status === 'observed') g.validatedAvailable++;
      const speed = v.SpeedMps?.value;
      if (Number.isFinite(speed)) {g.speedMin = g.speedMin === null ? speed : Math.min(speed, g.speedMin); g.speedMax = g.speedMax === null ? speed : Math.max(speed, g.speedMax);}
      const gear = v.Gear?.value;
      if (Number.isInteger(gear)) {
        g.gears.add(gear); const previous = last.get(v.TrackingId);
        if (previous && frame.TimestampSeconds > previous.time && frame.TimestampSeconds - previous.time <= 0.5 && previous.gear !== gear) shifts.push({trackingId: v.TrackingId, time: frame.TimestampSeconds, context: frame.Context, from: previous.gear, to: gear, role: v.Role});
        last.set(v.TrackingId, {time: frame.TimestampSeconds, gear});
      }
    }
  }
  const footer = rows.at(-1), values = prepare.sort((a,b) => a-b);
  return {diagnosticSchemaVersion: 1, scope: 'Unverified raw getter observations; no normalization or physical RPM calibration; gear transitions are getter changes, not independently observed shifts', complete: rows[0]?.Kind === 'diagnostic_start' && footer?.Kind === 'diagnostic_end', samples, observations, writtenFrames: footer?.WrittenFrames ?? null, queueDrops: footer?.QueueDrops ?? null, byteLimitOmissions: footer?.ByteLimitOmissions ?? null, firstSampleSeconds: rows.find(x => x.Kind === 'diagnostic_sample')?.TimestampSeconds ?? null, lastSampleSeconds: rows.findLast(x => x.Kind === 'diagnostic_sample')?.TimestampSeconds ?? null, prepareP95Ms: values.length ? values[Math.ceil(values.length * 0.95) - 1] : null, gearGetterTransitions: shifts, groups: [...groups.values()].map(g => ({...g, gears: [...g.gears].sort((a,b) => a-b), first32DistinctRawFrequencies: Object.fromEntries(g.repeated), repeated: undefined}))};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 4) throw new Error('Usage: node Analyze-DrivetrainDiagnostics.mjs private-diagnostic.jsonl private-report.json');
  if (statSync(process.argv[2]).size > 64 * 1024 * 1024) throw new Error('Input exceeds 64 MiB analysis limit');
  writeFileSync(process.argv[3], JSON.stringify(analyze(readFileSync(process.argv[2], 'utf8')), null, 2) + '\n', {flag: 'wx'});
}
