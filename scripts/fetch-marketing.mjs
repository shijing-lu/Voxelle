import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('marketing/audio', { recursive: true });
for (const [url, target] of [
  ['https://assets.mixkit.co/music/136/136.mp3', 'marketing/audio/infected-mushroom-vibes.mp3'],
  ['https://mixkit.co/license/modal/musicFree/', 'marketing/audio/mixkit-license.html'],
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(target, bytes);
  console.log(`${target}: ${bytes.length} bytes, SHA-256 ${createHash('sha256').update(bytes).digest('hex')}`);
}
