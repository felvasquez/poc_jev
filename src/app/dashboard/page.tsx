"use client";

import { useEffect, useState } from "react";
import { StatTile } from "@/components/stat-tile";
import { GroupedBarChart, SERIES_COLOR, type GroupedBarRow } from "@/components/grouped-bar-chart";
import type { Engine } from "@/db/schema";

interface EngineStats {
  engine: Engine;
  turns: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
  avgConfidence: number | null;
  ambiguousRate: number;
}

interface CategoryStats {
  engine: Engine;
  category: string;
  turns: number;
  avgLatencyMs: number;
  avgCostUsd: number;
}

interface RecentTurn {
  id: string;
  userMessageId: string;
  engine: Engine;
  category: string;
  confidence: number | null;
  needsMoreContext: boolean;
  latencyMs: number;
  costUsd: string;
  createdAt: string;
}

interface MetricsResponse {
  byEngine: EngineStats[];
  byCategory: CategoryStats[];
  recent: RecentTurn[];
}

const ENGINE_LABEL: Record<Engine, string> = { jev: "Jev", llm: "LLM" };

export default function Dashboard() {
  const [data, setData] = useState<MetricsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});

  function categoryLabel(key: string) {
    return categoryLabels[key] ?? key;
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/metrics");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error desconocido");
      }
    }
    load();
    const interval = setInterval(load, 10_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: { categories: { key: string; label: string }[] }) => {
        setCategoryLabels(Object.fromEntries(data.categories.map((c) => [c.key, c.label])));
      })
      .catch(() => {});
  }, []);

  if (error) {
    return <p className="mx-auto max-w-5xl px-6 py-6 text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!data) {
    return <p className="mx-auto max-w-5xl px-6 py-6 text-sm text-zinc-500">Cargando métricas…</p>;
  }

  const jev = data.byEngine.find((m) => m.engine === "jev");
  const llm = data.byEngine.find((m) => m.engine === "llm");

  if (!jev && !llm) {
    return (
      <p className="mx-auto max-w-5xl px-6 py-6 text-sm text-zinc-500">
        Todavía no hay conversaciones registradas. Probá el chat para generar métricas.
      </p>
    );
  }

  const latencyRows: GroupedBarRow[] = [
    { label: "Latencia promedio", jev: jev?.avgLatencyMs ?? null, llm: llm?.avgLatencyMs ?? null },
    { label: "P95 (peor caso típico)", jev: jev?.p95LatencyMs ?? null, llm: llm?.p95LatencyMs ?? null },
  ];

  const costRows: GroupedBarRow[] = [
    { label: "Costo promedio", jev: jev?.avgCostUsd ?? null, llm: llm?.avgCostUsd ?? null },
  ];

  const latencySavingsPct =
    jev && llm && llm.avgLatencyMs > 0 ? ((llm.avgLatencyMs - jev.avgLatencyMs) / llm.avgLatencyMs) * 100 : null;
  const costSavingsPct =
    jev && llm && llm.avgCostUsd > 0 ? ((llm.avgCostUsd - jev.avgCostUsd) / llm.avgCostUsd) * 100 : null;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Métricas de derivación</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Cada mensaje se clasifica con Jev y con el LLM en paralelo, sobre el mismo texto — comparación pareada.
        </p>
      </div>

      {latencySavingsPct !== null && costSavingsPct !== null && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Ahorro de latencia (Jev vs LLM)"
            hint="Cuánto más rápido es Jev en promedio respecto al LLM, sobre las mismas consultas. Verde = Jev más rápido. Rojo con '+' = Jev fue más lento en esta muestra (con pocos turnos puede pasar por ruido)."
            value={`${latencySavingsPct >= 0 ? "-" : "+"}${Math.abs(latencySavingsPct).toFixed(0)}%`}
            accent={latencySavingsPct >= 0 ? "#0ca30c" : "#d03b3b"}
          />
          <StatTile
            label="Ahorro de costo (Jev vs LLM)"
            hint="Cuánto más barato es Jev en promedio respecto al LLM, sobre las mismas consultas. Verde = Jev más barato."
            value={`${costSavingsPct >= 0 ? "-" : "+"}${Math.abs(costSavingsPct).toFixed(0)}%`}
            accent={costSavingsPct >= 0 ? "#0ca30c" : "#d03b3b"}
          />
          <StatTile
            label="Turnos Jev"
            hint="Cantidad de mensajes que clasificó Jev. Siempre igual a los de LLM: cada consulta se manda a ambos motores en paralelo."
            value={String(jev?.turns ?? 0)}
          />
          <StatTile
            label="Turnos LLM"
            hint="Cantidad de mensajes que clasificó el LLM. Siempre igual a los de Jev: cada consulta se manda a ambos motores en paralelo."
            value={String(llm?.turns ?? 0)}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {(["jev", "llm"] as const).map((engine) => {
          const stats = engine === "jev" ? jev : llm;
          const color = SERIES_COLOR[engine].light;
          return (
            <div key={engine} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{ENGINE_LABEL[engine]}</h2>
              </div>
              {!stats ? (
                <p className="text-xs text-zinc-500">Sin datos todavía.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <StatTile label="Turnos" hint="Cantidad de consultas clasificadas por este motor." value={String(stats.turns)} />
                  <StatTile
                    label="Latencia prom."
                    hint="Tiempo promedio, en milisegundos, desde que se envía la consulta hasta recibir la categoría derivada."
                    value={`${stats.avgLatencyMs.toFixed(0)}ms`}
                  />
                  <StatTile
                    label="Costo prom."
                    hint="Costo promedio en USD de una clasificación (tokens de input/output al precio del modelo)."
                    value={`$${stats.avgCostUsd.toFixed(6)}`}
                  />
                  <StatTile
                    label="Costo acumulado"
                    hint="Suma de todos los costos de clasificación registrados hasta ahora para este motor."
                    value={`$${stats.totalCostUsd.toFixed(4)}`}
                  />
                  {stats.avgConfidence !== null && (
                    <StatTile
                      label="Confianza prom."
                      hint="Solo Jev: probabilidad promedio que el modelo le asigna a la categoría elegida (0-100%), calibrada para reflejar precisión real. El LLM no expone una confianza calibrada, por eso no aparece este dato para ese motor."
                      value={`${(stats.avgConfidence * 100).toFixed(0)}%`}
                    />
                  )}
                  <StatTile
                    label="Consultas ambiguas"
                    hint="Porcentaje de consultas donde este motor marcó que hacía falta pedirle más contexto al cliente en vez de derivar directo (Jev: umbral sobre una pregunta de claridad calibrada; LLM: el propio modelo lo autoreporta)."
                    value={`${(stats.ambiguousRate * 100).toFixed(0)}%`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GroupedBarChart
          title="Latencia (ms)"
          subtitle="Tiempo de clasificación por consulta. P95 = el 95% de las consultas fueron más rápidas que ese valor (mide los casos lentos, la 'cola', no el promedio)."
          rows={latencyRows}
          format={(v) => `${v.toFixed(0)}ms`}
        />
        <GroupedBarChart
          title="Costo promedio (USD)"
          subtitle="Costo por clasificación: tokens de input/output al precio publicado de cada motor."
          rows={costRows}
          format={(v) => `$${v.toFixed(6)}`}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Distribución por categoría</h3>
        <p className="mb-3 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          A qué categoría derivó cada motor y con qué frecuencia — útil para ver si Jev y el LLM concuerdan en la
          misma categoría o divergen en algún producto en particular.
        </p>
        <table className="w-full text-left text-xs">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 font-normal">Categoría</th>
              <th className="py-1.5 font-normal">Motor</th>
              <th className="py-1.5 text-right font-normal">Turnos</th>
              <th className="py-1.5 text-right font-normal">Latencia promedio</th>
              <th className="py-1.5 text-right font-normal">Costo promedio</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.byCategory.length === 0 && (
              <tr>
                <td colSpan={5} className="py-3 text-center text-zinc-500">
                  Sin datos todavía.
                </td>
              </tr>
            )}
            {data.byCategory.map((row) => (
              <tr key={`${row.engine}-${row.category}`} className="border-b border-zinc-100 dark:border-zinc-800/50">
                <td className="py-1.5 text-zinc-900 dark:text-zinc-50">{categoryLabel(row.category)}</td>
                <td className="py-1.5">
                  <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: SERIES_COLOR[row.engine].light }}
                    />
                    {ENGINE_LABEL[row.engine]}
                  </span>
                </td>
                <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">{row.turns}</td>
                <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">{row.avgLatencyMs.toFixed(0)}ms</td>
                <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">${row.avgCostUsd.toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Últimos turnos</h3>
        <p className="mb-3 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Las últimas 50 clasificaciones registradas (una fila por motor), más recientes primero.
        </p>
        <table className="w-full text-left text-xs">
          <thead className="text-zinc-500 dark:text-zinc-400">
            <tr className="border-b border-zinc-200 dark:border-zinc-800">
              <th className="py-1.5 font-normal">Hora</th>
              <th className="py-1.5 font-normal">Motor</th>
              <th className="py-1.5 font-normal">Categoría</th>
              <th className="py-1.5 text-right font-normal" title="Solo Jev expone esta métrica, calibrada por el modelo.">
                Confianza
              </th>
              <th
                className="py-1.5 text-center font-normal"
                title="El motor marcó que hacía falta pedirle más contexto al cliente antes de derivar."
              >
                ¿Ambiguo?
              </th>
              <th className="py-1.5 text-right font-normal">Latencia</th>
              <th className="py-1.5 text-right font-normal">Costo</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.recent.length === 0 && (
              <tr>
                <td colSpan={7} className="py-3 text-center text-zinc-500">
                  Sin datos todavía.
                </td>
              </tr>
            )}
            {data.recent.map((t) => (
              <tr key={t.id} className="border-b border-zinc-100 dark:border-zinc-800/50">
                <td className="py-1.5 text-zinc-600 dark:text-zinc-400">
                  {new Date(t.createdAt).toLocaleTimeString("es-CL")}
                </td>
                <td className="py-1.5">
                  <span className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-400">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLOR[t.engine].light }} />
                    {ENGINE_LABEL[t.engine]}
                  </span>
                </td>
                <td className="py-1.5 text-zinc-900 dark:text-zinc-50">{categoryLabel(t.category)}</td>
                <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">
                  {t.confidence !== null ? `${(t.confidence * 100).toFixed(0)}%` : "—"}
                </td>
                <td className="py-1.5 text-center">{t.needsMoreContext ? "⚠️" : ""}</td>
                <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">{t.latencyMs}ms</td>
                <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">
                  ${Number(t.costUsd).toFixed(6)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
