import re
from pathlib import Path
from Toolchain import ROOT,PACKAGE,read,sha,check
import Context
PARENT='b226ef1c84b5a62018b349c30ae9e796c23e870c'
def git(*args):return Context.processes.check_output(['git','--no-replace-objects',*args],cwd=ROOT,text=True).strip()
def provenance():
    p=read(PACKAGE/'provenance-policy.json')
    assert p['parent']==PARENT and p['preparation']=='GATE-A-SHVDNE-PRIVATE-03F'
    assert git('branch','--show-current')=='feature/migration-shvdne-01' and git('rev-parse','HEAD')==p['head'],'Unapproved branch/HEAD'
    assert git('rev-list','--parents','-n','1',p['head']).split()==[p['head'],PARENT],'Unexpected ancestry'
    assert not git('status','--porcelain=v1','--untracked-files=all'),'Dirty worktree'
    assert sorted(git('diff-tree','--no-commit-id','--name-only','-r',p['head']).splitlines())==sorted(p['changedSources']),'Unexpected commit scope'
    assert sha(ROOT/'.local/gate-a-shvdne-private-03e/execution-manifest.json')=='0face551c0a95febdefca2c3babaa9d31002e3b946b1ff7ef3dc4a52644a956d'
    return p
def verify(digest):
    path=PACKAGE/'execution-manifest.json'
    assert re.fullmatch('[a-f0-9]{64}',digest or '') and sha(path)==digest,'Exact fresh PRIVATE03F seal required'
    value=read(path)
    assert value['preparation']=='GATE-A-SHVDNE-PRIVATE-03F' and value['experiment']=='GATE-A-SHVDNE-PRIVATE-03D' and value['revision']=='stable-toolchain-01'
    for item in value['bindings']:check(item)
    assert value['toolchainSha256']==sha(PACKAGE/'toolchain-manifest.json')
    assert provenance()['head']==value['head'] and read(PACKAGE/'deployment-plan.json')['session']==value['session']
    assert value['supervisorSha256']=='b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020'
    assert value['probeSha256']=='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0'
    return value
