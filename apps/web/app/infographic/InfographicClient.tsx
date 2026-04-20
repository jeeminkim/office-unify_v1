"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { InfographicSpec } from '@office-unify/shared-types';
import { InfographicCanvas } from '@/components/infographic/InfographicCanvas';
import { useInfographicGenerator } from '@/hooks/useInfographicGenerator';
import { SEMICONDUCTOR_SAMPLE_SPEC, SPACE_SAMPLE_SPEC } from '@/lib/infographic/samples';

const SAMPLE_TEXT = `반도체 산업은 소재·장비 공급 안정성, 파운드리 CAPEX, 최종 수요(서버/모바일/자동차)에 따라 업황 변동성이 커진다.
최근 AI 서버 수요가 확대되면서 고대역폭 메모리와 첨단 패키징 수요가 동반 증가하고 있다.
다만 지정학 리스크와 고객사 투자 사이클 둔화가 단기 변동 요인이며, 재고 정상화 구간을 지속 추적해야 한다.`;

export default function InfographicClient() {
  const [industryName, setIndustryName] = useState('반도체');
  const [rawText, setRawText] = useState(SAMPLE_TEXT);
  const [showDebug, setShowDebug] = useState(false);
  const { loading, error, spec, warnings, setSpec, generate } = useInfographicGenerator();

  const activeSpec = useMemo<InfographicSpec | null>(() => spec, [spec]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-800">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">산업 인포그래픽 생성기 (MVP)</h1>
        <p className="mt-2 text-sm text-slate-600">
          블로그/증권사 리포트/붙여넣은 원문을 구조화 JSON으로 정제한 뒤, 고정 템플릿 인포그래픽으로 렌더링합니다.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-slate-600">산업명</span>
            <input
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={industryName}
              onChange={(e) => setIndustryName(e.target.value)}
              placeholder="예: 반도체, 우주, 2차전지"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs sm:col-span-2">
            <span className="text-slate-600">원문 (요약/리포트/블로그 본문)</span>
            <textarea
              className="min-h-[220px] rounded border border-slate-300 px-3 py-2 text-sm"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void generate({ industryName: industryName.trim(), rawText: rawText.trim() })}
            disabled={loading || !industryName.trim() || !rawText.trim()}
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? '구조화 요약 생성 중…' : '구조화 요약 생성'}
          </button>
          <button
            type="button"
            onClick={() => setSpec(SEMICONDUCTOR_SAMPLE_SPEC)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
          >
            반도체 샘플
          </button>
          <button
            type="button"
            onClick={() => setSpec(SPACE_SAMPLE_SPEC)}
            className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700"
          >
            우주 샘플
          </button>
          <Link href="/research-center" className="rounded border border-slate-200 px-3 py-2 text-xs text-slate-500">
            Research Center로 이동
          </Link>
        </div>
        {error ? <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{error}</p> : null}
        {warnings.length > 0 ? (
          <ul className="mt-3 list-inside list-disc rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
      </section>

      {activeSpec ? (
        <section className="space-y-3">
          <InfographicCanvas spec={activeSpec} />
          <button
            type="button"
            onClick={() => setShowDebug((v) => !v)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            {showDebug ? 'JSON 디버그 숨기기' : 'JSON 디버그 보기'}
          </button>
          {showDebug ? (
            <pre className="max-h-[420px] overflow-auto rounded border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
              {JSON.stringify(activeSpec, null, 2)}
            </pre>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

