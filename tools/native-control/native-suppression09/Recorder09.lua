-- Only OBS's supported frontend recording API. No sockets, microphone, hotkeys,
-- script evaluation endpoint, or game operations. Loaded by the private collection.
obs = obslua
local ROOT = [[C:\Users\Libby\Documents\RichAudio-SHVDNE01\.local\native-suppression-01\execution-09]]
local PROFILE = "NativeSuppression01Live09"
local session, seen, owned, starts, stops = nil, {}, false, 0, 0
local started_ns, failed = 0, false

local function read_small(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local s = f:read(16385); f:close()
    if s and #s > 16384 then error("bounded recorder file exceeded") end
    return s
end
local function write_state(path, data)
    local s = obs.obs_data_get_json(data)
    local f = assert(io.open(path .. ".new", "wb")); f:write(s); f:flush(); f:close()
    -- OBS's platform replacement keeps readers from seeing a partial JSON file.
    if obs.os_safe_replace(path, path .. ".new", nil) ~= 0 then
        -- os_safe_replace also handles the initial missing destination in OBS.
        error("atomic recorder status replacement failed")
    end
end
local function graph(data)
    local valid = obs.obs_frontend_get_current_profile() == PROFILE and obs.obs_frontend_get_current_scene_collection() == PROFILE
    valid = valid and not obs.obs_frontend_streaming_active() and not obs.obs_frontend_virtualcam_active()
    local sources = obs.obs_enum_sources(); local count = 0
    for _, source in ipairs(sources or {}) do
        local id, name = obs.obs_source_get_id(source), obs.obs_source_get_name(source)
        if id ~= "scene" and id ~= "group" then
            count = count + 1
            if name == "Desktop Audio" and id == "wasapi_output_capture" then
                local settings = obs.obs_source_get_settings(source)
                local device = obs.obs_data_get_string(settings, "device_id")
                valid = valid and (device == "default" or device == "") and not obs.obs_source_muted(source)
                valid = valid and math.abs(obs.obs_source_get_volume(source) - 1.0) < 0.000001 and obs.obs_source_get_monitoring_type(source) == 0 and obs.obs_source_get_sync_offset(source) == 0 and obs.obs_source_get_audio_mixers(source) == 1
                obs.obs_data_set_string(data, "DesktopSettings", obs.obs_data_get_json(settings)); obs.obs_data_release(settings)
            elseif name == "Window Capture" and id == "window_capture" then
                local settings = obs.obs_source_get_settings(source)
                valid = valid and obs.obs_data_get_int(settings, "method") == 2 and string.find(obs.obs_data_get_string(settings, "window"), "GTA5_Enhanced.exe", 1, true) ~= nil
                valid = valid and obs.obs_source_active(source)
                obs.obs_data_set_string(data, "WindowSettings", obs.obs_data_get_json(settings)); obs.obs_data_release(settings)
            else valid = false end
        end
    end
    obs.source_list_release(sources)
    local vi = obs.obs_video_info(); valid = valid and obs.obs_get_video_info(vi)
    valid = valid and vi.base_width == 1920 and vi.output_width == 1920 and vi.base_height == 1080 and vi.output_height == 1080 and vi.fps_num == 30 and vi.fps_den == 1
    obs.obs_data_set_bool(data, "GraphValid", valid and count == 2)
    obs.obs_data_set_string(data, "Profile", obs.obs_frontend_get_current_profile())
    obs.obs_data_set_string(data, "Collection", obs.obs_frontend_get_current_scene_collection())
    return valid and count == 2
end
local function state()
    local d = obs.obs_data_create()
    obs.obs_data_set_string(d, "Session", session)
    obs.obs_data_set_int(d, "ObservedNs", obs.os_gettime_ns())
    obs.obs_data_set_int(d, "StartedNs", started_ns)
    obs.obs_data_set_bool(d, "RecordingActive", obs.obs_frontend_recording_active())
    obs.obs_data_set_bool(d, "Paused", obs.obs_frontend_recording_paused())
    obs.obs_data_set_bool(d, "Failed", failed)
    obs.obs_data_set_int(d, "Starts", starts); obs.obs_data_set_int(d, "Stops", stops)
    obs.obs_data_set_int(d, "Frames", 0); obs.obs_data_set_int(d, "Bytes", 0)
    graph(d)
    local output = obs.obs_frontend_get_recording_output()
    if output then
        obs.obs_data_set_int(d, "Frames", obs.obs_output_get_total_frames(output))
        obs.obs_data_set_int(d, "Bytes", obs.obs_output_get_total_bytes(output)); obs.obs_output_release(output)
    end
    return d
end
local function event(kind)
    if kind == obs.OBS_FRONTEND_EVENT_RECORDING_STARTED and owned then started_ns = obs.os_gettime_ns() end
end
local function poll()
    if not session then return end
    if owned and started_ns > 0 and obs.os_gettime_ns() - started_ns >= 60000000000 and stops == 0 and not read_small(ROOT .. "/startup-admission.json") then stops = 1; obs.obs_frontend_recording_stop() end
    if owned and started_ns > 0 and obs.os_gettime_ns() - started_ns >= 780000000000 and stops == 0 then stops = 1; obs.obs_frontend_recording_stop() end
    local ok, err = pcall(function()
        local raw = read_small(ROOT .. "/operator/recorder-request.json")
        if raw then
            local c = assert(obs.obs_data_create_from_json(raw))
            local id = obs.obs_data_get_string(c, "Id")
            if not seen[id] then
                local s = obs.obs_data_get_string(c, "Session")
                local operation = obs.obs_data_get_string(c, "Operation")
                local expires, now = obs.obs_data_get_int(c, "ExpiresNs"), obs.os_gettime_ns()
                local count = 0; for _ in pairs(seen) do count = count + 1 end
                assert(#id == 32 and id:match("^[a-f0-9]+$") and count < 8, "bounded recorder command identities")
                seen[id] = true
                local accepted = s == session and expires > now and expires <= now + 5000000000 and not failed
                if operation == "Start" and accepted and starts == 0 and not obs.obs_frontend_recording_active() then
                    local d = state(); accepted = graph(d); obs.obs_data_release(d)
                    local consumed = ROOT .. "/operator/recorder-start-consumed.txt"
                    if read_small(consumed) then accepted = false end
                    if accepted then
                        local f = assert(io.open(consumed, "wb")); f:write(session .. " " .. id); f:flush(); f:close()
                        starts = 1; owned = true; obs.obs_frontend_recording_start()
                    end
                elseif operation == "Stop" and accepted and owned and stops == 0 then
                    stops = 1; obs.obs_frontend_recording_stop()
                else accepted = false end
                local reply = obs.obs_data_create(); obs.obs_data_set_string(reply, "Id", id); obs.obs_data_set_string(reply, "Session", session)
                obs.obs_data_set_bool(reply, "Accepted", accepted); obs.obs_data_set_string(reply, "Operation", operation)
                write_state(ROOT .. "/operator/recorder-reply.json", reply); obs.obs_data_release(reply)
            end
            obs.obs_data_release(c)
        end
        local d = state(); write_state(ROOT .. "/operator/recorder-state.json", d); obs.obs_data_release(d)
    end)
    if not ok then failed = true; obs.script_log(obs.LOG_ERROR, "NativeSuppression09 recorder refused: " .. tostring(err)) end
end
function script_description() return "Finite local recording control for NativeSuppression09. No microphone, network server or GTA natives." end
function script_load(settings)
    local raw = read_small(ROOT .. "/operator/activation.lock")
    if not raw then return end
    session = raw:match("^([a-f0-9]+) ")
    if not session or #session ~= 32 then session = nil; return end
    obs.obs_frontend_add_event_callback(event); obs.timer_add(poll, 100)
end
function script_unload() obs.timer_remove(poll); obs.obs_frontend_remove_event_callback(event) end
