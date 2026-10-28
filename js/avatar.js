import * as THREE from 'three';

// FROZEN CONTRACT: keep createAvatar() -> THREE.Group with origin at the feet.
// app.js places it at summit.userData.playerStart.
// Chibi humanoid (~1.3 m tall) in a one-color snow suit with a fluffy hood:
// big head with the back truncated (the hood hides it), painted face texture,
// golden scarf and gloves, black boots. Gender-neutral, no hair.
// Named pivots (neck, shoulderL/R, hipL/R) for a later ragdoll stage;
// no physics or steering wiring here.
export function createAvatar() {
  const avatar = new THREE.Group();
  avatar.name = 'chibi-avatar';

  const suit = new THREE.MeshStandardMaterial({ color: 0x5b7d8a, roughness: 0.9 });
  const hoodMat = new THREE.MeshStandardMaterial({ color: 0x5b7d8a, roughness: 0.9, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.95 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8a93d, roughness: 0.8 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 0.85 });

  // Face texture: cream base with painted eyes, sparkle, cheeks, and smile.
  // Canvas top is the sphere top (three.js sphere UVs store 1 - v), so eyes
  // paint high, cheeks middle, smile low. No mirroring: smile stays a smile.
  function faceTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#f2c9a0';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#2e2a26';
    for (const x of [104, 152]) {
      g.beginPath();
      g.ellipse(x, 116, 11, 16, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    for (const x of [100, 148]) {
      g.beginPath();
      g.arc(x, 110, 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#e88a8a';
    for (const x of [92, 164]) {
      g.beginPath();
      g.arc(x, 144, 9, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#2e2a26';
    g.lineWidth = 7;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(128, 150, 20, Math.PI * 0.15, Math.PI * 0.85);
    g.stroke();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const skin = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.85 });

  // Boots: rounded black nubs, lowest point at y = 0 (feet at origin).
  const bootGeo = new THREE.SphereGeometry(0.07, 6, 5);
  for (const x of [-0.09, 0.09]) {
    const boot = new THREE.Mesh(bootGeo, bootMat);
    boot.position.set(x, 0.07, 0.02);
    avatar.add(boot);
  }

  // Legs: hip pivots so each leg swings from the hip joint.
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.32, 2, 6);
  for (const [name, x] of [['hipL', -0.09], ['hipR', 0.09]]) {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(x, 0.52, 0);
    const leg = new THREE.Mesh(legGeo, suit);
    leg.position.y = -0.21;
    hip.add(leg);
    avatar.add(hip);
  }

  // Torso: snow suit body, same slate-blue as the limbs.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 2, 8), suit);
  torso.position.y = 0.68;
  torso.scale.set(1, 1, 0.85);
  avatar.add(torso);

  // Arms: shoulder pivots with a slight outward rest angle, golden gloves.
  const armGeo = new THREE.CapsuleGeometry(0.05, 0.26, 2, 6);
  const mittGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (const [name, x, rest] of [['shoulderL', -0.175, -0.12], ['shoulderR', 0.175, 0.12]]) {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    shoulder.position.set(x, 0.82, 0);
    shoulder.rotation.z = rest;
    const arm = new THREE.Mesh(armGeo, suit);
    arm.position.y = -0.17;
    shoulder.add(arm);
    const mitt = new THREE.Mesh(mittGeo, gold);
    mitt.position.y = -0.36;
    shoulder.add(mitt);
    avatar.add(shoulder);
  }

  // Scarf: golden ring at the neck.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.045, 6, 14), gold);
  ring.position.y = 0.9;
  ring.rotation.x = Math.PI / 2;
  avatar.add(ring);

  // Head: neck pivot. Front sector kept around +z, back truncated (the hood
  // covers it). Hood shell sits over the back with a face opening; fluffy
  // trim rings the opening and breaks the round silhouette.
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.88, 0);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 8, 6, -0.4292, 4.0),
    skin
  );
  head.position.y = 0.2;
  neck.add(head);
  const hood = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 10, 8, Math.PI / 2 + 1.13, Math.PI * 2 - 2.26),
    hoodMat
  );
  hood.position.y = 0.2;
  neck.add(hood);
  const trimRing = new THREE.Mesh(new THREE.TorusGeometry(0.213, 0.032, 5, 12), trim);
  trimRing.position.set(0, 0.2, 0.1);
  neck.add(trimRing);
  avatar.add(neck);

  return avatar;
}
