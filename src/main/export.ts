import { dialog } from 'electron';
import { access, copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ConflictMode, OutputFormat, Segment } from '../shared/types.js';
import { renderOutputs } from './subtitles.js';
import { ALL_OUTPUT_FORMATS } from './output-policy.js';

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}

export async function outputBase(source: string, mode: ConflictMode, formats: OutputFormat[] = ALL_OUTPUT_FORMATS): Promise<string | null> {
  const folder = dirname(source);
  const stem = basename(source, extname(source));
  return outputBaseNamed(folder, stem, mode, formats);
}

export async function outputBaseNamed(folder: string, stem: string, mode: ConflictMode, formats: OutputFormat[] = ALL_OUTPUT_FORMATS): Promise<string | null> {
  await mkdir(folder, { recursive: true });
  let base = join(folder, stem);
  const conflicts = async (value: string) => Promise.all(formats.map(format => exists(`${value}.${format}`))).then(items => items.some(Boolean));
  if (!(await conflicts(base))) return base;
  let choice = mode;
  if (choice === 'ask') {
    const result = await dialog.showMessageBox({ type: 'question', title: '输出文件已存在', message: `${stem} 的转写结果已存在`, detail: `本次将生成 ${formats.map(format => format.toUpperCase()).join('、')}，请选择如何处理。`, buttons: ['另存', '覆盖', '跳过'], defaultId: 0, cancelId: 2 });
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

export async function writeTextOnly(base: string, content: string): Promise<string[]> {
  return writeSelected(base, { txt: content.trim() + '\n' }, ['txt']);
}

export async function writeOutputs(base: string, segments: Segment[], formats: OutputFormat[] = ALL_OUTPUT_FORMATS): Promise<string[]> {
  const rendered = renderOutputs(segments);
  return writeSelected(base, rendered, formats);
}

async function writeSelected(base: string, rendered: Record<OutputFormat, string> | { txt: string }, names: OutputFormat[]): Promise<string[]> {
  if (!names.length) throw new Error('至少选择一种输出格式');
  const transaction = randomUUID();
  const temps = names.map(name => `${base}.${name}.tmp-${transaction}`);
  const finals = names.map(name => `${base}.${name}`);
  const backups = finals.map(path => `${path}.backup-${transaction}`);
  const backedUp: number[] = [];
  const committed: number[] = [];
  let mayDeleteBackups = false;
  try {
    for (let i = 0; i < names.length; i++) await writeFile(temps[i], rendered[names[i] as keyof typeof rendered], 'utf8');
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
