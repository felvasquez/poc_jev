"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CONVERSATION_ID_KEY } from "@/lib/storage-keys";

interface ConversationRow {
  id: string;
  stage: "identifying" | "active";
  createdAt: string;
  turns: number;
}

export default function Historial() {
  const [rows, setRows] = useState<ConversationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    fetch("/api/conversations")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setRows(data.conversations);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error desconocido");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function open(id: string) {
    localStorage.setItem(CONVERSATION_ID_KEY, id);
    router.push("/");
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Historial de conversaciones</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Reabrí cualquier conversación anterior para revisar sus derivaciones.
      </p>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!rows && !error && <p className="mt-4 text-sm text-zinc-500">Cargando…</p>}
      {rows && rows.length === 0 && <p className="mt-4 text-sm text-zinc-500">Todavía no hay conversaciones.</p>}

      {rows && rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th className="px-4 py-2 font-normal">Fecha</th>
                <th className="px-4 py-2 font-normal">Estado</th>
                <th className="px-4 py-2 text-right font-normal">Turnos</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800/50">
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-50">
                    {new Date(r.createdAt).toLocaleString("es-CL")}
                  </td>
                  <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">
                    {r.stage === "active" ? "Activa" : "Identificando"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-600 dark:text-zinc-400">{r.turns}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => open(r.id)}
                      className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
