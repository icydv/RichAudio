# GATE-A-SHVDNE-PRIVATE-03C — installation recovery and independent supervision

I requested autonomous offline engineering while I was unavailable. Codex kept GTA, RPH, SHVDNE-in-GTA, OBS and the production audio host closed. This component review changed only a separately versioned installation manager and added disposable offline tests. My PRIVATE-03 approval remains consumed; neither the preserved PRIVATE-03B proposal nor this new preparation is live authorization.

The preserved PRIVATE-03B manifest remains `b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237`. Codex did not edit its manager, plan, sources, receipts, binaries or historical fixtures. Its successful normal install/restore results remain valid within their original coverage.

## New defects demonstrated offline

Codex injected interruptions into the actual PRIVATE-03B manager methods on small authored roots with the complete expected DLL/ASI names. In one case an interrupted first SHVDNE copy left a 123-byte target before its action was logged. Restoration preserved that file but did not complete. In another case restoration stopped after removing its first installed file; a second call refused with `Changed game target; no mutation`, despite the retained archives. These were newly demonstrated recovery gaps, not a loader incompatibility or private audio-resource defect.

The demonstrations are retained in `.local/gate-a-shvdne-private-03c/install-supervision/original-interruption-demonstration.json`. Their fixtures contain authored bytes and are not substituted evidence of authentic GTA resources. Two early fixture-setup errors concerned a Windows path-length mapping and a test-relative-path assumption; they occurred before installation methods ran and were corrected without touching a real installation. The partial disposable setup directories remain retained.

## Separately versioned correction

`tools/native-control/private-profile03c/Manage-Installation.py` inherits the sealed PRIVATE-03B loader, destination, process and integrity admission checks. It replaces only installation/restoration with a transaction recorded outside the game beneath the same attempt's `execution-01`. The final manager SHA-256 is:

`3fa48c6bdf8e5854466864a2d898c59fa5a97bd9a3554b29426411048279fb48`

All backups must be complete and verified before a target changes. The manager records each park/copy intent before the operation, opens a new target exclusively, and durably records its device, file identifier and creation time before writing its first content block. A hard-linked or replaced target fails validation. Installation remains one-use: an existing attempt directory refuses another installation.

Recovery accepts immutable new targets only when complete bytes match the pinned source or when the target is an exact source prefix with the matching durable exclusive-create identity. Partial files are archived before removal. Complete immutable files can retain the identical pinned source as evidence rather than create another 3.12 GB archive copy. Modified content, stale identity, altered creation proof, missing ownership evidence, changed source prefixes, corrupt backups and read-only original drift stop recovery without deleting the uncertain target.

Restoration records verified archives and removal/restoration intents per file. A later call resumes the same file-recovery transaction and verifies already completed work. It cannot start another game session, renew a deadline, rearm the probe or permit another assignment. Evidence archival and a partially copied original can resume only with matching source, identity and exact-prefix proof. The original `user.ini` overlaps an installed private OBS target; a dedicated recovery state distinguishes the partially restored original from the previously archived temporary configuration.

There is an intentional limit: interruption between exclusive file creation and its durable creation proof can leave an unproven empty file. The manager preserves it and refuses automatic deletion. Malformed transaction metadata likewise requires review. These guards establish bounded demonstrated recovery, not a promise to repair arbitrary corruption or every power-loss ordering. They never infer ownership from a filename alone.

The manager snapshots original OBS directories, including empty directories. Cleanup removes only empty approved created/runtime directories. Existing empty private-profile directories and unrelated matching names remain intact. Unknown game/OBS files or directories, root DLL/ASI additions and cache flags are preserved and rejected. Final verification compares the original OBS directory inventory as well as the file hashes and exact loader inventory. There is no recursive cleanup.

The new proposal reserves additional worktree space for recovery archival. Its `reserveRecoveryArchiveBytes` is **3,149,313,024 bytes**, the largest staged file plus largest backup. Together with the existing backup, capture and margin requirements, worktree admission requires **4,788,331,811 bytes** free before installation. A test with space sufficient for the old requirement but insufficient for recovery now fails before mutation. The nine final game files, three temporary OBS files and Trainer-only parking scope are unchanged; no game-side staging file was added.

## New test coverage and authentic full-shadow rehearsal

The final source passed **110 new offline manager checks**:

- **96 transaction, negative-admission and process-policy checks:** eleven install interruption positions; eight restore interruption positions; interrupted archival; repeated-install refusal; idempotent file recovery; changed content/identity/creation proof; hard links; missing/wrong-session proof; corrupt backups/archives; read-only drift; unknown files/flags; loader and dependency faults; shadow/source corruption; destination conflicts; both space limits; stale process/session bindings and consumed-approval rejection.
- **4 actual multi-block prefix checks:** a 1 MiB partial target from a larger authored source, durable ownership proof, archive-before-removal and exact recovery, plus changed-prefix refusal.
- **5 overlapping original OBS recovery checks:** empty and multi-block partial `user.ini` restoration, and changed prefix, identity or intent refusal.
- **5 directory-ownership checks:** existing empty destination and unrelated matching directories, idempotent exact directory restoration, and preservation/refusal of unknown new game/OBS directories.

The final receipts are `transaction-fixtures-r5.json`, `prefix-fixtures-r5.json`, `obs-recovery-fixtures-r5.json` and `directory-fixtures-r5.json` beneath `.local/gate-a-shvdne-private-03c/install-supervision/`. They bind the same final manager hash. Intermediate development runs remain retained and are not the final qualification.

Codex then performed one full rehearsal using the final actual prepared nine game files, three OBS files and **3,122,239,488-byte** private update shadow on copied game/OBS/external roots. The plan hash was `14d64691dda8884b66720af895dba4a5e3c129ddbcb7b1f0aff3dfed3e4e3135`. Target hashes passed; both loaders remained exact; Trainer alone was parked; authored journal/settings changes were archived; exact original inventory returned; and a second restoration call verified the same result. All 68 actual protected originals and 29 actual OBS originals were reread unchanged. The shadow retained SHA-256 `d9de412ed396f707a351dec90e521390df212566c41e5b34c6acb22194acec19`. It was reused, not rebuilt.

`full-install-restoration.json` records that rehearsal. Its generated journal and SHVDNE log are explicitly authored fixture content, not runtime initialization or native-call evidence. No installer/restorer operation targeted the real GTA or OBS installation.

## Independent supervisor validation

The supervisor remains unchanged at SHA-256 `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca`. Codex ran the retained disposable fixture executable once with fresh evidence under `install-supervision/supervisor-processes-01`, without rebuilding either executable. It passed **109 assertions across five real disposable-process scenarios**: normal retirement, reported failure, unresponsive normal exit, wrong process creation identity and monitor loss.

The checks cover the process-origin QPC mapping, immutable deadlines, failure/heartbeat stop signalling, current process/session binding, one-use activation across reconnection, missing acknowledgment escalation, no forced target termination by the monitor, distinct process-exit/restoration states, restoration eligibility and retained hash-chained evidence. The monitor-loss fixture deliberately ends only its owned disposable monitor; fixture fallback cleanup is scoped to its own authored processes. No game process existed or was targeted. The final process check found no GTA, RPH, RichAudio fixture or OBS process remaining.

The exact-supervisor exception during restore/verify remains the PRIVATE-03B design: all game/OBS/RPH/host processes must be absent, and only the recorded current-session supervisor may remain with matching PID, creation ticks, executable path and hash. Preflight/install retain the strict process ban. File recovery never forces monitor/game termination and independent restoration verification remains separate from the manager's own verification.

These tests do not qualify GTA scheduling, normal GTA exit latency, fullscreen notice visibility or my current reaction time. The existing direct text-cue rehearsal remains historical component evidence. The required live arrangement remains windowed GTA with the independent STOP/ESCALATION text continuously visible; current availability and unchanged display/input conditions must be checked when I return. The older timing and deadline failures remain failures.

## Checklist for my later live review

1. Review the new PRIVATE-03C manifest/procedure and issue fresh approval for that exact candidate; do not reuse PRIVATE-03 or execute the superseded PRIVATE-03B package.
2. Confirm I am available for the entire bounded attempt and can acknowledge STOP/ESCALATION within five seconds and begin normal exit immediately.
3. Recheck the sealed inputs, actual loader inventory, backup/capture/recovery space, absent destinations and closed application state before installation.
4. Maintain the approved windowed notice arrangement and verified local game-only capture with zero microphone and no streaming.
5. Admit one clean initialization, then perform only the two-Bati, reviewed-baseline, one-A-assignment experiment inside the unchanged earliest deadlines.
6. On any failure stop normally. Do not retry an assignment, reload, relaunch, reset a profile or force termination. Unproven files/identities remain preserved for review.
7. After verified normal GTA/OBS closure, restore the same attempt's files, independently check the original inventory and directory state, then let the supervisor verify restoration.

No local commit, push, tag, merge, release or publication was performed by this component task. Native ownership, private resource mounting, marker playback, A/B isolation, normal GTA behavior and actual cleanup timing still require the later separately authorized runtime experiment.
