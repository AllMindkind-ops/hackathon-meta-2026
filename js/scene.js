import * as THREE from 'three';

// Placeholder summit gathering place. Temporary: replaced by the Mountain set later.
export function createSummit() {
  const summit = new THREE.Group();
  summit.name = 'summit-gathering-place';

  // Flat summit platform (NOT a mountain, just a start pad at the top).
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(6, 6, 0.5, 24),
    new THREE.MeshStandardMaterial({ color: 0x8a8f98 })
  );
  platform.position.y = 0.25;
  platform.receiveShadow = true;
  summit.add(platform);

  // Placeholder fire: stone pit + flame cone + warm light.
  const pit = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.8, 0.3, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a4a4f })
  );
  pit.position.set(1.8, 0.65, -1.2);
  summit.add(pit);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.35, 0.9, 10),
    new THREE.MeshStandardMaterial({ color: 0xff9a3c, emissive: 0xff7a1a })
  );
  flame.position.set(1.8, 1.2, -1.2);
  flame.name = 'placeholder-fire';
  summit.add(flame);

  const fireLight = new THREE.PointLight(0xff9a50, 8, 12);
  fireLight.position.set(1.8, 1.6, -1.2);
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
    seat.position.set(x, 0.68, z);
    seat.rotation.y = rot;
    summit.add(seat);
  }

  // Player start marker: where the game opens, at the summit near the fire.
  summit.userData.playerStart = new THREE.Vector3(-1.2, 0.5, 0.6);
  return summit;
}

// Empty scene with ground plane + placeholder sky. Temporary sky.
export function createScene() {
  const scene = new THREE.Scene();
  scene.name = 'base-scene';
  scene.background = new THREE.Color(0x87a5c4);
  scene.fog = new THREE.Fog(0x87a5c4, 40, 140);

  const hemi = new THREE.HemisphereLight(0xcfe5ff, 0x53606e, 0.9);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(10, 18, 8);
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x5d6b5a })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground-plane';
  ground.receiveShadow = true;
  scene.add(ground);

  const summit = createSummit();
  scene.add(summit);

  return { scene, summit };
}
