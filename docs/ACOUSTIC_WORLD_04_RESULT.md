# ACOUSTIC-WORLD-04: my offline cache builder and next installed-resource boundary

I now have incremental offline resource-to-tile cache preparation and explicit interior architecture stacked on draft PR #82 at `879a9c8d395512b0784b9abb51bd273834120cab`. Codex reused the existing importer, background scene worker and acoustic renderer. My primary real-building proof is still pending: no installed game resource was read in this increment.

## Implemented result

- A bounded supplied-metadata inventory resolves explicitly reviewed base/DLC/custom mount order, winners, deletion and dependency closures. Missing or unsupported winning geometry stays unqualified, with no base fallback.
- Per-tile dependency identities preserve unrelated tiles across resource changes. Progressive conversion runs in joined workers; immutable version-4 cache files wrap the existing version-3 finite-resource tiles. Restart reuse needs separately retained expected artifact digests; checksums alone never certify derivation. Nine-tile cold/warm movement retains at most eight resident tiles.
- Static interior topology references existing finite walls, floors and ceilings and explicit room/portal edges. Separate expiring fixture state covers IPL/interior activation and doors/windows. Multi-floor and indoor/outdoor candidate routes retain authored passive band losses and reflection references. Actual MLO decoding, arbitrary room volumes, portal visibility/diffraction and renderer portal routing remain unimplemented and unqualified.
- Existing Bati gameplay/source/streaming/engine code is byte-unchanged from the base commit. Original authored PCM exercises its production source class through moving-source/cross-tile scene changes, overrides, gaps, cancellation, invalidation and expiration. Dry PCM, source/grain continuity and renderer history are retained, with zero additional fixed PCM frames. No private banks were accessed.

The [architecture](ACOUSTIC_WORLD_04_ARCHITECTURE.md) identifies the executable APIs and the remaining discovery, coordinate, activation, parser-containment and interior-rendering work. The new fixture packets are deliberately authored normalized DTOs in bounded compressed envelopes; they do not establish actual parser decoding or real Enhanced compatibility. The inherited public-parser suite separately continues to exercise original actual-format resources.

## Validation and independent review

The complete local `tools/Test-Offline.ps1` passed. Subsequent bounded cache-residency, interior-coverage and header-reader hardening passed the final **33 portable focused checks** and **eight Windows synthetic header controls**, including consumed-attempt reuse rejection. These final focused checks cover the final implementation. The complete suite ran before those last hardening changes; hosted validation must cover the published head independently.

Separate agents reviewed cache/worker/continuity and interior/access code. Codex independently rehashed the exact final private candidate's executable, manifest, source/compiler and all 55 runtime bindings, verified its unconsumed state and ran the final synthetic controls independently. No installed source path was statted during that review.

| Private sealed review | SHA-256 |
| --- | --- |
| Final cache/continuity review v2 | `aafc0fec1535d86c0b4f8ed4298499d8c794ae04155eba21eb26d0a488fedfb6` |
| Interior/proposal review | `d5a000eeafd257d39e24fdbea8cca0435bceb5c3bfed3f26a2bdb2283f4f7791` |
| Exact header candidate independent review | `284f161e874bdb0f89b3445d6e520c0351edf3124ff679d3db52ccf252d99533` |

Review corrected whole-pass cancellation and cache IO races, cross-writer quota enforcement, a self-hashed cache derivation gap, unknown-tile starvation, cache-hit residency limits, cross-session cache binding, decoded DTO bounds, floating/shared-face exterior portals, partial interior coverage, manifest-read allocation bounds and exact source-read limits. The adversarial controls remain in the portable and Windows tests. Earlier compile/harness failures, the first two focused assertion failures during the artifact-binding API transition and superseded private candidate/review versions remain retained locally. No installed attempt was made or repaired.

## Retained processing findings

The final focused run measured 144 render calls with p50 **0.7639 ms**, p99 **3.0831 ms** and maximum **56.7660 ms**; one call exceeded the **10.6667 ms** block budget. The full-suite run retained maximum **56.1945 ms** and one overrun. An independent review run retained **62.07 ms**, also one overrun. Earlier observed root maxima were 55.9741, 55.0036, 58.7370 and 59.4602 ms, each with one overrun. These are order-dependent device-free processing observations, not a speedup claim, fixed output latency or measured audible dropout. Raw final logs and their hash bindings remain private; no endpoint was present.

## Exact next approval

Selected YMAP/YTYP/YBN paths are unknown, so the [next read-only proposal](ACOUSTIC_WORLD_04_READ_ONLY_PROPOSAL.md) is deliberately a **single 16-byte header request** from the proposed exact `update/update.rpf` path, plus exact no-follow ancestor/handle metadata checks. The archive's presence and format have not been observed. The logical-member allowlist is empty: no table, nested archive, keys, metadata member, resource, full-file hash or extraction is included.

The new private candidate is `world04-metadata-candidate-03`. Its immutable manifest is `fbd75133759a06b034b7a6d94dc920f8a4311ef06ec7a9437e576afc1d868e1f`. The literal command/root/output paths are retained in its private proposal and preparation receipt; the independent review binds them. It has no consumed marker or result directory. Approval permits one invocation, including a failed launch or preflight rejection. Another invocation always needs a newly reviewed identity and fresh approval.

Header evidence cannot identify a building, qualify effective mounts or establish placement, scale, interiors or activation. Further metadata and the eventual one-building resource triplet each require their own exact reviewed scope. The trusted header-only helper is not the future arbitrary-resource parser sandbox; filesystem/network isolation for that parser remains a blocker.

My earlier PRs and consumed endpoint evidence remain untouched. No GTA/RPH launch, installed scan/read, endpoint access, deployment, recording, native suppression or merge occurred. Codex is stopping at my explicit approval boundary.
