/* Firebase 設定（學生端上傳成績、教師後台讀取，共用這一份）
 *
 * 這份 apiKey 不是密碼，本來就會公開在網頁裡；真正的保護是 firestore.rules（誰能讀、誰能寫）。
 * 設成 null = 不連線：學生端只存在本機、教師後台只能匯入 JSON 檔。
 * 詳細步驟見 FIREBASE_SETUP.md。
 */
window.RQ_FIREBASE = {
  apiKey: 'AIzaSyAe3yJ56zWYzP9gTzTTRM-yvfWfBbEesJc',
  authDomain: 'robot-9dae4.firebaseapp.com',
  projectId: 'robot-9dae4',
  storageBucket: 'robot-9dae4.firebasestorage.app',
  messagingSenderId: '723629076114',
  appId: '1:723629076114:web:b3879347bb421d1f65404b',
};
