# STREET-01: metadata preparation isolated from scene delivery

I approved a bounded metadata-preparation and atomic-installation change after the authored concurrent-publisher fixture demonstrated a 607.111 ms wait before worker receipt, followed by only 2.788 ms of actual scene work. That demonstrates a production scheduling weakness; it does not establish request1195's historical cause. Proposal10 and proposal11 remain failed and consumed.

Codex moved full manifest reading/decoding, catalogue verification, projection/interior derivation, resource/proof row reconstruction, owner-key preparation and coverage computation onto one reusable metadata-only worker. The helper never opens geometry chunks, archives, audio banks or endpoints. It reads each manifest once; `reload()` consumes that same parsed input on the helper instead of reading it again. The synchronous world API remains available to existing offline callers; the production scene worker uses the prepared path.

There is one preparation in flight, one installed version and at most one candidate in staging. Changes observed while busy coalesce into a fresh preparation after the current candidate; superseded candidates do not install. Transfer uses ordered packets of at most 32 KiB / 256 operations, one acknowledgement outstanding. The scene worker yields between packets. Shared object identity is preserved, staged nodes are sealed, and the complete stream digest must match before the private staging brand is granted. Input metadata retains the 64 MiB file bound; staging additionally limits total wire bytes to 256 MiB, four million operations, depth to64 and individual string values to16 KiB. Oversized, malformed or incomplete preparation fails closed rather than silently weakening validation. The helper has a 512 MiB old-generation heap cap and an eight-second preparation/transfer watchdog. These are bounds and failure behavior, not a large-world memory qualification.

Installation replaces prepared row/coverage/projection indexes and increments the one-shot selection revision. Resident owners are checked through precomputed keys, bounded by the existing maximum16 residents; affected components/query views are invalidated. Unchanged owners retain their existing immutable geometry cache. The scene worker does not rebuild the catalogue's selected-resource index during later resource classification. It performs no full manifest parse or metadata-row reconstruction on this path. Small filesystem identity checks, bounded staging/hash work, cache invalidation and ordinary scene construction remain synchronous; this is not a hard worst-case execution-time guarantee.

## Integrity and authority during refresh

- Before a changed publication has been validated, the worker issues no new scene lease from it. Already active geometry has only its original observation deadline; pending work cannot refresh or extend that deadline.
- After parsing, the helper compares the installed catalogue/game/parser/epoch/fingerprint and all previously qualified resource identities/proofs with the new publication. It sends a separate bounded proof verdict before slower unrelated index reconstruction/staging. If those authorisations remain identical and the publication stamp still matches, the installed conservative view can produce fresh observations while unrelated metadata preparation continues. Newly prepared resources do not enter that old view prematurely.
- If unchanged authority cannot be established, new scenes wait for complete validation. A confirmed withdrawal of the watched active proof invalidates that consumer immediately when the verdict arrives. No timestamp or proof is invented while waiting; failure to renew before original expiry remains a sticky gap.
- A catalogue or epoch change cannot borrow old authorisation. Wrong game/parser/catalogue content fails closed; a non-current normal epoch withholds scenes. New catalogue installation advances the existing binding epoch and revokes the old binding.
- The complete candidate must still match the current publication identity at installation. A superseded candidate is discarded and the latest publication is prepared. Consumer tickets are also version-bound, so a queued old-version candidate cannot apply after metadata replacement.
- Preparation/protocol/digest failure stops the service. Shutdown cancels staging, terminates and joins the metadata helper before the scene worker closes, retaining the existing stop fence and late diagnostic profile behavior.

Proof withdrawal is detected by polling/request observation plus metadata validation; this is not instantaneous filesystem-change detection. During that detection interval, the existing scene has its original finite lease, never a grace extension. The compact verdict is an owned helper-channel result tied to the requested publication, not a user-supplied proof flag.

## Focused result

All **21 directly affected checks passed** on Node24.19.0:

```powershell
node --test --test-concurrency=1 tests/Test-InstalledSceneLifecycle01.mjs tests/Test-SceneReadinessService01.mjs tests/Test-InstalledStaticReuse01.mjs tests/Test-PreparedWorldMetadata01.mjs tests/Test-SceneWorkerProgress01.mjs
```

The concurrent publisher uses authored metadata and the actual bankless StockGameplay queue/application boundary. The existing 300 ms manifest-read control remains. A separate 300 ms helper graph-preparation hold verifies that renewals continue before unrelated staging finishes. Both delays are injected correctness controls, not genuine disk performance.

| Measure | Retained blocking case | Isolated metadata case |
| --- | ---: | ---: |
| Dispatch to worker receipt | 607.111 ms | maximum 0.345 ms |
| Background proof check, final refresh | unseparated | 312.257 ms |
| Background metadata construction, final refresh | unseparated | 314.126 ms, before the extra staging hold |
| Maximum staging callback | unseparated | 0.362 ms |
| Maximum metadata installation | unseparated | 1.729 ms |
| Actual consumer applications / fresh renewals | no continuity pass | 11 / 10 |
| Supported validity gaps | blocked at440 ms | 0 |
| Minimum replacement overlap | unqualified | 63.519 ms |
| Scene worker joined | yes | exit0, 4.158 ms |

Exact surface/material/reflection/provenance parity passed against the synchronous reference world and across renewed scenes. Current proof withdrawal invalidated the affected scene without a later stale application. Separate checks reject superseded preparation, corrupted/incomplete staging, wrong game metadata and changed epoch; a new validated catalogue installs with a new binding. The final fixture recorded zero rendered frames. Existing lifecycle, source-byte corruption, owner invalidation and sticky-expiry checks also passed. All private before/after results, interim failures and diagnostics remain retained.

An earlier verification command mistakenly included the existing admission suite, which runs authored procedural PCM. Codex excluded it from the final population; no endpoint, game audio, playback or capture was involved. That earlier run remains preserved rather than being represented as zero audio processing.

This corrects the demonstrated blocking mechanism in the supported authored case. It does not qualify genuine installed-cache startup after this architecture change, large/dense metadata staging costs, memory under the full workload, GPU hardware, GTA frame times, audible latency or a playable release. The full historical/normal-startup populations were not rerun. Metadata pressure beyond the declared bounds, supersession pressure or missed original deadlines can still fail closed and produce a reported gap. No proposal12, new genuine read, deployment, game launch or merge was performed. This is a concrete infrastructure checkpoint for reassessing a controlled Bati demonstration, not permission or qualification to launch one.
