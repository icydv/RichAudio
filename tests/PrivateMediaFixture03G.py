"""Small authored lossless AV faults, original marker retained read-only."""
from pathlib import Path
import math,wave,struct
from fractions import Fraction
from Shared import ROOT,PACKAGE,tc,load
def build():
    import sys
    sys.path.insert(0,str(ROOT/'tools/native-control/private-profile03c'));legacy=load('fixture_codec03c',ROOT/'tools/native-control/private-profile03c/Extract-Capture03C.py');av=legacy.dependencies()
    directory=PACKAGE/'fixtures/authored-media';directory.mkdir(parents=True,exist_ok=True)
    if (directory/'freeze.json').exists():return directory
    original=ROOT/'.local/gate-a-shvdne-private-01/resource/original-marker/marker.wav';pin=tc.pin(original)
    with wave.open(str(original),'rb') as f:assert f.getnchannels()==1 and f.getframerate()==48000;marker=list(struct.unpack('<'+'h'*f.getnframes(),f.readframes(f.getnframes())))
    for kind in ['plain','full-A','full-B','fragment-A','video-gap','audio-gap']:
        target=directory/(kind+'.mkv')
        with av.open(str(target),'w') as out:
            video=out.add_stream('ffv1',rate=30);video.width=64;video.height=64;video.pix_fmt='yuv420p'
            audio=out.add_stream('pcm_s16le',rate=48000);audio.layout='stereo'
            for start in range(0,48000*30,1024):
                count=min(1024,48000*30-start);data=bytearray(count*4)
                for i in range(count):
                    n=start+i;value=round(.035*32767*math.sin(2*math.pi*310*n/48000));offset=(18 if kind=='full-B' else 3)*48000+12000;position=n-offset
                    if kind in ['full-A','full-B','fragment-A'] and 0<=position<len(marker):value=marker[position] if kind!='fragment-A' or position<round((.16+15*.08)*48000) else 0
                    struct.pack_into('<hh',data,i*4,value,value)
                frame=av.AudioFrame(format='s16',layout='stereo',samples=count);frame.sample_rate=48000;frame.pts=start+(4800 if kind=='audio-gap' and start>=240000 else 0);frame.time_base=Fraction(1,48000);frame.planes[0].update(data)
                for packet in audio.encode(frame):out.mux(packet)
            for packet in audio.encode(None):out.mux(packet)
            for i in range(900):
                frame=av.VideoFrame(64,64,'yuv420p');frame.pts=i+(10 if kind=='video-gap' and i>=150 else 0);frame.time_base=Fraction(1,30)
                for j,plane in enumerate(frame.planes):plane.update(bytes([64+i%64 if j==0 else 128])*plane.buffer_size)
                for packet in video.encode(frame):out.mux(packet)
            for packet in video.encode(None):out.mux(packet)
    assert tc.pin(original)==pin
    tc.save(directory/'freeze.json',dict(originalMarker=pin,files=[tc.pin(x) for x in directory.glob('*.mkv')],detectorChanged=False,scope='Authored AV only; no playback, capture or game proof'))
    return directory
