import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversations, messages, turnMetrics, type Engine } from "@/db/schema";
import { angerFromResponse } from "@/lib/jev";

export const dynamic = "force-dynamic";

interface EngineEntry {
  category: string;
  confidence: number | null;
  needsMoreContext: boolean;
  clarifyProbability: number | null;
  angerScore: number | null;
  angerLevel: number | null;
  angerLabel: string | null;
  latencyMs: number;
  costUsd: number;
  request: unknown;
  response: unknown;
}

type Entry =
  | { kind: "text"; role: "user" | "assistant"; content: string }
  | {
      kind: "comparison";
      jev: EngineEntry & { engine: "jev" };
      llm: EngineEntry & { engine: "llm" };
    };

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();

  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);

  const metrics = await db
    .select()
    .from(turnMetrics)
    .where(eq(turnMetrics.conversationId, id))
    .orderBy(turnMetrics.createdAt);

  const byUserMessage = new Map<string, Partial<Record<Engine, (typeof metrics)[number]>>>();
  for (const m of metrics) {
    const pair = byUserMessage.get(m.userMessageId) ?? {};
    pair[m.engine] = m;
    byUserMessage.set(m.userMessageId, pair);
  }

  const entries: Entry[] = [];
  for (const msg of msgs) {
    const pair = msg.role === "user" ? byUserMessage.get(msg.id) : undefined;
    if (pair?.jev && pair?.llm) {
      // angerLevel/angerLabel aren't their own columns — derived here from the
      // stored raw response so the replayed label always matches what Jev
      // actually said, rather than a copy that could drift from it.
      const anger = angerFromResponse(pair.jev.rawResponse);
      entries.push({ kind: "text", role: "user", content: msg.content });
      entries.push({
        kind: "comparison",
        jev: {
          engine: "jev",
          category: pair.jev.category,
          confidence: pair.jev.confidence,
          needsMoreContext: pair.jev.needsMoreContext,
          clarifyProbability: pair.jev.clarifyProbability,
          angerScore: pair.jev.angerScore,
          angerLevel: anger?.angerLevel ?? null,
          angerLabel: anger?.angerLabel ?? null,
          latencyMs: pair.jev.latencyMs,
          costUsd: Number(pair.jev.costUsd),
          request: pair.jev.rawRequest,
          response: pair.jev.rawResponse,
        },
        llm: {
          engine: "llm",
          category: pair.llm.category,
          confidence: pair.llm.confidence,
          needsMoreContext: pair.llm.needsMoreContext,
          clarifyProbability: pair.llm.clarifyProbability,
          angerScore: pair.llm.angerScore,
          angerLevel: null,
          angerLabel: null,
          latencyMs: pair.llm.latencyMs,
          costUsd: Number(pair.llm.costUsd),
          request: pair.llm.rawRequest,
          response: pair.llm.rawResponse,
        },
      });
    } else {
      entries.push({ kind: "text", role: msg.role, content: msg.content });
    }
  }

  return NextResponse.json({ conversationId: id, stage: conversation.stage, entries });
}
