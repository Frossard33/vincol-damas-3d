// ============================================================================
// 1. INICIALIZAÇÃO DO THREE.JS E CONTROLE DE CÂMERA ORBITAL NATIVO
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111114);
scene.fog = new THREE.FogExp2(0x111114, 0.014);

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

function updateCameraPosition() {
  camState.theta += (camState.targetTheta - camState.theta) * 0.12;
  camState.phi += (camState.targetPhi - camState.phi) * 0.12;
  camState.radius += (camState.targetRadius - camState.radius) * 0.12;

  camera.position.x = camState.radius * Math.sin(camState.phi) * Math.sin(camState.theta);
  camera.position.y = camState.radius * Math.cos(camState.phi);
  camera.position.z = camState.radius * Math.sin(camState.phi) * Math.cos(camState.theta);
  camera.lookAt(0, 0.4, 0);
}

function clampRadius(r) {
  return Math.max(9, Math.min(Math.max(32, getFitRadius() * 1.3), r));
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
    camState.targetPhi = Math.max(0.2, Math.min(1.42, camState.targetPhi - dy * 0.006));
  }
  camState.prevX = e.clientX;
  camState.prevY = e.clientY;
});

function releasePointer(e) {
  activePointers.delete(e.pointerId);
  pinchPrevDist = 0;
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
// 2. ILUMINAÇÃO
// ============================================================================
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222226, 1.15);
hemiLight.position.set(0, 25, 0);
scene.add(hemiLight);

const mainLight = new THREE.DirectionalLight(0xfff0dd, 1.55);
mainLight.position.set(8, 18, 10);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = isTouchDevice ? 1024 : 2048;
mainLight.shadow.mapSize.height = isTouchDevice ? 1024 : 2048;
mainLight.shadow.camera.near = 2;
mainLight.shadow.camera.far = 45;
const d = 10;
mainLight.shadow.camera.left = -d;
mainLight.shadow.camera.right = d;
mainLight.shadow.camera.top = d;
mainLight.shadow.camera.bottom = -d;
scene.add(mainLight);

const rimLight = new THREE.DirectionalLight(0xffd0d0, 0.8);
rimLight.position.set(-10, 12, -10);
scene.add(rimLight);

// ============================================================================
// 3. TEXTURAS PROCEDURAIS DO TABULEIRO
// ============================================================================
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

const marbleTex = createStoneTexture(true);
const obsidianTex = createStoneTexture(false);

// ============================================================================
// 4. CENÁRIO (GALPÃO, LETREIRO VINCOL E PILHAS DE PNEUS)
// ============================================================================
const cathedralGroup = new THREE.Group();
scene.add(cathedralGroup);

const stoneMat = new THREE.MeshStandardMaterial({
  color: 0x1b1b1f,
  roughness: 0.9,
  metalness: 0.05
});

// Piso e base do tabuleiro
const floorMesh = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.5, 48), stoneMat);
floorMesh.position.y = -2.25;
floorMesh.receiveShadow = true;
cathedralGroup.add(floorMesh);

const altarMesh = new THREE.Mesh(
  new THREE.BoxGeometry(11.4, 2.0, 11.4),
  new THREE.MeshStandardMaterial({ color: 0x26262c, roughness: 0.75, metalness: 0.1 })
);
altarMesh.position.y = -1.15;
altarMesh.receiveShadow = true;
cathedralGroup.add(altarMesh);

// Letreiro com o logo oficial da Vincol (imagem embutida em logo-data.js)
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
  if (typeof VINCOL_LOGO_DATA === 'string') {
    const img = new Image();
    img.onload = () => paint(img);
    img.src = VINCOL_LOGO_DATA;
  }
  return tex;
}

const signGroup = new THREE.Group();
signGroup.position.set(0, 3.6, -9.5);
signGroup.rotation.x = 0.08;
cathedralGroup.add(signGroup);
signGroup.add(
  new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 3.6),
    new THREE.MeshBasicMaterial({ map: createSignTexture() })
  )
);

// 4 pilhas de pneus com lâmpadas de oficina
const candleLights = [];
const candleFlames = [];
const cornerCoords = [
  [-5.6, -5.6],
  [5.6, -5.6],
  [-5.6, 5.6],
  [5.6, 5.6]
];

const rubberMat = new THREE.MeshStandardMaterial({
  color: 0x1a1a1f,
  roughness: 0.85,
  metalness: 0.05
});
const flameMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });

cornerCoords.forEach(([cx, cz]) => {
  for (let i = 0; i < 4; i++) {
    const stackTire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.2, 12, 28), rubberMat);
    stackTire.rotation.x = Math.PI / 2;
    stackTire.position.set(cx, -0.1 + i * 0.36, cz);
    stackTire.castShadow = true;
    cathedralGroup.add(stackTire);
  }

  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 12), flameMat);
  flame.position.set(cx, 1.55, cz);
  cathedralGroup.add(flame);
  candleFlames.push(flame);

  const pLight = new THREE.PointLight(0xffa726, 1.1, 14);
  pLight.position.set(cx, 1.8, cz);
  cathedralGroup.add(pLight);
  candleLights.push(pLight);
});

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

const tileMeshes = [];
for (let r = 0; r < 8; r++) {
  tileMeshes[r] = [];
  for (let c = 0; c < 8; c++) {
    const isPlayable = (r + c) % 2 === 1;
    const mat = isPlayable ? darkTileMat.clone() : lightTileMat;
    const tile = new THREE.Mesh(tileGeo, mat);
    tile.position.set(c - 3.5, 0.04, r - 3.5);
    tile.receiveShadow = true;
    tile.userData = { type: 'tile', r, c };
    boardGroup.add(tile);
    tileMeshes[r][c] = tile;
  }
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
const tireGeo = new THREE.TorusGeometry(0.27, 0.1, 16, 36);
const treadGeo = new THREE.BoxGeometry(0.03, 0.07, 0.3);
const rimRingGeo = new THREE.TorusGeometry(0.19, 0.025, 8, 28);
const spokeGeo = new THREE.BoxGeometry(0.035, 0.36, 0.05);
const hubGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.24, 12);
const haloGeo = new THREE.RingGeometry(0.33, 0.4, 36);
const hitGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.85, 12);
const hitMat = new THREE.MeshBasicMaterial({ visible: false });
const crownBandGeo = new THREE.TorusGeometry(0.17, 0.035, 10, 28);
const crownSpikeGeo = new THREE.ConeGeometry(0.045, 0.15, 6);
const crownGemGeo = new THREE.OctahedronGeometry(0.1, 0);

function buildWheel(rimMat) {
  const wheel = new THREE.Group();

  // Banda de rodagem (toro alargado no eixo do pneu)
  const tread = new THREE.Mesh(tireGeo, rubberPieceMat);
  tread.scale.z = 1.6;
  tread.castShadow = true;
  tread.receiveShadow = true;
  wheel.add(tread);

  // Gomos da banda de rodagem: deixam visível o pneu girando
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const block = new THREE.Mesh(treadGeo, rubberPieceMat);
    block.position.set(Math.cos(a) * 0.358, Math.sin(a) * 0.358, 0);
    block.rotation.z = a;
    wheel.add(block);
  }

  // Roda: aro + 5 raios + cubo
  const rim = new THREE.Mesh(rimRingGeo, rimMat);
  rim.scale.z = 4;
  wheel.add(rim);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(spokeGeo, rimMat);
    spoke.rotation.z = (i / 5) * Math.PI;
    wheel.add(spoke);
  }
  const hub = new THREE.Mesh(hubGeo, rimMat);
  hub.rotation.x = Math.PI / 2;
  wheel.add(hub);

  wheel.position.y = TIRE_RADIUS;
  return wheel;
}

function buildCrown(mat) {
  const crown = new THREE.Group();
  const band = new THREE.Mesh(crownBandGeo, mat);
  band.rotation.x = Math.PI / 2;
  band.castShadow = true;
  crown.add(band);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(crownSpikeGeo, mat);
    spike.position.set(Math.cos(a) * 0.17, 0.09, Math.sin(a) * 0.17);
    crown.add(spike);
  }
  const gem = new THREE.Mesh(crownGemGeo, mat);
  gem.position.y = 0.14;
  crown.add(gem);
  return crown;
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
  const arcaneRing = new THREE.Mesh(haloGeo, ringMat);
  arcaneRing.rotation.x = -Math.PI / 2;
  arcaneRing.position.y = 0.01;
  group.add(arcaneRing);

  // Dama = coroa dourada encaixada no topo do pneu
  const crownGroup = buildCrown(isWhite ? crownMatWhite : crownMatRed);
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
    arcaneRing,
    crownGroup,
    ringMat,
    idleOffset: Math.random() * Math.PI * 2,
    isAnimating: false
  };

  piecesGroup.add(group);
  return group;
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
      spawnTrailMote(new THREE.Vector3(pieceMesh.position.x, 0.16, pieceMesh.position.z), 0x9e9e9e);
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
      spawnArcaneStrike(attackerMesh.position.clone(), victimPos.clone().setY(0.4), beamColor);
      animateDestruction(capturedMesh);
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

// --- ANIMAÇÃO: DESTRUIÇÃO (pneu estourando) ---
function animateDestruction(victimMesh) {
  const origin = victimMesh.position.clone();
  const isWhite = victimMesh.userData.color === 'white';
  const shardMat = rubberPieceMat;
  const glowColor = isWhite ? 0xcfd8dc : 0xff5252;

  piecesGroup.remove(victimMesh);

  // Onda de choque
  const waveGeo = new THREE.RingGeometry(0.1, 0.25, 28);
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
      return true;
    }
    const s = 1 + wt * 4.5;
    wave.scale.set(s, s, 1);
    waveMat.opacity = 0.9 * (1 - wt);
    return false;
  });

  // Estilhaços 3D com física
  const shardGeo = new THREE.BoxGeometry(0.16, 0.08, 0.1);
  for (let i = 0; i < 18; i++) {
    const shard = new THREE.Mesh(shardGeo, shardMat);
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

function spawnTrailMote(pos, colorHex) {
  const mote = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.8 })
  );
  mote.position.copy(pos);
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

function spawnArcaneStrike(fromPos, toPos, colorHex) {
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

  // Avaliação estática do ponto de vista do Prata (positivo = bom para o Prata)
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
      if (p === 1) {
        wMat += 100;
        score += (7 - r) * 3;              // avanço rumo à promoção
        if (r === 7) score += 12;          // guarda da última linha
        if (central) score += 6;
        if (c === 0 || c === 7) score += 2;
        // proteção: pneu com aliado atrás não pode ser capturado por aquele lado
        if (r < 7) {
          if (c > 0 && b[i + 7] > 0) score += 3;
          if (c < 7 && b[i + 9] > 0) score += 3;
        }
        wAll.push(i);
      } else if (p === -1) {
        bMat += 100;
        score -= r * 3;
        if (r === 0) score -= 12;
        if (central) score -= 6;
        if (c === 0 || c === 7) score -= 2;
        if (r > 0) {
          if (c > 0 && b[i - 9] < 0) score -= 3;
          if (c < 7 && b[i - 7] < 0) score -= 3;
        }
        bAll.push(i);
      } else if (p === 2) {
        wMat += 165;
        if (central) score += 10;
        wKings.push(i);
        wAll.push(i);
      } else {
        bMat += 165;
        if (central) score -= 10;
        bKings.push(i);
        bAll.push(i);
      }
    }
    const material = wMat - bMat;
    score += material;
    // Quem está à frente quer trocar peças e simplificar o final
    const total = wMat + bMat;
    score += (material * (2600 - total)) / 5000;

    // No final, as damas de quem está ganhando caçam as peças adversárias
    const hunt = (kings, targets, sign) => {
      for (let k = 0; k < kings.length; k++) {
        let best = 99;
        const kr = kings[k] >> 3;
        const kc = kings[k] & 7;
        for (let t = 0; t < targets.length; t++) {
          const d = Math.max(Math.abs(kr - (targets[t] >> 3)), Math.abs(kc - (targets[t] & 7)));
          if (d < best) best = d;
        }
        if (best < 99) score -= sign * best * 3;
      }
    };
    if (material > 0 && total < 1400) hunt(wKings, bAll, 1);
    if (material < 0 && total < 1400) hunt(bKings, wAll, -1);
    return score;
  }

  function orderMoves(moves) {
    // Mais capturas primeiro; depois promoções
    return moves.sort((a, b) => b.caps.length - a.caps.length);
  }

  function negamax(b, side, depth, alpha, beta, ply) {
    if ((++nodes & 1023) === 0 && Date.now() > deadline) timedOut = true;
    if (timedOut) return 0;

    const moves = genMoves(b, side);
    if (moves.length === 0) return -WIN + ply; // sem jogadas = derrota
    if (depth <= 0) return quiesce(b, side, alpha, beta, ply, moves);

    orderMoves(moves);
    // Jogada única não consome profundidade
    const nextDepth = moves.length === 1 ? depth : depth - 1;
    let best = -Infinity;
    for (let k = 0; k < moves.length; k++) {
      const v = -negamax(apply(b, moves[k]), -side, nextDepth, -beta, -alpha, ply + 1);
      if (timedOut) return 0;
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
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
    orderMoves(caps);
    for (let k = 0; k < caps.length; k++) {
      if ((++nodes & 1023) === 0 && Date.now() > deadline) timedOut = true;
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

  // cfg: { depth, time, noise, blunder }
  function chooseMove(board, side, cfg) {
    const b = Int8Array.from(board);
    let moves = orderMoves(genMoves(b, side));
    if (moves.length === 0) return null;
    if (moves.length === 1) return { move: moves[0], depth: 0, score: 0 };

    deadline = Date.now() + cfg.time;
    nodes = 0;
    timedOut = false;
    let scored = moves.map((m) => ({ move: m, score: 0 }));
    let reached = 0;

    for (let depth = 1; depth <= cfg.depth; depth++) {
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
    return { move: pick.move, depth: reached, score: pick.score, nodes };
  }

  return { chooseMove, genMoves };
}

const DIFFICULTY = {
  facil:   { label: 'Fácil',   depth: 3,  time: 350,  noise: 45, blunder: 0.2 },
  medio:   { label: 'Médio',   depth: 5,  time: 700,  noise: 12, blunder: 0.05 },
  dificil: { label: 'Difícil', depth: 9,  time: 1200, noise: 0,  blunder: 0 },
  mestre:  { label: 'Mestre',  depth: 30, time: 2500, noise: 0,  blunder: 0 }
};
const DIFFICULTY_ORDER = ['facil', 'medio', 'dificil', 'mestre'];

const localEngine = createEngine();
let aiWorker = null;
let pendingAI = null;
let aiRequestId = 0;

try {
  const src =
    'const E = (' + createEngine.toString() + ')();\n' +
    'onmessage = (e) => postMessage({ id: e.data.id, result: E.chooseMove(e.data.board, e.data.side, e.data.cfg) });';
  aiWorker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  aiWorker.onmessage = (e) => {
    // Ignora respostas de pedidos antigos (ex.: jogada desfeita enquanto a IA pensava)
    if (pendingAI && e.data.id === pendingAI.id) {
      const p = pendingAI;
      pendingAI = null;
      p.resolve(e.data.result);
    }
  };
  aiWorker.onerror = () => {
    // Navegador bloqueou o Worker (ex.: arquivo local): calcula na thread principal
    aiWorker = null;
    if (pendingAI) {
      const p = pendingAI;
      pendingAI = null;
      p.resolve(localEngine.chooseMove(p.board, p.side, p.cfg));
    }
  };
} catch (err) {
  aiWorker = null;
}

function requestAIMove(board, side, cfg) {
  return new Promise((resolve) => {
    if (!aiWorker) {
      setTimeout(() => resolve(localEngine.chooseMove(board, side, cfg)), 20);
      return;
    }
    const id = ++aiRequestId;
    pendingAI = { id, resolve, board, side, cfg };
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

// Ranking: só vitórias contra a IA. Ordena por nível (mais difícil primeiro) e depois pelo menor tempo.
const LEVEL_RANK = { mestre: 4, dificil: 3, medio: 2, facil: 1 };
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
if (!Array.isArray(myRanking)) myRanking = [];

const $ = (id) => document.getElementById(id);
const toastEl = $('toast');
const toastTextEl = $('toast-text');
const timerEl = $('hud-timer');
const gameoverEl = $('gameover');
const startScreenEl = $('start-screen');
const rankingScreenEl = $('ranking-screen');
const btnUndo = $('btn-undo');
let restartTimer = null;

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
  return (name || '').split(' ')[0];
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
    piecesGroup.remove(piecesGroup.children[0]);
  }
  gameEpoch++;
  chainPiece = null;
  aiPlan = [];
  pendingAI = null;
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
  moves.forEach((m) => {
    const { r, c } = m.piece.userData;
    tileMeshes[r][c].material.emissive.setHex(m.captured ? 0x5a1414 : 0x23303a);
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
          setToast('Pode capturar de novo com o mesmo pneu, ou toque em outro lugar para encerrar a jogada.');
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
  const cfg = DIFFICULTY[difficulty];
  setToast('A IA está pensando...');
  const started = performance.now();

  requestAIMove(toEngineBoard(), -1, cfg).then((result) => {
    if (epoch !== gameEpoch || !isAITurn() || !result) return;
    // Pausa mínima para a jogada da IA não parecer instantânea
    const wait = Math.max(0, 450 - (performance.now() - started));
    setTimeout(() => {
      if (epoch !== gameEpoch) return;
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
    }, wait);
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

function addToRanking(entry) {
  myRanking = sortRanking(myRanking.concat([entry])).slice(0, 50);
  savePref('vincol-ranking', myRanking);
  return fullRanking().indexOf(entry) + 1;
}

function endGame(winner) {
  finalTimeMs = elapsedMs();
  gameOver = true;
  inputLocked = true;
  selectedPiece = null;
  clearTileHighlights();
  updateHUD();
  const epoch = gameEpoch;
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
    icon = 'emoji_events';
    detail = `Nível <b>${level}</b> em <b>${time}</b><br>Você está em <b>${pos}º lugar</b> no ranking`;
  } else if (vsAI) {
    title = 'A IA venceu';
    icon = 'sentiment_dissatisfied';
    detail = `Nível <b>${level}</b> • Tempo: <b>${time}</b><br>Tente de novo, você consegue!`;
  } else {
    title = `${sideName(winner)} venceu!`;
    icon = 'emoji_events';
    detail = `Tempo da partida: <b>${time}</b>`;
  }

  setToast(title);
  $('gameover-title').textContent = title;
  $('gameover-icon').textContent = icon;
  $('gameover-detail').innerHTML = detail; // só contém textos fixos, nível e tempo
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

  if (chainPiece) {
    // Captura em cadeia é opcional: tocar num destino válido continua, qualquer outro toque encerra
    const tileHit = raycaster.intersectObjects(boardGroup.children, false)[0];
    const t = tileHit && tileHit.object.userData;
    const move = t && t.type === 'tile' && validMoves.find((m) => m.toR === t.r && m.toC === t.c);
    if (move) executeMove(move);
    else passTurn();
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

  const tileHits = raycaster.intersectObjects(boardGroup.children, false);
  if (tileHits.length > 0 && selectedPiece) {
    const hitTile = tileHits[0].object;
    if (hitTile.userData && hitTile.userData.type === 'tile') {
      const move = validMoves.find(
        (m) => m.toR === hitTile.userData.r && m.toC === hitTile.userData.c
      );
      if (move) executeMove(move);
      else selectPiece(null); // toque fora: desmarca
    }
  }
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
// 10. LOOP DE RENDERIZAÇÃO E ANIMAÇÃO IDLE CONTÍNUA
// ============================================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  camState.targetRadius = getFitRadius() * (cameraIndex === 1 ? 1.1 : 1); // reenquadra ao girar a tela
});
window.addEventListener('orientationchange', () => {
  setTimeout(() => window.dispatchEvent(new Event('resize')), 200);
});

initGame();
openStart();

function animate(now) {
  requestAnimationFrame(animate);
  const time = now * 0.001;

  updateCameraPosition();

  // ANIMAÇÃO IDLE: pneu parado em pé, halo pulsando e coroa da dama girando
  piecesGroup.children.forEach((piece) => {
    const ud = piece.userData;
    if (!ud.isAnimating) {
      const offset = ud.idleOffset;
      piece.position.y = 0.12;
      ud.ringMat.opacity = 0.35 + Math.sin(time * 3.2 + offset) * 0.25;
      // pneu selecionado gira devagar no lugar, como se estivesse acelerando
      if (piece === selectedPiece) ud.wheel.rotation.z -= 0.06;
    }
    if (ud.isKing) ud.crownGroup.rotation.y = -time * 1.5;
  });

  // Lâmpadas da oficina piscando de leve
  candleLights.forEach((light, idx) => {
    light.intensity = 1.05 + Math.sin(time * 3 + idx * 2) * 0.08;
    candleFlames[idx].scale.setScalar(1 + Math.sin(time * 3 + idx * 2) * 0.04);
  });

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
}

requestAnimationFrame(animate);