// =========================================================
// utilidades.js — herramientas de animación que usan todos
// los demás archivos.
//
// La clave del estilo Pixar es que NADA se mueve a velocidad
// constante: todo acelera y frena suavemente ("easing").
// =========================================================

// ---------- Curvas de suavizado (easing) ----------
// Reciben un número t entre 0 y 1 y devuelven otro entre 0 y 1.
export const suavizar = {
  lineal: t => t,
  entradaSalida: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  salida: t => 1 - Math.pow(1 - t, 3),
  entrada: t => t * t * t,
  // Se pasa un poquito y regresa: da sensación de "resorte"
  rebotito: t => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  // Rebota como una pelota al caer
  pelota: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375;
    return n * (t -= 2.625 / d) * t + .984375;
  },
  elastico: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * Math.PI / 3)) + 1
};

export const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
export const mezclar = (a, b, t) => a + (b - a) * t;
export const azar = (min, max) => min + Math.random() * (max - min);
export const azarEntero = (min, max) => Math.floor(azar(min, max + 1));

// Suavizado que no depende de los fps: acerca "actual" a "meta"
// un poquito en cada cuadro (como un resorte con amortiguación).
export function acercar(actual, meta, rapidez, dt) {
  return mezclar(actual, meta, 1 - Math.exp(-rapidez * dt));
}

// ---------- Interpoladores (tweens) ----------
// Un "tween" anima un valor desde un inicio hasta un final
// durante cierto tiempo. Los guardamos en una lista y los
// actualizamos en cada cuadro.
const tweens = new Set();

/**
 * Anima con una curva de suavizado.
 * @param {number} duracion  segundos
 * @param {(t:number)=>void} alActualizar  recibe t ya suavizado (0→1)
 * @param {object} opciones  { curva, retraso }
 * @returns {Promise} se cumple cuando la animación termina
 */
export function animar(duracion, alActualizar, { curva = suavizar.entradaSalida, retraso = 0 } = {}) {
  return new Promise(resolver => {
    tweens.add({ duracion, alActualizar, curva, retraso, tiempo: 0, resolver });
  });
}

// Espera unos segundos (pero respetando la pausa del juego)
export const esperar = segundos => animar(segundos, () => {}, { curva: suavizar.lineal });

// Cancela todas las animaciones (por ejemplo, al saltar la intro)
export function cancelarAnimaciones() {
  for (const tween of tweens) tween.resolver();
  tweens.clear();
}

// Se llama una vez por cuadro desde main.js
export function actualizarAnimaciones(dt) {
  for (const tween of tweens) {
    if (tween.retraso > 0) {
      tween.retraso -= dt;
      continue;
    }
    tween.tiempo += dt;
    const t = limitar(tween.tiempo / tween.duracion, 0, 1);
    tween.alActualizar(tween.curva(t));
    if (t >= 1) {
      tweens.delete(tween);
      tween.resolver();
    }
  }
}

// ---------- Texturas dibujadas con código ----------
// Crea un <canvas> para dibujar con 2D y usarlo como textura 3D.
export function crearLienzo(ancho, alto) {
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  return { lienzo, ctx: lienzo.getContext('2d') };
}

// Rectángulo con esquinas redondas en un canvas 2D
export function rectanguloRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
