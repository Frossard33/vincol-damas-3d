// ============================================================================
// 1. INICIALIZAÇÃO DO THREE.JS E CONTROLE DE CÂMERA ORBITAL NATIVO
// ============================================================================
if (!window.THREE) {
  // Nem a cópia local nem o CDN carregaram: mostra o aviso em vez de uma tela preta
  document.getElementById('start-screen').classList.add('hidden');
  document.getElementById('load-error').classList.remove('hidden');
  throw new Error('Three.js não carregou');
}
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0e1117);
scene.fog = new THREE.FogExp2(0x0e1117, 0.012);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: isTouchDevice ? 'default' : 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.shadowMap.enabled = true;
// Sombra suave custa caro no celular: lá usamos a versão simples
renderer.shadowMap.type = isTouchDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Raio ideal da câmera: garante que o tabuleiro caiba na largura da tela (retrato no celular)
function getFitRadius() {
  const aspect = window.innerWidth / window.innerHeight;
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // O tabuleiro precisa caber na largura (celular em pé) e na altura (celular deitado)
  const byWidth = 5.4 / (halfFovTan * aspect);
  const byHeight = 6.6 / halfFovTan;
  return Math.max(byWidth, byHeight);
}

// Controle de Câmera Orbital integrado (sem dependências externas)
const camState = {
  theta: 0,
  phi: 0.9,
  radius: 17.5,
  targetTheta: 0,
  targetPhi: 0.9,
  targetRadius: 17.5,
  isDragging: false,
  pointerDown: false,
  downX: 0,
  downY: 0,
  prevX: 0,
  prevY: 0
};
camState.radius = camState.targetRadius = getFitRadius();

// Devolve true enquanto a câmera ainda está se movendo (usado para economizar quadros)
function updateCameraPosition() {
  const dTheta = camState.targetTheta - camState.theta;
  const dPhi = camState.targetPhi - camState.phi;
  const dRadius = camState.targetRadius - camState.radius;
  camState.theta += dTheta * 0.12;
  camState.phi += dPhi * 0.12;
  camState.radius += dRadius * 0.12;

  camera.position.x = camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
  camera.position.y = camState.radius * Math.cos(camState.phi);
  camera.position.z = camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
  camera.lookAt(0, 0.4, 0);
  return Math.abs(dTheta) + Math.abs(dPhi) + Math.abs(dRadius) * 0.05 > 0.0005;
}

function clampRadius(r) {
  return Math.max(9, Math.min(Math.max(30, getFitRadius() * 1.3), r));
}

// Ponteiros ativos (suporte a toque com 1 dedo = girar, 2 dedos = pinça/zoom)
const activePointers = new Map();
let pinchPrevDist = 0;

function pinchDistance() {
  const [a, b] = [...activePointers.values()];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (activePointers.size === 2) {
    pinchPrevDist = pinchDistance();
    camState.isDragging = true; // evita seleção acidental ao soltar a pinça
    return;
  }
  camState.isDragging = false;
  camState.downX = e.clientX;
  camState.downY = e.clientY;
  camState.prevX = e.clientX;
  camState.prevY = e.clientY;
  camState.pointerDown = true;
});

window.addEventListener('pointermove', (e) => {
  if (activePointers.has(e.pointerId)) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  if (activePointers.size === 2) {
    const dist = pinchDistance();
    if (pinchPrevDist > 0) {
      camState.targetRadius = clampRadius(camState.targetRadius * (pinchPrevDist / dist));
    }
    pinchPrevDist = dist;
    return;
  }

  if (!camState.pointerDown) return;
  const dx = e.clientX - camState.prevX;
  const dy = e.clientY - camState.prevY;
  const threshold = e.pointerType === 'touch' ? 10 : 5;
  if (Math.hypot(e.clientX - camState.downX, e.clientY - camState.downY) > threshold) {
    camState.isDragging = true;
  }
  if (camState.isDragging) {
    camState.targetTheta -= dx * 0.007;
    // limite inferior evita que a arquibancada fique na frente do tabuleiro
    camState.targetPhi = Math.max(0.2, Math.min(1.3, camState.targetPhi - dy * 0.006));
  }
  camState.prevX = e.clientX;
  camState.prevY = e.clientY;
});

function releasePointer(e) {
  activePointers.delete(e.pointerId);
  pinchPrevDist = 0;
  if (activePointers.size === 1) {
    // Fim da pinça: o dedo que sobrou continua girando a partir de onde está (sem "pulo")
    const [rest] = activePointers.values();
    camState.prevX = rest.x;
    camState.prevY = rest.y;
  }
  if (activePointers.size === 0) camState.pointerDown = false;
}
window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    camState.targetRadius = clampRadius(camState.targetRadius + e.deltaY * 0.01);
  },
  { passive: false }
);

// ============================================================================
// 2. ILUMINAÇÃO (refletores de estádio, sem luzes pontuais para poupar o celular)
// ============================================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xe3ecff, 0x1c1f24, 1.0);
hemiLight.position.set(0, 25, 0);
scene.add(hemiLight);

const mainLight = new THREE.DirectionalLight(0xfff4e6, 1.6);
mainLight.position.set(8, 18, 10);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = isTouchDevice ? 1024 : 2048;
mainLight.shadow.mapSize.height = isTouchDevice ? 1024 : 2048;
mainLight.shadow.camera.near = 2;
mainLight.shadow.camera.far = 45;
const SHADOW_HALF = 7;
mainLight.shadow.camera.left = -SHADOW_HALF;
mainLight.shadow.camera.right = SHADOW_HALF;
mainLight.shadow.camera.top = SHADOW_HALF;
mainLight.shadow.camera.bottom = -SHADOW_HALF;
scene.add(mainLight);

const rimLight = new THREE.DirectionalLight(0xffd0d0, 0.7);
rimLight.position.set(-10, 12, -10);
scene.add(rimLight);

// ============================================================================
// 3. UTILITÁRIOS DE GEOMETRIA E TEXTURAS PROCEDURAIS
// ============================================================================
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

function makeMatrix(pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
  tmpQuat.setFromEuler(tmpEuler.set(rot[0], rot[1], rot[2]));
  return new THREE.Matrix4().compose(
    new THREE.Vector3(pos[0], pos[1], pos[2]),
    tmpQuat,
    new THREE.Vector3(scale[0], scale[1], scale[2])
  );
}

// Junta várias geometrias numa só (1 draw call em vez de dezenas). parts: [[geometria, matriz], ...]
function mergeGeometries(parts) {
  const chunks = parts.map(([geo, matrix]) => {
    let g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    if (g.index) g = g.toNonIndexed();
    return g;
  });
  const total = chunks.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  let offset = 0;
  chunks.forEach((g) => {
    pos.set(g.attributes.position.array, offset);
    nor.set(g.attributes.normal.array, offset);
    offset += g.attributes.position.count * 3;
    g.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  merged.computeBoundingSphere();
  return merged;
}

function createStoneTexture(isMarble) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isMarble ? '#f2f2f4' : '#1c1c21';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = isMarble
    ? 'rgba(120, 120, 130, 0.22)'
    : 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;

  for (let i = 0; i < 20; i++) {
    ctx.beginPath();
    let x = Math.random() * 256;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < 256) {
      y += 16;
      x += (Math.random() - 0.5) * 28;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createCheckerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 64;
  cv.height = 256;
  const g = cv.getContext('2d');
  const s = 32;
  for (let y = 0; y < cv.height / s; y++) {
    for (let x = 0; x < cv.width / s; x++) {
      g.fillStyle = (x + y) % 2 ? '#111' : '#f5f5f5';
      g.fillRect(x * s, y * s, s, s);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

const marbleTex = createStoneTexture(true);
const obsidianTex = createStoneTexture(false);

// ============================================================================
// 4. CENÁRIO: AUTÓDROMO OVAL (ESTILO NASCAR) COM ARQUIBANCADA LOTADA DE PNEUS
// ============================================================================
// O tabuleiro fica no centro do oval, sobre um pódio. Ao redor: grama, pista com
// zebras, muro, arquibancada em degraus com uma "torcida" de pneus e carros correndo.
// O estádio entra na cena alguns quadros depois do tabuleiro (ver revealArena), para
// a compilação dos shaders não travar a abertura de uma vez só.
const arenaGroup = new THREE.Group();

const GROUND_Y = -2.2;
const TRACK_HALF = 7;      // metade do comprimento das retas
const TRACK_IN = 8.6;      // raio interno do oval
const TRACK_OUT = 13;      // raio externo do oval
const STAND_START = TRACK_OUT + 0.6;
const STAND_TIERS = 6;
const STAND_DEPTH = 1.05;  // profundidade de cada degrau
const STAND_RISE = 0.55;   // altura de cada degrau

// Contorno de um oval "estádio" (2 retas + 2 curvas), retas paralelas ao eixo X.
// Coordenadas 2D (x, y) da Shape; depois de deitada no chão, y vira -z.
function ovalPoints(radius, segs = 28) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const a = -Math.PI / 2 + (i / segs) * Math.PI;
    pts.push(new THREE.Vector2(TRACK_HALF + Math.cos(a) * radius, Math.sin(a) * radius));
  }
  for (let i = 0; i <= segs; i++) {
    const a = Math.PI / 2 + (i / segs) * Math.PI;
    pts.push(new THREE.Vector2(-TRACK_HALF + Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return pts;
}

function ovalShape(radius) {
  return new THREE.Shape(ovalPoints(radius));
}

function ovalRingShape(rIn, rOut) {
  const shape = ovalShape(rOut);
  shape.holes.push(new THREE.Path(ovalPoints(rIn).reverse()));
  return shape;
}

// Ponto e direção ao longo do oval (distância d percorrida, sentido anti-horário visto de cima)
function ovalPointAt(d, radius, out) {
  const straight = TRACK_HALF * 2;
  const curve = Math.PI * radius;
  const lap = 2 * straight + 2 * curve;
  d = ((d % lap) + lap) % lap;
  if (d < straight) {
    out.set(-TRACK_HALF + d, 0, radius);
  } else if (d < straight + curve) {
    const a = (d - straight) / radius;
    out.set(TRACK_HALF + Math.sin(a) * radius, 0, Math.cos(a) * radius);
  } else if (d < 2 * straight + curve) {
    out.set(TRACK_HALF - (d - straight - curve), 0, -radius);
  } else {
    const a = (d - 2 * straight - curve) / radius;
    out.set(-TRACK_HALF - Math.sin(a) * radius, 0, -Math.cos(a) * radius);
  }
  return out;
}

function ovalLength(radius) {
  return 4 * TRACK_HALF + 2 * Math.PI * radius;
}

function flatOval(shape, mat, y) {
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 28), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  arenaGroup.add(mesh);
  return mesh;
}

function extrudedOval(shape, height, mat, y) {
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 28 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  arenaGroup.add(mesh);
  return mesh;
}

// Chão ao redor e grama do miolo
const groundMesh = new THREE.Mesh(
  new THREE.CircleGeometry(60, 48),
  new THREE.MeshLambertMaterial({ color: 0x15171c })
);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = GROUND_Y - 0.02;
arenaGroup.add(groundMesh);

flatOval(ovalShape(TRACK_IN), new THREE.MeshLambertMaterial({ color: 0x0d3511 }), GROUND_Y);

// Asfalto e faixas brancas
flatOval(ovalRingShape(TRACK_IN, TRACK_OUT), new THREE.MeshLambertMaterial({ color: 0x1e2024 }), GROUND_Y + 0.005);
const lineMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
flatOval(ovalRingShape(TRACK_IN + 0.12, TRACK_IN + 0.26), lineMat, GROUND_Y + 0.01);
flatOval(ovalRingShape(TRACK_OUT - 0.26, TRACK_OUT - 0.12), lineMat, GROUND_Y + 0.01);

// Linha de chegada quadriculada na reta oposta
const finishLine = new THREE.Mesh(
  new THREE.PlaneGeometry(0.9, TRACK_OUT - TRACK_IN),
  new THREE.MeshBasicMaterial({ map: createCheckerTexture() })
);
finishLine.rotation.x = -Math.PI / 2;
finishLine.position.set(0, GROUND_Y + 0.012, -(TRACK_IN + TRACK_OUT) / 2);
arenaGroup.add(finishLine);

// Zebras vermelho/branco na parte de dentro das curvas (1 draw call)
{
  const perCurve = 22;
  const curbs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.62, 0.06, 0.3),
    new THREE.MeshLambertMaterial({ color: 0xffffff }),
    perCurve * 2
  );
  const dummy = new THREE.Object3D();
  const red = new THREE.Color(0xff3131);
  const white = new THREE.Color(0xf2f2f2);
  const r = TRACK_IN - 0.18;
  let n = 0;
  [1, -1].forEach((side) => {
    for (let i = 0; i < perCurve; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / perCurve) * Math.PI;
      const x = side * (TRACK_HALF + Math.cos(a) * r);
      const z = Math.sin(a) * r;
      dummy.position.set(x, GROUND_Y + 0.03, z);
      // eixo comprido da zebra acompanha a curva (perpendicular ao raio)
      dummy.rotation.set(0, Math.atan2(x - side * TRACK_HALF, z), 0);
      dummy.updateMatrix();
      curbs.setMatrixAt(n, dummy.matrix);
      curbs.setColorAt(n, i % 2 ? red : white);
      n++;
    }
  });
  arenaGroup.add(curbs);
}

// Muro de proteção (branco com faixa vermelha da Vincol)
extrudedOval(ovalRingShape(TRACK_OUT, TRACK_OUT + 0.3), 0.6, new THREE.MeshLambertMaterial({ color: 0x8d8f94 }), GROUND_Y);
extrudedOval(ovalRingShape(TRACK_OUT - 0.02, TRACK_OUT + 0.32), 0.14, new THREE.MeshLambertMaterial({ color: 0xff3131 }), GROUND_Y + 0.6);

// Arquibancada em degraus: todos os degraus juntos numa única malha
{
  const parts = [];
  for (let k = 0; k < STAND_TIERS; k++) {
    const rIn = STAND_START + k * STAND_DEPTH;
    const geo = new THREE.ExtrudeGeometry(ovalRingShape(rIn, rIn + STAND_DEPTH), {
      depth: STAND_RISE * (k + 1),
      bevelEnabled: false,
      curveSegments: 28
    });
    parts.push([geo, makeMatrix([0, GROUND_Y, 0], [-Math.PI / 2, 0, 0])]);
  }
  const stands = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0x1b1d22 }));
  parts.forEach(([geo]) => geo.dispose());
  arenaGroup.add(stands);
}

// Torcida de pneus: centenas de pneus em pé olhando para a pista (2 draw calls no total)
const crowd = { tires: null, rims: null, base: [], count: 0 };
{
  const spots = [];
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let k = 0; k < STAND_TIERS; k++) {
    const r = STAND_START + k * STAND_DEPTH + STAND_DEPTH * 0.5;
    const len = ovalLength(r);
    const n = Math.floor(len / (isTouchDevice ? 1.05 : 0.78)); // menos pneus no celular
    for (let i = 0; i < n; i++) {
      const d = (i + (k % 2) * 0.5) * (len / n);
      ovalPointAt(d, r, p);
      ovalPointAt(d + 0.05, r, q);
      // normal para dentro do oval (perpendicular à direção do contorno)
      const tx = q.x - p.x;
      const tz = q.z - p.z;
      const tl = Math.hypot(tx, tz) || 1;
      spots.push({ x: p.x, z: p.z, nx: tz / tl, nz: -tx / tl, y: GROUND_Y + STAND_RISE * (k + 1) });
    }
  }

  crowd.count = spots.length;
  const tireGeoCrowd = new THREE.TorusGeometry(0.27, 0.11, isTouchDevice ? 4 : 6, isTouchDevice ? 10 : 12);
  const rimGeoCrowd = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 8);
  rimGeoCrowd.rotateX(Math.PI / 2);
  // Pneus e rodas usam o mesmo tipo de shader (cor por instância): um programa a menos para compilar
  crowd.tires = new THREE.InstancedMesh(tireGeoCrowd, new THREE.MeshLambertMaterial({ color: 0xffffff }), crowd.count);
  crowd.rims = new THREE.InstancedMesh(rimGeoCrowd, new THREE.MeshLambertMaterial({ color: 0xffffff }), crowd.count);
  const palette = [0xff3131, 0xdde3ea, 0xffd54f, 0x42a5f5, 0xffffff, 0xff3131, 0x66bb6a];
  const color = new THREE.Color();
  const rubberColor = new THREE.Color(0x1e1f24);
  const dummy = new THREE.Object3D();
  spots.forEach((s, i) => {
    const scale = 0.85 + Math.random() * 0.3;
    dummy.position.set(s.x, s.y + 0.38 * scale, s.z);
    dummy.lookAt(s.x + s.nx, s.y + 0.38 * scale, s.z + s.nz);
    dummy.rotateY((Math.random() - 0.5) * 0.5);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    crowd.tires.setMatrixAt(i, dummy.matrix);
    crowd.rims.setMatrixAt(i, dummy.matrix);
    crowd.tires.setColorAt(i, rubberColor);
    crowd.rims.setColorAt(i, color.setHex(palette[i % palette.length]));
    crowd.base.push({ matrix: dummy.matrix.clone(), phase: Math.random() * Math.PI * 2 });
  });
}

// Abertura em etapas: 1º quadro só tabuleiro e pneus, depois o estádio, depois a torcida
const arenaStages = [
  () => scene.add(arenaGroup),
  () => arenaGroup.add(crowd.tires, crowd.rims)
];
let framesUntilNextStage = 2;
function revealArena() {
  if (arenaStages.length === 0 || --framesUntilNextStage > 0) return;
  arenaStages.shift()();
  framesUntilNextStage = 3;
}

// A torcida pula de alegria por alguns segundos (chamado nas capturas e no fim do jogo)
let crowdCheerUntil = 0;
const cheerMatrix = new THREE.Matrix4();
function cheerCrowd(ms = 1600) {
  crowdCheerUntil = Math.max(crowdCheerUntil, performance.now() + ms);
}
function updateCrowd(now) {
  if (crowdCheerUntil === 0) return false;
  const active = now < crowdCheerUntil;
  for (let i = 0; i < crowd.count; i++) {
    const b = crowd.base[i];
    cheerMatrix.copy(b.matrix);
    if (active) cheerMatrix.elements[13] += Math.abs(Math.sin(now * 0.012 + b.phase)) * 0.22;
    crowd.tires.setMatrixAt(i, cheerMatrix);
    crowd.rims.setMatrixAt(i, cheerMatrix);
  }
  crowd.tires.instanceMatrix.needsUpdate = true;
  crowd.rims.instanceMatrix.needsUpdate = true;
  if (!active) crowdCheerUntil = 0; // volta todos ao lugar e para de atualizar
  return true;
}

// Torres de iluminação nos quatro cantos
{
  const poles = [];
  const panels = [];
  const towerX = TRACK_HALF + STAND_START + 3.2;
  const towerZ = STAND_START + 3.2;
  [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz]) => {
    const x = sx * towerX * 0.82;
    const z = sz * towerZ * 1.05;
    poles.push([new THREE.CylinderGeometry(0.14, 0.2, 11, 8), makeMatrix([x, GROUND_Y + 5.5, z])]);
    panels.push([new THREE.BoxGeometry(2.2, 1.1, 0.25), makeMatrix([x, GROUND_Y + 11.2, z], [-0.35 * sz, Math.atan2(x, z), 0])]);
  });
  arenaGroup.add(new THREE.Mesh(mergeGeometries(poles), new THREE.MeshLambertMaterial({ color: 0x5b5f68 })));
  arenaGroup.add(new THREE.Mesh(mergeGeometries(panels), new THREE.MeshBasicMaterial({ color: 0xfff6d8 })));
}

// Pódio do tabuleiro no centro do oval
const podiumMesh = new THREE.Mesh(
  new THREE.BoxGeometry(11.4, 2.0, 11.4),
  new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.75, metalness: 0.1 })
);
podiumMesh.position.y = -1.15;
podiumMesh.receiveShadow = true;
scene.add(podiumMesh);

// Telão com o logo oficial da Vincol (imagem embutida em logo-data.js) acima da arquibancada oposta
function createSignTexture() {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 440;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);

  const paint = (logo) => {
    g.fillStyle = '#ff3131';
    g.fillRect(0, 0, cv.width, cv.height);
    if (logo) {
      const w = 720;
      const h = (logo.height / logo.width) * w;
      g.drawImage(logo, (cv.width - w) / 2, 40, w, h);
    }
    g.fillStyle = 'rgba(255, 255, 255, 0.92)';
    g.font = '700 46px Arial, sans-serif';
    g.textAlign = 'center';
    g.fillText('DAMAS  •  VOLTA REDONDA - RJ', cv.width / 2, 400);
    tex.needsUpdate = true;
  };

  paint(null);
  // No site usa o mesmo PNG da tela inicial (já em cache). Em file:// o navegador bloqueia
  // imagens de arquivo no WebGL, então lá vale a cópia em base64 de logo-data.js.
  const img = new Image();
  img.onload = () => paint(img);
  img.src = typeof VINCOL_LOGO_DATA === 'string' ? VINCOL_LOGO_DATA : 'logo-vincol.png';
  return tex;
}

{
  const signZ = -(STAND_START + STAND_TIERS * STAND_DEPTH + 0.6);
  const signY = GROUND_Y + STAND_RISE * STAND_TIERS + 2.6;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4 * 1.3, 3.6 * 1.3),
    new THREE.MeshBasicMaterial({ map: createSignTexture() })
  );
  sign.position.set(0, signY, signZ);
  arenaGroup.add(sign);
  const legs = mergeGeometries([
    [new THREE.BoxGeometry(0.25, signY - GROUND_Y, 0.25), makeMatrix([-4, (signY + GROUND_Y) / 2, signZ - 0.2])],
    [new THREE.BoxGeometry(0.25, signY - GROUND_Y, 0.25), makeMatrix([4, (signY + GROUND_Y) / 2, signZ - 0.2])]
  ]);
  arenaGroup.add(new THREE.Mesh(legs, new THREE.MeshLambertMaterial({ color: 0x3a3d44 })));
}

// Carros de corrida dando voltas na pista
const raceCars = [];
{
  const wheelParts = [];
  [[-0.32, 0.42], [0.32, 0.42], [-0.32, -0.42], [0.32, -0.42]].forEach(([x, z]) => {
    wheelParts.push([new THREE.CylinderGeometry(0.13, 0.13, 0.1, 12), makeMatrix([x, 0.13, z], [0, 0, Math.PI / 2])]);
  });
  const carWheelGeo = mergeGeometries(wheelParts);
  const carBodyGeo = mergeGeometries([
    [new THREE.BoxGeometry(0.6, 0.2, 1.3), makeMatrix([0, 0.24, 0])],
    [new THREE.BoxGeometry(0.46, 0.18, 0.55), makeMatrix([0, 0.43, -0.08])],
    [new THREE.BoxGeometry(0.62, 0.05, 0.14), makeMatrix([0, 0.42, -0.62])]
  ]);
  const carWheelMat = new THREE.MeshLambertMaterial({ color: 0x15151a });
  [
    { color: 0xff3131, lane: TRACK_IN + 1.3, speed: 5.2, start: 0 },
    { color: 0xffd54f, lane: TRACK_OUT - 1.4, speed: 4.6, start: 9 },
    { color: 0x42a5f5, lane: TRACK_IN + 2.4, speed: 4.9, start: 30 }
  ].forEach((cfg) => {
    const car = new THREE.Group();
    car.add(new THREE.Mesh(carBodyGeo, new THREE.MeshLambertMaterial({ color: cfg.color })));
    car.add(new THREE.Mesh(carWheelGeo, carWheelMat));
    car.position.y = GROUND_Y + 0.01;
    arenaGroup.add(car);
    raceCars.push({ car, ...cfg });
  });
}

const carPos = new THREE.Vector3();
const carAhead = new THREE.Vector3();
function updateRaceCars(time) {
  raceCars.forEach((rc) => {
    const d = rc.start + time * rc.speed;
    ovalPointAt(d, rc.lane, carPos);
    ovalPointAt(d + 0.4, rc.lane, carAhead);
    rc.car.position.x = carPos.x;
    rc.car.position.z = carPos.z;
    rc.car.lookAt(carAhead.x, rc.car.position.y, carAhead.z);
  });
}

// ============================================================================
// 5. TABULEIRO PROFISSIONAL 8x8
// ============================================================================
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const frameMesh = new THREE.Mesh(
  new THREE.BoxGeometry(9.2, 0.32, 9.2),
  new THREE.MeshStandardMaterial({ color: 0xff3131, roughness: 0.45, metalness: 0.2 })
);
frameMesh.position.y = -0.16;
frameMesh.receiveShadow = true;
boardGroup.add(frameMesh);

const tileGeo = new THREE.BoxGeometry(0.96, 0.16, 0.96);
const lightTileMat = new THREE.MeshStandardMaterial({
  map: marbleTex,
  color: 0xffffff,
  roughness: 0.25,
  metalness: 0.05
});
const darkTileMat = new THREE.MeshStandardMaterial({
  map: obsidianTex,
  color: 0x2e2e35,
  roughness: 0.2,
  metalness: 0.15
});

// Casas claras nunca são jogáveis: viram uma única malha. As escuras ficam separadas
// porque cada uma acende sozinha (destaque de jogada) e recebe o toque.
const tileMeshes = [];
const lightTileParts = [];
for (let r = 0; r < 8; r++) {
  tileMeshes[r] = [];
  for (let c = 0; c < 8; c++) {
    if ((r + c) % 2 === 1) {
      const tile = new THREE.Mesh(tileGeo, darkTileMat.clone());
      tile.position.set(c - 3.5, 0.04, r - 3.5);
      tile.receiveShadow = true;
      tile.userData = { type: 'tile', r, c };
      boardGroup.add(tile);
      tileMeshes[r][c] = tile;
    } else {
      lightTileParts.push([tileGeo, makeMatrix([c - 3.5, 0.04, r - 3.5])]);
      tileMeshes[r][c] = null;
    }
  }
}
{
  // UV some no merge: recria UVs simples por casa para manter a textura de mármore
  const merged = mergeGeometries(lightTileParts);
  const uv = new Float32Array(merged.attributes.position.count * 2);
  const one = tileGeo.toNonIndexed().attributes.uv.array;
  for (let i = 0; i < uv.length; i += one.length) uv.set(one, i);
  merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  const lightTiles = new THREE.Mesh(merged, lightTileMat);
  lightTiles.receiveShadow = true;
  lightTiles.userData = { type: 'board' };
  boardGroup.add(lightTiles);
}

function boardToWorld(r, c) {
  return new THREE.Vector3(c - 3.5, 0.12, r - 3.5);
}

// ============================================================================
// 6. PEÇAS (PNEUS) E ANIMAÇÕES
// ============================================================================
const piecesGroup = new THREE.Group();
scene.add(piecesGroup);

const fxGroup = new THREE.Group();
scene.add(fxGroup);

const activeAnimations = [];
const activeParticles = [];

// Pneus em pé, como se estivessem rodando na estrada.
// Hierarquia: peça (posição no tabuleiro) → yaw (direção) → roda (gira no eixo Z ao rolar)
// Cada pneu tem só 3 malhas visíveis (borracha, roda e halo) + a coroa quando vira dama.
const TIRE_RADIUS = 0.37; // raio externo: usado para calcular quanto a roda gira ao andar
const rubberPieceMat = new THREE.MeshStandardMaterial({
  color: 0x1f1f24,
  roughness: 0.92,
  metalness: 0.04
});
const rimSilverMat = new THREE.MeshStandardMaterial({ color: 0xdde3ea, roughness: 0.22, metalness: 0.9 });
const rimRedMat = new THREE.MeshStandardMaterial({ color: 0xff3131, roughness: 0.3, metalness: 0.7 });
// Coroa dourada da dama, com brilho na cor do time
const crownMatWhite = new THREE.MeshStandardMaterial({
  color: 0xffd54f, emissive: 0x90a4ae, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.75
});
const crownMatRed = new THREE.MeshStandardMaterial({
  color: 0xffd54f, emissive: 0xff1744, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0.75
});

// Borracha: banda de rodagem + 14 gomos (deixam visível o pneu girando)
const tireRubberGeo = (() => {
  const parts = [[new THREE.TorusGeometry(0.27, 0.1, 12, 30), makeMatrix([0, 0, 0], [0, 0, 0], [1, 1, 1.6])]];
  const block = new THREE.BoxGeometry(0.03, 0.07, 0.3);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    parts.push([block, makeMatrix([Math.cos(a) * 0.358, Math.sin(a) * 0.358, 0], [0, 0, a])]);
  }
  return mergeGeometries(parts);
})();
// Roda: aro + 5 raios + cubo
const tireRimGeo = (() => {
  const parts = [[new THREE.TorusGeometry(0.19, 0.025, 8, 28), makeMatrix([0, 0, 0], [0, 0, 0], [1, 1, 4])]];
  const spoke = new THREE.BoxGeometry(0.035, 0.36, 0.05);
  for (let i = 0; i < 5; i++) parts.push([spoke, makeMatrix([0, 0, 0], [0, 0, (i / 5) * Math.PI])]);
  parts.push([new THREE.CylinderGeometry(0.055, 0.055, 0.24, 12), makeMatrix([0, 0, 0], [Math.PI / 2, 0, 0])]);
  return mergeGeometries(parts);
})();
// Coroa: aro + 5 pontas + joia
const crownGeo = (() => {
  const parts = [[new THREE.TorusGeometry(0.17, 0.035, 10, 28), makeMatrix([0, 0, 0], [Math.PI / 2, 0, 0])]];
  const spike = new THREE.ConeGeometry(0.045, 0.15, 6);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    parts.push([spike, makeMatrix([Math.cos(a) * 0.17, 0.09, Math.sin(a) * 0.17])]);
  }
  parts.push([new THREE.OctahedronGeometry(0.1, 0), makeMatrix([0, 0.14, 0])]);
  return mergeGeometries(parts);
})();
const haloGeo = new THREE.RingGeometry(0.33, 0.4, 36);
const hitGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.85, 12);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

function buildWheel(rimMat) {
  const wheel = new THREE.Group();
  const rubber = new THREE.Mesh(tireRubberGeo, rubberPieceMat);
  rubber.castShadow = true;
  wheel.add(rubber);
  wheel.add(new THREE.Mesh(tireRimGeo, rimMat));
  wheel.position.y = TIRE_RADIUS;
  return wheel;
}

function createPieceMesh(color, r, c, isKing = false) {
  const group = new THREE.Group();
  const isWhite = color === 'white';
  const rimMat = isWhite ? rimSilverMat : rimRedMat;
  const glowColor = isWhite ? 0xb0bec5 : 0xff5252;

  const yaw = new THREE.Group();
  // Cada time começa "olhando" na diagonal para o lado do adversário
  yaw.rotation.y = isWhite ? Math.PI / 4 : -Math.PI / 4;
  const wheel = buildWheel(rimMat);
  yaw.add(wheel);
  group.add(yaw);

  // Halo no chão com a cor do time (pulsa na animação idle)
  const ringMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide
  });
  const halo = new THREE.Mesh(haloGeo, ringMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.01;
  group.add(halo);

  // Dama = coroa dourada encaixada no topo do pneu
  const crownGroup = new THREE.Mesh(crownGeo, isWhite ? crownMatWhite : crownMatRed);
  crownGroup.castShadow = true;
  crownGroup.position.y = TIRE_RADIUS * 2 + 0.02;
  crownGroup.visible = isKing;
  group.add(crownGroup);

  // Área de toque ampliada (invisível) para dedos no celular
  const hit = new THREE.Mesh(hitGeo, hitMat);
  hit.position.y = 0.42;
  group.add(hit);

  group.position.copy(boardToWorld(r, c));

  group.userData = {
    type: 'piece',
    color,
    r,
    c,
    isKing,
    yaw,
    wheel,
    crownGroup,
    ringMat,
    idleOffset: Math.random() * Math.PI * 2,
    isAnimating: false
  };

  piecesGroup.add(group);
  return group;
}

// Remove um pneu da cena e libera o único material exclusivo dele (o do halo)
function disposePiece(pieceMesh) {
  if (pieceMesh.parent) pieceMesh.parent.remove(pieceMesh);
  pieceMesh.userData.ringMat.dispose();
}

// Vira o pneu para a direção do movimento e o faz rolar conforme anda
function makeRoller(pieceMesh, startPos, endPos) {
  const { yaw, wheel } = pieceMesh.userData;
  const dx = endPos.x - startPos.x;
  const dz = endPos.z - startPos.z;
  const startYaw = yaw.rotation.y;
  let targetYaw = Math.atan2(-dz, dx);
  // menor caminho angular
  targetYaw = startYaw + Math.atan2(Math.sin(targetYaw - startYaw), Math.cos(targetYaw - startYaw));
  const startRoll = wheel.rotation.z;
  const dist = Math.hypot(dx, dz);
  return (ease, t) => {
    yaw.rotation.y = startYaw + (targetYaw - startYaw) * Math.min(1, t * 4);
    wheel.rotation.z = startRoll - (dist * ease) / TIRE_RADIUS;
  };
}

// --- ANIMAÇÃO: MOVIMENTO (pneu rodando pela pista) ---
function animateMove(pieceMesh, targetR, targetC, onComplete) {
  pieceMesh.userData.isAnimating = true;
  const startPos = pieceMesh.position.clone();
  const endPos = boardToWorld(targetR, targetC);
  const duration = 520;
  const startTime = performance.now();
  const roll = makeRoller(pieceMesh, startPos, endPos);

  activeAnimations.push((now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    pieceMesh.position.lerpVectors(startPos, endPos, ease);
    pieceMesh.position.y = endPos.y + Math.abs(Math.sin(ease * Math.PI * 3)) * 0.025; // trepidação da estrada
    roll(ease, t);

    if (Math.random() < 0.5) {
      spawnTrailMote(pieceMesh.position.x, pieceMesh.position.z);
    }

    if (t >= 1) {
      pieceMesh.position.copy(endPos);
      pieceMesh.userData.r = targetR;
      pieceMesh.userData.c = targetC;
      pieceMesh.userData.isAnimating = false;
      if (onComplete) onComplete();
      return true;
    }
    return false;
  });
}

// --- ANIMAÇÃO: ATAQUE (pneu salta por cima do adversário) ---
function animateAttack(attackerMesh, capturedMesh, targetR, targetC, onComplete) {
  attackerMesh.userData.isAnimating = true;
  const startPos = attackerMesh.position.clone();
  const victimPos = capturedMesh.position.clone();
  const endPos = boardToWorld(targetR, targetC);
  const duration = 720;
  const startTime = performance.now();
  let shattered = false;
  const beamColor = attackerMesh.userData.color === 'white' ? 0xeceff1 : 0xff5252;
  const roll = makeRoller(attackerMesh, startPos, endPos);

  activeAnimations.push((now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    attackerMesh.position.lerpVectors(startPos, endPos, ease);
    attackerMesh.position.y = endPos.y + Math.sin(ease * Math.PI) * 1.2;
    roll(ease * 1.6, t); // gira mais rápido no salto

    if (t >= 0.48 && !shattered) {
      shattered = true;
      spawnStrikeBeam(attackerMesh.position.clone(), victimPos.clone().setY(0.4), beamColor);
      animateDestruction(capturedMesh);
      cheerCrowd();
    }

    if (t >= 1) {
      attackerMesh.position.copy(endPos);
      attackerMesh.userData.r = targetR;
      attackerMesh.userData.c = targetC;
      attackerMesh.userData.isAnimating = false;
      if (onComplete) onComplete();
      return true;
    }
    return false;
  });
}

// Geometrias e materiais dos efeitos são criados uma única vez e reaproveitados
// (antes cada partícula criava os seus e nada era liberado da memória de vídeo)
const shardGeo = new THREE.BoxGeometry(0.16, 0.08, 0.1);
const moteGeo = new THREE.SphereGeometry(0.05, 6, 6);
const moteMat = new THREE.MeshBasicMaterial({ color: 0x9e9e9e, transparent: true, opacity: 0.8 });
const waveGeo = new THREE.RingGeometry(0.1, 0.25, 28);
const MAX_PARTICLES = 160;

// --- ANIMAÇÃO: DESTRUIÇÃO (pneu estourando) ---
function animateDestruction(victimMesh) {
  const origin = victimMesh.position.clone();
  const isWhite = victimMesh.userData.color === 'white';
  const glowColor = isWhite ? 0xcfd8dc : 0xff5252;

  disposePiece(victimMesh);

  // Onda de choque
  const waveMat = new THREE.MeshBasicMaterial({
    color: glowColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9
  });
  const wave = new THREE.Mesh(waveGeo, waveMat);
  wave.rotation.x = Math.PI / 2;
  wave.position.set(origin.x, 0.14, origin.z);
  fxGroup.add(wave);

  const waveStart = performance.now();
  activeAnimations.push((now) => {
    const wt = (now - waveStart) / 450;
    if (wt >= 1) {
      fxGroup.remove(wave);
      waveMat.dispose();
      return true;
    }
    const s = 1 + wt * 4.5;
    wave.scale.set(s, s, 1);
    waveMat.opacity = 0.9 * (1 - wt);
    return false;
  });

  // Estilhaços 3D com física
  for (let i = 0; i < 18; i++) {
    const shard = new THREE.Mesh(shardGeo, rubberPieceMat);
    shard.position.set(
      origin.x + (Math.random() - 0.5) * 0.3,
      origin.y + 0.25 + Math.random() * 0.4,
      origin.z + (Math.random() - 0.5) * 0.3
    );
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.03 + Math.random() * 0.06;
    activeParticles.push({
      mesh: shard,
      vx: Math.cos(angle) * speed,
      vy: 0.06 + Math.random() * 0.08,
      vz: Math.sin(angle) * speed,
      rx: (Math.random() - 0.5) * 0.3,
      rz: (Math.random() - 0.5) * 0.3,
      life: 1.0,
      decay: 0.018 + Math.random() * 0.012
    });
    fxGroup.add(shard);
  }
}

function spawnTrailMote(x, z) {
  if (activeParticles.length >= MAX_PARTICLES) return;
  const mote = new THREE.Mesh(moteGeo, moteMat);
  mote.position.set(x, 0.16, z);
  fxGroup.add(mote);
  activeParticles.push({
    mesh: mote,
    vx: (Math.random() - 0.5) * 0.01,
    vy: 0.01,
    vz: (Math.random() - 0.5) * 0.01,
    rx: 0,
    rz: 0,
    life: 1.0,
    decay: 0.05
  });
}

function spawnStrikeBeam(fromPos, toPos, colorHex) {
  const lineGeo = new THREE.BufferGeometry().setFromPoints([fromPos, toPos]);
  const lineMat = new THREE.LineBasicMaterial({
    color: colorHex,
    transparent: true,
    opacity: 1
  });
  const beam = new THREE.Line(lineGeo, lineMat);
  fxGroup.add(beam);
  const start = performance.now();
  activeAnimations.push((now) => {
    const t = (now - start) / 260;
    if (t >= 1) {
      fxGroup.remove(beam);
      lineGeo.dispose();
      lineMat.dispose();
      return true;
    }
    lineMat.opacity = 1 - t;
    return false;
  });
}

// ============================================================================
// 7. MOTOR DE IA (MINIMAX + PODA ALFA-BETA + APROFUNDAMENTO ITERATIVO)
// ============================================================================
// O motor trabalha sobre um tabuleiro abstrato (64 casas), independente do 3D:
//   1 = pneu Prata, 2 = dama Prata, -1 = pneu Vermelho, -2 = dama Vermelha.
// É serializado para um Web Worker, para a IA pensar sem travar a animação.
function createEngine() {
  const KING_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const WHITE_DIRS = [[-1, -1], [-1, 1]];
  const BLACK_DIRS = [[1, -1], [1, 1]];
  const WIN = 100000;
  let deadline = 0;
  let nodes = 0;
  let timedOut = false;

  // Tabela de transposição (Zobrist), killer moves e history heuristic
  const TT_MAX = 200000;
  const tt = new Map();
  const killers1 = new Int32Array(64).fill(-1);
  const killers2 = new Int32Array(64).fill(-1);
  const history = new Int32Array(64 * 64);
  const Z1 = new Int32Array(5 * 64);
  const Z2 = new Int32Array(5 * 64);
  let seed = 0x2545f491;
  for (let z = 0; z < Z1.length; z++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; Z1[z] = seed;
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; Z2[z] = seed;
  }

  function hashKey(b, side) {
    let h1 = side > 0 ? 0x1b873593 : 0x5bd1e995;
    let h2 = side > 0 ? 0x2c1b3c6d : 0x297a2d39;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (p !== 0) {
        const z = (p + 2) * 64 + i;
        h1 ^= Z1[z];
        h2 ^= Z2[z];
      }
    }
    return (h1 >>> 0) * 2097152 + (h2 & 0x1fffff);
  }

  function moveKey(m) {
    return m.path[0] * 64 + m.path[m.path.length - 1];
  }

  function dirsFor(p) {
    if (p === 2 || p === -2) return KING_DIRS;
    return p === 1 ? WHITE_DIRS : BLACK_DIRS;
  }

  // Gera todas as sequências de captura a partir da casa i (captura em cadeia completa)
  function genJumps(b, i, p, path, capt, out) {
    const r = i >> 3;
    const c = i & 7;
    const dirs = dirsFor(p);
    for (let k = 0; k < dirs.length; k++) {
      const dr = dirs[k][0];
      const dc = dirs[k][1];
      const jr = r + 2 * dr;
      const jc = c + 2 * dc;
      if (jr < 0 || jr > 7 || jc < 0 || jc > 7) continue;
      const m = (r + dr) * 8 + (c + dc);
      const j = jr * 8 + jc;
      if (b[m] * p >= 0 || b[j] !== 0) continue;
      const victim = b[m];
      b[m] = 0;
      b[i] = 0;
      b[j] = p;
      path.push(j);
      capt.push(m);
      // Captura não é obrigatória: parar em qualquer ponto da cadeia é uma jogada válida
      out.push({ path: path.slice(), caps: capt.slice() });
      const promoted = (p === 1 && jr === 0) || (p === -1 && jr === 7);
      if (!promoted) genJumps(b, j, p, path, capt, out); // promoção encerra a jogada
      path.pop();
      capt.pop();
      b[j] = 0;
      b[i] = p;
      b[m] = victim;
    }
  }

  function genMoves(b, side) {
    const caps = [];
    const quiet = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (p * side <= 0) continue;
      genJumps(b, i, p, [i], [], caps);
      const r = i >> 3;
      const c = i & 7;
      const dirs = dirsFor(p);
      for (let k = 0; k < dirs.length; k++) {
        const nr = r + dirs[k][0];
        const nc = c + dirs[k][1];
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const j = nr * 8 + nc;
        if (b[j] === 0) quiet.push({ path: [i, j], caps: [] });
      }
    }
    return caps.concat(quiet); // captura é opcional; capturas vêm primeiro
  }

  function apply(b, mv) {
    const nb = b.slice();
    const from = mv.path[0];
    const to = mv.path[mv.path.length - 1];
    let p = nb[from];
    nb[from] = 0;
    for (let k = 0; k < mv.caps.length; k++) nb[mv.caps[k]] = 0;
    const tr = to >> 3;
    if (p === 1 && tr === 0) p = 2;
    else if (p === -1 && tr === 7) p = -2;
    nb[to] = p;
    return nb;
  }

  // Avaliação estática do ponto de vista do Prata (positivo = bom para o Prata).
  // Estilo ofensivo: avançar vale mais que guardar a última linha, e as damas
  // sempre partem para cima das peças adversárias em vez de se esconder nos cantos.
  function evaluate(b) {
    let score = 0;
    let wMat = 0;
    let bMat = 0;
    const wKings = [];
    const bKings = [];
    const wAll = [];
    const bAll = [];
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const r = i >> 3;
      const c = i & 7;
      const central = c >= 2 && c <= 5 && r >= 2 && r <= 5;
      const edge = r === 0 || r === 7 || c === 0 || c === 7;
      if (p === 1) {
        wMat += 100;
        score += (7 - r) * 4;              // avanço rumo à promoção
        if (r <= 3) score += 4;            // já está no campo adversário
        if (r === 7) score += 4;           // guarda leve da última linha
        if (central) score += 6;
        // proteção: pneu com aliado atrás não pode ser capturado por aquele lado
        if (r < 7) {
          if (c > 0 && b[i + 7] > 0) score += 1;
          if (c < 7 && b[i + 9] > 0) score += 1;
        }
        wAll.push(i);
      } else if (p === -1) {
        bMat += 100;
        score -= r * 4;
        if (r >= 4) score -= 4;
        if (r === 0) score -= 4;
        if (central) score -= 6;
        if (r > 0) {
          if (c > 0 && b[i - 9] < 0) score -= 1;
          if (c < 7 && b[i - 7] < 0) score -= 1;
        }
        bAll.push(i);
      } else if (p === 2) {
        wMat += 165;
        if (central) score += 10;
        if (edge) score -= 8;              // dama na borda/canto fica passiva
        wKings.push(i);
        wAll.push(i);
      } else {
        bMat += 165;
        if (central) score -= 10;
        if (edge) score += 8;
        bKings.push(i);
        bAll.push(i);
      }
    }
    const material = wMat - bMat;
    score += material;
    // Quem está à frente quer trocar peças e simplificar o final
    const total = wMat + bMat;
    score += (material * (2600 - total)) / 5000;

    // As damas caçam a peça adversária mais próxima (com mais força quando está ganhando)
    const hunt = (kings, targets, sign, weight) => {
      for (let k = 0; k < kings.length; k++) {
        let best = 99;
        const kr = kings[k] >> 3;
        const kc = kings[k] & 7;
        for (let t = 0; t < targets.length; t++) {
          const d = Math.max(Math.abs(kr - (targets[t] >> 3)), Math.abs(kc - (targets[t] & 7)));
          if (d < best) best = d;
        }
        if (best < 99) score -= sign * best * weight;
      }
    };
    hunt(wKings, bAll, 1, material > 0 ? 5 : 2);
    hunt(bKings, wAll, -1, material < 0 ? 5 : 2);
    return score;
  }

  // Chave de posição usada para a IA não repetir lances (lado que vai jogar + casas)
  function positionKey(b, side) {
    return side + ':' + Array.prototype.join.call(b, ',');
  }

  function orderCaps(moves) {
    // Mais capturas primeiro
    return moves.sort((a, b) => b.caps.length - a.caps.length);
  }

  // Ordenação: jogada da tabela > capturas (mais longas primeiro) > killers > history
  function orderMoves(moves, ttMove, ply) {
    const k1 = ply < 64 ? killers1[ply] : -1;
    const k2 = ply < 64 ? killers2[ply] : -1;
    for (let k = 0; k < moves.length; k++) {
      const m = moves[k];
      const mk = moveKey(m);
      let s;
      if (m.caps.length > 0) s = 10000 + m.caps.length * 1000;
      else if (mk === k1) s = 5000;
      else if (mk === k2) s = 4999;
      else s = Math.min(history[mk], 4000);
      if (mk === ttMove) s += 1000000;
      m.s = s;
    }
    return moves.sort((a, b) => b.s - a.s);
  }

  function negamax(b, side, depth, alpha, beta, ply) {
    if ((++nodes & 255) === 0 && Date.now() > deadline) timedOut = true;
    if (timedOut) return 0;

    const alphaOrig = alpha;
    let key = 0;
    let ttMove = -1;
    if (depth > 0) {
      key = hashKey(b, side);
      const e = tt.get(key);
      if (e !== undefined) {
        ttMove = e.move;
        if (e.depth >= depth) {
          if (e.flag === 0) return e.score;
          if (e.flag === 1 && e.score > alpha) alpha = e.score;
          else if (e.flag === 2 && e.score < beta) beta = e.score;
          if (alpha >= beta) return e.score;
        }
      }
    }

    const moves = genMoves(b, side);
    if (moves.length === 0) return -WIN + ply; // sem jogadas = derrota
    if (depth <= 0) return quiesce(b, side, alpha, beta, ply, moves);

    orderMoves(moves, ttMove, ply);
    // Jogada única não consome profundidade
    const nextDepth = moves.length === 1 ? depth : depth - 1;
    let best = -Infinity;
    let bestKey = -1;
    for (let k = 0; k < moves.length; k++) {
      const v = -negamax(apply(b, moves[k]), -side, nextDepth, -beta, -alpha, ply + 1);
      if (timedOut) return 0;
      if (v > best) { best = v; bestKey = moveKey(moves[k]); }
      if (v > alpha) alpha = v;
      if (alpha >= beta) {
        if (moves[k].caps.length === 0 && ply < 64) {
          const mk = moveKey(moves[k]);
          if (killers1[ply] !== mk) { killers2[ply] = killers1[ply]; killers1[ply] = mk; }
          history[mk] += depth * depth;
        }
        break;
      }
    }
    if (Math.abs(best) < WIN - 100) {
      if (tt.size >= TT_MAX) tt.clear();
      tt.set(key, { depth, score: best, flag: best <= alphaOrig ? 2 : best >= beta ? 1 : 0, move: bestKey });
    }
    return best;
  }

  // Quiescência: no fim da busca, continua só pelas capturas para não avaliar
  // a posição no meio de uma troca de peças
  function quiesce(b, side, alpha, beta, ply, moves) {
    const stand = side * evaluate(b);
    if (stand >= beta || ply > 24) return stand;
    if (stand > alpha) alpha = stand;
    let best = stand;
    const caps = moves.filter((m) => m.caps.length > 0);
    orderCaps(caps);
    for (let k = 0; k < caps.length; k++) {
      if ((++nodes & 255) === 0 && Date.now() > deadline) timedOut = true;
      if (timedOut) return 0;
      const nb = apply(b, caps[k]);
      const reply = genMoves(nb, -side);
      const v = reply.length === 0 ? WIN - ply : -quiesce(nb, -side, -beta, -alpha, ply + 1, reply);
      if (timedOut) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }

  // cfg: { depth, time, noise, blunder, recent?, quietPlies? }
  //   recent: posições que a IA já produziu há pouco (para não ficar indo e voltando)
  //   quietPlies: lances seguidos só de damas (perto de 50 a partida empata)
  function chooseMove(board, side, cfg) {
    const b = Int8Array.from(board);
    let moves = orderCaps(genMoves(b, side));
    if (moves.length === 0) return null;
    if (moves.length === 1) return { move: moves[0], depth: 0, score: 0 };

    const startTime = Date.now();
    deadline = startTime + cfg.time * 0.9;
    nodes = 0;
    timedOut = false;
    tt.clear();
    killers1.fill(-1);
    killers2.fill(-1);
    history.fill(0);
    let scored = moves.map((m) => ({ move: m, score: 0 }));
    let reached = 0;

    for (let depth = 1; depth <= cfg.depth; depth++) {
      // Não inicia uma nova profundidade se já gastou mais da metade do tempo
      if (depth > 1 && Date.now() - startTime > cfg.time * 0.5) break;
      const iter = [];
      let alpha = -Infinity;
      for (let k = 0; k < scored.length; k++) {
        // Com "ruído" (níveis fáceis) cada jogada precisa da nota exata, sem poda na raiz
        const a = cfg.noise > 0 ? -Infinity : alpha;
        const v = -negamax(apply(b, scored[k].move), -side, depth - 1, -Infinity, -a, 1);
        if (timedOut) break;
        iter.push({ move: scored[k].move, score: v });
        if (v > alpha) alpha = v;
      }
      if (timedOut) {
        // Aproveita a iteração parcial se ela já achou algo melhor que a anterior
        if (iter.length > 0) {
          iter.sort((x, y) => y.score - x.score);
          if (iter[0].score > scored[0].score) scored = iter.concat(scored.filter((s) => !iter.some((t) => t.move === s.move)));
        }
        break;
      }
      iter.sort((x, y) => y.score - x.score);
      scored = iter; // melhor jogada é testada primeiro na próxima iteração
      reached = depth;
      if (Math.abs(scored[0].score) > WIN - 100) break; // achou vitória/derrota forçada
    }

    // Sem enrolação: penaliza repetir posição e ficar só mexendo dama perto do empate,
    // a não ser que seja a única forma de não perder.
    const recent = cfg.recent || [];
    const quiet = cfg.quietPlies || 0;
    if (recent.length > 0 || quiet >= 20) {
      scored = scored.map((s) => {
        if (Math.abs(s.score) > WIN - 100) return s;
        const m = s.move;
        const kingQuiet = m.caps.length === 0 && Math.abs(b[m.path[0]]) === 2;
        let penalty = 0;
        if (recent.indexOf(positionKey(apply(b, m), -side)) !== -1) penalty += 45;
        if (kingQuiet && quiet >= 20) penalty += (quiet - 18) * 3;
        return penalty ? { move: m, score: s.score - penalty } : s;
      });
      scored.sort((x, y) => y.score - x.score);
    }

    const best = scored[0];
    let pick = best;
    if (cfg.noise > 0) {
      const near = scored.filter((s) => s.score >= best.score - cfg.noise);
      pick = near[Math.floor(Math.random() * near.length)];
      if (Math.random() < cfg.blunder) {
        // "Deslize humano": joga uma jogada razoável, mas nunca entrega o jogo
        const ok = scored.slice(0, 4).filter((s) => s.score > best.score - 160);
        pick = ok[Math.floor(Math.random() * ok.length)];
      }
    }
    return { move: pick.move, depth: reached, score: pick.score, nodes, key: positionKey(apply(b, pick.move), -side) };
  }

  return { chooseMove, genMoves };
}

const DIFFICULTY = {
  facil:   { label: 'Fácil',   depth: 3,  time: 350,  noise: 45, blunder: 0.2 },
  medio:   { label: 'Médio',   depth: 5,  time: 700,  noise: 12, blunder: 0.05 },
  dificil: { label: 'Difícil', depth: 8,  time: 1000, noise: 0,  blunder: 0 },
  mestre:  { label: 'Mestre',  depth: 40, time: 4000, noise: 0,  blunder: 0 }
};
const DIFFICULTY_ORDER = ['facil', 'medio', 'dificil', 'mestre'];

const localEngine = createEngine();
let aiWorker = null;
let pendingAI = null;
let aiRequestId = 0;

let workerUrl = null;

// Sem Worker, a IA pensa na thread principal: o tempo é limitado para a tela não congelar
function chooseMoveLocally(board, side, cfg) {
  return localEngine.chooseMove(board, side, { ...cfg, time: Math.min(cfg.time, 1200) });
}

function settlePendingAI(result) {
  if (!pendingAI) return;
  const p = pendingAI;
  pendingAI = null;
  clearTimeout(p.watchdog);
  p.resolve(result);
}

function spawnWorker() {
  try {
    if (!workerUrl) {
      const src =
        'const E = (' + createEngine.toString() + ')();\n' +
        'onmessage = (e) => postMessage({ id: e.data.id, result: E.chooseMove(e.data.board, e.data.side, e.data.cfg) });';
      workerUrl = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    }
    const w = new Worker(workerUrl);
    w.onmessage = (e) => {
      // Ignora respostas de pedidos antigos (ex.: jogada desfeita enquanto a IA pensava)
      if (pendingAI && e.data.id === pendingAI.id) settlePendingAI(e.data.result);
    };
    w.onerror = () => {
      // Navegador bloqueou o Worker (ex.: arquivo local): calcula na thread principal
      aiWorker = null;
      if (pendingAI) settlePendingAI(chooseMoveLocally(pendingAI.board, pendingAI.side, pendingAI.cfg));
    };
    return w;
  } catch (err) {
    return null;
  }
}
aiWorker = spawnWorker();

// Cancela o pensamento em andamento (Desfazer, Início, nova partida). O Worker antigo é
// encerrado para a próxima jogada da IA não ficar na fila atrás de um cálculo inútil.
function cancelAI() {
  if (!pendingAI) return;
  clearTimeout(pendingAI.watchdog);
  pendingAI = null;
  if (aiWorker) {
    aiWorker.terminate();
    aiWorker = spawnWorker();
  }
}

function requestAIMove(board, side, cfg) {
  return new Promise((resolve) => {
    if (!aiWorker) {
      setTimeout(() => resolve(chooseMoveLocally(board, side, cfg)), 20);
      return;
    }
    const id = ++aiRequestId;
    pendingAI = { id, resolve, board, side, cfg };
    // Vigia: se o Worker não responder (ex.: suspenso pelo celular), recria e calcula aqui
    pendingAI.watchdog = setTimeout(() => {
      if (!pendingAI || pendingAI.id !== id) return;
      if (aiWorker) aiWorker.terminate();
      aiWorker = spawnWorker();
      settlePendingAI(chooseMoveLocally(board, side, cfg));
    }, cfg.time * 2 + 4000);
    aiWorker.postMessage({ id, board, side, cfg });
  });
}

// ============================================================================
// 8. ESTADO DO JOGO, REGRAS, HISTÓRICO (UNDO) E FIM DE PARTIDA
// ============================================================================
let boardState = [];
let moveHistory = [];
let currentTurn = 'white';
let vsAI = true;
let selectedPiece = null;
let validMoves = [];
let inputLocked = false;
let gameOver = false;
let gameEpoch = 0;     // invalida timeouts/animações de partidas anteriores
let chainPiece = null; // pneu obrigado a continuar a captura em cadeia
let aiPlan = [];       // passos restantes da captura em cadeia da IA
let aiRecent = [];     // posições recentes produzidas pela IA (anti-repetição)
let quietPlies = 0;    // lances seguidos só de damas sem captura (regra de empate)
const DRAW_PLIES = 50;
const AUTO_RESTART_SECONDS = 6;

function loadPref(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch (err) {
    return fallback;
  }
}
function savePref(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    /* armazenamento indisponível: segue sem salvar */
  }
}

let difficulty = loadPref('vincol-level', 'medio');
if (!DIFFICULTY[difficulty]) difficulty = 'medio';
let playerName = loadPref('vincol-nome', '');

if (typeof playerName !== 'string') playerName = '';

// Ranking: recordes de referência (para incentivar) + vitórias contra a IA neste aparelho.
// Ordena por nível (mais difícil primeiro) e depois pelo menor tempo.
const LEVEL_RANK = { mestre: 4, dificil: 3, medio: 2, facil: 1 };
const RANKING_LIMIT = 50;
const RANKING_SEED = [
  { nome: 'Rodrigo Valente', nivel: 'mestre', tempoMs: 582000 },
  { nome: 'Juliana Rocha', nivel: 'mestre', tempoMs: 665000 },
  { nome: 'Carlos Menezes', nivel: 'dificil', tempoMs: 378000 },
  { nome: 'Fernanda Lopes', nivel: 'dificil', tempoMs: 422000 },
  { nome: 'Thiago Pimentel', nivel: 'dificil', tempoMs: 475000 },
  { nome: 'Diego Barcellos', nivel: 'dificil', tempoMs: 511000 },
  { nome: 'Camila Teixeira', nivel: 'medio', tempoMs: 252000 },
  { nome: 'Bruno Siqueira', nivel: 'medio', tempoMs: 280000 },
  { nome: 'Larissa Monteiro', nivel: 'medio', tempoMs: 309000 },
  { nome: 'Marcelo Fagundes', nivel: 'medio', tempoMs: 347000 },
  { nome: 'Aline Cavalcanti', nivel: 'facil', tempoMs: 158000 },
  { nome: 'Leandro Quintela', nivel: 'facil', tempoMs: 185000 },
  { nome: 'Bianca Moraes', nivel: 'facil', tempoMs: 201000 },
  { nome: 'Patrícia Antunes', nivel: 'facil', tempoMs: 230000 },
  { nome: 'Rafael Duarte', nivel: 'facil', tempoMs: 255000 }
];
let myRanking = loadPref('vincol-ranking', []);
// Descarta entradas corrompidas ou editadas à mão no localStorage
myRanking = (Array.isArray(myRanking) ? myRanking : []).filter(
  (e) =>
    e &&
    typeof e.nome === 'string' &&
    LEVEL_RANK[e.nivel] &&
    Number.isFinite(e.tempoMs) &&
    e.tempoMs > 0 &&
    Number.isFinite(e.data)
);

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
const toastTextEl = $('toast-text');
const timerEl = $('hud-timer');
const gameoverEl = $('gameover');
const startScreenEl = $('start-screen');
const rankingScreenEl = $('ranking-screen');
const btnUndo = $('btn-undo');
let restartTimer = null;
let gameOverPending = false; // fim de jogo aconteceu com o menu aberto

// Cronômetro da partida (pausa enquanto o menu está aberto)
let matchStart = performance.now();
let penaltyMs = 0;     // +10s a cada "Desfazer" contra a IA
let finalTimeMs = 0;
let menuOpen = true;
let menuOpenedAt = 0;

function elapsedMs() {
  if (gameOver) return finalTimeMs;
  const now = menuOpen ? menuOpenedAt : performance.now();
  return Math.max(0, now - matchStart + penaltyMs);
}

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

setInterval(() => {
  timerEl.textContent = formatTime(elapsedMs());
}, 250);

function setToast(msg) {
  if (toastTextEl.textContent === msg) return;
  toastTextEl.textContent = msg;
  toastEl.classList.remove('flash');
  void toastEl.offsetWidth; // reinicia a animação
  toastEl.classList.add('flash');
}

function firstName(name) {
  return String(name || '').split(' ')[0];
}

function sideName(color) {
  return color === 'white' ? 'Prata' : 'Vermelho';
}

function toEngineBoard() {
  const b = new Array(64).fill(0);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (p) b[r * 8 + c] = (p.userData.color === 'white' ? 1 : -1) * (p.userData.isKing ? 2 : 1);
    }
  }
  return b;
}

function serializeBoard() {
  const snapshot = [];
  for (let r = 0; r < 8; r++) {
    snapshot[r] = [];
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      snapshot[r][c] = p ? { color: p.userData.color, isKing: p.userData.isKing } : null;
    }
  }
  return { turn: currentTurn, grid: snapshot, quietPlies };
}

function resetRound() {
  while (piecesGroup.children.length > 0) {
    disposePiece(piecesGroup.children[0]);
  }
  gameEpoch++;
  gameOverPending = false;
  chainPiece = null;
  setChainButton(false);
  aiPlan = [];
  aiRecent = [];
  cancelAI();
  gameOver = false;
  selectedPiece = null;
  validMoves = [];
  inputLocked = false;
  hideGameOver();
  clearTileHighlights();
  boardState = Array.from({ length: 8 }, () => Array(8).fill(null));
}

function restoreBoard(stateObj) {
  resetRound();
  currentTurn = stateObj.turn;
  quietPlies = stateObj.quietPlies || 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const cell = stateObj.grid[r][c];
      if (cell) boardState[r][c] = createPieceMesh(cell.color, r, c, cell.isKing);
    }
  }
  updateHUD();
  startTurn();
}

function initGame() {
  resetRound();
  moveHistory = [];
  currentTurn = 'white';
  quietPlies = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        if (r < 3) boardState[r][c] = createPieceMesh('black', r, c);
        else if (r > 4) boardState[r][c] = createPieceMesh('white', r, c);
      }
    }
  }
  matchStart = performance.now();
  penaltyMs = 0;
  finalTimeMs = 0;
  faceCameraTo('white');
  updateHUD();
  startTurn();
  setToast(
    vsAI
      ? `Boa sorte, ${firstName(playerName) || 'jogador'}! Você joga com os pneus Prata.`
      : 'Partida de 2 jogadores. O Prata começa!'
  );
}

function getMovesForPiece(piece) {
  const { r, c, color, isKing } = piece.userData;
  const dirs = [];
  if (color === 'white' || isKing) dirs.push(-1);
  if (color === 'black' || isKing) dirs.push(1);

  const normalMoves = [];
  const captureMoves = [];

  dirs.forEach((dr) => {
    [-1, 1].forEach((dc) => {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8) {
        if (!boardState[nr][nc]) {
          normalMoves.push({ toR: nr, toC: nc, captured: null });
        } else if (boardState[nr][nc].userData.color !== color) {
          const jr = r + dr * 2;
          const jc = c + dc * 2;
          if (jr >= 0 && jr < 8 && jc >= 0 && jc < 8 && !boardState[jr][jc]) {
            captureMoves.push({ toR: jr, toC: jc, captured: boardState[nr][nc] });
          }
        }
      }
    });
  });

  return [...captureMoves, ...normalMoves]; // captura é opcional
}

function getAllMovesForPlayer(color) {
  const allCaptures = [];
  const allNormals = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (p && p.userData.color === color) {
        const moves = getMovesForPiece(p);
        moves.forEach((m) => {
          if (m.captured) allCaptures.push({ piece: p, ...m });
          else allNormals.push({ piece: p, ...m });
        });
      }
    }
  }
  return allCaptures.concat(allNormals);
}

function clearTileHighlights() {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) {
        tileMeshes[r][c].material.emissive.setHex(0x000000);
      }
    }
  }
}

// Destaca de leve as casas dos pneus que podem jogar (vermelho = tem captura disponível)
function highlightMovable() {
  clearTileHighlights();
  const moves = getAllMovesForPlayer(currentTurn);
  // Um pneu com captura e lance simples fica vermelho: a captura sempre prevalece
  const canCapture = new Set(moves.filter((m) => m.captured).map((m) => m.piece));
  moves.forEach((m) => {
    const { r, c } = m.piece.userData;
    tileMeshes[r][c].material.emissive.setHex(canCapture.has(m.piece) ? 0x5a1414 : 0x23303a);
  });
  return moves;
}

function selectPiece(piece) {
  selectedPiece = piece;
  if (!piece) {
    validMoves = [];
    highlightMovable();
    return;
  }
  clearTileHighlights();

  const playerMoves = getAllMovesForPlayer(currentTurn);
  validMoves = playerMoves.filter((m) => m.piece === piece && (!chainPiece || m.captured));

  const { r, c } = piece.userData;
  tileMeshes[r][c].material.emissive.setHex(0x6b5a1e);
  validMoves.forEach((m) => {
    tileMeshes[m.toR][m.toC].material.emissive.setHex(m.captured ? 0xff3131 : 0x00a884);
  });
}

function isAITurn() {
  return vsAI && currentTurn === 'black';
}

// Prepara o turno atual: verifica fim de jogo e aciona a IA ou o jogador humano
function startTurn() {
  const moves = getAllMovesForPlayer(currentTurn);
  if (moves.length === 0) {
    endGame(currentTurn === 'white' ? 'black' : 'white');
    return;
  }
  if (quietPlies >= DRAW_PLIES) {
    endGame(null);
    return;
  }

  if (isAITurn()) {
    playAITurn();
    return;
  }

  inputLocked = false;
  if (!vsAI) faceCameraTo(currentTurn);
  const movable = new Set(moves.map((m) => m.piece));
  if (movable.size === 1) {
    // Só um pneu pode jogar: já seleciona para agilizar
    selectPiece(moves[0].piece);
  } else {
    selectedPiece = null;
    validMoves = [];
    highlightMovable();
  }
  const hint = moves[0].captured ? ' • Há captura disponível (opcional)' : '';
  setToast(vsAI ? `Sua vez (Prata)${hint}` : `Vez do ${sideName(currentTurn)}${hint}`);
}

function faceCameraTo(color) {
  const base = color === 'white' ? 0 : Math.PI;
  const turns = Math.round((camState.targetTheta - base) / (Math.PI * 2));
  camState.targetTheta = base + turns * Math.PI * 2;
}

function executeMove(moveObj) {
  const epoch = gameEpoch;
  if (!chainPiece && !isAITurn()) {
    moveHistory.push(serializeBoard());
    if (moveHistory.length > 200) moveHistory.shift();
  }

  inputLocked = true;
  clearTileHighlights();
  const { piece, toR, toC, captured } = moveObj;
  const fromR = piece.userData.r;
  const fromC = piece.userData.c;
  const wasKing = piece.userData.isKing;

  boardState[fromR][fromC] = null;
  boardState[toR][toC] = piece;

  const finishTurn = () => {
    if (epoch !== gameEpoch) return;
    let promoted = false;
    if (
      !piece.userData.isKing &&
      ((piece.userData.color === 'white' && toR === 0) ||
        (piece.userData.color === 'black' && toR === 7))
    ) {
      piece.userData.isKing = true;
      piece.userData.crownGroup.visible = true;
      promoted = true;
    }

    // Contagem para empate: só damas andando sem capturar
    quietPlies = captured || !wasKing ? 0 : quietPlies + 1;

    // Promoção encerra a jogada (mesma regra usada pelo motor da IA)
    if (captured && !promoted) {
      const followUpCaptures = getMovesForPiece(piece).filter((m) => m.captured);
      if (followUpCaptures.length > 0) {
        updateHUD();
        chainPiece = piece;
        if (isAITurn()) {
          // A IA só continua a cadeia se isso fazia parte do plano dela
          const step = aiPlan.shift();
          const next = step && followUpCaptures.find((m) => m.toR === step.toR && m.toC === step.toC);
          if (next) {
            setTimeout(() => {
              if (epoch === gameEpoch) executeMove({ piece, ...next });
            }, 220);
            return;
          }
        } else {
          inputLocked = false;
          selectPiece(piece);
          setToast('Pode capturar de novo com o mesmo pneu, ou toque em "Encerrar jogada".');
          setChainButton(true);
          return;
        }
      }
    }

    passTurn();
  };

  if (captured) {
    const capR = captured.userData.r;
    const capC = captured.userData.c;
    boardState[capR][capC] = null;
    animateAttack(piece, captured, toR, toC, finishTurn);
  } else {
    animateMove(piece, toR, toC, finishTurn);
  }
}

// Encerra a jogada atual e passa a vez
function passTurn() {
  chainPiece = null;
  setChainButton(false);
  aiPlan = [];
  currentTurn = currentTurn === 'white' ? 'black' : 'white';
  selectedPiece = null;
  validMoves = [];
  updateHUD();
  startTurn();
}

function playAITurn() {
  inputLocked = true;
  const epoch = gameEpoch;
  // A IA recebe as últimas posições que ela mesma criou e a contagem para o empate,
  // para não ficar enrolando com a dama de um lado para o outro
  const cfg = { ...DIFFICULTY[difficulty], recent: aiRecent.slice(-10), quietPlies };
  setToast('A IA está pensando...');
  const started = performance.now();

  requestAIMove(toEngineBoard(), -1, cfg).then((result) => {
    if (epoch !== gameEpoch || !isAITurn() || !result) return;
    if (result.key) aiRecent.push(result.key);
    // Pausa mínima para a jogada da IA não parecer instantânea
    const wait = Math.max(0, 450 - (performance.now() - started));
    const play = () => {
      if (epoch !== gameEpoch) return;
      // Com o menu ou o ranking aberto a partida fica pausada: a IA espera
      if (menuOpen) {
        setTimeout(play, 250);
        return;
      }
      const path = result.move.path;
      const steps = [];
      for (let k = 1; k < path.length; k++) {
        steps.push({ fromR: path[k - 1] >> 3, fromC: path[k - 1] & 7, toR: path[k] >> 3, toC: path[k] & 7 });
      }
      const first = steps.shift();
      aiPlan = steps;
      const piece = boardState[first.fromR][first.fromC];
      const mv = getAllMovesForPlayer('black').find(
        (m) => m.piece === piece && m.toR === first.toR && m.toC === first.toC
      );
      executeMove(mv || getAllMovesForPlayer('black')[0]);
    };
    setTimeout(play, wait);
  });
}

function sortRanking(list) {
  return list
    .slice()
    .sort((a, b) => LEVEL_RANK[b.nivel] - LEVEL_RANK[a.nivel] || a.tempoMs - b.tempoMs);
}

function fullRanking() {
  return sortRanking(RANKING_SEED.concat(myRanking));
}

// Devolve a posição da vitória. A posição é calculada antes de cortar a lista,
// então quem fica fora do top 50 recebe a posição real (ex.: 51º), nunca "0º".
function addToRanking(entry) {
  const pos = sortRanking(RANKING_SEED.concat(myRanking, [entry])).indexOf(entry) + 1;
  myRanking = sortRanking(myRanking.concat([entry])).slice(0, RANKING_LIMIT);
  savePref('vincol-ranking', myRanking);
  return pos;
}

function setGameOverIcon(name) {
  $('gameover-icon').querySelector('use').setAttribute('href', `#i-${name}`);
}

function endGame(winner) {
  finalTimeMs = elapsedMs();
  gameOver = true;
  inputLocked = true;
  selectedPiece = null;
  clearTileHighlights();
  updateHUD();
  const time = formatTime(finalTimeMs);
  const level = DIFFICULTY[difficulty].label;

  let title;
  let icon;
  let detail;
  if (winner === null) {
    title = 'Empate!';
    icon = 'handshake';
    detail = `Ninguém venceu desta vez. Tempo: <b>${time}</b>`;
  } else if (vsAI && winner === 'white') {
    const entry = { nome: playerName, nivel: difficulty, tempoMs: finalTimeMs, data: Date.now(), meu: true };
    const pos = addToRanking(entry);
    title = 'Você venceu!';
    icon = 'trophy';
    detail = `Nível <b>${level}</b> em <b>${time}</b><br>Você está em <b>${pos}º lugar</b> no ranking`;
  } else if (vsAI) {
    title = 'A IA venceu';
    icon = 'sad';
    detail = `Nível <b>${level}</b> • Tempo: <b>${time}</b><br>Tente de novo, você consegue!`;
  } else {
    title = `${sideName(winner)} venceu!`;
    icon = 'trophy';
    detail = `Tempo da partida: <b>${time}</b>`;
  }

  setToast(title);
  $('gameover-title').textContent = title;
  setGameOverIcon(icon);
  $('gameover-detail').innerHTML = detail; // só contém textos fixos, nível e tempo
  if (winner !== null) cheerCrowd(3000);

  // Se a partida acabou com o menu/ranking aberto, o card aparece só quando ele fechar
  if (menuOpen) {
    gameOverPending = true;
    return;
  }
  showGameOver();
}

function showGameOver() {
  gameOverPending = false;
  const epoch = gameEpoch;
  gameoverEl.classList.remove('hidden');

  let remaining = AUTO_RESTART_SECONDS;
  $('gameover-count').textContent = remaining;
  clearInterval(restartTimer);
  restartTimer = setInterval(() => {
    if (epoch !== gameEpoch || menuOpen) {
      clearInterval(restartTimer);
      return;
    }
    remaining--;
    $('gameover-count').textContent = remaining;
    if (remaining <= 0) initGame();
  }, 1000);
}

function hideGameOver() {
  clearInterval(restartTimer);
  gameoverEl.classList.add('hidden');
}

function updateHUD() {
  let w = 0;
  let b = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = boardState[r][c];
      if (p) {
        if (p.userData.color === 'white') w++;
        else b++;
      }
    }
  }
  $('count-white').textContent = w;
  $('count-black').textContent = b;
  $('name-white').textContent = vsAI ? firstName(playerName) || 'Você' : 'Prata';
  $('name-black').textContent = vsAI ? 'IA' : 'Vermelho';
  $('hud-level').textContent = vsAI ? DIFFICULTY[difficulty].label : '2 jogadores';
  $('hud-white').classList.toggle('turn', !gameOver && currentTurn === 'white');
  $('hud-black').classList.toggle('turn', !gameOver && currentTurn === 'black');
  btnUndo.disabled = gameOver || moveHistory.length === 0;
}

// ============================================================================
// 9. TOQUE/CLIQUE NO TABULEIRO E BOTÕES
// ============================================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

renderer.domElement.addEventListener('pointerup', (e) => {
  if (camState.isDragging || inputLocked) {
    if (activePointers.size <= 1) camState.isDragging = false;
    return;
  }
  if (isAITurn() || gameOver) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);

  // Casa de destino válida sob o dedo. Destinos estão sempre vazios, então se o toque
  // também pegou um pneu, é um pneu de outra casa "na frente" (câmera baixa): o lance vence.
  const tileHit = raycaster.intersectObjects(boardGroup.children, false)[0];
  const t = tileHit && tileHit.object.userData;
  const targetMove =
    selectedPiece && t && t.type === 'tile' && validMoves.find((m) => m.toR === t.r && m.toC === t.c);

  if (chainPiece) {
    // Captura em cadeia é opcional, mas só termina pelo botão: um toque perdido não passa a vez
    if (targetMove) executeMove(targetMove);
    else setToast('Toque numa casa vermelha para capturar de novo, ou em "Encerrar jogada".');
    return;
  }
  if (targetMove) {
    executeMove(targetMove);
    return;
  }

  const pieceHits = raycaster.intersectObjects(piecesGroup.children, true);
  if (pieceHits.length > 0) {
    let obj = pieceHits[0].object;
    while (obj.parent && obj.parent !== piecesGroup) obj = obj.parent;
    if (obj.userData && obj.userData.color === currentTurn) {
      const moves = getAllMovesForPlayer(currentTurn);
      if (!moves.some((m) => m.piece === obj)) {
        setToast('Esse pneu está bloqueado. Escolha outro.');
        return;
      }
      selectPiece(obj);
      return;
    }
  }

  if (tileHit && selectedPiece) selectPiece(null); // toque fora: desmarca
});

// Botão que encerra a captura em cadeia do jogador
const btnEndChain = $('btn-end-chain');
function setChainButton(visible) {
  btnEndChain.classList.toggle('hidden', !visible);
}
btnEndChain.addEventListener('click', () => {
  if (chainPiece && !inputLocked && !isAITurn() && !gameOver) passTurn();
});

// --- Desfazer (contra a IA custa +10s no tempo do ranking) ---
btnUndo.addEventListener('click', () => {
  if (gameOver || moveHistory.length === 0) return;
  if (inputLocked && !isAITurn()) return; // espera a animação do jogador terminar
  const lastState = moveHistory.pop();
  restoreBoard(lastState);
  if (vsAI) {
    penaltyMs += 10000;
    setToast('Jogada desfeita • +10s no seu tempo');
  } else {
    setToast('Jogada desfeita');
  }
  updateHUD();
});

// --- Câmera: alterna entre lado do jogador, visão de cima e lado adversário ---
const CAMERAS = [
  { label: 'Sua visão', side: 'white', phi: 0.9, zoom: 1 },
  { label: 'Visão de cima', side: 'white', phi: 0.22, zoom: 1.1 },
  { label: 'Lado adversário', side: 'black', phi: 0.9, zoom: 1 }
];
let cameraIndex = 0;
$('btn-camera').addEventListener('click', () => {
  cameraIndex = (cameraIndex + 1) % CAMERAS.length;
  const cam = CAMERAS[cameraIndex];
  faceCameraTo(cam.side);
  camState.targetPhi = cam.phi;
  camState.targetRadius = getFitRadius() * cam.zoom;
  setToast(`Câmera: ${cam.label}`);
});

// --- Tela inicial ---
const nameInput = $('player-name');
const nameError = $('name-error');
let startMode = vsAI ? 'ai' : 'pvp';
let startLevel = difficulty;
nameInput.value = playerName;

function refreshStartUI() {
  document.querySelectorAll('#mode-group .seg').forEach((b) => {
    const on = b.dataset.mode === startMode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  document.querySelectorAll('#level-group .seg').forEach((b) => {
    const on = b.dataset.level === startLevel;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  $('level-field').classList.toggle('hidden', startMode !== 'ai');
}

document.querySelectorAll('#mode-group .seg').forEach((b) =>
  b.addEventListener('click', () => {
    startMode = b.dataset.mode;
    refreshStartUI();
  })
);
document.querySelectorAll('#level-group .seg').forEach((b) =>
  b.addEventListener('click', () => {
    startLevel = b.dataset.level;
    refreshStartUI();
  })
);

// "maria  da silva" -> "Maria da Silva"
function tidyName(raw) {
  const small = ['da', 'de', 'do', 'das', 'dos', 'e'];
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w, i) => {
      const low = w.toLocaleLowerCase('pt-BR');
      return i > 0 && small.includes(low) ? low : low.charAt(0).toLocaleUpperCase('pt-BR') + low.slice(1);
    })
    .join(' ');
}

function validName(name) {
  const parts = name.split(' ').filter((w) => w.length >= 2);
  return parts.length >= 2 && /^[\p{L}' .-]+$/u.test(name);
}

nameInput.addEventListener('input', () => {
  nameInput.classList.remove('invalid');
  nameError.textContent = '';
});

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = tidyName(nameInput.value);
  if (startMode === 'ai' && !validName(name)) {
    nameInput.classList.add('invalid');
    nameError.textContent = 'Digite seu nome e sobrenome para entrar no ranking.';
    nameInput.focus();
    return;
  }
  if (name) {
    playerName = name;
    nameInput.value = name;
    savePref('vincol-nome', name);
  }
  vsAI = startMode === 'ai';
  difficulty = startLevel;
  savePref('vincol-level', difficulty);
  gameOverPending = false; // nova partida: descarta o fim da anterior
  closeStart();
  initGame();
});

function openStart() {
  const inProgress = !gameOver && moveHistory.length > 0;
  menuOpenedAt = performance.now();
  menuOpen = true;
  hideGameOver();
  startMode = vsAI ? 'ai' : 'pvp';
  startLevel = difficulty;
  refreshStartUI();
  $('btn-continue').classList.toggle('hidden', !inProgress);
  startScreenEl.classList.remove('hidden');
}

function closeStart() {
  if (menuOpen) matchStart += performance.now() - menuOpenedAt; // não conta o tempo no menu
  menuOpen = false;
  nameInput.blur();
  startScreenEl.classList.add('hidden');
  if (gameOverPending && gameOver) showGameOver();
}

$('btn-menu').addEventListener('click', openStart);
$('btn-gameover-menu').addEventListener('click', openStart);
$('btn-play-again').addEventListener('click', initGame);
$('btn-continue').addEventListener('click', closeStart);

// --- Ranking ---
let rankingFilter = 'todos';

function renderRanking() {
  const list = $('ranking-list');
  list.textContent = '';
  const rows = fullRanking().filter((r) => rankingFilter === 'todos' || r.nivel === rankingFilter);
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.className = 'ranking-empty';
    li.textContent = 'Ninguém neste nível ainda. Seja o primeiro!';
    list.appendChild(li);
    return;
  }
  rows.slice(0, 50).forEach((r, i) => {
    const li = document.createElement('li');
    li.className = 'rank-row' + (r.meu ? ' me' : '');

    const pos = document.createElement('span');
    pos.className = 'rank-pos';
    pos.textContent = `${i + 1}º`;

    const who = document.createElement('div');
    who.className = 'rank-name';
    const nm = document.createElement('b');
    nm.textContent = r.nome; // textContent: nome digitado nunca vira HTML
    who.appendChild(nm);
    if (r.meu) {
      const tag = document.createElement('small');
      tag.textContent = `Você • ${new Date(r.data).toLocaleDateString('pt-BR')}`;
      who.appendChild(tag);
    }

    const time = document.createElement('div');
    time.className = 'rank-time';
    const t = document.createElement('b');
    t.textContent = formatTime(r.tempoMs);
    const lv = document.createElement('small');
    lv.textContent = DIFFICULTY[r.nivel] ? DIFFICULTY[r.nivel].label : '';
    time.append(t, lv);

    li.append(pos, who, time);
    list.appendChild(li);
  });
}

document.querySelectorAll('#ranking-tabs .tab').forEach((tab) =>
  tab.addEventListener('click', () => {
    rankingFilter = tab.dataset.filter;
    document.querySelectorAll('#ranking-tabs .tab').forEach((t) => t.classList.toggle('active', t === tab));
    renderRanking();
  })
);

let rankingPausedTimer = false;
function openRanking() {
  renderRanking();
  // Durante a partida, abrir o ranking pausa o cronômetro como o menu
  if (!menuOpen) {
    menuOpenedAt = performance.now();
    menuOpen = true;
    rankingPausedTimer = true;
  }
  rankingScreenEl.classList.remove('hidden');
}

function closeRanking() {
  rankingScreenEl.classList.add('hidden');
  if (rankingPausedTimer) {
    rankingPausedTimer = false;
    closeStart();
  }
}

$('btn-ranking').addEventListener('click', openRanking);
$('btn-start-ranking').addEventListener('click', openRanking);
$('btn-close-ranking').addEventListener('click', closeRanking);

refreshStartUI();

// ============================================================================
// 10. LOOP DE RENDERIZAÇÃO (SOB DEMANDA) E ANIMAÇÃO IDLE
// ============================================================================
// iOS/Android podem descartar o WebGL quando o jogo fica em segundo plano. O Three.js
// restaura sozinho quando o navegador devolve o contexto; se isso não acontecer, recarrega.
let contextLostTimer = null;
renderer.domElement.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  setToast('Recarregando os gráficos...');
  contextLostTimer = setTimeout(() => location.reload(), 5000);
});
renderer.domElement.addEventListener('webglcontextrestored', () => {
  clearTimeout(contextLostTimer);
  setToast('Gráficos restaurados.');
});

let lastFitAspect = camera.aspect;
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Só reenquadra quando a proporção muda de verdade (girar o celular). Teclado virtual e
  // barra do navegador mudam pouco a altura e não devem desfazer o zoom do jogador.
  const aspect = camera.aspect;
  if (Math.abs(aspect - lastFitAspect) > 0.2) {
    lastFitAspect = aspect;
    camState.targetRadius = getFitRadius() * (cameraIndex === 1 ? 1.1 : 1);
  }
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
});

initGame();
openStart();

// Economia de bateria: com tudo parado o celular desenha a 30 fps, e com menu,
// ranking ou fim de jogo na frente, a 4 fps. Movimentos e efeitos voltam a 60 fps.
let lastRenderAt = 0;
function overlayVisible() {
  return (
    !startScreenEl.classList.contains('hidden') ||
    !rankingScreenEl.classList.contains('hidden') ||
    !gameoverEl.classList.contains('hidden')
  );
}

function animate(now) {
  requestAnimationFrame(animate);
  if (document.hidden) return;

  const cameraMoving = updateCameraPosition();
  const busy = cameraMoving || activeAnimations.length > 0 || activeParticles.length > 0 || crowdCheerUntil > 0;
  const minInterval = busy ? 0 : overlayVisible() ? 250 : isTouchDevice ? 33 : 0;
  if (now - lastRenderAt < minInterval - 2) return;
  const dt = Math.min(0.1, (now - (lastRenderAt || now)) / 1000);
  lastRenderAt = now;
  const time = now * 0.001;

  // ANIMAÇÃO IDLE: pneu parado em pé, halo pulsando e coroa da dama girando
  piecesGroup.children.forEach((piece) => {
    const ud = piece.userData;
    if (!ud.isAnimating) {
      const offset = ud.idleOffset;
      piece.position.y = 0.12;
      ud.ringMat.opacity = 0.35 + Math.sin(time * 3.2 + offset) * 0.25;
      // pneu selecionado gira devagar no lugar, como se estivesse acelerando
      if (piece === selectedPiece) ud.wheel.rotation.z -= dt * 3.6;
    }
    if (ud.isKing) ud.crownGroup.rotation.y = -time * 1.5;
  });

  // Carros dando voltas no oval e torcida comemorando
  updateRaceCars(time);
  updateCrowd(now);

  // Atualiza animações ativas
  for (let i = activeAnimations.length - 1; i >= 0; i--) {
    const finished = activeAnimations[i](now);
    if (finished) activeAnimations.splice(i, 1);
  }

  // Atualiza física dos fragmentos
  for (let i = activeParticles.length - 1; i >= 0; i--) {
    const p = activeParticles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.0035;

    if (p.mesh.position.y < 0.14) {
      p.mesh.position.y = 0.14;
      p.vy *= -0.45;
      p.vx *= 0.75;
      p.vz *= 0.75;
    }

    p.mesh.rotation.x += p.rx;
    p.mesh.rotation.z += p.rz;
    p.life -= p.decay;
    p.mesh.scale.setScalar(Math.max(0.001, p.life));

    if (p.life <= 0) {
      fxGroup.remove(p.mesh);
      activeParticles.splice(i, 1);
    }
  }

  renderer.render(scene, camera);
  revealArena();
  adaptQuality(now, busy);
}

// Qualidade adaptativa: se o aparelho não sustenta ~24 fps durante os movimentos,
// reduz a resolução em etapas e, por último, desliga as sombras. Nunca volta a subir
// na mesma sessão, para não ficar oscilando.
const QUALITY_STEPS = [
  { ratio: 1.5 },
  { ratio: 1.25 },
  { ratio: 1.0 },
  { ratio: 1.0, noShadows: true }
];
let qualityLevel = 0;
let slowFrames = 0;
let measuredFrames = 0;
let lastQualityFrameAt = 0;
function adaptQuality(now, busy) {
  const interval = now - lastQualityFrameAt;
  lastQualityFrameAt = now;
  // Só mede com animação rodando a toda velocidade (parado o jogo limita de propósito)
  if (!busy || document.hidden || interval > 500) return;
  measuredFrames++;
  if (interval > 42) slowFrames++;
  if (measuredFrames < 90) return;
  const tooSlow = slowFrames / measuredFrames > 0.5;
  measuredFrames = 0;
  slowFrames = 0;
  if (!tooSlow || qualityLevel >= QUALITY_STEPS.length - 1) return;
  qualityLevel++;
  const step = QUALITY_STEPS[qualityLevel];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, step.ratio));
  if (step.noShadows) {
    renderer.shadowMap.enabled = false;
    scene.traverse((o) => {
      if (o.material && !Array.isArray(o.material)) o.material.needsUpdate = true;
    });
  }
}

requestAnimationFrame(animate);