# RichAudio ACOUSTICS-07.15 — RPH Dependency Review Results

**Recommend a separately approved launch-context experiment with an explicit game-directory working directory; no dependency installation is supported by this evidence.** Static inspection now explains the GAC lookup, and the retained crash dump supplies the failed process's working directory. The experiment has not been performed and is not a confirmed repair.

This findings-only task starts from draft #66 at `a4e7646d366fc877935762a861ac697d37c18d9a`. No production runtime/operator code, installation, dependency, system setting or audio endpoint was changed or executed. No new approval, receipt or launch token was created.

## Established failure mechanism

The original .NET Runtime event 1026 at `2026-10-28T23:55:03.6469167Z` reports an unhandled `System.IO.DirectoryNotFoundException` in `Directory.GetFiles(String, String, SearchOption)` during WPF application startup. The matching dump's exception text identifies `C:\Windows\Microsoft.NET\assembly\GAC_64\SlimDX`. Its SHA-256 remains `644A43D998CA7EFA49639E2E01DC5ABA249F2CD6A15B12226913BE0A3D6B6466`. A string hit in a dump is not by itself a managed exception-object reconstruction; its attribution is corroborated by the event, time, executable and static failing method.

The responsible component is the managed **RagePluginHookLauncher** assembly inside the reviewed `RAGEPluginHook.exe` (file/product version `1.132.1428.17748`; launcher assembly version `1.0.0.0`). The event's obfuscated first application frame maps to method token `0x0600018B`. Static control-flow and decoded constants establish this sequence:

1. Combine `Environment.CurrentDirectory` with `SlimDX.dll` and call `File.Exists`.
2. If that check succeeds, return success without the GAC enumeration.
3. Otherwise, select `GAC_64` or `GAC_32` according to `Environment.Is64BitProcess`, append `\SlimDX`, and recursively enumerate `SlimDX.dll` using `Directory.GetFiles`.
4. The failing routine has no exception handler or directory-existence guard around that enumeration. A missing directory therefore propagates the recorded startup exception.

This is explicit dependency-discovery fallback **directory enumeration**, not evidence of a failed CLR assembly bind, missing SlimDX redistributable, or native SlimDX execution. The DLL can exist next to the executable while the first check looks elsewhere. [Microsoft documents the current-directory property](https://learn.microsoft.com/en-us/dotnet/api/system.environment.currentdirectory?view=netframework-4.8.1), [File.Exists semantics, including false on access errors](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.exists?view=netframework-4.8.1), and [the Directory.GetFiles overload](https://learn.microsoft.com/en-us/dotnet/api/system.io.directory.getfiles?view=netframework-4.8.1).

The launcher uses protected metadata and constants. Ordinary metadata readers initially rejected or misread its duplicate/extra streams. Analysis used a private data copy with only 18 bytes of metadata stream-header names normalized; all method bodies stayed byte-identical to the sealed original. A metadata/IL reader and bounded arithmetic/LZMA constant-table reconstruction resolved only the relevant constants; no target assembly, initializer, method or native library was loaded or invoked. Raw IL, reconstructed proprietary data, dumps and machine records stay private. The normalized copy is analysis data, never a deployment candidate.

## Recovered launch context and historical comparison

The retained x64 dump's captured TEB/PEB/process-parameter structures consistently identify the same process parameters across 15 threads. The current-directory string is the **Codex application's installation directory**, not the reviewed game directory. Image-path and command-line strings identify the reviewed game-directory RPH executable with no additional arguments. This is captured crash-time context; it does not independently establish the initial directory if another component changed it earlier. It supersedes 07.14's narrower statement that the directory was unavailable, without editing historical evidence.

The absolute GAC path does not move with the working directory. The connection is the earlier file-existence predicate: a non-game directory can fail to find the supplied app-local DLL, selecting the fixed GAC fallback. The recorded failing branch establishes that the predicate returned false. The dump, static path construction and matching deployed DLL connect the observed failure to this discovery mechanism. No historical trace of the individual File.Exists filesystem operation was retained, so absence versus another file-check error is not asserted from that predicate alone. Current inspection finds no SlimDX.dll in the captured application directory.

The 07.13 launch API call supplied only an absolute executable path, from `23:55:00.416Z` to `23:55:14.186Z`. Its 13.8 seconds is a measured duration, not a proven timeout. A launch request, crash event, later process absence and window-discovery failure remain distinct observations. Elevation/token details and exact exit code are not established.

The earlier 07.9 receipt records visible Explorer activation at `22:05:07.9886362Z`; its retained RPH log reaches initialization at `22:06:18.258Z` and records the same RPH/game versions. Its working directory, actual arguments and elevation were not captured. Successful Explorer activation supports retaining that future option, but does not prove its precise context or guarantee success now.

All **26** introduced files in the earlier and failed attempts' quarantines match the same manifest hashes. Both deployment journals include SlimDX; its present absence from the restored game directory is expected restoration, not evidence of historical deletion. The earlier generated RPH INI contains ordinary console/developer settings and no SlimDX binding directive; its commandline/startup files are empty. The failed attempt produced no retained generated RPH config/log. Neither the authentic archive nor the reviewed deployment supplies an RPH executable binding-config file. Generated post-launch settings are not assumed to have existed before either launch.

## Authentic dependency layout and guidance

The original user-supplied `lspdfr_049_9695_Manual_Install_Enhanced_1158_16.zip` remains SHA-256 `8524E534F219C7F33634ED45CED055F3C7B0B461FA8302FF2F0AC46470C7ED34`. The historical provenance record identifies the publisher's Enhanced-preview download and records a publisher-checksum match. The retained download-zone metadata points to LCPDFR and its download CDN. Those provenance records complement the current byte/hash comparison; a hash alone is not publisher authentication. The publisher page timed out during this review, so its checksum/guidance was not newly verified online. The old RPH download URL returned 404; forum remedies and generic historical requirement pages were not used to select an installer.

Archive inspection finds 1,134 entries, including the authentic RPH executable, SlimDX and its license, with no MSI/redistributable/setup package selected by the bounded prerequisite-name/extension inventory. The supplied RPH readme directs users to place the runtime files in the game folder and launch RPH; it does not prescribe a separate SlimDX GAC installation for this package. The archive supplies 23 files matching the reviewed deployment directly. Its original XInput loader differs from the separately reviewed replacement; DirectStorageFix and the project bridge are separate reviewed additions. These three known supplements match in both attempts and are unchanged; they are not newly discovered layout omissions.

| Artifact | Identity and inspection | Provenance / comparison |
|---|---|---|
| RPH executable | File/product `1.132.1428.17748`; launcher assembly `1.0.0.0`; AMD64, IL-only launcher targeting `.NETFramework,Version=v4.8`; SHA-256 `73F05B3F7973D4731F4151AE061DD3C991065E8BF3ECE51EA1D9AB728B9B42AC` | Original archive, staged source, both quarantines and manifest match |
| SlimDX.dll | Assembly `SlimDX, Version=4.0.13.43, Culture=neutral, PublicKeyToken=b1b0c32fd1ffe4f9`; AMD64 mixed managed/native image; `.NETFramework,Version=v4.0`; metadata `v4.0.30319`; SHA-256 `194968B5010BE986E33669928B9F966A67C6EB4E1CF4AC4DA6B90728E242A516` | Original archive root, staged source, both quarantines and manifest match; no separate file/product version resource was available |

Private evidence records exact original/staged/quarantine paths. SlimDX references .NET 4 assemblies and Microsoft.VisualC `10.0.0.0`; native imports include MSVCR100/MSVCP100. The launcher performs its own existence/discovery check before later loading; existence alone does not validate all eventual native or CLR dependencies.

Direct registry/file reads currently show .NET Framework `4.8.09221` (Release `533509`) and VC++ 2010 x64 registration `v10.0.40219.325`; System32 MSVCR100/MSVCP100 are present at `10.0.40219.325` with valid signatures. The VC++ uninstall record has installation date 24 October. Relevant current SlimDX GAC directories under both .NET 4 and legacy assembly roots, selected SlimDX registry keys and SlimDX uninstall records are absent. These bounded current observations do not prove what every registry/file state was at either past launch. No Win32_Product/MSI consistency inventory, installer, repair, assembly registration or system mutation was used.

## Concrete proposal for separate approval

Choose **one controlled working-directory experiment**, with the existing reviewed files and no dependency installation. After a separate fresh approval and the existing candidate/baseline/deployment checks, a human can use a normal interactive shell to start the exact reviewed installed executable with an explicit reviewed game-directory working directory. The private proposal contains the exact absolute command. The portable form is:

```powershell
Start-Process -FilePath '<reviewed-game-directory>\RAGEPluginHook.exe' -WorkingDirectory '<reviewed-game-directory>' -PassThru
```

Use no additional arguments and no elevation verb. A human Explorer activation of that exact executable remains an alternative supported by the earlier record, but Explorer alone does not verify the child's actual working directory. Select one route in the future approval; do not try both after failure. No general launcher or audio-supervisor change is proposed.

| Review item | Exact proposed scope |
|---|---|
| Connection to failure | Make the existing current-directory SlimDX existence check address the already supplied game-local DLL, avoiding the observed missing-GAC enumeration |
| Package/version/source | Same reviewed RPH `1.132.1428.17748` and authentic bundled SlimDX `4.0.13.43`; no new package or installer |
| File/registry/system effects | No added machine-wide component, registry edit, GAC folder/DLL/registration, dependency repair, security change or new launcher file |
| Temporary game changes | Existing 26 manifest additions, existing executable rename and existing generated-file scope only; candidate/helper bindings unchanged |
| Privileges | Normal interactive launch proposed; administrative elevation is neither demonstrated necessary nor a remedy |
| Approval required | Fresh approval for one temporary deployment/rename, one explicit-context GTA/RPH launch, evidence collection, normal closure and reviewed restoration. No audio-host session or listening is included by this launch-only proposal; those require explicit scope if later requested |
| Expected result | Existing local-file check succeeds; later startup/assembly/game behavior remains a live uncertainty. This is an experiment, not a proven repair |
| Later verification | Record invocation/cwd input/time/PID; PID creation alone is insufficient. Verify actual process context where available, visible RPH/game, new relevant logs/events, then stable Story Mode and bridge READY/sending OFF. All preparation precedes any separately approved host clock |
| Failure boundary | One route, one launch; retain failure evidence and restore, with no fallback launch, reinstall or retry |
| Rollback | Close GTA/RPH normally; use reviewed Restore to restore original executable name/hash and quarantine only manifest additions/generated files; run independent original-root/signature/archive verification; preserve unexpected changes |
| Rollback limits | No system-wide dependency rollback is needed because none is proposed. Root/archive checks do not promise restoration of external game-client/profile/account state or overwrite unrelated changes |

This is concrete scope for a future decision, not approval. The launch-context input omission can now be assessed without authorising a system-wide redistributable. Actual success of the context change remains the specific untested gate before further listening. A new dependency package/repair would be separate machine-wide scope requiring new evidence and review.

## Validation and preserved status

The private evidence includes original event/dump hashes, crash-context parsing, metadata normalization boundaries, decoded constants, full companion-file comparison, current prerequisite reads and the exact future command. No raw crash dump, proprietary binary/IL or machine evidence is committed. A separate sanitized scalar evidence file captures the supported conclusions. Repository/publication gates and final hosted checkout verification accompany this findings PR; actual hosted status is reported in the PR.

Runtime `b5143db8c99decef49a8c9fdf1473f0c3db4840f`, operator source `c3f6c81952ceeb63d5db2b1e23378693efabfd02` and candidate SHA-256 `D8E07531B2C80F9F322940A6770B462E7FEDC28DCAF870DFEDA7A13E38981C41` remain preserved. The 07.13 approval stays closed; no host-start token does not make it reusable. The original CI failure's cause remains unknown; later passing diagnostics do not resolve it. 07.9 remains incomplete with failed Stop timing; 07.13 remains failed at launch with no listening result; combined ACOUSTICS-05 + BENCHMARK-01 remains **60%**. No new live authorisation, merge or history rewrite.

Next review: assess this explicit-working-directory, launch-only experiment against the unchanged candidate and restoration plan. Do not perform installation, launch or playback while reviewing; obtain fresh explicit scope before any future live action.
