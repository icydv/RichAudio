# Synthetic ownership policy fixtures

Run `node --test tests/Test-AudioOwnership.mjs`, or `tools/Test-Offline.ps1`.

This is test-only JavaScript, not a native adapter, runtime bridge, playback
backend, DSP engine or public sound-pack ABI. It uses authored numeric samples
and no file/audio/device/game APIs. Two independent synthetic sources plus a
horn form a 4,800-frame fixture at 48 kHz. The replacement copy is deliberately
phase-identical to its native fixture so the expected sum is exact.

`OwnershipSimulation` assumes a common sample-clock selector controls BOTH
copies and can independently expire a lease when its controller fails. GTA has
not supplied those capabilities. Capability flags in these tests are synthetic
premises, not observed GTA facts. The 96-frame expiry is a stress-fixture value,
not a gameplay timing recommendation. Lifecycle identity contains session,
handle, generation and component; model equality cannot substitute for it.

Normal transfer has zero duplicate/missing-owner frames and zero sample error
under those assumptions. Unsupported capability and unconfirmed restoration
remain blocked/failed. Negative controls deliberately remove the common
selector: an eight-frame command delay causes eight duplicate or silent
frames, and persistent mute plus a dead renderer causes silence throughout.

No synthetic success establishes stock waveform reconstruction, native engine
muting, real crash safety, phase synchronisation, listening quality or any
Enhanced audio capability. See [P2-02 report](../../docs/P2_02_AUDIO_OWNERSHIP.md).
