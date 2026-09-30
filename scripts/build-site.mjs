import { mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installer = path.join(root, 'release/Voxelle Setup 0.1.0.exe');
const meta = await stat(installer);
const hash = createHash('sha256');
for await (const chunk of createReadStream(installer)) hash.update(chunk);
const release = { version: '0.1.0', fileName: path.basename(installer), bytes: meta.size, sha256: hash.digest('hex'), url: 'downloads/' + path.basename(installer), builtAt: new Date().toISOString() };
const mediaDir = path.join(root, 'site/public/media');
await mkdir(mediaDir, { recursive: true });
for (const file of ['voxelle-main.mp4', 'voxelle-social.mp4', 'poster-main.jpg', 'poster-social.jpg', 'brand-wave.webp', 'brand-wave-mobile.webp', 'app-import.webp', 'app-queue.webp', 'app-queue-mobile.webp', 'settings-detail.webp', 'transcript-detail.webp']) {
  await copyFile(path.join(root, 'marketing/output', file), path.join(mediaDir, file));
}
await writeFile(path.join(root, 'site/public/release.json'), JSON.stringify(release, null, 2));
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'site/vite.config.mjs'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
await mkdir(path.join(root, 'site/dist/downloads'), { recursive: true });
await copyFile(installer, path.join(root, 'site/dist', release.url));
console.log(`Website ready: ${release.fileName} | ${(meta.size/1024/1024).toFixed(1)} MB | SHA-256 ${release.sha256}`);
