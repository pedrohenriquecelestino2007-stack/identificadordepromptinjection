'use strict';

const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : 'https://identificadordepromptinjection.onrender.com';

// ── Tema claro/escuro ──────────────────────────────────────────────────────
function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme === 'dark' ? 'dark' : '');
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀' : '🌙';
  localStorage.setItem('lg_theme', theme);
}

applyTheme(localStorage.getItem('lg_theme') || 'light');

document.getElementById('btn-theme').addEventListener('click', () => {
  applyTheme((localStorage.getItem('lg_theme') || 'light') === 'dark' ? 'light' : 'dark');
});

// ── Auth state ─────────────────────────────────────────────────────────────
let authToken = localStorage.getItem('lg_token') || null;
let authUser  = JSON.parse(localStorage.getItem('lg_user') || 'null');

function saveAuth(token, user) {
  authToken = token;
  authUser  = user;
  localStorage.setItem('lg_token', token);
  localStorage.setItem('lg_user', JSON.stringify(user));
}

function clearAuth() {
  authToken = null;
  authUser  = null;
  localStorage.removeItem('lg_token');
  localStorage.removeItem('lg_user');
}

function authHeaders() {
  return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      ...authHeaders(),
      ...(opts.headers || {}),
    },
  });
  if (res.status === 401) {
    clearAuth();
    showAuthScreen();
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  return res;
}

// ── Auth screen ────────────────────────────────────────────────────────────
const authScreen = document.getElementById('auth-screen');

function showAuthScreen() {
  authScreen.classList.remove('hidden');
}

function hideAuthScreen() {
  authScreen.classList.add('hidden');
}

function initApp() {
  hideAuthScreen();
  const name = authUser?.name || '';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-avatar').textContent = name.charAt(0) || '?';
  refreshDashboard();
  carregarHistorico();
}

// ── Auth tabs ──────────────────────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    document.getElementById('form-login').classList.toggle('hidden', which !== 'login');
    document.getElementById('form-register').classList.toggle('hidden', which !== 'register');
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('reg-error').classList.add('hidden');
  });
});

// ── Login form ─────────────────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async e => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('btn-login');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Entrando…';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({ detail: `Erro ${res.status} no servidor.` }));
    if (!res.ok) throw new Error(data.detail || 'Erro ao entrar.');
    saveAuth(data.access_token, { id: data.user_id, name: data.name });
    initApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});

// ── Register form ──────────────────────────────────────────────────────────
document.getElementById('form-register').addEventListener('submit', async e => {
  e.preventDefault();
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('reg-error');
  const btn      = document.getElementById('btn-register');

  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = 'Criando conta…';

  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json().catch(() => ({ detail: `Erro ${res.status} no servidor.` }));
    if (!res.ok) throw new Error(data.detail || 'Erro ao criar conta.');
    saveAuth(data.access_token, { id: data.user_id, name: data.name });
    initApp();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Criar conta';
  }
});

// ── Logout ─────────────────────────────────────────────────────────────────
document.getElementById('btn-logout').addEventListener('click', () => {
  clearAuth();
  showAuthScreen();
});

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'error') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 4000);
}

// ── Mobile sidebar ─────────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebar-overlay');
const menuBtn = document.getElementById('menu-toggle');

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('open');
}

menuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  overlay.classList.toggle('open');
});
overlay.addEventListener('click', closeSidebar);

// ── Navigation ─────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (nav) nav.classList.add('active');
  closeSidebar();
}

document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', () => {
    showSection(a.dataset.section);
    if (a.dataset.section === 'config') loadSettings();
  });
});

// ── Risk badge ─────────────────────────────────────────────────────────────
function badgeHtml(nivel) {
  return `<span class="badge badge-${nivel}">${nivel}</span>`;
}

// ── Date formatter ─────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── HTML escape ────────────────────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Result renderer ────────────────────────────────────────────────────────
const NIVEL_INFO = {
  CRITICO: { icon: '🚨', label: 'Risco Crítico', desc: 'Injeção de prompt detectada — ação imediata necessária' },
  ALTO:    { icon: '⚠️', label: 'Risco Alto',    desc: 'Tentativa clara de manipulação detectada' },
  MEDIO:   { icon: '⚡', label: 'Risco Médio',   desc: 'Padrões suspeitos identificados' },
  BAIXO:   { icon: '🔍', label: 'Risco Baixo',   desc: 'Indicadores leves — pode ser coincidência' },
  NENHUM:  { icon: '✅', label: 'Sem Ameaças',   desc: 'Nenhuma injeção de prompt detectada' },
};

function renderResultado(container, data, title = 'Resultado da Análise', analiseId = null, textoOriginal = '') {
  const l1   = data.layer1 || data;
  const l2   = data.layer2 || null;
  const info = NIVEL_INFO[l1.nivel_geral] || NIVEL_INFO.NENHUM;

  const achadosHtml = (l1.achados || []).length === 0
    ? '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">Nenhum achado suspeito encontrado.</p>'
    : (l1.achados || []).map(a => {
        const conf = typeof a.confianca === 'number' ? a.confianca : 80;
        const confClass = conf >= 70 ? 'confianca-high' : conf >= 50 ? 'confianca-mid' : 'confianca-low';
        return `
        <div class="achado-item">
          <div class="achado-header">
            ${badgeHtml(a.nivel_risco)}
            <span class="achado-tipo">${escHtml(a.tipo)}</span>
            <span class="achado-pagina">${escHtml(a.pagina_estimada)}</span>
          </div>
          <div class="achado-trecho">"${escHtml(a.trecho)}"</div>
          <div class="achado-descricao">${escHtml(a.descricao)}</div>
          <div class="confianca-wrap">
            <span class="confianca-label">Confiança: ${conf}%</span>
            <div class="confianca-bar-bg">
              <div class="confianca-bar-fill ${confClass}" style="width:${conf}%"></div>
            </div>
          </div>
        </div>`;
      }).join('');

  const layer2Html = l2 ? `
    <div class="auditoria-box">
      <h4>Auditoria da 2ª Camada</h4>
      <div class="auditoria-status ${l2.auditoria_aprovada ? 'auditoria-ok' : 'auditoria-fail'}">
        ${l2.auditoria_aprovada ? '✔ Análise validada' : '✖ Análise possivelmente comprometida'}
      </div>
      <div class="auditoria-text">${escHtml(l2.raciocinio_auditoria)}</div>
      ${l2.ajustes ? `<div class="auditoria-text" style="margin-top:8px;color:var(--warning)">Ajustes: ${escHtml(l2.ajustes)}</div>` : ''}
    </div>` : '';

  const sugestoes = l1.sugestoes_correcao || [];
  const sugestoesHtml = sugestoes.length > 0 ? `
    <div class="sugestoes-box">
      <h4>Sugestões de Correção</h4>
      <ul>${sugestoes.map(s => `<li>${escHtml(s)}</li>`).join('')}</ul>
    </div>` : '';

  const shareBtn = analiseId
    ? `<button class="btn btn-ghost" onclick="openShareModal(${analiseId})">🔗 Compartilhar</button>`
    : '';

  container.innerHTML = `
    <div class="risk-banner risk-banner-${l1.nivel_geral}">
      <div class="risk-banner-icon">${info.icon}</div>
      <div class="risk-banner-content">
        <div class="risk-banner-title">${escHtml(title)}</div>
        <div class="risk-banner-level">${info.label}</div>
        <div class="risk-banner-desc">${info.desc}</div>
      </div>
    </div>
    <div class="result-summary">${escHtml(l1.resumo)}</div>
    ${(l1.achados || []).length > 0 ? `<div class="achados-title">Achados (${l1.achados.length})</div>` : ''}
    <div class="achados-list">${achadosHtml}</div>
    ${layer2Html}
    <div class="recomendacao-box" style="margin-top:20px">
      <h4>Recomendação</h4>
      <p>${escHtml(l1.recomendacao)}</p>
    </div>
    ${sugestoesHtml}
    <div class="result-actions">
      ${shareBtn}
      <button class="btn btn-ghost" onclick="exportarPDF()">🖨 Exportar PDF</button>
    </div>
    <div class="chat-section" id="chat-${container.id}">
      <div class="chat-header"><h4>💬 Perguntar à IA sobre este documento</h4></div>
      <div class="chat-messages" id="chat-${container.id}-msgs">
        <p class="chat-empty">Faça uma pergunta sobre o conteúdo ou os achados desta análise.</p>
      </div>
      <div class="chat-input-row">
        <input type="text" class="chat-input" id="chat-${container.id}-input"
          placeholder="Ex: O que está oculto neste arquivo? Por que esse trecho é suspeito?" />
        <button class="btn btn-primary chat-send" id="chat-${container.id}-btn">Perguntar</button>
      </div>
    </div>`;
  container.classList.remove('hidden');
  setupChatPanel(container.id, analiseId, textoOriginal, JSON.stringify(l1));
}

// ── Chat panel ─────────────────────────────────────────────────────────────
function setupChatPanel(containerId, analiseId, textoOriginal, analiseJson) {
  const input = document.getElementById(`chat-${containerId}-input`);
  const btn   = document.getElementById(`chat-${containerId}-btn`);
  if (!input || !btn) return;

  async function enviarPergunta() {
    const pergunta = input.value.trim();
    if (!pergunta) return;
    input.value = '';
    btn.disabled = true;

    const msgsEl = document.getElementById(`chat-${containerId}-msgs`);
    const empty  = msgsEl.querySelector('.chat-empty');
    if (empty) empty.remove();

    msgsEl.innerHTML += `<div class="chat-msg user"><div class="chat-bubble user-bubble">${escHtml(pergunta)}</div></div>`;

    const loadId = `cl-${Date.now()}`;
    msgsEl.innerHTML += `<div class="chat-msg ai" id="${loadId}"><div class="chat-bubble ai-bubble"><span class="spinner" style="width:14px;height:14px;border-width:2px;margin:2px 0"></span></div></div>`;
    msgsEl.scrollTop = msgsEl.scrollHeight;

    try {
      const endpoint = analiseId ? `/perguntar/analise/${analiseId}` : '/perguntar';
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta, texto: textoOriginal, contexto_analise: analiseJson }),
      });
      const data = await res.json().catch(() => ({ resposta: `Erro ${res.status}` }));
      document.getElementById(loadId)?.remove();
      const resposta = data.resposta || data.detail || 'Sem resposta.';
      msgsEl.innerHTML += `<div class="chat-msg ai"><div class="chat-bubble ai-bubble">${escHtml(resposta).replace(/\n/g, '<br>')}</div></div>`;
    } catch (err) {
      document.getElementById(loadId)?.remove();
      msgsEl.innerHTML += `<div class="chat-msg ai"><div class="chat-bubble ai-bubble error-bubble">${escHtml(err.message)}</div></div>`;
    } finally {
      btn.disabled = false;
      msgsEl.scrollTop = msgsEl.scrollHeight;
    }
  }

  btn.addEventListener('click', enviarPergunta);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') enviarPergunta(); });
}

// ── Export / Print ─────────────────────────────────────────────────────────
function exportarPDF() {
  window.print();
}

// ── Loading helpers ────────────────────────────────────────────────────────
function setLoading(loadingId, btnEl, on) {
  const el = document.getElementById(loadingId);
  if (on) {
    el.classList.remove('hidden');
    if (btnEl) btnEl.disabled = true;
  } else {
    el.classList.add('hidden');
    if (btnEl) btnEl.disabled = false;
  }
}

// ── Character counter ──────────────────────────────────────────────────────
const inputTexto   = document.getElementById('input-texto');
const charCountEl  = document.getElementById('char-counter');

function updateCharCounter() {
  const val   = inputTexto.value;
  const chars = val.length;
  const words = val.trim() ? val.trim().split(/\s+/).length : 0;
  charCountEl.textContent = `${chars.toLocaleString('pt-BR')} caracteres · ${words.toLocaleString('pt-BR')} palavras`;
  charCountEl.classList.toggle('warn', chars > 20000);
}
inputTexto.addEventListener('input', updateCharCounter);

// ── Analisar Texto ─────────────────────────────────────────────────────────
document.getElementById('btn-analisar-texto').addEventListener('click', async () => {
  const texto = document.getElementById('input-texto').value.trim();
  if (!texto) { showToast('Digite ou cole um texto para analisar.'); return; }

  const btn     = document.getElementById('btn-analisar-texto');
  const resultEl = document.getElementById('result-texto');
  resultEl.classList.add('hidden');
  setLoading('loading-texto', btn, true);

  try {
    const res = await apiFetch('/analisar/texto', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Erro desconhecido');
    }
    const data = await res.json();
    renderResultado(resultEl, data, 'Análise de Texto', data.id_salvo || null, texto);
    refreshDashboard();
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  } finally {
    setLoading('loading-texto', btn, false);
  }
});

// ── Analisar Documento (PDF / DOCX / TXT) ──────────────────────────────────
let selectedPdfFile = null;

const dropZone    = document.getElementById('drop-zone');
const pdfInput    = document.getElementById('pdf-input');
const pdfFilename = document.getElementById('pdf-filename');
const btnPdf      = document.getElementById('btn-analisar-pdf');

dropZone.addEventListener('click', () => pdfInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) setPdfFile(file);
});

pdfInput.addEventListener('change', () => {
  if (pdfInput.files[0]) setPdfFile(pdfInput.files[0]);
});

function setPdfFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'docx', 'txt'].includes(ext)) {
    showToast('Formato não suportado. Use PDF, DOCX ou TXT.');
    return;
  }
  selectedPdfFile = file;
  const sizeKb = (file.size / 1024).toFixed(1);
  pdfFilename.textContent = `Arquivo selecionado: ${file.name} (${sizeKb} KB)`;
  btnPdf.disabled = false;

  const previewWrap  = document.getElementById('pdf-preview-wrap');
  const previewFrame = document.getElementById('pdf-preview-frame');
  if (ext === 'pdf') {
    const prevUrl = previewFrame.dataset.objectUrl;
    if (prevUrl) URL.revokeObjectURL(prevUrl);
    const url = URL.createObjectURL(file);
    previewFrame.dataset.objectUrl = url;
    previewFrame.src = url;
    previewWrap.classList.remove('hidden');
  } else {
    closePdfPreview();
  }
}

function closePdfPreview() {
  const previewWrap  = document.getElementById('pdf-preview-wrap');
  const previewFrame = document.getElementById('pdf-preview-frame');
  previewWrap.classList.add('hidden');
  const prevUrl = previewFrame.dataset.objectUrl;
  if (prevUrl) {
    URL.revokeObjectURL(prevUrl);
    delete previewFrame.dataset.objectUrl;
    previewFrame.src = '';
  }
}

document.getElementById('btn-analisar-pdf').addEventListener('click', async () => {
  if (!selectedPdfFile) { showToast('Selecione um arquivo primeiro.'); return; }

  const resultEl = document.getElementById('result-pdf');
  resultEl.classList.add('hidden');
  setLoading('loading-pdf', btnPdf, true);

  try {
    const form = new FormData();
    form.append('file', selectedPdfFile);
    const res = await apiFetch('/analisar/pdf', { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Erro desconhecido');
    }
    const data = await res.json();
    renderResultado(resultEl, data, `Análise: ${selectedPdfFile.name}`, data.id_salvo || null);
    refreshDashboard();
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  } finally {
    setLoading('loading-pdf', btnPdf, false);
  }
});

// ── Gerar Peça ─────────────────────────────────────────────────────────────
document.getElementById('btn-gerar').addEventListener('click', async () => {
  const tipo_peca = document.getElementById('gerar-tipo').value;
  const fatos     = document.getElementById('gerar-fatos').value.trim();
  const pedidos   = document.getElementById('gerar-pedidos').value.trim();
  const partes    = document.getElementById('gerar-partes').value.trim();

  if (!fatos) { showToast('O campo Fatos é obrigatório.'); return; }

  const btn      = document.getElementById('btn-gerar');
  const resultEl = document.getElementById('result-gerar');
  resultEl.classList.add('hidden');
  setLoading('loading-gerar', btn, true);

  try {
    const res = await apiFetch('/gerar/peca', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_peca, fatos, pedidos, partes }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Erro desconhecido');
    }
    const data = await res.json();
    renderPecaResult(resultEl, data);
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  } finally {
    setLoading('loading-gerar', btn, false);
  }
});

function renderPecaResult(container, data) {
  const statusIcon  = data.passou_na_detecao ? '✔' : '✖';
  const statusClass = data.passou_na_detecao ? 'auditoria-ok' : 'auditoria-fail';
  const statusText  = data.passou_na_detecao ? 'Peça aprovada na verificação de segurança' : 'Atenção: peça contém padrões suspeitos';

  container.innerHTML = `
    <div class="result-header">
      <span class="result-title">Peça Gerada</span>
      ${badgeHtml(data.analise_injection.nivel_geral)}
    </div>
    <div class="auditoria-status ${statusClass}" style="margin-bottom:16px">
      ${statusIcon} ${statusText}
    </div>
    <div class="peca-content" id="peca-texto">${escHtml(data.conteudo)}</div>
    <div class="result-actions">
      <button class="btn btn-ghost" onclick="downloadPeca()">⬇ Baixar como .txt</button>
      <button class="btn btn-ghost" onclick="exportarPDF()">🖨 Exportar PDF</button>
    </div>
    ${data.analise_injection.achados && data.analise_injection.achados.length > 0 ? `
      <div style="margin-top:20px">
        <div class="achados-title">Achados na peça gerada</div>
        <div class="achados-list">
          ${(data.analise_injection.achados || []).map(a => `
            <div class="achado-item">
              <div class="achado-header">
                ${badgeHtml(a.nivel_risco)}
                <span class="achado-tipo">${escHtml(a.tipo)}</span>
              </div>
              <div class="achado-trecho">"${escHtml(a.trecho)}"</div>
              <div class="achado-descricao">${escHtml(a.descricao)}</div>
            </div>`).join('')}
        </div>
      </div>` : ''}`;
  container.classList.remove('hidden');
}

function downloadPeca() {
  const texto = document.getElementById('peca-texto')?.textContent || '';
  const blob  = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const a     = document.createElement('a');
  a.href      = URL.createObjectURL(blob);
  a.download  = 'peca_lexguard.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Dashboard ──────────────────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    const res = await apiFetch('/historico?limit=200');
    if (!res.ok) return;
    const items = await res.json();

    document.getElementById('dash-total').textContent   = items.length;
    document.getElementById('dash-critico').textContent = items.filter(i => i.nivel_geral === 'CRITICO').length;
    document.getElementById('dash-alto').textContent    = items.filter(i => i.nivel_geral === 'ALTO').length;
    document.getElementById('dash-ultima').textContent  = items.length ? fmtDate(items[0].criado_em) : '—';

    const tbody  = document.getElementById('dash-table-body');
    const recent = items.slice(0, 10);
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma análise ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(i => `
      <tr>
        <td>#${i.id}</td>
        <td>${i.tipo === 'pdf' ? '📄 Documento' : '✎ Texto'} ${escHtml(i.filename || '')}</td>
        <td>${badgeHtml(i.nivel_geral)}</td>
        <td>${fmtDate(i.criado_em)}</td>
        <td><span class="td-link" onclick="abrirAnalise(${i.id})">Ver</span></td>
      </tr>`).join('');
  } catch (_) {}
}

// ── Histórico ──────────────────────────────────────────────────────────────
let _historicoItems = [];

async function carregarHistorico(nivel = '') {
  const tbody = document.getElementById('hist-table-body');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Carregando…</td></tr>';
  try {
    const qs  = nivel ? `?nivel_geral=${nivel}&limit=200` : '?limit=200';
    const res = await apiFetch(`/historico${qs}`);
    if (!res.ok) throw new Error('Falha ao carregar');
    _historicoItems = await res.json();
    renderHistoricoTabela(_historicoItems);
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Erro: ${escHtml(e.message)}</td></tr>`;
  }
}

function renderHistoricoTabela(items) {
  const tbody = document.getElementById('hist-table-body');
  if (items.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma análise encontrada.</td></tr>';
    return;
  }
  tbody.innerHTML = items.map(i => `
    <tr>
      <td>#${i.id}</td>
      <td>${i.tipo === 'pdf' ? '📄 Doc' : '✎ Texto'}</td>
      <td>${escHtml(i.filename || '—')}</td>
      <td>${badgeHtml(i.nivel_geral)}</td>
      <td>${fmtDate(i.criado_em)}</td>
      <td>
        <span class="td-link" onclick="abrirAnalise(${i.id}, 'historico')">Abrir</span>
        &nbsp;
        <span class="td-link" style="color:var(--danger)" onclick="deletarAnalise(${i.id})">Excluir</span>
      </td>
    </tr>`).join('');
}

async function abrirAnalise(id, context = 'dashboard') {
  try {
    const res = await apiFetch(`/historico/${id}`);
    if (!res.ok) throw new Error('Análise não encontrada');
    const data = await res.json();

    let achados = [];
    try { achados = JSON.parse(data.achados); } catch (_) {}

    const syntheticData = {
      layer1: {
        possui_injection: data.possui_injection,
        nivel_geral: data.nivel_geral,
        resumo: data.resumo,
        achados,
        recomendacao: data.recomendacao,
      },
      layer2: data.raciocinio_auditoria ? {
        auditoria_aprovada: true,
        raciocinio_auditoria: data.raciocinio_auditoria,
        ajustes: '',
      } : null,
    };

    if (context === 'historico') {
      const el = document.getElementById('result-historico');
      renderResultado(el, syntheticData, `Análise #${id} — ${data.filename || 'texto'}`, id);
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      showSection('historico');
      await carregarHistorico();
      const el = document.getElementById('result-historico');
      renderResultado(el, syntheticData, `Análise #${id} — ${data.filename || 'texto'}`, id);
      el.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  }
}

async function deletarAnalise(id) {
  if (!confirm('Excluir esta análise? Esta ação não pode ser desfeita.')) return;
  try {
    const res = await apiFetch(`/historico/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Falha ao excluir');
    showToast('Análise excluída.', 'success');
    carregarHistorico();
    refreshDashboard();
    document.getElementById('result-historico').classList.add('hidden');
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  }
}

document.getElementById('filtro-busca').addEventListener('input', () => {
  const busca = document.getElementById('filtro-busca').value.toLowerCase();
  const filtered = _historicoItems.filter(i =>
    !busca || (i.filename || '').toLowerCase().includes(busca)
  );
  renderHistoricoTabela(filtered);
});

document.getElementById('btn-filtrar').addEventListener('click', () => {
  const nivel = document.getElementById('filtro-nivel').value;
  document.getElementById('filtro-busca').value = '';
  document.getElementById('result-historico').classList.add('hidden');
  carregarHistorico(nivel);
});

document.getElementById('btn-refresh-hist').addEventListener('click', () => {
  document.getElementById('filtro-nivel').value = '';
  document.getElementById('filtro-busca').value = '';
  document.getElementById('result-historico').classList.add('hidden');
  carregarHistorico();
});

// ── Share modal ────────────────────────────────────────────────────────────
function openShareModal(analiseId) {
  const modal = document.getElementById('share-modal');
  const input = document.getElementById('share-link-input');
  input.value = 'Gerando link…';
  modal.classList.remove('hidden');

  apiFetch(`/historico/${analiseId}/compartilhar`, { method: 'POST' })
    .then(res => res.json())
    .then(data => {
      const url = `${window.location.origin}${window.location.pathname}?share=${data.share_token}`;
      input.value = url;
    })
    .catch(() => { input.value = 'Erro ao gerar link.'; });
}

document.getElementById('btn-close-share').addEventListener('click', () => {
  document.getElementById('share-modal').classList.add('hidden');
});

document.getElementById('share-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('share-modal')) {
    document.getElementById('share-modal').classList.add('hidden');
  }
});

document.getElementById('btn-copy-link').addEventListener('click', () => {
  const input = document.getElementById('share-link-input');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(input.value)
      .then(() => showToast('Link copiado!', 'success'))
      .catch(() => {
        input.select();
        document.execCommand('copy');
        showToast('Link copiado!', 'success');
      });
  } else {
    input.select();
    document.execCommand('copy');
    showToast('Link copiado!', 'success');
  }
});

// ── Página pública de análise compartilhada ────────────────────────────────
function showSharedPage() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('menu-toggle').style.display = 'none';
  document.getElementById('main').style.display = 'none';
  const sp = document.getElementById('shared-page');
  sp.classList.remove('hidden');
  sp.style.display = 'flex';
}

async function loadSharedAnalysis(token) {
  showSharedPage();
  const loadingEl = document.getElementById('shared-loading');
  const resultEl  = document.getElementById('result-shared');

  try {
    const res = await fetch(`${API_BASE}/compartilhada/${token}`);
    if (!res.ok) throw new Error('Análise não encontrada ou link inválido.');
    const data = await res.json();

    let achados = [];
    try { achados = JSON.parse(data.achados); } catch (_) {}

    const syntheticData = {
      layer1: {
        possui_injection: data.possui_injection,
        nivel_geral: data.nivel_geral,
        resumo: data.resumo,
        achados,
        recomendacao: data.recomendacao,
      },
      layer2: data.raciocinio_auditoria ? {
        auditoria_aprovada: true,
        raciocinio_auditoria: data.raciocinio_auditoria,
        ajustes: '',
      } : null,
    };

    loadingEl.classList.add('hidden');
    renderResultado(resultEl, syntheticData, data.filename ? `Análise — ${data.filename}` : 'Análise Compartilhada');
  } catch (e) {
    loadingEl.innerHTML = `<p style="color:var(--danger);text-align:center;padding:40px 0">${escHtml(e.message)}</p>`;
  }
}

// ── Configurações ──────────────────────────────────────────────────────────
async function loadSettings() {
  const user = authUser || {};
  document.getElementById('settings-name').textContent  = user.name || '—';
  document.getElementById('settings-email').textContent = user.email || '—';
  document.getElementById('settings-avatar').textContent = (user.name || '?').charAt(0).toUpperCase();

  try {
    const res = await apiFetch('/auth/stats');
    if (!res.ok) return;
    const s = await res.json();
    document.getElementById('stats-total').textContent   = s.total_analises;
    document.getElementById('stats-pecas').textContent   = s.total_pecas;
    document.getElementById('stats-critico').textContent = s.por_nivel?.CRITICO ?? 0;
    document.getElementById('stats-membro').textContent  = s.membro_desde || '—';
  } catch (_) {}
}

document.getElementById('form-senha').addEventListener('submit', async e => {
  e.preventDefault();
  const senhaAtual   = document.getElementById('senha-atual').value;
  const senhaNova    = document.getElementById('senha-nova').value;
  const senhaConfirm = document.getElementById('senha-confirma').value;
  const errEl        = document.getElementById('senha-error');
  const btn          = document.getElementById('btn-senha');

  errEl.classList.add('hidden');
  if (senhaNova !== senhaConfirm) {
    errEl.textContent = 'As senhas novas não coincidem.';
    errEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Alterando…';
  try {
    const res = await apiFetch('/auth/senha', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha_atual: senhaAtual, nova_senha: senhaNova }),
    });
    const data = await res.json().catch(() => ({ detail: `Erro ${res.status}` }));
    if (!res.ok) throw new Error(data.detail || 'Erro ao alterar senha.');
    showToast('Senha alterada com sucesso!', 'success');
    e.target.reset();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Alterar senha';
  }
});

// ── Init ───────────────────────────────────────────────────────────────────
const shareParam = new URLSearchParams(window.location.search).get('share');

if (shareParam) {
  loadSharedAnalysis(shareParam);
} else if (authToken) {
  initApp();
} else {
  showAuthScreen();
}
