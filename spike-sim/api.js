/* 積木與 Python 共用的模擬器 API（對照 SPIKE Prime Word Blocks 與 Python API 的行為） */
(function (SP) {
  'use strict';
  const STOP = SP.STOP;
  const THREAD_STOP = Object.assign(new Error('這個積木堆疊已停止'), { threadStop: true });
  SP.THREAD_STOP = THREAD_STOP;

  /* ---------- 5×5 燈陣圖案（編號 = 官方 light_matrix.IMAGE_* 常數；圖案是近似畫法） ---------- */
  const R = (...rows) => rows;
  const rot90 = (rows) => rows.map((_, y) => rows.map((__, x) => rows[4 - x][y]).join(''));
  const ARROW_N = R('..#..', '.###.', '#.#.#', '..#..', '..#..');
  const ARROW_NE = R('..###', '...##', '..#.#', '.#..#', '#....');
  const IMAGES = {
    1: ['HEART', '愛心', R('.#.#.', '#####', '#####', '.###.', '..#..')],
    2: ['HEART_SMALL', '小愛心', R('.....', '.#.#.', '.###.', '..#..', '.....')],
    3: ['HAPPY', '開心', R('.....', '.#.#.', '.....', '#...#', '.###.')],
    4: ['SMILE', '微笑', R('.....', '.#.#.', '.....', '.###.', '.....')],
    5: ['SAD', '難過', R('.....', '.#.#.', '.....', '.###.', '#...#')],
    6: ['CONFUSED', '困惑', R('.....', '.#.#.', '.....', '.#.#.', '#.#.#')],
    7: ['ANGRY', '生氣', R('#...#', '.#.#.', '.....', '.###.', '#...#')],
    8: ['ASLEEP', '睡著', R('.....', '##.##', '.....', '.###.', '.....')],
    9: ['SURPRISED', '驚訝', R('.#.#.', '.....', '..#..', '.#.#.', '..#..')],
    10: ['SILLY', '搞怪', R('#...#', '.....', '.###.', '..#.#', '.....')],
    11: ['FABULOUS', '帥氣', R('#####', '#.#.#', '.....', '.###.', '.....')],
    12: ['MEH', '無感', R('.....', '.#.#.', '.....', '.###.', '.....')],
    13: ['YES', '對', R('....#', '...#.', '#.#..', '.#...', '.....')],
    14: ['NO', '錯', R('#...#', '.#.#.', '..#..', '.#.#.', '#...#')],
    27: ['ARROW_N', '箭頭 ↑', ARROW_N],
    28: ['ARROW_NE', '箭頭 ↗', ARROW_NE],
    29: ['ARROW_E', '箭頭 →', rot90(ARROW_N)],
    30: ['ARROW_SE', '箭頭 ↘', rot90(ARROW_NE)],
    31: ['ARROW_S', '箭頭 ↓', rot90(rot90(ARROW_N))],
    32: ['ARROW_SW', '箭頭 ↙', rot90(rot90(ARROW_NE))],
    33: ['ARROW_W', '箭頭 ←', rot90(rot90(rot90(ARROW_N)))],
    34: ['ARROW_NW', '箭頭 ↖', rot90(rot90(rot90(ARROW_NE)))],
    39: ['TRIANGLE', '三角形', R('.....', '..#..', '.###.', '#####', '.....')],
    42: ['DIAMOND', '菱形', R('..#..', '.#.#.', '#...#', '.#.#.', '..#..')],
    43: ['DIAMOND_SMALL', '小菱形', R('.....', '..#..', '.#.#.', '..#..', '.....')],
    44: ['SQUARE', '正方形', R('#####', '#...#', '#...#', '#...#', '#####')],
    45: ['SQUARE_SMALL', '小正方形', R('.....', '.###.', '.#.#.', '.###.', '.....')],
  };
  SP.IMAGES = IMAGES;
  SP.imageOptions = () => Object.keys(IMAGES).map((k) => [IMAGES[k][1], k]);

  // 官方顏色常數（color 模組）
  const COLOR_NUM = { black: 0, blue: 3, green: 6, yellow: 7, red: 9, white: 10, none: -1 };
  SP.COLOR_NUM = COLOR_NUM;

  // 減速曲線：離終點還剩 rem 度時，輪子最多能轉多快（等減速度煞車；最後一步剛好停在終點，不會一路爬行）
  const DECEL = 4000, STEP = 0.01;   // 輪子減速度（度/秒²）、模擬步長（秒）
  const capDps = (rem) => Math.min(Math.sqrt(2 * DECEL * Math.max(rem, 0)), Math.max(rem, 0) / STEP);

  SP.createApi = function (sim, io) {
    const num = (v) => { v = Number(v); return isFinite(v) ? v : 0; };
    const clamp = (v) => Math.max(-100, Math.min(100, num(v)));
    const wait = (s) => { const t = sim.simTime + Math.max(0, num(s)); return sim.waitUntil(() => sim.simTime >= t); };
    let audio = null, osc = null, seen = {};
    let msgs = {}, handled = {}, receivers = {}, killed = new Set(), threadCount = 0;
    const motorOf = (p) => {
      if (p === 'A') return sim.mL;
      if (p === 'B') return sim.mR;
      throw new Error('埠 ' + p + ' 沒有馬達（模擬器：A＝左輪、B＝右輪）');
    };
    const need = (p, type) => {
      if (sim.ports[p] !== type) {
        const nm = { color: '顏色感測器', distance: '距離感測器', force: '力感測器' }[type];
        throw new Error('埠 ' + p + ' 沒有連接' + nm + '（請到「主機與裝置」確認）');
      }
    };
    const toDeg = (n, unit) => (unit === 'rot' ? n * 360 : unit === 'deg' ? n : unit === 'cm' ? (n / sim.cmPerRot) * 360 : unit === 'in' ? (n * 2.54 / sim.cmPerRot) * 360 : 0);

    // 讓兩顆馬達依速度比例轉 deg 度（取轉比較多的那顆當基準）
    async function driveDeg(deg, l, r) {
      deg = Math.abs(num(deg)); const big = Math.max(Math.abs(l), Math.abs(r)); if (!big || !deg) return;
      const d0 = [sim.mL.deg, sim.mR.deg]; sim.lastMoveT = sim.simTime;
      await sim.waitUntil(() => {
        const rem = deg - Math.max(Math.abs(sim.mL.deg - d0[0]), Math.abs(sim.mR.deg - d0[1]));
        if (rem <= 0.05 || sim.stalled()) return true;
        const k = Math.min(1, capDps(rem) / (big * 10)); sim.drive(l * k, r * k); return false;
      });
      sim.stopAll();
    }
    const steerLR = (pct, st) => [pct * (st > 0 ? 1 : 1 + st / 50), pct * (st < 0 ? 1 : 1 - st / 50)];

    function setLed(rows, bright) {
      sim.led = rows.join('').split('').map((c) => (c === '#' ? bright : 0)); sim.displayText = '';
    }
    function force() { return sim.pressed() ? 80 : 0; }   // 十分之一牛頓（0～100）：碰撞探針被壓到 = 8 牛頓

    const api = {
      hl: (id) => io.hl(id),
      tick: () => sim.waitUntil(() => true),
      wait,
      waitUntil: (fn) => sim.waitUntil(fn),

      /* ----- 移動（雙馬達） ----- */
      setSpeed(p) { sim.speedPct = Math.max(-100, Math.min(100, num(p))); },
      setDistance(cm) { const v = num(cm); if (v > 0) sim.cmPerRot = v; },
      setPair(p) { if (p !== 'A+B') throw new Error('模擬器目前只支援「A+B」（A＝左輪、B＝右輪），不支援 ' + p); },
      async move(dir, n, unit) {
        n = Math.abs(num(n)); const sp = sim.speedPct; if (!sp || !n) return;
        if (unit === 'sec') { sim.drive(dir * sp, dir * sp); await wait(n); sim.stopAll(); return; }
        return driveDeg(toDeg(n, unit), dir * sp, dir * sp);
      },
      async steerFor(steer, n, unit, dir) {
        n = Math.abs(num(n)); const sp = (dir || 1) * sim.speedPct; if (!sp || !n) return;
        const [l, r] = steerLR(sp, clamp(steer));
        if (unit === 'sec') { sim.drive(l, r); await wait(n); sim.stopAll(); return; }
        return driveDeg(toDeg(n, unit), l, r);
      },
      async turn(dir, deg) {     // 非官方：用陀螺儀原地轉指定角度
        deg = Math.abs(num(deg)); const sp = Math.abs(sim.speedPct); if (!sp || !deg) return;
        const th0 = sim.th; sim.lastMoveT = sim.simTime;
        await sim.waitUntil(() => {
          const rem = deg - dir * (sim.th - th0) * 180 / Math.PI;
          if (rem <= 0.05 || sim.stalled()) return true;
          const s = Math.min(sp, capDps(rem * sim.track / sim.wheelD) / 10); sim.drive(dir * s, -dir * s); return false;
        });
        sim.stopAll();
      },
      startMove(dir, steer) { this.steer(dir * sim.speedPct, steer); },
      steer(speed, steer) { const [l, r] = steerLR(clamp(speed), clamp(steer)); sim.drive(l, r); },
      tank(l, r) { sim.drive(clamp(l), clamp(r)); },
      stop() { sim.stopAll(); },
      async moveDegrees(deg, steer, pct) { const [l, r] = steerLR(clamp(pct), clamp(steer)); return driveDeg(deg, l, r); },
      async tankDegrees(deg, l, r) { return driveDeg(deg, clamp(l), clamp(r)); },
      async moveTime(ms, steer, pct) { const [l, r] = steerLR(clamp(pct), clamp(steer)); sim.drive(l, r); await wait(num(ms) / 1000); sim.stopAll(); },

      /* ----- 單顆馬達 ----- */
      motorSetSpeed(p, v) { motorOf(p); sim.motorSpeed[p] = Math.max(-100, Math.min(100, num(v))); },
      async motorRun(p, dir, n, unit) {
        const m = motorOf(p), sp = sim.motorSpeed[p]; n = Math.abs(num(n)); if (!sp || !n) return;
        const d = dir * Math.sign(sp);
        if (unit === 'sec') { m.dps = d * Math.abs(sp) * 10; await wait(n); m.dps = 0; return; }
        return this.motorTurnAt(p, d * (unit === 'rot' ? n * 360 : n), Math.abs(sp));
      },
      async motorTurnAt(p, deg, sp) {
        const m = motorOf(p); deg = num(deg); sp = Math.abs(num(sp)); if (!sp || !deg) return;
        const d0 = m.deg, dir = Math.sign(deg); sim.lastMoveT = sim.simTime;
        await sim.waitUntil(() => {
          const rem = Math.abs(deg) - dir * (m.deg - d0);
          if (rem <= 0.05 || sim.stalled()) { m.dps = 0; return true; }
          m.dps = dir * Math.min(sp * 10, capDps(rem)); return false;
        });
        m.dps = 0;
      },
      async motorTurn(p, deg) { return this.motorTurnAt(p, deg, sim.motorSpeed[p] || 50); },   // 舊積木相容
      async motorGoto(p, mode, pos, speedPct) {      // 轉到位置（0～359）：short／cw／ccw
        const m = motorOf(p); pos = ((Math.round(num(pos)) % 360) + 360) % 360;
        const abs = this.motorPosAbs(p); const cw = (pos - abs + 360) % 360, ccw = (abs - pos + 360) % 360;
        const delta = mode === 'cw' ? cw : mode === 'ccw' ? -ccw : (cw <= ccw ? cw : -ccw);
        return this.motorTurnAt(p, delta, speedPct || Math.abs(sim.motorSpeed[p]) || 50);
      },
      motorStartDir(p, dir) { const m = motorOf(p); m.dps = dir * Math.sign(sim.motorSpeed[p] || 1) * Math.abs(sim.motorSpeed[p]) * 10; },
      motorStart(p, pct) { const v = clamp(pct) * 10; if (p === 'A' || p === 'AB') sim.mL.dps = v; if (p === 'B' || p === 'AB') sim.mR.dps = v; },
      motorStop(p) { if (p === 'A' || p === 'AB') sim.mL.dps = 0; if (p === 'B' || p === 'AB') sim.mR.dps = 0; if (p !== 'A' && p !== 'B' && p !== 'AB') motorOf(p); },
      motorPosAbs: (p) => ((Math.round(motorOf(p).deg) % 360) + 360) % 360,
      motorPos: (p) => Math.round(motorOf(p).deg - (motorOf(p).rel0 || 0)),     // 相對位置（度）
      motorSetPos(p, v) { const m = motorOf(p); m.rel0 = m.deg - num(v); },
      deviceReady: (p) => (p === 'A' || p === 'B' ? true : sim.ports[p] !== 'none'),
      motorSpeedPct: (p) => Math.round((motorOf(p).cur || 0) / 10),
      motorVel: (p) => Math.round(motorOf(p).cur || 0),

      /* ----- 燈光 ----- */
      lightImage(id) {
        const im = IMAGES[Math.round(num(id))];
        if (!im) throw new Error('模擬器尚未支援圖案 ' + id + '（目前有：' + Object.keys(IMAGES).join('、') + '）');
        setLed(im[2], sim.matrixBright);
      },
      async lightImageFor(id, s) { this.lightImage(id); await wait(s); sim.led.fill(0); },
      lightPattern(name) {   // 舊積木相容（名稱）
        const map = { heart: 1, smile: 4, sad: 5, up: 27, check: 13, cross: 14 };
        this.lightImage(map[name] || 1);
      },
      lightText(t) { sim.displayText = String(t); sim.led.fill(0); io.say('[主機螢幕] ' + t); },
      lightShow(list) { sim.led = Array.from({ length: 25 }, (_, i) => Math.max(0, Math.min(100, num(list[i])))); sim.displayText = ''; },
      lightOff() { sim.led.fill(0); sim.displayText = ''; },
      lightBrightness(p) { sim.matrixBright = Math.max(0, Math.min(100, num(p))); },
      lightPixel(x, y, b) {
        x = Math.round(num(x)); y = Math.round(num(y));
        if (x < 1 || x > 5 || y < 1 || y > 5) throw new Error('燈的位置 x、y 要在 1～5 之間');
        sim.led[(y - 1) * 5 + (x - 1)] = Math.max(0, Math.min(100, num(b)));
      },
      lightGet: (x, y) => sim.led[y * 5 + x] || 0,
      lightRotate(dir) { sim.matrixRot = (sim.matrixRot + (dir > 0 ? 1 : 3)) % 4; },
      lightOrient(q) { sim.matrixRot = ((Math.round(num(q)) % 4) + 4) % 4; },     // 0 上、1 右、2 下、3 左
      lightOrientGet: () => sim.matrixRot,
      centerLight(c) { sim.powerColor = Math.round(num(c)); },
      say: (t) => io.say(t),

      /* ----- 聲音 ----- */
      async beep(note, s) { return this.beepHz(440 * Math.pow(2, (num(note) - 69) / 12), s); },
      async beepHz(f, s) {
        try {
          audio = audio || new (window.AudioContext || window.webkitAudioContext)();
          const o = audio.createOscillator(), gn = audio.createGain();
          o.frequency.value = Math.max(100, Math.min(4000, num(f))); gn.gain.value = 0.08;
          o.connect(gn); gn.connect(audio.destination); o.start();
          o.stop(audio.currentTime + Math.max(0.05, num(s)) / sim.mul);
        } catch (e) { /* 沒有音訊也沒關係 */ }
        await wait(s);
      },
      beepStart(note) {
        try {
          this.stopSounds(); audio = audio || new (window.AudioContext || window.webkitAudioContext)();
          osc = audio.createOscillator(); const gn = audio.createGain();
          osc.frequency.value = 440 * Math.pow(2, (num(note) - 69) / 12); gn.gain.value = 0.08; osc.connect(gn); gn.connect(audio.destination); osc.start();
        } catch (e) { osc = null; }
      },
      stopSounds() { try { if (osc) osc.stop(); } catch (e) { /* 略 */ } osc = null; },

      /* ----- 感測 ----- */
      colorKey: (p) => { need(p, 'color'); return sim.color(); },
      colorNum: (p) => { need(p, 'color'); return COLOR_NUM[sim.color()]; },
      colorIs: (p, c) => { need(p, 'color'); return sim.color() === c; },
      light: (p) => { need(p, 'color'); return sim.light(); },
      reflectCmp: (p, op, n) => { need(p, 'color'); const v = sim.light(); n = num(n); return op === '<' ? v < n : op === '>' ? v > n : v === n; },
      rgbi: (p) => { need(p, 'color'); const [r, g, b] = sim.pixel(); const k = 1024 / 255; return [Math.round(r * k), Math.round(g * k), Math.round(b * k), Math.round((0.299 * r + 0.587 * g + 0.114 * b) * k)]; },
      dist: (p, unit) => {
        need(p, 'distance'); const cm = sim.distRaw();
        return unit === 'in' ? Math.round(cm / 2.54 * 10) / 10 : unit === 'pct' ? Math.round(cm / 2) : Math.round(cm);
      },
      distMm: (p) => { need(p, 'distance'); return sim.distanceMm(); },
      distCmp(p, mode, n, unit) {
        need(p, 'distance'); n = num(n);
        const v = unit === 'in' ? sim.distRaw() / 2.54 : unit === 'pct' ? sim.distRaw() / 2 : sim.distRaw();
        return mode === 'closer' ? v < n : mode === 'farther' ? v > n : Math.round(v) === Math.round(n);
      },
      distLess: (p, op, n) => { need(p, 'distance'); const d = sim.distance(); return op === '<' ? d < num(n) : d > num(n); },   // 舊積木相容
      pressed: (p) => { need(p, 'force'); return sim.pressed(); },
      forceState(p, st) { need(p, 'force'); const f = force(); return st === 'hard' ? f >= 50 : st === 'released' ? f === 0 : f > 0; },
      forceVal(p, unit) { need(p, 'force'); return unit === 'pct' ? force() : Math.round(force()) / 10; },
      forceDeci(p) { need(p, 'force'); return force(); },
      buttonMs(side) { const t = sim.buttons[side]; return t ? Math.round(performance.now() - t) : 0; },
      buttonIs(side) { return !!sim.buttons[side]; },
      yaw: () => sim.yaw(),
      yawDeci: () => Math.round(-((sim.th - sim.yawOff) * 1800 / Math.PI)),
      angle(axis) { return axis === 'yaw' ? sim.yaw() : 0; },     // 機器人平放在地上，俯仰與滾動固定為 0
      resetYaw(deci) { sim.yawOff = sim.th + (num(deci) * Math.PI) / 1800; },
      timer: () => sim.timer(),
      resetTimer() { sim.timerOff = sim.simTime; },
      ticksMs: () => Math.round(sim.simTime * 1000),

      /* ----- 訊息、執行緒 ----- */
      resetRun() { sim.msgs = {}; seen = {}; msgs = {}; handled = {}; killed = new Set(); sim.aborted = false; this.stopSounds(); },
      setReceivers(map) { receivers = map || {}; },
      setThreads(n) { threadCount = n; },
      broadcast(m) { msgs[m] = (msgs[m] || 0) + 1; },
      async broadcastWait(m) {
        const R = receivers[m] || 0, n = (msgs[m] = (msgs[m] || 0) + 1); if (!R) return;
        await sim.waitUntil(() => (handled[m] || 0) >= n * R);
      },
      msgDone(m) { handled[m] = (handled[m] || 0) + 1; },
      async waitMsg(m, who) {
        const k = who + '|' + m;
        await sim.waitUntil(() => (msgs[m] || 0) > (seen[k] || 0));
        seen[k] = (seen[k] || 0) + 1;
      },
      stopStacks(mode, who) {
        if (mode === 'all') { sim.abort(); throw STOP; }
        if (mode === 'this') throw THREAD_STOP;
        for (let j = 0; j < threadCount; j++) if (j !== who) killed.add(j);
      },
      stopProgram() { sim.abort(); throw STOP; },
      stopSim() { sim.abort(); },
      ticksNow: () => sim.simTime,
      STOP, THREAD_STOP,
      /* 每個事件堆疊拿到自己的 api：被「停止其他積木堆疊」停掉時，下一次呼叫會丟出 THREAD_STOP */
      forThread(i) {
        const self = this;
        return new Proxy(self, {
          get(t, k) {
            const v = t[k];
            if (k === 'stopStacks') return (mode) => t.stopStacks(mode, i);
            if (typeof v !== 'function') return v;
            return (...a) => {
              if (killed.has(i)) throw THREAD_STOP;
              const r = v.apply(t, a);
              return r && typeof r.then === 'function' ? r.then((x) => { if (killed.has(i)) throw THREAD_STOP; return x; }) : r;
            };
          },
        });
      },
    };
    return api;
  };
})(window.SP = window.SP || {});
