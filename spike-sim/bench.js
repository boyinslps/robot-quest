/* 機構單獨測試面板（照官方順序：1 母體燈、2 馬達、3 顏色感測器、4 距離感測器、5 力傳感器、6 陀螺儀感應器）
   每個機構都可以不寫程式、直接用手操作它，也可以一鍵放入範例積木／Python，再去跑程式看它怎麼反應。 */
(function (SP) {
  'use strict';
  const U = SP.ui; if (!U) return;
  const sim = U.sim, api = U.api;
  const $ = (id) => document.getElementById(id);
  const h = (tag, props, ...kids) => {
    const e = tag === 'svg' || (props && props.ns) ? document.createElementNS('http://www.w3.org/2000/svg', props.ns || 'svg') : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'ns') continue;
      if (k === 'class') e.setAttribute('class', v); else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) e.append(kid.nodeType ? kid : document.createTextNode(kid));
    return e;
  };
  const S = (tag, props, ...kids) => h(tag, { ...props, ns: tag }, ...kids);
  const rad = (d) => d * Math.PI / 180;

  const COLORS = [['black', '黑色', 0, '#111111'], ['white', '白色', 10, '#ffffff'], ['red', '紅色', 9, '#d93025'], ['yellow', '黃色', 7, '#f2c400'], ['green', '綠色', 6, '#1e9e4a'], ['blue', '藍色', 3, '#1a60d6']];
  const COLOR_NUM = { black: 0, blue: 3, green: 6, yellow: 7, red: 9, white: 10, none: -1 };
  const COLOR_ZH = { black: '黑色', white: '白色', red: '紅色', yellow: '黃色', green: '綠色', blue: '藍色', none: '沒有顏色' };
  const COLOR_HEX = { black: '#111', white: '#fff', red: '#d93025', yellow: '#f2c400', green: '#1e9e4a', blue: '#1a60d6', none: '#9aa0a6' };
  const POWER = [[0, '#222222'], [1, '#ff2bd0'], [2, '#8a2be2'], [3, '#2a62ff'], [4, '#40c0ff'], [5, '#20e0c0'], [6, '#22c55e'], [7, '#ffd400'], [8, '#ff8c1a'], [9, '#ff2d2d'], [10, '#ffffff']];
  const FACE = ['上面', '前面', '右面', '下面', '後面', '左面'];

  /* ---------- 共用小工具 ---------- */
  const ro = (label) => { const b = h('b', { text: '—' }); return { el: h('div', { class: 'ro' }, h('span', { text: label }), b), set: (v) => { if (b.textContent !== String(v)) b.textContent = v; } }; };
  const hint = (t) => { U.say(t); };
  const guard = (fn) => {           // 面板上的動作：程式正在跑時不搶著控制
    if (U.isRunning()) { hint('程式正在執行，請先按右下角的停止，再用這裡的按鈕。'); return; }
    sim.aborted = false;
    try { const r = fn(); if (r && r.catch) r.catch(() => {}); } catch (e) { hint(e.message); }
  };
  const stopAll = () => { sim.abort(); sim.stopAll(); };
  function portSelect(type, ports) {
    const sel = h('select', { 'aria-label': '埠' }, ports.map((p) => h('option', { value: p, text: p })));
    const find = () => ports.find((p) => sim.ports[p] === type) || null;
    sel.onchange = () => { sim.ports[sel.value] = type; U.refreshPortSelects(); };
    return { el: h('label', {}, '接在埠 ', sel), get: () => sel.value, connect() { if (!find()) { sim.ports[sel.value] = type; U.refreshPortSelects(); } },
      tick() { const c = find(); if (c && sel.value !== c && document.activeElement !== sel) sel.value = c; } };
  }
  const tryList = (official, extra) => h('div', { class: 'try' },
    h('b', { text: '照官方教學的順序操作（意譯，官方原文是英文）' }), h('ol', {}, official.map((t) => h('li', { text: t }))),
    extra && extra.length ? [h('b', { text: '多試試（我自己加的，不是官方步驟）' }), h('ul', {}, extra.map((t) => h('li', { text: t })))] : null);
  const N = (x) => ({ shadow: { type: 'math_number', fields: { NUM: x } } });
  const T = (s) => ({ shadow: { type: 'text', fields: { TEXT: s } } });
  const B = (type, fields, inputs, next) => ({ type, ...(fields ? { fields } : {}), ...(inputs ? { inputs } : {}), ...(next ? { next: { block: next } } : {}) });
  const chain = (...bs) => bs.reduceRight((nx, b) => (nx ? { ...b, next: { block: nx } } : b), null);
  function loadBlocks(top, what) {
    if (ws.getAllBlocks(false).length > 1 && !confirm('要用「' + what + '」範例取代目前工作區的積木嗎？')) return;
    U.setMode('blocks'); ws.clear();
    Blockly.serialization.workspaces.load({ blocks: { languageVersion: 0, blocks: top } }, ws);
    U.autosave(); U.say('已放入範例：' + what + '。按右下角綠色的執行鈕試試看。');
  }
  const ws = U.ws;
  const examples = (what, blocksFn, py) => h('div', { class: 'bench-foot' },
    h('button', { class: 'pill', type: 'button', text: '放入範例積木', onclick: () => loadBlocks(blocksFn(), what) }),
    h('button', { class: 'pill', type: 'button', text: '放入範例 Python', onclick: () => { if (U.pySrc.value.trim() && U.isPyDirty() && !confirm('要用範例取代目前的 Python 嗎？')) return; U.loadPython(py); U.say('已放入 Python 範例：' + what); } }),
    h('button', { class: 'pill', type: 'button', text: '執行程式', onclick: () => $('btn-run').click() }),
    h('button', { class: 'pill', type: 'button', text: '停止', onclick: () => { if (U.isRunning()) $('btn-stop').click(); else stopAll(); } }));
  const head = (num, title, sub, ...extra) => h('div', { class: 'bench-h' }, h('span', { class: 'sn', text: num }), h('h3', { text: title }), h('span', { class: 'muted', text: sub }), h('span', { class: 'grow' }), ...extra);
  const PY_HEAD = 'from hub import port, light_matrix, motion_sensor, sound, button, light\nimport color, color_sensor, distance_sensor, force_sensor, motor, motor_pair, orientation, runloop\n\n';

  const benches = {};

  /* ===== 1 母體燈 ===== */
  (function () {
    const cells = Array.from({ length: 25 }, (_, i) => h('i', { title: '點一下切換這一顆燈', onclick: () => {
      const cx = i % 5, cy = Math.floor(i / 5), r = sim.matrixRot;
      const [sx, sy] = r === 0 ? [cx, cy] : r === 1 ? [cy, 4 - cx] : r === 2 ? [4 - cx, 4 - cy] : [4 - cy, cx];
      sim.led[sy * 5 + sx] = sim.led[sy * 5 + sx] ? 0 : sim.matrixBright; sim.displayText = '';
    } }));
    const matrix = h('div', { class: 'matrix big' }, cells);
    const power = h('div', { class: 'hub-btn' });
    const mkBtn = (side, label) => { const b = h('button', { class: 'hbtn', type: 'button', text: label });
      b.addEventListener('pointerdown', (e) => { sim.buttons[side] = performance.now(); b.setPointerCapture(e.pointerId); b.classList.add('down'); });
      const up = () => { sim.buttons[side] = 0; b.classList.remove('down'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up); return b; };
    const img = h('select', {}, SP.imageOptions().map(([t, v]) => h('option', { value: v, text: t })));
    const bright = h('input', { type: 'range', min: 0, max: 100, value: 100, 'aria-label': '亮度' }); const bv = h('span', { text: '100%' });
    bright.oninput = () => { api.lightBrightness(bright.value); bv.textContent = bright.value + '%'; };
    const txt = h('input', { type: 'text', value: '你好' });
    const sw = POWER.map(([n, c]) => h('button', { class: 'sw', type: 'button', style: 'background:' + c, title: '電源鍵燈顏色 ' + n, onclick: () => api.centerLight(n) }));
    const state = ro('主機螢幕文字'), btns = ro('按鈕');
    const root = h('section', { class: 'card bench', hidden: true },
      head('1', '母體燈', '主機的 5×5 燈陣、電源鍵燈、左右按鈕'),
      h('div', { class: 'bench-body' }, h('div', { class: 'bench-art' }, matrix, h('div', { class: 'hub-row big' }, mkBtn('left', '左'), power, mkBtn('right', '右'))),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' },
          h('div', { class: 'ctl' }, '圖案 ', img, h('button', { class: 'pill', type: 'button', text: '亮起', onclick: () => api.lightImage(img.value) }), h('button', { class: 'pill', type: 'button', text: '亮 2 秒', onclick: () => guard(() => api.lightImageFor(img.value, 2)) }), h('button', { class: 'pill', type: 'button', text: '關閉', onclick: () => api.lightOff() })),
          h('div', { class: 'ctl' }, '亮度 ', bright, bv, ' 旋轉 ', h('button', { class: 'pill', type: 'button', text: '逆時針', onclick: () => api.lightRotate(-1) }), h('button', { class: 'pill', type: 'button', text: '順時針', onclick: () => api.lightRotate(1) })),
          h('div', { class: 'ctl' }, '寫入 ', txt, h('button', { class: 'pill', type: 'button', text: '寫入', onclick: () => api.lightText(txt.value) })),
          h('div', { class: 'ctl' }, '電源鍵燈'), h('div', { class: 'swatches' }, sw),
          h('div', { class: 'readouts' }, state.el, btns.el))),
      tryList(['01 認識：在主機上顯示一張笑臉。', '02 做程式：把「當程式開始」放上去，下面接「亮起 圖案」（官方積木叫 turn on）。', '03 按執行（播放）鈕，測試程式。', '04 主機顯示笑臉。', '05 把燈的圖案改成另一個圖案。', '06 再按一次執行，看新的燈光圖案。'],
        ['直接點燈陣上的格子，一顆一顆亮起來。', '拖動「亮度」、按「順時針」旋轉燈陣；按電源鍵燈的顏色。', '按住「左」「右」按鈕，程式用「當 左 按鈕 被按下」就接得到。']),
      examples('母體燈（官方第 1 課）', () => [B('sp_start', null, null, B('sp_light_image', { IMG: '3' }))],
        PY_HEAD + 'async def main():\n    light_matrix.show_image(light_matrix.IMAGE_HAPPY)\n\nrunloop.run(main())\n'));
    benches.hub = { root, tick() {
      const r = sim.matrixRot;
      for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 5; cx++) {
        const [sx, sy] = r === 0 ? [cx, cy] : r === 1 ? [cy, 4 - cx] : r === 2 ? [4 - cx, 4 - cy] : [4 - cy, cx]; const b = sim.led[sy * 5 + sx];
        cells[cy * 5 + cx].style.background = b ? `rgb(${60 + b * 1.9},${60 + b * 1.7},${70 + b * 0.2})` : '';
      }
      power.style.background = U.POWER_CSS[sim.powerColor] || '#fff';
      state.set(sim.displayText || '（沒有）'); btns.set((sim.buttons.left ? '左 ' : '') + (sim.buttons.right ? '右' : '') || '沒按');
    } };
  })();

  /* ===== 2 馬達 ===== */
  (function () {
    const sel = h('select', {}, h('option', { value: 'A', text: 'A（左輪）' }), h('option', { value: 'B', text: 'B（右輪）' }));
    const m = () => (sel.value === 'A' ? sim.mL : sim.mR);
    const needle = S('line', { x1: 70, y1: 70, x2: 70, y2: 20, stroke: '#e5483d', 'stroke-width': 5, 'stroke-linecap': 'round' });
    const ticks = []; for (let i = 0; i < 36; i++) { const a = rad(i * 10), big = i % 9 === 0, r1 = big ? 50 : 54;
      ticks.push(S('line', { x1: 70 + 60 * Math.sin(a), y1: 70 - 60 * Math.cos(a), x2: 70 + r1 * Math.sin(a), y2: 70 - r1 * Math.cos(a), stroke: '#8a93a6', 'stroke-width': big ? 2.5 : 1 })); }
    const labels = [[0, 70, 36, '0'], [90, 112, 74, '90'], [180, 70, 118, '180'], [270, 28, 74, '270']].map(([, x, y, t]) => S('text', { x, y, 'text-anchor': 'middle', 'font-size': 11, fill: '#566', 'font-weight': 700, text: t }));
    const dial = S('svg', { viewBox: '0 0 140 140', width: 150, height: 150, class: 'dial' }, S('circle', { cx: 70, cy: 70, r: 64, fill: '#1fb6c9', stroke: '#0f8a99', 'stroke-width': 4 }), S('circle', { cx: 70, cy: 70, r: 46, fill: '#fff' }), ticks, labels, needle, S('circle', { cx: 70, cy: 70, r: 6, fill: '#333' }));
    let last = null;
    const ang = (e) => { const b = dial.getBoundingClientRect(); return Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2))) * 180 / Math.PI; };
    dial.addEventListener('pointerdown', (e) => { if (!sim.lifted) { hint('要用手轉馬達，請先勾選「把車子架起來」（不然輪子是接在地上的車子上）。'); return; } dial.setPointerCapture(e.pointerId); last = ang(e); });
    dial.addEventListener('pointermove', (e) => { if (last === null) return; const a = ang(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; m().deg += d; m().cur = 0; last = a; });
    const endD = () => { last = null; }; dial.addEventListener('pointerup', endD); dial.addEventListener('pointercancel', endD);
    const spd = h('input', { type: 'range', min: -100, max: 100, value: 75, 'aria-label': '速度' }), sv = h('span', { text: '75%' }); let sdrag = false;
    spd.oninput = () => { sdrag = true; api.motorSetSpeed(sel.value, spd.value); sv.textContent = spd.value + '%'; }; spd.onchange = () => { sdrag = false; };
    const lift = h('input', { type: 'checkbox' }); lift.onchange = () => { sim.lifted = lift.checked; };
    const goSel = h('select', {}, [0, 90, 180, 270].map((v) => h('option', { value: v, text: v + '°' })));
    const rp = ro('位置（0～359°）'), rel = ro('相對位置（累計度）'), vel = ro('速度（度/秒）'), turns = ro('共轉幾圈');
    const bt = (t, fn, p) => h('button', { class: 'pill', type: 'button', text: t, onclick: () => guard(fn), ...(p || {}) });
    const root = h('section', { class: 'card bench', hidden: true },
      head('2', '馬達', '單顆馬達：轉動、轉到位置、速度、位置', h('label', {}, '馬達 ', sel)),
      h('div', { class: 'bench-body' }, h('div', { class: 'bench-art' }, dial),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'readouts' }, rp.el, rel.el, vel.el, turns.el),
          h('div', { class: 'ctl' }, '速度 ', spd, sv),
          h('div', { class: 'ctl' }, bt('順時針 1 圈', () => api.motorRun(sel.value, 1, 1, 'rot')), bt('逆時針 1 圈', () => api.motorRun(sel.value, -1, 1, 'rot')), bt('轉 90°', () => api.motorRun(sel.value, 1, 90, 'deg')), bt('轉 2 秒', () => api.motorRun(sel.value, 1, 2, 'sec'))),
          h('div', { class: 'ctl' }, '轉到位置 ', goSel, bt('最短路徑', () => api.motorGoto(sel.value, 'short', goSel.value)), bt('順時針', () => api.motorGoto(sel.value, 'cw', goSel.value)), bt('逆時針', () => api.motorGoto(sel.value, 'ccw', goSel.value))),
          h('div', { class: 'ctl' }, bt('開始轉動', () => api.motorStartDir(sel.value, 1)), h('button', { class: 'pill', type: 'button', text: '停止馬達', onclick: () => { stopAll(); } }), h('button', { class: 'pill', type: 'button', text: '相對位置歸零', onclick: () => api.motorSetPos(sel.value, 0) })),
          h('label', { class: 'chk' }, lift, '把車子架起來（輪子懸空，車子不會移動；才能用滑鼠轉動轉盤）'))),
      tryList(['01 認識：讓馬達轉起來。', '02 把馬達插在 A 埠（本模擬器 A 是左輪馬達）。', '03 做程式：「當程式開始」→「設定速度為 75%」→「A 轉動 ↻ 1 圈」。', '04 按執行，測試讓馬達轉動的程式。', '05 馬達在轉。', '06 把速度數字改大，馬達會轉得更快。', '07 再按一次執行，看馬達變快。'],
        ['勾選「把車子架起來」，這樣只有馬達在轉、車子不會跑走。', '選「270°」按「最短路徑」「順時針」「逆時針」，看它走哪個方向。', '用滑鼠拖轉盤，像用手轉馬達：位置會跟著變。', '取消「架起來」再轉一次：單顆輪子轉＝車子繞另一顆輪子轉。']),
      examples('馬達（官方第 2 課）', () => [B('sp_start', null, null, chain(B('sp_motor_speed_set', { PORT: 'A' }, { P: N(75) }), B('sp_motor_run', { PORT: 'A', DIR: '1', UNIT: 'rot' }, { N: N(1) })))],
        PY_HEAD + 'async def main():\n    await motor.run_for_degrees(port.A, 360, 750)\n\nrunloop.run(main())\n'));
    benches.motor = { root, tick() {
      const d = m().deg; needle.setAttribute('transform', `rotate(${((d % 360) + 360) % 360} 70 70)`);
      rp.set(((Math.round(d) % 360) + 360) % 360 + '°'); rel.set(Math.round(d - (m().rel0 || 0)) + '°'); vel.set(Math.round(m().cur || 0)); turns.set((d / 360).toFixed(2));
      dial.classList.toggle('locked', !sim.lifted); lift.checked = sim.lifted;
      if (!sdrag && document.activeElement !== spd) { spd.value = sim.motorSpeed[sel.value]; sv.textContent = sim.motorSpeed[sel.value] + '%'; }
    } };
  })();

  /* ===== 3 顏色感測器 ===== */
  (function () {
    const port = portSelect('color', ['C', 'D', 'E', 'F']);
    const chips = COLORS.map(([k, zh, , hex]) => h('button', { class: 'card-chip', type: 'button', 'data-c': k, onclick: () => { sim.hand.color = k; } }, h('i', { style: 'background:' + hex }), zh));
    const none = h('button', { class: 'card-chip', type: 'button', 'data-c': 'none', onclick: () => { sim.hand.color = 'none'; } }, h('i', { style: 'background:#9aa0a6' }), '沒有東西');
    const field = h('button', { class: 'card-chip', type: 'button', 'data-c': '', onclick: () => { sim.hand.color = null; } }, '放開（看車子底下）');
    const led = S('circle', { cx: 60, cy: 74, r: 14, fill: '#999', stroke: '#222', 'stroke-width': 3 });
    const art = S('svg', { viewBox: '0 0 120 110', width: 150, height: 130 }, S('rect', { x: 18, y: 14, width: 84, height: 62, rx: 8, fill: '#fff', stroke: '#222', 'stroke-width': 3 }), S('rect', { x: 18, y: 14, width: 18, height: 62, rx: 6, fill: '#26282c' }), S('circle', { cx: 66, cy: 45, r: 20, fill: '#26282c' }), S('circle', { cx: 66, cy: 45, r: 12, fill: '#4a4d55' }), S('rect', { x: 40, y: 86, width: 40, height: 10, rx: 3, fill: '#d9dce0' }), led);
    const nm = ro('顏色'), no = ro('官方編號'), lt = ro('反射光 %'), rg = ro('R G B 強度');
    const root = h('section', { class: 'card bench', hidden: true },
      head('3', '顏色感測器', '辨色、反射光', port.el),
      h('div', { class: 'bench-body' }, h('div', { class: 'bench-art' }, art),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'readouts' }, nm.el, no.el, lt.el, rg.el),
          h('div', { class: 'ctl' }, '拿色卡放在感測器前面：'), h('div', { class: 'ctl' }, chips, none, field))),
      tryList(['01 認識：使用顏色感測器。', '02 把顏色感測器插上（官方插 A 埠；本模擬器 A、B 是輪子，感測器接在 C～F 其中一埠）。', '03 做程式：「當 顏色是 紅色」接「亮起 圖案」，用感測器點亮主機。', '04 按執行。', '05 拿一塊紅色積木放在感測器前面，看主機亮起來（這裡按「紅色」色卡）。', '06 把積木上的顏色從紅色改成黃色，感測器就會對黃色積木有反應。', '07 再按執行，拿黃色積木測試（按「黃色」色卡）。'],
        ['按「黑色」「白色」，看反射光百分比怎麼變。', '按「沒有東西」：顏色是 −1。', '按「放開」，到「整車場地」選「顏色區」，把車子拖到各色方塊上看讀值。']),
      examples('顏色感測器（官方第 3 課）', () => [B('sp_when_color', { PORT: 'C', COLOR: 'red' }, null, B('sp_light_image', { IMG: '3' }))],
        PY_HEAD + 'async def main():\n    while True:\n        if color_sensor.color(port.C) == color.RED:\n            light_matrix.show_image(light_matrix.IMAGE_HAPPY)\n        else:\n            light_matrix.clear()\n        await runloop.sleep_ms(50)\n\nrunloop.run(main())\n'));
    benches.color = { root, onShow() { port.connect(); }, tick() {
      port.tick(); const c = sim.color(), [r, g, b] = sim.pixel(), k = 1024 / 255;
      nm.set(COLOR_ZH[c]); no.set(COLOR_NUM[c]); lt.set(sim.light() + '%'); rg.set([r, g, b].map((v) => Math.round(v * k)).concat(Math.round((0.299 * r + 0.587 * g + 0.114 * b) * k)).join(' '));
      led.setAttribute('fill', COLOR_HEX[c]);
      for (const x of [...chips, none, field]) x.classList.toggle('on', (x.dataset.c || null) === (sim.hand.color || null));
    } };
  })();

  /* ===== 4 距離感測器 ===== */
  (function () {
    const port = portSelect('distance', ['C', 'D', 'E', 'F']);
    const sl = h('input', { type: 'range', min: 0, max: 200, value: 50, 'aria-label': '距離（公分）' }), slv = h('span', { text: '50 公分' });
    const use = h('input', { type: 'checkbox' });
    const sync = () => { slv.textContent = sl.value + ' 公分'; sim.hand.dist = use.checked ? Number(sl.value) : null; };
    sl.oninput = () => { use.checked = true; sync(); }; use.onchange = sync;
    const barFill = h('i', { style: 'width:25%' }); const bar = h('div', { class: 'bar' }, barFill);
    const dots = [0, 1, 2, 3].map(() => h('i')); const cm = ro('公分'), inch = ro('英寸'), pc = ro('百分比'), mm = ro('毫米（Python）');
    const eye = (x) => [S('circle', { cx: x, cy: 40, r: 17, fill: '#26282c', stroke: '#d6d9de', 'stroke-width': 5 }), S('circle', { cx: x, cy: 40, r: 6, fill: '#555b63' })];
    const art = S('svg', { viewBox: '0 0 140 80', width: 150, height: 90 }, S('rect', { x: 8, y: 8, width: 124, height: 62, rx: 8, fill: '#fff', stroke: '#222', 'stroke-width': 3 }), S('rect', { x: 8, y: 8, width: 124, height: 12, rx: 6, fill: '#26282c' }), eye(42), eye(98));
    const lightBtn = (t, v) => h('button', { class: 'pill', type: 'button', text: t, onclick: () => api.distLight(...v) });
    const root = h('section', { class: 'card bench', hidden: true },
      head('4', '距離感測器', '量距離（0～200 公分）、4 顆燈', port.el),
      h('div', { class: 'bench-body' }, h('div', { class: 'bench-art' }, art),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'readouts' }, cm.el, inch.el, pc.el, mm.el),
          h('div', { class: 'ctl' }, h('label', { class: 'chk' }, use, '用手放一個物體在前面：'), sl, slv), bar,
          h('div', { class: 'ctl' }, '感測器的 4 顆燈 ', h('div', { class: 'dots' }, dots), lightBtn('全亮', [100, 100, 100, 100]), lightBtn('左眼', [100, 100, 0, 0]), lightBtn('右眼', [0, 0, 100, 100]), lightBtn('關閉', [0, 0, 0, 0])))),
      tryList(['01 認識：使用距離感測器。', '02 把距離感測器插上（本模擬器接在 C～F 其中一埠）。', '03 做程式：「當 距離 更近於 20 %」接「播放嗶聲 60 持續 0.2 秒」，讓主機嗶一聲。', '04 按執行。', '05 把手放在感測器前面，聽主機嗶一聲（這裡勾選「用手放一個物體」並把距離拉近）。', '06 把積木上的距離數字改大一點，感測器從更遠的地方就會有反應。', '07 再按執行，把手放在感測器前面。'],
        ['拉到 15 公分以下，看公分、英寸、百分比一起變；200 公分以上＝沒偵測到，Python 回 −1。', '按「全亮」「左眼」「右眼」看感測器的燈（官方積木「距離感測器燈」）。', '取消勾選改用「整車場地」：車子朝牆走，距離就是到牆的距離。']),
      examples('距離感測器（官方第 4 課）', () => [B('sp_when_dist', { PORT: 'D', OP: '<' }, { N: N(20) }, B('sp_beep', null, { NOTE: N(60), S: N(0.2) }))],
        PY_HEAD + 'async def main():\n    while True:\n        d = distance_sensor.distance(port.D)   # 毫米，沒偵測到是 -1\n        if 0 <= d < 200:\n            await sound.beep(262, 200, 100)\n            distance_sensor.show(port.D, [100, 100, 100, 100])\n        else:\n            distance_sensor.clear(port.D)\n        await runloop.sleep_ms(50)\n\nrunloop.run(main())\n'));
    benches.dist = { root, onShow() { port.connect(); }, tick() {
      port.tick(); const d = sim.distRaw(); cm.set(Math.round(d)); inch.set((d / 2.54).toFixed(1)); pc.set(Math.round(d / 2) + '%'); mm.set(sim.distanceMm());
      barFill.style.width = (d / 2) + '%'; use.checked = sim.hand.dist !== null;
      dots.forEach((x, i) => { const v = sim.distLights[i] || 0; x.style.background = v ? `rgb(${60 + v * 1.9},${200},${255})` : ''; });
    } };
  })();

  /* ===== 5 力傳感器 ===== */
  (function () {
    const port = portSelect('force', ['C', 'D', 'E', 'F']);
    let sv = 0, hv = 0, timer = 0;
    const apply = () => { const f = Math.max(sv, hv); sim.hand.force = f > 0 ? f : null; };
    const btn = h('button', { class: 'pressbtn', type: 'button', text: '按住我（越久越用力）' });
    btn.addEventListener('pointerdown', (e) => { btn.setPointerCapture(e.pointerId); btn.classList.add('down'); hv = 0.6; apply(); timer = setInterval(() => { hv = Math.min(10, hv + 0.35); apply(); }, 50); });
    const rel = () => { clearInterval(timer); hv = 0; btn.classList.remove('down'); apply(); };
    btn.addEventListener('pointerup', rel); btn.addEventListener('pointercancel', rel); btn.addEventListener('lostpointercapture', rel);
    const sl = h('input', { type: 'range', min: 0, max: 10, step: 0.5, value: 0, 'aria-label': '固定施力（牛頓）' }), slv = h('span', { text: '0 牛頓' });
    sl.oninput = () => { sv = Number(sl.value); slv.textContent = sv + ' 牛頓'; apply(); };
    const n = ro('力（牛頓）'), pc = ro('力（%）'), stt = ro('狀態'), dn = ro('十分之一牛頓（Python）');
    const barFill = h('i', { style: 'width:0%' }); const bar = h('div', { class: 'bar' }, barFill);
    const art = S('svg', { viewBox: '0 0 130 110', width: 150, height: 120 }, S('rect', { x: 30, y: 14, width: 70, height: 56, rx: 8, fill: '#fff', stroke: '#222', 'stroke-width': 3 }), S('rect', { x: 14, y: 14, width: 24, height: 56, rx: 6, fill: '#26282c' }), S('rect', { x: 44, y: 70, width: 14, height: 26, rx: 3, fill: '#26282c' }), S('rect', { x: 30, y: 92, width: 50, height: 12, rx: 6, fill: '#26282c' }));
    const root = h('section', { class: 'card bench', hidden: true },
      head('5', '力傳感器', '按下、重壓、放開（0～10 牛頓）', port.el),
      h('div', { class: 'bench-body' }, h('div', { class: 'bench-art' }, art, btn),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'readouts' }, n.el, pc.el, stt.el, dn.el), bar,
          h('div', { class: 'ctl' }, '固定施力 ', sl, slv), h('div', { class: 'ctl', style: 'font-weight:600;color:#7b8196' }, '按下＝大於 0 牛頓；重壓＝5 牛頓以上；放開＝0。'))),
      tryList(['01 認識：使用力傳感器。', '02 馬達插 A 埠、力傳感器插 B 埠（本模擬器 A 是輪子馬達，力傳感器接在 C～F 其中一埠）。', '03 做程式：「當 力傳感器 被按下」接「A 開始轉動」；「當 被放開」接「A 停止馬達」（停止積木是我從官方積木盤推測的接法）。', '04 按執行。', '05 按下力傳感器，讓馬達轉動（按黑色大按鈕）。'],
        ['按得越久力越大，超過 5 牛頓叫「重壓」。', '拖「固定施力」到 3，再到 8，看狀態。', '到「整車場地」，車子往牆走撞到牆：前面的碰撞探針也會把它按下。']),
      examples('力傳感器（官方第 5 課）', () => [B('sp_when_force', { PORT: 'E', STATE: 'down' }, null, B('sp_motor_start', { PORT: 'A', DIR: '1' })), B('sp_when_force', { PORT: 'E', STATE: 'up' }, null, B('sp_motor_stop', { PORT: 'A' }))],
        PY_HEAD + 'async def main():\n    while True:\n        if force_sensor.pressed(port.E):\n            motor.run(port.A, 500)\n        else:\n            motor.stop(port.A)\n        await runloop.sleep_ms(20)\n\nrunloop.run(main())\n'));
    benches.force = { root, onShow() { port.connect(); }, tick() {
      port.tick(); const dnv = sim.forceDeci(); n.set((dnv / 10).toFixed(1)); pc.set(dnv + '%'); dn.set(dnv); stt.set(dnv === 0 ? '放開' : dnv >= 50 ? '重壓' : '按下'); barFill.style.width = dnv + '%';
    } };
  })();

  /* ===== 6 陀螺儀感應器 ===== */
  (function () {
    const slab = h('div', { class: 'slab' }, h('div', { class: 'face' }, h('i')));
    const art = h('div', { class: 'gyro3d' }, slab);
    const mk = (label, min, max) => { const i = h('input', { type: 'range', min, max, value: 0, 'aria-label': label }), v = h('span', { text: '0°' }); return { i, v, row: h('div', { class: 'ctl' }, label + ' ', i, v) }; };
    const pitch = mk('俯仰', -90, 90), roll = mk('滾動', -90, 90), yaw = mk('偏航', -180, 180); let ydrag = false;
    pitch.i.oninput = () => { sim.hand.pitch = Number(pitch.i.value); }; roll.i.oninput = () => { sim.hand.roll = Number(roll.i.value); };
    yaw.i.oninput = () => { ydrag = true; const th = sim.yawOff + rad(Number(yaw.i.value)) * sim.yawSign; if (!sim.collides(sim.x, sim.y, th)) sim.th = th; }; yaw.i.onchange = () => { ydrag = false; };
    const gbtn = (t, g) => h('button', { class: 'pill', type: 'button', text: t, onclick: () => sim.doGesture(g) });
    const yw = ro('偏航角（°）'), pt = ro('俯仰角（°）'), rl = ro('滾動角（°）'), face = ro('朝上的面'), tl = ro('傾斜方向'), gs = ro('手勢'), tp = ro('輕拍次數');
    const root = h('section', { class: 'card bench', hidden: true },
      head('6', '陀螺儀感應器', '偏航／俯仰／滾動、傾斜、搖晃'),
      h('div', { class: 'bench-body' }, h('div', { class: 'bench-art' }, art),
        h('div', { style: 'display:flex;flex-direction:column;gap:8px' }, h('div', { class: 'readouts' }, yw.el, pt.el, rl.el, face.el, tl.el, gs.el, tp.el),
          pitch.row, roll.row, yaw.row,
          h('div', { class: 'ctl' }, gbtn('搖晃', 'shaken'), gbtn('輕拍', 'tapped'), gbtn('自由落體', 'falling'),
            h('button', { class: 'pill', type: 'button', text: '偏航歸零', onclick: () => api.resetYaw(0) }),
            h('button', { class: 'pill', type: 'button', text: '主機放平', onclick: () => { sim.hand.pitch = 0; sim.hand.roll = 0; pitch.i.value = 0; roll.i.value = 0; } })),
          h('div', { class: 'ctl', style: 'font-weight:600;color:#7b8196' }, '「偏航」會真的把車子轉過去；俯仰、滾動是把主機抬起來傾斜（車子仍在地上）。方向正負號與「朝上的面」對照官方尚未用真機驗證。'))),
      tryList(['01 認識：使用陀螺儀（動作）感測器。', '02 主機裡面有內建的陀螺儀，能感覺到移動和傾斜。', '03 做程式：「當 主機傾斜 向右」接「播放聲音」（官方是「Cat Meow 1」音效，模擬器沒有音效檔，改用嗶聲）。', '04 按執行。', '05 把主機向右傾斜，聽聲音（這裡拖「滾動」往右）。', '06 把程式改成主機向左傾斜時發出聲音。', '07 再按執行，測試聲音。'],
        ['拖「偏航」：車子在場地上跟著轉，偏航角和 Python 的 tilt_angles()[0]（單位 0.1 度）一起變。', '按「搖晃」「輕拍」「自由落體」：手勢顯示約 1 秒。']),
      examples('陀螺儀（官方第 6 課）', () => [B('sp_when_tilt', { DIR: 'right' }, null, B('sp_beep', null, { NOTE: N(72), S: N(0.3) }))],
        PY_HEAD + 'async def main():\n    while True:\n        yaw, pitch, roll = motion_sensor.tilt_angles()   # 單位 0.1 度\n        if roll > 150:                                    # 向右傾斜 15 度以上（正負號未用真機驗證）\n            await sound.beep(1047, 300, 100)\n        await runloop.sleep_ms(50)\n\nrunloop.run(main())\n'));
    benches.gyro = { root, tick() {
      const y = sim.yaw(); yw.set(y); pt.set(Math.round(sim.hand.pitch)); rl.set(Math.round(sim.hand.roll));
      face.set(FACE[api.upFace()]); tp.set(sim.hand.taps);
      const dirs = [['forward', '向前'], ['backward', '向後'], ['left', '向左'], ['right', '向右']].filter(([d]) => api.tiltIs(d)).map(([, z]) => z);
      tl.set(dirs.length ? dirs.join('、') : '平放'); const g = sim.gesture(); gs.set(g === 'shaken' ? '搖晃' : g === 'tapped' ? '輕拍' : g === 'falling' ? '自由落體' : '—');
      pitch.v.textContent = Math.round(sim.hand.pitch) + '°'; roll.v.textContent = Math.round(sim.hand.roll) + '°'; yaw.v.textContent = y + '°';
      if (!ydrag && document.activeElement !== yaw.i) yaw.i.value = y;
      slab.style.transform = `rotateX(${60 - sim.hand.pitch}deg) rotateY(${sim.hand.roll}deg) rotateZ(${y * sim.yawSign}deg)`;
    } };
  })();

  /* ---------- 分頁切換 ---------- */
  const host = $('benches'); Object.values(benches).forEach((b) => host.appendChild(b.root));
  let active = null;
  function showTab(tab) {
    document.querySelectorAll('#stepper button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $('tab-field').hidden = tab !== 'field';
    for (const [k, b] of Object.entries(benches)) b.root.hidden = k !== tab;
    active = benches[tab] || null; if (active) { if (active.onShow) active.onShow(); active.tick(); }
    if (tab !== 'field' && SP.car3d) SP.car3d.stop && 0;      // 3D 繼續跑沒關係
  }
  document.querySelectorAll('#stepper button').forEach((b) => { b.onclick = () => showTab(b.dataset.tab); });
  setInterval(() => { if (active) active.tick(); }, 80);

  /* ---------- 「手動介入中」提示（在整車場地分頁） ---------- */
  const note = h('span', { class: 'hand-note', hidden: true }); const noteBtn = h('button', { class: 'pill small', type: 'button', text: '全部放開', hidden: true, onclick: () => {
    Object.assign(sim.hand, { color: null, dist: null, force: null, pitch: 0, roll: 0 }); sim.lifted = false; sim.handPress = false; } });
  const hh = document.querySelector('.hub-card .card-h'); if (hh) { hh.append(note, noteBtn); }
  setInterval(() => {
    const t = []; if (sim.hand.color) t.push('色卡：' + COLOR_ZH[sim.hand.color]); if (sim.hand.dist !== null) t.push('手放在前面 ' + Math.round(sim.hand.dist) + ' 公分');
    if (sim.hand.force !== null) t.push('手按力感測器 ' + sim.hand.force.toFixed(1) + ' 牛頓'); if (sim.hand.pitch || sim.hand.roll) t.push('主機傾斜'); if (sim.lifted) t.push('車子被架起來');
    note.hidden = noteBtn.hidden = !t.length; note.textContent = '手動介入中：' + t.join('、');
  }, 250);
  SP.bench = { showTab };
})(window.SP = window.SP || {});
