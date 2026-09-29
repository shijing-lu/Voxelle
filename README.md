# 音频转文本

Windows 桌面视频转写应用。支持单文件和批量导入、多音轨选择、Groq、OpenAI Whisper-1、自定义兼容语音接口，以及 Pi AI 订阅模型的可选文本排版。每个任务生成 TXT、SRT 和 VTT。

## 使用

下载并运行 `release/音频转文本 Setup 0.1.0.exe`。首次启动后，在“模型设置”填写 ASR 服务商 API Key；然后在“转写任务”导入文件或文件夹、选择音轨并加入队列。未完成任务会保存，重启后在凭据可用时自动重新处理。转写结果保存在源媒体所在目录。

## 开发

需要 Node.js 22.19+。运行 `npm install` 后用 `npm run dev` 启动，`npm run build` 构建，`npm run package:win` 生成 Windows 安装包。首次启动后到“模型设置”填写服务商 API Key。服务商会按照自己的规则收费。

应用只发送提取的音频片段给所选 ASR 服务；只有用户主动点击排版时，才将转写文本发送给 Pi AI 配置的聊天模型。原视频不会上传。

产品要求和技术说明见 [需求文档](docs/requirements.md)、[技术设计](docs/technical-design.md)、[开发文档](docs/development-plan.md)及[验证记录](docs/verification.md)。
