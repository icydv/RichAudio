# PLAYABLE-05: first independent live SHV qualification

Follow-up: [PLAYABLE-06](PLAYABLE_06.md) ran a separately approved operator-armed
candidate once after a two-second running/stationary gate and obtained a plausible
nonzero point. The zero and interpretation below remain unchanged.

31 October 2026. Continues draft PR #76 from
`3a2640de41292c950eb4833f172e10f63ea3667d` on `feature/playable-01`.

**Actual result: one completed Script Hook V call returned zero while its
engine-running query reported false. Idle qualification is INCONCLUSIVE;
authentic operating-state integration and playable development remain BLOCKED.**
There was one approved deployment, one launch and one target attempt. No retry,
second launch, alternate hash, driving sequence or RichAudio audio test occurred.
GTA exited through the normal quit flow; the owned ASI was then removed.

## Candidate, preflight and specific authorisation

The procedure and build/fixture evidence in [PLAYABLE-04](PLAYABLE_04.md) were
read before deployment. The unchanged candidate was:

| Field | Verified value |
| --- | --- |
| ASI | `RichAudio.OperatingState.Shv.asi` |
| Length | 288,256 bytes |
| SHA-256 | `8f516dc5bdfd62f125c8f9624d3396c9c3f9debceb618c39f76784323fd7a083` |
| Game executable | Enhanced `1.0.1158.16` |
| Existing SHV DLL | `3889.0.1158.13`, pinned hash unchanged |
| Existing loader | `dinput8.dll`, pinned hash unchanged |

Build/source receipts, the six exact public SHV exports, AMD64 PE/import checks,
all 11 protected installation files and saved settings matched. The ASI and
exact pending path were absent, with no game/RPH/RichAudio host running. The
three prepared manifests matched their recorded hashes; no timeout override was
set. The prior 229 fixture assertions across 14 cases were preserved, not rerun
or relabelled as live evidence.

I was presented with that preflight and the automatic-trigger limitation,
then explicitly answered **"Authorise one live SHV qualification"**. The initial
PLAYABLE-05 prompt was not treated as deployment/launch permission.

Only the pinned ASI was copied to the manifest's `CREATE_NEW` pending path,
flushed and hash/length checked, then moved without overwrite into the game
root. Creation and installation receipts establish ownership. No SHV, loader,
RPH, DirectStorage, product package, source recording, asset or saved-setting
replacement was made. The existing `Launch RAGE Plugin Hook.cmd` route was
invoked once. Loading screens and the Story Mode session were observed through
computer-use tooling.

## Actual loading and call evidence

[Sanitised live evidence](../evidence/playable-05-live.json) separates these
observations:

| Question | Observation and evidence boundary |
| --- | --- |
| Did the ASI load? | The real ASI loader logged successful loading of the exact module. |
| Did SHV run its registered script? | The real SHV log records registration and `main()` launch; a new private capture journal was created. |
| Was the published identifier dispatched through SHV? | The production probe reports one `nativeInit`/argument/`nativeCall` sequence for `F9DDA40BC293A61E`, with a returned result. This is call-path completion, not independent proof of a mapped game handler. |
| Was return storage readable? | Non-null framework-owned storage was returned and its first four bytes were copied successfully. No raw address was retained or published. |
| What was returned? | Raw bits **`0x00000000`**, float **`0.0`**, classification `zero`. No scaling or replacement value. |
| Did a detectable fault occur? | `exceptionCode = 0`, `targetReturned = true`, `producerCompleted = true`, terminal `completed-unvalidated`; no deadline was reached. No claim is made about universal fault containment. |
| Was identity valid for this capture? | Both context snapshots identify model `0xF9300CC5` and the same local player, ped, vehicle and matching driver relationship, obtained independently through SHV. Private handles remain private. |
| Was this a qualified idle observation? | **No. Both snapshots report `engineRunningRaw = 0`.** I later confirmed a stationary, idling Bati, but that statement was not synchronised to the target instant. |
| Is a plausible nonzero operating-state signal established? | **No.** Only one zero was observed. |

The target took **5,058 QPC ticks / 0.5058 ms** at a QPC frequency of
10,000,000 Hz. Relative to callback/session start, its before/after timestamps
were **+50.7647013 s / +50.7652071 s**. The final context acquisition took
**0.0226 ms** and ended **0.0001 ms** before the target boundary. The armed
journal was flushed before dispatch; its marker alone is not invocation proof.
The completed result supplies the additional evidence of return.

Absolute QPC readings, process identity, native handles and exact file timestamps
are retained in the private capture. The public record carries the frequency,
relative acquisition/call timestamps, exact tick differences and cryptographic
capture hashes. `capture.json` is 865 bytes and `journal.ndjson` is 483 bytes:
**1,348 bytes combined**, within the 16,383-byte limit. The journal has three
records and the capture records 65 eligibility polls. The deadline was still
300,000 ms, measured from the registered callback, including eligibility wait.

The game remained responsive after the call. A subsequent screenshot showed the
player seated on a Bati and the existing RichAudio overlay reporting GTA stock
audio / RichAudio processing stopped. A screenshot after the call does not
establish engine speed or stationarity at the earlier acquisition instant.
No RichAudio audio host was observed during the supervised attempt.

## What the zero means, and what it does not

The most practical explanation to investigate first is the **automatic trigger
catching vehicle entry or engine startup before the intended idle state**.
The current probe checks identity/driver eligibility, records engine-running
context, and immediately calls the target. It does not require that context to
be true, wait for stable idle, measure speed or wait for human arming. That
limitation was disclosed before authorisation. The false context in both closely
spaced snapshots supports this explanation; it does not prove the physical
engine was off or that zero is the native's correct output.

A framework default result for an unresolved/unsupported target, or different
target semantics, remains possible. The reviewed generic SHV invocation contract
does not return a separate handler-resolution status. A non-null pointer and
finite zero cannot distinguish those possibilities. The engine-running query's
own behaviour was not separately qualified. This run therefore proves neither
native absence nor correct native resolution/RPM semantics. It also does not
diagnose the prior RPH failures or justify changing hashes, offsets or units.

**No multi-state experiment is proposed from this zero-only result.** The next
credible diagnostic route is a narrowly revised SHV single-call qualification
with explicit operator arming and a bounded, repeated engine-running-true
precondition before the one target call. Human confirmation should be tied to
that arming event, and any timeout/context change should still end with no retry.
Such a candidate would need its own offline review/build/fixtures, new artifact
receipt and specific live approval. It has not been implemented, built, deployed
or authorised here. The current ASI must not simply be relaunched as a retry.

If a properly controlled idle qualification remains zero/default-only, seek SHV
maintainer clarification about this exact Enhanced identifier and build before
introducing another framework. The retained
[upstream RPH report](UPSTREAM_RPH_ENGINE_TELEMETRY_REPORT.md) should still be
submitted through its official maintainer channel when authorised; it remains
unsubmitted. No new RPH probe, remapping or framework installation was performed.

## Normal exit, rollback and unchanged installation

The GTA quit dialog was opened and confirmation input was directed at its Yes
control. The computer-use helper reported a foreground-process-ID error at that
closing-window boundary, leaving that input's completion unconfirmed by the
helper; the action was not retried. Subsequent OS checks found the game/RPH processes
gone, and the SHV log records script unregistration during teardown. No forced
termination was used. Removal waited for process exit because the ASI is pinned
for process lifetime.

The [independent rollback verification](../evidence/playable-05-rollback.json)
checks the exact creation/installation receipts and owned hash. Only
`<game-root>\RichAudio.OperatingState.Shv.asi` was removed. Its pending path was
already absent. No recursive deletion, unknown-file removal or capture deletion
occurred. All 11 protected hashes and saved settings match the preflight;
stock fallback remains selected. No owned GTA/RPH/launch wrapper or product
audio/GPU host remains running. Private captures and before/after logs remain
under ignored local storage; the native source and compiled candidate are
unchanged.

## Decision and later audio requirement

**PASS:** one genuine production-ASI/SHV call-path result was obtained on the
actual installation, recorded without transformation, and cleaned up.
**INCONCLUSIVE:** handler resolution and an idling engine signal.
**BLOCKED:** authentic telemetry integration, multi-state validation and further
playable/audio development. No human listening result exists.

Once genuine live vehicle audio is established, the next relevant testing
requirement is synchronised capture of **RichAudio PCM and the Windows playback
mix alongside vehicle state**, for automated anomaly and latency analysis.
This remains a future acceptance requirement. No recording system, audio test,
revised playable installer, renderer, source playback, gold menu or gain change
was implemented in this increment.
