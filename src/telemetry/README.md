# Telemetry boundary — Phase 2 implemented, runtime unverified

`Core/` implements the runtime-independent model, tracker, scheduler, bounded queue and JSONL writer; `Rph/` implements documented RPH getter acquisition; `Analysis/` inspects capture sessions offline. The core contains no RPH types. These components compile and pass authored mock tests, but have not obtained live GTA telemetry. See the repository docs/TELEMETRY_IMPLEMENTATION.md and docs/PHASE2_VALIDATION.md.

Only the supported game fiber reads entities. Background code receives copied managed DTOs, never engine objects/pointers. Missing fields are null with a reason; ratio is not crankshaft RPM and load remains unavailable. No memory writes, population changes, audio setters, acoustic rendering or source generation are implemented. Session IDs/lifecycle and cut/gap rejection are described in the implementation document.
