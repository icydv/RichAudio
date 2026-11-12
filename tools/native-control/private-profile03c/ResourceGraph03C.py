"""Semantic closure checks over the actual-byte-bound resource/registration snapshot."""
import collections,xml.etree.ElementTree as ET

def joaat(text):
    h=0
    for b in text.lower().encode('utf-8'):
        h=(h+b)&0xffffffff;h=(h+(h<<10))&0xffffffff;h^=h>>6
    h=(h+(h<<3))&0xffffffff;h^=h>>11;h=(h+(h<<15))&0xffffffff
    return f'{h:08x}'

def ref(text):
    return text[5:].lower() if text.lower().startswith('hash_') and len(text)==13 else joaat(text)

def validate(s):
    m=s['resourceManifest'];ns=s['namespaceAudit'];dependency=s['dependencyAudit']
    names={'profile':m['profileName'],'list':'ra_gapriv01_horns','multitrack':'ra_gapriv01_horn','simple':'ra_gapriv01_marker_sound','container':m['containerName'],'stream':m['streamName']}
    hashes={k:joaat(v) for k,v in names.items()}
    assert hashes==ns['privateHashes'] and hashes['profile']==m['profileHash']=='dd89929d','Private identity/hash mismatch'
    assert len(set(hashes.values()))==6 and ns['collisions']==0,'Introduced collision'
    assert f"{int(hashes['stream'],16)&0x1fffffff:08x}"==m['maskedAwcStream']==ns['maskedAwcStream']=='033ff581','AWC29 identity mismatch'
    g=ET.fromstring(s['relXml']['ra_private01_game.dat151.rel']);sound=ET.fromstring(s['relXml']['ra_private01_sounds.dat54.rel'])
    records=g.findall('./Items/Item')+sound.findall('./Items/Item')
    ids=[r.findtext('Name') for r in records]
    assert len(ids)==4 and len(set(ids))==4 and set(ids)==set(list(names.values())[:4]),'Missing/duplicate/private record identity'
    by={r.findtext('Name'):r for r in records}
    expected={'profile':'Vehicle','list':'SoundHashList','multitrack':'MultitrackSound','simple':'SimpleSound'}
    for key,kind in expected.items():assert by[names[key]].attrib['type']==kind,'Record type mismatch'
    vehicle=by[names['profile']];lst=by[names['list']];multi=by[names['multitrack']];simple=by[names['simple']]
    assert vehicle.findtext('Horns')==names['list'],'Missing horn list link'
    assert [n.text for n in lst.findall('./SoundHashes/Item')]==[names['multitrack'],names['simple']],'List branch closure'
    assert [n.text for n in multi.findall('./ChildSounds/Item')]==[names['simple'],'hash_27890BBA'],'Private/stock child closure'
    assert simple.findtext('ContainerName')==names['container'] and simple.findtext('FileName')==names['stream'] and simple.find('WaveSlotIndex').attrib['value']=='0','Wave reference closure'
    assert sound.findtext('./ContainerPaths/Item')==names['container'].upper().replace('/','\\'),'ContainerPaths convention'
    assert ref(vehicle.findtext('Engine'))=='a46d1b50' and ref(vehicle.findtext('EngineGranular'))=='61f3bd06','Shared stock engine changed'
    external=[]
    for record in records:
        for leaf in record.iter():
            if len(leaf) or 'value' in leaf.attrib or leaf.tag=='Name' or not leaf.text:continue
            if ref(leaf.text) not in hashes.values():external.append((record.findtext('Name'),leaf.tag,ref(leaf.text)))
    audited=dependency['externalDependencies']
    assert collections.Counter(external)==collections.Counter((x['record'],x['field'],x['hash']) for x in audited),'External reference audit differs'
    assert len(audited)==37 and all(x['preserved'] and x['retainedMetadataMatches'] and x['resolution']=='retained-stock-metadata' for x in audited),'Missing external stock dependency evidence'
    bati=dependency['preservedBati']
    assert bati['EngineRecord']['Hash']=='A46D1B50' and bati['GranularRecord']['Hash']=='61F3BD06','Stock channel identity'
    assert all(bati['Sounds'].get(k) for k in ('EngineAccel','ExhaustAccel','EngineAccelNPC','ExhaustAccelNPC')),'Missing player/NPC channel references'
    assert len(dependency['relocations'])==6 and dependency['privateClosureComplete'] and not dependency['wholeStockDependencyClosureRequalified'],'Relocation scope or unsupported transitive claim'
    pack=m['packName'];device=m['deviceName'];wave=m['waveFolder']
    assert pack=='ra_private01_6a13f902' and device==wave=='dlc_'+pack and names['container']==wave+'/ra_private01_marker','Wavepack directory relationship'
    setup=ET.fromstring(s['setupXml']);content=ET.fromstring(s['contentXml'])
    assert setup.findtext('deviceName')==device and setup.findtext('datFile')=='content.xml','Setup device/content binding'
    group=setup.findall('./contentChangeSetGroups/Item');assert len(group)==1 and group[0].findtext('NameHash')=='GROUP_STARTUP','Startup group'
    change=pack+'_STARTUP';assert [x.text for x in group[0].findall('./ContentChangeSets/Item')]==[change],'Startup change binding'
    logical=[device+':/x64/audio/config/ra_private01_game.dat',device+':/x64/audio/config/ra_private01_sounds.dat',device+':/x64/audio/sfx/'+wave]
    items=content.findall('./dataFiles/Item');assert len(items)==3,'Resource registration count'
    assert [x.findtext('filename') for x in items]==logical and [x.findtext('fileType') for x in items]==['AUDIO_GAMEDATA','AUDIO_SOUNDDATA','AUDIO_WAVEPACK'],'Registration logical names/types'
    assert all(x.find('disabled').attrib['value']=='true' and x.find('persistent').attrib['value']=='false' for x in items),'Registration activation defaults'
    changes=content.findall('./contentChangeSets/Item');assert len(changes)==1 and changes[0].findtext('changeSetName')==change and [x.text for x in changes[0].findall('./filesToEnable/Item')]==logical,'Enabled registration closure'
    assert not changes[0].findall('./unregisterResources/*'),'Unexpected resource unregistration'
    paths={'dlc.rpf\\setup2.xml','dlc.rpf\\content.xml','dlc.rpf\\x64\\audio\\config\\ra_private01_game.dat151.rel','dlc.rpf\\x64\\audio\\config\\ra_private01_sounds.dat54.rel','dlc.rpf\\x64\\audio\\sfx\\'+wave+'\\ra_private01_marker.awc'}
    members=s['actualDlcMembers'];assert len(members)==5 and {x['path'] for x in members}==paths,'Physical DLC archive layout'
    for x in m['files']:
        assert len([y for y in members if y['name']==x['path'] and y['sha256']==x['sha256'] and y['bytes']==x['bytes']])==1,'Packed resource payload mismatch'
    original=[x.text for x in ET.fromstring(s['originalDlcList']).findall('./Paths/Item')];candidate=[x.text for x in ET.fromstring(s['candidateDlcList']).findall('./Paths/Item')]
    mount='dlcpacks:/'+pack+'/'
    assert len(original)==103 and candidate==original+[mount] and candidate.count(mount)==1,'Private DLC list append/order'
    shadow=s['shadowReceipt'];assert shadow['entries']==1790 and shadow['untouchedEntriesVerified']==1789 and shadow['sourceUnchanged'] and shadow['appendedMount']==mount,'Complete shadow contract'
    changes=s['shadowChangedMembers'];assert len(changes)==1 and changes[0]['original']['path']==changes[0]['candidate']['path']=='update\\update.rpf\\common\\data\\dlclist.xml','Shared archive preservation'
    assert s['runtimeMounted'] is False and not s['resourceBytesRebuilt'] and not s['gameWritten'],'Offline proof scope'
    return dict(privateRecords=4,relocations=6,externalStockOccurrences=37,playerNpcRoutesPreserved=True,dlcFiles=5,originalDlcDeclarations=103,appendedDlcDeclarations=1,completeShadowEntries=1790,runtimeRegistrationVerified=False)
