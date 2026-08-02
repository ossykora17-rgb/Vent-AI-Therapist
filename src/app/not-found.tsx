import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center"
    >
      <p className="text-[clamp(4rem,20vw,9rem)] font-black leading-none tracking-tighter">
        404
      </p>
      <p className="mb-8 mt-2 max-w-sm text-sm leading-relaxed text-ash">
        This page doesn&apos;t exist. Nothing you did.
      </p>
      <Link href="/">
        <Button size="lg">Back to safety</Button>
      </Link>
    </main>
  );
}
