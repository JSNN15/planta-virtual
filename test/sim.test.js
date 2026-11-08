/* Pruebas del motor de la planta virtual. Ejecutar: node planta-virtual/test/sim.test.js */
'use strict';
const assert = require('assert');
require('../sim.js');
const {create} = globalThis.PlantSim;

const run = (P, sec) => { for (let i = 0; i < sec; i++) P.step(); };
const finite = (P) => Object.values(P.T).forEach((t) => assert.ok(Number.isFinite(t.v), `${t.id} no es finito: ${t.v}`));
const between = (v, a, b, what) => assert.ok(v >= a && v <= b, `${what} = ${v} fuera de [${a}, ${b}]`);
let n = 0;
const test = (name, fn) => { fn(); n++; console.log('ok ·', name); };

test('régimen tras 8 h: valores de diseño', () => {
  const P = create(); run(P, 8 * 3600); finite(P);
  between(P.T['KY-405'].v, 6.0, 7.0, 'cátodo t/h');
  between(P.T['KY-406'].v, 88, 97, 'eficiencia de corriente %');
  between(P.T['AIT-405'].v, 40, 48, 'Cu electrolito g/L');
  between(P.T['KY-303'].v, 85, 99, 'extracción SX %');
  between(P.T['KY-407'].v, 1600, 2200, 'energía específica kWh/t');
});

test('Faraday: cátodo = I · 1,1855 g/Ah · celdas · eficiencia', () => {
  const P = create(); run(P, 3600);
  const I = P.T['IIT-401'].v, ce = P.T['KY-406'].v / 100, d = P.T['KY-405'].v;
  const ideal = I * 1.1855 * P.NCELL * ce / 1000;
  assert.ok(Math.abs(d - ideal) / ideal < 0.01, `cátodo ${d} vs Faraday ${ideal}`);
});

test('voltaje de celda = suma de sus componentes', () => {
  const P = create(); run(P, 600);
  const p = P.X.vp, sum = p.rev + p.an + p.cat + p.ohm + p.hw;
  between(sum, 1.8, 2.2, 'voltaje de celda V');
});

test('todos los escenarios corren 6 h sin valores no finitos', () => {
  for (const s of create().SCN) { const P = create(); P.scenario(s.id); run(P, 6 * 3600); finite(P); }
});

test('cordón de emergencia: disparo y alarma P1', () => {
  const P = create(); P.scenario('cord'); run(P, 30);
  assert.strictEqual(P.M['CV-101'].state, 'TRIP');
  assert.ok(P.AD.find((a) => a.id === 'CV-101.TRIP' && a.st === 'U'), 'alarma CV-101.TRIP sin activar');
  assert.ok(!P.M['FD-101'].state.startsWith('RUN'), 'el alimentador debió detenerse por enclavamiento');
});

test('secuencias del área 100: parada y partida completas', () => {
  const P = create();
  assert.ok(P.cmd.seq('stop100')); run(P, 600);
  assert.strictEqual(P.seqs[100].st, 'DONE', P.seqs[100].msg);
  ['M-103', 'CV-101', 'FD-101', 'P-102', 'P-104'].forEach((id) => assert.notStrictEqual(P.M[id].state, 'RUN', id));
  ['WIT-101.L', 'KY-102.L', 'AIT-105.L'].forEach((id) => { const a = P.AD.find((x) => x.id === id); assert.ok(a.supp && a.st === 'N', `${id} debió quedar suprimida con el área detenida`); });
  assert.ok(P.cmd.seq('start100')); run(P, 600);
  assert.strictEqual(P.seqs[100].st, 'DONE', P.seqs[100].msg);
  run(P, 1800); between(P.X.tonDrum, 1400, 2000, 'mineral al tambor t/h');
  between(P.T['KY-102'].v, 17, 23, 'dosis de ácido kg/t');
});

test('secuencia falla con causa si la correa está disparada', () => {
  const P = create(); P.scenario('cord'); run(P, 30);
  P.cmd.seq('start100'); run(P, 300);
  assert.strictEqual(P.seqs[100].st, 'FAIL');
  assert.match(P.seqs[100].msg, /rearmar/);
});

test('la compensación de retardo de la correa reduce la variación de la dosis de ácido', () => {
  const sd = (comp) => { const P = create(); P.cmd.delayComp(comp); const v = []; for (let i = 0; i < 7200; i++) { P.step(); v.push(P.T['KY-102'].v); } const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length); };
  const on = sd(true), off = sd(false);
  assert.ok(on < off * 0.8, `desviación con compensación ${on.toFixed(2)} vs sin ${off.toFixed(2)} kg/t`);
});

test('nave EW: parada a corriente de protección y puesta en servicio', () => {
  const P = create(); run(P, 600);
  assert.ok(P.cmd.seq('stop400')); run(P, 1800);
  assert.strictEqual(P.seqs[400].st, 'DONE', P.seqs[400].msg);
  assert.strictEqual(P.RECT.state, 'RUN'); between(P.RECT.I, 4.5, 5.5, 'corriente de protección kA');
  assert.ok(P.cmd.seq('start400')); run(P, 1800);
  assert.strictEqual(P.seqs[400].st, 'DONE', P.seqs[400].msg);
  assert.strictEqual(P.L['IIC-401'].mode, 'CAS'); between(P.RECT.I, 33, 41, 'corriente tras la rampa kA');
  run(P, 6 * 3600); between(P.X.Ce, 40, 50, 'Cu electrolito g/L'); assert.ok(P.X.quality, 'con corriente de protección el cátodo sigue en grado A');
});

test('corte total de corriente: riesgo de plomo y puesta en servicio', () => {
  const P = create(); run(P, 600);
  P.cmd.stop('RT-401'); run(P, 2 * 3600);
  assert.ok(P.cmd.seq('start400')); run(P, 3600);
  assert.strictEqual(P.seqs[400].st, 'DONE', P.seqs[400].msg);
  let off = false; for (let i = 0; i < 4 * 3600; i++) { P.step(); if (!P.X.quality) off = true; }
  assert.ok(off, 'tras 2 h sin corriente el plomo debió sacar el cátodo de norma un tiempo');
  run(P, 24 * 3600); assert.ok(P.X.quality, 'el plomo debió volver a norma');
});

test('secuencia EW falla con causa si 52-RT está abierto', () => {
  const P = create(); run(P, 600);
  P.cmd.stop('RT-401'); P.cmd.breaker('52-RT', false); P.cmd.seq('start400'); run(P, 300);
  assert.strictEqual(P.seqs[400].st, 'FAIL'); assert.match(P.seqs[400].msg, /52-RT/);
  assert.ok(P.AD.find((a) => a.id === 'SEQ-400.FAIL' && a.st === 'U'), 'falta la alarma de secuencia detenida');
});

test('vibración: zonas ISO por grupo de máquina y sin alarmas molestas en régimen', () => {
  const P = create();
  assert.deepStrictEqual(P.M['P-102'].z, [1.4, 2.8, 4.5]); assert.deepStrictEqual(P.M['M-103'].z, [2.3, 4.5, 7.1]);
  run(P, 8 * 3600);
  const vib = P.AD.filter((a) => /\.VIBH?$/.test(a.id) && a.count > 0).map((a) => a.id);
  assert.deepStrictEqual(vib, [], 'alarmas de vibración en régimen: ' + vib.join(', '));
});

test('régimen de 72 h: cobalto, hierro y stock de ácido no derivan', () => {
  const P = create(); run(P, 600); const co = P.X.Co, fe = P.X.Fe, acid = P.X.tk501;
  run(P, 72 * 3600);
  assert.ok(Math.abs(P.X.Co - co) < 5, `Co ${co} → ${P.X.Co}`);
  assert.ok(Math.abs(P.X.Fe - fe) < 0.03, `Fe ${fe} → ${P.X.Fe}`);
  assert.ok(Math.abs(P.X.tk501 - acid) < 150, `stock de ácido ${acid} → ${P.X.tk501}`);
});

console.log(`${n} pruebas OK`);
