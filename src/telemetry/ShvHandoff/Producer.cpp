#define RICHAUDIO_SHV_HANDOFF_EXPORTS
#include "ProducerApi.h"
#include "ScriptHookVApi.h"
#include "NativeIds.h"
#include <atomic>
#include <cmath>
#include <cstring>
#include <limits>

namespace {
using namespace RichAudioShv;
namespace N = HandoffNativeIds;
static_assert(std::atomic<std::uint64_t>::is_always_lock_free && std::atomic<std::int64_t>::is_always_lock_free
    && std::atomic<std::uint32_t>::is_always_lock_free && std::atomic<State>::is_always_lock_free,
    "The bounded accessor requires lock-free x64 scalar atomics.");
static_assert(std::numeric_limits<float>::is_iec559, "IEEE float32 results required.");
struct Shared {
    std::atomic<State> phase{State::Dormant};
    std::atomic<Terminal> terminal{Terminal::None};
    std::atomic<bool> opened{false};
    std::atomic<bool> openUsed{false};
    std::atomic<bool> beginUsed{false};
    std::atomic<bool> scriptUsed{false};
    std::atomic<bool> metadataReady{false};
    std::atomic<bool> producerCompleted{false};
    std::atomic_flag commandGuard = ATOMIC_FLAG_INIT;
    std::atomic_flag contextGuard = ATOMIC_FLAG_INIT;
    std::atomic_flag readerGuard = ATOMIC_FLAG_INIT;
    Key key{};
    BeginRequest begin{};
    Context latest{};
    std::atomic<std::uint64_t> contextSequence{0};
    Record queue[QueueCapacity]{};
    std::atomic<std::uint32_t> head{0}, tail{0}, attempts{0}, dropped{0};
    std::atomic<std::int64_t> lastAfter{0}, activeStart{0}, activeEnd{0};
    std::atomic<std::uint64_t> failedNative{0};
    std::atomic<std::uint32_t> exceptionCode{0};
    std::int64_t frequency = 0, instance = 0, waitingEnd = 0;
    std::uint64_t creation = 0;
    std::uint32_t pid = 0;
} shared;

std::int64_t Qpc() noexcept {
    LARGE_INTEGER value{};
    return QueryPerformanceCounter(&value) ? value.QuadPart : 0;
}
std::int64_t Ticks(std::uint32_t milliseconds) noexcept {
    return shared.frequency * static_cast<std::int64_t>(milliseconds) / 1000;
}
bool Retired() noexcept { return shared.phase.load(std::memory_order_acquire) == State::Retired; }
void Retire(Terminal terminal) noexcept {
    Terminal expected = Terminal::None;
    shared.terminal.compare_exchange_strong(expected, terminal, std::memory_order_acq_rel);
    shared.phase.store(State::Retired, std::memory_order_release);
}
std::uint32_t Queued() noexcept {
    const auto tail = shared.tail.load(std::memory_order_acquire);
    const auto head = shared.head.load(std::memory_order_acquire);
    const auto count = head - tail;
    // Metadata is a conservative snapshot during concurrent drain/publication.
    // ScriptMain is the sole head writer, so its capacity check cannot undercount.
    return count > QueueCapacity ? QueueCapacity : count;
}
template<class T> bool Input(const T* input, std::uint32_t bytes, T& copy) noexcept {
    if (!input || bytes != sizeof(T)) return false;
    __try { copy = *input; }
    __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
    return copy.header.size == sizeof(T) && copy.header.version == Version;
}
template<class T> bool Output(T* output, std::uint32_t bytes, const T& copy) noexcept {
    if (!output || bytes != sizeof(T)) return false;
    __try { *output = copy; }
    __except (EXCEPTION_EXECUTE_HANDLER) { return false; }
    return true;
}
template<class T> void HeaderFor(T& output) noexcept {
    output.header.size = static_cast<std::uint32_t>(sizeof(T));
    output.header.version = Version;
}
bool Authorized(const Key& key) noexcept {
    if (!shared.opened.load(std::memory_order_acquire)) return false;
    std::uint64_t difference = 0;
    for (unsigned i = 0; i < 2; ++i) difference |= key.session[i] ^ shared.key.session[i];
    for (unsigned i = 0; i < 4; ++i) difference |= key.secret[i] ^ shared.key.secret[i];
    return difference == 0;
}
bool Nonzero(const Key& key) noexcept {
    const auto session = key.session[0] | key.session[1];
    const auto secret = key.secret[0] | key.secret[1] | key.secret[2] | key.secret[3];
    return session != 0 && secret != 0;
}
void Control(ControlReply& output) noexcept {
    HeaderFor(output);
    output.callQpc = Qpc();
    output.state = shared.phase.load(std::memory_order_acquire);
    output.terminal = shared.terminal.load(std::memory_order_acquire);
    output.generation = shared.opened.load(std::memory_order_acquire) ? 1U : 0U;
    // Initialization (or its early failure) has not published immutable metadata.
    output.sourceInstanceQpc = shared.metadataReady.load(std::memory_order_acquire) ? shared.instance : 0;
    output.queued = Queued();
    output.targetAttempts = shared.attempts.load(std::memory_order_acquire);
    output.lastTargetAfterQpc = shared.lastAfter.load(std::memory_order_acquire);
}
std::uint32_t Reply(Code code, ControlReply* output, std::uint32_t bytes) noexcept {
    ControlReply reply{};
    Control(reply);
    return static_cast<std::uint32_t>(Output(output, bytes, reply) ? code : Code::BadArgument);
}
bool Push(const Record& record) noexcept {
    const auto head = shared.head.load(std::memory_order_relaxed);
    const auto tail = shared.tail.load(std::memory_order_acquire);
    if (head - tail >= QueueCapacity) { shared.dropped.fetch_add(1); return false; }
    shared.queue[head % QueueCapacity] = record;
    shared.head.store(head + 1, std::memory_order_release);
    return true;
}
void PublishContext(const Context& context) noexcept {
    if (shared.contextGuard.test_and_set(std::memory_order_acquire)) return;
    shared.latest = context;
    shared.contextSequence.fetch_add(1, std::memory_order_release);
    shared.contextGuard.clear(std::memory_order_release);
}
std::uint64_t Handle(std::int32_t value) noexcept { return static_cast<std::uint32_t>(value); }
std::int32_t Signed(std::uint32_t value) noexcept {
    std::int32_t result = 0;
    std::memcpy(&result, &value, sizeof(result));
    return result;
}
struct NativeReturn {
    ReadStatus status;
    std::uint32_t bits;
    float value;
    bool pointer;
    std::uint32_t exception;
};
// This leaf and Address() are called ONLY by ScriptMain and its private readers.
// SEH records detectable faults; it cannot promise recovery from every native
// hang, process-fatal exception, filesystem/OS stall or memory corruption.
NativeReturn Invoke(std::uint64_t hash, std::uint64_t a = 0, std::uint64_t b = 0,
    std::uint64_t c = 0, unsigned count = 0) noexcept {
    NativeReturn result{};
    if (Retired()) return result;
    __try {
        nativeInit(hash);
        if (count > 0) nativePush64(a);
        if (count > 1) nativePush64(b);
        if (count > 2) nativePush64(c);
        const UINT64* storage = nativeCall();
        result.pointer = storage != nullptr;
        if (storage) {
            // Copy both actual float32 and raw bits immediately, before any
            // later native, yield, post-context query or exported read.
            std::memcpy(&result.bits, storage, sizeof(result.bits));
            std::memcpy(&result.value, storage, sizeof(result.value));
            result.status = ReadStatus::Good;
        } else result.status = ReadStatus::Null;
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        result.status = ReadStatus::Seh;
        result.exception = GetExceptionCode();
    }
    return result;
}
Terminal Read(std::uint64_t hash, std::uint32_t& value, std::uint64_t a = 0,
    std::uint64_t b = 0, std::uint64_t c = 0, unsigned count = 0) noexcept {
    const auto result = Invoke(hash, a, b, c, count);
    if (result.status == ReadStatus::Good) { value = result.bits; return Terminal::None; }
    if (result.status == ReadStatus::NotAttempted) return Terminal::CallerStopped;
    shared.failedNative.store(hash, std::memory_order_release);
    shared.exceptionCode.store(result.exception, std::memory_order_release);
    return result.status == ReadStatus::Null ? Terminal::NativeNull : Terminal::NativeSeh;
}
Terminal Address(std::int32_t handle, std::uint64_t& address) noexcept {
    if (Retired()) return Terminal::CallerStopped;
    __try {
        address = reinterpret_cast<std::uint64_t>(getScriptHandleBaseAddress(handle));
    } __except (EXCEPTION_EXECUTE_HANDLER) {
        shared.failedNative.store(0, std::memory_order_release);
        shared.exceptionCode.store(GetExceptionCode(), std::memory_order_release);
        return Terminal::AddressSeh;
    }
    return address != 0 ? Terminal::None : Terminal::AddressNull;
}
bool Foreground() noexcept {
    DWORD pid = 0;
    const HWND window = GetForegroundWindow();
    return window && GetWindowThreadProcessId(window, &pid) != 0 && pid == shared.pid;
}
Terminal ReadContext(Context& context) noexcept {
    context = {};
    context.startQpc = Qpc();
    if (context.startQpc <= 0) return Terminal::SourceTimeInvalid;
    auto finish = [&context]() noexcept { context.endQpc = Qpc(); return Terminal::None; };
    if (!Foreground()) return finish();
    std::uint32_t value = 0;
    Terminal error = Read(N::NetworkGame, value);
    if (error != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::NetworkSession, value)) != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::PauseMenu, value)) != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::IsLoading, value)) != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::PlayerSwitch, value)) != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::PlayerId, value)) != Terminal::None) return error;
    context.player = Signed(value);
    if (context.player < 0) return finish();
    if ((error = Read(N::PlayerPlaying, value, Handle(context.player), 0, 0, 1)) != Terminal::None) return error;
    if (value == 0) return finish();
    if ((error = Read(N::PlayerPed, value)) != Terminal::None) return error;
    context.ped = Signed(value);
    if (context.ped == 0) return finish();
    if ((error = Read(N::EntityExists, value, Handle(context.ped), 0, 0, 1)) != Terminal::None) return error;
    if (value == 0) return finish();
    if ((error = Read(N::EntityIsPed, value, Handle(context.ped), 0, 0, 1)) != Terminal::None) return error;
    if (value == 0) return finish();
    if ((error = Read(N::EntityDead, value, Handle(context.ped), 0, 0, 2)) != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::PedVehicle, value, Handle(context.ped), 0, 0, 2)) != Terminal::None) return error;
    context.vehicle = Signed(value);
    if (context.vehicle == 0) return finish();
    if ((error = Read(N::EntityExists, value, Handle(context.vehicle), 0, 0, 1)) != Terminal::None) return error;
    if (value == 0) return finish();
    if ((error = Read(N::EntityIsVehicle, value, Handle(context.vehicle), 0, 0, 1)) != Terminal::None) return error;
    if (value == 0) return finish();
    if ((error = Read(N::EntityDead, value, Handle(context.vehicle), 0, 0, 2)) != Terminal::None) return error;
    if (value != 0) return finish();
    if ((error = Read(N::EntityModel, context.model, Handle(context.vehicle), 0, 0, 1)) != Terminal::None) return error;
    if (context.model != N::BatiModel) return finish();
    if ((error = Read(N::VehicleSeatPed, value, Handle(context.vehicle), Handle(-1), 0, 3)) != Terminal::None) return error;
    context.driver = Signed(value);
    if (context.driver != context.ped) return finish();
    if ((error = Read(N::EngineRunning, context.engineRunningRaw, Handle(context.vehicle), 0, 0, 1)) != Terminal::None) return error;
    context.flags |= EngineObserved;
    if (context.engineRunningRaw != 1) return finish();
    if ((error = Read(N::EntitySpeed, context.speedBits, Handle(context.vehicle), 0, 0, 1)) != Terminal::None) return error;
    context.flags |= SpeedObserved;
    float speed = 0;
    std::memcpy(&speed, &context.speedBits, sizeof(speed));
    if (!std::isfinite(speed) || speed < 0 || speed > 100) return finish();
    if ((error = Address(context.vehicle, context.vehicleAddress)) != Terminal::None) return error;
    if ((error = Address(context.ped, context.pedAddress)) != Terminal::None) return error;
    context.flags |= AddressesObserved;
    context.endQpc = Qpc();
    if (context.endQpc < context.startQpc) return Terminal::SourceTimeInvalid;
    if (context.endQpc - context.startQpc > Ticks(MaximumGapMilliseconds)) return Terminal::ContextStale;
    if (!Foreground()) return Terminal::None;
    context.flags |= Eligible;
    return Terminal::None;
}
bool Complete(const Context& context) noexcept { return context.flags == CompleteContext; }
bool Same(const Context& a, const Context& b) noexcept {
    return a.player == b.player && a.ped == b.ped && a.vehicle == b.vehicle && a.driver == b.driver
        && a.model == b.model && a.vehicleAddress == b.vehicleAddress && a.pedAddress == b.pedAddress;
}
bool Expected(const Context& context, const BeginRequest& request) noexcept {
    return context.vehicle == request.expectedVehicle && context.ped == request.expectedPed
        && context.player == request.expectedPlayer && context.vehicleAddress == request.expectedVehicleAddress
        && context.pedAddress == request.expectedPedAddress;
}
Record BaseRecord(Kind kind) noexcept {
    Record record{};
    record.size = static_cast<std::uint32_t>(sizeof(Record));
    record.kind = kind;
    record.session[0] = shared.key.session[0]; record.session[1] = shared.key.session[1];
    record.generation = 1;
    record.sequence = shared.attempts.load(std::memory_order_acquire);
    record.sourceInstanceQpc = shared.instance;
    return record;
}
void Finish() noexcept {
    // Retired is immediate safety cancellation. Completed separately means the
    // acquisition callback has finished every possible audit publication.
    if (shared.opened.load(std::memory_order_acquire)) {
        auto terminal = BaseRecord(Kind::Terminal);
        terminal.terminal = shared.terminal.load(std::memory_order_acquire);
        terminal.flags = SourceEnded;
        terminal.failedNative = shared.failedNative.load(std::memory_order_acquire);
        terminal.exceptionCode = shared.exceptionCode.load(std::memory_order_acquire);
        Push(terminal);
    }
    shared.producerCompleted.store(true, std::memory_order_release);
}
void Capture(const Context& bound) noexcept {
    if (Queued() > QueueCapacity - 2) { Retire(Terminal::QueueFull); return; }
    Record record = BaseRecord(Kind::TargetReturn);
    Terminal error = ReadContext(record.pre);
    PublishContext(record.pre);
    if (error != Terminal::None || !Complete(record.pre)) {
        Retire(error == Terminal::None ? Terminal::InvalidContext : error); return;
    }
    if (!Same(record.pre, bound)) { Retire(Terminal::IdentityChanged); return; }
    record.flags |= PreObserved;
    const auto previous = shared.lastAfter.load(std::memory_order_acquire);
    if (previous != 0 && (record.pre.startQpc < previous || record.pre.startQpc - previous > Ticks(MaximumGapMilliseconds))) {
        Retire(Terminal::ContextGap); return;
    }
    if (!Foreground()) { Retire(Terminal::InvalidContext); return; }
    const auto before = Qpc();
    const auto start = shared.activeStart.load(std::memory_order_acquire);
    const auto end = shared.activeEnd.load(std::memory_order_acquire);
    if (before <= 0 || before < start || before >= end) { Retire(Terminal::ActiveTimeout); return; }
    if (before < record.pre.endQpc || before - record.pre.endQpc > Ticks(MaximumGapMilliseconds)) { Retire(Terminal::ContextStale); return; }
    if (previous != 0 && before - previous < Ticks(MinimumIntervalMilliseconds)) { Retire(Terminal::SourceTimeInvalid); return; }
    if (Retired()) return;
    if (shared.attempts.load(std::memory_order_acquire) >= MaximumTargets) { Retire(Terminal::TargetLimit); return; }
    record.targetBeforeQpc = before;
    record.sequence = shared.attempts.fetch_add(1, std::memory_order_acq_rel) + 1;
    record.flags |= TargetAttempted;
    const auto raw = Invoke(N::CurrentRevRatio, Handle(record.pre.vehicle), 0, 0, 1);
    record.targetAfterQpc = Qpc();
    shared.lastAfter.store(record.targetAfterQpc, std::memory_order_release);
    record.rawBits = raw.bits; record.rawFloat32 = raw.value;
    record.readStatus = raw.status; record.exceptionCode = raw.exception;
    if (raw.pointer) record.flags |= PointerPresent;
    if (raw.status == ReadStatus::Good) record.flags |= RawPresent;
    if (record.targetAfterQpc < before) record.terminal = Terminal::SourceTimeInvalid;
    else if (record.targetAfterQpc >= end) { record.terminal = Terminal::LateReturn; record.flags |= ReturnedLate; }
    if (raw.status != ReadStatus::Good) {
        record.failedNative = N::CurrentRevRatio;
        record.terminal = raw.status == ReadStatus::Null ? Terminal::NativeNull
            : raw.status == ReadStatus::Seh ? Terminal::NativeSeh : Terminal::CallerStopped;
    }
    // First immutable FIFO publication is BEFORE EVERY post-context native.
    if (!Push(record)) { Retire(Terminal::QueueFull); return; }
    record.kind = Kind::Observation;
    if (record.terminal == Terminal::None && Retired()) record.terminal = shared.terminal.load(std::memory_order_acquire);
    if (record.terminal == Terminal::None && !std::isfinite(record.rawFloat32)) record.terminal = Terminal::RawNonfinite;
    if (record.terminal == Terminal::None && (record.rawFloat32 < 0 || record.rawFloat32 > 1)) record.terminal = Terminal::RawOutsideReviewBand;
    if (record.terminal == Terminal::None && record.rawFloat32 == 0) record.terminal = Terminal::RunningZero;
    if (record.terminal == Terminal::None) {
        error = ReadContext(record.post);
        PublishContext(record.post);
        if (error != Terminal::None) record.terminal = error;
        else if (!Complete(record.post)) record.terminal = Terminal::InvalidContext;
        else {
            record.flags |= PostObserved;
            if (!Same(record.pre, record.post) || !Same(record.post, bound)) record.terminal = Terminal::IdentityChanged;
            else if (record.post.startQpc < record.targetAfterQpc || record.post.endQpc < record.post.startQpc)
                record.terminal = Terminal::SourceTimeInvalid;
            else if (record.post.endQpc - record.pre.startQpc > Ticks(MaximumGapMilliseconds)) record.terminal = Terminal::ContextStale;
            else if (record.post.endQpc >= end) record.terminal = Terminal::LateReturn;
            else record.flags |= BracketValid;
        }
    }
    if (record.terminal == Terminal::None && Retired()) record.terminal = shared.terminal.load(std::memory_order_acquire);
    if (record.terminal == Terminal::None && shared.attempts.load(std::memory_order_acquire) >= MaximumTargets) record.terminal = Terminal::TargetLimit;
    if (record.terminal != Terminal::None) {
        record.flags |= SourceEnded;
        if (record.failedNative == 0) record.failedNative = shared.failedNative.load(std::memory_order_acquire);
        if (record.exceptionCode == 0) record.exceptionCode = shared.exceptionCode.load(std::memory_order_acquire);
    }
    if (!Push(record)) { Retire(Terminal::QueueFull); return; }
    if (record.terminal != Terminal::None) Retire(record.terminal);
}
void ScriptMain() noexcept {
    if (shared.scriptUsed.exchange(true)) return;
    HMODULE pinned = nullptr;
    if (!GetModuleHandleExW(GET_MODULE_HANDLE_EX_FLAG_FROM_ADDRESS | GET_MODULE_HANDLE_EX_FLAG_PIN,
        reinterpret_cast<LPCWSTR>(&ScriptMain), &pinned)) { Retire(Terminal::ModulePinFailed); Finish(); return; }
    LARGE_INTEGER frequency{};
    FILETIME creation{}, exit{}, kernel{}, user{};
    shared.instance = Qpc();
    if (!QueryPerformanceFrequency(&frequency) || frequency.QuadPart <= 0 || frequency.QuadPart > 1000000000
        || !GetProcessTimes(GetCurrentProcess(), &creation, &exit, &kernel, &user) || shared.instance <= 0) {
        Retire(Terminal::ProcessUnavailable); Finish(); return;
    }
    shared.frequency = frequency.QuadPart;
    if (shared.instance > (std::numeric_limits<std::int64_t>::max)() - Ticks(WaitingMilliseconds + ActiveMilliseconds)) {
        Retire(Terminal::SourceTimeInvalid); Finish(); return;
    }
    shared.creation = static_cast<std::uint64_t>(creation.dwHighDateTime) << 32 | creation.dwLowDateTime;
    shared.pid = GetCurrentProcessId();
    shared.waitingEnd = shared.instance + Ticks(WaitingMilliseconds);
    shared.metadataReady.store(true, std::memory_order_release);
    shared.phase.store(State::Ready, std::memory_order_release);
    Context bound{};
    std::int64_t next = shared.instance;
    while (!Retired()) {
        const auto now = Qpc();
        const auto phase = shared.phase.load(std::memory_order_acquire);
        if (now <= 0) { Retire(Terminal::SourceTimeInvalid); break; }
        if (phase != State::Active && now >= shared.waitingEnd) { Retire(Terminal::WaitingTimeout); break; }
        if (phase == State::Ready) { scriptWait(10); continue; }
        if (phase == State::Waiting) {
            if (now >= next) {
                Context context{};
                const auto error = ReadContext(context);
                PublishContext(context);
                if (error != Terminal::None) { Retire(error); break; }
                next = Qpc() + Ticks(MinimumIntervalMilliseconds);
            }
        } else if (phase == State::BeginPending) {
            const auto error = ReadContext(bound);
            PublishContext(bound);
            if (error != Terminal::None || !Complete(bound)) { Retire(error == Terminal::None ? Terminal::InvalidContext : error); break; }
            const auto& request = shared.begin;
            const auto accepted = Qpc();
            if (!Expected(bound, request) || request.expectedContextSequence == 0
                || request.expectedContextSequence > shared.contextSequence.load(std::memory_order_acquire)
                || request.expectedContextEndQpc <= 0 || bound.startQpc < request.expectedContextEndQpc
                || accepted < request.expectedContextEndQpc || accepted - request.expectedContextEndQpc > Ticks(MaximumGapMilliseconds)) {
                Retire(Terminal::IdentityChanged); break;
            }
            if (accepted >= shared.waitingEnd) { Retire(Terminal::WaitingTimeout); break; }
            shared.activeStart.store(accepted, std::memory_order_release);
            shared.activeEnd.store(accepted + Ticks(ActiveMilliseconds), std::memory_order_release);
            State expected = State::BeginPending;
            if (!shared.phase.compare_exchange_strong(expected, State::Active, std::memory_order_acq_rel)) break;
            next = accepted;
        } else if (phase == State::Active) {
            if (now >= shared.activeEnd.load(std::memory_order_acquire)) { Retire(Terminal::ActiveTimeout); break; }
            if (now >= next) {
                Capture(bound);
                next = shared.lastAfter.load(std::memory_order_acquire) + Ticks(MinimumIntervalMilliseconds);
            }
        }
        if (!Retired()) scriptWait(1);
    }
    // Terminal is also available out of band even if the bounded FIFO is full.
    // Audit rows can still be drained, but no retired row qualifies for use.
    Finish();
    // Module remains pinned until process exit. No hot-unload promise.
}
}

RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvDescribe(RichAudioShv::Description* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    Description reply{}; HeaderFor(reply);
    if (!shared.metadataReady.load(std::memory_order_acquire)) return static_cast<std::uint32_t>(Code::Unavailable);
    std::memcpy(reply.buildId, BuildId, sizeof(BuildId));
    reply.processId = shared.pid;
    reply.flags = PassiveOnly | ReadOnlyOpaqueAddresses | NoAudio | NativeOnlyInScript | FixedBounds | ChangedProducerNotLiveAccepted;
    if (shared.producerCompleted.load(std::memory_order_acquire)) reply.flags |= ProducerCompleted;
    reply.processCreationFileTime = shared.creation; reply.sourceInstanceQpc = shared.instance;
    reply.frequency = shared.frequency; reply.callQpc = Qpc();
    reply.waitingMilliseconds = WaitingMilliseconds; reply.activeMilliseconds = ActiveMilliseconds;
    reply.maximumTargets = MaximumTargets; reply.minimumIntervalMilliseconds = MinimumIntervalMilliseconds;
    reply.queueCapacity = QueueCapacity; reply.recordBytes = static_cast<std::uint32_t>(sizeof(Record));
    reply.contextBytes = static_cast<std::uint32_t>(sizeof(Context)); reply.packing = 8;
    reply.nativeHash = N::CurrentRevRatio; reply.model = N::BatiModel;
    return static_cast<std::uint32_t>(Output(output, bytes, reply) ? Code::Ok : Code::BadArgument);
}
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvOpen(const RichAudioShv::OpenRequest* request, std::uint32_t requestBytes,
    RichAudioShv::ControlReply* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    OpenRequest input{};
    if (!output || bytes != sizeof(ControlReply) || !Input(request, requestBytes, input)) return static_cast<std::uint32_t>(Code::BadArgument);
    if (shared.phase.load(std::memory_order_acquire) != State::Ready) return Reply(Code::InvalidState, output, bytes);
    if (!Nonzero(input.key) || input.expectedProcessId != shared.pid || input.expectedProcessCreationFileTime != shared.creation
        || input.reserved != 0 || input.reserved2 != 0 || std::memcmp(input.expectedBuildId, BuildId, sizeof(BuildId)) != 0)
        return Reply(Code::BadArgument, output, bytes);
    if (shared.commandGuard.test_and_set(std::memory_order_acquire)) return Reply(Code::Busy, output, bytes);
    if (shared.openUsed.exchange(true)) { shared.commandGuard.clear(std::memory_order_release); return Reply(Code::AlreadyUsed, output, bytes); }
    shared.key = input.key;
    State expected = State::Ready;
    const bool accepted = shared.phase.compare_exchange_strong(expected, State::Waiting, std::memory_order_acq_rel);
    if (accepted) shared.opened.store(true, std::memory_order_release);
    shared.commandGuard.clear(std::memory_order_release);
    return Reply(accepted ? Code::Ok : Code::InvalidState, output, bytes);
}
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvClock(const RichAudioShv::Request* request, std::uint32_t requestBytes,
    RichAudioShv::ClockReply* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    Request input{};
    if (!Input(request, requestBytes, input) || !output || bytes != sizeof(ClockReply)) return static_cast<std::uint32_t>(Code::BadArgument);
    if (!Authorized(input.key)) return static_cast<std::uint32_t>(Code::Unauthorized);
    ClockReply reply{}; HeaderFor(reply);
    reply.frequency = shared.frequency; reply.sourceInstanceQpc = shared.instance; reply.processCreationFileTime = shared.creation;
    reply.session[0] = shared.key.session[0]; reply.session[1] = shared.key.session[1]; reply.generation = 1;
    reply.state = shared.phase.load(std::memory_order_acquire); reply.terminal = shared.terminal.load(std::memory_order_acquire);
    reply.lastTargetAfterQpc = shared.lastAfter.load(std::memory_order_acquire);
    reply.activeStartQpc = shared.activeStart.load(std::memory_order_acquire); reply.waitingDeadlineQpc = shared.waitingEnd;
    reply.activeDeadlineQpc = shared.activeEnd.load(std::memory_order_acquire); reply.targetAttempts = shared.attempts.load(std::memory_order_acquire);
    reply.queued = Queued(); reply.callQpc = Qpc();
    return static_cast<std::uint32_t>(Output(output, bytes, reply) ? Code::Ok : Code::BadArgument);
}
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvPeek(const RichAudioShv::Request* request, std::uint32_t requestBytes,
    RichAudioShv::ContextReply* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    Request input{};
    if (!Input(request, requestBytes, input) || !output || bytes != sizeof(ContextReply)) return static_cast<std::uint32_t>(Code::BadArgument);
    if (!Authorized(input.key)) return static_cast<std::uint32_t>(Code::Unauthorized);
    if (shared.contextGuard.test_and_set(std::memory_order_acquire)) return static_cast<std::uint32_t>(Code::Busy);
    ContextReply reply{}; HeaderFor(reply);
    reply.context = shared.latest; reply.contextSequence = shared.contextSequence.load(std::memory_order_acquire);
    shared.contextGuard.clear(std::memory_order_release);
    reply.session[0] = shared.key.session[0]; reply.session[1] = shared.key.session[1]; reply.sourceInstanceQpc = shared.instance;
    reply.generation = 1; reply.state = shared.phase.load(std::memory_order_acquire); reply.terminal = shared.terminal.load(std::memory_order_acquire);
    reply.failedNative = shared.failedNative.load(std::memory_order_acquire); reply.exceptionCode = shared.exceptionCode.load(std::memory_order_acquire);
    reply.callQpc = Qpc();
    if (!Output(output, bytes, reply)) return static_cast<std::uint32_t>(Code::BadArgument);
    return static_cast<std::uint32_t>(reply.contextSequence == 0 ? Code::Empty : Code::Ok);
}
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvBegin(const RichAudioShv::BeginRequest* request, std::uint32_t requestBytes,
    RichAudioShv::ControlReply* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    BeginRequest input{};
    if (!Input(request, requestBytes, input) || !output || bytes != sizeof(ControlReply)) return static_cast<std::uint32_t>(Code::BadArgument);
    if (!Authorized(input.key)) return Reply(Code::Unauthorized, output, bytes);
    if (shared.phase.load(std::memory_order_acquire) != State::Waiting) return Reply(Code::InvalidState, output, bytes);
    if (input.reserved != 0 || input.expectedContextSequence == 0 || input.expectedVehicleAddress == 0 || input.expectedPedAddress == 0
        || input.expectedVehicle == 0 || input.expectedPed == 0 || input.expectedPlayer < 0 || input.expectedContextEndQpc <= 0)
        return Reply(Code::BadArgument, output, bytes);
    for (const auto word : input.identityWords) if (word != 0) return Reply(Code::BadArgument, output, bytes);
    if (shared.commandGuard.test_and_set(std::memory_order_acquire)) return Reply(Code::Busy, output, bytes);
    if (shared.beginUsed.exchange(true)) { shared.commandGuard.clear(std::memory_order_release); return Reply(Code::AlreadyUsed, output, bytes); }
    shared.begin = input;
    State expected = State::Waiting;
    const bool accepted = shared.phase.compare_exchange_strong(expected, State::BeginPending, std::memory_order_acq_rel);
    shared.commandGuard.clear(std::memory_order_release);
    return Reply(accepted ? Code::Ok : Code::InvalidState, output, bytes);
}
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvReadNext(const RichAudioShv::Request* request, std::uint32_t requestBytes,
    RichAudioShv::ReadReply* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    Request input{};
    if (!Input(request, requestBytes, input) || !output || bytes != sizeof(ReadReply)) return static_cast<std::uint32_t>(Code::BadArgument);
    if (!Authorized(input.key)) return static_cast<std::uint32_t>(Code::Unauthorized);
    if (shared.readerGuard.test_and_set(std::memory_order_acquire)) return static_cast<std::uint32_t>(Code::Busy);
    const auto tail = shared.tail.load(std::memory_order_relaxed);
    const auto head = shared.head.load(std::memory_order_acquire);
    ReadReply reply{}; HeaderFor(reply);
    if (tail != head) reply.record = shared.queue[tail % QueueCapacity];
    reply.state = shared.phase.load(std::memory_order_acquire); reply.terminal = shared.terminal.load(std::memory_order_acquire);
    reply.callQpc = Qpc(); reply.queued = head - tail - (tail != head ? 1U : 0U);
    reply.droppedRecords = shared.dropped.load(std::memory_order_acquire);
    const bool copied = Output(output, bytes, reply);
    if (copied && tail != head) shared.tail.store(tail + 1, std::memory_order_release);
    shared.readerGuard.clear(std::memory_order_release);
    return static_cast<std::uint32_t>(!copied ? Code::BadArgument : tail == head ? Code::Empty : Code::Ok);
}
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvStop(const RichAudioShv::Request* request, std::uint32_t requestBytes,
    RichAudioShv::ControlReply* output, std::uint32_t bytes) noexcept {
    using namespace RichAudioShv;
    Request input{};
    if (!Input(request, requestBytes, input) || !output || bytes != sizeof(ControlReply)) return static_cast<std::uint32_t>(Code::BadArgument);
    if (!Authorized(input.key)) return Reply(Code::Unauthorized, output, bytes);
    Retire(Terminal::CallerStopped);
    return Reply(Code::Ok, output, bytes);
}

BOOL APIENTRY DllMain(HMODULE module, DWORD reason, LPVOID) {
    // /MT requires CRT thread notifications. Do not DisableThreadLibraryCalls.
    if (reason == DLL_PROCESS_ATTACH) scriptRegister(module, ScriptMain);
    else if (reason == DLL_PROCESS_DETACH) scriptUnregister(module);
    return TRUE;
}
