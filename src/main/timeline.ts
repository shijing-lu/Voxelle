import type { Segment } from '../shared/types.js';

export const CHUNK_SECONDS = 540;

export function chunkCount(duration: number): number { return Math.ceil(duration / CHUNK_SECONDS); }

export function chunkRange(index: number, duration: number): { start: number; end: number; nominalStart: number } {
  const nominalStart = index * CHUNK_SECONDS;
  return { start: Math.max(0, nominalStart - (index > 0 ? 1 : 0)), end: Math.min(duration, nominalStart + CHUNK_SECONDS), nominalStart };
}

export function mergeChunkSegments(previous: Segment[], current: Segment[], chunkStart: number, nominalStart: number): Segment[] {
  const shifted = current.map(segment => ({ ...segment, start: segment.start + chunkStart, end: segment.end + chunkStart }));
  return [...previous, ...shifted.filter(segment => (segment.start + segment.end) / 2 >= nominalStart)].sort((a, b) => a.start - b.start);
}
