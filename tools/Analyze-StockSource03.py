"""Measure the compact all-four audition and create its private listening page."""
import argparse,hashlib,html,json,math,re,subprocess,sys
from pathlib import Path

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('output',type=Path);parser.add_argument('--dependencies',type=Path)
parser.add_argument('--evidence',type=Path);parser.add_argument('--distance-directory',type=Path)
args=parser.parse_args()
if args.dependencies:sys.path.insert(0,str(args.dependencies))
import numpy as np
from scipy import signal
from scipy.io import wavfile
import imageio_ffmpeg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out=args.output.resolve();assert '.local' in out.parts
render=json.loads((out/'render-report.json').read_text('utf8'))
MODELS={'bati':'Pegassi Bati 801','lectro':'Principe Lectro','prototipo':'Grotti X80 Proto','schafter3':'Benefactor Schafter V12'}
BANDS=[(20,150),(150,500),(500,2000),(2000,6000),(6000,20000)]
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe();audio={};measurements={}
labels={'source':'New texture + vehicle mix: source only','close-engine':'Close engine only','close-exhaust':'Close exhaust only',
    'close-combined':'Close combined','flyby-open':'Complete open flyby','flyby-street':'Same performance: finite street returns',
    'previous02-source-same-mix':'Previous02 texture: fixed Schafter balance','new03-source-same-mix':'New03 texture: same fixed Schafter balance',
    'tunnel-combined':'Supported tunnel: early + late returns'}

def db(value):return 20*math.log10(value) if value>0 else None
def finite(value):
    try:value=float(value);return value if math.isfinite(value) else None
    except (ValueError,TypeError):return None
def read(file):
    rate,data=wavfile.read(file);kind=data.dtype.kind;size=data.dtype.itemsize
    if data.ndim==1:data=data[:,None]
    data=data.astype(np.float64)
    if kind=='i':data/=2**(size*8-1)
    elif kind=='u':data=(data-2**(size*8-1))/2**(size*8-1)
    assert data.shape[1] in [1,2] and len(data) and np.isfinite(data).all()
    return int(rate),data
def level(data,rate):
    rms=float(np.sqrt(np.mean(data*data)));peak=float(np.max(abs(data)))
    f,power=signal.welch(data,fs=rate,nperseg=min(8192,len(data)),axis=0)
    power=power.mean(axis=1)
    bands={f'{a}-{b}':float(np.trapezoid(power[(f>=a)&(f<b)],f[(f>=a)&(f<b)])) for a,b in BANDS}
    return {'rms':rms,'rmsDbfs':db(rms),'peak':peak,'peakDbfs':db(peak),'bandPower':bands,
        'nonfiniteSamples':int(np.count_nonzero(~np.isfinite(data))),'fullScaleSamples':int(np.count_nonzero(abs(data)>=1))}
def window(data,rate,a,b):return {'windowSeconds':[a,b],**level(data[round(a*rate):round(b*rate)],rate)}
def loudest(data,rate,seconds,start=0,end=None):
    first=round(start*rate);last=round((end if end is not None else len(data)/rate)*rate)
    energy=np.mean(data[first:last]**2,axis=1);n=round(seconds*rate)
    sums=np.r_[0.,np.cumsum(energy)];values=(sums[n:]-sums[:-n])/n;i=int(np.argmax(values));rms=float(np.sqrt(max(0,values[i])))
    return {'windowSeconds':seconds,'startSeconds':(first+i)/rate,'rms':rms,'rmsDbfs':db(rms)}
def loudness(file):
    result=subprocess.run([ffmpeg,'-hide_banner','-nostats','-i',str(file),'-filter_complex','ebur128=peak=true','-f','null','-'],capture_output=True,text=True)
    assert result.returncode==0
    text=result.stderr;summary=text[text.rfind('Summary:'):]
    def take(pattern):
        matches=re.findall(pattern,summary);return finite(matches[-1]) if matches else None
    momentary=[finite(v) for v in re.findall(r'\bM:\s*([-+\w.]+)',text)]
    short=[finite(v) for v in re.findall(r'\bS:\s*([-+\w.]+)',text)]
    return {'method':'FFmpeg EBU R128 measurement only','integratedLufs':take(r'I:\s*([-+\w.]+) LUFS'),
        'truePeakDbfs':take(r'Peak:\s*([-+\w.]+) dBFS'),
        'maximum400msMomentaryLufs':max((v for v in momentary if v is not None),default=None),
        'maximum3sShortTermLufs':max((v for v in short if v is not None),default=None)}
def texture(data,rate,a,b):
    # Correlation is a description, never a universal periodic-engine rejection.
    x=data[round(a*rate):round(b*rate)].mean(axis=1);x=x-x.mean()
    n=len(x);size=1<<(2*n-1).bit_length();spectrum=np.fft.rfft(x,size)
    correlation=np.fft.irfft(abs(spectrum)**2,size)[:n]
    power=np.r_[0.,np.cumsum(x*x)]
    def strongest(lo,hi):
        lags=np.arange(round(lo*rate),round(hi*rate)+1)
        denominator=np.sqrt(np.maximum((power[n-lags]-power[0])*(power[n]-power[lags]),1e-30))
        values=correlation[lags]/denominator;i=int(np.argmax(values))
        return {'lagSeconds':float(lags[i]/rate),'correlation':float(values[i])}
    block=round(.05*rate);envelope=np.sqrt(np.mean(x[:n//block*block].reshape(-1,block)**2,axis=1))
    steps=np.diff(x);rms=float(np.sqrt(np.mean(x*x)))
    return {'windowSeconds':[a,b],'strongest12to40msCorrelation':strongest(.012,.04),
        'strongest120to800msCorrelation':strongest(.12,.8),
        'envelope50msCoefficientOfVariation':float(np.std(envelope)/max(np.mean(envelope),1e-30)),
        'rmsRelativeAdjacentStep':float(np.sqrt(np.mean(steps*steps))/max(rms,1e-30)),
        'maximumStepOverRms':float(np.max(abs(steps))/max(rms,1e-30)),
        'interpretation':'Measured repetition/envelope detail, not crank RPM, limiter detection or a universal pass threshold'}

for f in render['files']:
    file=out/f['file'];rate,data=read(file);assert rate==48000 and data.shape[1]==2
    assert hashlib.sha256(file.read_bytes()).hexdigest()==f['sha256']
    audio[f['file']]=(rate,data)
    measured={'model':f['model'],'name':f['name'],'label':labels[f['name']],
        'sha256':f['sha256'],'durationSeconds':len(data)/rate,**level(data,rate),
        'loudness':loudness(file),'loudest50msRms':loudest(data,rate,.05),'loudest400msRms':loudest(data,rate,.4)}
    if f['durationSeconds']==18:
        measured['states']={state:window(data,rate,*interval) for state,interval in render['controls']['windows'].items()}
        if f['kind']=='source':measured['heldTexture']=texture(data,rate,5.5,12.5)
    else:
        measured['nearPass50msRms']=loudest(data,rate,.05,4.8,5.8)
        measured['nearPass']=window(data,rate,5.05,5.55);measured['farRecession']=window(data,rate,9.3,10.3)
        if f['propagation']['sceneSwitchTime'] is not None:
            switch=f['propagation']['sceneSwitchTime'];start=max(0,round((switch-.03)*rate));end=min(len(data),round((switch+.03)*rate));steps=np.diff(data[start:end],axis=0)
            measured['coverageSwitchDetail']={'timeSeconds':switch,'windowSeconds':[start/rate,end/rate],
                'maximumAdjacentStep':float(np.max(abs(steps))),'rmsAdjacentStep':float(np.sqrt(np.mean(steps**2))),
                'interpretation':'Source-dependent waveform detail; fault counters and identical finite geometry provide separate continuity evidence'}
    measurements[f['file']]=measured

references=[]
for reference in render['references']:
    file=out/reference['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==reference['sha256']
    rate,data=read(file);assert rate==reference['sampleRate']
    references.append({key:reference[key] for key in ['model','role','state','file','sampleRate','sha256','byteIdentical']})
pop_references=[]
for reference in render.get('popReferences',[]):
    file=out/reference['file'];assert hashlib.sha256(file.read_bytes()).hexdigest()==reference['sha256']
    rate,data=read(file);assert rate==reference['sampleRate']
    pop_references.append({key:reference[key] for key in ['model','name','file','sampleRate','sha256','byteIdentical']})
checks={'allFourEquivalentProgrammes':all(sum(f['model']==model and f['name'] in ['source','close-engine','close-exhaust','close-combined','flyby-open','flyby-street'] for f in render['files'])==6 for model in MODELS),
    'twentyFourUntouchedNativeReferences':len(references)==24 and all(r['byteIdentical'] for r in references),
    'allGeneratedFilesFiniteUnclipped':all(m['nonfiniteSamples']==0 and m['fullScaleSamples']==0 for m in measurements.values()),
    'sameGainEveryGeneratedFile':all(f['sourceGain']==render['sourceGain'] for f in render['files']),
    'streetHasExhaustFirstAndSecondReturns':all(f['propagation']['exhaustReturns']['first']>0 and f['propagation']['exhaustReturns']['second']>0 for f in render['files'] if f['kind']=='street'),
    'noUnsupportedStreetLateField':all(f['late'] is None for f in render['files'] if f['kind']!='tunnel')}
checks['fourUntouchedX80PopReferences']=len(pop_references)==4 and all(r['byteIdentical'] for r in pop_references)
checks['oneCompletedAuthoredEventPerX80Performance']=all(f['sourceStats'].get('events',{}).get('triggered')==1 and f['sourceStats']['events']['completed']==1 for f in render['files'] if f['model']=='prototipo')
checks['noSubstitutedEventsOtherVehicles']=all(not f['eventPlan'] for f in render['files'] if f['model']!='prototipo')
close_ratios={};sum_errors={}
for model in MODELS:
    files={f['name']:f for f in render['files'] if f['model']==model}
    for key in ['sourceHash','motionHash','controlHash']:checks[model+'OpenStreetSame'+key]=files['flyby-open'][key]==files['flyby-street'][key]
    engine=audio[model+'/close-engine.wav'][1];exhaust=audio[model+'/close-exhaust.wav'][1];combined=audio[model+'/close-combined.wav'][1]
    error=float(np.max(abs(engine+exhaust-combined)));sum_errors[model]=error;checks[model+'CloseLinearSum']=error<2e-7
    close_ratios[model]={}
    for state,interval in render['controls']['windows'].items():
        a,b=interval;er=float(np.sqrt(np.mean(engine[round(a*48000):round(b*48000)]**2)));xr=float(np.sqrt(np.mean(exhaust[round(a*48000):round(b*48000)]**2)))
        close_ratios[model][state]={'windowSeconds':interval,'engineRmsDbfs':db(er),'exhaustRmsDbfs':db(xr),'exhaustMinusEngineDb':db(xr/er) if er>0 else None}
diagnostics=[f['diagnostics'] for f in render['files'] if f['diagnostics']]
checks['noRendererOrPcmHistoryFaults']=all(all(d['renderer'][key]==0 for key in ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow']) and d['history']['affectedFrames']==0 for d in diagnostics)
checks['noSourceBoundsViolations']=all(voice['sourceBoundViolations']==0 for f in render['files'] for roles in f['voices'].values() for voice in roles.values())
before=next(f for f in render['files'] if f['name']=='previous02-source-same-mix');after=next(f for f in render['files'] if f['name']=='new03-source-same-mix')
checks['SchafterPlayerOnlyComparisonSameControlsGainMix']=before['controlHash']==after['controlHash'] and before['sourceGain']==after['sourceGain'] and before['sourceConfiguration']==after['sourceConfiguration']
tunnel=next(f for f in render['files'] if f['kind']=='tunnel');extras={}
for extra in tunnel['extras']:
    rate,data=read(out/extra['file']);assert hashlib.sha256((out/extra['file']).read_bytes()).hexdigest()==extra['sha256'];extras[extra['file']]=(rate,data)
early=extras['schafter3/tunnel-early.wav'][1];late=extras['schafter3/tunnel-late.wav'][1];total=audio[tunnel['file']][1]
tunnel_sum_error=float(np.max(abs(early+late-total)))
checks['tunnelEarlyLateSum']=tunnel_sum_error<2e-7
checks['tunnelPreservesOrthogonalSourceSend']=tunnel['late']['inputBasis']=='orthogonal-original-engine-exhaust-source-stems'
tunnel_energy={state:{part:float(np.mean(data[round(interval[0]*48000):round(interval[1]*48000)]**2)) for part,data in [('early',early),('late',late),('combined',total)]} for state,interval in render['controls']['windows'].items()}
isolated=render['isolatedPop'];isolated_orders=[]
rate,isolated_audio=read(out/isolated['receivedFile']);assert hashlib.sha256((out/isolated['receivedFile']).read_bytes()).hexdigest()==isolated['receivedWavSha256']
rate,isolated_source=read(out/isolated['sourceFile']);assert hashlib.sha256((out/isolated['sourceFile']).read_bytes()).hexdigest()==isolated['sourceWavSha256']
for row in isolated['rows']:
    samples=isolated_audio[row['startFrame']:row['startFrame']+row['frames']]
    energy=float(np.sum(samples*samples));assert abs(energy-row['receivedEnergy'])<1e-8
    assert energy>0
    isolated_orders.append({key:row[key] for key in ['order','sourceSha256','calculatedArrivals','measuredFirstAboveThresholdSeconds','thresholdRelativePeak','receivedEnergy','diagnostics']})
checks['nativePopActualEnergyInDirectFirstSecondOrders']=len(isolated_orders)==3 and all(row['receivedEnergy']>0 for row in isolated_orders)
checks['nativePopFiniteOnceNoBed']=isolated['eventStats']['triggered']==1 and isolated['eventStats']['completed']==1

distance_dir=(args.distance_directory or out.parent/'distance').resolve();distance_report=None;distance_rows=[];distance_audio={};distance_spectra={};distance_sources={}
if (distance_dir/'distance-render.json').is_file():
    distance_report=json.loads((distance_dir/'distance-render.json').read_text('utf8'));fs=distance_report['sampleRate']
    for model,source in distance_report['sources'].items():
        data=(distance_dir/('held-'+model+'.f32')).read_bytes();assert hashlib.sha256(data).hexdigest()==source['sourceSha256']
        distance_sources[model]=np.frombuffer(data,dtype='<f4').astype(np.float64)
    for row in distance_report['rows']:
        if row['file'] not in distance_audio:distance_audio[row['file']]=read(distance_dir/row['file'])[1]
        stereo=distance_audio[row['file']][row['startFrame']:row['startFrame']+row['frames']]
        mono=stereo.mean(axis=1)*np.sqrt(2);compensated=mono*row['distanceMetres']/distance_report['rendererMasterGain']
        a,b=distance_report['analysis']['emissionWindowSeconds'];count=round((b-a)*fs);start=int(np.ceil((a+row['delaySeconds'])*fs));window_data=compensated[start:start+count]
        assert len(window_data)==count and start+count<len(compensated)
        freq,psd=signal.welch(window_data,fs=fs,nperseg=16384,noverlap=8192)
        band={}
        for key,lo,hi in [('low',40,400),('mid',400,4000),('high',4000,10000)]:
            mask=(freq>=lo)&(freq<hi);band[key]=float(np.trapezoid(psd[mask],freq[mask]))
        rms=float(np.sqrt(np.mean(window_data**2)));steps=np.diff(window_data)
        distance_rows.append({key:row[key] for key in ['model','profile','distanceMetres','sourceSha256','delaySeconds','propagation','diagnostics']}|
            {'gainCompensatedBandPower':band,'relativeHighLowDb':10*math.log10(band['high']/band['low']),
                'relativeMidLowDb':10*math.log10(band['mid']/band['low']),
                'rmsRelativeAdjacentStep':float(np.sqrt(np.mean(steps**2))/rms),
                'rawPeak':row['metrics']['peak'],'rawFullClipRms':row['metrics']['rms']})
        distance_spectra[row['model'],row['profile'],row['distanceMetres']]=(freq,psd,mono,compensated,row['delaySeconds'])
    checks['allFourDistinctHeldSources']=len(distance_sources)==4 and len({s['sourceSha256'] for s in distance_report['sources'].values()})==4
    checks['allFourSixDistanceAuthoredComparisons']=all(sum(r['model']==model and r['profile']=='authored-detail-loss-v1' for r in distance_rows)==6 for model in MODELS)
    checks['distanceSourcePcmIdenticalWithinEachVehicle']=all(len({r['sourceSha256'] for r in distance_rows if r['model']==model})==1 for model in MODELS)
    checks['distanceNoRendererOrHistoryFaults']=all(not any(r['diagnostics']['renderer'].values()) and r['diagnostics']['historyAffectedFrames']==0 for r in distance_rows)

plt.style.use('dark_background')
def figure(cases,file,title,detail=False):
    columns=3 if detail else 2
    fig,axes=plt.subplots(len(cases),columns,figsize=(16 if detail else 13,2.7*len(cases)),squeeze=False,layout='constrained')
    for row,name in enumerate(cases):
        rate,data=audio[name];times=np.arange(len(data))/rate;hop=max(1,len(data)//12000)
        for channel in range(2):axes[row,0].plot(times[::hop],data[::hop,channel],lw=.4,alpha=.7)
        axes[row,0].set(title=measurements[name]['label'],ylim=(-1,1),xlim=(0,len(data)/rate),ylabel='Digital amplitude')
        powers=[]
        for channel in range(2):
            freq,time,z=signal.stft(data[:,channel],fs=rate,nperseg=4096,noverlap=3584,boundary=None);powers.append(abs(z)**2)
        magnitude=np.sqrt(np.mean(powers,axis=0));im=axes[row,1].pcolormesh(time,freq,20*np.log10(np.maximum(magnitude,1e-12)),vmin=-105,vmax=-5,cmap='magma',shading='auto')
        axes[row,1].set(yscale='log',ylim=(40,10000),xlim=(0,len(data)/rate),title='Matched -105..-5 dBFS scale',ylabel='Hz')
        if detail:
            a,b=round(8*rate),round(8.04*rate)
            for channel in range(2):axes[row,2].plot(times[a:b],data[a:b,channel],lw=.6,alpha=.7)
            axes[row,2].set(title='Same held time: 40 ms detail',xlim=(8,8.04),ylim=(-1,1))
    fig.suptitle(title+'; unchanged file gains');fig.colorbar(im,ax=list(axes[:,1]),label='Channel-energy STFT magnitude dBFS')
    for axis in axes[-1]:axis.set_xlabel('Seconds')
    fig.savefig(out/file,dpi=110);plt.close(fig)
for model,title in MODELS.items():figure([model+'/'+name+'.wav' for name in ['source','close-combined','flyby-open','flyby-street']],model+'/overview.png',title)
figure([before['file'],after['file']],'schafter3/source-player-comparison.png','Schafter source-player-only comparison',True)
fig,axes=plt.subplots(3,1,figsize=(12,7),layout='constrained')
for axis,row in zip(axes,isolated['rows']):
    data=isolated_audio[row['startFrame']:row['startFrame']+row['frames']];time=np.arange(len(data))/48000
    for channel in range(2):axis.plot(time,data[:,channel],lw=.5,alpha=.7)
    for arrival in row['calculatedArrivals']:axis.axvline(arrival['arrivalSeconds'],color='orange',ls=':',lw=.8)
    axis.set(xlim=(.24,.65),ylim=(-.25,.25),title='Calculated path order'+str(row['order'])+'; same finite native event, no bed or FDN',ylabel='Digital amplitude');axis.grid(alpha=.2)
axes[-1].set_xlabel('Receiver seconds; dotted lines are geometric arrival times')
fig.savefig(out/'prototipo/pop-orders.png',dpi=120);plt.close(fig)
if distance_report:
    colours=plt.cm.viridis(np.linspace(.05,.95,6));distances=distance_report['sequence']['distancesMetres']
    peak_psd=max(float(np.max(10*np.log10(np.maximum(psd[(f>=40)&(f<=10000)],1e-30)))) for f,psd,_,_,_ in distance_spectra.values())
    for model,title in MODELS.items():
        profiles=['physical-default','authored-detail-loss-v1'] if model=='schafter3' else ['authored-detail-loss-v1']
        fig,axes=plt.subplots(3,len(profiles),figsize=(13 if len(profiles)==2 else 9,11),squeeze=False,layout='constrained')
        source=distance_sources[model];zoom=distance_report['analysis']['waveformZoomEmissionSeconds'];source_time=np.arange(len(source))/48000;source_mask=(source_time>=zoom[0])&(source_time<zoom[1])
        for column,profile in enumerate(profiles):
            for colour,distance in zip(colours,distances):
                f,psd,mono,compensated,delay=distance_spectra[model,profile,distance];mask=(f>=40)&(f<=10000)
                axes[0,column].semilogx(f[mask],10*np.log10(np.maximum(psd[mask],1e-30)),color=colour,label=str(distance)+' m')
                n=len(mono)//240*240;envelope=np.sqrt(np.mean(mono[:n].reshape(-1,240)**2,axis=1));times=(np.arange(len(envelope))+.5)*.005
                axes[1,column].plot(times,20*np.log10(np.maximum(envelope,1e-12)),color=colour);axes[1,column].axvline(delay,color=colour,ls=':',lw=.8)
                emitted=np.arange(len(compensated))/48000-delay;mask=(emitted>=zoom[0])&(emitted<zoom[1])
                if distance in [2,100,200]:axes[2,column].plot((emitted[mask]-zoom[0])*1000,compensated[mask],color=colour,label=str(distance)+' m')
            axes[0,column].set(xlim=(40,10000),ylim=(peak_psd-75,peak_psd+3),title=profile,ylabel='Compensated PSD dBFS/Hz',xlabel='Hz');axes[0,column].legend(ncol=3,fontsize=8)
            axes[1,column].set(xlim=(0,.85),ylim=(-110,-5),ylabel='Raw5 ms RMS dBFS',xlabel='Receiver time(s); dotted=distance/343')
            axes[2,column].plot((source_time[source_mask]-zoom[0])*1000,source[source_mask],color='white',ls=':',lw=.7,label='identical source')
            axes[2,column].set(xlim=(0,(zoom[1]-zoom[0])*1000),ylim=(-1,1),ylabel='Compensated waveform',xlabel='Emission time from0.9s(ms)');axes[2,column].legend(fontsize=8)
            for axis in axes[:,column]:axis.grid(alpha=.2)
        fig.suptitle(title+': fixed high-load distance comparison\nOnly diagnostic spectrum/detail axes compensate known1/r +master; WAV gains unchanged')
        fig.savefig(distance_dir/('fixed-state-distance-'+model+'.png'),dpi=120);plt.close(fig)

timings=[f['timings'] for f in render['files']]
runtime={stage:{'blocks':sum(t[stage]['count'] for t in timings),'maximumMs':max(t[stage]['max'] for t in timings),
    'largestCaseP95Ms':max(t[stage]['p95'] for t in timings),'deadlineMisses':sum(t[stage]['misses'] for t in timings),
    'casesWithMisses':[{'model':f['model'],'name':f['name'],'misses':f['timings'][stage]['misses']} for f in render['files'] if f['timings'][stage]['misses']]} for stage in ['source','rendererAndControl','complete']}
def diagnostic(d):
    if d is None:return None
    return {'renderer':{k:d['renderer'][k] for k in ['limited','missingHistory','cursorResets','rejectedControls','pathOverflow']},
        'simulation':{k:d['simulation'][k] for k in ['missingPast','rejectedPaths','prunedPaths','resets','sceneReplacements']},
        'historyAffectedFrames':d['history']['affectedFrames']}
evidence_files=[]
for f in render['files']:
    evidence_files.append({k:f[k] for k in ['model','name','kind','sha256','durationSeconds','sourceGain','sourceConfiguration','directivity','sourceHash','motionHash','controlHash','peakInput','propagation','timings','eventPlan','eventReturns','heldTextureOccupancy']}|
        {'diagnostics':diagnostic(f['diagnostics']),'events':f['sourceStats'].get('events')})
summary={'schemaVersion':1,'milestone':'STOCK-SOURCE-03','baseCommit':render['baseCommit'],'files':measurements,
    'references':references,'popReferences':pop_references,'checks':checks,'allNumericalChecksPass':all(checks.values()),
    'closeReceivedBalanceByState':close_ratios,'closeLinearSumMaximumErrors':sum_errors,
    'sourcePlayerOnlySchafter':{'before':measurements[before['file']]['heldTexture'],'after':measurements[after['file']]['heldTexture'],
        'sameGain':before['sourceGain'],'samePressureShares':before['sourceConfiguration']},
    'tunnel':{'earlyLateSumMaximumError':tunnel_sum_error,'energyByState':tunnel_energy,'lateModel':tunnel['late']},
    'sourceGain':render['sourceGain'],'rendererMasterGain':render['rendererMasterGain'],
    'profiles':{model:{key:render['profiles'][model][key] for key in ['pressureSharesByState','directivity','sourceGain']} for model in MODELS},
    'geometry':render['geometry'],'controls':render['controls'],'moduleBindings':render['moduleBindings'],'inputBindings':render['inputBindings'],
    'isolatedNativePop':{key:isolated[key] for key in ['model','sourceWavSha256','receivedWavSha256','sourceSha256','orderSequence','segmentSeconds','gapSeconds','segmentStartSeconds','emissionSeconds','nativeVariant','nativeSampleRate','eventStats','roleGain','basis']}|{'orders':isolated_orders},
    'renderEvidence':evidence_files,'timing':{'blockFrames':512,'sampleRate':48000,'deadlineMs':512/48000*1000,'stages':runtime},
    'heldDistance':{'sources':distance_report['sources'],'sequence':distance_report['sequence'],'analysis':distance_report['analysis'],'setup':distance_report['setup'],'rows':distance_rows} if distance_report else None,
    'normalised':False,'subjectiveListeningPerformed':False,'perceptualAcceptance':'Pending user listening',
    'gameLaunched':False,'audioEndpointOpened':False,
    'limitations':['Texture correlation/envelope metrics are descriptive; there is no universal engine autocorrelation threshold',
        'No physical SPL, native RPM, native mix or Los Santos geometry is inferred',
        'Instrumented offline timing includes all misses and does not establish live-device/GTA capacity',
        '50 ms measurements are RMS; EBU momentary loudness uses400 ms.','Source-player-only A/B preserves fixed gain/balance; final vehicle mix is labelled separately']}
(out/'measurements.json').write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n','utf8')
if args.evidence:
    args.evidence.parent.mkdir(parents=True,exist_ok=True);args.evidence.write_text(json.dumps(summary,indent=2,allow_nan=False)+'\n','utf8')

def show(value):return '—' if value is None else f'{value:.2f}'
def player(file,label,group):
    return '<article><h3>'+html.escape(label)+'</h3><audio controls preload="none" data-group="'+html.escape(group)+'" src="'+html.escape(file)+'"></audio><a href="'+html.escape(file)+'">WAV</a></article>'
def table(names):
    rows=''.join('<tr><td>'+html.escape(measurements[name]['label'])+'</td><td>'+show(measurements[name]['loudness']['integratedLufs'])+'</td><td>'+show(measurements[name]['loudness']['maximum400msMomentaryLufs'])+'</td><td>'+show(measurements[name]['loudest50msRms']['rmsDbfs'])+'</td><td>'+show(measurements[name]['peakDbfs'])+'</td></tr>' for name in names)
    return '<table><tr><th>File</th><th>Whole LUFS</th><th>Max400 ms LUFS</th><th>Max50 ms RMS dBFS</th><th>Peak dBFS</th></tr>'+rows+'</table>'
sections=[]
for model,title in MODELS.items():
    source=model+'/source.wav';close=[model+'/'+n+'.wav' for n in ['close-engine','close-exhaust','close-combined']];flyby=[model+'/'+n+'.wav' for n in ['flyby-open','flyby-street']]
    refs=''.join(player(r['file'],r['role']+' '+r['state']+' ('+str(r['sampleRate'])+' Hz)',model+'-native') for r in references if r['model']==model)
    balances=''.join('<tr><td>'+html.escape(state)+'</td><td>'+show(value['engineRmsDbfs'])+'</td><td>'+show(value['exhaustRmsDbfs'])+'</td><td>'+show(value['exhaustMinusEngineDb'])+'</td></tr>' for state,value in close_ratios[model].items())
    cfg=render['profiles'][model];views=[]
    for state,values in cfg.get('predicted',{}).items():
        for view in ['front','side','rear']:
            value=values.get(view)
            if isinstance(value,dict):views.append('<tr><td>'+html.escape(state)+'</td><td>'+html.escape(view)+'</td><td>'+show(value.get('exhaustMinusEngineDb'))+'</td></tr>')
    measured_views=render.get('mixPhase')=='new03-corrected-texture-verified'
    view_table='<details><summary>Front / side / rear balance probes — '+('corrected-texture measurements' if measured_views else 'proposal predictions')+'</summary><table><tr><th>State</th><th>View</th><th>Exhaust−engine dB</th></tr>'+''.join(views)+'</table></details>' if views else ''
    vehicle_distance=''
    if distance_report:
        import os
        relative=Path(os.path.relpath(distance_dir,out)).as_posix()
        distance_players=player(relative+'/fixed-state-distance-'+model+'-authored.wav','Held source: authored distance presentation',model+'-distance')
        if model=='schafter3':distance_players=player(relative+'/fixed-state-distance-schafter3-default.wav','Held source: physical-default presentation',model+'-distance')+distance_players
        vehicle_distance='<h3>Same high-load state at six distances</h3><p>2/10/25/50/100/200 m,3 s each with0.25 s gaps. Listening gains retain real spreading; the diagnostic plot compensates known distance/master only.</p><div class="players">'+distance_players+'</div><details><summary>Fixed-state distance spectrum, arrivals and sample detail</summary><img loading="lazy" src="'+relative+'/fixed-state-distance-'+model+'.png" alt="'+title+' fixed-state distance diagnostic"></details>'
    pop_detail=''
    if model=='prototipo':
        pop_detail='<p>One verified native X80 exhaust pop is scheduled at the authored lift:13.56 s in the stationary programme and5.34 s in each flyby. It is finite, enters the exhaust emitter before propagation and is not a recovered ECU trigger.</p><details><summary>Isolate the actual native pop and its calculated returns</summary><p>No engine bed or late field. The returns file presents direct, first-order and second-order paths separately:1.2 s each,0.15 s gaps, starts0/1.35/2.70 s. Each uses the same single event through the existing renderer.</p><div class="players">'+player(isolated['sourceFile'],'Isolated finite pop source','pop-diagnostic')+player(isolated['receivedFile'],'Computed direct / first / second orders','pop-diagnostic')+'</div><img loading="lazy" src="prototipo/pop-orders.png" alt="Native event received energy with calculated arrival markers"></details><details><summary>Four untouched native X80 pop variants</summary><div class="players">'+''.join(player(r['file'],r['name']+' ('+str(r['sampleRate'])+' Hz)','prototipo-native-pops') for r in pop_references)+'</div></details>'
    sections.append('<section><h2>'+title+'</h2><p>Source programme: idle, rise, nine-second high-load hold, then lift and a natural tail. The open/street flybys use identical source and motion. The finite street is an authored10 m section near the listener; it has calculated first/second-order returns and no late-field preset.</p><div class="players">'+player(source,labels['source'],model+'-source')+'</div><h3>Close exterior — common source and gain</h3><div class="players">'+''.join(player(n,measurements[n]['label'],model+'-close') for n in close)+'</div><h3>Approach, pass and recession</h3><div class="players">'+''.join(player(n,measurements[n]['label'],model+'-flyby') for n in flyby)+'</div>'+pop_detail+table([source]+close+flyby)+'<details><summary>Actual close engine/exhaust balance by state</summary><table><tr><th>State</th><th>Engine RMS dBFS</th><th>Exhaust RMS dBFS</th><th>Exhaust−engine dB</th></tr>'+balances+'</table></details>'+view_table+'<details><summary>Matched waveform and spectrogram</summary><img loading="lazy" src="'+model+'/overview.png" alt="'+title+' matched source and propagation plots"></details>'+vehicle_distance+'<details><summary>Six untouched native references</summary><div class="players">'+refs+'</div></details></section>')
comparison='<section><h2>Schafter: texture change isolated from mix</h2><p>These two18 s source-only files use the same controls, source gain and fixed previous Schafter0.4/0.6 pressure shares. The new vehicle-mix programme above is a separate comparison. Correlation numbers describe repetition; periodic engine sound is not rejected by one universal threshold.</p><div class="players">'+player(before['file'],labels[before['name']],'schafter-texture')+player(after['file'],labels[after['name']],'schafter-texture')+'</div>'+table([before['file'],after['file']])+'<details><summary>Matched source-player comparison</summary><img loading="lazy" src="schafter3/source-player-comparison.png" alt="Schafter before and after texture at unchanged gain"></details></section>'
tunnel_section='<section><h2>Schafter: supported tunnel</h2><p>The same18 s source programme excites finite early paths and the existing analytic-enclosure late field. The separate files expose their contributions. No late field runs in the street or open examples.</p><div class="players">'+player(tunnel['file'],labels['tunnel-combined'],'tunnel')+player('schafter3/tunnel-early.wav','Direct + finite early returns','tunnel')+player('schafter3/tunnel-late.wav','Source-excited dense late field only','tunnel')+'</div></section>'
distance=''
style='body{max-width:1160px;margin:auto;padding:28px;background:#101822;color:#e6edf4;font:16px system-ui}p{line-height:1.5}a{color:#7cdeeb}.players{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}article,.controls{padding:14px;background:#1b2a3a}audio,img{width:100%}table{width:100%;border-collapse:collapse;margin:18px 0;font-size:13px}td,th{border:1px solid #4b5c70;padding:7px;text-align:left}section{border-top:1px solid #4b5c70;margin-top:26px;padding-top:14px}details{margin:16px 0}.controls{position:sticky;top:0;z-index:1}.limit{color:#ffcd99}button{margin:0 18px}'
js='const players=[...document.querySelectorAll("audio")],volume=document.querySelector("#volume");let previous=null,changing=false;function commonVolume(v){if(changing)return;changing=true;volume.value=v;for(const a of players)if(a.volume!==v)a.volume=v;document.querySelector("#level").textContent=Math.round(v*100)+"%";changing=false}volume.oninput=()=>commonVolume(+volume.value);for(const a of players){a.volume=1;a.addEventListener("volumechange",()=>commonVolume(a.volume));a.addEventListener("play",()=>{if(previous&&previous!==a&&document.querySelector("#carry").checked&&previous.dataset.group===a.dataset.group&&Number.isFinite(a.duration)&&previous.currentTime<a.duration)a.currentTime=previous.currentTime;for(const b of players)if(b!==a)b.pause();previous=a})}document.querySelector("#stop").onclick=()=>players.forEach(a=>a.pause());'
page='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RichAudio — four original vehicles</title><style>'+style+'</style><h1>RichAudio: four original vehicles</h1><p>Compare the original recordings, sustained source texture, exterior balance and environmental returns. Start with the unchanged-gain Schafter texture comparison, then choose each vehicle. Previous auditions remain unchanged. No human listening or perceptual acceptance is claimed.</p><div class="controls"><label>Common volume <input id="volume" type="range" min="0" max="1" step="0.01" value="1"><output id="level">100%</output></label><button id="stop">Pause all</button><label><input id="carry" type="checkbox">Carry time within a comparison</label></div><p>Playback starts only when you choose it, with one player at a time. No independent normalization, loudness matching or hidden per-file level changes. Original references retain their native levels. Source-only and propagated examples are labelled separately.</p>'+comparison+''.join(sections)+tunnel_section+distance+'<section><h2>Evidence and limits</h2><p><a href="measurements.json">Levels, texture, balance and timing measurements</a> / <a href="render-report.json">Source controls and acoustic-chain evidence</a></p><p class="limit">Perceptual acceptance is pending your listening. The authored exterior mix, finite street fixture and distance presentation are disclosed assumptions, not a recovered native mix or complete Los Santos geometry. Digital levels are not physical SPL. No generic pops, intake source or Lectro KERS sound is substituted.</p><details><summary>Numerical checks</summary><ul>'+''.join('<li>'+html.escape(name)+': '+('PASS' if value else 'REVIEW')+'</li>' for name,value in checks.items())+'</ul></details></section><script>'+js+'</script></html>'
(out/'listen.html').write_text(page,'utf8')
print(json.dumps({'generatedMainWavs':len(measurements),'nativeReferences':len(references),'checksPass':summary['allNumericalChecksPass'],
    'maximumCompleteBlockMs':runtime['complete']['maximumMs'],'completeDeadlineMisses':runtime['complete']['deadlineMisses']}))
