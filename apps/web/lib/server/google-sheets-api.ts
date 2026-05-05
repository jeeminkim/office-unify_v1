/**
 * Google Sheets API v4 — googleapis 패키지 없이 서비스 계정 JWT + fetch만 사용.
 * 스프레드시트에 편집자 권한이 있는 서비스 계정 이메일을 공유해야 한다.
 */

import { createPrivateKey, sign as cryptoSign } from 'node:crypto';

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

export type SheetTabMeta = { sheetId?: number; title: string };
export type NormalizedSheetsErrorCode =
  | 'sheet_tab_missing_or_invalid_range'
  | 'sheet_permission_denied'
  | 'spreadsheet_not_found_or_wrong_id'
  | 'sheets_update_failed'
  | 'sheets_read_failed';

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createServiceAccountJwt(credentials: ServiceAccountCredentials): string {
  const header = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        iss: credentials.client_email,
        scope: 'https://www.googleapis.com/auth/spreadsheets',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now,
      }),
    ),
  );
  const unsigned = `${header}.${payload}`;
  const key = createPrivateKey(credentials.private_key);
  const sig = cryptoSign('RSA-SHA256', Buffer.from(unsigned, 'utf8'), key);
  const sigPart = base64url(sig);
  return `${unsigned}.${sigPart}`;
}

let cachedToken: { token: string; exp: number } | null = null;

export async function getSheetsAccessToken(): Promise<string | null> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  let credentials: ServiceAccountCredentials;
  try {
    credentials = JSON.parse(raw) as ServiceAccountCredentials;
  } catch {
    return null;
  }
  if (!credentials.client_email || !credentials.private_key) return null;

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + 60) {
    return cachedToken.token;
  }

  const assertion = createServiceAccountJwt(credentials);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google OAuth token failed: ${res.status} ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('Google OAuth: no access_token');
  const exp = now + (data.expires_in ?? 3500);
  cachedToken = { token: data.access_token, exp };
  return data.access_token;
}

export function escapeSheetNameForA1(sheetName: string): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `'${escaped}'`;
}

export function buildA1Range(sheetName: string, range: string): string {
  return `${escapeSheetNameForA1(sheetName)}!${range}`;
}

/** 1-based 열 번호 → A, B, …, AA */
export function sheetColumnLetter(columnNumber: number): string {
  let n = Math.max(1, Math.floor(columnNumber));
  let label = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    label = String.fromCharCode(65 + rem) + label;
    n = Math.floor((n - 1) / 26);
  }
  return label;
}

export function normalizeSheetsApiError(error: unknown): { code: NormalizedSheetsErrorCode; message: string } {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  const lower = message.toLowerCase();
  if (lower.includes('unable to parse range')) {
    return { code: 'sheet_tab_missing_or_invalid_range', message };
  }
  if (lower.includes(' 403 ') || lower.includes('status 403')) {
    return { code: 'sheet_permission_denied', message };
  }
  if (lower.includes(' 404 ') || lower.includes('status 404')) {
    return { code: 'spreadsheet_not_found_or_wrong_id', message };
  }
  if (lower.includes('values.get failed')) {
    return { code: 'sheets_read_failed', message };
  }
  return { code: 'sheets_update_failed', message };
}

async function sheetsGetSpreadsheet(params: { spreadsheetId: string }): Promise<unknown> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}`,
  );
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets spreadsheets.get failed: ${res.status} ${t.slice(0, 400)}`);
  }
  return res.json();
}

export async function getSpreadsheetSheets(spreadsheetId: string): Promise<SheetTabMeta[]> {
  const data = (await sheetsGetSpreadsheet({ spreadsheetId })) as {
    sheets?: Array<{ properties?: { sheetId?: number; title?: string } }>;
  };
  return (data.sheets ?? [])
    .map((s) => ({
      sheetId: s.properties?.sheetId,
      title: s.properties?.title ?? '',
    }))
    .filter((s) => s.title.length > 0);
}

export async function ensureSheetTab(params: {
  spreadsheetId: string;
  title: string;
  header?: string[];
}): Promise<{ existed: boolean; created: boolean; sheetId?: number }> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  const existing = await getSpreadsheetSheets(params.spreadsheetId);
  const found = existing.find((s) => s.title === params.title);
  if (found) {
    if (params.header && params.header.length > 0) {
      const headerCell = await sheetsValuesGet({
        spreadsheetId: params.spreadsheetId,
        rangeA1: buildA1Range(params.title, 'A1:A1'),
      }).catch(() => []);
      const hasHeader = String(headerCell?.[0]?.[0] ?? '').trim().length > 0;
      if (!hasHeader) {
        await sheetsValuesUpdate({
          spreadsheetId: params.spreadsheetId,
          rangeA1: buildA1Range(params.title, `A1:${sheetColumnLetter(params.header.length)}1`),
          values: [params.header],
          valueInputOption: 'USER_ENTERED',
        });
      }
    }
    return { existed: true, created: false, sheetId: found.sheetId };
  }

  const addUrl = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}:batchUpdate`,
  );
  const addRes = await fetch(addUrl.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: params.title } } }],
    }),
  });
  if (!addRes.ok) {
    const t = await addRes.text();
    throw new Error(`Sheets batchUpdate addSheet failed: ${addRes.status} ${t.slice(0, 400)}`);
  }
  const addData = (await addRes.json()) as {
    replies?: Array<{ addSheet?: { properties?: { sheetId?: number } } }>;
  };
  const sheetId = addData.replies?.[0]?.addSheet?.properties?.sheetId;
  if (params.header && params.header.length > 0) {
    await sheetsValuesUpdate({
      spreadsheetId: params.spreadsheetId,
      rangeA1: buildA1Range(params.title, `A1:${sheetColumnLetter(params.header.length)}1`),
      values: [params.header],
      valueInputOption: 'USER_ENTERED',
    });
  }
  return { existed: false, created: true, sheetId };
}

export async function sheetsValuesUpdate(params: {
  spreadsheetId: string;
  rangeA1: string;
  values: string[][];
  /** USER_ENTERED: 수식·로케일 숫자 해석. RAW: 문자 그대로. */
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}): Promise<void> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.rangeA1)}`,
  );
  url.searchParams.set('valueInputOption', params.valueInputOption ?? 'USER_ENTERED');

  const res = await fetch(url.toString(), {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: params.values }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets values.update failed: ${res.status} ${t.slice(0, 400)}`);
  }
}

/** 여러 범위를 한 요청으로 갱신(G/I/K/M 등 수식 결과 열을 건드리지 않을 때 사용). */
export async function sheetsValuesBatchUpdate(params: {
  spreadsheetId: string;
  valueInputOption?: 'RAW' | 'USER_ENTERED';
  data: Array<{ rangeA1: string; values: string[][] }>;
}): Promise<void> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values:batchUpdate`,
  );
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: params.valueInputOption ?? 'USER_ENTERED',
      data: params.data.map((d) => ({ range: d.rangeA1, values: d.values })),
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets values.batchUpdate failed: ${res.status} ${t.slice(0, 400)}`);
  }
}

export async function sheetsValuesAppend(params: {
  spreadsheetId: string;
  rangeA1: string;
  values: string[][];
  valueInputOption?: 'RAW' | 'USER_ENTERED';
}): Promise<void> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');

  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.rangeA1)}:append`,
  );
  url.searchParams.set('valueInputOption', params.valueInputOption ?? 'RAW');
  url.searchParams.set('insertDataOption', 'INSERT_ROWS');

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: params.values }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets values.append failed: ${res.status} ${t.slice(0, 400)}`);
  }
}

export async function sheetsValuesGet(params: {
  spreadsheetId: string;
  rangeA1: string;
  valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';
  dateTimeRenderOption?: 'SERIAL_NUMBER' | 'FORMATTED_STRING';
}): Promise<unknown[][]> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values/${encodeURIComponent(params.rangeA1)}`,
  );
  if (params.valueRenderOption) {
    url.searchParams.set('valueRenderOption', params.valueRenderOption);
  }
  if (params.dateTimeRenderOption) {
    url.searchParams.set('dateTimeRenderOption', params.dateTimeRenderOption);
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets values.get failed: ${res.status} ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as { values?: unknown[][] };
  return data.values ?? [];
}

/** 여러 범위를 동일 valueRenderOption으로 한 번에 조회. 반환 순서는 rangesA1와 동일. */
export async function sheetsValuesBatchGet(params: {
  spreadsheetId: string;
  rangesA1: string[];
  valueRenderOption?: 'FORMATTED_VALUE' | 'UNFORMATTED_VALUE' | 'FORMULA';
  dateTimeRenderOption?: 'SERIAL_NUMBER' | 'FORMATTED_STRING';
}): Promise<unknown[][][]> {
  const token = await getSheetsAccessToken();
  if (!token) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not configured');
  if (params.rangesA1.length === 0) return [];
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}/values:batchGet`,
  );
  for (const r of params.rangesA1) {
    url.searchParams.append('ranges', r);
  }
  if (params.valueRenderOption) {
    url.searchParams.set('valueRenderOption', params.valueRenderOption);
  }
  if (params.dateTimeRenderOption) {
    url.searchParams.set('dateTimeRenderOption', params.dateTimeRenderOption);
  }
  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Sheets values.batchGet failed: ${res.status} ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as { valueRanges?: Array<{ values?: unknown[][] }> };
  const ranges = data.valueRanges ?? [];
  return params.rangesA1.map((_, i) => ranges[i]?.values ?? []);
}
