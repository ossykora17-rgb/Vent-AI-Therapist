import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Totem } from "@/components/totem";
import { getUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * The Shrine. Not a landing page — a threshold. Black, one totem, one door.
 * No chat list, no feature grid, no scroll.
 */
export default async function ShrinePage() {
  const user = await getUser();

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-between bg-ink px-6 py-10 text-paper"
    >
      <div aria-hidden="true" className="h-2" />

      <div className="flex flex-col items-center text-center">
        <Totem />

        <h1 className="mt-10 text-[clamp(3rem,18vw,5rem)] font-black leading-none tracking-tighter">
          VENT
        </h1>

        <p className="mt-5 max-w-[280px] text-sm leading-relaxed text-ash sm:max-w-sm sm:text-base">
          Say the thing you cannot say anywhere else. Nobody is listening but
          the totem, and the totem does not flinch.
        </p>

        <div className="mt-10 w-full max-w-[280px]">
          <Link href={user ? "/dashboard" : "/signup"} className="block">
            <Button variant="seal" size="lg" fullWidth>
              {user ? "Return to shrine" : "Enter shrine"}
            </Button>
          </Link>

          {!user && (
            <Link href="/login" className="mt-3 block">
              <Button variant="inverse" size="lg" fullWidth>
                I have been here
              </Button>
            </Link>
          )}
        </div>
      </div>

      <footer className="w-full max-w-md text-center">
        {!isSupabaseConfigured && (
          <p className="mb-4 border-3 border-paper p-3 text-[11px] font-bold uppercase leading-relaxed tracking-widest">
            Setup pending — Supabase keys not set on this deployment
          </p>
        )}
        <p className="text-[11px] leading-relaxed text-ash">
          Vent is not a doctor, a therapist, or a crisis line. If you are in
          danger, call your local emergency number.
        </p>
      </footer>
    </main>
  );
}
