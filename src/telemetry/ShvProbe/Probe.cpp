#include "ScriptHookVApi.h"
#include "NativeIds.h"
#include <atomic>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <type_traits>

// One measurement per process. No audio, setters, custom memory reads, native
// handler lookup, hash remapping, or provider-valid claim is implemented here.
namespace {
constexpr DWORD DefaultTimeoutMs = 300000;
constexpr DWORD MinimumTimeoutMs = 100;
constexpr DWORD PollIntervalMs = 250;
constexpr DWORD WriterGraceMs = 500;
constexpr DWORD FileBudgetBytes = 16383;
constexpr std::size_t PathCapacity = 1400;

enum class Terminal : std::uint32_t {
    None, Completed, TargetNull, TargetSeh, PreconditionNull, PreconditionSeh,
    ContextChanged, DeadlineBeforeTarget, DeadlineAfterTarget, WriterFailure,
    OnlineContext, WorkerStartFailure
};
enum class Waiting : std::uint32_t {
    None, Loading, Switching, NotPlaying, InvalidPed, NoVehicle, InvalidVehicle,
    WrongModel, NotDriver
};
enum class ReadStatus : std::uint32_t { Good, Null, Seh };

struct NativeRead {
    ReadStatus status;
    DWORD exceptionCode;
    std::uint32_t bits;
    bool pointerPresent;
};
struct Context {
    std::int32_t player;
    std::int32_t ped;
    std::int32_t vehicle;
    std::int32_t driver;
    std::uint32_t model;
    std::uint32_t engineRunningRaw;
    LONGLONG acquisitionStartQpc;
    LONGLONG acquisitionEndQpc;
};
struct ArmRecord {
    Context context;
    LONGLONG requestedQpc;
};
struct ResultRecord {
    Context context;
    NativeRead read;
    LONGLONG beforeQpc;
    LONGLONG afterQpc;
    std::uint64_t failedNative;
    DWORD exceptionCode;
    Terminal terminal;
};
static_assert(std::is_trivially_copyable<ArmRecord>::value, "Fixed POD handoff.");
static_assert(std::is_trivially_copyable<ResultRecord>::value, "Fixed POD handoff.");

struct Session {
    std::atomic<bool> cancel{false};
    std::atomic<bool> deadline{false};
    std::atomic<bool> writerReady{false};
    std::atomic<bool> writerDone{false};
    std::atomic<bool> writerFailed{false};
    std::atomic<bool> armRequested{false};
    std::atomic<bool> permit{false};
    std::atomic<bool> producerDone{false};
    std::atomic<bool> watchdogStop{false};
    std::atomic<bool> targetStarted{false};
    std::atomic<bool> targetReturned{false};
    std::atomic<std::uint32_t> polls{0};
    std::atomic<std::uint32_t> lastWaiting{0};
    DWORD timeoutMs = DefaultTimeoutMs;
    DWORD processId = 0;
    ULONGLONG startTick = 0;
    LONGLONG frequency = 0;
    LONGLONG startQpc = 0;
    ArmRecord arm{};
    ResultRecord result{};
};
Session state;
std::atomic<bool> runOnce{false};
std::atomic<bool> targetOnce{false};

bool Expired() noexcept {
    if (state.cancel.load(std::memory_order_acquire)) return true;
    if (GetTickCount64() - state.startTick < state.timeoutMs) return false;
    state.deadline.store(true, std::memory_order_release);
    state.cancel.store(true, std::memory_order_release);
    return true;
}

LONGLONG Qpc() noexcept {
    LARGE_INTEGER value{};
    return QueryPerformanceCounter(&value) ? value.QuadPart : 0;
}

// This narrow function contains only POD locals, so MSVC SEH can cover both
// framework dispatch and immediate result copy without C++ unwinding objects.
// SEH cannot guarantee interception of a framework fatal/termination path.
NativeRead Invoke(std::uint64_t hash, const UINT64* arguments, unsigned count) noexcept {
    NativeRead read{};
    __try {
        nativeInit(hash);
        for (unsigned i = 0; i < count; ++i) nativePush64(arguments[i]);
        UINT64* result = nativeCall();
        read.pointerPresent = result != nullptr;
        if (result == nullptr) {
            read.status = ReadStatus::Null;
        } else {
            // Copy the low four result bytes BEFORE any later native or yield.
            const unsigned char* source = reinterpret_cast<const unsigned char*>(result);
            unsigned char* destination = reinterpret_cast<unsigned char*>(&read.bits);
            for (unsigned i = 0; i < sizeof(read.bits); ++i) destination[i] = source[i];
            read.status = ReadStatus::Good;
        }
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        read.status = ReadStatus::Seh;
        read.exceptionCode = GetExceptionCode();
    }
    return read;
}

UINT64 Handle(std::int32_t value) noexcept {
    return static_cast<UINT64>(static_cast<std::int64_t>(value));
}
std::int32_t Signed(std::uint32_t value) noexcept {
    std::int32_t result;
    std::memcpy(&result, &value, sizeof(result));
    return result;
}

bool Read(std::uint64_t hash, std::uint32_t& bits, UINT64 a = 0, UINT64 b = 0,
          UINT64 c = 0, unsigned count = 0) noexcept {
    if (Expired()) return false;
    const UINT64 arguments[3]{a, b, c};
    const NativeRead read = Invoke(hash, arguments, count);
    if (read.status != ReadStatus::Good) {
        state.result.failedNative = hash;
        state.result.exceptionCode = read.exceptionCode;
        state.result.terminal = read.status == ReadStatus::Null
            ? Terminal::PreconditionNull : Terminal::PreconditionSeh;
        return false;
    }
    bits = read.bits;
    return true;
}

// Repeated eligibility polls are capped at four per second. After a durable arm
// acknowledgement, a separate one-off revalidation protects the target handoff.
bool Preconditions(Context& context, bool& eligible) noexcept {
    eligible = false;
    context = Context{};
    context.acquisitionStartQpc = Qpc();
    std::uint32_t value = 0;
    if (!Read(NativeIds::NetworkGame, value)) return false;
    if (value != 0) { state.result.terminal = Terminal::OnlineContext; return false; }
    if (!Read(NativeIds::NetworkSession, value)) return false;
    if (value != 0) { state.result.terminal = Terminal::OnlineContext; return false; }
    if (!Read(NativeIds::IsLoading, value)) return false;
    if (value != 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::Loading)); return true; }
    if (!Read(NativeIds::PlayerSwitch, value)) return false;
    if (value != 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::Switching)); return true; }
    if (!Read(NativeIds::PlayerId, value)) return false;
    context.player = Signed(value);
    if (context.player < 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::NotPlaying)); return true; }
    if (!Read(NativeIds::PlayerPlaying, value, Handle(context.player), 0, 0, 1)) return false;
    if (value == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::NotPlaying)); return true; }
    if (!Read(NativeIds::PlayerPed, value)) return false;
    context.ped = Signed(value);
    if (context.ped == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidPed)); return true; }
    if (!Read(NativeIds::EntityExists, value, Handle(context.ped), 0, 0, 1)) return false;
    if (value == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidPed)); return true; }
    if (!Read(NativeIds::EntityIsPed, value, Handle(context.ped), 0, 0, 1)) return false;
    if (value == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidPed)); return true; }
    if (!Read(NativeIds::EntityDead, value, Handle(context.ped), 0, 0, 2)) return false;
    if (value != 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidPed)); return true; }
    if (!Read(NativeIds::PedVehicle, value, Handle(context.ped), 0, 0, 2)) return false;
    context.vehicle = Signed(value);
    if (context.vehicle == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::NoVehicle)); return true; }
    if (!Read(NativeIds::EntityExists, value, Handle(context.vehicle), 0, 0, 1)) return false;
    if (value == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidVehicle)); return true; }
    if (!Read(NativeIds::EntityIsVehicle, value, Handle(context.vehicle), 0, 0, 1)) return false;
    if (value == 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidVehicle)); return true; }
    if (!Read(NativeIds::EntityDead, value, Handle(context.vehicle), 0, 0, 2)) return false;
    if (value != 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::InvalidVehicle)); return true; }
    if (!Read(NativeIds::EntityModel, context.model, Handle(context.vehicle), 0, 0, 1)) return false;
    if (context.model != NativeIds::BatiModel) {
        state.lastWaiting.store(static_cast<unsigned>(Waiting::WrongModel)); return true;
    }
    if (!Read(NativeIds::VehicleSeatPed, value, Handle(context.vehicle), Handle(-1), 0, 3)) return false;
    context.driver = Signed(value);
    if (context.driver != context.ped) { state.lastWaiting.store(static_cast<unsigned>(Waiting::NotDriver)); return true; }
    if (!Read(NativeIds::EngineRunning, context.engineRunningRaw, Handle(context.vehicle), 0, 0, 1)) return false;
    context.acquisitionEndQpc = Qpc();
    state.lastWaiting.store(static_cast<unsigned>(Waiting::None));
    eligible = true;
    return true;
}

bool SameIdentity(const Context& a, const Context& b) noexcept {
    return a.player == b.player && a.ped == b.ped && a.vehicle == b.vehicle
        && a.model == b.model && a.driver == b.driver;
}

const char* TerminalName(Terminal terminal) noexcept {
    switch (terminal) {
    case Terminal::Completed: return "completed-unvalidated";
    case Terminal::TargetNull: return "target-null";
    case Terminal::TargetSeh: return "target-seh";
    case Terminal::PreconditionNull: return "precondition-null";
    case Terminal::PreconditionSeh: return "precondition-seh";
    case Terminal::ContextChanged: return "context-changed";
    case Terminal::DeadlineBeforeTarget: return "deadline-before-target";
    case Terminal::DeadlineAfterTarget: return "deadline-during-target-returned";
    case Terminal::WriterFailure: return "journal-failure";
    case Terminal::OnlineContext: return "online-context";
    case Terminal::WorkerStartFailure: return "worker-start-failure";
    default: return "not-completed";
    }
}

// Writer-only bounded formatting. No captured string or path enters JSON.
struct Text {
    char bytes[8192]{};
    std::size_t used = 0;
    bool good = true;
    void Add(const char* value) noexcept {
        const std::size_t length = std::strlen(value);
        if (!good || length >= sizeof(bytes) - used) { good = false; return; }
        std::memcpy(bytes + used, value, length);
        used += length;
    }
    template<typename T> void Number(T value) noexcept {
        if (!good) return;
        const auto result = std::to_chars(bytes + used, bytes + sizeof(bytes) - 1, value);
        if (result.ec != std::errc{}) { good = false; return; }
        used = static_cast<std::size_t>(result.ptr - bytes);
    }
    void Float(float value) noexcept {
        if (!std::isfinite(value)) { Add("null"); return; }
        const auto result = std::to_chars(bytes + used, bytes + sizeof(bytes) - 1,
            value, std::chars_format::general, 9);
        if (result.ec != std::errc{}) { good = false; return; }
        used = static_cast<std::size_t>(result.ptr - bytes);
    }
    void Hex64(std::uint64_t value) noexcept {
        constexpr char digits[] = "0123456789ABCDEF";
        char formatted[17]{};
        for (unsigned i = 0; i < 16; ++i) {
            formatted[15 - i] = digits[value & 15];
            value >>= 4;
        }
        Add(formatted);
    }
};

void ContextJson(Text& text, const Context& context) noexcept {
    text.Add("{\"player\":"); text.Number(context.player);
    text.Add(",\"ped\":"); text.Number(context.ped);
    text.Add(",\"vehicle\":"); text.Number(context.vehicle);
    text.Add(",\"driver\":"); text.Number(context.driver);
    text.Add(",\"model\":"); text.Number(context.model);
    text.Add(",\"engineRunningRaw\":"); text.Number(context.engineRunningRaw);
    text.Add(",\"acquisitionStartQpc\":"); text.Number(context.acquisitionStartQpc);
    text.Add(",\"acquisitionEndQpc\":"); text.Number(context.acquisitionEndQpc);
    text.Add("}");
}

bool AbsoluteLocalPath(const wchar_t* path) noexcept {
    return ((path[0] >= L'A' && path[0] <= L'Z') || (path[0] >= L'a' && path[0] <= L'z'))
        && path[1] == L':' && path[2] == L'\\';
}

// Validate every component. Created directories and files are never overwritten.
bool PlainDirectories(const wchar_t* path, bool create, bool newLeaf) noexcept {
    wchar_t part[PathCapacity]{};
    if (wcsncpy_s(part, path, _TRUNCATE) != 0 || !AbsoluteLocalPath(part)) return false;
    const std::size_t length = std::wcslen(part);
    if (length < 3 || length >= PathCapacity - 1) return false;
    for (std::size_t i = 3; i <= length; ++i) {
        if (part[i] != L'\\' && part[i] != L'\0') continue;
        const wchar_t saved = part[i]; part[i] = L'\0';
        const bool leaf = i == length;
        DWORD attributes = GetFileAttributesW(part);
        if (attributes == INVALID_FILE_ATTRIBUTES) {
            if (!create || !CreateDirectoryW(part, nullptr)) return false;
            attributes = GetFileAttributesW(part);
        } else if (leaf && newLeaf) {
            return false;
        }
        if (attributes == INVALID_FILE_ATTRIBUTES || (attributes & FILE_ATTRIBUTE_DIRECTORY) == 0
            || (attributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) return false;
        part[i] = saved;
    }
    return true;
}

bool CapturePath(wchar_t* sessionPath, std::size_t capacity) noexcept {
    wchar_t environment[1024]{};
    const DWORD count = GetEnvironmentVariableW(L"LOCALAPPDATA", environment, 1024);
    if (count == 0 || count >= 1024 || !AbsoluteLocalPath(environment)) return false;
    wchar_t root[PathCapacity]{};
    if (GetFullPathNameW(environment, static_cast<DWORD>(PathCapacity), root, nullptr) == 0
        || !AbsoluteLocalPath(root) || !PlainDirectories(root, false, false)) return false;
    FILETIME creation{}, exit{}, kernel{}, user{};
    if (!GetProcessTimes(GetCurrentProcess(), &creation, &exit, &kernel, &user)) return false;
    const unsigned long long created = (static_cast<unsigned long long>(creation.dwHighDateTime) << 32)
        | creation.dwLowDateTime;
    wchar_t parent[PathCapacity]{};
    if (_snwprintf_s(parent, _TRUNCATE, L"%s\\RichAudio\\ShvProbe", root) < 0
        || !PlainDirectories(parent, true, false)) return false;
    if (_snwprintf_s(sessionPath, capacity, _TRUNCATE, L"%s\\%lu-%016llx",
        parent, state.processId, created) < 0) return false;
    return PlainDirectories(sessionPath, true, true);
}

HANDLE NewFile(const wchar_t* directory, const wchar_t* name) noexcept {
    wchar_t path[PathCapacity]{};
    if (_snwprintf_s(path, _TRUNCATE, L"%s\\%s", directory, name) < 0
        || !PlainDirectories(directory, false, false)) return INVALID_HANDLE_VALUE;
    HANDLE file = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, nullptr, CREATE_NEW,
        FILE_ATTRIBUTE_NORMAL | FILE_FLAG_OPEN_REPARSE_POINT | FILE_FLAG_WRITE_THROUGH, nullptr);
    if (file == INVALID_HANDLE_VALUE) return file;
    BY_HANDLE_FILE_INFORMATION information{};
    if (!GetFileInformationByHandle(file, &information)
        || (information.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0
        || !PlainDirectories(directory, false, false)) {
        CloseHandle(file); return INVALID_HANDLE_VALUE;
    }
    return file;
}

// Hold every ancestor open without write/delete sharing while creating/writing
// the capture. A checked directory cannot then be replaced with a reparse point
// between path validation and CREATE_NEW. Fail closed on sharing/access errors.
struct DirectoryGuards {
    HANDLE handles[128]{};
    unsigned count = 0;
    ~DirectoryGuards() noexcept {
        for (unsigned i = 0; i < count; ++i) CloseHandle(handles[i]);
    }
    bool Lock(const wchar_t* path) noexcept {
        wchar_t part[PathCapacity]{};
        if (wcsncpy_s(part, path, _TRUNCATE) != 0 || !AbsoluteLocalPath(part)) return false;
        const std::size_t length = std::wcslen(part);
        for (std::size_t i = 2; i <= length; ++i) {
            if (part[i] != L'\\' && part[i] != L'\0') continue;
            const bool volumeRoot = i == 2;
            const wchar_t saved = part[volumeRoot ? 3 : i];
            part[volumeRoot ? 3 : i] = L'\0';
            if (count >= 128) return false;
            HANDLE directory = CreateFileW(part, FILE_READ_ATTRIBUTES, FILE_SHARE_READ, nullptr,
                OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT, nullptr);
            if (directory == INVALID_HANDLE_VALUE) return false;
            BY_HANDLE_FILE_INFORMATION info{};
            if (!GetFileInformationByHandle(directory, &info)
                || (info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) == 0
                || (info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0) {
                CloseHandle(directory); return false;
            }
            handles[count++] = directory;
            part[volumeRoot ? 3 : i] = saved;
        }
        return true;
    }
};

bool WriteText(HANDLE file, const Text& text, DWORD& totalBytes, bool flush) noexcept {
    if (!text.good || text.used > FileBudgetBytes || totalBytes > FileBudgetBytes - text.used) return false;
    DWORD offset = 0;
    const DWORD length = static_cast<DWORD>(text.used);
    while (offset < length) {
        DWORD written = 0;
        if (!WriteFile(file, text.bytes + offset, length - offset, &written, nullptr) || written == 0) return false;
        offset += written;
    }
    totalBytes += length;
    return !flush || FlushFileBuffers(file) != FALSE;
}

void MarkWriterFailure() noexcept {
    state.writerFailed.store(true, std::memory_order_release);
    state.cancel.store(true, std::memory_order_release);
    state.writerDone.store(true, std::memory_order_release);
}

Text FinalJson(bool completedProducer) noexcept {
    Text text;
    const bool attempted = state.targetStarted.load(std::memory_order_acquire);
    const bool returned = state.targetReturned.load(std::memory_order_acquire);
    const bool deadline = state.deadline.load(std::memory_order_acquire);
    ResultRecord result{};
    if (completedProducer) result = state.result; // release/acquire publishes POD.
    const char* terminal = completedProducer ? TerminalName(result.terminal)
        : (attempted ? "watchdog-native-outcome-unobserved" : "deadline-before-target");
    float value = 0.0f;
    std::memcpy(&value, &result.read.bits, sizeof(value));
    const char* classification = attempted ? "outcome-unobserved" : "not-attempted";
    if (completedProducer && attempted) {
        if (result.read.status == ReadStatus::Seh) classification = "seh";
        else if (!result.read.pointerPresent) classification = "null";
        else if (!std::isfinite(value)) classification = "nonfinite";
        else if (value < 0.0f || value > 1.0f) classification = "out-of-plausible-range";
        else if (value == 0.0f) classification = "zero";
        else classification = "finite-unvalidated";
    }
    text.Add("{\"schema\":1,\"purpose\":\"one-call-operating-state-diagnostic\",\"measuredRPM\":false,\"providerValid\":false,");
    text.Add("\"terminalReason\":\""); text.Add(terminal);
    text.Add("\",\"targetHash\":\"F9DDA40BC293A61E\",\"targetAttempts\":"); text.Number(attempted ? 1 : 0);
    text.Add(",\"targetReturned\":"); text.Add(returned ? "true" : "false");
    text.Add(",\"producerCompleted\":"); text.Add(completedProducer ? "true" : "false");
    text.Add(",\"deadlineReached\":"); text.Add(deadline ? "true" : "false");
    text.Add(",\"watchdogCanPreemptNative\":false,\"unknownNativeFailureIsContained\":false,");
    text.Add("\"resultPointerPresent\":"); text.Add(completedProducer && result.read.pointerPresent ? "true" : "false");
    text.Add(",\"rawBits\":");
    if (completedProducer && attempted && result.read.status == ReadStatus::Good) text.Number(result.read.bits); else text.Add("null");
    text.Add(",\"rawFloat\":");
    if (completedProducer && attempted && result.read.status == ReadStatus::Good) text.Float(value); else text.Add("null");
    text.Add(",\"classification\":\""); text.Add(classification); text.Add("\",\"exceptionCode\":");
    text.Number(completedProducer ? (result.read.exceptionCode != 0 ? result.read.exceptionCode : result.exceptionCode) : 0);
    text.Add(",\"failedNativeHash\":\""); text.Hex64(completedProducer ? result.failedNative : 0);
    text.Add("\"");
    text.Add(",\"timeoutMs\":"); text.Number(state.timeoutMs);
    text.Add(",\"processId\":"); text.Number(state.processId);
    text.Add(",\"qpcFrequency\":"); text.Number(state.frequency);
    text.Add(",\"sessionStartQpc\":"); text.Number(state.startQpc);
    text.Add(",\"targetBeforeQpc\":"); text.Number(completedProducer ? result.beforeQpc : 0);
    text.Add(",\"targetAfterQpc\":"); text.Number(completedProducer ? result.afterQpc : 0);
    text.Add(",\"eligibilityPolls\":"); text.Number(state.polls.load());
    text.Add(",\"lastWaitingCode\":"); text.Number(state.lastWaiting.load());
    text.Add(",\"armedMarkerIsInvocationProof\":false,\"context\":");
    if (completedProducer) ContextJson(text, result.context);
    else if (state.armRequested.load(std::memory_order_acquire)) ContextJson(text, state.arm.context);
    else ContextJson(text, Context{});
    text.Add("}\n");
    return text;
}

DWORD WINAPI Writer(void*) noexcept {
    wchar_t directory[PathCapacity]{};
    if (!CapturePath(directory, PathCapacity)) { MarkWriterFailure(); return 0; }
    DirectoryGuards guards;
    if (!guards.Lock(directory)) { MarkWriterFailure(); return 0; }
    HANDLE journal = NewFile(directory, L"journal.ndjson");
    if (journal == INVALID_HANDLE_VALUE) { MarkWriterFailure(); return 0; }
    DWORD totalBytes = 0;
    Text opened;
    opened.Add("{\"schema\":1,\"stage\":\"capture-open\",\"measuredRPM\":false,\"providerValid\":false}\n");
    if (!WriteText(journal, opened, totalBytes, true)) {
        CloseHandle(journal); MarkWriterFailure(); return 0;
    }
    state.writerReady.store(true, std::memory_order_release);
    bool armed = false;
    ULONGLONG cancelledAt = 0;
    for (;;) {
        if (!armed && state.armRequested.load(std::memory_order_acquire)) {
            Text arm;
            arm.Add("{\"schema\":1,\"stage\":\"armed-not-proof-of-invocation\",\"invocationProven\":false,\"targetHash\":\"F9DDA40BC293A61E\",\"requestedQpc\":");
            arm.Number(state.arm.requestedQpc); arm.Add(",\"context\":"); ContextJson(arm, state.arm.context); arm.Add("}\n");
            if (!WriteText(journal, arm, totalBytes, true)) {
                CloseHandle(journal); MarkWriterFailure(); return 0;
            }
            armed = true;
            // A late filesystem completion never grants permission after cancel.
            if (!state.cancel.load(std::memory_order_acquire)) state.permit.store(true, std::memory_order_release);
        }
        const bool done = state.producerDone.load(std::memory_order_acquire);
        if (done) break;
        if (state.cancel.load(std::memory_order_acquire)) {
            if (cancelledAt == 0) cancelledAt = GetTickCount64();
            if (GetTickCount64() - cancelledAt >= WriterGraceMs) break;
        }
        Sleep(5);
    }
    const bool producerDone = state.producerDone.load(std::memory_order_acquire);
    const Text final = FinalJson(producerDone);
    HANDLE capture = NewFile(directory, L"capture.json");
    bool okay = capture != INVALID_HANDLE_VALUE;
    if (okay) {
        okay = WriteText(capture, final, totalBytes, true);
        CloseHandle(capture);
    }
    Text ended;
    ended.Add("{\"schema\":1,\"stage\":\"capture-terminal\",\"captureWritten\":");
    ended.Add(okay ? "true" : "false"); ended.Add(",\"measuredRPM\":false,\"providerValid\":false}\n");
    okay = WriteText(journal, ended, totalBytes, true) && okay;
    CloseHandle(journal);
    if (!okay) state.writerFailed.store(true, std::memory_order_release);
    state.writerDone.store(true, std::memory_order_release);
    return 0;
}

// No native calls, files, formatting, logging or process control on this thread.
DWORD WINAPI Watchdog(void*) noexcept {
    while (!state.watchdogStop.load(std::memory_order_acquire)) {
        if (GetTickCount64() - state.startTick >= state.timeoutMs) {
            state.deadline.store(true, std::memory_order_release);
            state.cancel.store(true, std::memory_order_release);
            return 0;
        }
        Sleep(5);
    }
    return 0;
}

DWORD Timeout() noexcept {
    wchar_t value[16]{};
    const DWORD length = GetEnvironmentVariableW(L"RICHAUDIO_SHV_PROBE_TIMEOUT_MS", value, 16);
    if (length == 0 || length >= 16) return DefaultTimeoutMs;
    DWORD parsed = 0;
    for (DWORD i = 0; i < length; ++i) {
        if (value[i] < L'0' || value[i] > L'9' || parsed > DefaultTimeoutMs) return DefaultTimeoutMs;
        parsed = parsed * 10 + static_cast<DWORD>(value[i] - L'0');
    }
    return parsed >= MinimumTimeoutMs && parsed <= DefaultTimeoutMs ? parsed : DefaultTimeoutMs;
}

void Finish(Terminal terminal) noexcept {
    state.result.terminal = terminal;
    state.producerDone.store(true, std::memory_order_release);
}

void ScriptMain() {
    bool expected = false;
    if (!runOnce.compare_exchange_strong(expected, true)) return;
    HMODULE pinned = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        reinterpret_cast<LPCWSTR>(&ScriptMain), &pinned)) return;
    // PIN is intentionally process-lifetime: hot-unload is unsupported. No
    // FreeLibrary is issued; rollback/removal is only after process exit.
    state.processId = GetCurrentProcessId();
    state.startTick = GetTickCount64();
    state.startQpc = Qpc();
    LARGE_INTEGER frequency{};
    if (!QueryPerformanceFrequency(&frequency)) return;
    state.frequency = frequency.QuadPart;
    state.timeoutMs = Timeout();
    HANDLE writer = CreateThread(nullptr, 0, Writer, nullptr, 0, nullptr);
    if (writer == nullptr) return;
    HANDLE watchdog = CreateThread(nullptr, 0, Watchdog, nullptr, 0, nullptr);
    if (watchdog == nullptr) {
        Finish(Terminal::WorkerStartFailure);
        state.cancel.store(true, std::memory_order_release);
        CloseHandle(writer); return;
    }
    while (!state.writerReady.load(std::memory_order_acquire)
        && !state.cancel.load(std::memory_order_acquire)) scriptWait(10);

    Context observed{};
    ULONGLONG nextPoll = 0;
    while (!state.cancel.load(std::memory_order_acquire)) {
        const ULONGLONG now = GetTickCount64();
        if (now < nextPoll) { scriptWait(10); continue; }
        nextPoll = now + PollIntervalMs;
        state.polls.fetch_add(1);
        bool eligible = false;
        if (!Preconditions(observed, eligible)) break;
        if (!eligible) { scriptWait(10); continue; }
        state.arm.context = observed;
        state.arm.requestedQpc = Qpc();
        state.armRequested.store(true, std::memory_order_release);
        while (!state.permit.load(std::memory_order_acquire)
            && !state.cancel.load(std::memory_order_acquire)) scriptWait(10);
        if (Expired()) break;
        Context current{};
        bool currentEligible = false;
        if (!Preconditions(current, currentEligible)) break;
        if (!currentEligible || !SameIdentity(observed, current)) {
            state.result.terminal = Terminal::ContextChanged; break;
        }
        state.result.context = current;
        if (Expired()) break;
        bool notAttempted = false;
        if (!targetOnce.compare_exchange_strong(notAttempted, true)) break;
        state.result.beforeQpc = Qpc();
        state.targetStarted.store(true, std::memory_order_release);
        const UINT64 arguments[1]{Handle(current.vehicle)};
        state.result.read = Invoke(NativeIds::CurrentRevRatio, arguments, 1);
        state.result.afterQpc = Qpc();
        state.targetReturned.store(true, std::memory_order_release);
        // Absolutely no native calls follow this point, including on failure.
        if (state.deadline.load(std::memory_order_acquire)
            || GetTickCount64() - state.startTick >= state.timeoutMs) {
            state.deadline.store(true, std::memory_order_release);
            state.result.terminal = Terminal::DeadlineAfterTarget;
        } else if (state.result.read.status == ReadStatus::Null) {
            state.result.terminal = Terminal::TargetNull;
        } else if (state.result.read.status == ReadStatus::Seh) {
            state.result.terminal = Terminal::TargetSeh;
        } else {
            state.result.terminal = Terminal::Completed;
        }
        break;
    }
    Terminal terminal = state.result.terminal;
    if (state.writerFailed.load(std::memory_order_acquire)) terminal = Terminal::WriterFailure;
    else if (terminal == Terminal::None) terminal = Terminal::DeadlineBeforeTarget;
    Finish(terminal);
    while (!state.writerDone.load(std::memory_order_acquire)
        && !state.cancel.load(std::memory_order_acquire)) scriptWait(10);
    state.watchdogStop.store(true, std::memory_order_release);
    CloseHandle(watchdog);
    CloseHandle(writer);
}
} // namespace

extern "C" BOOL WINAPI DllMain(HMODULE module, DWORD reason, LPVOID) {
    if (reason == DLL_PROCESS_ATTACH) {
        // /MT needs CRT thread attach/detach notifications. Do not disable them.
        scriptRegister(module, ScriptMain);
    } else if (reason == DLL_PROCESS_DETACH) {
        scriptUnregister(module);
    }
    return TRUE;
}
