# STREET-01 first normal discard underflow

## Retained GTA evidence

At 02:13:35 GMT on 8 November 2026, the clocked discard sink supplied no PCM for one 960-frame callback. The first missing frame, 2,826,240, equals exactly 5,520 admitted RA07 blocks at 512 frames per block. The last admitted sequence was 5519. Host QPC records show 123.93 ms between the last admission and host fault observation, against an 85.33 ms full startup reserve. The last accepted snapshot arrived 59.12 ms before that host fault. The eight startup credits were still in effect and none had retired.

The producer recorded render sequences 0–5527. The maximum was 8.9742 ms at sequence 1184, with zero individual hard misses. The twelve final render records ranged from 0.0968 to 1.0691 ms. The last eight render records lack verified ring admissions and can include work after the sink fault. A render record precedes stdout delivery. It establishes neither an attempted write nor a completed write. The run retained no fault-window stdout or host pipe timestamps, pending credit batches, intermediate ring depths, callback due times or thread cadence. It does not distinguish late computation outside the measured render, Node scheduling, credit starvation, pipe blocking, ring admission delay or a sink cadence anomaly.

On the separate Node clock, the final candidate took 825.57 ms from request to admission. Worker preparation took 652.57 ms and producer-side validation took 11.63 ms, outside the complete-render timer. The worker publication and candidate transaction occurred shortly before the producer received its stop command. The host requested producer stop, Node returned a successful worker join and exited with code 0, and the supervisor observed host exit code 1. The records establish the fail-stop mechanism and an overlap with scene work. They do not establish that scene work caused the delivery gap.

## Consumer decisions

All three candidates used the same current proof and exterior resource. They were generation 6 and each still had lease time at the consumer. No running or eligible source was present in these worksets.

| Request | Surfaces | Remaining at application | Decision |
| --- | ---: | ---: | --- |
| 998 | 4 | 937.96 ms | Warm and scope-compatible. The first warm sample could not yet support a same-scope renewal forecast. |
| 1007 | 10 | 937.13 ms | The new workset was cold or refresh-only. It could not contribute a warm sample to the successor forecast. |
| 1016 | 3,651 | 166.48 ms | The listener moved between workset classes while the candidate was in flight. Recomputing the request class from the retained same-clock camera samples gives an anchor of (1506, −2626, 46) at request and (1506, −2634, 46) at application, with distinct class hashes and the same generation. With no active scene, the current-scope guard withheld it. |

The closest camera remained 92.6 native units from the exact anchor. The conservative admission rule and the 10,663-resource denominator remain in force.

## Delivery tracing

The normal discard host owns fixed, preallocated histories for the sink, PCM reader, control writer, producer stderr, worker publications and host settings/status work. The sink records its callback due/start/end, requested/supplied/missing frames and before/after ring depths. The first missing frame freezes the trace before the existing fatal underflow check. The host writes a separate first-fault receipt after ownership cleanup, including when Node exits before sending a terminal record.

Host events carry QPC. Producer events carry Node monotonic time and their host diagnostic receive QPC. Join block events by RA07 sequence and credit events by batch ID. The trace records actual stdout attempt and completion separately. The Node diagnostic lane reports skipped or malformed rows, so missing trace data cannot establish an event failed to happen. Block-delivery intervals at the sink are measured between callbacks that first consume a new block. Several blocks can begin in the same callback.

The 512-frame block, 48-kHz clock, 960-frame discard callback, eight-to-six credit transition and fatal underflow policy retain their existing contracts. The callback uses fixed-size writes and performs no trace allocation, locking, serialization or disk I/O. No scheduling or buffering correction is justified by the retained GTA run.

## Operator setup for a separately approved run

I prepare a legitimate Story Mode starting point near the lower El Burro Heights site with a standard Bati 801 already available. If my ordinary save cannot start at the anchor, I confirm the bike and a short local approach before approving the run. Use the existing pause-map image to find the bend on El Burro Boulevard at (1483.00, −2586.00, 48.16). This is the blue approach pin. Follow the short access track and lower slope toward the yellow pin at (1475.960, −2717.439, 18.504), inland from the shoreline. Keep the camera on the lower ground and use live distance guidance for the final ten native units.

I stay in the driver's seat on model `bati` (`0xF9300CC5`) with the engine running. I close the map, hold the camera steady, and wait for the observer to verify the same attached vehicle lifetime, advancing synthesis and admission of the pinned exterior resource across three fresh samples. Travel and source acquisition are separate from the measured interval.
