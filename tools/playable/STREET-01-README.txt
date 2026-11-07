RichAudio STREET-01 development candidate - Windows x64

This is my integrated Bati development build. STREET-01 remains incomplete:
complete installed-world coverage, selective native engine/exhaust takeover,
complete deadlines and my integrated GTA listening acceptance are not proven.

PRIVATE PACKAGE: it contains source recordings prepared from my installation.
Do not upload or redistribute the folder or its ZIP. RichAudio source remains
free and open source. GTA assets are not part of the public distribution.

Run Setup.cmd once. Setup verifies the prepared payload and supported GTA/RPH
identities. RAGE Plugin Hook is obtained separately. For world preparation,
select the separately obtained unmodified CodeWalker.Core.dll folder when
prompted. Only that Core and SharpDX.dll / SharpDX.Mathematics.dll are required;
the CodeWalker application is not installed or copied. Credit: CodeWalker by
dexyfex. Applicable upstream notices remain in effect. Setup also locates an
installed PowerShell 7 host. It does not install prerequisites or launch GTA.

New STREET-01 installation starts with RichAudio playback disabled and GTA
stock fallback selected. Existing quality, level and menu-key preferences can
be carried to the new private version; prior playback approval is not reused.

When the plugin loads in offline Story Mode, its existing startup supervisor
automatically indexes and prepares supported static resources in the same
private cache consumed by the audio worker. Normal use needs no developer
export, terminal command or manual world-sidecar editing. Interrupted work is
retained, valid cache data is reused, and unknown/unsupported coverage remains
explicit. This does not promise complete custom-map or interior support.
One startup allows at most four 30-minute preparation batches and a two-hour
total worker budget, with bounded cleanup. A further batch requires a fresh
checkpoint proving an exhausted budget, joined workers and remaining eligible
work. Cancellation, uncertain process closure and structural failures stop it.

F10 opens the existing sidebar. Airflow is an explicit on/off comparison with
a restrained level control. Engine/exhaust calibration is preserved. GTA's
native vehicle sounds remain unchanged until selective control and recovery
are separately qualified. The new street-01 latency profile uses a 75 ms
observation-history setting; that is not total audible latency.

Exit GTA before changing the installation. Uninstall.cmd restores the exact
backed-up plugin, startup and sidecar files and retains the private cache.
Files changed after installation are preserved for review. No original game
archive is modified by this setup or by world preparation.
