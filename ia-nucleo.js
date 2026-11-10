/* Núcleo del asistente de IA industrial de la planta virtual.
   Todo lo que decide qué se puede decir y qué se puede hacer vive aquí, en código determinista:
   - vigilancia por reglas (alarmas que vienen, causa probable, anomalías y recomendaciones),
   - herramientas de solo lectura que el pipeline usa para consultar la planta,
   - diagnóstico local (respaldo cuando no hay IA),
   - verificador de las respuestas del modelo contra el estado real y la base de conocimiento,
   - ejecución de acciones aprobadas por una persona, con seguimiento de su efecto.
   No depende del navegador: las pruebas lo corren en Node contra el simulador. */
(function (G) {
  'use strict';
  const nf = {};
  const f = (v, d = 0) => {
    if (!Number.isFinite(v)) return '—';
    nf[d] = nf[d] || new Intl.NumberFormat('es-CL', {minimumFractionDigits: d, maximumFractionDigits: d});
    return nf[d].format(v);
  };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sinTildes = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  const PALABRAS_VACIAS = new Set(
    'el la los las un una de del al a en y o que por para con sin se su sus es son lo como mas menos muy cada esta este esto hay qué que cual cuando donde hace hacer'.split(
      ' '
    )
  );
  const tokens = (s) =>
    sinTildes(s)
      .split(/[^a-z0-9ñ\-]+/)
      .filter((w) => w.length > 2 && !PALABRAS_VACIAS.has(w));

  // Un manual en Markdown se parte en secciones citables: «## OP-4.1 · Título»
  const parseManual = (doc, md) => {
    const out = [];
    const re = /^##\s+([A-Z]{2}-\d+(?:\.\d+)?)\s+·\s+(.+)$/gm;
    const marks = [];
    let m;
    while ((m = re.exec(md))) marks.push({id: m[1], titulo: m[2].trim(), at: m.index, end: re.lastIndex});
    marks.forEach((k, i) => {
      const texto = md.slice(k.end, i + 1 < marks.length ? marks[i + 1].at : md.length).trim();
      out.push({id: k.id, titulo: k.titulo, doc, texto});
    });
    return out;
  };

  const PR = {1: 'alta', 2: 'media', 3: 'baja'};
  const TAG_RE = /\b(?:VIT-)?[A-Z]{1,4}-\d{3}[A-Z]?\b/g;

  function crear(P, K = {}) {
    const A = () => P(); // P es una función que devuelve el simulador vigente (se reinicia desde la HMI)
    const tv = (id) => A().T[id].v;
    const ft = (id) => f(tv(id), A().T[id].dec);
    const ACC = Object.fromEntries(((K.acciones && K.acciones.acciones) || []).map((a) => [a.id, a]));
    const FICHAS = Object.fromEntries(((K.alarmas && K.alarmas.alarmas) || []).map((a) => [a.id, a]));
    const DISC = (K.alarmas && K.alarmas.discretas) || [];
    const MANUAL = K.manual || [];
    const MANUAL_IDS = new Set(MANUAL.map((s) => s.id));
    const pvOfLoop = (k) => {
      const t = k.replace(/^FF/, 'F').replace(/C-/, 'T-');
      return A().T[t] ? t : null;
    };
    const loopOfPV = (tag) => Object.keys(A().L).find((k) => pvOfLoop(k) === tag) || null;
    const knownShorts = () => {
      const X = A().X;
      let n = 0;
      for (let k = 0; k < A().NCELL; k++) if (X.shorts[k] > 0 && (X.monitor || X.seen[k])) n++;
      return n;
    };
    const hiddenShorts = () => {
      const X = A().X;
      let n = 0;
      if (!X.monitor) for (let k = 0; k < A().NCELL; k++) if (X.shorts[k] > 0 && !X.seen[k]) n++;
      return n;
    };
    const zona = (m) => (m.vib < m.z[0] ? 'A' : m.vib < m.z[1] ? 'B' : m.vib < m.z[2] ? 'C' : 'D');
    const PAR = {'P-201A': 'P-201B', 'P-202A': 'P-202B', 'P-401A': 'P-401B'};

    /* ---------------- ficha de alarma (base maestra ISA-18.2) ---------------- */
    const ficha = (id) => {
      if (FICHAS[id]) return FICHAS[id];
      return (
        DISC.find((d) => {
          const re = new RegExp('^' + d.patron.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+') + '$');
          return re.test(id);
        }) || null
      );
    };

    /* ---------------- precondiciones de las acciones ---------------- */
    const motor = (id) => A().M[id];
    const TRIP_PROT = /vibraci|sobrecorriente|temperatura|refrigeraci|sobrecarga/i;
    const CHK = {
      permisivos_ok: (o) => {
        const P2 = A();
        if (o === 'RT-401')
          return [false, 'el rectificador se energiza solo con la secuencia de puesta en servicio'];
        const w = P2.whyNot(o);
        return [!w, w];
      },
      equipo_detenido: (o) => [motor(o) && motor(o).state !== 'RUN', `${o} ya está en marcha`],
      equipo_en_marcha: (o) => [
        o === 'RT-401' ? A().RECT.state === 'RUN' : motor(o) && motor(o).state === 'RUN',
        `${o} no está en marcha`,
      ],
      equipo_disparado: (o) => [
        o === 'RT-401'
          ? A().RECT.state === 'TRIP'
          : motor(o) && motor(o).state === 'TRIP' && motor(o).trip !== 'reset',
        `${o} no está disparado`,
      ],
      disparo_sin_proteccion: (o) => {
        const tr = o === 'RT-401' ? A().RECT.trip : motor(o) && motor(o).trip;
        return [
          !TRIP_PROT.test(tr || ''),
          `${o} disparó por «${tr}»: es una protección y requiere inspección de mantenimiento antes de rearmar (regla S2)`,
        ];
      },
      sin_respaldo: (o) => [motor(o) && !motor(o).standby, `${o} ya está en respaldo automático`],
      lazo_fuera_de_modo_normal: (o) => [
        A().L[o] && A().L[o].mode !== A().L[o].norm,
        `${o} ya está en su modo normal`,
      ],
      lazo_en_auto: (o) => [
        A().L[o] && A().L[o].mode === 'AUTO',
        `${o} no está en automático: su consigna la fija otro lazo o el operador`,
      ],
      consigna_en_banda: (o, v) => {
        const l = A().L[o],
          pv = pvOfLoop(o),
          t = pv && A().T[pv];
        if (!l || !t) return [false, `${o} no es un lazo con medición conocida`];
        if (!Number.isFinite(v)) return [false, 'falta el valor de la consigna'];
        if (t.nl != null && (v < t.nl || v > t.nh))
          return [
            false,
            `${f(v, t.dec)} ${t.unit} está fuera de la banda normal de ${pv} (${f(t.nl, t.dec)} a ${f(t.nh, t.dec)}) (regla S6)`,
          ];
        if (Math.abs(v - l.sp) > 0.1 * (t.hi - t.lo) + 1e-9)
          return [
            false,
            `el cambio de ${f(l.sp, t.dec)} a ${f(v, t.dec)} supera el 10 % del rango por paso (regla S6)`,
          ];
        return [true, ''];
      },
      monitoreo_inactivo: () => [!A().X.monitor, 'el monitoreo continuo ya está activo'],
      celdas_conocidas: () => [knownShorts() > 0, 'no hay celdas con cortocircuito identificadas'],
      filtro_fuera: () => [!A().X.capBank, 'el filtro ya está en servicio'],
      compensacion_inactiva: () => [!A().X.delayComp, 'la compensación ya está activa'],
      ph_desviado: () => [
        Math.abs(tv('AIT-207') - A().X.labPH) > 0.05,
        'AIT-207 coincide con el laboratorio',
      ],
      borra_presente: () => [A().X.crud > 0.03 || A().X.ent > 300, 'no hay borra que retirar'],
      hx_con_falla: () => [!A().X.hxOk, 'HX-401 está operativo'],
      vibracion_alta_M103: () => {
        const m = motor('M-103');
        return [
          m.vib > m.z[0] * 1.3 || (m.state === 'TRIP' && /vibraci/i.test(m.trip || '')),
          'M-103 vibra normal',
        ];
      },
      revestimientos_gastados: () => [A().X.liner > 0.15 || A().X.p80 > 14, 'el P80 está en diseño'],
      acopio_suficiente: () => [
        A().X.stock > 5000,
        `el acopio fino (${f(A().X.stock)} t) no alcanza para 2 h de detención`,
      ],
      lavado_fuera: () => [motor('M-304').state !== 'RUN', 'el lavado W1 está en servicio'],
      lavado_rearmable: () => {
        const m = motor('M-304');
        return [!(m.state === 'TRIP' && TRIP_PROT.test(m.trip || '') && m.trip !== 'reset') || true, ''];
      },
      stock_acido_no_lleno: () => [A().X.tk501 < 1970, 'la bodega de ácido está llena'],
      nave_en_plan: () => {
        const P2 = A();
        return [
          P2.L['IIC-401'].mode === 'AUTO' &&
            P2.RECT.state === 'RUN' &&
            P2.L['IIC-401'].sp >= 15 &&
            P2.seqs[400].st !== 'RUN',
          'la nave no está produciendo con la consigna del plan (está en protección, en secuencia o fuera de servicio)',
        ];
      },
      nave_detenida_o_baja: () => {
        const P2 = A();
        return [
          (P2.RECT.state !== 'RUN' || P2.RECT.I < 30) && P2.seqs[400].st !== 'RUN',
          'la nave ya está produciendo',
        ];
      },
      rectificador_rearmado: () => [
        A().RECT.state !== 'TRIP',
        'RT-401 está disparado: hay que inspeccionar y rearmar antes',
      ],
      nave_en_marcha: () => [
        A().RECT.state === 'RUN' && A().RECT.I > 10 && A().seqs[400].st !== 'RUN',
        'la nave no está en producción',
      ],
      area100_detenida: () => [
        !(A().M['FD-101'].state === 'RUN') && A().seqs[100].st !== 'RUN',
        'el área 100 está alimentando',
      ],
    };
    // La regla S2 sobre el lavado: si W1 disparó por sobrecarga, rearmarlo lo decide mantenimiento.
    CHK.lavado_rearmable = () => {
      const m = motor('M-304');
      const prot = m.state === 'TRIP' && m.trip !== 'reset' && TRIP_PROT.test(m.trip || '');
      return [
        !prot,
        `M-304 disparó por «${m.trip}»: mantenimiento revisa el accionamiento antes de rearmar (regla S2)`,
      ];
    };

    const objetivoValido = (acc, o) => {
      const t = acc.objetivo && acc.objetivo.tipo;
      if (!t || t === 'ninguno') return [true, ''];
      if (acc.objetivo.valores && !acc.objetivo.valores.includes(o))
        return [false, `objetivo «${o}» no permitido (solo ${acc.objetivo.valores.join(', ')})`];
      if (t === 'motor' && !(A().M[o] || o === 'RT-401'))
        return [false, `«${o}» no es un equipo de la planta`];
      if (t === 'lazo' && !A().L[o]) return [false, `«${o}» no es un lazo de la planta`];
      return [true, ''];
    };
    // Revisa una propuesta de acción contra el catálogo, su objetivo, sus precondiciones y las reglas duras
    const revisarAccion = (p) => {
      const acc = ACC[p.id];
      if (!acc) return {ok: false, regla: 'S3', motivo: `«${p.id}» no está en la lista blanca de acciones`};
      const [ok1, m1] = objetivoValido(acc, p.objetivo);
      if (!ok1) return {ok: false, regla: 'catálogo', motivo: m1};
      for (const c of acc.precondiciones || []) {
        const fn = CHK[c];
        if (!fn) continue;
        const [ok, m] = fn(p.objetivo, Number(p.valor));
        if (!ok)
          return {
            ok: false,
            regla: /regla (S\d)/.exec(m) ? /regla (S\d)/.exec(m)[1] : 'precondición',
            motivo: m,
          };
      }
      return {ok: true, acc};
    };

    /* ---------------- foto del estado (lo que ve el modelo) ---------------- */
    const KEY = [
      'AIT-100',
      'LIT-100',
      'WIT-101',
      'KY-102',
      'AIT-105',
      'PIT-202',
      'FIT-200',
      'LIT-201',
      'LIT-204',
      'AIT-206',
      'AIT-207',
      'AIT-210',
      'FIT-205',
      'AIT-208',
      'KY-303',
      'AIT-309',
      'IIT-401',
      'KY-402',
      'TIT-403',
      'AIT-405',
      'AIT-411',
      'AIT-412',
      'AIT-407',
      'AIT-408',
      'AIT-410',
      'KY-405',
      'KY-406',
      'KY-407',
      'JIT-500',
      'KY-501',
      'LIT-501',
    ];
    const r = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(d) : v);
    const tagv = (t) => ({desc: t.desc, v: r(t.v, t.dec), u: t.unit, normal: [t.nl, t.nh]});
    const foto = (extra = {}) => {
      const p = A(),
        T = p.T,
        X = p.X;
      const fuera = Object.values(T)
        .filter((t) => t.nl != null && (t.v < t.nl || t.v > t.nh) && !String(t.id).startsWith('VIT-'))
        .slice(0, 20);
      const motores = {};
      Object.values(p.M).forEach((m) => {
        const zn = zona(m);
        if (m.state !== 'RUN' || zn === 'C' || zn === 'D' || m.temp > 75 || m.standby)
          motores[m.id] = {
            desc: m.desc,
            estado: m.state,
            respaldo: m.standby,
            vib_mm_s: r(m.vib, 2),
            zona_ISO_20816_3: zn,
            temp_C: r(m.temp, 0),
            disparo: m.trip && m.trip !== 'reset' ? m.trip : null,
          };
      });
      return {
        hora_planta: p.hhmm(),
        turno: p.shiftOf(),
        alarmas_activas: p.AD.filter((a) => a.st === 'U' || a.st === 'A')
          .sort((a, b) => a.prio - b.prio)
          .slice(0, 20)
          .map((a) => ({
            id: a.id,
            prioridad: PR[a.prio] || a.prio,
            estado: a.st === 'U' ? 'sin reconocer' : 'reconocida',
            desc: a.desc,
            desde: a.since ? p.hm(a.since) : null,
          })),
        tags_fuera_de_banda: Object.fromEntries(fuera.map((t) => [t.id, tagv(t)])),
        tags_clave: Object.fromEntries(KEY.filter((k) => T[k]).map((k) => [k, tagv(T[k])])),
        lazos_fuera_de_modo_normal: Object.fromEntries(
          Object.entries(p.L)
            .filter(([, l]) => l.mode !== l.norm)
            .map(([k, l]) => [k, {modo: l.mode, normal: l.norm, sp: r(l.sp_(), 2), op: r(l.op, 0)}])
        ),
        motores_con_novedad: motores,
        rectificador: {
          estado: p.RECT.state,
          kA: r(p.RECT.I, 1),
          consigna_plan_kA: r(p.L['IIC-401'].sp, 1),
          disparo: p.RECT.trip,
        },
        interruptores_abiertos: Object.entries(p.BRK)
          .filter(([, v]) => !v)
          .map(([k]) => k),
        secuencias: {
          100: p.seqs[100].st + (p.seqs[100].msg ? ': ' + p.seqs[100].msg : ''),
          400: p.seqs[400].st + (p.seqs[400].msg ? ': ' + p.seqs[400].msg : ''),
        },
        celdas_con_cortocircuito_conocidas: knownShorts(),
        monitoreo_continuo_celdas: X.monitor,
        lavado_W1: p.M['M-304'].state,
        kpi_turno: {
          catodo_t: r(X.cathShift, 1),
          plan_t: r(X.plannedShift, 1),
          energia_MWh: r(X.energyShift, 1),
          perdido_por_cortos_t: r(X.lostShorts, 2),
          perdido_por_rectificador_t: r(X.lostRect, 2),
          precio_cobre_USD_lb: r(p.CU_PRICE / 2204.62, 2),
        },
        ultima_cosecha: X.harvests[0]
          ? {lote: X.harvests[0].lote, t: r(X.harvests[0].ton, 1), grado_A: X.harvests[0].gradoA}
          : null,
        bitacora_reciente: p.S.log.slice(0, 10).map((l) => `${p.hm(l.t)} ${l.who}: ${l.msg}`),
        ...extra,
      };
    };

    /* ---------------- vigilancia continua por reglas ---------------- */
    const CAUSE = {
      'MCC-100': [100],
      'MCC-200': [200, 300],
      'MCC-300': [300, 400],
      'MCC-400': [400],
      '52-RT': [400],
      'P-202A': [200, 300],
      'P-202B': [200, 300],
      'P-305': [300, 400],
      'P-401A': [400],
      'P-401B': [400],
      'RT-401': [400],
      'CR-101': [100],
    };
    const ANOM = [
      'AIT-100',
      'AIT-206',
      'AIT-207',
      'AIT-208',
      'AIT-309',
      'FIT-200',
      'PIT-202',
      'FIT-203',
      'KY-406',
      'KY-402',
      'TIT-403',
      'AIT-405',
      'AIT-407',
      'AIT-410',
      'AIT-105',
      'JIT-500',
    ];
    const linfit = (d) => {
      const n = d.length;
      if (n < 8) return null;
      const t0 = d[n - 1][0];
      let st = 0,
        sv = 0,
        stt = 0,
        stv = 0;
      for (const [t, v] of d) {
        const x = t - t0;
        st += x;
        sv += v;
        stt += x * x;
        stv += x * v;
      }
      const den = n * stt - st * st;
      if (!den) return null;
      const b = (n * stv - st * sv) / den;
      return {b, a: (sv - b * st) / n};
    };
    // acción sugerida para un disparo: la bomba de respaldo, o rearmar si la causa no es una protección
    const accionDisparo = (tag) => {
      const p = A();
      if (PAR[tag] && p.M[PAR[tag]] && p.M[PAR[tag]].state !== 'RUN')
        return {id: 'partir_equipo', objetivo: PAR[tag]};
      const m = p.M[tag];
      if (m && m.state === 'TRIP' && m.trip !== 'reset' && !TRIP_PROT.test(m.trip || ''))
        return {id: 'rearmar_equipo', objetivo: tag};
      if (tag === 'M-103' && m && /vibraci/i.test(m.trip || '')) return {id: 'cambiar_rodamiento'};
      return null;
    };
    const vigilar = () => {
      const out = [],
        p = A(),
        X = p.X;
      const seen = new Set();
      // 1) alarmas que vienen: la tendencia de 20 min cruza el límite antes de 2 h
      p.AD.forEach((a) => {
        // TK-103 se rellena solo con P-501 al bajar de 40 %: su tendencia lineal no anticipa ese relleno
        if (
          a.type === 'DISC' ||
          a.tag === 'LIT-103' ||
          a.st === 'U' ||
          a.st === 'A' ||
          a.supp ||
          (a.shelved && p.S.t < a.shelved) ||
          seen.has(a.tag)
        )
          return;
        const rr = linfit(p.histGet(a.tag, 1200));
        if (!rr) return;
        const t = p.T[a.tag],
          hi = a.type[0] === 'H';
        if (Math.abs(rr.b) * 3600 < (t.hi - t.lo) * 0.01 || (hi ? rr.b <= 0 : rr.b >= 0)) return;
        // un PV que va hacia la consigna de su lazo (rampa, cambio de plan) no anuncia una alarma si la consigna está dentro de los límites
        const lp = loopOfPV(a.tag),
          lz = lp && p.L[lp];
        if (lz && lz.mode !== 'MAN') {
          const sp = lz.sp_();
          if ((sp - t.v) * rr.b > 0 && (hi ? sp < a.lim : sp > a.lim)) return;
        }
        const eta = (a.lim - rr.a) / rr.b;
        if (eta > 0 && eta < 7200) {
          seen.add(a.tag);
          out.push({
            k: 'pred',
            p: a.prio,
            area: a.area,
            t: `${a.tag}: alarma ${a.type} en unos ${f(eta / 60)} min`,
            d: `${a.desc}. Va ${rr.b > 0 ? 'subiendo' : 'bajando'} ${f(Math.abs(rr.b) * 3600, t.dec + 1)} ${t.unit}/h y el límite es ${f(a.lim, t.dec)} ${t.unit}.`,
            go: a.id,
            alarma: a.id,
          });
        }
      });
      // 2) causa probable: disparos e interruptores abiertos, con las alarmas que aparecieron después en sus áreas
      const act = p.AD.filter((a) => a.st === 'U' || a.st === 'A');
      const roots = act
        .filter((a) => /\.(TRIP|OPEN|FAIL)$/.test(a.id))
        .sort((a, b) => (/\.OPEN$/.test(b.id) ? 1 : 0) - (/\.OPEN$/.test(a.id) ? 1 : 0) || a.since - b.since);
      const used = new Set();
      roots.forEach((rt) => {
        if (used.has(rt)) return;
        const areas = CAUSE[rt.tag] || [rt.area];
        const kids = act.filter(
          (a) => a !== rt && !used.has(a) && areas.includes(a.area) && a.since >= rt.since - 30
        );
        kids.forEach((a) => used.add(a));
        const tags = [...new Set(kids.map((a) => a.tag))],
          lst = tags.slice(0, 5).join(', ') + (tags.length > 5 ? ' y otras' : '');
        out.push({
          k: 'causa',
          p: rt.prio,
          area: rt.area,
          t: kids.length ? `Causa probable: ${rt.desc}` : rt.desc,
          d: kids.length
            ? `${kids.length} alarma${kids.length > 1 ? 's aparecieron' : ' apareció'} después y probablemente ${kids.length > 1 ? 'son consecuencia' : 'es consecuencia'} (${lst}). Atiende primero la causa.`
            : 'Por ahora no hay alarmas derivadas. Revisa la causa antes de rearmar o reintentar.',
          go: rt.id,
          alarma: rt.id,
          derivadas: kids.map((a) => a.id),
          accion: /\.TRIP$/.test(rt.id) ? accionDisparo(rt.tag) : null,
        });
      });
      // 3) anomalías: cambio brusco contra las últimas 2 h, aunque no haya alarma
      ANOM.forEach((tag) => {
        const d = p.histGet(tag, 7200);
        if (d.length < 90 || act.some((a) => a.tag === tag)) return;
        const base = d.slice(0, -12).map((q) => q[1]),
          last = d.slice(-6).reduce((s, q) => s + q[1], 0) / 6,
          t = p.T[tag];
        const m = base.reduce((s, v) => s + v, 0) / base.length,
          sd = Math.sqrt(base.reduce((s, v) => s + (v - m) ** 2, 0) / base.length),
          z = (last - m) / Math.max(sd, (t.hi - t.lo) * 0.004);
        if (Math.abs(z) > 4)
          out.push({
            k: 'anom',
            p: 3,
            area: t.area,
            t: `Cambio anómalo en ${tag}`,
            d: `${t.desc}: ${f(last, t.dec)} ${t.unit} contra ${f(m, t.dec)} de promedio en 2 h (${z > 0 ? '+' : '−'}${f(Math.abs(z), 1)} desviaciones). Aún sin alarma.`,
            scr: 'a' + t.area,
            fp: loopOfPV(tag),
            tag,
          });
      });
      if (Math.abs(tv('AIT-207') - X.labPH) > 0.1)
        out.push({
          k: 'anom',
          p: 3,
          area: 200,
          t: 'AIT-207 no coincide con el laboratorio',
          d: `Analizador ${ft('AIT-207')} y laboratorio ${f(X.labPH, 2)}: posible deriva del electrodo. Calíbralo antes de usarlo para controlar.`,
          scr: 'a200',
          tag: 'AIT-207',
          accion: {id: 'calibrar_ph'},
        });
      // 4) recomendaciones de operación
      const rec = (p2, area, t, d, scr, accion, extra = {}) =>
        out.push({k: 'rec', p: p2, area, t, d, scr, accion, ...extra});
      if (!X.capBank)
        rec(
          3,
          500,
          'Pon en servicio el filtro y los condensadores',
          `Factor de potencia ${ft('KY-501')} y distorsión ${ft('KY-502')} %. Con el filtro sube a 0,96 y la distorsión baja a 3 %.`,
          'a500',
          {id: 'filtro_armonicos'},
          {base: true}
        );
      if (p.M['M-304'].state !== 'RUN')
        rec(
          2,
          300,
          'Lavado W1 fuera de servicio: el cloruro sube en la nave',
          `Sin lavado, el arrastre acuoso lleva cloruro (${ft('AIT-210')} g/L en el PLS) y hierro al electrolito. Cloruro ahora ${ft('AIT-410')} mg/L; sobre 30 mg/L pica el cátodo permanente.`,
          'a300',
          {id: 'partir_lavado'},
          {tag: 'AIT-410'}
        );
      if (X.p80 > 14)
        rec(
          X.p80 > 15 ? 2 : 3,
          100,
          'Revestimientos de CR-101 gastados: mineral grueso a la pila',
          `P80 ${ft('AIT-100')} mm contra 12,5 mm de diseño. La pila nueva recupera menos y el PLS lo sentirá en uno o dos días. El acopio fino (${f(X.stock / 1000, 1)} kt) permite detener el chancador 2 h.`,
          'a100',
          {id: 'cambiar_revestimientos'},
          {tag: 'AIT-100'}
        );
      // mantenimiento entregó un equipo: operación lo parte (no queda detenido por olvido)
      Object.values(p.M).forEach((m) => {
        if (m.ready && m.state !== 'RUN' && !m.maintUntil)
          rec(
            2,
            m.area,
            `${m.id} disponible tras la intervención de mantenimiento`,
            `${m.desc} quedó detenido después de la mantención. Pártelo para volver a la operación normal.`,
            'a' + m.area,
            {id: 'partir_equipo', objetivo: m.id},
            {tag: m.id}
          );
      });
      // el PLS empobrece lento (la pila amortigua un cambio de mineral): pendiente de 8 h, no puntaje z
      const pls = linfit(p.histGet('AIT-206', 8 * 3600));
      if (pls && pls.b * 3600 < -0.015 && tv('AIT-206') < 3.15)
        rec(
          3,
          200,
          'El cobre del PLS viene bajando',
          `AIT-206 en ${ft('AIT-206')} g/L y baja ${f(-pls.b * 3600, 2)} g/L/h en 8 h. Revisa la ley y el P80 del mineral, el riego (FIT-200) y la dosis de ácido (KY-102): la pila responde con uno o dos días de retardo.`,
          'a200',
          null,
          {tag: 'AIT-206', manual: 'OP-4.2'}
        );
      const m103 = p.M['M-103'];
      if (m103.state === 'RUN' && m103.vib > m103.z[1])
        rec(
          m103.vib > m103.z[2] ? 2 : 3,
          100,
          `M-103 en zona ${zona(m103)} de vibración`,
          `${f(m103.vib, 2)} mm/s (grupo ${m103.grp}). Patrón de daño de rodamiento: programa el cambio antes de que dispare.`,
          'a100',
          {id: 'cambiar_rodamiento'},
          {tag: 'VIT-M-103'}
        );
      if (X.Ce > 48 && p.RECT.I < 30)
        rec(
          2,
          400,
          'Cobre alto con corriente baja: reduce la transferencia de SX',
          `Electrolito en ${ft('AIT-405')} g/L con ${ft('IIT-401')} kA. Baja la razón O/A o el caudal de PLS, o vuelve a producción con la puesta en servicio.`,
          'a300',
          {id: 'secuencia_puesta_servicio_nave'},
          {tag: 'AIT-405'}
        );
      else if (
        Math.abs(X.Ce - p.L['AIC-405'].sp) > 2.5 &&
        p.L['IIC-401'].mode === 'AUTO' &&
        p.RECT.state === 'RUN' &&
        p.L['IIC-401'].sp >= 15 &&
        p.seqs[400].st !== 'RUN'
      )
        rec(
          3,
          400,
          'El cobre del electrolito se aleja de 44 g/L: recalcula la corriente del plan',
          `AIT-405 en ${ft('AIT-405')} g/L. El plan ajusta la corriente para depositar lo que llega de SX y volver a la consigna en un turno (hoy ${f(p.L['IIC-401'].sp, 1)} kA, el balance pide ${f(p.planI(), 1)} kA).`,
          'a400',
          {id: 'recalcular_corriente_plan'},
          {tag: 'AIT-405'}
        );
      if (!X.delayComp)
        rec(
          3,
          100,
          'Activa la compensación de retardo de la correa',
          'Sin ella, el ácido llega 45 s antes que el mineral y la dosis varía más.',
          'a100',
          {id: 'compensacion_retardo'},
          {base: true}
        );
      const hid = hiddenShorts(),
        ks = knownShorts();
      if (hid >= 3)
        rec(
          3,
          400,
          `${hid} cortocircuitos sin detectar en la nave`,
          'La próxima ronda manual está lejos. Activa el monitoreo continuo de voltaje de celdas para verlos al aparecer.',
          'a400',
          {id: 'activar_monitoreo_celdas'}
        );
      if (ks >= 4)
        rec(
          3,
          400,
          `Corrige las ${ks} celdas con cortocircuito`,
          `Cada una resta corriente útil: pérdida del turno ${f(X.lostShorts, 2)} t de cobre (US$ ${f(X.lostShorts * p.CU_PRICE)}).`,
          'a400',
          {id: 'corregir_celdas'}
        );
      if (X.tk501 < 600)
        rec(
          X.tk501 < 300 ? 2 : 3,
          500,
          `Stock de ácido para unas ${f(X.tk501 / Math.max(1, X.acidQ * 1.84), 1)} h`,
          `Quedan ${f(X.tk501)} t y la aglomeración consume ${f(X.acidQ * 1.84)} t/h. Coordina camiones o baja la dosis.`,
          'a500',
          {id: 'recibir_camion_acido'}
        );
      const ORD = {causa: 0, pred: 1, anom: 2, rec: 3};
      // la acción de cada aviso solo se ofrece si hoy se puede ejecutar
      out.forEach((it) => {
        if (it.accion && !revisarAccion(it.accion).ok) it.accion = null;
        if (it.accion && ACC[it.accion.id]) it.accionTitulo = ACC[it.accion.id].titulo;
        const fi = it.alarma && ficha(it.alarma);
        it.manual =
          (it.accion && ACC[it.accion.id] && ACC[it.accion.id].manual) ||
          (fi && fi.manual) ||
          it.manual ||
          null;
      });
      // las mejoras permanentes (filtro, compensación) van al final: no explican lo que está pasando
      return out.sort((a, b) => !!a.base - !!b.base || a.p - b.p || ORD[a.k] - ORD[b.k]);
    };

    /* ---------------- herramientas de lectura ---------------- */
    const buscarManual = (q, k = 3) => {
      const qt = tokens(q);
      if (!qt.length || !MANUAL.length) return [];
      const N = MANUAL.length,
        docs = MANUAL.map((s) => tokens(s.id + ' ' + s.titulo + ' ' + s.titulo + ' ' + s.texto)),
        avg = docs.reduce((s, d) => s + d.length, 0) / N;
      const df = {};
      docs.forEach((d) => new Set(d).forEach((w) => (df[w] = (df[w] || 0) + 1)));
      const idq = sinTildes(q).match(/\b[a-z]{2}-\d+(\.\d+)?\b/);
      return MANUAL.map((s, i) => {
        const d = docs[i],
          tf = {};
        d.forEach((w) => (tf[w] = (tf[w] || 0) + 1));
        let sc = 0;
        qt.forEach((w) => {
          if (!tf[w]) return;
          const idf = Math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5));
          sc += (idf * tf[w] * 2.2) / (tf[w] + 1.2 * (0.25 + (0.75 * d.length) / avg));
        });
        if (idq && sinTildes(s.id) === idq[0]) sc += 50;
        return {s, sc};
      })
        .filter((x) => x.sc > 0)
        .sort((a, b) => b.sc - a.sc)
        .slice(0, k)
        .map(({s, sc}) => ({
          id: s.id,
          titulo: s.titulo,
          doc: s.doc,
          extracto: s.texto.slice(0, 900),
          puntaje: +sc.toFixed(2),
        }));
    };
    const HERR = {
      estado_planta: {
        desc: 'Foto completa del estado: alarmas, tags clave y fuera de banda, motores con novedad, KPI y bitácora',
        run: () => foto(),
      },
      tag: {
        desc: 'Valor actual, unidad, banda normal y límites de alarma de un tag',
        run: (id) => {
          const t = A().T[id];
          if (!t) return {error: `no existe el tag ${id}`};
          return {
            ...tagv(t),
            id,
            rango: [t.lo, t.hi],
            alarmas: A()
              .AD.filter((a) => a.tag === id && a.type !== 'DISC')
              .map((a) => ({
                id: a.id,
                limite: a.lim,
                prioridad: PR[a.prio],
                activa: a.st === 'U' || a.st === 'A',
              })),
          };
        },
      },
      tendencia: {
        desc: 'Tendencia de las últimas 2 h de un tag: mínimo, máximo, inicio, fin y pendiente por hora',
        run: (id) => {
          const d = A().histGet(id, 7200);
          if (!d.length) return {error: `sin historia para ${id}`};
          const vs = d.map((x) => x[1]),
            lf = linfit(d);
          const t = A().T[id];
          return {
            id,
            unidad: t.unit,
            inicio: r(vs[0], t.dec + 1),
            fin: r(vs[vs.length - 1], t.dec + 1),
            min: r(Math.min(...vs), t.dec + 1),
            max: r(Math.max(...vs), t.dec + 1),
            pendiente_por_hora: lf ? r(lf.b * 3600, t.dec + 2) : null,
            puntos: vs.length,
          };
        },
      },
      alarma: {
        desc: 'Estado de una alarma y su ficha de la base maestra: causas, consecuencia, acción y tiempo de respuesta',
        run: (id) => {
          const a = A().AD.find((x) => x.id === id);
          const fi = ficha(id);
          return {
            id,
            estado: a
              ? a.st === 'U'
                ? 'sin reconocer'
                : a.st === 'A'
                  ? 'reconocida'
                  : 'normal'
              : 'no existe',
            descripcion: a && a.desc,
            ficha: fi,
          };
        },
      },
      equipo: {
        desc: 'Estado de un equipo: marcha, disparo y causa, vibración con zona ISO, permisivos y por qué no parte',
        run: (id) => {
          const p = A();
          if (id === 'RT-401')
            return {
              id,
              estado: p.RECT.state,
              kA: r(p.RECT.I, 1),
              disparo: p.RECT.trip,
              permisivos: p.perms['RT-401']().map(([d, ok]) => ({d, ok})),
            };
          const m = p.M[id];
          if (!m) return {error: `no existe el equipo ${id}`};
          return {
            id,
            desc: m.desc,
            estado: m.state,
            disparo: m.trip,
            respaldo: m.standby,
            kW: m.kw,
            mcc: m.mcc,
            vib_mm_s: r(m.vib, 2),
            zona: zona(m),
            grupo: m.grp,
            temp_C: r(m.temp, 0),
            horas_desde_PM: r(m.sincePM, 0),
            permisivos: p.perms[id] ? p.perms[id]().map(([d, ok]) => ({d, ok})) : [],
            por_que_no_parte: p.whyNot(id) || null,
          };
        },
      },
      lazo: {
        desc: 'Modo, consigna, medición y salida de un lazo de control',
        run: (id) => {
          const l = A().L[id];
          if (!l) return {error: `no existe el lazo ${id}`};
          return {
            id,
            desc: l.desc,
            modo: l.mode,
            modo_normal: l.norm,
            sp: r(l.sp_(), 2),
            pv: r(l.pv, 2),
            op: r(l.op, 1),
            unidad: l.unit,
          };
        },
      },
      secuencia: {
        desc: 'Estado de las secuencias del área 100 o 400 y el paso en curso',
        run: (area) => {
          const p = A(),
            q = p.seqs[+area || 400];
          if (!q) return {error: 'solo hay secuencias en las áreas 100 y 400'};
          const s = q.id && p.SEQ[q.id];
          return {
            area: +area || 400,
            estado: q.st,
            secuencia: s ? s.name : null,
            paso: s && q.k >= 0 ? s.steps[q.k] && s.steps[q.k].d : null,
            mensaje: q.msg,
          };
        },
      },
      manual: {
        desc: 'Busca en los manuales de operación, mantenimiento, gerencia y del asistente',
        run: (q) => buscarManual(q),
      },
      reglas: {
        desc: 'Rangos químicos de operación y reglas de seguridad del área',
        run: (area) => ({
          quimicas: ((K.reglasQuimicas && K.reglasQuimicas.reglas) || []).filter(
            (x) => !area || !x.tag || (A().T[x.tag] && A().T[x.tag].area === +area)
          ),
          seguridad: ((K.reglasSeguridad && K.reglasSeguridad.riesgos) || []).filter(
            (x) => !area || x.area === +area
          ),
        }),
      },
    };
    const usarHerramienta = (nombre, arg) => {
      const h = HERR[nombre];
      if (!h) return {error: `herramienta desconocida: ${nombre}`};
      try {
        return h.run(arg);
      } catch (e) {
        return {error: String(e.message || e)};
      }
    };

    /* ---------------- entender (router local, respaldo del modelo rápido) ---------------- */
    const objetosEn = (q) => {
      const p = A(),
        out = new Set();
      (String(q).toUpperCase().match(TAG_RE) || []).forEach((t) => {
        if (p.T[t] || p.M[t] || p.L[t] || t === 'RT-401') out.add(t);
      });
      return [...out];
    };
    const entenderLocal = (q) => {
      const s = sinTildes(q);
      const intencion =
        /como (se |lo |la )?(hac|camb|calib|part|deten|pon)|ensen|procedimiento|pasos|manual/.test(s)
          ? 'ensename'
          : /(por que|causa|alarma|falla|disparo|que paso|que pasa|que esta pasando|anomal)/.test(s)
            ? 'diagnostico'
            : /^(hazlo|ejecuta|haz |parte |partir|arranca|rearm|deten|para |activa|corrige|sube |baja |cambia|pon )/.test(
                  s.replace(/^[^a-z]+/, '')
                )
              ? 'accion'
              : /\b(cobre|produc|plan\b|kpi|turno|energia|costo|perdid|cosecha|precio)/.test(s)
                ? 'kpi'
                : 'estado';
      const obj = objetosEn(q);
      const herramientas = [{nombre: 'estado_planta', arg: ''}];
      obj.forEach((o) => {
        const p = A();
        if (p.M[o] || o === 'RT-401') herramientas.push({nombre: 'equipo', arg: o});
        else if (p.L[o]) herramientas.push({nombre: 'lazo', arg: o});
        else if (p.T[o]) herramientas.push({nombre: 'tendencia', arg: o});
      });
      p0()
        .AD.filter((a) => a.st === 'U' || a.st === 'A')
        .sort((a, b) => a.prio - b.prio)
        .slice(0, 3)
        .forEach((a) => herramientas.push({nombre: 'alarma', arg: a.id}));
      return {intencion, objetos: obj, herramientas: herramientas.slice(0, 7), busqueda_manual: q};
    };
    const p0 = () => A();

    /* ---------------- diagnóstico local (sin IA) ---------------- */
    const diagnosticoLocal = (pregunta = '', foco = null) => {
      const p = A(),
        av = vigilar(),
        intento = entenderLocal(pregunta),
        act = p.AD.filter((a) => a.st === 'U' || a.st === 'A').sort((a, b) => a.prio - b.prio);
      const objs = intento.objetos;
      // foco: el aviso pedido, el del objeto nombrado, la causa raíz, la alarma que viene, una alarma alta o media
      // activa, y recién después las recomendaciones (las mejoras permanentes al final)
      const alarmaUrgente = act.find((a) => a.prio <= 2 && !/\.(TRIP|OPEN|FAIL)$/.test(a.id));
      const alarmaObjeto = objs.length ? act.find((a) => objs.includes(a.tag)) : null;
      let it =
        (foco && av.find((x) => x.t === foco.t)) ||
        (objs.length &&
          av.find((x) =>
            objs.some((o) => (x.go || '').startsWith(o) || x.tag === o || (x.d || '').includes(o))
          )) ||
        (alarmaObjeto ? null : av.find((x) => x.k === 'causa') || av.find((x) => x.k === 'pred')) ||
        null;
      if (!it && !alarmaObjeto && !alarmaUrgente && intento.intencion !== 'kpi')
        it = av.find((x) => !x.base) || av[0] || null;
      const alarmaFoco = it
        ? it.alarma || null
        : (alarmaObjeto && alarmaObjeto.id) || (alarmaUrgente && alarmaUrgente.id) || (act[0] && act[0].id);
      const fi = alarmaFoco ? ficha(alarmaFoco) : null;
      const evidencia = [],
        pasosExtra = [];
      const ev = (tag, com) => {
        if (p.T[tag] && !evidencia.find((e) => e.tag === tag))
          evidencia.push({tag, valor: r(p.T[tag].v, p.T[tag].dec), comentario: com});
      };
      if (alarmaFoco) {
        const a = p.AD.find((x) => x.id === alarmaFoco);
        if (a && p.T[a.tag]) ev(a.tag, `límite ${f(a.lim, p.T[a.tag].dec)} ${p.T[a.tag].unit}`);
      }
      if (it && it.tag) ev(it.tag, 'variable del aviso');
      // un disparo por protección: el equipo, su vibración y su respaldo son la evidencia
      const tagRaiz = alarmaFoco && /\.TRIP$/.test(alarmaFoco) ? alarmaFoco.split('.')[0] : null;
      const eqRaiz = tagRaiz && (tagRaiz === 'RT-401' ? {id: 'RT-401', trip: p.RECT.trip} : p.M[tagRaiz]);
      const disparoProt = eqRaiz && TRIP_PROT.test(eqRaiz.trip || '') ? eqRaiz : null;
      if (eqRaiz && p.T['VIT-' + tagRaiz]) ev('VIT-' + tagRaiz, `vibración de ${tagRaiz}`);
      if (tagRaiz && PAR[tagRaiz] && p.M[PAR[tagRaiz]])
        pasosExtra.push(
          `${PAR[tagRaiz]} (respaldo) está ${p.M[PAR[tagRaiz]].state === 'RUN' ? 'en marcha: la producción sigue' : 'detenida: pártela'}`
        );
      if (tagRaiz === 'RT-401') ev('IIT-401', 'corriente de la nave');
      if (it && it.derivadas)
        it.derivadas.slice(0, 3).forEach((id) => ev(id.split('.')[0], 'alarma derivada'));
      objs.forEach((o) => ev(o, 'consultado'));
      if (intento.intencion === 'kpi' || !it) {
        ev('KY-405', 'producción ahora');
        ev('KY-406', 'eficiencia de corriente');
        ev('AIT-206', 'cobre en el PLS');
      }
      const acciones = [],
        rechazadas = [];
      const add = (pr) => {
        if (!pr || acciones.length >= 3 || acciones.find((x) => x.id === pr.id && x.objetivo === pr.objetivo))
          return;
        if (revisarAccion(pr).ok)
          acciones.push({...pr, por_que: it ? it.t : 'recomendación de la base de conocimiento'});
      };
      // una orden directa («parte P-201B») se convierte en la acción del catálogo; si no se puede, se explica por qué
      if (intento.intencion === 'accion') {
        const s2 = sinTildes(pregunta),
          verbo = /^\W*(parte|partir|arranca)/.test(s2)
            ? 'partir_equipo'
            : /^\W*(deten|para )/.test(s2)
              ? 'detener_equipo'
              : /^\W*rearm/.test(s2)
                ? 'rearmar_equipo'
                : null;
        if (verbo)
          objs.forEach((o) => {
            const pr = {id: verbo, objetivo: o},
              v = revisarAccion(pr);
            if (v.ok) acciones.push({...pr, por_que: 'pedido por la persona'});
            else rechazadas.push({...pr, motivo: v.motivo, regla: v.regla});
          });
      }
      if (it && it.accion) add(it.accion);
      if (fi)
        (fi.acciones_sugeridas || []).forEach((id) => {
          const acc = ACC[id];
          if (!acc) return;
          const tag = alarmaFoco.split('.')[0];
          const objetivo =
            acc.objetivo && acc.objetivo.tipo === 'motor'
              ? PAR[tag] || tag
              : acc.objetivo && acc.objetivo.tipo === 'lazo'
                ? loopOfPV(tag)
                : undefined;
          if (acc.objetivo && acc.objetivo.tipo !== 'ninguno' && !objetivo) return;
          if (id === 'consigna_lazo') return; // un valor de consigna lo decide la persona o el modelo, no una regla fija
          add({id, objetivo});
        });
      const pasos = pasosExtra.map((x) => ({paso: x, manual: 'OP-3.2'}));
      if (fi) fi.accion_operador.forEach((x) => pasos.push({paso: x, manual: fi.manual}));
      if (!fi && it && it.manual) {
        const sec = MANUAL.find((x) => x.id === it.manual);
        if (sec)
          sec.texto
            .split('\n')
            .filter((l) => /^\s*(\d+\.|-)\s+/.test(l))
            .slice(0, 4)
            .forEach((l) =>
              pasos.push({paso: l.replace(/^\s*(\d+\.|-)\s+/, '').replace(/\*\*/g, ''), manual: sec.id})
            );
      }
      if (intento.intencion === 'ensename') {
        const sec = buscarManual(pregunta, 1)[0];
        if (sec)
          sec.extracto
            .split('\n')
            .filter((l) => /^\s*(\d+\.|-)\s+/.test(l))
            .slice(0, 6)
            .forEach((l) =>
              pasos.push({paso: l.replace(/^\s*(\d+\.|-)\s+/, '').replace(/\*\*/g, ''), manual: sec.id})
            );
      }
      const kpi = `Cátodo del turno ${f(p.X.cathShift, 1)} t contra ${f(p.X.plannedShift, 1)} t del plan; ${ft('KY-405')} t/h ahora con ${ft('KY-406')} % de eficiencia de corriente.`;
      const aF = alarmaFoco && p.AD.find((a) => a.id === alarmaFoco);
      const resumen = it
        ? `${it.t}. ${it.d}`
        : aF
          ? `Alarma ${PR[aF.prio]} ${aF.id}: ${aF.desc}.${fi && fi.consecuencia ? ' ' + fi.consecuencia : ''}${act.length > 1 ? ` Hay ${act.length} alarmas activas en total.` : ''}`
          : `La planta está en régimen: sin alarmas nuevas ni avisos. ${kpi}`;
      return {
        resumen: intento.intencion === 'kpi' && it ? `${kpi} ${resumen}` : resumen,
        confianza: it && it.k === 'causa' ? 'alta' : it ? 'media' : 'alta',
        causa_probable:
          it && it.k === 'causa'
            ? it.t.replace(/^Causa probable: /, '')
            : fi
              ? fi.causas.slice(0, 2).join('; ')
              : '',
        evidencia: evidencia.slice(0, 6),
        acciones,
        pasos_manuales: pasos.slice(0, 6),
        para_cada_rol: {
          operacion: fi ? fi.accion_operador[0] : 'Seguir vigilando las tendencias clave.',
          mantenimiento: disparoProt
            ? `Inspeccionar ${disparoProt.id} antes de rearmar: disparó por «${disparoProt.trip}» (regla S2, ${disparoProt.id === 'RT-401' ? 'con el eléctrico de turno' : 'MT-4.2 bloqueo y etiquetado'}).`
            : it && it.manual && /^MT/.test(it.manual)
              ? `Revisar el aviso y aplicar ${it.manual}.`
              : 'Sin intervención pedida.',
          jefe_turno: fi
            ? `Tiempo de respuesta de la alarma: ${fi.tiempo_respuesta_min} min.`
            : 'Sin decisiones pendientes.',
        },
        no_se:
          'Diagnóstico por reglas: aplica la base de conocimiento, pero no razona sobre combinaciones nuevas de fallas.',
        rechazadas,
      };
    };

    /* ---------------- verificador ---------------- */
    const tolerancia = (t) => Math.max((t.hi - t.lo) * 0.02, Math.abs(t.v) * 0.02, Math.pow(10, -t.dec));
    const validar = (resp) => {
      const p = A(),
        errores = [],
        descartadas = [],
        out = JSON.parse(JSON.stringify(resp || {}));
      out.evidencia = Array.isArray(out.evidencia) ? out.evidencia : [];
      out.acciones = Array.isArray(out.acciones) ? out.acciones : [];
      out.pasos_manuales = Array.isArray(out.pasos_manuales) ? out.pasos_manuales : [];
      // 1) evidencia: cada tag existe y su valor es el de la planta
      out.evidencia = out.evidencia.filter((e) => {
        const t = p.T[e.tag];
        if (!t) {
          errores.push({
            tipo: 'tag_inexistente',
            regla: 'datos',
            detalle: `la evidencia cita «${e.tag}», que no existe en la planta`,
          });
          return false;
        }
        if (typeof e.valor === 'number' && Math.abs(e.valor - t.v) > tolerancia(t)) {
          errores.push({
            tipo: 'valor_distinto',
            regla: 'datos',
            detalle: `${e.tag} = ${e.valor} en la respuesta, pero la planta marca ${f(t.v, t.dec)} ${t.unit}`,
          });
          e.valor = r(t.v, t.dec);
          e.corregido = true;
        }
        return true;
      });
      // 2) texto libre: ningún tag inventado
      const txt = [out.resumen, out.causa_probable, ...(out.pasos_manuales || []).map((x) => x.paso)].join(
        ' '
      );
      new Set(txt.match(TAG_RE) || []).forEach((t) => {
        if (
          !(
            p.T[t] ||
            p.M[t] ||
            p.L[t] ||
            p.BRK[t] != null ||
            t === 'RT-401' ||
            /^(TK|HX|AD|FCV|LCV|TCV|CV|SEQ|MCC|CELDA)-/.test(t)
          )
        )
          errores.push({
            tipo: 'tag_inexistente',
            regla: 'datos',
            detalle: `el texto menciona «${t}», que no existe en la planta`,
          });
      });
      // 3) acciones: catálogo, objetivo, precondiciones y reglas duras
      if (out.acciones.length > 3) {
        errores.push({
          tipo: 'demasiadas_acciones',
          regla: 'S8',
          detalle: `propuso ${out.acciones.length} acciones; se conservan 3`,
        });
        out.acciones = out.acciones.slice(0, 3);
      }
      out.acciones = out.acciones.filter((a) => {
        if (a.objetivo === '' || a.objetivo == null) delete a.objetivo;
        if (a.valor === '' || a.valor == null || (typeof a.valor === 'number' && !ACC[a.id]?.valor))
          delete a.valor;
        const v = revisarAccion(a);
        if (!v.ok) {
          if (v.regla === 'S3' || v.regla === 'catálogo')
            errores.push({tipo: 'accion_invalida', regla: v.regla, detalle: v.motivo});
          descartadas.push({...a, motivo: v.motivo, regla: v.regla});
          return false;
        }
        a.titulo = v.acc.titulo;
        a.riesgo = v.acc.riesgo;
        a.rol = v.acc.rol;
        a.manual = v.acc.manual;
        return true;
      });
      // 4) referencias al manual
      out.pasos_manuales = out.pasos_manuales.filter((x) => x && x.paso);
      out.pasos_manuales.forEach((x) => {
        if (x.manual && !MANUAL_IDS.has(x.manual)) {
          if (MANUAL.length)
            errores.push({
              tipo: 'manual_inexistente',
              regla: 'datos',
              detalle: `la sección ${x.manual} no existe en los manuales`,
            });
          delete x.manual;
        }
      });
      out.descartadas = [...descartadas, ...(Array.isArray(resp && resp.rechazadas) ? resp.rechazadas : [])];
      delete out.rechazadas;
      // reanalizar solo si el modelo inventó datos o acciones; una precondición que hoy no se cumple no es un error del modelo
      const graves = errores.filter(
        (e) => e.tipo !== 'manual_inexistente' && e.tipo !== 'demasiadas_acciones'
      );
      return {ok: graves.length === 0, errores, resp: out};
    };

    /* ---------------- ejecución con aprobación y seguimiento ---------------- */
    const seguimientos = [];
    const EJEC = {
      partir_equipo: (o, v, w) => A().cmd.start(o, w),
      detener_equipo: (o, v, w) => A().cmd.stop(o, w),
      rearmar_equipo: (o) => A().cmd.reset(o),
      respaldo_automatico: (o) => A().cmd.standby(o, true),
      lazo_modo_normal: (o, v, w) => A().cmd.mode(o, A().L[o].norm, w),
      consigna_lazo: (o, v) => A().cmd.sp(o, v),
      activar_monitoreo_celdas: () => A().cmd.monitor(true),
      corregir_celdas: () => A().cmd.fixAllSeen(),
      filtro_armonicos: () => A().cmd.capBank(true),
      compensacion_retardo: () => A().cmd.delayComp(true),
      calibrar_ph: () => A().cmd.calibrate(),
      retirar_borra: () => A().cmd.cleanCrud(),
      reparar_intercambiador: () => A().cmd.fixHX(),
      cambiar_rodamiento: () => A().cmd.bearing(),
      cambiar_revestimientos: () => A().cmd.liners(),
      partir_lavado: (o, v, w) => {
        A().cmd.reset('M-304');
        return A().cmd.start('M-304', w);
      },
      recibir_camion_acido: () => A().cmd.truck(1),
      recalcular_corriente_plan: (o, v, w) => A().cmd.planCurrent(w),
      secuencia_partida_area100: () => A().cmd.seq('start100'),
      secuencia_puesta_servicio_nave: () => A().cmd.seq('start400'),
      secuencia_proteccion_nave: () => A().cmd.seq('stop400'),
    };
    const medir = (ef, o) => {
      const p = A();
      if (ef.tag) return p.T[ef.tag] ? p.T[ef.tag].v : null;
      return null;
    };
    // Quién puede aprobar qué: el jefe de turno aprueba lo de operación y mantenimiento; gerencia solo consulta
    const ROLES = (K.acciones && K.acciones.roles) || {
      operador: 'Operador de sala',
      mantenimiento: 'Mantenimiento',
      jefe_turno: 'Jefe de turno',
      gerencia: 'Gerencia',
    };
    const puedeAprobar = (accRol, rol) =>
      rol === accRol || (rol === 'jefe_turno' && (accRol === 'operador' || accRol === 'mantenimiento'));
    const ejecutar = (prop, rol = 'operador') => {
      const v = revisarAccion(prop);
      if (!v.ok) return {ok: false, motivo: v.motivo, regla: v.regla};
      const acc = v.acc,
        o = prop.objetivo,
        nom = ROLES[rol] || rol;
      if (!puedeAprobar(acc.rol, rol))
        return {
          ok: false,
          regla: 'S9',
          motivo: `«${acc.titulo}» la aprueba ${ROLES[acc.rol] || acc.rol}${acc.rol !== 'jefe_turno' ? ' o el jefe de turno' : ''}, no ${nom}`,
        };
      const quien = `${nom} (propuesta del asistente)`;
      const ef = acc.efecto_esperado || {},
        v0 = medir(ef, o);
      const val =
        prop.valor !== undefined && prop.valor !== '' && Number.isFinite(+prop.valor)
          ? ' · ' + prop.valor
          : '';
      A().log('IA', `Asistente propuso y ${nom} aprobó: ${acc.titulo}${o ? ' · ' + o : ''}${val}`, 'op');
      const res = EJEC[acc.id](o, Number(prop.valor), quien);
      if (res === false) return {ok: false, motivo: 'la planta rechazó la orden (revisa la bitácora)'};
      const seg = {
        id: acc.id,
        titulo: acc.titulo,
        objetivo: o,
        ef,
        t0: A().S.t,
        hasta: A().S.t + (ef.min || 5) * 60,
        v0,
        sp0: acc.id === 'recalcular_corriente_plan' ? A().L['IIC-401'].sp : null,
        estado: 'pendiente',
      };
      seguimientos.push(seg);
      return {ok: true, seguimiento: seg};
    };
    const cumple = (s) => {
      const p = A(),
        ef = s.ef,
        o = s.objetivo;
      if (ef.estado) {
        const m = p.M[o];
        if (!m) return false;
        if (ef.estado === 'RUN') return m.state === 'RUN';
        if (ef.estado === 'STOP') return m.state !== 'RUN';
        if (ef.estado === 'REARMADO') return m.trip === 'reset' || m.state === 'RUN';
        if (ef.estado === 'RESPALDO') return m.standby;
      }
      if (ef.estado_equipo)
        return p.M[ef.estado_equipo[0]] && p.M[ef.estado_equipo[0]].state === ef.estado_equipo[1];
      if (ef.modo) return p.L[o] && p.L[o].mode === p.L[o].norm;
      if (ef.pv_hacia_sp) {
        const l = p.L[o];
        const t = p.T[pvOfLoop(o)];
        return l && t && Math.abs(t.v - l.sp_()) < (t.hi - t.lo) * 0.02;
      }
      if (ef.tag) {
        const t = p.T[ef.tag],
          d = (t.hi - t.lo) * 0.01,
          v = t.v;
        if (ef.dir === 'sube') return v > s.v0 + d;
        if (ef.dir === 'baja') return v < s.v0 - d;
        if (ef.dir === 'normaliza') return t.nl == null || (v >= t.nl && v <= t.nh);
        if (ef.dir === 'hacia_plan') return Math.abs(p.RECT.I - p.L['IIC-401'].sp) < 0.6;
        if (ef.dir === 'estable') return p.S.t >= s.hasta && (t.nl == null || (v >= t.nl && v <= t.nh));
      }
      return false;
    };
    // devuelve los seguimientos que cambiaron de estado desde la última revisión
    const revisarSeguimientos = () => {
      const t = A().S.t,
        cambios = [];
      seguimientos.forEach((s) => {
        if (s.estado !== 'pendiente') return;
        if (cumple(s)) {
          s.estado = 'cumplido';
          s.tFin = t;
          cambios.push(s);
          A().log('IA', `Seguimiento: «${s.titulo}» tuvo el efecto esperado`, 'op');
        } else if (t > s.hasta) {
          s.estado = 'sin_efecto';
          s.tFin = t;
          cambios.push(s);
          A().log('IA', `Seguimiento: «${s.titulo}» no mostró el efecto esperado en ${s.ef.min} min`, 'warn');
        }
      });
      return cambios;
    };

    return {
      foto,
      vigilar,
      ficha,
      herramientas: HERR,
      usarHerramienta,
      buscarManual,
      entenderLocal,
      diagnosticoLocal,
      validar,
      revisarAccion,
      puedeAprobar,
      roles: ROLES,
      ejecutar,
      seguimientos,
      revisarSeguimientos,
      catalogo: () =>
        Object.values(ACC).map((a) => ({
          id: a.id,
          titulo: a.titulo,
          objetivo: a.objetivo,
          rol: a.rol,
          riesgo: a.riesgo,
          valor: a.valor ? a.valor.regla : null,
        })),
      reglasDuras: () =>
        ((K.reglasSeguridad && K.reglasSeguridad.duras) || []).map((x) => `${x.id}: ${x.regla}`),
      loopOfPV,
      knownShorts,
      precondicionesConocidas: Object.keys(CHK),
      accionesEjecutables: Object.keys(EJEC),
    };
  }

  // Carga la base de conocimiento: en Node desde el disco, en el navegador por fetch
  const ARCH = {
    alarmas: 'alarmas.json',
    acciones: 'acciones.json',
    reglasFisicas: 'reglas_fisicas.json',
    reglasQuimicas: 'reglas_quimicas.json',
    reglasSeguridad: 'reglas_seguridad.json',
    planta: 'planta.json',
    causaEfecto: 'causa_efecto.json',
    tags: 'tags.json',
  };
  const MANUALES = {
    operacion: 'manuales/operacion.md',
    mantenimiento: 'manuales/mantenimiento.md',
    gerencia: 'manuales/gerencia.md',
    asistente: 'manuales/asistente-ia.md',
  };
  const cargarNode = (raiz) => {
    const fs = require('fs'),
      path = require('path');
    const K = {};
    Object.entries(ARCH).forEach(
      ([k, a]) => (K[k] = JSON.parse(fs.readFileSync(path.join(raiz, 'conocimiento', a), 'utf8')))
    );
    K.manual = [];
    Object.entries(MANUALES).forEach(([doc, a]) => {
      const p = path.join(raiz, a);
      if (fs.existsSync(p)) K.manual.push(...parseManual(doc, fs.readFileSync(p, 'utf8')));
    });
    return K;
  };
  const cargarWeb = async (base = '') => {
    const K = {};
    await Promise.all(
      Object.entries(ARCH).map(async ([k, a]) => {
        try {
          K[k] = await (await fetch(base + 'conocimiento/' + a)).json();
        } catch (e) {
          K[k] = null;
        }
      })
    );
    K.manual = [];
    K.manualMd = {};
    await Promise.all(
      Object.entries(MANUALES).map(async ([doc, a]) => {
        try {
          const md = await (await fetch(base + a)).text();
          K.manualMd[doc] = md;
          K.manual.push(...parseManual(doc, md));
        } catch (e) {
          /* sin manual */
        }
      })
    );
    return K;
  };

  G.IANucleo = {crear, parseManual, cargarNode, cargarWeb, MANUALES, f};
})(typeof window !== 'undefined' ? window : globalThis);
