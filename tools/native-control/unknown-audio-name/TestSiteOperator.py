"""Drive the production operator and compiled runner together with authored game and recorder I/O."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import xml.etree.ElementTree as ET
import time
from types import SimpleNamespace
from unittest.mock import Mock


class BaselineReview(BaseException):
    pass


def exercise(operator, fixture, root, previous):
    spec = importlib.util.spec_from_file_location("site_operator", operator)
    op = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(op)
    io = root / "operator"
    if not root.is_relative_to(Path(__file__).resolve().parents[3] / ".local"):
        raise ValueError("Use a fresh private fixture directory in the worktree")
    root.mkdir(parents=True, exist_ok=False)
    io.mkdir()
    (root / "capture").mkdir()
    source = root / "capture" / "authored.mkv"
    source.write_bytes(b"AUTHORED device-free fixture, no media or human observation")
    io.joinpath("activation.lock").write_text("authored11 1 2")
    plan_path = root / "operator-plan.json"
    candidate = operator.parent.parent.name
    plan = dict(Root=str(root), SourceCommit="fixture", Game=dict(path="AUTHORED-GTA", sha256="fixture"),
                Obs=dict(path="AUTHORED-OBS", sha256="fixture"), ObsProfile="fixture",
                Python=dict(path="AUTHORED-PYTHON"), ReadinessHelper=dict(path="fixture"),
                Finalizer=dict(path="fixture"), Dependencies=dict(path="fixture", sha256="fixture"),
                OperatorSha256=op.sha(operator), Tools=[dict(path=str(operator), sha256=op.sha(operator))])
    op.atomic(plan_path, plan)
    op.atomic(root / "scope.json", dict(candidateName=candidate, sourceCommit="fixture",
              focusConfiguration=dict(preparedSha256="fixture"), operator=dict(plan=dict(sha256=op.sha(plan_path)))))
    scope = op.sha(root / "scope.json")
    op.atomic(root / "approval.json", dict(scopeSha256=scope, oneRunApproved=True, userPresentConfirmed=True,
              purpose="inert local fixture only"))
    op.atomic(root / "transaction.json", dict(status="installed-verified", scopeSha256=scope))
    op.atomic(root / "configured-focus.json", dict(value=0, preparedSha256="fixture"))

    child = subprocess.Popen([shutil.which("pwsh"), "-NoProfile", "-File", str(fixture / "run-fixtures.ps1"),
                              str(fixture), "wire"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                             encoding="utf-8")
    packet = {}
    consumed = set()
    requests = []
    def receive():
        line = child.stdout.readline()
        assert line, "compiled runner exited before handoff"
        packet.update(json.loads(line))
        op.atomic(io / "state.json", packet["state"])
        with (io / "journal.log").open("a", encoding="utf-8") as f:
            for row in packet["journal"]:
                f.write(row + "\n")

    def advance(_):
        state = packet["state"]
        obs = state["Observation"]
        if state["AwaitingReview"] and (io / "evidence" / (obs + ".json")).exists():
            assert packet["profiles"] == [] and packet["created"] == 2
            if state["Phase"] == "baseline":
                raise BaselineReview
            if state["Phase"] == "B-pre" and not (root / "reply.txt").exists():
                reply = root / "reply.txt"
                reply.write_text("AUTHORED B control reply for offline handoff")
                op.review(plan_path, obs, "ControlNormal", reply, True)
        commands = []
        for path in sorted((io / "commands").glob("cmd-*.json")):
            if path not in consumed:
                commands.append(op.read(path))
                consumed.add(path)
        step = ET.Element("step")
        for tag, fields in [("capture", op.read(io / "capture.json"))] + [("command", c) for c in commands]:
            ET.SubElement(step, tag, {k: str(v) for k, v in fields.items() if v is not None})
        child.stdin.write(ET.tostring(step, encoding="unicode") + "\n")
        child.stdin.flush()
        receive()
        assert state["Ticks"] - first_tick < 130000, "fixture exceeded its bound"

    class Identity:
        def __init__(self, pid, *_):
            self.pid, self.creation, self.open = pid, 2, True
        def alive(self): return self.open
        def foreground(self): return True
        def close(self): pass
        def normal_close(self):
            self.open = False
            requests.append(self.pid)

    class Recorder:
        active = False
        def call(self, method):
            if method == "StartRecord": self.active = True
            if method == "StopRecord": self.active = False
            return dict(outputActive=self.active, outputPaused=False, failed=False, graphValid=True)
        def snapshot(self):
            return dict(Profile="fixture", Collection="fixture", GraphValid=True, Failed=False)
        def close(self): pass

    def worker(args, **kwargs):
        if args[0] == "AUTHORED-OBS":
            return SimpleNamespace(pid=3)
        assert args[0] == "AUTHORED-PYTHON"
        job = op.read(Path(args[-1]))
        ready = job["Phase"] == "recorder-readiness"
        receipt = Path(job["Output"]) / "receipt.json"
        fields = {k: job[k] for k in ("Session","Recording","Observation","Phase","Generation","Profile")}
        op.atomic(receipt, dict(**fields, Passed=True, ReviewImage="AUTHORED", Snapshot=dict(snapshotSha256="fixture"),
                               Windows=[dict(StartSeconds=1, DurationSeconds=10)]))
        deadline = job.get("CoverageDeadlineQpc", job.get("AdmissionDeadlineQpc"))
        status = dict(**fields, State="Admitted", Receipt=str(receipt), ReceiptSha256=op.sha(receipt),
                      OriginQpc=first_tick, ValidationFinishedQpc=op.qpc(), DeadlineQpc=deadline,
                      Durable=True, SnapshotSha256="fixture")
        op.atomic(root / ("readiness-status.json" if ready else "coverage-"+job["Observation"]+"-status.json"), status)
        return SimpleNamespace(poll=lambda: 0, returncode=0)

    try:
        receive()
        first_tick = packet["state"]["Ticks"]
        op.qpc = lambda: packet["state"]["Ticks"]
        op.frequency = lambda: 1000
        op.ProcessIdentity = Identity
        op.LocalRecorder = lambda *_: Recorder()
        op.recording_origin = lambda *_: (first_tick, {})
        op.startup_operating_check = lambda *_: op.atomic(root / "startup-operating-check.json", {"authored":True})
        op.subprocess = SimpleNamespace(Popen=worker, DEVNULL=None, CREATE_NO_WINDOW=0, run=lambda *_args, **_kw: SimpleNamespace(returncode=0))
        op.time = SimpleNamespace(sleep=advance, monotonic=time.monotonic)
        try:
            op.watch(plan_path, root / "approval.json", scope)
        except BaselineReview:
            assert not previous
        events = [json.loads(l) for l in (root / "operator-events.jsonl").read_text().splitlines()]
        listening = [e["phase"] for e in events if e["event"]=="observation-ready-for-listening"]
        journal = (io / "journal.log").read_text(encoding="utf-8")
        trace = (["saved-return-space-occupied", "automatic-stop", "ENDED;"] if previous else
                 ["survey-rejected layout=0 check=return-point", "survey-rejected layout=1 check=A footprint",
                  "paved-pair-selected layout=2"])
        cursor = 0
        for entry in trace:
            index = journal.index(entry, cursor)
            cursor = index + len(entry)
        assert sum(e["event"]=="normal-game-exit-request" for e in events) == int(previous)
        assert listening == ([] if previous else ["B-pre","baseline"])
        assert requests.count(1) == int(previous) and packet["profiles"] == []
        assert len(set(packet["reservations"])) == len(packet["reservations"])
        assert packet["created"] == (0 if previous else 2)
        assert packet["models"] == packet["registered"] == (0 if previous else 1)
        result = dict(passed=True, gameQuitRequests=requests.count(1), listening=listening,
                      carsCreated=packet["created"], assignments=packet["profiles"], setup=packet["reservations"],
                      stage=packet["state"]["Stage"], operator=op.sha(operator),
                      compiledFixture=op.sha(fixture / "SetupFixtures11.exe"), fixtureOnly=True,
                      artifacts=[dict(path=str(p), sha256=op.sha(p)) for p in (operator, fixture / "SetupFixtures11.exe",
                                 Path(__file__).resolve(), root / "operator-events.jsonl", io / "journal.log")])
        op.atomic(root / "result.json", result, True)
        print(json.dumps(result))
    finally:
        child.stdin.close()
        child.wait(timeout=10)
        assert child.returncode == 0


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("operator", type=Path)
    p.add_argument("fixture", type=Path)
    p.add_argument("root", type=Path)
    p.add_argument("--previous", action="store_true")
    args = p.parse_args()
    exercise(args.operator.resolve(), args.fixture.resolve(), args.root.resolve(), args.previous)
