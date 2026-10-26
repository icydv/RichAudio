# Offline source-audio prototype

Original file-based source research, independent of RPH and the telemetry core.
No game/native/endpoint APIs, ownership controller or acoustic propagation.

`stock-source.mjs` accepts bounded decoded PCM and explicit synthetic controls.
It preserves independent engine/exhaust buffers and rejects missing/duplicate
component schedules, invalid ratio/time data and unsupported WAV layouts.
PCM16 mono/stereo IO is supported; the current six-layer source renderer
explicitly requires mono stems. Time resampling changes pitch and duration.

The estimated source-position/marker mapping **failed human listening** for
acceleration/deceleration (robotic/fax-like). It is retained as an experimental
negative result, not recommended playback or proven native granular behaviour.
`renderReference` instead plays each moving recording once at its original
rate, with explicit transition fades and short repeated idle. This limited
baseline has no dynamic RPM mapping; shorter components end rather than loop.
No public pack ABI is frozen.

P2-03.1 adds optional `decelEngineScale` (default 1, bounded 0.5–1) as a
deceleration-only balance experiment. The tested 0.75 candidate gave slight
listening improvement but did not resolve the ghosting. It is not the default
or a phase correction. Isolation/diagnosis lives in `tools/Inspect-Deceleration.mjs`;
the accepted reference remains byte-identical with default settings.
Actual content and all stock-derived output stay in ignored private storage.
Public tests generate original sine/ramp material in memory or private folders.

See [P2-03 results and reproduction](../../docs/P2_03_STOCK_AUDIO_RECONSTRUCTION.md)
and [P2-02 ownership gate](../../docs/P2_02_AUDIO_OWNERSHIP.md).
