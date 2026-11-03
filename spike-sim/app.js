/* SPIKE 模擬器：介面與執行流程 */
(function (SP) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'spike-sim-project-v1';

  const css = document.createElement('style'); css.textContent = SP.iconCss(); document.head.appendChild(css);

  const ws = Blockly.inject('blockly', {
    toolbox: SP.toolbox, theme: SP.theme, renderer: 'zelos',
    media: 'https://cdn.jsdelivr.net/npm/blockly@11.2.1/media/',
    zoom: { controls: true, wheel: true, startScale: 0.9, maxScale: 1.6, minScale: 0.5 },
    move: { scrollbars: true, drag: true, wheel: false },
    grid: { spacing: 24, length: 2, colour: '#e3e6ec' },
    trashcan: false,
  });

  ws.registerToolboxCategoryCallback('PROCEDURE', (w) => Blockly.Procedures.flyoutCategory(w).filter((el) => {
    const t = el.getAttribute && el.getAttribute('type');
    return !['procedures_defreturn', 'procedures_ifreturn', 'procedures_callreturn'].includes(t);
  }));
  const sim = new SP.Sim($('stage'));

  /* ---------- 訊息欄 ---------- */
  function say(text, err) {
    const el = $('console'), d = document.createElement('div');
    if (err) d.className = 'err'; d.textContent = String(text); el.appendChild(d);
    while (el.childNodes.length > 200) el.removeChild(el.firstChild);
    el.scrollTop = el.scrollHeight;
  }
  $('btn-clearlog').onclick = () => { $('console').textContent = ''; };

  /* ---------- 場地控制 ---------- */
  SP.SCENES.forEach((s) => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; $('scene').appendChild(o); });
  $('scene').onchange = () => { stopProgram(); sim.loadScene($('scene').value); };
  $('speed').onchange = () => { sim.mul = Number($('speed').value); };
  $('btn-reset').onclick = () => { stopProgram(); sim.resetPose(); };
  $('btn-rotl').onclick = () => sim.rotateBy(-15);
  $('btn-rotr').onclick = () => sim.rotateBy(15);
  $('chk-trail').onchange = (e) => { sim.penOn = e.target.checked; };
  $('chk-cone').onchange = (e) => { sim.showSensors = e.target.checked; };
  $('btn-clear').onclick = () => sim.clearTrail();

  let dragging = null;
  const stage = $('stage');
  stage.addEventListener('pointerdown', (ev) => {
    const [cx, cy] = sim.toCm(ev), p = sim.pick(cx, cy);
    if (!p) return;
    dragging = p; stage.setPointerCapture(ev.pointerId); stage.classList.add('drag');
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const [cx, cy] = sim.toCm(ev);
    if (dragging.robot) { sim.x = Math.max(8, Math.min(292, cx)); sim.y = Math.max(8, Math.min(192, cy)); sim.lastMoveT = sim.simTime; }
    else { const r = dragging.rect; r.x = Math.max(0, Math.min(300 - r.w, cx - dragging.dx)); r.y = Math.max(0, Math.min(200 - r.h, cy - dragging.dy)); }
  });
  const endDrag = () => { dragging = null; stage.classList.remove('drag'); };
  stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);

  /* ---------- 主機與埠 ---------- */
  const DEV = [['none', '（未連接）'], ['color', '顏色感測器'], ['distance', '距離感測器'], ['force', '力感測器']];
  const portEl = {};
  function buildPort(p, side) {
    const row = document.createElement('div'); row.className = 'port';
    const badge = document.createElement('div'); badge.className = 'pbadge'; badge.textContent = p;
    const info = document.createElement('div'); info.className = 'pinfo';
    const val = document.createElement('div'); val.className = 'pval';
    if (p === 'A' || p === 'B') {
      const nm = document.createElement('div'); nm.className = 'pname'; nm.textContent = p === 'A' ? '馬達（左輪）' : '馬達（右輪）';
      info.append(nm, val);
    } else {
      const sel = document.createElement('select');
      DEV.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); });
      sel.value = sim.ports[p]; sel.onchange = () => { sim.ports[p] = sel.value; autosave(); };
      portEl[p + 'sel'] = sel; info.append(sel, val);
    }
    portEl[p] = val; row.append(badge, info);
    $(side).appendChild(row);
  }
  ['A', 'C', 'E'].forEach((p) => buildPort(p, 'ports-left'));
  ['B', 'D', 'F'].forEach((p) => buildPort(p, 'ports-right'));
  const cells = []; for (let i = 0; i < 25; i++) { const c = document.createElement('i'); $('matrix').appendChild(c); cells.push(c); }
  const CN = { black: '黑色', white: '白色', red: '紅色', yellow: '黃色', green: '綠色', blue: '藍色', none: '無' };
  function refreshHub() {
    portEl.A.textContent = Math.round(sim.mL.deg) + '°'; portEl.B.textContent = Math.round(sim.mR.deg) + '°';
    for (const p of ['C', 'D', 'E', 'F']) {
      const t = sim.ports[p];
      portEl[p].textContent = t === 'color' ? CN[sim.color()] + '／反射光 ' + sim.light() + '%'
        : t === 'distance' ? sim.distance() + ' 公分' : t === 'force' ? (sim.pressed() ? '被按下' : '未按下') : '';
    }
    sim.led.forEach((b, i) => { cells[i].style.background = b ? `rgb(${60 + b * 1.9},${60 + b * 1.7},${70 + b * 0.2})` : ''; });
    $('hub-text').textContent = sim.displayText || ' ';
    $('val-yaw').textContent = '轉向角度 ' + sim.yaw() + '°';
    $('val-timer').textContent = '計時器 ' + sim.timer().toFixed(1) + ' 秒';
  }
  setInterval(refreshHub, 100);

  /* ---------- 執行 ---------- */
  let lastBlock = null;
  const api = SP.createApi(sim, { hl: (id) => { lastBlock = id; ws.highlightBlock(id); }, say });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let running = false;
  function setRunning(r) { running = r; $('btn-run').hidden = r; $('btn-stop').hidden = !r; }
  async function runProgram() {
    if (running) return;
    clearErrors(); $('console').textContent = '';
    ws.getAllBlocks(false).forEach((b) => b.setWarningText(null));
    if (mode === 'python') return runPython();
    const found = lint();
    found.forEach(addError);
    if (found.some((x) => x.level === 'error')) { showTab('err'); return; }
    let gen;
    try { gen = SP.generate(ws); } catch (e) { addError({ level: 'error', msg: '積木轉換失敗：' + e.message }); showTab('err'); return; }
    setRunning(true); lastBlock = null;
    api.resetRun(); sim.yawOff = sim.th; sim.timerOff = sim.simTime; sim.speedPct = 50; sim.lastMoveT = sim.simTime;
    try { await new AsyncFunction('api', gen.code)(api); }
    catch (e) {
      if (e !== SP.STOP) {
        const msg = e && e.message ? e.message : String(e);
        addError({ level: 'error', msg, blockId: lastBlock }); showTab('err');
        const b = lastBlock && ws.getBlockById(lastBlock); if (b) b.setWarningText(msg);
      }
    }
    sim.stopAll(); ws.highlightBlock(null); setRunning(false);
  }
  async function runPython() {
    const code = $('py-src').value;
    if (!code.trim()) { addError({ level: 'error', msg: 'Python 程式是空的。可以按「從積木重新產生」，或直接輸入程式。' }); showTab('err'); return; }
    setRunning(true); markPyLine(null);
    api.resetRun(); sim.yawOff = sim.th; sim.timerOff = sim.simTime; sim.speedPct = 50; sim.lastMoveT = sim.simTime;
    try {
      const r = await SP.py.run(code, api, sim, { say, warn: (m, line) => { addError({ level: 'warn', msg: m, line }); }, status: (t) => { $('py-status').textContent = t; } });
      if (r.error) {
        addError({ level: 'error', msg: r.error.message, line: r.error.line, raw: r.error.raw }); showTab('err');
        if (r.error.line) markPyLine(r.error.line);
      }
    } catch (e) { addError({ level: 'error', msg: String(e && e.message ? e.message : e) }); showTab('err'); $('py-status').textContent = ''; }
    sim.stopAll(); setRunning(false);
  }
  function stopProgram() { if (running) { SP.py.stop(); sim.abort(); } }
  $('btn-run').onclick = runProgram;
  $('btn-stop').onclick = stopProgram;

  /* ---------- 機器人設定 ---------- */
  function readSettings() {
    return { wheel: Number($('set-wheel').value), track: Number($('set-track').value), yaw: Number($('set-yaw').value), real: $('set-real').checked };
  }
  function applySettings(st) {
    if (st.wheel) $('set-wheel').value = st.wheel; if (st.track) $('set-track').value = st.track;
    if (st.yaw) $('set-yaw').value = st.yaw; $('set-real').checked = !!st.real;
    const r = readSettings();
    sim.wheelD = Math.max(2, Math.min(12, r.wheel / 10 || 5.6)); sim.track = Math.max(6, Math.min(25, r.track / 10 || 11.2));
    sim.yawSign = r.yaw === -1 ? -1 : 1; SP.yawSign = sim.yawSign; sim.real = r.real; sim.rollError();
    autosave();
  }
  ['set-wheel', 'set-track', 'set-yaw', 'set-real'].forEach((id) => { $(id).onchange = () => applySettings(readSettings()); });

  /* ---------- 報錯台 ---------- */
  const errs = [];
  const SENSOR_TYPE = { sp_color_is: 'color', sp_light: 'color', sp_when_color: 'color', sp_dist: 'distance', sp_dist_less: 'distance', sp_when_dist: 'distance', sp_force: 'force', sp_when_force: 'force' };
  const SENSOR_NAME = { color: '顏色感測器', distance: '距離感測器', force: '力感測器' };
  const isHat = (b) => b.type === 'sp_start' || b.type.startsWith('sp_when_');
  function showTab(t) {
    $('tab-out').classList.toggle('on', t === 'out'); $('tab-err').classList.toggle('on', t === 'err');
    $('console').hidden = t !== 'out'; $('errors').hidden = t !== 'err';
  }
  $('tab-out').onclick = () => showTab('out'); $('tab-err').onclick = () => showTab('err');
  function clearErrors() { errs.length = 0; renderErrors(); }
  function addError(e) { e.time = new Date().toLocaleTimeString('zh-TW', { hour12: false }); errs.push(e); renderErrors(); }
  function goto(e) {
    if (e.blockId) {
      const b = ws.getBlockById(e.blockId); if (!b) return;
      if (mode !== 'blocks') setMode('blocks');
      ws.centerOnBlock(e.blockId); b.select();
    } else if (e.line) { if (mode !== 'python') setMode('python'); markPyLine(e.line, true); }
  }
  function renderErrors() {
    const box = $('errors'); box.textContent = '';
    errs.forEach((e) => {
      const r = document.createElement('div'); r.className = 'erow ' + e.level + (e.blockId || e.line ? ' link' : '');
      const lv = document.createElement('span'); lv.className = 'lv'; lv.textContent = e.level === 'error' ? '!' : '?';
      const tx = document.createElement('span'); tx.textContent = e.msg;
      const tm = document.createElement('span'); tm.className = 'tm'; tm.textContent = e.time;
      r.append(lv, tx, tm);
      if (e.blockId || e.line) {
        const w = document.createElement('span'); w.className = 'where'; w.textContent = e.line ? '第 ' + e.line + ' 行' : '到積木'; r.append(w);
        r.onclick = () => goto(e);
      }
      if (e.raw) r.title = e.raw;
      box.appendChild(r);
    });
    const n = errs.filter((e) => e.level === 'error').length + errs.filter((e) => e.level === 'warn').length;
    $('err-badge').hidden = !n; $('err-badge').textContent = n;
    box.scrollTop = box.scrollHeight;
  }
  function lint() {
    const out = [], tops = ws.getTopBlocks(true), hats = tops.filter(isHat);
    if (!hats.length) out.push({ level: 'error', msg: '沒有「事件」積木：請放一個「當程式開始」，再把動作積木接在它下面。' });
    hats.forEach((h) => { if (!h.getNextBlock()) out.push({ level: 'warn', msg: '「' + h.toString().trim() + '」下面沒有接任何積木。', blockId: h.id }); });
    tops.forEach((b) => { if (!isHat(b) && b.type !== 'procedures_defnoreturn' && !b.isShadow()) out.push({ level: 'warn', msg: '這個積木沒有接在事件積木下面，不會被執行。', blockId: b.id }); });
    ws.getAllBlocks(false).forEach((b) => {
      const need = SENSOR_TYPE[b.type], p = need && b.getFieldValue('PORT');
      if (need && sim.ports[p] !== need) out.push({ level: 'error', msg: '埠 ' + p + ' 沒有連接' + SENSOR_NAME[need] + '（請到「主機與裝置」設定）。', blockId: b.id });
      b.inputList.forEach((inp) => {
        const c = inp.connection;
        if (inp.type === 1 && c && !c.targetBlock() && c.getCheck() && c.getCheck().includes('Boolean')) out.push({ level: 'warn', msg: '缺少條件：這個積木的「條件」是空的。', blockId: b.id });
      });
    });
    return out;
  }

  /* ---------- 積木／Python 切換 ---------- */
  let mode = 'blocks', pyDirty = false;
  const pySrc = $('py-src');
  function updateGutter() {
    const n = pySrc.value.split('\n').length, g = $('py-gutter');
    while (g.childNodes.length < n) g.appendChild(document.createElement('div'));
    while (g.childNodes.length > n) g.removeChild(g.lastChild);
    g.childNodes.forEach((d, i) => { d.textContent = i + 1; });
    g.scrollTop = pySrc.scrollTop;
  }
  function markPyLine(line, focus) {
    updateGutter();
    $('py-gutter').childNodes.forEach((d, i) => d.classList.toggle('err', line === i + 1));
    if (line && focus) {
      const lines = pySrc.value.split('\n'); let pos = 0;
      for (let i = 0; i < line - 1; i++) pos += lines[i].length + 1;
      pySrc.focus(); pySrc.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
      pySrc.scrollTop = Math.max(0, (line - 4) * 22.4); $('py-gutter').scrollTop = pySrc.scrollTop;
    }
  }
  function regenPython() {
    try {
      pySrc.value = SP.generatePython(ws, { wheel: +sim.wheelD.toFixed(2), track: +sim.track.toFixed(2) }).code;
      pyDirty = false; $('py-note').textContent = '已由積木產生'; markPyLine(null);
    } catch (e) { addError({ level: 'error', msg: '產生 Python 失敗：' + e.message }); showTab('err'); }
    autosave();
  }
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#mode-seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    $('pyview').hidden = m !== 'python';
    if (m === 'python') { if (!pyDirty) regenPython(); updateGutter(); SP.py.ensure((t) => { $('py-status').textContent = t; }).catch(() => { $('py-status').textContent = '尚未載入 Python 執行環境（需要網路）'; }); }
    else { Blockly.svgResize(ws); if (pyDirty) $('py-note').textContent = ''; }
    autosave();
  }
  document.querySelectorAll('#mode-seg button').forEach((b) => { b.onclick = () => { if (running) return; setMode(b.dataset.mode); }; });
  $('py-regen').onclick = () => {
    if (pyDirty && !confirm('重新產生會覆蓋你在 Python 裡改的內容，確定嗎？')) return;
    regenPython();
  };
  $('py-copy').onclick = async () => { try { await navigator.clipboard.writeText(pySrc.value); $('py-note').textContent = '已複製'; } catch (e) { pySrc.select(); $('py-note').textContent = '請按 Ctrl+C 複製'; } };
  pySrc.addEventListener('input', () => { pyDirty = true; $('py-note').textContent = '已手動修改（不會變回積木）'; updateGutter(); autosave(); });
  pySrc.addEventListener('scroll', () => { $('py-gutter').scrollTop = pySrc.scrollTop; });
  pySrc.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') { e.preventDefault(); const s = pySrc.selectionStart; pySrc.setRangeText('    ', s, pySrc.selectionEnd, 'end'); pySrc.dispatchEvent(new Event('input')); }
  });

  /* ---------- 儲存／開啟 ---------- */
  function snapshot() {
    return { app: 'spike-sim', v: 1, name: $('proj-name').value, ports: sim.ports, scene: $('scene').value, settings: readSettings(), mode, py: pySrc.value, pyDirty, workspace: Blockly.serialization.workspaces.save(ws) };
  }
  function restore(d) {
    stopProgram(); ws.clear();
    if (d.workspace) Blockly.serialization.workspaces.load(d.workspace, ws);
    $('proj-name').value = d.name || '未命名專案';
    if (d.ports) for (const p of ['C', 'D', 'E', 'F']) if (d.ports[p]) { sim.ports[p] = d.ports[p]; portEl[p + 'sel'].value = d.ports[p]; }
    applySettings(d.settings || {});
    pySrc.value = d.py || ''; pyDirty = !!d.pyDirty && !!d.py; clearErrors(); showTab('out');
    setMode(d.mode === 'python' ? 'python' : 'blocks');
    if (d.scene && SP.SCENES.some((s) => s.id === d.scene)) { $('scene').value = d.scene; sim.loadScene(d.scene); }
  }
  let saveT = 0;
  function autosave() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) { /* 無痕模式等 */ } }, 400); }
  ws.addChangeListener((e) => { if (!e.isUiEvent) autosave(); });
  $('proj-name').oninput = autosave; $('scene').addEventListener('change', autosave);

  $('btn-save').onclick = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = ($('proj-name').value || '專案') + '.spike.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('btn-open').onclick = () => $('file-open').click();
  $('file-open').onchange = async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try { restore(JSON.parse(await file.text())); say('已開啟：' + file.name); } catch (err) { say('無法開啟這個檔案：' + err.message, true); }
  };
  $('btn-new').onclick = () => { if (confirm('要建立新專案嗎？目前未儲存的內容會消失。')) restore({ workspace: DEFAULT, name: '未命名專案' }); };
  $('btn-help').onclick = () => $('help').showModal();

  const nb = (x) => ({ shadow: { type: 'math_number', fields: { NUM: x } } });
  const DEFAULT = { blocks: { languageVersion: 0, blocks: [{ type: 'sp_start', x: 40, y: 40, next: { block: {
    type: 'controls_repeat_ext', inputs: { TIMES: nb(4), DO: { block: {
      type: 'sp_move', fields: { DIR: '1', UNIT: 'cm' }, inputs: { N: nb(40) }, next: { block: {
        type: 'sp_turn', fields: { DIR: '1' }, inputs: { DEG: nb(90) } } } } } } } } }] } };

  /* ---------- 首頁與範例 ---------- */
  const eq = (type, fields, inputs, next) => ({ type, ...(fields ? { fields } : {}), ...(inputs ? { inputs } : {}), ...(next ? { next: { block: next } } : {}) });
  const ife = (inputs) => ({ ...eq('controls_if', null, inputs), extraState: { hasElse: true } });
  const SAMPLES = [
    { name: '走正方形', desc: '重複 4 次：前進 40 公分、右轉 90 度。', scene: 'blank', color: '#4c97ff', ws: DEFAULT },
    { name: '遇牆就轉彎', desc: '一直重複：距離小於 20 公分就右轉，不然前進。', scene: 'boxes', color: '#5cb1d6', ws: { blocks: { languageVersion: 0, blocks: [eq('sp_start', null, null, eq('sp_forever', null, { DO: { block: ife({
      IF0: { block: eq('sp_dist_less', { PORT: 'D', OP: '<' }, { N: nb(20) }) }, DO0: { block: eq('sp_turn', { DIR: '1' }, { DEG: nb(90) }) }, ELSE: { block: eq('sp_move', { DIR: '1', UNIT: 'cm' }, { N: nb(5) }) } }) } })) ] } } },
    { name: '黑線循線', desc: '顏色感測器看到黑色就向右修正，否則向左，沿著跑道繞圈。', scene: 'line', color: '#59c059', ws: { blocks: { languageVersion: 0, blocks: [eq('sp_start', null, null, eq('sp_set_speed', null, { P: nb(30) }, eq('sp_forever', null, { DO: { block: ife({
      IF0: { block: eq('sp_color_is', { PORT: 'C', COLOR: 'black' }) }, DO0: { block: eq('sp_steer', null, { STEER: nb(35) }) }, ELSE: { block: eq('sp_steer', null, { STEER: nb(-35) }) } }) } }))) ] } } },
    { name: '看到紅色就停', desc: '開始前進，等到顏色感測器看到紅色就停止並發出嗶聲。', scene: 'colors', color: '#ff8c1a', ws: { blocks: { languageVersion: 0, blocks: [eq('sp_start', null, null, eq('sp_start_move', { DIR: '1' }, null,
      eq('sp_wait_until', null, { C: { block: eq('sp_color_is', { PORT: 'C', COLOR: 'red' }) } }, eq('sp_stop', null, null, eq('sp_beep', null, { NOTE: nb(72), S: nb(0.5) }))))) ] } } },
    { name: 'Python：前進再後退', desc: '用 move_for_degrees 前進 40 公分、再後退 40 公分（負的度數代表反方向）。', scene: 'blank', color: '#3d4357', py: [
      'from hub import port', 'import runloop, motor_pair', '', '# 輪子轉一圈大約走 17.6 公分', 'def degrees_for_distance(cm):', '    return int(cm / 17.6 * 360)', '',
      'async def main():', '    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)',
      '    await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees_for_distance(40), 0)',
      '    await motor_pair.move_for_degrees(motor_pair.PAIR_1, degrees_for_distance(-40), 0)', '', 'runloop.run(main())', ''].join('\n') },
    { name: 'Python：循線（比例控制）', desc: '偏離黑線邊緣多少，就轉向修正多少。場地選「循線」，顏色感測器接 C。', scene: 'line', color: '#3d4357', py: [
      'from hub import port', 'import runloop, motor_pair, color_sensor', '',
      'async def main():', '    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)', '    while True:',
      '        # 黑線邊緣的反射光大約是 50', '        error = 50 - color_sensor.reflection(port.C)',
      '        motor_pair.move(motor_pair.PAIR_1, int(error * 0.5), velocity=300)', '', 'runloop.run(main())', ''].join('\n') },
    { name: 'Python：陀螺儀直走', desc: '用轉向角度修正方向。執行中拖曳或旋轉機器人，看它能不能自己轉回來。', scene: 'blank', color: '#3d4357', py: [
      'from hub import port, motion_sensor', 'import runloop, motor_pair', '',
      'async def main():', '    motor_pair.pair(motor_pair.PAIR_1, port.A, port.B)', '    motion_sensor.reset_yaw(0)', '    while True:',
      '        # tilt_angles()[0] 是轉向角度（單位 0.1 度，逆時針為正）', '        correction = int(motion_sensor.tilt_angles()[0] * 0.2)',
      '        motor_pair.move(motor_pair.PAIR_1, correction, velocity=200)', '', 'runloop.run(main())', ''].join('\n') },
  ];
  function tile(parent, title, desc, color, glyph, fn) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tile';
    b.innerHTML = '<div class="dot"></div><b></b><span></span>';
    b.querySelector('.dot').style.background = color; b.querySelector('.dot').textContent = glyph;
    b.querySelector('b').textContent = title; b.querySelector('span').textContent = desc;
    b.onclick = () => { fn(); $('home').hidden = true; Blockly.svgResize(ws); }; parent.appendChild(b);
  }
  function buildHome(saved) {
    $('tiles-start').textContent = ''; $('tiles-sample').textContent = '';
    tile($('tiles-start'), '新專案', '從空白開始，只有「當程式開始」。', '#4c97ff', '+', () => restore({ workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'sp_start', x: 40, y: 40 }] } }, name: '未命名專案' }));
    if (saved && saved.workspace) tile($('tiles-start'), '繼續：' + (saved.name || '未命名專案'), '回到上次編輯的內容。', '#2fb85f', '>', () => restore(saved));
    tile($('tiles-start'), '開啟檔案', '開啟之前儲存的 .json。', '#9966ff', '↑', () => $('file-open').click());
    SAMPLES.forEach((s) => tile($('tiles-sample'), s.name, s.desc, s.color, s.py ? 'Py' : '▶', () => restore(s.py
      ? { name: s.name, workspace: { blocks: { languageVersion: 0, blocks: [{ type: 'sp_start', x: 40, y: 40 }] } }, scene: s.scene, mode: 'python', py: s.py, pyDirty: true }
      : { name: s.name, workspace: s.ws, scene: s.scene })));
  }
  $('btn-home').onclick = () => { stopProgram(); let sv = null; try { sv = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* 略 */ } buildHome(sv); $('home').hidden = false; };

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  try { restore(saved && saved.workspace ? saved : { workspace: DEFAULT }); } catch (e) { restore({ workspace: DEFAULT }); }
  buildHome(saved);
  window.addEventListener('resize', () => Blockly.svgResize(ws));
  SP.ws = ws; SP.sim = sim; SP.run = runProgram;
})(window.SP = window.SP || {});
