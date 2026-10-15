/** Music timing shared by the preview's <audio> element and the exported soundtrack. */

export const FADE_IN_S = 1.5;
export const FADE_OUT_S = 3;

/** Volume multiplier (0..1) at video time `t`: fade in at the start, fade out at the end. */
export function musicGain(t: number, videoDuration: number): number {
  if (t <= 0 || t >= videoDuration) return 0;
  const fadeIn = Math.min(1, t / FADE_IN_S);
  const fadeOut = Math.min(1, (videoDuration - t) / FADE_OUT_S);
  return Math.min(fadeIn, fadeOut);
}

/** Position in the music at video time `t`; music shorter than the video loops. */
export function musicOffset(t: number, musicDuration: number): number {
  if (musicDuration <= 0) return 0;
  return ((t % musicDuration) + musicDuration) % musicDuration;
}

/**
 * Renders the video's soundtrack: the music looped to the video's length with the fades, at
 * `volume`. Uses an OfflineAudioContext, so it is exact and faster than real time.
 */
export async function renderSoundtrack(
  music: AudioBuffer,
  videoDuration: number,
  volume: number,
  sampleRate = 48_000,
): Promise<AudioBuffer> {
  const length = Math.ceil(videoDuration * sampleRate);
  const ctx = new OfflineAudioContext(2, length, sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = music;
  source.loop = true;
  const gain = ctx.createGain();
  const fadeIn = Math.min(FADE_IN_S, videoDuration / 2);
  const fadeOutStart = Math.max(fadeIn, videoDuration - FADE_OUT_S);
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(volume, fadeIn);
  gain.gain.setValueAtTime(volume, fadeOutStart);
  gain.gain.linearRampToValueAtTime(0, videoDuration);
  source.connect(gain).connect(ctx.destination);
  source.start(0);
  return ctx.startRendering();
}
