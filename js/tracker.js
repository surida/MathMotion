/* MathMotion · 풀이 기록 트래커 (레슨용)
 * 의존: supabase-js, supabase-config.js, student.js (먼저 로드).
 * 동작: 레슨 로드 시 미입장이면 입장 모달(닫기 불가) 강제 → 입장해야 사용.
 *       입장돼 있으면 조용히 기록(매 시도, 정답 시 잠금). best-effort. */
(function () {
  // 보기 순서 셔플 — 정답이 항상 같은 자리(1번)에 오는 것 방지. 추적 여부와 무관하게 항상.
  document.querySelectorAll('.qopts').forEach(function (box) {
    var opts = Array.prototype.slice.call(box.querySelectorAll('.qopt'));
    for (var i = opts.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = opts[i]; opts[i] = opts[j]; opts[j] = t; }
    opts.forEach(function (o) { box.appendChild(o); }); // appendChild는 기존 노드를 이동(이벤트 리스너 유지)
  });

  if (!window.MMStudent) return; // 공유 모듈 없으면 기록만 비활성(셔플·퀴즈는 정상 동작)
  var lessonId = (document.body && document.body.dataset.lesson) ||
                 (location.pathname.split('/').pop() || '').replace(/\.html$/, '') || 'unknown';

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
    // 고른 보기 비활성화(도배 방지), 정답이면 전체 잠금
    btn.style.opacity = '0.55';
    btn.style.pointerEvents = 'none';
    if (correct) {
      box.dataset.mmLocked = '1';
      opts.forEach(function (b) { b.style.pointerEvents = 'none'; });
    }
    var stu = MMStudent.get(); if (!stu) return;       // 게이트가 보장하지만 안전망
    var cl = MMStudent.sb(); if (!cl) return;
    try {
      cl.rpc('record_attempt', {
        p_student_id: stu.id, p_lesson_id: lessonId, p_question_id: box.dataset.mmQ,
        p_chosen_index: opts.indexOf(btn),
        p_chosen_label: (btn.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 120),
        p_is_correct: correct,
        p_misconception: correct ? null : (box.dataset.wrong || '').replace(/\s+/g, ' ').slice(0, 200),
        p_attempt_no: tries
      }).then(function () {}, function () {});
    } catch (e) { /* best-effort */ }
  }

  function start() {
    if (boxes.length) MMStudent.require({ onDone: function () {} }); // 미입장이면 입장 강제
    else MMStudent.pill();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
