"""Measure the focused private Source04 comparison and build its four-vehicle page."""
import argparse, hashlib, html, json, math, os, re, sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path)
parser.add_argument('--dependencies', type=Path)
parser.add_argument('--evidence', type=Path)
args = parser.parse_args()
if args.dependencies:
    sys.path.insert(0, str(args.dependencies))
import numpy as np
from scipy import signal
from scipy.io import wavfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out = args.output.resolve()
assert '.local' in out.parts
render = json.loads((out / 'render-report.json').read_text('utf8'))
assert render['status'] == 'complete' and len(render['files']) == 28
models = {'bati': 'Pegassi Bati 801', 'lectro': 'Principe Lectro', 'prototipo': 'Grotti X80 Proto', 'schafter3': 'Benefactor Schafter V12'}
windows = {'high hold': (6, 12), 'deceleration': (15.3, 16.3), 'settled idle': (20, 23)}
audio, measured = {}, []
def db(x):
    return float(20 * math.log10(x)) if x > 0 else None
def read(file):
    rate, data = wavfile.read(file)
    kind, size = data.dtype.kind, data.dtype.itemsize
    if data.ndim == 1:
        data = data[:, None]
    data = data.astype(np.float64)
    if kind == 'i':
        data /= 2 ** (size * 8 - 1)
    elif kind == 'u':
        data = (data - 2 ** (size * 8 - 1)) / 2 ** (size * 8 - 1)
    assert rate == 48000 and data.shape[1] == 2 and np.isfinite(data).all()
    return rate, data
def spectrum(data, rate, segment=8192):
    f, p = signal.welch(data, fs=rate, nperseg=min(segment, len(data)), axis=0)
    return f, p.mean(axis=1)
def levels(data, rate):
    f, p = spectrum(data, rate, 2048)
    band = {}
    for name, lo, hi in [('low20to500', 20, 500), ('mid500to2000', 500, 2000), ('high2000toNyquist', 2000, rate / 2)]:
        mask = (f >= lo) & (f < hi)
        band[name] = float(np.trapezoid(p[mask], f[mask]))
    return {'rms': float(np.sqrt(np.mean(data ** 2))), 'rmsDbfs': db(float(np.sqrt(np.mean(data ** 2)))),
            'peak': float(np.max(abs(data))), 'peakDbfs': db(float(np.max(abs(data)))), 'bandPower': band,
            'nonfiniteSamples': int(np.count_nonzero(~np.isfinite(data))), 'fullScaleSamples': int(np.count_nonzero(abs(data) >= 1))}
def cut(data, rate, interval):
    return data[round(interval[0] * rate):round(interval[1] * rate)]
def texture(data, rate):
    x = cut(data, rate, windows['high hold']).mean(axis=1)
    x -= x.mean()
    n = len(x)
    size = 1 << (2 * n - 1).bit_length()
    ac = np.fft.irfft(abs(np.fft.rfft(x, size)) ** 2, size)[:n]
    energy = np.r_[0., np.cumsum(x * x)]
    lags = np.arange(round(.12 * rate), round(.8 * rate))
    norm = np.sqrt(np.maximum(energy[n - lags] * (energy[n] - energy[lags]), 1e-30))
    c = ac[lags] / norm
    best = int(np.argmax(c))
    block = round(.05 * rate)
    envelope = np.sqrt(np.mean(x[:n // block * block].reshape(-1, block) ** 2, axis=1))
    return {'windowSeconds': list(windows['high hold']), 'maximum120to800msCorrelation': float(c[best]),
            'lagSeconds': float(lags[best] / rate), 'envelope50msCoefficientOfVariation': float(np.std(envelope) / max(np.mean(envelope), 1e-30)),
            'interpretation': 'Descriptors only; periodic engines have strong correlation. These are not perceptual acceptance thresholds.'}

for record in render['files']:
    file = out / record['file']
    assert hashlib.sha256(file.read_bytes()).hexdigest() == record['sha256']
    rate, data = read(file)
    audio[record['file']] = (rate, data)
    row = {'model': record['model'], 'name': record['name'], 'file': record['file'], 'sha256': record['sha256'],
           'durationSeconds': len(data) / rate, **levels(data, rate)}
    voices = [voice for role in record['voices'].values() for voice in role.values()]
    correlations = [v['stats']['texture']['minimumSpliceCorrelation'] for v in voices if v['stats']['texture'].get('minimumSpliceCorrelation') is not None]
    row['continuity'] = {'sourceMaximumAdjacentStep': record['sourceStats']['maximumStep'],
        'weakSplicesBelowRecordedCorrelationCriterion': sum(v['stats']['texture'].get('lowCoherenceSplices', 0) for v in voices) if record['player'] == 'new04' else None,
        'minimumRecordedSpliceCorrelation': min(correlations) if correlations else None,
        'criterionMeaning': 'Source04 correlation diagnostic across active voices including tiny IIR weight tails; count does not mean audible clicks or a listening verdict.'}
    if record['durationSeconds'] == 24:
        row['states'] = {label: {'windowSeconds': list(w), **levels(cut(data, rate, w), rate)} for label, w in windows.items()}
        if not record.get('mask'):
            row['heldTexture'] = texture(data, rate)
    else:
        row['nearPassAggregate'] = {'windowSeconds': [4.8, 5.8], **levels(cut(data, rate, (4.8, 5.8)), rate)}
        row['nearPass50ms'] = [{'windowSeconds': [round(t, 3), round(t + .05, 3)], **levels(cut(data, rate, (t, t + .05)), rate)}
                               for t in np.arange(4.8, 5.8, .05)]
        row['recession'] = {'windowSeconds': [9.3, 10.3], **levels(cut(data, rate, (9.3, 10.3)), rate)}
    measured.append(row)

before_measurements = []
for reference in render['beforeReferences']:
    file = Path(reference['path'])
    assert hashlib.sha256(file.read_bytes()).hexdigest() == reference['sha256']
    rate, data = read(file)
    before_measurements.append({**reference, 'levels': levels(data, rate), 'nearPassAggregate': {'windowSeconds': [4.8, 5.8], **levels(cut(data, rate, (4.8, 5.8)), rate)},
        'nearPass50ms': [{'windowSeconds': [round(t, 3), round(t + .05, 3)], **levels(cut(data, rate, (t, t + .05)), rate)} for t in np.arange(4.8, 5.8, .05)]})

checks = {'twentyEightNewWavs': len(render['files']) == 28,
          'fourCompleteSameGainSourceComparisons': all(len([f for f in render['files'] if f['model'] == model and f['name'] in ['old03-source', 'new04-source'] and f['durationSeconds'] == 24 and f['sourceGain'] == render['sourceGain']]) == 2 for model in models),
          'allGeneratedFiniteUnclipped': all(r['nonfiniteSamples'] == 0 and r['fullScaleSamples'] == 0 and r['peak'] < .98 for r in measured),
          'exactRendererHistoryRetardedAndEventChecks': all(all(f['checks'].values()) for f in render['files']),
          'earlierFilesPreserved': render.get('protectedInputsUnchanged') is True}
timings = []
for record in render['files']:
    if record['timings']:
        timings.append({'model': record['model'], 'name': record['name'], 'initializationMs': record['initializationMs'], 'wallMs': record['wallMs'],
            'sourceMisses': len(record['timings']['source']['misses']), 'renderAndControlMisses': len(record['timings']['rendererAndControl']['misses']),
            'completeMisses': len(record['timings']['complete']['misses']), 'completeP95Ms': record['timings']['complete']['p95Ms'], 'completeMaximumMs': record['timings']['complete']['maximumMs']})
report = {'schemaVersion': 1, 'milestone': 'STOCK-SOURCE-04', 'checks': checks, 'measurements': measured, 'beforeFlybys': before_measurements,
          'timingSummary': timings, 'timingMissDetails': 'Every missed block and its actual block deadline are retained in render-report.json; no timing-based acceptance claim.',
          'spectra': {'method': 'Welch,8192-frame Hann segments; absolute power density; same windows and axes; no level matching', 'stateWindowsSeconds': windows},
          'nearPass': {'windowSeconds': [4.8, 5.8], 'binsSeconds': .05, 'lowBandHz': [20, 500], 'midBandHz': [500, 2000], 'digitalLevelsNotPhysicalSpl': True},
          'subjectiveListeningPerformed': False, 'perceptualAcceptance': 'Pending user listening'}
(out / 'measurements.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', 'utf8')

plt.rcParams.update({'font.size': 9, 'figure.facecolor': '#ffffff', 'axes.grid': True, 'grid.alpha': .2})
for model in models:
    group = {r['name']: r for r in render['files'] if r['model'] == model}
    fig, axes = plt.subplots(2, 3, figsize=(13, 7))
    for col, (label, interval) in enumerate(windows.items()):
        for name, color in [('old03-source', '#b26620'), ('new04-source', '#175f9a')]:
            rate, data = audio[group[name]['file']]
            f, p = spectrum(cut(data, rate, interval), rate)
            axes[0, col].semilogx(f, 10 * np.log10(np.maximum(p, 1e-16)), label=name[:5], color=color)
        axes[0, col].set(xlim=(30, 16000), ylim=(-110, -20), title=f'{label}: {interval[0]}–{interval[1]} s', ylabel='Absolute PSD (dBFS²/Hz)', xlabel='Frequency (Hz)')
        axes[0, col].legend()
    for name, color in [('old03-source', '#b26620'), ('new04-source', '#175f9a')]:
        rows = group[name]['rows']
        for mode, style in [('idle', ':'), ('accel', '-'), ('decel', '--')]:
            times, rates = [], []
            for row in rows:
                times.append(row['timeSeconds'])
                rates.append(row['clocks']['engine']['voices'][mode]['materialRateHz'] if row['modeWeights'][['idle', 'accel', 'decel'].index(mode)] > .01 else np.nan)
            label = name[:5]+' '+mode+(' file loop' if name == 'old03-source' and mode == 'idle' else '')
            axes[1, 0].plot(times, rates, style, color=color, alpha=.65, label=label)
    axes[1, 0].set(title='Active interval / idle-file-loop clocks', xlabel='Time (s)', ylabel='Clock Hz;03 idle loop is not acoustic pitch')
    axes[1, 0].legend(fontsize=7, ncol=2)
    rows = group['new04-source']['rows']
    for role, color in [('engine', '#175f9a'), ('exhaust', '#b26620')]:
        axes[1, 1].plot([r['timeSeconds'] for r in rows], [r['clocks'][role]['commonRateHz'] for r in rows], color=color, label=role)
    axes[1, 1].set(title='04 role-local common interval clocks', xlabel='Time (s)', ylabel='Interval rate (Hz), not RPM'); axes[1, 1].legend()
    for mode, color in [('idle', '#2b7d42'), ('accel', '#175f9a'), ('decel', '#b26620')]:
        axes[1, 2].plot([r['timeSeconds'] for r in rows], [r['modeWeights'][['idle', 'accel', 'decel'].index(mode)] for r in rows], label=mode, color=color)
    axes[1, 2].set(title='Actual mode weights: held running idle after17 s', xlabel='Time (s)', ylabel='Weight', ylim=(-.03, 1.03)); axes[1, 2].legend()
    fig.suptitle(models[model]+' — same controls, native PCM and source gain; source player differs')
    fig.tight_layout(); fig.savefig(out / model / 'comparison.png', dpi=140); plt.close(fig)
    # Same digital scale and exact requested time/frequency resolution. These
    # show the emitted harmonics directly, independently of source-clock logs.
    fig, axes = plt.subplots(2, 1, figsize=(13, 7), sharex=True, sharey=True)
    for ax, name in zip(axes, ['old03-source', 'new04-source']):
        rate, data = audio[group[name]['file']]
        f, t, power = signal.spectrogram(data.mean(axis=1), fs=rate, window='hann', nperseg=4096, noverlap=4096-512,
                                         scaling='density', mode='psd')
        mask = (f >= 40) & (f <= 8000)
        mesh = ax.pcolormesh(t, f[mask], 10 * np.log10(np.maximum(power[mask], 1e-16)), shading='auto', cmap='magma', vmin=-105, vmax=-5)
        ax.set(yscale='log', ylim=(40, 8000), xlim=(0, 24), ylabel='Frequency (Hz)', title=name+' —4096 Hann /512 hop; absolute PSD')
        ax.grid(False)
        for boundary in [1.5, 4.5, 13.5, 17]:
            ax.axvline(boundary, color='white', alpha=.35, linewidth=.7)
    axes[-1].set_xlabel('Source time (s); held running idle17–24 s')
    fig.subplots_adjust(left=.08, right=.88, hspace=.25, top=.91, bottom=.08)
    bar = fig.colorbar(mesh, ax=axes, location='right', fraction=.03, pad=.02)
    bar.set_label('Absolute PSD (dBFS²/Hz); same −105…−5 scale')
    fig.suptitle(models[model]+' — matched complete-source time spectra; no level matching')
    fig.savefig(out / model / 'source-spectrogram.png', dpi=140); plt.close(fig)

if args.evidence:
    manifest = json.loads(Path(render['inputs']['manifestFile']).read_text('utf8'))
    pop_manifest = json.loads(Path(render['inputs']['popManifestFile']).read_text('utf8'))
    original = {v['model']: v for v in manifest['vehicles']}
    native_bindings = []
    for ref in render['nativeReferences']:
        asset = original[ref['model']]['layers'][ref['role']][ref['mode']]
        native_bindings.append({'model': ref['model'], 'role': ref['role'], 'mode': ref['mode'], 'sampleRate': ref['sampleRate'],
            'frames': asset['frames'], 'wavSha256': ref['sha256'], 'pcmSha256': asset['sha256']})
    comparisons, aggregate = [], []
    for model in models:
        files = {f['name']: f for f in render['files'] if f['model'] == model}
        comparisons.append({'model': model, 'source24ControlHashMatch': files['old03-source']['controlHash'] == files['new04-source']['controlHash'],
            'source24SettingsMatch': files['old03-source']['sourceConfiguration'] == files['new04-source']['sourceConfiguration'],
            'controlledFlybyMatches': {kind: {key: files['new04-controlled-'+kind][key] == next(r for r in render['beforeReferences'] if r['model'] == model and r['kind'] == kind)[key]
                for key in ['controlHash', 'motionHash']} for kind in ['open', 'street']}})
        for kind in ['open', 'street']:
            old = next(r for r in before_measurements if r['model'] == model and r['kind'] == kind)
            aggregate.append({'model': model, 'kind': kind, 'old03': old['nearPassAggregate'],
                'controlled04': next(r for r in measured if r['model'] == model and r['name'] == 'new04-controlled-'+kind)['nearPassAggregate'],
                'delayed04': next(r for r in measured if r['model'] == model and r['name'] == 'new04-delayed-'+kind)['nearPassAggregate']})
    files = []
    for f in render['files']:
        voices = {}
        for role, modes in f['voices'].items():
            voices[role] = {}
            for mode, v in modes.items():
                stats, texture_stats = v['stats'], v['stats']['texture']
                voices[role][mode] = {'renderedFrames': v['frames'], 'phaseAtEnd': v['phase'], 'clockCycles': v['clockCycles'],
                    'minimumClockRateHz': stats['minimumIntervalRateHz'], 'maximumClockRateHz': stats['maximumIntervalRateHz'],
                    'maximumBoundaryStep': v['maximumBoundaryStep'], 'sourceBoundViolations': stats['sourceBoundViolations'],
                    **{key: texture_stats.get(key) for key in ['maximumReaderStepChange', 'splices', 'lowCoherenceSplices', 'minimumSpliceCorrelation', 'modeRegistrations',
                        'transientRiskReads', 'uniqueIntervals', 'minimumPoolCycles', 'maximumPoolCycles', 'maximumMaterialRateDifference']}}
        files.append({key: f[key] for key in ['model', 'name', 'file', 'sha256', 'player', 'scenario', 'durationSeconds', 'sourceGain', 'sourceConfiguration', 'directivity',
            'sourceHash', 'controlHash', 'motionHash', 'eventPlan', 'metrics', 'checks', 'propagation', 'timings']} | {
            'initializationMs': f['initializationMs'] if not f.get('derivedFrom') else None, 'derivedFrom': f.get('derivedFrom'),
            'sourceMaximumAdjacentStep': f['sourceStats']['maximumStep'], 'sourceTransitions': f['sourceStats'].get('transitions'), 'voices': voices,
            'renderer': f['diagnostics']['renderer'] if f['diagnostics'] else None, 'history': f['diagnostics']['history'] if f['diagnostics'] else None,
            'simulationIncludingStartupMissingPast': f['diagnostics']['simulation'] if f['diagnostics'] else None})
    evidence = {'schemaVersion': 1, 'milestone': 'STOCK-SOURCE-04', 'status': render['status'], 'checks': checks, 'controls': render['controls'],
        'commonSourceGain': render['sourceGain'], 'rendererMasterGain': render['rendererMasterGain'], 'settingsReuse': render['settingsReuse'],
        'inputBindings': {key+'Sha256': hashlib.sha256(Path(render['inputs'][key]).read_bytes()).hexdigest() for key in ['manifestFile', 'sustainAtlasFile', 'mixFile', 'popManifestFile']},
        'moduleBindingsAtRender': render['moduleBindings'],
        'currentAuthoringToolBindings': {name: hashlib.sha256((Path(__file__).resolve().parent / name).read_bytes()).hexdigest() for name in ['Render-StockSource04.mjs', 'Analyze-StockSource04.py']},
        'rendererLocationDefaultsSanitizedAfterRender': True,
        'toolBindingNote': 'Renderer sibling-checkout location defaults were sanitized after rendering; actual render used explicit paths. Core, controls, gains and propagation were unchanged; the render-time renderer hash remains separately retained.',
        'nativeBindings': native_bindings,
        'nativePopBindings': [{key: a.get(key) for key in ['name', 'sampleRate', 'frames', 'sha256', 'sourceWavSha256']} for a in pop_manifest['variants']],
        'comparisons': comparisons, 'nearPassAggregates': aggregate, 'files': files,
        'sourceContinuity': [{'model': r['model'], **r['continuity']} for r in measured if r['name'] == 'new04-source'],
        'protectedInputCount': render['protectedInputCount'], 'protectedInputsUnchanged': render['protectedInputsUnchanged'],
        'subjectiveListeningPerformed': False, 'perceptualAcceptance': 'Pending user listening', 'gameLaunched': False, 'audioEndpointOpened': False,
        'limitations': render['limitations']+['Weak splice correlations and large source sample steps remain disclosed; no seamlessness or tonal-naturalness acceptance claim',
            'Startup simulation missingPast counts are preserved separately from zero PCM-history fault counters']}
    serialized = json.dumps(evidence, indent=2, allow_nan=False)+'\n'
    assert not re.search(r'[A-Za-z]:[\\/]', serialized), 'absolute drive paths must remain private'
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(serialized, 'utf8')

def href(file):
    file = Path(file)
    if not file.is_absolute():
        return file.as_posix()
    return Path(os.path.relpath(file, out)).as_posix()
def player(file, label, group):
    return '<div class="player"><p>'+html.escape(label)+'</p><audio controls preload="none" data-group="'+html.escape(group)+'" src="'+html.escape(href(file), quote=True)+'"></audio></div>'
def fmt(value):
    return '—' if value is None else f'{value:.2f}'
def timing_table(model):
    rows = ''.join('<tr><td>'+html.escape(t['name'])+'</td>'+''.join('<td>'+str(t[k])+'</td>' for k in ['sourceMisses', 'renderAndControlMisses', 'completeMisses'])+'<td>'+fmt(t['completeMaximumMs'])+'</td></tr>' for t in timings if t['model'] == model)
    return '<table><tr><th>Run</th><th>Source misses</th><th>Control/render misses</th><th>Complete misses</th><th>Worst complete ms</th></tr>'+rows+'</table>'
def continuity_table(model):
    rows = ''.join('<tr><td>'+html.escape(r['name'])+'</td><td>'+fmt(r['continuity']['sourceMaximumAdjacentStep'])+'</td><td>'+str(r['continuity']['weakSplicesBelowRecordedCorrelationCriterion'])+'</td><td>'+fmt(r['continuity']['minimumRecordedSpliceCorrelation'])+'</td></tr>' for r in measured if r['model'] == model)
    return '<p>Actual source steps and weak splice counts remain visible. Correlation is a diagnostic, not a perceptual pass.</p><table><tr><th>Run</th><th>Source maximum adjacent step</th><th>Weak splices</th><th>Minimum splice correlation</th></tr>'+rows+'</table>'
sections = []
for model, title in models.items():
    group = {r['name']: r for r in render['files'] if r['model'] == model}
    source = ''.join(player(group[n]['file'], label, model+'-source') for n, label in [('old03-source', '03 player — same complete24 s control'), ('new04-source', '04 player — same complete24 s control'), ('new04-source-exhaust', '04 exhaust alone — same source run and presentation gain')])
    controlled, delayed = [], []
    for kind in ['open', 'street']:
        old = next(r for r in render['beforeReferences'] if r['model'] == model and r['kind'] == kind)
        controlled.append(player(old['path'], '03 original '+kind+' — lift5.32 s', model+'-controlled'))
        controlled.append(player(group['new04-controlled-'+kind]['file'], '04 same '+kind+' performance — lift5.32 s', model+'-controlled'))
        delayed.append(player(group['new04-delayed-'+kind]['file'], '04 '+kind+' — separate performance, lift6.3 s', model+'-delayed'))
    near = []
    for r in measured:
        if r['model'] == model and 'nearPass50ms' in r:
            for bin in r['nearPass50ms']:
                near.append('<tr><td>'+html.escape(r['name'])+'</td><td>'+fmt(bin['windowSeconds'][0])+'</td><td>'+fmt(bin['rmsDbfs'])+'</td><td>'+fmt(bin['peakDbfs'])+'</td><td>'+fmt(db(math.sqrt(bin['bandPower']['low20to500'])))+'</td><td>'+fmt(db(math.sqrt(bin['bandPower']['mid500to2000'])))+'</td></tr>')
    faults = {f['name']: {'checks': f['checks'], 'renderer': f['diagnostics']['renderer'] if f['diagnostics'] else None,
        'history': f['diagnostics']['history'] if f['diagnostics'] else None, 'propagation': f['propagation']} for f in group.values() if f['kind'] != 'source'}
    sections.append('<section><h2>'+html.escape(title)+'</h2><p>Complete source: idle0–1.5 s; rise1.5–4.5; high load4.5–13.5; lift to idle13.5–17; running idle17–24. Both players use identical controls, gain and state shares.</p><div class="players">'+source+'</div><h3>Controlled flyby comparison</h3><p>Original03 WAVs remain in their previous folder. Same motion, source controls, events, distance profile and finite geometry. Only the source player changes.</p><div class="players">'+''.join(controlled)+'</div><h3>High load through the pass</h3><p>Separate authored performance: lift delayed to6.3 s; pass remains5.3 s. Motion and acoustic chain remain identical. This is a scenario comparison, not an old/new player A/B.</p><div class="players">'+''.join(delayed)+'</div><details><summary>Matched spectra, source clocks and state weights</summary><img src="'+model+'/comparison.png" alt="'+html.escape(title)+' matched absolute source spectra and clock/state evidence">'+continuity_table(model)+'</details><details><summary>Near-pass50 ms levels and low/mid band energy</summary><p>Bins4.8–5.8 s. Low20–500 Hz; mid500–2000 Hz. Band RMS-equivalent digital dBFS; no level matching. Complete old/new data are in measurements.json.</p><table><tr><th>Run</th><th>Start s</th><th>RMS dBFS</th><th>Peak dBFS</th><th>Low dBFS</th><th>Mid dBFS</th></tr>'+''.join(near)+'</table></details><details><summary>Every timing miss and exact renderer/history checks</summary><p>Instrumented offline runs; partial blocks use their actual shorter deadline. Miss counts are reported, not treated as proof of live readiness. Individual missed blocks are retained in render-report.json.</p>'+timing_table(model)+'<pre>'+html.escape(json.dumps(faults, indent=2))+'</pre></details></section>')
    marker = '<details><summary>Matched spectra, source clocks and state weights</summary>'
    sections[-1] = sections[-1].replace(marker, '<details><summary>Complete24 s source time spectrogram:03 /04</summary><p>Actual emitted source harmonics:4096-frame Hann,512-frame hop,40–8000 Hz; both panels use the same absolute−105…−5 dBFS²/Hz colour scale. No level matching.</p><img src="'+model+'/source-spectrogram.png" alt="'+html.escape(title)+' matched old03 and new04 complete-source time spectrogram"></details>'+marker, 1)
style = 'body{margin:0;background:#10151c;color:#ecf0f5;font:16px system-ui;line-height:1.5}main{max-width:1200px;margin:auto;padding:30px 24px}h1{font-size:32px}h2{margin-top:0}p{color:#bbc7d5}section{background:#19222e;padding:24px;margin:22px 0;border:1px solid #334256;border-radius:10px}.players{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.player{padding:10px;background:#111923;border-radius:6px}.player p{margin:0 0 8px}audio{width:100%}.controls{position:sticky;top:0;z-index:1;background:#27354a;padding:14px;display:flex;gap:20px;flex-wrap:wrap;align-items:center}button{padding:7px 12px}details{margin-top:16px;overflow:auto}summary{cursor:pointer;color:#a9d6ff}img{width:100%;margin-top:14px}table{border-collapse:collapse;font-size:12px;width:100%;margin:12px 0}th,td{border:1px solid #3a4859;padding:5px;text-align:left}pre{font-size:11px;max-height:320px;overflow:auto}a{color:#a9d6ff}'
js = 'const players=[...document.querySelectorAll("audio")],volume=document.querySelector("#volume");let prior=null,changing=false;function setVolume(v){if(changing)return;changing=true;volume.value=v;document.querySelector("#level").textContent=Math.round(v*100)+"%";players.forEach(a=>{if(a.volume!==v)a.volume=v});changing=false}volume.oninput=()=>setVolume(+volume.value);for(const a of players){a.volume=1;a.addEventListener("volumechange",()=>setVolume(a.volume));a.addEventListener("play",()=>{if(prior&&prior!==a&&document.querySelector("#carry").checked&&prior.dataset.group===a.dataset.group&&Number.isFinite(a.duration)&&prior.currentTime<a.duration)a.currentTime=prior.currentTime;players.forEach(b=>{if(b!==a)b.pause()});prior=a})}document.querySelector("#pause").onclick=()=>players.forEach(a=>a.pause());'
page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RichAudio Source04 comparison</title><style>'+style+'</style><main><h1>RichAudio Source04: source continuity comparison</h1><p>Four vehicles, one unchanged source gain. Compare the complete source A/B before the propagated flybys. No automatic playback, normalization, EQ, new reverberation or independent volume changes. Listening acceptance remains yours.</p><div class="controls"><label>Common volume <input id="volume" type="range" min="0" max="1" step=".01" value="1"> <output id="level">100%</output></label><button id="pause">Pause all</button><label><input id="carry" type="checkbox">Carry time within a comparison</label></div><p><a href="measurements.json">Measurements</a> · <a href="render-report.json">Exact controls, clocks, bindings, faults and timing misses</a>. Interval rates are source-span evidence, not crank RPM. The street remains the same authored10 m fixture; no Los Santos coverage or live performance claim.</p>'+''.join(sections)+'</main><script>'+js+'</script></html>'
(out / 'index.html').write_text(page, 'utf8')
assert all(checks.values()), checks
print(json.dumps({'page': str(out / 'index.html'), 'newWavs': 28, 'checks': checks, 'completeBlockMisses': sum(t['completeMisses'] for t in timings)}, indent=2))
