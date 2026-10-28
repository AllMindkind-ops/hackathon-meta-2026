import * as THREE from 'three';
import { createScene } from './scene.js';
import { createAvatar } from './avatar.js';
import { createCamera } from './camera.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

const { scene, summit } = createScene();

const avatar = createAvatar();
avatar.position.copy(summit.userData.playerStart);
scene.add(avatar);

const camera = createCamera(avatar);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  renderer.render(scene, camera);
});
