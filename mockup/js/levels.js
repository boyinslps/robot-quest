/* 關卡資料（之後會搬到 levels/levelN.json）
 * 原則：一關只加一種新東西；每關只有一張地圖；可以混用前面學過的觀念。
 * maps：學生看得到的地圖（A 版）；B 版由 mirror 自動鏡像產生，程式的左右也一併對調。
 * hidden：隱藏關卡交出程式後，在背景測試的隱藏地圖（學生看不到結果）。
 * hiddenLevel：隱藏關卡，魔王關過關後才出現。
 *
 * 注意：這個檔案是公開的，會被送到學生的瀏覽器。
 * 參考解、錯誤解、寫死的做法都不放在這裡，放在不公開的 private/answers.js。
 */
(function (RQ) {
  'use strict';

  // 魔王關：路口轉彎方向看「左邊有寶特瓶」→ 右轉，不然左轉
  const junction = (side, a, b) => ({ if: { look: side, is: 'bottle' }, then: [{ turn: a }], else: [{ turn: b }] });
  // 魔王關預載程式的邏輯錯誤：感測的方向用錯（前方，應該是左邊）
  const FRONT_JUNCTION = junction('front', 90, -90);

  RQ.LEVELS = [
    // ---------- 0 暖身（不計時）----------
    {
      id: 0,
      title: '暖身',
      prompt: '把積木放進「機器人程式」，讓機器人走到終點',
      scored: false,
      mirror: 'h',
      maps: [{ name: '', grid: ['...G'], start: { r: 0, c: 0, dir: 'E' } }],
      blocks: ['move'],
      cards: ['move'],
      hint: '積木要接在「機器人程式」裡面才會執行。',
      stars: { type: 'none' },
    },

    // ---------- 1 向左轉、向右轉 ----------
    {
      id: 1,
      title: '轉個彎',
      prompt: '讓機器人走到終點',
      mirror: 'h',
      maps: [{
        name: '',
        grid: [
          '.####',
          '.####',
          '..G##',
          '#####',
        ],
        start: { r: 0, c: 0, dir: 'S' },
      }],
      blocks: ['move', 'left', 'right'],
      cards: ['turn'],
      hint: '先看看機器人一開始面向哪裡，想像你就是機器人。',
      stars: { type: 'runs' },
      expectFirstTurn: 'left', // A 版第一個轉彎該用哪個（B 版相反）；記錄「第一次就轉錯方向」用
    },

    // ---------- 2 重複 N 次 ----------
    {
      id: 2,
      title: '爬樓梯',
      prompt: '讓機器人爬到終點。積木用得越少，星星越多',
      mirror: 'h',
      maps: [{
        name: '',
        grid: [
          '#####',
          '####G',
          '###..',
          '##..#',
          '#..##',
          '..###',
        ],
        start: { r: 5, c: 0, dir: 'E' },
      }],
      blocks: ['move', 'left', 'right', 'repeat'],
      cards: ['repeat'],
      hint: '先一步一步走到終點也可以。再找找看：有沒有一組動作一直重複出現？',
      stars: { type: 'blocks', three: 5, two: 8 }, // 沒有硬性上限：笨方法也能過（1 星），找到規律才有 3 星
    },

    // ---------- 3 旋轉 X 度（只加這一個新東西；取代向左轉／向右轉）----------
    {
      id: 3,
      title: '旋轉 X 度',
      prompt: '用「旋轉 X 度」，讓機器人走到終點',
      mirror: 'h',
      maps: [{
        name: '',
        grid: [
          'G..#',
          '##.#',
          '#...',
        ],
        start: { r: 2, c: 3, dir: 'E' },
      }],
      blocks: ['move', 'turn', 'repeat'],
      cards: ['rotate'],
      turnGuide: true, // 左下角常駐「旋轉幾度」示意圖
      hint: '機器人一開始面向牆壁，要先轉到哪個方向？',
      stars: { type: 'runs' },
    },

    // ---------- 4 重複一組動作（不加新積木；練習「找規律＋重複」，當作寶特瓶轉彎的銜接）----------
    {
      id: 4,
      title: '繞一圈',
      prompt: '讓機器人走到終點。積木用得越少，星星越多',
      mirror: 'h',
      // 規律：「走 2 格、右轉」一直重複。下一關的地圖也是這種「一直走一段就轉彎」，但轉彎的位置不固定，要靠感測器。
      maps: [{
        name: '',
        grid: [
          '...#',
          '##.#',
          'G..#',
        ],
        start: { r: 0, c: 0, dir: 'E' },
      }],
      blocks: ['move', 'turn', 'repeat'],
      cards: [],
      hint: '一格一格走也可以。再看看：機器人是不是一直重複「走 2 格、轉彎」？',
      stars: { type: 'blocks', three: 5, two: 7 }, // 一格一格寫死也能過（1 星）；找到「走 2 格＋轉彎」重複才有 3 星
    },

    // ---------- 5 如果…就…不然就…（只加這一個新東西；用寶特瓶偵測，每個轉角前面都有寶特瓶）----------
    {
      id: 5,
      title: '寶特瓶轉彎',
      prompt: '前面有寶特瓶就右轉。積木用得越少，星星越多',
      mirror: 'h',
      maps: [{
        name: '',
        grid: [
          '....B',
          '###.#',
          '#G..#',
          '###B#',
        ],
        start: { r: 0, c: 0, dir: 'E' },
      }],
      blocks: ['move', 'turn', 'repeat', 'ifelse', 'look'],
      look: { sides: ['front'], is: ['bottle'] },
      cards: ['ifelse'],
      hint: '和上一關一樣是「走一段、轉彎」，但這次每一段長度不一樣。看地圖：每次要轉彎的地方，前面都有寶特瓶。可以先一格一格走，再想想怎麼讓機器人自己判斷。',
      stars: { type: 'blocks', three: 5, two: 7 }, // 第一次用「判斷」，沒有硬性上限：一格一格走也能過（1 星），用判斷才有 3 星
    },

    // ---------- 6 夾取、放下（WRO 搬運；已經學過旋轉 X 度，所以用「旋轉」）----------
    {
      id: 6,
      title: '搬運任務',
      prompt: '夾起貨物，放進綠色放置區，再停到終點',
      mirror: 'h',
      maps: [{
        name: '',
        grid: [
          '##O##',
          '##.##',
          '....Z',
          '####G',
        ],
        start: { r: 2, c: 0, dir: 'E' },
      }],
      blocks: ['move', 'turn', 'repeat', 'grab', 'drop'],
      cards: ['grip'],
      hint: '把任務拆成三段：去拿貨物、去放置區、去終點。',
      stars: { type: 'runs', three: 3, two: 6 }, // 這關程式很長，3 次內成功 3 星、6 次內 2 星
    },

    // ---------- 7 一直做，直到到達終點（只加這一個新東西）----------
    {
      id: 7,
      title: '一直走到終點',
      prompt: '讓機器人走到終點。積木用得越少，星星越多',
      mirror: 'h',
      maps: [{
        name: '',
        grid: [
          '........G',
          '.########',
          '.########',
          '.########',
        ],
        start: { r: 3, c: 0, dir: 'N' },
      }],
      blocks: ['move', 'turn', 'until'],
      cards: ['until'],
      hint: '最後那一長段不用數格子，讓機器人自己一直走到終點。',
      stars: { type: 'blocks', three: 6, two: 9 },
    },

    // ---------- 8 倉庫配送（綜合：夾取＋一直做＋如果；偵測「牆」；新東西只有感測「牆」和「往前走 N 格」字卡）----------
    {
      id: 8,
      title: '倉庫配送',
      prompt: '把貨物送到綠色放置區，再走到終點。積木用得越少，星星越多',
      mirror: 'h',
      // 規律：放置區就在起點旁，走過去放下就好；之後每個轉角前面都是牆（地圖邊緣也算牆），一律右轉（共 3 個轉角）。
      // 和第 5 關不同：轉彎的地方不再有寶特瓶，要靠「感測牆」。
      maps: [{
        name: '',
        grid: [
          'O.Z...',
          '#G###.',
          '#.###.',
          '#.....',
        ],
        start: { r: 0, c: 0, dir: 'E' },
      }],
      blocks: ['moveN', 'turn', 'repeat', 'until', 'ifelse', 'if', 'look', 'grab', 'drop'],
      look: { sides: ['front'], is: ['wall'] },
      cards: ['moven', 'wall'],
      hint: '先夾取、走到綠色放置區放下。後面每個轉角前面都是牆：讓機器人「一直做」，如果前面是牆就右轉，不然往前走。',
      stars: { type: 'blocks', three: 8, two: 10 },
    },

    // ---------- 9 魔王關：修好它（除錯，兩個錯：一個空間、一個邏輯）----------
    {
      id: 9,
      title: '修好它（魔王關）',
      prompt: '小明的搬運程式有兩個地方錯了，請幫他修好',
      boss: true,
      bugs: 2,
      mirror: 'h',
      // 路口的規律：寶特瓶在機器人「左邊」→ 要右轉；左邊是路 → 要左轉。兩個路口前面都有寶特瓶。
      maps: [{
        name: '',
        grid: [
          '###B####',
          'GZ..####',
          '###.####',
          '##B...O#',
          '###B####',
        ],
        start: { r: 3, c: 4, dir: 'E' },
      }],
      blocks: ['moveN', 'turn', 'repeat', 'until', 'ifelse', 'look', 'grab', 'drop'],
      look: { sides: ['front', 'left', 'right'], is: ['bottle'] },
      cards: ['boss'],
      hint: '機器人是在哪裡開始走錯的？看看感測器亮起來的格子。',
      stars: { type: 'edit', three: 2, two: 4 },
      // 預載給學生的程式（有兩個錯，學生看得到，所以放在這裡）
      preload: [{ move: 2 }, 'grab', { turn: 90 }, { move: 3 }, { repeat: 2, do: [FRONT_JUNCTION, { move: 2 }] }, 'drop', 'move'],
    },

    // ---------- 隱藏關卡：循線挑戰（魔王關過關才出現）----------
    {
      id: 10,
      title: '循線挑戰',
      prompt: '沿著黑線走到終點，小心寶特瓶',
      hiddenLevel: true,
      mirror: 'h',
      lineProgress: true,
      submit: true,
      // 黑線是 3 階樓梯（可以用「重複」），最後一段直線上有一個寶特瓶
      maps: [{
        name: '',
        grid: [
          '...........',
          '....====B=*',
          '....=......',
          '..===......',
          '..=........',
          '===........',
          '=..........',
          '=..........',
        ],
        start: { r: 7, c: 0, dir: 'N' },
      }],
      // 隱藏地圖（學生看不到結果）：形狀和寶特瓶位置都不同，只有用感測器的通用程式能過。
      // 注意：交出程式後由學生的瀏覽器在背景測試，所以地圖本身一定要送到學生端；學生只要會讀原始碼，就看得到這張圖。
      hidden: [{
        name: '隱藏地圖',
        grid: [
          '........',
          '.=====*.',
          '.=......',
          '.B......',
          '.=......',
          '.=......',
          '.=......',
        ],
        start: { r: 6, c: 1, dir: 'N' },
      }],
      blocks: ['moveN', 'turn', 'repeat', 'until', 'ifelse', 'if', 'look'],
      look: { sides: ['front', 'left', 'right'], is: ['line', 'bottle', 'wall'] },
      cards: ['line'],
      hint: '黑線的形狀有沒有一直重複？寶特瓶要怎麼繞過去？',
      stars: { type: 'none' },
    },
  ];

  // 依變體（A/B）取得實際要用的地圖
  RQ.mapsFor = function (level, variant, which) {
    const list = (which === 'hidden' ? level.hidden : level.maps) || [];
    return variant === 'B' ? list.map((m) => RQ.mirrorMap(m, level.mirror)) : list;
  };
})((window.RQ = window.RQ || {}));
