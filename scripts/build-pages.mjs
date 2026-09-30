import { mkdir, copyFile, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'marketing/output');
const installer = path.join(root, 'release/Voxelle Setup 0.1.0.exe');
const fileName = path.basename(installer);
const known = { version: '0.1.0', fileName, bytes: 313592923, sha256: 'b0f55f86854e17e291f0443158f586726f32864caf785c3631681abb9e44aab4' };
let bytes = known.bytes;
let sha256 = known.sha256;
try {
  const meta = await stat(installer);
  bytes = meta.size;
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  sha256 = hash.digest('hex');
} catch {
  // The installer is deliberately excluded from the Pages build.
}

const url = process.env.VOXELLE_R2_DOWNLOAD_URL || '#download';
const release = { ...known, bytes, sha256, url, builtAt: new Date().toISOString() };
const mediaDir = path.join(root, 'site/public/media');
await mkdir(mediaDir, { recursive: true });
for (const file of ['voxelle-main.mp4', 'voxelle-social.mp4', 'poster-main.jpg', 'poster-social.jpg', 'brand-wave.webp', 'brand-wave-mobile.webp', 'app-import.webp', 'app-queue.webp', 'app-queue-mobile.webp', 'settings-detail.webp', 'transcript-detail.webp']) {
  await copyFile(path.join(source, file), path.join(mediaDir, file));
}
await writeFile(path.join(root, 'site/public/release.json'), JSON.stringify(release, null, 2));
const result = spawnSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--config', 'site/vite.config.mjs', '--outDir', 'dist-pages'], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Pages website ready: site/dist-pages | download=${url}`);
