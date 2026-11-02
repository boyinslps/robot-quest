/* SPIKE 模擬器：物理與感測（純邏輯 + Canvas 繪圖）
   座標單位為公分，場地 300 × 200 cm，畫面 3 px = 1 cm（和 Open Roberta 一樣）。
   機器人朝向 th：0 = 朝上，順時針為正。左馬達 A、右馬達 B、顏色感測器 C、距離感測器 D、力感測器 E。 */
(function (SP) {
  'use strict';
  const PX = 3, W = 300, H = 200, DT = 0.01;
  const WHEEL_D = 5.6, TRACK = 11.2, HL = 8, HW = 6;
  const STOP = { stop: true };
  const rad = (d) => d * Math.PI / 180;

  const mc = new MessageChannel(); const mq = [];
  mc.port1.onmessage = () => { const f = mq.shift(); if (f) f(); };
  const macroYield = () => new Promise((r) => { mq.push(r); mc.port2.postMessage(0); });

  /* ---------- 場景 ---------- */
  const WALL = '#4b4f57', BOX = '#a24f3c';
  const wall = (x, y, w, h) => ({ x, y, w, h, fill: WALL });
  const box = (x, y, w, h) => ({ x, y, w, h, fill: BOX, drag: true });
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
    { id: 'boxes', name: '障礙物（可拖曳）', start: { x: 30, y: 170, a: 90 },
      rects: [box(100, 60, 22, 22), box(190, 105, 22, 22), box(140, 140, 22, 22), wall(0, 98, 70, 4)],
      draw() {} },
  ];
  SP.SCENES = SCENES;

  /* ---------- 工具 ---------- */
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
      this.trail = document.createElement('canvas'); this.trail.width = W * PX; this.trail.height = H * PX;
      this.mL = { dps: 0, deg: 0 }; this.mR = { dps: 0, deg: 0 };
      this.simTime = 0; this.timerOff = 0; this.yawOff = 0; this.lastMoveT = 0;
      this.waiters = []; this.acc = 0; this.mul = 1; this.pumping = false;
      this.penOn = true; this.showSensors = true; this.display = ''; this.onDisplay = null;
      this.speedPct = 50; this.msgs = {};
      this.wheelD = WHEEL_D; this.track = TRACK; this.real = false; this.yawSign = 1; this.scaleL = 1; this.scaleR = 1;
      this.ports = { C: 'color', D: 'distance', E: 'force', F: 'none' };
      this.led = new Array(25).fill(0); this.displayText = '';
      this.loadScene('blank');
      this._last = performance.now();
      const loop = (t) => { const dt = Math.min((t - this._last) / 1000, 0.05); this._last = t;
        this.acc += dt * this.mul; this.pump(); this.render(); requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    }
    loadScene(id) {
      const sc = SCENES.find((s) => s.id === id) || SCENES[0];
      this.scene = sc;
      this.rects = sc.rects.map((r) => ({ ...r }));
      const g = this.bg.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#fafaf5'; g.fillRect(0, 0, this.bg.width, this.bg.height);
      g.scale(PX, PX); sc.draw(g);
      this.bgData = this.bg.getContext('2d').getImageData(0, 0, this.bg.width, this.bg.height);
      this.clearTrail(); this.resetPose();
    }
    resetPose() {
      const s = this.scene.start;
      this.rects.forEach((r, i) => { const o = this.scene.rects[i]; r.x = o.x; r.y = o.y; });
      this.x = s.x; this.y = s.y; this.th = rad(s.a);
      this.mL.dps = this.mR.dps = 0; this.mL.cur = this.mR.cur = 0;
      this.rollError();
      this.yawOff = this.th; this.lastMoveT = this.simTime;
    }
    rollError() {
      // 真實模式：兩輪有固定的小誤差（±1%），像真機的輪胎與組裝公差
      const r = () => (this.real ? 1 + (Math.random() - 0.5) * 0.02 : 1);
      this.scaleL = r(); this.scaleR = r();
    }
    clearTrail() { this.trail.getContext('2d').clearRect(0, 0, this.trail.width, this.trail.height); }
    rotateBy(deg) { this.th += rad(deg); this.lastMoveT = this.simTime; }

    /* --- 驅動 --- */
    drive(l, r) { this.mL.dps = l * 10; this.mR.dps = r * 10; }
    stopAll() { this.mL.dps = 0; this.mR.dps = 0; }
    collides(x, y, th) {
      const c = Math.cos(th), s = Math.sin(th);
      const pts = [];
      for (let i = 0; i <= 6; i++) for (const lx of [-HW, HW]) pts.push([lx, -HL + (2 * HL * i) / 6]);
      for (let j = 1; j < 4; j++) for (const ly of [-HL, HL]) pts.push([-HW + (2 * HW * j) / 4, ly]);
      for (const [lx, ly] of pts) {
        const px = x + lx * c - ly * s, py = y + lx * s + ly * c;
        if (this.hit(px, py)) return true;
      }
      return false;
    }
    hit(px, py) {
      if (px < 0 || px > W || py < 0 || py > H) return true;
      for (const r of this.rects) if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return true;
      return false;
    }
    step() {
      const a = this.real ? 3000 * DT : Infinity;  // 真實模式：馬達加減速 3000 度/秒²
      for (const m of [this.mL, this.mR]) m.cur = (m.cur || 0) + Math.max(-a, Math.min(a, m.dps - (m.cur || 0)));
      const dl = this.mL.cur * DT, dr = this.mR.cur * DT;
      this.mL.deg += dl; this.mR.deg += dr;
      const k = Math.PI * this.wheelD / 360, sl = dl * k * this.scaleL, sr = dr * k * this.scaleR;
      const ds = (sl + sr) / 2, dth = (sl - sr) / this.track, mid = this.th + dth / 2;
      let nx = this.x + ds * Math.sin(mid), ny = this.y - ds * Math.cos(mid), nth = this.th + dth;
      if (this.collides(nx, ny, nth)) {
        nx = this.x; ny = this.y;
        if (this.collides(nx, ny, nth)) nth = this.th;
      }
      if (Math.abs(nx - this.x) + Math.abs(ny - this.y) > 1e-4 || Math.abs(nth - this.th) > 1e-5) {
        this.lastMoveT = this.simTime;
        if (this.penOn) {
          const t = this.trail.getContext('2d');
          t.save(); t.scale(PX, PX); t.strokeStyle = 'rgba(224,165,38,.85)'; t.lineWidth = 0.8; t.lineCap = 'round';
          t.beginPath(); t.moveTo(this.x, this.y); t.lineTo(nx, ny); t.stroke(); t.restore();
        }
      }
      this.x = nx; this.y = ny; this.th = nth; this.simTime += DT;
      let any = false;
      for (const w of this.waiters.slice()) {
        let ok = false;
        try { ok = w.pred(); } catch (e) { this.waiters.splice(this.waiters.indexOf(w), 1); w.rej(e); any = true; continue; }
        if (ok) { this.waiters.splice(this.waiters.indexOf(w), 1); w.res(); any = true; }
      }
      return any;
    }
    async pump() {
      if (this.pumping) return;
      this.pumping = true;
      try {
        while (this.acc >= DT) {
          this.acc -= DT;
          if (this.step()) await macroYield();
        }
      } finally { this.pumping = false; }
    }
    waitUntil(pred) { return new Promise((res, rej) => { this.waiters.push({ pred, res, rej }); }); }
    abort() { const ws = this.waiters; this.waiters = []; ws.forEach((w) => w.rej(STOP)); this.stopAll(); }
    stalled() { return this.simTime - this.lastMoveT > 1.5; }

    /* --- 感測 --- */
    local(lx, ly) { const c = Math.cos(this.th), s = Math.sin(this.th); return [this.x + lx * c - ly * s, this.y + lx * s + ly * c]; }
    pixel() {
      const [wx, wy] = this.local(0, -6.5);
      const px = Math.round(wx * PX), py = Math.round(wy * PX), d = this.bgData;
      if (px < 1 || py < 1 || px >= d.width - 1 || py >= d.height - 1) return [75, 79, 87];
      let r = 0, g = 0, b = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const k = ((py + j) * d.width + px + i) * 4; r += d.data[k]; g += d.data[k + 1]; b += d.data[k + 2];
      }
      return [r / 9, g / 9, b / 9];
    }
    color() { const [r, g, b] = this.pixel(); return classify(r, g, b); }
    light() { const [r, g, b] = this.pixel(); return Math.round((0.299 * r + 0.587 * g + 0.114 * b) / 2.55); }
    distance() {
      const [ox, oy] = this.local(0, -HL);
      let best = 200;
      for (let k = -2; k <= 2; k++) {
        const a = this.th + k * (Math.PI / 16), dx = Math.sin(a), dy = -Math.cos(a);
        let t = rayArena(ox, oy, dx, dy);
        for (const r of this.rects) t = Math.min(t, rayRect(ox, oy, dx, dy, r));
        best = Math.min(best, t);
      }
      return Math.round(best);
    }
    pressed() {
      for (const lx of [-3, 0, 3]) { const [px, py] = this.local(lx, -(HL + 1)); if (this.hit(px, py)) return true; }
      return false;
    }
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
    render() {
      const g = this.ctx;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this.bg, 0, 0); g.drawImage(this.trail, 0, 0);
      g.scale(PX, PX);
      for (const r of this.rects) { g.fillStyle = r.fill; g.fillRect(r.x, r.y, r.w, r.h); }
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

  /* ---------- 給積木程式呼叫的 API ---------- */
  const PATTERNS = {
    heart: ['.#.#.', '#####', '#####', '.###.', '..#..'],
    smile: ['.#.#.', '.....', '#...#', '.###.', '.....'],
    sad: ['.#.#.', '.....', '.###.', '#...#', '.....'],
    up: ['..#..', '.###.', '#.#.#', '..#..', '..#..'],
    check: ['....#', '...#.', '#.#..', '.#...', '.....'],
    cross: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  };
  SP.createApi = function (sim, io) {
    const num = (v) => { v = Number(v); return isFinite(v) ? v : 0; };
    const clamp = (v) => Math.max(-100, Math.min(100, num(v)));
    const wait = (s) => { const t = sim.simTime + Math.max(0, num(s)); return sim.waitUntil(() => sim.simTime >= t); };
    let audio = null, seen = {};
    const need = (p, type) => {
      if (sim.ports[p] !== type) {
        const nm = { color: '顏色感測器', distance: '距離感測器', force: '力感測器' }[type];
        throw new Error('埠 ' + p + ' 沒有連接' + nm + '（請到「裝置」確認）');
      }
    };
    return {
      hl: (id) => io.hl(id),
      tick: () => sim.waitUntil(() => true),
      setSpeed(p) { sim.speedPct = Math.max(0, Math.min(100, num(p))); },
      async move(dir, n, unit) {
        n = Math.abs(num(n)); const sp = sim.speedPct; if (!sp || !n) return;
        if (unit === 'sec') { sim.drive(dir * sp, dir * sp); await wait(n); sim.stopAll(); return; }
        const cm = unit === 'rot' ? n * Math.PI * sim.wheelD : n;
        const kdeg = 360 / (Math.PI * sim.wheelD), start = (sim.mL.deg + sim.mR.deg) / 2;
        sim.lastMoveT = sim.simTime;
        await sim.waitUntil(() => {
          const rem = cm - dir * ((sim.mL.deg + sim.mR.deg) / 2 - start) / kdeg;
          if (rem <= 0.02 || sim.stalled()) return true;
          const s = Math.min(sp, Math.max(4, rem * 12)); sim.drive(dir * s, dir * s); return false;
        });
        sim.stopAll();
      },
      async turn(dir, deg) {
        deg = Math.abs(num(deg)); const sp = sim.speedPct; if (!sp || !deg) return;
        const th0 = sim.th; sim.lastMoveT = sim.simTime;
        await sim.waitUntil(() => {
          const rem = deg - dir * (sim.th - th0) * 180 / Math.PI;
          if (rem <= 0.1 || sim.stalled()) return true;
          const s = Math.max(3, Math.min(sp, rem * 1.5)); sim.drive(dir * s, -dir * s); return false;
        });
        sim.stopAll();
      },
      startMove(dir, steer) { this.steer(dir * sim.speedPct, steer); },
      steer(speed, steer) {
        const sp = clamp(speed), st = clamp(steer);
        sim.drive(sp * (st > 0 ? 1 : 1 + st / 50), sp * (st < 0 ? 1 : 1 - st / 50));
      },
      stop() { sim.stopAll(); },
      async motorTurn(port, deg) {
        deg = num(deg); const m = port === 'A' ? sim.mL : sim.mR, sp = sim.speedPct; if (!sp || !deg) return;
        const d0 = m.deg, dir = Math.sign(deg); sim.lastMoveT = sim.simTime;
        await sim.waitUntil(() => {
          const rem = Math.abs(deg) - dir * (m.deg - d0);
          if (rem <= 0.5 || sim.stalled()) { m.dps = 0; return true; }
          m.dps = dir * Math.max(8, Math.min(sp, rem * 0.5)) * 10; return false;
        });
        m.dps = 0;
      },
      motorStart(port, p) { const v = clamp(p) * 10; if (port === 'A' || port === 'AB') sim.mL.dps = v; if (port === 'B' || port === 'AB') sim.mR.dps = v; },
      wait,
      waitUntil: (fn) => sim.waitUntil(fn),
      colorIs: (p, c) => { need(p, 'color'); return sim.color() === c; },
      light: (p) => { need(p, 'color'); return sim.light(); },
      dist: (p) => { need(p, 'distance'); return sim.distance(); },
      distLess: (p, op, n) => { need(p, 'distance'); const d = sim.distance(); return op === '<' ? d < num(n) : d > num(n); },
      pressed: (p) => { need(p, 'force'); return sim.pressed(); },
      yaw: () => sim.yaw(),
      resetYaw() { sim.yawOff = sim.th; },
      timer: () => sim.timer(),
      resetTimer() { sim.timerOff = sim.simTime; },
      motorPos: (p) => Math.round(p === 'A' ? sim.mL.deg : sim.mR.deg),
      motorStop(p) { if (p === 'A' || p === 'AB') sim.mL.dps = 0; if (p === 'B' || p === 'AB') sim.mR.dps = 0; },
      say: (t) => io.say(t),
      broadcast(m) { sim.msgs[m] = (sim.msgs[m] || 0) + 1; },
      resetRun() { sim.msgs = {}; seen = {}; },
      async waitMsg(m, who) {
        const k = who + '|' + m;
        await sim.waitUntil(() => (sim.msgs[m] || 0) > (seen[k] || 0));
        seen[k] = (seen[k] || 0) + 1;
      },
      stopProgram() { sim.abort(); throw STOP; },
      lightText(t) { sim.displayText = String(t); sim.led.fill(0); io.say('[螢幕] ' + t); },
      lightPattern(name) {
        const rows = PATTERNS[name] || PATTERNS.heart;
        sim.led = rows.join('').split('').map((c) => (c === '#' ? 100 : 0)); sim.displayText = '';
      },
      lightPixel(x, y, b) {
        x = Math.round(num(x)); y = Math.round(num(y));
        if (x < 1 || x > 5 || y < 1 || y > 5) return;
        sim.led[(y - 1) * 5 + (x - 1)] = Math.max(0, Math.min(100, num(b)));
      },
      lightOff() { sim.led.fill(0); sim.displayText = ''; },
      async beep(note, s) {
        const f = 440 * Math.pow(2, (num(note) - 69) / 12);
        try {
          audio = audio || new (window.AudioContext || window.webkitAudioContext)();
          const o = audio.createOscillator(), gn = audio.createGain();
          o.frequency.value = Math.max(100, Math.min(4000, num(f))); gn.gain.value = 0.08;
          o.connect(gn); gn.connect(audio.destination); o.start();
          o.stop(audio.currentTime + Math.max(0.05, num(s)) / sim.mul);
        } catch (e) { /* 沒有音訊也沒關係 */ }
        await wait(s);
      },
    };
  };
  SP.STOP = STOP;
})(window.SP = window.SP || {});
