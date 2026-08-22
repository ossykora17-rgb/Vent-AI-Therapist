"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center px-4 text-center"
    >
      <h1 className="font-display text-heading font-bold tracking-[-0.02em]">
        Something broke
      </h1>
      <p className="mb-8 mt-3 max-w-sm text-body leading-relaxed text-ash">
        Not your fault. Try again — and if it keeps happening, it&apos;s on us
        to fix.
      </p>
      <Button size="lg" onClick={reset}>
        Try again
      </Button>
      {error.digest && (
        <p className="mt-6 text-label uppercase tracking-widest text-ash">
          Ref {error.digest}
        </p>
      )}
    </main>
  );
}
