import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { conversations } from "@/db/schema";
import { runTurn } from "@/lib/pipeline";
import { identifyCustomer } from "@/lib/onboarding";

const bodySchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { message, conversationId } = parsed.data;
  const db = getDb();

  const [conversation] = await db
    .select({ stage: conversations.stage })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return NextResponse.json({ error: "conversation_not_found" }, { status: 404 });
  }

  if (conversation.stage === "identifying") {
    try {
      const result = await identifyCustomer(conversationId, message);
      return NextResponse.json(result);
    } catch (err) {
      console.error("chat pipeline failed", err);
      const detail = err instanceof Error ? err.message : "unknown error";
      return NextResponse.json({ error: "pipeline_failed", detail }, { status: 502 });
    }
  }

  // Active stage: stream each engine's result as its own NDJSON line the
  // moment it resolves, rather than buffering both into one JSON response —
  // that's what lets the client render Jev's card well before the LLM's.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await runTurn(message, conversationId, (result) => {
          controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));
        });
      } catch (err) {
        console.error("chat pipeline failed", err);
        const detail = err instanceof Error ? err.message : "unknown error";
        controller.enqueue(encoder.encode(JSON.stringify({ turnError: detail }) + "\n"));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
