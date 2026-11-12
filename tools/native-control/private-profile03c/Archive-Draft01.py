"""Preserve the unsealed first03C proposal before selecting the corrected build02."""
from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c';A=P/'proposal-drafts/attempt-01'
assert not A.exists() and not (P/'execution-manifest.json').exists() and not (P/'execution-01').exists()
A.mkdir(parents=True)
names=['deployment-plan.json','loader-contract.json','explicit-approval-execution.ini','Watch-AuthorizedGame.py','Read-Status03.ps1']
files=[P/name for name in names]+list((P/'capture-template').iterdir())
records=[]
for source in files:
    target=A/source.relative_to(P)
    assert source.resolve().is_relative_to(P.resolve()) and target.resolve().is_relative_to(A.resolve()) and source.is_file()
    for ancestor in [source,*source.parents]:
        if ancestor.exists():assert not ancestor.lstat().st_file_attributes&0x400
    value=source.read_bytes();target.parent.mkdir(parents=True,exist_ok=True)
    source.rename(target)
    assert target.read_bytes()==value
    records.append(dict(original=str(source),retained=str(target),bytes=len(value),sha256=hashlib.sha256(value).hexdigest()))
assert not any((P/'capture-template').iterdir());(P/'capture-template').rmdir()
with (A/'superseded.json').open('x',encoding='utf-8') as f:
    json.dump(dict(reason='Before first seal, actual API deadline-crossing regression justified separate probe build02 v0.3.1.1. Original draft used build01 v0.3.1.0; neither draft was authorized or installed.',sealed=False,liveAuthorized=False,gameWrites=False,gameLaunches=0,files=records),f,indent=2)
print('Preserved unsealed draft01; no installed files touched')
