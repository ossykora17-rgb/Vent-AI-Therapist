"use client";

import { cn } from "@/lib/utils";

/**
 * The room, drawn as a room.
 *
 * This product is called a circle and there was no circle anywhere in it. Six
 * seats existed as a number in a header and as six borders crammed beside a
 * clock, and the screen a person actually sat in front of — waiting, alone,
 * at 4am — was a sentence at the top, a card, and then five hundred pixels of
 * nothing above the composer.
 *
 * That void was the real complaint. Density was the symptom; the cause was
 * that the most evocative image this product owns was going unused while half
 * the screen did nothing. A circle of six chairs with one person in it is
 * immediately legible as *waiting in a room*. The same fact as "1 here · 45m"
 * and a completely different experience of it.
 *
 * WHAT IS DRAWN IS WHAT THE SERVER SAID
 *
 * `seatsPresent` is a real array of real booleans from `presenceOf`, and
 * `mySeat` is a real index. Nothing here is decorative in the sense of being
 * invented: every filled seat is somebody whose heartbeat landed inside the
 * presence window, every hollow one is a chair nobody is in, and when the
 * caller has not taken a seat, none is marked. A room that draws a person
 * who is not there is the "your turn comes" bug wearing a nicer shape.
 *
 * THE MIDDLE IS EMPTY ON PURPOSE
 *
 * There is nothing in the centre and nothing is going to be put there. The
 * middle of a circle is where the speaking happens, and in a room where
 * nobody has spoken it should be empty. Filling it with a count, a logo or a
 * timer would be the same instinct that produced the seven-piece header.
 */

interface Props {
  /** One per seat that exists, true when somebody is behind it now. */
  seatsPresent: boolean[];
  /** How many chairs the room has, filled or not. */
  maxSeats: number;
  /** The caller's own seat, or null when they have not taken one. */
  mySeat: number | null;
  /** Seats that are speaking right now, when voice is live. */
  speaking?: number[];
  className?: string;
}

/* A twelfth of a turn, so seat 0 sits at the top rather than at three o'clock. */
const START = -Math.PI / 2;

export function CircleSeats({
  seatsPresent,
  maxSeats,
  mySeat,
  speaking = [],
  className,
}: Props) {
  const seats = Array.from({ length: maxSeats }, (_, i) => i);
  const R = 62;
  const C = 84;

  return (
    <svg
      viewBox="0 0 168 168"
      className={cn("mx-auto block h-[168px] w-[168px]", className)}
      role="img"
      aria-label={
        mySeat === null
          ? `${seatsPresent.filter(Boolean).length} of ${maxSeats} seats taken`
          : `${seatsPresent.filter(Boolean).length} of ${maxSeats} seats taken, including yours`
      }
    >
      {/*
        The ring the chairs sit on. Barely there — it is the floor, not the
        subject, and a strong circle here would read as a progress meter,
        which is the one thing this must not look like.
      */}
      <circle
        cx={C}
        cy={C}
        r={R}
        fill="none"
        stroke="rgb(var(--line) / 0.14)"
        strokeWidth="1"
      />

      {seats.map((i) => {
        const angle = START + (i / maxSeats) * Math.PI * 2;
        const x = C + Math.cos(angle) * R;
        const y = C + Math.sin(angle) * R;
        const here = seatsPresent[i] === true;
        const mine = i === mySeat;
        const talking = speaking.includes(i);

        return (
          <g key={i}>
            {/*
              Speaking is the only thing that moves, and only while it is
              true. A room where an idle seat pulses is a room that looks
              like it is doing something when nothing is happening.
            */}
            {talking && (
              <circle
                cx={x}
                cy={y}
                r="11"
                fill="none"
                stroke="rgb(var(--gold))"
                strokeWidth="1"
                className="seat-speaking"
              />
            )}
            <circle
              cx={x}
              cy={y}
              r={mine ? 7 : 6}
              /*
                An empty chair is filled with the ground, not with nothing.

                `fill="none"` let the floor ring draw straight through the
                seats it passes behind, so four of the six came out with a
                diagonal line across them and read as struck out — a room
                telling somebody four of its chairs were cancelled. Visible
                only once it was rendered; in the source it is the obviously
                correct value.

                Painting the page's own colour punches the ring out cleanly
                and keeps the chair reading as empty rather than absent.
              */
              fill={
                here
                  ? mine
                    ? "rgb(var(--gold))"
                    : "rgb(var(--ink) / 0.72)"
                  : "rgb(var(--paper))"
              }
              stroke={here ? "none" : "rgb(var(--line) / 0.3)"}
              strokeWidth="1"
              className="transition-all duration-700"
            />
            {/*
              Your own chair gets a ring around it rather than a brighter
              fill. Brightness would rank you above the others in a room whose
              entire premise is that nobody here outranks anybody.
            */}
            {mine && (
              <circle
                cx={x}
                cy={y}
                r="11"
                fill="none"
                stroke="rgb(var(--gold) / 0.45)"
                strokeWidth="1"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}
