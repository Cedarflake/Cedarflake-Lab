using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace RefrainTrainer
{
    internal static class Native
    {
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool ReadProcessMemory(IntPtr process, IntPtr address, byte[] data, UIntPtr size, out UIntPtr read);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool WriteProcessMemory(IntPtr process, IntPtr address, byte[] data, UIntPtr size, out UIntPtr written);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool VirtualProtectEx(IntPtr process, IntPtr address, UIntPtr size, uint protection, out uint previous);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr VirtualAllocEx(IntPtr process, IntPtr address, UIntPtr size, uint allocation, uint protection);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool VirtualFreeEx(IntPtr process, IntPtr address, UIntPtr size, uint freeType);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool FlushInstructionCache(IntPtr process, IntPtr address, UIntPtr size);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern IntPtr OpenThread(uint access, bool inherit, uint threadId);
        [DllImport("kernel32.dll", SetLastError = true)] internal static extern bool GetThreadContext(IntPtr thread, byte[] context);
        [DllImport("ntdll.dll")] internal static extern int NtSuspendProcess(IntPtr process);
        [DllImport("ntdll.dll")] internal static extern int NtResumeProcess(IntPtr process);

        internal static IntPtr Pointer(uint address) { return new IntPtr(unchecked((int)address)); }
        internal static Exception Error(string action) { return new Win32Exception(Marshal.GetLastWin32Error(), action); }
    }

    public sealed class GamePatch
    {
        public readonly string Name;
        public readonly uint Address;
        public readonly byte[] Original;
        public readonly byte[] EnabledBytes;
        public bool Enabled { get; internal set; }
        public bool RequiresRestart { get; internal set; }
        public GamePatch(string name, uint address, byte[] original, byte[] enabled)
        {
            Name = name; Address = address; Original = original; EnabledBytes = enabled;
        }
    }

    public sealed class Trainer : IDisposable
    {
        Process process;
        IntPtr handle;
        IntPtr allocation;
        bool payloadExposed;
        public string GameDirectory { get; private set; }
        public int ProcessId { get { return process == null ? 0 : process.Id; } }
        public GamePatch[] Patches { get; private set; }
        public bool Connected { get { return handle != IntPtr.Zero && process != null && !process.HasExited; } }
        public uint BonusCount { get { return BitConverter.ToUInt32(Read(unchecked((uint)allocation.ToInt32()) + 0xF000, 4), 0); } }
        public uint HitCount { get { return BitConverter.ToUInt32(Read(unchecked((uint)allocation.ToInt32()) + 0xF004, 4), 0); } }
        public uint CrestCount { get { return BitConverter.ToUInt32(Read(unchecked((uint)allocation.ToInt32()) + 0xF008, 4), 0); } }

        public static string Hash(string path)
        {
            using (var stream = File.OpenRead(path))
            using (var hash = SHA256.Create())
                return BitConverter.ToString(hash.ComputeHash(stream)).Replace("-", "");
        }

        public void Connect()
        {
            if (Connected) return;
            Dispose();
            Process[] found = Process.GetProcessesByName("refrain");
            if (found.Length != 1)
            {
                foreach (var item in found) item.Dispose();
                throw new InvalidOperationException(found.Length == 0
                    ? "未找到游戏。请从 Steam 启动游戏，再点击“连接游戏”。"
                    : "检测到多个 refrain.exe。请只保留一个游戏窗口后重试。");
            }
            process = found[0];
            try
            {
                string exe = process.MainModule.FileName;
                if (Hash(exe) != PatchCode.GameSha256)
                    throw new InvalidOperationException("游戏主程序与已适配版本不同，未写入任何修改。此版本支持 Steam 版本号 3256141 的原始主程序。");
                GameDirectory = Path.GetDirectoryName(exe);
                uint gameBase = unchecked((uint)process.MainModule.BaseAddress.ToInt32());
                handle = Native.OpenProcess(0x438 | 0x800, false, process.Id);
                if (handle == IntPtr.Zero) throw Native.Error("无法连接游戏。请让游戏与修改器使用相同的运行权限。");
                Expect(gameBase + PatchCode.HitOffset, PatchCode.HitOriginal);
                Expect(gameBase + PatchCode.LootOffset, PatchCode.LootOriginal);
                Expect(gameBase + PatchCode.RarityOffset, PatchCode.RarityOriginal);
                Expect(gameBase + PatchCode.CrestOffset, PatchCode.CrestOriginal);
                EquipmentCatalog catalog = EquipmentCatalog.Read(GameDirectory);
                allocation = Native.VirtualAllocEx(handle, IntPtr.Zero, (UIntPtr)0x10000, 0x3000, 0x04);
                if (allocation == IntPtr.Zero) throw Native.Error("无法分配修改器所需内存。");
                uint cave = unchecked((uint)allocation.ToInt32());
                byte[] data = catalog.Build(cave + 0x1000);
                if (data.Length > 0xE000) throw new InvalidDataException("装备表超出支持大小。");
                Write(cave, PatchCode.Hit(gameBase, cave));
                Write(cave + 0x400, PatchCode.Loot(gameBase, cave + 0x400, cave + 0x1000));
                Write(cave + 0x800, PatchCode.Crest(gameBase, cave + 0x800, cave + 0xF008));
                Write(cave + 0x1000, data);
                uint previous;
                if (!Native.VirtualProtectEx(handle, allocation, (UIntPtr)0x1000, 0x20, out previous))
                    throw Native.Error("无法准备修改器指令。");
                Patches = new[] {
                    new GamePatch("一击必杀", gameBase + PatchCode.HitOffset, PatchCode.HitOriginal, PatchCode.Redirect(gameBase + PatchCode.HitOffset, cave)),
                    new GamePatch("额外随机传说装备", gameBase + PatchCode.LootOffset, PatchCode.LootOriginal, PatchCode.Redirect(gameBase + PatchCode.LootOffset, cave + 0x400)),
                    new GamePatch("其他新装备也为传说", gameBase + PatchCode.RarityOffset, PatchCode.RarityOriginal, PatchCode.RarityEnabled),
                    new GamePatch("魔女大纹章必掉", gameBase + PatchCode.CrestOffset, PatchCode.CrestOriginal, PatchCode.Redirect(gameBase + PatchCode.CrestOffset, cave + 0x800, PatchCode.CrestOriginal.Length))
                };
            }
            catch { Dispose(); throw; }
        }

        byte[] Read(uint address, int length)
        {
            byte[] result = new byte[length];
            UIntPtr count;
            if (!Native.ReadProcessMemory(handle, Native.Pointer(address), result, (UIntPtr)length, out count) || count.ToUInt64() != (ulong)length)
                throw Native.Error("无法读取游戏内存。");
            return result;
        }

        void Expect(uint address, byte[] expected)
        {
            if (!Read(address, expected.Length).SequenceEqual(expected))
                throw new InvalidOperationException("目标位置已被其他修改器更改，或游戏版本不匹配。请关闭其他修改器，重启游戏后再连接。");
        }

        void Write(uint address, byte[] bytes)
        {
            UIntPtr count;
            uint previous;
            IntPtr pointer = Native.Pointer(address);
            if (!Native.VirtualProtectEx(handle, pointer, (UIntPtr)bytes.Length, 0x40, out previous))
                throw Native.Error("无法临时更改目标内存权限。");
            try
            {
                if (!Native.WriteProcessMemory(handle, pointer, bytes, (UIntPtr)bytes.Length, out count) || count.ToUInt64() != (ulong)bytes.Length)
                    throw Native.Error("写入未完成。");
                if (!Native.FlushInstructionCache(handle, pointer, (UIntPtr)bytes.Length))
                    throw Native.Error("无法刷新游戏指令缓存。");
                if (!Read(address, bytes.Length).SequenceEqual(bytes))
                    throw new InvalidOperationException("写入后的校验未通过。");
            }
            finally
            {
                uint ignored;
                if (!Native.VirtualProtectEx(handle, pointer, (UIntPtr)bytes.Length, previous, out ignored))
                    throw Native.Error("无法恢复目标内存权限。请退出游戏后重新启动。");
            }
        }

        void CheckInstructionPointers(GamePatch patch)
        {
            process.Refresh();
            foreach (ProcessThread thread in process.Threads)
            {
                IntPtr threadHandle = Native.OpenThread(0x48, false, (uint)thread.Id);
                if (threadHandle == IntPtr.Zero) throw Native.Error("无法检查游戏线程，未切换开关。");
                try
                {
                    byte[] context = new byte[716];
                    Array.Copy(BitConverter.GetBytes(0x10001), context, 4);
                    if (!Native.GetThreadContext(threadHandle, context)) throw Native.Error("无法检查游戏指令位置，未切换开关。");
                    uint ip = BitConverter.ToUInt32(context, 184);
                    if (ip > patch.Address && ip < patch.Address + patch.Original.Length)
                        throw new InvalidOperationException("游戏正执行相关操作。请在菜单或战斗指令界面重试。");
                }
                finally { Native.CloseHandle(threadHandle); }
            }
        }

        public void Set(int index, bool enabled)
        {
            if (!Connected) throw new InvalidOperationException("游戏已退出，请重新启动并连接。");
            GamePatch patch = Patches[index];
            if (patch.RequiresRestart)
                throw new InvalidOperationException("上次写入未能完整恢复，请退出游戏后重新启动。");
            if (patch.Enabled == enabled) return;
            byte[] oldBytes = patch.Enabled ? patch.EnabledBytes : patch.Original;
            byte[] newBytes = enabled ? patch.EnabledBytes : patch.Original;
            if (Native.NtSuspendProcess(handle) < 0)
                throw new InvalidOperationException("无法暂停游戏线程以切换修改，未写入修改。");
            try
            {
                Expect(patch.Address, oldBytes);
                CheckInstructionPointers(patch);
                if (enabled) payloadExposed = true;
                try { Write(patch.Address, newBytes); }
                catch (Exception writeError)
                {
                    try { Write(patch.Address, oldBytes); }
                    catch (Exception restoreError)
                    {
                        patch.RequiresRestart = true;
                        throw new InvalidOperationException("修改未能完整恢复，请退出游戏后重新启动。\r\n" + writeError.Message + "\r\n" + restoreError.Message);
                    }
                    throw;
                }
                patch.Enabled = enabled;
            }
            finally
            {
                if (Native.NtResumeProcess(handle) < 0 && Native.NtResumeProcess(handle) < 0)
                    throw new InvalidOperationException("修改后无法恢复游戏线程运行，请退出游戏后重新启动。");
            }
        }

        public void DisableAll()
        {
            if (!Connected) return;
            var failures = new List<string>();
            for (int i = 0; i < Patches.Length; i++)
            {
                try { Set(i, false); }
                catch (Exception error) { failures.Add(Patches[i].Name + "：" + error.Message); }
            }
            if (failures.Count > 0) throw new InvalidOperationException(String.Join(Environment.NewLine, failures));
        }

        public void Dispose()
        {
            if (handle != IntPtr.Zero)
            {
                if (Patches != null && Patches.Any(x => x.Enabled || x.RequiresRestart) && Connected)
                    throw new InvalidOperationException("仍有修改处于启用状态，请先全部停用。");
                // Retain exposed code until process exit: a suspended call stack may still return into it.
                if (allocation != IntPtr.Zero && !payloadExposed)
                    Native.VirtualFreeEx(handle, allocation, UIntPtr.Zero, 0x8000);
                Native.CloseHandle(handle);
            }
            if (process != null) process.Dispose();
            process = null; handle = IntPtr.Zero; allocation = IntPtr.Zero; Patches = null;
            payloadExposed = false;
        }
    }
}
