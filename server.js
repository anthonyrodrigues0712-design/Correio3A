const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'messages.json');
const DB_FILE   = path.join(DATA_DIR, 'giftcards.db');

// Código mestre para testes — nunca é queimado
const MASTER_CODE = 'CORREIO-MASTER-2026';

// Benefícios disponíveis
const BENEFICIOS = ['musica', 'bombom', 'rosa', 'pirulito'];

// ─── Sessões em memória ────────────────────────────────────────────────────────
// Map<token, { userId, role, expiresAt }>
const sessions = new Map();
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 horas

function createSession(userId, role) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, role, expiresAt: Date.now() + SESSION_TTL });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(token); return null; }
  return s;
}

// Limpa sessões expiradas a cada hora
setInterval(() => {
  const now = Date.now();
  for (const [t, s] of sessions) if (now > s.expiresAt) sessions.delete(t);
}, 60 * 60 * 1000);

// ─── Helpers de senha ──────────────────────────────────────────────────────────
function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const { hash: h } = hashPassword(password, salt);
  return h === hash;
}

// Abre o banco já existente — não tenta criar nada
const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('[ERRO FATAL] Não foi possível abrir o banco SQLite:', err.message);
    console.error('Verifique se o arquivo existe em:', DB_FILE);
    process.exit(1);
  }
  console.log('[OK] Banco SQLite aberto em:', DB_FILE);
});

// Migrações: adiciona colunas que podem não existir em bancos antigos
// O callback ignora o erro se a coluna já existir — comportamento esperado do SQLite
db.serialize(() => {
  db.run(`ALTER TABLE cards ADD COLUMN criadoEm  TEXT`,    () => {});
  db.run(`ALTER TABLE cards ADD COLUMN musica    INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE cards ADD COLUMN bombom    INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE cards ADD COLUMN rosa      INTEGER DEFAULT 0`, () => {});
  db.run(`ALTER TABLE cards ADD COLUMN pirulito  INTEGER DEFAULT 0`, () => {});

  // Tabela de usuários (admin e vendedores)
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      username  TEXT    NOT NULL UNIQUE,
      hash      TEXT    NOT NULL,
      salt      TEXT    NOT NULL,
      role      TEXT    NOT NULL DEFAULT 'vendedor',
      criadoEm TEXT    NOT NULL
    )
  `, () => {
    // Cria admin padrão se não existir
    db.get(`SELECT id FROM users WHERE username = 'admin'`, [], (err, row) => {
      if (!row) {
        const { hash, salt } = hashPassword('admin123');
        db.run(
          `INSERT INTO users (username, hash, salt, role, criadoEm) VALUES (?, ?, ?, 'admin', ?)`,
          ['admin', hash, salt, new Date().toISOString()],
          () => console.log('[OK] Usuário admin padrão criado. Troque a senha no painel!')
        );
      }
    });
  });
});

app.use(express.json({ limit: '1mb' }));

// ─── Middleware de autenticação ────────────────────────────────────────────────
function requireAuth(role) {
  return (req, res, next) => {
    const token = req.headers['x-auth-token'] || req.query._token;
    const session = getSession(token);
    if (!session) return res.status(401).json({ error: 'unauthorized', message: 'Faça login primeiro.' });
    if (role && session.role !== role && session.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden', message: 'Acesso negado.' });
    }
    req.session = session;
    next();
  };
}

app.use(express.static(__dirname));

// ─── Helpers JSON ─────────────────────────────────────────────────────────────

async function readMessages() {
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.messages)) return parsed.messages;
  return [];
}

async function writeMessages(messages) {
  await fs.writeFile(DATA_FILE, JSON.stringify({ messages }, null, 2), 'utf8');
}

// Extrai os benefícios de uma row do SQLite e retorna objeto { musica, bombom, rosa, pirulito }
function extrairBeneficios(row) {
  const b = {};
  for (const ben of BENEFICIOS) b[ben] = row[ben] === 1;
  return b;
}

// Extrai e valida benefícios de um body de requisição
function parseBeneficios(body = {}) {
  const b = {};
  for (const ben of BENEFICIOS) b[ben] = body[ben] === true || body[ben] === 1 ? 1 : 0;
  return b;
}

// ─── Rate limit ───────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX    = 30;
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const failedAttempts    = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of failedAttempts) {
    if (now - entry.firstAt > RATE_LIMIT_WINDOW) failedAttempts.delete(ip);
  }
}, 5 * 60 * 1000);

function getRateEntry(ip) {
  const now = Date.now();
  const entry = failedAttempts.get(ip);
  if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW) return { count: 0, firstAt: now };
  return entry;
}

function recordFailure(ip) {
  const entry = getRateEntry(ip);
  entry.count += 1;
  failedAttempts.set(ip, entry);
}

function clearFailures(ip)  { failedAttempts.delete(ip); }
function isBlocked(ip)      { return getRateEntry(ip).count >= RATE_LIMIT_MAX; }

// ─── Rotas de autenticação ─────────────────────────────────────────────────────

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Preencha usuário e senha.' });

  db.get(`SELECT * FROM users WHERE username = ?`, [username.trim().toLowerCase()], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro interno.' });
    if (!row || !verifyPassword(password, row.hash, row.salt)) {
      return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }
    const token = createSession(row.id, row.role);
    res.json({ ok: true, token, role: row.role, username: row.username });
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['x-auth-token'];
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = req.headers['x-auth-token'];
  const session = getSession(token);
  if (!session) return res.status(401).json({ error: 'unauthorized' });
  db.get(`SELECT id, username, role, criadoEm FROM users WHERE id = ?`, [session.userId], (err, row) => {
    if (err || !row) return res.status(500).json({ error: 'Erro interno.' });
    res.json({ ok: true, user: row });
  });
});

// ─── Gerenciamento de usuários (somente admin) ─────────────────────────────────

app.get('/api/admin/users', requireAuth('admin'), (_req, res) => {
  db.all(`SELECT id, username, role, criadoEm FROM users ORDER BY criadoEm DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.post('/api/admin/users', requireAuth('admin'), (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Usuário e senha obrigatórios.' });
  if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
  const validRoles = ['admin', 'vendedor'];
  const userRole = validRoles.includes(role) ? role : 'vendedor';
  const { hash, salt } = hashPassword(password);
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_\-\.]/g, '');
  if (!clean) return res.status(400).json({ error: 'Nome de usuário inválido.' });

  db.run(
    `INSERT INTO users (username, hash, salt, role, criadoEm) VALUES (?, ?, ?, ?, ?)`,
    [clean, hash, salt, userRole, new Date().toISOString()],
    function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Nome de usuário já existe.' });
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ ok: true, id: this.lastID, username: clean, role: userRole });
    }
  );
});

app.patch('/api/admin/users/:id', requireAuth('admin'), (req, res) => {
  const { id } = req.params;
  const { password, role } = req.body || {};
  const updates = [];
  const vals = [];
  if (password) {
    if (password.length < 6) return res.status(400).json({ error: 'Senha deve ter ao menos 6 caracteres.' });
    const { hash, salt } = hashPassword(password);
    updates.push('hash = ?', 'salt = ?');
    vals.push(hash, salt);
  }
  if (role && ['admin', 'vendedor'].includes(role)) { updates.push('role = ?'); vals.push(role); }
  if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
  vals.push(id);
  db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, vals, function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true });
  });
});

app.delete('/api/admin/users/:id', requireAuth('admin'), (req, res) => {
  const { id } = req.params;
  // Não pode deletar a si mesmo
  if (req.session.userId == id) return res.status(400).json({ error: 'Não é possível deletar o próprio usuário.' });
  db.run(`DELETE FROM users WHERE id = ?`, [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true });
  });
});

// ─── Rotas públicas ───────────────────────────────────────────────────────────

// Verifica a validade do Giftcard (retorna também os benefícios)
app.post('/api/verificar-codigo', (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ valid: false, error: 'Código vazio.' });

  const ip = req.ip || req.socket.remoteAddress;

  if (isBlocked(ip)) {
    const entry = failedAttempts.get(ip);
    const restamMin = Math.ceil((RATE_LIMIT_WINDOW - (Date.now() - entry.firstAt)) / 60000);
    console.warn(`[RATE LIMIT] IP bloqueado: ${ip}`);
    return res.status(429).json({
      valid: false,
      error: 'too_many_attempts',
      message: `Muitas tentativas incorretas. Tente novamente em ${restamMin} minuto${restamMin > 1 ? 's' : ''}.`
    });
  }

  if (codigo.toUpperCase() === MASTER_CODE) {
    clearFailures(ip);
    // Código mestre tem todos os benefícios
    return res.json({ valid: true, beneficios: { musica: true, bombom: true, rosa: true, pirulito: true } });
  }

  db.get(
    `SELECT valido, musica, bombom, rosa, pirulito FROM cards WHERE codigo = ?`,
    [codigo.toUpperCase()],
    (err, row) => {
      if (err) return res.status(500).json({ valid: false, error: 'Erro no servidor.' });

      if (!row || row.valido === 0) {
        recordFailure(ip);
        const restantes = RATE_LIMIT_MAX - getRateEntry(ip).count;
        const error = !row ? 'Código inexistente.' : 'Código já utilizado.';
        return res.status(!row ? 404 : 400).json({
          valid: false, error,
          attemptsLeft: restantes > 0 ? restantes : 0
        });
      }

      clearFailures(ip);
      return res.json({ valid: true, beneficios: extrairBeneficios(row) });
    }
  );
});

// Salva a mensagem e invalida o Giftcard
app.post('/api/messages', async (req, res) => {
  try {
    const {
      recipientName, recipientClass, recipientCourse,
      messageText, senderMode, senderName,
      senderContact, youtubeLink, codigoGiftcard
    } = req.body || {};

    if (!recipientName || !messageText || !codigoGiftcard) {
      return res.status(400).json({ error: 'Campos obrigatórios ou código ausentes.' });
    }

    const isMaster = codigoGiftcard.toUpperCase() === MASTER_CODE;

    if (isMaster) {
      try {
        const messages = await readMessages();
        const item = {
          id: `MSG-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          recipientName,
          recipientClass:  recipientClass  || '',
          recipientCourse: recipientCourse || '',
          messageText: '[MENSAGEM TESTE] ' + messageText,
          senderMode,
          senderName:    senderMode === 'anonymous' ? 'Anônimo' : senderName,
          senderContact: senderMode === 'anonymous' ? '' : (senderContact || ''),
          youtubeLink:   youtubeLink || '',
          beneficios:    { musica: true, bombom: true, rosa: true, pirulito: true },
          paymentMethod: 'master',
          paymentStatus: 'test',
          codigoGiftcard: MASTER_CODE,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        messages.unshift(item);
        await writeMessages(messages);
        console.log('[TESTE] Mensagem de teste registrada via código mestre.');
        return res.status(201).json({ ok: true, message: item });
      } catch (fileErr) {
        console.error('[ERRO] Salvar JSON (master):', fileErr.message);
        return res.status(500).json({ error: 'server_error', message: 'Erro ao salvar a mensagem de teste.' });
      }
    }

    // Lê os benefícios antes de queimar o código
    db.get(
      `SELECT musica, bombom, rosa, pirulito FROM cards WHERE codigo = ? AND valido = 1`,
      [codigoGiftcard.toUpperCase()],
      (errGet, row) => {
        if (errGet) {
          console.error('[ERRO] Leitura de benefícios:', errGet.message);
          return res.status(500).json({ error: 'server_error', message: 'Erro interno.' });
        }
        if (!row) {
          return res.status(400).json({ error: 'code_already_used', message: 'Este código já foi utilizado ou não existe.' });
        }

        const beneficios = extrairBeneficios(row);

        // UPDATE atômico — só queima se ainda estiver válido
        db.run(
          `UPDATE cards SET valido = 0 WHERE codigo = ? AND valido = 1`,
          [codigoGiftcard.toUpperCase()],
          async function (updateErr) {
            if (updateErr) {
              console.error('[ERRO] UPDATE atômico:', updateErr.message);
              return res.status(500).json({ error: 'server_error', message: 'Erro interno ao processar o código.' });
            }
            if (this.changes === 0) {
              return res.status(400).json({ error: 'code_already_used', message: 'Este código já foi utilizado por outra pessoa. Adquira um novo Giftcard.' });
            }

            try {
              const messages = await readMessages();
              const item = {
                id: `MSG-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
                recipientName,
                recipientClass:  recipientClass  || '',
                recipientCourse: recipientCourse || '',
                messageText,
                senderMode,
                senderName:    senderMode === 'anonymous' ? 'Anônimo' : senderName,
                senderContact: senderMode === 'anonymous' ? '' : (senderContact || ''),
                youtubeLink:   youtubeLink || '',
                beneficios,
                paymentMethod: 'giftcard',
                paymentStatus: 'approved',
                codigoGiftcard: codigoGiftcard.toUpperCase(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
              };
              messages.unshift(item);
              await writeMessages(messages);
              return res.status(201).json({ ok: true, message: item });
            } catch (fileErr) {
              console.error('[ERRO] Salvar JSON:', fileErr.message);
              return res.status(500).json({ error: 'server_error', message: 'Erro ao salvar a mensagem.' });
            }
          }
        );
      }
    );
  } catch (error) {
    console.error('[ERRO] /api/messages:', error.message);
    res.status(500).json({ error: 'server_error', message: 'Não foi possível salvar a mensagem.' });
  }
});

// Lista mensagens (admin)
app.get('/api/messages', requireAuth('vendedor'), async (_req, res) => {
  try { res.json(await readMessages()); }
  catch (error) { res.status(500).json({ error: error.message }); }
});

// Atualiza status de uma mensagem (admin)
app.patch('/api/messages/:id/status', requireAuth('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const messages = await readMessages();
    const index = messages.findIndex(m => m.id === id);
    if (index === -1) return res.status(404).json({ error: 'message_not_found' });
    messages[index].paymentStatus = status;
    messages[index].updatedAt = new Date().toISOString();
    await writeMessages(messages);
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// Estatísticas (admin)
app.get('/api/stats', requireAuth('vendedor'), async (_req, res) => {
  try {
    const messages = await readMessages();
    res.json({
      total:     messages.length,
      approved:  messages.filter(m => m.paymentStatus === 'approved').length,
      anonymous: messages.filter(m => m.senderMode === 'anonymous').length
    });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// ─── Rotas de Giftcards (admin/vendedor) ──────────────────────────────────────

// Lista todos os giftcards com benefícios
app.get('/api/admin/giftcards', requireAuth('vendedor'), (_req, res) => {
  db.all(
    `SELECT codigo, valido, criadoEm, musica, bombom, rosa, pirulito
     FROM cards ORDER BY criadoEm DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json((rows || []).map(row => ({ ...row, beneficios: extrairBeneficios(row) })));
    }
  );
});

// Gera um código aleatório único com benefícios
function gerarCodigoAleatorio(existentes) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums   = '23456789';
  const randL  = (n) => Array.from({ length: n }, () => letras[Math.floor(Math.random() * letras.length)]).join('');
  const randN  = (n) => Array.from({ length: n }, () => nums[Math.floor(Math.random() * nums.length)]).join('');
  let code, tentativas = 0;
  do {
    // Formato: ABC-123
    code = `${randL(3)}-${randN(3)}`;
    if (++tentativas > 500) throw new Error('Não foi possível gerar código único.');
  } while (existentes.has(code));
  return code;
}

app.post('/api/admin/giftcards/gerar', requireAuth('vendedor'), (req, res) => {
  const ben = parseBeneficios(req.body);

  db.all(`SELECT codigo FROM cards`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const existentes = new Set(rows.map(r => r.codigo));
    let code;
    try { code = gerarCodigoAleatorio(existentes); }
    catch (e) { return res.status(500).json({ error: e.message }); }

    const agora = new Date().toISOString();
    db.run(
      `INSERT INTO cards (codigo, valido, criadoEm, musica, bombom, rosa, pirulito)
       VALUES (?, 1, ?, ?, ?, ?, ?)`,
      [code, agora, ben.musica, ben.bombom, ben.rosa, ben.pirulito],
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.status(201).json({ ok: true, codigo: code, beneficios: extrairBeneficios(ben) });
      }
    );
  });
});

// Importa vários códigos com os mesmos benefícios para todos
app.post('/api/admin/giftcards/importar', requireAuth('vendedor'), (req, res) => {
  const { codigos } = req.body || {};
  if (!Array.isArray(codigos) || !codigos.length) {
    return res.status(400).json({ error: 'Nenhum código enviado.' });
  }

  const ben = parseBeneficios(req.body);
  const normalizados = [...new Set(codigos.map(c => String(c).trim().toUpperCase()).filter(Boolean))];

  db.all(`SELECT codigo FROM cards`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const existentes = new Set(rows.map(r => r.codigo));
    const novos      = normalizados.filter(c => !existentes.has(c));
    const repetidos  = normalizados.filter(c =>  existentes.has(c));

    if (!novos.length) {
      return res.json({ ok: true, adicionados: 0, repetidos: repetidos.length, codigosRepetidos: repetidos });
    }

    const agora = new Date().toISOString();
    const placeholders = novos.map(() => '(?, 1, ?, ?, ?, ?, ?)').join(', ');
    const valores = novos.flatMap(c => [c, agora, ben.musica, ben.bombom, ben.rosa, ben.pirulito]);

    db.run(
      `INSERT INTO cards (codigo, valido, criadoEm, musica, bombom, rosa, pirulito) VALUES ${placeholders}`,
      valores,
      function (err2) {
        if (err2) return res.status(500).json({ error: err2.message });
        res.status(201).json({ ok: true, adicionados: novos.length, repetidos: repetidos.length, codigosRepetidos: repetidos });
      }
    );
  });
});

// Apaga todos os giftcards (somente admin)
app.delete('/api/admin/giftcards', requireAuth('admin'), (_req, res) => {
  db.run(`DELETE FROM cards`, [], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true, deletados: this.changes });
  });
});

// Apaga todas as mensagens (somente admin)
app.delete('/api/admin/messages', requireAuth('admin'), async (_req, res) => {
  try {
    await writeMessages([]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Páginas estáticas ────────────────────────────────────────────────────────

app.get('/',        (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/enviar',  (_req, res) => res.sendFile(path.join(__dirname, 'enviar.html')));
app.get('/login',   (_req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/admin',   (_req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/vendedor',(_req, res) => res.sendFile(path.join(__dirname, 'vendedor.html')));

// ─── Inicialização ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[OK] Servidor rodando em http://localhost:${PORT}`);
});