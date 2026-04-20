"use client";

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type {
  InfographicArticlePattern,
  InfographicIndustryPattern,
  InfographicInputSourceType,
  InfographicSpec,
} from '@office-unify/shared-types';
import { InfographicCanvas } from '@/components/infographic/InfographicCanvas';
import { ResponsiveInfographicView } from '@/components/infographic/ResponsiveInfographicView';
import { useInfographicGenerator } from '@/hooks/useInfographicGenerator';
import { SEMICONDUCTOR_SAMPLE_SPEC, SPACE_SAMPLE_SPEC } from '@/lib/infographic/samples';
import {
  CYBERSECURITY_REGRESSION_TEXT,
  HEALTHCARE_INSTITUTIONAL_REGRESSION_TEXT,
  K_ENTERTAINMENT_MARKET_COMMENTARY_REGRESSION_TEXT,
  MARKET_COMMENTARY_REGRESSION_TEXT,
  OPINION_EDITORIAL_REGRESSION_TEXT,
  SEMICONDUCTOR_REPORT_REGRESSION_TEXT,
  MIXED_DOCUMENT_REGRESSION_TEXT,
} from '@/lib/infographic/regressionFixtures';

const SAMPLE_TEXT = `반도체 산업은 소재·장비 공급 안정성, 파운드리 CAPEX, 최종 수요(서버/모바일/자동차)에 따라 업황 변동성이 커진다.
최근 AI 서버 수요가 확대되면서 고대역폭 메모리와 첨단 패키징 수요가 동반 증가하고 있다.
다만 지정학 리스크와 고객사 투자 사이클 둔화가 단기 변동 요인이며, 재고 정상화 구간을 지속 추적해야 한다.`;
const ARTICLE_PATTERN_OPTIONS = [
  'industry_report',
  'company_report',
  'opinion_editorial',
  'market_commentary',
  'thematic_analysis',
  'how_to_explainer',
  'mixed_or_unknown',
] as const;
const INDUSTRY_PATTERN_OPTIONS = [
  'manufacturing',
  'semiconductor_electronics',
  'energy_resources',
  'healthcare_bio',
  'software_platform',
  'cybersecurity_service',
  'consumer_retail',
  'finance_insurance',
  'mobility_automotive',
  'media_content',
  'industrials_b2b',
  'mixed_or_unknown',
] as const;
const DEGRADED_REASON_MESSAGE: Record<string, string> = {
  insufficient_structure: '핵심 축이 부족합니다. 산업명이나 주제를 더 구체적으로 적어보세요.',
  mixed_document: '설명, 의견, 광고성 문구가 함께 섞여 있습니다. 핵심 본문만 남겨 다시 시도해 보세요.',
  too_long_and_diffuse: '본문이 너무 길고 주제가 넓습니다. 30~50% 정도 줄이면 구조화가 더 안정적입니다.',
  weak_numeric_support: '수치 근거가 부족해 차트 생성이 제한될 수 있습니다. 수치가 있는 구간만 남겨보세요.',
  weak_zone_signal: 'zone 신호가 약합니다. 문단 제목(배경/주장/쟁점/시사점)을 넣어보세요.',
  opinion_structure_unclear: '의견형 글로 보이지만 주장과 근거가 섞여 있습니다. 문단을 분리해 주세요.',
};

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
  const [articlePatternOverride, setArticlePatternOverride] = useState<string>('auto');
  const [industryPatternOverride, setIndustryPatternOverride] = useState<string>('auto');
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
    degradedMeta,
    pipelineStage,
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
      articlePatternOverride:
        articlePatternOverride !== 'auto' ? (articlePatternOverride as InfographicArticlePattern) : undefined,
      industryPatternOverride:
        industryPatternOverride !== 'auto' ? (industryPatternOverride as InfographicIndustryPattern) : undefined,
      },
      sourceType === 'pdf_upload' ? pdfFile : null,
    );

  const onGenerateSpec = () =>
    generate({
      industryName: industryName.trim(),
      sourceType: 'text',
      rawText: (sourceType === 'text' ? rawText : sourcePreviewText).trim(),
      articlePatternOverride:
        articlePatternOverride !== 'auto' ? (articlePatternOverride as InfographicArticlePattern) : undefined,
      industryPatternOverride:
        industryPatternOverride !== 'auto' ? (industryPatternOverride as InfographicIndustryPattern) : undefined,
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
  const extractionMode = activeSpec?.sourceMeta?.extractionMode;
  const articlePattern = activeSpec?.sourceMeta?.articlePattern ?? sourcePreviewMeta?.articlePattern;
  const industryPattern = activeSpec?.sourceMeta?.industryPattern ?? sourcePreviewMeta?.industryPattern;
  const articlePatternLabel =
    articlePattern === 'industry_report'
      ? '산업 리포트'
      : articlePattern === 'company_report'
        ? '기업 리포트'
        : articlePattern === 'opinion_editorial'
          ? '블로그/칼럼 의견형'
          : articlePattern === 'market_commentary'
            ? '시황 코멘트형'
            : articlePattern === 'thematic_analysis'
              ? '테마 분석형'
              : articlePattern === 'how_to_explainer'
                ? '실무 가이드형'
                : '혼합형';
  const resultModeLabel =
    activeSpec?.sourceMeta?.resultMode === 'industry_structure'
      ? '산업 구조 인포그래픽'
      : activeSpec?.sourceMeta?.resultMode === 'opinion_argument_map'
        ? '논점/의견 정리 인포그래픽'
        : activeSpec?.sourceMeta?.resultMode === 'market_checkpoint_map'
          ? '시황/체크포인트 인포그래픽'
          : activeSpec?.sourceMeta?.resultMode === 'howto_process_map'
            ? '설명형 프로세스 인포그래픽'
            : '혼합 요약 인포그래픽';
  const degradedReasons = activeSpec?.sourceMeta?.degradedReasons ?? degradedMeta?.degradedReasons ?? [];
  const pipelineLabel =
    pipelineStage === 'source_extracted'
      ? '원문 추출 완료'
      : pipelineStage === 'cleaned_preview_ready'
        ? '정리된 미리보기 준비 완료'
        : pipelineStage === 'spec_generation_succeeded'
          ? '구조화 생성 성공'
          : pipelineStage === 'spec_generation_fallback'
            ? '구조화 복구 추출 사용'
            : pipelineStage === 'spec_generation_degraded'
              ? '구조화 제한 fallback'
              : '대기 중';
  const extractionQualityLabel =
    extractionMode === 'llm_direct'
      ? '정상 추출'
      : extractionMode === 'llm_repaired'
        ? '복구 추출'
        : extractionMode === 'semantic_fallback'
          ? '의미 기반 복구'
          : extractionMode === 'degraded_fallback'
            ? '제한적 fallback'
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
        <p className="mt-1 text-xs text-slate-500">단계 상태: {pipelineLabel}</p>
        <p className="mt-1 text-xs text-slate-500">문서 성격: {articlePatternLabel}</p>
        <p className="mt-1 text-xs text-slate-500">결과 유형: {resultModeLabel}</p>
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
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">articlePattern</span>
            <select
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={articlePatternOverride}
              onChange={(e) => setArticlePatternOverride(e.target.value)}
            >
              <option value="auto">자동 감지</option>
              {ARTICLE_PATTERN_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-slate-600">industryPattern</span>
            <select
              className="rounded border border-slate-300 px-2 py-2 text-sm"
              value={industryPatternOverride}
              onChange={(e) => setIndustryPatternOverride(e.target.value)}
            >
              <option value="auto">자동 감지</option>
              {INDUSTRY_PATTERN_OPTIONS.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => {
                setArticlePatternOverride('auto');
                setIndustryPatternOverride('auto');
              }}
              className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700"
            >
              Reset to auto
            </button>
            <p className="mt-1 text-xs text-slate-500">
              자동 감지: {articlePatternLabel} / {industryPattern ?? 'mixed_or_unknown'}
              {(articlePatternOverride !== 'auto' || industryPatternOverride !== 'auto')
                ? ` · 수동 지정: ${articlePatternOverride !== 'auto' ? articlePatternOverride : 'auto'} / ${industryPatternOverride !== 'auto' ? industryPatternOverride : 'auto'}`
                : ''}
            </p>
          </div>

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
          <button
            type="button"
            onClick={() => {
              setIndustryName('반도체');
              setSourceType('text');
              setRawText(SEMICONDUCTOR_REPORT_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-800"
          >
            반도체 리포트 샘플
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryName('사이버보안');
              setSourceType('text');
              setRawText(CYBERSECURITY_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-xs text-indigo-800"
          >
            보안 회귀 샘플
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryName('헬스케어');
              setSourceType('text');
              setRawText(HEALTHCARE_INSTITUTIONAL_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"
          >
            기관 인사이트 샘플
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryName('AI 플랫폼');
              setSourceType('text');
              setRawText(OPINION_EDITORIAL_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800"
          >
            의견형 샘플
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryName('시장 시황');
              setSourceType('text');
              setRawText(MARKET_COMMENTARY_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-cyan-300 bg-cyan-50 px-3 py-2 text-xs text-cyan-800"
          >
            시황형 샘플
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryName('K-엔터');
              setSourceType('text');
              setRawText(K_ENTERTAINMENT_MARKET_COMMENTARY_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-fuchsia-300 bg-fuchsia-50 px-3 py-2 text-xs text-fuchsia-900"
          >
            K-엔터 시황 회귀
          </button>
          <button
            type="button"
            onClick={() => {
              setIndustryName('혼합 문서');
              setSourceType('text');
              setRawText(MIXED_DOCUMENT_REGRESSION_TEXT);
              setSourcePreviewText('');
            }}
            className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800"
          >
            혼합형 샘플
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
              문서 성격: {articlePatternLabel}
              {sourcePreviewMeta.subjectivityLevel ? ` · 주관성 ${sourcePreviewMeta.subjectivityLevel}` : ''}
              {sourcePreviewMeta.structureDensity ? ` · 구조 밀도 ${sourcePreviewMeta.structureDensity}` : ''}
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
            {(sourcePreviewMeta.articlePattern === 'opinion_editorial' ||
              sourcePreviewMeta.articlePattern === 'market_commentary') ? (
              <p className="mt-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-blue-800">
                이 문서는 의견/논평 성격이 있어 구조화 과정에서 표현을 중립화했습니다.
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
          {extractionQualityLabel ? (
            <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              품질 요약: {extractionQualityLabel}
              {activeSpec.sourceMeta.parseStage ? ` · parse: ${activeSpec.sourceMeta.parseStage}` : ''}
              {typeof activeSpec.sourceMeta.specCompletenessScore === 'number'
                ? ` · completeness ${activeSpec.sourceMeta.specCompletenessScore}`
                : ''}
            </div>
          ) : null}
          <div className="rounded border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            보기 모드: {renderMode === 'responsive' ? '읽기용' : '저장용'} · 결과 유형: {resultModeLabel}
          </div>
          {articlePattern === 'opinion_editorial' || articlePattern === 'market_commentary' ? (
            <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              이 문서는 의견형 글로 판단되어 문제의식-주장-쟁점-시사점 프레임으로 정리했습니다.
            </div>
          ) : articlePattern === 'industry_report' || articlePattern === 'company_report' ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              이 문서는 리포트형으로 판단되어 가치사슬 중심으로 정리했습니다.
            </div>
          ) : null}
          {extractionMode === 'semantic_fallback' ? (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              원문 추출은 성공했지만 구조화 단계에서 복구 추출이 사용되었습니다.
            </div>
          ) : null}
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
      {pipelineStage === 'spec_generation_degraded' ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          구조화 실패: 추출 텍스트를 조금 더 정리하거나 산업명을 구체화해 다시 시도하세요.
          <p className="mt-1 text-xs text-amber-800">
            원문 추출은 성공했지만 산업 구조 추출이 불완전했습니다.
          </p>
          {degradedReasons.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
              {degradedReasons.map((reason) => (
                <li key={reason}>{DEGRADED_REASON_MESSAGE[reason] ?? reason}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs"
              onClick={() => void onGenerateSpec()}
            >
              다시 시도
            </button>
            <button
              type="button"
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs"
              onClick={() => setSourcePreviewText((prev) => prev.slice(0, Math.max(500, Math.floor(prev.length * 0.6))))}
            >
              원문 더 짧게 정리
            </button>
            <button
              type="button"
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs"
              onClick={() => setArticlePatternOverride('opinion_editorial')}
            >
              문서 성격 바꾸기
            </button>
            <button
              type="button"
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs"
              onClick={() => setIndustryPatternOverride('mixed_or_unknown')}
            >
              산업 패턴 바꾸기
            </button>
            <button
              type="button"
              className="rounded border border-amber-300 bg-white px-2 py-1 text-xs"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              추출 텍스트 편집으로 돌아가기
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

