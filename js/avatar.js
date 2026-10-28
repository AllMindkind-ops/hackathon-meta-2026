import * as THREE from 'three';

// Simple placeholder humanoid. Temporary: replaced by the Avatar set later.
export function createAvatar() {
  const avatar = new THREE.Group();
  avatar.name = 'placeholder-avatar';

  const skin = new THREE.MeshStandardMaterial({ color: 0xb08968 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x3a6ea5 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 6, 12), cloth);
  torso.position.y = 1.25;
  avatar.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), skin);
  head.position.y = 2.05;
  avatar.add(head);

  const limbGeo = new THREE.CapsuleGeometry(0.09, 0.55, 4, 8);
  for (const x of [-0.18, 0.18]) {
    const leg = new THREE.Mesh(limbGeo, cloth);
    leg.position.set(x, 0.55, 0);
    avatar.add(leg);
  }
  for (const x of [-0.42, 0.42]) {
    const arm = new THREE.Mesh(limbGeo, skin);
    arm.position.set(x, 1.3, 0);
    avatar.add(arm);
  }

  return avatar;
}
