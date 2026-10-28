import * as THREE from 'three';

// FROZEN CONTRACT: keep createAvatar() -> THREE.Group with origin at the feet.
// app.js places it at summit.userData.playerStart.
// Chibi humanoid (~1.2 m tall): big round head, slim limbs, smiley face, scarf.
// Named pivots (neck, shoulderL/R, hipL/R) for a later ragdoll stage;
// no physics or steering wiring here.
export function createAvatar() {
  const avatar = new THREE.Group();
  avatar.name = 'chibi-avatar';

  const skin = new THREE.MeshStandardMaterial({ color: 0xf2c9a0, roughness: 0.85 });
  const sweater = new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.9 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x5b7d8a, roughness: 0.9 });
  const scarf = new THREE.MeshStandardMaterial({ color: 0xe8a93d, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e2a26, roughness: 0.5 });
  const spark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const blush = new THREE.MeshStandardMaterial({ color: 0xe88a8a, roughness: 0.9 });

  // Boots: rounded nubs, lowest point at y = 0 (feet at origin).
  const bootGeo = new THREE.SphereGeometry(0.07, 6, 5);
  for (const x of [-0.09, 0.09]) {
    const boot = new THREE.Mesh(bootGeo, gear);
    boot.position.set(x, 0.07, 0.02);
    avatar.add(boot);
  }

  // Legs: hip pivots so each leg swings from the hip joint.
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.32, 2, 6);
  for (const [name, x] of [['hipL', -0.09], ['hipR', 0.09]]) {
    const hip = new THREE.Group();
    hip.name = name;
    hip.position.set(x, 0.52, 0);
    const leg = new THREE.Mesh(legGeo, gear);
    leg.position.y = -0.21;
    hip.add(leg);
    avatar.add(hip);
  }

  // Torso: cozy sweater capsule.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.22, 2, 8), sweater);
  torso.position.y = 0.68;
  torso.scale.set(1, 1, 0.85);
  avatar.add(torso);

  // Arms: shoulder pivots with a slight outward rest angle, mitten nubs.
  const armGeo = new THREE.CapsuleGeometry(0.05, 0.26, 2, 6);
  const mittGeo = new THREE.SphereGeometry(0.06, 6, 5);
  for (const [name, x, rest] of [['shoulderL', -0.175, -0.12], ['shoulderR', 0.175, 0.12]]) {
    const shoulder = new THREE.Group();
    shoulder.name = name;
    shoulder.position.set(x, 0.82, 0);
    shoulder.rotation.z = rest;
    const arm = new THREE.Mesh(armGeo, gear);
    arm.position.y = -0.17;
    shoulder.add(arm);
    const mitt = new THREE.Mesh(mittGeo, gear);
    mitt.position.y = -0.36;
    shoulder.add(mitt);
    avatar.add(shoulder);
  }

  // Scarf: golden ring at the neck.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.045, 6, 14), scarf);
  ring.position.y = 0.9;
  ring.rotation.x = Math.PI / 2;
  avatar.add(ring);

  // Head: neck pivot; big sphere, face on +z.
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0.88, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
  head.position.y = 0.2;
  neck.add(head);

  // Eyes: big glossy ovals with sparkle dots.
  const eyeGeo = new THREE.SphereGeometry(0.035, 6, 4);
  const dotGeo = new THREE.SphereGeometry(0.012, 4, 3);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(0.072 * s, 0.23, 0.175);
    eye.scale.set(1, 1.3, 0.5);
    neck.add(eye);
    const dot = new THREE.Mesh(dotGeo, spark);
    dot.position.set(0.06 * s, 0.245, 0.19);
    neck.add(dot);
  }

  // Smile: open arc; blush: soft pink cheeks.
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.013, 4, 8, 2.0), dark);
  smile.position.set(0, 0.13, 0.183);
  smile.rotation.z = -Math.PI / 2 - 1.0;
  neck.add(smile);
  const cheekGeo = new THREE.CircleGeometry(0.028, 10);
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, blush);
    cheek.position.set(0.118 * s, 0.16, 0.162);
    cheek.rotation.y = 0.5 * s;
    neck.add(cheek);
  }
  avatar.add(neck);

  return avatar;
}
