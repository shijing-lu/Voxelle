import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCaption, parseVideoLink } from '../main/platform.js';

test('single YouTube and Bilibili links are recognized', () => {
  assert.deepEqual(parseVideoLink('https://youtu.be/dQw4w9WgXcQ?t=3'), { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', platform: 'youtube', videoId: 'dQw4w9WgXcQ' });
  assert.equal(parseVideoLink('https://www.bilibili.com/video/BV1xx411c7mD').platform, 'bilibili');
  assert.equal(parseVideoLink('https://b23.tv/abc123').platform, 'bilibili');
  assert.throws(() => parseVideoLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL123'), /播放列表/);
  assert.throws(() => parseVideoLink('https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ'), /只支持/);
});

test('VTT captions preserve timestamps', () => {
  const parsed = parseCaption('WEBVTT\n\n00:00:01.000 --> 00:00:02.500\n你好\n\n00:00:03.000 --> 00:00:04.000\nHello', '.vtt');
  assert.deepEqual(parsed.segments, [{ start: 1, end: 2.5, text: '你好' }, { start: 3, end: 4, text: 'Hello' }]);
  assert.equal(parsed.timed, true);
});

test('untimed JSON captions provide text without invented timestamps', () => {
  const parsed = parseCaption(JSON.stringify({ body: [{ content: '第一句' }, { content: '第二句' }] }), '.json');
  assert.equal(parsed.timed, false);
  assert.equal(parsed.text, '第一句\n第二句');
});
