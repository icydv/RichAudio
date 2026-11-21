# PRIVATE03I — STOP acknowledgment and cleanup

My PRIVATE03H approval is consumed. I reported seeing the second STOP-only notice and clicking “I am exiting normally”. That is my reported interaction; the historical software did not record handler entry, transmission or receipt, so its timing and delivery cannot be reconstructed. The operator must not turn the missing receipt into a claim that I ignored the notice or clicked late.

The operator performed this correction with disposable processes and automated UI actions only. GTA, RPH and OBS remain outside this qualification. No human-attended rehearsal, installation or live audio experiment is authorized by this preparation.

## Historical chronology

The normal notice recorded acknowledgment after1.3073578seconds, normal target exit and verified fixture restoration. All three process-identity queries passed. The STOP-only failure therefore has no established connection to the earlier empty-response defect.

The STOP-only acknowledgment origin was QPC437277776787 at10MHz. Notification was recorded at437278057067,2026-11-13T22:01:08.7446724Z. The five-second due time was437327776787; violation was recorded at437327911063. The exit due time was437877776787; its violation was recorded at437878078407. Target absence was recorded at438026864152, about74.909seconds after the origin. No direct acknowledgment exists in that journal.

The old `Form.Shown` signal necessarily preceded notification publication, at most28milliseconds after the origin. Exact window interaction readiness and the click event time are unavailable. Both notice modes shared the same button handler and in-process command queue. The UI acknowledgment did not travel through watcher stdin or a separate IPC pipe. There is no evidence identifying the historical failed transition. A later automated legacy click reached the old receiver late; it did not reproduce or explain my reported interaction.

## Established defect and correction

The old rehearsal requested target exit only after observing acknowledgment. Without that record, the target remained alive until the75-second cleanup path. That is a real, independently established cause of the60-second exit overrun. The new coordinator requests the disposable target's normal exit when STOP is published, independently of acknowledgment. It never fabricates an acknowledgment or upgrades failed admission after cleanup.

The new notice records its own session, unique notice/message identities, PID and native process creation identity. It traces UI creation/readiness, STOP display, button mouse events and handler entry, envelope creation, queue delivery, receipt, exact identity validation, durable completion, monitor acceptance, deadline expiry and retirement. UTC/QPC pairs and frequency are captured in each structured record. It observes only its own buttons, not general keyboard or mouse input.

The UI and monitor remain in one process. Their bounded typed mailbox is separate from the existing stdin control reader. A click shows pending status until the monitor observes durable acceptance. Invalid identity, closed delivery, duplicate, malformed completion and late delivery have explicit rejection reasons. The evidence worker uses bounded queues and durable writes; the main shutdown loop does not wait indefinitely for evidence. A prepared acceptance record explicitly says accepted:false. Acceptance requires its durable completion and monitor observation before the original deadline.

The five-second origin remains STOP/failure, not window-ready time. The target can exit while the notice preserves the remaining original acknowledgment window. No clock resets or extensions are added. Before STOP, the acknowledgment button is disabled. Closing the window requests STOP and cannot count as acknowledgment. A late click remains late. Unexpected process exit remains failed admission. No force-termination path is introduced.

## Qualification boundaries

`tests/Test-NoticeDelivery03I.py` covers real disposable processes with clearly labelled synthetic envelopes for receiver faults. `tests/Start-PrivateNoticeFixture03I.ps1` and `tests/PrivateNoticeFixture03I.py` coordinate actual visible-button tests; UI actions are performed separately with desktop automation. Test-only controls are compiled under SUPERVISION_FIXTURES, require offline-fixture mode and are absent from the candidate binary.

Staged STOP-only tests initialize the neutral window, then induce one new failure. The failure starts its one unchanged five-second clock. These test the actual handler/mailbox/monitor path, but do not measure cold notice startup or human response. The candidate build is tested through the actual normal UI and cold failure paths. A cold automation attempt with no handler event remains failed evidence. Automated success cannot qualify my direct handoff or fullscreen visibility.

The separately retained qualification receipt contains exact source/binary hashes, every case and native timing. The retained identity/policy/protocol, supervisor-loss, one-use activation and restoration tests run against the new code. The original private profile,31-symbol marker, DAT151/DAT54/AWC, archives, probe, marker detector, evidence criteria and production engine remain unchanged.

## Review boundary

The final commit precedes the new immutable PRIVATE03I manifest. Its exact parent is4eebff94eeab156c0e3720ac74b0cc1a4158b304; arbitrary later commits, dirty trees and historical approvals remain rejected. Historical seals are never repinned. A new supervisor identity requires fresh explicit approval, exact current preflight and both direct-user notice gates before installation. No source change implies permission to execute the experiment.

The future experiment still permits only one manually confirmed assignment against disposable Bati A, untouched B, negative baselines/control and normal cleanup. A later isolated marker would establish one functional authored contribution. Complete profile identity, suppression, recoverable native ownership and production compatibility remain unproved.
