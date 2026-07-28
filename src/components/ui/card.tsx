import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({
  className,
  as: Tag = "div",
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType }) {
  return (
    <Tag
      className={cn(
        "border-3 border-ink bg-paper p-5 shadow-brut sm:p-6",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "mb-2 text-lg font-bold uppercase tracking-wide",
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
  return <div className={cn("text-sm leading-relaxed", className)} {...props} />;
}
