// =========================================================
// efectos.js — confeti, chispas mágicas y fuegos artificiales.
//
// Para que vaya rápido usamos "piscinas" (pools): creamos todas
// las partículas una sola vez y las reutilizamos.
//   • confeti  → InstancedMesh (cientos de papelitos en 1 dibujo)
//   • chispas  → Points con colores "brillantes" (el bloom las hace resplandecer)
// =========================================================
import * as THREE from 'three';
import { texturaPunto } from './escena.js';

const MAX_CONFETI = 500;
const MAX_CHISPAS = 900;
const COLORES_CONFETI = ['#ff5a5f', '#ffd84d', '#4fc8f0', '#5fd068', '#ff7eb6', '#b98cff', '#ff8a3d'].map(c => new THREE.Color(c));

export class Efectos {
  constructor(escena) {
    this.escena = escena;

    // ---------- Confeti ----------
    const geoPapel = new THREE.PlaneGeometry(.16, .1);
    this.confeti = new THREE.InstancedMesh(geoPapel, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), MAX_CONFETI);
    this.confeti.frustumCulled = false;
    this.confeti.userData.sinSombra = true;
    this.papeles = [];
    const oculto = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_CONFETI; i++) {
      this.papeles.push({ vivo: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Euler(), giro: new THREE.Vector3(), vida: 0 });
      this.confeti.setMatrixAt(i, oculto);
      this.confeti.setColorAt(i, COLORES_CONFETI[i % COLORES_CONFETI.length]);
    }
    this.indiceConfeti = 0;
    escena.scene.add(this.confeti);

    // ---------- Chispas ----------
    this.posChispas = new Float32Array(MAX_CHISPAS * 3).fill(-999);
    this.colChispas = new Float32Array(MAX_CHISPAS * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posChispas, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colChispas, 3));
    this.puntos = new THREE.Points(geo, new THREE.PointsMaterial({
      size: .35, map: texturaPunto(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    this.puntos.frustumCulled = false;
    escena.scene.add(this.puntos);
    this.chispas = [];
    for (let i = 0; i < MAX_CHISPAS; i++) {
      this.chispas.push({ vivo: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(), vida: 0, duracion: 1, gravedad: 0 });
    }
    this.indiceChispa = 0;

    this.matriz = new THREE.Matrix4();
    this.cuaternion = new THREE.Quaternion();
    this.escala = new THREE.Vector3(1, 1, 1);
  }

  // Explosión de confeti desde un punto
  confetiEn(posicion, cantidad = 70, fuerza = 4.5) {
    for (let i = 0; i < cantidad; i++) {
      const p = this.papeles[this.indiceConfeti];
      this.indiceConfeti = (this.indiceConfeti + 1) % MAX_CONFETI;
      p.vivo = true;
      p.vida = 0;
      p.pos.copy(posicion);
      const a = Math.random() * Math.PI * 2;
      const f = fuerza * (.4 + Math.random() * .6);
      p.vel.set(Math.cos(a) * f * .6, f * (.8 + Math.random() * .6), Math.sin(a) * f * .6);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.giro.set((Math.random() - .5) * 12, (Math.random() - .5) * 12, (Math.random() - .5) * 12);
    }
  }

  // Lluvia de confeti que cae del cielo sobre una zona
  lluviaConfeti(centro, radio = 6, cantidad = 120) {
    for (let i = 0; i < cantidad; i++) {
      const p = this.papeles[this.indiceConfeti];
      this.indiceConfeti = (this.indiceConfeti + 1) % MAX_CONFETI;
      p.vivo = true;
      p.vida = -Math.random() * 1.5;          // algunos empiezan un poquito después
      p.pos.set(centro.x + (Math.random() - .5) * radio * 2, centro.y + 7 + Math.random() * 4, centro.z + (Math.random() - .5) * radio * 2);
      p.vel.set((Math.random() - .5) * .6, -1, (Math.random() - .5) * .6);
      p.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      p.giro.set((Math.random() - .5) * 10, (Math.random() - .5) * 10, (Math.random() - .5) * 10);
    }
  }

  // Chispas mágicas (por ejemplo, al acertar)
  chispasEn(posicion, color = '#ffe27a', cantidad = 40, fuerza = 3, gravedad = -1.5, duracion = 1.2) {
    const base = new THREE.Color(color);
    for (let i = 0; i < cantidad; i++) {
      const c = this.chispas[this.indiceChispa];
      this.indiceChispa = (this.indiceChispa + 1) % MAX_CHISPAS;
      c.vivo = true;
      c.vida = 0;
      c.duracion = duracion * (.6 + Math.random() * .6);
      c.gravedad = gravedad;
      c.pos.copy(posicion);
      // Dirección al azar en una esfera
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const f = fuerza * (.5 + Math.random() * .5);
      c.vel.set(r * Math.cos(a) * f, u * f, r * Math.sin(a) * f);
      // Color "más brillante que el blanco" para que tenga resplandor
      c.color.copy(base).multiplyScalar(2.2 + Math.random());
    }
  }

  // Fuego artificial: una bola de chispas en el cielo
  fuegoArtificial(posicion, color) {
    this.chispasEn(posicion, color, 110, 6, -2.5, 1.8);
    this.chispasEn(posicion, '#ffffff', 25, 2.5, -2, 1);
  }

  actualizar(dt) {
    // --- Confeti: cae girando y con un vaivén, como papel de verdad ---
    let hayConfeti = false;
    for (let i = 0; i < MAX_CONFETI; i++) {
      const p = this.papeles[i];
      if (!p.vivo) continue;
      p.vida += dt;
      if (p.vida < 0) continue;
      hayConfeti = true;
      p.vel.y -= 6 * dt;
      p.vel.multiplyScalar(Math.exp(-2.4 * dt));           // resistencia del aire
      p.vel.x += Math.sin(p.vida * 5 + i) * dt * 1.5;      // vaivén
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.giro.x * dt; p.rot.y += p.giro.y * dt; p.rot.z += p.giro.z * dt;
      if (p.vida > 6 || p.pos.y < -2) {
        p.vivo = false;
        this.confeti.setMatrixAt(i, this.matriz.makeScale(0, 0, 0));
        continue;
      }
      this.cuaternion.setFromEuler(p.rot);
      this.matriz.compose(p.pos, this.cuaternion, this.escala);
      this.confeti.setMatrixAt(i, this.matriz);
    }
    if (hayConfeti || this.habiaConfeti) this.confeti.instanceMatrix.needsUpdate = true;
    this.habiaConfeti = hayConfeti;

    // --- Chispas: vuelan, caen y se apagan ---
    let hayChispas = false;
    for (let i = 0; i < MAX_CHISPAS; i++) {
      const c = this.chispas[i];
      if (!c.vivo) continue;
      hayChispas = true;
      c.vida += dt;
      const t = c.vida / c.duracion;
      if (t >= 1) {
        c.vivo = false;
        this.posChispas[i * 3 + 1] = -999;
        continue;
      }
      c.vel.y += c.gravedad * dt;
      c.vel.multiplyScalar(Math.exp(-1.6 * dt));
      c.pos.addScaledVector(c.vel, dt);
      this.posChispas.set([c.pos.x, c.pos.y, c.pos.z], i * 3);
      // Se apaga poco a poco (con titileo)
      const brillo = (1 - t) * (.75 + Math.random() * .25);
      this.colChispas.set([c.color.r * brillo, c.color.g * brillo, c.color.b * brillo], i * 3);
    }
    if (hayChispas || this.habiaChispas) {
      this.puntos.geometry.attributes.position.needsUpdate = true;
      this.puntos.geometry.attributes.color.needsUpdate = true;
    }
    this.habiaChispas = hayChispas;
  }
}
