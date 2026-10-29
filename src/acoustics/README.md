# RichAudio acoustics

`engine/` implements finite direct, first- and second-order image-source propagation and the owned-source PCM renderer. `streaming/` and `host/` provide the existing bounded producer and Windows playback route. The observation and research modules retain acquisition, reconstruction, uncertainty and cache contracts.

`engine/observed-geometry.mjs` now connects bounded GTA wall/ground observation groups to that same offline renderer. It preserves finite polygon support, original provenance and uncertainty, and requires an explicit coordinate/scale contract and partial-world assumptions. Physical GTA scale, acoustic materials and complete visibility remain unverified. See [the integration and runnable demonstration](../../docs/OBSERVED_GEOMETRY_AUDIO.md).

The offline integration produces WAV files without opening an audio endpoint. The opt-in [ACOUSTICS-08 real-time route](../../docs/ACOUSTICS_08_REALTIME_GEOMETRY.md) now feeds `ObservedGeometryFeed` into the actual causal worker and credit-paced RA07 producer, with native pose mapping and explicit clock evidence. A controlled device-free feed demonstrates continuous geometry-dependent PCM. The real RPH geometry publisher and host relay remain future work. Existing source ownership and benchmark contracts remain in force. No Steam Audio integration is claimed.
