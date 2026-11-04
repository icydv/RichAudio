# MENU-01 integration review

I am integrating the MENU-01 sidebar into WORLD13 with its existing design and controls preserved. My target is the landscape and ultrawide desktop layouts covered by the controlled previews. This review does not authorise a GTA/RPH launch, deployment or pull-request merge.

## Codex independent review

Codex reviewed the local integration against WORLD13 base `1f496a7e05c978c4b2eade0524055ac93b56e413` and PR #94 tip `6a515f21b956e62cf86945cbdd3f7e86856ec807`. No integration blockers were found within this offline scope.

- All three runtime C# files match PR #94 exactly: `InGameMenu.Rph.cs`, `AcousticMenuLayout.cs` and `MenuTransition.cs`. The additional integration coverage changes tests only.
- The menu contracts, 14 logical rows and their actions, preference schema, persistence/CAS service, saved shortcut handling and WORLD13 acoustic/GPU implementation are unchanged. Auto/CPU/GPU, explicit experimental quality choices, measured active status and the `stock-fallback` default remain intact. No experimental option is enabled by this integration.
- The adapter retains normalized cursor coordinates for hit testing and presentation. Pointer actions remain gated to the fully open menu, when the slide is zero. The custom pointer follows every sidebar command in the same immutable draw list. Closing and forced-close focus handling remain intact.
- Drawing and hit-region counts remain bounded. The render callback consumes prebuilt commands; the imported changes add no file IO, audio/recording dispatch, native calls, worker waits or GPU synchronization to that callback.

Codex reviewed the existing focused test receipt at `.local/menu01-integrated-menu-01.tap`: **1,568 checks passed**. Codex did not rerun those tests as part of this independent review. The integration tests add meaningful coverage of the adapter's actual 260 ms animation, complete command/hit-region alignment, pointer hotspot/order, reversal and held-input release. Additional private 260 ms previews are under `.local/menu01-integrated-menu-01`.

The final staged review also checked the retained Node 24 functional results and raw log summaries: 838 inherited Node passes, 191 portable passes with 24 named research exclusions, 23 WORLD11 passes, 45 WORLD12 passes and 13 separate cleanup passes. These are separate populations, not one pooled total. The log independently records 59 settings, 60 bridge/CAS, 18 recording-bridge and 34 deployment-layout checks. Both targeted Node 22 and Node 24 receipts record 63/63 passes without failures or skips. Codex reviewed these existing receipts and their file bindings without rerunning tests. Pre-existing tracked WORLD13 reports, seals and controls are unchanged.

## Evidence boundary

These are software layout, model, input-policy and immutable presentation checks. The layout uses `min(height/1000, width/900)` scaling; full-height coverage is established for the tested landscape/ultrawide layouts, not every accepted narrow or portrait aspect ratio. The tests do not establish cursor-glyph clipping at every screen edge.

Actual GTA/RPH composition, native versus custom pointer visibility, real click/slider alignment, keyboard/controller behaviour, pause/console transitions, reload/persistence behaviour and GTA FPS/frame-time impact remain unvalidated. They require separately approved live evidence. Offline frame-cost evidence, if reported elsewhere, is not GTA FPS evidence.

This independent review used repository source and retained offline receipts. It did not access a private RPH SDK, installed game resources, GTA/RPH, an audio endpoint or a recording session, and performed no deployment or GitHub merge. Full integration-suite results are in [the integration report](MENU_01_INTEGRATION.md).
