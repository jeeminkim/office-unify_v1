export type PersonaCoachRole =
  | 'operator'
  | 'data_manager'
  | 'risk_manager'
  | 'private_banker'
  | 'committee_chair'
  | 'research_analyst'
  | 'journal_coach'
  | 'action_secretary';

export type PersonaCoachGuidance = {
  role: PersonaCoachRole;
  title: string;
  oneLinePurpose: string;
  whatYouCanDoNow: string[];
  whatWillBeSaved: string[];
  whatNotToDo: string[];
  primaryNextActionLabel?: string;
  primaryNextActionHref?: string;
  dismissKey: string;
};

const GUIDANCE: Record<PersonaCoachRole, PersonaCoachGuidance> = {
  operator: {
    role: 'operator',
    title: '운영자',
    oneLinePurpose: '오늘 먼저 확인할 데이터 문제와 작업을 정리합니다.',
    whatYouCanDoNow: ['데이터 blocker 확인', 'Action Inbox 이동', 'Daily Review 확인'],
    whatWillBeSaved: ['이 안내만으로 저장되는 내용은 없습니다.'],
    whatNotToDo: ['후보 점수를 매수 지시로 해석하지 않습니다.'],
    primaryNextActionLabel: 'Action Inbox',
    primaryNextActionHref: '/action-items',
    dismissKey: 'coach:operator',
  },
  data_manager: {
    role: 'data_manager',
    title: '데이터 관리자',
    oneLinePurpose: '미국 anchor 시세가 Google Sheets에서 계산되는지 확인합니다.',
    whatYouCanDoNow: ['상태 다시 확인', '시세 새로고침', 'confirm 후 portfolio_quotes 안전 보강'],
    whatWillBeSaved: ['안전 보강을 확인하면 portfolio_quotes의 빈 셀만 보강됩니다.'],
    whatNotToDo: ['Supabase 원장을 자동 변경하지 않습니다.'],
    primaryNextActionLabel: '상태 다시 확인',
    primaryNextActionHref: '/ops/google-finance-setup',
    dismissKey: 'coach:data_manager',
  },
  risk_manager: {
    role: 'risk_manager',
    title: '리스크 관리자',
    oneLinePurpose: '이 카드는 매수 후보가 아니라 확인이 필요한 리스크입니다.',
    whatYouCanDoNow: ['공시 확인', '점검 완료 표시', '7일 낮은 우선순위 처리'],
    whatWillBeSaved: ['피드백 버튼을 누르면 후보 노출 우선순위에 반영됩니다.'],
    whatNotToDo: ['확인 전 추격 판단으로 넘기지 않습니다.'],
    dismissKey: 'coach:risk_manager',
  },
  private_banker: {
    role: 'private_banker',
    title: 'PB',
    oneLinePurpose: '포트폴리오와 메모를 바탕으로 확인 질문과 다음 점검을 정리합니다.',
    whatYouCanDoNow: ['요약 확인', 'Action Item 저장', '근거 보강'],
    whatWillBeSaved: ['명시 버튼을 누른 작업만 저장됩니다.'],
    whatNotToDo: ['자동으로 포트폴리오를 변경하지 않습니다.'],
    dismissKey: 'coach:private_banker',
  },
  committee_chair: {
    role: 'committee_chair',
    title: '위원장',
    oneLinePurpose: '위원회 의견을 작업 단위로 정리하고 누락된 발언을 복구합니다.',
    whatYouCanDoNow: ['Action Inbox 저장', 'Research 이동', '토론 복기'],
    whatWillBeSaved: ['Action Item 저장 버튼을 누른 항목만 저장됩니다.'],
    whatNotToDo: ['화면상 완료 표시를 실제 추적 완료로 오해하지 않습니다.'],
    dismissKey: 'coach:committee_chair',
  },
  research_analyst: {
    role: 'research_analyst',
    title: '리서치 애널리스트',
    oneLinePurpose: '질문을 리서치 보고서와 후속 확인 작업으로 바꿉니다.',
    whatYouCanDoNow: ['보고서 생성', 'PB로 보내기', '후속 질문 저장'],
    whatWillBeSaved: ['보고서/후속 질문 저장은 명시 버튼에서만 발생합니다.'],
    whatNotToDo: ['긴 응답 fallback을 원문 저장으로 착각하지 않습니다.'],
    dismissKey: 'coach:research_analyst',
  },
  journal_coach: {
    role: 'journal_coach',
    title: '복기 코치',
    oneLinePurpose: '수익률 평가가 아니라 판단 과정의 반복 패턴을 확인합니다.',
    whatYouCanDoNow: ['패턴 확인', '다음 규칙 저장', '메모 보강'],
    whatWillBeSaved: ['저장 버튼을 누른 메모나 Action Item만 저장됩니다.'],
    whatNotToDo: ['복기를 즉시 거래 지시로 바꾸지 않습니다.'],
    dismissKey: 'coach:journal_coach',
  },
  action_secretary: {
    role: 'action_secretary',
    title: '액션 비서',
    oneLinePurpose: '여러 화면에서 생긴 확인 작업을 한 곳에서 추적합니다.',
    whatYouCanDoNow: ['원본 보기', '단계 실행', '완료/보류 처리'],
    whatWillBeSaved: ['완료/보류/step 완료 버튼을 누른 내용이 저장됩니다.'],
    whatNotToDo: ['작업 완료를 투자 실행으로 해석하지 않습니다.'],
    primaryNextActionLabel: 'Action Items',
    primaryNextActionHref: '/action-items',
    dismissKey: 'coach:action_secretary',
  },
};

export function getPersonaCoachGuidance(role: PersonaCoachRole): PersonaCoachGuidance {
  return GUIDANCE[role];
}

export function assertNoForbiddenPersonaCoachCopy(): boolean {
  const blob = JSON.stringify(GUIDANCE);
  return !/자동\s*주문|자동매매|자동\s*리밸런싱/.test(blob);
}
