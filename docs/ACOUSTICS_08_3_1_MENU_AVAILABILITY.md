# ACOUSTICS-08.3.1 live settings availability

The failed Candidate 04 attempt reached stable Story Mode, loaded the combined plugin and displayed the gold F10 menu. It stopped before acoustic host/beacon startup because preferences and recording controls were unavailable. The original installation was independently restored. This was a configuration-resolution failure; acoustic DSP was not exercised.

## Root cause and evidence

The menu used `Assembly.GetExecutingAssembly().Location` to find `RichAudio.Menu.json`. RPH loads a cached copy of the plugin, without the JSON beside that cached DLL. The retained cache copy was created at **18:59:23 UTC**, matching the preserved RPH load log. Its SHA-256 is **769AC7867E583B142A08743F3A55B7BB30B778A2657BBD33088482D2F1A2B958**, exactly Candidate 04's approved/deployed plugin. The adjacent sidecar is absent.

A read-only .NET Framework probe loaded that exact cached DLL and followed the original assembly-relative resolution: `FileNotFoundException`. The same preserved DLL successfully parsed the exact deployed sidecar and loaded its bound Balanced/Auto preferences when given the deployed sidecar path. This separates the path error from guesses about elevation, antivirus, dependency loading, malformed JSON or workspace permissions. Private cache paths, logs and probe outputs remain local.

## Correction and diagnosis

The RPH adapter now resolves exactly `<running game executable directory>/Plugins/RichAudio.Menu.json`. The listener's existing exact executable/runtime guard runs before menu startup. The shared resolver also requires the expected absolute executable name and retains fixed-local-drive/reparse checks. There is no path search, cache-sidecar copying or fallback to an arbitrary current directory. Existing strict sidecar schema, workspace containment, revision validation, compare-and-save and safe recovery remain in force.

Preference snapshots carry bounded `stage`, `code` and classified `exception` fields. Stages distinguish sidecar path/read/schema, workspace binding, preference path/read/schema and host status. Diagnostics contain constants/classifications only; exception messages, paths, JSON, tokens and credentials are never printed. The F10 notice includes the failure classification. Automatic console output is capped at eight changed preference diagnostics per plugin lifetime; `RichAudioSettingsStatus` prints the current preference, host-status and recorder classifications on demand.

Valid preferences load and remain editable without an audio host. Missing preferences expose supported, unsaved defaults. Unsupported or malformed existing files stay preserved and use the existing explicit recovery policy. Host processing status remains unavailable while the host is stopped. Recorder disconnection has its own stage/code and does not disable otherwise valid preferences. A connected SoundMap service can be ready while the acoustic host is stopped.

## Verification

`tools/Test-MenuDeploymentLayout.ps1` runs the actual .NET Framework menu bridge from a simulated RPH cache with no adjacent sidecar, and a separate game/Plugins/workspace arrangement. The local pinned-SDK variant uses the actual newly compiled combined RPH DLL; CI compiles the same shared components because the private SDK is not redistributed. Neither variant runs GTA or an endpoint.

The 34 checks cover old-resolution failure, corrected deployed resolution, saved preferences, supported defaults, Apply/persistence/reload, invalid and missing sidecars, unsupported settings preservation, precise safe diagnostics, background recovery, and connection/disconnection of the real local SoundMap service while the acoustic host remains stopped. Existing menu/controller, settings, recorder, DSP, GPU, history and guarded-audition regressions remain registered in the offline runner. Offline success is not proof of live RPH compatibility; the corrected binding still needs a supervised in-game check.

Reproduce:

```powershell
pwsh -NoProfile -File tools/Build-BeaconBridge.ps1 -SdkPath <pinned-authentic-SDK>
pwsh -NoProfile -File tools/Test-MenuDeploymentLayout.ps1 -PluginPath build/acoustics07/transport/RichAudio.Beacon.Rph.dll
pwsh -NoProfile -File tools/Test-Offline.ps1
```

## Next listening candidate

The fresh private candidate is `combined-083-review-05`; exact hashes are presented separately after verification. It retains the same 27-file reversible scope and tested restoration helpers, one launch/no retries, ten-minute loading allowance, Balanced/Auto, existing SoundMap/recorder, one original 600 Hz/.44 source, fixed guarded +12 dB trim and host gain .20, brief GPU verification, two existing bounded sensing sessions, Stop around +45 seconds and the strict 60-second host limit. The only functional changes are sidecar resolution and bounded menu diagnostics. Candidate 04 and its closed attempt/restoration evidence remain preserved. No new deployment, live launch or approval is performed by this increment.
