// =========================================================
// zonas/corral.js — FASE 2: el corral (sentido del OÍDO)
//
//   1. Juego libre: el niño toca a cada animal; salta, baila y
//      hace su sonido. Pip dice la onomatopeya.
//   2. Adivinanza (4 rondas): Pip pregunta "¿Quién hace muuu?"
//      y el niño toca al animal correcto.
//   3. Al ganar se enciende la LUZ AZUL del pecho de Pip.
// =========================================================
import * as THREE from 'three';
import { ZonaBase } from './base.js';
import { ZONAS, alturaSuelo } from '../escena.js';
import { Animal, TIPOS_ANIMALES } from '../animales.js';
import { esperar } from '../utilidades.js';

// Lugar de cada animal dentro del corral (relativo al centro)
// Dos filas bien separadas: la cámara mira desde arriba, así nadie tapa a nadie
const LUGARES = {
  vaca: [-2.4, -1.5], oveja: [0, -1.7], cerdito: [2.4, -1.5],
  gallo: [-2.3, 1.6], perro: [0, 1.9], pato: [2.3, 1.6]
};

const mezclarLista = lista => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
};

export class Corral extends ZonaBase {
  constructor(contexto) {
    super(contexto);
    this.zona = ZONAS[0];
    this.grupo.visible = true;        // los animales viven en el corral desde el principio
    this.animales = {};
    for (const tipo of TIPOS_ANIMALES) {
      const animal = new Animal(tipo);
      this.animales[tipo] = animal;
      this.grupo.add(animal.raiz);
    }
    this.ubicarAnimales();
    this.modo = 'nada';
  }

  // Pone a cada animal en su lugar del corral, mirando hacia la cámara de la zona
  ubicarAnimales() {
    const centro = this.zona.posicion;
    for (const [tipo, [dx, dz]] of Object.entries(LUGARES)) {
      const animal = this.animales[tipo];
      const x = centro.x + dx, z = centro.z + dz;
      animal.raiz.position.set(x, alturaSuelo(x, z), z);
      animal.raiz.visible = true;
      animal.raiz.scale.setScalar(animal.datos.escala);
      animal.mirarHacia(this.zona.camara.pos);
    }
  }

  lista() { return Object.values(this.animales); }

  // ---------------------------------------------------------
  async iniciar() {
    const vigente = this.empezarSesion();
    this.ubicarAnimales();
    for (const animal of this.lista()) {
      // Se registra todo el animal: vale tocar su cuerpo o su zona invisible
      this.hacerTocable(animal.raiz, () => this.alTocarAnimal(animal));
    }

    // Todos saludan con un saltito
    this.lista().forEach((animal, i) => esperar(i * .12).then(() => vigente() && animal.saltar(.5)));
    await this.decir('¡Bienvenido al corral! Mis orejitas no escuchan bien. Toca a cada animal para oír cómo hace.', 'feliz');
    if (!vigente()) return false;

    // ---------- 1. Juego libre ----------
    this.modo = 'libre';
    this.tocados = new Set();
    this.ui.mostrarProgreso(6, 0, '🐾');
    const listo = new Promise(resolver => { this.resolverLibre = resolver; });
    let terminado = false;
    listo.then(() => { terminado = true; });
    while (vigente() && !terminado) {
      await Promise.race([listo, esperar(16)]);
      if (!vigente() || terminado) break;
      // Recordatorio con cariño: los que faltan saltan para llamar la atención
      const faltan = this.lista().filter(a => !this.tocados.has(a.tipo));
      faltan.forEach(a => a.saltar(.6));
      this.decir(faltan.length === 1 ? `¡Falta ${faltan[0].datos.conArticulo}! Tócalo.` : '¡Toca a los animales que saltan!');
    }
    if (!vigente()) return false;
    await esperar(1.2);
    if (!vigente()) return false;

    // ---------- 2. ¿Quién hace…? ----------
    this.modo = 'espera';
    await this.decir('¡Muy bien! Ahora juguemos a adivinar. Escucha con atención.', 'feliz');
    if (!vigente()) return false;
    const rondas = mezclarLista(TIPOS_ANIMALES).slice(0, 4);
    this.ui.mostrarProgreso(4, 0, '⭐');
    this.mostrarRepetir();

    for (let ronda = 0; ronda < rondas.length; ronda++) {
      this.objetivo = this.animales[rondas[ronda]];
      let acertado = false;
      let primeraVez = true;
      while (!acertado) {
        this.modo = 'pregunta';
        const toque = this.esperarToque();          // se puede tocar mientras Pip habla
        if (primeraVez) this.repetir();
        else this.audio.efecto(this.objetivo.tipo);
        primeraVez = false;
        const tocado = await toque;
        if (!vigente() || !tocado) return false;
        this.modo = 'espera';

        if (tocado === this.objetivo) {
          acertado = true;
          await this.festejar(tocado);
          if (!vigente()) return false;
          this.ui.mostrarProgreso(4, ronda + 1, '⭐');
          await this.decir(`¡Sí! ${mayuscula(tocado.datos.conArticulo)} hace ${tocado.datos.onomatopeya}`, 'feliz');
        } else {
          // Nunca un castigo: Pip se marea gracioso y anima a intentar otra vez
          tocado.sacudir();
          this.audio.efecto('casi');
          this.pip.marearse(1.3);
          await this.decir(`¡Casi! Ese es ${tocado.datos.conArticulo}. Intenta otra vez.`);
        }
        if (!vigente()) return false;
      }
    }

    // ---------- 3. ¡Se enciende la luz azul! ----------
    this.modo = 'nada';
    this.ui.ocultarRepetir();
    this.quitarTocables();
    this.lista().forEach(a => a.bailar(6));
    this.efectos.lluviaConfeti(this.zona.posicion, 4, 140);
    await this.decir('¡Lo lograste! Mi sensor del oído se está encendiendo…', 'sorprendido');
    if (!vigente()) return false;
    await this.pip.encenderLuz(0);
    this.efectos.chispasEn(this.pip.raiz.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '#3fa9ff', 80, 4);
    await this.pip.celebrar();
    await this.decir('¡Ahora puedo escuchar! ¡Gracias, amigo!', 'feliz');
    this.ui.ocultarProgreso();
    return vigente();
  }

  // La pregunta: Pip habla y luego suena el animal
  async repetir() {
    if (!this.objetivo) return;
    await this.decir(`¿Quién hace ${this.objetivo.datos.pregunta}?`);
    // Solo suena si todavía estamos esperando la respuesta
    if (this.vigente() && this.modo === 'pregunta') this.audio.efecto(this.objetivo.tipo);
  }

  async festejar(animal) {
    this.audio.efecto(animal.tipo);
    this.audio.efecto('alegria');
    animal.bailar(3);
    animal.saltar(.9);
    this.efectos.chispasEn(animal.raiz.position.clone().add(new THREE.Vector3(0, 1.5, 0)), '#ffd84d', 60, 3.5);
    this.efectos.confetiEn(animal.raiz.position.clone().add(new THREE.Vector3(0, 1, 0)), 50, 4);
    await this.pip.celebrar();
  }

  // ---------------------------------------------------------
  alTocarAnimal(animal) {
    if (this.modo === 'libre') {
      // Juego libre: salta, baila y hace su sonido (se puede tocar todas las veces)
      this.audio.efecto(animal.tipo);
      animal.saltar(.8);
      animal.bailar(2.2);
      this.efectos.chispasEn(animal.raiz.position.clone().add(new THREE.Vector3(0, 1.4, 0)), '#ffffff', 25, 2.5);
      this.pip.mirarHacia(animal.raiz.position);
      const nuevo = !this.tocados.has(animal.tipo);
      this.tocados.add(animal.tipo);
      this.ui.mostrarProgreso(6, this.tocados.size, '🐾');
      clearTimeout(this.temporizadorVoz);
      this.temporizadorVoz = setTimeout(() => {
        if (this.vigente()) {
          this.pip.decir(`${mayuscula(animal.datos.conArticulo)} hace ${animal.datos.onomatopeya}`, 'feliz');
        }
      }, 700);
      if (nuevo && this.tocados.size === TIPOS_ANIMALES.length) {
        this.modo = 'espera';
        setTimeout(() => this.resolverLibre?.(), 2600);
      }
    } else if (this.modo === 'pregunta') {
      this.entregarToque(animal);
    }
  }

  detener() {
    super.detener();
    this.modo = 'nada';
    clearTimeout(this.temporizadorVoz);
    this.resolverLibre?.();
  }

  actualizar(dt, t) {
    for (const animal of this.lista()) animal.actualizar(dt, t);
  }
}

export const mayuscula = texto => texto.charAt(0).toUpperCase() + texto.slice(1);
