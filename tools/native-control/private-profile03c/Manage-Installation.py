"""PRIVATE03C transactional file deployment; never launches an application.

Preflight and process/loader guards are inherited from sealed03B. New install is
one-use. Restore resumes file recovery within that attempt; it grants no game
launch, activation, profile request or deadline renewal. All transaction evidence
and partial-file archives stay outside GTA beneath the attempt directory.
"""
from pathlib import Path
import importlib.util,sys,json,hashlib,os,shutil,argparse,re
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[3];P=R/'.local/gate-a-shvdne-private-03c'
spec=importlib.util.spec_from_file_location('retained_manager03b',R/'tools/native-control/private-profile03b/Manage-Installation.py')
base=importlib.util.module_from_spec(spec);spec.loader.exec_module(base)
base.P=P;base.old.P=P
read,sha,no_links=base.read,base.sha,base.no_links

def file_identity(path,descriptor=None):
    no_links(path)
    stat=os.fstat(descriptor) if descriptor is not None else path.stat()
    assert stat.st_nlink==1,'Hard-linked target refused'
    born=getattr(stat,'st_birthtime_ns',stat.st_ctime_ns)
    assert stat.st_dev and stat.st_ino and born,'Unavailable stable file identity'
    return dict(device=stat.st_dev,inode=stat.st_ino,birthNs=born)

def prefix_matches(target,source,expected):
    no_links(target);no_links(source)
    if not target.is_file() or target.stat().st_size>expected:return False
    with target.open('rb') as a,source.open('rb') as b:
        while True:
            block=a.read(1048576)
            if not block:return True
            if block!=b.read(len(block)):return False


class Installation(base.Installation):
    def fault(self,phase,path=None):pass

    def preflight(self):
        assert super().preflight()
        minimum_recovery=max(x['bytes'] for x in self.plan['newGameFiles']+self.plan['obsFiles'])+max(x['bytes'] for x in self.plan['backupOriginals'])
        assert self.plan['reserveRecoveryArchiveBytes']>=minimum_recovery,'Insufficient declared recovery archive reserve'
        required=self.plan['backupBytes']+self.plan['reserveCaptureBytes']+536870912+self.plan['reserveRecoveryArchiveBytes']
        assert shutil.disk_usage(P).free>=required,'Insufficient worktree space for partial-target recovery archival'
        return True

    def record_path(self,key,phase):
        return self.e/'transaction'/(hashlib.sha256(key.encode()).hexdigest()[:24]+'-'+phase+'.json')

    def record(self,key,phase,value):
        path=self.record_path(key,phase)
        no_links(path)
        entry=dict(schema=1,session=self.plan['session'],key=key,phase=phase,value=value)
        if path.exists():assert read(path)==entry,'Transaction record changed';return
        path.parent.mkdir(parents=True,exist_ok=True)
        with path.open('x',encoding='utf-8') as file:
            json.dump(entry,file,sort_keys=True);file.flush();os.fsync(file.fileno())

    def recorded(self,key,phase):
        path=self.record_path(key,phase)
        if not path.exists():return None
        no_links(path);value=read(path)
        assert value['schema']==1 and value['session']==self.plan['session'] and value['key']==key and value['phase']==phase,'Wrong transaction identity'
        return value['value']

    def save_new(self,path,value):
        no_links(path)
        with path.open('x',encoding='utf-8') as file:
            json.dump(value,file,indent=2);file.flush();os.fsync(file.fileno())

    def pin_ok(self,path,item):
        no_links(path)
        return path.is_file() and path.stat().st_size==item['bytes'] and sha(path)==item['sha256']

    def make_dirs(self,path):
        missing=[];at=path.parent
        while not at.exists():missing.append(at);at=at.parent
        no_links(at)
        for directory in reversed(missing):
            self.safe(directory)
            self.record('directory:'+str(directory),'intent',dict(path=str(directory)))
            directory.mkdir()

    def copy_owned(self,source,target,item,key,kind,resume=False):
        """Exclusive-create proof is durable before the first content write.

        If interruption occurs between exclusive open and its durable proof, the
        unproven empty file is preserved/refused. No filename-only ownership.
        """
        assert self.pin_ok(source,item),'Copy source changed'
        self.safe(target);no_links(source)
        intent=dict(source=str(source),target=str(target),bytes=item['bytes'],sha256=item['sha256'],kind=kind)
        previous=self.recorded(key,'intent')
        if previous is not None:assert previous==intent,'Copy intent changed'
        else:self.record(key,'intent',intent)
        created=self.recorded(key,'created')
        if target.exists():
            assert resume and created is not None,'Existing target lacks resumable exclusive-create proof'
            assert file_identity(target)==created,'Owned target file identity changed'
            assert prefix_matches(target,source,item['bytes']),'Owned partial target is not an exact source prefix'
            if self.pin_ok(target,item):
                self.record(key,'complete',dict(identity=created,bytes=item['bytes'],sha256=item['sha256']));return
            offset=target.stat().st_size;mode='ab'
        else:
            assert created is None,'Owned target disappeared without a removal transaction'
            self.make_dirs(target);offset=0;mode='xb'
        self.fault(kind+'-before-open',target)
        with source.open('rb') as a,target.open(mode) as b:
            if created is None:
                self.fault(kind+'-opened-unproven',target)
                created=file_identity(target,b.fileno());self.record(key,'created',created)
                self.fault(kind+'-created',target)
            a.seek(offset)
            while True:
                block=a.read(1048576)
                if not block:break
                b.write(block);self.fault(kind+'-copy-chunk',target)
            b.flush();os.fsync(b.fileno())
        assert file_identity(target)==created and self.pin_ok(target,item),'Copied target verification failed'
        self.record(key,'complete',dict(identity=created,bytes=item['bytes'],sha256=item['sha256']))
        self.fault(kind+'-complete',target)

    def transaction(self):
        no_links(self.e/'transaction.json')
        value=read(self.e/'transaction.json')
        assert value['schema']==1 and value['session']==self.plan['session'],'Wrong attempt/session'
        assert value['planSha256']==sha(P/'deployment-plan.json') and value['contractSha256']==sha(P/'loader-contract.json'),'Preparation changed after installation'
        return value

    def install(self):
        assert not self.e.exists(),'Attempt already exists; no repeat'
        self.preflight();self.e.mkdir(parents=True);(self.e/'backup').mkdir();(self.e/'transaction').mkdir()
        parents=set()
        for item in self.plan['newGameFiles']+self.plan['obsFiles']:
            at=self.mapped(item['destination']).parent
            while at!=self.game and at!=self.obs:
                if at.exists():parents.add(str(at))
                at=at.parent
        self.save_new(self.e/'transaction.json',dict(schema=1,session=self.plan['session'],planSha256=sha(P/'deployment-plan.json'),contractSha256=sha(P/'loader-contract.json'),preexistingDestinationDirectories=sorted(parents),originalObsDirectories=sorted(str(q) for q in self.obs.rglob('*') if q.is_dir()),gameLaunched=False))
        self.fault('transaction-ready')
        backups=[]
        for index,item in enumerate(self.plan['backupOriginals']):
            source=self.mapped(item['path']);target=self.e/'backup'/('%03d'%index)
            base.old.copynew(source,target);assert self.pin_ok(target,item)
            backups.append(dict(original=str(source),backup=str(target),bytes=item['bytes'],sha256=item['sha256']))
            self.fault('backup-copied',target)
        self.save_new(self.e/'backups.json',backups);self.fault('backups-ready')
        for item in self.plan['park']:
            target=self.mapped(item['path']);self.safe(target)
            assert self.pin_ok(target,item) and any(x['original']==str(target) and self.pin_ok(Path(x['backup']),x) for x in backups)
            self.record('park:'+str(target),'intent',dict(path=str(target),identity=file_identity(target),sha256=item['sha256']))
            self.fault('park-intent',target);target.unlink();self.fault('park-unlinked',target)
            self.record('park:'+str(target),'complete',dict(removed=True))
        for item in self.plan['newGameFiles']+self.plan['obsFiles']:
            target=self.mapped(item['destination']);self.safe(target)
            if item['kind']=='mutable-obs-existing':
                original=next(x for x in backups if x['original']==str(target))
                assert self.pin_ok(target,original),'Original OBS target changed before replacement'
                self.record('replace:'+str(target),'intent',dict(identity=file_identity(target),sha256=original['sha256']))
                target.unlink();self.fault('replace-unlinked',target)
            self.copy_owned(Path(item['source']),target,item,'install:'+str(target),'install')
        self.save_new(self.e/'installation.json',dict(passed=True,session=self.plan['session'],files=12,gameFiles=9,parked=1,fixture=bool(self.fixture),transactional=True,gameLaunched=False,activeProcessStarted=False))
        self.fault('installation-complete')

    def archive_valid(self,key):
        record=self.recorded(key,'archived')
        if record is None:return None
        item=dict(bytes=record['bytes'],sha256=record['sha256'])
        path=Path(record.get('archive') or record['retainedIdenticalSource'])
        assert self.pin_ok(path,item),'Archived evidence missing or changed'
        if 'archive' in record:assert path.is_relative_to(self.e/'after'),'Archive escaped attempt'
        return record

    def archive(self,target,key,item=None):
        old=self.archive_valid(key)
        if old is not None:
            if target.exists():assert sha(target)==old['sha256'] and target.stat().st_size==old['bytes'],'Target changed after archival'
            return old
        self.safe(target);identity=file_identity(target)
        pin=dict(bytes=target.stat().st_size,sha256=sha(target))
        if item is not None and item['kind']=='immutable-game-new' and pin['bytes']==item['bytes'] and pin['sha256']==item['sha256']:
            assert self.pin_ok(Path(item['source']),pin)
            value=dict(original=str(target),identity=identity,retainedIdenticalSource=item['source'],**pin)
        else:
            archive=self.e/'after'/hashlib.sha256(key.encode()).hexdigest()[:24]
            self.copy_owned(target,archive,pin,'archive-copy:'+key,'archive',resume=True)
            value=dict(original=str(target),identity=identity,archive=str(archive),**pin)
        self.record(key,'archived',value);self.fault('archived',target);return value

    def remove_archived(self,target,key,item=None):
        archived=self.archive_valid(key)
        assert archived is not None,'Removal requires verified retained evidence'
        self.record(key,'remove-intent',dict(path=str(target),sha256=archived['sha256'],bytes=archived['bytes']))
        self.fault('remove-intent',target)
        if target.exists():
            self.safe(target)
            assert target.stat().st_size==archived['bytes'] and sha(target)==archived['sha256'],'Changed target before removal'
            # For immutable targets, replacing an identical file is still unknown provenance.
            if item is not None and item['kind']=='immutable-game-new':assert file_identity(target)==archived['identity'],'Immutable target identity changed'
            target.unlink();self.fault('target-removed',target)
        self.record(key,'removed',dict(absent=True))

    def generated(self):
        generated=[];directories=[]
        known={str(self.mapped(x['destination'])) for x in self.plan['newGameFiles']+self.plan['obsFiles']}
        known_game_dirs={self.game/'scripts/RichAudio.GateAPrivate03C.Evidence'}
        for item in self.plan['newGameFiles']:
            at=self.mapped(item['destination']).parent
            while at!=self.game:known_game_dirs.add(at);at=at.parent
        for folder in [self.game/'mods',self.game/'scripts']:
            if not folder.exists():continue
            for target in folder.rglob('*'):
                self.safe(target)
                if target.is_dir():
                    assert target in known_game_dirs,'Unknown game directory preserved'
                    directories.append(target);continue
                if str(target) in known:continue
                assert re.fullmatch(r'scripts/RichAudio\.GateAPrivate03C\.Evidence/session-[a-f0-9]{32}\.log',target.relative_to(self.game).as_posix()),'Unknown game file preserved'
                generated.append(target)
        core=self.game/'ScriptHookVDotNet.log'
        if core.exists():generated.append(core)
        originals={str(self.mapped(x['path'])) for x in self.plan['originalObs']}
        allowed_obs_dirs=set(self.transaction()['originalObsDirectories'])|{str(self.obs/'logs'),str(self.obs/'profiler_data')}
        for item in self.plan['obsFiles']:
            at=self.mapped(item['destination']).parent
            while at!=self.obs:allowed_obs_dirs.add(str(at));at=at.parent
        for target in self.obs.rglob('*'):
            self.safe(target)
            if target.is_dir():
                assert str(target) in allowed_obs_dirs,'Unknown OBS directory preserved'
                continue
            if str(target) in originals or str(target) in known:continue
            rel=target.relative_to(self.obs).as_posix()
            allowed=rel in ['user.ini.bak','global.ini.bak','basic/profiles/GateAPrivate03CLive01/basic.ini.bak','basic/scenes/GateAPrivate03CLive01.json.bak'] or re.fullmatch(r'(logs/\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.txt|profiler_data/\d{4}-\d{2}-\d{2} \d{2}-\d{2}-\d{2}\.csv\.gz)',rel)
            assert allowed,'Unknown OBS file preserved: '+rel
            generated.append(target)
        return generated,directories

    def restoring_original(self,target):
        key='restore:'+str(target);created=self.recorded(key,'created')
        if created is None or not target.exists():return False
        item=next(x for x in read(self.e/'backups.json') if x['original']==str(target))
        intent=dict(source=item['backup'],target=str(target),bytes=item['bytes'],sha256=item['sha256'],kind='restore')
        assert self.recorded(key,'intent')==intent,'Original recovery intent changed'
        assert self.pin_ok(Path(item['backup']),item),'Original recovery backup changed'
        assert file_identity(target)==created,'Original recovery file identity changed'
        assert prefix_matches(target,Path(item['backup']),item['bytes']),'Original recovery prefix changed'
        return True

    def validate_owned_targets(self):
        allowed={Path(x['path']).name.casefold() for x in self.contract['rootBinaries']}
        allowed.update(self.mapped(x['destination']).name.casefold() for x in self.plan['newGameFiles'] if self.mapped(x['destination']).parent==self.game and self.mapped(x['destination']).suffix.casefold() in ['.dll','.asi'])
        assert not (self.inventory().keys()-allowed),'Unknown root DLL/ASI preserved before recovery'
        permitted_runtime={'mods','scripts','ScriptHookVDotNet.log'}|{self.mapped(x['destination']).name for x in self.plan['newGameFiles'] if self.mapped(x['destination']).parent==self.game}
        for name in self.contract['requiredAbsent']:
            if name not in permitted_runtime:assert not (self.game/name).exists(),'Unexpected loader/cache flag preserved before recovery'
        for item in self.plan['newGameFiles']+self.plan['obsFiles']:
            target=self.mapped(item['destination']);key='install:'+str(target)
            created=self.recorded(key,'created');intent=self.recorded(key,'intent')
            archived=self.archive_valid('new:'+str(target))
            if target.exists():
                if item['kind']=='mutable-obs-existing':
                    original=next(x for x in self.plan['originalObs'] if self.mapped(x['path'])==target)
                    if self.pin_ok(target,original):continue
                    if self.restoring_original(target):continue
                assert created is not None and intent is not None,'New target has no durable exclusive-create proof'
                assert intent==dict(source=item['source'],target=str(target),bytes=item['bytes'],sha256=item['sha256'],kind='install'),'Unexpected installation intent'
                mutable_complete=item['kind'].startswith('mutable-obs-') and (self.e/'installation.json').exists() and self.recorded(key,'complete') is not None
                if not mutable_complete:
                    assert file_identity(target)==created,'New target file identity changed'
                    assert self.pin_ok(Path(item['source']),item) and prefix_matches(target,Path(item['source']),item['bytes']),'Modified/unknown new target; no removal'
                else:file_identity(target)
                if archived is not None:assert target.stat().st_size==archived['bytes'] and sha(target)==archived['sha256'],'Target changed after archive'
            elif created is not None:
                assert self.recorded('new:'+str(target),'remove-intent') is not None and archived is not None,'New target disappeared without recovery evidence'

    def restore_files(self):
        if not self.fixture:base.old.inactive()
        transaction=self.transaction()
        if (self.e/'restoration.json').exists():
            restored=read(self.e/'restoration.json')
            assert restored['passed'] is True and restored['session']==self.plan['session'],'Restoration receipt changed'
            assert self.verify();return
        if not (self.e/'backups.json').exists():
            # This algorithm cannot reach a game mutation before this durable receipt.
            assert not list((self.e/'transaction').glob('*-intent.json')),'Mutation intent exists without backup manifest'
            assert self.verify();self.save_new(self.e/'restoration.json',dict(passed=True,session=self.plan['session'],noTargetMutationStarted=True,fixture=bool(self.fixture)));return
        backups=read(self.e/'backups.json')
        assert len(backups)==len(self.plan['backupOriginals'])
        for index,(backup,original) in enumerate(zip(backups,self.plan['backupOriginals'])):
            assert backup==dict(original=str(self.mapped(original['path'])),backup=str(self.e/'backup'/('%03d'%index)),bytes=original['bytes'],sha256=original['sha256']),'Backup manifest changed'
            assert self.pin_ok(Path(backup['backup']),backup),'Corrupt backup; no mutation'
        for item in self.plan['readOnlyOriginals']:assert self.pin_ok(self.mapped(item['path']),item),'Read-only original/cache drift; no mutation'
        self.validate_owned_targets();generated,directories=self.generated()
        # Validate existing archives before the first deletion in this invocation.
        for record in (self.e/'transaction').glob('*-archived.json'):
            data=read(record);self.archive_valid(data['key'])
        for item in self.plan['newGameFiles']+self.plan['obsFiles']:
            target=self.mapped(item['destination']);key='new:'+str(target)
            if target.exists():
                if item['kind']=='mutable-obs-existing':
                    original=next(x for x in backups if x['original']==str(target))
                    if self.pin_ok(target,original):continue
                    if self.restoring_original(target):continue
                self.archive(target,key,item);self.remove_archived(target,key,item)
            elif self.recorded(key,'remove-intent') is not None:self.remove_archived(target,key,item)
        for target in generated:
            key='generated:'+str(target);self.archive(target,key);self.remove_archived(target,key)
        for item in backups:
            target=Path(item['original']);self.safe(target)
            if self.pin_ok(target,item):continue
            key='restore:'+str(target)
            created=self.recorded(key,'created')
            if target.exists() and created is None:
                assert not any(self.mapped(x['path'])==target for x in self.plan['park']),'Unexpected parked-original replacement preserved'
                archive_key='original:'+str(target);self.archive(target,archive_key);self.remove_archived(target,archive_key)
            self.copy_owned(Path(item['backup']),target,item,key,'restore',resume=True)
        preexisting=set(transaction['preexistingDestinationDirectories'])|set(transaction['originalObsDirectories'])
        for known_runtime in [self.obs/'logs',self.obs/'profiler_data']:
            if known_runtime.exists() and str(known_runtime) not in preexisting:directories.append(known_runtime)
        for item in self.plan['newGameFiles']+self.plan['obsFiles']:
            at=self.mapped(item['destination']).parent
            while at not in [self.game,self.obs]:
                if str(at) not in preexisting:directories.append(at)
                at=at.parent
        for directory in sorted(set(directories),key=lambda p:len(p.parts),reverse=True):
            if str(directory) in preexisting:continue
            self.safe(directory)
            if directory.exists():
                assert not any(directory.iterdir()),'Nonempty created directory preserved'
                directory.rmdir();self.fault('directory-removed',directory)
        assert self.verify()
        self.save_new(self.e/'restoration.json',dict(passed=True,session=self.plan['session'],fixture=bool(self.fixture),originalsVerified=True,transactionalRecovery=True,gameAndObsClosed=True))
        self.fault('restoration-complete')

    def restore(self):
        return self.retirement_scope(self.restore_files)

    def verify(self):
        assert super().verify()
        if (self.e/'transaction.json').exists():
            transaction=self.transaction()
            actual=sorted(str(q) for q in self.obs.rglob('*') if q.is_dir())
            assert actual==transaction['originalObsDirectories'],'OBS directory inventory differs; unknown/preexisting directories preserved'
        return True


def bindings(digest):
    manifest=P/'execution-manifest.json'
    assert re.fullmatch('[a-f0-9]{64}',digest or '') and sha(manifest)==digest,'Exact03C manifest digest required'
    for item in read(manifest)['bindings']:
        path=Path(item['path']);no_links(path)
        assert path.is_file() and path.stat().st_size==item['bytes'] and sha(path)==item['sha256'],'Manifest binding changed: '+str(path)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['preflight','install','restore','verify']);parser.add_argument('--manifest-sha256');parser.add_argument('--approved-manifest-sha256');args=parser.parse_args()
    if args.operation in ['install','restore']:assert args.approved_manifest_sha256,'Fresh explicit approval of exact03C manifest required'
    bindings(args.approved_manifest_sha256 or args.manifest_sha256)
    getattr(Installation(),args.operation)();print('PASS '+args.operation+' PRIVATE03C; no application launched')
