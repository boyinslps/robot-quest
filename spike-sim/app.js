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
  const api = SP.createApi(sim, { hl: (id) => ws.highlightBlock(id), say });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let running = false;
  function setRunning(r) { running = r; $('btn-run').hidden = r; $('btn-stop').hidden = !r; }
  async function runProgram() {
    if (running) return;
    let gen;
    try { gen = SP.generate(ws); } catch (e) { say('積木轉換失敗：' + e.message, true); return; }
    if (!gen.threads) { say('請先放一個「事件」類別的「當程式開始」積木，再把動作積木接在下面。', true); return; }
    setRunning(true); $('console').textContent = '';
    api.resetRun(); sim.yawOff = sim.th; sim.timerOff = sim.simTime; sim.speedPct = 50; sim.lastMoveT = sim.simTime;
    try { await new AsyncFunction('api', gen.code)(api); }
    catch (e) { if (e !== SP.STOP) say('錯誤：' + (e && e.message ? e.message : e), true); }
    sim.stopAll(); ws.highlightBlock(null); setRunning(false);
  }
  function stopProgram() { if (running) sim.abort(); }
  $('btn-run').onclick = runProgram;
  $('btn-stop').onclick = stopProgram;

  /* ---------- 儲存／開啟 ---------- */
  function snapshot() {
    return { app: 'spike-sim', v: 1, name: $('proj-name').value, ports: sim.ports, scene: $('scene').value, workspace: Blockly.serialization.workspaces.save(ws) };
  }
  function restore(d) {
    stopProgram(); ws.clear();
    if (d.workspace) Blockly.serialization.workspaces.load(d.workspace, ws);
    $('proj-name').value = d.name || '未命名專案';
    if (d.ports) for (const p of ['C', 'D', 'E', 'F']) if (d.ports[p]) { sim.ports[p] = d.ports[p]; portEl[p + 'sel'].value = d.ports[p]; }
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

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
  try { restore(saved && saved.workspace ? saved : { workspace: DEFAULT }); } catch (e) { restore({ workspace: DEFAULT }); }
  window.addEventListener('resize', () => Blockly.svgResize(ws));
  SP.ws = ws; SP.sim = sim; SP.run = runProgram;
})(window.SP = window.SP || {});
