# 가벼운 게이미피케이션 (뱃지·스트릭) — 설계

작성일: 2026-06-23

## 목표
학생 동기 유발을 위한 **가벼운** 게이미피케이션. 인프라 추가 없이(백엔드 0), 기존 퀴즈
이벤트에 훅만 걸어 뱃지와 연속 학습(스트릭)을 보상한다.

## 핵심 결정
- **상태 저장 = localStorage** (학생별 네임스페이스 `mm-game-<studentId>`). Supabase 불필요,
  즉시·오프라인. 단점(기기 변경 시 초기화)은 가벼운 기능엔 허용.
- **새 파일·새 `<script>` 0**. `window.MMGame`을 `js/student.js`에 얹는다 — student.js는
  허브와 레슨 모두 이미 로드하므로 19개 레슨 + 허브에 태그를 늘리지 않는다.
- **감지는 행동 기반만**(운 아님): 정답·완주·재도전·꾸준함.

## 뱃지 (6종)
| id | 표시 | 조건 |
|---|---|---|
| firstCorrect | 🎯 첫 정답 | 첫 정답을 맞힘 |
| lessonClear | 🏆 레슨 완주 | 한 레슨의 모든 `.qopts`를 정답 처리 |
| comeback | 💪 오뚝이 | 같은 문항을 2회차 이상에 정답(틀린 뒤 성공) |
| collector | 🦊 수집가 | 레슨 5개 완주 |
| streak3 | 🔥 3일 연속 | 스트릭 3 도달 |
| streak7 | ⭐ 7일 연속 | 스트릭 7 도달 |

## 상태 모델
```json
{ "streak": 0, "best": 0, "lastDay": "YYYY-MM-DD", "badges": { "firstCorrect": 1719... }, "cleared": ["lesson-id"] }
```

## 감지 — DOM 클래스·타이밍 무관
클릭 시 tracker의 버튼 리스너가 레슨의 박스 리스너보다 **먼저** 실행되므로(타깃→버블),
레슨이 붙이는 `.right`/`.wrong` 클래스에 의존하지 않는다. 대신 tracker가 직접 관리하는
값으로 판정:
- **정답 여부** = `btn.dataset.correct`
- **오뚝이** = `tries(box.dataset.mmTries) >= 2` 이며 정답
- **완주** = 모든 `.qopts`의 `box.dataset.mmLocked === '1'`

tracker는 매 답마다 `MMGame.onAnswer({correct, tries, allSolved, lessonId})` 호출(기록보다
앞, Supabase 없이도 동작). `MMGame`이 스트릭 갱신·뱃지 수여·토스트를 처리.

## 노출
- **레슨**: 뱃지 획득/스트릭 갱신 시 동적 **토스트**(레슨 HTML 수정 0). 동시 다발 시 250ms 간격 큐.
- **허브**(index): 메뉴 상단 `🔥 N일 연속 + 뱃지(획득=컬러, 미획득=회색)` 띠. `MMGame.renderHub(#game)`.

## 검증 (npm test, E2E)
한 브라우저 컨텍스트에서: 오답→정답(첫정답·오뚝이) → Lv1~Lv3 완주(레슨완주·스트릭·cleared) →
허브 이동 시 내 기록 띠·획득 뱃지 표시. 총 7개 검사 추가(→ 179).
