"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  LongResponseFallback,
  PersonaChatMessageDto,
  PersonaChatSessionInitResponseBody,
} from "@office-unify/shared-types";
import { LongResponseFallbackCard } from "@/components/LongResponseFallbackCard";
import { buildLongResponseFallbackFromError } from "@/lib/longResponseFallback";
import { buildLongResponseActionItemRequest } from "@/lib/longResponseFallbackSeeds";
import { PERSONA_CHAT_USER_MESSAGE_MAX_CHARS } from "@office-unify/shared-types";
import Link from "next/link";
import { PersonaAssistantFeedbackRow } from "@/components/PersonaAssistantFeedbackRow";
import { OpsFeedbackButton } from "@/components/OpsFeedbackButton";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json",
};

export function PrivateBankerClient() {
  const [sessionDateKst, setSessionDateKst] = useState<string | null>(null);
  const [longTerm, setLongTerm] = useState<string | null>(null);
  const [prevHint, setPrevHint] = useState<string | null>(null);
  const [messages, setMessages] = useState<PersonaChatMessageDto[]>([]);
  const [input, setInput] = useState("");
  const [loadingLoad, setLoadingLoad] = useState(false);
  const [loadingSend, setLoadingSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [outputQuality, setOutputQuality] = useState<{
    formatValid: boolean;
    missingSections: string[];
    normalized: boolean;
    warnings: string[];
  } | null>(null);
  const [modelUsage, setModelUsage] = useState<{ providerUsed: string; fallbackUsed: boolean } | null>(null);
  const [longResponseFallback, setLongResponseFallback] = useState<LongResponseFallback | null>(null);

  const sendInFlightRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const lastAttemptContentRef = useRef<string>("");

  const loadSession = useCallback(async () => {
    setError(null);
    setLoadingLoad(true);
    try {
      const res = await fetch("/api/private-banker/session", {
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "세션 로드 실패");
    } finally {
      setLoadingLoad(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const send = async () => {
    setError(null);
    setInfo(null);
    setLongResponseFallback(null);
    if (sendInFlightRef.current) return;
    if (!input.trim()) return;

    const content = input.trim();
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
    try {
      const res = await fetch("/api/private-banker/message", {
        method: "POST",
        headers: jsonHeaders,
        credentials: "same-origin",
        body: JSON.stringify({
          content,
          idempotencyKey: idempotencyKeyRef.current,
        }),
      });
      const data = (await res.json()) as {
        userMessage?: PersonaChatMessageDto;
        assistantMessage?: PersonaChatMessageDto;
        longTermMemorySummary?: string | null;
        deduplicated?: boolean;
        pbFormatNote?: string;
        outputQuality?: {
          formatValid: boolean;
          missingSections: string[];
          normalized: boolean;
          warnings: string[];
        };
        modelUsage?: { providerUsed: string; fallbackUsed: boolean };
        longResponseFallback?: LongResponseFallback;
        error?: string;
        code?: string;
      };
      if (!res.ok && !(res.status === 200 && data.code === "response_too_long")) {
        if (res.status === 409 && data.code === "DUPLICATE_IN_PROGRESS") {
          setInfo("동일 멱등 키로 다른 요청이 처리 중입니다. 잠시 후 다시 시도하세요.");
          return;
        }
        if (data.longResponseFallback) {
          setLongResponseFallback(data.longResponseFallback);
          setError(data.error ?? null);
          return;
        }
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (data.code === "response_too_long" && data.longResponseFallback) {
        setLongResponseFallback(data.longResponseFallback);
        setInfo(data.error ?? "응답이 길어 핵심만 표시합니다.");
        return;
      }
      if (data.deduplicated) {
        setInfo("동일 요청이 이미 처리되어 저장된 응답을 반환했습니다.");
      } else if (data.pbFormatNote) {
        setInfo(data.pbFormatNote);
      }
      if (data.userMessage && data.assistantMessage) {
        setMessages((prev) => {
          const uid = data.userMessage!.id;
          if (prev.some((m) => m.id === uid)) return prev;
          return [...prev, data.userMessage!, data.assistantMessage!];
        });
      }
      idempotencyKeyRef.current = null;
      lastAttemptContentRef.current = "";
      setInput("");
      if (data.longTermMemorySummary) setLongTerm(data.longTermMemorySummary);
      setOutputQuality(data.outputQuality ?? null);
      setModelUsage(data.modelUsage ?? null);
      setLongResponseFallback(data.longResponseFallback ?? null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "전송 실패";
      const fb = buildLongResponseFallbackFromError(msg);
      if (fb) {
        setLongResponseFallback(fb);
        setError(null);
      } else {
        setError(msg);
      }
    } finally {
      sendInFlightRef.current = false;
      setLoadingSend(false);
    }
  };

  const busy = loadingLoad || loadingSend;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-4 bg-slate-50 p-6 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800">Private Banker</h1>
          <p className="text-sm text-slate-500">내부 페르소나: J. Pierpont · OpenAI · 행동 분류·체크리스트 중심</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link href="/" className="text-sm text-slate-500 underline underline-offset-4 hover:text-slate-800">
            ← dev_support 홈
          </Link>
          <OpsFeedbackButton domain="private_banker" component="PrivateBankerClient" />
        </div>
      </div>
      <p className="text-sm text-slate-500">
        종목 추천기가 아니라 구조화된 투자 판단 보조입니다. 매수 4유형·체크리스트·원장 규칙은 서버 시스템 프롬프트에 반영되어 있습니다. 장기 기억은 각 답변 아래 평가로만 갱신됩니다.
      </p>

      {sessionDateKst ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
          <strong className="text-slate-800">오늘 KST 세션:</strong> {sessionDateKst}
          <span className="text-slate-400"> · LT는 j-pierpont-lt 행 (private_banker_v1)</span>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          세션을 불러오면 오늘 날짜(KST)가 표시됩니다.
        </div>
      )}

      <div className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={loadingLoad}
            onClick={() => void loadSession()}
          >
            {loadingLoad ? "불러오는 중…" : "오늘 세션 다시 불러오기"}
          </button>
          {loadingLoad ? <span className="text-xs text-slate-500">세션 로딩</span> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {info ? (
        <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">{info}</div>
      ) : null}

      {longResponseFallback ? (
        <LongResponseFallbackCard
          fallback={longResponseFallback}
          seedSource="pb_response"
          actionItemRequest={buildLongResponseActionItemRequest({
            sourceType: "pb_response",
            fallback: longResponseFallback,
            title: "PB 응답 요약",
          })}
        />
      ) : null}

      {(outputQuality || modelUsage) ? (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <div className="flex flex-wrap gap-1">
            {outputQuality ? (
              <>
                <span className={`rounded px-2 py-0.5 ${outputQuality.formatValid ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>
                  outputQuality:{outputQuality.formatValid ? "valid" : "warn"}
                </span>
                {outputQuality.normalized ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">normalized</span> : null}
              </>
            ) : null}
            {modelUsage ? (
              <>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-slate-800">{modelUsage.providerUsed}</span>
                {modelUsage.fallbackUsed ? <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">fallback</span> : null}
              </>
            ) : null}
          </div>
          {outputQuality?.missingSections?.length ? (
            <p className="mt-1 text-[11px] text-amber-800">누락 섹션: {outputQuality.missingSections.join(", ")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2 flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">대화</h2>
          <div className="min-h-[240px] space-y-3 rounded-lg border border-dashed border-slate-200 p-3">
            {messages.length === 0 ? (
              <p className="text-sm text-slate-400">메시지가 없습니다.</p>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`text-sm ${m.role === "user" ? "text-slate-900" : "text-slate-600"}`}>
                  <span className="font-semibold">{m.role === "user" ? "나" : "J. Pierpont"}</span>
                  <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
                  {m.role === "assistant" ? (
                    <PersonaAssistantFeedbackRow
                      personaKey="j-pierpont"
                      assistantMessageId={m.id}
                      assistantLabel="J. Pierpont"
                      onSaved={(summary) => {
                        if (summary) setLongTerm(summary);
                      }}
                    />
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <textarea
                className="min-h-[80px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                value={input}
                maxLength={PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}
                onChange={(e) => setInput(e.target.value)}
                placeholder="매수·매도·관심 등 자연어로 입력…"
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
              {input.length}/{PERSONA_CHAT_USER_MESSAGE_MAX_CHARS}자
            </p>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 text-xs shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800">장기 기억 요약</h2>
          <p className="whitespace-pre-wrap text-slate-600">{longTerm ?? "—"}</p>
          <h2 className="pt-2 text-sm font-semibold text-slate-800">어제 힌트</h2>
          <p className="whitespace-pre-wrap text-slate-600">{prevHint ?? "—"}</p>
        </div>
      </div>
    </div>
  );
}
