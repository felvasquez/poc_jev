import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { settings, type CategoryConfig } from "@/db/schema";

export type { CategoryConfig };

export interface AppSettings {
  categories: CategoryConfig[];
  jevModel: string;
  jevInstructions: string;
  jevClarifyInstructions: string;
  clarifyThreshold: number;
  llmModel: string;
  llmSystemPromptPrefix: string;
  llmClarifyInstructions: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  categories: [
    { key: "tarjeta_credito", label: "Tarjeta de crédito", description: "Consultas sobre tarjetas de crédito: cupos, estados de cuenta, activación, bloqueo, cargos." },
    { key: "tarjeta_debito", label: "Tarjeta de débito", description: "Consultas sobre tarjetas de débito: saldos, bloqueo/desbloqueo, reposición, uso en el exterior." },
    { key: "credito_consumo", label: "Crédito de consumo", description: "Créditos de consumo: simulación, solicitud, cuotas, prepago, refinanciamiento." },
    { key: "avances_credito", label: "Avances / superavances", description: "Avances y superavances sobre la línea de la tarjeta de crédito: montos disponibles, tasas, solicitud." },
    { key: "loyalty", label: "Loyalty (puntos y millas)", description: "Programa de puntos/millas: acumulación, consulta de saldo de puntos, canje por productos o millas." },
    { key: "beneficios", label: "Beneficios", description: "Beneficios y promociones asociadas a productos del banco: descuentos, cuotas sin interés, alianzas comerciales." },
    { key: "transferencias", label: "Transferencias", description: "Transferencias entre cuentas propias, a terceros, u otros bancos: límites, estado, reclamos." },
    { key: "inversiones", label: "Inversiones", description: "Productos de inversión: depósitos a plazo, fondos mutuos, rentabilidad, apertura y rescate." },
    { key: "otro", label: "Otro", description: "Cualquier consulta que no encaje claramente en las categorías anteriores." },
  ],
  jevModel: "jev-latest",
  jevInstructions: "¿Sobre qué producto o servicio bancario es esta consulta?",
  jevClarifyInstructions:
    "¿El mensaje es ambiguo entre dos o más de estas categorías, o no encaja en ninguna? Ignora si faltan detalles para responder la consulta (qué tarjeta, qué fecha, qué monto); solo importa si se puede elegir la categoría a la que derivar.",
  clarifyThreshold: 0.5,
  llmModel: "gpt-5.6-luna",
  llmSystemPromptPrefix:
    "Eres un clasificador de intención para un banco. Dado el mensaje de un cliente, elige la categoría de producto/servicio bancario que mejor corresponde.",
  llmClarifyInstructions:
    "Además, marca needsClarification en true si el mensaje no da información suficiente para elegir la categoría con confianza (es ambiguo entre varias categorías, o no menciona ningún producto o servicio bancario reconocible). Si está claro, marca needsClarification en false.",
};

export async function getSettings(): Promise<AppSettings> {
  const db = getDb();
  const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
  if (row) {
    return {
      categories: row.categories,
      jevModel: row.jevModel,
      jevInstructions: row.jevInstructions,
      jevClarifyInstructions: row.jevClarifyInstructions,
      clarifyThreshold: row.clarifyThreshold,
      llmModel: row.llmModel,
      llmSystemPromptPrefix: row.llmSystemPromptPrefix,
      llmClarifyInstructions: row.llmClarifyInstructions,
    };
  }

  await db.insert(settings).values({ id: 1, ...DEFAULT_SETTINGS }).onConflictDoNothing();
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const db = getDb();
  const current = await getSettings();
  const next: AppSettings = { ...current, ...patch };

  await db
    .insert(settings)
    .values({ id: 1, ...next })
    .onConflictDoUpdate({ target: settings.id, set: { ...next, updatedAt: new Date() } });

  return next;
}
