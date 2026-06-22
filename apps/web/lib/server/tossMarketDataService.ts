import 'server-only';

const TOSS_API_BASE_URL = 'https://openapi.tossinvest.com';
const REQUEST_TIMEOUT_MS = 4_000;
const TOKEN_EXPIRY_BUFFER_MS = 60_000;
const MAX_SYMBOLS_PER_REQUEST = 200;

type TossTokenResponse = {
  access_token?: string;
  expires_in?: number;
};

type TossPriceResponse = {
  result?: Array<{
    symbol?: string;
    timestamp?: string | null;
    lastPrice?: string;
    currency?: string;
  }>;
};

type TossExchangeRateResponse = {
  result?: {
    rate?: string;
    midRate?: string;
  };
};

export type TossAccount = {
  accountNo: string;
  accountSeq: number;
  accountType: string;
};

type CurrencyAmounts = {
  krw: string;
  usd?: string | null;
};

export type TossHoldingItem = {
  symbol: string;
  name: string;
  marketCountry: 'KR' | 'US' | string;
  currency: 'KRW' | 'USD' | string;
  quantity: string;
  lastPrice: string;
  averagePurchasePrice: string;
  marketValue: {
    purchaseAmount: string;
    amount: string;
    amountAfterCost: string;
  };
  profitLoss: {
    amount: string;
    amountAfterCost: string;
    rate: string;
    rateAfterCost: string;
  };
  dailyProfitLoss: { amount: string; rate: string };
};

export type TossHoldingsOverview = {
  totalPurchaseAmount: CurrencyAmounts;
  marketValue: { amount: CurrencyAmounts; amountAfterCost: CurrencyAmounts };
  profitLoss: {
    amount: CurrencyAmounts;
    amountAfterCost: CurrencyAmounts;
    rate: string;
    rateAfterCost: string;
  };
  dailyProfitLoss: { amount: CurrencyAmounts; rate: string };
  items: TossHoldingItem[];
};

export type TossMarketPrice = {
  symbol: string;
  price: number;
  currency?: string;
  timestamp?: string;
};

let tokenCache: { accessToken: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

export function isTossMarketDataConfigured(): boolean {
  return Boolean(process.env.TOSS_API_KEY?.trim() && process.env.TOSS_API_SECRET_KEY?.trim());
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timeout);
  }
}

async function issueAccessToken(): Promise<string> {
  const clientId = process.env.TOSS_API_KEY?.trim();
  const clientSecret = process.env.TOSS_API_SECRET_KEY?.trim();
  if (!clientId || !clientSecret) throw new Error('toss_api_not_configured');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  const response = await fetchWithTimeout(`${TOSS_API_BASE_URL}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!response.ok) throw new Error(`toss_token_failed_${response.status}`);

  const json = (await response.json()) as TossTokenResponse;
  const accessToken = json.access_token?.trim();
  if (!accessToken) throw new Error('toss_token_missing');
  const expiresIn = Number(json.expires_in ?? 0);
  tokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(0, expiresIn * 1_000 - TOKEN_EXPIRY_BUFFER_MS),
  };
  return accessToken;
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.accessToken;
  if (!tokenRequest) {
    tokenRequest = issueAccessToken().finally(() => {
      tokenRequest = null;
    });
  }
  return tokenRequest;
}

async function tossGet<T>(path: string, accessToken: string, headers?: HeadersInit): Promise<T> {
  const response = await fetchWithTimeout(`${TOSS_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, ...headers },
  });
  if (!response.ok) throw new Error(`toss_api_failed_${response.status}`);
  return (await response.json()) as T;
}

export async function fetchTossAssetSnapshot(): Promise<{
  account: TossAccount;
  holdings: TossHoldingsOverview;
  usdKrwRate?: number;
}> {
  const accessToken = await getAccessToken();
  const accountResponse = await tossGet<{ result?: TossAccount[] }>('/api/v1/accounts', accessToken);
  const accounts = accountResponse.result ?? [];
  const configuredSeq = Number(process.env.TOSS_API_ACCOUNT_SEQ ?? NaN);
  const account = Number.isFinite(configuredSeq)
    ? accounts.find((candidate) => candidate.accountSeq === configuredSeq)
    : accounts.find((candidate) => candidate.accountType === 'BROKERAGE') ?? accounts[0];
  if (!account) throw new Error('toss_account_not_found');

  const [holdingsResponse, exchangeRateResponse] = await Promise.all([
    tossGet<{ result?: TossHoldingsOverview }>('/api/v1/holdings', accessToken, {
      'X-Tossinvest-Account': String(account.accountSeq),
    }),
    tossGet<TossExchangeRateResponse>(
      '/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW',
      accessToken,
    ).catch(() => null),
  ]);
  if (!holdingsResponse.result) throw new Error('toss_holdings_missing');

  const rate = Number(exchangeRateResponse?.result?.midRate ?? exchangeRateResponse?.result?.rate ?? NaN);
  return {
    account,
    holdings: holdingsResponse.result,
    usdKrwRate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
  };
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export async function fetchTossMarketData(symbols: string[]): Promise<{
  prices: Map<string, TossMarketPrice>;
  usdKrwRate?: number;
}> {
  const accessToken = await getAccessToken();
  const normalizedSymbols = Array.from(
    new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean)),
  );

  const priceRequests = chunks(normalizedSymbols, MAX_SYMBOLS_PER_REQUEST).map(async (batch) => {
    const query = encodeURIComponent(batch.join(','));
    return tossGet<TossPriceResponse>(`/api/v1/prices?symbols=${query}`, accessToken);
  });
  const exchangeRateRequest = tossGet<TossExchangeRateResponse>(
    '/api/v1/exchange-rate?baseCurrency=USD&quoteCurrency=KRW',
    accessToken,
  ).catch(() => null);
  const [priceResponses, exchangeRateResponse] = await Promise.all([
    Promise.all(priceRequests),
    exchangeRateRequest,
  ]);

  const prices = new Map<string, TossMarketPrice>();
  priceResponses.flatMap((response) => response.result ?? []).forEach((row) => {
    const symbol = row.symbol?.trim().toUpperCase();
    const price = Number(row.lastPrice ?? NaN);
    if (!symbol || !Number.isFinite(price) || price <= 0) return;
    prices.set(symbol, {
      symbol,
      price,
      currency: row.currency,
      timestamp: row.timestamp ?? undefined,
    });
  });

  const rate = Number(exchangeRateResponse?.result?.midRate ?? exchangeRateResponse?.result?.rate ?? NaN);
  return {
    prices,
    usdKrwRate: Number.isFinite(rate) && rate > 0 ? rate : undefined,
  };
}

export function resetTossTokenCacheForTests(): void {
  tokenCache = null;
  tokenRequest = null;
}
