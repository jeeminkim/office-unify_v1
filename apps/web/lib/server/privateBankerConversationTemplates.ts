import type {
  PbActionCategory,
  PbConversationTemplateType,
  PbDailyConversationMemoryCandidate,
  PbDailyConversationSummary,
} from '@office-unify/shared-types';

const TEMPLATE_QUESTIONS: Record<PbConversationTemplateType, string[]> = {
  daily_checkin: [
    '오늘 가장 신경 쓰이는 종목/섹터는?',
    '지금 하고 싶은 행동은?',
    '그 행동을 하고 싶은 이유와 불안한 점은?',
  ],
  buy_check: [
    '이 종목을 사려는 핵심 이유는 무엇인가요?',
    '이 판단은 단기 이슈인가요, 중장기 thesis인가요?',
    '지금 가격에서 사야 하는 이유가 있나요?',
    '이미 보유 중이라면 비중은 부담스럽지 않나요?',
    '틀렸다고 판단할 기준은 무엇인가요?',
    '오늘 바로 사지 않고 하루 더 봐도 되는 이유는 없나요?',
  ],
  sell_check: [
    '매도하려는 이유는 가격 하락 때문인가요, thesis 훼손 때문인가요?',
    '처음 매수했던 이유는 아직 유효한가요?',
    '손실 회피 감정이 판단에 개입하고 있나요?',
    '반대로 미련 때문에 손절을 미루고 있지는 않나요?',
    '매도 후 어떤 조건에서 다시 볼 건가요?',
    '전량 매도와 부분 축소 중 어느 쪽이 더 합리적인가요?',
  ],
  anxiety_check: [
    '불안의 원인은 가격인가요, 뉴스인가요, 실적/업황 변화인가요?',
    '이 종목을 처음 본 핵심 이유는 무엇이었나요?',
    '그 이유가 지금도 유지되나요?',
    '지금 당장 행동하지 않으면 어떤 점이 가장 불편한가요?',
    '확인 전까지 절대 하지 말아야 할 행동은 무엇인가요?',
  ],
  compare_check: [
    '비교하는 종목들은 무엇인가요?',
    '비교 기준은 무엇인가요?',
    '이미 보유 중인 종목이 있나요?',
    '새로 살 종목을 고르는 건가요, 비중 조정인가요?',
    '한 종목만 고른다면 감수할 수 있는 리스크는 무엇인가요?',
  ],
  research_check: [
    '리서치 대상은 종목인가요, 섹터인가요, ETF인가요?',
    '알고 싶은 핵심 질문은 무엇인가요?',
    '이미 가지고 있는 가설은 무엇인가요?',
    '반대로 가장 의심되는 점은 무엇인가요?',
    '리서치 결과를 어떤 행동에 연결하고 싶나요?',
  ],
  freeform: ['대화 요약', '투자 판단 관련성', '확인할 점', '저장 여부 판단'],
};

const REQUIRED_SECTIONS: Record<PbConversationTemplateType, string[]> = {
  buy_check: ['행동 분류', '정보 상태', '매수 thesis', '확인해야 할 근거', '하면 안 되는 행동', '오늘의 결론', '저장할 핵심 메모리'],
  sell_check: ['행동 분류', '정보 상태', '기존 thesis 점검', '훼손된 근거', '아직 유효한 근거', '감정 개입 여부', '오늘의 결론', '저장할 핵심 메모리'],
  anxiety_check: ['현재 감정 상태', '불안의 원인', 'thesis 유지 여부', '오늘 하지 말아야 할 행동', '다음 확인 신호', '저장할 핵심 메모리'],
  compare_check: ['비교 목적', '후보별 thesis', '후보별 리스크', '사용자 성향 기준 적합도', '오늘의 우선순위', '보류해야 할 조건', '저장할 핵심 메모리'],
  research_check: ['리서치 목적', '사용자 기존 가설', '검증해야 할 질문', '필요 데이터', '리서치 결과 사용 방식', '저장할 핵심 메모리'],
  daily_checkin: ['오늘의 핵심 관심', '행동 의도', '확신과 불안', 'PB 코멘트', '다음 확인', '저장할 핵심 메모리'],
  freeform: ['대화 요약', '투자 판단 관련성', '확인할 점', '저장 여부 판단'],
};

const ACTION_WORDS: Array<{ action: PbActionCategory; patterns: RegExp[] }> = [
  { action: 'add_buy', patterns: [/추가\s*매수/i, /물타기/i] },
  { action: 'buy', patterns: [/사고\s*싶/i, /매수(?!.*전\s*체크)/i, /진입/i, /매수\s*타이밍/i, /들어가도/i] },
  { action: 'trim', patterns: [/비중\s*(줄|축소)/i, /부분\s*(매도|축소)/i] },
  { action: 'sell', patterns: [/팔까/i, /매도/i, /손절/i] },
  { action: 'hold', patterns: [/관망/i, /보유/i, /버텨도/i, /홀드/i] },
  { action: 'research', patterns: [/리서치/i, /분석해/i, /보고서/i, /섹터\s*분석/i] },
  { action: 'compare', patterns: [/(.+랑.+중)/i, /비교/i, /뭐가\s*더\s*낫/i, /vs\.?| VS /i] },
  { action: 'review', patterns: [/점검/i, /체크/i, /검토/i] },
  { action: 'watch', patterns: [/관찰/i, /지켜/i, /봐도/i] },
];

export function detectPbTemplateType(content: string, explicit?: PbConversationTemplateType | null): PbConversationTemplateType {
  const text = content.trim();
  if (/사고\s*싶|추가\s*매수|진입|매수\s*타이밍|들어가도/i.test(text)) return 'buy_check';
  if (/팔까|매도|손절|비중\s*줄|비중\s*축소/i.test(text)) return 'sell_check';
  if (/불안|계속\s*빠진|버텨도\s*되|물렸|물렸다/i.test(text)) return 'anxiety_check';
  if (/(.+랑.+중)|비교|뭐가\s*더\s*낫|vs\.?| VS /i.test(text)) return 'compare_check';
  if (/리서치|분석해|보고서|섹터\s*분석/i.test(text)) return 'research_check';
  return explicit ?? (text.length > 0 ? 'freeform' : 'daily_checkin');
}

export function detectPbActionCategory(content: string, explicit?: PbActionCategory | null): PbActionCategory {
  const text = content.trim();
  for (const item of ACTION_WORDS) {
    if (item.patterns.some((pattern) => pattern.test(text))) return item.action;
  }
  return explicit ?? 'no_action';
}

export function buildPbTemplateQuestions(templateType: PbConversationTemplateType): string[] {
  return TEMPLATE_QUESTIONS[templateType] ?? TEMPLATE_QUESTIONS.freeform;
}

export function getRequiredPbResponseSections(templateType: PbConversationTemplateType): string[] {
  return REQUIRED_SECTIONS[templateType] ?? REQUIRED_SECTIONS.freeform;
}

export function buildPbTemplatePromptSection(input: {
  templateType: PbConversationTemplateType;
  actionCategory: PbActionCategory;
  recentConversationContext?: string | null;
  memoryContext?: string | null;
}): string {
  const questions = buildPbTemplateQuestions(input.templateType);
  const sections = getRequiredPbResponseSections(input.templateType);
  const chunks = [
    '[PB Daily Conversation Template]',
    `template_type: ${input.templateType}`,
    `action_category: ${input.actionCategory}`,
    '',
    '이번 답변은 사용자의 투자 판단 구조를 정리하고 리스크를 확인하는 역할입니다. 매수/매도 지시, 자동 주문, 자동 리밸런싱 제안은 금지합니다.',
    '',
    '[사용자에게 적용된 질문 템플릿]',
    ...questions.map((q, idx) => `${idx + 1}. ${q}`),
    '',
    '[이번 답변 필수 섹션]',
    ...sections.map((section) => `[${section}]`),
    '',
    '[저장 정책]',
    '대화 전문이 아니라 투자 판단에 필요한 구조화 요약만 저장됩니다. [저장할 핵심 메모리]에는 반복성, 중요도, 실제 판단 영향도가 있는 후보만 적습니다.',
  ];
  if (input.recentConversationContext?.trim()) {
    chunks.push('', '[최근 PB daily conversation 요약]', input.recentConversationContext.trim());
  }
  if (input.memoryContext?.trim()) {
    chunks.push('', '[user_investment_memory 후보/승격 기억 요약]', input.memoryContext.trim());
  }
  return chunks.join('\n');
}

function sectionBody(text: string, section: string): string {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\[${escaped}\\]\\s*([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)`, 'i');
  return (text.match(re)?.[1] ?? '').trim();
}

function splitList(text: string, max = 6): string[] {
  return text
    .split(/\n|ㆍ|·|;|,/)
    .map((item) => item.replace(/^[-*\d.\s]+/, '').trim())
    .filter(Boolean)
    .slice(0, max);
}

function extractSymbolsAndThemes(userContent: string): { symbols: string[]; themes: string[] } {
  const tokens = Array.from(userContent.matchAll(/[A-Z]{1,5}|\b\d{6}\b|[가-힣A-Za-z0-9]+(?:전기|전자|반도체|바이오|인프라|데이터센터|전력|AI|ETF|테크|수요)/g))
    .map((m) => m[0])
    .filter((v) => v.length > 1);
  const symbols = Array.from(new Set(tokens.filter((v) => /^[A-Z]{1,5}$|\d{6}|[가-힣A-Za-z0-9]+(?:전기|전자|바이오|ETF)$/.test(v)))).slice(0, 8);
  const themePhrases = [
    /AI\s*데이터센터\s*전력\s*수요/i,
    /AI\s*전력\s*인프라/i,
    /데이터센터\s*전력\s*수요/i,
    /전력\s*인프라/i,
  ].flatMap((re) => userContent.match(re)?.[0] ?? []);
  const themes = Array.from(new Set([...themePhrases, ...tokens.filter((v) => !symbols.includes(v))])).slice(0, 8);
  return { symbols, themes };
}

function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/ai\s*데이터센터\s*전력\s*수요|ai\s*전력\s*인프라|데이터센터\s*전력\s*수요/g, 'ai_power_infra')
    .replace(/전력\s*인프라/g, 'power_infra')
    .replace(/추가\s*매수/g, 'add_buy')
    .replace(/[^a-z0-9가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function memoryKey(input: {
  memoryType: PbDailyConversationMemoryCandidate['memoryType'];
  symbols: string[];
  themes: string[];
  fallback: string;
}): string {
  const theme = input.themes.map(slugPart).find(Boolean);
  const symbols = input.symbols.map(slugPart).filter(Boolean).slice(0, 3).join('_');
  const base =
    input.memoryType === 'risk_pattern'
      ? 'theme_conviction_add_buy_risk'
      : [theme, symbols].filter(Boolean).join('_') || slugPart(input.fallback);
  const key = `${input.memoryType}:${base}`.slice(0, 110);
  return key || `${input.memoryType}:pb_memory`;
}

function shouldKeepMemoryCandidate(content: string): boolean {
  const text = content.trim();
  if (text.length < 12) return false;
  if (/오를\s*것|떨어질\s*것|느낌|그냥|오늘\s*뉴스만/i.test(text) && !/기준|thesis|테마|확인|수주|실적|수급|위험|유혹|원칙/i.test(text)) {
    return false;
  }
  if (/매수하라|매도하라|자동\s*주문|리밸런싱하라/i.test(text)) return false;
  return /thesis|테마|확신|유혹|기준|원칙|확인|수주|실적|수급|리스크|불안|관찰|선호|보류|하지 말/i.test(text);
}

function inferMemoryType(content: string, idx: number): PbDailyConversationMemoryCandidate['memoryType'] {
  if (/유혹|실수|물타기|추가\s*매수|서두/i.test(content)) return 'risk_pattern';
  if (/선호|좋아|관심\s*테마/i.test(content)) return 'preferred_theme';
  if (/하지\s*말|금지|보류|확인\s*전/i.test(content)) return 'avoidance_rule';
  if (/원칙|내\s*기준|기준/i.test(content)) return 'investment_principle';
  if (/보유|포지션|비중/i.test(content)) return 'position_context';
  return idx === 0 ? 'watching_thesis' : 'decision_style';
}

export function extractPbDailyConversationSummary(input: {
  userContent: string;
  assistantContent: string;
  templateType: PbConversationTemplateType;
  actionCategory: PbActionCategory;
}): PbDailyConversationSummary {
  const { symbols, themes } = extractSymbolsAndThemes(input.userContent);
  const memoryRaw = sectionBody(input.assistantContent, '저장할 핵심 메모리');
  const nextRaw =
    sectionBody(input.assistantContent, '다음 확인') ||
    sectionBody(input.assistantContent, '다음 확인 신호') ||
    sectionBody(input.assistantContent, '확인해야 할 근거') ||
    sectionBody(input.assistantContent, '검증해야 할 질문');
  const thesisRaw =
    sectionBody(input.assistantContent, '매수 thesis') ||
    sectionBody(input.assistantContent, '기존 thesis 점검') ||
    sectionBody(input.assistantContent, 'thesis 유지 여부') ||
    sectionBody(input.assistantContent, '후보별 thesis') ||
    sectionBody(input.assistantContent, '사용자 기존 가설');
  const riskRaw =
    sectionBody(input.assistantContent, '하면 안 되는 행동') ||
    sectionBody(input.assistantContent, '훼손된 근거') ||
    sectionBody(input.assistantContent, '감정 개입 여부') ||
    sectionBody(input.assistantContent, '후보별 리스크') ||
    sectionBody(input.assistantContent, '보류해야 할 조건');
  const intent =
    sectionBody(input.assistantContent, '행동 의도') ||
    sectionBody(input.assistantContent, '행동 분류') ||
    sectionBody(input.assistantContent, '대화 요약') ||
    input.userContent.slice(0, 120);
  const emotionalState = sectionBody(input.assistantContent, '현재 감정 상태') || sectionBody(input.assistantContent, '확신과 불안') || undefined;
  const memoryCandidates: PbDailyConversationMemoryCandidate[] = splitList(memoryRaw, 6)
    .filter(shouldKeepMemoryCandidate)
    .map((content, idx) => {
      const memoryType = inferMemoryType(content, idx);
      const score =
        35 +
        (symbols.length > 0 ? 15 : 0) +
        (themes.length > 0 ? 15 : 0) +
        (/기준|원칙|확인|금지|보류/i.test(content) ? 20 : 0) +
        (/유혹|반복|실수|thesis|테마/i.test(content) ? 15 : 0);
      return {
        memoryType,
        memoryKey: memoryKey({ memoryType, symbols, themes, fallback: content }),
        title: content.slice(0, 48),
        content,
        relatedSymbols: symbols,
        relatedThemes: themes,
        evidence: {
          source: 'pb_daily_conversation',
          templateType: input.templateType,
          actionCategory: input.actionCategory,
          userIntent: intent.slice(0, 240),
          emotionalState,
          confidenceLevel: 'unknown',
          extractedAt: new Date().toISOString(),
          relation: /훼손|약화|전환|바뀜|보류로\s*전환/i.test(content) ? 'thesis_shift' : 'supporting',
        },
        promotionScore: Math.min(100, score),
        promotionReason: score >= 70 ? 'specific thesis/risk/check criteria detected' : 'candidate kept for repeated evidence check',
      };
    });

  return {
    templateType: input.templateType,
    userIntent: intent.slice(0, 240),
    actionCategory: input.actionCategory,
    symbols,
    themes,
    emotionalState,
    confidenceLevel: 'unknown',
    thesisSnapshot: {
      coreBelief: thesisRaw.slice(0, 800),
      supportingReasons: splitList(thesisRaw),
    },
    riskSnapshot: {
      mainRisk: riskRaw.slice(0, 800),
      requiredGuardrail: sectionBody(input.assistantContent, '오늘 하지 말아야 할 행동') || sectionBody(input.assistantContent, '하면 안 되는 행동'),
    },
    nextCheckpoints: splitList(nextRaw),
    memoryCandidates,
  };
}

export function buildPbMemoryExtractionPrompt(summary: PbDailyConversationSummary): string {
  return [
    '[PB memory extraction candidate]',
    `template_type: ${summary.templateType}`,
    `action_category: ${summary.actionCategory}`,
    `user_intent: ${summary.userIntent}`,
    `symbols: ${summary.symbols.join(', ') || '-'}`,
    `themes: ${summary.themes.join(', ') || '-'}`,
    'memory_candidates:',
    ...summary.memoryCandidates.map((m) => `- ${m.memoryType}/${m.memoryKey}: ${m.content}`),
  ].join('\n');
}
