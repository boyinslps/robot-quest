/* 教師後台：資料層（Firebase 或本機）
 *
 * 集合（Firestore）：
 *   submissions/{場次__班級_座號}   程式關：學生端上傳的作答紀錄（老師只讀）
 *   reviews/{同上}                  程式關：老師的加減分與備註
 *   scores/{班級_座號}              每位學生的組裝、面試分數（老師手動輸入）與最後決定
 *   config/main                     三關權重、組裝／面試的評分項目
 *
 * 雲端模式：firebase-config.js 有填 → Google 登入（要在 firestore.rules 的教師名單）→ 即時讀寫
 * 本機模式：沒填，或網址加 ?local → 資料只存在這台電腦的 localStorage，程式關靠匯入 JSON
 */
(function () {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const cfg = window.RQ_FIREBASE;
  const clean = (s) => String(s === undefined || s === null ? '' : s).replace(/[^0-9A-Za-z一-鿿]/g, '');

  const DEFAULT_CONFIG = {
    weights: { assembly: 30, program: 40, interview: 30 }, // 百分比：三關各自 0–100 分，再依權重加總（舊版預設 1:1:1 會自動換成這組）
    items: { assembly: [], interview: [] }, // [{name, max}]；空 = 直接輸入 0–100 分
  };

  const T = (window.RQT = {
    cloudConfigured: !!(cfg && cfg.projectId) && !/[?&]local\b/.test(location.search),
    cloud: new Map(), // submissions（雲端）
    local: new Map(), // 匯入的 JSON
    reviews: new Map(),
    scores: new Map(),
    config: JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    user: null,
    fb: null,
    onChange: () => {},
    onNotice: () => {},
    onUser: () => {},
  });

  T.keyOf = (cls, seat) => `${clean(cls)}_${Number(seat)}`;
  T.docIdOf = (sub) => sub.docId || `${clean(sub.sessionCode) || 'default'}__${T.keyOf(sub.student && sub.student.class, sub.student && sub.student.seat)}`;
  T.allSubs = () => new Map([...T.local, ...T.cloud]);
  T.useCloud = () => !!(T.cloudConfigured && T.user && T.fb);
  T.canEdit = () => !T.cloudConfigured || !!T.user;

  const tsToMs = (t) => {
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    const d = Date.parse(t);
    return Number.isNaN(d) ? 0 : d;
  };

  const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 忽略 */ } };

  T.errMsg = (e) => {
    if (e && e.code === 'permission-denied') return '沒有寫入權限：請確認 firestore.rules 已更新（含 scores、config）並按「發布」，且登入的 Gmail 在教師名單裡。';
    return (e && (e.code || e.message)) || '未知錯誤';
  };

  // ---------- 本機資料 ----------

  function loadLocal() {
    Object.entries(lsGet('rqt_reviews', {})).forEach(([k, v]) => T.reviews.set(k, v));
    Object.entries(lsGet('rqt_scores', {})).forEach(([k, v]) => T.scores.set(k, v));
    const c = lsGet('rqt_config', null);
    if (c) T.config = mergeConfig(c);
  }
  function mergeConfig(c) {
    let w = { ...DEFAULT_CONFIG.weights, ...((c && c.weights) || {}) };
    // 舊版預設是 1:1:1（沒有人手動設定過）→ 換成新預設 組裝 30／程式 40／面試 30
    if (['assembly', 'program', 'interview'].every((k) => Number(w[k]) === 1)) w = { ...DEFAULT_CONFIG.weights };
    return {
      weights: w,
      items: { assembly: (c && c.items && c.items.assembly) || [], interview: (c && c.items && c.items.interview) || [] },
    };
  }
  const persistLocal = () => {
    lsSet('rqt_reviews', Object.fromEntries(T.reviews));
    lsSet('rqt_scores', Object.fromEntries(T.scores));
    lsSet('rqt_config', T.config);
  };

  // ---------- 雲端連線 ----------

  T.init = async function () {
    if (!T.cloudConfigured) { loadLocal(); T.onChange(); return; }
    const [app, auth, fs] = await Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js'),
    ]);
    const a = app.initializeApp(cfg);
    T.fb = { db: fs.getFirestore(a), fs, auth: auth.getAuth(a), authMod: auth };
    auth.onAuthStateChanged(T.fb.auth, (u) => {
      T.user = u && !u.isAnonymous ? u : null; // 學生的匿名登入不算老師
      T.onUser();
      if (T.user) subscribe(); else unsubscribe();
    });
  };

  T.login = async () => {
    const { auth, authMod } = T.fb;
    await authMod.signInWithPopup(auth, new authMod.GoogleAuthProvider());
  };
  T.logout = () => T.fb.authMod.signOut(T.fb.auth);

  let unsubs = [];
  function unsubscribe() {
    unsubs.forEach((f) => f());
    unsubs = [];
    T.cloud.clear(); T.reviews.clear(); T.scores.clear();
    T.config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    T.onChange();
  }
  function subscribe() {
    unsubscribe();
    const { db, fs } = T.fb;
    const onErr = (label) => (e) => {
      console.warn(label, e);
      if (e && e.code === 'permission-denied') {
        const rulesNew = label === 'scores' || label === 'config';
        T.onNotice(`<b>沒有讀取「${label}」的權限（${T.user.email}）。</b>${rulesNew ? '請把新版 firestore.rules 的 scores、config 兩段貼進 Firebase 主控台並按「發布」（見 FIREBASE_SETUP.md）。' : '請確認 firestore.rules 的教師名單有這個 Gmail，而且已按「發布」。'}`, true);
      } else T.onNotice('讀取失敗：' + (e && e.message), true);
    };
    unsubs.push(fs.onSnapshot(fs.collection(db, 'submissions'), (snap) => {
      T.onNotice('');
      T.cloud.clear();
      snap.forEach((d) => { const v = d.data(); v.docId = d.id; v.updatedAtMs = tsToMs(v.updatedAt); T.cloud.set(d.id, v); });
      T.onChange();
    }, onErr('submissions')));
    unsubs.push(fs.onSnapshot(fs.collection(db, 'reviews'), (snap) => {
      T.reviews.clear();
      snap.forEach((d) => T.reviews.set(d.id, d.data()));
      T.onChange();
    }, onErr('reviews')));
    unsubs.push(fs.onSnapshot(fs.collection(db, 'scores'), (snap) => {
      T.scores.clear();
      snap.forEach((d) => { const v = d.data(); v.updatedAtMs = tsToMs(v.updatedAt); T.scores.set(d.id, v); });
      T.onChange();
    }, onErr('scores')));
    unsubs.push(fs.onSnapshot(fs.doc(db, 'config', 'main'), (snap) => {
      T.config = snap.exists() ? mergeConfig(snap.data()) : JSON.parse(JSON.stringify(DEFAULT_CONFIG));
      T.onChange();
    }, onErr('config')));
  }

  // ---------- 匯入 JSON（程式關） ----------

  T.importFiles = async (files) => {
    let n = 0;
    const bad = [];
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        (Array.isArray(data) ? data : [data]).forEach((sub) => {
          if (!sub || !sub.student || !sub.levels) return;
          sub.status = sub.status || 'done';
          sub.docId = T.docIdOf(sub);
          T.local.set(sub.docId, sub);
          n++;
        });
      } catch (e) { bad.push(f.name); }
    }
    T.onChange();
    return { n, bad };
  };

  // ---------- 寫入 ----------

  const nowBy = () => (T.user ? T.user.email : '本機');

  /** 儲存某位學生某一關（assembly / interview）的分數。data = { score, items, note }；score 為 null 代表清除 */
  T.saveStage = async (person, stage, data) => {
    const rec = { score: data.score, items: data.items || {}, note: data.note || '', by: nowBy(), at: Date.now() };
    if (data.grade) rec.grade = data.grade; // 組裝：老師勾選的等級（完全正確／部分錯誤／較多錯誤／未完成）
    const base = { class: String(person.cls), seat: Number(person.seat), grade: person.grade ? Number(person.grade) : 0 };
    if (T.useCloud()) {
      const { db, fs } = T.fb;
      await fs.setDoc(fs.doc(db, 'scores', person.key), { ...base, [stage]: rec, updatedAt: fs.serverTimestamp() }, { mergeFields: ['class', 'seat', 'grade', stage, 'updatedAt'] });
    } else {
      const cur = T.scores.get(person.key) || {};
      T.scores.set(person.key, { ...cur, ...base, [stage]: rec, updatedAtMs: Date.now() });
      persistLocal();
      T.onChange();
    }
  };

  T.saveDecision = async (person, decision) => {
    const base = { class: String(person.cls), seat: Number(person.seat), grade: person.grade ? Number(person.grade) : 0 };
    if (T.useCloud()) {
      const { db, fs } = T.fb;
      await fs.setDoc(fs.doc(db, 'scores', person.key), { ...base, decision, updatedAt: fs.serverTimestamp() }, { mergeFields: ['class', 'seat', 'grade', 'decision', 'updatedAt'] });
    } else {
      T.scores.set(person.key, { ...(T.scores.get(person.key) || {}), ...base, decision, updatedAtMs: Date.now() });
      persistLocal();
      T.onChange();
    }
  };

  /** 程式關的加減分與備註 */
  T.saveReview = async (id, rev) => {
    if (T.useCloud()) {
      const { db, fs } = T.fb;
      await fs.setDoc(fs.doc(db, 'reviews', id), { adjust: rev.adjust, note: rev.note, by: T.user.email, updatedAt: fs.serverTimestamp() });
    } else {
      T.reviews.set(id, rev);
      persistLocal();
      T.onChange();
    }
  };

  T.saveConfig = async (c) => {
    const next = mergeConfig(c);
    if (T.useCloud()) {
      const { db, fs } = T.fb;
      await fs.setDoc(fs.doc(db, 'config', 'main'), next);
    } else {
      T.config = next;
      persistLocal();
      T.onChange();
    }
  };

  /** 刪除一位學生的全部資料（程式紀錄、評語、組裝／面試分數） */
  T.deletePerson = async (person) => {
    const subIds = [...T.allSubs()].filter(([, s]) => s.student && T.keyOf(s.student.class, s.student.seat) === person.key).map(([id]) => id);
    if (T.useCloud()) {
      const { db, fs } = T.fb;
      await Promise.all(subIds.filter((id) => T.cloud.has(id)).map((id) => fs.deleteDoc(fs.doc(db, 'submissions', id))));
      await Promise.all(subIds.map((id) => fs.deleteDoc(fs.doc(db, 'reviews', id)).catch(() => {})));
      await fs.deleteDoc(fs.doc(db, 'scores', person.key)).catch(() => {});
    }
    subIds.forEach((id) => { T.local.delete(id); T.reviews.delete(id); });
    T.scores.delete(person.key);
    if (!T.useCloud()) persistLocal();
    T.onChange();
  };

  T.persistLocal = persistLocal;
})();
