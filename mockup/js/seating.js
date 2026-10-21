/* 座位表（顯示在考試說明頁，在規則旁邊）
 *
 * 電腦教室：4 排 × 每排 8 個座位，排是「直的」（每一排由前到後 8 個）。
 * 同學坐在第 2、3 排，每隔一個座位坐一人（隔開，避免偷看）；第 2、3 排的位置錯開，
 * 所以前後左右都沒有人緊鄰。班級由小到大依序入座：先填滿第 2 排，再填第 3 排。
 *
 * 想改人、改座位，只要改下面 RQ.SEATING：
 *   students：考生（只放班級與座號，不放姓名：這個網站是公開的）
 *   layout  ：每一排有哪些座位要坐人（座位從前到後 1–8）
 *   front   ：'top' = 圖的上方是教室前方；'bottom' = 下方是前方
 *   reverse ：false = 第 1 排在最左邊；true = 第 1 排在最右邊
 */
(function (RQ) {
  'use strict';

  const SEATING = (RQ.SEATING = {
    rows: 4,
    seatsPerRow: 8,
    front: 'top',
    reverse: false,
    layout: [
      { row: 2, seats: [1, 3, 5, 7] },
      { row: 3, seats: [2, 4, 6, 8] },
    ],
    students: [
      { cls: '502', seat: 8 },
      { cls: '505', seat: 6 },
      { cls: '506', seat: 2 },
      { cls: '509', seat: 11 },
      { cls: '510', seat: 7 },
      { cls: '511', seat: 5 },
      { cls: '604', seat: 7 },
      { cls: '610', seat: 7 },
    ],
  });

  /** 依班級（小到大）、座號排好，再依序填進 layout 的位置。回傳 [{ cls, seat, row, pos }] */
  RQ.seatAssignments = function (cfg) {
    const c = cfg || SEATING;
    const list = [...c.students].sort((a, b) => Number(a.cls) - Number(b.cls) || a.seat - b.seat);
    const spots = [];
    c.layout.forEach((l) => l.seats.forEach((pos) => spots.push({ row: l.row, pos })));
    return list.map((s, i) => (spots[i] ? { ...s, row: spots[i].row, pos: spots[i].pos } : { ...s, row: null, pos: null }));
  };

  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const pad2 = (n) => String(n).padStart(2, '0');

  /** 把座位表畫進 box（一個空的 div） */
  RQ.renderSeating = function (box, cfg) {
    const c = cfg || SEATING;
    const at = {};
    RQ.seatAssignments(c).forEach((a) => { if (a.row) at[a.row + '-' + a.pos] = a; });
    const used = new Set(c.layout.map((l) => l.row));
    const rowOrder = Array.from({ length: c.rows }, (_, i) => i + 1);
    if (c.reverse) rowOrder.reverse();
    const seatOrder = Array.from({ length: c.seatsPerRow }, (_, i) => i + 1);
    if (c.front === 'bottom') seatOrder.reverse();

    const cols = rowOrder.map((r) => {
      const cells = seatOrder.map((p) => {
        const a = at[r + '-' + p];
        return a
          ? `<div class="seat on" title="第 ${r} 排 第 ${p} 個"><b>${esc(a.cls)}</b><span>${pad2(a.seat)} 號</span></div>`
          : `<div class="seat off${used.has(r) ? ' gap' : ''}" aria-hidden="true"></div>`;
      }).join('');
      return `<div class="seat-col${used.has(r) ? ' used' : ''}"><div class="seat-colhead">第 ${r} 排</div>${cells}</div>`;
    }).join('');

    const front = '<div class="seat-front">教室前方</div>';
    box.innerHTML = `<div class="seat-title">座位表</div>
      <div class="seat-map">${c.front === 'bottom' ? '' : front}<div class="seat-cols">${cols}</div>${c.front === 'bottom' ? front : ''}</div>
      <div class="seat-note">請照座位表入座：找到你的<b>班級</b>和<b>座號</b>。</div>`;
  };

  const box = document.getElementById('seat-chart');
  if (box) RQ.renderSeating(box);
})((window.RQ = window.RQ || {}));
