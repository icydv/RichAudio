"""Actual installed OBS writer, private collection, generated local audio only."""
from pathlib import Path
import array,copy,importlib.util,json,math,os,subprocess,sys,time,uuid,wave
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
def mod(name,path):
    s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
op=mod('operator09',HERE/'Operator09.py');gate=mod('readiness09',HERE/'Readiness09.py')
def run(root):
    root=Path(root);profile='NativeSuppression09Offline';obsroot=Path(os.environ['APPDATA'])/'obs-studio';repo=HERE.parents[2]
    session=uuid.uuid4().hex;(root/'operator').mkdir();(root/'capture').mkdir()
    (root/'operator/activation.lock').write_text(session+' 0 0')
    tone=root/'generated.wav';samples=array.array('h')
    for i in range(48000*4):
        value=round(1000*math.sin(2*math.pi*220*i/48000));samples.extend([value,value])
    with wave.open(str(tone),'wb') as f:f.setnchannels(2);f.setsampwidth(2);f.setframerate(48000);f.writeframes(samples)
    source_lua=HERE/'Recorder09.lua';lua=source_lua.read_text();lua=lua.replace(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-09',str(root)).replace('NativeSuppression01Live09',profile)
    a=lua.index('local function graph(data)');b=lua.index('local function state()')
    lua=lua[:a]+'''local function graph(data)
 local valid=obs.obs_frontend_get_current_profile()==PROFILE and obs.obs_frontend_get_current_scene_collection()==PROFILE
 valid=valid and not obs.obs_frontend_streaming_active() and not obs.obs_frontend_virtualcam_active()
 local sources=obs.obs_enum_sources();local count=0
 for _,source in ipairs(sources or {}) do
  local id=obs.obs_source_get_id(source)
  if id~='scene' and id~='group' then count=count+1;valid=valid and id=='ffmpeg_source' and obs.obs_source_get_name(source)=='Generated fixture' and not obs.obs_source_muted(source) and obs.obs_source_get_monitoring_type(source)==0 and obs.obs_source_get_audio_mixers(source)==1 end
 end
 obs.source_list_release(sources)
 obs.obs_data_set_bool(data,'GraphValid',valid and count==1);obs.obs_data_set_string(data,'Profile',obs.obs_frontend_get_current_profile());obs.obs_data_set_string(data,'Collection',obs.obs_frontend_get_current_scene_collection())
 return valid and count==1
end
''' +lua[b:]
    script=root/'OfflineRecorder09.lua';script.write_text(lua)
    old=repo/'.local/native-suppression-01/candidate-08/capture-settings'
    basic=(old/'basic.ini').read_text();basic=basic.replace('NativeSuppression01Live08',profile).replace(str(Path(r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-08\capture')).replace('\\','\\\\'),str(root/'capture').replace('\\','\\\\'))
    target_profile=obsroot/'basic/profiles'/profile;target_scene=obsroot/'basic/scenes'/(profile+'.json');assert not target_profile.exists() and not target_scene.exists()
    target_profile.mkdir();(target_profile/'basic.ini').write_text(basic)
    scene=json.loads((old/'NativeSuppression01Live08.json').read_text());scene['name']=profile
    for key in list(scene):
        if key.startswith('DesktopAudioDevice') or key.startswith('AuxAudioDevice'):scene[key]=None
    src=scene['sources'][0];src.update(name='Generated fixture',id='ffmpeg_source',versioned_id='ffmpeg_source',settings=dict(is_local_file=True,local_file=str(tone),looping=True,restart_on_activate=False,clear_on_media_end=False),mixers=1,monitoring_type=0,monitoring_enabled=False)
    scene['sources'][1]['settings']['items'][0]['name']='Generated fixture';scene['modules']['scripts-tool']=[dict(path=str(script).replace('\\','/'),settings={})]
    target_scene.write_text(json.dumps(scene,indent=2));(root/'fixture-adaptation.json').write_text(json.dumps(dict(productionRecorder=str(source_lua),productionSha256=op.sha(source_lua),fixtureRecorder=str(script),fixtureSha256=op.sha(script),changes=['fixed private root/profile','fixture-only graph accepts one local ffmpeg source; no desktop/microphone capture; monitoring disabled'],sourceByteIdentityBeforeAndAfter=True),indent=2))
    exe=Path(r'C:\Program Files\obs-studio\bin\64bit\obs64.exe');child=subprocess.Popen([str(exe),'--profile',profile,'--collection',profile],cwd=str(exe.parent),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    identity=op.ProcessIdentity(child.pid,None,exe,op.sha(exe));rec=op.LocalRecorder(root,session);result=None
    try:
        until=time.monotonic()+20
        while time.monotonic()<until:
            try:state=rec.snapshot();break
            except (OSError,AssertionError):time.sleep(.1)
        assert state['GraphValid'],'private generated-media graph refused'
        rec.call('StartRecord');origin,evidence=op.recording_origin(dict(ObsLogs=str(obsroot/'logs')),rec)
        paths=list((root/'capture').glob('*.mkv'));until=time.monotonic()+2
        while not paths and time.monotonic()<until:time.sleep(.05);paths=list((root/'capture').glob('*.mkv'))
        assert len(paths)==1,'one actual OBS output'
        recording=uuid.uuid4().hex;plan=dict(Root=str(root),Output=str(root/'analysis/recorder-readiness'),Source=str(paths[0]),Session=session,Observation='recorder-readiness',Phase='recorder-readiness',Generation='unspawned',Recording=recording,Profile='NONE',ActiveStartSeconds=0,Windows=[dict(Name='ready',StartSeconds=1)],Dependencies=r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\gate-a-shvdne-private-03b\capture-dependencies.json',DependenciesSha256='4656785f5833c9f26a5dc4218b8e6e3b3e88008ae46f816c1fa516512671446b',Frequency=op.frequency(),OriginQpc=origin,AdmissionDeadlineQpc=origin+50*op.frequency())
        op.atomic(root/'readiness-plan.json',plan,True);seq=0
        def context():
            nonlocal seq
            s=rec.snapshot();assert s['RecordingActive'] and not s['Failed'] and s['GraphValid'],'actual recorder still active'
            seq+=1;op.atomic(root/'operator/capture.json',dict(Session=session,Recording=recording,RecordingActive=True,ObservedTicks=op.qpc(),Sequence=seq))
        g=gate.Readiness(plan,context=context);history=[]
        while not g.done:
            status=g.step();history.append(dict(elapsed=(op.qpc()-origin)/op.frequency(),state=status['State'],reason=status.get('Reason'),coverage=status.get('Coverage')))
            if not g.done:time.sleep(.5)
        result=dict(passed=g.latest['State']=='Admitted',schema='NativeSuppression09ActualObsWriter',origin=evidence,admission=g.latest,history=history,source=str(paths[0]),gameLaunched=False,generatedFixtureOnly=True,liveGtaBehaviourQualified=False)
        op.atomic(root/'writer-result.json',result,True)
    finally:
        try:
            if rec.snapshot()['RecordingActive']:rec.call('StopRecord')
        finally:
            if identity.alive():identity.normal_close()
            child.wait(timeout=15);identity.close()
    assert result and result['passed'],json.dumps(result)
    log=Path(evidence['Log']);retained=root/'obs-writer.log';retained.write_bytes(log.read_bytes())
    result['retainedObsLog']=dict(path=str(retained),sha256=op.sha(retained));result['finalSourceSha256']=op.sha(Path(result['source']));result['recorderState']=op.read(root/'operator/recorder-state.json')
    op.atomic(root/'result.json',result,True);print(json.dumps(result,indent=2))
if __name__=='__main__':run(Path(sys.argv[1]))
