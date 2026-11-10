/* Pruebas del asistente de IA: base de conocimiento, núcleo (vigilancia, verificador, ejecución con aprobación)
   y procesos agregados al simulador. Ejecutar: node test/ia.test.js */
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
require('../sim.js');
require('../ia-nucleo.js');
const {create} = globalThis.PlantSim;
const {IANucleo} = globalThis;
const RAIZ = path.join(__dirname, '..');
const K = IANucleo.cargarNode(RAIZ);
const run = (P, sec) => {
  for (let i = 0; i < sec; i++) P.step();
};
const planta = (sec = 600) => {
  const P = create();
  run(P, sec);
  return {P, N: IANucleo.crear(() => P, K)};
};
let n = 0;
const test = (name, fn) => {
  fn();
  n++;
  console.log('ok ·', name);
};

/* ---------- base de conocimiento ---------- */
test('cada alarma del simulador tiene ficha en conocimiento/alarmas.json', () => {
  const {P, N} = planta(60);
  const sin = P.AD.filter((a) => !N.ficha(a.id)).map((a) => a.id);
  // las alarmas de celda solo existen con el monitoreo continuo activo
  P.cmd.monitor(true);
  run(P, 2);
  ['CELDA-1.V', 'SEQ-100.FAIL', 'AIT-207.DEV'].forEach((id) => assert.ok(N.ficha(id), `sin ficha: ${id}`));
  assert.deepStrictEqual(sin, [], 'alarmas sin ficha: ' + sin.join(', '));
});

test('cada sección de manual citada existe y cada acción tiene manual, precondiciones conocidas y ejecutor', () => {
  const ids = new Set(K.manual.map((s) => s.id));
  const citas = [
    ...K.alarmas.alarmas.map((a) => [a.id, a.manual]),
    ...K.alarmas.discretas.map((a) => [a.patron, a.manual]),
    ...K.acciones.acciones.map((a) => [a.id, a.manual]),
  ];
  citas.forEach(([q, m]) => assert.ok(ids.has(m), `${q} cita ${m}, que no existe en manuales/`));
  const {N} = planta(1);
  K.acciones.acciones.forEach((a) => {
    (a.precondiciones || []).forEach((c) =>
      assert.ok(N.precondicionesConocidas.includes(c), `${a.id}: precondición desconocida ${c}`)
    );
    assert.ok(N.accionesEjecutables.includes(a.id), `${a.id} no tiene ejecutor`);
    assert.ok(K.acciones.roles[a.rol], `${a.id}: rol desconocido ${a.rol}`);
  });
  K.alarmas.alarmas.forEach((a) =>
    (a.acciones_sugeridas || []).forEach((id) =>
      assert.ok(
        K.acciones.acciones.find((x) => x.id === id),
        `${a.id} sugiere ${id}, que no está en el catálogo`
      )
    )
  );
});

test('tags.json coincide con los tags del simulador', () => {
  const P = create();
  const tags = K.tags.tags || K.tags;
  const ids = new Set((Array.isArray(tags) ? tags : Object.values(tags)).map((t) => t.id || t.tag));
  const falt = Object.keys(P.T).filter((t) => !ids.has(t));
  assert.deepStrictEqual(
    falt,
    [],
    'tags sin documentar (correr herramientas/generar-conocimiento.js): ' + falt.join(', ')
  );
});

test('en régimen cada variable química está dentro del rango de conocimiento/reglas_quimicas.json', () => {
  const P = create();
  run(P, 4 * 3600);
  K.reglasQuimicas.reglas
    .filter((r) => r.tag && r.min != null && r.max != null)
    .forEach((r) => {
      const t = P.T[r.tag];
      assert.ok(t, `${r.id}: el tag ${r.tag} no existe`);
      assert.ok(
        t.v >= r.min && t.v <= r.max,
        `${r.id} ${r.tag} = ${t.v} fuera de ${r.min}–${r.max} en régimen`
      );
      assert.ok(
        t.nl <= r.max && t.nh >= r.min,
        `${r.id} ${r.tag}: la banda normal ${t.nl}–${t.nh} no se cruza con ${r.min}–${r.max}`
      );
    });
});

/* ---------- reglas físicas en régimen ---------- */
test('régimen: balances de la base de reglas físicas se cumplen', () => {
  const P = create();
  run(P, 6 * 3600);
  const X = P.X,
    T = P.T;
  // ácido: 1,543 t de H2SO4 regeneradas por t de Cu depositada (Cu²⁺ + H2O → Cu + ½O2 + 2H⁺)
  assert.ok(Math.abs(98.08 / 63.546 - 1.543) < 0.001);
  // densidad de corriente: I / (área catódica), dentro de 250 a 350 A/m²
  const dens = (T['IIT-401'].v * 1000) / (60 * 2 * 1.0 * 1.0);
  assert.ok(dens > 250 && dens < 350, `densidad de corriente ${dens} A/m²`);
  // energía específica de la nave ≈ V·I / producción
  const e = (P.RECT.V * P.RECT.I) / T['KY-405'].v;
  assert.ok(
    Math.abs(e - T['KY-407'].v) / T['KY-407'].v < 0.08,
    `energía específica ${e} vs KY-407 ${T['KY-407'].v}`
  );
  assert.ok(X.Ce > 40 && X.Ce < 48, `Cu en electrolito ${X.Ce}`);
});

/* ---------- procesos agregados ---------- */
test('revestimientos: el P80 sube con el desgaste y baja tras el cambio', () => {
  const P = create();
  run(P, 600);
  P.scenario('liner');
  run(P, 3 * 3600);
  assert.ok(P.T['AIT-100'].v > 14, `P80 ${P.T['AIT-100'].v} mm tras 3 h de desgaste`);
  const stock = P.X.stock;
  P.cmd.liners();
  run(P, 2 * 3600 + 120);
  assert.ok(P.X.stock < stock, 'con el chancador detenido el acopio debe bajar');
  const N = IANucleo.crear(() => P, K);
  const av = N.vigilar().find(
    (x) => x.accion && x.accion.id === 'partir_equipo' && x.accion.objetivo === 'CR-101'
  );
  assert.ok(av, 'el asistente debe pedir partir CR-101 tras la mantención');
  assert.ok(N.ejecutar(av.accion, 'operador').ok);
  run(P, 2 * 3600);
  assert.ok(P.T['AIT-100'].v < 13.5, `P80 ${P.T['AIT-100'].v} mm tras el cambio`);
});

test('lavado W1: sin lavado sube el cloruro del electrolito y con lavado vuelve a bajar', () => {
  const P = create();
  run(P, 600);
  const cl0 = P.X.Cl;
  P.scenario('wash');
  run(P, 12 * 3600);
  assert.ok(P.X.Cl > cl0 + 5, `Cl ${cl0} → ${P.X.Cl} mg/L sin lavado`);
  const alto = P.X.Cl;
  P.cmd.reset('M-304');
  P.cmd.start('M-304');
  run(P, 24 * 3600);
  assert.ok(P.X.Cl < alto, `Cl ${alto} → ${P.X.Cl} mg/L con lavado`);
});

test('corriente del plan: la consigna sigue el balance de cobre y mantiene el electrolito en banda', () => {
  const P = create();
  run(P, 3600);
  const I = P.cmd.planCurrent();
  assert.ok(Math.abs(I - P.planI()) < 0.11 && I >= 20 && I <= 42, `consigna ${I} vs balance ${P.planI()}`);
  P.cmd.planRate(5.5);
  P.cmd.planCurrent();
  run(P, 12 * 3600);
  assert.ok(P.X.Ce > 40 && P.X.Ce < 50, `Cu electrolito ${P.X.Ce} g/L con el plan reducido`);
});

test('cosecha: un lote al día con su tonelaje y calidad', () => {
  const P = create();
  run(P, 50 * 3600);
  assert.ok(P.X.harvests.length >= 2, `${P.X.harvests.length} cosechas en 50 h`);
  const h = P.X.harvests[0];
  assert.ok(
    h.ton > 120 && h.ton < 180,
    `lote de ${h.ton} t (un séptimo de la nave con 7 días de depósito ≈ un día de producción)`
  );
  assert.ok(h.gradoA, 'en régimen el lote es grado A');
});

/* ---------- núcleo: verificador ---------- */
test('verificador: elimina tags inventados, corrige valores y descarta acciones fuera del catálogo', () => {
  const {P, N} = planta();
  const v = N.validar({
    resumen: 'El XYZ-999 está alto',
    evidencia: [
      {tag: 'AIT-405', valor: 99, comentario: ''},
      {tag: 'FOO-123', valor: 1, comentario: ''},
    ],
    acciones: [{id: 'inhibir_alarma', objetivo: 'AIT-405'}],
    pasos_manuales: [{paso: 'x', manual: 'OP-9.9'}],
  });
  assert.strictEqual(v.ok, false);
  const tipos = v.errores.map((e) => e.tipo);
  ['tag_inexistente', 'valor_distinto', 'accion_invalida', 'manual_inexistente'].forEach((t) =>
    assert.ok(tipos.includes(t), 'falta error ' + t)
  );
  assert.strictEqual(v.resp.evidencia.length, 1);
  assert.ok(Math.abs(v.resp.evidencia[0].valor - P.T['AIT-405'].v) < 0.1 && v.resp.evidencia[0].corregido);
  assert.strictEqual(v.resp.acciones.length, 0);
  assert.strictEqual(v.resp.descartadas[0].regla, 'S3');
});

test('verificador: consignas fuera de banda o con salto mayor al 10 % se descartan (S6)', () => {
  const {N, P} = planta();
  const sp = P.L['AIC-405'] ? 'AIC-405' : 'TIC-403';
  const fuera = N.validar({acciones: [{id: 'consigna_lazo', objetivo: 'TIC-403', valor: '70'}]});
  assert.strictEqual(fuera.resp.acciones.length, 0);
  assert.match(fuera.resp.descartadas[0].motivo, /banda normal/);
  const ok = N.validar({
    acciones: [{id: 'consigna_lazo', objetivo: 'TIC-403', valor: String(P.L['TIC-403'].sp + 1)}],
  });
  assert.strictEqual(ok.resp.acciones.length, 1, JSON.stringify(ok.resp.descartadas) + sp);
});

test('verificador: máximo tres acciones (S8) y precondiciones evaluadas sobre la planta real', () => {
  const {N} = planta();
  const v = N.validar({
    acciones: [
      {id: 'filtro_armonicos'},
      {id: 'compensacion_retardo'},
      {id: 'activar_monitoreo_celdas'},
      {id: 'recibir_camion_acido'},
    ],
  });
  assert.ok(
    v.errores.some((e) => e.regla === 'S8'),
    'falta la observación S8'
  );
  assert.ok(v.resp.acciones.length <= 3);
  const w = N.validar({acciones: [{id: 'reparar_intercambiador'}]});
  assert.strictEqual(w.resp.acciones.length, 0, 'HX-401 está sano: no hay nada que reparar');
});

/* ---------- núcleo: ejecución con aprobación ---------- */
test('S2: no se rearma un equipo disparado por protección; sí uno disparado por una causa externa', () => {
  const {P, N} = planta();
  P.scenario('rt');
  run(P, 30);
  const r = N.ejecutar({id: 'rearmar_equipo', objetivo: 'RT-401'}, 'jefe_turno');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.regla, 'S2');
  P.scenario('cord');
  run(P, 30);
  const c = N.ejecutar({id: 'rearmar_equipo', objetivo: 'CV-101'}, 'operador');
  assert.ok(c.ok, c.motivo);
});

test('S9: cada acción la aprueba su rol; gerencia no opera', () => {
  const {N, P} = planta();
  assert.strictEqual(N.ejecutar({id: 'recalcular_corriente_plan'}, 'operador').ok, false);
  assert.strictEqual(N.ejecutar({id: 'filtro_armonicos'}, 'gerencia').ok, false);
  assert.ok(N.ejecutar({id: 'filtro_armonicos'}, 'jefe_turno').ok);
  P.step();
  assert.ok(P.X.capBank);
  assert.ok(
    P.S.log.some((l) => /Asistente propuso y Jefe de turno aprobó/.test(l.msg)),
    'la bitácora registra quién aprobó'
  );
});

test('seguimiento: la acción aprobada se marca cumplida cuando tiene el efecto esperado', () => {
  const {N, P} = planta(3600);
  P.scenario('ph');
  run(P, 4 * 3600);
  const r = N.ejecutar({id: 'calibrar_ph'}, 'mantenimiento');
  assert.ok(r.ok, r.motivo);
  let estado = 'pendiente';
  for (let i = 0; i < 600 && estado === 'pendiente'; i++) {
    P.step();
    N.revisarSeguimientos();
    estado = r.seguimiento.estado;
  }
  assert.strictEqual(estado, 'cumplido');
});

test('vigilancia: en régimen no hay causas ni anomalías falsas', () => {
  const {N, P} = planta(1800);
  let malas = 0;
  for (let s = 0; s < 6 * 3600; s++) {
    P.step();
    if (s % 300 === 0) malas += N.vigilar().filter((x) => x.k === 'causa' || x.k === 'anom').length;
  }
  assert.strictEqual(malas, 0);
});

/* ---------- banco de escenarios ---------- */
test('diagnóstico por reglas: todos los casos del banco de escenarios', () => {
  const banco = JSON.parse(fs.readFileSync(path.join(__dirname, 'escenarios-ia.json'), 'utf8'));
  const fallas = [];
  banco.casos.forEach((c) => {
    const P = create();
    run(P, 1800);
    const N = IANucleo.crear(() => P, K);
    P.scenario(c.escenario);
    run(P, c.segundos);
    const v = N.validar(N.diagnosticoLocal(banco.pregunta)).resp;
    const txt = [v.resumen, v.causa_probable, ...v.evidencia.map((e) => e.tag)].join(' ');
    const ids = v.acciones.map((a) => a.id);
    if (!new RegExp(c.causa).test(txt)) fallas.push(`${c.escenario}: causa «${v.resumen.slice(0, 80)}»`);
    if (c.accion && !ids.includes(c.accion))
      fallas.push(`${c.escenario}: falta ${c.accion} (propuso ${ids.join(', ') || 'nada'})`);
    if (c.prohibida && ids.includes(c.prohibida)) fallas.push(`${c.escenario}: propuso ${c.prohibida}`);
    if (c.manual && !v.pasos_manuales.some((x) => x.manual === c.manual))
      fallas.push(`${c.escenario}: sin pasos de ${c.manual}`);
  });
  assert.deepStrictEqual(fallas, []);
});

test('manuales: la búsqueda encuentra el procedimiento correcto', () => {
  const {N} = planta(1);
  [
    ['cambio de revestimientos del chancador', 'MT-3.3'],
    ['rodamiento del tambor', 'MT-3.1'],
    ['cloruro lavado W1', 'OP-4.3'],
    ['zonas de vibración ISO', 'MT-2.1'],
    ['cómo apruebo una acción del asistente', 'IA-1.5'],
  ].forEach(([q, id]) => {
    const r = N.buscarManual(q, 3).map((x) => x.id);
    assert.ok(r.includes(id), `«${q}» → ${r.join(', ')} (esperaba ${id})`);
  });
});

console.log(`${n} pruebas OK`);
