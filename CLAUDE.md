# Pip en la Granja Mágica — contexto del proyecto

Juego web 3D educativo para niños de **3 a 5 años**. Proyecto final de Educación Inicial de **Pamela Obando**.
Pip es un robotito cuyos sensores de ver y escuchar están apagados; el niño lo ayuda jugando en 3 zonas.

## Reglas del usuario
- **No editar archivos que ya existan fuera de `pip-granja/`** (PROGRAPAM tiene otros juegos: `index.html` = El Acuario
  Contador, `acuario.html` copia de respaldo, `mounstro.*`, `robot.*`, etc.).
- La página principal se llama **`pip_granja.html`** (no `index.html`).
- Código **comentado en español** (el usuario está aprendiendo).
- El usuario pidió "hacer todo de una vez" (fases 2–5 juntas) y que **todo funcione al apretar**.

## ⚠ Cómo se ejecuta (importante)
El usuario **no tiene Live Server** y abre los archivos con doble clic (`file://`). Los navegadores bloquean módulos ES
desde `file://`, por eso el código fuente (módulos en `js/`) se **empaqueta** con `python construir.py`:
- `js/juego_completo.js` → script clásico (sin import/export) que usa `pip_granja.html`.
- `PIP_GRANJA_FINAL.html` → todo adentro (Three.js + CSS + JS), para la exposición.
**Después de cambiar cualquier archivo de `js/` o `css/` hay que ejecutar `python construir.py`.**
El empaquetador envuelve cada módulo en una función y convierte `import`/`export` en variables (`__modulos[ruta]`).
Ojo: no crear propiedades con el mismo nombre que un método (pasó con `audio.voz` → el método ahora es `sintetizar`).

## Estructura
```
pip-granja/
  pip_granja.html          página (carga js/juego_completo.js)
  PIP_GRANJA_FINAL.html    GENERADO: todo en un archivo
  construir.py             empaquetador (Python, sin dependencias)
  css/estilos.css          interfaz HTML (botones, título, globo, progreso, 🔊, créditos)
  js/main.js               director: estados, bucle, toques, calidad automática, atajos de prueba
  js/escena.js             render, luces de cine, cielo día/noche, isla, decorado, partículas, cámara, ZONAS
  js/pip.js                Pip: modelo, cara LED (canvas→emissiveMap), emociones, saltos, vuelo, luces del pecho
  js/animales.js           6 animales (clase Animal) con ojos grandes, resortes, squash & stretch, baile
  js/frutas.js             6 frutas 3D, siluetas 2D para el espejo, planta que crece
  js/efectos.js            confeti (InstancedMesh), chispas (Points HDR), fuegos artificiales
  js/audio.js              música generada, efectos, sonidos de animales (sintetizar), voz speechSynthesis
  js/ui.js                 DOM: título, globo, avisos, progreso, botón repetir, créditos
  js/intro.js              cohete, humo y secuencia de llegada
  js/mapa.js               carteles flotantes de las 3 zonas
  js/final.js              fiesta final + créditos
  js/utilidades.js         easing, tweens (animar/esperar), canvas helpers
  js/zonas/base.js         ZonaBase: sesiones cancelables, esperarToque/entregarToque, detener()
  js/zonas/corral.js       Fase 2 (oído)
  js/zonas/huerto.js       Fase 3 (vista)
  js/zonas/granero.js      Fase 4 (búsqueda, noche, linterna, estéreo)
  libs/                    Three.js r160 + addons (EffectComposer, UnrealBloomPass, ShaderPass, OutputPass,
                           VignetteShader, RoomEnvironment)
```

## Decisiones de diseño
- **Look Pixar**: ACES, PCFSoftShadowMap, RoomEnvironment; 3 luces (principal cálida, relleno hemisférico, contorno que
  siempre viene de detrás de lo que mira la cámara). Bloom (umbral 1.25: solo brilla lo HDR) + viñeta.
- **Materiales**: Pip/cohete/frutas MeshPhysicalMaterial con clearcoat; lana de la oveja con `sheen`.
- **Día/noche**: `escena.fijarMomento(m)` / `cambiarMomento(meta, seg)` (0 noche · .5 amanecer · 1 día).
- **Animación**: todo con easing (`animar()` → Promise). Squash & stretch y follow-through con resortes.
- **Zonas = sesiones**: `iniciar()` devuelve true si el niño terminó; 🏠 llama `detener()` que invalida la sesión
  (todas las esperas terminan sin efectos). El granero devuelve el día al detenerse.
- **Toques**: objetos con `userData.alTocar` registrados en `escena.registrarTocable()`. `tocarEn` prioriza la geometría
  VISIBLE y luego las zonas invisibles grandes; un `alTocar` que devuelve `false` deja pasar el toque.
- **Nunca castigar**: error → sonido suave "casi", Pip se marea gracioso, dice qué tocó y "Intenta otra vez".
- **Voz**: voz `es-*` (Sabina, Dalia, Helena…), pitch 1.45, rate .95; quita emojis; baja la música al hablar.
- **Calidad**: ✨/🐢; automática si fps < 38 en el mapa.
- **Ubicaciones** (isla radio 16): plaza (0,3) · corral (-7.5,1) · huerto (7.5,1.5) · granero (0,-8) · molino (-9.5,-7) ·
  estanque (9,-7.5) · cohete (-4.6,-10.6) · punta (-6.6,-9.2) · pacas z=-3.4, x=±1.1/±3.3.
  `escena.lugarLibre()` evita poner pasto/flores encima.

## Atajos de prueba
- `#intro` · `#titulo` · `#mapa` al final de la dirección.
- `?prueba`: panel de diagnóstico (estado, errores), tiempo sin frenar en PCs lentas y `window.pruebas`
  (juego, entrarZona, irAlMapa, comenzarFinal, zonas, final, tocar(objeto3D), THREE…).
- Verificación usada: Chrome headless controlado por CDP (script en el scratchpad) + "jugador automático" que recorre
  las 3 zonas (con errores a propósito) hasta el final. Pasó sin errores, también desde `file://`.

## Avance
- [x] Fase 1 — Base, isla, Pip, intro con cohete, título, mapa, 🏠, audio, calidad, responsive.
- [x] Fase 2 — Corral: juego libre con los 6 animales + 4 rondas "¿Quién hace…?" → luz azul.
- [x] Fase 3 — Huerto: espejo (color/silueta) + 3 frutas en cajones + planta que crece (4 rondas) → luz verde.
- [x] Fase 4 — Granero de noche: linterna que sigue al dedo, sonido estéreo, 4 pacas, 3 rondas → luz amarilla.
- [x] Fase 5 — Final: amanecer, animales bailando alrededor de Pip, fuegos, confeti, créditos, "Jugar otra vez".
- [x] `PIP_GRANJA_FINAL.html` generado.
