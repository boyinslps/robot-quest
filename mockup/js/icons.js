/* 向量圖示（不使用 emoji，避免舊電腦字型顯示不一致） */
(function (RQ) {
  'use strict';

  const round = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

  const P = {
    play: '<path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/>',
    stepFwd: '<path d="M4 5v14l10-7z" fill="currentColor"/><rect x="16" y="5" width="3.2" height="14" rx="1" fill="currentColor"/>',
    stepBack: '<path d="M20 5v14l-10-7z" fill="currentColor"/><rect x="4.8" y="5" width="3.2" height="14" rx="1" fill="currentColor"/>',
    reset: `<path d="M5.5 12a6.5 6.5 0 1 0 2-4.7" ${round} stroke-width="2.6"/><path d="M4 3.5v6h6z" fill="currentColor"/>`,
    undo: `<path d="M9 8h6a4.5 4.5 0 0 1 0 9H9" ${round} stroke-width="2.6"/><path d="M10 3.5 4 8l6 4.5z" fill="currentColor"/>`,
    redo: `<path d="M15 8H9a4.5 4.5 0 0 0 0 9h6" ${round} stroke-width="2.6"/><path d="M14 3.5 20 8l-6 4.5z" fill="currentColor"/>`,
    bulb: '<path d="M12 2.5a6.5 6.5 0 0 0-3.8 11.8c.7.5 1.1 1.3 1.1 2.2h5.4c0-.9.4-1.7 1.1-2.2A6.5 6.5 0 0 0 12 2.5z" fill="currentColor"/><rect x="9.3" y="17.6" width="5.4" height="1.8" rx=".9" fill="currentColor"/><rect x="10" y="20.3" width="4" height="1.8" rx=".9" fill="currentColor"/>',
    help: `<circle cx="12" cy="12" r="9.5" ${round} stroke-width="2.2"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.9 2.6c-.8.4-1.2 1-1.2 1.9v.6" ${round} stroke-width="2.2"/><circle cx="12" cy="17.3" r="1.3" fill="currentColor"/>`,
    skip: '<path d="M3.5 5l8 7-8 7zM12 5l8 7-8 7z" fill="currentColor"/>',
    send: '<path d="M3 11.2 21 3.5l-7.4 17.3-2.4-7.2z" fill="currentColor"/>',
    check: `<path d="M4.5 12.5l5 5L19.5 7" ${round} stroke-width="3.2"/>`,
    cross: `<path d="M6 6l12 12M18 6 6 18" ${round} stroke-width="3.2"/>`,
    star: '<path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5-4.8-4.5 6.5-.8z" fill="currentColor"/>',
    flag: '<rect x="3.5" y="2.5" width="2" height="19" rx="1" fill="currentColor"/><path d="M5.5 3.5h15v10h-15z" fill="#fff" stroke="currentColor" stroke-width="1.4"/><path d="M5.5 3.5h3.75v3.33H5.5zM13 3.5h3.75v3.33H13zM9.25 6.83H13v3.34H9.25zM16.75 6.83h3.75v3.34h-3.75zM5.5 10.17h3.75v3.33H5.5zM13 10.17h3.75v3.33H13z" fill="currentColor"/>',
    up: '<path d="M12 2.5l7.5 8.5h-4.7v10.5H9.2V11H4.5z" fill="currentColor"/>',
    turnL: `<path d="M17 21.5v-8.5a5 5 0 0 0-5-5H7.5" ${round} stroke-width="3"/><path d="M9 2.5 3 8l6 5.5z" fill="currentColor"/>`,
    turnR: `<path d="M7 21.5v-8.5a5 5 0 0 1 5-5h4.5" ${round} stroke-width="3"/><path d="M15 2.5 21 8l-6 5.5z" fill="currentColor"/>`,
    rotate: `<path d="M19 12.5a7 7 0 1 1-2.2-5.1" ${round} stroke-width="2.8"/><path d="M20.5 2.5v7.2h-7.2z" fill="currentColor"/>`,
    grab: `<path d="M5 3v6l4 4M19 3v6l-4 4" ${round} stroke-width="2.6"/><rect x="8" y="12" width="8" height="8" rx="1.5" fill="currentColor"/>`,
    drop: `<path d="M3.5 3v5.5L2.5 12M20.5 3v5.5l1 3.5M3.5 6h17" ${round} stroke-width="2.4"/><rect x="8" y="14" width="8" height="7.5" rx="1.5" fill="currentColor"/><path d="M12 7.5v4" ${round} stroke-width="2.2"/>`,
    loop: `<path d="M4 12.5a6 6 0 0 1 6-6h7" ${round} stroke-width="2.6"/><path d="M16 2.5l4.5 4-4.5 4z" fill="currentColor"/><path d="M20 11.5a6 6 0 0 1-6 6H7" ${round} stroke-width="2.6"/><path d="M8 13.5l-4.5 4 4.5 4z" fill="currentColor"/>`,
    eye: `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" ${round} stroke-width="2.2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>`,
    next: `<path d="M8.5 4.5 16 12l-7.5 7.5" ${round} stroke-width="3.2"/>`,
    pointer: '<path d="M5 2.5v17.5l4.4-4.1 3.1 6.6 3.1-1.5-3.1-6.5h6.4z" fill="#fff" stroke="#222" stroke-width="1.6" stroke-linejoin="round"/>',
    bottle: '<rect x="9.4" y="1.8" width="5.2" height="3.4" rx="1" fill="#e0a526" stroke="#8a6414" stroke-width="1"/><path d="M10 5.2h4v3c0 .9 2 1.7 2 3.6V20a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-8.2c0-1.9 2-2.7 2-3.6z" fill="#8cc8e8" stroke="#2f6f8f" stroke-width="1.4" stroke-linejoin="round"/><path d="M8.4 13.4h7.2" stroke="#2f6f8f" stroke-width="1.2"/><path d="M10.4 15.5v3.8" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".8"/>',
    robot: '<rect x="3.5" y="7" width="17" height="13" rx="3.5" fill="currentColor"/><circle cx="9" cy="13.2" r="2" fill="#fff"/><circle cx="15" cy="13.2" r="2" fill="#fff"/><rect x="11" y="3" width="2" height="4.5" fill="currentColor"/><circle cx="12" cy="2.8" r="1.8" fill="currentColor"/><rect x="1" y="11" width="2" height="5" rx="1" fill="currentColor"/><rect x="21" y="11" width="2" height="5" rx="1" fill="currentColor"/>',
  };

  RQ.ICON_PATHS = P;

  // HTML 內用：顏色跟著文字顏色（currentColor）
  // 介面縮放倍率：根字級 ÷ 16（1366×768 = 1）。圖示、Blockly 積木都乘上它，才會跟著文字一起放大
  RQ.uiScale = () => (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) / 16;

  // 尺寸用 rem（size 是 16px 基準下的大小），跟著畫面一起縮放
  RQ.icon = (name, size, cls) => {
    const r = (size || 22) / 16;
    return `<svg class="ico${cls ? " " + cls : ""}" viewBox="0 0 24 24" style="width:${r}rem;height:${r}rem" aria-hidden="true">${P[name]}</svg>`;
  };

  // Blockly 積木上的圖片用：data URI，顏色要寫死
  RQ.iconURI = (name, color) =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" color="${color || '#fff'}">${P[name]}</svg>`);

  // 把頁面上 data-icon 的元素補上圖示
  RQ.fillIcons = (root) => {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (el.querySelector(':scope > svg.ico')) return;
      el.insertAdjacentHTML('afterbegin', RQ.icon(el.dataset.icon, Number(el.dataset.size) || undefined));
    });
  };
})((window.RQ = window.RQ || {}));
