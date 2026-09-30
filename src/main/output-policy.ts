import type { OutputFormat } from '../shared/types.js';

export const ALL_OUTPUT_FORMATS: OutputFormat[] = ['txt', 'srt', 'vtt'];

export class UntimedCaptionError extends Error {
  constructor() { super('字幕只有纯文本，没有时间轴；请勾选 TXT 后重试。不会为补时间轴额外调用 ASR。'); }
}

export function checkedFormats(formats: OutputFormat[]): OutputFormat[] {
  if (!Array.isArray(formats) || formats.length < 1 || formats.length > 3 || formats.some(format => !ALL_OUTPUT_FORMATS.includes(format))) throw new Error('请至少选择一种有效的输出格式');
  return ALL_OUTPUT_FORMATS.filter(format => formats.includes(format));
}

export function captionOutputPlan(formats: OutputFormat[], timed: boolean): { available: OutputFormat[]; warning?: string } {
  const requested = checkedFormats(formats);
  if (timed) return { available: requested };
  if (!requested.includes('txt')) throw new UntimedCaptionError();
  return { available: ['txt'], warning: requested.some(format => format !== 'txt') ? '字幕没有时间轴，仅生成 TXT；SRT/VTT 未生成。' : undefined };
}
