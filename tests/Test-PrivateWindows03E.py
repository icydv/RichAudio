"""Device-free Windows admission faults; no system file is modified."""
from pathlib import Path
import copy,sys,json
from unittest.mock import patch
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];S=R/'tools/native-control/private-profile03e';sys.path.insert(0,str(S))
import WindowsBaseline as w
import Admission as a
P=w.PACKAGE;T=P/('tests-windows-'+sys.argv[1]);T.mkdir();checks=[]
expected=w.read(P/'windows-baseline.json');actual=w.collect(T/'actual')
def check(name,ok):assert ok,name;checks.append(name);print('PASS '+name,flush=True)
def refuse(name,action):
    try:action()
    except (AssertionError,FileNotFoundError):check(name,True)
    else:raise AssertionError('Unexpected acceptance: '+name)
check('real-current-33-Windows-dependencies',w.compare(expected,actual))
for index,row in enumerate(actual['files']):
    if Path(row['path']).name.casefold() not in w.SERVICED:continue
    check('qualified-current-'+Path(row['path']).name,row['signature']['status']=='Valid' and row['signature']['chainOfflineBuilt'] and bool(row['components']) and bool(row['catalogs']))
    for field,change in [('sha256',lambda x:'0'*64),('identity',lambda x:dict(x,canonicalPath=r'c:\unexpected\file.dll')),('components',lambda x:[dict(x[0],assembly='wrong-os-component')]),('signature',lambda x:dict(x,status='HashMismatch'))]:
        observed=copy.deepcopy(actual);observed['files'][index][field]=change(observed['files'][index][field])
        refuse('reject-'+Path(row['path']).name+'-'+field,lambda:w.compare(expected,observed))
for label,action in [
 ('missing-file',lambda x:x['files'].pop()),
 ('extra-file',lambda x:x['files'].append(copy.deepcopy(x['files'][0]))),
 ('os-build',lambda x:x['os'].update(ubr=x['os']['ubr']+1)),
 ('pending-servicing',lambda x:x.update(servicingRebootPending=True)),
 ('file-identity',lambda x:x['files'][0]['identity'].update(inode=1)),
 ('catalog-hash',lambda x:x['files'][0]['catalogs'][0].update(sha256='0'*64)),
 ('invalid-catalog-signature',lambda x:x['files'][0]['catalogs'][0]['signature'].update(status='NotSigned')),
 ('catalog-identity',lambda x:x['files'][0]['catalogs'][0]['identity'].update(inode=2)),
 ('untrusted-publisher',lambda x:x['files'][0]['signature'].update(subject='CN=Microsoft-looking fixture')),
 ('wrong-root',lambda x:x['files'][0]['signature']['chain'][-1].update(thumbprint='0'*40)),
 ('wrong-architecture',lambda x:x['files'][0].update(machine='0x14c'))]:
    observed=copy.deepcopy(actual);action(observed);refuse(label,lambda:w.compare(expected,observed))
observed=copy.deepcopy(actual);index=next(i for i,x in enumerate(observed['files']) if Path(x['path']).name.casefold() not in w.SERVICED);observed['files'][index]['sha256']='a'*64
refuse('additional-Windows-change-cannot-be-self-baselined',lambda:w.compare(observed,observed))

# Exact HEAD/clean-tree and artifact gates use authored metadata, not changes
# to the real Git repository or any sealed binary.
fixture=T/'admission';fixture.mkdir();head='a'*40
w.save(fixture/'provenance-policy.json',dict(parent=a.PARENT,preparation='GATE-A-SHVDNE-PRIVATE-03E',head=head,changedSources=['fixture.py']))
def git(*args):
    if args[:2]==('branch','--show-current'):return 'feature/migration-shvdne-01'
    if args[:2]==('rev-parse','HEAD'):return head
    if args[0]=='rev-list':return head+' '+a.PARENT
    if args[0]=='status':return ''
    if args[0]=='diff-tree':return 'fixture.py'
    raise AssertionError(args)
with patch.object(a,'PACKAGE',fixture),patch.object(a,'git',git):
    check('exact-preparation-head',a.provenance()['head']==head)
    for label,key,value in [('wrong-head',('rev-parse','HEAD'),'b'*40),('dirty-tree',('status','--porcelain=v1','--untracked-files=all'),' M source.py'),('wrong-parent',('rev-list','--parents','-n','1',head),head+' '+'b'*40)]:
        with patch.object(a,'git',lambda *args,k=key,v=value:v if args==k else git(*args)):refuse(label,a.provenance)
    for label in ['probe','supervisor','immutable-loader']:
        f=fixture/(label+'.fixture');f.write_bytes(b'AUTHORED immutable bytes')
        manifest=dict(experiment='GATE-A-SHVDNE-PRIVATE-03D',preparation='GATE-A-SHVDNE-PRIVATE-03E',revision='windows-reconciliation-01',head=head,session='e'*32,supervisorSha256='b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020',probeSha256='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0',bindings=[dict(path=str(f),bytes=f.stat().st_size,sha256=w.sha(f))])
        (fixture/'execution-manifest.json').write_text(json.dumps(manifest));(fixture/'deployment-plan.json').write_text(json.dumps(dict(session='e'*32)));digest=w.sha(fixture/'execution-manifest.json')
        check('immutable-'+label+'-valid',bool(a.verify(digest)));f.write_bytes(b'ALTERED')
        refuse('immutable-'+label+'-modified',lambda:a.verify(digest));f.unlink();refuse('immutable-'+label+'-missing',lambda:a.verify(digest))
    refuse('consumed-03C-manifest-not-accepted',lambda:a.verify('dc68d0149c8fc05a1b9e1a88646cdcb2a2b5ec9d7c816a5eb8c6debefab61648'))
w.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks,currentWindowsFiles=len(actual['files']),changedFilesQualified=22,noSystemFilesWritten=True))
print('PASS',len(checks),'Windows and exact admission checks')
