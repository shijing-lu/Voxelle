import { createHash } from 'node:crypto';
import { mkdir, writeFile, chmod, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

if (process.platform === 'win32') {
  await import('./fetch-yt-dlp.mjs');
} else {
  const vendor = path.resolve('vendor');
  await mkdir(vendor, { recursive: true });
  const ytVersion = '2026.08.19';
  const denoVersion = 'v2.9.7';
  const targets = { 'darwin-x64': 'x86_64-apple-darwin', 'darwin-arm64': 'aarch64-apple-darwin', 'linux-x64': 'x86_64-unknown-linux-gnu' };
  const target = targets[`${process.platform}-${process.arch}`];
  if (!target) throw new Error(`Unsupported build platform: ${process.platform}/${process.arch}`);
  async function download(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    return Buffer.from(await response.arrayBuffer());
  }
  function verify(bytes, checksum) {
    if (!/^[a-f0-9]{64}$/i.test(checksum) || createHash('sha256').update(bytes).digest('hex') !== checksum.toLowerCase()) throw new Error('Binary SHA-256 verification failed');
  }
  const ytFile = process.platform === 'darwin' ? 'yt-dlp_macos' : 'yt-dlp_linux';
  const ytBase = `https://github.com/yt-dlp/yt-dlp/releases/download/${ytVersion}`;
  const sums = (await download(`${ytBase}/SHA2-256SUMS`)).toString();
  const checksum = sums.split(/\r?\n/).find(line => line.trim().split(/\s+/).at(-1).replace(/^\*/, '') === ytFile)?.split(/\s+/)[0];
  const ytBytes = await download(`${ytBase}/${ytFile}`);
  verify(ytBytes, checksum ?? '');
  await writeFile(path.join(vendor, 'yt-dlp'), ytBytes);
  await chmod(path.join(vendor, 'yt-dlp'), 0o755);
  const denoFile = `deno-${target}.zip`;
  const denoBase = `https://github.com/denoland/deno/releases/download/${denoVersion}`;
  const denoSum = (await download(`${denoBase}/${denoFile}.sha256sum`)).toString().trim().split(/\s+/)[0];
  const denoBytes = await download(`${denoBase}/${denoFile}`);
  verify(denoBytes, denoSum);
  const archive = path.join(vendor, denoFile);
  await writeFile(archive, denoBytes);
  const result = spawnSync('unzip', ['-o', archive, '-d', vendor], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Deno extraction failed');
  await chmod(path.join(vendor, 'deno'), 0o755);
  await rm(archive);
  await writeFile(path.join(vendor, 'yt-dlp.LICENSE'), await download(`https://raw.githubusercontent.com/yt-dlp/yt-dlp/${ytVersion}/LICENSE`));
  await writeFile(path.join(vendor, 'deno.LICENSE'), await download(`https://raw.githubusercontent.com/denoland/deno/${denoVersion}/LICENSE.md`));
  console.log(`Verified platform tools for ${process.platform}/${process.arch}`);
}
