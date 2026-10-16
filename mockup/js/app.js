/* 學生端流程：登入 → 說明 → 闖關（共用總時間）→ 完成 */
(function (RQ) {
  'use strict';

  const CONFIG = (RQ.CONFIG = {
    totalSec: 10 * 60, // 方案 B：只有總時間，能走多遠算多遠
    skipAfterSec: 30,
    speed: { slow: 380, fast: 130 },
    maxCardPauseSec: 60, // 新積木說明卡打開時暫停計時，最多暫停這麼久（「說明」按鈕不暫停）
    appVersion: 'mockup-0.5',
  });

  const $ = (id) => document.getElementById(id);
  const L = RQ.LEVELS;
  const MAIN = L.filter((lv) => !lv.hiddenLevel).length - 1; // 正式關卡數（不含暖身、隱藏關）
  const BOSS = MAIN;
  const HIDDEN = L.findIndex((lv) => lv.hiddenLevel);
  const dev = /[?&]dev\b/.test(location.search);
  // 場次代碼：老師發的連結帶 ?s=代碼，成績就會歸在同一個場次；沒帶就是 default
  const sessionCode = (new URLSearchParams(location.search).get('s') || 'default').slice(0, 30);

  const S = {
    sessionCode,
    student: null,
    survey: null,
    variant: 'A',
    startedAt: 0,
    pausedMs: 0,
    pauseStart: null,
    warmupMs: null, // 暖身結束時的 active() 值；null = 還在暖身，倒數不啟動
    idx: -1,
    level: null,
    maps: [],
    res: null,
    levelStartActive: 0,
    events: [],
    results: {},
    programs: {},
    lastRun: {},
    session: null,
    token: 0,
    busy: false,
    speed: 'slow',
    ending: false,
    finished: false,
    ws: null,
    view: null,
  };
  RQ.state = S;

  RQ.fillIcons();
  document.querySelectorAll('.total-min').forEach((el) => (el.textContent = Math.round(CONFIG.totalSec / 60)));
  $('hand').innerHTML = RQ.icon('pointer', 44);

  // ---------- 時間 ----------

  function active() {
    if (!S.startedAt) return 0;
    const now = Date.now();
    return now - S.startedAt - S.pausedMs - (S.pauseStart ? Math.min(now - S.pauseStart, CONFIG.maxCardPauseSec * 1000) : 0);
  }
  function pause() { if (!S.pauseStart) S.pauseStart = Date.now(); }
  function resume() {
    if (!S.pauseStart) return;
    S.pausedMs += Math.min(Date.now() - S.pauseStart, CONFIG.maxCardPauseSec * 1000);
    S.pauseStart = null;
  }
  const fmt = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  function tick() {
    if (!S.startedAt || S.finished) return;
    const total = CONFIG.totalSec * 1000;
    // 暖身關不計時：離開暖身（進第 1 關）的那一刻才開始倒數
    const warm = S.warmupMs === null;
    const rem = total - (warm ? 0 : active() - S.warmupMs);
    $('tb-clock-label').textContent = warm ? '暖身不計時' : '剩餘時間';
    $('tb-clock').textContent = fmt(rem);
    $('tb-clock').classList.toggle('low', rem <= 60000);
    $('tb-bar-fill').style.width = Math.max(0, (rem / total) * 100) + '%';
    if (S.idx >= 0 && !S.level.submit && active() - S.levelStartActive >= CONFIG.skipAfterSec * 1000) $('btn-skip').hidden = false;
    if (!warm && rem <= 0) timeUp();
  }

  // ---------- 紀錄 ----------

  function log(type, payload) {
    S.events.push({ t: Math.round(active()), level: S.idx, variant: S.variant, type, payload });
  }

  // ---------- 畫面切換 ----------

  function show(id) {
    ['screen-login', 'screen-survey', 'screen-intro', 'screen-game', 'screen-done'].forEach((s) => ($(s).hidden = s !== id));
  }

  $('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const seat = Number(f.get('seat'));
    const cls = String(f.get('class')).trim();
    if (!cls || !(seat >= 1)) {
      $('login-err').textContent = '請把班級和座號填好';
      return;
    }
    S.student = { grade: Number(f.get('grade')), class: cls, seat };
    S.variant = seat % 2 === 1 ? 'A' : 'B'; // 相鄰座號拿到鏡像地圖
    startSurvey();
  });

  // ---------- 背景調查：有沒有玩過積木程式、自評熟悉度（不計分，老師後台看得到）----------

  const SV = { experience: null, tools: [], level: null };
  function startSurvey() {
    show('screen-survey');
    surveyUpdate();
  }
  function surveyUpdate() {
    const yes = SV.experience === 'yes';
    $('q-tools').hidden = !yes;
    $('q-level').hidden = !yes;
    document.querySelectorAll('#survey-form .choice').forEach((b) => {
      const q = b.parentElement.dataset.q;
      const v = b.dataset.v;
      b.classList.toggle('on', q === 'tools' ? SV.tools.includes(v) : String(SV[q]) === v);
    });
    $('btn-survey').disabled = !(SV.experience === 'no' || (yes && SV.tools.length && SV.level));
    $('survey-err').textContent = '';
  }
  document.querySelectorAll('#survey-form .choice').forEach((b) => {
    b.onclick = () => {
      const q = b.parentElement.dataset.q;
      if (q === 'tools') SV.tools = SV.tools.includes(b.dataset.v) ? SV.tools.filter((x) => x !== b.dataset.v) : [...SV.tools, b.dataset.v];
      else if (q === 'level') SV.level = Number(b.dataset.v);
      else SV.experience = b.dataset.v;
      surveyUpdate();
    };
  });
  $('survey-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('btn-survey').disabled) return;
    // level：0 = 沒玩過；1–5 = 自評熟悉度
    S.survey = SV.experience === 'yes' ? { experience: 'yes', tools: SV.tools, level: SV.level } : { experience: 'no', tools: [], level: 0 };
    show('screen-intro');
  });

  $('btn-begin').addEventListener('click', startTest);

  function startTest() {
    S.startedAt = Date.now();
    S.startedIso = new Date().toISOString();
    log('test_start', { variant: S.variant, survey: S.survey });
    show('screen-game');
    S.view = new RQ.MapView($('map'));
    enterLevel(0);
    setInterval(tick, 250);
    tick();
  }

  // ---------- 關卡 ----------

  function enterLevel(i) {
    stopPlayback();
    stopHand();
    closeHelp();
    if (i > 0 && S.warmupMs === null) {
      S.warmupMs = active();
      log('countdown_start');
    }
    S.idx = i;
    const lv = (S.level = L[i]);
    S.maps = RQ.mapsFor(lv, S.variant);
    S.levelStartActive = active();
    S.res = S.results[i] = {
      id: i, title: lv.title, cleared: false, stars: 0, runs: 0, stepPresses: 0, stepBacks: 0, undos: 0,
      hint: false, skipped: false, timeout: false, firstRunMs: null, blocks: null, mapsPassed: 0,
      bestProgress: 0, sensorUsed: false, retryForStars: 0,
    };

    RQ.blockOpts = {
      sides: (lv.look && lv.look.sides) || ['front'],
      is: (lv.look && lv.look.is) || ['wall'],
      colors: lv.colors || ['red', 'green'],
      moveN: lv.blocks.includes('moveN'),
    };

    $('tb-title').textContent = i === 0 ? '暖身' : lv.hiddenLevel ? `隱藏關卡　${lv.title}` : `第 ${i} 關　${lv.title}`;
    $('tb-prompt').textContent = lv.prompt;
    $('tb-badge').textContent = i === 0 ? '暖身' : lv.hiddenLevel ? '隱藏關卡' : `第 ${i} 關 / ${MAIN}`;
    $('hint-bubble').hidden = true;
    $('turn-guide').hidden = !lv.turnGuide;
    if (lv.turnGuide) $('turn-guide').innerHTML = RQ.turnGuide();
    $('btn-skip').hidden = true;
    $('btn-submit').hidden = !lv.submit;
    status('');

    createWorkspace(lv);
    buildThumbs();
    showMap(0);
    updateStepButtons();
    log('level_enter', { title: lv.title });
    syncCloud('playing'); // 老師後台可以看到進行中的同學
    if (dev) renderDev();

    const cards = (lv.cards || []).slice();
    const next = () => {
      if (!cards.length) {
        resume();
        if (i === 0) handDemo();
        return;
      }
      pause();
      const id = cards.shift();
      log('card_open', { card: id });
      RQ.showCard(id, () => { log('card_close', { card: id }); next(); });
    };
    next();
  }

  function createWorkspace(lv) {
    if (S.ws) S.ws.dispose();
    $('blockly').innerHTML = '';
    S.ws = Blockly.inject($('blockly'), {
      toolbox: RQ.toolbox(lv.blocks),
      theme: RQ.theme,
      renderer: 'thrasos',
      trashcan: true,
      sounds: false,
      comments: false,
      maxBlocks: lv.blockLimit ? lv.blockLimit + 1 : Infinity, // +1 是「機器人程式」本身
      zoom: { controls: true, wheel: false, startScale: 1.15, maxScale: 1.6, minScale: 0.6, scaleSpeed: 1.15 },
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 24, length: 2, colour: '#e4dfd3', snap: true },
    });
    Blockly.Events.disable();
    const pre = lv.preload ? (S.variant === 'B' ? RQ.mirrorProgram(lv.preload) : RQ.normalize(lv.preload)) : [];
    RQ.loadProgram(S.ws, pre);
    Blockly.Events.enable();
    S.ws.clearUndo();
    S.preload = pre;
    S.ws.addChangeListener(Blockly.Events.disableOrphans);
    S.ws.addChangeListener(onWsChange);
    updateCount();
  }

  function onWsChange(e) {
    if (e.isUiEvent) return;
    const E = Blockly.Events;
    let type = null;
    const p = {};
    if (e.type === E.BLOCK_CREATE) { type = 'block_add'; p.block = e.json && e.json.type; }
    else if (e.type === E.BLOCK_DELETE) { type = 'block_remove'; p.block = e.oldJson && e.oldJson.type; }
    else if (e.type === E.BLOCK_MOVE) {
      if (e.oldParentId === e.newParentId && e.oldInputName === e.newInputName) return;
      type = 'block_move';
      p.into = e.newParentId ? 'program' : 'loose';
    } else if (e.type === E.BLOCK_CHANGE) {
      if (e.element !== 'field') return;
      type = 'field_change';
      p.name = e.name;
      p.value = e.newValue;
    } else return;
    p.blocks = RQ.blockCount(S.ws);
    log(type, p);
    if (S.res.minBlocks === undefined || p.blocks < S.res.minBlocks) S.res.minBlocks = p.blocks;
    if (type === 'block_add') stopHand();
    // 貼上（右鍵或 Ctrl+V）可能超過積木上限：超過就退回去
    if (type === 'block_add' && S.level.blockLimit && p.blocks > S.level.blockLimit && !limitTimer) {
      limitTimer = setTimeout(enforceLimit, 0);
    }
    updateCount();
    // 程式改了，正在播的執行就作廢
    if (S.session) { stopPlayback(); resetView(); }
  }

  // 連續貼上時一次退回到上限以內（只退超出的部分）
  let limitTimer = null;
  function enforceLimit() {
    limitTimer = null;
    const lim = S.level.blockLimit;
    for (let guard = 0; lim && RQ.blockCount(S.ws) > lim && guard < 20; guard++) S.ws.undo(false);
    updateCount();
  }

  function updateCount() {
    const n = RQ.blockCount(S.ws);
    const lim = S.level.blockLimit;
    const el = $('block-count');
    el.textContent = lim ? `積木數：${n} / ${lim}` : `積木數：${n}`;
    const full = !!lim && n >= lim;
    el.classList.toggle('full', full);
    $('limit-msg').hidden = !full;
    $('limit-msg').textContent = S.level.limitMsg || '積木用完了';
  }

  $('btn-undo').onclick = () => { S.ws.undo(false); S.res.undos++; log('undo'); };
  $('btn-redo').onclick = () => { S.ws.undo(true); log('redo'); };

  // ---------- 地圖與縮圖 ----------

  function buildThumbs() {
    const box = $('thumbs');
    box.innerHTML = '';
    S.thumbs = null;
    if (S.maps.length < 2) return;
    S.thumbs = S.maps.map((m, i) => {
      const d = document.createElement('div');
      d.className = 'thumb';
      d.innerHTML = `<div class="tv"></div><div class="tn">${m.name}<span class="ts"></span></div>`;
      d.onclick = () => { if (!S.session) showMap(i); };
      box.appendChild(d);
      new RQ.MapView(d.querySelector('.tv')).render(m);
      return d;
    });
  }
  function thumbStatus(i, ok) {
    if (!S.thumbs) return;
    S.thumbs[i].querySelector('.ts').innerHTML = ok === undefined ? '' : RQ.icon(ok ? 'check' : 'cross', 16, ok ? 'ico-ok' : 'ico-ng');
  }
  function clearThumbStatus() { S.maps.forEach((_, i) => thumbStatus(i)); }

  function showMap(i) {
    S.view.render(S.maps[i]);
    $('map-label').textContent = S.maps.length > 1 ? S.maps[i].name : '';
    if (S.thumbs) S.thumbs.forEach((t, k) => t.classList.toggle('active', k === i));
  }

  function status(text, kind) {
    const el = $('status');
    el.textContent = text || '';
    el.className = 'status ' + (kind || '');
  }

  // ---------- 執行 ----------

  function firstTurn(prog) {
    for (const n of RQ.normalize(prog)) {
      if (n.t === 'left' || n.t === 'right') return n.t;
      for (const sub of [n.body, n.then, n.else]) {
        if (sub) { const t = firstTurn(sub); if (t) return t; }
      }
    }
    return null;
  }

  function usedTypes(prog, set) {
    set = set || new Set();
    RQ.normalize(prog).forEach((n) => {
      set.add(n.t);
      [n.body, n.then, n.else].forEach((sub) => { if (sub) usedTypes(sub, set); });
    });
    return [...set];
  }

  function buildSession(mode) {
    const prog = RQ.compile(S.ws);
    const n = RQ.blockCount(S.ws);
    if (!prog.length) { status(RQ.MESSAGES.empty, 'fail'); return null; }
    if (RQ.hasMissingCond(prog)) {
      status(RQ.MESSAGES.missing_cond, 'fail');
      log('run_result', { ok: false, failReason: 'missing_cond', blockCount: n });
      return null;
    }
    const opts = { lineProgress: !!S.level.lineProgress };
    const runs = [];
    for (const m of S.maps) {
      const r = RQ.run(prog, m, opts);
      // 「一步一步走」的停點：每個動作（感測不算一步）
      const stops = r.trace.map((e, i) => (e.kind === 'check' ? -1 : i)).filter((i) => i >= 0);
      runs.push({ map: m, result: r, stops });
      if (!r.ok) break;
    }
    const ok = runs.length === S.maps.length && runs.every((x) => x.result.ok);
    const last = runs[runs.length - 1].result;

    const res = S.res;
    res.runs++;
    if (res.firstRunMs === null) res.firstRunMs = active() - S.levelStartActive;
    res.mapsPassed = Math.max(res.mapsPassed, runs.filter((x) => x.result.ok).length);
    res.bestProgress = Math.max(res.bestProgress, runs[0].result.progress);
    res.sensorUsed = res.sensorUsed || RQ.usesSensor(prog);
    res.used = [...new Set([...(res.used || []), ...usedTypes(prog)])]; // 這關用過哪些種積木（記錄用）
    if (S.level.expectFirstTurn && res.runs === 1) {
      // 第一次執行就轉錯方向？（B 版是鏡像，該轉的方向相反）
      const want = S.level.expectFirstTurn;
      const expect = S.variant === 'B' ? (want === 'left' ? 'right' : 'left') : want;
      const got = firstTurn(prog);
      res.firstRunTurnError = got !== null && got !== expect;
    }
    S.lastRun[S.idx] = RQ.stripIds(prog);

    log(mode, { blocks: n });
    log('run_result', { ok, failReason: ok ? null : last.fail, map: runs.length - 1, maxProgress: last.progress, blockCount: n });
    return { prog, runs, ok, n, mapI: 0, k: 0, token: ++S.token, mode, done: false, pendingMap: false };
  }

  async function playEntry(e) {
    S.ws.highlightBlock(e.id || null);
    await S.view.apply(e, CONFIG.speed[S.speed]);
  }

  async function runAll() {
    if (S.busy && S.session && S.session.mode === 'run') return;
    stopHand();
    stopPlayback();
    clearThumbStatus();
    const s = buildSession('run');
    if (!s) return;
    S.session = s;
    S.busy = true;
    updateStepButtons();
    status('執行中…', 'info');
    for (let i = 0; i < s.runs.length; i++) {
      showMap(i);
      if (i > 0) await RQ.wait(350);
      for (const e of s.runs[i].result.trace) {
        if (s.token !== S.token) return;
        await playEntry(e);
      }
      if (s.token !== S.token) return;
      if (s.runs[i].result.ok && i < s.runs.length - 1) {
        thumbStatus(i, true);
        status(`${s.runs[i].map.name}成功！換${s.runs[i + 1].map.name}`, 'ok');
        S.view.jump();
        await RQ.wait(1000);
        if (s.token !== S.token) return;
      }
    }
    S.busy = false;
    finishSession(s);
  }

  // 一步一步走：每按一次做一個動作
  async function stepForward() {
    if (S.busy) return;
    stopHand();
    let s = S.session;
    if (!s || s.mode !== 'step' || s.done) {
      stopPlayback();
      clearThumbStatus();
      s = buildSession('step');
      if (!s) return;
      S.session = s;
      showMap(0);
    } else {
      log('step');
    }
    S.res.stepPresses++;
    S.busy = true;
    try {
      if (s.pendingMap) {
        s.pendingMap = false;
        showMap(s.mapI);
        status(`換${s.runs[s.mapI].map.name}，再按一次繼續`, 'info');
        return;
      }
      const run = s.runs[s.mapI];
      const tr = run.result.trace;
      const stops = run.stops;
      let from;
      let to;
      if (stops.length === 0) { from = 0; to = tr.length - 1; s.k = 0; }
      else {
        from = s.k === 0 ? 0 : stops[s.k - 1] + 1;
        to = s.k === stops.length - 1 ? tr.length - 1 : stops[s.k];
        s.k++;
      }
      for (let i = from; i <= to; i++) {
        await playEntry(tr[i]);
        if (s.token !== S.token) return;
      }
      if (s.k >= stops.length) {
        if (run.result.ok && s.mapI < s.runs.length - 1) {
          thumbStatus(s.mapI, true);
          status(`${run.map.name}成功！再按一次換${s.runs[s.mapI + 1].map.name}`, 'ok');
          s.mapI++;
          s.k = 0;
          s.pendingMap = true;
        } else {
          finishSession(s);
        }
      } else {
        status(`第 ${s.k} 步`, 'info');
      }
    } finally {
      S.busy = false;
      updateStepButtons();
    }
  }

  // 上一步：退回前一個動作之後的樣子
  function stepBack() {
    const s = S.session;
    if (S.busy || !s || s.mode !== 'step') return;
    S.res.stepBacks++;
    log('step_back');
    if (s.pendingMap) {
      s.pendingMap = false;
      s.mapI--;
      s.k = s.runs[s.mapI].stops.length;
    }
    if (s.k === 0 && s.mapI > 0) {
      s.mapI--;
      showMap(s.mapI);
      thumbStatus(s.mapI);
      s.k = s.runs[s.mapI].stops.length;
    } else if (s.k > 0) {
      s.k--;
    }
    s.done = false;
    const run = s.runs[s.mapI];
    if (s.k === 0) {
      S.view.setState(RQ.startState(run.map));
      S.ws.highlightBlock(null);
      status('回到起點', 'info');
    } else {
      const e = run.result.trace[run.stops[s.k - 1]];
      S.view.setState(e.state);
      S.ws.highlightBlock(e.id || null);
      status(`第 ${s.k} 步`, 'info');
    }
    updateStepButtons();
  }

  function updateStepButtons() {
    const s = S.session;
    $('btn-back').disabled = !(s && s.mode === 'step' && (s.k > 0 || s.mapI > 0 || s.pendingMap));
  }

  function finishSession(s) {
    s.done = true;
    S.ws.highlightBlock(null);
    const last = s.runs[s.runs.length - 1];
    const multi = S.maps.length > 1;
    if (s.ok) {
      s.runs.forEach((_, i) => thumbStatus(i, true));
      S.view.jump();
      if (S.level.submit) {
        S.res.completed = true;
        status('成功到達終點！可以繼續修改，或按「交出程式」', 'ok');
      } else {
        status(S.idx === 0 ? '成功了！' : '過關！', 'ok');
        setTimeout(() => { if (S.session === s) levelCleared(s); }, 700);
      }
    } else {
      thumbStatus(s.runs.length - 1, false);
      status((multi ? last.map.name + '：' : '') + last.result.message, 'fail');
      S.view.shake();
      // 執行失敗：機器人自動回起點。一步一步走失敗：停在原地，可以按「上一步」往回看
      if (s.mode === 'run') {
        setTimeout(() => {
          if (S.session === s) {
            S.session = null;
            showMap(0);
            updateStepButtons();
          }
        }, 1600);
      }
    }
    updateStepButtons();
  }

  function stopPlayback() {
    S.token++;
    S.session = null;
    S.busy = false;
    if (S.ws) S.ws.highlightBlock(null);
    updateStepButtons();
  }
  function resetView() {
    showMap(0);
    clearThumbStatus();
  }

  $('btn-run').onclick = runAll;
  $('btn-step').onclick = stepForward;
  $('btn-back').onclick = stepBack;
  $('btn-reset').onclick = () => {
    stopPlayback();
    resetView();
    status('');
    log('reset');
  };
  $('btn-speed').onclick = () => {
    S.speed = S.speed === 'slow' ? 'fast' : 'slow';
    $('btn-speed').textContent = S.speed === 'slow' ? '慢速' : '快速';
  };

  // ---------- 過關／跳關／提示／說明 ----------

  function levelCleared(s) {
    const lv = S.level;
    const res = S.res;
    let stars = 0;
    const rule = lv.stars || { type: 'none' };
    if (rule.type === 'runs') stars = res.runs <= (rule.three || 1) ? 3 : res.runs <= (rule.two || 3) ? 2 : 1;
    if (rule.type === 'blocks') stars = s.n <= rule.three ? 3 : s.n <= rule.two ? 2 : 1;
    if (rule.type === 'edit') {
      const d = RQ.editDistance(S.preload, s.prog);
      res.editDistance = d;
      res.rewrote = res.minBlocks !== undefined && res.minBlocks < RQ.countBlocks(S.preload) / 2;
      stars = d <= (rule.three || 1) ? 3 : d <= (rule.two || 3) ? 2 : 1;
    }
    res.cleared = true;
    res.stars = Math.max(res.stars, stars);
    res.blocks = s.n;
    S.programs[S.idx] = RQ.stripIds(s.prog);
    log('level_clear', { stars, blocks: s.n, runs: res.runs });

    const starHtml = stars
      ? `<div class="stars">${[1, 2, 3].map((k) => `<span class="${k <= stars ? 'on' : ''}">${RQ.icon('star', 64)}</span>`).join('')}</div>`
      : '';
    const unlock = S.idx === BOSS && HIDDEN >= 0;
    const nextLabel = unlock ? '挑戰隱藏關卡' : S.idx === BOSS ? '完成' : '下一關';
    const actions = [{ label: nextLabel + RQ.icon('next', 20), primary: true, fn: () => { log('next_level'); nextLevel('cleared'); } }];
    if (rule.type === 'blocks' && stars < 3) {
      actions.unshift({
        label: '再挑戰更少積木',
        fn: () => { res.retryForStars++; log('retry_for_stars'); closeOverlay(); stopPlayback(); resetView(); status(''); },
      });
    }
    let extra = '';
    if (S.idx === 0) extra = '<p>接下來是正式的關卡。</p>';
    if (unlock) extra = '<p><b>你打倒魔王了！發現了一個隱藏關卡。</b></p>';
    openOverlay(S.idx === 0 ? '暖身完成！' : S.idx === BOSS ? '魔王關過關！' : '過關！', starHtml + extra, actions);
  }

  function nextLevel(reason) {
    S.res.exit = reason;
    S.res.timeSpentMs = active() - S.levelStartActive;
    if (!S.programs[S.idx]) S.programs[S.idx] = RQ.stripIds(RQ.compile(S.ws));
    log('level_exit', { reason });
    stopPlayback();
    closeOverlay();
    // 魔王關過關才進隱藏關卡；跳過魔王關、或隱藏關結束，就完成測驗
    if (S.idx === BOSS) {
      if (S.res.cleared && HIDDEN >= 0) enterLevel(HIDDEN);
      else finishTest('all_done');
    } else if (S.level.hiddenLevel) finishTest('all_done');
    else enterLevel(S.idx + 1);
  }

  $('btn-skip').onclick = () => {
    openOverlay('確定要跳過這一關嗎？', '<p>跳過之後就不能回來了。</p>', [
      { label: '繼續挑戰', fn: closeOverlay },
      { label: '跳過', primary: true, fn: () => { S.res.skipped = true; log('skip'); nextLevel('skip'); } },
    ]);
  };

  $('btn-hint').onclick = () => {
    const b = $('hint-bubble');
    if (b.hidden) {
      b.innerHTML = RQ.icon('bulb', 22, 'ico-gold') + '<span>' + S.level.hint + '</span>';
      b.hidden = false;
      if (!S.res.hint) { S.res.hint = true; log('hint'); }
    } else b.hidden = true;
  };
  $('hint-bubble').onclick = () => ($('hint-bubble').hidden = true);

  // 再看一次開始時的說明（時間不會停）
  $('btn-help').onclick = () => {
    $('help-body').innerHTML = $('intro-content').innerHTML;
    $('help').hidden = false;
    stopHand();
    log('help_open');
  };
  function closeHelp() {
    if ($('help').hidden) return;
    $('help').hidden = true;
    log('help_close');
  }
  $('btn-help-close').onclick = closeHelp;

  $('btn-submit').onclick = () => {
    openOverlay('要交出程式嗎？', '<p>交出之後就不能再修改了。</p>', [
      { label: '再想想', fn: closeOverlay },
      { label: '交出', primary: true, fn: () => { doSubmit('button'); nextLevel('submit'); } },
    ]);
  };

  // 第 8 關：交出時在練習地圖與隱藏地圖上測試（學生看不到結果）
  function doSubmit(src) {
    const lv = S.level;
    let prog = RQ.stripIds(RQ.compile(S.ws));
    if (src === 'timeout' && S.lastRun[S.idx]) prog = S.lastRun[S.idx];
    const opts = { lineProgress: !!lv.lineProgress };
    const practice = S.maps.map((m) => RQ.run(prog, m, opts));
    const hidden = RQ.mapsFor(lv, S.variant, 'hidden').map((m) => RQ.run(prog, m, opts));
    S.res.submitted = {
      src,
      completed: practice.every((r) => r.ok),
      progress: practice[0] ? practice[0].progress : 0,
      generalized: hidden.length > 0 && hidden.every((r) => r.ok),
      hiddenProgress: hidden.map((r) => r.progress),
      usesSensor: RQ.usesSensor(prog),
      blocks: RQ.countBlocks(prog),
    };
    S.programs[S.idx] = prog;
    log('submit', S.res.submitted);
  }

  function timeUp() {
    if (S.ending || S.finished) return;
    S.ending = true;
    stopPlayback();
    RQ.closeCard();
    closeHelp();
    if (S.res) {
      S.res.timeout = true;
      if (S.level.submit && !S.res.submitted) doSubmit('timeout');
    }
    log('timeout');
    openOverlay('時間到！', '<p>辛苦了，測驗結束。</p>', []);
    setTimeout(() => {
      closeOverlay();
      if (S.res) {
        S.res.exit = 'timeout';
        S.res.timeSpentMs = active() - S.levelStartActive;
        if (!S.programs[S.idx]) S.programs[S.idx] = RQ.stripIds(RQ.compile(S.ws));
      }
      finishTest('timeout');
    }, 3000);
  }

  function finishTest(reason) {
    S.finished = true;
    log('test_end', { reason, reachedLevel: S.idx });
    stopHand();
    const sub = submission();
    try { localStorage.setItem('rq_result_' + S.student.class + '_' + S.student.seat, JSON.stringify(sub)); } catch (e) { /* 忽略 */ }
    $('done-note').textContent = '請安靜等待老師的指示。';
    show('screen-done');
    uploadFinal();
  }

  // ---------- 上傳到 Firebase（沒設定就略過）----------

  const cloudOn = () => !dev && RQ.cloud && RQ.cloud.enabled && S.student;
  const docId = () => RQ.cloud.docId(S.sessionCode, S.student.class, S.student.seat);

  function syncCloud(status) {
    if (!cloudOn()) return;
    RQ.cloud.upload(docId(), submission(), status).catch((e) => console.warn(e));
  }

  function uploadFinal() {
    if (!cloudOn()) return;
    const msg = { sending: '成績傳送中…', ok: '成績已送出給老師。', fail: '成績還沒傳成功，請告訴老師。' };
    RQ.cloud.onState = (st) => {
      $('cloud-status').hidden = !msg[st];
      $('cloud-status').textContent = msg[st] || '';
      $('btn-retry').hidden = st !== 'fail';
    };
    $('btn-retry').onclick = () => RQ.cloud.flush(true);
    RQ.cloud.upload(docId(), submission(), 'done').catch((e) => console.warn(e));
    // 沒網路或暫時失敗時，每 20 秒自動再試
    const timer = setInterval(() => {
      if (RQ.cloud.state === 'ok') clearInterval(timer);
      else if (RQ.cloud.state === 'fail') RQ.cloud.flush(true);
    }, 20000);
  }

  function submission() {
    return {
      sessionCode: S.sessionCode,
      student: S.student,
      variantSeed: S.variant,
      survey: S.survey,
      startedAt: S.startedIso,
      finishedAt: new Date().toISOString(),
      levels: Object.values(S.results),
      programs: S.programs,
      events: S.events,
      clientInfo: { ua: navigator.userAgent, screen: screen.width + 'x' + screen.height },
      appVersion: CONFIG.appVersion,
    };
  }

  $('btn-download').onclick = () => {
    const blob = new Blob([JSON.stringify(submission(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${S.student.class}_${S.student.seat}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- 視窗 ----------

  function openOverlay(title, html, actions) {
    $('ov-title').textContent = title;
    $('ov-body').innerHTML = html;
    const box = $('ov-actions');
    box.innerHTML = '';
    actions.forEach((a) => {
      const b = document.createElement('button');
      b.innerHTML = a.label;
      if (a.primary) b.className = 'primary';
      b.onclick = a.fn;
      box.appendChild(b);
    });
    $('overlay').hidden = false;
  }
  function closeOverlay() { $('overlay').hidden = true; }

  // ---------- 暖身關的拖曳示範 ----------

  function handDemo() {
    const hand = $('hand');
    const fly = S.ws.getFlyout && S.ws.getFlyout();
    const fb = fly && fly.getWorkspace().getTopBlocks(false)[0];
    const start = RQ.startBlock(S.ws);
    if (!fb || !start) return;
    const a = fb.getSvgRoot().getBoundingClientRect();
    const b = start.getSvgRoot().getBoundingClientRect();
    const r = $('btn-run').getBoundingClientRect();
    const from = { x: a.left + 40, y: a.top + a.height / 2 };
    const to = { x: b.left + 50, y: b.top + 48 };
    const btn = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    const move = (p, dur) => {
      hand.style.transition = dur ? `left ${dur}ms ease, top ${dur}ms ease, transform .2s` : 'none';
      hand.style.left = p.x + 'px';
      hand.style.top = p.y + 'px';
    };
    S.handAlive = true;
    hand.hidden = false;
    (async () => {
      for (let k = 0; k < 3 && S.handAlive; k++) {
        move(from, 0);
        await RQ.wait(400);
        hand.classList.add('press');
        await RQ.wait(300);
        move(to, 900);
        await RQ.wait(1000);
        hand.classList.remove('press');
        await RQ.wait(400);
        move(btn, 800);
        await RQ.wait(900);
        hand.classList.add('press');
        await RQ.wait(300);
        hand.classList.remove('press');
        await RQ.wait(700);
      }
      stopHand();
    })();
  }
  function stopHand() {
    S.handAlive = false;
    $('hand').hidden = true;
  }

  // ---------- 其他 ----------

  window.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('beforeunload', (e) => {
    if (S.startedAt && !S.finished && !dev) { e.preventDefault(); e.returnValue = ''; }
  });
  window.addEventListener('resize', () => { if (S.ws) Blockly.svgResize(S.ws); });

  // 開發模式：index.html?dev 直接進入，左下角可以跳關、切換 A/B、填入參考解
  function renderDev() {
    const d = $('dev');
    d.hidden = false;
    // 參考解只在老師的電腦上（private/answers.js，不公開）才有；公開網站上沒有這個檔案，就不會顯示「填入解答」
    const ans = (RQ.ANSWERS && RQ.ANSWERS[S.level.id]) || {};
    const refs = ans.reference || [];
    const pats = ans.patterns || [];
    d.innerHTML = `DEV <select id="dev-lv">${L.map((lv, i) => `<option value="${i}" ${i === S.idx ? 'selected' : ''}>${i} ${lv.title}</option>`).join('')}</select>
      <button id="dev-ab">變體 ${S.variant}</button>
      ${refs.length || pats.length ? `<select id="dev-sol"><option value="">填入解答…</option>${refs.map((_, i) => `<option value="r${i}">參考解 ${i + 1}</option>`).join('')}${pats.map((p, i) => `<option value="p${i}">${p.note}</option>`).join('')}</select>` : '<span title="找不到 private/answers.js">（沒有解答檔）</span>'}
      <button id="dev-time">時間 +5 分</button>
      <button id="dev-json">事件 ${S.events.length}</button>`;
    $('dev-lv').onchange = (e) => { RQ.closeCard(); closeOverlay(); enterLevel(Number(e.target.value)); };
    $('dev-ab').onclick = () => { S.variant = S.variant === 'A' ? 'B' : 'A'; RQ.closeCard(); enterLevel(S.idx); };
    if ($('dev-sol')) $('dev-sol').onchange = (e) => {
      const v = e.target.value;
      if (!v) return;
      const prog = v[0] === 'r' ? refs[Number(v.slice(1))] : pats[Number(v.slice(1))].prog;
      RQ.closeCard();
      stopPlayback();
      Blockly.Events.disable();
      RQ.loadProgram(S.ws, S.variant === 'B' ? RQ.mirrorProgram(prog) : RQ.normalize(prog));
      Blockly.Events.enable();
      updateCount();
      e.target.value = '';
    };
    $('dev-time').onclick = () => { S.pausedMs += 5 * 60 * 1000; S.ending = false; };
    $('dev-json').onclick = () => console.log(submission());
  }

  if (dev) {
    S.student = { grade: 5, class: '501', seat: 1 };
    S.survey = { experience: 'no', tools: [], level: 0 };
    S.variant = 'A';
    startTest();
    // 老師的電腦上才有 private/answers.js；載入後重畫工具列，才有「填入解答」。公開網站上沒有這個檔案（404 直接略過）。
    const sc = document.createElement('script');
    sc.src = '../private/answers.js';
    sc.onload = () => { if (S.level) renderDev(); };
    document.head.appendChild(sc);
  }
})((window.RQ = window.RQ || {}));
