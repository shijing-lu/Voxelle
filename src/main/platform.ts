import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import type { Segment } from '../shared/types.js';

export type Platform = 'youtube' | 'bilibili';
export interface VideoLink { url: string; platform: Platform; videoId: string }
export interface VideoDetails { title: string; videoId: string; platform: Platform; subtitles: Record<string, unknown[]>; automaticCaptions: Record<string, unknown[]> }
export interface CaptionResult { method: 'subtitle' | 'auto-caption'; segments: Segment[]; text: string; timed: boolean }

export function parseVideoLink(input: string): VideoLink {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error('请输入有效的视频 URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('仅支持 HTTP(S) 视频链接');
  if (url.username || url.password) throw new Error('链接中不能包含登录凭据');
  const host = url.hostname.toLowerCase();
  if (url.searchParams.has('list') || /\/playlist(?:\/|$)/i.test(url.pathname)) throw new Error('暂不支持播放列表，请粘贴单个视频链接');
  let platform: Platform;
  let videoId: string;
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(host)) {
    platform = 'youtube';
    videoId = url.pathname === '/watch' ? url.searchParams.get('v') ?? '' : /^\/(?:shorts|live|embed)\/([A-Za-z0-9_-]{11})/.exec(url.pathname)?.[1] ?? '';
  } else if (host === 'youtu.be') {
    platform = 'youtube'; videoId = url.pathname.split('/')[1] ?? '';
  } else if (['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(host)) {
    platform = 'bilibili'; videoId = /^\/video\/((?:BV[A-Za-z0-9]+)|(?:av\d+))/i.exec(url.pathname)?.[1] ?? '';
    if (url.searchParams.has('p') && url.searchParams.get('p') !== '1') throw new Error('暂不支持 B站分P，请使用单集链接');
  } else if (host === 'b23.tv') {
    platform = 'bilibili'; videoId = url.pathname.split('/')[1] ?? '';
  } else throw new Error('目前只支持 YouTube 和哔哩哔哩公开视频链接');
  if (!videoId || (platform === 'youtube' && !/^[A-Za-z0-9_-]{11}$/.test(videoId))) throw new Error('链接中找不到单个视频 ID');
  const canonical = platform === 'youtube' ? `https://www.youtube.com/watch?v=${videoId}` : host === 'b23.tv' ? `https://b23.tv/${videoId}` : `https://www.bilibili.com/video/${videoId}`;
  return { url: canonical, platform, videoId };
}

async function executable(): Promise<string> {
  const { app } = await import('electron');
  if (app.isPackaged) return join(process.resourcesPath, 'bin', 'yt-dlp.exe');
  const local = join(app.getAppPath(), 'vendor', 'yt-dlp.exe');
  return existsSync(local) ? local : 'yt-dlp';
}

async function run(args: string[], signal: AbortSignal): Promise<string> {
  const exe = await executable();
  const deno = join(exe.slice(0, -'yt-dlp.exe'.length), 'deno.exe');
  const { binary } = await import('./media.js');
  const ffmpegFolder = dirname(binary('ffmpeg'));
  return new Promise((resolve, reject) => {
    let output = ''; let errors = '';
    const child = spawn(exe, ['--no-config', '--no-playlist', '--js-runtimes', `deno:${deno}`, '--ffmpeg-location', ffmpegFolder, '--socket-timeout', '20', '--retries', '3', ...args], { windowsHide: true, signal });
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 8_000_000) child.kill(); });
    child.stderr.on('data', chunk => { errors += chunk.toString(); errors = errors.slice(-4000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(errors.slice(-1200) || `yt-dlp 退出码 ${code}`)));
  });
}

export async function inspectVideo(link: VideoLink, signal: AbortSignal): Promise<VideoDetails> {
  const raw = await run(['--skip-download', '--dump-single-json', link.url], signal);
  const data = JSON.parse(raw) as { _type?: string; id?: string; title?: string; subtitles?: Record<string, unknown[]>; automatic_captions?: Record<string, unknown[]>; is_live?: boolean; playlist_count?: number; age_limit?: number; availability?: string; has_drm?: boolean };
  if (data._type === 'playlist' || data.playlist_count && data.playlist_count > 1) throw new Error('暂不支持播放列表或 B站分P');
  if (data.is_live) throw new Error('暂不支持直播内容');
  if (data.age_limit && data.age_limit > 0) throw new Error('暂不支持年龄限制内容');
  if (data.has_drm || data.availability && !['public', 'unlisted'].includes(data.availability)) throw new Error('暂不支持私密、付费或受保护内容');
  if (!data.id) throw new Error('平台未返回视频 ID');
  return { title: data.title || data.id, videoId: data.id, platform: link.platform, subtitles: data.subtitles ?? {}, automaticCaptions: data.automatic_captions ?? {} };
}

function chooseLanguage(tracks: Record<string, unknown[]>, preferred: string): string | null {
  const available = Object.keys(tracks).filter(key => tracks[key]?.length);
  if (!available.length) return null;
  const wants = preferred ? [preferred] : ['zh-Hans', 'zh-CN', 'zh', 'en', 'en-US'];
  for (const want of wants) {
    const exact = available.find(key => key.toLowerCase() === want.toLowerCase());
    if (exact) return exact;
    const family = available.find(key => key.toLowerCase().startsWith(`${want.toLowerCase()}-`));
    if (family) return family;
  }
  return available[0];
}

function parseTime(value: string): number {
  const parts = value.replace(',', '.').split(':').map(Number);
  if (parts.some(part => !Number.isFinite(part))) return NaN;
  return parts.reduce((sum, part) => sum * 60 + part, 0);
}

export function parseCaption(content: string, extension: string): { segments: Segment[]; text: string; timed: boolean } {
  const segments: Segment[] = [];
  let untimedText = '';
  if (extension === '.json3' || extension === '.json') {
    const data = JSON.parse(content) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }>; body?: Array<{ from?: number; to?: number; content?: string }> };
    for (const event of data.events ?? []) {
      const text = (event.segs ?? []).map(item => item.utf8 ?? '').join('').trim();
      if (text && Number.isFinite(event.tStartMs) && Number.isFinite(event.dDurationMs)) segments.push({ start: event.tStartMs! / 1000, end: (event.tStartMs! + event.dDurationMs!) / 1000, text });
    }
    for (const item of data.body ?? []) if (item.content && Number.isFinite(item.from) && Number.isFinite(item.to)) segments.push({ start: item.from!, end: item.to!, text: item.content.trim() });
    if (!segments.length) untimedText = [...(data.events ?? []).map(event => (event.segs ?? []).map(item => item.utf8 ?? '').join('')), ...(data.body ?? []).map(item => item.content ?? '')].map(item => item.trim()).filter(Boolean).join('\n');
  } else {
    const blocks = content.replace(/^\uFEFF/, '').split(/\r?\n\s*\r?\n/);
    for (const block of blocks) {
      const lines = block.split(/\r?\n/);
      const index = lines.findIndex(line => line.includes('-->'));
      if (index < 0) continue;
      const match = lines[index].match(/(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/);
      if (!match) continue;
      const [startRaw, endRaw] = match[0].split(/\s*-->\s*/);
      const text = lines.slice(index + 1).join(' ').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();
      if (text) segments.push({ start: parseTime(startRaw), end: parseTime(endRaw), text });
    }
  }
  const valid = segments.filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start);
  if (valid.length) return { segments: valid, text: valid.map(item => item.text).join('\n'), timed: true };
  const text = (extension === '.json3' || extension === '.json' ? untimedText : content.replace(/^WEBVTT[^\n]*\n/i, '').replace(/<[^>]*>/g, '')).trim();
  return { segments: [], text, timed: false };
}

export async function fetchCaptions(link: VideoLink, details: VideoDetails, jobId: string, language: string, signal: AbortSignal): Promise<CaptionResult | null> {
  const { tempDir } = await import('./media.js');
  const choices = [{ tracks: details.subtitles, method: 'subtitle' as const, flag: '--write-subs' }, { tracks: details.automaticCaptions, method: 'auto-caption' as const, flag: '--write-auto-subs' }];
  for (const choice of choices) {
    const code = chooseLanguage(choice.tracks, language);
    if (!code) continue;
    const dir = tempDir(jobId);
    await mkdir(dir, { recursive: true });
    try {
      await run(['--skip-download', choice.flag, '--sub-langs', code, '--sub-format', 'vtt/srt/json3/json/best', '-o', join(dir, 'subtitle.%(ext)s'), link.url], signal);
      const names = (await readdir(dir)).filter(name => /\.(vtt|srt|json3|json)$/i.test(name));
      for (const name of names) {
        const parsed = parseCaption(await readFile(join(dir, name), 'utf8'), extname(name).toLowerCase());
        if (parsed.text.trim()) return { ...parsed, method: choice.method };
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  return null;
}

export async function downloadAudio(link: VideoLink, jobId: string, signal: AbortSignal): Promise<string> {
  const { tempDir } = await import('./media.js');
  const dir = tempDir(jobId);
  await mkdir(dir, { recursive: true });
  await run(['-f', 'bestaudio', '-o', join(dir, 'audio.%(ext)s'), link.url], signal);
  const name = (await readdir(dir)).find(item => item.startsWith('audio.') && !item.endsWith('.part'));
  if (!name) throw new Error('平台未返回可下载音轨；请改用本地文件导入');
  return join(dir, name);
}
