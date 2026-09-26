/**
 * Voice notes — the half of a group chat that is not typing.
 *
 * The founder's brief for circles was "a WhatsApp group with our own twist",
 * and in a Nigerian WhatsApp group the voice is not a call, it is a note: you
 * hold the phone up, say it, and it waits in the thread until the others are
 * there to hear it. That matters more here than anywhere, because the live
 * voice room needs two people in it at the same moment and fourteen of the
 * first sixteen circles never had a second person at all. A note needs nobody
 * to be listening yet.
 *
 * The twist is the mask. A note is recorded from the same pitch-shifted graph
 * the live voice publishes (`mask.ts`), seat by seat, so the voice that
 * reaches the server is already not recognisably yours — the raw microphone
 * never leaves the phone in either mode.
 *
 * WAV, deliberately, and not whatever container the browser's own recorder
 * would rather hand over — those differ by browser, and a note recorded on one
 * phone has to play on every other. 16-bit PCM is the one format this file
 * writes byte by byte, so the server can check it byte by byte (`checkWav`)
 * and keep exactly the samples it checked. Whether every phone plays it is
 * read on phones, not asserted here. The cost is size — 32 KB a second at
 * 16 kHz — which is why the length is capped where a typed share is (900
 * characters is about a minute of speech) and the count per circle is capped
 * too.
 *
 * Everything here is pure, so the server validates with the same code the
 * phone encodes with, and the suite can run both halves.
 */

/** 16 kHz: wideband speech, and the rate speech tools expect. */
export const NOTE_RATE = 16_000;
/** About as long as a typed share can be. */
export const NOTE_MAX_MS = 60_000;
/** Shorter than this is a tap that meant nothing. */
export const NOTE_MIN_MS = 700;
/** A minute of mono 16-bit at the note rate, a second of slack, and a header. */
export const NOTE_MAX_BYTES = 44 + ((NOTE_MAX_MS + 1_000) / 1_000) * NOTE_RATE * 2;
/** Per seat per circle: a note every four minutes for the whole forty-five. */
export const NOTES_PER_SEAT = 12;
/** Per circle, so one room cannot fill a free database for everybody else. */
export const NOTES_PER_CIRCLE = 40;

/**
 * Mono float samples at `inRate` to 16-bit samples at `outRate`.
 *
 * Box-averaged rather than picked: taking every third sample of a 48 kHz
 * stream folds everything above 8 kHz back into the voice as hiss. Averaging
 * each output sample's own window is a crude low-pass, and crude is enough for
 * speech that has already been pitched down.
 */
export function downsample(chunks: Float32Array[], inRate: number, outRate = NOTE_RATE): Int16Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const input = new Float32Array(total);
  let at = 0;
  for (const c of chunks) {
    input.set(c, at);
    at += c.length;
  }
  const ratio = inRate / outRate;
  const length = Math.floor(total / ratio);
  const out = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    const from = Math.floor(i * ratio);
    const to = Math.min(total, Math.max(from + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = from; j < to; j++) sum += input[j];
    const v = Math.max(-1, Math.min(1, sum / (to - from)));
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

/** The 44 bytes in front of `dataBytes` of 16-bit mono PCM at `rate`. */
function writeHeader(bytes: Uint8Array, dataBytes: number, rate: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, dataBytes, true);
}

/** 16-bit mono PCM samples as a WAV file. */
export function encodeWav(samples: Int16Array, rate = NOTE_RATE): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length * 2);
  writeHeader(bytes, samples.length * 2, rate);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, samples[i], true);
  return bytes;
}

export type WavVerdict =
  | { ok: true; durationMs: number; wav: Uint8Array<ArrayBuffer> }
  | { ok: false; why: "too_big" | "not_wav" | "not_the_note_format" | "too_short" };

/**
 * Is this the note this product records, and how long is it — decided by the
 * server from the bytes, never taken from the phone's word for it.
 *
 * Anything that is not mono 16-bit PCM at the note rate is refused rather than
 * stored: a server that keeps whatever it is handed is a free file host with a
 * circle attached, and a format this code did not write is one every listener
 * may not be able to play.
 *
 * And what is kept is `wav`, never the bytes that arrived: the validated
 * samples in a header this function wrote. A WAV file can carry chunks beside
 * the sound — a LIST of tags naming the device or the app that made it — and
 * bytes after its end, and none of that is somebody's voice. The server keeps
 * the voice and nothing that travelled with it.
 */
export function checkWav(bytes: Uint8Array): WavVerdict {
  if (bytes.length > NOTE_MAX_BYTES) return { ok: false, why: "too_big" };
  const word = (at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (bytes.length < 44 || word(0) !== "RIFF" || word(8) !== "WAVE") return { ok: false, why: "not_wav" };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: { pcm: boolean; channels: number; rate: number; bits: number } | null = null;
  let dataBytes = -1;
  let dataAt = -1;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = word(at);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      // A PCM format chunk is sixteen bytes; shorter is a file lying about
      // where its sound starts.
      if (size < 16 || at + 24 > bytes.length) return { ok: false, why: "not_wav" };
      format = {
        pcm: view.getUint16(at + 8, true) === 1,
        channels: view.getUint16(at + 10, true),
        rate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      };
    } else if (id === "data") {
      dataAt = at + 8;
      // Whole samples only: an odd trailing byte is half of nothing.
      dataBytes = Math.min(size, bytes.length - dataAt);
      dataBytes -= dataBytes % 2;
      break;
    }
    at += 8 + size + (size % 2);
  }
  if (!format || dataBytes < 0) return { ok: false, why: "not_wav" };
  if (!format.pcm || format.channels !== 1 || format.bits !== 16 || format.rate !== NOTE_RATE) {
    return { ok: false, why: "not_the_note_format" };
  }
  const durationMs = Math.round((dataBytes / (NOTE_RATE * 2)) * 1000);
  if (durationMs < NOTE_MIN_MS) return { ok: false, why: "too_short" };
  // No second limit on length: the byte cap is it. The sound starts at byte 44
  // at the earliest, so NOTE_MAX_BYTES holds at most a minute and a second —
  // and two limits on one quantity are two answers waiting to disagree.
  const wav = new Uint8Array(44 + dataBytes);
  writeHeader(wav, dataBytes, NOTE_RATE);
  wav.set(bytes.subarray(dataAt, dataAt + dataBytes), 44);
  return { ok: true, durationMs, wav };
}

/**
 * A request body, read to at most `max` bytes — null past that.
 *
 * `content-length` is the sender's word for its own size and a chunked upload
 * does not give one, so the cap is held on the bytes as they arrive: the read
 * stops, and the rest is never pulled into memory.
 */
export async function readNote(
  body: ReadableStream<Uint8Array> | null,
  max = NOTE_MAX_BYTES,
): Promise<Uint8Array | null> {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.byteLength;
  }
  return out;
}

/** 0:07, 1:00 — how a phone writes a note's length. */
export function noteLength(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Said by the phone before it bothers uploading, and by the server if one
 * arrives anyway — one sentence, one home (check 81).
 */
export const NOTE_TOO_SHORT = "That was too short to send. Say a little more before you tap send.";
