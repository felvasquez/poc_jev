import { getDb } from "@/db";
import { messages, turnMetrics, type Engine } from "@/db/schema";
import { classifyWithJev, JEV_INPUT_COST_PER_TOKEN } from "./jev";
import { classifyWithLlm } from "./llm";
import { getSettings } from "./settings";

export interface EngineResult {
  engine: Engine;
  category: string;
  confidence: number | null;
  needsMoreContext: boolean;
  clarifyProbability: number | null;
  latencyMs: number;
  costUsd: number;
  request: unknown;
  response: unknown;
}

export interface TurnResult {
  conversationId: string;
  jev: EngineResult;
  llm: EngineResult;
}

// Classifies the same message with both engines in parallel, against the
// same shared category taxonomy — a paired comparison on identical input,
// so latency/cost differences reflect the engines themselves rather than
// prompt or taxonomy variance between modes.
export async function runTurn(message: string, conversationId: string): Promise<TurnResult> {
  const db = getDb();
  const settings = await getSettings();

  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId, role: "user", content: message })
    .returning({ id: messages.id });

  const [jev, llm] = await Promise.all([
    classifyWithJev(message, settings),
    classifyWithLlm(message, settings),
  ]);

  await db.insert(turnMetrics).values([
    {
      conversationId,
      userMessageId: userMessage.id,
      engine: "jev" as const,
      category: jev.category,
      confidence: jev.confidence,
      probabilities: jev.probabilities,
      needsMoreContext: jev.needsMoreContext,
      clarifyProbability: jev.clarifyProbability,
      model: jev.model,
      latencyMs: Math.round(jev.latencyMs),
      inputTokens: jev.inputTokens,
      outputTokens: jev.outputTokens,
      costUsd: jev.costUsd.toFixed(8),
      rawRequest: jev.request,
      rawResponse: jev.response,
    },
    {
      conversationId,
      userMessageId: userMessage.id,
      engine: "llm" as const,
      category: llm.category,
      confidence: null,
      probabilities: undefined,
      needsMoreContext: llm.needsMoreContext,
      clarifyProbability: null,
      model: llm.model,
      latencyMs: Math.round(llm.latencyMs),
      inputTokens: llm.inputTokens,
      outputTokens: llm.outputTokens,
      costUsd: llm.costUsd.toFixed(8),
      rawRequest: llm.request,
      rawResponse: llm.response,
    },
  ]);

  return {
    conversationId,
    jev: {
      engine: "jev",
      category: jev.category,
      confidence: jev.confidence,
      needsMoreContext: jev.needsMoreContext,
      clarifyProbability: jev.clarifyProbability,
      latencyMs: jev.latencyMs,
      costUsd: jev.costUsd,
      request: jev.request,
      response: jev.response,
    },
    llm: {
      engine: "llm",
      category: llm.category,
      confidence: null,
      needsMoreContext: llm.needsMoreContext,
      clarifyProbability: null,
      latencyMs: llm.latencyMs,
      costUsd: llm.costUsd,
      request: llm.request,
      response: llm.response,
    },
  };
}

export { JEV_INPUT_COST_PER_TOKEN };
