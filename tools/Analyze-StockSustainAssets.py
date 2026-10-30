"""Read-only sustain compatibility and transient-risk audit of verified PCM.

No audio edits, playback, extraction or native RPM/event semantics are inferred.
The private atlas contains source-derived features, never generated audio.
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
p.add_argument('--output', type=Path, required=True)
p.add_argument('--evidence', type=Path, required=True)
a = p.parse_args()
sys.path.insert(0, str(a.dependencies))
import numpy as np
from scipy import signal


def f(x):
    x = float(x)
    return x if math.isfinite(x) else None


def describe(x):
    return {'minimum': f(np.min(x)), 'median': f(np.median(x)),
            'p95': f(np.quantile(x, .95)), 'maximum': f(np.max(x))} if len(x) else None


def cosine(x, y):
    return float(np.dot(x, y)/max(1e-30, np.linalg.norm(x)*np.linalg.norm(y)))


def ranges(indices, offsets, fs):
    if not len(indices):
        return []
    chunks = np.split(indices, np.where(np.diff(indices) != 1)[0]+1)
    return [{'firstIndex': int(c[0]), 'lastIndex': int(c[-1]), 'cycles': len(c),
             'durationSeconds': f((offsets[c[-1]+1]-offsets[c[0]])/fs)} for c in chunks]


base = a.manifest.resolve().parent
manifest = json.loads(a.manifest.read_text(encoding='utf-8-sig'))
streams, summaries = [], []
for model in ['schafter3', 'bati', 'lectro', 'prototipo']:
    vehicle = next(v for v in manifest['vehicles'] if v['model'] == model)
    for role in ['engine', 'exhaust']:
        for state in ['idle', 'accel', 'decel']:
            record = vehicle['layers'][role][state]
            file = (base/record['file']).resolve()
            if base not in file.parents:
                raise ValueError('source escaped private manifest')
            raw = file.read_bytes()
            if hashlib.sha256(raw).hexdigest().upper() != record['sha256'].upper():
                raise ValueError('source hash mismatch')
            pcm = np.frombuffer(raw, dtype='<f4').astype(float)
            if len(pcm) != record['frames'] or not np.isfinite(pcm).all():
                raise ValueError('invalid source PCM')
            fs = record['sampleRate']
            offsets = np.array([g['UnkUint1'] for g in record['granular']['grains']], dtype=int)
            if not (np.all(np.diff(offsets) > 0) and np.all(offsets >= 0) and np.all(offsets < len(pcm))):
                raise ValueError('ordered complete observed intervals required')
            lengths = np.diff(offsets)
            rates = fs/lengths
            features, cycles = [], []
            for index, (start, end, rate) in enumerate(zip(offsets[:-1], offsets[1:], rates)):
                x = pcm[start:end]
                rms = np.sqrt(np.mean(x*x))
                z = x-np.mean(x)
                power = np.abs(np.fft.rfft(z))**2
                hz = np.fft.rfftfreq(len(z), 1/fs)
                total = max(1e-30, np.sum(power[hz >= 20]))
                bands = [float(np.sum(power[(hz >= lo) & (hz < hi)])/total)
                         for lo, hi in [(20, 500), (500, 2000), (2000, fs/2+1)]]
                order = power[1:65]
                order = np.pad(order, (0, 64-len(order)))
                order = order/max(1e-30, np.sum(order))
                crest = 20*np.log10(max(1e-30, np.max(np.abs(x)))/max(rms, 1e-30))
                size = max(1, round(fs*.001))
                energy = np.r_[0, np.cumsum(x*x)]
                short_peak = np.sqrt(np.max((energy[size:]-energy[:-size])/size))
                envelope = np.array([np.sqrt(np.mean(c*c))/max(rms, 1e-30)
                                     for c in np.array_split(x, 8)])
                features.append({'index': index, 'startFrame': int(start), 'endFrame': int(end),
                    'rateHz': f(rate), 'rms': f(rms), 'crestDb': f(crest),
                    'bandFractions': dict(zip(['low20to500', 'mid500to2000', 'high2000toNyquist'], bands)),
                    'orderPowerFractions1to64': order.tolist(), 'dominantOrder': int(np.argmax(order)+1),
                    'envelope8': envelope.tolist(), 'maximum1msRms': f(short_peak),
                    'transientRisk': False, 'transientReasons': []})
                cycles.append(signal.resample(x, 1024))
            rms = np.array([r['rms'] for r in features])
            crest = np.array([r['crestDb'] for r in features])
            short_peak = np.array([r['maximum1msRms'] for r in features])
            orders = np.array([r['orderPowerFractions1to64'] for r in features])
            bands = np.array([list(r['bandFractions'].values()) for r in features])
            envelopes = np.array([r['envelope8'] for r in features])
            for i, feature in enumerate(features):
                neighbors = np.r_[max(0, i-8):i, i+1:min(len(features), i+9)]
                if not len(neighbors):
                    continue
                local_rms = np.median(rms[neighbors])
                rms_boost = 20*np.log10(rms[i]/max(1e-30, local_rms))
                short_boost = 20*np.log10(short_peak[i]/max(1e-30, np.median(short_peak[neighbors])))
                crest_boost = crest[i]-np.median(crest[neighbors])
                innovation = 1-cosine(np.sqrt(orders[i]), np.sqrt(np.median(orders[neighbors], axis=0)))
                # Isolated multi-feature outlier only. Normal firing pulses or
                # marker splices do not by themselves establish a one-shot pop.
                risk = ((rms_boost > 6 or short_boost > 6) and innovation > .20) or (crest_boost > 6 and short_boost > 3 and innovation > .15)
                if risk:
                    feature['transientRisk'] = True
                    feature['transientReasons'] = ['isolated-envelope-and-spectral-outlier; identity unverified']
                feature['transientScores'] = {'rmsBoostDb': f(rms_boost), 'peak1msBoostDb': f(short_boost),
                    'crestBoostDb': f(crest_boost), 'orderInnovation': f(innovation)}
            risk = np.array([r['transientRisk'] for r in features])
            centres = (offsets[:-1]+offsets[1:])/2
            operating = []
            states = [('idle', .5)] if state == 'idle' else [('low', .15), ('middle', .55), ('high', .95)]
            for label, operating_point in states:
                source_u = 1-operating_point if state == 'decel' else operating_point
                target = source_u*(len(pcm)-1)
                b = min(len(rates)-1, int(np.searchsorted(centres, target)))
                left = max(0, b-1) if target > centres[0] else 0
                weight = np.clip((target-centres[left])/(centres[b]-centres[left]), 0, 1) if left != b else 0
                ref_rate = fs/((1-weight)*lengths[left]+weight*lengths[b])
                anchor = int(np.argmin(np.abs(centres-target)))
                for tolerance in [.03, .05]:
                    rate_ok = np.abs(rates/ref_rate-1) <= tolerance
                    candidates = np.flatnonzero(rate_ok)
                    reference = candidates[~risk[candidates]]
                    if not len(reference):
                        reference = np.array([anchor])
                    ref_rms = np.median(rms[reference])
                    ref_crest = np.median(crest[reference])
                    ref_bands = np.median(bands[reference], axis=0)
                    ref_order = np.sqrt(np.median(orders[reference], axis=0))
                    level_error = np.abs(20*np.log10(np.maximum(rms, 1e-30)/max(ref_rms, 1e-30)))
                    band_error = np.sum(np.abs(bands-ref_bands), axis=1)
                    order_similarity = np.array([cosine(np.sqrt(o), ref_order) for o in orders])
                    compatible = rate_ok & (level_error <= 3) & (crest <= ref_crest+6) & (band_error <= .35) & (order_similarity >= .85) & ~risk
                    indices = np.flatnonzero(compatible)
                    phrase_ranges = ranges(indices, offsets, fs)
                    rate_ranges = ranges(candidates, offsets, fs)
                    # The closest compatible contiguous region is useful for
                    # chronological phrase traversal; all compatible indices
                    # remain available for bounded phase-aware alternatives.
                    close = min(phrase_ranges, key=lambda r: max(r['firstIndex']-anchor, 0, anchor-r['lastIndex'])) if phrase_ranges else None
                    variation = []
                    for i in indices[:-1]:
                        if i+1 in indices:
                            x, y = cycles[i]-np.mean(cycles[i]), cycles[i+1]-np.mean(cycles[i+1])
                            variation.append(cosine(x, y))
                    operating.append({'label': label, 'operatingPoint': operating_point, 'sourcePosition': f(source_u),
                        'targetRateHz': f(ref_rate), 'anchorIndex': anchor, 'tolerance': tolerance,
                        'rateOnlyIndices': candidates.tolist(), 'compatibleIndices': indices.tolist(),
                        'contiguousRateOnlyRanges': rate_ranges, 'contiguousCompatibleRanges': phrase_ranges,
                        'closestCompatibleRange': close,
                        'totalCompatibleSeconds': f(np.sum(lengths[indices])/fs),
                        'adjacentCompatibleWaveformCorrelation': describe(variation),
                        'compatibleRmsDbRange': describe(20*np.log10(rms[indices])) if len(indices) else None,
                        'compatibleBandFractionRanges': {name: describe(bands[indices, j]) for j, name in enumerate(['low', 'mid', 'high'])} if len(indices) else None})
            stream = {'model': model, 'role': role, 'state': state, 'file': record['file'], 'sha256': record['sha256'],
                'sampleRate': fs, 'frames': len(pcm), 'intervals': features, 'operatingRegions': operating,
                'metadataMeaning': 'Adjacent ordered UnkUint1 offsets are observed spans; rate is sampleRate/spanFrames, never crank RPM. Idle spans are analysis candidates, not verified native idle-loop semantics.'}
            streams.append(stream)
            summaries.append({key: stream[key] for key in ['model', 'role', 'state', 'sha256', 'sampleRate', 'frames']}
                | {'intervalCount': len(features), 'sourceDurationSeconds': len(pcm)/fs,
                   'transientRiskCount': int(np.sum(risk)), 'embeddedEventIdentity': 'unverified; no detected outlier is labeled a pop/shift/limiter',
                   'operatingRegions': [{k: r[k] for k in ['label', 'operatingPoint', 'sourcePosition', 'targetRateHz', 'tolerance', 'totalCompatibleSeconds', 'closestCompatibleRange', 'adjacentCompatibleWaveformCorrelation', 'compatibleRmsDbRange']}
                       | {'rateOnlyCycleCount': len(r['rateOnlyIndices']), 'compatibleCycleCount': len(r['compatibleIndices']),
                          'longestCompatiblePhraseCycles': max([q['cycles'] for q in r['contiguousCompatibleRanges']], default=0)} for r in operating]})

criteria = {'periodRateTolerance': [.03, .05], 'rawCycleRmsDbFromPoolMedianMaximum': 3,
    'crestDbAbovePoolMedianMaximum': 6, 'sumAbsoluteLowMidHighFractionDifferenceMaximum': .35,
    'sqrtOrderPowerCosineMinimum': .85, 'isolatedTransientRisksExcluded': True,
    'semantics': 'Explicit conservative analysis heuristics, not calibrated native state boundaries or proof of transient absence. Source audio is never normalized or edited.'}
a.output.mkdir(parents=True, exist_ok=True)
(a.output/'atlas.json').write_text(json.dumps({'schema': 1, 'criteria': criteria, 'streams': streams}, indent=2, allow_nan=False)+'\n')
a.evidence.parent.mkdir(parents=True, exist_ok=True)
a.evidence.write_text(json.dumps({'schema': 1, 'milestone': 'STOCK-SOURCE-03', 'criteria': criteria,
    'scope': 'All24 existing verified source layers; read-only numeric feature audit, no audio generation/playback/extraction',
    'limitations': ['Available compatible material is finite and often less than1s at high state. Reordering it does not create new recorded sustain.',
        'Compatible source spans can be phase-retimed to a fixed requested clock; do not vary the clock to follow source-rate differences.',
        'Sustain screening flags isolated numeric outliers, not proven pops or guaranteed transient-free audio.',
        'Idle remains a separate recorded operating state; its low/middle/high rev mapping is not established.',
        'No separate intake/KERS or discrete event identity is inferred from sustained layers.'], 'streams': summaries}, indent=2, allow_nan=False)+'\n')
for s in summaries:
    for r in s['operatingRegions']:
        if r['label'] == 'high' and r['tolerance'] == .05:
            print(s['model'], s['role'], s['state'], 'ratePool=', r['rateOnlyCycleCount'],
                  'compatible=', r['compatibleCycleCount'], 'seconds=', round(r['totalCompatibleSeconds'], 3),
                  'closest=', r['closestCompatibleRange'], 'transientRisks=', s['transientRiskCount'])
