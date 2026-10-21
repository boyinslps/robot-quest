/* 學生端：把作答結果上傳到 Firebase Firestore（匿名登入，只能寫自己的那一筆）
 *
 * 沒有設定 firebase-config.js（RQ_FIREBASE = null）就不連線，RQ.cloud.enabled = false。
 * Firebase SDK 用動態 import 從 gstatic 載入，所以不需要打包，也不會拖慢學生端開啟速度。
 * 上傳失敗會存在 localStorage 的待傳佇列，之後自動重試。
 */
(function (RQ) {
  'use strict';

  const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  const QUEUE_KEY = 'rq_pending_upload';
  const cfg = window.RQ_FIREBASE;

  const cloud = (RQ.cloud = {
    enabled: !!(cfg && cfg.projectId),
    state: 'idle', // idle | sending | ok | fail
    onState: null,
  });

  // 文件代號：場次__班級_座號__登入代碼（中文、英數保留，其他符號拿掉，避免 / 之類的字元）
  // 登入代碼每次登入都不同，所以同一個班級座號再登入，會「新增一筆」，不會蓋掉前一筆。
  // 沒給登入代碼就是舊格式（場次__班級_座號）：以前已經存在資料庫裡的資料就是這個格式。
  cloud.docId = (session, cls, seat, attempt) => {
    const clean = (s) => String(s).replace(/[^0-9A-Za-z一-鿿]/g, '');
    return `${clean(session) || 'default'}__${clean(cls)}_${Number(seat)}` + (attempt ? `__${clean(attempt)}` : '');
  };

  function setState(s) {
    cloud.state = s;
    if (cloud.onState) cloud.onState(s);
  }

  let fb = null;
  function load() {
    if (fb) return fb;
    fb = (async () => {
      const [app, auth, fs] = await Promise.all([
        import(SDK + 'firebase-app.js'),
        import(SDK + 'firebase-auth.js'),
        import(SDK + 'firebase-firestore.js'),
      ]);
      const a = app.initializeApp(cfg);
      const au = auth.getAuth(a);
      if (!au.currentUser) await auth.signInAnonymously(au);
      return { db: fs.getFirestore(a), fs, uid: au.currentUser.uid };
    })();
    fb.catch(() => { fb = null; }); // 失敗後下次可以重試
    return fb;
  }

  // 待傳佇列：記憶體為主、localStorage 備份（瀏覽器擋 localStorage 時仍可運作）
  let mem;
  try { mem = JSON.parse(localStorage.getItem(QUEUE_KEY) || '{}'); } catch (e) { mem = {}; }
  const readQueue = () => mem;
  const writeQueue = (q) => {
    mem = q;
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* 忽略 */ }
  };

  // Firestore 單筆上限 1 MiB：事件太多時只留前面的，優先保住成績與程式
  function fit(sub) {
    const o = { ...sub };
    let size = JSON.stringify(o).length;
    if (size > 700000 && o.events) {
      o.events = o.events.slice(0, 1500);
      o.eventsTruncated = true;
      size = JSON.stringify(o).length;
      if (size > 900000) { delete o.events; o.eventsTruncated = true; }
    }
    return o;
  }

  async function sendOne(id, sub) {
    const { db, fs, uid } = await load();
    const data = fit(JSON.parse(JSON.stringify(sub))); // 去掉 undefined
    data.uid = uid;
    data.docId = id;
    data.updatedAt = fs.serverTimestamp();
    await fs.setDoc(fs.doc(db, 'submissions', id), data);
  }

  /** 上傳（或更新）一筆。status：'playing' 進行中、'done' 完成。失敗會進待傳佇列。 */
  cloud.upload = async function (id, sub, status) {
    if (!cloud.enabled) return false;
    const payload = { ...sub, status };
    if (status === 'playing') delete payload.events; // 進行中只傳關卡與程式，省流量
    const q = readQueue();
    q[id] = payload;
    writeQueue(q);
    return cloud.flush(status === 'done');
  };

  /** 把待傳佇列送出去。showState = true 時回報狀態（完成畫面用）。 */
  let flushing = null;
  cloud.flush = function (showState) {
    if (!cloud.enabled) return Promise.resolve(false);
    if (flushing) return flushing;
    flushing = (async () => {
      let ok = true;
      if (showState) setState('sending');
      // 一直送到佇列清空（送的途中又有新的進來也會一起送）
      for (let entry = Object.entries(readQueue())[0]; entry; entry = Object.entries(readQueue())[0]) {
        const [id, sub] = entry;
        try {
          await sendOne(id, sub);
          const q = readQueue();
          if (JSON.stringify(q[id]) === JSON.stringify(sub)) delete q[id]; // 送的期間被更新過就留著，下一輪再送
          writeQueue(q);
        } catch (e) {
          ok = false;
          console.warn('上傳失敗', id, e);
          break;
        }
      }
      if (showState) setState(ok ? 'ok' : 'fail');
      return ok;
    })().finally(() => { flushing = null; });
    return flushing;
  };

  if (cloud.enabled) {
    // 上次沒傳成功的，開頁面時再試一次
    window.addEventListener('load', () => { if (Object.keys(readQueue()).length) cloud.flush(false); });
  }
})((window.RQ = window.RQ || {}));
