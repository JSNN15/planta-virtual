import os
# Genera un diagrama de docs/ (SVG sin dependencias). Uso: python3 herramientas/diagramas/<archivo>.py
W,H=1100,580
FONT="system-ui,-apple-system,'Segoe UI',sans-serif"; MONO="ui-monospace,Consolas,monospace"
o=[];A=o.append
A(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Modelo Purdue de la planta virtual y dónde entra la IA">')
A(f'''<style>.bg{{fill:#fff}} .lv{{fill:#f6f8fa;stroke:#d0d7de}} .lvn{{fill:#1f2328;font:700 13px {MONO}}} .lvt{{fill:#59636e;font:600 11px {FONT}}}
.bx{{fill:#fff;stroke:#57606a;stroke-width:1.3}} .bxi{{fill:#f3edff;stroke:#8e5ce0;stroke-width:1.6}} .bxd{{fill:#fff8e6;stroke:#d4a72c;stroke-width:1.6}}
.t{{fill:#1f2328;font:600 12px {FONT}}} .s{{fill:#59636e;font:10.5px {FONT}}} .ttl{{fill:#1f2328;font:700 15px {FONT}}}
.up{{stroke:#2f6fd6;stroke-width:2.5;fill:none}} .dn{{stroke:#c0392b;stroke-width:2.5;fill:none}} .lt{{fill:#59636e;font:11px {FONT}}}</style>
<defs><marker id="au" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#2f6fd6"/></marker>
<marker id="ad" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9 Z" fill="#c0392b"/></marker></defs>
<rect class="bg" width="{W}" height="{H}"/>''')
A('<text class="ttl" x="20" y="28">Modelo Purdue (ISA-95 / IEC 62443) · dónde vive cada pieza y por dónde entra la IA</text>')
L=[('Nube','Inferencia',[('NVIDIA NIM','Nemotron Lightning · Super · Embed','i')]),
   ('4','Negocio',[('Vista de gerencia','plan, precio, pérdidas, cosechas','')]),
   ('3.5','DMZ',[('nv-gateway (Cloudflare Worker)','clave protegida · orígenes · límite · prompts fijos','d')]),
   ('3','Operaciones',[('Asistente de IA','vigilancia · verificador · aprobación','i'),('Base de conocimiento','fichas · acciones · reglas · manuales',''),('Historiador y bitácora','8 h de tendencias · eventos','')]),
   ('2','Supervisión',[('HMI de sala','ISA-101 · alarmas ISA-18.2 · secuencias ISA-106','')]),
   ('1','Control',[('Lazos PID y cascadas','permisivos · enclavamientos · disparos',''),('SIS (en planta real)','independiente, IEC 61511','')]),
   ('0','Proceso',[('Sensores y actuadores','75 tags · válvulas · motores · rectificador','')])]
y=48; hh=70
for i,(n,t,bxs) in enumerate(L):
    yy=y+i*hh
    A(f'<rect class="lv" x="20" y="{yy}" width="760" height="{hh-6}" rx="6"/><text class="lvn" x="34" y="{yy+28}">{n}</text><text class="lvt" x="34" y="{yy+46}">{t}</text>')
    bw=(640-12*(len(bxs)-1))/len(bxs)
    for j,(a,b,k) in enumerate(bxs):
        x=130+j*(bw+12)
        cls={'i':'bxi','d':'bxd'}.get(k,'bx')
        A(f'<rect class="{cls}" x="{x:.0f}" y="{yy+9}" width="{bw:.0f}" height="{hh-24}" rx="5"/><text class="t" x="{x+bw/2:.0f}" y="{yy+30}" text-anchor="middle">{a}</text><text class="s" x="{x+bw/2:.0f}" y="{yy+46}" text-anchor="middle">{b}</text>')
# flechas
A('<path class="up" d="M820,520 L820,70" marker-end="url(#au)"/>')
A('<text class="t" x="836" y="90" fill="#2f6fd6">Datos hacia arriba</text>')
for k,l in enumerate(['Solo lectura: la IA recibe una foto','del estado y el resultado de','herramientas de consulta.','Nunca escribe en la planta.']):
    A(f'<text class="lt" x="836" y="{108+k*15}">{l}</text>')
A('<path class="dn" d="M1072,275 L1072,450" marker-end="url(#ad)"/>')
A('<text class="t" x="836" y="300" fill="#c0392b">Acciones hacia abajo</text>')
for k,l in enumerate(['Solo desde el nivel 2-3, por los','mismos comandos de la HMI y con','aprobación humana en dos pasos.','Permisivos, enclavamientos y SIS','siguen mandando (reglas S1 a S9).']):
    A(f'<text class="lt" x="836" y="{318+k*15}">{l}</text>')
A('<text class="lt" x="20" y="548">Violeta: componentes de IA. Ámbar: zona desmilitarizada, la única salida hacia la nube. En una planta real la nube no llega bajo el nivel 3.5,</text>')
A('<text class="lt" x="20" y="564">el asistente corre en la red de operaciones y el SIS es independiente del sistema de control y de la IA.</text>')
A('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','docs','purdue.svg'),'w').write('\n'.join(o))
