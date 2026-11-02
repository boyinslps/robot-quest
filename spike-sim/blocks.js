/* SPIKE 風格積木：定義、程式產生器、工具箱、佈景（Scratch 風格的圓角積木 + 類別配色） */
(function (SP) {
  'use strict';
  const G = javascript.javascriptGenerator, O = javascript.Order;

  /* ---------- 配色（對照 SPIKE App 的類別顏色） ---------- */
  const COL = {
    motion: ['#4C97FF', '#4280D7', '#3373CC'],
    light: ['#9966FF', '#855CD6', '#774DCB'],
    sound: ['#CF63CF', '#C94FC9', '#BD42BD'],
    event: ['#FFBF00', '#E6AC00', '#CC9900'],
    control: ['#FFAB19', '#EC9C13', '#CF8B17'],
    sensor: ['#5CB1D6', '#47A8D1', '#2E8EB8'],
    operator: ['#59C059', '#46B946', '#389438'],
    variable: ['#FF8C1A', '#FF8000', '#DB6E00'],
  };
  const style = (c) => ({ colourPrimary: c[0], colourSecondary: c[1], colourTertiary: c[2] });
  SP.theme = Blockly.Theme.defineTheme('spike', {
    base: Blockly.Themes.Zelos,
    blockStyles: {
      motion_blocks: style(COL.motion), light_blocks: style(COL.light), sound_blocks: style(COL.sound),
      event_blocks: style(COL.event), control_blocks: style(COL.control), sensor_blocks: style(COL.sensor),
      operator_blocks: style(COL.operator), variable_blocks: style(COL.variable),
      loop_blocks: style(COL.control), logic_blocks: style(COL.operator), math_blocks: style(COL.operator),
      text_blocks: style(COL.operator), variable_dynamic_blocks: style(COL.variable),
    },
    categoryStyles: {
      motion_category: { colour: COL.motion[0] }, light_category: { colour: COL.light[0] },
      sound_category: { colour: COL.sound[0] }, event_category: { colour: COL.event[0] },
      control_category: { colour: COL.control[0] }, sensor_category: { colour: COL.sensor[0] },
      operator_category: { colour: COL.operator[0] }, variable_category: { colour: COL.variable[0] },
    },
    componentStyles: {
      workspaceBackgroundColour: '#f9f9f9', toolboxBackgroundColour: '#ffffff', flyoutBackgroundColour: '#f1f3f7',
      flyoutOpacity: 1, scrollbarColour: '#c5cad3', insertionMarkerColour: '#000', insertionMarkerOpacity: 0.2,
    },
    fontStyle: { family: '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif', weight: 'bold', size: 11 },
    startHats: true,
  });

  /* ---------- 積木定義 ---------- */
  const dd = (name, opts) => ({ type: 'field_dropdown', name, options: opts });
  const num = (name) => ({ type: 'input_value', name, check: 'Number' });
  const stmt = { previousStatement: null, nextStatement: null };
  const PORTS = (first) => ['C', 'D', 'E', 'F'].sort((a, b) => (a === first ? -1 : b === first ? 1 : 0)).map((p) => [p, p]);
  const MPORT = [['A（左輪）', 'A'], ['B（右輪）', 'B']];
  const COLORS = [['黑色', 'black'], ['白色', 'white'], ['紅色', 'red'], ['黃色', 'yellow'], ['綠色', 'green'], ['藍色', 'blue']];

  Blockly.defineBlocksWithJsonArray([
    // 事件
    { type: 'sp_start', message0: '當程式開始', nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_color', message0: '當 %1 看到 %2', args0: [dd('PORT', PORTS('C')), dd('COLOR', COLORS)], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_force', message0: '當 %1 被 %2', args0: [dd('PORT', PORTS('E')), dd('STATE', [['按下', 'down'], ['放開', 'up']])], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_dist', message0: '當 %1 距離 %2 %3 公分', args0: [dd('PORT', PORTS('D')), dd('OP', [['小於', '<'], ['大於', '>']]), num('N')], nextStatement: null, style: 'event_blocks' },
    // 動作
    { type: 'sp_move', message0: '移動 %1 %2 %3', args0: [dd('DIR', [['前進', '1'], ['後退', '-1']]), num('N'), dd('UNIT', [['公分', 'cm'], ['圈', 'rot'], ['秒', 'sec']])], ...stmt, style: 'motion_blocks' },
    { type: 'sp_turn', message0: '向 %1 轉 %2 度', args0: [dd('DIR', [['右', '1'], ['左', '-1']]), num('DEG')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_start_move', message0: '開始 %1 移動', args0: [dd('DIR', [['前進', '1'], ['後退', '-1']])], ...stmt, style: 'motion_blocks' },
    { type: 'sp_steer', message0: '以轉向 %1 開始移動', args0: [num('STEER')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_stop', message0: '停止移動', ...stmt, style: 'motion_blocks' },
    { type: 'sp_set_speed', message0: '設定移動速度為 %1 %%', args0: [num('P')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_turn', message0: '馬達 %1 轉 %2 度', args0: [dd('PORT', MPORT), num('DEG')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_start', message0: '馬達 %1 以 %2 %% 速度開始轉動', args0: [dd('PORT', [['A（左輪）', 'A'], ['B（右輪）', 'B'], ['A + B', 'AB']]), num('P')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_stop', message0: '停止馬達 %1', args0: [dd('PORT', [['A（左輪）', 'A'], ['B（右輪）', 'B'], ['A + B', 'AB']])], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_pos', message0: '馬達 %1 的角度', args0: [dd('PORT', MPORT)], output: 'Number', style: 'motion_blocks' },
    // 燈光
    { type: 'sp_light_pattern', message0: '主機亮起 %1 圖案', args0: [dd('PAT', [['愛心', 'heart'], ['笑臉', 'smile'], ['難過', 'sad'], ['向上箭頭', 'up'], ['打勾', 'check'], ['打叉', 'cross']])], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_text', message0: '主機寫入 %1', args0: [{ type: 'input_value', name: 'T' }], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_pixel', message0: '設定燈 x %1 y %2 亮度為 %3 %%', args0: [num('X'), num('Y'), num('B')], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_off', message0: '關閉所有燈', ...stmt, style: 'light_blocks' },
    { type: 'sp_say', message0: '印出 %1 到訊息欄', args0: [{ type: 'input_value', name: 'T' }], ...stmt, style: 'light_blocks' },
    // 聲音
    { type: 'sp_beep', message0: '播放嗶聲 音符 %1 持續 %2 秒', args0: [num('NOTE'), num('S')], ...stmt, style: 'sound_blocks' },
    // 控制
    { type: 'sp_wait', message0: '等待 %1 秒', args0: [num('S')], ...stmt, style: 'control_blocks' },
    { type: 'sp_wait_until', message0: '等待直到 %1', args0: [{ type: 'input_value', name: 'C', check: 'Boolean' }], ...stmt, style: 'control_blocks' },
    { type: 'sp_forever', message0: '一直重複 %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, style: 'control_blocks' },
    { type: 'sp_repeat_until', message0: '重複直到 %1 %2', args0: [{ type: 'input_value', name: 'C', check: 'Boolean' }, { type: 'input_statement', name: 'DO' }], ...stmt, style: 'control_blocks' },
    // 感測
    { type: 'sp_color_is', message0: '%1 看到 %2 ?', args0: [dd('PORT', PORTS('C')), dd('COLOR', COLORS)], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_light', message0: '%1 的反射光 (%%)', args0: [dd('PORT', PORTS('C'))], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_dist', message0: '%1 的距離 (公分)', args0: [dd('PORT', PORTS('D'))], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_dist_less', message0: '%1 距離 %2 %3 公分 ?', args0: [dd('PORT', PORTS('D')), dd('OP', [['小於', '<'], ['大於', '>']]), num('N')], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_force', message0: '%1 被按下 ?', args0: [dd('PORT', PORTS('E'))], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_yaw', message0: '轉向角度', output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_reset_yaw', message0: '將轉向角度重設為 0', ...stmt, style: 'sensor_blocks' },
    { type: 'sp_timer', message0: '計時器（秒）', output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_reset_timer', message0: '重設計時器', ...stmt, style: 'sensor_blocks' },
  ]);

  // 內建「如果」積木也歸入控制（橘色）
  const origIf = Blockly.Blocks.controls_if.init;
  Blockly.Blocks.controls_if.init = function () { origIf.call(this); this.setStyle('control_blocks'); };

  /* ---------- 程式產生器 ---------- */
  G.STATEMENT_PREFIX = 'api.hl(%1);\n';
  G.INFINITE_LOOP_TRAP = 'await api.tick();\n';
  const v = (b, n, d = '0') => G.valueToCode(b, n, O.NONE) || d;
  const f = (b, n) => b.getFieldValue(n);
  const q = (s) => JSON.stringify(String(s));
  const S = G.forBlock;

  for (const t of ['sp_start', 'sp_when_color', 'sp_when_force', 'sp_when_dist']) S[t] = () => '';
  S.sp_move = (b) => `await api.move(${f(b, 'DIR')}, ${v(b, 'N')}, ${q(f(b, 'UNIT'))});\n`;
  S.sp_turn = (b) => `await api.turn(${f(b, 'DIR')}, ${v(b, 'DEG')});\n`;
  S.sp_start_move = (b) => `api.startMove(${f(b, 'DIR')}, 0);\n`;
  S.sp_steer = (b) => `api.startMove(1, ${v(b, 'STEER')});\n`;
  S.sp_stop = () => 'api.stop();\n';
  S.sp_set_speed = (b) => `api.setSpeed(${v(b, 'P')});\n`;
  S.sp_motor_turn = (b) => `await api.motorTurn(${q(f(b, 'PORT'))}, ${v(b, 'DEG')});\n`;
  S.sp_motor_start = (b) => `api.motorStart(${q(f(b, 'PORT'))}, ${v(b, 'P')});\n`;
  S.sp_motor_stop = (b) => `api.motorStop(${q(f(b, 'PORT'))});\n`;
  S.sp_motor_pos = (b) => [`api.motorPos(${q(f(b, 'PORT'))})`, O.FUNCTION_CALL];
  S.sp_light_pattern = (b) => `api.lightPattern(${q(f(b, 'PAT'))});\n`;
  S.sp_light_text = (b) => `api.lightText(${v(b, 'T', "''")});\n`;
  S.sp_light_pixel = (b) => `api.lightPixel(${v(b, 'X')}, ${v(b, 'Y')}, ${v(b, 'B')});\n`;
  S.sp_light_off = () => 'api.lightOff();\n';
  S.sp_say = (b) => `api.say(${v(b, 'T', "''")});\n`;
  S.sp_beep = (b) => `await api.beep(${v(b, 'NOTE')}, ${v(b, 'S')});\n`;
  S.sp_wait = (b) => `await api.wait(${v(b, 'S')});\n`;
  S.sp_wait_until = (b) => `await api.waitUntil(() => (${v(b, 'C', 'false')}));\n`;
  S.sp_forever = (b) => `while (true) {\n${G.addLoopTrap(G.statementToCode(b, 'DO'), b)}}\n`;
  S.sp_repeat_until = (b) => `while (!(${v(b, 'C', 'false')})) {\n${G.addLoopTrap(G.statementToCode(b, 'DO'), b)}}\n`;
  S.sp_color_is = (b) => [`api.colorIs(${q(f(b, 'PORT'))}, ${q(f(b, 'COLOR'))})`, O.FUNCTION_CALL];
  S.sp_light = (b) => [`api.light(${q(f(b, 'PORT'))})`, O.FUNCTION_CALL];
  S.sp_dist = (b) => [`api.dist(${q(f(b, 'PORT'))})`, O.FUNCTION_CALL];
  S.sp_dist_less = (b) => [`api.distLess(${q(f(b, 'PORT'))}, ${q(f(b, 'OP'))}, ${v(b, 'N')})`, O.FUNCTION_CALL];
  S.sp_force = (b) => [`api.pressed(${q(f(b, 'PORT'))})`, O.FUNCTION_CALL];
  S.sp_yaw = () => ['api.yaw()', O.FUNCTION_CALL];
  S.sp_reset_yaw = () => 'api.resetYaw();\n';
  S.sp_timer = () => ['api.timer()', O.FUNCTION_CALL];
  S.sp_reset_timer = () => 'api.resetTimer();\n';

  // 每個「事件積木」是一條獨立執行緒；所有執行緒同時跑（和 SPIKE 相同）
  SP.generate = function (ws) {
    G.init(ws);
    const hats = ws.getTopBlocks(true).filter((b) => b.type.startsWith('sp_start') || b.type.startsWith('sp_when_'));
    let code = '', names = [];
    hats.forEach((h, i) => {
      const first = h.getNextBlock();
      let body = first ? G.blockToCode(first) : '';
      if (Array.isArray(body)) body = body[0];
      const P = q(h.getFieldValue('PORT')), C = q(h.getFieldValue('COLOR'));
      if (h.type === 'sp_when_color' || h.type === 'sp_when_force' || h.type === 'sp_when_dist') {
        const cond = h.type === 'sp_when_color' ? `api.colorIs(${P}, ${C})`
          : h.type === 'sp_when_force' ? `(api.pressed(${P}) === ${h.getFieldValue('STATE') === 'down'})`
            : `api.distLess(${P}, ${q(h.getFieldValue('OP'))}, ${v(h, 'N')})`;
        body = `while (true) {\nawait api.waitUntil(() => ${cond});\n${body}await api.waitUntil(() => !${cond});\n}\n`;
      }
      code += `async function thread_${i}() {\n${body}}\n`;
      names.push(`thread_${i}()`);
    });
    code += `await Promise.all([${names.join(', ')}]);\n`;
    return { code: G.finish(code), threads: hats.length };
  };

  /* ---------- 工具箱 ---------- */
  const n = (x) => ({ shadow: { type: 'math_number', fields: { NUM: x } } });
  const blk = (type, inputs, fields) => ({ kind: 'block', type, ...(inputs ? { inputs } : {}), ...(fields ? { fields } : {}) });
  const cat = (name, cls, style, contents) => ({ kind: 'category', name, categorystyle: style, cssConfig: { container: 'tc-' + cls, icon: 'cat-icon cat-' + cls }, contents });
  SP.toolbox = {
    kind: 'categoryToolbox',
    contents: [
      cat('動作', 'motion', 'motion_category', [
        blk('sp_move', { N: n(10) }, { DIR: '1', UNIT: 'cm' }), blk('sp_move', { N: n(1) }, { DIR: '-1', UNIT: 'rot' }),
        blk('sp_turn', { DEG: n(90) }), blk('sp_start_move'), blk('sp_steer', { STEER: n(30) }), blk('sp_stop'),
        blk('sp_set_speed', { P: n(50) }),
        blk('sp_motor_turn', { DEG: n(360) }), blk('sp_motor_start', { P: n(50) }), blk('sp_motor_stop'), blk('sp_motor_pos'),
      ]),
      cat('燈光', 'light', 'light_category', [
        blk('sp_light_pattern'), blk('sp_light_text', { T: { shadow: { type: 'text', fields: { TEXT: '你好' } } } }),
        blk('sp_light_pixel', { X: n(3), Y: n(3), B: n(100) }), blk('sp_light_off'),
        blk('sp_say', { T: { shadow: { type: 'text', fields: { TEXT: '你好' } } } }),
      ]),
      cat('聲音', 'sound', 'sound_category', [blk('sp_beep', { NOTE: n(60), S: n(0.5) })]),
      cat('事件', 'event', 'event_category', [
        blk('sp_start'), blk('sp_when_color'), blk('sp_when_force'), blk('sp_when_dist', { N: n(20) }),
      ]),
      cat('控制', 'control', 'control_category', [
        blk('sp_wait', { S: n(1) }), blk('controls_repeat_ext', { TIMES: n(10) }), blk('sp_forever'),
        blk('controls_if'), { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
        blk('sp_wait_until'), blk('sp_repeat_until'), blk('controls_flow_statements'),
      ]),
      cat('感測', 'sensor', 'sensor_category', [
        blk('sp_color_is'), blk('sp_light'), blk('sp_dist'), blk('sp_dist_less', { N: n(20) }), blk('sp_force'),
        blk('sp_yaw'), blk('sp_reset_yaw'), blk('sp_timer'), blk('sp_reset_timer'),
      ]),
      cat('運算', 'operator', 'operator_category', [
        blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'ADD' }), blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'MINUS' }),
        blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'MULTIPLY' }), blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'DIVIDE' }),
        blk('math_random_int', { FROM: n(1), TO: n(10) }),
        blk('logic_compare', { A: n(0), B: n(0) }, { OP: 'LT' }), blk('logic_compare', { A: n(0), B: n(0) }, { OP: 'EQ' }),
        blk('logic_compare', { A: n(0), B: n(0) }, { OP: 'GT' }),
        blk('logic_operation', null, { OP: 'AND' }), blk('logic_operation', null, { OP: 'OR' }), blk('logic_negate'),
        blk('math_modulo', { DIVIDEND: n(10), DIVISOR: n(3) }), blk('math_round', { NUM: n(3.6) }),
      ]),
      cat('變數', 'variable', 'variable_category', []),
    ],
  };
  SP.toolbox.contents[7].custom = 'VARIABLE';
  delete SP.toolbox.contents[7].contents;

  /* ---------- 類別圓形圖示（自畫 SVG） ---------- */
  const svg = (inner) => 'url("data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`) + '")';
  const GLYPH = {
    motion: '<path d="M4 12h14M12 6l6 6-6 6"/>',
    light: '<g fill="#fff" stroke="none"><circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></g>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    event: '<path d="M6 21V4"/><path d="M6 5h12l-3 4 3 4H6" fill="#fff"/>',
    control: '<path d="M19 12a7 7 0 1 1-2.5-5.4"/><path d="M19 4v5h-5" />',
    sensor: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="#fff"/>',
    operator: '<path d="M7 4v8M3 8h8"/><path d="M13 17h8"/><path d="M14 4l6 8M20 4l-6 8" />',
    variable: '<rect x="4" y="4" width="16" height="4" rx="2" fill="#fff"/><rect x="4" y="10" width="16" height="4" rx="2" fill="#fff"/><rect x="4" y="16" width="16" height="4" rx="2" fill="#fff"/>',
  };
  SP.iconCss = () => Object.keys(GLYPH).map((k) =>
    `.cat-${k}{background:${COL[k][0]} ${svg(GLYPH[k])} center/22px 22px no-repeat !important}`).join('\n');
  SP.COL = COL;
})(window.SP = window.SP || {});
