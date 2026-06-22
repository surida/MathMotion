/* MathMotion E2E 테스트
 * 설치된 Chrome을 puppeteer-core로 조종해 퀴즈/게이트/셔플/단계해금을 자동 검증.
 * 실행: npm test   (브라우저 다운로드 없음, 외부 요청은 차단해 빠르고 결정적)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ---- 정적 서버 ----
function startServer() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/') p = '/index.html';
      const fp = path.join(ROOT, p);
      if (!fp.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(fp, (e, d) => {
        if (e) { res.writeHead(404); return res.end('404'); }
        res.writeHead(200, { 'content-type': TYPES[path.extname(fp)] || 'application/octet-stream' });
        res.end(d);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

// ---- 테스트 결과 수집 ----
let pass = 0, fail = 0; const fails = [];
function check(name, ok, msg) {
  if (ok) { pass++; }
  else { fail++; fails.push(name + (msg ? ' — ' + msg : '')); console.log('  ✗ ' + name + (msg ? ' — ' + msg : '')); }
}

const SEED = () => {
  localStorage.setItem('mm-student', JSON.stringify({ id: 'test', name: '테스터', code: 'TEST' }));
  sessionStorage.setItem('mm-session', 'test');
};

async function newPage(browser, { seed } = {}) {
  const ctx = await browser.createBrowserContext();  // 격리된 저장소(쿠키/localStorage)
  const page = await ctx.newPage();
  page._ctx = ctx;
  await page.setRequestInterception(true);
  page.on('request', r => {
    const u = r.url();
    if (u.startsWith('http://localhost') || u.startsWith('data:') || u.startsWith('about:')) r.continue();
    else r.abort(); // 외부(CDN/폰트) 차단 → 빠르고 결정적
  });
  if (seed) await page.evaluateOnNewDocument(SEED);
  page.setDefaultTimeout(8000);
  return page;
}

async function waitFor(page, sel, timeout = 6000) {
  return page.waitForSelector(sel, { timeout }).then(() => true).catch(() => false);
}

async function correctIndex(page, boxSel) {
  return page.$eval(boxSel, box => {
    const opts = [...box.querySelectorAll('.qopt')];
    return opts.findIndex(b => b.dataset.correct === 'true');
  });
}

(async () => {
  const srv = await startServer();
  const base = 'http://localhost:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const lessons = fs.readdirSync(path.join(ROOT, 'lessons')).filter(f => f.endsWith('.html'));

  try {
    // ---- index 게이트 ----
    {
      const page = await newPage(browser);
      await page.goto(base + '/', { waitUntil: 'load' });
      check('index: 미입장 시 게이트 모달', await waitFor(page, '.mm-overlay'));
      await page._ctx.close();
    }

    // ---- 레슨별 ----
    for (const f of lessons) {
      const url = base + '/lessons/' + f;
      const tag = f.replace('.html', '');

      // 1) 게이트 차단 (미입장)
      {
        const page = await newPage(browser);
        await page.goto(url, { waitUntil: 'load' });
        check(`${tag}: 미입장 게이트 차단`, await waitFor(page, '.mm-overlay'));
        await page._ctx.close();
      }

      // 2) 입장 후 퀴즈 검증
      {
        const page = await newPage(browser, { seed: true });
        await page.goto(url, { waitUntil: 'load' });
        await waitFor(page, '.mm-pill');   // tracker가 입장 처리 끝낼 때까지
        const overlay = await page.$('.mm-overlay');
        check(`${tag}: 입장 후 모달 없음`, !overlay);

        const boxes = await page.$$('.qopts');
        check(`${tag}: 퀴즈 존재`, boxes.length > 0);
        if (!boxes.length) { await page._ctx.close(); continue; }

        // 정답 단서 없음
        const giveaways = await page.$$eval('.qopt', btns => btns.map(b => b.textContent).filter(t =>
          /[✔✓]/.test(t) || /\s[—–]\s/.test(t) || /\([^)]*(했어요|둔다|바뀐다|뒤집|빼먹|곱했|더했)[^)]*\)/.test(t)));
        check(`${tag}: 보기에 정답 단서 없음`, giveaways.length === 0, giveaways.join(' / '));

        // 첫 박스: 정답 클릭 → 피드백
        const firstHasOpts = await page.$eval('.qopts', b => b.querySelectorAll('.qopt').length > 0);
        if (firstHasOpts) {
          await page.$eval('.qopts .qopt[data-correct="true"]', b => b.click());
          const fb = await page.$eval('.qopts', b => (b.parentElement.querySelector('.qfeedback') || {}).textContent || '');
          check(`${tag}: 정답 클릭 시 피드백 표시`, fb.trim().length > 0);
        }

        // 단계 해금 (tier 레슨)
        const hasTier = await page.$('.tier[data-tier="2"]');
        if (hasTier) {
          const t2hidden0 = await page.$eval('.tier[data-tier="2"]', el => el.hidden);
          check(`${tag}: 초기 Lv2 숨김`, t2hidden0 === true);
          // tier1 정답 클릭 → morebtn 표시
          await page.$eval('.tier[data-tier="1"] .qopt[data-correct="true"]', b => b.click());
          const moreShown = await page.$eval('.tier[data-tier="1"] .morebtn', el => el.hidden === false);
          check(`${tag}: Lv1 정답 → 더 도전 버튼`, moreShown);
          if (moreShown) {
            await page.$eval('.tier[data-tier="1"] .morebtn', el => el.click());
            const t2shown = await page.$eval('.tier[data-tier="2"]', el => el.hidden === false);
            check(`${tag}: 더 도전 → Lv2 열림`, t2shown);
          }
        }
        await page._ctx.close();
      }

      // 3) 셔플 (정답 위치가 고정 아님)
      {
        const page = await newPage(browser, { seed: true });
        const seen = new Set();
        for (let i = 0; i < 8; i++) {
          await page.goto(url, { waitUntil: 'load' });
          const n = await page.$eval('.qopts', b => b.querySelectorAll('.qopt').length);
          if (n < 2) { seen.add('na'); break; }
          seen.add(await correctIndex(page, '.qopts'));
        }
        check(`${tag}: 보기 셔플(정답 위치 가변)`, seen.has('na') || seen.size >= 2, '관측 위치=' + [...seen].join(','));
        await page._ctx.close();
      }
    }
  } catch (e) {
    console.log('테스트 실행 오류:', e.message);
    fail++;
  } finally {
    await browser.close();
    srv.close();
  }

  console.log(`\n결과: ${pass} 통과 · ${fail} 실패`);
  if (fail) { console.log('실패 목록:\n - ' + fails.join('\n - ')); process.exit(1); }
  console.log('✅ 모든 검사 통과');
})();
