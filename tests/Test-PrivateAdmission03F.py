"""Exact03F history, artifact and session gates with authored fixture metadata."""
from pathlib import Path
import sys,uuid,json
from unittest.mock import patch
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03f'))
import Toolchain as t
import Context
c=t.load(sys.argv[1]);Context.configure(c,True)
import AdmissionF as a
T=t.PACKAGE/'fixtures'/('admission-f-'+uuid.uuid4().hex);T.mkdir(parents=True);checks=[];head='a'*40
def write(name,value):(T/name).write_text(json.dumps(value))
def check(name,ok):assert ok,name;checks.append(name);print('PASS '+name,flush=True)
def refuse(name,action):
    try:action()
    except (AssertionError,FileNotFoundError,RuntimeError):check(name,True)
    else:raise AssertionError('Accepted '+name)
policy=dict(parent=a.PARENT,head=head,preparation='GATE-A-SHVDNE-PRIVATE-03F',changedSources=['authored.py']);write('provenance-policy.json',policy)
def git(*args):
    return {'branch':'feature/migration-shvdne-01','rev-parse':head,'rev-list':head+' '+a.PARENT,'status':'','diff-tree':'authored.py'}[args[0]]
with patch.object(a,'PACKAGE',T),patch.object(a,'git',git):
    check('exact-new-committed-transition',a.provenance()==policy)
    for label,key,value in [('later-HEAD','rev-parse','b'*40),('dirty-tree','status',' M authored.py'),('wrong-branch','branch','main'),('unexpected-parent','rev-list',head+' '+'b'*40),('unexpected-scope','diff-tree','production.py')]:
        with patch.object(a,'git',lambda *args,k=key,v=value:v if args[0]==k else git(*args)):refuse(label,a.provenance)
    write('toolchain-manifest.json',dict(authored=True));write('deployment-plan.json',dict(session='e'*32))
    for name in ['source','probe','supervisor','audio-resource','dependency']:
        file=T/(name+'.fixture');file.write_bytes(b'original authored input')
        m=dict(experiment='GATE-A-SHVDNE-PRIVATE-03D',preparation='GATE-A-SHVDNE-PRIVATE-03F',revision='stable-toolchain-01',head=head,session='e'*32,toolchainSha256=t.sha(T/'toolchain-manifest.json'),probeSha256='fbed6a147abf8575825996198eb4cb60cddcaa02929c9d00fa43e5dba0bda4b0',supervisorSha256='b88ce28612e85e9362c7279e647d51b10cf23b43c4d663ea4061811728d13020',bindings=[t.pin(file)])
        write('execution-manifest.json',m);digest=t.sha(T/'execution-manifest.json');check(name+'-valid',a.verify(digest)==m)
        file.write_bytes(b'modified authored input');refuse(name+'-modified',lambda:a.verify(digest));file.unlink();refuse(name+'-missing',lambda:a.verify(digest))
    for label,digest in [('consumed-03E','0face551c0a95febdefca2c3babaa9d31002e3b946b1ff7ef3dc4a52644a956d'),('historical-03C','dc68d0149c8fc05a1b9e1a88646cdcb2a2b5ec9d7c816a5eb8c6debefab61648')]:refuse(label,lambda:a.verify(digest))
t.save(T/'result.json',dict(passed=True,count=len(checks),checks=checks))
print('PASS',len(checks),'PRIVATE03F admission checks')
