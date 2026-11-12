# GATE-A-SHVDNE-PRIVATE-02 — OpenRPF release qualification

**Outcome B — the loader candidate is credible, but a specific admission prerequisite is missing.** Codex resolved the release-identity error: my installed OpenRPF is byte-for-byte the ASI in the author's **0.3** package, despite its embedded `FileVersion=0.1.0`. A newer loader does not need to be introduced. The remaining blocker for my requested ordered A/B/C/D experiment is a supported, independently attributable **pre-assignment** observation of all three private audio registrations. Loader initialization and root-archive opening messages do not supply that observation.

Codex has preserved my working private resources, disabled probe and independent supervisor, independently reopened the archives, obtained and inspected the authentic 0.2 package for comparison, prepared a concrete nine-file installation/rollback inventory, and executed offline checks. No GTA launch, installed-directory modification, native assignment, production audio change, commit, push or publication occurred. No live authorization wording is issued because the admission prerequisites have not all passed.

## Release provenance and the corrected identity

The primary publication is [LSMP's OpenRPF release page](https://www.gta5-mods.com/tools/openrpf-openiv-asi-for-gta-v-enhanced/). Its version-specific links identify 0.3 as release **191025** and 0.2 as **185861**. The same version containers link full archive SHA-256 fingerprints through their VirusTotal URLs. Codex saved the actual page and matched those fingerprints to the packages before extraction. This is publisher-page/TLS provenance and byte integrity, not a signed release attestation or a reproducible source build.

| Release | Package bytes / SHA-256 | Sole member bytes / SHA-256 |
| --- | --- | --- |
| 0.3, 18 December 2025 | 323,315 / `ebc5102575e6fabd6dc380d631beb74653235a8ba103a803d96fdcd0a96c2769` | 1,173,504 / `57d6cc782d8608c32b5b43b74882a3ad162796e0215c58b8fcb2f7c7d9e9d3a8` |
| 0.2, 5 July 2025 | 150,108 / `1aca7b6eb8012199f222436a34bdbe49432a449536f6c7d0c4ec1523dfd1268c` | 398,336 / `75fa31e0a4da201293ab2f76a3cfc80eba289abbbed1d8131438314302d44a80` |

Both actual ZIPs contain **only `OpenRPF.asi`**. Neither contains dsound.dll, dinput8.dll, a README, another ASI proxy or a legacy OpenIV component. The current page's generic integrated-dsound description is not a version-specific archive inventory. Its changelog explicitly removes dsound in 0.2. The existing pinned dinput8.dll remains the sole ASI loader; there is no reason to install a competing proxy.

The 0.3 ZIP was already available in my Downloads directory. Both retained copies have the publisher-linked package hash, and their ASI matches my extracted and installed ASI. Its static banner reads `OpenRPF 0.3`; the PE file-version resource still reads `0.1.0`. The retained `AppData/Roaming/Los Santos Multiplayer/OpenRPF.log` also has a 0.3 banner, build timestamp 17 December 2025, and initialization stages 0–7 followed by `init success`. Its last-write time is 11 November 2026 at 09:41:57.8284742 UTC. That older log has no private-archive entries and is not contemporaneously bound to a captured executable identity, so it is supporting initialization history only.

The earlier PRIVATE-01 reports treated the embedded version as release identity. That inference was too strong. Their artifact hashes, offline results and statements that private mounting remained unverified are unchanged. Codex did not rewrite those sealed historical documents or receipts.

The 0.2 package was fetched from the version-specific download page's HTTPS CDN link and matched its published fingerprint. It was extracted only inside `.local/gate-a-shvdne-private-02`; it was not executed or installed. Its older compatibility scope gives no reason to substitute it for the already retained 0.3 binary.

## Compatibility evidence and limits

The author documents mods-folder redirection and support for OPEN and native encrypted archives. The changelog places automatic Gen9 cache bypass in 0.2 and a compatibility update for **1013.17+** in 0.3. These are credible grounds for selecting 0.3 for bounded qualification; they are not proof that my exact **1.0.1158.16** executable and private DLC work together. The examined publication does not separately certify that exact executable hash.

My original Enhanced archive hash remains `c3a68386a7d067772d6d6038ac505040e7280640205b230fdc1f829567cec913`. Codex has not deleted a cache, created `rpf.cache.disable`, installed an older dsound proxy, patched executable bytes or added custom interception. The existing root `rpf.cache` is **16,129,206 bytes**, SHA-256 `a71d4f9755ff26a6b2c8e04696bf78c4a5dd8ac88a9275072470bd98967f6845`, and remains unchanged; the disable marker is absent. Static presence of the cache filename in both ASIs corroborates only a literal, not execution of a particular bypass path. A draft audit incorrectly expected cache absence; the original preservation snapshot already pinned the present cache, so the draft and final check were corrected to that authoritative baseline before sealing.

Both ASIs are AMD64 PE32+ DLLs. Their ordinary import tables require Windows libraries, the x64 VC++ runtime (`MSVCP140.dll`, `VCRUNTIME140.dll`) and Universal CRT contracts. The existing x64 runtime files and .NET Framework prerequisite are recorded in `dependency-manifest.json`; no runtime replacement is proposed. Static import inspection does not enumerate every possible dynamic dependency or prove joint runtime compatibility.

The future stack would retain my existing pinned OpenRPF, dinput8, Script Hook V, DirectStorageFix and StraightToStoryMode. The matching retained SHVDNE v1.1.0.6 distribution supplies its ASI, INI, API2, API3 and MinHook.x64.dll. API3 is assembly version 3.9.0.0. Basic SHVDNE runtime observation was demonstrated with OpenRPF parked; joint OpenRPF + SHVDNE + these private mods is still unqualified. Their hook implementations are reviewed dependencies, not permission to introduce additional hooks. Exactly one proxy loader, one SHVDNE initialization and one isolated script discovery would be required in a future run, with no RPH launch or production RichAudio integration/host.

The lifetime-inclusive observation performance result and SMOKE-02B stop-deadline failure remain FAIL. This loader work neither relaxes those gates nor qualifies native suppression or production ownership.

## Archive and registration readback

Codex reopened the original archive, unchanged complete private shadow and private DLC with the retained pinned CodeWalker dev46 codec. This was a read-only operation; the initialization helper read executable disk bytes for codec setup, not GTA process memory. No resource or archive was regenerated.

```text
mods/update/update.rpf
  common/data/dlclist.xml: original 103 declarations, then exactly
    dlcpacks:/ra_private01_6a13f902/

mods/update/x64/dlcpacks/ra_private01_6a13f902/dlc.rpf
  setup2.xml
  content.xml
  x64/audio/config/ra_private01_game.dat151.rel
  x64/audio/config/ra_private01_sounds.dat54.rel
  x64/audio/sfx/dlc_ra_private01_6a13f902/ra_private01_marker.awc
```

All original DLC declaration text and order remain unchanged. The shadow retains 1,790 entries. Its full hash still binds the prior all-untouched-member comparison; the new review separately reopened and read the actual DLC list. Both candidate archives use OPEN tables. All five DLC members were found, and all three packed audio payloads were compared byte-for-byte with the retained resource inputs. `setup2.xml` binds the private device to `content.xml`; `GROUP_STARTUP` enables the single private change set. Its three declarations and `filesToEnable` names match exactly:

| Type | Logical name |
| --- | --- |
| AUDIO_GAMEDATA | `dlc_ra_private01_6a13f902:/x64/audio/config/ra_private01_game.dat` |
| AUDIO_SOUNDDATA | `dlc_ra_private01_6a13f902:/x64/audio/config/ra_private01_sounds.dat` |
| AUDIO_WAVEPACK | `dlc_ra_private01_6a13f902:/x64/audio/sfx/dlc_ra_private01_6a13f902` |

The physical REL suffixes, wavepack directory, bank stem, container/stream hashes and original marker are preserved. The private namespace remains `ra_gapriv01_bati`, hash `dd89929d`, with its prior bounded collision audit unchanged. The eight resource checks again reopened the REL/AWC graph and verified the marker PCM roundtrip. No Gen8 model/texture conversion or unrelated substitution is introduced. Structurally valid, source-matched resources still do not prove runtime registration, native gain or event selection.

The complete shadow is **3,122,239,488 bytes** (about 2.91 GiB); the DLC is **271,872 bytes**. The draft nine-file inventory totals **3,125,275,675 bytes** and reserves at least **3,662,146,587 additional bytes** including a 512 MiB margin. Available D: space at inspection was about 75.96 GB. The proposed fresh destinations do not require a second full archive backup because pre-existing mods/scripts would cause refusal. A different existing-mods case would need a new reviewed inventory and disk budget. This private full-copy experiment is not a production distribution strategy; it contains copied game data and is not redistributable. No redesign is necessary to evaluate the current artifact privately.

## Why the ordered live experiment is not admitted

| Phase | Required future evidence | Current state |
| --- | --- | --- |
| A — loader initialization | Session-bound ASI identity, 0.3 initialization success, one proxy/SHVDNE initialization/script, no errors or RPH activity | Credible selected binary; earlier unbound initialization log only |
| B — redirection | Current-session success opening the exact mods-side update shadow, with its bound disk hash and unchanged originals; errors fail | Archive/disk checks pass offline; no private runtime observation |
| C — resource availability | Supported independent runtime evidence that the exact private DAT151, DAT54 and AWC registrations are available before assignment | **Missing evidence mechanism in the retained tools and examined publisher contract** |
| D — non-silent identification | Only after A–C pass: one explicitly authorized request to disposable A, B unassigned, complete private marker in A and usable marker-free baselines/control | Blocked; retained probe remains compile-time closed and sidecar disabled |

The selected binary contains log literals for opening/successfully loading a modified root RPF and for file-open/pattern failures. Those literals can inform a future A/B evidence checklist, but their presence is not proof that such a log line was emitted, that each logical audio declaration became active, or that a private DLC file was read. No verified per-DAT151/DAT54/AWC success receipt was found in the retained log or reviewed interface. A missing, ambiguous or stale registration receipt must visibly leave C **UNVERIFIED/BLOCKED**; an explicit resource error is FAIL. Neither permits D.

The retained probe offers a default-horn readback and one-shot assignment. It has no validated pre-assignment query for these three registrations. A computed JOAAT name is not a resource-resolution query. A native call returning, an archive reopening in CodeWalker, a root-RPF load line, or an authored detector fixture cannot be promoted to C success. Conversely, a missing target marker cannot identify which registration failed.

My positive marker detector remains the decisive evidence for one private audible horn contribution. Obtaining that evidence through assignment would test registration and selection together, **after** assignment. It therefore cannot establish C as a prior condition under the sequence I requested. Codex has not silently reordered C and D or enabled the probe to bridge that gap.

The smallest next action is to settle this one evidence contract: obtain and review a supported pre-assignment registration observation for the three exact private resources, or explicitly revise the experiment to allow one isolated identification request to be the registration/selection measurement itself. The latter changes my stated order and needs my decision; no authorization wording for it is supplied here. No custom archive interception, cache-management infrastructure, resource redesign or broad reverse-engineering campaign is proposed.

## Completed offline checks

| Check | Fresh result |
| --- | --- |
| Authentic 0.3 and 0.2 ZIP inventory, CRC and full hashes | Passed; one ASI per package; no proxies/README |
| Read-only original/shadow/DLC reopening and actual manifest/payload readback | Passed |
| Resource closure, corruption/refusal and exact marker PCM roundtrip | 8 passed |
| Private marker detector | 16 passed, authored fixtures only |
| Disabled probe/controller, one-shot, identity and disk-refusal fixtures | 24 cases / 65 assertions passed |
| Independent supervisor | 109 assertions passed, including five real disposable-process scenarios |
| Loader/mock installation admission | 9 passed, including duplicate dsound/xinput, legacy OpenIV, missing/corrupt dependencies and unknown ASI refusals |
| Complete real-shadow mock install and rollback | Included above; all nine actual files installed into a fresh fake game, real 3.12 GB shadow verified, trainer backup/restoration, exact original inventory recovered |
| Existing rollback fixture logic in fresh task-local scope | 6 passed: absent/pre-existing files, unrelated-file preservation, active-runtime refusal, changed-target refusal and corrupt-backup refusal |
| Existing selected renderer, streaming, responsive-scene and PCM regressions | 78 passed, zero failures/skips |

The existing rollback fixture was copied only to adapt its repository/output root and point back to the original real DLC input; its original source remains unchanged. The first adapted invocation correctly refused the old output-root guard before mutation; the corrected invocation and both logs are retained. An initial HTML-label assertion also failed before dependency extraction because of intervening span markup; the original preservation snapshot was retained, rechecked and not overwritten. No failed attempt was removed or recast as a pass.

The first regression invocation used the existing suites' default Windows Temp location for authored PCM fixtures, which did not meet my requested confinement. Codex identified the nine retained directories by run timestamps, fixed test names and authored payload bytes, moved only those directories into this task's evidence directory after checking source/destination boundaries, and verified every moved file's hash. Streaming-test temporary directories had already been removed by their fixture cleanup. Codex then reran the 78 tests with both TEMP and TMP explicitly inside this task directory. Both results and `regression-temp-correction.json` are retained. This scope deviation did not affect GTA, original private artifacts or production code; it is not omitted from the execution record.

## Supervision and restoration boundary

The retained supervisor binary and probe are unchanged. Its stop path sets the revocation event before evidence or notification work, latches monotonic deadlines, checks exact process identity and detects monitor loss. Its Windows notice is TopMost and has explicit normal-exit/unresponsive buttons. The repeated process fixtures used `ShowUi=false`; full-screen notice visibility, my actual response and GTA's normal shutdown latency remain unqualified. The supervisor does not send game input, kill GTA, restore files, unload the DLC or restore a prior audio override.

The draft procedure preserves four different outcomes: exact disposable-vehicle retirement, process exit/resource lifetime, installation restoration, and prior effective profile recovery. Deleting A/B is not a DLC hot unload. Byte restoration is not audio-state restoration. No getter or compare-and-restore guarantee for an earlier vehicle profile has been established. No occupied or stale vehicle may be deleted for cleanup convenience; an unresolved lifetime or normal quit remains an explicit failure.

The proposed inventory and rollback details are in `GATE_A_SHVDNE_PRIVATE_02_PLAN.md` and `.local/gate-a-shvdne-private-02/loader-qualification-plan.json`. They are planning artifacts, not an admitted execution manifest, installer or permission to run. The original DLL remains hash `58cbc17c9f215fa9e60d8ff63f0e8479138d87bfe13ee664e9de861109edf16b` with `Admitted=false`; its sidecar remains `Enabled=false`. The supervisor remains `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca`.

The final private evidence index is `.local/gate-a-shvdne-private-02/result.json`, with exact dependency hashes, release-page snapshots, archive review, tests and preservation receipts. Historical evidence and original resources remain authoritative. The newer report corrects interpretation without changing their bytes.
