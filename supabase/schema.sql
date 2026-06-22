-- ============================================================
-- MathMotion 퀴즈 풀이 기록 스키마
-- Supabase 대시보드 → SQL Editor에 전체 붙여넣고 RUN
-- (재실행해도 안전하도록 idempotent하게 작성)
-- ============================================================

-- ---------- 1. 테이블 ----------
create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  join_code  text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table if not exists public.attempts (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  lesson_id     text not null,
  question_id   text not null,
  chosen_index  int,
  chosen_label  text,
  is_correct    boolean not null,
  misconception text,
  attempt_no    int not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_students_class   on public.students(class_id);
create index if not exists idx_attempts_student on public.attempts(student_id);
create index if not exists idx_attempts_lesson  on public.attempts(lesson_id);

-- ---------- 2. RLS 켜기 ----------
alter table public.classes  enable row level security;
alter table public.students enable row level security;
alter table public.attempts enable row level security;

-- ---------- 3. 교사(authenticated) 정책: 자기 학급만 ----------
-- classes: 소유자 전체 권한
drop policy if exists classes_owner_all on public.classes;
create policy classes_owner_all on public.classes
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- students: 자기 학급의 학생만
drop policy if exists students_owner_all on public.students;
create policy students_owner_all on public.students
  for all to authenticated
  using (class_id in (select id from public.classes where owner_id = auth.uid()))
  with check (class_id in (select id from public.classes where owner_id = auth.uid()));

-- attempts: 자기 학급 학생의 기록만 (교사는 읽기 위주)
drop policy if exists attempts_owner_select on public.attempts;
create policy attempts_owner_select on public.attempts
  for select to authenticated
  using (student_id in (
    select s.id from public.students s
    join public.classes c on c.id = s.class_id
    where c.owner_id = auth.uid()
  ));

-- (학생 anon 쓰기는 직접 INSERT 정책 없이 아래 SECURITY DEFINER 함수로만 허용)

-- ---------- 4. 교사용 RPC: 학급 생성(고유 코드 자동) ----------
create or replace function public.create_class(p_name text)
returns public.classes
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text;
  v_row  public.classes;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
  loop
    v_code := upper(substr(md5(random()::text), 1, 6));  -- 예: 'A3F9C1'
    begin
      insert into public.classes(owner_id, name, join_code)
      values (auth.uid(), p_name, v_code)
      returning * into v_row;
      return v_row;
    exception when unique_violation then
      -- 코드 충돌 시 재시도
    end;
  end loop;
end;
$$;

-- ---------- 5. 학생용 RPC: 학급 입장(코드+이름 → student_id) ----------
create or replace function public.join_class(p_code text, p_name text)
returns uuid
language plpgsql
security definer            -- RLS 우회(통제된 쓰기)
set search_path = public
as $$
declare
  v_class_id uuid;
  v_student_id uuid;
  v_name text := nullif(btrim(p_name), '');
begin
  if v_name is null then
    raise exception 'name required';
  end if;
  select id into v_class_id
  from public.classes
  where join_code = upper(btrim(p_code));
  if v_class_id is null then
    raise exception 'invalid class code';
  end if;

  insert into public.students(class_id, name)
  values (v_class_id, v_name)
  on conflict (class_id, name) do update set name = excluded.name
  returning id into v_student_id;

  return v_student_id;
end;
$$;

-- ---------- 6. 학생용 RPC: 풀이 기록 ----------
create or replace function public.record_attempt(
  p_student_id   uuid,
  p_lesson_id    text,
  p_question_id  text,
  p_chosen_index int,
  p_chosen_label text,
  p_is_correct   boolean,
  p_misconception text,
  p_attempt_no   int
)
returns void
language plpgsql
security definer            -- RLS 우회(통제된 쓰기)
set search_path = public
as $$
begin
  if not exists (select 1 from public.students where id = p_student_id) then
    raise exception 'invalid student';
  end if;

  insert into public.attempts(
    student_id, lesson_id, question_id, chosen_index,
    chosen_label, is_correct, misconception, attempt_no)
  values (
    p_student_id, p_lesson_id, p_question_id, p_chosen_index,
    p_chosen_label, p_is_correct, p_misconception, p_attempt_no);
end;
$$;

-- ---------- 7. 실행 권한 ----------
-- 학생(anon)은 RPC 두 개만 호출 가능, 표 직접 접근은 불가
revoke all on function public.join_class(text, text)             from public, anon, authenticated;
revoke all on function public.record_attempt(uuid, text, text, int, text, boolean, text, int) from public, anon, authenticated;
grant execute on function public.join_class(text, text)          to anon, authenticated;
grant execute on function public.record_attempt(uuid, text, text, int, text, boolean, text, int) to anon, authenticated;
-- 학급 생성은 로그인 교사만
revoke all on function public.create_class(text) from public, anon;
grant execute on function public.create_class(text) to authenticated;
