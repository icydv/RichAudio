"""Actual Git and admission regressions on isolated repositories/files only."""
from pathlib import Path
import sys,importlib.util,subprocess,json,copy,shutil,hashlib,ast
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03c-provenance-01';S=R/'tools/native-control/private-profile03c-provenance'
sys.path.insert(0,str(S));import Provenance as p
run=sys.argv[1] if len(sys.argv)>1 else 'precommit3';assert run in ['precommit','precommit2','precommit3','final']
output=P/('regressions-'+run+'.json');assert not output.exists()
audit=p.read(P/'provenance-before.json')
if run=='final':policy=p.read(P/'provenance-policy.json')
else:policy=dict(schema='Private03CExactCommittedProvenance01',originalHead=p.BASE,authorizedFour=list(p.FOUR),originalManifestSha256=p.ORIGINAL_SHA,expectedHead=p.FOUR[-1],correction=None,criticalSources={x['relative']:{k:x[k] for k in ['bytes','sha256','gitBlob']} for x in audit['criticalSources']})
scope=P/'fixtures'/('regressions-'+run);assert not scope.exists();scope.mkdir(parents=True)
repo=scope/'repo'
assert repo.resolve().is_relative_to(P.resolve())
subprocess.run(['git','clone','--shared','--no-checkout','--quiet',str(R),str(repo)],check=True,capture_output=True)
def git(*args):return subprocess.check_output(['git','--no-replace-objects',*args],cwd=repo,stderr=subprocess.STDOUT)
git('config','core.autocrlf','true');git('checkout','--quiet',policy['expectedHead']);git('checkout','-B','feature/migration-shvdne-01',policy['expectedHead'])
# Preserve exact raw sealed working bytes, not checkout-normalized approximations.
for name in list(policy['criticalSources'])+list((policy['correction'] or {}).get('files',{})):
    shutil.copyfile(R/name,repo/name)
# Refresh only the disposable index after replacing checkout CRLF with exact
# sealed raw bytes. Canonical blobs must remain identical to the selected commit.
git('add','--renormalize','.');assert not git('diff','--cached','--name-only').strip()
cases=[]
def passed(name):cases.append(name);print('PASS '+name,flush=True)
def refuse(name,action):
    try:action()
    except (AssertionError,FileNotFoundError):passed(name)
    else:raise AssertionError('Unexpected acceptance: '+name)
assert p.verify_provenance(policy,repo)['passed'];passed('exact-reviewed-transition-and-raw-source-pins')
bad=copy.deepcopy(policy);bad['authorizedFour'][1]=p.FOUR[0];refuse('changed-authorized-commit-list',lambda:p.verify_provenance(bad,repo))
bad=copy.deepcopy(policy);bad['originalManifestSha256']='0'*64;refuse('stale-original-manifest-identity',lambda:p.verify_provenance(bad,repo))
bad=copy.deepcopy(policy);bad['criticalSources'].pop(next(iter(bad['criticalSources'])));refuse('omitted-runtime-critical-source',lambda:p.verify_provenance(bad,repo))
name='tools/native-control/private-profile03c/probe-v0311/PrivateProfile03C.Shvdne.cs';target=repo/name;original=target.read_bytes()
git('update-index','--assume-unchanged',name);target.write_bytes(original+b'\n// AUTHORED MODIFICATION\n')
assert not git('status','--porcelain=v1').strip()
refuse('modified-runtime-source-even-when-Git-assumes-unchanged',lambda:p.verify_provenance(policy,repo))
target.write_bytes(original);git('update-index','--no-assume-unchanged',name);git('add',name)
name='tests/host/TestGateAPrivate03.cs';target=repo/name;original=target.read_bytes();assert b'\r\n' in original
git('update-index','--assume-unchanged',name);target.write_bytes(original.replace(b'\r\n',b'\n'))
refuse('raw-newline-normalization-is-not-sealed-byte-equivalence',lambda:p.verify_provenance(policy,repo))
target.write_bytes(original);git('update-index','--no-assume-unchanged',name);git('add',name)
target=repo/'README.md';original=target.read_bytes();target.write_bytes(original+b'\nAUTHORED DIRTY FILE\n')
refuse('dirty-working-tree',lambda:p.verify_provenance(policy,repo))
git('add','README.md');refuse('dirty-index',lambda:p.verify_provenance(policy,repo));git('reset','--mixed',policy['expectedHead']);target.write_bytes(original);git('add','README.md')
target=repo/'unapproved.txt';target.write_text('AUTHORED UNTRACKED');refuse('untracked-working-tree-file',lambda:p.verify_provenance(policy,repo));target.unlink()
git('checkout','-b','unapproved-branch');refuse('wrong-branch',lambda:p.verify_provenance(policy,repo));git('checkout','feature/migration-shvdne-01')
hooks=scope/'empty-hooks';hooks.mkdir()
git('-c','core.hooksPath='+str(hooks),'-c','user.name=Offline fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','--allow-empty','-m','AUTHORED unapproved future commit')
unexpected=git('rev-parse','HEAD').decode().strip();refuse('unexpected-additional-clean-commit',lambda:p.verify_provenance(policy,repo))
bad=copy.deepcopy(policy);bad['expectedHead']=unexpected;bad['correction']=dict(commit=unexpected,parent=p.FOUR[-1],files={name:{} for name in p.CORRECTION_FILES})
refuse('future-commit-cannot-be-relabeled-as-the-scoped-correction',lambda:p.verify_provenance(bad,repo))
git('reset','--soft',policy['expectedHead'])
assert p.verify_provenance(policy,repo)['passed'];passed('restored-exact-commit-is-admissible')

# Exercise the real new binding validator against copies of actual artifacts.
artifact_specs=[('probe',p.ORIGINAL/'resource-probe/build-02/RichAudio.GateAPrivate03C.Shvdne.dll'),('supervisor',Path(p.read(p.ORIGINAL/'deployment-plan.json')['supervisor']['binary'])),('audio-resource',R/'.local/gate-a-shvdne-private-01/resource/ra_private01_game.dat151.rel'),('dependency',R/'.local/shvdne-reference/release/MinHook.x64.dll')]
bindings=[]
for label,source in artifact_specs:
    dst=scope/(label+source.suffix);shutil.copyfile(source,dst);bindings.append(dict(path=str(dst),bytes=dst.stat().st_size,sha256=p.sha(dst)))
fake=scope/'execution-manifest.json';fake.write_text(json.dumps(dict(experiment='GATE-A-SHVDNE-PRIVATE-03C',revision='provenance-01',originalManifestSha256=p.ORIGINAL_SHA,bindings=bindings)),encoding='utf-8');digest=p.sha(fake)
assert p.verify_manifest(digest,fake);passed('new-binding-validator-admits-intact-artifact-copies')
for label,item in zip([x[0] for x in artifact_specs],bindings):
    target=Path(item['path']);original=target.read_bytes();target.write_bytes(original[:-1]+bytes([original[-1]^1]))
    refuse('modified-'+label,lambda:p.verify_manifest(digest,fake));target.write_bytes(original)
target=Path(bindings[-1]['path']);original=target.read_bytes();target.unlink();refuse('missing-dependency',lambda:p.verify_manifest(digest,fake));target.write_bytes(original)
for old in ['37ed3488d15c037f79b919ac8ce8b00e0d869d0c891407e2116211125af51338','b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237',p.ORIGINAL_SHA]:
    refuse('old-or-consumed-manifest-'+old[:8],lambda old=old:p.verify_manifest(old,fake))

# Original authored fixture factory, redirected into the new isolated namespace.
spec=importlib.util.spec_from_file_location('authored03c_fixture',R/'tests/InstallationFixture03C.py');fixture=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture);fixture.ROOT=scope/'mock'
module=fixture.load('new_provenance_manager',S/'Manage-Installation.py');manager=fixture.package('admission',module)
assert manager.preflight();baseline=fixture.inventory(manager);passed('unchanged-loader-layout-dependency-and-space-admission')
for name in ['xinput1_4.dll','dinput8.dll','OpenRPF.asi']:
    target=manager.game/name;original=target.read_bytes();target.unlink();refuse('missing-loader-'+name,manager.preflight);target.write_bytes(original)
    target.write_bytes(original+b'MODIFIED');refuse('modified-loader-'+name,manager.preflight);target.write_bytes(original)
for name in ['dsound.dll','unexpected.dll','ScriptHookVDotNet.asi']:
    target=manager.game/name;target.write_bytes(b'AUTHORED unexpected');refuse('unexpected-installed-'+name,manager.preflight);target.unlink()
target=manager.game/'mods';target.mkdir();refuse('unexpected-mods-destination',manager.preflight);target.rmdir()
target=Path(manager.plan['newGameFiles'][0]['source']);original=target.read_bytes();target.unlink();refuse('missing-staged-SHVDNE-dependency',manager.preflight);target.write_bytes(original)
target.write_bytes(original+b'CHANGED');refuse('altered-staged-SHVDNE-dependency',manager.preflight);target.write_bytes(original)
usage=module.shutil.disk_usage;module.shutil.disk_usage=lambda _:type('NoSpace',(),{'free':0})()
refuse('insufficient-space',manager.preflight);module.shutil.disk_usage=usage
assert fixture.inventory(manager)==baseline;passed('negative-preflights-preserve-isolated-inventory')
manager.e.mkdir();refuse('consumed-existing-attempt-cannot-install-again',manager.install)
assert fixture.inventory(manager)==baseline;passed('consumed-attempt-refuses-before-file-mutation')
for source in S.glob('*.py'):ast.parse(source.read_text(),filename=str(source))
passed('new-entrypoint-syntax')
denied=subprocess.run([sys.executable,'-B',str(S/'Manage-Installation.py'),'install'],capture_output=True,text=True,cwd=R)
assert denied.returncode!=0 and 'Fresh explicit approval' in denied.stderr and not (p.ORIGINAL/'execution-01').exists();passed('actual-live-entrypoint-refuses-without-fresh-approval-before-any-attempt')
with output.open('x',encoding='utf-8') as file:json.dump(dict(passed=True,run=run,count=len(cases),cases=cases,fixtureRoot=str(scope),expectedHead=policy['expectedHead'],rejectedAdditionalCommit=unexpected,newSourcePins=[dict(path=str(q),bytes=q.stat().st_size,sha256=p.sha(q)) for q in sorted(S.glob('*.py'))],realGameWritten=False,realObsWritten=False,liveApplicationsStarted=False,originalSealsModified=False),file,indent=2)
print('PASS '+str(len(cases))+' provenance/admission cases; real installation untouched')
