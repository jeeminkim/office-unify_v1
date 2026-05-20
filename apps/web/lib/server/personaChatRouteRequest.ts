import { NextResponse } from "next/server";
import {
  DEFAULT_PERSONA_WEB_KEY,
  isOpenAiWebPersonaSlug,
  resolveWebPersona,
} from "@office-unify/ai-office-engine";
import type { PersonaChatMessageRequestBody } from "@office-unify/shared-types";
import { buildPersonaContentHash } from "@/lib/server/runPersonaChatMessage";

export type PreparedPersonaChatMessageRequest = {
  body: PersonaChatMessageRequestBody;
  content: string;
  contentHash: string;
  geminiKey: string;
  idempotencyKey: string;
  openAiKey?: string;
  personaSlug: string;
};

export type PreparePersonaChatMessageRequestResult =
  | { ok: true; prepared: PreparedPersonaChatMessageRequest }
  | { ok: false; response: NextResponse };

export function resolvePersonaSlugForIdempotency(body: PersonaChatMessageRequestBody): string {
  const raw = body.personaKey?.trim();
  if (raw) {
    const persona = resolveWebPersona(raw);
    if (!persona) throw new Error(`Unknown personaKey: ${raw}`);
    return String(persona.key);
  }
  const defaultPersona = resolveWebPersona(DEFAULT_PERSONA_WEB_KEY);
  if (!defaultPersona) throw new Error("Default persona not registered");
  return String(defaultPersona.key);
}

export async function preparePersonaChatMessageRequest(
  req: Request,
  userKeyStr: string,
): Promise<PreparePersonaChatMessageRequestResult> {
  let body: PersonaChatMessageRequestBody;
  try {
    body = (await req.json()) as PersonaChatMessageRequestBody;
  } catch {
    return { ok: false, response: NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }) };
  }

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return { ok: false, response: NextResponse.json({ error: "Missing content." }, { status: 400 }) };
  }

  const idempotencyKey =
    typeof body.idempotencyKey === "string" && body.idempotencyKey.trim().length > 0
      ? body.idempotencyKey.trim()
      : "";
  if (!idempotencyKey) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "idempotencyKey is required (e.g. a UUID per send attempt)." },
        { status: 400 },
      ),
    };
  }

  let personaSlug: string;
  try {
    personaSlug = resolvePersonaSlugForIdempotency(body);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Invalid personaKey";
    return { ok: false, response: NextResponse.json({ error: message }, { status: 400 }) };
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim() ?? "";
  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  if (isOpenAiWebPersonaSlug(personaSlug)) {
    if (!openAiKey) {
      return {
        ok: false,
        response: NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 503 }),
      };
    }
  } else if (!geminiKey) {
    return {
      ok: false,
      response: NextResponse.json({ error: "GEMINI_API_KEY is not set on the server." }, { status: 503 }),
    };
  }

  return {
    ok: true,
    prepared: {
      body,
      content,
      contentHash: buildPersonaContentHash(userKeyStr, personaSlug, content),
      geminiKey,
      idempotencyKey,
      openAiKey,
      personaSlug,
    },
  };
}
