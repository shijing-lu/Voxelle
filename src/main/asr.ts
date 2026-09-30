import { readFile } from 'node:fs/promises';
import type { AsrProvider, Segment } from '../shared/types.js';

export interface AsrRequest {
  file: string;
  provider: AsrProvider;
  model: string;
  language: string;
  customEndpoint: string;
  key: string;
  signal: AbortSignal;
}

export class AsrError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly retryAfterMs = 0) { super(message); }
}

interface DeepgramWord { start: number; end: number; word?: string; punctuated_word?: string }
interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: {
    utterances?: Array<{ start: number; end: number; transcript: string }>;
    channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: DeepgramWord[] }> }>;
  };
}

function validSegments(items: Array<{ start: number; end: number; text: string }>): Segment[] {
  return items.map(item => ({ start: Number(item.start), end: Number(item.end), text: String(item.text ?? '').trim() }))
    .filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end >= item.start && item.text.length > 0);
}

function joinWords(words: string[]): string {
  return words.reduce((text, word) => text + (text && !/^[\p{Script=Han}，。！？、；：,.!?;:]/u.test(word) && !/[\p{Script=Han}]$/u.test(text) ? ' ' : '') + word, '');
}

export function parseDeepgramSegments(data: DeepgramResponse): Segment[] {
  const utterances = validSegments((data.results?.utterances ?? []).map(item => ({ start: item.start, end: item.end, text: item.transcript })));
  if (utterances.length) return utterances;

  const alternative = data.results?.channels?.[0]?.alternatives?.[0];
  const words = (alternative?.words ?? []).filter(word => Number.isFinite(word.start) && Number.isFinite(word.end) && word.end >= word.start && (word.punctuated_word || word.word)?.trim());
  if (words.length) {
    const groups: DeepgramWord[][] = [];
    let group: DeepgramWord[] = [];
    for (const word of words) {
      if (group.length && word.end - group[0].start > 12) { groups.push(group); group = []; }
      group.push(word);
      if (/[。！？.!?]$/.test(word.punctuated_word ?? word.word ?? '')) { groups.push(group); group = []; }
    }
    if (group.length) groups.push(group);
    return validSegments(groups.map(items => ({ start: items[0].start, end: items[items.length - 1].end, text: joinWords(items.map(item => (item.punctuated_word || item.word || '').trim())) })));
  }

  const transcript = alternative?.transcript?.trim();
  const duration = Number(data.metadata?.duration);
  return transcript && Number.isFinite(duration) && duration > 0 ? [{ start: 0, end: duration, text: transcript }] : [];
}

export function endpointFor(provider: AsrProvider, customEndpoint: string): string {
  if (provider === 'groq') return 'https://api.groq.com/openai/v1/audio/transcriptions';
  if (provider === 'openai') return 'https://api.openai.com/v1/audio/transcriptions';
  if (provider === 'deepgram') return 'https://api.deepgram.com/v1/listen';
  const url = new URL(customEndpoint);
  if (url.protocol !== 'https:') throw new Error('自定义转写接口必须使用 HTTPS');
  return url.href;
}

export async function transcribe(request: AsrRequest): Promise<Segment[]> {
  const bytes = await readFile(request.file);
  const deepgram = request.provider === 'deepgram';
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'audio/wav' }), 'chunk.wav');
  form.set('model', request.model);
  form.set('response_format', 'verbose_json');
  form.set('timestamp_granularities[]', 'segment');
  if (request.language.trim()) form.set('language', request.language.trim());
  let response: Response;
  try {
    const url = new URL(endpointFor(request.provider, request.customEndpoint));
    if (deepgram) {
      url.searchParams.set('model', request.model);
      url.searchParams.set('utterances', 'true');
      if (request.language.trim()) url.searchParams.set('language', request.language.trim());
      else url.searchParams.set('detect_language', 'true');
    }
    response = await fetch(url.href, {
      method: 'POST', headers: deepgram ? { Authorization: `Token ${request.key}`, 'Content-Type': 'audio/wav' } : { Authorization: `Bearer ${request.key}` }, body: deepgram ? bytes : form,
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(180_000)]),
    });
  } catch (error) {
    if (request.signal.aborted) throw error;
    throw new AsrError(`网络请求失败：${(error as Error).message}`, true);
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    const retryAfter = Number(response.headers.get('retry-after'));
    throw new AsrError(`转写接口返回 ${response.status}：${detail}`, response.status === 429 || response.status >= 500, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0);
  }
  const data = await response.json() as DeepgramResponse & { segments?: Array<{ start: number; end: number; text: string }> };
  if (deepgram) return parseDeepgramSegments(data);
  if (!Array.isArray(data.segments)) throw new AsrError('当前模型未返回字幕时间戳，请选择支持分段时间戳的模型', false);
  return validSegments(data.segments);
}

export async function transcribeWithRetry(request: AsrRequest): Promise<Segment[]> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await transcribe(request); }
    catch (error) {
      if (request.signal.aborted) throw error;
      if (!(error instanceof AsrError) || !error.retryable || attempt === 3) throw error;
      const delay = Math.max(error.retryAfterMs, 1000 * 2 ** attempt);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        request.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('任务已取消')); }, { once: true });
      });
    }
  }
  throw new Error('转写失败');
}
