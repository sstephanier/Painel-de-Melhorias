import { SEED_DEMO_DATA, isFirebaseConfigured } from "./firebase-config.js";
import {
  firebaseAvailable, observeAuth, loginGoogle, logoutGoogle,
  ensureUserProfile, subscribeUserProfile, subscribeUsuarios, updateUserAccess, touchCurrentUserLogin,
  subscribeProcessos, subscribeAcompanhamentos, subscribeParametros,
  saveParametros, addProcesso, setProcesso, removeProcesso,
  addAcompanhamento, ensureDemoSeed
} from "./firebase-service.js";
function renderKPIs(list){
  const agg = computeAggregate(list);
  const grid = document.getElementById("kpi-grid");
  if(!grid) return;

  let specificTile = {
    label: "Iniciativas implementadas",
    value: String(agg.implementadas),
    sub: `${agg.n} iniciativas no filtro`
  };

  if(state.filters.frente){
    const ind = getIndicadorPorFrente(state.filters.frente);
    const melhoriaMedia = avg(list.map(p => p.calc.indPctMelhoria || 0));
    specificTile = {
      label: "Melhoria do indicador da frente",
      value: fmtPct(melhoriaMedia),
      sub: ind.nome
    };
  }

  const tiles = [
    { label: "Processos mapeados", value: fmtNum.format(agg.n), sub: "oportunidades no filtro atual" },
    { label: "HH consumidas — AS-IS", value: fmtHoras(agg.asisHH), sub: "esforço anual atual" },
    { label: "HH projetadas — TO-BE", value: fmtHoras(agg.tobeHH), sub: "esforço anual após melhoria" },
    { label: "HH liberadas / ano", value: fmtHoras(agg.hhLiberadas), sub: "capacidade operacional potencial" },
    { label: "Redução de esforço", value: fmtPct(agg.reducaoEsforco), sub: "redução AS-IS → TO-BE" },
    { label: "Valor equivalente da capacidade", value: fmtBRL.format(agg.valorCapacidadeLiberada), sub: "equivalente anual da mão de obra liberada" },
    { label: "Em desenvolvimento", value: String(agg.emDesenvolvimento), sub: `${agg.planejadas} ainda em planejamento/análise` },
    specificTile
  ];

  grid.innerHTML = tiles.map(t => `
    <div class="kpi">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value">${t.value}</div>
      <div class="kpi-sub">${t.sub}</div>
    </div>
  `).join("");

  const strip = document.getElementById("kpi-strip");
  if(strip){
    const chips = [
      { value: fmtNum.format(agg.jornadasEquivalentes), label: "jornadas de 8h equivalentes liberadas / ano" },
      { value: fmtHoras(agg.hhMediaPorProcesso), label: "média de HH liberadas por oportunidade" },
      { value: fmtPct(agg.pctImplementadas), label: "iniciativas implementadas / validadas" }
    ];
    strip.innerHTML = chips.map(c => `
      <div class="kpi-chip">
        <div class="kpi-chip-text">
          <span class="kpi-chip-val">${c.value}</span>
          <span class="kpi-chip-label">${c.label}</span>
        </div>
      </div>
    `).join("");
  }

  renderSpecificIndicator(list);
}

function renderSpecificIndicator(list){
  const panel = document.getElementById("specific-indicator-panel");
  const description = document.getElementById("specific-indicator-description");
  const content = document.getElementById("specific-indicator-content");
  if(!panel || !description || !content) return;

  if(!state.filters.frente){
    panel.hidden = true;
    return;
  }

  panel.hidden = false;
  const frente = state.filters.frente;
  const indicador = getIndicadorPorFrente(frente);
  const processosComValor = list.filter(p => p.indValorAntes !== undefined && p.indValorAntes !== null && p.indValorAntes !== "" && p.indValorDepois !== undefined && p.indValorDepois !== null && p.indValorDepois !== "");
  const melhoriaMedia = avg(processosComValor.map(p => p.calc.indPctMelhoria));

  description.textContent = `${frente} · ${indicador.nome} · ${indicador.unidade}`;

  if(!processosComValor.length){
    content.innerHTML = `<div class="empty-note">O indicador específico desta frente ainda não possui medições AS-IS e TO-BE suficientes.</div>`;
    return;
  }

  content.innerHTML = `
    <div class="specific-indicator-card"><span class="specific-indicator-label">Indicador</span><strong>${indicador.nome}</strong></div>
    <div class="specific-indicator-card"><span class="specific-indicator-label">Unidade</span><strong>${indicador.unidade}</strong></div>
    <div class="specific-indicator-card"><span class="specific-indicator-label">Melhoria média</span><strong>${fmtPct(melhoriaMedia)}</strong></div>
    <div class="specific-indicator-card"><span class="specific-indicator-label">Processos medidos</span><strong>${processosComValor.length}</strong></div>
  `;
}

function renderAsIsToBe(list){
  const el = document.getElementById("chart-asis-tobe");
  if(!el) return;

  if(!list.length){
    el.innerHTML = `<div class="empty-note">Nenhum processo no filtro atual.</div>`;
    return;
  }

  const data = [...list].sort((a,b) => b.calc.asis.tempoAnual - a.calc.asis.tempoAnual);
  const maxHH = Math.max(...data.map(p => Math.max(p.calc.asis.tempoAnual, p.calc.tobe.tempoAnual)), 1);

  el.innerHTML = data.map(p => {
    const asis = Math.max(0, p.calc.asis.tempoAnual);
    const tobe = Math.max(0, p.calc.tobe.tempoAnual);
    const asisPct = safeDiv(asis, maxHH) * 100;
    const tobePct = safeDiv(tobe, maxHH) * 100;

    return `
      <div class="asis-tobe-row">
        <div class="asis-tobe-name">
          <strong>${p.nome}</strong>
          <span>${p.setor.replace(/^.*? - /,"")}</span>
        </div>
        <div class="asis-tobe-bars">
          <div class="asis-tobe-line">
            <span class="asis-tobe-label">AS-IS</span>
            <div class="asis-tobe-track"><div class="asis-tobe-fill asis" style="width:${asisPct}%"></div></div>
            <strong>${fmtHoras(asis)}</strong>
          </div>
          <div class="asis-tobe-line">
            <span class="asis-tobe-label">TO-BE</span>
            <div class="asis-tobe-track"><div class="asis-tobe-fill tobe" style="width:${tobePct}%"></div></div>
            <strong>${fmtHoras(tobe)}</strong>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function renderHHLiberadas(list){
  const el = document.getElementById("chart-hh-liberadas");
  if(!el) return;

  if(!list.length){
    el.innerHTML = `<div class="empty-note">Nenhum processo no filtro atual.</div>`;
    return;
  }

  const data = [...list].sort((a,b) => b.calc.horasAnoEcon - a.calc.horasAnoEcon);
  const max = Math.max(...data.map(p => Math.max(0, p.calc.horasAnoEcon)), 1);

  el.innerHTML = data.map(p => {
    const hh = Math.max(0, p.calc.horasAnoEcon);
    const pct = safeDiv(hh, max) * 100;

    return `
      <div class="barlist-row">
        <span class="rowlabel" title="${p.nome}">${p.nome}</span>
        <div class="barlist-track"><div class="barlist-fill" style="width:${pct}%;background:${frenteHex(p.frente)}"></div></div>
        <span class="barlist-val">${fmtHoras(hh)}</span>
      </div>
    `;
  }).join("");
}

function renderSetorList(list){
  const el = document.getElementById("chart-setor");
  if(!el) return;

  const mapa = {};

  list.forEach(p => {
    const setor = p.setor || "Não informado";
    if(!mapa[setor]) mapa[setor] = { setor, frente: p.frente, hh: 0 };
    mapa[setor].hh += Math.max(0, p.calc.horasAnoEcon);
  });

  const data = Object.values(mapa).sort((a,b) => b.hh - a.hh);
  if(!data.length){
    el.innerHTML = `<div class="empty-note">Nenhum processo no filtro atual.</div>`;
    return;
  }

  const max = Math.max(...data.map(d => d.hh), 1);
  el.innerHTML = data.map(d => {
    const pct = safeDiv(d.hh, max) * 100;
    return `
      <div class="barlist-row">
        <span class="rowlabel" title="${d.setor}">${d.setor.replace(/^.*? - /,"")}</span>
        <div class="barlist-track"><div class="barlist-fill" style="width:${pct}%;background:${frenteHex(d.frente)}"></div></div>
        <span class="barlist-val">${fmtHoras(d.hh)}</span>
      </div>
    `;
  }).join("");
}

function execucoesAno(freq,periodicidade){
  freq = Number(freq)||0;
  switch(periodicidade){
    case "Diária": return freq*diasUteisAno();
    case "Semanal": return freq*52;
    case "Quinzenal": return freq*24;
    case "Mensal": return freq*CONST.mesesPorAno;
    case "Trimestral": return freq*4;
    case "Semestral": return freq*2;
    case "Anual": return freq*1;
    default: return freq*1;
  }
}
function diasUteisAno(){
  return MESES.reduce((total, mes) => total + (Number(CONST.diasUteisPorMes[mes]) || 0), 0);
}
function horasPorExecucao(unidade, tempo, jornadaDiaria){
  const valor = Number(tempo) || 0;
  if(unidade === "Minutos") return valor / 60;
  if(unidade === "Dias") return valor * jornadaDiaria;
  return valor;
}
function computeScenario(sc){
  const execAno = execucoesAno(sc.freq, sc.periodicidade);
  const execMes = safeDiv(execAno, CONST.mesesPorAno);
  const horasExec = horasPorExecucao(sc.unidade, sc.tempo, CONST.jornadaDiaria);
  const pessoas = Number(sc.pessoas)||0;
  const valorHora = Number(sc.valorHora)||0;
  const outrosCustos = Number(sc.outrosCustos)||0;
  const retrabalho = Math.max(0, Number(sc.retrabalho)||0);
  const tempoMensalBase = horasExec*pessoas*execMes;
  const tempoAnualBase = horasExec*pessoas*execAno;
  // Premissa: X% de retrabalho representa X% de repetição adicional do esforço do processo.
  const tempoMensalRetrabalho = tempoMensalBase*retrabalho;
  const tempoAnualRetrabalho = tempoAnualBase*retrabalho;
  const tempoMensal = tempoMensalBase + tempoMensalRetrabalho;
  const tempoAnual = tempoAnualBase + tempoAnualRetrabalho;
  const custoMensalMO = tempoMensal*valorHora;
  const custoAnualMO = tempoAnual*valorHora;
  const custoAnualTotal = custoAnualMO + outrosCustos*12;
  return { execAno, execMes, horasExec, retrabalho, tempoMensalBase, tempoAnualBase, tempoMensalRetrabalho, tempoAnualRetrabalho, tempoMensal, tempoAnual, custoMensalMO, custoAnualMO, custoAnualTotal, outrosCustos, valorHora };
}
function computeProcesso(p){
  const asis = computeScenario(p.asis);
  const tobe = computeScenario(p.tobe);
  const custoImpl = (Number(p.impl.dev)||0)+(Number(p.impl.aquis)||0)+(Number(p.impl.trein)||0)+(Number(p.impl.outros)||0);
  const manutAnual = (Number(p.impl.manutencao)||0)*12;

  const horasExecEcon = asis.horasExec - tobe.horasExec;
  const horasMesEcon = asis.tempoMensal - tobe.tempoMensal;
  const horasAnoEcon = asis.tempoAnual - tobe.tempoAnual;
  const reducaoTempoPct = safeDiv(horasAnoEcon, asis.tempoAnual);
  const econMensalMO = asis.custoMensalMO - tobe.custoMensalMO;
  const econAnualMO = asis.custoAnualMO - tobe.custoAnualMO;
  const reducaoOutrosCustosAnual = (asis.outrosCustos - tobe.outrosCustos)*12;
  const economiaBrutaAnual = asis.custoAnualTotal - tobe.custoAnualTotal;
  const economiaLiquida1Ano = economiaBrutaAnual - custoImpl - manutAnual;
  const economiaLiquidaRecorrente = economiaBrutaAnual - manutAnual;
  const reducaoCustoPct = safeDiv(economiaBrutaAnual, asis.custoAnualTotal);
  const roi1Ano = safeDiv(economiaLiquida1Ano, custoImpl);
  const paybackMeses = (custoImpl>0 && economiaLiquidaRecorrente>0) ? custoImpl/(economiaLiquidaRecorrente/12) : Infinity;
  const valorAcum12 = economiaLiquidaRecorrente - custoImpl;
  const valorAcum24 = economiaLiquidaRecorrente*2 - custoImpl;

  const indObj = getIndicadorPorFrente(p.frente);
  const vAntes = p.indValorAntes!==undefined && p.indValorAntes!=="" && p.indValorAntes!==null ? Number(p.indValorAntes) : NaN;
  const vDepois = p.indValorDepois!==undefined && p.indValorDepois!=="" && p.indValorDepois!==null ? Number(p.indValorDepois) : NaN;
  let indPctMelhoria = 0;
  if(!isNaN(vAntes) && !isNaN(vDepois) && vAntes!==0){
    if(indObj.direcao==="menor"){
      indPctMelhoria = safeDiv(vAntes - vDepois, vAntes);
    }else{
      indPctMelhoria = safeDiv(vDepois - vAntes, vAntes);
    }
  }else{
    indPctMelhoria = reducaoTempoPct;
  }

  return { asis, tobe, custoImpl, manutAnual, horasExecEcon, horasMesEcon, horasAnoEcon, reducaoTempoPct,
    econMensalMO, econAnualMO, reducaoOutrosCustosAnual, economiaBrutaAnual, economiaLiquida1Ano,
    economiaLiquidaRecorrente, reducaoCustoPct, roi1Ano, paybackMeses, valorAcum12, valorAcum24,
    indPctMelhoria, indObj };
}
function computeTracking(row, proc){
  if(!proc) return null;
  const previstasAntes = proc.calc.asis.tempoMensal;
  const previstasDepois = proc.calc.tobe.tempoMensal;
  const horasReal = Number(row.horasReal)||0;
  const econHorasPrevista = previstasAntes - previstasDepois;
  const econHorasRealizada = previstasAntes - horasReal;
  const valorHora = proc.calc.asis.valorHora;
  const econFinPrevista = econHorasPrevista*valorHora;
  const econFinRealizada = econHorasRealizada*valorHora;
  const pctAtingimento = safeDiv(econFinRealizada, econFinPrevista);
  const desvio = econFinRealizada - econFinPrevista;
  return { previstasAntes, previstasDepois, horasReal, econHorasPrevista, econHorasRealizada, econFinPrevista, econFinRealizada, pctAtingimento, desvio };
}

/* ============================================================
   FORMATAÇÃO
============================================================ */
const fmtBRL = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0});
const fmtBRL1 = new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:1});
const fmtNum = new Intl.NumberFormat("pt-BR",{maximumFractionDigits:1});
const fmtPct = (v)=> (v*100).toLocaleString("pt-BR",{maximumFractionDigits:1})+"%";
function fmtHoras(v){ return fmtNum.format(v)+"h"; }
function fmtPayback(v){ return isFinite(v) && v>0 ? fmtNum.format(v)+" m" : "—"; }

/* ============================================================
   DADOS-SEMENTE
============================================================ */
function seedProcessos(){
  return [
    { id:"proc-001", frente:"Manufatura", setor:"Manufatura - Produção", nome:"Apontamento de Produção",
      responsavel:"Ana Souza", status:"Validado",
      asis:{unidade:"Minutos",tempo:25,pessoas:2,freq:3,periodicidade:"Diária",valorHora:35,outrosCustos:150,retrabalho:0.08},
      impl:{nome:"Apontamento Digital via Tablet",tipo:"Digitalização",dev:18000,aquis:6000,trein:2000,outros:1000,manutencao:300},
      tobe:{unidade:"Minutos",tempo:6,pessoas:1,freq:3,periodicidade:"Diária",valorHora:35,outrosCustos:40,retrabalho:0.01},
      indValorAntes:75, indValorDepois:18,
      validacao:"Validado", categoria:"Economia financeira realizada",
      obs:"Validado com dados de 3 meses de operação na aba Acompanhamento Mensal.", isSeed:true },
    { id:"proc-002", frente:"Manufatura", setor:"Manufatura - Qualidade", nome:"Inspeção de Qualidade Final",
      responsavel:"Carla Menezes", status:"Implementado",
      asis:{unidade:"Minutos",tempo:18,pessoas:1,freq:8,periodicidade:"Diária",valorHora:32,outrosCustos:80,retrabalho:0.12},
      impl:{nome:"Padronização do Checklist Digital",tipo:"Padronização",dev:9000,aquis:0,trein:1200,outros:500,manutencao:150},
      tobe:{unidade:"Minutos",tempo:10,pessoas:1,freq:8,periodicidade:"Diária",valorHora:32,outrosCustos:20,retrabalho:0.03},
      indValorAntes:240, indValorDepois:133,
      validacao:"Em validação", categoria:"Capacidade operacional liberada",
      obs:"Aguardando 2 meses adicionais de medição para validar retrabalho.", isSeed:true },
    { id:"proc-003", frente:"Engenharia", setor:"Engenharia - Processos", nome:"Emissão de Relatório de Processo",
      responsavel:"Diego Alves", status:"Validado",
      asis:{unidade:"Horas",tempo:6,pessoas:1,freq:1,periodicidade:"Mensal",valorHora:55,outrosCustos:0,retrabalho:0.05},
      impl:{nome:"Automação de Relatório com Power Query",tipo:"Automação",dev:15000,aquis:0,trein:800,outros:0,manutencao:100},
      tobe:{unidade:"Horas",tempo:0.5,pessoas:1,freq:1,periodicidade:"Mensal",valorHora:55,outrosCustos:0,retrabalho:0},
      indValorAntes:15, indValorDepois:0,
      validacao:"Validado", categoria:"Economia financeira realizada",
      obs:"Economia validada em 6 meses de operação.", isSeed:true },
    { id:"proc-004", frente:"Recursos Humanos", setor:"RH - Departamento Pessoal", nome:"Conferência de Ponto e Horas Extras",
      responsavel:"Equipe de Melhoria Contínua", status:"Em desenvolvimento",
      asis:{unidade:"Horas",tempo:10,pessoas:1,freq:1,periodicidade:"Mensal",valorHora:28,outrosCustos:0,retrabalho:0.15},
      impl:{nome:"Integração Ponto x Folha",tipo:"Integração de sistemas",dev:25000,aquis:8000,trein:1000,outros:0,manutencao:150},
      tobe:{unidade:"Horas",tempo:2,pessoas:1,freq:1,periodicidade:"Mensal",valorHora:28,outrosCustos:0,retrabalho:0.02},
      indValorAntes:25, indValorDepois:8,
      validacao:"Não validado", categoria:"Economia financeira potencial",
      obs:"Projeto ainda em desenvolvimento; valores são estimativas.", isSeed:true },
    { id:"proc-005", frente:"Recursos Humanos", setor:"RH - Recrutamento e Seleção", nome:"Triagem de Currículos",
      responsavel:"Ana Souza", status:"Planejado",
      asis:{unidade:"Minutos",tempo:8,pessoas:1,freq:40,periodicidade:"Mensal",valorHora:30,outrosCustos:0,retrabalho:0.05},
      impl:{nome:"Triagem Assistida por IA",tipo:"Inteligência artificial",dev:12000,aquis:4000,trein:600,outros:0,manutencao:80},
      tobe:{unidade:"Minutos",tempo:2,pessoas:1,freq:40,periodicidade:"Mensal",valorHora:30,outrosCustos:0,retrabalho:0.02},
      indValorAntes:30, indValorDepois:10,
      validacao:"Não validado", categoria:"Economia financeira potencial",
      obs:"Projeto planejado; iniciar medição após entrada em operação.", isSeed:true }
  ];
}
function seedAcompanhamentos(){
  return [
    { id:"tr-1", processoId:"proc-001", mes:"Abril", ano:2026, horasReal:5.8, evidencia:"Apontamento do sistema ERP", obs:"", isSeed:true },
    { id:"tr-2", processoId:"proc-001", mes:"Maio", ano:2026, horasReal:5.5, evidencia:"Apontamento do sistema ERP", obs:"", isSeed:true },
    { id:"tr-3", processoId:"proc-001", mes:"Junho", ano:2026, horasReal:5.2, evidencia:"Apontamento do sistema ERP", obs:"", isSeed:true },
    { id:"tr-4", processoId:"proc-003", mes:"Janeiro", ano:2026, horasReal:0.6, evidencia:"Apontamento do sistema ERP", obs:"", isSeed:true },
    { id:"tr-5", processoId:"proc-003", mes:"Fevereiro", ano:2026, horasReal:0.55, evidencia:"Apontamento do sistema ERP", obs:"", isSeed:true },
    { id:"tr-6", processoId:"proc-003", mes:"Março", ano:2026, horasReal:0.5, evidencia:"Apontamento do sistema ERP", obs:"", isSeed:true }
  ];
}

/* ============================================================
   ESTADO
============================================================ */
const state = {
  processos:[], acomp:[], filters:{frente:"",setor:"",status:"",search:""},
  procSort:"economia", dbReady:false, user:null, profile:null, users:[], currentView:"dashboard", editingTrackProcId:null,
  editingProcId:null, customFrentes:[], customSetores:{}, customStatus:[],
  customIndicadores:[], frenteIndicadores:{...BASE_FRENTE_INDICADORES},
  unsubProcessos:null, unsubAcomp:null, unsubParams:null, unsubProfile:null, unsubUsers:null
};
rebuildParamLists();

function withCalc(list){ return list.map(p=>({ ...p, calc: computeProcesso(p) })); }
function refreshCalcs(){ state.processos = withCalc(state.processos); render(); }

function isAdmin(){ return state.profile?.role === "admin" && state.profile?.active !== false; }
function canEdit(){
  if(!isFirebaseConfigured()) return true;
  return ["admin","editor"].includes(state.profile?.role) && state.profile?.active !== false;
}
function canDelete(){ return isAdmin(); }
function roleLabel(role){ return ({viewer:"Leitor",editor:"Editor",admin:"Administrador"})[role] || "Leitor"; }
function allowedFrentes(){
  const areas = Array.isArray(state.profile?.areas) ? state.profile.areas : ["*"];
  if(isAdmin() || areas.includes("*")) return [...FRENTES];
  return FRENTES.filter(f=>areas.includes(f));
}

function rebuildParamLists(){
  const fronts = [...new Set([
    ...BASE_FRENTES,
    ...Object.keys(BASE_SETORES),
    ...(state.customFrentes || []),
    ...state.processos.map(p => p.frente).filter(Boolean)
  ])];
  FRENTES.splice(0, FRENTES.length, ...fronts);

  Object.keys(SETORES).forEach(key => delete SETORES[key]);
  fronts.forEach(frente => {
    SETORES[frente] = [...new Set([
      ...(BASE_SETORES[frente] || []),
      ...((state.customSetores || {})[frente] || []),
      ...state.processos.filter(p => p.frente === frente).map(p => p.setor).filter(Boolean)
    ])];
  });

  STATUS_INICIATIVA.splice(0, STATUS_INICIATIVA.length, ...new Set([
    ...BASE_STATUS_INICIATIVA,
    ...(state.customStatus || []),
    ...state.processos.map(p => p.status).filter(Boolean)
  ]));
}

function getIndicadorPorFrente(frente){
  const configured = state?.frenteIndicadores?.[frente] || BASE_FRENTE_INDICADORES[frente];
  if(typeof configured === "string"){
    return CATALOGO_INDICADORES_PADRAO.find(indicador => indicador.id === configured) || CATALOGO_INDICADORES_PADRAO[0];
  }
  return configured || CATALOGO_INDICADORES_PADRAO[0];
}

/* ============================================================
   PERSISTÊNCIA — FIREBASE FIRESTORE
============================================================ */
function showFirebaseWarning(message){
  const box = document.getElementById("firebase-warning");
  if(!box) return;
  box.textContent = message || "";
  box.hidden = !message;
}

function updateAuthUI(user, profile=state.profile){
  state.user = user || null;
  const login = document.getElementById("btn-login");
  const logout = document.getElementById("btn-logout");
  const userBox = document.getElementById("auth-user");
  const email = document.getElementById("auth-user-email");
  const role = document.getElementById("auth-user-role");
  if(login) login.hidden = !!user;
  if(logout) logout.hidden = !user;
  if(userBox) userBox.hidden = !user;
  if(email) email.textContent = user ? (user.email || user.displayName || user.uid) : "";
  if(role) role.textContent = user && profile ? roleLabel(profile.role) : "";
  applyPermissionsUI();
}

function applyPermissionsUI(){
  const edit = canEdit();
  const admin = isAdmin();
  ["btn-add","btn-add-secondary"].forEach(id=>{ const el=document.getElementById(id); if(el) el.hidden=!edit; });
  const params = document.getElementById("btn-params");
  if(params) params.hidden = !admin;
  const tabAdmin = document.getElementById("tab-admin");
  if(tabAdmin) tabAdmin.hidden = !admin;
  const openParams = document.getElementById("btn-open-params");
  if(openParams) openParams.hidden = !admin;
  if(!admin && state.currentView === "admin") switchView("dashboard");
}

function stopDataSubscriptions(){
  ["unsubProcessos","unsubAcomp","unsubParams"].forEach(k=>{
    if(typeof state[k] === "function") state[k]();
    state[k] = null;
  });
}
function stopUserSubscriptions(){
  ["unsubProfile","unsubUsers"].forEach(k=>{
    if(typeof state[k] === "function") state[k]();
    state[k] = null;
  });
}
function stopFirebaseSubscriptions(){ stopDataSubscriptions(); stopUserSubscriptions(); }

function applyParametros(d={}){
  state.customFrentes = d.customFrentes || [];
  state.customSetores = d.customSetores || {};
  state.customStatus = d.customStatus || [];
  state.customIndicadores = d.customIndicadores || [];
  state.frenteIndicadores = d.frenteIndicadores || { ...BASE_FRENTE_INDICADORES };
  if(d.diasUteisPorMes){ MESES.forEach(m=>{ if(d.diasUteisPorMes[m]!=null) CONST.diasUteisPorMes[m] = d.diasUteisPorMes[m]; }); }
  if(d.jornadaDiaria!=null) CONST.jornadaDiaria = d.jornadaDiaria;
  rebuildParamLists();
  state.processos = withCalc(state.processos);
  refreshFilterOptions();
  initWizardStatic();
  renderParamModalLists();
  renderParamMonths();
  updatePremisesChip();
  render();
}

async function startFirebaseSubscriptions(profile){
  stopDataSubscriptions();
  if(typeof state.unsubUsers === "function") state.unsubUsers();
  state.unsubUsers = null;

  if(SEED_DEMO_DATA && isAdmin()){
    try{ await ensureDemoSeed(seedProcessos(), seedAcompanhamentos()); }catch(e){ console.warn("Falha ao criar dados demo",e); }
  }
  // state.unsubProcessos = subscribeProcessos(profile, (rows)=>{
  //   state.processos = withCalc(rows);
  //   setLive(true);
  //   render();
  // }, 

  state.unsubProcessos = subscribeProcessos(profile, (rows)=>{

  state.processos = withCalc(rows);

  // Reconstrói frentes e setores com base no que veio do Firebase.
  rebuildParamLists();

  // Atualiza os filtros com as novas frentes/setores.
  refreshFilterOptions();

  // Atualiza os campos da nova mensuração.
  initWizardStatic();

  setLive(true);

  render();

},
  
  (err)=>{ console.error(err); setLive(false); showFirebaseWarning("Não foi possível ler os processos autorizados. Verifique o perfil e as regras do Firestore."); });

  state.unsubAcomp = subscribeAcompanhamentos(profile, (rows)=>{
    state.acomp = rows;
    render();
  }, (err)=>{ console.error(err); setLive(false); });

  state.unsubParams = subscribeParametros((d)=>{
    applyParametros(d);
  }, (err)=>{ console.error(err); });

  if(isAdmin()){
    state.unsubUsers = subscribeUsuarios((rows)=>{
      state.users = rows;
      renderAdminUsers();
    }, (err)=>{ console.error(err); });
  }else{
    state.users = [];
    renderAdminUsers();
  }
}

async function initData(){
  if(!isFirebaseConfigured() || !firebaseAvailable()){
    // state.processos = withCalc(seedProcessos());
    // state.acomp = seedAcompanhamentos();
    // state.profile = { role:"admin", areas:["*"], active:true };
    state.processos = withCalc(seedProcessos());

state.acomp = seedAcompanhamentos();

state.profile = {
  role:"admin",
  areas:["*"],
  active:true
};

rebuildParamLists();

refreshFilterOptions();
    setLive(false);
    updateAuthUI(null);
    showFirebaseWarning("Firebase ainda não configurado. O painel está em modo demonstração local. Preencha js/firebase-config.js para salvar na nuvem.");
    render();
    return;
  }

  showFirebaseWarning("Entre com Google para carregar os dados do Firestore.");
  setLive(false);
  observeAuth(async (user)=>{
    if(!user){
      stopFirebaseSubscriptions();
      state.user = null;
      state.profile = null;
      state.users = [];
      state.processos = [];
      state.acomp = [];
      updateAuthUI(null, null);
      setLive(false);
      showFirebaseWarning("Entre com Google para acessar o painel salvo no Firebase.");
      render();
      return;
    }

    state.user = user;
    showFirebaseWarning("");
    try{
      const initialProfile = await ensureUserProfile();
      state.profile = initialProfile;
      updateAuthUI(user, initialProfile);

      if(typeof state.unsubProfile === "function") state.unsubProfile();
      state.unsubProfile = subscribeUserProfile(user.uid, async (profile)=>{
        state.profile = profile;
        updateAuthUI(user, profile);
        if(!profile || profile.active === false){
          stopDataSubscriptions();
          if(typeof state.unsubUsers === "function") state.unsubUsers();
          state.unsubUsers = null;
          state.processos = [];
          state.acomp = [];
          setLive(false);
          showFirebaseWarning("Seu acesso está desativado. Procure o administrador do painel.");
          render();
          return;
        }
        showFirebaseWarning("");
        await startFirebaseSubscriptions(profile);
      }, (err)=>{
        console.error(err);
        setLive(false);
        showFirebaseWarning("Não foi possível carregar seu perfil de acesso.");
      });
    }catch(e){
      console.error(e);
      setLive(false);
      showFirebaseWarning(e.message || "Falha ao preparar o perfil de acesso.");
    }
  });
}

function persistParametros(){
  const body = { customFrentes: state.customFrentes, customSetores: state.customSetores, customStatus: state.customStatus,
    customIndicadores: state.customIndicadores, frenteIndicadores: state.frenteIndicadores,
    diasUteisPorMes: CONST.diasUteisPorMes, jornadaDiaria: CONST.jornadaDiaria };
  if(!isFirebaseConfigured()) return;
  if(!state.user){ showToast("Faça login para salvar parâmetros no Firebase."); return; }
  if(!isAdmin()){ showToast("Somente administradores podem alterar parâmetros."); return; }
  saveParametros(body).catch(e=>{ console.error(e); showToast("Erro ao salvar parâmetros."); });
}
// function setLive(on){
//   state.dbReady = on;
//   const dot = document.getElementById("live-dot");
//   const txt = document.getElementById("live-text");
//   dot.classList.toggle("off", !on);
//   txt.textContent = on ? "sincronizado em tempo real" : (isFirebaseConfigured()?"desconectado":"modo demonstração");
// }

function setLive(on){

  state.dbReady = on;

  const dot = document.getElementById("live-dot");
  const indicator = dot?.closest(".live-indicator");
  const txt = document.getElementById("live-text");

  if(dot){
    dot.classList.toggle("off", !on);
  }

  let statusText = "";

  if(on){
    statusText = "Sincronizado em tempo real";
  }
  else if(isFirebaseConfigured()){
    statusText = "Desconectado";
  }
  else{
    statusText = "Modo demonstração";
  }

  /*
    O texto continua existindo escondido para não quebrar
    a estrutura, mas visualmente aparece somente a bolinha.
  */
  if(txt){
    txt.textContent = statusText;
  }

  /*
    Ao passar o mouse sobre a bolinha,
    o navegador informa o status.
  */
  if(indicator){
    indicator.title = statusText;
    indicator.setAttribute("aria-label", statusText);
  }
}

async function saveProcesso(p){
  let savedOnFb = false;
  if(isFirebaseConfigured()){
    if(!state.user){ showToast("Faça login com Google antes de salvar."); return; }
    if(!canEdit()){ showToast("Seu perfil é somente leitura."); return; }
    try{ 
      const res = await addProcesso(p); 
      if(res && res.id) p.id = res.id;
      savedOnFb = true;
    } catch(e){ console.error(e); }
  }
  if(!p.id) p.id = "local-"+Math.random().toString(36).slice(2,9);
  const procCalc = { ...p, calc: computeProcesso(p) };
  const idx = state.processos.findIndex(x=>x.id===p.id);
  if(idx>=0) state.processos[idx] = procCalc; else state.processos.unshift(procCalc);
  state.filters = { frente:"", setor:"", status:"", search:"" };
  showToast(savedOnFb ? "Processo salvo no Firebase!" : "Processo salvo no modo local/demonstração.");
  render();
}

async function updateProcesso(id, data){
  const existing = state.processos.find(p=>p.id===id);
  const body = { ...data, isSeed: existing ? !!existing.isSeed : false };
  let updatedFb = false;
  if(isFirebaseConfigured() && !id.startsWith("local-")){
    if(!state.user){ showToast("Faça login com Google antes de editar."); return; }
    if(!canEdit()){ showToast("Seu perfil é somente leitura."); return; }
    try{ await setProcesso(id, body); updatedFb = true; }
    catch(e){ console.error(e); }
  }
  state.processos = state.processos.map(p=> p.id===id ? { ...body, id, calc: computeProcesso(body) } : p);
  showToast(updatedFb ? "Processo atualizado no Firebase!" : "Processo atualizado.");
  render();
}

async function deleteProcesso(id){
  let deletedFb = false;
  if(isFirebaseConfigured() && !id.startsWith("local-")){
    if(!state.user){ showToast("Faça login com Google antes de excluir."); return; }
    if(!canDelete()){ showToast("Somente administradores podem excluir processos."); return; }
    try{ await removeProcesso(id); deletedFb = true; }
    catch(e){ console.error(e); }
  }
  state.processos = state.processos.filter(p=>p.id!==id);
  showToast(deletedFb ? "Processo removido do Firebase!" : "Processo removido.");
  render();
}

async function saveTracking(row){
  let savedFb = false;
  if(isFirebaseConfigured()){
    if(!state.user){ showToast("Faça login com Google antes de registrar."); return; }
    if(!canEdit()){ showToast("Seu perfil é somente leitura."); return; }
    try{ const res = await addAcompanhamento(row); if(res && res.id) row.id = res.id; savedFb = true; }
    catch(e){ console.error(e); }
  }
  if(!row.id) row.id = "local-"+Math.random().toString(36).slice(2,9);
  const idx = state.acomp.findIndex(x=>x.id===row.id);
  if(idx>=0) state.acomp[idx] = row; else state.acomp.push(row);
  showToast(savedFb ? "Acompanhamento salvo no Firebase!" : "Acompanhamento registrado.");
  render();
}

/* Toast */
function showToast(msg){
  const el = document.getElementById("toast");
  el.textContent = "✨ " + msg;
  el.hidden = false;
  setTimeout(()=>{ el.hidden = true; }, 3000);
}

/* ============================================================
   FILTROS
============================================================ */
function filteredProcessos(){
  const f = state.filters;
  return state.processos.filter(p=>{
    if(f.frente && p.frente!==f.frente) return false;
    if(f.setor && p.setor!==f.setor) return false;
    if(f.status && p.status!==f.status) return false;
    if(f.search){
      const s = f.search.toLowerCase();
      if(!(p.nome.toLowerCase().includes(s) || (p.responsavel||"").toLowerCase().includes(s))) return false;
    }
    return true;
  });
}

/* ============================================================
   TOOLTIP
============================================================ */
const tooltipEl = document.getElementById("tooltip");
function showTooltip(evt, html){
  tooltipEl.innerHTML = html;
  tooltipEl.hidden = false;
  positionTooltip(evt);
}
function positionTooltip(evt){
  const pad = 14;
  let x = evt.clientX + pad, y = evt.clientY + pad;
  const rect = tooltipEl.getBoundingClientRect();
  if(x + rect.width > window.innerWidth - 12) x = evt.clientX - rect.width - pad;
  if(y + rect.height > window.innerHeight - 12) y = evt.clientY - rect.height - pad;
  tooltipEl.style.left = x+"px";
  tooltipEl.style.top = y+"px";
}
function hideTooltip(){ tooltipEl.hidden = true; }

/* ============================================================
   CHARTS
============================================================ */
function renderScatter(list){
  const svg = document.getElementById("chart-scatter");
  const W=860,H=380, ML=68,MR=24,MT=18,MB=44;
  const plotW = W-ML-MR, plotH = H-MT-MB;
  if(!list.length){ svg.innerHTML = emptySvgMsg(W,H,"Nenhum processo no filtro atual"); document.getElementById("legend-scatter").innerHTML=""; return; }

  const xs = list.map(p=>p.calc.custoImpl);
  const ys = list.map(p=>p.calc.economiaBrutaAnual);
  const rs = list.map(p=>p.calc.horasAnoEcon);
  const xMax = Math.max(...xs, 1) * 1.15;
  const yMax = Math.max(...ys, 1) * 1.15;
  const yMin = Math.min(0, ...ys) * 1.15;
  const rMax = Math.max(...rs, 1);
  const xScale = v => ML + (v/xMax)*plotW;
  const yScale = v => MT + plotH - ((v-yMin)/(yMax-yMin))*plotH;
  const rScale = v => 7 + Math.sqrt(Math.max(v,0)/rMax)*26;

  let s = "";
  const yTicks = 5;
  for(let i=0;i<=yTicks;i++){
    const val = yMin + (yMax-yMin)*i/yTicks;
    const y = yScale(val);
    s += `<line class="grid-line" x1="${ML}" x2="${W-MR}" y1="${y}" y2="${y}"/>`;
    s += `<text x="${ML-10}" y="${y+4}" text-anchor="end" font-size="11">${fmtCompactBRL(val)}</text>`;
  }
  const xTicks = 5;
  for(let i=0;i<=xTicks;i++){
    const val = xMax*i/xTicks;
    const x = xScale(val);
    s += `<text x="${x}" y="${H-MB+22}" text-anchor="middle" font-size="11">${fmtCompactBRL(val)}</text>`;
  }
  s += `<line class="axis-line" x1="${ML}" x2="${W-MR}" y1="${H-MB}" y2="${H-MB}"/>`;
  s += `<line class="axis-line" x1="${ML}" x2="${ML}" y1="${MT}" y2="${H-MB}"/>`;
  s += `<text x="${ML+plotW/2}" y="${H-6}" text-anchor="middle" font-size="12" font-weight="600">Investimento (R$)</text>`;
  s += `<text x="18" y="${MT+plotH/2}" text-anchor="middle" font-size="12" font-weight="600" transform="rotate(-90 18 ${MT+plotH/2})">Economia Bruta Anual (R$)</text>`;

  if(xMax>0){
    const p1x=ML, p1y=yScale(0);
    const p2x=xScale(xMax), p2y=yScale(Math.min(xMax,yMax));
    s += `<line x1="${p1x}" y1="${p1y}" x2="${p2x}" y2="${p2y}" stroke="var(--ink-muted)" stroke-width="1.2" stroke-dasharray="4 4" opacity=".6"/>`;
    s += `<text x="${p2x-6}" y="${p2y-8}" text-anchor="end" font-size="10" fill="var(--ink-muted)">payback ≈ 12 meses</text>`;
  }
  s += `<line x1="${ML}" x2="${W-MR}" y1="${yScale(0)}" y2="${yScale(0)}" stroke="var(--ink-muted)" stroke-width="1"/>`;

  list.forEach((p,i)=>{
    const cx = xScale(p.calc.custoImpl), cy = yScale(p.calc.economiaBrutaAnual), r = rScale(p.calc.horasAnoEcon);
    const color = frenteHex(p.frente);
    s += `<circle data-i="${i}" cx="${cx}" cy="${cy}" r="${r}" fill="${color}" fill-opacity=".6" stroke="${color}" stroke-width="2" style="cursor:pointer;transition:transform 0.15s ease"/>`;
  });
  svg.innerHTML = s;

  svg.querySelectorAll("circle").forEach(c=>{
    const p = list[+c.dataset.i];
    c.addEventListener("mousemove", (e)=>{
      showTooltip(e, `<b>${p.nome}</b><br>
        <div class="tt-row"><span>Investimento</span><b>${fmtBRL.format(p.calc.custoImpl)}</b></div>
        <div class="tt-row"><span>Economia Bruta/Ano</span><b>${fmtBRL.format(p.calc.economiaBrutaAnual)}</b></div>
        <div class="tt-row"><span>Horas Econ./Ano</span><b>${fmtHoras(p.calc.horasAnoEcon)}</b></div>
        <div class="tt-row"><span>Payback</span><b>${fmtPayback(p.calc.paybackMeses)}</b></div>`);
    });
    c.addEventListener("mouseleave", hideTooltip);
  });

  document.getElementById("legend-scatter").innerHTML = allowedFrentes().map(f=>`
    <span class="legend-item"><span class="legend-swatch" style="background:${frenteHex(f)}"></span>${f}</span>`).join("")
    + `<span class="legend-item" style="margin-left:12px"><span style="width:10px;height:10px;border-radius:50%;border:1.5px solid var(--ink-muted);display:inline-block"></span>tamanho = horas economizadas/ano</span>`;
}

function fmtCompactBRL(v){
  if(Math.abs(v)>=1000) return "R$ "+(v/1000).toLocaleString("pt-BR",{maximumFractionDigits:0})+"k";
  return "R$ "+v.toFixed(0);
}
function emptySvgMsg(W,H,msg){ return `<text x="${W/2}" y="${H/2}" text-anchor="middle" font-size="13" fill="var(--ink-muted)">${msg}</text>`; }

function paybackStatus(v){
  if(!isFinite(v) || v<=0) return {cls:"chip-muted", color:"var(--ink-muted)"};
  if(v<=12) return {cls:"chip-good", color:"var(--good)"};
  if(v<=24) return {cls:"chip-warning", color:"var(--warning)"};
  return {cls:"chip-critical", color:"var(--critical)"};
}

function renderPaybackList(list){
  const el = document.getElementById("chart-payback");
  if(!list.length){ el.innerHTML = `<div class="empty-note">Nenhum processo no filtro atual.</div>`; return; }
  const sorted = [...list].sort((a,b)=> (isFinite(a.calc.paybackMeses)?a.calc.paybackMeses:9e9) - (isFinite(b.calc.paybackMeses)?b.calc.paybackMeses:9e9));
  const finiteMax = Math.max(...sorted.map(p=>isFinite(p.calc.paybackMeses)?p.calc.paybackMeses:0), 12);
  el.innerHTML = sorted.map(p=>{
    const v = p.calc.paybackMeses;
    const st = paybackStatus(v);
    const pct = isFinite(v) ? Math.min(100, (v/finiteMax)*100) : 100;
    return `<div class="barlist-row" data-id="${p.id}">
      <span class="rowlabel" title="${p.nome}"><span class="swatch" style="background:${frenteHex(p.frente)}"></span>${p.nome}</span>
      <div class="barlist-track"><div class="barlist-fill" style="width:${pct}%;background:${st.color}"></div></div>
      <span class="barlist-val">${fmtPayback(v)}</span>
    </div>`;
  }).join("");
  el.querySelectorAll(".barlist-row").forEach(row=>{
    const p = list.find(x=>x.id===row.dataset.id);
    row.addEventListener("mousemove",(e)=> showTooltip(e, `<b>${p.nome}</b><br>
      <div class="tt-row"><span>Payback</span><b>${fmtPayback(p.calc.paybackMeses)}</b></div>
      <div class="tt-row"><span>Investimento</span><b>${fmtBRL.format(p.calc.custoImpl)}</b></div>
      <div class="tt-row"><span>Economia Líquida/Ano</span><b>${fmtBRL.format(p.calc.economiaLiquidaRecorrente)}</b></div>`));
    row.addEventListener("mouseleave", hideTooltip);
  });
}

function renderFrenteChart(list){
  const svg = document.getElementById("chart-frente");
  const data = allowedFrentes().map(f=>({ frente:f, valor: sum(list.filter(p=>p.frente===f).map(p=>p.calc.economiaBrutaAnual)) }));
  const W=300,H=200, ML=10,MR=10,MT=14,MB=36;
  const plotW=W-ML-MR, plotH=H-MT-MB;
  const max = Math.max(...data.map(d=>d.valor),1)*1.15;
  const bw = plotW/data.length;
  let s = "";
  data.forEach((d,i)=>{
    const h = max? (d.valor/max)*plotH : 0;
    const x = ML + i*bw + bw*0.2;
    const y = MT + plotH - h;
    const w = bw*0.6;
    const color = frenteHex(d.frente);
    s += `<rect data-i="${i}" x="${x}" y="${y}" width="${w}" height="${Math.max(h,1)}" rx="6" fill="${color}" style="cursor:pointer"/>`;
    s += `<text x="${x+w/2}" y="${y-6}" text-anchor="middle" font-size="11" font-weight="600" class="mono-text">${fmtCompactBRL(d.valor)}</text>`;
    s += `<text x="${x+w/2}" y="${H-14}" text-anchor="middle" font-size="10" font-weight="500">${d.frente.replace("Recursos Humanos","RH")}</text>`;
  });
  s += `<line class="axis-line" x1="${ML}" x2="${W-MR}" y1="${MT+plotH}" y2="${MT+plotH}"/>`;
  svg.innerHTML = s;
  svg.querySelectorAll("rect").forEach(r=>{
    const d = data[+r.dataset.i];
    r.addEventListener("mousemove",(e)=> showTooltip(e, `<b>${d.frente}</b><br><div class="tt-row"><span>Economia Bruta/Ano</span><b>${fmtBRL.format(d.valor)}</b></div>`));
    r.addEventListener("mouseleave", hideTooltip);
  });
}

/*
function renderSetorListLegacy(list){
  const el = document.getElementById("chart-setor");
  if(!el) return;

  const mapa = {};

  list.forEach(p => {

    const setor =
      p.setor || "Não informado";

    if(!mapa[setor]){

      mapa[setor] = {

        setor,

        frente:p.frente,

        hh:0

      };

    }

    mapa[setor].hh +=
      Math.max(
        0,
        p.calc.horasAnoEcon
      );

  });

  const data =
    Object.values(mapa)
      .sort(
        (a,b) =>
          b.hh - a.hh
      );

  if(!data.length){

    el.innerHTML =
      `<div class="empty-note">
        Nenhum processo no filtro atual.
      </div>`;

    return;

  }

  const max =
    Math.max(
      ...data.map(d => d.hh),
      1
    );

  el.innerHTML =
    data.map(d => {

      const pct =
        safeDiv(
          d.hh,
          max
        ) * 100;

      return `

        <div class="barlist-row">

          <span
            class="rowlabel"
            title="${d.setor}"
          >
            ${d.setor.replace(/^.*? - /,"")}
          </span>

          <div class="barlist-track">

            <div
              class="barlist-fill"
              style="
                width:${pct}%;
                background:${frenteHex(d.frente)}
              "
            ></div>

          </div>

          <span class="barlist-val">
            ${fmtHoras(d.hh)}
          </span>

        </div>

      `;

    }).join("");

}
*/

const SEQ_BLUE = ["#dbeafe","#bfdbfe","#93c5fd","#60a5fa","#3b82f6","#2563eb","#1d4ed8","#1e40af","#1e3a8a"];
function statusRamp(n){
  const table = isDark() ? [...SEQ_BLUE].reverse() : SEQ_BLUE;
  if(n<=1) return [table[Math.floor(table.length/2)]];
  const steps = [];
  for(let i=0;i<n;i++){ steps.push(table[Math.round(i*(table.length-1)/(n-1))]); }
  return steps;
}
function renderStatusFunnel(list){
  const el = document.getElementById("chart-status");
  const order = statusOrder();
  const ramp = statusRamp(order.length);
  const counts = order.map(s=> list.filter(p=>p.status===s).length);
  const suspenso = list.filter(p=>p.status==="Suspenso").length;
  const max = Math.max(...counts, suspenso, 1);
  let html = order.map((s,i)=>{
    const c = counts[i];
    const pct = Math.max((c/max)*100, c>0?5:0);
    return `<div class="funnel-row">
      <span class="funnel-label">${s}</span>
      <div class="funnel-track"><div class="funnel-fill" style="width:${pct}%;background:${ramp[i]}"></div></div>
      <span class="funnel-count">${c}</span>
    </div>`;
  }).join("");
  if(suspenso>0){
    const pct = Math.max((suspenso/max)*100,5);
    html += `<div class="funnel-row" style="margin-top:6px">
      <span class="funnel-label" style="color:var(--critical)">Suspenso</span>
      <div class="funnel-track"><div class="funnel-fill" style="width:${pct}%;background:var(--critical)"></div></div>
      <span class="funnel-count">${suspenso}</span>
    </div>`;
  }
  el.innerHTML = html;
}

function monthKey(mes,ano){ return ano*100 + (MESES.indexOf(mes)+1); }
function renderTrend(){
  const svg = document.getElementById("chart-trend");
  const rows = state.acomp
    .map(r=>({ r, calc: computeTracking(r, state.processos.find(p=>p.id===r.processoId)) }))
    .filter(x=>x.calc);
  if(!rows.length){ svg.innerHTML = emptySvgMsg(620,260,"Nenhum acompanhamento registrado ainda"); return; }

  const byMonth = {};
  rows.forEach(({r,calc})=>{
    const k = monthKey(r.mes, r.ano);
    if(!byMonth[k]) byMonth[k] = { label: r.mes.slice(0,3)+"/"+String(r.ano).slice(2), previsto:0, realizado:0 };
    byMonth[k].previsto += calc.econFinPrevista;
    byMonth[k].realizado += calc.econFinRealizada;
  });
  const keys = Object.keys(byMonth).sort((a,b)=>a-b);
  const data = keys.map(k=>byMonth[k]);

  const W=620,H=260, ML=64,MR=20,MT=18,MB=36;
  const plotW=W-ML-MR, plotH=H-MT-MB;
  const allVals = data.flatMap(d=>[d.previsto,d.realizado]);
  const yMax = Math.max(...allVals,1)*1.2;
  const yMin = Math.min(0,...allVals);
  const xScale = i => data.length>1 ? ML + (i/(data.length-1))*plotW : ML+plotW/2;
  const yScale = v => MT + plotH - ((v-yMin)/(yMax-yMin||1))*plotH;

  let s = "";
  const yTicks=4;
  for(let i=0;i<=yTicks;i++){
    const val = yMin + (yMax-yMin)*i/yTicks;
    const y = yScale(val);
    s += `<line class="grid-line" x1="${ML}" x2="${W-MR}" y1="${y}" y2="${y}"/>`;
    s += `<text x="${ML-8}" y="${y+4}" text-anchor="end" font-size="10.5">${fmtCompactBRL(val)}</text>`;
  }
  data.forEach((d,i)=> s += `<text x="${xScale(i)}" y="${H-MB+20}" text-anchor="middle" font-size="10.5">${d.label}</text>`);

  function path(key, close){
    let d = data.map((pt,i)=> (i===0?"M":"L")+xScale(i)+","+yScale(pt[key])).join(" ");
    if(close){ d += ` L${xScale(data.length-1)},${yScale(yMin)} L${xScale(0)},${yScale(yMin)} Z`; }
    return d;
  }
  s += `<path d="${path('realizado',true)}" fill="var(--accent)" fill-opacity=".15" stroke="none"/>`;
  s += `<path d="${path('previsto',false)}" fill="none" stroke="var(--ink-muted)" stroke-width="2" stroke-dasharray="5 4"/>`;
  s += `<path d="${path('realizado',false)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  data.forEach((d,i)=>{
    s += `<circle data-i="${i}" cx="${xScale(i)}" cy="${yScale(d.previsto)}" r="9" fill="transparent" style="cursor:pointer"/>`;
    s += `<circle cx="${xScale(i)}" cy="${yScale(d.previsto)}" r="3.5" fill="var(--surface)" stroke="var(--ink-muted)" stroke-width="2"/>`;
    s += `<circle data-i="${i}" cx="${xScale(i)}" cy="${yScale(d.realizado)}" r="9" fill="transparent" style="cursor:pointer"/>`;
    s += `<circle cx="${xScale(i)}" cy="${yScale(d.realizado)}" r="4" fill="var(--accent)"/>`;
  });
  s += `<line class="axis-line" x1="${ML}" x2="${W-MR}" y1="${MT+plotH}" y2="${MT+plotH}"/>`;
  svg.innerHTML = s;

  svg.querySelectorAll("circle[data-i]").forEach(c=>{
    const d = data[+c.dataset.i];
    c.addEventListener("mousemove",(e)=>{
      const ating = d.previsto ? (d.realizado/d.previsto*100) : 0;
      showTooltip(e, `<b>${d.label}</b><br>
        <div class="tt-row"><span>Previsto</span><b>${fmtBRL.format(d.previsto)}</b></div>
        <div class="tt-row"><span>Realizado</span><b>${fmtBRL.format(d.realizado)}</b></div>
        <div class="tt-row"><span>Atingimento</span><b>${ating.toFixed(0)}%</b></div>`);
    });
    c.addEventListener("mouseleave", hideTooltip);
  });
}

/* ============================================================
   PROCESS CARDS
============================================================ */
let openDetailIds = new Set();
function sortProcessos(list){
  const s = state.procSort;
  const arr = [...list];
  if(s==="economia") arr.sort((a,b)=>b.calc.economiaBrutaAnual-a.calc.economiaBrutaAnual);
  else if(s==="roi") arr.sort((a,b)=>b.calc.roi1Ano-a.calc.roi1Ano);
  else if(s==="payback") arr.sort((a,b)=>(isFinite(a.calc.paybackMeses)?a.calc.paybackMeses:9e9)-(isFinite(b.calc.paybackMeses)?b.calc.paybackMeses:9e9));
  else if(s==="horas") arr.sort((a,b)=>b.calc.horasAnoEcon-a.calc.horasAnoEcon);
  else if(s==="nome") arr.sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
  return arr;
}
function statusChipClass(status){
  if(STATUS_CONCLUIDO.has(status)) return "chip-good";
  if(status==="Suspenso") return "chip-critical";
  if(["Em desenvolvimento","Em teste"].includes(status)) return "chip-warning";
  return "chip-muted";
}
function renderProcCards(list){
  document.getElementById("count-procs").textContent = list.length+" processo(s) exibido(s)";
  const grid = document.getElementById("proc-grid");
  const sorted = sortProcessos(list);
  if(!sorted.length){ grid.innerHTML = `<div class="empty-note">Nenhum processo corresponde aos filtros selecionados.</div>`; return; }

  grid.innerHTML = sorted.map(p=>{
    const c = p.calc;
    const roiCls = c.roi1Ano>=0 ? "good" : "critical";
    const isOpen = openDetailIds.has(p.id);
    const tracks = state.acomp.filter(t=>t.processoId===p.id).sort((a,b)=>monthKey(a.mes,a.ano)-monthKey(b.mes,b.ano));
    const asisBarMax = Math.max(p.calc.asis.custoAnualTotal, p.calc.tobe.custoAnualTotal, 1);
    return `<div class="proc-card" data-id="${p.id}">
      <div class="proc-card-top">
        <div>
          <div class="proc-name">${p.nome}</div>
          <div class="proc-chips">
            <span class="chip" style="background:${frenteHex(p.frente)}22;color:${frenteHex(p.frente)}"><span class="chip-dot" style="background:currentColor"></span>${p.frente}</span>
            <span class="chip chip-muted">${p.setor.replace(/^.*? - /,"")}</span>
            <span class="chip ${statusChipClass(p.status)}">${p.status}</span>
          </div>
        </div>
        <div class="proc-icon-actions">
          ${canEdit() ? `<button class="btn btn-ghost btn-sm edit-btn" data-id="${p.id}" title="Editar processo">✎ Editar</button>` : ``}
          ${canDelete() ? `<button class="btn btn-danger btn-sm del-btn" data-id="${p.id}" title="Excluir processo">✕</button>` : ``}
        </div>
      </div>
      <div class="proc-stats">
        <div><div class="proc-stat-label">Economia/ano</div><div class="proc-stat-val">${fmtCompactBRL(c.economiaBrutaAnual)}</div></div>
        <div><div class="proc-stat-label">ROI 1º ano</div><div class="proc-stat-val" style="color:var(--${roiCls})">${fmtPct(c.roi1Ano)}</div></div>
        <div><div class="proc-stat-label">Payback</div><div class="proc-stat-val">${fmtPayback(c.paybackMeses)}</div></div>
      </div>
      <div class="proc-actions">
        <button class="btn btn-ghost btn-sm toggle-btn" data-id="${p.id}">${isOpen?"Ocultar detalhes ▲":"Ver detalhes ▼"}</button>
        ${canEdit() ? `<button class="btn btn-ghost btn-sm track-btn" data-id="${p.id}">+ Registrar mês</button>` : ``}
      </div>
      <div class="proc-detail ${isOpen?'open':''}">
        <div class="compare-row">
          <span class="compare-label">Tempo/exec.</span>
          <div class="compare-bar-wrap">
            <div class="compare-bar-track"><div class="compare-bar-fill asis" style="width:${pct(c.asis.horasExec,Math.max(c.asis.horasExec,c.tobe.horasExec,0.001))}%"></div></div>
            <span class="compare-val">${fmtNum.format(c.asis.horasExec)}h → ${fmtNum.format(c.tobe.horasExec)}h</span>
          </div>
        </div>
        <div class="compare-row">
          <span class="compare-label">Custo Anual</span>
          <div class="compare-bar-wrap">
            <div class="compare-bar-track"><div class="compare-bar-fill tobe" style="width:${pct(c.tobe.custoAnualTotal,asisBarMax)}%"></div></div>
            <span class="compare-val">${fmtCompactBRL(c.asis.custoAnualTotal)} → ${fmtCompactBRL(c.tobe.custoAnualTotal)}</span>
          </div>
        </div>
        <div class="legend" style="margin-top:4px">
          <span class="legend-item"><span class="legend-swatch" style="background:var(--ink-muted)"></span>AS-IS (Anterior)</span>
          <span class="legend-item"><span class="legend-swatch" style="background:var(--accent)"></span>TO-BE (Novo)</span>
        </div>
        <table class="track-table">
          <thead><tr><th>Mês</th><th>Horas Real.</th><th>Econ. Prevista</th><th>Econ. Realizada</th><th>Ating.</th></tr></thead>
          <tbody>
          ${tracks.length? tracks.map(t=>{
            const tc = computeTracking(t, p);
            const atingCls = tc.pctAtingimento>=1 ? "good" : (tc.pctAtingimento>=0.85?"warning":"critical");
            return `<tr><td>${t.mes.slice(0,3)}/${t.ano}</td><td>${fmtNum.format(tc.horasReal)}h</td><td>${fmtCompactBRL(tc.econFinPrevista)}</td><td>${fmtCompactBRL(tc.econFinRealizada)}</td><td style="color:var(--${atingCls})">${(tc.pctAtingimento*100).toFixed(0)}%</td></tr>`;
          }).join("") : `<tr><td colspan="5" style="color:var(--ink-muted);font-family:'IBM Plex Sans',sans-serif">Sem acompanhamento mensal ainda.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  }).join("");

  grid.querySelectorAll(".toggle-btn").forEach(b=> b.addEventListener("click",()=>{
    const id=b.dataset.id;
    if(openDetailIds.has(id)) openDetailIds.delete(id); else openDetailIds.add(id);
    renderProcCards(filteredProcessos());
  }));
  grid.querySelectorAll(".track-btn").forEach(b=> b.addEventListener("click",()=> openTrackModal(b.dataset.id)));
  grid.querySelectorAll(".edit-btn").forEach(b=> b.addEventListener("click",()=>{
    const p = state.processos.find(x=>x.id===b.dataset.id);
    if(p) openWizardForEdit(p);
  }));
  grid.querySelectorAll(".del-btn").forEach(b=> b.addEventListener("click",()=>{
    const p = state.processos.find(x=>x.id===b.dataset.id);
    if(confirm(`Excluir o processo "${p?p.nome:''}"? Esta ação não pode ser desfeita.`)) deleteProcesso(b.dataset.id);
  }));
}
function pct(v,max){ return max? Math.min(100,(v/max)*100) : 0; }

/* ============================================================
   EXPORT CSV
============================================================ */
function exportCSV(){
  const list = filteredProcessos();
  if(!list.length){ alert("Nenhum processo para exportar."); return; }
  
  let csv = "ID;Frente;Setor;Nome do Processo;Responsavel;Status;Custo Implantacao (R$);Economia Anual Bruta (R$);Horas Economizadas Anual;Payback (Meses);ROI 1 Ano (%)\n";
  list.forEach(p => {
    const c = p.calc;
    csv += `"${p.id}";"${p.frente}";"${p.setor}";"${p.nome}";"${p.responsavel||''}";"${p.status}";${c.custoImpl};${c.economiaBrutaAnual};${c.horasAnoEcon.toFixed(1)};${isFinite(c.paybackMeses)?c.paybackMeses.toFixed(1):'N/A'};${(c.roi1Ano*100).toFixed(1)}\n`;
  });
  
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `melhorias_gertec_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Relatório CSV exportado!");
}

/* ============================================================
   FILTROS UI
============================================================ */
function refreshFilterSetorOptions(){
  const sSel = document.getElementById("f-setor");
  if(!sSel) return;
  const f = state.filters.frente;
  const opts = f ? (SETORES[f]||[]) : allowedFrentes().flatMap(fr=>SETORES[fr]||[]);
  const keep = sSel.value;
  sSel.innerHTML = `<option value="">Todos os setores</option>` + opts.map(s=>`<option value="${s}">${s.replace(/^.*? - /,"")}</option>`).join("");
  if(opts.includes(keep)) sSel.value = keep; else { sSel.value=""; state.filters.setor=""; }
}
function refreshFilterOptions(){
  const stSel = document.getElementById("f-status");
  if(!stSel) return;
  const keepSt = stSel.value;
  stSel.innerHTML = `<option value="">Todos os status</option>` + STATUS_INICIATIVA.map(s=>`<option value="${s}">${s}</option>`).join("");
  stSel.value = STATUS_INICIATIVA.includes(keepSt) ? keepSt : "";
  refreshFilterSetorOptions();
}
function populateFilterSelects(){
  refreshFilterOptions();
  const sSel = document.getElementById("f-setor");
  const stSel = document.getElementById("f-status");
  sSel.addEventListener("change",()=>{ state.filters.setor=sSel.value; render(); });
  stSel.addEventListener("change",()=>{ state.filters.status=stSel.value; render(); });
  document.getElementById("f-search").addEventListener("input",(e)=>{ state.filters.search=e.target.value; render(); });
  document.getElementById("f-clear").addEventListener("click",()=>{
    state.filters={frente:"",setor:"",status:"",search:""};
    refreshFilterSetorOptions(); sSel.value=""; stSel.value=""; document.getElementById("f-search").value="";
    render();
  });
  document.getElementById("proc-sort").addEventListener("change",(e)=>{ state.procSort=e.target.value; renderProcCards(filteredProcessos()); });
}

/* ============================================================
   RENDER PRINCIPAL
============================================================ */
function renderSidebarMenu(){
  const menuEl = document.getElementById("sidebar-menu");
  if(!menuEl) return;
  const currentFrente = state.filters.frente;

  const allCount = state.processos.length;
  const allConcluded = state.processos.filter(p=>STATUS_CONCLUIDO.has(p.status)).length;
  const allPct = allCount ? (allConcluded / allCount)*100 : 0;

  let html = `
    <div class="sidebar-item ${!currentFrente?'active':''}" data-frente="">
      <div class="sidebar-item-icon" style="background:var(--accent-wash);color:var(--accent)">🌐</div>
      <div class="sidebar-item-info">
        <div class="sidebar-item-name">Visão Geral</div>
        <div class="sidebar-item-sub">
          <span>Consolidado todas frentes</span>
        </div>
        <div class="mini-bar"><div class="mini-bar-fill" style="width:${allPct}%;background:var(--accent)"></div></div>
      </div>
      <span class="sidebar-item-badge">${allCount}</span>
    </div>
  `;

  allowedFrentes().forEach(f=>{
    const procsF = state.processos.filter(p=>p.frente===f);
    const count = procsF.length;
    const avgMelhoria = procsF.length ? avg(procsF.map(p=>p.calc.indPctMelhoria||0)) : 0;
    const barPct = Math.min(100, Math.max(0, avgMelhoria * 100));
    const color = frenteHex(f);
    const isActive = currentFrente === f;
    const indObj = getIndicadorPorFrente(f);

    html += `
      <div class="sidebar-item ${isActive?'active':''}" data-frente="${f}">
        <div class="sidebar-item-icon" style="background:${color}22;color:${color}">⚡</div>
        <div class="sidebar-item-info">
          <div class="sidebar-item-name">${f}</div>
          <div class="sidebar-item-sub" title="${indObj.nome}">
            <span>${indObj.unidade}</span> · <span>${fmtPct(avgMelhoria)}</span>
          </div>
          <div class="mini-bar"><div class="mini-bar-fill" style="width:${barPct}%;background:${color}"></div></div>
        </div>
        <span class="sidebar-item-badge">${count}</span>
      </div>
    `;
  });

  menuEl.innerHTML = html;

  menuEl.querySelectorAll(".sidebar-item").forEach(item=>{

  item.addEventListener("click",()=>{

    const frente = item.dataset.frente;

    state.filters.frente = frente;

    state.filters.setor = "";

    refreshFilterSetorOptions();

    render();

  });

});

  // menuEl.querySelectorAll(".sidebar-item").forEach(item=>{
  //   item.addEventListener("click",()=>{
  //     const f = item.dataset.frente;
  //     state.filters.frente = f;
  //     state.filters.setor = "";
  //     refreshFilterSetorOptions();
  //     render();
  //   });
  // });
}


function renderAcompanhamentoTable(){
  const body = document.getElementById("acomp-table-body");
  if(!body) return;
  const rows = state.acomp
    .map(r=>({ r, proc:state.processos.find(p=>p.id===r.processoId) }))
    .filter(x=>x.proc)
    .sort((a,b)=>monthKey(b.r.mes,b.r.ano)-monthKey(a.r.mes,a.r.ano));
  if(!rows.length){
    body.innerHTML = `<tr><td colspan="7" class="empty-note">Nenhum acompanhamento registrado para as áreas disponíveis.</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(({r,proc})=>{
    const c = computeTracking(r, proc);
    const ating = c?.pctAtingimento || 0;
    const cls = ating>=1 ? "good" : (ating>=0.85 ? "warning" : "critical");
    return `<tr>
      <td><div class="user-name">${proc.nome}</div></td>
      <td>${proc.frente}</td>
      <td>${r.mes.slice(0,3)}/${r.ano}</td>
      <td class="mono">${fmtNum.format(c.horasReal)}h</td>
      <td class="mono">${fmtBRL.format(c.econFinRealizada)}</td>
      <td class="mono" style="color:var(--${cls})">${fmtPct(ating)}</td>
      <td>${r.evidencia || "—"}</td>
    </tr>`;
  }).join("");
}

function renderAdminUsers(){
  const body = document.getElementById("admin-users-body");
  if(!body) return;
  if(!isAdmin()){
    body.innerHTML = `<tr><td colspan="5" class="empty-note">Área disponível somente para administradores.</td></tr>`;
    return;
  }
  if(!state.users.length){
    body.innerHTML = `<tr><td colspan="5" class="empty-note">Nenhum usuário encontrado.</td></tr>`;
    return;
  }
  body.innerHTML = state.users.map(u=>{
    const areas = Array.isArray(u.areas) ? u.areas : ["*"];
    const checks = [`<label class="area-check"><input type="checkbox" value="*" ${areas.includes("*")?"checked":""}> Todas</label>`]
      .concat(FRENTES.map(f=>`<label class="area-check"><input type="checkbox" value="${f}" ${areas.includes(f)?"checked":""}> ${f}</label>`)).join("");
    return `<tr data-user-id="${u.id}">
      <td><div class="user-name">${u.nome || "Usuário"}</div><div class="user-email">${u.email || "—"}</div></td>
      <td><select class="user-role"><option value="viewer" ${u.role==="viewer"?"selected":""}>Leitor</option><option value="editor" ${u.role==="editor"?"selected":""}>Editor</option><option value="admin" ${u.role==="admin"?"selected":""}>Administrador</option></select></td>
      <td><div class="area-checks">${checks}</div></td>
      <td><label class="active-switch"><input type="checkbox" class="user-active" ${u.active!==false?"checked":""}> <span>${u.active!==false?"Ativo":"Inativo"}</span></label></td>
      <td><button class="btn btn-sm save-user-access">Salvar</button></td>
    </tr>`;
  }).join("");

  body.querySelectorAll("tr[data-user-id]").forEach(row=>{
    const allCheck = row.querySelector('.area-check input[value="*"]');
    const otherChecks = [...row.querySelectorAll('.area-check input:not([value="*"])')];
    allCheck?.addEventListener("change",()=>{
      if(allCheck.checked) otherChecks.forEach(c=>c.checked=false);
    });
    otherChecks.forEach(c=>c.addEventListener("change",()=>{ if(c.checked && allCheck) allCheck.checked=false; }));
    const active = row.querySelector(".user-active");
    active?.addEventListener("change",()=>{ const span=row.querySelector(".active-switch span"); if(span) span.textContent=active.checked?"Ativo":"Inativo"; });
    row.querySelector(".save-user-access")?.addEventListener("click", async ()=>{
      const uid = row.dataset.userId;
      const role = row.querySelector(".user-role").value;
      let areas = [...row.querySelectorAll('.area-check input:checked')].map(c=>c.value);
      if(!areas.length) areas = [];
      if(areas.includes("*")) areas = ["*"];
      const activeVal = row.querySelector(".user-active").checked;
      try{
        await updateUserAccess(uid,{role,areas,active:activeVal});
        showToast("Permissões atualizadas.");
      }catch(e){ console.error(e); showToast("Não foi possível atualizar o acesso."); }
    });
  });
}

function switchView(view){
  if(view === "admin" && !isAdmin()) view = "dashboard";
  state.currentView = view;
  document.querySelectorAll("[data-view-panel]").forEach(panel=>{
    const active = panel.dataset.viewPanel === view;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll(".workspace-tab").forEach(tab=>tab.classList.toggle("active", tab.dataset.view === view));
  document
  .querySelectorAll(".sidebar-view-tab")
  .forEach(tab => {

    tab.classList.toggle(
      "active",
      tab.dataset.view === view
    );

  });
  
  const filterbar = document.getElementById("filterbar");
  if(filterbar) filterbar.hidden = view === "admin";
  if(view === "admin") renderAdminUsers();
  if(view === "acompanhamento") renderAcompanhamentoTable();
}

function wireWorkspaceNavigation(){

  /*
    Navegação horizontal:
    - Visão Executiva
    - AS-IS × TO-BE
    - Acompanhamento
  */
  document
    .querySelectorAll(".workspace-tab")
    .forEach(tab => {

      tab.addEventListener("click", () => {
        switchView(tab.dataset.view);
      });

    });


  /*
    Administração fica na lateral.
  */
  document
    .querySelectorAll(".sidebar-view-tab")
    .forEach(tab => {

      tab.addEventListener("click", () => {
        switchView(tab.dataset.view);
      });

    });


  document
    .getElementById("btn-add-secondary")
    ?.addEventListener("click", () => {

      if(canEdit()){
        openWizardForNew();
      }
      else{
        showToast("Seu perfil é somente leitura.");
      }

    });


  document
    .getElementById("btn-open-params")
    ?.addEventListener("click", () => {

      if(isAdmin()){
        openParamsModal();
      }

    });

}

function render(){

  renderSidebarMenu();

  const list =
    filteredProcessos();

  renderKPIs(list);

  renderAsIsToBe(list);

  renderHHLiberadas(list);

  renderSetorList(list);

  renderStatusFunnel(list);

  renderTrend();

  renderProcCards(list);

  renderAcompanhamentoTable();

  renderAdminUsers();

  applyPermissionsUI();

}

/* ============================================================
   WIZARD MODAL
============================================================ */
function fillSelect(id, options, selected){
  const el = document.getElementById(id);
  el.innerHTML = options.map(o=>`<option value="${o}" ${o===selected?"selected":""}>${o}</option>`).join("");
}
function initWizardStatic(){
  const fronts = allowedFrentes().length ? allowedFrentes() : FRENTES;
  fillSelect("w-frente", fronts, fronts[0]);
  fillSelect("w-setor", SETORES[fronts[0]] || []);
  fillSelect("w-status", STATUS_INICIATIVA, "Planejado");
  fillSelect("w-asis-unidade", UNIDADES_TEMPO, "Minutos");
  fillSelect("w-asis-periodicidade", PERIODICIDADES, "Diária");
  fillSelect("w-melhoria-tipo", TIPOS_MELHORIA, TIPOS_MELHORIA[0]);
  fillSelect("w-tobe-periodicidade", PERIODICIDADES, "Diária");
  fillSelect("w-validacao", STATUS_VALIDACAO, "Não validado");
  fillSelect("w-categoria", CATEGORIAS_BENEFICIO, "Economia financeira potencial");
}
function readWizardForm(){
  const num = id => {
    const el = document.getElementById(id);
    return el && el.value !== "" ? Number(el.value) : 0;
  };
  const val = id => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  const vAntesEl = document.getElementById("w-ind-antes");
  const vDepoisEl = document.getElementById("w-ind-depois");
  return {
    frente: val("w-frente"), setor: val("w-setor"), nome: val("w-nome").trim(),
    responsavel: val("w-responsavel").trim(), status: val("w-status"),
    asis: { unidade:val("w-asis-unidade"), tempo:num("w-asis-tempo"), pessoas:num("w-asis-pessoas"),
      freq:num("w-asis-freq"), periodicidade:val("w-asis-periodicidade"), valorHora:num("w-asis-valorhora"),
      outrosCustos:num("w-asis-outros"), retrabalho:num("w-asis-retrabalho")/100 },
    impl: { nome:val("w-melhoria-nome").trim(), tipo:val("w-melhoria-tipo"), dev:num("w-impl-dev"),
      aquis:num("w-impl-aquis"), trein:num("w-impl-trein"), outros:num("w-impl-outros"), manutencao:num("w-impl-manutencao") },
    tobe: { unidade:val("w-asis-unidade"), tempo:num("w-tobe-tempo"), pessoas:num("w-tobe-pessoas"),
      freq:num("w-tobe-freq"), periodicidade:val("w-tobe-periodicidade")||val("w-asis-periodicidade"),
      valorHora: num("w-tobe-valorhora")||num("w-asis-valorhora"), outrosCustos:num("w-tobe-outros"), retrabalho:num("w-tobe-retrabalho")/100 },
    indValorAntes: vAntesEl && vAntesEl.value !== "" ? Number(vAntesEl.value) : undefined,
    indValorDepois: vDepoisEl && vDepoisEl.value !== "" ? Number(vDepoisEl.value) : undefined,
    validacao: val("w-validacao"), categoria: val("w-categoria"), obs: val("w-obs").trim()
  };
}
function updateWizardPreview(){
  const data = readWizardForm();
  const calc = computeProcesso(data);
  const el = document.getElementById("wizard-preview");
  const roiCls = calc.roi1Ano>=0 ? "good":"critical";
  
  const indObj = getIndicadorPorFrente(data.frente);
  const indNameEl = document.getElementById("w-ind-name");
  const indUnitEl = document.getElementById("w-ind-unit");
  const lblAntes = document.getElementById("w-lbl-ind-antes");
  const lblDepois = document.getElementById("w-lbl-ind-depois");
  const indPctEl = document.getElementById("w-ind-pct-val");
  
  if(indNameEl) indNameEl.textContent = indObj.nome;
  if(indUnitEl) indUnitEl.textContent = indObj.unidade + " (" + (indObj.direcao==="menor"?"menor é melhor":"maior é melhor") + ")";
  if(lblAntes) lblAntes.textContent = indObj.unidade;
  if(lblDepois) lblDepois.textContent = indObj.unidade;
  if(indPctEl) indPctEl.textContent = fmtPct(calc.indPctMelhoria);

  el.innerHTML = `
    <div class="preview-item"><span class="l">Economia Anual</span><span class="v">${fmtBRL.format(calc.economiaBrutaAnual)}</span></div>
    <div class="preview-item"><span class="l">Horas Econ./Ano</span><span class="v">${fmtHoras(calc.horasAnoEcon)}</span></div>
    <div class="preview-item"><span class="l">ROI 1º Ano</span><span class="v" style="color:var(--${roiCls})">${fmtPct(calc.roi1Ano)}</span></div>
    <div class="preview-item"><span class="l">Payback</span><span class="v">${fmtPayback(calc.paybackMeses)}</span></div>
    <div class="preview-item"><span class="l">Melhoria Indicador</span><span class="v" style="color:var(--accent)">${fmtPct(calc.indPctMelhoria)}</span></div>`;
}
function fillWizardForm(p){
  fillSelect("w-frente", FRENTES, p.frente);
  fillSelect("w-setor", SETORES[p.frente] || [], p.setor);
  document.getElementById("w-nome").value = p.nome || "";
  document.getElementById("w-responsavel").value = p.responsavel || "";
  fillSelect("w-status", STATUS_INICIATIVA, p.status);
  fillSelect("w-asis-unidade", UNIDADES_TEMPO, p.asis.unidade);
  document.getElementById("w-asis-tempo").value = p.asis.tempo;
  document.getElementById("w-asis-pessoas").value = p.asis.pessoas;
  document.getElementById("w-asis-freq").value = p.asis.freq;
  fillSelect("w-asis-periodicidade", PERIODICIDADES, p.asis.periodicidade);
  document.getElementById("w-asis-valorhora").value = p.asis.valorHora;
  document.getElementById("w-asis-outros").value = p.asis.outrosCustos;
  document.getElementById("w-asis-retrabalho").value = Math.round((p.asis.retrabalho||0)*1000)/10;
  document.getElementById("w-melhoria-nome").value = (p.impl && p.impl.nome) || "";
  fillSelect("w-melhoria-tipo", TIPOS_MELHORIA, p.impl && p.impl.tipo);
  document.getElementById("w-impl-manutencao").value = p.impl.manutencao || 0;
  document.getElementById("w-impl-dev").value = p.impl.dev || 0;
  document.getElementById("w-impl-aquis").value = p.impl.aquis || 0;
  document.getElementById("w-impl-trein").value = p.impl.trein || 0;
  document.getElementById("w-impl-outros").value = p.impl.outros || 0;
  document.getElementById("w-tobe-tempo").value = p.tobe.tempo;
  document.getElementById("w-tobe-pessoas").value = p.tobe.pessoas;
  document.getElementById("w-tobe-freq").value = p.tobe.freq;
  fillSelect("w-tobe-periodicidade", PERIODICIDADES, p.tobe.periodicidade);
  document.getElementById("w-tobe-valorhora").value = p.tobe.valorHora;
  document.getElementById("w-tobe-outros").value = p.tobe.outrosCustos;
  document.getElementById("w-tobe-retrabalho").value = Math.round((p.tobe.retrabalho||0)*1000)/10;
  
  const vAntesEl = document.getElementById("w-ind-antes");
  const vDepoisEl = document.getElementById("w-ind-depois");
  if(vAntesEl) vAntesEl.value = p.indValorAntes !== undefined ? p.indValorAntes : "";
  if(vDepoisEl) vDepoisEl.value = p.indValorDepois !== undefined ? p.indValorDepois : "";

  fillSelect("w-validacao", STATUS_VALIDACAO, p.validacao);
  fillSelect("w-categoria", CATEGORIAS_BENEFICIO, p.categoria);
  document.getElementById("w-obs").value = p.obs || "";
}
function openWizardForNew(){
  if(isFirebaseConfigured() && !canEdit()){ showToast("Seu perfil é somente leitura."); return; }
  state.editingProcId = null;
  document.getElementById("wizard-title").textContent = "Nova mensuração de melhoria";
  document.getElementById("wizard-save").textContent = "Salvar mensuração";
  resetWizardForm();
  document.getElementById("wizard-overlay").hidden = false;
  document.getElementById("wizard-banner").hidden = true;
  updateWizardPreview();
}
function openWizardForEdit(p){
  state.editingProcId = p.id;
  document.getElementById("wizard-title").textContent = "Editar mensuração";
  document.getElementById("wizard-save").textContent = "Salvar alterações";
  fillWizardForm(p);
  document.getElementById("wizard-overlay").hidden = false;
  document.getElementById("wizard-banner").hidden = true;
  updateWizardPreview();
}
function closeWizard(){ document.getElementById("wizard-overlay").hidden = true; state.editingProcId = null; }
function resetWizardForm(){
  ["w-nome","w-responsavel","w-asis-tempo","w-asis-freq","w-asis-valorhora","w-melhoria-nome",
   "w-impl-dev","w-impl-aquis","w-impl-trein","w-impl-outros","w-impl-manutencao","w-tobe-tempo","w-tobe-freq","w-tobe-valorhora","w-ind-antes","w-ind-depois","w-obs"]
   .forEach(id=> { const el = document.getElementById(id); if(el) el.value = ""; });
  document.getElementById("w-asis-pessoas").value=1;
  document.getElementById("w-asis-outros").value=0;
  document.getElementById("w-asis-retrabalho").value=0;
  document.getElementById("w-tobe-pessoas").value=1;
  document.getElementById("w-tobe-outros").value=0;
  document.getElementById("w-tobe-retrabalho").value=0;
  initWizardStatic();
  updateWizardPreview();
}
function wireWizard(){
  document.getElementById("w-frente").addEventListener("change",(e)=>{
    fillSelect("w-setor", SETORES[e.target.value]);
  });
  document.getElementById("btn-add").addEventListener("click", openWizardForNew);
  document.getElementById("wizard-close").addEventListener("click", closeWizard);
  document.getElementById("wizard-cancel").addEventListener("click", closeWizard);
  document.getElementById("wizard-overlay").addEventListener("click",(e)=>{ if(e.target.id==="wizard-overlay") closeWizard(); });
  document.getElementById("wizard-body").addEventListener("input", updateWizardPreview);
  document.getElementById("wizard-body").addEventListener("change", updateWizardPreview);
  document.getElementById("wizard-save").addEventListener("click", async ()=>{
    const data = readWizardForm();
    const banner = document.getElementById("wizard-banner");
    const bannerText = document.getElementById("wizard-banner-text");
    const requiredIds = ["w-nome","w-asis-tempo","w-asis-freq","w-asis-valorhora","w-tobe-tempo","w-tobe-freq"];
    const missing = requiredIds.some(id => document.getElementById(id).value === "");
    if(missing){
      bannerText.textContent = "Preencha o nome do processo e os campos obrigatórios (*) dos cenários AS-IS e TO-BE. O valor zero é aceito quando representar o cenário real.";
      banner.hidden = false;
      return;
    }
    if(state.editingProcId){
      await updateProcesso(state.editingProcId, data);
    }else{
      await saveProcesso(data);
    }
    state.editingProcId = null;
    closeWizard();
  });
}

/* ============================================================
   TRACK MODAL
============================================================ */
function openTrackModal(procId){
  state.editingTrackProcId = procId;
  const p = state.processos.find(x=>x.id===procId);
  document.getElementById("track-proc-name").textContent = p ? p.nome : "";
  fillSelect("t-mes", MESES, MESES[0]);
  document.getElementById("t-ano").value = 2026;
  document.getElementById("t-horas").value = "";
  document.getElementById("t-evidencia").value = "";
  document.getElementById("t-obs").value = "";
  document.getElementById("track-overlay").hidden = false;
  updateTrackPreview();
}
function closeTrackModal(){ document.getElementById("track-overlay").hidden = true; }
function updateTrackPreview(){
  const p = state.processos.find(x=>x.id===state.editingTrackProcId);
  const horas = Number(document.getElementById("t-horas").value)||0;
  const el = document.getElementById("track-preview");
  if(!p){ el.innerHTML=""; return; }
  const tc = computeTracking({ horasReal: horas }, p);
  const atingCls = tc.pctAtingimento>=1 ? "good" : (tc.pctAtingimento>=0.85?"warning":"critical");
  el.innerHTML = `
    <div class="preview-item"><span class="l">Economia Prevista</span><span class="v">${fmtBRL.format(tc.econFinPrevista)}</span></div>
    <div class="preview-item"><span class="l">Economia Realizada</span><span class="v">${fmtBRL.format(tc.econFinRealizada)}</span></div>
    <div class="preview-item"><span class="l">Atingimento</span><span class="v" style="color:var(--${atingCls})">${(tc.pctAtingimento*100).toFixed(0)}%</span></div>`;
}
function wireTrackModal(){
  document.getElementById("track-close").addEventListener("click", closeTrackModal);
  document.getElementById("track-cancel").addEventListener("click", closeTrackModal);
  document.getElementById("track-overlay").addEventListener("click",(e)=>{ if(e.target.id==="track-overlay") closeTrackModal(); });
  document.getElementById("t-horas").addEventListener("input", updateTrackPreview);
  document.getElementById("track-save").addEventListener("click", async ()=>{
    const horas = document.getElementById("t-horas").value;
    if(horas===""){ alert("Informe as horas efetivamente consumidas no mês."); return; }
    const procAtual = state.processos.find(p=>p.id===state.editingTrackProcId);
    const row = {
      processoId: state.editingTrackProcId,
      frente: procAtual?.frente || "",
      mes: document.getElementById("t-mes").value,
      ano: Number(document.getElementById("t-ano").value)||2026,
      horasReal: Number(horas)||0,
      evidencia: document.getElementById("t-evidencia").value.trim(),
      obs: document.getElementById("t-obs").value.trim()
    };
    await saveTracking(row);
    closeTrackModal();
  });
}

/* ============================================================
   PARÂMETROS MODAL
============================================================ */
function updatePremisesChip(){
  const vals = MESES.map(m=>Number(CONST.diasUteisPorMes[m])||0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const diasTxt = min===max ? `${min} dias úteis/mês` : `${min}–${max} dias úteis/mês`;
  document.getElementById("premises-chip").textContent = `📅 ${diasTxt} · ⏱️ ${CONST.jornadaDiaria}h/dia · 12 meses/ano`;
}
function renderParamModalLists(){
  const fl = document.getElementById("param-frentes-list");
  fl.innerHTML = BASE_FRENTES.map(f=>`<div class="param-list-item"><span>${f}</span><span class="tag">padrão</span></div>`).join("")
    + state.customFrentes.map(f=>`<div class="param-list-item"><span>${f}</span><button class="rm" data-kind="frente" data-val="${f}">remover</button></div>`).join("");

  let setorRows = "";
  FRENTES.forEach(f=>{
    (BASE_SETORES[f]||[]).forEach(s=> setorRows += `<div class="param-list-item"><span>${s}</span><span class="tag">padrão</span></div>`);
    (state.customSetores[f]||[]).forEach(s=> setorRows += `<div class="param-list-item"><span>${s} <span style="color:var(--ink-muted)">· ${f}</span></span><button class="rm" data-kind="setor" data-frente="${f}" data-val="${s}">remover</button></div>`);
  });
  document.getElementById("param-setores-list").innerHTML = setorRows;
  fillSelect("param-setor-frente", FRENTES);

  const stl = document.getElementById("param-status-list");
  stl.innerHTML = BASE_STATUS_INICIATIVA.map(s=>`<div class="param-list-item"><span>${s}</span><span class="tag">padrão</span></div>`).join("")
    + state.customStatus.map(s=>`<div class="param-list-item"><span>${s}</span><button class="rm" data-kind="status" data-val="${s}">remover</button></div>`).join("");

  const indListEl = document.getElementById("param-frente-ind-list");
  if(indListEl){
    const catalogo = getCatalogoIndicadores();
    indListEl.innerHTML = FRENTES.map(f=>{
      const currentInd = getIndicadorPorFrente(f);
      const optionsHtml = catalogo.map(i=>`<option value="${i.id}" ${i.id===currentInd.id?"selected":""}>${i.nome} (${i.unidade})</option>`).join("");
      return `
        <div class="param-list-item" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <span style="font-weight:600;min-width:140px">${f}</span>
          <select class="param-frente-ind-select" data-frente="${f}" style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:6px 10px;font-size:12.5px">
            ${optionsHtml}
          </select>
        </div>`;
    }).join("");
  }
}
function renderParamMonths(){
  const el = document.getElementById("param-months");
  el.innerHTML = MESES.map(m=>`<div class="month-row"><label>${m}</label><input type="number" min="0" max="31" step="1" data-month="${m}" value="${CONST.diasUteisPorMes[m]}"></div>`).join("");
  document.getElementById("param-jornada").value = CONST.jornadaDiaria;
}
function openParamsModal(){
  if(isFirebaseConfigured() && !isAdmin()){ showToast("Somente administradores podem alterar parâmetros."); return; }
  renderParamModalLists();
  renderParamMonths();
  document.getElementById("params-overlay").hidden = false;
}
function closeParamsModal(){ document.getElementById("params-overlay").hidden = true; }
function wireParamsModal(){
  document.getElementById("btn-params").addEventListener("click", openParamsModal);
  document.getElementById("params-close").addEventListener("click", closeParamsModal);
  document.getElementById("params-cancel").addEventListener("click", closeParamsModal);
  document.getElementById("params-overlay").addEventListener("click",(e)=>{ if(e.target.id==="params-overlay") closeParamsModal(); });

  document.getElementById("param-frente-add").addEventListener("click",()=>{
    const input = document.getElementById("param-frente-new");
    const val = input.value.trim();
    if(!val || FRENTES.includes(val)) return;
    state.customFrentes.push(val);
    state.customSetores[val] = state.customSetores[val] || [];
    input.value = "";
    rebuildParamLists(); persistParametros(); refreshFilterOptions(); initWizardStatic();
    renderParamModalLists(); refreshCalcs();
  });
  document.getElementById("param-setor-add").addEventListener("click",()=>{
    const frente = document.getElementById("param-setor-frente").value;
    const input = document.getElementById("param-setor-new");
    const val = input.value.trim();
    if(!val || !frente || (SETORES[frente]||[]).includes(val)) return;
    state.customSetores[frente] = state.customSetores[frente] || [];
    state.customSetores[frente].push(val);
    input.value = "";
    rebuildParamLists(); persistParametros(); refreshFilterOptions(); initWizardStatic();
    renderParamModalLists(); refreshCalcs();
  });
  document.getElementById("param-status-add").addEventListener("click",()=>{
    const input = document.getElementById("param-status-new");
    const val = input.value.trim();
    if(!val || STATUS_INICIATIVA.includes(val)) return;
    state.customStatus.push(val);
    input.value = "";
    rebuildParamLists(); persistParametros(); refreshFilterOptions(); initWizardStatic();
    renderParamModalLists(); refreshCalcs();
  });

  const indAddBtn = document.getElementById("param-ind-add");
  if(indAddBtn){
    indAddBtn.addEventListener("click",()=>{
      const nomeEl = document.getElementById("param-ind-nome");
      const uniEl = document.getElementById("param-ind-unidade");
      const dirEl = document.getElementById("param-ind-direcao");
      const nome = nomeEl.value.trim();
      const unidade = uniEl.value.trim();
      const direcao = dirEl.value;
      if(!nome || !unidade) return;
      const newInd = { id: "ind-custom-"+Math.random().toString(36).slice(2,8), nome, unidade, direcao, padrao:false };
      state.customIndicadores.push(newInd);
      nomeEl.value = ""; uniEl.value = "";
      persistParametros(); renderParamModalLists(); refreshCalcs();
    });
  }

  document.querySelectorAll(".param-list").forEach(list=>{
    list.addEventListener("click",(e)=>{
      const btn = e.target.closest(".rm");
      if(!btn) return;
      const kind = btn.dataset.kind, val = btn.dataset.val;
      if(kind==="frente"){
        state.customFrentes = state.customFrentes.filter(f=>f!==val);
        delete state.customSetores[val];
      }else if(kind==="setor"){
        const frente = btn.dataset.frente;
        state.customSetores[frente] = (state.customSetores[frente]||[]).filter(s=>s!==val);
      }else if(kind==="status"){
        state.customStatus = state.customStatus.filter(s=>s!==val);
      }
      rebuildParamLists(); persistParametros(); refreshFilterOptions(); initWizardStatic();
      renderParamModalLists(); refreshCalcs();
    });
  });
  document.getElementById("params-save").addEventListener("click",()=>{
    const monthInputs = document.querySelectorAll("#param-months input[data-month]");
    monthInputs.forEach(inp=>{ CONST.diasUteisPorMes[inp.dataset.month] = Number(inp.value)||0; });
    CONST.jornadaDiaria = Number(document.getElementById("param-jornada").value)||CONST.jornadaDiaria;
    
    document.querySelectorAll(".param-frente-ind-select").forEach(sel=>{
      const f = sel.dataset.frente;
      state.frenteIndicadores[f] = sel.value;
    });

    persistParametros();
    updatePremisesChip();
    refreshCalcs();
    closeParamsModal();
  });
}

/* Firebase Auth */
const loginBtnEl = document.getElementById("btn-open-login") || document.getElementById("btn-login");
if(loginBtnEl){
  loginBtnEl.addEventListener("click", async ()=>{
    try{ await loginGoogle(); }
    catch(e){ console.error(e); showFirebaseWarning("Falha no login Google: " + (e.message || e)); }
  });
}
document.getElementById("btn-logout").addEventListener("click", async ()=>{
  try{ await logoutGoogle(); }
  catch(e){ console.error(e); }
});

/* Export Listener */
document.getElementById("btn-export").addEventListener("click", exportCSV);

/* ============================================================
   TEMA
============================================================ */
function initTheme(){
  const btn = document.getElementById("btn-theme");
  if(!btn) return;
  const stored = localStorage.getItem("painel-theme");
  if(stored === "light" || stored === "dark") document.documentElement.setAttribute("data-theme", stored);

  function syncLabel(){
    btn.textContent = isDark() ? "☀️ Tema" : "🌙 Tema";
  }
  syncLabel();

  btn.addEventListener("click", ()=>{
    const next = isDark() ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("painel-theme", next);
    syncLabel();
    render();
  });
}

/* ============================================================
   SIDEBAR — ABRIR / FECHAR
============================================================ */

function initSidebar(){

  const btn = document.getElementById("btn-sidebar-toggle");

  if(!btn) return;


  /*
    Em desktop o menu começa aberto.

    Em celular ele começa fechado para não cobrir
    todo o conteúdo.
  */
  const isMobile = window.innerWidth <= 760;

  let collapsed;


  /*
    Se já existir preferência salva, usamos ela.
    Caso contrário usamos o comportamento padrão.
  */
  const saved = localStorage.getItem("painel-sidebar-collapsed");

  if(saved === "true"){
    collapsed = true;
  }
  else if(saved === "false"){
    collapsed = false;
  }
  else{
    collapsed = isMobile;
  }


  function applySidebarState(){

    document.body.classList.toggle(
      "sidebar-collapsed",
      collapsed
    );

    btn.setAttribute(
      "aria-expanded",
      String(!collapsed)
    );

    btn.title = collapsed
      ? "Mostrar menu lateral"
      : "Ocultar menu lateral";
  }


  applySidebarState();


  btn.addEventListener("click", ()=>{

    collapsed = !collapsed;

    localStorage.setItem(
      "painel-sidebar-collapsed",
      String(collapsed)
    );

    applySidebarState();

  });


  /*
    Em celular, ao selecionar uma frente ou uma página,
    fechamos automaticamente a sidebar.
  */
  document.getElementById("main-sidebar")
    ?.addEventListener("click", e => {

      if(window.innerWidth > 760) return;

      const navigationItem = e.target.closest(
        ".sidebar-item, .workspace-tab"
      );

      if(!navigationItem) return;

      collapsed = true;

      localStorage.setItem(
        "painel-sidebar-collapsed",
        "true"
      );

      applySidebarState();

    });
}

// /* ============================================================
//    INIT
// ============================================================ */
// initTheme();
// populateFilterSelects();
// initWizardStatic();
// wireWizard();
// wireTrackModal();
// wireParamsModal();
// wireWorkspaceNavigation();
// updatePremisesChip();
// initData();

/* ============================================================
   INIT
============================================================ */

initTheme();

initSidebar();

populateFilterSelects();

initWizardStatic();

wireWizard();

wireTrackModal();

wireParamsModal();

wireWorkspaceNavigation();

updatePremisesChip();

initData();
