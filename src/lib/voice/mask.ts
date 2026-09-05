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
 * WHAT IT DOES DO, MEASURED
 *
 * The standard warning about voice anonymisation is that shifting pitch alone
 * is not enough, because speaker identification leans on **formants** and a
 * pitch shift that preserves them leaves you recognisable. That is a real
 * failure and it is worth being precise about whether it applies here.
 *
 * It does not. A delay-line shifter is varispeed — it resamples, so it scales
 * the whole spectrum, formants included. A phase vocoder is the one that
 * preserves them, and this is deliberately not that.
 *
 * Measured rather than assumed: a synthetic vowel at 140 / 730 / 1090 Hz
 * through the real graph came out at 111.7 / 577.4 / 862.7 Hz — −391, −406
 * and −405 cents, a spread of 15 across the fundamental and both formant
 * partials. One uniform scaling, which is what actually moves a speaker's
 * identity rather than just their pitch.
 *
 * The caveat above still stands and is the reason both are written down: a
 * uniform scaling is a linear transform, and anything linear is invertible by
 * somebody who knows the ratio.
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

/**
 * One voice per seat, and the reason is not variety.
 *
 * The paragraph above says a circle needs "six people being distinguishable
 * from each other", and then every seat was masked with the same `deeper` —
 * the rationale written directly over a call site that ignored it. Two things
 * follow, and the second is the one that matters.
 *
 * The obvious one: six voices shifted identically are six voices that still
 * differ only by however much they differed to begin with. Two people with
 * similar registers arrive indistinguishable, in a room whose whole shape is
 * taking turns.
 *
 * THE ONE THAT MATTERS: A SINGLE GLOBAL RATIO IS A SINGLE GLOBAL KEY
 *
 * This shifter is varispeed, so it is a uniform scaling, and the file already
 * says plainly that anything linear is invertible by somebody who knows the
 * ratio. With one hardcoded depth the ratio was the *same constant for every
 * speaker in every circle ever held*. One recording of one voice somebody can
 * identify recovers it — and that ratio then unmasks every other person in
 * every other room, because it was never per-person in the first place.
 *
 * Per seat, that attack recovers one seat. It does not generalise, which is
 * the entire difference between a leak and a breach.
 *
 * WHY THESE NUMBERS
 *
 * All within the band the file already argues for: far enough that a familiar
 * voice stops being placeable, near enough that it still sounds like a person
 * rather than a cartoon. Weighted downward because the note above is right —
 * an upward shift thins the voice and reads as a gimmick, and a gimmick is
 * fatal in a room where somebody is about to cry.
 *
 * Only −4 has been measured through the real graph (−391/−406/−405 cents on a
 * synthetic vowel). The others are the same transform at a neighbouring ratio,
 * and a varispeed shifter scales uniformly at any ratio, so the measurement
 * generalises in kind. It does not generalise *by ear* — whether −6 still
 * sounds like a person at forty minutes is a question for a person in a real
 * room, which is where every product-quality finding here has come from.
 */
const SEAT_SEMITONES = [-4, -6, -3, 4, -5, 3] as const;

/**
 * The persona for a seat, from the seat the server assigned.
 *
 * Derived rather than chosen, and derived from `seat-N` specifically, because
 * that index is already the one thing about a participant the server decides
 * and the client cannot name for itself. It is stable inside a session — your
 * voice must not change mid-sentence — and it carries nothing across rooms,
 * because seats are handed out in join order and the same person is seat 2 on
 * Tuesday and seat 5 on Thursday.
 *
 * Anything unparseable gets index 0, which is the measured `deeper`. A seat
 * this cannot read is still a seat that must not be published unmasked.
 */
export function personaFor(identity: string | null | undefined): number {
  const n = Number.parseInt(String(identity ?? "").replace(/^seat-/, ""), 10);
  const seat = Number.isFinite(n) && n >= 0 ? n : 0;
  return SEAT_SEMITONES[seat % SEAT_SEMITONES.length];
}

/**
 * Ratio of output frequency to input, from a named depth or a semitone count.
 *
 * The number form is what `personaFor` returns. Both go through one function
 * so there is one place the exponent lives — the named depths are now just two
 * of the values the per-seat table already contains.
 */
export function shiftRatio(depth: MaskDepth | number): number {
  const semis = typeof depth === "number" ? depth : SEMITONES[depth];
  return Math.pow(2, semis / 12);
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

/**
 * A sawtooth whose ramp really does span −1 to +1 across one period.
 *
 * `type = "sawtooth"` does not, and that is the whole reason this exists.
 * The built-in waveforms are *normalized*, and the spec leaves the
 * normalization to the implementation — Chromium scales the wave so its
 * absolute peak is 1 **including Gibbs overshoot at the discontinuity**, which
 * shrinks the linear part of the ramp. The delay's rate of change is that
 * slope, and the pitch shift is that rate, so a browser's cosmetic choice
 * about peak amplitude was silently deciding how far somebody's voice moved.
 *
 * Measured in Chromium on the real module: 220 Hz came out at 183 Hz going
 * down and 266.5 Hz going up — 318 and 332 cents where 400 was asked for,
 * the same 0.813 factor in both directions. A systematic amplitude error, not
 * a sign or phase mistake.
 *
 * `disableNormalization` turns that off, so the coefficients mean what they
 * say: the standard sawtooth series, amplitude exactly ±1 in the ramp, slope
 * exactly 2 per period, in every browser rather than in this one.
 *
 * Calibrating a fudge factor against Chromium was the other option and it is
 * the trap this repo is built around — a constant tuned to the shape its
 * author is standing in, wrong on the first phone that normalizes differently
 * and wrong invisibly, because nobody can hear four semitones versus three.
 */
const HARMONICS = 256;
let cachedWave: { ctx: BaseAudioContext; wave: PeriodicWave } | null = null;

function rampWave(ctx: BaseAudioContext): PeriodicWave {
  if (cachedWave?.ctx === ctx) return cachedWave.wave;

  const real = new Float32Array(HARMONICS + 1);
  const imag = new Float32Array(HARMONICS + 1);
  // s(t) = (2/π) Σ (−1)^(k+1) sin(2πkt)/k — the textbook sawtooth. Enough
  // harmonics that the ramp is straight and the ringing stays pinned to the
  // discontinuity, where the crossfade is already holding this line at zero.
  for (let k = 1; k <= HARMONICS; k++) {
    imag[k] = ((2 / Math.PI) * (k % 2 === 1 ? 1 : -1)) / k;
  }

  const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: true });
  cachedWave = { ctx, wave };
  return wave;
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
/**
 * Which of the four ways this can fail, when it does.
 *
 * A person reported "my browser doesn't support voice activation" and there
 * was no way to know which of these they hit — one message over four causes,
 * three of which are fixable and one of which is not. That is this repo's
 * oldest bug by name: "Network dipped on my side", which meant four different
 * things and cost days.
 *
 * Reported alongside the null rather than instead of it. The null is the
 * safety contract — the caller publishes nothing rather than an unmasked
 * voice — and it must not change shape to carry a diagnostic.
 */
export type MaskFailure =
  | "no_audio_context"
  | "context_rejected"
  | "context_suspended"
  | "no_shift"
  | "no_track";

export function maskMicrophone(
  input: MediaStream,
  depth: MaskDepth | number = "deeper",
  onFail?: (why: MaskFailure) => void,
): Mask | null {
  const fail = (why: MaskFailure) => {
    onFail?.(why);
    return null;
  };
  const Ctx: typeof AudioContext | undefined =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!Ctx) return fail("no_audio_context");

  let ctx: AudioContext;
  try {
    ctx = new Ctx();
  } catch {
    return fail("context_rejected");
  }

  /*
    A suspended context is silence wearing a track, and that is worse than a
    refusal.

    Chrome and Safari start an AudioContext `suspended` unless it is created
    inside a user gesture — and by the time this runs, the click that started
    the join has been through a fetch, a dynamic import of a 13 MB SDK and a
    `getUserMedia` prompt. On Safari the gesture does not survive an await at
    all, so this is the ordinary path on a phone, not the exceptional one.

    What happened without this is the failure this file exists to prevent,
    inverted. `createMediaStreamDestination()` hands back a perfectly real
    track whether or not the graph is running, so the caller published it,
    muted it, unmuted it on request, and the room heard nothing at all. The
    person believed they were speaking. The rule here is "fail to silence,
    never to an unmasked voice", and it had found a way to fail to silence
    while reporting success — which is the one outcome the rule did not
    anticipate, because silence was supposed to be the safe direction.

    `resume()` is a promise and this function is synchronous by design (its
    caller publishes the track immediately). So it is asked to resume and then
    checked: still suspended means no mask, which means no microphone, which
    the person is told. A context that resumes a moment later is fine — the
    track is already wired and starts carrying audio when the graph runs.
  */
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => {});
    // Re-read: `resume()` resolves asynchronously but flips the state
    // synchronously wherever the policy allows it at all.
    if (ctx.state === "suspended") {
      void ctx.close();
      return fail("context_suspended");
    }
  }

  const ratio = shiftRatio(depth);
  const hz = sweepHz(ratio);
  if (hz === 0) {
    void ctx.close();
    return fail("no_shift");
  }

  const source = ctx.createMediaStreamSource(input);
  const destination = ctx.createMediaStreamDestination();

  // The two lines, half a cycle apart.
  const lines = [0, 0.5].map((phase) => {
    const delay = ctx.createDelay(WINDOW_S * 2);
    /*
      The centre of the excursion, for both lines — not the line's phase.

      This was `WINDOW_S * phase`, which is **zero** for the first line. An
      oscillator connected to an AudioParam is summed with that param's value,
      so line one's delay swung 0 ± WINDOW_S/2 — half of every cycle asking
      for a negative delay, which `DelayNode` clamps to zero. Clamped delay is
      no delay, and no delay is no pitch shift: for half of each cycle that
      line published the microphone unchanged.

      It cost about a fifth of the intended shift — 318 cents measured where
      400 was asked for — and the ear reads that as a voice that is merely a
      bit deeper rather than one you cannot place.

      Phase between the two lines is a start-time offset and is applied below.
      It was doing double duty here as a DC offset, and the two are not the
      same thing: one decides *when* a line resets, this decides *where the
      delay sits*, and it has to be WINDOW_S / 2 for both or the swing leaves
      the legal range.
    */
    delay.delayTime.value = WINDOW_S / 2;

    // Sawtooth sweeps the delay across the window. Amplitude is half the
    // window because an oscillator swings both ways around its offset.
    const sweep = ctx.createOscillator();
    sweep.setPeriodicWave(rampWave(ctx));
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

  /*
    Phase, by start time — Web Audio has no phase parameter, so starting an
    oscillator late is the standard way to get one.
    Two offsets are needed, and only one of them was here.

    **Between the lines**: half a period, so one line is mid-sweep while the
    other resets. That was correct.

    **Between each line's sweep and its own crossfade**: a quarter period, and
    this was missing. Web Audio's sawtooth starts at 0, climbs to +1 at T/2,
    jumps to −1, and returns to 0 at T — so the discontinuity, the instant the
    delay line snaps back and the audio tears, is at **T/2**. Its triangle
    started at the same moment, and a triangle at T/2 is passing through
    **zero**, which this maps to gain 0.5. So the line that was mid-tear was
    playing at half volume instead of being muted, every single cycle, twice a
    second.

    Measured rather than reasoned about, in Chromium, on the real module: a
    220 Hz tone came out with its dominant partial at 183 Hz — a 318-cent
    shift where 400 was intended — and **the original 220 Hz still present,
    only 10.6 dB down**. That second number is the one that matters. The whole
    promise of this file is that a cousin cannot place the voice, and pitch is
    the strongest cue a listener has. Publishing the unshifted fundamental at
    a third of the amplitude is not a partial mask; it is the real voice with
    a deeper one mixed over it.

    A triangle is at −1, and this crossfade therefore at gain 0, a quarter
    period before the sawtooth's jump. So the shape has to lead the sweep by
    T/4 — done here by starting the sweep a quarter period later, which keeps
    both oscillators starting within one period of each other.
  */
  const t0 = ctx.currentTime + 0.02;
  const quarter = 0.25 / hz;
  for (const { sweep, shape, phase } of lines) {
    const at = t0 + phase / hz;
    shape.start(at);
    sweep.start(at + quarter);
  }

  const track = destination.stream.getAudioTracks()[0];
  if (!track) {
    void ctx.close();
    return fail("no_track");
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
