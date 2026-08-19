/**
 * Read a `text/event-stream` in the browser, one event at a time.
 *
 * The server half of this lives in `lib/vent/providers.ts` and reads a
 * provider's stream; this is the client half and reads ours. They are
 * deliberately separate: that one parses somebody else's format and must
 * tolerate whatever six vendors send, this one parses a format we control and
 * can be strict.
 *
 * The one thing both must get right, and the one thing a naive reader gets
 * wrong, is that a network chunk is not a message. `data: {"chunk":"I hea` and
 * `r you"}` arrive as two reads on a slow connection and a parser that works
 * per chunk throws on valid JSON — reliably on a Lagos mobile network and
 * never on a laptop plugged into an office, which is the worst possible
 * distribution for a bug.
 *
 * So: accumulate, split on the blank line that terminates an SSE event, and
 * keep the remainder for the next read.
 */
export interface StreamEvent {
  event: string;
  data: unknown;
}

export async function readEventStream(
  res: Response,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const body = res.body;
  if (!body) throw new Error("no body");

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let carry = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    carry += decoder.decode(value, { stream: true });

    // An SSE event ends at a blank line. Anything after the last one is a
    // partial event and belongs to the next read.
    const frames = carry.split("\n\n");
    carry = frames.pop() ?? "";

    for (const frame of frames) {
      let name = "message";
      let payload = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) name = line.slice(6).trim();
        else if (line.startsWith("data:")) payload += line.slice(5).trim();
      }
      if (!payload) continue;
      try {
        onEvent({ event: name, data: JSON.parse(payload) });
      } catch {
        // A frame we cannot read is skipped rather than fatal. The `done`
        // event is what the caller commits to, and losing a preview fragment
        // costs a flicker; throwing here would cost the whole answer.
      }
    }
  }
}
