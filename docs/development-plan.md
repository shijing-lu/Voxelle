# 开发手册

## 阶段与交付

1. **文档与脚手架**：明确需求和技术边界；建立 Electron 主进程、受限 preload、React 界面、TypeScript 构建与 Windows 打包脚本。
2. **媒体和导出**：实现文件/文件夹导入、音轨探测、9 分钟音频切片、重叠去重、TXT/SRT/VTT 输出。
3. **ASR 和任务队列**：实现 Groq/OpenAI/自定义适配器；凭据设置、任务状态落盘、取消、重试和重启续跑。
4. **Pi AI**：接入三个订阅 OAuth，列出可用聊天模型，显式运行可选排版，保留原稿。
5. **发布**：补齐 Windows 安装包中的 FFmpeg/FFprobe、许可证说明、使用手册与针对真实媒体的人工验收。

## 本地开发

要求 Node.js 22.19+。`npm install` 安装依赖，`npm run dev` 启动 Vite 与 Electron，`npm run build` 构建，`npm run package:win` 生成 Windows 安装包。开发期可使用 npm 下载的 FFmpeg/FFprobe，打包后从应用资源目录读取。不要把 API Key、OAuth Token、用户视频或转写结果提交到仓库。

## 验收用例

- 一条音轨、多条音轨、无音轨、空白音频、损坏媒体。
- 单片与跨片语音，尤其是切片边界；时间戳单调且字幕内容不重复。
- Groq Turbo/Large V3、OpenAI Whisper-1 的标准响应，以及格式错误、401、429、5xx 和取消。
- 多选/文件夹导入、重复路径、同名视频、输出冲突、退出并重启续跑。
- Pi AI OAuth 登录与刷新失败，排版仅产生额外文件且原稿不变。
- 安装包在干净 Windows 环境中运行，不依赖 PATH 中的 FFmpeg。

## 模型评测

使用许可明确的公开中文、英文和中英混说测试片段，以及用户授权上传的匿名化实际视频及人工参考稿。两款 Groq 模型在同一音频预处理条件下盲测；报告中文字符错误率、英文词错误率、混说误差、人工可读性、字幕时间误差、耗时和服务账单费用。Turbo 为初始默认值；若实际样本反映明显质量问题，记录证据并调整推荐。不得把 Groq 公布的 WER 直接当成项目结果。

## 平台链接扩展：开发与维护

Windows 开发环境使用 Node.js 22.19+。依次运行 `npm install`、`npm run fetch:yt-dlp`、`npm run dev`。`npm run typecheck` 检查类型，`npm test` 运行单元验证，`npm run package:win` 会先校验抓取器再构建 NSIS 安装包。开发期抓取器和 JavaScript 运行时位于 `vendor/yt-dlp.exe`、`vendor/deno.exe`，安装后位于 `resources/bin/`；YouTube 提取要求 Deno 运行时。不要把二进制、Key、视频或转写结果提交到 Git。

`src/main/platform.ts` 负责 URL 白名单、元数据、字幕优先和音频下载；`src/main/queue.ts` 负责状态、回退和续跑；`src/main/asr.ts` 提供 Deepgram 专用协议；`src/main/export.ts` 负责统一目录和冲突处理。新增 IPC 时同步修改 `src/shared/types.ts`、`src/preload/index.ts`、`src/main/main.ts`。新增平台需先扩展 URL 解析，再用公开单视频验证元数据、人工字幕、自动字幕和无字幕音频路径。

更新抓取器时，从 [yt-dlp 官方 Releases](https://github.com/yt-dlp/yt-dlp/releases) 选版本，核对官方 SHA-256，然后同时修改 `scripts/fetch-yt-dlp.mjs` 的版本、哈希与第三方公告。重新下载并运行类型、模拟和真实平台验收。模拟通过不代表平台长期可用。

### 常见错误

- ASR 401：检查服务商与 Key 是否匹配；Deepgram 应在专用服务商选项配置，使用 `Token` 认证。
- Deepgram 处理完所有片段却没有文字：先在“语音语言”明确填写主要语言（普通话用 `zh`），保存设置并重新导入。自动语言检测可能选错语言；若仍失败，检查音轨和服务端响应。应用会优先读取 utterances，并在其为空时读取带时间戳的 words。
- 平台 403 或抓取失败：可能是地区、网络、平台限制或提取器变动；改用本地文件导入，必要时按上文升级抓取器。
- 无字幕且没有 API Key：字幕路径免费；音频回退需配置 ASR Key 后重试。
- 抓取器缺失：运行 `npm run fetch:yt-dlp`；安装版检查 `resources/bin/yt-dlp.exe`。
- 输出已存在：可在设置选择询问、另存、覆盖或跳过；链接结果位于统一目录。
- 重启续跑：处理中任务重新排队，从头处理；启动时清理上次临时音频。
- 每次导入时选择输出格式，默认 TXT；完成任务的 TXT 可在应用内预览和复制。纯文本字幕无时间轴时只可生成 TXT；仅选 SRT/VTT 的任务可修改格式后重试。

### 扩展验收

覆盖 YouTube/B站标准与短链接、重复、批量、播放列表拒绝；字幕优先、仅文本、无字幕音频回退；Deepgram `Token`、`nova-3` 和 utterances；401/403/429、取消、续跑、冲突、临时清理。真实平台与付费 ASR 使用人工验收并记录日期和结果。

## 开发任务模型建议

跨平台提取器、队列、凭据、多个 ASR 协议与 Electron 打包需同时检查边界，复杂实现和方案审查建议使用 **GPT-6 Astra / High**。日常小改动可用 GPT-6 Sol / High，再由 Astra 复核平台协议及安全边界。语音识别运行时仍按用户配置的 ASR 服务商计费；开发模型选择不改变应用内的 ASR 模型。
