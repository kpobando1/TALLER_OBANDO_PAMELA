// =========================================================
// intro.js — la escena de apertura (como el inicio de una película):
//
//   1. Amanece sobre la granja y la cámara baja desde el cielo.
//   2. Un cohetito llega volando, da una voltereta y aterriza.
//   3. La punta del cohete sale disparada (¡pop!) y Pip salta afuera.
//   4. Pip mira a su alrededor, rebota y saluda al niño.
// =========================================================
import * as THREE from 'three';
import { animar, esperar, suavizar, cancelarAnimaciones } from './utilidades.js';
import { PLAZA, alturaSuelo } from './escena.js';

// Dónde aterriza el cohete (la escena deja ese lugar libre de pasto y flores)
// (detrás del granero, a la izquierda: así no estorba en ninguna zona)
export const LUGAR_COHETE = new THREE.Vector3(-4.6, 0, -10.6);
// Dónde cae la punta del cohete después de salir volando
const LUGAR_PUNTA = new THREE.Vector3(-6.6, 0, -9.2);
const ESCALA_COHETE = 1.35;

export class Intro {
  constructor({ escena, pip, audio, ui }) {
    this.escena = escena;
    this.pip = pip;
    this.audio = audio;
    this.ui = ui;
    this.cancelada = false;
    this.humo = [];
    this.crearCohete();
    this.crearHumo();
  }

  // ---------------------------------------------------------
  // EL COHETE (hecho con un perfil que gira: LatheGeometry)
  // ---------------------------------------------------------
  crearCohete() {
    const blanco = new THREE.MeshPhysicalMaterial({ color: '#f6f6f8', roughness: .3, clearcoat: 1, clearcoatRoughness: .08 });
    const rojo = new THREE.MeshPhysicalMaterial({ color: '#ff4f45', roughness: .3, clearcoat: 1, clearcoatRoughness: .1 });
    const naranja = new THREE.MeshPhysicalMaterial({ color: '#ff8a2b', roughness: .35, clearcoat: 1 });
    const metal = new THREE.MeshStandardMaterial({ color: '#aab3c2', metalness: .7, roughness: .3 });

    this.cohete = new THREE.Group();
    this.cohete.scale.setScalar(ESCALA_COHETE);

    // Cuerpo: dibujamos la mitad del contorno y LatheGeometry lo hace girar
    const perfilCuerpo = [[0, 0], [.5, .02], [.72, .35], [.84, .95], [.82, 1.6], [.7, 2.2], [0, 2.2]].map(([x, y]) => new THREE.Vector2(x, y));
    const cuerpo = new THREE.Mesh(new THREE.LatheGeometry(perfilCuerpo, 40), blanco);
    this.cohete.add(cuerpo);

    // Punta roja (separada, porque sale volando cuando Pip sale)
    const perfilPunta = [[0, 0], [.72, 0], [.7, .06], [.5, .5], [.22, .85], [0, .95]].map(([x, y]) => new THREE.Vector2(x, y));
    this.punta = new THREE.Mesh(new THREE.LatheGeometry(perfilPunta, 40), rojo);
    this.punta.position.y = 2.2;
    this.cohete.add(this.punta);

    // Franja roja y ventanita redonda
    const franja = new THREE.Mesh(new THREE.TorusGeometry(.85, .06, 10, 40), rojo);
    franja.rotation.x = Math.PI / 2;
    franja.position.y = .95;
    const marco = new THREE.Mesh(new THREE.TorusGeometry(.24, .06, 12, 30), naranja);
    marco.position.set(0, 1.5, .8);
    marco.rotation.x = -.06;
    const vidrio = new THREE.Mesh(new THREE.CircleGeometry(.22, 30), new THREE.MeshStandardMaterial({ color: '#2a6f9a', emissive: '#5ff4ff', emissiveIntensity: .8, roughness: .1 }));
    vidrio.position.set(0, 1.5, .81);
    this.cohete.add(franja, marco, vidrio);

    // 3 aletas
    const formaAleta = new THREE.Shape();
    formaAleta.moveTo(0, 0);
    formaAleta.lineTo(.55, -.35);
    formaAleta.quadraticCurveTo(.62, .3, .05, 1);
    formaAleta.lineTo(0, 1);
    const geoAleta = new THREE.ExtrudeGeometry(formaAleta, { depth: .08, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 3 });
    geoAleta.translate(0, 0, -.04);
    for (let i = 0; i < 3; i++) {
      const aleta = new THREE.Mesh(geoAleta, rojo);
      const angulo = i * Math.PI * 2 / 3 + Math.PI / 6;
      aleta.position.set(Math.sin(angulo) * .68, .15, Math.cos(angulo) * .68);
      aleta.rotation.y = angulo - Math.PI / 2;
      this.cohete.add(aleta);
    }

    // Tobera
    const tobera = new THREE.Mesh(new THREE.CylinderGeometry(.34, .48, .32, 24, 1, true), metal);
    tobera.position.y = -.12;
    this.cohete.add(tobera);

    // Fuego del cohete (brillante para el bloom)
    this.fuego = new THREE.Group();
    this.fuego.position.y = -.28;
    const exterior = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.6, 24, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.2, 1.2, .3), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    exterior.rotation.x = Math.PI;
    exterior.position.y = -.8;
    const interior = new THREE.Mesh(new THREE.ConeGeometry(.22, .9, 20, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(4, 3.4, 2), transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    interior.rotation.x = Math.PI;
    interior.position.y = -.45;
    this.fuego.add(exterior, interior);
    this.luzFuego = new THREE.PointLight('#ff8a3d', 0, 12, 2);
    this.luzFuego.position.y = -.8;
    this.cohete.add(this.fuego, this.luzFuego);
    this.fuego.traverse(o => { o.userData.sinSombra = true; });

    this.escena.scene.add(this.cohete);
    this.escena.activarSombras(this.cohete);
    this.colocarCoheteAterrizado();
  }

  colocarCoheteAterrizado() {
    this.cohete.position.set(LUGAR_COHETE.x, alturaSuelo(LUGAR_COHETE.x, LUGAR_COHETE.z) + .05, LUGAR_COHETE.z);
    this.cohete.quaternion.identity();
    this.cohete.rotation.y = -.5;
    this.cohete.scale.setScalar(ESCALA_COHETE);
    this.fuego.visible = false;
    this.luzFuego.intensity = 0;
  }

  // ---------------------------------------------------------
  // HUMO: bolitas que crecen, suben y se desvanecen
  // ---------------------------------------------------------
  crearHumo() {
    const geometria = new THREE.SphereGeometry(.5, 14, 10);
    for (let i = 0; i < 60; i++) {
      const bolita = new THREE.Mesh(geometria, new THREE.MeshStandardMaterial({ color: '#f4efe8', roughness: 1, transparent: true, opacity: 0, depthWrite: false }));
      bolita.visible = false;
      bolita.userData = { vida: 0, duracion: 1, velocidad: new THREE.Vector3(), tamano: 1, sinSombra: true };
      this.escena.scene.add(bolita);
      this.humo.push(bolita);
    }
    this.indiceHumo = 0;
  }

  soltarHumo(posicion, velocidad, tamano = 1, duracion = 1.4) {
    const bolita = this.humo[this.indiceHumo];
    this.indiceHumo = (this.indiceHumo + 1) % this.humo.length;
    bolita.position.copy(posicion);
    bolita.userData.velocidad.copy(velocidad);
    bolita.userData.vida = 0;
    bolita.userData.duracion = duracion;
    bolita.userData.tamano = tamano;
    bolita.visible = true;
  }

  // ---------------------------------------------------------
  // LA SECUENCIA (cada "await" espera a que termine un paso)
  // ---------------------------------------------------------
  async reproducir() {
    const { escena, pip, audio } = this;
    this.cancelada = false;
    const cancelada = () => this.cancelada;

    // Amanecer
    escena.fijarMomento(.3);
    escena.cambiarMomento(1, 12);
    pip.raiz.visible = false;
    pip.reiniciarPose();
    this.cohete.add(this.punta);
    this.punta.position.set(0, 2.2, 0);
    this.punta.rotation.set(0, 0, 0);
    this.punta.scale.setScalar(1);

    // El cohete empieza escondido lejos, en el cielo
    const destino = new THREE.Vector3(LUGAR_COHETE.x, alturaSuelo(LUGAR_COHETE.x, LUGAR_COHETE.z) + .05, LUGAR_COHETE.z);
    const curva = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-40, 42, -45),
      new THREE.Vector3(destino.x, 24, destino.z - 2),
      destino
    );
    this.cohete.position.copy(curva.getPoint(0));

    // 1) La cámara baja desde el cielo
    escena.balanceo = .4;
    escena.colocarCamara(new THREE.Vector3(-6, 70, 48), new THREE.Vector3(0, 6, -10));
    escena.moverCamara(new THREE.Vector3(3, 8.5, 15), new THREE.Vector3(-2.5, 2.2, -6), 7, { curva: suavizar.entradaSalida });

    // 2) El cohete llega volando por una curva (curva de Bézier)
    await esperar(1.2);
    if (cancelada()) return;
    this.fuego.visible = true;
    audio.iniciarCohete();
    const arriba = new THREE.Vector3(0, 1, 0);
    const derecho = new THREE.Quaternion().setFromAxisAngle(arriba, -.5);
    const orientacion = new THREE.Quaternion();
    let ultimoHumo = 0;
    await animar(5.4, t => {
      this.cohete.position.copy(curva.getPoint(t));
      // Al principio la nariz apunta hacia donde vuela…
      const tangente = curva.getTangent(Math.min(t, .99));
      orientacion.setFromUnitVectors(arriba, tangente);
      // …y a mitad de camino da una voltereta para aterrizar parado
      const voltereta = suavizar.entradaSalida(Math.min(1, Math.max(0, (t - .35) / .4)));
      this.cohete.quaternion.copy(orientacion).slerp(derecho, voltereta);
      // Más fuego al frenar
      const frenado = Math.max(0, (t - .6) / .4);
      this.fuego.scale.setScalar(.8 + frenado * .6 + Math.sin(t * 200) * .1);
      this.luzFuego.intensity = 6 + frenado * 10;
      audio.potenciaCohete(.4 + frenado * .6);
      // Estela de humo
      if (t - ultimoHumo > .012) {
        ultimoHumo = t;
        const cola = new THREE.Vector3(0, -1.2, 0).applyQuaternion(this.cohete.quaternion).multiplyScalar(ESCALA_COHETE).add(this.cohete.position);
        this.soltarHumo(cola, new THREE.Vector3((Math.random() - .5) * .6, .3, (Math.random() - .5) * .6), .7 + frenado * .8, 1.6);
      }
    }, { curva: suavizar.salida });
    if (cancelada()) return;

    // 3) ¡Aterrizaje! Sacudida, humo hacia los lados y aplastón del cohete
    audio.detenerCohete();
    audio.efecto('aterrizaje');
    escena.temblor = .45;
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2;
      this.soltarHumo(destino.clone().add(new THREE.Vector3(0, .3, 0)), new THREE.Vector3(Math.cos(a) * 4, .4 + Math.random() * .5, Math.sin(a) * 4), 1.1 + Math.random() * .6, 1.8);
    }
    this.fuego.visible = false;
    animar(.5, t => { this.luzFuego.intensity = 16 * (1 - t); });
    await animar(.7, t => {
      const s = 1 - Math.sin(t * Math.PI) * .22 * (1 - t);   // se aplasta y vuelve
      this.cohete.scale.set(ESCALA_COHETE / Math.sqrt(s), ESCALA_COHETE * s, ESCALA_COHETE / Math.sqrt(s));
    }, { curva: suavizar.salida });
    if (cancelada()) return;

    // La cámara se acerca al cohete
    escena.moverCamara(
      new THREE.Vector3(LUGAR_COHETE.x + 2.6, 4.4, LUGAR_COHETE.z + 12),
      new THREE.Vector3(LUGAR_COHETE.x, 2.2, LUGAR_COHETE.z), 2.2);
    await esperar(.8);
    if (cancelada()) return;

    // 4) Anticipación: el cohete tiembla… ¡y la punta sale disparada!
    await animar(.7, t => { this.cohete.rotation.z = Math.sin(t * 60) * .04 * t; }, { curva: suavizar.lineal });
    this.cohete.rotation.z = 0;
    if (cancelada()) return;
    audio.efecto('corcho');
    this.lanzarPunta();

    // Pip aparece dentro del cohete y salta hacia la plaza
    const salida = new THREE.Vector3(0, 2.4 * ESCALA_COHETE, 0).add(this.cohete.position);
    pip.raiz.position.copy(salida).add(new THREE.Vector3(0, -.9, 0));
    pip.raiz.visible = true;
    pip.fijarEmocion('sorprendido');
    pip.estiramiento = .6;
    // La cámara acompaña el gran salto hasta la plaza
    escena.moverCamara(new THREE.Vector3(PLAZA.x + 3, 5.5, PLAZA.z + 11), new THREE.Vector3(PLAZA.x, 1.5, PLAZA.z - 2), 1.8);
    await pip.saltarHacia(new THREE.Vector3(PLAZA.x + .6, 0, PLAZA.z - .3), 4.2, 1.7);
    if (cancelada()) return;
    // Rebotitos al caer (squash & stretch)
    await pip.saltar(.6);
    if (cancelada()) return;
    await pip.saltar(.25);
    if (cancelada()) return;

    // 5) Mira a su alrededor con curiosidad
    pip.mirarHacia(new THREE.Vector3(-8, 0, 0));
    await esperar(.7);
    if (cancelada()) return;
    pip.mirarHacia(new THREE.Vector3(8, 0, 0));
    await esperar(.7);
    if (cancelada()) return;

    // 6) Primer plano: Pip mira a la cámara y saluda
    const planoPip = new THREE.Vector3(PLAZA.x + 1, 2.7, PLAZA.z + 6.8);
    escena.moverCamara(planoPip, new THREE.Vector3(PLAZA.x + .6, 1.5, PLAZA.z - .3), 1.8);
    pip.mirarHacia(planoPip);
    pip.fijarEmocion('feliz');
    await pip.saltar(.4);
    if (cancelada()) return;
    pip.saludar(3.5);
    await pip.decir('¡Hola! Soy Pip. ¿Me ayudas a descubrir la granja?');
    if (cancelada()) return;
    await esperar(.5);
  }

  // La punta del cohete vuela, gira y cae en el pasto
  lanzarPunta() {
    const inicio = new THREE.Vector3();
    this.punta.getWorldPosition(inicio);
    this.escena.scene.attach(this.punta);       // la soltamos del cohete
    const final = LUGAR_PUNTA.clone();
    final.y = alturaSuelo(final.x, final.z) + .02;
    animar(1.3, t => {
      this.punta.position.x = inicio.x + (final.x - inicio.x) * t;
      this.punta.position.z = inicio.z + (final.z - inicio.z) * t;
      this.punta.position.y = inicio.y + (final.y - inicio.y) * t + Math.sin(t * Math.PI) * 4;
      this.punta.rotation.z = -t * Math.PI * 2.6;
      this.punta.rotation.x = t * 1.2;
    }, { curva: suavizar.lineal }).then(() => this.dejarPuntaEnElSuelo(final));
  }

  dejarPuntaEnElSuelo(final) {
    this.escena.scene.attach(this.punta);
    this.punta.position.copy(final);
    this.punta.rotation.set(1.2, 0, -Math.PI / 2 - .25);
    this.punta.scale.setScalar(ESCALA_COHETE);
  }

  // ---------------------------------------------------------
  // SALTAR LA INTRO: todo queda como si hubiera terminado
  // ---------------------------------------------------------
  saltar() {
    this.cancelada = true;
    cancelarAnimaciones();
    this.audio.detenerCohete();
    this.audio.callar();
    this.ui.ocultarGlobo();
    this.escena.fijarMomento(1);
    this.escena.temblor = 0;
    this.colocarCoheteAterrizado();
    const final = LUGAR_PUNTA.clone();
    final.y = alturaSuelo(final.x, final.z) + .02;
    this.dejarPuntaEnElSuelo(final);
    for (const bolita of this.humo) bolita.visible = false;
    this.pip.reiniciarPose();
    this.pip.raiz.visible = true;
    this.pip.colocar(new THREE.Vector3(PLAZA.x + .6, 0, PLAZA.z - .3));
  }

  // ---------------------------------------------------------
  actualizar(dt) {
    for (const bolita of this.humo) {
      if (!bolita.visible) continue;
      const datos = bolita.userData;
      datos.vida += dt;
      const t = datos.vida / datos.duracion;
      if (t >= 1) { bolita.visible = false; continue; }
      bolita.position.addScaledVector(datos.velocidad, dt);
      datos.velocidad.multiplyScalar(Math.exp(-2.2 * dt));     // frena con el aire
      datos.velocidad.y += dt * .6;                            // el humo sube
      bolita.scale.setScalar(datos.tamano * (.4 + t * 1.4));
      bolita.material.opacity = .85 * (1 - t) * Math.min(1, t * 8);
    }
    // El fuego del cohete titila
    if (this.fuego.visible) this.fuego.children[0].scale.y = 1 + Math.sin(performance.now() * .05) * .15;
  }
}
