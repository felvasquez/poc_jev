"use client";

// Fixed categorical order: slot 1 (blue) and slot 2 (orange) from the
// validated palette — 2-series adjacent pair clears CVD + normal-vision
// floors in both light and dark, so no secondary encoding is required.
export const SERIES_COLOR = {
  jev: { light: "#2a78d6", dark: "#3987e5", label: "Jev" },
  llm: { light: "#eb6834", dark: "#d95926", label: "LLM" },
} as const;

export interface GroupedBarRow {
  label: string;
  jev: number | null;
  llm: number | null;
}

export function GroupedBarChart({
  title,
  subtitle,
  rows,
  format,
}: {
  title: string;
  subtitle?: string;
  rows: GroupedBarRow[];
  format: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.jev ?? 0, r.llm ?? 0]));

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 gap-3 text-xs text-zinc-500 dark:text-zinc-400">
          {(Object.keys(SERIES_COLOR) as (keyof typeof SERIES_COLOR)[]).map((key) => (
            <span key={key} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SERIES_COLOR[key].light }}
              />
              {SERIES_COLOR[key].label}
            </span>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="mb-1 text-xs text-zinc-500 dark:text-zinc-400">{row.label}</p>
            <div className="space-y-0.5">
              {(["jev", "llm"] as const).map((key) => {
                const v = row[key];
                const pct = v === null ? 0 : Math.max(2, (v / max) * 100);
                return (
                  <div key={key} className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded-full bg-zinc-100 dark:bg-zinc-800">
                      {v !== null && (
                        <div
                          className="h-2.5 rounded-full transition-[width]"
                          style={{ width: `${pct}%`, backgroundColor: SERIES_COLOR[key].light }}
                        />
                      )}
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                      {v === null ? "—" : format(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
