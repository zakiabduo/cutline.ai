import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCropRect,
  chunkWordsForDisplay,
  clampClipRange,
  extractYouTubeVideoId,
  formatShortDuration,
  formatSrtTimestamp,
  formatTimecode,
  formatVttTimestamp,
  generateSrt,
  generateVtt,
  getActiveCaptionAtTime,
  getActiveSceneAtTime,
  getActiveWordIndex,
  splitCaptionIntoWords,
} from './shortsEngine';
import type { CaptionSegment, SceneBoundary } from '../types/studio';

test('extractYouTubeVideoId parses standard, short, shorts, and embed URLs', () => {
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    'dQw4w9WgXcQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtu.be/jNQXAC9IVRw?t=42'),
    'jNQXAC9IVRw'
  );
  assert.equal(
    extractYouTubeVideoId('https://youtube.com/shorts/aqz-KE-bpKQ'),
    'aqz-KE-bpKQ'
  );
  assert.equal(
    extractYouTubeVideoId('https://www.youtube.com/embed/M7lc1UVf-VE'),
    'M7lc1UVf-VE'
  );
  assert.equal(extractYouTubeVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(extractYouTubeVideoId('https://vimeo.com/123456'), null);
  assert.equal(extractYouTubeVideoId('not a url'), null);
});

test('timecode and subtitle timestamp formatters format accurately', () => {
  assert.equal(formatTimecode(0), '00:00.0');
  assert.equal(formatTimecode(75.4), '01:15.4');
  assert.equal(formatShortDuration(38), '38s');
  assert.equal(formatShortDuration(90), '1m 30s');
  assert.equal(formatSrtTimestamp(65.25), '00:01:05,250');
  assert.equal(formatVttTimestamp(65.25), '00:01:05.250');
});

test('splitCaptionIntoWords distributes monotonic non-overlapping timings', () => {
  const words = splitCaptionIntoWords('Watch how fast this cuts', 10.0, 12.5);
  assert.equal(words.length, 5);
  assert.equal(words[0].start, 10);
  assert.equal(words[words.length - 1].end, 12.5);
  for (let i = 0; i < words.length - 1; i++) {
    assert.ok(words[i].end <= words[i + 1].start + 0.001);
  }
});

test('getActiveCaptionAtTime and getActiveWordIndex resolve current segment and word', () => {
  const captions: CaptionSegment[] = [
    {
      id: 'c1',
      start: 5,
      end: 8,
      text: 'First hook line',
      words: splitCaptionIntoWords('First hook line', 5, 8),
    },
    {
      id: 'c2',
      start: 8.2,
      end: 11,
      text: 'Second payoff line',
      words: splitCaptionIntoWords('Second payoff line', 8.2, 11),
    },
  ];

  const active = getActiveCaptionAtTime(captions, 6.4);
  assert.equal(active?.id, 'c1');
  const wordIdx = getActiveWordIndex(active, 6.4);
  assert.ok(wordIdx >= 0 && wordIdx < 3);

  assert.equal(getActiveCaptionAtTime(captions, 15), null);
});

test('chunkWordsForDisplay slices caption words cleanly into line windows', () => {
  const words = splitCaptionIntoWords('one two three four five six seven', 0, 7);
  const firstWindow = chunkWordsForDisplay(words, 1, 3);
  assert.deepEqual(
    firstWindow.words.map((w) => w.text),
    ['one', 'two', 'three']
  );
  assert.equal(firstWindow.startIdx, 0);

  const secondWindow = chunkWordsForDisplay(words, 4, 3);
  assert.deepEqual(
    secondWindow.words.map((w) => w.text),
    ['four', 'five', 'six']
  );
  assert.equal(secondWindow.startIdx, 3);
});

test('generateSrt and generateVtt offset cue timestamps relative to clipStart', () => {
  const captions: CaptionSegment[] = [
    {
      id: 'c1',
      start: 12,
      end: 14.5,
      text: 'Hook starts now',
      words: [],
    },
    {
      id: 'c2',
      start: 14.5,
      end: 18,
      text: 'Watch the scene cut',
      words: [],
    },
  ];

  const srt = generateSrt(captions, 12);
  assert.ok(srt.includes('1\n00:00:00,000 --> 00:00:02,500\nHook starts now'));
  assert.ok(srt.includes('2\n00:00:02,500 --> 00:00:06,000\nWatch the scene cut'));

  const vtt = generateVtt(captions, 12);
  assert.ok(vtt.startsWith('WEBVTT\n\n'));
  assert.ok(vtt.includes('00:00:00.000 --> 00:00:02.500\nHook starts now'));
});

test('clampClipRange enforces minimum clip length and source duration bounds', () => {
  assert.deepEqual(clampClipRange(-4, 2, 120, 5), { start: 0, end: 5 });
  assert.deepEqual(clampClipRange(118, 125, 120, 5), { start: 115, end: 120 });
  assert.deepEqual(clampClipRange(20, 55, 120, 5), { start: 20, end: 55 });
});

test('getActiveSceneAtTime and calculateCropRect track 9:16 speaker focus', () => {
  const scenes: SceneBoundary[] = [
    {
      id: 's1',
      start: 0,
      end: 10,
      label: 'Host Left',
      cutType: 'speaker-shift',
      cropFocusX: 15,
      energy: 'high',
    },
    {
      id: 's2',
      start: 10,
      end: 20,
      label: 'Guest Right',
      cutType: 'climax',
      cropFocusX: 85,
      energy: 'high',
    },
  ];
  assert.equal(getActiveSceneAtTime(scenes, 12)?.id, 's2');

  const leftCrop = calculateCropRect(1920, 1080, 9 / 16, 0);
  const rightCrop = calculateCropRect(1920, 1080, 9 / 16, 100);
  assert.equal(leftCrop.sx, 0);
  assert.equal(leftCrop.sw, 608);
  assert.equal(leftCrop.sh, 1080);
  assert.equal(rightCrop.sx, 1920 - 608);
});
