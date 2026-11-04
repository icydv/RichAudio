# MENU-02 independent offline review

I am keeping MENU-02 at offline preparation until I separately approve the protected inventory and live session. A separate Codex agent reviewed the candidate source, actual compiled metadata, payload configuration and retained evidence. This is an automated independent review, not human maintainer approval or live acceptance.

Codex found no blocker within that offline scope. The three existing MENU-01 runtime files remain unchanged from integrated starting commit `65a17ca05d19a43b8aa56706f704d1775ab66028`. The separate entry starts only the menu; the actual DLL has exactly one public `Main`/`OnUnload` pair and one RPH plugin identity. Its historical name/version checks precede menu startup. No gameplay runtime, listener/vehicle observation, world warmup, audio host, GPU backend, Node worker or SoundMap service is linked.

The unchanged menu starts preference and recording-availability workers. Codex verified the isolated sidecar, disabled initial output, `stock-fallback`, F10, and absence of both recorder descriptor and host-status file. No recorder address/token exists in this workspace. Recording controls are locked by `PLAYABLE_PRODUCT`; Apply/Reset affect isolated preferences. A saved choice does not establish an engine change.

Codex independently rehashed all **18 source/build/input/payload pins** and **nine public-evidence bindings**, then inspected copied DLL bytes through the existing development copy of Mono.Cecil. Neither the plugin nor SDK was executed. The retained DLL is **88,064 bytes**, SHA-256 `8e70ddbbcc5d98b57239c54eb764427f6d055c808b3b9fd616ac71daaa525d0b`.

The reviewed file identities are SHA-256 of actual checkout bytes:

| File | SHA-256 |
| --- | --- |
| `tools/Build-Menu02.ps1` | `5ab9e8a8328c5727825a477b2604be22ee8b5718fbeb7eb349f83949bc69d7f8` |
| `src/acoustics/bridge/Menu02/Menu02Entry.Rph.cs` | `2261e18d7b2cd9868a6bdebbc25a3c8776b241c156e0f1b1c27a73884f11dda0` |
| [Preparation report](MENU_02_PREPARATION.md) | `371de5ed16fe52e1b528d5df0c007e4ab97f8f5b885c82befc4c71924c6c320b` |
| [Public evidence](../evidence/menu02-preparation.json) | `7d83b21ff2412612868669f8c50ff02c39c0aa8db7f52760d0229492dc82ba27` |

The private independent review receipt is bound by `871fe08d9fd46d1bee91698753af9a7e4b7615d2e58e6bb089185054c7e72418`. Its separately retained documentation addendum, `2e67d91cab9dd6d068f625b738c7be3b45f0b5d7a092d5f91052dc9642ff4e0c`, binds the final proposal's private still-screenshot allowance. The retained candidate receipt remains unchanged at `229f20ab7bfde7f2810cf85e633c392e2d1caa710f5e1a721d956a0e5ba7a081`.

Reviewer tooling failures remain distinguished from candidate outcomes: an initial hash-command syntax error and an unsupported old-Cecil `Dispose` cleanup failed before corrected read-only inspections completed successfully. The separate builder inspection cleanup failure and relative-path config-fixture compilation failure also remain retained. The candidate's single compilation passed; no failure was reclassified or live attempt retried. The existing integrated menu pass and broader WORLD13 failures remain separate in the evidence.

Current GTA/RPH identities and installed destinations remain uninspected. SDK FileVersion `1.124.1393.17586` is a compilation reference, not qualification of historical API `1.132.1428.17748`; matching FileVersions cannot authenticate the launcher or loaded API. Exact startup-conflict handling and byte-bound rollback still require the proposed read-only inventory. GTA rendering/cursor order, physical input, game performance, resource growth and restoration remain unexecuted. This review performed no installed-directory/resource access, deployment, game launch, endpoint access, audio playback, recording or merge, and grants none of those permissions.
