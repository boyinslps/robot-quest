/* 元件模擬：偵測左邊用到哪些零件，只把用得到的零件放出來；零件多就分割畫面。
   所有操作都是直接用滑鼠：按壓就按、轉馬達就拖、陀螺儀就拖著轉、色塊與物體直接拖到感測器前面。 */
(function (SP) {
  'use strict';
  const U = SP.ui; if (!U) return;
  const sim = U.sim, api = U.api, ws = U.ws;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); for (const k of kids.flat()) if (k) e.append(k); return e; };
  const H = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k === 'text') e.textContent = v; else e.setAttribute(k, v); } for (const k of kids.flat()) if (k) e.append(k); return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rad = (d) => d * Math.PI / 180;
  const svgPt = (svg, e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };

  const COLOR_HEX = { black: '#1b1b1f', white: '#ffffff', red: '#d93025', yellow: '#f2c400', green: '#1e9e4a', blue: '#1a60d6', none: '#9aa0a6' };
  const COLOR_ZH = { black: '黑色', white: '白色', red: '紅色', yellow: '黃色', green: '綠色', blue: '藍色', none: '沒有東西' };
  const COLOR_NUM = { black: 0, blue: 3, green: 6, yellow: 7, red: 9, white: 10, none: -1 };
  const FACE = ['上面', '前面', '右面', '下面', '後面', '左面'];

  /* ---------- 偵測：左邊用到哪些零件 ---------- */
  const T_HUB = new Set(['sp_light_bright', 'sp_light_image', 'sp_light_image_for', 'sp_light_off', 'sp_light_orient', 'sp_light_pattern', 'sp_light_pixel', 'sp_light_rotate', 'sp_light_text', 'sp_power_light', 'sp_when_button', 'sp_button_is']);
  const T_MOVE = new Set(['sp_move', 'sp_start_move', 'sp_steer', 'sp_steer_for', 'sp_stop', 'sp_stop_mode', 'sp_tank', 'sp_turn', 'sp_set_speed', 'sp_set_pair', 'sp_set_distance']);
  const T_GYRO = new Set(['sp_yaw', 'sp_reset_yaw', 'sp_angle', 'sp_when_tilt', 'sp_when_gesture', 'sp_when_orient', 'sp_tilt_is', 'sp_gesture_is', 'sp_orient_is', 'sp_turn']);
  const T_SENSOR = {
    sp_color: 'color', sp_color_is: 'color', sp_reflect_is: 'color', sp_light: 'color', sp_when_color: 'color',
    sp_dist: 'dist', sp_dist_is: 'dist', sp_dist_less: 'dist', sp_when_dist: 'dist', sp_dist_light: 'dist',
    sp_force: 'force', sp_pressed_is: 'force', sp_force_val: 'force', sp_when_force: 'force',
  };
  const DEFAULT_PORT = { color: 'C', dist: 'D', force: 'E' };
  const SENSOR_PORTS = ['C', 'D', 'E', 'F'];

  function detect() {
    const found = { hub: false, gyro: false, motors: new Set(), color: new Set(), dist: new Set(), force: new Set() };
    if (U.mode() === 'python') {
      const src = U.pySrc.value;
      const port = (mod, set, def, valid) => {
        const re = new RegExp('\\b' + mod + '\\.\\w+\\(\\s*(?:\\w+\\.)?port\\.([A-F])', 'g'); let m, any = false;
        while ((m = re.exec(src))) { any = true; if (valid.includes(m[1])) set.add(m[1]); }
        if (!any && new RegExp('\\b' + mod + '\\.\\w+').test(src)) set.add(def);
      };
      port('motor', found.motors, 'A', ['A', 'B']);
      if (/\bmotor_pair\./.test(src)) { found.motors.add('A'); found.motors.add('B'); }
      port('color_sensor', found.color, 'C', SENSOR_PORTS); port('distance_sensor', found.dist, 'D', SENSOR_PORTS); port('force_sensor', found.force, 'E', SENSOR_PORTS);
      if (/\b(light_matrix|button|light)\.\w+/.test(src)) found.hub = true;
      if (/\bmotion_sensor\.\w+/.test(src)) found.gyro = true;
    } else {
      for (const b of ws.getAllBlocks(false)) {
        if (b.isInsertionMarker && b.isInsertionMarker()) continue;
        if (b.isEnabled && !b.isEnabled()) continue;
        const t = b.type, p = b.getFieldValue && b.getFieldValue('PORT');
        if (T_HUB.has(t)) found.hub = true;
        if (T_GYRO.has(t)) found.gyro = true;
        if (T_MOVE.has(t)) { found.motors.add('A'); found.motors.add('B'); }
        if (t.startsWith('sp_motor_') && (p === 'A' || p === 'B')) found.motors.add(p);
        const k = T_SENSOR[t]; if (k && SENSOR_PORTS.includes(p)) found[k].add(p);
      }
    }
    const parts = [];
    if (found.hub) parts.push('hub');
    for (const p of ['A', 'B']) if (found.motors.has(p)) parts.push('motor:' + p);
    for (const k of ['color', 'dist', 'force']) for (const p of [...found[k]].sort()) parts.push(k + ':' + p);
    if (found.gyro) parts.push('gyro');
    return parts;
  }

  /* ---------- 零件外框 ---------- */
  function frame(title, dotColor, port, hint) {
    const body = H('div', { class: 'part-b' }), foot = H('div', { class: 'part-f' });
    const root = H('section', { class: 'part' }, H('div', { class: 'part-h' }, H('span', { class: 'dot', style: 'background:' + dotColor }), title, port ? H('span', { class: 'ptag', text: port }) : null), body, foot, H('div', { class: 'part-hint', text: hint }));
    const chips = {};
    const chip = (name, label) => { const b = H('b', { text: '—' }); foot.append(H('span', {}, label + ' ', b)); chips[name] = (v) => { if (b.textContent !== String(v)) b.textContent = v; }; };
    return { root, body, foot, chip, chips, note: null };
  }
  function dragger(target, { down, move, up }) {
    target.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; e.preventDefault(); target.setPointerCapture(e.pointerId); if (down(e) === false) { try { target.releasePointerCapture(e.pointerId); } catch (x) { /* 略 */ } } });
    target.addEventListener('pointermove', (e) => { if (target.hasPointerCapture(e.pointerId)) move(e); });
    const end = (e) => { if (target.hasPointerCapture(e.pointerId)) { try { target.releasePointerCapture(e.pointerId); } catch (x) { /* 略 */ } up(e); } };
    target.addEventListener('pointerup', end); target.addEventListener('pointercancel', end);
  }

  /* ---------- 母體燈（5×5 燈、電源鍵、左右按鈕） ---------- */
  function hubPart() {
    const f = frame('母體燈', '#b896f8', '', '按住下面的左、右按鈕，程式就能收到。');
    const svg = S('svg', { viewBox: '0 0 220 270', preserveAspectRatio: 'xMidYMid meet' });
    svg.append(S('rect', { x: 36, y: 8, width: 148, height: 254, rx: 16, fill: '#fff', stroke: '#c9cdd8', 'stroke-width': 3 }), S('rect', { x: 36, y: 8, width: 22, height: 254, rx: 12, fill: '#ffd400' }));
    const cells = []; for (let i = 0; i < 25; i++) { const c = S('rect', { x: 66 + (i % 5) * 20, y: 40 + Math.floor(i / 5) * 20, width: 17, height: 17, rx: 4, fill: '#e6e9ef' }); cells.push(c); svg.append(c); }
    const power = S('circle', { cx: 122, cy: 170, r: 17, fill: '#fff', stroke: '#9aa0b0', 'stroke-width': 3 }); svg.append(power);
    const btn = (side, cx) => {
      const g = S('g', { class: 'press' }, S('rect', { x: cx - 20, y: 205, width: 40, height: 34, rx: 10, fill: '#f1f3f7', stroke: '#9aa0b0', 'stroke-width': 3 }), S('path', { d: side === 'left' ? `M${cx + 6} 214 L${cx - 8} 222 L${cx + 6} 230 Z` : `M${cx - 6} 214 L${cx + 8} 222 L${cx - 6} 230 Z`, fill: '#6b7287' }));
      dragger(g, { down: () => { sim.buttons[side] = performance.now(); g.setAttribute('transform', 'translate(0 3)'); }, move: () => {}, up: () => { sim.buttons[side] = 0; g.removeAttribute('transform'); } });
      svg.append(g); return g;
    };
    btn('left', 90); btn('right', 150);
    f.body.append(svg); f.chip('text', '顯示'); f.chip('btn', '按鈕');
    return { id: 'hub', root: f.root, tick() {
      const r = sim.matrixRot;
      for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 5; cx++) {
        const [sx, sy] = r === 0 ? [cx, cy] : r === 1 ? [cy, 4 - cx] : r === 2 ? [4 - cx, 4 - cy] : [4 - cy, cx]; const b = sim.led[sy * 5 + sx] || 0;
        const k = b / 100; cells[cy * 5 + cx].setAttribute('fill', b ? `rgb(${Math.round(230 + 25 * k)},${Math.round(233 - 40 * k)},${Math.round(239 - 239 * k)})` : '#e6e9ef');
      }
      power.setAttribute('fill', U.POWER_CSS[sim.powerColor] || '#fff');
      f.chips.text(sim.displayText || '—'); f.chips.btn((sim.buttons.left ? '左 ' : '') + (sim.buttons.right ? '右' : '') || '沒按');
    } };
  }

  /* ---------- 馬達（用滑鼠轉動） ---------- */
  function motorPart(p) {
    const m = () => (p === 'A' ? sim.mL : sim.mR);
    const f = frame('馬達', '#0090f5', p, '用滑鼠在轉盤上拖，就像用手轉馬達。');
    f.root.querySelector('.part-h').firstChild.nextSibling.textContent = p === 'A' ? '馬達（左輪）' : '馬達（右輪）';
    const svg = S('svg', { viewBox: '0 0 240 240', preserveAspectRatio: 'xMidYMid meet' });
    const ring = S('circle', { cx: 120, cy: 120, r: 108, fill: '#0090f5', stroke: '#0069b3', 'stroke-width': 4 }); svg.append(ring, S('circle', { cx: 120, cy: 120, r: 84, fill: '#eaf4ff' }));
    for (let i = 0; i < 36; i++) { const a = rad(i * 10), big = i % 9 === 0; svg.append(S('line', { x1: 120 + 100 * Math.sin(a), y1: 120 - 100 * Math.cos(a), x2: 120 + (big ? 88 : 93) * Math.sin(a), y2: 120 - (big ? 88 : 93) * Math.cos(a), stroke: '#fff', 'stroke-width': big ? 3 : 1.5 })); }
    [[0, '0'], [90, '90'], [180, '180'], [270, '270']].forEach(([d, t]) => svg.append(S('text', { x: 120 + 70 * Math.sin(rad(d)), y: 125 - 70 * Math.cos(rad(d)), 'text-anchor': 'middle', 'font-size': 14, 'font-weight': 800, fill: '#3b6a9a' }, document.createTextNode(t))));
    const rotor = S('g', { class: 'grab' }, S('circle', { cx: 120, cy: 120, r: 50, fill: '#fff', stroke: '#1c8fd6', 'stroke-width': 3 }),
      S('line', { x1: 120, y1: 120, x2: 120, y2: 74, stroke: '#cfd8e6', 'stroke-width': 10, 'stroke-linecap': 'round' }), S('line', { x1: 120, y1: 120, x2: 166, y2: 120, stroke: '#cfd8e6', 'stroke-width': 10, 'stroke-linecap': 'round' }),
      S('line', { x1: 120, y1: 120, x2: 120, y2: 166, stroke: '#cfd8e6', 'stroke-width': 10, 'stroke-linecap': 'round' }), S('line', { x1: 120, y1: 120, x2: 74, y2: 120, stroke: '#cfd8e6', 'stroke-width': 10, 'stroke-linecap': 'round' }),
      S('circle', { cx: 120, cy: 62, r: 9, fill: '#e5483d', stroke: '#fff', 'stroke-width': 2 }), S('circle', { cx: 120, cy: 120, r: 11, fill: '#3d4357' }));
    svg.append(rotor);
    let last = null;
    const ang = (e) => { const b = ring.getBoundingClientRect(); return Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2))) * 180 / Math.PI; };
    dragger(svg, { down: (e) => { last = ang(e); rotor.classList.add('grabbing'); }, move: (e) => { const a = ang(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; m().deg += d; m().cur = 0; last = a; }, up: () => { last = null; rotor.classList.remove('grabbing'); } });
    f.body.append(svg); f.chip('pos', '位置'); f.chip('turn', '共轉'); f.chip('v', '轉速');
    return { id: 'motor:' + p, root: f.root, tick() {
      const d = m().deg; rotor.setAttribute('transform', `rotate(${(d % 360 + 360) % 360} 120 120)`);
      f.chips.pos(((Math.round(d) % 360) + 360) % 360 + '°'); f.chips.turn((d / 360).toFixed(2) + ' 圈'); f.chips.v(Math.round(m().cur || 0) + '°/秒');
    } };
  }

  /* ---------- 顏色感測器（把色塊拖到前面） ---------- */
  const state = { brick: null, hover: null, dist: 200, force: 0 };
  function colorPart(port) {
    const f = frame('顏色感測器', '#34ccf1', port, '把色塊拖到感測器下面的框裡；拖走就是拿開。');
    const svg = S('svg', { viewBox: '0 0 240 270', preserveAspectRatio: 'xMidYMid meet' });
    const beam = S('path', { d: 'M104 98 L136 98 L176 160 L64 160 Z', fill: '#9fe0f5', opacity: 0.45 });
    const lens = S('circle', { cx: 120, cy: 90, r: 15, fill: '#9aa0a6', stroke: '#222', 'stroke-width': 3 });
    svg.append(S('rect', { x: 78, y: 10, width: 84, height: 66, rx: 12, fill: '#fff', stroke: '#2a2d35', 'stroke-width': 3 }), S('rect', { x: 78, y: 10, width: 84, height: 18, rx: 10, fill: '#2a2d35' }), S('rect', { x: 100, y: 70, width: 40, height: 30, rx: 6, fill: '#2a2d35' }), beam, lens);
    const zone = S('rect', { x: 60, y: 138, width: 120, height: 66, rx: 12, fill: 'none', stroke: '#9aa5bd', 'stroke-width': 3, 'stroke-dasharray': '8 6' }); svg.append(zone, S('text', { x: 120, y: 226, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 700, fill: '#8a91a6' }, document.createTextNode('放在這裡讓感測器看')));
    const order = ['red', 'yellow', 'green', 'blue', 'black', 'white'], bricks = {};
    const ZX = 120, ZY = 171;
    order.forEach((c, i) => {
      const g = S('g', { class: 'grab' }, S('rect', { x: -17, y: -12, width: 34, height: 24, rx: 4, fill: COLOR_HEX[c], stroke: c === 'white' ? '#9aa0b0' : 'rgba(0,0,0,.35)', 'stroke-width': 2 }), S('circle', { cx: -8, cy: -14, r: 4, fill: COLOR_HEX[c], stroke: c === 'white' ? '#9aa0b0' : 'rgba(0,0,0,.35)', 'stroke-width': 1.5 }), S('circle', { cx: 8, cy: -14, r: 4, fill: COLOR_HEX[c], stroke: c === 'white' ? '#9aa0b0' : 'rgba(0,0,0,.35)', 'stroke-width': 1.5 }));
      const b = { c, g, home: [30 + i * 36, 252], pos: [30 + i * 36, 252], drag: false }; bricks[c] = b; svg.append(g);
      dragger(g, { down: (e) => { b.drag = true; if (state.brick === c) state.brick = null; const p = svgPt(svg, e); b.pos = [p.x, p.y]; }, move: (e) => { const p = svgPt(svg, e); b.pos = [p.x, p.y]; },
        up: () => { b.drag = false; const [x, y] = b.pos; state.brick = (x > 56 && x < 184 && y > 124 && y < 218) ? c : (state.brick === c ? null : state.brick); } });
    });
    f.body.append(svg); f.chip('c', '看到'); f.chip('l', '反射光');
    const okType = () => sim.ports[port] === 'color';
    return { id: 'color:' + port, root: f.root, tick() {
      let hover = null; for (const c of order) { const b = bricks[c]; if (b.drag && b.pos[0] > 56 && b.pos[0] < 184 && b.pos[1] > 124 && b.pos[1] < 218) hover = c; }
      for (const c of order) { const b = bricks[c]; const tgt = b.drag ? b.pos : state.brick === c ? [ZX, ZY] : b.home; b.g.setAttribute('transform', `translate(${tgt[0]} ${tgt[1]})`); }
      state.hover = hover;
      const seen = hover || state.brick || 'none';
      lens.setAttribute('fill', COLOR_HEX[seen]); beam.setAttribute('opacity', seen === 'none' ? 0.2 : 0.6);
      f.root.classList.toggle('warn', !okType());
      f.chips.c(okType() ? COLOR_ZH[seen] + (seen === 'none' ? '' : '（' + COLOR_NUM[seen] + '）') : '這個埠接的不是顏色感測器'); f.chips.l(okType() ? sim.light() + '%' : '—');
    }, hovered: () => null };
  }

  /* ---------- 距離感測器（拖動物體） ---------- */
  function distPart(port) {
    const f = frame('距離感測器', '#34ccf1', port, '左右拖動灰色物體，看距離怎麼變；拖到最右邊就是拿開。');
    const svg = S('svg', { viewBox: '0 0 280 170', preserveAspectRatio: 'xMidYMid meet' });
    const X0 = 78, PX = 0.95;                        // 0 公分的位置、每公分幾格
    const cone = S('path', { d: '', fill: '#9fe0f5', opacity: 0.4 });
    svg.append(S('rect', { x: 8, y: 48, width: 62, height: 74, rx: 10, fill: '#fff', stroke: '#2a2d35', 'stroke-width': 3 }), S('rect', { x: 8, y: 48, width: 62, height: 14, rx: 8, fill: '#2a2d35' }), cone);
    const eyes = [S('circle', { cx: 39, cy: 78, r: 11, fill: '#2a2d35', stroke: '#d6d9de', 'stroke-width': 4 }), S('circle', { cx: 39, cy: 110, r: 11, fill: '#2a2d35', stroke: '#d6d9de', 'stroke-width': 4 })];
    const dots = [S('circle', { cx: 24, cy: 78, r: 4, fill: '#444' }), S('circle', { cx: 24, cy: 110, r: 4, fill: '#444' }), S('circle', { cx: 54, cy: 78, r: 4, fill: '#444' }), S('circle', { cx: 54, cy: 110, r: 4, fill: '#444' })];
    svg.append(...eyes, ...dots, S('line', { x1: X0, y1: 140, x2: X0 + 200 * PX, y2: 140, stroke: '#9aa5bd', 'stroke-width': 3 }));
    for (let cm = 0; cm <= 200; cm += 10) { svg.append(S('line', { x1: X0 + cm * PX, y1: 140, x2: X0 + cm * PX, y2: cm % 50 === 0 ? 150 : 145, stroke: '#9aa5bd', 'stroke-width': 2 })); if (cm % 50 === 0) svg.append(S('text', { x: X0 + cm * PX, y: 164, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: '#8a91a6' }, document.createTextNode(cm))); }
    const obj = S('g', { class: 'grab' }, S('rect', { x: -11, y: -34, width: 22, height: 68, rx: 5, fill: '#8d94a6', stroke: '#575d6d', 'stroke-width': 3 }), S('rect', { x: -11, y: -34, width: 22, height: 14, rx: 5, fill: '#a9afbf' }));
    svg.append(obj);
    dragger(svg, { down: (e) => { const p = svgPt(svg, e); if (Math.abs(p.x - (X0 + state.dist * PX)) > 24 || Math.abs(p.y - 90) > 50) { if (p.x < X0 - 10) return false; } state.dist = clamp((p.x - X0) / PX, 0, 200); obj.classList.add('grabbing'); },
      move: (e) => { state.dist = clamp((svgPt(svg, e).x - X0) / PX, 0, 200); }, up: () => { obj.classList.remove('grabbing'); if (state.dist >= 196) state.dist = 200; } });
    f.body.append(svg); f.chip('d', '距離'); f.chip('p', '百分比');
    const okType = () => sim.ports[port] === 'distance';
    return { id: 'dist:' + port, root: f.root, tick() {
      const d = state.dist, none = d >= 200, x = X0 + d * PX;
      obj.setAttribute('transform', `translate(${x} 90)`); obj.setAttribute('opacity', none ? 0.35 : 1);
      cone.setAttribute('d', `M70 82 L${x - 11} ${none ? 60 : 72} L${x - 11} ${none ? 120 : 108} L70 106 Z`); cone.setAttribute('opacity', none ? 0.15 : 0.45);
      dots.forEach((dt, i) => { const v = sim.distLights[i] || 0; dt.setAttribute('fill', v ? `rgb(${Math.round(60 + v * 1.9)},230,255)` : '#444'); });
      f.root.classList.toggle('warn', !okType());
      f.chips.d(!okType() ? '這個埠接的不是距離感測器' : none ? '沒偵測到' : Math.round(d) + ' 公分'); f.chips.p(okType() && !none ? Math.round(d / 2) + '%' : '—');
    } };
  }

  /* ---------- 力傳感器（按住圓鈕，越久越用力） ---------- */
  function forcePart(port) {
    const f = frame('力傳感器', '#34ccf1', port, '用滑鼠按住黑色圓鈕，按得越久越用力；放開就鬆開。');
    const svg = S('svg', { viewBox: '0 0 240 230', preserveAspectRatio: 'xMidYMid meet' });
    svg.append(S('rect', { x: 36, y: 18, width: 130, height: 180, rx: 16, fill: '#fff', stroke: '#2a2d35', 'stroke-width': 3 }), S('rect', { x: 36, y: 18, width: 130, height: 22, rx: 12, fill: '#2a2d35' }));
    const btn = S('g', { class: 'press' }, S('circle', { cx: 101, cy: 118, r: 46, fill: '#5b606d' }), S('circle', { cx: 101, cy: 112, r: 42, fill: '#2a2d35', stroke: '#14161b', 'stroke-width': 3 }), S('circle', { cx: 101, cy: 112, r: 26, fill: 'none', stroke: '#454a57', 'stroke-width': 3 }));
    svg.append(btn);
    const gauge = S('rect', { x: 196, y: 198, width: 22, height: 0, rx: 6, fill: '#2d7cff' }); svg.append(S('rect', { x: 196, y: 18, width: 22, height: 180, rx: 8, fill: '#eef1f6', stroke: '#c9cdd8', 'stroke-width': 2 }), gauge, S('text', { x: 207, y: 214, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 700, fill: '#8a91a6' }, document.createTextNode('牛頓')));
    let down = 0, raf = 0;
    const ramp = () => { if (!down) return; state.force = Math.min(10, 0.8 + (performance.now() - down) / 1000 * 6); raf = requestAnimationFrame(ramp); };
    dragger(btn, { down: () => { down = performance.now(); state.force = 0.8; ramp(); }, move: () => {}, up: () => { down = 0; cancelAnimationFrame(raf); state.force = 0; } });
    f.body.append(svg); f.chip('n', '力'); f.chip('s', '狀態');
    const okType = () => sim.ports[port] === 'force';
    return { id: 'force:' + port, root: f.root, tick() {
      const n = state.force; btn.setAttribute('transform', `translate(0 ${Math.min(8, n * 1.2)})`);
      const h = n / 10 * 180; gauge.setAttribute('y', 198 - h); gauge.setAttribute('height', h);
      f.root.classList.toggle('warn', !okType());
      f.chips.n(okType() ? n.toFixed(1) + ' 牛頓' : '這個埠接的不是力傳感器'); f.chips.s(okType() ? (n === 0 ? '放開' : n >= 5 ? '重壓' : '按下') : '—');
    } };
  }

  /* ---------- 陀螺儀（拖著主機轉） ---------- */
  function gyroPart() {
    const f = frame('陀螺儀', '#34ccf1', '', '拖主機＝傾斜；拖外面的圈＝轉向；快速甩動＝搖晃；點一下＝輕拍。');
    const wrap = H('div', { class: 'gyro-wrap' });
    const hub = H('div', { class: 'hub3d' }, H('div', { class: 'face' }));
    hub.firstChild.innerHTML = '<svg viewBox="0 0 80 100"><g fill="#d9dde6">' + Array.from({ length: 25 }, (_, i) => `<rect x="${6 + (i % 5) * 14}" y="${6 + Math.floor(i / 5) * 14}" width="11" height="11" rx="3"/>`).join('') + '</g><circle cx="40" cy="84" r="8" fill="#fff" stroke="#9aa0b0" stroke-width="2"/></svg>';
    const ring = S('svg', { class: 'ringsvg', viewBox: '0 0 260 260' });
    const track = S('circle', { cx: 130, cy: 130, r: 120, fill: 'none', stroke: '#dfe5f0', 'stroke-width': 10 });
    const hit = S('circle', { cx: 130, cy: 130, r: 120, fill: 'none', stroke: 'transparent', 'stroke-width': 30, class: 'hit' });
    const knob = S('circle', { cx: 130, cy: 10, r: 11, fill: '#ffd400', stroke: '#c99a00', 'stroke-width': 3 });
    ring.append(track, hit, S('text', { x: 130, y: 40, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 800, fill: '#8a91a6' }, document.createTextNode('轉向')), knob);
    wrap.append(ring, hub); f.body.append(wrap);
    f.chip('yaw', '偏航'); f.chip('pitch', '俯仰'); f.chip('roll', '滾動'); f.chip('face', '朝上'); f.chip('g', '手勢');
    /* 拖主機：傾斜、搖晃、輕拍 */
    let drag = null;
    const shakeCheck = (e) => {
      const t = performance.now(), d = drag; const vx = (e.clientX - d.lx) / Math.max(1, t - d.lt), vy = (e.clientY - d.ly) / Math.max(1, t - d.lt);
      for (const [v, k] of [[vx, 'dx'], [vy, 'dy']]) if (Math.abs(v) > 0.7) { const s = Math.sign(v); if (d[k] && s !== d[k]) d.rev.push(t); d[k] = s; }
      d.rev = d.rev.filter((r) => t - r < 800); if (d.rev.length >= 4) { sim.doGesture('shaken'); d.rev = []; }
      d.lx = e.clientX; d.ly = e.clientY; d.lt = t;
    };
    dragger(hub, {
      down: (e) => { drag = { x: e.clientX, y: e.clientY, p0: sim.hand.pitch, r0: sim.hand.roll, t0: performance.now(), moved: 0, lx: e.clientX, ly: e.clientY, lt: performance.now(), dx: 0, dy: 0, rev: [] }; hub.classList.add('grabbing'); },
      move: (e) => { const d = drag; d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y)); sim.hand.pitch = clamp(d.p0 + (e.clientY - d.y) * 0.6, -90, 90); sim.hand.roll = clamp(d.r0 + (e.clientX - d.x) * 0.6, -90, 90); shakeCheck(e); },
      up: () => { if (drag && drag.moved < 5 && performance.now() - drag.t0 < 350) sim.doGesture('tapped'); drag = null; hub.classList.remove('grabbing'); },
    });
    /* 拖外圈：轉向（偏航） */
    let last = null;
    const ang = (e) => { const b = track.getBoundingClientRect(); return Math.atan2(e.clientX - (b.left + b.width / 2), -(e.clientY - (b.top + b.height / 2))) * 180 / Math.PI; };
    dragger(hit, { down: (e) => { last = ang(e); }, move: (e) => { const a = ang(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; sim.yawOff -= sim.yawSign * rad(d); last = a; }, up: () => { last = null; } });
    const ro = new ResizeObserver(() => { const b = f.body.getBoundingClientRect(); wrap.style.transform = `scale(${Math.max(0.3, Math.min(1.2, Math.min(b.width, b.height) / 270))})`; }); ro.observe(f.body);
    return { id: 'gyro', root: f.root, tick() {
      if (!drag) { sim.hand.pitch *= 0.8; sim.hand.roll *= 0.8; if (Math.abs(sim.hand.pitch) < 0.3) sim.hand.pitch = 0; if (Math.abs(sim.hand.roll) < 0.3) sim.hand.roll = 0; }
      const y = sim.yaw();
      hub.style.transform = `rotateX(58deg) rotateZ(${y * sim.yawSign}deg) rotateX(${-sim.hand.pitch}deg) rotateY(${sim.hand.roll}deg)`;
      knob.setAttribute('transform', `rotate(${y * sim.yawSign} 130 130)`);
      f.chips.yaw(y + '°'); f.chips.pitch(Math.round(sim.hand.pitch) + '°'); f.chips.roll(Math.round(sim.hand.roll) + '°'); f.chips.face(FACE[api.upFace()]);
      const g = sim.gesture(); f.chips.g(g === 'shaken' ? '搖晃' : g === 'tapped' ? '輕拍' : g === 'falling' ? '自由落體' : '—');
    }, destroy() { ro.disconnect(); } };
  }

  /* ---------- 版面：零件多就分割 ---------- */
  const root = $('tab-comp'), grid = H('div', { class: 'comp-grid' }), empty = H('div', { class: 'comp-empty' }, H('div', {}, H('b', { text: '還沒有用到會動的零件' }), '到左邊拖一個積木過來，例如「馬達 轉動」、「當 力傳感器 被按下」，',
    H('br'), '這裡就會出現對應的零件，可以直接用滑鼠玩。'));
  root.append(grid, empty);
  const make = (id) => { const [k, p] = id.split(':'); return k === 'hub' ? hubPart() : k === 'motor' ? motorPart(p) : k === 'color' ? colorPart(p) : k === 'dist' ? distPart(p) : k === 'force' ? forcePart(p) : gyroPart(); };
  let panes = new Map(), sig = '';
  function connect(ids) {
    let changed = false;
    for (const id of ids) { const [k, p] = id.split(':'); const type = { color: 'color', dist: 'distance', force: 'force' }[k]; if (type && sim.ports[p] === 'none') { sim.ports[p] = type; changed = true; } }
    if (changed) U.refreshPortSelects();
  }
  function render(ids) {
    connect(ids);
    for (const [id, pn] of panes) if (!ids.includes(id)) { if (pn.destroy) pn.destroy(); pn.root.remove(); panes.delete(id); }
    for (const id of ids) if (!panes.has(id)) panes.set(id, make(id));
    ids.forEach((id) => grid.append(panes.get(id).root));      // 依官方順序排好
    grid.className = 'comp-grid n' + Math.min(ids.length, 8); empty.hidden = ids.length > 0; grid.hidden = ids.length === 0;
  }
  function refresh() {
    const ids = detect(), s = ids.join('|');
    const badge = $('comp-badge'); badge.hidden = !ids.length; badge.textContent = ids.length;
    if (s !== sig) { sig = s; render(ids); }
  }
  setInterval(refresh, 300);

  /* ---------- 切換：場地模擬 / 元件模擬 ---------- */
  let view = 'field', raf = 0;
  function applyHand() {
    sim.hand.color = state.hover || state.brick || 'none'; sim.hand.dist = state.dist; sim.hand.force = state.force;
  }
  function loop() {
    if (view !== 'comp') return;
    applyHand(); for (const pn of panes.values()) pn.tick();
    raf = requestAnimationFrame(loop);
  }
  function showView(v) {
    if (v === view) return; view = v;
    document.querySelectorAll('#viewtabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    $('tab-field').hidden = v !== 'field'; root.hidden = v !== 'comp';
    if (v === 'comp') { sim.lifted = true; refresh(); cancelAnimationFrame(raf); loop(); }
    else {
      cancelAnimationFrame(raf); sim.lifted = false; sim.buttons.left = sim.buttons.right = 0;
      Object.assign(sim.hand, { color: null, dist: null, force: null, pitch: 0, roll: 0 }); state.brick = null; state.hover = null; state.dist = 200; state.force = 0;
      setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
    }
  }
  document.querySelectorAll('#viewtabs button').forEach((b) => { b.onclick = () => showView(b.dataset.view); });
  SP.showView = showView; SP.compParts = () => [...panes.keys()];
  refresh();
})(window.SP = window.SP || {});
