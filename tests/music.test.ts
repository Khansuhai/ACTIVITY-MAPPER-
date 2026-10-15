import { describe, expect, it } from 'vitest';
import { FADE_IN_S, FADE_OUT_S, musicGain, musicOffset } from '../src/audio/mix';

describe('musicGain', () => {
  it('fades in, holds full volume, then fades out', () => {
    expect(musicGain(0, 60)).toBe(0);
    expect(musicGain(FADE_IN_S / 2, 60)).toBeCloseTo(0.5, 9);
    expect(musicGain(30, 60)).toBe(1);
    expect(musicGain(60 - FADE_OUT_S / 2, 60)).toBeCloseTo(0.5, 9);
    expect(musicGain(60, 60)).toBe(0);
  });

  it('is silent outside the video', () => {
    expect(musicGain(-1, 60)).toBe(0);
    expect(musicGain(61, 60)).toBe(0);
  });
});

describe('musicOffset', () => {
  it('loops music that is shorter than the video', () => {
    expect(musicOffset(10, 30)).toBe(10);
    expect(musicOffset(45, 30)).toBe(15);
    expect(musicOffset(90, 30)).toBe(0);
    expect(musicOffset(5, 0)).toBe(0);
  });
});
