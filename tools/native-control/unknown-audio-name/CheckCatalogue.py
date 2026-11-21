"""Read only the pinned offline installation catalogue and retained stock game REL."""
from functools import lru_cache
from pathlib import Path
import hashlib
import json
import re

NAME = "ra_quiet_orchard"
CATALOGUE = Path(r"C:\Users\Libby\Documents\RichAudio-StockSource05\.local\resolved-game-cache-verified-01\resolved-catalog.json")
REL = Path(__file__).resolve().parents[3] / ".local/native-suppression-01/candidate-05/resources-02/original-rel-evidence/game.dat151.rel"


@lru_cache(maxsize=None)
def joaat(name):
    h = 0
    for byte in name.lower().encode("ascii"):
        h = ((h + byte) * 1025) & 0xffffffff
        h ^= h >> 6
    h = (h * 9) & 0xffffffff
    return ((h ^ (h >> 11)) * 32769) & 0xffffffff


def check():
    raw = CATALOGUE.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != "c4250395be8638b9d44df2a43da966caec99841a83f26e3131be51edca57c018":
        raise ValueError("Different installation catalogue")
    catalogue = json.loads(raw)
    target = joaat(NAME)
    spellings = {f"{target:08x}", f"0x{target:08x}", str(target), str(target - 2**32)}
    # Include bare resource names embedded in paths, bare hexadecimal fields and JSON numbers.
    tokens = set(re.findall(rb"[A-Za-z0-9_]+", raw.lower()))
    if NAME.encode() in raw.lower() or any(word.encode() in tokens for word in spellings):
        raise ValueError("Literal name or serialized hash already in catalogue")
    if any(joaat(token.decode("ascii")) == target for token in tokens):
        raise ValueError("A catalogue token hashes to the proposed name")
    bati = next(v for v in catalogue["Vehicles"] if v["Model"] == "bati")
    if int(bati["VehicleAudioRecord"]["Hash"], 16) != joaat("bati"):
        raise ValueError("Stock BATI positive control missing")
    data = REL.read_bytes()
    if joaat("bati").to_bytes(4, "little") not in data or target.to_bytes(4, "little") in data:
        raise ValueError("Stock game REL failed positive or negative hash check")
    return dict(name=NAME, hash=f"0x{target:08X}", catalogueSha256=digest,
                vehicles=len(catalogue["Vehicles"]), distinctTokens=len(tokens),
                stockRelSha256=hashlib.sha256(data).hexdigest(),
                scope="Retained installation catalogue and one stock game.dat151.rel; runtime lookup unknown")


if __name__ == "__main__":
    print(json.dumps(check(), indent=2))
