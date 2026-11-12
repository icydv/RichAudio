# GATE-A-SHVDNE-PRIVATE-01 — private audio registration

I now have a concrete offline DLC layout and a complete private update archive shadow. Codex built both from my retained Enhanced evidence, reopened them, and verified their contents. **I do not yet have a registration candidate admitted for live use with the installed OpenRPF 0.1.0.** The missing prerequisite is an evidence-backed archive-redirection and Gen9 cache-handling contract for that exact loader on Enhanced 1.0.1158.16. This is an uncertainty about compatibility, not a finding that the binary is incompatible.

My registration receipt therefore separates `completeShadowOfflineVerified=true` and `dlcLayoutOfflineVerified=true` from `offlineRegistrationAdmitted=false` and `runtimeMounted=false`. The disabled probe cannot turn these offline checks into runtime admission. Codex did not launch GTA, call a game native, read process memory, install files, alter a base archive, replace my loader, or change historical evidence.

## What changed from Marker A

The earlier private-profile assessment left the complete compatible `mods/update/update.rpf` shadow unresolved. The old Marker A package was a 2,048-byte archive containing a small authored vehicle fixture and registration metadata. It did not establish Enhanced mounting or a full real vehicle profile. I retain those results unchanged.

For this increment, Codex copied the entire installed Enhanced update archive into my task-local output, converted only its top-level directory table to OPEN, and replaced its DLC-list member with the original 103 declarations plus one private declaration. Every other raw file payload and its metadata was compared with the original. This closes the **offline complete-shadow construction** gap. It does not prove that my installed loader mounts the shadow.

The new resource graph is separately authored and validated from the retained real Bati records. Its private DAT151 root is `ra_gapriv01_bati`; the private contribution is an original non-silent horn marker. The rest of the vehicle's engine and other stock dependencies remain stock references. Resource, relocation, namespace-audit and identification details belong to the resource report and its manifest; the registration tools do not infer whole-profile resolution from a horn hash.

## Source-backed layout

The source evidence is the already retained installed content and setup XML, particularly `mpheist`, `mpapartment` and `mpbiker`. Their `AUDIO_GAMEDATA` and `AUDIO_SOUNDDATA` declarations use logical `.dat` names, while the physical files have `.dat151.rel` and `.dat54.rel` suffixes. `AUDIO_WAVEPACK` names a directory containing AWC banks. The old Marker A declaration used a full physical REL suffix; this candidate follows the installed logical naming instead.

The candidate's entire archive contains these five files:

```text
dlc.rpf
  setup2.xml
  content.xml
  x64/audio/config/ra_private01_game.dat151.rel
  x64/audio/config/ra_private01_sounds.dat54.rel
  x64/audio/sfx/dlc_ra_private01_6a13f902/ra_private01_marker.awc
```

| Declaration | Logical resource name |
| --- | --- |
| `AUDIO_GAMEDATA` | `dlc_ra_private01_6a13f902:/x64/audio/config/ra_private01_game.dat` |
| `AUDIO_SOUNDDATA` | `dlc_ra_private01_6a13f902:/x64/audio/config/ra_private01_sounds.dat` |
| `AUDIO_WAVEPACK` | `dlc_ra_private01_6a13f902:/x64/audio/sfx/dlc_ra_private01_6a13f902` |

`setup2.xml` binds device `dlc_ra_private01_6a13f902` to `content.xml`. Its `GROUP_STARTUP` enables exactly one change set, `ra_private01_6a13f902_STARTUP`, whose three `filesToEnable` entries match the declarations above. Each is initially disabled and non-persistent. The archive contains no replacement vehicle model, shared-stock record replacement, script, DAT10 file, unregister operation, or unrelated resource. The setup uses compatibility-pack type, order 50, minor order 0. These are explicit candidate settings; they are not measured runtime resolution precedence.

The private list declaration is `dlcpacks:/ra_private01_6a13f902/`. The original declarations retain their order and text; the private declaration is appended once. The candidate does not rely on overriding a stock audio name. The resource agent's collision audit is bounded to the retained dictionaries and bank tables, rather than a claim to have inspected every currently loaded DLC audio record.

The SimpleSound container spelling `dlc_ra_private01_6a13f902/ra_private01_marker` follows the installed wavepack-directory/bank-stem convention. Codex independently checked the retained mpheist registrations and physical banks: `dlc_mpheist/lectro` hashes to `1e827720`, and `dlc_mpheist/van_1_eur_4cyl` hashes to `380d592a`; those hashes occur in the corresponding stock SimpleSound records. Its ContainerPaths table uses uppercase backslashes, also matching the private resource's name-table spelling. This establishes a concrete schema precedent, not a live mount observation.

The relevant retained evidence is under:

- `C:\Users\Libby\Documents\RichAudio-StockSource01\.local\stock-source-01\provenance\mount` and `provenance\raw-confirmed`.
- `C:\Users\Libby\Documents\RichAudio-World13\.local\street01-installed-completion01\resolved01\resolved-catalog.json`, property `AudioRegistrationMetadata01`.
- `C:\Users\Libby\Documents\RichAudio-World13\.local\street01\gate-a-profile-01b`, including the exporter receipt and real game/sound XML.
- `.local/gate-a-shvdne-private-01/registration/stock-wavepack-hash-crosscheck.json` and `heist-bank-names.json` in this worktree.

## Archive integrity and pins

Codex used the retained CodeWalker dev46 binary, SHA-256 `3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8`. The inspected source checkout is revision `485d56bec00262ed7fa472261cce7bbc6202b96e`. The relevant public implementation is [RpfFile.CreateFile and SetEncryptionType](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/RpfFile.cs), with [DlcSetupFile](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/DlcSetupFile.cs) and [DlcContentFile](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/DlcContentFile.cs) used for manifest readback. Source revision and retained binary identity are recorded separately; this is not a claim of a reproducible binary build.

The initialization helper read the installed executable's **disk bytes** through the existing CodeWalker initialization path. Its historical route label contains “memory”; that refers to the byte-array input API and does not describe process-memory access. No secret values were printed or persisted.

The complete shadow retains 1,790 top-level entries: 646 directories, 1,074 binary files and 70 resource files. The changed DLC list is one binary file. All other 1,143 file payloads retain identical raw SHA-256 values, sizes, encryption metadata and applicable resource flags; all 646 directories are unchanged. Nested archive payloads were compared as whole raw files. Codex did not deserialize and reserialize their resource contents or convert Gen8 resources into Gen9 resources.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Original installed `update/update.rpf` | 3,122,239,488 | `c3a68386a7d067772d6d6038ac505040e7280640205b230fdc1f829567cec913` |
| Complete private shadow | 3,122,239,488 | `d9de412ed396f707a351dec90e521390df212566c41e5b34c6acb22194acec19` |
| Private audio `dlc.rpf` | 271,872 | `ff7c1d818366df4571e9bb3c081c3199fca5709dfb8c74b0a44cb8017dc3cba1` |
| Existing `OpenRPF.asi`, file version 0.1.0 | 1,173,504 | `57d6cc782d8608c32b5b43b74882a3ad162796e0215c58b8fcb2f7c7d9e9d3a8` |

The original update archive's before/after hash is identical. The original DLC-list SHA-256 is `86a6bb9c5c8858404fd7d73b9116fb6f31a683023f058082892a9e710e1bccbc`; the candidate list is `3fffcf3cc5d13ee150ad23c3ba1cec538bfbdd9a5a5c60a04b33e676ecc79412`.

## The remaining loader prerequisite

The supplied `C:\Users\Libby\Downloads\6d0158-OpenRPF` contains the same 0.1.0 binary as my installed `OpenRPF.asi`, with no matching README or source. The [author's OpenRPF page](https://www.gta5-mods.com/tools/openrpf-openiv-asi-for-gta-v-enhanced) describes mods-directory redirection and OPEN archives, but the displayed release is 0.3. Its changelog puts default cache bypass in 0.2 and a compatibility update for 1013.17+ in 0.3. Those later claims do not establish the exact behavior of my 0.1.0 binary on 1.0.1158.16.

My successful SHVDNE smoke runs parked OpenRPF. They qualify the basic managed integration, not this loader or private resource mounting. Older ASI-load log lines likewise establish binary loading, not the resource-redirection and cache behavior required here. Codex did not replace the loader, create a cache-disable marker, modify the game's cache, or start a broader loader investigation.

I need a specifically identified loader and cache-handling procedure supported for this Enhanced build before this package can be admitted as a live registration candidate. A successful native assignment call, a serializable REL, or a complete shadow does not supply that missing evidence. Runtime resolution of a missing private resource has not been established; it must not be classified as a successful fallback or a successful assignment.

## Local outputs and recovery boundary

All new binary outputs remain private under `.local/gate-a-shvdne-private-01`; the complete shadow contains my installed game data and is not a redistributable artifact. The canonical registration receipt is `registration/registration-admission.json`. It binds the resource manifest, DLC receipt, complete-shadow receipt, existing loader identity and these proposed destinations:

| Private source | Proposed destination relative to GTA root |
| --- | --- |
| `registration/shadow-01/update.rpf` | `mods/update/update.rpf` |
| `registration/dlc-01/dlc.rpf` | `mods/update/x64/dlcpacks/ra_private01_6a13f902/dlc.rpf` |

These are documented paths, not installed files. No mods directory was created in GTA. Any later, separately admitted installation must first record whether each destination and its parents already exist. After a normal game exit, restoration must remove only newly created, identity-matching private files or restore an exact prior snapshot. A pre-existing mods archive cannot be overwritten on the assumption that it is disposable.

Removing a disposable test vehicle is distinct from unloading the DLC, restoring installation files, or restoring an existing vehicle's previous effective audio profile. This package claims none of those runtime guarantees. No previous-profile getter, stock-name restoration guarantee or independent failure recovery is assumed.

The tools are `RegistrationShadow.ps1`, `RegistrationDlc.ps1`, `RegistrationVerify.ps1` and `RegistrationTest.ps1` under `tools/native-control/private-profile`. They require fresh task-local outputs and reject linked paths. The DLC builder binds all three resource payloads to the resource manifest, reopens the archive, checks every member byte, and parses the startup declarations. The verifier rehashes the original archive, candidate artifacts and existing loader and always leaves registration admission false.

Six actual offline checks passed in `registration/checks-01/test-results.json`: valid artifacts remain unadmitted; out-of-scope output is refused; missing resources are refused; a modified AWC is refused; a receipt cannot grant itself admission; and a modified packed archive is refused. These checks used disposable local copies. They do not qualify game loading, playback, resource unloading or elapsed live-test supervision.

Codex also exercised actual file installation and restoration in six test-only cases through `tests/Test-PrivateRegistrationRollback01.ps1`, with results in `.local/gate-a-shvdne-private-01/rollback-fixtures-01/rollback-results.json`. This script accepts only a fresh task-local `rollback-fixtures-NN` directory and creates fixed fake installation roots beneath it. It has no game-root argument or real installation route. Each case copies the actual hash-bound private DLC and a small, explicitly authored update-archive stand-in; the stand-in is not a valid RPF and the 3 GB shadow is not duplicated.

The initially absent case returned to its exact empty inventory after removal of the matching new files and empty directories created by the fixture. The pre-existing case restored both original user-archive stand-ins byte-for-byte. An unrelated file added after installation survived, together with its nonempty parent directories. Three refusal cases verified that a still-running state, a modified new file, and a corrupted backup cause no installation mutation. All target and backup hashes are checked before the first restoration operation; per-file checks are repeated immediately before mutation. Removal uses native PowerShell `Remove-Item -LiteralPath` on individual known files or verified empty owned directories, with no recursive deletion.

These are executed rollback operations on disposable files, rather than hash-comparison fixtures alone. The running/stopped input is authored test state, not an observation of GTA; the independent supervision fixtures cover their own process boundary separately. This test does not establish crash or power-loss atomicity, protection against a concurrent external writer, in-game resource unloading, prior-profile restoration, or OpenRPF compatibility. Registration admission remains false.

My SHVDNE observation-performance gate and the prior live stop-procedure result remain failed. This registration work does not change those outcomes or qualify Gate A replacement.
