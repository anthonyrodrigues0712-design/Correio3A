const rainContainer = document.getElementById('rain-container');

function startHeartRain() {
  const heartCount = 100;

  for (let i = 0; i < heartCount; i++) {
    setTimeout(() => {
      if (!rainContainer) return;

      const heart = document.createElement('div');
      heart.innerHTML = Math.random() > 0.5 ? '❤️' : '💗';
      heart.className = 'heart-rain';

      heart.style.left = Math.random() * 100 + 'vw';
      heart.style.top = '-12vh';
      heart.style.animationDuration = (Math.random() * 2 + 2) + 's';
      heart.style.fontSize = (Math.random() * 20 + 10) + 'px';
      heart.style.opacity = (0.45 + Math.random() * 0.55).toFixed(2);

      rainContainer.appendChild(heart);

      setTimeout(() => heart.remove(), 4500);
    }, i * 40);
  }
}

function spawnClickHeart(x, y, emoji = '💗') {
  const heart = document.createElement('span');
  heart.className = 'click-heart';
  heart.textContent = emoji;
  heart.style.left = `${x}px`;
  heart.style.top = `${y}px`;
  heart.style.fontSize = `${14 + Math.random() * 18}px`;
  heart.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 24 - 12}deg)`;
  document.body.appendChild(heart);
  window.setTimeout(() => heart.remove(), 950);
}

function burstHeartsAroundElement(element, count = 12) {
  if (!element) return;

  const rect = element.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;

  for (let i = 0; i < count; i++) {
    const heart = document.createElement('span');
    heart.className = 'click-heart button-heart';
    heart.textContent = Math.random() > 0.5 ? '💗' : '💖';

    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
    const distance = 28 + Math.random() * 32;
    const x = originX + Math.cos(angle) * distance;
    const y = originY + Math.sin(angle) * distance;

    heart.style.left = `${x}px`;
    heart.style.top = `${y}px`;
    heart.style.fontSize = `${12 + Math.random() * 14}px`;
    heart.style.setProperty('--tx', `${Math.cos(angle) * (36 + Math.random() * 26)}px`);
    heart.style.setProperty('--ty', `${-24 - Math.random() * 48}px`);

    document.body.appendChild(heart);
    window.setTimeout(() => heart.remove(), 1050);
  }
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (
    target.closest('input') ||
    target.closest('textarea') ||
    target.closest('select') ||
    target.closest('button') ||
    target.closest('a')
  ) {
    return;
  }
  spawnClickHeart(event.clientX, event.clientY, Math.random() > 0.5 ? '💗' : '💕');
});


// ── Animação de envio: envelope voa ─────────────────────────────────────────
function playEnvelopeFlyAnimation(onDone) {
  const stage      = document.getElementById('send-envelope-stage');
  const envelope   = document.getElementById('flyEnvelope');
  const flap       = document.getElementById('flyFlap');
  const successMsg = document.getElementById('feSuccessMsg');
  const closeBtn   = document.getElementById('feCloseBtn');

  if (!stage || !envelope) { if (onDone) onDone(); return; }

  // Reset
  envelope.style.animation   = 'none';
  envelope.style.opacity     = '0';
  successMsg.classList.remove('visible');
  flap.style.transform       = 'rotateX(180deg)'; // começa aberta

  // Ativa o palco
  stage.classList.add('active');
  stage.setAttribute('aria-hidden', 'false');

  // Fase 1 — envelope aparece no centro já com a aba aberta
  flap.style.transition = 'none';
  flap.style.transform  = 'rotateX(180deg)';
  envelope.style.animation = 'fe-appear 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards';

  // Fase 2 — aba fecha (volta à posição original) antes de voar
  setTimeout(() => {
    flap.style.transition = 'transform 0.5s cubic-bezier(0.4,0,0.2,1)';
    flap.style.transform  = 'rotateX(0deg)';
  }, 600);

  setTimeout(() => {
    envelope.style.animation = 'fe-fly 1.8s cubic-bezier(0.4,0,0.6,1) forwards';
    startHeartRain();
  }, 1200);

  // Fase 3 — mensagem de sucesso aparece
  setTimeout(() => {
    envelope.style.display = 'none';
    successMsg.classList.add('visible');
  }, 2600);

  // Botão fechar
  function handleClose() {
    stage.classList.remove('active');
    stage.setAttribute('aria-hidden', 'true');
    envelope.style.display = '';
    envelope.style.animation = 'none';
    envelope.style.opacity  = '0';
    successMsg.classList.remove('visible');
    closeBtn.removeEventListener('click', handleClose);
    if (onDone) onDone();
  }
  closeBtn.addEventListener('click', handleClose);
}


// ── Exibe erro de envio de forma amigável ────────────────────────────────────
function showSendError(title, message, showGiftcardLink) {
  const stage = document.getElementById('send-envelope-stage');
  const successMsg = document.getElementById('feSuccessMsg');

  // Reutiliza o stage da animação para exibir o erro
  if (stage && successMsg) {
    const envelope = document.getElementById('flyEnvelope');
    if (envelope) envelope.style.display = 'none';

    successMsg.innerHTML = `
      <span class="fe-icon">💌</span>
      <h2 style="font-family:'Poppins',sans-serif; font-size:1.3rem;">${title}</h2>
      <p>${message}</p>
      ${showGiftcardLink ? `
        <p style="margin-top:4px; font-size:0.88rem;">
          Compre um novo pelo
          <a href="https://wa.me/5575999038401" target="_blank" style="color:#25d366;font-weight:600;">WhatsApp</a>
          ou pelo
          <a href="https://instagram.com/terceiraoaif_" target="_blank" style="color:#cc2366;font-weight:600;">Instagram</a>.
        </p>` : ''}
      <button type="button" class="btn btn-primary" id="feCloseBtn">Fechar</button>
    `;
    successMsg.classList.add('visible');
    stage.classList.add('active');
    stage.setAttribute('aria-hidden', 'false');

    document.getElementById('feCloseBtn').addEventListener('click', () => {
      stage.classList.remove('active');
      stage.setAttribute('aria-hidden', 'true');
      successMsg.classList.remove('visible');
      if (envelope) { envelope.style.display = ''; envelope.style.opacity = '0'; }
    });
  } else {
    alert(`${title}\n\n${message}`);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // ── Lógica de Entrada (index.html) ──────────────────────────────────────────
  const overlayMain = document.getElementById('envelope-overlay');
  const btnEntrar = document.getElementById('btn-entrar');
  const audioFundo = document.getElementById('theme') || document.getElementById('audioFundo');

  if (btnEntrar && overlayMain) {
    document.body.style.overflow = 'hidden';

    btnEntrar.addEventListener('click', () => {
      if (audioFundo) {
        audioFundo.play().catch(erro => console.warn("Áudio não pôde ser tocado:", erro));
      }
      overlayMain.classList.add('hidden');
      document.body.style.overflow = '';
      setTimeout(() => overlayMain.remove(), 1500);
    });
  }

  // ── Lógica do Giftcard (enviar.html) ────────────────────────────────────────
  const overlayCode = document.getElementById('code-overlay');
  const btnVerificar = document.getElementById('btn-verificar');
  const giftcardInput = document.getElementById('giftcardInput');
  const codeError = document.getElementById('code-error');
  let codigoValidado = null;
  let beneficiosValidados = {}; // ← guarda os benefícios do código validado

  // Pré-preenche o código via query string (?codigo=ABC-123)
  if (giftcardInput) {
    const params = new URLSearchParams(window.location.search);
    const codigoParam = params.get('codigo');
    if (codigoParam) giftcardInput.value = codigoParam.toUpperCase();
  }

  if (overlayCode && btnVerificar) {
    document.body.style.overflow = 'hidden';

    const btnSemCodigo = document.getElementById('btn-sem-codigo');
    const semCodigoInfo = document.getElementById('sem-codigo-info');

    if (btnSemCodigo && semCodigoInfo) {
      btnSemCodigo.addEventListener('click', () => {
        const aberto = semCodigoInfo.style.display !== 'none';
        semCodigoInfo.style.display = aberto ? 'none' : 'block';
        btnSemCodigo.textContent = aberto ? 'Não tenho um código' : 'Fechar';
      });
    }

    btnVerificar.addEventListener('click', async () => {
      const codigo = giftcardInput.value.trim().toUpperCase();
      if (!codigo) {
        codeError.textContent = 'Digite um código válido.';
        codeError.style.display = 'block';
        return;
      }

      btnVerificar.disabled = true;
      btnVerificar.textContent = 'Verificando...';
      codeError.style.display = 'none';

      try {
        const response = await fetch('/api/verificar-codigo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ codigo })
        });

        const data = await response.json();

        if (data.valid) {
          codigoValidado = codigo;
          beneficiosValidados = data.beneficios || {};
          aplicarBeneficios(beneficiosValidados);
          overlayCode.classList.add('hidden');
          document.body.style.overflow = '';
          setTimeout(() => overlayCode.remove(), 1500);
        } else if (data.error === 'too_many_attempts') {
          codeError.textContent = data.message || 'Muitas tentativas. Tente novamente mais tarde.';
          codeError.style.display = 'block';
          btnVerificar.disabled = true;
          giftcardInput.disabled = true;
        } else {
          const extra = (data.attemptsLeft !== undefined && data.attemptsLeft <= 10)
            ? ` (${data.attemptsLeft} tentativa${data.attemptsLeft !== 1 ? 's' : ''} restante${data.attemptsLeft !== 1 ? 's' : ''})`
            : '';
          codeError.textContent = (data.error || 'Código inválido.') + extra;
          codeError.style.display = 'block';
        }
      } catch (error) {
        codeError.textContent = 'Erro ao conectar ao servidor.';
        codeError.style.display = 'block';
      } finally {
        btnVerificar.disabled = false;
        btnVerificar.textContent = 'Validar Código';
      }
    });
  }

  // ── Aplica benefícios do giftcard ao formulário ──────────────────────────────
  function aplicarBeneficios(ben = {}) {
    const musicaField = document.getElementById('youtubeLink')?.closest('.field');
    if (musicaField) {
      const temMusica = ben.musica === true;
      musicaField.style.display = temMusica ? '' : 'none';
      const youtubeLinkEl = document.getElementById('youtubeLink');
      if (youtubeLinkEl && !temMusica) youtubeLinkEl.value = '';
    }
  }

  // ── Monta lista de itens do giftcard para o resumo ───────────────────────────
  const BEN_INFO = {
    musica:   { icon: '🎵', label: 'Música dedicada' },
    bombom:   { icon: '🍫', label: 'Bombom' },
    rosa:     { icon: '🌹', label: 'Flor' },
    pirulito: { icon: '🍭', label: 'Pirulito' },
  };

  function renderConfirmBeneficios(ben = {}) {
    const el = document.getElementById('confirmBeneficios');
    if (!el) return;
    const extras = Object.entries(ben).filter(([,v]) => v).map(([k]) => {
      const info = BEN_INFO[k] || { icon: '🎁', label: k };
      return `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:.82rem;font-weight:700;background:rgba(255,84,113,.1);color:#ff5471;border:1px solid rgba(255,84,113,.2);">${info.icon} ${info.label}</span>`;
    });
    el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;font-size:.82rem;font-weight:700;background:rgba(255,84,113,.1);color:#ff5471;border:1px solid rgba(255,84,113,.2);">💌 Carta</span>` + extras.join('');
  }

  // ── Lógica do Formulário (enviar.html) ──────────────────────────────────────
  const form               = document.getElementById('booking-form');
  const senderModeInput    = document.getElementById('senderMode');
  const senderFields       = document.getElementById('senderFields');
  const senderNameInput    = document.getElementById('senderName');
  const senderContactInput = document.getElementById('senderContact');
  const recipientNameInput = document.getElementById('recipientName');
  const recipientClassInput  = document.getElementById('recipientClass');
  const recipientCourseInput = document.getElementById('recipientCourse');
  const youtubeLinkInput   = document.getElementById('youtubeLink');
  const messageTextInput   = document.getElementById('messageText');
  const segmentedButtons   = document.querySelectorAll('.segmented-btn');
  const submitBtn          = document.getElementById('submitBtn');
  const successModal       = document.getElementById('successModal');
  const closeSuccessBtn    = document.getElementById('closeSuccessBtn');

  // Modal de confirmação
  const confirmModal   = document.getElementById('confirmModal');
  const confirmBackdrop = document.getElementById('confirmBackdrop');
  const closeConfirmBtn = document.getElementById('closeConfirmBtn');
  const editBtn        = document.getElementById('editBtn');
  const confirmSendBtn = document.getElementById('confirmSendBtn');

  function updateSenderMode(mode) {
    if (!senderModeInput) return;
    senderModeInput.value = mode;
    segmentedButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.mode === mode));

    if (mode === 'anonymous') {
      if (senderNameInput)    { senderNameInput.value = '';    senderNameInput.removeAttribute('required');    senderNameInput.disabled = true; }
      if (senderContactInput) { senderContactInput.value = ''; senderContactInput.removeAttribute('required'); senderContactInput.disabled = true; }
      if (senderFields) senderFields.style.opacity = '0.4';
    } else {
      if (senderNameInput)    { senderNameInput.disabled = false;    senderNameInput.setAttribute('required', 'required'); }
      if (senderContactInput) { senderContactInput.disabled = false; senderContactInput.setAttribute('required', 'required'); }
      if (senderFields) senderFields.style.opacity = '1';
    }
  }

  segmentedButtons.forEach(button => {
    button.addEventListener('click', () => {
      burstHeartsAroundElement(button, 14);
      updateSenderMode(button.dataset.mode);
    });
  });

  function closeConfirmModal() {
    if (!confirmModal) return;
    confirmModal.classList.remove('open');
    confirmModal.setAttribute('aria-hidden', 'true');
  }

  if (closeConfirmBtn)  closeConfirmBtn.addEventListener('click', closeConfirmModal);
  if (confirmBackdrop)  confirmBackdrop.addEventListener('click', closeConfirmModal);
  if (editBtn)          editBtn.addEventListener('click', closeConfirmModal);

  if (closeSuccessBtn) {
    closeSuccessBtn.addEventListener('click', () => {
      successModal.classList.remove('open');
      successModal.setAttribute('aria-hidden', 'true');
    });
  }

  async function enviarRecado() {
    const senderMode      = senderModeInput?.value === 'anonymous' ? 'anonymous' : 'identified';
    const recipientName   = (recipientNameInput?.value || '').trim();
    const recipientClass  = (recipientClassInput?.value || '').trim();
    const recipientCourse = (recipientCourseInput?.value || '').trim();
    const messageText     = (messageTextInput?.value || '').trim();
    const senderName      = senderMode === 'anonymous' ? '' : (senderNameInput?.value || '').trim();
    const senderContact   = senderMode === 'anonymous' ? '' : (senderContactInput?.value || '').trim();
    const youtubeLink     = (youtubeLinkInput?.value || '').trim();

    burstHeartsAroundElement(confirmSendBtn, 16);
    startHeartRain();
    closeConfirmModal();

    if (confirmSendBtn) {
      confirmSendBtn.disabled = true;
      confirmSendBtn.textContent = 'Enviando...';
    }

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientName,
          recipientClass,
          recipientCourse,
          messageText,
          senderMode,
          senderName,
          senderContact,
          youtubeLink,
          codigoGiftcard: codigoValidado
        })
      });

      const result = await response.json();
      if (!response.ok) {
        const err = new Error(result.message || result.error || 'Erro desconhecido.');
        err.code = result.error;
        throw err;
      }

      form.reset();
      updateSenderMode('identified');
      codigoValidado = null;

      playEnvelopeFlyAnimation(() => {
        // nada extra após fechar
      });
    } catch (error) {
      if (error.code === 'code_already_used') {
        showSendError(
          '💔 Código já utilizado',
          'Este código foi usado por outra pessoa antes do seu envio. Por favor, adquira um novo Giftcard.',
          true
        );
      } else {
        showSendError(
          '⚠️ Erro ao enviar',
          'Ocorreu um erro no servidor ao tentar salvar sua carta. Tente novamente em alguns instantes.',
          false
        );
      }
    } finally {
      if (confirmSendBtn) {
        confirmSendBtn.disabled = false;
        confirmSendBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Confirmar e Enviar';
      }
    }
  }

  if (confirmSendBtn) confirmSendBtn.addEventListener('click', enviarRecado);

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();

      if (overlayCode && !codigoValidado) {
        alert('Você precisa validar um código giftcard primeiro.');
        return;
      }

      const senderMode      = senderModeInput?.value === 'anonymous' ? 'anonymous' : 'identified';
      const recipientName   = (recipientNameInput?.value || '').trim();
      const recipientClass  = (recipientClassInput?.value || '').trim();
      const recipientCourse = (recipientCourseInput?.value || '').trim();
      const messageText     = (messageTextInput?.value || '').trim();
      const senderName      = senderMode === 'anonymous' ? 'Anônimo' : (senderNameInput?.value || '').trim();
      const senderContact   = senderMode === 'anonymous' ? '—' : (senderContactInput?.value || '').trim();
      const youtubeLink     = (youtubeLinkInput?.value || '').trim();

      const el = (id) => document.getElementById(id);
      if (el('confirmRecipient')) el('confirmRecipient').textContent = recipientName || '—';
      if (el('confirmClass'))     el('confirmClass').textContent     = recipientClass  || 'Não informada';
      if (el('confirmCourse'))    el('confirmCourse').textContent    = recipientCourse || 'Não informado';
      if (el('confirmSender'))    el('confirmSender').textContent    = senderName    || '—';
      if (el('confirmContact'))   el('confirmContact').textContent   = senderContact || '—';
      if (el('confirmMusic'))     el('confirmMusic').textContent     = youtubeLink   || 'Nenhuma';
      if (el('confirmMessage'))   el('confirmMessage').textContent   = messageText   || '—';
      renderConfirmBeneficios(beneficiosValidados);

      burstHeartsAroundElement(submitBtn, 14);
      confirmModal.classList.add('open');
      confirmModal.setAttribute('aria-hidden', 'false');
    });

    updateSenderMode('identified');
  }
});