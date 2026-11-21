#pragma once
// Independently authored public SDK signatures; no vendor implementation.
// https://github.com/scripthookvdotnet/scripthookvdotnet/blob/3a0b4786ea8cff050fbccf7993a2cfedc8d4a64f/source/loader/sdk/inc/main.h
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <Windows.h>
#ifdef STREET_TRACKED_FIXTURE_01
#define STREET_IMPORT_01
#else
#define STREET_IMPORT_01 __declspec(dllimport)
#endif
STREET_IMPORT_01 void scriptRegister(HMODULE,void(*)());
STREET_IMPORT_01 void scriptUnregister(HMODULE);
STREET_IMPORT_01 void scriptWait(DWORD);
STREET_IMPORT_01 void nativeInit(UINT64);
STREET_IMPORT_01 void nativePush64(UINT64);
STREET_IMPORT_01 UINT64* nativeCall();
STREET_IMPORT_01 BYTE* getScriptHandleBaseAddress(int);
