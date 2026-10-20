/* Lego Quest（實體積木組裝關）計分（教師後台用；純邏輯，不碰畫面）
 *
 * 老師檢查作品後，只要在四個等級裡勾一個，分數由這裡決定（要調整分數只改 GRADES）：
 *   完全正確 100　部分錯誤 95　較多錯誤 90　未完成 80
 * 分差刻意拉小：這一關是實體操作，主要看有沒有完成、做得細不細心，不要因為差一點就拉開太多。
 *
 * 用時、步驟停留時間等只給老師參考，不計分（規格書原本的速度、細心、逐步驟檢查改成這個簡化版）。
 */
(function (RQ) {
  'use strict';

  const GRADES = [
    { key: 'perfect', label: '完全正確', score: 100, hint: '每一步都對，沒有多或少的積木' },
    { key: 'partial', label: '部分錯誤', score: 95, hint: '做完了，有一兩處錯' },
    { key: 'many', label: '較多錯誤', score: 90, hint: '做完了，但錯的地方很多' },
    { key: 'incomplete', label: '未完成', score: 80, hint: '時間到、或自己放棄，沒有做完' },
  ];
  const byKey = (k) => GRADES.find((g) => g.key === k) || null;

  /** 老師的勾選 → 分數（沒有勾選回傳 null） */
  function scoreOf(check) {
    const g = check && byKey(check.grade);
    return g ? g.score : null;
  }

  /** 後台個人報告用：回傳 { score, label } 或 null */
  function score(check) {
    const g = check && byKey(check.grade);
    return g ? { score: g.score, label: g.label, grade: g.key } : null;
  }

  RQ.AssemblyScoring = { GRADES, byKey, scoreOf, score };
})((window.RQ = window.RQ || {}));
