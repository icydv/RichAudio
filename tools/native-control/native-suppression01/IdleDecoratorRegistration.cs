using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using GTA;
using GTA.Native;

namespace RichAudio.NativeSuppression01
{
    internal interface IIdleDecoratorLock
    {
        void Validate();
        bool Locked { get; set; }
    }

    // Metadata and file validation run on the journal worker, before F5. This
    // does not read NativeMemory static fields or run its type initializer.
    internal sealed class IdleDecoratorLock : IIdleDecoratorLock
    {
        internal const string CoreName = "ScriptHookVDotNet, Version=3.9.0.6, Culture=neutral, PublicKeyToken=8564999cffc18483";
        internal const string CoreSha256 = "c702e54a7e806acb8bb21de807ff3747e6c24269ce71797aa81e21580d14a08e";
        readonly FieldInfo field;
        readonly ulong start, end;
        internal IdleDecoratorLock(FieldInfo field, ulong start, ulong end)
        { this.field = field; this.start = start; this.end = end; }

        internal static IdleDecoratorLock Capture(ProcessModule game)
        {
            Assembly core = null;
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
                if (assembly.FullName == CoreName)
                {
                    if (core != null) throw new InvalidOperationException("ambiguous loaded decorator core");
                    core = assembly;
                }
            if (core == null || !String.Equals(Path.GetFullPath(core.Location),
                Path.Combine(Path.GetDirectoryName(game.FileName), "ScriptHookVDotNet.asi"), StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("reviewed decorator core is not loaded from the game root");
            using (var stream = new FileStream(core.Location, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var sha = SHA256.Create())
                if (BitConverter.ToString(sha.ComputeHash(stream)).Replace("-", "").ToLowerInvariant() != CoreSha256)
                    throw new InvalidOperationException("decorator core identity differs");
            Type memory = core.GetType("SHVDN.NativeMemory", false);
            FieldInfo field = memory == null ? null : memory.GetField("s_isDecoratorLocked", BindingFlags.NonPublic | BindingFlags.Static);
            ValidateField(field);
            ulong start, end;
            ReadDataRange(game.FileName, unchecked((ulong)game.BaseAddress.ToInt64()), game.ModuleMemorySize, out start, out end);
            return new IdleDecoratorLock(field, start, end);
        }

        static void ValidateField(FieldInfo field)
        {
            if (field == null || !field.IsPrivate || !field.IsStatic || field.FieldType != typeof(byte).MakePointerType())
                throw new InvalidOperationException("reviewed decorator pointer metadata unavailable");
        }

        internal static void ReadDataRange(string path, ulong imageBase, int mappedBytes, out ulong start, out ulong end)
        {
            start = end = 0;
            using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read))
            using (var reader = new BinaryReader(stream))
            {
                if (reader.ReadUInt16() != 0x5a4d || stream.Length < 64) throw new InvalidOperationException("invalid game PE");
                stream.Position = 0x3c; int pe = reader.ReadInt32();
                if (pe < 64 || pe > stream.Length - 24) throw new InvalidOperationException("invalid game PE header");
                stream.Position = pe;
                if (reader.ReadUInt32() != 0x4550 || reader.ReadUInt16() != 0x8664) throw new InvalidOperationException("x64 game PE required");
                int sections = reader.ReadUInt16(); stream.Position = pe + 20; int optional = reader.ReadUInt16();
                if (sections < 1 || sections > 96 || optional < 112 || pe + 24L + optional + sections * 40L > stream.Length)
                    throw new InvalidOperationException("invalid game section table");
                stream.Position = pe + 24;
                if (reader.ReadUInt16() != 0x20b) throw new InvalidOperationException("PE32+ game required");
                stream.Position = pe + 24 + 56; uint imageBytes = reader.ReadUInt32();
                if (mappedBytes <= 0 || imageBytes != (uint)mappedBytes) throw new InvalidOperationException("game image size differs");
                stream.Position = pe + 24 + optional;
                for (int i = 0; i < sections; i++)
                {
                    string name = Encoding.ASCII.GetString(reader.ReadBytes(8)).TrimEnd('\0');
                    uint size = reader.ReadUInt32(), rva = reader.ReadUInt32();
                    reader.ReadBytes(20); uint flags = reader.ReadUInt32();
                    if (name != ".data") continue;
                    if (start != 0 || size == 0 || rva >= imageBytes || (ulong)rva + size > imageBytes ||
                        (flags & 0xc0000000u) != 0xc0000000u || (flags & 0x20000000u) != 0)
                        throw new InvalidOperationException("expected writable game data section unavailable");
                    start = checked(imageBase + rva); end = checked(start + size);
                }
                if (start == 0 || end <= start) throw new InvalidOperationException("game data section unavailable");
            }
        }

        public unsafe void Validate()
        {
            ValidateField(field);
            // GetValue can trigger a type initializer. A fresh successful
            // NativeMemory initialization log MUST be admitted externally before
            // F5; reflection cannot prove that prerequisite. Never run it here.
            object boxed = field.GetValue(null);
            if (boxed == null) throw new InvalidOperationException("decorator pointer unavailable");
            ulong address = (ulong)Pointer.Unbox(boxed);
            if (address == 0 || address < start || address >= end)
                throw new InvalidOperationException("decorator pointer outside reviewed game data section");
            // No target byte is read or written here. Only the public SDK below
            // accesses the lock, after validating the existing pointer value.
        }
        public bool Locked { get { return DecoratorInterface.IsLocked; } set { DecoratorInterface.IsLocked = value; } }
    }

    internal static class IdleDecoratorRegistration
    {
        internal static void Ensure(string name, IIdleDecoratorLock binding, Action<string> log)
        {
            bool initial = Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, name, 3);
            if (initial) { log("decorator initialInt=true finalInt=true lockUntouched=true"); return; }
            foreach (int type in new[] { 1, 2, 4, 5 })
                if (Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, name, type))
                    throw new InvalidOperationException("ownership decorator name conflicts with type=" + type);
            if (binding == null) throw new InvalidOperationException("reviewed decorator lock binding unavailable");
            binding.Validate();
            bool prior = binding.Locked, final = false, restored = false;
            try
            {
                try
                {
                    if (prior) binding.Locked = false;
                    if (binding.Locked) throw new InvalidOperationException("decorator unlock failed");
                    Function.Call(Hash.DECOR_REGISTER, name, 3);
                    final = Function.Call<bool>(Hash.DECOR_IS_REGISTERED_AS_TYPE, name, 3);
                }
                finally
                {
                    binding.Locked = prior;
                    restored = binding.Locked == prior;
                    if (!restored) throw new InvalidOperationException("decorator prior lock restoration failed");
                }
                if (!final) throw new InvalidOperationException("ownership decorator registration unavailable; no spawn permitted");
            }
            finally
            {
                // Queue only after the restoration attempt. A failed restore can
                // leave the lock unlocked; report false without claiming recovery.
                log("decorator initialInt=false finalInt=" + final + " priorLocked=" + prior + " lockRestored=" + restored);
            }
        }
    }
}
