import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import type { AppSettings } from "./settings";

// Calling OpenAI directly (not through Vercel AI Gateway) to use existing
// OpenAI credits instead of requiring a card on file with Vercel.
const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// There's deliberately no response-generation step: that would be identical
// across engines and its latency (multi-second) would swamp the signal
// we're actually measuring (the derivation step itself).
const CLASSIFY_INPUT_COST_PER_TOKEN = 0.0000002;
const CLASSIFY_OUTPUT_COST_PER_TOKEN = 0.0000012;

export interface LlmClassification {
  category: string;
  needsMoreContext: boolean;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  request: unknown;
  response: unknown;
}

export async function classifyWithLlm(message: string, settings: AppSettings): Promise<LlmClassification> {
  const start = performance.now();

  const keys = settings.categories.map((c) => c.key) as [string, ...string[]];
  // No calibrated probability is available from structured output, so the
  // model self-reports ambiguity as a boolean field alongside the category
  // — same request, no extra latency, mirroring Jev's paired-question shape.
  const schema = z.object({
    category: z.enum(keys),
    needsClarification: z.boolean(),
  });
  const model = openai(settings.llmModel);
  const system =
    settings.llmSystemPromptPrefix +
    "\n\n" +
    settings.categories.map((c) => `- ${c.key}: ${c.description}`).join("\n") +
    "\n\n" +
    settings.llmClarifyInstructions;

  const { object, usage, response, request } = await generateObject({
    model,
    schema,
    system,
    prompt: message,
  });

  const latencyMs = performance.now() - start;
  const inputTokens = usage.inputTokens ?? 0;
  const outputTokens = usage.outputTokens ?? 0;

  return {
    category: object.category,
    needsMoreContext: object.needsClarification,
    model: response.modelId ?? settings.llmModel,
    latencyMs,
    inputTokens,
    outputTokens,
    costUsd: inputTokens * CLASSIFY_INPUT_COST_PER_TOKEN + outputTokens * CLASSIFY_OUTPUT_COST_PER_TOKEN,
    // request.body / response.body are the raw HTTP payloads exchanged with
    // the provider; fall back to the SDK-level view if a provider doesn't
    // surface them (not all transports do).
    request: request.body ?? { model: settings.llmModel, system, prompt: message },
    response: response.body ?? { id: response.id, modelId: response.modelId, object, usage },
  };
}
