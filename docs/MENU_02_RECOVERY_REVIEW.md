# MENU-02 recovery independent review

My previous attempt remains startup-aborted and restored, with its approval consumed. A separate Codex agent reviewed the successor procedure, manifest, captured read-only observations, reports and fixture evidence. Codex found no outstanding offline procedure blocker. This is automated independent review, not live acceptance or permission to deploy.

The reviewed identities are SHA-256 of the retained bytes:

| File or artifact | SHA-256 |
| --- | --- |
| [Coordinator](../tools/Invoke-Menu02Recovery.ps1) | `1c60001c3ffbdaa5db6f996cb705d1702b5fb27f6907537a3c9e089bffb01c80` |
| [Launcher](../tools/menu02-recovery/Launch.ps1) | `7c5a15a32bc20170e0df258e155a1cc4017c27727f268a109d39a840e4ef93f7` |
| [Restoration helper](../tools/menu02-recovery/Restoration.ps1) | `a6ba6b8a53447481f0474fd6f4d8d7fc3be6ca589640d487387117e30c60f2c0` |
| [Supervisor](../tools/menu02-recovery/Supervision.ps1) | `6c11a105994f007dc8675dc5d4c457cd0b7dd4bc91df46ed424cd85b2c41cb63` |
| [Recovery report](MENU_02_RECOVERY.md) | `35c63a7c2fcd48c5c8940575ff50b47d52822fb461180966647afb8de242f09a` |
| [Public evidence](../evidence/menu02-recovery.json) | `058b1083b1288e176f6e9b977f40004b4bc496140f81efd41eb86feb025944cd` |
| Private successor manifest | `4d0194bb15de6d283c8e97b9737b3d5c7122b334b71713918c3c30fb78828581` |
| Private approval report | `175c83c956d364eee3ad9be1c978d4f55e73fe56361f6c766bea0b9b03e7ee56` |

The coordinator fixtures executed retained source `c6f5a4c3fe63c620246ea0ebc7ebb772745fd860a61bd9b34dd57a718a42c0e8`. The final source removes only a terminal blank line. Codex independently compared both texts; all 2,517 semantic tokens remain identical, and format proof `dffddfe7e0d3ec04215edf1daa74d3fd55e54a4ec27ec6a2f036a736e53350ef` binds them. No logic or candidate changed and no test rerun is claimed for that formatting edit.

The launcher supplies the exact executable, explicit identity-pinned working directory and unchanged empty arguments through ProcessStartInfo. It has no shell-directory dependency or fallback. Fresh bound receipts, deployed fingerprints, process closure, supervisor readiness and a consumed launch marker gate its sole Process.Start.

Codex independently executed the actual restoration helper on **33 disposable cases: 33 passed, exit 0**. The identified short PowerShell child closed normally. This repeats the author's same 33-case population; it is not 66 unique tests. The source and retained evidence also cover 36 construction, 34 gate, five dangling-link, 28 synthetic-clock and eight coordinator checks, reported separately. Ten actual coordinator receipts match the nonempty external fixture-manifest hash, including their metadata and restoration-result bindings.

Independent review reproduced a helper import clearing the coordinator's manifest arguments. The corrected import preserves and checks them. The rejected first draft, its preview and incomplete seven-case evidence remain preserved and ineligible for the next attempt. Earlier timestamp-lock fixture and clock-display failures also remain distinct. No failure was relabelled as a successful live test.

The unchanged menu DLL remains `8e70ddbbcc5d98b57239c54eb764427f6d055c808b3b9fd616ac71daaa525d0b`; its isolated sidecar remains `15a4ec13441701642a38ceb16eafa74302d91e9163e20a126e86731d9d55a41a`. Only the two existing plugin destinations are proposed. The new transaction remains absent and awaits fresh approval. The private independent review receipt is `252e7b46629ffb67cb81c35d60277dac10f636177a275db68b5c494ed3b6a747`; the final format and package addendum is `babd4ef2a089f7fcbe44cbe0408a5197a3b59d6cad85937774aa76c7ef5876cd`.

The reviewer used captured installation observations and performed no installed rereads or writes during recovery. No GTA/RPH or menu code, endpoint or actual watcher lifecycle was executed. Successful startup, loaded API identity, in-game rendering/input and gameplay performance remain unresolved. The proposal still requires my fresh explicit approval for one temporary deployment, one bounded live attempt, normal exit and independently verified restoration. Playback, warming, GPU acoustic processing, recording and merging remain excluded.
