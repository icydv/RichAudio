"""PRIVATE03E explicit Windows reconciliation, exact Git and immutable byte seal."""
from pathlib import Path
import importlib.util,re,subprocess,sys
sys.dont_write_bytecode=True
from WindowsBaseline import ROOT,PACKAGE,read,sha
PARENT='3e03fd3dab041433609eaeb622354dc86b33e9d1'
REVIEW_SHA='d7fe5fdbcb573160ac88a18ab46dabb2a9dbc57f8efa0751928fc9f08ece9fd3'
def git(*args):return subprocess.check_output(['git','--no-replace-objects',*args],cwd=ROOT).decode().strip()
def provenance():
    p=read(PACKAGE/'provenance-policy.json')
    assert p['parent']==PARENT and p['preparation']=='GATE-A-SHVDNE-PRIVATE-03E'
    assert git('branch','--show-current')=='feature/migration-shvdne-01' and git('rev-parse','HEAD')==p['head'],'Unapproved branch/HEAD'
    assert git('rev-list','--parents','-n','1',p['head']).split()==[p['head'],PARENT],'Unexpected ancestry'
    assert not git('status','--porcelain=v1','--untracked-files=all'),'Dirty worktree'
    assert sorted(git('diff-tree','--no-commit-id','--name-only','-r',p['head']).splitlines())==sorted(p['changedSources']),'Unreviewed commit scope'
    assert sha(ROOT/'.local/gate-a-shvdne-private-03d/review-manifest.json')==REVIEW_SHA,'Historical review seal changed'
    return p
def verify(digest):
    path=PACKAGE/'execution-manifest.json'
    assert re.fullmatch('[a-f0-9]{64}',digest or '') and sha(path)==digest,'Fresh exact PRIVATE03E manifest approval required'
    value=read(path)
    # The unchanged supervisor's protocol experiment is03D;03E is the separate
    # preparation/reconciliation identity. The unchanged probe remains03C.
    assert value['experiment']=='GATE-A-SHVDNE-PRIVATE-03D' and value['preparation']=='GATE-A-SHVDNE-PRIVATE-03E' and value['revision']=='windows-reconciliation-01'
    for item in value['bindings']:
        p=Path(item['path'])
        for q in [p,*p.parents]:
            if q.exists():assert not q.lstat().st_file_attributes&0x400,'Linked manifest binding'
        assert p.is_file() and p.stat().st_size==item['bytes'] and sha(p)==item['sha256'],'Changed bound file: '+str(p)
    p=provenance();assert p['head']==value['head'] and read(PACKAGE/'deployment-plan.json')['session']==value['session']
    assert value['supervisorSha256']=='b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020'
    assert value['probeSha256']=='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0'
    return value
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
