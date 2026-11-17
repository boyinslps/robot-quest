/* 接口連接：獨立的畫面。六個零件用官方圖片，零件上的線＋插頭可以拖曳，插到主機的接口（A～F）。
   拖出來＝拔掉；插到有零件的接口＝兩個互換。資料寫回 sim.ports（和「主機與裝置」的下拉選單、元件模擬同一份）。 */
(function (SP) {
  'use strict';
  const U = SP.ui; if (!U) return;
  const sim = U.sim;
  const $ = (id) => document.getElementById(id);
  const NS = 'http://www.w3.org/2000/svg';
  const S = (tag, attrs, ...kids) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); for (const k of kids.flat()) if (k != null) e.append(k); return e; };
  const ALL = ['A', 'B', 'C', 'D', 'E', 'F'];
  const ZH = { motor: '馬達', color: '顏色感測器', distance: '距離感測器', force: '力感測器' };
  const IMG = { motor: 'assets/parts/render/motor.png', color: 'assets/parts/render/color.png', distance: 'assets/parts/render/distance.png', force: 'assets/parts/render/force.png' };   // 用 LDraw 零件模型畫的圖（render.html）
  const ASPECT = { motor: 480 / 360, color: 480 / 360, distance: 480 / 360, force: 480 / 360 };

  const W = 900, HH = 740;
  const HUB = { x: 225, y: 20, w: 450, h: 703 }, K = 450 / 512;   // 主機正上方圖（render/hub-top.png 512×800，8 像素＝1 公釐）
  // 接口位置（主機圖座標）：左邊 A、C、E，右邊 B、D、F；開口在長邊
  const SOCK = {};
  [['A', 32, 272], ['C', 32, 400], ['E', 32, 528], ['B', 480, 272], ['D', 480, 400], ['F', 480, 528]].forEach(([p, x, y]) => { SOCK[p] = { x: HUB.x + x * K, y: HUB.y + y * K, dir: x < 200 ? 1 : -1 }; });   // dir：插頭朝向（1＝往右插進去）

  const root = $('tab-wire'); if (!root) return;
  const svg = S('svg', { viewBox: '0 0 ' + W + ' ' + HH, class: 'wire-svg', role: 'application', 'aria-label': '接口連接：拖曳零件的插頭到主機的接口' });
  root.append(svg);
  const defs = S('defs');
  defs.innerHTML = '<filter id="wsh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-opacity=".25"/></filter>';
  svg.append(defs);
  const gHub = S('g'), gCable = S('g'), gSock = S('g'), gParts = S('g'), gPlug = S('g'), gLabel = S('g');
  svg.append(gHub, gSock, gCable, gParts, gPlug, gLabel);
  const hubFallback = S('rect', { x: HUB.x + 32 * K, y: HUB.y + 48 * K, width: 448 * K, height: 704 * K, rx: 16, fill: '#f8fafc', stroke: '#94a3b8', 'stroke-width': 3 }); hubFallback.style.display = 'none';
  const hubImg = S('image', { href: 'assets/parts/render/hub-top.png', x: HUB.x, y: HUB.y, width: HUB.w, height: HUB.h, filter: 'url(#wsh)' });
  { const pr = new Image(); pr.onerror = () => { hubImg.style.display = 'none'; hubFallback.style.display = ''; }; pr.src = 'assets/parts/render/hub-top.png'; }
  gHub.append(hubFallback, hubImg);

  /* ----- 燈陣（和主機同步：官方主機的 5×5 方形小燈）----- */
  const gLed = S('g'); gHub.append(gLed);
  const ledEl = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) {
    const e = S('rect', { x: HUB.x + (256 + (c - 2) * 64 - 24) * K, y: HUB.y + (400 + (r - 2) * 64 - 24) * K, width: 48 * K, height: 48 * K, rx: 3, class: 'wled' });
    gLed.append(e); ledEl.push(e);
  }
  function ledTick() {
    const rot = sim.matrixRot || 0;
    for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 5; cx++) {
      const [sx, sy] = rot === 0 ? [cx, cy] : rot === 1 ? [cy, 4 - cx] : rot === 2 ? [4 - cx, 4 - cy] : [4 - cy, cx];
      const b = sim.led[sy * 5 + sx], e = ledEl[cy * 5 + cx];
      e.setAttribute('fill', b ? 'rgba(255,' + (205 + Math.round(b * 0.3)) + ',' + (140 + Math.round(b * 0.6)) + ',' + (0.35 + b * 0.0065).toFixed(2) + ')' : 'rgba(110,95,60,.07)');
    }
  }

  /* ----- 接口（深色凹槽，拖到附近會亮起來）----- */
  const sockEl = {};
  for (const p of ALL) {
    const s = SOCK[p];
    const g = S('g', { class: 'wsock', 'data-p': p });
    g.append(S('rect', { x: s.x - 8, y: s.y - 17, width: 16, height: 34, rx: 5, class: 'wsock-body' }));
    g.append(S('rect', { x: s.x - 28 - (s.dir === 1 ? 0 : -16), y: s.y - 24, width: 44, height: 48, rx: 10, class: 'wsock-hit' }));
    gSock.append(g); sockEl[p] = g;
  }
  const sockLabel = {};
  for (const p of ALL) { const s = SOCK[p]; const t = S('text', { x: s.x + (s.dir === 1 ? 44 : -44), y: s.y + 5, class: 'wlabel', 'text-anchor': 'middle' }); gLabel.append(t); sockLabel[p] = t; }

  /* ----- 零件（官方圖）與插頭 ----- */
  const CARD = { w: 170, h: 118 };
  const slotPos = { L: [[20, 40], [20, 200], [20, 360]], R: [[710, 40], [710, 200], [710, 360]] };
  const insts = [];
  function addInst(type, side, slot, id) {
    const p = (slotPos[side][slot] || slotPos[side][2]); const i = { id, type, side, slot, port: null, cx: p[0], cy: p[1], plug: null, el: {} };
    const org = side === 'L' ? { x: p[0] + CARD.w - 8, y: p[1] + CARD.h - 22 } : { x: p[0] + 8, y: p[1] + CARD.h - 22 };
    i.org = org; i.rest = { x: org.x + (side === 'L' ? 62 : -62), y: org.y + 12 }; i.plug = { x: i.rest.x, y: i.rest.y, dir: side === 'L' ? 1 : -1 };
    // 零件圖
    const g = S('g', { class: 'wpart', 'data-inst': id, transform: 'translate(' + p[0] + ',' + p[1] + ')' });
    const asp = ASPECT[type], iw = Math.min(CARD.w, (CARD.h - 22) * asp), ih = iw / asp;
    g.append(S('rect', { x: 0, y: 0, width: CARD.w, height: CARD.h, rx: 12, class: 'wcard' }));
    g.append(S('image', { href: IMG[type], x: (CARD.w - iw) / 2, y: 4 + (CARD.h - 24 - ih) / 2, width: iw, height: ih }));
    const nm = S('text', { x: CARD.w / 2, y: CARD.h - 6, class: 'wname', 'text-anchor': 'middle' }); nm.textContent = ZH[type]; g.append(nm);
    gParts.append(g);
    // 線
    const cab = S('path', { class: 'wcable-edge' }), cab2 = S('path', { class: 'wcable' }); gCable.append(cab, cab2);
    // 插頭
    const pg = S('g', { class: 'wplug', 'data-inst': id, tabindex: '0', 'aria-label': ZH[type] + '的插頭' });
    pg.append(S('rect', { x: -34, y: -14, width: 34, height: 28, rx: 5, class: 'wplug-shell' }));
    for (let k = 0; k < 6; k++) pg.append(S('rect', { x: -26 + k * 3.6, y: -9, width: 2, height: 18, class: 'wplug-pin' }));
    pg.append(S('rect', { x: -6, y: -11, width: 6, height: 22, rx: 2, class: 'wplug-tip' }));
    pg.append(S('rect', { x: -38, y: -18, width: 54, height: 36, fill: 'transparent' }));   // 好抓的區域
    gPlug.append(pg);
    i.el = { cab, cab2, pg, g };
    insts.push(i); bindDrag(i);
    return i;
  }
  [['motor', 'L', 0, 'motor1'], ['motor', 'L', 1, 'motor2'], ['color', 'L', 2, 'color'], ['distance', 'R', 0, 'distance'], ['force', 'R', 1, 'force']].forEach((a) => addInst(...a));
  let extra = 0;
  function extraInst(type) { extra++; const side = 'R'; return addInst(type, side, 2, type + '+' + extra); }

  function draw(i) {
    const pl = i.plug, tail = { x: pl.x - pl.dir * 34, y: pl.y };
    const o = i.org, sgn = i.side === 'L' ? 1 : -1;
    const dist = Math.hypot(tail.x - o.x, tail.y - o.y), sag = dist < 140 ? 46 : 18;
    const d = 'M' + o.x + ' ' + o.y + ' C' + (o.x + sgn * 80) + ' ' + (o.y + sag) + ' ' + (tail.x - pl.dir * 80) + ' ' + (tail.y + sag) + ' ' + tail.x + ' ' + tail.y;
    i.el.cab.setAttribute('d', d); i.el.cab2.setAttribute('d', d);
    i.el.pg.setAttribute('transform', 'translate(' + pl.x + ',' + pl.y + ') scale(' + pl.dir + ',1)');
  }

  /* ----- 動畫：插頭滑到目標位置 ----- */
  let raf = 0, visible = false;
  function target(i) { if (i.port) { const s = SOCK[i.port]; return { x: s.x + s.dir * 2, y: s.y, dir: s.dir }; } return { x: i.rest.x, y: i.rest.y, dir: i.side === 'L' ? 1 : -1 }; }
  function tick() {
    raf = 0; let moving = false;
    for (const i of insts) {
      if (i.drag) { draw(i); continue; }
      const t = target(i), pl = i.plug, k = 0.35;
      if (Math.abs(t.x - pl.x) > 0.4 || Math.abs(t.y - pl.y) > 0.4) { pl.x += (t.x - pl.x) * k; pl.y += (t.y - pl.y) * k; moving = true; } else { pl.x = t.x; pl.y = t.y; }
      pl.dir = t.dir; draw(i);
    }
    if (moving && visible) raf = requestAnimationFrame(tick);
  }
  const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

  /* ----- 資料同步：sim.ports 是唯一來源 ----- */
  function commit() {
    for (const p of ALL) sim.ports[p] = 'none';
    for (const i of insts) if (i.port) sim.ports[i.port] = i.type;
    U.refreshPortSelects();
  }
  function sync() {
    for (const i of insts) if (i.port && sim.ports[i.port] !== i.type) i.port = null;
    for (const t of ['motor', 'color', 'distance', 'force']) {
      for (const p of ALL.filter((q) => sim.ports[q] === t && !insts.some((i) => i.port === q))) {
        const inst = insts.find((i) => i.type === t && !i.port && !i.drag) || extraInst(t);
        inst.port = p;
      }
    }
    for (const p of ALL) { const i = insts.find((x) => x.port === p); sockLabel[p].textContent = i ? ZH[i.type] : ''; sockEl[p].classList.toggle('full', !!i); }
    kick();
  }

  /* ----- 拖曳 ----- */
  function pt(e) { const q = svg.createSVGPoint(); q.x = e.clientX; q.y = e.clientY; return q.matrixTransform(svg.getScreenCTM().inverse()); }
  function nearest(x, y) { let best = null, bd = 60; for (const p of ALL) { const s = SOCK[p], d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = p; } } return best; }
  function bindDrag(i) {
    const pg = i.el.pg;
    pg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault(); try { pg.setPointerCapture(e.pointerId); } catch (x) { /* 略 */ }
      const from = i.port; if (from) { sim.ports[from] = 'none'; i.port = null; U.refreshPortSelects(); sync(); }
      i.drag = true; pg.classList.add('grab'); gPlug.append(pg);
      const move = (ev) => { const q = pt(ev); i.plug.x = q.x; i.plug.y = q.y; const n = nearest(q.x, q.y); i.plug.dir = n ? SOCK[n].dir : (q.x < W / 2 ? 1 : -1); for (const p of ALL) sockEl[p].classList.toggle('over', p === n); draw(i); };
      const up = (ev) => {
        pg.removeEventListener('pointermove', move); pg.removeEventListener('pointerup', up); pg.removeEventListener('pointercancel', up);
        try { pg.releasePointerCapture(e.pointerId); } catch (x) { /* 略 */ }
        const q = pt(ev), n = ev.type === 'pointercancel' ? null : nearest(q.x, q.y);
        i.drag = false; pg.classList.remove('grab'); for (const p of ALL) sockEl[p].classList.remove('over');
        if (n) {
          const occ = insts.find((x) => x !== i && x.port === n);
          if (occ) occ.port = from && from !== n ? from : null;
          i.port = n; commit();
        } else commit();
        sync();
      };
      pg.addEventListener('pointermove', move); pg.addEventListener('pointerup', up); pg.addEventListener('pointercancel', up);
      move(e);
    });
  }

  root.append(Object.assign(document.createElement('p'), { className: 'wire-hint', textContent: '拖曳零件上的插頭，插進主機的接口（A～F）。拖出來就是拔掉；插到已經有零件的接口，兩個會互換。程式裡寫的接口要和插的接口一樣。' }));

  SP.wire = {
    show() { visible = true; sync(); kick(); },
    hide() { visible = false; },
    sync,
    insts,
  };
  setInterval(() => { if (visible) sync(); }, 400);
  setInterval(() => { if (visible) ledTick(); }, 120);
  sync();
})(window.SP = window.SP || {});
