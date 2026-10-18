using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;

namespace RefrainTrainer
{
    public sealed class X86Code
    {
        readonly uint origin;
        readonly List<byte> bytes = new List<byte>();
        readonly Dictionary<string, int> labels = new Dictionary<string, int>();
        readonly List<Tuple<int, string>> fixups = new List<Tuple<int, string>>();

        public X86Code(uint address) { origin = address; }
        public void Emit(params byte[] values) { bytes.AddRange(values); }
        public void Dword(uint value) { Emit(BitConverter.GetBytes(value)); }
        public void Label(string name) { labels.Add(name, bytes.Count); }
        public void Branch(byte condition, string label)
        {
            Emit(0x0F, condition);
            fixups.Add(Tuple.Create(bytes.Count, label));
            Dword(0);
        }
        public void Jump(string label)
        {
            Emit(0xE9);
            fixups.Add(Tuple.Create(bytes.Count, label));
            Dword(0);
        }
        public void Relative(byte opcode, uint target)
        {
            Emit(opcode);
            Dword(unchecked(target - (origin + (uint)bytes.Count + 4)));
        }
        public byte[] Finish()
        {
            byte[] result = bytes.ToArray();
            foreach (var fix in fixups)
                Array.Copy(BitConverter.GetBytes(labels[fix.Item2] - fix.Item1 - 4), 0, result, fix.Item1, 4);
            return result;
        }
    }

    public sealed class EquipmentCatalog
    {
        public readonly SortedDictionary<int, List<Tuple<int, int>>> Areas = new SortedDictionary<int, List<Tuple<int, int>>>();

        public static EquipmentCatalog Read(string gameDirectory)
        {
            string folder = Path.Combine(gameDirectory, @"Media\D3D11\Majo");
            string file = new[] { "csv_en", "csv", "csv_fr" }
                .Select(x => Path.Combine(folder, x, @"item\drop_table_high.lse"))
                .FirstOrDefault(File.Exists);
            if (file == null) throw new InvalidDataException("找不到游戏的装备掉落表。请在 Steam 验证游戏文件后重试。");
            string equipmentFile = Path.Combine(Path.GetDirectoryName(file), "equip_table.lse");
            var validItems = new HashSet<int>(DecodeTable(equipmentFile).Split('\n')
                .Select(line => Regex.Match(line, @"^(\d+),"))
                .Where(match => match.Success)
                .Select(match => Int32.Parse(match.Groups[1].Value)));
            if (!validItems.Contains(200001) || !validItems.Contains((int)PatchCode.CrestItem)) throw new InvalidDataException("无法识别游戏装备表，未启用修改。");
            var catalog = new EquipmentCatalog();
            foreach (string line in DecodeTable(file).Split('\n'))
            {
                if (!Regex.IsMatch(line.TrimEnd('\r'), @"^\d+,\d+,\d+,\d+,\d+$")) continue;
                int[] columns = line.TrimEnd('\r').Split(',').Select(Int32.Parse).ToArray();
                int area = columns[0], rank = columns[1], item = columns[2];
                if (area < 1000 || area > 9999 || item / 100000 != 2) continue;
                if (!validItems.Contains(item)) throw new InvalidDataException("掉落表包含无法识别的装备，未启用修改。");
                if (rank < 0 || rank > 10000) throw new InvalidDataException("装备等级超出支持范围。");
                List<Tuple<int, int>> entries;
                if (!catalog.Areas.TryGetValue(area, out entries))
                    catalog.Areas.Add(area, entries = new List<Tuple<int, int>>());
                entries.Add(Tuple.Create(rank, item));
            }
            if (catalog.Areas.Count < 20 || catalog.Areas.Count > 200)
                throw new InvalidDataException("无法识别当前掉落表，未启用修改。");
            foreach (int area in catalog.Areas.Keys.ToArray())
                catalog.Areas[area] = catalog.Areas[area].OrderBy(x => x.Item1).ThenBy(x => x.Item2).ToList();
            return catalog;
        }

        static string DecodeTable(string file)
        {
            byte[] data = File.ReadAllBytes(file);
            if (data.Length > 4 * 1024 * 1024) throw new InvalidDataException("游戏数据表大小异常，未启用修改。");
            if (data.Length < 2) throw new InvalidDataException("游戏数据表为空，未启用修改。");
            byte key = data[data.Length - 1];
            for (int i = 0; i < data.Length - 1; i++) data[i] ^= (byte)((i + key) & 255);
            return Encoding.ASCII.GetString(data, 0, data.Length - 1);
        }

        public byte[] Build(uint address)
        {
            using (var stream = new MemoryStream())
            using (var writer = new BinaryWriter(stream))
            {
                writer.Write(Areas.Count);
                uint cursor = address + 4 + (uint)Areas.Count * 16;
                foreach (var pair in Areas)
                {
                    writer.Write(pair.Key);
                    writer.Write(pair.Value.Count);
                    writer.Write(pair.Value[0].Item1);
                    writer.Write(cursor);
                    cursor += (uint)pair.Value.Count * 8;
                }
                foreach (var pair in Areas)
                    foreach (var entry in pair.Value)
                    {
                        writer.Write(entry.Item1);
                        writer.Write(entry.Item2);
                    }
                return stream.ToArray();
            }
        }
    }

    public static class PatchCode
    {
        public const string GameSha256 = "FC0F248BDC42BCFAF9C8D679F99A707FA8D20DC570F2B16203F1403EC9B58087";
        public const uint HitOffset = 0x51ED0;
        public const uint LootOffset = 0x21FE8F;
        public const uint RarityOffset = 0x8EC12;
        public const uint CrestOffset = 0x21FC15;
        public const uint CrestItem = 212035;
        public static readonly byte[] CrestOriginal = { 0x0F, 0x2F, 0x45, 0xC4, 0x0F, 0x83, 0x70, 0x02, 0x00, 0x00 };
        public static readonly byte[] HitOriginal = { 0x55, 0x8B, 0xEC, 0x56, 0x6A, 0x00 };
        public static readonly byte[] LootOriginal = { 0x83, 0xC7, 0x04, 0xFF, 0x4D, 0xE0 };
        public static readonly byte[] RarityOriginal = { 0x8B, 0x4D, 0x0C };
        public static readonly byte[] RarityEnabled = { 0x6A, 0x03, 0x59 };

        public static byte[] Redirect(uint source, uint destination, int length = 6)
        {
            var code = new X86Code(source);
            code.Relative(0xE9, destination);
            if (length < 5) throw new ArgumentOutOfRangeException("length");
            for (int i = 5; i < length; i++) code.Emit(0x90);
            return code.Finish();
        }

        public static byte[] Hit(uint gameBase, uint address)
        {
            var c = new X86Code(address);
            c.Emit(0x9C, 0x50);                         // Preserve flags and the scratch register.
            c.Emit(0x8B, 0x81, 0xF8, 0x00, 0x00, 0x00);
            c.Emit(0x85, 0xC0); c.Branch(0x8E, "original");
            c.Emit(0x39, 0x44, 0x24, 0x0C);             // Proposed HP versus current enemy HP.
            c.Branch(0x8D, "original");
            c.Emit(0xC7, 0x44, 0x24, 0x0C, 0, 0, 0, 0);
            c.Emit(0xFF, 0x05); c.Dword(address + 0xF004);
            c.Label("original");
            c.Emit(0x58, 0x9D);
            c.Emit(HitOriginal);
            c.Relative(0xE9, gameBase + HitOffset + 6);
            return c.Finish();
        }

        public static byte[] Crest(uint gameBase, uint address, uint counter)
        {
            var c = new X86Code(address);
            c.Emit(0x9C, 0x50, 0x8B, 0x07);
            c.Emit(0x83, 0xB8, 0xF8, 0, 0, 0, 0);
            c.Branch(0x8F, "original");
            c.Emit(0x81, 0x78, 0x5C); c.Dword(CrestItem);
            c.Branch(0x85, "original");
            c.Emit(0x58, 0x9D);
            c.Emit(0xC7, 0x45, 0xB0); c.Dword(CrestItem);
            c.Emit(0xC7, 0x45, 0xB4, 3, 0, 0, 0);
            c.Emit(0xC7, 0x45, 0xB8, 1, 0, 0, 0);
            c.Emit(0xFF, 0x05); c.Dword(counter);
            // Use the native fixed-drop path; no additional item generation is needed.
            c.Relative(0xE9, gameBase + 0x21FE59);
            c.Label("original");
            c.Emit(0x58, 0x9D, 0x0F, 0x2F, 0x45, 0xC4);
            c.Emit(0x0F); c.Relative(0x83, gameBase + LootOffset);
            c.Relative(0xE9, gameBase + CrestOffset + (uint)CrestOriginal.Length);
            return c.Finish();
        }

        public static byte[] Loot(uint gameBase, uint address, uint catalog)
        {
            var c = new X86Code(address);
            c.Emit(0x9C, 0x60, 0x8B, 0xDC);
            c.Emit(0x81, 0xEC, 0x20, 0x02, 0, 0, 0x83, 0xE4, 0xF0);
            c.Emit(0x0F, 0xAE, 0x04, 0x24);             // Preserve x87/SSE across game function calls.
            c.Emit(0x89, 0x9C, 0x24, 0x00, 0x02, 0, 0, 0x8B, 0xDC);
            c.Emit(0x83, 0xEC, 0x10);
            c.Emit(0x8B, 0x07, 0x83, 0xB8, 0xF8, 0, 0, 0, 0);
            c.Branch(0x8F, "done");                    // Surviving enemies receive no bonus loot.
            c.Emit(0x8B, 0x50, 0x6C);
            c.Emit(0x8B, 0x35); c.Dword(gameBase + 0x6BB3BC);
            c.Emit(0x85, 0xF6); c.Branch(0x84, "fallback");
            c.Emit(0x8B, 0xB6, 0x84, 0xDC, 0x01, 0x00);
            c.Emit(0x8B, 0x0D); c.Dword(catalog);
            c.Emit(0xBF); c.Dword(catalog + 4);
            c.Label("findArea");
            c.Emit(0x39, 0x37); c.Branch(0x84, "found");
            c.Emit(0x83, 0xC7, 0x10, 0x49); c.Branch(0x85, "findArea");
            c.Jump("fallback");
            c.Label("found");
            c.Emit(0x3B, 0x57, 0x08, 0x0F, 0x4C, 0x57, 0x08);
            c.Emit(0x8B, 0x4F, 0x04, 0x8B, 0x7F, 0x0C, 0x33, 0xF6);
            c.Label("count");
            c.Emit(0x3B, 0x14, 0xF7); c.Branch(0x8C, "choose");
            c.Emit(0x46, 0x3B, 0xF1); c.Branch(0x8C, "count");
            c.Label("choose");
            c.Emit(0x85, 0xF6); c.Branch(0x84, "fallback");
            c.Emit(0x4E, 0x56, 0x6A, 0x00, 0x8B, 0x0D); c.Dword(gameBase + 0x6BB348);
            c.Relative(0xE8, gameBase + 0x211180);
            c.Emit(0x8B, 0x74, 0xC7, 0x04);
            c.Jump("record");
            c.Label("fallback");
            c.Emit(0xBE); c.Dword(200001);               // Worn Sword is valid even outside normal dungeon tables.
            c.Label("record");
            c.Emit(0x89, 0x34, 0x24, 0xC7, 0x44, 0x24, 0x04, 3, 0, 0, 0);
            c.Emit(0xC7, 0x44, 0x24, 0x08, 1, 0, 0, 0);
            c.Emit(0x8B, 0x4D, 0xBC, 0x54);
            c.Relative(0xE8, gameBase + 0x22E610);
            c.Emit(0x6A, 1, 0x6A, 0xFF, 0x6A, 3, 0x56, 0x8B, 0x4D, 0xE4);
            c.Relative(0xE8, gameBase + 0x1045E0);
            c.Emit(0xFF, 0x05); c.Dword(catalog + 0xE000);
            c.Label("done");
            c.Emit(0x8B, 0xE3, 0x0F, 0xAE, 0x0C, 0x24);
            c.Emit(0x8B, 0xA4, 0x24, 0x00, 0x02, 0, 0, 0x61, 0x9D);
            c.Emit(LootOriginal);
            c.Relative(0xE9, gameBase + LootOffset + 6);
            return c.Finish();
        }
    }
}
