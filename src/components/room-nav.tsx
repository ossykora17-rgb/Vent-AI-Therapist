"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * The doors, in every room that has them, marking the one you are in.
 *
 * There were three text links, written once, in the chat header — and History
 * and Memory each had their own arrangement, so the product was four surfaces
 * that happened to be in the same repository rather than four rooms in a
 * house. Nothing anywhere said where you were.
 *
 * Not a navigation bar in the app-chrome sense, and deliberately not styled as
 * one. Plain words on a wall, the one you are standing in underlined in gold,
 * which is the same mark the composer's mode switch uses for the same reason:
 * this product has exactly one way of saying "this is the live one" and it
 * should mean that everywhere.
 *
 * The circle room does not get this, and that is not an oversight. You are in
 * a session with five other people for forty-five minutes; a row of exits
 * across the top of it turns a room into a tab. Leaving a circle is a
 * decision, and it has its own door lower down.
 */

const DOORS = [
  ["/chat", "Session"],
  ["/circles", "Circles"],
  ["/history", "History"],
  ["/memory", "Memory"],
] as const;

export function RoomNav({ className }: { className?: string }) {
  const here = usePathname();

  return (
    <nav
      aria-label="Rooms"
      className={cn("flex items-center gap-3 sm:gap-4", className)}
    >
      {DOORS.map(([href, label]) => {
        /*
          `startsWith` rather than equality, so a circle you are inside still
          marks Circles. `/chat` is exact — nothing nests under it, and a
          prefix match there would light the session door from every path.
        */
        const current = href === "/chat" ? here === href : here.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "label-mono flex h-11 items-center underline-offset-[6px] transition-colors duration-300",
              current
                ? "text-ink underline decoration-gold"
                : "text-ash/80 hover:text-ink hover:underline hover:decoration-gold",
            )}
          >
            {label}
          </Link>
        );
      })}
      <ThemeToggle />
    </nav>
  );
}
