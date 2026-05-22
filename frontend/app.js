'use strict';

const API_BASE = 'http://localhost:8000';

// ── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = 'error') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 4000);
}

// ── Navigation ─────────────────────────────────────────────────────────────
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  const sec = document.getElementById(`section-${name}`);
  if (sec) sec.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-section="${name}"]`);
  if (nav) nav.classList.add('active');
}

document.querySelectorAll('.nav-item').forEach(a => {
  a.addEventListener('click', () => showSection(a.dataset.section));
});

// ── Risk badge ──────────────────────────────────────────────────────────────
function badgeHtml(nivel) {
  return `<span class="badge badge-${nivel}">${nivel}</span>`;
}

// ── Date formatter ──────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

// ── Result renderer ─────────────────────────────────────────────────────────
function renderResultado(container, data, title = 'Resultado da Análise') {
  const l1 = data.layer1 || data;
  const l2 = data.layer2 || null;

  const achadosHtml = (l1.achados || []).length === 0
    ? '<p style="color:var(--text-muted);font-size:13px">Nenhum achado suspeito.</p>'
    : (l1.achados || []).map(a => `
        <div class="achado-item">
          <div class="achado-header">
            ${badgeHtml(a.nivel_risco)}
            <span class="achado-tipo">${escHtml(a.tipo)}</span>
            <span class="achado-pagina">${escHtml(a.pagina_estimada)}</span>
          </div>
          <div class="achado-trecho">"${escHtml(a.trecho)}"</div>
          <div class="achado-descricao">${escHtml(a.descricao)}</div>
        </div>`).join('');

  const layer2Html = l2 ? `
    <div class="auditoria-box">
      <h4>Auditoria da 2ª Camada</h4>
      <div class="auditoria-status ${l2.auditoria_aprovada ? 'auditoria-ok' : 'auditoria-fail'}">
        ${l2.auditoria_aprovada ? '✔ Análise validada' : '✖ Análise possivelmente comprometida'}
      </div>
      <div class="auditoria-text">${escHtml(l2.raciocinio_auditoria)}</div>
      ${l2.ajustes ? `<div class="auditoria-text" style="margin-top:8px;color:var(--warning)">Ajustes recomendados: ${escHtml(l2.ajustes)}</div>` : ''}
    </div>` : '';

  container.innerHTML = `
    <div class="result-header">
      <span class="result-title">${escHtml(title)}</span>
      ${badgeHtml(l1.nivel_geral)}
    </div>
    <div class="result-summary">${escHtml(l1.resumo)}</div>
    ${(l1.achados || []).length > 0 ? `<div class="achados-title">Achados (${l1.achados.length})</div>` : ''}
    <div class="achados-list">${achadosHtml}</div>
    ${layer2Html}
    <div class="recomendacao-box" style="margin-top:20px">
      <h4>Recomendação</h4>
      <p>${escHtml(l1.recomendacao)}</p>
    </div>`;
  container.classList.remove('hidden');
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Loading helpers ─────────────────────────────────────────────────────────
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

// ── Analisar Texto ──────────────────────────────────────────────────────────
document.getElementById('btn-analisar-texto').addEventListener('click', async () => {
  const texto = document.getElementById('input-texto').value.trim();
  if (!texto) { showToast('Digite ou cole um texto para analisar.'); return; }

  const btn = document.getElementById('btn-analisar-texto');
  const resultEl = document.getElementById('result-texto');
  resultEl.classList.add('hidden');
  setLoading('loading-texto', btn, true);

  try {
    const res = await fetch(`${API_BASE}/analisar/texto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Erro desconhecido');
    }
    const data = await res.json();
    renderResultado(resultEl, data, 'Análise de Texto');
    refreshDashboard();
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  } finally {
    setLoading('loading-texto', btn, false);
  }
});

// ── Analisar PDF ────────────────────────────────────────────────────────────
let selectedPdfFile = null;

const dropZone = document.getElementById('drop-zone');
const pdfInput = document.getElementById('pdf-input');
const pdfFilename = document.getElementById('pdf-filename');
const btnPdf = document.getElementById('btn-analisar-pdf');

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
  if (!file.name.toLowerCase().endsWith('.pdf')) {
    showToast('Apenas arquivos PDF são suportados.');
    return;
  }
  selectedPdfFile = file;
  pdfFilename.textContent = `Arquivo selecionado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
  btnPdf.disabled = false;
}

document.getElementById('btn-analisar-pdf').addEventListener('click', async () => {
  if (!selectedPdfFile) { showToast('Selecione um arquivo PDF primeiro.'); return; }

  const resultEl = document.getElementById('result-pdf');
  resultEl.classList.add('hidden');
  setLoading('loading-pdf', btnPdf, true);

  try {
    const form = new FormData();
    form.append('file', selectedPdfFile);
    const res = await fetch(`${API_BASE}/analisar/pdf`, { method: 'POST', body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Erro desconhecido');
    }
    const data = await res.json();
    renderResultado(resultEl, data, `Análise: ${selectedPdfFile.name}`);
    refreshDashboard();
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  } finally {
    setLoading('loading-pdf', btnPdf, false);
  }
});

// ── Gerar Peça ──────────────────────────────────────────────────────────────
document.getElementById('btn-gerar').addEventListener('click', async () => {
  const tipo_peca = document.getElementById('gerar-tipo').value;
  const fatos = document.getElementById('gerar-fatos').value.trim();
  const pedidos = document.getElementById('gerar-pedidos').value.trim();
  const partes = document.getElementById('gerar-partes').value.trim();

  if (!fatos) { showToast('O campo Fatos é obrigatório.'); return; }

  const btn = document.getElementById('btn-gerar');
  const resultEl = document.getElementById('result-gerar');
  resultEl.classList.add('hidden');
  setLoading('loading-gerar', btn, true);

  try {
    const res = await fetch(`${API_BASE}/gerar/peca`, {
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
  const statusIcon = data.passou_na_detecao ? '✔' : '✖';
  const statusClass = data.passou_na_detecao ? 'auditoria-ok' : 'auditoria-fail';
  const statusText = data.passou_na_detecao ? 'Peça aprovada na verificação de segurança' : 'Atenção: peça contém padrões suspeitos';

  container.innerHTML = `
    <div class="result-header">
      <span class="result-title">Peça Gerada</span>
      ${badgeHtml(data.analise_injection.nivel_geral)}
    </div>
    <div class="auditoria-status ${statusClass}" style="margin-bottom:16px">
      ${statusIcon} ${statusText}
    </div>
    <div class="peca-content" id="peca-texto">${escHtml(data.conteudo)}</div>
    <button class="btn btn-ghost" onclick="downloadPeca()">⬇ Baixar como .txt</button>
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
  const blob = new Blob([texto], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'peca_lexguard.txt';
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── Dashboard ───────────────────────────────────────────────────────────────
async function refreshDashboard() {
  try {
    const res = await fetch(`${API_BASE}/historico?limit=200`);
    if (!res.ok) return;
    const items = await res.json();

    document.getElementById('dash-total').textContent = items.length;
    document.getElementById('dash-critico').textContent = items.filter(i => i.nivel_geral === 'CRITICO').length;
    document.getElementById('dash-alto').textContent = items.filter(i => i.nivel_geral === 'ALTO').length;
    document.getElementById('dash-ultima').textContent = items.length ? fmtDate(items[0].criado_em) : '—';

    const tbody = document.getElementById('dash-table-body');
    const recent = items.slice(0, 10);
    if (recent.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="empty-state">Nenhuma análise ainda.</td></tr>';
      return;
    }
    tbody.innerHTML = recent.map(i => `
      <tr>
        <td>#${i.id}</td>
        <td>${i.tipo === 'pdf' ? '📄 PDF' : '✎ Texto'}</td>
        <td>${escHtml(i.filename || '—')}</td>
        <td>${badgeHtml(i.nivel_geral)}</td>
        <td>${fmtDate(i.criado_em)}</td>
        <td><span class="td-link" onclick="abrirAnalise(${i.id})">Ver</span></td>
      </tr>`).join('');
  } catch (_) {}
}

// ── Histórico ───────────────────────────────────────────────────────────────
async function carregarHistorico(nivel = '') {
  const tbody = document.getElementById('hist-table-body');
  tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Carregando…</td></tr>';
  try {
    const qs = nivel ? `?nivel_geral=${nivel}&limit=200` : '?limit=200';
    const res = await fetch(`${API_BASE}/historico${qs}`);
    if (!res.ok) throw new Error('Falha ao carregar');
    const items = await res.json();

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Nenhuma análise encontrada.</td></tr>';
      return;
    }
    tbody.innerHTML = items.map(i => `
      <tr>
        <td>#${i.id}</td>
        <td>${i.tipo === 'pdf' ? '📄 PDF' : '✎ Texto'}</td>
        <td>${escHtml(i.filename || '—')}</td>
        <td>${badgeHtml(i.nivel_geral)}</td>
        <td>${fmtDate(i.criado_em)}</td>
        <td><span class="td-link" onclick="abrirAnalise(${i.id}, 'historico')">Abrir</span></td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">Erro: ${escHtml(e.message)}</td></tr>`;
  }
}

async function abrirAnalise(id, context = 'dashboard') {
  try {
    const res = await fetch(`${API_BASE}/historico/${id}`);
    if (!res.ok) throw new Error('Análise não encontrada');
    const data = await res.json();

    let achados = [];
    try { achados = JSON.parse(data.achados); } catch (_) {}

    const syntheticData = {
      layer1: {
        possui_injection: data.possui_injection,
        nivel_geral: data.nivel_geral,
        resumo: data.resumo,
        achados: achados,
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
      renderResultado(el, syntheticData, `Análise #${id} — ${data.filename || 'texto'}`);
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      showSection('historico');
      await carregarHistorico();
      const el = document.getElementById('result-historico');
      renderResultado(el, syntheticData, `Análise #${id} — ${data.filename || 'texto'}`);
      el.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    showToast(`Erro: ${e.message}`);
  }
}

document.getElementById('btn-filtrar').addEventListener('click', () => {
  const nivel = document.getElementById('filtro-nivel').value;
  document.getElementById('result-historico').classList.add('hidden');
  carregarHistorico(nivel);
});

document.getElementById('btn-refresh-hist').addEventListener('click', () => {
  document.getElementById('filtro-nivel').value = '';
  document.getElementById('result-historico').classList.add('hidden');
  carregarHistorico();
});

// ── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  refreshDashboard();
  carregarHistorico();
});
