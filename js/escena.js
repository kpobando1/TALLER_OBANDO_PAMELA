// =========================================================
// escena.js — el "estudio de cine" del juego.
//
// Aquí se crean:
//   • el renderizador con sombras suaves y tone mapping ACES
//   • el postprocesado (bloom + viñeta)
//   • las 3 luces de cine: principal, relleno y contorno
//   • el cielo con degradado, sol, luna y estrellas (día/noche)
//   • la isla flotante con su granja: árboles, flores, molino,
//     estanque, nubes y partículas (polen y luciérnagas)
//   • la cámara cinematográfica con movimientos suaves
// =========================================================
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';
import { animar, suavizar, mezclar, crearLienzo } from './utilidades.js';

// ---------- Las 3 zonas del juego (las usan el mapa y las fases) ----------
export const ZONAS = [
  {
    id: 'corral', nombre: 'Corral', emoji: '🐮', sentido: 'oído', colorLuz: '#3fa9ff',
    posicion: new THREE.Vector3(-7.5, 0, 1),
    pip: new THREE.Vector3(-3.3, 0, 2.2),     // dónde se para Pip al llegar
    camara: { pos: new THREE.Vector3(-7.1, 8.4, 13.4), mira: new THREE.Vector3(-7.1, -.4, 1.8) }
  },
  {
    id: 'huerto', nombre: 'Huerto', emoji: '🍎', sentido: 'vista', colorLuz: '#4fdc5a',
    posicion: new THREE.Vector3(7.5, 0, 1.5),
    pip: new THREE.Vector3(4.1, 0, 2.4),
    camara: { pos: new THREE.Vector3(7.2, 6.4, 13.6), mira: new THREE.Vector3(7.2, .9, 1.8) }
  },
  {
    id: 'granero', nombre: 'Granero', emoji: '🌙', sentido: 'búsqueda', colorLuz: '#ffd84d',
    posicion: new THREE.Vector3(0, 0, -8),
    pip: new THREE.Vector3(-4.9, 0, -1.6),
    camara: { pos: new THREE.Vector3(0, 5.4, 7.8), mira: new THREE.Vector3(0, 1.3, -4) }
  }
];

// Centro de la isla donde vive Pip
export const PLAZA = new THREE.Vector3(0, 0, 3);
const RADIO_ISLA = 16;

// ---------- Números al azar que siempre salen iguales ----------
// Así la granja se ve igual cada vez que se abre el juego.
function azarConSemilla(semilla) {
  return () => {
    semilla |= 0; semilla = semilla + 0x6D2B79F5 | 0;
    let t = Math.imul(semilla ^ semilla >>> 15, 1 | semilla);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const azarFijo = azarConSemilla(2024);

// Borde ondulado de la isla (para que no sea un círculo perfecto)
function radioBorde(angulo) {
  return RADIO_ISLA * (1 + .05 * Math.sin(3 * angulo) + .03 * Math.sin(5 * angulo + 2) + .02 * Math.sin(9 * angulo + .5));
}

// Colinas suaves del pasto. Todos los objetos usan esta función
// para quedar apoyados en el suelo (ni flotando ni enterrados).
export function alturaSuelo(x, z) {
  const r = Math.hypot(x, z) / RADIO_ISLA;
  const borde = Math.max(0, 1 - Math.pow(Math.min(r, 1), 4));
  const plano = Math.min(1, Math.hypot(x - PLAZA.x, z - PLAZA.z) / 5); // la plaza es plana
  return (.22 * Math.sin(x * .35 + 1.3) * Math.cos(z * .3) + .1 * Math.sin(x * .8 + z * .6)) * borde * plano;
}

// ---------- Paletas de color del cielo (noche, amanecer, día) ----------
const PALETAS = {
  noche: {
    arriba: '#060a26', horizonte: '#26306e', abajo: '#141a3a', niebla: '#1b2150',
    luz: '#9fb4ff', luzInt: .55, cieloHemi: '#3b4a8a', sueloHemi: '#1d1630', hemiInt: .45,
    contorno: '#7fa0ff', contornoInt: 1.3, entorno: .25, estrellas: 1, solAltura: -.3, halo: '#5060c0'
  },
  amanecer: {
    arriba: '#4a68cf', horizonte: '#ffb37a', abajo: '#f08e6b', niebla: '#f7b48a',
    luz: '#ffc890', luzInt: 2, cieloHemi: '#ffd8b8', sueloHemi: '#6b4a3a', hemiInt: .55,
    contorno: '#ffad66', contornoInt: 2, entorno: .3, estrellas: .15, solAltura: .06, halo: '#ffb070'
  },
  dia: {
    arriba: '#1670e0', horizonte: '#a8dcff', abajo: '#86c4f2', niebla: '#bfe3ff',
    luz: '#fff1da', luzInt: 2.2, cieloHemi: '#d6ecff', sueloHemi: '#7d6a42', hemiInt: .6,
    contorno: '#fff4e6', contornoInt: 1.4, entorno: .32, estrellas: 0, solAltura: .55, halo: '#fff2c0'
  }
};
// Convertimos los textos "#rrggbb" a colores de Three.js una sola vez
for (const paleta of Object.values(PALETAS)) {
  for (const [clave, valor] of Object.entries(paleta)) {
    if (typeof valor === 'string') paleta[clave] = new THREE.Color(valor);
  }
}

// Textura redonda y difusa para las partículas (polen, luciérnagas, humo)
export function texturaPunto() {
  const { lienzo, ctx } = crearLienzo(64, 64);
  const degradado = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  degradado.addColorStop(0, 'rgba(255,255,255,1)');
  degradado.addColorStop(.35, 'rgba(255,255,255,.7)');
  degradado.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = degradado;
  ctx.fillRect(0, 0, 64, 64);
  const textura = new THREE.CanvasTexture(lienzo);
  textura.colorSpace = THREE.SRGBColorSpace;
  return textura;
}

// =========================================================
export class Escena {
  constructor(lienzo) {
    this.lienzo = lienzo;
    this.calidadAlta = true;
    this.momento = 1;                 // 0 = noche, .5 = amanecer, 1 = día
    this.actualizables = [];          // cosas que se animan solas (molino, nubes…)
    this.tocables = [];               // objetos que el niño puede tocar

    this.crearRenderizador();
    this.crearCamara();
    this.crearLuces();
    this.crearCielo();
    this.crearIsla();
    this.crearDecorado();
    this.crearParticulas();
    this.crearPostprocesado();
    this.activarSombras();

    this.fijarMomento(1);
    this.ajustarTamano();
    addEventListener('resize', () => this.ajustarTamano());
  }

  // ---------------- Renderizador ----------------
  crearRenderizador() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.lienzo, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;      // sombras suaves
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;     // colores de cine
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();

    // Entorno: un "cuarto" virtual que da reflejos suaves a los plásticos brillantes
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), .04).texture;
    pmrem.dispose();

    this.scene.fog = new THREE.Fog('#cfeaff', 55, 150);
  }

  // ---------------- Cámara cinematográfica ----------------
  crearCamara() {
    this.camera = new THREE.PerspectiveCamera(40, 1, .1, 450);
    // "camBase" es hacia dónde queremos la cámara; luego le sumamos
    // un balanceo suave para que se sienta como cámara en mano.
    this.camBase = { pos: new THREE.Vector3(0, 20, 26), mira: new THREE.Vector3(0, 0, 0) };
    this.balanceo = 1;          // intensidad del balanceo (0 = quieta)
    this.temblor = 0;           // sacudida (por ejemplo, al aterrizar el cohete)
  }

  /**
   * Mueve la cámara suavemente a una nueva posición.
   * "arco" la eleva a mitad de camino, como una grúa de cine.
   */
  moverCamara(pos, mira, duracion = 2, { curva = suavizar.entradaSalida, arco = 0 } = {}) {
    const desdePos = this.camBase.pos.clone();
    const desdeMira = this.camBase.mira.clone();
    return animar(duracion, t => {
      this.camBase.pos.lerpVectors(desdePos, pos, t);
      this.camBase.pos.y += Math.sin(t * Math.PI) * arco;
      this.camBase.mira.lerpVectors(desdeMira, mira, t);
    }, { curva });
  }

  colocarCamara(pos, mira) {
    this.camBase.pos.copy(pos);
    this.camBase.mira.copy(mira);
  }

  actualizarCamara(t) {
    const cam = this.camera;
    cam.position.copy(this.camBase.pos);
    // Balanceo lento (respiración de la cámara)
    cam.position.x += Math.sin(t * .31) * .18 * this.balanceo;
    cam.position.y += Math.sin(t * .23 + 1) * .12 * this.balanceo;
    // Sacudida que se apaga sola
    if (this.temblor > 0) {
      cam.position.x += (Math.random() - .5) * this.temblor;
      cam.position.y += (Math.random() - .5) * this.temblor;
      this.temblor = Math.max(0, this.temblor - .02);
    }
    cam.lookAt(this.camBase.mira);
  }

  // ---------------- Luces de cine ----------------
  crearLuces() {
    // 1) Luz principal (cálida, con sombras)
    this.luzPrincipal = new THREE.DirectionalLight('#fff1da', 2.7);
    this.luzPrincipal.position.set(14, 22, 16);
    this.luzPrincipal.castShadow = true;
    const sombra = this.luzPrincipal.shadow;
    sombra.mapSize.set(2048, 2048);
    sombra.camera.left = sombra.camera.bottom = -21;
    sombra.camera.right = sombra.camera.top = 21;
    sombra.camera.near = 1;
    sombra.camera.far = 70;
    sombra.bias = -.0004;
    sombra.normalBias = .03;
    sombra.radius = 5;
    this.scene.add(this.luzPrincipal, this.luzPrincipal.target);

    // 2) Luz de relleno: cielo arriba, tierra abajo (suaviza las sombras)
    this.luzRelleno = new THREE.HemisphereLight('#d6ecff', '#7d6a42', .8);
    this.scene.add(this.luzRelleno);

    // 3) Luz de contorno (rim light): viene desde DETRÁS de los personajes
    //    respecto a la cámara y les dibuja un borde brillante.
    this.luzContorno = new THREE.DirectionalLight('#fff4e6', 1.6);
    this.scene.add(this.luzContorno, this.luzContorno.target);
  }

  // ---------------- Cielo, sol, luna y estrellas ----------------
  crearCielo() {
    this.uniformesCielo = {
      arriba: { value: new THREE.Color() },
      horizonte: { value: new THREE.Color() },
      abajo: { value: new THREE.Color() },
      halo: { value: new THREE.Color() },
      dirSol: { value: new THREE.Vector3(0, .3, -1).normalize() }
    };
    const cielo = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: this.uniformesCielo,
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader: /* glsl */`
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */`
          uniform vec3 arriba, horizonte, abajo, halo, dirSol;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 color = h > 0.0
              ? mix(horizonte, arriba, pow(smoothstep(0.0, 0.7, h), 0.75))
              : mix(horizonte, abajo, smoothstep(0.0, -0.35, h));
            // Halo cálido alrededor del sol
            float s = max(dot(d, dirSol), 0.0);
            color += halo * (pow(s, 10.0) * 0.45 + pow(s, 80.0) * 0.6);
            gl_FragColor = vec4(color, 1.0);
          }`
      })
    );
    cielo.renderOrder = -10;
    cielo.frustumCulled = false;
    this.cielo = cielo;
    this.scene.add(cielo);

    // Sol: esfera con color "más blanco que blanco" para que el bloom la haga brillar
    this.sol = new THREE.Mesh(new THREE.SphereGeometry(9, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.2, 1.8), fog: false }));
    this.luna = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 1.9, 2.3), fog: false }));
    this.scene.add(this.sol, this.luna);

    // Estrellas: muchos puntitos en la mitad superior del cielo
    const cantidad = 700;
    const posiciones = new Float32Array(cantidad * 3);
    for (let i = 0; i < cantidad; i++) {
      const u = azarFijo() * Math.PI * 2;
      const v = Math.acos(azarFijo() * .95);        // solo hacia arriba
      posiciones.set([Math.sin(v) * Math.cos(u) * 260, Math.cos(v) * 260 + 10, Math.sin(v) * Math.sin(u) * 260], i * 3);
    }
    const geoEstrellas = new THREE.BufferGeometry();
    geoEstrellas.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    this.estrellas = new THREE.Points(geoEstrellas, new THREE.PointsMaterial({
      size: 2.4, sizeAttenuation: false, color: new THREE.Color(2.2, 2.2, 2.6),
      map: texturaPunto(), transparent: true, depthWrite: false, fog: false
    }));
    this.scene.add(this.estrellas);
  }

  /**
   * Cambia la hora del día al instante.
   * @param {number} m  0 = noche, 0.5 = amanecer, 1 = día
   */
  fijarMomento(m) {
    this.momento = m;
    const a = m < .5 ? PALETAS.noche : PALETAS.amanecer;
    const b = m < .5 ? PALETAS.amanecer : PALETAS.dia;
    const t = m < .5 ? m * 2 : (m - .5) * 2;
    const mezcla = clave => {
      if (a[clave] instanceof THREE.Color) return a[clave].clone().lerp(b[clave], t);
      return mezclar(a[clave], b[clave], t);
    };

    this.uniformesCielo.arriba.value.copy(mezcla('arriba'));
    this.uniformesCielo.horizonte.value.copy(mezcla('horizonte'));
    this.uniformesCielo.abajo.value.copy(mezcla('abajo'));
    this.uniformesCielo.halo.value.copy(mezcla('halo'));
    this.scene.fog.color.copy(mezcla('niebla'));
    this.luzPrincipal.color.copy(mezcla('luz'));
    this.luzPrincipal.intensity = mezcla('luzInt');
    this.luzRelleno.color.copy(mezcla('cieloHemi'));
    this.luzRelleno.groundColor.copy(mezcla('sueloHemi'));
    this.luzRelleno.intensity = mezcla('hemiInt');
    this.luzContorno.color.copy(mezcla('contorno'));
    this.luzContorno.intensity = mezcla('contornoInt');
    this.estrellas.material.opacity = mezcla('estrellas');
    this.estrellas.visible = this.estrellas.material.opacity > .01;
    this.intensidadEntorno = mezcla('entorno');

    // El sol sube detrás de la granja; la luna aparece de noche
    const altura = mezcla('solAltura');
    const dirSol = new THREE.Vector3(Math.sin(-.45), altura, -Math.cos(.45)).normalize();
    this.uniformesCielo.dirSol.value.copy(m < .25 ? new THREE.Vector3(.4, .45, -1).normalize() : dirSol);
    this.sol.position.copy(dirSol).multiplyScalar(240);
    this.sol.visible = altura > -.12;
    this.luna.position.set(.4, .45, -1).normalize().multiplyScalar(240);
    this.luna.visible = m < .4;

    // Luciérnagas de noche, polen de día
    if (this.polen) {
      this.polen.material.opacity = Math.max(0, (m - .4) / .6) * .8;
      this.luciernagas.material.opacity = Math.max(0, 1 - m / .45);
      this.luciernagas.visible = this.luciernagas.material.opacity > .01;
    }
    this.ajustarEntorno();
  }

  // Transición animada entre horas del día
  cambiarMomento(meta, duracion = 4) {
    const desde = this.momento;
    return animar(duracion, t => this.fijarMomento(mezclar(desde, meta, t)), { curva: suavizar.entradaSalida });
  }

  // Ajusta la fuerza de los reflejos en todos los materiales
  ajustarEntorno() {
    const intensidad = this.intensidadEntorno ?? .5;
    this.scene.traverse(objeto => {
      const materiales = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
      for (const material of materiales) {
        if (material && 'envMapIntensity' in material) material.envMapIntensity = intensidad;
      }
    });
  }

  // ---------------- La isla flotante ----------------
  crearIsla() {
    this.isla = new THREE.Group();
    this.scene.add(this.isla);

    // Pasto de arriba: un anillo con muchas subdivisiones para poder hacer colinas
    const geoPasto = new THREE.RingGeometry(.01, RADIO_ISLA, 96, 24);
    geoPasto.rotateX(-Math.PI / 2);
    const pos = geoPasto.attributes.position;
    const colores = [];
    const verdeClaro = new THREE.Color('#9be06a');
    const verdeOscuro = new THREE.Color('#5fb14a');
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const angulo = Math.atan2(z, x);
      const escala = radioBorde(angulo) / RADIO_ISLA;
      const nx = x * escala, nz = z * escala;
      pos.setXYZ(i, nx, alturaSuelo(nx, nz), nz);
      // Manchas de pasto más claro y más oscuro
      const mancha = .5 + .5 * Math.sin(nx * .5) * Math.cos(nz * .45 + 1) + (azarFijo() - .5) * .25;
      const c = verdeOscuro.clone().lerp(verdeClaro, Math.min(1, Math.max(0, mancha)));
      colores.push(c.r, c.g, c.b);
    }
    geoPasto.setAttribute('color', new THREE.Float32BufferAttribute(colores, 3));
    geoPasto.computeVertexNormals();
    const pasto = new THREE.Mesh(geoPasto, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
    pasto.receiveShadow = true;
    pasto.name = 'suelo';
    this.suelo = pasto;
    this.isla.add(pasto);

    // Orilla de tierra (el "costado" de la isla)
    const geoOrilla = new THREE.CylinderGeometry(RADIO_ISLA, RADIO_ISLA * .97, 1.6, 96, 1, true);
    this.ondularBorde(geoOrilla, 0);
    const orilla = new THREE.Mesh(geoOrilla, new THREE.MeshStandardMaterial({ color: '#b5784a', roughness: 1 }));
    orilla.position.y = -.8;
    this.isla.add(orilla);

    // Borde de pasto que sobresale un poquito (como un pastel con glaseado)
    const geoBorde = new THREE.TorusGeometry(RADIO_ISLA, .22, 8, 96);
    geoBorde.rotateX(Math.PI / 2);
    this.ondularBorde(geoBorde, 0);
    const borde = new THREE.Mesh(geoBorde, new THREE.MeshStandardMaterial({ color: '#7cc85a', roughness: .9 }));
    borde.position.y = -.05;
    this.isla.add(borde);

    // Roca de abajo: un cono invertido con forma irregular y colores de tierra
    const geoRoca = new THREE.ConeGeometry(RADIO_ISLA * .97, 13, 40, 8);
    geoRoca.rotateX(Math.PI);
    const posRoca = geoRoca.attributes.position;
    const coloresRoca = [];
    const tierraArriba = new THREE.Color('#a86d42');
    const tierraAbajo = new THREE.Color('#5a3a2c');
    for (let i = 0; i < posRoca.count; i++) {
      const x = posRoca.getX(i), y = posRoca.getY(i), z = posRoca.getZ(i);
      const angulo = Math.atan2(z, x);
      const profundidad = (6.5 - y) / 13;               // 0 arriba, 1 abajo
      let escala = radioBorde(angulo) / RADIO_ISLA;
      // El "ruido" depende de la posición: así los vértices repetidos
      // en la costura del cono se mueven igual y no quedan grietas.
      const r1 = ruido(x, y, z), r2 = ruido(z, x, y);
      if (profundidad > .05) escala *= 1 + (r1 - .5) * .28;
      posRoca.setXYZ(i, x * escala, y + (profundidad > .05 ? (r2 - .5) * .8 : 0), z * escala);
      const c = tierraArriba.clone().lerp(tierraAbajo, profundidad + (r2 - .5) * .15);
      coloresRoca.push(c.r, c.g, c.b);
    }
    geoRoca.setAttribute('color', new THREE.Float32BufferAttribute(coloresRoca, 3));
    geoRoca.computeVertexNormals();
    const roca = new THREE.Mesh(geoRoca, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    roca.position.y = -1.6 - 6.5;
    this.isla.add(roca);

    // Rocas pequeñitas que flotan alrededor de la isla
    const matRoca = new THREE.MeshStandardMaterial({ color: '#9a6a48', roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const piedra = new THREE.Mesh(new THREE.DodecahedronGeometry(.5 + azarFijo() * 1.1, 0), matRoca);
      const angulo = azarFijo() * Math.PI * 2;
      const distancia = RADIO_ISLA + 3 + azarFijo() * 6;
      const base = -3 - azarFijo() * 6;
      piedra.position.set(Math.cos(angulo) * distancia, base, Math.sin(angulo) * distancia);
      piedra.rotation.set(azarFijo() * 3, azarFijo() * 3, 0);
      // Un poquito de pasto encima de algunas
      if (i % 2 === 0) {
        const tapa = new THREE.Mesh(new THREE.SphereGeometry(.55, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#86d45c', roughness: .9 }));
        tapa.position.y = .25;
        tapa.scale.set(1.1, .5, 1.1);
        piedra.add(tapa);
      }
      const fase = azarFijo() * 6;
      this.actualizables.push((dt, t) => {
        piedra.position.y = base + Math.sin(t * .6 + fase) * .4;
        piedra.rotation.y += dt * .1;
      });
      this.isla.add(piedra);
    }
  }

  // Aplica el borde ondulado a una geometría redonda
  ondularBorde(geometria) {
    const pos = geometria.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const escala = radioBorde(Math.atan2(z, x)) / RADIO_ISLA;
      pos.setX(i, x * escala);
      pos.setZ(i, z * escala);
    }
    geometria.computeVertexNormals();
  }

  // ¿Este punto está libre para poner decoración?
  lugarLibre(x, z, margen = 0) {
    if (Math.hypot(x, z) > RADIO_ISLA - 1) return false;
    if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < 3.2 + margen) return false;
    for (const zona of ZONAS) {
      if (Math.hypot(x - zona.posicion.x, z - zona.posicion.z) < 4.4 + margen) return false;
    }
    if (Math.hypot(x - 9, z + 7.5) < 4 + margen) return false;    // estanque
    if (Math.hypot(x + 9.5, z + 7) < 2.6 + margen) return false;  // molino
    if (Math.hypot(x + 4.6, z + 10.6) < 2 + margen) return false;  // lugar del cohete
    if (Math.hypot(x + 6.6, z + 9.2) < 1.3 + margen) return false; // punta del cohete
    if (Math.abs(x) < 5 && z > -5 && z < -1.8) return false;        // pacas del granero
    // Caminitos desde la plaza hasta cada zona
    for (const zona of ZONAS) {
      if (distanciaASegmento(x, z, PLAZA.x, PLAZA.z, zona.posicion.x, zona.posicion.z) < 1.2 + margen) return false;
    }
    return true;
  }

  // ---------------- Decoración de la granja ----------------
  crearDecorado() {
    const deco = new THREE.Group();
    this.isla.add(deco);
    this.decorado = deco;

    const madera = new THREE.MeshStandardMaterial({ color: '#a8703d', roughness: .8 });
    const maderaClara = new THREE.MeshStandardMaterial({ color: '#d39a5e', roughness: .8 });

    // --- Plaza de Pip: un círculo de tierra clarita con piedritas ---
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(2.4, 40), new THREE.MeshStandardMaterial({ color: '#dcbc86', roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.set(PLAZA.x, .02, PLAZA.z);
    plaza.receiveShadow = true;
    deco.add(plaza);
    const matPiedra = new THREE.MeshStandardMaterial({ color: '#d8d0c4', roughness: .7 });
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2;
      const piedra = new THREE.Mesh(new THREE.SphereGeometry(.18 + azarFijo() * .08, 10, 8), matPiedra);
      piedra.position.set(PLAZA.x + Math.cos(a) * 2.45, .05, PLAZA.z + Math.sin(a) * 2.45);
      piedra.scale.y = .55;
      deco.add(piedra);
    }

    // --- Caminitos de tierra hacia cada zona ---
    const geoParche = new THREE.CircleGeometry(.7, 16);
    geoParche.rotateX(-Math.PI / 2);
    const matCamino = new THREE.MeshStandardMaterial({ color: '#e2b47c', roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 });
    const parches = [];
    for (const zona of ZONAS) {
      const largo = Math.hypot(zona.posicion.x - PLAZA.x, zona.posicion.z - PLAZA.z);
      for (let d = 2.2; d < largo - 3; d += .75) {
        const t = d / largo;
        const x = mezclar(PLAZA.x, zona.posicion.x, t) + (azarFijo() - .5) * .3;
        const z = mezclar(PLAZA.z, zona.posicion.z, t) + (azarFijo() - .5) * .3;
        parches.push([x, z, .8 + azarFijo() * .4]);
      }
    }
    const caminos = new THREE.InstancedMesh(geoParche, matCamino, parches.length);
    const matriz = new THREE.Matrix4();
    parches.forEach(([x, z, s], i) => {
      matriz.compose(new THREE.Vector3(x, alturaSuelo(x, z) + .03, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s * .8));
      caminos.setMatrixAt(i, matriz);
    });
    caminos.receiveShadow = true;
    deco.add(caminos);

    // --- Árboles redonditos ---
    const lugaresArboles = [
      [-13, -2], [-13.5, 3.5], [-9.5, -11.5], [-1.5, -13.8], [4.5, -12.5], [12.5, -2.5],
      [14, 2.5], [10.5, -11], [-2.5, 12.5], [3, 12.5], [-13.5, -6.5], [14, -7], [-7.5, -4.5], [7, -5.8]
    ];
    for (const [x, z] of lugaresArboles) {
      const arbol = crearArbol(.85 + azarFijo() * .45, azarFijo() > .6);
      arbol.position.set(x, alturaSuelo(x, z), z);
      arbol.rotation.y = azarFijo() * Math.PI * 2;
      deco.add(arbol);
      const copa = arbol.userData.copa;
      const fase = azarFijo() * 6;
      // El viento mueve la copa (con retraso respecto al tronco: follow-through)
      this.actualizables.push((dt, t) => {
        copa.rotation.z = Math.sin(t * 1.1 + fase) * .035;
        copa.rotation.x = Math.sin(t * .8 + fase * 2) * .025;
      });
    }

    // --- Pasto alto y flores (muchas copias = InstancedMesh, muy rápido) ---
    const geoMata = new THREE.ConeGeometry(.09, .42, 4);
    geoMata.translate(0, .21, 0);
    const matas = new THREE.InstancedMesh(geoMata, new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9 }), 520);
    const geoTallo = new THREE.CylinderGeometry(.018, .018, .36, 4);
    geoTallo.translate(0, .18, 0);
    const tallos = new THREE.InstancedMesh(geoTallo, new THREE.MeshStandardMaterial({ color: '#3f9b3c' }), 180);
    const geoFlor = new THREE.IcosahedronGeometry(.13, 1);
    const flores = new THREE.InstancedMesh(geoFlor, new THREE.MeshStandardMaterial({ roughness: .5 }), 180);
    const coloresFlor = ['#ff6fa8', '#ffd84d', '#ffffff', '#b98cff', '#ff8a3d', '#6fd3ff'].map(c => new THREE.Color(c));
    const verdes = ['#6cc04a', '#8fd65c', '#4fa53d'].map(c => new THREE.Color(c));
    let nMatas = 0, nFlores = 0;
    const q = new THREE.Quaternion();
    while (nMatas < 520 || nFlores < 180) {
      const a = azarFijo() * Math.PI * 2;
      const r = Math.sqrt(azarFijo()) * (RADIO_ISLA - 1.2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (!this.lugarLibre(x, z, -.4)) continue;
      const y = alturaSuelo(x, z);
      if (nMatas < 520) {
        q.setFromEuler(new THREE.Euler((azarFijo() - .5) * .4, azarFijo() * 3, (azarFijo() - .5) * .4));
        const s = .6 + azarFijo() * .8;
        matriz.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
        matas.setMatrixAt(nMatas, matriz);
        matas.setColorAt(nMatas, verdes[nMatas % 3]);
        nMatas++;
      } else {
        matriz.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        tallos.setMatrixAt(nFlores, matriz);
        matriz.compose(new THREE.Vector3(x, y + .38, z), new THREE.Quaternion(), new THREE.Vector3(1, .75, 1));
        flores.setMatrixAt(nFlores, matriz);
        flores.setColorAt(nFlores, coloresFlor[nFlores % coloresFlor.length]);
        nFlores++;
      }
    }
    matas.castShadow = true;
    deco.add(matas, tallos, flores);

    // --- Molino de viento ---
    this.crearMolino(deco, -9.5, -7);

    // --- Estanque con nenúfares ---
    this.crearEstanque(deco, 9, -7.5);

    // --- Las 3 zonas (decoración base; el juego de cada una llega en su fase) ---
    this.crearCorral(deco, ZONAS[0].posicion, madera);
    this.crearHuerto(deco, ZONAS[1].posicion, madera, maderaClara);
    this.crearGranero(deco, ZONAS[2].posicion);

    // --- Nubes esponjosas que giran alrededor de la isla ---
    const matNube = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, emissive: '#ffffff', emissiveIntensity: .12 });
    for (let i = 0; i < 9; i++) {
      const nube = new THREE.Group();
      const bolitas = 4 + Math.floor(azarFijo() * 3);
      for (let j = 0; j < bolitas; j++) {
        const bolita = new THREE.Mesh(new THREE.SphereGeometry(1.4 + azarFijo() * 1.3, 18, 12), matNube);
        bolita.position.set((j - bolitas / 2) * 1.7, azarFijo() * .9, (azarFijo() - .5) * 1.6);
        bolita.scale.y = .72;
        nube.add(bolita);
      }
      const radio = 26 + azarFijo() * 22;
      const altura = 9 + azarFijo() * 14;
      let angulo = azarFijo() * Math.PI * 2;
      const rapidez = .012 + azarFijo() * .015;
      nube.scale.setScalar(.8 + azarFijo() * .8);
      this.actualizables.push((dt, t) => {
        angulo += dt * rapidez;
        nube.position.set(Math.cos(angulo) * radio, altura + Math.sin(t * .2 + i) * .6, Math.sin(angulo) * radio);
        nube.rotation.y = -angulo;
      });
      this.scene.add(nube);
    }
  }

  crearMolino(padre, x, z) {
    const molino = new THREE.Group();
    molino.position.set(x, alturaSuelo(x, z), z);
    molino.rotation.y = .5;

    const torre = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.45, 5.2, 10), new THREE.MeshStandardMaterial({ color: '#fbefd9', roughness: .7 }));
    torre.position.y = 2.6;
    const techo = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.6, 10), new THREE.MeshStandardMaterial({ color: '#e5533d', roughness: .6 }));
    techo.position.y = 6;
    const puerta = new THREE.Mesh(new THREE.CapsuleGeometry(.35, .5, 4, 10), new THREE.MeshStandardMaterial({ color: '#8a5a33' }));
    puerta.position.set(0, .7, 1.3);
    puerta.scale.z = .3;
    const ventana = new THREE.Mesh(new THREE.CircleGeometry(.28, 16), new THREE.MeshStandardMaterial({ color: '#4a6fa8', emissive: '#ffcf6a', emissiveIntensity: 0 }));
    ventana.position.set(0, 3.4, 1.12);
    ventana.rotation.x = -.1;
    this.ventanaMolino = ventana;

    // Las aspas giran sin parar
    const aspas = new THREE.Group();
    aspas.position.set(0, 4.7, 1.25);
    const matAspa = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .6 });
    const matMarco = new THREE.MeshStandardMaterial({ color: '#c0703a', roughness: .7 });
    for (let i = 0; i < 4; i++) {
      const brazo = new THREE.Group();
      const palo = new THREE.Mesh(new THREE.BoxGeometry(.14, 3, .1), matMarco);
      palo.position.y = 1.5;
      const tela = new THREE.Mesh(new THREE.BoxGeometry(.75, 2.3, .05), matAspa);
      tela.position.set(.42, 1.75, 0);
      brazo.add(palo, tela);
      brazo.rotation.z = i * Math.PI / 2;
      aspas.add(brazo);
    }
    const eje = new THREE.Mesh(new THREE.SphereGeometry(.25, 16, 12), matMarco);
    aspas.add(eje);
    this.actualizables.push(dt => { aspas.rotation.z -= dt * .8; });

    molino.add(torre, techo, puerta, ventana, aspas);
    padre.add(molino);
  }

  crearEstanque(padre, x, z) {
    const estanque = new THREE.Group();
    estanque.position.set(x, alturaSuelo(x, z), z);

    // Fondo oscuro (da sensación de profundidad) y agua brillante encima
    const fondo = new THREE.Mesh(new THREE.CircleGeometry(3.1, 40), new THREE.MeshStandardMaterial({ color: '#1e5f8a', roughness: 1 }));
    fondo.rotation.x = -Math.PI / 2;
    fondo.position.y = .03;
    const agua = new THREE.Mesh(new THREE.CircleGeometry(3, 40), new THREE.MeshPhysicalMaterial({
      color: '#5cc6ee', roughness: .05, metalness: 0, clearcoat: 1, clearcoatRoughness: .05, transparent: true, opacity: .82
    }));
    agua.rotation.x = -Math.PI / 2;
    agua.position.y = .08;
    agua.receiveShadow = true;
    estanque.add(fondo, agua);

    // Piedras alrededor
    const matPiedra = new THREE.MeshStandardMaterial({ color: '#b8b2a8', roughness: .8 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      const piedra = new THREE.Mesh(new THREE.DodecahedronGeometry(.3 + azarFijo() * .2, 1), matPiedra);
      piedra.position.set(Math.cos(a) * 3.15, .1, Math.sin(a) * 3.15);
      piedra.scale.y = .6;
      estanque.add(piedra);
    }

    // Nenúfares con florecita rosada
    const matHoja = new THREE.MeshStandardMaterial({ color: '#4caf50', roughness: .6, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const hoja = new THREE.Mesh(new THREE.CircleGeometry(.4, 16, .3, Math.PI * 2 - .4), matHoja);
      hoja.rotation.x = -Math.PI / 2;
      const a = i * 1.7, r = 1 + (i % 2) * 1;
      hoja.position.set(Math.cos(a) * r, .1, Math.sin(a) * r);
      estanque.add(hoja);
      if (i % 2 === 0) {
        const flor = new THREE.Mesh(new THREE.SphereGeometry(.13, 12, 8), new THREE.MeshStandardMaterial({ color: '#ff8fc0' }));
        flor.position.set(hoja.position.x, .18, hoja.position.z);
        estanque.add(flor);
      }
      const fase = i;
      this.actualizables.push((dt, t) => { hoja.rotation.z = Math.sin(t * .4 + fase) * .3; });
    }

    // Ondas en el agua que crecen y se desvanecen
    const matOnda = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .4, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const onda = new THREE.Mesh(new THREE.RingGeometry(.9, 1, 40), matOnda.clone());
      onda.rotation.x = -Math.PI / 2;
      onda.position.set(-.6 + i * .7, .1, .4 - i * .5);
      estanque.add(onda);
      this.actualizables.push((dt, t) => {
        const fase = ((t * .35) + i / 3) % 1;
        onda.scale.setScalar(.3 + fase * 1.5);
        onda.material.opacity = .45 * (1 - fase);
      });
    }
    padre.add(estanque);
  }

  crearCorral(padre, centro, madera) {
    const corral = new THREE.Group();
    corral.position.set(centro.x, alturaSuelo(centro.x, centro.z), centro.z);
    const radio = 3.6;
    const postes = 14;
    const puertaEn = 3;                 // hueco de la puerta mirando a la cámara
    let anterior = null;
    for (let i = 0; i <= postes; i++) {
      const a = Math.PI / 2 + (i - puertaEn) / postes * Math.PI * 2;
      const punto = new THREE.Vector3(Math.cos(a) * radio, 0, Math.sin(a) * radio);
      if (i < postes) {
        const poste = new THREE.Mesh(new THREE.CylinderGeometry(.11, .13, 1.1, 8), madera);
        poste.position.set(punto.x, .55, punto.z);
        const punta = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), madera);
        punta.position.set(punto.x, 1.1, punto.z);
        corral.add(poste, punta);
      }
      // Dos travesaños entre poste y poste (menos donde va la puerta)
      if (anterior && i !== puertaEn + 1) {
        const medio = anterior.clone().add(punto).multiplyScalar(.5);
        const largo = anterior.distanceTo(punto);
        for (const altura of [.45, .85]) {
          const tabla = new THREE.Mesh(new THREE.BoxGeometry(largo + .1, .12, .07), madera);
          tabla.position.set(medio.x, altura, medio.z);
          tabla.rotation.y = -Math.atan2(punto.z - anterior.z, punto.x - anterior.x);
          corral.add(tabla);
        }
      }
      anterior = punto;
    }
    // Paca de heno y bebedero
    const heno = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, 1, 20), new THREE.MeshStandardMaterial({ color: '#f2cf5b', roughness: 1 }));
    heno.rotation.z = Math.PI / 2;
    heno.position.set(-2, .55, -1.6);
    const bebedero = new THREE.Mesh(new THREE.BoxGeometry(1.4, .45, .6), madera);
    bebedero.position.set(1.7, .25, -1.9);
    bebedero.rotation.y = -.5;
    const aguaBebedero = new THREE.Mesh(new THREE.BoxGeometry(1.25, .05, .45), new THREE.MeshStandardMaterial({ color: '#6ccff6', roughness: .1 }));
    aguaBebedero.position.y = .22;
    bebedero.add(aguaBebedero);
    corral.add(heno, bebedero);
    padre.add(corral);
  }

  crearHuerto(padre, centro, madera, maderaClara) {
    const huerto = new THREE.Group();
    huerto.position.set(centro.x, alturaSuelo(centro.x, centro.z), centro.z);
    const matTierra = new THREE.MeshStandardMaterial({ color: '#6b4226', roughness: 1 });
    const matBrote = new THREE.MeshStandardMaterial({ color: '#5fd068', roughness: .6 });
    for (let fila = 0; fila < 3; fila++) {
      const cantero = new THREE.Mesh(new THREE.BoxGeometry(4.2, .35, 1), maderaClara);
      cantero.position.set(0, .18, -1.9 + fila * 1.5);
      const tierra = new THREE.Mesh(new THREE.BoxGeometry(4, .1, .82), matTierra);
      tierra.position.y = .2;
      cantero.add(tierra);
      // Brotecitos
      for (let b = 0; b < 6; b++) {
        const brote = new THREE.Group();
        for (const lado of [-1, 1]) {
          const hoja = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), matBrote);
          hoja.scale.set(1.6, .5, .9);
          hoja.position.set(lado * .1, .1, 0);
          hoja.rotation.z = lado * .5;
          brote.add(hoja);
        }
        brote.position.set(-1.6 + b * .64, .3, 0);
        cantero.add(brote);
      }
      huerto.add(cantero);
    }
    // Espantapájaros simpático
    const espanta = new THREE.Group();
    const palo = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 2.2, 8), madera);
    palo.position.y = 1.1;
    const brazos = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.6, 8), madera);
    brazos.rotation.z = Math.PI / 2;
    brazos.position.y = 1.55;
    const camisa = new THREE.Mesh(new THREE.CylinderGeometry(.32, .4, .8, 12), new THREE.MeshStandardMaterial({ color: '#4f8fdc' }));
    camisa.position.y = 1.35;
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(.34, 16, 12), new THREE.MeshStandardMaterial({ color: '#ffb347', roughness: .7 }));
    cabeza.position.y = 2.1;
    const sombrero = new THREE.Mesh(new THREE.ConeGeometry(.42, .45, 16), new THREE.MeshStandardMaterial({ color: '#c99a4a' }));
    sombrero.position.y = 2.5;
    const ala = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, .05, 20), sombrero.material);
    ala.position.y = 2.32;
    espanta.add(palo, brazos, camisa, cabeza, sombrero, ala);
    espanta.position.set(2.9, 0, -2.6);
    this.actualizables.push((dt, t) => { espanta.rotation.z = Math.sin(t * .9) * .04; });
    huerto.add(espanta);
    padre.add(huerto);
  }

  crearGranero(padre, centro) {
    const granero = new THREE.Group();
    granero.position.set(centro.x, alturaSuelo(centro.x, centro.z), centro.z);
    const matRojo = new THREE.MeshStandardMaterial({ color: '#d8483c', roughness: .7 });
    const matBlanco = new THREE.MeshStandardMaterial({ color: '#fff6e8', roughness: .6 });
    const matTecho = new THREE.MeshStandardMaterial({ color: '#7a3b34', roughness: .7 });

    const ancho = 5.2, alto = 3.2, fondo = 4.2, altoTecho = 1.7;
    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(ancho, alto, fondo), matRojo);
    cuerpo.position.y = alto / 2;
    granero.add(cuerpo);

    // Techo a dos aguas: dos tablas inclinadas
    const inclinacion = Math.atan2(altoTecho, ancho / 2);
    const largoTabla = Math.hypot(altoTecho, ancho / 2) + .4;
    for (const lado of [-1, 1]) {
      const tabla = new THREE.Mesh(new THREE.BoxGeometry(largoTabla, .22, fondo + .6), matTecho);
      tabla.position.set(lado * ancho / 4, alto + altoTecho / 2 + .05, 0);
      tabla.rotation.z = -lado * inclinacion;
      granero.add(tabla);
    }
    // Triángulos de adelante y atrás
    const forma = new THREE.Shape();
    forma.moveTo(-ancho / 2, 0);
    forma.lineTo(ancho / 2, 0);
    forma.lineTo(0, altoTecho);
    forma.closePath();
    for (const lado of [-1, 1]) {
      const triangulo = new THREE.Mesh(new THREE.ShapeGeometry(forma), matRojo);
      triangulo.position.set(0, alto, lado * fondo / 2);
      if (lado < 0) triangulo.rotation.y = Math.PI;
      granero.add(triangulo);
    }
    // Puerta grande con la "X" blanca clásica
    const puerta = new THREE.Group();
    puerta.position.set(0, 1.15, fondo / 2 + .03);
    const hoja = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.3, .08), new THREE.MeshStandardMaterial({ color: '#b8352c', roughness: .7 }));
    puerta.add(hoja);
    const diagonal = Math.atan2(2.3, 2.2);
    for (const signo of [-1, 1]) {
      const cruz = new THREE.Mesh(new THREE.BoxGeometry(3.1, .14, .1), matBlanco);
      cruz.rotation.z = signo * diagonal;
      cruz.position.z = .05;
      puerta.add(cruz);
    }
    const marco = new THREE.Mesh(new THREE.BoxGeometry(2.45, 2.5, .06), matBlanco);
    marco.position.z = -.02;
    puerta.add(marco);
    granero.add(puerta);
    // Ventanita del pajar (se ilumina de noche)
    const ventana = new THREE.Mesh(new THREE.BoxGeometry(.9, .9, .08), new THREE.MeshStandardMaterial({ color: '#3a2a20', emissive: '#ffc86a', emissiveIntensity: 0 }));
    ventana.position.set(0, alto + .6, fondo / 2 + .02);
    const marcoVentana = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, .05), matBlanco);
    marcoVentana.position.set(0, alto + .6, fondo / 2);
    this.ventanaGranero = ventana;
    granero.add(marcoVentana, ventana);
    // Esquinas blancas
    for (const x of [-1, 1]) for (const z of [-1, 1]) {
      const esquina = new THREE.Mesh(new THREE.BoxGeometry(.18, alto, .18), matBlanco);
      esquina.position.set(x * ancho / 2, alto / 2, z * fondo / 2);
      granero.add(esquina);
    }
    // Silo a un costado
    const silo = new THREE.Group();
    const tubo = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4.6, 20), new THREE.MeshStandardMaterial({ color: '#a9bfd4', roughness: .5, metalness: .2 }));
    tubo.position.y = 2.3;
    const cupula = new THREE.Mesh(new THREE.SphereGeometry(1.02, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#7f97b0', roughness: .4, metalness: .3 }));
    cupula.position.y = 4.6;
    silo.add(tubo, cupula);
    for (let i = 1; i < 4; i++) {
      const aro = new THREE.Mesh(new THREE.TorusGeometry(1.01, .04, 6, 28), new THREE.MeshStandardMaterial({ color: '#6e8296' }));
      aro.rotation.x = Math.PI / 2;
      aro.position.y = i * 1.15;
      silo.add(aro);
    }
    silo.position.set(3.7, 0, -.6);
    granero.add(silo);
    padre.add(granero);
  }

  // ---------------- Partículas: polen y luciérnagas ----------------
  crearParticulas() {
    const textura = texturaPunto();
    const crearNube = (cantidad, color, tamano, alturaMin, alturaMax) => {
      const posiciones = new Float32Array(cantidad * 3);
      const fases = [];
      for (let i = 0; i < cantidad; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * (RADIO_ISLA - 1);
        posiciones.set([Math.cos(a) * r, alturaMin + Math.random() * (alturaMax - alturaMin), Math.sin(a) * r], i * 3);
        fases.push(Math.random() * 10);
      }
      const geometria = new THREE.BufferGeometry();
      geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
      const puntos = new THREE.Points(geometria, new THREE.PointsMaterial({
        size: tamano, map: textura, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      puntos.userData = { base: posiciones.slice(), fases, total: cantidad };
      this.scene.add(puntos);
      return puntos;
    };
    // Polen dorado de día y luciérnagas verdes-amarillas de noche (colores "brillantes" para el bloom)
    this.polen = crearNube(160, new THREE.Color(1.6, 1.4, .8), .16, .4, 6);
    this.luciernagas = crearNube(80, new THREE.Color(2.6, 3, .8), .32, .4, 4);

    this.actualizables.push((dt, t) => {
      for (const [puntos, velocidad, amplitud] of [[this.polen, .5, .6], [this.luciernagas, .8, .9]]) {
        if (!puntos.visible || puntos.material.opacity <= 0) continue;
        const pos = puntos.geometry.attributes.position;
        const { base, fases } = puntos.userData;
        for (let i = 0; i < pos.count; i++) {
          const f = fases[i];
          pos.setXYZ(i,
            base[i * 3] + Math.sin(t * velocidad * .7 + f) * amplitud,
            base[i * 3 + 1] + Math.sin(t * velocidad + f * 2) * amplitud * .5,
            base[i * 3 + 2] + Math.cos(t * velocidad * .6 + f) * amplitud);
        }
        pos.needsUpdate = true;
      }
      // Las luciérnagas titilan
      this.luciernagas.material.size = .32 + Math.sin(t * 6) * .06;
    });
  }

  // ---------------- Postprocesado: bloom + viñeta ----------------
  crearPostprocesado() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    // Bloom: solo brillan las cosas "más claras que el blanco" (LEDs, sol, fuego)
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .55, .5, 1.25);
    this.composer.addPass(this.bloom);
    this.vineta = new ShaderPass(VignetteShader);
    this.vineta.uniforms.offset.value = .95;
    this.vineta.uniforms.darkness.value = 1.1;
    this.composer.addPass(this.vineta);
    this.composer.addPass(new OutputPass());
  }

  // Todos los objetos proyectan y reciben sombra (menos partículas y cielo)
  activarSombras(raiz = this.scene) {
    raiz.traverse(objeto => {
      if (objeto.isMesh && objeto !== this.cielo && objeto !== this.sol && objeto !== this.luna && !objeto.userData.sinSombra) {
        // Las piezas planas (caminos, agua, plaza) solo reciben sombra
        const plana = ['CircleGeometry', 'RingGeometry', 'ShapeGeometry', 'PlaneGeometry'].includes(objeto.geometry.type);
        if (objeto !== this.suelo && !plana) objeto.castShadow = true;
        objeto.receiveShadow = true;
      }
    });
  }

  // ---------------- Calidad gráfica ----------------
  fijarCalidad(alta) {
    this.calidadAlta = alta;
    this.renderer.setPixelRatio(alta ? Math.min(devicePixelRatio, 2) : Math.min(devicePixelRatio, 1) * .8);
    this.bloom.enabled = alta;
    const tamanoSombra = alta ? 2048 : 1024;
    const sombra = this.luzPrincipal.shadow;
    if (sombra.mapSize.x !== tamanoSombra) {
      sombra.mapSize.set(tamanoSombra, tamanoSombra);
      sombra.map?.dispose();
      sombra.map = null;
    }
    // Menos partículas en calidad baja
    for (const puntos of [this.polen, this.luciernagas]) {
      puntos.geometry.setDrawRange(0, alta ? puntos.userData.total : Math.floor(puntos.userData.total / 3));
    }
    this.ajustarTamano();
  }

  // ---------------- Tamaño de pantalla (PC, tablet y celular) ----------------
  ajustarTamano() {
    const ancho = innerWidth, alto = innerHeight;
    const aspecto = ancho / alto;
    this.camera.aspect = aspecto;
    // En pantallas verticales (celular) abrimos el ángulo para que quepa la isla
    const fovHorizontalMinimo = 52 * Math.PI / 180;
    const fovVertical = 2 * Math.atan(Math.tan(fovHorizontalMinimo / 2) / aspecto) * 180 / Math.PI;
    this.camera.fov = Math.max(40, Math.min(fovVertical, 80));
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(ancho, alto, false);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(ancho, alto);
  }

  // ---------------- Tocar objetos 3D ----------------
  // Cualquier objeto con userData.alTocar se vuelve "tocable"
  registrarTocable(objeto) { this.tocables.push(objeto); }
  quitarTocable(objeto) { this.tocables = this.tocables.filter(o => o !== objeto); }

  tocarEn(xPantalla, yPantalla) {
    const raton = new THREE.Vector2((xPantalla / innerWidth) * 2 - 1, -(yPantalla / innerHeight) * 2 + 1);
    const rayo = new THREE.Raycaster();
    rayo.setFromCamera(raton, this.camera);
    const golpes = rayo.intersectObjects(this.tocables.filter(o => o.visible), true);
    // Primera vuelta: lo que se VE (el cuerpo de un animal, una fruta…).
    // Segunda vuelta: las zonas invisibles grandes (ayudan a los dedos pequeños).
    // Así, si dos zonas invisibles se enciman, gana lo que el niño realmente tocó.
    const esInvisible = golpe => golpe.object.material && golpe.object.material.opacity === 0;
    for (const vuelta of [golpe => !esInvisible(golpe), esInvisible]) {
      for (const golpe of golpes.filter(vuelta)) {
        let objeto = golpe.object;
        while (objeto && !objeto.userData.alTocar) objeto = objeto.parent;
        // Si el objeto devuelve false es que no le interesa el toque: probamos con el siguiente
        if (objeto && objeto.userData.alTocar(golpe) !== false) return true;
      }
    }
    return false;
  }

  // ---------------- Cada cuadro ----------------
  actualizar(dt, t) {
    for (const funcion of this.actualizables) funcion(dt, t);
    this.actualizarCamara(t);
    this.cielo.position.copy(this.camera.position);

    // La luz de contorno siempre viene de "detrás" de lo que mira la cámara
    const mira = this.camBase.mira;
    const haciaAtras = mira.clone().sub(this.camera.position).setY(0).normalize();
    this.luzContorno.position.copy(mira).addScaledVector(haciaAtras, 20).add(new THREE.Vector3(0, 12, 0));
    this.luzContorno.target.position.copy(mira);

    // De noche se encienden las ventanas
    const noche = Math.max(0, 1 - this.momento / .45);
    if (this.ventanaGranero) this.ventanaGranero.material.emissiveIntensity = noche * 2.5;
    if (this.ventanaMolino) this.ventanaMolino.material.emissiveIntensity = noche * 2.5;

    this.composer.render(dt);
  }
}

// ---------- Ayudantes ----------

// Número "al azar" que siempre da lo mismo para la misma posición
function ruido(x, y, z) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return n - Math.floor(n);
}

function distanciaASegmento(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

// Árbol redondito estilo caricatura (tronco + copa de esferas)
function crearArbol(escala, conFrutas) {
  const arbol = new THREE.Group();
  const tronco = new THREE.Mesh(new THREE.CylinderGeometry(.22, .34, 1.8, 10), new THREE.MeshStandardMaterial({ color: '#8b5a35', roughness: .9 }));
  tronco.position.y = .9;
  arbol.add(tronco);
  const copa = new THREE.Group();
  copa.position.y = 1.7;
  const tonos = ['#4fb648', '#62c653', '#3fa23f'];
  const bolas = [[0, .9, 0, 1.15], [-.65, .55, .2, .8], [.65, .6, -.1, .85], [.1, 1.5, -.1, .75], [0, .5, .6, .7]];
  bolas.forEach(([x, y, z, r], i) => {
    const bola = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), new THREE.MeshStandardMaterial({ color: tonos[i % 3], roughness: .85 }));
    bola.position.set(x, y, z);
    copa.add(bola);
  });
  if (conFrutas) {
    const matFruta = new THREE.MeshStandardMaterial({ color: '#ff4f4f', roughness: .35 });
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1;
      const fruta = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), matFruta);
      fruta.position.set(Math.cos(a) * .95, .7 + (i % 3) * .3, Math.sin(a) * .95);
      copa.add(fruta);
    }
  }
  arbol.add(copa);
  arbol.scale.setScalar(escala);
  arbol.userData.copa = copa;
  return arbol;
}
