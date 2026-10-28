import * as THREE from 'three';

// FROZEN CONTRACT: keep createScene() -> { scene, summit } and
// summit.userData.playerStart (Vector3 spawn point). The Mountain set may replace
// everything inside, but app.js depends on that return shape.

// Mountain style proposal (not final): same 300 m sizes as the greybox,
// with a craggy rock look. All heights in meters.
const SUMMIT_Y = 300;

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

// Push vertices around radially for a broken rock silhouette, then paint
// per-vertex rock tones between dark and light. ampFn(y01) scales the ruggedness
// along the height (0 bottom, 1 top) so junctions stay clean.
function roughen(geo, rand, ampFn, dark, light) {
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
    if (r > 0.01) {
      const y01 = THREE.MathUtils.clamp(y / 140 + 0.5, 0, 1);
      const k = 1 + (rand() - 0.5) * ampFn(y01);
      pos.setX(i, x * k);
      pos.setZ(i, z * k);
      pos.setY(i, y + (rand() - 0.5) * ampFn(y01) * r * 0.15);
    }
    tmp.copy(cDark).lerp(cLight, rand());
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

function rockMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
}

export function createSummit() {
  const summit = new THREE.Group();
  summit.name = 'summit-gathering-place';

  // Summit flat: 30 m across disc, top surface at SUMMIT_Y.
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(15, 15, 2, 48),
    new THREE.MeshStandardMaterial({ color: 0x8a8f98 })
  );
  platform.position.y = SUMMIT_Y - 1;
  platform.receiveShadow = true;
  summit.add(platform);

  // Placeholder fire: stone pit + flame cone + warm light. Same layout as base, lifted.
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

// Rocky terrain: craggy cliff ring + faceted 45-degree slope with boulders + landing.
export function createMountain() {
  const mountain = new THREE.Group();
  mountain.name = 'mountain';
  const rand = mulberry32(20261028);

  // Sheer drop: ~20 m craggy cliff ring below the summit edge (y 280 -> 300).
  const cliffGeo = roughen(
    new THREE.CylinderGeometry(15.5, 17, 22, 24, 4),
    rand, () => 0.12, 0x4e4a44, 0x6e675e
  );
  const cliff = new THREE.Mesh(cliffGeo, rockMaterial());
  cliff.position.y = SUMMIT_Y - 11;
  mountain.add(cliff);

  // Main slope: 45-degree frustum, y 280 -> 0, broken into rock facets.
  // Calm at the top rim and foot so junctions stay clean, rugged mid-slope.
  const slopeGeo = roughen(
    new THREE.CylinderGeometry(15, 295, 280, 48, 24),
    rand, (y01) => 0.02 + 0.1 * Math.sin(y01 * Math.PI), 0x5c574f, 0x847d70
  );
  const slope = new THREE.Mesh(slopeGeo, rockMaterial());
  slope.position.y = 140;
  slope.receiveShadow = true;
  mountain.add(slope);

  // Boulders half-buried in the slope face for rock character.
  const boulderMat = rockMaterial();
  for (let i = 0; i < 10; i++) {
    const y = 30 + rand() * 220;
    const r = 295 - y;
    const a = rand() * Math.PI * 2;
    const s = 4 + rand() * 9;
    const bGeo = roughen(new THREE.DodecahedronGeometry(s, 0), rand, () => 0.35, 0x55514b, 0x7a746a);
    const b = new THREE.Mesh(bGeo, boulderMat);
    b.position.set(Math.cos(a) * (r - s * 0.3), y, Math.sin(a) * (r - s * 0.3));
    b.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    mountain.add(b);
  }

  // Bottom landing: wide flat disc catching the slope foot, with look-back apron.
  const landing = new THREE.Mesh(
    new THREE.CylinderGeometry(340, 340, 2, 64),
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
  sun.position.set(60, 320, 80);
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
