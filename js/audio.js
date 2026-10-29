// =========================================================
// audio.js — todos los sonidos se FABRICAN con código
// (Web Audio API): no hay archivos de sonido.
//
//   • música alegre de fondo (melodía + bajo + acordes + percusión)
//   • efectos: saltos, pop, brillo, cohete, etc.
//   • voz de Pip en español con speechSynthesis
//
// Los navegadores solo dejan sonar audio después de un toque
// del usuario; por eso existe la pantalla "Toca para empezar".
// =========================================================

const midiAFrecuencia = nota => 440 * Math.pow(2, (nota - 69) / 12);

// ---------- Música: 8 compases en Do mayor, alegre y saltarina ----------
const TEMPO = 112;
// Cada número es una nota (60 = Do central); 0 = silencio. 8 pasos por compás.
const MELODIA = [
  72, 0, 76, 0, 79, 0, 76, 74,     // Do
  74, 0, 71, 0, 74, 76, 74, 0,     // Sol
  72, 0, 76, 0, 81, 0, 79, 76,     // La menor
  77, 0, 76, 74, 72, 0, 0, 0,      // Fa
  79, 0, 79, 77, 76, 0, 74, 0,     // Do
  74, 76, 77, 0, 79, 0, 0, 0,      // Sol
  81, 0, 79, 0, 77, 76, 74, 0,     // La menor
  71, 0, 74, 0, 79, 0, 0, 0        // Sol (regresa al inicio)
];
const ACORDES = [
  [48, 60, 64, 67], [43, 55, 59, 62], [45, 57, 60, 64], [41, 53, 57, 60],
  [48, 60, 64, 67], [43, 55, 59, 62], [45, 57, 60, 64], [43, 55, 59, 62]
];

// Voces en español preferidas (las primeras suenan más amigables)
const VOCES_PREFERIDAS = ['sabina', 'dalia', 'paulina', 'helena', 'laura', 'elvira', 'google español de estados unidos', 'google español', 'monica', 'paloma', 'mónica'];

export class SistemaAudio {
  constructor() {
    this.ctx = null;
    this.musicaActiva = true;
    this.voz = null;
    this.elegirVoz();
    if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => this.elegirVoz();
  }

  // Se llama al tocar "Toca para empezar"
  iniciar() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    this.ctx = new Contexto();

    // Cadena: música/efectos → compresor (evita que sature) → parlantes
    this.compresor = this.ctx.createDynamicsCompressor();
    this.compresor.connect(this.ctx.destination);
    this.volumenMusica = this.ctx.createGain();
    this.volumenMusica.gain.value = this.musicaActiva ? .17 : 0;
    this.volumenMusica.connect(this.compresor);
    this.volumenEfectos = this.ctx.createGain();
    this.volumenEfectos.gain.value = .8;
    this.volumenEfectos.connect(this.compresor);

    // Ruido blanco (sirve para viento, humo, percusión)
    const muestras = this.ctx.sampleRate * 2;
    this.ruido = this.ctx.createBuffer(1, muestras, this.ctx.sampleRate);
    const datos = this.ruido.getChannelData(0);
    for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;

    this.iniciarMusica();
  }

  // ---------------------------------------------------------
  // INSTRUMENTOS BÁSICOS
  // ---------------------------------------------------------

  // Una nota con "envolvente": sube rápido y se apaga suave
  nota(frecuencia, inicio, duracion, { tipo = 'triangle', volumen = .2, destino = this.volumenEfectos, ataque = .01, hastaFrecuencia = null, pan = 0 } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(frecuencia, inicio);
    if (hastaFrecuencia) osc.frequency.exponentialRampToValueAtTime(hastaFrecuencia, inicio + duracion);
    env.gain.setValueAtTime(0, inicio);
    env.gain.linearRampToValueAtTime(volumen, inicio + ataque);
    env.gain.exponentialRampToValueAtTime(.0001, inicio + duracion);
    osc.connect(env);
    env.connect(this.conPaneo(destino, pan));
    osc.start(inicio);
    osc.stop(inicio + duracion + .05);
    return osc;
  }

  // Ráfaga de ruido filtrado (percusión, soplidos, humo)
  rafaga(inicio, duracion, { volumen = .2, filtro = 'bandpass', frecuencia = 1000, hastaFrecuencia = null, q = 1, destino = this.volumenEfectos, pan = 0 } = {}) {
    const ctx = this.ctx;
    const fuente = ctx.createBufferSource();
    fuente.buffer = this.ruido;
    const f = ctx.createBiquadFilter();
    f.type = filtro;
    f.frequency.setValueAtTime(frecuencia, inicio);
    if (hastaFrecuencia) f.frequency.exponentialRampToValueAtTime(hastaFrecuencia, inicio + duracion);
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, inicio);
    env.gain.linearRampToValueAtTime(volumen, inicio + Math.min(.02, duracion / 3));
    env.gain.exponentialRampToValueAtTime(.0001, inicio + duracion);
    fuente.connect(f).connect(env).connect(this.conPaneo(destino, pan));
    fuente.start(inicio, Math.random());
    fuente.stop(inicio + duracion + .05);
  }

  // Paneo estéreo: -1 = izquierda, 1 = derecha (se usará en el granero)
  conPaneo(destino, pan) {
    if (!pan || !this.ctx.createStereoPanner) return destino;
    const paneo = this.ctx.createStereoPanner();
    paneo.pan.value = pan;
    paneo.connect(destino);
    return paneo;
  }

  // ---------------------------------------------------------
  // MÚSICA DE FONDO (se programa un poquito por adelantado)
  // ---------------------------------------------------------
  iniciarMusica() {
    this.paso = 0;
    this.proximoPaso = this.ctx.currentTime + .15;
    this.temporizador = setInterval(() => this.programarMusica(), 30);
  }

  programarMusica() {
    const duracionPaso = 60 / TEMPO / 2;   // corcheas
    const ahora = this.ctx.currentTime;
    // Si la pestaña estuvo dormida, no tocamos todas las notas atrasadas juntas
    if (this.proximoPaso < ahora - .1) this.proximoPaso = ahora + .05;
    while (this.proximoPaso < ahora + .2) {
      this.tocarPaso(this.paso, this.proximoPaso, duracionPaso);
      this.proximoPaso += duracionPaso;
      this.paso = (this.paso + 1) % MELODIA.length;
    }
  }

  tocarPaso(paso, tiempo, duracionPaso) {
    const destino = this.volumenMusica;
    const compas = Math.floor(paso / 8);
    const pasoEnCompas = paso % 8;
    const acorde = ACORDES[compas];

    // Bajo saltarín en los tiempos 1 y 3
    if (pasoEnCompas === 0 || pasoEnCompas === 4) {
      const nota = acorde[0] + (pasoEnCompas === 4 ? 7 : 0);
      this.nota(midiAFrecuencia(nota), tiempo, duracionPaso * 1.8, { tipo: 'triangle', volumen: .5, destino });
      // Bombo suave
      this.nota(120, tiempo, .18, { tipo: 'sine', volumen: .55, hastaFrecuencia: 45, destino });
    }
    // Acorde suave al inicio de cada compás
    if (pasoEnCompas === 0) {
      for (const nota of acorde.slice(1)) {
        this.nota(midiAFrecuencia(nota), tiempo, duracionPaso * 7, { tipo: 'sine', volumen: .07, ataque: .08, destino });
      }
    }
    // Palmas en los tiempos 2 y 4
    if (pasoEnCompas === 2 || pasoEnCompas === 6) {
      this.rafaga(tiempo, .12, { volumen: .18, frecuencia: 1800, q: .8, destino });
    }
    // Maraca en cada paso
    this.rafaga(tiempo, .04, { volumen: .05, filtro: 'highpass', frecuencia: 7000, destino });
    // Marimba en los contratiempos (arpegio del acorde, una octava arriba)
    if (pasoEnCompas % 2 === 1) {
      const nota = acorde[1 + (pasoEnCompas >> 1) % 3] + 12;
      this.nota(midiAFrecuencia(nota), tiempo, .22, { tipo: 'sine', volumen: .1, destino });
    }
    // Melodía (con un "brillo" una octava arriba, como xilófono)
    const melodia = MELODIA[paso];
    if (melodia) {
      this.nota(midiAFrecuencia(melodia), tiempo, duracionPaso * 1.6, { tipo: 'triangle', volumen: .28, destino });
      this.nota(midiAFrecuencia(melodia + 12), tiempo, .15, { tipo: 'sine', volumen: .06, destino });
    }
  }

  alternarMusica() {
    this.musicaActiva = !this.musicaActiva;
    this.ajustarVolumenMusica();
    return this.musicaActiva;
  }

  ajustarVolumenMusica() {
    if (!this.ctx) return;
    // Mientras Pip habla, la música baja para que se le entienda
    const volumen = !this.musicaActiva ? 0 : (this.hablandoAhora ? .06 : .17);
    this.volumenMusica.gain.setTargetAtTime(volumen, this.ctx.currentTime, .15);
  }

  // ---------------------------------------------------------
  // EFECTOS DE SONIDO
  // ---------------------------------------------------------
  efecto(nombre, { pan = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + .01;
    switch (nombre) {
      case 'boton':
        this.nota(660, t, .12, { tipo: 'sine', volumen: .35, pan });
        this.nota(990, t + .06, .14, { tipo: 'sine', volumen: .25, pan });
        break;
      case 'bip':       // "bip-bup" de robot antes de hablar
        this.nota(1200, t, .07, { tipo: 'square', volumen: .06, pan });
        this.nota(800, t + .08, .08, { tipo: 'square', volumen: .06, pan });
        break;
      case 'pop':
        this.nota(380, t, .12, { tipo: 'sine', volumen: .5, hastaFrecuencia: 950, pan });
        this.rafaga(t, .06, { volumen: .25, frecuencia: 2500, pan });
        break;
      case 'salto':     // "boing" hacia arriba
        this.nota(260, t, .25, { tipo: 'triangle', volumen: .35, hastaFrecuencia: 720, pan });
        break;
      case 'rebote':
        this.nota(180, t, .16, { tipo: 'sine', volumen: .45, hastaFrecuencia: 70, pan });
        break;
      case 'alegria':   // arpegio ascendente
        [72, 76, 79, 84].forEach((n, i) => this.nota(midiAFrecuencia(n), t + i * .08, .25, { tipo: 'triangle', volumen: .3, pan }));
        this.efecto('brillo', { pan });
        break;
      case 'brillo':    // destellos agudos
        for (let i = 0; i < 6; i++) this.nota(1600 + Math.random() * 1800, t + i * .05, .2, { tipo: 'sine', volumen: .08, pan });
        break;
      case 'mareo': {   // "uiuiui" que baja tambaleándose
        const osc = this.nota(700, t, 1.1, { tipo: 'triangle', volumen: .25, hastaFrecuencia: 220, pan });
        const lfo = this.ctx.createOscillator();
        const profundidad = this.ctx.createGain();
        lfo.frequency.value = 9;
        profundidad.gain.value = 40;
        lfo.connect(profundidad).connect(osc.frequency);
        lfo.start(t);
        lfo.stop(t + 1.15);
        break;
      }
      case 'vuelo':     // soplido de viento
        this.rafaga(t, .9, { volumen: .25, frecuencia: 400, hastaFrecuencia: 1800, q: 2, pan });
        break;
      case 'luz':       // se enciende una luz del pecho
        [67, 72, 76, 79, 84, 88].forEach((n, i) => this.nota(midiAFrecuencia(n), t + i * .07, .4, { tipo: 'sine', volumen: .22, pan }));
        this.efecto('brillo', { pan });
        break;
      case 'aterrizaje':  // golpe del cohete al tocar el suelo
        this.nota(110, t, .6, { tipo: 'sine', volumen: .9, hastaFrecuencia: 35 });
        this.rafaga(t, 1.4, { volumen: .5, filtro: 'lowpass', frecuencia: 900, hastaFrecuencia: 120 });
        break;
      case 'corcho':      // la punta del cohete sale volando
        this.nota(900, t, .15, { tipo: 'sine', volumen: .45, hastaFrecuencia: 300 });
        this.rafaga(t, .08, { volumen: .4, frecuencia: 3000 });
        break;
      case 'aparecer':
        this.nota(500, t, .3, { tipo: 'sine', volumen: .25, hastaFrecuencia: 1400 });
        this.efecto('brillo');
        break;
      case 'bloqueado':   // suave, nunca un "error" feo
        this.nota(440, t, .15, { tipo: 'sine', volumen: .25 });
        this.nota(392, t + .12, .2, { tipo: 'sine', volumen: .25 });
        break;
      case 'risa':        // risita robótica
        for (let i = 0; i < 4; i++) this.nota(900 + i * 80, t + i * .09, .07, { tipo: 'square', volumen: .06 });
        break;
      case 'casi':        // "uy" suave y cariñoso cuando el niño se equivoca
        this.nota(523, t, .18, { tipo: 'sine', volumen: .22, pan });
        this.nota(440, t + .14, .28, { tipo: 'sine', volumen: .22, pan });
        break;
      case 'crecer':      // glissando que sube (la planta crece)
        this.nota(260, t, 1.2, { tipo: 'triangle', volumen: .2, hastaFrecuencia: 1040, ataque: .2, pan });
        this.efecto('brillo', { pan });
        break;
      case 'paca':        // susurro de paja
        this.rafaga(t, .22, { volumen: .35, frecuencia: 3000, q: .7, pan });
        this.rafaga(t + .16, .2, { volumen: .25, frecuencia: 2400, q: .7, pan });
        break;
      case 'linterna':    // "clic"
        this.nota(2200, t, .03, { tipo: 'square', volumen: .12 });
        this.nota(1400, t + .05, .04, { tipo: 'square', volumen: .1 });
        break;
      case 'fuego': {     // fuego artificial: silbido + ¡bum! + chisporroteo
        const p = (Math.random() - .5) * 1.2;
        this.nota(500, t, .5, { tipo: 'sine', volumen: .06, hastaFrecuencia: 1600, pan: p });
        this.rafaga(t + .5, 1.1, { volumen: .45, filtro: 'lowpass', frecuencia: 700, hastaFrecuencia: 90, pan: p });
        for (let i = 0; i < 8; i++) this.rafaga(t + .65 + Math.random() * .7, .03, { volumen: .12, frecuencia: 5000, pan: p });
        break;
      }
      case 'aplausos':
        for (let i = 0; i < 40; i++) this.rafaga(t + Math.random() * 2, .05, { volumen: .12, frecuencia: 1500 + Math.random() * 1500, q: .8, pan: (Math.random() - .5) * 1.4 });
        break;
      case 'vaca': case 'cerdito': case 'oveja': case 'gallo': case 'pato': case 'perro':
        this.sonidoAnimal(nombre, t, pan);
        break;
    }
  }

  // ---------------------------------------------------------
  // SONIDOS DE ANIMALES (sintetizados: osciladores + filtros)
  // ---------------------------------------------------------

  /**
   * Una "voz" sintetizada: un oscilador cuya altura sigue una lista de puntos,
   * pasa por un filtro (que da el timbre de cada animal) y una envolvente de volumen.
   *   frecuencias: [[segundos, Hz], ...]   volumenes: [[segundos, 0-1], ...]
   */
  sintetizar(inicio, { tipo = 'sawtooth', frecuencias, volumenes, filtro = 'bandpass', filtroFrec = 1200, filtroFin = null, q = 2, vibrato = 0, velVibrato = 6, pan = 0 }) {
    const ctx = this.ctx;
    const duracion = volumenes[volumenes.length - 1][0];
    const osc = ctx.createOscillator();
    osc.type = tipo;
    frecuencias.forEach(([s, f], i) => {
      if (i === 0) osc.frequency.setValueAtTime(f, inicio + s);
      else osc.frequency.linearRampToValueAtTime(f, inicio + s);
    });
    const f = ctx.createBiquadFilter();
    f.type = filtro;
    f.frequency.setValueAtTime(filtroFrec, inicio);
    if (filtroFin) f.frequency.linearRampToValueAtTime(filtroFin, inicio + duracion);
    f.Q.value = q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, inicio);
    volumenes.forEach(([s, v]) => env.gain.linearRampToValueAtTime(v, inicio + s));
    osc.connect(f).connect(env).connect(this.conPaneo(this.volumenEfectos, pan));
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const profundidad = ctx.createGain();
      lfo.frequency.value = velVibrato;
      profundidad.gain.value = vibrato;
      lfo.connect(profundidad).connect(osc.frequency);
      lfo.start(inicio);
      lfo.stop(inicio + duracion + .05);
    }
    osc.start(inicio);
    osc.stop(inicio + duracion + .05);
  }

  sonidoAnimal(tipo, t, pan) {
    switch (tipo) {
      case 'vaca':      // ¡Muuu! grave y largo, el filtro se abre y se cierra
        this.sintetizar(t, { frecuencias: [[0, 150], [.35, 132], [1.3, 108]], volumenes: [[.15, .9], [1.05, .75], [1.4, 0]], filtro: 'lowpass', filtroFrec: 320, filtroFin: 520, q: 6, vibrato: 3, velVibrato: 5, pan });
        this.sintetizar(t, { tipo: 'square', frecuencias: [[0, 75], [1.3, 54]], volumenes: [[.2, .35], [1.1, .3], [1.4, 0]], filtro: 'lowpass', filtroFrec: 400, q: 1, pan });
        break;
      case 'cerdito':   // ¡Oink, oink! dos gruñiditos nasales
        for (const s of [0, .32]) {
          this.sintetizar(t + s, { frecuencias: [[0, 260], [.1, 330], [.24, 200]], volumenes: [[.03, .8], [.18, .6], [.26, 0]], filtroFrec: 950, q: 4, pan });
          this.rafaga(t + s, .16, { volumen: .25, frecuencia: 700, q: 2, pan });
        }
        break;
      case 'oveja':     // ¡Beee! con temblor
        this.sintetizar(t, { frecuencias: [[0, 420], [.15, 470], [.95, 400]], volumenes: [[.06, .75], [.8, .6], [1, 0]], filtroFrec: 1500, q: 1.6, vibrato: 38, velVibrato: 8, pan });
        break;
      case 'gallo': {   // ¡Ki-ki-ri-kí!
        const silabas = [[0, 760, .13], [.17, 900, .13], [.34, 1050, .13], [.52, 1250, .6]];
        for (const [s, f, d] of silabas) {
          this.sintetizar(t + s, { frecuencias: [[0, f * .9], [.05, f], [d, f * (d > .3 ? .8 : .95)]], volumenes: [[.02, .7], [d * .8, .6], [d, 0]], filtroFrec: 2000, q: 2.5, vibrato: d > .3 ? 20 : 0, velVibrato: 9, pan });
        }
        break;
      }
      case 'pato':      // ¡Cuac, cuac! muy nasal
        for (const s of [0, .3]) {
          this.sintetizar(t + s, { frecuencias: [[0, 470], [.2, 360]], volumenes: [[.02, .9], [.15, .7], [.22, 0]], filtroFrec: 1150, q: 7, pan });
        }
        break;
      case 'perro':     // ¡Guau, guau!
        for (const s of [0, .33]) {
          this.sintetizar(t + s, { frecuencias: [[0, 380], [.05, 560], [.2, 260]], volumenes: [[.02, 1], [.12, .7], [.22, 0]], filtro: 'lowpass', filtroFrec: 1800, q: 2, pan });
          this.rafaga(t + s, .1, { volumen: .35, filtro: 'lowpass', frecuencia: 1500, pan });
        }
        break;
    }
  }

  // Rugido del cohete: dura hasta que se llama a detenerCohete()
  iniciarCohete() {
    if (!this.ctx) return;
    this.detenerCohete();
    const ctx = this.ctx;
    const fuente = ctx.createBufferSource();
    fuente.buffer = this.ruido;
    fuente.loop = true;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 500;
    const volumen = ctx.createGain();
    volumen.gain.setValueAtTime(0, ctx.currentTime);
    volumen.gain.linearRampToValueAtTime(.55, ctx.currentTime + 1.2);
    fuente.connect(filtro).connect(volumen).connect(this.volumenEfectos);
    fuente.start();
    this.cohete = { fuente, volumen, filtro };
  }

  // Intensidad del cohete de 0 a 1 (más fuerte al frenar para aterrizar)
  potenciaCohete(valor) {
    if (!this.cohete) return;
    this.cohete.filtro.frequency.setTargetAtTime(300 + valor * 900, this.ctx.currentTime, .1);
  }

  detenerCohete() {
    if (!this.cohete) return;
    const { fuente, volumen } = this.cohete;
    volumen.gain.setTargetAtTime(0, this.ctx.currentTime, .15);
    fuente.stop(this.ctx.currentTime + .8);
    this.cohete = null;
  }

  // ---------------------------------------------------------
  // VOZ EN ESPAÑOL
  // ---------------------------------------------------------
  elegirVoz() {
    if (!('speechSynthesis' in window)) return;
    const voces = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith('es'));
    if (!voces.length) return;
    for (const preferida of VOCES_PREFERIDAS) {
      const voz = voces.find(v => v.name.toLowerCase().includes(preferida));
      if (voz) { this.voz = voz; return; }
    }
    // Si no hay favorita: primero español latino, luego cualquier español
    this.voz = voces.find(v => /es[-_](mx|us|419|co|ar|cl|pe|ec)/i.test(v.lang)) || voces[0];
  }

  /**
   * Pip dice una frase en voz alta.
   * Devuelve una promesa que se cumple cuando termina de hablar.
   */
  hablar(texto) {
    // Quitamos los emojis para que la voz no los lea ("cara sonriente"…)
    const limpio = texto.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '').trim();
    const respaldo = 1200 + limpio.length * 80;       // por si el navegador no tiene voz
    return new Promise(resolver => {
      let terminado = false;
      const terminar = () => {
        if (terminado) return;
        terminado = true;
        this.hablandoAhora = false;
        this.ajustarVolumenMusica();
        resolver();
      };
      if (!('speechSynthesis' in window) || !limpio) {
        setTimeout(terminar, respaldo);
        return;
      }
      speechSynthesis.cancel();
      const frase = new SpeechSynthesisUtterance(limpio);
      frase.lang = this.voz?.lang || 'es-ES';
      if (this.voz) frase.voice = this.voz;
      frase.pitch = 1.45;      // voz más aguda = más tierna
      frase.rate = .95;        // un poquito lento, para niños pequeños
      frase.onend = terminar;
      frase.onerror = terminar;
      this.ultimaFrase = frase; // (evita un error de Chrome que "pierde" la frase)
      this.hablandoAhora = true;
      this.ajustarVolumenMusica();
      speechSynthesis.speak(frase);
      setTimeout(terminar, respaldo + 5000);
    });
  }

  callar() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
}
