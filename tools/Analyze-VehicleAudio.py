"""Private, objective waveform/STFT/loudness analysis. No playback or normalisation.

Requires numpy, scipy, matplotlib and imageio-ffmpeg. Install in a local venv or
private dependency directory; never commit reference media or generated outputs.
"""
import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

import numpy as np
from scipy import signal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


def decode(source, sample_rate=48000, channels=2):
    result = subprocess.run([FFMPEG, '-v', 'error', '-i', str(source), '-vn', '-f', 'f32le',
                             '-acodec', 'pcm_f32le', '-ar', str(sample_rate), '-ac', str(channels), '-'],
                            capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype='<f4').reshape(-1, channels).astype(np.float64)


def loudness(source):
    result = subprocess.run([FFMPEG, '-hide_banner', '-nostats', '-i', str(source), '-vn',
                             '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True, check=True)
    summary = result.stderr.rsplit('Summary:', 1)[-1]
    def number(pattern):
        match = re.search(pattern, summary)
        if not match:
            return None
        value = float(match.group(1))
        return value if np.isfinite(value) else None
    return {'integratedLufs': number(r'I:\s+([-\d.inf]+) LUFS'),
            'loudnessRangeLu': number(r'LRA:\s+([-\d.inf]+) LU'),
            'truePeakDbfs': number(r'Peak:\s+([-\d.inf]+) dBFS'),
            'method': 'FFmpeg ebur128, ITU-R BS.1770 weighting; no normalisation; short clips limit LRA meaning'}


def analyze(source, destination, sample_rate=48000, channels=2, intervals=None):
    samples = decode(source, sample_rate, channels)
    mono = samples.mean(axis=1)
    f, t, z = signal.stft(mono, fs=sample_rate, window='hann', nperseg=4096, noverlap=3584,
                         boundary=None, padded=False)
    power = np.abs(z) ** 2
    spectrum = power.mean(axis=1)
    bands = [(20, 150), (150, 800), (800, 3000), (3000, 8000), (8000, 20000)]
    total = spectrum[(f >= 20) & (f < 20000)].sum()
    band_report = {f'{lo}-{hi}Hz': float(spectrum[(f >= lo) & (f < hi)].sum() / max(total, 1e-30)) for lo, hi in bands}
    n = max(1, round(sample_rate * 0.05))
    step = max(1, round(sample_rate * 0.01))
    starts = np.arange(0, max(1, len(mono) - n), step)
    rms = np.sqrt(np.array([np.mean(mono[k:k+n] ** 2) for k in starts]))
    peak = float(np.max(np.abs(samples)))
    sample_rms = float(np.sqrt(np.mean(samples ** 2)))
    peaks, _ = signal.find_peaks(spectrum)
    peaks = sorted(peaks, key=lambda k: spectrum[k], reverse=True)[:12]
    measured_intervals = []
    for start, end in intervals or []:
        x = mono[round(start * sample_rate):round(end * sample_rate)]
        if not len(x):
            continue
        ff, pp = signal.welch(x, fs=sample_rate, nperseg=min(16384, len(x)))
        indices, _ = signal.find_peaks(pp)
        indices = sorted(indices, key=lambda k: pp[k], reverse=True)[:8]
        measured_intervals.append({'start': start, 'end': end,
                                  'rmsDbfs': float(20 * np.log10(max(np.sqrt(np.mean(x*x)), 1e-12))),
                                  'prominentHz': [round(float(ff[k]), 2) for k in indices]})
    plt.style.use('dark_background')
    fig, axes = plt.subplots(3, 1, figsize=(12, 8), constrained_layout=True)
    thin = max(1, len(mono) // 15000)
    axes[0].plot(np.arange(len(mono))[::thin] / sample_rate, mono[::thin], linewidth=.5, color='#75d7c7')
    axes[0].set(ylabel='Digital amplitude', ylim=(-1, 1), title=source.stem + ' · unnormalised')
    axes[1].plot(starts / sample_rate, 20 * np.log10(np.maximum(rms, 1e-8)), color='#ffbf69')
    axes[1].set(ylabel='50 ms RMS dBFS', ylim=(-90, 0))
    # One fixed colour scale for every generated file. No per-file spectral gain.
    axes[2].pcolormesh(t, f, 20 * np.log10(np.maximum(np.abs(z), 1e-8)), cmap='magma',
                       vmin=-100, vmax=-10, shading='auto', rasterized=True)
    axes[2].set(ylabel='Frequency Hz', xlabel='Time seconds', ylim=(40, 12000), yscale='log')
    fig.savefig(destination, dpi=140)
    plt.close(fig)
    return {'file': source.name, 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'durationSeconds': len(samples) / sample_rate, 'analysisSampleRate': sample_rate,
            'analysisChannels': channels, 'peak': peak, 'rms': sample_rms,
            'rmsDbfs': float(20*np.log10(max(sample_rms, 1e-12))),
            'crestDb': float(20*np.log10(max(peak, 1e-12)/max(sample_rms, 1e-12))),
            'spectralCentroidHz': float(np.sum(f*spectrum)/max(np.sum(spectrum), 1e-30)),
            'bandPowerFractions': band_report, 'prominentHz': [round(float(f[k]), 2) for k in peaks],
            'intervals': measured_intervals, 'loudness': loudness(source),
            'method': '4096-point Hann STFT, 512 hop, no padding; common dBFS display; not acoustic SPL'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('output', type=Path)
    parser.add_argument('--reference', type=Path)
    args = parser.parse_args()
    out = args.output.resolve()
    if '.local' not in out.parts or not out.is_dir():
        raise ValueError('existing private .local output directory required')
    files = sorted(p for p in out.glob('*.wav') if '-dry' not in p.stem)
    reports = [analyze(p, p.with_suffix('.png')) for p in files]
    dry_reports = [analyze(p, p.with_suffix('.png')) for p in sorted(out.glob('*-dry.wav'))]
    comparisons = {}
    for name, a, b in [('passReflections', '05-pass-direct.wav', '07-pass-reflections.wav'),
                       ('tunnelLate', '08-tunnel-early.wav', '09-tunnel-late.wav')]:
        if (out/a).exists() and (out/b).exists():
            first, second = decode(out/a), decode(out/b)
            difference = second-first
            windows = [(0, 4), (4, 5), (5, 6), (6, 7)] if name == 'tunnelLate' else [(0, len(first)/48000)]
            comparisons[name] = []
            for start, end in windows:
                x = difference[round(start*48000):round(end*48000)]
                comparisons[name].append({'start': start, 'end': end,
                    'differenceRms': float(np.sqrt(np.mean(x*x))), 'differencePeak': float(np.max(np.abs(x))),
                    'nonzeroSamples': int(np.count_nonzero(x))})
    reference = None
    if args.reference:
        reference = analyze(args.reference, out/'reference-6966.png', 44100, 1,
                            [(2.5, 4.8), (4.8, 5.25), (6.25, 8), (9, 12), (16, 19), (109, 114)])
        reference['scope'] = 'Reference A only; edited mono AAC; other recording measurements remain supplied-analysis evidence'
    (out/'spectral-measurements.json').write_text(json.dumps({'schemaVersion': 1, 'generated': reports,
        'dry': dry_reports, 'reference': reference, 'comparisons': comparisons,
        'subjectiveListening': 'not-performed'}, indent=2), encoding='utf-8')
    print(f'Analyzed {len(reports)} propagated and {len(dry_reports)} dry renders; reference={reference is not None}')


if __name__ == '__main__':
    main()
