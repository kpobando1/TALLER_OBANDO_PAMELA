// =========================================================
// zonas/base.js — lo que tienen en común las 3 zonas.
//
// Idea importante: "sesión". Cada vez que el niño entra a una zona
// empieza una sesión nueva. Si toca 🏠 a la mitad, la sesión se
// cancela y todas las esperas (await) terminan sin hacer nada más.
// Así nunca quedan dos juegos corriendo a la vez.
// =========================================================
import * as THREE from 'three';
import { esperar } from '../utilidades.js';

export class ZonaBase {
  constructor({ escena, pip, audio, ui, efectos }) {
    this.escena = escena;
    this.pip = pip;
    this.audio = audio;
    this.ui = ui;
    this.efectos = efectos;
    this.sesion = 0;
    this.activa = false;
    this.tocablesZona = [];
    this.resolverToque = null;      // función que "despierta" a quien espera un toque
    this.vigente = () => false;
    this.grupo = new THREE.Group();
    this.grupo.visible = false;
    escena.scene.add(this.grupo);
  }

  // Empieza una sesión y devuelve una función que dice si sigue vigente
  empezarSesion() {
    this.sesion++;
    this.activa = true;
    const miSesion = this.sesion;
    this.vigente = () => this.activa && this.sesion === miSesion;
    return this.vigente;
  }

  // Hace que un objeto se pueda tocar
  hacerTocable(objeto, alTocar) {
    objeto.userData.alTocar = alTocar;
    this.escena.registrarTocable(objeto);
    this.tocablesZona.push(objeto);
  }

  quitarTocables() {
    for (const objeto of this.tocablesZona) this.escena.quitarTocable(objeto);
    this.tocablesZona = [];
  }

  // Espera a que el niño toque algo (lo entrega el manejador de toques)
  esperarToque() {
    return new Promise(resolver => { this.resolverToque = resolver; });
  }

  // Entrega un toque a quien lo esté esperando
  entregarToque(valor) {
    if (!this.resolverToque) return false;
    const resolver = this.resolverToque;
    this.resolverToque = null;
    resolver(valor);
    return true;
  }

  // Pip habla solo si la zona sigue activa
  async decir(texto, emocion = null) {
    if (!this.vigente()) return;
    await this.pip.decir(texto, emocion);
  }

  async pausa(segundos) {
    await esperar(segundos);
    return this.vigente();
  }

  // Botón 🔊: repite la pregunta (cada zona define "repetir")
  mostrarRepetir() { this.ui.mostrarRepetir(() => { if (this.vigente() && this.repetir) this.repetir(); }); }

  // Se llama al salir con 🏠 (o al terminar)
  detener() {
    this.activa = false;
    this.sesion++;
    this.quitarTocables();
    this.entregarToque(null);           // despierta a quien esperaba, para que termine
    this.ui.ocultarProgreso();
    this.ui.ocultarRepetir();
    this.audio.callar();
  }

  actualizar() {}
}
