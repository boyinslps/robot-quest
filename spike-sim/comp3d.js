/* 元件模擬（3D 版）：用 LDraw 官方零件庫的 SPIKE Prime 真實零件模型（45601 主機、54696 中型馬達、
   37308 顏色感測器、37316 距離感測器、37312 力感測器）。滑鼠拖曳空白處＝轉動視角、滾輪＝縮放；
   在零件上的互動：轉馬達的圓盤、按力感測器、把色塊移到顏色感測器前面、拖距離物體、拖著主機傾斜。
   LDraw 零件授權 CC BY 4.0（LDraw.org）。  made by 資訊老師黃博胤 */
(function (SP) {
  'use strict';
  const K = SP.compKit; if (!K) return;
  const { H, sim, U, api, state, frame, COLOR_HEX, COLOR_ZH, COLOR_NUM, FACE, clamp, rad } = K;
  let T = null, OC = null, LD = null, loader = null;
  const cache = {};

  async function init() {
    T = await import('three');
    OC = (await import('three/addons/controls/OrbitControls.js')).OrbitControls;
    LD = (await import('three/addons/loaders/LDrawLoader.js')).LDrawLoader;
    const man = await (await fetch('assets/parts/ldraw/manifest.json')).json();
    const map = {}; for (const [k, v] of Object.entries(man.files)) map[k] = v[0];
    loader = new LD(); loader.smoothNormals = true;
    loader.setPath('assets/parts/ldraw/'); loader.setPartsLibraryPath('assets/parts/ldraw/'); loader.setFileMap(map);
    await loader.preloadMaterials('LDConfig.ldr');
    SP.part3d = { ready: true, make };
    window.dispatchEvent(new Event('sp-part3d-ready'));
  }

  /* LDraw 的 Y 軸朝下、單位 LDU（1 LDU = 0.4 mm）→ 轉成 Y 朝上的公釐，並把中心放在原點 */
  function loadModel(file) {
    if (!cache[file]) cache[file] = new Promise((res, rej) => {
      loader.parse('1 15 0 0 0 1 0 0 0 1 0 0 0 1 ' + file, (g) => {
        g.scale.set(0.4, 0.4, 0.4); g.rotation.x = Math.PI;      // 繞 X 軸轉 180 度（只取負 Y 會變成鏡像、字母會反）
        const w = new T.Group(); w.add(g);
        const b = new T.Box3().setFromObject(w), c = b.getCenter(new T.Vector3()); g.position.sub(c);
        const bb = new T.Box3().setFromObject(w), size = bb.getSize(new T.Vector3());
        w.userData.size = size; res(w);
      }, rej);
    });
    return cache[file].then((w) => { const c = w.clone(true); c.userData.size = w.userData.size; return c; });
  }

  /* ---------- 共用的 3D 視窗 ---------- */
  function makeView(f, opts) {
    let R;
    try { R = new T.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { return null; }
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const host = H('div', { class: 'p3d-host' }), loading = H('div', { class: 'p3d-loading', text: '載入 3D 零件中…' });
    R.domElement.className = 'p3d'; host.append(R.domElement, loading); f.body.append(host);
    const scene = new T.Scene();
    scene.add(new T.HemisphereLight(0xffffff, 0x8a93a0, 1.7));
    const d1 = new T.DirectionalLight(0xffffff, 2.2); d1.position.set(150, 300, 250); scene.add(d1);
    const d2 = new T.DirectionalLight(0xffffff, 1.0); d2.position.set(-250, 100, -150); scene.add(d2);
    const cam = new T.PerspectiveCamera(opts.fov || 32, 4 / 3, 1, 4000);
    cam.position.set(...opts.cam);
    const v = { R, scene, cam, host, loading, hooks: {}, drag: false, ray: new T.Raycaster(), ndc: new T.Vector2() };
    const cv = R.domElement;
    const pick = (e, objs) => { scene.updateMatrixWorld(true); const r = cv.getBoundingClientRect(); v.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); v.ray.setFromCamera(v.ndc, cam); return v.ray.intersectObjects(objs, true); };
    v.pick = pick;
    v.planeHit = (e, y) => { const r = cv.getBoundingClientRect(); v.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); v.ray.setFromCamera(v.ndc, cam); const p = new T.Vector3(); return v.ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -y), p) ? p : null; };
    // 先登記自己的處理（capture），這樣點到可互動的地方時，OrbitControls 不會跟著轉視角
    cv.addEventListener('pointerdown', (e) => { if (e.button !== 0 || !v.hooks.down) return; if (v.hooks.down(e)) { e.stopImmediatePropagation(); e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* 略 */ } v.drag = true; } }, true);
    cv.addEventListener('pointermove', (e) => { if (v.drag) { e.stopImmediatePropagation(); if (v.hooks.move) v.hooks.move(e); } else if (v.hooks.hover) v.hooks.hover(e); }, true);
    const end = (e) => { if (!v.drag) return; v.drag = false; e.stopImmediatePropagation(); try { cv.releasePointerCapture(e.pointerId); } catch (x) { /* 略 */ } if (v.hooks.up) v.hooks.up(e); };
    cv.addEventListener('pointerup', end, true); cv.addEventListener('pointercancel', end, true);
    const controls = new OC(cam, cv); controls.enableDamping = true; controls.target.set(...(opts.target || [0, 0, 0])); cam.position.sub(controls.target).multiplyScalar(1.2).add(controls.target); controls.minDistance = 40; controls.maxDistance = 600; controls.update();
    v.controls = controls;
    const resize = () => { const w = host.clientWidth || 300, h = host.clientHeight || 225; R.setSize(w, h, false); cv.style.width = '100%'; cv.style.height = '100%'; cam.aspect = w / h; cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(resize); ro.observe(host); resize();
    v.render = () => { controls.update(); R.render(scene, cam); };
    v.project = (x, y, z) => { const q = new T.Vector3(x, y, z).project(cam), r = cv.getBoundingClientRect(); return { clientX: r.left + (q.x + 1) / 2 * r.width, clientY: r.top + (1 - q.y) / 2 * r.height }; };
    (SP.p3dViews = SP.p3dViews || []).push(v);
    v.destroy = () => { const ix = (SP.p3dViews || []).indexOf(v); if (ix >= 0) SP.p3dViews.splice(ix, 1); ro.disconnect(); controls.dispose(); R.dispose(); try { R.forceContextLoss(); } catch (x) { /* 略 */ } };
    v.ready = () => { loading.remove(); };
    v.setView = (name) => { const t = controls.target, d = cam.position.distanceTo(t), dirs = { iso: [0.7, 0.55, 0.8], top: [0, 1, 0.001], front: [0, 0.15, 1], side: [1, 0.15, 0] }[name]; if (!dirs) return; const n = new T.Vector3(...dirs).normalize().multiplyScalar(d); cam.position.copy(t).add(n); controls.update(); };
    // 視角小按鈕
    const bar = H('div', { class: 'p3d-bar' });
    [['iso', '立體'], ['top', '上視'], ['front', '正視'], ['side', '側視']].forEach(([k, t], i) => { const b = H('button', { type: 'button', text: t, class: i > 1 ? 'opt' : '' }); b.onclick = () => v.setView(k); bar.append(b); });
    // 視角按鈕放進標題列右側（不再另佔 3D 下方一列）
    if (f.tools) f.tools.prepend(bar); else f.body.append(bar);
    return v;
  }
  const mat = (c, o = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0.02 }, o));
  const ghost = () => new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  /* ---------- 主機（母體燈）：5×5 燈陣疊在上蓋，左右按鈕可以按 ---------- */
  function ledTexture() {
    const cv = document.createElement('canvas'); cv.width = 224; cv.height = 352;
    const tex = new T.CanvasTexture(cv); tex.colorSpace = T.SRGBColorSpace; tex.anisotropy = 4;
    return { cv, tex, ctx: cv.getContext('2d') };
  }
  function drawLeds(L, flip) {
    const c = L.ctx; c.clearRect(0, 0, 224, 352);
    const r = sim.matrixRot;
    for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 5; cx++) {
      const [sx, sy] = r === 0 ? [cx, cy] : r === 1 ? [cy, 4 - cx] : r === 2 ? [4 - cx, 4 - cy] : [4 - cy, cx];
      const b = sim.led[sy * 5 + sx] || 0;
      const x = 112 + (cx - 2) * 32 - 12, y = 176 + (cy - 2) * 32 - 12;
      c.fillStyle = b ? `rgba(255,${205 + Math.round(b * 0.3)},${140 + Math.round(b * 0.6)},${(0.4 + b * 0.006).toFixed(2)})` : 'rgba(110,95,60,0.13)';
      if (b > 30) { c.shadowColor = 'rgba(255,190,100,.9)'; c.shadowBlur = 10; } else c.shadowBlur = 0;
      c.beginPath(); c.roundRect(x, y, 24, 24, 3); c.fill();
    }
    c.shadowBlur = 0; L.tex.needsUpdate = true;
  }
  function hubPane(withTilt) {
    const f = frame(withTilt ? '陀螺儀' : '母體燈', withTilt ? '#34ccf1' : '#b896f8', '', withTilt ? '拖著主機＝傾斜；拖黃色圓點＝轉向；快速甩動＝搖晃；點一下＝輕拍。拖空白處＝轉視角。' : '按住主機下方的左、右按鈕，程式就能收到。拖空白處＝轉視角、滾輪＝縮放。');
    const v = makeView(f, { cam: withTilt ? [0, 150, 105] : [0, 160, 95], target: [0, 0, 0] }); if (!v) return null;
    if (withTilt) { f.chip('yaw', '偏航'); f.chip('pitch', '俯仰'); f.chip('roll', '滾動'); f.chip('face', '朝上'); f.chip('g', '手勢'); } else { f.chip('text', '顯示'); f.chip('btn', '按鈕'); }
    const tilt = new T.Group(), yawG = new T.Group(); yawG.add(tilt); v.scene.add(yawG);
    const L = ledTexture(); let lsig = '';
    const hits = {};
    loadModel('45601c01.dat').then((m) => {
      const body = new T.Group(); body.add(m); tilt.add(body);   // 大按鈕那一端朝向畫面下方（+Z），和官方主機俯視圖一樣
      const top = m.userData.size.y / 2;
      const plane = new T.Mesh(new T.PlaneGeometry(56, 88), new T.MeshBasicMaterial({ map: L.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      plane.rotation.x = -Math.PI / 2; plane.position.y = top + 0.25; tilt.add(plane);
      for (const [side, x] of [['left', -10], ['right', 10]]) { const h = new T.Mesh(new T.BoxGeometry(14, 6, 9), ghost()); h.position.set(x * 1.4, top + 1, 34); h.userData.btn = side; tilt.add(h); hits[side] = h; }
      v.ready();
    });
    if (!withTilt) {
      let down = null;
      v.hooks.down = (e) => { const hs = v.pick(e, Object.values(hits)); if (!hs.length) return false; down = hs[0].object.userData.btn; sim.buttons[down] = performance.now(); return true; };
      v.hooks.up = () => { if (down) sim.buttons[down] = 0; down = null; };
    }
    /* 陀螺儀：拖主機傾斜，拖外圈轉向 */
    let ring, knob, drag = null;
    if (withTilt) {
      ring = new T.Mesh(new T.TorusGeometry(70, 1.4, 8, 72), mat(0xdfe5f0)); ring.rotation.x = Math.PI / 2; ring.position.y = -22; v.scene.add(ring);
      knob = new T.Mesh(new T.SphereGeometry(5, 16, 12), mat(0xffd400)); knob.position.set(0, -22, -70); v.scene.add(knob);
      const hitRing = new T.Mesh(new T.TorusGeometry(70, 7, 8, 48), ghost()); hitRing.rotation.x = Math.PI / 2; hitRing.position.y = -22; v.scene.add(hitRing);
      let mode = null, last = 0;
      const ang = (e) => { const p = v.planeHit(e, -22); return p ? Math.atan2(p.x, -p.z) * 180 / Math.PI : 0; };
      v.hooks.down = (e) => {
        if (v.pick(e, [hitRing]).length) { mode = 'yaw'; last = ang(e); return true; }
        if (v.pick(e, [tilt]).length) { mode = 'tilt'; drag = { x: e.clientX, y: e.clientY, p0: sim.hand.pitch, r0: sim.hand.roll, t0: performance.now(), moved: 0, lx: e.clientX, ly: e.clientY, lt: performance.now(), dx: 0, dy: 0, rev: [] }; return true; }
        return false;
      };
      v.hooks.move = (e) => {
        if (mode === 'yaw') { const a = ang(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; sim.yawOff -= sim.yawSign * rad(d); last = a; return; }
        const d = drag; if (!d) return; d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x, e.clientY - d.y));
        sim.hand.pitch = clamp(d.p0 + (e.clientY - d.y) * 0.6, -90, 90); sim.hand.roll = clamp(d.r0 + (e.clientX - d.x) * 0.6, -90, 90);
        const t = performance.now(), vx = (e.clientX - d.lx) / Math.max(1, t - d.lt), vy = (e.clientY - d.ly) / Math.max(1, t - d.lt);
        for (const [vv, k] of [[vx, 'dx'], [vy, 'dy']]) if (Math.abs(vv) > 0.7) { const s = Math.sign(vv); if (d[k] && s !== d[k]) d.rev.push(t); d[k] = s; }
        d.rev = d.rev.filter((r) => t - r < 800); if (d.rev.length >= 4) { sim.doGesture('shaken'); d.rev = []; }
        d.lx = e.clientX; d.ly = e.clientY; d.lt = t;
      };
      v.hooks.up = () => { if (mode === 'tilt' && drag && drag.moved < 5 && performance.now() - drag.t0 < 350) sim.doGesture('tapped'); drag = null; mode = null; };
    }
    return { id: withTilt ? 'gyro' : 'hub', root: f.root, destroy: v.destroy, tick() {
      const sig = Array.from(sim.led).join(',') + '|' + sim.matrixRot + '|' + sim.powerColor;
      if (sig !== lsig) { lsig = sig; drawLeds(L); }
      if (withTilt) {
        if (!drag) { sim.hand.pitch *= 0.8; sim.hand.roll *= 0.8; if (Math.abs(sim.hand.pitch) < 0.3) sim.hand.pitch = 0; if (Math.abs(sim.hand.roll) < 0.3) sim.hand.roll = 0; }
        const y = sim.yaw();
        yawG.rotation.y = -rad(y * sim.yawSign); tilt.rotation.x = rad(sim.hand.pitch); tilt.rotation.z = -rad(sim.hand.roll);
        if (knob) { const a = rad(y * sim.yawSign); knob.position.set(70 * Math.sin(-a + 0), -22, -70 * Math.cos(a)); knob.position.x = 70 * Math.sin(-a); }
        f.chips.yaw(y + '°'); f.chips.pitch(Math.round(sim.hand.pitch) + '°'); f.chips.roll(Math.round(sim.hand.roll) + '°'); f.chips.face(FACE[api.upFace()]);
        const g = sim.gesture(); f.chips.g(g === 'shaken' ? '搖晃' : g === 'tapped' ? '輕拍' : g === 'falling' ? '自由落體' : '—');
      } else { f.chips.text(sim.displayText || '—'); f.chips.btn((sim.buttons.left ? '左 ' : '') + (sim.buttons.right ? '右' : '') || '沒按'); }
      v.render();
    } };
  }

  /* ---------- 馬達：中型角度馬達，圓盤可以用滑鼠轉 ---------- */
  function motorPane(p) {
    const m = () => sim.mot[p];
    const f = frame('馬達', '#0090f5', p, '用滑鼠在藍色圓盤上拖，就像用手轉馬達。拖空白處＝轉視角、滾輪＝縮放。');
    const title = f.root.querySelector('.part-h').firstChild.nextSibling;
    const v = makeView(f, { cam: [70, 85, 65], target: [0, 4, 8] }); if (!v) return null;
    f.chip('pos', '位置'); f.chip('turn', '共轉'); f.chip('v', '轉速');
    const rotor = new T.Group(); let rotorHit = null;
    const tx = (() => { // 圓盤貼圖：4 個圓孔、中心十字孔、黑色指示線
      const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
      c.fillStyle = '#5bc3dd'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
      c.fillStyle = '#2c7f96'; for (const a of [45, 135, 225, 315]) { const x = 128 + 62 * Math.cos(rad(a)), y = 128 + 62 * Math.sin(rad(a)); c.beginPath(); c.arc(x, y, 22, 0, 7); c.fill(); c.fillStyle = '#b7e6f2'; c.beginPath(); c.arc(x, y, 14, 0, 7); c.fill(); c.fillStyle = '#2c7f96'; }
      c.fillStyle = '#e8f7fb'; c.fillRect(120, 96, 16, 64); c.fillRect(96, 120, 64, 16); c.strokeStyle = '#2c7f96'; c.lineWidth = 3; c.strokeRect(120, 96, 16, 64); c.strokeRect(96, 120, 64, 16);
      c.strokeStyle = '#111'; c.lineWidth = 6; c.beginPath(); c.moveTo(128, 128); c.lineTo(128, 250); c.stroke();
      const t = new T.CanvasTexture(cv); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t;
    })();
    loadModel('54696.dat').then((model) => {
      v.scene.add(model);
      const top = model.userData.size.y / 2;
      // 圓盤中心：模型座標 (0, 頂面, -24.2)，半徑 11.6 公釐
      const disc = new T.Mesh(new T.CircleGeometry(11.7, 48), new T.MeshStandardMaterial({ map: tx, roughness: 0.5 }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.2; rotor.add(disc); rotor.position.set(0, top + 0.1, 24.2); v.scene.add(rotor); rotorHit = disc;
      const o = new T.Mesh(new T.RingGeometry(1.2, 1.9, 24), new T.MeshBasicMaterial({ color: 0x111111, side: T.DoubleSide })); o.rotation.x = -Math.PI / 2; o.position.set(14.8, top + 0.12, 24.2 - 3); v.scene.add(o);
      v.ready();
    });
    let last = null;
    const ang = (e) => { const pt = v.planeHit(e, rotor.position.y); return pt ? Math.atan2(pt.x - rotor.position.x, -(pt.z - rotor.position.z)) * 180 / Math.PI : 0; };
    v.hooks.down = (e) => { if (!rotorHit || sim.ports[p] !== 'motor') return false; if (!v.pick(e, [rotorHit]).length) return false; last = ang(e); return true; };
    v.hooks.move = (e) => { const a = ang(e); let d = a - last; if (d > 180) d -= 360; if (d < -180) d += 360; m().deg += d; m().cur = 0; last = a; };
    v.hooks.up = () => { last = null; };
    return { id: 'motor:' + p, root: f.root, destroy: v.destroy, tick() {
      title.textContent = '馬達';
      const ok = sim.ports[p] === 'motor'; f.root.classList.toggle('warn', !ok);
      const d = m().deg; rotor.rotation.y = -rad(d);
      if (!ok) { f.chips.pos(sim.ports[p] === 'none' ? '這個埠沒有接馬達' : '這個埠接的不是馬達'); f.chips.turn('—'); f.chips.v('—'); } else { f.chips.pos(((Math.round(d) % 360) + 360) % 360 + '°'); f.chips.turn((d / 360).toFixed(2) + ' 圈'); f.chips.v(Math.round(m().cur || 0) + '°/秒'); }
      v.render();
    } };
  }

  /* ---------- 顏色感測器：點色塊，它就移到鏡頭前面 ---------- */
  function brickMesh(c) {
    const g = new T.Group(), col = new T.Color(COLOR_HEX[c]), m = mat(col, { roughness: 0.35 });
    g.add(new T.Mesh(new T.BoxGeometry(31.8, 9.6, 15.8), m));
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const s = new T.Mesh(new T.CylinderGeometry(2.4, 2.4, 1.8, 16), m); s.position.set(-12 + i * 8, 5.7, -4 + j * 8); g.add(s); }
    return g;
  }
  function colorPane(port) {
    const f = frame('顏色感測器', '#34ccf1', port, '點一塊色塊，它會移到鏡頭前面；再點一次就拿開。拖空白處＝轉視角。');
    const v = makeView(f, { cam: [70, 45, 120], target: [20, -2, 20] }); if (!v) return null;
    f.chip('c', '看到'); f.chip('l', '反射光');
    const order = ['red', 'yellow', 'green', 'blue', 'black', 'white'], bricks = {};
    const floorY = -11.6;
    let lens = null;
    loadModel('37308.dat').then((model) => {
      v.scene.add(model);
      lens = new T.Mesh(new T.CircleGeometry(4.2, 24), new T.MeshBasicMaterial({ color: 0x9aa0a6 })); lens.position.set(0, 0, 11.9); v.scene.add(lens);
      v.ready();
    });
    const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshStandardMaterial({ color: 0xdfe5ee, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY - 0.05; v.scene.add(floor);
    order.forEach((c, i) => {
      const b = brickMesh(c); b.userData.c = c; const home = new T.Vector3(46 + (i % 2) * 38, floorY + 4.8, (i >> 1) * 22 + 6);
      b.position.copy(home); v.scene.add(b); bricks[c] = { c, m: b, home, tgt: home.clone(), rot: 0 };
    });
    const front = new T.Vector3(0, 0, 11.8 + 4 + 1.8 + 4.8);
    v.hooks.down = (e) => { const hs = v.pick(e, order.map((c) => bricks[c].m)); if (!hs.length) return false; let o = hs[0].object; while (o && !o.userData.c) o = o.parent; if (!o) return false; const c = o.userData.c; state.brick = state.brick === c ? null : c; return true; };
    v.hooks.up = () => {};
    const okType = () => sim.ports[port] === 'color';
    return { id: 'color:' + port, root: f.root, destroy: v.destroy, tick() {
      state.hover = null;
      for (const c of order) {
        const b = bricks[c], sel = state.brick === c, tgt = sel ? front : b.home;
        b.m.position.lerp(tgt, 0.2);
        const want = sel ? -Math.PI / 2 : 0; b.rot += (want - b.rot) * 0.2; b.m.rotation.x = b.rot;
        if (sel) b.m.position.y += (0 - b.m.position.y) * 0.05;
      }
      const seen = state.brick || 'none';
      if (lens) lens.material.color.set(COLOR_HEX[seen]);
      f.root.classList.toggle('warn', !okType());
      f.chips.c(okType() ? COLOR_ZH[seen] + (seen === 'none' ? '' : '（' + COLOR_NUM[seen] + '）') : '這個埠接的不是顏色感測器'); f.chips.l(okType() ? sim.light() + '%' : '—');
      v.render();
    } };
  }

  /* ---------- 距離感測器：拖動前面的灰色物體 ---------- */
  function distPane(port) {
    const f = frame('距離感測器', '#34ccf1', port, '拖動前面的灰色物體，看距離怎麼變；拖到最遠就是拿開。拖空白處＝轉視角。');
    const v = makeView(f, { cam: [380, 120, 115], target: [0, 0, 115] }); if (!v) return null;
    f.chip('d', '距離'); f.chip('p', '百分比');
    const floorY = -11.6, Z0 = 15.8 + 8, PZ = 1.1;                 // 0 公分的位置；每公分幾公釐
    const floor = new T.Mesh(new T.PlaneGeometry(500, 500), new T.MeshStandardMaterial({ color: 0xdfe5ee, roughness: 1 })); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY - 0.05; v.scene.add(floor);
    for (let cm = 0; cm <= 200; cm += 10) { const t = new T.Mesh(new T.BoxGeometry(cm % 50 === 0 ? 40 : 22, 0.3, 0.8), new T.MeshBasicMaterial({ color: cm % 50 === 0 ? 0x64748b : 0x9aa5bd })); t.position.set(0, floorY, Z0 + cm * PZ); v.scene.add(t); }
    const obj = new T.Mesh(new T.BoxGeometry(46, 40, 8), mat(0x8d94a6)); v.scene.add(obj);
    const beam = new T.Mesh(new T.BoxGeometry(30, 14, 1), new T.MeshBasicMaterial({ color: 0x9fe0f5, transparent: true, opacity: 0.35 })); v.scene.add(beam);
    const dots = [];
    loadModel('37316.dat').then((model) => {
      v.scene.add(model);
      for (const [x, y] of [[-20.4, 0], [-11.6, 0], [11.6, 0], [20.4, 0]]) { const d = new T.Mesh(new T.CircleGeometry(1.8, 12), new T.MeshBasicMaterial({ color: 0x444444 })); d.position.set(x, 8.5 + y, 15.9); v.scene.add(d); dots.push(d); }
      v.ready();
    });
    const zOf = (d) => Z0 + d * PZ + 4;
    const dOf = (z) => (z - Z0 - 4) / PZ;
    v.hooks.down = (e) => { if (!v.pick(e, [obj]).length) return false; return true; };
    v.hooks.move = (e) => { const p = v.planeHit(e, 0); if (p) state.dist = clamp(dOf(p.z), 0, 200); };
    v.hooks.up = () => { if (state.dist >= 196) state.dist = 200; };
    const okType = () => sim.ports[port] === 'distance';
    return { id: 'dist:' + port, root: f.root, destroy: v.destroy, tick() {
      const d = state.dist, none = d >= 200; obj.position.set(0, 0, zOf(d)); obj.material.opacity = none ? 0.35 : 1; obj.material.transparent = none;
      beam.position.set(0, 0, (Z0 + zOf(d) - 4) / 2); beam.scale.set(1, 1, Math.abs(zOf(d) - 4 - Z0)); beam.material.opacity = none ? 0.12 : 0.35; beam.scale.z = Math.max(1, Math.abs(zOf(d) - 4 - Z0));
      beam.geometry.dispose && 0;
      dots.forEach((dt, i) => { const val = sim.distLights[i] || 0; dt.material.color.set(val ? `rgb(${Math.round(60 + val * 1.9)},230,255)` : '#444'); });
      f.root.classList.toggle('warn', !okType());
      f.chips.d(!okType() ? '這個埠接的不是距離感測器' : none ? '沒偵測到' : Math.round(d) + ' 公分'); f.chips.p(okType() && !none ? Math.round(d / 2) + '%' : '—');
      v.render();
    } };
  }

  /* ---------- 力感測器：按住黑色按鈕，越久越用力 ---------- */
  function forcePane(port) {
    const f = frame('力傳感器', '#34ccf1', port, '用滑鼠按住感測器上方的黑色按鈕，按得越久越用力；放開就鬆開。拖空白處＝轉視角。');
    const v = makeView(f, { cam: [55, 70, 70], target: [0, 6, 0] }); if (!v) return null;
    f.chip('n', '力'); f.chip('s', '狀態');
    let model = null, arrow = null;
    loadModel('37312.dat').then((m) => { model = m; v.scene.add(m); v.ready(); });
    arrow = new T.Mesh(new T.ConeGeometry(4, 10, 16), new T.MeshBasicMaterial({ color: 0xe5483d })); arrow.rotation.x = Math.PI; v.scene.add(arrow); arrow.visible = false;
    let down = 0, raf = 0;
    const ramp = () => { if (!down) return; state.force = Math.min(10, 0.8 + (performance.now() - down) / 1000 * 6); raf = requestAnimationFrame(ramp); };
    v.hooks.down = (e) => { if (!model || !v.pick(e, [model]).length) return false; down = performance.now(); state.force = 0.8; ramp(); return true; };
    v.hooks.up = () => { down = 0; cancelAnimationFrame(raf); state.force = 0; };
    const okType = () => sim.ports[port] === 'force';
    return { id: 'force:' + port, root: f.root, destroy() { cancelAnimationFrame(raf); v.destroy(); }, tick() {
      const n = state.force;
      if (model) { model.position.y = -Math.min(1.8, n * 0.25); }
      arrow.visible = n > 0; arrow.position.set(0, 26 + (10 - n) * 1.2, 0);
      f.root.classList.toggle('warn', !okType());
      f.chips.n(okType() ? n.toFixed(1) + ' 牛頓' : '這個埠接的不是力傳感器'); f.chips.s(okType() ? (n === 0 ? '放開' : n >= 5 ? '重壓' : '按下') : '—');
      v.render();
    } };
  }

  function make(k, p) {
    try {
      if (k === 'hub') return hubPane(false);
      if (k === 'gyro') return hubPane(true);
      if (k === 'motor') return motorPane(p);
      if (k === 'color') return colorPane(p);
      if (k === 'dist') return distPane(p);
      if (k === 'force') return forcePane(p);
    } catch (e) { console.warn('3D 零件建立失敗，改用平面版', e); }
    return null;
  }

  init().catch((e) => console.warn('3D 零件載入失敗，改用平面版', e));
})(window.SP = window.SP || {});
