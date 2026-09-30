# 技术设计：本地视频转文字

## 架构

Electron 主进程运行媒体探测、FFmpeg、ASR 网络请求、队列、凭据存储和 Pi AI。React 渲染进程只使用 preload 暴露的类型化接口；开启上下文隔离和沙箱，不在渲染进程启用 Node 集成。单机单进程队列以 JSON 原子写入用户数据目录，凭据单独用 Windows 当前用户的 DPAPI 加密保存。

```text
React UI → preload API → Electron main → ffprobe/ffmpeg → PCM WAV 分片
                                  ↘ ASR adapter → timed segments → TXT/SRT/VTT
                                  ↘ Pi AI (用户显式调用) → formatted TXT
```

## 媒体管道

用 FFprobe JSON 探测流和时长。FFmpeg 仅映射用户选择的音轨，解码为 16 kHz、单声道、16-bit PCM WAV。按最长 9 分钟切片，并在后续切片起点包含 1 秒重叠；单片原始 PCM 约 17.3 MB，低于 Groq 免费层和 OpenAI Whisper 上传上限。按片段时间中点去除重叠区重复结果，再加切片起点换算为视频绝对时间。保留分段原文和时间信息，字幕从该结构生成。

临时文件放在 `userData/tmp/<job-id>`。正常完成、取消或失败后删除；启动时清理不属于运行中任务的历史临时目录。仅 PCM WAV 片段进入 ASR 请求，视频文件、路径和音轨元数据不进入网络请求。

## ASR 和模型

内部适配契约为 `transcribe(chunk, {model, language, signal}) -> {segments: {start,end,text}[]}`，时间单位为秒、相对当前片段。Groq 和 OpenAI 预置适配器使用 `/audio/transcriptions` 的 `verbose_json` 与 segment 时间戳；自定义兼容端点在首次转写时验证响应，若没有分段时间戳则任务失败并提示更换模型。适配器验证响应字段、时间范围和空结果。Groq 默认 `whisper-large-v3-turbo`，可选 `whisper-large-v3`；OpenAI 选 `whisper-1`。Pi AI 的聊天模型接口独立于 ASR。

长音频按片顺序处理以控制服务商限流。HTTP 429 按 `Retry-After` 退避；超时、网络失败和 5xx 最多重试三次；认证、无效模型和无效媒体错误直接失败。队列取消通过 `AbortController` 中止上传，并终止 FFmpeg 子进程。

## 队列、数据和输出

任务记录 ID、批次 ID、源路径、音轨索引、语言、ASR 配置 ID/模型、所选输出格式、状态、阶段、进度、已完成片数、错误和输出路径；不记录密钥或音频数据。启动时把中断的处理中任务恢复为待执行，有可用凭据时自动继续；恢复的任务从第一个切片重新转写，进度归零，已完成任务不重复请求。队列每次状态变化用临时文件加原子重命名落盘。导出仅对本次选定且可生成的文件使用临时文件、备份和回滚；同名冲突仅检查目标格式。

TXT 为识别分段顺序拼接的 UTF-8 文本；SRT/VTT 由分段时间生成，过滤空文本并限制负时间与反序时间。可选 Pi AI 排版以固定短指令处理文本，保持词句内容不变，另存 `.formatted.txt`。按段处理长文本以限制上下文和 token 消耗，不回写字幕时间轴。

## 凭据、安全与打包

主进程通过 Windows PowerShell 调用当前用户的 DPAPI 保存 ASR Key 和 Pi AI `CredentialStore` 内容；渲染层只接收“已配置”状态。旧版 Electron `safeStorage` 密文会在可解密时迁移；无法解密的旧密文保留备份并提示重新登录。Pi 的 OAuth `login/refresh` 由主进程驱动，浏览器登录和手动码提示通过受限 IPC 与界面交互。IPC 仅暴露预定义操作，外部转写端点要求 HTTPS，渲染层不能指定执行命令。FFmpeg/FFprobe 随 Windows 安装包作为资源打包，记录二进制版本及许可证信息。

## 选型依据

截至 2026-09-30，Groq 文档列出 Turbo 为 `$0.04/音频小时`、Large V3 为 `$0.111/音频小时`；其 WER 是服务商基准，需用目标样本复核。OpenAI 转写接口中 `whisper-1` 可提供所需时间信息。Pi AI 的 README 提供聊天模型和 OAuth，未列出音频转写操作。价格、模型能力、服务限制需在发布前复查。

参考：[Pi AI README](https://github.com/earendil-works/pi/blob/main/packages/ai/README.md)、[Groq Speech to Text](https://console.groq.com/docs/speech-to-text)、[OpenAI Audio API](https://developers.openai.com/api/reference/resources/audio)、[Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)。

## 公开视频扩展设计

React 经受限 IPC 提交 URL 和本批输出格式。主进程限定 YouTube/B站域名并拒绝播放列表参数，调用内置 `yt-dlp --dump-single-json --skip-download --no-playlist` 读取标题、视频 ID 和字幕清单。先按语言选人工字幕，再选自动字幕；字幕下载至 `userData/tmp/<job-id>`，解析 VTT/SRT/JSON3/JSON 为统一分段。有时间戳时按选择输出；只有文本时最多输出 TXT，不为补时间轴调用 ASR。未选 TXT 时给出可修改格式重试的错误。

## 进度与文本预览

本地及链接音频回退在获得时长后用已完成切片数估算识别进度，导出阶段显示接近完成，成功后为 100%。平台元数据、字幕和音频下载无法可靠估算耗时，任务显示阶段和不确定进度。每次导入产生批次 ID；批次条按任务等权汇总，失败、取消、跳过也计入“已处理”，不代表成功率。处理中任务重启后重新排队，进度重置。

仅完成且输出清单包含 TXT 的任务可通过受限 IPC 读取原稿、复制全文；渲染层预览使用只读可选中文本。主进程不接受任意文件路径。未生成 TXT 的任务不展示预览或 Pi AI 排版入口。

无可用字幕时，`yt-dlp -f bestaudio` 下载音频流至临时目录，再复用原有 FFmpeg 切片和 ASR。只把 WAV 音频片段发送给云端，视频画面不进入 ASR 请求。外部进程使用参数数组、禁用 shell 与用户配置、不使用 Cookie，并受取消信号控制。任务结束或启动清理临时文件。平台提取失败时报告错误并提示本地导入。

Deepgram 走独立适配路径：`POST https://api.deepgram.com/v1/listen?model=nova-3&utterances=true`；WAV 作为请求体，认证头为 `Authorization: Token <key>`，优先从 `results.utterances` 解析时间戳，空时回退到 `results.channels[0].alternatives[0].words`。语言为空时请求自动检测。Groq/OpenAI/自定义接口仍用 `Bearer` 和 multipart 表单。队列记录 `sourceType/platform/videoId/title/extractionMethod/outputDirectory`，链接文件名为 `<platform>-<video-id>-<safe-title>`，本地任务仍在原目录输出。

`yt-dlp` 固定版本并在下载时验证 SHA-256，安装包内置执行文件及 Deno JavaScript 运行时；YouTube 提取需要后者解决 JavaScript 挑战。本机 Node 22.17.1 在真实元数据试跑时导致求解进程崩溃，因此改用 yt-dlp 推荐的 Deno，并已用公开视频元数据验证。该非官方提取路径可能随平台变化而失效，版本升级需复核真实平台样本。[YouTube 官方字幕权限](https://developers.google.com/youtube/v3/docs/captions/download)、[YouTube 开发者政策](https://developers.google.com/youtube/terms/developer-policies-guide)、[yt-dlp EJS 指南](https://github.com/yt-dlp/yt-dlp/wiki/EJS)、[Deepgram 预录音频接口](https://developers.deepgram.com/docs/pre-recorded-audio)、[Deepgram utterances](https://developers.deepgram.com/docs/utterances)。
# 多模型配置与名称迁移（2026-09-30）

设置文件保存 `profiles` 与 `activeProfileId`，API Key 按配置 ID 存入系统加密凭据文件。旧版当前设置迁移为 `legacy` 配置；其余服务商如存有旧密钥，也生成对应配置并复制密钥。旧版未保存这些服务商的模型、语言和端点，迁移时使用预置模型，自定义端点须由用户补全。旧任务仍可使用按服务商保存的旧密钥。新任务在入队时记录配置 ID，切换配置不影响已有任务。Voxelle 沿用原 `appId` 和 `local-video-transcriber` 数据目录，保留升级前的数据。
