#pragma once
#include <cstdint>

// Published definitions, not inferred hashes or addresses:
// https://raw.githubusercontent.com/alloc8or/gta5-nativedb-data/
// 424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json
// Signatures below were checked against that Enhanced corpus.
namespace NativeIds {
inline constexpr std::uint64_t IsLoading = 0x10D0A8F259E93EC9ULL; // BOOL()
inline constexpr std::uint64_t NetworkGame = 0x10FAB35428CCC9D7ULL; // BOOL()
inline constexpr std::uint64_t NetworkSession = 0x9DE624D2FC4B603FULL; // BOOL()
inline constexpr std::uint64_t PlayerSwitch = 0xD9D2CFFF49FAB35FULL; // BOOL()
inline constexpr std::uint64_t PlayerId = 0x4F8644AF03D0E0D6ULL; // Player()
inline constexpr std::uint64_t PlayerPlaying = 0x5E9564D8246B909AULL; // BOOL(Player)
inline constexpr std::uint64_t PlayerPed = 0xD80958FC74E988A6ULL; // Ped()
inline constexpr std::uint64_t EntityExists = 0x7239B21A38F536BAULL; // BOOL(Entity)
inline constexpr std::uint64_t EntityIsPed = 0x524AC5ECEA15343EULL; // BOOL(Entity)
inline constexpr std::uint64_t EntityIsVehicle = 0x6AC7003FA6E5575EULL; // BOOL(Entity)
inline constexpr std::uint64_t EntityDead = 0x5F9532F3B5CC2551ULL; // BOOL(Entity, BOOL)
inline constexpr std::uint64_t PedVehicle = 0x9A9112A0FE9A4713ULL; // Vehicle(Ped, BOOL)
inline constexpr std::uint64_t EntityModel = 0x9F47B058362C84B5ULL; // Hash(Entity)
inline constexpr std::uint64_t VehicleSeatPed = 0xBB40DD2270B65366ULL; // Ped(Vehicle,int,BOOL)
inline constexpr std::uint64_t EngineRunning = 0xAE31E7DF9B5B132EULL; // BOOL(Vehicle)
inline constexpr std::uint64_t CurrentRevRatio = 0xF9DDA40BC293A61EULL; // float(Vehicle)
inline constexpr std::uint64_t EntitySpeed = 0xD5037BA82E12416FULL; // float(Entity), metres/second; gate only
inline constexpr std::uint64_t PauseMenu = 0xB0034A223497FFCBULL; // BOOL()
inline constexpr std::uint64_t TextFont = 0x66E0276CC5F6B9DAULL; // void(int)
inline constexpr std::uint64_t TextScale = 0x07C837F9A01C34C9ULL; // void(float,float)
inline constexpr std::uint64_t TextColour = 0xBE6B23FFA53FB442ULL; // void(int,int,int,int)
inline constexpr std::uint64_t TextOutline = 0x2513DFB0FB8400FEULL; // void()
inline constexpr std::uint64_t TextBegin = 0x25FBB336DF1804CBULL; // void(const char*)
inline constexpr std::uint64_t TextAdd = 0x6C188BE134E074AAULL; // void(const char*)
inline constexpr std::uint64_t TextEnd = 0xCD015E5BB0D96A57ULL; // void(float,float,int)
inline constexpr std::uint32_t BatiModel = 0xF9300CC5U;
}
