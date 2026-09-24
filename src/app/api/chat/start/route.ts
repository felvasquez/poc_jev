import { NextResponse } from "next/server";
import { startConversation } from "@/lib/onboarding";

export async function POST() {
  const result = await startConversation();
  return NextResponse.json(result);
}
