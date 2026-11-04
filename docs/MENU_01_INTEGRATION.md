# MENU-01 local integration

My existing PR94 sidebar is integrated into the actual WORLD13 development checkout, `feature/world-13-reliable-ci-render-tails`. Codex reviewed and fetched exact UI commit `6a515f21b956e62cf86945cbdd3f7e86856ec807`, verified its seven-file scope and common parent `85646ec65f2f88f0eb935374a79260a75e96b728`, then performed a conflict-free local integration merge onto completed WORLD13 head `1f496a7e05c978c4b2eade0524055ac93b56e413`. The backup ref `backup/menu-01-before-integration-1f496a7` preserves that starting point. No GitHub draft PR was merged.

The three runtime C# files remain **exactly PR94's Git content**: left-anchored charcoal/gold sidebar, full-height landscape layout, 260 ms reversible motion, subtle fixed viewport dimming and the final white/dark custom cursor. This increment adds integration verification and actual-260-ms software previews; it does not replace my design.

## Settings and input

My model, preference schema, validation, persistence/CAS, host-status reader and action contracts are unchanged. Quality, Auto/CPU/GPU, output enable/level, early reflections, fixed Doppler indication, diagnostics, SoundMap, integration mode, saved menu shortcut, recording controls, Apply, Reset and Back remain connected to their existing behavior. The stock-fallback default and explicit experimental/recording gates remain intact. Integration starts neither playback nor recording.

The same normalized game-pointer coordinates feed hit testing and the custom pointer. The pointer's fourteen drawing commands follow all dimmer/sidebar commands. Pointer actions are accepted only when fully open, when slide displacement is zero. Opening/closing input capture, fresh-key reversal and held-close release remain unchanged. The RawFrameRender callback still consumes immutable commands only; no input/natives, file IO, audio/GPU computation or worker waits were added there.

## Validation performed

- **1,568 dedicated menu checks pass**, including all existing PR94 checks plus explicit 260 ms tests across 800×600, 1280×720, 1920×1080, 2560×1080, 3440×1440, 5120×1440 and 3840×2160. These cover full-height landscape layout, animation/hit transforms, cursor hotspot/order/visibility, closing focus/reversal and unchanged model state.
- The complete selected **WORLD13 functional wrapper passes on Node24.19.0**: 838 inherited Node passes, 191 portable passes /24 unchanged named research exclusions, 23 WORLD11, 45 WORLD12 and 13 separate cleanup controls. It includes the actual menu, settings, handoff, recording-bridge and deployment-layout fixtures; these are separately reported populations, not a unique total.
- Within that run, **59 settings/persistence**, **60 off-fiber menu bridge/CAS**, **18 recording-bridge** and **34 deployment-layout** checks pass. The real device-free settings/host/Node handoff acknowledges changes, keeps one source identity over 390 received PCM blocks and verifies mute/resume and early-reflection controls. It constructs no endpoint or visible window; its transport counters are not device-underflow or gameplay proof.
- **63 targeted settings/audio/WORLD13 source, renderer and GPU-readiness tests pass separately under Node22.23.4 and Node24.19.0**, with zero failures or skips. No acoustic-engine, synthesis/PCM, GPU backend, cache or host-control source changed in this integration.
- The existing PR94 reference artifact was retained against its canonical 78,857-byte ZIP SHA-256, with all three PNG CRC32/SHA-256 values checked. Codex visually compared the original cursor preview with the integrated actual-260-ms preview. These are controlled drawings, not GTA screenshots.
- Independent review found no integration blocker. See [review](MENU_01_INTEGRATION_REVIEW.md) and [evidence](../evidence/menu01-integration.json).

The dedicated workflow retains the original three preview names and adds only the three explicitly allowlisted 260 ms/ultrawide PNGs. The original 220 ms core-contract tests and reference previews remain distinguishable from the actual adapter's 260 ms verification.

## Construction cost and limits

The [bounded frame-cost comparison](../evidence/menu01-frame-cost.json) retains nine fresh processes and all samples. At 1920×1080, baseline versus integrated visible-pointer construction has **7.0 /6.9 µs median**, **9.5 /10.0 µs p95**, **19.2 /18.2 µs p99**, and **96.6 /84.4 µs maximum**. The common no-pointer call's p95 is 11.7 µs. These are mixed tails, not an improvement claim. Pointer cold construction rises from baseline **10.076–10.293 ms** to **10.687–11.123 ms**; those costs remain retained. CPU counters are too coarse to establish savings.

The presented command/hit counts are **109/28 baseline**, **103/28 integrated common**, **117/28 integrated cursor**. This measures model/frame construction only, excluding RPH/native rasterization, actual GTA composition and game FPS. No additional audio queue, buffering or fixed latency is introduced. WORLD13's known processing/headroom failures remain valid and are not reclassified by a passing menu test.

## Still requires an authorized GTA Enhanced test

Live acceptance must check actual native/custom cursor ordering and possible double cursors, physical click/slider alignment, movement, readable fonts, keyboard/controller navigation, pause/console/resolution transitions, gameplay-control capture, close/unload and frame-time/FPS impact. Software draw order alone cannot establish GTA compositor ordering. Landscape and ultrawide coverage are verified; width-constrained portrait/extreme aspect ratios remain unqualified rather than being claimed universally full-height. No private RPH SDK or installed-game resource was read for this integration, and no combined live plugin or deployed installation is claimed.

All WORLD13 commits, sealed reports, consumed approvals and private evidence remain preserved. No GTA/RPH launch, plugin deployment, actual endpoint, recording, native suppression, developer contact or pull-request merge occurred.
