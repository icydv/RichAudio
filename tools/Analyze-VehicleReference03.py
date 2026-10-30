"""Measured matched flyby plot; never plays, normalises or modifies audio."""
import argparse, json, sys
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('output',type=Path);p.add_argument('--dependencies',type=Path)
a=p.parse_args()
if a.dependencies: sys.path.insert(0,str(a.dependencies))
import numpy as np
from scipy import signal
from scipy.io import wavfile
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
out=a.output.resolve()
if '.local' not in out.parts: raise ValueError('private existing package required')
data=json.loads((out/'measurements.json').read_text())
windows=[('distant-approach',.9,1.5),('acceleration',2,2.7),('shift-arrival',3.35,3.65),
         ('near-pass',5.45,5.65),('lift-and-braking',6.55,7.05),('recession',8,8.6),('far',9.7,10.2)]
plt.style.use('dark_background')
fig,axes=plt.subplots(4,1,figsize=(12,11),constrained_layout=True)
colours=['#61c9df','#ffa45b']; summary=[]
for i,report in enumerate(data['reports']):
    fs,x=wavfile.read(out/(report['kind']+'.wav'));assert fs==48000 and x.shape==(489600,2)
    assert np.isfinite(x).all() and np.max(abs(x))<1
    mono=x.astype(float).mean(axis=1);rows=report['rows'];times=np.array([r['time'] for r in rows])
    axes[0].plot(times,[r['rpm'] for r in rows],color=colours[i],label=report['kind']+' source RPM')
    f,t,z=signal.stft(mono,fs=fs,nperseg=4096,noverlap=3584,boundary=None)
    im=axes[1+i].pcolormesh(t,f,20*np.log10(np.maximum(abs(z),1e-8)),vmin=-115,vmax=-25,cmap='magma',shading='auto')
    axes[1+i].set(yscale='log',ylim=(60,6000),ylabel='Hz',title=report['kind']+' — identical spectral scale')
    starts=np.arange(0,len(x)-2400,480)
    rms=np.array([np.sqrt(np.mean(x[s:s+2400].astype(float)**2)) for s in starts])
    axes[3].plot((starts+1200)/fs,20*np.log10(np.maximum(rms,1e-12)),color=colours[i],label=report['kind'])
    band=[signal.sosfiltfilt(signal.butter(4,[lo,hi],fs=fs,btype='bandpass',output='sos'),mono) for lo,hi in [(160,500),(500,2000),(2000,6000)]]
    events=[]
    for label,lo,hi in windows:
        sl=slice(round(lo*fs),round(hi*fs));selected=[r for r in rows if lo<=r['time']<hi]
        predicted=[r['receivedFiringHz'] for r in selected if r['receivedFiringHz'] is not None]
        expected=float(np.median(predicted)) if predicted else None
        ff,power=signal.welch(mono[sl],fs=fs,nperseg=min(16384,len(mono[sl])))
        peaks,_=signal.find_peaks(power);peaks=[k for k in peaks if power[k]>max(power)*1e-5]
        nearest=min(peaks,key=lambda k:abs(ff[k]-expected)) if peaks and expected else None
        levels=[float(20*np.log10(max(np.sqrt(np.mean(y[sl]**2)),1e-15))) for y in band]
        events.append({'event':label,'start':lo,'end':hi,
          'sourceRpmMedian':float(np.median([r['rpm'] for r in selected])),
          'speedMedianMps':float(np.median([r['speed'] for r in selected])),
          'receivedFiringHzPredictedMedian':expected,
          'nearestMeasuredSpectralPeakHz':float(ff[nearest]) if nearest is not None else None,
          'spectralResolutionHz':float(ff[1]-ff[0]),
          'stereoRms':float(np.sqrt(np.mean(x[sl].astype(float)**2))),
          'stereoRmsDbfs':float(20*np.log10(max(np.sqrt(np.mean(x[sl].astype(float)**2)),1e-15))),
          'peak':float(np.max(abs(x[sl]))),'upperToMidDb':levels[2]-levels[1],
          'bandRmsDbfs':dict(zip(['160-500','500-2000','2000-6000'],levels))})
    summary.append({'kind':report['kind'],'events':events})
axes[0].set(ylabel='Source RPM',title='Original V12 — same 10.2 s trajectory, 60 m/s at 5.5 s; authored operating controls')
speedax=axes[0].twinx();speedax.plot(times,[r['speed'] for r in rows],color='#78d5a2',linestyle=':',label='shared speed')
speedax.set(ylabel='m/s',ylim=(0,70));axes[0].legend(loc='upper left');speedax.legend(loc='lower right')
axes[3].set(ylabel='50 ms stereo RMS dBFS',xlabel='Receiver timeline (s)',ylim=(-110,-25));axes[3].legend()
for ax in axes:
    ax.set_xlim(0,10.2)
    for time,label in [(3,'shift at source'),(5.5,'origin passes'),(6.2,'lift/braking at source')]:ax.axvline(time,color='white',alpha=.2,linewidth=.8)
fig.colorbar(im,ax=list(axes[1:3]),label='STFT magnitude dBFS; common limits -115 to -25')
fig.savefig(out/'spectrogram.png',dpi=130);plt.close(fig)
result={'method':'Stereo RMS/peak; arithmetic mono downmix for fourth-order zero-phase bandpass and Welch analysis. Nearest peak to predicted firing family is a descriptor, not a pitch/listening score. Windows are on receiver time; source controls arrive after propagation.',
        'subjectiveListening':'not performed','normalised':False,'reports':summary}
(out/'event-measurements.json').write_text(json.dumps(result,indent=2))
print(json.dumps(summary,indent=2))
