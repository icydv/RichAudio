"""Authored muxes and retained real OBS inputs; no OBS or GTA launch."""
from pathlib import Path
import importlib.util,json,shutil,struct,sys
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('cap07',Path(__file__).with_name('Capture08.py'));h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
RETAINED=Path(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01');manifest=RETAINED/'.local/gate-a-shvdne-private-03b/capture-dependencies.json';manifest_sha='4656785f5833c9f26a5dc4218b8e6e3b3e88008ae46f816c1fa516512671446b'

def run(root):
    root=Path(root).absolute();assert not root.exists();root.mkdir(parents=True);tests=[]
    def check(name,b):tests.append(dict(name=name,passed=bool(b)));print(('PASS ' if b else 'FAIL ')+name,flush=True);assert b,name
    def plan(name,src,start=5,active=0):
        p=dict(Root=str(root),Output=str(root/name),Source=str(src),Session='fixture',Observation=name,Phase='fixture',Generation='fixture',Recording='fixture',Profile='NONE',ActiveStartSeconds=active,Windows=[dict(Name='fixed',StartSeconds=start)],Dependencies=str(manifest),DependenciesSha256=manifest_sha)
        path=root/(name+'-plan.json');path.write_text(json.dumps(p));return path
    # This tests the NEW explicitly bounded07 end contract, never the historical verdict.
    for skew,expected in [(0,True),(.05,True),(.123667,True),(.25,True),(.250001,False),(.5,False)]:
        a=[dict(pts=0,duration=30-skew)];v=[dict(pts=0,duration=30)]
        check('explicit shutdown tail '+str(skew),h.end_contract(a,v,30,[15])['passed']==expected)
    check('selected tail never tolerated',not h.end_contract([dict(pts=0,duration=29.9)],[dict(pts=0,duration=30)],30,[30])['passed'])
    check('container longest track mismatch refused',not h.end_contract([dict(pts=0,duration=30)],[dict(pts=0,duration=30)],31,[15])['passed'])
    av=h.old.dependencies(manifest,manifest_sha);fixtures=RETAINED/'.local/gate-a-shvdne-private-03g/fixtures/authored-media'
    for name,passed in [('plain',True),('audio-gap',False),('video-gap',False)]:
        src=root/(name+'.mkv');shutil.copyfile(fixtures/(name+'.mkv'),src)
        result=h.bundle(plan(name+'-bundle',src),True);check('real mux '+name,result['Passed']==passed)
    src=root/'plain.mkv'
    for name,shift,drop,expected,start in [('mux-tail-small',0,.15,True,5),('mux-tail-large',0,.5,False,5),('selected-window-tail',0,.15,False,20),('nonzero-first-audio',.05,0,False,5)]:
        dest=root/(name+'.mkv')
        with av.open(str(src)) as inp,av.open(str(dest),'w') as out:
            streams={s.index:out.add_stream_from_template(s) for s in inp.streams}
            for packet in inp.demux():
                if packet.dts is None:continue
                if packet.stream.type=='audio':
                    if drop and float(packet.pts*packet.time_base)>=30-drop:continue
                    if shift:
                        delta=round(shift/float(packet.time_base));packet.pts+=delta;packet.dts+=delta
                packet.stream=streams[packet.stream.index];out.mux(packet)
        result=h.bundle(plan(name+'-bundle',dest,start),True);check(name,result['Passed']==expected)
    source=RETAINED/'.local/native-suppression-01/execution-06/capture/2026-11-14 23-05-12.mkv'
    old_failed=RETAINED/'.local/native-suppression-01/execution-06/analysis/B-post-finalized.receipt.json';failed_sha=h.old.sha(old_failed)
    assert h.old.sha(source)=='7120b368ff1cac89e162bff031fa26cf1f41ecd1ceeaefba8c511df7780d88bf'
    copied=root/'actual-06.mkv';shutil.copyfile(source,copied)
    result=h.bundle(plan('actual06-new07-contract-only',copied,219.6248446,9.1657577),True)
    check('actual OBS selected interval admitted under NEW07 contract',result['Passed'])
    check('actual OBS 123.667ms closure discrepancy explicitly retained',abs(result['Finalization']['trackEndSkewSeconds']-.1236666666667)<1e-6)
    original=json.loads((source.parent.parent/'analysis/A-stock-live.receipt.json').read_text());check('actual PCM unchanged',result['Windows'][0]['PcmSha256']==original['pcmSha256'])
    check('historical06 finalized refusal unchanged',h.old.sha(old_failed)==failed_sha and not json.loads(old_failed.read_text())['containerContinuityPassed'])
    check('raw historical recording unchanged',h.old.sha(source)==h.old.sha(copied))
    # Exercise the same finalized verifier the live operator will invoke.
    final_root=root/'finalizer-fixture';(final_root/'analysis').mkdir(parents=True);(final_root/'operator').mkdir()
    final_source=final_root/'source.mkv';shutil.copyfile(src,final_source)
    bp=dict(Root=str(final_root),Output=str(final_root/'analysis/fixture-observation'),Source=str(final_source),Session='fixture',Observation='fixture-observation',Phase='baseline',Generation='fixture',Recording='fixture',Profile='BATI',ActiveStartSeconds=0,Windows=[dict(Name='steady',StartSeconds=5)],Dependencies=str(manifest),DependenciesSha256=manifest_sha)
    bundle_path=final_root/'bundle.json';bundle_path.write_text(json.dumps(bp));check('finalizer input fixed bundle',h.bundle(bundle_path)['Passed'])
    (final_root/'recording-origin.json').write_text(json.dumps(dict(Source=str(final_source),OriginQpc=1000,Frequency=1000)))
    (final_root/'operator/state.json').write_text(json.dumps(dict(ActiveStart=1000,Finished=True)))
    fp=final_root/'plan.json';fp.write_text(json.dumps(dict(Root=str(final_root),Dependencies=dict(path=str(manifest),sha256=manifest_sha))))
    fs=importlib.util.spec_from_file_location('final07',Path(__file__).with_name('Finalize08.py'));final=importlib.util.module_from_spec(fs);fs.loader.exec_module(final)
    finalized=final.finalize(fp);check('actual finalized verifier reproduces fixed PCM/timestamps',finalized['Passed'] and len(finalized['Comparisons'])==1 and finalized['Comparisons'][0]['PcmExactlyEqual'])
    (root/'result.json').write_text(json.dumps(dict(schema='NativeSuppression08CaptureTests',passed=True,tests=tests,helperSha256=h.old.sha(Path(h.__file__)),testSha256=h.old.sha(Path(__file__)),historical06RefusalSha256=failed_sha,liveQualified=False,gameLaunched=False,obsLaunched=False),indent=2))

if __name__=='__main__':run(sys.argv[1])
