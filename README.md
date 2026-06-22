# MathMotion 🐊

> 외우지 말고 **원리로!** 움직임(Motion)으로 배우는 중학 수학

웹툰 같은 이야기 + 직접 만지는 인터랙티브(**Motion**)로 중학교 수학 개념을
이해하게 돕는 학습 사이트입니다. 마스코트는 악어 **부등이**.

🔗 **https://surida.github.io/MathMotion/**

## 특징

- **개념을 움직여서 이해** — 포물선의 `a`를 다이얼로 돌리고, 가로선을 스캔하고,
  완전제곱 단계를 펼치는 등 손으로 만지며 원리를 체득합니다.
- **웹툰형 전개** — 각 레슨은 1·2막 만화 → 3막 실험실 → 마무리 퀴즈로 구성.
- **생활 속 연결** — "왜 배우나"(농구 슛·분수·암호·요금제 등)로 동기를 줍니다.
- **풀이 기록(선택)** — 학생이 학급 코드로 입장하면 푼 문제·오답·시도 횟수가
  기록되고, 교사는 대시보드에서 학급 현황과 오개념 분포를 봅니다.

## 다루는 단원

중2~중3 (교학사·천재교육·동아출판사 교과서 기준):
순환소수 · 지수법칙 · 일차부등식 · 연립방정식 · 일차함수/방정식 · 제곱근 ·
인수분해 · 이차방정식 · **이차함수와 그래프(6종)** 등 — 계속 추가 중.

## 개발

빌드 도구·프레임워크가 없는 **순수 정적 사이트**입니다.

```bash
# 로컬 실행 (admin 매직링크 로그인 때문에 http로 띄우는 것을 권장)
python3 -m http.server 8000
# → http://localhost:8000/
```

- 새 레슨은 `lessons/` 안에 자기완결형 HTML 한 파일로 만들고,
  `index.html`의 `LESSONS`/`CURRICULUM`에 등록합니다.
- 기여·구조 상세는 [CLAUDE.md](CLAUDE.md) 참고.

## 배포

`main`에 push하면 **GitHub Pages**가 자동 배포합니다.

```bash
git push origin main
```

## 풀이 기록 시스템 (Supabase)

별도 서버 없이 [Supabase](https://supabase.com)(Postgres + Auth + RLS)로 동작합니다.

- `supabase/schema.sql` — 표(classes/students/attempts) + RLS + RPC. SQL Editor에 1회 실행.
- `js/supabase-config.js` — Project URL + anon public key(노출돼도 안전, 보안은 RLS가 담당).
- `js/student.js` · `js/tracker.js` — 학생 입장 게이트 + 풀이 기록.
- `admin.html` — 교사 대시보드(매직링크 로그인, 학급별 현황·오개념 집계).

설계 문서: [docs/plans/2026-06-18-quiz-tracking-design.md](docs/plans/2026-06-18-quiz-tracking-design.md)

## 디렉터리

```
index.html      학생 허브 (학년·교과서 선택 → 레슨 메뉴)
admin.html      교사 대시보드
lessons/        레슨 (자기완결형 HTML)
js/             supabase-config · student · tracker
supabase/       schema.sql
docs/plans/     설계 문서
```

> 교과서 PDF 등 저작권 자료(`교과서/`, `*.pdf`)는 공개 저장소에 포함하지 않습니다.
