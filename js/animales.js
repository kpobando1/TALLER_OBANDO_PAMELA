// =========================================================
// animales.js — vaca, cerdito, oveja, gallo, pato y perro.
//
// Receta "Pixar" para cada animal:
//   • cabeza grande y cuerpo redondito
//   • OJOS ENORMES con brillito y parpadeo
//   • mejillas rosadas
//   • orejas, colas y alas con RESORTE (follow-through):
//     cuando el animal salta, llegan "tarde" y rebotan
//   • squash & stretch al saltar y bailar
//
// Todos miran hacia +Z (hacia adelante).
// =========================================================
import * as THREE from 'three';
import { animar, esperar, suavizar } from './utilidades.js';

export const TIPOS_ANIMALES = ['vaca', 'cerdito', 'oveja', 'gallo', 'pato', 'perro'];

// Datos para que Pip hable de cada animal
export const DATOS_ANIMALES = {
  vaca: { nombre: 'vaca', conArticulo: 'la vaca', onomatopeya: '¡Muuu!', pregunta: 'muuu', escala: 1.25 },
  cerdito: { nombre: 'cerdito', conArticulo: 'el cerdito', onomatopeya: '¡Oink, oink!', pregunta: 'oink oink', escala: 1.25 },
  oveja: { nombre: 'oveja', conArticulo: 'la oveja', onomatopeya: '¡Beee!', pregunta: 'beee', escala: 1.25 },
  gallo: { nombre: 'gallo', conArticulo: 'el gallo', onomatopeya: '¡Kikirikí!', pregunta: 'kikirikí', escala: 1.35 },
  pato: { nombre: 'pato', conArticulo: 'el pato', onomatopeya: '¡Cuac, cuac!', pregunta: 'cuac cuac', escala: 1.35 },
  perro: { nombre: 'perro', conArticulo: 'el perro', onomatopeya: '¡Guau, guau!', pregunta: 'guau guau', escala: 1.25 }
};

// ---------- Materiales: plástico suave de juguete ----------
const cacheMateriales = new Map();
function mat(color, extra = {}) {
  const clave = color + JSON.stringify(extra);
  if (!cacheMateriales.has(clave)) {
    cacheMateriales.set(clave, new THREE.MeshPhysicalMaterial({ color, roughness: .55, clearcoat: .35, clearcoatRoughness: .45, ...extra }));
  }
  return cacheMateriales.get(clave);
}
const geoEsfera = new THREE.SphereGeometry(1, 32, 20);

// Crea una esfera (estirada con sx, sy, sz) y la agrega al padre
function esfera(padre, r, material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const malla = new THREE.Mesh(geoEsfera, material);
  malla.scale.set(r * sx, r * sy, r * sz);
  malla.position.set(x, y, z);
  padre.add(malla);
  return malla;
}

function cilindro(padre, r1, r2, alto, material, x = 0, y = 0, z = 0) {
  const malla = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, alto, 16), material);
  malla.position.set(x, y, z);
  padre.add(malla);
  return malla;
}

// =========================================================
export class Animal {
  constructor(tipo) {
    this.tipo = tipo;
    this.datos = DATOS_ANIMALES[tipo];
    this.raiz = new THREE.Group();
    this.raiz.name = tipo;
    this.cuerpo = new THREE.Group();          // aquí se aplica el squash & stretch
    this.raiz.add(this.cuerpo);
    this.cabeza = new THREE.Group();

    // Estado de animación
    this.fase = Math.random() * 10;
    this.saltoY = 0;
    this.estiramiento = 1;
    this.velEstiramiento = 0;
    this.estiramientoMeta = 1;
    this.bailarHasta = 0;
    this.tiempo = 0;
    this.parpadeo = 0;
    this.proximoParpadeo = 1 + Math.random() * 3;
    this.ojos = [];
    this.resortes = [];       // partes con rebote (orejas, colas, alas)
    this.alturaAnterior = 0;
    this.rumboBase = 0;
    this.sacudida = 0;

    this.construir();
    this.raiz.scale.setScalar(this.datos.escala);

    // Zona de toque invisible y grande
    this.zonaToque = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    this.zonaToque.position.y = .85;
    this.zonaToque.scale.set(.9, 1, .9);
    this.zonaToque.userData.sinSombra = true;
    this.raiz.add(this.zonaToque);

    this.raiz.traverse(o => {
      if (o.isMesh && !o.userData.sinSombra) { o.castShadow = true; o.receiveShadow = true; }
    });
  }

  // ---------------------------------------------------------
  // Piezas comunes
  // ---------------------------------------------------------

  // Ojo grande: blanco brillante + pupila + 2 brillitos
  ojo(x, y, z, r, mirarAfuera = 0) {
    const ojo = new THREE.Group();
    ojo.position.set(x, y, z);
    ojo.rotation.y = mirarAfuera;
    esfera(ojo, r, mat('#ffffff', { roughness: .15, clearcoat: 1, clearcoatRoughness: .05 }));
    esfera(ojo, r * .62, mat('#1d1424', { roughness: .1, clearcoat: 1 }), 0, 0, r * .5, 1, 1.05, .6);
    const brillo = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) });
    esfera(ojo, r * .22, brillo, -r * .2, r * .25, r * .88);
    esfera(ojo, r * .1, brillo, r * .2, -r * .18, r * .9);
    this.cabeza.add(ojo);
    this.ojos.push(ojo);
    return ojo;
  }

  mejillas(x, y, z, r) {
    const rosa = mat('#ff8fb5', { roughness: .7, clearcoat: 0 });
    esfera(this.cabeza, r, rosa, -x, y, z, 1, .65, .4).rotation.y = -.5;
    esfera(this.cabeza, r, rosa, x, y, z, 1, .65, .4).rotation.y = .5;
  }

  // Parte con resorte: un pivote que rebota cuando el animal se mueve
  resorte(padre, x, y, z, { eje = 'z', base = 0, rigidez = 80, amortiguacion = 6, sensibilidad = 1, vaiven = 0, velocidadVaiven = 2 } = {}) {
    const pivote = new THREE.Group();
    pivote.position.set(x, y, z);
    padre.add(pivote);
    this.resortes.push({ pivote, eje, base, angulo: base, velocidad: 0, rigidez, amortiguacion, sensibilidad, vaiven, velocidadVaiven });
    return pivote;
  }

  patas(posiciones, r, alto, material, pezuna = null) {
    for (const [x, z] of posiciones) {
      cilindro(this.cuerpo, r, r * .9, alto, material, x, alto / 2, z);
      if (pezuna) cilindro(this.cuerpo, r * 1.05, r * 1.05, .08, pezuna, x, .04, z);
    }
  }

  // ---------------------------------------------------------
  // Cada animal
  // ---------------------------------------------------------
  construir() {
    this[`construir_${this.tipo}`]();
    this.cuerpo.add(this.cabeza);
  }

  construir_vaca() {
    const blanco = mat('#fbf8f2'), negro = mat('#2a2326'), rosa = mat('#ffb3c1'), crema = mat('#f3e2b8');
    esfera(this.cuerpo, .6, blanco, 0, .78, 0, 1.05, .85, 1.25);
    // Manchas negras sobre el cuerpo
    for (const [x, y, z, r] of [[.5, .9, .15, .2], [-.48, .82, -.3, .24], [.15, 1.2, -.35, .18], [-.3, 1.15, .35, .14], [.35, .6, -.55, .16]]) {
      const mancha = esfera(this.cuerpo, r, negro, x, y, z, 1, 1, .4);
      mancha.lookAt(new THREE.Vector3(x * 3, (y - .78) * 3 + .78, z * 3));
    }
    this.patas([[-.32, .42], [.32, .42], [-.32, -.42], [.32, -.42]], .12, .42, blanco, mat('#5b4a44'));
    // Cascabel
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.32, .05, 8, 24), mat('#e8453c'));
    collar.position.set(0, 1.02, .5);
    collar.rotation.x = 1.2;
    this.cuerpo.add(collar);
    esfera(this.cuerpo, .11, mat('#ffcf3a', { metalness: .8, roughness: .25 }), 0, .88, .82);
    // Cola con borla
    const cola = this.resorte(this.cuerpo, 0, .95, -.72, { eje: 'z', vaiven: .35, velocidadVaiven: 2.5 });
    cilindro(cola, .03, .03, .5, blanco, 0, -.25, -.05).rotation.x = .2;
    esfera(cola, .09, negro, 0, -.52, -.1);

    // Cabeza
    this.cabeza.position.set(0, 1.3, .62);
    esfera(this.cabeza, .45, blanco, 0, 0, 0, 1.05, .95, 1);
    esfera(this.cabeza, .17, negro, .22, .18, .25, 1, 1, .5).rotation.y = .6;
    esfera(this.cabeza, .3, rosa, 0, -.18, .32, 1.25, .8, .85);           // hocico
    esfera(this.cabeza, .05, mat('#8a4f5e'), -.11, -.13, .58);
    esfera(this.cabeza, .05, mat('#8a4f5e'), .11, -.13, .58);
    for (const lado of [-1, 1]) {
      cilindro(this.cabeza, .03, .07, .22, crema, lado * .24, .42, .05).rotation.z = -lado * .5;
      const oreja = this.resorte(this.cabeza, lado * .4, .15, 0, { eje: 'z', base: lado * -.25, sensibilidad: lado * 1.5 });
      esfera(oreja, .14, blanco, lado * .14, 0, 0, 1.6, .55, .9);
      esfera(oreja, .09, rosa, lado * .16, 0, .05, 1.4, .45, .5);
    }
    this.ojo(-.17, .1, .36, .13, -.25);
    this.ojo(.17, .1, .36, .13, .25);
    this.mejillas(.3, -.12, .3, .08);
  }

  construir_cerdito() {
    const rosa = mat('#ffa8bf'), rosaOscuro = mat('#f07f9c'), nariz = mat('#d9587a');
    esfera(this.cuerpo, .62, rosa, 0, .66, 0, 1, .9, 1.15);
    this.patas([[-.3, .38], [.3, .38], [-.3, -.38], [.3, -.38]], .12, .3, rosa, rosaOscuro);
    // Colita enroscada
    const cola = this.resorte(this.cuerpo, 0, .78, -.7, { eje: 'z', vaiven: .4, velocidadVaiven: 4 });
    const rulo = new THREE.Mesh(new THREE.TorusGeometry(.08, .025, 8, 20, Math.PI * 1.7), rosaOscuro);
    rulo.rotation.y = Math.PI / 2;
    cola.add(rulo);

    this.cabeza.position.set(0, 1.08, .55);
    esfera(this.cabeza, .46, rosa);
    const trompa = cilindro(this.cabeza, .19, .2, .16, rosaOscuro, 0, -.08, .44);
    trompa.rotation.x = Math.PI / 2;
    esfera(this.cabeza, .045, nariz, -.07, -.08, .53, 1, 1.4, .5);
    esfera(this.cabeza, .045, nariz, .07, -.08, .53, 1, 1.4, .5);
    for (const lado of [-1, 1]) {
      const oreja = this.resorte(this.cabeza, lado * .27, .36, .05, { eje: 'x', base: .35, sensibilidad: 2.2 });
      const cono = new THREE.Mesh(new THREE.ConeGeometry(.14, .3, 12), rosaOscuro);
      cono.position.y = .12;
      cono.scale.z = .45;
      cono.rotation.z = -lado * .35;
      oreja.add(cono);
    }
    this.ojo(-.17, .12, .36, .11, -.25);
    this.ojo(.17, .12, .36, .11, .25);
    this.mejillas(.3, -.08, .3, .08);
  }

  construir_oveja() {
    // Lana con "sheen": un brillo suave aterciopelado, como tela
    const lana = mat('#fbf7f0', { roughness: .95, clearcoat: 0, sheen: 1, sheenRoughness: .55, sheenColor: new THREE.Color('#ffffff') });
    const cara = mat('#4a3b36'), patas = mat('#3a2e2a');
    esfera(this.cuerpo, .52, lana, 0, .82, 0, 1.05, .9, 1.15);
    // Bolitas de lana alrededor del cuerpo
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const fila = i % 2;
      esfera(this.cuerpo, .26 + (i % 3) * .03, lana, Math.cos(a) * .5, .7 + fila * .35, Math.sin(a) * .6);
    }
    esfera(this.cuerpo, .3, lana, 0, 1.22, 0);
    this.patas([[-.26, .32], [.26, .32], [-.26, -.32], [.26, -.32]], .08, .42, patas);
    const cola = this.resorte(this.cuerpo, 0, .95, -.68, { eje: 'z', vaiven: .3, velocidadVaiven: 3 });
    esfera(cola, .16, lana);

    this.cabeza.position.set(0, 1.12, .66);
    esfera(this.cabeza, .36, cara, 0, 0, 0, .9, 1, 1.05);
    esfera(this.cabeza, .18, mat('#7a645c'), 0, -.17, .26, 1.2, .8, .8);   // hocico
    // Copete de lana
    for (const [x, y, z] of [[0, .3, 0], [-.14, .26, .05], [.14, .26, .05], [0, .26, .16]]) esfera(this.cabeza, .14, lana, x, y, z);
    for (const lado of [-1, 1]) {
      const oreja = this.resorte(this.cabeza, lado * .3, .05, 0, { eje: 'z', base: lado * -.35, sensibilidad: lado * 1.8 });
      esfera(oreja, .13, cara, lado * .12, 0, 0, 1.6, .55, .8);
    }
    this.ojo(-.14, .06, .28, .12, -.25);
    this.ojo(.14, .06, .28, .12, .25);
    this.mejillas(.24, -.12, .24, .065);
  }

  construir_gallo() {
    const blanco = mat('#fff7ea'), rojo = mat('#ff3b3b'), amarillo = mat('#ffc22e');
    esfera(this.cuerpo, .38, blanco, 0, .7, 0, 1, 1.05, 1.1);
    // Plumas de la cola en abanico (con resorte)
    const cola = this.resorte(this.cuerpo, 0, .85, -.32, { eje: 'x', base: -.3, sensibilidad: 2, vaiven: .12, velocidadVaiven: 2 });
    ['#2f8f5a', '#2b6fc7', '#e8553c', '#2f8f5a', '#2b6fc7'].forEach((color, i) => {
      const pluma = esfera(cola, .1, mat(color, { clearcoat: .8 }), (i - 2) * .1, .3, -.1, 1, 3.2, .5);
      pluma.rotation.z = (i - 2) * -.35;
      pluma.rotation.x = -.4;
    });
    // Alitas que aletean al saltar
    for (const lado of [-1, 1]) {
      const ala = this.resorte(this.cuerpo, lado * .34, .82, 0, { eje: 'z', base: 0, sensibilidad: lado * -3 });
      esfera(ala, .17, blanco, 0, -.12, 0, .45, 1, 1.2);
    }
    // Patas amarillas
    for (const lado of [-1, 1]) {
      cilindro(this.cuerpo, .035, .035, .36, amarillo, lado * .13, .18, 0);
      for (const g of [-.45, 0, .45]) {
        const dedo = esfera(this.cuerpo, .05, amarillo, lado * .13 + Math.sin(g) * .08, .02, Math.cos(g) * .08, .6, .4, 1.6);
        dedo.rotation.y = g;
      }
    }

    this.cabeza.position.set(0, 1.12, .2);
    esfera(this.cabeza, .27, blanco);
    for (const [y, z, r] of [[.27, -.08, .08], [.31, .03, .1], [.27, .14, .08]]) esfera(this.cabeza, r, rojo, 0, y, z, .6, 1, 1);
    const pico = new THREE.Mesh(new THREE.ConeGeometry(.08, .2, 14), amarillo);
    pico.rotation.x = Math.PI / 2;
    pico.position.set(0, -.04, .3);
    this.cabeza.add(pico);
    esfera(this.cabeza, .07, rojo, 0, -.17, .22, .8, 1.4, .7);           // barbilla
    this.ojo(-.12, .06, .19, .09, -.35);
    this.ojo(.12, .06, .19, .09, .35);
    this.mejillas(.19, -.06, .17, .05);
  }

  construir_pato() {
    const amarillo = mat('#ffd84d'), naranja = mat('#ff9a2e');
    esfera(this.cuerpo, .4, amarillo, 0, .55, 0, 1, .85, 1.2);
    const cola = this.resorte(this.cuerpo, 0, .65, -.45, { eje: 'x', base: -.6, sensibilidad: 2, vaiven: .15, velocidadVaiven: 5 });
    const punta = new THREE.Mesh(new THREE.ConeGeometry(.12, .25, 12), amarillo);
    punta.position.y = .1;
    cola.add(punta);
    for (const lado of [-1, 1]) {
      const ala = this.resorte(this.cuerpo, lado * .36, .62, -.05, { eje: 'z', base: 0, sensibilidad: lado * -3 });
      esfera(ala, .2, amarillo, 0, -.08, 0, .4, .8, 1.3);
      // Patitas anchas
      esfera(this.cuerpo, .13, naranja, lado * .16, .04, .12, 1, .25, 1.4);
      cilindro(this.cuerpo, .03, .03, .22, naranja, lado * .16, .14, 0);
    }

    this.cabeza.position.set(0, .98, .26);
    esfera(this.cabeza, .29, amarillo);
    esfera(this.cabeza, .15, naranja, 0, -.08, .27, 1.3, .42, 1.2);      // pico plano
    esfera(this.cabeza, .06, amarillo, 0, .3, -.02, 1, 1.8, 1);          // copete
    this.ojo(-.12, .07, .21, .09, -.35);
    this.ojo(.12, .07, .21, .09, .35);
    this.mejillas(.2, -.05, .18, .055);
  }

  construir_perro() {
    const caramelo = mat('#d9a066'), crema = mat('#fbe3c4'), cafe = mat('#8b5a33'), negro = mat('#231a1c', { clearcoat: 1, roughness: .2 });
    esfera(this.cuerpo, .46, caramelo, 0, .66, 0, 1, .9, 1.25);
    esfera(this.cuerpo, .3, crema, 0, .62, .35, 1, 1, .7);
    this.patas([[-.26, .36], [.26, .36], [-.26, -.36], [.26, -.36]], .1, .38, caramelo, crema);
    // Collar con plaquita
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.26, .045, 8, 24), mat('#3f8fe0'));
    collar.position.set(0, .98, .42);
    collar.rotation.x = 1.25;
    this.cuerpo.add(collar);
    esfera(this.cuerpo, .07, mat('#ffcf3a', { metalness: .8, roughness: .25 }), 0, .86, .64, 1, 1, .5);
    // Cola que se mueve rapidísimo (¡está feliz!)
    const cola = this.resorte(this.cuerpo, 0, .82, -.55, { eje: 'z', vaiven: .6, velocidadVaiven: 14 });
    const palo = cilindro(cola, .045, .03, .38, caramelo, 0, .17, -.06);
    palo.rotation.x = -.4;

    this.cabeza.position.set(0, 1.18, .55);
    esfera(this.cabeza, .42, caramelo);
    esfera(this.cabeza, .16, cafe, .18, .14, .3, 1, 1, .5).rotation.y = .5;   // manchita en el ojo
    esfera(this.cabeza, .22, crema, 0, -.12, .32, 1.1, .85, 1.05);          // hocico
    esfera(this.cabeza, .08, negro, 0, -.02, .53, 1.2, .9, .9);             // nariz
    const lengua = esfera(this.cabeza, .08, mat('#ff6f91'), 0, -.27, .44, 1, .5, .9);
    lengua.rotation.x = .5;
    this.lengua = lengua;
    for (const lado of [-1, 1]) {
      // Orejas largas y caídas: ¡rebotan muchísimo!
      const oreja = this.resorte(this.cabeza, lado * .34, .22, 0, { eje: 'z', base: lado * .15, rigidez: 45, amortiguacion: 3.5, sensibilidad: lado * 4 });
      esfera(oreja, .16, cafe, lado * .05, -.22, 0, .6, 1.6, .9);
    }
    this.ojo(-.16, .1, .33, .12, -.25);
    this.ojo(.16, .1, .33, .12, .25);
    this.mejillas(.28, -.1, .28, .07);
  }

  // ---------------------------------------------------------
  // ACCIONES
  // ---------------------------------------------------------
  golpe(fuerza) { this.velEstiramiento += fuerza; }

  // Salto con anticipación (se agacha), estirón y aplastón
  async saltar(altura = .7) {
    this.estiramientoMeta = .72;
    await esperar(.12);
    this.estiramientoMeta = 1;
    this.golpe(6);
    await animar(.3 + altura * .3, t => { this.saltoY = altura * 4 * t * (1 - t); }, { curva: suavizar.lineal });
    this.saltoY = 0;
    this.golpe(-5.5);
  }

  bailar(segundos = 2.5) { this.bailarHasta = this.tiempo + segundos; }

  // "No": sacude la cabeza (cuando el niño toca otro animal)
  sacudir() { this.sacudida = 1; }

  mirarHacia(punto) {
    const p = this.raiz.position;
    this.rumboBase = Math.atan2(punto.x - p.x, punto.z - p.z);
  }

  // Aparece con un "pop" elástico
  // Tamaño final (algunas zonas los quieren más grandes)
  get escalaFinal() { return this.datos.escala * (this.escalaExtra || 1); }

  async aparecer(retraso = 0) {
    this.raiz.visible = true;
    const escala = this.escalaFinal;
    this.raiz.scale.setScalar(.001);
    await animar(.6, t => this.raiz.scale.setScalar(Math.max(.001, t * escala)), { curva: suavizar.rebotito, retraso });
  }

  // ---------------------------------------------------------
  actualizar(dt, t) {
    this.tiempo = t;
    const bailando = t < this.bailarHasta;

    // Parpadeo
    this.proximoParpadeo -= dt;
    if (this.proximoParpadeo <= 0) { this.parpadeo = .14; this.proximoParpadeo = 2 + Math.random() * 3; }
    this.parpadeo = Math.max(0, this.parpadeo - dt);
    const ojoY = this.parpadeo > 0 ? .1 : 1;
    for (const ojo of this.ojos) ojo.scale.y += (ojoY - ojo.scale.y) * Math.min(1, dt * 40);

    // Squash & stretch con resorte
    if (bailando) this.estiramientoMeta = 1 + Math.sin(t * 9 + this.fase) * .1;
    else if (this.estiramientoMeta !== .72) this.estiramientoMeta = 1;
    const fuerza = -160 * (this.estiramiento - this.estiramientoMeta) - 8 * this.velEstiramiento;
    this.velEstiramiento += fuerza * dt;
    this.estiramiento += this.velEstiramiento * dt;
    const s = Math.min(1.4, Math.max(.65, this.estiramiento));
    const respiracion = 1 + Math.sin(t * 2 + this.fase) * .015;
    this.cuerpo.scale.set(1 / Math.sqrt(s), s * respiracion, 1 / Math.sqrt(s));

    // Saltitos al bailar + vaivén de lado a lado
    const brinco = bailando ? Math.abs(Math.sin(t * 4.5 + this.fase)) * .3 : 0;
    this.cuerpo.position.y = this.saltoY + brinco;
    this.cuerpo.rotation.z = bailando ? Math.sin(t * 4.5 + this.fase) * .18 : 0;
    this.raiz.rotation.y = this.rumboBase + (bailando ? Math.sin(t * 2.25 + this.fase) * .5 : 0);

    // Cabeza: se mueve suave (vida) y dice "no" si lo sacudimos
    this.sacudida = Math.max(0, this.sacudida - dt * 1.4);
    this.cabeza.rotation.y = Math.sin(t * .7 + this.fase) * .12 + Math.sin(this.sacudida * 25) * .45 * this.sacudida;
    this.cabeza.rotation.x = Math.sin(t * 1.1 + this.fase) * .05;
    this.cabeza.rotation.z = Math.sin(t * .9 + this.fase * 2) * .06;

    // Resortes (follow-through): reaccionan a la velocidad vertical
    const altura = this.cuerpo.position.y;
    const subida = (altura - this.alturaAnterior) / Math.max(dt, .001);
    this.alturaAnterior = altura;
    for (const r of this.resortes) {
      const meta = r.base + Math.sin(t * r.velocidadVaiven + this.fase) * r.vaiven * (bailando ? 1.6 : 1);
      const f = -r.rigidez * (r.angulo - meta) - r.amortiguacion * r.velocidad - subida * r.sensibilidad * 2.2;
      r.velocidad += f * dt;
      r.angulo += r.velocidad * dt;
      r.angulo = Math.max(-1.4, Math.min(1.4, r.angulo));
      r.pivote.rotation[r.eje] = r.angulo;
    }
    if (this.lengua) this.lengua.scale.y = .04 + Math.abs(Math.sin(t * 6)) * .02;
  }
}
