import re, sys, json, pathlib
# Uso: python -I build_maqueta.py <carpeta maqueta> <mdi.js del paquete @mdi/js>
src = pathlib.Path(sys.argv[1])
mdi = pathlib.Path(sys.argv[2]).read_text(encoding='utf-8')
paths = dict(re.findall(r'export var (mdi\w+) = "([^"]+)";', mdi))
js = (src / 'hm.js').read_text(encoding='utf-8') + '\n' + (src / 'hm2.js').read_text(encoding='utf-8') + '\n' + (src / 'hm3.js').read_text(encoding='utf-8')
css = (src / 'hm.css').read_text(encoding='utf-8') + '\n' + (src / 'hm2.css').read_text(encoding='utf-8') + '\n' + (src / 'hm3.css').read_text(encoding='utf-8')
used = sorted(set(re.findall(r'\bmdi[A-Z]\w*', js)))
missing = [n for n in used if n not in paths]
icons = {n: paths[n] for n in used if n in paths}
page = (src / 'page.html').read_text(encoding='utf-8')
page = page.replace('/*CSS*/', css).replace('/*ICONS*/', 'window.HM_ICONS=' + json.dumps(icons, separators=(',', ':')) + ';').replace('/*JS*/', js)
(src / 'index.html').write_text(page, encoding='utf-8', newline='\n')
print(len(used), 'iconos;', 'faltan:', missing, '; tamaño', len(page.encode('utf-8')), 'bytes')
