using System;
using System.Drawing;
using System.IO;
using System.Linq;
using System.Threading;
using System.Windows.Forms;

namespace RefrainTrainer
{
    static class Program
    {
        [STAThread]
        static int Main(string[] args)
        {
            if (args.Length == 3 && args[0] == "--export-fixtures")
            {
                Directory.CreateDirectory(args[2]);
                var catalog = EquipmentCatalog.Read(args[1]);
                File.WriteAllBytes(Path.Combine(args[2], "hit.bin"), PatchCode.Hit(0x400000, 0x2000000));
                File.WriteAllBytes(Path.Combine(args[2], "loot.bin"), PatchCode.Loot(0x400000, 0x2000400, 0x2001000));
                File.WriteAllBytes(Path.Combine(args[2], "catalog.bin"), catalog.Build(0x2001000));
                File.WriteAllBytes(Path.Combine(args[2], "rarity.bin"), PatchCode.RarityEnabled);
                File.WriteAllBytes(Path.Combine(args[2], "crest.bin"), PatchCode.Crest(0x400000, 0x2000800, 0x200F008));
                File.WriteAllText(Path.Combine(args[2], "catalog-count.txt"), catalog.Areas.Count.ToString());
                return 0;
            }
            bool isNew;
            using (var mutex = new Mutex(true, "Local\\RefrainTrainer_3256141", out isNew))
            {
                if (!isNew)
                {
                    MessageBox.Show("修改器已经打开，请使用现有窗口。", "鲁弗兰迷宫修改器", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return 1;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new TrainerWindow());
            }
            return 0;
        }
    }

    public sealed class TrainerWindow : Form
    {
        readonly Trainer trainer = new Trainer();
        readonly CheckBox[] options = new CheckBox[4];
        readonly TextBox status = new TextBox();
        readonly Label counters = new Label();
        readonly Button connect = new Button();
        readonly Button disable = new Button();
        readonly System.Windows.Forms.Timer timer = new System.Windows.Forms.Timer();
        bool refreshing;

        public TrainerWindow()
        {
            Text = "鲁弗兰迷宫修改器 · Steam 版本 3256141 · 指定饰品测试版";
            Font = new Font("Microsoft YaHei UI", 10F);
            AutoScaleMode = AutoScaleMode.Dpi;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(740, 710);
            MinimumSize = new Size(756, 750);
            BackColor = SystemColors.Window;
            var layout = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 1, RowCount = 10, Padding = new Padding(24), AutoScroll = true };
            layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
            Controls.Add(layout);
            AddLabel(layout, "鲁弗兰迷宫修改器", 16, FontStyle.Bold);
            AddLabel(layout, "Steam 版本 3256141 · 指定掉落与随机装备独立开关", 10, FontStyle.Regular);

            var actions = new FlowLayoutPanel { AutoSize = true, Dock = DockStyle.Fill, WrapContents = true, Margin = new Padding(0, 12, 0, 14) };
            connect.Text = "连接游戏"; connect.AutoSize = true; connect.Padding = new Padding(10, 5, 10, 5);
            connect.Click += delegate { Perform(delegate { trainer.Connect(); SetStatus("已连接游戏（进程编号 " + trainer.ProcessId + "）。所有开关默认关闭，请在菜单或战斗指令界面切换。"); }); };
            disable.Text = "全部停用"; disable.AutoSize = true; disable.Padding = new Padding(10, 5, 10, 5);
            disable.Click += delegate { Perform(delegate { trainer.DisableAll(); SetStatus("全部修改已停用。已经获得的装备会保留；后续操作按原规则进行。"); }); };
            actions.Controls.Add(connect); actions.Controls.Add(disable); layout.Controls.Add(actions);

            AddOption(layout, 0, "一击必杀", "敌人受到实际伤害时，生命值降为 0。未命中、零伤害和特殊无敌机制仍按游戏规则处理。");
            AddOption(layout, 3, "魔女大纹章必掉", "击败贝可罗尼亚大王，固定掉落 1 件已鉴定的传说魔女大纹章。刷这件饰品时开启本项即可。");
            AddOption(layout, 1, "额外随机传说装备", "每名被击败的敌人额外生成 1 件区域随机装备，会增加战斗结算的装备数量。只刷大纹章时可关闭。");
            AddOption(layout, 2, "其他新装备也为传说", "原有掉落、宝箱等途径新生成的装备也使用传说品质；已有装备保持原样。");

            counters.AutoSize = true; counters.Margin = new Padding(0, 12, 0, 10);
            counters.Text = "本次连接：一击必杀 0 次 · 指定掉落 0 次 · 额外装备 0 件";
            layout.Controls.Add(counters);
            status.ReadOnly = true; status.Multiline = true; status.ScrollBars = ScrollBars.Vertical;
            status.Dock = DockStyle.Fill; status.MinimumSize = new Size(0, 95);
            status.BackColor = SystemColors.Control; status.BorderStyle = BorderStyle.FixedSingle;
            status.Text = "请从 Steam 启动游戏，再连接修改器。\r\n刷魔女大纹章时，建议只开启“一击必杀”和“魔女大纹章必掉”。\r\n保存游戏后，已获得的装备会留在存档中，建议先使用单独的存档槽。";
            layout.Controls.Add(status);
            AddLabel(layout, "关闭窗口会停用修改。强制结束修改器时，请重启游戏以清除修改。", 9, FontStyle.Regular);
            timer.Interval = 1000;
            timer.Tick += delegate
            {
                try
                {
                    if (trainer.Patches != null && !trainer.Connected)
                    {
                        trainer.Dispose();
                        SetStatus("游戏已退出，修改已随进程清除。重新启动游戏后可以再次连接。");
                    }
                    RefreshState();
                }
                catch (Exception error) { SetStatus(error.Message); }
            };
            timer.Start();
            FormClosing += OnClosing;
            RefreshState();
        }

        void AddLabel(TableLayoutPanel layout, string text, float size, FontStyle style)
        {
            layout.Controls.Add(new Label { Text = text, AutoSize = true, MaximumSize = new Size(690, 0), Font = new Font(Font.FontFamily, size, style), Margin = new Padding(0, 0, 0, 6) });
        }

        void AddOption(TableLayoutPanel layout, int index, string title, string description)
        {
            var panel = new TableLayoutPanel { AutoSize = true, ColumnCount = 1, Dock = DockStyle.Fill, Margin = new Padding(0, 6, 0, 12) };
            var check = new CheckBox { Text = title, AutoSize = true, Font = new Font(Font, FontStyle.Bold), Margin = new Padding(0, 0, 0, 5) };
            options[index] = check;
            check.CheckedChanged += delegate
            {
                if (refreshing) return;
                bool selected = check.Checked;
                Perform(delegate { trainer.Set(index, selected); SetStatus(title + (selected ? "已启用。" : "已停用。")); });
            };
            panel.Controls.Add(check);
            panel.Controls.Add(new Label { Text = description, AutoSize = true, MaximumSize = new Size(650, 0), Margin = new Padding(24, 0, 0, 0) });
            layout.Controls.Add(panel);
        }

        void SetStatus(string message) { status.Text = message; }
        void Perform(Action action)
        {
            try { action(); }
            catch (Exception error) { SetStatus(error.Message); }
            finally { RefreshState(); }
        }
        void RefreshState()
        {
            refreshing = true;
            try
            {
                bool connected = trainer.Connected;
                connect.Enabled = !connected; disable.Enabled = connected;
                for (int i = 0; i < options.Length; i++)
                {
                    bool uncertain = connected && trainer.Patches[i].RequiresRestart;
                    options[i].Enabled = connected && !uncertain;
                    options[i].CheckState = uncertain ? CheckState.Indeterminate
                        : connected && trainer.Patches[i].Enabled ? CheckState.Checked : CheckState.Unchecked;
                }
                if (connected) counters.Text = String.Format("本次连接：一击必杀 {0} 次 · 指定掉落 {1} 次 · 额外装备 {2} 件", trainer.HitCount, trainer.CrestCount, trainer.BonusCount);
                else counters.Text = "本次连接：一击必杀 0 次 · 指定掉落 0 次 · 额外装备 0 件";
            }
            catch (Exception error)
            {
                SetStatus("暂时无法更新连接状态，请重试。\r\n" + error.Message);
            }
            finally { refreshing = false; }
        }
        void OnClosing(object sender, FormClosingEventArgs e)
        {
            try { trainer.DisableAll(); trainer.Dispose(); timer.Stop(); timer.Dispose(); }
            catch (Exception error)
            {
                e.Cancel = true;
                SetStatus("还有修改未能停用，窗口暂时保留。请返回游戏菜单后点“全部停用”，或退出游戏。\r\n" + error.Message);
            }
        }
    }
}
