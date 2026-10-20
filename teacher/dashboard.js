/* 教師後台：三關（組裝、程式、面試）總覽，和單一關卡的全部學生成績與詳細表現
 *
 * 組裝、面試：老師手動輸入（可自訂評分項目）。程式：學生作答後自動評分（shared/scoring.js）。
 * 綜合成績 = 三關加權平均（權重可調，預設 1:1:1）；三關都有分數才排名。
 * 資料讀寫在 store.js。
 */
(function () {
  'use strict';

  const SC = window.RQ.Scoring;
  const AS = window.RQ.AssemblyScoring;
  const T = window.RQT;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round1 = (x) => Math.round(x * 10) / 10;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const parseNum = (v) => { if (v === '' || v === null || v === undefined) return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
  const fmt = (n) => (n === null || n === undefined ? '—' : String(round1(n)));

  const STAGES = [
    { key: 'assembly', name: '組裝', manual: true },
    { key: 'program', name: '程式', manual: false },
    { key: 'interview', name: '面試', manual: true },
  ];
  const MANUAL = ['assembly', 'interview'];
  const NAME = { overview: '總覽', assembly: '組裝', program: '程式', interview: '面試', rubric: '評分標準' };

  const state = {
    view: 'overview',
    session: '',
    cls: '',
    q: '',
    bg: '', // 積木經驗篩選（只用在總覽、程式）
    pickN: 0,
    sort: {
      overview: { key: 'composite', dir: -1 },
      assembly: { key: 'cls', dir: 1 }, // 輸入分數時用班級座號排，不然列會跳來跳去
      interview: { key: 'cls', dir: 1 },
      program: { key: 'total', dir: -1 },
    },
    openKey: null,
    pending: new Map(), // 老師在畫面上新增、還沒輸入分數的學生
    batchOpen: false,
    linkCode: '',
    msg: '',
    people: [],
    byKey: new Map(),
  };

  // ---------- 資料整理：每位學生一列 ----------

  const betterProgram = (a, b) => (a.done !== b.done ? a.done : a.sc.total > b.sc.total);
  const stageRec = (p, st) => (p.doc && p.doc[st] && typeof p.doc[st].score === 'number' ? p.doc[st] : null);

  function buildPeople() {
    const map = new Map();
    const get = (cls, seat, grade) => {
      const key = T.keyOf(cls, seat);
      let p = map.get(key);
      if (!p) { p = { key, cls: String(cls), seat: Number(seat), grade: grade || '', program: null, doc: null }; map.set(key, p); }
      else if (!p.grade && grade) p.grade = grade;
      return p;
    };
    T.allSubs().forEach((sub, id) => {
      if (!sub.student) return;
      if (state.session && (sub.sessionCode || 'default') !== state.session) return;
      const sc = SC.score(sub, T.reviews.get(id) || null);
      const pr = { id, sub, review: T.reviews.get(id) || null, sc, done: sub.status !== 'playing' };
      const p = get(sub.student.class, sub.student.seat, sub.student.grade);
      if (!p.program || betterProgram(pr, p.program)) p.program = pr;
    });
    T.scores.forEach((d) => { if (d.class !== undefined) get(d.class, d.seat, d.grade).doc = d; });
    state.pending.forEach((v) => get(v.cls, v.seat));

    const W = T.config.weights;
    const need = STAGES.filter((s) => Number(W[s.key]) > 0);
    const list = [...map.values()];
    list.forEach((p) => {
      p.s = {
        assembly: stageRec(p, 'assembly') ? p.doc.assembly.score : null,
        program: p.program && p.program.done ? p.program.sc.total : null,
        interview: stageRec(p, 'interview') ? p.doc.interview.score : null,
      };
      const have = need.filter((s) => p.s[s.key] !== null);
      const wsum = have.reduce((a, s) => a + Number(W[s.key]), 0);
      p.composite = wsum ? round1(have.reduce((a, s) => a + Number(W[s.key]) * p.s[s.key], 0) / wsum) : null;
      p.haveN = have.length;
      p.needN = need.length;
      p.complete = need.length > 0 && have.length === need.length;
      p.decision = (p.doc && p.doc.decision) || '';
    });
    // 名次（同分並列）：綜合只排三關齊全的；各關排有分數的
    const rankBy = (arr, val) => {
      const s = arr.filter((p) => val(p) !== null).sort((a, b) => val(b) - val(a));
      s.forEach((p, i) => { p._r = i && val(s[i - 1]) === val(p) ? s[i - 1]._r : i + 1; });
      return s;
    };
    list.forEach((p) => { p.rk = {}; p.rank = null; });
    rankBy(list.filter((p) => p.complete), (p) => p.composite).forEach((p) => { p.rank = p._r; });
    STAGES.forEach((s) => rankBy(list, (p) => p.s[s.key]).forEach((p) => { p.rk[s.key] = p._r; }));
    state.people = list;
    state.byKey = new Map(list.map((p) => [p.key, p]));
  }

  const tie = (a, b) => String(a.cls).localeCompare(String(b.cls), 'zh-Hant', { numeric: true }) || a.seat - b.seat;
  function sortList(list, cols, sort) {
    const col = cols.find((c) => c.key === sort.key) || cols[0];
    return [...list].sort((a, b) => {
      const x = col.val(a), y = col.val(b);
      const xn = x === null || x === undefined, yn = y === null || y === undefined;
      if (xn !== yn) return xn ? 1 : -1; // 沒有資料的放最後
      const c = xn ? 0 : x < y ? -1 : x > y ? 1 : 0;
      return c ? c * sort.dir : tie(a, b);
    });
  }
  function visible(list) {
    const q = state.q.trim().toLowerCase();
    const useBg = state.bg && (state.view === 'overview' || state.view === 'program');
    return list.filter((p) => (!state.cls || p.cls === state.cls) && (!q || `${p.cls} ${p.seat}`.toLowerCase().includes(q)) && (!useBg || bgMatch(p, state.bg)));
  }

  // ---------- 積木經驗（開場問卷）與潛力 ----------

  const svOf = (p) => (p.program && p.program.sub.survey) || null;
  const potOf = (p) => (p.program && p.program.done ? p.program.sc.potential : null);
  function bgMatch(p, v) {
    const sv = svOf(p);
    if (v === 'none') return !sv;
    if (v === 'novice') return !!sv && (sv.experience === 'no' || Number(sv.level) <= 1);
    if (v === 'exp') return !!sv && sv.experience === 'yes' && Number(sv.level) > 1;
    if (v === 'potential') return !!(potOf(p) && potOf(p).tier);
    return true;
  }
  // 「積木經驗」欄：沒接觸過／有（工具）自評 N，加上潛力標籤
  function bgCell(p) {
    if (!p.program) return '<td class="none">—</td>';
    const sc = p.program.sc;
    const pot = potOf(p);
    const tag = pot && pot.tier ? ` <span class="tag ${pot.tier === 2 ? 'pot2' : 'pot1'}" title="${esc(pot.reason)}">★ ${pot.label}</span>` : '';
    return `<td>${esc(sc.surveyText)}${tag}</td>`;
  }
  const thead = (cols, view) => '<tr>' + cols.map((c) => `<th data-sort="${c.key}" class="${c.num ? 'num ' : ''}${state.sort[view].key === c.key ? 'sorted' + (state.sort[view].dir > 0 ? ' asc' : '') : ''}">${c.label}</th>`).join('') + '</tr>';

  // ---------- 提示訊息 ----------

  let toastTimer;
  function toast(text, isErr) {
    let el = $('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
    el.textContent = text;
    el.className = isErr ? 'err' : '';
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 6000 : 1800);
  }
  const guard = (promise, okText) => promise.then(() => { if (okText) toast(okText); return true; }, (e) => { toast('儲存失敗：' + T.errMsg(e), true); return false; });

  // ---------- 畫面骨架 ----------

  function render(force) {
    buildPeople();
    renderFilters();
    renderStats();
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === state.view));
    $('f-pick-wrap').hidden = state.view !== 'overview';
    $('f-bg-wrap').hidden = state.view !== 'overview' && state.view !== 'program';
    $('filters').hidden = state.view === 'rubric';
    $('f-hint').textContent = state.view === 'program' || state.view === 'overview' ? '場次只影響「程式」關的成績' : '';
    // 老師正在表格裡打字時不重畫（雲端有別人的資料進來也不會洗掉輸入）
    const typing = MANUAL.includes(state.view) && $('view').contains(document.activeElement) && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (force || !typing) renderView();
    if (state.openKey && !$('drawer').contains(document.activeElement)) renderDrawer();
  }

  function renderFilters() {
    const subs = [...T.allSubs().values()];
    const sessions = [...new Set(subs.map((s) => s.sessionCode || 'default'))].sort();
    if (state.session && !sessions.includes(state.session)) state.session = '';
    const classes = [...new Set(state.people.map((p) => p.cls))].sort((a, b) => a.localeCompare(b, 'zh-Hant', { numeric: true }));
    if (state.cls && !classes.includes(state.cls)) state.cls = '';
    $('f-session').innerHTML = '<option value="">全部</option>' + sessions.map((s) => `<option ${s === state.session ? 'selected' : ''}>${esc(s)}</option>`).join('');
    $('f-class').innerHTML = '<option value="">全部</option>' + classes.map((c) => `<option ${c === state.cls ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }

  const stat = (n, label) => `<div class="stat"><b>${n}</b><span>${label}</span></div>`;
  const BANDS = [
    { label: '90+', test: (s) => s >= 90, color: '#b8860b' },
    { label: '80–89', test: (s) => s >= 80 && s < 90, color: '#2f7a67' },
    { label: '70–79', test: (s) => s >= 70 && s < 80, color: '#3d7ab0' },
    { label: '60–69', test: (s) => s >= 60 && s < 70, color: '#8a8a5a' },
    { label: '<60', test: (s) => s < 60, color: '#a07040' },
  ];
  const avgOf = (arr) => (arr.length ? round1(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

  function renderStats() {
    const v = state.view;
    const list = state.people;
    let html = '';
    if (v === 'overview') {
      html = stat(list.length, '學生人數') + stat(list.filter((p) => p.complete).length, '三關齊全') + stat(list.filter((p) => potOf(p) && potOf(p).tier).length, '★ 潛力股');
      STAGES.forEach((s) => {
        const sc = list.map((p) => p.s[s.key]).filter((x) => x !== null);
        html += `<div class="stat"><b>${fmt(avgOf(sc))}</b><span>${s.name}平均（${sc.length} 人）</span></div>`;
      });
    } else if (MANUAL.includes(v)) {
      const sc = list.map((p) => p.s[v]).filter((x) => x !== null);
      html = stat(`${sc.length} / ${list.length}`, '已評分') + stat(fmt(avgOf(sc)), '平均') + stat(sc.length ? Math.max(...sc) : '—', '最高') + stat(sc.length ? Math.min(...sc) : '—', '最低');
      html += `<div class="stat dist"><span>分數分布</span><div class="distbar">${sc.length ? BANDS.map((b) => ({ ...b, n: sc.filter(b.test).length })).filter((b) => b.n).map((b) => `<i style="flex:${b.n};background:${b.color}" title="${b.label}：${b.n} 人">${b.label} ${b.n}</i>`).join('') : ''}</div></div>`;
    } else if (v === 'program') {
      const ps = list.filter((p) => p.program);
      const done = ps.filter((p) => p.program.done);
      const sc = done.map((p) => p.program.sc.total);
      const colors = { S: '#b8860b', A: '#2f7a67', B: '#3d7ab0', C: '#8a8a5a', D: '#a07040', E: '#8a8a8a' };
      const dist = SC.GRADES.map((g) => ({ ...g, n: done.filter((p) => p.program.sc.grade === g.grade).length })).filter((d) => d.n);
      html = stat(ps.length, '作答人數') + stat(done.length, '已完成') + stat(ps.length - done.length, '進行中') + stat(fmt(avgOf(sc)), '完成者平均') + stat(sc.length ? Math.max(...sc) : '—', '最高分') + stat(ps.filter((p) => potOf(p) && potOf(p).tier).length, '★ 潛力股')
        + `<div class="stat dist"><span>等級分布（已完成）</span><div class="distbar">${dist.map((d) => `<i style="flex:${d.n};background:${colors[d.grade]}" title="${d.grade} ${d.n} 人">${d.grade} ${d.n}</i>`).join('')}</div></div>`;
    }
    $('stats').innerHTML = html;
  }

  function renderView() {
    const v = state.view;
    const box = $('view');
    if (v !== 'rubric' && T.cloudConfigured && !T.user) {
      box.innerHTML = '<p class="muted pad">請先用右上角「用 Google 登入」。</p>';
      return;
    }
    if (v === 'overview') box.innerHTML = overviewHtml();
    else if (v === 'program') box.innerHTML = programHtml();
    else if (v === 'rubric') box.innerHTML = rubricHtml();
    else box.innerHTML = manualHtml(v);
    if (v === 'program') updateLink();
  }

  // ---------- 總覽：三關大致成績 ----------

  const DEC = { pick: ['入選', 'pick'], wait: ['候補', 'wait'], drop: ['不錄取', 'drop'] };
  const OV_COLS = [
    { key: 'rank', label: '名次', num: true, val: (p) => p.rank },
    { key: 'cls', label: '班級', val: (p) => p.cls },
    { key: 'seat', label: '座號', num: true, val: (p) => p.seat },
    { key: 'assembly', label: '組裝', num: true, val: (p) => p.s.assembly },
    { key: 'program', label: '程式', num: true, val: (p) => p.s.program },
    { key: 'interview', label: '面試', num: true, val: (p) => p.s.interview },
    { key: 'composite', label: '綜合', num: true, val: (p) => (p.composite === null ? null : p.complete ? p.composite : p.composite - 1000) },
    { key: 'bg', label: '積木經驗', val: (p) => (p.program ? p.program.sc.surveyText : null) },
    { key: 'decision', label: '建議／決定', val: (p) => p.composite },
  ];

  function overviewHtml() {
    const list = sortList(visible(state.people), OV_COLS, state.sort.overview);
    const W = T.config.weights;
    const wtxt = STAGES.map((s) => `${s.name} ${W[s.key]}`).join('：');
    const body = list.map((p) => {
      const dec = DEC[p.decision];
      const top = state.pickN > 0 && p.rank && p.rank <= state.pickN;
      const sug = dec ? `<span class="tag ${dec[1]}">${dec[0]}</span>` : top ? '<span class="tag star">★ 建議錄取</span>' : '';
      const cell = (k) => {
        const s = p.s[k];
        if (k === 'program' && p.program && !p.program.done) return '<td class="num"><span class="tag live">進行中</span></td>';
        return `<td class="num ${s === null ? 'none' : ''}">${s === null ? '—' : fmt(s)}</td>`;
      };
      const comp = p.composite === null ? '—' : p.complete ? `<b>${fmt(p.composite)}</b>` : `<span class="partial" title="三關還沒齊，只是已有分數的平均">${fmt(p.composite)}（${p.haveN}/${p.needN}）</span>`;
      return `<tr data-open="${esc(p.key)}" class="${top ? 'top-n' : ''}"><td class="num">${p.rank || '—'}</td><td>${esc(p.cls)}</td><td class="num">${p.seat}</td>${cell('assembly')}${cell('program')}${cell('interview')}<td class="num total">${comp}</td>${bgCell(p)}<td>${sug}</td></tr>`;
    }).join('');
    return `<div class="bar-actions"><span class="muted">綜合 = 三關加權平均（權重 ${esc(wtxt)}，可在「評分標準」調整）；三關都有分數才排名。點一列看個人報告。</span><div class="spacer"></div><button data-act="csv">匯出 CSV</button></div>
      <div class="table-wrap"><table><thead>${thead(OV_COLS, 'overview')}</thead><tbody>${body}</tbody></table></div>
      ${list.length ? '' : `<p class="muted pad">${state.people.length ? '沒有符合篩選條件的資料。' : '還沒有資料。到「組裝」或「面試」分頁新增學生並輸入分數，或讓學生用連結作答程式關。'}</p>`}`;
  }

  // ---------- 組裝／面試：老師手動輸入 ----------

  function manualCols(st) {
    const items = T.config.items[st];
    const cols = [
      { key: 'rank', label: '名次', num: true, val: (p) => p.rk[st] || null },
      { key: 'cls', label: '班級', val: (p) => p.cls },
      { key: 'seat', label: '座號', num: true, val: (p) => p.seat },
    ];
    items.forEach((it, i) => cols.push({ key: 'i' + i, label: `${esc(it.name)}<small>/${it.max}</small>`, num: true, val: (p) => { const r = p.doc && p.doc[st]; return r && r.items && typeof r.items[it.name] === 'number' ? r.items[it.name] : null; } }));
    cols.push({ key: 'score', label: items.length ? '總分（換算 100）' : '分數（0–100）', num: true, val: (p) => p.s[st] });
    cols.push({ key: 'note', label: '備註', val: (p) => (p.doc && p.doc[st] && p.doc[st].note) || null });
    cols.push({ key: 'at', label: '最後更新', val: (p) => (p.doc && p.doc[st] && p.doc[st].at) || null });
    return cols;
  }

  function manualHtml(st) {
    if (st === 'assembly') return assemblyHtml();
    const items = T.config.items[st];
    const cols = manualCols(st);
    const list = sortList(visible(state.people), cols, state.sort[st]);
    const editable = T.canEdit();
    const body = list.map((p) => {
      const rec = (p.doc && p.doc[st]) || {};
      const itemCells = items.map((it, i) => {
        const v = rec.items && typeof rec.items[it.name] === 'number' ? rec.items[it.name] : '';
        return `<td class="num"><input class="cell-in" type="number" min="0" max="${it.max}" step="any" data-i="${i}" value="${v}" ${editable ? '' : 'disabled'}></td>`;
      }).join('');
      const scoreCell = items.length
        ? `<td class="num total score-cell">${fmt(p.s[st])}</td>`
        : `<td class="num"><input class="cell-in" type="number" min="0" max="100" step="any" data-i="0" value="${p.s[st] === null ? '' : p.s[st]}" ${editable ? '' : 'disabled'}></td>`;
      const at = rec.at ? `${new Date(rec.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${esc(String(rec.by || '').split('@')[0])}` : '';
      return `<tr data-key="${esc(p.key)}" data-st="${st}"><td class="num">${p.rk[st] || '—'}</td><td class="link" data-open="${esc(p.key)}">${esc(p.cls)}</td><td class="num link" data-open="${esc(p.key)}">${p.seat}</td>${itemCells}${scoreCell}<td><input class="note-in" type="text" maxlength="200" value="${esc(rec.note || '')}" ${editable ? '' : 'disabled'}></td><td class="muted">${at}</td></tr>`;
    }).join('');
    const itemHint = items.length ? `評分項目：${items.map((i) => `${esc(i.name)}（${i.max}）`).join('、')}；每項都填完才會算出總分。` : '直接輸入 0–100 分。要分項評分，到「評分標準」分頁設定項目。';
    const batchPh = items.length ? `每行一位：班級 座號 ${items.map((i) => i.name).join(' ')} [備註]\n例：501 3 ${items.map((i) => Math.round(i.max * 0.8)).join(' ')}` : '每行一位：班級 座號 分數 [備註]\n例：501 3 85 動手能力強';
    return `<div class="addbar">
        <b>新增學生</b>
        <label>班級 <input id="add-cls" size="6" placeholder="501"></label>
        <label>座號 <input id="add-seat" size="10" placeholder="5　或　1-30"></label>
        <button data-act="add">加入名單</button>
        <button data-act="batch-toggle">${state.batchOpen ? '收起批次貼上' : '批次貼上分數…'}</button>
        <div class="spacer"></div>
        <button data-act="csv">匯出 CSV</button>
      </div>
      <div class="batch" ${state.batchOpen ? '' : 'hidden'}>
        <textarea id="batch-text" rows="6" placeholder="${esc(batchPh)}"></textarea>
        <div><button class="primary" data-act="batch-apply">套用貼上的分數</button> <span class="muted">分隔可以用空白、Tab 或逗號（可直接從 Excel 貼上）</span></div>
      </div>
      <p class="muted">${itemHint}輸入後按 Enter 跳到下一位，離開欄位就自動儲存。</p>
      <div class="table-wrap"><table class="entry"><thead>${thead(cols, st)}</thead><tbody>${body}</tbody></table></div>
      ${list.length ? '' : `<p class="muted pad">${state.people.length ? '沒有符合篩選條件的資料。' : `還沒有學生。請在上面「新增學生」輸入班級與座號（座號可寫 1-30 一次加入整班）。`}</p>`}`;
  }

  // ---------- 組裝（Lego Quest）：老師檢查作品後只要勾選等級，分數由 shared/assembly-scoring.js 決定 ----------

  const legoOf = (p) => (p.program && p.program.sub && p.program.sub.assembly) || null;
  const durMs = (a) => (a && a.build && typeof a.build.durationMs === 'number' ? a.build.durationMs : null);

  /** 學生的 Lego Quest 狀態（學生端每次改變就上傳，所以是接近即時的） */
  function legoStatus(a) {
    if (!a) return { text: '—', cls: 'muted' };
    if (a.skipped) return { text: '跳過', cls: 'muted' };
    switch (a.phase) {
      case 'count': case 'ready': return { text: '清點中', cls: 'live' };
      case 'shortage_pending': return { text: '缺件待處理', cls: 'ng' };
      case 'countdown': return { text: '倒數中', cls: 'live' };
      case 'building': return { text: '組裝中', cls: 'live' };
      default: return a.build && a.build.timedOut ? { text: '逾時，待檢查', cls: 'ng' } : { text: '已完成，待檢查', cls: 'ok' };
    }
  }

  const ASM_COLS = [
    { key: 'rank', label: '名次', num: true, val: (p) => p.rk.assembly || null },
    { key: 'cls', label: '班級', val: (p) => p.cls },
    { key: 'seat', label: '座號', num: true, val: (p) => p.seat },
    { key: 'lego', label: 'Lego 狀態', val: (p) => legoStatus(legoOf(p)).text },
    { key: 'dur', label: '組裝用時', num: true, val: (p) => durMs(legoOf(p)) },
    { key: 'grade', label: '檢查結果（勾選）', val: (p) => p.s.assembly },
    { key: 'score', label: '分數', num: true, val: (p) => p.s.assembly },
    { key: 'note', label: '備註', val: (p) => (p.doc && p.doc.assembly && p.doc.assembly.note) || null },
    { key: 'at', label: '最後更新', val: (p) => (p.doc && p.doc.assembly && p.doc.assembly.at) || null },
  ];

  /** 檢查結果的下拉選單。手動輸入過分數（沒有等級）的舊資料，顯示成「手動 N 分」 */
  function gradeSelect(rec, dis) {
    const cur = rec && rec.grade;
    const legacy = rec && !cur && typeof rec.score === 'number';
    return `<select class="grade-sel" ${dis}>
      <option value="">（未檢查）</option>
      ${AS.GRADES.map((g) => `<option value="${g.key}" ${cur === g.key ? 'selected' : ''}>${esc(g.label)}（${g.score}）</option>`).join('')}
      ${legacy ? `<option value="__legacy" selected disabled>手動輸入 ${fmt(rec.score)} 分</option>` : ''}
    </select>`;
  }

  /** 缺件待處理的同學：老師到學生旁邊用「老師面板」（Ctrl+Shift+L）處理 */
  function asmAlerts(list) {
    const rows = list.filter((p) => { const a = legoOf(p); return a && a.phase === 'shortage_pending'; }).map((p) => {
      const rs = legoOf(p).count.shortageReports;
      const last = rs[rs.length - 1];
      return `<b>${esc(p.cls)} 班 ${p.seat} 號</b>（${last.items.map((i) => `${esc(i.bag)} 袋缺 ${i.short} 顆`).join('、')}）`;
    });
    return rows.length ? `<div class="asm-alert"><b>缺件待處理：</b>${rows.join('；')}。請到該同學的電腦按 Ctrl+Shift+L 輸入老師密碼，選「已補件」或「沒有缺件（誤報）」。</div>` : '';
  }

  function assemblyHtml() {
    const st = 'assembly';
    const list = sortList(visible(state.people), ASM_COLS, state.sort[st]);
    const editable = T.canEdit();
    const dis = editable ? '' : 'disabled';
    const body = list.map((p) => {
      const rec = (p.doc && p.doc[st]) || {};
      const a = legoOf(p);
      const ls = legoStatus(a);
      const at = rec.at ? `${new Date(rec.at).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} ${esc(String(rec.by || '').split('@')[0])}` : '';
      return `<tr data-key="${esc(p.key)}" data-st="${st}"><td class="num">${p.rk[st] || '—'}</td><td class="link" data-open="${esc(p.key)}" data-sec="assembly">${esc(p.cls)}</td><td class="num link" data-open="${esc(p.key)}" data-sec="assembly">${p.seat}</td>
        <td><span class="${ls.cls}">${esc(ls.text)}</span></td><td class="num">${durMs(a) !== null ? mmss(durMs(a)) : ''}</td>
        <td>${gradeSelect(rec, dis)}</td><td class="num total score-cell">${fmt(p.s[st])}</td>
        <td><input class="note-in" type="text" maxlength="200" value="${esc(rec.note || '')}" ${dis}></td><td class="muted">${at}</td></tr>`;
    }).join('');
    const legend = AS.GRADES.map((g) => `<b>${esc(g.label)}</b> ${g.score} 分（${esc(g.hint)}）`).join('　');
    return `${asmAlerts(list)}<div class="addbar">
        <b>新增學生</b>
        <label>班級 <input id="add-cls" size="6" placeholder="501"></label>
        <label>座號 <input id="add-seat" size="10" placeholder="5　或　1-30"></label>
        <button data-act="add">加入名單</button>
        <div class="spacer"></div>
        <a class="btnlink" href="labels.html" target="_blank">列印袋子標籤</a>
        <button data-act="csv">匯出 CSV</button>
      </div>
      <p class="muted">學生做完 Lego Quest 後，老師檢查作品，在「檢查結果」勾選等級就好，離開欄位自動儲存。${legend}。用時、翻頁與放大次數、缺件回報只給老師參考，不計分。</p>
      <div class="table-wrap"><table class="entry"><thead>${thead(ASM_COLS, st)}</thead><tbody>${body}</tbody></table></div>
      ${list.length ? '' : `<p class="muted pad">${state.people.length ? '沒有符合篩選條件的資料。' : '還沒有學生。學生登入後會自動出現，或在上面「新增學生」輸入班級與座號（座號可寫 1-30 一次加入整班）。'}</p>`}`;
  }

  function saveAssemblyRow(tr, p) {
    const sel = tr.querySelector('.grade-sel').value;
    if (sel === '__legacy') return;
    const g = AS.byKey(sel);
    const note = tr.querySelector('.note-in').value.trim();
    const rec = (p.doc && p.doc.assembly) || null;
    if (rec && (rec.grade || null) === (g ? g.key : null) && (rec.note || '') === note && (rec.grade || !g)) return; // 沒改就不寫入
    if (!rec && !g && !note) return;
    guard(T.saveStage(p, 'assembly', { score: g ? g.score : null, grade: g ? g.key : null, items: {}, note }), '已儲存 ✓');
  }

  /** 個人報告裡的組裝：學生的 Lego Quest 紀錄 + 勾選等級 */
  function assemblySection(p) {
    const a = legoOf(p);
    const rec = (p.doc && p.doc.assembly) || {};
    const dis = T.canEdit() ? '' : 'disabled';
    let info = '<p class="muted">沒有 Lego Quest 的紀錄（學生沒做、或不在目前篩選的場次）。仍然可以直接勾選等級。</p>';
    if (a) {
      const ls = legoStatus(a);
      const b = a.build;
      const reports = (a.count && a.count.shortageReports) || [];
      const rText = reports.length
        ? reports.map((r) => `${r.items.map((i) => `${esc(i.bag)} 袋缺 ${i.short} 顆`).join('、')} → ${r.resolution === 'restocked' ? '已補件' : r.resolution === 'false_alarm' ? '<span class="ng">誤報</span>' : '<span class="ng">待處理</span>'}`).join('；')
        : '沒有';
      const seeded = a.count && a.count.seededShortage;
      const dwell = b && b.stepDwellMs ? b.stepDwellMs.map((ms, i) => `<span class="dw" title="第 ${i + 1} 步">${i + 1}:${Math.round(ms / 1000)}s</span>`).join(' ') : '';
      const ack = p.program && p.program.sub && p.program.sub.rulesAck;
      info = `<div class="bgbox"><b>Lego Quest：</b><span class="${ls.cls}">${esc(ls.text)}</span>${a.skipped ? '（老師跳過）' : ''}
        <div class="muted">考試說明：${ack ? `已確認「理解並能遵守」（${esc(new Date(ack.at).toLocaleTimeString('zh-TW'))}）` : '<span class="ng">沒有確認紀錄</span>'}</div>
        <div class="muted">清點用時 ${a.count && a.count.durationMs != null ? mmss(a.count.durationMs) : '—'}　缺件回報：${rText}${seeded ? `　<b>被故意少放 ${esc(seeded.bag)} 袋 ${seeded.short} 顆，${seeded.noticed ? '有發現' : '<span class="ng">沒發現</span>'}</b>` : ''}</div>
        ${b ? `<div class="muted">組裝用時 ${b.durationMs != null ? mmss(b.durationMs) : '進行中'}${b.timedOut ? '（<span class="ng">逾時</span>）' : ''}　結束在第 ${b.finishedAtStep || '—'} 步（最遠到第 ${b.maxStepReached} 步）　上一步 ${b.backNavCount} 次　放大 ${b.zoomCount} 次</div>
        <div class="muted">各步停留（秒）：${dwell}</div>` : ''}</div>`;
    }
    const opts = AS.GRADES.map((g) => `<label class="gopt ${rec.grade === g.key ? 'on' : ''}"><input type="radio" name="asm-grade" value="${g.key}" ${rec.grade === g.key ? 'checked' : ''} ${dis}><b>${esc(g.label)}</b><span>${g.score} 分</span><small>${esc(g.hint)}</small></label>`).join('');
    const legacy = !rec.grade && typeof rec.score === 'number' ? `<p class="muted">目前是手動輸入的 ${fmt(rec.score)} 分（沒有勾選等級）；勾選等級會取代它。</p>` : '';
    const at = rec.at ? `最後更新 ${new Date(rec.at).toLocaleString('zh-TW')}（${esc(rec.by || '')}）` : '';
    return `${info}<div class="gopts" id="asm-gopts">${opts}</div>${legacy}
      <div class="review mform"><label>備註</label><textarea id="asm-note" class="note-area" ${dis}>${esc(rec.note || '')}</textarea></div>
      <div class="d-actions"><button class="primary" data-act="save-assembly" ${dis}>儲存組裝檢查結果</button><button data-act="clear-assembly" ${dis}>清除勾選</button><span class="muted">${at}</span></div>`;
  }

  /** 把表單的原始輸入算成分數。vals 對應評分項目（沒有項目時只有一格 0–100 分） */
  function computeStage(st, vals) {
    const items = T.config.items[st];
    if (!items.length) {
      const v = parseNum(vals[0]);
      return { score: v === null ? null : clamp(round1(v), 0, 100), items: {} };
    }
    const out = {};
    let filled = 0, total = 0, maxSum = 0;
    items.forEach((it, i) => {
      maxSum += it.max;
      const v = parseNum(vals[i]);
      if (v !== null) { const c = clamp(v, 0, it.max); out[it.name] = c; filled++; total += c; }
    });
    return { score: filled === items.length ? round1((100 * total) / maxSum) : null, items: out };
  }

  function saveRow(tr) {
    const p = state.byKey.get(tr.dataset.key);
    if (!p) return;
    const st = tr.dataset.st;
    if (st === 'assembly') { saveAssemblyRow(tr, p); return; }
    const vals = [...tr.querySelectorAll('.cell-in')].map((i) => i.value);
    const note = tr.querySelector('.note-in').value.trim();
    const r = computeStage(st, vals);
    // 已經有資料、這次完全沒改（例如只是點進去又離開）就不寫入
    const rec = (p.doc && p.doc[st]) || null;
    if (rec && rec.note === note && (rec.score === null ? r.score === null : rec.score === r.score) && JSON.stringify(rec.items || {}) === JSON.stringify(r.items)) return;
    if (!rec && r.score === null && !note && !Object.keys(r.items).length) return;
    guard(T.saveStage(p, st, { score: r.score, items: r.items, note }), '已儲存 ✓');
  }

  // 批次貼上
  function batchApply() {
    const st = state.view;
    const items = T.config.items[st];
    const nVals = items.length || 1;
    const lines = $('batch-text').value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const jobs = [];
    const bad = [];
    lines.forEach((line, ln) => {
      const t = line.split(/[\s,，、\t]+/).filter(Boolean);
      const cls = t[0], seat = parseNum(t[1]);
      const vals = t.slice(2, 2 + nVals);
      const note = t.slice(2 + nVals).join(' ');
      if (!cls || seat === null || seat < 1 || vals.length < nVals || vals.some((v) => parseNum(v) === null)) { bad.push(`第 ${ln + 1} 行`); return; }
      const person = state.byKey.get(T.keyOf(cls, seat)) || { key: T.keyOf(cls, seat), cls, seat, grade: '' };
      const r = computeStage(st, vals);
      jobs.push(T.saveStage(person, st, { score: r.score, items: r.items, note }));
    });
    if (!jobs.length) { toast(bad.length ? `看不懂：${bad.join('、')}` : '沒有可以套用的資料', true); return; }
    Promise.all(jobs).then(() => {
      toast(`已套用 ${jobs.length} 筆${bad.length ? `，略過 ${bad.join('、')}` : ''}`, false);
      $('batch-text').value = '';
    }, (e) => toast('儲存失敗：' + T.errMsg(e), true));
  }

  function addStudents() {
    const cls = $('add-cls').value.trim();
    const seatText = $('add-seat').value.trim();
    const seats = new Set();
    seatText.split(/[,，、\s]+/).filter(Boolean).forEach((part) => {
      const m = part.match(/^(\d+)\s*[-~－～]\s*(\d+)$/);
      if (m) { for (let i = Number(m[1]); i <= Math.min(Number(m[2]), 80); i++) seats.add(i); }
      else if (/^\d+$/.test(part)) seats.add(Number(part));
    });
    if (!cls || !seats.size) { toast('請填班級，座號可寫 5 或 1-30', true); return; }
    seats.forEach((s) => state.pending.set(T.keyOf(cls, s), { cls, seat: s }));
    toast(`已加入 ${seats.size} 位`);
    render(true);
  }

  // ---------- 程式：自動評分（全部學生的詳細表現） ----------

  const PG_COLS = [
    { key: 'rank', label: '名次', num: true, val: (p) => p.rk.program || null },
    { key: 'cls', label: '班級', val: (p) => p.cls },
    { key: 'seat', label: '座號', num: true, val: (p) => p.seat },
    { key: 'state', label: '狀態', val: (p) => (p.program.done ? 1 : 0) },
    { key: 'reached', label: '到達', num: true, val: (p) => p.program.sc.reached },
    { key: 'cleared', label: '過關', num: true, val: (p) => p.program.sc.cleared },
    { key: 'hidden', label: '隱藏', val: (p) => (p.program.sc.hidden.generalized ? 2 : p.program.sc.hidden.completed ? 1 : 0) },
    { key: 'total', label: '總分', num: true, val: (p) => p.program.sc.total },
    { key: 'grade', label: '等級', val: (p) => p.program.sc.total },
    { key: 'pick', label: '建議', val: (p) => p.program.sc.total },
    { key: 'bg', label: '積木經驗', val: (p) => p.program.sc.surveyText },
  ];

  function programHtml() {
    const list = sortList(visible(state.people.filter((p) => p.program)), PG_COLS, state.sort.program);
    const body = list.map((p) => {
      const pr = p.program, s = pr.sc;
      return `<tr data-open="${esc(p.key)}" data-sec="program"><td class="num">${pr.done ? p.rk.program || '—' : '—'}</td><td>${esc(p.cls)}</td><td class="num">${p.seat}</td><td>${pr.done ? '完成' : '<span class="tag live">進行中</span>'}</td>
        <td class="num">${s.reached || '—'}</td><td class="num">${s.cleared} / ${SC.MAIN_IDS.length}</td>
        <td>${s.hidden.generalized ? '通用化 ✓' : s.hidden.completed ? '練習過關' : s.hidden.visited ? '挑戰中' : '—'}</td>
        <td class="num total">${s.total}</td><td><span class="grade g-${s.grade}">${s.grade}</span></td><td>${esc(s.pick)}</td>${bgCell(p)}</tr>`;
    }).join('');
    const empty = state.people.some((p) => p.program) ? '沒有符合篩選條件的資料。' : '還沒有程式關的成績。請讓學生用連結作答，或「匯入結果檔」。';
    return `<div class="bar-actions"><span class="muted">程式關由系統自動評分（標準見「評分標準」）。點一列看每一關的詳細表現與學生的程式。</span><div class="spacer"></div><button data-act="import">匯入結果檔…</button><button data-act="csv">匯出 CSV</button></div>
      <div class="linkbox"><label>學生連結（場次代碼 <input id="link-code" placeholder="例如 1015" size="10" value="${esc(state.linkCode)}">）</label><input id="link-url" readonly><button data-act="copy">複製</button></div>
      <div class="table-wrap"><table><thead>${thead(PG_COLS, 'program')}</thead><tbody>${body}</tbody></table></div>
      ${list.length ? '' : `<p class="muted pad">${empty}</p>`}`;
  }

  function updateLink() {
    const u = $('link-url');
    if (!u) return;
    const base = location.href.replace(/teacher\/[^/]*$/, '').replace(/[?#].*$/, '');
    u.value = `${base}mockup/index.html${state.linkCode ? '?s=' + encodeURIComponent(state.linkCode) : ''}`;
  }

  // ---------- 評分標準與設定 ----------

  function rubricHtml() {
    const W = T.config.weights;
    const wIn = STAGES.map((s) => `<label>${s.name} <input type="number" min="0" max="10" step="0.5" data-w="${s.key}" value="${Number(W[s.key])}" style="width:70px"></label>`).join('　');
    const itemTxt = (st) => T.config.items[st].map((i) => `${i.name},${i.max}`).join('\n');
    const dim = SC.DIMENSIONS.map((d) => `<tr><td><b>${d.key}</b></td><td>${esc(d.name)}</td><td class="num">${d.max}</td><td>${esc(d.desc)}</td></tr>`).join('');
    const lv = SC.MAIN_IDS.map((i) => `<tr><td class="num">${i}</td><td>${esc(SC.TITLES[i])}</td><td>${esc(SC.LEVELS[i].concept)}</td><td class="num">${SC.LEVELS[i].weight}</td><td>${SC.LEVELS[i].skills.map((k) => esc(SC.SKILLS.find((s) => s.key === k).name)).join('、')}</td></tr>`).join('');
    const gr = SC.GRADES.map((g, i) => `<tr><td><span class="grade g-${g.grade}">${g.grade}</span></td><td>${g.min}${i === 0 ? ' ~ 100' : ` ~ ${SC.GRADES[i - 1].min - 1}`}</td><td>${esc(g.label)}</td><td>${esc(g.pick)}</td></tr>`).join('');
    const disabled = T.canEdit() ? '' : 'disabled';
    return `<div id="rubric">
      <h2>綜合成績（三關加權平均）</h2>
      <p>綜合 = 組裝、程式、面試的加權平均，滿分 100。權重為 0 的關卡不列入。三關（權重 &gt; 0）都有分數才排名。</p>
      <p>${wIn} <button class="primary" data-act="save-weights" ${disabled}>儲存權重</button></p>

      <h2>組裝（Lego Quest）：老師勾選等級</h2>
      <p>學生拼完吉他後，老師檢查作品，勾選下面其中一個等級，分數就固定了。用時、翻頁與放大次數、缺件回報只給老師參考，不計分。分數可以在 <code>shared/assembly-scoring.js</code> 的 <code>GRADES</code> 調整。</p>
      <table><thead><tr><th>等級</th><th class="num">分數</th><th>什麼時候勾</th></tr></thead><tbody>${AS.GRADES.map((g) => `<tr><td><b>${esc(g.label)}</b></td><td class="num">${g.score}</td><td>${esc(g.hint)}</td></tr>`).join('')}</tbody></table>

      <h2>面試：評分項目（選填）</h2>
      <p>預設是直接輸入 0–100 分。想分項評分（例如面試的「表達」「態度」），每行寫「項目名稱,滿分」，總分會自動換算成 100。留空 = 直接輸入分數。改項目不會影響已輸入的總分。</p>
      <div class="items-edit">
        <div><b>面試</b><textarea id="items-interview" rows="5" placeholder="例：表達,10&#10;學習態度,10&#10;動機,10">${esc(itemTxt('interview'))}</textarea></div>
      </div>
      <p><button class="primary" data-act="save-items" ${disabled}>儲存評分項目</button></p>

      <h2>程式關（自動評分）：總分 100 分，五個面向</h2>
      <table><thead><tr><th></th><th>面向</th><th class="num">滿分</th><th>怎麼算</th></tr></thead><tbody>${dim}</tbody></table>
      <h2>第 1–8 關的權重與新概念</h2>
      <table><thead><tr><th class="num">關</th><th>名稱</th><th>新概念（觀念運用看這個）</th><th class="num">權重</th><th>對應能力</th></tr></thead><tbody>${lv}</tbody></table>
      <p class="muted">權重合計 55，越後面的關卡越難，分數越高。星等：第 1、3 關看執行次數（一次過 3 星）；第 5 關程式較長，3 次內成功 3 星、6 次內 2 星；第 2、4、6、7 關看積木數；魔王關（第 8 關）看改動塊數。</p>
      <h2>程式關等級與建議</h2>
      <table><thead><tr><th>等級</th><th>分數</th><th>說明</th><th>建議</th></tr></thead><tbody>${gr}</tbody></table>
      <h2>六項能力（只供參考，不計入總分）</h2>
      <p>${SC.SKILLS.map((s) => esc(s.name)).join('、')}。每一項是相關關卡的達成度加權平均：過關 60% ＋ 星等最多 40%，沒過關按往終點前進的比例最多 25%。</p>
      <h2>積木經驗與「潛力股」</h2>
      <p>學生登入後、說明前，會先回答：有沒有玩過積木程式（Scratch、Blockly、LEGO 等）與自評熟悉度 1–5。這份調查<b>不計分</b>，用來找「沒接觸過、但短時間看說明就上手」的學生。</p>
      <ul>
        <li><b>新手</b>：沒接觸過，或自評 1（只在電腦課接觸過）。</li>
        <li><b>★ 高潛力</b>：新手，且程式關過 ${SC.POTENTIAL.high.cleared} 關以上，或總分 ≥ ${SC.POTENTIAL.high.total}。</li>
        <li><b>★ 有潛力</b>：新手，且過 ${SC.POTENTIAL.some.cleared} 關以上，或總分 ≥ ${SC.POTENTIAL.some.total}。</li>
        <li>只計入「已完成」的作答。門檻在 <code>shared/scoring.js</code> 的 <code>POTENTIAL</code>，用第一批真實資料校正。</li>
        <li>總表和程式分頁可用「積木經驗」篩選只看潛力股；個人報告會列出自評內容與過關關卡的平均用時。</li>
      </ul>
      <h2>注意事項</h2>
      <ul>
        <li>這是<b>篩選用的參考分數</b>。程式關時間只有 10 分鐘，做不完是正常的。</li>
        <li>「過關太快」「跳過」只做提醒，不扣分。</li>
        <li>程式關可在個人報告加減分（±20）；最後入選與否由老師在個人報告決定，會蓋過建議。</li>
        <li>評分版本：${esc(SC.VERSION)}（程式關標準在 <code>shared/scoring.js</code>，調整後所有人立刻重算）。</li>
      </ul></div>`;
  }

  function saveWeights() {
    const w = {};
    document.querySelectorAll('[data-w]').forEach((i) => { const n = parseNum(i.value); w[i.dataset.w] = n === null ? 1 : clamp(n, 0, 10); });
    if (!Object.values(w).some((x) => x > 0)) { toast('至少要有一關的權重大於 0', true); return; }
    guard(T.saveConfig({ ...T.config, weights: w }), '權重已儲存 ✓');
  }
  function parseItems(text) {
    const out = [];
    const bad = [];
    text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line, i) => {
      const m = line.match(/^(.+?)[,，\t\s]+(\d+(?:\.\d+)?)$/);
      if (!m || Number(m[2]) <= 0) bad.push(`第 ${i + 1} 行`);
      else out.push({ name: m[1].trim().slice(0, 20), max: Number(m[2]) });
    });
    return { out, bad };
  }
  function saveItems() {
    // 組裝改成老師勾選等級，不再有評分項目；原本的設定原樣保留
    const a = { out: T.config.items.assembly || [], bad: [] }, b = parseItems($('items-interview').value);
    if (b.bad.length) { toast(`格式不對：面試 ${b.bad.join('、')}（要寫「名稱,滿分」）`, true); return; }
    const dup = (arr) => new Set(arr.map((i) => i.name)).size !== arr.length;
    if (dup(b.out)) { toast('項目名稱不能重複', true); return; }
    guard(T.saveConfig({ ...T.config, items: { assembly: a.out, interview: b.out } }), '評分項目已儲存 ✓');
  }

  // ---------- 個人報告 ----------

  function openDrawer(key, sec) {
    state.openKey = key;
    state.msg = '';
    $('drawer').hidden = false;
    $('shade').hidden = false;
    renderDrawer();
    if (sec) { const el = $('sec-' + sec); if (el) el.scrollIntoView(); } else $('drawer').scrollTop = 0;
  }
  function closeDrawer() {
    state.openKey = null;
    $('drawer').hidden = true;
    $('shade').hidden = true;
  }
  $('shade').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.openKey) closeDrawer(); });

  const mmss = (ms) => (ms === undefined || ms === null ? '—' : `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`);
  const starsHtml = (n) => `<span class="star">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>`;

  function manualForm(p, st) {
    const items = T.config.items[st];
    const rec = (p.doc && p.doc[st]) || {};
    const dis = T.canEdit() ? '' : 'disabled';
    const inputs = items.length
      ? items.map((it, i) => `<label>${esc(it.name)} <small>/ ${it.max}</small></label><input class="cell-in" type="number" min="0" max="${it.max}" step="any" data-i="${i}" value="${rec.items && typeof rec.items[it.name] === 'number' ? rec.items[it.name] : ''}" ${dis}>`).join('')
      : `<label>分數 <small>/ 100</small></label><input class="cell-in" type="number" min="0" max="100" step="any" data-i="0" value="${p.s[st] === null ? '' : p.s[st]}" ${dis}>`;
    const at = rec.at ? `最後更新 ${new Date(rec.at).toLocaleString('zh-TW')}（${esc(rec.by || '')}）` : '';
    return `<div class="review mform" data-st="${st}">${inputs}<label>備註</label><textarea class="note-area" ${dis}>${esc(rec.note || '')}</textarea></div>
      <div class="d-actions"><button class="primary" data-act="save-stage" data-st="${st}" ${dis}>儲存${NAME[st]}分數</button>${items.length ? `<span class="muted">總分：${fmt(p.s[st])}</span>` : ''}<span class="muted">${at}</span></div>`;
  }

  function programSection(p) {
    const pr = p.program;
    if (!pr) return '<p class="muted">還沒有程式關的成績（學生還沒作答，或不在目前篩選的場次）。</p>';
    const { sub, sc } = pr;
    const rev = pr.review || {};
    const programs = sub.programs || {};
    const dimRows = SC.DIMENSIONS.map((d) => `<div>${d.key} ${d.name}</div><div class="bar" title="${esc(d.desc)}"><i style="width:${(100 * sc.dims[d.key]) / d.max}%"></i></div><div class="v">${sc.dims[d.key]} / ${d.max}</div>`).join('');
    const skillRows = sc.skills.map((k) => `<div>${esc(k.name)}</div><div class="bar sk"><i style="width:${k.pct}%"></i></div><div class="v">${k.pct}%</div>`).join('');
    const lvRows = sc.levels.map((l) => {
      const result = l.cleared ? `<span class="ok">過關</span> ${starsHtml(l.stars)}` : l.skipped ? '<span class="ng">跳過</span>' : l.visited ? '<span class="ng">未過</span>' : '<span class="muted">未玩</span>';
      const concept = l.cleared ? (l.usedConcept ? '<span class="ok">✓</span>' : '<span class="ng">✗</span>') : '';
      return `<tr><td>${l.id}</td><td>${esc(l.title)}</td><td>${esc(l.concept)}</td><td>${result}</td><td>${concept}</td><td>${l.visited ? mmss(l.timeSpentMs) : ''}</td><td>${l.visited ? l.runs : ''}</td><td>${l.cleared ? l.blocks : ''}</td><td>${l.hint ? '有' : ''}</td><td>${(l.a + l.b + l.c).toFixed(1)}</td></tr>`;
    }).join('');
    const h = sc.hidden;
    const hiddenHtml = h.visited
      ? `練習地圖 ${h.completed ? '<span class="ok">過關</span>' : `<span class="ng">未過（走到 ${Math.round(100 * h.progress)}%）</span>`}；隱藏地圖 ${h.generalized ? '<span class="ok">過關（通用化）</span>' : '<span class="ng">未過</span>'}；${h.usesSensor ? '有用感測器' : '沒用感測器'}；${h.blocks} 塊積木${h.src === 'timeout' ? '（時間到自動交出）' : ''}。得分 ${(h.e1 + h.e2).toFixed(1)} / 15`
      : '<span class="muted">沒有進入隱藏關卡</span>';
    const progHtml = [...sc.levels.map((l) => l.id), 9].filter((id) => programs[id] && programs[id].length).map((id) => {
      const name = id === 9 ? '隱藏：循線挑戰' : `第 ${id} 關 ${SC.TITLES[id]}`;
      return `<details><summary>${esc(name)}（最後的程式）</summary><pre class="prog">${esc(SC.programText(programs[id]).join('\n'))}</pre></details>`;
    }).join('');
    const when = sub.finishedAt ? new Date(sub.finishedAt).toLocaleString('zh-TW') : sub.updatedAtMs ? '最後更新 ' + new Date(sub.updatedAtMs).toLocaleString('zh-TW') : '';
    const dis = T.canEdit() ? '' : 'disabled';
    const clearedRows = sc.levels.filter((l) => l.cleared && typeof l.timeSpentMs === 'number');
    const avgMs = clearedRows.length ? clearedRows.reduce((a, l) => a + l.timeSpentMs, 0) / clearedRows.length : null;
    const pot = sc.potential;
    const bgBox = `<div class="bgbox ${pot.tier ? 'pot' : ''}"><b>積木程式經驗（開場自評）：</b>${esc(sc.surveyText)}
      ${avgMs !== null ? `<span class="muted">　過關的 ${clearedRows.length} 關，平均每關 ${mmss(avgMs)}</span>` : ''}
      ${pot.tier ? `<div class="potline">★ ${pot.label}：${esc(pot.reason)}</div>` : ''}</div>`;
    return `${bgBox}<div class="d-head"><span class="grade g-${sc.grade}">${sc.grade}</span><span>${esc(sc.gradeLabel)}・建議：${esc(sc.pick)}</span><div class="spacer"></div>
        <div class="d-score small">${sc.total}<small> / 100</small></div></div>
      <div class="muted">場次 ${esc(sub.sessionCode || 'default')}・${esc(sub.variantSeed || '')} 版・${pr.done ? '已完成' : '進行中'}・${esc(when)}${sc.adjust ? `・含加減分 ${sc.adjust > 0 ? '+' : ''}${sc.adjust}（原始 ${sc.raw}）` : ''}</div>
      <div class="comment" style="margin-top:8px">${esc(sc.comment)}</div>
      ${sc.flags.length ? `<ul class="flags">${sc.flags.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      <h4>五個面向</h4><div class="bars">${dimRows}</div>
      <h4>六項能力（不計入總分）</h4><div class="bars">${skillRows}</div>
      <h4>各關表現</h4>
      <table class="lv"><thead><tr><th>關</th><th>名稱</th><th>新概念</th><th>結果</th><th>用到</th><th>用時</th><th>執行</th><th>積木</th><th>提示</th><th>得分</th></tr></thead><tbody>${lvRows}</tbody></table>
      <p style="margin:8px 0 0">隱藏關卡：${hiddenHtml}</p>
      <h4>學生最後的程式</h4>${progHtml || '<span class="muted">沒有程式紀錄</span>'}
      <h4>老師調整（只影響程式關分數）</h4>
      <div class="review"><label for="rv-adjust">加減分</label>
        <span><input id="rv-adjust" type="number" min="-20" max="20" step="1" value="${Number(rev.adjust) || 0}" style="width:80px" ${dis}> <span class="muted">（−20 ~ +20，程式關總分仍限 0–100）</span></span>
        <label for="rv-note">備註</label><textarea id="rv-note" ${dis}>${esc(rev.note || '')}</textarea></div>
      <div class="d-actions"><button class="primary" data-act="save-review" ${dis}>儲存程式關調整</button></div>`;
  }

  function renderDrawer() {
    const p = state.byKey.get(state.openKey);
    if (!p) { closeDrawer(); return; }
    const W = T.config.weights;
    const cards = STAGES.map((s) => {
      const v = p.s[s.key];
      const live = s.key === 'program' && p.program && !p.program.done;
      return `<div class="scard"><span>${s.name}${Number(W[s.key]) !== 1 ? `（權重 ${W[s.key]}）` : ''}</span><b>${live ? '進行中' : fmt(v)}</b><small>${p.rk[s.key] ? `第 ${p.rk[s.key]} 名` : ''}</small></div>`;
    }).join('');
    const dis = T.canEdit() ? '' : 'disabled';
    const total = p.complete
      ? `<div class="d-score">${fmt(p.composite)}<small> / 100　第 ${p.rank} 名</small></div>`
      : `<div class="d-score partial-score">${p.composite === null ? '—' : fmt(p.composite)}<small> 三關未齊（${p.haveN}/${p.needN}）</small></div>`;
    $('drawer-inner').innerHTML = `
      <div class="d-head"><h2>${p.grade ? esc(p.grade) + ' 年 ' : ''}${esc(p.cls)} 班 ${p.seat} 號</h2><div class="spacer"></div>${total}</div>
      <div class="scards">${cards}</div>
      <div class="d-head" style="margin-top:12px"><label>最後決定
        <select id="d-decision" ${dis}><option value="">（未決定）</option><option value="pick">入選</option><option value="wait">候補</option><option value="drop">不錄取</option></select></label></div>

      <div class="sec" id="sec-assembly"><h3>組裝（Lego Quest）</h3>${assemblySection(p)}</div>
      <div class="sec" id="sec-program"><h3>程式（自動評分）</h3>${programSection(p)}</div>
      <div class="sec" id="sec-interview"><h3>面試</h3>${manualForm(p, 'interview')}</div>

      <div class="d-actions" style="margin-top:24px">
        <button id="d-print">列印報告</button><button id="d-close">關閉</button><div class="spacer"></div>
        <button class="danger" id="d-delete" ${dis}>刪除這位學生的所有資料</button></div>`;
    $('d-decision').value = p.decision;
    $('d-decision').onchange = (e) => guard(T.saveDecision(p, e.target.value), '已儲存 ✓');
    $('d-print').onclick = () => window.print();
    $('d-close').onclick = closeDrawer;
    $('d-delete').onclick = async () => {
      if (!confirm(`確定要永久刪除 ${p.cls} 班 ${p.seat} 號的所有資料嗎？\n（程式紀錄、組裝與面試分數；無法復原）`)) return;
      if (await guard(T.deletePerson(p))) { state.pending.delete(p.key); closeDrawer(); render(true); }
    };
  }

  // ---------- 匯出 CSV ----------

  function downloadCsv(name, lines) {
    const csv = lines.map((l) => l.map((v) => `"${String(v === undefined || v === null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function exportCsv() {
    const v = state.view;
    const dec = { pick: '入選', wait: '候補', drop: '不錄取' };
    if (v === 'overview') {
      const list = sortList(visible(state.people), OV_COLS, state.sort.overview);
      downloadCsv('機器人校隊選拔_總覽.csv', [['班級', '座號', '組裝', '程式', '面試', '綜合', '三關齊全', '名次', '決定', '積木經驗', '潛力']]
        .concat(list.map((p) => [p.cls, p.seat, p.s.assembly, p.s.program, p.s.interview, p.composite, p.complete ? '是' : '否', p.rank, dec[p.decision] || '', p.program ? p.program.sc.surveyText : '', potOf(p) && potOf(p).tier ? potOf(p).label : ''])));
    } else if (v === 'program') {
      const list = sortList(visible(state.people.filter((p) => p.program)), PG_COLS, state.sort.program);
      const head = ['場次', '年級', '班級', '座號', '版本', '狀態', '名次', '過關數', '到達關卡', 'A關卡完成度', 'B解題品質', 'C觀念運用', 'D獨立思考', 'E隱藏關卡', '老師加減分', '總分', '等級', '建議', '老師備註', '積木經驗', '潛力']
        .concat(SC.MAIN_IDS.map((i) => `第${i}關星等`), SC.SKILLS.map((s) => s.name));
      downloadCsv('機器人校隊選拔_程式.csv', [head].concat(list.map((p) => {
        const r = p.program, s = r.sc, sub = r.sub;
        return [sub.sessionCode, sub.student.grade, p.cls, p.seat, sub.variantSeed, r.done ? '完成' : '進行中', p.rk.program, s.cleared, s.reached, s.dims.A, s.dims.B, s.dims.C, s.dims.D, s.dims.E, s.adjust, s.total, s.grade, s.pick, (r.review && r.review.note) || '', s.surveyText, s.potential.tier ? s.potential.label : '']
          .concat(s.levels.map((l) => (l.cleared ? l.stars : l.visited ? '未過' : '未玩')), s.skills.map((k) => k.pct));
      })));
    } else if (v === 'assembly') {
      const list = sortList(visible(state.people), ASM_COLS, state.sort[v]);
      downloadCsv('機器人校隊選拔_組裝.csv', [['班級', '座號', 'Lego狀態', '組裝用時(秒)', '逾時', '結束在第幾步', '上一步次數', '放大次數', '缺件回報次數', '檢查結果', '分數', '名次', '備註', '評分者']]
        .concat(list.map((p) => {
          const rec = (p.doc && p.doc.assembly) || {};
          const a = legoOf(p);
          const b = (a && a.build) || {};
          const g = AS.byKey(rec.grade);
          return [p.cls, p.seat, legoStatus(a).text, durMs(a) !== null ? Math.round(durMs(a) / 1000) : '', b.timedOut ? '是' : '', b.finishedAtStep || '', b.backNavCount, b.zoomCount, a && a.count ? a.count.shortageReports.length : '', g ? g.label : '', p.s.assembly, p.rk.assembly, rec.note || '', rec.by || ''];
        })));
    } else if (MANUAL.includes(v)) {
      const items = T.config.items[v];
      const list = sortList(visible(state.people), manualCols(v), state.sort[v]);
      downloadCsv(`機器人校隊選拔_${NAME[v]}.csv`, [['班級', '座號'].concat(items.map((i) => `${i.name}/${i.max}`), ['分數', '名次', '備註', '評分者'])]
        .concat(list.map((p) => {
          const rec = (p.doc && p.doc[v]) || {};
          return [p.cls, p.seat].concat(items.map((i) => (rec.items && rec.items[i.name] !== undefined ? rec.items[i.name] : '')), [p.s[v], p.rk[v], rec.note || '', rec.by || '']);
        })));
    }
  }

  // ---------- 事件 ----------

  $('tabs').onclick = (e) => {
    const b = e.target.closest('button[data-view]');
    if (!b) return;
    state.view = b.dataset.view;
    render(true);
  };
  $('f-session').onchange = (e) => { state.session = e.target.value; render(true); };
  $('f-class').onchange = (e) => { state.cls = e.target.value; render(true); };
  $('f-bg').onchange = (e) => { state.bg = e.target.value; render(true); };
  $('f-q').oninput = (e) => { state.q = e.target.value; render(true); };
  $('f-pick').oninput = (e) => { state.pickN = Math.max(0, Number(e.target.value) || 0); render(true); };

  $('view').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const s = state.sort[state.view];
      const k = th.dataset.sort;
      state.sort[state.view] = { key: k, dir: s.key === k ? -s.dir : (k === 'cls' || k === 'seat' || k === 'rank' || k === 'note' ? 1 : -1) };
      render(true);
      return;
    }
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const a = btn.dataset.act;
      if (a === 'csv') exportCsv();
      else if (a === 'import') $('file-import').click();
      else if (a === 'copy') { $('link-url').select(); (navigator.clipboard ? navigator.clipboard.writeText($('link-url').value) : Promise.reject()).catch(() => document.execCommand('copy')); toast('已複製'); }
      else if (a === 'add') addStudents();
      else if (a === 'batch-toggle') { state.batchOpen = !state.batchOpen; render(true); }
      else if (a === 'batch-apply') batchApply();
      else if (a === 'save-weights') saveWeights();
      else if (a === 'save-items') saveItems();
      return;
    }
    const row = e.target.closest('[data-open]');
    if (row && !e.target.closest('input')) openDrawer(row.dataset.open, row.dataset.sec);
  });

  // 表格裡的輸入：離開欄位自動儲存；Enter 跳到下一位同一欄
  $('view').addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-st]');
    if (tr && e.target.matches('.cell-in, .note-in, .grade-sel')) saveRow(tr);
  });
  $('view').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.cell-in, .note-in')) {
      const tr = e.target.closest('tr');
      const idx = [...tr.querySelectorAll('input')].indexOf(e.target);
      const nextKey = tr.nextElementSibling && tr.nextElementSibling.dataset.key;
      e.target.blur(); // 觸發儲存；本機模式會立刻重畫，所以要重新找下一列
      if (nextKey) {
        const next = [...$('view').querySelectorAll('tr[data-key]')].find((r) => r.dataset.key === nextKey);
        const ins = next && next.querySelectorAll('input');
        if (ins && ins[idx]) ins[idx].focus();
      }
    } else if (e.key === 'Enter' && e.target.id === 'add-seat') addStudents();
  });
  $('view').addEventListener('input', (e) => {
    if (e.target.id === 'link-code') { state.linkCode = e.target.value.trim(); updateLink(); }
  });

  // 個人報告
  $('drawer').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const p = state.byKey.get(state.openKey);
    if (!p) return;
    if (b.dataset.act === 'save-assembly' || b.dataset.act === 'clear-assembly') {
      const clear = b.dataset.act === 'clear-assembly';
      const sel = clear ? null : $('drawer').querySelector('input[name="asm-grade"]:checked');
      const g = sel ? AS.byKey(sel.value) : null;
      if (!clear && !g && !(p.doc && p.doc.assembly)) { toast('請先勾選一個等級', true); return; }
      guard(T.saveStage(p, 'assembly', { score: g ? g.score : null, grade: g ? g.key : null, items: {}, note: $('asm-note').value.trim().slice(0, 500) }), clear ? '已清除 ✓' : '已儲存 ✓')
        .then(() => { document.activeElement.blur(); if (state.openKey) render(true); });
    } else if (b.dataset.act === 'save-stage') {
      const st = b.dataset.st;
      const form = $('drawer').querySelector(`.mform[data-st="${st}"]`);
      const vals = [...form.querySelectorAll('.cell-in')].map((i) => i.value);
      const r = computeStage(st, vals);
      guard(T.saveStage(p, st, { score: r.score, items: r.items, note: form.querySelector('.note-area').value.trim().slice(0, 500) }), '已儲存 ✓')
        .then(() => { document.activeElement.blur(); if (state.openKey) { render(true); } });
    } else if (b.dataset.act === 'save-review' && p.program) {
      const rev = { adjust: clamp(Math.round(Number($('rv-adjust').value) || 0), -20, 20), note: $('rv-note').value.trim().slice(0, 500) };
      guard(T.saveReview(p.program.id, rev), '已儲存 ✓').then(() => { document.activeElement.blur(); render(true); });
    }
  });

  $('file-import').onchange = async (e) => {
    const { n, bad } = await T.importFiles(e.target.files);
    e.target.value = '';
    toast(`已匯入 ${n} 筆${bad.length ? `；${bad.join('、')} 不是有效的結果檔` : ''}`, bad.length > 0 && !n);
  };

  // 登入
  function renderUser() {
    $('btn-login').hidden = !T.cloudConfigured || !!T.user;
    $('btn-logout').hidden = !T.user;
    $('user-name').textContent = T.user ? T.user.email : '';
  }
  $('btn-login').onclick = async () => {
    try { await T.login(); } catch (e) {
      T.onNotice('登入失敗：' + esc(e.code || e.message) + (e.code === 'auth/unauthorized-domain' ? '。請到 Firebase 主控台 → Authentication → 設定 → 已授權的網域，加入這個網站的網域。' : ''), true);
    }
  };
  $('btn-logout').onclick = () => T.logout();

  function setNotice(html, isErr) {
    const n = $('notice');
    n.hidden = !html;
    n.className = isErr ? 'err' : '';
    n.innerHTML = html || '';
  }

  // ---------- 啟動 ----------

  T.onChange = () => render(false);
  T.onNotice = setNotice;
  T.onUser = () => { renderUser(); if (T.user) setNotice(''); };

  if (T.cloudConfigured) {
    $('mode-badge').textContent = '雲端模式';
    setNotice('請用右上角「用 Google 登入」。');
  } else {
    $('mode-badge').textContent = '本機模式';
    setNotice('目前是<b>本機模式</b>（資料只存在這台電腦的瀏覽器）：程式關請用「匯入結果檔」讀取學生下載的 JSON。要讓成績自動上傳、多位老師共用，請照 <a href="../FIREBASE_SETUP.md">FIREBASE_SETUP.md</a> 設定。');
  }
  renderUser();
  T.init().then(() => render(true)).catch((e) => setNotice('Firebase 載入失敗：' + esc(e.message), true));
  render(true);
})();
