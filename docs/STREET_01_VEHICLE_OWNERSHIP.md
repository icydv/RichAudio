# STREET-01: vehicle continuity and selective native ownership

I still require one Bati's engine/exhaust to be replaced selectively. STREET-01 does **not** satisfy that requirement yet. The implementation remains additive, and native takeover remains disabled. Codex has not launched GTA, suppressed a native component or reused a closed PLAYABLE approval for this revision.

## Changes in the actual main-mod adapter

Codex extended `Playable.Rph.cs`, the normal main-mod entry path, rather than the isolated MENU-02 entry point. Normal startup now calls the existing world-preparation supervisor, which validates its sidecar and queues bounded background work; unload requests cancellation. Missing or disabled configuration remains explicit, and the hook alone does not establish a completed installed-world map. A tracked vehicle now binds the full returned pool value, index, counter, opaque address and a per-acquisition serial. Its prepared acoustic bank context remains attached to that source lifetime. Driver attachment is a separate observation: dismounting no longer changes the source generation or selects a new bank merely because the listener is outside the vehicle. The retained vehicle's actual `IsEngineOn` getter continues to determine the reported running flag. An invalid entity, failed getter or expired observation provides no invented engine-off observation.

The bridge rechecks the returned lifetime after the source getters. Ordinary handle recycling cannot inherit the old source. Counter wrap with indistinguishable address/value reuse remains an uncertainty; this change does not claim an unlimited entity-lifetime authenticator.

Camera tracking now uses the existing `CameraListenerTracker`. A measured cut is discarded and starts a new spatial generation. A later independent camera acquisition can recover; the vehicle's operating/source generation remains independent. Story-scope loss invalidates the camera baseline while retaining ordered listener sequence/generation. There is no interpolation through a teleport, refreshed timestamp, extra playback queue or changed 512-frame block.

The gameplay wire has optional `riderAttached` and `riderViewAttached` booleans. Old packets omit them and therefore cannot qualify rider-local airflow. The first reports the actual current local driver relationship; the second additionally requires gameplay-camera rendering and vehicle-follow-camera observations. A detached view can therefore retain the same moving vehicle source while withholding rider-local turbulence. Source airflow velocity comes from `Vehicle.Velocity`, never camera differences. Native coordinates remain `native-unverified`, with the engine's existing declared one-unit/metre assumption; these changes do not establish physical speed calibration.

The new camera queries are declared in the [GTA native corpus for gameplay rendering](https://github.com/citizenfx/natives/blob/master/CAM/IsGameplayCamRendering.md) and [vehicle-follow camera state](https://github.com/citizenfx/natives/blob/master/CAM/IsFollowVehicleCamActive.md), checked by Codex on 5 November 2026. Their declarations do not qualify Enhanced/RPH return semantics on my installation. A query failure withholds rider-view attachment. The genuine installed getters, view association, dismount audibility and source continuity still need an explicitly approved integrated live test.

Closed SHV handoff evidence and its player-driver-only qualification policy are unchanged. This source revision does not silently promote the old SHV proof to detached or post-dismount operating-state authority. The earlier rejected RPH ratio remains a real qualification gap; Codex has not rescaled an out-of-contract getter to manufacture a usable observation.

## Focused offline evidence

`tools/Test-StreetContinuity01.ps1` compiles the actual product Main/Capture methods, actual camera tracker and actual gameplay wire against explicitly authored SDK responses. Eight scenarios passed with 24 assertions: dismount, independent roadside motion, detached camera, discarded camera cut/recovery, observed engine stop versus invalid entity, recycled pool counter, optional wire evidence, listener invalidation and normal-entry startup/unload hooks. The private receipt is `.local/street-01/continuity-eb047cf1b5e44e7280c1e878f5e9b98d/validation.json`. It pins the compiled sources and binary and states that no game, endpoint or native mute ran. This is functional source verification, not an audible or exact-stack native test.

## Why selective native replacement is still blocked

Codex rechecked primary interface documentation on 5 November 2026. The [RPH Vehicle property surface](https://docs.ragepluginhook.net/html/Properties_T_Rage_Vehicle.htm) and [method surface](https://docs.ragepluginhook.net/html/Methods_T_Rage_Vehicle.htm) do not supply an established engine/exhaust-only gain with exact original-state recovery. Those public pages are older than the target runtime, so their absence is scoped documentation evidence, not proof that no internal route exists.

The [profile-assignment native](https://github.com/citizenfx/natives/blob/master/AUDIO/ForceUseAudioGameObject.md) accepts a vehicle and named game object. Its declaration supplies no getter for the current effective override, independent expiry/restore guarantee or exact-stack custom-profile registration contract. A vehicle argument alone does not prove two-identical-vehicle isolation or preservation of auxiliary components. Codex did not try an empty/invalid profile. The [whole-vehicle silent declaration](https://github.com/citizenfx/natives/blob/master/VEHICLE/SetVehicleSilent.md) explicitly reports collateral door/horn effects and therefore fails my selective requirement. No broad mute or physical-engine modification was implemented.

The smallest credible remaining route is a uniquely registered, component-isolated audio metadata graph, selected only for the identified vehicle. That is an inference from the available profile/metadata interfaces. Before it can become an enabled adapter, it needs all of the following evidence:

- A supported loader/registration mechanism on this exact Enhanced/RPH stack, within the approved dependency and distribution scope.
- An effective component/dependency graph distinguishing the continuous engine/exhaust represented by RichAudio from transmission, induction, backfire and the auxiliary sounds GTA retains.
- Exact active-profile/baseline readback or another independently verified restoration baseline, plus two-same-model instance isolation.
- A recovery authority that survives the relevant renderer/plugin/controller failures. A cleanup callback or a controller that must execute its own timeout cannot establish fail-open crash recovery.
- Separately approved audible native-only, prepared, replacement and restored comparisons, retaining horns, tyres/road contact, collisions, radio, ambience and the neighbouring Bati.

My newly approved read-only Bati metadata scope can refine graph attribution, but reading a graph cannot establish these runtime controls. No modified proprietary profile, archive patch, native-suppression package or unsupported loader has been produced. The existing ownership prototype remains accurately labelled a policy fixture; no additional hypothetical state machine is offered as selective replacement.

Codex retained the first field-only survey, whose empty `HashReferences` arrays were an adapter gap because this Core exposes those references as properties. The corrected private survey at `.local/street01-installed/bati-graph-02/resolved-catalog.json` now retains the actual property references for one Bati, three game-record summaries and four granular sound roots. It verifies ten unique engine/exhaust stream references against two actual AWC metadata tables, without decoding PCM. The joined worker took 29.602 seconds and peaked at 1.348 GB across its owned Job. Catalogue digests and raw derived tables remain private.

That corrected graph identifies distinct transmission and upgraded induction references, alongside normal/upgraded exhaust-pop and limiter-pop references. The vehicle record also retains horn and collision references. My existing granular bank covers the selected engine/exhaust acceleration roots; it does not establish ownership of transmission, induction, upgraded pop layers or those auxiliary sounds. Zero and shared fallback references do not prove that a component is absent, silent or active at runtime. The profile identifier remains an explicit model-name fallback inference because the model's audio-name field is empty, and actual runtime selection remains unobserved. These findings make the component attribution more precise; they do not establish selective suppression, same-model instance isolation or recovery after controller failure.

| Capability | Status for this revision |
| --- | --- |
| Normal-product source/camera/attachment continuity logic | Implemented; offline verified with authored observations |
| Actual Enhanced getter, camera association and post-dismount playback | Live unverified; blocked from acceptance until separately approved qualification |
| Native engine/exhaust suppression and auxiliary isolation | Blocked: supported exact-stack mechanism and audible proof not established |
| Independent restoration after controller failure | Blocked: surviving recovery mechanism not established |
| Overall STREET-01 selective-replacement deliverable | Incomplete |
