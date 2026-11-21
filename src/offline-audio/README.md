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

[P2-03.2](../../docs/P2_03_2_CYCLE_SYNCHRONISATION.md) adds separate tools for
relative marker/periodicity evidence and one bounded cycle-state experiment.
The 14–28 interior-state preview improved listening at unchanged gains; an
exhaust-led variant was preferred. These tools do not modify this accepted
renderer or establish native phase, physical RPM or full-range load response.

[P2-03.3](../../docs/P2_03_3_RESPONSIVE_ENGINE.md) adds a separate responsive
cycle-pair research scheduler. Controls, timing and deterministic output work;
listening found holds and transitions artificial. The measured middle-hold
output repeats every 0.667 seconds. It is not accepted engine synthesis or a
replacement for the references. No presence effects or runtime integration are added.
Actual content and all stock-derived output stay in ignored private storage.
Public tests generate original sine/ramp material in memory or private folders.

See [P2-03 results and reproduction](../../docs/P2_03_STOCK_AUDIO_RECONSTRUCTION.md)
and [P2-02 ownership gate](../../docs/P2_02_AUDIO_OWNERSHIP.md).
