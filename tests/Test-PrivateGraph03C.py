from pathlib import Path
import sys,importlib.util,json,copy,xml.etree.ElementTree as ET,hashlib
sys.dont_write_bytecode=True
R=Path(__file__).resolve().parents[1];P=R/'.local/gate-a-shvdne-private-03c/resource-probe/resource-graph-01'
spec=importlib.util.spec_from_file_location('graph03c',R/'tools/native-control/private-profile03c/ResourceGraph03C.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
source=P/'graph-snapshot.json';snapshot=json.loads(source.read_text(encoding='utf-8-sig'));cases=[]
summary=m.validate(snapshot);cases.append('actual-byte-bound-four-record-graph-and-packed-registration-valid')
def xml(s,key,selector,value=None,attribute=None,remove=False):
    root=ET.fromstring(s[key]);node=root.find(selector)
    assert node is not None,selector
    if remove:
        parent=next(x for x in root.iter() if node in list(x));parent.remove(node)
    elif attribute:node.set(attribute,value)
    else:node.text=value
    s[key]=ET.tostring(root,encoding='unicode')
def rel(s,file,selector,value=None,attribute=None,remove=False):xml(s['relXml'],file,selector,value,attribute,remove)
g='ra_private01_game.dat151.rel';d='ra_private01_sounds.dat54.rel'
def reject(name,change):
    x=copy.deepcopy(snapshot);change(x)
    try:m.validate(x)
    except (AssertionError,KeyError,AttributeError,ET.ParseError):cases.append(name)
    else:raise AssertionError('Accepted invalid graph: '+name)
reject('wrong-profile-name-or-JOAAT',lambda s:s['resourceManifest'].update(profileName='adder'))
reject('full-hash-collision-evidence-refused',lambda s:s['namespaceAudit'].update(collisions=1))
reject('masked-AWC29-collision-or-identity-refused',lambda s:s['resourceManifest'].update(maskedAwcStream='00000001'))
reject('missing-private-record',lambda s:rel(s,d,'./Items/Item',remove=True))
reject('wrong-DAT151-record-type',lambda s:rel(s,g,'./Items/Item',value='VehicleEngine',attribute='type'))
reject('broken-vehicle-horn-link',lambda s:rel(s,g,'./Items/Item/Horns','missing_private_horn'))
reject('broken-private-list-reference',lambda s:rel(s,d,'./Items/Item/SoundHashes/Item','missing_private_child'))
reject('broken-private-multitrack-reference',lambda s:rel(s,d,"./Items/Item[@type='MultitrackSound']/ChildSounds/Item",'missing_marker'))
reject('missing-wave-stream-reference',lambda s:rel(s,d,"./Items/Item[@type='SimpleSound']/FileName",'missing_stream'))
reject('wrong-wave-slot',lambda s:rel(s,d,"./Items/Item[@type='SimpleSound']/WaveSlotIndex",value='1',attribute='value'))
reject('wrong-container-path-convention',lambda s:rel(s,d,'./ContainerPaths/Item','other_pack/bank'))
reject('shared-stock-engine-mutation',lambda s:rel(s,g,'./Items/Item/Engine','hash_00000001'))
reject('missing-external-stock-dependency-evidence',lambda s:s['dependencyAudit']['externalDependencies'].pop())
reject('unresolved-external-stock-reference',lambda s:s['dependencyAudit']['externalDependencies'][0].update(retainedMetadataMatches=[]))
reject('missing-NPC-reference-evidence',lambda s:s['dependencyAudit']['preservedBati']['Sounds'].pop('EngineAccelNPC'))
reject('undeclared-relocation',lambda s:s['dependencyAudit']['relocations'].pop())
reject('wrong-wavepack-directory',lambda s:s['resourceManifest'].update(waveFolder='other_wavepack'))
reject('wrong-setup-device',lambda s:xml(s,'setupXml','./deviceName','other_device'))
reject('missing-startup-registration-group',lambda s:xml(s,'setupXml','./contentChangeSetGroups/Item',remove=True))
reject('physical-REL-suffix-in-logical-declaration',lambda s:xml(s,'contentXml','./dataFiles/Item/filename','dlc_ra_private01_6a13f902:/x64/audio/config/ra_private01_game.dat151.rel'))
reject('wrong-registration-type',lambda s:xml(s,'contentXml','./dataFiles/Item/fileType','AUDIO_WAVEPACK'))
reject('missing-change-set-file-enable',lambda s:xml(s,'contentXml','./contentChangeSets/Item/filesToEnable/Item',remove=True))
reject('wrong-packed-AWC-directory',lambda s:s['actualDlcMembers'][-1].update(path='dlc.rpf\\wrong\\ra_private01_marker.awc'))
reject('modified-packed-resource-hash',lambda s:next(x for x in s['actualDlcMembers'] if x['name'].endswith('.awc')).update(sha256='0'*64))
reject('missing-private-DLC-list-declaration',lambda s:xml(s,'candidateDlcList','./Paths/Item',remove=True))
reject('unrelated-shadow-member-change',lambda s:s['shadowChangedMembers'].append(copy.deepcopy(s['shadowChangedMembers'][0])))
reject('false-runtime-registration-claim',lambda s:s.update(runtimeMounted=True))
receipt=dict(passed=True,count=len(cases),cases=cases,summary=summary,snapshotSha256=hashlib.sha256(source.read_bytes()).hexdigest(),graphValidatorSha256=hashlib.sha256((R/'tools/native-control/private-profile03c/ResourceGraph03C.py').read_bytes()).hexdigest(),originalResourcesChanged=False,gameWritten=False,scope='Actual canonical byte-bound snapshot plus authored semantic negative mutations; no archive or audio regeneration')
with (P/'test-results.json').open('x',encoding='utf-8') as f:json.dump(receipt,f,indent=2)
print('PASS '+str(len(cases))+' actual graph/registration semantic cases')
