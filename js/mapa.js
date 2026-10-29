// =========================================================
// mapa.js — los 3 carteles flotantes del mapa de la isla.
//
// Las zonas se desbloquean en orden: corral → huerto → granero.
// El cartel de la zona que toca ahora rebota y tiene una flecha.
// Cada cartel tiene una zona de toque invisible y GRANDE
// (para que los dedos pequeños acierten fácilmente).
// =========================================================
import * as THREE from 'three';
import { ZONAS } from './escena.js';
import { animar, suavizar, crearLienzo, rectanguloRedondo } from './utilidades.js';

// Carteles grandes: los niños pequeños necesitan ver y tocar fácil
const ESCALA_CARTEL = 1.55;

export class Mapa {
  /**
   * @param {object} opciones
   * @param {Escena} opciones.escena
   * @param {(indice:number)=>void} opciones.alTocarZona
   */
  constructor({ escena, alTocarZona }) {
    this.escena = escena;
    this.alTocarZona = alTocarZona;
    this.completadas = 0;
    this.visible = false;
    this.carteles = ZONAS.map((zona, indice) => this.crearCartel(zona, indice));
    this.actualizarEstados(0);
  }

  crearCartel(zona, indice) {
    const grupo = new THREE.Group();
    const alturaCartel = zona.id === 'granero' ? 8 : 4.8;
    grupo.position.set(zona.posicion.x, alturaCartel, zona.posicion.z);

    // Interior que rebota (el grupo de afuera mira a la cámara)
    const interior = new THREE.Group();
    grupo.add(interior);

    // Tablita de madera con bordes redondeados
    const forma = new THREE.Shape();
    rectanguloRedondoForma(forma, -1.6, -.8, 3.2, 1.6, .35);
    const tabla = new THREE.Mesh(
      new THREE.ExtrudeGeometry(forma, { depth: .18, bevelEnabled: true, bevelThickness: .06, bevelSize: .06, bevelSegments: 4 }),
      new THREE.MeshStandardMaterial({ color: '#c98b4a', roughness: .7 })
    );
    tabla.position.z = -.12;
    interior.add(tabla);

    // Cara del cartel: un dibujo en canvas (emoji + nombre)
    // Dibujamos al doble de tamaño (1024×512) para que el texto se vea nítido
    const { lienzo, ctx } = crearLienzo(1024, 512);
    ctx.scale(2, 2);
    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    textura.anisotropy = 4;
    const cara = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshBasicMaterial({ map: textura }));
    cara.position.z = .14;
    interior.add(cara);

    // Cuerditas y globito que "sostiene" el cartel en el aire
    const matCuerda = new THREE.MeshStandardMaterial({ color: '#fff3dc' });
    for (const lado of [-1, 1]) {
      const cuerda = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.3, 6), matCuerda);
      cuerda.position.set(lado * .7, 1.35, 0);
      cuerda.rotation.z = lado * .5;
      interior.add(cuerda);
    }
    const globo = new THREE.Mesh(new THREE.SphereGeometry(.55, 24, 18), new THREE.MeshPhysicalMaterial({ color: zona.colorLuz, roughness: .25, clearcoat: 1 }));
    globo.scale.y = 1.15;
    globo.position.y = 2.25;
    interior.add(globo);

    // Flecha brillante que señala la zona que toca jugar
    const flecha = new THREE.Mesh(new THREE.ConeGeometry(.35, .6, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.4, .5) }));
    flecha.rotation.x = Math.PI;
    flecha.position.y = -1.5;
    flecha.userData.sinSombra = true;
    interior.add(flecha);

    // Zona de toque invisible y generosa (cartel + la zona en el suelo)
    const toque = new THREE.Mesh(new THREE.SphereGeometry(2.4, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    toque.userData.sinSombra = true;
    grupo.add(toque);
    // (el grupo se agranda con ESCALA_CARTEL, por eso dividimos)
    const toqueSuelo = new THREE.Mesh(new THREE.CylinderGeometry(4 / ESCALA_CARTEL, 4 / ESCALA_CARTEL, alturaCartel / ESCALA_CARTEL, 12), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    toqueSuelo.position.y = -alturaCartel / ESCALA_CARTEL / 2;
    toqueSuelo.userData.sinSombra = true;
    grupo.add(toqueSuelo);
    grupo.userData.alTocar = () => {
      if (this.visible) this.alTocarZona(indice);
    };

    grupo.visible = false;
    grupo.scale.setScalar(.001);
    this.escena.scene.add(grupo);
    this.escena.activarSombras(interior);
    return { zona, grupo, interior, ctx, textura, flecha, fase: indice * 1.7, estado: '' };
  }

  // Dibuja la cara del cartel según su estado: bloqueado, siguiente o completado
  dibujarCartel(cartel, estado) {
    const { ctx, zona } = cartel;
    ctx.clearRect(0, 0, 512, 256);
    rectanguloRedondo(ctx, 8, 8, 496, 240, 50);
    ctx.fillStyle = '#fff3d6';
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#e0a868';
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '150px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
    ctx.fillText(zona.emoji, 112, 138);
    ctx.fillStyle = '#4a2c14';
    ctx.font = '900 88px "Comic Sans MS", "Trebuchet MS", sans-serif';
    ctx.fillText(zona.nombre, 340, 132, 300);

    if (estado === 'bloqueado') {
      rectanguloRedondo(ctx, 8, 8, 496, 240, 50);
      ctx.fillStyle = 'rgba(70, 70, 95, .55)';
      ctx.fill();
      ctx.font = '96px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText('🔒', 440, 70);
    } else if (estado === 'completado') {
      ctx.font = '84px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif';
      ctx.fillText('⭐', 450, 62);
    }
    cartel.textura.needsUpdate = true;
  }

  // completadas = cuántas zonas ya terminó el niño (0 a 3)
  actualizarEstados(completadas) {
    this.completadas = completadas;
    this.carteles.forEach((cartel, i) => {
      const estado = i < completadas ? 'completado' : i === completadas ? 'siguiente' : 'bloqueado';
      if (estado !== cartel.estado) {
        cartel.estado = estado;
        this.dibujarCartel(cartel, estado);
      }
      cartel.flecha.visible = estado === 'siguiente';
    });
  }

  estaBloqueada(indice) { return indice > this.completadas; }

  // Los carteles aparecen con un "pop" elástico, uno tras otro
  mostrar() {
    this.visible = true;
    this.carteles.forEach((cartel, i) => {
      cartel.grupo.visible = true;
      this.escena.registrarTocable(cartel.grupo);
      animar(.7, t => cartel.grupo.scale.setScalar(Math.max(.001, t * ESCALA_CARTEL)), { curva: suavizar.rebotito, retraso: .15 + i * .15 });
    });
  }

  ocultar() {
    this.visible = false;
    this.carteles.forEach(cartel => {
      this.escena.quitarTocable(cartel.grupo);
      const desde = Math.max(cartel.grupo.scale.x, .001);
      animar(.3, t => cartel.grupo.scale.setScalar(Math.max(.001, desde * (1 - t))), { curva: suavizar.entrada })
        .then(() => { if (!this.visible) cartel.grupo.visible = false; });
    });
  }

  actualizar(dt, t) {
    const camara = this.escena.camera.position;
    for (const cartel of this.carteles) {
      if (!cartel.grupo.visible) continue;
      // Siempre de frente a la cámara (solo gira en horizontal)
      cartel.grupo.lookAt(camara.x, cartel.grupo.position.y, camara.z);
      // Flota suavemente; el siguiente rebota con más ganas
      const siguiente = cartel.estado === 'siguiente';
      cartel.interior.position.y = Math.sin(t * 1.6 + cartel.fase) * .18 + (siguiente ? Math.abs(Math.sin(t * 3)) * .3 : 0);
      cartel.interior.rotation.z = Math.sin(t * 1.1 + cartel.fase) * .05;
      cartel.flecha.position.y = -1.5 - Math.abs(Math.sin(t * 4)) * .3;
    }
  }
}

// Rectángulo redondeado para una THREE.Shape (la tablita del cartel)
function rectanguloRedondoForma(forma, x, y, w, h, r) {
  forma.moveTo(x + r, y);
  forma.lineTo(x + w - r, y);
  forma.quadraticCurveTo(x + w, y, x + w, y + r);
  forma.lineTo(x + w, y + h - r);
  forma.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  forma.lineTo(x + r, y + h);
  forma.quadraticCurveTo(x, y + h, x, y + h - r);
  forma.lineTo(x, y + r);
  forma.quadraticCurveTo(x, y, x + r, y);
}
