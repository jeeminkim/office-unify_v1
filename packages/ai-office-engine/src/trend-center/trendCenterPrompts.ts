import type { TrendAnalysisGenerateRequestBody, TrendReportMode } from '@office-unify/shared-types';
import type { TrendSourcePack } from './trendCenterSourcePack';

const CURATOR_LENS = `
당신은 "Chief Trend Curator" 관점으로만 작성한다 (실존 인물 연기 금지).
렌즈: 사람을 오래 붙잡는 재미·몰입, 팬덤·IP 확장, 콘텐츠→경험→반복 결제→가격 결정력,
현장·스포츠·엔터·테마형 경험의 수익화, AI 시대에 인간다움이 강화되는 소비 카테고리.
`;

const SKEPTIC_LENS = `
내부 검증(문장에 그대로 쓰지 말고 반영): 밈·과열·실적 미연결·반복 결제 부재를 의심한다.
`;

const STRUCTURE_LENS = `
내부 검증(문장에 그대로 쓰지 말고 반영): 반복 패턴·재현 가능한 신호·지속성을 본다.
`;

const STYLE_RULES = `
문체: 핵심 먼저, 짧고 선명하게, 쉬운 표현. 감상문·뉴스 헤드라인 나열 금지.
구분: [사실] [해석] [가설] [추적포인트] 태그를 본문에 적절히 사용한다 (최소 각 1회 이상).
돈의 흐름 우선. 직접·간접·인프라 수혜를 반드시 구분한다.
마지막 추적 포인트는 실행 가능한 질문·지표·일정 형태로 남긴다.
외부 실시간 소스가 제한되면, 확인 가능한 범위를 명시하고 추측과 구분한다.
`;

function weeklySectionContract(): string {
  return `
아래 번호와 제목을 정확히 사용하고, 각 섹션은 ## 로 시작한다 (## 0. … 형식).

## 0. 한눈에 보는 결론
## 1. 이번 주 핵심 흐름 Top 5
## 2. 지금 뜨는 콘텐츠/이벤트/경험
## 3. 돈을 버는 주체는 누구인가
### 직접 수혜주
(티커·기업명·ETF를 가능하면)
### 간접 수혜주
### 인프라 수혜주
## 4. 점수화 평가
(간단한 체크리스트·점수 표가 아니라, 항목별 짧은 근거)
## 5. 아직 초기지만 볼 가치가 있는 가설
## 6. 리스크와 반론
## 7. 다음 주 추적 포인트
## 8. 출처
(이번 팩에 명시된 참조·내부 원칙·사용자 입력을 요약해 기술. 없으면 "내부 팩·모델 일반 지식 한계"를 명시)
`.trim();
}

function monthlySectionContract(): string {
  return `
아래 번호와 제목을 정확히 사용하고, 각 섹션은 ## 로 시작한다.

## 1. 이번 달 핵심 결론
## 2. 반복 등장한 테마
## 3. 가장 강해진 가설
## 4. 약해진 가설
## 5. 이번 달 베스트 구조적 아이디어 Top 3
## 6. 다음 달 체크리스트
## 7. 출처

부록으로 [사실]/[해석]/[가설]/[추적포인트] 태그를 본문에 섞어 구분한다.
직접·간접·인프라 수혜는 결론 또는 테마 설명 안에 반드시 드러나게 쓴다.
`.trim();
}

export function trendCuratorSystemPrompt(mode: TrendReportMode): string {
  const contract = mode === 'weekly' ? weeklySectionContract() : monthlySectionContract();
  return [
    CURATOR_LENS,
    SKEPTIC_LENS,
    STRUCTURE_LENS,
    STYLE_RULES,
    '출력은 마크다운 한 덩어리로만. JSON이나 코드펜스로 감싸지 말 것.',
    '---',
    '섹션 계약:',
    contract,
  ].join('\n\n');
}

export function buildTrendCuratorUserContent(params: {
  pack: TrendSourcePack;
  body: TrendAnalysisGenerateRequestBody;
  /** OpenAI Responses 리서치(웹·도구) 결과 — 있으면 최신성 근거로 사용 */
  openAiResearchBrief?: string;
}): string {
  const { pack, body } = params;
  const factsBlock = pack.facts.map((f) => `- [${f.kind}] ${f.text}`).join('\n');
  const refsBlock = pack.sourceRefs.map((r) => `- ${r.label}: ${r.ref}`).join('\n');

  const researchBlock = params.openAiResearchBrief?.trim()
    ? [
        '',
        '[OpenAI 리서치 요약 — 웹/도구 기반, 아래를 최종 보고서에 사실·출처와 함께 녹일 것]',
        params.openAiResearchBrief.trim(),
      ].join('\n')
    : '';

  return [
    pack.userContextBlock,
    '',
    '[도구 라우팅 힌트]',
    pack.toolRoutingHint,
    '',
    '[신뢰도 힌트]',
    `- confidenceHint: ${pack.confidenceHint}`,
    pack.noDataReason ? `- noDataReason: ${pack.noDataReason}` : '',
    '',
    '[후보 테마]',
    pack.candidateThemes.map((t) => `- ${t}`).join('\n'),
    '',
    '[후보 수혜 구조]',
    pack.candidateBeneficiaries.map((t) => `- ${t}`).join('\n'),
    '',
    '[팩 사실·원칙]',
    factsBlock,
    '',
    '[출처 참조]',
    refsBlock,
    '',
    '[신선도 메타]',
    JSON.stringify(pack.freshnessMeta, null, 2),
    '',
    '[출력 초점]',
    body.focus,
    researchBlock,
    '',
    params.openAiResearchBrief?.trim()
      ? 'OpenAI 리서치 블록이 있으면 이를 반영해 출처 섹션에 URL·제목을 명시하고, 없는 사실은 지어내지 말 것.'
      : '위 팩을 존중하되, 외부 최신 뉴스를 실제로 조회했다고 주장하지 말 것.',
  ]
    .filter(Boolean)
    .join('\n');
}
