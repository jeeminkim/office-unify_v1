"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PersonaChatMessageDto, PersonaChatSessionInitResponseBody, PersonaChatMessageResponseBody } from "@office-unify/shared-types";
import {
  PERSONA_CHAT_STREAM_FLUSH_CHARS,
  PERSONA_CHAT_USER_MESSAGE_MAX_CHARS,
} from "@office-unify/shared-types";
import { listRegisteredPersonaWebKeys, resolveWebPersona } from "@office-unify/ai-office-engine";
import Link from "next/link";
import { PersonaAssistantFeedbackRow } from "@/components/PersonaAssistantFeedbackRow";
import { JoIlHyeonLedgerForm } from "@/components/JoIlHyeonLedgerForm";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
};

type NdjsonDone = {
  type: "done";
  deduplicated?: boolean;
  body: PersonaChatMessageResponseBody;
  /** NDJSON 편의 필드 — `body`와 동일 정보가 중복될 수 있음 */
  structuredOutput?: PersonaChatMessageResponseBody["personaStructuredOutput"];
  structuredOutputSummary?: PersonaChatMessageResponseBody["personaStructuredOutputSummary"];
  personaWarnings?: string[];
  bannedPhraseCount?: number;
  parseFailed?: boolean;
  fallbackApplied?: boolean;
};

type NdjsonFatal = { type: "fatal"; status: number; message: string; code?: string };

async function consumePersonaChatNdjsonStream(
  res: Response,
  onDelta: (text: string) => void,
): Promise<NdjsonDone | NdjsonFatal> {
  const reader = res.body?.getReader();
  if (!reader) {
    return { type: "fatal", status: 502, message: "응답 본문이 없습니다." };
  }
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let o: unknown;
      try {
        o = JSON.parse(line) as Record<string, unknown>;
      } catch {
        continue;
      }
      const rec = o as { type?: string };
      if (rec.type === "delta" && typeof (o as { text?: unknown }).text === "string") {
        onDelta((o as { text: string }).text);
      }
      if (rec.type === "done") {
        return o as NdjsonDone;
      }
      if (rec.type === "fatal") {
        return o as NdjsonFatal;
      }
    }
  }
  return { type: "fatal", status: 502, message: "스트림이 비정상적으로 끝났습니다." };
}

export function PersonaChatClient() {
  const [personaKey, setPersonaKey] = useState("ray-dalio");
  const [registeredPersonas, setRegisteredPersonas] = useState<string[]>(() => listRegisteredPersonaWebKeys());
  const [sessionDateKst, setSessionDateKst] = useState<string | null>(null);
  const [longTerm, setLongTerm] = useState<string | null>(null);
  const [prevHint, setPrevHint] = useState<string | null>(null);
  const [messages, setMessages] = useState<PersonaChatMessageDto[]>([]);
  const [input, setInput] = useState("");
  const [loadingLoad, setLoadingLoad] = useState(false);
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [streamPreview, setStreamPreview] = useState<string | null>(null);
  const [structuredNotice, setStructuredNotice] = useState<string | null>(null);

  const sendInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastAttemptContentRef = useRef<string>("");

  const loadSession = useCallback(async () => {
    setError(null);
    setLoadingLoad(true);
    try {
      const q = new URLSearchParams();
      if (personaKey.trim()) q.set("personaKey", personaKey.trim());
      const res = await fetch(`/api/persona-chat/session?${q.toString()}`, {
        credentials: "same-origin",
      });
      const data = (await res.json()) as PersonaChatSessionInitResponseBody & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setMessages(data.session.messages);
      setLongTerm(data.longTermMemorySummary);
      setPrevHint(data.previousDayAssistantHint);
      setSessionDateKst(data.session.sessionDateKst as string);
      if (data.registeredPersonaKeys?.length) {
        setRegisteredPersonas(data.registeredPersonaKeys);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "세션 로드 실패");
    } finally {
      setLoadingLoad(false);
    }
  }, [personaKey]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const send = async (contentOverride?: string) => {
    setError(null);
    setInfo(null);
    setStructuredNotice(null);
    if (sendInFlightRef.current) return;
    const raw = contentOverride ?? input;
    if (!raw.trim()) return;

    const content = raw.trim();
    if (content.length > PERSONA_CHAT_USER_MESSAGE_MAX_CHARS) {
      setError(`메시지는 최대 ${PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}자까지 입력할 수 있습니다.`);
      return;
    }
    if (lastAttemptContentRef.current !== content) {
      idempotencyKeyRef.current = null;
    }
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    lastAttemptContentRef.current = content;

    sendInFlightRef.current = true;
    setLoadingSend(true);
    setStreamPreview("");
    try {
      const res = await fetch("/api/persona-chat/message/stream", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          personaKey: personaKey.trim(),
          content,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      let acc = "";
      let sinceFlush = 0;
      const onDelta = (t: string) => {
        const wasEmpty = acc.length === 0;
        acc += t;
        sinceFlush += t.length;
        const isFirstChunk = wasEmpty && acc.length > 0;
        if (isFirstChunk || sinceFlush >= PERSONA_CHAT_STREAM_FLUSH_CHARS) {
          setStreamPreview(acc);
          if (sinceFlush >= PERSONA_CHAT_STREAM_FLUSH_CHARS) sinceFlush = 0;
        }
      };

      const result = await consumePersonaChatNdjsonStream(res, onDelta);
      setStreamPreview(acc);

      if (result.type === "fatal") {
        if (result.code === "DUPLICATE_IN_PROGRESS") {
          setInfo("동일 멱등 키로 다른 요청이 처리 중입니다. 잠시 후 다시 시도하세요.");
        } else {
          throw new Error(result.message || `오류 (${result.status})`);
        }
        return;
      }

      const { body, deduplicated } = result;
      if (deduplicated) {
        setInfo("동일 요청이 이미 처리되어 저장된 응답을 반환했습니다. (네트워크 재시도·중복 요청 방지)");
      } else if (body.personaFormatNote) {
        setInfo(body.personaFormatNote);
      } else if (body.llmProviderNote) {
        setInfo(body.llmProviderNote);
      }

      const hints: string[] = [];
      if (body.personaStructuredParseFailed) {
        hints.push("구조화 응답 일부를 해석하지 못했습니다. 확인·점검 관점으로만 참고하세요.");
      }
      if (body.personaWarnings?.length) {
        hints.push(...body.personaWarnings.slice(0, 8));
      }
      setStructuredNotice(hints.length ? hints.join(" · ") : null);

      setMessages((prev) => {
        const uid = body.userMessage.id;
        if (prev.some((m) => m.id === uid)) return prev;
        return [...prev, body.userMessage, body.assistantMessage];
      });
      idempotencyKeyRef.current = null;
      lastAttemptContentRef.current = "";
      setInput("");
      if (body.longTermMemorySummary) setLongTerm(body.longTermMemorySummary);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setStreamPreview(null);
      sendInFlightRef.current = false;
      setLoadingSend(false);
    }
  };

  const busy = loadingLoad || loadingSend;
  const personaDef = resolveWebPersona(personaKey);
  const isJoIlHyeon = personaKey.trim() === "jo-il-hyeon";

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold tracking-tight text-slate-800">Persona chat</h1>
        <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
          ← dev_support 홈
        </Link>
      </div>
      <p className="text-sm text-slate-500">
        KST 기준 일별 세션입니다. 장기 기억은 각 답변 아래 평가로만 갱신·저장되며, 오늘 대화만 모델 컨텍스트에 주로 사용됩니다. Google 로그인 세션으로만 접근합니다.
      </p>

      {sessionDateKst ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          <strong className="text-slate-800">오늘 KST 세션:</strong> {sessionDateKst}
          <span className="text-slate-400"> · KST 자정이 지나면 새 세션이 시작됩니다.</span>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          세션을 불러오면 오늘 날짜(KST)가 표시됩니다.
        </div>
      )}

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <label className="flex flex-col gap-1">
          <span className="font-medium text-slate-700">페르소나</span>
          <select
            className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900"
            value={personaKey}
            onChange={(e) => setPersonaKey(e.target.value)}
          >
            {registeredPersonas.map((k) => {
              const def = resolveWebPersona(k);
              return (
                <option key={k} value={k}>
                  {def?.displayName ?? k}
                </option>
              );
            })}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={loadingLoad}
            onClick={() => void loadSession()}
          >
            {loadingLoad ? "불러오는 중…" : "오늘 세션 다시 불러오기"}
          </button>
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 hover:bg-slate-50"
            onClick={() => setGuideOpen(true)}
          >
            {personaDef?.displayName ?? personaKey} · 활용법 및 특징
          </button>
          {loadingLoad ? <span className="text-xs text-slate-500">세션 로딩</span> : null}
        </div>
      </div>

      {guideOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="persona-guide-title"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="persona-guide-title" className="text-lg font-semibold text-slate-900">
              {personaDef?.displayName ?? personaKey}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {personaDef?.usageGuide ?? "안내 문구가 아직 등록되지 않았습니다."}
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-md bg-slate-900 py-2 text-sm text-white hover:bg-slate-800"
              onClick={() => setGuideOpen(false)}
            >
              닫기
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
          <p className="mt-1 text-xs text-red-700/90">
            전송 단계에서 실패한 경우 입력 내용은 지우지 않습니다. 내용을 바꾸면 새 요청으로 처리되고, 그대로 두면 같은 멱등 키로 재시도됩니다.
          </p>
        </div>
      ) : null}

      {info ? (
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">{info}</div>
      ) : null}

      {structuredNotice ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <span className="font-semibold">구조화 응답 점검:</span> {structuredNotice}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">오늘 대화</h2>
          <div className="min-h-[240px] space-y-3 rounded-lg border border-dashed border-slate-200 p-3">
            {messages.length === 0 && streamPreview === null ? (
              <p className="text-sm text-slate-400">메시지가 없습니다. 세션을 불러오거나 아래에서 입력하세요.</p>
            ) : (
              <>
                {messages.map((m) => (
                  <div key={m.id} className={`text-sm ${m.role === "user" ? "text-slate-900" : "text-slate-600"}`}>
                    <span className="font-semibold">{m.role === "user" ? "나" : "페르소나"}</span>
                    <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                    {m.role === "assistant" ? (
                      <PersonaAssistantFeedbackRow
                        personaKey={personaKey.trim()}
                        assistantMessageId={m.id}
                        onSaved={(summary) => {
                          if (summary) setLongTerm(summary);
                        }}
                      />
                    ) : null}
                  </div>
                ))}
                {streamPreview !== null ? (
                  <div className="text-sm text-slate-600">
                    <span className="font-semibold">페르소나</span>
                    <span className="ml-2 text-xs text-slate-400">(응답 수신 중…)</span>
                    <p className="mt-1 whitespace-pre-wrap">{streamPreview || "…"}</p>
                  </div>
                ) : null}
              </>
            )}
          </div>
          <div className="flex flex-col gap-1">
            {isJoIlHyeon ? (
              <>
                <JoIlHyeonLedgerForm
                  disabled={loadingSend}
                  onSubmitContent={(jsonText) => {
                    setInput(jsonText);
                    void send(jsonText);
                  }}
                />
                <p className="text-xs text-slate-500">
                  조일현이 만든 SQL 초안은 <Link href="/portfolio-ledger">포트 원장</Link> 화면에서{" "}
                  <strong>검증·적용</strong>하세요. 부분 수정은 원장 불러오기에 성공했을 때만 안전하게 진행됩니다.
                </p>
              </>
            ) : (
              <>
                <div className="flex gap-2">
                  <textarea
                    className="min-h-[80px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    value={input}
                    maxLength={PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="메시지…"
                    disabled={loadingSend}
                  />
                  <button
                    type="button"
                    className="self-end rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
                    disabled={busy || !input.trim() || input.length > PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}
                    onClick={() => void send()}
                  >
                    {loadingSend ? "응답 중…" : "전송"}
                  </button>
                </div>
                <p className="text-xs text-slate-500">
                  {input.length}/{PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}자 · 초과 시 전송할 수 없습니다. 긴 답은 약{" "}
                  {PERSONA_CHAT_STREAM_FLUSH_CHARS}자 단위로 화면에 이어 붙습니다.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">장기 기억 요약</h2>
          <p className="whitespace-pre-wrap text-slate-600">{longTerm ?? "—"}</p>
          <h2 className="pt-2 text-sm font-semibold text-slate-800">어제 assistant 힌트</h2>
          <p className="whitespace-pre-wrap text-slate-600">{prevHint ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
