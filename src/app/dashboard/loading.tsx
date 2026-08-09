export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      className="flex min-h-dvh items-center justify-center"
    >
      <span className="h-10 w-10 rounded-full border-2 border-ink/20 border-t-gold motion-safe:animate-spin" />
    </div>
  );
}
