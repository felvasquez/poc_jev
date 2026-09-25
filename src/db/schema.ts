import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  numeric,
  real,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

export interface CategoryConfig {
  key: string;
  label: string;
  description: string;
}

export const roleValues = ["user", "assistant"] as const;
export type Role = (typeof roleValues)[number];

export const stageValues = ["identifying", "active"] as const;
export type Stage = (typeof stageValues)[number];

export const engineValues = ["jev", "llm"] as const;
export type Engine = (typeof engineValues)[number];

export const conversations = pgTable("conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  // "identifying": scripted greeting + fake customer identification, shared
  // overhead kept out of the jev/llm comparison. "active": every user
  // message from here on is classified by both engines in parallel.
  stage: text("stage").$type<Stage>().notNull().default("identifying"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").$type<Role>().notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// One row per (user message, engine): every active-stage message is
// classified by both Jev and the LLM classifier on the same input, so rows
// come in pairs sharing userMessageId — a true paired comparison, no
// response-generation step (that's identical across engines and was pure
// noise on top of the signal we actually want to compare).
export const turnMetrics = pgTable("turn_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  conversationId: uuid("conversation_id")
    .references(() => conversations.id, { onDelete: "cascade" })
    .notNull(),
  userMessageId: uuid("user_message_id")
    .references(() => messages.id, { onDelete: "cascade" })
    .notNull(),
  engine: text("engine").$type<Engine>().notNull(),

  category: text("category").notNull(),
  confidence: real("confidence"),
  probabilities: jsonb("probabilities").$type<Record<string, number>>(),
  // Whether this engine flagged the message as too ambiguous to route with
  // confidence. Jev: a dedicated `noul` question in the same request,
  // thresholded by settings.clarifyThreshold (clarifyProbability holds the
  // raw probability). LLM: a self-reported boolean field alongside category,
  // no raw probability available (clarifyProbability stays null).
  needsMoreContext: boolean("needs_more_context").notNull().default(false),
  clarifyProbability: real("clarify_probability"),
  // Normalized 0-1 anger/frustration level (Jev only, from a dedicated
  // `score` question over the same rubric as ANGER_CRITERIA in lib/jev.ts).
  // The LLM engine has no equivalent question, so this stays null for it.
  angerScore: real("anger_score"),
  model: text("model").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costUsd: numeric("cost_usd", { precision: 12, scale: 8 }).notNull(),

  // Exact request/response payloads for the "inspect" panel in the chat UI.
  // Jev: the systemOne request object and its SystemOneResult. LLM: the raw
  // HTTP body sent to the provider and the raw HTTP response body.
  rawRequest: jsonb("raw_request").$type<unknown>(),
  rawResponse: jsonb("raw_response").$type<unknown>(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Singleton row (id = 1): the shared category taxonomy plus per-engine
// configuration, so Jev and the LLM always classify into the same set of
// products (fair comparison) while each engine's own framing (Jev's
// question text vs. the LLM's system prompt) stays independently tunable.
export const settings = pgTable("settings", {
  id: integer("id").primaryKey(),
  categories: jsonb("categories").$type<CategoryConfig[]>().notNull(),
  jevModel: text("jev_model").notNull(),
  jevInstructions: text("jev_instructions").notNull(),
  jevClarifyInstructions: text("jev_clarify_instructions").notNull(),
  // DB-level default backfills the existing settings row on push; the app
  // always supplies its own value on insert/update (see DEFAULT_SETTINGS).
  jevAngerInstructions: text("jev_anger_instructions")
    .notNull()
    .default("¿Qué tan enojado o frustrado está el cliente en este mensaje?"),
  clarifyThreshold: real("clarify_threshold").notNull(),
  llmModel: text("llm_model").notNull(),
  llmSystemPromptPrefix: text("llm_system_prompt_prefix").notNull(),
  llmClarifyInstructions: text("llm_clarify_instructions").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
