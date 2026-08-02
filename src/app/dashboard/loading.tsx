export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      className="flex min-h-dvh items-center justify-center"
    >
      <span className="h-10 w-10 border-3 border-ink border-r-transparent motion-safe:animate-spin" />
    </div>
  );
}
