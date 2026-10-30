"""Measure the compact private STOCK-SOURCE-02 comparison; never play audio."""
import argparse
import hashlib
import html
import json
import math
import re
import subprocess
import sys
from pathlib import Path

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('output',type=Path)
p.add_argument('--dependencies',type=Path)
p.add_argument('--evidence',type=Path)
p.add_argument('--old-root',type=Path,default=Path(__file__).resolve().parents[1].parent/'RichAudio-StockSource01')
a=p.parse_args()
if a.dependencies:
    sys.path.insert(0,str(a.dependencies))
import numpy as np
from scipy import signal
from scipy.io import wavfile
import imageio_ffmpeg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out=a.output.resolve()
if '.local' not in out.parts:
    raise ValueError('Private .local audition required')
render=json.loads((out/'render-report.json').read_text(encoding='utf-8'))
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
BANDS=[(20,150),(150,500),(500,2000),(2000,6000),(6000,20000)]
CASE_GROUPS=[('Source clock: Schafter',[
    ('schafter3/rejected-source.wav','Rejected reconstruction'),
    ('schafter3/corrected-source.wav','Corrected source clock')],'source-comparison.png',True),
    ('Authored Schafter close view',[
    ('schafter3/corrected-close-engine.wav','Engine alone'),
    ('schafter3/corrected-close-exhaust.wav','Exhaust alone'),
    ('schafter3/corrected-close-combined.wav','Combined close view')],'close-stems.png',False),
    ('Same Schafter flyby trajectory',[
    ('schafter3/rejected-flyby.wav','Rejected flyby'),
    ('schafter3/flyby-clock-only.wav','Source-clock correction only'),
    ('schafter3/flyby-final.wav','Corrected clock + authored balance/distance')],'flyby-comparison.png',False),
    ('Second source check: Bati',[
    ('bati/rejected-source.wav','Rejected Bati reconstruction'),
    ('bati/corrected-source.wav','Corrected Bati source clock')],'bati-comparison.png',True)]

def db(x):
    return 20*math.log10(x) if x>0 else None

def finite(x):
    try:
        x=float(x)
        return x if math.isfinite(x) else None
    except (ValueError,TypeError):
        return None

def read(file):
    rate,x=wavfile.read(file)
    if x.ndim==1:
        x=x[:,None]
    x=x.astype(float)/(2**(x.dtype.itemsize*8-1)) if x.dtype.kind=='i' else x.astype(float)
    assert len(x) and x.shape[1] in [1,2] and np.isfinite(x).all()
    return int(rate),x

def level(x,rate):
    rms=float(np.sqrt(np.mean(x*x)));peak=float(np.max(np.abs(x)))
    f,power=signal.welch(x,fs=rate,nperseg=min(8192,len(x)),axis=0)
    power=power.mean(axis=1);width=float(f[1]-f[0])
    bp={f'{lo}-{hi}Hz':float(power[(f>=lo)&(f<min(hi,rate/2))].sum()*width) for lo,hi in BANDS}
    total=sum(bp.values())
    return {'rmsDbfs':db(rms),'peakDbfs':db(peak),'rms':rms,'peak':peak,
        'crestDb':db(peak/rms) if rms else None,'bandPower':bp,
        'bandFractions':{k:v/max(total,1e-30) for k,v in bp.items()},
        'fullScaleSamples':int(np.count_nonzero(np.abs(x)>=1)),'nonfiniteSamples':0}

def window(x,rate,start,end):
    lo,hi=max(0,round(start*rate)),min(len(x),round(end*rate))
    return {'startSeconds':lo/rate,'endSeconds':hi/rate,**level(x[lo:hi],rate)}

def loudest(x,rate,seconds):
    size=min(len(x),round(seconds*rate));c=np.r_[0,np.cumsum(np.mean(x*x,axis=1))]
    starts=np.arange(0,len(x)-size+1,max(1,round(rate*.01)))
    first=int(starts[np.argmax(c[starts+size]-c[starts])])
    return window(x,rate,first/rate,(first+size)/rate)

def near50(x,rate,near):
    if near is None:
        return None
    first=max(0,round((near-.25)*rate));last=min(len(x),round((near+.25)*rate))
    found=loudest(x[first:last],rate,.05)
    found['startSeconds']+=first/rate;found['endSeconds']+=first/rate
    return found

def verify_rejected_inventory(inventory_file,old_root):
    entries=json.loads(inventory_file.read_text(encoding='utf-8'))
    base=(old_root/'.local/stock-source-01/audition-02').resolve()
    changed=[]
    for item in entries:
        file=(base/item['file']).resolve()
        assert file.is_relative_to(base),'bounded rejected inventory'
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest().lower()!=item['sha256'].lower():
            changed.append(item['file'])
    assert not changed,'rejected audition inventory changed'
    return {'filesChecked':len(entries),'allSha256Unchanged':not changed,
        'inventorySha256':hashlib.sha256(inventory_file.read_bytes()).hexdigest()}

def loudness(file,near=None):
    done=subprocess.run([ffmpeg,'-nostdin','-hide_banner','-nostats','-i',str(file),'-vn',
        '-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,timeout=90,check=True)
    summary=done.stderr.rsplit('Summary:',1)[-1]
    def value(pattern):
        m=re.search(pattern,summary)
        return finite(m.group(1)) if m else None
    frames=[]
    for line in done.stderr.splitlines():
        m=re.search(r'\bt:\s*([\d.]+).*?\bM:\s*([-+\w.]+).*?\bS:\s*([-+\w.]+)',line)
        if m:
            t,momentary,short=map(finite,m.groups())
            frames.append((t,momentary if momentary is not None and momentary>-120 else None,
                             short if short is not None and short>-120 else None))
    momentary=[x[1] for x in frames if x[1] is not None];short=[x[2] for x in frames if x[2] is not None]
    near_frames=[x for x in frames if x[1] is not None]
    chosen=min(near_frames,key=lambda row:abs(row[0]-(near+.2))) if near is not None and near_frames else None
    return {'method':'FFmpeg EBU R128; measurement only','integratedLufs':value(r'I:\s*([-+\w.]+) LUFS'),
        'truePeakDbfs':value(r'Peak:\s*([-+\w.]+) dBFS'),
        'maxMomentary400msLufs':max(momentary) if momentary else None,
        'maxShortTerm3sLufs':max(short) if short else None,
        'nearMomentary400msLufs':chosen[1] if chosen else None,
        'nearMomentaryEndSeconds':chosen[0] if chosen else None}

audio={};measurements={}
for _,cases,_,_ in CASE_GROUPS:
    for name,label in cases:
        file=out/name;rate,x=read(file);audio[name]=(rate,x)
        near=5.3 if 'flyby' in name else None
        step=np.abs(np.diff(x,axis=0))
        measurements[name]={'label':label,'sampleRate':rate,'channels':x.shape[1],
            'durationSeconds':len(x)/rate,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),**level(x,rate),
            'loudness':loudness(file,near),'loudest50msRms':loudest(x,rate,.05),
            'nearLoudest50msRms':near50(x,rate,near),
            'loudest400msRms':loudest(x,rate,.4),
            'near500ms':window(x,rate,near-.25,near+.25) if near is not None else None,
            'farFinal1s':window(x,rate,len(x)/rate-1,len(x)/rate) if near is not None else None,
            'transientSampleData':{'maximumAdjacentStep':float(step.max()),'adjacentStepP99':float(np.quantile(step,.99)),
                'adjacentStepP999':float(np.quantile(step,.999)),
                'adjacentStepRms':float(np.sqrt(np.mean(step*step))),
                'interpretation':'Sample differences include genuine harmonics/transients and do not by themselves prove clicks or fidelity'}}

plt.style.use('dark_background')
for title,cases,figure,detail in CASE_GROUPS:
    columns=3 if detail else 2
    fig,axes=plt.subplots(len(cases),columns,figsize=(17 if detail else 14,2.8*len(cases)),squeeze=False,constrained_layout=True)
    for row,(name,label) in enumerate(cases):
        rate,x=audio[name];hop=max(1,len(x)//12000);t=np.arange(len(x))/rate
        for c in range(x.shape[1]):
            axes[row,0].plot(t[::hop],x[::hop,c],linewidth=.4,alpha=.8)
        axes[row,0].set(title=label,ylim=(-1,1),xlim=(0,t[-1]),ylabel='Digital amplitude')
        energies=[]
        for c in range(x.shape[1]):
            f,tt,z=signal.stft(x[:,c],fs=rate,nperseg=4096,noverlap=3584,boundary=None)
            energies.append(np.abs(z)**2)
        magnitude=np.sqrt(np.mean(energies,axis=0))
        image=axes[row,1].pcolormesh(tt,f,20*np.log10(np.maximum(magnitude,1e-12)),cmap='magma',vmin=-105,vmax=-5,shading='auto')
        axes[row,1].set(yscale='log',ylim=(40,10000),xlim=(0,t[-1]),title='Matched -105..-5 dBFS scale',ylabel='Hz')
        if detail:
            lo,hi=round(4.9*rate),round(4.94*rate)
            for c in range(x.shape[1]):
                axes[row,2].plot(t[lo:hi],x[lo:hi,c],linewidth=.6,alpha=.7)
            axes[row,2].set(title='Same authored time: 40 ms sample detail',ylim=(-1,1),xlim=(4.9,4.94))
    fig.suptitle(title+' - unchanged file gain; no normalization')
    fig.colorbar(image,ax=list(axes[:,1]),label='Channel-energy STFT magnitude dBFS')
    for ax in axes[-1]:
        ax.set_xlabel('Seconds')
    fig.savefig(out/figure,dpi=110);plt.close(fig)

def comparable(a,b):
    ra,x=audio[a];rb,y=audio[b]
    return ra==rb and x.shape==y.shape

def linear_sum_error():
    names=['corrected-close-engine','corrected-close-exhaust','corrected-close-combined']
    arrays=[audio['schafter3/'+name+'.wav'][1] for name in names]
    return float(np.max(np.abs(arrays[0]+arrays[1]-arrays[2])))

sum_error=linear_sum_error()
rejected_inventory=verify_rejected_inventory(out.parent/'rejected-inventory.json',a.old_root)
close_window={}
for role in ['engine','exhaust','combined']:
    rate,x=audio['schafter3/corrected-close-'+role+'.wav']
    close_window[role]={'windowSeconds':[4,5.1],'selection':'int(seconds*sampleRate), matching supplied review',
        **level(x[int(4*rate):int(5.1*rate)],rate)}
close_window['exhaustMinusEngineRmsDb']=close_window['exhaust']['rmsDbfs']-close_window['engine']['rmsDbfs']
controls={f['name']:f for f in render['files'] if f['model']=='schafter3'}
timing_reports=[f['timings'] for f in render['files']]
timing_reports += [s['timings'] for view in render['viewpoints'] for s in view['stems'].values()]
diagnostics=[f['diagnostics'] for f in render['files'] if f['diagnostics']]
diagnostics += [s['diagnostics'] for view in render['viewpoints'] for s in view['stems'].values()]
checks={'allTenMainFilesFiniteUnclipped':len(measurements)==10 and all(m['nonfiniteSamples']==0 and m['fullScaleSamples']==0 for m in measurements.values()),
    'rejectedCopiesUntouched':all(c['byteIdentical'] and measurements[c['file']]['sha256']==c['sha256'] for c in render['baselineCopies']),
    'nativeReferencesUntouched':all(hashlib.sha256((out/r['file']).read_bytes()).hexdigest()==r['sha256'] for r in render['references']),
    'sourceBeforeAfterSameLength':all(comparable(model+'/rejected-source.wav',model+'/corrected-source.wav') for model in ['schafter3','bati']),
    'flybysSameDurationAndSampleRate':all(comparable('schafter3/rejected-flyby.wav','schafter3/'+name+'.wav') for name in ['flyby-clock-only','flyby-final']),
    'newFlybysSameMotion':controls['flyby-clock-only']['motionHash']==controls['flyby-final']['motionHash'],
    'closeIsolatedSumMatchesCombined':sum_error<1e-7,
    'noLimiterHistoryCursorFaults':all(all(d['renderer'][key]==0 for key in ['limited','missingHistory','cursorResets','rejectedControls']) and d['history']['affectedFrames']==0 for d in diagnostics),
    'noSourceBoundsViolations':all(voice['sourceBoundViolations']==0 for f in render['files'] for voices in f['voices'].values() for voice in voices.values()),
    'commonGainUnchanged':all(f['sourceGain']==render['sourceGain'] for f in render['files'])}
summary={'schemaVersion':1,'milestone':'STOCK-SOURCE-02','files':measurements,'checks':checks,
    'allNumericalChecksPass':all(checks.values()),'closeIsolatedSumMaximumError':sum_error,
    'closeOperatingWindow4to5_1':close_window,'rejectedInventory':rejected_inventory,
    'sourceGain':render['sourceGain'],'rendererMasterGain':render['rendererMasterGain'],'profiles':render['profiles'],
    'viewpoints':[{'view':v['view'],'profile':v['profile'],'listenerPosition':v['listenerPosition'],
                   'windowSeconds':v['windowSeconds'],'exhaustMinusEngineDb':v['exhaustMinusEngineDb']} for v in render['viewpoints']],
    'timing':{'blockFrames':512,'sampleRate':48000,'deadlineMs':512/48000*1000,
        'completeBlocks':sum(t['complete']['count'] for t in timing_reports),
        'maximumCompleteBlockMs':max(t['complete']['max'] for t in timing_reports),
        'completeDeadlineMisses':sum(t['complete']['misses'] for t in timing_reports)},
    'distanceFilesPresent':all((out.parent/'distance'/name).is_file() for name in ['fixed-state-distance-default.wav','fixed-state-distance-authored.wav','fixed-state-distance.png']),
    'gameLaunched':False,'audioEndpointOpened':False,'subjectiveListening':'not performed','normalised':False,
    'perceptualAcceptance':'Pending human listening; numerical safety/energy checks do not establish source fidelity or recognition.',
    'measurementLimits':['50 ms values are RMS, not invented 50 ms LUFS; EBU momentary LUFS uses400 ms.',
      'Band powers average channel energy without stereo cancellation. No SPL inferred.',
      'Source clock A/B preserves baseline shares/directionality/air; final flyby adds authored balance and optional distance assumptions.',
      'Sample-step data and spectrograms are diagnostic; controlled tone/harmonic/real-source evidence remains separate.']}
(out/'measurements.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
if a.evidence:
    a.evidence.parent.mkdir(parents=True,exist_ok=True)
    a.evidence.write_text(json.dumps(summary,indent=2),encoding='utf-8')

def show(x):
    return 'unavailable' if x is None else f'{x:.2f}'

def player(src,label,group=None):
    attribute=f' data-group="{group}"' if group else ''
    return '<article><h3>'+html.escape(label)+'</h3><audio controls preload="none"'+attribute+' src="'+html.escape(src)+'"></audio><a href="'+html.escape(src)+'">WAV</a></article>'

sections=[]
for index,(title,cases,figure,detail) in enumerate(CASE_GROUPS):
    players=''.join(player(name,label,str(index)) for name,label in cases)
    rows=''.join('<tr><td>'+html.escape(label)+'</td><td>'+show(measurements[name]['loudness']['integratedLufs'])+'</td><td>'+show(measurements[name]['loudness']['maxMomentary400msLufs'])+'</td><td>'+show(measurements[name]['loudness']['nearMomentary400msLufs'])+'</td><td>'+show(measurements[name]['loudest50msRms']['rmsDbfs'])+'</td><td>'+show(measurements[name]['peakDbfs'])+'</td></tr>' for name,label in cases)
    sections.append('<section><h2>'+title+'</h2><div class="players">'+players+'</div><table><tr><th>File</th><th>Whole LUFS</th><th>Max400 ms LUFS</th><th>Near400 ms LUFS</th><th>Max50 ms RMS dBFS</th><th>Peak dBFS</th></tr>'+rows+'</table><details><summary>Matched waveform, spectrum'+(' and sample detail' if detail else '')+'</summary><img loading="lazy" src="'+figure+'" alt="'+title+'"></details></section>')
raw=''.join(player(r['file'],r['role']+' '+r['state']+' ('+str(r['sampleRate'])+' Hz)') for r in render['references'])
distance=''
if summary['distanceFilesPresent']:
    distance='<section><h2>Held source: distance comparison</h2><p>Same held source at2,10,25,50,100,200 m;3 s each with0.25 s gaps. Listening files retain distance attenuation and common gain. The plot compensates spreading only for diagnosis; its compensated amplitudes are absent from the WAVs.</p><div class="players">'+player('../distance/fixed-state-distance-default.wav','Existing distance profile','distance')+player('../distance/fixed-state-distance-authored.wav','Optional authored detail loss','distance')+'</div><details><summary>Distance diagnostic plot</summary><img src="../distance/fixed-state-distance.png" loading="lazy" alt="Controlled fixed-state distance spectrum and waveform"></details></section>'
gates=''.join('<li>'+html.escape(name)+': '+('PASS' if passed else 'REVIEW')+'</li>' for name,passed in checks.items())
style='body{max-width:1150px;margin:auto;padding:28px;background:#101822;color:#e6edf4;font:16px system-ui}p{line-height:1.5}a{color:#7cdeeb}.players{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}article,.controls{padding:14px;background:#1b2a3a}audio,img{width:100%}table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px}td,th{border:1px solid #4b5c70;padding:7px;text-align:left}section{border-top:1px solid #4b5c70;margin-top:26px;padding-top:14px}details{margin:16px 0}.controls{position:sticky;top:0;z-index:1}.limit{color:#ffcd99}button{margin:0 18px}'
js='const players=[...document.querySelectorAll("audio")],volume=document.querySelector("#volume");let previous=null;volume.oninput=()=>{for(const a of players)a.volume=+volume.value;document.querySelector("#level").textContent=Math.round(volume.value*100)+"%"};for(const a of players){a.volume=1;a.addEventListener("play",()=>{if(previous&&previous!==a&&document.querySelector("#carry").checked&&previous.dataset.group&&previous.dataset.group===a.dataset.group&&Number.isFinite(a.duration)&&previous.currentTime<a.duration)a.currentTime=previous.currentTime;for(const b of players)if(b!==a)b.pause();previous=a})}document.querySelector("#stop").onclick=()=>players.forEach(a=>a.pause());'
page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RichAudio - source-clock correction</title><style>'+style+'</style><h1>RichAudio: source-clock correction</h1><p>Rejected originals are preserved byte-for-byte. Start with the source-only comparison, then the flyby with only the source clock corrected. The final flyby adds the disclosed Schafter balance and optional distance presentation. No human listening or perceptual approval is claimed.</p><p>One unchanged source factor G='+show(render['sourceGain'])+'; baseline pressure shares0.5/0.5; authored Schafter shares0.4/0.6, directivity0.1/0.35. Renderer master remains0.7. No native-host gain, limiter, independent normalization or loudness matching. Original reference files retain their native levels. Schafter balance and distance shaping are authored, without recovered native mix or atmospheric calibration.</p><div class="controls"><label>Shared volume <input id="volume" type="range" min="0" max="1" step="0.01" value="1"><output id="level">100%</output></label><button id="stop">Pause all</button><label><input id="carry" type="checkbox">Carry time when switching within a comparison</label></div><p>Only one player runs at a time; playback starts only when you choose it. Loudness uses400 ms/3 s EBU windows;50 ms figures are RMS. Digital levels do not establish physical SPL or chest impact.</p>'+''.join(sections)+distance+'<section><h2>Untouched Schafter native references</h2><details><summary>Six original engine/exhaust files</summary><div class="players">'+raw+'</div></details></section><section><h2>Evidence and limits</h2><p><a href="measurements.json">Loudness, bands and transient sample data</a> / <a href="render-report.json">Source-clock, shared controls, headroom and runtime report</a></p><p class="limit">Numerical checks do not establish convincing recognition or source fidelity. Focused tone/harmonic/real-source validation is separate; the next decision requires human comparison. Arbitrary concurrency, GTA acoustics and live performance remain unverified.</p><details><summary>Numerical signal checks</summary><ul>'+gates+'</ul></details></section><script>'+js+'</script></html>'
(out/'listen.html').write_text(page,encoding='utf-8')
print(json.dumps({'mainWavs':len(measurements),'nativeReferences':len(render['references']),
    'allNumericalChecksPass':summary['allNumericalChecksPass'],'distanceFilesPresent':summary['distanceFilesPresent'],
    'maximumCompleteBlockMs':summary['timing']['maximumCompleteBlockMs'],'completeDeadlineMisses':summary['timing']['completeDeadlineMisses']}))
