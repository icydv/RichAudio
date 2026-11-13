# PRIVATE03E — Windows dependency reconciliation

I requested a focused, offline reconciliation of PRIVATE03D's22 Windows dependency differences. Codex kept GTA and OBS closed, changed no system/game files and used no elevated diagnostics, repair or update operations. The result is **A — verified legitimate servicing**, with a separately qualified exact baseline. This preparation is for my fresh review; it does not authorize execution.

## Attribution and complete comparison

The old and current byte identities for all22 DLLs were recovered from retained WinSxS components. For every changed file, the historical copy matches the old SHA-256/length, and the current System32 file shares the file identity of its installed WinSxS component. Current Authenticode/catalog verification reports Valid, Microsoft Windows publisher, OS binary status and an offline certificate chain to Microsoft Root Certificate Authority2010. All22 changed files have successful current-time chain validation as well.

The current registry identifies build26200.9974, display version25H2 and base BuildLabEx26100.1.amd64fre.ge_release.240331-1435. Its ProductName still says Windows10Pro; Codex records that raw value rather than treating the registry branding as the build identity. Current component/package versions belong to the26100 branch, with the changed component cohort at9818/9974. Binary version resources can be older than the enclosing serviced component version; a resource version alone does not determine integrity.

The existing Setup event record719 reports KB5132061 successfully Installed at2026-11-13T01:01:06.580278Z, error0x0, client UpdateAgentLCU. CBS records the26100.9974.1.23 rollout completing startup installation with hr0x0 at01:00:44, and last boot at01:00:58.500. The current rollout registry state and signed catalogs are consistent with that completed update. The earlier record shows staging and a required reboot. No servicing/update reboot-pending key was present during qualification.

This is a consistent trusted servicing transition, supported by both old/current components, file identities, signed catalog membership, rollout completion and reboot/event chronology. A signature alone was not the attribution. Exact per-file replacement instants were not recovered; LastWriteTime is not treated as the time a System32 link changed. Compressed DCM component manifests were fingerprinted and associated by exact WinSxS identity; Codex did not invent decoded XML contents.

The22 files are ADVAPI32.dll, bcrypt.dll, CFGMGR32.dll, CRYPT32.dll, DSOUND.dll, IMM32.dll, IPHLPAPI.DLL, KERNEL32.dll, MF.dll, MFPlat.dll, MFReadWrite.dll, ole32.dll, OLEAUT32.dll, PROPSYS.dll, RPCRT4.dll, SETUPAPI.dll, SHELL32.dll, USER32.dll, WININET.dll, WINMM.dll, WINTRUST.dll and WS2_32.dll. KERNEL32.dll/KERNEL32.DLL are two historical contract rows for one file:23 rows change,22 unique files.

The local `dependency-comparison-22.json` contains full paths, both hashes/lengths/versions, recovered historical component paths, current canonical/device/file/birth identities, publisher and certificate-chain evidence, actual catalog membership/catalog identities, current component association, timestamps and static consumer relationships. All22 historical versions were recovered by exact byte match, not inferred from filenames. Static imports and source PInvokes distinguish known consumers from unobserved dynamic/transitive loading. No GTA module activity is claimed.

This servicing happened after my consumed PRIVATE03C game had closed. It does not identify the old supervisor's missing comparison operand or replace PRIVATE03D's bounded uncertainty about that failed live field.

## Narrow policy decision

Private resources, probe, supervisor, original watcher, marker detector, loaders, Script Hook V, OpenRPF, deployment inputs and unchanged redistributables remain exact reviewed bytes. Codex changed only the23 explicit Windows contract rows corresponding to the reviewed22-file cohort. The previous PRIVATE03C/03D contracts and seals are preserved, including the permanently blocked03D review manifest.

The new baseline checks all33 unique System32 prerequisites in the retained contract. Only the22 reviewed serviced names may receive new hashes. Other prerequisites must still match their historical fingerprints. The new execution manifest pins the actual qualified hashes. Read-only admission additionally compares exact OS build, canonical location, NTFS identity, PE architecture, file/product versions, current WinSxS component and compressed-manifest hashes, catalog member digest, exact catalog bytes/identity and verified publisher/chain identity. Catalog member digests are Authenticode digests, distinguished from raw SHA-256.

Several unchanged older components have a present-day generic X509Chain NotTimeValid diagnostic, while Windows' timestamp-aware Authenticode/catalog verification remains Valid. Their old exact hashes are retained; the diagnostic is not hidden or mislabelled as tampering. It is pinned and compared. All22 newly baselined files have successful present-day chains. No global certificate/security policy is changed.

Any later hash, location, file identity, component, catalog, publisher, dependency-set or OS drift fails admission. A Microsoft-looking name or a new valid signature is insufficient. There is no automatic update acceptance, old-DLL restoration or compatibility bypass.

## Minimal versioned implementation

New source under `tools/native-control/private-profile03e` provides file/catalog evidence collection, an exact Windows comparator, exact new Git/manifest admission and thin manager/watcher entry wrappers. The collector uses the existing PowerShell7/.NET compiler and Windows trust/catalog APIs. It installs nothing and uses no target process. No production audio source changed.

The wrappers reuse the unchanged03D transaction/recovery algorithm and watcher implementation. They replace the preparation root/admission contract and qualify Windows before installation admission and watcher entry. The probe remains SHA-256 `fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0`; the supervisor remains `b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020`. Neither was rebuilt. The original resources/full shadow and detector remain unchanged.

Protocol identities intentionally remain compatible: the unchanged probe is PRIVATE03C; the unchanged supervisor expects manifest experiment PRIVATE03D; the separate preparation/reconciliation is PRIVATE03E. The new envelope records both `experiment=GATE-A-SHVDNE-PRIVATE-03D` and `preparation=GATE-A-SHVDNE-PRIVATE-03E`. This does not reuse an approval, session or execution directory. The new03E session and execution directory are separately preallocated and unused.

## Verification and limits

Focused tests cover actual current qualification, all22 wrong-hash/location/component/signature cases, missing/extra dependencies, OS/catalog/root/publisher/architecture drift, rejection of unsupported additional replacement, dirty/wrong Git identities, changed probe/supervisor/loader bytes and old authorization digests. A real authored unsigned fixture is rejected. The existing compiled03D harness, supervisor and watcher are reused for process identity, lifecycle, failure, deadline and restoration tests; no production supervisor is recompiled.

A disposable watcher-owner exits normally while the independent monitor continues enforcing its original stop/deadline. The test retains a separate operator pipe to stand in for the live Form buttons, then completes normal target exit/restoration. It does not claim that the production watcher's pipe survives its exit or prove fullscreen visibility. Actual direct notice acknowledgment and normal GTA exit remain my responsibility under the existing bounds.

Complete copied-root installation/recovery uses the new plan with the actual9 game/3 OBS files and unchanged3122239488-byte shadow, preserving backups and exact restoration. Native authenticity and exercised metadata/synchronization/catalog operations are qualified offline. GTA/ASI initialization, actual capture, current notice visibility, shutdown latency and private resource playback still require their explicit live entry gates.

Codex finishes source commits before producing the final execution seal. The final result, exact commit, regression totals, successful real-root read-only preflight, all artifact hashes, preservation receipts and fresh authorization are recorded in the new local package. The original RPH worktree and protected Build-Menu02.ps1 change remain untouched.
