// =========================================================
// frutas.js — manzana, plátano, uvas, naranja, sandía y fresa.
//
// • crearFruta(tipo): la fruta en 3D (brillante, como de juguete)
// • dibujarSilueta(ctx, tipo, ...): su "sombrita" en 2D para el espejo
// • crearPlanta(tipo): una planta que CRECE y da esa fruta
// =========================================================
import * as THREE from 'three';
import { animar, suavizar, esperar } from './utilidades.js';

export const TIPOS_FRUTAS = ['manzana', 'platano', 'uvas', 'naranja', 'sandia', 'fresa'];

// "color" sirve para no poner dos frutas del mismo color en una pregunta de color
export const DATOS_FRUTAS = {
  manzana: { nombre: 'manzana', conArticulo: 'la manzana', color: 'rojo', hex: '#e8323c', pista: 'roja y redonda' },
  platano: { nombre: 'plátano', conArticulo: 'el plátano', color: 'amarillo', hex: '#ffd23f', pista: 'amarilla y larga' },
  uvas: { nombre: 'uvas', conArticulo: 'las uvas', color: 'morado', hex: '#8e44ad', pista: 'morada y viene en racimo' },
  naranja: { nombre: 'naranja', conArticulo: 'la naranja', color: 'naranja', hex: '#ff8c1a', pista: 'anaranjada y redonda' },
  sandia: { nombre: 'sandía', conArticulo: 'la sandía', color: 'verde', hex: '#3cae4a', pista: 'grande, verde por fuera y roja por dentro' },
  fresa: { nombre: 'fresa', conArticulo: 'la fresa', color: 'rojo', hex: '#ff3b5c', pista: 'roja, pequeñita y con semillitas' }
};

const brillante = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, roughness: .3, clearcoat: .8, clearcoatRoughness: .15, ...extra });
const matTallo = new THREE.MeshStandardMaterial({ color: '#7a4e2a', roughness: .8 });
const matHoja = new THREE.MeshPhysicalMaterial({ color: '#4fbf4a', roughness: .45, clearcoat: .5, side: THREE.DoubleSide });

// Hoja: una esfera aplastada en forma de gota
function hoja(padre, x, y, z, escala = 1, rotZ = 0) {
  const h = new THREE.Mesh(new THREE.SphereGeometry(.1, 14, 10), matHoja);
  h.scale.set(1.6 * escala, .35 * escala, .8 * escala);
  h.position.set(x, y, z);
  h.rotation.z = rotZ;
  padre.add(h);
  return h;
}

// Perfil para LatheGeometry (como un torno de alfarero)
const perfil = puntos => puntos.map(([x, y]) => new THREE.Vector2(x, y));

/**
 * Crea una fruta en 3D. Mide más o menos 0.6 de alto
 * (la sandía es más grande) y se apoya en y = 0.
 */
export function crearFruta(tipo) {
  const fruta = new THREE.Group();
  fruta.userData.tipo = tipo;
  switch (tipo) {
    case 'manzana': {
      const cuerpo = new THREE.Mesh(new THREE.LatheGeometry(perfil([
        [0, .04], [.16, 0], [.27, .08], [.31, .22], [.28, .4], [.18, .5], [.06, .47], [0, .43]
      ]), 32), brillante('#e8323c'));
      fruta.add(cuerpo);
      const tallo = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, .16, 8), matTallo);
      tallo.position.set(.01, .52, 0);
      tallo.rotation.z = -.2;
      fruta.add(tallo);
      hoja(fruta, .1, .56, 0, 1, .5);
      break;
    }
    case 'platano': {
      // Un tubo curvo que se afina en las puntas
      const curva = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-.32, .42, 0), new THREE.Vector3(0, -.05, 0), new THREE.Vector3(.34, .4, 0));
      const geo = new THREE.TubeGeometry(curva, 30, .1, 14, false);
      const pos = geo.attributes.position;
      const centro = new THREE.Vector3();
      // Afinamos las puntas acercando los vértices al centro de la curva
      for (let i = 0; i < pos.count; i++) {
        const anillo = Math.floor(i / 15);
        const t = anillo / 30;
        const grosor = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) * .75 + .25;
        curva.getPoint(t, centro);
        pos.setXYZ(i, centro.x + (pos.getX(i) - centro.x) * grosor, centro.y + (pos.getY(i) - centro.y) * grosor, centro.z + (pos.getZ(i) - centro.z) * grosor);
      }
      geo.computeVertexNormals();
      const cuerpo = new THREE.Mesh(geo, brillante('#ffd23f'));
      cuerpo.position.y = .05;
      fruta.add(cuerpo);
      for (const x of [-.33, .35]) {
        const punta = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), matTallo);
        punta.position.set(x, x < 0 ? .47 : .45, 0);
        fruta.add(punta);
      }
      break;
    }
    case 'uvas': {
      const morado = brillante('#8e44ad', { roughness: .2 });
      const geoUva = new THREE.SphereGeometry(.085, 16, 12);
      // Racimo: filas que se achican hacia abajo (como un triángulo)
      const filas = [[5, .5], [4, .38], [3, .26], [2, .15], [1, .05]];
      filas.forEach(([cantidad, y], f) => {
        for (let i = 0; i < cantidad; i++) {
          const a = i / cantidad * Math.PI * 2 + f;
          const r = cantidad > 1 ? .045 * cantidad : 0;
          const uva = new THREE.Mesh(geoUva, morado);
          uva.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
          fruta.add(uva);
        }
      });
      const tallo = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .14, 8), matTallo);
      tallo.position.y = .62;
      fruta.add(tallo);
      hoja(fruta, .1, .62, 0, 1.1, .4);
      break;
    }
    case 'naranja': {
      const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(.29, 32, 24), brillante('#ff8c1a', { roughness: .45, clearcoat: .4 }));
      cuerpo.position.y = .28;
      cuerpo.scale.y = .95;
      fruta.add(cuerpo);
      const punto = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 6), new THREE.MeshStandardMaterial({ color: '#5a8f2a' }));
      punto.position.y = .56;
      fruta.add(punto);
      hoja(fruta, .09, .57, 0, 1, .3);
      break;
    }
    case 'sandia': {
      // Rayitas verdes dibujadas en una textura
      const lienzo = document.createElement('canvas');
      lienzo.width = 256; lienzo.height = 128;
      const ctx = lienzo.getContext('2d');
      ctx.fillStyle = '#5cc95a';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#237a33';
      for (let i = 0; i < 10; i++) {
        ctx.beginPath();
        for (let y = 0; y <= 128; y += 8) ctx.lineTo(i * 25.6 + Math.sin(y * .15) * 4, y);
        for (let y = 128; y >= 0; y -= 8) ctx.lineTo(i * 25.6 + 10 + Math.sin(y * .15) * 4, y);
        ctx.fill();
      }
      const textura = new THREE.CanvasTexture(lienzo);
      textura.colorSpace = THREE.SRGBColorSpace;
      const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(.4, 32, 24), brillante('#ffffff', { map: textura }));
      cuerpo.scale.set(1.25, .85, .95);
      cuerpo.position.y = .34;
      fruta.add(cuerpo);
      // Una tajada roja al lado (¡roja por dentro!)
      const tajada = new THREE.Group();
      const corte = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .07, 24, 1, false, 0, Math.PI), [
        brillante('#2f9a3e'), brillante('#ff4d5e'), brillante('#ff4d5e')
      ]);
      corte.rotation.x = Math.PI / 2;
      tajada.add(corte);
      for (let i = 0; i < 5; i++) {
        const semilla = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 4), new THREE.MeshStandardMaterial({ color: '#1b1b1b' }));
        const a = .5 + i * .5;
        semilla.position.set(Math.cos(a) * .13, Math.sin(a) * .13, .04);
        tajada.add(semilla);
      }
      tajada.position.set(.5, .03, .25);
      tajada.rotation.set(-1.2, 0, 0);
      fruta.add(tajada);
      break;
    }
    case 'fresa': {
      const cuerpo = new THREE.Mesh(new THREE.LatheGeometry(perfil([
        [0, 0], [.08, .04], [.17, .16], [.22, .3], [.21, .4], [.12, .46], [0, .47]
      ]), 28), brillante('#ff3b5c'));
      fruta.add(cuerpo);
      // Semillitas amarillas por fuera
      const matSemilla = new THREE.MeshStandardMaterial({ color: '#ffe066' });
      for (let i = 0; i < 26; i++) {
        const y = .08 + (i % 6) * .06;
        const a = i * 2.4;
        const r = [.1, .16, .2, .215, .21, .18][i % 6];
        const semilla = new THREE.Mesh(new THREE.SphereGeometry(.014, 6, 4), matSemilla);
        semilla.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
        fruta.add(semilla);
      }
      // Coronita de hojas
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2;
        const h = hoja(fruta, Math.cos(a) * .1, .46, Math.sin(a) * .1, .8);
        h.rotation.y = -a;
        h.rotation.z = .3;
      }
      break;
    }
  }
  fruta.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return fruta;
}

// ---------------------------------------------------------
// SILUETAS (sombritas negras para el espejo mágico)
// ---------------------------------------------------------
export function dibujarSilueta(ctx, tipo, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.beginPath();
  switch (tipo) {
    case 'manzana':
      ctx.moveTo(0, -60);
      ctx.bezierCurveTo(40, -95, 110, -60, 95, 10);
      ctx.bezierCurveTo(85, 70, 40, 100, 0, 80);
      ctx.bezierCurveTo(-40, 100, -85, 70, -95, 10);
      ctx.bezierCurveTo(-110, -60, -40, -95, 0, -60);
      ctx.fill();
      ctx.fillRect(-6, -105, 12, 50);
      ctx.beginPath();
      ctx.ellipse(32, -95, 30, 13, -.4, 0, Math.PI * 2);
      break;
    case 'platano':
      ctx.moveTo(-110, -60);
      ctx.quadraticCurveTo(-60, 95, 115, -45);
      ctx.quadraticCurveTo(120, -60, 105, -55);
      ctx.quadraticCurveTo(-40, 45, -90, -70);
      ctx.closePath();
      break;
    case 'uvas':
      for (const [x, y] of [[-60, -40], [-20, -45], [20, -45], [60, -40], [-40, 0], [0, 0], [40, 0], [-20, 40], [20, 40], [0, 78]]) {
        ctx.moveTo(x + 28, y);
        ctx.arc(x, y, 28, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.fillRect(-5, -100, 10, 45);
      ctx.beginPath();
      ctx.ellipse(30, -88, 32, 14, -.3, 0, Math.PI * 2);
      break;
    case 'naranja':
      ctx.arc(0, 5, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(25, -92, 28, 12, -.4, 0, Math.PI * 2);
      break;
    case 'sandia':
      ctx.ellipse(0, 0, 120, 82, 0, 0, Math.PI * 2);
      break;
    case 'fresa':
      ctx.moveTo(0, 95);
      ctx.bezierCurveTo(-60, 60, -95, -10, -75, -50);
      ctx.bezierCurveTo(-55, -80, 55, -80, 75, -50);
      ctx.bezierCurveTo(95, -10, 60, 60, 0, 95);
      ctx.fill();
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * .55;
        ctx.ellipse(Math.cos(a) * 35, -70 + Math.sin(a) * 8 - 10, 30, 11, a, 0, Math.PI * 2);
      }
      break;
  }
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------
// PLANTA QUE CRECE en tiempo real y da frutos
// ---------------------------------------------------------
export function crearPlanta(tipo) {
  const planta = new THREE.Group();
  const baja = tipo === 'sandia' || tipo === 'fresa';     // plantas rastreras
  const altura = baja ? .45 : 1.3;

  // Montoncito de tierra
  const tierra = new THREE.Mesh(new THREE.SphereGeometry(.38, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 1 }));
  tierra.scale.y = .35;
  planta.add(tierra);

  // Tallo (crece desde abajo)
  const tallo = new THREE.Group();
  const palo = new THREE.Mesh(new THREE.CylinderGeometry(.045, .07, altura, 10), new THREE.MeshStandardMaterial({ color: '#3f9b3c', roughness: .6 }));
  palo.position.y = altura / 2;
  tallo.add(palo);
  tallo.scale.set(1, .001, 1);
  planta.add(tallo);

  // Hojas en espiral a lo largo del tallo
  const hojas = [];
  const cantidadHojas = baja ? 5 : 6;
  for (let i = 0; i < cantidadHojas; i++) {
    const soporte = new THREE.Group();
    const a = i * 2.4;
    soporte.position.y = baja ? .1 : .25 + i * (altura - .3) / cantidadHojas;
    soporte.rotation.y = a;
    const h = hoja(soporte, .2, 0, 0, baja ? 2.2 : 1.8, .3);
    h.material = matHoja;
    soporte.scale.setScalar(.001);
    planta.add(soporte);
    hojas.push(soporte);
  }

  // Frutos (copias pequeñas de la fruta)
  const frutos = [];
  const lugares = baja
    ? [[.4, 0, .15], [-.35, 0, .2], [.05, 0, -.4]]
    : [[.32, altura * .75, .1], [-.3, altura * .6, .12], [.05, altura * .95, -.25]];
  const tamano = tipo === 'sandia' ? .55 : .55;
  for (const [x, y, z] of lugares) {
    const fruto = crearFruta(tipo);
    fruto.position.set(x, y - (baja ? 0 : .25), z);
    fruto.userData.escala = tamano;
    fruto.scale.setScalar(.001);
    planta.add(fruto);
    frutos.push(fruto);
  }
  planta.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // Animación de crecimiento (devuelve una promesa)
  planta.userData.crecer = async () => {
    await animar(1.1, t => tallo.scale.set(1, Math.max(.001, t), 1), { curva: suavizar.rebotito });
    hojas.forEach((h, i) => animar(.6, t => h.scale.setScalar(Math.max(.001, t)), { curva: suavizar.elastico, retraso: i * .1 }));
    await esperar(.5);
    for (const fruto of frutos) {
      animar(.7, t => fruto.scale.setScalar(Math.max(.001, t * fruto.userData.escala)), { curva: suavizar.elastico });
      await esperar(.22);
    }
    await esperar(.5);
  };
  // Se mece con el viento
  planta.userData.mecer = t => { tallo.rotation.z = Math.sin(t * 1.5) * .05; };
  return planta;
}
