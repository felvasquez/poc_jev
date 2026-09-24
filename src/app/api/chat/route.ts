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

  try {
    if (conversation.stage === "identifying") {
      const result = await identifyCustomer(conversationId, message);
      return NextResponse.json(result);
    }

    const result = await runTurn(message, conversationId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("chat pipeline failed", err);
    const detail = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: "pipeline_failed", detail }, { status: 502 });
  }
}
