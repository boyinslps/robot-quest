/* 評分標準（教師後台用；純邏輯，不碰畫面）
 *
 * 總分 100 分，五個面向：
 *   A 關卡完成度 55　第 1–8 關，越後面的關卡權重越高；沒過關但有往終點前進，給最多 25% 的部分分數
 *   B 解題品質   15　已過關的關卡，依星等（執行次數／積木數／改動塊數）加權
 *   C 觀念運用   10　已過關的關卡，最後的程式有沒有用到這關要學的積木
 *   D 獨立思考    5　沒有開「提示」就過關的關卡比例
 *   E 隱藏關卡   15　循線挑戰：練習地圖過關 7 分（沒過但有走一段給部分分）＋通用化 8 分（隱藏地圖也過）
 *
 * 另外算六項「能力」百分比，給老師看每個人強在哪、弱在哪（不影響總分）。
 * 老師可以在後台對個人加減分（review.adjust）、寫備註、標記入選與否。
 */
(function (RQ) {
  'use strict';

  const VERSION = 'rubric-2';

  // ---------- 程式樹工具（程式存的是 stripIds 之後的 {t, ...}） ----------

  function walk(prog, fn) {
    (prog || []).forEach((n) => {
      if (!n) return;
      fn(n);
      walk(n.body, fn);
      walk(n.then, fn);
      walk(n.else, fn);
    });
  }
  const has = (prog, pred) => {
    let found = false;
    walk(prog, (n) => { if (!found && pred(n)) found = true; });
    return found;
  };
  const hasType = (prog, t) => has(prog, (n) => n.t === t);

  // ---------- 關卡設定 ----------

  // concept：這關要學的新積木，最後的程式有用到才算「觀念運用」
  const LEVELS = {
    1: { weight: 3, skills: ['sequence'], concept: '向左／向右轉', used: (p) => hasType(p, 'left') || hasType(p, 'right') },
    2: { weight: 4, skills: ['loop'], concept: '重複 N 次', used: (p) => hasType(p, 'repeat') },
    // 權重跟著「第幾關」走（越後面越高），不跟著概念走；第 3–5 關：旋轉 → 如果 → 搬運
    3: { weight: 5, skills: ['sequence'], concept: '旋轉 X 度', used: (p) => hasType(p, 'turn') },
    4: { weight: 5, skills: ['condition', 'sensor'], concept: '如果…就…（偵測寶特瓶）', used: (p) => has(p, (n) => n.t === 'if' && n.cond && n.cond.t === 'look') },
    5: { weight: 6, skills: ['loop', 'sequence'], concept: '夾取＋放下', used: (p) => hasType(p, 'grab') && hasType(p, 'drop') },
    6: { weight: 6, skills: ['loop', 'abstraction'], concept: '一直做直到終點', used: (p) => hasType(p, 'until') },
    7: {
      weight: 11,
      skills: ['condition', 'sensor', 'abstraction', 'sequence'],
      concept: '綜合：夾取＋一直做＋同時偵測牆和寶特瓶',
      used: (p) => hasType(p, 'grab') && hasType(p, 'drop') && hasType(p, 'until')
        && has(p, (n) => n.t === 'if' && n.cond && n.cond.is === 'wall') && has(p, (n) => n.t === 'if' && n.cond && n.cond.is === 'bottle'),
    },
    8: { weight: 15, skills: ['debug', 'condition'], concept: '精準除錯（不是整段重寫）', used: null },
  };
  const TITLES = { 1: '轉個彎', 2: '爬樓梯', 3: '旋轉 X 度', 4: '寶特瓶轉彎', 5: '搬運任務', 6: '一直走到終點', 7: '倉庫配送', 8: '修好它（魔王關）' };
  const MAIN_IDS = Object.keys(LEVELS).map(Number);
  const WEIGHT_SUM = MAIN_IDS.reduce((s, i) => s + LEVELS[i].weight, 0); // 55

  const DIMENSIONS = [
    { key: 'A', name: '關卡完成度', max: 55, desc: '第 1–8 關是否過關，越後面權重越高（3、4、5、5、6、6、11、15）。沒過關但有往終點前進，最多拿該關 25%。' },
    { key: 'B', name: '解題品質', max: 15, desc: '已過關的關卡依星等加權：3 星 100%、2 星 67%、1 星 33%。星等看執行次數、積木數或除錯改動塊數。' },
    { key: 'C', name: '觀念運用', max: 10, desc: '已過關的關卡，最後交出的程式有用到這關要學的新積木（魔王關看有沒有整段重寫）。' },
    { key: 'D', name: '獨立思考', max: 5, desc: '沒有開「提示」就過關的關卡數 ÷ 8。' },
    { key: 'E', name: '隱藏關卡', max: 15, desc: '循線挑戰：練習地圖過關 7 分（沒過但有走一段按比例給 ≤4 分）＋通用化 8 分（隱藏地圖也過；沒過但有用感測器給 2 分）。' },
  ];

  const SKILLS = [
    { key: 'sequence', name: '循序與方向' },
    { key: 'loop', name: '重複（迴圈）' },
    { key: 'condition', name: '條件判斷' },
    { key: 'sensor', name: '感測器運用' },
    { key: 'debug', name: '除錯' },
    { key: 'abstraction', name: '抽象化／通用化' },
  ];

  const GRADES = [
    { min: 90, grade: 'S', label: '頂尖', pick: '優先入選' },
    { min: 80, grade: 'A', label: '優秀', pick: '優先入選' },
    { min: 65, grade: 'B', label: '良好', pick: '候選' },
    { min: 50, grade: 'C', label: '基礎', pick: '觀察' },
    { min: 30, grade: 'D', label: '待加強', pick: '觀察' },
    { min: 0, grade: 'E', label: '需協助', pick: '不建議' },
  ];

  const gradeOf = (total) => GRADES.find((g) => total >= g.min);

  // ---------- 評分 ----------

  const r1 = (x) => Math.round(x * 10) / 10;

  function levelMap(sub) {
    const m = {};
    (sub.levels || []).forEach((l) => { m[l.id] = l; });
    return m;
  }

  function score(sub, review) {
    const lm = levelMap(sub);
    const programs = sub.programs || {};
    const out = { version: VERSION, levels: [], flags: [] };

    let A = 0, B = 0, C = 0, noHint = 0;
    const skillGot = {};
    const skillMax = {};
    SKILLS.forEach((s) => { skillGot[s.key] = 0; skillMax[s.key] = 0; });
    let cleared = 0;
    let reached = 0;

    MAIN_IDS.forEach((id) => {
      const cfg = LEVELS[id];
      const l = lm[id];
      const row = { id, title: (l && l.title) || TITLES[id], concept: cfg.concept, weight: cfg.weight, visited: !!l, cleared: false, stars: 0, a: 0, b: 0, c: 0, usedConcept: null };
      let ach = 0; // 0..1，給能力雷達用
      if (l) {
        reached = id;
        Object.assign(row, {
          cleared: !!l.cleared, stars: l.stars || 0, runs: l.runs || 0, blocks: l.blocks, skipped: !!l.skipped,
          hint: !!l.hint, timeSpentMs: l.timeSpentMs, bestProgress: l.bestProgress || 0, exit: l.exit,
        });
        if (l.cleared) {
          cleared++;
          row.a = cfg.weight;
          row.b = (15 * cfg.weight * (l.stars || 1)) / (3 * WEIGHT_SUM);
          const prog = programs[id];
          const used = cfg.used ? hasProg(prog) && cfg.used(prog) : !l.rewrote;
          row.usedConcept = !!used;
          if (used) row.c = (10 * cfg.weight) / WEIGHT_SUM;
          if (!l.hint) noHint++;
          ach = 0.6 + 0.4 * ((l.stars || 1) / 3);
          if (!used) ach = Math.min(ach, 0.6);
        } else {
          row.a = 0.25 * Math.min(1, l.bestProgress || 0) * cfg.weight;
          ach = 0.25 * Math.min(1, l.bestProgress || 0);
        }
        // 過關太快：提醒老師留意（不扣分）
        if (l.cleared && id >= 3 && l.timeSpentMs !== undefined && l.timeSpentMs < 6000) {
          out.flags.push(`第 ${id} 關只花 ${Math.round(l.timeSpentMs / 1000)} 秒就過關，請留意`);
        }
        if (l.skipped) out.flags.push(`第 ${id} 關選擇跳過`);
      }
      A += row.a; B += row.b; C += row.c;
      cfg.skills.forEach((k) => { skillGot[k] += ach * cfg.weight; skillMax[k] += cfg.weight; });
      out.levels.push(row);
    });

    // 隱藏關卡
    const hl = lm[9];
    const sm = hl && hl.submitted;
    const hidden = { visited: !!hl, completed: false, generalized: false, e1: 0, e2: 0 };
    if (sm) {
      hidden.completed = !!sm.completed;
      hidden.generalized = !!sm.generalized;
      hidden.src = sm.src;
      hidden.blocks = sm.blocks;
      hidden.usesSensor = !!sm.usesSensor;
      hidden.progress = sm.progress || 0;
      hidden.e1 = sm.completed ? 7 : 4 * Math.min(1, sm.progress || 0);
      hidden.e2 = sm.generalized ? 8 : sm.usesSensor ? 2 : 0;
    }
    const E = hidden.e1 + hidden.e2;
    // 隱藏關卡的通用化也是「抽象化」能力
    skillMax.abstraction += 6; skillGot.abstraction += hidden.generalized ? 6 : sm ? (sm.completed ? 2 : 0) : 0;
    skillMax.sensor += 4; skillGot.sensor += sm ? (sm.usesSensor ? (hidden.generalized ? 4 : 2) : 0) : 0;
    out.hidden = hidden;

    const D = (5 * noHint) / MAIN_IDS.length;
    const dims = { A: r1(A), B: r1(B), C: r1(C), D: r1(D), E: r1(E) };
    const raw = Math.round((dims.A + dims.B + dims.C + dims.D + dims.E) * 10) / 10;
    const adjust = (review && Number(review.adjust)) || 0;
    const total = Math.max(0, Math.min(100, Math.round(raw + adjust)));
    const g = gradeOf(total);

    out.dims = dims;
    out.raw = raw;
    out.adjust = adjust;
    out.total = total;
    out.grade = g.grade;
    out.gradeLabel = g.label;
    out.pick = g.pick;
    out.cleared = cleared;
    out.reached = reached;
    out.skills = SKILLS.map((s) => ({ key: s.key, name: s.name, pct: skillMax[s.key] ? Math.round((100 * skillGot[s.key]) / skillMax[s.key]) : 0 }));
    out.survey = sub.survey || null;
    out.surveyText = surveyText(sub.survey);
    out.potential = potentialOf(sub.survey, cleared, total);
    out.comment = makeComment(sub, out);
    return out;
  }

  // ---------- 背景調查與潛力 ----------
  // 學生開場自評：有沒有玩過積木程式（Scratch、Blockly、LEGO…）、熟悉度 1–5。
  // 「沒接觸過（或自評 1 只在電腦課接觸過）」但在 10 分鐘內看說明就過了不少關 → 有潛力（學習速度快）。
  const POTENTIAL = {
    high: { cleared: 5, total: 65 }, // 任一達到
    some: { cleared: 3, total: 45 },
  };
  const isNovice = (sv) => !!sv && (sv.experience === 'no' || Number(sv.level) <= 1);
  function surveyText(sv) {
    if (!sv) return '未填';
    if (sv.experience !== 'yes') return '沒接觸過';
    return `有（${(sv.tools || []).join('、') || '—'}）自評 ${sv.level}／5`;
  }
  function potentialOf(sv, cleared, total) {
    if (!sv) return { tier: 0, label: '', reason: '' };
    if (!isNovice(sv)) return { tier: 0, label: '', reason: '' };
    const meet = (t) => cleared >= t.cleared || total >= t.total;
    const base = sv.experience === 'no' ? '沒接觸過積木程式' : '自評只有「只在電腦課接觸過」';
    if (meet(POTENTIAL.high)) return { tier: 2, label: '高潛力', reason: `${base}，10 分鐘內看說明就過了 ${cleared} 關（總分 ${total}），上手非常快。` };
    if (meet(POTENTIAL.some)) return { tier: 1, label: '有潛力', reason: `${base}，10 分鐘內看說明就過了 ${cleared} 關（總分 ${total}），學習速度不錯。` };
    return { tier: 0, label: '', reason: '' };
  }

  const hasProg = (p) => Array.isArray(p) && p.length > 0;

  function makeComment(sub, s) {
    const parts = [];
    parts.push(`共過 ${s.cleared} / ${MAIN_IDS.length} 關，總分 ${s.total}（${s.grade}・${s.gradeLabel}）。`);
    if (s.cleared < MAIN_IDS.length) {
      const stuck = s.levels.find((l) => !l.cleared);
      if (stuck && stuck.visited) parts.push(`卡在第 ${stuck.id} 關「${stuck.title}」（新概念：${stuck.concept}）。`);
      else if (stuck) parts.push(`時間到時還沒玩到第 ${stuck.id} 關。`);
    }
    const attempted = s.levels.filter((l) => l.visited).length > 0;
    if (attempted) {
      const strong = s.skills.filter((k) => k.pct >= 80).map((k) => k.name);
      const weak = s.skills.filter((k) => k.pct < 40).map((k) => k.name);
      if (strong.length) parts.push(`強項：${strong.join('、')}。`);
      if (weak.length) parts.push(`需加強：${weak.join('、')}。`);
    }
    const noConcept = s.levels.filter((l) => l.cleared && l.usedConcept === false).map((l) => l.id);
    if (noConcept.length) parts.push(`第 ${noConcept.join('、')} 關過關了，但沒有用到該關要學的新積木（用別的方法硬解）。`);
    const h = s.hidden;
    if (h.visited && h.completed && h.generalized) parts.push('隱藏關卡：通用程式在隱藏地圖也成功，抽象化能力突出。');
    else if (h.visited && h.completed) parts.push('隱藏關卡：練習地圖過關，但程式換地圖就失敗（偏向寫死路線）。');
    else if (h.visited) parts.push('隱藏關卡：有挑戰但沒走完。');
    if (s.potential.tier) parts.push(`【${s.potential.label}】${s.potential.reason}`);
    else if (s.survey && s.survey.experience === 'yes' && !isNovice(s.survey)) parts.push(`積木程式背景：${s.surveyText}。`);
    return parts.join('');
  }

  // ---------- 程式轉成中文文字（讓老師讀） ----------

  const COLOR = { red: '紅色', green: '綠色', blue: '藍色' };
  const SIDE = { front: '前方', left: '左邊', right: '右邊' };
  const IS = { wall: '是牆', line: '是黑線', bottle: '有寶特瓶' };
  function condText(c) {
    if (!c) return '（沒有條件）';
    if (c.t === 'floor') return `地板是${COLOR[c.color] || c.color}`;
    return `${SIDE[c.side] || c.side}${IS[c.is] || c.is}`;
  }
  function programText(prog, depth) {
    depth = depth || 0;
    const pad = '　'.repeat(depth);
    const lines = [];
    (prog || []).forEach((n) => {
      switch (n.t) {
        case 'move': lines.push(pad + (n.n ? `往前走 ${n.n} 格` : '往前走 1 格')); break;
        case 'left': lines.push(pad + '向左轉'); break;
        case 'right': lines.push(pad + '向右轉'); break;
        case 'turn': lines.push(pad + `旋轉 ${n.deg} 度`); break;
        case 'grab': lines.push(pad + '夾取'); break;
        case 'drop': lines.push(pad + '放下'); break;
        case 'repeat': lines.push(pad + `重複 ${n.n} 次`); lines.push(...programText(n.body, depth + 1)); break;
        case 'until': lines.push(pad + '一直做，直到到達終點'); lines.push(...programText(n.body, depth + 1)); break;
        case 'if':
          lines.push(pad + `如果 ${condText(n.cond)}`);
          lines.push(...programText(n.then, depth + 1));
          if (n.else) { lines.push(pad + '不然'); lines.push(...programText(n.else, depth + 1)); }
          break;
        default: lines.push(pad + String(n.t));
      }
    });
    return lines;
  }

  RQ.Scoring = { VERSION, POTENTIAL, surveyText, LEVELS, TITLES, MAIN_IDS, DIMENSIONS, SKILLS, GRADES, gradeOf, score, programText, WEIGHT_SUM };
})((window.RQ = window.RQ || {}));
