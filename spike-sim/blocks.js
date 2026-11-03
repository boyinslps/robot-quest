/* SPIKE 風格積木：定義、JavaScript 程式產生器、工具箱、佈景（依官方 Word Blocks 清單） */
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
    procedure: ['#FF6680', '#FF4D6A', '#FF3355'],
  };
  COL.motor = COL.motion; COL.move = COL.motion;
  const style = (c) => ({ colourPrimary: c[0], colourSecondary: c[1], colourTertiary: c[2] });
  SP.theme = Blockly.Theme.defineTheme('spike', {
    base: Blockly.Themes.Zelos,
    blockStyles: {
      motion_blocks: style(COL.motion), light_blocks: style(COL.light), sound_blocks: style(COL.sound),
      event_blocks: style(COL.event), control_blocks: style(COL.control), sensor_blocks: style(COL.sensor),
      operator_blocks: style(COL.operator), variable_blocks: style(COL.variable), procedure_blocks: style(COL.procedure),
      loop_blocks: style(COL.control), logic_blocks: style(COL.operator), math_blocks: style(COL.operator),
      text_blocks: style(COL.operator), variable_dynamic_blocks: style(COL.variable),
    },
    categoryStyles: {
      motor_category: { colour: COL.motion[0] }, move_category: { colour: COL.motion[0] }, light_category: { colour: COL.light[0] },
      sound_category: { colour: COL.sound[0] }, event_category: { colour: COL.event[0] },
      control_category: { colour: COL.control[0] }, sensor_category: { colour: COL.sensor[0] },
      operator_category: { colour: COL.operator[0] }, variable_category: { colour: COL.variable[0] }, procedure_category: { colour: COL.procedure[0] },
    },
    componentStyles: {
      workspaceBackgroundColour: '#f9f9f9', toolboxBackgroundColour: '#ffffff', flyoutBackgroundColour: '#f1f3f7',
      flyoutOpacity: 1, scrollbarColour: '#c5cad3', insertionMarkerColour: '#000', insertionMarkerOpacity: 0.2,
    },
    fontStyle: { family: '"Noto Sans TC","Microsoft JhengHei","PingFang TC",sans-serif', weight: 'bold', size: 11 },
    startHats: true,
  });

  /* ---------- 選單與小工具 ---------- */
  const dd = (name, opts) => ({ type: 'field_dropdown', name, options: opts });
  const num = (name) => ({ type: 'input_value', name, check: 'Number' });
  const stmt = { previousStatement: null, nextStatement: null };
  const ALL_PORTS = ['A', 'B', 'C', 'D', 'E', 'F'];
  const PORTS = (first) => ALL_PORTS.slice().sort((a, b) => (a === first ? -1 : b === first ? 1 : 0)).map((p) => [p, p]);
  const SENSOR_PORTS = (first) => ['C', 'D', 'E', 'F'].sort((a, b) => (a === first ? -1 : b === first ? 1 : 0)).map((p) => [p, p]);
  const COLORS = [['黑色', 'black'], ['白色', 'white'], ['紅色', 'red'], ['黃色', 'yellow'], ['綠色', 'green'], ['藍色', 'blue'], ['沒有顏色', 'none']];
  const POWER_COLORS = [['黑色（關）', '0'], ['洋紅', '1'], ['紫色', '2'], ['藍色', '3'], ['淺藍', '4'], ['青綠', '5'], ['綠色', '6'], ['黃色', '7'], ['橘色', '8'], ['紅色', '9'], ['白色', '10']];
  const DIR_FWD = [['前進 ↑', '1'], ['後退 ↓', '-1']];
  const DIR_CW = [['順時針 ↻', '1'], ['逆時針 ↺', '-1']];
  const UNIT_MOVE = [['公分', 'cm'], ['圈', 'rot'], ['度', 'deg'], ['英寸', 'in'], ['秒', 'sec']];
  const UNIT_MOTOR = [['圈', 'rot'], ['度', 'deg'], ['秒', 'sec']];
  const SIDE = [['左', 'left'], ['右', 'right']];

  Blockly.defineBlocksWithJsonArray([
    /* 事件 */
    { type: 'sp_start', message0: '當程式開始', nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_color', message0: '%1 當顏色是 %2', args0: [dd('PORT', SENSOR_PORTS('C')), dd('COLOR', COLORS)], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_force', message0: '%1 當 %2', args0: [dd('PORT', SENSOR_PORTS('E')), dd('STATE', [['被按下', 'down'], ['被重壓', 'hard'], ['被放開', 'up']])], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_dist', message0: '%1 當 %2 %3 %%', args0: [dd('PORT', SENSOR_PORTS('D')), dd('OP', [['更近於', '<'], ['更遠於', '>']]), num('N')], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_button', message0: '當 %1 按鈕 %2', args0: [dd('SIDE', SIDE), dd('STATE', [['被按下', 'down'], ['被放開', 'up']])], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_timer', message0: '當計時器大於 %1 秒', args0: [num('N')], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_cond', message0: '當 %1', args0: [{ type: 'input_value', name: 'C', check: 'Boolean' }], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_when_message', message0: '當收到訊息 %1', args0: [{ type: 'field_input', name: 'MSG', text: '訊息1' }], nextStatement: null, style: 'event_blocks' },
    { type: 'sp_broadcast', message0: '傳送訊息 %1', args0: [{ type: 'field_input', name: 'MSG', text: '訊息1' }], ...stmt, style: 'event_blocks' },
    { type: 'sp_broadcast_wait', message0: '傳送訊息 %1 並等待', args0: [{ type: 'field_input', name: 'MSG', text: '訊息1' }], ...stmt, style: 'event_blocks' },

    /* 馬達 */
    { type: 'sp_motor_run', message0: '%1 轉動 %2 %3 %4', args0: [dd('PORT', PORTS('A')), dd('DIR', DIR_CW), num('N'), dd('UNIT', UNIT_MOTOR)], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_goto', message0: '%1 以 %2 轉到位置 %3', args0: [dd('PORT', PORTS('A')), dd('MODE', [['最短路徑', 'short'], ['順時針', 'cw'], ['逆時針', 'ccw']]), num('POS')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_start', message0: '%1 開始轉動 %2', args0: [dd('PORT', PORTS('A')), dd('DIR', DIR_CW)], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_stop', message0: '%1 停止馬達', args0: [dd('PORT', PORTS('A'))], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_speed_set', message0: '%1 設定速度為 %2 %%', args0: [dd('PORT', PORTS('A')), num('P')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_motor_pos', message0: '%1 位置', args0: [dd('PORT', PORTS('A'))], output: 'Number', style: 'motion_blocks' },
    { type: 'sp_motor_speed', message0: '%1 速度', args0: [dd('PORT', PORTS('A'))], output: 'Number', style: 'motion_blocks' },
    { type: 'sp_motor_relpos', message0: '%1 相對位置', args0: [dd('PORT', PORTS('A'))], output: 'Number', style: 'motion_blocks' },
    { type: 'sp_motor_setrel', message0: '將 %1 相對位置設為 %2', args0: [dd('PORT', PORTS('A')), num('N')], ...stmt, style: 'motion_blocks' },

    /* 移動 */
    { type: 'sp_move', message0: '移動 %1 %2 %3', args0: [dd('DIR', DIR_FWD), num('N'), dd('UNIT', UNIT_MOVE)], ...stmt, style: 'motion_blocks' },
    { type: 'sp_start_move', message0: '開始 %1 移動', args0: [dd('DIR', DIR_FWD)], ...stmt, style: 'motion_blocks' },
    { type: 'sp_steer_for', message0: '以轉向 %1 移動 %2 %3', args0: [num('STEER'), num('N'), dd('UNIT', UNIT_MOVE)], ...stmt, style: 'motion_blocks' },
    { type: 'sp_steer', message0: '以轉向 %1 開始移動', args0: [num('STEER')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_tank', message0: '開始以左輪 %1 右輪 %2 的速度移動', args0: [num('L'), num('R')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_stop', message0: '停止移動', ...stmt, style: 'motion_blocks' },
    { type: 'sp_set_speed', message0: '設定移動速度為 %1 %%', args0: [num('P')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_set_pair', message0: '設定移動馬達為 %1', args0: [dd('PAIR', [['A + B', 'A+B'], ['B + A', 'B+A'], ['C + D', 'C+D'], ['E + F', 'E+F']])], ...stmt, style: 'motion_blocks' },
    { type: 'sp_set_distance', message0: '設定 1 圈馬達旋轉 = %1 公分', args0: [num('CM')], ...stmt, style: 'motion_blocks' },
    { type: 'sp_turn', message0: '向 %1 轉 %2 度（陀螺儀）', args0: [dd('DIR', [['右', '1'], ['左', '-1']]), num('DEG')], ...stmt, style: 'motion_blocks' },

    /* 燈光 */
    { type: 'sp_light_image', message0: '亮起 %1', args0: [dd('IMG', SP.imageOptions())], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_image_for', message0: '亮起 %1 持續 %2 秒', args0: [dd('IMG', SP.imageOptions()), num('S')], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_text', message0: '寫入 %1', args0: [{ type: 'input_value', name: 'T' }], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_off', message0: '關閉燈陣', ...stmt, style: 'light_blocks' },
    { type: 'sp_light_bright', message0: '設定燈陣亮度為 %1 %%', args0: [num('B')], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_pixel', message0: '設定像素 x %1 y %2 亮度為 %3 %%', args0: [num('X'), num('Y'), num('B')], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_rotate', message0: '旋轉燈陣 %1', args0: [dd('DIR', DIR_CW)], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_orient', message0: '設定燈陣方向為 %1', args0: [dd('Q', [['正向', '0'], ['向右', '1'], ['上下顛倒', '2'], ['向左', '3']])], ...stmt, style: 'light_blocks' },
    { type: 'sp_power_light', message0: '設定電源鍵燈為 %1', args0: [dd('C', POWER_COLORS)], ...stmt, style: 'light_blocks' },
    { type: 'sp_say', message0: '印出 %1 到訊息欄', args0: [{ type: 'input_value', name: 'T' }], ...stmt, style: 'light_blocks' },
    { type: 'sp_light_pattern', message0: '主機亮起 %1 圖案（舊）', args0: [dd('PAT', [['愛心', 'heart'], ['笑臉', 'smile'], ['難過', 'sad'], ['向上箭頭', 'up'], ['打勾', 'check'], ['打叉', 'cross']])], ...stmt, style: 'light_blocks' },

    /* 聲音 */
    { type: 'sp_beep', message0: '播放嗶聲 %1 持續 %2 秒', args0: [num('NOTE'), num('S')], ...stmt, style: 'sound_blocks' },
    { type: 'sp_beep_start', message0: '開始播放嗶聲 %1', args0: [num('NOTE')], ...stmt, style: 'sound_blocks' },
    { type: 'sp_stop_sound', message0: '停止所有聲音', ...stmt, style: 'sound_blocks' },

    /* 控制 */
    { type: 'sp_wait', message0: '等待 %1 秒', args0: [num('S')], ...stmt, style: 'control_blocks' },
    { type: 'sp_wait_until', message0: '等待直到 %1', args0: [{ type: 'input_value', name: 'C', check: 'Boolean' }], ...stmt, style: 'control_blocks' },
    { type: 'sp_forever', message0: '一直重複 %1', args0: [{ type: 'input_statement', name: 'DO' }], previousStatement: null, style: 'control_blocks' },
    { type: 'sp_repeat_until', message0: '重複直到 %1 %2', args0: [{ type: 'input_value', name: 'C', check: 'Boolean' }, { type: 'input_statement', name: 'DO' }], ...stmt, style: 'control_blocks' },
    { type: 'sp_stop_other', message0: '停止其他積木堆疊', ...stmt, style: 'control_blocks' },
    { type: 'sp_stop_mode', message0: '停止 %1', args0: [dd('MODE', [['全部', 'all'], ['此積木堆疊', 'this'], ['其他積木堆疊', 'other']])], previousStatement: null, style: 'control_blocks' },
    { type: 'sp_stop_program', message0: '停止程式', previousStatement: null, style: 'control_blocks' },

    /* 感測 */
    { type: 'sp_color_is', message0: '%1 是顏色 %2 ?', args0: [dd('PORT', SENSOR_PORTS('C')), dd('COLOR', COLORS)], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_color', message0: '%1 顏色', args0: [dd('PORT', SENSOR_PORTS('C'))], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_reflect_is', message0: '%1 反射光 %2 %3 %% ?', args0: [dd('PORT', SENSOR_PORTS('C')), dd('OP', [['小於', '<'], ['等於', '='], ['大於', '>']]), num('N')], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_light', message0: '%1 反射光 (%%)', args0: [dd('PORT', SENSOR_PORTS('C'))], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_pressed_is', message0: '%1 %2 ?', args0: [dd('PORT', SENSOR_PORTS('E')), dd('STATE', [['被按下', 'pressed'], ['被重壓', 'hard'], ['被放開', 'released']])], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_force_val', message0: '%1 壓力 %2', args0: [dd('PORT', SENSOR_PORTS('E')), dd('UNIT', [['牛頓', 'n'], ['%', 'pct']])], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_dist_is', message0: '%1 距離 %2 %3 %4 ?', args0: [dd('PORT', SENSOR_PORTS('D')), dd('MODE', [['更近於', 'closer'], ['更遠於', 'farther'], ['剛好是', 'exactly']]), num('N'), dd('UNIT', [['公分', 'cm'], ['英寸', 'in'], ['%', 'pct']])], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_dist', message0: '%1 距離 %2', args0: [dd('PORT', SENSOR_PORTS('D')), dd('UNIT', [['公分', 'cm'], ['英寸', 'in'], ['%', 'pct']])], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_angle', message0: '主機 %1 角', args0: [dd('AXIS', [['偏航', 'yaw'], ['俯仰', 'pitch'], ['滾動', 'roll']])], output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_yaw', message0: '轉向角度', output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_reset_yaw', message0: '將偏航角設為 0', ...stmt, style: 'sensor_blocks' },
    { type: 'sp_button_is', message0: '%1 按鈕被按下 ?', args0: [dd('SIDE', SIDE)], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_timer', message0: '計時器', output: 'Number', style: 'sensor_blocks' },
    { type: 'sp_reset_timer', message0: '重設計時器', ...stmt, style: 'sensor_blocks' },
    { type: 'sp_force', message0: '%1 被按下 ?（舊）', args0: [dd('PORT', SENSOR_PORTS('E'))], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_dist_less', message0: '%1 距離 %2 %3 公分 ?（舊）', args0: [dd('PORT', SENSOR_PORTS('D')), dd('OP', [['小於', '<'], ['大於', '>']]), num('N')], output: 'Boolean', style: 'sensor_blocks' },
    { type: 'sp_motor_turn', message0: '馬達 %1 轉 %2 度（舊）', args0: [dd('PORT', PORTS('A')), num('DEG')], ...stmt, style: 'motion_blocks' },

    /* 運算（官方有、Blockly 沒有的） */
    { type: 'sp_between', message0: '%1 介於 %2 和 %3 之間 ?', args0: [num('A'), num('B'), num('C')], output: 'Boolean', style: 'operator_blocks' },
    { type: 'sp_join', message0: '連接 %1 和 %2', args0: [{ type: 'input_value', name: 'A' }, { type: 'input_value', name: 'B' }], output: 'String', style: 'operator_blocks' },
    { type: 'sp_letter', message0: '第 %1 個字元，在 %2', args0: [num('N'), { type: 'input_value', name: 'T' }], output: 'String', style: 'operator_blocks' },
    { type: 'sp_length', message0: '%1 的長度', args0: [{ type: 'input_value', name: 'T' }], output: 'Number', style: 'operator_blocks' },
    { type: 'sp_contains', message0: '%1 包含 %2 ?', args0: [{ type: 'input_value', name: 'T' }, { type: 'input_value', name: 'C' }], output: 'Boolean', style: 'operator_blocks' },
  ]);

  // 內建「如果」積木也歸入控制（橘色）
  const origIf = Blockly.Blocks.controls_if.init;
  Blockly.Blocks.controls_if.init = function () { origIf.call(this); this.setStyle('control_blocks'); };

  /* ---------- JavaScript 程式產生器 ---------- */
  G.STATEMENT_PREFIX = 'api.hl(%1);\n';
  G.INFINITE_LOOP_TRAP = 'await api.tick();\n';
  const v = (b, n, d = '0') => G.valueToCode(b, n, O.NONE) || d;
  const f = (b, n) => b.getFieldValue(n);
  const q = (s) => JSON.stringify(String(s));
  const S = G.forBlock;
  const call = (c) => [c, O.FUNCTION_CALL];

  for (const t of ['sp_start', 'sp_when_color', 'sp_when_force', 'sp_when_dist', 'sp_when_button', 'sp_when_timer', 'sp_when_cond', 'sp_when_message']) S[t] = () => '';
  S.sp_broadcast = (b) => `api.broadcast(${q(f(b, 'MSG'))});\n`;
  S.sp_broadcast_wait = (b) => `await api.broadcastWait(${q(f(b, 'MSG'))});\n`;
  // 馬達
  S.sp_motor_run = (b) => `await api.motorRun(${q(f(b, 'PORT'))}, ${f(b, 'DIR')}, ${v(b, 'N')}, ${q(f(b, 'UNIT'))});\n`;
  S.sp_motor_goto = (b) => `await api.motorGoto(${q(f(b, 'PORT'))}, ${q(f(b, 'MODE'))}, ${v(b, 'POS')});\n`;
  S.sp_motor_start = (b) => `api.motorStartDir(${q(f(b, 'PORT'))}, ${f(b, 'DIR') || 1});\n`;
  S.sp_motor_stop = (b) => `api.motorStop(${q(f(b, 'PORT'))});\n`;
  S.sp_motor_speed_set = (b) => `api.motorSetSpeed(${q(f(b, 'PORT'))}, ${v(b, 'P')});\n`;
  S.sp_motor_pos = (b) => call(`api.motorPosAbs(${q(f(b, 'PORT'))})`);
  S.sp_motor_speed = (b) => call(`api.motorSpeedPct(${q(f(b, 'PORT'))})`);
  S.sp_motor_relpos = (b) => call(`api.motorPos(${q(f(b, 'PORT'))})`);
  S.sp_motor_setrel = (b) => `api.motorSetPos(${q(f(b, 'PORT'))}, ${v(b, 'N')});\n`;
  S.sp_motor_turn = (b) => `await api.motorTurn(${q(f(b, 'PORT'))}, ${v(b, 'DEG')});\n`;
  // 移動
  S.sp_move = (b) => `await api.move(${f(b, 'DIR')}, ${v(b, 'N')}, ${q(f(b, 'UNIT'))});\n`;
  S.sp_start_move = (b) => `api.startMove(${f(b, 'DIR')}, 0);\n`;
  S.sp_steer_for = (b) => `await api.steerFor(${v(b, 'STEER')}, ${v(b, 'N')}, ${q(f(b, 'UNIT'))}, 1);\n`;
  S.sp_steer = (b) => `api.startMove(1, ${v(b, 'STEER')});\n`;
  S.sp_tank = (b) => `api.tank(${v(b, 'L')}, ${v(b, 'R')});\n`;
  S.sp_stop = () => 'api.stop();\n';
  S.sp_set_speed = (b) => `api.setSpeed(${v(b, 'P')});\n`;
  S.sp_set_pair = (b) => `api.setPair(${q(f(b, 'PAIR'))});\n`;
  S.sp_set_distance = (b) => `api.setDistance(${v(b, 'CM')});\n`;
  S.sp_turn = (b) => `await api.turn(${f(b, 'DIR')}, ${v(b, 'DEG')});\n`;
  // 燈光
  S.sp_light_image = (b) => `api.lightImage(${f(b, 'IMG')});\n`;
  S.sp_light_image_for = (b) => `await api.lightImageFor(${f(b, 'IMG')}, ${v(b, 'S')});\n`;
  S.sp_light_text = (b) => `api.lightText(${v(b, 'T', "''")});\n`;
  S.sp_light_off = () => 'api.lightOff();\n';
  S.sp_light_bright = (b) => `api.lightBrightness(${v(b, 'B')});\n`;
  S.sp_light_pixel = (b) => `api.lightPixel(${v(b, 'X')}, ${v(b, 'Y')}, ${v(b, 'B')});\n`;
  S.sp_light_rotate = (b) => `api.lightRotate(${f(b, 'DIR')});\n`;
  S.sp_light_orient = (b) => `api.lightOrient(${f(b, 'Q')});\n`;
  S.sp_power_light = (b) => `api.centerLight(${f(b, 'C')});\n`;
  S.sp_say = (b) => `api.say(${v(b, 'T', "''")});\n`;
  S.sp_light_pattern = (b) => `api.lightPattern(${q(f(b, 'PAT'))});\n`;
  // 聲音
  S.sp_beep = (b) => `await api.beep(${v(b, 'NOTE')}, ${v(b, 'S')});\n`;
  S.sp_beep_start = (b) => `api.beepStart(${v(b, 'NOTE')});\n`;
  S.sp_stop_sound = () => 'api.stopSounds();\n';
  // 控制
  S.sp_wait = (b) => `await api.wait(${v(b, 'S')});\n`;
  S.sp_wait_until = (b) => `await api.waitUntil(() => (${v(b, 'C', 'false')}));\n`;
  S.sp_forever = (b) => `while (true) {\n${G.addLoopTrap(G.statementToCode(b, 'DO'), b)}}\n`;
  S.sp_repeat_until = (b) => `while (!(${v(b, 'C', 'false')})) {\n${G.addLoopTrap(G.statementToCode(b, 'DO'), b)}}\n`;
  S.sp_stop_other = () => "api.stopStacks('other');\n";
  S.sp_stop_mode = (b) => `api.stopStacks(${q(f(b, 'MODE'))});\n`;
  S.sp_stop_program = () => 'api.stopProgram();\n';
  // 感測
  S.sp_color_is = (b) => call(`api.colorIs(${q(f(b, 'PORT'))}, ${q(f(b, 'COLOR'))})`);
  S.sp_color = (b) => call(`api.colorNum(${q(f(b, 'PORT'))})`);
  S.sp_reflect_is = (b) => call(`api.reflectCmp(${q(f(b, 'PORT'))}, ${q(f(b, 'OP'))}, ${v(b, 'N')})`);
  S.sp_light = (b) => call(`api.light(${q(f(b, 'PORT'))})`);
  S.sp_pressed_is = (b) => call(`api.forceState(${q(f(b, 'PORT'))}, ${q(f(b, 'STATE'))})`);
  S.sp_force_val = (b) => call(`api.forceVal(${q(f(b, 'PORT'))}, ${q(f(b, 'UNIT'))})`);
  S.sp_dist_is = (b) => call(`api.distCmp(${q(f(b, 'PORT'))}, ${q(f(b, 'MODE'))}, ${v(b, 'N')}, ${q(f(b, 'UNIT'))})`);
  S.sp_dist = (b) => call(`api.dist(${q(f(b, 'PORT'))}, ${q(f(b, 'UNIT') || 'cm')})`);
  S.sp_angle = (b) => call(`api.angle(${q(f(b, 'AXIS'))})`);
  S.sp_yaw = () => call('api.yaw()');
  S.sp_reset_yaw = () => 'api.resetYaw(0);\n';
  S.sp_button_is = (b) => call(`api.buttonIs(${q(f(b, 'SIDE'))})`);
  S.sp_timer = () => call('api.timer()');
  S.sp_reset_timer = () => 'api.resetTimer();\n';
  S.sp_force = (b) => call(`api.pressed(${q(f(b, 'PORT'))})`);
  S.sp_dist_less = (b) => call(`api.distLess(${q(f(b, 'PORT'))}, ${q(f(b, 'OP'))}, ${v(b, 'N')})`);
  // 運算
  S.sp_between = (b) => [`(Number(${v(b, 'B')}) <= Number(${v(b, 'A')}) && Number(${v(b, 'A')}) <= Number(${v(b, 'C')}))`, O.LOGICAL_AND];
  S.sp_join = (b) => [`(String(${v(b, 'A', "''")}) + String(${v(b, 'B', "''")}))`, O.ADDITION];
  S.sp_letter = (b) => call(`String(${v(b, 'T', "''")}).charAt(Math.round(${v(b, 'N')}) - 1)`);
  S.sp_length = (b) => call(`String(${v(b, 'T', "''")}).length`);
  S.sp_contains = (b) => call(`String(${v(b, 'T', "''")}).includes(String(${v(b, 'C', "''")}))`);

  // 「我的積木」：改成 async，呼叫時 await
  const origDef = S.procedures_defnoreturn, origCall = S.procedures_callnoreturn;
  S.procedures_defnoreturn = function (b, g) {
    const r = origDef.call(this, b, g), k = '%' + g.getProcedureName(b.getFieldValue('NAME'));
    if (g.definitions_[k]) g.definitions_[k] = g.definitions_[k].replace(/^function /m, 'async function ');
    return r;
  };
  S.procedures_callnoreturn = function (b, g) { return 'await ' + origCall.call(this, b, g); };

  /* 每個「事件積木」是一條獨立執行緒；所有執行緒同時跑（和 SPIKE 相同） */
  SP.isHat = (b) => b.type === 'sp_start' || b.type.startsWith('sp_when_');
  SP.generate = function (ws) {
    G.init(ws);
    ws.getTopBlocks(true).filter((b) => b.type === 'procedures_defnoreturn').forEach((b) => G.blockToCode(b));
    const hats = ws.getTopBlocks(true).filter(SP.isHat);
    const recv = {};
    hats.filter((h) => h.type === 'sp_when_message').forEach((h) => { recv[f(h, 'MSG')] = (recv[f(h, 'MSG')] || 0) + 1; });
    let code = `const api = __api;\napi.setReceivers(${JSON.stringify(recv)});\napi.setThreads(${hats.length});\n`;
    const names = [];
    hats.forEach((h, i) => {
      const first = h.getNextBlock();
      let body = first ? G.blockToCode(first) : '';
      if (Array.isArray(body)) body = body[0];
      const P = q(f(h, 'PORT') || ''), loop = (cond, end) => `while (true) {\nawait api.waitUntil(() => ${cond});\n${body}await api.waitUntil(() => !(${end || cond}));\n}\n`;
      if (h.type === 'sp_when_color') body = loop(`api.colorIs(${P}, ${q(f(h, 'COLOR'))})`);
      else if (h.type === 'sp_when_force') body = loop(`api.forceState(${P}, ${q({ down: 'pressed', hard: 'hard', up: 'released' }[f(h, 'STATE')] || 'pressed')})`);
      else if (h.type === 'sp_when_dist') body = loop(`api.distCmp(${P}, ${f(h, 'OP') === '<' ? "'closer'" : "'farther'"}, ${v(h, 'N')}, 'pct')`);
      else if (h.type === 'sp_when_button') body = loop(f(h, 'STATE') === 'down' ? `api.buttonIs(${q(f(h, 'SIDE'))})` : `!api.buttonIs(${q(f(h, 'SIDE'))})`, f(h, 'STATE') === 'down' ? `api.buttonIs(${q(f(h, 'SIDE'))})` : `!api.buttonIs(${q(f(h, 'SIDE'))})`);
      else if (h.type === 'sp_when_timer') body = loop(`api.timer() > ${v(h, 'N')}`);
      else if (h.type === 'sp_when_cond') body = loop(v(h, 'C', 'false'));
      else if (h.type === 'sp_when_message') {
        const m = q(f(h, 'MSG'));
        body = `while (true) {\nawait api.waitMsg(${m}, 'h${i}');\n${body}api.msgDone(${m});\n}\n`;
      }
      code += `async function thread_${i}() {\nconst api = __api.forThread(${i});\ntry {\n${body}} catch (e) { if (e !== __api.THREAD_STOP) throw e; }\n}\n`;
      names.push(`thread_${i}()`);
    });
    code += `await Promise.all([${names.join(', ')}]);\n`;
    return { code: G.finish(code), threads: hats.length };
  };

  /* ---------- 工具箱 ---------- */
  const n = (x) => ({ shadow: { type: 'math_number', fields: { NUM: x } } });
  const txt = (x) => ({ shadow: { type: 'text', fields: { TEXT: x } } });
  const blk = (type, inputs, fields) => ({ kind: 'block', type, ...(inputs ? { inputs } : {}), ...(fields ? { fields } : {}) });
  const cat = (name, cls, style, contents) => ({ kind: 'category', name, categorystyle: style, cssConfig: { container: 'tc-' + cls, icon: 'cat-icon cat-' + cls }, contents });
  SP.toolbox = {
    kind: 'categoryToolbox',
    contents: [
      cat('馬達', 'motor', 'motor_category', [
        blk('sp_motor_run', { N: n(1) }), blk('sp_motor_goto', { POS: n(0) }), blk('sp_motor_start'), blk('sp_motor_stop'),
        blk('sp_motor_speed_set', { P: n(75) }), blk('sp_motor_pos'), blk('sp_motor_speed'),
        blk('sp_motor_relpos'), blk('sp_motor_setrel', { N: n(0) }),
      ]),
      cat('移動', 'move', 'move_category', [
        blk('sp_move', { N: n(10) }, { DIR: '1', UNIT: 'cm' }), blk('sp_start_move'), blk('sp_steer_for', { STEER: n(30), N: n(10) }),
        blk('sp_steer', { STEER: n(30) }), blk('sp_stop'), blk('sp_set_speed', { P: n(50) }), blk('sp_set_pair'),
        blk('sp_set_distance', { CM: n(17.5) }), blk('sp_tank', { L: n(50), R: n(50) }), blk('sp_turn', { DEG: n(90) }),
      ]),
      cat('燈光', 'light', 'light_category', [
        blk('sp_light_image_for', { S: n(2) }), blk('sp_light_image'), blk('sp_light_text', { T: txt('你好') }), blk('sp_light_off'),
        blk('sp_light_bright', { B: n(75) }), blk('sp_light_pixel', { X: n(1), Y: n(1), B: n(100) }),
        blk('sp_light_rotate'), blk('sp_light_orient'), blk('sp_power_light'), blk('sp_say', { T: txt('你好') }),
      ]),
      cat('聲音', 'sound', 'sound_category', [blk('sp_beep', { NOTE: n(60), S: n(0.2) }), blk('sp_beep_start', { NOTE: n(60) }), blk('sp_stop_sound')]),
      cat('事件', 'event', 'event_category', [
        blk('sp_start'), blk('sp_when_color'), blk('sp_when_force'), blk('sp_when_dist', { N: n(8) }), blk('sp_when_button'),
        blk('sp_when_timer', { N: n(10) }), blk('sp_when_cond'), blk('sp_when_message'), blk('sp_broadcast'), blk('sp_broadcast_wait'),
      ]),
      cat('控制', 'control', 'control_category', [
        blk('sp_wait', { S: n(1) }), blk('controls_repeat_ext', { TIMES: n(10) }), blk('sp_forever'),
        blk('controls_if'), { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
        blk('sp_wait_until'), blk('sp_repeat_until'), blk('controls_flow_statements'), blk('sp_stop_other'), blk('sp_stop_mode'),
      ]),
      cat('感測', 'sensor', 'sensor_category', [
        blk('sp_color_is'), blk('sp_color'), blk('sp_reflect_is', { N: n(50) }), blk('sp_light'),
        blk('sp_pressed_is'), blk('sp_force_val'), blk('sp_dist_is', { N: n(15) }), blk('sp_dist'),
        blk('sp_angle'), blk('sp_yaw'), blk('sp_reset_yaw'), blk('sp_button_is'), blk('sp_timer'), blk('sp_reset_timer'),
      ]),
      cat('運算', 'operator', 'operator_category', [
        blk('math_random_int', { FROM: n(1), TO: n(10) }),
        blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'ADD' }), blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'MINUS' }),
        blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'MULTIPLY' }), blk('math_arithmetic', { A: n(1), B: n(1) }, { OP: 'DIVIDE' }),
        blk('logic_compare', { A: n(0), B: n(0) }, { OP: 'LT' }), blk('logic_compare', { A: n(0), B: n(0) }, { OP: 'EQ' }),
        blk('logic_compare', { A: n(0), B: n(0) }, { OP: 'GT' }),
        blk('logic_operation', null, { OP: 'AND' }), blk('logic_operation', null, { OP: 'OR' }), blk('logic_negate'),
        blk('sp_between', { A: n(5), B: n(1), C: n(10) }),
        blk('sp_join', { A: txt('你好'), B: txt('世界') }), blk('sp_letter', { N: n(1), T: txt('LEGO') }), blk('sp_length', { T: txt('LEGO') }),
        blk('sp_contains', { T: txt('LEGO'), C: txt('L') }),
        blk('math_modulo', { DIVIDEND: n(10), DIVISOR: n(3) }), blk('math_round', { NUM: n(3.6) }), blk('math_single', { NUM: n(9) }, { OP: 'ROOT' }),
      ]),
      { kind: 'category', name: '變數', categorystyle: 'variable_category', cssConfig: { container: 'tc-variable', icon: 'cat-icon cat-variable' }, custom: 'VARIABLE' },
      { kind: 'category', name: '我的積木', categorystyle: 'procedure_category', cssConfig: { container: 'tc-procedure', icon: 'cat-icon cat-procedure' }, custom: 'PROCEDURE' },
    ],
  };

  /* ---------- 類別圓形圖示（自畫 SVG） ---------- */
  const svg = (inner) => 'url("data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`) + '")';
  const GLYPH = {
    motor: '<circle cx="12" cy="12" r="6"/><path d="M12 12l4-4" /><circle cx="12" cy="12" r="1.5" fill="#fff"/>',
    move: '<path d="M4 12h14M12 6l6 6-6 6"/>',
    light: '<g fill="#fff" stroke="none"><circle cx="6" cy="6" r="2"/><circle cx="12" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="18" cy="12" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></g>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/>',
    event: '<path d="M6 21V4"/><path d="M6 5h12l-3 4 3 4H6" fill="#fff"/>',
    control: '<path d="M19 12a7 7 0 1 1-2.5-5.4"/><path d="M19 4v5h-5" />',
    sensor: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="#fff"/>',
    operator: '<path d="M7 4v8M3 8h8"/><path d="M13 17h8"/><path d="M14 4l6 8M20 4l-6 8" />',
    variable: '<rect x="4" y="4" width="16" height="4" rx="2" fill="#fff"/><rect x="4" y="10" width="16" height="4" rx="2" fill="#fff"/><rect x="4" y="16" width="16" height="4" rx="2" fill="#fff"/>',
    procedure: '<rect x="4" y="5" width="16" height="6" rx="2" fill="#fff"/><rect x="8" y="13" width="12" height="6" rx="2" fill="#fff"/>',
  };
  SP.iconCss = () => Object.keys(GLYPH).map((k) =>
    `.cat-${k}{background:${(COL[k] || COL.motion)[0]} ${svg(GLYPH[k])} center/22px 22px no-repeat !important}`).join('\n');
  SP.COL = COL;
})(window.SP = window.SP || {});
