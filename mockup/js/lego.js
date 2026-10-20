/* Lego Quest（實體積木組裝關）：學生端畫面與流程
 *
 * 登入 → 清點積木 →（缺件回報）→ 老師放行 → 倒數 → 看說明書組裝 → 完成 → 「開始 Robot Quest」
 * 狀態機、計時在 lego-model.js（純邏輯）；這裡只負責畫面、事件紀錄、存檔（sessionStorage）、老師密碼面板。
 * 網站只記錄，不判斷作品對錯：作品由老師現場檢查，在教師後台勾選等級。
 */
(function (RQ) {
  'use strict';

  const M = RQ.LegoModel;
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const dev = /[?&]dev\b/.test(location.search);
  const KEY = 'rq_lego_v1';

  // 設定 + 網址覆寫（測試與特殊場次用）：?lego=0 不做、?gate=1 要老師放行、?cap=秒 組裝時間、?sec=1 顯示秒數
  const CFG = Object.assign({ enabled: true, objectId: 'guitar', timeCapSec: null, gateStart: false, showSeconds: false, seededShortages: {}, pinHash: '' }, window.RQ_LEGO || {});
  if (qs.get('lego') === '0') CFG.enabled = false;
  if (qs.get('gate') === '1') CFG.gateStart = true;
  if (qs.get('gate') === '0') CFG.gateStart = false;
  if (qs.get('sec') === '1') CFG.showSeconds = true;
  if (Number(qs.get('cap')) > 0) CFG.timeCapSec = Number(qs.get('cap'));

  const lego = (RQ.lego = {});
  lego.enabled = () => CFG.enabled && !dev;
  lego.config = CFG;

  // ---------- SHA-256（老師密碼用；不用 crypto.subtle，因為用 http://網址 開啟時瀏覽器不給用）----------

  function sha256(ascii) {
    const rr = (v, n) => (v >>> n) | (v << (32 - n));
    const maxWord = Math.pow(2, 32);
    let result = '';
    const words = [];
    const bitLen = ascii.length * 8;
    const hash = [];
    const k = [];
    let pc = 0;
    const comp = {};
    for (let c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (let i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[pc++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += '\x80';
    while (ascii.length % 64 - 56) ascii += '\x00';
    for (let i = 0; i < ascii.length; i++) {
      const j = ascii.charCodeAt(i);
      words[i >> 2] |= j << (((3 - i) % 4) * 8);
    }
    words[words.length] = (bitLen / maxWord) | 0;
    words[words.length] = bitLen;
    let h = hash.slice(0, 8);
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16));
      const old = h;
      h = h.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15];
        const w2 = w[i - 2];
        const a = h[0];
        const e = h[4];
        const t1 = h[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & h[5]) ^ (~e & h[6])) + k[i]
          + (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & h[1]) ^ (a & h[2]) ^ (h[1] & h[2]));
        h = [(t1 + t2) | 0].concat(h);
        h[4] = (h[4] + t1) | 0;
      }
      for (let i = 0; i < 8; i++) h[i] = (h[i] + old[i]) | 0;
    }
    for (let i = 0; i < 8; i++) {
      for (let j = 3; j + 1; j--) {
        const b = (h[i] >> (j * 8)) & 255;
        result += (b < 16 ? 0 : '') + b.toString(16);
      }
    }
    return result;
  }
  lego.hash = (s) => sha256(unescape(encodeURIComponent(String(s))));

  // ---------- 狀態、存檔、事件 ----------

  let obj = null; // 作品資料（guitar.json）
  let state = null; // M.initial() 的狀態
  let student = null;
  let events = []; // { t：從進入 Lego Quest 起算的毫秒, at：絕對時間, level:100, type, payload }
  let onDone = null; // 按「開始 Robot Quest」後要做的事
  let active = false;
  let timer = null;

  const now = () => Date.now();
  function ev(type, payload) {
    const n = now();
    events.push({ t: n - (state ? state.enteredAt : n), at: n, level: 100, type, payload });
  }
  function save() {
    try { sessionStorage.setItem(KEY, JSON.stringify({ student, state, events, v: 1 })); } catch (e) { /* 忽略 */ }
  }
  function loadSaved() {
    try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function changed() {
    save();
    if (RQ.onLegoChange) RQ.onLegoChange(state.phase);
  }

  /** 重新整理後，回傳存檔裡的學生（app.js 用來自動回到 Lego Quest，不用重新登入） */
  lego.savedStudent = () => {
    if (!lego.enabled()) return null;
    const s = loadSaved();
    return s && s.student && s.state ? s.student : null;
  };
  lego.active = () => active;
  /** 上傳用：Lego Quest 的結果與事件 */
  lego.result = () => (state ? { ...M.result(state), skipped: !!state.skipped, events } : undefined);
  lego.status = () => (state ? M.statusText(state) : '');

  function dispatch(event) {
    const r = M.transition(state, event, now());
    if (r.error) {
      ev('asm_illegal', { event: event.type, error: r.error });
      save();
      return false;
    }
    state = r.state;
    changed();
    return true;
  }

  // ---------- 載入作品資料 ----------

  function loadObject(id) {
    const base = `assets/${id}/`;
    return fetch(`${base}${id}.json`)
      .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .catch(() => new Promise((res, rej) => { // 用 file:// 開啟時 fetch 讀不到 JSON，改讀同資料夾的 .js
        if (RQ.OBJECTS && RQ.OBJECTS[id]) return res(RQ.OBJECTS[id]);
        const sc = document.createElement('script');
        sc.src = `${base}${id}.js`;
        sc.onload = () => (RQ.OBJECTS && RQ.OBJECTS[id] ? res(RQ.OBJECTS[id]) : rej(new Error('資料格式不對')));
        sc.onerror = () => rej(new Error(`找不到 ${base}${id}.json（也沒有 ${id}.js）`));
        document.head.appendChild(sc);
      }))
      .then((o) => { o.base = base; return o; });
  }

  /** 把所有圖片先載入，進組裝頁翻頁才不會閃爍。回傳每張圖是否載入成功。 */
  function preload() {
    const urls = [...obj.steps, ...obj.parts.map((p) => p.icon)].map((u) => obj.base + u);
    return Promise.all(urls.map((u) => new Promise((res) => {
      const im = new Image();
      im.onload = () => res({ u, ok: true });
      im.onerror = () => res({ u, ok: false });
      im.src = u;
    })));
  }

  // ---------- 畫面 ----------

  function show(id) {
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.id !== id; });
  }

  function modal(html, actions, opts) {
    const m = document.createElement('div');
    m.className = 'modal asm-modal';
    m.innerHTML = `<div class="ov-box${opts && opts.wide ? ' asm-wide' : ''}"><div class="asm-modal-body">${html}</div><div class="asm-modal-actions"></div></div>`;
    const box = m.querySelector('.asm-modal-actions');
    const close = () => m.remove();
    (actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.cls || '';
      b.innerHTML = a.label;
      b.onclick = () => { if (a.fn) { if (a.fn(m) === false) return; } if (!a.keep) close(); };
      box.appendChild(b);
    });
    document.body.appendChild(m);
    return { el: m, close };
  }
  const closeModals = () => document.querySelectorAll('.asm-modal').forEach((m) => m.remove());

  // ----- 清點頁 -----

  function buildCards() {
    const box = $('asm-cards');
    box.innerHTML = '';
    obj.parts.forEach((p) => {
      const c = document.createElement('div');
      c.className = 'asm-card';
      c.dataset.bag = p.bag;
      c.innerHTML = `
        <div class="asm-badge">${p.bag}</div>
        <div class="asm-icon"><img src="${obj.base + p.icon}" alt="${p.colorZh}${p.shapeZh}"></div>
        <div class="asm-qty">× ${p.qty}</div>
        <div class="asm-name">${p.colorZh}　${p.shapeZh}</div>
        <div class="asm-no">零件編號 ${p.partNo}</div>
        <button type="button" class="asm-check"><span class="asm-ck"></span><span class="asm-ck-t">我數過了，有 ${p.qty} 顆</span></button>`;
      c.querySelector('.asm-check').onclick = () => toggleCheck(p.bag);
      box.appendChild(c);
    });
    box.dataset.built = '1';
  }

  function toggleCheck(bag) {
    if (state.phase === 'shortage_pending') return;
    const on = !state.checks[bag];
    const wasReady = state.phase === 'ready';
    if (!dispatch({ type: on ? 'CHECK' : 'UNCHECK', bag })) return;
    ev(on ? 'asm_count_check' : 'asm_count_uncheck', { bag });
    if (!wasReady && state.phase === 'ready') ev('asm_ready');
    save();
    renderCount();
  }

  function renderCount() {
    show('screen-asm-count');
    const ph = state.phase;
    obj.parts.forEach((p) => {
      const c = $('asm-cards').querySelector(`[data-bag="${p.bag}"]`);
      if (!c) return;
      const on = !!state.checks[p.bag];
      c.classList.toggle('on', on);
      c.querySelector('.asm-ck').innerHTML = on ? RQ.icon('check', 22) : '';
      c.querySelector('.asm-ck-t').textContent = on ? `數過了，有 ${p.qty} 顆` : `我數過了，有 ${p.qty} 顆`;
    });
    const n = state.bags.filter((b) => state.checks[b]).length;
    $('asm-progress').textContent = `已清點 ${n} / ${state.bags.length}`;
    const ready = ph === 'ready';
    const wait = ready && state.cfg.gateStart && !state.gate;
    const startBtn = $('asm-start');
    startBtn.disabled = !ready || wait;
    startBtn.textContent = wait ? '等老師說開始' : '開始組裝';
    $('asm-mask').hidden = ph !== 'shortage_pending';
    $('asm-short').disabled = ph === 'shortage_pending';
  }

  function openShortage() {
    if (state.phase !== 'count' && state.phase !== 'ready') return;
    ev('asm_shortage_open');
    const lack = {};
    const rows = obj.parts.map((p) => `
      <div class="asm-sr" data-bag="${p.bag}">
        <div class="asm-sr-b">${p.bag}</div>
        <img src="${obj.base + p.icon}" alt="">
        <div class="asm-sr-n"><b>${p.colorZh}　${p.shapeZh}</b><span>應該有 ${p.qty} 顆</span></div>
        <div class="asm-sr-c"><button type="button" class="asm-pm" data-d="-1" aria-label="少一顆">－</button><b class="asm-sr-v">0</b><button type="button" class="asm-pm" data-d="1" aria-label="多缺一顆">＋</button></div>
      </div>`).join('');
    const m = modal(`<h2>缺哪些積木？</h2><p class="muted">按 ＋ 填入缺幾顆，沒有缺的就不用動。</p><div class="asm-sr-list">${rows}</div>`, [
      { label: '先不要', cls: '' },
      {
        label: '通知老師', cls: 'primary',
        fn: () => {
          const items = Object.entries(lack).filter(([, v]) => v > 0).map(([bag, short]) => ({ bag, short }));
          if (!items.length) { m.el.querySelector('.asm-modal-body').insertAdjacentHTML('beforeend', '<p class="err">請先選缺的積木</p>'); return false; }
          if (dispatch({ type: 'REPORT_SHORTAGE', items })) { ev('asm_shortage_report', { items }); save(); renderCount(); }
        },
      },
    ], { wide: true });
    m.el.querySelectorAll('.asm-sr').forEach((row) => {
      const bag = row.dataset.bag;
      const max = state.qty[bag];
      row.querySelectorAll('.asm-pm').forEach((b) => {
        b.onclick = () => {
          lack[bag] = Math.max(0, Math.min(max, (lack[bag] || 0) + Number(b.dataset.d)));
          row.querySelector('.asm-sr-v').textContent = lack[bag];
          row.classList.toggle('on', lack[bag] > 0);
        };
      });
    });
  }

  // ----- 開始 → 倒數 → 組裝 -----

  function pressStart() {
    if (!dispatch({ type: 'START' })) return;
    ev('asm_start');
    save();
    runCountdown();
  }

  function runCountdown() {
    const box = $('asm-countdown');
    const num = box.querySelector('b');
    box.hidden = false;
    let n = 3;
    num.textContent = n;
    const tick = () => {
      n--;
      if (!active || state.phase !== 'countdown') { box.hidden = true; return; }
      if (n > 0) { num.textContent = n; setTimeout(tick, 1000); return; }
      box.hidden = true;
      if (dispatch({ type: 'COUNTDOWN_DONE' })) {
        ev('asm_t0');
        ev('asm_step_view', { step: 1, from: 'init' });
        save();
        renderBuild();
      }
    };
    setTimeout(tick, 1000);
  }

  // ----- 組裝頁 -----

  const stepUrl = () => obj.base + obj.steps[state.step - 1];

  function renderBuild() {
    show('screen-asm-build');
    $('asm-obj').textContent = obj.nameZh;
    $('asm-stepno').textContent = `第 ${state.step} / ${state.totalSteps} 步`;
    $('asm-img').src = stepUrl();
    $('asm-prev').disabled = state.step <= 1;
    $('asm-next').disabled = state.step >= state.totalSteps;
    $('asm-time-txt').hidden = !state.cfg.showSeconds;
    startTimer();
    tickTimer();
  }

  function go(to, from) {
    if (state.phase !== 'building' || to < 1 || to > state.totalSteps || to === state.step) return;
    if (!dispatch({ type: 'STEP', to })) return;
    ev('asm_step_view', { step: to, from });
    save();
    renderBuild();
  }

  function startTimer() {
    clearInterval(timer);
    timer = setInterval(tickTimer, 250);
  }
  function stopTimer() { clearInterval(timer); timer = null; }

  function tickTimer() {
    if (!state || state.phase !== 'building') return;
    const rem = M.remainingMs(state, now());
    const cap = state.cfg.timeCapSec * 1000;
    $('asm-time-fill').style.width = Math.max(0, (rem / cap) * 100) + '%';
    $('asm-time-fill').parentElement.classList.toggle('low', rem < 60000); // 剩不到 1 分鐘變橘色，不閃爍、不跳訊息
    if (state.cfg.showSeconds) {
      const s = Math.ceil(rem / 1000);
      $('asm-time-txt').textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }
    if (rem <= 0) {
      stopTimer();
      if (dispatch({ type: 'TIMEOUT' })) { ev('asm_timeout'); save(); afterBuild(); }
    }
  }

  function openZoom() {
    if (state.phase !== 'building') return;
    dispatch({ type: 'ZOOM_OPEN' });
    ev('asm_zoom_open', { step: state.step });
    const o = $('asm-zoomov');
    o.querySelector('b').textContent = `${obj.nameZh}　第 ${state.step} / ${state.totalSteps} 步`;
    o.querySelector('img').src = stepUrl();
    o.hidden = false;
    o.querySelector('.asm-zoombody').scrollTop = 0;
  }
  function closeZoom() {
    if ($('asm-zoomov').hidden) return;
    $('asm-zoomov').hidden = true;
    if (state && state.phase === 'building') { dispatch({ type: 'ZOOM_CLOSE' }); ev('asm_zoom_close'); save(); }
  }

  function askFinish() {
    if (state.phase !== 'building') return;
    modal('<h2>確定完成了嗎？</h2><p>按下去就不能再改囉。</p>', [
      { label: '還沒好，繼續', cls: '' },
      {
        label: '完成了，交給老師', cls: 'primary',
        fn: () => {
          if (state.phase !== 'building') return;
          if (dispatch({ type: 'FINISH' })) { ev('asm_finish', { atStep: state.finishedAtStep }); save(); afterBuild(); }
        },
      },
    ]);
  }

  /** 組裝結束（完成或逾時）後：逾時先顯示 3 秒提示，再進完成頁 */
  function afterBuild() {
    stopTimer();
    closeZoom();
    closeModals();
    if (state.phase === 'timeout') {
      modal('<h2>時間到！</h2><p>請停下來，把作品交給老師。</p>', [], {});
      setTimeout(() => { closeModals(); toWaiting(); }, 3000);
    } else {
      toWaiting();
    }
  }
  function toWaiting() {
    if (state.phase === 'finished' || state.phase === 'timeout') { dispatch({ type: 'CONTINUE' }); save(); }
    renderDone();
  }

  // ----- 完成頁 -----

  function renderDone() {
    show('screen-asm-done');
    $('asm-who-big').textContent = `${student.class} 班　${student.seat} 號`;
    $('asm-go-robot').disabled = false;
    // 成績與組裝結果不顯示給學生。有連線時顯示上傳狀態，沒傳成功要叫學生告訴老師
    const c = RQ.cloud;
    if (c && c.enabled && !dev) {
      const msg = { sending: '資料傳送中…', ok: '', fail: '結果還沒傳成功，請舉手告訴老師' };
      c.onState = (st) => {
        const t = msg[st];
        $('asm-cloud').hidden = !t;
        $('asm-cloud').textContent = t || '';
        $('asm-retry').hidden = st !== 'fail';
      };
      $('asm-retry').onclick = () => c.flush(true);
      if (RQ.syncCloudNow) RQ.syncCloudNow(); // 馬上上傳組裝結果，並顯示有沒有傳成功
    }
  }

  function downloadResult() {
    // 格式和完整結果檔一樣（levels 是空的），老師可以直接在後台「匯入結果檔」
    const data = { sessionCode: RQ.sessionCode, student, status: 'playing', levels: [], programs: {}, events: [], assembly: lego.result() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${student.class}_${student.seat}_assembly.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function leave() {
    active = false;
    stopTimer();
    closeModals();
    $('asm-countdown').hidden = true;
    if (onDone) onDone();
  }

  // ---------- 路由 ----------

  function route() {
    switch (state.phase) {
      case 'count': case 'ready': case 'shortage_pending': renderCount(); break;
      case 'countdown': runCountdown(); break;
      case 'building': renderBuild(); break;
      case 'finished': case 'timeout': toWaiting(); break;
      case 'waiting_check': renderDone(); break;
      default: renderCount();
    }
  }

  function showError(list) {
    active = true; // 讓老師能用密碼面板跳過
    $('asm-error-list').innerHTML = list.map((t) => `<div class="asm-err-i">${t}</div>`).join('');
    show('screen-asm-error');
  }

  // ---------- 開始 ----------

  /**
   * 登入後呼叫。done：學生按「開始 Robot Quest」（或老師跳過）後要做的事。
   * 有存檔（重新整理）就回到原本的畫面；時間由絕對時間推算，不會重置也不會延長。
   */
  lego.begin = async function (stu, done) {
    student = stu;
    onDone = done;
    active = true;
    try {
      obj = await loadObject(CFG.objectId);
    } catch (e) {
      return showError([`找不到組裝說明書的資料。${e.message}`, '圖片檔（assets 資料夾）沒有放在這台電腦上，或網址不對。']);
    }
    const errs = M.validateObject(obj);
    if (errs.length) return showError(errs);
    preload().then((rs) => {
      const miss = rs.filter((r) => !r.ok);
      if (miss.length) {
        ev('asm_missing_images', { n: miss.length });
        if (miss.length >= obj.steps.length) showError(['說明書圖片載入失敗（' + miss.length + ' 張）。', '請確認 assets 資料夾的圖片都在。']);
      }
    });

    const saved = loadSaved();
    const same = saved && saved.state && saved.student && saved.student.class === student.class && Number(saved.student.seat) === Number(student.seat) && saved.state.objectId === obj.id;
    if (same) {
      state = M.restore(saved.state, now());
      events = saved.events || [];
      ev('asm_restore', { phase: state.phase });
    } else {
      const seeded = (CFG.seededShortages || {})[student.seat] || null;
      state = M.initial(obj, { gateStart: CFG.gateStart, timeCapSec: CFG.timeCapSec, showSeconds: CFG.showSeconds, seeded }, now());
      events = [];
      ev('asm_count_enter');
    }
    buildCards();
    changed();
    $('asm-who').textContent = `${student.class} 班　${student.seat} 號`;
    route();
  };

  // ---------- 老師密碼面板（離線也能處理：放行、缺件、跳過）----------
  // 規格書寫的是 Ctrl+Shift+T，但那是 Chrome 保留的「重開剛關掉的分頁」，網頁攔截不到，所以改成 Ctrl+Shift+L；
  // 另外也可以連續點 5 下畫面右下角的署名。

  function openTeacher() {
    if (!active || document.querySelector('.asm-teacher')) return;
    const m = modal(`<h2>老師面板</h2><p class="muted">請輸入老師密碼</p><input type="password" class="asm-pin" autocomplete="off" inputmode="numeric"><div class="err asm-pin-err"></div>`, [
      { label: '取消', cls: '' },
      { label: '確定', cls: 'primary', keep: true, fn: () => checkPin(m) },
    ]);
    m.el.classList.add('asm-teacher');
    const inp = m.el.querySelector('.asm-pin');
    inp.focus();
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') checkPin(m); });
  }

  function checkPin(m) {
    const v = m.el.querySelector('.asm-pin').value;
    if (!CFG.pinHash || lego.hash(v) !== CFG.pinHash) {
      m.el.querySelector('.asm-pin-err').textContent = '密碼不對';
      return false;
    }
    m.close();
    teacherActions();
    return false;
  }

  function teacherActions() {
    const ph = state ? state.phase : 'error';
    const acts = [];
    if (state && (ph === 'count' || ph === 'ready') && state.cfg.gateStart && !state.gate) {
      acts.push({ label: '放行（這位同學可以按「開始組裝」）', cls: 'primary', fn: () => { if (dispatch({ type: 'GATE_OPEN' })) { ev('asm_gate_open', { via: 'pin' }); save(); renderCount(); } } });
    }
    if (ph === 'shortage_pending') {
      acts.push({ label: '已補件（卡片重置，學生重新數）', cls: 'primary', fn: () => { if (dispatch({ type: 'RESOLVE_SHORTAGE', result: 'restocked', via: 'pin' })) { ev('asm_shortage_resolved', { result: 'restocked', via: 'pin' }); save(); renderCount(); } } });
      acts.push({ label: '沒有缺件（誤報）', cls: '', fn: () => { if (dispatch({ type: 'RESOLVE_SHORTAGE', result: 'false_alarm', via: 'pin' })) { ev('asm_shortage_resolved', { result: 'false_alarm', via: 'pin' }); save(); renderCount(); } } });
    }
    if (state && ph !== 'waiting_check') {
      acts.push({ label: '重設這位同學的 Lego Quest（重新開始）', cls: '', fn: () => resetLego() });
    }
    acts.push({
      label: '跳過 Lego Quest，直接進 Robot Quest', cls: '',
      fn: () => { if (state) { state.skipped = true; ev('asm_skip', { via: 'pin', phase: ph }); changed(); } leave(); },
    });
    acts.push({ label: '關閉', cls: '' });
    modal(`<h2>老師面板</h2><p class="muted">${student ? student.class + ' 班 ' + student.seat + ' 號' : ''}　${state ? M.statusText(state) : '無法開始'}</p>`, acts, { wide: true });
  }

  function resetLego() {
    modal('<h2>確定要重設嗎？</h2><p>這位同學的清點與組裝紀錄會被清掉，從頭開始。</p>', [
      { label: '取消', cls: '' },
      {
        label: '重設', cls: 'primary',
        fn: () => {
          const prev = events;
          state = M.initial(obj, { gateStart: CFG.gateStart, timeCapSec: CFG.timeCapSec, showSeconds: CFG.showSeconds, seeded: (CFG.seededShortages || {})[student.seat] || null }, now());
          events = prev.slice(-50); // 留著舊紀錄的尾巴，之後查得到有重設過
          ev('asm_reset', { via: 'pin' });
          stopTimer();
          closeZoom();
          changed();
          renderCount();
        },
      },
    ]);
  }

  // ---------- 事件綁定 ----------

  $('asm-start').onclick = pressStart;
  $('asm-short').onclick = openShortage;
  $('asm-prev').onclick = () => go(state.step - 1, 'prev');
  $('asm-next').onclick = () => go(state.step + 1, 'next');
  $('asm-zoom').onclick = openZoom;
  $('asm-zoomclose').onclick = closeZoom;
  $('asm-finish').onclick = askFinish;
  $('asm-go-robot').onclick = () => { ev('asm_continue'); save(); leave(); };
  $('asm-download').onclick = downloadResult;

  window.addEventListener('keydown', (e) => {
    if (!active) return;
    if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) { e.preventDefault(); openTeacher(); return; }
    if (!state || state.phase !== 'building' || document.querySelector('.asm-modal')) return;
    if (e.key === 'Escape') { closeZoom(); return; }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(state.step - 1, 'key'); }
    else if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(state.step + 1, 'key'); }
  });

  // 連續點 5 下右下角的署名 = 開老師面板（網頁攔不到 Ctrl+Shift+T，所以多一個入口）
  (function () {
    const c = $('credit');
    if (!c) return;
    let n = 0;
    let last = 0;
    c.addEventListener('click', () => {
      const t = now();
      n = t - last < 1500 ? n + 1 : 1;
      last = t;
      if (n >= 5) { n = 0; openTeacher(); }
    });
  })();

  document.addEventListener('visibilitychange', () => {
    if (!active || !state || !['count', 'ready', 'shortage_pending', 'countdown', 'building'].includes(state.phase)) return;
    ev(document.hidden ? 'tab_hidden' : 'tab_visible');
    save();
  });

  window.addEventListener('beforeunload', (e) => {
    if (dev || !active || !state) return;
    if (['count', 'ready', 'shortage_pending', 'countdown', 'building'].includes(state.phase)) { e.preventDefault(); e.returnValue = ''; }
  });

  // 登入頁的提示文字：不做 Lego Quest 時就不顯示
  if (!lego.enabled()) { const f = $('login-flow'); if (f) f.hidden = true; }
})((window.RQ = window.RQ || {}));
