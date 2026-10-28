# ACOUSTICS-07.12 — startup cue and final candidate review

The revised candidate is **ready for separate approval review**, not authorised to run. It is stacked on draft #63 at `49848ace586f45d8a192542972f28cdd23f05379`. All work was offline: no game/RPH/real audio-host launch, deployment, installation changes, endpoint access/probe, playback, capture, approval receipt or launch token.

## Corrected cue

`host-launch-boundary` remains the monotonic origin immediately around host spawn. It means **clock started; wait**, not bridge activation. The independent supervisor emits `bridge-activation-required` once only after accepting the existing host banner: prefix `RichAudio shared output:` and suffix `Maximum 120 seconds; gain 0.2`. The current exact sealed host prints that banner after output readiness and listener-thread startup. It is **not an explicit pipe-bound or accepted-connection acknowledgement**. No probe connection or new runtime field is added. The remaining thread-start/bind scheduling race is a live-only uncertainty; a failed strict connection gets no retry.

The policy checks its absolute readiness deadline and terminal state before accepting the banner. Duplicates cannot emit another cue; missing or late output cannot rearm. The clock is never reset. Human frame acknowledgements and advancing valid renderer statuses remain separate requirements for one emission Start strictly before 25 seconds. The corrected [operator card](ACOUSTICS_07_11_OPERATOR_CARD.md) distinguishes all four cue meanings.

## Independent binding findings and correction

The supplied old candidate hash was verified before changes:
`DDC1CFF0AC8FC2980D3277680664A5DC58E268A7F7CEF9F1DA15203DDA6608B4`.
Its package, helper files and consumed approvals are preserved.

Tracing actual ESM imports and the producer's simulation-worker URL found **two production runtime dependencies missing from the old supplied binding list**: `tools/acoustics-06-scenes.mjs` and its `tests/fixtures/acoustics-scenes.mjs` import. Both are now bound at the preserved runtime root. The fixture-only `tests/operator/tree-fixture.mjs` was also omitted and is now covered. No production source is changed.

The old selected broker and separately constructed membership-query broker happened to identify the same binary, but the old preflight did not enforce that relationship. Both actual call sites now use the same source-derived path. Preflight rejects a different candidate entry/broker path, missing executed helpers, missing recursive imports and missing deployment sources. It still verifies all listed hashes. Regression tests remove a transitive module or broker binding and substitute a different broker/entry path to verify rejection.

The source walk follows the actual reviewed static literal ESM imports, literal dynamic import and literal `new URL(..., import.meta.url)` worker/module paths recursively. It is a bounded source audit, not an arbitrary JavaScript parser or execution sandbox. Manual inspection confirmed the current producer loads its simulation worker and scene definitions through those forms; Node built-ins are supplied by the separately hashed Node executable. Variable-computed fixture self-spawn is the same already bound fixture file. No unreviewed package/dynamic loader is used on the live path.

A second concrete private-helper mismatch was corrected in the **new copy only**: the restoration verifier's leftover-producer query inferred the operator checkout from its own directory, while the real producer runs at the preserved runtime root. It now reads the bound candidate `cwd`. This is a read-only verification filter; no process termination is added.

The private review records exact actual entry/import paths, selected and queried broker paths, Node binary and resolution environment, host executable/cwd/`--root`, producer closure, full arguments/output, original manifest and every one of its 26 source hashes. The new seal covers the revised helpers/card and previously omitted dependencies; the old hash is not reused.

## Preserved behavior and scope

Runtime remains `b5143db8c99decef49a8c9fdf1473f0c3db4840f`. Original host SHA-256 `847D5B59464A75DF67D9D2B51E5E444F1DF9D1D934C1CE8AD6F1F6ED20C5BAB7`, bridge `96EE4100BA2C2CCB2AB75A0664A3047A3BC293D5A8F43A3D37F21D09247EAFAD`, and manifest `64FC1B32CDEAE1877FA82B124EC827F0307005833A6EF36E9F444303E3A71BBA` remain unchanged.

1510 ms progress allowance; emission Start before 25 s; human bridge Stop cue at 45 s; abort without receiver deliberate Stop by 60 s; whole-job cleanup backstop at 65 s; verification bound 70 s. Exact job membership, suspended assignment, kill-on-close, independent active-process accounting, sender/receiver evidence ordering and post-exit reconciliation are retained. No runtime cadence, strict transport/freshness/prediction/ACK limits or 120 s cap changed. Human RPH commands only; one attempt, no reconnect/reload/retry.

Fixed profile remains 600 Hz / source 0.44 / explicit +24 dB / master 0.20 (existing maximum 0.25), 0.5 pre-master rejection ceiling, one harmonic source/open-road, both buffers 100 ms, experimental orientation OFF, Windows default output, initially muted/emission disabled, no capture or control exercise.

Installation remains the exact existing manifest: 26 temporary additions, GTA5.exe to _GTA5.exe temporary rename with original bytes retained, and only the enumerated generated-file quarantine scope. New copied restoration helpers use the new package's journal/quarantine, preserve changed/unexpected files for review, restore exact original name/hash, and independently check root files/directories/signatures plus archive metadata/sampled hashes. They were reviewed and syntax-parsed, not deployed/executed against the game. Fresh baseline checks are required in the later approval process. Owned-job cleanup never targets GTA/RPH or unrelated Node processes.

## Focused evidence and remaining uncertainty

Five new startup tests include actual contained adapter runs with a 320 ms banner delay (beyond the publisher's 200 ms connection timeout), duplicate banner, absent banner and a 650 ms banner after the scaled 600 ms readiness cutoff. They verify immediate zero launch origin, no early activation, exactly one valid cue, no late/missing Start, cutoff abort and independently verified host/producer cleanup. Two binding tests exercise recursive coverage and omissions/path substitution. The complete operator matrix has 31 tests; full repository and final hosted checkout verification are recorded with publication evidence.

The scaled fixtures do not demonstrate GTA focus, command delivery, an actual bound listener pipe, endpoint availability, live scheduling, sound/comfort or listening. Start issued, observed emission, evidenced nonzero submitted PCM, user verdict, acknowledged normal Stop and forced cleanup remain distinct. ACOUSTICS-07.9 stays incomplete with failed Stop timing; ACOUSTICS-05 + BENCHMARK-01 stays **60%**.

Remaining gate: separate review and explicit candidate-bound approval for one supervised attempt, including installation/game launch/human delivery and restoration. No live authorisation is created or assumed here.
