// Launch only inside the isolated fixture folder. Never loads installed SHV.
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <bcrypt.h>
#include <cstdio>
#include <cstring>
#include <cwchar>
#include <stdexcept>
#include <sstream>
#include <string>
#include <vector>

namespace {
std::string Sha256(const std::wstring& path) {
    BCRYPT_ALG_HANDLE algorithm = nullptr; BCRYPT_HASH_HANDLE hash = nullptr;
    HANDLE file = INVALID_HANDLE_VALUE;
    try {
        if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) throw std::runtime_error("SHA256 provider");
        DWORD size = 0, returned = 0;
        if (BCryptGetProperty(algorithm, BCRYPT_OBJECT_LENGTH, reinterpret_cast<PUCHAR>(&size), sizeof size, &returned, 0) < 0) throw std::runtime_error("SHA256 object");
        std::vector<unsigned char> object(size), bytes(65536), digest(32);
        if (BCryptCreateHash(algorithm, &hash, object.data(), size, nullptr, 0, 0) < 0) throw std::runtime_error("SHA256 hash");
        file = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("SHA256 input");
        for (;;) { DWORD count = 0; if (!ReadFile(file, bytes.data(), static_cast<DWORD>(bytes.size()), &count, nullptr)) throw std::runtime_error("SHA256 read"); if (!count) break; if (BCryptHashData(hash, bytes.data(), count, 0) < 0) throw std::runtime_error("SHA256 update"); }
        if (BCryptFinishHash(hash, digest.data(), static_cast<ULONG>(digest.size()), 0) < 0) throw std::runtime_error("SHA256 finish");
        std::string result; const char* hex = "0123456789abcdef";
        for (const auto byte : digest) { result += hex[byte >> 4]; result += hex[byte & 15]; }
        CloseHandle(file); BCryptDestroyHash(hash); BCryptCloseAlgorithmProvider(algorithm, 0); return result;
    } catch (...) { if (file != INVALID_HANDLE_VALUE) CloseHandle(file); if (hash) BCryptDestroyHash(hash); if (algorithm) BCryptCloseAlgorithmProvider(algorithm, 0); throw; }
}
std::wstring ModulePath(HMODULE module) {
    std::vector<wchar_t> path(32768); DWORD count = GetModuleFileNameW(module, path.data(), static_cast<DWORD>(path.size()));
    if (!count || count >= path.size()) throw std::runtime_error("module path");
    return std::wstring(path.data(), count);
}
std::wstring Full(const wchar_t* value) {
    std::vector<wchar_t> path(32768); DWORD count = GetFullPathNameW(value, static_cast<DWORD>(path.size()), path.data(), nullptr);
    if (!count || count >= path.size()) throw std::runtime_error("full path"); return std::wstring(path.data(), count);
}
bool Same(const std::wstring& a, const std::wstring& b) { return CompareStringOrdinal(a.c_str(), -1, b.c_str(), -1, TRUE) == CSTR_EQUAL; }
std::string Narrow(const wchar_t* value) {
    std::string result; for (; *value; ++value) { if (*value > 127) throw std::runtime_error("non-ASCII case/hash"); result += static_cast<char>(*value); } return result;
}
template<class T> T Export(HMODULE module, const char* name) {
    auto address = GetProcAddress(module, name); if (!address) throw std::runtime_error("fixture export missing");
    static_assert(sizeof(T) == sizeof address, "Windows x64 function-pointer width");
    T function; std::memcpy(&function, &address, sizeof function); return function;
}
bool TerminalJournalExists(const std::wstring& caseRoot) {
    const auto pattern = caseRoot + L"\\RichAudio\\ShvProbe\\*";
    WIN32_FIND_DATAW entry = {}; HANDLE search = FindFirstFileW(pattern.c_str(), &entry);
    if (search == INVALID_HANDLE_VALUE) return false;
    bool found = false;
    do {
        if (!(entry.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || entry.cFileName[0] == L'.') continue;
        const auto name = caseRoot + L"\\RichAudio\\ShvProbe\\" + entry.cFileName + L"\\journal.ndjson";
        HANDLE file = CreateFileW(name.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) continue;
        char bytes[16385] = {}; DWORD count = 0;
        if (ReadFile(file, bytes, 16384, &count, nullptr)) { bytes[count] = 0; found = std::strstr(bytes, "\"stage\":\"capture-terminal\"") != nullptr; }
        CloseHandle(file); if (found) break;
    } while (FindNextFileW(search, &entry));
    FindClose(search); return found;
}
class FixtureWindow {
    HWND window = nullptr;
    static LRESULT CALLBACK Procedure(HWND handle, UINT message, WPARAM wparam, LPARAM lparam) {
        if (message == WM_CLOSE) { DestroyWindow(handle); return 0; }
        return DefWindowProcW(handle, message, wparam, lparam);
    }
public:
    explicit FixtureWindow(bool activate) {
        WNDCLASSW type{}; type.lpfnWndProc = Procedure; type.hInstance = GetModuleHandleW(nullptr);
        type.lpszClassName = L"RichAudio.ShvProbe.OfflineFixture"; type.hCursor = LoadCursorW(nullptr, MAKEINTRESOURCEW(32512));
        if (!RegisterClassW(&type) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS) throw std::runtime_error("fixture window class");
        window = CreateWindowExW(activate ? 0 : WS_EX_NOACTIVATE, type.lpszClassName,
            L"RichAudio offline fixture - no global keyboard input", WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
            40, 40, 500, 100, nullptr, nullptr, type.hInstance, nullptr);
        if (!window) throw std::runtime_error("fixture window creation");
        ShowWindow(window, activate ? SW_SHOWNORMAL : SW_SHOWNOACTIVATE); UpdateWindow(window);
        if (activate) SetForegroundWindow(window); // One ordinary activation; no focus bypass.
        DWORD foregroundProcess = 0; GetWindowThreadProcessId(GetForegroundWindow(), &foregroundProcess);
        if ((foregroundProcess == GetCurrentProcessId()) != activate) throw std::runtime_error("OS did not establish requested fixture foreground state");
    }
    ~FixtureWindow() { if (window && IsWindow(window)) DestroyWindow(window); }
};
}
int wmain(int argc, wchar_t** argv) {
    try {
        if (argc == 2 && std::wcscmp(argv[1], L"--window-check") == 0) {
            FixtureWindow window(true); Sleep(100);
            std::puts("PASS ordinary owned foreground window; no native code or global keyboard input"); return 0;
        }
        if (argc != 5) throw std::runtime_error("case, fixture SHA256, ASI SHA256 and case root required");
        const auto executable = ModulePath(nullptr); const auto separator = executable.find_last_of(L"\\/");
        const auto directory = executable.substr(0, separator), fixturePath = directory + L"\\ScriptHookV.dll", asiPath = directory + L"\\RichAudio.OperatingState.Shv.asi";
        const auto expectedFixture = Narrow(argv[2]), expectedAsi = Narrow(argv[3]);
        if (Sha256(fixturePath) != expectedFixture || Sha256(asiPath) != expectedAsi) throw std::runtime_error("fixture or ASI bytes differ");
        const auto caseRoot = Full(argv[4]); if (!SetEnvironmentVariableW(L"LOCALAPPDATA", caseRoot.c_str())) throw std::runtime_error("isolated output root");
        if (!SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)) throw std::runtime_error("DLL search policy");
        HMODULE fixture = LoadLibraryExW(fixturePath.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!fixture || !Same(ModulePath(fixture), fixturePath) || Sha256(ModulePath(fixture)) != expectedFixture) throw std::runtime_error("fixture identity/path");
        using Identity = const char* (*)(); using Configure = void (*)(const char*); using Invoke = int (*)(); using Metric = unsigned long long (*)(int);
        using TargetMetric = unsigned long long (*)(unsigned, unsigned);
        const auto identity = Export<Identity>(fixture, "FixtureIdentity");
        if (std::strcmp(identity(), "RichAudio device-free SHV ABI fixture v3")) throw std::runtime_error("not a fixture DLL");
        const auto configure = Export<Configure>(fixture, "FixtureConfigure");
        const auto invoke = Export<Invoke>(fixture, "FixtureInvokeRegistered");
        const auto metric = Export<Metric>(fixture, "FixtureMetric");
        const auto targetMetric = Export<TargetMetric>(fixture, "FixtureTargetMetric");
        const auto scenario = Narrow(argv[1]);
        FixtureWindow window(scenario != "wrong_foreground");
        configure(scenario.c_str());
        HMODULE asi = LoadLibraryExW(asiPath.c_str(), nullptr, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32);
        if (!asi || !Same(ModulePath(asi), asiPath)) throw std::runtime_error("ASI load/path");
        if (GetModuleHandleW(L"ScriptHookV.dll") != fixture || !Same(ModulePath(fixture), fixturePath)) throw std::runtime_error("ASI did not bind fixture SHV");
        if (!invoke()) throw std::runtime_error("ASI did not register callback");
        const auto targetAfterFirst = metric(4), nativeAfterFirst = metric(3);
        if (!invoke()) throw std::runtime_error("registered callback missing on repeat");
        if (metric(4) != targetAfterFirst || metric(3) != nativeAfterFirst) throw std::runtime_error("completed callback rearmed native acquisition");
        if (metric(0) != 1 || metric(11) != 1 || metric(6) || metric(7) || metric(8) || metric(5) || metric(31)) throw std::runtime_error("ABI/context/argument/fault invariant");
        // Cancellation may return the script callback while the pinned writer
        // completes its bounded grace. Keep this fake process alive for it.
        const ULONGLONG waitStarted = GetTickCount64();
        while (!TerminalJournalExists(caseRoot) && GetTickCount64() - waitStarted < 2000) Sleep(10);
        if (!TerminalJournalExists(caseRoot)) throw std::runtime_error("production writer did not reach its terminal journal");
        const auto outputPath = caseRoot + L"\\fixture-metrics.json";
        HANDLE output = CreateFileW(outputPath.c_str(), GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (output == INVALID_HANDLE_VALUE) throw std::runtime_error("fixture result create-new");
        std::ostringstream json;
        json << "{\"schema\":3,\"fixture\":true,\"actualShvExecuted\":false,\"globalKeyboardInputInjected\":false,\"fixturePathAndHashVerified\":true,\"candidateHashVerified\":true";
        const char* names[]{"registerCalls","unregisterCallsBeforeProcessExit","callbackInvocations","nativeCalls","targetCalls","nativeCallsAfterFault","contextViolations","unexpectedNativeCalls","argumentViolations","scriptWaitCalls","armedJournalSeenAtTarget","keyboardRegistrationCalls","keyboardUnregistrationCalls","deliveredKeyboardCallbackEvents","freshChordEvents","hudCalls","hudCallsAfterTarget","contextCalls","unused18","unused19","readyTextCalls","terminalTextCalls","ownedWindowMinimizations","engineRunningReads","speedReads","advanceEvents","fixtureInputQpc","fixtureTargetQpc","fixtureArmVirtualKey","earlyStopEvents","hudFaultsInjected","callsAfterHudFault","unused32","firstTargetQpc","minimumTargetEntryGapQpc","maximumTargetEntryGapQpc","unused36","unused37","overflowBatches","rawReturnVisibleWhilePostContextBlocked"};
        for (unsigned i = 0; i < sizeof names / sizeof names[0]; ++i) json << ",\"" << names[i] << "\":" << metric(static_cast<int>(i));
        if (metric(4) > 2400) throw std::runtime_error("production exceeded hard fixture target capacity");
        json << ",\"targets\":[";
        for (unsigned i = 0; i < static_cast<unsigned>(metric(4)); ++i) {
            if (i) json << ',';
            json << "{\"index\":" << i + 1 << ",\"beforeQpc\":" << targetMetric(i, 0) << ",\"afterQpc\":" << targetMetric(i, 1)
                << ",\"rawBits\":" << targetMetric(i, 2) << ",\"engineRunningRaw\":" << targetMetric(i, 3)
                << ",\"speedBits\":" << targetMetric(i, 4) << ",\"status\":" << targetMetric(i, 5) << '}';
        }
        json << "]}\n";
        const auto text = json.str();
        if (text.size() > 1024 * 1024) throw std::runtime_error("fixture metrics budget");
        const auto count = static_cast<DWORD>(text.size());
        DWORD written = 0; const bool saved = WriteFile(output, text.data(), count, &written, nullptr) && written == count && FlushFileBuffers(output); CloseHandle(output);
        if (!saved) throw std::runtime_error("fixture result write");
        std::printf("PASS device-free fixture case %s; target calls=%llu; no real SHV/game/audio\n", scenario.c_str(), metric(4));
        // Production ASI deliberately owns its module lifetime through process exit.
        // Do not FreeLibrary while its registered callback or worker can exist.
        return 0;
    } catch (const std::exception& error) { std::fprintf(stderr, "FAIL device-free fixture: %s (Windows error %lu)\n", error.what(), GetLastError()); return 1; }
}
