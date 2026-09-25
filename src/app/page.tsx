"use client";

import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SERIES_COLOR } from "@/components/grouped-bar-chart";
import { CONVERSATION_ID_KEY } from "@/lib/storage-keys";

interface EngineResult {
  engine: "jev" | "llm";
  category: string;
  confidence: number | null;
  needsMoreContext: boolean;
  clarifyProbability: number | null;
  angerScore: number | null;
  angerLevel: number | null;
  angerLabel: string | null;
  latencyMs: number;
  costUsd: number;
  request?: unknown;
  response?: unknown;
}

interface EngineError {
  engine: "jev" | "llm";
  error: string;
}

// null = still streaming in, hasn't resolved yet.
type EngineSlot = EngineResult | EngineError | null;

// Color scales with the rubric level Jev actually returned (1-3) — not with
// an angerScore cutoff we'd be inventing on top of it. Level 0 (neutral)
// renders nothing, same as the other badges below.
const ANGER_BADGE_CLASS: Record<number, string> = {
  1: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  2: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  3: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300",
};

type Entry =
  | { kind: "text"; role: "user" | "assistant"; content: string }
  | { kind: "comparison"; jev: EngineSlot; llm: EngineSlot };

const ENGINE_LABEL: Record<"jev" | "llm", string> = { jev: "Jev", llm: "LLM" };

// Tokenizes pretty-printed JSON for read-only syntax highlighting. Matches
// the classic "one regex over the stringified output" approach: strings
// (further split into keys vs. values by a trailing colon), numbers, and
// literals get their own span; everything else (braces, commas, whitespace)
// is left as plain text so punctuation recedes and data pops.
const JSON_TOKEN_RE =
  /("(?:\\u[a-fA-F0-9]{4}|\\.|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

function tokenizeJson(json: string): { text: string; className: string | null }[] {
  const tokens: { text: string; className: string | null }[] = [];
  let lastIndex = 0;
  for (const match of json.matchAll(JSON_TOKEN_RE)) {
    const text = match[0];
    const index = match.index ?? 0;
    if (index > lastIndex) tokens.push({ text: json.slice(lastIndex, index), className: null });

    let className = "text-amber-700 dark:text-amber-400"; // number
    if (text.startsWith('"')) {
      className = /:\s*$/.test(text)
        ? "text-zinc-600 dark:text-zinc-300"
        : "text-emerald-700 dark:text-emerald-400";
    } else if (text === "true" || text === "false") {
      className = "text-violet-700 dark:text-violet-400";
    } else if (text === "null") {
      className = "italic text-zinc-400 dark:text-zinc-600";
    }
    tokens.push({ text, className });
    lastIndex = index + text.length;
  }
  if (lastIndex < json.length) tokens.push({ text: json.slice(lastIndex), className: null });
  return tokens;
}

function JsonCode({ value }: { value: unknown }) {
  const json = useMemo(() => JSON.stringify(value, null, 2) ?? "null", [value]);
  const tokens = useMemo(() => tokenizeJson(json), [json]);
  return (
    <code>
      {tokens.map((t, i) =>
        t.className ? (
          <span key={i} className={t.className}>
            {t.text}
          </span>
        ) : (
          t.text
        ),
      )}
    </code>
  );
}

function CopyIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function BracesIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 3a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2M16 3a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2" />
    </svg>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard unavailable (e.g. insecure context) — silently skip
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

function JsonPane({ title, value }: { title: string; value: unknown }) {
  const json = useMemo(() => JSON.stringify(value, null, 2) ?? "null", [value]);
  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2">
        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{title}</span>
        <CopyButton value={json} />
      </div>
      <pre className="flex-1 overflow-auto whitespace-pre-wrap break-words px-4 pb-4 font-mono text-xs leading-relaxed text-zinc-400 dark:text-zinc-600">
        <JsonCode value={value} />
      </pre>
    </div>
  );
}

function DetailModal({
  result,
  categoryLabel,
  onClose,
}: {
  result: EngineResult;
  categoryLabel: string;
  onClose: () => void;
}) {
  const color = SERIES_COLOR[result.engine].light;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px] dark:bg-black/70"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Request y response — ${ENGINE_LABEL[result.engine]}`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[90vh] w-[95vw] max-w-6xl flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{ENGINE_LABEL[result.engine]}</span>
            </div>
            <p className="mt-0.5 font-medium text-zinc-900 dark:text-zinc-50">Derivación: {categoryLabel}</p>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              {result.confidence !== null && <span>confianza: {(result.confidence * 100).toFixed(0)}%</span>}
              {result.clarifyProbability !== null && (
                <span>noul ambigüedad: {(result.clarifyProbability * 100).toFixed(0)}%</span>
              )}
              {result.angerLabel !== null && (
                <span>
                  score enojo: {result.angerLabel} ({(result.angerScore! * 100).toFixed(0)}%)
                </span>
              )}
              <span>latencia: {result.latencyMs.toFixed(0)}ms</span>
              <span>costo: ${result.costUsd.toFixed(6)}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-2 divide-y divide-zinc-200 overflow-hidden md:grid-cols-2 md:grid-rows-1 md:divide-x md:divide-y-0 dark:divide-zinc-800">
          <JsonPane title="Request" value={result.request} />
          <JsonPane title="Response" value={result.response} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EngineCardShell({ engine, children }: { engine: "jev" | "llm"; children: ReactNode }) {
  const color = SERIES_COLOR[engine].light;
  return (
    <div className="flex-1 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{ENGINE_LABEL[engine]}</span>
      </div>
      {children}
    </div>
  );
}

function EngineCard({
  engine,
  result,
  categoryLabel,
}: {
  engine: "jev" | "llm";
  result: EngineSlot;
  categoryLabel: (key: string) => string;
}) {
  const [open, setOpen] = useState(false);

  // Still in flight — this is the whole point: Jev's slot fills in first,
  // the LLM's stays here until its (much slower) response lands.
  if (result === null) {
    return (
      <EngineCardShell engine={engine}>
        <p className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-500 dark:border-zinc-700 dark:border-t-zinc-400" />
          Derivando…
        </p>
      </EngineCardShell>
    );
  }

  if ("error" in result) {
    return (
      <EngineCardShell engine={engine}>
        <p className="text-xs text-red-700 dark:text-red-400">Error: {result.error}</p>
      </EngineCardShell>
    );
  }

  const hasDetail = result.request !== undefined || result.response !== undefined;

  return (
    <div className="flex-1 rounded-xl border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLOR[engine].light }} />
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{ENGINE_LABEL[engine]}</span>
      </div>
      <p className="font-medium text-zinc-900 dark:text-zinc-50">
        Derivación: {categoryLabel(result.category)}
      </p>
      {result.needsMoreContext && (
        <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          ⚠️ Necesita más contexto
        </p>
      )}
      {result.angerLevel !== null && result.angerLevel > 0 && (
        <p
          title="Nivel del rubric de enojo/frustración que Jev asignó a este mensaje (texto tal cual lo devuelve la pregunta score)"
          className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${ANGER_BADGE_CLASS[result.angerLevel]}`}
        >
          😠 {result.angerLabel}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-zinc-200 pt-2 text-[11px] text-zinc-500 dark:border-zinc-800">
        {result.confidence !== null && <span>confianza: {(result.confidence * 100).toFixed(0)}%</span>}
        {result.clarifyProbability !== null && (
          <span title="Probabilidad de que el mensaje sea ambiguo entre categorías (respuesta del noul de ambigüedad)">
            noul ambigüedad: {(result.clarifyProbability * 100).toFixed(0)}%
          </span>
        )}
        {result.angerLabel !== null && (
          <span title="Nivel del rubric de enojo/frustración que Jev asignó a este mensaje, con el score normalizado entre paréntesis">
            enojo: {result.angerLabel} ({(result.angerScore! * 100).toFixed(0)}%)
          </span>
        )}
        <span>latencia: {result.latencyMs.toFixed(0)}ms</span>
        <span>costo: ${result.costUsd.toFixed(6)}</span>
        {hasDetail && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-0.5 font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <BracesIcon /> Ver payload
          </button>
        )}
      </div>
      {open && hasDetail && (
        <DetailModal result={result} categoryLabel={categoryLabel(result.category)} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

export default function Chat() {
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);

  function categoryLabel(key: string) {
    return categoryLabels[key] ?? key;
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries, loading]);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: { categories: { key: string; label: string }[] }) => {
        setCategoryLabels(Object.fromEntries(data.categories.map((c) => [c.key, c.label])));
      })
      .catch(() => {});
  }, []);

  async function beginNewConversation() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/start", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Error desconocido");
      localStorage.setItem(CONVERSATION_ID_KEY, data.conversationId);
      setConversationId(data.conversationId);
      setEntries([{ kind: "text", role: "assistant", content: data.reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setStarting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const savedId = localStorage.getItem(CONVERSATION_ID_KEY);
      if (savedId) {
        try {
          const res = await fetch(`/api/conversations/${savedId}`);
          if (res.ok) {
            const data = await res.json();
            if (cancelled) return;
            setConversationId(data.conversationId);
            setEntries(data.entries);
            setStarting(false);
            return;
          }
        } catch {
          // fall through to starting a new conversation
        }
      }
      if (!cancelled) await beginNewConversation();
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function send() {
    const message = input.trim();
    if (!message || loading || !conversationId) return;

    setInput("");
    setError(null);
    setEntries((e) => [...e, { kind: "text", role: "user", content: message }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      });

      const isStream = res.headers.get("content-type")?.includes("ndjson");
      if (!isStream) {
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail ?? data.error ?? "Error desconocido");
        setEntries((e) => [...e, { kind: "text", role: "assistant", content: data.reply }]);
        return;
      }

      if (!res.body) throw new Error("Respuesta sin body de streaming");

      // Placeholder pair — each slot fills in independently as its own
      // NDJSON line arrives, instead of waiting for both engines together.
      setEntries((e) => [...e, { kind: "comparison", jev: null, llm: null }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (!line) continue;
          const parsed = JSON.parse(line);
          if ("turnError" in parsed) {
            setError(parsed.turnError);
            continue;
          }
          setEntries((entries) => {
            const last = entries[entries.length - 1];
            if (last.kind !== "comparison") return entries;
            const updated = { ...last, [parsed.engine]: parsed };
            return [...entries.slice(0, -1), updated];
          });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Chat de atención al cliente de un banco. Cada consulta se deriva con Jev y con el LLM en paralelo.
        </p>
        <button
          onClick={beginNewConversation}
          disabled={starting}
          className="shrink-0 rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Nueva conversación
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
        {entries.map((entry, i) => {
          if (entry.kind === "comparison") {
            return (
              <div key={i} className="flex gap-3">
                <EngineCard engine="jev" result={entry.jev} categoryLabel={categoryLabel} />
                <EngineCard engine="llm" result={entry.llm} categoryLabel={categoryLabel} />
              </div>
            );
          }
          return (
            <div key={i} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  entry.role === "user"
                    ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
                    : "bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-50"
                }`}
              >
                <p className="whitespace-pre-wrap">{entry.content}</p>
              </div>
            </div>
          );
        })}
        {starting && <p className="text-sm text-zinc-500">Iniciando conversación…</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escribí tu consulta…"
          className="flex-1 rounded-full border border-zinc-300 px-4 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          type="submit"
          disabled={loading || starting || !input.trim() || !conversationId}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white disabled:opacity-40 dark:bg-zinc-50 dark:text-zinc-900"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
