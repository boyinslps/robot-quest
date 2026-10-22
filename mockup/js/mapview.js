/* 地圖畫面（SVG）與機器人動畫 */
(function (RQ) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const S = 48; // 每格大小（viewBox 單位）
  const PAD = 8;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  const cx = (c) => PAD + c * S + S / 2;
  const cy = (r) => PAD + r * S + S / 2;
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));

  class MapView {
    constructor(host, opts) {
      this.host = host;
      this.opts = opts || {};
      this.angle = 0;
      this.dir = 0;
    }

    render(map) {
      this.map = map;
      const rows = map.grid.length;
      const cols = map.grid[0].length;
      const W = cols * S + PAD * 2;
      const H = rows * S + PAD * 2;
      this.host.innerHTML = '';
      const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'map-svg', preserveAspectRatio: 'xMidYMid meet' }, this.host);
      this.svg = svg;

      // 外框（地圖邊界也是牆）
      el('rect', { x: 0, y: 0, width: W, height: H, rx: 6, fill: '#5a5147' }, svg);
      const ground = el('g', {}, svg);
      const lineLayer = el('g', {}, svg);
      const objLayer = el('g', {}, svg);
      this.fxLayer = el('g', {}, svg);

      const ch = (r, c) => RQ.charAt(map, r, c);
      const track = (x) => x === '=' || x === '*' || x === 'B';

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = PAD + c * S;
          const y = PAD + r * S;
          const k = ch(r, c);
          if (k === '#') {
            el('rect', { x, y, width: S, height: S, fill: '#6b6156' }, ground);
            el('path', { d: `M${x} ${y + S / 2}H${x + S}M${x + S / 2} ${y}V${y + S / 2}M${x + S / 4} ${y + S / 2}V${y + S}M${x + (3 * S) / 4} ${y + S / 2}V${y + S}`, stroke: '#574e44', 'stroke-width': 2 }, ground);
            continue;
          }
          const fill = { r: '#d9534f', g: '#43a047', b: '#3f7fd1' }[k] || '#efede7';
          el('rect', { x, y, width: S, height: S, fill, stroke: '#d6d2c6', 'stroke-width': 1 }, ground);
          if (k === 'Z') {
            el('rect', { x: x + 4, y: y + 4, width: S - 8, height: S - 8, fill: '#d5eed5', stroke: '#2e8b3e', 'stroke-width': 3, 'stroke-dasharray': '6 4', rx: 4 }, ground);
          }
          if (k === 'G' || k === '*') {
            const g = el('g', { opacity: 0.85 }, ground);
            const n = 4;
            const q = (S - 8) / n;
            for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
              el('rect', { x: x + 4 + j * q, y: y + 4 + i * q, width: q, height: q, fill: (i + j) % 2 ? '#fff' : '#333' }, g);
            }
          }
          if (track(k)) {
            const w = S * 0.34;
            const o = (S - w) / 2;
            el('rect', { x: x + o, y: y + o, width: w, height: w, fill: '#151515' }, lineLayer);
            if (track(ch(r - 1, c))) el('rect', { x: x + o, y, width: w, height: o, fill: '#151515' }, lineLayer);
            if (track(ch(r + 1, c))) el('rect', { x: x + o, y: y + o + w, width: w, height: o, fill: '#151515' }, lineLayer);
            if (track(ch(r, c - 1))) el('rect', { x, y: y + o, width: o, height: w, fill: '#151515' }, lineLayer);
            if (track(ch(r, c + 1))) el('rect', { x: x + o + w, y: y + o, width: o, height: w, fill: '#151515' }, lineLayer);
          }
          if (k === 'B') {
            // 寶特瓶：瓶身藍色、瓶蓋黃色（用 icons.js 的圖示，放大到格子大小）
            const sc = (S * 0.86) / 24;
            const g = el('g', { transform: `translate(${x + S * 0.07},${y + S * 0.07}) scale(${sc})` }, objLayer);
            g.innerHTML = RQ.ICON_PATHS.bottle;
          }
        }
      }

      // 貨物
      this.items = {};
      map.grid.forEach((row, r) => row.split('').forEach((k, c) => {
        if (k === 'O') this.items[r + ',' + c] = this._crate(objLayer, cx(c), cy(r));
      }));
      this.delivered = this._crate(objLayer, 0, 0);
      this.delivered.style.display = 'none';
      this.dropped = this._crate(objLayer, 0, 0, true);
      this.dropped.style.display = 'none';

      // 機器人
      this.robot = el('g', { class: 'robot' }, svg);
      const body = el('g', { class: 'robot-body' }, this.robot);
      el('rect', { x: -S * 0.37, y: -S * 0.27, width: S * 0.12, height: S * 0.54, rx: 3, fill: '#222' }, body);
      el('rect', { x: S * 0.25, y: -S * 0.27, width: S * 0.12, height: S * 0.54, rx: 3, fill: '#222' }, body);
      el('rect', { x: -S * 0.27, y: -S * 0.3, width: S * 0.54, height: S * 0.6, rx: 6, fill: '#dfe3e8', stroke: '#333', 'stroke-width': 2 }, body);
      el('rect', { x: -S * 0.15, y: -S * 0.08, width: S * 0.3, height: S * 0.22, rx: 2, fill: '#3b4d5c' }, body);
      el('polygon', { points: `0,${-S * 0.46} ${-S * 0.17},${-S * 0.25} ${S * 0.17},${-S * 0.25}`, fill: '#e0a526', stroke: '#8a6414', 'stroke-width': 1.5 }, body);
      this.held = this._crate(body, 0, -S * 0.5, false, 0.55);
      this.held.style.display = 'none';
      if (this.badge) this.badge.style.display = 'none';
      // 背上的數字：夾著幾個貨物（跟著機器人轉，但數字保持正向）
      this.badge = el('g', {}, body);
      el('circle', { cx: 0, cy: 0, r: S * 0.19, fill: '#e0a526', stroke: '#8a6414', 'stroke-width': 1.5 }, this.badge);
      this.badgeText = el('text', { x: 0, y: S * 0.09, 'text-anchor': 'middle', 'font-size': S * 0.26, 'font-weight': 700, fill: '#2b2412', 'font-family': 'sans-serif' }, this.badge);
      this.badge.style.display = 'none';

      this.reset(true);
    }

    _crate(parent, x, y, bad, scale) {
      const s = S * 0.44 * (scale || 1);
      const g = el('g', { transform: `translate(${x},${y})` }, parent);
      el('rect', { x: -s / 2, y: -s / 2, width: s, height: s, rx: 3, fill: '#f2b632', stroke: bad ? '#c62828' : '#8a6414', 'stroke-width': bad ? 3 : 2 }, g);
      el('path', { d: `M${-s / 2} 0H${s / 2}M0 ${-s / 2}V${s / 2}`, stroke: '#8a6414', 'stroke-width': 1.5 }, g);
      return g;
    }

    _place(r, c, dir, dur, deg) {
      if (deg !== undefined) {
        this.angle += deg; // 旋轉 180／-180 轉的方向不同
      } else {
        let delta = (dir - this.dir + 4) % 4;
        if (delta === 3) delta = -1;
        this.angle += delta * 90;
      }
      this.dir = dir;
      this.robot.style.transition = dur ? `transform ${dur}ms ease-in-out` : 'none';
      this.robot.style.transform = `translate(${cx(c)}px, ${cy(r)}px) rotate(${this.angle}deg)`;
      this.pos = [r, c];
      if (this.badge) this.badge.setAttribute('transform', `translate(0 ${S * 0.02}) rotate(${-this.angle})`);
    }

    reset(instant) {
      const s = this.map.start;
      this.angle = RQ.dirIndex(s.dir) * 90;
      this.dir = RQ.dirIndex(s.dir);
      this._place(s.r, s.c, this.dir, 0);
      Object.values(this.items).forEach((g) => (g.style.display = ''));
      this.held.style.display = 'none';
      if (this.badge) this.badge.style.display = 'none';
      this.delivered.style.display = 'none';
      this.dropped.style.display = 'none';
      this.robot.classList.remove('shake', 'jump');
      this.fxLayer.innerHTML = '';
      if (!instant) this.robot.getBoundingClientRect();
    }

    // 直接跳到某個狀態（「上一步」用，不播動畫）
    setState(s) {
      this.dir = s.dir;
      this.angle = s.dir * 90;
      this._place(s.r, s.c, s.dir, 0);
      this.delivered.style.display = 'none';
      this.dropped.style.display = 'none';
      this.fxLayer.innerHTML = '';
      this.robot.querySelector('.robot-body').classList.remove('shake', 'jump');
      this._items(s);
    }

    _items(state) {
      Object.entries(this.items).forEach(([k, g]) => (g.style.display = state.items.includes(k) ? '' : 'none'));
      this.held.style.display = state.holding ? '' : 'none';
      const n = state.carried !== undefined ? state.carried : state.holding ? 1 : 0;
      this.badge.style.display = n > 0 ? '' : 'none';
      this.badgeText.textContent = String(n);
      if (state.delivered > 0) {
        const z = this._findChar('Z');
        if (z) {
          this.delivered.setAttribute('transform', `translate(${cx(z[1])},${cy(z[0])})`);
          this.delivered.style.display = '';
        }
      }
    }
    _findChar(k) {
      for (let r = 0; r < this.map.grid.length; r++) {
        const c = this.map.grid[r].indexOf(k);
        if (c >= 0) return [r, c];
      }
      return null;
    }

    sensor(cell, value, dur) {
      const [r, c] = cell;
      const rows = this.map.grid.length;
      const cols = this.map.grid[0].length;
      const inside = r >= 0 && c >= 0 && r < rows && c < cols;
      // 看向地圖外（邊界牆）時，把標記畫在外框上
      const px = Math.max(14, Math.min(cols * S + PAD * 2 - 14, cx(c)));
      const py = Math.max(14, Math.min(rows * S + PAD * 2 - 14, cy(r)));
      const size = inside ? S - 6 : S * 0.55;
      const rect = el('rect', {
        x: px - size / 2, y: py - size / 2, width: size, height: size, rx: 6,
        fill: value ? 'rgba(255, 214, 64, 0.6)' : 'rgba(120, 120, 120, 0.3)',
        stroke: value ? '#e0a526' : '#888', 'stroke-width': 3, 'stroke-dasharray': value ? '' : '5 4', class: 'sensor-fx',
      }, this.fxLayer);
      const k = inside ? 1 : 0.6;
      const t = el('path', {
        d: value ? 'M-9 1l6 6 12-13' : 'M-7-7l14 14M7-7l-14 14',
        transform: `translate(${px},${py}) scale(${k})`,
        fill: 'none', stroke: value ? '#8a6414' : '#555', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'sensor-fx',
      }, this.fxLayer);
      setTimeout(() => { rect.remove(); t.remove(); }, Math.max(250, dur * 1.2));
    }

    // 播放一筆 trace
    async apply(e, dur) {
      const s = e.state;
      switch (e.kind) {
        case 'move':
        case 'turn': {
          const d = e.kind === 'turn' && Math.abs(e.deg) === 180 ? dur * 1.5 : dur;
          this._place(s.r, s.c, s.dir, d, e.kind === 'turn' ? e.deg : undefined);
          this._items(s);
          await wait(d);
          break;
        }
        case 'grab':
        case 'drop':
          this._items(s);
          if (e.droppedAt) {
            this.dropped.setAttribute('transform', `translate(${cx(e.droppedAt[1])},${cy(e.droppedAt[0])})`);
            this.dropped.style.display = '';
          }
          await wait(dur * 0.7);
          break;
        case 'check':
          this.sensor(e.cell, e.value, dur * 0.6);
          await wait(dur * 0.6);
          break;
        case 'bump': {
          const [r, c] = s.r !== undefined ? [s.r, s.c] : this.pos;
          const [tr, tc] = e.to;
          const bx = cx(c) + (cx(tc) - cx(c)) * 0.3;
          const by = cy(r) + (cy(tr) - cy(r)) * 0.3;
          this.robot.style.transition = `transform ${dur / 2}ms ease-in`;
          this.robot.style.transform = `translate(${bx}px, ${by}px) rotate(${this.angle}deg)`;
          await wait(dur / 2);
          this._place(r, c, this.dir, dur / 2);
          await wait(dur / 2);
          break;
        }
        default:
          break;
      }
    }

    shake() {
      const b = this.robot.querySelector('.robot-body');
      b.classList.remove('shake');
      b.getBoundingClientRect();
      b.classList.add('shake');
    }
    jump() {
      const b = this.robot.querySelector('.robot-body');
      b.classList.remove('jump');
      b.getBoundingClientRect();
      b.classList.add('jump');
    }
  }

  RQ.MapView = MapView;
  RQ.wait = wait;
})((window.RQ = window.RQ || {}));
