"""Private four-vehicle audition measurement/page; no playback or normalization.

Uses existing numpy/scipy/matplotlib/imageio-ffmpeg dependencies. Input recordings,
decoded banks, plots and HTML remain private; only bounded scalar evidence exports.
"""
import argparse
import hashlib
import html
import json
import math
import re
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('output', type=Path, help='existing private audition directory')
parser.add_argument('--dependencies', type=Path)
parser.add_argument('--evidence', type=Path, help='optional sanitized numerical JSON export')
args = parser.parse_args()
if args.dependencies:
    sys.path.insert(0, str(args.dependencies))
import numpy as np
from scipy import signal
from scipy.io import wavfile
import imageio_ffmpeg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out = args.output.resolve()
if '.local' not in out.parts or not out.is_dir():
    raise ValueError('Existing private .local audition directory required')
render_file = out/'render-report.json'
render = json.loads(render_file.read_text(encoding='utf-8-sig'))
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
CASES = [('dry', 'Dry reconstructed source'), ('close', 'Close operating study'),
         ('flyby', 'Open flyby'), ('street', 'Finite street operating study'),
         ('wall-open', 'Wall comparison · unobstructed control'),
         ('wall', 'Wall comparison · authored finite obstruction'),
         ('tunnel-early', 'Tunnel · early only'), ('tunnel-before', 'Tunnel · previous late send'),
         ('tunnel', 'Tunnel · source-energy late send')]
NAMES = {'bati':'Pegassi Bati 801', 'lectro':'Principe Lectro',
         'prototipo':'Grotti X80 Proto', 'schafter3':'Benefactor Schafter V12'}
BANDS = [(20,150),(150,500),(500,2000),(2000,6000),(6000,20000)]
CRITERIA = {
    'finiteNonclippingMatrix':'All nine preview WAVs must exist, contain finite PCM and have no full-scale samples.',
    'rendererDiagnostics':'All eight processed cases must report zero limiter, missing PCM history, cursor reset, rejected control and affected-history-frame counters.',
    'loudnessAvailability':'All nine previews must have successful FFmpeg EBU R128 measurements.',
    'sourceOverlapEnergy':'Every processed engine/exhaust overlapEnergyDb must be >= -3 dB: a declared review threshold retaining approximately half the selected unphased raw energy, not a universal perceptual target.',
    'closeBodyShare':'Close versus dry 20-500 Hz relative power share must be >= -6 dB. This is a diagnostic review flag, not an SPL or bass-equalization target. A failure requires investigation of retarded two-emitter interference before compensation.',
    'recession':'Near-pass RMS must exceed final-second RMS, and final-second absolute 2-6 kHz Welch energy must be lower. Source state and directivity also change; this does not isolate atmospheric absorption.',
    'controlledComparisons':'All processed cases share the declared source gain and master; seven stationary environment cases share source and motion hashes.',
    'interpretation':'Passing these numerical criteria does not establish subjective strength, recognition, physical SPL or human approval.'}

def finite(value):
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError):
        return None

def db(value):
    return 20*math.log10(value) if value > 0 else None

def rms(x):
    return float(np.sqrt(np.mean(x*x))) if x.size else 0.0

def read_wave(file):
    fs, source = wavfile.read(file)
    if source.ndim == 1:
        source = source[:,None]
    if source.dtype.kind in 'iu':
        if source.dtype.kind == 'u':
            x = (source.astype(float)-128)/128
        else:
            x = source.astype(float)/(2**(source.dtype.itemsize*8-1))
    else:
        x = source.astype(float)
    if not len(x) or x.shape[1] not in [1,2] or not np.isfinite(x).all():
        raise ValueError('Invalid finite mono/stereo WAV')
    return int(fs), x

def loudness(file, near=None, duration=None):
    # Null muxer measures only. stderr can contain paths, so export numeric
    # fields exclusively and never forward raw FFmpeg diagnostics.
    try:
        result = subprocess.run([FFMPEG,'-nostdin','-hide_banner','-nostats','-i',str(file),
            '-vn','-af','ebur128=peak=true','-f','null','-'], capture_output=True, text=True,
            check=True, timeout=90)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return {'available':False, 'failureKind':'ffmpeg-measurement-failed'}
    summary = result.stderr.rsplit('Summary:',1)[-1]
    def match(pattern):
        found = re.search(pattern, summary)
        return finite(found.group(1)) if found else None
    frames = []
    for line in result.stderr.splitlines():
        values = re.search(r'\bt:\s*([\d.]+).*?\bM:\s*([-+\w.]+).*?\bS:\s*([-+\w.]+)',line)
        if values:
            t,m,s = map(finite,values.groups())
            frames.append((t,m if m is not None and m>-120 else None,
                             s if s is not None and s>-120 else None))
    momentary = [m for t,m,s in frames if m is not None]
    short = [s for t,m,s in frames if s is not None]
    def selected(centre, seconds, column):
        if centre is None:
            return None
        available=[r for r in frames if r[column] is not None and r[0]>=seconds-.11]
        if not available:
            return None
        chosen=min(available,key=lambda r:abs(r[0]-(centre+seconds/2)))
        return {'lufs':chosen[column],'windowSeconds':seconds,
                'approximateStartSeconds':max(0,chosen[0]-seconds),
                'approximateEndSeconds':chosen[0],
                'basis':'nearest FFmpeg 100 ms EBU R128 frame; time window ends at logged timestamp'}
    integrated = match(r'I:\s+([-+\w.]+) LUFS')
    return {'available':True, 'integratedLufs':integrated,
            'loudnessRangeLu':match(r'LRA:\s+([-+\w.]+) LU'),
            'truePeakDbfs':match(r'Peak:\s+([-+\w.]+) dBFS'),
            'maximumMomentary400msLufs':max(momentary) if momentary else None,
            'maximumShortTerm3sLufs':max(short) if short else None,
            'nearMomentary400ms':selected(near,.4,1),
            'nearShortTerm3s':selected(near,3,2),
            'farMomentary400ms':selected(duration-.5,.4,1) if near is not None and duration else None,
            'belowAbsoluteIntegratedGate':integrated is not None and integrated <= -69.9,
            'method':'FFmpeg EBU R128; measurement only; short/quiet clips limit integrated/LRA interpretation'}

def metrics(x, fs):
    value = rms(x)
    peak = float(np.max(np.abs(x)))
    f, power = signal.welch(x, fs=fs, nperseg=min(8192,len(x)), axis=0)
    power = power.mean(axis=1)
    total = float(power[(f>=20)&(f<min(20000,fs/2))].sum())
    fractions = {f'{lo}-{hi}Hz':float(power[(f>=lo)&(f<min(hi,fs/2))].sum()/max(total,1e-30)) for lo,hi in BANDS}
    bin_hz=float(f[1]-f[0]) if len(f)>1 else 0
    band_power={f'{lo}-{hi}Hz':float(power[(f>=lo)&(f<min(hi,fs/2))].sum()*bin_hz) for lo,hi in BANDS}
    return {'frames':len(x), 'sampleRate':fs, 'channels':x.shape[1], 'durationSeconds':len(x)/fs,
            'rms':value, 'rmsDbfs':db(value), 'peak':peak, 'peakDbfs':db(peak),
            'peakHeadroomDb':-db(peak) if peak else None,
            'crestDb':db(peak/value) if value else None,
            'fullScaleSamples':int(np.count_nonzero(np.abs(x)>=1)), 'nonfiniteSamples':0,
            'maximumAdjacentSampleStep':float(np.max(np.abs(np.diff(x,axis=0)))) if len(x)>1 else 0,
            'bandPowerFractions':fractions,
            'welchBandPower':band_power,'welchBandRmsDbfs':{k:db(math.sqrt(v)) for k,v in band_power.items()},
            'spectralCentroidHz':float(np.sum(f*power)/max(np.sum(power),1e-30))}

def window_metrics(x, fs, start, end):
    lo, hi = max(0,round(start*fs)), min(len(x),round(end*fs))
    if hi <= lo:
        return None
    measured = metrics(x[lo:hi],fs)
    return {'startSeconds':lo/fs,'endSeconds':hi/fs,**measured}

def loudest_window(x, fs, seconds):
    n = min(len(x), max(1,round(seconds*fs)))
    energy = np.mean(x*x,axis=1)
    cumulative = np.concatenate(([0.0],np.cumsum(energy)))
    starts = np.arange(0,len(x)-n+1,max(1,round(fs*.01)))
    if not len(starts):
        starts = np.array([0])
    values = (cumulative[starts+n]-cumulative[starts])/n
    index = int(starts[int(np.argmax(values))])
    return window_metrics(x,fs,index/fs,(index+n)/fs)

def near_time(report):
    # Accept explicit author metadata, never silently label a loudest window
    # as a measured distance or physical near-pass location.
    for value in [report.get('nearTime'),report.get('passTime'),report.get('closestTime'),
                  report.get('scenario',{}).get('nearTime'),report.get('scenario',{}).get('passTime')]:
        if finite(value) is not None:
            return float(value)
    return None


def time_evolution(x, fs):
    """Bounded 50 ms RMS/peak/crest/band evolution, per-channel energy."""
    window=max(1,round(.05*fs))
    rows=[]
    for lo in range(0,len(x),window):
        hi=min(len(x),lo+window)
        if hi-lo<window/2:
            continue
        m=metrics(x[lo:hi],fs)
        rows.append({'centreSeconds':(lo+hi)/(2*fs),
                     **{k:m[k] for k in ['rmsDbfs','peakDbfs','crestDb','bandPowerFractions','welchBandRmsDbfs','spectralCentroidHz']}})
    return {'windowSeconds':.05,'hopSeconds':.05,'frames':rows}


def near_far_comparison(near, far):
    if near is None or far is None:
        return None
    bands={}
    for band,n in near['bandPowerFractions'].items():
        f=far['bandPowerFractions'][band]
        bands[band]=10*math.log10(f/n) if n>0 and f>0 else None
    near_low=sum(near['bandPowerFractions'][k] for k in ['20-150Hz','150-500Hz'])
    far_low=sum(far['bandPowerFractions'][k] for k in ['20-150Hz','150-500Hz'])
    near_high=sum(near['bandPowerFractions'][k] for k in ['2000-6000Hz','6000-20000Hz'])
    far_high=sum(far['bandPowerFractions'][k] for k in ['2000-6000Hz','6000-20000Hz'])
    level_delta=db(far['rms']/near['rms']) if near['rms'] and far['rms'] else None
    high_low_delta=10*math.log10((far_high/far_low)/(near_high/near_low)) if min(near_low,far_low,near_high,far_high)>0 else None
    return {'farMinusNearRmsDb':level_delta,
            'farVsNearRelativeBandShareDb':bands,
            'farMinusNearWelchBandRmsDb':{band:10*math.log10(far['welchBandPower'][band]/n) if n>0 and far['welchBandPower'][band]>0 else None for band,n in near['welchBandPower'].items()},
            'farVsNearHighToLowBandRatioDb':high_low_delta,
            'observedFarQuieter':level_delta<0 if level_delta is not None else None,
            'observedFarLowerHighToLowRatio':high_low_delta<0 if high_low_delta is not None else None,
            'interpretation':'Includes authored source-state and directional changes as well as propagation; not an isolated air-absorption measurement'}

def numeric_tree(value, depth=0):
    # Sanitized evidence intentionally omits arbitrary text, paths and payloads.
    if depth>8:
        return None
    if value is None or isinstance(value,bool):
        return value
    if isinstance(value,(int,float)):
        return finite(value)
    if isinstance(value,dict):
        return {k:numeric_tree(v,depth+1) for k,v in value.items()
                if re.fullmatch(r'[A-Za-z][A-Za-z0-9_-]{0,63}',str(k)) and isinstance(v,(dict,list,int,float,bool,type(None)))}
    if isinstance(value,list):
        return [numeric_tree(v,depth+1) for v in value[:64] if isinstance(v,(dict,list,int,float,bool,type(None)))]
    return None

def difference(first, second, fs, windows):
    if first.shape != second.shape:
        return {'comparable':False,'reason':'different-shape'}
    delta = second-first
    rows = []
    for lo,hi in windows:
        i,j=max(0,round(lo*fs)),min(len(delta),round(hi*fs))
        if j<=i:
            continue
        early, wet = rms(first[i:j]), rms(delta[i:j])
        rows.append({'startSeconds':i/fs,'endSeconds':j/fs,
                     'earlyRms':early,'differenceRms':wet,'differenceRmsDbfs':db(wet),
                     'differenceToEarlyDb':db(wet/early) if early else None,
                     'differencePeak':float(np.max(np.abs(delta[i:j])))})
    return {'comparable':True,'windows':rows,
            'interpretation':'PCM difference isolates late contribution only when source/early controls are identical'}


def paired_transmission(reports, audio, file_reports):
    if not all(k in reports for k in ['wall-open','wall']):
        return {'available':False}
    open_fs,open_audio=audio['wall-open'];wall_fs,wall_audio=audio['wall']
    if open_fs!=wall_fs or open_audio.shape!=wall_audio.shape:
        return {'available':True,'comparable':False,'reason':'different-rate-or-shape'}
    before,after=reports['wall-open'],reports['wall']
    window=before['loudest400ms']
    a=window_metrics(open_audio,open_fs,window['startSeconds'],window['endSeconds'])
    b=window_metrics(wall_audio,wall_fs,window['startSeconds'],window['endSeconds'])
    def band_ratios(a,b):
        return {band:10*math.log10(b['welchBandPower'][band]/value) if value>0 and b['welchBandPower'][band]>0 else None
                for band,value in a['welchBandPower'].items()}
    def loudness_delta(key):
        a,b=before['loudness'].get(key),after['loudness'].get(key)
        return b-a if a is not None and b is not None else None
    old,new=[file_reports.get(k,{}) for k in ['wall-open','wall']]
    return {'available':True,'comparable':True,
            'basis':'Authored finite wall and material assumptions; not measured GTA world geometry or material calibration',
            'identicalSourceHash':bool(old.get('sourceHash')) and old.get('sourceHash')==new.get('sourceHash'),
            'identicalMotionHash':bool(old.get('motionHash')) and old.get('motionHash')==new.get('motionHash'),
            'identicalSourceGain':old.get('sourceGain') is not None and old.get('sourceGain')==new.get('sourceGain'),
            'identicalRendererMasterGain':old.get('rendererMasterGain') is not None and old.get('rendererMasterGain')==new.get('rendererMasterGain'),
            'wholeRmsDifferenceDb':db(after['rms']/before['rms']) if before['rms'] and after['rms'] else None,
            'wholeIntegratedLufsDifference':loudness_delta('integratedLufs'),
            'maximumMomentary400msLufsDifference':loudness_delta('maximumMomentary400msLufs'),
            'wholeBandAttenuationDb':band_ratios(before,after),
            'matchedOpenLoudest400ms':{'open':a,'wall':b,
                'rmsDifferenceDb':db(b['rms']/a['rms']) if a['rms'] and b['rms'] else None,
                'bandAttenuationDb':band_ratios(a,b)},
            'interpretation':'Wall minus open; negative values indicate attenuation. Measured finite-fixture result, without per-file normalization or inferred city coverage.'}


def evaluate_quality(reports, entry, calibration):
    """Explicit numerical gates; energetic thresholds are review flags only."""
    gates={}
    def gate(name, passed, observed, criterion, review=False):
        gates[name]={'passed':passed is True,'status':'pass' if passed is True else 'review' if review or passed is None else 'fail',
                     'observed':observed,'criterion':criterion}
    expected=[key for key,label in CASES]
    processed=[key for key in expected if key!='dry']
    file_reports=entry.get('files',{})
    complete=all(key in reports for key in expected)
    gate('finiteNonclippingMatrix',complete and all(m['nonfiniteSamples']==0 and m['fullScaleSamples']==0 for m in reports.values()),
         {'present':len(reports),'expected':len(expected),'nonfiniteSamples':sum(m['nonfiniteSamples'] for m in reports.values()),
          'fullScaleSamples':sum(m['fullScaleSamples'] for m in reports.values())},CRITERIA['finiteNonclippingMatrix'])
    for name,group,field in [('noLimiter','renderer','limited'),('noMissingPcmHistory','renderer','missingHistory'),
                             ('noCursorResets','renderer','cursorResets'),('noRejectedControls','renderer','rejectedControls'),
                             ('noAffectedHistoryFrames','history','affectedFrames')]:
        counters={key:file_reports.get(key,{}).get('diagnostics',{}).get(group,{}).get(field) for key in processed}
        known=all(value is not None for value in counters.values())
        gate(name,all(value==0 for value in counters.values()) if known else None,counters,CRITERIA['rendererDiagnostics'])
    available=sum(m.get('loudness',{}).get('available') is True for m in reports.values())
    gate('loudnessMeasurementsAvailable',complete and available==len(expected),{'available':available,'expected':len(expected)},CRITERIA['loudnessAvailability'])
    overlap={key:{role:finite(file_reports.get(key,{}).get('sourceEnergy',{}).get(role,{}).get('overlapEnergyDb'))
                  for role in ['engine','exhaust']} for key in processed}
    values=[value for case in overlap.values() for value in case.values()]
    known=all(value is not None for value in values)
    gate('sourceOverlapEnergy',min(values)>=-3 if known else None,
         {'minimumDb':min(values) if known else None,'minimumAllowedDb':-3,'caseRoleDb':overlap},CRITERIA['sourceOverlapEnergy'],review=True)
    body=None
    if all(key in reports for key in ['dry','close']):
        a=sum(reports['dry']['bandPowerFractions'][band] for band in ['20-150Hz','150-500Hz'])
        b=sum(reports['close']['bandPowerFractions'][band] for band in ['20-150Hz','150-500Hz'])
        body=10*math.log10(b/a) if a>0 and b>0 else None
    gate('closeBodyShare',body>=-6 if body is not None else None,{'closeVsDryShareDb':body,'minimumAllowedDb':-6},CRITERIA['closeBodyShare'],review=True)
    if gates['closeBodyShare']['status']!='pass':
        gates['closeBodyShare']['requiredReview']='Evaluate matched-state retarded engine/exhaust interference; do not infer an EQ defect or compensate from this ratio alone.'
    recession=reports.get('flyby',{}).get('nearFarComparison') or {}
    delta=recession.get('farMinusNearRmsDb')
    high_delta=recession.get('farMinusNearWelchBandRmsDb',{}).get('2000-6000Hz')
    gate('nearFarRmsEvolution',delta<0 if delta is not None else None,{'nearMinusFarRmsDb':-delta if delta is not None else None},CRITERIA['recession'],review=True)
    gate('farAbsolute2to6kEnergyLower',high_delta<0 if high_delta is not None else None,{'farMinusNearBandDb':high_delta},CRITERIA['recession'],review=True)
    gains=[file_reports.get(key,{}).get('sourceGain') for key in processed]
    masters=[file_reports.get(key,{}).get('rendererMasterGain') for key in processed]
    wanted=calibration.get('sourceGain')
    gate('sharedSourceGain',all(value==wanted for value in gains) if wanted is not None else None,
         {'declaredGain':finite(wanted),'matchingCases':sum(value==wanted for value in gains),'expected':len(processed)},CRITERIA['controlledComparisons'])
    gate('sharedRendererMaster',all(value==masters[0] for value in masters) if all(value is not None for value in masters) else None,
         {'master':finite(masters[0]),'caseCount':len(masters)},CRITERIA['controlledComparisons'])
    stationary=[key for key in processed if key!='flyby']
    for field in ['sourceHash','motionHash']:
        hashes=[file_reports.get(key,{}).get(field) for key in stationary]
        gate('stationaryEnvironment'+field[0].upper()+field[1:],len(set(hashes))==1 if all(hashes) else None,
             {'caseCount':len(hashes),'uniqueHashCount':len(set(hashes))},CRITERIA['controlledComparisons'])
    return {'allNumericalCriteriaPass':all(g['passed'] for g in gates.values()),
            'requiresReview':any(not g['passed'] for g in gates.values()),'checks':gates,
            'humanAcceptance':'pending; no subjective listening performed'}

all_reports = []
sections = []
for model in ['bati','lectro','prototipo','schafter3']:
    entry = next((v for v in render.get('vehicles',[]) if v.get('model')==model),{})
    directory = out/model
    reports, audio, panels = {}, {}, []
    for key,label in CASES:
        file=directory/(key+'.wav')
        if not file.exists():
            continue
        fs,x=read_wave(file);audio[key]=(fs,x)
        report=entry.get('files',{}).get(key,{}) or {}
        measured=metrics(x,fs);measured['sha256']=hashlib.sha256(file.read_bytes()).hexdigest()
        near=near_time(report)
        measured['loudness']=loudness(file,near,len(x)/fs)
        measured['loudest400ms']=loudest_window(x,fs,.4)
        measured['loudest3s']=loudest_window(x,fs,3)
        measured['authoredNearWindow']=window_metrics(x,fs,near-.25,near+.25) if near is not None else None
        measured['farFinal1s']=window_metrics(x,fs,max(0,len(x)/fs-1),len(x)/fs)
        measured['nearFarComparison']=near_far_comparison(measured['authoredNearWindow'],measured['farFinal1s'])
        measured['evolution50ms']=time_evolution(x,fs)
        near_frames=[r['rmsDbfs'] for r in measured['evolution50ms']['frames'] if near is not None and abs(r['centreSeconds']-near)<=.25 and r['rmsDbfs'] is not None]
        measured['maximumNear50msRmsDbfs']=max(near_frames) if near_frames else None
        renderer=report.get('diagnostics',{}).get('renderer',{})
        history=report.get('diagnostics',{}).get('history',{})
        measured['numericalChecks']={'finitePcm':True,'noFullScaleSamples':measured['fullScaleSamples']==0,
            'noRendererLimiting':renderer.get('limited')==0 if 'limited' in renderer else None,
            'noMissingRendererHistory':renderer.get('missingHistory')==0 if 'missingHistory' in renderer else None,
            'noAffectedHistoryFrames':history.get('affectedFrames')==0 if 'affectedFrames' in history else None}
        measured['renderEvidence']=numeric_tree(report)
        reports[key]=measured;panels.append((key,label,fs,x))
    raw=[]
    for role in ['engine','exhaust']:
        for state in ['idle','accel','decel']:
            file=directory/'source'/(role+'_'+state+'.wav')
            if not file.exists():
                continue
            fs,x=read_wave(file)
            item={'role':role,'state':state,**metrics(x,fs),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
                  'loudness':loudness(file)}
            raw.append(item)
    if panels:
        plt.style.use('dark_background')
        fig, axes=plt.subplots(len(panels),2,figsize=(15,2.8*len(panels)),squeeze=False,constrained_layout=True)
        for i,(key,label,fs,x) in enumerate(panels):
            step=max(1,len(x)//12000);t=np.arange(len(x))[::step]/fs
            for channel in range(x.shape[1]):
                axes[i,0].plot(t,x[::step,channel],linewidth=.45,alpha=.8)
            axes[i,0].set(title=label+' · fixed amplitude scale',ylim=(-1,1),ylabel='Digital amplitude')
            # Average channel spectral energy, not stereo downmix: a diffuse
            # antiphase field must not disappear from its measurement/plot.
            spectra=[]
            for channel in range(x.shape[1]):
                f,t,z=signal.stft(x[:,channel],fs=fs,nperseg=min(4096,len(x)),noverlap=min(3584,len(x)-1),boundary=None)
                spectra.append(np.abs(z)**2)
            magnitude=np.sqrt(np.mean(spectra,axis=0))
            im=axes[i,1].pcolormesh(t,f,20*np.log10(np.maximum(magnitude,1e-12)),cmap='magma',vmin=-105,vmax=-5,shading='auto')
            axes[i,1].set(yscale='log',ylim=(40,min(10000,fs/2)),ylabel='Hz',title=key+' · common -105..-5 dBFS scale')
            axes[i,0].set_xlim(0,len(x)/fs);axes[i,1].set_xlim(0,len(x)/fs)
        axes[-1,0].set_xlabel('Seconds');axes[-1,1].set_xlabel('Seconds')
        fig.suptitle(NAMES[model]+' · real stock-source reconstruction; no file normalization')
        fig.colorbar(im,ax=list(axes[:,1]),label='Channel-energy STFT magnitude dBFS')
        fig.savefig(directory/'comparison.png',dpi=110);plt.close(fig)
    environments={}
    if all(k in audio for k in ['tunnel-early','tunnel-before','tunnel']):
        fs,early=audio['tunnel-early'];before_fs,before=audio['tunnel-before'];after_fs,after=audio['tunnel']
        if fs==before_fs==after_fs:
            duration=len(early)/fs
            windows=[(0,duration),(0,min(4,duration)),(max(0,duration-2),duration)]
            stop=finite(entry.get('files',{}).get('tunnel',{}).get('sourceStopsAt'))
            if stop is not None and stop+.25<duration:
                windows.append((stop+.25,duration))
            environments={'previousLateDifference':difference(early,before,fs,windows),
                          'sourceEnergyLateDifference':difference(early,after,fs,windows)}
            old=environments['previousLateDifference'].get('windows',[])
            new=environments['sourceEnergyLateDifference'].get('windows',[])
            environments['newVsPreviousLateRmsDb']=[{
                'startSeconds':a['startSeconds'],'endSeconds':a['endSeconds'],
                'newVsPreviousLateRmsDb':db(b['differenceRms']/a['differenceRms']) if a['differenceRms'] and b['differenceRms'] else None}
                for a,b in zip(old,new)]
            controls=[entry.get('files',{}).get(k,{}) for k in ['tunnel-early','tunnel-before','tunnel']]
            environments['identicalSourceHash']=len({r.get('sourceHash') for r in controls if r.get('sourceHash')})==1 and all(r.get('sourceHash') for r in controls)
            environments['identicalMotionHash']=len({r.get('motionHash') for r in controls if r.get('motionHash')})==1 and all(r.get('motionHash') for r in controls)
    comparison={}
    matched_close={}
    if 'dry' in reports and 'close' in reports:
        for band in reports['dry']['bandPowerFractions']:
            a,b=reports['dry']['bandPowerFractions'][band],reports['close']['bandPowerFractions'][band]
            comparison[band]=10*math.log10(b/a) if a>0 and b>0 else None
        fs,dry=audio['dry'];close_fs,close=audio['close']
        if fs==close_fs and dry.shape==close.shape:
            window=reports['close']['loudest400ms']
            a=window_metrics(dry,fs,window['startSeconds'],window['endSeconds'])
            b=window_metrics(close,fs,window['startSeconds'],window['endSeconds'])
            matched_close={'sameTimeWindow':True,'dry':a,'close':b,
                           'closeToDryRmsDb':db(b['rms']/a['rms']) if a['rms'] and b['rms'] else None,
                           'interpretation':'Matched operating study interval; includes expected distance, directivity, master, stereo-energy convention and two-emitter interference'}
    transmission=paired_transmission(reports,audio,entry.get('files',{}))
    quality=evaluate_quality(reports,entry,render.get('calibration',{}))
    vehicle={'model':model,'completePreviewCount':len(reports),'expectedPreviewCount':len(CASES),
             'allRequiredPreviewsPresent':len(reports)==len(CASES),'files':reports,'nativeSources':raw,
             'allSixNativeSourcesPresent':len(raw)==6,
             'environmentDifferences':environments,'closeVsDryRelativeBandChangeDb':comparison,
             'matchedClose400ms':matched_close,
             'controlledTransmissionComparison':transmission,
             'qualityGates':quality,
             'spectralComparisonCaveat':'Source/processed band ratios are diagnostic; spatial interference, retarded state and normalization conventions must be accounted for before declaring excess filtering.',
             'kersAudioVerified':False if model=='lectro' else None,'perceptualAcceptance':'human-listening-required'}
    all_reports.append(vehicle)
    def show(v,digits=2):
        return 'unavailable' if v is None else f'{v:.{digits}f}'
    rows=''.join('<tr><td>'+html.escape(label)+'</td><td>'+show(reports[key]['rmsDbfs'])+'</td><td>'+show(reports[key]['peakDbfs'])+'</td><td>'+show(reports[key]['crestDb'])+'</td><td>'+show(reports[key]['loudness'].get('integratedLufs'))+'</td><td>'+show(reports[key]['loudness'].get('maximumMomentary400msLufs'))+'</td><td>'+show(reports[key]['loudness'].get('maximumShortTerm3sLufs'))+'</td></tr>' for key,label in CASES if key in reports)
    players=''.join(f'<article><h3>{html.escape(label)}</h3><audio controls preload="none" src="{model}/{key}.wav" data-group="{model}"></audio><a href="{model}/{key}.wav">WAV</a></article>' for key,label in CASES if key in reports)
    raw_players=''.join(f'<article><h4>{r["role"]} {r["state"]} · {r["sampleRate"]} Hz · {r["channels"]} ch</h4><audio controls preload="none" src="{model}/source/{r["role"]}_{r["state"]}.wav"></audio></article>' for r in raw)
    provenance=entry.get('provenance',{}) or {}
    if isinstance(provenance,dict):
        bank=provenance.get('container') or provenance.get('bank') or provenance.get('awc') or provenance.get('entry') or 'See source provenance in render report'
        if provenance.get('archive'):
            bank=str(bank)+' · archive '+str(provenance['archive'])
    else:
        bank='See source provenance in render report'
    settings=entry.get('files',{}).get('close',{})
    source_gain=finite(settings.get('sourceGain'))
    share=finite(settings.get('pressureShares',{}).get('engine'))
    stem_gain=source_gain*share if source_gain is not None and share is not None else None
    master=finite(settings.get('rendererMasterGain'))
    checks=[check for m in reports.values() for check in m['numericalChecks'].values() if check is not None]
    gate_rows=''.join('<tr><td>'+html.escape(name)+'</td><td>'+gate['status'].upper()+'</td></tr>' for name,gate in quality['checks'].items())
    sections.append(f'<section id="{model}"><h2>{html.escape(NAMES[model])} <code>{model}</code></h2><p>{html.escape(str(bank))}</p>'+
        ('<p class="limit">Combustion engine/exhaust sources are decoded. A separate KERS audio layer is not verified; no invented boost sound is present.</p>' if model=='lectro' else '')+
        f'<p>{len(reports)}/{len(CASES)} previews available. Original decoded sources remain private. Operating-state playback is an authored approximation, not recovered native granular/RPM/torque behavior.</p><div class="players">{players}</div>'+
        f'<p>Common source factor G={show(source_gain,6)}; each emitter receives 0.5 × G={show(stem_gain,6)} of decoded amplitude. Renderer master={show(master,2)}; no native-host gain is used. Raw reference files are untouched, while dry and processed previews use this common calibration.</p><p>Numerical signal checks: {sum(checks)}/{len(checks)} reported finite/full-scale/history/limiter checks pass. These checks and the measured levels below do not establish subjective strength or recognition; no universal perceptual LUFS target is applied.</p>'+
        '<details open><summary>Automatic criteria: '+('PASS numerically; human acceptance pending' if quality['allNumericalCriteriaPass'] else 'REVIEW REQUIRED; human acceptance pending')+'</summary><table><thead><tr><th>Criterion</th><th>Evaluation</th></tr></thead><tbody>'+gate_rows+'</tbody></table></details>'+
        '<table><thead><tr><th>Preview</th><th>RMS dBFS</th><th>Peak dBFS</th><th>Crest dB</th><th>Whole LUFS</th><th>Max 400 ms LUFS</th><th>Max 3 s LUFS</th></tr></thead><tbody>'+rows+'</tbody></table>'+
        (f'<p>Open flyby, authored near-pass ±250 ms: {show(reports["flyby"]["authoredNearWindow"]["rmsDbfs"])} dBFS RMS; strongest local 50 ms: {show(reports["flyby"]["maximumNear50msRmsDbfs"])} dBFS RMS; final second: {show(reports["flyby"]["farFinal1s"]["rmsDbfs"])} dBFS RMS. Near 400 ms: {show((reports["flyby"]["loudness"].get("nearMomentary400ms") or {}).get("lufs"))} LUFS. Far minus near RMS={show(reports["flyby"]["nearFarComparison"]["farMinusNearRmsDb"])} dB; far versus near high/low band ratio={show(reports["flyby"]["nearFarComparison"]["farVsNearHighToLowBandRatioDb"])} dB (2–20 kHz /20–500 Hz). Recession measurements include source lift, changing directivity, Doppler and propagation.</p>' if reports.get('flyby',{}).get('authoredNearWindow') else '')+
        ('<p>New versus previous isolated late contribution, whole event: '+show(environments['newVsPreviousLateRmsDb'][0]['newVsPreviousLateRmsDb'])+' dB RMS. This is a source-send change, without changing final output gain. See the report for tail and early-relative ratios.</p>' if environments.get('newVsPreviousLateRmsDb') else '')+
        ('<p>Controlled obstruction: wall minus open '+show(transmission['wholeRmsDifferenceDb'])+' dB RMS / '+show(transmission['wholeIntegratedLufsDifference'])+' LU integrated. The finite wall and material are authored assumptions, not GTA world evidence. The report includes matched-window attenuation in five frequency bands.</p>' if transmission.get('comparable') else '')+
        f'<details><summary>Matched waveform and spectrogram scales</summary><img loading="lazy" src="{model}/comparison.png" alt="{html.escape(NAMES[model])} waveform and spectrum"><p>All waveforms ±1; all spectra -105..-5 dBFS. Channel spectral energy is averaged without antiphase cancellation. No SPL calibration is implied.</p></details>'+
        f'<details><summary>Six original decoded source references</summary><div class="players">{raw_players}</div></details></section>')

result={'schemaVersion':1,'milestone':'STOCK-SOURCE-01','gameLaunched':False,'audioEndpointOpened':False,
        'subjectiveListening':'not performed','normalised':False,'physicalSpl':'not calibrated or inferred',
        'calibrationNumeric':numeric_tree(render.get('calibration',{})),
        'allFourVehicleMatricesPresent':all(v['allRequiredPreviewsPresent'] for v in all_reports),
        'allTwentyFourNativeSourcesPresent':all(v['allSixNativeSourcesPresent'] for v in all_reports),
        'perceptualAcceptance':'human-listening-required; numerical signal checks do not establish convincing force or recognition',
        'criteria':CRITERIA,
        'vehicles':all_reports,'method':'Decoded PCM measurements; per-channel energy averages for stereo; FFmpeg EBU R128; 50 ms/RMS and loudest400ms/3s windows; fixed plot scales. No universal LUFS target or perceptual approval.'}
(out/'quality-measurements.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
if args.evidence:
    args.evidence.parent.mkdir(parents=True,exist_ok=True)
    # Detailed 50 ms trajectories remain private with the audition; the tracked
    # evidence is a compact scalar/window summary, without recordings or paths.
    summary=json.loads(json.dumps(result))
    for key in ['preliminary','scoutingMixes','finalDistinctMixes']:
        summary['calibrationNumeric'].pop(key,None)
    for vehicle in summary['vehicles']:
        for measured in vehicle['files'].values():
            measured.pop('evolution50ms',None)
            measured.pop('renderEvidence',None)
    args.evidence.write_text(json.dumps(summary,indent=2),encoding='utf-8')
style='body{max-width:1200px;margin:auto;padding:28px;background:#0d151e;color:#e5eef6;font:16px system-ui}p{line-height:1.5}section{border-top:1px solid #456;padding-top:20px;margin-top:30px}a{color:#7ddbe5}.players{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}article{padding:12px;background:#172533}audio{width:100%}table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14px}th,td{padding:8px;border:1px solid #456;text-align:left}img{max-width:100%}details{margin:16px 0}.limit{color:#ffc68f}.controls{position:sticky;top:0;padding:12px;background:#172533;z-index:1}button{margin-left:14px}code{font-size:14px}'
page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RichAudio · Four genuine vehicle sources</title><style>'+style+'</style><h1>RichAudio · four genuine stock sources</h1><p>Private original GTA audio through the existing RichAudio causal engine. Source recordings and operating controls are distinct from verified in-game playback. Human listening remains pending. Use one common comfortable playback setting; files have no hidden normalization.</p><nav>'+''.join(f'<a href="#{m}">{html.escape(NAMES[m])}</a> · ' for m in NAMES)+'</nav><div class="controls"><label>Shared player volume <input id="volume" type="range" min="0" max="1" step="0.01" value="1"><output id="level">100%</output></label><button id="stop">Pause all</button><label><input type="checkbox" id="carry">Carry playback position when switching previews</label></div><p>Only one player can run at a time. No automatic playback, compression, EQ or independent loudness matching is applied by this page. Carry-position is optional for source-matched environmental A/B; leave it off for raw references.</p><p><a href="quality-measurements.json">All loudness, band and near/far measurements</a> · <a href="render-report.json">Calibration, provenance and render evidence</a></p>'+''.join(sections)+'<p>Microphone source levels and decoded recordings do not establish physical SPL or chest impact. The numerical gates are evidence for the signal chain, not subjective approval or unrestricted multi-vehicle/live performance.</p><script>const players=[...document.querySelectorAll("audio")],volume=document.querySelector("#volume");let previous=null;volume.oninput=()=>{for(const a of players)a.volume=+volume.value;document.querySelector("#level").textContent=Math.round(volume.value*100)+"%"};for(const a of players){a.volume=1;a.addEventListener("play",()=>{if(previous&&previous!==a&&document.querySelector("#carry").checked&&previous.dataset.group&&previous.dataset.group===a.dataset.group&&Number.isFinite(a.duration)&&previous.currentTime<a.duration)a.currentTime=previous.currentTime;for(const b of players)if(b!==a)b.pause();previous=a})}document.querySelector("#stop").onclick=()=>players.forEach(a=>a.pause());</script></html>'
policy=render.get('calibration',{}) or {}
policy_html='<aside><h2>Common source calibration and tested mix scope</h2><p>'+html.escape(str(policy.get('method','See render report for source-calibration policy')))+'.</p><p>'+html.escape(str(policy.get('scope','No concurrency scope supplied')))+'.</p><p class="limit">'+html.escape(str(policy.get('outsidePolicy','Unmeasured concurrency and geometry are not validated')))+'.</p></aside>'
criteria_html='<aside><h2>Automatic numerical criteria</h2><p>Require all nine previews to be finite and nonclipping, all nine loudness measurements available, and zero processed limiter/history/cursor faults. Compare common gain and stationary source/motion controls. Review if source overlap energy is below -3 dB, or close 20-500 Hz relative body share is below -6 dB versus dry. These are declared diagnostic review thresholds, not SPL or perceptual loudness targets. A body-share flag requires retarded two-emitter interference review before compensation. Near-pass RMS must exceed the final second, with lower absolute final-second 2-6 kHz energy. Passing these criteria leaves human recognition, strength and immersion unapproved.</p></aside>'
page=page.replace('<nav>',policy_html+criteria_html+'<nav>',1)
(out/'listen.html').write_text(page,encoding='utf-8')
print(json.dumps({'vehicles':len(all_reports),'complete':result['allFourVehicleMatricesPresent'],
                  'previews':sum(v['completePreviewCount'] for v in all_reports),
                  'nonfiniteSamples':sum(r['nonfiniteSamples'] for v in all_reports for r in v['files'].values()),
                  'fullScaleSamples':sum(r['fullScaleSamples'] for v in all_reports for r in v['files'].values())}))
