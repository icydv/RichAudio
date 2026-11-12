# GATE-A-SHVDNE-PRIVATE-01 resource and identification

For my first private vehicle-audio experiment, Codex constructed **`ra_gapriv01_bati`**, JOAAT **`dd89929d`**. It changes one horn contribution in a private copy of the retained Bati profile. The private output is non-silent. My shared acoustic engine and production audio paths are unchanged.

The canonical private output is `.local/gate-a-shvdne-private-01/resource`. Its `resource-manifest.json` SHA-256 is **`9243c912b1eafaf5fe862c7c16cf5fdbd27c210d6bccea039f9915f277aa2f48`**. Copied structural records and generated resources stay under `.local`; they are excluded from public and normal production packages. No stock audio samples were copied into this resource.

## The four-record candidate

| Resource | Retained source | Private record | Change |
|---|---|---|---|
| DAT151 `Vehicle` | Bati `f9300cc5` | `ra_gapriv01_bati` / `dd89929d` | Private identity and `Horns` link |
| DAT54 `SoundHashList` | `f0760d26` | `ra_gapriv01_horns` / `e6f4b317` | Both list entries reference private copies |
| DAT54 `MultitrackSound` | `35963676` | `ra_gapriv01_horn` / `a7d2e79c` | First child references the private marker; second child retains stock `27890bba` |
| DAT54 `SimpleSound` | `6abc5e91` | `ra_gapriv01_marker_sound` / `25624e72` | Original private container and stream |

The DAT151 `Engine` remains `a46d1b50`; `EngineGranular` remains `61f3bd06`. All other fields remain equal after normalizing the serialization-only name-table offset. The conventional engine, granular player/NPC routes, categories, other horn wrapper and other stock dependencies remain external. No private engine or DAT10 synthesis record is needed for this one contribution.

The six declared link relocations are checked individually. Reversing these relocations and record names produces exactly the normalized source XML and the same serialized record bodies. The builder reads both RELs back, verifies their types and identities, and checks save/load/save equality. This proves the stated serialization transformation; it does not prove that Enhanced loads or selects it.

The real source XMLs came from the preserved `RichAudio-World13/.local/street01/gate-a-profile-01b` export, whose receipt binds the original `update.rpf` to SHA-256 `c3a68386a7d067772d6d6038ac505040e7280640205b230fdc1f829567cec913` before and after the read. Game XML SHA-256 is `4c94c681996251253f49be45a3f3a4697dd833f057175f95aa197c158ffdc6c9`; sounds XML SHA-256 is `2a1a61e8ccbd5e6d2d58c38783c1027d05ccc65583450d7e44a11ec5761b9e8f`. The selected Bati record and engine identities also match the retained StockSource05 resolved catalog, SHA-256 `c4250395be8638b9d44df2a43da966caec99841a83f26e3131be51edca57c018`.

The older Marker A preparation used an authored 116-byte minimal `Vehicle` XML containing only a name and horn field. Codex preserved that evidence but did not use it as a complete vehicle profile here.

## Original wave and references

The wave contains the temporal word `1111100011011101010000100101100`. Each 80 ms symbol contains a 60 ms sinusoid at 660 or 880 Hz, with 6 ms raised-cosine edges. There is 160 ms of lead and tail. The result is 134,400 frames, 2.8 seconds, mono PCM16 at 48 kHz, approximately **−20.00 dBFS peak** and **−25.37 dBFS RMS**. The modest sample level is an authored asset property; game category gain and speaker loudness remain unmeasured.

`ra_private01_marker.awc` has one PCM stream. Full stream JOAAT is `c33ff581`; AWC's 29-bit ID is `033ff581`. The private sound points at container `dlc_ra_private01_6a13f902/ra_private01_marker`, JOAAT `e6bea9d1`. DAT54 `ContainerPaths` uses `DLC_RA_PRIVATE01_6A13F902\RA_PRIVATE01_MARKER`; retained installed DLC resources provide the same uppercase-backslash name-table and lowercase-slash hash-input convention.

The actual serializer is the retained CodeWalker dev46 `CodeWalker.Core.dll`, SHA-256 `3d2bb91b35cf0d1888c12772a9af25441adea3ccc8510a149fcf0d47c8e71ca8`. The [pinned upstream AWC implementation](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/FileTypes/AwcFile.cs) corroborates the PCM chunk layout, XML import and 29-bit stream masking; the upstream source is not claimed to be the exact source revision of that binary. The AWC is unencrypted, finite, with `LoopPoint=-1`. Native horn duration, repeat behavior, event selection, pitch and gain remain runtime questions.

The builder decodes the serialized AWC and requires **byte-exact equality** with the original PCM. It also checks the sample count, rate, PCM codec, stream ID and AWC save/load/save equality. Missing or invalid WAV imports cannot pass merely because CodeWalker's XML importer swallowed an error.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `ra_private01_game.dat151.rel` | 336 | `b786ea31ef1aafa544ee8c42a1f49a5c0780bdb43de410a6f8d61c4b35bf57a0` |
| `ra_private01_sounds.dat54.rel` | 193 | `60159520b142404aabb9483cd5a37e1ff0ae2a3354e7a77be0379f429d513cae` |
| `ra_private01_marker.awc` | 268,864 | `aa61e789381ca297d1c88465085e91a13a47d565222056470d289d81e728a1d0` |
| Original WAV | 268,844 | `ed09f9acaaa4347a4fb04d33483faf08ac129e3be54cf2f5270b6f0a739bbb7c` |
| Original PCM payload | 268,800 | `427c34a5bd3083c3597b824ecd4d28e3286ea8ff3d5028a129ddecd16671fb06` |

## Dependency and collision scope

The introduced graph closes through four private records to one original private AWC. The private records retain 37 external reference occurrences, all of which have matching metadata in the retained corpus. `dependency-audit.json` records these individually and retains the catalog's player/NPC channel evidence. This preserves stock dependency selection; it does not requalify every transitive stock resource at runtime.

The namespace audit found zero collisions while checking **449,359 record-name occurrences**, **72,092 container references** and **71,510 wave references**, plus the retained selected vehicle AWC tables. It checks the six introduced full hashes and the masked AWC stream ID. Its bound corpus is the retained base/update/mpheist/mpapartment/mpexecutive REL exports plus the current pinned game/sounds exports and selected catalog. Repeated records are included in these counts. This is a documented corpus audit, not an assertion that every current or user-added DLC namespace has been inspected. The receipt pins every input file.

## Positive identification and offline results

`ResourceMarker.mjs` measures the two fixed tones and requires **all 31 temporal symbols** at the expected 80 ms spacing. It searches 10 ms alignment without fitting arbitrary playback pitch or rate. It is a source-word detector, not a stock vehicle fingerprint classifier.

The three-input comparison accepts complete 48 kHz PCM16 mono/stereo WAV windows of at most 60 seconds:

```powershell
node tools/native-control/private-profile/ResourceMarker.mjs identify baseline.wav target.wav control.wav
```

- **PASS:** a full marker word appears in the supplied target window; usable audible baseline and control windows contain no full word. This is conditional evidence for this original horn contribution only.
- **FAIL:** a full marker word appears in baseline or untouched-control audio, defeating the intended isolation or capture attribution.
- **INCONCLUSIVE:** no target marker, silence, inadequate duration, clipping, malformed capture, or another missing prerequisite. Missing output does not establish suppression, successful fallback, or resource absence.

Capture provenance and temporal labels remain separate requirements. A future recording would need to show that the disposable target horn and untouched control horn were actually activated in the stated windows, with no preview playback, dubbing, mixed earlier marker playback or capture discontinuity. The detector cannot authenticate a recording or prove an entire effective profile from one contribution. A native-call return or isolated horn hash is not a substitute.

Sixteen marker fixtures passed: clean and delayed/gain-scaled/noisy/reflected originals; stereo opposite-phase signals; single tone, wrong word, reversed word, fragment and simultaneous-tone negatives; clipping, silence, truncated/wrong-rate capture; isolated target attribution; contaminated baseline/control; missing target and silent control. These are authored fixtures, not measured game recordings or estimates of population false-positive rates.

Eight resource fixtures passed against the actual canonical resource: typed four-record graph and exact original wave, modified AWC, missing DAT54, changed manifest, resealed wrong profile, changed audit, resealed wrong role and path escape. The receipt is `.local/gate-a-shvdne-private-01/resource-tests-01/result.json`. The first local validator attempt exposed a PowerShell numeric-overload issue in the peak check; Codex corrected the accumulator to `double` and retained the failed attempt directory before running the eight passing cases.

`ResourceBuild.ps1`, `ResourceValidate.ps1`, `tests/Test-PrivateResource01.ps1` and `tests/Test-PrivateResourceMarker01.mjs` reproduce the offline work. All output construction requires a fresh private directory. None of these tools installs resources, invokes GTA natives or accesses an audio device.

Registration remains separately gated. The companion registration work binds this resource to a private OPEN DLC and private update shadow, while the exact installed OpenRPF 0.1 loader's compatible source/behavior remains unverified. No live authorization follows from these resource tests. My SHVDNE 10 ms observation-performance gate remains **failed**; resource selection would not qualify production ownership, host IPC, full mechanical telemetry, renderer performance or independent failure restoration.
