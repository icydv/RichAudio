#include "../../src/telemetry/StreetTracked01/ScriptHookVApi.h"
#include "../../src/telemetry/ShvHandoff/NativeIds.h"
#include <atomic>
#include <cstring>
namespace {namespace N=HandoffNativeIds;void(*entry)()=nullptr;std::atomic<unsigned> calls{0},targets{0},registrations{0},unregistrations{0},pauseStage{0},reached{0};std::atomic<int> attached{1},running{1},exists{1},revision{0};std::atomic<unsigned> ratio{0x3f000000};thread_local UINT64 hash=0,args[4]{},result=0;thread_local unsigned count=0;}
void StreetFixtureTransition01(unsigned stage){if(pauseStage.load()==stage){reached=stage;while(pauseStage.load()==stage)Sleep(1);}}
void scriptRegister(HMODULE,void(*p)()){entry=p;registrations++;}
void scriptUnregister(HMODULE){unregistrations++;entry=nullptr;}
void scriptWait(DWORD ms){Sleep(ms);}
void nativeInit(UINT64 h){hash=h;count=0;calls++;if(h==N::CurrentRevRatio)targets++;}
void nativePush64(UINT64 value){if(count<4)args[count++]=value;}
UINT64* nativeCall(){
 result=0;
 if(hash==N::PlayerId)result=0;
 else if(hash==N::PlayerPed)result=101;
 else if(hash==N::PlayerPlaying)result=1;
 else if(hash==N::PedVehicle)result=attached.load()?123:0;
 else if(hash==N::EntityExists||hash==N::EntityIsVehicle)result=exists.load()?1:0;
 else if(hash==N::EntityModel)result=N::BatiModel;
 else if(hash==N::EngineRunning)result=running.load()?1:0;
 else if(hash==N::VehicleSeatPed){if(count!=3||args[1]!=static_cast<UINT64>(-1LL))return nullptr;result=attached.load()?101:0;}
 else if(hash==N::CurrentRevRatio){if(count!=1||args[0]!=123)return nullptr;result=ratio.load();}
 else if(hash==N::EntityDead){if(count!=2||args[1]!=0)return nullptr;}
 return &result;
}
BYTE* getScriptHandleBaseAddress(int handle){return handle==123?reinterpret_cast<BYTE*>(static_cast<UINT_PTR>(512+revision.load())):nullptr;}
extern "C" __declspec(dllexport) void __cdecl StreetFixtureSet01(int a,int r,int e,int rev,unsigned bits){attached=a;running=r;exists=e;revision=rev;ratio=bits;}
extern "C" __declspec(dllexport) void __cdecl StreetFixtureRun01(){if(entry)entry();}
extern "C" __declspec(dllexport) void __cdecl StreetFixtureCounts01(unsigned* n,unsigned* r,unsigned* u){*n=calls.load();*r=registrations.load();*u=unregistrations.load();}
extern "C" __declspec(dllexport) void __cdecl StreetFixturePause01(unsigned stage){pauseStage=stage;}
extern "C" __declspec(dllexport) unsigned __cdecl StreetFixtureReached01(){return reached.load();}
extern "C" __declspec(dllexport) unsigned __cdecl StreetFixtureTargets01(){return targets.load();}
