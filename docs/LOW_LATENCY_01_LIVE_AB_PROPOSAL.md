# LOW-LATENCY-01: proposed future A/B experiment

**Proposal only. No deployment, launch, endpoint access, recording or live attempt is authorised by this document.** The previous PLAYABLE-15 approvals are consumed. Private offline fixture packages are not deployment candidates, and their hashes cannot substitute for a newly reviewed deployment package or supervisor.

I want one comparison experiment comprising **two separately sealed, independently restored attempts**. The current RPH contract admits one Start per instance; I will not reuse Start or switch an immutable package pointer inside that instance. A future approval must explicitly cover two temporary deployments, two launches, two AudioOn commands and two Starts, with no retry or extra attempt.

Both arms must use `continuityPolicy='camera-source-01'`, the same reviewed source commit, Bati source banks, DSP, gains, source phase/Doppler, quality, endpoint selection and recording policy. Arm A selects `latencyProfile='baseline'` (100 ms/eight credits). Arm B selects `low-latency-01` (75 ms/eight startup, then six qualified credits). A versus combined LL/AW would confound the comparison; AW continuity must be identical in both.

Before seeking approval, Codex must prepare and independently review two exact deployment manifests and host/RPH/native/source binding sets, a fresh proposal hash and bounded supervision/rollback helpers. The private offline evidence identifies the source and fixture hosts that motivated the comparison, but these new deployment and operational pins **do not yet exist**. No operational directory, authorization receipt or endpoint probe should be created as a side effect of this proposal.

The implemented source motivating this proposal is `be5ed5c484dcd5ad54c7dba9f14415952d0735df`. Its final **device-free fixture** references are:

| Offline reference only | Arm A | Arm B |
| --- | --- | --- |
| Manifest SHA-256 | `ac6f7eee8b8548274c3272958e0e836da98c904e7ca797de72f71402d1feb883` | `1c23540796487670c8c031c5c0ebe514f348f4bc21de88a9a9af6d478d00e72d` |
| Host SHA-256 | `6a2accf0361544f0b0a85f8c47be5414986638580c2a44e1deead08d79e336e3` | `0d701daf9d9a585167257d024837e8b8982390978bca97a48b4f731a8a67355c` |
| Preparation receipt | `8fdd3ccb35ce400cd265ae5bef789f67a116d817bd1ead6878ef3b893dce2dde` | `5cf55717c024e894a9ccfe4474b3fb3501f386b39a9fefd4cf8a132720ebb791` |

Both receipts recheck the same 36 host source and 71 copied-code pins, identical saved settings and all 141 payload bindings. Separate compilations can have different executable hashes despite equal input sources. These are not the future deployment candidates: packaging, supervision, protected files/settings, process absences and endpoint/recording permissions all need a new exact review before approval is requested.

For each arm, the proposed bound is at most 45 seconds of ACTIVE output, independently supervised on a monotonic clock, with 30–35 seconds of the same authored instructions: stationary idle/rev, a short smooth moving segment, two deliberate camera changes and a final dismount. I would confirm readiness on an engine-running player Bati before AudioOn/Start. The observer must surface any recording failure, invalid source identity, expiry, underflow, worker/host failure or deadline immediately. Early source retirement remains terminal; there is no automatic rearm or retry. The operator owns Stop, followed by joined host/Node/output quiescence checks. A stop request is not completed silence.

Each attempt must exit GTA normally, verify all owned lifetimes absent, preserve its private raw journal, host/Node diagnostics and approved final-PCM/selected-endpoint-loopback files, then restore and hash-check every protected file, saved setting and owned-path absence **before** the next arm is admitted. The next arm needs its own exact preflight against that restored baseline. A fault or unexpected drift ends the experiment pending review; unused approval is not permission to substitute a candidate.

The analysis must compare full percentile distributions with counts and acquisition/mapping intervals, not subtract two durations or add the ring queue twice. Native operating acquisition, RPH vehicle pose, producer selection, first ring overlap, submission and endpoint capture have separate clocks/scopes. Record the first producer-to-host mapping and sink-start phase, cold startup, actual two-credit transition, all-block render misses/maxima, underflow, missing/expired data, camera gaps, source lifecycle and memory. Keep the endpoint mix distinct from isolated RichAudio PCM. If unique waveform windows still cannot establish a stable offset, total audible/speaker latency remains unavailable.

My listening judgement would cover response while revving/driving, camera continuity and how source scope ends. The source-selection and ring improvements in the [offline report](LOW_LATENCY_01.md) are hypotheses for this comparison; they do not establish a perceptual improvement or natural engine shutdown. The severe CPU test already demonstrated that both profiles can starve under sustained contention. The <100 ms/<30 ms targets remain stretch goals, not acceptance facts.
