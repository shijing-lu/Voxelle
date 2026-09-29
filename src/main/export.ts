import { dialog } from 'electron';
import { access, copyFile, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConflictMode, Segment } from '../shared/types.js';
import { renderOutputs } from './subtitles.js';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function outputBase(source: string, mode: ConflictMode): Promise<string | null> {
  const folder = dirname(source);
  const stem = basename(source, extname(source));
  let base = join(folder, stem);
  const conflicts = async (value: string) => Promise.all(['.txt', '.srt', '.vtt'].map(ext => exists(value + ext))).then(items => items.some(Boolean));
  if (!(await conflicts(base))) return base;
  let choice = mode;
  if (choice === 'ask') {
    const result = await dialog.showMessageBox({ type: 'question', title: '输出文件已存在', message: `${stem} 的转写结果已存在`, detail: '请选择如何处理这组 TXT/SRT/VTT 文件。', buttons: ['另存', '覆盖', '跳过'], defaultId: 0, cancelId: 2 });
    choice = (['rename', 'overwrite', 'skip'] as const)[result.response];
  }
  if (choice === 'skip') return null;
  if (choice === 'overwrite') return base;
  for (let i = 1; i < 10000; i++) {
    base = join(folder, `${stem} (${i})`);
    if (!(await conflicts(base))) return base;
  }
  throw new Error('无法找到可用的输出文件名');
}

export async function writeOutputs(base: string, segments: Segment[]): Promise<string[]> {
  const rendered = renderOutputs(segments);
  const names = ['txt', 'srt', 'vtt'] as const;
  const transaction = randomUUID();
  const temps = names.map(name => `${base}.${name}.tmp-${transaction}`);
  const finals = names.map(name => `${base}.${name}`);
  const backups = finals.map(path => `${path}.backup-${transaction}`);
  const backedUp: number[] = [];
  const committed: number[] = [];
  let mayDeleteBackups = false;
  try {
    for (let i = 0; i < names.length; i++) await writeFile(temps[i], rendered[names[i]], 'utf8');
    for (let i = 0; i < names.length; i++) {
      if (await exists(finals[i])) { await copyFile(finals[i], backups[i]); backedUp.push(i); }
    }
    for (let i = 0; i < names.length; i++) { await rename(temps[i], finals[i]); committed.push(i); }
    mayDeleteBackups = true;
    return finals;
  } catch (error) {
    await Promise.all(committed.map(i => rm(finals[i], { force: true })));
    for (const i of backedUp) await rename(backups[i], finals[i]);
    mayDeleteBackups = true;
    throw error;
  } finally {
    await Promise.all(temps.map(path => rm(path, { force: true })));
    if (mayDeleteBackups) await Promise.all(backups.map(path => rm(path, { force: true })));
  }
}

export async function readTranscript(path: string): Promise<string> { return readFile(path, 'utf8'); }
export async function writeFormatted(baseTxt: string, content: string): Promise<string> {
  const initial = baseTxt.replace(/\.txt$/i, '.formatted.txt');
  let destination = initial;
  for (let i = 1; await exists(destination); i++) {
    destination = initial.replace(/\.txt$/i, ` (${i}).txt`);
  }
  const temp = `${destination}.tmp-${randomUUID()}`;
  await writeFile(temp, content, 'utf8');
  await rename(temp, destination);
  return destination;
}
