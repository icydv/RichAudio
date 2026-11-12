"""Actual03C manager fault injection on small deterministic disposable roots."""
from pathlib import Path
import sys,json,os,copy,re,subprocess
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=fixture.ROOT;cases=[];serial=0
run=sys.argv[1] if len(sys.argv)>1 else 't'
assert re.fullmatch('[a-z0-9]{1,8}',run)

def fresh():
    global serial
    serial+=1
    module=fixture.load('transactions03c_'+str(serial),R/'tools/native-control/private-profile03c/Manage-Installation.py')
    manager=fixture.package(run+'%02d'%serial,module)
    return module,manager,fixture.inventory(manager)
def check(name,condition):
    assert condition,name
    cases.append(name);print('PASS '+name,flush=True)
def refusal(name,action):
    try:action()
    except (AssertionError,FileExistsError,FileNotFoundError):check(name,True)
    else:raise AssertionError('Expected refusal: '+name)
def interrupt(manager,operation,phase,selector=None):
    fired=[]
    def fault(at,path=None):
        if at==phase and (selector is None or selector(path)) and not fired:
            fired.append(str(path));raise OSError('AUTHORED interruption '+phase)
    manager.fault=fault
    try:getattr(manager,operation)()
    except OSError as error:assert 'AUTHORED interruption' in str(error)
    else:raise AssertionError('Fault not reached: '+phase)
    manager.fault=lambda *args:None
    assert fired

# Installation interruption never creates a second attempt; same-attempt recovery is bounded.
for phase in ['transaction-ready','backup-copied','backups-ready','park-intent','park-unlinked','install-before-open','install-created','install-copy-chunk','install-complete','replace-unlinked','installation-complete']:
    module,manager,baseline=fresh();interrupt(manager,'install',phase)
    refusal('interrupted-install-'+phase+'-cannot-repeat',manager.install)
    manager.restore();manager.restore()
    check('interrupted-install-'+phase+'-restores-exact-baseline-idempotently',manager.verify() and fixture.inventory(manager)==baseline)

# No exclusive-create proof is an intentional fail-closed boundary.
module,manager,baseline=fresh();interrupt(manager,'install','install-opened-unproven')
partial=manager.mapped(manager.plan['newGameFiles'][0]['destination'])
refusal('unproven-empty-target-is-preserved',manager.restore)
check('unproven-empty-file-remains-without-restoration-claim',partial.exists() and partial.stat().st_size==0 and not (manager.e/'restoration.json').exists())

for phase in ['archived','remove-intent','target-removed','restore-created','restore-copy-chunk','restore-complete','directory-removed','restoration-complete']:
    module,manager,baseline=fresh();manager.install();interrupt(manager,'restore',phase)
    manager.restore();manager.restore()
    check('interrupted-restore-'+phase+'-resumes-and-verifies-exact-baseline',manager.verify() and fixture.inventory(manager)==baseline)

# Partial mutable evidence archival must itself resume without losing evidence.
for phase in ['archive-created','archive-copy-chunk','archive-complete']:
    module,manager,baseline=fresh();manager.install()
    interrupt(manager,'restore',phase)
    manager.restore()
    check('interrupted-evidence-'+phase+'-resumes-with-exact-restoration',manager.verify() and fixture.inventory(manager)==baseline)

for variant in ['content','identity','birth-proof','hardlink','missing-proof','wrong-ledger-session','corrupt-backup','readonly','changed-archive','unknown-game-file','unknown-OBS-file','unknown-root-DLL','cache-flag']:
    module,manager,baseline=fresh();manager.install()
    target=manager.mapped(manager.plan['newGameFiles'][0]['destination'])
    if variant=='content':target.write_bytes(b'UNEXPECTED MODIFICATION')
    elif variant=='identity':
        value=target.read_bytes();replacement=target.with_suffix('.authored');replacement.write_bytes(value);os.replace(replacement,target)
    elif variant=='birth-proof':
        proof=manager.record_path('install:'+str(target),'created');value=module.read(proof);value['value']['birthNs']+=1;proof.write_text(json.dumps(value))
    elif variant=='wrong-ledger-session':
        proof=manager.record_path('install:'+str(target),'created');value=module.read(proof);value['session']='f'*32;proof.write_text(json.dumps(value))
    elif variant=='hardlink':os.link(target,manager.scope/'authored-hardlink')
    elif variant=='missing-proof':manager.record_path('install:'+str(target),'created').unlink()
    elif variant=='corrupt-backup':Path(module.read(manager.e/'backups.json')[0]['backup']).write_bytes(b'BAD BACKUP')
    elif variant=='readonly':(manager.game/'xinput1_4.dll').write_bytes(b'BAD XINPUT')
    elif variant=='changed-archive':
        # Interrupt after a mutable archive exists, then corrupt that retained evidence.
        interrupt(manager,'restore','archive-complete')
        archive=next((manager.e/'after').iterdir());archive.write_bytes(b'BAD ARCHIVE')
    elif variant=='unknown-game-file':(manager.game/'scripts/unknown.dat').write_bytes(b'UNKNOWN')
    elif variant=='unknown-OBS-file':(manager.obs/'unknown.dat').write_bytes(b'UNKNOWN')
    elif variant=='unknown-root-DLL':(manager.game/'unknown.dll').write_bytes(b'UNKNOWN')
    elif variant=='cache-flag':(manager.game/'rpf.cache.disable').write_bytes(b'UNKNOWN')
    before=fixture.inventory(manager)
    refusal('unsafe-'+variant+'-refuses-recovery',manager.restore)
    check('unsafe-'+variant+'-preserves-every-existing-target',fixture.inventory(manager)==before and not (manager.e/'restoration.json').exists())

# Generated evidence is archived by exact known pattern before removal; normal mutable OBS
# rewrites are allowed only after completed installation and are preserved outside the game.
module,manager,baseline=fresh();manager.install()
evidence=manager.game/'scripts/RichAudio.GateAPrivate03C.Evidence';evidence.mkdir();journal=evidence/('session-'+'b'*32+'.log');journal.write_text('AUTHORED journal')
(manager.game/'ScriptHookVDotNet.log').write_text('AUTHORED runtime log')
user=manager.obs/'user.ini';replacement=user.with_suffix('.replacement');replacement.write_bytes(b'AUTHORED normal OBS atomic replacement');os.replace(replacement,user)
(manager.obs/'logs').mkdir(exist_ok=True);(manager.obs/'logs/2026-11-12 23-59-58.txt').write_text('AUTHORED recorder log')
manager.restore();check('normal-generated-evidence-and-atomic-OBS-rewrite-archived-before-exact-restore',manager.verify() and fixture.inventory(manager)==baseline)
archives=[module.read(p) for p in (manager.e/'transaction').glob('*-archived.json')]
check('original-journal-is-retained-outside-game',any(row['value']['sha256']==fixture.sha_bytes(b'AUTHORED journal') for row in archives))

for variant in ['missing-xinput','missing-dinput','modified-OpenRPF','unexpected-proxy','missing-SHVDNE','incorrect-shadow','destination-conflict','game-space','backup-space','old-space-only','undeclared-recovery-reserve']:
    module,manager,baseline=fresh()
    if variant=='missing-xinput':(manager.game/'xinput1_4.dll').unlink()
    elif variant=='missing-dinput':(manager.game/'dinput8.dll').unlink()
    elif variant=='modified-OpenRPF':(manager.game/'OpenRPF.asi').write_bytes(b'BAD')
    elif variant=='unexpected-proxy':(manager.game/'dsound.dll').write_bytes(b'BAD')
    elif variant=='missing-SHVDNE':Path(manager.plan['newGameFiles'][0]['source']).unlink()
    elif variant=='incorrect-shadow':next(Path(x['source']) for x in manager.plan['newGameFiles'] if Path(x['destination']).name=='update.rpf').write_bytes(b'BAD SHADOW')
    elif variant=='destination-conflict':
        path=manager.mapped(manager.plan['newGameFiles'][0]['destination']);path.write_bytes(b'EXISTING')
    elif variant=='undeclared-recovery-reserve':manager.plan['reserveRecoveryArchiveBytes']=0
    else:
        disk=module.base.shutil.disk_usage;calls=[]
        class Space:
            def __init__(self,free):self.free=free
        def fake_space(path):
            calls.append(path)
            if variant=='old-space-only':return Space(10**15 if len(calls)==1 else manager.plan['backupBytes']+manager.plan['reserveCaptureBytes']+536870912+1)
            return Space(0 if variant=='game-space' or len(calls)>1 else 10**15)
        module.base.shutil.disk_usage=fake_space
    before=fixture.inventory(manager)
    refusal('final03C-preflight-'+variant,manager.install)
    check('final03C-preflight-'+variant+'-makes-no-attempt-or-target-change',not manager.e.exists() and fixture.inventory(manager)==before)
    if variant in ['game-space','backup-space','old-space-only']:module.base.shutil.disk_usage=disk

for digest in [None,'37ed3488d15c037f79b919ac8ce8b00e0d869d0c891407e2116211125af51338','b3337f3c2f41a8878a25582321ebe10e1dba216bf90bc4b274f27ba63cd24237']:
    command=[sys.executable,'-B',str(R/'tools/native-control/private-profile03c/Manage-Installation.py'),'install']
    if digest:command+=['--approved-manifest-sha256',digest]
    result=subprocess.run(command,capture_output=True,text=True)
    check('final03C-cli-refuses-'+(digest or 'no-approval'),result.returncode!=0 and not (R/'.local/gate-a-shvdne-private-03c/execution-01').exists())

module,manager,baseline=fresh();manager.install();manager.restore()
receipt=manager.e/'restoration.json';value=module.read(receipt);value['passed']=False;receipt.write_text(json.dumps(value))
refusal('changed-completed-restoration-receipt-is-not-accepted',manager.restore)
check('changed-restoration-receipt-does-not-alter-originals',fixture.inventory(manager)==baseline)
expected=manager.plan['supervisor'];session=manager.plan['session']
row=dict(Name='RichAudio.Private01.Supervisor.exe',ProcessId=321,CreationUtcTicks=123456789,ExecutablePath=expected['binary'])
bound=dict(pid=321,creationUtcTicks=123456789,executable=expected['binary'],sha256=expected['sha256'],session=session)
check('new03C-session-exact-supervisor-policy-admitted',module.base.admit_retirement_processes([row],bound,expected['binary'],expected['sha256'],session))
for name,rows,binding in [('stale-creation',[dict(row,CreationUtcTicks=123456790)],bound),('stale-session',[row],dict(bound,session='f'*32)),('wrong-path',[dict(row,ExecutablePath=str(manager.scope/'wrong.exe'))],bound),('unexpected-host',[dict(row,Name='RichAudio.Host.exe')],bound),('duplicate-supervisor',[row,row],bound)]:
    refusal('new03C-session-'+name,lambda:module.base.admit_retirement_processes(rows,binding,expected['binary'],expected['sha256'],session))

fixture.save(P/('transaction-fixtures-'+run+'.json'),dict(passed=True,count=len(cases),cases=cases,packages=serial,scope='Actual transactional methods on authored mock bytes; original03B hashes and fullshadow preservation are separately verified',managerSha256=module.sha(R/'tools/native-control/private-profile03c/Manage-Installation.py'),gameWritten=False,obsWritten=False,gameLaunched=False,allMutableTestsInsidePrivate03C=True))
print('PASS '+str(len(cases))+' PRIVATE03C transaction cases')
