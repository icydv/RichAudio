"""Measure the private Source05 city comparison and build its four-vehicle page."""
import argparse
import hashlib
import html
import json
import math
import os
from pathlib import Path
import re
import sys

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
assert '.local' in out.parts, 'private output folder required'
render = json.loads((out / 'render-report.json').read_text('utf8'))
assert render['status'] == 'complete'
models = {'bati': 'Pegassi Bati 801', 'lectro': 'Principe Lectro',
          'prototipo': 'Grotti X80 Proto', 'schafter3': 'Benefactor Schafter V12'}
variants = ['road-baseline', 'road-exhaust', 'urban12', 'urban24', 'urban40']
labels = {'road-baseline': 'Open road · original exhaust gain',
          'road-exhaust': 'Open road · exhaust pressure ×2.5',
          'urban12': '12 m street · exhaust pressure ×2.5',
          'urban24': '24 m street · exhaust pressure ×2.5',
          'urban40': '40 m street · exhaust pressure ×2.5'}
colors = {'road-baseline': '#6a6e75', 'road-exhaust': '#2b7a44',
          'urban12': '#a85b1a', 'urban24': '#175f9a', 'urban40': '#8153a3'}
records = render['files']
main_records = [r for r in records if r['model'] in models and r['name'] in variants]
audio, measured = {}, []


def db(value):
    return float(20 * math.log10(value)) if value > 0 else None


def fmt(value, digits=2):
    return '—' if value is None else f'{value:.{digits}f}'


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


def levels(data, rate):
    assert len(data) > 0
    f, p = signal.welch(data, fs=rate, nperseg=min(4096, len(data)), axis=0)
    p = p.mean(axis=1)
    bands = {}
    for name, lo, hi in [('low20to500', 20, 500), ('mid500to2000', 500, 2000),
                         ('high2000toNyquist', 2000, rate / 2)]:
        mask = (f >= lo) & (f < hi)
        bands[name] = float(np.trapezoid(p[mask], f[mask]))
    rms, peak = float(np.sqrt(np.mean(data ** 2))), float(np.max(abs(data)))
    return {'rms': rms, 'rmsDbfs': db(rms), 'peak': peak, 'peakDbfs': db(peak),
            'bandPower': bands, 'nonfiniteSamples': int(np.count_nonzero(~np.isfinite(data))),
            'fullScaleSamples': int(np.count_nonzero(abs(data) >= 1))}


def cut(data, rate, start, end):
    return data[max(0, round(start * rate)):min(len(data), round(end * rate))]


def envelope(data, rate, seconds=.02):
    block = max(1, round(seconds * rate))
    count = len(data) // block
    if not count:
        return np.array([0.]), np.array([float(np.sqrt(np.mean(data ** 2)))])
    rms = np.sqrt(np.mean(data[:count * block].reshape(count, block, data.shape[1]) ** 2, axis=(1, 2)))
    return (np.arange(count) + .5) * block / rate, rms


def summary(timing):
    if not timing:
        return None
    misses = timing.get('misses', [])
    return {'blocks': timing.get('blocks'), 'misses': len(misses),
            'p95Ms': timing.get('p95Ms'), 'maximumMs': timing.get('maximumMs'),
            'missDetails': misses}


for record in records:
    file = out / record['file']
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    assert digest == record['sha256'], f'WAV binding changed: {record["file"]}'
    rate, data = read(file)
    audio[record['file']] = (rate, data)
    row = {key: record.get(key) for key in ['model', 'name', 'file', 'sha256', 'category', 'width', 'wallTreatment', 'component']}
    row.update({'durationSeconds': len(data) / rate, **levels(data, rate)})
    if record in main_records:
        row['nearPass'] = {'windowSeconds': [4.8, 5.8], **levels(cut(data, rate, 4.8, 5.8), rate)}
        row['recession'] = {'windowSeconds': [9.3, 10.3], **levels(cut(data, rate, 9.3, 10.3), rate)}
    measured.append(row)

comparisons = []
for model in models:
    group = [r for r in main_records if r['model'] == model]
    assert {r['name'] for r in group} == set(variants), f'incomplete vehicle: {model}'
    matches = {key: len({r.get(key) for r in group}) == 1 and group[0].get(key) is not None
               for key in ['sourceHash', 'controlHash', 'motionHash']}
    comparisons.append({'model': model, **matches})

timings = []
for record in records:
    if record.get('timings'):
        timings.append({'model': record['model'], 'name': record['name'],
                        'initializationMs': record.get('initializationMs'),
                        'wallMs': record.get('wallMs'),
                        **{name: summary(value) for name, value in record['timings'].items()}})

before_references_verified = []
for reference in render.get('beforeReferences', []):
    file = Path(reference.get('path') or reference['file'])
    assert hashlib.sha256(file.read_bytes()).hexdigest() == reference['sha256']
    before_references_verified.append({key: reference.get(key) for key in ['model', 'name', 'kind', 'sha256']})

frozen_source_bindings = {}
previous_root = Path(render['inputs']['previousRoot'])
previous_report = json.loads((previous_root / '.local/stock-source-04/audition/render-report.json').read_text('utf8'))
checkout = Path(__file__).resolve().parent.parent
for name in render['frozenSourceFiles']:
    current_hash = hashlib.sha256((checkout / name).read_bytes()).hexdigest()
    previous_hash = previous_report['moduleBindings'][name]
    assert current_hash == render['moduleBindings'][name] == previous_hash, f'frozen source changed: {name}'
    frozen_source_bindings[name] = {'currentSha256': current_hash, 'delivered04Sha256': previous_hash, 'match': True}

stem_records = [r for r in records if r.get('category') == 'stem']
stem_groups = {}
for record in stem_records:
    stem_groups.setdefault((record['model'], record.get('width', 24)), {})[record.get('component', record['name'])] = record
linear_sums = []
for (model, width), group in stem_groups.items():
    if not all(name in group for name in ['direct', 'early', 'train']):
        continue
    # Compare with the independently rendered full main scene. A sum WAV may
    # also be exported for playback, but cannot by itself establish linearity.
    full = next((r for r in main_records if r['model'] == model and r['name'] == f'urban{width}'), None) or group.get('full')
    if full is None:
        continue
    rate, target = audio[full['file']]
    terms = [audio[group[name]['file']][1] for name in ['direct', 'early', 'train']]
    assert all(term.shape == target.shape for term in terms)
    residual = sum(terms) - target
    # The production encoder exports float32. Independent component/main
    # rounding permits a small absolute residual, not a PCM16-sized tolerance.
    bound = 2e-7
    linear_sums.append({'model': model, 'width': width, 'reference': full['file'],
                        'components': [group[name]['file'] for name in ['direct', 'early', 'train']],
                        'maximumExportResidual': float(np.max(abs(residual))),
                        'rmsExportResidual': float(np.sqrt(np.mean(residual ** 2))),
                        'exportResidualBound': bound, 'withinQuantizationBound': bool(np.max(abs(residual)) <= bound),
                        'interpretation': 'Exported component sum versus independently rendered main WAV; renderer float sum checks remain in render-report.json'})

impulse_measurements = []
for record in records:
    if record.get('category') != 'impulse':
        continue
    rate, data = audio[record['file']]
    amplitude = np.max(abs(data), axis=1)
    arrivals = []
    for expected in record.get('predictedArrivals', []):
        arrival = expected['arrivalSeconds']
        # This is a response window around a predicted path, not an assertion
        # that a broadband filtered pop has a sample-exact peak at that time.
        start, end = max(0, round((arrival - .0005) * rate)), min(len(data), round((arrival + .0005) * rate) + 1)
        if end <= start:
            continue
        peak_frame = start + int(np.argmax(amplitude[start:end]))
        arrivals.append({'id': expected['id'], 'order': expected['order'],
                         'predictedArrivalSeconds': arrival, 'distanceMetres': expected['distance'],
                         'localWindowPeakSeconds': peak_frame / rate,
                         'localWindowPeak': float(amplitude[peak_frame]),
                         'localPeakOffsetSamples': float(peak_frame - arrival * rate),
                         'windowHalfWidthSeconds': .0005})
    impulse_measurements.append({'file': record['file'], 'width': record.get('width'),
                                 'wallTreatment': record.get('wallTreatment'),
                                 'arrivals': arrivals,
                                 'interpretation': 'Actual exported impulse response in ±0.5 ms prediction windows; overlapping returns and IIR tails can share a window. Local peaks are descriptors, not individual path isolation.'})

diagnostic_geometry = []
for category in ['pop', 'impulse']:
    group = [r for r in records if r.get('category') == category]
    reflective = next((r for r in group if r.get('width') == 24 and r.get('wallTreatment', 'reflective') == 'reflective'), None)
    absorptive = next((r for r in group if r.get('width') == 24 and r.get('wallTreatment') == 'absorptive'), None)
    if reflective and absorptive:
        keys = ['id', 'order', 'distance', 'delaySeconds', 'arrivalSeconds', 'reflectors']
        a = [{key: row[key] for key in keys} for row in reflective.get('predictedArrivals', [])]
        b = [{key: row[key] for key in keys} for row in absorptive.get('predictedArrivals', [])]
        diagnostic_geometry.append({'category': category, 'reflectiveFile': reflective['file'],
                                    'absorptiveFile': absorptive['file'],
                                    'samePredictedGeometryAndDelay': bool(a) and a == b})

checks = {'twentyMainVehicleWavs': len(main_records) == 20,
          'identicalSourceControlAndMotionWithinEveryVehicle': all(all(c[key] for key in ['sourceHash', 'controlHash', 'motionHash']) for c in comparisons),
          'allGeneratedFiniteUnclipped': all(r['nonfiniteSamples'] == 0 and r['fullScaleSamples'] == 0 and r['peak'] < .98 for r in measured),
          'rendererRecordedChecks': all(all(r.get('checks', {}).values()) for r in records),
          'earlierFilesPreserved': render.get('protectedInputsUnchanged') is True,
          'previous04WavBindingsVerified': len(before_references_verified) == 8,
          'source04CoreBindingsMatch': len(frozen_source_bindings) == 4 and all(r['match'] for r in frozen_source_bindings.values()) and render.get('frozenSource04PcmAndControlsVerified') is True,
          'eightStationaryDiagnosticWavs': all(len([r for r in records if r.get('category') == category]) == 4 for category in ['pop', 'impulse']),
          'absorptiveControlPreservesActualPredictedGeometry': len(diagnostic_geometry) == 2 and all(r['samePredictedGeometryAndDelay'] for r in diagnostic_geometry),
          'representativeStemSum': bool(linear_sums) and all(row['withinQuantizationBound'] for row in linear_sums)}

analytic = []
for width in [12, 24, 40]:
    # A separate declared stationary check, not an estimate of any moving flyby.
    direct_distance = 8.
    for order in range(1, 11):
        distance = math.hypot(direct_distance, order * width)
        analytic.append({'widthMetres': width, 'order': order, 'distanceMetres': distance,
                         'delaySeconds': distance / 343,
                         'excessDelaySeconds': (distance - direct_distance) / 343,
                         'pressureRelativeToDirect': [(energy ** (order / 2)) * direct_distance / distance
                                                      for energy in [.94, .88, .72]],
                         'absorptivePressureRelativeToDirect': [(energy ** (order / 2)) * direct_distance / distance
                                                                for energy in [.25, .12, .04]]})

report = {'schemaVersion': 1, 'milestone': 'STOCK-SOURCE-05', 'checks': checks,
          'measurements': measured, 'sameInputComparisons': comparisons, 'stemLinearSums': linear_sums,
          'impulseResponseWindows': impulse_measurements, 'diagnosticGeometryComparisons': diagnostic_geometry,
          'frozenSource04SourceBindings': frozen_source_bindings,
          'beforeReferencesVerified': before_references_verified,
          'timingSummary': timings,
          'timingMeaning': 'Instrumented offline timings. Every missed block and its actual deadline are retained; no live performance acceptance claim.',
          'authoredExhaustPressureGain': 2.5, 'authoredExhaustPressureGainDb': 20 * math.log10(2.5),
          'gainMeaning': 'Per-emitter pressure multiplier, applied to every propagation path, not a physical SPL calibration. Main mixed-vehicle level changes need not equal this multiplier.',
          'stationaryAnalyticWallCheck': {'sourceListenerSeparationMetres': 8, 'sourceAndListenerOnStreetCentreline': True,
              'equalSourceListenerHeight': True, 'soundSpeedMetresPerSecond': 343,
              'method': 'Unfolded alternating parallel planes: L_n=sqrt(D^2+(n*W)^2), pressure energy product^(1/2)/distance; no air/directivity factors in this reference.',
              'rows': analytic},
          'subjectiveListeningPerformed': False, 'perceptualAcceptance': 'Pending user listening',
          'openIssues': ['Slight pitch stepping reported for Lectro and X80 Proto remains open. This environmental test does not resolve or validate that source issue.',
                         'Authored street geometry is unrelated to Legion Square; no measured outdoor RT60 or modal resonance is claimed.',
                         'Finite specular wall returns do not provide a complete diffuse urban reverberant field.']}
(out / 'measurements.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', 'utf8')

plt.rcParams.update({'font.size': 9, 'figure.facecolor': '#ffffff', 'axes.grid': True, 'grid.alpha': .2})
for model in models:
    group = {r['name']: r for r in main_records if r['model'] == model}
    fig, axes = plt.subplots(2, 1, figsize=(12, 7), sharex=True, sharey=True)
    for ax, names in zip(axes, [['road-baseline', 'road-exhaust'], ['road-exhaust', 'urban12', 'urban24', 'urban40']]):
        for name in names:
            rate, data = audio[group[name]['file']]
            times, rms = envelope(data, rate)
            ax.plot(times, 20 * np.log10(np.maximum(rms, 1e-8)), label=labels[name], color=colors[name])
        ax.set(ylim=(-100, 0), ylabel='20 ms RMS (dBFS)', xlim=(0, 10.3))
        ax.axvline(5.3, color='#555555', linestyle=':', label='Closest pass 5.3 s')
        ax.axvline(6.3, color='#555555', linestyle='--', label='Authored lift 6.3 s')
        ax.legend(fontsize=8, loc='lower center', ncol=2)
    axes[0].set_title('Exhaust pressure change on the same open road')
    axes[1].set_title('Actual width comparison; same emitted PCM, motion and exhaust gain')
    axes[-1].set_xlabel('Scene time (s)')
    fig.suptitle(models[model] + ' — absolute digital levels, common axes and no level matching')
    fig.tight_layout()
    (out / model).mkdir(exist_ok=True)
    fig.savefig(out / model / 'city-comparison.png', dpi=140)
    plt.close(fig)

fig, axes = plt.subplots(1, 2, figsize=(12, 4.8))
for width, color in [(12, colors['urban12']), (24, colors['urban24']), (40, colors['urban40'])]:
    rows = [row for row in analytic if row['widthMetres'] == width]
    axes[0].plot([row['order'] for row in rows], [row['excessDelaySeconds'] * 1000 for row in rows],
                 'o-', color=color, label=f'{width} m spacing')
for band, color in [(0, '#a85b1a'), (1, '#175f9a'), (2, '#8153a3')]:
    rows = [row for row in analytic if row['widthMetres'] == 24]
    for key, style, material in [('pressureRelativeToDirect', '-', 'reflective'),
                                 ('absorptivePressureRelativeToDirect', '--', 'absorptive')]:
        band_name = ['low', 'mid', 'high'][band]
        axes[1].plot([row['order'] for row in rows], [db(row[key][band]) for row in rows],
                     style, color=color, label=f'{material} · {band_name}')
axes[0].set(title='Analytic wall spacing → return delay', xlabel='Alternating wall bounce count',
            ylabel='Excess delay after direct (ms)', xticks=range(1, 11))
axes[1].set(title='Analytic material loss → diminishing returns', xlabel='Alternating wall bounce count',
            ylabel='Pressure relative to direct (dB)', xticks=range(1, 11))
axes[0].legend(); axes[1].legend(fontsize=8, ncol=2)
fig.suptitle('Declared stationary 8 m separation; authored coefficients, no measured resonance or RT60')
fig.tight_layout(); fig.savefig(out / 'width-material-reference.png', dpi=140); plt.close(fig)

pop_records = [r for r in records if r.get('category') == 'pop']
if pop_records:
    fig, ax = plt.subplots(figsize=(12, 4.6))
    for record in pop_records:
        rate, data = audio[record['file']]
        times, rms = envelope(data, rate, .005)
        width = record.get('width', '?')
        treatment = record.get('wallTreatment', 'reflective')
        ax.plot(times, 20 * np.log10(np.maximum(rms, 1e-8)), label=f'{width} m · {treatment} native pop',
                color=colors.get(f'urban{width}'), linestyle='--' if treatment == 'absorptive' else '-')
    ax.set(ylim=(-110, 0), ylabel='5 ms RMS (dBFS)', xlabel='Scene time (s)',
           title='Isolated original X80 pop; same native waveform and pressure gain, no engine')
    ax.legend(); fig.tight_layout(); fig.savefig(out / 'native-pop-echoes.png', dpi=140); plt.close(fig)

impulse_records = [r for r in records if r.get('category') == 'impulse']
if impulse_records:
    fig, axes = plt.subplots(len(impulse_records), 1, figsize=(12, 2.5 * len(impulse_records)), sharex=True, sharey=True, squeeze=False)
    for ax, record in zip(axes[:, 0], impulse_records):
        rate, data = audio[record['file']]
        width, treatment = record.get('width', '?'), record.get('wallTreatment', 'reflective')
        times, rms = envelope(data, rate, .001)
        ax.plot(times, 20 * np.log10(np.maximum(rms, 1e-8)), color=colors.get(f'urban{width}'),
                label='Actual 1 ms response RMS')
        unique = {}
        for prediction in record.get('predictedArrivals', []):
            key = round(prediction['arrivalSeconds'], 6)
            unique.setdefault(key, prediction)
        for arrival, prediction in unique.items():
            ax.axvline(arrival, color='#444444', alpha=.35, linewidth=.7)
            if prediction['order'] >= 3:
                ax.text(arrival, -33, str(prediction['order']), fontsize=6, rotation=90, va='top')
        ax.set(ylim=(-125, 0), xlim=(.48, 1.8), ylabel='RMS dBFS',
               title=f'{width} m · {treatment} · lines show actual geometry predictions; numbers are wall order')
    axes[-1, 0].set_xlabel('Scene time (s); original unit-test impulse at 0.5 s, amplitude 0.25')
    fig.suptitle('Rendered impulse response: spacing changes the arrivals; absorption reduces later returns')
    fig.tight_layout(); fig.savefig(out / 'impulse-arrivals.png', dpi=140); plt.close(fig)

for (model, width), group in stem_groups.items():
    if not all(name in group for name in ['direct', 'early', 'train']):
        continue
    fig, ax = plt.subplots(figsize=(12, 4.6))
    for name, color in [('direct', '#2b7a44'), ('early', '#175f9a'), ('train', '#a85b1a')]:
        rate, data = audio[group[name]['file']]
        times, rms = envelope(data, rate)
        ax.plot(times, 20 * np.log10(np.maximum(rms, 1e-8)), color=color, label=name)
    ax.set(ylim=(-110, 0), xlabel='Scene time (s)', ylabel='20 ms RMS (dBFS)',
           title=f'{models[model]} · {width} m · actual order-filtered renderer stems')
    ax.legend(); fig.tight_layout(); fig.savefig(out / f'{model}-stems-{width}.png', dpi=140); plt.close(fig)


def href(file):
    file = Path(file)
    return Path(os.path.relpath(file, out)).as_posix() if file.is_absolute() else file.as_posix()


def player(file, label, group):
    return ('<div class="player"><p>' + html.escape(label) + '</p><audio controls preload="none" data-group="'
            + html.escape(group, quote=True) + '" src="' + html.escape(href(file), quote=True) + '"></audio></div>')


sections = []
for model, title in models.items():
    group = {r['name']: r for r in main_records if r['model'] == model}
    players = ''.join(player(group[name]['file'], labels[name], model + '-city') for name in variants)
    rows = []
    for name in variants:
        measure = next(r for r in measured if r['model'] == model and r['name'] == name)
        timing = next((t for t in timings if t['model'] == model and t['name'] == name), {})
        complete = timing.get('complete') or {}
        rows.append('<tr><td>' + html.escape(labels[name]) + '</td><td>' + fmt(measure['peakDbfs'])
                    + '</td><td>' + fmt(measure['nearPass']['rmsDbfs']) + '</td><td>'
                    + str(complete.get('misses', '—')) + '</td><td>' + fmt(complete.get('maximumMs')) + '</td></tr>')
    references = [r for r in render.get('beforeReferences', []) if r.get('model') == model]
    earlier = ''.join(player(r.get('path') or r['file'], r.get('name', 'Previous Source04 comparison'), model + '-previous') for r in references)
    faults = {name: {'checks': group[name].get('checks'), 'propagation': group[name].get('propagation'),
                     'diagnostics': group[name].get('diagnostics')} for name in variants}
    sections.append('<section><h2>' + html.escape(title) + '</h2><p>Frozen Source04 emitted engine/exhaust PCM and delayed-lift controls. '
                    'Closest pass at 5.3 s; lift at 6.3 s. The vehicle moves continuously at 22 m/s without a position reset.</p>'
                    '<div class="players">' + players + '</div><details><summary>Actual levels and timing misses</summary>'
                    '<img src="' + model + '/city-comparison.png" alt="Common-scale vehicle and street width comparison">'
                    '<p>Digital levels are not physical SPL. Individual missed blocks and their actual deadlines remain in the render report.</p>'
                    '<table><tr><th>Variant</th><th>Peak dBFS</th><th>Near-pass RMS dBFS</th><th>Complete misses</th><th>Worst complete ms</th></tr>'
                    + ''.join(rows) + '</table></details>'
                    + ('<details><summary>Preserved previous Source04 WAVs</summary><div class="players">' + earlier + '</div></details>' if earlier else '')
                    + '<details><summary>Exact path/history diagnostics</summary><pre>' + html.escape(json.dumps(faults, indent=2)) + '</pre></details></section>')

diagnostics_html = ''
if pop_records:
    diagnostics_html += '<h3>Isolated original X80 exhaust pop</h3><p>The same native pop and gain excite each width. Native onset and waveform duration can overlap return arrivals; the analytic timing check is separate.</p><div class="players">'
    diagnostics_html += ''.join(player(r['file'], f'{r.get("width", "?")} m · {r.get("wallTreatment", "reflective")} isolated pop', 'native-pop') for r in pop_records)
    diagnostics_html += '</div><img src="native-pop-echoes.png" alt="Same-scale isolated native pop echo envelopes">'
if impulse_records:
    diagnostics_html += '<h3>Separate impulse timing and material control</h3><p>A declared 0.25-amplitude impulse at 0.5 s removes the native pop onset ambiguity. These are actual finite-path renderer outputs. Prediction lines come from the saved geometry paths; broad filtered tails and coincident paths can overlap. The 24 m absorptive control changes wall energies while preserving geometry and delay.</p><div class="players">'
    diagnostics_html += ''.join(player(r['file'], f'{r.get("width", "?")} m · {r.get("wallTreatment", "reflective")} impulse response', 'impulse') for r in impulse_records)
    diagnostics_html += '</div><img src="impulse-arrivals.png" alt="Actual impulse responses with predicted finite-path arrivals">'
for (model, width), group in stem_groups.items():
    if not all(name in group for name in ['direct', 'early', 'train']):
        continue
    diagnostics_html += f'<h3>{html.escape(models[model])} · {width} m path components</h3><p>Actual renderer paths separated by order: direct 0, early 1–2, wall train 3–10. They use the same source history and controls; all are presented at their original gains.</p><div class="players">'
    diagnostics_html += ''.join(player(group[name]['file'], label, 'stems') for name, label in [('direct', 'Direct only'), ('early', 'Early returns only'), ('train', 'Repeated wall returns only')])
    full = group.get('full') or group.get('sum')
    if full:
        diagnostics_html += player(full['file'], 'Linear sum of direct, early and train', 'stems')
    diagnostics_html += f'</div><img src="{model}-stems-{width}.png" alt="Actual order-filtered renderer stem levels">'
    diagnostics_html += '<pre>' + html.escape(json.dumps([r for r in linear_sums if r['model'] == model and r['width'] == width], indent=2)) + '</pre>'

previous_page = render.get('previousPage')
previous_link = '<a href="' + html.escape(href(previous_page), quote=True) + '">Previous Source04 comparison</a> · ' if previous_page else ''
style = 'body{margin:0;background:#10151c;color:#edf1f5;font:16px system-ui;line-height:1.5}main{max-width:1200px;margin:auto;padding:30px 24px}h1{font-size:32px}h2{margin-top:0}p{color:#bdc8d5}section{background:#19222e;padding:24px;margin:22px 0;border:1px solid #334256;border-radius:10px}.players{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.player{padding:10px;background:#111923;border-radius:6px}.player p{margin:0 0 8px}audio{width:100%}.controls{position:sticky;top:0;z-index:1;background:#27354a;padding:14px;display:flex;gap:20px;flex-wrap:wrap;align-items:center}button{padding:7px 12px}details{margin-top:16px;overflow:auto}summary{cursor:pointer;color:#afd8ff}img{width:100%;margin-top:14px}table{border-collapse:collapse;font-size:12px;width:100%;margin:12px 0}th,td{border:1px solid #3a4859;padding:5px;text-align:left}pre{font-size:11px;max-height:320px;overflow:auto}a{color:#afd8ff}.note{padding:15px;background:#353024;border:1px solid #8d7545;border-radius:6px}'
js = 'const players=[...document.querySelectorAll("audio")],volume=document.querySelector("#volume");let prior=null,changing=false;function setVolume(v){if(changing)return;changing=true;volume.value=v;document.querySelector("#level").textContent=Math.round(v*100)+"%";players.forEach(a=>{if(a.volume!==v)a.volume=v});changing=false}volume.oninput=()=>setVolume(+volume.value);for(const a of players){a.volume=1;a.addEventListener("volumechange",()=>setVolume(a.volume));a.addEventListener("play",()=>{if(prior&&prior!==a&&document.querySelector("#carry").checked&&prior.dataset.group===a.dataset.group&&Number.isFinite(a.duration)&&prior.currentTime<a.duration)a.currentTime=prior.currentTime;players.forEach(b=>{if(b!==a)b.pause()});prior=a})}document.querySelector("#pause").onclick=()=>players.forEach(a=>a.pause());'
page = '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RichAudio Source05 city comparison</title><style>' + style + '</style><main><h1>RichAudio Source05: exhaust and repeated city returns</h1><p>Four vehicles, five matched variants each. Compare the original exhaust balance, the authored exhaust pressure change, and real finite wall paths at three street widths. One common playback volume; no automatic playback, normalization or independent level matching.</p><p class="note">Slight pitch stepping reported for Lectro and X80 Proto remains open. This test keeps the Source04 source player frozen and does not claim that environmental sound resolves the source issue.</p><div class="controls"><label>Common volume <input id="volume" type="range" min="0" max="1" step=".01" value="1"> <output id="level">100%</output></label><button id="pause">Pause all</button><label><input id="carry" type="checkbox">Carry time within a comparison</label></div><p>' + previous_link + '<a href="measurements.json">Measurements</a> · <a href="render-report.json">Bindings, exact controls, histories and all timing misses</a></p><p>Exhaust pressure ×2.5 is an authored +7.96 dB per-path multiplier, not measured SPL. Engine pressure remains unchanged. All variants retain the same shared source and master calibration. The open-roof street is 240 m long, 24 m high, with no roof or end-wall reflectors and no diffuse late field. Geometry and material energies are authored assumptions, unrelated to Legion Square.</p>' + ''.join(sections) + '<section><h2>Why street spacing changes the returns</h2><p>Wider spacing increases the actual path length and return delay. Every bounce multiplies pressure by the square root of its material reflection energy; distance and high-band losses further reduce the received return. Finite supports reject paths outside the walls. This is a bounded specular echo train, not measured modal resonance or a complete urban reverberant field.</p><img src="width-material-reference.png" alt="Analytic spacing and authored material pressure decay"><p>Reference plots use a declared stationary 8 m source/listener separation on the centreline. Solid and dashed material curves are analytical reflective/absorptive controls, not measured impulse responses.</p>' + diagnostics_html + '</section></main><script>' + js + '</script></html>'
(out / 'index.html').write_text(page, 'utf8')

if args.evidence:
    safe_keys = ['model', 'name', 'file', 'sha256', 'category', 'width', 'wallTreatment', 'component', 'durationSeconds',
                 'sourceGain', 'sourcePressureGains', 'rendererMasterGain', 'sourceHash', 'controlHash', 'motionHash',
                 'metrics', 'checks', 'propagation', 'timings', 'diagnostics', 'eventPlan', 'sourceStats', 'predictedArrivals']
    evidence = {'schemaVersion': 1, 'milestone': 'STOCK-SOURCE-05', 'status': render['status'],
                'checks': checks, 'moduleBindingsAtRender': render.get('moduleBindings'),
                'frozenSource04SourceBindings': frozen_source_bindings,
                'frozenSource04PcmAndControlsVerified': render.get('frozenSource04PcmAndControlsVerified'),
                'scenarioComparisons': render.get('scenarioComparisons'),
                'beforeReferencesVerified': before_references_verified,
                'sourceGain': render.get('sourceGain'),
                'rendererMasterGain': render.get('rendererMasterGain'),
                'commonPressureGain': render.get('commonPressureGain'),
                'exhaustPressureGain': render.get('exhaustPressureGain'),
                'exhaustPressureGainDb': render.get('exhaustPressureGainDb'),
                'calibration': render.get('calibration'), 'sameInputComparisons': comparisons,
                'files': [{key: r[key] for key in safe_keys if key in r} for r in records],
                'stemLinearSums': linear_sums, 'impulseResponseWindows': impulse_measurements,
                'diagnosticGeometryComparisons': diagnostic_geometry,
                'stationaryAnalyticWallCheck': report['stationaryAnalyticWallCheck'],
                'protectedInputCount': render.get('protectedInputCount'),
                'protectedInputsUnchanged': render.get('protectedInputsUnchanged'),
                'authoringToolBindings': {name: hashlib.sha256((Path(__file__).resolve().parent / name).read_bytes()).hexdigest()
                                         for name in ['Render-StockSource05.mjs', 'Analyze-StockSource05.py']},
                'gameLaunched': False, 'audioEndpointOpened': False, 'subjectiveListeningPerformed': False,
                'perceptualAcceptance': 'Pending user listening', 'limitations': render.get('limitations', []) + report['openIssues']}
    serialized = json.dumps(evidence, indent=2, allow_nan=False) + '\n'
    assert not re.search(r'[A-Za-z]:[\\/]', serialized), 'absolute drive paths must remain private'
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    args.evidence.write_text(serialized, 'utf8')

assert all(checks.values()), checks
print(json.dumps({'page': str(out / 'index.html'), 'mainWavs': len(main_records), 'totalWavs': len(records),
                  'checks': checks, 'completeBlockMisses': sum((t.get('complete') or {}).get('misses', 0) for t in timings)}, indent=2))
