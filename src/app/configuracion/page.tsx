"use client";

import { useEffect, useState } from "react";

interface CategoryConfig {
  key: string;
  label: string;
  description: string;
}

interface AppSettings {
  categories: CategoryConfig[];
  jevModel: string;
  jevInstructions: string;
  jevClarifyInstructions: string;
  clarifyThreshold: number;
  llmModel: string;
  llmSystemPromptPrefix: string;
  llmClarifyInstructions: string;
}

export default function Configuracion() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setSettings(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error desconocido");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateCategory(index: number, patch: Partial<CategoryConfig>) {
    setSettings((s) => {
      if (!s) return s;
      const categories = s.categories.map((c, i) => (i === index ? { ...c, ...patch } : c));
      return { ...s, categories };
    });
  }

  function removeCategory(index: number) {
    setSettings((s) => (s ? { ...s, categories: s.categories.filter((_, i) => i !== index) } : s));
  }

  function addCategory() {
    setSettings((s) =>
      s ? { ...s, categories: [...s.categories, { key: "", label: "", description: "" }] } : s,
    );
  }

  async function save() {
    if (!settings) return;
    setStatus("saving");
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error ?? data));
      setSettings(data);
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
      setStatus("error");
    }
  }

  if (error && !settings) {
    return <p className="mx-auto max-w-3xl px-6 py-6 text-sm text-red-600 dark:text-red-400">{error}</p>;
  }
  if (!settings) {
    return <p className="mx-auto max-w-3xl px-6 py-6 text-sm text-zinc-500">Cargando…</p>;
  }

  const inputClass =
    "w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Configuración</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Las categorías son compartidas por ambos motores, para que la comparación siga siendo justa.
        </p>
      </div>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Categorías (compartidas)</h2>
        <div className="space-y-2">
          {settings.categories.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2fr_auto] gap-2">
              <input
                value={c.key}
                onChange={(e) => updateCategory(i, { key: e.target.value })}
                placeholder="clave (snake_case)"
                className={inputClass}
              />
              <input
                value={c.label}
                onChange={(e) => updateCategory(i, { label: e.target.value })}
                placeholder="etiqueta"
                className={inputClass}
              />
              <input
                value={c.description}
                onChange={(e) => updateCategory(i, { description: e.target.value })}
                placeholder="descripción (criterio para ambos motores)"
                className={inputClass}
              />
              <button
                onClick={() => removeCategory(i)}
                className="rounded-md px-2 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addCategory}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + Agregar categoría
        </button>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#2a78d6" }} />
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Jev</h2>
        </div>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          Modelo
          <input
            value={settings.jevModel}
            onChange={(e) => setSettings({ ...settings, jevModel: e.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          Pregunta (instructions de la choice question)
          <textarea
            value={settings.jevInstructions}
            onChange={(e) => setSettings({ ...settings, jevInstructions: e.target.value })}
            rows={2}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          Pregunta de claridad (noul, evaluada en el mismo request que la choice)
          <textarea
            value={settings.jevClarifyInstructions}
            onChange={(e) => setSettings({ ...settings, jevClarifyInstructions: e.target.value })}
            rows={2}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          Umbral para pedir más contexto (0 a 1 — si la probabilidad de la pregunta de claridad supera este valor,
          se marca la consulta como ambigua)
          <input
            type="number"
            min={0}
            max={1}
            step={0.05}
            value={settings.clarifyThreshold}
            onChange={(e) => setSettings({ ...settings, clarifyThreshold: Number(e.target.value) })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: "#eb6834" }} />
          <h2 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">LLM</h2>
        </div>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          Modelo (AI Gateway model id de OpenAI)
          <input
            value={settings.llmModel}
            onChange={(e) => setSettings({ ...settings, llmModel: e.target.value })}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          System prompt (el listado de categorías se agrega automáticamente después de este texto)
          <textarea
            value={settings.llmSystemPromptPrefix}
            onChange={(e) => setSettings({ ...settings, llmSystemPromptPrefix: e.target.value })}
            rows={3}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          Instrucción de claridad (le agrega al LLM un campo booleano needsClarification, en el mismo request)
          <textarea
            value={settings.llmClarifyInstructions}
            onChange={(e) => setSettings({ ...settings, llmClarifyInstructions: e.target.value })}
            rows={3}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          {status === "saving" ? "Guardando…" : "Guardar cambios"}
        </button>
        {status === "saved" && <span className="text-sm text-green-600 dark:text-green-400">Guardado ✅</span>}
        {status === "error" && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
      </div>
    </div>
  );
}
