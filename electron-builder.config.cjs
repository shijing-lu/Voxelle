const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const isWindows = process.platform === 'win32';
const executableSuffix = isWindows ? '.exe' : '';
const existing = file => fs.existsSync(path.resolve(root, file));
const extraResources = [];

const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
if (!ffmpeg || !fs.existsSync(ffmpeg) || !ffprobe || !fs.existsSync(ffprobe)) throw new Error('Missing platform FFmpeg/FFprobe binaries');
extraResources.push({ from: ffmpeg, to: `bin/ffmpeg${executableSuffix}` }, { from: ffprobe, to: `bin/ffprobe${executableSuffix}` });

// Package native tools on every supported platform.
{
  for (const [from, to] of [
    [`vendor/yt-dlp${executableSuffix}`, `bin/yt-dlp${executableSuffix}`],
    [`vendor/deno${executableSuffix}`, `bin/deno${executableSuffix}`],
    ['vendor/deno.LICENSE', 'licenses/deno.LICENSE'],
    ['vendor/yt-dlp.LICENSE', 'licenses/yt-dlp.LICENSE'],
  ]) {
    if (!existing(from)) throw new Error(`Missing required resource: ${from}`);
    extraResources.push({ from, to });
  }
}

for (const [from, to] of [
  [path.dirname(ffmpeg) + path.sep + path.basename(ffmpeg) + '.LICENSE', 'licenses/GPL-3.0.txt'],
  [path.dirname(ffmpeg) + path.sep + path.basename(ffmpeg) + '.README', 'licenses/ffmpeg-build-readme.txt'],
  ['THIRD_PARTY_NOTICES.md', 'licenses/THIRD_PARTY_NOTICES.md'],
]) if (fs.existsSync(path.resolve(root, from))) extraResources.push({ from, to });

module.exports = {
  appId: 'local.video.transcriber',
  productName: 'Voxelle',
  ...(process.env.CI ? {} : { electronDownload: { mirror: 'https://npmmirror.com/mirrors/electron/' } }),
  artifactName: 'Voxelle-${version}-${os}-${arch}.${ext}',
  directories: { output: 'release' },
  files: ['dist/**/*', 'package.json'],
  asarUnpack: ['node_modules/ffmpeg-static/**/*', 'node_modules/ffprobe-static/**/*'],
  extraResources,
  publish: null,
  win: { target: 'nsis' },
  nsis: { oneClick: false, allowToChangeInstallationDirectory: true },
  mac: { target: ['dmg', 'zip'], category: 'public.app-category.utilities' },
  linux: { target: ['AppImage', 'deb'], category: 'AudioVideo' },
};
