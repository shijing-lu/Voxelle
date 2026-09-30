# Voxelle 本地下载官网

## 本地预览

先制作宣传片并确认 Windows 安装包位于 `release/Voxelle Setup 0.1.0.exe`，然后在仓库根目录运行：

```powershell
npm run site:build
npm run site:preview
```

预览地址是 `http://127.0.0.1:4173/`。`site:build` 把影片与界面图从 `marketing/output/` 复制到公开静态资源目录，读取安装包计算版本、文件大小和 SHA-256，运行 Vite 构建，再把完整安装包复制到构建产物的 `downloads/` 目录。构建结果在 `site/dist/`，已被 Git 忽略。

`npm run site:dev` 只用于编辑和热重载，不包含构建下载包。要检查实际下载、播放与哈希，请用生产预览 `site:preview`。

## 重新生成素材

```powershell
npm run marketing:fetch
npm run marketing:capture
npm run marketing:render
npm run site:build
```

渲染依赖 Windows 自带的微软雅黑 / Segoe UI，Node.js 与项目内 `ffmpeg-static`，以及可导入 Pillow、NumPy 的 Python。默认使用 Codex 附带 Python；也可设置 `VOXELLE_PYTHON` 指向其他 Python 可执行文件。

## 当前发布边界

页面提供 40 秒横屏宣传片、15 秒竖屏片下载、桌面和手机布局、键盘可访问的 FAQ、系统减少动态效果支持、安装包信息与校验值。站点只使用本地静态资源，不收集访客数据。当前使用本地生产预览，没有 DNS、域名或公开托管。若托管到 Cloudflare Pages，应将 313 MB Windows 安装包放进独立对象存储，并修改安装按钮链接；Pages 单个文件上限为 25 MiB。
