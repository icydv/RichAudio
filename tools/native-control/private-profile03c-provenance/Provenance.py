"""Exact reviewed Git transition plus independent byte identities; no live action."""
from pathlib import Path
import json,hashlib,subprocess,re
ROOT=Path(__file__).resolve().parents[3]
PACKAGE=ROOT/'.local/gate-a-shvdne-private-03c-provenance-01'
ORIGINAL=ROOT/'.local/gate-a-shvdne-private-03c'
BASE='8f1900c47a00d3622b07e929d78b74753d1af692'
FOUR=('7ce78f8f846c5d6a77ec0fd0505f5e99d2577906','d70b19f5d9657ab151f858ac2cee5697102876f7','ab67cb07ac359dd44f478a1bdefc180f89383b53','f48cc0a105ba120af51cdcd2092238f607cc3674')
ORIGINAL_SHA='6b3e34811ad3aac1dcfc629e22733171d6fcf70b3de9b0cf2e645bdb86732087'
CORRECTION_FILES=tuple(sorted(('docs/GATE_A_SHVDNE_PRIVATE_03C_PROVENANCE.md','tests/Test-PrivateProvenance03C.py','tools/native-control/private-profile03c-provenance/Provenance.py','tools/native-control/private-profile03c-provenance/Manage-Installation.py','tools/native-control/private-profile03c-provenance/Watch-AuthorizedGame.py')))

def read(path):return json.loads(Path(path).read_text(encoding='utf-8-sig'))
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as file:
        for block in iter(lambda:file.read(1048576),b''):h.update(block)
    return h.hexdigest()
def no_links(path):
    for q in [Path(path),*Path(path).parents]:
        if q.exists():assert not q.lstat().st_file_attributes&0x400,'Reparse path refused: '+str(q)
def verify_pin(path,item):
    path=Path(path);no_links(path)
    assert path.is_file() and path.stat().st_size==item['bytes'] and sha(path)==item['sha256'],'Changed/missing bound file: '+str(path)
def git(repo,*args):return subprocess.check_output(['git','--no-replace-objects',*args],cwd=repo)
def tree(repo,commit):
    result={}
    for row in git(repo,'ls-tree','-r','-z',commit).split(b'\0'):
        if not row:continue
        metadata,name=row.split(b'\t',1);mode,kind,blob=metadata.decode().split()
        result[name.decode()]=(mode,kind,blob)
    return result

def verify_provenance(policy=None,repo=ROOT):
    """No arbitrary descendants, clean-tree equivalence, normalization or HEAD substitution."""
    policy=read(PACKAGE/'provenance-policy.json') if policy is None else policy
    repo=Path(repo).resolve()
    assert policy['schema']=='Private03CExactCommittedProvenance01'
    assert policy['originalHead']==BASE and policy['authorizedFour']==list(FOUR) and policy['originalManifestSha256']==ORIGINAL_SHA
    assert sha(ORIGINAL/'execution-manifest.json')==ORIGINAL_SHA,'Original seal changed'
    assert git(repo,'branch','--show-current').decode().strip()=='feature/migration-shvdne-01','Wrong branch'
    head=git(repo,'rev-parse','HEAD').decode().strip()
    assert head==policy['expectedHead'],'Unapproved Git HEAD'
    assert not git(repo,'status','--porcelain=v1','--untracked-files=all').strip(),'Dirty working tree'
    correction=policy['correction'];sequence=list(FOUR)
    if correction is None:
        assert head==FOUR[-1]
    else:
        assert re.fullmatch('[a-f0-9]{40}',correction['commit']) and correction['parent']==FOUR[-1]
        assert sorted(correction['files'])==list(CORRECTION_FILES),'Correction scope changed'
        assert head==correction['commit'];sequence.append(head)
        rows=git(repo,'diff-tree','--no-commit-id','--name-status','-r',head).decode().splitlines()
        assert sorted(rows)==['A\t'+name for name in CORRECTION_FILES],'Correction commit changed pre-existing files'
    ancestry=git(repo,'rev-list','--reverse','--parents',BASE+'..HEAD').decode().splitlines()
    assert len(ancestry)==len(sequence),'Unexpected commit ancestry'
    parent=BASE
    for row,wanted in zip(ancestry,sequence):
        assert row.split()==[wanted,parent],'Unexpected/merged commit ancestry';parent=wanted
    original=read(ORIGINAL/'execution-manifest.json')
    pins={str(Path(x['path']).relative_to(ROOT)).replace('\\','/'):x for x in original['bindings'] if Path(x['path']).is_relative_to(ROOT) and '.local' not in Path(x['path']).relative_to(ROOT).parts}
    assert sorted(policy['criticalSources'])==sorted(pins),'Incomplete original source closure'
    oldtree=tree(repo,FOUR[-1]);current=tree(repo,head)
    for relative,item in pins.items():
        expected=policy['criticalSources'][relative]
        assert expected['sha256']==item['sha256'] and expected['bytes']==item['bytes'],'Original source fingerprint substituted'
        assert oldtree[relative][1]=='blob' and expected['gitBlob']==oldtree[relative][2]==current[relative][2],'Committed source identity changed'
        verify_pin(repo/relative,item) # Raw sealed SHA remains mandatory even with core.autocrlf.
    if correction is not None:
        for relative,item in correction['files'].items():
            assert current[relative][1]=='blob' and current[relative][2]==item['gitBlob'],'Correction blob changed'
            verify_pin(repo/relative,item)
    return dict(passed=True,head=head,originalHead=BASE,reviewedCommits=sequence,criticalSourcesVerified=len(pins),workingTreeClean=True)

def verify_manifest(digest,path=None):
    path=PACKAGE/'execution-manifest.json' if path is None else Path(path)
    assert re.fullmatch('[a-f0-9]{64}',digest or '') and sha(path)==digest,'Exact new provenance manifest digest required; old approvals are not accepted'
    value=read(path)
    assert value['experiment']=='GATE-A-SHVDNE-PRIVATE-03C' and value['revision']=='provenance-01'
    assert value['originalManifestSha256']==ORIGINAL_SHA
    for item in value['bindings']:verify_pin(item['path'],item)
    return value
