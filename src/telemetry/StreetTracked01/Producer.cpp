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
Record firstFailure{};std::atomic<unsigned> failureReady{0};std::atomic<bool> failureRead{false};
std::atomic<bool> bindingReady{false};std::atomic<std::uint64_t> sequence{0};
std::atomic<bool> registered{false};HMODULE owner=nullptr;
std::atomic<bool> scriptReturned{false};
std::int64_t frequency=0,instance=0,start=0,last=0;int retained=0;
std::int64_t Now() noexcept {LARGE_INTEGER q{};return QueryPerformanceCounter(&q)?q.QuadPart:0;}
Failure Boundary(Stage stage) noexcept {Failure value{};value.stage=static_cast<unsigned>(stage);value.before=Now();value.after=value.before;return value;}
void End(Reason why,const Record* partial=nullptr,const Failure* failure=nullptr) noexcept {
 Reason empty=Reason::None;if(reason.compare_exchange_strong(empty,why)){
  failureReady.store(1,std::memory_order_release);Record value=partial?*partial:Record{};value.size=sizeof(value);value.version=Version;
  if(!partial&&bindingReady.load(std::memory_order_acquire)){value.session0=request.session0;value.session1=request.session1;value.sequence=sequence.load(std::memory_order_acquire);}
  value.reason=static_cast<unsigned>(why);value.phase=static_cast<unsigned>(Phase::Retired);
  value.failure=failure?*failure:Boundary(why==Reason::CallerStopped?Stage::CallerStopped:why==Reason::Limit?Stage::Limit:Stage::Clock);
  firstFailure=value;failureReady.store(2,std::memory_order_release);
 }phase.store(Phase::Retired,std::memory_order_release);
}
bool Raw(std::uint64_t hash,std::uint32_t& output,Failure& evidence,Stage stage,std::uint64_t arg=0,unsigned count=0,std::uint64_t second=0) noexcept {
 evidence=Boundary(stage);evidence.native=hash;evidence.handle=static_cast<std::int32_t>(arg);
 if(phase.load()==Phase::Retired)return false;
 __try {nativeInit(hash);if(count)nativePush64(arg);if(count>1)nativePush64(second);const auto value=nativeCall();evidence.after=Now();if(!value)return false;std::memcpy(&output,value,4);evidence.rawBits=output;evidence.returned=1;return true;}
 __except(EXCEPTION_EXECUTE_HANDLER){evidence.after=Now();return false;}
}
bool Address(int handle,std::uint64_t& output,Failure& evidence) noexcept {
 evidence=Boundary(Stage::Address);evidence.handle=handle;
 __try {output=reinterpret_cast<std::uint64_t>(getScriptHandleBaseAddress(handle));evidence.address=output;evidence.after=Now();evidence.returned=1;return output!=0;}
 __except(EXCEPTION_EXECUTE_HANDLER){evidence.after=Now();return false;}
}
bool Context(Failure& evidence) noexcept {
 std::uint32_t x=0;
 const std::uint64_t hashes[]={N::NetworkGame,N::NetworkSession,N::PauseMenu,N::IsLoading,N::PlayerSwitch};
 for(unsigned i=0;i<5;i++)if(!Raw(hashes[i],x,evidence,static_cast<Stage>(static_cast<unsigned>(Stage::NetworkGame)+i))||x)return false;
 if(!Raw(N::PlayerId,x,evidence,Stage::PlayerId))return false;const auto player=x;
 if(!Raw(N::PlayerPlaying,x,evidence,Stage::PlayerPlaying,player,1)||!x)return false;
 return true;
}
bool IdentityOf(int handle,Identity& value,Failure& evidence) noexcept {
 value={};value.before=Now();value.handle=handle;std::uint32_t x=0;const auto h=static_cast<std::uint64_t>(static_cast<std::int64_t>(handle));
 if(!Context(evidence)||!Raw(N::EntityExists,x,evidence,Stage::EntityExists,h,1)||!x||!Raw(N::EntityIsVehicle,x,evidence,Stage::EntityIsVehicle,h,1)||!x||!Raw(N::EntityDead,x,evidence,Stage::EntityDead,h,2)||x
  ||!Raw(N::EntityModel,value.model,evidence,Stage::EntityModel,h,1)||value.model!=Model||!Address(handle,value.address,evidence)||value.address!=request.address
  ||!Raw(N::EngineRunning,value.running,evidence,Stage::EngineRunning,h,1)||value.running>1)return false;
 // Driver is evidence only. Loss of the original rider never changes the
 // retained vehicle. Two parameters are required by this read-only native.
 evidence=Boundary(Stage::Driver);evidence.native=N::VehicleSeatPed;evidence.handle=handle;
 __try {nativeInit(N::VehicleSeatPed);nativePush64(h);nativePush64(static_cast<std::uint64_t>(-1LL));nativePush64(0);const auto p=nativeCall();evidence.after=Now();if(!p)return false;std::memcpy(&value.driver,p,4);evidence.rawBits=static_cast<unsigned>(value.driver);evidence.returned=1;}
 __except(EXCEPTION_EXECUTE_HANDLER){evidence.after=Now();return false;}
 value.after=Now();if(value.before<=0||value.after<value.before){evidence=Boundary(Stage::Clock);return false;}return true;
}
bool Acquire(Record& partial,Failure& evidence) noexcept {
 std::uint32_t ped=0,vehicle=0;if(!Context(evidence)||!Raw(N::PlayerPed,ped,evidence,Stage::PlayerPed)||!ped)return false;
 evidence=Boundary(Stage::PedVehicle);evidence.native=N::PedVehicle;evidence.handle=static_cast<int>(ped);
 __try {nativeInit(N::PedVehicle);nativePush64(ped);nativePush64(0);const auto p=nativeCall();evidence.after=Now();if(!p)return false;std::memcpy(&vehicle,p,4);evidence.rawBits=vehicle;evidence.returned=1;}
 __except(EXCEPTION_EXECUTE_HANDLER){evidence.after=Now();return false;}
 if(!vehicle)return false;if(!IdentityOf(static_cast<int>(vehicle),partial.pre,evidence)||partial.pre.driver!=static_cast<int>(ped))return false;
 retained=static_cast<int>(vehicle);return true;
}
void Tick() noexcept {
 auto state=phase.load(std::memory_order_acquire);if(state==Phase::Dormant||state==Phase::Configuring||state==Phase::Retired)return;
 Record value{};value.size=sizeof(value);value.version=Version;value.session0=request.session0;value.session1=request.session1;value.sequence=sequence.load();Failure evidence{};
 const auto now=Now();if(now<=0||now<last){evidence=Boundary(Stage::Clock);evidence.before=last;evidence.after=now;End(Reason::TimeInvalid,&value,&evidence);return;}
 if(now-start>frequency*request.maximumSeconds||sequence.load()>=request.maximumRecords){End(Reason::Limit,&value);return;}
 if(last&&now-last<frequency/20)return;
 if(state==Phase::Arming){if(!Acquire(value,evidence)){End(Reason::ContextLost,&value,&evidence);return;}
#ifdef STREET_TRACKED_FIXTURE_01
  StreetFixtureTransition01(2);
#endif
  Phase expected=Phase::Arming;if(!phase.compare_exchange_strong(expected,Phase::Active,std::memory_order_acq_rel))return;
 }
 value.sequence=++sequence;value.phase=static_cast<std::uint32_t>(Phase::Active);
 if(!IdentityOf(retained,value.pre,evidence)){End(Reason::IdentityLost,&value,&evidence);return;}
 value.targetBefore=Now();const bool returned=Raw(N::CurrentRevRatio,value.rawBits,evidence,Stage::Ratio,static_cast<std::uint64_t>(static_cast<std::int64_t>(retained)),1);value.targetAfter=Now();
 // Copy happened before these post-context native calls. Raw invalid/zero
 // values are retained as observations, never normalized or made audible.
 value.status=returned?1U:0U;if(!returned){End(Reason::NativeFailed,&value,&evidence);return;}
 if(!IdentityOf(retained,value.post,evidence)){End(Reason::IdentityLost,&value,&evidence);return;}
 if(value.pre.address!=value.post.address||value.pre.handle!=value.post.handle||value.targetBefore<value.pre.after||value.targetAfter<value.targetBefore||value.post.before<value.targetAfter){End(Reason::TimeInvalid,&value);return;}
 last=value.targetAfter;
 if(!slot.test_and_set(std::memory_order_acquire)){latest=value;available=true;slot.clear(std::memory_order_release);}
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
 request=*input;start=Now();bindingReady.store(true,std::memory_order_release);
#ifdef STREET_TRACKED_FIXTURE_01
 StreetFixtureTransition01(1);
#endif
 expected=Phase::Configuring;return phase.compare_exchange_strong(expected,Phase::Arming,std::memory_order_acq_rel)?0U:4U;
}
extern "C" __declspec(dllexport) unsigned __cdecl StreetRead01(StreetTracked01::Record* output,unsigned bytes){
 if(!output||bytes!=sizeof(*output))return 3;
 Record empty{};empty.size=sizeof(empty);empty.version=Version;*output=empty;
 if(reason.load(std::memory_order_acquire)!=Reason::None||phase.load(std::memory_order_acquire)==Phase::Retired){if(failureReady.load(std::memory_order_acquire)!=2)return 2;
  Record result=firstFailure;result.readNow=Now();*output=result;return failureRead.exchange(true)?1U:0U;
 }if(slot.test_and_set(std::memory_order_acquire))return 2;
 Record result=latest;const bool present=available;available=false;slot.clear(std::memory_order_release);
 const auto currentPhase=phase.load(std::memory_order_acquire);const auto currentReason=reason.load(std::memory_order_acquire);
 if(currentReason!=Reason::None||currentPhase==Phase::Retired){if(failureReady.load(std::memory_order_acquire)!=2)return 2;result=firstFailure;result.readNow=Now();*output=result;return failureRead.exchange(true)?1U:0U;}
 result.size=sizeof(result);result.version=Version;result.readNow=Now();result.phase=static_cast<unsigned>(currentPhase);result.reason=static_cast<unsigned>(currentReason);*output=result;return present?0U:1U;
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
