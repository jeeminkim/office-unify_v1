# Sector Radar Quote Recovery

## 목적

`sector_radar_quotes` read-back 지연/empty/parse 실패를 숨기지 않고, 화면은 유지하면서 운영 write를 억제한다.

## 점검 기준

- `sampleCount`, `quoteOkCount`, `quoteMissingCount`
- `rawScore` vs `adjustedScore`
- `scoreExplanation`(confidence/temperature/mainDrivers/riskNotes)
- `qualityMeta.sectorRadar.warnings`

## read-only vs refresh 정책

- `GET /api/sector-radar/summary`:
  - 경고는 응답(`qualityMeta`, `displayWarnings`)에 유지
  - 개별 warning DB write는 억제, 심한 저하는 **`sector_radar_summary_batch_degraded`만** 화이트리스트+`isCritical`+cooldown+budget+일 fingerprint로 제한 기록
- `POST /api/sector-radar/refresh`:
  - 시트 수식 동기화 후 재조회 시 필요한 상세 로그 기록 가능
  - cooldown/budget 정책 적용(요청당 budget 우선)

## 조선/LNG/소재 ticker 보정 포인트

- `033500`(동성화인텍): `KOSDAQ:033500`, `033500.KQ`
- `009540`, `042660`, `010140`, `466920`: `KRX:*` + `.KS` 우선
- KOSDAQ 종목은 `KOSDAQ:xxxxxx` 표기 우선 점검

## 운영 write 절감 정책

- `qualityMeta`는 최신 상태 표시용
- `web_ops_events`는 누적 추적용(최초/재발/cooldown/refresh/critical 중심)
- 요청 단위 write budget(`opsLogBudget`)으로 단기 트랜잭션 폭증 방지
