import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * A card is a glass plate. It was a 3px ink border over flat paper with a
 * hard offset shadow — the other language — and the whole product is built
 * from `.glass`, so this is now the same plate the chat and the circles use.
 */
export function Card({
  className,
  as: Tag = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return <Tag className={cn("glass p-5 sm:p-6", className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        // The display face, because that is the voice everywhere else.
        "mb-2 font-display text-[17px] font-bold tracking-[-0.01em]",
        className,
      )}
      {...props}
    />
  );
}

export function CardBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <div
      className={cn("text-[15px] leading-[1.7] text-ash", className)}
      {...props}
    />
  );
}
