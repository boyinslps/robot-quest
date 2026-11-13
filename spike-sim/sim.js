/* SPIKE 模擬器：物理與感測（純邏輯 + Canvas 繪圖）
   座標單位為公分，場地 300 × 200 cm，畫面 3 px = 1 cm（和 Open Roberta 一樣）。
   機器人朝向 th：0 = 朝上，順時針為正。左馬達 A、右馬達 B、顏色感測器 C、距離感測器 D、力感測器 E。 */
(function (SP) {
  'use strict';
  const PX = 3, W = 300, H = 200, DT = 0.01;
  const WHEEL_D = 5.6, TRACK = 11.2, HL = 8, HW = 6;
  const STOP = Object.assign(new Error('程式已停止'), { stop: true });
  const rad = (d) => d * Math.PI / 180;

  const mc = new MessageChannel(); const mq = [];
  mc.port1.onmessage = () => { const f = mq.shift(); if (f) f(); };
  const macroYield = () => new Promise((r) => { mq.push(r); mc.port2.postMessage(0); });

  /* ---------- 場景 ---------- */
  const WALL = '#4b4f57', BOX = '#a24f3c';
  const FLOOR_COLOR = { red: '#d93025', yellow: '#f2c400', green: '#1e9e4a', blue: '#1a60d6', black: '#111111', white: '#ffffff' };
  SP.FLOOR_COLOR = FLOOR_COLOR;
  const wall = (x, y, w, h) => ({ x, y, w, h, fill: WALL });
  const box = (x, y, w, h) => ({ x, y, w, h, fill: BOX, drag: true, push: true });
  const SCENES = [
    { id: 'blank', name: '空白場地', start: { x: 150, y: 100, a: 0 }, rects: [], draw() {} },
    { id: 'ruler', name: '尺規直線（量距離）', start: { x: 20, y: 100, a: 90 }, rects: [],
      draw(g) {
        g.fillStyle = '#eef1f0'; g.fillRect(0, 0, W, 14); g.fillRect(0, H - 14, W, 14);
        g.strokeStyle = '#555'; g.fillStyle = '#333'; g.font = '5px sans-serif'; g.lineWidth = 0.3;
        for (let x = 0; x <= W; x += 10) {
          const big = x % 50 === 0;
          for (const y0 of [0, H]) {
            const s = y0 === 0 ? 1 : -1;
            g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y0 + s * (big ? 7 : 4)); g.stroke();
          }
          if (big) { g.fillText(x, x + 1, 12); g.fillText(x, x + 1, H - 8); }
        }
        g.fillStyle = '#111'; g.fillRect(250, 14, 3, H - 28);
      } },
    { id: 'line', name: '循線（黑線跑道）', start: { x: 150, y: 160, a: 90 }, rects: [],
      draw(g) {
        g.strokeStyle = '#111'; g.lineWidth = 4; g.lineJoin = 'round';
        g.beginPath(); g.roundRect(40, 40, 220, 120, 40); g.stroke();
      } },
    { id: 'colors', name: '顏色區（辨色）', start: { x: 150, y: 186, a: 0 }, rects: [],
      draw(g) {
        const cs = ['#d93025', '#f2c400', '#1e9e4a', '#1a60d6', '#111111'];
        cs.forEach((c, i) => { g.fillStyle = c; g.fillRect(110, 150 - i * 34, 80, 32); });
      } },
    { id: 'maze', name: '迷宮（超音波／碰撞）', start: { x: 30, y: 176, a: 0 },
      rects: [wall(60, 0, 4, 130), wall(120, 70, 4, 130), wall(180, 0, 4, 130), wall(240, 70, 4, 130)],
      draw(g) { g.fillStyle = '#1e9e4a'; g.fillRect(262, 8, 30, 30); } },
    { id: 'boxes', name: '障礙物（可拖曳、可推動）', start: { x: 30, y: 170, a: 90 },
      rects: [box(100, 60, 22, 22), box(190, 105, 22, 22), box(140, 140, 22, 22), wall(0, 98, 70, 4)],
      draw() {} },
  ];
  SP.SCENES = SCENES;

  /* ---------- 工具 ---------- */
  // 旋轉後的矩形（中心 cx,cy、半寬 hx、半長 hy、順時針轉 th）是否與軸對齊矩形 r 相交（分離軸；剛好貼著不算相交）
  function obbHitsRect(cx, cy, th, hx, hy, r) {
    const c = Math.cos(th), s = Math.sin(th), ac = Math.abs(c), as = Math.abs(s);
    const rw = r.w / 2, rh = r.h / 2, dx = cx - (r.x + rw), dy = cy - (r.y + rh);
    if (Math.abs(dx) >= rw + ac * hx + as * hy) return false;
    if (Math.abs(dy) >= rh + as * hx + ac * hy) return false;
    if (Math.abs(dx * c + dy * s) >= hx + rw * ac + rh * as) return false;
    if (Math.abs(-dx * s + dy * c) >= hy + rw * as + rh * ac) return false;
    return true;
  }
  function obbOutside(cx, cy, th, hx, hy) {
    const c = Math.cos(th), s = Math.sin(th);
    for (const [lx, ly] of [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]]) {
      const px = cx + lx * c - ly * s, py = cy + lx * s + ly * c;
      if (px < 0 || px > W || py < 0 || py > H) return true;
    }
    return false;
  }
  function rayRect(ox, oy, dx, dy, r) {
    let tmin = 0, tmax = Infinity;
    const ax = [[ox, dx, r.x, r.x + r.w], [oy, dy, r.y, r.y + r.h]];
    for (const [o, d, lo, hi] of ax) {
      if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return Infinity; continue; }
      let t1 = (lo - o) / d, t2 = (hi - o) / d;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
    return tmin;
  }
  function rayArena(ox, oy, dx, dy) {
    let t = Infinity;
    if (dx > 1e-9) t = Math.min(t, (W - ox) / dx); else if (dx < -1e-9) t = Math.min(t, -ox / dx);
    if (dy > 1e-9) t = Math.min(t, (H - oy) / dy); else if (dy < -1e-9) t = Math.min(t, -oy / dy);
    return t;
  }
  function classify(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx / 255, s = mx ? (mx - mn) / mx : 0;
    if (v < 0.28) return 'black';
    if (s < 0.25) return v > 0.7 ? 'white' : (v < 0.5 ? 'black' : 'none');
    let h;
    const d = mx - mn;
    if (mx === r) h = ((g - b) / d + 6) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
    if (h < 20 || h >= 340) return 'red';
    if (h >= 40 && h < 75) return 'yellow';
    if (h >= 90 && h < 170) return 'green';
    if (h >= 190 && h < 260) return 'blue';
    return 'none';
  }

  /* ---------- 模擬器 ---------- */
  class Sim {
    constructor(canvas) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      canvas.width = W * PX; canvas.height = H * PX;
      this.bg = document.createElement('canvas'); this.bg.width = W * PX; this.bg.height = H * PX;
      this.bgCtx = this.bg.getContext('2d', { willReadFrequently: true });
      this.trail = document.createElement('canvas'); this.trail.width = W * PX; this.trail.height = H * PX;
      this.mL = { dps: 0, deg: 0 }; this.mR = { dps: 0, deg: 0 };
      this.simTime = 0; this.timerOff = 0; this.yawOff = 0; this.lastMoveT = 0;
      this.waiters = []; this.pending = 0; this.aborted = false; this.acc = 0; this.mul = 1; this.pumping = false;
      this.penOn = true; this.showSensors = true; this.display = ''; this.onDisplay = null;
      this.speedPct = 50; this.msgs = {};
      this.wheelD = WHEEL_D; this.track = TRACK; this.real = false; this.yawSign = 1; this.scaleL = 1; this.scaleR = 1;
      this.ports = { C: 'color', D: 'distance', E: 'force', F: 'none' };
      this.motorSpeed = { A: 75, B: 75 };   // 官方預設：馬達 75 %、移動 50 %
      this.cmPerRot = 17.5;                 // 官方預設：1 圈馬達旋轉 = 17.5 公分（可用「設定 1 圈…」校正）
      this.buttons = { left: 0, right: 0 };  // 主機左右按鈕，按下的毫秒數
      this.powerColor = -1; this.matrixRot = 0; this.matrixBright = 100;
      this.led = new Array(25).fill(0); this.displayText = '';
      this.hand = { color: null, dist: null, force: null, pitch: 0, roll: 0, gesture: null, gestureUntil: 0, taps: 0 };   // 手動介入各個機構
      this.lifted = false; this.distLights = [0, 0, 0, 0];
      this.floor = []; this.handPress = false; this.selected = null; this.preview = null; this.showGrid = false; this.editing = false;
      this.loadScene('blank');
      this._last = performance.now();
      const loop = (t) => { const dt = Math.min((t - this._last) / 1000, 0.05); this._last = t;
        this.acc += dt * this.mul; this.pump(); this.render(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    loadScene(id) {
      const sc = SCENES.find((s) => s.id === id) || SCENES[0];
      this.scene = sc; this.start = { ...sc.start }; this.floor = []; this.selected = null;
      this.rects = sc.rects.map((r) => ({ ...r, ox: r.x, oy: r.y }));
      this.redrawBg(); this.clearTrail(); this.resetPose();
    }
    /* 地板：場景本身的圖案 + 使用者貼的色紙、膠帶（顏色感測器讀的就是這一層） */
    redrawBg() {
      const g = this.bgCtx;
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fafaf5'; g.fillRect(0, 0, this.bg.width, this.bg.height);
      g.save(); g.scale(PX, PX); this.scene.draw(g);
      for (const f of this.floor) {
        if (f.k === 'patch') { g.fillStyle = FLOOR_COLOR[f.color]; g.fillRect(f.x, f.y, f.w, f.h); }
        else { g.strokeStyle = FLOOR_COLOR[f.color]; g.lineWidth = f.w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(f.x1, f.y1); g.lineTo(f.x2, f.y2); g.stroke(); }
      }
      g.restore();
      this.bgData = g.getImageData(0, 0, this.bg.width, this.bg.height);
      this.bgVersion = (this.bgVersion || 0) + 1;       // 3D 用來知道地板圖案變了
    }
    resetPose() {
      const s = this.start;
      this.rects.forEach((r) => { if (r.ox !== undefined) { r.x = r.ox; r.y = r.oy; } });
      this.x = s.x; this.y = s.y; this.th = rad(s.a); this.nudgeFree();
      this.mL.dps = this.mR.dps = 0; this.mL.cur = this.mR.cur = 0;
      this.rollError();
      this.yawOff = this.th; this.lastMoveT = this.simTime;
    }
    setStartFromPose() { this.start = { x: this.x, y: this.y, a: this.th * 180 / Math.PI }; }

    /* --- 布置場地 --- */
    addRect(kind, x, y, w, h) {
      const r = kind === 'wall' ? { x, y, w, h, fill: WALL, drag: true, user: true, kind }
        : { x, y, w, h, fill: '#c9a26b', drag: true, push: true, user: true, kind };
      r.ox = r.x; r.oy = r.y; this.rects.push(r); return r;
    }
    addFloor(item) { this.floor.push(item); this.redrawBg(); return item; }
    removeItem(it) {
      if (!it) return;
      const i = this.rects.indexOf(it); if (i >= 0 && it.user) this.rects.splice(i, 1);
      const j = this.floor.indexOf(it); if (j >= 0) { this.floor.splice(j, 1); this.redrawBg(); }
      if (this.selected === it) this.selected = null;
    }
    clearCustom() { this.rects = this.rects.filter((r) => !r.user); this.floor = []; this.selected = null; this.redrawBg(); }
    hasCustom() { return this.floor.length > 0 || this.rects.some((r) => r.user); }
    hitItem(cx, cy, skipRobot) {
      if (!skipRobot && Math.hypot(cx - this.x, cy - this.y) < 10) return { type: 'robot' };
      for (let i = this.rects.length - 1; i >= 0; i--) {
        const r = this.rects[i];
        if ((r.user || r.drag) && cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h) return { type: 'rect', item: r, dx: cx - r.x, dy: cy - r.y };
      }
      for (let i = this.floor.length - 1; i >= 0; i--) {
        const f = this.floor[i];
        if (f.k === 'patch') { if (cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) return { type: 'floor', item: f, dx: cx - f.x, dy: cy - f.y }; }
        else {
          const vx = f.x2 - f.x1, vy = f.y2 - f.y1, L2 = vx * vx + vy * vy || 1;
          const t = Math.max(0, Math.min(1, ((cx - f.x1) * vx + (cy - f.y1) * vy) / L2));
          if (Math.hypot(cx - (f.x1 + t * vx), cy - (f.y1 + t * vy)) <= f.w / 2 + 1.5) return { type: 'floor', item: f, dx: cx, dy: cy, line: true };
        }
      }
      return null;
    }
    moveFloor(f, dx, dy) {
      if (f.k === 'patch') { f.x += dx; f.y += dy; } else { f.x1 += dx; f.x2 += dx; f.y1 += dy; f.y2 += dy; }
      this.redrawBg();
    }
    exportField() {
      return {
        start: this.start,
        rects: this.rects.filter((r) => r.user).map((r) => ({ kind: r.kind, x: r.ox, y: r.oy, w: r.w, h: r.h, push: !!r.push })),
        floor: this.floor.map((f) => ({ ...f })),
      };
    }
    importField(f) {
      if (!f) return;
      this.rects = this.rects.filter((r) => !r.user); this.floor = [];
      if (f.start) this.start = { ...f.start };
      for (const r of f.rects || []) { const n = this.addRect(r.kind === 'wall' ? 'wall' : 'box', r.x, r.y, r.w, r.h); n.push = !!r.push && r.kind !== 'wall'; }
      this.floor = (f.floor || []).map((x) => ({ ...x }));
      this.redrawBg(); this.resetPose();
    }
    rollError() {
      // 真實模式：兩輪有固定的小誤差（±1%），像真機的輪胎與組裝公差
      const r = () => (this.real ? 1 + (Math.random() - 0.5) * 0.02 : 1);
      this.scaleL = r(); this.scaleR = r();
    }
    clearTrail() { this.trail.getContext('2d').clearRect(0, 0, this.trail.width, this.trail.height); this.trailVersion = (this.trailVersion || 0) + 1; }
    rotateBy(deg) { this.th += rad(deg); this.lastMoveT = this.simTime; }

    /* --- 驅動 --- */
    drive(l, r) { this.mL.dps = l * 10; this.mR.dps = r * 10; }
    stopAll() { this.mL.dps = 0; this.mR.dps = 0; }
    rectHits(x, y, th) {
      const fixed0 = obbOutside(x, y, th, HW, HL);
      let fixed = fixed0; const push = new Set();
      for (const r of this.rects) if (obbHitsRect(x, y, th, HW, HL, r)) { if (r.push) push.add(r); else fixed = true; }
      return { fixed, push };
    }
    collides(x, y, th) { const c = this.rectHits(x, y, th); return c.fixed || c.push.size > 0; }
    hit(px, py) {
      if (px < 0 || px > W || py < 0 || py > H) return true;
      for (const r of this.rects) if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return true;
      return false;
    }
    /* 一個矩形（候選的障礙物）會不會壓到機器人 */
    overlapsRobot(r) { return obbHitsRect(this.x, this.y, this.th, HW, HL, r); }
    /* 拖曳機器人：沿著路徑一公分一公分走，碰到障礙物就停在前一格，不會穿過牆 */
    dragRobotTo(tx, ty) {
      tx = Math.max(8, Math.min(W - 8, tx)); ty = Math.max(8, Math.min(H - 8, ty));
      const dx = tx - this.x, dy = ty - this.y, n = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
      const wasIn = this.collides(this.x, this.y, this.th);
      for (let i = 1; i <= n; i++) {
        const nx = this.x + dx / n, ny = this.y + dy / n;
        if (this.collides(nx, ny, this.th) && !wasIn) break;
        this.x = nx; this.y = ny;
      }
      this.lastMoveT = this.simTime;
    }
    /* 起點被障礙物蓋住時，找最近的空位 */
    nudgeFree() {
      if (!this.collides(this.x, this.y, this.th)) return;
      for (let rad = 1; rad <= 120; rad++) {
        for (let a = 0; a < 360; a += 10) {
          const nx = this.x + rad * Math.cos(a * Math.PI / 180), ny = this.y + rad * Math.sin(a * Math.PI / 180);
          if (!this.collides(nx, ny, this.th)) { this.x = nx; this.y = ny; return; }
        }
      }
    }
    rectFree(n, skip) {
      if (n.x < 0 || n.y < 0 || n.x + n.w > W || n.y + n.h > H) return false;
      for (const o of this.rects) if (!skip.has(o) && n.x < o.x + o.w && n.x + n.w > o.x && n.y < o.y + o.h && n.y + n.h > o.y) return false;
      return true;
    }
    /* 機器人走到新姿勢；碰到可推動的方塊就把它推著走（推不動就算被擋住） */
    tryMove(nx, ny, nth) {
      const c = this.rectHits(nx, ny, nth);
      if (c.fixed) return false;
      if (!c.push.size) return true;
      const dx = nx - this.x, dy = ny - this.y;
      if (Math.abs(dx) + Math.abs(dy) < 1e-6) return false;
      const moved = [];
      for (const r of c.push) {
        const n = { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h };
        if (!this.rectFree(n, c.push)) return false;
        moved.push([r, n]);
      }
      const old = moved.map(([r]) => [r, r.x, r.y]);
      for (const [r, n] of moved) { r.x = n.x; r.y = n.y; }
      const c2 = this.rectHits(nx, ny, nth);
      if (c2.fixed || c2.push.size) { for (const [r, x, y] of old) { r.x = x; r.y = y; } return false; }
      return true;
    }
    step() {
      const a = this.real ? 3000 * DT : Infinity;  // 真實模式：馬達加減速 3000 度/秒²
      for (const m of [this.mL, this.mR]) m.cur = (m.cur || 0) + Math.max(-a, Math.min(a, m.dps - (m.cur || 0)));
      const dl = this.mL.cur * DT, dr = this.mR.cur * DT;
      this.mL.deg += dl; this.mR.deg += dr;
      const k = Math.PI * this.wheelD / 360, sl = dl * k * this.scaleL, sr = dr * k * this.scaleR;
      const ds = (sl + sr) / 2, dth = (sl - sr) / this.track, mid = this.th + dth / 2;
      let nx = this.x + ds * Math.sin(mid), ny = this.y - ds * Math.cos(mid), nth = this.th + dth;
      if (this.lifted) { nx = this.x; ny = this.y; nth = this.th; if (Math.abs(dl) + Math.abs(dr) > 0) this.lastMoveT = this.simTime; }
      else if (!this.tryMove(nx, ny, nth)) {
        nx = this.x; ny = this.y;
        if (!this.tryMove(nx, ny, nth)) nth = this.th;
      }
      if (Math.abs(nx - this.x) + Math.abs(ny - this.y) > 1e-4 || Math.abs(nth - this.th) > 1e-5) {
        this.lastMoveT = this.simTime;
        if (this.penOn) {
          const t = this.trail.getContext('2d');
          t.save(); t.scale(PX, PX); t.strokeStyle = 'rgba(224,165,38,.85)'; t.lineWidth = 0.8; t.lineCap = 'round';
          t.beginPath(); t.moveTo(this.x, this.y); t.lineTo(nx, ny); t.stroke(); t.restore();
          this.trailVersion = (this.trailVersion || 0) + 1;
        }
      }
      this.x = nx; this.y = ny; this.th = nth; this.simTime += DT;
      let any = 0;
      for (const w of this.waiters.slice()) {
        let ok = false;
        try { ok = w.pred(); } catch (e) { this.waiters.splice(this.waiters.indexOf(w), 1); w.rej(e); any++; continue; }
        if (ok) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(); any++; }
      }
      return any;
    }
    async pump() {
      if (this.pumping) return;
      this.pumping = true;
      try {
        while (this.acc >= DT) {
          this.acc -= DT;
          const n = this.step();
          if (n) {
            // 鎖步：等被喚醒的程式（含 Python 的事件迴圈）真的接續執行、重新等待之後，才推進下一個模擬步驟
            this.pending += n; const t0 = performance.now();
            do { await macroYield(); } while (this.pending > 0 && performance.now() - t0 < 40);
            this.pending = 0;
          }
        }
      } finally { this.pumping = false; }
    }
    waitUntil(pred) { if (this.aborted) return Promise.reject(STOP); if (this.pending > 0) this.pending--; return new Promise((res, rej) => { this.waiters.push({ pred, res, rej }); }); }
    abort() { this.aborted = true; const ws = this.waiters; this.waiters = []; ws.forEach((w) => w.rej(STOP)); this.stopAll(); }
    stalled() { return this.simTime - this.lastMoveT > 1.5; }

    /* --- 感測 --- */
    local(lx, ly) { const c = Math.cos(this.th), s = Math.sin(this.th); return [this.x + lx * c - ly * s, this.y + lx * s + ly * c]; }
    pixel() {
      if (this.hand.color && this.hand.color !== 'none') { const h = FLOOR_COLOR[this.hand.color]; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); }
      if (this.hand.color === 'none') return [60, 60, 66];
      const [wx, wy] = this.local(0, -6.5);
      const px = Math.round(wx * PX), py = Math.round(wy * PX), d = this.bgData;
      if (px < 1 || py < 1 || px >= d.width - 1 || py >= d.height - 1) return [75, 79, 87];
      let r = 0, g = 0, b = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const k = ((py + j) * d.width + px + i) * 4; r += d.data[k]; g += d.data[k + 1]; b += d.data[k + 2];
      }
      return [r / 9, g / 9, b / 9];
    }
    color() { if (this.hand.color) return this.hand.color; const [r, g, b] = this.pixel(); return classify(r, g, b); }
    light() { if (this.hand.color === 'none') return 0; const [r, g, b] = this.pixel(); return Math.round((0.299 * r + 0.587 * g + 0.114 * b) / 2.55); }
    distance() { return Math.round(this.distRaw()); }
    distanceMm() { const d = this.distRaw(); return d >= 200 ? -1 : Math.round(d * 10); }
    distRaw() {
      if (this.hand.dist !== null) return Math.max(0, Math.min(200, this.hand.dist));
      const [ox, oy] = this.local(0, -HL);
      let best = 200;
      for (let k = -2; k <= 2; k++) {
        const a = this.th + k * (Math.PI / 16), dx = Math.sin(a), dy = -Math.cos(a);
        let t = rayArena(ox, oy, dx, dy);
        for (const r of this.rects) t = Math.min(t, rayRect(ox, oy, dx, dy, r));
        best = Math.min(best, t);
      }
      return best;
    }
    forceDeci() { if (this.hand.force !== null) return Math.round(Math.max(0, Math.min(10, this.hand.force)) * 10); return (this.handPress || this.bumped()) ? 80 : 0; }
    pressed() { return this.forceDeci() > 0; }
    bumped() {
      const [cx, cy] = this.local(0, -(HL + 0.75));
      if (obbOutside(cx, cy, this.th, 3.5, 0.75)) return true;
      return this.rects.some((r) => obbHitsRect(cx, cy, this.th, 3.5, 0.75, r));
    }
    gesture() { return this.hand.gesture && performance.now() < this.hand.gestureUntil ? this.hand.gesture : null; }
    doGesture(g) { this.hand.gesture = g; this.hand.gestureUntil = performance.now() + 1200; if (g === 'tapped') this.hand.taps++; }
    yaw() { let d = Math.round(this.yawSign * (this.th - this.yawOff) * 180 / Math.PI); d = ((d + 180) % 360 + 360) % 360 - 180; return d; }
    timer() { return Math.round((this.simTime - this.timerOff) * 10) / 10; }

    /* --- 拖曳 --- */
    toCm(ev) {
      const b = this.canvas.getBoundingClientRect();
      return [(ev.clientX - b.left) / b.width * W, (ev.clientY - b.top) / b.height * H];
    }
    pick(cx, cy) {
      if (Math.hypot(cx - this.x, cy - this.y) < 10) return { robot: true };
      for (let i = this.rects.length - 1; i >= 0; i--) {
        const r = this.rects[i];
        if (r.drag && cx > r.x && cx < r.x + r.w && cy > r.y && cy < r.y + r.h) return { rect: r, dx: cx - r.x, dy: cy - r.y };
      }
      return null;
    }

    /* --- 繪圖 --- */
    drawItem(g, it, alpha) {
      g.save(); g.globalAlpha = alpha;
      if (it.k === 'line') { g.strokeStyle = FLOOR_COLOR[it.color]; g.lineWidth = it.w; g.lineCap = 'butt'; g.beginPath(); g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2); g.stroke(); }
      else { g.fillStyle = it.fill || FLOOR_COLOR[it.color] || '#c9a26b'; g.fillRect(it.x, it.y, it.w, it.h); g.strokeStyle = '#2d7cff'; g.lineWidth = 0.4; g.strokeRect(it.x, it.y, it.w, it.h); }
      g.restore();
    }
    render() {
      const g = this.ctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.bg, 0, 0); g.drawImage(this.trail, 0, 0);
      g.scale(PX, PX);
      if (this.showGrid) {
        g.strokeStyle = 'rgba(60,70,90,.14)'; g.lineWidth = 0.2; g.beginPath();
        for (let x = 10; x < W; x += 10) { g.moveTo(x, 0); g.lineTo(x, H); }
        for (let y = 10; y < H; y += 10) { g.moveTo(0, y); g.lineTo(W, y); }
        g.stroke();
      }
      for (const r of this.rects) {
        g.fillStyle = r.fill; g.fillRect(r.x, r.y, r.w, r.h);
        if (r.push) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.4; g.strokeRect(r.x, r.y, r.w, r.h); g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x + r.w, r.y + r.h); g.moveTo(r.x + r.w, r.y); g.lineTo(r.x, r.y + r.h); g.stroke(); }
      }
      if (this.preview) this.drawItem(g, this.preview, 0.55);
      if (this.selected) {
        g.save(); g.strokeStyle = '#2d7cff'; g.lineWidth = 0.7; g.setLineDash([2, 1.2]);
        const it = this.selected;
        if (it.k === 'line') { g.beginPath(); g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2); g.lineWidth = it.w + 1.6; g.globalAlpha = 0.35; g.stroke(); }
        else g.strokeRect(it.x - 0.6, it.y - 0.6, it.w + 1.2, it.h + 1.2);
        g.restore();
      }
      g.strokeStyle = WALL; g.lineWidth = 1.5; g.strokeRect(0, 0, W, H);
      if (this.showSensors) {
        const d = this.distance(), [ox, oy] = this.local(0, -HL);
        g.fillStyle = 'rgba(47,122,103,.15)'; g.beginPath(); g.moveTo(ox, oy);
        g.arc(ox, oy, d, this.th - Math.PI / 2 - Math.PI / 8, this.th - Math.PI / 2 + Math.PI / 8); g.closePath(); g.fill();
      }
      g.save(); g.translate(this.x, this.y); g.rotate(this.th);
      g.fillStyle = '#2b2b2b';
      for (const sx of [-1, 1]) g.fillRect(sx * (this.track / 2) - 0.9, -this.wheelD / 2, 1.8, this.wheelD);
      g.fillStyle = '#f2c400'; g.fillRect(-4.8, -HL, 9.6, 2 * HL);
      g.fillStyle = '#3a3a3a'; g.fillRect(-3.4, -3, 6.8, 7);
      g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * 2.4, -HL + 0.2, 1.3, 0, 7); g.fill(); }
      const c = this.color(), cm = { red: '#d93025', yellow: '#f2c400', green: '#1e9e4a', blue: '#1a60d6', white: '#fff', black: '#000', none: '#999' };
      g.fillStyle = cm[c]; g.strokeStyle = '#000'; g.lineWidth = 0.3;
      g.beginPath(); g.arc(0, -6.5, 1.1, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#d93025'; g.beginPath(); g.moveTo(0, -5.6); g.lineTo(-1.4, -3.8); g.lineTo(1.4, -3.8); g.fill();
      g.restore();
    }
  }
  SP.Sim = Sim;

  SP.STOP = STOP;
  SP.WHEEL_D = WHEEL_D; SP.TRACK = TRACK;
})(window.SP = window.SP || {});
