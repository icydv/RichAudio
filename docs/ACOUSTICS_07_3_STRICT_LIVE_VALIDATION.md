# ACOUSTICS-07.3 — Strict live transport and startup validation

## Outcome: stopped at launcher dispatch; strict session not executed

I authorised one supervised default-policy attempt using PR #52's reviewed
source `e08ad31d1822b052af169741476d94301b062e21`. Preflight passed and the
sealed temporary deployment was installed. I dispatched RPH once through
the established computer-use launch interface. The tool returned **"launched
app did not expose a targetable window"**. Follow-up window enumeration and
process inspection found no RPH or GTA process/window, and no runtime log was
created. I did not retry, use another launcher, change code or start the host.

This is **STOPPED AT LAUNCH DISPATCH**, not a transport rejection or a failed
audio-quality test. I cannot establish whether RPH briefly started and exited
or whether dispatch failed before process creation. The automation diagnostic
does not identify the runtime cause. No GTA launch was observed. I consumed
the authorised attempt rather than interpreting the absence of a game window
as permission for another launch request.

The original executable selection and all temporary additions have been
restored, with independent verification **PASS**. Strict live transport and
startup validation remain **PENDING / NOT EXECUTED**.

## Reviewed candidate and configuration

I built the host and bridge in a separate validation worktree from the same
reviewed revision. No acoustic, transport, camera, source or Windows backend
implementation changed. The source CI run
[40702624532](https://github.com/icydv/RichAudio/actions/runs/40702624532) passed;
its actual checkout was generated merge
`32c84783b2c0612470c83d5c1caaba551ed174eb`. Its tree matches the reviewed source
tree `998d233acefa5d099dc5370e3142b9062d85d0d9`.

| Component | Verified value |
| --- | --- |
| Enhanced executable version | 1.0.1158.16 |
| RPH runtime version | 1.132.1428.17748 |
| Authentic pinned SDK version | 1.124.1393.17586 |
| SDK SHA-256 | `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` |
| Host SHA-256 | `42D95BB0433E280A196CBEC602C325F67C6DE605D5F0B4CB44874810FB6EFC43` |
| Bridge SHA-256 | `ABE867C26A715A344A9192779BB3A9CE09959F4EA9019410E62A966C1C4C07DF` |
| Sealed 26-file manifest SHA-256 | `A125096B0C4D71F0F45811AFA400937745AA25B183A927BCFF3A039DE018E76E` |

The SDK pin is compile-time provenance, distinct from the supported runtime
version and from actual successful execution. The 26-file set was freshly
prepared from verified existing runtime dependencies and this new bridge
build; previous approvals, binaries and packages were not overwritten.

The prepared host invocation used the selected worktree's producer, one fixed
original harmonic beacon in the existing synthetic open-road metric scene,
48 kHz stereo Float32, strict listener pipe, 100 ms spatial and default
orientation buffers, 50 ms prediction, 250 ms freshness and the 120-second
cap. It was initially muted, without autostart, control exercise, capture,
headless clock, test barrier or experimental producer arguments.

**Experimental orientation was OFF.** My later instruction requested a
slightly louder harmonic, so the planned fixed gain was **0.12**, replacing
0.08 before execution (approximately +3.52 dB amplitude gain). No audio
played, so this run establishes nothing about the new level's audibility.

## Preflight and execution counts

Focused checks passed **645 host assertions** and **63 transport cases**.
Synthetic pipe tests used their own isolated test identities, not a probe
connection to the live pipe. The selected source still enforces one publisher
attempt, one accepted receiver connection, one-use bridge activation, frame
acknowledgements and acknowledged deliberate Stop. Those remain offline
capabilities until a real strict session is observed.

The existing format-only probe resolved the same previously used endpoint
and reported exact 48 kHz stereo Float32 support. It queries format support
without starting a stream. It did not construct a producer, start a listener
server, play a beacon or capture audio. Its process invocation is separate
from the **zero live host playback sessions** below.

| Event | Result |
| --- | --- |
| RPH launch requests | 1 |
| RPH process creation confirmed | No; no process remained at follow-up |
| GTA launches observed | 0 |
| Bridge loads / activations | 0 / 0 |
| Live audio host sessions | 0 |
| Publisher connection attempts | 0 |
| Accepted live receiver connections | 0 |
| Automatic retries / replacement launches | 0 |

There are no live accepted/rejected-observation counters, acknowledgement
records, renderer updates, underflow metrics or transport terminal stages.
They are **unavailable**, not measured zero-error results. No first frame was
sent, and no `InvalidDataException` or other protocol rejection was observed.
The only recorded failure is the launch-interface diagnostic above.

## Startup, listening and shutdown

No owned audio session started. Startup priming, camera-responsive stereo,
gaps, clicks, lag and delayed sound after Stop were not evaluated. I did not
ask for listening feedback about sound that never played, and I have not
converted my readiness confirmation into listening acceptance.

There was no bridge to Stop or unload, and no host/producer worker to shut
down. Acknowledged Stop was therefore **not exercised**. Process inspection
confirmed the selected host, selected Node producer, RPH and GTA were absent.
Unrelated applications were left alone; no process was killed.

## Independent restoration

I used the sealed existing session-restoration procedure, reversed the
temporary executable-selection rename and quarantined only the 26 unchanged
manifest-listed additions. Independent read-only checks then verified:

- All **32 original non-archive root files** matched their baseline hashes.
- Both original executable signatures were **Valid**.
- Original membership of **five top-level directories** matched.
- All **26 temporary destination paths** and the temporary executable alias
  were absent.
- All **179 archive byte lengths and UTC timestamps** matched exactly.
- All **10 existing sampled archive SHA-256s** matched.
- Relevant game/runtime/host processes and the selected producer were absent.

No unexpected generated game files required quarantine. Vendor files,
private receipts, backups and the unused host configuration are retained
outside the installation. Root/signature/directory checks and archive
metadata/sample-hash checks define this restoration PASS; I have not claimed
a full content hash of every archive.

## Evidence, publication and historical boundaries

Public scalar evidence is
`evidence/acoustics07-3-strict-live-result.json`. Full private manifests,
fresh authorisation/readiness receipts, launch diagnostics, binaries,
backups, probe identity and restoration receipts remain ignored. No raw
coordinates, personal paths, approvals, third-party binaries or captures are
published. No licence was selected.

This result branch is stacked on PR #52. Publication screening, remote head
and hosted CI are checked for the final result commit; the draft PR records
the actual CI checkout and tree relationship. Documentation-only result
publication does not change the tested implementation or repair the launch.

PR #49's qualified live connection and listening feedback remain historical.
Its rejected frame's exact cause is still unknown. PR #50's strict session
has not been live validated. PR #51's startup fix remains offline tested.
PR #52's faster orientation experiment remains opt-in, disabled here and
without device/listening acceptance. Earlier reports are unchanged.

## Next engineering action

My next action should be a narrow **offline investigation of the failed
launcher dispatch**, using the preserved diagnostic and available read-only
operating-system evidence. It should establish what prevented an observable
RPH process/window before any separately authorised new attempt is considered.
No alternate launch, retry or speculative runtime repair is performed here.

The combined ACOUSTICS-05 + BENCHMARK-01 record remains **60%**.
