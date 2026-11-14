"""Focused local AV regression checks. No game, capture, playback or policy bypass."""
from pathlib import Path
import argparse, importlib.util, json, math, os, shutil, struct, subprocess, sys, uuid
sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('capture05', HERE/'Extract-Capture05.py')
h = importlib.util.module_from_spec(spec); spec.loader.exec_module(h)

def run(retained_repo, output_root):
    root = output_root.resolve() / ('run-' + uuid.uuid4().hex)
    root.mkdir(parents=True)
    manifest = retained_repo/'.local/gate-a-shvdne-private-03b/capture-dependencies.json'
    manifest_sha = '4656785f5833c9f26a5dc4218b8e6e3b3e88008ae46f816c1fa516512671446b'
    av = h.dependencies(manifest, manifest_sha)
    fixtures = retained_repo/'.local/gate-a-shvdne-private-03g/fixtures/authored-media'
    plain_bytes = (fixtures/'plain.mkv').read_bytes()
    tests = []
    def record(name, ok, detail=None):
        tests.append(dict(name=name, passed=bool(ok), detail=detail))
        print(name + ': ' + ('PASS' if ok else 'FAIL'), flush=True)
        assert ok, (name, detail)
    def extract(name, source, start=5, duration=10, active_start=0, finalized=False):
        return h.extract(source, root/(name+'.wav'), start, duration, active_start, root, manifest, manifest_sha, finalized)
    def rejected(name, source, **kwargs):
        result = extract(name, source, **kwargs)
        record(name, not result['containerContinuityPassed'] and not (root/(name+'.wav')).exists(), result.get('error', result.get('timeline',{}).get('reasons')))
        return result
    source = root/'plain.mkv'; source.write_bytes(plain_bytes)
    positive = extract('plain-finalized', source, finalized=True)
    record('plain-finalized', positive['containerContinuityPassed'], positive.get('error'))
    def remux(path, audio_shift=0, width=None):
        with av.open(str(source)) as inp, av.open(str(path),'w') as out:
            mapping={s.index:out.add_stream_from_template(s) for s in inp.streams}
            if width is not None:mapping[0].codec_context.width=width
            for packet in inp.demux():
                if packet.dts is None:continue
                if packet.stream.type=='audio' and audio_shift:
                    ticks=round(audio_shift/float(packet.time_base));packet.pts+=ticks;packet.dts+=ticks
                packet.stream=mapping[packet.stream.index];out.mux(packet)
    shifted=root/'positive-first-audio-pts.mkv';remux(shifted,audio_shift=.05)
    shift_result=rejected('nonzero-first-audio-pts',shifted,finalized=True)
    record('nonzero-pts-specific-refusal','First audio PTS must be zero' in shift_result.get('error',''))
    wide=root/'oversized-header.mkv';remux(wide,width=1921)
    wide_result=rejected('oversized-video-header',wide,finalized=True)
    record('oversized-header-specific-refusal','Video header dimensions exceed' in wide_result.get('error',''))
    for name, start, duration, active in [('before-active',4,10,5),('after-active',590.001,10,0),('preroll-over',65,10,60.001),('duration-over',5,11,0),('nonfinite',math.nan,10,0)]:
        rejected(name, source, start=start, duration=duration, active_start=active)
    h.check_window(650,10,60); h.check_recording_duration(780)
    record('inclusive-exact-boundaries', True)
    duration_at = plain_bytes.find(b'\x44\x89\x88')
    assert duration_at >= 0 and struct.unpack('>d',plain_bytes[duration_at+3:duration_at+11])[0] == 30000
    over = root/'over-total.mkv'; data=bytearray(plain_bytes); data[duration_at+3:duration_at+11]=struct.pack('>d',780001); over.write_bytes(data)
    rejected('total-over-limit', over, finalized=True)
    closure = root/'over-closure.mkv'; data=bytearray(plain_bytes); data[duration_at+3:duration_at+11]=struct.pack('>d',720001); closure.write_bytes(data)
    rejected('actual-preroll-closure-limit', closure, finalized=True)
    tail = root/'false-finalized-duration.mkv'; data=bytearray(plain_bytes); data[duration_at+3:duration_at+11]=struct.pack('>d',40000); tail.write_bytes(data)
    rejected('finalized-tail-truncation', tail, finalized=True)
    huge = root/'over-byte-bound.mkv'
    with huge.open('xb') as f: f.truncate(h.MAX_BYTES+1)
    rejected('byte-bound', huge)
    for name in ['audio-gap','video-gap']:
        path=root/(name+'.mkv'); shutil.copyfile(fixtures/(name+'.mkv'),path)
        rejected(name,path,finalized=True)
    growing=root/'growing.mkv'; cut=int(len(plain_bytes)*.75); growing.write_bytes(plain_bytes[:cut])
    original_prefix=h.prefix_hash
    def append(file,count):
        with growing.open('ab') as out:out.write(plain_bytes[cut:])
        h.prefix_hash=original_prefix
        return original_prefix(file,count)
    h.prefix_hash=append
    try: partial=extract('growing-completed-window',growing)
    finally:h.prefix_hash=original_prefix
    growing_final=root/'growing-finalized.mkv';growing_final.write_bytes(plain_bytes)
    def append_final(file,count):
        with growing_final.open('ab') as out:out.write(b'\0')
        return original_prefix(file,count)
    h.prefix_hash=append_final
    try:rejected('finalized-source-growth',growing_final,finalized=True)
    finally:h.prefix_hash=original_prefix
    record('growing-completed-window',partial['containerContinuityPassed'],partial.get('error'))
    record('growing-final-pcm-equal',partial['pcmSha256']==positive['pcmSha256'])
    truncated=root/'incomplete.mkv';truncated.write_bytes(plain_bytes[:int(len(plain_bytes)*.2)])
    rejected('incomplete-window',truncated)
    corrupted=root/'corrupt.mkv';data=bytearray(plain_bytes)
    with av.open(str(source)) as c:
        packet=next(p for p in c.demux(video=0) if p.size>100)
        position,size=packet.pos,packet.size
    # Matroska's four-byte block header precedes this retained FFV1 payload.
    assert data[position+4:position+4+size] == bytes(packet)
    data[position+4:position+4+size]=b'\0'*size;corrupted.write_bytes(data)
    rejected('corrupt-packet',corrupted,finalized=True)
    changed=root/'changed.mkv';changed.write_bytes(plain_bytes)
    def alter(file,count):
        with changed.open('r+b') as out:out.seek(100);out.write(bytes([plain_bytes[100]^1]))
        return original_prefix(file,count)
    h.prefix_hash=alter
    try:rejected('changed-prefix',changed)
    finally:h.prefix_hash=original_prefix
    replaced=root/'replaced.mkv';replaced.write_bytes(plain_bytes);original_validate=h.validate
    def replace_after_decode(*args,**kwargs):
        replaced.rename(root/'replaced-original.mkv');replaced.write_bytes(plain_bytes)
        return original_validate(*args,**kwargs)
    h.validate=replace_after_decode
    try:rejected('changed-source-identity',replaced,finalized=True)
    finally:h.validate=original_validate
    linked=root/'hardlink.mkv';os.link(source,linked)
    rejected('hardlinked-source',linked)
    try:h.checked_path(root.parent/'outside.mkv',root)
    except AssertionError:record('outside-run-root',True)
    else:record('outside-run-root',False)
    directory=root/'junction-target';directory.mkdir();shutil.copyfile(fixtures/'plain.mkv',directory/'plain.mkv')
    junction=root/'junction'
    ps="New-Item -ItemType Junction -Path '"+str(junction).replace("'","''")+"' -Target '"+str(directory).replace("'","''")+"' | Out-Null"
    subprocess.run(['powershell.exe','-NoProfile','-NonInteractive','-Command',ps],check=True,capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW)
    try:h.checked_path(junction/'plain.mkv',root)
    except AssertionError:record('reparse-source-path',True)
    else:record('reparse-source-path',False)
    # The retained long recording is an actual finalized input, copied without modification.
    old_run=retained_repo/'.local/native-suppression-01/execution-04'
    actual_original=old_run/'capture/2026-11-14 02-38-20.mkv'
    original_sha='5af08092c7de40b7b82108dd02d8fe527b809301e818092854ef67e916c0771c'
    assert h.sha(actual_original)==original_sha
    actual=root/'actual-624.100.mkv';shutil.copyfile(actual_original,actual)
    actual_result=extract('actual-preserve',actual,start=398.1535026,active_start=29.7325824,finalized=True)
    historical=json.loads((old_run/'analysis/preserve.receipt.json').read_text())
    final_timeline=json.loads((old_run/'analysis/capture-finalized-timeline.json').read_text())
    record('actual-long-container-admitted-new-policy',actual_result['containerContinuityPassed'],actual_result.get('error'))
    record('actual-preserve-pcm-unchanged',actual_result['pcmSha256']==historical['pcmSha256'])
    record('actual-full-timestamps-unchanged',actual_result['audioTimeline']==final_timeline['audio'] and actual_result['videoTimeline']==final_timeline['video'])
    record('actual-source-unchanged',h.sha(actual_original)==h.sha(actual)==original_sha)
    old_rejection=old_run/'analysis/B-stock-finalized-helper-attempt.receipt.json'
    record('historical-rejection-preserved',h.sha(old_rejection)=='3c0e9ca8a5af278fba1d2f010efc04e4b5bed66d6d62cc623f751dc919299bc7')
    result=dict(schema='NativeSuppression05-capture-tests-01',passed=all(t['passed'] for t in tests),tests=tests,root=str(root),
                helperSha256=h.sha(HERE/'Extract-Capture05.py'),testSha256=h.sha(Path(__file__)),timelineSourceSha256=h.sha(h.TIMELINE),
                timelineLfSha256=h.TIMELINE_SHA,dependencyManifest=str(manifest),dependencyManifestSha256=manifest_sha,
                fixtures=[dict(path=str(fixtures/(n+'.mkv')),sha256=h.sha(fixtures/(n+'.mkv'))) for n in ['plain','audio-gap','video-gap']],
                actualCaptureSha256=original_sha,actualCaptureSeconds=actual_result['containerDurationSeconds'],
                fixtureBypassUsed=False,calibrationPerformed=False,scope='Offline authored and retained-media regression only; no live admission or resource-resolution claim.')
    (root/'RESULT.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ['tests','fixtures']},indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--retained-repo',type=Path,required=True);p.add_argument('--out',type=Path,required=True)
    args=p.parse_args();run(args.retained_repo,args.out)
