"""Demonstrate original03B interruption behavior using its actual methods."""
from pathlib import Path
import sys,json
sys.dont_write_bytecode=True
import InstallationFixture03C as fixture
R=fixture.R;P=fixture.ROOT
P.mkdir(parents=True,exist_ok=True)
module=fixture.load('original03b_interruption',R/'tools/native-control/private-profile03b/Manage-Installation.py')
results=[]

manager=fixture.package('o-copy-03',module)
baseline=fixture.inventory(manager);original_copy=module.old.copynew;target=manager.mapped(manager.plan['newGameFiles'][0]['destination'])
def interrupted_copy(source,destination):
    if destination==target:
        destination.parent.mkdir(parents=True,exist_ok=True)
        with destination.open('xb') as file:file.write(source.read_bytes()[:123])
        raise OSError('AUTHORED interruption during first new target copy')
    return original_copy(source,destination)
module.old.copynew=interrupted_copy
try:manager.install()
except OSError as error:install_error=str(error)
else:raise AssertionError('Fault not injected')
finally:module.old.copynew=original_copy
try:manager.restore()
except Exception as error:restore_error=type(error).__name__+': '+str(error)
else:raise AssertionError('Expected original restoration refusal')
assert target.exists() and target.stat().st_size==123 and not (manager.e/'restoration.json').exists()
results.append(dict(case='interrupted-copy-before-action-log',demonstrated=True,installError=install_error,restoreError=restore_error,partialTargetPreserved=True,restorationCompleted=False))

module=fixture.load('original03b_restore_interruption',R/'tools/native-control/private-profile03b/Manage-Installation.py')
manager=fixture.package('o-restore-01',module);manager.install()
original_log=manager.log
def interrupted_log(kind,**kw):
    original_log(kind,**kw)
    if kind=='removed-installed':raise OSError('AUTHORED interruption after first installed target removal')
manager.log=interrupted_log
try:manager.restore()
except OSError as error:first_error=str(error)
else:raise AssertionError('Fault not injected')
manager.log=original_log
try:manager.restore()
except Exception as error:retry_error=type(error).__name__+': '+str(error)
else:raise AssertionError('Expected original retry refusal')
assert (manager.e/'archived.json').exists() and not (manager.e/'restoration.json').exists()
results.append(dict(case='interrupted-restoration-after-first-removal',demonstrated=True,firstError=first_error,retryError=retry_error,archivesPreserved=True,restorationCompleted=False))
fixture.save(P/'original-interruption-demonstration.json',dict(passed=True,scope='Demonstrations against actual sealed03B methods on small authored mock bytes; no real installation writes',defects=results,gameWritten=False,obsWritten=False,gameLaunched=False))
print(json.dumps(results,indent=2))
