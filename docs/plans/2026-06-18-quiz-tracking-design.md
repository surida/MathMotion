# 퀴즈 풀이 기록·확인 시스템 설계

작성일: 2026-06-18

## 목적

각 레슨(챕터)의 기본개념 확인 문제에 대해 **학생이 맞게 풀었는지**, 틀렸다면
**어떻게·몇 번 틀렸고 몇 번째에 맞혔는지**를 기록하고, 교사가 admin 화면에서 확인한다.

## 요구사항 / 제약

- 사용 규모: 지금은 "나 + 아이 여러 명", 추후 **여러 교사가 학급을 맡는** 확장 고려.
- 학생 식별: **학급 코드 + 이름**(비밀번호 없음, 키즈 친화). 교사만 실계정.
- 문제 소스: **기존 마무리 퀴즈 재사용**(새 문제 제작 0). 모든 레슨에 이미 객관식
  2~3개 + 오답 피드백(`data-wrong`)이 있음.
- 현재 사이트는 GitHub Pages 정적 호스팅 → 별도 서버 운영 없이 확장.

## 1. 전체 구조와 기술 선택

**채택: Supabase** (Postgres + Auth + Row Level Security + 자동 REST API).
- "교사는 자기 학급만" = RLS로 해결, SQL이라 집계/오답 분석 용이, 이미 로드맵.
- 대안 기각: Google Sheets+Apps Script(다교사·권한 약함), Firebase(NoSQL이라 집계·권한 번거로움).

```
[GitHub Pages 정적 사이트]                 [Supabase (호스팅)]
 레슨 HTML (학생)  ──INSERT(익명, RLS 제한)──▶  Postgres: attempts
 admin.html (교사) ──로그인(Auth)+SELECT(RLS)─▶  classes / students / attempts
```

**쓰기 방식: A안(직접 DB API + RLS)로 시작, 필요 시 B안(Edge Function)으로 확장.**
- A안 = Supabase 자동 생성 REST API를 클라 JS가 anon 키로 호출. 서버 코드 0,
  검증·보안은 DB의 RLS가 담당.
- B안 = 커스텀 엔드포인트(서버리스 Edge Function). 부정행위 차단·외부연동 등
  정교한 로직이 필요해지면 그 부분만 분리.
- 우리 기록 내용("정답 여부 + 고른 보기")은 단순·비민감 → A안으로 충분.
- 보안: anon 공개키가 클라에 노출돼도(정적 사이트 정상 관행) RLS가 데이터 보호.

## 2. 데이터 모델

교사 = Supabase Auth 사용자(`auth.users`). 표 4개.

```
classes
 ├ id (uuid)
 ├ owner_id (uuid) → auth.users     "내 학급" 기준
 ├ name
 └ join_code (text, 고유)            예: "MATH7K"

students
 ├ id (uuid)
 ├ class_id → classes
 └ name                             (class_id + name 유일)

attempts                            ← 핵심
 ├ id (uuid)
 ├ student_id → students
 ├ lesson_id (text)                 'quadratic-eq'
 ├ question_id (text)               'q1'
 ├ chosen_index (int)
 ├ chosen_label (text)              "x=2 또는 −3"  (어떻게 틀렸는지)
 ├ is_correct (bool)
 ├ misconception (text)             "부호 반대로 읽음"  (data-wrong 태그)
 ├ attempt_no (int)                 1, 2, 3 …
 └ created_at (timestamptz)
```

**학생 입장**: 표에 직접 anon INSERT하지 않고 DB 함수 `join_class(code, name)`(RPC,
SECURITY DEFINER)를 호출 → 코드 검증 → 학생 행 생성/조회 → `student_id` 반환 →
브라우저 localStorage에 저장. (서버 코드 아님, SQL 함수를 Supabase가 자동 API로 노출.)

**기록 규칙**: 한 문제당 **매 시도 기록**(첫 시도만 X). `attempt_no` 증가, **정답 시 잠금**.
보기는 **한 번 누르면 비활성화** → 같은 오답 도배 차단(문제당 기록 ≤ 보기 수).

**파생 지표는 저장하지 않고 조회 시 SQL로 계산** (중복·불일치 방지):
- 정답까지 시도 횟수 = 그 문제 행 수
- 틀린 횟수 = is_correct=false 행 수
- 오답 경로 = 고른 오답들의 misconception 순서
- 한 번에 맞힘 / 끝내 못 맞힘 여부

**RLS 요약**: `classes`/`students`/`attempts` 읽기는 `owner_id = auth.uid()` 교사만.
쓰기는 `join_class` RPC(학생) + attempts INSERT(유효 student_id)만 허용.

## 3. 교사 admin 화면 (`admin.html`)

정적 페이지 + Supabase JS. 교사만 로그인.

1. **로그인** — Supabase Auth(이메일 매직링크 권장).
2. **학급 대시보드** — 학급 생성(이름 → 코드 자동 발급) + 풀이 현황 매트릭스
   (학생 × 문제, 셀 = `✓(n)` n번 만에 / `✗` 못 맞힘 / `—` 미응시, 색상 구분).
3. **학생 드릴다운** — 셀 클릭 → 그 문제의 시도 순서 + 오개념 나열.
4. **오개념 집계** — 문제별 반 전체 오답 분포 → 다시 가르칠 지점 식별.

핵심 가치 = 점수가 아니라 **오개념 분포**. `data-wrong` 태그가 자동 분류를 제공.

## 4. 레슨 쪽 연동

레슨 HTML 최소 변경: 공유 스크립트 `js/tracker.js` + `<body data-lesson="...">` 한 속성.

1. **학생 입장 모달** — 첫 퀴즈에서 localStorage에 `student_id` 없을 때만
   "학급 코드 + 이름" 입력 → `join_class()` → 저장(이후 같은 기기에선 생략).
2. **퀴즈 후킹** — 기존 `.qopts` 핸들러에 기록 추가:
   - 옵션 클릭 → `attempt_no++` → `attempts` INSERT(fire-and-forget) → 그 보기 비활성화
   - 정답이면 전체 잠금
   - `lesson_id`=`data-lesson`, `question_id`=퀴즈 순서, `misconception`=`data-wrong`
3. **안전장치** — 기록은 best-effort. 미입장·오프라인·오류여도 퀴즈는 정상 동작.
4. **설정** — `js/supabase-config.js`에 Supabase URL + anon 공개키.

## 비범위 (YAGNI)

- 학생 개별 로그인/비밀번호 (학급 코드+이름으로 충분).
- 점수·등급·랭킹 (진단이 목적, 경쟁 아님).
- 부정행위 방지·rate limit (필요해지면 Edge Function으로 추가).
- 파생 지표의 별도 저장 (조회 시 계산).

## 구현 순서(개요)

1. Supabase 프로젝트 + 스키마(표 4개) + RLS + `join_class` RPC.
2. `js/supabase-config.js`, `js/tracker.js`(입장 모달 + 퀴즈 후킹).
3. 레슨에 `data-lesson` 속성 + 스크립트 한 줄 추가(14개).
4. `admin.html`(로그인 → 매트릭스 → 드릴다운 → 오개념 집계).
5. 검증: 학생 흐름(입장·기록) + 교사 흐름(조회·권한 격리) E2E 확인.
