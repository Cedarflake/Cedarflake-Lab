# Merge AV

使用 FFmpeg 合并视频和音频文件。

## 依赖

需要先安装 FFmpeg，并确保 `ffmpeg` 在 PATH 中。

## 运行

```powershell
python merge_av.py input.mp4 input.mp3 output.mp4
```

脚本也支持 `python merge_av.py --interactive` 交互模式，按提示输入路径即可。
