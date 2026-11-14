"""Bounded completed-window extraction; no capture, playback, retiming or classification."""
from pathlib import Path
import argparse, hashlib, importlib.util, json, math, os, sys, wave
sys.dont_write_bytecode = True
REPO = Path(__file__).resolve().parents[3]
TIMELINE = REPO / 'tools/native-control/private-profile03c/CaptureTimeline03C.py'
TIMELINE_SHA = 'f13110314854fc91d35863cbe1a3d26ae76647bcf0fe50bcb767cc823675a742'
MAX_BYTES = 536870912
MAX_PREROLL_SECONDS = 60
MAX_ACTIVE_SECONDS = 600
MAX_CLOSURE_SECONDS = 120
MAX_RECORDING_SECONDS = MAX_PREROLL_SECONDS + MAX_ACTIVE_SECONDS + MAX_CLOSURE_SECONDS

def sha(path):
    digest = hashlib.sha256()
    with Path(path).open('rb') as file:
        for block in iter(lambda: file.read(1048576), b''): digest.update(block)
    return digest.hexdigest()

assert hashlib.sha256(TIMELINE.read_bytes().replace(b'\r\n', b'\n')).hexdigest() == TIMELINE_SHA, 'Frozen timestamp policy changed'
spec = importlib.util.spec_from_file_location('capture_timeline03c', TIMELINE)
timeline_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(timeline_module)
validate = timeline_module.validate

def dependencies(manifest, expected_sha):
    manifest = Path(manifest)
    assert sha(manifest) == expected_sha, 'Dependency manifest changed'
    data = json.loads(manifest.read_text(encoding='utf-8-sig'))
    for item in data['retainedPyAvFiles']:
        assert sha(Path(item['path'])) == item['sha256'], 'Retained decoder dependency changed'
    root = next(Path(x['path']).parent for x in data['retainedPyAvFiles'] if Path(x['path']).name == 'METADATA').parent
    while not (root / 'av').is_dir():
        assert root != root.parent, 'Retained decoder package absent'
        root = root.parent
    sys.path.insert(0, str(root))
    import av
    return av

def checked_path(path, root):
    path, root = Path(path).absolute(), Path(root).absolute()
    for part in [path, *path.parents, root, *root.parents]:
        if part.exists(): assert not part.lstat().st_file_attributes & 0x400, 'Reparse path refused'
    path, root = path.resolve(), root.resolve()
    assert path.is_relative_to(root), 'Path outside declared run root'
    return path

def identity(stat):
    return stat.st_dev, stat.st_ino

def prefix_hash(file, length):
    file.seek(0)
    digest = hashlib.sha256()
    while length:
        block = file.read(min(1048576, length))
        assert block, 'Source prefix became shorter'
        digest.update(block)
        length -= len(block)
    return digest.hexdigest()

def check_window(start, duration, active_start):
    assert all(math.isfinite(x) for x in [start, duration, active_start]), 'Nonfinite window timing'
    assert 0 <= active_start <= MAX_PREROLL_SECONDS, 'Active start exceeds admitted pre-roll'
    assert duration == 10, 'Exactly ten seconds required'
    assert start >= active_start and start + duration <= active_start + MAX_ACTIVE_SECONDS, 'Window outside active experiment'

def check_recording_duration(seconds):
    assert seconds is not None and math.isfinite(seconds) and 0 < seconds <= MAX_RECORDING_SECONDS, 'Recording exceeds admitted total duration'

def snapshot_prefix(source, snapshot, finalized):
    with source.open('rb') as file:
        before = os.fstat(file.fileno())
        assert 0 < before.st_size <= MAX_BYTES, 'Capture size outside bounded scope'
        assert before.st_nlink == 1, 'Hardlinked source refused'
        remaining, digest = before.st_size, hashlib.sha256()
        with snapshot.open('xb') as copied:
            while remaining:
                block = file.read(min(1048576, remaining))
                assert block, 'Source shortened during copy'
                copied.write(block); digest.update(block); remaining -= len(block)
            copied.flush(); os.fsync(copied.fileno())
        copied_sha = digest.hexdigest()
        assert prefix_hash(file, before.st_size) == copied_sha, 'Source prefix changed during snapshot'
        after, current = os.fstat(file.fileno()), source.stat()
        assert identity(before) == identity(after) == identity(current), 'Source identity changed'
        assert before.st_size <= after.st_size <= MAX_BYTES, 'Source shrank or exceeded bound'
        if finalized: assert before.st_size == after.st_size, 'Finalized source grew'
        assert sha(snapshot) == copied_sha, 'Snapshot changed'
    return dict(source=str(source), snapshot=str(snapshot), sourceIdentity=list(identity(before)), copiedBytes=before.st_size,
                sourceBytesAfter=after.st_size, snapshotSha256=copied_sha, sourcePrefixRechecked=True,
                sourceAppendPermitted=not finalized, captureState='finalized source' if finalized else 'growing-source immutable prefix')

def extract(source, target, start, duration, active_start, root, dependency_manifest, dependency_sha, finalized=False):
    source, target = checked_path(source, root), checked_path(target, root)
    assert source.suffix.lower() == '.mkv' and target.suffix.lower() == '.wav'
    snapshot, receipt = target.with_suffix('.snapshot.mkv'), target.with_suffix('.receipt.json')
    assert not any(p.exists() for p in [target, snapshot, receipt]), 'Output already exists'
    target.parent.mkdir(parents=True, exist_ok=True)
    result = dict(schema='NativeSuppression05-capture-window-01', output=str(target), startSeconds=start, durationSeconds=duration,
                  activeStartSeconds=active_start, activeEndSeconds=active_start + MAX_ACTIVE_SECONDS,
                  bounds=dict(preRollSeconds=MAX_PREROLL_SECONDS, activeSeconds=MAX_ACTIVE_SECONDS, closureSeconds=MAX_CLOSURE_SECONDS,
                              totalRecordingSeconds=MAX_RECORDING_SECONDS, bytes=MAX_BYTES),
                  finalized=finalized, gainApplied=False, pitchFit=False, fixture=False, containerContinuityPassed=False,
                  timelinePolicySourceSha256=sha(TIMELINE), timelinePolicyLfSha256=TIMELINE_SHA, helperSha256=sha(Path(__file__)),
                  dependencyManifest=str(dependency_manifest), dependencyManifestSha256=dependency_sha,
                  scope='Fixed completed ten-second interval, full available decoded timestamp checks and immutable source identity. Active-start offset must be bound to the recording-start and F5 journal anchors. Context, engine state and attribution remain separate; no audio classification.')
    try:
        check_window(start, duration, active_start)
        result['snapshot'] = copied = snapshot_prefix(source, snapshot, finalized)
        av = dependencies(dependency_manifest, dependency_sha)
        audio, video, blocks, frames = [], [], [], 0
        with av.open(str(snapshot)) as container:
            total = None if container.duration is None else container.duration / 1000000
            if total is not None:
                check_recording_duration(total)
                assert total <= active_start + MAX_ACTIVE_SECONDS + MAX_CLOSURE_SECONDS, 'Recording exceeds active start plus closure allowance'
            if finalized: assert total is not None, 'Finalized recording lacks duration'
            assert len(container.streams) == 2 and len(container.streams.audio) == len(container.streams.video) == 1, 'One audio and video stream required'
            a, v = container.streams.audio[0], container.streams.video[0]
            assert a.codec_context.sample_rate == 48000 and len(a.codec_context.layout.channels) == 2, '48 kHz stereo required'
            assert 0 < v.codec_context.width <= 1920 and 0 < v.codec_context.height <= 1080, 'Video header dimensions exceed 1920x1080'
            v.codec_context.thread_count = 4; v.codec_context.thread_type = 'AUTO'
            for stream in [a, v]: stream.codec_context.options = {'err_detect': 'explode+crccheck'}
            v.codec_context.options = {'err_detect': 'explode+crccheck', 'max_pixels': str(1920 * 1080)}
            result['streams'] = [dict(type=s.type, codec=s.codec_context.name, timeBase=str(s.time_base)) for s in container.streams]
            result['containerDurationSeconds'] = total
            resampler = av.AudioResampler(format='s16', layout='stereo', rate=48000)
            for packet in container.demux(a, v):
                assert not packet.is_corrupt, 'Corrupt packet'
                for frame in packet.decode():
                    assert not frame.is_corrupt, 'Corrupt decoded frame'
                    t = float(frame.pts * frame.time_base) if frame.pts is not None and frame.time_base is not None else None
                    if isinstance(frame, av.AudioFrame):
                        if not audio: assert t == 0, 'First audio PTS must be zero; fixed cuts cannot be retimed'
                        length = frame.samples / frame.sample_rate
                        audio.append(dict(pts=t, duration=length))
                        for converted in resampler.resample(frame):
                            blocks.append(bytes(converted.planes[0])[:converted.samples * 4]); frames += converted.samples
                            assert frames <= MAX_RECORDING_SECONDS * 48000, 'Decoded sample count exceeds recording bound'
                    elif isinstance(frame, av.VideoFrame):
                        assert 0 < frame.width <= 1920 and 0 < frame.height <= 1080, 'Decoded video dimensions exceed 1920x1080'
                        length = float(frame.duration * frame.time_base) if frame.duration and frame.time_base else float(1 / v.average_rate)
                        video.append(dict(pts=t, duration=length))
                        assert len(video) <= MAX_RECORDING_SECONDS * 120, 'Decoded video count exceeds safety bound'
                    else: raise AssertionError('Unexpected decoded frame')
                    assert t is not None and math.isfinite(t) and 0 <= t and t + length <= active_start + MAX_ACTIVE_SECONDS + MAX_CLOSURE_SECONDS + 1e-9, 'Decoded timestamps outside recording bound'
            for converted in resampler.resample(None):
                blocks.append(bytes(converted.planes[0])[:converted.samples * 4]); frames += converted.samples
                assert frames <= MAX_RECORDING_SECONDS * 48000, 'Flushed sample count exceeds recording bound'
        verdict = validate(audio, video, start, duration, fixture=False)
        first, count = round(start * 48000), round(duration * 48000)
        if first + count > frames:
            verdict['passed'] = False; verdict['reasons'].append('declared-window-exceeds-decoded-audio')
        if not audio or audio[-1]['pts'] + audio[-1]['duration'] < audio[0]['pts'] + start + duration - 1e-9:
            verdict['passed'] = False; verdict['reasons'].append('audio-timestamps-do-not-cover-declared-window')
        if finalized and audio and video:
            # Muxed audio can finish before the final video frame, as in the retained OBS file.
            tail_tolerance = timeline_module.POLICY['videoGapSeconds'] + max(x['duration'] for x in audio)
            assert audio[-1]['pts'] + audio[-1]['duration'] >= total - tail_tolerance - 1e-9, 'Finalized audio truncated before container end'
            assert video[-1]['pts'] + video[-1]['duration'] >= total - timeline_module.POLICY['roundingToleranceSeconds'], 'Finalized video truncated before container end'
        assert snapshot.stat().st_size == copied['copiedBytes'] and sha(snapshot) == copied['snapshotSha256'], 'Snapshot changed during decode'
        checked_path(source, root)
        with source.open('rb') as file:
            current = os.fstat(file.fileno())
            assert list(identity(current)) == copied['sourceIdentity'] and identity(current) == identity(source.stat()), 'Source identity changed during decode'
            assert current.st_nlink == 1 and copied['copiedBytes'] <= current.st_size <= MAX_BYTES, 'Source size or link count changed'
            if finalized: assert current.st_size == copied['copiedBytes'], 'Finalized source grew during decode'
            assert prefix_hash(file, copied['copiedBytes']) == copied['snapshotSha256'], 'Source prefix changed during decode'
        result.update(timeline=verdict, containerContinuityPassed=verdict['passed'], audioTimeline=audio, videoTimeline=video,
                      firstDecodedAudioPtsSeconds=audio[0]['pts'] if audio else None, startSample=first, frames=count,
                      source=str(snapshot), sourceSha256=copied['snapshotSha256'], sourceBytes=copied['copiedBytes'], sourceUnchangedDuringDecode=True)
        if verdict['passed']:
            pcm = b''.join(blocks)[first * 4:(first + count) * 4]
            with target.open('xb') as output_file:
                with wave.open(output_file, 'wb') as output:
                    output.setnchannels(2); output.setsampwidth(2); output.setframerate(48000); output.writeframes(pcm)
            result.update(outputSha256=sha(target), pcmSha256=hashlib.sha256(pcm).hexdigest())
    except Exception as error:
        result.update(containerContinuityPassed=False, error=f'{type(error).__name__}: {error}')
    with receipt.open('x', encoding='utf-8') as output: json.dump(result, output, indent=2)
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path); parser.add_argument('target', type=Path)
    parser.add_argument('--start', type=float, required=True); parser.add_argument('--duration', type=float, required=True)
    parser.add_argument('--active-start', type=float, required=True, help='Fixed F5 journal offset from recording origin; not a free cut adjustment')
    parser.add_argument('--run-root', type=Path, required=True)
    parser.add_argument('--dependencies', type=Path, required=True); parser.add_argument('--dependencies-sha256', required=True)
    parser.add_argument('--finalized', action='store_true')
    args = parser.parse_args()
    result = extract(args.source, args.target, args.start, args.duration, args.active_start, args.run_root,
                     args.dependencies, args.dependencies_sha256, args.finalized)
    print(json.dumps({k:v for k,v in result.items() if k not in ['audioTimeline','videoTimeline']}, indent=2))
    sys.exit(0 if result['containerContinuityPassed'] else 2)
