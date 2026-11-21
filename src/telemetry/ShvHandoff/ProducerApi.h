#pragma once
#include <cstddef>
#include <cstdint>

// Owned same-process passive telemetry ABI. Windows x64, Cdecl, pack 8.
// No export invokes a game native. Pointer values below are opaque witnesses;
// callers must not dereference them or equate cross-framework handle numbers.
namespace RichAudioShv {
inline constexpr std::uint32_t Version = 1;
inline constexpr std::uint32_t BuildId[4] = { 0x52413039U, 0x00010000U, 0xF9DDA40BU, 0xC293A61EU };
inline constexpr std::uint32_t WaitingMilliseconds = 300000;
inline constexpr std::uint32_t ActiveMilliseconds = 120000;
inline constexpr std::uint32_t MaximumTargets = 2400;
inline constexpr std::uint32_t MinimumIntervalMilliseconds = 50;
inline constexpr std::uint32_t MaximumGapMilliseconds = 250;
inline constexpr std::uint32_t QueueCapacity = 128;
inline constexpr std::uint32_t MaximumRecords = 2 * MaximumTargets + 1;
inline constexpr std::uint32_t EvidenceBudgetBytes = 12 * 1024 * 1024;

enum class Code : std::uint32_t { Ok, Empty, Busy, BadArgument, Unauthorized, InvalidState, AlreadyUsed, Unavailable };
enum class State : std::uint32_t { Dormant, Ready, Waiting, BeginPending, Active, Retired };
enum class Terminal : std::uint32_t {
    None, CallerStopped, WaitingTimeout, ActiveTimeout, TargetLimit, QueueFull,
    InvalidContext, IdentityChanged, NativeNull, NativeSeh, AddressNull, AddressSeh,
    RawNonfinite, RawOutsideReviewBand, RunningZero, ContextStale, ContextGap,
    SourceTimeInvalid, ModulePinFailed, ProcessUnavailable, InternalFailure, LateReturn
};
enum class Kind : std::uint32_t { TargetReturn = 1, Observation = 2, Terminal = 3 };
enum class ReadStatus : std::uint32_t { NotAttempted, Good, Null, Seh };
enum ContextFlags : std::uint32_t { Eligible = 1, EngineObserved = 2, SpeedObserved = 4, AddressesObserved = 8 };
inline constexpr std::uint32_t CompleteContext = Eligible | EngineObserved | SpeedObserved | AddressesObserved;
enum RecordFlags : std::uint32_t {
    TargetAttempted = 1, PointerPresent = 2, PreObserved = 4, PostObserved = 8,
    BracketValid = 16, RawPresent = 32, ReturnedLate = 64, SourceEnded = 128
};
enum DescriptionFlags : std::uint32_t {
    PassiveOnly = 1, ReadOnlyOpaqueAddresses = 2, NoAudio = 4, NativeOnlyInScript = 8,
    FixedBounds = 16, ChangedProducerNotLiveAccepted = 32, ProducerCompleted = 64
};

#pragma pack(push, 8)
struct Header { std::uint32_t size; std::uint32_t version; };
struct Key { std::uint64_t session[2]; std::uint64_t secret[4]; };
struct Request { Header header; Key key; };
struct Description {
    Header header; std::uint32_t buildId[4]; std::uint32_t processId; std::uint32_t flags;
    std::uint64_t processCreationFileTime; std::int64_t sourceInstanceQpc;
    std::int64_t frequency; std::int64_t callQpc;
    std::uint32_t waitingMilliseconds; std::uint32_t activeMilliseconds;
    std::uint32_t maximumTargets; std::uint32_t minimumIntervalMilliseconds;
    std::uint32_t queueCapacity; std::uint32_t recordBytes; std::uint32_t contextBytes; std::uint32_t packing;
    std::uint64_t nativeHash; std::uint32_t model; std::uint32_t reserved;
};
struct OpenRequest {
    Header header; Key key; std::uint32_t expectedProcessId; std::uint32_t reserved;
    std::uint64_t expectedProcessCreationFileTime; std::uint32_t expectedBuildId[4]; std::uint64_t reserved2;
};
struct BeginRequest {
    Header header; Key key; std::uint64_t expectedContextSequence;
    std::uint64_t expectedVehicleAddress; std::uint64_t expectedPedAddress; std::int64_t expectedContextEndQpc;
    std::int32_t expectedVehicle; std::int32_t expectedPed; std::int32_t expectedPlayer; std::uint32_t reserved;
    std::uint32_t identityWords[4]; // Must be zero. No marker/DECOR mode exists in ABI v1.
};
struct ControlReply {
    Header header; State state; Terminal terminal; std::uint32_t reserved[2];
    std::int64_t callQpc; std::uint64_t generation; std::int64_t sourceInstanceQpc;
    std::uint32_t queued; std::uint32_t targetAttempts; std::int64_t lastTargetAfterQpc;
};
struct ClockReply {
    Header header; std::int64_t callQpc; std::int64_t frequency; std::int64_t sourceInstanceQpc;
    std::uint64_t processCreationFileTime; std::uint64_t session[2]; std::uint64_t generation;
    State state; Terminal terminal; std::int64_t lastTargetAfterQpc;
    std::int64_t activeStartQpc; std::int64_t waitingDeadlineQpc; std::int64_t activeDeadlineQpc;
    std::uint32_t targetAttempts; std::uint32_t queued;
};
struct Context {
    std::int64_t startQpc; std::int64_t endQpc;
    std::int32_t player; std::int32_t ped; std::int32_t vehicle; std::int32_t driver;
    std::uint32_t model; std::uint32_t engineRunningRaw; std::uint32_t speedBits; std::uint32_t flags;
    std::uint64_t vehicleAddress; std::uint64_t pedAddress;
    std::uint32_t identityWords[4]; // Always zero: reserved, not an instance tag.
};
struct ContextReply {
    Header header; std::uint64_t session[2]; std::int64_t sourceInstanceQpc; std::uint64_t generation;
    std::uint64_t contextSequence; Context context; State state; Terminal terminal;
    std::uint64_t failedNative; std::uint32_t exceptionCode; std::uint32_t reserved; std::int64_t callQpc;
};
struct Record {
    std::uint32_t size; Kind kind; std::uint64_t session[2]; std::uint64_t generation;
    std::uint64_t sequence; std::int64_t sourceInstanceQpc; std::int64_t targetBeforeQpc; std::int64_t targetAfterQpc;
    std::uint32_t rawBits; float rawFloat32; ReadStatus readStatus; std::uint32_t flags;
    Context pre; Context post; Terminal terminal; std::uint32_t exceptionCode; std::uint64_t failedNative;
};
struct ReadReply {
    Header header; State state; Terminal terminal; Record record;
    std::int64_t callQpc; std::uint32_t queued; std::uint32_t droppedRecords;
};
#pragma pack(pop)

static_assert(sizeof(void*) == 8, "Windows x64 ABI required");
static_assert(sizeof(float) == 4, "IEEE float32 storage required");
static_assert(sizeof(Key) == 48 && sizeof(Request) == 56, "request ABI");
static_assert(sizeof(Description) == 112 && sizeof(OpenRequest) == 96 && sizeof(BeginRequest) == 120, "control input ABI");
static_assert(sizeof(ControlReply) == 64 && sizeof(ClockReply) == 112, "control output ABI");
static_assert(sizeof(Context) == 80 && sizeof(ContextReply) == 160, "context ABI");
static_assert(sizeof(Record) == 256 && sizeof(ReadReply) == 288, "record ABI");
static_assert(offsetof(Context, vehicleAddress) == 48 && offsetof(Context, identityWords) == 64, "context offsets");
static_assert(offsetof(Record, rawBits) == 64 && offsetof(Record, rawFloat32) == 68, "raw return offsets");
static_assert(offsetof(Record, pre) == 80 && offsetof(Record, post) == 160 && offsetof(Record, failedNative) == 248, "record offsets");
static_assert(MaximumRecords * sizeof(Record) < EvidenceBudgetBytes, "fixed wire-record budget");
}

#if defined(RICHAUDIO_SHV_HANDOFF_EXPORTS)
#define RA_SHV_API extern "C" __declspec(dllexport)
#else
#define RA_SHV_API extern "C" __declspec(dllimport)
#endif
#define RA_SHV_CALL __cdecl
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvDescribe(RichAudioShv::Description* output, std::uint32_t outputBytes) noexcept;
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvOpen(const RichAudioShv::OpenRequest* request, std::uint32_t requestBytes, RichAudioShv::ControlReply* output, std::uint32_t outputBytes) noexcept;
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvClock(const RichAudioShv::Request* request, std::uint32_t requestBytes, RichAudioShv::ClockReply* output, std::uint32_t outputBytes) noexcept;
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvPeek(const RichAudioShv::Request* request, std::uint32_t requestBytes, RichAudioShv::ContextReply* output, std::uint32_t outputBytes) noexcept;
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvBegin(const RichAudioShv::BeginRequest* request, std::uint32_t requestBytes, RichAudioShv::ControlReply* output, std::uint32_t outputBytes) noexcept;
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvReadNext(const RichAudioShv::Request* request, std::uint32_t requestBytes, RichAudioShv::ReadReply* output, std::uint32_t outputBytes) noexcept;
RA_SHV_API std::uint32_t RA_SHV_CALL RichAudioShvStop(const RichAudioShv::Request* request, std::uint32_t requestBytes, RichAudioShv::ControlReply* output, std::uint32_t outputBytes) noexcept;
