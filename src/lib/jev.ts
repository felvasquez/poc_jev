import { TypeSafeClient, choice, noul, score } from "@typesafe-ai/sdk";
import type { AppSettings } from "./settings";

// Jev pricing (early access, Sept 2026): $0.042 / 1M input tokens, output free.
export const JEV_INPUT_COST_PER_TOKEN = 0.042 / 1_000_000;

// Ordered rubric for the anger/frustration `score` question, level 0 to 3.
// Kept in code (not settings) same as the clarity noul's true/false criteria
// below — only the question's instructions are operator-configurable.
const ANGER_CRITERIA = [
  "Tono neutral, cordial o simplemente informativo, sin señales de frustración.",
  "Impaciencia o fastidio leve, sin lenguaje agresivo (ej. \"llevo un rato esperando\").",
  "Frustración clara: quejas directas, tono cortante, repetición de un reclamo.",
  "Enojo explícito: lenguaje agresivo, insultos, o amenazas de reclamo formal / cerrar la cuenta.",
] as const;

let _client: TypeSafeClient | null = null;
function getClient() {
  if (!_client) _client = new TypeSafeClient();
  return _client;
}

// Reads the anger score straight off a stored Jev response (rawResponse from
// turn_metrics) instead of re-deriving it — used both right after a fresh
// classifyWithJev call and when replaying a conversation from the DB, so the
// displayed level/label always comes from what Jev actually answered, never
// a value recomputed from scratch.
export function angerFromResponse(
  response: unknown,
): { angerScore: number; angerLevel: number; angerLabel: string } | null {
  const anger = (response as { answers?: { anger?: { score: number; legend: Record<string, string> } } })?.answers
    ?.anger;
  if (!anger) return null;
  const angerLevel = Math.round(anger.score);
  return {
    angerScore: anger.score / (ANGER_CRITERIA.length - 1),
    angerLevel,
    angerLabel: anger.legend[String(angerLevel)] ?? ANGER_CRITERIA[angerLevel],
  };
}

export interface JevClassification {
  category: string;
  confidence: number;
  probabilities: Record<string, number>;
  needsMoreContext: boolean;
  clarifyProbability: number;
  // Normalized 0-1 position on ANGER_CRITERIA (raw score / (levels - 1)), plus
  // the rounded rubric level and Jev's own wording for it — the UI shows
  // angerLabel verbatim rather than inventing its own "angry/not angry" call.
  angerScore: number;
  angerLevel: number;
  angerLabel: string;
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

  // Three questions, one request: the category choice, a noul asking whether
  // the message is ambiguous, and a score for how angry/frustrated the
  // customer sounds. Fan-out pricing means each extra question only costs
  // its own tokens, not a second round trip. The noul gets the category list
  // in its own instructions (not in state, which the choice also reads):
  // without it, it can't judge "ambiguous between categories" and flags
  // clear messages like restaurant discounts. The anger score doesn't need
  // the category list — it only reads the message itself.
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
      anger: score(settings.jevAngerInstructions, ANGER_CRITERIA),
    },
    model: settings.jevModel,
  };
  const result = await client.systemOne(request);
  const { answers, model, usage } = result;

  const latencyMs = performance.now() - start;
  const intent = answers.intent;
  const clarifyProbability = answers.clarity.noul;
  const { angerScore, angerLevel, angerLabel } = angerFromResponse(result)!;

  return {
    category: intent.choice,
    confidence: intent.confidence,
    probabilities: intent.probabilities,
    needsMoreContext: clarifyProbability >= settings.clarifyThreshold,
    clarifyProbability,
    angerScore,
    angerLevel,
    angerLabel,
    model,
    latencyMs,
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    costUsd: usage.input_tokens * JEV_INPUT_COST_PER_TOKEN,
    request,
    response: result,
  };
}
