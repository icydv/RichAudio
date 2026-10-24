# Authored mock capture

`mock-session.jsonl` is recorded from `MockSource` in `tests/telemetry/TestCore.cs`, **not GTA gameplay**. It includes synthetic player/NPC motion, an unavailable RPM field, stream-out and reappearance. Model numbers and source positions are authored test values. No Rockstar assets or real world personal data are included.

Regenerate with `tools/Test-Telemetry.ps1`. Measured processing timings in the fixture describe the local test process only, so they may change between runs. Use `evidence/phase2/test-results.json` for explicit benchmark scope and results. Never report the fixture's NPC distance as an in-game observation.
