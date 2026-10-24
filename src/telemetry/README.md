# Telemetry boundary — proposed, unimplemented

Only a supported game/script context may read entity state. Emit timestamped, versioned POD snapshots with source generations and per-field validity through a bounded queue. Do not call game natives from workers or audio callbacks. No memory writes, population changes or audio setters belong in P2-01.

Separate native-only motion/state capability from optional build-specific RPM/gear/throttle adapters. Missing getters are null with a reason, not zero. Source generation changes on handle reuse; listener epoch changes on a camera cut. See the telemetry matrix and P2-01 for the implementation/validation contract.
