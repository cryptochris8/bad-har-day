// Template dev page: a lit toon sphere. Copy to dev/<module>.ts.
import * as THREE from 'three';
import { createHarness } from './harness';

const h = createHarness({ ground: true, camera: { pos: [0, 1.4, 3], look: [0, 0.7, 0] } });
const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), new THREE.MeshToonMaterial({ color: 0xff7a6b }));
ball.position.y = 0.6;
h.scene.add(ball);
h.onUpdate((_dt, t) => (ball.rotation.y = t));
h.start();
