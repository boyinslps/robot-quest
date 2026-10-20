/* Lego Quest（實體積木組裝關）設定。老師要改的話改這裡；也可以在網址後面加參數臨時覆寫（見 README）。 */
window.RQ_LEGO = {
  enabled: true, // false = 不做 Lego Quest，登入後直接進 Robot Quest
  objectId: 'guitar', // 做哪個作品；資料在 assets/<objectId>/<objectId>.json
  timeCapSec: null, // 組裝時間上限（秒）；null = 用作品資料裡的預設（吉他 720 秒 = 12 分鐘）
  gateStart: false, // false（預設）：清點完學生就能按「開始組裝」，開始時間由老師現場口頭管理。true：要老師放行（用老師密碼面板）學生才能按
  showSeconds: false, // false：只顯示剩餘時間的進度條，不顯示數字（降低焦慮）
  seededShortages: {}, // 選配：依座號故意少放積木，測學生會不會發現。例：{ 3: { bag: 'C', short: 1 } }
  // 老師密碼（SHA-256）。預設是 1234，請換掉：開瀏覽器主控台（F12）輸入 RQ.lego.hash('你的新密碼')，把結果貼在這裡。
  // 這只是防學生誤按，不是正式的資安機制。
  pinHash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
};
