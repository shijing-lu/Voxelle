# Voxelle 宣传片与官网交付记录

## 成品

- 横屏主片：[marketing/output/voxelle-main.mp4](/C:/Users/a3129/Documents/ChatGPT/音频转文本/marketing/output/voxelle-main.mp4)，40 秒、1920 x 1080、H.264/AAC。
- 竖屏短片：[marketing/output/voxelle-social.mp4](/C:/Users/a3129/Documents/ChatGPT/音频转文本/marketing/output/voxelle-social.mp4)，15 秒、1080 x 1920、H.264/AAC。
- 横屏和竖屏封面分别位于 `marketing/output/poster-main.jpg`、`marketing/output/poster-social.jpg`。
- 本地网站在 `http://127.0.0.1:4173/` 预览。生产产物位于 `site/dist/`，安装包位于其 `downloads/` 目录；媒体与静态演示图片位于 `media/` 目录。
- [制作说明与许可记录](../marketing/README.md)含重新捕获、鼓点检测、配乐许可和生成背景原始 prompt。

## 验收

2026-10-01 在 Windows 本地完成验收：

- FFprobe 检查主片时长 40 秒、横屏 1920 x 1080、30 fps、H.264/AAC；社媒片时长 15 秒、竖屏 1080 x 1920、30 fps、H.264/AAC。FFmpeg loudness 检查主片 Integrated loudness -16.32 LUFS、true peak -5.02 dBTP。
- 用系统默认浏览器视图手动检查首屏与影片播放器，并按 Enter 键展开 FAQ。
- 隔离的 Chromium 页面验收通过：片长及解码尺寸、Escape 关闭播放器并还原焦点、FAQ 原生 disclosure、390 px 手机视口无横向溢出、首屏下载按钮可见、减少动态效果。
- 生产预览下载 Windows 安装包得到 HTTP 200，实际读取 313,592,923 bytes；重算 SHA-256 与网页显示完全一致。安装包大小在页面中四舍五入显示为 299.1 MB。
- Lighthouse 手机审计：性能 98、可访问性 100、最佳实践 100、SEO 100；最大内容绘制 2.41 秒。该结果来自本机预览与 Lighthouse 模拟移动设备，并非公开部署或真实终端用户监测。
- 横屏、竖屏影片均用 FFmpeg 生成、由内置 HTML5 视频播放器检查。没有通过外部 ASR 服务发送音频，也没有在公开平台发布。

## 托管提示

此交付保持本地预览。Cloudflare Pages 每个静态文件最大 25 MiB，不能容纳当前 313 MB 安装包。若后续公开，页面可部署至 Pages，安装程序单独托管；免费 R2 额度是每月 10 GB-month 存储、100 万次 A 类操作、1000 万次 B 类操作及免费出站流量。R2 的 `r2.dev` 公共地址限于开发用途，生产访问需要自有域名。正式部署前需把网页下载 URL 改为实际安装包 URL，并重新验收该外链。
