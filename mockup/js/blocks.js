/* Blockly 積木定義、主題、程式轉換（不使用 zelos，避免像 Scratch） */
(function (RQ) {
  'use strict';

  const SIDE_LABEL = { front: '前方', left: '左方', right: '右方' };
  const IS_LABEL = { wall: '是牆', line: '是黑線', bottle: '有寶特瓶', cargo: '有貨物' };
  const COLOR_LABEL = { red: '紅色', green: '綠色', blue: '藍色' };

  // 下拉選單依關卡開放的選項變動
  RQ.blockOpts = { sides: ['front'], is: ['wall'], colors: ['red', 'green'] };

  RQ.theme = Blockly.Theme.defineTheme('robotquest', {
    base: Blockly.Themes.Classic,
    blockStyles: {
      start_blocks: { colourPrimary: '#4a4f57', colourSecondary: '#6b7078', colourTertiary: '#2f3338' },
      action_blocks: { colourPrimary: '#2f7a67', colourSecondary: '#5e9e8d', colourTertiary: '#1f5145' },
      grip_blocks: { colourPrimary: '#8a6a2f', colourSecondary: '#ad9160', colourTertiary: '#5e4820' },
      loop_blocks: { colourPrimary: '#a24f3c', colourSecondary: '#c07c6c', colourTertiary: '#6e3528' },
      logic_blocks: { colourPrimary: '#3d5a78', colourSecondary: '#6a829b', colourTertiary: '#283c50' },
      sensor_blocks: { colourPrimary: '#6a7a2e', colourSecondary: '#909d5f', colourTertiary: '#47521f' },
    },
    componentStyles: {
      workspaceBackgroundColour: '#f7f5ef',
      toolboxBackgroundColour: '#e6e1d5',
      flyoutBackgroundColour: '#e6e1d5',
      flyoutOpacity: 1,
      scrollbarColour: '#b9b2a3',
      insertionMarkerColour: '#222',
      insertionMarkerOpacity: 0.3,
    },
    fontStyle: { family: '"Microsoft JhengHei", "Noto Sans TC", "PingFang TC", sans-serif', weight: 'bold', size: 12 },
    startHats: false,
  });

  function def(type, json, extra) {
    Blockly.Blocks[type] = {
      init() {
        this.jsonInit(json);
        if (extra) extra.call(this);
      },
    };
  }

  const stmt = { previousStatement: null, nextStatement: null };
  const img = (name, color) => ({ type: 'field_image', src: RQ.iconURI(name, color), width: 20, height: 20, alt: '' });
  const dropdown = (name, values) => ({ type: 'field_dropdown', name, options: values.map((v) => [String(v), String(v)]) });

  def('rq_start', {
    message0: '%1 機器人程式 %2 %3',
    args0: [img('robot'), { type: 'input_dummy' }, { type: 'input_statement', name: 'BODY' }],
    style: 'start_blocks',
  }, function () { this.setDeletable(false); });

  def('rq_move', { message0: '%1 往前走 1 格', args0: [img('up')], ...stmt, style: 'action_blocks' });
  def('rq_move_n', { message0: '%1 往前走 %2 格', args0: [img('up'), dropdown('N', [1, 2, 3, 4, 5, 6, 7, 8, 9])], ...stmt, style: 'action_blocks' });
  def('rq_left', { message0: '%1 向左轉', args0: [img('turnL')], ...stmt, style: 'action_blocks' });
  def('rq_right', { message0: '%1 向右轉', args0: [img('turnR')], ...stmt, style: 'action_blocks' });
  def('rq_turn', { message0: '%1 旋轉 %2 度', args0: [img('rotate'), dropdown('DEG', [90, -90, 180, -180])], ...stmt, style: 'action_blocks' });
  def('rq_grab', { message0: '%1 夾取貨物', args0: [img('grab')], ...stmt, style: 'grip_blocks' });
  def('rq_drop', { message0: '%1 放下貨物', args0: [img('drop')], ...stmt, style: 'grip_blocks' });

  def('rq_repeat', {
    message0: '%1 重複 %2 次',
    args0: [img('loop'), dropdown('N', [2, 3, 4, 5, 6, 7, 8, 9])],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    ...stmt,
    style: 'loop_blocks',
  });

  def('rq_until', {
    message0: '%1 一直做，直到到達終點 %2',
    args0: [img('loop'), img('flag', '#222')],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    ...stmt,
    style: 'loop_blocks',
  });

  def('rq_ifelse', {
    message0: '如果 %1 就',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    message2: '不然就',
    message3: '%1',
    args3: [{ type: 'input_statement', name: 'ELSE' }],
    ...stmt,
    style: 'logic_blocks',
  });

  def('rq_if', {
    message0: '如果 %1 就',
    args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    ...stmt,
    style: 'logic_blocks',
  });

  Blockly.Blocks.rq_look = {
    init() {
      this.appendDummyInput()
        .appendField(new Blockly.FieldImage(RQ.iconURI('eye'), 20, 20, ''))
        .appendField('感測')
        .appendField(new Blockly.FieldDropdown(() => RQ.blockOpts.sides.map((s) => [SIDE_LABEL[s], s])), 'SIDE')
        .appendField(new Blockly.FieldDropdown(() => RQ.blockOpts.is.map((s) => [IS_LABEL[s], s])), 'IS');
      this.setOutput(true, 'Boolean');
      this.setStyle('sensor_blocks');
    },
  };

  Blockly.Blocks.rq_floor = {
    init() {
      this.appendDummyInput()
        .appendField(new Blockly.FieldImage(RQ.iconURI('eye'), 20, 20, ''))
        .appendField('地板是')
        .appendField(new Blockly.FieldDropdown(() => RQ.blockOpts.colors.map((c) => [COLOR_LABEL[c], c])), 'COLOR');
      this.setOutput(true, 'Boolean');
      this.setStyle('sensor_blocks');
    },
  };

  // ---------- 工具箱 ----------

  RQ.toolbox = function (types) {
    const o = RQ.blockOpts;
    const item = {
      move: { type: 'rq_move' },
      moveN: { type: 'rq_move_n', fields: { N: '1' } },
      turn: { type: 'rq_turn', fields: { DEG: '90' } },
      left: { type: 'rq_left' },
      right: { type: 'rq_right' },
      grab: { type: 'rq_grab' },
      drop: { type: 'rq_drop' },
      repeat: { type: 'rq_repeat', fields: { N: '2' } },
      until: { type: 'rq_until' },
      ifelse: { type: 'rq_ifelse' },
      if: { type: 'rq_if' },
      look: { type: 'rq_look', fields: { SIDE: o.sides[0], IS: o.is[0] } },
      floor: { type: 'rq_floor', fields: { COLOR: o.colors[0] } },
    };
    return {
      kind: 'flyoutToolbox',
      contents: types.map((t) => ({ kind: 'block', ...item[t] })),
    };
  };

  // ---------- 程式 ↔ 積木 ----------

  function condState(c) {
    if (!c) return null;
    if (c.t === 'floor') return { type: 'rq_floor', fields: { COLOR: c.color } };
    return { type: 'rq_look', fields: { SIDE: c.side, IS: c.is } };
  }
  function nodeState(n) {
    if (n.t === 'move' && (RQ.blockOpts.moveN || n.n > 1)) return { type: 'rq_move_n', fields: { N: String(n.n || 1) } };
    if (n.t === 'turn') return { type: 'rq_turn', fields: { DEG: String(n.deg) } };
    const simple = { move: 'rq_move', left: 'rq_left', right: 'rq_right', grab: 'rq_grab', drop: 'rq_drop' };
    if (simple[n.t]) return { type: simple[n.t] };
    const s = { inputs: {} };
    if (n.t === 'repeat') { s.type = 'rq_repeat'; s.fields = { N: String(n.n) }; }
    if (n.t === 'until') s.type = 'rq_until';
    if (n.t === 'if') {
      s.type = n.else ? 'rq_ifelse' : 'rq_if';
      const c = condState(n.cond);
      if (c) s.inputs.COND = { block: c };
      if (n.else && n.else.length) s.inputs.ELSE = { block: chainState(n.else) };
    }
    const body = n.body || n.then;
    if (body && body.length) s.inputs.DO = { block: chainState(body) };
    return s;
  }
  function chainState(list) {
    let head = null;
    let cur = null;
    list.forEach((n) => {
      const s = nodeState(n);
      if (!head) head = s;
      else cur.next = { block: s };
      cur = s;
    });
    return head;
  }

  // 建立「機器人程式」積木，裡面放 prog
  RQ.loadProgram = function (ws, prog) {
    ws.clear();
    const start = { type: 'rq_start', x: 24, y: 24, deletable: false };
    const body = chainState(RQ.normalize(prog || []));
    if (body) start.inputs = { BODY: { block: body } };
    Blockly.serialization.blocks.append(start, ws);
  };

  // 只載入單一塊（說明卡示範用）
  RQ.loadLoose = function (ws, stateList) {
    ws.clear();
    let y = 16;
    stateList.forEach((s) => {
      Blockly.serialization.blocks.append({ ...s, x: 16, y }, ws);
      y += 60;
    });
  };
  RQ.nodeState = nodeState;
  RQ.chainState = chainState;
  RQ.condState = condState;

  function compileChain(block) {
    const out = [];
    while (block) {
      out.push(compileBlock(block));
      block = block.getNextBlock();
    }
    return out;
  }
  function compileCond(b) {
    if (!b) return null;
    if (b.type === 'rq_floor') return { t: 'floor', color: b.getFieldValue('COLOR') };
    return { t: 'look', side: b.getFieldValue('SIDE'), is: b.getFieldValue('IS') };
  }
  function compileBlock(b) {
    const id = b.id;
    switch (b.type) {
      case 'rq_move': return { t: 'move', id };
      case 'rq_move_n': return { t: 'move', id, n: Number(b.getFieldValue('N')) };
      case 'rq_turn': return { t: 'turn', id, deg: Number(b.getFieldValue('DEG')) };
      case 'rq_left': return { t: 'left', id };
      case 'rq_right': return { t: 'right', id };
      case 'rq_grab': return { t: 'grab', id };
      case 'rq_drop': return { t: 'drop', id };
      case 'rq_repeat': return { t: 'repeat', id, n: Number(b.getFieldValue('N')), body: compileChain(b.getInputTargetBlock('DO')) };
      case 'rq_until': return { t: 'until', id, body: compileChain(b.getInputTargetBlock('DO')) };
      case 'rq_ifelse':
      case 'rq_if':
        return {
          t: 'if',
          id,
          cond: compileCond(b.getInputTargetBlock('COND')),
          then: compileChain(b.getInputTargetBlock('DO')),
          else: b.type === 'rq_ifelse' ? compileChain(b.getInputTargetBlock('ELSE')) : null,
        };
      default:
        throw new Error('未知積木 ' + b.type);
    }
  }

  RQ.startBlock = (ws) => ws.getTopBlocks(false).find((b) => b.type === 'rq_start');

  RQ.compile = function (ws) {
    const start = RQ.startBlock(ws);
    return start ? compileChain(start.getInputTargetBlock('BODY')) : [];
  };

  // 去掉 id，存檔／紀錄用
  RQ.stripIds = function strip(prog) {
    return (prog || []).map((n) => {
      const o = { ...n };
      delete o.id;
      if (o.body) o.body = strip(o.body);
      if (o.then) o.then = strip(o.then);
      if (o.else) o.else = strip(o.else);
      return o;
    });
  };

  RQ.blockCount = (ws) => ws.getAllBlocks(false).filter((b) => b.type !== 'rq_start').length;


  // ---------- 右鍵選單：積木 → 複製、剪下、刪除；空白處 → 貼上 ----------
  // 這個 Blockly 版本沒有預設選項（加註解、摺疊、停用…都不會出現），所以只註冊我們要的。
  // 動作直接用 Blockly 的快捷鍵（Ctrl+C／X／V／Delete），先選取該積木再呼叫。
  const CM = Blockly.ContextMenuRegistry;
  const runShortcut = (name, ws, block) => {
    const sc = Blockly.ShortcutRegistry.registry.getRegistry()[name];
    if (block) Blockly.common.setSelected(block);
    return sc.callback(ws, new Event('contextmenu'), sc, {});
  };
  const usable = (s) => (s.block.type === 'rq_start' || s.block.isInFlyout ? 'hidden' : 'enabled');
  CM.registry.reset();
  CM.registry.register({ id: 'rq_copy', scopeType: CM.ScopeType.BLOCK, weight: 1, displayText: '複製', preconditionFn: usable, callback: (s) => runShortcut('copy', s.block.workspace, s.block) });
  CM.registry.register({ id: 'rq_cut', scopeType: CM.ScopeType.BLOCK, weight: 2, displayText: '剪下', preconditionFn: usable, callback: (s) => runShortcut('cut', s.block.workspace, s.block) });
  CM.registry.register({ id: 'rq_delete', scopeType: CM.ScopeType.BLOCK, weight: 3, displayText: '刪除', preconditionFn: usable, callback: (s) => runShortcut('delete', s.block.workspace, s.block) });
  CM.registry.register({
    id: 'rq_paste',
    scopeType: CM.ScopeType.WORKSPACE,
    weight: 1,
    displayText: '貼上',
    preconditionFn: (s) => (s.workspace.options.readOnly || s.workspace.isFlyout ? 'hidden' : s.workspace.remainingCapacity() > 0 ? 'enabled' : 'disabled'),
    callback: (s) => runShortcut('paste', s.workspace),
  });
})((window.RQ = window.RQ || {}));
