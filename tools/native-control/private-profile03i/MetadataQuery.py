"""One exact native metadata query, durable raw files, no retry or fallback."""
from pathlib import Path
import json,os,re,time,uuid,threading
from Shared import PACKAGE,Context,tc

def response(stdout,stderr,code,args):
    assert code==0,'Native metadata provider failed: '+str(code)
    assert not stderr.strip(),'Unexpected native metadata stderr'
    assert stdout.strip(),'Empty native metadata response; no retry admitted'
    value=json.loads(stdout.decode('utf-8-sig'))
    if args[0]=='--discover':
        assert isinstance(value,list) and all(isinstance(v,dict) and set(v)=={'ProcessId','Name'} and type(v['ProcessId']) is int and v['ProcessId']>0 and v['Name'] in ['GTA5_Enhanced.exe','RAGEPluginHook.exe'] for v in value)
    else:
        keys={'ProcessId','CreationFileTime','CreationUtcTicks','Executable','CanonicalPath','FileIdentity','Sha256'}
        assert isinstance(value,dict) and set(value)==keys,'Incomplete or unexpected metadata fields'
        assert type(value['ProcessId']) is int and value['ProcessId']==int(args[1])
        assert all(type(value[k]) is int and value[k]>0 for k in ['CreationFileTime','CreationUtcTicks'])
        assert value['CreationUtcTicks']==value['CreationFileTime']+504911232000000000,'Native clock conversion mismatch'
        assert isinstance(value['Executable'],str) and Path(value['Executable']).is_absolute() and value['Executable'].casefold()==value['CanonicalPath'].casefold()
        assert re.fullmatch('[0-9a-f]{8}:[0-9a-f]{16}',value['FileIdentity']) and re.fullmatch('[0-9a-f]{64}',value['Sha256'])
    return value

def query(binary,*args):
    expected=Context.contract['programs']['supervisor'];assert Path(binary)==Path(expected['path']);tc.check(expected)
    args=tuple(map(str,args));assert args==('--discover',) or len(args)==2 and args[0]=='--identity' and args[1].isdigit() and int(args[1])>0
    root=PACKAGE/'metadata-queries'/uuid.uuid4().hex;root.mkdir(parents=True);stdout=root/'stdout.bin';stderr=root/'stderr.bin';began=time.monotonic();child=None;code=None;value=None;error=None
    try:
        # Metadata needs no input. Files avoid a shared review-input pipe and
        # preserve the exact response even if decoding or validation fails.
        with stdout.open('xb') as out,stderr.open('xb') as err:
            child=Context.processes.Popen([binary,*args],stdin=Context.processes.DEVNULL,stdout=out,stderr=err,creationflags=Context.processes.CREATE_NO_WINDOW)
            code=child.wait(timeout=3)
            out.flush();err.flush();os.fsync(out.fileno());os.fsync(err.fileno())
        value=response(stdout.read_bytes(),stderr.read_bytes(),code,args)
        return value
    except BaseException as failure:
        error=type(failure).__name__+': '+str(failure);raise
    finally:
        complete=child is not None and child.poll() is not None
        # A timeout preserves its exact owned PID; it never kills or retries it.
        tc.save(root/'receipt.json',dict(schema=1,binary=expected,args=args,callerPid=os.getpid(),callerThread=threading.get_ident(),queryPid=child.pid if child else None,exitCode=code,normalQueryClosure=complete,elapsedSeconds=time.monotonic()-began,stdout=tc.pin(stdout),stderr=tc.pin(stderr),accepted=value is not None,error=error,retries=0,forcedTerminationIssued=False))
