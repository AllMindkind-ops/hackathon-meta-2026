import * as THREE from 'three';

// FROZEN CONTRACT: keep createScene() -> { scene, summit } and
// summit.userData.playerStart (Vector3 spawn point). The Mountain set may replace
// everything inside, but app.js depends on that return shape.

// Mountain style proposal (not final): 600 m sculpted peak, stylized realism.
// Ridges and gullies break the cone; the main tumble face stays near 45 degrees.
const SUMMIT_Y = 600;
// Main tumble face direction (radians around Y). Faces the default cameras.
const FACE = Math.PI / 4;

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

// Displace a Y-centered cylinder radially by radialFn(theta, y01) and paint
// per-vertex rock tones (gullies darker, ridges lighter).
function sculpt(geo, rand, yMin, yMax, radialFn, dark, light) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const cDark = new THREE.Color(dark);
  const cLight = new THREE.Color(light);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const r = Math.hypot(x, z);
    let s = 1;
    if (r > 0.01) {
      const theta = Math.atan2(z, x);
      const y01 = THREE.MathUtils.clamp((y - yMin) / (yMax - yMin), 0, 1);
      s = radialFn(theta, y01);
      pos.setX(i, x * s);
      pos.setZ(i, z * s);
      pos.setY(i, y + (rand() - 0.5) * (s - 1) * r * 0.2);
    }
    const t = THREE.MathUtils.clamp(0.5 + (s - 1) * 2, 0, 1) * 0.6 + rand() * 0.4;
    tmp.copy(cDark).lerp(cLight, t);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function rockMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
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
// slope with play-along boulders + landing.
export function createMountain() {
  const mountain = new THREE.Group();
  mountain.name = 'mountain';
  const rand = mulberry32(20261028);
  // Calm profile: 0 at rims so junctions stay clean, 1 mid-slope.
  const calm = (y01) => Math.pow(Math.sin(Math.PI * THREE.MathUtils.clamp(y01, 0, 1)), 0.8);

  // Summit crown: natural asymmetric rocky knob (y 570 -> 600), calm flat top
  // ~32 m across where the gathering sits.
  const crownGeo = sculpt(
    new THREE.CylinderGeometry(16, 30, 30, 48, 6),
    rand, -15, 15,
    (theta, y01) => 1 + (ridge(theta) - 0.45) * 0.14 * (0.25 + 0.75 * calm(y01)),
    0x5c574f, 0x847d70
  );
  const crown = new THREE.Mesh(crownGeo, rockMaterial());
  crown.position.y = SUMMIT_Y - 15;
  crown.receiveShadow = true;
  mountain.add(crown);

  // Sheer top: broken craggy cliff band below the crown (y 543 -> 575).
  const cliffGeo = sculpt(
    new THREE.CylinderGeometry(30.5, 33, 32, 48, 4),
    rand, -16, 16,
    (theta) => 1 + (ridge(theta + 0.7) - 0.45) * 0.3,
    0x4e4a44, 0x6e675e
  );
  const cliff = new THREE.Mesh(cliffGeo, rockMaterial());
  cliff.position.y = SUMMIT_Y - 41;
  mountain.add(cliff);

  // Main slope: ridged peak y 545 -> 0. Ridges fade near the tumble face so it
  // stays a clean ~45-degree fall line; elsewhere buttresses and gullies vary
  // the slope between roughly 38 and 52 degrees.
  const slopeGeo = sculpt(
    new THREE.CylinderGeometry(30, 575, 545, 128, 32),
    rand, -272.5, 272.5,
    (theta, y01) => {
      const faceCalm = 0.15 + 0.85 * smoothstep(0.15, 0.7, angDiff(theta, FACE));
      return 1 + (ridge(theta) - 0.45) * 0.38 * calm(y01) * faceCalm
               + (rand() - 0.5) * 0.05 * calm(y01);
    },
    0x5c574f, 0x847d70
  );
  const slope = new THREE.Mesh(slopeGeo, rockMaterial());
  slope.position.y = 272.5;
  slope.receiveShadow = true;
  mountain.add(slope);

  // Play-along boulders: flank the tumble face in pairs and stand proud of the
  // surface, so falls glance off and bounce further instead of stopping.
  const boulderMat = rockMaterial();
  const bSeed = mulberry32(77);
  const putBoulder = (theta, y, s, sink) => {
    const r = 575 - y;
    const bGeo = sculpt(
      new THREE.DodecahedronGeometry(s, 0),
      bSeed, -s, s, () => 1 + (bSeed() - 0.5) * 0.35, 0x55514b, 0x7a746a
    );
    const b = new THREE.Mesh(bGeo, boulderMat);
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

  // Bottom landing: wide flat disc catching the slope foot, with look-back apron.
  const landing = new THREE.Mesh(
    new THREE.CylinderGeometry(640, 640, 2, 64),
    new THREE.MeshStandardMaterial({ color: 0x6b655c })
  );
  landing.position.y = -0.7;
  landing.receiveShadow = true;
  mountain.add(landing);

  return mountain;
}

// Empty scene with ground plane + placeholder sky. Temporary sky.
export function createScene() {
  const scene = new THREE.Scene();
  scene.name = 'base-scene';
  scene.background = new THREE.Color(0x87a5c4);
  scene.fog = new THREE.Fog(0x87a5c4, 100, 900);

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x53606e, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(120, 640, 160);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1600, 1600),
    new THREE.MeshStandardMaterial({ color: 0x5d6b5a })
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
