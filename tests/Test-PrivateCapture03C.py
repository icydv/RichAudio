"""Timestamp faults, old-adapter demonstration and retained-codec integration; no playback."""
from pathlib import Path
import sys,importlib.util,json,hashlib,types,copy,shutil,wave
from fractions import Fraction
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03c';S=R/'tools/native-control/private-profile03c'
sys.path.insert(0,str(S))
from CaptureTimeline03C import POLICY,validate
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def save(p,value):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('x',encoding='utf-8') as f:json.dump(value,f,indent=2)
fixture=P/'capture-fixtures-v02';fixture.mkdir(parents=True,exist_ok=True)
save(fixture/'freeze.json',dict(policy=POLICY,files=[dict(path=str(q),sha256=sha(q)) for q in [S/'CaptureTimeline03C.py',S/'Extract-Capture03C.py']],scope='Frozen before evaluating all new authored timestamp and retained-codec cases; no live data'))
audio=[dict(pts=i/50,duration=.02) for i in range(200)]
video=[dict(pts=i/30,duration=1/30) for i in range(120)]
cases=[]
def test(name,a=audio,v=video,start=.2,duration=2.8,fixture_mode=False,expected=True):
    value=validate(a,v,start,duration,fixture_mode)
    assert value['passed']==expected,(name,value)
    cases.append(dict(name=name,expected=expected,result=value))
test('complete-synchronized-AV')
test('audio-only-offline-fixture',v=[],fixture_mode=True)
test('audio-only-cannot-admit-live-capture',v=[],expected=False)
test('single-video-frame-cannot-prove-window',v=video[:1],expected=False)
test('missing-all-audio-PTS',a=[dict(pts=None,duration=.02)]*200,expected=False)
test('missing-one-audio-PTS',a=audio[:20]+[dict(pts=None,duration=.02)]+audio[21:],expected=False)
test('missing-all-video-PTS',v=[dict(pts=None,duration=1/30)]*120,expected=False)
test('missing-one-video-PTS',v=video[:20]+[dict(pts=None,duration=1/30)]+video[21:],expected=False)
test('duplicate-video-PTS',v=video[:20]+[video[19]]+video[21:],expected=False)
test('backwards-video-PTS',v=video[:20]+[dict(pts=.1,duration=1/30)]+video[21:],expected=False)
test('audio-gap-over-two-ms',a=audio[:20]+[dict(pts=x['pts']+.003,duration=x['duration']) for x in audio[20:]],expected=False)
test('video-gap-over-100ms',v=video[:20]+video[24:],expected=False)
test('video-starts-after-selected-audio-window',v=video[20:],expected=False)
test('video-ends-before-selected-audio-window',v=video[:50],expected=False)
test('nonfinite-audio-timestamp',a=[dict(pts=float('nan'),duration=.02)],expected=False)
test('invalid-declared-window',start=-1,expected=False)
test('cumulative-positive-audio-drift',a=[dict(pts=i*.021,duration=.020) for i in range(200)],v=[dict(pts=i/30,duration=1/30) for i in range(150)],expected=False)
test('cumulative-negative-audio-drift',a=[dict(pts=i*.019,duration=.020) for i in range(200)],expected=False)
test('inflated-terminal-video-duration',v=video[:29]+[dict(pts=29/30,duration=10)],expected=False)
test('cumulative-audio-at-two-ms-boundary',a=[dict(pts=x['pts']+(.002 if i>=20 else 0),duration=x['duration']) for i,x in enumerate(audio)])
test('cumulative-audio-beyond-two-ms-boundary',a=[dict(pts=x['pts']+(.00201 if i>=20 else 0),duration=x['duration']) for i,x in enumerate(audio)],expected=False)
test('codec-like-quantization-without-cumulative-drift',a=[dict(pts=round(i*.02,3),duration=.020) for i in range(200)])
# Exercise the actual old extractor using authored decoder-frame objects, not a fabricated runtime recording.
old=load('old_extract03',R/'.local/gate-a-shvdne-private-03b/Extract-Capture03.py')
demo=P/'capture-old-adapter-demo-v02';demo.mkdir();(demo/'codec-fixture').mkdir()
shutil.copyfile(R/'.local/gate-a-shvdne-private-03b/capture-dependencies.json',demo/'capture-dependencies.json')
source=demo/'codec-fixture/authored.container';source.write_bytes(b'AUTHORED DECODER METADATA FIXTURE')
class AudioFrame:
    pts=None;time_base=Fraction(1,1000);samples=192000;sample_rate=48000
class VideoFrame:pts=None;time_base=Fraction(1,1000)
class Converted:
    samples=192000;planes=[bytes(192000*4)]
class Resampler:
    def __init__(self,**kw):pass
    def resample(self,frame):return [] if frame is None else [Converted()]
audio_stream=types.SimpleNamespace(type='audio',time_base=Fraction(1,1000),codec_context=types.SimpleNamespace(name='aac',sample_rate=48000,layout=types.SimpleNamespace(channels=[0,1])))
video_stream=types.SimpleNamespace(type='video',time_base=Fraction(1,1000),codec_context=types.SimpleNamespace(name='h264'))
class Container:
    duration=4000000;streams=[audio_stream,video_stream]
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def demux(self):return [types.SimpleNamespace(decode=lambda:[AudioFrame(),VideoFrame()])]
fake=types.SimpleNamespace(open=lambda _:Container(),AudioFrame=AudioFrame,VideoFrame=VideoFrame,AudioResampler=Resampler)
previous=sys.modules.get('av');sys.modules['av']=fake;old.P=demo
try:old_result=old.extract(source,demo/'codec-fixture/old-output.wav',0,2.8,True)
finally:
    if previous is None:sys.modules.pop('av',None)
    else:sys.modules['av']=previous
assert old_result['containerContinuityPassed'] and old_result['firstDecodedAudioPtsSeconds'] is None
save(fixture/'old-missing-PTS-demonstration.json',dict(passedAsOldContinuity=True,actualOldResult=old_result,scope='Actual retained extractor with authored decoded-frame metadata and fake decoder, no claim that the container is real or from GTA',newPolicyRejects=True))
cases.append(dict(name='actual-old-adapter-accepts-missing-PTS-new-policy-refuses',expected=False))
# Actual local AV mux/decode with the retained codec library and original marker; no endpoint.
new=load('extract03c',S/'Extract-Capture03C.py');av=new.dependencies()
input_wav=R/'.local/gate-a-shvdne-private-03/codec-fixture/authored-input.wav'
container_file=fixture/'authored-AV.mkv'
with av.open(str(container_file),'w') as out:
    vst=out.add_stream('mpeg4',rate=30);vst.width=64;vst.height=64;vst.pix_fmt='yuv420p'
    ast=out.add_stream('aac',rate=48000);ast.bit_rate=192000;ast.layout='stereo'
    resampler=av.AudioResampler(format='fltp',layout='stereo',rate=48000)
    with av.open(str(input_wav)) as inp:
        for frame in inp.decode(audio=0):
            for converted in resampler.resample(frame):
                for packet in ast.encode(converted):out.mux(packet)
    for converted in resampler.resample(None):
        for packet in ast.encode(converted):out.mux(packet)
    for packet in ast.encode(None):out.mux(packet)
    for i in range(126):
        frame=av.VideoFrame(64,64,'yuv420p');frame.pts=i;frame.time_base=Fraction(1,30)
        for j,plane in enumerate(frame.planes):plane.update(bytes([64+i%128 if j==0 else 128])*plane.buffer_size)
        for packet in vst.encode(frame):out.mux(packet)
    for packet in vst.encode(None):out.mux(packet)
# Scope this authored AV fixture as an offline fixture path, while requiring live-equivalent AV admission.
new.P=fixture
(fixture/'execution-01').mkdir();bounded_source=fixture/'execution-01/authored-AV.mkv';shutil.copyfile(container_file,bounded_source)
output=fixture/'execution-01/window.wav';actual=new.extract(bounded_source,output,.2,3.,False)
assert actual['containerContinuityPassed'] and actual['timeline']['videoFrames']>=120 and output.is_file(),actual
cases.append(dict(name='actual-retained-AAC-MPEG4-decode-and-live-equivalent-window-admission',expected=True,result=actual))
with wave.open(str(output),'rb') as w:assert w.getnchannels()==2 and w.getframerate()==48000 and w.getnframes()==144000
changing=fixture/'execution-01/changing.container';changing.write_bytes(b'AUTHORED SOURCE BEFORE DECODE')
video_stream.average_rate=Fraction(30,1)
good_audio=AudioFrame();good_audio.pts=0
good_videos=[]
for i in range(126):
    frame=VideoFrame();frame.pts=i;frame.time_base=Fraction(1,30);frame.duration=1;good_videos.append(frame)
class ChangingContainer(Container):
    duration=4200000
    def demux(self):
        changing.write_bytes(b'AUTHORED SOURCE CHANGED DURING DECODE')
        return [types.SimpleNamespace(decode=lambda:[good_audio,*good_videos])]
fake_new=types.SimpleNamespace(open=lambda _:ChangingContainer(),AudioFrame=AudioFrame,VideoFrame=VideoFrame,AudioResampler=Resampler)
new.dependencies=lambda:fake_new
refused_output=fixture/'execution-01/changed-source.wav'
changed_result=new.extract(changing,refused_output,.2,3.,False)
assert not changed_result['containerContinuityPassed'] and 'source-changed-during-decode' in changed_result['timeline']['reasons'] and not refused_output.exists()
cases.append(dict(name='source-drift-during-decode-refused-before-WAV-admission',expected=False,result=changed_result))
save(fixture/'result.json',dict(passed=True,count=len(cases),cases=cases,policyFreezeSha256=sha(fixture/'freeze.json'),scope='Authored timestamp faults, actual old-adapter branch demonstration, retained-codec AV mux/decode and declared-window verification; no GTA/OBS/audio endpoints'))
print('PASS '+str(len(cases))+' capture-timestamp and retained-codec cases')
