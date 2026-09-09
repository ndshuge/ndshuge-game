/* ============================================================
   重力花园 · Gravity Garden
   three.js + cannon.js 真实刚体物理 · 点击即玩（双击 index.html 也可玩）
   手感层（音效/震动/粒子）独立模块，物理参数集中在 CFG
   ============================================================ */
/* 库以 UMD 形式从 window 全局获取（无需 ES module，兼容所有浏览器与 file:// 打开） */
var THREE = window.THREE;
var CANNON = window.CANNON;
var RoomEnvironment = window.RoomEnvironment;

/* ---------------- CFG：所有物理与手感参数集中于此 ---------------- */
const CFG = {
  gravityModes: [[0,-9.82,0],[0,9.82,0],[-9.82,0,0],[9.82,0,0],[0,0,0]],
  gravityNames: ['下','上','左','右','零'],
  gravityArrows: ['↓','↑','←','→','〇'],
  spawnEvery: 0.115,          // 按住时生成间隔（秒）
  bodyCap: 240,               // 刚体上限，超出移除最老
  killRadius: 58,             // 飞出此半径回收
  explosion: { radius: 9, strength: 85, upBias: 0.55 },
  gravityField: { radius: 200, strength: 62 },  // 引力场：覆盖全图，强力吸引
  // 莫兰迪/暮色系调色板 [r,g,b] 0..1
  palette: [
    [0.85,0.63,0.40],[0.78,0.43,0.36],[0.56,0.64,0.72],[0.48,0.56,0.47],
    [0.72,0.63,0.56],[0.63,0.47,0.56],[0.43,0.48,0.59],[0.81,0.66,0.48],
    [0.54,0.44,0.36],[0.47,0.55,0.62],[0.80,0.55,0.52],[0.62,0.55,0.70],
  ],
  shapeWeights: { sphere: 0.40, box: 0.34, cylinder: 0.26 },
};

/* ---------------- FEEL：手感层（音效合成 / 震动 / 反馈） ---------------- */
class SFX {
  constructor() { this.ctx = null; this.master = null; this.noiseBuf = null; this.lastSpawnT = 0; }
  ensure() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(f0, 1), t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  noise(dur, f0, f1, vol, delay = 0, q = 1) {
    if (!this.ctx || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const flt = this.ctx.createBiquadFilter();
    flt.type = 'lowpass'; flt.Q.value = q;
    flt.frequency.setValueAtTime(Math.max(f0, 20), t0);
    flt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(flt).connect(g).connect(this.master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
  // 碰撞：强度 s ∈ [0,1]，三层：thump + body noise + 重碰 crack
  impact(s) {
    const d = 0.10 + s * 0.06;
    this.tone('sine', 150 - s * 30, 52, d, 0.08 + 0.3 * s);
    this.noise(d * 0.9, 1300 - s * 550, 190, 0.06 + 0.24 * s, 0, 1.6);
    if (s > 0.66) this.tone('triangle', 1560, 680, 0.09, 0.2 * s);
  }
  spawn() {
    const now = performance.now();
    if (now - this.lastSpawnT < 45) return; // 批量生成时防音效轰炸
    this.lastSpawnT = now;
    this.noise(0.06, 2800, 950, 0.13, 0, 2.2);
    this.tone('sine', 360, 160, 0.09, 0.09);
  }
  explode() {
    this.tone('sine', 132, 30, 0.78, 0.95);
    this.noise(0.75, 2400, 130, 0.8, 0, 0.7);
    this.tone('triangle', 1900, 340, 0.22, 0.45);
    this.noise(1.1, 320, 55, 0.55, 0.06, 1.2);
  }
  gravity() {
    this.tone('sine', 150, 640, 0.4, 0.22);
    this.tone('triangle', 300, 950, 0.34, 0.1, 0.03);
  }
  clear() {
    this.tone('sine', 640, 150, 0.35, 0.2);
    this.noise(0.28, 2200, 320, 0.16, 0.02, 1.5);
  }
}
const sfx = new SFX();

/* 全屏白闪（清空时） */
const flashDiv = document.getElementById('flash');
function whiteFlash() {
  flashDiv.style.transition = 'none';
  flashDiv.style.opacity = 0.85;
  void flashDiv.offsetWidth;
  flashDiv.style.transition = 'opacity .55s';
  flashDiv.style.opacity = 0;
}
/* 大字提示 */
const toastEl = document.getElementById('toast');
let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, 950);
}

/* ---------------- SCENE：渲染 / 相机 / 光 / 环境 ---------------- */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.getElementById('fatal').style.display = 'flex';
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const vw = () => window.innerWidth || document.documentElement.clientWidth || 1280;
const vh = () => window.innerHeight || document.documentElement.clientHeight || 720;
renderer.setSize(vw(), vh());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputEncoding = THREE.sRGBEncoding; // r128 UMD 的色彩管理
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, vw() / vh(), 0.1, 300);

/* 天空渐变背景（暮色） */
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 4; skyCanvas.height = 256;
{
  const g = skyCanvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0.00, '#141a2e');
  grad.addColorStop(0.42, '#2b3552');
  grad.addColorStop(0.72, '#6d5a63');
  grad.addColorStop(0.88, '#c96f4d');
  grad.addColorStop(1.00, '#e08a5c');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
}
scene.background = new THREE.CanvasTexture(skyCanvas);

/* 环境反射（给材质真实釉面感） */
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
}

/* 雾：与地平线暖色融合 */
scene.fog = new THREE.Fog(0x8a6a5e, 35, 125);

/* 落日 */
{
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(7, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xff9a5c, fog: false })
  );
  sun.position.set(-40, 16, -30);
  scene.add(sun);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(12, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xff8a4a, transparent: true, opacity: 0.22, fog: false })
  );
  glow.position.copy(sun.position);
  scene.add(glow);
}

/* 光 */
scene.add(new THREE.HemisphereLight(0x7d8fbf, 0x3a3028, 0.5));
const sunLight = new THREE.DirectionalLight(0xffb37a, 1.9);
sunLight.position.set(-12, 14, -4);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -22; sunLight.shadow.camera.right = 22;
sunLight.shadow.camera.top = 22; sunLight.shadow.camera.bottom = -22;
sunLight.shadow.camera.near = 1; sunLight.shadow.camera.far = 70;
sunLight.shadow.bias = -0.0006;
scene.add(sunLight);
const fillLight = new THREE.DirectionalLight(0x7f9dd4, 0.55);
fillLight.position.set(8, 10, 12);
scene.add(fillLight);

/* 地面 */
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x2b2628, roughness: 0.42, metalness: 0.32, envMapIntensity: 0.8,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(84, 42, 0xffffff, 0xffffff);
if (Array.isArray(grid.material)) grid.material.forEach(m => { m.transparent = true; m.opacity = 0.055; });
else { grid.material.transparent = true; grid.material.opacity = 0.055; }
grid.position.y = 0.02;
scene.add(grid);

/* 重力方向悬浮箭头 */
const arrowGroup = new THREE.Group();
{
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.85, 12),
    new THREE.MeshBasicMaterial({ color: 0xffe3bd, transparent: true, opacity: 0.9, fog: false })
  );
  shaft.position.y = -0.42;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.42, 18),
    new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.95, fog: false })
  );
  tip.position.y = -1.0;
  tip.rotation.x = Math.PI; // 尖端朝下
  arrowGroup.add(shaft, tip);
}
arrowGroup.position.set(0, 10.5, 0);
scene.add(arrowGroup);
const arrowMats = [];
arrowGroup.traverse(o => { if (o.isMesh) arrowMats.push(o.material); });

/* ---------------- 粒子 / 冲击环 / 爆炸光 ---------------- */
function makeDotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const dotTex = makeDotTexture();

const MAXP = 900;
class Particles {
  constructor() {
    this.pos = new Float32Array(MAXP * 3);
    this.col = new Float32Array(MAXP * 3);
    this.base = new Float32Array(MAXP * 3);
    this.vel = new Float32Array(MAXP * 3);
    this.life = new Float32Array(MAXP);
    this.maxLife = new Float32Array(MAXP);
    this.grav = new Float32Array(MAXP);
    this.drag = new Float32Array(MAXP);
    this.ptr = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.PointsMaterial({
      size: 0.13, map: dotTex, vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
    for (let i = 0; i < MAXP; i++) this.pos[i * 3 + 1] = -9999;
  }
  emit(pos, opts) {
    const n = opts.count || 10;
    const colors = opts.colors || [[1, 1, 1]];
    const dir = opts.dir || [0, 1, 0];
    const speed = opts.speed || 4;
    const spread = opts.spread || 2.4;
    const up = opts.up || 0.5;
    for (let k = 0; k < n; k++) {
      const i = this.ptr = (this.ptr + 1) % MAXP;
      const i3 = i * 3;
      this.pos[i3] = pos[0] + (Math.random() - 0.5) * 0.25;
      this.pos[i3 + 1] = pos[1] + (Math.random() - 0.5) * 0.25;
      this.pos[i3 + 2] = pos[2] + (Math.random() - 0.5) * 0.25;
      const vx = dir[0] * speed * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * spread;
      const vy = dir[1] * speed * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * spread + up;
      const vz = dir[2] * speed * (0.4 + Math.random() * 0.8) + (Math.random() - 0.5) * spread;
      this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
      const c = colors[(Math.random() * colors.length) | 0];
      const j3 = i * 3;
      this.base[j3] = c[0]; this.base[j3 + 1] = c[1]; this.base[j3 + 2] = c[2];
      this.col[j3] = c[0]; this.col[j3 + 1] = c[1]; this.col[j3 + 2] = c[2];
      this.life[i] = this.maxLife[i] = (opts.life || 0.7) * (0.5 + Math.random() * 0.7);
      this.grav[i] = opts.gravity || 6.5;
      this.drag[i] = opts.drag || 1.4;
    }
    this.points.visible = true;
  }
  update(dt) {
    for (let i = 0; i < MAXP; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.life[i] <= 0) {
        this.pos[i3 + 1] = -9999;
        continue;
      }
      const d = 1 - Math.min(this.drag[i] * dt, 0.9);
      this.vel[i3] *= d; this.vel[i3 + 1] *= d; this.vel[i3 + 2] *= d;
      this.vel[i3 + 1] -= this.grav[i] * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const k = Math.max(this.life[i] / this.maxLife[i], 0);
      this.col[i3] = this.base[i3] * k;
      this.col[i3 + 1] = this.base[i3 + 1] * k;
      this.col[i3 + 2] = this.base[i3 + 2] * k;
    }
  }
}
const particles = new Particles();

class Rings {
  constructor() {
    this.pool = [];
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(0.92, 1, 40),
        new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0,
          side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
        })
      );
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, life: 0, max: 1, r1: 5, color: 0xffffff });
    }
    this.i = 0;
  }
  boom(pos, r, color) {
    const p = this.pool[this.i++ % this.pool.length];
    p.m.position.set(pos[0], pos[1], pos[2]);
    p.m.lookAt(camera.position);
    p.m.visible = true;
    p.m.material.color.set(color);
    p.life = p.max = 0.48;
    p.r1 = r;
    const s0 = 0.1;
    p.m.scale.set(s0, s0, 1);
  }
  update(dt) {
    for (const p of this.pool) {
      if (!p.visible) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      const k = 1 - p.life / p.max;
      const ease = 1 - Math.pow(1 - k, 3);
      const s = 0.1 + (p.r1 - 0.1) * ease;
      p.m.scale.set(s, s, 1);
      p.m.material.opacity = (1 - k) * 0.85;
      p.m.lookAt(camera.position);
    }
  }
}
const rings = new Rings();

class ExplosionLight {
  constructor() {
    this.sphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({
        color: 0xffa55c, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      })
    );
    this.sphere.visible = false;
    scene.add(this.sphere);
    this.light = new THREE.PointLight(0xffa55c, 0, 30, 2);
    this.light.visible = false;
    scene.add(this.light);
  }
  fire(pos, radius) {
    this.sphere.position.set(pos[0], pos[1], pos[2]);
    this.light.position.copy(this.sphere.position);
    this.sphere.visible = this.light.visible = true;
    this.sphere.scale.setScalar(0.15);
    this.sphere.material.opacity = 0.85;
    this.light.intensity = 60;
    this.r = radius;
    this.t = 0;
  }
  update(dt) {
    if (!this.sphere.visible) return;
    this.t += dt;
    const k = this.t / 0.42;
    if (k >= 1) { this.sphere.visible = this.light.visible = false; return; }
    const ease = 1 - Math.pow(1 - k, 2.4);
    this.sphere.scale.setScalar(0.15 + (this.r - 0.15) * ease);
    this.sphere.material.opacity = (1 - k) * 0.85;
    this.light.intensity = 60 * (1 - k);
  }
}
const boomLight = new ExplosionLight();

/* ---------------- PHYSICS：cannon 刚体世界 ---------------- */
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // cannon 0.6.2 构造忽略 options，需显式设置重力
world.dispatchEvents = true; // 派发 collide 事件（默认关闭）
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.solver.iterations = 14;
world.defaultContactMaterial.friction = 0.3;
world.defaultContactMaterial.restitution = 0.25;

const matShape = new CANNON.Material('shape');
const matGround = new CANNON.Material('ground');
world.addContactMaterial(new CANNON.ContactMaterial(matGround, matShape, { friction: 0.36, restitution: 0.34 }));
world.addContactMaterial(new CANNON.ContactMaterial(matShape, matShape, { friction: 0.45, restitution: 0.26 }));

const groundBody = new CANNON.Body({
  mass: 0, material: matGround, shape: new CANNON.Plane(),
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

/* ---------------- BODIES：刚体与网格管理 ---------------- */
const bodies = [];       // {body, mesh}
const objects = [ground]; // raycaster 目标
const countEl = document.getElementById('count');
const wallSet = new Set(); // 墙面 mesh（用于生成点取反）

/* 封闭盒子：四面墙 + 顶（半透明玻璃 + 发光边线，物体出不去） */
const BOX = { half: 45, height: 35, thick: 3 };
function buildWalls() {
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x5a7a9a, transparent: true, opacity: 0.15, roughness: 0.18, metalness: 0.5,
    side: THREE.DoubleSide, envMapIntensity: 1.3, depthWrite: false,
  });
  const edgeMat = new THREE.LineBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.55 });
  const panels = [
    { p: [0, BOX.height / 2, -BOX.half], s: [BOX.half, BOX.height / 2, BOX.thick / 2] },
    { p: [0, BOX.height / 2, BOX.half], s: [BOX.half, BOX.height / 2, BOX.thick / 2] },
    { p: [-BOX.half, BOX.height / 2, 0], s: [BOX.thick / 2, BOX.height / 2, BOX.half] },
    { p: [BOX.half, BOX.height / 2, 0], s: [BOX.thick / 2, BOX.height / 2, BOX.half] },
    { p: [0, BOX.height, 0], s: [BOX.half, BOX.thick / 2, BOX.half] },
  ];
  for (const { p, s } of panels) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2), wallMat);
    m.position.set(p[0], p[1], p[2]);
    m.renderOrder = 2;
    m.receiveShadow = true;
    scene.add(m);
    objects.push(m);
    wallSet.add(m);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), edgeMat);
    e.position.copy(m.position);
    e.renderOrder = 3;
    scene.add(e);
    const b = new CANNON.Body({ mass: 0, material: matShape, shape: new CANNON.Box(new CANNON.Vec3(s[0], s[1], s[2])) });
    b.position.set(p[0], p[1], p[2]);
    world.addBody(b);
  }
}
buildWalls();
window.__collideCount = 0;

function updateCount() {
  countEl.textContent = bodies.length + ' 件';
}

function makeMesh(type, size, color) {
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color[0], color[1], color[2]),
    roughness: 0.26 + Math.random() * 0.24,
    metalness: 0.12 + Math.random() * 0.22,
    envMapIntensity: 1.0,
  });
  let geo, s = new THREE.Vector3(1, 1, 1);
  if (type === 'sphere') geo = new THREE.SphereGeometry(1, 26, 18);
  else if (type === 'box') geo = new THREE.BoxGeometry(1, 1, 1);
  else geo = new THREE.CylinderGeometry(1, 1, 1, 24);
  if (type === 'sphere') s.set(size, size, size);
  else if (type === 'box') s.set(size, size, size);
  else s.set(size, size * 1.6, size);
  const m = new THREE.Mesh(geo, mat);
  m.scale.copy(s);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function makeBody(type, size) {
  let shape;
  if (type === 'sphere') shape = new CANNON.Sphere(size);
  else if (type === 'box') shape = new CANNON.Box(new CANNON.Vec3(size / 2, size / 2, size / 2));
  else shape = new CANNON.Cylinder(size, size, size * 1.6, 14);
  const vol = type === 'sphere' ? (4 / 3) * Math.PI * size ** 3
    : type === 'box' ? size ** 3
    : Math.PI * size * size * size * 1.6;
  const rho = 1.2 + Math.random() * 1.6;
  const mass = Math.min(Math.max(vol * rho, 0.25), 70);
  const body = new CANNON.Body({ mass, material: matShape, shape });
  body.sleepSpeedLimit = 0.08;
  body.sleepTimeLimit = 1.4;
  if (type === 'cylinder') {
    // cannon 圆柱沿局部 z 轴，转 90° 对齐 three 的 y 轴
    // 注意：cannon 0.6.2 的 setFromAxisAngle/setFromEuler 不返回 this，不能用链式调用
    const qx = new CANNON.Quaternion();
    qx.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), Math.PI / 2);
    const q = new CANNON.Quaternion();
    q.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, 0);
    body.quaternion = q.mult(qx);
  } else {
    body.quaternion.setFromEuler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
  }
  // 所有物体开 CCD：全图引力汇聚时高速运动防穿透
  body.ccdSpeedThreshold = 5;
  body.ccdIterations = 10;
  return body;
}

function spawnShape(pos, normal) {
  const r = Math.random();
  let type = 'sphere';
  if (r < CFG.shapeWeights.sphere) type = 'sphere';
  else if (r < CFG.shapeWeights.sphere + CFG.shapeWeights.box) type = 'box';
  else type = 'cylinder';
  // 8% 概率大块头
  const big = Math.random() < 0.08;
  let size;
  if (type === 'sphere') size = 0.2 + Math.random() * 0.35;
  else if (type === 'box') size = 0.38 + Math.random() * 0.38;
  else size = 0.26 + Math.random() * 0.26;
  if (big) size *= 1.7;

  const color = CFG.palette[(Math.random() * CFG.palette.length) | 0];
  const body = makeBody(type, size);
  const mesh = makeMesh(type, size, color);

  const jx = (Math.random() - 0.5) * 0.3;
  const jy = (Math.random() - 0.5) * 0.2;
  const jz = (Math.random() - 0.5) * 0.3;
  body.position.set(
    pos.x + normal.x * 0.55 + jx,
    pos.y + normal.y * 0.55 + jy + 0.1,
    pos.z + normal.z * 0.55 + jz
  );
  body.userData = { color };
  mesh.position.copy(body.position);

  world.addBody(body);
  scene.add(mesh);
  objects.push(mesh);
  bodies.push({ body, mesh });

  // 上限维护
  while (bodies.length > CFG.bodyCap) removeBody(0);
  updateCount();
  sfx.spawn();
  rings.boom([body.position.x, body.position.y, body.position.z], 0.8, 0xffd9a0);
}

function removeBody(idx) {
  const { body, mesh } = bodies[idx];
  world.removeBody(body);
  scene.remove(mesh);
  const oi = objects.indexOf(mesh);
  if (oi >= 0) objects.splice(oi, 1);
  bodies.splice(idx, 1);
  updateCount();
}

function clearAll() {
  whiteFlash();
  sfx.clear();
  while (bodies.length) {
    const { body, mesh } = bodies[0];
    particles.emit(
      [body.position.x, body.position.y, body.position.z],
      { count: 5, speed: 2.2, spread: 2, colors: [body.userData.color], life: 0.55, gravity: 3 }
    );
    world.removeBody(body);
    scene.remove(mesh);
    const oi = objects.indexOf(mesh);
    if (oi >= 0) objects.splice(oi, 1);
    bodies.splice(0, 1);
  }
  updateCount();
  if (gi === GRAV_NONE) showToast('重力 · 零 · 清空');
}

/* ---------------- 交互输入 ---------------- */
const pointer = { ndc: { x: 0, y: 0 }, down: false, spawnAcc: 0 };
const canvas = renderer.domElement;
canvas.style.touchAction = 'none';

const ray = new THREE.Raycaster();
function raycastWorld(ndc) {
  camera.updateMatrixWorld(); // 确保射线使用当前相机姿态（否则用上一帧矩阵，点击会飘）
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(objects, false);
  if (hits.length) {
    const o = hits[0].object;
    const n = hits[0].face.normal.clone().transformDirection(o.matrixWorld).normalize();
    return { point: hits[0].point.clone(), normal: n, isWall: wallSet.has(o) };
  }
  const d = ray.ray.direction;
  if (Math.abs(d.y) > 1e-5) {
    const t = -ray.ray.origin.y / d.y;
    if (t > 0) return { point: ray.ray.origin.clone().addScaledVector(d, t), normal: new THREE.Vector3(0, 1, 0), isWall: false };
  }
  return null;
}

function setNdc(cx, cy) {
  pointer.ndc.x = (cx / Math.max(vw(), 1)) * 2 - 1;
  pointer.ndc.y = -(cy / Math.max(vh(), 1)) * 2 + 1;
}

canvas.addEventListener('pointerdown', (e) => {
  sfx.ensure();
  sfx.resume();
  setNdc(e.clientX, e.clientY);
  if (e.button === 0) {
    pointer.down = true;
    pointer.spawnAcc = 0;
    if (leftMode === 'spawn') spawnShapeAtPointer();
    else {
      // 引力场：按下瞬间锁定吸引中心（不再跟随射线，物体不会堆到相机面前）
      const hit = raycastWorld(pointer.ndc);
      gravCenter = hit ? { x: hit.point.x, y: hit.point.y, z: hit.point.z } : null;
    }
  } else if (e.button === 2) {
    explodeAtPointer();
  }
});
window.addEventListener('pointerup', () => { pointer.down = false; gravCenter = null; });
canvas.addEventListener('pointerleave', () => { pointer.down = false; gravCenter = null; });
window.addEventListener('blur', () => { pointer.down = false; gravCenter = null; });
let lastMouse = null;
const mouseSens = 0.005; // 鼠标视角灵敏度（拖一个屏幕宽 ≈ 转一圈）
window.addEventListener('pointermove', (e) => {
  setNdc(e.clientX, e.clientY);
  if (lastMouse) {
    const dx = e.clientX - lastMouse.x;
    const dy = e.clientY - lastMouse.y;
    cam.yaw -= dx * mouseSens;
    cam.pitch = Math.min(Math.max(cam.pitch - dy * mouseSens, -1.5), 1.5); // ±86°，可看天看地
  }
  lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

function spawnShapeAtPointer() {
  const hit = raycastWorld(pointer.ndc);
  if (hit) {
    if (hit.isWall) hit.normal.negate(); // 点击墙面：往盒内生成，避免生成到墙外
    spawnShape(hit.point, hit.normal);
  }
}

function explodeAtPointer() {
  const hit = raycastWorld(pointer.ndc);
  if (!hit) return;
  const P = hit.point;
  const c = new CANNON.Vec3(P.x, P.y, P.z);
  const { radius: R, strength: S, upBias } = CFG.explosion;
  for (const { body } of bodies) {
    const d = body.position.vsub(c);
    const dist = d.length();
    if (dist > R) continue;
    let dir = d.clone();
    if (dir.length() < 0.02) dir.set(0, 1, 0);
    dir.normalize();
    dir.y += upBias;
    dir.normalize();
    const f = S * (1 - dist / R) * (0.55 + Math.random() * 0.9);
    body.applyImpulse(dir.scale(f * body.mass), new CANNON.Vec3(0, 0, 0));
  }
  rings.boom([P.x, P.y, P.z], R, 0xffb36b);
  boomLight.fire([P.x, P.y, P.z], R);
  particles.emit([P.x, P.y, P.z], {
    count: 90, speed: 8, spread: 5, up: 2.5,
    colors: [[0.55, 0.5, 0.45], [0.62, 0.55, 0.48], [0.75, 0.62, 0.5]],
    life: 0.9, gravity: 5, drag: 1.2,
  });
  particles.emit([P.x, P.y, P.z], {
    count: 44, speed: 12, spread: 4, up: 3.5,
    colors: [[1, 0.66, 0.32], [1, 0.82, 0.5], [1, 0.55, 0.28]],
    life: 0.6, gravity: 4, drag: 0.9,
  });
  sfx.explode();
  shake = Math.min(shake + 0.8, 1.2);
}

/* 重力切换 */
const GRAV_NONE = 4;
let gi = 0;
const gravArrowEl = document.getElementById('gravArrow');
let arrowQ = new THREE.Quaternion();
let arrowTarget = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -1, 0));

function applyGravity() {
  world.gravity.set(CFG.gravityModes[gi][0], CFG.gravityModes[gi][1], CFG.gravityModes[gi][2]);
  gravArrowEl.textContent = CFG.gravityArrows[gi];
  // 睡眠的刚体不受重力变化影响，必须唤醒
  for (const { body } of bodies) body.wakeUp();
  if (gi === GRAV_NONE) {
    arrowTarget = arrowQ.clone();
    for (const m of arrowMats) m.opacity = 0.14;
  } else {
    const g = CFG.gravityModes[gi];
    const v = new THREE.Vector3(g[0], g[1], g[2]).normalize();
    arrowTarget = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), v);
    for (const m of arrowMats) m.opacity = 0.9;
  }
}

function cycleGravity() {
  gi = (gi + 1) % CFG.gravityModes.length;
  applyGravity();
  sfx.gravity();
  showToast('重力 · ' + CFG.gravityNames[gi]);
}

/* ---------------- 自由漫游相机 ---------------- */
const cam = {
  pos: new THREE.Vector3(0, 18, 34), // 初始远景机位
  yaw: 0,          // 水平朝向（初始看向 -z，即舞台中心）
  pitch: -0.44,    // 初始俯角 ~25°
  speed: 13,       // 移动速度
  rotSpeed: 2.6,   // 键盘转向速度
  upSpeed: 10,     // 升降速度
};
const keysDown = new Set();

function updateCamera(dt) {
  const k = keysDown;
  // 相机朝向：rotation.order='YXZ' 下 forward 水平分量为 (-sin yaw, -cos yaw)
  const fw = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  let mx = 0, mz = 0, my = 0, ry = 0;
  if (k.has('ArrowUp') || k.has('KeyW')) { mx += fw; mz += fz; }
  if (k.has('ArrowDown') || k.has('KeyS')) { mx -= fw; mz -= fz; }
  if (k.has('ArrowLeft') || k.has('KeyA')) ry += 1;
  if (k.has('ArrowRight') || k.has('KeyD')) ry -= 1;
  if (k.has('ShiftLeft') || k.has('ShiftRight')) my += 1;
  if (k.has('ControlLeft') || k.has('ControlRight')) my -= 1;
  if (mx || mz) {
    const len = Math.hypot(mx, mz);
    cam.pos.x += (mx / len) * cam.speed * dt;
    cam.pos.z += (mz / len) * cam.speed * dt;
  }
  if (my) cam.pos.y = Math.min(Math.max(cam.pos.y + my * cam.upSpeed * dt, 1), 80);
  if (ry) cam.yaw += ry * cam.rotSpeed * dt;
  // 限制相机在封闭盒子内（盒子 XZ ±45、顶 35）
  cam.pos.x = Math.min(Math.max(cam.pos.x, -43), 43);
  cam.pos.z = Math.min(Math.max(cam.pos.z, -43), 43);
  cam.pos.y = Math.min(Math.max(cam.pos.y, 1), 33);
  // 朝向：YXZ 顺序直接设置旋转，任意俯仰都不会翻转
  camera.position.copy(cam.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(cam.pitch, cam.yaw, 0);
  // 震屏叠加
  if (shake > 0.0015) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.55;
    camera.position.y += (Math.random() - 0.5) * shake * 0.55;
    camera.position.z += (Math.random() - 0.5) * shake * 0.55;
    shake *= Math.exp(-dt * 5.5);
  } else shake = 0;
}

/* ---------------- 左键模式切换（撒下 / 引力场） ---------------- */
let leftMode = 'spawn'; // 'spawn' | 'gravity'
const modeNameEl = document.getElementById('modeName');
function toggleLeftMode() {
  leftMode = leftMode === 'spawn' ? 'gravity' : 'spawn';
  modeNameEl.textContent = leftMode === 'spawn' ? '撒下' : '引力场';
  showToast('左键 · ' + (leftMode === 'spawn' ? '撒下' : '引力场'));
  sfx.gravity();
  if (leftMode !== 'gravity') { gravField.visible = false; gravCore.visible = false; }
}

/* 引力场视觉（半透明发光球 + 中心亮点） */
const gravField = new THREE.Mesh(
  new THREE.SphereGeometry(1, 20, 14),
  new THREE.MeshBasicMaterial({ color: 0x6fb4ff, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
gravField.visible = false;
scene.add(gravField);
const gravCore = new THREE.Mesh(
  new THREE.SphereGeometry(0.16, 12, 8),
  new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })
);
gravCore.visible = false;
scene.add(gravCore);

/* 引力场：把半径内物体吸向按下时锁定的位置（锁定中心，避免物体被吸到相机面前） */
let gravCenter = null;
function applyGravityField() {
  if (!gravCenter) { gravField.visible = false; gravCore.visible = false; return; }
  const P = gravCenter;
  const R = CFG.gravityField.radius;
  if (R > 30) {
    // 全图模式：不显示巨大光球（挡视线），只留中心亮点
    gravField.visible = false;
    gravCore.position.set(P.x, P.y, P.z);
    gravCore.visible = true;
  } else {
    gravField.position.set(P.x, P.y, P.z);
    gravField.scale.setScalar(R);
    gravField.visible = true;
    gravCore.position.set(P.x, P.y, P.z);
    gravCore.visible = true;
  }
  const c = new CANNON.Vec3(P.x, P.y, P.z);
  const VMAX_APPROACH = 22; // 朝中心的速度上限（防止高速穿墙）
  for (const { body } of bodies) {
    const d = body.position.vsub(c);
    const dist = d.length();
    if (dist > R || dist < 0.02) continue;
    body.wakeUp();
    d.normalize();
    // 朝中心接近速度钳制：接近太快时抵消超出部分
    const approach = -body.velocity.dot(d);
    if (approach > VMAX_APPROACH) {
      body.velocity.vsub(d.scale(approach - VMAX_APPROACH), body.velocity);
    }
    const f = CFG.gravityField.strength * (1 - dist / R);
    body.applyForce(d.scale(-f * body.mass), new CANNON.Vec3(0, 0, 0));
  }
}

/* 数字键批量生成：在鼠标指向处撒下 n 个（从上方落下形成堆） */
function batchSpawn(n) {
  const hit = raycastWorld(pointer.ndc);
  if (!hit) return;
  const P = hit.point;
  if (hit.isWall) hit.normal.negate(); // 点击墙面：往盒内生成
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 0.5 + Math.random() * 2.0;
    spawnShape(
      new THREE.Vector3(
        P.x + Math.cos(ang) * rad,
        P.y + 2.0 + Math.random() * 3.0,
        P.z + Math.sin(ang) * rad
      ),
      hit.normal
    );
  }
  showToast('撒下 ' + n + ' 个');
}

window.addEventListener('keydown', (e) => {
  // 阻止浏览器默认行为（方向键滚动、Ctrl+W/R 关页刷新等）
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyC', 'KeyG', 'KeyR'].includes(e.code)) e.preventDefault();
  if (e.ctrlKey && ['KeyW', 'KeyR', 'KeyC', 'KeyG', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keysDown.add(e.code);
  if (e.code === 'Space') cycleGravity();
  else if (e.code === 'KeyC') clearAll();
  else if (e.code === 'KeyG') { gi = 0; applyGravity(); showToast('重力 · 下'); sfx.gravity(); }
  else if (e.code === 'KeyR') toggleLeftMode();
  else if (e.code.startsWith('Digit') || e.code.startsWith('Numpad')) {
    let n;
    if (e.code.startsWith('Numpad')) n = e.code === 'Numpad0' ? 10 : parseInt(e.code.slice(6), 10);
    else n = e.code === 'Digit0' ? 10 : parseInt(e.code.slice(5), 10);
    batchSpawn(n);
  }
});
window.addEventListener('keyup', (e) => keysDown.delete(e.code));
window.addEventListener('blur', () => { keysDown.clear(); pointer.down = false; });

/* ---------------- 碰撞反馈（轮询 world.contacts，不依赖事件分发） ---------------- */
let prevContactSet = new Set();
window.__dbg = { contactsLen: 0, newPairs: 0, candidates: 0, maxV: 0 };
function pollContacts() {
  const cur = new Set();
  const candidates = [];
  window.__dbg.contactsLen = world.contacts.length;
  window.__dbg.newPairs = 0;
  for (const c of world.contacts) {
    const a = c.bi.id, b = c.bj.id;
    const key = a < b ? a + '_' + b : b + '_' + a;
    cur.add(key);
    if (prevContactSet.has(key)) continue; // 上帧已接触，不是新碰撞
    window.__dbg.newPairs++;
    let v;
    try { v = Math.abs(c.getImpactVelocityAlongNormal()); } catch (e) { v = 0; }
    if (!isFinite(v) || v < 1.0) continue;
    window.__dbg.maxV = Math.max(window.__dbg.maxV, +v.toFixed(2));
    const strength = Math.min(v / 11, 1);
    const cp = c.bi.position.vadd(c.ri);
    const col = (c.bi.userData && c.bi.userData.color) || (c.bj.userData && c.bj.userData.color) || [0.8, 0.72, 0.6];
    candidates.push({ strength, x: cp.x, y: cp.y, z: cp.z, color: col });
  }
  prevContactSet = cur;
  window.__dbg.candidates = candidates.length;
  if (!candidates.length) return;
  candidates.sort((p, q) => q.strength - p.strength);
  const n = Math.min(candidates.length, 2); // 每帧最多 2 声
  for (let i = 0; i < n; i++) {
    const im = candidates[i];
    sfx.impact(im.strength);
    if (im.strength > 0.5) {
      particles.emit([im.x, im.y, im.z], { count: 7, speed: 2.6, spread: 3.2, colors: [im.color], life: 0.42, gravity: 4 });
    }
    if (im.strength > 0.72) shake = Math.min(shake + (im.strength - 0.72) * 1.3, 1);
  }
  window.__collideCount = (window.__collideCount || 0) + n;
}

/* ---------------- 主循环 ---------------- */
let shake = 0;
const clock = new THREE.Clock();
const FIXED = 1 / 60;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);

  // 物理：固定步长
  world.step(FIXED, dt, 4);
  try { pollContacts(); } catch (e) { window.__dbg.err = String(e); }

  // 刚体 -> 网格
  for (const { body, mesh } of bodies) {
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
  }

  // 出界回收（始终运行，避免远处/高空物体无限堆积）
  for (let i = bodies.length - 1; i >= 0; i--) {
    const p = bodies[i].body.position;
    if (p.x * p.x + p.z * p.z > CFG.killRadius * CFG.killRadius || Math.abs(p.y) > 90) removeBody(i);
  }

  // 全局速度上限（任何来源的高速运动都钳制，防穿透墙/地面）
  const VMAX_ALL = 42;
  for (const { body } of bodies) {
    const vs = body.velocity.lengthSquared();
    if (vs > VMAX_ALL * VMAX_ALL) {
      body.velocity.scale(VMAX_ALL / Math.sqrt(vs), body.velocity);
    }
    const as = body.angularVelocity.lengthSquared();
    if (as > 20 * 20) {
      body.angularVelocity.scale(20 / Math.sqrt(as), body.angularVelocity);
    }
  }

  // 硬墙兜底：位置级钳制，任何原因穿出盒子都拉回贴墙并反弹（绝对封闭）
  const WALL_IN = 43.5, TOP_IN = 33.5; // 墙/顶内表面
  for (const { body } of bodies) {
    const r = (body.shapes && body.shapes[0] && body.shapes[0].boundingSphereRadius) || 0.4;
    let rebound = false;
    if (body.position.x > WALL_IN - r) { body.position.x = WALL_IN - r; body.velocity.x = -Math.abs(body.velocity.x) * 0.4; rebound = true; }
    else if (body.position.x < -(WALL_IN - r)) { body.position.x = -(WALL_IN - r); body.velocity.x = Math.abs(body.velocity.x) * 0.4; rebound = true; }
    if (body.position.z > WALL_IN - r) { body.position.z = WALL_IN - r; body.velocity.z = -Math.abs(body.velocity.z) * 0.4; rebound = true; }
    else if (body.position.z < -(WALL_IN - r)) { body.position.z = -(WALL_IN - r); body.velocity.z = Math.abs(body.velocity.z) * 0.4; rebound = true; }
    if (body.position.y > TOP_IN - r) { body.position.y = TOP_IN - r; body.velocity.y = -Math.abs(body.velocity.y) * 0.4; rebound = true; }
    if (body.position.y < r) { body.position.y = r; body.velocity.y = Math.abs(body.velocity.y) * 0.4; rebound = true; }
    if (rebound) { body.angularVelocity.scale(0.4, body.angularVelocity); body.wakeUp(); }
  }

  // 自由漫游相机（方向键/WASD 移动转向，Shift/Ctrl 升降）
  updateCamera(dt);

  // 重力箭头平滑旋转
  arrowQ.slerp(arrowTarget, 1 - Math.exp(-dt * 5));
  arrowGroup.quaternion.copy(arrowQ);

  // 左键按住：撒下连发 / 引力场
  if (pointer.down && leftMode === 'spawn') {
    pointer.spawnAcc += dt;
    let guard = 0;
    while (pointer.spawnAcc >= CFG.spawnEvery && guard++ < 6) {
      pointer.spawnAcc -= CFG.spawnEvery;
      spawnShapeAtPointer();
    }
  } else if (pointer.down && leftMode === 'gravity') {
    applyGravityField();
  } else {
    gravField.visible = false;
    gravCore.visible = false;
  }

  particles.update(dt);
  rings.update(dt);
  boomLight.update(dt);

  renderer.render(scene, camera);
}

/* 首次交互后启动循环（也用于音频解锁后的首帧） */
requestAnimationFrame(loop);

/* 调试/压测接口（不参与游戏逻辑） */
window.__VERSION = 'v6';
window.__collideHits = 0;
window.__collideErr = null;
window.__GAME = {
  getStats: () => ({
    bodies: bodies.length, gravity: CFG.gravityModes[gi], fps: Math.round(fpsAvg),
    collides: window.__collideCount,
    sample: bodies.slice(0, 5).map(b => [b.body.position.x.toFixed(1), b.body.position.y.toFixed(1), b.body.position.z.toFixed(1)]),
  }),
  debugBody: () => {
    if (!bodies.length) return null;
    const b = bodies[0].body;
    return { pos: [b.position.x.toFixed(2), b.position.y.toFixed(2), b.position.z.toFixed(2)], vel: [b.velocity.x.toFixed(2), b.velocity.y.toFixed(2), b.velocity.z.toFixed(2)], sleep: b.sleepState };
  },
  camPos: () => ({ x: +cam.pos.x.toFixed(1), y: +cam.pos.y.toFixed(1), z: +cam.pos.z.toFixed(1), yaw: +cam.yaw.toFixed(2), pitch: +cam.pitch.toFixed(2) }),
  gravInfo: () => (gravCenter ? { x: +gravCenter.x.toFixed(1), y: +gravCenter.y.toFixed(1), z: +gravCenter.z.toFixed(1) } : null),
  debugGravTest: () => {
    clearAll();
    for (let i = 0; i < 3; i++) spawnShape(new THREE.Vector3(-3 + i * 3, 1, 0), new THREE.Vector3(0, 1, 0));
    const c = new CANNON.Vec3(0, 1, 0);
    const R = CFG.gravityField.radius, G = CFG.gravityField.strength;
    for (let i = 0; i < 150; i++) {
      world.step(1 / 60, 1 / 60, 1);
      for (const { body } of bodies) {
        const d = body.position.vsub(c);
        const dist = d.length();
        if (dist > R || dist < 0.02) continue;
        body.wakeUp();
        d.normalize();
        body.applyForce(d.scale(-G * (1 - dist / R) * body.mass), new CANNON.Vec3(0, 0, 0));
      }
      try { pollContacts(); } catch (e) {}
    }
    return 'grav-test sample=' + JSON.stringify(window.__GAME.getStats().sample);
  },
  debugWallTest: () => {
    clearAll();
    // 在四面墙边撒物体（高空落下 + 爆炸推撞墙）
    spawnShape(new THREE.Vector3(42, 10, 0), new THREE.Vector3(0, 1, 0));
    spawnShape(new THREE.Vector3(-42, 10, 0), new THREE.Vector3(0, 1, 0));
    spawnShape(new THREE.Vector3(0, 10, 42), new THREE.Vector3(0, 1, 0));
    spawnShape(new THREE.Vector3(0, 10, -42), new THREE.Vector3(0, 1, 0));
    spawnShape(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 1, 0));
    for (let i = 0; i < 120; i++) world.step(1 / 60, 1 / 60, 1);
    // 中心爆炸，把所有物体推向墙
    const c = new CANNON.Vec3(0, 5, 0);
    const R = 40, S = 30;
    for (const { body } of bodies) {
      const d = body.position.vsub(c);
      const dist = d.length();
      if (dist > R) continue;
      let dir = d.clone();
      if (dir.length() < 0.02) dir.set(0, 1, 0);
      dir.normalize();
      dir.y += 0.3; dir.normalize();
      body.applyImpulse(dir.scale(S * (1 - dist / R) * body.mass), new CANNON.Vec3(0, 0, 0));
    }
    for (let i = 0; i < 240; i++) world.step(1 / 60, 1 / 60, 1);
    const inBox = bodies.every(b => Math.abs(b.body.position.x) <= 45.5 && Math.abs(b.body.position.z) <= 45.5 && b.body.position.y <= 36);
    const ps = bodies.map(b => [b.body.position.x.toFixed(1), b.body.position.y.toFixed(1), b.body.position.z.toFixed(1)]);
    return 'wall-test inBox=' + inBox + ' all=' + JSON.stringify(ps);
  },
  debugPenTest: () => {
    clearAll();
    spawnShape(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 1, 0));
    spawnShape(new THREE.Vector3(40, 5, 0), new THREE.Vector3(0, 1, 0));
    // 两个物体分别以 60 m/s 高速撞北墙和东墙（模拟引力/爆炸极端情况）
    bodies[0].body.velocity.set(0, 0, -60);
    bodies[1].body.velocity.set(60, 0, 0);
    for (let i = 0; i < 240; i++) {
      world.step(1 / 60, 1 / 60, 1);
      for (const { body } of bodies) {
        const vs = body.velocity.lengthSquared();
        if (vs > 34 * 34) body.velocity.scale(34 / Math.sqrt(vs), body.velocity);
        const as = body.angularVelocity.lengthSquared();
        if (as > 400) body.angularVelocity.scale(20 / Math.sqrt(as), body.angularVelocity);
      }
      try { pollContacts(); } catch (e) {}
    }
    const ps = bodies.map(b => [b.body.position.x.toFixed(1), b.body.position.y.toFixed(1), b.body.position.z.toFixed(1)]);
    const inBox = bodies.every(b => Math.abs(b.body.position.x) <= 46.5 && Math.abs(b.body.position.z) <= 46.5 && b.body.position.y <= 36);
    return 'pen-test inBox=' + inBox + ' all=' + JSON.stringify(ps);
  },
  debugBoomTest: () => {
    clearAll();
    // 中心撒 10 个堆
    for (let i = 0; i < 10; i++) spawnShape(new THREE.Vector3(-3 + (i % 5) * 1.5, 1 + Math.floor(i / 5) * 2, -2 + Math.floor(i / 5) * 4), new THREE.Vector3(0, 1, 0));
    for (let i = 0; i < 120; i++) { world.step(1 / 60, 1 / 60, 1); try { pollContacts(); } catch (e) {} }
    // 中心爆炸（模拟实际 explodeAtPointer 的参数）
    const c = new CANNON.Vec3(0, 2, 0);
    const R = CFG.explosion.radius, S = CFG.explosion.strength, upB = CFG.explosion.upBias;
    for (const { body } of bodies) {
      const d = body.position.vsub(c);
      const dist = d.length();
      if (dist > R) continue;
      let dir = d.clone();
      if (dir.length() < 0.02) dir.set(0, 1, 0);
      dir.normalize();
      dir.y += upB; dir.normalize();
      const f = S * (1 - dist / R) * (0.55 + Math.random() * 0.9);
      body.applyImpulse(dir.scale(f * body.mass), new CANNON.Vec3(0, 0, 0));
    }
    for (let i = 0; i < 240; i++) {
      world.step(1 / 60, 1 / 60, 1);
      for (const { body } of bodies) {
        const vs = body.velocity.lengthSquared();
        if (vs > 42 * 42) body.velocity.scale(42 / Math.sqrt(vs), body.velocity);
        const r = body.boundingSphereRadius || 0.4;
        if (body.position.x > 43.5 - r) { body.position.x = 43.5 - r; body.velocity.x = -Math.abs(body.velocity.x) * 0.4; }
        else if (body.position.x < -(43.5 - r)) { body.position.x = -(43.5 - r); body.velocity.x = Math.abs(body.velocity.x) * 0.4; }
        if (body.position.z > 43.5 - r) { body.position.z = 43.5 - r; body.velocity.z = -Math.abs(body.velocity.z) * 0.4; }
        else if (body.position.z < -(43.5 - r)) { body.position.z = -(43.5 - r); body.velocity.z = Math.abs(body.velocity.z) * 0.4; }
        if (body.position.y > 33.5 - r) { body.position.y = 33.5 - r; body.velocity.y = -Math.abs(body.velocity.y) * 0.4; }
        if (body.position.y < r) { body.position.y = r; body.velocity.y = Math.abs(body.velocity.y) * 0.4; }
      }
      try { pollContacts(); } catch (e) {}
    }
    const maxDist = Math.max(...bodies.map(b => Math.hypot(b.body.position.x, b.body.position.z)));
    const inBox = bodies.every(b => Math.abs(b.body.position.x) <= 44 && Math.abs(b.body.position.z) <= 44 && b.body.position.y <= 34);
    return 'boom-test maxDist=' + maxDist.toFixed(1) + ' inBox=' + inBox + ' sample=' + JSON.stringify(bodies.slice(0, 4).map(b => [b.body.position.x.toFixed(1), b.body.position.y.toFixed(1), b.body.position.z.toFixed(1)]));
  },
  testEmit: () => {
    if (!bodies.length) return 'no body';
    const b = bodies[0].body;
    b.dispatchEvent({ type: 'collide', body: groundBody, contact: { getImpactVelocityAlongNormal: () => 5 } });
    return 'after manual emit, hits=' + window.__collideHits + ' collides=' + window.__collideCount;
  },
  analyze: () => {
    renderer.render(scene, camera);
    try {
      const gl = renderer.domElement.getContext('webgl2') || renderer.domElement.getContext('webgl');
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, lit = 0, warm = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        sum += r + g + b;
        if (r + g + b > 40) lit++;
        if (r > g + 18 && r > 70) warm++;
      }
      const n = px.length / 4;
      return { avg: +(sum / n / 3).toFixed(1), litPct: +(lit / n * 100).toFixed(1), warmPct: +(warm / n * 100).toFixed(1), w, h };
    } catch (e) { return 'analyze-fail: ' + e.message; }
  },
};
let fpsAvg = 60;
let fpsAcc = 0, fpsN = 0, fpsT = performance.now();
function trackFps() {
  const now = performance.now();
  fpsAcc += (now - fpsT) / 1000; fpsN++; fpsT = now;
  if (fpsAcc >= 1) { fpsAvg = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; }
}
requestAnimationFrame(function fpsLoop() {
  requestAnimationFrame(fpsLoop);
  trackFps();
});

window.addEventListener('resize', () => {
  camera.aspect = vw() / vh();
  camera.updateProjectionMatrix();
  renderer.setSize(vw(), vh());
});

/* 同步穿透压力测试（?pentest=1）：高速撞墙验证封闭性 */
if (new URLSearchParams(location.search).get('pentest')) {
  try { document.title = window.__GAME.debugPenTest(); }
  catch (e) { document.title = 'PENTEST FAIL ' + String(e); }
}
if (new URLSearchParams(location.search).get('selftest')) {
  try {
    // 从高空撒 3 个，同步推进 6 秒物理
    for (let i = 0; i < 3; i++) spawnShape(new THREE.Vector3(-2 + i * 2, 5, 0), new THREE.Vector3(0, 1, 0));
    for (let i = 0; i < 360; i++) {
      world.step(1 / 60, 1 / 60, 1);
      try { pollContacts(); } catch (e) { window.__dbg.err = String(e); }
    }
    const p = bodies.length ? bodies[0].body.position : null;
    document.title = 'SELFTEST contacts=' + window.__dbg.contactsLen +
      ' cand=' + window.__dbg.candidates + ' col=' + (window.__collideCount || 0) +
      ' bodies=' + bodies.length +
      (p ? ' y=' + p.y.toFixed(2) : '') +
      (window.__dbg.err ? ' ERR=' + window.__dbg.err : '');
  } catch (e) {
    document.title = 'SELFTEST FAIL ' + String(e);
  }
}
