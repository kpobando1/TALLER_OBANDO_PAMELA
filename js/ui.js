// =========================================================
// ui.js — la interfaz en HTML que flota sobre el mundo 3D:
// botones, título animado, globo de texto y avisos.
// =========================================================

const COLORES_TITULO = ['#ff8a3d', '#4fc8f0', '#ff7eb6', '#ffc93d', '#5fd068', '#b98cff'];

export class UI {
  constructor() {
    const $ = id => document.getElementById(id);
    this.el = {
      inicio: $('pantallaInicio'),
      botonEmpezar: $('botonEmpezar'),
      cargando: $('textoCargando'),
      saltar: $('botonSaltar'),
      titulo: $('pantallaTitulo'),
      tituloTexto: $('titulo'),
      botonJugar: $('botonJugar'),
      barra: $('barraSuperior'),
      casa: $('botonCasa'),
      calidad: $('botonCalidad'),
      musica: $('botonMusica'),
      globo: $('globo'),
      globoTexto: $('globoTexto'),
      aviso: $('aviso'),
      progreso: $('progreso'),
      repetir: $('botonRepetir'),
      creditos: $('pantallaCreditos'),
      otraVez: $('botonOtraVez')
    };
    this.el.botonEmpezar.disabled = true;
    this.el.repetir.addEventListener('click', () => this.alRepetir?.());
  }

  // ---------- Progreso de la zona: ⭐⭐☆☆ ----------
  mostrarProgreso(total, hechos, icono = '⭐') {
    const el = this.el.progreso;
    let html = '';
    for (let i = 0; i < total; i++) {
      const clase = i < hechos ? 'paso hecho' : 'paso';
      // El último ganado aparece con un saltito
      const nuevo = i === hechos - 1 && hechos !== this.ultimoProgreso ? ' nuevo' : '';
      html += `<span class="${clase}${nuevo}">${i < hechos ? icono : '○'}</span>`;
    }
    this.ultimoProgreso = hechos;
    el.innerHTML = html;
    el.hidden = false;
  }
  ocultarProgreso() { this.el.progreso.hidden = true; this.ultimoProgreso = -1; }

  // ---------- Botón 🔊 para volver a escuchar la pregunta ----------
  mostrarRepetir(alTocar) {
    this.alRepetir = alTocar;
    this.el.repetir.hidden = false;
  }
  ocultarRepetir() {
    this.alRepetir = null;
    this.el.repetir.hidden = true;
  }

  // ---------- Créditos finales ----------
  mostrarCreditos() { this.el.creditos.hidden = false; }
  ocultarCreditos() { this.el.creditos.hidden = true; }

  // Cuando la escena ya cargó, habilitamos el botón de empezar
  listo() {
    this.el.botonEmpezar.disabled = false;
    this.el.cargando.textContent = '¡Pip te está esperando!';
  }

  mostrar(nombre) { this.el[nombre].hidden = false; }
  ocultar(nombre) { this.el[nombre].hidden = true; }

  // Título con cada letra en su propio <span> para que rebote por separado
  mostrarTitulo() {
    const lineas = ['Pip en la', 'Granja Mágica'];
    let indice = 0;
    this.el.tituloTexto.innerHTML = lineas.map(linea => {
      const letras = [...linea].map(letra => {
        if (letra === ' ') return '<span class="espacio"></span>';
        const color = COLORES_TITULO[indice % COLORES_TITULO.length];
        const html = `<span class="letra" style="--color:${color};--retraso:${(indice * .07).toFixed(2)}s">${letra}</span>`;
        indice++;
        return html;
      }).join('');
      return `<span class="linea">${letras}</span>`;
    }).join('');
    this.mostrar('titulo');
  }

  // Globo de texto de Pip (se reinicia la animación en cada frase nueva)
  mostrarGlobo(texto) {
    const globo = this.el.globo;
    this.el.globoTexto.textContent = texto;
    globo.hidden = true;
    void globo.offsetWidth;        // truco para reiniciar la animación CSS
    globo.hidden = false;
  }
  ocultarGlobo() { this.el.globo.hidden = true; }

  // Aviso corto que desaparece solo
  aviso(texto, segundos = 2.5) {
    const aviso = this.el.aviso;
    aviso.textContent = texto;
    aviso.hidden = false;
    clearTimeout(this.temporizadorAviso);
    this.temporizadorAviso = setTimeout(() => { aviso.hidden = true; }, segundos * 1000);
  }

  fijarMusica(activa) {
    this.el.musica.setAttribute('aria-pressed', String(activa));
    this.el.musica.setAttribute('aria-label', activa ? 'Silenciar música' : 'Activar música');
    this.el.musica.textContent = activa ? '🎵' : '🔇';
  }

  fijarCalidad(alta) {
    this.el.calidad.textContent = alta ? '✨' : '🐢';
    this.el.calidad.setAttribute('aria-label', alta ? 'Calidad alta (tocar para bajar)' : 'Calidad baja (tocar para subir)');
  }
}
