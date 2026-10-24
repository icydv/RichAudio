# Distant NPC investigation

**Live results: none. Maximum actual sampled GTA distance, natural urban/rural availability, drivetrain reliability at range, handle recycling frequency and low-detail traffic representation are all UNTESTED.** The committed fixture is authored mock data; its distances are not game evidence.

## What the prototype can observe

RPH World.GetAllVehicles exposes a set of current vehicle entities. AvailableCount records that returned array length at discovery time, with age. It does not count every visible object or hypothetical traffic source. SourceLimit, CensusLimit, enumeration-prefix selection and the soft read budget can censor sampling; these are logged and must not be interpreted as GTA streaming limits.

Each sampled vehicle includes session tracking identity, full RPH handle token, observed pool index/counter where available, model, motion, running state, RPM ratio and gear with validity. State/event timestamps locate acquisition and retirement. Invalid entity/complete-census absence can suggest destruction or stream-out but cannot distinguish them. A tracking timeout alone only means RichAudio lacked observations.

The analyst reports maximum **sampled NPC** distance, per-band observation/distinct-ID counts, engine-state/RPM/gear availability and engine-on/zero-RPM occurrences. NPC bands require observed non-player-vehicle status and a present driver; parked/unoccupied vehicles and unknown player-role classifications are excluded. A separate maximum covers all observed non-player vehicles, including parked ones. Indexes seen with multiple pool counters provide evidence of changed framework generations. They do not prove persistent vehicle identity; counter wrap and same-model same-token reuse between observations remain limitations.

## Protocol

1. Establish the standalone supported RPH baseline and pass player tests A/B before interpreting NPC values. Pin runtime/game versions and all configuration. No OpenRPF, LSPDFR gameplay, population changes or entity persistence should be added to make traffic easier to retain.
2. Run a stationary urban observation for five minutes, then an equivalent rural/highway observation. Label both with RichAudioMark. Repeat at two times/traffic densities, retaining natural variation. Log available counts, examined counts, census age/truncation, source-limit/budget omission and distribution of actual selected distances.
3. Survey natural pass-bys in [0,25), [25,50), [50,100), [100,200), [200,400), [400,infinity) m bands. These are analysis bins, not assumed streaming radii. Retain empty bins and lower bounds. Measure spatial units/basis against visible landmarks before asserting metre accuracy.
4. Move normally toward/away from a traffic area to capture first/last accessibility. Inspect raw IDs/positions/model/counter and timing, not just the scalar maximum. Record a synchronized view when a visibly distant representation has no corresponding sampled entity; first rule out RichAudio selection/budget omissions and enumeration freshness.
5. Compare high/low engine-ratio runs with visible acceleration/gear changes, then prolonged constant/zero readings while vehicles move. Field presence is only availability, not meaningful simulation. Report availability/zero/unchanged ratios per distance band with sample counts. Do not assign physical RPM or engine load from these readings.
6. Observe disappearance/reappearance and repeated pool indexes with changed counters; inspect model changes and tracking retirement reasons. Distinguish confirmed framework invalidity, complete-census absence, plugin timeout and acquisition failure. Quantify observed gaps.
7. Repeat a bounded subset with SourceLimit increased within the supported maximum (128) only if prior timing has headroom. Changing logger selection/caps changes measurement coverage, not GTA population. If enumeration/reads exceed budget, report censored results rather than silently raising limits indefinitely.

## Sampling-bias limits

Current NPC selection is the framework enumeration prefix with player priority; there is no promise of distance ordering or representative citywide sampling. A distant source can be omitted even while AvailableCount rises. Complete census token membership is provided only when all inspected entries were traversed; a truncated census cannot prove absence. Repeated cached census fields are not new full enumerations each 20 Hz sample.

A precise maximum accessibility radius cannot be established from a single maximum sampled distance. It needs repeated routes, censored/omitted-data accounting, camera/player-position controls and adequate natural traffic. We do not keep entities alive, adjust game LOD/audio priorities, inspect undocumented far-traffic arrays or add synthetic sources. No supported API for lower-detail/synthetic unexposed traffic was established in this phase; this is an unresolved question, not proof none exists.

## Consequences for RichAudio

If entity telemetry disappears well before acoustic propagation would cease, a sound renderer cannot continue an accurate specific vehicle without additional supported state. Extrapolating indefinitely, pinning all traffic, or substituting statistical ambience would change the project scope and needs separate evaluation. A low-detail entity may have plausible position with stale or synthetic drivetrain state, so motion access does not establish engine-source accuracy.

Until actual data are obtained, the long-distance acoustic mission remains a feasibility gate. The logger and analyzer are instruments to establish that limit; neither their build nor synthetic fixture demonstrates meaningful in-game tracking distances.
