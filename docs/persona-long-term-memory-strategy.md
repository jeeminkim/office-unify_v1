# 웹 페르소나 채팅 — 장기 기억 저장소 전략

이 문서는 **현재 운영 전략/기준**을 다룬다. 실제 이행 절차(백필·검증·롤백)는 `docs/persona-web-memory-migration.md`를 참고한다.

## 현재 (Phase 2): `persona_memory` 재사용

- **저장 위치**: legacy 테이블 `persona_memory.last_feedback_summary`
- **키**: `discord_user_id` = `OfficeUserKey`, `persona_name` = 웹 슬러그(`ray-dalio` 등)
- **값**: JSON v1 (`source: web_persona_chat`, `entries[]` 스니펫 롤링)

### 장점

- 스키마 추가 없이 빠르게 웹 MVP 가능
- 기존 Supabase 백업·권한 모델과 동일 파이프라인
- Discord 쪽과 **다른 `persona_name` 문자열**을 쓰면 행이 분리되어 충돌 완화

### 한계

- legacy 컬럼 의미(`last_feedback_summary`)와 웹 용도가 겹쳐 혼동 가능
- 동일 `(user, persona_name)`을 legacy 봇과 웹이 공유하면 **덮어쓰기** 위험
- JSON 길이·형식은 앱 로직에 의존 — DB 제약이 약함

### 계속 유지하는 이유 (이번 단계)

- 이미 운영 중인 스키마 변경을 최소화
- 웹 전용 슬러그·키 규칙으로 실무상 분리 가능
- 대규모 마이그레이션 전에 제품 검증 우선

## Private Banker (J. Pierpont)

- **채팅 세션** (`web_persona_chat_*`): `persona_key` = `j-pierpont` (다른 웹 페르소나와 동일 패턴).
- **장기 기억** (`persona_memory`): `persona_name` = **`j-pierpont-lt`** — PB 전용 행으로, 일반 `/persona-chat` 페르소나 슬러그와 섞이지 않게 분리한다.
- **페이로드**: JSON v2, `source: private_banker_v1` — 구현은 `packages/ai-office-engine/src/privateBanker/privateBankerLongTerm.ts`.
- **이전 데이터**: 예전에 `j-pierpont` 행에만 저장된 경우, 읽기는 `j-pierpont-lt` 우선 후 없으면 `j-pierpont` 행을 사용하고, **이후 갱신은 `j-pierpont-lt`에만** 기록한다(백필·정리는 운영 선택).

### 레거시 `j-pierpont` memory 행 정리 (수동)

- **무엇이 레거시인가**: `persona_memory`에서 `persona_name = 'j-pierpont'`이면서, 내용이 **장기 기억**(웹 JSON)으로만 쓰이던 행. 채팅 메시지는 `web_persona_chat_*`에 별도로 있으므로 **이 행 삭제가 채팅 로그를 지우지는 않는다**(단, `persona_memory`만 삭제).
- **언제 정리 가능한가**: 동일 사용자에 대해 `j-pierpont-lt` 행이 이미 있고, 운영자가 레거시 행이 더 이상 필요 없다고 판단한 경우. 앱은 읽기 시 LT 우선이므로 **레거시 행이 남아 있어도 동작은 유지**된다.
- **백업**: Supabase SQL export 또는 `SELECT *` 결과 보관 후 진행.
- **SQL**: `docs/sql/cleanup_legacy_j_pierpont_persona_memory_optional.sql` (주석·SELECT만 기본, DELETE는 예시).

## 장기적 옵션: `web_persona_memory` 분리 테이블

다음이 **명확해지면** 분리를 검토한다.

- 웹 전용 장기 기억의 **버전·감사·RLS** 요구가 커질 때
- Discord/레거시와의 **키 충돌**이 실제로 문제가 될 때
- JSON 외 **임베딩·태그·소스** 컬럼이 필요할 때

### 제안 키 구조 (참고)

| 컬럼 | 설명 |
|------|------|
| `user_key` | OfficeUserKey |
| `persona_key` | PersonaWebKey 슬러그 |
| `memory_version` | 스키마 버전 |
| `payload` | JSONB (entries, source 등) |
| `updated_at` | 갱신 시각 |

PK: `(user_key, persona_key)` 또는 UUID PK + 유니크 제약.

### 지금 당장 옮기지 않는 이유

- 현재 JSON v1 + `persona_memory`로 요구사항 충족
- 마이그레이션·이중 쓰기 비용 대비 이득이 아직 작음

**점진 이행**: 선택 스키마와 체크리스트는 `docs/persona-web-memory-migration.md`, `docs/sql/append_web_persona_memory_optional.sql` 참고.

## 투자위원회 (committee)

- **턴 식별**: 테이블 `web_committee_turns` — `id` = `committee_turn_id`(UUID). 첫 라운드 시 서버가 생성하고, 이후 라운드·종료 API에 동일 ID를 넘긴다. SQL: `docs/sql/append_web_committee_turns.sql`.
- **장기 기억 키**: `persona_memory.persona_name` = **`committee-lt`** — 일반 웹 페르소나(`ray-dalio` 등)·PB(`j-pierpont-lt`)와 **섞이지 않음**.
- **페이로드**: JSON v3, `source: committee_v1`, 엔트리에 `committeeTurnId`·스니펫·`rating`·선택 `userNote`. 구현: `packages/ai-office-engine/src/committee/committeeLongTerm.ts`.
- **피드백 API**: `POST /api/committee/feedback` — `POST /api/persona-chat/feedback`과 분리(유지보수·입력 계약 명확화).
- **표시·프롬프트 우선순위**: persona/PB와 동일 철학 — `packages/ai-office-engine/src/longTermEntryPriority.ts` (피드백 등급 > 메모 유무 > 최근 `at`).
- **위원회 라운드 프롬프트**: `runCommitteeDiscussionRound` / closing 경로에서 `committee-lt` 요약을 시스템 프롬프트에 `[투자위원회 누적 피드백 기억]` 블록으로 주입.

### persona 기억 vs committee 기억

| 구분 | 키 / 소스 | 트리거 |
|------|-----------|--------|
| 일반 persona-chat | 슬러그별 행, `web_persona_chat` | assistant 메시지 피드백 |
| Private Banker | `j-pierpont-lt`, `private_banker_v1` | 동일 |
| 투자위원회 | `committee-lt`, `committee_v1` | `web_committee_turns.id`에 대한 피드백 |

향후 **페르소나별 위원회 발언** 피드백을 넣을 경우, 엔트리에 `personaSlug` 등을 추가하거나 `committee_turn_id` 하위 테이블을 두는 식으로 확장할 수 있다(현재는 턴 전체 피드백만).

## 관련 코드

- 우선순위 정렬(표시·프롬프트 공통): `packages/ai-office-engine/src/longTermEntryPriority.ts`
- 직렬화/병합: `packages/ai-office-engine/src/webPersonaLongTerm.ts`
- PB 전용 병합/표시: `packages/ai-office-engine/src/privateBanker/privateBankerLongTerm.ts`
- 위원회 LT: `packages/ai-office-engine/src/committee/committeeLongTerm.ts`, `committeeFeedback.ts`
- 읽기/쓰기: `packages/supabase-access/src/personaMemoryWebRepository.ts`
- 위원회 턴: `packages/supabase-access/src/webCommitteeTurnsRepository.ts`
