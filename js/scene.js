import * as THREE from 'three';

// FROZEN CONTRACT: keep createScene() -> { scene, summit } and
// summit.userData.playerStart (Vector3 spawn point). The Mountain set may replace
// everything inside, but app.js depends on that return shape.

// Mountain style proposal (not final): 600 m stylized-realistic peak.
// Feeling references only, no copied assets:
// - WoW Highmountain (tallest-peak presence, altitude-graded zones, harsh top):
//   https://web.archive.org/web/20171030130849/https://worldofwarcraft.com/en-us/news/20241588
// - Skyrim (light-grey jagged rock, snow patches, pines, pilgrim path):
//   http://outsideinradio.org/transcript-open-worlds
//
// Option 1 pass: user-supplied rock textures (dark.jpg summit, light.png base),
// derived bump, procedural snow, golden-evening sky dome, tight summit shadows.
// No new geometry in this pass.
const SUMMIT_Y = 600;
// Main tumble face direction (radians around Y). Bare rock, no trees or snow.
const FACE = Math.PI / 4;
// Winding path direction: opposite side from the tumble face.
const PATH = FACE + Math.PI;

// Tiny seeded random so the rock look is stable between reloads.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function angDiff(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
}

function smoothstep(e0, e1, x) {
  const t = THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Ridge field: deterministic buttresses and gullies around the peak, 0..1.
function ridge(theta) {
  return 0.55 * Math.pow(Math.abs(Math.sin(3 * theta + 1.3)), 1.3)
       + 0.45 * Math.abs(Math.sin(7 * theta + 0.5));
}

// 0 at slope rims so junctions stay clean, 1 mid-slope.
function calm01(y01) {
  return Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(y01, 0, 1)), 0.8);
}

// Ridge strength near the tumble face fades to 15% so the fall line stays clean.
function faceCalm(theta) {
  return 0.15 + 0.85 * smoothstep(0.15, 0.7, angDiff(theta, FACE));
}

// Analytic slope surface radius at angle theta and height y (0..545).
// Trees and path steps use this so they sit on the rock, not in the air.
function slopeRadius(theta, y) {
  const y01 = THREE.MathUtils.clamp(y / 545, 0, 1);
  return (575 - y) * (1 + (ridge(theta) - 0.45) * 0.42 * calm01(y01) * faceCalm(theta));
}

// --- Option 1 textures: user rock albedos, bump derived from each albedo
// (same image reused as bumpMap), procedural snow canvas. 512px and 256px:
// light on a 3-year-old Android.
const texLoader = new THREE.TextureLoader();
function albedoTex(url) {
  const t = texLoader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const lightTex = albedoTex('./light.png');
const darkTex = albedoTex('./dark.jpg');

function snowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#dfe9f4';
  g.fillRect(0, 0, 256, 256);
  const r = mulberry32(7);
  for (let i = 0; i < 2200; i++) {
    const v = 205 + Math.floor(r() * 50);
    g.fillStyle = `rgb(${v - 14},${v},${v + 1})`;
    g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 2, 2);
  }
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 130; i++) {
    g.fillRect(Math.floor(r() * 256), Math.floor(r() * 256), 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const snowTex = snowTexture();

// Shared mountain rock material: light base rock grading to dark peak rock by
// world height, procedural snow above ~400 m in crevices (never tumble face).
function mountainRockMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    map: lightTex,
    bumpMap: lightTex,
    bumpScale: 1.5,
    vertexColors: true,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.mapDark = { value: darkTex };
    sh.uniforms.mapSnow = { value: snowTex };
    sh.uniforms.uRockTint = { value: new THREE.Color(0.8, 0.85, 0.92) };
    sh.uniforms.uSnowTint = { value: new THREE.Color(0.85, 0.92, 1.0) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        uniform sampler2D mapDark;
        uniform sampler2D mapSnow;
        uniform vec3 uRockTint;
        uniform vec3 uSnowTint;`)
      .replace('#include <map_fragment>', `
        float grade = smoothstep(120.0, 480.0, vWp.y);
        vec3 rock = mix(texture2D(map, vMapUv * vec2(48.0, 24.0)).rgb,
                        texture2D(mapDark, vMapUv * vec2(36.0, 18.0)).rgb, grade);
        rock *= (0.82 + 0.18 * vColor.g);
        float snowM = smoothstep(400.0, 500.0, vWp.y) * vColor.g * (1.0 - vColor.r);
        vec3 snowT = texture2D(mapSnow, vMapUv * vec2(60.0, 30.0)).rgb;
        diffuseColor.rgb = mix(rock * uRockTint, snowT * uSnowTint, clamp(snowM, 0.0, 1.0));`)
      .replace('#include <color_fragment>', '');
  };
  return mat;
}

// Displace a Y-centered cylinder radially by radialFn(theta, y01). Vertex color
// now carries masks for the shader: r = tumble-face gate (1 on face, no snow),
// g = crevice (1 in gullies, snow settles here), b unused.
function sculpt(geo, rand, yMin, yMax, radialFn) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    let s = 1;
    let theta = 0;
    if (r > 0.01) {
      theta = Math.atan2(z, x);
      const y01 = THREE.MathUtils.clamp((y - yMin) / (yMax - yMin), 0, 1);
      s = radialFn(theta, y01);
      pos.setX(i, x * s);
      pos.setZ(i, z * s);
      pos.setY(i, y + (rand() - 0.5) * (s - 1) * r * 0.08);
    }
    colors[i * 3] = 1 - smoothstep(0.15, 0.7, angDiff(theta, FACE));
    colors[i * 3 + 1] = s < 1 ? 1 : 0.15;
    colors[i * 3 + 2] = 1;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function createSummit() {
  // Gathering place sits IN the summit terrain: fire, seating, and spawn rest
  // on the rocky crown top at SUMMIT_Y, not on a separate platform.
  const summit = new THREE.Group();
  summit.name = 'summit-gathering-place';

  // Placeholder fire: stone pit + flame cone + warm light.
  const pit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a4a4f })
  );
  pit.position.set(1.8, SUMMIT_Y + 0.15, -1.2);
  summit.add(pit);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.9, 10),
    new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff7a1a })
  );
  flame.position.set(1.8, SUMMIT_Y + 0.7, -1.2);
  flame.name = 'placeholder-fire';
  summit.add(flame);

  const fireLight = new THREE.PointLight(0xff9a50, 8, 12);
  fireLight.position.set(1.8, SUMMIT_Y + 1.1, -1.2);
  summit.add(fireLight);

  // Placeholder seating: four low benches facing the fire.
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x6b4f35 });
  const seatGeo = new THREE.BoxGeometry(1.4, 0.35, 0.5);
  const seatPositions = [
    [0.2, -2.9, 0.3],
    [3.4, -0.6, -1.2],
    [0.4, 0.6, 2.2],
    [-1.4, -1.4, 0.9],
  ];
  for (const [x, z, rot] of seatPositions) {
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(x, SUMMIT_Y + 0.18, z);
    seat.rotation.y = rot;
    summit.add(seat);
  }

  // Player start: game opens here, at the summit near the fire, not at the bottom.
  summit.userData.playerStart = new THREE.Vector3(-1.2, SUMMIT_Y, 0.6);
  return summit;
}

// Sculpted terrain: asymmetric crown + broken cliff band + ridged 45-degree
// slope with play-along boulders + foothills + pines + winding path + landing.
export function createMountain() {
  const mountain = new THREE.Group();
  mountain.name = 'mountain';
  const rand = mulberry32(20261028);
  const rock = mountainRockMaterial();

  // Summit crown: natural asymmetric rocky knob (y 570 -> 600), calm flat top
  // ~32 m across where the gathering sits.
  const crownGeo = sculpt(
    new THREE.CylinderGeometry(16, 30, 30, 48, 6),
    rand, -15, 15,
    (theta, y01) => 1 + (ridge(theta) - 0.45) * 0.14 * (0.25 + 0.75 * calm01(y01))
  );
  const crown = new THREE.Mesh(crownGeo, rock);
  crown.position.y = SUMMIT_Y - 15;
  crown.receiveShadow = true;
  mountain.add(crown);

  // Sheer top: broken craggy cliff band below the crown (y 543 -> 575).
  const cliffGeo = sculpt(
    new THREE.CylinderGeometry(30.5, 33, 32, 48, 4),
    rand, -16, 16,
    (theta) => 1 + (ridge(theta + 0.7) - 0.45) * 0.3
  );
  const cliff = new THREE.Mesh(cliffGeo, rock);
  cliff.position.y = SUMMIT_Y - 41;
  mountain.add(cliff);

  // Main slope: ridged peak y 545 -> 0. Ridges fade near the tumble face so it
  // stays a clean bare-rock ~45-degree fall line; elsewhere buttresses and
  // gullies vary the slope between roughly 38 and 52 degrees.
  const slopeGeo = sculpt(
    new THREE.CylinderGeometry(30, 575, 545, 128, 32),
    rand, -272.5, 272.5,
    (theta, y01) => 1 + (ridge(theta) - 0.45) * 0.42 * calm01(y01) * faceCalm(theta)
                      + (rand() - 0.5) * 0.015 * calm01(y01)
  );
  const slope = new THREE.Mesh(slopeGeo, rock);
  slope.position.y = 272.5;
  slope.receiveShadow = true;
  mountain.add(slope);

  // Play-along boulders: flank the tumble face in pairs and stand proud of the
  // surface, so falls glance off and bounce further instead of stopping.
  const bSeed = mulberry32(77);
  const putBoulder = (theta, y, s, sink) => {
    const r = 575 - y;
    const bGeo = sculpt(
      new THREE.DodecahedronGeometry(s, 0),
      bSeed, -s, s, () => 1 + (bSeed() - 0.5) * 0.35
    );
    const b = new THREE.Mesh(bGeo, rock);
    b.position.set(Math.cos(theta) * (r - s * sink), y, Math.sin(theta) * (r - s * sink));
    b.rotation.set(bSeed() * 3, bSeed() * 3, bSeed() * 3);
    mountain.add(b);
  };
  for (let i = 0; i < 10; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    putBoulder(FACE + side * (0.3 + bSeed() * 0.5), 60 + bSeed() * 420, 5 + bSeed() * 9, 0.2);
  }
  for (let i = 0; i < 4; i++) {
    putBoulder(bSeed() * Math.PI * 2, 60 + bSeed() * 420, 5 + bSeed() * 9, 0.4);
  }

  // Foothills: smaller rocky shoulders around the main peak for scale.
  const hillSeed = mulberry32(913);
  const hillAngles = [2.2, 3.4, 4.4, 5.6];
  for (let i = 0; i < hillAngles.length; i++) {
    const h = 90 + hillSeed() * 80;
    const hr = 120 + hillSeed() * 80;
    const dist = 500 + hillSeed() * 120;
    const hGeo = sculpt(
      new THREE.CylinderGeometry(hr * 0.25, hr, h, 32, 8),
      hillSeed, -h / 2, h / 2,
      (theta, y01) => 1 + (ridge(theta + i) - 0.45) * 0.4 * calm01(y01)
    );
    const hill = new THREE.Mesh(hGeo, rock);
    hill.position.set(Math.cos(hillAngles[i]) * dist, h / 2, Math.sin(hillAngles[i]) * dist);
    hill.receiveShadow = true;
    mountain.add(hill);
  }

  // Pine trees for scale: dark-green pines on the slope edges and landing
  // apron, sunk onto the analytic surface. Below the ~300 m treeline,
  // never on the tumble face.
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3826 });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x2d4a2d, flatShading: true });
  const treeSpots = [];
  const tSeed = mulberry32(551);
  while (treeSpots.length < 44) {
    const theta = tSeed() * Math.PI * 2;
    if (angDiff(theta, FACE) < 0.75) continue;
    const y = 5 + tSeed() * 295;
    treeSpots.push({ theta, y, r: slopeRadius(theta, y), s: 1.2 + tSeed() * 1.0 });
  }
  for (let i = 0; i < 8; i++) {
    const theta = tSeed() * Math.PI * 2;
    if (angDiff(theta, FACE) < 0.5) continue;
    treeSpots.push({ theta, y: 2, r: 590 + tSeed() * 40, s: 1.6 + tSeed() * 0.8 });
  }
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, treeSpots.length);
  const coneGeo1 = new THREE.ConeGeometry(4, 7, 7);
  const coneGeo2 = new THREE.ConeGeometry(2.8, 5, 7);
  const coneMesh1 = new THREE.InstancedMesh(coneGeo1, coneMat, treeSpots.length);
  const coneMesh2 = new THREE.InstancedMesh(coneGeo2, coneMat, treeSpots.length);
  const m = new THREE.Matrix4();
  treeSpots.forEach((t, i) => {
    const x = Math.cos(t.theta) * t.r;
    const z = Math.sin(t.theta) * t.r;
    m.makeScale(t.s, t.s, t.s);
    m.setPosition(x, t.y - 4 + 2 * t.s, z);
    trunkMesh.setMatrixAt(i, m);
    m.setPosition(x, t.y - 4 + 5.5 * t.s, z);
    coneMesh1.setMatrixAt(i, m);
    m.setPosition(x, t.y - 4 + 9 * t.s, z);
    coneMesh2.setMatrixAt(i, m);
  });
  mountain.add(trunkMesh, coneMesh1, coneMesh2);

  // Winding path: dusty switchback trail up the far side from the landing.
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x9a8a6e });
  const stepGeo = new THREE.BoxGeometry(5, 0.6, 3);
  for (let i = 0; i < 26; i++) {
    const y = 4 + (i / 25) * 420;
    const theta = PATH + 0.5 * Math.sin((i / 25) * Math.PI * 3);
    const r = slopeRadius(theta, y) + 1;
    const step = new THREE.Mesh(stepGeo, pathMat);
    step.position.set(Math.cos(theta) * r, y + 1, Math.sin(theta) * r);
    step.rotation.y = -theta;
    mountain.add(step);
  }

  // Bottom landing: same rock treatment, catching the slope foot.
  const landing = new THREE.Mesh(
    new THREE.CylinderGeometry(640, 640, 2, 64),
    rock
  );
  landing.position.y = -0.7;
  landing.receiveShadow = true;
  mountain.add(landing);

  return mountain;
}

// Golden-evening sky dome: warm horizon, dusky blue top, sun glow.
function createSky(sunDir) {
  const geo = new THREE.SphereGeometry(2400, 24, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f4a73) },
      horizon: { value: new THREE.Color(0xf0ab6e) },
      glow: { value: new THREE.Color(0xffe2b0) },
      sunDir: { value: sunDir.clone().normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 glow;
      uniform vec3 sunDir;
      void main() {
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 col = mix(horizon, top, pow(h, 0.55));
        if (vDir.y < 0.0) col = mix(horizon, horizon * 0.55, clamp(-vDir.y * 3.0, 0.0, 1.0));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += glow * (pow(s, 350.0) * 1.2 + pow(s, 8.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

// Empty scene: ground plane, golden-evening sky, tight summit sun + shadows.
export function createScene() {
  const scene = new THREE.Scene();
  scene.name = 'base-scene';
  scene.background = new THREE.Color(0xf0ab6e);
  scene.fog = new THREE.Fog(0xeaa972, 100, 900);

  const sunDir = new THREE.Vector3(-700, 220, 350);
  scene.add(createSky(sunDir));

  const hemi = new THREE.HemisphereLight(0x8fa8cc, 0x5a4a3c, 0.9);
  scene.add(hemi);

  // Golden-evening sun, low in the west. Tight 2048 px shadow map over the
  // summit only, not the whole 600 m, for the phone budget.
  const sun = new THREE.DirectionalLight(0xffd9b0, 1.3);
  sun.position.copy(sunDir);
  sun.target.position.set(0, 580, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 600;
  sun.shadow.camera.far = 1100;
  sun.shadow.normalBias = 2;
  scene.add(sun, sun.target);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ color: 0x6b6257 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground-plane';
  ground.receiveShadow = true;
  scene.add(ground);

  scene.add(createMountain());

  const summit = createSummit();
  scene.add(summit);

  return { scene, summit };
}
