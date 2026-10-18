# 鲁弗兰迷宫修改器

适用于 Steam 版 **Labyrinth of Refrain: Coven of Dusk** 的中文 Windows 修改器，提供一击必杀、魔女大纹章固定掉落和传说装备选项。

当前状态：**已归档，中文 v2 测试版**。这是按一次具体需求制作的工具，本仓库保留源码、使用说明和构建方式，不计划持续维护或适配后续游戏版本。已完成一次真实贝可罗尼亚大王战斗和掉落验证；保存后重新读档、装备详情逐项核对及结算耗时对比未完成。详见 [验证说明](./docs/validation.md)。

这是独立的 C#/.NET Framework 工具，不属于 pnpm workspace。仓库归档保存源码和构建脚本；生成的 EXE、ZIP、测试报告、游戏数据和玩家存档不纳入 Git。

## 使用条件

- Windows 10/11，已启用 .NET Framework 4.x。
- Steam App `566540`，Build `3256141`，32 位原始 `refrain.exe`。
- 游戏主程序 SHA-256：`FC0F248BDC42BCFAF9C8D679F99A707FA8D20DC570F2B16203F1403EC9B58087`。
- 游戏与修改器使用相同的运行权限。

运行修改器无需安装 Cheat Engine、Python 或 Node.js。游戏可以安装在任意盘符和目录；连接时从运行中的游戏进程取得路径，读取该目录的装备表。主程序、原始指令或装备表不匹配时会拒绝启用。

## 快速使用

1. 从 Steam 启动游戏并读入存档。
2. 运行 `RefrainTrainer.exe`，点击“连接游戏”。四个开关默认关闭。
3. 刷魔女大纹章时开启“一击必杀”和“魔女大纹章必掉”，其余两个开关保持关闭。
4. 击败贝可罗尼亚大王（King Pecoronia），在战斗结算中领取饰品。
5. 在菜单或战斗指令界面切换功能；不需要修改或准备读档时点击“全部停用”。

| 功能               | 效果                                                                                      |
| ------------------ | ----------------------------------------------------------------------------------------- |
| 一击必杀           | 敌人受到实际伤害、生命值减少时归零；出生、治疗、零伤害及未命中保留原规则。                |
| 魔女大纹章必掉     | 每名被击败的贝可罗尼亚大王固定生成 1 件已鉴定的传说魔女大纹章，复用游戏原有固定掉落流程。 |
| 额外随机传说装备   | 每名被击败的敌人额外生成 1 件当前区域的随机传说装备，同时保留原掉落；会增加结算装备数量。 |
| 其他新装备也为传说 | 经过装备生成函数的新装备使用传说稀有度；不会主动修改背包里已有装备。                      |

传说（Legendary）是最高稀有度，前缀和具体属性仍由游戏随机生成。两个掉落功能自行生成的装备已使用传说稀有度，不依赖“其他新装备也为传说”。额外随机装备覆盖 56 个区域，无法识别的特殊区域使用传说破旧剑（Worn Sword）作为备用底材。

程序只修改运行中的游戏内存，不替换游戏 EXE，也不直接编辑存档。关闭窗口会尝试恢复原指令；已经获得的装备由游戏负责保存。强制结束修改器后，修改可能仍留在游戏进程中；重启游戏可清除。如果提示“未能完整恢复”，先退出游戏，再关闭修改器。

## 构建和打包

构建使用 Windows 自带的 `%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe`，无需 Visual Studio 或 NuGet 依赖。打包另需 Windows PowerShell 5.1 或 PowerShell 7，以及 .NET 的 ZIP 支持。

在本项目目录执行：

```powershell
.\source\build.cmd
.\check.cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\package.ps1
```

`build.cmd` 生成 `dist/RefrainTrainer.exe`，编译警告按错误处理。`check.cmd` 重新编译并运行独立进程检查；测试前退出游戏，检查程序发现游戏运行时会拒绝继续。

`package.ps1` 重新构建，通过明确的文件清单打包源码、说明和 EXE，并回读 ZIP，核对全部文件的 SHA-256。产物为：

- `dist/RefrainTrainer-Steam-3256141-zh-CN-v2.zip`
- `dist/RefrainTrainer-Steam-3256141-zh-CN-v2.zip.sha256`

压缩包可直接转发，解压后运行根目录的 `RefrainTrainer.exe`。包内源码仍可按上述步骤重新构建，构建结果写入 `dist/`。

尚未建立公开 Release 或安装渠道。归档项目的 Windows CI 仅支持手动触发，用于按需重现构建、检查和打包，并上传该次运行的 artifact；不在提交或拉取请求时自动运行，不创建版本标签或 GitHub Release。

## 验证命令

无需游戏文件的检查：

```powershell
.\check.cmd
```

结果写入 `test-output/native-test-report.txt` 和 `test-output/trainer-preview.png`。测试只向自己创建的 x86 子进程写入测试指令，并检查开关、恢复和未连接窗口状态。

可选的完整指令模拟需要本地合法安装的匹配版本游戏，以及 [uv](https://docs.astral.sh/uv/) 管理的 Python 3.12、`pefile==2024.8.26`、`unicorn==2.1.4`。它只读安装文件，不连接游戏：

```powershell
$gameDirectory = 'D:\SteamLibrary\steamapps\common\Labyrinth of Refrain Coven of Dusk'
$trainerExe = Join-Path $PWD 'dist\RefrainTrainer.exe'
$fixturesDirectory = Join-Path $PWD 'test-output\fixtures'
$exportArguments = '--export-fixtures "{0}" "{1}"' -f $gameDirectory, $fixturesDirectory
$exportProcess = Start-Process -FilePath $trainerExe -ArgumentList $exportArguments -WindowStyle Hidden -Wait -PassThru
if ($exportProcess.ExitCode -ne 0) { throw 'Fixture export failed.' }
uv run --no-project --python 3.12 --with pefile==2024.8.26 --with unicorn==2.1.4 python .\source\tests\test_patches.py --game-exe "$gameDirectory\refrain.exe" --fixtures $fixturesDirectory --report .\test-output\patch-test-report.json
```

首次运行 uv 可能需要网络下载 Python 和依赖。完整模拟不在公共 CI 中执行，因为它需要未随仓库分发的游戏程序和数据。

## 许可证与归属

本项目目前 **未授予复用许可证（UNLICENSED）**，不继承仓库其他目录的许可证。游戏名称及游戏内容归各自权利人所有，本项目是非官方工具；仓库和分发包均不包含游戏程序、装备数据表或玩家存档。
