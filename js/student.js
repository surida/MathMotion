/* MathMotion · 학생 입장 공유 모듈 (window.MMStudent)
 * index 게이트와 레슨 tracker가 함께 사용 — "입장이란 무엇인가"를 한 곳에 정의.
 * 의존: supabase-js, supabase-config.js (먼저 로드). 없으면 join만 비활성, UI는 동작. */
(function () {
  var LS = 'mm-student';
  var client = null;
  function sb() {
    if (!client && window.supabase && window.MM_SUPABASE_URL) {
      client = window.supabase.createClient(window.MM_SUPABASE_URL, window.MM_SUPABASE_ANON);
    }
    return client;
  }
  function get() { try { return JSON.parse(localStorage.getItem(LS) || 'null'); } catch (e) { return null; } }
  function set(o) { localStorage.setItem(LS, JSON.stringify(o)); }
  function clear() { localStorage.removeItem(LS); }

  // 같은 탭 세션 동안 "이미 확인함" 표시 — 앱 내 이동 시 재확인 방지(탭 닫으면 사라짐)
  function sessionMark() { try { var s = get(); if (s) sessionStorage.setItem('mm-session', s.id); } catch (e) {} }
  function sessionOK() { try { var s = get(); return !!s && sessionStorage.getItem('mm-session') === s.id; } catch (e) { return false; } }
  function esc(t) { return (t || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }

  /* ---------- 스타일 ---------- */
  var injected = false;
  function injectCSS() {
    if (injected) return; injected = true;
    var css = '' +
      '.mm-overlay{position:fixed;inset:0;background:rgba(43,37,32,.6);display:flex;align-items:center;justify-content:center;z-index:99999;padding:18px}' +
      '.mm-card{background:#FBF3E2;border:4px solid #2B2520;border-radius:18px;box-shadow:6px 6px 0 #2B2520;max-width:360px;width:100%;padding:22px;font-family:"Gowun Dodum",sans-serif;color:#2B2520}' +
      '.mm-card h3{font-family:"Jua",sans-serif;font-size:23px;margin:0 0 4px}' +
      '.mm-card p{font-size:15px;color:#5A5046;margin:0 0 14px}' +
      '.mm-card label{font-family:"Jua",sans-serif;font-size:14px;display:block;margin:10px 0 4px}' +
      '.mm-in{width:100%;font-family:"Gowun Dodum",sans-serif;font-size:18px;border:3px solid #2B2520;border-radius:12px;padding:10px 12px;background:#fff}' +
      '.mm-in.code{text-transform:uppercase;letter-spacing:2px}' +
      '.mm-row{display:flex;gap:10px;margin-top:16px}' +
      '.mm-btn{flex:1;font-family:"Jua",sans-serif;font-size:18px;border:3px solid #2B2520;border-radius:14px;padding:11px;cursor:pointer;box-shadow:4px 4px 0 #2B2520;background:#FFC847}' +
      '.mm-btn.ghost{background:#fff}.mm-btn:active{transform:translate(2px,2px);box-shadow:2px 2px 0 #2B2520}' +
      '.mm-err{color:#E8584E;font-family:"Jua",sans-serif;font-size:14px;min-height:18px;margin-top:8px;text-align:center}' +
      '.mm-pill{position:fixed;left:14px;bottom:14px;z-index:9998;font-family:"Jua",sans-serif;font-size:14px;background:#fff;border:3px solid #2B2520;border-radius:999px;padding:7px 14px;box-shadow:3px 3px 0 #2B2520;cursor:pointer}' +
      '.mm-pill u{color:#2E7BC4}';
    var s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  }

  /* ---------- 오버레이 ---------- */
  var overlay = null;
  function close() { if (overlay) { overlay.remove(); overlay = null; } }
  function build(html) {
    injectCSS(); close();
    overlay = document.createElement('div'); overlay.className = 'mm-overlay';
    overlay.innerHTML = '<div class="mm-card">' + html + '</div>';
    (document.body || document.documentElement).appendChild(overlay);
    return overlay;
  }

  /* ---------- 입장 폼 ---------- */
  function openEntry(opts) {
    opts = opts || {};
    var s = get();
    var ov = build(
      '<h3>학급 입장 📊</h3>' +
      '<p>선생님이 준 <b>학급 코드</b>와 <b>이름</b>을 넣으면 풀이가 기록돼요.</p>' +
      '<label>학급 코드</label><input class="mm-in code" id="mmCode" maxlength="6" placeholder="예: MATH7K" value="' + (s ? esc(s.code) : '') + '">' +
      '<label>이름</label><input class="mm-in" id="mmName" maxlength="20" placeholder="이름" value="' + (s ? esc(s.name) : '') + '">' +
      '<div class="mm-err" id="mmErr"></div>' +
      '<div class="mm-row">' +
        (opts.cancel ? '<button class="mm-btn ghost" id="mmCancel">취소</button>' : '') +
        '<button class="mm-btn" id="mmJoin">입장</button>' +
      '</div>');
    var code = ov.querySelector('#mmCode'), name = ov.querySelector('#mmName'), err = ov.querySelector('#mmErr');
    setTimeout(function () { (s ? name : code).focus(); }, 30);
    if (opts.cancel) ov.querySelector('#mmCancel').onclick = function () { close(); opts.cancel(); };
    function join() {
      var c = (code.value || '').trim(), n = (name.value || '').trim();
      if (!c || !n) { err.textContent = '코드와 이름을 모두 입력해요.'; return; }
      var cl = sb(); if (!cl) { err.textContent = '연결 오류 (설정을 확인해 주세요).'; return; }
      err.textContent = '입장 중…';
      cl.rpc('join_class', { p_code: c, p_name: n }).then(function (res) {
        if (res.error || !res.data) { err.textContent = '코드를 확인해 주세요.'; return; }
        var stu = { id: res.data, name: n, code: c.toUpperCase() };
        set(stu); sessionMark(); close(); pill();
        if (opts.onDone) opts.onDone(stu);
      });
    }
    ov.querySelector('#mmJoin').onclick = join;
    name.addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
  }

  /* ---------- 확인(이미 입장한 학생) ---------- */
  function openConfirm(opts) {
    var s = get();
    if (!s) { openEntry(opts); return; }
    var ov = build(
      '<h3>학습 시작 📊</h3>' +
      '<p><b>' + esc(s.name) + '</b> 학생으로 학습할까요?</p>' +
      '<div class="mm-row">' +
        '<button class="mm-btn ghost" id="mmOther">다른 학생</button>' +
        '<button class="mm-btn" id="mmYes">네, 시작</button>' +
      '</div>');
    ov.querySelector('#mmYes').onclick = function () { sessionMark(); close(); pill(); if (opts && opts.onDone) opts.onDone(s); };
    ov.querySelector('#mmOther').onclick = function () { openEntry(opts); };
  }

  /* ---------- 진입점 ---------- */
  // index 게이트: 이번 탭 세션에서 이미 확인했으면 그냥 통과(앱 내 이동),
  //   아니면 확인(있을 때)/입장(없을 때). → 통과 시 onDone
  function gate(opts) {
    var s = get();
    if (s && sessionOK()) { pill(); if (opts && opts.onDone) opts.onDone(s); return; }
    if (s) openConfirm(opts); else openEntry(opts);
  }
  // 레슨: 있으면 즉시 통과(확인 생략) + 세션 표시, 없으면 입장(닫기 불가) → 통과 시 onDone
  function require_(opts) {
    var s = get();
    if (s) { sessionMark(); pill(); if (opts && opts.onDone) opts.onDone(s); }
    else openEntry(opts);
  }

  /* ---------- 상태 알약 ---------- */
  var pillEl = null;
  function pill() {
    injectCSS();
    var s = get();
    if (!pillEl) {
      pillEl = document.createElement('div'); pillEl.className = 'mm-pill';
      pillEl.onclick = function () { openEntry({ cancel: function () {} }); };
      (document.body || document.documentElement).appendChild(pillEl);
    }
    pillEl.innerHTML = s ? ('👤 ' + esc(s.name) + ' <u>바꾸기</u>') : '👤 학급 입장';
  }

  window.MMStudent = { get: get, set: set, clear: clear, sb: sb, gate: gate, require: require_, openEntry: openEntry, pill: pill };
})();

/* ===== 가벼운 게이미피케이션 (window.MMGame) — localStorage 기반, 백엔드 0 =====
 * 허브와 레슨 모두 student.js를 로드하므로 여기 두면 새 <script> 없이 양쪽에서 쓰임.
 * 상태는 학생별 네임스페이스(mm-game-<id>). 감지는 tracker가 넘기는 신호(정답/시도수/완주)만 사용. */
(function () {
  var BADGES = {
    firstCorrect: { emo: '🎯', name: '첫 정답' },
    lessonClear:  { emo: '🏆', name: '레슨 완주' },
    comeback:     { emo: '💪', name: '오뚝이' },
    collector:    { emo: '🦊', name: '수집가' },
    streak3:      { emo: '🔥', name: '3일 연속' },
    streak7:      { emo: '⭐', name: '7일 연속' }
  };
  var ORDER = ['firstCorrect', 'lessonClear', 'comeback', 'collector', 'streak3', 'streak7'];
  function esc(t) { return (t || '').replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]); }); }
  function sid() { try { var s = window.MMStudent && MMStudent.get(); return s ? s.id : null; } catch (e) { return null; } }
  function key() { var id = sid(); return id ? ('mm-game-' + id) : null; }
  function def() { return { streak: 0, best: 0, lastDay: '', badges: {}, cleared: [] }; }
  function load() { var k = key(); if (!k) return null; try { return JSON.parse(localStorage.getItem(k) || 'null') || def(); } catch (e) { return def(); } }
  function save(g) { var k = key(); if (k) try { localStorage.setItem(k, JSON.stringify(g)); } catch (e) {} }
  function dayStr(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function today() { return dayStr(new Date()); }
  function yesterday() { var d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); }

  var injected = false;
  function injectCSS() {
    if (injected) return; injected = true;
    var css = '' +
      '.mm-toast{position:fixed;left:50%;top:18px;transform:translateX(-50%) translateY(-12px);z-index:100000;background:#FFC847;border:3px solid #2B2520;border-radius:14px;box-shadow:4px 4px 0 #2B2520;font-family:"Jua",sans-serif;font-size:17px;color:#2B2520;padding:10px 18px;opacity:0;transition:opacity .25s,transform .25s}' +
      '.mm-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}' +
      '.mm-gcard{background:#FFF7E6;border:4px solid #2B2520;border-radius:16px;box-shadow:5px 5px 0 #2B2520;padding:12px 14px;margin-top:20px}' +
      '.mm-grow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
      '.mm-flame{font-family:"Jua",sans-serif;font-size:17px;margin-right:6px}' +
      '.mm-badge{font-size:24px;filter:grayscale(1) opacity(.35);transition:filter .2s}' +
      '.mm-badge.on{filter:none}';
    var s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s);
  }
  var q = 0;
  function toast(msg) {
    var delay = q * 250; q++;
    setTimeout(function () {
      injectCSS();
      var t = document.createElement('div'); t.className = 'mm-toast'; t.textContent = msg;
      (document.body || document.documentElement).appendChild(t);
      requestAnimationFrame(function () { t.classList.add('show'); });
      setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2400);
      q = Math.max(0, q - 1);
    }, delay);
  }
  function award(g, id) { if (g.badges[id]) return false; g.badges[id] = Date.now(); toast(BADGES[id].emo + ' ' + BADGES[id].name + ' 뱃지 획득!'); return true; }
  function touchStreak(g) {
    var t = today();
    if (g.lastDay === t) return false;
    if (g.lastDay === yesterday()) g.streak = (g.streak || 0) + 1; else g.streak = 1;
    g.lastDay = t; if ((g.streak || 0) > (g.best || 0)) g.best = g.streak;
    return true;
  }
  // tracker가 매 답마다 호출: {correct, tries, allSolved, lessonId}
  function onAnswer(o) {
    var g = load(); if (!g) return;
    var changed = touchStreak(g);
    if (changed && g.streak >= 2 && g.streak !== 3 && g.streak !== 7) toast('🔥 ' + g.streak + '일 연속 학습!');
    if (g.streak >= 3) award(g, 'streak3');
    if (g.streak >= 7) award(g, 'streak7');
    if (o && o.correct) {
      award(g, 'firstCorrect');
      if (o.tries >= 2) award(g, 'comeback');
      if (o.allSolved && o.lessonId) {
        g.cleared = g.cleared || [];
        if (g.cleared.indexOf(o.lessonId) < 0) {
          g.cleared.push(o.lessonId);
          award(g, 'lessonClear');
          if (g.cleared.length >= 5) award(g, 'collector');
        }
      }
    }
    save(g);
  }
  function renderHub(el) {
    if (!el) return;
    var g = load(); if (!g) { el.innerHTML = ''; return; }
    injectCSS();
    var chips = ORDER.map(function (id) { return '<span class="mm-badge' + (g.badges[id] ? ' on' : '') + '" title="' + esc(BADGES[id].name) + '">' + BADGES[id].emo + '</span>'; }).join('');
    el.innerHTML = '<div class="mm-gcard"><div class="mm-grow"><span class="mm-flame">🔥 ' + (g.streak || 0) + '일 연속</span>' + chips + '</div></div>';
  }
  window.MMGame = { onAnswer: onAnswer, renderHub: renderHub, load: load, BADGES: BADGES };
})();
