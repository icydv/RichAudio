"""Fixed window bundles; historical05 admission is preserved, never overridden."""
from pathlib import Path
import argparse,array,hashlib,importlib.util,json,math,os,struct,sys,wave,zlib
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('capture05',HERE.parent/'native-suppression05/Extract-Capture05.py')
old=importlib.util.module_from_spec(spec);spec.loader.exec_module(old)
TAIL_SECONDS=.250
# A remux may retain a one-tick final frame duration while its container includes
# the remainder of the configured 30fps frame. Report both raw ends; permit at
# most that one frame plus 2ms of millisecond timebase rounding, never more.
CONTAINER_QUANTUM_SECONDS=1/30+.002

def end_contract(audio,video,total,window_ends):
    """Container end is the longest track, not a promise of equal track ends.

    New07 permits at most 250 ms of asynchronous recorder shutdown skew OUTSIDE
    every selected window. The 05/06 helper and its failed receipts are unchanged.
    Internal timestamp continuity and selected audio/video coverage stay strict.
    """
    assert audio and video and total is not None and math.isfinite(total)
    ae=audio[-1]['pts']+audio[-1]['duration'];ve=video[-1]['pts']+video[-1]['duration']
    reasons=[]
    if abs(total-max(ae,ve))>CONTAINER_QUANTUM_SECONDS+1e-9:reasons.append('container-end-does-not-match-longest-track')
    if abs(ae-ve)>TAIL_SECONDS+1e-9:reasons.append('shutdown-track-skew-exceeds-250ms')
    if any(end>min(ae,ve)+1e-9 for end in window_ends):reasons.append('selected-window-in-incomplete-tail')
    return dict(passed=not reasons,reasons=reasons,audioEndSeconds=ae,videoEndSeconds=ve,containerDurationSeconds=total,
                trackEndSkewSeconds=abs(ae-ve),maximumClosureTailSeconds=TAIL_SECONDS,containerQuantumSeconds=CONTAINER_QUANTUM_SECONDS,
                interpretation='Explicit07 closure-only tolerance; no timestamp dropped, window retimed, or historical verdict revised')

def decode(source,av,requests=()):
    audio=[];video=[];blocks=[];pictures={};todo=sorted(requests)
    with av.open(str(source)) as c:
        assert len(c.streams)==2 and len(c.streams.audio)==len(c.streams.video)==1,'one AV stream pair'
        a,v=c.streams.audio[0],c.streams.video[0]
        assert a.codec_context.sample_rate==48000 and len(a.codec_context.layout.channels)==2,'48kHz stereo'
        assert 0<v.codec_context.width<=1920 and 0<v.codec_context.height<=1080,'bounded video header'
        total=None if c.duration is None else c.duration/1e6
        if total is not None:old.check_recording_duration(total)
        for s in [a,v]:s.codec_context.options={'err_detect':'explode+crccheck'}
        v.codec_context.thread_count=4;v.codec_context.thread_type='AUTO'
        resampler=av.AudioResampler(format='s16',layout='stereo',rate=48000)
        samples=0
        for packet in c.demux(a,v):
            assert not packet.is_corrupt,'corrupt packet'
            for f in packet.decode():
                assert not f.is_corrupt and f.pts is not None and f.time_base is not None,'corrupt or untimed frame'
                t=float(f.pts*f.time_base);assert math.isfinite(t) and 0<=t<=780,'bounded frame PTS'
                if isinstance(f,av.AudioFrame):
                    if not audio:assert t==0,'First audio PTS must be zero; no retiming'
                    audio.append(dict(pts=t,duration=f.samples/f.sample_rate))
                    for x in resampler.resample(f):
                        samples+=x.samples;assert samples<=780*48000,'sample bound';blocks.append(bytes(x.planes[0])[:x.samples*4])
                else:
                    assert isinstance(f,av.VideoFrame) and 0<f.width<=1920 and 0<f.height<=1080,'bounded decoded video'
                    duration=float(f.duration*f.time_base) if f.duration else float(1/v.average_rate)
                    video.append(dict(pts=t,duration=duration));assert len(video)<=780*120,'frame count bound'
                    while todo and t>=todo[0][0]:
                        req,name=todo.pop(0);rgb=f.reformat(width=384,height=216,format='rgb24');p=rgb.planes[0];b=bytes(p)
                        pictures[name]=dict(requested=req,actual=t,rows=[b[y*p.line_size:y*p.line_size+1152] for y in range(216)])
        for x in resampler.resample(None):samples+=x.samples;blocks.append(bytes(x.planes[0])[:x.samples*4])
        assert samples<=780*48000 and not todo,'bounded decode covers requested review frames'
    return audio,video,b''.join(blocks),pictures,total

def png(rows,width,height,path):
    def chunk(k,b):return struct.pack('>I',len(b))+k+b+struct.pack('>I',zlib.crc32(k+b)&0xffffffff)
    raw=b''.join(b'\0'+r for r in rows)
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))

def bundle(plan_path,finalized=False):
    p=json.loads(Path(plan_path).read_text(encoding='utf-8-sig'));root=Path(p['Root']);out=old.checked_path(Path(p['Output']),root)
    assert not out.exists(),'exclusive fresh bundle output';out.mkdir(parents=True)
    result=dict(schema='NativeSuppression07CaptureBundle',Passed=False,Session=p['Session'],Observation=p['Observation'],Phase=p['Phase'],Generation=p['Generation'],Recording=p['Recording'],Profile=p['Profile'],Finalized=finalized,Windows=[])
    try:
        windows=p['Windows'];assert 1<=len(windows)<=4 and len({w['Name'] for w in windows})==len(windows),'finite unique fixed windows'
        active=p['ActiveStartSeconds'];requests=[]
        for i,w in enumerate(windows):
            assert w['Name'].replace('-','').isalnum(),'finite window name';old.check_window(w['StartSeconds'],10,active)
            requests.extend((max(0,w['StartSeconds']+d),str(i)+'-'+str(n)) for n,d in enumerate([-2,0,2.5,5,9.9]))
        source=old.checked_path(Path(p['Source']),root);assert source.suffix=='.mkv','capture extension'
        snapshot=out/'prefix.mkv';result['Snapshot']=old.snapshot_prefix(source,snapshot,finalized)
        av=old.dependencies(p['Dependencies'],p['DependenciesSha256'])
        audio,video,pcm,pictures,total=decode(snapshot,av,requests)
        if total is not None:assert total<=active+720,'active plus closure bound'
        assert all(f['pts']+f['duration']<=active+720+1e-9 for f in audio+video),'decoded closure bound'
        if finalized:
            result['Finalization']=end_contract(audio,video,total,[w['StartSeconds']+10 for w in windows]);assert result['Finalization']['passed'],'07 finalization end contract refused'
        rows=[];review=[]
        for i,w in enumerate(windows):
            t=w['StartSeconds'];verdict=old.validate(audio,video,t,10,fixture=False)
            assert verdict['passed'],str(verdict['reasons'])
            assert audio[-1]['pts']+audio[-1]['duration']>=t+10-1e-9,'audio coverage'
            start=round(t*48000);data=pcm[start*4:(start+480000)*4];assert len(data)==1920000,'exact ten-second PCM'
            x=array.array('h',data);assert any(x),'all-zero observation cannot supply audio evidence'
            wav=out/(w['Name']+'.wav')
            with wave.open(str(wav),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(48000);f.writeframes(data)
            rms=10*math.log10(sum(v*v for v in x)/(len(x)*32768**2))
            result['Windows'].append(dict(Name=w['Name'],StartSeconds=t,DurationSeconds=10,Frames=480000,Wav=str(wav),Sha256=old.sha(wav),PcmSha256=hashlib.sha256(data).hexdigest(),RmsDbfs=rms,Peak=max(abs(v) for v in x),RailSamples=sum(v in(-32768,32767) for v in x),Timeline=verdict))
            pics=[pictures[str(i)+'-'+str(n)] for n in range(5)]
            rows.extend(b''.join(v['rows'][y] for v in pics) for y in range(216))
            review.append(dict(window=w['Name'],frames=[{k:v for k,v in x.items() if k!='rows'} for x in pics]))
        image=out/'review.png';png(rows,1920,216*len(windows),image)
        result.update(ReviewImage=str(image),ReviewImageSha256=old.sha(image),ReviewFrames=review,AudioEndSeconds=audio[-1]['pts']+audio[-1]['duration'],VideoEndSeconds=video[-1]['pts']+video[-1]['duration'],ContainerDurationSeconds=total)
        timeline=out/'timestamps.json';timeline.write_text(json.dumps(dict(audio=audio,video=video)))
        assert old.sha(snapshot)==result['Snapshot']['snapshotSha256'],'immutable prefix changed'
        with source.open('rb') as f:
            st=os.fstat(f.fileno());assert list(old.identity(st))==result['Snapshot']['sourceIdentity'] and st.st_nlink==1,'source identity changed'
            assert result['Snapshot']['copiedBytes']<=st.st_size<=old.MAX_BYTES,'source size changed'
            if finalized:assert st.st_size==result['Snapshot']['copiedBytes'],'finalized source grew'
            assert old.prefix_hash(f,result['Snapshot']['copiedBytes'])==result['Snapshot']['snapshotSha256'],'source prefix changed'
        result.update(Passed=True,TimelinePath=str(timeline),TimelineSha256=old.sha(timeline),Historical05HelperSha256=old.sha(Path(old.__file__)),HelperSha256=old.sha(Path(__file__)),ClassificationPerformed=False,GainApplied=False)
    except Exception as e:result['Error']=type(e).__name__+': '+str(e)
    (out/'receipt.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({'Passed':result['Passed'],'Receipt':str(out/'receipt.json'),'Error':result.get('Error')}),flush=True)
    return result

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('plan',type=Path);p.add_argument('--finalized',action='store_true');a=p.parse_args()
    sys.exit(0 if bundle(a.plan,a.finalized)['Passed'] else 1)
