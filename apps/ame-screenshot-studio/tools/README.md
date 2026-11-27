# 资料集准备工具

新版只写入 Studio 下的 collections/<集合版本>，不会写入现有 library，也不会读取旧集合的图片字节。四个职责文件分别负责命令入口、官方请求与传输预算、图像/日期转换、存储/恢复。

## 首次准备与扩充

在仓库的 apps/ame-screenshot-studio 目录中执行：

~~~powershell
uv run --offline --script tools/prepare_library.py --collection 视觉收藏-v2 --seed library
~~~

旧 library/manifest.json 只提供候选 Met object ID 与来源引用。每个候选重新请求当前官方对象记录，确认该对象的 isPublicDomain=true 后重新下载 primaryImage；没有读取旧图片或以旧哈希代替官方字节。sources.json 格式的旧候选清单也可以作为 --seed 目录。

首轮结束并检查 status.json、issues.json 后，再执行：

~~~powershell
uv run --offline --script tools/prepare_library.py --collection 视觉收藏-v2 --seed library --expand
~~~

--offline 只约束 uv 获取 Python 依赖。工具本身会访问明确准入的 Met 官方 HTTPS API 和图片端点。

两条命令按顺序运行。OS 文件锁禁止同一版本同时准备，进程结束后锁自动释放；prepare.lock 文件可以保留，不需要删除。默认单流下载，请求起始间隔至少 0.5 秒，429/503 的 Retry-After 完整生效。403/401 将确切 URL 写入 denied-urls.json 并立即停止本轮；重启后同一 URL 在发请求前就会被拒绝，不换身份、不跟随重定向或绕过保护。

实际可导入目录：

~~~text
collections/视觉收藏-v2/images/
  山川风景/
  花卉植物/
  动物与鸟类/
  建筑街景/
  海滨与舟船/
  静物陈列/
  艺术收藏/
~~~

目录按用途命名。最终数量来自完成准入、完整解码和去重后的真实文件，不生成占位图片，也不复制文件凑数量。--limit 可用于明确限制一次准备范围，达到该限制标为 partial，不写虚假的完整状态。

## 从已保存的官方发现结果恢复

每页成功的官方搜索结果和请求收据都会立即保存到 discovery/<主题>-<offset>.json。后续某页被拒不会丢失先前页；只用已有页恢复：

~~~powershell
uv run --offline --script tools/prepare_library.py --collection 视觉收藏-v2 --cached-discovery --limit 150
~~~

--cached-discovery 不请求任何搜索页，会读取并去重已有页中的候选，跳过已经提交的记录。它仍逐项请求官方对象记录、核验授权并下载官方图片，不能把候选 ID 当作已经通过授权的素材。--limit 150 指本版本累计最多 150 张（包括现有图片），便于先检查恢复效果；后续按明确目标调整上限。不要与 --expand 同用。

搜索阶段遇到 401/403 会保留 discovery/access-pause.json，后续 --expand 在发出请求前停止。旧失败状态没有记录 URL 时，只保留原状态证据和未知 URL，不把推断填成官方证据；--cached-discovery 首次恢复时会保存这份暂停记录。已知拒绝 URL 同时保存在 denied-urls.json。工具不会自动清除拒绝记录；后续必须先确认来源确实恢复、审查该项限制，再决定是否恢复发现。

当前状态中的 candidate_scope=saved-discovery-pages 明确表示只处理本地已保存发现范围。没有缓存页会报错，不会伪称完成整个主题目录。

## 证据与完整性

每张图片都有 records/met-<id>.json 和 evidence/met-<id>.json：

- 当前官方对象记录及取回时间；
- 官方图像 URL、实际请求 URL、HTTP ETag/Last-Modified、原始响应字节哈希；
- 派生图像哈希、像素哈希、尺寸和字节数；
- 对原始字节仅作 EXIF 日期变更的派生关系；
- 固定 +08:00 时区的 captured/created/modified；
- 如果从旧清单提名，保留其候选引用并明确该引用不用于图片字节或授权核验。

所有 JPEG 必须完整解码；超过 40 百万像素、尺寸不足、损坏或截断的文件不发布。日期变更前后像素哈希必须一致。原始下载字节仅在内存读取，不覆盖任何原文件；EXIF 时间偏移同步更新，小数秒旧字段移除，EXIF GPS 清空。工具不宣称清除其他格式的全部元数据。

资料先写入版本内的 staging，设定日期、保存证据，再通过 pending 记录发布到 images。提交中断后依据 pending 恢复。启动时核对所有已登记文件和证据的实际哈希，遇到缺失、改动、重复或未登记图片会停止并明确报错，不盲目跳过或自动删除它们。

manifest.json 是已提交记录的导出索引；准备期间应参考 status.json，导入前等本次流程退出。ready 表示所选范围已处理且没有未解决失败；partial/stopped/failed 都保留具体原因。逐项失败保存在 issues.json；401/403 的 URL 另作持久拒绝记录，重启不会直接重试。

## 预算和停止

默认版本内文件预算 35 GiB、累计 HTTP 响应体预算 40 GiB，可显式更改：

~~~powershell
uv run --offline --script tools/prepare_library.py --collection 视觉收藏-v2 --seed library --max-disk-gib 35 --max-network-gib 40
~~~

磁盘预算包含版本内图片、记录、证据及临时副本；原子替换需要新旧文件短暂同时存在。它按实际文件字节计数，不包含文件系统分配簇、目录和 NTFS 元数据。每次写入前检查容量与至少 16 MiB 空闲余量。

网络预算在读取响应体前持久化预留，成功、重复、拒绝解码以及失败尝试消耗的响应体都计入。它约束读取的 HTTP 响应体，不包含 TCP/TLS/HTTP 头开销。中断前尚未退款的预留按已消耗保守保留，避免崩溃后预算重置。单图最大 32 MiB，API JSON 最大 4 MiB；压缩传输和重定向不会静默获准。

Ctrl+C 或创建该版本的 stop 文件会停止后续下载和提交：

~~~powershell
New-Item -ItemType File 'collections/视觉收藏-v2/stop'
~~~

网络连接/读取超时为 5 秒，等待退避时每 0.1 秒检查停止信号。启动恢复会先完整校验已提交文件。续跑前仅移除自己创建的 stop 信号文件，再执行原命令。当前实现是逐图片提交续跑；没有 HTTP Range 级部分文件续传，未完成的单张图片会重新下载并计入预算。

## 现有 90 张的处置

原 library 下的 90 张继续保留，可用于已在进行的截图采集质量验证。它们没有被新版重新核验、迁移、替换或升级来源记录；不能因运行新版工具就称这 90 张已经完成新的来源核验。

对外展示使用新版 collections/视觉收藏-v2 中逐项通过并记录的图片。若复制到隔离客端，普通 Copy-Item 不保证保留创建时间，应按 records 中 dates 给目标副本设置 captured/created/modified，并检查日期后再导入。只调整目标副本，不回写原始来源或旧 90 张。

## 离线验证

~~~powershell
uv run --offline --script tools/test_prepare_library.py
~~~

20 个小夹具覆盖截断 JPEG、日期和像素保留、逐项准入、旧 seed 仅提名、完整逐项流程、缺失/改动检测、中断提交恢复、未提交图片不发布、磁盘与网络预算、预算跨重启、403/重定向拒绝、完整 Retry-After、停止前不发请求、真实进程终止后的 OS 锁释放，以及不发搜索请求的缓存恢复、页收据一致性、逐页持久保存、403 跨重启不重试、旧拒绝状态保存和逐项拒绝后立即停止。

夹具只在 tools 内创建并清理临时目录，不访问真实网络，不触碰现有图片集合。
