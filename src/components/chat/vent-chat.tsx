"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { FlavourProfile } from "@/lib/flavour/types";
import {
  HOBBY_LABEL,
  OCCUPATION_LABEL,
  TEMPERAMENT_LABEL,
} from "@/lib/flavour/types";
import type { RitualStage, TrinityNote } from "@/lib/trinity";

interface Line {
  id: number;
  speaker: "you" | "vent";
  text: string;
  /** The one gold question. */
  surgical?: boolean;
  tool?: boolean;
}

interface VentResponse {
  lines: string[];
  surgicalQuestion?: string;
  tool?: string;
  notes: TrinityNote[];
  critic: { score: number; verdict: string; reason: string };
  typingDelayMs: number;
  flavour: FlavourProfile;
  memory: string[];
  nextStage: RitualStage | null;
}

const STAGES: RitualStage[] = ["vent", "see", "dig", "tool", "seal"];

/** 8am, before they have said anything. VENT speaks first. */
function proactiveOpener(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Morning. What do we need to clear today so you can perform?";
  if (hour < 18) return "Midday check. What's still sitting on your chest?";
  return "Before the day closes — what did you carry today that you didn't put down?";
}

export function VentChat() {
  const { toast } = useToast();
  const [lines, setLines] = React.useState<Line[]>([
    { id: 0, speaker: "vent", text: proactiveOpener() },
  ]);
  const [userMessages, setUserMessages] = React.useState<string[]>([]);
  const [stage, setStage] = React.useState<RitualStage>("vent");
  const [draft, setDraft] = React.useState("");
  const [typing, setTyping] = React.useState(false);
  const [flavour, setFlavour] = React.useState<FlavourProfile | null>(null);
  const [memory, setMemory] = React.useState<string[]>([]);
  const [notes, setNotes] = React.useState<TrinityNote[]>([]);
  const [critic, setCritic] = React.useState<VentResponse["critic"] | null>(null);
  const [sealed, setSealed] = React.useState(false);

  const nextId = React.useRef(1);
  const endRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines, typing]);

  async function send() {
    const text = draft.trim();
    if (!text || typing) return;

    const history = [...userMessages, text];
    setLines((l) => [...l, { id: nextId.current++, speaker: "you", text }]);
    setUserMessages(history);
    setDraft("");
    setTyping(true);

    try {
      const res = await fetch("/api/vent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userMessages: history, stage }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: VentResponse = await res.json();

      setFlavour(data.flavour);
      setMemory(data.memory);
      setNotes(data.notes);
      setCritic(data.critic);

      // Human texture: hold the typing indicator, then double-text the lines
      // one at a time rather than dumping a wall.
      await wait(data.typingDelayMs);
      setTyping(false);

      for (let i = 0; i < data.lines.length; i++) {
        if (i > 0) await wait(700);
        const line = data.lines[i];
        setLines((l) => [...l, { id: nextId.current++, speaker: "vent", text: line }]);
      }
      if (data.surgicalQuestion) {
        await wait(900);
        setLines((l) => [
          ...l,
          {
            id: nextId.current++,
            speaker: "vent",
            text: data.surgicalQuestion!,
            surgical: true,
          },
        ]);
      }
      if (data.tool) {
        await wait(700);
        setLines((l) => [
          ...l,
          { id: nextId.current++, speaker: "vent", text: data.tool!, tool: true },
        ]);
      }

      if (data.nextStage) setStage(data.nextStage);
    } catch {
      setTyping(false);
      toast("Network dipped. Say that again.", "error");
    }
  }

  function seal() {
    setSealed(true);
    toast("Sealed. See you tomorrow.", "success");
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      {/* Ritual progress — five hard blocks, no bar, no percentage. */}
      <header className="sticky top-0 z-30 border-b-3 border-ink bg-paper">
        <div className="mx-auto flex max-w-2xl items-center gap-1 px-4 py-3">
          {STAGES.map((s) => {
            const done = STAGES.indexOf(s) < STAGES.indexOf(stage);
            const now = s === stage;
            return (
              <span
                key={s}
                aria-current={now ? "step" : undefined}
                className={cn(
                  "flex-1 border-3 border-ink py-1 text-center text-[10px] font-bold uppercase tracking-widest",
                  now && "bg-ink text-paper",
                  done && "bg-ash text-ink",
                  !now && !done && "text-ash",
                )}
              >
                {s}
              </span>
            );
          })}
        </div>

        {/* Memory pill — proof it remembers vibe, not just facts. */}
        {memory.length > 0 && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <p className="border-3 border-ink px-3 py-2 text-xs leading-relaxed">
              <span className="font-bold uppercase tracking-widest">
                Remembers ·{" "}
              </span>
              {memory.join(" ")}
            </p>
          </div>
        )}
      </header>

      {/* The transcript. No bubbles. NAME: text. */}
      <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
        <ol className="space-y-5">
          {lines.map((line) => (
            <li key={line.id} className="text-[15px] leading-relaxed">
              <span
                className={cn(
                  "mr-2 select-none font-bold uppercase tracking-widest",
                  line.speaker === "you" ? "text-ash" : "text-ink",
                )}
              >
                {line.speaker === "you" ? "YOU:" : "VENT:"}
              </span>
              <span
                className={cn(
                  line.surgical &&
                    "bg-gold px-1 py-[2px] font-bold decoration-clone",
                  line.tool && "border-l-3 border-ink pl-2 font-bold",
                )}
              >
                {line.text}
              </span>
            </li>
          ))}

          {typing && (
            <li className="text-[15px]">
              <span className="mr-2 font-bold uppercase tracking-widest">
                VENT:
              </span>
              <span aria-live="polite" className="inline-flex gap-1 align-middle">
                <Dot delay="0ms" />
                <Dot delay="200ms" />
                <Dot delay="400ms" />
              </span>
            </li>
          )}
        </ol>
        <div ref={endRef} />
      </main>

      {/* Composer + seal */}
      <footer className="sticky bottom-0 border-t-3 border-ink bg-paper">
        <div className="mx-auto max-w-2xl px-4 py-3">
          {stage === "seal" && !sealed ? (
            <Button variant="seal" size="lg" fullWidth onClick={seal}>
              Seal it
            </Button>
          ) : sealed ? (
            <p className="py-3 text-center text-xs font-bold uppercase tracking-widest">
              Sealed. Come back tomorrow.
            </p>
          ) : (
            <div className="flex items-end gap-2">
              <label htmlFor="vent-input" className="sr-only">
                Say it
              </label>
              <textarea
                id="vent-input"
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Say it."
                className="max-h-32 min-h-[48px] flex-1 resize-none border-3 border-ink bg-paper px-3 py-3 placeholder:text-ash"
              />
              <Button
                onClick={() => void send()}
                loading={typing}
                disabled={!draft.trim()}
                aria-label="Send"
              >
                Send
              </Button>
            </div>
          )}

          {/* The Trinity debated — the user may look, but never has to. */}
          {notes.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-widest text-ash">
                Under the hood
              </summary>
              <div className="mt-2 space-y-1 border-3 border-ash p-3 text-[11px] leading-relaxed">
                {flavour && (
                  <p className="font-bold uppercase tracking-widest">
                    {flavour.name} · {TEMPERAMENT_LABEL[flavour.temperament.value]}{" "}
                    × {OCCUPATION_LABEL[flavour.occupation.value]} ×{" "}
                    {HOBBY_LABEL[flavour.hobby.value]}
                  </p>
                )}
                {notes.map((n) => (
                  <p key={n.agent}>
                    <span className="font-bold uppercase">{n.agent}</span>{" "}
                    <span className="text-ash">[{n.model}]</span> {n.note}
                  </p>
                ))}
                {critic && (
                  <p>
                    <span className="font-bold uppercase">critic</span>{" "}
                    {critic.score}/10 — {critic.reason}
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      </footer>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="inline-block h-2 w-2 bg-ink motion-safe:animate-blink"
      style={{ animationDuration: "1.2s", animationDelay: delay }}
    />
  );
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
