import { app } from 'electron';
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import type { AudioTrack, MediaInfo } from '../shared/types.js';
import { chunkRange } from './timeline.js';

function binary(name: 'ffmpeg' | 'ffprobe'): string {
  if (app.isPackaged) return join(process.resourcesPath, 'bin', `${name}.exe`);
  const ffmpegPath = typeof ffmpegStatic === 'string' ? ffmpegStatic : ffmpegStatic.default;
  const value = name === 'ffmpeg' ? ffmpegPath : ffprobeStatic.path;
  if (!value) throw new Error(`缺少 ${name} 可执行文件，请重新安装依赖`);
  return value;
}

function run(exe: string, args: string[], signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';
    let errors = '';
    const child = spawn(exe, args, { windowsHide: true, signal });
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors.slice(-1000) || `${exe} 退出码 ${code}`)));
  });
}

export async function inspectMedia(path: string): Promise<MediaInfo> {
  const raw = await run(binary('ffprobe'), ['-v', 'error', '-show_entries', 'format=duration:stream=index,codec_type,codec_name,channels:stream_tags=language,title', '-of', 'json', path]);
  const data = JSON.parse(raw) as { format?: { duration?: string }; streams?: Array<{ index: number; codec_type: string; codec_name?: string; channels?: number; tags?: { language?: string; title?: string }; duration?: string }> };
  const tracks: AudioTrack[] = (data.streams ?? []).filter(stream => stream.codec_type === 'audio').map(stream => ({
    index: stream.index, codec: stream.codec_name ?? 'unknown', language: stream.tags?.language ?? '未标记', title: stream.tags?.title ?? '', channels: stream.channels ?? 0,
  }));
  if (tracks.length === 0) throw new Error('媒体中没有音轨');
  const duration = Number(data.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('无法读取媒体时长');
  return { path, duration, tracks };
}

export function tempDir(id: string): string { return join(app.getPath('userData'), 'tmp', id); }

export async function extractChunk(path: string, trackIndex: number, id: string, index: number, duration: number, signal: AbortSignal): Promise<{ file: string; start: number; nominalStart: number }> {
  const range = chunkRange(index, duration);
  const dir = tempDir(id);
  await mkdir(dir, { recursive: true });
  const file = join(dir, `chunk-${index}.wav`);
  await run(binary('ffmpeg'), ['-hide_banner', '-loglevel', 'error', '-ss', String(range.start), '-i', path, '-t', String(range.end - range.start), '-map', `0:${trackIndex}`, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', '-y', file], signal);
  return { file, start: range.start, nominalStart: range.nominalStart };
}

export async function clearTemp(id: string): Promise<void> { await rm(tempDir(id), { recursive: true, force: true }); }
