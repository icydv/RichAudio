"""Finalized evidence verification only; never changes a historical verdict."""
from pathlib import Path
import importlib.util,json,sys,wave,hashlib
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('cap07',HERE/'Capture08.py');h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)

def finalize(plan_path):
    p=json.loads(Path(plan_path).read_text(encoding='utf-8-sig'));root=Path(p['Root']);origin=json.loads((root/'recording-origin.json').read_text());source=h.old.checked_path(Path(origin['Source']),root)
    out=root/'finalized-review.json';assert not out.exists(),'one immutable final review receipt';result=dict(schema='NativeSuppression08FinalReview',Passed=False,Source=str(source),Sha256=h.old.sha(source),Bytes=source.stat().st_size,HistoricalVerdictsRewritten=False)
    try:
        assert source.stat().st_size<=h.old.MAX_BYTES and source.stat().st_nlink==1
        av=h.old.dependencies(p['Dependencies']['path'],p['Dependencies']['sha256']);audio,video,pcm,_,total=h.decode(source,av)
        accepted=[];partial=[]
        for receipt in (root/'analysis').glob('*/receipt.json'):
            r=json.loads(receipt.read_text())
            if r['Phase']=='recorder-readiness':continue
            if r['Passed']:accepted.append((receipt,r))
            else:partial.append(dict(path=str(receipt),sha256=h.old.sha(receipt),error=r.get('Error')))
        ends=[w['StartSeconds']+10 for _,r in accepted for w in r['Windows']]
        end=h.end_contract(audio,video,total,ends);result['EndContract']=end;assert end['passed'],'final07 track-end contract failed'
        state=json.loads((root/'operator/state.json').read_text());active=(state['ActiveStart']-origin['OriginQpc'])/origin['Frequency'];h.old.check_recording_duration(total)
        assert 0<=active<=60 and total<=active+720,'recording duration or pre-roll bound'
        assert all(f['pts']+f['duration']<=active+720+1e-9 for f in audio+video),'decoded closure bound'
        comparisons=[]
        for receipt,r in accepted:
            prefix=Path(r['Snapshot']['snapshot']);assert h.old.sha(prefix)==r['Snapshot']['snapshotSha256'],'immutable live prefix changed'
            timeline=json.loads(Path(r['TimelinePath']).read_text());assert h.old.sha(Path(r['TimelinePath']))==r['TimelineSha256'],'live timeline changed'
            assert timeline['audio']==audio[:len(timeline['audio'])],'live audio timestamp prefix changed'
            for w in r['Windows']:
                start=w['StartSeconds'];h.old.check_window(start,10,active);assert h.old.validate(audio,video,start,10,fixture=False)['passed'],'final timestamp policy failed'
                used=lambda xs:[f for f in xs if f['pts']+f['duration']<=start+10]
                assert used(timeline['video'])==used(video),'used video timestamp mismatch'
                part=pcm[round(start*48000)*4:round((start+10)*48000)*4];assert len(part)==1920000 and hashlib.sha256(part).hexdigest()==w['PcmSha256'],'fixed PCM changed'
                with wave.open(w['Wav'],'rb') as f:assert f.readframes(480000)==part,'retained WAV changed'
                assert h.old.sha(Path(w['Wav']))==w['Sha256']
                comparisons.append(dict(Observation=r['Observation'],Phase=r['Phase'],Window=w['Name'],PcmExactlyEqual=True,UsedVideoTimestampsExactlyEqual=True,WholeLiveVideoPrefixExactlyEqual=timeline['video']==video[:len(timeline['video'])],ReceiptSha256=h.old.sha(receipt)))
        assert h.old.sha(source)==result['Sha256'],'final source changed during review'
        result.update(Passed=True,ContainerDurationSeconds=total,ActiveStartSeconds=active,Comparisons=comparisons,PartialEvidence=partial,Qualification='Technical media integrity only; listening, operating context and private selection remain separate')
    except Exception as e:result['Error']=type(e).__name__+': '+str(e)
    out.write_text(json.dumps(result,indent=2));print(json.dumps({'Passed':result['Passed'],'Receipt':str(out),'Error':result.get('Error')}));return result
if __name__=='__main__':sys.exit(0 if finalize(sys.argv[1])['Passed'] else 1)
