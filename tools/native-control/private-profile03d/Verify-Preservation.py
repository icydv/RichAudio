"""Read-only independent comparison to historical byte receipts, never rewrites."""
from pathlib import Path
import json,subprocess,sys
sys.dont_write_bytecode=True
from Package import ROOT,PACKAGE,read,sha

def run(destination):
    before=read(ROOT/'.local/gate-a-ownership-01/preservation-before.json')
    rows=before['protected']+before['sources']+read(PACKAGE/'preservation-before.json')
    pins={}
    for item in rows:
        if item['path'] in pins:assert pins[item['path']]['sha256']==item['sha256'],'Historical conflicting pins'
        pins[item['path']]=item
    failures=[]
    for path,item in pins.items():
        p=Path(path)
        observed=dict(bytes=p.stat().st_size,sha256=sha(p)) if p.is_file() else None
        if observed!=dict(bytes=item['bytes'],sha256=item['sha256']):
            failures.append(dict(path=path,expected=dict(bytes=item['bytes'],sha256=item['sha256']),observed=observed))
    rph=Path(before['rphRoot'])
    status=subprocess.check_output(['git','status','--porcelain=v1','--untracked-files=all'],cwd=rph,text=True).strip()
    assert status==before['rphStatus'].strip(),'Original RPH worktree status changed'
    assert sha(Path(before['rphMenu']['path']))==before['rphMenu']['sha256'],'Protected menu changed'
    result=dict(passed=not failures,uniqueHistoricalFiles=len(pins),unchangedFiles=len(pins)-len(failures),changed=failures,originalRphStatusUnchanged=True,rphMenu=before['rphMenu'],gameLaunched=False,actualGameOrObsWritten=False)
    with Path(destination).open('x') as f:json.dump(result,f,indent=2)
    assert not failures,failures[:20]
    return result
if __name__=='__main__':print(json.dumps(run(sys.argv[1])))
