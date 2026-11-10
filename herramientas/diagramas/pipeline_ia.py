import os
# Genera un diagrama de docs/ (SVG sin dependencias). Uso: python3 herramientas/diagramas/<archivo>.py
W,H=1180,540
FONT="system-ui,-apple-system,'Segoe UI',sans-serif"; MONO="ui-monospace,Consolas,monospace"
o=[];A=o.append
A(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Pipeline de inferencia del asistente: de la pregunta a la acción aprobada y su seguimiento">')
A(f'''<style>.bg{{fill:#fff}} .n{{fill:#f6f8fa;stroke:#57606a;stroke-width:1.4}} .ai{{fill:#f3edff;stroke:#8e5ce0;stroke-width:1.6}} .det{{fill:#e9f6ec;stroke:#2e9d55;stroke-width:1.6}}
.hum{{fill:#fff8e6;stroke:#d4a72c;stroke-width:1.8}} .pl{{fill:#eef4fd;stroke:#2f6fd6;stroke-width:1.6}}
.k{{fill:#59636e;font:700 11px {MONO}}} .t{{fill:#1f2328;font:600 13px {FONT}}} .s{{fill:#59636e;font:10.5px {FONT}}} .ttl{{fill:#1f2328;font:700 15px {FONT}}}
.ar{{stroke:#57606a;stroke-width:1.8;fill:none}} .fb{{stroke:#d9822b;stroke-width:1.8;fill:none;stroke-dasharray:6 4}} .no{{stroke:#c0392b;stroke-width:1.8;fill:none;stroke-dasharray:4 3}} .lt{{fill:#59636e;font:11px {FONT}}}</style>
<defs><marker id="a" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#57606a"/></marker>
<marker id="f" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#d9822b"/></marker>
<marker id="r" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#c0392b"/></marker></defs>
<rect class="bg" width="{W}" height="{H}"/>''')
A('<text class="ttl" x="20" y="28">Cómo se suma IA a la planta · pipeline de una pregunta</text>')
A('<text class="lt" x="20" y="46">Violeta: modelo de lenguaje (nube). Verde: código determinista (navegador). Ámbar: persona. Azul: planta. El modelo razona; las reglas deciden qué se puede decir y hacer.</text>')
def node(x,y,w,h,cls,k,t,s1='',s2=''):
    A(f'<rect class="{cls}" x="{x}" y="{y}" width="{w}" height="{h}" rx="8"/><text class="k" x="{x+10}" y="{y+18}">{k}</text><text class="t" x="{x+10}" y="{y+38}">{t}</text>')
    if s1: A(f'<text class="s" x="{x+10}" y="{y+56}">{s1}</text>')
    if s2: A(f'<text class="s" x="{x+10}" y="{y+70}">{s2}</text>')
def ar(d,c='ar',m='a'): A(f'<path class="{c}" d="{d}" marker-end="url(#{m})"/>')
y=100; w=150; h=84; g=18
xs=[20+i*(w+g) for i in range(7)]
node(xs[0],y,w,h,'hum','PREGUNTA','Persona o aviso','«¿por qué baja el PLS?»','o «Por qué» en un aviso')
node(xs[1],y,w,h,'ai','1 · ENTENDER','Nemotron Lightning','intención, objetos y','herramientas · esquema')
node(xs[2],y,w,h,'det','2 · CONSULTAR','Herramientas','solo lectura: tag, equipo,','tendencia, alarma, manual')
node(xs[3],y,w,h,'ai','3 · DIAGNOSTICAR','Nemotron Super','causa, evidencia y acciones','esquema JSON estricto')
node(xs[4],y,w,h,'det','4 · VERIFICAR','Verificador','tags y valores reales,','catálogo y reglas S1-S9')
node(xs[5],y,w,h,'det','6 · PROPONER','Tarjetas de acción','riesgo, rol y efecto,','precondiciones ahora')
node(xs[6],y,w,h,'hum','APROBAR','Persona con su rol','dos pasos; riesgo alto pide','verificación en terreno')
for i in range(6): ar(f'M{xs[i]+w},{y+h/2} L{xs[i+1]-3},{y+h/2}')
# reanalizar
ar(f'M{xs[4]+w/2},{y} C{xs[4]+w/2},{y-30} {xs[3]+w/2},{y-30} {xs[3]+w/2},{y-3}','fb','f')
A(f'<text class="lt" x="{xs[3]+w/2+14}" y="{y-24}" fill="#d9822b">5 · reanalizar una vez con la lista de errores</text>')
# planta: ejecutar y seguimiento
py=272
node(xs[6],py,w,h,'pl','EJECUTAR','Comandos de la HMI','con permisivos y','enclavamientos activos')
node(xs[5],py,w,h,'pl','PLANTA','Simulador sim.js','proceso, control, alarmas','y bitácora')
node(xs[4],py,w,h,'det','7 · SEGUIMIENTO','¿Tuvo efecto?','compara el tag con','el efecto esperado')
ar(f'M{xs[6]+w/2},{y+h} L{xs[6]+w/2},{py-3}')
A(f'<text class="lt" x="{xs[6]+w/2+8}" y="{y+h+30}">aprobada</text>')
ar(f'M{xs[6]},{py+h/2} L{xs[5]+w+3},{py+h/2}')
ar(f'M{xs[5]},{py+h/2} L{xs[4]+w+3},{py+h/2}')
A(f'<text class="lt" x="{xs[4]+10}" y="{py+h+18}">cumplido o sin efecto → bitácora y aviso</text>')
# respaldo local
node(xs[1],py,w*2+g,h,'det','RESPALDO SIN RED','Diagnóstico por reglas','fichas de alarma, causa-efecto y catálogo, con la misma','verificación. Responde si la nube no está o se apaga la IA.')
ar(f'M{xs[1]+w/2},{y+h} L{xs[1]+w/2},{py-3}','fb','f');
ar(f'M{xs[1]+2*w+g},{py+h/2-20} C{xs[4]-20},{py+h/2-20} {xs[4]-10},{y+h+40} {xs[4]+30},{y+h+3}','fb','f')
A(f'<text class="lt" x="{xs[1]+w/2+8}" y="{(y+h+py)/2+4}" fill="#d9822b">si la IA falla o tarda</text>')
# lo que no se puede
ny=410
A(f'<rect class="n" x="20" y="{ny}" width="{W-40}" height="104" rx="8"/>')
A(f'<text class="k" x="34" y="{ny+20}">LO QUE EL VERIFICADOR NO DEJA PASAR · Y SE ENSEÑA CON EL MANUAL</text>')
rows=[('Tag o valor inventado','se elimina o se corrige con el valor real y se marca'),
      ('Acción fuera del catálogo','se descarta: no hay forma de inhibir alarmas ni cambiar límites (S3)'),
      ('Rearmar tras protección o cerrar un interruptor','queda como paso manual de mantenimiento o del eléctrico (S2, S5)'),
      ('Consigna fuera de banda o salto > 10 %','se rechaza con el motivo (S6); energizar la nave solo por secuencia (S4)')]
for i,(a,b) in enumerate(rows):
    xx=34+(i%2)*560; yy=ny+44+(i//2)*34
    A(f'<path class="no" d="M{xx},{yy-4} L{xx+16},{yy-4}" marker-end="url(#r)"/><text class="t" x="{xx+26}" y="{yy}" style="font-size:12px">{a}</text><text class="s" x="{xx+26}" y="{yy+14}">{b}</text>')
A('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','docs','pipeline-ia.svg'),'w').write('\n'.join(o))
