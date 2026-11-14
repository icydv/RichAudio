"""Fixed, offline measurement of the original 997/1499 Hz idle marker.

Calibrate from A (native baseline) and B1 BEFORE opening C. Preserve the printed
receipt SHA-256 independently. Evaluate C and B2 with that digest. This measures
recorded fixed-band energy, not vehicle identity, resource selection, or complete
engine silence. Matched listening geometry and stable native pitch need separate
evidence; disappearance caused by pitch migration cannot be excluded here.
"""
import argparse
import array
import cmath
import hashlib
import io
import json
import math
from pathlib import Path
import statistics
import sys
import wave

RATE = 48000
SIZE = 8192
HALF_BAND = 2
FLOOR = 1e-16
POLICY = {
    "sample_rate": RATE, "fft_size": SIZE, "window": "Hann, nonoverlapping",
    "power_statistic": "mean over complete windows; no ambient subtraction",
    "half_band_bins": HALF_BAND, "marker_hz": [997, 1499],
    "common_pitch_range": [0.75, 1.25], "minimum_seconds": 2,
    "maximum_seconds": 30, "minimum_presence_fraction": 0.8,
    "local_contrast_db": 12, "baseline_margin_db": 26,
    "maximum_reduction_db": -20, "recovery_tolerance_db": 6,
    "maximum_file_bytes": 8 * 1024 * 1024, "clipping_sample": 32760,
}
LIMITATION = ("Fixed-band acoustic signature only. No phase/vehicle identity, "
              "resource registration, total silence, or native suppression is "
              "proved. Native pitch migration, changed operating conditions, "
              "recording gain, and other sources require independent exclusion.")
WINDOW = [0.5 - 0.5 * math.cos(2 * math.pi * i / (SIZE - 1)) for i in range(SIZE)]
NORMALIZATION = 2 / (SIZE * sum(w * w for w in WINDOW))
REVERSED = [int(format(i, "013b")[::-1], 2) for i in range(SIZE)]
ROOTS = {n: [cmath.exp(-2j * math.pi * k / n) for k in range(n // 2)]
         for n in (2 ** p for p in range(1, 14))}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def tool_hash():
    return digest(Path(__file__).read_bytes())


def db_ratio(value, reference):
    return 10 * math.log10(max(value, FLOOR) / max(reference, FLOOR))


def transform(samples):
    values = [complex(samples[i] * WINDOW[i] / 32768) for i in REVERSED]
    size = 2
    while size <= SIZE:
        half = size // 2
        roots = ROOTS[size]
        for start in range(0, SIZE, size):
            for k in range(half):
                a = values[start + k]
                b = roots[k] * values[start + k + half]
                values[start + k], values[start + k + half] = a + b, a - b
        size *= 2
    return [(v.real * v.real + v.imag * v.imag) * NORMALIZATION
            for v in values[:SIZE // 2 + 1]]


def load_recording(filename):
    path = Path(filename)
    with path.open("rb") as stream:
        raw = stream.read(POLICY["maximum_file_bytes"] + 1)
    if len(raw) > POLICY["maximum_file_bytes"]:
        raise ValueError("WAV exceeds the 8 MiB input bound")
    try:
        # Hash and decode one byte snapshot, including when a capture file is
        # accidentally still being written. Short payloads remain rejected.
        with wave.open(io.BytesIO(raw), "rb") as wav:
            channels, frames = wav.getnchannels(), wav.getnframes()
            if (wav.getframerate() != RATE or wav.getsampwidth() != 2 or
                    channels not in (1, 2) or wav.getcomptype() != "NONE"):
                raise ValueError("48 kHz PCM16 mono/stereo WAV required")
            if not RATE * 2 <= frames <= RATE * 30:
                raise ValueError("recording must contain 2 to 30 seconds")
            pcm = wav.readframes(frames)
            if len(pcm) != frames * channels * 2:
                raise ValueError("truncated PCM payload")
    except (wave.Error, EOFError) as exc:
        raise ValueError("malformed PCM WAV") from exc
    samples = array.array("h", pcm)
    if sys.byteorder != "little":
        samples.byteswap()
    peak = max(abs(value) for value in samples)
    if peak >= POLICY["clipping_sample"]:
        raise ValueError("clipped or near-full-scale recording is inconclusive")
    spectra = []
    for start in range(0, frames - SIZE + 1, SIZE):
        combined = [0.0] * (SIZE // 2 + 1)
        for channel in range(channels):
            part = samples[start * channels + channel:(start + SIZE) * channels:channels]
            spectrum = transform(part)
            for i, value in enumerate(spectrum):
                combined[i] += value / channels
        spectra.append(combined)
    return {"sha256": digest(raw), "frames": frames, "channels": channels,
            "used_frames": len(spectra) * SIZE, "peak_sample": peak,
            "spectra": spectra}


def band(spectrum, center):
    return sum(spectrum[center - HALF_BAND:center + HALF_BAND + 1])


def local_floor(spectrum, center):
    # Fixed neighbouring bins exclude the marker band and its immediate skirt.
    neighbours = [spectrum[center + offset] for offset in range(-12, 13)
                  if abs(offset) >= 5]
    return max(statistics.median(neighbours) * (2 * HALF_BAND + 1), FLOOR)


def metrics(recording, centers, baseline_powers=None):
    windows = recording["spectra"]
    powers = [statistics.fmean(band(s, center) for s in windows) for center in centers]
    floors = [statistics.fmean(local_floor(s, center) for s in windows) for center in centers]
    present = 0
    for spectrum in windows:
        if all(db_ratio(band(spectrum, c), local_floor(spectrum, c)) >= POLICY["local_contrast_db"]
               and (baseline_powers is None or db_ratio(band(spectrum, c), baseline_powers[i]) >= 12)
               for i, c in enumerate(centers)):
            present += 1
    return {"sha256": recording["sha256"], "frames": recording["frames"],
            "used_frames": recording["used_frames"], "channels": recording["channels"],
            "peak_sample": recording["peak_sample"], "windows": len(windows),
            "band_power": powers, "local_floor_power": floors,
            "local_contrast_db": [db_ratio(p, f) for p, f in zip(powers, floors)],
            "presence_fraction": present / len(windows)}


def calibrate(baseline_file, marker_file):
    baseline, marker = load_recording(baseline_file), load_recording(marker_file)
    candidates = []
    low = math.ceil(997 * 0.75 * SIZE / RATE)
    high = math.floor(997 * 1.25 * SIZE / RATE)
    for first in range(low, high + 1):
        centers = [first, round(first * 1499 / 997)]
        a = metrics(baseline, centers)
        b = metrics(marker, centers, a["band_power"])
        margins = [db_ratio(p, q) for p, q in zip(b["band_power"], a["band_power"])]
        eligible = (min(margins) >= POLICY["baseline_margin_db"] and
                    min(b["local_contrast_db"]) >= POLICY["local_contrast_db"] and
                    b["presence_fraction"] >= POLICY["minimum_presence_fraction"])
        # Both tones must carry energy; a single loud tone cannot win the score.
        candidates.append((eligible, min(b["band_power"]), centers, a, b, margins))
    eligible, _, centers, a, b, margins = max(candidates, key=lambda row: (row[0], row[1]))
    return {"schema": 1, "kind": "idle-marker-calibration", "policy": POLICY,
            "tool_sha256": tool_hash(), "status": "CALIBRATED" if eligible else "INCONCLUSIVE",
            "centers_bins": centers, "centers_hz": [c * RATE / SIZE for c in centers],
            "baseline": a, "marker_b1": b, "baseline_margin_db": margins,
            "limitation": LIMITATION}


def read_calibration(filename, expected_hash):
    path = Path(filename)
    with path.open("rb") as stream:
        raw = stream.read(65537)
    if len(raw) > 65536:
        raise ValueError("calibration receipt exceeds 64 KiB")
    if len(expected_hash) != 64 or digest(raw) != expected_hash.lower():
        raise ValueError("calibration receipt digest differs")
    try:
        data = json.loads(raw)
        centers = data["centers_bins"]
        if (data["schema"] != 1 or data["kind"] != "idle-marker-calibration" or
                data["status"] != "CALIBRATED" or data["policy"] != POLICY or
                data["tool_sha256"] != tool_hash() or len(centers) != 2 or
                any(type(c) is not int for c in centers) or
                not math.ceil(997 * 0.75 * SIZE / RATE) <= centers[0] <= math.floor(997 * 1.25 * SIZE / RATE) or
                centers[1] != round(centers[0] * 1499 / 997)):
            raise ValueError("incompatible or inconclusive calibration")
        for name in ("baseline", "marker_b1"):
            values = data[name]["band_power"]
            if len(values) != 2 or any(type(v) not in (float, int) or not math.isfinite(v) or v < 0 for v in values):
                raise ValueError("invalid calibration power")
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        raise ValueError("malformed calibration receipt") from exc
    return data


def evaluate(calibration_file, expected_hash, suppressed_file, restored_file):
    # Validate the frozen B1 receipt before opening either subsequent recording.
    calibration = read_calibration(calibration_file, expected_hash)
    centers = calibration["centers_bins"]
    a = calibration["baseline"]["band_power"]
    b = calibration["marker_b1"]["band_power"]
    c = metrics(load_recording(suppressed_file), centers, a)
    restored = metrics(load_recording(restored_file), centers, a)
    # No ambient subtraction. Twice measured baseline power sets a conservative
    # floor; all actual C energy (including unrelated sounds) counts against C.
    upper = [max(p, 2 * floor, FLOOR) for p, floor in zip(c["band_power"], a)]
    reduction = [db_ratio(p, reference) for p, reference in zip(upper, b)]
    recovery = [db_ratio(p, reference) for p, reference in zip(restored["band_power"], b)]
    passed = (max(reduction) <= POLICY["maximum_reduction_db"] and
              max(abs(v) for v in recovery) <= POLICY["recovery_tolerance_db"] and
              min(restored["local_contrast_db"]) >= POLICY["local_contrast_db"] and
              restored["presence_fraction"] >= POLICY["minimum_presence_fraction"])
    return {"schema": 1, "kind": "idle-marker-measurement", "policy": POLICY,
            "tool_sha256": tool_hash(), "calibration_sha256": expected_hash.lower(),
            "status": "FIXED_BAND_SEQUENCE_MATCH" if passed else "INCONCLUSIVE",
            "centers_bins": centers, "centers_hz": calibration["centers_hz"],
            "suppressed_c": c, "restored_b2": restored,
            "reduction_upper_bound_db": reduction, "recovery_difference_db": recovery,
            "bound_scope": "mean recorded energy in each frozen band over complete windows",
            "native_suppression_proved": False, "pitch_migration_excluded": False,
            "limitation": LIMITATION}


def write_receipt(filename, result):
    raw = (json.dumps(result, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")
    # Never replace the calibration or an earlier result accidentally.
    with Path(filename).open("xb") as output:
        output.write(raw)
    return digest(raw)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    calibration = sub.add_parser("calibrate")
    calibration.add_argument("--baseline", required=True)
    calibration.add_argument("--marker", required=True)
    calibration.add_argument("--out", required=True)
    evaluation = sub.add_parser("evaluate")
    evaluation.add_argument("--calibration", required=True)
    evaluation.add_argument("--sha256", required=True)
    evaluation.add_argument("--suppressed", required=True)
    evaluation.add_argument("--restored", required=True)
    evaluation.add_argument("--out", required=True)
    args = parser.parse_args()
    try:
        result = (calibrate(args.baseline, args.marker) if args.action == "calibrate" else
                  evaluate(args.calibration, args.sha256, args.suppressed, args.restored))
        sha = write_receipt(args.out, result)
        print(json.dumps({"status": result["status"], "receipt_sha256": sha, "path": args.out}))
        return 0 if result["status"] in ("CALIBRATED", "FIXED_BAND_SEQUENCE_MATCH") else 2
    except (OSError, ValueError) as exc:
        print(json.dumps({"status": "REJECTED", "reason": str(exc)}))
        return 2


if __name__ == "__main__":
    sys.exit(main())
