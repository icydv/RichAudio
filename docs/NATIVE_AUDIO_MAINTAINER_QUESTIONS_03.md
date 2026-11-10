# Native audio maintainer questions

These drafts are unsent. The target versions, symbols and documentation links are public technical context.

## RAGE Plugin Hook or Enhanced native integration maintainer

**Effective vehicle audio state and fail-open engine/exhaust control on Enhanced**

I’m targeting Story Mode on GTA V Enhanced 1.0.1158.16 with RPH 1.132.1428.17748. I need to replace continuous engine and exhaust on one vehicle lifetime while keeping its horn, transmission, tyres, collision and other native audio. A second vehicle of the same model must stay untouched.

1. Is there a supported native or SDK method to read the effective vehicle audio object, distinguish the base object from an active override, and identify that override’s provenance? `FORCE_USE_AUDIO_GAME_OBJECT` (`0x4F0C413926060B38`) returns void. The default-horn getters return a sound identifier.
2. If an override is supported, what operation restores the exact previous state on the same vehicle lifetime, including an existing override? Is there engine-owned expiry or automatic reset after the controlling fiber or RPH AppDomain fails?
3. Is there a supported per-instance route or gain for continuous engine/exhaust that leaves the profile and other native sounds intact? Can the stock route resume automatically when the controller, callback or replacement feed disappears?
4. If recovery requires a second game-side authority, which supported execution context keeps native access after the original RPH AppDomain unloads? The reference SDK declares named AppDomains and game fibers. I need to know which boundary the runtime actually guarantees.

A build-specific symbol or documentation reference and a safe read-only way to check the effective-state result would be enough to start.

## OpenRPF and RageOpenV maintainers

**Standalone private audio DLC without an update archive shadow**

I’m evaluating Story Mode on GTA V Enhanced 1.0.1158.16. I have a small authored OPEN DLC with a unique device, a DAT151 vehicle-audio object and an `AUDIO_GAMEDATA` startup declaration. A future private profile may also have DAT54 dependencies. I want the original `update.rpf` and unrelated DLC entries to remain untouched.

1. Does OpenRPF 0.3 support a loose effective `dlclist.xml` or a standalone DLC registration mechanism on this build that avoids a complete update archive shadow?
2. RageOpenV v1.0 source includes a loose startup device for the DLC list and pack. Is that specific list/pack path supported in the release on Enhanced, given the later notes about unfinished loose-file support? How can I verify that untouched archive members still resolve to stock?
3. If either route is supported, can the boot log or a read-only lookup distinguish file visibility, DLC registration and actual resolution of an `AUDIO_GAMEDATA` object? What is the supported load and unload boundary for DAT151 and DAT54?

[OpenRPF release notes](https://www.gta5-mods.com/tools/openrpf-openiv-asi-for-gta-v-enhanced/), [RageOpenV v1.0 source](https://github.com/Chiheb-Bacha/RageOpenV/blob/f742117a5e8ccc359bf3b4644c6bce7dad77cc7a/src/hooks/CustomDevice.cpp)

## CodeWalker maintainer

**Gen9 private audio DLC validation and runtime registration boundary**

I can round-trip authored DAT151 and DAT54 records and a small OPEN DLC with a unique device and startup change set. My target is Enhanced 1.0.1158.16 in Story Mode. The remaining question is what I can validate about registration and dependency loading before testing in GTA.

1. Is there a documented Gen9 workflow for registering a standalone private audio DLC without replacing or shadowing the whole `update.rpf`? If the runtime still needs a loader or an effective list change, where does CodeWalker validation stop?
2. For an independently named DAT151 object with private DAT54 references and untouched stock dependencies, what build-specific manifest, namespace or load-order rules should I validate? Is there a read-only method to confirm the object and its dependencies resolved in Enhanced?
3. Do you know of a documented engine-facing reference for effective per-vehicle object readback or engine-owned component routing? My authored round trip only verifies serialized records and references.
