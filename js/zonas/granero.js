// =========================================================
// zonas/granero.js — FASE 4: el granero de noche (BÚSQUEDA)
//
// Se hace de noche, Pip enciende su linterna (sigue al dedo o
// al mouse). Un animal escondido detrás de una de 4 pacas hace
// su sonido EN ESTÉREO (se escucha más del lado donde está).
// El niño toca la paca: la paca salta a un lado y el animal
// aparece bailando. 3 rondas → LUZ AMARILLA.
// =========================================================
import * as THREE from 'three';
import { ZonaBase } from './base.js';
import { ZONAS, alturaSuelo } from '../escena.js';
import { Animal, TIPOS_ANIMALES } from '../animales.js';
import { animar, esperar, suavizar, crearLienzo } from '../utilidades.js';
import { mayuscula } from './corral.js';

const X_PACAS = [-3.3, -1.1, 1.1, 3.3];
const RADIO_PACA = .9;

const mezclarLista = lista => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

export class Granero extends ZonaBase {
  constructor(contexto) {
    super(contexto);
    this.zona = ZONAS[2];
    this.grupo.visible = true;
    const c = this.zona.posicion;
    this.zPacas = c.z + 4.6;

    // --- 4 pacas de heno redondas ---
    const texturaHeno = texturaEspiral();
    const matLado = new THREE.MeshStandardMaterial({ color: '#f0c95a', roughness: 1 });
    const matTapa = new THREE.MeshStandardMaterial({ map: texturaHeno, roughness: 1 });
    this.pacas = X_PACAS.map((x, i) => {
      const paca = new THREE.Group();
      const rollo = new THREE.Mesh(new THREE.CylinderGeometry(RADIO_PACA, RADIO_PACA, 1.1, 32), [matLado, matTapa, matTapa]);
      rollo.rotation.x = Math.PI / 2;       // la espiral mira a la cámara
      rollo.position.y = RADIO_PACA;
      paca.add(rollo);
      // Cuerdas
      for (const z of [-.3, .3]) {
        const cuerda = new THREE.Mesh(new THREE.TorusGeometry(RADIO_PACA + .01, .025, 6, 40), new THREE.MeshStandardMaterial({ color: '#b5713a' }));
        cuerda.position.set(0, RADIO_PACA, z);
        paca.add(cuerda);
      }
      // Pajitas sueltas arriba
      for (let k = 0; k < 6; k++) {
        const pajita = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .35, 4), matLado);
        pajita.position.set((k - 2.5) * .12, RADIO_PACA * 2 - .02, (k % 2 - .5) * .3);
        pajita.rotation.z = (k - 2.5) * .3;
        paca.add(pajita);
      }
      const toque = new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
      toque.position.y = 1.1;
      toque.userData.sinSombra = true;
      paca.add(toque);
      const z = this.zPacas;
      const base = new THREE.Vector3(c.x + x, alturaSuelo(c.x + x, z), z);
      paca.position.copy(base);
      this.grupo.add(paca);
      return { grupo: paca, rollo, base, indice: i, sacudida: 0 };
    });

    // --- Animales escondidos (invisibles hasta que se descubren) ---
    this.escondidos = {};
    for (const tipo of TIPOS_ANIMALES) {
      const animal = new Animal(tipo);
      animal.escalaExtra = 1.35;          // más grandes para que se vean bien al aparecer
      animal.raiz.scale.setScalar(animal.escalaFinal);
      animal.raiz.visible = false;
      this.escondidos[tipo] = animal;
      this.grupo.add(animal.raiz);
    }

    this.crearLinterna();
    this.grupo.traverse(o => { if (o.isMesh && !o.userData.sinSombra) { o.castShadow = true; o.receiveShadow = true; } });
    this.modo = 'nada';
  }

  // ---------------------------------------------------------
  // LINTERNA: una luz focal + un cono de luz "volumétrico"
  // ---------------------------------------------------------
  crearLinterna() {
    this.foco = new THREE.SpotLight('#fff1c8', 0, 22, .42, .55, 1.1);
    this.foco.castShadow = false;
    this.escena.scene.add(this.foco, this.foco.target);

    // El haz: un cono abierto con un degradado que se desvanece a lo largo
    const { lienzo, ctx } = crearLienzo(4, 128);
    const degradado = ctx.createLinearGradient(0, 0, 0, 128);
    degradado.addColorStop(0, 'rgba(255,255,255,.0)');
    degradado.addColorStop(.2, 'rgba(255,255,255,.35)');
    degradado.addColorStop(1, 'rgba(255,255,255,1)');
    ctx.fillStyle = degradado;
    ctx.fillRect(0, 0, 4, 128);
    const geometria = new THREE.ConeGeometry(1, 1, 32, 1, true);
    geometria.translate(0, -.5, 0);           // la punta queda en el origen
    this.haz = new THREE.Mesh(geometria, new THREE.MeshBasicMaterial({
      color: new THREE.Color(1, .92, .65), alphaMap: new THREE.CanvasTexture(lienzo), transparent: true, opacity: .22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    }));
    this.haz.userData.sinSombra = true;
    this.haz.visible = false;
    this.escena.scene.add(this.haz);

    // Círculo de luz en el suelo (donde apunta la linterna)
    this.manchaLuz = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), new THREE.MeshBasicMaterial({
      color: new THREE.Color(.5, .45, .3), transparent: true, opacity: .5, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    this.manchaLuz.rotation.x = -Math.PI / 2;
    this.manchaLuz.userData.sinSombra = true;
    this.manchaLuz.visible = false;
    this.escena.scene.add(this.manchaLuz);

    this.puntoLinterna = new THREE.Vector3(this.zona.posicion.x, 1, this.zPacas);
    this.metaLinterna = this.puntoLinterna.clone();
    this.potenciaLinterna = 0;
  }

  async encenderLinterna(encendida) {
    this.audio.efecto('linterna');
    const desde = this.potenciaLinterna;
    const hasta = encendida ? 1 : 0;
    if (encendida) { this.haz.visible = true; this.manchaLuz.visible = true; }
    await animar(.5, t => { this.potenciaLinterna = desde + (hasta - desde) * t; }, { curva: suavizar.salida });
    if (!encendida) { this.haz.visible = false; this.manchaLuz.visible = false; }
  }

  // El niño mueve el dedo o el mouse: la linterna lo sigue
  alMoverPuntero(x, y) {
    if (this.potenciaLinterna <= 0) return;
    const raton = new THREE.Vector2((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(raton, this.escena.camera);
    const plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1);   // plano a la altura de las pacas
    const punto = new THREE.Vector3();
    if (rayo.ray.intersectPlane(plano, punto)) {
      const c = this.zona.posicion;
      punto.x = THREE.MathUtils.clamp(punto.x, c.x - 6, c.x + 6);
      punto.z = THREE.MathUtils.clamp(punto.z, c.z + 2, c.z + 10);
      this.metaLinterna.copy(punto);
    }
  }

  // ---------------------------------------------------------
  async iniciar() {
    const vigente = this.empezarSesion();
    this.pacas.forEach((paca, i) => {
      this.reiniciarPaca(paca);
      this.hacerTocable(paca.grupo, () => this.alTocarPaca(i));
    });
    for (const animal of Object.values(this.escondidos)) animal.raiz.visible = false;

    // Se hace de noche
    this.escena.cambiarMomento(.04, 3.5);
    await this.decir('¡Uy! Se hizo de noche en el granero. ¡Qué oscuro!', 'sorprendido');
    if (!vigente()) return false;
    await this.encenderLinterna(true);
    if (!vigente()) return false;
    await this.decir('¡Encendí mi linterna! Muévela con tu dedito.', 'feliz');
    if (!vigente()) return false;

    const animales = mezclarLista(TIPOS_ANIMALES).slice(0, 3);
    this.ui.mostrarProgreso(3, 0, '🔦');
    this.mostrarRepetir();
    let pacaAnterior = -1;

    for (let ronda = 0; ronda < 3; ronda++) {
      // Elegimos una paca distinta a la de la ronda anterior
      let indice;
      do { indice = Math.floor(Math.random() * 4); } while (indice === pacaAnterior);
      pacaAnterior = indice;
      this.pacaCorrecta = indice;
      this.escondido = this.escondidos[animales[ronda]];
      const paca = this.pacas[indice];
      this.escondido.raiz.position.set(paca.base.x, paca.base.y, paca.base.z - .2);
      this.escondido.raiz.visible = false;

      await this.decir(ronda === 0
        ? '¡Shhh! Alguien se esconde detrás de una paca. Escucha bien… ¿dónde suena?'
        : '¡Shhh! Otro amigo se escondió. ¿Dónde suena?');
      if (!vigente()) return false;

      let encontrado = false;
      while (!encontrado) {
        this.modo = 'pregunta';
        const toque = this.esperarToque();
        this.repetir();
        // Si el niño no toca, el animal vuelve a sonar cada 6 segundos
        let respuesta = null;
        while (respuesta === null) {
          const ganador = await Promise.race([toque, esperar(6).then(() => 'tiempo')]);
          if (!vigente()) return false;
          if (ganador === 'tiempo') this.repetir();
          else respuesta = ganador;
        }
        if (respuesta === undefined) return false;
        this.modo = 'espera';
        const tocada = this.pacas[respuesta];

        if (respuesta === this.pacaCorrecta) {
          encontrado = true;
          await this.descubrir(tocada);
          if (!vigente()) return false;
          this.ui.mostrarProgreso(3, ronda + 1, '🔦');
          await esperar(1.2);
          await this.esconderOtraVez(tocada);
        } else {
          tocada.sacudida = 1;
          this.audio.efecto('paca', { pan: this.paneo(respuesta) });
          this.pip.marearse(1.1);
          await this.decir('¡Casi! Ahí solo hay heno. Escucha otra vez.');
        }
        if (!vigente()) return false;
      }
    }

    // ---------- ¡Luz amarilla! ----------
    this.modo = 'nada';
    this.ui.ocultarRepetir();
    this.quitarTocables();
    await this.decir('¡Encontraste a todos! Mi última luz se está encendiendo…', 'sorprendido');
    if (!vigente()) return false;
    await this.pip.encenderLuz(2);
    this.efectos.chispasEn(this.pip.raiz.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '#ffd84d', 90, 4);
    await this.pip.celebrar();
    await this.encenderLinterna(false);
    this.ui.ocultarProgreso();
    return vigente();
  }

  paneo(indice) { return X_PACAS[indice] / 3.3 * .9; }

  // El animal escondido suena del lado de su paca
  repetir() {
    if (!this.escondido || this.modo !== 'pregunta') return;
    this.audio.efecto(this.escondido.tipo, { pan: this.paneo(this.pacaCorrecta) });
  }

  // La paca salta a un lado y aparece el animal bailando
  async descubrir(paca) {
    const animal = this.escondido;
    this.audio.efecto('paca', { pan: this.paneo(paca.indice) });
    const lado = paca.indice < 2 ? -1 : 1;
    // Anticipación: se aplasta un poquito…
    await animar(.15, t => paca.grupo.scale.set(1 + t * .12, 1 - t * .15, 1), { curva: suavizar.salida });
    // …¡y salta hacia un lado rodando!
    const desde = paca.grupo.position.clone();
    animar(.7, t => {
      paca.grupo.position.x = desde.x + lado * 1.6 * t;
      paca.grupo.position.z = desde.z + .9 * t;
      paca.grupo.position.y = desde.y + Math.sin(t * Math.PI) * 1.3;
      paca.grupo.rotation.z = -lado * t * Math.PI * .5;
      const s = 1 + Math.sin(t * Math.PI) * .1;
      paca.grupo.scale.set(1 / s, s, 1);
    }, { curva: suavizar.salida });
    await esperar(.25);
    animal.raiz.visible = true;
    animal.mirarHacia(this.escena.camera.position);
    animal.aparecer();
    this.audio.efecto(animal.tipo, { pan: this.paneo(paca.indice) });
    this.audio.efecto('alegria');
    animal.bailar(4);
    this.efectos.chispasEn(animal.raiz.position.clone().add(new THREE.Vector3(0, 1.3, 0)), '#ffe27a', 70, 3.5);
    this.efectos.confetiEn(animal.raiz.position.clone().add(new THREE.Vector3(0, 1, 0)), 40, 4);
    this.metaLinterna.set(animal.raiz.position.x, 1, animal.raiz.position.z);
    this.pip.celebrar();
    await this.decir(`¡Encontraste ${animal.datos.conArticulo.startsWith('el ') ? 'al ' + animal.datos.conArticulo.slice(3) : 'a ' + animal.datos.conArticulo}! ${animal.datos.onomatopeya}`, 'feliz');
  }

  async esconderOtraVez(paca) {
    const animal = this.escondido;
    const escala = animal.raiz.scale.x;
    await animar(.35, t => animal.raiz.scale.setScalar(Math.max(.001, escala * (1 - t))), { curva: suavizar.entrada });
    animal.raiz.visible = false;
    animal.raiz.scale.setScalar(animal.escalaFinal);
    const desde = paca.grupo.position.clone();
    const rotDesde = paca.grupo.rotation.z;
    await animar(.6, t => {
      paca.grupo.position.lerpVectors(desde, paca.base, t);
      paca.grupo.position.y += Math.sin(t * Math.PI) * .6;
      paca.grupo.rotation.z = rotDesde * (1 - t);
    }, { curva: suavizar.entradaSalida });
    this.reiniciarPaca(paca);
    this.audio.efecto('rebote');
  }

  reiniciarPaca(paca) {
    paca.grupo.position.copy(paca.base);
    paca.grupo.rotation.set(0, 0, 0);
    paca.grupo.scale.set(1, 1, 1);
    paca.sacudida = 0;
  }

  alTocarPaca(indice) {
    if (this.modo === 'pregunta') this.entregarToque(indice);
  }

  detener() {
    super.detener();
    this.modo = 'nada';
    this.escondido = null;
    this.pacas.forEach(p => this.reiniciarPaca(p));
    for (const animal of Object.values(this.escondidos)) animal.raiz.visible = false;
    this.encenderLinterna(false);
    this.escena.cambiarMomento(1, 1.6);   // vuelve el día
  }

  actualizar(dt, t) {
    for (const animal of Object.values(this.escondidos)) if (animal.raiz.visible) animal.actualizar(dt, t);
    // Las pacas "se mueven" un poquito cuando hay alguien detrás (pista visual sutil)
    this.pacas.forEach((paca, i) => {
      paca.sacudida = Math.max(0, paca.sacudida - dt * 1.5);
      const escondidoAqui = this.modo === 'pregunta' && i === this.pacaCorrecta;
      paca.rollo.rotation.z = Math.sin(paca.sacudida * 30) * .12 * paca.sacudida + (escondidoAqui ? Math.sin(t * 9) * .012 : 0);
    });

    // Linterna: sale de la cabeza de Pip y apunta suavemente al dedo
    if (this.potenciaLinterna > 0) {
      this.puntoLinterna.lerp(this.metaLinterna, 1 - Math.exp(-6 * dt));
      const origen = this.pip.raiz.position.clone().add(new THREE.Vector3(0, 1.9, 0));
      const direccion = this.puntoLinterna.clone().sub(origen);
      const largo = direccion.length();
      direccion.normalize();
      origen.addScaledVector(direccion, .5);
      this.foco.position.copy(origen);
      this.foco.target.position.copy(this.puntoLinterna);
      this.foco.intensity = 60 * this.potenciaLinterna;
      this.haz.position.copy(origen);
      this.haz.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), direccion);
      const apertura = largo * Math.tan(.38);
      this.haz.scale.set(apertura, largo, apertura);
      this.haz.material.opacity = .2 * this.potenciaLinterna;
      const suelo = this.puntoLinterna.clone();
      suelo.y = alturaSuelo(suelo.x, suelo.z) + .05;
      this.manchaLuz.position.copy(suelo);
      this.manchaLuz.material.opacity = .5 * this.potenciaLinterna;
      this.pip.mirarHacia(this.puntoLinterna);
    } else {
      this.foco.intensity = 0;
    }
  }
}

// Espiral de heno para las tapas de las pacas
function texturaEspiral() {
  const { lienzo, ctx } = crearLienzo(256, 256);
  ctx.fillStyle = '#f2cf5b';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#c99a2e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let a = 0; a < Math.PI * 14; a += .1) {
    const r = a * 2.8;
    ctx.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r);
  }
  ctx.stroke();
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}
