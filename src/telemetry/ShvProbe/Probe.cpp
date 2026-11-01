#include "ScriptHookVApi.h"
#include "NativeIds.h"
#include <atomic>
#include <charconv>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <cwchar>
#include <type_traits>

// One bounded diagnostic session per process. No audio, vehicle setters, memory
// reads, handler lookup, hash remapping, or provider-valid claim is implemented.
namespace {
constexpr DWORD DefaultTimeoutMs = 300000;
constexpr DWORD MinimumTimeoutMs = 100;
constexpr DWORD PollIntervalMs = 250;
constexpr DWORD WriterGraceMs = 500;
constexpr DWORD FileBudgetBytes = 12 * 1024 * 1024;
constexpr std::size_t PathCapacity = 1400;
constexpr DWORD ActiveDurationMs = 120000;
constexpr DWORD SampleIntervalMs = 50;
constexpr DWORD MaximumGapMs = 250;
constexpr DWORD TerminalHudMs = 5000;
constexpr unsigned MaximumObservations = 2400;
constexpr unsigned RingCapacity = 128;
constexpr DWORD RowBudgetBytes = 2047;
constexpr DWORD ReturnRowBudgetBytes = 511;
constexpr float StationaryToleranceMps = 0.10f;
constexpr unsigned ControlBit = 1, ShiftBit = 2, BackslashBit = 4, AltBit = 8;
constexpr unsigned ChordBits = ControlBit | ShiftBit | BackslashBit;
static_assert(MaximumObservations * (RowBudgetBytes * 2 + ReturnRowBudgetBytes)
    + 9 * RowBudgetBytes + 32768 < FileBudgetBytes,
    "Every bounded row plus lifecycle and final capture fits the aggregate budget.");

enum class Terminal : std::uint32_t {
    None, Completed, TargetNull, TargetSeh, PreconditionNull, PreconditionSeh,
    ContextChanged, WaitingDeadline, ActiveDeadline, WriterFailure,
    OnlineContext, WorkerStartFailure, ArmContextFailed, ForegroundLost,
    SpeedNonfinite, SpeedInvalid, ContextInvalid, Discontinuity, SampleLimit,
    HudSeh, TargetNonfinite, TargetRange, QueueOverflow, OperatorOverflow,
    OperatorStop, InputClockInvalid
};
enum class Waiting : std::uint32_t {
    None, Loading, Switching, NotPlaying, InvalidPed, NoVehicle, InvalidVehicle,
    WrongModel, NotDriver, Paused
};
enum class ReadStatus : std::uint32_t { Good, Null, Seh };
enum class InputMode : unsigned { Disabled, Waiting, Active };
enum class Action : unsigned { Start, Advance, Stop };
enum class RecordKind : unsigned { Phase, Declared, Returned, Observation };

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
    bool engineRunningObserved;
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
struct KeyboardIntent {
    unsigned keysDown;
    unsigned known;
    std::uint64_t wEvents;
    std::uint64_t sEvents;
    LONGLONG wLastQpc;
    LONGLONG sLastQpc;
    LONGLONG beforeQpc;
    LONGLONG afterQpc;
};
struct PhaseEvent {
    Action action;
    bool earlyStop;
    unsigned phase;
    DWORD terminalVk;
    LONGLONG inputBeforeQpc;
    LONGLONG inputAfterQpc;
    LONGLONG acceptedQpc;
};
struct Observation {
    unsigned index;
    unsigned phase;
    Context pre;
    Context post;
    KeyboardIntent keyboardBefore;
    KeyboardIntent keyboardAfter;
    NativeRead read;
    bool targetAttempted;
    bool preAttempted;
    bool postAttempted;
    bool preObserved;
    bool postObserved;
    bool bracketValid;
    bool zeroWhileRunning;
    LONGLONG declaredQpc;
    LONGLONG beforeQpc;
    LONGLONG afterQpc;
    LONGLONG gapBeforeQpc;
};
struct Record {
    RecordKind kind;
    PhaseEvent phase;
    Observation observation;
};
struct ResultRecord {
    Context context;
    std::uint64_t failedNative;
    DWORD exceptionCode;
    Terminal terminal;
    bool hasUnpublished;
    Record unpublished;
};
static_assert(std::is_trivially_copyable<Record>::value, "Fixed POD ring handoff.");
static_assert(std::is_trivially_copyable<ResultRecord>::value, "Fixed POD handoff.");

struct Session {
    std::atomic<bool> cancel{false};
    std::atomic<bool> deadline{false};
    std::atomic<bool> writerReady{false};
    std::atomic<bool> writerDone{false};
    std::atomic<bool> writerFailed{false};
    std::atomic<bool> permit{false};
    std::atomic<bool> producerDone{false};
    std::atomic<bool> watchdogStop{false};
    std::atomic<bool> activeStarted{false};
    std::atomic<bool> operatorRequested{false};
    std::atomic<bool> nativeFault{false};
    std::atomic<DWORD> presentationException{0};
    std::atomic<std::uint32_t> polls{0};
    std::atomic<std::uint32_t> lastWaiting{0};
    std::atomic<unsigned> targetAttempts{0};
    std::atomic<unsigned> targetOutcomes{0};
    std::atomic<unsigned> observationsProduced{0};
    std::atomic<unsigned> writeIndex{0};
    std::atomic<unsigned> readIndex{0};
    std::atomic<unsigned> recordsWritten{0};
    DWORD timeoutMs = DefaultTimeoutMs;
    DWORD processId = 0;
    ULONGLONG startTick = 0;
    LONGLONG frequency = 0;
    LONGLONG startQpc = 0;
    ULONGLONG activeStartTick = 0;
    LONGLONG activeStartQpc = 0;
    LONGLONG activeEndQpc = 0;
    unsigned phase = 0;
    unsigned phaseMarkers = 0;
    unsigned zeroWhileRunningCount = 0;
    unsigned staleInputEvents = 0;
    bool operatorStopWasEarly = false;
    OperatorArm operatorArm{}; // immutable after operatorRequested release
    Record ring[RingCapacity]{};
    ResultRecord result{};
};
Session state;
std::atomic<bool> runOnce{false};
struct InputState {
    std::atomic<unsigned> down{0};
    std::atomic<unsigned> fresh{0};
    std::atomic<bool> accept{false};
    std::atomic<InputMode> mode{InputMode::Disabled};
    std::atomic<unsigned> phase{0};
    std::atomic<unsigned> eventState{0}; // 0 empty, 1 writing, 2 published
    std::atomic<DWORD> terminalVk{0};
    std::atomic<DWORD> eventTerminalVk{0};
    std::atomic<Action> eventAction{Action::Start};
    std::atomic<bool> eventEarlyStop{false};
    std::atomic<LONGLONG> beforeQpc{0};
    std::atomic<LONGLONG> afterQpc{0};
    std::atomic<std::uint64_t> generation{0};
    std::atomic<std::uint64_t> eventGeneration{0};
    std::atomic<unsigned> lostEvents{0};
    std::atomic<unsigned> intentDown{0};
    std::atomic<unsigned> intentKnown{0};
    std::atomic<std::uint64_t> wEvents{0};
    std::atomic<std::uint64_t> sEvents{0};
    std::atomic<LONGLONG> wLastQpc{0};
    std::atomic<LONGLONG> sLastQpc{0};
};
InputState input;

LONGLONG Qpc() noexcept;
LONGLONG Ticks(DWORD milliseconds) noexcept;

bool Expired() noexcept {
    if (state.cancel.load(std::memory_order_acquire)) return true;
    const bool active = state.activeStarted.load(std::memory_order_acquire);
    if (active) {
        const LONGLONG elapsed = Qpc() - state.activeStartQpc;
        if (elapsed >= 0 && elapsed < Ticks(ActiveDurationMs)) return false;
    } else if (GetTickCount64() - state.startTick < state.timeoutMs) return false;
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
    const auto mode = input.mode.load(std::memory_order_acquire);
    const unsigned phase = input.phase.load(std::memory_order_acquire);
    // These are SDK keyboard notifications, never vehicle throttle/control-axis
    // measurements. Counters include repeats; latest timestamps can coalesce
    // several events between observations. No unrecorded full event trace is claimed.
    if (key == 'W' || key == 'S') {
        const unsigned intentBit = key == 'W' ? 1U : 2U;
        input.intentKnown.fetch_or(intentBit);
        if (isUp) input.intentDown.fetch_and(~intentBit);
        else input.intentDown.fetch_or(intentBit);
        if (key == 'W') { input.wEvents.fetch_add(1); input.wLastQpc.store(Qpc()); }
        else { input.sEvents.fetch_add(1); input.sLastQpc.store(Qpc()); }
    }
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
    if (wasDown || (now & AltBit) != 0 || !input.accept.load()) return;
    const bool chord = (now & ChordBits) == ChordBits
        && (previous & ChordBits) != ChordBits
        && (input.fresh.load() & ChordBits) == ChordBits;
    const bool plain = key == VK_OEM_5 || key == VK_OEM_102;
    const bool advance = plain && (now & ChordBits) == BackslashBit
        && (previous & BackslashBit) == 0 && (input.fresh.load() & BackslashBit) != 0;
    Action action = Action::Start;
    if (mode == InputMode::Waiting) { if (!chord) return; }
    else if (mode == InputMode::Active) {
        if (chord) action = Action::Stop;
        else if (advance) action = phase >= 6 ? Action::Stop : Action::Advance;
        else return;
    } else return;
    unsigned empty = 0;
    if (!input.eventState.compare_exchange_strong(empty, 1)) {
        input.lostEvents.fetch_add(1); return;
    }
    input.beforeQpc.store(Qpc(), std::memory_order_relaxed);
    input.eventTerminalVk.store(input.terminalVk.load(), std::memory_order_relaxed);
    input.eventGeneration.store(generation, std::memory_order_relaxed);
    input.eventAction.store(action, std::memory_order_relaxed);
    input.eventEarlyStop.store(mode == InputMode::Active && chord, std::memory_order_relaxed);
    input.afterQpc.store(Qpc(), std::memory_order_relaxed);
    input.eventState.store(2, std::memory_order_release);
}

void ResetControls() noexcept {
    input.accept.store(false, std::memory_order_release);
    input.generation.fetch_add(1, std::memory_order_acq_rel);
    input.down.store(0);
    input.fresh.store(0);
    input.intentDown.store(0);
    input.intentKnown.store(0);
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

KeyboardIntent Intent() noexcept {
    KeyboardIntent intent{};
    intent.beforeQpc = Qpc();
    intent.keysDown = input.intentDown.load();
    intent.known = input.intentKnown.load();
    intent.wEvents = input.wEvents.load();
    intent.sEvents = input.sEvents.load();
    intent.wLastQpc = input.wLastQpc.load();
    intent.sLastQpc = input.sLastQpc.load();
    intent.afterQpc = Qpc();
    return intent;
}

LONGLONG Ticks(DWORD milliseconds) noexcept {
    // Round up: the real interval must never be shorter than the limit.
    return (state.frequency * milliseconds + 999) / 1000;
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

// Waiting polls are capped at four per second. During capture the same complete
// checks bracket each target; every native result is copied inside Invoke.
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
    context.engineRunningObserved = true;
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
    case Terminal::WaitingDeadline: return "waiting-deadline";
    case Terminal::ActiveDeadline: return "active-deadline";
    case Terminal::WriterFailure: return "journal-failure";
    case Terminal::OnlineContext: return "online-context";
    case Terminal::WorkerStartFailure: return "worker-start-failure";
    case Terminal::ArmContextFailed: return "arm-context-failed";
    case Terminal::ForegroundLost: return "foreground-lost";
    case Terminal::SpeedNonfinite: return "speed-nonfinite";
    case Terminal::SpeedInvalid: return "speed-invalid";
    case Terminal::ContextInvalid: return "context-invalid";
    case Terminal::Discontinuity: return "observation-discontinuity";
    case Terminal::SampleLimit: return "sample-limit";
    case Terminal::HudSeh: return "hud-seh";
    case Terminal::TargetNonfinite: return "target-nonfinite";
    case Terminal::TargetRange: return "target-out-of-range";
    case Terminal::QueueOverflow: return "queue-overflow";
    case Terminal::OperatorOverflow: return "operator-event-overflow";
    case Terminal::OperatorStop: return "operator-stop";
    case Terminal::InputClockInvalid: return "input-clock-invalid";
    default: return "not-completed";
    }
}

const char* PhaseName(unsigned phase) noexcept {
    constexpr const char* names[]{"OFF", "IDLE", "STATIONARY_REV", "ACCELERATION",
        "GEAR_TRANSITIONS", "DECELERATION", "RETURN_IDLE"};
    return phase < 7 ? names[phase] : "UNOBSERVED";
}

const char* ActionName(Action action) noexcept {
    return action == Action::Start ? "start" : action == Action::Advance ? "advance" : "stop";
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

const char* WaitingHud(bool eligible, bool released) noexcept {
    if (!eligible) return "Telemetry WAIT~n~Offline, unpaused; drive the same Bati. No audio.";
    if (!released) return "Telemetry READY~n~Release Ctrl, Shift, Backslash before START.";
    return "Telemetry READY~n~Ctrl+Shift+Backslash STARTS capture. OFF is only a label.";
}

const char* ActiveHud() noexcept {
    if (state.zeroWhileRunningCount != 0)
        return "Telemetry WARNING~n~Zero while running recorded. Chord STOPS; inspect data.";
    switch (state.phase) {
    case 0: return "Telemetry OFF label~n~Backslash NEXT; Ctrl+Shift+Backslash STOP.";
    case 1: return "Telemetry IDLE label~n~Backslash NEXT; Ctrl+Shift+Backslash STOP.";
    case 2: return "Telemetry REV label~n~Backslash NEXT; Ctrl+Shift+Backslash STOP.";
    case 3: return "Telemetry ACCEL label~n~Backslash NEXT; Ctrl+Shift+Backslash STOP.";
    case 4: return "Telemetry GEAR label~n~Gear unavailable. Backslash NEXT; chord STOP.";
    case 5: return "Telemetry DECEL label~n~Backslash NEXT; Ctrl+Shift+Backslash STOP.";
    default: return "Telemetry RETURN IDLE label~n~Backslash FINISH; chord EARLY STOP.";
    }
}

const char* ResultHud() noexcept {
    if (state.result.terminal == Terminal::OperatorStop)
        return "Telemetry STOPPED~n~Timeline retained; labels are not state proof. No audio.";
    if (state.result.terminal == Terminal::ActiveDeadline
        || state.result.terminal == Terminal::SampleLimit)
        return "Telemetry LIMIT~n~Capture ended. No retry; inspect the timeline.";
    return "Telemetry STOPPED~n~Context, timing or result failed. No retry; inspect data.";
}

bool ContextOkay(const Context& context, bool eligible) noexcept {
    if (!OwnForeground()) { state.result.terminal = Terminal::ForegroundLost; return false; }
    if (!eligible) { state.result.terminal = Terminal::ContextInvalid; return false; }
    if (!SameIdentity(state.operatorArm.context, context)) {
        state.result.terminal = Terminal::ContextChanged; return false;
    }
    const float speed = FloatBits(context.speedBits);
    if (!context.speedObserved || !std::isfinite(speed)) {
        state.result.terminal = Terminal::SpeedNonfinite; return false;
    }
    if (speed < 0.0f) { state.result.terminal = Terminal::SpeedInvalid; return false; }
    const LONGLONG now = Qpc();
    if (context.acquisitionStartQpc <= 0 || context.acquisitionEndQpc < context.acquisitionStartQpc
        || context.acquisitionEndQpc - context.acquisitionStartQpc > Ticks(MaximumGapMs)
        || now < context.acquisitionEndQpc || now - context.acquisitionEndQpc > Ticks(MaximumGapMs)) {
        state.result.terminal = Terminal::Discontinuity; return false;
    }
    return true;
}

bool RingRoom(unsigned needed) noexcept {
    const unsigned written = state.writeIndex.load(std::memory_order_relaxed);
    const unsigned consumed = state.readIndex.load(std::memory_order_acquire);
    return written >= consumed && written - consumed <= RingCapacity
        && needed <= RingCapacity - (written - consumed);
}

bool Enqueue(const Record& record) noexcept {
    if (!RingRoom(1) || state.writerDone.load(std::memory_order_acquire)) {
        // This immutable fallback preserves a returned value if output cannot
        // accept it. No retry, overwrite, previous-value reuse or silent drop.
        state.result.hasUnpublished = true;
        state.result.unpublished = record;
        if (state.result.terminal == Terminal::None)
            state.result.terminal = state.writerDone.load() ? Terminal::WriterFailure : Terminal::QueueOverflow;
        return false;
    }
    const unsigned index = state.writeIndex.load(std::memory_order_relaxed);
    state.ring[index % RingCapacity] = record;
    state.writeIndex.store(index + 1, std::memory_order_release);
    if (record.kind == RecordKind::Observation) state.observationsProduced.fetch_add(1);
    return true;
}

bool ConsumeInput(PhaseEvent& event) noexcept {
    if (input.eventState.load(std::memory_order_acquire) != 2) return false;
    if (input.eventGeneration.load() != input.generation.load()) {
        input.eventState.store(0, std::memory_order_release);
        ++state.staleInputEvents;
        return false;
    }
    event.action = input.eventAction.load();
    event.earlyStop = input.eventEarlyStop.load();
    event.terminalVk = input.eventTerminalVk.load();
    event.inputBeforeQpc = input.beforeQpc.load();
    event.inputAfterQpc = input.afterQpc.load();
    event.acceptedQpc = Qpc();
    input.eventState.store(0, std::memory_order_release);
    ResetReadyGeneration();
    return true;
}

bool InputClockOkay(const PhaseEvent& event) noexcept {
    if (event.inputBeforeQpc <= 0 || event.inputAfterQpc < event.inputBeforeQpc
        || event.acceptedQpc < event.inputAfterQpc) {
        state.result.terminal = Terminal::InputClockInvalid; return false;
    }
    return true;
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
    void Hex32(std::uint32_t value) noexcept {
        constexpr char digits[] = "0123456789ABCDEF";
        char formatted[9]{};
        for (unsigned i = 0; i < 8; ++i) { formatted[7 - i] = digits[value & 15]; value >>= 4; }
        Add(formatted);
    }
};

void ContextJson(Text& text, const Context& context) noexcept {
    text.Add("{\"player\":"); text.Number(context.player);
    text.Add(",\"ped\":"); text.Number(context.ped);
    text.Add(",\"vehicle\":"); text.Number(context.vehicle);
    text.Add(",\"driver\":"); text.Number(context.driver);
    text.Add(",\"model\":"); text.Number(context.model);
    text.Add(",\"engineRunningRaw\":");
    if (context.engineRunningObserved) text.Number(context.engineRunningRaw); else text.Add("null");
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

const char* Classification(const Observation& observation) noexcept {
    if (!observation.targetAttempted) return "not-attempted";
    if (observation.read.status == ReadStatus::Seh) return "seh";
    if (observation.read.status == ReadStatus::Null) return "null";
    const float value = FloatBits(observation.read.bits);
    if (!std::isfinite(value)) return "nonfinite";
    if (value < 0.0f || value > 1.0f) return "out-of-plausible-range";
    return value == 0.0f ? "zero" : "finite-unvalidated";
}

void IntentJson(Text& text, const KeyboardIntent& intent) noexcept {
    text.Add("{\"wDown\":"); text.Add((intent.keysDown & 1) != 0 ? "true" : "false");
    text.Add(",\"sDown\":"); text.Add((intent.keysDown & 2) != 0 ? "true" : "false");
    text.Add(",\"wKnown\":"); text.Add((intent.known & 1) != 0 ? "true" : "false");
    text.Add(",\"sKnown\":"); text.Add((intent.known & 2) != 0 ? "true" : "false");
    text.Add(",\"wEvents\":"); text.Number(intent.wEvents);
    text.Add(",\"sEvents\":"); text.Number(intent.sEvents);
    text.Add(",\"wLastQpc\":"); text.Number(intent.wLastQpc);
    text.Add(",\"sLastQpc\":"); text.Number(intent.sLastQpc);
    text.Add(",\"beforeQpc\":"); text.Number(intent.beforeQpc);
    text.Add(",\"afterQpc\":"); text.Number(intent.afterQpc); text.Add("}");
}

void RecordJson(Text& text, const Record& record) noexcept {
    text.Add("{\"schema\":3,\"kind\":\"");
    if (record.kind == RecordKind::Phase) {
        text.Add("phase\",\"action\":\""); text.Add(ActionName(record.phase.action));
        text.Add("\",\"earlyStop\":"); text.Add(record.phase.earlyStop ? "true" : "false");
        text.Add(",\"requestedPhaseIndex\":"); text.Number(record.phase.phase);
        text.Add(",\"requestedPhase\":\""); text.Add(PhaseName(record.phase.phase));
        text.Add("\",\"terminalVk\":"); text.Number(record.phase.terminalVk);
        text.Add(",\"inputBeforeQpc\":"); text.Number(record.phase.inputBeforeQpc);
        text.Add(",\"inputAfterQpc\":"); text.Number(record.phase.inputAfterQpc);
        text.Add(",\"acceptedQpc\":"); text.Number(record.phase.acceptedQpc);
        text.Add(",\"operatorLabelIsAchievedStateProof\":false}\n");
        return;
    }
    const Observation& observation = record.observation;
    if (record.kind == RecordKind::Returned) {
        text.Add("target-return\",\"observationIndex\":"); text.Number(observation.index);
        text.Add(",\"requestedPhaseIndex\":"); text.Number(observation.phase);
        text.Add(",\"requestedPhase\":\""); text.Add(PhaseName(observation.phase));
        text.Add("\",\"targetBeforeQpc\":"); text.Number(observation.beforeQpc);
        text.Add(",\"targetAfterQpc\":"); text.Number(observation.afterQpc);
        text.Add(",\"readStatus\":\"");
        text.Add(observation.read.status == ReadStatus::Good ? "good"
            : observation.read.status == ReadStatus::Null ? "null" : "seh");
        text.Add("\",\"pointerPresent\":"); text.Add(observation.read.pointerPresent ? "true" : "false");
        const bool raw = observation.read.status == ReadStatus::Good;
        text.Add(",\"rawBits\":"); if (raw) text.Number(observation.read.bits); else text.Add("null");
        text.Add(",\"rawBitsHex\":");
        if (raw) { text.Add("\""); text.Hex32(observation.read.bits); text.Add("\""); } else text.Add("null");
        text.Add(",\"rawFloat\":"); if (raw) text.Float(FloatBits(observation.read.bits)); else text.Add("null");
        text.Add(",\"exceptionCode\":"); text.Number(observation.read.exceptionCode);
        text.Add(",\"contextBracketValid\":false,\"measuredRPM\":false,\"providerValid\":false}\n");
        return;
    }
    text.Add(record.kind == RecordKind::Declared ? "declared-precontext" : "observation");
    text.Add("\",\"observationIndex\":"); text.Number(observation.index);
    text.Add(",\"requestedPhaseIndex\":"); text.Number(observation.phase);
    text.Add(",\"requestedPhase\":\""); text.Add(PhaseName(observation.phase));
    text.Add("\",\"preContextObserved\":"); text.Add(observation.preObserved ? "true" : "false");
    text.Add(",\"preContext\":"); if (observation.preAttempted) ContextJson(text, observation.pre); else text.Add("null");
    text.Add(",\"keyboardIntentBefore\":");
    if (observation.keyboardBefore.afterQpc != 0) IntentJson(text, observation.keyboardBefore); else text.Add("null");
    if (record.kind == RecordKind::Declared) {
        text.Add(",\"declaredQpc\":"); text.Number(observation.declaredQpc);
        text.Add(",\"invocationProven\":false}\n"); return;
    }
    text.Add(",\"targetAttempted\":"); text.Add(observation.targetAttempted ? "true" : "false");
    text.Add(",\"targetBeforeQpc\":"); text.Number(observation.beforeQpc);
    text.Add(",\"targetAfterQpc\":"); text.Number(observation.afterQpc);
    text.Add(",\"gapBeforeQpc\":"); text.Number(observation.gapBeforeQpc);
    text.Add(",\"readStatus\":\"");
    text.Add(!observation.targetAttempted ? "not-attempted" : observation.read.status == ReadStatus::Good
        ? "good" : observation.read.status == ReadStatus::Null ? "null" : "seh");
    text.Add("\",\"pointerPresent\":"); text.Add(observation.read.pointerPresent ? "true" : "false");
    const bool raw = observation.targetAttempted && observation.read.status == ReadStatus::Good;
    text.Add(",\"rawBits\":"); if (raw) text.Number(observation.read.bits); else text.Add("null");
    text.Add(",\"rawBitsHex\":");
    if (raw) { text.Add("\""); text.Hex32(observation.read.bits); text.Add("\""); } else text.Add("null");
    text.Add(",\"rawFloat\":"); if (raw) text.Float(FloatBits(observation.read.bits)); else text.Add("null");
    text.Add(",\"classification\":\""); text.Add(Classification(observation)); text.Add("\"");
    text.Add(",\"exceptionCode\":"); text.Number(observation.read.exceptionCode);
    text.Add(",\"postContextObserved\":"); text.Add(observation.postObserved ? "true" : "false");
    text.Add(",\"postContext\":"); if (observation.postAttempted) ContextJson(text, observation.post); else text.Add("null");
    text.Add(",\"keyboardIntentAfter\":");
    if (observation.keyboardAfter.afterQpc != 0) IntentJson(text, observation.keyboardAfter); else text.Add("null");
    text.Add(",\"contextBracketValid\":"); text.Add(observation.bracketValid ? "true" : "false");
    text.Add(",\"zeroWhileRunning\":"); text.Add(observation.zeroWhileRunning ? "true" : "false");
    text.Add(",\"observedContext\":");
    if (!observation.bracketValid) text.Add("null");
    else {
        const bool preRunning = observation.pre.engineRunningRaw != 0;
        const bool postRunning = observation.post.engineRunningRaw != 0;
        const float preSpeed = FloatBits(observation.pre.speedBits);
        const float postSpeed = FloatBits(observation.post.speedBits);
        text.Add("{\"engineOffBoth\":"); text.Add(!preRunning && !postRunning ? "true" : "false");
        text.Add(",\"engineRunningBoth\":"); text.Add(preRunning && postRunning ? "true" : "false");
        text.Add(",\"engineStateChanged\":"); text.Add(preRunning != postRunning ? "true" : "false");
        text.Add(",\"nearStationaryBoth\":");
        text.Add(preSpeed <= StationaryToleranceMps && postSpeed <= StationaryToleranceMps ? "true" : "false");
        text.Add(",\"movingBoth\":");
        text.Add(preSpeed > StationaryToleranceMps && postSpeed > StationaryToleranceMps ? "true" : "false");
        text.Add("}");
    }
    text.Add(",\"operatorLabelIsAchievedStateProof\":false,\"keyboardIntentIsThrottle\":false,");
    text.Add("\"measuredRPM\":false,\"providerValid\":false}\n");
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
    const unsigned outcomes = state.targetOutcomes.load(std::memory_order_acquire);
    const unsigned attempts = state.targetAttempts.load(std::memory_order_acquire);
    ResultRecord result{};
    if (completedProducer) result = state.result;
    const char* terminal = completedProducer ? TerminalName(result.terminal)
        : (state.writerFailed.load() ? "journal-failure" : "watchdog-producer-outcome-unobserved");
    text.Add("{\"schema\":3,\"purpose\":\"bounded-operating-state-timeline\",");
    text.Add("\"measuredRPM\":false,\"providerValid\":false,\"terminalReason\":\""); text.Add(terminal);
    text.Add("\",\"producerCompleted\":"); text.Add(completedProducer ? "true" : "false");
    text.Add(",\"targetHash\":\"F9DDA40BC293A61E\",\"targetAttempts\":"); text.Number(attempts);
    text.Add(",\"targetOutcomesObserved\":"); text.Number(outcomes);
    text.Add(",\"observationsProduced\":"); text.Number(state.observationsProduced.load());
    text.Add(",\"timelineRecordsProduced\":"); text.Number(state.writeIndex.load());
    text.Add(",\"timelineRecordsWritten\":"); text.Number(state.recordsWritten.load());
    text.Add(",\"deadlineReached\":"); text.Add(state.deadline.load() ? "true" : "false");
    text.Add(",\"writerFailed\":"); text.Add(state.writerFailed.load() ? "true" : "false");
    text.Add(",\"watchdogCanPreemptNative\":false,\"unknownNativeFailureIsContained\":false,");
    text.Add("\"maximumActiveMs\":120000,\"maximumTargetObservations\":2400,");
    text.Add("\"minimumAfterToNextTargetMs\":50,\"maximumObservationGapMs\":250,");
    text.Add("\"ringCapacityRecords\":128,\"maximumTimelineRowBytes\":2047,\"maximumReturnRowBytes\":511,");
    text.Add("\"maximumTimelineRecords\":7209,\"aggregateFileBudgetBytes\":12582912,");
    text.Add("\"waitingTimeoutMs\":"); text.Number(state.timeoutMs);
    text.Add(",\"processId\":"); text.Number(state.processId);
    text.Add(",\"qpcFrequency\":"); text.Number(state.frequency);
    text.Add(",\"sessionStartQpc\":"); text.Number(state.startQpc);
    text.Add(",\"activeStartQpc\":");
    text.Number(state.activeStarted.load(std::memory_order_acquire) ? state.activeStartQpc : 0);
    text.Add(",\"activeEndQpc\":"); text.Number(completedProducer ? state.activeEndQpc : 0);
    text.Add(",\"operatorArming\":");
    if (state.operatorRequested.load(std::memory_order_acquire)) OperatorJson(text, state.operatorArm);
    else OperatorJson(text, OperatorArm{});
    text.Add(",\"lastRequestedPhaseIndex\":"); text.Number(completedProducer ? state.phase : 0);
    text.Add(",\"phaseMarkers\":"); text.Number(completedProducer ? state.phaseMarkers : 0);
    text.Add(",\"operatorStopWasEarly\":");
    text.Add(completedProducer && state.operatorStopWasEarly ? "true" : "false");
    text.Add(",\"zeroWhileRunningCount\":"); text.Number(completedProducer ? state.zeroWhileRunningCount : 0);
    text.Add(",\"droppedOperatorEvents\":"); text.Number(input.lostEvents.load());
    text.Add(",\"staleOperatorEvents\":"); text.Number(completedProducer ? state.staleInputEvents : 0);
    text.Add(",\"eligibilityPolls\":"); text.Number(state.polls.load());
    text.Add(",\"lastWaitingCode\":"); text.Number(state.lastWaiting.load());
    text.Add(",\"exceptionCode\":"); text.Number(completedProducer ? result.exceptionCode : 0);
    text.Add(",\"failedNativeHash\":\""); text.Hex64(completedProducer ? result.failedNative : 0);
    text.Add("\",\"presentationExceptionCodeAtCapture\":"); text.Number(state.presentationException.load());
    text.Add(",\"terminalHudMaxMs\":5000,\"gear\":null,\"throttle\":null,\"controlAxis\":null,");
    text.Add("\"keyboardIntentIsThrottle\":false,\"keyboardEventCountersIncludeRepeats\":true,");
    text.Add("\"keyboardInitialStateNotQueried\":true,");
    text.Add("\"keyboardFieldsSampledWithinBoundsNotSimultaneous\":true,\"fullKeyboardEventTraceClaimed\":false,");
    text.Add("\"operatorLabelsAreAchievedStateProof\":false,\"armedMarkerIsInvocationProof\":false,");
    text.Add("\"context\":");
    if (completedProducer) ContextJson(text, result.context); else ContextJson(text, Context{});
    text.Add(",\"unpublishedRecord\":");
    if (completedProducer && result.hasUnpublished) RecordJson(text, result.unpublished);
    else text.Add("null");
    text.Add("}\n");
    return text;
}

DWORD WINAPI Writer(void*) noexcept {
    wchar_t directory[PathCapacity]{};
    if (!CapturePath(directory, PathCapacity)) { MarkWriterFailure(); return 0; }
    DirectoryGuards guards;
    if (!guards.Lock(directory)) { MarkWriterFailure(); return 0; }
    HANDLE journal = NewFile(directory, L"journal.ndjson");
    HANDLE timeline = NewFile(directory, L"timeline.ndjson");
    if (journal == INVALID_HANDLE_VALUE || timeline == INVALID_HANDLE_VALUE) {
        if (journal != INVALID_HANDLE_VALUE) CloseHandle(journal);
        if (timeline != INVALID_HANDLE_VALUE) CloseHandle(timeline);
        MarkWriterFailure(); return 0;
    }
    DWORD totalBytes = 0;
    Text opened;
    opened.Add("{\"schema\":3,\"stage\":\"capture-open\",\"measuredRPM\":false,\"providerValid\":false,");
    opened.Add("\"aggregateFileBudgetBytes\":12582912,\"maximumTimelineRowBytes\":2047}\n");
    if (!WriteText(journal, opened, totalBytes, true)) {
        CloseHandle(timeline); CloseHandle(journal); MarkWriterFailure(); return 0;
    }
    state.writerReady.store(true, std::memory_order_release);
    bool armed = false;
    bool activeWritten = false;
    bool okay = true;
    ULONGLONG cancelledAt = 0;
    for (;;) {
        if (!armed && state.operatorRequested.load(std::memory_order_acquire)) {
            Text arm;
            arm.Add("{\"schema\":3,\"stage\":\"operator-armed\",\"marker\":\"armed-not-proof-of-invocation\",");
            arm.Add("\"invocationProven\":false,\"operatorArming\":"); OperatorJson(arm, state.operatorArm);
            arm.Add("}\n");
            if (!WriteText(journal, arm, totalBytes, true)) { okay = false; break; }
            armed = true;
            if (!state.cancel.load(std::memory_order_acquire))
                state.permit.store(true, std::memory_order_release);
        }
        if (!activeWritten && state.activeStarted.load(std::memory_order_acquire)) {
            Text active;
            active.Add("{\"schema\":3,\"stage\":\"active-start\",\"activeStartQpc\":");
            active.Number(state.activeStartQpc);
            active.Add(",\"maximumActiveMs\":120000,\"maximumTargetObservations\":2400}\n");
            if (!WriteText(journal, active, totalBytes, true)) { okay = false; break; }
            activeWritten = true;
        }
        unsigned consumed = state.readIndex.load(std::memory_order_relaxed);
        const unsigned produced = state.writeIndex.load(std::memory_order_acquire);
        while (consumed < produced) {
            const Record record = state.ring[consumed % RingCapacity];
            Text row;
            RecordJson(row, record);
            const DWORD rowLimit = record.kind == RecordKind::Returned ? ReturnRowBudgetBytes : RowBudgetBytes;
            if (row.used > rowLimit || !WriteText(timeline, row, totalBytes, true)) {
                okay = false; break;
            }
            ++consumed;
            state.readIndex.store(consumed, std::memory_order_release);
            state.recordsWritten.fetch_add(1);
        }
        if (!okay) break;
        if (state.producerDone.load(std::memory_order_acquire)
            && state.readIndex.load() == state.writeIndex.load()) break;
        if (state.cancel.load(std::memory_order_acquire)) {
            if (cancelledAt == 0) cancelledAt = GetTickCount64();
            if (GetTickCount64() - cancelledAt >= WriterGraceMs) break;
        }
        Sleep(5);
    }
    if (!okay) {
        state.writerFailed.store(true, std::memory_order_release);
        state.cancel.store(true, std::memory_order_release);
        // Give the cooperative producer a bounded chance to publish its known
        // outcome; filesystem failure may itself prevent final persistence.
        const ULONGLONG failedAt = GetTickCount64();
        while (!state.producerDone.load(std::memory_order_acquire)
            && GetTickCount64() - failedAt < WriterGraceMs) Sleep(5);
    }
    const bool producerDone = state.producerDone.load(std::memory_order_acquire);
    const Text final = FinalJson(producerDone);
    HANDLE capture = NewFile(directory, L"capture.json");
    bool captureOkay = capture != INVALID_HANDLE_VALUE;
    if (captureOkay) {
        captureOkay = WriteText(capture, final, totalBytes, true);
        CloseHandle(capture);
    }
    Text ended;
    ended.Add("{\"schema\":3,\"stage\":\"capture-terminal\",\"captureWritten\":");
    ended.Add(captureOkay ? "true" : "false");
    ended.Add(",\"measuredRPM\":false,\"providerValid\":false}\n");
    okay = WriteText(journal, ended, totalBytes, true) && okay && captureOkay;
    CloseHandle(timeline);
    CloseHandle(journal);
    if (!okay) state.writerFailed.store(true, std::memory_order_release);
    state.writerDone.store(true, std::memory_order_release);
    return 0;
}

// No native calls, files, formatting, logging or process control on this thread.
// It requests cancellation; it cannot interrupt a blocked native or disk call.
DWORD WINAPI Watchdog(void*) noexcept {
    while (!state.watchdogStop.load(std::memory_order_acquire)) {
        if (Expired()) return 0;
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
    input.mode.store(InputMode::Disabled, std::memory_order_release);
    input.accept.store(false, std::memory_order_release);
    state.activeEndQpc = Qpc();
    state.result.terminal = terminal;
    state.producerDone.store(true, std::memory_order_release);
}

void PresentTerminal() noexcept {
    ResetControls();
    if (state.nativeFault.load()) return;
    const ULONGLONG start = GetTickCount64();
    // Publication precedes presentation; only HUD natives are permitted here.
    while (GetTickCount64() - start < TerminalHudMs) {
        if (!DrawHud(ResultHud())) return;
        scriptWait(0);
    }
}

bool PublishObservation(const Observation& observation) noexcept {
    Record record{};
    record.kind = RecordKind::Observation;
    record.observation = observation;
    return Enqueue(record);
}

bool ActiveContext(Context& context, bool& complete) noexcept {
    bool eligible = false;
    const bool read = Preconditions(context, eligible);
    complete = read && eligible;
    state.result.context = context;
    if (!read) return false;
    return ContextOkay(context, eligible);
}

bool AdvanceInput(bool& released) noexcept {
    if (input.lostEvents.load() != 0) {
        state.result.terminal = Terminal::OperatorOverflow; return false;
    }
    if (input.down.load() == 0 && input.eventState.load() == 0) released = true;
    input.accept.store(released, std::memory_order_release);
    PhaseEvent event{};
    if (!ConsumeInput(event)) return true;
    released = false;
    if (!InputClockOkay(event)) return false;
    // Callback mode/epoch captured the action. A stale START is never STOP.
    if (event.action == Action::Start) { ++state.staleInputEvents; return true; }
    if (event.action == Action::Advance) {
        if (state.phase >= 6) { state.result.terminal = Terminal::OperatorOverflow; return false; }
        ++state.phase;
        input.phase.store(state.phase, std::memory_order_release);
    }
    event.phase = state.phase;
    Record marker{};
    marker.kind = RecordKind::Phase;
    marker.phase = event;
    if (!Enqueue(marker)) return false;
    ++state.phaseMarkers;
    if (event.action == Action::Stop) {
        state.operatorStopWasEarly = event.earlyStop;
        state.result.terminal = Terminal::OperatorStop; return false;
    }
    return true;
}

void CaptureTimeline(const PhaseEvent& startEvent) noexcept {
    state.activeStartTick = GetTickCount64();
    state.activeStartQpc = Qpc();
    state.activeStarted.store(true, std::memory_order_release);
    input.mode.store(InputMode::Active, std::memory_order_release);
    input.phase.store(0, std::memory_order_release);
    ResetReadyGeneration();
    Record marker{};
    marker.kind = RecordKind::Phase;
    marker.phase = startEvent;
    if (!Enqueue(marker)) return;
    state.phaseMarkers = 1;
    bool released = false;
    LONGLONG previousBefore = 0;
    LONGLONG nextAllowed = 0;
    while (!Expired()) {
        if (!OwnForeground()) { state.result.terminal = Terminal::ForegroundLost; break; }
        if (!AdvanceInput(released)) break;
        if (state.targetAttempts.load() >= MaximumObservations) {
            state.result.terminal = Terminal::SampleLimit; break;
        }
        const LONGLONG now = Qpc();
        if (now < nextAllowed) {
            if (!DrawHud(ActiveHud())) break;
            scriptWait(0); continue;
        }
        Observation observation{};
        observation.index = state.targetAttempts.load() + 1;
        observation.phase = state.phase;
        if (previousBefore != 0) observation.gapBeforeQpc = now - previousBefore;
        if (now <= 0 || (previousBefore != 0
            && (observation.gapBeforeQpc <= 0 || observation.gapBeforeQpc > Ticks(MaximumGapMs)))) {
            state.result.terminal = Terminal::Discontinuity;
            (void)PublishObservation(observation); break;
        }
        // Reserve declaration, raw return, and final context-bracket rows.
        if (!RingRoom(3)) {
            state.result.terminal = Terminal::QueueOverflow;
            Record pending{};
            pending.kind = RecordKind::Observation;
            pending.observation = observation;
            state.result.unpublished = pending;
            state.result.hasUnpublished = true;
            break;
        }
        observation.preAttempted = true;
        if (!ActiveContext(observation.pre, observation.preObserved)) {
            (void)PublishObservation(observation); break;
        }
        observation.keyboardBefore = Intent();
        observation.declaredQpc = Qpc();
        Record declaration{};
        declaration.kind = RecordKind::Declared;
        declaration.observation = observation;
        if (!Enqueue(declaration)) break;
        if (Expired()) { (void)PublishObservation(observation); break; }
        if (!OwnForeground()) {
            state.result.terminal = Terminal::ForegroundLost;
            (void)PublishObservation(observation); break;
        }
        const LONGLONG dispatch = Qpc();
        observation.gapBeforeQpc = previousBefore == 0 ? 0 : dispatch - previousBefore;
        if (dispatch < observation.pre.acquisitionEndQpc
            || dispatch - observation.pre.acquisitionEndQpc > Ticks(MaximumGapMs)
            || (previousBefore != 0 && observation.gapBeforeQpc > Ticks(MaximumGapMs))) {
            state.result.terminal = Terminal::Discontinuity;
            (void)PublishObservation(observation); break;
        }
        observation.beforeQpc = Qpc();
        // Check the final timestamp itself. A deschedule between an earlier
        // check and this handoff must not start a target after the active cap.
        if (Expired() || observation.beforeQpc < state.activeStartQpc
            || observation.beforeQpc - state.activeStartQpc >= Ticks(ActiveDurationMs)) {
            state.result.terminal = Terminal::ActiveDeadline;
            (void)PublishObservation(observation); break;
        }
        if (observation.beforeQpc < observation.pre.acquisitionEndQpc
            || observation.beforeQpc - observation.pre.acquisitionEndQpc > Ticks(MaximumGapMs)
            || (previousBefore != 0 && observation.beforeQpc - previousBefore > Ticks(MaximumGapMs))) {
            state.result.terminal = Terminal::Discontinuity;
            (void)PublishObservation(observation); break;
        }
        if (Expired()) { (void)PublishObservation(observation); break; }
        observation.targetAttempted = true;
        state.targetAttempts.fetch_add(1, std::memory_order_release);
        const UINT64 arguments[1]{Handle(observation.pre.vehicle)};
        observation.read = Invoke(NativeIds::CurrentRevRatio, arguments, 1);
        observation.afterQpc = Qpc();
        state.targetOutcomes.fetch_add(1, std::memory_order_release);
        if (observation.read.status == ReadStatus::Seh) state.nativeFault.store(true);
        Record returned{};
        returned.kind = RecordKind::Returned;
        returned.observation = observation;
        // Preserve EACH known return before any post-context native can block.
        // This row alone cannot establish an identity bracket or qualify data.
        if (!Enqueue(returned)) break;
        // Raw bits were copied inside Invoke before any later native or yield.
        observation.keyboardAfter = Intent();
        const float value = FloatBits(observation.read.bits);
        if (observation.read.status == ReadStatus::Seh) {
            state.nativeFault.store(true);
            state.result.failedNative = NativeIds::CurrentRevRatio;
            state.result.exceptionCode = observation.read.exceptionCode;
            state.result.terminal = Terminal::TargetSeh;
        } else if (observation.read.status == ReadStatus::Null) {
            state.result.failedNative = NativeIds::CurrentRevRatio;
            state.result.terminal = Terminal::TargetNull;
        } else if (!std::isfinite(value)) {
            state.result.terminal = Terminal::TargetNonfinite;
        } else if (value < 0.0f || value > 1.0f) {
            state.result.terminal = Terminal::TargetRange;
        } else if (Expired()) {
            state.result.terminal = Terminal::ActiveDeadline;
        } else if (observation.afterQpc < observation.beforeQpc
            || observation.afterQpc - observation.beforeQpc > Ticks(MaximumGapMs)) {
            state.result.terminal = Terminal::Discontinuity;
        } else {
            observation.postAttempted = true;
            if (ActiveContext(observation.post, observation.postObserved)) {
                if (observation.post.acquisitionEndQpc - observation.pre.acquisitionStartQpc > Ticks(MaximumGapMs)) {
                    state.result.terminal = Terminal::Discontinuity;
                } else {
                    observation.bracketValid = SameIdentity(observation.pre, observation.post);
                    observation.zeroWhileRunning = observation.bracketValid && value == 0.0f
                        && observation.pre.engineRunningRaw != 0 && observation.post.engineRunningRaw != 0;
                    if (observation.zeroWhileRunning) ++state.zeroWhileRunningCount;
                }
            }
        }
        if (!PublishObservation(observation)) break;
        previousBefore = observation.beforeQpc;
        nextAllowed = observation.afterQpc + Ticks(SampleIntervalMs);
        if (state.result.terminal != Terminal::None) break;
        if (!DrawHud(ActiveHud())) break;
        scriptWait(0);
    }
}

void ScriptMain() {
    bool expected = false;
    if (!runOnce.compare_exchange_strong(expected, true)) return;
    HMODULE pinned = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        reinterpret_cast<LPCWSTR>(&ScriptMain), &pinned)) return;
    // Process-lifetime pin: rollback/removal is supported after process exit.
    state.processId = GetCurrentProcessId();
    state.startTick = GetTickCount64();
    state.startQpc = Qpc();
    LARGE_INTEGER frequency{};
    if (!QueryPerformanceFrequency(&frequency) || frequency.QuadPart <= 0 || state.startQpc <= 0) return;
    state.frequency = frequency.QuadPart;
    state.timeoutMs = Timeout(); // Waiting-only; active duration has no override.
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
    input.mode.store(InputMode::Waiting, std::memory_order_release);
    Context observed{};
    bool cachedEligible = false;
    bool released = false;
    ULONGLONG nextPoll = 0;
    while (!Expired()) {
        if (!OwnForeground()) {
            ResetControls();
            released = false;
            cachedEligible = false;
            scriptWait(0); continue;
        }
        if (input.down.load() == 0 && input.eventState.load() == 0) released = true;
        input.accept.store(released && cachedEligible, std::memory_order_release);
        PhaseEvent event{};
        if (ConsumeInput(event)) {
            released = false;
            if (event.action != Action::Start || !InputClockOkay(event)) {
                if (state.result.terminal == Terminal::None) ++state.staleInputEvents;
                else break;
            } else {
                state.operatorArm.accepted = true;
                state.operatorArm.terminalVk = event.terminalVk;
                state.operatorArm.inputBeforeQpc = event.inputBeforeQpc;
                state.operatorArm.inputAfterQpc = event.inputAfterQpc;
                bool eligible = false;
                const bool contextRead = Preconditions(state.operatorArm.context, eligible);
                state.operatorArm.observedQpc = Qpc();
                state.operatorRequested.store(true, std::memory_order_release);
                state.result.context = state.operatorArm.context;
                if (!contextRead) break;
                if (!SameIdentity(observed, state.operatorArm.context)) {
                    state.result.terminal = Terminal::ArmContextFailed; break;
                }
                if (!ContextOkay(state.operatorArm.context, eligible)) break;
                if (input.lostEvents.load() != 0) {
                    state.result.terminal = Terminal::OperatorOverflow; break;
                }
                while (!state.permit.load(std::memory_order_acquire) && !Expired()) {
                    if (!OwnForeground()) { state.result.terminal = Terminal::ForegroundLost; break; }
                    if (!DrawHud("Telemetry ARMING~n~Waiting for durable writer; release chord keys.")) break;
                    scriptWait(0);
                }
                if (state.result.terminal != Terminal::None || Expired()) break;
                CaptureTimeline(event);
                break;
            }
        }
        const ULONGLONG now = GetTickCount64();
        if (now >= nextPoll) {
            nextPoll = now + PollIntervalMs;
            state.polls.fetch_add(1);
            const bool previouslyEligible = cachedEligible;
            const Context previous = observed;
            if (!Preconditions(observed, cachedEligible)) break;
            if (cachedEligible) {
                const float speed = FloatBits(observed.speedBits);
                cachedEligible = std::isfinite(speed) && speed >= 0.0f;
            }
            if (cachedEligible && (!previouslyEligible || !SameIdentity(previous, observed))) {
                ResetReadyGeneration();
                released = false;
                if (input.down.load() == 0 && input.eventState.load() == 0) released = true;
            }
        }
        input.accept.store(released && cachedEligible, std::memory_order_release);
        if (!DrawHud(WaitingHud(cachedEligible, released))) break;
        scriptWait(0);
    }
    Terminal terminal = state.result.terminal;
    if (state.writerFailed.load(std::memory_order_acquire)) terminal = Terminal::WriterFailure;
    else if (terminal == Terminal::None) terminal = state.activeStarted.load()
        ? Terminal::ActiveDeadline : Terminal::WaitingDeadline;
    Finish(terminal);
    PresentTerminal();
    while (!state.writerDone.load(std::memory_order_acquire)
        && !state.cancel.load(std::memory_order_acquire)) scriptWait(10);
    state.watchdogStop.store(true, std::memory_order_release);
    CloseHandle(watchdog);
    CloseHandle(writer);
}} // namespace

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
