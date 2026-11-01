#pragma once
// Independently authored published ABI declarations, corroborated against the
// installed pinned SHV export table. No SDK binary is redistributed.
// https://raw.githubusercontent.com/scripthookvdotnet/scripthookvdotnet/
// 3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/sdk/inc/main.h
#ifndef STRICT
#define STRICT 1
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <Windows.h>
__declspec(dllimport) void scriptRegister(HMODULE module, void (*entry)());
__declspec(dllimport) void scriptUnregister(HMODULE module);
__declspec(dllimport) void scriptWait(DWORD milliseconds);
__declspec(dllimport) void nativeInit(UINT64 hash);
__declspec(dllimport) void nativePush64(UINT64 value);
__declspec(dllimport) UINT64* nativeCall();
// Use the returned address solely as an opaque equality witness. No fields read.
__declspec(dllimport) BYTE* getScriptHandleBaseAddress(int handle);
