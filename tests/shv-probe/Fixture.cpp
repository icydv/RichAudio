// Device-free public SHV ABI fixture. Never install in a game directory.
// Input is supported callback dispatch, never OS injection or production hooks.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <cctype>
#include <cmath>

namespace {
using U64 = unsigned long long;
using Keyboard = void (*)(DWORD, WORD, BYTE, BOOL, BOOL, BOOL, BOOL);
void (*callback)() = nullptr;
Keyboard keyboard = nullptr;
volatile LONG64 counts[48]{};
DWORD callbackThread = 0;
bool inCallback = false, inKeyboard = false, faulted = false, hudFaulted = false;
char scenario[64]{};
U64 currentHash = 0, arguments[8]{}, result[2]{};
unsigned argumentCount = 0;
ULONGLONG configuredTick = 0, activeTick = 0;
bool released = false, started = false, startReleased = false, stopped = false;
bool pendingPostContext = false, gapInjected = false, focusLost = false;
bool wDown = false, sDown = false;
unsigned nextMarker = 0;
LONGLONG inputQpc = 0, lastTargetQpc = 0, firstTargetQpc = 0;
struct Target { U64 before = 0, after = 0, bits = 0, running = 0, speedBits = 0, status = 0; };
Target targets[2400]{};
bool Is(const char* value) { return std::strcmp(scenario, value) == 0; }
bool Sequence() { return std::strncmp(scenario, "sequence_", 9) == 0; }
void Increment(int index) { InterlockedIncrement64(&counts[index]); }
U64 Count(int index) { return static_cast<U64>(InterlockedCompareExchange64(&counts[index], 0, 0)); }
LONGLONG Qpc() { LARGE_INTEGER value{}; QueryPerformanceCounter(&value); return value.QuadPart; }
DWORD ArmKey() { return Is("uk_oem102") ? VK_OEM_102 : VK_OEM_5; }
ULONGLONG Elapsed() { return activeTick ? GetTickCount64() - activeTick : 0; }
std::uint32_t Bits(float value) { std::uint32_t bits = 0; std::memcpy(&bits, &value, sizeof bits); return bits; }
void Context() {
    if (!inCallback || inKeyboard || GetCurrentThreadId() != callbackThread) {
        Increment(6); RaiseException(0xE0420002, 0, 0, nullptr);
    }
}
void Arguments(unsigned count) {
    if (argumentCount != count) { Increment(8); RaiseException(0xE0420003, 0, 0, nullptr); }
}
void EntityArgument() {
    if (!argumentCount || (arguments[0] != 1001 && arguments[0] != 1002 && arguments[0] != 2002 && arguments[0] != 2003)) {
        Increment(8); RaiseException(0xE0420003, 0, 0, nullptr);
    }
}
void Result(U64 value) { result[0] = value; }
bool OutputContains(const wchar_t* leaf, const char* marker, const char* second = nullptr) {
    wchar_t base[32768], pattern[32768];
    const DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", base, 32768);
    if (!length || length >= 32768 || swprintf_s(pattern, L"%ls\\RichAudio\\ShvProbe\\*", base) < 0) return false;
    WIN32_FIND_DATAW entry{}; HANDLE search = FindFirstFileW(pattern, &entry);
    if (search == INVALID_HANDLE_VALUE) return false;
    bool found = false;
    do {
        if (!(entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || entry.cFileName[0] == L'.') continue;
        wchar_t fileName[32768];
        if (swprintf_s(fileName, L"%ls\\RichAudio\\ShvProbe\\%ls\\%ls", base, entry.cFileName, leaf) < 0) continue;
        HANDLE file = CreateFileW(fileName, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) continue;
        char bytes[32769]{}; DWORD count = 0;
        if (ReadFile(file, bytes, 32768, &count, nullptr)) {
            bytes[count] = 0;
            for (char* line = bytes; *line;) {
                char* newline = std::strchr(line, '\n'); if (!newline) break;
                *newline = 0;
                if (std::strstr(line, marker) && (!second || std::strstr(line, second))) { found = true; break; }
                line = newline + 1;
            }
        }
        CloseHandle(file); if (found) break;
    } while (FindNextFileW(search, &entry));
    FindClose(search); return found;
}
bool JournalContains(const char* marker) { return OutputContains(L"journal.ndjson", marker); }
void Key(DWORD key, bool up, bool repeat = false, bool alt = false) {
    if (!keyboard) return;
    inKeyboard = true;
    keyboard(key, 1, 0, FALSE, alt ? TRUE : FALSE, repeat ? TRUE : FALSE, up ? TRUE : FALSE);
    inKeyboard = false; Increment(13);
}
void Release() {
    Key(VK_OEM_5, true); Key(VK_OEM_102, true); Key(VK_F8, true);
    Key(VK_CONTROL, true); Key(VK_SHIFT, true); Key(VK_MENU, true); Key('W', true); Key('S', true);
    wDown = false; sDown = false;
}
void Chord(bool repeat = false) {
    if (!Is("missing_ctrl")) Key(VK_CONTROL, false, repeat);
    if (!Is("missing_shift")) Key(VK_SHIFT, false, repeat);
    const bool alt = Is("extra_alt");
    if (alt) Key(VK_MENU, false, repeat, true);
    Key(Is("wrong_key") ? VK_F8 : ArmKey(), false, repeat, alt);
    if (!repeat) { inputQpc = Qpc(); Increment(14); }
}
void Advance() { Release(); Key(ArmKey(), false); Key(ArmKey(), true); Increment(25); }
bool Running() {
    if (Is("zero_off")) return false;
    if (Sequence() && !Is("sequence_marker_only")) return Elapsed() >= 1000;
    return true;
}
float Speed() {
    if (!Sequence() || Is("sequence_marker_only")) return 0.0f;
    const auto at = Elapsed();
    if (at >= 5000 && at < 8000) return static_cast<float>(at - 5000) / 300.0f;
    if (at >= 8000 && at < 8500) return 10.0f;
    if (at >= 8500 && at < 11500) return static_cast<float>(11500 - at) / 300.0f;
    return 0.0f;
}
float Ratio() {
    const auto at = Elapsed();
    if (Is("zero_off") || Is("zero_running")) return 0.0f;
    if (Is("rising")) return 0.2f + 0.6f * static_cast<float>(at < 2500 ? at : 2500) / 2500.0f;
    if (Is("falling")) return 0.8f - 0.6f * static_cast<float>(at < 2500 ? at : 2500) / 2500.0f;
    if (!Sequence() || Is("sequence_constant") || Is("sequence_marker_only")) return 0.2f;
    if (at < 1000) return 0.0f;
    if (Is("sequence_wrong_trend") && at >= 4000 && at < 5000) return 0.2f + 0.6f * static_cast<float>(at - 4000) / 1000.0f;
    if (at >= 4000 && at < 5000) return 0.2f + 0.6f * (1.0f - std::fabs((static_cast<float>(at) - 4500.0f) / 500.0f));
    if (at >= 5000 && at < 8000) {
        const float fraction = static_cast<float>(at - 5000) / 3000.0f;
        return Is("sequence_wrong_trend") ? 0.8f - 0.6f * fraction : 0.2f + 0.6f * fraction;
    }
    if (at >= 8000 && at < 8500) return Is("sequence_wrong_trend") ? 0.2f : 0.8f;
    if (at >= 8500 && at < 11500) {
        const float fraction = static_cast<float>(at - 8500) / 3000.0f;
        return Is("sequence_wrong_trend") ? 0.2f + 0.6f * fraction : 0.8f - 0.6f * fraction;
    }
    if (Is("sequence_wrong_trend") && at >= 11500 && at < 12000) return 0.8f - 0.6f * static_cast<float>(at - 11500) / 500.0f;
    return 0.2f;
}
void InputAndMessages() {
    MSG message{};
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
    const auto waiting = GetTickCount64() - configuredTick;
    if (Is("eligible_no_input")) return;
    if (Is("held_startup")) { Chord(true); return; }
    const ULONGLONG releaseAt = Is("release_then_rising") ? 300 : 100;
    const ULONGLONG startAt = Is("release_then_rising") ? 800 : 500;
    if (!released && waiting >= releaseAt) { Release(); released = true; }
    if (!started && waiting >= startAt) { Chord(); started = true; }
    if (started && !startReleased && waiting >= startAt + 60) { Release(); startReleased = true; }
    if (!activeTick) return;
    const auto at = Elapsed();
    if (Sequence()) {
        const ULONGLONG boundaries[7]{1000, 4000, 5000, 8000, 8500, 11500, 14500};
        if (nextMarker < 7 && at >= boundaries[nextMarker]) { Advance(); ++nextMarker; }
        const bool wWanted = at >= 4000 && at < 8000, sWanted = at >= 8500 && at < 11500;
        if (wWanted != wDown) { Key('W', !wWanted); wDown = wWanted; }
        if (sWanted != sDown) { Key('S', !sWanted); sDown = sWanted; }
    } else if (!Is("max_duration") && !stopped && at >= (Is("rising") || Is("falling") ? 3000 : 1500)) {
        Release(); Chord(); Release(); stopped = true; Increment(29);
    }
    if (Is("focus_loss") && !focusLost && at >= 300) {
        HWND foreground = GetForegroundWindow(); DWORD owner = 0; GetWindowThreadProcessId(foreground, &owner);
        if (owner == GetCurrentProcessId()) { ShowWindow(foreground, SW_MINIMIZE); Increment(22); }
        focusLost = true;
    }
    if (Is("stale_gap") && !gapInjected && Count(4) >= 3) { gapInjected = true; Sleep(350); }
    if (Is("phase_overflow") && !gapInjected && Count(4) >= 3) {
        gapInjected = true; for (unsigned i = 0; i < 12; ++i) Advance(); Increment(38);
    }
}
bool HudHash(U64 hash) {
    switch (hash) {
    case 0x66E0276CC5F6B9DAULL: case 0x07C837F9A01C34C9ULL:
    case 0xBE6B23FFA53FB442ULL: case 0x2513DFB0FB8400FEULL:
    case 0x25FBB336DF1804CBULL: case 0x6C188BE134E074AAULL:
    case 0xCD015E5BB0D96A57ULL: return true;
    default: return false;
    }
}
void Hud() {
    Increment(15); if (Count(4)) Increment(16);
    if (Is("hud_seh_before") || (Is("hud_seh_active") && Count(4) >= 3)) {
        hudFaulted = true; faulted = true; Increment(30); RaiseException(0xE0420008, 0, 0, nullptr);
    }
    switch (currentHash) {
    case 0x66E0276CC5F6B9DAULL: Arguments(1); break;
    case 0x07C837F9A01C34C9ULL: Arguments(2); break;
    case 0xBE6B23FFA53FB442ULL: Arguments(4); break;
    case 0x2513DFB0FB8400FEULL: Arguments(0); break;
    case 0x25FBB336DF1804CBULL: Arguments(1); break;
    case 0x6C188BE134E074AAULL: {
        Arguments(1); const char* text = reinterpret_cast<const char*>(arguments[0]); char lower[512]{};
        if (text) for (unsigned i = 0; i < 511 && text[i]; ++i) lower[i] = static_cast<char>(std::tolower(static_cast<unsigned char>(text[i])));
        if (std::strstr(lower, "ready")) Increment(20);
        if (std::strstr(lower, "stop") || std::strstr(lower, "complete") || std::strstr(lower, "failed")) Increment(21);
        break;
    }
    case 0xCD015E5BB0D96A57ULL: Arguments(3); break;
    default: Increment(7); break;
    }
}
}
__declspec(dllexport) void scriptRegister(HMODULE, void (*entry)()) { Increment(0); callback = entry; }
__declspec(dllexport) void scriptUnregister(HMODULE) { Increment(1); callback = nullptr; }
__declspec(dllexport) void keyboardHandlerRegister(Keyboard entry) {
    Increment(11); keyboard = entry;
    if (Is("held_startup") || Is("release_then_rising")) Chord(true);
}
__declspec(dllexport) void keyboardHandlerUnregister(Keyboard) { Increment(12); keyboard = nullptr; }
__declspec(dllexport) void scriptWait(DWORD milliseconds) {
    Context(); Increment(9); InputAndMessages(); result[0] = 0x5A5A5A5A5A5A5A5AULL;
    Sleep(milliseconds ? milliseconds : 5);
}
__declspec(dllexport) void nativeInit(U64 hash) {
    Context(); if (faulted) Increment(5); if (hudFaulted) Increment(31);
    currentHash = hash; argumentCount = 0;
}
__declspec(dllexport) void nativePush64(U64 value) {
    Context(); if (argumentCount >= 8) { Increment(8); RaiseException(0xE0420003, 0, 0, nullptr); }
    arguments[argumentCount++] = value;
}
__declspec(dllexport) U64* nativeCall() {
    Context(); Increment(3); result[0] = 0xF0F0F0F0F0F0F0F0ULL; result[1] = 0xCCCCCCCCCCCCCCCCULL;
    if (HudHash(currentHash)) { Hud(); return result; }
    if (currentHash != 0xF9DDA40BC293A61EULL) Increment(17);
    const bool changed = activeTick && Elapsed() >= 300;
    switch (currentHash) {
    case 0x10D0A8F259E93EC9ULL: case 0xD9D2CFFF49FAB35FULL:
        Arguments(0); Result(0); break;
    case 0xB0034A223497FFCBULL: Arguments(0); Result(Is("pause") && changed ? 1 : 0); break;
    case 0x10FAB35428CCC9D7ULL: case 0x9DE624D2FC4B603FULL:
        Arguments(0); Result(Is("online") || (Is("offline_lost") && changed) ? 1 : 0); break;
    case 0x4F8644AF03D0E0D6ULL: Arguments(0); Result(Is("player_changed") && changed ? 43 : 42); break;
    case 0x5E9564D8246B909AULL:
        Arguments(1); if (arguments[0] != 42 && arguments[0] != 43) Increment(8); Result(1); break;
    case 0xD80958FC74E988A6ULL: Arguments(0); Result(Is("player_changed") && changed ? 1002 : 1001); break;
    case 0x7239B21A38F536BAULL: case 0x524AC5ECEA15343EULL: case 0x6AC7003FA6E5575EULL:
        Arguments(1); EntityArgument(); Result(1); break;
    case 0x5F9532F3B5CC2551ULL:
        Arguments(2); EntityArgument(); if (arguments[1] != 0) Increment(8); Result(0); break;
    case 0x9A9112A0FE9A4713ULL:
        Arguments(2); if ((arguments[0] != 1001 && arguments[0] != 1002) || arguments[1] != 0) Increment(8);
        Result(Is("no_vehicle") ? 0 : ((Is("identity_changed") && changed) || (Is("post_identity_changed") && pendingPostContext && Count(4) >= 3) ? 2003 : 2002)); break;
    case 0x9F47B058362C84B5ULL:
        Arguments(1); EntityArgument(); Result(Is("wrong_model") || (Is("input_before_ready") && GetTickCount64() - configuredTick < 1200) ? 0xA774B5A6 : 0xF9300CC5); break;
    case 0xBB40DD2270B65366ULL:
        Arguments(3); if ((arguments[0] != 2002 && arguments[0] != 2003) || static_cast<std::int32_t>(arguments[1]) != -1 || arguments[2] != 0) Increment(8);
        Result(Is("passenger") || (Is("driver_changed") && changed) ? 3003 : (Is("player_changed") && changed ? 1002 : 1001)); break;
    case 0xAE31E7DF9B5B132EULL:
        Arguments(1); EntityArgument(); Increment(23); Result(Running() ? 1 : 0); break;
    case 0xD5037BA82E12416FULL: {
        Arguments(1); EntityArgument(); Increment(24);
        if ((Is("context_seh") && Count(4) >= 3 && !pendingPostContext) || (Is("post_context_seh") && Count(4) >= 3 && pendingPostContext)) {
            faulted = true; RaiseException(0xE0420004, 0, 0, nullptr);
        }
        if (Is("slow_context") && Count(4) >= 3 && !pendingPostContext) Sleep(300);
        if (Is("post_context_delay") && Count(4) == 3 && pendingPostContext) {
            Sleep(400);
            if (OutputContains(L"timeline.ndjson", "\"kind\":\"target-return\",\"observationIndex\":3", "\"rawBits\":1045220557")) Increment(39);
            Sleep(100);
        }
        Result(Is("nonfinite_speed") && changed ? 0x7FC12345 : (Is("negative_speed") && changed ? 0xBD4CCCCD : Bits(Speed())));
        pendingPostContext = false; break;
    }
    case 0xF9DDA40BC293A61EULL: {
        Arguments(1); if (arguments[0] != 2002) Increment(8); Increment(4);
        const auto n = Count(4); if (n > 2400) { faulted = true; RaiseException(0xE0420009, 0, 0, nullptr); }
        if (!activeTick) { activeTick = GetTickCount64(); firstTargetQpc = Qpc(); }
        Target& target = targets[n - 1]; target.before = static_cast<U64>(Qpc());
        if (lastTargetQpc) {
            const auto gap = static_cast<U64>(target.before - lastTargetQpc);
            if (!Count(34) || gap < Count(34)) InterlockedExchange64(&counts[34], static_cast<LONG64>(gap));
            if (gap > Count(35)) InterlockedExchange64(&counts[35], static_cast<LONG64>(gap));
        }
        lastTargetQpc = static_cast<LONGLONG>(target.before);
        if (JournalContains("operator-armed") && JournalContains("armed-not-proof-of-invocation")) Increment(10);
        target.running = Running() ? 1 : 0; target.speedBits = Bits(Speed()); target.bits = Bits(Ratio());
        pendingPostContext = true;
        if (n == 3) {
            if (Is("nan")) target.bits = 0x7FC12345;
            if (Is("infinity")) target.bits = 0x7F800000;
            if (Is("out_of_range")) target.bits = 0x3F8CCCCD;
            if (Is("negative_ratio")) target.bits = 0xBDCCCCCD;
            if (Is("delayed_target")) Sleep(350);
            if (Is("null_pointer")) { target.status = 1; target.after = static_cast<U64>(Qpc()); return nullptr; }
            if (Is("target_seh")) { target.status = 2; target.after = static_cast<U64>(Qpc()); faulted = true; RaiseException(0xE0420005, 0, 0, nullptr); }
        }
        Result(target.bits); target.after = static_cast<U64>(Qpc()); break;
    }
    default: Increment(7); faulted = true; RaiseException(0xE0420006, 0, 0, nullptr); return nullptr;
    }
    return result;
}
extern "C" __declspec(dllexport) const char* FixtureIdentity() { return "RichAudio device-free SHV ABI fixture v3"; }
extern "C" __declspec(dllexport) void FixtureConfigure(const char* value) {
    if (!value || std::strlen(value) >= sizeof scenario) RaiseException(0xE0420007, 0, 0, nullptr);
    std::memcpy(scenario, value, std::strlen(value) + 1); configuredTick = GetTickCount64();
}
extern "C" __declspec(dllexport) int FixtureInvokeRegistered() {
    if (!callback) return 0;
    callbackThread = GetCurrentThreadId(); inCallback = true; Increment(2); callback(); inCallback = false; return 1;
}
extern "C" __declspec(dllexport) U64 FixtureMetric(int index) {
    if (index == 26) return static_cast<U64>(inputQpc);
    if (index == 27) return static_cast<U64>(lastTargetQpc);
    if (index == 28) return ArmKey();
    if (index == 33) return static_cast<U64>(firstTargetQpc);
    return index >= 0 && index < 48 ? Count(index) : ~0ULL;
}
extern "C" __declspec(dllexport) U64 FixtureTargetMetric(unsigned index, unsigned field) {
    if (index >= Count(4) || index >= 2400) return ~0ULL;
    const auto& target = targets[index];
    switch (field) {
    case 0: return target.before; case 1: return target.after; case 2: return target.bits;
    case 3: return target.running; case 4: return target.speedBits; case 5: return target.status;
    default: return ~0ULL;
    }
}
