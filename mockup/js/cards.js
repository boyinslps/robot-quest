/* 新積木說明卡：只說明積木怎麼運作，不給解法 */
(function (RQ) {
  'use strict';

  RQ.CARDS = {
    move: {
      title: '積木：往前走 1 格',
      html: '機器人會朝<b>黃色箭頭</b>的方向走一格。<br>把左邊的積木<b>拖進「機器人程式」裡面</b>，再按「執行」。',
      sample: { prog: ['move'] },
    },
    turn: {
      title: '新積木：向左轉、向右轉',
      html: '機器人會在原地轉 90 度，不會移動。<br><b>左右是以「機器人自己」為準</b>，不是以你為準。<br>例如下圖的機器人面向右邊，它的左邊是畫面上方。',
      turnDemo: true,
      sample: { prog: ['left', 'right'] },
    },
    repeat: {
      title: '新積木：重複 N 次',
      html: '把包在裡面的積木，<b>照順序做 N 次</b>。點數字可以改次數。<br>這關的積木有數量上限，工作區右上角會顯示用了幾塊。',
      sample: { prog: [{ repeat: 3, do: [] }] },
    },
    boss: {
      title: '魔王關：修好它',
      html: '小明寫好了一支搬運程式，但是裡面<b>有兩個地方是錯的</b>。<br>' +
        '找出錯在哪裡，把它修好，讓機器人把貨物送到放置區、再走到終點。<br>' +
        '可以修改、增加或刪除積木，所有學過的積木都可以用。<br>' +
        '<span class="muted">提示：按「一步一步走」，看機器人是在哪裡開始走錯的。</span>',
    },
    grip: {
      title: '新積木：夾取貨物、放下貨物',
      html: '<b>夾取貨物</b>：機器人站在貨物那一格時，把貨物夾起來。<br><b>放下貨物</b>：把夾著的貨物放在機器人現在的格子。<br>貨物要放進<b>綠色虛線框（放置區）</b>，最後機器人要停在終點 ' + RQ.icon('flag', 20) + '。',
      sample: { prog: ['grab', 'drop'] },
    },
    rotate: {
      title: '新積木：旋轉 X 度',
      html: '從這關開始，「向左轉」「向右轉」換成<b>「旋轉 X 度」</b>，點數字可以選角度。<br>' +
        '・<b>正的數字</b>：往機器人的<b>右邊</b>轉（順時針）<br>' +
        '・<b>負的數字</b>：往機器人的<b>左邊</b>轉（逆時針）<br>' +
        '90 度是轉四分之一圈，180 度是轉半圈（向後轉）。',
      rotateDemo: true,
      sample: { prog: [{ turn: 90 }] },
    },
    moven: {
      title: '積木換新了：往前走 N 格',
      html: '從這關開始，「往前走 1 格」換成<b>「往前走 N 格」</b>。<br>點數字可以選<b>一次走幾格</b>（1 到 9 格）。<br>前面有牆或寶特瓶擋住的話，機器人會撞上去，所以要小心。',
    },
    until: {
      title: '新積木：一直做，直到到達終點',
      html: '一直重複做包在裡面的積木，<b>機器人一到終點就停止重複</b>。<br>不用先算好要做幾次、每段要走幾格。<br>' +
        '這關的積木有數量上限，記得看工作區右上角的「積木數」。',
      sample: { prog: [{ until: [] }] },
    },
    ifelse: {
      title: '新積木：如果…就…不然就…',
      html: '機器人可以先<b>「看」</b>，再決定要<b>「做」</b>什麼。<br>' +
        '・條件成立 → 做「就」裡面的積木<br>' +
        '・條件不成立 → 做「不然就」裡面的積木<br>' +
        '<b>兩邊只會做其中一邊</b>，做完就繼續往下。<br>' +
        '「感測〔前方〕〔有寶特瓶〕」讓機器人看看<b>前面那一格</b>有沒有 ' + RQ.icon('bottle', 18) + ' 寶特瓶（撞到寶特瓶就失敗）。<br>' +
        '<span class="muted">下面的示範：同一支程式，在兩張地圖做了不同的事。</span>',
      ifDemo: true,
    },
    wall: {
      title: '感測的對象：牆',
      html: '感測器除了看寶特瓶，這關還可以看<b>前面那一格是不是牆</b>（地圖邊緣也算牆）。<br>' +
        '點感測積木的第二格，可以在「是牆」和「有寶特瓶」之間切換。<b>一個「如果」只能看一種</b>，需要的話就放兩個「如果」。<br>' +
        '執行時，被看的那一格會亮起來：<b>' + RQ.icon('check', 18) + ' 是</b>、<b>' + RQ.icon('cross', 18) + ' 不是</b>。',
      sample: { loose: [{ type: 'rq_look', fields: { SIDE: 'front', IS: 'wall' } }] },
    },
    line: {
      title: '隱藏關卡：循線挑戰',
      html: '機器人要<b>沿著黑線</b>走到終點。<br>' +
        '感測器可以看〔前方／左方／右方〕那一格：<b>是牆、是黑線、有寶特瓶</b>。<br>' +
        '新積木「如果…就…」沒有「不然就」：條件不成立時，<b>什麼都不做</b>。<br>' +
        '撞倒寶特瓶就失敗。寫好了隨時可以按右上角的「<b>交出程式</b>」。',
      sample: { prog: [{ if: null, then: [] }] },
    },
  };

  // ---------- 說明卡視窗 ----------

  let open = null;

  RQ.showCard = function (id, onClose) {
    const card = RQ.CARDS[id];
    const modal = document.getElementById('card');
    modal.querySelector('.card-title').textContent = card.title;
    modal.querySelector('.card-body').innerHTML = card.html;
    const extra = modal.querySelector('.card-extra');
    extra.innerHTML = '';
    const cleanups = [];

    if (card.sample) {
      const div = document.createElement('div');
      div.className = 'card-blocks';
      extra.appendChild(div);
      requestAnimationFrame(() => {
        const ws = Blockly.inject(div, { readOnly: true, theme: RQ.theme, renderer: 'thrasos', scrollbars: false, zoom: { startScale: 1 } });
        if (card.sample.prog) RQ.loadProgram(ws, RQ.normalize(card.sample.prog).map((n) => (n.t === 'if' ? { ...n, cond: null } : n)));
        else RQ.loadLoose(ws, card.sample.loose);
        cleanups.push(() => ws.dispose());
      });
    }
    if (card.turnDemo) extra.appendChild(turnDemo());
    if (card.rotateDemo) extra.appendChild(rotateDemo());
    if (card.ifDemo) cleanups.push(ifDemo(extra));

    const btn = modal.querySelector('.card-ok');
    btn.disabled = true;
    setTimeout(() => (btn.disabled = false), 1500);
    modal.hidden = false;
    open = () => {
      modal.hidden = true;
      cleanups.forEach((f) => f());
      open = null;
      onClose && onClose();
    };
    btn.onclick = () => open && open();
  };

  RQ.closeCard = () => open && open();

  function turnDemo() {
    const wrap = document.createElement('div');
    wrap.className = 'turn-demo';
    wrap.innerHTML = `
      <svg viewBox="0 0 220 150" width="220" height="150">
        <rect x="0" y="0" width="220" height="150" rx="8" fill="#efede7"/>
        <g transform="translate(110,78) rotate(90)">
          <rect x="-18" y="-13" width="6" height="26" rx="2" fill="#222"/>
          <rect x="12" y="-13" width="6" height="26" rx="2" fill="#222"/>
          <rect x="-13" y="-15" width="26" height="30" rx="4" fill="#dfe3e8" stroke="#333" stroke-width="2"/>
          <polygon points="0,-24 -9,-13 9,-13" fill="#e0a526" stroke="#8a6414"/>
        </g>
        <path d="M110 52 V20" stroke="#2f7a67" stroke-width="4" marker-end="url(#ah)"/>
        <path d="M110 104 V132" stroke="#a24f3c" stroke-width="4" marker-end="url(#ah2)"/>
        <text x="118" y="30" font-size="15" font-weight="bold" fill="#2f7a67">機器人的左邊</text>
        <text x="118" y="132" font-size="15" font-weight="bold" fill="#a24f3c">機器人的右邊</text>
        <defs>
          <marker id="ah" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2f7a67"/></marker>
          <marker id="ah2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a24f3c"/></marker>
        </defs>
      </svg>`;
    return wrap;
  }

  // 旋轉角度示意：機器人面向上方
  function rotateDemo() {
    const wrap = document.createElement('div');
    wrap.className = 'turn-demo';
    wrap.innerHTML = `
      <svg viewBox="0 0 360 170" width="360" height="170">
        <defs>
          <marker id="rt1" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2f7a67"/></marker>
          <marker id="rt2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a24f3c"/></marker>
          <marker id="rt3" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#3d5a78"/></marker>
        </defs>
        <rect x="0" y="0" width="360" height="170" rx="8" fill="#efede7"/>
        <g transform="translate(180,92)">
          <rect x="-18" y="-13" width="6" height="26" rx="2" fill="#222"/>
          <rect x="12" y="-13" width="6" height="26" rx="2" fill="#222"/>
          <rect x="-13" y="-15" width="26" height="30" rx="4" fill="#dfe3e8" stroke="#333" stroke-width="2"/>
          <polygon points="0,-24 -9,-13 9,-13" fill="#e0a526" stroke="#8a6414"/>
        </g>
        <path d="M196 50 A46 46 0 0 1 226 92" fill="none" stroke="#2f7a67" stroke-width="4" marker-end="url(#rt1)"/>
        <text x="236" y="60" font-size="18" font-weight="bold" fill="#2f7a67">90（往右）</text>
        <path d="M164 50 A46 46 0 0 0 134 92" fill="none" stroke="#a24f3c" stroke-width="4" marker-end="url(#rt2)"/>
        <text x="30" y="60" font-size="18" font-weight="bold" fill="#a24f3c">-90（往左）</text>
        <path d="M212 110 A36 36 0 0 1 180 146 A36 36 0 0 1 150 128" fill="none" stroke="#3d5a78" stroke-width="4" marker-end="url(#rt3)"/>
        <text x="222" y="150" font-size="18" font-weight="bold" fill="#3d5a78">180（向後轉）</text>
      </svg>`;
    return wrap;
  }

  // 旋轉角度示意圖（第 4 關左下角常駐）：機器人面向上方，標出 90、-90、180 轉到哪裡
  RQ.turnGuide = () => `
    <div class="tg-title">旋轉幾度？（機器人面向上）</div>
    <svg viewBox="0 0 200 150" width="188" height="141">
      <defs>
        <marker id="tg1" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#2f7a67"/></marker>
        <marker id="tg2" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#a24f3c"/></marker>
        <marker id="tg3" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#3d5a78"/></marker>
      </defs>
      <g transform="translate(100,72)">
        <rect x="-15" y="-11" width="5" height="22" rx="2" fill="#222"/>
        <rect x="10" y="-11" width="5" height="22" rx="2" fill="#222"/>
        <rect x="-11" y="-13" width="22" height="26" rx="4" fill="#dfe3e8" stroke="#333" stroke-width="2"/>
        <polygon points="0,-21 -8,-11 8,-11" fill="#e0a526" stroke="#8a6414"/>
      </g>
      <path d="M108 30 A42 42 0 0 1 142 72" fill="none" stroke="#2f7a67" stroke-width="4" marker-end="url(#tg1)"/>
      <text x="150" y="46" font-size="16" font-weight="bold" fill="#2f7a67">90</text>
      <text x="150" y="62" font-size="12" font-weight="bold" fill="#2f7a67">往右轉</text>
      <path d="M92 30 A42 42 0 0 0 58 72" fill="none" stroke="#a24f3c" stroke-width="4" marker-end="url(#tg2)"/>
      <text x="6" y="46" font-size="16" font-weight="bold" fill="#a24f3c">-90</text>
      <text x="6" y="62" font-size="12" font-weight="bold" fill="#a24f3c">往左轉</text>
      <path d="M130 98 A42 42 0 0 1 70 98" fill="none" stroke="#3d5a78" stroke-width="4" marker-end="url(#tg3)"/>
      <text x="100" y="138" font-size="15" font-weight="bold" fill="#3d5a78" text-anchor="middle">180（向後轉）</text>
    </svg>`;

  // 如果…不然 示範：同一支程式跑兩張小地圖，亮起正在做的那一邊
  function ifDemo(extra) {
    const prog = RQ.normalize([{ if: { look: 'front', is: 'bottle' }, then: [{ turn: 90 }], else: ['move'] }]);
    const maps = [
      { name: '前面有寶特瓶 → 做「就」（右轉）', grid: ['.B.', '...'], start: { r: 0, c: 0, dir: 'E' } },
      { name: '前面沒有寶特瓶 → 做「不然就」（前進）', grid: ['...', '...'], start: { r: 0, c: 0, dir: 'E' } },
    ];
    const box = document.createElement('div');
    box.className = 'if-demo';
    box.innerHTML = '<div class="if-demo-blocks"></div><div class="if-demo-maps"></div>';
    extra.appendChild(box);
    const views = maps.map((m) => {
      const cell = document.createElement('div');
      cell.className = 'if-demo-map';
      cell.innerHTML = `<div class="if-demo-view"></div><div class="if-demo-cap">${m.name}</div>`;
      box.querySelector('.if-demo-maps').appendChild(cell);
      const v = new RQ.MapView(cell.querySelector('.if-demo-view'));
      v.render(m);
      return v;
    });

    let alive = true;
    let ws = null;
    const saved = { sides: RQ.blockOpts.sides, is: RQ.blockOpts.is };
    requestAnimationFrame(async () => {
      RQ.blockOpts.sides = ['front'];
      RQ.blockOpts.is = ['bottle'];
      ws = Blockly.inject(box.querySelector('.if-demo-blocks'), { readOnly: true, theme: RQ.theme, renderer: 'thrasos', scrollbars: false });
      RQ.loadProgram(ws, prog);
      const withIds = RQ.compile(ws);
      while (alive) {
        for (let i = 0; i < 2 && alive; i++) {
          const res = RQ.run(withIds, maps[i]);
          views[i].reset();
          box.querySelectorAll('.if-demo-map').forEach((d, k) => d.classList.toggle('active', k === i));
          await RQ.wait(500);
          for (const e of res.trace) {
            if (!alive) return;
            ws.highlightBlock(e.id);
            await views[i].apply(e, 700);
            await RQ.wait(250);
          }
          await RQ.wait(900);
          if (alive) ws.highlightBlock(null);
        }
      }
    });
    return () => { alive = false; if (ws) ws.dispose(); RQ.blockOpts.sides = saved.sides; RQ.blockOpts.is = saved.is; };
  }
})((window.RQ = window.RQ || {}));
