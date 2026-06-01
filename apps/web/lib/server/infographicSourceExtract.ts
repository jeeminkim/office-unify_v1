import type {
  InfographicArticlePattern,
  InfographicIndustryPattern,
  InfographicInputSourceType,
  InfographicSourceTone,
  InfographicStructureDensity,
  InfographicSubjectivityLevel,
  SourceExtractionQuality,
} from '@office-unify/shared-types';

const MAX_EXTRACT_TEXT = 22000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function sentenceCount(text: string): number {
  return text
    .split(/(?<=[.!?。！？]|[다요죠함음임됨])\s+|\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 18).length;
}

function koreanBodyRatio(text: string): number {
  const compact = text.replace(/\s+/g, '');
  if (!compact) return 0;
  const ko = compact.match(/[가-힣]/g)?.length ?? 0;
  return ko / compact.length;
}

function urlLikeLineRatio(text: string): number {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return 1;
  const metaLines = lines.filter((line) => /^https?:\/\//i.test(line) || /^출처[:：]/.test(line) || /^source[:：]/i.test(line));
  return metaLines.length / lines.length;
}

export function evaluateSourceExtractionQuality(input: {
  cleanedText: string;
  rawText?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceType?: InfographicInputSourceType;
}): {
  quality: SourceExtractionQuality;
  status: 'usable' | 'insufficient_source';
  reason?: string;
  warnings: string[];
} {
  const text = normalizeWhitespace(input.cleanedText || input.rawText || '');
  const warnings: string[] = [];
  if (!text) {
    return {
      quality: 'blocked_or_empty',
      status: 'insufficient_source',
      reason: 'blocked_or_empty',
      warnings: ['본문을 충분히 읽지 못했습니다.', '블로그 본문을 직접 붙여넣으면 요약을 계속 만들 수 있습니다.'],
    };
  }
  const len = text.length;
  const sentences = sentenceCount(text);
  const koRatio = koreanBodyRatio(text);
  const metaRatio = urlLikeLineRatio(text);
  const title = normalizeWhitespace(input.sourceTitle ?? '');
  const withoutUrl = normalizeWhitespace(text.replace(/https?:\/\/\S+/gi, ''));
  const titleOnly =
    Boolean(title) &&
    withoutUrl.length <= Math.max(120, title.length + 40) &&
    withoutUrl.toLowerCase().includes(title.toLowerCase().slice(0, Math.min(20, title.length)).toLowerCase());

  if (input.sourceType === 'text' && len >= 180 && koRatio >= 0.15) {
    return {
      quality: 'usable_body',
      status: 'usable',
      warnings: len < 600 ? ['manual_body_short_but_usable'] : [],
    };
  }

  if (titleOnly) {
    return {
      quality: 'title_only',
      status: 'insufficient_source',
      reason: 'title_only',
      warnings: ['본문을 충분히 읽지 못했습니다.', '현재 추출된 내용은 제목/출처 수준입니다.'],
    };
  }
  if (metaRatio >= 0.5 && len < 800) {
    return {
      quality: 'metadata_only',
      status: 'insufficient_source',
      reason: 'metadata_only',
      warnings: ['현재 추출된 내용은 제목/출처 수준입니다.', 'URL 원문 추출이 제한되어도, 붙여넣은 본문으로 구조화 분석은 가능합니다.'],
    };
  }
  const minLength = input.sourceType === 'text' ? 240 : 600;
  if (len < minLength || sentences < 4) {
    return {
      quality: 'too_short',
      status: 'insufficient_source',
      reason: `too_short:${len}:${sentences}`,
      warnings: ['본문을 충분히 읽지 못했습니다.', '본문을 직접 붙여넣으면 요약과 인포그래픽 초안을 계속 만들 수 있습니다.'],
    };
  }
  if (input.sourceType === 'url' && koRatio > 0 && koRatio < 0.08 && len < 1200) {
    return {
      quality: 'needs_manual_paste',
      status: 'insufficient_source',
      reason: 'low_body_language_ratio',
      warnings: ['본문을 충분히 읽지 못했습니다.', '블로그 본문을 직접 붙여넣으면 요약을 계속 만들 수 있습니다.'],
    };
  }
  if (len < 900) warnings.push('extracted_body_short_but_usable');
  return {
    quality: 'usable_body',
    status: 'usable',
    warnings,
  };
}

function classifyArticlePattern(params: {
  text: string;
  title?: string;
  sourceUrl?: string;
}): {
  articlePattern: InfographicArticlePattern;
  sourceTone: InfographicSourceTone;
  subjectivityLevel: InfographicSubjectivityLevel;
  structureDensity: InfographicStructureDensity;
} {
  const lower = `${params.title ?? ''}\n${params.text}\n${params.sourceUrl ?? ''}`.toLowerCase();
  const score = (patterns: RegExp[]) => patterns.reduce((acc, re) => acc + (re.test(lower) ? 1 : 0), 0);
  const reportScore = score([/보고서|리포트|survey|설문|요약|전망/, /%|점유율|순위|표|figure|table/, /기관|연구소|investor|sec/]);
  const companyScore = score([/실적|가이던스|매출|영업이익|eps|밸류에이션|기업/, /ceo|cfo|분기|ir/]);
  const opinionScore = score([/내 생각|나는|개인적으로|솔직히|칼럼|opinion|editorial/, /과장|우려|의견|주장/]);
  const marketScore = score([/시황|수급|금리|환율|증시|테마|섹터|모멘텀|선물|채권/]);
  const thematicScore = score([/테마|구조|밸류체인|생태계|플랫폼|전환|확산/]);
  const howtoScore = score([/방법|절차|가이드|체크리스트|어떻게|실무|운영 팁/]);
  let articlePattern: InfographicArticlePattern = 'mixed_or_unknown';
  const top = Math.max(reportScore, companyScore, opinionScore, marketScore, thematicScore, howtoScore);
  if (top > 0) {
    if (top === reportScore) articlePattern = 'industry_report';
    else if (top === companyScore) articlePattern = 'company_report';
    else if (top === opinionScore) articlePattern = 'opinion_editorial';
    else if (top === marketScore) articlePattern = 'market_commentary';
    else if (top === thematicScore) articlePattern = 'thematic_analysis';
    else if (top === howtoScore) articlePattern = 'how_to_explainer';
  }
  const subjectivityLevel: InfographicSubjectivityLevel =
    opinionScore >= 2 ? 'high' : opinionScore >= 1 ? 'medium' : 'low';
  const headingCount = (params.text.match(/\n\s*(\d+\.|[-*]|##?|[가-힣A-Za-z ]{2,20}:)/g) ?? []).length;
  const structureDensity: InfographicStructureDensity =
    headingCount >= 10 ? 'high' : headingCount >= 4 ? 'medium' : 'low';
  const sourceTone: InfographicSourceTone =
    articlePattern === 'industry_report' ? 'institutional'
      : articlePattern === 'company_report' ? 'corporate'
      : articlePattern === 'opinion_editorial' ? 'personal_blog'
      : 'editorial';
  return { articlePattern, sourceTone, subjectivityLevel, structureDensity };
}

function detectIndustryPatternLight(text: string): InfographicIndustryPattern {
  const t = text.toLowerCase();
  if (/반도체|메모리|파운드리|전자|디스플레이/.test(t)) return 'semiconductor_electronics';
  if (/원유|가스|정유|전력|재생에너지|석탄|우라늄/.test(t)) return 'energy_resources';
  if (/사이버|보안|security|랜섬|피싱|관제|탐지|mfa|edr|cnapp|cspm/.test(t)) return 'cybersecurity_service';
  if (/소프트웨어|클라우드|saas|플랫폼|api|ai 서비스/.test(t)) return 'software_platform';
  if (/바이오|헬스|의료|제약|임상/.test(t)) return 'healthcare_bio';
  if (/유통|소비재|리테일|브랜드|이커머스/.test(t)) return 'consumer_retail';
  if (/은행|보험|증권|핀테크|자산운용|결제/.test(t)) return 'finance_insurance';
  if (/자동차|모빌리티|전기차|배터리|자율주행/.test(t)) return 'mobility_automotive';
  if (/콘텐츠|미디어|광고|스트리밍|게임|ip/.test(t)) return 'media_content';
  if (/산업재|기계|플랜트|물류|b2b/.test(t)) return 'industrials_b2b';
  if (/제조|소재|장비|공장/.test(t)) return 'manufacturing';
  return 'mixed_or_unknown';
}

function cleanupExtractedText(text: string): { cleanedText: string; cleanupApplied: boolean; cleanupNotes: string[] } {
  const notes: string[] = [];
  const lines = text.split('\n').map((line) => line.trim());
  const lineCount = new Map<string, number>();
  for (const line of lines) {
    if (!line) continue;
    lineCount.set(line, (lineCount.get(line) ?? 0) + 1);
  }

  const cleanedLines: string[] = [];
  for (const line of lines) {
    if (!line) {
      cleanedLines.push('');
      continue;
    }
    if ((lineCount.get(line) ?? 0) >= 4 && line.length < 80) {
      notes.push('repeated_header_footer_removed');
      continue;
    }
    if (/^page\s*\d+(\s*\/\s*\d+)?$/i.test(line) || /^\d+\s*\/\s*\d+$/.test(line)) {
      notes.push('page_number_line_removed');
      continue;
    }
    if (/copyright|all rights reserved|무단 전재|배포 금지/i.test(line)) {
      notes.push('copyright_line_removed');
      continue;
    }
    if (/^그림\s*\d+|^표\s*\d+|^figure\s*\d+|^table\s*\d+/i.test(line)) {
      notes.push('caption_like_line_removed');
      continue;
    }
    if (/개인적으로|솔직히|말 그대로|사실상|후원|광고|파트너스|구독과 좋아요/i.test(line)) {
      notes.push('opinion_meta_phrase_reduced');
      continue;
    }
    if (/[!?]{3,}|[ㅋㅎ]{3,}|[~]{2,}/.test(line)) {
      notes.push('excessive_emphasis_reduced');
      cleanedLines.push(line.replace(/[!?]{2,}/g, '!').replace(/[ㅋㅎ]{2,}/g, '').trim());
      continue;
    }
    cleanedLines.push(line);
  }

  const merged: string[] = [];
  for (const line of cleanedLines) {
    if (!line) {
      if (merged.length > 0 && merged[merged.length - 1] !== '') merged.push('');
      continue;
    }
    if (line.length <= 2 && /^[\W_]+$/.test(line)) {
      notes.push('noisy_short_line_removed');
      continue;
    }
    if (merged.length === 0 || merged[merged.length - 1] === '') {
      merged.push(line);
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev.length < 120 && line.length < 80) {
      merged[merged.length - 1] = `${prev} ${line}`;
      notes.push('broken_paragraph_joined');
    } else {
      merged.push(line);
    }
  }

  const cleanedText = normalizeWhitespace(merged.join('\n')).slice(0, MAX_EXTRACT_TEXT);
  return {
    cleanedText,
    cleanupApplied: notes.length > 0,
    cleanupNotes: Array.from(new Set(notes)),
  };
}

function stripHtmlToText(html: string): { text: string; title?: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? normalizeWhitespace(titleMatch[1].replace(/<[^>]+>/g, '')) : undefined;
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  const text = normalizeWhitespace(
    withoutScripts
      .replace(/<\/(p|div|h1|h2|h3|li|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&'),
  );
  return { text: text.slice(0, MAX_EXTRACT_TEXT), title };
}

export function normalizeInfographicSourceUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  if (url.hostname === 'm.blog.naver.com') {
    url.hostname = 'blog.naver.com';
  }
  return url.toString();
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; OfficeUnifyInfographic/1.0; +https://office-unifyv1.vercel.app/infographic)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function extractPdfTextFromBytes(buffer: Uint8Array): string {
  // MVP: 텍스트 레이어 PDF의 문자열 토큰(Tj/TJ)만 추출. OCR/복합 폰트 맵은 2차 범위.
  const latin = new TextDecoder('latin1').decode(buffer);
  const chunks: string[] = [];
  const tj = /\(([^()]*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tj.exec(latin)) !== null) chunks.push(m[1]);
  const tjArray = /\[([\s\S]*?)\]\s*TJ/g;
  while ((m = tjArray.exec(latin)) !== null) {
    const inner = m[1];
    const pieces = inner.match(/\(([^()]*)\)/g) ?? [];
    chunks.push(...pieces.map((v) => v.slice(1, -1)));
  }
  return normalizeWhitespace(chunks.join(' ')).slice(0, MAX_EXTRACT_TEXT);
}

export async function resolveInfographicSourceText(params: {
  sourceType: InfographicInputSourceType;
  rawText?: string;
  sourceUrl?: string;
  pdfUrl?: string;
  pdfFile?: File;
}): Promise<{
  rawText: string;
  cleanedText: string;
  sourceUrl?: string;
  sourceTitle?: string;
  extractionWarnings: string[];
  cleanupApplied: boolean;
  cleanupNotes: string[];
  sourceExtractionQuality: SourceExtractionQuality;
  sourceExtractionStatus: 'usable' | 'insufficient_source';
  sourceQualityReason?: string;
  articlePattern: InfographicArticlePattern;
  sourceTone: InfographicSourceTone;
  subjectivityLevel: InfographicSubjectivityLevel;
  structureDensity: InfographicStructureDensity;
  industryPattern: InfographicIndustryPattern;
  rawExtractedTextLength: number;
  cleanedTextLength: number;
}> {
  const warnings: string[] = [];
  if (params.sourceType === 'text') {
    const text = normalizeWhitespace(params.rawText ?? '');
    const rawText = text.slice(0, MAX_EXTRACT_TEXT);
    const cleaned = cleanupExtractedText(rawText);
    const classified = classifyArticlePattern({ text: cleaned.cleanedText });
    const quality = evaluateSourceExtractionQuality({
      cleanedText: cleaned.cleanedText,
      rawText,
      sourceType: params.sourceType,
    });
    return {
      rawText,
      cleanedText: cleaned.cleanedText,
      extractionWarnings: [...warnings, ...quality.warnings],
      cleanupApplied: cleaned.cleanupApplied,
      cleanupNotes: cleaned.cleanupNotes,
      sourceExtractionQuality: quality.quality,
      sourceExtractionStatus: quality.status,
      sourceQualityReason: quality.reason,
      articlePattern: classified.articlePattern,
      sourceTone: classified.sourceTone,
      subjectivityLevel: classified.subjectivityLevel,
      structureDensity: classified.structureDensity,
      industryPattern: detectIndustryPatternLight(cleaned.cleanedText),
      rawExtractedTextLength: rawText.length,
      cleanedTextLength: cleaned.cleanedText.length,
    };
  }

  if (params.sourceType === 'url') {
    const rawUrl = (params.sourceUrl ?? '').trim();
    if (!rawUrl) throw new Error('sourceUrl_required');
    let url: string;
    try {
      url = normalizeInfographicSourceUrl(rawUrl);
    } catch {
      throw new Error('invalid_url');
    }
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`url_fetch_failed:${res.status}`);
    const html = await res.text();
    const extracted = stripHtmlToText(html);
    if (extracted.text.length < 400) warnings.push('url_text_short');
    const cleaned = cleanupExtractedText(extracted.text);
    const classified = classifyArticlePattern({ text: cleaned.cleanedText, title: extracted.title, sourceUrl: url });
    const quality = evaluateSourceExtractionQuality({
      cleanedText: cleaned.cleanedText,
      rawText: extracted.text,
      sourceTitle: extracted.title,
      sourceUrl: url,
      sourceType: params.sourceType,
    });
    return {
      rawText: extracted.text,
      cleanedText: cleaned.cleanedText,
      sourceUrl: url,
      sourceTitle: extracted.title,
      extractionWarnings: [...warnings, ...quality.warnings],
      cleanupApplied: cleaned.cleanupApplied,
      cleanupNotes: cleaned.cleanupNotes,
      sourceExtractionQuality: quality.quality,
      sourceExtractionStatus: quality.status,
      sourceQualityReason: quality.reason,
      articlePattern: classified.articlePattern,
      sourceTone: classified.sourceTone,
      subjectivityLevel: classified.subjectivityLevel,
      structureDensity: classified.structureDensity,
      industryPattern: detectIndustryPatternLight(cleaned.cleanedText),
      rawExtractedTextLength: extracted.text.length,
      cleanedTextLength: cleaned.cleanedText.length,
    };
  }

  if (params.sourceType === 'pdf_url') {
    const rawUrl = (params.pdfUrl ?? '').trim();
    if (!rawUrl) throw new Error('pdfUrl_required');
    let url: string;
    try {
      url = normalizeInfographicSourceUrl(rawUrl);
    } catch {
      throw new Error('invalid_url');
    }
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`pdf_fetch_failed:${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('pdf_too_large');
    const text = extractPdfTextFromBytes(bytes);
    if (text.length < 180) warnings.push('pdf_text_too_short');
    const cleaned = cleanupExtractedText(text);
    const classified = classifyArticlePattern({ text: cleaned.cleanedText, sourceUrl: url });
    const quality = evaluateSourceExtractionQuality({
      cleanedText: cleaned.cleanedText,
      rawText: text,
      sourceUrl: url,
      sourceType: params.sourceType,
    });
    return {
      rawText: text,
      cleanedText: cleaned.cleanedText,
      sourceUrl: url,
      extractionWarnings: [...warnings, ...quality.warnings],
      cleanupApplied: cleaned.cleanupApplied,
      cleanupNotes: cleaned.cleanupNotes,
      sourceExtractionQuality: quality.quality,
      sourceExtractionStatus: quality.status,
      sourceQualityReason: quality.reason,
      articlePattern: classified.articlePattern,
      sourceTone: classified.sourceTone,
      subjectivityLevel: classified.subjectivityLevel,
      structureDensity: classified.structureDensity,
      industryPattern: detectIndustryPatternLight(cleaned.cleanedText),
      rawExtractedTextLength: text.length,
      cleanedTextLength: cleaned.cleanedText.length,
    };
  }

  if (params.sourceType === 'pdf_upload') {
    const file = params.pdfFile;
    if (!file) throw new Error('pdf_file_required');
    if (file.size > MAX_PDF_BYTES) throw new Error('pdf_too_large');
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) throw new Error('invalid_pdf_mime');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = extractPdfTextFromBytes(bytes);
    if (text.length < 180) warnings.push('pdf_text_too_short');
    const cleaned = cleanupExtractedText(text);
    const classified = classifyArticlePattern({ text: cleaned.cleanedText, title: file.name });
    const quality = evaluateSourceExtractionQuality({
      cleanedText: cleaned.cleanedText,
      rawText: text,
      sourceTitle: file.name,
      sourceType: params.sourceType,
    });
    return {
      rawText: text,
      cleanedText: cleaned.cleanedText,
      sourceTitle: file.name,
      extractionWarnings: [...warnings, ...quality.warnings],
      cleanupApplied: cleaned.cleanupApplied,
      cleanupNotes: cleaned.cleanupNotes,
      sourceExtractionQuality: quality.quality,
      sourceExtractionStatus: quality.status,
      sourceQualityReason: quality.reason,
      articlePattern: classified.articlePattern,
      sourceTone: classified.sourceTone,
      subjectivityLevel: classified.subjectivityLevel,
      structureDensity: classified.structureDensity,
      industryPattern: detectIndustryPatternLight(cleaned.cleanedText),
      rawExtractedTextLength: text.length,
      cleanedTextLength: cleaned.cleanedText.length,
    };
  }

  throw new Error('unsupported_source_type');
}

