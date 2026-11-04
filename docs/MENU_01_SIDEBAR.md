# MENU-01 — My full-height RichAudio sidebar

**Status: implementation prepared for offline validation.** This is a UI-only change; it does not start or modify GTA, change the RichAudio audio engine, install files, use an endpoint or grant a live approval.

## What I changed

I want the F10 experience to feel like a carefully integrated part of the game, not a floating debug window.

- **Full-height left sidebar:** the main panel is anchored at X=0, Y=0 and occupies the complete viewport height, using a constrained width derived from screen scale. It has no floating margins.
- **True slide-out animation:** the entire sidebar moves from beyond the left screen edge to its final position on opening, and reverses on closing. The existing monotonic smoothstep transition, short input-release guard and hit-region transform remain. The RPH bridge uses a 260 ms transition.
- **Subtle scene dimming:** the game receives a maximum 46/255 (~18%) black overlay while the menu is presented, rather than a heavy opaque backdrop. The dimmer does not slide with the sidebar.
- **Minimal visual hierarchy:** charcoal and restrained gold, one status surface, clear processing/playback groups, compact selectable rows and two-column footer actions. No large gold-filled row cards or excessive metallic decoration.
- **Top-layer cursor:** GTA's cursor may render underneath RPH's overlay. The adapter already reads the normalised GTA cursor controls; I now pass those same screen coordinates to the immutable presentation, drawing a high-contrast white, dark-outlined pointer **after** the sidebar in the same RPH draw list. It is displayed only while the menu is fully open, pointer input has been observed and the coordinates lie within the sidebar. Pointer hit testing uses the existing unmodified coordinates; no mouse interception, OS-cursor manipulation or new graphics hook is introduced.
- **Existing functionality preserved:** quality, Auto/CPU/GPU, output enable/level, reflections, read-only Doppler, diagnostics, SoundMap, integration mode, menu key, Apply, Reset, Back and the recording actions. The status remains grounded in current measured host information and explicitly unavailable otherwise.

## Input and drawing constraints

The RPH game fiber continues to own GTA getters, normalized cursor sampling, input focus and gameplay-control suppression. The RawFrameRender callback **only draws prebuilt immutable commands** and performs no natives, input, file IO, endpoint work or worker locks.

The canvas uses a 620×1000 internal layout, scaled by min(actual height/1000, actual width/900), with a maximum viewport of 7680×4320 and minimum of 640×360. Its right border and fine shadow remain onscreen. The original 14 logical rows and actions are unchanged, so keyboard/controller navigation and stored preference schemas stay compatible.

Cursor draw order is guaranteed **within RichAudio's own draw-command list**. Whether RPH renders that list above GTA's system pointer in every actual Enhanced configuration still needs a separately approved in-game visual inspection; a software preview cannot prove game-frame compositor ordering. The overlay pointer is therefore the chosen fix, not a claim that the GTA native cursor layer has changed.

## Offline acceptance

The focused [menu test](../tools/Test-InGameMenu.ps1) exercises the actual SDK-independent layout, model, pointer targets, keyboard/controller logic, transition and status. It also emits private software previews across 800×600, 1280×720, 1920×1080 and 3440×1440, including an example of the foreground RichAudio cursor. Tests assert full-height X=0/Y=0 sidebar occupancy, bounded drawing/regions, full-width slide alignment, dimmer opacity and pointer-last ordering.

The isolated menu workflow runs those tests without the world's inherited offline performance/containment failures, and remains distinct from the full existing workflow. I have not claimed an in-game rendering test, endpoint playback or release readiness.

## Future live acceptance boundary

An independently approved exact GTA Enhanced/RPH launch should verify F10 opening and closing, native pointer vs custom top-layer pointer, click targets/slider, readable fonts and scale, Ultrawide/resolution behaviour, controller/keyboard focus, FPS/frame-time impact, pause/console transitions, clean unload and all existing settings persistence. No such launch is authorised by this document.