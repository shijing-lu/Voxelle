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

export function endpointFor(provider: AsrProvider, customEndpoint: string): string {
  if (provider === 'groq') return 'https://api.groq.com/openai/v1/audio/transcriptions';
  if (provider === 'openai') return 'https://api.openai.com/v1/audio/transcriptions';
  const url = new URL(customEndpoint);
  if (url.protocol !== 'https:') throw new Error('自定义转写接口必须使用 HTTPS');
  return url.href;
}

export async function transcribe(request: AsrRequest): Promise<Segment[]> {
  const bytes = await readFile(request.file);
  const form = new FormData();
  form.set('file', new Blob([bytes], { type: 'audio/wav' }), 'chunk.wav');
  form.set('model', request.model);
  form.set('response_format', 'verbose_json');
  form.set('timestamp_granularities[]', 'segment');
  if (request.language.trim()) form.set('language', request.language.trim());
  let response: Response;
  try {
    response = await fetch(endpointFor(request.provider, request.customEndpoint), {
      method: 'POST', headers: { Authorization: `Bearer ${request.key}` }, body: form,
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
  const data = await response.json() as { segments?: Array<{ start: number; end: number; text: string }> };
  if (!Array.isArray(data.segments)) throw new AsrError('当前模型未返回字幕时间戳，请选择支持 verbose_json 分段的模型', false);
  return data.segments.map(segment => ({ start: Number(segment.start), end: Number(segment.end), text: String(segment.text ?? '').trim() }))
    .filter(segment => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end >= segment.start && segment.text.length > 0);
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
