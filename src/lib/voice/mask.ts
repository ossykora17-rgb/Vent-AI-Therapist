/**
 * A voice that is not recognisably yours.
 *
 * Circles are meant to be a voice room, and voice breaks the one promise this
 * product cannot break. Everything else here is anonymous by construction —
 * no name, no email, a random id made on the device. Then you open a
 * microphone and hand over a biometric. A cousin, a colleague, anybody who
 * has heard you on a call knows you in four words.
 *
 * That is not a hypothetical for the person this is built for. The whole
 * premise is saying the thing you cannot say out loud yet, and most of what
 * people cannot say out loud is about somebody who would recognise the voice
 * saying it. A Twitter Space and a WhatsApp group call both attach your
 * identity on purpose — correct for them, fatal here. There is nothing to
 * copy, because nobody in this category has had to solve it.
 *
 * So the microphone is shifted before it is ever published. Not scrambled
 * into a robot — that is unbearable to listen to for forty minutes and people
 * leave. Shifted far enough that recognition fails and close enough that grief
 * still sounds like grief. A voice you would not place, still carrying
 * whatever it is carrying.
 *
 * WHAT THIS IS NOT
 *
 * It is not a guarantee. A determined listener with a recording, a reference
 * sample and the right software can undo a fixed pitch shift, and somebody
 * who already suspects who you are will hear cadence, vocabulary and the
 * specifics of the story regardless. It raises the cost of recognition from
 * "instant and accidental" to "deliberate and technical", which is the honest
 * claim and the only one the UI is allowed to make.
 *
 * HOW IT WORKS
 *
 * The classic dual delay-line pitch shifter, built from standard Web Audio
 * nodes only — no AudioWorklet file to serve, no dependency, nothing to load
 * before somebody can speak.
 *
 * Two delay lines run in parallel. Each has its delay time swept linearly by a
 * sawtooth; a delay that shortens at a constant rate plays its input back
 * faster, which is a pitch shift. A single line would click at every sawtooth
 * reset, so there are two, half a cycle apart, crossfaded by triangle gains so
 * whichever line is mid-jump is the one turned down.
 *
 * Every node here is a plain DelayNode, GainNode or OscillatorNode. The one
 * thing worth knowing is that `delayTime` is an AudioParam, so an oscillator
 * can be connected straight to it — that is what does the work.
 */

/** How far the voice moves. Below 1 is deeper, above is higher. */
export type MaskDepth = "deeper" | "higher";

/**
 * Semitone shifts, chosen by ear rather than by maths.
 *
 * Four semitones is roughly where a familiar voice stops being placeable. Much
 * less and a person who knows you still knows you; much more and everyone in
 * the room sounds like the same cartoon, which destroys the thing a circle is
 * for — six people being distinguishable from each other.
 *
 * Down is the default. A downward shift keeps consonants intact and sounds
 * like a person; upward shifts thin the voice and read as a gimmick, and a
 * gimmick is fatal in a room where somebody is about to cry.
 */
const SEMITONES: Record<MaskDepth, number> = {
  deeper: -4,
  higher: 4,
};

/** Ratio of output frequency to input. 2^(n/12). */
export function shiftRatio(depth: MaskDepth): number {
  return Math.pow(2, SEMITONES[depth] / 12);
}

/**
 * Length of one sweep, in seconds.
 *
 * This is the trade the whole effect turns on. Long windows sound smoother and
 * add audible latency; short windows are tight but warble. 100ms sits where
 * speech stays intelligible and the delay is under what anybody notices in
 * conversation.
 */
export const WINDOW_S = 0.1;

/**
 * How often each delay line resets, in Hz.
 *
 * A delay sweeping across `WINDOW_S` at the rate needed to produce `ratio`
 * takes `WINDOW_S / |1 - ratio|` seconds to cross it, so it resets that many
 * times a second. Exported because it is the number worth asserting: get it
 * wrong and the shift is silently the wrong interval, which is exactly the
 * kind of bug you cannot hear until somebody is recognised.
 */
export function sweepHz(ratio: number): number {
  const distance = Math.abs(1 - ratio);
  // A ratio of exactly 1 is no shift at all — no sweep, and no division by 0.
  return distance < 1e-6 ? 0 : distance / WINDOW_S;
}

export interface Mask {
  /** The track to publish in place of the raw microphone. */
  track: MediaStreamTrack;
  /** Releases the audio graph. Safe to call twice. */
  stop: () => void;
}

/**
 * Build the masked track from a live microphone stream.
 *
 * Returns null when the browser has no usable AudioContext — an old WebView,
 * or one where autoplay policy has not been satisfied. Null means the caller
 * publishes nothing and says so, rather than publishing the real voice: the
 * failure mode of this file has to be silence, never an unmasked person who
 * believed they were masked. That is the whole rule here, and it is the
 * difference between a bug and a betrayal.
 */
export function maskMicrophone(
  input: MediaStream,
  depth: MaskDepth = "deeper",
): Mask | null {
  const Ctx: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!Ctx) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }

  const ratio = shiftRatio(depth);
  const hz = sweepHz(ratio);
  if (hz === 0) {
    void ctx.close();
    return null;
  }

  const source = ctx.createMediaStreamSource(input);
  const destination = ctx.createMediaStreamDestination();

  // The two lines, half a cycle apart.
  const lines = [0, 0.5].map((phase) => {
    const delay = ctx.createDelay(WINDOW_S * 2);
    // Start each line in the middle of its own sweep so neither begins at a
    // discontinuity.
    delay.delayTime.value = WINDOW_S * phase;

    // Sawtooth sweeps the delay across the window. Amplitude is half the
    // window because an oscillator swings both ways around its offset.
    const sweep = ctx.createOscillator();
    sweep.type = "sawtooth";
    sweep.frequency.value = hz;
    const sweepDepth = ctx.createGain();
    // Downward shift needs a lengthening delay, upward a shortening one.
    sweepDepth.gain.value = (ratio < 1 ? 1 : -1) * (WINDOW_S / 2);
    sweep.connect(sweepDepth).connect(delay.delayTime);

    // Triangle crossfade, mapped from the oscillator's -1..1 into 0..1, so the
    // line that is mid-reset is the one at zero gain.
    const fade = ctx.createGain();
    fade.gain.value = 0.5;
    const shape = ctx.createOscillator();
    shape.type = "triangle";
    shape.frequency.value = hz;
    const shapeDepth = ctx.createGain();
    shapeDepth.gain.value = 0.5;
    shape.connect(shapeDepth).connect(fade.gain);

    source.connect(delay).connect(fade).connect(destination);
    return { sweep, shape, phase };
  });

  // Phase offset by start time — half a period for the second line. Web Audio
  // has no phase parameter, and starting late is the standard way to get one.
  const t0 = ctx.currentTime + 0.02;
  for (const { sweep, shape, phase } of lines) {
    const at = t0 + phase / hz;
    sweep.start(at);
    shape.start(at);
  }

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    void ctx.close();
    return null;
  }

  let stopped = false;
  return {
    track,
    stop() {
      if (stopped) return;
      stopped = true;
      for (const { sweep, shape } of lines) {
        try {
          sweep.stop();
          shape.stop();
        } catch {
          /* already stopped */
        }
      }
      try {
        source.disconnect();
      } catch {
        /* already disconnected */
      }
      void ctx.close();
    },
  };
}
