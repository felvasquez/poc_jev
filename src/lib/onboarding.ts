import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { conversations, messages } from "@/db/schema";

// Scripted, LLM-free: greeting + identification is identical overhead
// shared by both engines, so it stays out of the jev/llm comparison.
const GREETING =
  "¡Hola! Bienvenido/a a la atención de tu banco. Para comenzar, ¿podrías indicarme tu RUT o número de cliente? " +
  "(Entorno de prueba: podés usar cualquier dato ficticio).";

const IDENTIFIED_ACK =
  "Gracias, hemos verificado tu identidad ✅. A partir de ahora, cada consulta que escribas se deriva con Jev y con el LLM en paralelo, para comparar.";

export async function startConversation() {
  const db = getDb();
  const [conv] = await db
    .insert(conversations)
    .values({ stage: "identifying" })
    .returning({ id: conversations.id });

  await db.insert(messages).values({ conversationId: conv.id, role: "assistant", content: GREETING });

  return { conversationId: conv.id, reply: GREETING, stage: "identifying" as const };
}

export async function identifyCustomer(conversationId: string, message: string) {
  const db = getDb();

  await db.insert(messages).values({ conversationId, role: "user", content: message });
  await db.insert(messages).values({ conversationId, role: "assistant", content: IDENTIFIED_ACK });
  await db.update(conversations).set({ stage: "active" }).where(eq(conversations.id, conversationId));

  return { conversationId, reply: IDENTIFIED_ACK, stage: "active" as const };
}
