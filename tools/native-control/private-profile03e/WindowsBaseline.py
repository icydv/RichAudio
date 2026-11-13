"""Explicitly qualified Windows bytes; never an automatic servicing exception."""
from pathlib import Path
import ctypes,hashlib,json,msvcrt,os,struct,subprocess
ROOT=Path(__file__).resolve().parents[3]
PACKAGE=ROOT/'.local/gate-a-shvdne-private-03e'
SOURCE=Path(__file__).resolve().parent
SERVICED=set('advapi32.dll bcrypt.dll cfgmgr32.dll crypt32.dll dsound.dll imm32.dll iphlpapi.dll kernel32.dll mf.dll mfplat.dll mfreadwrite.dll ole32.dll oleaut32.dll propsys.dll rpcrt4.dll setupapi.dll shell32.dll user32.dll wininet.dll winmm.dll wintrust.dll ws2_32.dll'.split())
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1048576),b''):h.update(b)
    return h.hexdigest()
def save(p,v):
    with Path(p).open('x',encoding='utf-8') as f:json.dump(v,f,indent=2)
def identity(path):
    path=Path(path)
    with path.open('rb') as file:
        stat=os.fstat(file.fileno());buf=ctypes.create_unicode_buffer(32768)
        fn=ctypes.windll.kernel32.GetFinalPathNameByHandleW
        fn.argtypes=[ctypes.c_void_p,ctypes.c_wchar_p,ctypes.c_uint,ctypes.c_uint];fn.restype=ctypes.c_uint
        n=fn(ctypes.c_void_p(msvcrt.get_osfhandle(file.fileno())),buf,len(buf),0)
        assert 0<n<len(buf),'Canonical file identity unavailable'
        canonical=buf.value
        if canonical.startswith('\\\\?\\'):canonical=canonical[4:]
        return dict(canonicalPath=canonical.casefold(),device=stat.st_dev,inode=stat.st_ino,birthNs=stat.st_birthtime_ns,links=stat.st_nlink)
def machine(path):
    with Path(path).open('rb') as f:
        assert f.read(2)==b'MZ';f.seek(0x3c);offset=struct.unpack('<I',f.read(4))[0];f.seek(offset);assert f.read(4)==b'PE\0\0';return hex(struct.unpack('<H',f.read(2))[0])
def collect(output):
    output=Path(output);assert output.is_relative_to(PACKAGE) and not output.exists();output.mkdir(parents=True)
    paths=read(PACKAGE/'evidence/windows-paths.json');save(output/'paths.json',paths)
    subprocess.run(['pwsh','-NoProfile','-File',str(SOURCE/'Inspect-Windows.ps1'),'-PathsFile',str(output/'paths.json'),'-Output',str(output/'files.json')],check=True)
    subprocess.run(['pwsh','-NoProfile','-File',str(SOURCE/'Inspect-Servicing.ps1'),'-Output',str(output/'servicing.json')],check=True)
    exe=PACKAGE/'evidence/CatalogEvidence.exe'
    with (output/'membership.json').open('x') as file:subprocess.run([str(exe),str(output/'paths.json')],stdout=file,check=True,text=True)
    memberships=read(output/'membership.json');catalogs=sorted({p for x in memberships for p in x['catalogs']});save(output/'catalog-paths.json',catalogs)
    subprocess.run(['pwsh','-NoProfile','-File',str(SOURCE/'Inspect-Windows.ps1'),'-PathsFile',str(output/'catalog-paths.json'),'-Output',str(output/'catalogs.json')],check=True)
    cat={x['path'].casefold():x for x in read(output/'catalogs.json')};member={x['path'].casefold():x for x in memberships}
    rows=[]
    for row in read(output/'files.json'):
        p=Path(row['path']);assert sha(p)==row['sha256'] and p.stat().st_size==row['bytes'],'Changed during qualification'
        links=sorted(str(Path(p.drive+x)).casefold() for x in row['hardlinks'] if '\\winsxs\\' in x.casefold())
        components=[]
        for link in links:
            q=Path(link);assert identity(q)['inode']==identity(p)['inode'] and identity(q)['device']==identity(p)['device'],'Different component file'
            manifest=Path(p.drive+'/Windows/WinSxS/Manifests')/(q.parent.name+'.manifest')
            assert manifest.is_file(),'Component manifest absent'
            components.append(dict(path=link,assembly=q.parent.name,manifest=dict(path=str(manifest),bytes=manifest.stat().st_size,sha256=sha(manifest))))
        catalogs=[]
        for path in member[str(p).casefold()]['catalogs']:
            c=cat[path.casefold()];catalogs.append(dict(path=c['path'].casefold(),bytes=c['bytes'],sha256=c['sha256'],identity=identity(path),signature=c['signature']))
        row.update(identity=identity(p),machine=machine(p),components=components,catalogs=catalogs,memberHash=member[str(p).casefold()]['memberHash'])
        rows.append(row)
    result=dict(schema='Private03EWindowsExactBaseline01',os=read(output/'servicing.json')['os'],servicingRebootPending=read(output/'servicing.json')['servicingRebootPending'],updateRebootPending=read(output/'servicing.json')['updateRebootPending'],files=rows)
    save(output/'baseline.json',result);return result

def trusted(signature):
    assert signature['status']=='Valid' and signature['isOsBinary'] is True,'Unverified Windows signature'
    assert signature['subject']=='CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US','Wrong Windows publisher'
    assert signature['chainOfflineBuilt'] is True and not signature['chainStatus'],'Untrusted offline certificate chain'
    assert signature['chain'][-1]['thumbprint']=='3B1EFD3A66EA28B16697394703A72CA340A05BD5','Unreviewed root anchor'

def compare(expected,observed):
    """Exact reviewed OS/components, raw hashes and identities. No future fallback."""
    assert expected['schema']==observed['schema']=='Private03EWindowsExactBaseline01'
    for key in ['os','servicingRebootPending','updateRebootPending']:assert observed[key]==expected[key],'Windows environment drift: '+key
    assert not observed['servicingRebootPending'] and not observed['updateRebootPending'],'Servicing restart pending'
    assert [x['path'].casefold() for x in observed['files']]==[x['path'].casefold() for x in expected['files']],'Windows dependency set changed'
    for e,o in zip(expected['files'],observed['files']):
        assert str(Path(o['path']).parent).casefold()==r'c:\windows\system32' and o['identity']['canonicalPath']==str(Path(o['path'])).casefold(),'Unexpected canonical location'
        for key in ['bytes','sha256','fileVersion','productVersion','identity','machine','components','memberHash']:
            assert o[key]==e[key],'Windows dependency drift: '+o['path']+' '+key
        assert o['machine']=='0x8664','Wrong architecture'
        # Only the22 explicitly reviewed servicing changes receive a new byte
        # baseline. Other modules retain their historical exact hashes.
        if Path(o['path']).name.casefold() in SERVICED:
            trusted(o['signature']);assert o['components'],'Missing reviewed OS component'
        else:
            history=read(ROOT/'.local/gate-a-shvdne-private-03d/loader-contract.json')
            original=next(x for x in history['nativeImportCandidates'] if x['path'].casefold()==o['path'].casefold())
            assert o['sha256']==original['sha256'] and o['bytes']==original['bytes'],'Unsupported additional replacement'
            # Windows Authenticode/catalog verification includes the trusted
            # signing timestamp. Present-day X509Chain expiry is retained as
            # evidence; it does not override WinVerifyTrust's Valid result.
            assert o['signature']['status']=='Valid','Unverified unchanged prerequisite'
        for key in ['status','type','isOsBinary','subject','issuer','thumbprint','chainOfflineBuilt','chainStatus','chain']:
            assert o['signature'][key]==e['signature'][key],'Signature identity drift'
        assert len(o['catalogs'])==len(e['catalogs']) and o['catalogs'],'Missing catalog membership'
        for ec,oc in zip(e['catalogs'],o['catalogs']):
            for key in ['path','bytes','sha256','identity']:assert oc[key]==ec[key],'Catalog drift'
            assert oc['signature']['status']=='Valid','Invalid catalog signature'
            assert oc['signature']['chainOfflineBuilt']==ec['signature']['chainOfflineBuilt'] and oc['signature']['chainStatus']==ec['signature']['chainStatus'],'Catalog chain drift'
            assert oc['signature']['thumbprint']==ec['signature']['thumbprint'] and oc['signature']['subject']==ec['signature']['subject'],'Catalog publisher drift'
    return True
