// Device-free SHV ABI fixture. Never install this DLL in a game directory.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <cstdint>
#include <cstring>
#include <cwchar>

namespace {
using U64 = unsigned long long;
void (*callback)() = nullptr;
volatile LONG64 counts[11] = {};
DWORD callbackThread = 0;
bool inCallback = false;
char scenario[64] = {};
U64 currentHash = 0, arguments[8] = {}, result[2] = {};
unsigned argumentCount = 0;
unsigned ownVehicleReads = 0;
bool targetReturned = false;
bool Is(const char* value) { return std::strcmp(scenario, value) == 0; }
void Increment(int index) { InterlockedIncrement64(&counts[index]); }
void Context() {
    if (!inCallback || GetCurrentThreadId() != callbackThread) {
        Increment(6); RaiseException(0xE0420002, 0, 0, nullptr);
    }
}
void Arguments(unsigned count) {
    if (argumentCount != count) { Increment(8); RaiseException(0xE0420003, 0, 0, nullptr); }
}
void EntityArgument() {
    if (argumentCount < 1 || (arguments[0] != 1001 && arguments[0] != 2002 && arguments[0] != 2003)) {
        Increment(8); RaiseException(0xE0420003, 0, 0, nullptr);
    }
}
void Result(U64 value) { result[0] = value; }
bool ArmedJournalExists() {
    // Fixture-only I/O checks the production writer's ordering at invocation.
    wchar_t base[32768], pattern[32768];
    const DWORD length = GetEnvironmentVariableW(L"LOCALAPPDATA", base, 32768);
    if (!length || length >= 32768 || swprintf_s(pattern, L"%ls\\RichAudio\\ShvProbe\\*", base) < 0) return false;
    WIN32_FIND_DATAW entry = {}; HANDLE search = FindFirstFileW(pattern, &entry);
    if (search == INVALID_HANDLE_VALUE) return false;
    bool found = false;
    do {
        if (!(entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || entry.cFileName[0] == L'.') continue;
        wchar_t fileName[32768];
        if (swprintf_s(fileName, L"%ls\\RichAudio\\ShvProbe\\%ls\\journal.ndjson", base, entry.cFileName) < 0) continue;
        HANDLE file = CreateFileW(fileName, GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) continue;
        char bytes[16385] = {}; DWORD count = 0;
        if (ReadFile(file, bytes, 16384, &count, nullptr)) { bytes[count] = 0; found = std::strstr(bytes, "armed-not-proof-of-invocation") != nullptr; }
        CloseHandle(file);
        if (found) break;
    } while (FindNextFileW(search, &entry));
    FindClose(search); return found;
}
}

// Exact public Microsoft x64 C++ exports used by the production ASI.
__declspec(dllexport) void scriptRegister(HMODULE, void (*entry)()) { Increment(0); callback = entry; }
__declspec(dllexport) void scriptUnregister(HMODULE) { Increment(1); callback = nullptr; }
__declspec(dllexport) void scriptWait(DWORD milliseconds) {
    Context(); Increment(9);
    if (targetReturned) result[0] = 0x5A5A5A5A5A5A5A5AULL;
    Sleep(milliseconds ? milliseconds : 1);
}
__declspec(dllexport) void nativeInit(U64 hash) {
    Context(); if (targetReturned) Increment(5);
    currentHash = hash; argumentCount = 0;
}
__declspec(dllexport) void nativePush64(U64 value) {
    Context(); if (argumentCount >= 8) { Increment(8); RaiseException(0xE0420003, 0, 0, nullptr); }
    arguments[argumentCount++] = value;
}
__declspec(dllexport) U64* nativeCall() {
    Context(); Increment(3);
    // Every later native overwrites the same framework-owned storage.
    result[0] = 0xF0F0F0F0F0F0F0F0ULL; result[1] = 0xCCCCCCCCCCCCCCCCULL;
    switch (currentHash) {
    case 0x10D0A8F259E93EC9ULL: // loading screen
    case 0xD9D2CFFF49FAB35FULL: // player switch
        Arguments(0); Result(0); break;
    case 0x10FAB35428CCC9D7ULL:
    case 0x9DE624D2FC4B603FULL:
        Arguments(0); Result(Is("online") ? 1 : 0); break;
    case 0x4F8644AF03D0E0D6ULL:
        Arguments(0); Result(42); break;
    case 0x5E9564D8246B909AULL:
        Arguments(1); if (arguments[0] != 42) Increment(8); Result(1); break;
    case 0xD80958FC74E988A6ULL:
        Arguments(0); Result(1001); break;
    case 0x7239B21A38F536BAULL: // exists
    case 0x524AC5ECEA15343EULL: // is ped
    case 0x6AC7003FA6E5575EULL: // is vehicle
        Arguments(1); EntityArgument(); Result(1); break;
    case 0x5F9532F3B5CC2551ULL:
        Arguments(2); EntityArgument(); if (arguments[1] != 0) Increment(8); Result(0); break;
    case 0x9A9112A0FE9A4713ULL:
        Arguments(2); if (arguments[0] != 1001 || arguments[1] != 0) Increment(8);
        ++ownVehicleReads;
        Result(Is("no_vehicle") ? 0 : (Is("changed_context") && ownVehicleReads > 1 ? 2003 : 2002)); break;
    case 0x9F47B058362C84B5ULL:
        Arguments(1); EntityArgument();
        if (Is("context_seh")) RaiseException(0xE0420004, 0, 0, nullptr);
        Result(Is("wrong_model") ? 0xA774B5A6 : 0xF9300CC5); break;
    case 0xBB40DD2270B65366ULL:
        Arguments(3);
        if ((arguments[0] != 2002 && arguments[0] != 2003) || static_cast<std::int32_t>(arguments[1]) != -1 || arguments[2] != 0) Increment(8);
        Result(Is("passenger") ? 3003 : 1001); break;
    case 0xAE31E7DF9B5B132EULL:
        Arguments(1); if (arguments[0] != 2002 && arguments[0] != 2003) Increment(8); Result(1); break;
    case 0xF9DDA40BC293A61EULL: {
        Arguments(1); if (arguments[0] != 2002) Increment(8); Increment(4);
        if (ArmedJournalExists()) Increment(10);
        targetReturned = true; // No later native is permitted, even after SEH/null.
        if (Is("target_seh")) RaiseException(0xE0420005, 0, 0, nullptr);
        if (Is("delayed_target")) Sleep(650);
        if (Is("null_pointer")) return nullptr;
        std::uint32_t bits = 0x3F000000; // 0.5f
        if (Is("zero")) bits = 0;
        else if (Is("nan")) bits = 0x7FC12345;
        else if (Is("infinity")) bits = 0x7F800000;
        else if (Is("out_of_range")) bits = 0x42480000; // 50.0f
        Result(bits); break;
    }
    default:
        Increment(7); RaiseException(0xE0420006, 0, 0, nullptr); return nullptr;
    }
    return result;
}

extern "C" __declspec(dllexport) const char* FixtureIdentity() { return "RichAudio device-free SHV ABI fixture v1"; }
extern "C" __declspec(dllexport) void FixtureConfigure(const char* value) {
    if (!value || std::strlen(value) >= sizeof scenario) RaiseException(0xE0420007, 0, 0, nullptr);
    std::memcpy(scenario, value, std::strlen(value) + 1);
}
extern "C" __declspec(dllexport) int FixtureInvokeRegistered() {
    if (!callback) return 0;
    callbackThread = GetCurrentThreadId(); inCallback = true; Increment(2);
    callback(); inCallback = false; return 1;
}
extern "C" __declspec(dllexport) U64 FixtureMetric(int index) {
    return index >= 0 && index < 11 ? static_cast<U64>(InterlockedCompareExchange64(&counts[index], 0, 0)) : ~0ULL;
}
