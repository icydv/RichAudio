"""Seal an offline package from the exact retained runtime and capture configuration."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess

from CheckCatalogue import check
from Materialize import HERE, REPO, materialize

BASE = REPO / ".local/native-suppression-01"
OLD = BASE / "candidate-11/scope.json"
OLD_SHA = "1baa875195bb3eb689434d42b18178234d4c59cd348c6f642f1b5d5b5dd1bfc7"


def read(path):
    return json.loads(Path(path).read_bytes())


def pin(path):
    path = Path(path).resolve()
    with path.open("rb") as stream:
        return dict(path=str(path), bytes=path.stat().st_size,
                    sha256=hashlib.file_digest(stream, "sha256").hexdigest())


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def put(path, value):
    with path.open("x", encoding="utf-8", newline="\n") as out:
        json.dump(value, out, indent=2)
    return pin(path)


def relabel(value):
    for a, b in [("execution-11", "unknown-name-settle-run"), ("Live11", "UnknownName"),
                 ("NativeSuppression11", "UnknownAudioName"), ("Recorder11.lua", "Recorder.lua")]:
        value = value.replace(a, b)
    return value


def seal(build_path, checks_dir):
    tools = materialize()
    require(pin(OLD)["sha256"] == OLD_SHA, "Different reference scope")
    old = read(OLD)
    head = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=REPO, text=True).strip()
    require(not subprocess.check_output(["git", "status", "--porcelain"], cwd=REPO), "Dirty checkout")
    build = read(build_path)
    require(build["sourceCommit"] == head and build["finalCandidate"] and not build["defaultEnabled"],
            "Clean committed disabled build required")
    require(pin(build["binary"]["path"]) == build["binary"], "Different output DLL")
    for source in build["sources"]:
        require(pin(REPO / source["path"])["sha256"] == source["sha256"], "Build input changed")
    receipts = []
    for name in ["setup", "inspection", "installation"]:
        path = checks_dir / name / "result.json"
        result = read(path)
        require(result["passed"], "Required fixture or inspection failed")
        if name == "inspection":
            require(result["candidateSha256"] == build["binary"]["sha256"], "Inspected DLL differs")
        if name == "installation":
            require(result["sourceCommit"] == head, "Transaction fixture source differs")
        for item in result.get("artifacts", []) + result.get("productionSources", []):
            require(pin(item["path"])["sha256"] == item["sha256"], "Fixture input changed")
        receipts.append(pin(path))

    keys = ("schema game gameVersion parkAndRestore unchangedRootBinaryInventory logBackupsRequired "
            "originalBaseArchive originalGranularArchive originalResidentArchive registrationProcedure "
            "repository branch sourceClean authorized executed gameLaunches offlineStoryModeOnly gameSettingsBackups "
            "focusConfiguration focusPolicy coverageAdmission proceduralTiming lifetime registrationOperation "
            "feedbackFocus measurement runtimeFailurePolicy operations setupTransitions capture operator").split()
    scope = {key: old[key] for key in keys}
    dest = BASE / "unknown-name-settle"
    run = Path(relabel(old["installation"]["executionDirectory"]))
    require(not run.exists() and not dest.exists(), "Fresh private destination required")
    catalogue = check()
    dest.mkdir()
    install = dest / "installation"
    install.mkdir()
    scope.update(candidateName="unknown-name-settle", sourceCommit=head, implementationCommit=head,
                 sequence=["stock baseline", "BATI", catalogue["name"], "BATI"],
                 catalogue=catalogue, assignmentTarget="A only", activeLimitSeconds=600,
                 comparison="Stationary matched idle, separate physical horn, same-A release and unassigned B controls")
    scope["operations"]["horn"] = "At most four A-only 600ms requests, one per observation. Log active readback and physical sound separately."
    scope["setupTransitions"]["qualification"] = receipts[0]
    scope["setupTransitions"]["initialStationaryAcquisition"] = dict(requiredSeconds=10, timeoutSeconds=30, speedMpsStrictlyBelow=0.15, maximumWaitableSpeedMps=0.30, timeoutRenewed=False)
    scope["procedureAddendum"] = scope["procedure"] = pin(HERE / "PROCEDURE.md")
    scope["builds"] = [pin(build_path), *receipts, pin(OLD), pin(tools / "Preflight.ps1"),
                       pin(tools / "Verify-Restoration.ps1")]
    scope["historicalQualification"] = old["builds"]
    scope["gameInstall"] = old["gameInstall"][:7]
    enabled = dest / "proposed-enabled.ini"
    enabled.write_bytes(b"Enabled=true\r\n")
    for entry in scope["gameInstall"]:
        entry["destination"] = relabel(entry["destination"])
    scope["gameInstall"][5]["source"] = build["binary"]
    scope["gameInstall"][6]["source"] = pin(enabled)
    for entry in scope["capture"]["install"]:
        original = entry["source"]
        require(pin(original["path"]) == original, "Retained OBS settings differ")
        path = dest / relabel(Path(original["path"]).name)
        path.write_bytes(relabel(Path(original["path"]).read_bytes().decode("utf-8")).encode("utf-8"))
        entry.update(source=pin(path), destination=relabel(entry["destination"]))
    capture = scope["capture"]
    capture["recordingDirectory"] = str(run / "capture")
    capture["arguments"] = [relabel(s) for s in capture["arguments"]]
    operator = scope["operator"]
    require(pin(operator["plan"]["path"]) == operator["plan"], "Reference operator plan changed")
    plan = read(operator["plan"]["path"])
    op = pin(tools / "Operator.py")
    plan.update(Schema="UnknownNamePlan", SourceCommit=head, Root=str(run),
                ObsProfile=relabel(plan["ObsProfile"]), OperatorSha256=op["sha256"])
    plan["Tools"][0] = op
    for dependency in plan["Tools"]:
        require(pin(dependency["path"]) == dependency, "Operator dependency changed")
    plan_pin = put(dest / "operator-plan.json", plan)
    operator.update(source=op, plan=plan_pin, dependencies=plan["Tools"], executionFiles=[
        dict(name="operator-plan.json", source=plan_pin), dict(name="Recorder.lua", source=pin(tools / "Recorder.lua"))])
    for name in ["Install-UnknownName.ps1", "Restore-UnknownName.ps1"]:
        shutil.copyfile(tools / name, install / name)
    scope["installation"] = dict(executionDirectory=str(run),
        installerScript=pin(install / "Install-UnknownName.ps1"), rollbackScript=pin(install / "Restore-UnknownName.ps1"),
        approvalReceiptSchema="NativeSuppression01UnknownNameApproval",
        freshPreflightSchema="NativeSuppression01UnknownNameFreshLivePreflight")
    for key in ["requiredAbsentDirectories", "additionalRequiredAbsent"]:
        scope[key] = scope["installation"][key] = [relabel(s) for s in old["installation"][key]]
    print(json.dumps(put(dest / "scope.json", scope), indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument("build", type=Path)
    parser.add_argument("checks", type=Path)
    args = parser.parse_args()
    seal(args.build, args.checks)
