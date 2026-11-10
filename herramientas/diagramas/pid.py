import os
# Genera un diagrama de docs/ (SVG sin dependencias). Uso: python3 herramientas/diagramas/<archivo>.py
# Genera docs/pid.svg: P&ID simplificado de la planta (ISA-5.1)
W,H=1200,640
o=[]
A=o.append
FONT="system-ui,-apple-system,'Segoe UI',sans-serif"
MONO="ui-monospace,Consolas,monospace"
C={'ore':'#8a6a4a','acid':'#c0392b','pls':'#2e9d55','ref':'#2b8a9e','org':'#d9822b','elr':'#2f6fd6','elp':'#7aa3e5','sig':'#8b949e','pwr':'#a855f7'}
A(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="P&amp;ID simplificado de la planta LX-SX-EW con sus lazos de control según ISA-5.1">')
A(f'''<style>
.bg{{fill:#fff}} .area{{fill:none;stroke:#d0d7de;stroke-width:1.2;stroke-dasharray:6 4}} .at{{fill:#59636e;font:600 12px {MONO};letter-spacing:.06em}}
.eq{{fill:#f6f8fa;stroke:#57606a;stroke-width:1.6}} .et{{fill:#1f2328;font:600 11.5px {FONT}}} .es{{fill:#59636e;font:10.5px {FONT}}}
.b{{fill:#fff;stroke:#1f2328;stroke-width:1.4}} .bt{{fill:#1f2328;font:600 9.5px {MONO}}} .hmi{{stroke:#1f2328;stroke-width:1.2}}
.sig{{stroke:{C['sig']};stroke-width:1.3;stroke-dasharray:5 3;fill:none}} .lt{{fill:#59636e;font:11px {FONT}}} .ttl{{fill:#1f2328;font:700 15px {FONT}}}
</style>
<rect class="bg" width="{W}" height="{H}"/>''')
A(f'<text class="ttl" x="20" y="28">P&amp;ID simplificado · lazos principales (ISA-5.1)</text>')
A(f'<text class="lt" x="20" y="46">Burbuja con línea = instrumento en la HMI de sala. Línea punteada = señal. Colores = fluido. Detalle completo en cada pantalla de área de la planta virtual.</text>')
def area(x,y,w,h,t): A(f'<rect class="area" x="{x}" y="{y}" width="{w}" height="{h}" rx="8"/><text class="at" x="{x+8}" y="{y+16}">{t}</text>')
def pipe(pts,k,arrow=True,w=3):
    d='M'+' L'.join(f'{x},{y}' for x,y in pts)
    A(f'<path d="{d}" fill="none" stroke="{C[k]}" stroke-width="{w}" stroke-linejoin="round"/>')
    if arrow:
        (x1,y1),(x2,y2)=pts[-2],pts[-1]
        import math
        a=math.atan2(y2-y1,x2-x1); s=8
        p1=(x2-s*math.cos(a-0.45),y2-s*math.sin(a-0.45)); p2=(x2-s*math.cos(a+0.45),y2-s*math.sin(a+0.45))
        A(f'<path d="M{x2},{y2} L{p1[0]:.1f},{p1[1]:.1f} L{p2[0]:.1f},{p2[1]:.1f} Z" fill="{C[k]}"/>')
def sig(pts):
    A('<path class="sig" d="M'+' L'.join(f'{x},{y}' for x,y in pts)+'"/>')
def bub(x,y,tag,hmi=True):
    l,n=tag.split('-')
    A(f'<circle class="b" cx="{x}" cy="{y}" r="17"/>')
    if hmi: A(f'<line class="hmi" x1="{x-17}" y1="{y}" x2="{x+17}" y2="{y}"/>')
    A(f'<text class="bt" x="{x}" y="{y-4}" text-anchor="middle">{l}</text><text class="bt" x="{x}" y="{y+12}" text-anchor="middle">{n}</text>')
def box(x,y,w,h,t,s=None,rx=4):
    A(f'<rect class="eq" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}"/><text class="et" x="{x+w/2}" y="{y+h/2+(0 if s else 4)}" text-anchor="middle">{t}</text>')
    if s: A(f'<text class="es" x="{x+w/2}" y="{y+h/2+14}" text-anchor="middle">{s}</text>')
def pump(x,y,t):
    A(f'<circle class="eq" cx="{x}" cy="{y}" r="11"/><path d="M{x-6},{y+6} L{x+9},{y} L{x-6},{y-6}" fill="none" stroke="#57606a" stroke-width="1.4"/><text class="es" x="{x}" y="{y+25}" text-anchor="middle">{t}</text>')
def valve(x,y,t,vert=False):
    if vert: A(f'<path d="M{x-7},{y-9} L{x+7},{y-9} L{x-7},{y+9} L{x+7},{y+9} Z" class="eq"/>')
    else: A(f'<path d="M{x-9},{y-7} L{x-9},{y+7} L{x+9},{y-7} L{x+9},{y+7} Z" class="eq"/>')
    A(f'<text class="es" x="{x}" y="{y-12}" text-anchor="middle">{t}</text>')
def tank(x,y,w,h,t,s=None):
    A(f'<path class="eq" d="M{x},{y+8} Q{x+w/2},{y-6} {x+w},{y+8} L{x+w},{y+h} L{x},{y+h} Z"/><text class="et" x="{x+w/2}" y="{y+h/2+6}" text-anchor="middle">{t}</text>')
    if s: A(f'<text class="es" x="{x+w/2}" y="{y+h/2+20}" text-anchor="middle">{s}</text>')

# Áreas
area(14,62,330,300,'100 · CHANCADO Y AGLOMERACIÓN')
area(356,62,250,300,'200 · LIXIVIACIÓN')
area(618,62,250,300,'300 · EXTRACCIÓN POR SOLVENTES')
area(880,62,306,300,'400 · ELECTROOBTENCIÓN')
area(14,376,1172,150,'500 · SERVICIOS · ÁCIDO, AGUA Y ENERGÍA')

# --- Área 100
A('<path class="eq" d="M40,110 L110,110 L95,150 L55,150 Z"/><text class="et" x="75" y="132" text-anchor="middle">CR-101</text>')
bub(130,100,'AIT-100')
A('<path class="eq" d="M40,235 L80,185 L120,235 Z"/><text class="es" x="80" y="250" text-anchor="middle">acopio fino</text>')
bub(30,195,'LIT-100',True)
pipe([(75,150),(75,190)],'ore')
box(130,215,70,26,'FD-101')
pipe([(120,228),(130,228)],'ore',False)
A('<line x1="200" y1="228" x2="268" y2="228" stroke="#57606a" stroke-width="5"/><circle cx="200" cy="228" r="4" fill="#57606a"/><circle cx="268" cy="228" r="4" fill="#57606a"/><text class="es" x="234" y="248" text-anchor="middle">CV-101</text>')
bub(234,190,'WIT-101'); bub(170,180,'WIC-101'); sig([(217,190),(187,180)]); sig([(170,197),(165,215)])
box(276,206,58,44,'AD-101','M-103',22)
pipe([(268,228),(276,228)],'ore',False)
tank(270,290,48,46,'TK-103')
pump(250,330,'P-102'); valve(290,276,'FCV-102',True)
pipe([(270,330),(262,330)],'acid',False); pipe([(240,330),(228,330),(228,276),(281,276)],'acid',False); pipe([(299,276),(305,276),(305,250)],'acid')
bub(190,300,'FFIC-102'); sig([(207,300),(281,284)]); sig([(190,283),(234,207)])
A(f'<text class="es" x="40" y="300">razón ácido/mineral</text><text class="es" x="40" y="313">≈ 20 kg/t (cascada)</text>')
pipe([(334,228),(380,228),(380,170),(400,170)],'ore')

# --- Área 200
A('<path class="eq" d="M400,200 L440,140 L540,140 L580,200 Z"/><text class="et" x="490" y="178" text-anchor="middle">Pila (3 sectores)</text>')
pump(420,300,'P-201A/B')
bub(470,110,'FIC-211'); 
pipe([(431,300),(450,300),(450,124),(500,124),(500,140)],'ref')
sig([(470,127),(478,124)])
bub(390,300,'PIT-202',False)
tank(500,260,80,56,'TK-202','PLS')
pipe([(560,200),(560,260)],'pls')
bub(590,240,'AIT-206'); bub(590,286,'LIT-204')
A('<text class="es" x="400" y="232">refino (riego)</text>')

# --- Área 300
pump(640,330,'P-202A/B')
pipe([(580,300),(628,330)],'pls',False)
valve(680,330,'')
A('<text class="es" x="680" y="352" text-anchor="middle">FCV-205</text>')
bub(680,290,'FIC-205'); sig([(680,307),(680,321)])
pipe([(651,330),(671,330)],'pls',False)
pipe([(689,330),(700,330),(700,150),(712,150)],'pls')
for i,(t,s) in enumerate([('E1','extracción'),('E2','extracción'),('W1','lavado M-304'),('S1','reextracción')]):
    box(712+i*38 if False else 712, 96+i*0, 0,0,'')
xs=[(712,'E1','extracción'),(760,'E2',''),(808,'W1','lavado'),(808,'S1','reextracción')]
box(712,130,42,40,'E1'); box(760,130,42,40,'E2'); box(808,100,52,34,'W1','M-304'); box(808,170,52,40,'S1')
pipe([(754,150),(760,150)],'org',False); pipe([(802,145),(820,134)],'org',False); pipe([(834,134),(834,170)],'org')
pipe([(808,200),(712,200),(712,170)],'org')
pump(760,240,'P-305'); bub(700,240,'FFIC-301'); sig([(717,240),(749,240)])
pipe([(733,170),(733,110),(560,110),(560,140)],'ref')
A('<text class="es" x="600" y="104">refino a la pila</text>')
bub(845,250,'AIT-309'); bub(650,175,'KY-303',False)
A(f'<text class="es" x="640" y="214">O/A ≈ 0,9</text>')

# --- Área 400
tank(900,250,70,60,'TK-401','electrolito')
pipe([(860,190),(890,190),(890,270),(900,270)],'elr')
pump(1000,300,'P-401A/B')
box(1040,250,58,36,'HX-401')
bub(1069,310,'TIC-403'); sig([(1069,293),(1069,286)])
pipe([(970,300),(988,300)],'elr',False); pipe([(1011,300),(1030,300),(1030,268),(1040,268)],'elr',False)
pipe([(1098,268),(1120,268),(1120,230)],'elr')
# celdas
A('<rect class="eq" x="990" y="120" width="170" height="110" rx="4"/>')
for r in range(3):
    for c in range(8):
        A(f'<rect x="{1000+c*20}" y="{132+r*30}" width="14" height="22" fill="#e6edf5" stroke="#8b949e" stroke-width="0.8"/>')
A('<text class="et" x="1075" y="244" text-anchor="middle">160 celdas en serie</text>')
pipe([(990,200),(960,200),(960,250)],'elp')
pipe([(950,250),(950,200),(860,200)],'elp')
box(1100,74,72,34,'RT-401','12 pulsos')
A(f'<path d="M1136,108 L1136,120" stroke="{C["pwr"]}" stroke-width="3"/>')
bub(1040,102,'IIC-401'); bub(930,105,'AIC-405'); sig([(947,105),(1023,102)]); sig([(1057,100),(1100,92)])
bub(915,340,'AIT-408'); bub(955,340,'AIT-410')

A('<text class="es" x="985" y="352">cobalto FIC-404 · sangrado FIC-409</text>')

# --- Área 500
tank(40,430,90,70,'TK-501','bodega de ácido')
pump(170,470,'P-501')
pipe([(130,470),(159,470)],'acid',False); pipe([(181,470),(294,470),(294,336)],'acid')
bub(85,415,'LIT-501')
tank(340,430,90,70,'TK-502','agua')
box(560,430,120,44,'Barra 23 kV','MCC-100 a 400')
box(720,430,150,44,'Filtro de armónicos','y condensadores')
bub(905,452,'KY-501')
A(f'<path d="M680,452 L720,452" stroke="{C["pwr"]}" stroke-width="3"/><path d="M620,430 L620,400 L1179,400 L1179,91 L1172,91" fill="none" stroke="{C["pwr"]}" stroke-width="3"/><text class="es" x="980" y="394">52-RT · alimentación del rectificador</text>')
bub(520,452,'JIT-500')

# Leyenda
lx=20; ly=548
A(f'<text class="at" x="{lx}" y="{ly}">LEYENDA</text>')
items=[('ore','Mineral'),('acid','Ácido sulfúrico'),('ref','Refino'),('pls','PLS'),('org','Orgánico'),('elr','Electrolito rico'),('elp','Electrolito pobre'),('pwr','Energía')]
for i,(k,t) in enumerate(items):
    x=lx+i*140
    A(f'<line x1="{x}" y1="{ly+18}" x2="{x+28}" y2="{ly+18}" stroke="{C[k]}" stroke-width="4"/><text class="lt" x="{x+34}" y="{ly+22}">{t}</text>')
A(f'<line class="sig" x1="{lx}" y1="{ly+46}" x2="{lx+28}" y2="{ly+46}"/><text class="lt" x="{lx+34}" y="{ly+50}">Señal de control</text>')
bub(lx+180,ly+46,'FIC-205'); A(f'<text class="lt" x="{lx+204}" y="{ly+50}">Controlador en la HMI (F caudal · L nivel · T temperatura · A análisis · I corriente · W peso · FF razón)</text>')
A(f'<text class="lt" x="{lx}" y="{ly+80}">Modelo didáctico simplificado: no reemplaza un P&amp;ID de ingeniería. Lazos completos, permisivos y enclavamientos en sim.js y en las placas de la HMI.</text>')
A('</svg>')
open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','..','docs','pid.svg'),'w').write('\n'.join(o))
