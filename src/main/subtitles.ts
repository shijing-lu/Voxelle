import type { Segment } from '../shared/types.js';

function time(value: number, separator: ',' | '.'): string {
  const milliseconds = Math.max(0, Math.round(value * 1000));
  const h = Math.floor(milliseconds / 3_600_000);
  const m = Math.floor(milliseconds / 60_000) % 60;
  const s = Math.floor(milliseconds / 1000) % 60;
  const ms = milliseconds % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${separator}${String(ms).padStart(3, '0')}`;
}

export function renderOutputs(segments: Segment[]): { txt: string; srt: string; vtt: string } {
  const usable = segments.filter(s => s.text.trim() && s.end >= s.start).sort((a, b) => a.start - b.start);
  const txt = usable.map(s => s.text.trim()).join('\n') + '\n';
  const srt = usable.map((s, i) => `${i + 1}\n${time(s.start, ',')} --> ${time(s.end, ',')}\n${s.text.trim()}\n`).join('\n');
  const vtt = `WEBVTT\n\n${usable.map(s => `${time(s.start, '.')} --> ${time(s.end, '.')}\n${s.text.trim()}\n`).join('\n')}`;
  return { txt, srt, vtt };
}
