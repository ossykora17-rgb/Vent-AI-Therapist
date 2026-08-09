import { CRISIS_LINES, CRISIS_TEL, EMERGENCY_TEL } from "@/lib/vent/intent";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { isSupabaseConfigured } from "@/lib/env";
import { getStore } from "@/lib/store";
import { summariseOpen } from "@/lib/circles/open-now";

export const dynamic = "force-dynamic";

/**
 * Read the rooms, and never let that failure reach the page.
 *
 * A landing page that 500s because the circles table is unhappy is a worse
 * outcome than a landing page with no room line on it. Anything that goes
 * wrong here degrades to `null`, which renders nothing.
 */
async function openRooms() {
  try {
    const store = getStore();
    if (!store) return null;
    return summariseOpen(await store.listOpenCircles());
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const rooms = await openRooms();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex h-16 w-full max-w-[640px] items-center justify-between px-4">
        <p className="label-mono">Mind Weave</p>
        <ThemeToggle />
      </header>

      <main
        id="main"
        className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center px-4 py-10"
      >
        <h1 className="font-display text-[clamp(3.5rem,18vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.02em]">
          VENT
        </h1>
        <p className="mt-3 font-display text-xl italic text-ash">
          Carve your truth.
        </p>

        <p className="mt-6 max-w-[46ch] text-[16px] leading-[1.6] text-ash">
          Somewhere to put the thing you can&apos;t say out loud yet. It knows
          what day it is, it remembers what you said last time, and it will not
          tell you to drop your shoulders three times in a row.
        </p>

        <Link
          href="/chat"
          className="mt-8 flex min-h-[52px] w-full max-w-[280px] items-center justify-center rounded-card bg-gold px-6 text-[15px] font-semibold text-ink shadow-glass transition-opacity duration-300 hover:opacity-90"
        >
          Come in
        </Link>

        <p className="label-mono mt-3">Free · No account · Nothing to install</p>

        {/*
          The second door, and the one that was not here at all.

          Everything above this is the private box. Circles — six seats, a
          Keeper, forty-five minutes, every word deleted at the end — was
          reachable only by entering the chat and noticing a nav link. So the
          person whose actual problem is being alone, at the hour when it is
          worst, was the one person never told that other people were awake.

          Checked, not claimed. `summariseOpen` returns null when there is no
          store, and this whole block disappears rather than painting a door
          onto a deployment where circles do not work. When rooms are open it
          names the real ones; when none are, it says so and still offers the
          way in, because "nobody is sitting" is true and useful and an empty
          lobby is not a broken one.
        */}
        {rooms && (
          <div className="mt-10 max-w-[46ch] border-l border-gold/25 pl-5">
            <p className="label-mono mb-2">Or don&apos;t do it alone</p>
            {rooms.count > 0 ? (
              <p className="text-[15px] leading-[1.7] text-ash">
                <span className="font-display text-[17px] text-ink/85">
                  {rooms.names.join(" · ")}
                </span>
                <br />
                {rooms.count === 1 ? "One room is" : `${rooms.count} rooms are`}{" "}
                open right now, {rooms.seatsOpen}{" "}
                {rooms.seatsOpen === 1 ? "seat" : "seats"} between them. Six
                people, forty-five minutes, then every word is deleted.
              </p>
            ) : (
              <p className="text-[15px] leading-[1.7] text-ash">
                Nobody is sitting right now. You can open a room and it waits
                for whoever comes — six people, forty-five minutes, then every
                word is deleted.
              </p>
            )}
            <Link
              href="/circles"
              className="mt-3 inline-flex min-h-[44px] items-center text-[15px] font-semibold text-ink underline underline-offset-4"
            >
              {rooms.count > 0 ? "Take a seat →" : "Open a room →"}
            </Link>
          </div>
        )}

        {/*
          This was three cards in a grid: Grounded, Remembers, Critical.
          A feature grid is written for somebody deciding whether to buy. The
          person who lands here at 2am is not deciding whether to buy. They are
          deciding whether it is safe to say the thing, and a row of boxes with
          product nouns in them answers a question they are not asking.

          So: no boxes. Three lines with air around them, in the display face,
          each one a thing the app does *to* them rather than a capability it
          has. Set as a litany, because that is the register the room is in.
        */}
        <ul className="mt-12 space-y-5 border-l border-gold/25 pl-5">
          {[
            "It knows what day it is, and what that costs here.",
            "It gives your own words back to you, exactly as you said them.",
            "It will not tell you to drop your shoulders three times in a row.",
          ].map((line) => (
            <li
              key={line}
              className="max-w-[42ch] font-display text-[17px] leading-[1.5] text-ink/85"
              style={{ textWrap: "pretty" } as React.CSSProperties}
            >
              {line}
            </li>
          ))}
        </ul>

        {/*
          Anonymity, stated plainly and near the door.
          It is the thing that decides whether somebody types the true sentence
          or a safer one, so it does not belong in a footer. Every clause is
          something the code actually does — no account exists to make, the id
          is generated on the device, and /memory deletes everything.
        */}
        <div className="mt-12 max-w-[46ch]">
          <p className="label-mono mb-2">Nobody knows it is you</p>
          <p className="text-[15px] leading-[1.7] text-ash">
            No name, no email, no password — there is no account to make. You
            are a random id made on your phone, and{" "}
            {/* /history, not /memory. /memory is the signed-in vector list;
                the anonymous "delete everything" — every vent and the user row
                with it — lives on /history. Linking the wrong one would have
                promised a button that is not on the page you land on. */}
            <Link href="/history" className="underline underline-offset-4">
              one tap deletes everything
            </Link>
            , for good. Say the real thing.
          </p>
        </div>

        {!isSupabaseConfigured && (
          <p className="glass mt-6 p-4 text-sm leading-relaxed">
            <span className="label-mono">Setup pending</span>
            <br />
            Supabase keys aren&apos;t set on this deployment, so sessions
            won&apos;t persist between visits yet. Everything else works.
          </p>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[640px] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        <p className="text-[12px] leading-relaxed text-ash">
          Mind Weave is not a licensed therapist. VENT is for emotional support
          only, not medical advice. In crisis, call Nigeria{" "}
          <a href={`tel:${CRISIS_TEL}`} className="underline underline-offset-2">
            {CRISIS_LINES.nigeria}
          </a>{" "}
          or emergency{" "}
          <a href={`tel:${EMERGENCY_TEL}`} className="underline underline-offset-2">
            {CRISIS_LINES.emergency}
          </a>
          .
        </p>
        {/*
          Terms and Privacy existed and linked only to each other — a closed
          loop with no door into it from anywhere in the product. Every surface
          states the promise ("nothing is recorded, every word deleted within
          24 hours") as plain text, and the page that documents it could not be
          reached by tapping. A promise a person cannot go and read is a
          slogan.
        */}
        <p className="mt-3 text-[12px] text-ash">
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}
