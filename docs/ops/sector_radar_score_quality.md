# Sector Radar Score Quality & Explanation

## 목적

Sector Radar 점수는 **매수 추천이 아니라 섹터 관찰 신호**입니다. 표본 수·시세 커버리지가 낮을 때 높은 raw 점수가 과신되지 않도록 **보수 보정 점수(`adjustedScore`)**와 **해석 레이어(`scoreExplanation`)**를 두었습니다.

## rawScore vs adjustedScore

| 필드 | 의미 |
|------|------|
| `score`, `rawScore` | 기존 산식 그대로의 합산 점수(모멘텀·52주 위치·거래량·추세·품질 등). 하위 호환을 위해 `score` 유지. |
| `adjustedScore` | 표본 수 패널티 + 시세 성공률 패널티를 합산해 **클램프 0~100** 한 값. UI와 관심종목 큐의 섹터 점수는 보통 이 값을 우선 표시합니다. |

과열/위험 판단은 기존 `zone`(fear/greed/extreme_greed…)을 바꾸지 않고, 사용자 라벨 **`scoreExplanation.temperature`**(관망·중립·관심·과열·위험·NO_DATA)에서 보수적으로 안내합니다.

## 구성 요소(표준 섹터)

스코어링 내부 컴포넌트와 만점(카드 «점수 설명» 토글):

- 모멘텀: 최대 **25**
- 거래량: 최대 **30**
- 52주 위치(`drawdown` 필드명 유지): 최대 **15**
- 추세: 최대 **20**
- 품질(`risk`): 최대 **10**

코인(`crypto`)은 서브그룹 가중 스냅샷으로 별도 처리되며 breakdown은 null일 수 있습니다.

## 신뢰도(`SectorRadarConfidence`)

조건은 순차적으로 적용됩니다.

- **high:** 표본 ≥ 5, 시세 커버리지 ≥ 0.8, 시세 누락 ≤ 1
- **medium:** 표본 ≥ 4, 시세 커버리지 ≥ 0.6
- **low:** 표본 ≥ 3, 시세 커버리지 ≥ 0.4
- **very_low:** 표본 &lt; 3 **또는** 시세 커버리지 &lt; 0.4

## 패널티(adjustedScore에만 합산)

**표본 수**

- ≥ 5 → 0  
- 4 → -3  
- 3 → -5  
- 2 → -10  
- ≤ 1 → 데이터 라벨상 NO_DATA 처리 경향(품질 very_low)

**시세 성공률**

- ≥ 0.8 → 0  
- 0.6 ~ &lt; 0.8 → -5  
- 0.4 ~ &lt; 0.6 → -10  
- &lt; 0.4 → 동일 -10 + 신뢰도 very_low, 사용자 라벨 온도는 NO_DATA에 가깝게 표시

## 과열·위험 해석

- raw가 높고 52주 위치 점수가 높으면 사용자 라벨을 **과열**에 가깝게 올리고, 추격매수 주의·조정 대기 문구를 붙입니다.
- raw ≥ 85, 거래량 점수·52주 위치가 동시에 높으면 **`위험`** 온도로 분류할 수 있습니다.

## 운영 로그 (`web_ops_events`)

- **domain:** `sector_radar`
- **component:** `sector-radar-score-quality`
- **fingerprint:** `sector_radar:${userKey}:${sectorKey}:${code}`

**코드 상수** (`SECTOR_RADAR_SCORE_WARNING_CODES`)

- `sector_radar_score_low_confidence`
- `sector_radar_score_very_low_confidence`
- `sector_radar_score_quote_coverage_low`
- `sector_radar_score_sample_too_small`
- `sector_radar_score_overheated`
- `sector_radar_score_no_data`

정상 섹터 전체를 info로 찍지 않으며, 위 조건에 해당할 때만 warning 위주로 적재합니다. 로깅 실패는 API 응답에 영향 주지 않습니다.

## 수동 검증

1. `/sector-radar` 진입 후 카드 상단에 **신뢰도 한 줄 + 표본/시세 반영** 표시 확인  
2. **점수 설명** 토글로 raw/adjusted, 구성 요소 만점, 해석·리스크 확인  
3. 과열/위험 카드에서 추격매수 주의 문구 확인  
4. 시세가 거의 없는 섹터에서 NO_DATA·매우 낮은 신뢰도 확인  
5. `web_ops_events`에서 `sector_radar_score_*`가 과도하게 쌓이지 않는지(동일 fingerprint는 occurrence만 증가) 확인  

자세한 anchor 시트 운영은 [sector_radar_anchor_universe.md](./sector_radar_anchor_universe.md)를 참고합니다.
