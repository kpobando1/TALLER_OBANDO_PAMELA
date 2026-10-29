// =========================================================
// zonas/huerto.js — FASE 3: el huerto (sentido de la VISTA)
//
// Un espejo mágico flotante muestra un COLOR o una SILUETA.
// Pip pregunta y el niño elige entre 3 frutas sobre cajones.
// Al acertar, una planta CRECE frente al niño y da frutos.
// 4 rondas → se enciende la LUZ VERDE de Pip.
// =========================================================
import * as THREE from 'three';
import { ZonaBase } from './base.js';
import { ZONAS, alturaSuelo } from '../escena.js';
import { crearFruta, crearPlanta, dibujarSilueta, DATOS_FRUTAS, TIPOS_FRUTAS } from '../frutas.js';
import { animar, esperar, suavizar, crearLienzo } from '../utilidades.js';
import { mayuscula } from './corral.js';

const mezclarLista = lista => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

export class Huerto extends ZonaBase {
  constructor(contexto) {
    super(contexto);
    this.zona = ZONAS[1];
    this.grupo.visible = true;
    const c = this.zona.posicion;

    // El espejo flota sobre el cantero de atrás, bien a la vista
    this.crearEspejo(new THREE.Vector3(c.x, 2.55, c.z - 1.9));
    this.espejo.scale.setScalar(1.15);

    // 3 cajones de madera frente a los canteros
    this.cajones = [-1.95, 0, 1.95].map(dx => {
      const x = c.x + dx, z = c.z + 3;
      const cajon = crearCajon();
      cajon.position.set(x, alturaSuelo(x, z), z);
      this.grupo.add(cajon);
      return { grupo: cajon, fruta: null, tipo: null };
    });

    // Lugares donde crecerán las 4 plantas (en el cantero de adelante)
    this.lugaresPlantas = [-1.5, -.5, .5, 1.5].map(dx => new THREE.Vector3(c.x + dx, alturaSuelo(c.x + dx, c.z + 1.1) + .37, c.z + 1.1));
    this.plantas = [];
    this.modo = 'nada';
    this.grupo.traverse(o => { if (o.isMesh && !o.userData.sinSombra) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // ---------------------------------------------------------
  // ESPEJO MÁGICO: marco dorado + "vidrio" que es una textura dibujada
  // ---------------------------------------------------------
  crearEspejo(posicion) {
    this.espejo = new THREE.Group();
    this.espejo.position.copy(posicion);
    this.posicionEspejo = posicion.clone();

    const oro = new THREE.MeshPhysicalMaterial({ color: '#ffcf4d', metalness: 1, roughness: .22, clearcoat: 1 });
    const marco = new THREE.Mesh(new THREE.TorusGeometry(1, .11, 18, 72), oro);
    marco.scale.set(.82, 1, 1);
    this.espejo.add(marco);

    this.lienzoEspejo = crearLienzo(410, 512);
    this.texturaEspejo = new THREE.CanvasTexture(this.lienzoEspejo.lienzo);
    this.texturaEspejo.colorSpace = THREE.SRGBColorSpace;
    const vidrio = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshBasicMaterial({ map: this.texturaEspejo }));
    vidrio.scale.set(.82, 1, 1);
    vidrio.position.z = .01;
    vidrio.userData.sinSombra = true;
    this.espejo.add(vidrio);

    // Estrellita en la punta y halo brillante detrás (el bloom lo hace resplandecer)
    const estrella = new THREE.Mesh(new THREE.OctahedronGeometry(.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.5, .8) }));
    estrella.position.y = 1.22;
    estrella.scale.set(1, 1.3, .5);
    this.estrellaEspejo = estrella;
    this.espejo.add(estrella);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(1.06, .05, 8, 72), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.3, 2.4) }));
    halo.scale.set(.82, 1, 1);
    halo.position.z = -.05;
    halo.userData.sinSombra = true;
    this.haloEspejo = halo;
    this.espejo.add(halo);
    this.grupo.add(this.espejo);

    this.dibujarEspejo(null);
  }

  // modo: 'color' | 'silueta' | null (espejo en reposo)
  dibujarEspejo(modo, tipo) {
    const { ctx } = this.lienzoEspejo;
    const W = 410, H = 512;
    const fondo = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, 300);
    fondo.addColorStop(0, '#fdf7ff');
    fondo.addColorStop(1, '#bcd7ff');
    ctx.fillStyle = fondo;
    ctx.fillRect(0, 0, W, H);
    // Destellos mágicos
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 18; i++) {
      const x = (i * 97) % W, y = (i * 151) % H, r = 2 + (i % 3) * 2;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    if (modo === 'color') {
      const datos = DATOS_FRUTAS[tipo];
      // Una gran mancha de pintura del color
      ctx.fillStyle = datos.hex;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + .01; a += .1) {
        const r = 130 + Math.sin(a * 5) * 14 + Math.sin(a * 3 + 1) * 10;
        ctx.lineTo(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
      }
      ctx.fill();
      if (tipo === 'sandia') {          // verde por fuera, rojo por dentro
        ctx.fillStyle = '#ff4d5e';
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 85, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.beginPath(); ctx.ellipse(W / 2 - 50, H / 2 - 60, 40, 22, -.6, 0, Math.PI * 2); ctx.fill();
    } else if (modo === 'silueta') {
      ctx.fillStyle = '#1d1630';
      dibujarSilueta(ctx, tipo, W / 2, H / 2 + 10, 1.25);
    } else {
      ctx.fillStyle = 'rgba(150, 120, 220, .5)';
      ctx.font = '120px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('✨', W / 2, H / 2);
    }
    this.texturaEspejo.needsUpdate = true;
  }

  // Animación mágica del espejo al cambiar la imagen
  async mostrarEnEspejo(modo, tipo) {
    this.audio.efecto('aparecer');
    const s = 1.15;
    await animar(.25, t => this.espejo.scale.set(s * (1 - t * .9), s, s), { curva: suavizar.entrada });
    this.dibujarEspejo(modo, tipo);
    this.efectos.chispasEn(this.espejo.position, '#d9b8ff', 40, 2.5);
    await animar(.5, t => this.espejo.scale.set(s * (.1 + t * .9), s, s), { curva: suavizar.rebotito });
  }

  // ---------------------------------------------------------
  async iniciar() {
    const vigente = this.empezarSesion();
    // Quitamos las plantas de una partida anterior
    for (const planta of this.plantas) this.grupo.remove(planta);
    this.plantas = [];
    this.cajones.forEach((cajon, i) => {
      this.hacerTocable(cajon.grupo, () => this.alTocarCajon(i));
    });

    await this.decir('¡Este es el huerto! Mis ojitos están apagados. Mira el espejo mágico y ayúdame a encontrar las frutas.', 'feliz');
    if (!vigente()) return false;

    const objetivos = mezclarLista(TIPOS_FRUTAS).slice(0, 4);
    this.ui.mostrarProgreso(4, 0, '🌱');
    this.mostrarRepetir();

    for (let ronda = 0; ronda < objetivos.length; ronda++) {
      const tipo = objetivos[ronda];
      this.objetivo = tipo;
      this.modoPregunta = ronda % 2 === 0 ? 'color' : 'silueta';

      // Dos frutas distintas (si la pregunta es de color, de OTRO color)
      const colorObjetivo = DATOS_FRUTAS[tipo].color;
      const otras = mezclarLista(TIPOS_FRUTAS.filter(f => f !== tipo && (this.modoPregunta === 'silueta' || DATOS_FRUTAS[f].color !== colorObjetivo))).slice(0, 2);
      await this.ponerFrutas(mezclarLista([tipo, ...otras]));
      if (!vigente()) return false;
      await this.mostrarEnEspejo(this.modoPregunta, tipo);
      if (!vigente()) return false;

      let acertado = false;
      while (!acertado) {
        this.modo = 'pregunta';
        const toque = this.esperarToque();
        this.repetir();
        const indice = await toque;
        if (!vigente() || indice === null || indice === undefined) return false;
        this.modo = 'espera';
        const cajon = this.cajones[indice];

        if (cajon.tipo === tipo) {
          acertado = true;
          await this.acierto(cajon, ronda);
          if (!vigente()) return false;
          this.ui.mostrarProgreso(4, ronda + 1, '🌱');
        } else {
          this.audio.efecto('casi');
          this.sacudirFruta(cajon.fruta);
          this.pip.marearse(1.2);
          const esa = cajon.tipo === 'uvas' ? 'Esas son' : (cajon.tipo === 'platano' ? 'Ese es' : 'Esa es');
          await this.decir(`¡Casi! ${esa} ${DATOS_FRUTAS[cajon.tipo].conArticulo}. Intenta otra vez.`);
          if (!vigente()) return false;
        }
      }
      await this.quitarFrutas();
      if (!vigente()) return false;
    }

    // ---------- ¡Luz verde! ----------
    this.modo = 'nada';
    this.ui.ocultarRepetir();
    this.quitarTocables();
    await this.mostrarEnEspejo(null);
    this.efectos.lluviaConfeti(this.zona.posicion, 4, 140);
    await this.decir('¡Qué huerto tan bonito! Mi sensor de la vista se está encendiendo…', 'sorprendido');
    if (!vigente()) return false;
    await this.pip.encenderLuz(1);
    this.efectos.chispasEn(this.pip.raiz.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '#4fdc5a', 80, 4);
    await this.pip.celebrar();
    await this.decir('¡Ahora puedo ver todos los colores! ¡Gracias!', 'feliz');
    this.ui.ocultarProgreso();
    return vigente();
  }

  async repetir() {
    if (!this.objetivo) return;
    const texto = this.modoPregunta === 'color'
      ? `¿Qué fruta es ${DATOS_FRUTAS[this.objetivo].pista}?`
      : 'Mira el espejo mágico. ¿De quién es esta sombrita?';
    await this.decir(texto);
  }

  // Las frutas aparecen saltando sobre los cajones
  async ponerFrutas(tipos) {
    tipos.forEach((tipo, i) => {
      const cajon = this.cajones[i];
      const fruta = crearFruta(tipo);
      fruta.position.set(0, .42, 0);
      fruta.scale.setScalar(.001);
      cajon.grupo.add(fruta);
      cajon.fruta = fruta;
      cajon.tipo = tipo;
      const escala = tipo === 'sandia' ? 1.15 : 1.6;     // grandes, para manitos pequeñas
      animar(.6, t => fruta.scale.setScalar(Math.max(.001, t * escala)), { curva: suavizar.rebotito, retraso: i * .15 });
      esperar(i * .15).then(() => this.audio.efecto('pop'));
    });
    await esperar(.9);
  }

  async quitarFrutas() {
    const promesas = this.cajones.map(cajon => {
      const fruta = cajon.fruta;
      if (!fruta) return Promise.resolve();
      cajon.fruta = null;
      cajon.tipo = null;
      const desde = fruta.scale.x;
      return animar(.35, t => fruta.scale.setScalar(Math.max(.001, desde * (1 - t))), { curva: suavizar.entrada })
        .then(() => fruta.parent?.remove(fruta));
    });
    await Promise.all(promesas);
  }

  sacudirFruta(fruta) {
    if (!fruta) return;
    animar(.6, t => { fruta.rotation.z = Math.sin(t * Math.PI * 6) * .35 * (1 - t); }, { curva: suavizar.lineal });
  }

  // ¡Acierto! La fruta salta y gira, y una planta crece con esa fruta
  async acierto(cajon, ronda) {
    const fruta = cajon.fruta;
    this.audio.efecto('alegria');
    const posicion = new THREE.Vector3();
    fruta.getWorldPosition(posicion);
    this.efectos.chispasEn(posicion.clone().add(new THREE.Vector3(0, .5, 0)), '#ffd84d', 60, 3.5);
    this.efectos.confetiEn(posicion.clone().add(new THREE.Vector3(0, .6, 0)), 40, 4);
    animar(.8, t => { fruta.position.y = .42 + Math.sin(t * Math.PI) * 1.2; fruta.rotation.y = t * Math.PI * 4; }, { curva: suavizar.lineal });
    this.pip.celebrar();
    const verbo = cajon.tipo === 'uvas' ? 'Son' : 'Es';
    await this.decir(`¡Sí! ${verbo} ${DATOS_FRUTAS[cajon.tipo].conArticulo}. ¡Mira cómo crece!`, 'feliz');
    if (!this.vigente()) return;

    // La planta crece en tiempo real
    const planta = crearPlanta(cajon.tipo);
    planta.position.copy(this.lugaresPlantas[ronda]);
    this.grupo.add(planta);
    this.plantas.push(planta);
    this.audio.efecto('crecer');
    this.efectos.chispasEn(planta.position.clone().add(new THREE.Vector3(0, .3, 0)), '#7dff8a', 50, 2.5);
    await planta.userData.crecer();
    this.efectos.chispasEn(planta.position.clone().add(new THREE.Vector3(0, 1, 0)), '#ffffff', 30, 2);
  }

  alTocarCajon(indice) {
    if (this.modo === 'pregunta' && this.cajones[indice].fruta) this.entregarToque(indice);
  }

  detener() {
    super.detener();
    this.modo = 'nada';
    this.objetivo = null;
    this.quitarFrutas();
    this.dibujarEspejo(null);
  }

  actualizar(dt, t) {
    // El espejo flota y la estrellita gira
    this.espejo.position.y = this.posicionEspejo.y + Math.sin(t * 1.4) * .15;
    this.espejo.rotation.z = Math.sin(t * .9) * .04;
    this.estrellaEspejo.rotation.y = t * 2;
    this.haloEspejo.material.color.setRGB(1.3 + Math.sin(t * 3) * .4, 1.1, 2.2);
    for (const planta of this.plantas) planta.userData.mecer(t);
    // Las frutas respiran un poquito (para que parezcan vivas)
    for (const cajon of this.cajones) {
      if (cajon.fruta && this.modo === 'pregunta') cajon.fruta.position.y = .42 + Math.abs(Math.sin(t * 3 + cajon.grupo.position.x)) * .08;
    }
  }
}

// Cajón de madera hecho con tablitas
function crearCajon() {
  const cajon = new THREE.Group();
  const madera = new THREE.MeshStandardMaterial({ color: '#c98b4a', roughness: .75 });
  const maderaOscura = new THREE.MeshStandardMaterial({ color: '#9c6634', roughness: .8 });
  const ancho = 1.35, fondo = .95, alto = .5;
  const fondoCaja = new THREE.Mesh(new THREE.BoxGeometry(ancho, .08, fondo), maderaOscura);
  fondoCaja.position.y = .04;
  cajon.add(fondoCaja);
  for (const [w, d, x, z] of [[ancho, .07, 0, fondo / 2], [ancho, .07, 0, -fondo / 2], [.07, fondo, ancho / 2, 0], [.07, fondo, -ancho / 2, 0]]) {
    for (const y of [.16, .38]) {
      const tabla = new THREE.Mesh(new THREE.BoxGeometry(w, .16, d), madera);
      tabla.position.set(x, y, z);
      cajon.add(tabla);
    }
  }
  for (const x of [-1, 1]) for (const z of [-1, 1]) {
    const poste = new THREE.Mesh(new THREE.BoxGeometry(.1, alto, .1), maderaOscura);
    poste.position.set(x * ancho / 2, alto / 2, z * fondo / 2);
    cajon.add(poste);
  }
  // Paja adentro para que la fruta se vea "acomodada"
  const paja = new THREE.Mesh(new THREE.BoxGeometry(ancho - .1, .1, fondo - .1), new THREE.MeshStandardMaterial({ color: '#f2cf5b', roughness: 1 }));
  paja.position.y = .4;
  cajon.add(paja);
  // Zona de toque grande e invisible
  const toque = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2, 1.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  toque.position.y = .8;
  toque.userData.sinSombra = true;
  cajon.add(toque);
  return cajon;
}
