// Device-free public SHV ABI fixture. Never install it in a game directory.
// Keyboard events call only the registered fixture callback: no SendInput,
// hooks, OS key messages, user32 replacement or production test seam exists.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <cctype>

namespace {
using U64 = unsigned long long;
using Keyboard = void (*)(DWORD, WORD, BYTE, BOOL, BOOL, BOOL, BOOL);
void (*callback)() = nullptr;
Keyboard keyboard = nullptr;
volatile LONG64 counts[32] = {};
DWORD callbackThread = 0;
bool inCallback = false, inKeyboard = false;
char scenario[64] = {};
U64 currentHash = 0, arguments[8] = {}, result[2] = {};
unsigned argumentCount = 0;
bool targetStarted = false;
ULONGLONG startedTick = 0, armedObservedTick = 0;
bool releaseSent = false, chordSent = false, chordUpSent = false, focusLost = false;
bool sampleGapInjected = false, hudFaultRaised = false;
LONGLONG inputQpc = 0, targetQpc = 0;
bool Is(const char* value) { return std::strcmp(scenario, value) == 0; }
void Increment(int index) { InterlockedIncrement64(&counts[index]); }
LONGLONG Qpc() { LARGE_INTEGER value{}; QueryPerformanceCounter(&value); return value.QuadPart; }
DWORD ArmKey() { return Is("uk_oem102") ? VK_OEM_102 : VK_OEM_5; }
void Context() {
    if (!inCallback || inKeyboard || GetCurrentThreadId() != callbackThread) {
        Increment(6); RaiseException(0xE0420002, 0, 0, nullptr);
    }
}
void Arguments(unsigned count) {
    if (argumentCount != count) { Increment(8); RaiseException(0xE0420003, 0, 0, nullptr); }
}
void EntityArgument() {
    if (!argumentCount || (arguments[0] != 1001 && arguments[0] != 2002 && arguments[0] != 2003)) {
        Increment(8); RaiseException(0xE0420003, 0, 0, nullptr);
    }
}
void Result(U64 value) { result[0] = value; }
void FloatResult(std::uint32_t bits) { Result(bits); }
bool JournalContains(const char* marker) {
    wchar_t base[32768], pattern[32768];
    const DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", base, 32768);
    if (!length || length >= 32768 || swprintf_s(pattern, L"%ls\\RichAudio\\ShvProbe\\*", base) < 0) return false;
    WIN32_FIND_DATAW entry{}; HANDLE search = FindFirstFileW(pattern, &entry);
    if (search == INVALID_HANDLE_VALUE) return false;
    bool found = false;
    do {
        if (!(entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || entry.cFileName[0] == L'.') continue;
        wchar_t fileName[32768];
        if (swprintf_s(fileName, L"%ls\\RichAudio\\ShvProbe\\%ls\\journal.ndjson", base, entry.cFileName) < 0) continue;
        HANDLE file = CreateFileW(fileName, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) continue;
        char bytes[16385]{}; DWORD count = 0;
        if (ReadFile(file, bytes, 16384, &count, nullptr)) { bytes[count] = 0; found = std::strstr(bytes, marker) != nullptr; }
        CloseHandle(file); if (found) break;
    } while (FindNextFileW(search, &entry));
    FindClose(search); return found;
}
bool AfterArm(unsigned milliseconds = 0) {
    if (!armedObservedTick && JournalContains("operator-armed")) armedObservedTick = GetTickCount64();
    return armedObservedTick && GetTickCount64() - armedObservedTick >= milliseconds;
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
void Key(DWORD key, bool up, bool repeat = false, bool alt = false) {
    if (!keyboard) return;
    inKeyboard = true;
    keyboard(key, 1, 0, FALSE, alt ? TRUE : FALSE, repeat ? TRUE : FALSE, up ? TRUE : FALSE);
    inKeyboard = false; Increment(13);
}
void Release() {
    Key(VK_OEM_5, true); Key(VK_OEM_102, true); Key(VK_F8, true);
    Key(VK_CONTROL, true); Key(VK_SHIFT, true); Key(VK_MENU, true);
}
void Chord(bool repeat = false) {
    if (!Is("missing_ctrl")) Key(VK_CONTROL, false, repeat);
    if (!Is("missing_shift")) Key(VK_SHIFT, false, repeat);
    const bool alt = Is("extra_alt");
    if (alt) Key(VK_MENU, false, repeat, true);
    Key(Is("wrong_key") ? VK_F8 : ArmKey(), false, repeat, alt);
    if (!repeat) { inputQpc = Qpc(); Increment(14); }
}
void InputAndMessages() {
    MSG message{};
    while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) { TranslateMessage(&message); DispatchMessageW(&message); }
    const auto elapsed = GetTickCount64() - startedTick;
    if (Is("eligible_no_input")) return;
    if (Is("held_startup")) { Chord(true); return; }
    const ULONGLONG releaseAt = Is("release_then_rising") ? 300 : 100;
    const ULONGLONG chordAt = Is("release_then_rising") ? 800 : 500;
    if (!releaseSent && elapsed >= releaseAt) { Release(); releaseSent = true; }
    if (!chordSent && elapsed >= chordAt) { Chord(); chordSent = true; }
    if (chordSent && !chordUpSent && elapsed >= chordAt + 60) { Release(); chordUpSent = true; }
    if (Is("focus_loss") && !focusLost && AfterArm(300)) {
        HWND foreground = GetForegroundWindow(); DWORD owner = 0; GetWindowThreadProcessId(foreground, &owner);
        if (owner == GetCurrentProcessId()) { ShowWindow(foreground, SW_MINIMIZE); Increment(22); }
        focusLost = true;
    }
    if (Is("sample_gap") && !sampleGapInjected && AfterArm(600)) { sampleGapInjected = true; Sleep(350); }
}
void Hud() {
    Increment(15); if (targetStarted) Increment(16);
    if ((Is("hud_seh_before") && !targetStarted) || (Is("hud_seh_after") && targetStarted && !hudFaultRaised)) {
        hudFaultRaised = true; Increment(30); RaiseException(0xE0420008, 0, 0, nullptr);
    }
    switch (currentHash) {
    case 0x66E0276CC5F6B9DAULL: Arguments(1); break;
    case 0x07C837F9A01C34C9ULL: Arguments(2); break;
    case 0xBE6B23FFA53FB442ULL: Arguments(4); break;
    case 0x2513DFB0FB8400FEULL: Arguments(0); break;
    case 0x25FBB336DF1804CBULL: Arguments(1); break;
    case 0x6C188BE134E074AAULL: {
        Arguments(1);
        const char* text = reinterpret_cast<const char*>(arguments[0]);
        char lower[512]{};
        if (text) for (unsigned i = 0; i < 511 && text[i]; ++i) lower[i] = static_cast<char>(std::tolower(static_cast<unsigned char>(text[i])));
        if (std::strstr(lower, "ready")) Increment(20);
        if (std::strstr(lower, "complete") || std::strstr(lower, "stop") || std::strstr(lower, "failed") || std::strstr(lower, "timeout") || std::strstr(lower, "gate-") || std::strstr(lower, "zero")) Increment(21);
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
    Context(); Increment(9); InputAndMessages();
    if (targetStarted) result[0] = 0x5A5A5A5A5A5A5A5AULL;
    Sleep(milliseconds ? milliseconds : 5);
}
__declspec(dllexport) void nativeInit(U64 hash) {
    Context();
    if (hudFaultRaised) Increment(31);
    if (targetStarted && !HudHash(hash)) { Increment(5); Increment(18); }
    if (targetStarted && Is("target_seh")) Increment(19);
    currentHash = hash; argumentCount = 0;
}
__declspec(dllexport) void nativePush64(U64 value) {
    Context(); if (argumentCount >= 8) { Increment(8); RaiseException(0xE0420003, 0, 0, nullptr); }
    arguments[argumentCount++] = value;
}
__declspec(dllexport) U64* nativeCall() {
    Context(); Increment(3); result[0] = 0xF0F0F0F0F0F0F0F0ULL; result[1] = 0xCCCCCCCCCCCCCCCCULL;
    if (HudHash(currentHash)) { Hud(); return result; }
    Increment(17);
    switch (currentHash) {
    case 0x10D0A8F259E93EC9ULL: case 0xD9D2CFFF49FAB35FULL:
        Arguments(0); Result(0); break;
    case 0xB0034A223497FFCBULL:
        Arguments(0); Result(Is("pause") && AfterArm(300) ? 1 : 0); break;
    case 0x10FAB35428CCC9D7ULL: case 0x9DE624D2FC4B603FULL:
        Arguments(0); Result(Is("online") || (Is("offline_lost") && AfterArm(300)) ? 1 : 0); break;
    case 0x4F8644AF03D0E0D6ULL: Arguments(0); Result(42); break;
    case 0x5E9564D8246B909AULL:
        Arguments(1); if (arguments[0] != 42) Increment(8); Result(1); break;
    case 0xD80958FC74E988A6ULL: Arguments(0); Result(1001); break;
    case 0x7239B21A38F536BAULL: case 0x524AC5ECEA15343EULL: case 0x6AC7003FA6E5575EULL:
        Arguments(1); EntityArgument(); Result(1); break;
    case 0x5F9532F3B5CC2551ULL:
        Arguments(2); EntityArgument(); if (arguments[1] != 0) Increment(8); Result(0); break;
    case 0x9A9112A0FE9A4713ULL:
        Arguments(2); if (arguments[0] != 1001 || arguments[1] != 0) Increment(8);
        Result(Is("no_vehicle") ? 0 : (Is("changed_context") && AfterArm(300) ? 2003 : 2002)); break;
    case 0x9F47B058362C84B5ULL:
        Arguments(1); EntityArgument();
        if (Is("context_seh")) RaiseException(0xE0420004, 0, 0, nullptr);
        Result(Is("wrong_model") || (Is("input_before_ready") && GetTickCount64() - startedTick < 1200) ? 0xA774B5A6 : 0xF9300CC5); break;
    case 0xBB40DD2270B65366ULL:
        Arguments(3); if ((arguments[0] != 2002 && arguments[0] != 2003) || static_cast<std::int32_t>(arguments[1]) != -1 || arguments[2] != 0) Increment(8);
        Result(Is("passenger") ? 3003 : 1001); break;
    case 0xAE31E7DF9B5B132EULL: {
        Arguments(1); EntityArgument(); Increment(23);
        bool running = true;
        if (Is("false_running") && AfterArm(300)) running = false;
        if (Is("flapping_running") && AfterArm(300)) running = (GetTickCount64() - armedObservedTick) % 400 < 200;
        if (Is("final_gate_failure") && JournalContains("stable-idle-qualified")) running = false;
        if (Is("delayed_final_context") && JournalContains("stable-idle-qualified")) Sleep(1200);
        Result(running ? 1 : 0); break;
    }
    case 0xD5037BA82E12416FULL:
        Arguments(1); EntityArgument(); Increment(24);
        FloatResult(Is("negative_speed") && AfterArm(300) ? 0xBD4CCCCD : (Is("moving") && AfterArm(300) ? 0x3F000000 : (Is("nonfinite_speed") && AfterArm(300) ? 0x7FC12345 : 0))); break;
    case 0xF9DDA40BC293A61EULL: {
        Arguments(1); if (arguments[0] != 2002) Increment(8); Increment(4); targetQpc = Qpc();
        if (JournalContains("stable-idle-qualified") && JournalContains("armed-not-proof-of-invocation")) Increment(10);
        targetStarted = true;
        if (Is("target_seh")) RaiseException(0xE0420005, 0, 0, nullptr);
        if (Is("delayed_target")) Sleep(1200);
        if (Is("null_pointer")) return nullptr;
        std::uint32_t bits = 0x3F000000;
        if (Is("zero")) bits = 0;
        else if (Is("nan")) bits = 0x7FC12345;
        else if (Is("infinity")) bits = 0x7F800000;
        else if (Is("out_of_range")) bits = 0x42480000;
        FloatResult(bits); break;
    }
    default: Increment(7); RaiseException(0xE0420006, 0, 0, nullptr); return nullptr;
    }
    return result;
}
extern "C" __declspec(dllexport) const char* FixtureIdentity() { return "RichAudio device-free SHV ABI fixture v2"; }
extern "C" __declspec(dllexport) void FixtureConfigure(const char* value) {
    if (!value || std::strlen(value) >= sizeof scenario) RaiseException(0xE0420007, 0, 0, nullptr);
    std::memcpy(scenario, value, std::strlen(value) + 1); startedTick = GetTickCount64();
}
extern "C" __declspec(dllexport) int FixtureInvokeRegistered() {
    if (!callback) return 0;
    callbackThread = GetCurrentThreadId(); inCallback = true; Increment(2);
    callback(); inCallback = false; return 1;
}
extern "C" __declspec(dllexport) U64 FixtureMetric(int index) {
    if (index == 26) return static_cast<U64>(inputQpc);
    if (index == 27) return static_cast<U64>(targetQpc);
    if (index == 28) return ArmKey();
    return index >= 0 && index < 32 ? static_cast<U64>(InterlockedCompareExchange64(&counts[index], 0, 0)) : ~0ULL;
}
