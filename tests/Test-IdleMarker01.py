"""Authored PCM fixtures: measurement mathematics only, never GTA evidence."""
import array
import importlib.util
import math
from pathlib import Path
import random
import subprocess
import sys
import tempfile
import unittest
import wave

SOURCE = Path(__file__).resolve().parents[1] / "tools/native-control/native-suppression01/Measure-IdleMarker01.py"
SPEC = importlib.util.spec_from_file_location("idle_marker", SOURCE)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class IdleMarkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="richaudio-idle-marker-")
        cls.directory = Path(cls.temp.name)
        cls.a = cls.wav("a.wav", "noise")
        cls.b1 = cls.wav("b1.wav", "marker")
        cls.c = cls.wav("c.wav", "noise")
        cls.b2 = cls.wav("b2.wav", "marker", amplitude=0.035)
        cls.receipt = cls.directory / "calibration.json"
        cls.calibration = M.calibrate(cls.a, cls.b1)
        cls.sha = M.write_receipt(cls.receipt, cls.calibration)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def wav(cls, name, kind, amplitude=0.045, pitch=1.0, channels=1, seconds=2.048):
        rng = random.Random(447)
        values = array.array("h")
        for i in range(round(48000 * seconds)):
            sample = rng.uniform(-0.0001, 0.0001)
            first = math.sin(2 * math.pi * 997 * pitch * i / 48000)
            second = math.sin(2 * math.pi * 1499 * pitch * i / 48000)
            if kind == "marker":
                sample += amplitude * (first + second)
            elif kind == "resource-loop":
                position = i % 40350
                fade = min(1.0, position / 240, (40349 - position) / 240)
                sample += amplitude * fade * (math.sin(2 * math.pi * 997 * position / 48000) +
                                              math.sin(2 * math.pi * 1499 * position / 48000))
            elif kind == "alternate":
                sample += amplitude * (first if i // M.SIZE % 2 else second)
            elif kind == "one-tone":
                sample += amplitude * first
            elif kind == "clip":
                sample = 1.0
            value = max(-32768, min(32767, round(sample * 32768)))
            values.append(value)
            if channels == 2:
                values.append(-value)
        if sys.byteorder != "little":
            values.byteswap()
        path = cls.directory / name
        with wave.open(str(path), "wb") as output:
            output.setparams((channels, 2, 48000, 0, "NONE", "not compressed"))
            output.writeframes(values.tobytes())
        return path

    def test_authored_sequence_matches_and_does_not_claim_native_suppression(self):
        self.assertEqual(self.calibration["status"], "CALIBRATED")
        result = M.evaluate(self.receipt, self.sha, self.c, self.b2)
        self.assertEqual(result["status"], "FIXED_BAND_SEQUENCE_MATCH")
        self.assertLess(max(result["reduction_upper_bound_db"]), -20)
        self.assertFalse(result["native_suppression_proved"])
        self.assertFalse(result["pitch_migration_excluded"])

    def test_marker_remaining_in_c_is_inconclusive(self):
        self.assertEqual(M.evaluate(self.receipt, self.sha, self.b1, self.b2)["status"], "INCONCLUSIVE")

    def test_reduction_and_recovery_thresholds(self):
        sufficient = self.wav("reduced-enough.wav", "marker", amplitude=0.0036)
        insufficient = self.wav("reduced-too-little.wav", "marker", amplitude=0.009)
        weak_recovery = self.wav("weak-recovery.wav", "marker", amplitude=0.02)
        self.assertEqual(M.evaluate(self.receipt, self.sha, sufficient, self.b2)["status"], "FIXED_BAND_SEQUENCE_MATCH")
        self.assertEqual(M.evaluate(self.receipt, self.sha, insufficient, self.b2)["status"], "INCONCLUSIVE")
        self.assertEqual(M.evaluate(self.receipt, self.sha, self.c, weak_recovery)["status"], "INCONCLUSIVE")

    def test_no_marker_cannot_calibrate(self):
        self.assertEqual(M.calibrate(self.a, self.c)["status"], "INCONCLUSIVE")

    def test_one_tone_and_alternating_tones_cannot_calibrate(self):
        for kind in ("one-tone", "alternate"):
            with self.subTest(kind=kind):
                path = self.wav(kind + ".wav", kind)
                self.assertEqual(M.calibrate(self.a, path)["status"], "INCONCLUSIVE")

    def test_common_pitch_can_be_frozen_before_c(self):
        shifted = self.wav("shifted.wav", "marker", pitch=1.1)
        calibration = M.calibrate(self.a, shifted)
        self.assertEqual(calibration["status"], "CALIBRATED")
        self.assertAlmostEqual(calibration["centers_hz"][0], 997 * 1.1, delta=18)
        receipt = self.directory / "shifted.json"
        sha = M.write_receipt(receipt, calibration)
        self.assertEqual(M.evaluate(receipt, sha, self.c, shifted)["status"], "FIXED_BAND_SEQUENCE_MATCH")

    def test_exact_resource_envelope_and_repeated_sample_are_detected(self):
        loop = self.wav("resource-loop.wav", "resource-loop")
        self.assertEqual(M.calibrate(self.a, loop)["status"], "CALIBRATED")

    def test_missing_or_pitch_moved_restoration_is_inconclusive(self):
        shifted = self.wav("moved-b2.wav", "marker", pitch=1.1)
        for b2 in (self.c, shifted):
            self.assertEqual(M.evaluate(self.receipt, self.sha, self.c, b2)["status"], "INCONCLUSIVE")

    def test_antiphase_stereo_does_not_cancel_measurement(self):
        stereo = self.wav("stereo.wav", "marker", channels=2)
        self.assertEqual(M.calibrate(self.a, stereo)["status"], "CALIBRATED")

    def test_hash_checked_before_later_files_are_opened(self):
        with self.assertRaisesRegex(ValueError, "digest differs"):
            M.evaluate(self.receipt, "0" * 64, "absent-c.wav", "absent-b2.wav")

    def test_pitch_migration_is_explicitly_not_a_suppression_proof(self):
        shifted = self.wav("moved-c.wav", "marker", pitch=1.1)
        result = M.evaluate(self.receipt, self.sha, shifted, self.b2)
        # A fixed-band detector necessarily has this limitation. The result
        # must never promote an absent spectral signature to a native mute.
        self.assertEqual(result["status"], "FIXED_BAND_SEQUENCE_MATCH")
        self.assertFalse(result["pitch_migration_excluded"])
        self.assertFalse(result["native_suppression_proved"])

    def test_cli_uses_the_same_frozen_receipt(self):
        output = self.directory / "cli-measurement.json"
        completed = subprocess.run([sys.executable, str(SOURCE), "evaluate",
                                   "--calibration", str(self.receipt), "--sha256", self.sha,
                                   "--suppressed", str(self.c), "--restored", str(self.b2),
                                   "--out", str(output)], capture_output=True, text=True, check=False)
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("FIXED_BAND_SEQUENCE_MATCH", completed.stdout)

    def test_receipts_cannot_be_overwritten(self):
        with self.assertRaises(FileExistsError):
            M.write_receipt(self.receipt, self.calibration)

    def test_clipping_short_and_malformed_are_rejected(self):
        bad = self.directory / "malformed.wav"
        bad.write_bytes(b"not a wav")
        for path in (bad, self.wav("short.wav", "marker", seconds=0.1),
                     self.wav("clipped.wav", "clip")):
            with self.subTest(path=path.name), self.assertRaises(ValueError):
                M.load_recording(path)

    def test_truncated_payload_is_rejected(self):
        path = self.directory / "truncated.wav"
        path.write_bytes(self.b1.read_bytes()[:-200])
        with self.assertRaisesRegex(ValueError, "truncated"):
            M.load_recording(path)

    def test_input_size_is_bounded(self):
        path = self.directory / "oversize.wav"
        with path.open("wb") as output:
            output.truncate(M.POLICY["maximum_file_bytes"] + 1)
        with self.assertRaisesRegex(ValueError, "8 MiB"):
            M.load_recording(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
