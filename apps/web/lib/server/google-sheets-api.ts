/**
 * Google Sheets API v4 — googleapis 패키지 없이 서비스 계정 JWT + fetch만 사용.
 * 스프레드시트에 편집자 권한이 있는 서비스 계정 이메일을 공유해야 한다.
 */

import { createPrivateKey, sign as cryptoSign } from 'node:crypto';

type ServiceAccountCredentials = {
  client_email: string;
  private_key: string;
};

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
