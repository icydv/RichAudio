# Configuration policy

Publication templates deliberately leave `OutputDirectory` empty. Before an approved deployment, create an ignored machine-local copy and supply a real absolute development capture directory outside game/tool folders. Validation fails closed for the empty template, relative paths, process/game roots and reparse-point redirects. `RICHAUDIO_GAME_ROOT`, when set, supplies an additional protected root; it is not an instruction to deploy. `__USER_HOME__` / `__GAME_ROOT__` in historical reports/scripts are unresolved redaction placeholders. Frozen historical manifests and their integrity pins must not be reused as installers after rewriting. The original local approved package remains separately preserved.

Deployment bindings are prepared separately by the reviewed playable tools. Historical candidate budgets in ARCHITECTURE.md do not qualify new features. Profiles must carry schema version, units, source provenance and validity, plus geometry/material cache versions. Separate measured calibration from author assumptions and keep installation paths in ignored machine configuration.

## PLAYABLE-08 feature requests

`production-features.json` ships with `modificationAwareLoudness:false` and
`synchronizedAudioRecording:false`. These requests cannot certify telemetry,
handoff, playback or listening acceptance, grant permission, open an endpoint or
start a recorder. See the scoped production activation evaluator and
[PLAYABLE-08](../docs/PLAYABLE_08.md).

`vehicle-loudness-policy.json` also ships with `enabled:false`. Its bounded
schema describes authored treatment proposals relative to the unchanged 10x
exhaust-pressure / 0.25 common-trim reference. These are not calibrated real
traffic gains. No current gameplay producer loads this new policy. Editing a
feature request does not install or activate the new foundations.
