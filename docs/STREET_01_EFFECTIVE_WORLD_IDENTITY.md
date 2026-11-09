# STREET-01 effective world identity and delayed source startup

I want SoundMap and the acoustic renderer to discover nearby geometry automatically during ordinary GTA gameplay. This checkpoint uses retained world evidence, authored camera trajectories and authored PCM. One interior transition also replays a retained camera proxy. `AcousticWorldComplete` remains false.

## Effective sources and placements

Codex compared the IL from the retained, pinned CodeWalker build with the upstream implementation. The DLC-enabled traversal walks `AllRpfs` and each archive's `AllEntries`. Each successful metadata parse writes a file entry using the parsed YTYP name hash. Each nonzero archetype hash is written independently, in definition order. An overwritten file can still contribute unique archetypes. The audit records both histories and requires the same source member, payload digest and definition ordinal before carrying a placement across an effective archetype decision. [CodeWalker GameFileCache](https://github.com/dexyfex/CodeWalker/blob/485d56bec00262ed7fa472261cce7bbc6202b96e/CodeWalker.Core/GameFiles/GameFileCache.cs#L1172-L1244)

The retained catalogue contains historical file winners and member hashes for all 53 disputed file identities. There are 56 alternate paths and 109 distinct paths in those comparisons. The 15 previously staged YTYPs supplied 1,469 distinct observed archetypes, with no duplicates within those staged files. None of the 15 is in the disputed set. The retained receipts do not contain the parsed definitions of those 109 members or the authoritative global traversal order. The audit therefore certifies zero new effective winners in the disputed set.

All 1,986 conditional rows were evaluated with the exact manifest entry and native group and bounds keys. The existing 1,459 bindings reproduced. The remaining 527 have no matching native keys in the retained verified manifest projections. Each has exactly one unread manifest in its own retained active table. That identifies nine exact candidates, with the actual associations pending. The other 22 unread manifest paths lack this evidence. The private proposal has 118 exact members in 18 outer archives, and includes the 109 YTYP candidates and the nine YMF candidates.

The census keeps all 10,663 resources. Existing placement qualification covers 10,601. The remaining 62 include 56 interior-local resources with one manifest parent and no selected instance, three with no exact native bounds-store key, and three coordinate candidates with unqualified identity. None received a fabricated transform or effective-exclusion verdict. No exact additional selected YMAP dependency was established. The retained activation classification remains 4,337 layer-zero exterior resources with conditional static authority, 3,724 higher-layer resources, 1,986 conditional-group resources, 614 interior resources and two otherwise unresolved.

## First source timing

The traced docks baseline took 15.781 ms on its first source block. Stock synthesis accounted for 13.601 ms, against 0.327 ms for source selection and less than 1 ms for propagation. A separate city trace also recorded a V8 deoptimization in the waveform score loop near delayed source startup. Faster compatible-run lookup, precomputed probe interpolation and additional warmup alone still produced hard misses in the retained traversal.

The corrected startup prepares exact waveform matches on disposable voices. Fresh production voices reuse a result only when the prepared input and reference identities, initial cursor, search horizon, room threshold, RNG seed and ordered interval runs agree. Preparation advances no live voice and adds no queued frames. Unmatched inputs use the regular search. The grain reader reuses per-voice scratch and the already calculated source-time coordinate. The focused suite passed 35 tests. A separate comparison against the exact starting source matched 144 blocks of engine and exhaust PCM, RNG, read bounds, grain clocks and transition counters across three source rates with nonuniform intervals and gaps.

Exact match reuse alone still produced four hard misses in a third docks replay. The identical synthesis code with startup bytecode retained cut that docks trial's first source block to 2.011 ms and the run maximum to 4.694 ms. This comparison supports bytecode aging as a contributor to cold synthesis. A separate instrumented trial also measured elevated propagation and bookkeeping time. The STREET-01 host now enables bytecode retention on the package-bound Node launch, within the existing 1,024 MiB owned process job.

| Clocked run | First source | Maximum complete render | Over 8 ms | Over 10.667 ms | Ring underflow frames |
| --- | ---: | ---: | ---: | ---: | ---: |
| Retained world, delayed docks source | 7.619 ms | 9.735 ms | 1 | 0 | No host ring in this replay |
| Retained world, delayed city source | 7.643 ms | 10.531 ms | 2 | 0 | No host ring in this replay |
| Normal host, authored world and discard sink | 2.272 ms | 4.545 ms | 0 | 0 | 0 |

Both retained runs reused the two initial registrations. They produced 7,770 and 7,793 blocks respectively, with the producer's world worker joined at shutdown. The retained replays used Balanced CPU, retained world geometry and installed-path diagnostics. Producer memory peaked below 539 MiB. The Performance CPU host fixture delivered 7,770 blocks while SoundMap polled and five revisions were published. Maximum ring-admission interval was 44.548 ms. The receipt verified the bytecode switch on the actual package-bound Node process. These runs leave the previous live GTA delivery failure open.

## Camera streaming and SoundMap

The table uses the city delayed-source run for the shared camera traversal. The last two rows report delayed source acquisition in their respective runs. Context counts are maxima across surrounding worksets, which can overlap. Renderer and viewer renewals retain their original lease, source identity and admission checks.

| Scenario | Selected / resident maxima | Renderer surfaces | Admissions / replacements | Surrounding context surfaces | Maximum render |
| --- | ---: | ---: | ---: | ---: | ---: |
| Central city | 3 / 3 | 16 | 8 / 7 | 513 | 2.274 ms |
| Rural | 2 / 5 | 640 | 6 / 5 | 245 | 1.127 ms |
| Mountain | 2 / 10 | 118 | 13 / 12 | 555 | 1.505 ms |
| Docks | 3 / 15 | 567 | 7 / 6 | 737 | 1.048 ms |
| Multi-level freeway | 4 / 16 | 130 | 6 / 5 | 770 | 0.625 ms |
| Tunnel | 9 / 16 | 10 | 6 / 5 | 21 | 0.954 ms |
| Island | 1 / 16 | 76 | 5 / 4 | 871 | 0.572 ms |
| City revisit | 3 / 16 | 16 | 6 / 5 | 513 | 0.573 ms |
| Conditional-only workset | 0 / 16 | 0 | 0 / 0 | 0 | 0.391 ms |
| Higher-layer area | 3 / 16 | 640 | 6 / 5 | 509 | 1.018 ms |
| Exterior before interior | 4 / 16 | 300 | 5 / 4 | 1,007 | 0.867 ms |
| Retained foyer proxy | 5 / 16 | 192 | 81 / 79 | 512 | 0.810 ms |
| Exterior after interior | 4 / 16 | 300 | 8 / 7 | 1,007 | 0.821 ms |
| Delayed docks source | 3 / 16 | 592 | 8 / 7 | 737 | 9.735 ms |
| Delayed city source | 3 / 16 | 471 | 6 / 5 | 513 | 10.531 ms |

SoundMap shows the actual renderer decision, counts surrounding surface IDs separately from admitted surface IDs, and labels the unknown-region reasons reported by the context worker. Conditional-only selection withheld 13 resources. Rural and higher-layer cases admitted qualified exterior subsets while preserving unknown higher-layer coverage. The foyer admitted and withdrew the camera-bound geometry and kept portal state unknown. Each final traversal had one foyer renewal gap while the lease and measured renewal reserve withheld the workset. The gaps were 1.627 seconds in the docks run and 1.898 seconds in the city run, with camera samples arriving at most 79 ms apart. The traced docks baseline also exhibited a gap. Geographic breadth and live activation remain unverified beyond the replay evidence.

The next live qualification needs a separately approved discard-sink session during ordinary gameplay from the existing save. The evidence needs to connect runtime group and collision-layer state, interior instance identity and portal/door state to the same catalogue, session, generation and expiry. The test should record automatic camera discovery, admissions and withdrawals, viewer context, delayed eligible sources, complete rendering and ring continuity. Unavailable runtime state remains unknown.
