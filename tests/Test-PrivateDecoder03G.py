"""Actual retained1080p H264/AAC: old PCM/timeline versus bounded batch decode."""
from pathlib import Path
import sys,time,uuid,shutil,json
R=Path(__file__).resolve().parents[1];sys.path.insert(0,str(R/'tools/native-control/private-profile03g'));sys.dont_write_bytecode=True
from Shared import tc,PACKAGE,load,configure
from DecodeWindows import Snapshot,decode
c=tc.load(tc.sha(PACKAGE/'toolchain-manifest.json'));configure(c,True)
reference=load('comparison_old03c',R/'tools/native-control/private-profile03c/Extract-Capture03C.py')
T=PACKAGE/'fixtures'/('decoder-equivalence-'+uuid.uuid4().hex);T.mkdir();reference.P=T;(T/'execution-01').mkdir();records=[]
for duration in [30,60,89]:
    source=T/'execution-01'/('retained-'+str(duration)+'.mkv');shutil.copyfile(PACKAGE/('fixtures/media/retained-keyed-'+str(duration)+'s.mkv'),source)
    windows=dict(A=dict(start=3.,duration=6.),B=dict(start=18.,duration=6.));old={};began=time.monotonic()
    for role,w in windows.items():old[role]=reference.extract(source,T/'execution-01'/('old-'+str(duration)+role+'.wav'),w['start'],w['duration'],False)
    baseline_seconds=time.monotonic()-began
    for reverse in [False,True]:
        target=T/('new-'+str(duration)+'-'+str(reverse));target.mkdir();snap=Snapshot(source,T);began=time.monotonic()
        try:new=decode(snap,dict(reversed(list(windows.items()))) if reverse else windows,target,lambda:None)
        finally:snap.close()
        for role in windows:
            assert new[role]['output']['sha256']==old[role]['outputSha256'],'Decoded PCM/header changed'
            assert new[role]['timeline']==old[role]['timeline'],'Frozen timeline decision/operands changed'
        records.append(dict(duration=duration,source=tc.pin(source),reverse=reverse,baselineTwoDecodesSeconds=baseline_seconds,candidateSingleDecodeSeconds=time.monotonic()-began,identicalWavBytes=True,identicalTimeline=True,roles={r:new[r]['output'] for r in windows}))
        print(json.dumps(records[-1]),flush=True)
tc.save(T/'result.json',dict(passed=True,cases=len(records),records=records,videoThreads=4,unchangedPolicy=True,gameLaunched=False))
