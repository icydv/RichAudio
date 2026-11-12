"""Decode declared local windows with fail-closed timestamps. Never captures or plays audio."""
from pathlib import Path
import sys,argparse,json,hashlib,wave,math
sys.dont_write_bytecode=True
from CaptureTimeline03C import validate
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c'
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def dependencies():
    deps=json.loads((R/'.local/gate-a-shvdne-private-03b/capture-dependencies.json').read_text(encoding='utf-8-sig'))
    for x in deps['retainedPyAvFiles']:assert sha(Path(x['path']))==x['sha256']
    root=next(Path(x['path']).parent for x in deps['retainedPyAvFiles'] if Path(x['path']).name=='METADATA').parent
    while not (root/'av').is_dir():root=root.parent
    sys.path.insert(0,str(root));import av
    return av
def extract(source,target,start,duration,fixture=False):
    source=source.absolute();target=target.absolute();allowed=P/'capture-fixtures' if fixture else P/'execution-01'
    for p in [source,target,*source.parents,*target.parents]:
        if p.exists():assert not p.lstat().st_file_attributes&0x400,'Reparse path refused'
    source=source.resolve();target=target.resolve()
    assert source.is_relative_to(allowed.resolve()) and target.is_relative_to(allowed.resolve())
    assert not target.exists() and not target.with_suffix('.receipt.json').exists()
    assert source.stat().st_size<=536870912 and math.isfinite(start) and start>=0 and math.isfinite(duration) and 2.8<=duration<=30
    before_source=dict(bytes=source.stat().st_size,sha256=sha(source))
    av=dependencies();blocks=[];frames=0;audio_timeline=[];video_timeline=[]
    with av.open(str(source)) as container:
        assert container.duration is not None and 0<container.duration<=90000000,'Bounded capture of at most90seconds required'
        streams=[dict(type=x.type,codec=x.codec_context.name,timeBase=str(x.time_base)) for x in container.streams]
        audios=[x for x in container.streams if x.type=='audio'];videos=[x for x in container.streams if x.type=='video']
        assert len(audios)==1 and (fixture or len(videos)==1)
        assert audios[0].codec_context.sample_rate==48000 and len(audios[0].codec_context.layout.channels)==2
        resampler=av.AudioResampler(format='s16',layout='stereo',rate=48000)
        for packet in container.demux():
            for frame in packet.decode():
                if isinstance(frame,av.AudioFrame):
                    audio_timeline.append(dict(pts=float(frame.pts*frame.time_base) if frame.pts is not None and frame.time_base is not None else None,duration=frame.samples/frame.sample_rate))
                    for converted in resampler.resample(frame):blocks.append(bytes(converted.planes[0])[:converted.samples*4]);frames+=converted.samples
                elif isinstance(frame,av.VideoFrame):
                    t=float(frame.pts*frame.time_base) if frame.pts is not None and frame.time_base is not None else None
                    length=float(frame.duration*frame.time_base) if frame.duration and frame.time_base else (float(1/videos[0].average_rate) if videos and videos[0].average_rate else None)
                    video_timeline.append(dict(pts=t,duration=length))
        for converted in resampler.resample(None):blocks.append(bytes(converted.planes[0])[:converted.samples*4]);frames+=converted.samples
    timeline=validate(audio_timeline,video_timeline,start,duration,fixture)
    source_unchanged=source.is_file() and source.stat().st_size==before_source['bytes'] and sha(source)==before_source['sha256']
    if not source_unchanged:timeline['passed']=False;timeline['reasons'].append('source-changed-during-decode')
    first=round(start*48000);count=round(duration*48000)
    if first+count>frames:timeline['passed']=False;timeline['reasons'].append('declared-window-exceeds-decoded-audio')
    result=dict(schema='Private03C-capture-window-02',source=str(source),sourceSha256=before_source['sha256'],sourceBytes=before_source['bytes'],sourceUnchangedDuringDecode=source_unchanged,output=str(target),startSample=first,frames=count,firstDecodedAudioPtsSeconds=audio_timeline[0]['pts'] if audio_timeline else None,streams=streams,timeline=timeline,containerContinuityPassed=timeline['passed'],fixture=fixture,gainApplied=False,pitchFit=False,scope='Declared window and complete decoded timestamp evidence only. Independent video-event/journal/lifetime/origin review remains mandatory; not physical endpoint continuity or speaker latency.')
    target.parent.mkdir(parents=True,exist_ok=True)
    if timeline['passed']:
        data=b''.join(blocks)
        with target.open('xb') as file:
            with wave.open(file,'wb') as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(48000);w.writeframes(data[first*4:(first+count)*4])
        result['outputSha256']=sha(target)
    with target.with_suffix('.receipt.json').open('x',encoding='utf-8') as f:json.dump(result,f,indent=2)
    return result
if __name__=='__main__':
    a=argparse.ArgumentParser();a.add_argument('source',type=Path);a.add_argument('target',type=Path);a.add_argument('--start',type=float,required=True);a.add_argument('--duration',type=float,required=True);a.add_argument('--offline-fixture',action='store_true');v=a.parse_args()
    result=extract(v.source,v.target,v.start,v.duration,v.offline_fixture);print(json.dumps(result,indent=2));sys.exit(0 if result['containerContinuityPassed'] else 2)
