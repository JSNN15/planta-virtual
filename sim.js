/* Planta virtual LX-SX-EW · motor del simulador de entrenamiento de operadores (OTS).
   Paso fijo de 1 s de tiempo simulado. Modelo didáctico: dinámica creíble, no validado contra una planta real. */
(function (G) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lag = (x, u, tau, dt) => x + (u - x) * Math.min(1, dt / tau);
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const gauss = () => { let s = 0; for (let i = 0; i < 4; i++) s += rnd(); return (s - 2) * 1.73; };

  /* ---------- Lazos PID (forma posicional con anti-windup y cambio sin salto) ---------- */
  class PID {
    constructor(o) { Object.assign(this, {kp: 1, ti: 60, sp: 0, op: 50, mode: 'AUTO', span: 100, act: 'rev', casSP: null, i: null, pv: 0, unit: '', opUnit: '%', modes: ['MAN', 'AUTO']}, o); this.norm = this.mode; }
    step(pv, dt) {
      this.pv = pv;
      if (this.mode === 'MAN') { this.i = null; return this.op; }
      const sp = this.mode === 'CAS' && this.casSP != null ? this.casSP : this.sp;
      this.spEff = sp;
      let e = (sp - pv) / this.span * 100; if (this.act === 'dir') e = -e;
      if (this.i == null) this.i = this.op - this.kp * e;           // cambio sin salto
      this.i += this.kp * e * dt / this.ti;
      this.i = clamp(this.i, -this.kp * Math.abs(e) - 5, 105 + this.kp * Math.abs(e));
      this.op = clamp(this.kp * e + this.i, 0, 100);
      if (this.op === 0 || this.op === 100) this.i = clamp(this.i, this.op - this.kp * e - 1, this.op - this.kp * e + 1);
      return this.op;
    }
    sp_() { return this.mode === 'CAS' && this.casSP != null ? this.casSP : this.sp; }
  }

  /* ---------- Equipos con motor ---------- */
  // Zonas de vibración (ISO 10816-3, hoy ISO 20816-3), base rígida: grupo 1 sobre 300 kW, grupo 2 de 15 a 300 kW. Límites A/B, B/C y C/D en mm/s RMS.
  const VIBZ = {1: [2.3, 4.5, 7.1], 2: [1.4, 2.8, 4.5]};
  const mkMotor = (id, desc, area, kw, mcc, o = {}) => { const grp = kw > 300 ? 1 : 2, z = VIBZ[grp], vb = z[0] * (0.75 + rnd() * 0.3); return Object.assign({id, desc, area, kw, mcc, grp, z, state: 'RUN', remote: true, hours: 1000 + Math.floor(rnd() * 9000), starts: 50 + Math.floor(rnd() * 400),
    vib: vb, vibBase: vb, temp: 55, amps: 0, load: 0.75, pmEvery: 2000, sincePM: Math.floor(rnd() * 1800), trip: null, deg: 0, standby: false}, o); };

  /* ---------- Curva de recuperación (capítulo 3: Saldaña et al. 2019, óxidos, R90 = 64,6 %) ---------- */
  const g = (t) => 1 - 0.40 * Math.exp(-0.0844 * t) - 0.60 * Math.exp(-0.0055 * t);
  const R = (t) => 64.6 * g(t) / g(90);
  const dR = (t) => (R(t + 0.5) - R(t - 0.5));            // % por día

  /* ---------- Equilibrio de SX (capítulo 4: modelo didáctico K = 4, 0,6 g/L por % vol) ---------- */
  const MWCu = 63.55, KSX = 4, CAP = 0.6;
  const yeq = (c, h, Rr) => { if (c <= 0) return 0; let lo = 0, hi = Rr / 2; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (KSX * c * (Rr - 2 * m) ** 2 - m * h * h > 0) ? lo = m : hi = m; } return (lo + hi) / 2; };
  const cascade = (vol, oa, N, pls, pH, ysg) => {
    if (N < 1 || oa <= 0 || pls <= 0) return {craf: pls, yL: ysg};
    const Rr = 2 * vol * CAP / MWCu, c0 = pls / MWCu, h0 = 10 ** -pH, ys = ysg / MWCu, h = (c) => h0 + 2 * (c0 - c);
    const walk = (cN) => { let c = cN, y1 = 0; for (let n = N; n >= 1; n--) { const y = yeq(c, h(c), Rr); y1 = y; c = cN + oa * (y - ys); } return [c, y1]; };
    let lo = 0, hi = c0; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; (walk(m)[0] > c0) ? hi = m : lo = m; }
    const cN = (lo + hi) / 2, yL = walk(cN)[1];
    return {craf: cN * MWCu, yL: Math.max(ysg, yL * MWCu)};
  };

  /* ---------- Voltaje de celda (capítulo 5) ---------- */
  // rev: potencial reversible; an y cat: sobrepotenciales (Tafel); ohm: caída en el electrolito (j·d/κ, κ sube 2 %/°C); hw: contactos, barras y ánodos.
  const vparts = (j, T) => { const kap = 55 * (1 + 0.02 * (T - 45)), jj = Math.max(j, 20); return {rev: 0.89, an: 0.62 + 0.12 * Math.log10(jj / 300), cat: Math.max(0, 0.08 + 0.06 * Math.log10(jj / 300)), ohm: j * 0.04 / Math.max(kap, 10), hw: 0.15 * j / 300}; };
  const vcell = (j, T) => { const p = vparts(j, T); return p.rev + p.an + p.cat + p.ohm + p.hw; };

  const NCELL = 160, NCAT = 60, VEL = 1800, CU_PRICE = 14330, E_PRICE = 100; // celdas, cátodos por celda, m³ de electrolito, US$/t Cu (6,5 US$/lb), US$/MWh

  function create() {
    const S = {t: 0, t0: 8 * 3600 - 600, speed: 60, paused: false, log: [], seq: 0};
    /* ----- equipos ----- */
    const M = {};
    const add = (m) => { M[m.id] = m; };
    add(mkMotor('M-103', 'Tambor aglomerador AD-101', 100, 450, 'MCC-100'));
    add(mkMotor('CV-101', 'Correa de alimentación', 100, 315, 'MCC-100'));
    add(mkMotor('FD-101', 'Alimentador de mineral (VDF)', 100, 75, 'MCC-100'));
    add(mkMotor('P-102', 'Bomba de ácido al tambor', 100, 15, 'MCC-100'));
    add(mkMotor('P-104', 'Bomba de agua al tambor', 100, 55, 'MCC-100'));
    add(mkMotor('P-201A', 'Bomba de riego A', 200, 900, 'MCC-200'));
    add(mkMotor('P-201B', 'Bomba de riego B (respaldo)', 200, 900, 'MCC-200', {state: 'STOP', standby: true}));
    add(mkMotor('P-202A', 'Bomba de PLS a SX A', 200, 750, 'MCC-200'));
    add(mkMotor('P-202B', 'Bomba de PLS a SX B (respaldo)', 200, 750, 'MCC-200', {state: 'STOP', standby: true}));
    add(mkMotor('M-301', 'Mezclador E1', 300, 110, 'MCC-300'));
    add(mkMotor('M-302', 'Mezclador E2', 300, 110, 'MCC-300'));
    add(mkMotor('M-303', 'Mezclador S1 (reextracción)', 300, 110, 'MCC-300'));
    add(mkMotor('P-305', 'Bomba de orgánico (VDF)', 300, 250, 'MCC-300'));
    add(mkMotor('P-401A', 'Bomba de electrolito A', 400, 200, 'MCC-400'));
    add(mkMotor('P-401B', 'Bomba de electrolito B (respaldo)', 400, 200, 'MCC-400', {state: 'STOP', standby: true}));
    add(mkMotor('P-501', 'Bomba de transferencia de ácido', 500, 30, 'MCC-100'));
    Object.values(M).forEach((m) => { if (m.id === 'P-501') m.state = 'STOP'; });
    const RECT = {id: 'RT-401', desc: 'Rectificador de la nave', state: 'RUN', I: 37, Iset: 37, V: 0, P: 0, trip: null, ramp: 2 / 60};
    const BRK = {'52-RT': true, 'MCC-100': true, 'MCC-200': true, 'MCC-300': true, 'MCC-400': true};
    let capBank = false;

    /* ----- lazos ----- */
    const L = {
      'WIC-101': new PID({desc: 'Tonelaje a la correa', unit: 't/h', sp: 1700, op: 77, kp: 0.6, ti: 40, span: 2500}),
      'FFIC-102': new PID({desc: 'Razón ácido / mineral', unit: 'm³/h', sp: 18.5, op: 62, kp: 0.8, ti: 8, span: 30, ratio: 20, ratioUnit: 'kg/t', modes: ['MAN', 'AUTO', 'CAS'], mode: 'CAS'}),
      'FFIC-104': new PID({desc: 'Razón agua / mineral', unit: 'm³/h', sp: 119, op: 60, kp: 0.8, ti: 8, span: 250, ratio: 0.07, ratioUnit: 'm³/t', modes: ['MAN', 'AUTO', 'CAS'], mode: 'CAS'}),
      'FIC-211': new PID({desc: 'Riego módulo 1', unit: 'm³/h', sp: 733, op: 60, kp: 0.5, ti: 20, span: 1500}),
      'FIC-212': new PID({desc: 'Riego módulo 2', unit: 'm³/h', sp: 733, op: 60, kp: 0.5, ti: 20, span: 1500}),
      'FIC-213': new PID({desc: 'Riego módulo 3', unit: 'm³/h', sp: 733, op: 60, kp: 0.5, ti: 20, span: 1500}),
      'LIC-201': new PID({desc: 'Nivel piscina de refino (agua de reposición)', unit: 'm', sp: 3.0, op: 22, kp: 4, ti: 900, span: 5}),
      'LIC-204': new PID({desc: 'Nivel piscina PLS (consigna a FIC-205)', unit: 'm', sp: 3.0, op: 71, kp: 3, ti: 1200, span: 5, act: 'dir', mode: 'MAN'}),
      'FIC-205': new PID({desc: 'Alimentación de PLS a SX', unit: 'm³/h', sp: 2134, op: 71, kp: 0.5, ti: 15, span: 3000, modes: ['MAN', 'AUTO', 'CAS']}),
      'FFIC-301': new PID({desc: 'Razón orgánico / acuoso (O/A)', unit: 'm³/h', sp: 1920, op: 55, kp: 0.5, ti: 15, span: 3500, ratio: 0.9, ratioUnit: 'O/A', modes: ['MAN', 'AUTO', 'CAS'], mode: 'CAS'}),
      'IIC-401': new PID({desc: 'Corriente del rectificador', unit: 'kA', sp: 37, op: 74, kp: 1, ti: 10, span: 50, modes: ['MAN', 'AUTO', 'CAS'], mode: 'CAS'}),
      'AIC-405': new PID({desc: 'Cobre en electrolito (consigna a IIC-401)', unit: 'g/L', sp: 44, op: 74, kp: 6, ti: 6000, span: 60, act: 'dir'}),
      'TIC-403': new PID({desc: 'Temperatura del electrolito', unit: '°C', sp: 45, op: 50, kp: 3, ti: 1200, span: 80}),
      'FIC-404': new PID({desc: 'Dosificación de cobalto', unit: 'L/h', sp: 52.5, op: 52.5, kp: 0.6, ti: 10, span: 100}),
      'FIC-409': new PID({desc: 'Sangrado de electrolito', unit: 'm³/h', sp: 7, op: 35, kp: 0.6, ti: 10, span: 20})
    };
    L['LIC-204'].op = 71.1; // equivale a 2.134 m³/h

    /* ----- estado del proceso ----- */
    const X = {
      feeder: 77.3, beltBuf: new Float32Array(240), bi: 0, ton: 1700, tonDrum: 1700, delayComp: true, oreAvail: 1,
      acidQ: 18.5, waterQ: 119, moist: 9.2, tk103: 60, p501On: false,
      tk501: 1400, tk502: 3000, trucksPerH: 1.15, truckAcc: 0, trucksHold: 0,   // 1,15 camiones de 30 t por hora cubren unas 34 t/h de consumo
      lvRaf: 3.0, lvPLS: 3.0, makeup: 66, qMod: [733, 733, 733], fMod: [1, 1, 1], pHdr: 4.0, stackF: 1, secR: [0, 0, 0], secCu: [0, 0, 0],
      qPLS: 2134, cuPLS: 3.2, pHtrue: 1.9, pHbias: 0, pHdrift: 0, labPH: 1.9, labT: 0, leach: 6600, oreF: 1, oreFf: 1,
      qFeed: 2134, qOrg: 1920, craf: 0.22, yL: 5.6, ys: 2.3, ext: 93, T: 6500, crud: 0.02, crudRate: 0, iface: 0.27, mixEff: [1, 1, 1],
      Ce: 44, Acid: 182, Fe: 0.70, Co: 150, lvEl: 62, qEl: 1000, Te: 45, hxOk: true, D: 6450, CE: 92, Vcell: 1.96, outage: 0, pbSpike: 0,
      shorts: new Float32Array(NCELL), fixing: [], monitor: false, lastRound: 0, roundEvery: 4 * 3600, seen: new Uint8Array(NCELL),
      Pb: 1.5, Sppm: 4, FeC: 2, quality: true,
      cathShift: 0, cathTotal: 0, energyShift: 0, acidShift: 0, oreShift: 0, plannedShift: 0, lostShorts: 0, lostRect: 0, downShift: 0, alarmsShift: 0, shiftId: -1,
      shiftHist: [], kwhTotal: 0
    };
    for (let i = 0; i < 240; i++) X.beltBuf[i] = 1700;
    // dos cortos iniciales de muestra
    X.shorts[37] = 3; X.shorts[118] = 2;

    /* ----- tags (valor, unidad, rango, banda normal) ----- */
    const T = {};
    const tag = (id, desc, unit, area, dec, lo, hi, nl, nh) => { T[id] = {id, desc, unit, area, dec, lo, hi, nl, nh, v: 0}; };
    tag('WIT-101', 'Tonelaje en pesómetro', 't/h', 100, 0, 0, 2500, 1500, 1900);
    tag('SIT-101', 'Velocidad alimentador', '%', 100, 0, 0, 100, 50, 95);
    tag('FIT-102', 'Caudal de ácido', 'm³/h', 100, 1, 0, 30, 14, 23);
    tag('KY-102', 'Dosis real de ácido', 'kg/t', 100, 1, 0, 40, 18, 22);
    tag('FIT-104', 'Caudal de agua', 'm³/h', 100, 0, 0, 250, 90, 150);
    tag('AIT-105', 'Humedad del aglomerado', '%', 100, 1, 0, 20, 8, 10.5);
    tag('LIT-103', 'Nivel estanque diario de ácido', '%', 100, 0, 0, 100, 30, 95);
    tag('PIT-202', 'Presión cabezal de riego', 'bar', 200, 2, 0, 7, 3, 5);
    tag('FIT-211', 'Riego módulo 1', 'm³/h', 200, 0, 0, 1200, 600, 850);
    tag('FIT-212', 'Riego módulo 2', 'm³/h', 200, 0, 0, 1200, 600, 850);
    tag('FIT-213', 'Riego módulo 3', 'm³/h', 200, 0, 0, 1200, 600, 850);
    tag('FIT-200', 'Riego total', 'm³/h', 200, 0, 0, 3500, 1900, 2500);
    tag('LIT-201', 'Nivel piscina de refino', 'm', 200, 2, 0, 5, 2, 4.2);
    tag('FIT-206', 'Agua de reposición', 'm³/h', 200, 0, 0, 300, 0, 200);
    tag('FIT-203', 'Caudal de PLS desde pilas', 'm³/h', 200, 0, 0, 3500, 1800, 2500);
    tag('LIT-204', 'Nivel piscina PLS', 'm', 200, 2, 0, 5, 2, 4.2);
    tag('AIT-206', 'Cobre en PLS', 'g/L', 200, 2, 0, 6, 2.5, 4.5);
    tag('AIT-207', 'pH del PLS', 'pH', 200, 2, 0, 4, 1.6, 2.2);
    tag('FIT-205', 'Alimentación a SX', 'm³/h', 200, 0, 0, 3000, 1800, 2400);
    tag('AIT-208', 'Cobre en refino', 'g/L', 300, 2, 0, 2, 0, 0.4);
    tag('FIT-301', 'Caudal de orgánico', 'm³/h', 300, 0, 0, 3500, 1500, 2300);
    tag('KY-301', 'Razón O/A', '', 300, 2, 0, 2, 0.8, 1.05);
    tag('AIT-302', 'Cobre en orgánico cargado', 'g/L', 300, 2, 0, 9.24, 4.5, 7);
    tag('KY-303', 'Extracción', '%', 300, 1, 50, 100, 90, 100);
    tag('LIT-303', 'Interfase E1 (espesor orgánico)', 'm', 300, 2, 0, 0.6, 0.2, 0.35);
    tag('AIT-309', 'Arrastre acuoso en orgánico', 'ppm', 300, 0, 0, 2000, 0, 400);
    tag('KY-304', 'Transferencia de cobre', 't/h', 300, 2, 0, 10, 5.5, 7.5);
    tag('IIT-401', 'Corriente del rectificador', 'kA', 400, 1, 0, 50, 33, 40);
    tag('EIT-401', 'Voltaje del rectificador', 'V', 400, 0, 0, 450, 250, 360);
    tag('JIT-401', 'Potencia del rectificador', 'MW', 400, 1, 0, 20, 8, 14);
    tag('KY-401', 'Densidad de corriente', 'A/m²', 400, 0, 0, 450, 250, 340);
    tag('KY-402', 'Voltaje medio de celda', 'V', 400, 2, 1.5, 2.5, 1.85, 2.15);
    tag('FIT-402', 'Caudal de electrolito a celdas', 'm³/h', 400, 0, 0, 1500, 800, 1200);
    tag('TIT-403', 'Temperatura del electrolito', '°C', 400, 1, 20, 65, 42, 50);
    tag('AIT-405', 'Cobre en electrolito', 'g/L', 400, 1, 30, 55, 40, 48);
    tag('AIT-406', 'Ácido en electrolito', 'g/L', 400, 0, 140, 220, 170, 195);
    tag('AIT-407', 'Hierro en electrolito', 'mg/L', 400, 0, 0, 3000, 0, 1200);
    tag('AIT-408', 'Cobalto en electrolito', 'mg/L', 400, 0, 0, 300, 120, 200);
    tag('LIT-401', 'Nivel estanque de electrolito', '%', 400, 0, 0, 100, 40, 85);
    tag('KY-405', 'Producción de cátodo', 't/h', 400, 2, 0, 10, 5.5, 7.5);
    tag('KY-406', 'Eficiencia de corriente', '%', 400, 1, 60, 100, 88, 100);
    tag('KY-407', 'Energía específica', 'kWh/t', 400, 0, 1000, 3500, 1600, 2200);
    tag('FIT-404', 'Dosificación de cobalto', 'L/h', 400, 0, 0, 100, 30, 70);
    tag('FIT-409', 'Sangrado de electrolito', 'm³/h', 400, 1, 0, 20, 3, 12);
    tag('JIT-500', 'Demanda total de la planta', 'MW', 500, 1, 0, 25, 10, 18);
    tag('KY-501', 'Factor de potencia', '', 500, 2, 0.5, 1, 0.92, 1);
    tag('KY-502', 'Distorsión armónica (THD)', '%', 500, 1, 0, 15, 0, 5);
    tag('LIT-501', 'Stock de ácido', 't', 500, 0, 0, 2000, 500, 1900);
    tag('LIT-502', 'Piscina de agua de proceso', 'm³', 500, 0, 0, 5000, 1500, 4800);

    Object.values(M).forEach((m) => tag('VIT-' + m.id, 'Vibración ' + m.id, 'mm/s', m.area, 1, 0, m.z[2] * 1.6, 0, m.z[1]));
    /* ----- alarmas (ISA-18.2: prioridad 1 alta, 2 media, 3 baja) ----- */
    const AD = [];
    // en: condición de habilitación (alarma por estado, ISA-18.2): con el área detenida a propósito, estas alarmas no tienen sentido y se suprimen.
    const al = (tagId, type, lim, prio, desc, delay = 10, en = null) => AD.push({id: tagId + '.' + type, tag: tagId, type, lim, prio, desc, delay, en, st: 'N', since: 0, tOn: null, shelved: 0, count: 0, area: tagId === 'DISC' ? 0 : null});
    const feeding = () => running('FD-101') && running('CV-101'), dosing = () => running('P-102') && X.tonDrum > 500;
    al('WIT-101', 'L', 1200, 3, 'Tonelaje bajo a aglomeración', 30, feeding);
    al('KY-102', 'H', 23, 2, 'Dosis de ácido alta', 10, dosing);
    al('KY-102', 'L', 17, 2, 'Dosis de ácido baja', 10, dosing);
    al('AIT-105', 'H', 11, 3, 'Aglomerado muy húmedo', 60, dosing);
    al('AIT-105', 'L', 7.5, 3, 'Aglomerado seco', 60, dosing);
    al('LIT-103', 'L', 25, 2, 'Nivel bajo estanque diario de ácido');
    al('PIT-202', 'L', 2.5, 2, 'Presión baja en cabezal de riego');
    al('PIT-202', 'LL', 1.0, 1, 'Sin presión de riego', 5);
    al('FIT-200', 'L', 1600, 2, 'Riego total bajo', 30);
    al('LIT-201', 'H', 4.2, 2, 'Nivel alto piscina de refino');
    al('LIT-201', 'L', 1.6, 2, 'Nivel bajo piscina de refino');
    al('LIT-201', 'LL', 0.8, 1, 'Nivel muy bajo piscina de refino');
    al('LIT-204', 'H', 4.2, 2, 'Nivel alto piscina PLS');
    al('LIT-204', 'HH', 4.7, 1, 'Riesgo de rebalse piscina PLS', 5);
    al('LIT-204', 'L', 1.6, 2, 'Nivel bajo piscina PLS');
    al('LIT-204', 'LL', 0.8, 1, 'Nivel muy bajo piscina PLS');
    al('FIT-205', 'L', 1500, 2, 'Alimentación a SX baja', 30);
    al('AIT-206', 'L', 2.4, 3, 'Cobre bajo en PLS', 120);
    al('AIT-207', 'H', 2.3, 3, 'pH alto en PLS', 60);
    al('AIT-207', 'L', 1.5, 3, 'pH bajo en PLS', 60);
    al('AIT-208', 'H', 0.45, 2, 'Cobre alto en refino', 60);
    al('KY-301', 'L', 0.75, 2, 'Razón O/A baja', 30);
    al('LIT-303', 'H', 0.38, 2, 'Interfase alta en E1 (borra)', 60);
    al('AIT-309', 'H', 500, 2, 'Arrastre alto hacia electrolito', 60);
    // corriente baja deliberada (protección o rampa de puesta en servicio) no es una anormalidad
    al('IIT-401', 'L', 30, 2, 'Corriente baja en la nave', 30, () => RECT.state !== 'STOP' && seqs[400].st !== 'RUN' && !(L['IIC-401'].mode === 'AUTO' && L['IIC-401'].sp < 30));
    al('FIT-402', 'L', 750, 2, 'Caudal bajo de electrolito');
    al('FIT-402', 'LL', 500, 1, 'Caudal muy bajo de electrolito (disparo RT)', 5);
    al('TIT-403', 'H', 52, 2, 'Temperatura alta electrolito');
    al('TIT-403', 'L', 40, 2, 'Temperatura baja electrolito', 60);
    al('TIT-403', 'HH', 58, 1, 'Temperatura muy alta electrolito', 5);
    al('AIT-405', 'L', 38, 2, 'Cobre bajo en electrolito', 60);
    al('AIT-405', 'H', 50, 3, 'Cobre alto en electrolito', 60);
    al('AIT-407', 'H', 1300, 2, 'Hierro alto en electrolito', 60);
    al('AIT-408', 'L', 110, 3, 'Cobalto bajo (corrosión de ánodos)', 120);
    al('KY-406', 'L', 87, 3, 'Eficiencia de corriente baja', 120);
    al('KY-501', 'L', 0.9, 3, 'Factor de potencia bajo', 60);
    al('LIT-501', 'L', 400, 2, 'Stock de ácido bajo');
    al('LIT-501', 'LL', 150, 1, 'Stock de ácido crítico');
    const DISC = {}; // alarmas discretas creadas al vuelo (disparos, enclavamientos, celdas)
    const discAlarm = (id, prio, desc, area, on) => {
      let a = DISC[id];
      if (!a) { a = DISC[id] = {id, tag: id.split('.')[0], type: 'DISC', prio, desc, area, st: 'N', since: 0, tOn: null, shelved: 0, count: 0, delay: 0}; AD.push(a); }
      a.desc = desc; a.forced = on;
    };

    const tagArea = (id) => (T[id] ? T[id].area : (M[id] ? M[id].area : 0));
    AD.forEach((a) => { if (a.area == null) a.area = tagArea(a.tag); });

    /* ----- historiador: cada 10 s simulados, 8 h ----- */
    const HN = 2880, H = {idx: 0, n: 0, t: new Float64Array(HN), d: {}};
    Object.keys(T).forEach((k) => { H.d[k] = new Float32Array(HN); });
    const histPush = () => { H.t[H.idx] = S.t; for (const k in T) H.d[k][H.idx] = T[k].v; H.idx = (H.idx + 1) % HN; H.n = Math.min(HN, H.n + 1); };
    const histGet = (k, win) => { const out = []; for (let i = 0; i < H.n; i++) { const j = (H.idx - H.n + i + HN) % HN; if (S.t - H.t[j] <= win) out.push([H.t[j], H.d[k][j]]); } return out; };

    const now = () => S.t0 + S.t;
    const hm = (ts = now()) => { const h = Math.floor(ts % 86400 / 3600), m = Math.floor(ts % 3600 / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    const hhmm = (ts = now()) => { const d = Math.floor(ts / 86400) + 1, h = Math.floor(ts % 86400 / 3600), m = Math.floor(ts % 3600 / 60); return `Día ${d} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    const shiftOf = (ts = now()) => { const h = Math.floor(ts % 86400 / 3600); return h >= 8 && h < 16 ? 'A' : (h >= 16 ? 'B' : 'C'); };
    const log = (who, msg, kind = 'op') => { S.log.unshift({t: now(), who, msg, kind}); if (S.log.length > 1500) S.log.pop(); };

    /* ----- permisivos y enclavamientos ----- */
    const running = (id) => M[id] && M[id].state === 'RUN';
    const perms = {
      'CV-101': () => [['Tambor M-103 en marcha', running('M-103')], ['Cordón de emergencia rearmado', !M['CV-101'].trip || M['CV-101'].trip === 'reset'], ['MCC-100 energizado', BRK['MCC-100']]],
      'FD-101': () => [['Correa CV-101 en marcha', running('CV-101')], ['MCC-100 energizado', BRK['MCC-100']]],
      'P-102': () => [['Correa CV-101 en marcha', running('CV-101')], ['Tambor M-103 en marcha', running('M-103')], ['Nivel estanque de ácido > 10 %', X.tk103 > 10]],
      'P-104': () => [['Correa CV-101 en marcha', running('CV-101')], ['Tambor M-103 en marcha', running('M-103')]],
      'P-201A': () => [['Nivel piscina de refino > 0,8 m', X.lvRaf > 0.8], ['MCC-200 energizado', BRK['MCC-200']]],
      'P-201B': () => [['Nivel piscina de refino > 0,8 m', X.lvRaf > 0.8], ['MCC-200 energizado', BRK['MCC-200']]],
      'P-202A': () => [['Nivel piscina PLS > 0,8 m', X.lvPLS > 0.8], ['MCC-200 energizado', BRK['MCC-200']]],
      'P-202B': () => [['Nivel piscina PLS > 0,8 m', X.lvPLS > 0.8], ['MCC-200 energizado', BRK['MCC-200']]],
      'RT-401': () => [['Caudal de electrolito > 500 m³/h', X.qEl > 500], ['Temperatura < 58 °C', X.Te < 58], ['Interruptor 52-RT cerrado', BRK['52-RT']]],
      'P-501': () => [['Stock de ácido > 50 t', X.tk501 > 50]]
    };
    const permOK = (id) => !perms[id] || perms[id]().every((p) => p[1]);
    const whyNot = (id) => {
      const m = M[id];
      if (m && !BRK[m.mcc]) return `${m.mcc} sin energía`;
      if (m && m.maintUntil) return 'equipo en mantención';
      if (m && m.state === 'TRIP' && m.trip !== 'reset') return 'falta rearmar el disparo';
      const p = perms[id] ? perms[id]().filter((x) => !x[1]).map((x) => x[0].toLowerCase()) : [];
      return p.length ? 'falta permisivo: ' + p.join(', ') : '';
    };
    const tripMotor = (id, why) => { const m = M[id]; if (!m || m.state !== 'RUN') return; m.state = 'TRIP'; m.trip = why; log('Sistema', `${id} disparado: ${why}`, 'trip'); };
    const ilkStop = (id, why) => { const m = M[id]; if (!m || m.state !== 'RUN') return; m.state = 'STOP'; m.ilk = why; log('Sistema', `${id} detenido por enclavamiento: ${why}`, 'warn'); };
    const cmd = {
      start(id, who = 'Operador') {
        if (id === 'RT-401') { if (RECT.state === 'RUN') return; if (!permOK(id)) { log(who, `Partida de RT-401 rechazada: ${whyNot(id)}`, 'warn'); return false; } RECT.state = 'RUN'; RECT.trip = null; RECT.I = 0; log(who, 'RT-401 en servicio, rampa de corriente'); return true; }
        const m = M[id]; if (!m || m.state === 'RUN') return;
        if (!BRK[m.mcc] || m.maintUntil || (m.state === 'TRIP' && m.trip !== 'reset') || !permOK(id)) { log(who, `Partida de ${id} rechazada: ${whyNot(id)}`, 'warn'); return false; }
        m.state = 'RUN'; m.trip = null; m.ilk = null; m.starts++; log(who, `Partida de ${id}`); return true;
      },
      stop(id, who = 'Operador') {
        if (id === 'RT-401') { RECT.state = 'STOP'; log(who, 'RT-401 fuera de servicio'); return; }
        const m = M[id]; if (!m) return; if (m.state === 'RUN') { m.state = 'STOP'; log(who, `Parada de ${id}`); }
      },
      reset(id) { if (id === 'RT-401') { if (RECT.state === 'TRIP') { RECT.state = 'STOP'; RECT.trip = null; log('Operador', 'Rearme de RT-401'); } return; } const m = M[id]; if (m && m.state === 'TRIP') { m.trip = 'reset'; log('Operador', `Rearme de ${id}`); } },
      standby(id, v) { const m = M[id]; if (m) { m.standby = v; log('Operador', `${id} ${v ? 'en respaldo automático' : 'sin respaldo automático'}`); } },
      mode(lp, md, who = 'Operador') { const c = L[lp]; if (!c || !c.modes.includes(md) || c.mode === md) return; c.mode = md; c.i = null; log(who, `${lp} a ${md}`); },
      sp(lp, v) { const c = L[lp]; if (!c) return; c.sp = v; log('Operador', `${lp} consigna ${v} ${c.unit}`); },
      ratio(lp, v) { const c = L[lp]; if (!c) return; c.ratio = v; log('Operador', `${lp} razón ${v} ${c.ratioUnit}`); },
      op(lp, v) { const c = L[lp]; if (!c || c.mode !== 'MAN') return; c.op = clamp(v, 0, 100); log('Operador', `${lp} salida manual ${v.toFixed(0)} %`); },
      breaker(id, v) { BRK[id] = v; log('Operador', `Interruptor ${id} ${v ? 'cerrado' : 'abierto'}`); },
      capBank(v) { capBank = v; log('Operador', `Filtro de armónicos y banco de condensadores ${v ? 'en servicio' : 'fuera de servicio'}`); },
      monitor(v) { X.monitor = v; log('Mantenimiento', `Monitoreo continuo de voltaje de celdas ${v ? 'activado' : 'desactivado'}`); },
      fixCell(k) { if (X.shorts[k] > 0 && !X.fixing.find((f) => f.k === k)) { X.fixing.push({k, until: S.t + 20 * 60}); log('Mantenimiento', `Cuadrilla enviada a corregir celda ${k + 1}`); } },
      fixAllSeen() { for (let k = 0; k < NCELL; k++) if (X.shorts[k] > 0 && (X.monitor || X.seen[k])) cmd.fixCell(k); },
      calibrate() { X.pHbias = 0; X.pHdrift = 0; log('Mantenimiento', 'AIT-207 calibrado con tampones pH 2 y 4'); },
      bearing() { const m = M['M-103']; m.deg = 0; m.vib = m.vibBase; m.sincePM = 0; m.trip = 'reset'; if (m.state === 'RUN') m.state = 'STOP'; m.maintUntil = S.t + 30 * 60; log('Mantenimiento', 'Cambio de rodamiento M-103: equipo detenido 30 min'); },
      cleanCrud() { X.crudRate = 0; X.crud = Math.min(X.crud, 0.02); log('Mantenimiento', 'Borra retirada del decantador E1'); },
      fixHX() { X.hxOk = true; log('Mantenimiento', 'Intercambiador HX-401 reparado'); },
      truck(n = 1) { X.tk501 = Math.min(2000, X.tk501 + 30 * n); log('Operador', `Descarga de ${n} camión(es) de ácido (${30 * n} t)`); },
      delayComp(v) { X.delayComp = v; log('Operador', `Compensación de retardo de la correa ${v ? 'activada' : 'desactivada'}`); },
      ack(id) { const a = AD.find((x) => x.id === id); if (!a) return; if (a.st === 'U') a.st = 'A'; else if (a.st === 'R') a.st = 'N'; else return; log('Operador', `Reconoce alarma ${a.id}`, 'ack'); },
      ackAll(area) { let n = 0; AD.forEach((a) => { if (area && a.area !== area) return; if (a.st === 'U') { a.st = 'A'; n++; } else if (a.st === 'R') { a.st = 'N'; n++; } }); if (n) log('Operador', `Reconoce ${n} alarma${n > 1 ? 's' : ''}` + (area ? ` del área ${area}` : ''), 'ack'); },
      shelve(id, sec = 3600) { const a = AD.find((x) => x.id === id); if (a) { a.shelved = S.t + sec; if (a.st !== 'N') a.st = 'N'; log('Operador', `Alarma ${id} inhibida por ${sec / 60} min`); } },
      seq(id) { return seqStart(id); },
      seqAbort(area = 100) { const q = seqs[area]; if (!q || q.st === 'IDLE') return; const s = SEQ[q.id]; if (q.st === 'RUN') log('Operador', `${s.name} abortada en el paso ${q.k + 1}`, 'warn'); Object.assign(q, {st: 'IDLE', id: null, msg: ''}); }
    };

    /* ----- secuencias (automatización de procedimientos de proceso continuo, ISA-106 simplificado: paso, condición de avance y tiempo máximo) ----- */
    const SEQ = {
      start100: {area: 100, name: 'Partida secuencial del área 100', btn: 'Partida secuencial', note: 'Parte tambor, correa, alimentador y luego ácido y agua.', steps: [
        {d: 'Partir tambor aglomerador M-103', eq: 'M-103', go: () => cmd.start('M-103', 'Secuencia'), ok: () => running('M-103'), min: 15},
        {d: 'Partir correa CV-101', eq: 'CV-101', go: () => cmd.start('CV-101', 'Secuencia'), ok: () => running('CV-101'), min: 20},
        // el controlador espera en manual hasta que el pesómetro mide mineral: si parte en automático con la medición en cero, sobrepasa
        {d: 'WIC-101 en manual al 75 % y partir alimentador FD-101', eq: 'FD-101', go: () => { cmd.mode('WIC-101', 'MAN', 'Secuencia'); L['WIC-101'].op = 75; cmd.start('FD-101', 'Secuencia'); }, ok: () => running('FD-101'), min: 5},
        {d: 'Esperar mineral en el pesómetro y en el tambor', go: () => {}, ok: () => X.ton > 1000 && X.tonDrum > 1000, max: 240},
        {d: 'WIC-101 a automático (cambio sin salto)', go: () => cmd.mode('WIC-101', 'AUTO', 'Secuencia'), ok: () => L['WIC-101'].mode === 'AUTO', min: 5},
        {d: 'Razones en cascada y partir bombas de ácido y agua', eq: 'P-102', go: () => { cmd.mode('FFIC-102', 'CAS', 'Secuencia'); cmd.mode('FFIC-104', 'CAS', 'Secuencia'); cmd.start('P-102', 'Secuencia'); cmd.start('P-104', 'Secuencia'); }, ok: () => running('P-102') && running('P-104'), min: 5}
      ]},
      stop100: {area: 100, name: 'Parada secuencial del área 100', btn: 'Parada secuencial', note: 'Detiene el alimentador y vacía la correa antes de cortar ácido y agua.', steps: [
        {d: 'Detener alimentador FD-101', go: () => cmd.stop('FD-101', 'Secuencia'), ok: () => !running('FD-101'), min: 2},
        {d: 'Vaciar la correa (mineral al tambor < 50 t/h)', go: () => {}, ok: () => X.tonDrum < 50, min: 10, max: 300},
        {d: 'Detener bombas de ácido y agua', go: () => { cmd.stop('P-102', 'Secuencia'); cmd.stop('P-104', 'Secuencia'); }, ok: () => !running('P-102') && !running('P-104'), min: 2},
        {d: 'Detener correa CV-101', go: () => cmd.stop('CV-101', 'Secuencia'), ok: () => !running('CV-101'), min: 2},
        {d: 'Descargar el tambor (60 s)', go: () => {}, ok: () => true, min: 60},
        {d: 'Detener tambor M-103', go: () => cmd.stop('M-103', 'Secuencia'), ok: () => !running('M-103'), min: 2}
      ]},
      // Nave EW: la corriente nunca se energiza sin circulación, temperatura y cobalto; y se sube en rampa para no quemar el depósito.
      start400: {area: 400, name: 'Puesta en servicio de la nave EW', btn: 'Puesta en servicio', note: 'Circulación, temperatura y cobalto primero; luego corriente baja, rampa hasta producción y cascada con AIC-405.', steps: [
        {d: 'Circulación de electrolito (> 800 m³/h)', eq: 'P-401A', go: () => { if (!running('P-401A') && !running('P-401B')) cmd.start(M['P-401A'].state === 'TRIP' && M['P-401A'].trip !== 'reset' ? 'P-401B' : 'P-401A', 'Secuencia'); }, ok: () => X.qEl > 800, min: 5, max: 120},
        {d: 'TIC-403 en automático; electrolito a 38 °C o más', go: () => cmd.mode('TIC-403', 'AUTO', 'Secuencia'), ok: () => X.Te >= 38, max: 6 * 3600, why: () => X.hxOk ? `${X.Te.toFixed(1)} °C` : 'HX-401 sin transferencia de calor'},
        {d: 'Dosificación de cobalto en automático; Co ≥ 110 mg/L (protege el ánodo)', go: () => cmd.mode('FIC-404', 'AUTO', 'Secuencia'), ok: () => X.Co >= 110, max: 2 * 3600, why: () => `cobalto en ${Math.round(X.Co)} mg/L`},
        {d: 'Interruptor 52-RT cerrado', go: () => {}, ok: () => BRK['52-RT'], max: 60, why: () => '52-RT abierto: cerrarlo desde el área 500'},
        {d: 'IIC-401 en automático a 10 kA y RT-401 en servicio', eq: 'RT-401', go: () => { cmd.mode('IIC-401', 'AUTO', 'Secuencia'); L['IIC-401'].sp = 10; if (RECT.state !== 'RUN') cmd.start('RT-401', 'Secuencia'); }, ok: () => RECT.state === 'RUN' && RECT.I >= 9.5, max: 600},
        {d: 'Rampa de corriente hasta 37 kA (2 kA/min)', go: () => { L['IIC-401'].sp = 37; log('Secuencia', 'IIC-401 consigna 37 kA'); }, ok: () => RECT.I >= 36.5, max: 1200, why: () => RECT.state !== 'RUN' ? 'el rectificador salió de servicio' : `corriente en ${RECT.I.toFixed(1)} kA`},
        {d: 'IIC-401 en cascada con AIC-405 (cambio sin salto)', go: () => { const a = L['AIC-405']; a.op = clamp(RECT.I / 50 * 100, 0, 100); a.i = null; cmd.mode('IIC-401', 'CAS', 'Secuencia'); }, ok: () => L['IIC-401'].mode === 'CAS', min: 5}
      ]},
      stop400: {area: 400, name: 'Parada controlada de la nave a corriente de protección', btn: 'Bajar a protección', note: 'Baja la corriente en rampa a 5 kA y la mantiene: el cátodo no se redisuelve y el ánodo conserva su capa de PbO₂. Si la parada se alarga, reduce la transferencia de SX o el cobre se acumula en el electrolito.', steps: [
        {d: 'IIC-401 en automático', go: () => cmd.mode('IIC-401', 'AUTO', 'Secuencia'), ok: () => L['IIC-401'].mode === 'AUTO', min: 2},
        {d: 'Rampa de corriente a 5 kA de protección', go: () => { L['IIC-401'].sp = 5; log('Secuencia', 'IIC-401 consigna 5 kA de protección'); }, ok: () => RECT.state === 'RUN' && RECT.I <= 5.5, max: 1200, why: () => RECT.state !== 'RUN' ? 'el rectificador está fuera de servicio' : `corriente en ${RECT.I.toFixed(1)} kA`},
        {d: 'Mantener circulación y temperatura del electrolito', go: () => {}, ok: () => X.qEl > 800 && L['TIC-403'].mode !== 'MAN', min: 5, max: 60, why: () => X.qEl <= 800 ? 'sin circulación de electrolito' : 'TIC-403 en manual'}
      ]}
    };
    const SEQ_AREAS = {100: ['start100', 'stop100'], 400: ['start400', 'stop400']};
    const seqs = {100: {id: null, k: 0, t0: 0, st: 'IDLE', msg: ''}, 400: {id: null, k: 0, t0: 0, st: 'IDLE', msg: ''}};
    const seqNext = (q) => {
      q.k++; const s = SEQ[q.id];
      if (q.k >= s.steps.length) { q.st = 'DONE'; log('Secuencia', `${s.name} completada`); return; }
      q.t0 = S.t; s.steps[q.k].go();
    };
    const seqStart = (id) => {
      const s = SEQ[id]; if (!s) return false;
      const q = seqs[s.area]; if (q.st === 'RUN') return false;
      Object.assign(q, {id, k: -1, st: 'RUN', msg: '', tStart: S.t});
      log('Operador', `Inicio de ${s.name}`); seqNext(q); return true;
    };
    const seqTick = () => Object.values(seqs).forEach((q) => {
      if (q.st !== 'RUN') return;
      const s = SEQ[q.id], st = s.steps[q.k], el = S.t - q.t0, max = st.max || 60;
      if (st.ok() && el >= (st.min || 0)) seqNext(q);
      else if (el > max) { const w = st.why ? st.why() : st.eq ? whyNot(st.eq) : ''; q.st = 'FAIL'; q.msg = `Paso ${q.k + 1} sin confirmar en ${max >= 3600 ? max / 3600 + ' h' : max + ' s'}${w ? ': ' + w : ''}`; log('Secuencia', `${s.name} detenida. ${q.msg}`, 'trip'); }
    });

    /* ----- escenarios ----- */
    const SCN = [
      {id: 'cord', name: 'Tirón de cordón en CV-101', area: 100, desc: 'Alguien acciona el cordón de emergencia de la correa. Se detiene el mineral y el enclavamiento corta el ácido y el agua. Hay que rearmar y partir en secuencia: correa y luego alimentador.', go() { tripMotor('CV-101', 'cordón de emergencia'); }},
      {id: 'bearing', name: 'Rodamiento dañado en M-103', area: 100, desc: 'La vibración del tambor empieza a subir. Si nadie actúa, en unas horas el motor dispara por vibración muy alta. La vista de mantenimiento lo detecta antes.', go() { M['M-103'].deg = 3; }},
      {id: 'p201', name: 'Falla de la bomba de riego P-201A', area: 200, desc: 'La bomba dispara por sobrecorriente. Si la B está en respaldo automático, parte sola. Si no, la presión de riego cae a cero.', go() { tripMotor('P-201A', 'sobrecorriente'); }},
      {id: 'mcc', name: 'Caída del MCC-200', area: 500, desc: 'Se abre el interruptor del centro de control de motores del área de pilas. Disparan todas las bombas de riego y de PLS a la vez: una avalancha de alarmas.', go() { BRK['MCC-200'] = false; log('Sistema', 'Interruptor MCC-200 abierto por protección', 'trip'); }},
      {id: 'ph', name: 'Deriva del pHmetro AIT-207', area: 200, desc: 'El electrodo empieza a perder calibración. El valor mostrado se aleja del real. La muestra de laboratorio cada 2 horas lo delata.', go() { X.pHdrift = 0.12 / 3600; }},
      {id: 'ore', name: 'Cambio de mineral', area: 200, desc: 'Entra mineral con menos cobre soluble y más ganga que consume ácido. Unas horas después cae el cobre del PLS y toda la cadena lo siente.', go() { X.oreF = 0.72; }},
      {id: 'crud', name: 'Borra en el decantador E1', area: 300, desc: 'Se forma una banda de borra en la interfase. Sube el arrastre de PLS hacia el electrolito y con él el hierro, que baja la eficiencia de corriente. Con 1.800 m³ de electrolito el hierro sube en días: míralo a ×300.', go() { X.crudRate = 0.06 / 3600; }},
      {id: 'shorts', name: 'Racha de cortocircuitos en EW', area: 400, desc: 'Aparecen diez cortocircuitos en distintas celdas. Sin monitoreo continuo solo se ven en la próxima ronda.', go() { for (let i = 0; i < 10; i++) { const k = Math.floor(rnd() * NCELL); X.shorts[k] = Math.min(6, X.shorts[k] + 1 + Math.floor(rnd() * 4)); } log('Sistema', 'Racha de cortocircuitos en la nave', 'trip'); }},
      {id: 'rt', name: 'Disparo del rectificador RT-401', area: 400, desc: 'El rectificador dispara por una falla de refrigeración del transformador. La nave queda sin corriente: el cobre que sigue llegando de SX se acumula en el electrolito y, si el corte se alarga, el cátodo sale con plomo al volver la corriente. Rearma y usa la puesta en servicio de la nave.', go() { if (RECT.state === 'RUN') { RECT.state = 'TRIP'; RECT.trip = 'falla de refrigeración del transformador'; log('Sistema', 'RT-401 disparado: falla de refrigeración del transformador', 'trip'); } }},
      {id: 'hx', name: 'Falla del intercambiador HX-401', area: 400, desc: 'El intercambiador deja de calentar. La temperatura del electrolito baja lento, la conductividad cae y sube el voltaje y la energía por tonelada.', go() { X.hxOk = false; }},
      {id: 'acid', name: 'Camiones de ácido atrasados', area: 500, desc: 'Un corte de ruta detiene el abastecimiento por 12 horas con el stock en 300 t. La aglomeración consume unas 34 t/h de ácido.', go() { X.tk501 = 300; X.trucksHold = S.t + 12 * 3600; }}
    ];
    const scenario = (id) => { const s = SCN.find((x) => x.id === id); if (s) { s.go(); log('Escenario', s.name, 'scn'); } };

    /* ---------- un paso de 1 s ---------- */
    function step() {
      const dt = 1;
      S.t += dt;
      const ts = now();

      // energía de los MCC
      Object.values(M).forEach((m) => { if (!BRK[m.mcc] && m.state === 'RUN') tripMotor(m.id, `sin tensión en ${m.mcc}`); });
      // respaldo automático
      [['P-201A', 'P-201B'], ['P-202A', 'P-202B'], ['P-401A', 'P-401B']].forEach(([a, b]) => {
        const A = M[a], B = M[b];
        if (A.state !== 'RUN' && B.state !== 'RUN' && B.standby && A.state === 'TRIP' && BRK[B.mcc] && permOK(b) && B.state !== 'TRIP') { B.state = 'RUN'; B.starts++; log('Sistema', `${b} partió por respaldo automático`); }
      });
      // mantenimiento en curso
      const m103 = M['M-103']; if (m103.maintUntil && S.t >= m103.maintUntil) { m103.maintUntil = 0; log('Mantenimiento', 'M-103 disponible tras cambio de rodamiento'); }
      seqTick();

      /* --- Área 100 --- */
      if (!running('M-103') && running('CV-101')) ilkStop('CV-101', 'tambor detenido');
      if (!running('CV-101') && running('FD-101')) ilkStop('FD-101', 'correa detenida');
      ['P-102', 'P-104'].forEach((p) => { if (running(p) && !permOK(p)) ilkStop(p, 'permisivo perdido'); });
      const wic = L['WIC-101'];
      let fdOut = running('FD-101') ? wic.step(X.ton, dt) : (wic.mode === 'AUTO' ? (wic.i = null, wic.op) : wic.op);
      if (!running('FD-101')) fdOut = 0;
      X.feeder = lag(X.feeder, fdOut, 4, dt);
      const oreOut = running('FD-101') ? X.feeder * 22 * X.oreAvail * (1 + 0.04 * gauss()) : 0;
      const belt = running('CV-101');
      X.bi = (X.bi + 1) % 240;
      X.beltBuf[X.bi] = belt ? oreOut : 0;
      if (belt) { X.ton = X.beltBuf[(X.bi - 20 + 240) % 240]; X.tonDrum = X.beltBuf[(X.bi - 65 + 240) % 240]; } else { X.ton = 0; X.tonDrum = lag(X.tonDrum, 0, 5, dt); }
      // razón ácido
      const ff2 = L['FFIC-102'], ff4 = L['FFIC-104'];
      // compensación de retardo: el pesómetro está 20 s después del alimentador y el tambor a 65 s; la razón usa la lectura del pesómetro retrasada 45 s
      const tonRef = X.delayComp ? X.beltBuf[(X.bi - 65 + 240) % 240] : X.ton;
      ff2.casSP = ff2.ratio * (belt ? tonRef : 0) / 1840;   // m³/h de ácido (1,84 t/m³)
      ff4.casSP = ff4.ratio * (belt ? tonRef : 0);
      const v102 = running('P-102') ? ff2.step(X.acidQ, dt) : 0;
      const v104 = running('P-104') ? ff4.step(X.waterQ, dt) : 0;
      X.acidQ = lag(X.acidQ, running('P-102') && X.tk103 > 1 ? v102 / 100 * 30 : 0, 3, dt);
      X.waterQ = lag(X.waterQ, running('P-104') ? v104 / 100 * 200 : 0, 3, dt);
      const dose = X.tonDrum > 50 ? X.acidQ * 1840 / X.tonDrum : 0;
      const mo = X.tonDrum > 50 ? (X.tonDrum * 0.03 + X.waterQ) / (X.tonDrum + X.waterQ + X.acidQ * 1.84) * 100 : X.moist;
      X.moist = lag(X.moist, mo, 60, dt);
      // ácido: estanque diario (60 m³) y bodega
      X.tk103 = clamp(X.tk103 + (X.p501On ? 40 : 0) * dt / 3600 / 60 * 100 - X.acidQ * dt / 3600 / 60 * 100, 0, 100);
      if (X.tk103 < 40 && !X.p501On && M['P-501'].state !== 'TRIP' && permOK('P-501')) { M['P-501'].state = 'RUN'; M['P-501'].starts++; X.p501On = true; }
      if (X.p501On && (X.tk103 > 85 || !running('P-501'))) { X.p501On = false; if (running('P-501')) M['P-501'].state = 'STOP'; }
      if (X.p501On && X.tk501 <= 1) { tripMotor('P-501', 'stock de ácido agotado'); X.p501On = false; }
      X.tk501 = Math.max(0, X.tk501 - (X.p501On ? 40 * 1.84 : 0) * dt / 3600);
      if (S.t > X.trucksHold) { X.truckAcc += X.trucksPerH * dt / 3600; if (X.truckAcc >= 1) { X.truckAcc -= 1; X.tk501 = Math.min(2000, X.tk501 + 30); } }
      X.acidShift += X.acidQ * 1.84 * dt / 3600; X.oreShift += X.tonDrum * dt / 3600;

      /* --- Área 200 --- */
      const nP1 = (running('P-201A') ? 1 : 0) + (running('P-201B') ? 1 : 0);
      ['P-201A', 'P-201B'].forEach((p) => { if (running(p) && X.lvRaf < 0.8) tripMotor(p, 'nivel muy bajo en piscina de refino'); });
      let qTot = 0;
      for (let k = 0; k < 3; k++) {
        const c = L['FIC-21' + (k + 1)];
        const vp = c.step(X.qMod[k], dt);
        const q = nP1 ? 611 * vp / 100 * Math.sqrt(Math.max(0, X.pHdr)) : 0;
        X.qMod[k] = lag(X.qMod[k], q, 5, dt); qTot += X.qMod[k];
      }
      const pTarget = nP1 ? Math.max(0, 6 * (1 - (qTot / (3800 * nP1)) ** 2)) : 0;
      X.pHdr = lag(X.pHdr, pTarget, 3, dt);
      for (let k = 0; k < 3; k++) X.fMod[k] = lag(X.fMod[k], Math.min(1.15, Math.pow(Math.max(0, X.qMod[k]) / 733, 0.4)), 3600, dt);
      X.stackF = lag(X.stackF, X.tonDrum / 1700, 72 * 3600, dt);
      // lixiviación con apilamiento continuo: el sector 1 riega mineral de 0 a 30 días, el 2 de 30 a 60 y el 3 de 60 a 90.
      // Lo que entrega cada sector sale de la curva de recuperación (ENAMI, óxidos): R(30) = 46,8 %, R(60) − R(30) = 10,9 %, R(90) − R(60) = 6,9 %.
      X.oreFf = lag(X.oreFf, X.oreF, 6 * 3600, dt);
      const cuDay = 1700 * 24 * 0.006 * 1000 / 24;  // kg/h de cobre que entra a la pila en régimen
      X.secR = [R(30) / 100 * X.stackF, (R(60) - R(30)) / 100, (R(90) - R(60)) / 100];
      X.secCu = X.secR.map((r, k) => cuDay * r * X.fMod[k] * X.oreFf);
      X.leach = X.secCu[0] + X.secCu[1] + X.secCu[2];
      X.qPLS = lag(X.qPLS, 0.97 * qTot, 3600, dt);
      const cuInPLS = X.qPLS > 100 ? X.craf + X.leach / X.qPLS : X.cuPLS;
      X.cuPLS = lag(X.cuPLS, Math.min(cuInPLS, 6), 1800, dt);
      X.pHtrue = lag(X.pHtrue, 1.9 + 0.35 * (1 - clamp(dose / 20, 0, 2)) * (X.tonDrum > 50 ? 1 : 0) + (X.oreF < 1 ? 0.25 : 0), 6 * 3600, dt);
      X.pHbias += X.pHdrift * dt;
      if (S.t - X.labT >= 7200) { X.labT = S.t; X.labPH = X.pHtrue; }
      // piscina PLS
      ['P-202A', 'P-202B'].forEach((p) => { if (running(p) && X.lvPLS < 0.8) tripMotor(p, 'nivel muy bajo en piscina PLS'); });
      const nP2 = (running('P-202A') ? 1 : 0) + (running('P-202B') ? 1 : 0);
      const lic204 = L['LIC-204'], fic205 = L['FIC-205'];
      const lop = lic204.step(X.lvPLS, dt);
      fic205.casSP = lop / 100 * 3000;
      const v205 = fic205.step(X.qFeed, dt);
      X.qFeed = lag(X.qFeed, nP2 ? v205 / 100 * 3000 : 0, 4, dt);
      X.lvPLS = clamp(X.lvPLS + (X.qPLS - X.qFeed) * dt / 3600 / 6000, 0, 5.2);
      // piscina de refino
      const lic201 = L['LIC-201'];
      const vmk = lic201.step(X.lvRaf, dt);
      X.makeup = lag(X.makeup, X.tk502 > 50 ? vmk / 100 * 300 : 0, 10, dt);
      X.tk502 = clamp(X.tk502 + (200 - X.makeup - X.waterQ) * dt / 3600 + (X.tk502 < 4000 ? 0 : -1e-9), 0, 5000);
      X.lvRaf = clamp(X.lvRaf + ((X.qFeed + X.makeup + (X.bleedQ || 0)) - qTot) * dt / 3600 / 5000, 0, 5.2);

      /* --- Área 300 --- */
      const ff301 = L['FFIC-301'];
      ff301.casSP = ff301.ratio * X.qFeed;
      const v305 = running('P-305') ? ff301.step(X.qOrg, dt) : 0;
      X.qOrg = lag(X.qOrg, running('P-305') ? v305 / 100 * 3500 : 0, 5, dt);
      for (let k = 0; k < 3; k++) X.mixEff[k] = lag(X.mixEff[k], running('M-30' + (k + 1)) ? 1 : 0, 120, dt);
      X.crud = clamp(X.crud + X.crudRate * dt, 0, 0.3);
      X.iface = lag(X.iface, 0.27 + X.crud * 0.6 + 0.04 * Math.min(0.5, Math.max(0, X.qOrg / Math.max(X.qFeed, 1) - 0.9)), 300, dt);
      const ent = 150 + 3500 * Math.max(0, X.crud - 0.02) + (X.mixEff[0] < 0.5 ? 400 : 0);
      X.ent = lag(X.ent || 150, ent, 300, dt);
      if (S.t % 10 === 0) {
        const N = (X.mixEff[0] > 0.5 ? 1 : 0) + (X.mixEff[1] > 0.5 ? 1 : 0);
        const oa = X.qFeed > 10 ? X.qOrg / X.qFeed : 0;
        const r = cascade(15.4, oa, N, X.cuPLS, X.pHtrue, X.ys);
        X.craf = X.qFeed > 10 && N > 0 ? r.craf : X.cuPLS; X.yL = r.yL;
        X.ext = X.cuPLS > 0 ? 100 * (1 - X.craf / X.cuPLS) : 0;
      }
      const stripOn = X.mixEff[2] > 0.5 && X.qOrg > 10;
      const ysEq = 2.3 * Math.pow(183 / Math.max(X.Acid, 120), 1.4);
      X.ys = lag(X.ys, stripOn ? ysEq : X.yL, 900, dt);
      X.T = stripOn ? X.qOrg * Math.max(0, X.yL - X.ys) : 0;     // kg/h de cobre al electrolito
      X.T = Math.min(X.T, X.qFeed * Math.max(0, X.cuPLS - X.craf) * 1.05 + 50);

      /* --- Área 400 --- */
      ['P-401A', 'P-401B'].forEach((p) => { if (running(p) && X.lvEl < 10) tripMotor(p, 'nivel muy bajo de electrolito'); });
      const nP4 = (running('P-401A') ? 1 : 0) + (running('P-401B') ? 1 : 0);
      X.lvEl = lag(X.lvEl, nP4 ? 62 : 84, 240, dt);   // sin bombeo, las cañerías de retorno drenan al estanque y el nivel sube
      X.qEl = lag(X.qEl, nP4 ? 1000 : 0, 8, dt);
      // interlocks del rectificador
      if (RECT.state === 'RUN') {
        if (X.qEl < 500) { RECT.state = 'TRIP'; RECT.trip = 'caudal de electrolito muy bajo'; log('Sistema', 'RT-401 disparado: caudal de electrolito muy bajo', 'trip'); }
        else if (X.Te >= 58) { RECT.state = 'TRIP'; RECT.trip = 'temperatura muy alta'; log('Sistema', 'RT-401 disparado: temperatura muy alta', 'trip'); }
        else if (!BRK['52-RT']) { RECT.state = 'TRIP'; RECT.trip = 'interruptor 52-RT abierto'; log('Sistema', 'RT-401 disparado: 52-RT abierto', 'trip'); }
      }
      const aic = L['AIC-405'], iic = L['IIC-401'];
      const aop = aic.step(X.Ce, dt);
      iic.casSP = clamp(aop / 100 * 50, 15, 45);
      const iop = RECT.state === 'RUN' ? iic.step(RECT.I, dt) : (iic.i = null, iic.op);
      const Itarget = RECT.state === 'RUN' ? iop / 100 * 50 : 0;
      RECT.I = RECT.state === 'RUN' ? clamp(Itarget, RECT.I - RECT.ramp * dt, RECT.I + RECT.ramp * dt) : lag(RECT.I, 0, 2, dt);
      const I = RECT.I, j = I * 1000 / (2 * NCAT);
      const Vc = vcell(j, X.Te);
      // cortocircuitos: aparecen con más densidad de corriente
      if (I > 1 && rnd() < 1.5 / 3600 * Math.pow(j / 310, 3)) { const k = Math.floor(rnd() * NCELL); X.shorts[k] = Math.min(6, X.shorts[k] + 1 + Math.floor(rnd() * 3)); }
      X.fixing = X.fixing.filter((f) => { if (S.t >= f.until) { X.shorts[f.k] = 0; X.seen[f.k] = 0; log('Mantenimiento', `Celda ${f.k + 1} corregida`); return false; } return true; });
      if (!X.monitor && S.t - X.lastRound >= X.roundEvery) { X.lastRound = S.t; let n = 0; for (let k = 0; k < NCELL; k++) if (X.shorts[k] > 0) { X.seen[k] = 1; n++; } log('Mantenimiento', `Ronda manual de la nave: ${n} celdas con cortocircuito encontradas`); }
      const feEff = Math.max(0, X.Fe - 0.5) * 0.02;
      const tEff = X.Te < 40 ? (40 - X.Te) * 0.004 : 0;
      let ceSum = 0, vSum = 0, lostS = 0;
      const base = 0.955 - feEff - tEff;
      for (let k = 0; k < NCELL; k++) { const s = X.shorts[k] * 2 / NCAT; ceSum += Math.max(0, base - s); lostS += Math.min(base, s); vSum += Vc * (1 - 0.35 * X.shorts[k] / 6); }
      if (I > 0.5) { X.CE = 100 * ceSum / NCELL; X.ceLoss = {fe: feEff * 100, temp: tEff * 100, shorts: 100 * lostS / NCELL, base: 95.5}; }
      X.vp = vparts(j, X.Te);
      X.Vcell = vSum / NCELL; X.cellV = (k) => Vc * (1 - 0.35 * X.shorts[k] / 6);
      X.D = I * 1.1855 * ceSum;                                           // kg/h
      const Pdc = I * vSum / 1000;                                       // MW (kA × V)
      RECT.V = vSum; RECT.P = Pdc;
      X.bleedQ = L['FIC-409'].step(X.bleedQ || 7, dt) / 100 * 20; // m³/h
      const coQ = L['FIC-404'].step(X.coQ || 45, dt) / 100 * 100;  X.coQ = coQ;
      // inventario del electrolito: 160 celdas de unos 8 m³ más estanques, filtros e intercambiadores
      const V = VEL;
      X.Ce += (X.T - X.D - X.bleedQ * X.Ce) * dt / 3600 / V;
      X.Acid += 1.543 * (X.D + X.bleedQ * X.Ce - X.T) * dt / 3600 / V;   // la reposición del sangrado entra con ácido
      X.Acid = clamp(X.Acid + (182 - X.Acid) * X.bleedQ * dt / 3600 / V, 100, 260);
      const feIn = X.qOrg * X.ent * 1e-6 * 5.8 + X.T / 2000;           // kg/h
      X.Fe += (feIn - X.bleedQ * X.Fe) * dt / 3600 / V;
      X.Co += (coQ * 20 / 1000 - X.bleedQ * X.Co / 1000) * dt / 3600 / V * 1000; // mg/L
      // temperatura
      const qhx = X.hxOk ? L['TIC-403'].step(X.Te, dt) / 100 * 4 : (L['TIC-403'].step(X.Te, dt), 0); // MW
      // balance térmico: capacidad ≈ 4 MJ/(m³·K) del electrolito; 25 % de la potencia DC queda como calor (V celda sobre el voltaje termoneutro)
      X.Te += (qhx + 0.25 * Pdc - 0.163 * (X.Te - 15)) * dt / (VEL * 4);
      // calidad estimada del cátodo (ppm)
      // Corte de corriente: la capa de PbO2 del ánodo se reduce y, al volver la corriente, se desprenden partículas con plomo que el cátodo atrapa.
      // Efecto conocido; la magnitud (unos 3 ppm de Pb por hora de corte, que decae en unas 4 h) es ilustrativa.
      if (I < 1) X.outage += dt; else if (I > 5 && X.outage > 0) { if (X.outage > 600) { X.pbSpike = Math.min(12, X.pbSpike + 3 * X.outage / 3600); log('Sistema', `Nave reenergizada tras ${Math.round(X.outage / 60)} min sin corriente: riesgo de plomo en el cátodo`, 'warn'); } X.outage = 0; }
      X.pbSpike = lag(X.pbSpike, 0, 4 * 3600, dt);
      X.Pb = lag(X.Pb, 1.2 + 6 * Math.max(0, (120 - X.Co) / 120) + X.pbSpike, 900, dt);
      X.Sppm = lag(X.Sppm, 3 + Math.max(0, j - 320) * 0.12 + (X.Te < 40 ? 5 : 0), 3600, dt);
      X.FeC = lag(X.FeC, 1 + X.Fe * 1.5, 3600, dt);
      const sum = X.Pb + X.Sppm + X.FeC + 4 + 1.5;
      X.quality = X.Pb <= 5 && X.Sppm <= 15 && X.FeC <= 10 && sum <= 65;

      /* --- Área 500 y balance eléctrico --- */
      let mccKW = 0; Object.values(M).forEach((m) => { if (m.state === 'RUN') mccKW += m.kw * m.load; });
      const pRect = Pdc / 0.975;
      const MW = pRect + mccKW / 1000;
      const pf = capBank ? 0.96 : 0.86 - 0.04 * Math.max(0, 1 - I / 37);
      const thd = capBank ? 3.1 : 8.5;
      X.MW = MW; X.pf = I > 1 ? pf : 0.9; X.thd = I > 1 ? thd : 1; X.mccKW = mccKW; X.capBank = capBank;

      // motores: corriente, vibración y temperatura
      Object.values(M).forEach((m) => {
        if (m.state === 'RUN') { m.hours += dt / 3600; m.sincePM += dt / 3600; }
        const ld = m.state === 'RUN' ? m.load : 0;
        m.amps = ld * m.kw * 1000 / (Math.sqrt(3) * 690 * 0.88) * (m.kw > 300 ? 690 / 6600 : 1);
        let vt = m.state === 'RUN' ? m.vibBase : 0.2;
        if (m.deg > 0 && m.state === 'RUN') { m.deg += dt / 3600; vt = m.vibBase + 0.3 * m.z[0] / 2.3 * (Math.exp((m.deg - 1) / 2) - 1); }
        m.vib = lag(m.vib, vt * (1 + 0.04 * gauss()), 20, dt);
        m.temp = lag(m.temp, m.state === 'RUN' ? 52 + 3 * ld + 2.2 * Math.max(0, m.vib - m.z[0]) : 25, 900, dt);
        const vtrip = m.z[2] * 1.25; // disparo a 1,25 veces el límite C/D
        if (m.state === 'RUN' && m.vib > vtrip) tripMotor(m.id, `vibración muy alta (> ${vtrip.toFixed(1).replace('.', ',')} mm/s)`);
      });

      /* --- tags --- */
      const set = (k, v) => { T[k].v = v; };
      set('WIT-101', X.ton); set('SIT-101', X.feeder); set('FIT-102', X.acidQ); set('KY-102', dose); set('FIT-104', X.waterQ); set('AIT-105', X.moist); set('LIT-103', X.tk103);
      set('PIT-202', X.pHdr); set('FIT-211', X.qMod[0]); set('FIT-212', X.qMod[1]); set('FIT-213', X.qMod[2]); set('FIT-200', qTot);
      set('LIT-201', X.lvRaf); set('FIT-206', X.makeup); set('FIT-203', X.qPLS); set('LIT-204', X.lvPLS); set('AIT-206', X.cuPLS); set('AIT-207', X.pHtrue + X.pHbias); set('FIT-205', X.qFeed);
      set('AIT-208', X.craf); set('FIT-301', X.qOrg); set('KY-301', X.qFeed > 10 ? X.qOrg / X.qFeed : 0); set('AIT-302', X.yL); set('KY-303', X.ext); set('LIT-303', X.iface); set('AIT-309', X.ent); set('KY-304', X.T / 1000);
      set('IIT-401', I); set('EIT-401', RECT.V); set('JIT-401', Pdc); set('KY-401', j); set('KY-402', X.Vcell); set('FIT-402', X.qEl); set('TIT-403', X.Te);
      set('AIT-405', X.Ce); set('AIT-406', X.Acid); set('AIT-407', X.Fe * 1000); set('AIT-408', X.Co); set('LIT-401', X.lvEl); set('KY-405', X.D / 1000); set('KY-406', X.CE);
      set('FIT-404', coQ); set('FIT-409', X.bleedQ);
      set('JIT-500', MW); set('KY-501', X.pf); set('KY-502', X.thd); set('LIT-501', X.tk501); set('LIT-502', X.tk502);
      T['KY-407'].v = X.D > 100 ? Pdc * 1e6 / X.D : 0; // kWh/t = MW·1000 / (t/h)
      Object.values(M).forEach((m) => { T['VIT-' + m.id].v = m.vib; });

      /* --- KPI de turno --- */
      X.cathShift += X.D * dt / 3600 / 1000; X.cathTotal += X.D * dt / 3600 / 1000;
      X.energyShift += MW * dt / 3600; X.kwhTotal += MW * dt / 3600;
      X.plannedShift += 6.45 * dt / 3600;
      X.lostShorts += I * 1.1855 * lostS * dt / 3600 / 1000;
      if (RECT.state !== 'RUN') X.lostRect += 6.45 * dt / 3600;
      if (RECT.state !== 'RUN') X.downShift += dt / 3600;
      const sid = Math.floor((ts - 8 * 3600) / 28800);
      if (sid !== X.shiftId) {
        X.shiftHist.unshift({id: shiftOf(ts - 60), day: 'día ' + (Math.floor((ts - 60) / 86400) + 1), cath: X.cathShift, plan: X.plannedShift, mwh: X.energyShift, acid: X.acidShift, ore: X.oreShift, lostShorts: X.lostShorts, lostRect: X.lostRect, down: X.downShift, alarms: X.alarmsShift});
        if (X.shiftHist.length > 6) X.shiftHist.pop();
        X.shiftId = sid; X.cathShift = 0; X.energyShift = 0; X.acidShift = 0; X.oreShift = 0; X.plannedShift = 0; X.lostShorts = 0; X.lostRect = 0; X.downShift = 0; X.alarmsShift = 0;
        log('Sistema', `Cambio de turno: entra el turno ${shiftOf(ts)}`);
      }

      /* --- alarmas --- */
      // discretas
      Object.values(M).forEach((m) => discAlarm(m.id + '.TRIP', 1, `${m.id} ${m.desc}: disparo${m.trip && m.trip !== 'reset' ? ' (' + m.trip + ')' : ''}`, m.area, m.state === 'TRIP' && m.trip !== 'reset'));
      discAlarm('RT-401.TRIP', 1, `RT-401 Rectificador: disparo${RECT.trip ? ' (' + RECT.trip + ')' : ''}`, 400, RECT.state === 'TRIP');
      Object.values(M).forEach((m) => { const [, bc, cd] = m.z, nf = (v) => String(v).replace('.', ','); discAlarm(m.id + '.VIB', 3, `${m.id}: vibración en zona C, grupo ${m.grp} (> ${nf(bc)} mm/s)`, m.area, m.state === 'RUN' && m.vib > bc && m.vib <= cd); discAlarm(m.id + '.VIBH', 2, `${m.id}: vibración en zona D, grupo ${m.grp} (> ${nf(cd)} mm/s)`, m.area, m.state === 'RUN' && m.vib > cd); });
      ['MCC-100', 'MCC-200', 'MCC-300', 'MCC-400', '52-RT'].forEach((b) => discAlarm(b + '.OPEN', 1, `Interruptor ${b} abierto`, 500, !BRK[b]));
      Object.entries(seqs).forEach(([ar, q]) => discAlarm(`SEQ-${ar}.FAIL`, 2, `Secuencia del área ${ar} detenida: ${q.msg}`, +ar, q.st === 'FAIL'));
      discAlarm('AIT-207.DEV', 3, 'AIT-207: desviación contra laboratorio mayor a 0,15 pH', 200, Math.abs(T['AIT-207'].v - X.labPH) > 0.15 && S.t - X.labT < 600);
      if (X.monitor) for (let k = 0; k < NCELL; k++) discAlarm('CELDA-' + (k + 1) + '.V', 3, `Celda ${k + 1}: voltaje bajo (posible cortocircuito)`, 400, X.shorts[k] >= 2);
      // análogas y discretas: máquina de estados
      AD.forEach((a) => {
        let on;
        if (a.type === 'DISC') on = !!a.forced;
        else { const v = T[a.tag].v, db = (T[a.tag].hi - T[a.tag].lo) * 0.01; const hi = a.type[0] === 'H'; const act = hi ? v > a.lim : v < a.lim; const clr = hi ? v < a.lim - db : v > a.lim + db; on = act ? true : (clr ? false : a.st === 'U' || a.st === 'A'); }
        a.supp = !!(a.en && !a.en()); if (a.supp) on = false;
        if (a.shelved && S.t < a.shelved) { a.raw = on; return; }
        a.shelved = 0;
        if (on) { a.tOn = a.tOn == null ? S.t : a.tOn; if (S.t - a.tOn >= a.delay && (a.st === 'N' || a.st === 'R')) { a.st = 'U'; a.since = ts; a.count++; X.alarmsShift++; log('Alarma', `P${a.prio} ${a.id} · ${a.desc}`, 'alm'); } }
        else { a.tOn = null; if (a.st === 'U' || a.st === 'A') log('Alarma', `Normaliza ${a.id}`, 'rtn'); if (a.st === 'U') a.st = 'R'; else if (a.st === 'A') a.st = 'N'; }
        a.raw = on;
      });

      if (S.t % 10 === 0) histPush();
    }

    // estabilización inicial (10 min simulados) para partir en régimen
    for (let i = 0; i < 600; i++) step();
    AD.forEach((a) => { if (a.st === 'U' || a.st === 'R') a.st = a.st === 'U' ? 'A' : 'N'; a.count = 0; });
    S.log = []; X.shiftHist = []; X.alarmsShift = 0; X.cathShift = 0; X.energyShift = 0; X.plannedShift = 0; X.lostShorts = 0; X.lostRect = 0; X.acidShift = 0; X.oreShift = 0; X.downShift = 0;
    log('Sistema', 'Planta en régimen. Turno A a cargo.');

    return {S, M, L, T, X, AD, H, RECT, BRK, SCN, SEQ, SEQ_AREAS, seqs, VIBZ, NCELL, NCAT, VEL, CU_PRICE, E_PRICE, step, cmd, scenario, perms, whyNot, histGet, hhmm, hm, shiftOf, now, R};
  }

  G.PlantSim = {create};
})(typeof window !== 'undefined' ? window : globalThis);
