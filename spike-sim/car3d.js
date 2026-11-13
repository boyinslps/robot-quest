/* SPIKE 小車 3D 預覽（Three.js）：顯示整個場地（地板圖案、牆、方塊、色紙、膠帶、軌跡）和小車的實際位置與方向；
   可旋轉、縮放；輪子、燈陣、電源鍵燈、顏色感測器燈跟著模擬器動；鏡頭可「跟隨小車」或看「場地全景」。
   模型是依模擬器的尺寸（輪徑 5.6 公分、輪距 11.2 公分）簡化的示意模型，不是官方三視圖或官方 3D 檔。
   座標單位：公分；車頭朝 -Z，右邊是 +X，上方是 +Y。 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SP = window.SP;
const POWER = { 0: '#222222', 1: '#ff2bd0', 2: '#8a2be2', 3: '#2a62ff', 4: '#40c0ff', 5: '#20e0c0', 6: '#22c55e', 7: '#ffd400', 8: '#ff8c1a', 9: '#ff2d2d', 10: '#ffffff' };
const COLOR_HEX = { red: '#d93025', yellow: '#f2c400', green: '#1e9e4a', blue: '#1a60d6', white: '#ffffff', black: '#111111', none: '#9aa0a6' };

let renderer, scene, camera, controls, host, raf = 0, ready = false;
let wheelL, wheelR, rig, ledCtx, ledTex, powerMat, colorLedMat, btnL, btnR, hubGroup;
let floorTex, trailTex, bgVer = -1, trailVer = -1, trailAt = 0;
const rectMeshes = new Map();
let mode = 'follow', lastPos = null;
let lastW = 0, lastH = 0;

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.05, ...o });
const add = (parent, mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };

function makeWheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 1.4, 40), mat('#202124', { roughness: 0.9 }));
  tire.rotation.z = Math.PI / 2; tire.castShadow = true; g.add(tire);
  // 胎紋：沿圓周的小方塊（轉動時看得出來）
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, t = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 0.55), mat('#0e0e0f', { roughness: 1 }));
    t.position.set(0, Math.cos(a) * 2.85, Math.sin(a) * 2.85); t.rotation.x = -a; t.castShadow = true; g.add(t);
  }
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 1.5, 32), mat('#f3f3f0')); rim.rotation.z = Math.PI / 2; g.add(rim);
  for (let i = 0; i < 5; i++) {       // 輪輻：一根染色，方便看出轉了多少
    const a = (i / 5) * Math.PI * 2, sp = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.35, 1.5), mat(i === 0 ? '#e5483d' : '#b8bcc2'));
    sp.rotation.x = a; sp.position.set(0, 0, 0); g.add(sp);
  }
  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.6, 16), mat('#6b7078')); hubCap.rotation.z = Math.PI / 2; g.add(hubCap);
  return g;
}

function matrixTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  ledCtx = c.getContext('2d'); ledTex = new THREE.CanvasTexture(c); ledTex.colorSpace = THREE.SRGBColorSpace;
  return ledTex;
}

function build() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color('#e9edf3');
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 1600);
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa3b5', 0.95));
  const sun = new THREE.DirectionalLight('#ffffff', 1.2);
  sun.position.set(90, 170, -70); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -190, right: 190, top: 130, bottom: -130, near: 20, far: 500 }); scene.add(sun);

  // 地板：直接用模擬器的底圖（場景圖案 + 你貼的色紙、膠帶）；上面再疊一層軌跡
  floorTex = new THREE.CanvasTexture(SP.sim.bg); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  trailTex = new THREE.CanvasTexture(SP.sim.trail); trailTex.colorSpace = THREE.SRGBColorSpace;
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(300, 200), new THREE.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false }));
  trail.rotation.x = -Math.PI / 2; trail.position.y = 0.04; scene.add(trail);
  // 場地外圍的牆（碰撞邊界）
  const border = new THREE.MeshStandardMaterial({ color: '#4b4f57', roughness: 0.8 });
  for (const [w, d, x, z] of [[304, 2, 0, -101], [304, 2, 0, 101], [2, 204, -151, 0], [2, 204, 151, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 6, d), border); m.position.set(x, 3, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  }
  // 地板外面的大地面
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: '#d5dae3', roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.1; ground.receiveShadow = true; scene.add(ground);

  rig = new THREE.Group(); scene.add(rig);
  const car = new THREE.Group(); rig.add(car);
  const YEL = '#f2c400', WHITE = '#f3f3f0', GRAY = '#7d848d', DARK = '#26282c';

  // 主機（黃色）：5×5 燈陣、左右按鈕、電源鍵
  hubGroup = new THREE.Group(); hubGroup.position.set(0, 4.4, -1); car.add(hubGroup);
  add(hubGroup, new THREE.Mesh(new THREE.BoxGeometry(5.6, 3.2, 8.8), mat(YEL)));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: matrixTexture() }));
  face.rotation.x = -Math.PI / 2; face.position.set(0, 1.62, -1.6); hubGroup.add(face);
  btnL = add(hubGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 20), mat('#cfd3d8')), -1.7, 1.65, 2.0);
  btnR = add(hubGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 20), mat('#cfd3d8')), 1.7, 1.65, 2.0);
  powerMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35 });
  add(hubGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.3, 24), powerMat), 0, 1.65, 2.0);
  for (let i = 0; i < 3; i++) {       // 後側埠口（A、C、E 在左；B、D、F 在右）
    add(hubGroup, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.8), mat(DARK)), -2.78, -0.1, 2.3 - i * 1.2);
    add(hubGroup, new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.8), mat(DARK)), 2.78, -0.1, 2.3 - i * 1.2);
  }

  // 兩顆馬達 + 車軸
  for (const sx of [-1, 1]) add(car, new THREE.Mesh(new THREE.BoxGeometry(2.0, 3.2, 5.6), mat('#e6b800')), sx * 3.8, 2.8, 0);
  add(car, new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 11.4, 16), mat('#555b63')), 0, 2.8, 0).rotation.z = Math.PI / 2;

  // 輪子（左＝馬達 A、右＝馬達 B）
  wheelL = makeWheel(); wheelL.position.set(-5.6, 2.8, 0); car.add(wheelL);
  wheelR = makeWheel(); wheelR.position.set(5.6, 2.8, 0); car.add(wheelR);

  // 後方滾珠
  add(car, new THREE.Mesh(new THREE.SphereGeometry(0.95, 24, 16), mat('#d9dce0', { roughness: 0.25, metalness: 0.4 })), 0, 0.95, 6.4);
  add(car, new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 1.6), mat(GRAY)), 0, 2.0, 5.7);
  add(car, new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 4.2), mat(GRAY)), 0, 2.7, 4.0);

  // 前方距離感測器（兩顆「眼睛」）
  const dist = new THREE.Group(); dist.position.set(0, 4.4, -6.8); car.add(dist);
  add(dist, new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 2.0), mat(WHITE)));
  for (const sx of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 24), mat('#d6d9de')); ring.rotation.x = Math.PI / 2; ring.position.set(sx * 1.9, 0, -1.05); dist.add(ring);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.34, 24), mat(DARK)); eye.rotation.x = Math.PI / 2; eye.position.set(sx * 1.9, 0, -1.12); dist.add(eye);
  }
  // 前下方顏色感測器：底部的小燈會顯示它現在「看到」的顏色
  const cs = new THREE.Group(); cs.position.set(0, 1.5, -6.9); car.add(cs);
  add(cs, new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.0, 2.4), mat(WHITE)));
  colorLedMat = new THREE.MeshStandardMaterial({ color: '#9aa0a6', emissive: '#9aa0a6', emissiveIntensity: 0.6 });
  add(cs, new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 20), colorLedMat), 0, -1.02, 0);
  add(car, new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.4, 0.8), mat(GRAY)), 0, 3.1, -5.9);   // 連接片

  controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 12, maxDistance: 520, maxPolarAngle: Math.PI / 2 - 0.02, enablePan: true, screenSpacePanning: true });
  setView('iso');
}

// 視角（跟隨小車：相對小車；場地全景：相對場地中心）
const VIEWS = {
  follow: { iso: [26, 20, -30], front: [0, 6, -42], back: [0, 6, 42], right: [42, 6, 0], left: [-42, 6, 0], top: [0, 58, 0.01] },
  arena: { iso: [0, 210, 250], front: [0, 80, -340], back: [0, 80, 340], right: [380, 80, 0], left: [-380, 80, 0], top: [0, 380, 0.01] },
};
function robotPos() { const s = SP.sim; return new THREE.Vector3(s.x - 150, 0, s.y - 100); }
function setView(name) {
  const v = (VIEWS[mode][name] || VIEWS[mode].iso).slice();
  if (mode === 'follow') {
    const yaw = -SP.sim.th, cy = Math.cos(yaw), sy = Math.sin(yaw), p = robotPos();   // 正視／側視是相對車頭，所以跟著車子的方向轉
    camera.position.set(p.x + v[0] * cy + v[2] * sy, v[1], p.z - v[0] * sy + v[2] * cy);
    controls.target.set(p.x, name === 'top' ? 0 : 3.2, p.z); lastPos = p;
  } else { camera.position.set(...v); controls.target.set(0, 0, 0); lastPos = null; }
  controls.update();
}
function setMode(m) { mode = m === 'arena' ? 'arena' : 'follow'; setView('iso'); }

// 場地上的牆與方塊：每個障礙物一個 3D 方塊，位置跟著模擬器（被推動也會動）
function syncRects() {
  const sim = SP.sim, live = new Set(sim.rects);
  for (const [r, m] of rectMeshes) if (!live.has(r)) { scene.remove(m); m.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); rectMeshes.delete(r); }
  for (const r of sim.rects) {
    const h = r.push ? 10 : 8;
    let m = rectMeshes.get(r);
    if (!m || m.userData.w !== r.w || m.userData.d !== r.h) {
      if (m) { scene.remove(m); m.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      m = new THREE.Group(); m.userData = { w: r.w, d: r.h };
      const body = new THREE.Mesh(new THREE.BoxGeometry(r.w, h, r.h), new THREE.MeshStandardMaterial({ color: r.push ? '#c9a26b' : '#4b4f57', roughness: 0.85 }));
      body.castShadow = true; body.receiveShadow = true; m.add(body);
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: r.push ? '#8a6a3a' : '#2c2f35' })));
      scene.add(m); rectMeshes.set(r, m);
    }
    m.position.set(r.x + r.w / 2 - 150, h / 2, r.y + r.h / 2 - 100);
  }
}

function updateTextures() {
  const sim = SP.sim; if (!sim || !ledCtx) return;
  const c = ledCtx, r = sim.matrixRot;
  c.fillStyle = '#16181d'; c.fillRect(0, 0, 128, 128);
  for (let cy = 0; cy < 5; cy++) for (let cx = 0; cx < 5; cx++) {
    const [sx, sy] = r === 0 ? [cx, cy] : r === 1 ? [cy, 4 - cx] : r === 2 ? [4 - cx, 4 - cy] : [4 - cy, cx];
    const b = sim.led[sy * 5 + sx] || 0;
    c.fillStyle = b ? `rgb(${60 + b * 1.95},${60 + b * 1.75},${70 + b * 0.2})` : '#2c2f37';
    c.fillRect(8 + cx * 22, 8 + cy * 22, 18, 18);
  }
  ledTex.needsUpdate = true;
  const pc = new THREE.Color(POWER[sim.powerColor] || '#ffffff'); powerMat.color.copy(pc); powerMat.emissive.copy(pc);
  let col = '#9aa0a6'; try { col = COLOR_HEX[sim.color()] || col; } catch (e) { /* 略 */ }
  colorLedMat.color.set(col); colorLedMat.emissive.set(col);
  btnL.position.y = sim.buttons.left ? 1.5 : 1.65; btnR.position.y = sim.buttons.right ? 1.5 : 1.65;
}

function frame() {
  raf = requestAnimationFrame(frame);
  const sim = SP.sim; if (!sim) return;
  const w = host.clientWidth, h = host.clientHeight;
  if (w && h && (w !== lastW || h !== lastH)) { lastW = w; lastH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  // 車子：位置與方向
  rig.position.set(sim.x - 150, sim.lifted ? 3 : 0, sim.y - 100); rig.rotation.y = -sim.th;      // 架起來：車子離地 3 公分，輪子照樣轉
  // 輪子：馬達編碼器的度數（正＝車子往前）→ 繞車軸轉動
  wheelL.rotation.x = -sim.mL.deg * Math.PI / 180; wheelR.rotation.x = -sim.mR.deg * Math.PI / 180;
  // 場地改了（貼色紙、換場景）就更新地板；軌跡有變就更新（最多每 0.2 秒一次）
  if (bgVer !== sim.bgVersion) { floorTex.needsUpdate = true; bgVer = sim.bgVersion; }
  const now = performance.now();
  if (trailVer !== sim.trailVersion && now - trailAt > 200) { trailTex.needsUpdate = true; trailVer = sim.trailVersion; trailAt = now; }
  syncRects();
  updateTextures();
  // 跟隨小車：鏡頭跟著車子平移，但保留使用者轉出來的角度和距離
  if (mode === 'follow') {
    const p = robotPos();
    if (lastPos) camera.position.add(p.clone().sub(lastPos));
    controls.target.set(p.x, controls.target.y > 0.5 ? 3.2 : 0, p.z); lastPos = p;
  }
  controls.update();
  renderer.render(scene, camera);
}

SP.car3d = {
  start(el) {
    host = el;
    if (!ready) {
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.shadowMap.enabled = true; renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
      host.appendChild(renderer.domElement); build(); ready = true;
    } else if (renderer.domElement.parentNode !== host) host.appendChild(renderer.domElement);
    lastW = lastH = 0; cancelAnimationFrame(raf); frame();
  },
  stop() { cancelAnimationFrame(raf); raf = 0; },
  setView(name) { if (ready) setView(name); },
  setMode(m) { if (ready) setMode(m); },
  isRunning: () => !!raf,
  debug: () => ({ wl: wheelL.rotation.x, wr: wheelR.rotation.x, cam: camera.position.toArray(), dist: camera.position.distanceTo(controls.target), mode, rig: [rig.position.x, rig.position.z, rig.rotation.y], rects: rectMeshes.size, target: controls.target.toArray() }),
};
document.dispatchEvent(new Event('car3d-ready'));
