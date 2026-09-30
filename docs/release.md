# Voxelle GitHub Release

## 自动发布

GitHub Actions 位于 `.github/workflows/release.yml`。推送语义化版本标签后，它会在 Windows、Ubuntu 和 macOS runner 上分别构建安装包，并创建 GitHub Release：

```powershell
npm version patch
git push origin HEAD:master
git push origin --tags
```

Release 页面会包含 Windows x64 NSIS 安装程序、Linux x64 AppImage/deb，以及 macOS Intel x64 和 Apple Silicon arm64 的 dmg/zip。产物名称包含系统和架构，同时提供 SHA256SUMS.txt。构建过程使用 `npm ci` 和锁文件，发布任务只上传安装文件，所有构建成功后才发布。

`npm version patch` 会同步两个包文件的版本，并自动提交和创建版本标签。执行前先提交功能改动，保持工作区干净；也可以使用 `minor` 或 `major` 升级版本。

## 平台说明

- 所有构建都会打包对应平台的 FFmpeg/FFprobe、yt-dlp 和 Deno；下载 yt-dlp 和 Deno 时会校验 SHA-256。
- macOS 构建默认未签名和公证，首次打开可能需要在系统设置中允许应用。
- GitHub Actions 只在推送 `v*.*.*` 标签时发布正式 Release；普通分支推送不会创建 Release。
- Actions 页面手动运行只构建并保存产物，不创建 Release。标签版本必须与 package.json 一致；发布新版本前同步 package-lock.json 中的版本。
- 安装包尚未配置 Windows 代码签名和 Apple 签名/公证。CI 构建通过不等于各系统真实桌面功能验收；首次版本应检查启动、本地转写、链接提取和凭据保存。
