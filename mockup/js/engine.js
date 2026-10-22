/* 積木闖關：模擬器引擎（純邏輯，不碰畫面）
 *
 * 地圖字元：
 *   .  地板          #  牆（地圖邊界也算牆）
 *   =  黑線          B  寶特瓶（底下有黑線，但感測器優先回報寶特瓶）
 *   G  終點          *  終點（底下有黑線）
 *   r/g/b  紅/綠/藍色地板
 *   O  貨物（放在地板上）   Z  放置區
 *
 * 程式（JSON）：
 *   "move" | "left" | "right" | "grab" | "drop"
 *   {turn: 90 | -90 | 180 | -180}                旋轉 X 度（正 = 往右／順時針）
 *   {move: n}                                    往前走 n 格
 *   {repeat: n, do: [...]}
 *   {until: [...]}                               一直做，直到到達終點
 *   {if: 條件, then: [...], else: [...]}         else 省略 = 只有「如果…就…」
 *   條件：{look: 'front'|'left'|'right', is: 'wall'|'line'|'bottle'|'cargo'} 或 {floor: 'red'|'green'|'blue'}
 */
(function (RQ) {
  'use strict';

  const DIRS = ['N', 'E', 'S', 'W'];
  const DR = [-1, 0, 1, 0];
  const DC = [0, 1, 0, -1];

  const MESSAGES = {
    wall: '機器人撞到牆了',
    bottle: '機器人撞倒寶特瓶了',
    end_not_goal: '程式跑完了，但機器人還沒到終點',
    passed_goal: '機器人經過了終點，但沒有停在終點',
    mission_incomplete: '機器人到終點了，但貨物還沒處理完（放進放置區／全部夾完）',
    too_long: '機器人走太久了，好像一直在繞圈',
    idle_loop: '程式一直重複，但機器人都沒有動',
    no_item: '這裡沒有貨物可以夾',
    already_holding: '機器人已經夾著貨物了',
    empty_hand: '機器人手上沒有貨物可以放',
    wrong_zone: '貨物放錯位置了',
    missing_cond: '「如果」積木還沒有放感測條件',
    empty: '程式裡還沒有積木',
  };

  // ---------- 地圖 ----------

  function charAt(map, r, c) {
    if (r < 0 || c < 0 || r >= map.grid.length || c >= map.grid[0].length) return null;
    return map.grid[r][c];
  }
  const isWallCh = (ch) => ch === null || ch === '#';
  const isLineCh = (ch) => ch === '=' || ch === '*';
  const isGoalCh = (ch) => ch === 'G' || ch === '*';
  const floorColorOf = (ch) => ({ r: 'red', g: 'green', b: 'blue' }[ch] || null);
  const passable = (ch) => !isWallCh(ch) && ch !== 'B';

  function dirIndex(d) {
    return typeof d === 'number' ? d : DIRS.indexOf(d);
  }

  function mirrorMap(map, axis) {
    const rows = map.grid.length;
    const cols = map.grid[0].length;
    const s = map.start;
    if (axis === 'h') {
      return {
        ...map,
        grid: map.grid.map((row) => row.split('').reverse().join('')),
        start: { r: s.r, c: cols - 1 - s.c, dir: { N: 'N', S: 'S', E: 'W', W: 'E' }[s.dir] },
      };
    }
    return {
      ...map,
      grid: map.grid.slice().reverse(),
      start: { r: rows - 1 - s.r, c: s.c, dir: { N: 'S', S: 'N', E: 'E', W: 'W' }[s.dir] },
    };
  }

  // 黑線從起點依序走到終點的格子順序（第 8 關算進度用）
  function lineOrder(map) {
    const isTrack = (ch) => ch === '=' || ch === '*' || ch === 'B';
    const order = [];
    const seen = new Set();
    let r = map.start.r;
    let c = map.start.c;
    if (!isTrack(charAt(map, r, c))) return order;
    for (;;) {
      order.push([r, c]);
      seen.add(r + ',' + c);
      let next = null;
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        if (isTrack(charAt(map, nr, nc)) && !seen.has(nr + ',' + nc)) { next = [nr, nc]; break; }
      }
      if (!next) break;
      [r, c] = next;
    }
    return order;
  }

  // 每一格到終點的最短距離（算一般關卡的進度用）
  function goalDistances(map) {
    const dist = {};
    const q = [];
    map.grid.forEach((row, r) => row.split('').forEach((ch, c) => {
      if (isGoalCh(ch)) { dist[r + ',' + c] = 0; q.push([r, c]); }
    }));
    while (q.length) {
      const [r, c] = q.shift();
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d];
        const nc = c + DC[d];
        const k = nr + ',' + nc;
        if (dist[k] === undefined && passable(charAt(map, nr, nc))) {
          dist[k] = dist[r + ',' + c] + 1;
          q.push([nr, nc]);
        }
      }
    }
    return dist;
  }

  // ---------- 程式 ----------

  // 把關卡檔裡的簡寫程式轉成統一格式 {t, ...}
  function normalize(prog) {
    return (prog || []).map((n) => {
      if (typeof n === 'string') return { t: n };
      if (n.t) return n;
      if ('turn' in n) return { t: 'turn', deg: n.turn };
      if ('move' in n) return { t: 'move', n: n.move };
      if ('repeat' in n) return { t: 'repeat', n: n.repeat, body: normalize(n.do) };
      if ('until' in n) return { t: 'until', body: normalize(n.until) };
      if ('if' in n) {
        return {
          t: 'if',
          cond: normalizeCond(n.if),
          then: normalize(n.then),
          else: n.else === undefined ? null : normalize(n.else),
        };
      }
      throw new Error('看不懂的程式節點：' + JSON.stringify(n));
    });
  }
  function normalizeCond(c) {
    if (!c) return null;
    if (c.t) return c;
    if (c.look) return { t: 'look', side: c.look, is: c.is };
    if (c.floor) return { t: 'floor', color: c.floor };
    return null;
  }

  function mirrorProgram(prog) {
    const swap = { left: 'right', right: 'left' };
    return normalize(prog).map((n) => {
      if (n.t === 'left' || n.t === 'right') return { ...n, t: swap[n.t] };
      if (n.t === 'turn') return { ...n, deg: -n.deg };
      if (n.t === 'repeat' || n.t === 'until') return { ...n, body: mirrorProgram(n.body) };
      if (n.t === 'if') {
        const cond = n.cond && n.cond.t === 'look' ? { ...n.cond, side: swap[n.cond.side] || n.cond.side } : n.cond;
        return { ...n, cond, then: mirrorProgram(n.then), else: n.else ? mirrorProgram(n.else) : n.else };
      }
      return n;
    });
  }

  // 積木數（感測條件也算一塊）
  function countBlocks(prog) {
    return normalize(prog).reduce((sum, n) => {
      if (n.t === 'repeat' || n.t === 'until') return sum + 1 + countBlocks(n.body);
      if (n.t === 'if') return sum + 1 + (n.cond ? 1 : 0) + countBlocks(n.then) + (n.else ? countBlocks(n.else) : 0);
      return sum + 1;
    }, 0);
  }

  // 把程式攤平成記號序列（算第 3 關的「改了幾塊」用）
  function tokens(prog) {
    const out = [];
    normalize(prog).forEach((n) => {
      if (n.t === 'repeat') { out.push('repeat' + n.n + '{'); out.push(...tokens(n.body)); out.push('}'); }
      else if (n.t === 'until') { out.push('until{'); out.push(...tokens(n.body)); out.push('}'); }
      else if (n.t === 'if') {
        const c = n.cond ? (n.cond.t === 'look' ? n.cond.side + ':' + n.cond.is : 'floor:' + n.cond.color) : '?';
        out.push('if(' + c + '){'); out.push(...tokens(n.then));
        if (n.else) { out.push('}else{'); out.push(...tokens(n.else)); }
        out.push('}');
      } else if (n.t === 'turn') out.push('turn' + n.deg);
      else if (n.t === 'move' && n.n > 1) out.push('move' + n.n);
      else out.push(n.t);
    });
    return out;
  }
  function editDistance(a, b) {
    const x = tokens(a);
    const y = tokens(b);
    const d = Array.from({ length: x.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= y.length; j++) d[0][j] = j;
    for (let i = 1; i <= x.length; i++) {
      for (let j = 1; j <= y.length; j++) {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
      }
    }
    return d[x.length][y.length];
  }

  function hasMissingCond(prog) {
    return normalize(prog).some((n) => {
      if (n.t === 'repeat' || n.t === 'until') return hasMissingCond(n.body);
      if (n.t === 'if') return !n.cond || hasMissingCond(n.then) || (n.else ? hasMissingCond(n.else) : false);
      return false;
    });
  }

  function usesSensor(prog) {
    return normalize(prog).some((n) => {
      if (n.t === 'repeat' || n.t === 'until') return usesSensor(n.body);
      return n.t === 'if';
    });
  }

  // ---------- 執行 ----------

  const HALT = {};

  /**
   * run(program, map) → { ok, fail, message, trace[], steps, progress }
   * trace 每一筆：{ kind, id, state, ... }
   *   kind: move | turn | grab | drop | check | bump
   */
  function run(program, map, opts) {
    opts = opts || {};
    const maxSteps = opts.maxSteps || 200;
    const maxTicks = opts.maxTicks || 2000;
    const prog = normalize(program);
    const dist = goalDistances(map);
    const order = opts.lineProgress ? lineOrder(map) : null;
    const orderIndex = {};
    if (order) order.forEach(([r, c], i) => { orderIndex[r + ',' + c] = i; });

    const items = new Set();
    map.grid.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === 'O') items.add(r + ',' + c); }));
    const totalItems = items.size;

    const st = { r: map.start.r, c: map.start.c, dir: dirIndex(map.start.dir), holding: false, carried: 0, delivered: 0 };
    const d0 = dist[st.r + ',' + st.c] || 1;
    let best = 0;
    const trace = [];
    let steps = 0;
    let ticks = 0;
    let passedGoal = false;
    let fail = null;

    const snap = () => ({ r: st.r, c: st.c, dir: st.dir, holding: st.holding, carried: st.carried, delivered: st.delivered, items: [...items] });
    const here = () => charAt(map, st.r, st.c);
    const atGoal = () => isGoalCh(here());

    function note() {
      const k = st.r + ',' + st.c;
      if (order) {
        if (orderIndex[k] !== undefined) best = Math.max(best, orderIndex[k] / Math.max(1, order.length - 1));
      } else if (dist[k] !== undefined) {
        best = Math.max(best, (d0 - dist[k]) / d0);
      }
    }
    function halt(code, entry) {
      fail = code;
      if (entry) trace.push(entry);
      throw HALT;
    }
    function action() {
      if (++steps > maxSteps) halt('too_long');
    }
    function tick() {
      if (++ticks > maxTicks) halt(steps === 0 ? 'idle_loop' : 'too_long');
    }

    function relCell(side) {
      const d = (st.dir + ({ front: 0, right: 1, left: 3 }[side] || 0)) % 4;
      return [st.r + DR[d], st.c + DC[d]];
    }
    function evalCond(cond) {
      if (cond.t === 'floor') return { value: floorColorOf(here()) === cond.color, cell: [st.r, st.c] };
      const [r, c] = relCell(cond.side);
      const ch = charAt(map, r, c);
      let value = false;
      if (cond.is === 'wall') value = isWallCh(ch);
      else if (cond.is === 'line') value = isLineCh(ch);
      else if (cond.is === 'bottle') value = ch === 'B';
      else if (cond.is === 'cargo') value = items.has(r + ',' + c);
      return { value, cell: [r, c] };
    }

    function exec(list) {
      for (const n of list) execNode(n);
    }
    function execNode(n) {
      switch (n.t) {
        case 'move': {
          // 往前走 N 格：每一格都是一個動作
          for (let k = 0; k < (n.n || 1); k++) {
            action();
            const nr = st.r + DR[st.dir];
            const nc = st.c + DC[st.dir];
            const ch = charAt(map, nr, nc);
            if (isWallCh(ch)) halt('wall', { kind: 'bump', id: n.id, state: snap(), to: [nr, nc] });
            if (ch === 'B') halt('bottle', { kind: 'bump', id: n.id, state: snap(), to: [nr, nc], bottle: true });
            st.r = nr;
            st.c = nc;
            if (isGoalCh(ch)) passedGoal = true;
            note();
            trace.push({ kind: 'move', id: n.id, state: snap() });
          }
          break;
        }
        case 'left':
        case 'right':
        case 'turn': {
          action();
          const deg = n.t === 'turn' ? n.deg : n.t === 'left' ? -90 : 90;
          st.dir = (st.dir + deg / 90 + 8) % 4;
          trace.push({ kind: 'turn', id: n.id, deg, state: snap() });
          break;
        }
        case 'grab': {
          action();
          // 收集模式（map.collect）：夾爪在前方，腳下或前面那一格的貨物都夾得到；可以一直夾，不用放下
          const here = st.r + ',' + st.c;
          const ahead = (st.r + DR[st.dir]) + ',' + (st.c + DC[st.dir]);
          const k = items.has(here) ? here : map.collect && items.has(ahead) ? ahead : null;
          if (st.holding && !map.collect) halt('already_holding', { kind: 'grab', id: n.id, state: snap(), failed: true });
          if (k === null) halt('no_item', { kind: 'grab', id: n.id, state: snap(), failed: true });
          items.delete(k);
          st.holding = true;
          st.carried = map.collect ? st.carried + 1 : 1;
          if (map.collect) st.delivered++;
          trace.push({ kind: 'grab', id: n.id, state: snap() });
          break;
        }
        case 'drop': {
          action();
          if (!st.holding) halt('empty_hand', { kind: 'drop', id: n.id, state: snap(), failed: true });
          st.holding = false;
          st.carried = 0;
          if (here() !== 'Z') halt('wrong_zone', { kind: 'drop', id: n.id, state: snap(), failed: true, droppedAt: [st.r, st.c] });
          st.delivered++;
          trace.push({ kind: 'drop', id: n.id, state: snap() });
          break;
        }
        case 'repeat':
          for (let i = 0; i < n.n; i++) { tick(); exec(n.body); }
          break;
        case 'until':
          for (;;) {
            tick();
            if (atGoal()) break;
            exec(n.body);
          }
          break;
        case 'if': {
          tick();
          if (!n.cond) halt('missing_cond');
          const { value, cell } = evalCond(n.cond);
          trace.push({ kind: 'check', id: n.id, cond: n.cond, value, cell, state: snap() });
          if (value) exec(n.then);
          else if (n.else) exec(n.else);
          break;
        }
        default:
          throw new Error('未知的積木：' + n.t);
      }
    }

    note();
    try {
      if (!prog.length) halt('empty');
      exec(prog);
      if (atGoal() && st.delivered >= totalItems) {
        // 成功
      } else if (atGoal()) fail = 'mission_incomplete';
      else if (passedGoal) fail = 'passed_goal';
      else fail = 'end_not_goal';
    } catch (e) {
      if (e !== HALT) throw e;
    }

    const ok = fail === null;
    if (ok) best = 1;
    return { ok, fail, message: ok ? '成功到達終點！' : MESSAGES[fail], trace, steps, progress: Math.round(best * 1000) / 1000, end: snap() };
  }

  // 執行前的狀態（「上一步」退回起點時用）
  function startState(map) {
    const items = [];
    map.grid.forEach((row, r) => row.split('').forEach((ch, c) => { if (ch === 'O') items.push(r + ',' + c); }));
    return { r: map.start.r, c: map.start.c, dir: dirIndex(map.start.dir), holding: false, carried: 0, delivered: 0, items };
  }

  RQ.startState = startState;
  RQ.DIRS = DIRS;
  RQ.DR = DR;
  RQ.DC = DC;
  RQ.MESSAGES = MESSAGES;
  RQ.charAt = charAt;
  RQ.isLineCh = isLineCh;
  RQ.isGoalCh = isGoalCh;
  RQ.dirIndex = dirIndex;
  RQ.mirrorMap = mirrorMap;
  RQ.mirrorProgram = mirrorProgram;
  RQ.normalize = normalize;
  RQ.countBlocks = countBlocks;
  RQ.editDistance = editDistance;
  RQ.hasMissingCond = hasMissingCond;
  RQ.usesSensor = usesSensor;
  RQ.lineOrder = lineOrder;
  RQ.run = run;
})((window.RQ = window.RQ || {}));
