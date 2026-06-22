/* MathMotion · 풀이 기록 트래커 (학생용)
 * 레슨 HTML에 supabase-js + supabase-config.js 다음에 한 줄로 포함.
 * 동작: 첫 퀴즈 응답 시 학급 코드+이름으로 입장(localStorage 저장),
 *       이후 보기 클릭마다 record_attempt RPC로 기록(매 시도, 정답 시 잠금).
 * 기록은 best-effort — 미입장/오프라인/오류여도 퀴즈는 정상 동작. */
(function () {
  if (!window.supabase || !window.MM_SUPABASE_URL) return; // 라이브러리/설정 없으면 조용히 비활성
  var sb = window.supabase.createClient(window.MM_SUPABASE_URL, window.MM_SUPABASE_ANON);
  var LS = 'mm-student';
  var lessonId = (document.body && document.body.dataset.lesson) ||
                 (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'unknown';

  function getStudent() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function setStudent(o) { localStorage.setItem(LS, JSON.stringify(o)); }

  /* ---------- 스타일 ---------- */
  var css = '' +
    '.mm-overlay{position:fixed;inset:0;background:rgba(43,37,32,.55);display:flex;align-items:center;justify-content:center;z-index:9999;padding:18px}' +
    '.mm-card{background:#FBF3E2;border:4px solid #2B2520;border-radius:18px;box-shadow:6px 6px 0 #2B2520;max-width:360px;width:100%;padding:22px;font-family:"Gowun Dodum",sans-serif;color:#2B2520}' +
    '.mm-card h3{font-family:"Jua",sans-serif;font-size:22px;margin:0 0 4px}' +
    '.mm-card p{font-size:14px;color:#5A5046;margin:0 0 14px}' +
    '.mm-card label{font-family:"Jua",sans-serif;font-size:14px;display:block;margin:10px 0 4px}' +
    '.mm-card input{width:100%;font-family:"Gowun Dodum",sans-serif;font-size:18px;border:3px solid #2B2520;border-radius:12px;padding:10px 12px;background:#fff}' +
    '.mm-card input.code{text-transform:uppercase;letter-spacing:2px}' +
    '.mm-row{display:flex;gap:10px;margin-top:16px}' +
    '.mm-btn{flex:1;font-family:"Jua",sans-serif;font-size:18px;border:3px solid #2B2520;border-radius:14px;padding:11px;cursor:pointer;box-shadow:4px 4px 0 #2B2520;background:#FFC847}' +
    '.mm-btn.ghost{background:#fff}.mm-btn:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #2B2520}' +
    '.mm-err{color:#E8584E;font-family:"Jua",sans-serif;font-size:14px;min-height:18px;margin-top:8px;text-align:center}' +
    '.mm-pill{position:fixed;left:14px;bottom:14px;z-index:9998;font-family:"Jua",sans-serif;font-size:14px;background:#fff;border:3px solid #2B2520;border-radius:999px;padding:7px 14px;box-shadow:3px 3px 0 #2B2520;cursor:pointer}' +
    '.mm-pill b{color:#4E9E48}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ---------- 상태 표시 알약 ---------- */
  var pill = document.createElement('div'); pill.className = 'mm-pill';
  function renderPill() {
    var s = getStudent();
    pill.innerHTML = s ? ('📊 기록 중: <b>' + esc(s.name) + '</b>') : '📊 학급 입장하기';
  }
  pill.addEventListener('click', function () { openJoin(); });
  function mountPill() { if (!pill.parentNode) document.body.appendChild(pill); renderPill(); }

  function esc(t) { return (t || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }

  /* ---------- 입장 모달 ---------- */
  var pending = null; // 입장 전 마지막 응답(입장 후 기록)
  function openJoin() {
    var s = getStudent();
    var ov = document.createElement('div'); ov.className = 'mm-overlay';
    ov.innerHTML =
      '<div class="mm-card">' +
        '<h3>학급 입장 📊</h3>' +
        '<p>선생님이 알려준 <b>학급 코드</b>와 <b>이름</b>을 넣으면 풀이가 기록돼요.</p>' +
        '<label>학급 코드</label><input class="code" id="mmCode" maxlength="6" placeholder="예: MATH7K" value="' + (s ? esc(s.code) : '') + '">' +
        '<label>이름</label><input id="mmName" maxlength="20" placeholder="이름" value="' + (s ? esc(s.name) : '') + '">' +
        '<div class="mm-err" id="mmErr"></div>' +
        '<div class="mm-row">' +
          '<button class="mm-btn ghost" id="mmSkip">나중에</button>' +
          '<button class="mm-btn" id="mmJoin">입장</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);
    var code = ov.querySelector('#mmCode'), name = ov.querySelector('#mmName'), err = ov.querySelector('#mmErr');
    setTimeout(function () { (s ? name : code).focus(); }, 30);
    ov.querySelector('#mmSkip').onclick = function () { pending = null; ov.remove(); };
    ov.querySelector('#mmJoin').onclick = function () { join(); };
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
    function join() {
      var c = (code.value || '').trim(), n = (name.value || '').trim();
      if (!c || !n) { err.textContent = '코드와 이름을 모두 입력해요.'; return; }
      err.textContent = '입장 중…';
      sb.rpc('join_class', { p_code: c, p_name: n }).then(function (res) {
        if (res.error || !res.data) { err.textContent = '코드를 확인해 주세요.'; return; }
        setStudent({ id: res.data, name: n, code: c.toUpperCase() });
        renderPill();
        ov.remove();
        if (pending) { var p = pending; pending = null; send(res.data, p); }
      });
    }
  }

  /* ---------- 기록 전송 ---------- */
  function send(studentId, rec) {
    try {
      sb.rpc('record_attempt', {
        p_student_id: studentId, p_lesson_id: rec.lesson_id, p_question_id: rec.question_id,
        p_chosen_index: rec.chosen_index, p_chosen_label: rec.chosen_label,
        p_is_correct: rec.is_correct, p_misconception: rec.misconception, p_attempt_no: rec.attempt_no
      }).then(function () {}, function () {});
    } catch (e) { /* best-effort */ }
  }

  /* ---------- 퀴즈 후킹 ---------- */
  var boxes = Array.prototype.slice.call(document.querySelectorAll('.qopts'));
  boxes.forEach(function (box, i) {
    box.dataset.mmQ = 'q' + (i + 1);
    box.dataset.mmTries = '0';
    var opts = Array.prototype.slice.call(box.querySelectorAll('.qopt'));
    opts.forEach(function (btn) {
      btn.addEventListener('click', function () { onAnswer(box, btn, opts); });
    });
  });

  function onAnswer(box, btn, opts) {
    if (box.dataset.mmLocked) return;
    if (btn.dataset.mmUsed) return;
    btn.dataset.mmUsed = '1';
    var correct = btn.dataset.correct === 'true';
    var tries = (+box.dataset.mmTries) + 1; box.dataset.mmTries = String(tries);
    var label = (btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    var rec = {
      lesson_id: lessonId, question_id: box.dataset.mmQ,
      chosen_index: opts.indexOf(btn),
      chosen_label: label,
      is_correct: correct,
      misconception: correct ? null : (box.dataset.wrong || '').replace(/\s+/g, ' ').slice(0, 200),
      attempt_no: tries
    };
    // 고른 보기 비활성화(도배 방지), 정답이면 전체 잠금
    btn.style.opacity = '0.55';
    btn.style.pointerEvents = 'none';
    if (correct) {
      box.dataset.mmLocked = '1';
      opts.forEach(function (b) { b.style.pointerEvents = 'none'; });
    }
    var stu = getStudent();
    if (stu) { send(stu.id, rec); }
    else { pending = rec; openJoin(); }
  }

  /* ---------- 시작 ---------- */
  if (boxes.length) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountPill);
    else mountPill();
  }
})();
