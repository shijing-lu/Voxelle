import test from 'node:test';
import assert from 'node:assert/strict';
import { chunkCount, chunkRange, mergeChunkSegments } from '../main/timeline.js';
import { renderOutputs } from '../main/subtitles.js';

test('9 minute chunking stays below a 25 MB WAV upload limit', () => {
  assert.equal(chunkCount(1081), 3);
  assert.deepEqual(chunkRange(0, 1081), { start: 0, end: 540, nominalStart: 0 });
  assert.deepEqual(chunkRange(1, 1081), { start: 539, end: 1080, nominalStart: 540 });
  assert.deepEqual(chunkRange(2, 1081), { start: 1079, end: 1081, nominalStart: 1080 });
  assert.ok(541 * 16000 * 2 < 25_000_000);
});

test('overlap segments are shifted and previous-side duplicates are dropped', () => {
  const previous = [{ start: 538.4, end: 539.9, text: '上一个片段' }];
  const current = [{ start: 0, end: 0.8, text: '上一个片段' }, { start: 1.2, end: 2.5, text: '下一个片段' }];
  assert.deepEqual(mergeChunkSegments(previous, current, 539, 540), [previous[0], { start: 540.2, end: 541.5, text: '下一个片段' }]);
});

test('TXT, SRT and VTT export keep text and absolute timestamps', () => {
  const result = renderOutputs([{ start: 540.2, end: 542.35, text: '你好，世界' }, { start: 542.5, end: 544, text: 'Hello.' }]);
  assert.equal(result.txt, '你好，世界\nHello.\n');
  assert.match(result.srt, /00:09:00,200 --> 00:09:02,350/);
  assert.match(result.vtt, /WEBVTT\n\n00:09:00\.200 --> 00:09:02\.350/);
  assert.match(result.srt, /2\n00:09:02,500/);
});
