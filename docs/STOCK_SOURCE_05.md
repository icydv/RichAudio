# STOCK-SOURCE-05 — city wall returns and exterior exhaust weight

Base: `15516da787fc924dd3fa4ca91f1062f8b616c7bd`. Source04's improved source player is frozen byte-for-byte. The user's remaining Lectro/X80 pitch-stepping verdict stays open; added returns are not a pitch repair. Perceptual acceptance of this increment is pending listening.

## What changes

The existing finite image-source solver now accepts up to sixteen explicit additional reflection sequences, each three to ten interactions with real surfaces in the supplied model. It checks every finite bounce, opening, obstruction, material, retarded emission time, delay and quality limit through the existing solver. Existing zero-to-second-order defaults and candidate enumeration are unchanged. There is no exponential enumeration or fixed-delay echo effect.

The new authored open-roof, open-ended city fixture contains a road and two finite facing facades. The comparison moves those facades to street widths of 12, 24 and 40 model metres, keeping their length 240 m and height 24 m. Alternating wall paths extend to order ten. There are no reflective roof/end caps. Wall energy reflectances are explicit assumptions: `[.94,.88,.72]`; the road uses `[.85,.70,.45]`. A separate absorptive-wall diagnostic changes only facade materials to `[.25,.12,.04]`.

For a stationary centreline source/listener separated by D along the street, the independent unfolded wall-path distance is `sqrt(D²+(nW)²)`. Each path delay is total length/343. Pressure receives the product of square roots of the energy reflectances, once per interaction, then total-path distance and air losses. Wider spacing therefore changes echo intervals, interference and the time over which the finite train returns. Greater absorption reduces the later returns without moving them in time.

This is **authored city geometry, not Legion Square**. Existing evidence contains only a sampled hills collision summary and local observed patches, not a verified city model. These specular trains provide a longer geometry-derived reflection response. They do not establish diffuse scattering, measured urban decay or a calibrated modal-resonance model. No outdoor FDN is enabled. Research likewise distinguishes prominent image-source reflections from scattered street energy ([Vos et al., 2024](https://research.tue.nl/en/publications/sound-propagation-modelling-in-a-street-canyon-by-combining-an-im/)).

## Explicit exhaust calibration

The user's requested stronger exterior exhaust is now a separate immutable emitter-pressure calibration: exhaust `×2.5` (**+7.96 dB relative to the previous emitter level**), engine `×1`. It applies equally to every direct/reflected arrival from that emitter. It does not modify original source PCM histories, source reconstruction, pressure shares, EQ, passive path-loss coefficients or the common renderer master `.7`. The common source gain remains `1.5956559506856056`.

This is an authored relative game mix, not measured sound power or physical dB SPL. Ducati documents particular Panigale racing-exhaust configurations around a 105 dB limit, or 102 dB with an insert ([Ducati](https://www.ducati.com/us/en/news/the-evolution-of-ducati-never-stops-new-panigale-v4)); that does not calibrate a WAV, headphone setting or every Panigale configuration. No SPL value is assigned to these outputs.

The calibration has independent identity/range validation, is fixed for a renderer's lifetime and leaves the public output attenuation control unchanged. Default/unit calibration produces identical PCM. Tests prove that the exhaust and all of its arrivals scale once, engine-only output stays identical, and original source history buffers retain identical samples. No limiter or independent normalization makes a comparison louder.

## Controlled listening package

Subsequent pressure comparison: the user listened to2.5×/5×/7×/7.5×/10× options and selected **10×**. The preserved files described below retain their original2.5× calibration. See `EXHAUST_PRESSURE_COMPARISON_01.md` for the accepted shared profile, common headroom trim and additional listening files.

Private page: `.local/stock-source-05/audition/index.html`, in the same parent folder as the audition files. All four original banks have five 10.3-second examples:

1. Open road with the previous emitter level.
2. Identical open road with the explicit stronger exhaust.
3. Reflective city at widths 12, 24 and 40 m, all using that same stronger exhaust calibration.

Every comparison within a vehicle has identical source PCM, operating controls, native-event plan, listener and continuous motion. Motion is the explicitly authored city pass at 22 m/s (79.2 km/h), with the pass at 5.3 s. It is a new controlled city study, not the previous high-speed trajectory. Open road retains the same finite ground; facade changes alone distinguish the city cases. No per-file loudness matching or normalization occurs.

The package contains 20 vehicle WAVs, native-X80-pop and analytic-impulse responses at the three spacings plus an absorptive 24 m control, and separate direct/early/added-wall-train/full X80 stems for the 24 m street: 32 new WAVs in total. Eight figures show actual timing, decay and relative spectral differences. The native-pop diagnostics use the same verified one-shot waveform and emit it once. Analytic impulses are diagnostic signals, not replacement vehicle sounds. Forty players include eight preserved Source04 links, with common volume and no autoplay.

## Validation and limits

- All 32 WAVs are finite and unclipped; maximum sample peak is **.70058**. Actual renderer limiting, PCM-history faults, rejected controls and overflow remain zero.
- Source04 source/control hashes match exactly. Seventy-six protected earlier inputs remain unchanged. The independent full render agrees with direct + early + added-train stems to about `3.01e-8` sample amplitude.
- Independent geometry tests cover widths 12/24/40, orders 3–10, square-root energy losses, altered absorption, finite supports, wall openings, blockers, missing materials, expiry, delay budgets, reflector caps and a moving-source retarded-time solution. A high-order impulse reaches the actual causal renderer at its independently predicted sample.
- Seventeen complete-block deadline misses in the final main runs are retained; worst block **15.5691 ms** against **10.6667 ms**. Twelve misses in the separate headroom preflight are also retained privately. This is not real-time/GTA certification.
- Added paths stop at the declared order and finite supports; retained path budgets can omit weaker candidates. No complete diffuse late field or infinite street is claimed. Source pitch imperfections and perceptual acceptance remain open.

Sanitized results: `evidence/stock-source-05-audition.json`. Audio, original assets, geometry payloads and plots stay private/uncommitted.

## Newly requested runtime work

The user has additionally requested startup preparation of the installed/custom-map acoustic world and all-vehicle native-sound replacement, ending in a launcher-ready plugin. That is now active integration work, not functionality established by this audition.

The existing separate VehicleLive01 branch supplies a one-player-car producer/telemetry/causal/RA07 host seam, but remains additive. Current source-bank tools prove four banks, not every vehicle; startup cache code does not assemble the installed world's YMAP/YTYP/MLO/collision geometry. The installed executable hash also differs from the historical deployment manifest. Startup resource catalogue/import and runtime ownership/coverage work must be completed and validated before a replacement candidate can be called ready. Older branches, failed evidence and existing game archives are preserved.
