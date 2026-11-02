/* 積木 → Python（SPIKE App 3 風格的 API：hub / motor_pair / color_sensor / runloop …） */
(function (SP) {
  'use strict';
  const P = python.pythonGenerator, PO = python.Order;
  const S = P.forBlock;
  const v = (b, n, d = '0') => P.valueToCode(b, n, PO.NONE) || d;
  const f = (b, n) => b.getFieldValue(n);
  const q = (s) => JSON.stringify(String(s));
  const COLORS = { black: 'BLACK', white: 'WHITE', red: 'RED', yellow: 'YELLOW', green: 'GREEN', blue: 'BLUE' };
  const IMAGES = { heart: 'IMAGE_HEART', smile: 'IMAGE_HAPPY', sad: 'IMAGE_SAD', up: 'IMAGE_ARROW_N', check: 'IMAGE_YES', cross: 'IMAGE_NO' };
  const PORT = (p) => 'port.' + p;
  const PAIR = 'motor_pair.PAIR_1';

  P.INDENT = '    ';
  P.INFINITE_LOOP_TRAP = 'await runloop.sleep_ms(0)\n';

  for (const t of ['sp_start', 'sp_when_color', 'sp_when_force', 'sp_when_dist', 'sp_when_message', 'sp_when_timer']) S[t] = () => '';
  S.sp_move = (b) => {
    const d = f(b, 'DIR') === '-1' ? -1 : 1, n = v(b, 'N'), sgn = d < 0 ? '-' : '';
    const u = f(b, 'UNIT');
    if (u === 'sec') return `await motor_pair.move_for_time(${PAIR}, round((${n}) * 1000), 0, velocity=${sgn}speed)\n`;
    const deg = u === 'rot' ? `round((${n}) * 360)` : `round((${n}) * CM)`;
    return `await motor_pair.move_for_degrees(${PAIR}, ${deg}, 0, velocity=${sgn}speed)\n`;
  };
  S.sp_turn = (b) => `await motor_pair.move_for_degrees(${PAIR}, round((${v(b, 'DEG')}) * TURN), ${f(b, 'DIR') === '-1' ? '-100' : '100'}, velocity=speed)\n`;
  S.sp_start_move = (b) => `motor_pair.move(${PAIR}, 0, velocity=${f(b, 'DIR') === '-1' ? '-' : ''}speed)\n`;
  S.sp_steer = (b) => `motor_pair.move(${PAIR}, ${v(b, 'STEER')}, velocity=speed)\n`;
  S.sp_stop = () => `motor_pair.stop(${PAIR})\n`;
  S.sp_set_speed = (b) => `speed = round((${v(b, 'P')}) * 10)\n`;
  S.sp_motor_turn = (b) => `await motor.run_for_degrees(${PORT(f(b, 'PORT'))}, round(${v(b, 'DEG')}), speed)\n`;
  S.sp_motor_start = (b) => f(b, 'PORT').split('').map((p) => `motor.run(${PORT(p)}, round((${v(b, 'P')}) * 10))\n`).join('');
  S.sp_motor_stop = (b) => f(b, 'PORT').split('').map((p) => `motor.stop(${PORT(p)})\n`).join('');
  S.sp_motor_pos = (b) => [`motor.relative_position(${PORT(f(b, 'PORT'))})`, PO.FUNCTION_CALL];
  S.sp_light_pattern = (b) => `light_matrix.show_image(light_matrix.${IMAGES[f(b, 'PAT')]})\n`;
  S.sp_light_text = (b) => `await light_matrix.write(str(${v(b, 'T', "''")}))\n`;
  S.sp_light_pixel = (b) => `light_matrix.set_pixel(round(${v(b, 'X')}) - 1, round(${v(b, 'Y')}) - 1, round(${v(b, 'B')}))\n`;
  S.sp_light_off = () => 'light_matrix.clear()\n';
  S.sp_say = (b) => `print(${v(b, 'T', "''")})\n`;
  S.sp_beep = (b) => `await sound.beep(round(440 * 2 ** ((${v(b, 'NOTE')} - 69) / 12)), round((${v(b, 'S')}) * 1000), 100)\n`;
  S.sp_wait = (b) => `await runloop.sleep_ms(round((${v(b, 'S')}) * 1000))\n`;
  S.sp_wait_until = (b) => `await runloop.until(lambda: ${v(b, 'C', 'False')})\n`;
  S.sp_forever = (b) => `while True:\n${P.addLoopTrap(P.statementToCode(b, 'DO') || P.PASS, b)}`;
  S.sp_repeat_until = (b) => `while not (${v(b, 'C', 'False')}):\n${P.addLoopTrap(P.statementToCode(b, 'DO') || P.PASS, b)}`;
  S.sp_color_is = (b) => [`color_sensor.color(${PORT(f(b, 'PORT'))}) == color.${COLORS[f(b, 'COLOR')]}`, PO.RELATIONAL];
  S.sp_light = (b) => [`color_sensor.reflection(${PORT(f(b, 'PORT'))})`, PO.FUNCTION_CALL];
  S.sp_dist = (b) => [`distance_sensor.distance(${PORT(f(b, 'PORT'))}) / 10`, PO.MULTIPLICATIVE];
  S.sp_dist_less = (b) => {
    const d = `distance_sensor.distance(${PORT(f(b, 'PORT'))})`, n = `(${v(b, 'N')}) * 10`;
    return [f(b, 'OP') === '<' ? `0 <= ${d} < ${n}` : `${d} > ${n}`, PO.RELATIONAL];
  };
  S.sp_force = (b) => [`force_sensor.pressed(${PORT(f(b, 'PORT'))})`, PO.FUNCTION_CALL];
  S.sp_yaw = () => ['motion_sensor.tilt_angles()[0] // 10', PO.MULTIPLICATIVE];
  S.sp_reset_yaw = () => 'motion_sensor.reset_yaw(0)\n';
  S.sp_timer = () => ['(time.ticks_ms() - timer_start) / 1000', PO.MULTIPLICATIVE];
  S.sp_reset_timer = () => 'timer_start = time.ticks_ms()\n';
  S.sp_broadcast = (b) => `broadcast(${q(f(b, 'MSG'))})\n`;
  S.sp_stop_program = () => 'raise SystemExit\n';

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
    const hats = ws.getTopBlocks(true).filter((b) => b.type === 'sp_start' || b.type.startsWith('sp_when_'));
    const vars = ws.getAllVariables().map((x) => P.getVariableName(x.getId()));
    const globals = ['speed', 'timer_start'].concat(vars);
    const lines = [];
    let usesMsg = false;
    const names = [];
    const loop = (cond, body, end) =>
      `while True:\n${P.INDENT}await runloop.until(lambda: ${cond})\n${indent(body)}${P.INDENT}await runloop.until(lambda: ${end})\n`;
    hats.forEach((h, i) => {
      const first = h.getNextBlock();
      let body = first ? P.blockToCode(first) : '';
      if (Array.isArray(body)) body = body[0];
      const PT = f(h, 'PORT') && PORT(f(h, 'PORT'));
      let inner;
      if (h.type === 'sp_when_color') {
        const c = `color_sensor.color(${PT}) == color.${COLORS[f(h, 'COLOR')]}`; inner = loop(c, body, `not (${c})`);
      } else if (h.type === 'sp_when_force') {
        const c = `${f(h, 'STATE') === 'down' ? '' : 'not '}force_sensor.pressed(${PT})`; inner = loop(c, body, `not (${c})`);
      } else if (h.type === 'sp_when_dist') {
        const n = `(${v(h, 'N')}) * 10`, c = f(h, 'OP') === '<' ? `0 <= distance_sensor.distance(${PT}) < ${n}` : `distance_sensor.distance(${PT}) > ${n}`;
        inner = loop(c, body, `not (${c})`);
      } else if (h.type === 'sp_when_timer') {
        const c = `(time.ticks_ms() - timer_start) / 1000 > ${v(h, 'N')}`; inner = loop(c, body, `not (${c})`);
      } else if (h.type === 'sp_when_message') {
        usesMsg = true;
        inner = `seen = 0\nwhile True:\n${P.INDENT}await runloop.until(lambda: messages.get(${q(f(h, 'MSG'))}, 0) > seen)\n${P.INDENT}seen += 1\n${indent(body)}`;
      } else inner = body.replace(/\n$/, '') ? body : 'pass\n';
      lines.push(`async def thread_${i}():\n${P.INDENT}global ${globals.join(', ')}\n${P.prefixLines(inner.replace(/\n$/, ''), P.INDENT)}\n`);
      names.push(`thread_${i}()`);
    });
    if (/\bbroadcast\(/.test(lines.join(''))) usesMsg = true;
    const allDefs = Object.keys(P.definitions_).filter((k) => k !== 'variables').map((k) => P.definitions_[k]).join('\n').split('\n');
    const imps = allDefs.filter((l) => /^(import|from) /.test(l)), rest = allDefs.filter((l) => !/^(import|from) /.test(l)).join('\n').trim();
    const head = [
      'from hub import port, light_matrix, motion_sensor, sound',
      'import color, color_sensor, distance_sensor, force_sensor, motor, motor_pair, runloop, time',
      ...imps,
      '',
      `# 輪徑 ${cfg.wheel} 公分、輪距 ${cfg.track} 公分`,
      `CM = 360 / (3.14159 * ${cfg.wheel})   # 每公分輪子要轉幾度`,
      `TURN = ${cfg.track} / ${cfg.wheel}              # 原地轉 1 度，輪子要轉幾度`,
      'speed = 500   # 度/秒（設定移動速度 50 %）',
      'timer_start = 0',
      ...vars.map((x) => `${x} = 0`),
      ...(usesMsg ? ['messages = {}', '', 'def broadcast(name):', '    messages[name] = messages.get(name, 0) + 1'] : []),
      '',
      `motor_pair.pair(${PAIR}, port.A, port.B)`,
      '',
    ].join('\n');
    const code = head + (rest ? rest + '\n\n' : '') + '\n' + lines.join('\n') + `\nrunloop.run(${names.join(', ')})\n`;
    return { code, threads: hats.length };
  };
})(window.SP = window.SP || {});
