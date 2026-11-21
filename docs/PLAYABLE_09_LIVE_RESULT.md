# PLAYABLE-09: first passive live attempt

**BLOCKED at the actual RPH runtime-provenance gate.** One separately authorised deployment and launch used the exact reviewed ASI and passive plugin. Both loaded; the process-bound lease reached the runtime check. The plugin then retired with `actual-rph-runtime-bytes-or-version-unreviewed`, **zero accepted observations and zero gameplay frames**. There was no retry. The original installation is restored, with all 11 protected files and four settings fingerprints matching.

This result supersedes the historical readiness decision in the [offline report](PLAYABLE_09.md), [candidate receipt](../evidence/playable-09-candidate.json) and [one-launch proposal](PLAYABLE_09_LIVE_PROPOSAL.md). Those frozen preparation receipts remain unchanged. Their approval was consumed by this attempt; they do not authorise another run.

## Actual observations

- Native ASI: 129,024 bytes, SHA-256 `05dde26d9264b1a3133a5c027e796f58849349f0335bc264bc4ae91a07bc7b40`. SHV logged one registration, one `main()` launch and one unregistration.
- Passive RPH plugin: 328,192 bytes, SHA-256 `c97acbcb6af255a0497c28f8349d8be3447f53c6dc5e31a0d567a7ebbc76743d`. RPH loaded it and logged the rejection at 05:00:27.820 UTC on 1 November 2026.
- I reported “Not ready / error shown”. READY, source Open, independent binding, clock calibration and BEGIN were not reached. No session journal directory or raw source records were created.
- No RichAudio audio host, generated playback, menu/recorder services or endpoint capture started. No broken RPH ratio fallback was used. Actual stock-audio listening acceptance was not assessed.

These are actual framework/launch observations, not fixture output. They establish neither a real engine-state read from this new producer nor a live SHV/RPH vehicle correspondence. The restricted PLAYABLE-08 engine-state acceptance and the 32-case offline component result remain unchanged.

## What the rejection establishes

The entry computes SHA-256 and FileVersion from `typeof(Rage.Game).Assembly.Location`, then requires both to equal the configured RPH expectation: digest `73f05b3f7973d4731f4151ae061dd3c991065e8bf3ece51ea1d9ab728b9b42ac` and version `1.132.1428.17748`. That digest also identifies the installed launcher executable.

The observed error establishes that **the actual API assembly hash and/or its file version differed from that exact expectation**. It does not identify which comparison failed. The actual assembly path, digest, name and version were not persisted before this pre-journal rejection. A packed launcher having different bytes from a cached/extracted API assembly is a plausible explanation, not a proven diagnosis. This is a failure of the current candidate's runtime-provenance gate; it does not prove a framework defect or a native-resolution failure.

The gate runs before module attachment/Open, composition and journal creation. Therefore the terminal line's `producerCompleted=False`, `nativeFifoDrained=False`, writer-completion false and queued zero are **initialised local values**, not measured producer-completion, FIFO or writer failures. No source attempt counter was queried. The reviewed control flow never entered target acquisition; an independently measured native-call count is unavailable. Do not turn the absent journal into a fabricated zero/invalid engine value.

## Exit and verified restoration

The normal GTA quit prompt was observed and confirmation was attempted. The computer-use tool reported a foreground-process-ID error as the game disappeared, so attribution of that confirmation input remains unobserved. GTA/RPH process exit was independently verified; no force-termination command was used.

Ownership/hash-verified rollback removed only the approved ASI, generated lease and temporary plugin, restored the exact original 222,208-byte plugin (`611347ab5828bedf0bd71102e4df125ed13666f6a7e7e3eccbc761a76a7fb657`), and verified all 11 protected files/four settings. Owned pending/backup/lease/probe paths and relevant processes are absent. Stock fallback and disabled loudness/recording flags remain selected. Full private logs and receipts are retained; only sanitised evidence is published.

## Next evidence boundary

The next offline correction should separate **launcher installation identity** from **the actual typed RPH API assembly identity**, and retain bounded provenance witnesses before a rejection. Any runtime artifact must be related to reviewed framework provenance before its digest is trusted. A first-seen hash or matching version alone must not become automatic acceptance.

No revised candidate, new probe or second launch was implemented for this result. A changed diagnostic/candidate needs offline build, tests and review followed by fresh exact-artifact approval. Further live handoff, gameplay PCM, human listening, loudness and recording remain BLOCKED. The upstream RPH report remains unsubmitted; this guard failure must not be reported as a proven RPH native defect.

[Sanitised live evidence](../evidence/playable-09-live-01.json) · [verified rollback](../evidence/playable-09-live-rollback.json)
