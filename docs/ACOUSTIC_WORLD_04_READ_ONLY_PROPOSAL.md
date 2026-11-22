# ACOUSTIC-WORLD-04: my next exact read-only resource boundary

I have not approved access to installed game resources. Codex prepared a new, unconsumed **header-only metadata candidate** and exercised its reader and independent supervisor against fresh synthetic files. The selected YMAP, YTYP and YBN archive/member paths are still unknown. My next useful approval is therefore this smaller metadata step, followed by another reviewed proposal if more access is needed.

This candidate cannot extract a building or certify my installation. Its exact archive name is a **proposed lookup**, not an observed installed file. Missing, encrypted, unsupported or unexpected input never selects another archive or causes a retry.

## My proposed first metadata read

The private `world04-metadata-candidate-03/manifest.json` binds the literal game root supplied in my request, the literal file `<approved-install-root>/update/update.rpf`, the fresh private candidate/result directory, attempt identity, executable and 55 actual loaded runtime/module/config file hashes. Neither that game path nor its ancestors were inspected during preparation.

| Allowlist item | Proposed operation and bound |
| --- | --- |
| `<approved-install-root>/update/update.rpf` | One read-only handle; one direct `ReadFile` request for exactly bytes `[0,16)` with no retry; no seek, file-body hash or additional content read |
| Its six lexical ancestor directories, including the volume root | Exact-path no-follow handle/attribute checks only, held through the source read; no directory listing |
| Logical archive members | **Empty allowlist**: zero table, member, nested-archive, YMAP, YTYP, YBN or DLC metadata payload bytes |
| Game executables, keys, audio and other archives | No access |
| Output | Fresh private `result/header.json`, `result/supervision.json`; bounded failure receipt when a safe output location exists; each at most 4 KiB, create-new only |

The first 16 bytes supply four little-endian integers: format marker, declared entry count, declared name-table length and encryption tag. The [pinned public CodeWalker implementation](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/RpfFile.cs) describes that header and separate encryption branches. This candidate records those raw declarations; it does not trust them as allocation sizes, decrypt a table or load CodeWalker. An encrypted/unknown format is a retained finding and the end of this attempt.

Private evidence would bind the exact source handle's volume/file identity, size and last-write value before and after reading, final resolved path, header hex and SHA-256, command/manifest/executable identities, child PID, deadline outcome, exit and join. The full archive's content hash is deliberately unknown: obtaining it would exceed this content-read scope. A header hash cannot identify the complete archive or its members.

## Exact candidate and one-shot command

The private preparation receipt contains the full literal command and paths. Its sanitized form is:

```text
<private-candidate>/world04-header.exe --supervise <private-candidate>/manifest.json fbd75133759a06b034b7a6d94dc920f8a4311ef06ec7a9437e576afc1d868e1f
```

| Binding | SHA-256 |
| --- | --- |
| Candidate manifest | `fbd75133759a06b034b7a6d94dc920f8a4311ef06ec7a9437e576afc1d868e1f` |
| Compiled header-only executable | `59c69fa18976a820028a14a90e8f1817c7cd422c0ab561e2127198168536ff0a` |
| Header reader/supervisor source | `c2f2187dc47636d87975ff97e208fa11fd5356215199d3c5e9cc6099f756734b` |
| Existing compiler used for preparation | `46809206887326d2d24db1eff1f3064de972c3451abe766b49111450a5e08e00` |

An independent review receipt must bind these exact artifacts, the preparation tool, this proposal and the synthetic controls before my approval is actionable. Codex has not run the installed candidate. It has no `consumed` marker or result directory. Approval of this exact header step would authorize **one invocation only, including a failed launch or any preflight rejection**. Every invocation ends that approval; another invocation requires a new independently reviewed identity and fresh approval. A preflight rejection may leave no `consumed` marker, but its absence is not permission to retry. The marker is persisted before child creation and private access when preflight succeeds. No failed launch, sharing violation, timeout, changed binding, unavailable file or unsupported format may be repaired, rerun or repointed under the same approval. The private `APPROVAL_BOUNDARY_ADDENDUM.md` states this invocation rule alongside the unchanged original proposal.

## Supervision and containment for this header step

The file reader is a separate fixed executable mode. Its parent creates a Windows Job with kill-on-close, a 128 MiB committed-memory ceiling and an active-process limit of one. The child waits on a fresh named event before opening the source. The parent assigns it to the Job before releasing that event; a lost parent before assignment leaves a child that times out without private-file access. The independent parent enforces a five-second work deadline, kills on failure and verifies process exit with a further bounded five-second join. An assignment failure directly terminates the unassigned child and verifies its exit. Every attempted failure retains the consumed marker and safe supervision evidence; missing exit evidence is a failed, unqualified attempt.

The child uses read-only `CreateFile` handles with open-reparse-point checks, pins parent-directory handles, rejects reparse points and directories at the source, verifies its final handle path, and denies write/delete sharing while reading. Fresh output-parent handles stay pinned, and create-new output refuses existing files or links. No recursive enumeration occurs. The control process and child run outside GTA/RPH and the audio engine.

The executable, actual loaded CLR/native modules, managed assembly files and `machine.config` are hash-bound. Unexpected loaded modules/config drift fail before the source read; executable `.config` files are refused. The child receives only `SystemRoot` and `WINDIR`; CLR profiling, AppDomain manager, development-path and startup-hook override variables are rejected. Windows and its account/security mechanisms remain the trusted platform; this is not a claim that every OS component has been measured.

This trusted fixed reader contains no network or write-to-game operation and invokes no external resource parser. It is **not** a general hostile-parser sandbox. That separate containment is still required before any resource/table parser can receive installed bytes. No CodeWalker initialization, key loader, game executable, archive modification, endpoint, recording, deployment or suppression is part of this candidate.

## What follows this metadata step

The pure offline `world04-metadata-inventory.mjs` decoder can validate an explicitly supplied, uncompressed outer RPF7 directory table with bounded names, ownership, paths, depth and output. Its fixture tests are not installed-format evidence, and **it is not connected to the installed header candidate**. Its proposed future maximums are one archive, two contiguous reads, 32,768 entries, 1 MiB names and 1.5 MiB combined table; encrypted/unknown tables stop without keys. Those are architecture bounds, not an approved extension of this 16-byte proposal.

If the header is usable, the next proposal must explicitly name and bind any table range or selected metadata member. Nested archives cannot be followed automatically. DLC lists, `content.xml`, `setup2.xml`, base/override archives and custom maps each need exact paths, byte limits and separate approval when absent from that proposal. The header does not establish effective mounts, override precedence or activation.

Once metadata identifies a building, my separate real-resource proposal must name one YMAP, its required YTYP and corresponding YBN, every relevant enabled/overriding dependency, original archive/member names, input lengths/hashes, and the private output root. It must retain placement and collision ownership, rotations/scales/root transforms, coordinate/metre evidence, supported/rejected counts and IPL/interior activation evidence. Unresolved links, an unsupported winning override or unknown activation stop qualification. There is no lower-priority fallback or inferred wall/empty volume.

That resource candidate must also pin the explicit Gen9 parser/source/runtime/dependency closure, receive only approved byte buffers in a separate process with no game-root handle, and have independently enforced wall time, memory, output, cancellation and verified exit. Network and filesystem isolation must be implemented and tested for that arbitrary-resource parser; source-code intent alone is insufficient. Current in-process original-fixture parser success cannot substitute for it.

## Offline validation and remaining evidence

The tracked Windows synthetic test exercises success, missing input, timeout, incorrect manifest digest, a junction source path, a CLR startup-hook override, precreated output, an oversized manifest and consumed-attempt reuse. The final eight cases pass with failures joined and retained; no installed game files are used. Four portable metadata tests cover range/byte caps, encrypted-table rejection, traversal, directory cycles/ownership and unreachable entries. Codex retained the earlier compile/type correction, overly broad environment rejection, runtime JSON collection correction and stopped CLR-host environment fixture locally; they are development findings, not installed attempts.

I am stopping before installed access. The existing importer still refuses installed-resource authority. No actual building placement, full map coverage, MLO/custom-interior compatibility, runtime activation, audible continuity or real endpoint timing has been established by this preparation. My older PRs, source banks and consumed endpoint candidate remain separate and untouched.
