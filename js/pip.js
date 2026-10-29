// =========================================================
// pip.js — Pip, el robotito protagonista.
//
// Pip está hecho solo con formas redondas (esferas, cápsulas,
// toroides). Su cara es una pantalla LED: la dibujamos en un
// <canvas> y la "pegamos" en el visor como luz (emissiveMap),
// así los ojos brillan con el bloom y pueden cambiar de forma.
//
// Animación estilo Pixar:
//   • squash & stretch con un resorte (el cuerpo se aplasta y
//     estira como gelatina y luego se acomoda solo)
//   • anticipación antes de saltar (se agacha primero)
//   • follow-through: la antena y los brazos llegan "tarde"
// =========================================================
import * as THREE from 'three';
import { animar, esperar, suavizar, acercar, mezclar, crearLienzo, rectanguloRedondo } from './utilidades.js';
import { alturaSuelo } from './escena.js';

const CIAN = '#5ff4ff';
const ALTURA_FLOTE = .55;       // cuánto flota Pip sobre el pasto

export class Pip {
  constructor({ audio, ui }) {
    this.audio = audio;
    this.ui = ui;

    // raiz = dónde está Pip en el mundo; cuerpo = deformaciones y giros
    this.raiz = new THREE.Group();
    this.raiz.name = 'Pip';
    this.cuerpo = new THREE.Group();
    this.raiz.add(this.cuerpo);

    // ----- Estado de la animación -----
    this.tiempo = 0;
    this.emocion = 'normal';       // normal, feliz, sorprendido, triste, mareado
    this.hablando = false;
    this.saltoY = 0;               // altura extra durante un salto
    this.estiramiento = 1;         // 1 = normal, <1 aplastado, >1 estirado
    this.velEstiramiento = 0;
    this.estiramientoMeta = 1;
    this.giroExtra = 0;            // vueltas de celebración
    this.inclinacion = 0;          // se inclina hacia adelante al volar
    this.rumbo = 0;                // hacia dónde mira (ángulo)
    this.rumboMeta = 0;
    this.mirada = new THREE.Vector2();      // hacia dónde miran los ojos
    this.miradaMeta = new THREE.Vector2();
    this.saludoHasta = 0;
    this.mareo = 0;
    this.parpadeo = 0;
    this.proximoParpadeo = 2;
    this.antena = { angulo: 0, velocidad: 0 };
    this.ultimaAltura = 0;
    this.potenciaPropulsor = 1;
    this.claveCara = '';

    this.construir();
  }

  // ---------------------------------------------------------
  // MODELO 3D
  // ---------------------------------------------------------
  construir() {
    // Plástico de juguete brillante: MeshPhysicalMaterial con "clearcoat"
    // (una capa de barniz encima que da ese reflejo de juguete nuevo)
    const blanco = new THREE.MeshPhysicalMaterial({ color: '#f7f8fc', roughness: .3, clearcoat: 1, clearcoatRoughness: .06 });
    const naranja = new THREE.MeshPhysicalMaterial({ color: '#ff8a2b', roughness: .32, clearcoat: 1, clearcoatRoughness: .1 });
    const metal = new THREE.MeshStandardMaterial({ color: '#c9ced8', roughness: .3, metalness: .7 });

    // --- Propulsor (Pip flota gracias a él) ---
    const propulsor = new THREE.Mesh(new THREE.CylinderGeometry(.2, .27, .22, 24), metal);
    propulsor.position.y = .2;
    const aroPropulsor = new THREE.Mesh(new THREE.TorusGeometry(.25, .04, 10, 28), naranja);
    aroPropulsor.rotation.x = Math.PI / 2;
    aroPropulsor.position.y = .14;
    this.cuerpo.add(propulsor, aroPropulsor);

    // Fuego: dos conos de colores "súper brillantes" (el bloom los hace resplandecer)
    this.fuego = new THREE.Group();
    this.fuego.position.y = .08;
    const fuegoExterior = new THREE.Mesh(new THREE.ConeGeometry(.17, .55, 20, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(3, 1.3, .35), transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    fuegoExterior.rotation.x = Math.PI;
    fuegoExterior.position.y = -.27;
    const fuegoInterior = new THREE.Mesh(new THREE.ConeGeometry(.09, .32, 16, 1, true), new THREE.MeshBasicMaterial({
      color: new THREE.Color(3.5, 3, 1.8), transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    fuegoInterior.rotation.x = Math.PI;
    fuegoInterior.position.y = -.16;
    this.fuego.add(fuegoExterior, fuegoInterior);
    this.fuego.traverse(o => { o.userData.sinSombra = true; });
    this.luzPropulsor = new THREE.PointLight('#ff9a40', 3, 3.5, 2);
    this.luzPropulsor.position.y = -.15;
    this.cuerpo.add(this.fuego, this.luzPropulsor);

    // --- Cuerpo redondo ---
    const torso = new THREE.Mesh(new THREE.SphereGeometry(.5, 48, 32), blanco);
    torso.position.y = .74;
    const cinturon = new THREE.Mesh(new THREE.TorusGeometry(.488, .045, 12, 48), naranja);
    cinturon.rotation.x = Math.PI / 2;
    cinturon.position.y = .62;
    this.cuerpo.add(torso, cinturon);

    // --- 3 luces del pecho: azul (oído), verde (vista), amarilla (búsqueda) ---
    this.lucesPecho = [];
    const coloresLuces = ['#3fa9ff', '#4fdc5a', '#ffd84d'];
    coloresLuces.forEach((color, i) => {
      const x = (i - 1) * .17;
      const y = .1;
      const z = Math.sqrt(.25 - x * x - y * y);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.085, .085, .04, 24), naranja);
      const foco = new THREE.Mesh(new THREE.SphereGeometry(.062, 20, 14), new THREE.MeshStandardMaterial({
        color: '#2d3340', roughness: .2, emissive: color, emissiveIntensity: 0
      }));
      foco.position.y = .03;
      const soporte = new THREE.Group();
      soporte.add(base, foco);
      soporte.position.set(x, .74 + y, z - .01);
      // Orientamos la lucecita "hacia afuera" de la esfera del cuerpo
      const haciaAfuera = new THREE.Vector3(x, y, z).normalize();
      soporte.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), haciaAfuera);
      this.cuerpo.add(soporte);
      this.lucesPecho.push(foco);
    });

    // --- Cuello ---
    const cuello = new THREE.Mesh(new THREE.TorusGeometry(.25, .065, 12, 32), naranja);
    cuello.rotation.x = Math.PI / 2;
    cuello.position.y = 1.18;
    this.cuerpo.add(cuello);

    // --- Cabeza GRANDE (proporción de bebé = ternura) ---
    this.cabeza = new THREE.Group();
    this.cabeza.position.y = 1.64;
    const craneo = new THREE.Mesh(new THREE.SphereGeometry(.62, 48, 32), blanco);
    craneo.scale.set(1.1, .94, 1);
    this.cabeza.add(craneo);

    // Visor oscuro con la cara LED (un pedazo de esfera al frente)
    this.lienzoCara = crearLienzo(512, 300);
    this.texturaCara = new THREE.CanvasTexture(this.lienzoCara.lienzo);
    this.texturaCara.colorSpace = THREE.SRGBColorSpace;
    this.texturaCara.anisotropy = 4;
    const visor = new THREE.Mesh(
      new THREE.SphereGeometry(.632, 48, 24, Math.PI / 2 - 1.08, 2.16, Math.PI / 2 - .56, 1.18),
      new THREE.MeshPhysicalMaterial({
        color: '#0c111e', roughness: .12, metalness: .2, clearcoat: 1, clearcoatRoughness: .04,
        emissive: '#ffffff', emissiveMap: this.texturaCara, emissiveIntensity: 2.3
      })
    );
    visor.userData.sinSombra = true;
    craneo.add(visor);

    // Orejitas naranjas
    for (const lado of [-1, 1]) {
      const oreja = new THREE.Mesh(new THREE.CylinderGeometry(.17, .17, .13, 28), naranja);
      oreja.rotation.z = Math.PI / 2;
      oreja.position.x = lado * .67;
      const centro = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, .16, 20), blanco);
      centro.rotation.z = Math.PI / 2;
      centro.position.x = lado * .7;
      this.cabeza.add(oreja, centro);
    }

    // Antena con lucecita que palpita (con resorte: rebota al moverse)
    this.pivoteAntena = new THREE.Group();
    this.pivoteAntena.position.y = .56;
    const palito = new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, .36, 10), metal);
    palito.position.y = .18;
    this.bolitaAntena = new THREE.Mesh(new THREE.SphereGeometry(.085, 20, 14), new THREE.MeshStandardMaterial({
      color: '#ffb36b', emissive: '#ff8a2b', emissiveIntensity: 2
    }));
    this.bolitaAntena.position.y = .4;
    this.pivoteAntena.add(palito, this.bolitaAntena);
    this.cabeza.add(this.pivoteAntena);
    this.cuerpo.add(this.cabeza);

    // --- Bracitos (pivote en el hombro) ---
    this.brazos = [];
    for (const lado of [-1, 1]) {
      const hombro = new THREE.Group();
      hombro.position.set(lado * .47, .86, 0);
      const brazo = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .26, 6, 14), blanco);
      brazo.position.y = -.2;
      const mano = new THREE.Mesh(new THREE.SphereGeometry(.11, 20, 14), naranja);
      mano.position.y = -.42;
      hombro.add(brazo, mano);
      this.cuerpo.add(hombro);
      // apertura = qué tan abierto está el brazo (0 = pegado al cuerpo)
      this.brazos.push({ lado, hombro, apertura: .3, velocidad: 0, meta: .3 });
    }

    // --- Estrellitas que giran sobre la cabeza cuando se marea ---
    this.estrellasMareo = new THREE.Group();
    this.estrellasMareo.position.y = 2.35;
    for (let i = 0; i < 3; i++) {
      const estrella = new THREE.Mesh(new THREE.OctahedronGeometry(.09), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.6, .6) }));
      estrella.userData.sinSombra = true;
      this.estrellasMareo.add(estrella);
    }
    this.estrellasMareo.visible = false;
    this.cuerpo.add(this.estrellasMareo);

    // Zona invisible y grande para que sea fácil tocar a Pip
    this.zonaToque = new THREE.Mesh(new THREE.SphereGeometry(1.15, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.zonaToque.position.y = 1.2;
    this.zonaToque.userData.sinSombra = true;
    this.raiz.add(this.zonaToque);

    this.dibujarCara(true);
  }

  // ---------------------------------------------------------
  // CARA LED (se dibuja en 2D y se usa como textura brillante)
  // ---------------------------------------------------------
  dibujarCara(forzar = false) {
    const parpadeando = this.parpadeo > 0 && !['feliz', 'mareado'].includes(this.emocion);
    const bocaAbierta = this.hablando && Math.sin(this.tiempo * 17) + Math.sin(this.tiempo * 7.3) > 0;
    const pasoMareo = this.emocion === 'mareado' ? Math.floor(this.tiempo * 12) : 0;
    const clave = [this.emocion, parpadeando, bocaAbierta, this.mirada.x.toFixed(1), this.mirada.y.toFixed(1), pasoMareo].join('|');
    if (clave === this.claveCara && !forzar) return;
    this.claveCara = clave;

    const { ctx } = this.lienzoCara;
    const W = 512, H = 300;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    // Mejillas sonrojadas
    for (const x of [112, 400]) {
      const rubor = ctx.createRadialGradient(x, 205, 0, x, 205, 46);
      rubor.addColorStop(0, 'rgba(255,110,170,.75)');
      rubor.addColorStop(1, 'rgba(255,110,170,0)');
      ctx.fillStyle = rubor;
      ctx.fillRect(x - 50, 155, 100, 100);
    }

    const mx = this.mirada.x * 22, my = this.mirada.y * 14;
    const ojos = [[180 + mx, 130 + my], [332 + mx, 130 + my]];
    ctx.fillStyle = CIAN;
    ctx.strokeStyle = CIAN;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const brillito = (x, y, r) => {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = CIAN;
    };

    ojos.forEach(([x, y], i) => {
      if (parpadeando) {
        rectanguloRedondo(ctx, x - 40, y - 7, 80, 14, 7);
        ctx.fill();
        return;
      }
      switch (this.emocion) {
        case 'feliz':       // ojitos en forma de "^"
          ctx.lineWidth = 22;
          ctx.beginPath();
          ctx.arc(x, y + 30, 40, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
          break;
        case 'sorprendido': // ojos redondos enormes
          ctx.beginPath(); ctx.arc(x, y, 52, 0, Math.PI * 2); ctx.fill();
          brillito(x - 18, y - 20, 15);
          brillito(x + 16, y + 18, 7);
          break;
        case 'triste':      // ojos con párpado caído y una lagrimita
          rectanguloRedondo(ctx, x - 34, y - 40, 68, 92, 34);
          ctx.fill();
          ctx.save();
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          const lado = i === 0 ? -1 : 1;
          ctx.moveTo(x - 60, y - 60);
          ctx.lineTo(x + 60, y - 60);
          ctx.lineTo(x + 60, y + (lado > 0 ? -2 : -30));
          ctx.lineTo(x - 60, y + (lado > 0 ? -30 : -2));
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          if (i === 0) {
            ctx.fillStyle = '#9fe6ff';
            ctx.beginPath();
            ctx.moveTo(x - 30, y + 62);
            ctx.quadraticCurveTo(x - 44, y + 86, x - 30, y + 92);
            ctx.quadraticCurveTo(x - 16, y + 86, x - 30, y + 62);
            ctx.fill();
            ctx.fillStyle = CIAN;
          }
          break;
        case 'mareado': {   // espirales que giran
          ctx.lineWidth = 9;
          ctx.beginPath();
          const giro = this.tiempo * 8 * (i === 0 ? 1 : -1);
          for (let a = 0; a < Math.PI * 6; a += .2) {
            const r = 4 + a * 2.6;
            const px = x + Math.cos(a + giro) * r, py = y + Math.sin(a + giro) * r;
            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
          break;
        }
        default:            // ojos grandes ovalados con brillo
          rectanguloRedondo(ctx, x - 36, y - 52, 72, 104, 36);
          ctx.fill();
          brillito(x - 12 + mx * .2, y - 26, 14);
          brillito(x + 12, y + 20, 6);
      }
    });

    // Boca
    ctx.fillStyle = CIAN;
    ctx.strokeStyle = CIAN;
    ctx.lineWidth = 12;
    const bx = 256 + mx * .6, by = 226 + my * .4;
    if (bocaAbierta) {
      ctx.beginPath(); ctx.ellipse(bx, by, 26, 20, 0, 0, Math.PI * 2); ctx.fill();
    } else if (this.emocion === 'feliz') {
      ctx.beginPath(); ctx.arc(bx, by - 10, 34, .05 * Math.PI, .95 * Math.PI); ctx.closePath(); ctx.fill();
    } else if (this.emocion === 'sorprendido') {
      ctx.beginPath(); ctx.ellipse(bx, by, 16, 20, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (this.emocion === 'triste') {
      ctx.beginPath(); ctx.arc(bx, by + 26, 26, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke();
    } else if (this.emocion === 'mareado') {
      ctx.beginPath();
      for (let x = -36; x <= 36; x += 4) ctx.lineTo(bx + x, by + Math.sin(x * .25 + this.tiempo * 10) * 7);
      ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(bx, by - 12, 26, .18 * Math.PI, .82 * Math.PI); ctx.stroke();
    }

    this.texturaCara.needsUpdate = true;
  }

  // ---------------------------------------------------------
  // ACCIONES (devuelven promesas para poder encadenarlas con await)
  // ---------------------------------------------------------
  fijarEmocion(emocion) { this.emocion = emocion; }

  colocar(posicion) {
    this.raiz.position.set(posicion.x, alturaSuelo(posicion.x, posicion.z), posicion.z);
  }

  // Gira para mirar a un punto (por ejemplo, la cámara)
  mirarHacia(punto) {
    this.rumboMeta = Math.atan2(punto.x - this.raiz.position.x, punto.z - this.raiz.position.z);
  }

  // Empujoncito al resorte del cuerpo (positivo estira, negativo aplasta)
  golpe(fuerza) { this.velEstiramiento += fuerza; }

  // Pip habla: globo de texto + voz + boquita moviéndose
  async decir(texto, emocion = null) {
    if (emocion) this.fijarEmocion(emocion);
    this.ui.mostrarGlobo(texto);
    this.audio.efecto('bip');
    this.hablando = true;
    this.golpe(2);
    await this.audio.hablar(texto);
    this.hablando = false;
  }

  saludar(segundos = 2.4) { this.saludoHasta = this.tiempo + segundos; }

  // Salto en el mismo lugar con anticipación, estirón y aplastón
  async saltar(altura = 1) {
    this.estiramientoMeta = .7;                 // 1) anticipación: se agacha
    await esperar(.15);
    this.estiramientoMeta = 1;
    this.golpe(7);                              // 2) se estira al despegar
    this.audio.efecto('salto');
    const duracion = .35 + altura * .22;
    await animar(duracion, t => { this.saltoY = altura * 4 * t * (1 - t); }, { curva: suavizar.lineal });
    this.saltoY = 0;
    this.golpe(-6);                             // 3) se aplasta al caer
  }

  // Salta de un lugar a otro (por ejemplo, al salir del cohete)
  async saltarHacia(destino, altura = 2, duracion = .9) {
    this.estiramientoMeta = .7;
    await esperar(.12);
    this.estiramientoMeta = 1;
    this.golpe(7);
    this.audio.efecto('salto');
    const desde = this.raiz.position.clone();
    const yFinal = alturaSuelo(destino.x, destino.z);
    this.mirarHacia(destino);
    await animar(duracion, t => {
      this.raiz.position.x = mezclar(desde.x, destino.x, t);
      this.raiz.position.z = mezclar(desde.z, destino.z, t);
      this.raiz.position.y = mezclar(desde.y, yFinal, t) + altura * 4 * t * (1 - t);
    }, { curva: suavizar.lineal });
    this.golpe(-7);
    this.audio.efecto('rebote');
  }

  async girar(vueltas = 1, duracion = .7) {
    const desde = this.giroExtra;
    await animar(duracion, t => { this.giroExtra = desde + t * Math.PI * 2 * vueltas; }, { curva: suavizar.entradaSalida });
    this.giroExtra = 0;
  }

  // ¡Festejo! salto + giro + otro saltito
  async celebrar() {
    this.fijarEmocion('feliz');
    this.audio.efecto('alegria');
    this.brazos.forEach(b => { b.meta = 2.5; });
    await Promise.all([this.saltar(1.3), esperar(.2).then(() => this.girar(1, .6))]);
    await this.saltar(.5);
    this.brazos.forEach(b => { b.meta = .3; });
  }

  // Se marea de forma graciosa (cuando el niño se equivoca: nunca es un castigo)
  async marearse(segundos = 1.8) {
    this.fijarEmocion('mareado');
    this.audio.efecto('mareo');
    this.mareo = 1;
    await esperar(segundos);
    await animar(.4, t => { this.mareo = 1 - t; });
    this.mareo = 0;
    this.fijarEmocion('normal');
  }

  // Dice "no" con la cabeza
  async negar() {
    await animar(.8, t => { this.cabeza.rotation.y = Math.sin(t * Math.PI * 4) * .35 * (1 - t); }, { curva: suavizar.lineal });
    this.cabeza.rotation.y = 0;
  }

  // Vuela a otro lugar en arco, inclinándose hacia adelante
  async volarA(destino, duracion = 2.2) {
    const desde = this.raiz.position.clone();
    const distancia = Math.hypot(destino.x - desde.x, destino.z - desde.z);
    const yFinal = alturaSuelo(destino.x, destino.z);
    this.mirarHacia(destino);
    this.estiramientoMeta = .85;                 // anticipación
    await esperar(.15);
    this.estiramientoMeta = 1;
    this.golpe(5);
    this.potenciaPropulsor = 2.2;
    this.audio.efecto('vuelo');
    await animar(duracion, t => {
      this.raiz.position.x = mezclar(desde.x, destino.x, t);
      this.raiz.position.z = mezclar(desde.z, destino.z, t);
      this.raiz.position.y = mezclar(desde.y, yFinal, t) + Math.sin(t * Math.PI) * Math.min(3, 1 + distancia * .15);
      this.inclinacion = Math.sin(t * Math.PI) * .38;
    }, { curva: suavizar.entradaSalida });
    this.inclinacion = 0;
    this.potenciaPropulsor = 1;
    this.golpe(-4);
  }

  // Enciende una de las 3 luces del pecho (0 azul, 1 verde, 2 amarilla)
  async encenderLuz(indice) {
    const foco = this.lucesPecho[indice];
    this.audio.efecto('luz');
    this.golpe(6);
    await animar(1.2, t => { foco.material.emissiveIntensity = t * 3.5; }, { curva: suavizar.elastico });
  }

  apagarLuces() {
    for (const foco of this.lucesPecho) foco.material.emissiveIntensity = 0;
  }

  // Vuelve a la pose normal (por si se canceló una animación a medias)
  reiniciarPose() {
    this.saltoY = 0;
    this.giroExtra = 0;
    this.inclinacion = 0;
    this.mareo = 0;
    this.estiramiento = 1;
    this.velEstiramiento = 0;
    this.estiramientoMeta = 1;
    this.potenciaPropulsor = 1;
    this.hablando = false;
    this.cabeza.rotation.set(0, 0, 0);
    this.brazos.forEach(b => { b.meta = .3; });
    this.fijarEmocion('normal');
  }

  // ---------------------------------------------------------
  // CADA CUADRO
  // ---------------------------------------------------------
  actualizar(dt, t) {
    this.tiempo = t;

    // Parpadeo natural cada 2 a 5 segundos
    this.proximoParpadeo -= dt;
    if (this.proximoParpadeo <= 0) {
      this.parpadeo = .13;
      this.proximoParpadeo = 2 + Math.random() * 3.5;
    }
    this.parpadeo = Math.max(0, this.parpadeo - dt);

    // Los ojos miran a su alrededor de vez en cuando
    if (Math.random() < dt * .4) this.miradaMeta.set((Math.random() - .5) * 1.4, (Math.random() - .5) * .8);
    this.mirada.x = acercar(this.mirada.x, this.miradaMeta.x, 8, dt);
    this.mirada.y = acercar(this.mirada.y, this.miradaMeta.y, 8, dt);

    // Resorte de squash & stretch (como gelatina)
    const fuerza = -170 * (this.estiramiento - this.estiramientoMeta) - 9 * this.velEstiramiento;
    this.velEstiramiento += fuerza * dt;
    this.estiramiento += this.velEstiramiento * dt;
    const s = Math.min(1.45, Math.max(.6, this.estiramiento));
    const ancho = 1 / Math.sqrt(s);           // conserva el "volumen"
    this.cuerpo.scale.set(ancho, s, ancho);

    // Flotar suavemente arriba y abajo + salto
    const flote = Math.sin(t * 2.2) * .08;
    this.cuerpo.position.y = ALTURA_FLOTE + flote + this.saltoY;

    // Girar el cuerpo hacia el rumbo (por el camino más corto)
    let diferencia = this.rumboMeta - this.rumbo;
    diferencia = Math.atan2(Math.sin(diferencia), Math.cos(diferencia));
    this.rumbo += diferencia * (1 - Math.exp(-6 * dt));
    this.raiz.rotation.y = this.rumbo;
    this.cuerpo.rotation.y = this.giroExtra;

    // Mareo: se tambalea en círculos
    const tambaleo = this.mareo;
    this.cuerpo.rotation.x = this.inclinacion + Math.cos(t * 9) * .16 * tambaleo;
    this.cuerpo.rotation.z = Math.sin(t * 9) * .22 * tambaleo + Math.sin(t * 1.3) * .03;
    this.estrellasMareo.visible = tambaleo > .05;
    if (this.estrellasMareo.visible) {
      this.estrellasMareo.children.forEach((estrella, i) => {
        const a = t * 5 + i * Math.PI * 2 / 3;
        estrella.position.set(Math.cos(a) * .55, Math.sin(a * 2) * .06, Math.sin(a) * .55);
        estrella.rotation.y = t * 6;
      });
    }

    // La cabeza acompaña la mirada (y se inclina un poquito: ternura)
    this.cabeza.rotation.z = Math.sin(t * .9) * .05 + this.mirada.x * -.06;
    this.cabeza.rotation.x = -this.mirada.y * .08;

    // Brazos: resorte hacia su meta; saludo = brazo derecho arriba moviéndose
    const saludando = this.tiempo < this.saludoHasta;
    this.brazos.forEach(brazo => {
      let meta = brazo.meta;
      if (saludando && brazo.lado === 1) meta = 2.5 + Math.sin(t * 12) * .45;
      if (this.hablando && brazo.lado === -1) meta = .5 + Math.sin(t * 5) * .2;
      meta += Math.sin(t * 2.2 + brazo.lado) * .05;
      // Follow-through: al subir o bajar Pip, los brazos llegan con retraso
      const empuje = (this.cuerpo.position.y - this.ultimaAltura) * 40;
      const fuerzaBrazo = -90 * (brazo.apertura - meta) - 10 * brazo.velocidad + empuje;
      brazo.velocidad += fuerzaBrazo * dt;
      brazo.apertura += brazo.velocidad * dt;
      brazo.hombro.rotation.z = brazo.lado * brazo.apertura;
    });

    // Antena con resorte: rebota cuando Pip sube o baja
    const subida = (this.cuerpo.position.y - this.ultimaAltura) / Math.max(dt, .001);
    this.ultimaAltura = this.cuerpo.position.y;
    const fuerzaAntena = -120 * this.antena.angulo - 6 * this.antena.velocidad - subida * 3;
    this.antena.velocidad += fuerzaAntena * dt;
    this.antena.angulo += this.antena.velocidad * dt;
    this.pivoteAntena.rotation.x = Math.max(-.6, Math.min(.6, this.antena.angulo));
    this.pivoteAntena.rotation.z = Math.sin(t * 1.7) * .06;
    this.bolitaAntena.material.emissiveIntensity = 1.6 + Math.sin(t * 4) * 1.2;

    // Fuego del propulsor que titila
    const fuegoTam = this.potenciaPropulsor * (1 + Math.sin(t * 43) * .12 + Math.sin(t * 27) * .1);
    this.fuego.scale.set(1, fuegoTam, 1);
    this.luzPropulsor.intensity = 2.5 * this.potenciaPropulsor + Math.sin(t * 31) * .4;

    this.dibujarCara();
  }
}
