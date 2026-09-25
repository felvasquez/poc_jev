import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, updateSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const categorySchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_]+$/, "usá minúsculas, números y guión bajo"),
  label: z.string().min(1).max(80),
  description: z.string().min(1).max(500),
});

const bodySchema = z.object({
  categories: z.array(categorySchema).min(1).max(30),
  jevModel: z.string().min(1).max(100),
  jevInstructions: z.string().min(1).max(2000),
  jevClarifyInstructions: z.string().min(1).max(2000),
  jevAngerInstructions: z.string().min(1).max(2000),
  clarifyThreshold: z.number().min(0).max(1),
  llmModel: z.string().min(1).max(100),
  llmSystemPromptPrefix: z.string().min(1).max(4000),
  llmClarifyInstructions: z.string().min(1).max(2000),
});

export async function GET() {
  const settings = await getSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const keys = parsed.data.categories.map((c) => c.key);
  if (new Set(keys).size !== keys.length) {
    return NextResponse.json({ error: "duplicate_category_key" }, { status: 400 });
  }

  const updated = await updateSettings(parsed.data);
  return NextResponse.json(updated);
}
