/* Asistente de IA industrial de la planta virtual: un solo panel para preguntar, entender una falla y actuar.
   Pipeline por pregunta (ver docs/ARQUITECTURA.md):
     1 entender     → intención, objetos y herramientas (Nemotron Lightning; sin conexión, router local)
     2 consultar    → herramientas de solo lectura sobre la planta y búsqueda en los manuales (en el navegador)
     3 diagnosticar → causa, evidencia, acciones del catálogo y pasos del manual (Nemotron Super, esquema estricto)
     4 verificar    → tags y valores reales, catálogo, precondiciones y reglas duras (código determinista)
     5 reanalizar   → una vez, si el modelo inventó datos o acciones
     6 proponer     → tarjetas de acción; una persona aprueba en dos pasos, con su rol
     7 seguimiento  → el asistente vigila que la acción tenga el efecto esperado y lo anota en la bitácora
   Sin conexión con la IA responde el diagnóstico por reglas de ia-nucleo.js, con la misma verificación. */
(() => {
  const NV =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      ? 'http://localhost:8787'
      : 'https://nv-portafolio.jneiranova.workers.dev';
  const P = () => Planta.sim();
  let N = Planta.nucleo || IANucleo.crear(P, {});
  let K = {manual: [], manualMd: {}};
  const f = IANucleo.f;
  const css = `
  #ast-btn{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:#0e2a17;color:#d9ffe0;border:1px solid #76b900;box-shadow:0 8px 30px rgba(0,0,0,.35);font-weight:600}
  #ast-btn i{width:9px;height:9px;border-radius:50%;background:#76b900;box-shadow:0 0 8px #76b900}
  @media (min-width:900px){#ast-btn{display:none}}
  #ast{position:fixed;top:0;right:0;bottom:0;width:min(460px,100vw);z-index:50;background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;transform:translateX(105%);transition:transform .25s ease;box-shadow:-10px 0 40px rgba(0,0,0,.25)}
  #ast.open{transform:none}
  #ast header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line);flex-wrap:wrap}
  #ast header b{flex:1;font-size:.95rem}
  #ast .ctl{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px 12px;border-bottom:1px solid var(--line);font-size:.76rem;color:var(--muted)}
  #ast .ctl select{font-size:.76rem;padding:2px 4px}
  #ast .ctl label{display:flex;gap:4px;align-items:center}
  #ast .ctl .sp{flex:1}
  #ast .modo{font-family:var(--mono);font-size:.68rem;padding:1px 6px;border-radius:3px;border:1px solid var(--line)}
  #ast .modo.ia{border-color:#76b900;color:#76b900}
  #ast .msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
  #ast .m{padding:9px 11px;border-radius:9px;font-size:.86rem;line-height:1.45;max-width:96%}
  #ast .m.u{align-self:flex-end;background:var(--sel);color:#fff}
  #ast .m.a{align-self:stretch;background:var(--panel2);border:1px solid var(--line)}
  #ast .m.a p{margin:4px 0}
  #ast .m.a ul,#ast .m.a ol{margin:4px 0;padding-left:18px}
  #ast .m.sys{align-self:center;font-size:.76rem;color:var(--muted);background:none;padding:0;text-align:center}
  #ast .m.sys.ok{color:var(--run)}
  #ast .m.sys.warn{color:#e0a020}
  #ast h4{margin:8px 0 3px;font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  #ast .tagref{font-family:var(--mono);font-size:.78rem;padding:0 4px;border-radius:3px;border:1px solid var(--line);background:var(--panel);color:var(--val);cursor:pointer}
  #ast .ev{display:flex;flex-wrap:wrap;gap:4px}
  #ast .ev span{font-size:.78rem}
  #ast .conf{font-family:var(--mono);font-size:.66rem;padding:0 5px;border-radius:3px;border:1px solid var(--line);margin-left:4px}
  #ast .acc{border:1px solid #8e5ce0;border-radius:7px;padding:8px 9px;margin:6px 0;background:var(--panel);display:flex;flex-direction:column;gap:4px}
  #ast .acc .t{font-weight:600}
  #ast .acc .q{font-size:.76rem;color:var(--muted)}
  #ast .acc .r{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
  #ast .acc .r button{font-size:.78rem;padding:3px 10px}
  #ast .acc .ok{color:var(--run)}
  #ast .acc .no{color:#e05050}
  #ast .acc.done{border-color:var(--run);opacity:.85}
  #ast .rk{font-family:var(--mono);font-size:.64rem;padding:0 5px;border-radius:3px;text-transform:uppercase}
  #ast .rk.bajo{background:#1f4d2a;color:#bff5c8}#ast .rk.medio{background:#5a4a12;color:#ffe9a6}#ast .rk.alto{background:#6b1f1f;color:#ffd0d0}
  #ast .conf2{display:flex;flex-direction:column;gap:6px;border-top:1px dashed var(--line);padding-top:6px;font-size:.8rem}
  #ast .noacc{font-size:.78rem;border-left:3px solid #e0a020;padding:3px 8px;margin:4px 0;background:var(--panel)}
  #ast details{font-size:.74rem;color:var(--muted);margin-top:6px}
  #ast details ol{padding-left:18px;margin:4px 0}
  #ast .man{font-size:.83rem}
  #ast .man table{border-collapse:collapse;font-size:.76rem;margin:4px 0}
  #ast .man td,#ast .man th{border:1px solid var(--line);padding:2px 5px;text-align:left}
  #ast .man code{font-family:var(--mono);font-size:.78rem}
  #ast .idx{display:flex;flex-direction:column;gap:2px;max-height:50vh;overflow:auto}
  #ast .idx button{text-align:left;font-size:.78rem;padding:2px 6px}
  #ast .chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 8px}
  #ast .chips button{font-size:.76rem;border-radius:999px;padding:4px 10px}
  #ast form{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--line)}
  #ast form input{flex:1;padding:8px 10px}
  #ast .meta{font-family:var(--mono);font-size:.64rem;color:var(--muted);margin-top:4px}
  #ast .dots::after{content:'…';animation:astd 1s steps(3) infinite}
  @keyframes astd{0%{content:'.'}33%{content:'..'}66%{content:'...'}}
  @media (max-width:640px){#ast{top:auto;height:82vh;width:100vw;border-left:0;border-top:1px solid var(--line);border-radius:14px 14px 0 0;transform:translateY(105%)}#ast.open{transform:none}}`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);
  document.body.insertAdjacentHTML(
    'beforeend',
    `
  <button id="ast-btn" aria-controls="ast" aria-expanded="false"><i></i>✦ Asistente</button>
  <section id="ast" aria-label="Asistente de IA industrial">
    <header><b>✦ Asistente de IA industrial</b><button id="ast-man" title="Índice de los manuales">Manuales</button><button id="ast-x" aria-label="Cerrar">✕</button></header>
    <div class="ctl"><label>Apruebas como <select id="ast-rol"><option value="operador">Operador de sala</option><option value="mantenimiento">Mantenimiento</option><option value="jefe_turno" selected>Jefe de turno</option><option value="gerencia">Gerencia</option></select></label><span class="sp"></span><label title="Sin la IA responde el diagnóstico por reglas"><input type="checkbox" id="ast-ia" checked> IA NVIDIA</label><span class="modo" id="ast-modo">cargando</span></div>
    <div class="msgs" id="ast-msgs" aria-live="polite"><div class="m a">Leo la planta en vivo, explico qué pasa con la evidencia y propongo acciones del catálogo. <b>No ejecuto nada solo:</b> cada acción la apruebas tú en dos pasos y después vigilo que tenga efecto. Lo que no puedo hacer, te lo enseño con el manual.</div></div>
    <div class="chips" id="ast-chips">
      <button>¿Cómo está la planta?</button><button>¿Por qué hay alarmas?</button><button>¿Qué equipo está más cerca de fallar?</button><button>¿Cuánto cobre llevamos en el turno?</button><button>¿Cómo se cambian los revestimientos del chancador?</button>
    </div>
    <form id="ast-f"><input id="ast-q" maxlength="500" placeholder="Pregunta sobre la planta…" autocomplete="off"><button class="on" type="submit">Enviar</button></form>
  </section>`
  );
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'})[c]);
  const open = (on) => {
    $('ast').classList.toggle('open', on);
    $('ast-btn').setAttribute('aria-expanded', on);
    if (on && matchMedia('(pointer:fine)').matches) setTimeout(() => $('ast-q').focus(), 200);
  };
  $('ast-btn').onclick = () => open(true);
  $('ast-x').onclick = () => open(false);
  const rol = () => $('ast-rol').value;
  const iaOn = () => $('ast-ia').checked;

  /* ---------- base de conocimiento ---------- */
  let listo = false;
  IANucleo.cargarWeb('').then((k) => {
    K = k;
    N = IANucleo.crear(P, K);
    Planta.nucleo = N;
    listo = true;
    modo();
  });
  let sinRuta = 0; // si el intermediario no tiene la ruta /planta, no se insiste por 5 min
  const modo = (txt) => {
    const m = $('ast-modo'),
      ia = iaOn() && Date.now() > sinRuta;
    m.className = 'modo' + (ia ? ' ia' : '');
    m.textContent = txt || (ia ? 'Nemotron + verificación' : 'reglas locales');
  };
  $('ast-ia').onchange = () => modo();

  /* ---------- presentación ---------- */
  const inline = (s) => {
    const p = P();
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\b((?:VIT-)?[A-Z]{1,4}-\d{3}[A-Z]?)\b/g, (m) => {
        const fp = p.M[m] || p.L[m] || m === 'RT-401' ? m : N.loopOfPV(m);
        return fp
          ? `<button class="tagref" data-fp="${fp}">${m}</button>`
          : `<span class="tagref" style="cursor:default">${m}</span>`;
      })
      .replace(/\b((?:OP|MT|GE|IA)-\d+(?:\.\d+)?)\b/g, (m) =>
        K.manual.some((x) => x.id === m) ? `<button class="tagref" data-man="${m}">${m}</button>` : m
      );
  };
  // Markdown mínimo para los manuales: títulos, listas, tablas, negritas y código
  const md = (t) => {
    const out = [];
    let list = null,
      tbl = null;
    const flush = () => {
      if (list) out.push(`<${list.t}>${list.i.join('')}</${list.t}>`);
      if (tbl) out.push(`<table>${tbl.join('')}</table>`);
      list = tbl = null;
    };
    for (const line of String(t).split('\n')) {
      if (/^\s*\|/.test(line)) {
        if (/^\s*\|[\s\-:|]+\|\s*$/.test(line)) continue;
        if (list) flush();
        tbl = tbl || [];
        const c = line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|');
        tbl.push(
          `<tr>${c.map((x) => `<${tbl.length ? 'td' : 'th'}>${inline(x.trim())}</${tbl.length ? 'td' : 'th'}>`).join('')}</tr>`
        );
        continue;
      }
      const li = line.match(/^\s*(?:([-*•])|(\d+)\.)\s+(.*)/);
      if (li) {
        if (tbl) flush();
        const tt = li[1] ? 'ul' : 'ol';
        if (list && list.t !== tt) flush();
        list = list || {t: tt, i: []};
        list.i.push(`<li>${inline(li[3])}</li>`);
        continue;
      }
      flush();
      const h = line.match(/^(#{2,4})\s+(.*)/);
      if (h) out.push(`<h4>${inline(h[2])}</h4>`);
      else if (line.trim() && !/^#\s/.test(line)) out.push(`<p>${inline(line.replace(/^>\s?/, ''))}</p>`);
    }
    flush();
    return out.join('');
  };
  const add = (cls, html) => {
    const d = document.createElement('div');
    d.className = 'm ' + cls;
    d.innerHTML = html;
    $('ast-msgs').appendChild(d);
    $('ast-msgs').scrollTop = 1e9;
    return d;
  };
  const RIESGO = {bajo: 'bajo', medio: 'medio', alto: 'alto'};
  const efectoTxt = (acc, o) => {
    const ef = acc.efecto_esperado || {},
      m = ef.min ? ` en ${ef.min} min` : '';
    if (ef.estado)
      return `${o || 'el equipo'} queda ${{RUN: 'en marcha', STOP: 'detenido', REARMADO: 'rearmado', RESPALDO: 'en respaldo automático'}[ef.estado]}${m}`;
    if (ef.estado_equipo) return `${ef.estado_equipo[0]} en marcha${m}`;
    if (ef.modo) return `${o} vuelve a su modo normal${m}`;
    if (ef.pv_hacia_sp) return `la medición de ${o} llega a la nueva consigna${m}`;
    if (ef.tag)
      return `${ef.tag} ${{sube: 'sube', baja: 'baja', normaliza: 'vuelve a su banda normal', estable: 'se mantiene en banda', hacia_plan: 'llega a la consigna del plan'}[ef.dir] || 'cambia'}${m}`;
    return 'efecto visible en la HMI';
  };

  /* ---------- tarjetas de acción con aprobación en dos pasos ---------- */
  const propuestas = [];
  const tarjeta = (a) => {
    const i = propuestas.push(a) - 1,
      acc = N.catalogo().find((x) => x.id === a.id) || {},
      full = (K.acciones && K.acciones.acciones.find((x) => x.id === a.id)) || {};
    const chk = N.revisarAccion(a);
    return `<div class="acc" data-acc="${i}"><span class="t">${esc(acc.titulo || a.id)}${a.objetivo ? ' · ' + inline(a.objetivo) : ''}${a.valor !== undefined && a.valor !== '' ? ' → ' + esc(a.valor) : ''}</span>
      <span class="q"><span class="rk ${RIESGO[acc.riesgo] || 'medio'}">riesgo ${esc(acc.riesgo || '')}</span> · aprueba ${esc(N.roles[acc.rol] || acc.rol || '')} · efecto esperado: ${esc(efectoTxt(full, a.objetivo))}</span>
      ${a.por_que ? `<span class="q">Por qué: ${inline(a.por_que)}</span>` : ''}
      <span class="q ${chk.ok ? 'ok' : 'no'}">${chk.ok ? '✓ Precondiciones y permisivos cumplidos ahora' : '✕ ' + esc(chk.motivo)}</span>
      <span class="r"><button class="on" data-arev="${i}" ${chk.ok ? '' : 'disabled'}>Revisar y aprobar</button>${full.manual ? `<button data-man="${full.manual}">Cómo · ${full.manual}</button>` : ''}</span></div>`;
  };
  const confirmar = (card, i) => {
    const a = propuestas[i],
      full = K.acciones.acciones.find((x) => x.id === a.id),
      r = rol();
    if (!N.puedeAprobar(full.rol, r)) {
      card
        .querySelector('.r')
        .insertAdjacentHTML(
          'afterend',
          `<span class="q no">Como ${esc(N.roles[r])} no puedes aprobarla: la aprueba ${esc(N.roles[full.rol])}${full.rol !== 'jefe_turno' ? ' o el jefe de turno' : ''} (regla S9). Cambia el rol arriba si corresponde.</span>`
        );
      return;
    }
    const alto = full.riesgo === 'alto';
    card.querySelector('.r').outerHTML =
      `<div class="conf2"><span>Vas a ejecutar <b>${esc(full.titulo)}</b>${a.objetivo ? ' en ' + esc(a.objetivo) : ''} como <b>${esc(N.roles[r])}</b>. ${esc(full.descripcion || '')} Queda en la bitácora a tu nombre y el asistente vigila el efecto.</span>${alto ? `<label><input type="checkbox" data-achk="${i}"> Verifiqué en terreno que el área está despejada y comunicada (riesgo alto, regla S7)</label>` : ''}<span class="r"><button class="on" data-aok="${i}" ${alto ? 'disabled' : ''}>Confirmar y ejecutar</button><button data-ano="${i}">Cancelar</button></span></div>`;
  };
  $('ast-msgs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-arev],[data-aok],[data-ano],[data-man],[data-q]');
    if (!b) return;
    const card = b.closest('.acc'),
      d = b.dataset;
    if (d.man) return verManual(d.man);
    if (d.q) return ask(d.q);
    if (d.arev != null) return confirmar(card, +d.arev);
    if (d.ano != null) {
      card.querySelector('.conf2').outerHTML = `<span class="q">Cancelada. No se ejecutó nada.</span>`;
      return;
    }
    if (d.aok != null) {
      const res = N.ejecutar(propuestas[+d.aok], rol());
      card.querySelector('.conf2').outerHTML = res.ok
        ? `<span class="q ok">✓ Ejecutada ${P().hhmm()}. Vigilando el efecto…</span>`
        : `<span class="q no">✕ No se ejecutó: ${esc(res.motivo)}</span>`;
      if (res.ok) card.classList.add('done');
    }
  });
  $('ast-msgs').addEventListener('change', (e) => {
    const c = e.target.closest('[data-achk]');
    if (c) $('ast-msgs').querySelector(`[data-aok="${c.dataset.achk}"]`).disabled = !c.checked;
  });
  // seguimiento de las acciones aprobadas
  setInterval(() => {
    if (!listo) return;
    N.revisarSeguimientos().forEach((s) =>
      add(
        'sys ' + (s.estado === 'cumplido' ? 'ok' : 'warn'),
        s.estado === 'cumplido'
          ? `✓ Seguimiento: «${esc(s.titulo)}» tuvo el efecto esperado.`
          : `⚠ Seguimiento: «${esc(s.titulo)}» no mostró el efecto esperado en ${s.ef.min} min. Revisa en terreno o pregunta por qué.`
      )
    );
  }, 1000);

  /* ---------- manuales ---------- */
  const verManual = (id) => {
    open(true);
    const s = K.manual.find((x) => x.id === id);
    if (!s)
      return add(
        'sys',
        listo ? `No encuentro la sección ${esc(id)} en los manuales.` : 'Cargando los manuales…'
      );
    add(
      'a man',
      `<h4>${esc(s.id)} · ${esc(s.titulo)} <span class="conf">${esc(s.doc)}</span></h4>${md(s.texto)}`
    );
  };
  $('ast-man').onclick = () => {
    const by = {};
    K.manual.forEach((s) => (by[s.doc] = by[s.doc] || []).push(s));
    const T = {
      operacion: 'Operación',
      mantenimiento: 'Mantenimiento',
      gerencia: 'Gerencia',
      asistente: 'Asistente de IA',
    };
    add(
      'a',
      `<b>Manuales de la planta</b><div class="idx">${Object.entries(by)
        .map(
          ([d, l]) =>
            `<h4>${T[d] || d}</h4>` +
            l.map((s) => `<button data-man="${s.id}">${s.id} · ${esc(s.titulo)}</button>`).join('')
        )
        .join('')}</div>`
    );
  };

  /* ---------- pipeline ---------- */
  const post = async (body, ms) => {
    const ac = new AbortController(),
      to = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(NV + '/planta', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 404 || r.status === 405 || /etapa desconocida|no encontrada/.test(d.error || ''))
        sinRuta = Date.now() + 300000;
      if (!r.ok || !d.aok) throw new Error(d.error || 'HTTP ' + r.status);
      return d;
    } finally {
      clearTimeout(to);
    }
  };
  const historial = [];
  const objetosPlanta = () => {
    const p = P();
    return [
      ...Object.keys(p.M),
      'RT-401',
      ...Object.keys(p.L),
      ...Object.keys(p.T).filter((t) => !t.startsWith('VIT-')),
    ];
  };
  const ms = (t) => f((performance.now() - t) / 1000, 1) + ' s';
  const pintar = (w, resp, traza, foco) => {
    const v = resp;
    let h = `<p>${inline(v.resumen || '')}<span class="conf">confianza ${esc(v.confianza || '—')}</span></p>`;
    if (v.causa_probable) h += `<h4>Causa probable</h4><p>${inline(v.causa_probable)}</p>`;
    if (v.evidencia.length)
      h += `<h4>Evidencia</h4><div class="ev">${v.evidencia
        .map(
          (e) =>
            `<span>${inline(e.tag)} = <b>${esc(f(e.valor, Math.abs(e.valor) < 10 ? 2 : 1))}</b> ${esc(P().T[e.tag] ? P().T[e.tag].unit : '')}${e.comentario ? ' · ' + esc(e.comentario) : ''}${e.corregido ? ' (corregido por el verificador)' : ''}</span>`
        )
        .join('')}</div>`;
    if (v.acciones.length)
      h += `<h4>Acciones propuestas (tú apruebas)</h4>` + v.acciones.map(tarjeta).join('');
    if (v.descartadas.length)
      h +=
        `<h4>Lo que no puedo proponer</h4>` +
        v.descartadas
          .map(
            (a) =>
              `<div class="noacc"><b>${esc(a.titulo || a.id)}${a.objetivo ? ' · ' + esc(a.objetivo) : ''}</b>: ${esc(a.motivo)}${a.regla ? ` (${esc(a.regla)})` : ''}</div>`
          )
          .join('');
    if (v.pasos_manuales.length)
      h += `<h4>Pasos en terreno o en la HMI</h4><ol>${v.pasos_manuales.map((x) => `<li>${inline(x.paso)}${x.manual ? ` · <button class="tagref" data-man="${x.manual}">${x.manual}</button>` : ''}</li>`).join('')}</ol>`;
    const pr = v.para_cada_rol || {};
    if (pr.operacion || pr.mantenimiento || pr.jefe_turno)
      h += `<h4>Para cada rol</h4><ul>${[
        ['Operación', pr.operacion],
        ['Mantenimiento', pr.mantenimiento],
        ['Jefe de turno', pr.jefe_turno],
      ]
        .filter((x) => x[1])
        .map(([k, x]) => `<li><b>${k}:</b> ${inline(x)}</li>`)
        .join('')}</ul>`;
    if (v.no_se) h += `<h4>Lo que no sé o hay que verificar</h4><p>${inline(v.no_se)}</p>`;
    h += `<details><summary>Cómo llegué a esto</summary><ol>${traza.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></details>`;
    w.innerHTML = h;
    $('ast-msgs').scrollTop = 1e9;
  };
  let ocupado = false;
  const ask = async (q, foco = null) => {
    q = String(q || '').trim();
    if (!q || ocupado) return;
    if (!listo) return add('sys', 'Cargando la base de conocimiento, intenta en un segundo.');
    ocupado = true;
    add('u', esc(q));
    $('ast-q').value = '';
    const w = add('a', '<span class="dots">Entendiendo la pregunta</span>');
    const traza = [],
      t0 = performance.now(),
      usarIA = iaOn() && Date.now() > sinRuta;
    const etapa = (t) => (w.innerHTML = `<span class="dots">${esc(t)}</span>`);
    try {
      // 1 · entender
      let ent,
        t = performance.now();
      if (usarIA)
        try {
          const d = await post(
            {etapa: 'entender', pregunta: q, objetos: objetosPlanta(), historial: historial.slice(-4)},
            12000
          );
          ent = d.result;
          traza.push(`Entender · ${d.model.split('/').pop()} · ${ms(t)} · intención «${ent.intencion}»`);
        } catch (e) {
          sinRuta = Math.max(sinRuta, Date.now() + 60000); // sin conexión: reglas locales por un minuto
          traza.push(`Entender · IA no disponible (${e.message}); router local`);
        }
      if (!ent) {
        ent = N.entenderLocal(q);
        if (!usarIA) traza.push(`Entender · router local · intención «${ent.intencion}»`);
      }
      if (ent.intencion === 'fuera_de_alcance') {
        w.innerHTML = `<p>Solo respondo sobre la planta: su estado, sus fallas, cómo operarla y su producción. Prueba con una de las preguntas sugeridas.</p>`;
        return;
      }
      // 2 · consultar (solo lectura, en el navegador)
      etapa('Consultando la planta y los manuales');
      const hs = (ent.herramientas || [])
        .filter((h) => h.nombre !== 'estado_planta' && h.nombre !== 'manual')
        .slice(0, 6);
      const consultas = hs.map((h) => ({
        herramienta: h.nombre,
        arg: h.arg,
        resultado: N.usarHerramienta(h.nombre, h.arg),
      }));
      if (foco && foco.alarma)
        consultas.push({
          herramienta: 'alarma',
          arg: foco.alarma,
          resultado: N.usarHerramienta('alarma', foco.alarma),
        });
      const man = N.buscarManual([ent.busqueda_manual, q, foco && foco.manual].filter(Boolean).join(' '), 3);
      if (foco && foco.manual && !man.find((x) => x.id === foco.manual)) {
        const s = K.manual.find((x) => x.id === foco.manual);
        if (s) man.unshift({id: s.id, titulo: s.titulo, doc: s.doc, extracto: s.texto.slice(0, 900)});
      }
      traza.push(
        `Consultar · ${consultas.length + 1} herramientas de solo lectura (${['estado_planta', ...consultas.map((c) => c.herramienta + (c.arg ? ' ' + c.arg : ''))].join(', ')}) · manuales: ${man.map((x) => x.id).join(', ') || 'sin coincidencias'}`
      );
      // 3 · diagnosticar
      let resp = null,
        fuente = 'reglas';
      const foto = N.foto(foco ? {aviso_en_foco: {tipo: foco.k, aviso: foco.t, detalle: foco.d}} : {});
      const cuerpo = {
        etapa: 'diagnosticar',
        pregunta: q,
        foto,
        consultas,
        manual: man.slice(0, 3),
        catalogo: N.catalogo(),
        reglas: N.reglasDuras(),
        historial: historial.slice(-4),
      };
      if (usarIA && Date.now() > sinRuta) {
        etapa('Diagnosticando con NVIDIA Nemotron');
        t = performance.now();
        try {
          const d = await post(cuerpo, 45000);
          resp = d.result;
          fuente = d.model.split('/').pop();
          traza.push(`Diagnosticar · ${fuente} con esquema JSON estricto · ${ms(t)}`);
        } catch (e) {
          traza.push(`Diagnosticar · IA no disponible (${e.message}); diagnóstico por reglas`);
        }
      }
      if (!resp) {
        resp = N.diagnosticoLocal(q, foco);
        if (!usarIA) traza.push('Diagnosticar · reglas de la base de conocimiento (IA desactivada)');
      }
      // 4 · verificar y 5 · reanalizar una vez
      etapa('Verificando contra la planta');
      let v = N.validar(resp);
      traza.push(
        `Verificar · ${v.errores.length ? v.errores.map((e) => e.detalle).join('; ') : 'tags, valores, catálogo, precondiciones y reglas duras sin observaciones'}`
      );
      if (!v.ok && fuente !== 'reglas') {
        etapa('La respuesta tuvo errores: reanalizando');
        t = performance.now();
        try {
          const d = await post({...cuerpo, errores: v.errores.map((e) => e.detalle)}, 45000);
          const v2 = N.validar(d.result);
          traza.push(
            `Reanalizar · ${ms(t)} · ${v2.errores.length ? 'quedan ' + v2.errores.length + ' observaciones, corregidas por el verificador' : 'corregido'}`
          );
          v = v2;
        } catch (e) {
          traza.push(
            `Reanalizar · falló (${e.message}); se muestra la respuesta con las correcciones del verificador`
          );
        }
      }
      traza.push(
        `Proponer · ${v.resp.acciones.length} acción(es) para aprobar; ${v.resp.descartadas.length} descartada(s) · total ${ms(t0)}`
      );
      pintar(w, v.resp, traza, foco);
      w.insertAdjacentHTML(
        'beforeend',
        `<div class="meta">${P().hhmm()} · ${esc(fuente === 'reglas' ? 'diagnóstico por reglas' : fuente)} · verificado</div>`
      );
      historial.push({role: 'user', content: q}, {role: 'assistant', content: v.resp.resumen || ''});
    } catch (e) {
      w.innerHTML = `No pude completar el análisis: ${esc(e.message)}.`;
    } finally {
      ocupado = false;
      modo();
    }
  };
  // una acción que viene directo de un aviso: la tarjeta se arma sin llamar a la IA
  const proponer = (accion, aviso) => {
    open(true);
    if (!listo) return add('sys', 'Cargando la base de conocimiento, intenta en un segundo.');
    const w = add('a', '');
    const v = N.validar({
      resumen: aviso ? aviso.t : '',
      evidencia: [],
      acciones: [{...accion, por_que: aviso ? aviso.d : ''}],
      pasos_manuales: [],
    });
    w.innerHTML =
      `<p><b>${inline(aviso ? aviso.t : 'Acción propuesta')}</b></p>` +
      (v.resp.acciones.length
        ? v.resp.acciones.map(tarjeta).join('')
        : v.resp.descartadas.map((a) => `<div class="noacc">${esc(a.motivo)}</div>`).join('')) +
      `<p class="meta"><button class="tagref" data-q="¿Por qué aparece este aviso y qué hago? «${esc(aviso ? aviso.t : '')}»">Pedir el diagnóstico completo</button></p>`;
  };
  Planta.ia = {
    open: () => open(true),
    ask: (q, aviso) => {
      open(true);
      if (q) setTimeout(() => ask(q, aviso), 150);
    },
    proponer,
    manual: verManual,
  };
  $('ast-f').addEventListener('submit', (e) => {
    e.preventDefault();
    ask($('ast-q').value);
  });
  $('ast-chips').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) ask(b.textContent);
  });
  modo();
})();
