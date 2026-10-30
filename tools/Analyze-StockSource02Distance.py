"""Numerical/plot analysis of the existing private held-distance render only."""
import argparse,hashlib,json,struct
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from scipy.signal import welch

def wav(file):
    data=file.read_bytes()
    assert data[:4]==b'RIFF' and data[8:12]==b'WAVE' and data[36:40]==b'data'
    assert struct.unpack_from('<HHI',data,20)==(3,2,48000)
    assert struct.unpack_from('<HH',data,32)==(8,32)
    result=np.frombuffer(data,dtype='<f4',offset=44).reshape(-1,2).astype(np.float64)
    assert np.isfinite(result).all() and np.max(abs(result))<1
    return result,hashlib.sha256(data).hexdigest()

def db(value):return float(10*np.log10(max(value,1e-30)))

def measure(directory):
    report=json.loads((directory/'distance-render.json').read_text('utf8'))
    fs=report['sampleRate']; assert fs==48000
    source_bytes=(directory/'held-source.f32').read_bytes()
    assert hashlib.sha256(source_bytes).hexdigest()==report['source']['sha256']
    source=np.frombuffer(source_bytes,dtype='<f4').astype(np.float64)
    cache={};audio_hashes={};rows=[];spectra={};segments={}
    for name in [report['sequence']['defaultFile'],report['sequence']['authoredFile']]:
        assert Path(name).name==name
        cache[name],audio_hashes[name]=wav(directory/name)
    a,b=report['analysis']['emissionWindowSeconds']; count=round((b-a)*fs)
    source_window=source[round(a*fs):round(a*fs)+count]
    frequencies,source_psd=welch(source_window,fs,nperseg=16384,noverlap=8192,scaling='density')
    masks={'low':(frequencies>=40)&(frequencies<400),'mid':(frequencies>=400)&(frequencies<4000),'high':(frequencies>=4000)&(frequencies<=10000)}
    source_bands={key:float(np.trapezoid(source_psd[mask],frequencies[mask])) for key,mask in masks.items()}
    for original in report['rows']:
        profile=original['profile']; distance=original['distanceMetres']; delay=original['expectedArrivalSeconds']
        assert original['sourceSha256']==report['source']['sha256']
        stereo=cache[original['file']][original['startFrame']:original['startFrame']+original['frames']]
        mono=np.sum(stereo,axis=1)/np.sqrt(2);compensated=mono*distance/report['setup']['rendererMasterGain']
        start=int(np.ceil((a+delay)*fs));window=compensated[start:start+count]
        assert len(window)==count and start+count<len(compensated)
        frequency,psd=welch(window,fs,nperseg=16384,noverlap=8192,scaling='density')
        assert np.array_equal(frequency,frequencies)
        bands={key:float(np.trapezoid(psd[mask],frequencies[mask])) for key,mask in masks.items()}
        rms=float(np.sqrt(np.mean(window**2)));steps=np.diff(window)
        envelopes=np.sqrt(np.mean(window[:len(window)//480*480].reshape(-1,480)**2,axis=1))
        row={'profile':profile,'distanceMetres':distance,'sourceSha256':original['sourceSha256'],
            'expectedArrivalSeconds':delay,'analysisReceiverWindowSeconds':[start/fs,(start+count)/fs],
            'gainCompensatedBandPower':bands,'relativeHighLowDb':db(bands['high']/bands['low']),
            'relativeMidLowDb':db(bands['mid']/bands['low']),
            'bandTransferFromSourceDb':{key:db(bands[key]/source_bands[key]) for key in bands},
            'compensatedRms':rms,'rmsRelativeStep':float(np.sqrt(np.mean(steps**2))/rms),
            'maximumStepOverRms':float(np.max(abs(steps))/rms),
            'p99StepOverRms':float(np.quantile(abs(steps),.99)/rms),
            'envelope10msCoefficientOfVariation':float(np.std(envelopes)/np.mean(envelopes)),
            'crestFactorDb':db(float(np.max(abs(window))**2/np.mean(window**2))),
            'rawFullClipPeak':original['rawMetrics']['peak'],'rawFullClipRms':original['rawMetrics']['rms'],
            'propagation':{key:original['propagation'][key] for key in ['maximumRetardedFrameError','maximumRateError','bands']},
            'diagnostics':{
                'renderer':{key:original['diagnostics']['renderer'][key] for key in ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow']},
                'historyAffectedFrames':original['diagnostics']['history']['affectedFrames'],
                'simulationMissingPast':original['diagnostics']['simulation']['missingPast']}}
        rows.append(row);spectra[profile,distance]=psd;segments[profile,distance]=(mono,compensated,delay)
    default=[r for r in rows if r['profile']=='physical-default'];authored=[r for r in rows if r['profile']=='authored-detail-loss-v1']
    comparisons=[{'distanceMetres':x['distanceMetres'],'additionalHighLowLossDb':y['relativeHighLowDb']-x['relativeHighLowDb'],
        'additionalMidLowLossDb':y['relativeMidLowDb']-x['relativeMidLowDb'],
        'rmsRelativeStepRatio':y['rmsRelativeStep']/x['rmsRelativeStep'],
        'envelopeVariationRatio':y['envelope10msCoefficientOfVariation']/x['envelope10msCoefficientOfVariation']} for x,y in zip(default,authored)]
    for row in rows:
        assert not any(row['diagnostics']['renderer'].values())
        assert row['diagnostics']['historyAffectedFrames']==0
    fig,axes=plt.subplots(3,2,figsize=(13,12),layout='constrained')
    colours=plt.cm.viridis(np.linspace(.05,.95,6));distances=report['sequence']['distancesMetres']
    within=(frequencies>=40)&(frequencies<=10000)
    max_db=max(float(np.max(10*np.log10(np.maximum(p[within],1e-30)))) for p in spectra.values())
    zoom=report['analysis']['waveformZoomEmissionSeconds'];zoom_mask=(np.arange(len(source))/fs>=zoom[0])&(np.arange(len(source))/fs<zoom[1])
    zoom_limit=max(.02,float(np.max(abs(source[zoom_mask])))*1.15)
    for column,profile in enumerate(['physical-default','authored-detail-loss-v1']):
        for colour,distance in zip(colours,distances):
            mono,compensated,delay=segments[profile,distance]
            axes[0,column].semilogx(frequencies[within],10*np.log10(np.maximum(spectra[profile,distance][within],1e-30)),color=colour,label=f'{distance} m')
            n=len(mono)//240*240;envelope=np.sqrt(np.mean(mono[:n].reshape(-1,240)**2,axis=1));t=(np.arange(len(envelope))+.5)*.005
            axes[1,column].plot(t,20*np.log10(np.maximum(envelope,1e-12)),color=colour)
            axes[1,column].axvline(delay,color=colour,ls=':',lw=.8)
            emission=np.arange(len(compensated))/fs-delay;mask=(emission>=zoom[0])&(emission<zoom[1])
            if distance in [2,100,200]:axes[2,column].plot((emission[mask]-zoom[0])*1000,compensated[mask],color=colour,label=f'{distance} m')
        axes[0,column].set(xlim=(40,10000),ylim=(max_db-75,max_db+3),title=profile,ylabel='Compensated PSD (dBFS/Hz)',xlabel='Frequency (Hz)')
        axes[0,column].legend(ncol=3,fontsize=8)
        axes[1,column].set(xlim=(0,.85),ylim=(-110,-5),ylabel='Raw 5 ms RMS (dBFS)',xlabel='Receiver time (s); dotted lines = distance/343')
        axes[2,column].plot((np.arange(len(source))[zoom_mask]/fs-zoom[0])*1000,source[zoom_mask],color='black',ls=':',lw=.8,label='identical source')
        axes[2,column].set(xlim=(0,(zoom[1]-zoom[0])*1000),ylim=(-zoom_limit,zoom_limit),ylabel='Compensated waveform',xlabel='Emission time from 0.900 s (ms)')
        axes[2,column].legend(fontsize=8)
        for axis in axes[:,column]:axis.grid(True,alpha=.2)
    fig.suptitle('Fixed-state Schafter distance comparison\nIdentical source, orientation and master; only diagnostic spectrum/detail axes compensate known 1/r + master')
    fig.savefig(directory/'fixed-state-distance.png',dpi=140);plt.close(fig)
    output={'schemaVersion':1,'milestone':'STOCK-SOURCE-02','scope':'Genuine held-source distance confirmation; no subjective acceptance claim',
        'source':{key:report['source'][key] for key in ['model','durationSeconds','frames','sha256','peak','sourceGain','pressureShares','heldControl','construction','limitation']},
        'setup':report['setup'],'sequence':report['sequence'],'analysis':report['analysis'],
        'sourceWindowBandPower':source_bands,'rows':rows,'comparison':comparisons,
        'listeningWavSha256':audio_hashes,'moduleSha256':report['moduleSha256'],
        'validation':{'sameSourceHashAllTwelveCases':len(set(r['sourceSha256'] for r in rows))==1,
            'noClippingNonfiniteOrRendererHistoryFaults':True,
            'maximumRetardedFrameError':max(r['propagation']['maximumRetardedFrameError'] for r in rows),
            'maximumStationaryRateError':max(r['propagation']['maximumRateError'] for r in rows)},
        'limitations':report['limitations']+['Temporal modulation and RMS-relative steps characterize signal changes; they do not establish native recognition or perceptual realism',
            'Each spectrum uses the same emitted-time window; no independent level matching or changing operating state is used'],
        'subjectiveListeningPerformed':False,'gameLaunched':False,'audioEndpointOpened':False}
    serialised=json.dumps(output,indent=2)+'\n'
    (directory/'distance-measurements.json').write_text(serialised,'utf8')
    evidence=Path(__file__).resolve().parent.parent/'evidence/stock-source-02-distance.json'
    existing=json.loads(evidence.read_text('utf8'))
    existing['scope']='Original harmonic/transient diagnostic and genuine fixed-state Schafter confirmation'
    existing['genuineHeldSource']=output
    existing['limitations']=[x for x in existing['limitations'] if 'pending' not in x.lower()]
    evidence.write_text(json.dumps(existing,indent=2)+'\n','utf8')
    print(json.dumps({'sourceSha256':output['source']['sha256'],'comparison':comparisons,'validation':output['validation']},indent=2))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('directory',type=Path)
    args=parser.parse_args();measure(args.directory.resolve())
