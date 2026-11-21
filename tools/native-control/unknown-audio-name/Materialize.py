"""Apply the direct-test changes to the retained source without altering its sealed files."""
import filecmp
import json
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
BASE = "af167ed004d9ab1568a06613f8e5f9bb8ffbec08"
PRIVATE = REPO / ".local" / "unknown-audio-name"


# Change only the experiment identity in the isolated copies of historical tools.
def trial_labels(source):
    for old, new in (("candidate-11", "unknown-name"), ("execution-11", "unknown-name-run"),
                     ("NativeSuppression11", "UnknownAudioName"), ("Live11", "UnknownName"),
                     ("Candidate11", "UnknownName"), ("candidate11", "unknown-name"),
                     ("Execution11", "UnknownName"), ("Automatic11", "UnknownName"),
                     ("Preflight11", "Preflight"), ("Restoration11", "Restoration"),
                     ("Recorder11", "Recorder"), ("Operator11", "Operator")):
        source = source.replace(old, new)
    return source


def materialize():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    dest = PRIVATE / "tools"
    with TemporaryDirectory(dir=PRIVATE) as temp:
        stage = Path(temp) / "source"
        stage.mkdir()
        templates = json.loads((HERE / "templates.json").read_text())
        for name, template in templates.items():
            blob = BASE + ":tools/native-control/native-suppression11/" + template
            content = subprocess.check_output(["git", "show", blob], cwd=REPO)
            source = content.decode("utf-8-sig").replace("\r\n", "\n")
            if not name.startswith("Inspect"):
                source = trial_labels(source)
            (stage / name).write_bytes(source.encode("utf-8"))
        subprocess.run(["git", "apply", "--no-index", "--whitespace=nowarn",
                        "--directory=" + stage.relative_to(REPO).as_posix(),
                        str(HERE / "unknown-name.patch")], cwd=REPO, check=True)
        if dest.exists():
            if (set(p.name for p in dest.iterdir()) != set(templates)
                    or any(not filecmp.cmp(stage / n, dest / n, shallow=False) for n in templates)):
                raise ValueError("Existing private source differs from the reviewed variant")
        else:
            stage.rename(dest)
    return dest


if __name__ == "__main__":
    print(materialize())
