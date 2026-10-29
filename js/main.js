// =========================================================
// main.js — el "director" del juego.
//
// Crea todas las piezas y decide qué pasa en cada momento.
// El juego siempre está en UN estado:
//
//   'inicio'   → pantalla "Toca para empezar"
//   'intro'    → película de llegada de Pip
//   'titulo'   → título animado y botón ¡JUGAR!
//   'mapa'     → vista de la isla con los 3 carteles
//   'viajando' → Pip y la cámara van de un lugar a otro
//   'zona'     → jugando en el corral, el huerto o el granero
//   'final'    → fiesta final y créditos
// =========================================================
import * as THREE from 'three';
import { Escena, ZONAS, PLAZA } from './escena.js';
import { Pip } from './pip.js';
import { SistemaAudio } from './audio.js';
import { UI } from './ui.js';
import { Intro } from './intro.js';
import { Mapa } from './mapa.js';
import { Efectos } from './efectos.js';
import { Corral } from './zonas/corral.js';
import { Huerto } from './zonas/huerto.js';
import { Granero } from './zonas/granero.js';
import { Final } from './final.js';
import { actualizarAnimaciones, esperar } from './utilidades.js';

// ---------- Piezas del juego ----------
const ui = new UI();
const audio = new SistemaAudio();
const escena = new Escena(document.getElementById('lienzo3d'));
const pip = new Pip({ audio, ui });
escena.scene.add(pip.raiz);
escena.activarSombras(pip.raiz);
pip.colocar(PLAZA);

const efectos = new Efectos(escena);
const intro = new Intro({ escena, pip, audio, ui });
const mapa = new Mapa({ escena, alTocarZona: indice => entrarZona(indice) });
const contexto = { escena, pip, audio, ui, efectos };
const zonas = [new Corral(contexto), new Huerto(contexto), new Granero(contexto)];
const final = new Final({ ...contexto, corral: zonas[0] });
escena.ajustarEntorno();

// ---------- Estado del juego ----------
const juego = {
  estado: 'inicio',
  zonasCompletadas: 0,     // cuántas zonas terminó el niño (0 a 3)
  zonaActual: -1,
  primeraVezMapa: true,
  ocupado: false           // true mientras Pip hace algo que no se debe interrumpir
};

// Posiciones de cámara importantes
const VISTA_MAPA = { pos: new THREE.Vector3(0, 22, 29), mira: new THREE.Vector3(0, -.5, -1.5) };

// =========================================================
// 1. TOCA PARA EMPEZAR
// =========================================================
ui.el.botonEmpezar.addEventListener('click', () => {
  if (juego.estado !== 'inicio') return;
  audio.iniciar();
  audio.efecto('boton');
  ui.ocultar('inicio');
  ui.mostrar('barra');
  comenzarIntro();
});

// =========================================================
// 2. INTRO CINEMATOGRÁFICA
// =========================================================
async function comenzarIntro() {
  juego.estado = 'intro';
  ui.mostrar('saltar');
  await intro.reproducir();
  if (juego.estado === 'intro' && !intro.cancelada) irATitulo();
}

ui.el.saltar.addEventListener('click', () => {
  if (juego.estado !== 'intro') return;
  audio.efecto('boton');
  intro.saltar();
  irATitulo();
});

// =========================================================
// 3. TÍTULO ANIMADO
// =========================================================
function irATitulo() {
  juego.estado = 'titulo';
  ui.ocultar('saltar');
  ui.ocultarGlobo();
  ui.mostrarTitulo();
  pip.reiniciarPose();
  pip.fijarEmocion('feliz');
  escena.balanceo = 1;
  // La cámara empieza a girar lentamente alrededor de la isla (ver bucle)
  juego.anguloOrbita = Math.atan2(escena.camBase.pos.x, escena.camBase.pos.z);
  juego.alturaOrbita = escena.camBase.pos.y;
  juego.radioOrbita = Math.hypot(escena.camBase.pos.x, escena.camBase.pos.z);
  audio.efecto('aparecer');
}

ui.el.botonJugar.addEventListener('click', () => {
  if (juego.estado !== 'titulo') return;
  audio.iniciar();
  audio.efecto('boton');
  ui.ocultar('titulo');
  irAlMapa();
});

// =========================================================
// 4. MAPA DE LA ISLA
// =========================================================
async function irAlMapa() {
  juego.estado = 'viajando';
  juego.ocupado = true;
  ui.ocultar('casa');
  ui.ocultar('titulo');
  ui.ocultarGlobo();
  mapa.actualizarEstados(juego.zonasCompletadas);

  // Pip vuelve a la plaza (si no está ahí) mientras la cámara sube
  const tareas = [escena.moverCamara(VISTA_MAPA.pos, VISTA_MAPA.mira, 2.4, { arco: 2 })];
  if (pip.raiz.position.distanceTo(PLAZA) > .5) tareas.push(pip.volarA(PLAZA, 2.2));
  await Promise.all(tareas);
  if (juego.estado !== 'viajando') return;

  juego.estado = 'mapa';
  juego.ocupado = false;
  pip.reiniciarPose();
  pip.mirarHacia(escena.camera.position);
  mapa.mostrar();

  const siguiente = ZONAS[juego.zonasCompletadas];
  if (juego.primeraVezMapa) {
    juego.primeraVezMapa = false;
    pip.saludar(2);
    await pip.decir(`¡Esta es la granja mágica! Toca el ${siguiente.nombre.toLowerCase()} para empezar.`, 'feliz');
  } else if (siguiente) {
    await pip.decir(`¡Muy bien! Ahora vamos al ${siguiente.nombre.toLowerCase()}. ¡Tócalo!`, 'feliz');
  }
}

// El niño tocó un cartel del mapa
async function entrarZona(indice) {
  if (juego.estado !== 'mapa' || juego.ocupado) return;
  const zona = ZONAS[indice];

  // Zona bloqueada: Pip lo explica con cariño
  if (mapa.estaBloqueada(indice)) {
    juego.ocupado = true;
    audio.efecto('bloqueado');
    const siguiente = ZONAS[juego.zonasCompletadas];
    pip.negar();
    await pip.decir(`Esa zona todavía duerme. ¡Primero vamos al ${siguiente.nombre.toLowerCase()}!`, 'normal');
    juego.ocupado = false;
    return;
  }

  // ¡Pip vuela a la zona!
  juego.estado = 'viajando';
  juego.ocupado = true;
  juego.zonaActual = indice;
  audio.efecto('boton');
  mapa.ocultar();
  pip.fijarEmocion('feliz');
  pip.decir(`¡Vamos al ${zona.nombre.toLowerCase()}!`);
  await Promise.all([
    pip.volarA(zona.pip, 2.6),
    escena.moverCamara(zona.camara.pos, zona.camara.mira, 2.8, { arco: 3 })
  ]);
  if (juego.estado !== 'viajando') return;

  juego.estado = 'zona';
  juego.ocupado = false;
  ui.mostrar('casa');
  pip.mirarHacia(escena.camera.position);

  // ---- ¡A jugar! (cada zona devuelve true si el niño la terminó) ----
  const completada = await zonas[indice].iniciar();
  if (!completada || juego.estado !== 'zona' || juego.zonaActual !== indice) return;
  zonas[indice].detener();
  juego.zonasCompletadas = Math.max(juego.zonasCompletadas, indice + 1);

  if (juego.zonasCompletadas >= ZONAS.length && indice === ZONAS.length - 1) {
    comenzarFinal();
  } else {
    irAlMapa();
  }
}

// Botón 🏠: volver al mapa desde cualquier zona
ui.el.casa.addEventListener('click', () => {
  if (juego.estado !== 'zona') return;
  audio.efecto('boton');
  zonas[juego.zonaActual]?.detener();
  juego.zonaActual = -1;
  irAlMapa();
});

// =========================================================
// 5. FINAL
// =========================================================
async function comenzarFinal() {
  juego.estado = 'final';
  juego.zonaActual = -1;
  ui.ocultar('casa');
  await final.reproducir();
}

ui.el.otraVez.addEventListener('click', () => {
  if (juego.estado !== 'final') return;
  audio.efecto('boton');
  final.detener();
  // Todo vuelve al principio (Pip apaga sus luces para volver a jugar)
  juego.zonasCompletadas = 0;
  juego.primeraVezMapa = true;
  pip.apagarLuces();
  pip.reiniciarPose();
  irATitulo();
});

// =========================================================
// BOTONES DE MÚSICA Y CALIDAD
// =========================================================
ui.el.musica.addEventListener('click', () => {
  audio.iniciar();
  const activa = audio.alternarMusica();
  ui.fijarMusica(activa);
  audio.efecto('boton');
});

ui.el.calidad.addEventListener('click', () => {
  cambiarCalidad(!escena.calidadAlta);
  audio.efecto('boton');
});

function cambiarCalidad(alta) {
  escena.fijarCalidad(alta);
  ui.fijarCalidad(alta);
  ui.aviso(alta ? '✨ Calidad alta' : '🐢 Calidad baja (más fluido)');
}

// =========================================================
// TOCAR EL MUNDO 3D (mouse o dedo)
// =========================================================
pip.raiz.userData.alTocar = () => {
  // Cosquillas: si el niño toca a Pip en el título o el mapa, se ríe y festeja.
  // En las zonas devolvemos false para que el toque llegue a lo que está detrás.
  if (juego.ocupado || !['titulo', 'mapa'].includes(juego.estado)) return false;
  juego.ocupado = true;
  audio.efecto('risa');
  pip.mirarHacia(escena.camera.position);
  pip.celebrar().then(() => {
    pip.fijarEmocion('feliz');
    juego.ocupado = false;
  });
  return true;
};
escena.registrarTocable(pip.raiz);

escena.lienzo.addEventListener('pointerdown', evento => {
  audio.iniciar();        // por si el audio se suspendió
  const zona = zonas[juego.zonaActual];
  if (juego.estado === 'zona' && zona?.alMoverPuntero) zona.alMoverPuntero(evento.clientX, evento.clientY);
  escena.tocarEn(evento.clientX, evento.clientY);
});
// La linterna del granero sigue al dedo o al mouse
escena.lienzo.addEventListener('pointermove', evento => {
  const zona = zonas[juego.zonaActual];
  if (juego.estado === 'zona' && zona?.alMoverPuntero) zona.alMoverPuntero(evento.clientX, evento.clientY);
});

// =========================================================
// BUCLE PRINCIPAL (se repite ~60 veces por segundo)
// =========================================================
const reloj = new THREE.Clock();
let tiempo = 0;
const medidorFps = { cuadros: 0, tiempo: 0, revisado: false };
// Con "?prueba" en la dirección, el tiempo no se frena en computadoras muy lentas
const MAXIMO_DT = new URLSearchParams(location.search).has('prueba') ? .4 : 1 / 20;

function cuadro() {
  // dt = segundos desde el cuadro anterior (limitado para que nada "salte")
  const dt = Math.min(reloj.getDelta(), MAXIMO_DT);
  tiempo += dt;

  actualizarAnimaciones(dt);

  // En el título, la cámara gira lentamente alrededor de la isla
  if (juego.estado === 'titulo') {
    juego.anguloOrbita += dt * .07;
    juego.radioOrbita += (24 - juego.radioOrbita) * (1 - Math.exp(-dt * .6));
    juego.alturaOrbita += (8 - juego.alturaOrbita) * (1 - Math.exp(-dt * .6));
    escena.camBase.pos.set(Math.sin(juego.anguloOrbita) * juego.radioOrbita, juego.alturaOrbita, Math.cos(juego.anguloOrbita) * juego.radioOrbita);
    escena.camBase.mira.lerp(new THREE.Vector3(0, 1.2, 0), 1 - Math.exp(-dt * 1.5));
    pip.mirarHacia(escena.camera.position);
    if (Math.random() < dt * .25) pip.saludar(1.6);
  }

  pip.actualizar(dt, tiempo);
  intro.actualizar(dt, tiempo);
  mapa.actualizar(dt, tiempo);
  for (const zona of zonas) zona.actualizar(dt, tiempo);
  final.actualizar(dt, tiempo);
  efectos.actualizar(dt);
  escena.actualizar(dt, tiempo);

  revisarRendimiento(dt);
  if (panelPrueba) panelPrueba.textContent = `estado: ${juego.estado} · zonas: ${juego.zonasCompletadas} · t: ${tiempo.toFixed(1)} · cuadros: ${++cuadrosTotales}` + erroresPrueba;
}

// Si la computadora va lenta en el mapa, bajamos la calidad automáticamente
function revisarRendimiento(dt) {
  if (medidorFps.revisado || juego.estado !== 'mapa' || !escena.calidadAlta) return;
  medidorFps.cuadros++;
  medidorFps.tiempo += dt;
  if (medidorFps.tiempo >= 4) {
    medidorFps.revisado = true;
    const fps = medidorFps.cuadros / medidorFps.tiempo;
    if (fps < 38) cambiarCalidad(false);
  }
}

// Panel de diagnóstico (solo con "?prueba" en la dirección)
let panelPrueba = null, cuadrosTotales = 0, erroresPrueba = '';
if (MAXIMO_DT > .1) {
  panelPrueba = document.createElement('pre');
  panelPrueba.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;margin:0;padding:6px 10px;background:#000a;color:#0f0;font:12px monospace;white-space:pre-wrap;max-width:90vw;pointer-events:none';
  document.body.append(panelPrueba);
  const anotar = mensaje => { erroresPrueba += '\n⚠ ' + mensaje; };
  addEventListener('error', e => anotar(e.message + ' @ ' + (e.filename || '').split('/').pop() + ':' + e.lineno));
  addEventListener('unhandledrejection', e => anotar(String(e.reason?.stack || e.reason).slice(0, 300)));
  // Acceso para pruebas automáticas: "tocar" un objeto 3D como lo haría un dedo
  const tocar = objeto => {
    const p = new THREE.Vector3();
    objeto.getWorldPosition(p);
    p.project(escena.camera);
    const x = (p.x + 1) / 2 * innerWidth, y = (1 - p.y) / 2 * innerHeight;
    escena.lienzo.dispatchEvent(new PointerEvent('pointerdown', { clientX: x, clientY: y, bubbles: true }));
    return [Math.round(x), Math.round(y)];
  };
  window.pruebas = { THREE, juego, entrarZona, irAlMapa, comenzarFinal, escena, pip, mapa, zonas, final, tocar };
}

// Preparamos los shaders antes de empezar (evita tirones la primera vez)
escena.renderer.compile(escena.scene, escena.camera);
escena.renderer.setAnimationLoop(cuadro);
ui.fijarMusica(true);
ui.fijarCalidad(true);
ui.listo();
window.pipListo = true;

// ---------- Atajos para la docente / pruebas ----------
// pip_granja.html#intro  → empieza la intro sin tocar (sin sonido)
// pip_granja.html#titulo → salta directo al título
// pip_granja.html#mapa   → salta directo al mapa
if (location.hash === '#intro') {
  ui.ocultar('inicio');
  ui.mostrar('barra');
  comenzarIntro();
} else if (location.hash === '#mapa' || location.hash === '#titulo') {
  ui.ocultar('inicio');
  ui.mostrar('barra');
  juego.estado = 'intro';
  intro.saltar();
  irATitulo();
  if (location.hash === '#mapa') {
    ui.ocultar('titulo');
    esperar(.1).then(irAlMapa);
  }
}
