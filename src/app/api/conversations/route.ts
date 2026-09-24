import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { conversations, turnMetrics } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const convs = await db.select().from(conversations).orderBy(desc(conversations.createdAt)).limit(50);

  const counts = await db
    .select({
      conversationId: turnMetrics.conversationId,
      turns: sql<number>`count(distinct ${turnMetrics.userMessageId})::int`,
    })
    .from(turnMetrics)
    .groupBy(turnMetrics.conversationId);

  const countByConv = new Map(counts.map((c) => [c.conversationId, c.turns]));

  return NextResponse.json({
    conversations: convs.map((c) => ({
      id: c.id,
      stage: c.stage,
      createdAt: c.createdAt,
      turns: countByConv.get(c.id) ?? 0,
    })),
  });
}
