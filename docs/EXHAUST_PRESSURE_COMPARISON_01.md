# Exhaust pressure listening comparison

The user requested 5×, 7×, 7.5× and 10× exhaust pressure alongside the current 2.5× balance, then listened and selected **10×**: “10x is perfect, just listened to it”.

`tools/Render-ExhaustPressureComparison.mjs` adds a private `exhaust-pressure.html` beside the existing Source05 audition. All four genuine banks have open-road and authored 24 m street examples: 40 WAVs total. The published Source05 page, report and WAVs remain unchanged. Existing source pitch/texture imperfections remain open.

Each eight-case source performance is rendered once into engine and exhaust acoustic stems through the existing causal renderer. The stems share the exact accepted path controls and original PCM histories. The same linear renderer also reconstructs the published 2.5× full output; its maximum difference is zero before the common trim. Every delivered comparison is `0.25 * (engine + multiplier * exhaust)`, including the 2.5× reference. This is a common −12.0412 dB headroom trim, with no independent normalization, EQ, compression or limiting. Engine level, motion, directivity, path losses, material response, source state and event plan remain identical within each comparison group.

| Exhaust multiplier | Exhaust increase versus current 2.5× |
|---|---:|
| 2.5× | 0 dB |
| 5× | 6.02 dB |
| 7× | 8.94 dB |
| 7.5× | 9.54 dB |
| 10× | 12.04 dB |

Set playback volume once for this quieter comparison page, then hold it fixed. The multipliers describe authored digital pressure calibration, not physical SPL or an exhaust-resonance model. Increasing this control alone does not repair source repetition or add new exhaust texture.

The highest delivered sample peak is 0.6217024 (−4.13 dBFS). All 40 files pass finite/headroom checks. The eight reference renders retain five offline block deadline misses; these measurements do not establish live performance. The report includes near-pass (4.8–5.8 s) and lift/recession (6.3–10.3 s) RMS/peak as well as whole-file metrics, source/control/motion hashes and exact reference errors.

`src/acoustics/vehicle/stock-pressure.mjs` records the shared selected profile. `createStockVehiclePipeline` applies it once: engine pressure `.25`, exhaust pressure `2.5`, preserving the accepted10× relative multiplier and common `.25` trim. Generic renderer defaults and the historical comparison renders retain their explicit calibration. The module accepts arbitrary paired stock-bank identities; this does not assert that all installed banks have been decoded or integrated.

Private audio stays local. Sanitized measurements are in `evidence/exhaust-pressure-comparison-01.json`. No subjective listening by the assistant occurred. **Exhaust-pressure selection is accepted by the user; complete source quality, residual stepping and runtime acceptance remain open.** Startup world preparation and all-vehicle replacement continue separately; this audition does not establish either capability.
