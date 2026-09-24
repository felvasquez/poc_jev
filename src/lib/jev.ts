import { TypeSafeClient, choice, noul } from "@typesafe-ai/sdk";
import type { AppSettings } from "./settings";

// Jev pricing (early access, Sept 2026): $0.042 / 1M input tokens, output free.
export const JEV_INPUT_COST_PER_TOKEN = 0.042 / 1_000_000;

let _client: TypeSafeClient | null = null;
function getClient() {
  if (!_client) _client = new TypeSafeClient();
  return _client;
}

export interface JevClassification {
  category: string;
  confidence: number;
  probabilities: Record<string, number>;
  needsMoreContext: boolean;
  clarifyProbability: number;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  request: unknown;
  response: unknown;
}

export async function classifyWithJev(message: string, settings: AppSettings): Promise<JevClassification> {
  const client = getClient();
  const start = performance.now();

  const criteria = Object.fromEntries(settings.categories.map((c) => [c.key, c.description]));

  // Two questions, one request: the category choice plus a dedicated noul
  // asking whether the message is ambiguous. Fan-out pricing means this
  // costs only the extra question's own tokens, not a second round trip.
  // The noul gets the category list in its own instructions (not in state,
  // which the choice also reads): without it, it can't judge "ambiguous
  // between categories" and flags clear messages like restaurant discounts.
  const request = {
    state: { message },
    questions: {
      intent: choice(settings.jevInstructions, criteria),
      clarity: noul(
        { pregunta: settings.jevClarifyInstructions, categorias: criteria },
        {
          true: "El mensaje encaja razonablemente en dos o más categorías distintas, o no encaja en ninguna.",
          false: "Hay una categoría que claramente corresponde, aunque falten detalles para responder la consulta.",
        },
      ),
    },
    model: settings.jevModel,
  };
  const result = await client.systemOne(request);
  const { answers, model, usage } = result;

  const latencyMs = performance.now() - start;
  const intent = answers.intent;
  const clarifyProbability = answers.clarity.noul;

  return {
    category: intent.choice,
    confidence: intent.confidence,
    probabilities: intent.probabilities,
    needsMoreContext: clarifyProbability >= settings.clarifyThreshold,
    clarifyProbability,
    model,
    latencyMs,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUsd: usage.input_tokens * JEV_INPUT_COST_PER_TOKEN,
    request,
    response: result,
  };
}
