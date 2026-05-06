# `web_persona_memory` 분리 — 점진 이행

이 문서는 **이행 절차/백필/검증/롤백** 중심 문서다. 현재 운영 기준/정책은 `docs/persona-long-term-memory-strategy.md`를 기준으로 본다.

## 현재 (유지)

- **저장소**: `persona_memory.last_feedback_summary` (`personaMemoryWebRepository.ts`)
- **키**: `discord_user_id` = `OfficeUserKey`, `persona_name` = 웹 슬러그
- **값**: JSON v1 (`webPersonaLongTerm.ts`)

이번 단계에서는 **읽기/쓰기 경로를 바꾸지 않았다.** 운영 데이터 이전·이중 쓰기 없이 멱등·길이 제한·복구 추적을 먼저 안정화한다.

## 왜 지금 테이블을 쓰지 않았는가

- 스키마 추가만으로는 이득이 작고, **데이터 마이그레이션·검증** 비용이 큼
- `persona_memory` + 웹 전용 슬러그로 실무상 레거시 Discord 행과 분리 가능
- `append_web_persona_memory_optional.sql`로 **스키마는 준비**해 두고, 리포지토리 전환은 별 PR에서 처리하는 편이 안전함

## 다음 단계(권장 순서)

1. Supabase에 `web_persona_memory` 생성(SQL 적용)
2. `persona_memory` → `web_persona_memory` **일회성 백필**(스크립트·SQL)
3. `selectPersonaLongTermSummary` / `upsertPersonaLongTermSummary`를 **신규 테이블 우선**으로 바꾸거나, 어댑터에서 플래그 분기
4. 검증 후 `persona_memory` 웹 행 정리(선택)

## 롤백 기준 (요약)

- 신규 테이블 읽기 실패 또는 데이터 불일치가 확인되면 기존 `persona_memory` 읽기 경로로 즉시 복귀한다.
- 이행 단계에서는 가급적 읽기 우선 전환 후 쓰기 전환을 분리해 리스크를 줄인다.

## 관련 파일

- SQL: `docs/sql/append_web_persona_memory_optional.sql`
- 장기 JSON 로직: `packages/ai-office-engine/src/webPersonaLongTerm.ts`
- 기존 리포: `packages/supabase-access/src/personaMemoryWebRepository.ts`
