/* 積木 → Python（SPIKE App 3 的 Python API：hub / motor / motor_pair / color_sensor / runloop …） */
(function (SP) {
  'use strict';
  const P = python.pythonGenerator, PO = python.Order;
  const S = P.forBlock;
  const v = (b, n, d = '0') => P.valueToCode(b, n, PO.NONE) || d;
  const f = (b, n) => b.getFieldValue(n);
  const q = (s) => JSON.stringify(String(s));
  const COLORS = { black: 'BLACK', white: 'WHITE', red: 'RED', yellow: 'YELLOW', green: 'GREEN', blue: 'BLUE', none: 'UNKNOWN' };
  const PORT = (p) => 'port.' + p;
  const PAIR = 'motor_pair.PAIR_1';
  const call = (c) => [c, PO.FUNCTION_CALL];

  P.INDENT = '    ';
  P.INFINITE_LOOP_TRAP = 'await runloop.sleep_ms(0)\n';

  for (const t of ['sp_when_tilt', 'sp_when_gesture', 'sp_when_orient', 'sp_start', 'sp_when_color', 'sp_when_force', 'sp_when_dist', 'sp_when_button', 'sp_when_timer', 'sp_when_cond', 'sp_when_message']) S[t] = () => '';

  const sgn = (d) => (String(d) === '-1' ? '-' : '');
  // 單位換成「馬達轉的度數」運算式
  const degExpr = (n, unit) => (unit === 'rot' ? `round((${n}) * 360)` : unit === 'deg' ? `round(${n})`
    : unit === 'in' ? `round((${n}) * 2.54 * DEG_PER_CM)` : `round((${n}) * DEG_PER_CM)`);

  /* 馬達 */
  S.sp_motor_run = (b) => {
    const p = PORT(f(b, 'PORT')), n = v(b, 'N'), u = f(b, 'UNIT'), d = sgn(f(b, 'DIR'));
    return u === 'sec' ? `await motor.run_for_time(${p}, round((${n}) * 1000), ${d}motor_speed[${p}])\n`
      : `await motor.run_for_degrees(${p}, ${d}${u === 'rot' ? `round((${n}) * 360)` : `round(${n})`}, motor_speed[${p}])\n`;
  };
  S.sp_motor_goto = (b) => `await motor.run_to_absolute_position(${PORT(f(b, 'PORT'))}, round(${v(b, 'POS')}) % 360, abs(motor_speed[${PORT(f(b, 'PORT'))}]), direction=${{ short: 'motor.SHORTEST_PATH', cw: 'motor.CLOCKWISE', ccw: 'motor.COUNTERCLOCKWISE' }[f(b, 'MODE')]})\n`;
  S.sp_motor_start = (b) => `motor.run(${PORT(f(b, 'PORT'))}, ${sgn(f(b, 'DIR'))}motor_speed[${PORT(f(b, 'PORT'))}])\n`;
  S.sp_motor_stop = (b) => `motor.stop(${PORT(f(b, 'PORT'))})\n`;
  S.sp_motor_speed_set = (b) => `motor_speed[${PORT(f(b, 'PORT'))}] = round((${v(b, 'P')}) * 10)\n`;
  S.sp_motor_pos = (b) => call(`motor.absolute_position(${PORT(f(b, 'PORT'))})`);
  S.sp_motor_speed = (b) => [`round(motor.velocity(${PORT(f(b, 'PORT'))}) / 10)`, PO.FUNCTION_CALL];
  S.sp_motor_relpos = (b) => call(`motor.relative_position(${PORT(f(b, 'PORT'))})`);
  S.sp_motor_setrel = (b) => `motor.reset_relative_position(${PORT(f(b, 'PORT'))}, round(${v(b, 'N')}))\n`;
  S.sp_motor_turn = (b) => `await motor.run_for_degrees(${PORT(f(b, 'PORT'))}, round(${v(b, 'DEG')}), 500)\n`;

  /* 移動 */
  S.sp_move = (b) => {
    const n = v(b, 'N'), u = f(b, 'UNIT'), d = sgn(f(b, 'DIR'));
    return u === 'sec' ? `await motor_pair.move_for_time(${PAIR}, round((${n}) * 1000), 0, velocity=${d}move_speed)\n`
      : `await motor_pair.move_for_degrees(${PAIR}, ${degExpr(n, u)}, 0, velocity=${d}move_speed)\n`;
  };
  S.sp_start_move = (b) => `motor_pair.move(${PAIR}, 0, velocity=${sgn(f(b, 'DIR'))}move_speed)\n`;
  S.sp_steer_for = (b) => {
    const n = v(b, 'N'), u = f(b, 'UNIT'), st = v(b, 'STEER');
    return u === 'sec' ? `await motor_pair.move_for_time(${PAIR}, round((${n}) * 1000), ${st}, velocity=move_speed)\n`
      : `await motor_pair.move_for_degrees(${PAIR}, ${degExpr(n, u)}, ${st}, velocity=move_speed)\n`;
  };
  S.sp_steer = (b) => `motor_pair.move(${PAIR}, ${v(b, 'STEER')}, velocity=move_speed)\n`;
  S.sp_tank = (b) => `motor_pair.move_tank(${PAIR}, round((${v(b, 'L')}) * 10), round((${v(b, 'R')}) * 10))\n`;
  S.sp_stop = () => `motor_pair.stop(${PAIR})\n`;
  S.sp_set_speed = (b) => `move_speed = round((${v(b, 'P')}) * 10)\n`;
  S.sp_set_pair = (b) => {
    const [l, r] = f(b, 'PAIR').split('+');
    return `motor_pair.pair(${PAIR}, ${PORT(l)}, ${PORT(r)})\n`;
  };
  S.sp_set_distance = (b) => `DEG_PER_CM = 360 / (${v(b, 'CM')})\n`;
  S.sp_turn = (b) => `await motor_pair.move_for_degrees(${PAIR}, round((${v(b, 'DEG')}) * TURN), ${f(b, 'DIR') === '-1' ? '-100' : '100'}, velocity=move_speed)\n`;

  /* 燈光 */
  const IMG = (id) => `light_matrix.IMAGE_${SP.IMAGES[id][0]}`;
  S.sp_light_image = (b) => `light_matrix.show_image(${IMG(f(b, 'IMG'))})\n`;
  S.sp_light_image_for = (b) => `light_matrix.show_image(${IMG(f(b, 'IMG'))})\nawait runloop.sleep_ms(round((${v(b, 'S')}) * 1000))\nlight_matrix.clear()\n`;
  S.sp_light_text = (b) => `await light_matrix.write(str(${v(b, 'T', "''")}))\n`;
  S.sp_light_off = () => 'light_matrix.clear()\n';
  S.sp_light_bright = (b) => `# 燈陣亮度 ${'(' + v(b, 'B') + ')'}：Python 請在 write、set_pixel 的 intensity 參數指定\n`;
  S.sp_light_pixel = (b) => `light_matrix.set_pixel(round(${v(b, 'X')}) - 1, round(${v(b, 'Y')}) - 1, round(${v(b, 'B')}))\n`;
  S.sp_light_rotate = (b) => `light_matrix.set_orientation((light_matrix.get_orientation() ${f(b, 'DIR') === '-1' ? '+ 3' : '+ 1'}) % 4)\n`;
  S.sp_light_orient = (b) => `light_matrix.set_orientation(${f(b, 'Q')})\n`;
  S.sp_power_light = (b) => `light.color(light.POWER, ${f(b, 'C')})\n`;
  S.sp_say = (b) => `print(${v(b, 'T', "''")})\n`;
  S.sp_light_pattern = (b) => `light_matrix.show_image(${IMG({ heart: 1, smile: 4, sad: 5, up: 27, check: 13, cross: 14 }[f(b, 'PAT')])})\n`;

  /* 聲音 */
  const FREQ = (n) => `round(440 * 2 ** ((${n} - 69) / 12))`;
  S.sp_beep = (b) => `await sound.beep(${FREQ(v(b, 'NOTE'))}, round((${v(b, 'S')}) * 1000), 100)\n`;
  S.sp_beep_start = (b) => `sound.beep(${FREQ(v(b, 'NOTE'))}, 600000, 100)\n`;
  S.sp_stop_sound = () => 'sound.stop()\n';

  /* 控制 */
  S.sp_wait = (b) => `await runloop.sleep_ms(round((${v(b, 'S')}) * 1000))\n`;
  S.sp_wait_until = (b) => `await runloop.until(lambda: ${v(b, 'C', 'False')})\n`;
  S.sp_forever = (b) => `while True:\n${P.addLoopTrap(P.statementToCode(b, 'DO') || P.PASS, b)}`;
  S.sp_repeat_until = (b) => `while not (${v(b, 'C', 'False')}):\n${P.addLoopTrap(P.statementToCode(b, 'DO') || P.PASS, b)}`;
  S.sp_stop_other = () => '# 停止其他積木堆疊：Python 沒有直接對應（可以用全域變數讓其他函式自己結束）\n';
  S.sp_stop_mode = (b) => ({ all: 'raise SystemExit\n', this: 'return\n', other: '# 停止其他積木堆疊：Python 沒有直接對應\n' }[f(b, 'MODE')]);
  S.sp_stop_program = () => 'raise SystemExit\n';

  /* 感測 */
  const CMP = { '<': '<', '=': '==', '>': '>' };
  S.sp_color_is = (b) => [`color_sensor.color(${PORT(f(b, 'PORT'))}) == color.${COLORS[f(b, 'COLOR')]}`, PO.RELATIONAL];
  S.sp_color = (b) => call(`color_sensor.color(${PORT(f(b, 'PORT'))})`);
  S.sp_reflect_is = (b) => [`color_sensor.reflection(${PORT(f(b, 'PORT'))}) ${CMP[f(b, 'OP')]} ${v(b, 'N')}`, PO.RELATIONAL];
  S.sp_light = (b) => call(`color_sensor.reflection(${PORT(f(b, 'PORT'))})`);
  const forceCond = (p, st) => (st === 'hard' ? [`force_sensor.force(${p}) >= 50`, PO.RELATIONAL] : st === 'released' ? [`not force_sensor.pressed(${p})`, PO.LOGICAL_NOT] : [`force_sensor.pressed(${p})`, PO.FUNCTION_CALL]);
  S.sp_pressed_is = (b) => forceCond(PORT(f(b, 'PORT')), f(b, 'STATE'));
  S.sp_force_val = (b) => (f(b, 'UNIT') === 'pct' ? call(`force_sensor.force(${PORT(f(b, 'PORT'))})`) : [`force_sensor.force(${PORT(f(b, 'PORT'))}) / 10`, PO.MULTIPLICATIVE]);
  const distIn = (p, unit) => (unit === 'in' ? `distance_sensor.distance(${p}) / 25.4` : unit === 'pct' ? `distance_sensor.distance(${p}) / 20` : `distance_sensor.distance(${p}) / 10`);
  S.sp_dist_is = (b) => {
    const p = PORT(f(b, 'PORT')), u = f(b, 'UNIT'), d = distIn(p, u), n = v(b, 'N');
    const mode = f(b, 'MODE');
    return [mode === 'closer' ? `0 <= distance_sensor.distance(${p}) and ${d} < ${n}` : mode === 'farther' ? `${d} > ${n}` : `round(${d}) == round(${n})`, PO.LOGICAL_AND];
  };
  S.sp_dist = (b) => [`round(${distIn(PORT(f(b, 'PORT')), f(b, 'UNIT') || 'cm')}, 1)`, PO.FUNCTION_CALL];
  S.sp_angle = (b) => {
    const ax = f(b, 'AXIS');
    if (ax === 'yaw') return [`round(${SP.yawSign === -1 ? '' : '-'}motion_sensor.tilt_angles()[0] / 10)`, PO.FUNCTION_CALL];
    return [`round(motion_sensor.tilt_angles()[${ax === 'pitch' ? 1 : 2}] / 10)`, PO.FUNCTION_CALL];
  };
  S.sp_yaw = () => [`round(${SP.yawSign === -1 ? '' : '-'}motion_sensor.tilt_angles()[0] / 10)`, PO.FUNCTION_CALL];
  S.sp_reset_yaw = () => 'motion_sensor.reset_yaw(0)\n';
  const TILT_PY = { forward: 'motion_sensor.tilt_angles()[1] <= -150', backward: 'motion_sensor.tilt_angles()[1] >= 150', left: 'motion_sensor.tilt_angles()[2] <= -150', right: 'motion_sensor.tilt_angles()[2] >= 150',
    any: '(abs(motion_sensor.tilt_angles()[1]) >= 150 or abs(motion_sensor.tilt_angles()[2]) >= 150)', flat: '(abs(motion_sensor.tilt_angles()[1]) < 150 and abs(motion_sensor.tilt_angles()[2]) < 150)' };
  const GEST_PY = { shaken: 'motion_sensor.SHAKEN', tapped: 'motion_sensor.TAPPED', falling: 'motion_sensor.FALLING' };
  const FACE_PY = ['TOP', 'FRONT', 'RIGHT', 'BOTTOM', 'BACK', 'LEFT'];
  S.sp_tilt_is = (b) => [TILT_PY[f(b, 'DIR')], PO.RELATIONAL];
  S.sp_gesture_is = (b) => [`motion_sensor.gesture() == ${GEST_PY[f(b, 'G')]}`, PO.RELATIONAL];
  S.sp_orient_is = (b) => [`motion_sensor.up_face() == motion_sensor.${FACE_PY[Number(f(b, 'Q'))]}`, PO.RELATIONAL];
  S.sp_dist_light = (b) => `distance_sensor.show(${PORT(f(b, 'PORT'))}, [round(${v(b, 'A')}), round(${v(b, 'B')}), round(${v(b, 'C')}), round(${v(b, 'D')})])\n`;
  S.sp_button_is = (b) => [`button.pressed(button.${f(b, 'SIDE').toUpperCase()}) > 0`, PO.RELATIONAL];
  S.sp_timer = () => ['(time.ticks_ms() - timer_start) / 1000', PO.MULTIPLICATIVE];
  S.sp_reset_timer = () => 'timer_start = time.ticks_ms()\n';
  S.sp_force = (b) => call(`force_sensor.pressed(${PORT(f(b, 'PORT'))})`);
  S.sp_dist_less = (b) => {
    const d = `distance_sensor.distance(${PORT(f(b, 'PORT'))})`, n = `(${v(b, 'N')}) * 10`;
    return [f(b, 'OP') === '<' ? `0 <= ${d} < ${n}` : `${d} > ${n}`, PO.RELATIONAL];
  };
  S.sp_between = (b) => [`(${v(b, 'B')}) <= (${v(b, 'A')}) <= (${v(b, 'C')})`, PO.RELATIONAL];
  S.sp_join = (b) => [`str(${v(b, 'A', "''")}) + str(${v(b, 'B', "''")})`, PO.ADDITIVE];
  S.sp_letter = (b) => [`str(${v(b, 'T', "''")})[round(${v(b, 'N')}) - 1]`, PO.MEMBER];
  S.sp_length = (b) => call(`len(str(${v(b, 'T', "''")}))`);
  S.sp_contains = (b) => [`str(${v(b, 'C', "''")}) in str(${v(b, 'T', "''")})`, PO.RELATIONAL];

  /* 訊息 */
  S.sp_broadcast = (b) => `broadcast(${q(f(b, 'MSG'))})\n`;
  S.sp_broadcast_wait = (b) => `await broadcast_and_wait(${q(f(b, 'MSG'))})\n`;

  // 我的積木 → async def / await
  const oDef = S.procedures_defnoreturn, oCall = S.procedures_callnoreturn;
  S.procedures_defnoreturn = function (b, g) {
    const r = oDef.call(this, b, g), k = '%' + g.getProcedureName(b.getFieldValue('NAME'));
    if (g.definitions_[k]) g.definitions_[k] = g.definitions_[k].replace(/^def /m, 'async def ');
    return r;
  };
  S.procedures_callnoreturn = function (b, g) { return 'await ' + oCall.call(this, b, g); };

  const indent = (t) => P.prefixLines(t.replace(/\n$/, '') || 'pass', P.INDENT) + '\n';

  SP.generatePython = function (ws, cfg) {
    P.init(ws);
    ws.getTopBlocks(true).filter((b) => b.type === 'procedures_defnoreturn').forEach((b) => P.blockToCode(b));
    const hats = ws.getTopBlocks(true).filter(SP.isHat);
    const vars = ws.getAllVariables().map((x) => P.getVariableName(x.getId()));
    const globals = ['move_speed', 'motor_speed', 'DEG_PER_CM', 'timer_start'].concat(vars);
    const lines = [], names = [], recv = {};
    let usesMsg = false;
    const loop = (cond, body, end) =>
      `while True:\n${P.INDENT}await runloop.until(lambda: ${cond})\n${indent(body)}${P.INDENT}await runloop.until(lambda: ${end})\n`;
    hats.forEach((h, i) => {
      const first = h.getNextBlock();
      let body = first ? P.blockToCode(first) : '';
      if (Array.isArray(body)) body = body[0];
      const PT = f(h, 'PORT') && PORT(f(h, 'PORT'));
      let inner, c;
      if (h.type === 'sp_when_color') { c = `color_sensor.color(${PT}) == color.${COLORS[f(h, 'COLOR')]}`; inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_force') { c = forceCond(PT, { down: 'pressed', hard: 'hard', up: 'released' }[f(h, 'STATE')] || 'pressed')[0]; inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_dist') {
        const d = distIn(PT, 'pct'), n = v(h, 'N');
        c = f(h, 'OP') === '<' ? `0 <= distance_sensor.distance(${PT}) and ${d} < ${n}` : `${d} > ${n}`; inner = loop(c, body, `not (${c})`);
      } else if (h.type === 'sp_when_button') {
        const pr = `button.pressed(button.${f(h, 'SIDE').toUpperCase()}) > 0`; c = f(h, 'STATE') === 'down' ? pr : `not (${pr})`; inner = loop(c, body, `not (${c})`);
      } else if (h.type === 'sp_when_timer') { c = `(time.ticks_ms() - timer_start) / 1000 > ${v(h, 'N')}`; inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_tilt') { c = TILT_PY[f(h, 'DIR')]; inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_gesture') { c = `motion_sensor.gesture() == ${GEST_PY[f(h, 'G')]}`; inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_orient') { c = `motion_sensor.up_face() == motion_sensor.${FACE_PY[Number(f(h, 'Q'))]}`; inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_cond') { c = v(h, 'C', 'False'); inner = loop(c, body, `not (${c})`); }
      else if (h.type === 'sp_when_message') {
        usesMsg = true; const m = q(f(h, 'MSG')); recv[f(h, 'MSG')] = (recv[f(h, 'MSG')] || 0) + 1;
        inner = `seen = 0\nwhile True:\n${P.INDENT}await runloop.until(lambda: messages.get(${m}, 0) > seen)\n${P.INDENT}seen += 1\n${indent(body)}${P.INDENT}handled[${m}] = handled.get(${m}, 0) + 1\n`;
      } else inner = body.replace(/\n$/, '') ? body : 'pass\n';
      lines.push(`async def thread_${i}():\n${P.INDENT}global ${globals.join(', ')}\n${P.prefixLines(inner.replace(/\n$/, ''), P.INDENT)}\n`);
      names.push(`thread_${i}()`);
    });
    const joined = lines.join('');
    if (/\bbroadcast(_and_wait)?\(/.test(joined)) usesMsg = true;
    const allDefs = Object.keys(P.definitions_).filter((k) => k !== 'variables').map((k) => P.definitions_[k]).join('\n').split('\n');
    const imps = allDefs.filter((l) => /^(import|from) /.test(l)), rest = allDefs.filter((l) => !/^(import|from) /.test(l)).join('\n').trim();
    const used = (re) => re.test(joined) || re.test(rest);
    const head = [
      'from hub import port, light_matrix, motion_sensor, sound, button, light',
      'import color, color_sensor, distance_sensor, force_sensor, motor, motor_pair, orientation, runloop, time',
      ...imps,
      '',
      `# 輪徑 ${cfg.wheel} 公分、輪距 ${cfg.track} 公分`,
      'DEG_PER_CM = 360 / 17.5   # 1 圈馬達旋轉 = 17.5 公分（可用「設定 1 圈馬達旋轉 = … 公分」校正）',
      `TURN = ${cfg.track} / ${cfg.wheel}              # 原地轉 1 度，輪子要轉幾度`,
      'move_speed = 500   # 度/秒（設定移動速度 50 %，約 10 度/秒 = 1 %）',
      'motor_speed = {port.A: 750, port.B: 750, port.C: 750, port.D: 750, port.E: 750, port.F: 750}   # 馬達預設 75 %',
      'timer_start = 0',
      ...vars.map((x) => `${x} = 0`),
      ...(usesMsg ? ['messages = {}', 'handled = {}', `receivers = ${JSON.stringify(recv).replace(/"/g, '"')}`, '',
        'def broadcast(name):', '    messages[name] = messages.get(name, 0) + 1', '',
        'async def broadcast_and_wait(name):', '    n = messages.get(name, 0) + 1', '    messages[name] = n',
        '    await runloop.until(lambda: handled.get(name, 0) >= n * receivers.get(name, 0))'] : []),
      '',
      `motor_pair.pair(${PAIR}, port.A, port.B)`,
      '',
    ].join('\n');
    const code = head + (rest ? rest + '\n\n' : '') + '\n' + joined + `\nrunloop.run(${names.join(', ')})\n`;
    return { code, threads: hats.length };
  };
})(window.SP = window.SP || {});
