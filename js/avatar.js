import * as THREE from 'three';

// FROZEN CONTRACT: keep createAvatar() -> THREE.Group with origin at the feet.
// app.js places it at summit.userData.playerStart. The Avatar set may replace the
// body, but keep the origin, rough human scale, and export name.
// Gender-neutral low-poly placeholder humanoid (~2 m tall). Articulated named
// pivots (head, torso, armL, armR, legL, legR) for a later ragdoll stage;
// no physics or steering wiring here.
export function createAvatar() {
  const avatar = new THREE.Group();
  avatar.name = 'placeholder-avatar';

  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a17e, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x5b7d8a, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.6 });

  // Legs: pivots at the hips so each leg swings from the hip joint.
  const legGeo = new THREE.CapsuleGeometry(0.1, 0.7, 4, 10);
  for (const [name, x] of [['legL', -0.14], ['legR', 0.14]]) {
    const leg = new THREE.Group();
    leg.name = name;
    leg.position.set(x, 0.95, 0);
    const mesh = new THREE.Mesh(legGeo, cloth);
    mesh.position.y = -0.45;
    leg.add(mesh);
    avatar.add(leg);
  }

  // Torso: pivot at the hips so the upper body bends from the waist.
  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.set(0, 0.95, 0);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 4, 12), cloth);
  chest.position.y = 0.32;
  chest.scale.set(1, 1, 0.72);
  torso.add(chest);
  avatar.add(torso);

  // Arms: pivots at the shoulders so each arm swings from the shoulder joint.
  const armGeo = new THREE.CapsuleGeometry(0.08, 0.52, 4, 10);
  for (const [name, x] of [['armL', -0.36], ['armR', 0.36]]) {
    const arm = new THREE.Group();
    arm.name = name;
    arm.position.set(x, 0.56, 0);
    const mesh = new THREE.Mesh(armGeo, skin);
    mesh.position.y = -0.3;
    arm.add(mesh);
    torso.add(arm);
  }

  // Head: pivot at the neck so the head turns/nods from the neck joint.
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.7, 0);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 12), skin);
  skull.position.y = 0.18;
  skull.scale.set(1, 1.08, 0.96);
  head.add(skull);

  // Warm relaxed resting face: soft eyes and a small calm smile.
  const eyeGeo = new THREE.SphereGeometry(0.028, 8, 8);
  for (const x of [-0.075, 0.075]) {
    const eye = new THREE.Mesh(eyeGeo, dark);
    eye.position.set(x, 0.21, 0.175);
    head.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), dark);
  smile.position.set(0, 0.1, 0.185);
  smile.rotation.z = Math.PI;
  head.add(smile);
  torso.add(head);

  return avatar;
}
