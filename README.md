# Voxelle

Windows 桌面视频转写应用。支持单文件、批量、文件夹和 YouTube/B站公开视频链接；支持多音轨、Groq、OpenAI Whisper-1、Deepgram nova-3、自定义兼容语音接口，以及 Pi AI 订阅模型的可选文本排版。

## 使用

在“模型设置”中可保存多套 ASR 配置，每套独立保存模型、语言、端点和 API Key。点“新建配置”添加另一套，之后从“当前配置”切换；原有配置在升级时自动保留。左侧导航固定，任务内容在右侧滚动。

下载并运行 `release/Voxelle Setup 0.1.0.exe`。本地文件先在“模型设置”填写 ASR API Key，再导入文件或文件夹、选择音轨。公开链接可直接粘贴多个：有字幕时优先提取，无字幕时才用所选 ASR，此时需要 API Key 且可能产生费用。每次加入队列前勾选 TXT、SRT、VTT 中至少一种，默认只生成 TXT。任务和导入批次显示大概进度；完成且生成 TXT 后可在应用内预览、选中部分文字复制或一键复制全文。链接结果保存在设置的统一输出目录；本地结果在源媒体目录。未完成任务会保存并在重启后重试。

## 开发

需要 Node.js 22.19+。运行 `npm install`、`npm run fetch:yt-dlp` 后用 `npm run dev` 启动；`npm run build` 构建，`npm run package:win` 生成 Windows 安装包。安装包内置 FFmpeg/FFprobe/yt-dlp/Deno 运行时。服务商会按照自己的规则收费。

应用只发送提取的音频片段给所选 ASR 服务；只有用户主动点击排版时，才将转写文本发送给 Pi AI 配置的聊天模型。原视频不会作为 ASR 请求上传。平台链接使用非官方抓取，可能受到平台规则、地区网络和接口变化影响；不支持登录内容、播放列表或 DRM。

产品要求和技术说明见 [需求文档](docs/requirements.md)、[技术设计](docs/technical-design.md)、[开发文档](docs/development-plan.md)及[验证记录](docs/verification.md)。
