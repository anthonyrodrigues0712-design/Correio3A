// ─── Auth Guard ───────────────────────────────────────────────────────────────
(function authGuard() {
  const token = sessionStorage.getItem('ce_token');
  const role  = sessionStorage.getItem('ce_role');
  if (!token || role !== 'admin') {
    window.location.href = '/login';
  }
})();

// Helper: requisições autenticadas
async function authFetch(url, options = {}) {
  const token = sessionStorage.getItem('ce_token');
  return fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token, ...(options.headers || {}) }
  });
}

document.addEventListener('DOMContentLoaded', () => {

  // ── Cabeçalho com usuário e logout ───────────────────────────────────────────
  const username = sessionStorage.getItem('ce_username') || 'Admin';
  const headerDiv = document.querySelector('.admin-header .admin-actions');
  if (headerDiv) {
    headerDiv.insertAdjacentHTML('beforeend', `
      <span style="color:var(--muted);font-size:.85rem;align-self:center;">
        <i class="fa-solid fa-user-shield"></i> ${escapeHtml(username)}
      </span>
      <button class="btn btn-secondary" id="logoutBtn">
        <i class="fa-solid fa-right-from-bracket"></i> Sair
      </button>`);
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await authFetch('/api/auth/logout', { method: 'POST' });
      sessionStorage.clear();
      window.location.href = '/login';
    });
  }

  // ── Abas principais ──────────────────────────────────────────────────────────
  const tabBtns   = document.querySelectorAll('.admin-tab');
  const tabPanels = document.querySelectorAll('.tab-panel');
  const msgNav    = document.getElementById('msgFilterNav');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      msgNav.style.opacity = btn.dataset.tab === 'cartas' ? '1' : '0.3';
      msgNav.style.pointerEvents = btn.dataset.tab === 'cartas' ? '' : 'none';
      if (btn.dataset.tab === 'giftcards') loadGiftcards();
      if (btn.dataset.tab === 'usuarios')  loadUsers();
    });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function escapeHtml(text = '') {
    return String(text)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
    catch { return iso || '-'; }
  }

  function statusLabel(s) {
    return { approved:'Aprovado', pending_review:'Pendente', rejected:'Rejeitado', test:'Teste' }[s] || 'Pendente';
  }
  function statusClass(s) {
    return { approved:'status-approved', pending_review:'status-pending_review',
             rejected:'status-rejected', test:'status-test' }[s] || 'status-pending_review';
  }
  function isTest(item) { return item.paymentStatus === 'test' || item.paymentMethod === 'master'; }

  const BEN_ICONS = { musica: '🎵', bombom: '🍫', rosa: '🌹', pirulito: '🍭' };
  const BEN_LABELS = { musica: 'Música', bombom: 'Bombom', rosa: 'Flor', pirulito: 'Pirulito' };

  function beneficiosPills(ben = {}) {
    const pills = Object.entries(ben).filter(([,v]) => v).map(([k]) =>
      `<span class="gc-ben-pill">${BEN_ICONS[k] || ''} ${BEN_LABELS[k] || k}</span>`
    );
    if (!pills.length) return '<span style="color:var(--muted);font-size:.8rem;">Nenhum</span>';
    return `<div class="gc-ben-pills">${pills.join('')}</div>`;
  }

  // ── Modais genérico ──────────────────────────────────────────────────────────
  function openModal(id)  { const m = document.getElementById(id); m.classList.add('open'); m.setAttribute('aria-hidden','false'); }
  function closeModal(id) { const m = document.getElementById(id); m.classList.remove('open'); m.setAttribute('aria-hidden','true'); }

  document.querySelectorAll('[data-close]').forEach(el => {
    el.addEventListener('click', () => {
      const target = el.dataset.close;
      if (target === 'detail') closeModal('detailModal');
      else if (target === 'gc') closeModal('gcModal');
      else if (target === 'user') closeModal('userModal');
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal('detailModal'); closeModal('gcModal'); closeModal('userModal'); }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ABA: CARTAS
  // ════════════════════════════════════════════════════════════════════════════
  const cardsContainer = document.getElementById('cardsContainer');
  const emptyState     = document.getElementById('emptyState');
  const searchInput    = document.getElementById('searchInput');
  const refreshBtn     = document.getElementById('refreshBtn');
  const detailContent  = document.getElementById('detailContent');
  const filterButtons  = document.querySelectorAll('.admin-nav-btn');

  let currentFilter = 'all';
  let currentItems  = [];

  function renderStats(items) {
    const real = items.filter(i => !isTest(i));
    document.getElementById('statTotal').textContent     = real.length;
    document.getElementById('statApproved').textContent  = real.filter(i => i.paymentStatus === 'approved').length;
    document.getElementById('statPending').textContent   = real.filter(i => i.paymentStatus === 'pending_review').length;
    document.getElementById('statAnonymous').textContent = real.filter(i => i.senderMode === 'anonymous').length;
    document.getElementById('statMusic').textContent     = real.filter(i => i.youtubeLink?.trim()).length;
  }

  function youtubeEmbed(url = '') {
    if (!url.trim()) return '';
    try {
      const u = new URL(url);
      let vid = u.searchParams.get('v');
      if (!vid && u.hostname === 'youtu.be') vid = u.pathname.slice(1);
      if (!vid) return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
      return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;margin-top:8px;">
        <iframe src="https://www.youtube.com/embed/${escapeHtml(vid)}"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;"
          allowfullscreen loading="lazy"></iframe></div>`;
    } catch { return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`; }
  }

  function openDetails(item) {
    const anon = item.senderMode === 'anonymous';
    const testBadge = isTest(item) ? `<span class="pill status-test" style="margin-left:8px;">Teste</span>` : '';
    const ben = item.beneficios || {};
    const sala   = item.recipientClass  ? `<p><strong>Sala:</strong> ${escapeHtml(item.recipientClass)}</p>`   : '';
    const curso  = item.recipientCourse ? `<p><strong>Curso:</strong> ${escapeHtml(item.recipientCourse)}</p>` : '';
    detailContent.innerHTML = `
      <div class="admin-detail-head">
        <div>
          <span class="pill ${statusClass(item.paymentStatus)}">${statusLabel(item.paymentStatus)}</span>${testBadge}
          <h2 style="margin:8px 0 2px;">Para: ${escapeHtml(item.recipientName)}</h2>
          ${sala}${curso}
          <p style="color:var(--muted);font-size:.9rem;">${formatDate(item.createdAt)}</p>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-block">
          <h4><i class="fa-solid fa-envelope-open-text"></i> Carta</h4>
          <blockquote style="margin:8px 0;padding:12px 16px;border-left:3px solid var(--color-primary,#ff5471);
            font-style:italic;white-space:pre-wrap;word-break:break-word;
            background:rgba(255,84,113,.05);border-radius:0 8px 8px 0;">
            ${escapeHtml(item.messageText)}</blockquote>
          ${item.youtubeLink ? `<h4 style="margin-top:16px;"><i class="fa-brands fa-youtube" style="color:#f00;"></i> Música</h4>${youtubeEmbed(item.youtubeLink)}` : ''}
          <h4 style="margin-top:16px;"><i class="fa-solid fa-gift"></i> Itens do Giftcard</h4>
          <div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:6px;">
            <span class="gc-ben-pill">💌 Carta</span>
            ${Object.entries(ben).filter(([,v])=>v).map(([k])=>
              `<span class="gc-ben-pill">${BEN_ICONS[k]||''} ${BEN_LABELS[k]||k}</span>`
            ).join('')}
          </div>
        </div>
        <div class="detail-block">
          <h4><i class="fa-solid fa-user"></i> Remetente</h4>
          <p><strong>De:</strong> ${escapeHtml(anon ? 'Anônimo' : (item.senderName || '—'))}</p>
          <p><strong>Contato:</strong> ${escapeHtml(anon ? '—' : (item.senderContact || '—'))}</p>
          <p><strong>Modo:</strong> ${anon ? 'Anônimo' : 'Identificado'}</p>
          <h4><i class="fa-solid fa-circle-info"></i> Envio</h4>
          ${item.recipientClass  ? `<p><strong>Sala:</strong> ${escapeHtml(item.recipientClass)}</p>`   : ''}
          ${item.recipientCourse ? `<p><strong>Curso:</strong> ${escapeHtml(item.recipientCourse)}</p>` : ''}
          <p><strong>Giftcard:</strong> ${escapeHtml(item.codigoGiftcard || '—')}</p>
          <p><strong>Status:</strong> ${statusLabel(item.paymentStatus)}</p>
          <p><strong>ID:</strong> <span style="font-size:.75rem;font-family:monospace;">${escapeHtml(item.id)}</span></p>
          <p><strong>Data:</strong> ${formatDate(item.createdAt)}</p>
        </div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">
        <button class="btn btn-primary btn-small" data-approve="${escapeHtml(item.id)}">
          <i class="fa-solid fa-check"></i> Aprovar</button>
        <button class="btn btn-secondary btn-small" data-reject="${escapeHtml(item.id)}">
          <i class="fa-solid fa-xmark"></i> Rejeitar</button>
        <button class="btn btn-secondary btn-small" data-pending="${escapeHtml(item.id)}">
          <i class="fa-solid fa-clock"></i> Pendente</button>
      </div>`;

    detailContent.querySelector('[data-approve]')?.addEventListener('click', async e => { await updateStatus(e.currentTarget.dataset.approve, 'approved'); closeModal('detailModal'); });
    detailContent.querySelector('[data-reject]')?.addEventListener('click', async e => { await updateStatus(e.currentTarget.dataset.reject, 'rejected'); closeModal('detailModal'); });
    detailContent.querySelector('[data-pending]')?.addEventListener('click', async e => { await updateStatus(e.currentTarget.dataset.pending, 'pending_review'); closeModal('detailModal'); });
    openModal('detailModal');
  }

  function renderCards(items) {
    cardsContainer.innerHTML = '';
    if (!items.length) { emptyState.style.display = 'grid'; return; }
    emptyState.style.display = 'none';
    items.forEach(item => {
      const anon = item.senderMode === 'anonymous';
      const hasMusic = item.youtubeLink?.trim();
      const card = document.createElement('article');
      card.className = 'admin-card';
      card.innerHTML = `
        <div class="admin-card-top">
          <div>
            <h3><i class="fa-solid fa-heart" style="color:var(--color-primary,#ff5471);font-size:.85em;"></i>
              Para: ${escapeHtml(item.recipientName)}</h3>
            <p style="color:var(--muted);font-size:.85rem;">
              De: ${escapeHtml(anon ? 'Anônimo' : (item.senderName || '—'))}
              ${item.senderContact && !anon ? `· ${escapeHtml(item.senderContact)}` : ''}
            </p>
            ${(item.recipientClass || item.recipientCourse) ? `
            <p style="color:var(--muted);font-size:.8rem;margin-top:2px;">
              ${item.recipientClass  ? `<span><i class="fa-solid fa-door-open"></i> ${escapeHtml(item.recipientClass)}</span>` : ''}
              ${item.recipientClass && item.recipientCourse ? ' · ' : ''}
              ${item.recipientCourse ? `<span><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(item.recipientCourse)}</span>` : ''}
            </p>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
            <span class="pill ${statusClass(item.paymentStatus)}">${statusLabel(item.paymentStatus)}</span>
            ${isTest(item) ? `<span class="pill status-test" style="font-size:.7rem;padding:2px 8px;">Teste</span>` : ''}
          </div>
        </div>
        <div class="admin-card-body">
          <p>${escapeHtml(item.messageText.slice(0,180))}${item.messageText.length>180?'…':''}</p>
        </div>
        <div class="admin-card-meta">
          ${hasMusic ? `<span><i class="fa-brands fa-youtube" style="color:#f00;"></i> Com música</span>` : ''}
          <span><i class="fa-solid fa-clock"></i> ${formatDate(item.createdAt)}</span>
          <span><i class="fa-solid fa-ticket"></i> ${escapeHtml(item.codigoGiftcard || '—')}</span>
        </div>
        <div class="admin-card-actions">
          <button class="btn btn-secondary btn-small" data-view><i class="fa-solid fa-eye"></i> Ver detalhes</button>
          <button class="btn btn-primary btn-small" data-approve><i class="fa-solid fa-check"></i> Aprovar</button>
          <button class="btn btn-secondary btn-small" data-reject><i class="fa-solid fa-xmark"></i> Rejeitar</button>
        </div>`;
      card.querySelector('[data-view]').addEventListener('click', () => openDetails(item));
      card.querySelector('[data-approve]').addEventListener('click', () => updateStatus(item.id, 'approved'));
      card.querySelector('[data-reject]').addEventListener('click', () => updateStatus(item.id, 'rejected'));
      cardsContainer.appendChild(card);
    });
  }

  function applyFilters() {
    const term = searchInput.value.trim().toLowerCase();
    const filtered = currentItems.filter(item => {
      if (currentFilter === 'test') return isTest(item);
      if (isTest(item)) return false;
      const statusOk = currentFilter === 'all' || item.paymentStatus === currentFilter;
      const searchOk = !term || [item.recipientName, item.messageText, item.senderName,
        item.senderContact, item.codigoGiftcard, item.youtubeLink]
        .some(v => String(v || '').toLowerCase().includes(term));
      return statusOk && searchOk;
    });
    renderCards(filtered);
  }

  async function loadMessages() {
    try {
      const r = await authFetch('/api/messages');
      if (r.status === 401) { sessionStorage.clear(); window.location.href = '/login'; return; }
      const data = await r.json();
      currentItems = Array.isArray(data) ? data : (data.messages || []);
      renderStats(currentItems);
      applyFilters();
    } catch {
      emptyState.style.display = 'grid';
      emptyState.querySelector('p').textContent = 'Falha ao carregar. Verifique o servidor.';
    }
  }

  async function updateStatus(id, status) {
    try {
      const r = await authFetch(`/api/messages/${encodeURIComponent(id)}/status`, {
        method: 'PATCH', body: JSON.stringify({ status })
      });
      if (!r.ok) throw new Error();
      await loadMessages();
    } catch { alert('Não foi possível atualizar o status.'); }
  }

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      applyFilters();
    });
  });
  searchInput.addEventListener('input', applyFilters);
  refreshBtn.addEventListener('click', loadMessages);

  // ════════════════════════════════════════════════════════════════════════════
  // ABA: GIFTCARDS
  // ════════════════════════════════════════════════════════════════════════════
  const gcTableBody  = document.getElementById('gcTableBody');
  const gcTable      = document.getElementById('gcTable');
  const gcEmptyState = document.getElementById('gcEmptyState');
  const gcSearch     = document.getElementById('gcSearch');
  const gcFeedback   = document.getElementById('gcFeedback');

  let allGiftcards = [];

  function gcStatusLabel(valido) { return valido ? 'Disponível' : 'Utilizado'; }
  function gcStatusClass(valido) { return valido ? 'status-approved' : 'status-used'; }

  function renderGiftcards(items) {
    gcTableBody.innerHTML = '';
    if (!items.length) {
      gcTable.style.display = 'none';
      gcEmptyState.style.display = 'grid';
      return;
    }
    gcTable.style.display = '';
    gcEmptyState.style.display = 'none';

    document.getElementById('gcStatTotal').textContent   = allGiftcards.length;
    document.getElementById('gcStatValidos').textContent = allGiftcards.filter(g => g.valido).length;
    document.getElementById('gcStatUsados').textContent  = allGiftcards.filter(g => !g.valido).length;

    items.forEach(gc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="gc-code-cell">${escapeHtml(gc.codigo)}</td>
        <td>${beneficiosPills(gc.beneficios)}</td>
        <td><span class="pill ${gcStatusClass(gc.valido)}">${gcStatusLabel(gc.valido)}</span></td>
        <td>${formatDate(gc.criadoEm)}</td>`;
      gcTableBody.appendChild(tr);
    });
  }

  function applyGcFilter() {
    const term = gcSearch.value.trim().toLowerCase();
    const filtered = term ? allGiftcards.filter(g => g.codigo.toLowerCase().includes(term)) : allGiftcards;
    renderGiftcards(filtered);
  }

  async function loadGiftcards() {
    try {
      const r = await authFetch('/api/admin/giftcards');
      if (r.status === 401) { sessionStorage.clear(); window.location.href = '/login'; return; }
      allGiftcards = await r.json();
      applyGcFilter();
    } catch {
      gcEmptyState.style.display = 'grid';
      gcEmptyState.querySelector('p').textContent = 'Falha ao carregar giftcards.';
    }
  }

  gcSearch.addEventListener('input', applyGcFilter);

  document.getElementById('openGcModalBtn').addEventListener('click', () => {
    gcFeedback.className = 'gc-feedback';
    gcFeedback.innerHTML = '';
    renderBenCheckboxes('gcAutoBeneficios');
    renderBenCheckboxes('gcImportBeneficios');
    openModal('gcModal');
  });

  function renderBenCheckboxes(containerId) {
    const c = document.getElementById(containerId);
    if (!c || c.dataset.rendered) return;
    c.dataset.rendered = '1';
    const BENS = [
      { key:'musica', icon:'🎵', label:'Música' },
      { key:'bombom', icon:'🍫', label:'Bombom' },
      { key:'rosa',   icon:'🌹', label:'Flor' },
      { key:'pirulito', icon:'🍭', label:'Pirulito' },
    ];
    BENS.forEach(b => {
      const lbl = document.createElement('label');
      lbl.className = 'gc-ben-label';
      lbl.innerHTML = `<input type="checkbox" name="${b.key}" /><span class="gc-ben-icon">${b.icon}</span>${b.label}`;
      c.appendChild(lbl);
    });
  }

  function getCheckedBeneficios(containerId) {
    const c = document.getElementById(containerId);
    const result = {};
    c.querySelectorAll('input[type=checkbox]').forEach(chk => { result[chk.name] = chk.checked; });
    return result;
  }

  // Troca de modo auto/importar
  const gcModeBtns    = document.querySelectorAll('.gc-tab-btn');
  const gcAutoPanel   = document.getElementById('gcAutoPanel');
  const gcImportPanel = document.getElementById('gcImportPanel');

  gcModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      gcModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      gcFeedback.className = 'gc-feedback';
      gcFeedback.innerHTML = '';
      if (btn.dataset.gcmode === 'auto') {
        gcAutoPanel.classList.add('visible');
        gcImportPanel.classList.remove('visible');
      } else {
        gcImportPanel.classList.add('visible');
        gcAutoPanel.classList.remove('visible');
      }
    });
  });

  // Gerar aleatório
  document.getElementById('gcGerarBtn').addEventListener('click', async () => {
    const btn = document.getElementById('gcGerarBtn');
    btn.disabled = true;
    btn.textContent = 'Gerando...';
    gcFeedback.className = 'gc-feedback';
    try {
      const ben = getCheckedBeneficios('gcAutoBeneficios');
      const r = await authFetch('/api/admin/giftcards/gerar', { method: 'POST', body: JSON.stringify(ben) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao gerar.');
      gcFeedback.className = 'gc-feedback success';
      gcFeedback.innerHTML = `<i class="fa-solid fa-check"></i> Código gerado: <strong>${escapeHtml(data.codigo)}</strong>`;
      await loadGiftcards();
    } catch (e) {
      gcFeedback.className = 'gc-feedback error';
      gcFeedback.innerHTML = `<i class="fa-solid fa-xmark"></i> ${escapeHtml(e.message)}`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Gerar código';
    }
  });

  // Importar em massa
  document.getElementById('gcImportBtn').addEventListener('click', async () => {
    const raw = document.getElementById('gcImportInput').value;
    const codigos = raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
    if (!codigos.length) {
      gcFeedback.className = 'gc-feedback error';
      gcFeedback.innerHTML = '<i class="fa-solid fa-xmark"></i> Nenhum código digitado.';
      return;
    }
    const btn = document.getElementById('gcImportBtn');
    btn.disabled = true;
    btn.textContent = 'Importando...';
    gcFeedback.className = 'gc-feedback';
    try {
      const ben = getCheckedBeneficios('gcImportBeneficios');
      const r = await authFetch('/api/admin/giftcards/importar', {
        method: 'POST', body: JSON.stringify({ codigos, ...ben })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao importar.');
      const { adicionados, repetidos, codigosRepetidos } = data;
      if (adicionados > 0 && repetidos === 0) {
        gcFeedback.className = 'gc-feedback success';
        gcFeedback.innerHTML = `<i class="fa-solid fa-check"></i> <strong>${adicionados}</strong> código${adicionados !== 1 ? 's' : ''} adicionado${adicionados !== 1 ? 's' : ''}.`;
      } else if (adicionados > 0) {
        gcFeedback.className = 'gc-feedback warn';
        gcFeedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <strong>${adicionados}</strong> adicionados, <strong>${repetidos}</strong> ignorados.
          ${codigosRepetidos?.length ? `<div class="gc-repeat-list">${codigosRepetidos.map(escapeHtml).join(', ')}</div>` : ''}`;
      } else {
        gcFeedback.className = 'gc-feedback error';
        gcFeedback.innerHTML = `<i class="fa-solid fa-xmark"></i> Todos os <strong>${repetidos}</strong> já existem no banco.`;
      }
      if (adicionados > 0) { document.getElementById('gcImportInput').value = ''; await loadGiftcards(); }
    } catch (e) {
      gcFeedback.className = 'gc-feedback error';
      gcFeedback.innerHTML = `<i class="fa-solid fa-xmark"></i> ${escapeHtml(e.message)}`;
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-file-import"></i> Importar códigos';
    }
  });

  // ════════════════════════════════════════════════════════════════════════════
  // ABA: USUÁRIOS
  // ════════════════════════════════════════════════════════════════════════════
  let allUsers = [];

  async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    const empty = document.getElementById('usersEmptyState');
    if (!tbody) return;
    try {
      const r = await authFetch('/api/admin/users');
      if (!r.ok) throw new Error();
      allUsers = await r.json();
      tbody.innerHTML = '';
      if (!allUsers.length) { empty.style.display = 'grid'; return; }
      empty.style.display = 'none';
      allUsers.forEach(u => {
        const tr = document.createElement('tr');
        const isSelf = u.username === sessionStorage.getItem('ce_username');
        tr.innerHTML = `
          <td style="font-weight:600;">${escapeHtml(u.username)} ${isSelf ? '<span style="font-size:.75rem;color:var(--muted)">(você)</span>' : ''}</td>
          <td><span class="pill ${u.role==='admin'?'status-approved':'status-pending_review'}">${u.role==='admin'?'Admin':'Vendedor'}</span></td>
          <td>${formatDate(u.criadoEm)}</td>
          <td>
            <button class="btn btn-secondary btn-small" data-edit-user="${escapeHtml(String(u.id))}" data-username="${escapeHtml(u.username)}" data-role="${escapeHtml(u.role)}">
              <i class="fa-solid fa-pen"></i> Editar
            </button>
            ${!isSelf ? `<button class="btn btn-secondary btn-small" style="color:#dc2626;border-color:#dc2626;margin-left:6px;" data-del-user="${escapeHtml(String(u.id))}">
              <i class="fa-solid fa-trash"></i>
            </button>` : ''}
          </td>`;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('[data-edit-user]').forEach(btn => {
        btn.addEventListener('click', () => openUserModal(btn.dataset.editUser, btn.dataset.username, btn.dataset.role));
      });
      tbody.querySelectorAll('[data-del-user]').forEach(btn => {
        btn.addEventListener('click', () => deleteUser(btn.dataset.delUser));
      });
    } catch {
      if (empty) { empty.style.display = 'grid'; empty.querySelector('p').textContent = 'Falha ao carregar usuários.'; }
    }
  }

  // Modal de usuário (criar / editar)
  function openUserModal(id = null, username = '', role = 'vendedor') {
    const isEdit = !!id;
    document.getElementById('userModalTitle').textContent = isEdit ? 'Editar usuário' : 'Novo usuário';
    document.getElementById('userModalSubtitle').textContent = isEdit ? `Editando: ${username}` : 'Preencha os dados do novo usuário.';
    const unameField = document.getElementById('userModalUsername');
    unameField.value = username;
    unameField.disabled = isEdit;
    document.getElementById('userModalPassword').value = '';
    document.getElementById('userModalPasswordHint').textContent = isEdit ? 'Deixe em branco para não alterar.' : 'Mínimo de 6 caracteres.';
    const roleSelect = document.getElementById('userModalRole');
    roleSelect.value = role;
    document.getElementById('userModalFeedback').className = 'gc-feedback';
    document.getElementById('userModalFeedback').textContent = '';
    document.getElementById('userModalSaveBtn').dataset.userId = id || '';
    openModal('userModal');
  }

  document.getElementById('openUserModalBtn')?.addEventListener('click', () => openUserModal());

  document.getElementById('userModalSaveBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('userModalSaveBtn');
    const userId = btn.dataset.userId;
    const isEdit = !!userId;
    const feedback = document.getElementById('userModalFeedback');
    const username = document.getElementById('userModalUsername').value.trim();
    const password = document.getElementById('userModalPassword').value;
    const role     = document.getElementById('userModalRole').value;

    if (!isEdit && (!username || !password)) {
      feedback.className = 'gc-feedback error'; feedback.textContent = 'Preencha todos os campos.'; return;
    }
    if (password && password.length < 6) {
      feedback.className = 'gc-feedback error'; feedback.textContent = 'Senha deve ter ao menos 6 caracteres.'; return;
    }

    btn.disabled = true; btn.textContent = 'Salvando...';
    feedback.className = 'gc-feedback'; feedback.textContent = '';

    try {
      let r;
      if (isEdit) {
        const body = { role };
        if (password) body.password = password;
        r = await authFetch(`/api/admin/users/${userId}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        r = await authFetch('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
      }
      const data = await r.json();
      if (!r.ok) { feedback.className = 'gc-feedback error'; feedback.textContent = data.error || 'Erro ao salvar.'; return; }
      feedback.className = 'gc-feedback success';
      feedback.textContent = isEdit ? 'Usuário atualizado!' : `Usuário "${data.username}" criado!`;
      await loadUsers();
      setTimeout(() => closeModal('userModal'), 1200);
    } catch {
      feedback.className = 'gc-feedback error'; feedback.textContent = 'Erro ao conectar ao servidor.';
    } finally {
      btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar';
    }
  });

  async function deleteUser(id) {
    const u = allUsers.find(x => String(x.id) === String(id));
    if (!confirm(`Deletar o usuário "${u?.username}"? Esta ação não pode ser desfeita.`)) return;
    try {
      const r = await authFetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await r.json();
      if (!r.ok) { alert(data.error || 'Erro ao deletar.'); return; }
      await loadUsers();
    } catch { alert('Erro ao conectar ao servidor.'); }
  }

  // ── Init ─────────────────────────────────────────────────────────────────────
  loadMessages();
});