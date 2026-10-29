# =========================================================
# construir.py — empaqueta TODO el juego para que funcione
# con DOBLE CLIC (sin Live Server y sin internet).
#
# ¿Por qué hace falta? El código está separado en módulos
# (import/export). Los navegadores NO cargan módulos desde un
# archivo abierto con doble clic (file://) por seguridad.
# Este script junta Three.js y todos nuestros archivos en uno
# solo, sin import/export, y genera:
#
#   js/juego_completo.js     → lo usa pip_granja.html
#   PIP_GRANJA_FINAL.html    → TODO dentro de un único archivo
#                              (para el día de la exposición)
#
# Uso:  python construir.py      (ejecutarlo después de cambiar el código)
# =========================================================
import json
import posixpath
import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
ENTRADA = 'js/main.js'

# import { a, b as c } from '...';   import * as T from '...';
PATRON_IMPORT = re.compile(r"^\s*import\s+(.+?)\s+from\s+['\"](.+?)['\"];?", re.S | re.M)
# export { a, b as c };
PATRON_EXPORT_LISTA = re.compile(r"^\s*export\s*\{([^}]*)\};?", re.M)
# export const/let/function/class NOMBRE
PATRON_EXPORT_DECL = re.compile(r"^(\s*)export\s+((?:async\s+)?function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)", re.M)


def resolver(desde, especificador):
    """Convierte 'three', 'three/addons/...' o './x.js' en una ruta de archivo."""
    if especificador == 'three':
        return 'libs/three.module.js'
    if especificador.startswith('three/addons/'):
        return 'libs/addons/' + especificador[len('three/addons/'):]
    return posixpath.normpath(posixpath.join(posixpath.dirname(desde), especificador))


def transformar(ruta):
    """Lee un módulo y cambia sus import/export por variables normales."""
    codigo = (RAIZ / ruta).read_text(encoding='utf-8')
    dependencias = []

    def cambiar_import(m):
        clausula, especificador = m.group(1).strip(), m.group(2)
        destino = resolver(ruta, especificador)
        dependencias.append(destino)
        if clausula.startswith('* as '):
            return f"const {clausula[5:].strip()} = __modulos[{json.dumps(destino)}];"
        if clausula.startswith('{'):
            partes = [p.strip() for p in clausula.strip('{} \n').split(',') if p.strip()]
            nombres = [p.replace(' as ', ': ') for p in partes]
            return f"const {{ {', '.join(nombres)} }} = __modulos[{json.dumps(destino)}];"
        raise ValueError(f'import no soportado en {ruta}: {clausula}')

    codigo = PATRON_IMPORT.sub(cambiar_import, codigo)

    exportados = []   # (nombre_local, nombre_exportado)

    def cambiar_lista(m):
        for parte in m.group(1).split(','):
            parte = parte.strip()
            if not parte:
                continue
            if ' as ' in parte:
                local, exportado = [p.strip() for p in parte.split(' as ')]
            else:
                local = exportado = parte
            exportados.append((local, exportado))
        return ''

    codigo = PATRON_EXPORT_LISTA.sub(cambiar_lista, codigo)

    def cambiar_decl(m):
        exportados.append((m.group(3), m.group(3)))
        return f"{m.group(1)}{m.group(2)} {m.group(3)}"

    codigo = PATRON_EXPORT_DECL.sub(cambiar_decl, codigo)

    if re.search(r"^\s*export\s", codigo, re.M):
        raise ValueError(f'Quedó un export sin convertir en {ruta}')

    retorno = ', '.join(f"{json.dumps(exp)}: {loc}" for loc, exp in exportados)
    envoltura = (
        f"// ===== {ruta} =====\n"
        f"__modulos[{json.dumps(ruta)}] = (function () {{\n'use strict';\n{codigo}\n"
        f"return {{ {retorno} }};\n}})();\n"
    )
    return envoltura, dependencias


def empaquetar():
    """Recorre los módulos desde main.js y los ordena: primero las dependencias."""
    orden, visitados, codigos = [], set(), {}

    def visitar(ruta):
        if ruta in visitados:
            return
        visitados.add(ruta)
        codigo, dependencias = transformar(ruta)
        for dependencia in dependencias:
            visitar(dependencia)
        codigos[ruta] = codigo
        orden.append(ruta)

    visitar(ENTRADA)
    cuerpo = ''.join(codigos[r] for r in orden)
    return (
        "// Pip en la Granja Mágica — archivo GENERADO por construir.py (no editar a mano).\n"
        "// Para cambiar el juego, edita los archivos de js/ y vuelve a ejecutar: python construir.py\n"
        "(function () {\n'use strict';\nconst __modulos = {};\n" + cuerpo + "})();\n"
    ), orden


def main():
    paquete, orden = empaquetar()
    (RAIZ / 'js' / 'juego_completo.js').write_text(paquete, encoding='utf-8')

    # Archivo único para la exposición: CSS y JS van DENTRO del HTML
    html = (RAIZ / 'pip_granja.html').read_text(encoding='utf-8')
    css = (RAIZ / 'css' / 'estilos.css').read_text(encoding='utf-8')
    enlace_css = '<link rel="stylesheet" href="css/estilos.css">'
    script_js = '<script src="js/juego_completo.js"></script>'
    assert enlace_css in html and script_js in html, 'pip_granja.html cambió: revisa construir.py'
    seguro = paquete.replace('</script', '<\\/script')
    html = html.replace(enlace_css, f'<style>\n{css}\n</style>')
    html = html.replace(script_js, f'<script>\n{seguro}\n</script>')
    (RAIZ / 'PIP_GRANJA_FINAL.html').write_text(html, encoding='utf-8')

    print('Módulos empaquetados:', len(orden))
    for ruta in orden:
        print('  ·', ruta)
    print(f"js/juego_completo.js     {len(paquete) / 1024:.0f} KB")
    print(f"PIP_GRANJA_FINAL.html    {len(html) / 1024:.0f} KB")
    print('¡Listo! Abre PIP_GRANJA_FINAL.html con doble clic.')


if __name__ == '__main__':
    main()
