#include "ScriptHookVApi.h"
#include "NativeIds.h"
#include <atomic>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <type_traits>

// One measurement per process. No audio, vehicle setters, custom memory reads, native
// handler lookup, hash remapping, or provider-valid claim is implemented here.
namespace {
constexpr DWORD DefaultTimeoutMs = 300000;
constexpr DWORD MinimumTimeoutMs = 100;
constexpr DWORD PollIntervalMs = 250;
constexpr DWORD WriterGraceMs = 500;
constexpr DWORD FileBudgetBytes = 16383;
constexpr std::size_t PathCapacity = 1400;
constexpr DWORD GateDurationMs = 2000;
constexpr DWORD GateSampleIntervalMs = 100;
constexpr DWORD GateMaximumGapMs = 250;
constexpr DWORD PostArmLimitMs = 3000;
constexpr DWORD TerminalHudMs = 5000;
constexpr unsigned MaximumGateSamples = 25;
constexpr float StationaryToleranceMps = 0.10f;
constexpr unsigned ControlBit = 1, ShiftBit = 2, BackslashBit = 4, AltBit = 8;
constexpr unsigned ChordBits = ControlBit | ShiftBit | BackslashBit;

enum class Terminal : std::uint32_t {
    None, Completed, TargetNull, TargetSeh, PreconditionNull, PreconditionSeh,
    ContextChanged, DeadlineBeforeTarget, DeadlineAfterTarget, WriterFailure,
    OnlineContext, WorkerStartFailure, ArmContextFailed, ForegroundLost,
    GateEngineFalse, GateSpeedNonfinite, GateNotStationary, GateIdentityChanged,
    GateContextInvalid, GateSampleGap, GateTimeout, GateSampleLimit, HudSeh, GateSpeedInvalid
};
enum class Waiting : std::uint32_t {
    None, Loading, Switching, NotPlaying, InvalidPed, NoVehicle, InvalidVehicle,
    WrongModel, NotDriver, Paused
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
    std::uint32_t speedBits;
    bool speedObserved;
    LONGLONG acquisitionStartQpc;
    LONGLONG acquisitionEndQpc;
};
struct OperatorArm {
    bool accepted;
    DWORD terminalVk;
    LONGLONG inputBeforeQpc;
    LONGLONG inputAfterQpc;
    LONGLONG observedQpc;
    Context context;
};
struct GateRecord {
    unsigned count;
    LONGLONG firstQpc;
    LONGLONG lastQpc;
    LONGLONG maxGapQpc;
    bool qualified;
    bool preTargetRevalidated;
    Context samples[MaximumGateSamples];
};
struct ArmRecord {
    Context context;
    LONGLONG requestedQpc;
    unsigned gateSamples;
    LONGLONG gateFirstQpc;
    LONGLONG gateLastQpc;
    LONGLONG gateMaxGapQpc;
    GateRecord gate;
};
struct ResultRecord {
    Context context;
    NativeRead read;
    LONGLONG beforeQpc;
    LONGLONG afterQpc;
    std::uint64_t failedNative;
    DWORD exceptionCode;
    Terminal terminal;
    OperatorArm operatorArm;
    GateRecord gate;
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
    std::atomic<bool> operatorRequested{false};
    std::atomic<bool> nativeFault{false};
    std::atomic<DWORD> presentationException{0};
    std::atomic<std::uint32_t> polls{0};
    std::atomic<std::uint32_t> lastWaiting{0};
    DWORD timeoutMs = DefaultTimeoutMs;
    DWORD processId = 0;
    ULONGLONG startTick = 0;
    LONGLONG frequency = 0;
    LONGLONG startQpc = 0;
    OperatorArm operatorArm{}; // immutable after operatorRequested release
    GateRecord gate{}; // script-owned until copied into published result
    ArmRecord arm{};
    ResultRecord result{};
};
Session state;
std::atomic<bool> runOnce{false};
std::atomic<bool> targetOnce{false};
struct InputState {
    std::atomic<unsigned> down{0};
    std::atomic<unsigned> fresh{0};
    std::atomic<bool> accept{false};
    std::atomic<unsigned> eventState{0}; // 0 empty, 1 writing, 2 published
    std::atomic<DWORD> terminalVk{0};
    std::atomic<DWORD> eventTerminalVk{0};
    std::atomic<LONGLONG> beforeQpc{0};
    std::atomic<LONGLONG> afterQpc{0};
    std::atomic<std::uint64_t> generation{0};
    std::atomic<std::uint64_t> eventGeneration{0};
};
InputState input;

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

// SDK notification callback: atomics and QPC only. It consumes no controls and
// performs no native, filesystem, formatting, foreground, or host operations.
void Keyboard(DWORD key, WORD, BYTE, BOOL, BOOL withAlt, BOOL wasDown, BOOL isUp) {
    const auto generation = input.generation.load(std::memory_order_acquire);
    unsigned bit = 0;
    if (key == VK_CONTROL || key == VK_LCONTROL || key == VK_RCONTROL) bit = ControlBit;
    else if (key == VK_SHIFT || key == VK_LSHIFT || key == VK_RSHIFT) bit = ShiftBit;
    else if (key == VK_OEM_5 || key == VK_OEM_102) bit = BackslashBit;
    else if (key == VK_MENU || key == VK_LMENU || key == VK_RMENU) bit = AltBit;
    if (withAlt && !(bit == AltBit && isUp)) input.down.fetch_or(AltBit);
    if (bit == 0) return;
    if (isUp) {
        input.down.fetch_and(~bit);
        input.fresh.fetch_and(~bit);
        return;
    }
    const unsigned previous = input.down.fetch_or(bit);
    if (!wasDown) input.fresh.fetch_or(bit);
    if (bit == BackslashBit) input.terminalVk.store(key);
    const unsigned now = previous | bit;
    if (wasDown || (now & ChordBits) != ChordBits || (now & AltBit) != 0
        || (previous & ChordBits) == ChordBits
        || (input.fresh.load() & ChordBits) != ChordBits || !input.accept.load()) return;
    unsigned empty = 0;
    if (!input.eventState.compare_exchange_strong(empty, 1)) return;
    input.beforeQpc.store(Qpc(), std::memory_order_relaxed);
    input.eventTerminalVk.store(input.terminalVk.load(), std::memory_order_relaxed);
    input.eventGeneration.store(generation, std::memory_order_relaxed);
    input.afterQpc.store(Qpc(), std::memory_order_relaxed);
    input.eventState.store(2, std::memory_order_release);
}

void ResetControls() noexcept {
    input.accept.store(false, std::memory_order_release);
    input.generation.fetch_add(1, std::memory_order_acq_rel);
    input.down.store(0);
    input.fresh.store(0);
    unsigned ready = 2;
    input.eventState.compare_exchange_strong(ready, 0);
}

void ResetReadyGeneration() noexcept {
    input.accept.store(false, std::memory_order_release);
    input.generation.fetch_add(1, std::memory_order_acq_rel);
    input.fresh.store(0);
    // Keep observed held keys: a new eligible vehicle must not inherit a
    // pre-ready chord. All keys must be seen released before a fresh edge.
    unsigned ready = 2;
    input.eventState.compare_exchange_strong(ready, 0);
}

bool OwnForeground() noexcept {
    const HWND window = GetForegroundWindow();
    DWORD owner = 0;
    return window != nullptr && GetWindowThreadProcessId(window, &owner) != 0
        && owner == state.processId;
}

float FloatBits(std::uint32_t bits) noexcept {
    float value;
    std::memcpy(&value, &bits, sizeof(value));
    return value;
}

UINT64 FloatArgument(float value) noexcept {
    UINT64 slot = 0;
    std::memcpy(&slot, &value, sizeof(value));
    return slot;
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
        if (read.status == ReadStatus::Seh) state.nativeFault.store(true);
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
    if (!Read(NativeIds::PauseMenu, value)) return false;
    if (value != 0) { state.lastWaiting.store(static_cast<unsigned>(Waiting::Paused)); return true; }
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
    if (!Read(NativeIds::EntitySpeed, context.speedBits, Handle(context.vehicle), 0, 0, 1)) return false;
    context.speedObserved = true;
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
    case Terminal::ArmContextFailed: return "arm-context-failed";
    case Terminal::ForegroundLost: return "foreground-lost";
    case Terminal::GateEngineFalse: return "gate-engine-not-running";
    case Terminal::GateSpeedNonfinite: return "gate-speed-nonfinite";
    case Terminal::GateSpeedInvalid: return "gate-speed-invalid";
    case Terminal::GateNotStationary: return "gate-not-stationary";
    case Terminal::GateIdentityChanged: return "gate-identity-changed";
    case Terminal::GateContextInvalid: return "gate-context-invalid";
    case Terminal::GateSampleGap: return "gate-sample-gap";
    case Terminal::GateTimeout: return "gate-timeout";
    case Terminal::GateSampleLimit: return "gate-sample-limit";
    case Terminal::HudSeh: return "hud-seh";
    default: return "not-completed";
    }
}

// Void HUD natives have no result-pointer success contract. Only detectable
// faults stop this wrapper; it never reads or interprets their return storage.
DWORD InvokeHud(std::uint64_t hash, const UINT64* arguments, unsigned count) noexcept {
    __try {
        nativeInit(hash);
        for (unsigned i = 0; i < count; ++i) nativePush64(arguments[i]);
        (void)nativeCall();
        return 0;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        return GetExceptionCode();
    }
}

bool HudCall(std::uint64_t hash, const UINT64* arguments, unsigned count) noexcept {
    if (state.nativeFault.load()) return false;
    const DWORD error = InvokeHud(hash, arguments, count);
    if (error == 0) return true;
    state.nativeFault.store(true, std::memory_order_release);
    state.presentationException.store(error, std::memory_order_release);
    // The published measurement record is immutable. A later UI fault cannot
    // erase a known return or race the journal writer's copy of that record.
    if (!state.producerDone.load(std::memory_order_acquire)) {
        state.result.exceptionCode = error;
        state.result.failedNative = hash;
        state.result.terminal = Terminal::HudSeh;
    }
    return false;
}

bool DrawHud(const char* message) noexcept {
    if (!OwnForeground() || state.nativeFault.load()) return !state.nativeFault.load();
    const UINT64 font[1]{0};
    const UINT64 scale[2]{FloatArgument(0.32f), FloatArgument(0.32f)};
    const UINT64 colour[4]{255, 220, 140, 255};
    const UINT64 begin[1]{reinterpret_cast<UINT64>("STRING")};
    const UINT64 text[1]{reinterpret_cast<UINT64>(message)};
    const UINT64 position[3]{FloatArgument(0.02f), FloatArgument(0.80f), 0};
    return HudCall(NativeIds::TextFont, font, 1)
        && HudCall(NativeIds::TextScale, scale, 2)
        && HudCall(NativeIds::TextColour, colour, 4)
        && HudCall(NativeIds::TextOutline, nullptr, 0)
        && HudCall(NativeIds::TextBegin, begin, 1)
        && HudCall(NativeIds::TextAdd, text, 1)
        && HudCall(NativeIds::TextEnd, position, 3);
}

const char* WaitingHud(bool eligible, bool released, const Context& context) noexcept {
    if (!eligible) return "RichAudio telemetry diagnostic (no audio)~n~Wait: offline Story Mode, unpaused, player driving a Bati.";
    if (!released) return "RichAudio telemetry diagnostic (no audio)~n~Eligible Bati. Release Ctrl, Shift and Backslash before arming.";
    if (context.engineRunningRaw == 0) return "RichAudio telemetry diagnostic (no audio)~n~Bati engine query is FALSE. Start engine; arm only at stationary idle.";
    return "RichAudio telemetry diagnostic (no audio)~n~Ready: stationary idle, then press Ctrl + Shift + Backslash.";
}

const char* ResultHud() noexcept {
    switch (state.result.terminal) {
    case Terminal::Completed: {
        if (state.result.read.bits == 0 || state.result.read.bits == 0x80000000U)
            return "RichAudio telemetry diagnostic~n~One call completed: ZERO, still inconclusive. Capture retained; no audio.";
        const float value = FloatBits(state.result.read.bits);
        if (!std::isfinite(value) || value < 0.0f || value > 1.0f)
            return "RichAudio telemetry diagnostic~n~One call completed: INVALID or nonfinite result. Unqualified capture retained.";
        return "RichAudio telemetry diagnostic~n~One call completed. Raw candidate captured; NOT qualified RPM. No audio.";
    }
    case Terminal::GateEngineFalse:
        return "RichAudio telemetry diagnostic~n~STOPPED: engine-running query FALSE. No target call; no override.";
    case Terminal::GateNotStationary:
    case Terminal::GateSpeedNonfinite:
    case Terminal::GateSpeedInvalid:
        return "RichAudio telemetry diagnostic~n~STOPPED: stationary-speed gate failed. No target call.";
    case Terminal::GateIdentityChanged:
    case Terminal::GateContextInvalid:
    case Terminal::ContextChanged:
    case Terminal::ArmContextFailed:
    case Terminal::ForegroundLost:
        return "RichAudio telemetry diagnostic~n~STOPPED: vehicle/driver/game context changed. No target call.";
    case Terminal::GateSampleGap:
    case Terminal::GateSampleLimit:
    case Terminal::GateTimeout:
    case Terminal::DeadlineBeforeTarget:
        return "RichAudio telemetry diagnostic~n~TIMEOUT or unstable observation timing. No target call; no retry.";
    case Terminal::DeadlineAfterTarget:
        return "RichAudio telemetry diagnostic~n~Target returned after its deadline. Unqualified result retained; no retry.";
    default:
        return "RichAudio telemetry diagnostic~n~STOPPED. Inspect the private capture; no retry or audio host.";
    }
}

bool PostArmExpired() noexcept {
    if (Expired()) return true;
    if (state.operatorArm.accepted && Qpc() - state.operatorArm.inputBeforeQpc
        > (state.frequency * PostArmLimitMs) / 1000) {
        state.result.terminal = Terminal::GateTimeout;
        return true;
    }
    return false;
}

bool GateCheck(const Context& context, bool eligible) noexcept {
    if (!OwnForeground()) { state.result.terminal = Terminal::ForegroundLost; return false; }
    if (!eligible) {
        const auto waiting = static_cast<Waiting>(state.lastWaiting.load());
        state.result.terminal = waiting == Waiting::WrongModel || waiting == Waiting::NotDriver
            || waiting == Waiting::NoVehicle || waiting == Waiting::InvalidPed
            || waiting == Waiting::InvalidVehicle ? Terminal::GateIdentityChanged : Terminal::GateContextInvalid;
        return false;
    }
    if (!SameIdentity(state.operatorArm.context, context)) {
        state.result.terminal = Terminal::GateIdentityChanged; return false;
    }
    if (context.engineRunningRaw == 0) {
        state.result.terminal = Terminal::GateEngineFalse; return false;
    }
    const float speed = FloatBits(context.speedBits);
    if (!context.speedObserved || !std::isfinite(speed)) {
        state.result.terminal = Terminal::GateSpeedNonfinite; return false;
    }
    if (speed < 0.0f) {
        state.result.terminal = Terminal::GateSpeedInvalid; return false;
    }
    if (speed > StationaryToleranceMps) {
        state.result.terminal = Terminal::GateNotStationary; return false;
    }
    return true;
}

bool GateSample(const Context& context, bool eligible) noexcept {
    if (state.gate.count >= MaximumGateSamples) {
        state.result.terminal = Terminal::GateSampleLimit; return false;
    }
    // Every actual observation, including a failing one, is retained once.
    state.gate.samples[state.gate.count++] = context;
    const LONGLONG at = context.acquisitionEndQpc != 0 ? context.acquisitionEndQpc : Qpc();
    if (state.gate.count == 1) state.gate.firstQpc = at;
    else {
        const LONGLONG gap = at - state.gate.lastQpc;
        if (gap > state.gate.maxGapQpc) state.gate.maxGapQpc = gap;
        if (gap <= 0 || gap > (state.frequency * GateMaximumGapMs) / 1000) {
            state.gate.lastQpc = at;
            state.result.terminal = Terminal::GateSampleGap; return false;
        }
    }
    state.gate.lastQpc = at;
    return GateCheck(context, eligible);
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
    text.Add(",\"speedObserved\":"); text.Add(context.speedObserved ? "true" : "false");
    text.Add(",\"speedBits\":");
    if (context.speedObserved) text.Number(context.speedBits); else text.Add("null");
    text.Add(",\"speedMps\":");
    if (context.speedObserved) text.Float(FloatBits(context.speedBits)); else text.Add("null");
    text.Add(",\"acquisitionStartQpc\":"); text.Number(context.acquisitionStartQpc);
    text.Add(",\"acquisitionEndQpc\":"); text.Number(context.acquisitionEndQpc);
    text.Add("}");
}

void OperatorJson(Text& text, const OperatorArm& arm) noexcept {
    text.Add("{\"accepted\":"); text.Add(arm.accepted ? "true" : "false");
    text.Add(",\"chord\":\"Ctrl+Shift+Backslash\",\"terminalVk\":"); text.Number(arm.terminalVk);
    text.Add(",\"inputBeforeQpc\":"); text.Number(arm.inputBeforeQpc);
    text.Add(",\"inputAfterQpc\":"); text.Number(arm.inputAfterQpc);
    text.Add(",\"observedQpc\":"); text.Number(arm.observedQpc);
    text.Add(",\"inputClockDescribesCallbackNotHardwareInstant\":true,\"context\":");
    ContextJson(text, arm.context); text.Add("}");
}

void GateJson(Text& text, const GateRecord& gate, const OperatorArm& arm) noexcept {
    text.Add("{\"requiredDurationMs\":2000,\"sampleIntervalMs\":100,\"maxAllowedGapMs\":250,");
    text.Add("\"postArmLimitMs\":3000,\"stationaryToleranceMps\":0.10,\"speedUsedAsRpm\":false,\"sampleCount\":");
    text.Number(gate.count);
    text.Add(",\"firstQpc\":"); text.Number(gate.firstQpc);
    text.Add(",\"lastQpc\":"); text.Number(gate.lastQpc);
    text.Add(",\"maxGapQpc\":"); text.Number(gate.maxGapQpc);
    text.Add(",\"qualified\":"); text.Add(gate.qualified ? "true" : "false");
    text.Add(",\"preTargetRevalidated\":"); text.Add(gate.preTargetRevalidated ? "true" : "false");
    text.Add(",\"samples\":[");
    for (unsigned i = 0; i < gate.count && i < MaximumGateSamples; ++i) {
        const Context& sample = gate.samples[i];
        if (i != 0) text.Add(",");
        text.Add("{\"beforeQpc\":"); text.Number(sample.acquisitionStartQpc);
        text.Add(",\"afterQpc\":"); text.Number(sample.acquisitionEndQpc);
        text.Add(",\"engineRunningRaw\":"); text.Number(sample.engineRunningRaw);
        text.Add(",\"speedBits\":");
        if (sample.speedObserved) text.Number(sample.speedBits); else text.Add("null");
        text.Add(",\"speedMps\":");
        if (sample.speedObserved) text.Float(FloatBits(sample.speedBits)); else text.Add("null");
        text.Add(",\"sameIdentity\":"); text.Add(SameIdentity(arm.context, sample) ? "true" : "false");
        text.Add("}");
    }
    text.Add("]}");
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
    else if (state.operatorRequested.load(std::memory_order_acquire)) result.operatorArm = state.operatorArm;
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
    text.Add("{\"schema\":2,\"purpose\":\"operator-armed-stable-idle-diagnostic\",\"measuredRPM\":false,\"providerValid\":false,");
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
    text.Add(",\"presentationExceptionCodeAtCapture\":"); text.Number(state.presentationException.load());
    text.Add(",\"terminalHudMaxMs\":5000,\"presentationCanFollowDataDeadline\":true,");
    text.Add("\"operatorArming\":"); OperatorJson(text, result.operatorArm);
    text.Add(",\"stableIdleGate\":"); GateJson(text, result.gate, result.operatorArm);
    text.Add(",\"gateSummaryObserved\":"); text.Add(completedProducer ? "true" : "false");
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
    opened.Add("{\"schema\":2,\"stage\":\"capture-open\",\"measuredRPM\":false,\"providerValid\":false}\n");
    if (!WriteText(journal, opened, totalBytes, true)) {
        CloseHandle(journal); MarkWriterFailure(); return 0;
    }
    state.writerReady.store(true, std::memory_order_release);
    bool operatorWritten = false;
    bool armed = false;
    ULONGLONG cancelledAt = 0;
    for (;;) {
        if (!operatorWritten && state.operatorRequested.load(std::memory_order_acquire)) {
            Text operatorEvent;
            operatorEvent.Add("{\"schema\":2,\"stage\":\"operator-armed\",\"operatorArming\":");
            OperatorJson(operatorEvent, state.operatorArm); operatorEvent.Add("}\n");
            if (!WriteText(journal, operatorEvent, totalBytes, true)) {
                CloseHandle(journal); MarkWriterFailure(); return 0;
            }
            operatorWritten = true;
        }
        if (!armed && state.armRequested.load(std::memory_order_acquire)) {
            Text arm;
            arm.Add("{\"schema\":2,\"stage\":\"stable-idle-qualified\",\"marker\":\"armed-not-proof-of-invocation\",\"invocationProven\":false,\"targetHash\":\"F9DDA40BC293A61E\",\"requestedQpc\":");
            arm.Number(state.arm.requestedQpc);
            arm.Add(",\"sampleCount\":"); arm.Number(state.arm.gateSamples);
            arm.Add(",\"firstQpc\":"); arm.Number(state.arm.gateFirstQpc);
            arm.Add(",\"lastQpc\":"); arm.Number(state.arm.gateLastQpc);
            arm.Add(",\"maxGapQpc\":"); arm.Number(state.arm.gateMaxGapQpc);
            arm.Add(",\"context\":"); ContextJson(arm, state.arm.context);
            arm.Add(",\"stableIdleGate\":"); GateJson(arm, state.arm.gate, state.operatorArm);
            arm.Add("}\n");
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
    ended.Add("{\"schema\":2,\"stage\":\"capture-terminal\",\"captureWritten\":");
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
    state.result.operatorArm = state.operatorArm;
    state.result.gate = state.gate;
    state.producerDone.store(true, std::memory_order_release);
}

bool QualifyIdleGate() noexcept {
    state.result.context = state.operatorArm.context;
    if (PostArmExpired() || !GateSample(state.operatorArm.context, true)) return false;
    ULONGLONG nextSample = GetTickCount64() + GateSampleIntervalMs;
    while (state.gate.lastQpc - state.gate.firstQpc < (state.frequency * GateDurationMs) / 1000) {
        if (PostArmExpired()) return false;
        if (!OwnForeground()) { state.result.terminal = Terminal::ForegroundLost; return false; }
        if (!DrawHud("RichAudio telemetry diagnostic~n~Checking the SAME running, stationary Bati for 2 seconds. Keep idle.")) return false;
        const ULONGLONG now = GetTickCount64();
        if (now < nextSample) { scriptWait(0); continue; }
        nextSample = now + GateSampleIntervalMs;
        Context sample{};
        bool eligible = false;
        if (!Preconditions(sample, eligible)) { state.result.context = sample; return false; }
        state.result.context = sample;
        if (!GateSample(sample, eligible)) return false;
    }
    if (PostArmExpired()) return false;
    state.gate.qualified = true;
    state.arm.context = state.result.context;
    state.arm.requestedQpc = Qpc();
    state.arm.gateSamples = state.gate.count;
    state.arm.gateFirstQpc = state.gate.firstQpc;
    state.arm.gateLastQpc = state.gate.lastQpc;
    state.arm.gateMaxGapQpc = state.gate.maxGapQpc;
    state.arm.gate = state.gate;
    state.armRequested.store(true, std::memory_order_release);
    while (!state.permit.load(std::memory_order_acquire)) {
        if (PostArmExpired()) return false;
        if (!OwnForeground()) { state.result.terminal = Terminal::ForegroundLost; return false; }
        if (Qpc() - state.gate.lastQpc > (state.frequency * GateMaximumGapMs) / 1000) {
            state.result.terminal = Terminal::GateSampleGap; return false;
        }
        if (!DrawHud("RichAudio telemetry diagnostic~n~Stable idle observed. Saving the pre-call journal; keep stationary.")) return false;
        scriptWait(0);
    }
    if (PostArmExpired()) return false;
    Context current{};
    bool eligible = false;
    if (!Preconditions(current, eligible)) { state.result.context = current; return false; }
    state.result.context = current;
    if (!GateCheck(current, eligible)) return false;
    const LONGLONG finalGap = current.acquisitionEndQpc - state.gate.lastQpc;
    if (finalGap < 0 || finalGap > (state.frequency * GateMaximumGapMs) / 1000) {
        state.result.terminal = Terminal::GateSampleGap; return false;
    }
    if (PostArmExpired()) return false;
    state.gate.preTargetRevalidated = true;
    return true;
}

void PresentTerminal() noexcept {
    ResetControls();
    if (state.nativeFault.load()) return;
    const ULONGLONG start = GetTickCount64();
    // Presentation is separately bounded to five seconds. It never re-queries
    // the game/vehicle and cannot delay publication of an already known result.
    while (GetTickCount64() - start < TerminalHudMs) {
        if (!DrawHud(ResultHud())) return;
        scriptWait(0);
    }
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
    bool cachedEligible = false;
    bool released = false;
    ULONGLONG nextPoll = 0;
    while (!Expired()) {
        if (!OwnForeground()) {
            ResetControls();
            released = false;
            cachedEligible = false;
            scriptWait(0);
            continue;
        }
        if (input.eventState.load(std::memory_order_acquire) == 2
            && input.eventGeneration.load() != input.generation.load()) {
            unsigned stale = 2;
            input.eventState.compare_exchange_strong(stale, 0);
        }
        if (input.down.load() == 0 && input.eventState.load() == 0) released = true;
        input.accept.store(released && cachedEligible, std::memory_order_release);
        if (input.eventState.load(std::memory_order_acquire) == 2) {
            input.accept.store(false, std::memory_order_release);
            state.operatorArm.accepted = true;
            state.operatorArm.terminalVk = input.eventTerminalVk.load();
            state.operatorArm.inputBeforeQpc = input.beforeQpc.load();
            state.operatorArm.inputAfterQpc = input.afterQpc.load();
            Context atArm{};
            bool eligible = false;
            const bool contextRead = Preconditions(atArm, eligible);
            state.operatorArm.context = atArm;
            state.operatorArm.observedQpc = Qpc();
            state.operatorRequested.store(true, std::memory_order_release);
            state.result.context = atArm;
            if (!contextRead) break;
            if (!eligible) { state.result.terminal = Terminal::ArmContextFailed; break; }
            if (!SameIdentity(observed, atArm)) { state.result.terminal = Terminal::ArmContextFailed; break; }
            if (!QualifyIdleGate()) break;
            if (Expired() || PostArmExpired()) break;
            const LONGLONG finalAge = Qpc() - state.result.context.acquisitionEndQpc;
            if (finalAge < 0 || finalAge > (state.frequency * GateMaximumGapMs) / 1000) {
                state.result.terminal = Terminal::GateSampleGap; break;
            }
            bool notAttempted = false;
            if (!targetOnce.compare_exchange_strong(notAttempted, true)) break;
            state.result.beforeQpc = Qpc();
            state.targetStarted.store(true, std::memory_order_release);
            const UINT64 arguments[1]{Handle(state.result.context.vehicle)};
            state.result.read = Invoke(NativeIds::CurrentRevRatio, arguments, 1);
            state.result.afterQpc = Qpc();
            state.targetReturned.store(true, std::memory_order_release);
            // Raw bits were copied before ANY later call. Only HUD draw natives
            // may run after this point; no engine/context query or target retry.
            if (state.result.read.status == ReadStatus::Seh) state.nativeFault.store(true);
            if (state.deadline.load(std::memory_order_acquire)
                || GetTickCount64() - state.startTick >= state.timeoutMs
                || state.result.afterQpc - state.operatorArm.inputBeforeQpc > (state.frequency * PostArmLimitMs) / 1000) {
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
        const ULONGLONG now = GetTickCount64();
        if (now >= nextPoll) {
            nextPoll = now + PollIntervalMs;
            state.polls.fetch_add(1);
            const bool previouslyEligible = cachedEligible;
            const Context previous = observed;
            if (!Preconditions(observed, cachedEligible)) break;
            if (cachedEligible && (!previouslyEligible || !SameIdentity(previous, observed))) {
                ResetReadyGeneration();
                released = false;
                if (input.down.load() == 0 && input.eventState.load() == 0) released = true;
            }
        }
        input.accept.store(released && cachedEligible, std::memory_order_release);
        if (!DrawHud(WaitingHud(cachedEligible, released, observed))) break;
        scriptWait(0);
    }
    Terminal terminal = state.result.terminal;
    if (state.writerFailed.load(std::memory_order_acquire)) terminal = Terminal::WriterFailure;
    else if (terminal == Terminal::None) terminal = Terminal::DeadlineBeforeTarget;
    Finish(terminal);
    PresentTerminal();
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
        keyboardHandlerRegister(Keyboard);
    } else if (reason == DLL_PROCESS_DETACH) {
        keyboardHandlerUnregister(Keyboard);
        scriptUnregister(module);
    }
    return TRUE;
}
