# Acoustic boundary — offline research prototype

ACOUSTICS-01 adds `research/local-geometry.mjs` and `research/first-reflections.mjs`: framework-independent finite surface snapshots, uncertainty/cache checks and first-order image-source paths on original synthetic geometry. See [the technical report](../../docs/ACOUSTICS_01_LOCAL_GEOMETRY.md). This is not an implemented game acoustic engine or audio renderer. The remaining integration design below stays proposed.

Consume copied telemetry, owned source profiles and locally generated geometry caches. Maintain bounded source/ray/time budgets and immutable simulation result generations. The first renderer tests use owned synthetic geometry and signals, not game extraction as distributable fixtures.

Geometry conversion, scene matching, material spectra, propagation and source synthesis are distinct responsibilities. No current file implements an acoustic engine or certifies Steam Audio integration. See ARCHITECTURE.md and ACOUSTIC_DESIGN.md.
