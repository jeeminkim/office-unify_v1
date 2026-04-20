"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { InfographicInputSourceType, InfographicSpec } from '@office-unify/shared-types';
import { InfographicCanvas } from '@/components/infographic/InfographicCanvas';
import { ResponsiveInfographicView } from '@/components/infographic/ResponsiveInfographicView';
import { useInfographicGenerator } from '@/hooks/useInfographicGenerator';
import { SEMICONDUCTOR_SAMPLE_SPEC, SPACE_SAMPLE_SPEC } from '@/lib/infographic/samples';

const SAMPLE_TEXT = `반도체 산업은 소재·장비 공급 안정성, 파운드리 CAPEX, 최종 수요(서버/모바일/자동차)에 따라 업황 변동성이 커진다.
최근 AI 서버 수요가 확대되면서 고대역폭 메모리와 첨단 패키징 수요가 동반 증가하고 있다.
다만 지정학 리스크와 고객사 투자 사이클 둔화가 단기 변동 요인이며, 재고 정상화 구간을 지속 추적해야 한다.`;

export default function InfographicClient() {
  const [industryName, setIndustryName] = useState('반도체');
  const [rawText, setRawText] = useState(SAMPLE_TEXT);
  const [sourceType, setSourceType] = useState<InfographicInputSourceType>('text');
  const [sourceUrl, setSourceUrl] = useState('');
  const [pdfUrl, setPdfUrl] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [renderMode, setRenderMode] = useState<'responsive' | 'export'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'export' : 'responsive',
  );
  const [isMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : true,
  );
  const [showMobileExportPreview, setShowMobileExportPreview] = useState(false);
  const [mobileExportReady, setMobileExportReady] = useState(false);
  const [showRawDebug, setShowRawDebug] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const {
    loading,
    error,
    spec,
    warnings,
    setSpec,
    generate,
    extractSourceText,
    sourcePreviewText,
    sourcePreviewRawText,
    setSourcePreviewText,
    sourcePreviewMeta,
  } = useInfographicGenerator();

  const activeSpec = useMemo<InfographicSpec | null>(() => spec, [spec]);

  const onGenerateFromSource = () =>
    extractSourceText(
      {
        industryName: industryName.trim(),
        sourceType,
        rawText: sourceType === 'text' ? rawText.trim() : undefined,
        sourceUrl: sourceType === 'url' ? sourceUrl.trim() : undefined,
        pdfUrl: sourceType === 'pdf_url' ? pdfUrl.trim() : undefined,
      },
      sourceType === 'pdf_upload' ? pdfFile : null,
    );

  const onGenerateSpec = () =>
    generate({
      industryName: industryName.trim(),
      sourceType: 'text',
      rawText: (sourceType === 'text' ? rawText : sourcePreviewText).trim(),
    });

  const canGenerate =
    !!industryName.trim() &&
    ((sourceType === 'text' && !!rawText.trim()) ||
      (sourceType === 'url' && !!sourceUrl.trim()) ||
      (sourceType === 'pdf_url' && !!pdfUrl.trim()) ||
      (sourceType === 'pdf_upload' && !!pdfFile));

  const canGenerateSpec =
    sourceType === 'text' ? !!rawText.trim() : !!sourcePreviewText.trim();
  const showInlineExportCanvas = !(isMobileViewport && renderMode === 'export');
  const cleanupSeverity: 'light' | 'moderate' | 'heavy' | null = sourcePreviewMeta
    ? sourcePreviewMeta.cleanupNotes.length >= 8
      ? 'heavy'
      : sourcePreviewMeta.cleanupNotes.length >= 3
        ? 'moderate'
        : 'light'
    : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 text-slate-800">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">산업 인포그래픽 생성기 (MVP)</h1>
        <p className="mt-2 text-sm text-slate-600">
          블로그/증권사 리포트/붙여넣은 원문을 구조화 JSON으로 정제한 뒤, 고정 템플릿 인포그래픽으로 렌더링합니다.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          모바일은 읽기용(`responsive`)이 기본이고, 데스크톱은 저장용 미리보기(`export`)가 기본입니다. PNG 저장은 export 레이아웃 기준입니다.
        </p>
        <ol className="mt-2 list-inside list-decimal text-xs text-slate-500">
          <li>입력</li>
          <li>원문 추출</li>
          <li>텍스트 정리/검토</li>
          <li>구조화 생성</li>
          <li>읽기/저장</li>
        </ol>
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
            <span className="text-slate-600">입력 소스 타입</span>
            <select
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as InfographicInputSourceType)}
            >
              <option value="text">text (붙여넣기)</option>
              <option value="url">url</option>
              <option value="pdf_upload">pdf_upload</option>
              <option value="pdf_url">pdf_url</option>
            </select>
          </label>

          {sourceType === 'text' ? (
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="text-slate-600">원문 (요약/리포트/블로그 본문)</span>
              <textarea
                className="min-h-[220px] rounded border border-slate-300 px-3 py-2 text-sm"
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
              />
            </label>
          ) : null}
          {sourceType === 'url' ? (
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="text-slate-600">URL</span>
              <input
                className="rounded border border-slate-300 px-2 py-2 text-sm"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
              />
            </label>
          ) : null}
          {sourceType === 'pdf_upload' ? (
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="text-slate-600">PDF 업로드</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="rounded border border-slate-300 px-2 py-2 text-sm"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
            </label>
          ) : null}
          {sourceType === 'pdf_url' ? (
            <label className="flex flex-col gap-1 text-xs sm:col-span-2">
              <span className="text-slate-600">PDF URL</span>
              <input
                className="rounded border border-slate-300 px-2 py-2 text-sm"
                value={pdfUrl}
                onChange={(e) => setPdfUrl(e.target.value)}
                placeholder="https://.../report.pdf"
              />
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {sourceType === 'text' ? null : (
            <button
              type="button"
              onClick={() => void onGenerateFromSource()}
              disabled={loading || !canGenerate}
              className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
            >
              {loading ? '원문 추출 중…' : '원문 추출'}
            </button>
          )}
          <button
            type="button"
            onClick={() => void onGenerateSpec()}
            disabled={loading || !canGenerateSpec}
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
        {sourceType !== 'text' && sourcePreviewMeta ? (
          <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            <p className="mb-1 inline-flex rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700">
              품질 요약: {cleanupSeverity === 'heavy' ? '강한 정리 적용' : cleanupSeverity === 'moderate' ? '중간 정리 적용' : '경미한 정리 적용'}
            </p>
            <p>
              추출 메타: 길이 {sourcePreviewMeta.extractedTextLength.toLocaleString()}자
              {sourcePreviewMeta.sourceTitle ? ` · 제목 ${sourcePreviewMeta.sourceTitle}` : ''}
            </p>
            <p className="mt-1">
              raw {sourcePreviewMeta.rawExtractedTextLength.toLocaleString()}자 → cleaned {sourcePreviewMeta.cleanedTextLength.toLocaleString()}자
              {sourcePreviewMeta.cleanupApplied ? ' · 자동 정리 적용됨' : ' · 자동 정리 없음'}
            </p>
            {sourcePreviewMeta.cleanupNotes.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-slate-600">
                {sourcePreviewMeta.cleanupNotes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            ) : null}
            {cleanupSeverity === 'heavy' ? (
              <p className="mt-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-amber-800">
                자동 정리가 많이 적용되었습니다. 구조화 전에 텍스트를 한 번 검토하세요.
              </p>
            ) : null}
            {sourcePreviewMeta.sourceUrl ? <p className="mt-1 break-all text-slate-500">{sourcePreviewMeta.sourceUrl}</p> : null}
            {sourcePreviewMeta.extractionWarnings.length > 0 ? (
              <ul className="mt-1 list-inside list-disc text-amber-700">
                {sourcePreviewMeta.extractionWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {sourceType !== 'text' ? (
        <section className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">추출 원문 미리보기/수정</p>
          <textarea
            className="min-h-[220px] w-full rounded border border-slate-300 px-3 py-2 text-sm"
            value={sourcePreviewText}
            onChange={(e) => setSourcePreviewText(e.target.value)}
            placeholder="먼저 '원문 추출'을 눌러 URL/PDF에서 추출한 텍스트를 확인하세요."
          />
          <button
            type="button"
            onClick={() => setShowRawDebug((v) => !v)}
            className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
          >
            {showRawDebug ? '원본/디버그 숨기기' : '원본 추출 텍스트 보기'}
          </button>
          {showRawDebug && sourcePreviewMeta ? (
            <div className="space-y-2">
              <pre className="max-h-[220px] overflow-auto rounded border border-slate-200 bg-slate-900 p-3 text-xs text-slate-100">
                {JSON.stringify(sourcePreviewMeta, null, 2)}
              </pre>
              <textarea
                readOnly
                className="min-h-[160px] w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs"
                value={sourcePreviewRawText}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      {activeSpec ? (
        <section className="space-y-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRenderMode('responsive')}
              className={`rounded px-3 py-1.5 text-xs ${renderMode === 'responsive' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              Responsive 보기
            </button>
            <button
              type="button"
              onClick={() => setRenderMode('export')}
              className={`rounded px-3 py-1.5 text-xs ${renderMode === 'export' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              Export 보기
            </button>
            {isMobileViewport ? (
              <button
                type="button"
                onClick={() => setShowMobileExportPreview(true)}
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
              >
                저장용 미리보기
              </button>
            ) : null}
          </div>
          {renderMode === 'responsive' ? (
            <ResponsiveInfographicView spec={activeSpec} />
          ) : showInlineExportCanvas ? (
            <InfographicCanvas spec={activeSpec} />
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              모바일에서는 저장용 미리보기를 눌러 export 레이아웃을 확인하세요.
            </div>
          )}
          {isMobileViewport && showMobileExportPreview ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3">
              <div className="max-h-[95vh] w-full max-w-md overflow-auto rounded-lg bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">저장용 미리보기 (export)</p>
                  <button
                    type="button"
                    className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                    onClick={() => setShowMobileExportPreview(false)}
                  >
                    닫기
                  </button>
                </div>
                <p className="mb-2 text-xs text-slate-500">이 화면이 PNG로 저장됩니다.</p>
                <InfographicCanvas
                  spec={activeSpec}
                  showSaveButton={mobileExportReady}
                  onRenderReadyChange={setMobileExportReady}
                  onBeforeSave={async () =>
                    window.confirm("현재 보이는 저장용 레이아웃으로 PNG를 저장할까요?")
                  }
                />
                <p className="mt-2 text-[11px] text-slate-500">
                  저장 상태: {mobileExportReady ? "저장 가능" : "렌더 준비 중"}
                </p>
              </div>
            </div>
          ) : null}
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

