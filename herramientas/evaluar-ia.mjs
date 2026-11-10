// Evalúa el asistente contra el banco de escenarios de falla (test/escenarios-ia.json).
//   node herramientas/evaluar-ia.mjs                     → diagnóstico por reglas (sin red)
//   NV_URL=http://localhost:8787 node herramientas/evaluar-ia.mjs   → además el pipeline con NVIDIA Nemotron
// Para el modo con modelo, levanta el intermediario local: en nv-gateway, NVIDIA_API_KEY=... node dev.mjs
// Mide por caso: causa correcta, acción esperada propuesta, acción prohibida ausente, correcciones del verificador y tiempo.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
require(path.join(raiz, 'sim.js'));
require(path.join(raiz, 'ia-nucleo.js'));
const {PlantSim, IANucleo} = globalThis;
const K = IANucleo.cargarNode(raiz);
const BANCO = require(path.join(raiz, 'test', 'escenarios-ia.json'));
const NV = process.env.NV_URL;

const post = async (body) => {
  const r = await fetch(NV + '/planta', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', Origin: 'http://localhost:8770'},
    body: JSON.stringify(body),
  });
  const d = await r.json();
  if (!r.ok || !d.ok) throw new Error(d.error || 'HTTP ' + r.status);
  return d;
};
// el mismo pipeline que asistente.js, sin la interfaz
const pipelineIA = async (N, P, q) => {
  const objetos = [...Object.keys(P.M), 'RT-401', ...Object.keys(P.L), ...Object.keys(P.T)];
  const ent = (await post({etapa: 'entender', pregunta: q, objetos})).result;
  const consultas = (ent.herramientas || [])
    .filter((h) => h.nombre !== 'estado_planta' && h.nombre !== 'manual')
    .slice(0, 6)
    .map((h) => ({herramienta: h.nombre, arg: h.arg, resultado: N.usarHerramienta(h.nombre, h.arg)}));
  const cuerpo = {
    etapa: 'diagnosticar',
    pregunta: q,
    foto: N.foto(),
    consultas,
    manual: N.buscarManual([ent.busqueda_manual, q].join(' '), 3),
    catalogo: N.catalogo(),
    reglas: N.reglasDuras(),
  };
  let v = N.validar((await post(cuerpo)).result),
    reanalisis = false;
  if (!v.ok) {
    reanalisis = true;
    v = N.validar((await post({...cuerpo, errores: v.errores.map((e) => e.detalle)})).result);
  }
  return {v, reanalisis};
};
const juzgar = (caso, v) => {
  const r = v.resp,
    txt = [r.resumen, r.causa_probable, ...(r.evidencia || []).map((e) => e.tag)].join(' ');
  const ids = r.acciones.map((a) => a.id);
  return {
    causa: new RegExp(caso.causa).test(txt),
    accion: !caso.accion || ids.includes(caso.accion),
    prohibida: !caso.prohibida || !ids.includes(caso.prohibida),
    manual: !caso.manual || (r.pasos_manuales || []).some((x) => x.manual === caso.manual),
    correcciones: v.errores.length,
  };
};
const filas = [];
for (const caso of BANCO.casos) {
  const P = PlantSim.create();
  const N = IANucleo.crear(() => P, K);
  for (let i = 0; i < 1800; i++) P.step();
  P.scenario(caso.escenario);
  for (let i = 0; i < caso.segundos; i++) P.step();
  let t = performance.now();
  const loc = juzgar(caso, N.validar(N.diagnosticoLocal(BANCO.pregunta)));
  const fila = {escenario: caso.escenario, reglas: loc, ms_reglas: Math.round(performance.now() - t)};
  if (NV) {
    t = performance.now();
    try {
      const {v, reanalisis} = await pipelineIA(N, P, BANCO.pregunta);
      fila.ia = {...juzgar(caso, v), reanalisis};
    } catch (e) {
      fila.ia = {error: e.message};
    }
    fila.ms_ia = Math.round(performance.now() - t);
  }
  filas.push(fila);
}
const ok = (j) => j && !j.error && j.causa && j.accion && j.prohibida && j.manual;
const marca = (j) =>
  !j
    ? ''
    : j.error
      ? 'error'
      : ok(j)
        ? 'ok'
        : ['causa', 'accion', 'prohibida', 'manual'].filter((k) => !j[k]).join('+');
console.log('escenario  reglas' + (NV ? '            modelo' : ''));
filas.forEach((f) =>
  console.log(
    f.escenario.padEnd(10),
    marca(f.reglas).padEnd(18),
    NV
      ? `${marca(f.ia)} · ${f.ms_ia} ms${f.ia && f.ia.reanalisis ? ' · reanálisis' : ''}${f.ia && f.ia.correcciones ? ' · ' + f.ia.correcciones + ' correcciones' : ''}`
      : ''
  )
);
const n = filas.length;
console.log(`\nReglas: ${filas.filter((f) => ok(f.reglas)).length}/${n} casos correctos`);
if (NV) console.log(`Modelo: ${filas.filter((f) => ok(f.ia)).length}/${n} casos correctos`);
process.exitCode = filas.every((f) => ok(f.reglas)) ? 0 : 1;
