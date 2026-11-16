"""Real retained LuaJIT VM, authored OBS frontend fixture, disposable process."""
from pathlib import Path
import ctypes,json,sys,time
root,lua_source,lua_dll=map(Path,sys.argv[1:4]);mode=sys.argv[4] if len(sys.argv)>4 else 'normal'
lib=ctypes.CDLL(str(lua_dll));lib.luaL_newstate.restype=ctypes.c_void_p
L=lib.luaL_newstate();assert L
lib.luaL_openlibs.argtypes=[ctypes.c_void_p];lib.luaL_openlibs(L)
lib.luaL_loadstring.argtypes=[ctypes.c_void_p,ctypes.c_char_p];lib.luaL_loadstring.restype=ctypes.c_int
lib.lua_pcall.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int];lib.lua_pcall.restype=ctypes.c_int
lib.lua_tolstring.argtypes=[ctypes.c_void_p,ctypes.c_int,ctypes.POINTER(ctypes.c_size_t)];lib.lua_tolstring.restype=ctypes.c_char_p
lib.lua_close.argtypes=[ctypes.c_void_p]
def execute(code):
    if lib.luaL_loadstring(L,code.encode()) or lib.lua_pcall(L,0,0,0):raise RuntimeError(lib.lua_tolstring(L,-1,None).decode())
fake=r'''
local ffi=require('ffi');ffi.cdef('int QueryPerformanceCounter(long long *); int QueryPerformanceFrequency(long long *); int MoveFileExA(const char *, const char *, unsigned long);');local k=ffi.load('kernel32')
local function ns() local a=ffi.new('long long[1]');local f=ffi.new('long long[1]');k.QueryPerformanceCounter(a);k.QueryPerformanceFrequency(f);return math.floor(tonumber(a[0])*1000000000/tonumber(f[0])) end
local active=false;local started=0
obslua={OBS_FRONTEND_EVENT_RECORDING_STARTED=5,LOG_ERROR=100}
local o=obslua
function o.os_gettime_ns()return ns()end
function o.obs_data_create()return {}end
function o.obs_data_release(d)end
function o.obs_data_set_string(d,k,v)d[k]=v end
function o.obs_data_set_bool(d,k,v)d[k]=v end
function o.obs_data_set_int(d,k,v)d[k]=v end
function o.obs_data_get_string(d,k)return d[k] or '' end
function o.obs_data_get_int(d,k)return d[k] or 0 end
function o.obs_data_create_from_json(s)
 local d={};for k,v in s:gmatch('"([%w_]+)"%s*:%s*"([^"]*)"')do d[k]=v end
 for k,v in s:gmatch('"([%w_]+)"%s*:%s*([%d%.]+)')do d[k]=tonumber(v)end
 return d
end
function o.obs_data_get_json(d)
 local r={};for k,v in pairs(d)do local t=type(v);local s=t=='string' and string.format('%q',v) or tostring(v);r[#r+1]=string.format('%q',k)..':'..s end;return '{'..table.concat(r,',')..'}'
end
function o.os_safe_replace(target,source,backup)
 if FIXTURE_MODE=='lost' and target:find('recorder%-reply.json$')then os.remove(source);return 0 end
 return k.MoveFileExA(source,target,9)~=0 and 0 or 1
end
function o.obs_frontend_get_current_profile()return 'NativeSuppression01Live10'end
o.obs_frontend_get_current_scene_collection=o.obs_frontend_get_current_profile
function o.obs_frontend_streaming_active()return false end
function o.obs_frontend_virtualcam_active()return false end
function o.obs_frontend_recording_active()return active end
function o.obs_frontend_recording_paused()return false end
function o.obs_enum_sources()local s={{id='wasapi_output_capture',name='Desktop Audio'},{id='window_capture',name='Window Capture'}};if FIXTURE_MODE=='mic' then s[#s+1]={id='wasapi_input_capture',name='Mic'}end;return s end
function o.source_list_release(s)end
function o.obs_source_get_id(s)return s.id end
function o.obs_source_get_name(s)return s.name end
function o.obs_source_get_settings(s)if s.name=='Desktop Audio'then return{device_id='default'}else return{method=2,window='Grand Theft Auto V:sgaWindow:GTA5_Enhanced.exe'}end end
function o.obs_source_active(s)return true end
function o.obs_source_muted(s)return false end
function o.obs_source_get_volume(s)return 1 end
function o.obs_source_get_monitoring_type(s)return 0 end
function o.obs_source_get_sync_offset(s)return 0 end
function o.obs_source_get_audio_mixers(s)return 1 end
function o.obs_video_info()return {base_width=1920,output_width=1920,base_height=1080,output_height=1080,fps_num=30,fps_den=1}end
function o.obs_get_video_info(v)return true end
function o.obs_frontend_get_recording_output()return {} end
function o.obs_output_get_total_frames(v)return active and math.floor((ns()-started)/1e9*30)or 0 end
function o.obs_output_get_total_bytes(v)return active and 4096 or 0 end
function o.obs_output_release(v)end
function o.obs_frontend_add_event_callback(f)_event=f end
function o.obs_frontend_remove_event_callback(f)end
function o.timer_add(f,ms)_timer=f end
function o.timer_remove(f)end
function o.script_log(l,s)error('fixture observed Lua error: '..s)end
function o.obs_frontend_recording_start()active=true;started=ns();_event(5)end
function o.obs_frontend_recording_stop()active=false;_fixture_stopped=true end
'''
try:
    execute('FIXTURE_MODE='+json.dumps(mode)+'\n'+fake)
    text=lua_source.read_text(encoding='utf-8-sig');needle=r'C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-10';assert text.count(needle)==1
    execute(text.replace(needle,str(root)));execute('script_load({})')
    if mode in ['preroll-bound','admitted-bound']:
        session=(root/'operator/activation.lock').read_text().split()[0]
        request=root/'operator/recorder-request.json'
        request.write_text(json.dumps(dict(Session=session,Id='a'*32,Operation='Start',ExpiresNs=int(time.perf_counter()*1e9)+4000000000)))
        execute('_timer()');s=json.loads((root/'operator/recorder-state.json').read_text());assert s['Starts']==1 and s['RecordingActive']
        if mode=='admitted-bound':(root/'startup-admission.json').write_text(json.dumps(dict(Session=session,Passed=True)))
        execute('local real=obslua.os_gettime_ns; _fixture_real_ns=real; obslua.os_gettime_ns=function()return _fixture_real_ns()+59900000000 end; _timer()')
        assert json.loads((root/'operator/recorder-state.json').read_text())['RecordingActive']
        execute('obslua.os_gettime_ns=function()return _fixture_real_ns()+60100000000 end; _timer()')
        s=json.loads((root/'operator/recorder-state.json').read_text());assert s['RecordingActive']==(mode=='admitted-bound')
        if mode=='admitted-bound':
            execute('obslua.os_gettime_ns=function()return _fixture_real_ns()+780100000000 end; _timer()')
        execute('_timer()');s=json.loads((root/'operator/recorder-state.json').read_text());assert not s['RecordingActive'] and s['Starts']==1 and s['Stops']==1
        (root/'result.json').write_text(json.dumps(dict(passed=True,mode=mode,actualLuaVm=True,authoredClockOffsets=True,gameLaunched=False,obsLaunched=False,unchanged780SecondCeiling=True)))
        execute('script_unload()');sys.exit(0)
    until=time.monotonic()+9;stopped_at=None
    while time.monotonic()<until:
        execute('_timer()');state=root/'operator/recorder-state.json'
        if state.exists():
            s=json.loads(state.read_text());assert not s['Failed']
            if s['Stops'] and stopped_at is None:stopped_at=time.monotonic()
        if stopped_at and time.monotonic()-stopped_at>.5:break
        time.sleep(.02)
    execute('script_unload()')
finally:lib.lua_close(L)
