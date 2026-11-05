// New passive diagnostic only. Not included in the normal mod build/package.
#ifndef STREET_TRACKED_DIAGNOSTIC_01
#error Explicit disabled-diagnostic build profile required
#endif
#include "ProducerApi.h"
#include "ScriptHookVApi.h"
#include "../ShvHandoff/NativeIds.h"
#include <atomic>
#include <cstring>
#include <initializer_list>
#ifdef STREET_TRACKED_FIXTURE_01
void StreetFixtureTransition01(unsigned);
#endif
namespace {
using namespace StreetTracked01;namespace N=HandoffNativeIds;
std::atomic<Phase> phase{Phase::Dormant};std::atomic<Reason> reason{Reason::None};
std::atomic_flag slot=ATOMIC_FLAG_INIT;Request request{};Record latest{};bool available=false;
std::atomic<bool> registered{false};HMODULE owner=nullptr;
std::atomic<bool> scriptReturned{false};
std::int64_t frequency=0,instance=0,start=0,last=0;std::uint64_t sequence=0;int retained=0;
std::int64_t Now() noexcept {LARGE_INTEGER q{};return QueryPerformanceCounter(&q)?q.QuadPart:0;}
void End(Reason why) noexcept {Reason empty=Reason::None;reason.compare_exchange_strong(empty,why);phase.store(Phase::Retired,std::memory_order_release);}
bool Raw(std::uint64_t hash,std::uint32_t& output,std::uint64_t arg=0,unsigned count=0,std::uint64_t second=0) noexcept {
 if(phase.load()==Phase::Retired)return false;
 __try {nativeInit(hash);if(count)nativePush64(arg);if(count>1)nativePush64(second);const auto value=nativeCall();if(!value)return false;std::memcpy(&output,value,4);return true;}
 __except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
bool Address(int handle,std::uint64_t& output) noexcept {
 __try {output=reinterpret_cast<std::uint64_t>(getScriptHandleBaseAddress(handle));return output!=0;}
 __except(EXCEPTION_EXECUTE_HANDLER){return false;}
}
bool Context() noexcept {
 std::uint32_t x=0;
 for(const auto hash:{N::NetworkGame,N::NetworkSession,N::PauseMenu,N::IsLoading,N::PlayerSwitch})if(!Raw(hash,x)||x)return false;
 if(!Raw(N::PlayerId,x))return false;const auto player=x;
 if(!Raw(N::PlayerPlaying,x,player,1)||!x)return false;
 return true;
}
bool IdentityOf(int handle,Identity& value) noexcept {
 value={};value.before=Now();value.handle=handle;std::uint32_t x=0;const auto h=static_cast<std::uint64_t>(static_cast<std::int64_t>(handle));
 if(!Context()||!Raw(N::EntityExists,x,h,1)||!x||!Raw(N::EntityIsVehicle,x,h,1)||!x||!Raw(N::EntityDead,x,h,2)||x
  ||!Raw(N::EntityModel,value.model,h,1)||value.model!=Model||!Address(handle,value.address)||value.address!=request.address
  ||!Raw(N::EngineRunning,value.running,h,1)||value.running>1)return false;
 // Driver is evidence only. Loss of the original rider never changes the
 // retained vehicle. Two parameters are required by this read-only native.
 __try {nativeInit(N::VehicleSeatPed);nativePush64(h);nativePush64(static_cast<std::uint64_t>(-1LL));nativePush64(0);const auto p=nativeCall();if(!p)return false;std::memcpy(&value.driver,p,4);}
 __except(EXCEPTION_EXECUTE_HANDLER){return false;}
 value.after=Now();return value.before>0&&value.after>=value.before;
}
bool Acquire() noexcept {
 std::uint32_t ped=0,vehicle=0;if(!Context()||!Raw(N::PlayerPed,ped)||!ped)return false;
 __try {nativeInit(N::PedVehicle);nativePush64(ped);nativePush64(0);const auto p=nativeCall();if(!p)return false;std::memcpy(&vehicle,p,4);}
 __except(EXCEPTION_EXECUTE_HANDLER){return false;}
 if(!vehicle)return false;Identity identity{};if(!IdentityOf(static_cast<int>(vehicle),identity)||identity.driver!=static_cast<int>(ped))return false;
 retained=static_cast<int>(vehicle);return true;
}
void Tick() noexcept {
 auto state=phase.load(std::memory_order_acquire);if(state==Phase::Dormant||state==Phase::Configuring||state==Phase::Retired)return;
 const auto now=Now();if(now<=0||now<last){End(Reason::TimeInvalid);return;}
 if(now-start>frequency*request.maximumSeconds||sequence>=request.maximumRecords){End(Reason::Limit);return;}
 if(last&&now-last<frequency/20)return;
 if(state==Phase::Arming){if(!Acquire()){End(Reason::ContextLost);return;}
#ifdef STREET_TRACKED_FIXTURE_01
  StreetFixtureTransition01(2);
#endif
  Phase expected=Phase::Arming;if(!phase.compare_exchange_strong(expected,Phase::Active,std::memory_order_acq_rel))return;
 }
 Record value{};value.size=sizeof(value);value.version=Version;value.session0=request.session0;value.session1=request.session1;
 value.sequence=++sequence;value.phase=static_cast<std::uint32_t>(Phase::Active);
 if(!IdentityOf(retained,value.pre)){End(Reason::IdentityLost);return;}
 value.targetBefore=Now();const bool returned=Raw(N::CurrentRevRatio,value.rawBits,static_cast<std::uint64_t>(static_cast<std::int64_t>(retained)),1);value.targetAfter=Now();
 // Copy happened before these post-context native calls. Raw invalid/zero
 // values are retained as observations, never normalized or made audible.
 value.status=returned?1U:0U;if(!IdentityOf(retained,value.post)){End(Reason::IdentityLost);return;}
 if(value.pre.address!=value.post.address||value.pre.handle!=value.post.handle||value.targetBefore<value.pre.after||value.targetAfter<value.targetBefore||value.post.before<value.targetAfter){End(Reason::TimeInvalid);return;}
 last=value.targetAfter;
 if(!slot.test_and_set(std::memory_order_acquire)){latest=value;available=true;slot.clear(std::memory_order_release);}
 if(!returned)End(Reason::NativeFailed);
}
void ScriptMain(){while(phase.load()!=Phase::Retired){Tick();scriptWait(50);}scriptReturned.store(true,std::memory_order_release);}
void Close() noexcept {End(Reason::CallerStopped);if(registered.exchange(false))scriptUnregister(owner);}
}
extern "C" __declspec(dllexport) unsigned __cdecl StreetDescribe01(StreetTracked01::Description* output,unsigned bytes){
 if(!output||bytes!=sizeof(*output))return 3;Description d{};d.size=sizeof(d);d.version=Version;d.pid=GetCurrentProcessId();d.frequency=frequency;d.now=Now();d.instance=instance;
#ifdef STREET_TRACKED_FIXTURE_01
 d.fixture=1;
#endif
 *output=d;return 0;
}
extern "C" __declspec(dllexport) unsigned __cdecl StreetBegin01(const StreetTracked01::Request* input,unsigned bytes){
 if(!input||bytes!=sizeof(*input)||input->size!=sizeof(*input)||input->version!=Version||!(input->session0|input->session1)||!input->address||input->maximumRecords<1||input->maximumRecords>2400||input->maximumSeconds<1||input->maximumSeconds>120)return 3;
 Phase expected=Phase::Dormant;if(!phase.compare_exchange_strong(expected,Phase::Configuring))return 4;
 request=*input;start=Now();
#ifdef STREET_TRACKED_FIXTURE_01
 StreetFixtureTransition01(1);
#endif
 expected=Phase::Configuring;return phase.compare_exchange_strong(expected,Phase::Arming,std::memory_order_acq_rel)?0U:4U;
}
extern "C" __declspec(dllexport) unsigned __cdecl StreetRead01(StreetTracked01::Record* output,unsigned bytes){
 if(!output||bytes!=sizeof(*output))return 3;if(slot.test_and_set(std::memory_order_acquire))return 2;
 Record result=latest;const bool present=available;available=false;slot.clear(std::memory_order_release);
 result.size=sizeof(result);result.version=Version;result.readNow=Now();result.phase=static_cast<unsigned>(phase.load());result.reason=static_cast<unsigned>(reason.load());*output=result;return present?0U:1U;
}
extern "C" __declspec(dllexport) void __cdecl StreetStop01(){End(Reason::CallerStopped);}
// This proves only that the loop ended. It is written before the callback ret;
// the managed owner process-pins armed code rather than treating it as a join.
extern "C" __declspec(dllexport) unsigned __cdecl StreetClosed01(){return scriptReturned.load(std::memory_order_acquire)?1U:0U;}
#ifdef STREET_TRACKED_FIXTURE_01
extern "C" __declspec(dllexport) void __cdecl StreetFixtureTick01(){Tick();}
extern "C" __declspec(dllexport) void __cdecl StreetFixtureClose01(){Close();}
#endif
BOOL APIENTRY DllMain(HMODULE module,DWORD why,LPVOID){
 if(why==DLL_PROCESS_ATTACH){LARGE_INTEGER f{};if(!QueryPerformanceFrequency(&f))return FALSE;frequency=f.QuadPart;instance=Now();
 owner=module;scriptRegister(module,ScriptMain);registered=true;
 }else if(why==DLL_PROCESS_DETACH){Close();
 }return TRUE;
}
