/* SPIKE 小車 3D 預覽（Three.js）：可旋轉、縮放；輪子、燈陣、電源鍵燈、顏色感測器燈跟著模擬器動。
   模型是依模擬器的尺寸（輪徑 5.6 公分、輪距 11.2 公分）簡化的示意模型，不是官方三視圖或官方 3D 檔。
   座標單位：公分；車頭朝 -Z，右邊是 +X，上方是 +Y。 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const SP = window.SP;
const POWER = { 0: '#222222', 1: '#ff2bd0', 2: '#8a2be2', 3: '#2a62ff', 4: '#40c0ff', 5: '#20e0c0', 6: '#22c55e', 7: '#ffd400', 8: '#ff8c1a', 9: '#ff2d2d', 10: '#ffffff' };
const COLOR_HEX = { red: '#d93025', yellow: '#f2c400', green: '#1e9e4a', blue: '#1a60d6', white: '#ffffff', black: '#111111', none: '#9aa0a6' };

let renderer, scene, camera, controls, host, raf = 0, ready = false;
let wheelL, wheelR, floorTex, ledCtx, ledTex, powerMat, colorLedMat, btnL, btnR, hubGroup;
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
  scene.fog = new THREE.Fog('#e9edf3', 90, 220);
  camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);
  scene.add(new THREE.HemisphereLight('#ffffff', '#9aa3b5', 0.95));
  const sun = new THREE.DirectionalLight('#ffffff', 1.25);
  sun.position.set(24, 40, -18); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 5, far: 120 }); scene.add(sun);

  // 地板：10 公分一格，隨車子走過的距離往後捲動
  const fc = document.createElement('canvas'); fc.width = fc.height = 256;
  const f = fc.getContext('2d'); f.fillStyle = '#f7f6ef'; f.fillRect(0, 0, 256, 256);
  f.strokeStyle = '#d4d1c4'; f.lineWidth = 3; f.strokeRect(0, 0, 256, 256);
  f.lineWidth = 1; f.beginPath(); f.moveTo(128, 0); f.lineTo(128, 256); f.moveTo(0, 128); f.lineTo(256, 128); f.stroke();
  floorTex = new THREE.CanvasTexture(fc); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(20, 20); floorTex.colorSpace = THREE.SRGBColorSpace;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const car = new THREE.Group(); scene.add(car);
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
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 12, maxDistance: 90, maxPolarAngle: Math.PI / 2 - 0.02, enablePan: true, screenSpacePanning: true });
  controls.target.set(0, 3.2, 0);
  setView('iso');
}

const VIEWS = {
  iso: [26, 20, -30], front: [0, 6, -42], back: [0, 6, 42], right: [42, 6, 0], left: [-42, 6, 0], top: [0, 58, 0.01],
};
function setView(name) {
  const v = VIEWS[name] || VIEWS.iso; camera.position.set(...v);
  controls.target.set(0, name === 'top' ? 0 : 3.2, 0); controls.update();
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
  // 輪子：馬達編碼器的度數（正＝車子往前）→ 繞車軸轉動
  wheelL.rotation.x = -sim.mL.deg * Math.PI / 180; wheelR.rotation.x = -sim.mR.deg * Math.PI / 180;
  // 地板跟著車子走過的距離往後捲（10 公分 = 貼圖的 1 格，每張貼圖 10 公分）
  const travel = ((sim.mL.deg + sim.mR.deg) / 2) * Math.PI * sim.wheelD / 360;
  floorTex.offset.y = (travel / 10) % 1;
  updateTextures();
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
  isRunning: () => !!raf,
  debug: () => ({ wl: wheelL.rotation.x, wr: wheelR.rotation.x, cam: camera.position.toArray(), dist: camera.position.distanceTo(controls.target), tex: floorTex.offset.y }),
};
document.dispatchEvent(new Event('car3d-ready'));
