/* 學習任務：像 LEGO 官方入門教學那樣，一步一步帶學生拼積木。
   - 右側「目前任務」卡片：第幾步／共幾步、這一步要做什麼
   - 左邊積木盤只留這一課需要的積木，並用橘色框＋手勢拖曳動畫指出「拿哪一塊、放在哪裡」
   - 學生做對了會自動偵測，打勾後換下一步 */
(function (SP) {
  'use strict';
  const U = SP.ui; if (!U) return;
  const sim = U.sim, api = U.api, ws = U.ws;
  const $ = (id) => document.getElementById(id);

  /* ---------- 偵測用的小工具（給每一步的判斷用） ---------- */
  let runClicks = 0, beeps = 0;
  for (const id of ['btn-run', 'fs-run']) { const b = $(id); if (b) b.addEventListener('click', () => { runClicks++; }, true); }
  { const o = api.beep; api.beep = function () { beeps++; return o.apply(this, arguments); }; }
  const ctx = {
    sim, api,
    blocks: (t) => ws.getAllBlocks(false).filter((b) => b.type === t && !(b.isInsertionMarker && b.isInsertionMarker())),
    has: (t) => ctx.blocks(t).length > 0,
    chain(...ts) {
      return ctx.blocks(ts[0]).some((top) => { let b = top; for (let i = 1; i < ts.length; i++) { b = b.getNextBlock(); if (!b || b.type !== ts[i]) return false; } return true; });
    },
    inside: (parent, input, child) => ctx.blocks(parent).some((p) => { const t = p.getInputTargetBlock(input); return !!t && t.type === child; }),
    field: (t, name) => { const b = ctx.blocks(t)[0]; return b ? b.getFieldValue(name) : null; },
    anyField: (t, name, val) => ctx.blocks(t).some((b) => b.getFieldValue(name) === val),
    num(t, input, i = 0) { const b = ctx.blocks(t)[i], c = b && b.getInputTargetBlock(input), v = c && c.getFieldValue('NUM'); return v == null ? null : Number(v); },
    shared: {},
    running: () => U.isRunning(),
    lit: () => sim.led.filter((v) => v > 0).length,
    runsSince: (m) => runClicks - m.runs0,
    beepsSince: (m) => beeps - m.beeps0,
  };
  const PART_OF = (txt) => [...document.querySelectorAll('.comp-grid .part')].find((p) => p.textContent.includes(txt));
  const center = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

  /* ---------- 步驟的寫法 ---------- */
  const INFO = (say, hint) => ({ kind: 'info', say, hint });
  const DRAG = (say, type, place, done, hint, extra) => ({ kind: 'drag', say, hint, type, place, done, ...extra });
  const SET = (say, block, spot, done, hint, extra) => ({ kind: 'set', say, hint, block, ...spot, done, ...extra });
  const RUN = (say, hint, enter) => ({ kind: 'run', say, hint, enter });
  const TRY = (say, watch, guide, hint, enter) => ({ kind: 'try', say, hint, watch, guide, enter });
  const END = (say) => ({ kind: 'end', say });
  const HAT = (say, type, hint) => DRAG(say, type, { free: true }, (c) => c.has(type), hint);
  const AFTER = (say, type, parent, hint, done) => DRAG(say, type, { after: parent }, done || ((c) => c.chain(parent, type)), hint);

  const brickGuide = (color) => () => { const p = PART_OF('顏色感測器'); if (!p) return null; const i = ['red', 'yellow', 'green', 'blue', 'black', 'white'].indexOf(color); const g = p.querySelectorAll('svg g.grab')[i], z = p.querySelector('svg rect[stroke-dasharray]'); return g && z ? { from: center(g), to: center(z) } : null; };
  const distGuide = (cm) => () => { const p = PART_OF('距離感測器'); if (!p) return null; const svg = p.querySelector('svg'), o = svg.querySelector('g.grab'), m = svg.getScreenCTM(); if (!o || !m) return null; return { from: center(o), to: { x: m.a * (78 + cm * 0.95) + m.e, y: m.d * 90 + m.f } }; };
  const tiltGuide = (dx) => () => { const h = document.querySelector('.hub3d'); if (!h) return null; const c = center(h); return { from: c, to: { x: c.x + dx, y: c.y } }; };
  const pressGuide = () => { const p = PART_OF('力傳感器'), el = p && p.querySelector('.press'); return el ? { ring: el } : null; };

  const L = [];
  const lesson = (o) => { L.push(o); return o; };

  lesson({ id: 'light', title: '母體燈', glyph: '1', color: '#b896f8', icon: 'light', view: 'comp', parts: ['hub'], desc: '讓主機的小燈亮出笑臉。',
    allow: ['sp_start', 'sp_light_image'], steps: [
      INFO('主機正面有 25 顆小燈。這一課，我們讓它亮出一張笑臉！', '右邊「元件模擬」裡的就是你的主機。'),
      HAT('把「當程式開始」拖到中間的程式區。', 'sp_start', '它在左邊黃色的「事件」類別。'),
      AFTER('把「亮起」拖出來，接在「當程式開始」下面。', 'sp_light_image', 'sp_start', '它在紫色的「燈光」類別。放近一點，就會自己貼上去。'),
      SET('點一下「亮起」裡的小圖案，選一張笑臉。', 'sp_light_image', { field: 'IMG' }, (c) => ['3', '4'].includes(c.field('sp_light_image', 'IMG')), '選「開心」或「微笑」。'),
      RUN('按右下角綠色的 ▶ 執行鈕。', '程式會從「當程式開始」往下一塊一塊執行。'),
      INFO('看！主機的小燈亮出笑臉了。', '看看右邊的主機。'),
      SET('把圖案換成另一個，例如難過的臉。', 'sp_light_image', { field: 'IMG' }, (c) => !['3', '4'].includes(c.field('sp_light_image', 'IMG')), '點「亮起」裡的小圖案，選別的。'),
      RUN('再按一次 ▶，看新的圖案。'),
      END('你學會了「當程式開始」和「亮起」！'),
    ] });

  lesson({ id: 'motor', title: '馬達', glyph: '2', color: '#0090f5', icon: 'motor', view: 'comp', parts: ['motor:A'], desc: '讓馬達轉一圈，再讓它轉得更快。',
    allow: ['sp_start', 'sp_motor_speed_set', 'sp_motor_run'], steps: [
      INFO('馬達會轉，之後車子的輪子就靠它帶動。馬達接在 A 埠。', '右邊的轉盤就是馬達。'),
      HAT('把「當程式開始」拖到程式區。', 'sp_start', '在黃色的「事件」類別。'),
      AFTER('把「設定速度為」接在下面。', 'sp_motor_speed_set', 'sp_start', '在藍色的「馬達」類別。'),
      AFTER('再把「轉動」接在「設定速度為」下面。', 'sp_motor_run', 'sp_motor_speed_set', '「A 轉動 順時針 1 圈」：A 就是馬達接的埠。'),
      RUN('按 ▶ 執行，看馬達轉一圈。', null, (c) => { c.shared.deg0 = sim.mL.deg; }),
      TRY('馬達轉了一圈！看右邊的轉盤。', (c) => Math.abs(sim.mL.deg - c.shared.deg0) >= 340, null, '等馬達轉完。'),
      SET('把「設定速度為」的數字改大，例如 100。', 'sp_motor_speed_set', { input: 'P' }, (c) => c.num('sp_motor_speed_set', 'P') > 75, '數字越大，馬達轉得越快。'),
      RUN('再按一次 ▶，比比看是不是變快了。'),
      END('你學會了：數字越大，馬達轉得越快！'),
    ] });

  lesson({ id: 'color', title: '顏色感測器', glyph: '3', color: '#34ccf1', icon: 'sensor', view: 'comp', parts: ['color:C'], desc: '看到紅色就讓主機亮燈。',
    allow: ['sp_when_color', 'sp_light_image'], steps: [
      INFO('顏色感測器像眼睛，能認出面前東西的顏色。它接在 C 埠。', '右邊畫面下面的色塊，等一下會用到。'),
      HAT('把「當顏色是」拖到程式區。', 'sp_when_color', '在黃色的「事件」類別。看到某個顏色，才會執行下面的積木。'),
      SET('點「當顏色是」的顏色，選紅色。', 'sp_when_color', { field: 'COLOR' }, (c) => c.anyField('sp_when_color', 'COLOR', 'red'), '把顏色換成紅色。'),
      AFTER('把「亮起」接在下面。', 'sp_light_image', 'sp_when_color', '在紫色的「燈光」類別。'),
      RUN('按 ▶ 執行。程式會等著，看到紅色才亮燈。'),
      TRY('把紅色色塊拖到感測器下面的框裡，看主機亮起來。', (c) => c.running() && sim.color() === 'red' && c.lit() > 0, brickGuide('red'), '用滑鼠拖紅色色塊放進虛線框。', () => { sim.led.fill(0); }),
      SET('把顏色從紅色改成黃色。', 'sp_when_color', { field: 'COLOR' }, (c) => c.anyField('sp_when_color', 'COLOR', 'yellow'), '感測器就會改認黃色。'),
      RUN('再按一次 ▶ 執行。'),
      TRY('換黃色色塊放進框裡，看主機亮起來。', (c) => c.running() && sim.color() === 'yellow' && c.lit() > 0, brickGuide('yellow'), '紅色色塊現在不會讓主機亮了。', () => { sim.led.fill(0); }),
      END('你學會了：換積木上的顏色，感測器就認不同的顏色！'),
    ] });

  lesson({ id: 'dist', title: '距離感測器', glyph: '4', color: '#34ccf1', icon: 'sensor', view: 'comp', parts: ['dist:D'], desc: '東西靠近就讓主機嗶一聲。',
    allow: ['sp_when_dist', 'sp_beep'], steps: [
      INFO('距離感測器能量出前面的東西有多遠。它接在 D 埠。', '右邊灰色的物體可以左右拖動。'),
      HAT('把「當距離」拖到程式區。', 'sp_when_dist', '在黃色的「事件」類別。東西比數字更近，才會執行下面的積木。'),
      AFTER('把「播放嗶聲」接在下面。', 'sp_beep', 'sp_when_dist', '在紫色的「聲音」類別。'),
      RUN('按 ▶ 執行，程式會等東西靠近。'),
      TRY('把灰色物體往感測器拖近，聽主機嗶一聲。', (c, m) => c.beepsSince(m) > 0, distGuide(8), '要先從遠的地方慢慢靠近，才會觸發。', (c, m) => { m.beeps0 = beeps; }),
      SET('把「當距離」的數字改大，例如 20。', 'sp_when_dist', { input: 'N' }, (c) => c.num('sp_when_dist', 'N') > 8, '數字越大，離越遠就會嗶。'),
      RUN('再按一次 ▶ 執行。'),
      TRY('先把物體拿遠，再慢慢靠近，看看在更遠的地方是不是就嗶了。', (c, m) => c.beepsSince(m) > 0 && sim.distance() > 16, distGuide(30), '距離比 16 公分還遠就響，代表數字改大有用。', (c, m) => { m.beeps0 = beeps; }),
      END('你學會了：「當距離」的數字越大，越遠就會有反應！'),
    ] });

  lesson({ id: 'force', title: '力傳感器', glyph: '5', color: '#34ccf1', icon: 'sensor', view: 'comp', parts: ['motor:A', 'force:E'], desc: '按下去馬達轉，放開就停。',
    allow: ['sp_when_force', 'sp_motor_start', 'sp_motor_stop'], steps: [
      INFO('力傳感器就像按鈕。這一課：按下去馬達轉，放開就停。馬達接 A 埠，力傳感器接 E 埠。', '右邊有兩個零件。'),
      HAT('把「當力傳感器」拖到程式區。', 'sp_when_force', '在黃色的「事件」類別。預設是「被按下」。'),
      AFTER('把「開始轉動」接在下面。', 'sp_motor_start', 'sp_when_force', '在藍色的「馬達」類別。'),
      DRAG('再拖一個「當力傳感器」到旁邊，放在第一組的下面。', 'sp_when_force', { free: true }, (c) => c.blocks('sp_when_force').length >= 2, '這一組負責「放開」的時候。'),
      SET('把第二個「當力傳感器」改成「被放開」。', 'sp_when_force', { field: 'STATE', pick: (c) => c.blocks('sp_when_force')[1] }, (c) => c.anyField('sp_when_force', 'STATE', 'up'), '點它的選項，選「被放開」。'),
      DRAG('把「停止馬達」接在「被放開」的下面。', 'sp_motor_stop', { after: 'sp_when_force' }, (c) => c.blocks('sp_when_force').some((b) => b.getFieldValue('STATE') === 'up' && b.getNextBlock() && b.getNextBlock().type === 'sp_motor_stop'), '要接在第二組，不是第一組。'),
      RUN('按 ▶ 執行。'),
      TRY('用滑鼠按住力傳感器的黑色圓鈕，看馬達轉起來！', (c) => c.running() && sim.forceDeci() > 0 && sim.mL.dps !== 0, pressGuide, '按住不放。', () => { }),
      TRY('放開滑鼠，馬達就停了。', (c) => c.running() && sim.forceDeci() === 0 && sim.mL.dps === 0, pressGuide, '放開圓鈕。'),
      END('你學會了：用兩個「當」積木，分別管按下和放開！'),
    ] });

  lesson({ id: 'gyro', title: '陀螺儀', glyph: '6', color: '#34ccf1', icon: 'sensor', view: 'comp', parts: ['gyro'], desc: '主機歪向右邊時亮燈。',
    allow: ['sp_when_tilt', 'sp_light_image'], steps: [
      INFO('主機裡面有陀螺儀，不用接線，能感覺到主機有沒有歪。', '右邊的主機可以用滑鼠拖著歪。'),
      HAT('把「當主機傾斜」拖到程式區。', 'sp_when_tilt', '在黃色的「事件」類別。'),
      SET('把方向改成「向右」。', 'sp_when_tilt', { field: 'DIR' }, (c) => c.anyField('sp_when_tilt', 'DIR', 'right'), '點方向，選「向右」。'),
      AFTER('把「亮起」接在下面。', 'sp_light_image', 'sp_when_tilt', '在紫色的「燈光」類別。'),
      RUN('按 ▶ 執行。'),
      TRY('用滑鼠拖著主機往右邊歪，看主機亮燈。', (c) => c.running() && api.tiltIs('right') && c.lit() > 0, tiltGuide(70), '放開滑鼠，主機會自己放平。', () => { sim.led.fill(0); }),
      SET('把方向改成「向左」。', 'sp_when_tilt', { field: 'DIR' }, (c) => c.anyField('sp_when_tilt', 'DIR', 'left'), '點方向，選「向左」。'),
      RUN('再按一次 ▶ 執行。'),
      TRY('這次往左邊歪，看主機亮燈。', (c) => c.running() && api.tiltIs('left') && c.lit() > 0, tiltGuide(-70), '往右歪現在不會亮了。', () => { sim.led.fill(0); }),
      END('你學會了：改積木上的方向，就能偵測不同方向的傾斜！'),
    ] });

  lesson({ id: 'square', title: '走正方形', glyph: '★', color: '#4c97ff', icon: 'move', view: 'field', scene: 'blank', desc: '讓車子走一個正方形：往前、轉彎，重複 4 次。',
    allow: ['sp_start', 'controls_repeat_ext', 'sp_move', 'sp_turn'], steps: [
      INFO('正方形有 4 個邊、4 個角。車子走一邊、轉一個彎，重複 4 次就走完了。', '看右邊的場地，車子在中間。'),
      HAT('把「當程式開始」拖到程式區。', 'sp_start', '在黃色的「事件」類別。'),
      AFTER('把「重複」接在下面。', 'controls_repeat_ext', 'sp_start', '在橘色的「控制」類別。'),
      SET('把「重複」的次數改成 4。', 'controls_repeat_ext', { input: 'TIMES' }, (c) => c.num('controls_repeat_ext', 'TIMES') === 4, '4 個邊，就重複 4 次。'),
      DRAG('把「移動」拖進「重複」的裡面。', 'sp_move', { into: { type: 'controls_repeat_ext', input: 'DO' } }, (c) => c.inside('controls_repeat_ext', 'DO', 'sp_move'), '在粉紅色的「移動」類別。要放進 C 字形的裡面。'),
      SET('把移動的距離改成 40 公分。', 'sp_move', { input: 'N' }, (c) => c.num('sp_move', 'N') === 40, '正方形每一邊 40 公分。'),
      DRAG('把「轉向」接在「移動」下面，一樣在「重複」裡面。', 'sp_turn', { after: 'sp_move' }, (c) => c.chain('sp_move', 'sp_turn'), '預設是向右轉 90 度，剛好是正方形的角。'),
      RUN('按 ▶ 執行，看車子走正方形。', null, (c) => { c.shared.runs0 = runClicks; }),
      TRY('車子走完一圈，回到起點了！', (c) => runClicks > c.shared.runs0 && !c.running() && Math.hypot(sim.x - sim.start.x, sim.y - sim.start.y) < 15, null, '等車子走完。'),
      END('你學會了：用「重複」讓同樣的動作做很多次！'),
    ] });

  lesson({ id: 'red', title: '看到黃色就停', glyph: '★', color: '#ff8c1a', icon: 'sensor', view: 'field', scene: 'colors', desc: '車子往前走，看到黃色就停下來嗶一聲。',
    allow: ['sp_start', 'sp_start_move', 'sp_wait_until', 'sp_color_is', 'sp_stop', 'sp_beep'], steps: [
      INFO('車子要一直往前，直到顏色感測器看到黃色才停。', '場地上有一條一條不同顏色的色紙，最前面是紅色，再來才是黃色。'),
      HAT('把「當程式開始」拖到程式區。', 'sp_start', '在黃色的「事件」類別。'),
      AFTER('把「開始移動」接在下面。', 'sp_start_move', 'sp_start', '在粉紅色的「移動」類別。它會讓車子一直往前，不會自己停。'),
      AFTER('把「等待直到」接在下面。', 'sp_wait_until', 'sp_start_move', '在橘色的「控制」類別。程式會停在這裡，等後面的條件成立。'),
      DRAG('把「顏色是」拖進「等待直到」的六角形空格。', 'sp_color_is', { input: { type: 'sp_wait_until', input: 'C' } }, (c) => c.inside('sp_wait_until', 'C', 'sp_color_is'), '在藍色的「感測」類別。'),
      SET('把顏色改成黃色。', 'sp_color_is', { field: 'COLOR' }, (c) => c.anyField('sp_color_is', 'COLOR', 'yellow'), '點顏色，選黃色。車子會先開過紅色，不會停。'),
      AFTER('把「停止移動」接在「等待直到」下面。', 'sp_stop', 'sp_wait_until', '在粉紅色的「移動」類別。'),
      AFTER('最後接上「播放嗶聲」。', 'sp_beep', 'sp_stop', '在紫色的「聲音」類別。'),
      RUN('按 ▶ 執行，看車子開過紅色、在黃色停下來。'),
      END('你學會了：用「等待直到」讓程式等一個條件！'),
    ] });

  lesson({ id: 'wall', title: '遇牆就轉彎', glyph: '★', color: '#5cb1d6', icon: 'sensor', view: 'field', scene: 'boxes', desc: '一直往前，距離太近就轉彎。',
    allow: ['sp_start', 'sp_forever', 'controls_if', 'sp_dist_is', 'sp_turn', 'sp_move'], steps: [
      INFO('車子要自己避開障礙物：前面太近就轉彎，不然就往前走。', '場地上放了幾個方塊。'),
      HAT('把「當程式開始」拖到程式區。', 'sp_start', '在黃色的「事件」類別。'),
      AFTER('把「一直重複」接在下面。', 'sp_forever', 'sp_start', '在橘色的「控制」類別。'),
      DRAG('把「如果…那麼…不然」拖進「一直重複」裡面。', 'controls_if', { into: { type: 'sp_forever', input: 'DO' } }, (c) => c.blocks('sp_forever').some((b) => { const t = b.getInputTargetBlock('DO'); return t && t.type === 'controls_if' && !!t.getInput('ELSE'); }), '要選有「不然」的那一塊（有兩段的）。', { pickFlyout: (b) => !!b.getInput('ELSE') }),
      DRAG('把「距離」拖進「如果」後面的六角形空格。', 'sp_dist_is', { input: { type: 'controls_if', input: 'IF0' } }, (c) => c.inside('controls_if', 'IF0', 'sp_dist_is'), '在藍色的「感測」類別。預設是「更近於 15 公分」。'),
      DRAG('把「轉向」拖進「那麼」裡面。', 'sp_turn', { into: { type: 'controls_if', input: 'DO0' } }, (c) => c.inside('controls_if', 'DO0', 'sp_turn'), '在粉紅色的「移動」類別。太近的時候就轉彎。'),
      DRAG('把「移動」拖進「不然」裡面。', 'sp_move', { into: { type: 'controls_if', input: 'ELSE' } }, (c) => c.inside('controls_if', 'ELSE', 'sp_move'), '不近的時候就往前走。'),
      SET('把移動的距離改成 5 公分。', 'sp_move', { input: 'N' }, (c) => c.num('sp_move', 'N') === 5, '一次走一小步，才能一直檢查前面有沒有東西。'),
      RUN('按 ▶ 執行，看車子避開方塊。'),
      END('你學會了：用「如果…不然」讓車子自己做決定！'),
    ] });

  lesson({ id: 'line', title: '黑線循線', glyph: '★', color: '#59c059', icon: 'sensor', view: 'field', scene: 'line', desc: '看到黑色就往右修正，不然往左，沿著跑道走。',
    allow: ['sp_start', 'sp_forever', 'controls_if', 'sp_color_is', 'sp_steer'], steps: [
      INFO('車子靠顏色感測器沿著黑線走：看到黑色就往一邊修正，看到白色就往另一邊修正。', '場地是一條黑色的跑道。'),
      HAT('把「當程式開始」拖到程式區。', 'sp_start', '在黃色的「事件」類別。'),
      AFTER('把「一直重複」接在下面。', 'sp_forever', 'sp_start', '在橘色的「控制」類別。'),
      DRAG('把「如果…那麼…不然」拖進「一直重複」裡面。', 'controls_if', { into: { type: 'sp_forever', input: 'DO' } }, (c) => c.blocks('sp_forever').some((b) => { const t = b.getInputTargetBlock('DO'); return t && t.type === 'controls_if' && !!t.getInput('ELSE'); }), '要選有「不然」的那一塊。', { pickFlyout: (b) => !!b.getInput('ELSE') }),
      DRAG('把「是顏色」拖進「如果」後面的空格。', 'sp_color_is', { input: { type: 'controls_if', input: 'IF0' } }, (c) => c.inside('controls_if', 'IF0', 'sp_color_is'), '在藍色的「感測」類別。'),
      SET('把顏色改成黑色。', 'sp_color_is', { field: 'COLOR' }, (c) => c.anyField('sp_color_is', 'COLOR', 'black'), '點顏色，選黑色。'),
      DRAG('把「轉向移動」拖進「那麼」裡面。', 'sp_steer', { into: { type: 'controls_if', input: 'DO0' } }, (c) => c.inside('controls_if', 'DO0', 'sp_steer'), '在粉紅色的「移動」類別。'),
      DRAG('再拖一個「轉向移動」進「不然」裡面。', 'sp_steer', { into: { type: 'controls_if', input: 'ELSE' } }, (c) => c.inside('controls_if', 'ELSE', 'sp_steer'), '兩邊要往不同方向修正。'),
      SET('把「不然」裡的轉向數字改成 −35。', 'sp_steer', { input: 'STEER', pick: (c) => c.blocks('sp_steer')[1] }, (c) => c.num('sp_steer', 'STEER', 1) < 0, '正數往右、負數往左。'),
      RUN('按 ▶ 執行，看車子沿著黑線走。'),
      END('你學會了：用感測器讓車子一直修正方向！'),
    ] });

  /* ---------- 工具箱：只留這一課需要的積木 ---------- */
  const CAT_OF = {};
  for (const c of SP.toolbox.contents) if (c.kind === 'category' && c.contents) for (const b of c.contents) CAT_OF[b.type] = c.name;
  function applyToolbox(allow) {
    const set = new Set(allow), cats = [];
    for (const c of SP.toolbox.contents) { if (c.kind !== 'category' || !c.contents) continue; const items = c.contents.filter((b) => set.has(b.type)); if (items.length) cats.push({ ...c, contents: items }); }
    ws.updateToolbox({ kind: 'categoryToolbox', contents: cats });
    const tb = ws.getToolbox(); if (tb && tb.showAll) { tb.showAll(false); const first = tb._categories()[0]; if (first) tb.setSelectedItem(first); }
  }
  function restoreToolbox() { ws.updateToolbox(SP.toolbox); const tb = ws.getToolbox(); if (tb && tb.showAll) tb.showAll(false); }

  /* ---------- 任務卡片與流程 ---------- */
  let cur = null, steps = [], idx = 0, active = false, celebrating = false, mem = { runs0: 0, beeps0: 0, hit: false }, doneSet = new Set(), settleT = 0;
  const card = $('lesson-card');
  function render() {
    const st = steps[idx], n = steps.length, last = st.kind === 'end';
    $('lc-ic').className = 'lc-ic cat-icon cat-' + (cur.icon || 'sensor');
    $('lc-title').textContent = cur.title;
    $('lc-n').textContent = String(idx + 1).padStart(2, '0'); $('lc-t').textContent = '/' + String(n).padStart(2, '0');
    $('lc-say').textContent = st.say; $('lc-hint').textContent = st.hint || ''; $('lc-hint').hidden = !st.hint;
    $('lc-ok').hidden = true; $('lc-end').hidden = !last;
    $('lc-prev').disabled = idx === 0; $('lc-next').disabled = last;
    $('lc-next').classList.toggle('go', st.kind === 'info');
    $('lc-dots').innerHTML = steps.map((s, i) => `<i class="${i === idx ? 'cur' : doneSet.has(i) ? 'done' : ''}"></i>`).join('');
  }
  function show(i) {
    idx = Math.max(0, Math.min(steps.length - 1, i)); const st = steps[idx];
    celebrating = false; mem = { runs0: runClicks, beeps0: beeps, hit: false }; lastScrollAt = 0; guideKey = '';
    if (st.kind === 'run' && U.isRunning()) $('btn-stop').click();
    if (st.enter) st.enter(ctx, mem);
    render(); layout();
    clearTimeout(settleT);
    if ((st.kind === 'drag' || st.kind === 'set') && st.done(ctx)) settleT = setTimeout(() => { if (active && steps[idx] === st && !celebrating) complete(); }, 800);   // 已經做好了就直接過
  }
  function complete() {
    if (celebrating) return; celebrating = true; doneSet.add(idx);
    $('lc-ok').hidden = false; $('lc-dots').innerHTML = steps.map((s, i) => `<i class="${i === idx ? 'cur' : doneSet.has(i) ? 'done' : ''}"></i>`).join('');
    const my = idx; setTimeout(() => { if (active && idx === my) show(idx + 1); }, 900);
  }
  function check() {
    if (!active || celebrating) return; const st = steps[idx]; if (!st || st.kind === 'info' || st.kind === 'end') return;
    let ok = false;
    if (st.kind === 'run') ok = runClicks > mem.runs0;
    else if (st.kind === 'try') { if (st.watch(ctx, mem)) mem.hit = true; ok = mem.hit; }
    else ok = !!st.done(ctx);
    if (ok) complete();
  }

  /* ---------- 引導：橘色框、虛線積木、手勢拖曳動畫 ---------- */
  const gEl = $('lguide'), ghost = gEl.querySelector('.g-ghost'), ring = gEl.querySelector('.g-ring'), hand = gEl.querySelector('.g-hand');
  let guideKey = '', anim = null, dragging = false, lastScrollAt = 0, glowEl = null, pulseEl = null, lastSpec = null;
  ws.addChangeListener((e) => { if (e.type === Blockly.Events.BLOCK_DRAG) dragging = !!e.isStart; });
  const toScreen = (x, y) => { const m = ws.getCanvas().getScreenCTM(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; };
  const connPoint = (conn) => { const b = conn.getSourceBlock(), xy = b.getRelativeToSurfaceXY(), off = conn.getOffsetInBlock ? conn.getOffsetInBlock() : { x: conn.x - xy.x, y: conn.y - xy.y }; return toScreen(xy.x + off.x, xy.y + off.y); };
  const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const openOne = (type) => { const l = ctx.blocks(type); return l.find((b) => !b.getNextBlock()) || l[0]; };
  function flyoutBlock(type, pick) { const tb = ws.getToolbox(), fws = tb.getFlyout().getWorkspace(), list = fws.getTopBlocks(false).filter((b) => b.type === type); return (pick && list.find(pick)) || list[0]; }
  function visibleIn(r, host) { const h = host.getBoundingClientRect(); return r.y >= h.top - 2 && r.y + r.h <= h.bottom + 2 && r.x >= h.left - 2 && r.x + r.w <= h.right + 2; }
  function setGlow(el) { if (glowEl && glowEl !== el) glowEl.classList.remove('lesson-glow'); glowEl = el; if (el) el.classList.add('lesson-glow'); }
  function setPulse(el) { if (pulseEl && pulseEl !== el) pulseEl.classList.remove('lesson-pulse'); pulseEl = el; if (el) el.classList.add('lesson-pulse'); }

  function dragSpec(st) {
    const tb = ws.getToolbox(), fb = flyoutBlock(st.type, st.pickFlyout); if (!fb) return null;
    const src = rectOf(fb.getSvgRoot()), fly = tb.getFlyout().getWorkspace().getParentSvg();
    const cat = tb._categories().find((c) => c.getName() === CAT_OF[st.type]); setPulse(cat && cat.getDiv ? cat.getDiv() : null);
    setGlow(fb.getSvgRoot());
    const inView = visibleIn(src, fly);
    if (!inView && Date.now() - lastScrollAt > 2500 && cat) { lastScrollAt = Date.now(); tb.scrollToCategory(cat); }
    let p;
    const pl = st.place || {};
    if (pl.after) { const par = typeof pl.after === 'function' ? pl.after(ctx) : openOne(pl.after); if (par && par.nextConnection) p = connPoint(par.nextConnection); }
    else if (pl.into || pl.input) { const q = pl.into || pl.input, par = ctx.blocks(q.type).find((b) => !b.getInputTargetBlock(q.input)) || ctx.blocks(q.type)[0]; const inp = par && par.getInput(q.input); if (inp && inp.connection) p = connPoint(inp.connection); }
    if (!p) { const tops = ws.getTopBlocks(false); let y = 60; for (const b of tops) y = Math.max(y, b.getRelativeToSurfaceXY().y + b.getHeightWidth().height + 36); p = toScreen(70, tops.length ? y : 60); }
    const hostR = ws.getParentSvg().getBoundingClientRect();
    p.x = Math.max(hostR.left + 10, Math.min(hostR.right - src.w - 10, p.x)); p.y = Math.max(hostR.top + 10, Math.min(hostR.bottom - src.h - 10, p.y));
    const gx = 22, gy = Math.min(src.h * 0.6, 26);
    return { from: inView ? { x: src.x + gx, y: src.y + gy } : null, to: { x: p.x + gx, y: p.y + gy }, ghost: { x: p.x, y: p.y, w: src.w, h: src.h } };
  }
  function ringSpec(st) {
    setGlow(null); setPulse(null);
    if (st.kind === 'run') { const b = $('btn-run').hidden ? $('btn-stop') : $('btn-run'); return { ring: rectOf(b) }; }
    if (st.kind === 'set') {
      const b = st.pick ? st.pick(ctx) : ctx.blocks(st.block)[0]; if (!b) return null;
      let el; if (st.field) { const f = b.getField(st.field); el = f && f.getSvgRoot(); } else { const t = b.getInputTargetBlock(st.input); el = t && t.getSvgRoot(); }
      if (!el) return null; const r = rectOf(el), host = ws.getParentSvg().getBoundingClientRect();
      if (r.x < host.left || r.x + r.w > host.right + 2 || r.y < host.top || r.y + r.h > host.bottom + 2) return null;
      return { ring: r };
    }
    if (st.kind === 'try' && st.guide) {
      const g = st.guide(ctx); if (!g) return null;
      if (g.ring) return { ring: rectOf(g.ring) };
      return { from: g.from, to: g.to };
    }
    return null;
  }
  function layout() {
    const st = steps[idx];
    if (!active || !st || !$('home').hidden || dragging || celebrating) { gEl.hidden = true; if (anim) { anim.cancel(); anim = null; } guideKey = ''; return; }
    let spec = null; try { spec = st.kind === 'drag' ? dragSpec(st) : (st.kind === 'info' || st.kind === 'end') ? (setGlow(null), setPulse(null), null) : ringSpec(st); } catch (e) { spec = null; }
    lastSpec = spec; gEl.hidden = !spec; if (!spec) { if (anim) { anim.cancel(); anim = null; } guideKey = ''; return; }
    const R = (v) => Math.round(v);
    const key = JSON.stringify([spec.from && [R(spec.from.x), R(spec.from.y)], spec.to && [R(spec.to.x), R(spec.to.y)], spec.ghost && [R(spec.ghost.x), R(spec.ghost.y)], spec.ring && [R(spec.ring.x), R(spec.ring.y), R(spec.ring.w)]]);
    if (key === guideKey) return; guideKey = key;
    if (spec.ghost) { Object.assign(ghost.style, { left: spec.ghost.x + 'px', top: spec.ghost.y + 'px', width: spec.ghost.w + 'px', height: spec.ghost.h + 'px', opacity: 0.95 }); } else ghost.style.opacity = 0;
    if (spec.ring) { Object.assign(ring.style, { left: spec.ring.x - 6 + 'px', top: spec.ring.y - 6 + 'px', width: spec.ring.w + 12 + 'px', height: spec.ring.h + 12 + 'px', opacity: 1 }); } else ring.style.opacity = 0;
    if (anim) { anim.cancel(); anim = null; }
    if (spec.from && spec.to) {
      const at = (p) => `translate(${p.x - 21}px, ${p.y - 3}px)`;
      anim = hand.animate([{ transform: at(spec.from), opacity: 0 }, { transform: at(spec.from), opacity: 1, offset: 0.1 }, { transform: at(spec.from), opacity: 1, offset: 0.25 }, { transform: at(spec.to), opacity: 1, offset: 0.65 }, { transform: at(spec.to), opacity: 1, offset: 0.88 }, { transform: at(spec.to), opacity: 0 }], { duration: 3000, iterations: Infinity, easing: 'ease-in-out' });
    } else hand.style.opacity = 0;
  }

  /* ---------- 開始／結束 ---------- */
  function start(id) {
    const l = L.find((x) => x.id === id); if (!l) return;
    SP.lesson.starting = true;
    try { U.restore({ workspace: { blocks: { languageVersion: 0, blocks: [] } }, name: l.title, scene: l.scene || 'blank' }); } finally { SP.lesson.starting = false; }
    cur = l; steps = l.steps; doneSet = new Set(); active = true; SP.compForce = l.parts || [];
    document.body.classList.add('has-lesson'); card.hidden = false;
    $('home').hidden = true; applyToolbox(l.allow); SP.showView(l.view || 'field'); Blockly.svgResize(ws);
    if (U.mode() !== 'blocks') U.setMode('blocks');
    show(0);
  }
  function exit() {
    if (!active) return; active = false; clearTimeout(settleT); SP.compForce = [];
    card.hidden = true; document.body.classList.remove('has-lesson'); gEl.hidden = true; if (anim) { anim.cancel(); anim = null; }
    setGlow(null); setPulse(null); restoreToolbox();
  }
  $('lc-exit').onclick = exit;
  $('lc-prev').onclick = () => { if (active) show(idx - 1); };
  $('lc-next').onclick = () => { if (active) show(idx + 1); };
  $('lc-home').onclick = () => { exit(); $('btn-home').click(); };
  $('lc-again').onclick = () => { if (cur) start(cur.id); };
  setInterval(check, 150); setInterval(layout, 300);
  window.addEventListener('resize', () => { guideKey = ''; });

  SP.lessons = L.map((l) => ({ id: l.id, title: l.title, desc: l.desc, color: l.color, glyph: l.glyph }));
  SP.lesson = { start, exit, active: () => active, starting: false, steps: () => steps, index: () => idx, debug: () => ({ idx, kind: steps[idx] && steps[idx].kind, total: steps.length, spec: lastSpec, done: [...doneSet] }), go: (i) => show(i) };
  U.rebuildHome();
})(window.SP = window.SP || {});
