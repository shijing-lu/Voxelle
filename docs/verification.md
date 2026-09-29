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
