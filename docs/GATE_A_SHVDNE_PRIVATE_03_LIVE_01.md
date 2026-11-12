# GATE-A-SHVDNE-PRIVATE-03 — live-01 stopped at preflight

I authorized the single hash-bound live-01 attempt and confirmed that I was ready for the controlled sequence. **Codex stopped before installation because the real-root loader preflight failed.** No GTA, OBS or supervisor was launched; no Bati was spawned; no native assignment or capture occurred. Functional private-resource resolution and selection remain **UNTESTED**. This is not an observed runtime incompatibility or private-registration failure.

The approved execution-manifest SHA-256 was `37ed3488d15c037f79b919ac8ce8b00e0d869d0c891407e2116211125af51338`, probe `5c0ae83682806bd6a5f723ad39758ca5302e1cf7c1d89ddb2be9c41a0a2ebfba`, and retained supervisor `2fda83de4372d3eae8a33ac151167c5d046da5a714283a2f34ff86840d5175ca`. All 390 approved bindings and the protected game/OBS baseline files passed before the prohibited-path assertion failed. The original sealed preparation and its hashes remain unchanged.

## Exact blocker and preparation error

The game root already contains:

| File | Bytes | SHA-256 | Reported product/version |
| --- | ---: | --- | --- |
| xinput1_4.dll | 133,632 | `a1a8bde409ed75d94a0439c37cf881bc354b13c2f8cd32e4bef3b10f308f1392` | GTA V ENHANCED Asi loader / 1.0.0.2 |
| dinput8.dll | 131,072 | `9fd9e02353b7d39fe07b9667f7ea2697229a7f2d0e7d389eb79eb212b1bb181d` | GTA V Asi loader / 1.0.0.1 |

The xinput file's last-write timestamp is **30 October 2026, 21:17:19.5911105 UTC**. It predates this preparation. Codex's earlier inventory did not bind it and incorrectly described dinput8 as the sole loader. The fake-root fixtures were assembled from that incomplete inventory. They validly exercised their authored refusal/rollback cases, including refusal of an added xinput proxy, but did not establish that the real game root lacked that file. The resulting readiness conclusion was wrong.

This is supported by preserved earlier evidence, not just the current file timestamp: `smoke-01-preparation/native-prerequisites.json` records the pinned Enhanced executable's `XINPUT1_4.dll` import, the game-root candidate path and the exact same `a1a8bde4…` hash. That receipt is explicitly static PE/disk evidence, with no runtime-resolution guarantee. Codex failed to carry this known dependency into the private-profile proposal's loader contract.

The current read-only preflight correctly refused the existing xinput path with `AssertionError: Competing/unapproved loader/cache flag`. Presence of both files does not establish that both initialize in Enhanced. The unchanged historical asiloader.log identifies an Enhanced loader and system xinput forwarding, which is useful evidence for a future dependency review but is not a current-session module observation. Codex has not inferred that the Enhanced proxy should be deleted, that dinput8 should be parked, or that either file is malicious/incompatible.

My approval permits parking only TrainerV.asi, preserving the pinned stack and stopping on any failed phase. It does not authorize resolving this contradiction by removing an existing loader or changing the sealed policy. Codex therefore did not install, patch, reseal or retry the proposal.

## Closure and evidence

The one authorization is consumed under the bound attempt/stopping rule, even though game launch was never reached. No process/active-phase deadline started. The runtime `execution-01` directory was never created, Trainer was never parked, all new game/OBS destinations remain absent, and mods/scripts remain absent. No rollback operation is required because no installation or settings mutation occurred.

An independent post-stop audit rechecked all approved bindings, **27 protected game/external-log files**, **29 original OBS files**, **8,506 historical files** and **1,789 prior source files**. Original RPH working-tree status and the protected menu edit remain unchanged. No game/RPH/RichAudio/OBS process remains. Original archives, existing OpenRPF 0.3, both existing proxies, rpf.cache, settings and logs are preserved.

The receipt is `.local/gate-a-shvdne-private-03/live-01-preflight-stop/result.json`, with my authorization, exact blocker metadata, command failure and closure audit. It is a later execution record; the sealed preparation's original `liveAuthorized:false` flags remain historical preparation facts rather than being rewritten.

The smallest required next preparation is an actual-root inventory and provenance/role review for the existing Enhanced xinput proxy and pinned dinput8, followed by a consistent single-active-loader contract and a successful corrected read-only real-root preflight **before** asking me for any revised live approval. The private profile, marker, DLC and full shadow need no redesign or regeneration for this finding. No new live authorization wording is issued here and no repeat is authorized by this stopped attempt.
