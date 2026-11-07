export function ResultsSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <div className="skeleton h-28 w-full" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4"><div className="skeleton h-40" /><div className="skeleton h-40" /></div>
        <div className="skeleton h-80" />
      </div>
      <span className="sr-only">{label}…</span>
    </div>
  );
}
