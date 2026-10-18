using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using RefrainTrainer;

static class NativeChecks
{
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr VirtualAlloc(IntPtr address, UIntPtr size, uint allocation, uint protection);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool VirtualProtect(IntPtr address, UIntPtr size, uint protection, out uint previous);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern UIntPtr VirtualQueryEx(IntPtr process, IntPtr address, byte[] info, UIntPtr length);
    static readonly byte[] Original = { 0x55, 0x8B, 0xEC, 0x56, 0x6A, 0 };
    static readonly byte[][] Originals = { PatchCode.HitOriginal, PatchCode.LootOriginal, PatchCode.RarityOriginal, PatchCode.CrestOriginal };
    static int checks;

    static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
        checks++;
    }

    static void SetField(object target, string name, object value)
    {
        target.GetType().GetField(name, BindingFlags.NonPublic | BindingFlags.Instance).SetValue(target, value);
    }

    static byte[] Read(IntPtr handle, uint address, int length)
    {
        byte[] data = new byte[length];
        UIntPtr count;
        Check(Native.ReadProcessMemory(handle, Native.Pointer(address), data, (UIntPtr)length, out count), "Read fixture memory");
        Check(count.ToUInt64() == (uint)length, "Complete fixture read");
        return data;
    }

    static void Protection(IntPtr handle, uint address)
    {
        byte[] info = new byte[28];
        Check(VirtualQueryEx(handle, Native.Pointer(address), info, (UIntPtr)info.Length) != UIntPtr.Zero, "Query protection");
        Check(BitConverter.ToUInt32(info, 20) == 0x20, "Original RX protection restored");
    }

    [STAThread]
    static int Main(string[] args)
    {
        if (args.Length == 2 && args[0] == "--fixture")
        {
            IntPtr memory = VirtualAlloc(IntPtr.Zero, (UIntPtr)4096, 0x3000, 0x04);
            for (int i = 0; i < Originals.Length; i++) Marshal.Copy(Originals[i], 0, IntPtr.Add(memory, i * 16), Originals[i].Length);
            uint previous;
            if (!VirtualProtect(memory, (UIntPtr)4096, 0x20, out previous)) return 2;
            File.WriteAllText(args[1], memory.ToInt32().ToString("X8"));
            Thread.Sleep(Timeout.Infinite);
            return 0;
        }
        Process[] games = Process.GetProcessesByName("refrain");
        foreach (Process game in games) game.Dispose();
        if (games.Length != 0)
        {
            Console.Error.WriteLine("Close the game before running native checks; no game process was opened.");
            return 2;
        }
        string work = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
        string marker = Path.Combine(work, "native-fixture-" + Guid.NewGuid().ToString("N") + ".txt");
        Process child = null;
        Trainer trainer = new Trainer();
        IntPtr processHandle = IntPtr.Zero;
        try
        {
            child = Process.Start(new ProcessStartInfo(Assembly.GetExecutingAssembly().Location, "--fixture \"" + marker + "\"")
            {
                UseShellExecute = false, CreateNoWindow = true, WindowStyle = ProcessWindowStyle.Hidden
            });
            for (int i = 0; i < 100 && !File.Exists(marker); i++) Thread.Sleep(50);
            Check(File.Exists(marker), "Fixture startup");
            uint address = UInt32.Parse(File.ReadAllText(marker), System.Globalization.NumberStyles.HexNumber);
            processHandle = Native.OpenProcess(0x438 | 0x800, false, child.Id);
            Check(processHandle != IntPtr.Zero, "Open owned fixture process");
            SetField(trainer, "process", Process.GetProcessById(child.Id));
            SetField(trainer, "handle", processHandle);
            var patches = Enumerable.Range(0, Originals.Length).Select(i => new GamePatch("fixture", address + (uint)i * 16, (byte[])Originals[i].Clone(),
                Enumerable.Repeat((byte)0x90, Originals[i].Length).ToArray())).ToArray();
            typeof(Trainer).GetProperty("Patches").SetValue(trainer, patches, null);
            for (int round = 0; round < 10; round++)
            {
                for (int i = 0; i < patches.Length; i++)
                {
                    trainer.Set(i, true);
                    Check(Read(processHandle, patches[i].Address, patches[i].Original.Length).SequenceEqual(patches[i].EnabledBytes), "Enable bytes");
                    Check(patches[i].Enabled, "Enable state");
                    Protection(processHandle, patches[i].Address);
                    trainer.Set(i, true);
                }
                trainer.DisableAll();
                foreach (GamePatch patch in patches)
                {
                    Check(Read(processHandle, patch.Address, patch.Original.Length).SequenceEqual(patch.Original), "Restore bytes");
                    Check(!patch.Enabled, "Restore state");
                    Protection(processHandle, patch.Address);
                }
            }
            patches[0].Original[0] = 0xCC;
            bool refused = false;
            try { trainer.Set(0, true); }
            catch (InvalidOperationException) { refused = true; }
            patches[0].Original[0] = 0x55;
            Check(refused && !patches[0].Enabled, "Reject unexpected bytes");
            Check(Read(processHandle, address, 6).SequenceEqual(Original), "Rejection preserves bytes");
            trainer.Dispose();
            processHandle = IntPtr.Zero;
            Check(!trainer.Connected, "Dispose closes connection");
            child.Kill(); child.WaitForExit(5000);
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            using (var form = new TrainerWindow())
            {
                form.StartPosition = FormStartPosition.Manual;
                form.Location = new Point(-30000, -30000);
                form.ShowInTaskbar = false;
                form.Opacity = 0;
                form.Show();
                Application.DoEvents();
                form.PerformLayout();
                using (var bitmap = new Bitmap(form.Width, form.Height))
                {
                    form.DrawToBitmap(bitmap, new Rectangle(Point.Empty, form.Size));
                    bitmap.Save(Path.Combine(work, "trainer-preview.png"));
                }
                var options = (CheckBox[])typeof(TrainerWindow).GetField("options", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(form);
                Check(options.All(x => !x.Checked && !x.Enabled), "Options disabled before connection");
                var connect = (Button)typeof(TrainerWindow).GetField("connect", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(form);
                connect.PerformClick();
                var status = (TextBox)typeof(TrainerWindow).GetField("status", BindingFlags.NonPublic | BindingFlags.Instance).GetValue(form);
                Check(status.Text.Contains("未找到游戏"), "Missing game has actionable message");
                Check(options.All(x => !x.Checked && !x.Enabled), "Failed connection keeps options off");
                form.Close();
            }
            File.WriteAllText(Path.Combine(work, "native-test-report.txt"), "PASS: " + checks + " assertions; 40 enables and 40 disables on an owned x86 fixture; memory readback, protection restoration, context reads, mismatch rejection, disconnected UI. No game process was modified.");
            Console.WriteLine(File.ReadAllText(Path.Combine(work, "native-test-report.txt")));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
        finally
        {
            if (child != null)
            {
                if (!child.HasExited) { child.Kill(); child.WaitForExit(5000); }
                child.Dispose();
            }
            try { trainer.Dispose(); } catch { if (processHandle != IntPtr.Zero) Native.CloseHandle(processHandle); }
            if (File.Exists(marker)) File.Delete(marker);
        }
    }
}
