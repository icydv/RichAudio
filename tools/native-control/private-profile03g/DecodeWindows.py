"""One decode per leased source; unchanged03C PCM slicing and timeline policy."""
from pathlib import Path
import os,ctypes,msvcrt,hashlib,wave,math,json,time,sys
from Shared import tc,ROOT,load
sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03c'))
legacy=load('decode_reference03c',ROOT/'tools/native-control/private-profile03c/Extract-Capture03C.py')
VIDEO_THREADS=4
def qpc():
    n=ctypes.c_longlong();assert ctypes.windll.kernel32.QueryPerformanceCounter(ctypes.byref(n));return n.value
def frequency():
    n=ctypes.c_longlong();assert ctypes.windll.kernel32.QueryPerformanceFrequency(ctypes.byref(n));return n.value
def no_links(path):
    for p in [Path(path),*Path(path).parents]:
        if p.exists():assert not p.lstat().st_file_attributes&0x400,'Reparse evidence path refused'
def bounded(path,allowed):
    p=Path(path).absolute();no_links(p);assert '..' not in p.parts,'Parent traversal refused'
    p=p.resolve();assert p.is_relative_to(Path(allowed).resolve()),'Evidence outside current attempt';return p
class Snapshot:
    def __init__(self,path,allowed,expected=None):
        path=bounded(path,allowed)
        k=ctypes.WinDLL('kernel32',use_last_error=True);fn=k.CreateFileW;fn.argtypes=[ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p,ctypes.c_uint,ctypes.c_uint,ctypes.c_void_p];fn.restype=ctypes.c_void_p
        handle=fn(str(path),0x80000000,1,None,3,0x08000000,None)
        if handle in [None,ctypes.c_void_p(-1).value]:raise OSError(ctypes.get_last_error(),'Evidence not finalized or cannot acquire immutable read lease',str(path))
        self.file=os.fdopen(msvcrt.open_osfhandle(handle,os.O_RDONLY|os.O_BINARY),'rb');self.path=path
        try:
            self.identity=tc.identity(path);self.bytes=os.fstat(self.file.fileno()).st_size
            assert os.fstat(self.file.fileno()).st_nlink==1 and 0<self.bytes<=536870912,'Evidence size or hardlink refused'
            self.sha256=self.hash();self.description=dict(path=str(path),bytes=self.bytes,sha256=self.sha256,**self.identity)
            if expected:assert all(self.description[k]==v for k,v in expected.items()),'Source snapshot changed before use'
        except BaseException:self.close();raise
    def hash(self):
        self.file.seek(0);h=hashlib.sha256()
        for b in iter(lambda:self.file.read(1048576),b''):h.update(b)
        return h.hexdigest()
    def unchanged(self):
        no_links(self.path)
        return self.identity==tc.identity(self.path) and self.bytes==os.fstat(self.file.fileno()).st_size and self.hash()==self.sha256
    def close(self):self.file.close()
def save(path,value):
    with Path(path).open('x',encoding='utf-8') as f:json.dump(value,f,indent=2);f.flush();os.fsync(f.fileno())
def decode(snap,windows,output,check):
    av=legacy.dependencies();blocks=[];frames=0;audio=[];video=[];check()
    with av.open(str(snap.path)) as container:
        assert container.duration is not None and 0<container.duration<=90000000,'At most90seconds required'
        streams=[dict(type=x.type,codec=x.codec_context.name,timeBase=str(x.time_base)) for x in container.streams]
        audios=[x for x in container.streams if x.type=='audio'];videos=[x for x in container.streams if x.type=='video']
        assert len(audios)==1 and len(videos)==1,'Exactly one audio/video stream required'
        videos[0].codec_context.thread_count=VIDEO_THREADS;videos[0].thread_type='AUTO'
        assert audios[0].codec_context.sample_rate==48000 and len(audios[0].codec_context.layout.channels)==2
        resampler=av.AudioResampler(format='s16',layout='stereo',rate=48000)
        for packet in container.demux():
            check()
            for frame in packet.decode():
                if isinstance(frame,av.AudioFrame):
                    audio.append(dict(pts=float(frame.pts*frame.time_base) if frame.pts is not None and frame.time_base is not None else None,duration=frame.samples/frame.sample_rate))
                    for converted in resampler.resample(frame):blocks.append(bytes(converted.planes[0])[:converted.samples*4]);frames+=converted.samples
                elif isinstance(frame,av.VideoFrame):
                    t=float(frame.pts*frame.time_base) if frame.pts is not None and frame.time_base is not None else None
                    length=float(frame.duration*frame.time_base) if frame.duration and frame.time_base else (float(1/videos[0].average_rate) if videos and videos[0].average_rate else None)
                    video.append(dict(pts=t,duration=length))
        for converted in resampler.resample(None):blocks.append(bytes(converted.planes[0])[:converted.samples*4]);frames+=converted.samples
    check();assert snap.unchanged(),'Source changed during decode';data=b''.join(blocks);result={}
    for role,w in windows.items():
        start,duration=w['start'],w['duration'];assert math.isfinite(start) and start>=0 and math.isfinite(duration) and 2.8<=duration<=30
        timeline=legacy.validate(audio,video,start,duration,False);assert timeline['passed'],timeline['reasons']
        first=round(start*48000);count=round(duration*48000);assert first+count<=frames,'Declared window exceeds decoded audio'
        target=Path(output)/(role+'.wav')
        with target.open('xb') as file:
            with wave.open(file,'wb') as wav:wav.setnchannels(2);wav.setsampwidth(2);wav.setframerate(48000);wav.writeframes(data[first*4:(first+count)*4])
            file.flush();os.fsync(file.fileno())
        check();item=dict(role=role,source=snap.description,start=start,duration=duration,startSample=first,frames=count,output=tc.pin(target),timeline=timeline,streams=streams,sourceUnchangedDuringDecode=True,gainApplied=False,pitchFit=False)
        save(target.with_suffix('.receipt.json'),item);result[role]=item
    return result
