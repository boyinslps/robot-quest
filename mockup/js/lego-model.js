/* Lego Quest（實體積木組裝關）：狀態機與計時（純邏輯，不碰畫面，方便驗證）
 *
 * 流程：count（看積木清單，學生自己檢查數量）→ countdown → building → finished | timeout → waiting_check
 *
 * 清點只是「展示圖表」，沒有勾選、沒有缺件回報：考試開始後積木有缺是學生自己的責任（老師決定）。
 * 「完成」只能在最後一步（第 12 步）按；時間到會自動結束。
 *
 * 狀態是一包可以存進 sessionStorage 的資料；transition(state, event, now) 不會改動傳進來的 state。
 */
(function (RQ) {
  'use strict';

  const M = (RQ.LegoModel = {});

  M.PHASES = ['count', 'countdown', 'building', 'finished', 'timeout', 'waiting_check'];

  /** 載入資料後的檢查：totalPieces 要等於各零件數量總和，說明書頁面要都有。回傳錯誤文字陣列（空 = 沒問題）。 */
  M.validateObject = function (obj) {
    const errs = [];
    if (!obj || typeof obj !== 'object') return ['沒有物件資料'];
    if (!Array.isArray(obj.parts) || !obj.parts.length) errs.push('零件清單是空的');
    if (!Array.isArray(obj.steps) || !obj.steps.length) errs.push('沒有說明書頁面');
    const sum = (obj.parts || []).reduce((s, p) => s + (Number(p.qty) || 0), 0);
    if (obj.totalPieces !== sum) errs.push(`零件總數不符：資料寫 ${obj.totalPieces} 顆，各零件加起來是 ${sum} 顆`);
    const bags = (obj.parts || []).map((p) => p.bag);
    if (new Set(bags).size !== bags.length) errs.push('有重複的袋子編號');
    return errs;
  };

  /** 新的一份狀態。cfg：{ gateStart, timeCapSec, showSeconds } */
  M.initial = function (obj, cfg, now) {
    return {
      v: 2,
      objectId: obj.id,
      phase: 'count',
      cfg: {
        gateStart: !!cfg.gateStart,
        timeCapSec: cfg.timeCapSec || obj.defaultTimeCapSec || 720,
        showSeconds: !!cfg.showSeconds,
      },
      totalSteps: obj.steps.length,
      gate: false,
      enteredAt: now,
      startPressedAt: null,
      t0: null,
      endAt: null,
      step: 1,
      maxStep: 1,
      stepSince: null,
      dwell: new Array(obj.steps.length).fill(0),
      backNav: 0,
      zoom: 0,
      finishedAtStep: null,
      timedOut: false,
    };
  };

  const clone = (s) => JSON.parse(JSON.stringify(s));
  const bad = (s, why) => ({ state: s, error: why });

  function addDwell(s, now) {
    if (s.stepSince !== null) s.dwell[s.step - 1] += Math.max(0, now - s.stepSince);
    s.stepSince = null;
  }

  /**
   * 狀態轉移。回傳 { state } 或 { state（原樣）, error }。
   * event.type：GATE_OPEN START COUNTDOWN_DONE STEP ZOOM_OPEN ZOOM_CLOSE FINISH TIMEOUT CONTINUE
   */
  M.transition = function (state, ev, now) {
    const s = clone(state);
    const p = s.phase;
    switch (ev.type) {
      case 'GATE_OPEN': {
        if (p !== 'count') return bad(state, '已經開始了，不用放行');
        s.gate = true;
        return { state: s };
      }
      case 'START': {
        if (p !== 'count') return bad(state, `在「${p}」不能開始組裝`);
        if (s.cfg.gateStart && !s.gate) return bad(state, '老師還沒放行');
        s.phase = 'countdown';
        s.startPressedAt = now;
        return { state: s };
      }
      case 'COUNTDOWN_DONE': {
        if (p !== 'countdown') return bad(state, `在「${p}」不能開始計時`);
        s.phase = 'building';
        s.t0 = now;
        s.step = 1;
        s.maxStep = 1;
        s.stepSince = now;
        return { state: s };
      }
      case 'STEP': {
        if (p !== 'building') return bad(state, `在「${p}」不能翻頁`);
        const to = ev.to;
        if (!(to >= 1 && to <= s.totalSteps) || to === s.step) return bad(state, '頁數不正確');
        addDwell(s, now);
        if (to < s.step) s.backNav++;
        s.step = to;
        s.maxStep = Math.max(s.maxStep, to);
        s.stepSince = now;
        return { state: s };
      }
      case 'ZOOM_OPEN':
        if (p !== 'building') return bad(state, `在「${p}」不能放大`);
        s.zoom++;
        return { state: s };
      case 'ZOOM_CLOSE':
        if (p !== 'building') return bad(state, `在「${p}」不能關閉放大`);
        return { state: s };
      case 'FINISH':
      case 'TIMEOUT': {
        if (p !== 'building') return bad(state, `在「${p}」不能結束組裝`);
        const timeout = ev.type === 'TIMEOUT';
        // 「完成」只能在最後一步按（老師決定）；時間到不受限
        if (!timeout && s.step < s.totalSteps) return bad(state, `要翻到最後一步（第 ${s.totalSteps} 步）才能按完成`);
        const capEnd = s.t0 + s.cfg.timeCapSec * 1000;
        const end = timeout ? capEnd : Math.min(now, capEnd); // 按完成時剛好超過上限，也算逾時
        addDwell(s, end);
        s.endAt = end;
        s.finishedAtStep = s.step;
        s.timedOut = timeout || now >= capEnd;
        s.phase = s.timedOut ? 'timeout' : 'finished';
        return { state: s };
      }
      case 'CONTINUE': {
        if (p !== 'finished' && p !== 'timeout') return bad(state, `在「${p}」不能繼續`);
        s.phase = 'waiting_check';
        return { state: s };
      }
      default:
        return bad(state, `不認得的事件：${ev.type}`);
    }
  };

  /** 組裝剩餘毫秒（只在 building 有意義；其他階段回傳整段上限） */
  M.remainingMs = function (s, now) {
    const cap = s.cfg.timeCapSec * 1000;
    if (s.t0 === null) return cap;
    const end = s.endAt !== null ? s.endAt : now;
    return Math.max(0, cap - (end - s.t0));
  };

  /**
   * 重新整理後還原：時間由絕對時間推算，不會重置也不會延長。
   * 倒數中重新整理 → 回到 count（倒數不計時，再按一次開始）。組裝中但時間已經過了 → 直接逾時。
   */
  M.restore = function (state, now) {
    let s = clone(state);
    if (s.v !== 2) return null; // 舊版存檔（有勾選、缺件）格式不同，不還原
    if (s.phase === 'countdown') { s.phase = 'count'; s.startPressedAt = null; }
    if (s.phase === 'building' && now >= s.t0 + s.cfg.timeCapSec * 1000) {
      const r = M.transition(s, { type: 'TIMEOUT' }, now);
      if (!r.error) s = r.state;
    }
    // 組裝中重新整理：stepSince 維持原值，所以離開頁面的那段時間仍算在目前這一步（和總計時一致）
    return s;
  };

  /** 組裝結果摘要（上傳用） */
  M.result = function (s) {
    const r = {
      objectId: s.objectId,
      phase: s.phase,
      cfg: { timeCapSec: s.cfg.timeCapSec, gateStart: s.cfg.gateStart },
      count: {
        enteredAt: s.enteredAt, // 進入清點頁
        startedAt: s.startPressedAt, // 按下「開始組裝」
        durationMs: s.startPressedAt ? s.startPressedAt - s.enteredAt : null, // 看積木清單花了多久
      },
    };
    if (s.t0 !== null) {
      r.build = {
        t0: s.t0,
        endAt: s.endAt,
        durationMs: s.endAt !== null ? s.endAt - s.t0 : null,
        timedOut: s.timedOut,
        finishedAtStep: s.finishedAtStep,
        stepDwellMs: s.dwell.map((x) => Math.round(x)),
        backNavCount: s.backNav,
        zoomCount: s.zoom,
        maxStepReached: s.maxStep,
      };
    }
    return r;
  };

  /** 老師後台用：用文字說明目前的狀態 */
  M.statusText = function (s) {
    switch (s.phase) {
      case 'count': return s.cfg.gateStart && !s.gate ? '準備中，等放行' : '準備中（檢查積木）';
      case 'countdown': return '倒數中';
      case 'building': return `組裝中（第 ${s.step} 步）`;
      case 'finished': case 'timeout': case 'waiting_check': return s.timedOut ? '逾時，待檢查' : '已完成，待檢查';
      default: return s.phase;
    }
  };
})((window.RQ = window.RQ || {}));
