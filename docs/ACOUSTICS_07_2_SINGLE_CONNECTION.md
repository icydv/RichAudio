# RichAudio ACOUSTICS-07.2 — Single-Connection Transport Correction

## Outcome and preserved evidence

I've corrected the transport policy on PR #49's verified head `229a31bf3f46624dfc8f706afc40f2e366b37184`. Supervised host/bridge operation now defaults to one connection, with terminal failures, acknowledged deliberate shutdown and bounded stage diagnostics. No acoustic, camera-getter, WASAPI-format, beacon, listener-buffer or game-installation implementation was changed. The combined ACOUSTICS-05 + BENCHMARK-01 milestone stays **60%**.

My first live result remains exactly as recorded: 1,841 accepted messages, 11,243 renderer updates, one harmonic beacon at 0.08, no measured underruns and qualified positive listening feedback. PR #49's report and private receipts have not been rewritten.

## What the original record establishes

The launcher receipt records one launch. RPH reported bridge READY/sending OFF at 10:17:29.081 UTC and a running status at 10:18:25.268 with observations=276, sent=265 and **attempts=2**. Consequently, the second attempt had already occurred during startup/early streaming, before the host's later duration limit and final bridge Stop. It was not solely a shutdown reconnect.

The private host receipt contains two accepted connections and one `InvalidDataException`. Its first retained forwarded observation has sequence 13. The retained device-QPC/end-clock estimate places that observation approximately 28 seconds after host startup, including manual setup time. There is no per-connection event trace, rejected payload, first-connect timestamp or throwing-operation record. I cannot establish whether any frame had previously succeeded on the first connection or identify its exact failure stage. The original exception message was discarded.

Possible boundaries include truncated framing, invalid length, schema/type/vector rules, session/sequence/generation rules and freshness. A timestamp can age while initial encoding/decoding or scheduling occurs; cold-start work exceeding the 250 ms freshness limit is a plausible hypothesis, **not an established cause**. Synthetic stale-first-frame rejection now reproduces that boundary with explicit `freshness/invalid-age` attribution. I have not weakened the validator or claimed to have repaired an unknown original payload defect.

The original publisher explicitly allowed eight connection attempts; its catch loop retried after backoff. The receiver also recreated a pipe after errors. Those permissions, rather than a second bridge Start or GTA launch, explain how recovery was allowed. The old host stopped at its 120-second cap before manual bridge Stop, so the earlier attempt did not independently measure a planned bridge-disconnect-to-silence interval.

## Strict lifecycle

- `StatePublisher` defaults to one attempt and strict mode. The real RPH bridge explicitly selects `(1,true)`. A failed initial Connect consumes its sole attempt.
- `StatePipeServer` defaults to strict mode; the production host selects it explicitly. After its first accepted connection ends or fails it exits permanently. Waiting for that first connection is bounded at 30 seconds.
- Explicit non-strict development fixtures can select reconnect support. They retain the old protocol and bounded attempt budget; there is no automatic strict-to-development fallback.
- An atomic `SessionPermit` consumes the sole bridge activation immediately. Stop, absent host or failure cannot rearm it. A new plugin/process instance remains a new external operation requiring fresh human approval; this code does not authenticate human authorisation across separately launched processes.
- Framing, schema, freshness and sequence validation are retained. A rejection terminates the connection; no new session/generation handshake can silently restart it.
- The host's terminal callback immediately sets the owned output's mute flag and stop flag. Failures remain nonzero-error exits. Already queued endpoint audio still has finite drain time; this is not a claim of instantaneous physical silence.
- The publisher's game-facing `RequestStop` only signals its worker. Connect, writes and acknowledgements execute on its background worker with 200/250 ms deadlines. Missing source updates terminate a strict writer after a 750 ms idle bound. RPH's existing 120-second cap remains.

## Acknowledgements and shutdown meaning

Strict connections use duplex local pipes. Each valid accepted listener frame receives a one-byte acknowledgement (`1`). The publisher counts it as sent only after receipt. A deliberate worker Stop sends the exact bounded versioned control payload `{"transportStop":1}`; the receiver replies `3`, records deliberate stop and closes. The response carries no game command or payload. A rejection closes the pipe; the publisher's bounded acknowledgement read fails and terminates without retry. Local stages need not have identical names at both ends: the receiver may report schema rejection while the publisher reports failed peer acknowledgement.

EOF between complete frames is recorded as `clean-eof/unexpected-eof`, not an invalid frame. Without the Stop marker, EOF is not proof of deliberate sender intent; strict mode still ends the host. Partial header/payload EOF remains a real framing failure. Windows broken-pipe codes at a zero-byte boundary are treated as EOF, while a partial buffer remains truncated. A test race involving closing before the server had actually accepted the connection was corrected by explicitly synchronising acceptance before testing established-stream EOF.

If the host stops first, its pipe disposal causes the writer's next write/acknowledgement to fail; this is terminal and cannot reconnect. A cooperative sender Stop is instead acknowledged at both ends. No acknowledgement means no claim that the consumer accepted the stop.

## Bounded diagnostic attribution

The retained diagnostic includes connection ordinal, stage, allowlisted error code, sanitised exception type, whether that connection had an accepted frame, clean/failed outcome, terminal flag, retry intent and elapsed milliseconds. Stages cover connection, header, length, payload, decoding, schema, sequence, freshness and callback. The callback stage also includes the publisher's peer acknowledgement operation. It never exports exception messages, payloads, camera vectors, session identities, usernames or paths.

The host prints the terminal structured record immediately and includes it in final transport metrics with mute/stop flags and termination reason. RPH prints its terminal stage/code/outcome when observation ends and retains it for `RichAudioBeaconStatus`. Diagnostics run on control/transport threads, not the audio thread. Only the bounded latest terminal record is retained; this is not an unbounded event log.

## Offline verification and preservation

Focused checks pass **63 transport cases** (47 prior plus 16 strict cases) and **645 host assertions**. Actual Windows local pipes exercise valid connection/Stop acknowledgements, absent host, first-frame schema/freshness failures, length, truncated header/payload, UTF-8, duplicate sequence, EOF, timeouts, callback errors, consumer exit and both-end terminal failure. Explicit non-strict reconnect tests remain. A single-use activation permit and immediate host mute/stop/error state are tested without opening an audio endpoint. Sanitisation tests serialise actual failure records and reject private-message/payload fields.

The authentic pinned SDK bridge compiles separately. Its build receipt records the unchanged SDK SHA-256 `5D439745604A5FEDBF8FA401520D4F296C1B6800D77E2923BA3BF9772182C7E0` and current plugin fingerprint. No vendor binary is published. Registered offline validation and exact-head hosted CI are recorded in the PR after completion. The acoustic engine, streaming DSP, listener buffer and historical live-result files are byte-identical to the parent. No device playback, GTA launch, deployment or archive operation occurred.

Reproduce with `tools/Test-BeaconTransport.ps1`, `tools/Build-AcousticsHost.ps1 -Tests`, `tools/Build-BeaconBridge.ps1 -SdkPath <authentic-private-SDK>` and `tools/Test-Offline.ps1` from the checkout. Build outputs and private original live evidence remain ignored.

## Next separately authorised validation

One new supervised live attempt is justified to validate this stricter protocol, not to certify the original rejection's cause. Prepare the reviewed exact-build deployment, load the bridge to READY with sending OFF, then open the muted host. Start the bridge once while the host is listening; its first-connection deadline is 30 seconds. Observe acknowledgement/accepted counts before starting sound. Perform the short orientation sequence, then issue bridge Stop **well before 90 host seconds**, leaving at least 30 seconds before the unchanged host cap. Confirm acknowledged deliberate stop, host mute/exit and retained bridge terminal status within a bounded check. Unload, quit normally and independently restore. Any unexpected failure ends the attempt; no reconnect, reload or second Start is allowed. This milestone does not request or execute that approval.
