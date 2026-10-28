import * as THREE from 'three';

// FROZEN CONTRACT: keep createScene() -> { scene, summit } and
// summit.userData.playerStart (Vector3 spawn point). The Mountain set may replace
// everything inside, but app.js depends on that return shape.

// Mountain style proposal (not final): 600 m broad dome massif, stylized realism.
// Shape feeling: broad wide dome, rounded peak with no tower, one long smooth
// tumble chute from under the summit to the landing, dark rock with patchy snow
// streaks, green base. Same systems as before: user rock textures, procedural
// snow, golden evening, snow line ~400 m, treeline ~300 m, bare tumble face.
const SUMMIT_Y = 600;
// Main tumble chute direction (radians around Y). Bare rock, no trees or snow.
const FACE = Math.PI / 4;
// Winding path direction: opposite side from the tumble face.
const PATH = FACE + Math.PI;
// Slope span in world meters (frustum y 0..550).
const SLOPE_H = 550;

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

// Ridge strength near the tumble chute fades to 15% so the fall line stays clean.
function faceCalm(theta) {
  return 0.15 + 0.85 * smoothstep(0.15, 0.7, angDiff(theta, FACE));
}

// Nominal skirt cone radius at world height y (no ridge detail).
function coneR(y) {
  return 90 + 510 * (540 - THREE.MathUtils.clamp(y, 0, 540)) / 540;
}

// Exact displaced slope surface radius, replicating the mesh displacement so
// trees, path steps, and boulders sit on the rock instead of floating or burying.
function surfR(theta, y) {
  const yc = THREE.MathUtils.clamp(y, 0, SLOPE_H);
  const y01 = yc / SLOPE_H;
  const mask = 1 - smoothstep(0.15, 0.7, angDiff(theta, FACE));
  const ridged = 1 + (ridge(theta) - 0.45) * 0.42 * calm01(y01) * faceCalm(theta);
  return coneR(yc) * (ridged * (1 - mask) + (chuteR(yc) / coneR(yc)) * mask);
}

// Clean 45-degree chute line in the face sector (run y 540 -> 40, then runout).
function chuteR(y) {
  if (y >= 60) return 630 - y;
  return 570 + (60 - y) * 0.5;
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
// world height, procedural snow above ~400 m in crevices and streaks flanking
// the chute (never on it, never a full cap).
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
    sh.uniforms.uSnowTint = { value: new THREE.Color(0.9, 0.95, 1.0) };
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
        snowM = max(snowM, vColor.b * smoothstep(250.0, 450.0, vWp.y));
        vec3 snowT = texture2D(mapSnow, vMapUv * vec2(60.0, 30.0)).rgb;
        diffuseColor.rgb = mix(rock * uRockTint, snowT * uSnowTint, clamp(snowM, 0.0, 1.0));`)
      .replace('#include <color_fragment>', '');
  };
  return mat;
}

// Displace a Y-centered cylinder radially by radialFn(theta, y01). Vertex color
// carries shader masks: r = chute gate (1 on the chute, no snow),
// g = crevice (1 in gullies, snow settles here), b = chute-edge streaks.
function sculpt(geo, rand, yMin, yMax, yBase, radialFn) {
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
      pos.setY(i, y + (rand() - 0.5) * (s - 1) * r * 0.03);
    }
    const wy = y + yBase;
    const gate = smoothstep(0.15, 0.7, angDiff(theta, FACE));
    colors[i * 3] = 1 - gate;
    colors[i * 3 + 1] = s < 1 ? 1 : 0.15;
    const streak = smoothstep(1.4, 0.45, angDiff(theta, FACE)) * (s < 1.05 ? 1 : 0);
    colors[i * 3 + 2] = (wy > 250 && gate > 0.3 && rand() < 0.75) ? streak : 0;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function createSummit() {
  // Gathering place sits IN the summit terrain: fire, seating, and spawn rest
  // on the dome top at SUMMIT_Y, not on a separate platform.
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

// Sculpted terrain: broad rounded dome + craggy shoulder + ridged skirt with
// one long smooth tumble chute + play-along boulders + foothills + pines +
// winding path + landing.
export function createMountain() {
  const mountain = new THREE.Group();
  mountain.name = 'mountain';
  const rand = mulberry32(20261028);
  const rock = mountainRockMaterial();

  // Summit dome: broad rounded cap (no tower), flattened calm top ~56 m across
  // where the gathering sits. Mesh base at y 510, pole reaches SUMMIT_Y.
  const domeGeo = sculpt(
    new THREE.SphereGeometry(90, 48, 20, 0, Math.PI * 2, 0, 0.75),
    rand, 65.8, 90, 510,
    (theta, y01) => 1 + (ridge(theta) - 0.45) * 0.1 * (1 - y01 * 0.85)
  );
  {
    // Flatten the very top into a natural bowl floor for the gathering.
    const pos = domeGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(pos.getX(i), pos.getZ(i)) < 30 && pos.getY(i) > 80) {
        pos.setY(i, 90);
      }
    }
    domeGeo.computeVertexNormals();
  }
  const dome = new THREE.Mesh(domeGeo, rock);
  dome.position.y = SUMMIT_Y - 90;
  dome.receiveShadow = true;
  mountain.add(dome);

  // Shoulder: short craggy band closing dome rim to skirt top (y 534 -> 576).
  const shoulderGeo = sculpt(
    new THREE.CylinderGeometry(61, 110, 42, 48, 4),
    rand, -21, 21, SUMMIT_Y - 45,
    (theta) => 1 + (ridge(theta + 0.7) - 0.45) * 0.3
  );
  const shoulder = new THREE.Mesh(shoulderGeo, rock);
  shoulder.position.y = SUMMIT_Y - 45;
  mountain.add(shoulder);

  // Main skirt: broad ridged mountain y 0 -> 550. Ridges fade near the chute
  // so the fall line stays a clean bare-rock 45-degree chute; elsewhere
  // buttresses and gullies vary the slope.
  const slopeGeo = sculpt(
    new THREE.CylinderGeometry(90, 600, SLOPE_H, 128, 32),
    rand, -SLOPE_H / 2, SLOPE_H / 2, SLOPE_H / 2,
    (theta, y01) => {
      const wy = y01 * SLOPE_H;
      const mask = 1 - smoothstep(0.15, 0.7, angDiff(theta, FACE));
      const target = chuteR(wy) / coneR(wy);
      const ridged = 1 + (ridge(theta) - 0.45) * 0.42 * calm01(y01) * faceCalm(theta);
      return ridged * (1 - mask) + target * mask;
    }
  );
  const slope = new THREE.Mesh(slopeGeo, rock);
  slope.position.y = SLOPE_H / 2;
  slope.receiveShadow = true;
  mountain.add(slope);

  // Play-along boulders: two rough lines flanking the chute like couloir walls,
  // standing proud so falls glance off and bounce further instead of stopping.
  const bSeed = mulberry32(77);
  const putBoulder = (theta, y, s, sink) => {
    const r = surfR(theta, y);
    const bGeo = sculpt(
      new THREE.DodecahedronGeometry(s, 0),
      bSeed, -s, s, y, () => 1 + (bSeed() - 0.5) * 0.35
    );
    const b = new THREE.Mesh(bGeo, rock);
    b.position.set(Math.cos(theta) * (r - s * sink), y, Math.sin(theta) * (r - s * sink));
    b.rotation.set(bSeed() * 3, bSeed() * 3, bSeed() * 3);
    mountain.add(b);
  };
  for (let i = 0; i < 6; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    putBoulder(FACE + side * (0.35 + (i >> 1) * 0.12), 120 + (i >> 1) * 130, 10 + bSeed() * 8, 0.3);
  }
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    putBoulder(FACE + side * (0.5 + bSeed() * 0.5), 60 + bSeed() * 440, 5 + bSeed() * 9, 0.35);
  }

  // Foothills: smaller rocky shoulders around the main peak for scale.
  const hillSeed = mulberry32(913);
  const hillAngles = [2.2, 3.4, 4.4, 5.6];
  for (let i = 0; i < hillAngles.length; i++) {
    const h = 90 + hillSeed() * 80;
    const hr = 120 + hillSeed() * 80;
    const dist = 560 + hillSeed() * 120;
    const hGeo = sculpt(
      new THREE.CylinderGeometry(hr * 0.25, hr, h, 32, 8),
      hillSeed, -h / 2, h / 2, 0,
      (theta, y01) => 1 + (ridge(theta + i) - 0.45) * 0.4 * calm01(y01)
    );
    const hill = new THREE.Mesh(hGeo, rock);
    hill.position.set(Math.cos(hillAngles[i]) * dist, h / 2, Math.sin(hillAngles[i]) * dist);
    hill.receiveShadow = true;
    mountain.add(hill);
  }

  // Pine trees for scale: dark-green pines on the slope edges and landing
  // apron, sunk onto the exact surface. Below the ~300 m treeline,
  // never on the tumble chute.
  // Painted pine sprite: layered washes with snow-dusted top edges, alpha cutout.
  function pineSprite() {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 256;
    const g = c.getContext('2d');
    const r = mulberry32(31);
    g.fillStyle = '#4a3826';
    g.fillRect(60, 200, 8, 56);
    const layer = (cx, top, base, w, col, hi) => {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(cx, top);
      g.lineTo(cx - w / 2, base);
      g.lineTo(cx + w / 2, base);
      g.closePath();
      g.fill();
      g.strokeStyle = hi;
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx, top + 6);
      g.lineTo(cx - w / 2 + 8, base - 4);
      g.moveTo(cx, top + 6);
      g.lineTo(cx + w / 2 - 8, base - 4);
      g.stroke();
    };
    layer(64, 40, 150, 104, '#24402a', '#3f6b41');
    layer(64, 100, 200, 84, '#27462c', '#45704a');
    layer(64, 155, 235, 62, '#2b4c30', '#4d7a52');
    g.fillStyle = 'rgba(232,238,242,0.9)';
    for (let i = 0; i < 90; i++) {
      g.fillRect(20 + r() * 88, 40 + r() * 150, 2, 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const treeSpots = [];
  const tSeed = mulberry32(551);
  while (treeSpots.length < 44) {
    const theta = tSeed() * Math.PI * 2;
    if (angDiff(theta, FACE) < 0.75) continue;
    const y = 5 + tSeed() * 295;
    treeSpots.push({ theta, y, r: surfR(theta, y), s: 1.2 + tSeed() * 1.0 });
  }
  for (let i = 0; i < 8; i++) {
    const theta = tSeed() * Math.PI * 2;
    if (angDiff(theta, FACE) < 0.5) continue;
    treeSpots.push({ theta, y: 2, r: 610 + tSeed() * 30, s: 1.6 + tSeed() * 0.8 });
  }
  // Fake foliage: crossed alpha-cutout billboards, two draw calls for all trees.
  const pineGeo = new THREE.PlaneGeometry(8, 16);
  pineGeo.translate(0, 8, 0);
  const pineMat = new THREE.MeshStandardMaterial({
    map: pineSprite(), alphaTest: 0.45, side: THREE.DoubleSide,
  });
  const pineA = new THREE.InstancedMesh(pineGeo, pineMat, treeSpots.length);
  const pineB = new THREE.InstancedMesh(pineGeo, pineMat, treeSpots.length);
  const m = new THREE.Matrix4();
  const q0 = new THREE.Quaternion();
  const q90 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  const pv = new THREE.Vector3();
  const ps = new THREE.Vector3();
  treeSpots.forEach((t, i) => {
    pv.set(Math.cos(t.theta) * t.r, t.y - 2, Math.sin(t.theta) * t.r);
    ps.set(t.s, t.s, t.s);
    m.compose(pv, q0, ps);
    pineA.setMatrixAt(i, m);
    m.compose(pv, q90, ps);
    pineB.setMatrixAt(i, m);
  });
  mountain.add(pineA, pineB);

  // Winding path: dusty switchback trail up the far side from the landing.
  const pathMat = new THREE.MeshStandardMaterial({ color: 0x9a8a6e });
  const stepGeo = new THREE.BoxGeometry(5, 1.6, 3);
  for (let i = 0; i < 26; i++) {
    const y = 4 + (i / 25) * 420;
    const theta = PATH + 0.5 * Math.sin((i / 25) * Math.PI * 3);
    const r = surfR(theta, y) + 1.8;
    const step = new THREE.Mesh(stepGeo, pathMat);
    step.position.set(Math.cos(theta) * r, y + 1.8, Math.sin(theta) * r);
    step.rotation.y = -theta;
    mountain.add(step);
  }

  // Painted clouds: soft billboard streaks parked high around the peak.
  function cloudSprite() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 128;
    const g = c.getContext('2d');
    const r = mulberry32(99);
    for (let i = 0; i < 26; i++) {
      const x = 30 + r() * 196;
      const y = 45 + r() * 40;
      const rx = 22 + r() * 30;
      const ry = 10 + r() * 12;
      const grad = g.createRadialGradient(x, y, 2, x, y, rx);
      grad.addColorStop(0, 'rgba(255,244,230,0.85)');
      grad.addColorStop(0.7, 'rgba(255,220,190,0.4)');
      grad.addColorStop(1, 'rgba(255,220,190,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudSprite(), transparent: true, depthWrite: false, fog: false,
    side: THREE.DoubleSide,
  });
  const cloudGeo = new THREE.PlaneGeometry(150, 60);
  const cSeed = mulberry32(7);
  for (let i = 0; i < 6; i++) {
    const a = cSeed() * Math.PI * 2;
    const d = 700 + cSeed() * 320;
    const cloud = new THREE.Mesh(cloudGeo, cloudMat);
    cloud.position.set(Math.cos(a) * d, 680 + cSeed() * 110, Math.sin(a) * d);
    cloud.lookAt(0, cloud.position.y, 0);
    mountain.add(cloud);
  }

  // Bottom landing: same rock treatment, catching the slope foot.
  const landing = new THREE.Mesh(
    new THREE.CylinderGeometry(700, 700, 2, 64),
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
      top: { value: new THREE.Color(0x2a3f66) },
      horizon: { value: new THREE.Color(0xf7b46e) },
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
        float band = sin(vDir.y * 46.0 + atan(vDir.z, vDir.x) * 2.0) * 0.5 + 0.5;
        float bandM = smoothstep(0.03, 0.12, vDir.y) * (1.0 - smoothstep(0.12, 0.3, vDir.y));
        col = mix(col, vec3(1.0, 0.85, 0.75), bandM * smoothstep(0.4, 0.8, band) * 0.5);
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

  // Painted meadow: warm grassy center fading to dusk at the edges.
  function meadowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(256, 256, 40, 256, 256, 256);
    grad.addColorStop(0, '#77854e');
    grad.addColorStop(0.55, '#5a6b45');
    grad.addColorStop(1, '#55554e');
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2200, 2200),
    new THREE.MeshStandardMaterial({ map: meadowTexture() })
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
