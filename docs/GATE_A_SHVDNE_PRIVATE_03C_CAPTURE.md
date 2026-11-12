# GATE-A-SHVDNE-PRIVATE-03C — capture evidence admission

I requested the highest practical offline preparation for the private horn experiment. Codex preserved the sealed PRIVATE-03B extractor and added a separately versioned, local-file-only extractor and timestamp policy. Codex did not open an audio endpoint, launch OBS or GTA, start recording, or inspect game memory. The codec fixture uses the original authored marker and generated video frames inside the development worktree.

The retained extractor accepted `containerContinuityPassed:true` when authored decoded audio/video frames had no timestamps. Codex demonstrated this by exercising the actual old extractor with a fake decoder supplying those frames. This is a branch-level reproduction, not a claim that an actual malformed GTA recording was captured. Its ordinary maximum-gap fields could remain zero despite missing timestamps. The new extractor requires timestamps on every decoded frame and refuses to write an admitted WAV when continuity or coverage fails.

Independent review of the first new frozen policy found two further gaps. Audio timestamps spaced 21 ms apart for 20 ms frames produced only 1 ms adjacent discrepancies, yet drifted 199 ms from concatenated PCM across 200 frames. The first policy admitted this. A video ending around 0.967 seconds also passed a 2.8-second coverage test when its final frame claimed a ten-second duration. Codex preserved that first policy, its freeze and 18-case results, then corrected both cases in a separately frozen v02 policy. The earlier PASS remains a historical result with its original coverage, rather than being rewritten.

The final `CaptureTimeline03C.py` policy requires:

- Every decoded audio/video frame has finite timestamps and a valid positive duration.
- Audio adjacent-frame discrepancy is at most **2 ms**.
- Cumulative audio timestamp displacement from first PTS plus decoded sample duration is at most **2 ms**. Concatenated PCM cannot silently accumulate a larger clock offset.
- Video timestamps strictly increase; inter-frame gaps and individual frame durations are at most **100 ms**.
- At least two video frames and coverage of the entire declared audio window are required for live evidence. Audio-only mode is explicitly an offline fixture mode.
- The declared window remains **2.8–30 seconds**, within a bounded capture of at most 90 seconds and 512 MiB, with one 48 kHz stereo audio stream and one video stream for live evidence.

The extractor checks reparse paths before resolving aliases, pins the source size/hash before decode, and checks them again before admission. A changed source is rejected and no WAV is produced. It keeps PCM gain and pitch unchanged, preserves the stereo output, and records the exact source hash, first decoded audio PTS, sample window, output hash, policy and reasons. It reads and writes local files only. The retained PyAV distribution is hash-checked; no dependency was installed.

The frozen v02 suite passed **25 cases**. It includes the previous timestamp/codec cases, cumulative positive drift and overlap, the two-millisecond boundary and beyond-boundary refusal, inflated terminal video duration, quantized timestamps, and a source changed during decode. The integration case actually muxes and decodes AAC audio and generated MPEG4 video using the retained libraries, then requires live-equivalent timestamp coverage for a declared 48 kHz stereo window. The source-change test exercises the actual new extractor with authored decoder objects and verifies refusal before WAV creation. Test material stays under `.local/gate-a-shvdne-private-03c/capture-fixtures-v02/` and the separate old-adapter demonstration directory.

The current evidence is `capture-fixtures-v02/freeze.json` and `result.json`. The first frozen implementation and results remain under `capture-fixtures/`, with source snapshots `CaptureTimeline03C-v01.py`, `Extract-Capture03C-v01.py` and `Test-PrivateCapture03C-v01.py`. The original PRIVATE-03B files are unchanged. Final source/freeze hashes are listed by the new readiness manifest.

These checks establish internal decode/timestamp consistency, not physical output continuity, speaker latency, a GTA-wide capture guarantee, horn origin or vehicle identity. Source rehashing detects persistent changes during decode; it is not a claim of protection against an adversarial writer that changes and exactly restores bytes between checks. The procedure still requires a finalized recording, predeclared source/window annotations, usable visible horn events, exact A/B journal lifetimes, player/driver review and rejection of any known contamination. A timestamp PASS cannot authenticate those independent facts.

Actual window capture, the selected game output, zero microphone sources, no streaming, live event attribution and the timing budget remain gates for the separately authorized experiment. The v02 extractor and frozen policy belong to the new PRIVATE-03C proposal; they are not silently substituted into PRIVATE-03B.
