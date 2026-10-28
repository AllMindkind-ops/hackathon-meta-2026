import * as THREE from 'three';

// FROZEN CONTRACT: keep createScene() -> { scene, summit } and
// summit.userData.playerStart (Vector3 spawn point). The Mountain set may replace
// everything inside, but app.js depends on that return shape.

// Greybox mountain: plain shapes, no color detail. All heights in meters.
const SUMMIT_Y = 300;

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

// Greybox terrain: cliff ring + single 45-degree slope + landing disc.
export function createMountain() {
  const mountain = new THREE.Group();
  mountain.name = 'greybox-mountain';
  const rock = new THREE.MeshStandardMaterial({ color: 0x7d7f88 });

  // Sheer drop: ~20 m near-vertical cliff ring below the summit edge (y 280 -> 300).
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(15.5, 17, 22, 48), rock);
  cliff.position.y = SUMMIT_Y - 11;
  mountain.add(cliff);

  // Main slope: 45-degree frustum from y 280 down to y 0
  // (280 m vertical = 280 m run, face ~396 m). One simple surface for the fall test.
  const slope = new THREE.Mesh(new THREE.CylinderGeometry(15, 295, 280, 64), rock);
  slope.position.y = 140;
  slope.receiveShadow = true;
  mountain.add(slope);

  // Bottom landing: wide flat disc catching the 590 m-wide slope foot,
  // with a look-back apron past it. Top surface at y 0.3.
  const landing = new THREE.Mesh(new THREE.CylinderGeometry(340, 340, 2, 64), rock);
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
