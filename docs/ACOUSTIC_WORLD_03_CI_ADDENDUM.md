# My ACOUSTIC-WORLD-03 hosted regression correction

My first hosted run, [41537963168, attempt 1](https://github.com/icydv/RichAudio/actions/runs/41537963168), failed at implementation commit `b531e0694f2849827a7490db616f2cc69d58da9b`. The failure is preserved. It is not a failed audio experiment and no endpoint candidate was executed.

The new 48 portable world/vehicle tests, 1,039 authored C# checks and 121 actual-format importer/cache/reflection checks passed in that run. The public parser built successfully with its actual hosted binary hash recorded separately from the local compiler's hash. The run then failed in the previously unchanged `TestHostShutdown` **disconnect** case, before reaching the expiry suite. Artifact upload ran but found no expiry files; it did not create an artifact.

## Exact observed failure

The failed predicate required the primary listener failure to contain `connection/clean-eof`. The host instead reported **`connection/connection-failed`, IOException, zero committed connections and zero received frames**. The preceding assertions for a retained listener failure and completed cleanup had passed. Codex retained the complete decoded job log privately, SHA-256 `be52c454a06091dba5378cc66d762be31f3de48a6038b04c25e2ec92b756bc6d`.

The original fixture connected its pipe client and immediately disposed it. Client `Connect` returning is not proof that the server has begun/completed its asynchronous accept or qualified its peer. No original throw-site stack was retained, so I do not assign an exact original instruction from the console's exception category alone.

## Controlled reproduction and correction

An independent device-free probe controlled this lifecycle window in a private copy of the actual production StatePipe source:

| Controlled schedule | Connections / accepted / rejected | Actual terminal result |
| --- | ---: | --- |
| Client closes before server begins its wait | 0 / 0 / 1 | `connection/connection-failed`, IOException, failed |
| Client stays until server accept and peer-PID qualification complete, then closes | 1 / 0 / 0 | `connection/clean-eof`, unexpected EOF |

Both schedules use one client attempt, receive zero frames, allow no rearm and join sender/server lifetimes. The original diagnostic probe additionally observed Win32 error 232 in the pre-wait schedule. This reproduces a concrete fixture scheduling assumption with the same available hosted operands; it does not recover an unavailable original stack or classify the failure as flaky.

Codex corrected **only the shutdown test fixture**: after client Connect, the disconnect sender now waits within its existing bounded fixture lifetime for the actual host server to report one connection and the expected peer identity. The connection counter alone is insufficient because it advances before the peer query. The test then closes without writing a protocol frame. It retains the original exact clean-EOF and failure assertions, adds explicit zero accepted/rejected and one-connection checks, and retains causal connection/qualification/close timestamps.

Bounded `HOST_SHUTDOWN_CASE` operands are now printed before assertions: host result, sender exception type/HRESULT and join status, QPC brackets, accepted/rejected/connection counts, mute/stop/join flags and terminal category. Missing terminal/transport records remain null in this projection rather than replacing the original evidence with a null-reference failure. Paths, pipe/session identities, raw PIDs, payloads, messages and stacks are excluded.

The retained deterministic regression inserts exactly three checked diagnostic/control sites into a **fresh private source copy**, never the production file. It forces both causal schedules, checks the original actual transport results, proves no accepted/received frame or retry, and checks the unchanged inclusive 250 ms freshness and -2 ms future bounds. `Build-AcousticsHost.ps1 -Tests` now runs this regression before its existing host tests. The production host build, listener protocol, transport, deadlines, audio sources, calibration, clocks and endpoint implementation are unchanged.

## Validation and preservation

The root and independent corrected builds each pass **1,702 existing host assertions and all eight shutdown modes**. Separate independent runs of the new causal regression pass both schedules and four freshness boundary controls; reversing the three instrumentation sites reproduces the exact original StatePipe text. All owned lifetimes join. The corrected actual disconnect case reports connections 1, accepted/rejected 0 and exact clean EOF.

Independent causal-regression receipt SHA-256: `e532f587b022797f90791abe08fdb4c56551a745758eb45aef234b37092ee1e0`. The earlier investigation receipt is `d80b81dba7c4a6e9b3098045d247e7638df97179e0558bfd2a2f59a802a9d380`. Original failed output and all development evidence remain private and unchanged.

The [original world result](ACOUSTIC_WORLD_03_RESULT.md) and [its measurements](../evidence/acoustic-world-03-result.json) remain bound to the reviewed implementation at `b531e06`. Codex reverified all 33 original implementation/report bindings unchanged during this fixture correction. The genuine Bati PCM comparison and completed LATENCY-03.1 endpoint measurements are not modified or repeated.

The [CI addendum evidence](../evidence/acoustic-world-03-ci-addendum.json) retains exact source/report bindings. The current hosted result is reported in [draft PR #82](https://github.com/icydv/RichAudio/pull/82); a new full run is required after this correction rather than rerunning or replacing the original failed run. No game, installed asset, endpoint, recording, deployment, native sound suppression or merge is involved.
