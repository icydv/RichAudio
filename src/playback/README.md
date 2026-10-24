# Playback boundary — proposed, unimplemented

Own only RichAudio output, with explicit native overlap/ownership policy. A render worker prepares PCM in a fixed-capacity ring. Output callbacks recycle tokens and signal work; they never perform disk IO, simulation, allocation, blocking synchronization or game calls.

Startup, endpoint loss, pause, disconnect and shutdown must be testable independently. Keep native audio active until selective ownership and restoration pass P2-02. No playback or hook is implemented in Phase 1.
