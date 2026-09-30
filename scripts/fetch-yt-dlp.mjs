import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const version = '2026.08.19';
const expected = '66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a';
const target = join(process.cwd(), 'vendor', 'yt-dlp.exe');
const denoVersion = 'v2.9.7';
const denoZipHash = 'a0c3101b4158d1dfb7d6a78a7bf0f3de80c96bb423c152beec8beb22786f2238';
const denoExeHash = 'e020f3e232bd16e33768dee528e5983349c962952051ced0a5d58ad42f5d9b33';
const denoTarget = join(process.cwd(), 'vendor', 'deno.exe');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function license(url, file) {
  try { if ((await readFile(file, 'utf8')).length > 100) return; } catch { /* download below */ }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`下载许可证失败：HTTP ${response.status}`);
  await writeFile(file, await response.text(), 'utf8');
}

await mkdir(join(process.cwd(), 'vendor'), { recursive: true });
await license(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${version}/LICENSE`, join(process.cwd(), 'vendor', 'yt-dlp.LICENSE'));
await license(`https://raw.githubusercontent.com/denoland/deno/${denoVersion}/LICENSE.md`, join(process.cwd(), 'vendor', 'deno.LICENSE'));
let cached = false;
try { cached = hash(await readFile(target)) === expected; } catch { /* first download */ }
if (!cached) {
  const response = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/download/${version}/yt-dlp.exe`);
  if (!response.ok) throw new Error(`下载 yt-dlp 失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== expected) throw new Error('yt-dlp SHA-256 校验失败；文件未写入');
  const temp = `${target}.tmp`;
  await writeFile(temp, bytes);
  await rename(temp, target);
}
process.stdout.write(`yt-dlp ${version} SHA-256 校验通过\n`);

let denoCached = false;
try { denoCached = hash(await readFile(denoTarget)) === denoExeHash; } catch { /* first download */ }
if (!denoCached) {
  const response = await fetch(`https://github.com/denoland/deno/releases/download/${denoVersion}/deno-x86_64-pc-windows-msvc.zip`);
  if (!response.ok) throw new Error(`下载 Deno 失败：HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (hash(bytes) !== denoZipHash) throw new Error('Deno ZIP SHA-256 校验失败；文件未写入');
  const zip = join(process.cwd(), 'vendor', 'deno.zip');
  await writeFile(zip, bytes);
  const nativeTar = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  const extracted = spawnSync(nativeTar, ['-xf', zip, '-C', join(process.cwd(), 'vendor')], { windowsHide: true, encoding: 'utf8' });
  if (extracted.status !== 0) throw new Error(`解压 Deno 失败：${extracted.stderr}`);
  await rm(zip, { force: true });
}
if (hash(await readFile(denoTarget)) !== denoExeHash) throw new Error('Deno 可执行文件 SHA-256 校验失败');
process.stdout.write(`Deno ${denoVersion} SHA-256 校验通过\n`);
