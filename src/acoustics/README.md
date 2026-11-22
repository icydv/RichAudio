# RichAudio acoustics

`engine/` implements finite direct, first- and second-order image-source propagation and the owned-source PCM renderer. `streaming/` and `host/` provide the existing bounded producer and Windows playback route. The observation and research modules retain acquisition, reconstruction, uncertainty and cache contracts.

`engine/observed-geometry.mjs` now connects bounded GTA wall/ground observation groups to that same offline renderer. It preserves finite polygon support, original provenance and uncertainty, and requires an explicit coordinate/scale contract and partial-world assumptions. Physical GTA scale, acoustic materials and complete visibility remain unverified. See [the integration and runnable demonstration](../../docs/OBSERVED_GEOMETRY_AUDIO.md).

The offline integration produces WAV files without opening an audio endpoint. `ObservedGeometryFeed` supplies immutable, expiring snapshots for a future simulation worker; continuous game observation and host handoff are not connected yet. Existing source ownership and benchmark contracts remain in force. No Steam Audio integration is claimed.
