/* Genera conocimiento/tags.json y conocimiento/causa_efecto.json desde el motor, para que la base de conocimiento
   no se desalinee del simulador. Ejecutar después de cambiar tags o permisivos en sim.js:
     node herramientas/generar-conocimiento.js
   Las pruebas (test/conocimiento.test.js) fallan si estos archivos no coinciden con el motor. */
'use strict';
const fs = require('fs');
const path = require('path');
require('../sim.js');
const P = globalThis.PlantSim.create();
const dir = path.join(__dirname, '..', 'conocimiento');

// ISA-5.1: primera letra = variable medida; las siguientes, la función
const VAR = {
  A: 'análisis',
  F: 'caudal',
  I: 'corriente',
  E: 'voltaje',
  J: 'potencia',
  K: 'calculado',
  L: 'nivel',
  P: 'presión',
  S: 'velocidad',
  T: 'temperatura',
  V: 'vibración',
  W: 'peso',
};
const LOOP = {};
Object.entries(P.L).forEach(([k, l]) => {
  const pv = k.replace(/^FF/, 'F').replace(/C-/, 'T-');
  if (P.T[pv]) LOOP[pv] = k;
});
const tags = Object.values(P.T).map((t) => ({
  id: t.id,
  descripcion: t.desc,
  unidad: t.unit,
  area: t.area,
  variable: VAR[t.id[0]] || 'otra',
  fuente: t.id.startsWith('KY') ? 'calculado' : 'medición',
  rango: [t.lo, t.hi],
  banda_normal: [t.nl, t.nh],
  lazo: LOOP[t.id] || null,
  alarmas: P.AD.filter((a) => a.tag === t.id && a.type !== 'DISC').map((a) => a.id),
}));
const lazos = Object.entries(P.L).map(([k, l]) => ({
  id: k,
  descripcion: l.desc,
  unidad: l.unit,
  modo_normal: l.norm,
  modos: l.modes,
  sintonia: {kp: l.kp, ti_s: l.ti, accion: l.act === 'dir' ? 'directa' : 'inversa'},
  razon: l.ratio != null ? {valor: l.ratio, unidad: l.ratioUnit} : null,
}));
fs.writeFileSync(
  path.join(dir, 'tags.json'),
  JSON.stringify(
    {
      descripcion:
        'Tags de la planta según ISA-5.1, con su rango, banda normal de operación, lazo y alarmas. Generado desde sim.js por herramientas/generar-conocimiento.js.',
      tags,
      lazos,
    },
    null,
    1
  ) + '\n'
);

// Matriz causa-efecto: permisivos de partida (desde el motor) y enclavamientos y disparos de proceso
const permisivos = Object.entries(P.perms).map(([eq, fn]) => ({
  equipo: eq,
  tipo: 'permisivo',
  condiciones: fn().map(([d]) => d),
}));
const enclavamientos = [
  {causa: 'Tambor M-103 detenido', efecto: 'Detiene la correa CV-101', tipo: 'enclavamiento'},
  {causa: 'Correa CV-101 detenida', efecto: 'Detiene el alimentador FD-101', tipo: 'enclavamiento'},
  {
    causa: 'Correa o tambor detenidos',
    efecto: 'Detiene las bombas de ácido P-102 y de agua P-104',
    tipo: 'enclavamiento',
  },
  {
    causa: 'Acopio de mineral fino sobre 58.000 t',
    efecto: 'Detiene el chancador CR-101',
    tipo: 'enclavamiento',
  },
  {causa: 'Nivel de la piscina de refino bajo 0,8 m', efecto: 'Dispara P-201A y P-201B', tipo: 'disparo'},
  {causa: 'Nivel de la piscina PLS bajo 0,8 m', efecto: 'Dispara P-202A y P-202B', tipo: 'disparo'},
  {causa: 'Nivel del estanque de electrolito bajo 10 %', efecto: 'Dispara P-401A y P-401B', tipo: 'disparo'},
  {causa: 'Caudal de electrolito bajo 500 m³/h', efecto: 'Dispara el rectificador RT-401', tipo: 'disparo'},
  {causa: 'Temperatura del electrolito ≥ 58 °C', efecto: 'Dispara el rectificador RT-401', tipo: 'disparo'},
  {causa: 'Interruptor 52-RT abierto', efecto: 'Dispara el rectificador RT-401', tipo: 'disparo'},
  {causa: 'MCC sin tensión', efecto: 'Disparan todos los motores de ese MCC', tipo: 'disparo'},
  {causa: 'Vibración sobre 1,25 × el límite C/D de su grupo', efecto: 'Dispara el motor', tipo: 'disparo'},
  {causa: 'Stock de ácido agotado', efecto: 'Dispara la bomba de transferencia P-501', tipo: 'disparo'},
  {causa: 'Bomba A disparada con la B en respaldo', efecto: 'Parte la bomba B', tipo: 'respaldo'},
];
fs.writeFileSync(
  path.join(dir, 'causa_efecto.json'),
  JSON.stringify(
    {
      descripcion:
        'Matriz causa-efecto: permisivos de partida y enclavamientos y disparos de proceso. En una planta real los disparos de seguridad viven en un sistema instrumentado independiente (IEC 61511); aquí están en el motor y se documentan juntos.',
      permisivos,
      enclavamientos,
    },
    null,
    1
  ) + '\n'
);
console.log(
  `tags.json: ${tags.length} tags y ${lazos.length} lazos · causa_efecto.json: ${permisivos.length} permisivos`
);
