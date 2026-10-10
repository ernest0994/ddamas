let audio: AudioContext | null = null;

function context(): AudioContext | null {
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  audio = audio ?? new Ctx();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

/**
 * The first sounds: short sine tones. Left in place so we can switch back
 * without rewriting the calls. A crown cap on wood is not a pure tone.
 */
export function toneBlip(freq: number) {
  const ctx = context();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  gain.gain.value = 0.045;
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.09);
  osc.stop(ctx.currentTime + 0.1);
}

function tick(ctx: AudioContext, when: number, bright: number, body: number, level: number) {
  const len = Math.floor(ctx.sampleRate * 0.07);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const metal = ctx.createBiquadFilter();
  metal.type = "bandpass";
  metal.frequency.value = bright;
  metal.Q.value = 8;
  const wood = ctx.createBiquadFilter();
  wood.type = "lowpass";
  wood.frequency.value = body;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(level, when + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.06);
  src.connect(metal);
  metal.connect(wood);
  wood.connect(gain);
  gain.connect(ctx.destination);
  src.start(when);
  src.stop(when + 0.07);
}

/**
 * Synthesized crown-cap fallback: bright metal tick, short wooden body, a bounce.
 * Kept so the game still speaks if the recordings have not loaded.
 */
export function capHit(kind: "step" | "take" | "crown") {
  const ctx = context();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === "step") {
    tick(ctx, now, 2400, 220, 0.22);
    tick(ctx, now + 0.045, 1800, 160, 0.08);
  } else if (kind === "take") {
    tick(ctx, now, 2800, 180, 0.28);
    tick(ctx, now + 0.05, 2100, 150, 0.16);
    tick(ctx, now + 0.11, 1600, 140, 0.08);
  } else {
    tick(ctx, now, 3200, 240, 0.26);
    tick(ctx, now + 0.08, 1900, 200, 0.14);
  }
}

/**
 * Real hits, cut from CC0 recordings:
 * - step / take: "Metal Bottle cap drops" by goldenkitty23 (Freesound 816751, CC0)
 * - crown: that tick layered on "Dropping a bottle cap" by 14G_Panska_Kaminkova_A (Freesound 419974, CC0)
 * Stock slow-motion videos of a cap falling on wood (PIXTA, Envato) have no usable audio.
 */
const files = {
  step: "/sfx/cap-step.mp3",
  take: "/sfx/cap-take.mp3",
  crown: "/sfx/cap-crown.mp3",
} as const;

const buffers: Partial<Record<keyof typeof files, AudioBuffer>> = {};
let loading = false;

export function primeCaps() {
  const ctx = context();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  if (loading) return;
  loading = true;
  for (const kind of Object.keys(files) as (keyof typeof files)[]) {
    void fetch(files[kind])
      .then((res) => res.arrayBuffer())
      .then((raw) => ctx.decodeAudioData(raw))
      .then((decoded) => {
        buffers[kind] = decoded;
      })
      .catch(() => {});
  }
}

/** Play a recorded cap-on-wood hit. Falls back to capHit until the file decodes. */
export function playCap(kind: "step" | "take" | "crown") {
  const ctx = context();
  if (!ctx) return;
  const buf = buffers[kind];
  if (!buf) {
    capHit(kind);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.94 + Math.random() * 0.12;
  const gain = ctx.createGain();
  gain.gain.value = kind === "step" ? 0.7 : 0.88;
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}
