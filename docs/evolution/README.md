# Evolution & ideas (`docs/evolution/`)

이 디렉터리는 **제품·운영 고도화**와 **추가 아이디어를 구조화해 검토**하기 위한 문서 모음이다. 코드 변경 없이도 팀·본인이 같은 언어로 논의할 수 있도록 한다.

## 문서 역할

| 파일 | 용도 |
|------|------|
| [PURPOSE.md](./PURPOSE.md) | 이 고도화 세트의 목적, 성공에 가까운 상태, 비범위 |
| [IDEA_BRAINSTORM.md](./IDEA_BRAINSTORM.md) | 아이디어를 낼 때 질문·제약·검증 관점 |
| [IDEA_TEMPLATE.md](./IDEA_TEMPLATE.md) | **한 건** 아이디어를 복사해 채우는 양식 |
| [ROADMAP_BACKLOG.md](./ROADMAP_BACKLOG.md) | 후보를 모아 두는 백로그(표·상태) |
| [DECISIONS.md](./DECISIONS.md) | 채택/보류/거부와 이유를 짧게 남기는 결정 로그 |

## 권장 워크플로

1. 새 아이디어 → `IDEA_TEMPLATE.md`를 복사해 `ROADMAP_BACKLOG.md`에 붙이거나, 백로그에 한 줄만 추가하고 상세는 별도 파일로 링크.
2. 정기적으로 `IDEA_BRAINSTORM.md`의 체크리스트로 **additive / 보안 / 운영 부담**을 재확인.
3. 구현을 확정하면 `DECISIONS.md`에 한 줄 요약 + 링크(PR, 이슈).

## 저장소 다른 문서와의 관계

- **현재 동작·계약의 진실(source of truth)** 은 `docs/CURRENT_SYSTEM_BASELINE.md`, `docs/SYSTEM_ARCHITECTURE.md`, 도메인별 `docs/ops/*.md` 를 우선한다.
- 본 디렉터리는 **미래 방향·실험·논의**용이며, 구현과 충돌 시 코드/기준 문서를 갱신한 뒤 여기서 상태를 맞춘다.

## 백로그 한 줄 vs 상세 아이디어

**백로그 한 줄로 충분한 경우**

- UI 문구 개선
- 진단 문구 추가
- 작은 운영 지표 추가

**별도 아이디어 파일 또는 `IDEA_TEMPLATE.md` 블록이 필요한 경우**

- API / DB / UI가 함께 바뀌는 경우
- PB / Research Center / Today Brief 흐름이 연결되는 경우
- 개인정보·투자 성향·보유 비중 등 **개인화 입력**을 사용하는 경우
- 운영 로그나 `qualityMeta` 계약이 바뀌는 경우
