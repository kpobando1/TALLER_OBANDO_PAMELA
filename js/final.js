// =========================================================
// final.js — FASE 5: ¡el gran final!
//
// Amanece, los 6 animales del corral llegan saltando y rodean a
// Pip, todos bailan, hay fuegos artificiales y confeti, y Pip
// agradece: "¡Gracias! Ahora puedo ver y escuchar como tú".
// Luego aparecen los créditos y el botón "Jugar otra vez".
// =========================================================
import * as THREE from 'three';
import { PLAZA, alturaSuelo } from './escena.js';
import { animar, esperar, suavizar } from './utilidades.js';

const COLORES_FUEGOS = ['#ff5a5f', '#ffd84d', '#4fc8f0', '#5fd068', '#ff7eb6', '#b98cff', '#ff8a3d'];

export class Final {
  constructor({ escena, pip, audio, ui, efectos, corral }) {
    this.escena = escena;
    this.pip = pip;
    this.audio = audio;
    this.ui = ui;
    this.efectos = efectos;
    this.corral = corral;
    this.activo = false;
    this.sesion = 0;
  }

  async reproducir() {
    const miSesion = ++this.sesion;
    this.activo = true;
    const vigente = () => this.activo && this.sesion === miSesion;
    const { escena, pip } = this;

    // 1) Amanece
    escena.cambiarMomento(1, 5);
    escena.moverCamara(new THREE.Vector3(0, 6, 15.5), new THREE.Vector3(0, 1.3, 2.4), 3.2, { arco: 2 });
    await pip.volarA(PLAZA, 2.4);
    if (!vigente()) return;
    pip.mirarHacia(escena.camera.position);
    await pip.decir('¡Está amaneciendo! Mira, ¡vienen nuestros amigos!', 'sorprendido');
    if (!vigente()) return;

    // 2) Los animales llegan saltando y rodean a Pip en semicírculo
    //    (detrás y a los lados, para que Pip se vea siempre al frente)
    const animales = this.corral.lista();
    const llegadas = animales.map((animal, i) => {
      const angulo = (-110 + i * 44) * Math.PI / 180;
      const x = PLAZA.x + Math.sin(angulo) * 3.4;
      const z = PLAZA.z - Math.cos(angulo) * 3.2;
      return esperar(i * .25).then(() => this.saltarHasta(animal, new THREE.Vector3(x, alturaSuelo(x, z), z)));
    });
    await Promise.all(llegadas);
    if (!vigente()) return;
    animales.forEach(a => a.mirarHacia(escena.camera.position));

    // 3) ¡Fiesta! Todos bailan, fuegos artificiales y confeti
    animales.forEach(a => a.bailar(999));
    this.lanzarFuegos(vigente);
    this.efectos.lluviaConfeti(PLAZA, 6, 220);
    this.audio.efecto('aplausos');
    pip.mirarHacia(escena.camera.position);
    await pip.celebrar();
    if (!vigente()) return;
    for (const a of animales) { this.audio.efecto(a.tipo); await esperar(.35); }
    if (!vigente()) return;
    // Las 3 luces del pecho parpadean de alegría
    this.parpadearLuces(vigente);
    await pip.decir('¡Gracias! Ahora puedo ver y escuchar como tú.', 'feliz');
    if (!vigente()) return;
    pip.saludar(4);
    await pip.decir('¡Eres el mejor amigo de la granja mágica!', 'feliz');
    if (!vigente()) return;
    await pip.celebrar();
    if (!vigente()) return;
    this.ui.ocultarGlobo();
    await esperar(4);                 // un ratito para disfrutar la fiesta
    if (!vigente()) return;

    // 4) Créditos
    this.orbitando = true;
    this.anguloOrbita = 0;
    this.ui.ocultarGlobo();
    this.ui.mostrarCreditos();
  }

  // Un salto en arco de un lugar a otro (con anticipación y aplastón)
  async saltarHasta(animal, destino) {
    animal.estiramientoMeta = .72;
    await esperar(.12);
    animal.estiramientoMeta = 1;
    animal.golpe(6);
    this.audio.efecto('salto');
    const desde = animal.raiz.position.clone();
    animal.mirarHacia(destino);
    await animar(1.1, t => {
      animal.raiz.position.lerpVectors(desde, destino, t);
      animal.raiz.position.y += Math.sin(t * Math.PI) * 2.5;
    }, { curva: suavizar.entradaSalida });
    animal.golpe(-6);
  }

  async lanzarFuegos(vigente) {
    let i = 0;
    while (vigente()) {
      const posicion = new THREE.Vector3((Math.random() - .5) * 18, 9 + Math.random() * 6, -4 + (Math.random() - .5) * 10);
      this.efectos.fuegoArtificial(posicion, COLORES_FUEGOS[i % COLORES_FUEGOS.length]);
      this.audio.efecto('fuego');
      i++;
      await esperar(.5 + Math.random() * .6);
    }
  }

  async parpadearLuces(vigente) {
    const luces = this.pip.lucesPecho;
    while (vigente()) {
      for (let i = 0; i < luces.length && vigente(); i++) {
        luces.forEach((luz, j) => { luz.material.emissiveIntensity = j === i ? 6 : 2.5; });
        await esperar(.25);
      }
    }
    luces.forEach(luz => { luz.material.emissiveIntensity = 3.5; });
  }

  detener() {
    this.activo = false;
    this.sesion++;
    this.orbitando = false;
    this.ui.ocultarCreditos();
    // Los animales vuelven a su corral
    for (const animal of this.corral.lista()) animal.bailarHasta = 0;
    this.corral.ubicarAnimales();
  }

  actualizar(dt) {
    if (!this.orbitando) return;
    // Durante los créditos la cámara gira despacito alrededor de la fiesta
    this.anguloOrbita += dt * .12;
    const radio = 15;
    this.escena.camBase.pos.set(PLAZA.x + Math.sin(this.anguloOrbita) * radio, 7, PLAZA.z + Math.cos(this.anguloOrbita) * radio);
    this.escena.camBase.mira.set(PLAZA.x, 1.3, PLAZA.z);
  }
}
