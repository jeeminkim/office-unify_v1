import type { InfographicInputSourceType } from '@office-unify/shared-types';

const MAX_EXTRACT_TEXT = 22000;
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12000;

function normalizeWhitespace(text: string): string {
  return text.replace(/\r/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
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

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
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
  sourceUrl?: string;
  sourceTitle?: string;
  extractionWarnings: string[];
}> {
  const warnings: string[] = [];
  if (params.sourceType === 'text') {
    const text = normalizeWhitespace(params.rawText ?? '');
    return { rawText: text.slice(0, MAX_EXTRACT_TEXT), extractionWarnings: warnings };
  }

  if (params.sourceType === 'url') {
    const url = (params.sourceUrl ?? '').trim();
    if (!url) throw new Error('sourceUrl_required');
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`url_fetch_failed:${res.status}`);
    const html = await res.text();
    const extracted = stripHtmlToText(html);
    if (extracted.text.length < 400) warnings.push('url_text_short');
    return {
      rawText: extracted.text,
      sourceUrl: url,
      sourceTitle: extracted.title,
      extractionWarnings: warnings,
    };
  }

  if (params.sourceType === 'pdf_url') {
    const url = (params.pdfUrl ?? '').trim();
    if (!url) throw new Error('pdfUrl_required');
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`pdf_fetch_failed:${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.byteLength > MAX_PDF_BYTES) throw new Error('pdf_too_large');
    const text = extractPdfTextFromBytes(bytes);
    if (text.length < 180) warnings.push('pdf_text_too_short');
    return { rawText: text, sourceUrl: url, extractionWarnings: warnings };
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
    return { rawText: text, sourceTitle: file.name, extractionWarnings: warnings };
  }

  throw new Error('unsupported_source_type');
}

