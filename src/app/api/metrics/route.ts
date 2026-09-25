import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { turnMetrics } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = getDb();

  const byEngine = await db
    .select({
      engine: turnMetrics.engine,
      turns: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`avg(${turnMetrics.latencyMs})::float`,
      p95LatencyMs: sql<number>`percentile_cont(0.95) within group (order by ${turnMetrics.latencyMs})::float`,
      avgCostUsd: sql<number>`avg(${turnMetrics.costUsd})::float`,
      totalCostUsd: sql<number>`sum(${turnMetrics.costUsd})::float`,
      avgConfidence: sql<number | null>`avg(${turnMetrics.confidence})::float`,
      ambiguousRate: sql<number>`avg(case when ${turnMetrics.needsMoreContext} then 1.0 else 0.0 end)::float`,
      avgAngerScore: sql<number | null>`avg(${turnMetrics.angerScore})::float`,
    })
    .from(turnMetrics)
    .groupBy(turnMetrics.engine);

  const byCategory = await db
    .select({
      engine: turnMetrics.engine,
      category: turnMetrics.category,
      turns: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`avg(${turnMetrics.latencyMs})::float`,
      avgCostUsd: sql<number>`avg(${turnMetrics.costUsd})::float`,
    })
    .from(turnMetrics)
    .groupBy(turnMetrics.engine, turnMetrics.category)
    .orderBy(turnMetrics.category);

  const recent = await db
    .select({
      id: turnMetrics.id,
      userMessageId: turnMetrics.userMessageId,
      engine: turnMetrics.engine,
      category: turnMetrics.category,
      confidence: turnMetrics.confidence,
      needsMoreContext: turnMetrics.needsMoreContext,
      angerScore: turnMetrics.angerScore,
      latencyMs: turnMetrics.latencyMs,
      costUsd: turnMetrics.costUsd,
      createdAt: turnMetrics.createdAt,
    })
    .from(turnMetrics)
    .orderBy(sql`${turnMetrics.createdAt} desc`)
    .limit(50);

  return NextResponse.json({ byEngine, byCategory, recent });
}
