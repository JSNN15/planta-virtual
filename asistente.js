/* Pregúntale a la planta: conversación en lenguaje natural sobre la planta. Arma una foto instantánea del estado
   (alarmas, tags fuera de banda, lazos, motores, KPI y bitácora) y la envía a la IA de NVIDIA a través del
   servidor intermedio. La respuesta cita los tags; al tocarlos se abre su placa. */
(() => {
  const NV = ((location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:8787' : 'https://nv-portafolio.jneiranova.workers.dev');
  const P = () => window.__plant();
  const css = `
  #ast-btn{position:fixed;right:16px;bottom:16px;z-index:40;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:#0e2a17;color:#d9ffe0;border:1px solid #76b900;box-shadow:0 8px 30px rgba(0,0,0,.35);font-weight:600}
  #ast-btn:hover{border-color:#a6e22e}
  #ast-btn i{width:9px;height:9px;border-radius:50%;background:#76b900;box-shadow:0 0 8px #76b900}
  #ast{position:fixed;top:0;right:0;bottom:0;width:min(420px,100vw);z-index:50;background:var(--panel);border-left:1px solid var(--line);display:flex;flex-direction:column;transform:translateX(105%);transition:transform .25s ease;box-shadow:-10px 0 40px rgba(0,0,0,.25)}
  #ast.open{transform:none}
  #ast header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid var(--line)}
  #ast header b{flex:1;font-size:.95rem}
  #ast header small{font-family:var(--mono);color:var(--muted);font-size:.7rem}
  #ast .msgs{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:10px}
  #ast .m{padding:9px 11px;border-radius:9px;font-size:.88rem;line-height:1.45;max-width:94%}
  #ast .m.u{align-self:flex-end;background:var(--sel);color:#fff}
  #ast .m.a{align-self:flex-start;background:var(--panel2);border:1px solid var(--line)}
  #ast .m.a ul{margin:4px 0;padding-left:18px}
  #ast .m.a p{margin:4px 0}
  #ast .m.sys{align-self:center;font-size:.76rem;color:var(--muted);background:none;padding:0}
  #ast .tagref{font-family:var(--mono);font-size:.8rem;padding:0 4px;border-radius:3px;border:1px solid var(--line);background:var(--panel);color:var(--val);cursor:pointer}
  #ast .chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 12px 8px}
  #ast .chips button{font-size:.78rem;border-radius:999px;padding:4px 10px}
  #ast form{display:flex;gap:6px;padding:10px 12px;border-top:1px solid var(--line)}
  #ast form input{flex:1;padding:8px 10px}
  #ast .meta{font-family:var(--mono);font-size:.66rem;color:var(--muted);margin-top:4px}
  #ast .dots::after{content:'…';animation:astd 1s steps(3) infinite}
  @keyframes astd{0%{content:'.'}33%{content:'..'}66%{content:'...'}}
  @media (max-width:640px){#ast{top:auto;height:78vh;width:100vw;border-left:0;border-top:1px solid var(--line);border-radius:14px 14px 0 0;transform:translateY(105%)}#ast.open{transform:none}}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  document.body.insertAdjacentHTML('beforeend', `
  <button id="ast-btn" aria-controls="ast" aria-expanded="false"><i></i>Pregúntale a la planta · IA</button>
  <section id="ast" aria-label="Pregúntale a la planta">
    <header><b>Pregúntale a la planta</b><small>NVIDIA Nemotron</small><button id="ast-x" aria-label="Cerrar">✕</button></header>
    <div class="msgs" id="ast-msgs"><div class="m a">Leo la planta en vivo: alarmas, tags, lazos, motores y KPI del turno. Pregúntame qué está pasando o qué hacer. Provoca una falla en <b>Escenarios</b> y pregúntame por ella.</div></div>
    <div class="chips" id="ast-chips">
      <button>¿Cómo está la planta?</button><button>¿Por qué hay alarmas?</button><button>¿Qué equipo está más cerca de fallar?</button><button>¿Cuánto cobre llevamos en el turno?</button><button>Resumen para el cambio de turno</button>
    </div>
    <form id="ast-f"><input id="ast-q" maxlength="500" placeholder="Pregunta al asistente…" autocomplete="off"><button class="on" type="submit">Enviar</button></form>
  </section>`);
  const $ = (id) => document.getElementById(id);
  const open = (on) => { $('ast').classList.toggle('open', on); $('ast-btn').setAttribute('aria-expanded', on); if (on) setTimeout(() => $('ast-q').focus(), 200); };
  $('ast-btn').onclick = () => open(true); $('ast-x').onclick = () => open(false);

  const r = (v, d = 1) => (typeof v === 'number' && isFinite(v) ? +v.toFixed(d) : v);
  const KEY = ['WIT-101', 'KY-102', 'AIT-105', 'PIT-202', 'FIT-200', 'LIT-201', 'LIT-204', 'AIT-206', 'AIT-207', 'FIT-205', 'AIT-208', 'KY-303', 'LIT-303', 'IIT-401', 'KY-402', 'TIT-403', 'AIT-405', 'AIT-406', 'AIT-407', 'KY-405', 'KY-406', 'KY-407', 'JIT-500', 'KY-501', 'LIT-501'];
  const PR = {1: 'urgente', 2: 'alta', 3: 'media', 4: 'baja'};
  // foto instantánea del estado de la planta, compacta para el modelo
  const snapshot = () => {
    const p = P(), T = p.T, X = p.X;
    const tagv = (t) => ({desc: t.desc, v: r(t.v, t.dec), u: t.unit, normal: [t.nl, t.nh]});
    const fuera = Object.values(T).filter((t) => t.nl != null && (t.v < t.nl || t.v > t.nh) && !String(t.id).startsWith('VIT-')).slice(0, 25);
    const motores = {};
    const zona = (m) => { const z = m.z || [2.3, 4.5, 7.1]; return m.vib > z[2] ? 'D' : m.vib > z[1] ? 'C' : m.vib > z[0] ? 'B' : 'A'; };
    Object.values(p.M).forEach((m) => { const zn = zona(m); if (m.state !== 'RUN' || zn === 'C' || zn === 'D' || m.temp > 75 || m.standby) motores[m.id] = {desc: m.desc, estado: m.state, respaldo: m.standby, vib_mm_s: r(m.vib, 2), zona_ISO_10816_3: zn, limites_zona_mm_s: m.z || [2.3, 4.5, 7.1], temp_C: r(m.temp, 0), A: r(m.amps, 0), disparo: m.trip || null, horas_desde_PM: r(m.sincePM, 0)}; });
    const shorts = Array.from(X.shorts).filter((s) => s >= 1).length;
    return {
      hora_planta: p.hhmm(), turno: p.shiftOf(),
      alarmas_activas: p.AD.filter((a) => a.st === 'U' || a.st === 'A').sort((a, b) => a.prio - b.prio).slice(0, 25).map((a) => ({id: a.id, prioridad: PR[a.prio] || a.prio, estado: a.st === 'U' ? 'sin reconocer' : 'reconocida', desc: a.desc || (T[a.tag] ? T[a.tag].desc + ' ' + a.type : a.id), desde: a.since ? p.hm(a.since) : null})),
      tags_fuera_de_banda: Object.fromEntries(fuera.map((t) => [t.id, tagv(t)])),
      tags_clave: Object.fromEntries(KEY.filter((k) => T[k]).map((k) => [k, tagv(T[k])])),
      lazos: Object.fromEntries(Object.entries(p.L).map(([k, l]) => [k, {desc: l.desc, modo: l.mode, sp: r(l.mode === 'CAS' && l.casSP != null ? l.casSP : l.sp, 2), pv: r(l.pv, 2), op_pct: r(l.op, 0), u: l.unit}])),
      motores_con_novedad: motores,
      rectificador: {estado: p.RECT.state, kA: r(p.RECT.I, 1), V: r(p.RECT.V, 0), disparo: p.RECT.trip},
      interruptores_abiertos: Object.entries(p.BRK).filter(([, v]) => !v).map(([k]) => k),
      celdas_con_cortocircuito: shorts, monitoreo_continuo_celdas: X.monitor,
      kpi_turno: {catodo_t: r(X.cathShift, 1), plan_t: r(X.plannedShift, 1), energia_MWh: r(X.energyShift, 1), perdido_por_cortos_t: r(X.lostShorts, 2), perdido_por_rectificador_t: r(X.lostRect, 2), horas_detencion_rect: r(X.downShift, 2), alarmas_del_turno: X.alarmsShift, precio_cobre_USD_lb: p.CU_PRICE},
      bitacora_reciente: p.S.log.slice(0, 12).map((l) => `${p.hm(l.t)} ${l.who}: ${l.msg}`)
    };
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  // markdown mínimo + tags tocables
  const render = (t) => {
    const p = P(), known = new Set([...Object.keys(p.L), ...Object.keys(p.M)]);
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\b([A-Z]{1,4}-\d{3}[A-Z]?)\b/g, (m) => (known.has(m) ? `<button class="tagref" data-fp="${m}">${m}</button>` : `<span class="tagref" style="cursor:default">${m}</span>`));
    const out = []; let list = null;
    for (const line of t.split('\n')) {
      const li = line.match(/^\s*[-*•]\s+(.*)/);
      if (li) { if (!list) { list = []; } list.push(`<li>${inline(li[1])}</li>`); continue; }
      if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
      if (line.trim()) out.push(`<p>${inline(line.replace(/^#+\s*/, ''))}</p>`);
    }
    if (list) out.push(`<ul>${list.join('')}</ul>`);
    return out.join('');
  };
  const history = [];
  const add = (cls, html) => { const d = document.createElement('div'); d.className = 'm ' + cls; d.innerHTML = html; $('ast-msgs').appendChild(d); $('ast-msgs').scrollTop = 1e9; return d; };
  const ask = async (q) => {
    q = q.trim(); if (!q) return;
    add('u', esc(q)); $('ast-q').value = '';
    const w = add('a', '<span class="dots">Leyendo la planta</span>'); const t0 = performance.now();
    try {
      const res = await fetch(NV + '/turno', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question: q, snapshot: snapshot(), history: history.slice(-6)})});
      const d = await res.json(); if (!res.ok || !d.ok) throw new Error(d.error || 'sin respuesta');
      w.innerHTML = render(d.answer) + `<div class="meta">${P().hhmm()} · ${(d.ms / 1000).toFixed(1).replace('.', ',')} s · ${esc(d.model.split('/').pop())}</div>`;
      history.push({role: 'user', content: q}, {role: 'assistant', content: d.answer});
    } catch (e) { w.innerHTML = `No pude consultar a la IA: ${esc(e.message)}. Intenta de nuevo en un minuto.`; }
    $('ast-msgs').scrollTop = 1e9;
  };
  $('ast-f').addEventListener('submit', (e) => { e.preventDefault(); ask($('ast-q').value); });
  $('ast-chips').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
  window.__snapshot = snapshot;
})();
