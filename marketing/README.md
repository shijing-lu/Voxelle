# Voxelle宣传片制作

## 成品

- `output/voxelle-main.mp4`：40秒，1920 x 1080，H.264 / AAC，横屏主片。
- `output/voxelle-social.mp4`：15秒，1080 x 1920，H.264 / AAC，竖屏版。
- `output/poster-main.jpg` 和 `output/poster-social.jpg`：视频封面。
- `assets/`：应用界面演示截图与声波背景。截图由实际的 Electron 渲染器生成，使用隔离的合成演示数据；没有读取日常用户配置、API Key 或媒体库。

## 重新制作

需要 Windows、Node.js、项目 npm 依赖、Python Pillow 和 NumPy，以及 Windows 自带的微软雅黑和 Segoe UI 字体。项目的 `ffmpeg-static` 依赖提供渲染用 FFmpeg。

```powershell
npm install
npm run marketing:fetch
npm run marketing:capture
npm run marketing:render
npm run site:build
npm run site:preview
```

`marketing:fetch` 从 Mixkit 官方曲目资产和许可页面下载配乐及许可快照。`marketing:capture` 启动隔离的 Electron 窗口，并采集转写进度、格式勾选、模型设置和 TXT 预览。`marketing:render` 依据音频低频能量和频谱通量检测鼓点，使用匹配鼓点的时间切换分镜；首次制作前应重新运行捕获。输出 MP4 写入被 Git 忽略的 `marketing/output/`，网站构建会把它们复制到 `site/dist/media/`。

## 音乐许可记录

- 曲目：Infected Mushroom Vibes，Alejandro Magaña (A. M.)，Mixkit 免费音乐曲目 136。
- 来源：[曲目详情及目录](https://mixkit.co/free-stock-music/electronic/)、[原始音频](https://assets.mixkit.co/music/136/136.mp3)。下载的音频仅作为本片组成部分，未单独提供给网站访客。
- 许可：[Mixkit Stock Music Free License](https://mixkit.co/license/modal/musicFree/)。Mixkit 将在线营销视频及社交媒体视频列为可用场景；许可要求不得将原始音乐作为独立音乐素材转售或分发。许可快照与原始音频保存在 Git 忽略的 `marketing/audio/`，需要更新时运行 `npm run marketing:fetch`。
- 获取日期：2026-09-30。许可条款可能变化；若重新发布成片，请再查看 Mixkit 当前页面。
- 鼓点检测及横竖屏切镜时间保存在 `output/beat-analysis.json`。AAC 输出目标为 -16 LUFS，true peak 不高于 -1.5 dBTP。

## 视觉资产

品牌波形背景由内置 `image_gen` 为本项目生成，原始 prompt 是：

> Create a premium cinematic brand background for Voxelle, a video-to-text desktop tool. Wide landscape 16:9, editorial studio photography meets sculptural 3D. One sweeping folded ribbon shaped like an acoustic waveform, translucent deep forest green glass with bright acid-lime lit thin edge, subtle ribbed surface, on an almost-black forest green studio backdrop. Sculpture occupies right two thirds; clean dark negative space on left for later typography. Strong silhouette, elegant controlled directional lighting, tactile precision, not neon haze, not cyberpunk, no particle clutter, no UI, no lettering, no logos, no watermarks. Highly polished advertising art, dramatic contrast, warm-white tiny reflected highlights.

官网使用 Space Grotesk 可变字体。字体以 WOFF2 和完整 SIL Open Font License 一起保存在 `site/public/fonts/`。界面中文由系统微软雅黑显示。
