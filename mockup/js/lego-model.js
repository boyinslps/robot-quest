/* Lego Quest（實體積木組裝關）：狀態機與計時（純邏輯，不碰畫面，方便驗證）
 *
 * 流程：count ⇄ ready → countdown → building → finished | timeout → waiting_check
 *       count/ready → shortage_pending（回報缺件）→ count（老師處理後）
 *
 * 狀態是一包可以存進 sessionStorage 的資料；transition(state, event, now) 不會改動傳進來的 state。
 */
(function (RQ) {
  'use strict';

  const M = (RQ.LegoModel = {});

  M.PHASES = ['count', 'ready', 'shortage_pending', 'countdown', 'building', 'finished', 'timeout', 'waiting_check'];
  const BUILD_DONE = ['finished', 'timeout', 'waiting_check'];

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

  /** 新的一份狀態。cfg：{ gateStart, timeCapSec, showSeconds, seeded }，seeded = 這位學生被故意少放的 { bag, short } 或 null */
  M.initial = function (obj, cfg, now) {
    const checks = {};
    obj.parts.forEach((p) => { checks[p.bag] = false; });
    return {
      v: 1,
      objectId: obj.id,
      phase: 'count',
      cfg: {
        gateStart: !!cfg.gateStart,
        timeCapSec: cfg.timeCapSec || obj.defaultTimeCapSec || 720,
        showSeconds: !!cfg.showSeconds,
        seeded: cfg.seeded || null,
      },
      totalSteps: obj.steps.length,
      bags: obj.parts.map((p) => p.bag),
      qty: Object.fromEntries(obj.parts.map((p) => [p.bag, p.qty])),
      checks,
      checkedAt: {},
      gate: false,
      enteredAt: now,
      readyAt: null,
      shortage: [], // { t, items:[{bag,short}], resolution?, via?, resolvedAt? }
      seededNoticed: null, // null = 沒有故意缺件；true／false = 學生有沒有發現
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

  const allChecked = (s) => s.bags.every((b) => s.checks[b]);
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const bad = (s, why) => ({ state: s, error: why });

  function addDwell(s, now) {
    if (s.stepSince !== null) s.dwell[s.step - 1] += Math.max(0, now - s.stepSince);
    s.stepSince = null;
  }

  /**
   * 狀態轉移。回傳 { state } 或 { state（原樣）, error }。
   * event.type：CHECK UNCHECK REPORT_SHORTAGE RESOLVE_SHORTAGE GATE_OPEN START COUNTDOWN_DONE STEP ZOOM_OPEN ZOOM_CLOSE FINISH TIMEOUT CONTINUE
   */
  M.transition = function (state, ev, now) {
    const s = clone(state);
    const p = s.phase;
    switch (ev.type) {
      case 'CHECK':
      case 'UNCHECK': {
        if (p !== 'count' && p !== 'ready') return bad(state, `在「${p}」不能勾選`);
        if (!(ev.bag in s.checks)) return bad(state, `沒有這個袋子：${ev.bag}`);
        const on = ev.type === 'CHECK';
        s.checks[ev.bag] = on;
        if (on) s.checkedAt[ev.bag] = now; else delete s.checkedAt[ev.bag];
        s.phase = allChecked(s) ? 'ready' : 'count';
        s.readyAt = s.phase === 'ready' ? now : null;
        return { state: s };
      }
      case 'REPORT_SHORTAGE': {
        if (p !== 'count' && p !== 'ready') return bad(state, `在「${p}」不能回報缺件`);
        const items = (ev.items || []).filter((i) => i && s.qty[i.bag] && i.short >= 1 && i.short <= s.qty[i.bag]);
        if (!items.length) return bad(state, '缺件內容不正確');
        s.shortage.push({ t: now, items });
        // 故意缺件：選對袋、數量相符才算發現
        if (s.cfg.seeded && s.seededNoticed !== true) {
          s.seededNoticed = items.some((i) => i.bag === s.cfg.seeded.bag && i.short === s.cfg.seeded.short);
        }
        s.phase = 'shortage_pending';
        return { state: s };
      }
      case 'RESOLVE_SHORTAGE': {
        if (p !== 'shortage_pending') return bad(state, `在「${p}」沒有待處理的缺件`);
        if (ev.result !== 'restocked' && ev.result !== 'false_alarm') return bad(state, '處理結果不正確');
        const last = s.shortage[s.shortage.length - 1];
        last.resolution = ev.result;
        last.via = ev.via || 'backend';
        last.resolvedAt = now;
        if (ev.result === 'restocked') { s.bags.forEach((b) => { s.checks[b] = false; }); s.checkedAt = {}; }
        s.phase = allChecked(s) ? 'ready' : 'count';
        s.readyAt = s.phase === 'ready' ? now : null;
        return { state: s };
      }
      case 'GATE_OPEN': {
        if (p === 'building' || BUILD_DONE.includes(p)) return bad(state, '已經開始了，不用放行');
        s.gate = true;
        return { state: s };
      }
      case 'START': {
        if (p !== 'ready') return bad(state, `在「${p}」不能開始組裝`);
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
        const capEnd = s.t0 + s.cfg.timeCapSec * 1000;
        const end = timeout ? capEnd : Math.min(now, capEnd); // 按完成時剛好超過上限，也算逾時前結束
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
   * 倒數中重新整理 → 回到 ready（倒數不計時，再按一次開始）。組裝中但時間已經過了 → 直接逾時。
   */
  M.restore = function (state, now) {
    let s = clone(state);
    if (s.phase === 'countdown') { s.phase = 'ready'; s.startPressedAt = null; }
    if (s.phase === 'building' && now >= s.t0 + s.cfg.timeCapSec * 1000) {
      const r = M.transition(s, { type: 'TIMEOUT' }, now);
      if (!r.error) s = r.state;
    }
    // 組裝中重新整理：stepSince 維持原值，所以離開頁面的那段時間仍算在目前這一步（和總計時一致）
    return s;
  };

  /** 組裝結果摘要（上傳用；見規格書第 11 節 AssemblyResult） */
  M.result = function (s) {
    const ready = s.readyAt;
    const r = {
      objectId: s.objectId,
      phase: s.phase,
      cfg: { timeCapSec: s.cfg.timeCapSec, gateStart: s.cfg.gateStart },
      count: {
        enteredAt: s.enteredAt,
        readyAt: ready,
        durationMs: ready ? ready - s.enteredAt : null,
        shortageReports: s.shortage.map((x) => ({ t: x.t, items: x.items, resolution: x.resolution || null, via: x.via || null })),
      },
    };
    if (s.cfg.seeded) r.count.seededShortage = { bag: s.cfg.seeded.bag, short: s.cfg.seeded.short, noticed: s.seededNoticed === true };
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
      case 'count': return '清點中';
      case 'ready': return s.cfg.gateStart && !s.gate ? '清點完，等放行' : '清點完，可以開始';
      case 'shortage_pending': return '缺件待處理';
      case 'countdown': return '倒數中';
      case 'building': return `組裝中（第 ${s.step} 步）`;
      case 'finished': case 'timeout': case 'waiting_check': return s.timedOut ? '逾時，待檢查' : '已完成，待檢查';
      default: return s.phase;
    }
  };
})((window.RQ = window.RQ || {}));
