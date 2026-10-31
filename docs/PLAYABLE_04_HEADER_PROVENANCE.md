# PLAYABLE-04: verified Script Hook V declaration route

31 October 2026. **Verified compatible developer declarations support the
compiled isolated diagnostic.** This is not a complete authenticated SDK archive,
a new game runtime or a live-native validation. The official SDK ZIP link's prior
HTML response remains recorded in PLAYABLE-03. No Script Hook V runtime or
proprietary SDK import-library binary was downloaded or redistributed. The
existing real SHV DLL was inspected statically, never loaded by the offline
checks. The diagnostic ASI is built locally and exercised separately against a
test double; [build evidence](../evidence/playable-04-build.json) governs its
artifact identity and limits.

## Sources and byte identity

The maintained original SHVDN repository retains an
[Alexander Blade SDK header](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/sdk/inc/main.h#L78)
at immutable commit `3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f`. Its header credits
Alexander Blade and identifies itself as part of the SHV SDK. Source-only
snapshots were fetched from pinned primary repository URLs into ignored local
research storage; each Git blob SHA-1 was checked against the repository content
API, and a separate SHA-256 was calculated from the downloaded bytes.

| Source | Bytes | SHA-256 |
| --- | ---: | --- |
| SHVDN `source/loader/sdk/inc/main.h` | 5,075 | `c451bad0c25feb3d4a622c392caa62f25fb9820bce21a451ffbc79e5fd342ecb` |
| SHVDN `source/loader/DllMain.cpp` | 10,318 | `d63e774e9e918168bbf38b4cd69086e143daca4313b4e700743972d23d1138b2` |
| SHVDNE `source/core/NativeFunc.cs` | 13,249 | `0fff3dba31036bb71dd819dfa0cd738a14ce833c724d9a94b33cf40ccfad5909` |
| SHVDNE `source/core/DllMain.cpp` | 36,019 | `8d8806c65cacaa6caf5d289acb07f19a552e39d426c6591a0d7b78dc5aee1d44` |

The Enhanced consumer is pinned at
`d8e474fb2779f12a0c04282645d561a1d675ec77`. Its
[P/Invoke declarations](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/core/NativeFunc.cs#L18)
independently identify the exact three native-call exports, argument widths and
pointer result. Its [actual invocation implementation](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/core/NativeFunc.cs#L318)
initializes the hash, pushes arguments and calls the framework in that order.
The full source/hash inventory is in
[portable provenance evidence](../evidence/playable-04-header-provenance.json).

There is **no `types.h`** under the reviewed pinned SDK include path. `main.h`
uses Windows types through `windows.h`; no game object structure, offset or
vector layout is required for these six functions. This absence does not justify
inventing game types or acquiring a mirror SDK binary.

## Minimal declaration and import boundary

An independently authored facade may declare only these published signatures:

```cpp
struct HINSTANCE__;
using HMODULE = HINSTANCE__*;
using DWORD = unsigned long;
using UINT64 = unsigned long long;
__declspec(dllimport) void scriptRegister(HMODULE, void (*)());
__declspec(dllimport) void scriptUnregister(HMODULE);
__declspec(dllimport) void scriptWait(DWORD);
__declspec(dllimport) void nativeInit(UINT64);
__declspec(dllimport) void nativePush64(UINT64);
__declspec(dllimport) UINT64* nativeCall();
```

Compile for Microsoft Windows x64 C++ ABI and assert pointer/`UINT64` width 8,
`DWORD` width 4 and `float` width 4. `HMODULE` must retain the `HINSTANCE__*`
type for matching C++ decoration; substituting `void*` changes the import name.
Similarly Windows `DWORD` is `unsigned long`, not a platform-dependent Linux
`long`. [Microsoft's Windows type definitions](https://learn.microsoft.com/en-us/windows/win32/winprog/windows-data-types)
and [x64 ABI](https://learn.microsoft.com/en-us/cpp/build/x64-calling-convention?view=msvc-170)
establish those platform rules.

Static PE review of the existing pinned ScriptHookV DLL verifies all six matching
exports, with no forwarding:

| Declaration | Exact import name |
| --- | --- |
| `scriptRegister` | `?scriptRegister@@YAXPEAUHINSTANCE__@@P6AXXZ@Z` |
| `scriptUnregister(HMODULE)` | `?scriptUnregister@@YAXPEAUHINSTANCE__@@@Z` |
| `scriptWait` | `?scriptWait@@YAXK@Z` |
| `nativeInit` | `?nativeInit@@YAX_K@Z` |
| `nativePush64` | `?nativePush64@@YAX_K@Z` |
| `nativeCall` | `?nativeCall@@YAPEA_KXZ` |

The reviewed DLL is AMD64 PE32+, 1,987,072 bytes, file version
`3889.0.1158.13`, SHA-256
`126be57ca9dca00e471f9de611766009c900aad88f89ae6c2926ec62e5aaeb4f`.
The build generates an import library locally from these exact names for
`ScriptHookV.dll`. Final PE inspection verifies those names, not fabricated
undecorated aliases. This uses ordinary loader-bound public exports, not native
handler addresses. It does not copy the repository's proprietary `ScriptHookV.lib`,
download a mirror runtime, scan for handlers or call game addresses directly.

## Registration, execution and unload

The maintained [original loader](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/DllMain.cpp#L195)
and [Enhanced loader](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/core/DllMain.cpp#L919)
both register `ScriptMain` with the DLL's own module handle at process attach,
yield with `scriptWait` from the script fiber, and unregister that module at
detach. Prefer the module overload over deprecated callback unregistration.
No worker thread, keyboard callback, RPH fiber or `DllMain` should invoke a GTA
native. Keep each init/push/call sequence uninterrupted and serialized in the
registered SHV script context.

For the small native diagnostic, attach/detach should do only the necessary
registration/bookkeeping. Defer file setup and capture work until `ScriptMain`.
Do not join a worker, wait for a writer, spawn processes, load libraries or
perform blocking cleanup under the loader lock. [Microsoft's DLL guidance](https://learn.microsoft.com/en-us/windows/win32/dlls/dynamic-link-library-best-practices)
explains why minimal entry-point work matters. Retain a per-process terminal
flag so a completed or failed target attempt cannot silently rearm after a
framework script reload. The ASI module stays loader-owned; it must not unload
itself while its callback can still execute. Removal of its file happens outside
the game after process exit and ownership-hash verification.

## Return-value and fault limits

`nativeCall` returns framework-owned result storage. For a declared float native,
copy the first four bytes immediately as float bits, before another native call
or yield. Do not numerically convert an integer slot to float, retain/free the
pointer, or log a raw pointer address. SHVDNE's
[primitive result conversion](https://github.com/Chiheb-Bacha/ScriptHookVDotNetEnhanced/blob/d8e474fb2779f12a0c04282645d561a1d675ec77/source/scripting_v3/GTA.Native/Native.cs#L3037)
likewise reads the declared primitive from result storage.

The generic header supplies no status or exception contract for an unknown
native. A non-null pointer, finite value or default zero does not prove handler
resolution or valid engine state. Nothing reviewed proves an unknown hash fails
nonfatally; C++ exception handling and a watchdog cannot guarantee recovery from
a framework fatal path or interrupt a stalled game-thread call. Any future
candidate must retain one target attempt, durable pre-call status and explicit
terminal outcomes, with these limits stated. Static ABI checks and a test DLL can
validate the caller's marshalling/lifetime behaviour, not the live resolver or
actual engine signal.

SHVDN source is generally [zlib licensed](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/LICENSE.txt)
subject to [file-specific notices](https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/COPYRIGHT.md).
The historical SDK header carries Alexander Blade's separate copyright; it is
not relabelled as zlib or redistributed wholesale. The small facade in
`src/telemetry/ShvProbe/ScriptHookVApi.h` contains independently authored factual
API declarations, with the original provenance preserved in this report.
No claim is made to a complete SDK distribution license.
