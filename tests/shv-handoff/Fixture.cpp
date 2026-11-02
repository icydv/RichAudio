// Device-free ScriptHookV.dll replacement for the genuine producer ASI only.
// Never install in GTA. No foreground shim, input injection, game or audio API.
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
#include <atomic>
#include <cstdint>
#include <cstring>
#include "../../src/telemetry/ShvHandoff/NativeIds.h"

namespace {
namespace N = HandoffNativeIds;
enum class Case : std::uint32_t { Changing, Zero, Null, Seh, Nan, Infinity, OutOfRange,
    Identity, Address, Driver, Engine, Model, Offline, Freeze, Shutdown, PostDelay, MaximumDuration };
inline constexpr std::int32_t Ped = 1001, Vehicle = 2001, ReplacementVehicle = 2002;
inline constexpr std::uint64_t PedAddress = 0x10011000ULL, VehicleAddress = 0x20012000ULL;
inline constexpr std::uint64_t ReplacementAddress = 0x20022000ULL, ChangedAddress = 0x2001A000ULL;
inline constexpr std::uint32_t MaximumRaw = 2400;
struct Raw { std::uint32_t bits; std::uint32_t status; std::int64_t qpc; };
#pragma pack(push, 8)
struct Metrics {
    std::uint32_t size, version, caseId, scriptThreadId;
    std::uint64_t nativeCalls, addressCalls, targetCalls, waits;
    std::uint32_t nativeThreadViolations, addressThreadViolations, argumentViolations, unknownNative;
    std::uint32_t started, exited, blocked, registered, unregistered, rawPublished;
    std::int64_t firstTargetQpc, lastTargetQpc, firstBlockedQpc, frequency;
    std::uint64_t lastNativeHash;
};
#pragma pack(pop)
static_assert(sizeof(Metrics) == 128, "fixture metrics x64 pack8 ABI");
struct Shared {
    Case selected = Case::Changing;
    std::atomic<void(*)()> callback{nullptr};
    std::atomic<DWORD> threadId{0};
    std::atomic<HANDLE> thread{nullptr}, release{nullptr};
    std::atomic<bool> configured{false}, started{false}, exited{false}, blocked{false};
    // PLAYABLE-14: pause only the registered script's ordinary WAIT. The real
    // producer Clock export continues sampling QPC on its caller independently.
    std::atomic<bool> pauseWaiting{false}, waitingPaused{false};
    std::atomic<std::uint64_t> nativeCalls{0}, addressCalls{0}, targetCalls{0}, waits{0}, lastHash{0};
    std::atomic<std::uint32_t> nativeViolations{0}, addressViolations{0}, arguments{0}, unknown{0};
    std::atomic<std::uint32_t> registered{0}, unregistered{0}, published{0};
    std::atomic<std::int64_t> firstTarget{0}, lastTarget{0}, firstBlocked{0};
    Raw raw[MaximumRaw]{};
} shared;
struct NativeContext {
    std::uint64_t hash = 0, args[3]{};
    unsigned count = 0;
    std::uint64_t storage = 0;
    bool postPending = false, currentPost = false;
};
thread_local NativeContext current;
std::int64_t Qpc() noexcept { LARGE_INTEGER value{}; return QueryPerformanceCounter(&value) ? value.QuadPart : 0; }
std::uint32_t Bits(float value) noexcept { std::uint32_t bits = 0; std::memcpy(&bits, &value, sizeof(bits)); return bits; }
void CheckThread(bool address = false) noexcept {
    if (GetCurrentThreadId() != shared.threadId.load(std::memory_order_acquire)) {
        if (address) shared.addressViolations.fetch_add(1); else shared.nativeViolations.fetch_add(1);
    }
}
void Poison() noexcept { current.storage = 0xCDCDCDCDDEADBEEFULL; }
bool Changed() noexcept { return shared.targetCalls.load(std::memory_order_acquire) >= 3 && !current.currentPost; }
std::int32_t CurrentVehicle() noexcept {
    return shared.selected == Case::Identity && Changed() ? ReplacementVehicle : Vehicle;
}
std::uint64_t* Value(std::uint32_t bits) noexcept {
    current.storage = 0xA5A5A5A500000000ULL | bits;
    return &current.storage;
}
void Args(unsigned count, std::uint64_t a = 0, std::uint64_t b = 0, std::uint64_t c = 0) noexcept {
    if (current.count != count || (count > 0 && current.args[0] != a)
        || (count > 1 && current.args[1] != b) || (count > 2 && current.args[2] != c)) shared.arguments.fetch_add(1);
}
void Block(bool timed) noexcept {
    shared.blocked.store(true, std::memory_order_release);
    std::int64_t expected = 0; shared.firstBlocked.compare_exchange_strong(expected, Qpc());
    if (timed) Sleep(650);
    else WaitForSingleObject(shared.release.load(std::memory_order_acquire), 10000);
    shared.blocked.store(false, std::memory_order_release);
}
DWORD WINAPI Run(void*) {
    shared.threadId.store(GetCurrentThreadId(), std::memory_order_release);
    const auto callback = shared.callback.load(std::memory_order_acquire);
    if (callback) callback();
    shared.exited.store(true, std::memory_order_release);
    return 0;
}
}

// These seven C++ exports deliberately retain the exact MSVC SDK ABI names.
__declspec(dllexport) void scriptRegister(HMODULE, void (*entry)()) {
    shared.callback.store(entry, std::memory_order_release); shared.registered.fetch_add(1);
}
__declspec(dllexport) void scriptUnregister(HMODULE) {
    shared.unregistered.fetch_add(1); shared.callback.store(nullptr, std::memory_order_release);
}
__declspec(dllexport) void scriptWait(DWORD milliseconds) {
    CheckThread(); shared.waits.fetch_add(1); Poison();
    while (shared.pauseWaiting.load(std::memory_order_acquire)) {
        shared.waitingPaused.store(true, std::memory_order_release);
        Sleep(1);
    }
    shared.waitingPaused.store(false, std::memory_order_release);
    if (shared.selected == Case::Shutdown && shared.targetCalls.load(std::memory_order_acquire) >= 3 && !current.postPending) {
        // Deliberately end only our owned fake callback thread; a consumer must
        // detect silence independently, not rely on producer completion flags.
        shared.exited.store(true, std::memory_order_release); ExitThread(0);
    }
    Sleep(milliseconds);
}
__declspec(dllexport) void nativeInit(UINT64 hash) {
    CheckThread(); Poison(); current.hash = hash; current.count = 0;
}
__declspec(dllexport) void nativePush64(UINT64 value) {
    CheckThread();
    if (current.count < 3) current.args[current.count] = value;
    else shared.arguments.fetch_add(1);
    ++current.count;
}
__declspec(dllexport) UINT64* nativeCall() {
    CheckThread(); Poison(); shared.nativeCalls.fetch_add(1); shared.lastHash.store(current.hash);
    if (current.hash == N::NetworkGame) {
        current.currentPost = current.postPending; current.postPending = false;
        if (shared.targetCalls.load(std::memory_order_acquire) >= 3) {
            if (shared.selected == Case::Freeze && !current.currentPost) Block(false);
            if (shared.selected == Case::PostDelay && current.currentPost
                && shared.targetCalls.load(std::memory_order_acquire) == 3) Block(true);
        }
        Args(0); return Value(shared.selected == Case::Offline && Changed() ? 1U : 0U);
    }
    if (current.hash == N::NetworkSession || current.hash == N::PauseMenu || current.hash == N::IsLoading || current.hash == N::PlayerSwitch) {
        Args(0); return Value(0);
    }
    if (current.hash == N::PlayerId) { Args(0); return Value(0); }
    if (current.hash == N::PlayerPlaying) { Args(1, 0); return Value(1); }
    if (current.hash == N::PlayerPed) { Args(0); return Value(Ped); }
    if (current.hash == N::EntityExists) {
        const auto entity = current.args[0];
        if (current.count != 1 || (entity != Ped && entity != Vehicle && entity != ReplacementVehicle)) shared.arguments.fetch_add(1);
        return Value(entity == Ped || entity == static_cast<std::uint64_t>(CurrentVehicle()) ? 1U : 0U);
    }
    if (current.hash == N::EntityIsPed) { Args(1, Ped); return Value(1); }
    if (current.hash == N::EntityIsVehicle) { Args(1, static_cast<std::uint32_t>(CurrentVehicle())); return Value(1); }
    if (current.hash == N::EntityDead) {
        const auto entity = current.args[0];
        if (current.count != 2 || current.args[1] != 0 || (entity != Ped && entity != static_cast<std::uint64_t>(CurrentVehicle()))) shared.arguments.fetch_add(1);
        return Value(0);
    }
    if (current.hash == N::PedVehicle) { Args(2, Ped, 0); return Value(static_cast<std::uint32_t>(CurrentVehicle())); }
    if (current.hash == N::EntityModel) {
        Args(1, static_cast<std::uint32_t>(CurrentVehicle()));
        return Value(shared.selected == Case::Model && Changed() ? 0x12345678U : N::BatiModel);
    }
    if (current.hash == N::VehicleSeatPed) {
        Args(3, static_cast<std::uint32_t>(CurrentVehicle()), 0xFFFFFFFFULL, 0);
        return Value(shared.selected == Case::Driver && Changed() ? Ped + 1 : Ped);
    }
    if (current.hash == N::EngineRunning) {
        Args(1, static_cast<std::uint32_t>(CurrentVehicle()));
        return Value(shared.selected == Case::Engine && Changed() ? 0U : 1U);
    }
    if (current.hash == N::EntitySpeed) { Args(1, static_cast<std::uint32_t>(CurrentVehicle())); return Value(Bits(0)); }
    if (current.hash == N::CurrentRevRatio) {
        Args(1, static_cast<std::uint32_t>(CurrentVehicle()));
        const auto index = shared.targetCalls.fetch_add(1, std::memory_order_acq_rel);
        const auto qpc = Qpc();
        std::int64_t first = 0; shared.firstTarget.compare_exchange_strong(first, qpc);
        shared.lastTarget.store(qpc, std::memory_order_release); current.postPending = true;
        std::uint32_t bits = Bits(.2f + static_cast<float>(index % 16) * .04f), status = 0;
        if (index >= 3) {
            switch (shared.selected) {
            case Case::Zero: bits = 0; break;
            case Case::Null: status = 1; break;
            case Case::Seh: status = 2; break;
            case Case::Nan: bits = 0x7FC12345U; break;
            case Case::Infinity: bits = 0x7F800000U; break;
            case Case::OutOfRange: bits = Bits(1.5f); break;
            default: break;
            }
        }
        if (index < MaximumRaw) {
            shared.raw[index] = { bits, status, qpc };
            shared.published.store(static_cast<std::uint32_t>(index + 1), std::memory_order_release);
        } else shared.unknown.fetch_add(1);
        if (status == 1) return nullptr;
        if (status == 2) { RaiseException(0xE0420005U, 0, 0, nullptr); return nullptr; }
        return Value(bits);
    }
    shared.unknown.fetch_add(1); return Value(0);
}
__declspec(dllexport) BYTE* getScriptHandleBaseAddress(int handle) {
    CheckThread(true); Poison(); shared.addressCalls.fetch_add(1);
    std::uint64_t address = 0;
    if (handle == Ped) address = PedAddress;
    else if (handle == CurrentVehicle()) {
        address = handle == ReplacementVehicle ? ReplacementAddress : VehicleAddress;
        if (shared.selected == Case::Address && Changed()) address = ChangedAddress;
    } else shared.arguments.fetch_add(1);
    return reinterpret_cast<BYTE*>(address); // Opaque test value; never dereference.
}

#define FIXTURE_API extern "C" __declspec(dllexport)
FIXTURE_API BOOL __cdecl FixtureConfigure(const char* name) {
    if (!name || shared.configured.load() || shared.started.load() || shared.callback.load()) return FALSE;
    unsigned length = 0; while (length < 64 && name[length] != '\0') ++length;
    if (length == 64) return FALSE;
    struct Entry { const char* name; Case selected; };
    const Entry entries[] = {
        {"valid_changing",Case::Changing},{"zero_running",Case::Zero},{"null_pointer",Case::Null},{"target_seh",Case::Seh},
        {"nan",Case::Nan},{"infinity",Case::Infinity},{"out_of_range",Case::OutOfRange},
        {"source_identity_changed",Case::Identity},{"source_address_changed",Case::Address},{"source_driver_changed",Case::Driver},
        {"source_engine_off",Case::Engine},{"source_model_changed",Case::Model},{"source_offline_lost",Case::Offline},
        {"freeze_after_3",Case::Freeze},{"shutdown_after_3",Case::Shutdown},{"post_context_delay",Case::PostDelay},{"max_duration",Case::MaximumDuration}
    };
    bool found = false;
    for (const auto& entry : entries) if (std::strcmp(name, entry.name) == 0) { shared.selected = entry.selected; found = true; break; }
    if (!found) return FALSE;
    const auto event = CreateEventW(nullptr, TRUE, FALSE, nullptr);
    if (!event) return FALSE;
    shared.release.store(event, std::memory_order_release); shared.configured.store(true, std::memory_order_release);
    return TRUE;
}
FIXTURE_API BOOL __cdecl FixtureStartRegistered() {
    if (!shared.configured.load(std::memory_order_acquire) || !shared.callback.load(std::memory_order_acquire) || shared.started.exchange(true)) return FALSE;
    const auto thread = CreateThread(nullptr, 0, Run, nullptr, 0, nullptr);
    if (!thread) { shared.exited.store(true); return FALSE; }
    shared.thread.store(thread, std::memory_order_release); return TRUE;
}
FIXTURE_API void __cdecl FixtureRelease() {
    shared.pauseWaiting.store(false, std::memory_order_release);
    const auto event = shared.release.load(std::memory_order_acquire);
    if (event) SetEvent(event);
}
FIXTURE_API void __cdecl FixturePauseWaiting(BOOL pause) {
    shared.pauseWaiting.store(pause != FALSE, std::memory_order_release);
}
FIXTURE_API BOOL __cdecl FixtureWaitingPaused() {
    return shared.waitingPaused.load(std::memory_order_acquire) ? TRUE : FALSE;
}
FIXTURE_API BOOL __cdecl FixtureJoin(DWORD milliseconds) {
    const auto thread = shared.thread.load(std::memory_order_acquire);
    if (!thread || WaitForSingleObject(thread, milliseconds) != WAIT_OBJECT_0) return FALSE;
    HANDLE expected = thread;
    if (shared.thread.compare_exchange_strong(expected, nullptr)) CloseHandle(thread);
    const auto event = shared.release.exchange(nullptr);
    if (event) CloseHandle(event);
    return TRUE;
}
FIXTURE_API BOOL __cdecl FixtureGetMetrics(void* output, std::uint32_t bytes) {
    if (!output || bytes != sizeof(Metrics)) return FALSE;
    Metrics m{}; m.size = static_cast<std::uint32_t>(sizeof(m)); m.version = 1;
    m.caseId = static_cast<std::uint32_t>(shared.selected); m.scriptThreadId = shared.threadId.load();
    m.nativeCalls = shared.nativeCalls.load(); m.addressCalls = shared.addressCalls.load();
    m.targetCalls = shared.targetCalls.load(); m.waits = shared.waits.load();
    m.nativeThreadViolations = shared.nativeViolations.load(); m.addressThreadViolations = shared.addressViolations.load();
    m.argumentViolations = shared.arguments.load(); m.unknownNative = shared.unknown.load();
    m.started = shared.started.load() ? 1U : 0U; m.exited = shared.exited.load() ? 1U : 0U; m.blocked = shared.blocked.load() ? 1U : 0U;
    m.registered = shared.registered.load(); m.unregistered = shared.unregistered.load(); m.rawPublished = shared.published.load(std::memory_order_acquire);
    m.firstTargetQpc = shared.firstTarget.load(); m.lastTargetQpc = shared.lastTarget.load(); m.firstBlockedQpc = shared.firstBlocked.load();
    LARGE_INTEGER frequency{}; QueryPerformanceFrequency(&frequency); m.frequency = frequency.QuadPart;
    m.lastNativeHash = shared.lastHash.load(); std::memcpy(output, &m, sizeof(m)); return TRUE;
}
FIXTURE_API BOOL __cdecl FixtureRaw(std::uint32_t index, std::uint32_t* bits, std::int64_t* qpc, std::uint32_t* status) {
    if (!bits || !qpc || !status || index >= shared.published.load(std::memory_order_acquire) || index >= MaximumRaw) return FALSE;
    const auto row = shared.raw[index]; *bits = row.bits; *qpc = row.qpc; *status = row.status; return TRUE;
}
