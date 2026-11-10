# Native source interception questions

These technical drafts are unsent. They contain public target versions and interfaces only.

## RPH or Enhanced audio integration maintainer

**Automatic vehicle audio voices before spatial mixing on Enhanced**

I’m targeting GTA V Enhanced 1.0.1158.16 with RPH 1.132.1428.17748 in Story Mode. I want to process continuous engine/exhaust on one vehicle through an external acoustic renderer while keeping the game’s profile, bank selection and all unrelated sounds intact.

1. Is there a supported, maintainable observer for automatic vehicle voices before distance attenuation, Doppler and environmental processing? I need the buffer format and ownership, source frame clock, voice lifetime, full entity lifetime, component or event identity and source pose. A script-created sound ID or final process mix does not provide that association.
2. Is there a paired contribution-selection operation that uses the original native contribution unless a valid replacement for the same source interval is ready? Who owns that decision, on which thread, with what deadline and fallback after host, callback or RPH AppDomain loss?
3. Could such a route preserve two identical vehicles and custom sound-bank vehicles independently? If only a per-vehicle premix is available, which processing and components have already been combined?
4. If automatic PCM access is unavailable, is there an engine-owned, expiring engine/exhaust-only control bound to one vehicle lifetime that leaves the existing effective profile in place?

The first useful result would be an exact supported interface and a metadata-only observation procedure. No audio capture, bypass or profile mutation would occur before separate qualification.

## Cfx audio integration maintainer

**Externally supplied PCM versus access to existing automatic vehicle voices**

I reviewed the external-stream sound and PCM ring in `NuiAudioSink.cpp` at `5c3065c261fb3ba82032fee6803f247198fec221`. That source supplies PCM to an audio entity owned by the extension.

1. Does FiveM for Enhanced expose a supported extension for reading existing automatic engine/exhaust PCM with vehicle, voice-generation and component identity before spatial processing?
2. If so, is there a fail-open routing contract that preserves the original path when replacement data or its controller disappears? Does the guarantee cover failure of the routing component itself?
3. Which of these capabilities are specific to FiveM for Enhanced, and which have a documented single-player integration contract? If the existing interface only creates external sounds or processes voice, that distinction would resolve the immediate question.

[Reviewed external-stream implementation](https://github.com/citizenfx/fivem/blob/5c3065c261fb3ba82032fee6803f247198fec221/code/components/extra-natives-five/src/NuiAudioSink.cpp)
