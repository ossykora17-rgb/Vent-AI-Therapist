import { maskMicrophone, whenRunning } from "@/lib/voice/mask";
import { downsample, encodeWav, NOTE_RATE } from "@/lib/voice/note";

/**
 * A voice note, recorded from the mask and never from the microphone.
 *
 * `ctx` must come from `audioContextInGesture()` as the first line of the tap
 * that started recording — the rule the live voice was rebuilt around, for the
 * same reason: an iPhone starts audio only inside the gesture.
 *
 * The samples are taken off `mask.output`, the node where the two pitch-shifted
 * lines meet. That is the only tap point this file offers: anything upstream of
 * it holds the raw voice, and a recording of the raw voice would be the one
 * thing the mask exists to make impossible, kept on a server for forty-five
 * minutes.
 */
export interface Recording {
  /** Stop and hand back the note, or null if nothing usable was captured. */
  finish: () => { wav: Uint8Array<ArrayBuffer>; durationMs: number } | null;
  /** Stop and throw it away. */
  cancel: () => void;
}

export type RecordingRefusal = "microphone" | "mask";

export async function startRecording(
  ctx: AudioContext | null,
  persona: number,
): Promise<{ recording: Recording } | { refused: RecordingRefusal; name: string }> {
  let mic: MediaStream;
  try {
    mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    void ctx?.close();
    return { refused: "microphone", name: e instanceof DOMException ? e.name : "" };
  }

  if (ctx) await whenRunning(ctx);
  let why = "";
  const masked = maskMicrophone(mic, persona, (reason) => { why = reason; }, ctx);
  if (!masked) {
    // Fail to silence, never to an unmasked recording.
    mic.getTracks().forEach((t) => t.stop());
    return { refused: "mask", name: why };
  }

  const graph = masked.output.context as AudioContext;
  const rate = graph.sampleRate;
  const chunks: Float32Array[] = [];
  /*
    ScriptProcessor: deprecated, and still the one tap that needs nothing but
    this file. The replacement is a worklet — a module served from our own
    origin and loaded before the first sample, one more request between the
    tap and the recording on the phones this is for. Proven here in Chromium,
    with and without the iPhone's audio rules emulated; whether it records on
    an actual iPhone is read on an iPhone.

    Its output is left silent: the only thing connected downstream is the
    destination that keeps it running, so nobody hears their own voice back
    through the speaker. Check 157 trips on any write to it.
  */
  const tap = graph.createScriptProcessor(4096, 1, 1);
  tap.onaudioprocess = (e) => {
    chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };
  masked.output.connect(tap);
  tap.connect(graph.destination);

  let done = false;
  const release = () => {
    if (done) return;
    done = true;
    tap.onaudioprocess = null;
    try {
      masked.output.disconnect(tap);
      tap.disconnect();
    } catch {
      /* already torn down */
    }
    masked.stop();
    mic.getTracks().forEach((t) => t.stop());
  };

  return {
    recording: {
      finish() {
        release();
        const samples = downsample(chunks, rate, NOTE_RATE);
        if (samples.length === 0) return null;
        return { wav: encodeWav(samples), durationMs: Math.round((samples.length / NOTE_RATE) * 1000) };
      },
      cancel: release,
    },
  };
}
