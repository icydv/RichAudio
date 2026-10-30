"""Read-only cycle/clock evidence from already decoded private stock PCM.

This does not recover GTA's playback algorithm or assign unknown fields RPM units.
No synthesis, playback, archive extraction, source edits or gain adjustment occurs.
"""
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('manifest', type=Path)
p.add_argument('--dependencies', type=Path, required=True)
p.add_argument('--private-output', type=Path, required=True)
p.add_argument('--evidence', type=Path, required=True)
a = p.parse_args()
sys.path.insert(0, str(a.dependencies))
import numpy as np
from scipy import signal
from scipy.stats import spearmanr

N = 1024


def number(x):
    x = float(x)
    return x if math.isfinite(x) else None


def stats(x):
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    return {'count': len(x), 'minimum': number(np.min(x)),
            'median': number(np.median(x)), 'p95': number(np.quantile(x, .95)),
            'maximum': number(np.max(x))} if len(x) else {'count': 0}


def corr(x, y):
    if len(x) < 3 or min(np.std(x), np.std(y)) <= 1e-12:
        return None
    return number(np.corrcoef(x, y)[0, 1])


def normalize(cycles):
    z = cycles - np.mean(cycles, axis=1, keepdims=True)
    norms = np.linalg.norm(z, axis=1, keepdims=True)
    return z / np.maximum(norms, 1e-12)


def pair_phases(first, second):
    x, y = normalize(first), normalize(second)
    cc = np.fft.irfft(np.fft.rfft(x, axis=1) * np.conj(np.fft.rfft(y, axis=1)), n=N, axis=1)
    at = np.argmax(cc, axis=1)
    phase = np.where(at > N // 2, at - N, at) / N
    return {'samePhaseCorrelation': stats(np.sum(x*y, axis=1)),
            'bestCircularCorrelation': stats(np.max(cc, axis=1)),
            'absoluteBestPhaseShiftTurns': stats(np.abs(phase))}, phase


def read_stream(model, role, state, rec, base):
    file = (base / rec['file']).resolve()
    if base not in file.parents:
        raise ValueError('Private source path escaped manifest')
    raw = file.read_bytes()
    if hashlib.sha256(raw).hexdigest().upper() != rec['sha256'].upper():
        raise ValueError('Decoded PCM binding differs')
    pcm = np.frombuffer(raw, dtype='<f4').astype(float)
    if len(pcm) != rec['frames'] or not np.isfinite(pcm).all():
        raise ValueError('Invalid decoded PCM')
    grains = rec['granular']['grains']
    offsets = np.array([g['UnkUint1'] for g in grains], dtype=int)
    clock = np.array([g['UnkFloat1'] for g in grains], dtype=float)
    if not (np.all(np.diff(offsets) > 0) and np.all(offsets >= 0)
            and np.all(offsets < len(pcm)) and np.all(clock > 0)
            and np.isfinite(clock).all()):
        raise ValueError('Ordered in-range positive clock candidates required')
    length = np.diff(offsets)
    rate = rec['sampleRate'] / length
    clock_fits = {}
    for label, values in [('left', clock[:-1]), ('right', clock[1:]),
                          ('meanEndpoints', (clock[:-1]+clock[1:])/2)]:
        clock_fits[label] = {'pearson': corr(rate, values),
                            'medianRelativeError': number(np.median(np.abs(rate-values)/rate)),
                            'p95RelativeError': number(np.quantile(np.abs(rate-values)/rate, .95))}
    # Fourier resampling is analysis-only and retains integer interval orders
    # without aliasing high native-rate content into low orders on this grid.
    cycles = np.stack([signal.resample(pcm[start:start+size], N)
                       for start, size in zip(offsets[:-1], length)])
    rms = np.array([np.sqrt(np.mean(pcm[start:start+size]**2))
                    for start, size in zip(offsets[:-1], length)])
    spectra = np.fft.rfft(cycles-np.mean(cycles, axis=1, keepdims=True), axis=1)
    power = np.abs(spectra)**2
    dominant = np.argmax(power[:, 1:65], axis=1)+1
    adjacent, phase = pair_phases(cycles[:-1], cycles[1:])
    filtered = spectra.copy()
    filtered[:, 25:] = 0
    loworder = np.fft.irfft(filtered, n=N, axis=1)
    adjacent_low, _ = pair_phases(loworder[:-1], loworder[1:])
    subcycles = {}
    z = normalize(cycles)
    for multiple in [2, 3, 4, 6, 8, 12]:
        # Fractional circular shift: tests repeated structure within an interval.
        # High values establish waveform repetition, not crank/firing order.
        shifted = np.fft.irfft(np.fft.rfft(z, axis=1)*
                              np.exp(2j*np.pi*np.arange(N//2+1)/multiple), n=N, axis=1)
        values = np.sum(z*shifted, axis=1)
        subcycles[str(multiple)] = {'correlation': stats(values),
                                    'fractionAbove0_8': number(np.mean(values >= .8))}
    point = np.abs(pcm[offsets[1:]]-pcm[offsets[:-1]])
    physical = np.abs(pcm[offsets[1:]]-pcm[offsets[1:]-1])
    direct_wrap = np.abs(pcm[offsets[:-1]]-pcm[offsets[1:]-1])
    derivative_error = np.abs((pcm[offsets[:-1]+1]-pcm[offsets[:-1]])-
                              (pcm[offsets[1:]]-pcm[offsets[1:]-1]))
    summary = {'model': model, 'role': role, 'state': state,
               'sampleRate': rec['sampleRate'], 'frames': len(pcm),
               'sourceSha256': rec['sha256'], 'intervals': len(length),
               'intervalSeconds': stats(length/rec['sampleRate']),
               'candidateClockValue': stats(clock), 'intervalRateHz': stats(rate),
               'clockVsSampleRateOverOffsetDelta': clock_fits,
               'endpointPhaseAmplitudeErrorOverIntervalRms': stats(point/np.maximum(rms, 1e-12)),
               'directLoopJoinStepOverIntervalRms': stats(direct_wrap/np.maximum(rms, 1e-12)),
               'actualBoundaryAdjacentStepOverIntervalRms': stats(physical/np.maximum(rms, 1e-12)),
               'endpointDerivativeMismatchOverIntervalRms': stats(derivative_error/np.maximum(rms, 1e-12)),
               'adjacentIntervals': adjacent, 'adjacentLowOrders1to24': adjacent_low,
               'dominantIntegerOrderHistogram': {str(i): int(np.sum(dominant == i)) for i in np.unique(dominant)},
               'withinIntervalRepeatedStructure': subcycles,
               'clockTimeSpearman': number(spearmanr(offsets, clock).statistic),
               'absoluteRpmKnown': False, 'nativeGrainSemanticsRecovered': False}
    private = {'model': model, 'role': role, 'state': state,
               'offsets': offsets.tolist(), 'clockCandidate': clock.tolist(),
               'intervalRateHz': rate.tolist(), 'dominantOrder': dominant.tolist(),
               'adjacentBestPhaseTurns': phase.tolist()}
    return summary, private, (offsets, clock, rate, cycles, rec['sampleRate'], len(pcm))


base = a.manifest.resolve().parent
manifest = json.loads(a.manifest.read_text(encoding='utf-8-sig'))
summaries, private, data = [], [], {}
for model in ['schafter3', 'bati', 'lectro', 'prototipo']:
    vehicle = next(v for v in manifest['vehicles'] if v['model'] == model)
    for state in ['accel', 'decel']:
        for role in ['engine', 'exhaust']:
            s, d, source = read_stream(model, role, state, vehicle['layers'][role][state], base)
            summaries.append(s)
            private.append(d)
            data[(model, role, state)] = source

pairs = []
for model in ['schafter3', 'bati', 'lectro', 'prototipo']:
    for state in ['accel', 'decel']:
        eo, ec, er, ew, efs, en = data[(model, 'engine', state)]
        xo, xc, xr, xw, xfs, xn = data[(model, 'exhaust', state)]
        u = np.linspace(.02, .98, 201)
        ef = np.interp(u, eo/en, ec)
        xf = np.interp(u, xo/xn, xc)
        ei = np.array([np.argmin(np.abs((eo[:-1]+eo[1:])/2/en-t)) for t in u])
        xi = np.array([np.argmin(np.abs((xo[:-1]+xo[1:])/2/xn-t)) for t in u])
        phase_stats, _ = pair_phases(ew[ei], xw[xi])
        record = {'model': model, 'state': state, 'engineIntervals': len(er),
                  'exhaustIntervals': len(xr), 'engineDurationSeconds': en/efs,
                  'exhaustDurationSeconds': xn/xfs, 'normalizedTimeClockPearson': corr(ef, xf),
                  'normalizedTimeClockRelativeDifference': stats(np.abs(ef-xf)/((ef+xf)/2)),
                  'engineExhaustNormalizedPhaseWaveform': phase_stats,
                  'sameIndexRelationship': None,
                  'physicalEngineExhaustPhaseLockEstablished': False}
        if abs(len(eo)-len(xo)) <= 2:
            count = min(len(eo), len(xo))
            record['sameIndexRelationship'] = {'count': count,
                'clockPearson': corr(ec[:count], xc[:count]),
                'relativeClockDifference': stats(np.abs(ec[:count]-xc[:count])/((ec[:count]+xc[:count])/2)),
                'exhaustMinusEngineOffsetSeconds': stats(xo[:count]/xfs-eo[:count]/efs)}
        pairs.append(record)

evidence = {'schema': 1, 'milestone': 'STOCK-SOURCE-02',
    'scope': 'Read-only existing decoded authentic PCM and parser-unknown grain metadata; no playback or rendering',
    'method': {'phaseGrid': N, 'nativeRatesPreserved': True,
        'clockEvidence': 'Compare unknown UnkFloat1 to native sampleRate divided by adjacent UnkUint1 offset differences; left/right/mean endpoints reported independently.',
        'phaseEvidence': 'Each complete ordered interval is Fourier-resampled to a1024-point phase grid for analysis only, preserving low integer orders without decimation alias. Same-phase and best circular normalized waveform correlations use mean-removed intervals. Low-order variant retains orders1–24.',
        'periodEvidence': 'Dominant integer spectral order is selected among1–64. Fractional circular autocorrelation tests2/3/4/6/8/12 repeated structures per interval. This is not crankshaft RPM or cylinder-count inference.',
        'pairEvidence': 'Clock trajectories compared at equal normalized source-file time; same-index comparison is reported only when grain counts differ by at most2. Acoustic role phase lock is not presumed.'},
    'limitations': ['Unknown field names and units remain unknown; numerical correspondence does not recover GTA playback semantics.',
        'A high integer harmonic order does not alone prove the lowest physical fundamental or identify crank/firing cycles.',
        'Circular phase alignment is an analysis descriptor; it is not a validated phase correction or a listening assessment.',
        'Role recordings have different timbres and sometimes durations/counts; equal normalized time and shared state do not establish a common recorded sample clock.'],
    'narrowReconstructionRecommendation': [
        'Use one continuous interval-phase accumulator per source voice. Derive its period from complete observed offset spans, with smooth authored-state interpolation; do not reset phase when the selected span changes.',
        'Blend neighboring observed spans at the same normalized interval phase. Remove the short repeating neighbor-selection pattern and arbitrary start jitter. Do not consume part of the next period by starting it early.',
        'Keep the complete interval as the cycle unit: many assets contain several similar pulses or strong higher integer orders. Do not infer crank RPM or divide by a dominant spectral order.',
        'A short join overlap can use genuine preceding-source context ending at the selected start while the outgoing read reaches its full end, preserving complete interval duration. Every context read requires explicit original-file bounds; the first marker may not have a whole preceding interval.',
        'Share authored operating state between engine and exhaust, but preserve their distinct interval tables and continuous phase histories. Do not force equal record time or claim native role phase lock.',
        'Require held periodic and harmonic fixtures to retain their original frequencies at24/32/48kHz, including intervals containing1/2/4cycles, before creating a small real-source comparison. These recommendations do not constitute perceptual acceptance.'],
    'streams': summaries, 'rolePairs': pairs}
a.private_output.mkdir(parents=True, exist_ok=True)
(a.private_output/'cycle-evidence-private.json').write_text(json.dumps({'schema': 1, 'streams': private}, indent=2, allow_nan=False)+'\n')
a.evidence.parent.mkdir(parents=True, exist_ok=True)
a.evidence.write_text(json.dumps(evidence, indent=2, allow_nan=False)+'\n')
for s in summaries:
    fit = s['clockVsSampleRateOverOffsetDelta']['meanEndpoints']
    print(s['model'], s['role'], s['state'], 'clock_r=', round(fit['pearson'], 6),
          'clock_mederr=', round(fit['medianRelativeError'], 4),
          'samephase=', round(s['adjacentIntervals']['samePhaseCorrelation']['median'], 3),
          'bestphase=', round(s['adjacentIntervals']['bestCircularCorrelation']['median'], 3),
          'loopstep/rms=', round(s['directLoopJoinStepOverIntervalRms']['median'], 3),
          'orders=', sorted(s['dominantIntegerOrderHistogram'].items(), key=lambda x: -x[1])[:3])
