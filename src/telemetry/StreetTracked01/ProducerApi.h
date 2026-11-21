#pragma once
#include <cstdint>
namespace StreetTracked01 {
constexpr std::uint32_t Version=2,Model=0xF9300CC5;
enum class Phase:std::uint32_t {Dormant,Configuring,Arming,Active,Retired};
enum class Code:std::uint32_t {Ok,Empty,Busy,Invalid,Retired};
enum class Reason:std::uint32_t {None,CallerStopped,ContextLost,IdentityLost,NativeFailed,TimeInvalid,Limit};
enum class Stage:std::uint32_t {None,NetworkGame,NetworkSession,PauseMenu,Loading,PlayerSwitch,PlayerId,PlayerPlaying,PlayerPed,PedVehicle,EntityExists,EntityIsVehicle,EntityDead,EntityModel,Address,EngineRunning,Driver,Ratio,Clock,Limit,CallerStopped};
#pragma pack(push,8)
struct Description {std::uint32_t size,version,pid,fixture;std::int64_t frequency,now,instance;};
struct Request {std::uint32_t size,version;std::uint64_t session0,session1,address;std::uint32_t maximumRecords,maximumSeconds;};
struct Identity {std::int64_t before,after;std::uint64_t address;std::int32_t handle,driver;std::uint32_t model,running;};
struct Failure {std::int64_t before,after;std::uint64_t native,address;std::uint32_t stage,rawBits;std::int32_t handle;std::uint32_t returned;};
struct Record {std::uint32_t size,version;std::uint64_t session0,session1,sequence;Identity pre,post;std::int64_t targetBefore,targetAfter,readNow;std::uint32_t rawBits,status,reason,phase;Failure failure;};
#pragma pack(pop)
static_assert(sizeof(Description)==40&&sizeof(Request)==40&&sizeof(Identity)==40&&sizeof(Failure)==48&&sizeof(Record)==200,"Bounded Windows x64 ABI");
}
