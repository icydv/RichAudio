#pragma once

// Independently authored declarations of the published Script Hook V ABI.
// Compatible declarations verified against the installed DLL's named exports.
// Source: scripthookvdotnet/scripthookvdotnet @
// 3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/sdk/inc/main.h
// The historical SDK is Alexander Blade's work; this is not a complete SDK.
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

static_assert(sizeof(void*) == 8, "The probe requires Windows x64.");
static_assert(sizeof(DWORD) == 4, "Script Hook V DWORD must be 32 bits.");
static_assert(sizeof(UINT64) == 8, "Script Hook V slots must be 64 bits.");
static_assert(sizeof(float) == 4, "Native float results occupy four bytes.");

__declspec(dllimport) void scriptRegister(HMODULE module, void (*entry)());
__declspec(dllimport) void scriptUnregister(HMODULE module);
__declspec(dllimport) void scriptWait(DWORD milliseconds);
__declspec(dllimport) void nativeInit(UINT64 hash);
__declspec(dllimport) void nativePush64(UINT64 value);
__declspec(dllimport) UINT64* nativeCall();

// Published SDK keyboard callback. Notifications are observed, never consumed.
using KeyboardHandler = void (*)(DWORD, WORD, BYTE, BOOL, BOOL, BOOL, BOOL);
__declspec(dllimport) void keyboardHandlerRegister(KeyboardHandler handler);
__declspec(dllimport) void keyboardHandlerUnregister(KeyboardHandler handler);
