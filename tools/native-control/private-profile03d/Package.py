"""PRIVATE03D immutable package admission; exact committed HEAD and byte closure."""
from pathlib import Path
import hashlib,json,re,subprocess
ROOT=Path(__file__).resolve().parents[3]
PACKAGE=ROOT/'.local/gate-a-shvdne-private-03d'
PARENT='c4eee5e41db889723b4ec6fcf1d470cda367ec6b'
ORIGINAL=ROOT/'.local/gate-a-shvdne-private-03c'

def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for block in iter(lambda:f.read(1048576),b''):h.update(block)
    return h.hexdigest()
def git(*args):return subprocess.check_output(['git','--no-replace-objects',*args],cwd=ROOT).decode().strip()
def provenance():
    policy=read(PACKAGE/'provenance-policy.json')
    assert policy['parent']==PARENT and policy['experiment']=='GATE-A-SHVDNE-PRIVATE-03D'
    assert git('branch','--show-current')=='feature/migration-shvdne-01'
    assert git('rev-parse','HEAD')==policy['head'],'Unapproved HEAD'
    assert git('rev-list','--parents','-n','1',policy['head']).split()==[policy['head'],PARENT],'Unexpected ancestry'
    assert not git('status','--porcelain=v1','--untracked-files=all'),'Dirty worktree'
    assert sorted(git('diff-tree','--no-commit-id','--name-only','-r',policy['head']).splitlines())==sorted(policy['changedSources']),'Commit scope changed'
    return policy
def verify(digest):
    path=PACKAGE/'execution-manifest.json'
    assert re.fullmatch('[a-f0-9]{64}',digest or '') and sha(path)==digest,'Fresh exact PRIVATE03D manifest required'
    value=read(path)
    assert value['experiment']=='GATE-A-SHVDNE-PRIVATE-03D' and value['revision']=='admission-01'
    for item in value['bindings']:
        p=Path(item['path'])
        for q in [p,*p.parents]:
            if q.exists():assert not q.lstat().st_file_attributes&0x400,'Linked binding'
        assert p.is_file() and p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],'Changed binding: '+str(p)
    policy=provenance()
    assert policy['head']==value['head'] and read(PACKAGE/'deployment-plan.json')['session']==value['session']
    return value
