"""Read-only stock PCM spectrum/periodicity atlas; no playback or RPM claims."""
import argparse
import hashlib
import json
import sys
from pathlib import Path

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('manifest', type=Path)
p.add_argument('--dependencies', type=Path)
p.add_argument('--output', type=Path)
a = p.parse_args()
if a.dependencies:
    sys.path.insert(0, str(a.dependencies))
import numpy as np
from scipy import signal, stats

root = a.manifest.resolve().parent
manifest = json.loads(a.manifest.read_text(encoding='utf-8-sig'))
output = a.output or root/'analysis.json'
if '.local' not in output.resolve().parts:
    raise ValueError('Private .local output required')
bands = [(20, 150), (150, 500), (500, 2000), (2000, 6000), (6000, 20000)]

def periodicity(x, fs):
    """Strongest early NSDF period in 40..2000Hz; octave ambiguity remains."""
    y = x.astype(float) - np.mean(x)
    # Analysis-only highpass removes DC/very slow drift without modifying PCM.
    y = signal.sosfilt(signal.butter(2, 35, fs=fs, btype='highpass', output='sos'), y)
    n = len(y)
    if n < fs*.08 or np.mean(y*y) < 1e-12:
        return None, 0.0, []
    corr = signal.correlate(y, y, mode='full', method='fft')[n-1:]
    sums = np.concatenate(([0.0], np.cumsum(y*y)))
    lag = np.arange(len(corr))
    denominator = sums[n-lag] + sums[n] - sums[lag]
    nsdf = np.divide(2*corr, denominator, out=np.zeros_like(corr), where=denominator>1e-15)
    lo, hi = max(2, int(fs/2000)), min(n//2, int(fs/40))
    peaks, _ = signal.find_peaks(nsdf[lo:hi+1])
    peaks += lo
    if not len(peaks):
        return None, 0.0, []
    strongest = float(np.max(nsdf[peaks]))
    eligible = peaks[nsdf[peaks] >= max(.55, strongest*.88)]
    if not len(eligible):
        return None, strongest, []
    chosen = int(eligible[0])
    # Quadratic peak interpolation avoids assigning pitches to integer lag bins.
    def pitch(k):
        shift = 0.0
        if 0 < k < len(nsdf)-1:
            d = nsdf[k-1]-2*nsdf[k]+nsdf[k+1]
            if abs(d)>1e-12:
                shift = float(np.clip(.5*(nsdf[k-1]-nsdf[k+1])/d, -.5, .5))
        return float(fs/(k+shift))
    alternatives = sorted(peaks, key=lambda k: nsdf[k], reverse=True)[:3]
    return pitch(chosen), float(nsdf[chosen]), [pitch(int(k)) for k in alternatives]

private_records, summaries, interval_records = [], [], []
for vehicle in manifest['vehicles']:
    if vehicle['status'] != 'decoded-six-source-layers':
        continue
    for role in ['engine', 'exhaust']:
        for state in ['idle', 'accel', 'decel']:
            asset = vehicle['layers'][role][state]
            file = (root/asset['file']).resolve()
            if not file.is_relative_to(root):
                raise ValueError('PCM asset escaped private manifest directory')
            data = file.read_bytes()
            assert hashlib.sha256(data).hexdigest().upper() == asset['sha256'].upper(), 'PCM binding differs'
            x = np.frombuffer(data, dtype='<f4').astype(float)
            fs = int(asset['sampleRate'])
            assert len(x) == asset['frames'] and np.isfinite(x).all()
            f, power = signal.welch(x, fs=fs, nperseg=min(8192, len(x)))
            total = float(power[(f >= 20) & (f < min(20000, fs/2))].sum())
            fractions = {f'{lo}-{hi}Hz': float(power[(f>=lo)&(f<min(hi,fs/2))].sum()/max(total,1e-30)) for lo,hi in bands}
            rms, peak = float(np.sqrt(np.mean(x*x))), float(np.max(np.abs(x)))
            window, hop = int(round(fs*.15)), int(round(fs*.075))
            rows = []
            for start in range(0, len(x)-window+1, hop):
                chunk = x[start:start+window]
                hz, confidence, alternatives = periodicity(chunk, fs)
                ff, pp = signal.welch(chunk, fs=fs, nperseg=min(4096,len(chunk)))
                valid = (ff >= 40) & (ff <= min(6000,fs/2))
                dominant = float(ff[np.flatnonzero(valid)[int(np.argmax(pp[valid]))]])
                centroid = float(np.sum(ff[valid]*pp[valid])/max(float(np.sum(pp[valid])),1e-30))
                rows.append({'frame':start,'seconds':start/fs,'centreSeconds':(start+window/2)/fs,
                             'periodHz':hz,'periodicity':confidence,'alternativePeriodsHz':alternatives,
                             'dominantSpectralHz':dominant,'spectralCentroid40to6000Hz':centroid,
                             'rms':float(np.sqrt(np.mean(chunk*chunk)))})
            reliable = [r for r in rows if r['periodHz'] is not None and r['periodicity']>=.7]
            coverage = len(reliable)/max(1,len(rows))
            rho = float(stats.spearmanr([r['seconds'] for r in reliable],[r['periodHz'] for r in reliable]).statistic) if len(reliable)>=5 else None
            if rho is not None and not np.isfinite(rho):
                rho = None
            usable = coverage >= .65 and rho is not None and abs(rho)>=.75
            trend = 'increasing' if usable and rho>0 else 'decreasing' if usable else 'not-reliably-monotonic'
            centroid_rho = float(stats.spearmanr([r['seconds'] for r in rows],[r['spectralCentroid40to6000Hz'] for r in rows]).statistic) if len(rows)>=5 else None
            if centroid_rho is not None and not np.isfinite(centroid_rho):
                centroid_rho = None
            quarter=max(1,len(rows)//4)
            low_centroid=float(np.median([r['spectralCentroid40to6000Hz'] for r in rows[:quarter]]))
            high_centroid=float(np.median([r['spectralCentroid40to6000Hz'] for r in rows[-quarter:]]))
            spectral_usable = state != 'idle' and centroid_rho is not None and abs(centroid_rho)>=.75 and abs(np.log2(high_centroid/low_centroid))>=np.log2(1.1)
            spectral_trend = 'brightening' if spectral_usable and centroid_rho>0 else 'darkening' if spectral_usable else 'not-reliably-monotonic'
            values = [r['periodHz'] for r in reliable]
            # UnkUint1 is only tested as an offset candidate. Ordered in-range
            # values and elevated steps are evidence, not a recovered format.
            candidates=np.asarray([g['UnkUint1'] for g in asset.get('granular',{}).get('grains',[])],dtype=np.int64)
            within=candidates[(candidates>0)&(candidates<len(x))]
            adjacent=np.abs(np.diff(x))
            candidate_steps=np.abs(x[within]-x[within-1]) if len(within) else np.asarray([])
            offset_evidence={'field':'UnkUint1','semantics':'offset candidate only; native meaning unverified',
                             'count':len(candidates),'inRangeCount':len(within),
                             'nondecreasing':bool(np.all(np.diff(candidates)>=0)),
                             'wholeSourceMedianAdjacentStep':float(np.median(adjacent)),
                             'candidateMedianAdjacentStep':float(np.median(candidate_steps)) if len(within) else None,
                             'candidateMaximumAdjacentStep':float(np.max(candidate_steps)) if len(within) else None,
                             'candidateFractionOverWholeSourceP99':float(np.mean(candidate_steps>np.quantile(adjacent,.99))) if len(within) else None}
            summary = {'model':vehicle['model'],'layer':role,'state':state,'sourceSha256':asset['sha256'],
                       'sampleRate':fs,'frames':len(x),'seconds':len(x)/fs,'peak':peak,'rms':rms,
                       'rmsDbfs':float(20*np.log10(max(rms,1e-15))),'crestDb':float(20*np.log10(max(peak,1e-15)/max(rms,1e-15))),
                       'dc':float(np.mean(x)),'bandPowerFractions':fractions,
                       'analysisWindows':len(rows),'reliablePeriodCoverage':coverage,'periodTimeSpearman':rho,
                       'chronologicalPitchTrend':trend,'chronologicalPitchMappingSupported':usable,
                       'centroidTimeSpearman':centroid_rho,'firstQuarterCentroidHz':low_centroid,'lastQuarterCentroidHz':high_centroid,
                       'chronologicalSpectralTrend':spectral_trend,
                       'normalizedOperatingPointTimeApproximation':('u' if centroid_rho>0 else '1-u') if spectral_usable else 'unverified',
                       'periodHzRange':[float(min(values)),float(max(values))] if values else None,
                       'grainIntegerOffsetEvidence':offset_evidence,
                       'absoluteRpmKnown':False}
            summaries.append(summary)
            ranked=sorted(reliable,key=lambda r:r['periodHz'])
            private_records.append({**summary,'file':asset['file'],'regions':rows,
                                    'periodRankedRegionAtlas': [{'u':i/max(1,len(ranked)-1),'frame':r['frame'],'periodHz':r['periodHz'],'periodicity':r['periodicity']} for i,r in enumerate(ranked)] if usable else []})
            if state != 'idle':
                valid_offsets=sorted(set(int(g) for g in candidates if 0<=g<len(x)))
                intervals=[]
                for start,end in zip(valid_offsets[:-1],valid_offsets[1:]):
                    centre=(start+end)/2/fs
                    nearest=min(rows,key=lambda r:abs(r['centreSeconds']-centre))
                    intervals.append({'startFrame':start,'endFrame':end,'durationSeconds':(end-start)/fs,
                                      'sourceCentreFraction':(start+end)/2/len(x),
                                      'nearestAnalysisCentreSeconds':nearest['centreSeconds'],
                                      'nearbyPeriodHz':nearest['periodHz'],'nearbyPeriodicity':nearest['periodicity'],
                                      'nearbySpectralCentroidHz':nearest['spectralCentroid40to6000Hz']})
                minimum_reports=[]
                for minimum in [.08,.04]:
                    selected=[r for r in intervals if r['durationSeconds']>=minimum]
                    reliable_pitch=[r['nearbyPeriodHz'] for r in selected if r['nearbyPeriodHz'] is not None and r['nearbyPeriodicity']>=.7]
                    centroids=[r['nearbySpectralCentroidHz'] for r in selected]
                    minimum_reports.append({'minimumSeconds':minimum,'count':len(selected),
                      'sourceCentreFractionRange':[min(r['sourceCentreFraction'] for r in selected),max(r['sourceCentreFraction'] for r in selected)] if selected else None,
                      'fractionOfSourceSamplesCovered':sum(r['endFrame']-r['startFrame'] for r in selected)/len(x),
                      'lastQuarterSampleCoverage':sum(max(0,min(r['endFrame'],len(x))-max(r['startFrame'],len(x)*.75)) for r in selected)/(len(x)*.25),
                      'reliableNearbyPeriodHzRange':[min(reliable_pitch),max(reliable_pitch)] if reliable_pitch else None,
                      'nearbyCentroidHzRange':[min(centroids),max(centroids)] if centroids else None})
                interval_records.append({'model':vehicle['model'],'layer':role,'state':state,'file':asset['file'],
                  'sampleRate':fs,'frames':len(x),'semantics':'Intervals between ordered in-range UnkUint1 offset candidates; observed source segmentation approximation, not proven native grain semantics.',
                  'edgePolicy':'No synthetic zero/file-end boundaries added. Prefix before first offset and suffix after last offset excluded.',
                  'metadataOffsetCount':len(candidates),'uniqueInRangeOffsetCount':len(valid_offsets),
                  'minimumDurationCoverage':minimum_reports,'candidateIntervals':intervals})

method = {'windowSeconds':.15,'hopSeconds':.075,'periodRangeHz':[40,2000],
          'method':'35Hz analysis-only highpass, normalized square difference autocorrelation; earliest peak >=max(.55,.88*best); reliable >=.7. Period labels may be engine orders/octaves, never crankshaft RPM.',
          'mappingGate':'At least65% reliable windows and absolute Spearman correlation >=.75; only chronological direction is supported, not native granular playback semantics.',
          'spectralMappingGate':'Non-idle, absolute centroid/time Spearman>=.75 and first/last-quarter median centroid changes>=10%. u/1-u is an authored spectral-state/time approximation, not an RPM law or proven granular algorithm.',
          'spectralMethod':'Welch PSD, mean-removed; fractions normalized over20Hz to native Nyquist or20kHz. Raw RMS includes source DC. No audio edits or normalization.'}
output.write_text(json.dumps({'schema':1,'method':method,'streams':private_records},indent=2),encoding='utf-8')
summary_path = output.with_name(output.stem+'-summary.json')
summary_path.write_text(json.dumps({'schema':1,'method':method,'streams':summaries},indent=2),encoding='utf-8')
output.with_name(output.stem+'-intervals.json').write_text(json.dumps({'schema':1,'streams':interval_records},indent=2),encoding='utf-8')
for r in summaries:
    print(f"{r['model']:10} {r['layer']:7} {r['state']:5} rms={r['rms']:.4f} crest={r['crestDb']:.2f}dB periodCoverage={r['reliablePeriodCoverage']:.2f} spectralRho={r['centroidTimeSpearman']} {r['chronologicalSpectralTrend']} map={r['normalizedOperatingPointTimeApproximation']}")
