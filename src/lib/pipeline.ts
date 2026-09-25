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
  angerScore: number | null;
  angerLevel: number | null;
  angerLabel: string | null;
  latencyMs: number;
  costUsd: number;
  request: unknown;
  response: unknown;
}

export type EngineMessage = EngineResult | { engine: Engine; error: string };

// Classifies the same message with both engines independently — each writes
// its own turn_metrics row and is handed to onResult the moment it resolves,
// instead of both being held back until the slower one finishes. That's the
// whole point: the caller can show Jev's card land well before the LLM's.
export async function runTurn(
  message: string,
  conversationId: string,
  onResult: (result: EngineMessage) => void,
): Promise<void> {
  const db = getDb();
  const settings = await getSettings();

  const [userMessage] = await db
    .insert(messages)
    .values({ conversationId, role: "user", content: message })
    .returning({ id: messages.id });

  async function runJev() {
    try {
      const jev = await classifyWithJev(message, settings);
      await db.insert(turnMetrics).values({
        conversationId,
        userMessageId: userMessage.id,
        engine: "jev",
        category: jev.category,
        confidence: jev.confidence,
        probabilities: jev.probabilities,
        needsMoreContext: jev.needsMoreContext,
        clarifyProbability: jev.clarifyProbability,
        angerScore: jev.angerScore,
        model: jev.model,
        latencyMs: Math.round(jev.latencyMs),
        inputTokens: jev.inputTokens,
        outputTokens: jev.outputTokens,
        costUsd: jev.costUsd.toFixed(8),
        rawRequest: jev.request,
        rawResponse: jev.response,
      });
      onResult({
        engine: "jev",
        category: jev.category,
        confidence: jev.confidence,
        needsMoreContext: jev.needsMoreContext,
        clarifyProbability: jev.clarifyProbability,
        angerScore: jev.angerScore,
        angerLevel: jev.angerLevel,
        angerLabel: jev.angerLabel,
        latencyMs: jev.latencyMs,
        costUsd: jev.costUsd,
        request: jev.request,
        response: jev.response,
      });
    } catch (err) {
      onResult({ engine: "jev", error: err instanceof Error ? err.message : "unknown error" });
    }
  }

  async function runLlm() {
    try {
      const llm = await classifyWithLlm(message, settings);
      await db.insert(turnMetrics).values({
        conversationId,
        userMessageId: userMessage.id,
        engine: "llm",
        category: llm.category,
        confidence: null,
        probabilities: undefined,
        needsMoreContext: llm.needsMoreContext,
        clarifyProbability: null,
        angerScore: null,
        model: llm.model,
        latencyMs: Math.round(llm.latencyMs),
        inputTokens: llm.inputTokens,
        outputTokens: llm.outputTokens,
        costUsd: llm.costUsd.toFixed(8),
        rawRequest: llm.request,
        rawResponse: llm.response,
      });
      onResult({
        engine: "llm",
        category: llm.category,
        confidence: null,
        needsMoreContext: llm.needsMoreContext,
        clarifyProbability: null,
        angerScore: null,
        angerLevel: null,
        angerLabel: null,
        latencyMs: llm.latencyMs,
        costUsd: llm.costUsd,
        request: llm.request,
        response: llm.response,
      });
    } catch (err) {
      onResult({ engine: "llm", error: err instanceof Error ? err.message : "unknown error" });
    }
  }

  await Promise.all([runJev(), runLlm()]);
}

export { JEV_INPUT_COST_PER_TOKEN };
