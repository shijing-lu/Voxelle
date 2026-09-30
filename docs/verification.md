# 验证记录

日期：2026-09-30。

## 已完成

- `npm run typecheck`：主进程、preload 和渲染进程类型检查通过。
- `npm test`：5 项代码测试通过，覆盖自定义端点 HTTPS、仅上传 WAV 分片、切片容量、重叠去重和三种输出格式。
- `npm run package:win`：生成 Windows x64 安装程序，并将 FFmpeg、FFprobe 和许可证材料纳入包中。
- `node scripts/smoke.mjs`：对打包应用进行了双音轨媒体探测、密钥保存、取消与重试、模拟 HTTPS ASR 请求、TXT/SRT/VTT 导出、强制退出后凭据恢复以及队列自动续跑。模拟服务仅收到两个 WAV 片段请求。

## 待真实账号和样本验证

- 尚未使用真实 Groq、OpenAI API Key 及 Pi AI 订阅账号完成在线转写、OAuth 登录和刷新测试。
- 尚未取得用户授权的匿名视频与人工参考稿，因此 Groq Turbo 与 Large V3 的 CER、WER、耗时和费用对比尚无实测结论。
- 安装程序已构建，但尚未在干净 Windows 设备上人工安装和操作。

模型默认值仍为 Groq `whisper-large-v3-turbo`，属于基于官方资料的初始选择。正式推荐应按[开发文档](development-plan.md)中的评测流程复核。

## 公开视频扩展验证（2026-09-30）

- `npm run typecheck` 通过；`npm test` 现有 9 项全部通过，增加了 YouTube/B站链接格式、播放列表拒绝、VTT/无时间戳 JSON 字幕、Deepgram `Token`/WAV/utterances 验证。
- `npm run fetch:yt-dlp` 校验官方 yt-dlp 2026.08.19 与 Deno 2.9.7 的 SHA-256，许可证文本也纳入安装资源。
- 用 YouTube 公开单视频实际获取元数据和人工 VTT 字幕；解析得到 61 个带时间戳段落。用 B站公开视频实际获取元数据，确认其提供音频独立格式；未下载完整音频。
- PowerShell 中设置 `$env:PLATFORM_SMOKE='1'` 后运行 `node scripts/smoke.mjs`，在打包应用上通过：本地双音轨、模拟云端 ASR、取消/重试/续跑，以及 YouTube 链接人工字幕提取和三文件导出。字幕任务没有增加云端 ASR 请求数。
- 实测发现 Node 22.17.1 作为 yt-dlp JavaScript 运行时会在挑战求解中崩溃；改用 Deno 后元数据和字幕提取成功。安装包内置 Deno。

未使用真实 Groq、OpenAI 或 Deepgram Key 测试实际付费转写，也未在干净 Windows 设备上人工安装。B站无字幕音频回退、平台 401/403、真实服务 429、平台政策变化仍需用具备授权的样本做人工验收；模拟通过不代表这些外部路径长期可用。

## 进度、可选导出与复制验证（2026-09-30）

- `npm run typecheck` 通过；`npm test` 共 11 项通过，新增格式选择及无时间轴字幕的规则测试。
- `npm run package:win` 完成，生成 `release/音频转文本 Setup 0.1.0.exe`。
- 设置 `PLATFORM_SMOKE=1` 后运行 `node scripts/smoke.mjs` 通过。打包应用中的任务进度达到 100%，导入批次显示汇总进度；已完成任务可打开只读 TXT 预览，读取登记的文本并执行复制全文接口。
- 演练先导出 TXT/SRT/VTT 三种格式，再保留同名 TXT、移除 SRT/VTT，使用“跳过冲突”入队仅 SRT 任务。任务在重启后继续完成，输出清单只有 SRT；现存的未选 TXT 不阻止导出。
- 真实 YouTube 公共视频的带时间轴字幕仅选择 TXT/VTT 导出，未增加云端 ASR 上传次数。

仍需在干净 Windows 设备上人工确认进度条视觉效果、鼠标选择部分文字后复制，以及使用真实账号时的网络阶段显示。网络探测和字幕下载只显示阶段提示，百分比仅代表可计量的后续步骤。

## Deepgram 空结果排查（2026-09-30）

- 用户报告一段约 35 分钟的本地 MP4 在 Deepgram `nova-3` 下运行至 94% 后显示“没有识别到语音”。任务记录显示 4/4 个切片已完成，语言设置为空；FFprobe 确认文件有单声道 AAC 音轨，抽样 20 秒音频的平均音量约 −20.3 dB、峰值约 −2.6 dB。
- 原实现只读取 Deepgram 的 `results.utterances`。现增加 `results.channels[0].alternatives[0].words` 的时间戳回退；有全文而无词时间戳时使用该切片时长保留文字。全空时显示针对语言设置的诊断提示。
- `npm run typecheck` 通过，`npm test` 共 13 项通过，新增两项 Deepgram 回退解析测试；`npm run package:win` 生成新版安装包。未取得该次请求的原始 Deepgram JSON，因此无法断定该视频是响应字段不同还是服务端确实未识别出文字；没有为排查再次发送音频或产生 API 费用。

## Voxelle 与多配置（2026-09-30）

- `npm run typecheck` 通过；`npm run package:win` 生成 `release/Voxelle Setup 0.1.0.exe`。
- 设置迁移保留 `local-video-transcriber` 数据目录；旧版当前设置成为首个配置，旧服务商密钥复制到对应配置。新任务记录配置 ID，侧栏与右侧内容分别滚动。
- 本次未运行自动测试或人工安装演练；多配置切换、旧数据迁移及侧栏滚动效果仍需在应用中手动确认。
