#pragma once
#include <cstdint>
// Subset of unchanged, previously verified Enhanced native contracts:
// https://raw.githubusercontent.com/alloc8or/gta5-nativedb-data/
// 424fb51b089049a9fbcebcc641500b1d44d255b4/natives_gen9.json
// No new native hashes; the additional opaque-address interface is a SHV SDK export.
namespace HandoffNativeIds {
inline constexpr std::uint64_t IsLoading = 0x10D0A8F259E93EC9ULL;
inline constexpr std::uint64_t NetworkGame = 0x10FAB35428CCC9D7ULL;
inline constexpr std::uint64_t NetworkSession = 0x9DE624D2FC4B603FULL;
inline constexpr std::uint64_t PlayerSwitch = 0xD9D2CFFF49FAB35FULL;
inline constexpr std::uint64_t PlayerId = 0x4F8644AF03D0E0D6ULL;
inline constexpr std::uint64_t PlayerPlaying = 0x5E9564D8246B909AULL;
inline constexpr std::uint64_t PlayerPed = 0xD80958FC74E988A6ULL;
inline constexpr std::uint64_t EntityExists = 0x7239B21A38F536BAULL;
inline constexpr std::uint64_t EntityIsPed = 0x524AC5ECEA15343EULL;
inline constexpr std::uint64_t EntityIsVehicle = 0x6AC7003FA6E5575EULL;
inline constexpr std::uint64_t EntityDead = 0x5F9532F3B5CC2551ULL;
inline constexpr std::uint64_t PedVehicle = 0x9A9112A0FE9A4713ULL;
inline constexpr std::uint64_t EntityModel = 0x9F47B058362C84B5ULL;
inline constexpr std::uint64_t VehicleSeatPed = 0xBB40DD2270B65366ULL;
inline constexpr std::uint64_t EngineRunning = 0xAE31E7DF9B5B132EULL;
inline constexpr std::uint64_t CurrentRevRatio = 0xF9DDA40BC293A61EULL;
inline constexpr std::uint64_t EntitySpeed = 0xD5037BA82E12416FULL;
inline constexpr std::uint64_t PauseMenu = 0xB0034A223497FFCBULL;
inline constexpr std::uint32_t BatiModel = 0xF9300CC5U;
}
