"""Focused, device-free comparison of existing PR74 auditions and reference A.

Reads original files without playback, normalisation or audio generation.
Reference recordings are analysis inputs only, never synthesis assets.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--dependencies', type=Path)
parser.add_argument('--audition', type=Path, required=True)
parser.add_argument('--video', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
if args.dependencies:
    sys.path.insert(0, str(args.dependencies))
import numpy as np
from scipy import signal
import imageio_ffmpeg
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

out = args.output.resolve()
if '.local' not in out.parts:
    raise ValueError('Private .local analysis output required')
out.mkdir(parents=True, exist_ok=True)
fs = 44100
bands = [(160, 500), (500, 2000), (2000, 6000)]
files = ['02-acceleration-dry.wav', '05-pass-direct-dry.wav',
         '05-pass-direct.wav', '06-distant-departure.wav',
         '07-pass-reflections.wav', '08-tunnel-early.wav', '09-tunnel-late.wav']
published = json.loads((args.audition/'spectral-measurements.json').read_text('utf-8'))
expected = {p['file']: p['sha256'] for p in published['generated'] + published['dry']}
signals = {}
bindings = []
for name in files:
    file = args.audition/name
    digest = hashlib.sha256(file.read_bytes()).hexdigest()
    assert digest == expected[name], 'Existing audition differs from its measurement binding'
    bindings.append({'file': name, 'sha256': digest})
for name in files + ['6966.mp4']:
    file = args.video if name == '6966.mp4' else args.audition/name
    command = [imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(file)]
    if name == '6966.mp4':
        command += ['-t', '18']
    channels = 1 if name == '6966.mp4' else 2
    command += ['-vn', '-f', 'f32le', '-acodec', 'pcm_f32le', '-ar', str(fs), '-ac', str(channels), '-']
    decoded = np.frombuffer(subprocess.run(command, capture_output=True, check=True).stdout, dtype='<f4').reshape(-1, channels)
    signals[name] = decoded.astype(float).mean(axis=1)

def db(x):
    return float(20*np.log10(max(float(np.sqrt(np.mean(x*x))), 1e-15)))

def windows(name, intervals):
    x = signals[name]
    filtered = [signal.sosfiltfilt(signal.butter(4, [a, b], fs=fs, btype='bandpass', output='sos'), x) for a, b in bands]
    result = []
    for label, start, end in intervals:
        sl = slice(round(start*fs), round(end*fs))
        f, p = signal.welch(x[sl], fs=fs, nperseg=min(16384, len(x[sl])))
        indices, _ = signal.find_peaks(p)
        peaks = sorted(indices, key=lambda k: p[k], reverse=True)[:8]
        levels = [db(y[sl]) for y in filtered]
        result.append({'label': label, 'start': start, 'end': end, 'rmsDbfs': db(x[sl]),
                       'bandsDbfs': dict(zip(['160-500', '500-2000', '2000-6000'], levels)),
                       'upperToMidDb': levels[2]-levels[1],
                       'prominentHz': [round(float(f[k]), 2) for k in peaks]})
    return result

measurements = {
    '6966.mp4': windows('6966.mp4', [('approach', 1.5, 2.3), ('near', 4.8, 5.6), ('after-knee', 6.3, 7.3), ('later', 14, 18)]),
    '05-pass-direct-dry.wav': windows('05-pass-direct-dry.wav', [('established-source', 1, 1.8)]),
    '05-pass-direct.wav': windows('05-pass-direct.wav', [('approach', .3, .7), ('near', 1.9, 2.1), ('recession', 3.2, 3.8)]),
    '06-distant-departure.wav': windows('06-distant-departure.wav', [('near', .5, 1), ('far', 7.5, 8.5)])}
early, late = signals['08-tunnel-early.wav'], signals['09-tunnel-late.wav']
delta = late-early
tunnel = [{'start': a, 'end': b, 'earlyDbfs': db(early[round(a*fs):round(b*fs)]),
           'lateMinusEarlyDbfs': db(delta[round(a*fs):round(b*fs)])} for a, b in [(0,4),(4,5),(5,6)]]
# Diffuse stereo energy can cancel on downmix. Keep a separate exact-rate,
# two-channel comparison with identical time windows for early and wet energy.
stereo = []
for name in ['08-tunnel-early.wav', '09-tunnel-late.wav']:
    data = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-v', 'error', '-i', str(args.audition/name),
                           '-f', 'f32le', '-ar', '48000', '-ac', '2', '-'], capture_output=True, check=True).stdout
    stereo.append(np.frombuffer(data, dtype='<f4').reshape(-1, 2).astype(float))
stereo_tunnel = []
for a, b in [(0,4),(4,5),(5,6)]:
    sl = slice(round(a*48000), round(b*48000))
    direct_db, wet_db = db(stereo[0][sl]), db((stereo[1]-stereo[0])[sl])
    silent = not np.any(stereo[0][sl])
    stereo_tunnel.append({'start': a, 'end': b, 'earlyDbfs': None if silent else direct_db,
                          'lateMinusEarlyDbfs': wet_db, 'wetToEarlyDb': None if silent else wet_db-direct_db})
report = {'baseCommit': 'eef0cbc2e96e09754d87b375975eb1053422121e',
          'method': '44.1kHz mono downmix; fourth-order Butterworth zero-phase bandpass; window RMS; Welch peaks. No level matching. Comparison windows are descriptive, not matched RPM/distance.',
          'subjectiveListening': 'not performed', 'physicalSpl': 'uncalibrated and not inferred',
          'originalMediaAvailable': ['6966.mp4'], 'otherReferences': '6967/6968 supplied notes and spectrograms only',
          'existingAuditionBindingsVerified': bindings, 'windows': measurements,
          'tunnelDifferenceMono': tunnel, 'tunnelDifferenceStereo48k': stereo_tunnel}
for binding in bindings:
    assert hashlib.sha256((args.audition/binding['file']).read_bytes()).hexdigest() == binding['sha256'], 'Audition changed during analysis'
(out/'measurements.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
plt.style.use('dark_background')
fig, axes = plt.subplots(3, 1, figsize=(11, 8), constrained_layout=True)
for ax, name, a, b in zip(axes, ['6966.mp4','05-pass-direct-dry.wav','05-pass-direct.wav'], [1,0,0], [13,4,4]):
    x = signals[name][round(a*fs):round(b*fs)]
    f,t,z = signal.stft(x, fs=fs, nperseg=4096, noverlap=3584, boundary=None)
    ax.pcolormesh(t+a, f, 20*np.log10(np.maximum(abs(z),1e-8)), vmin=-110, vmax=-10, cmap='magma', shading='auto')
    ax.set(yscale='log', ylim=(60,6000), ylabel='Hz', title=name+' — common dBFS scale, no level matching')
axes[-1].set_xlabel('Time within each file (s); independent trajectories and recording gains')
fig.savefig(out/'reference-and-current-v12.png', dpi=130)
plt.close(fig)
print(json.dumps({'windows': measurements, 'tunnelDifference': tunnel}, indent=2))
