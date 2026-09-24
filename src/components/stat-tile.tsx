export function StatTile({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <p
        className={`text-xs text-zinc-500 dark:text-zinc-400 ${hint ? "cursor-help underline decoration-dotted underline-offset-2" : ""}`}
        title={hint}
      >
        {label}
      </p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}
