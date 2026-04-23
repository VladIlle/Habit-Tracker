/**
 * =====================================================
 * HabitFlow - Backend API Server
 * Express.js + PostgreSQL
 * 
 * Funcționalități:
 *  - Autentificare JWT (user + admin)
 *  - CRUD habituiri cu frecvențe flexibile
 *  - Feed social cu like-uri
 *  - Mesaje de încurajare
 *  - Panou admin/moderator
 *  - Criptare AES-256-GCM pentru date sensibile
 *  - Audit log pentru acțiuni importante
 * =====================================================
 */

'use strict';

const express    = require('express');
const { Pool }   = require('pg');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const cors       = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURARE BAZA DE DATE
// =====================================================

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'habitflow',
  user:     process.env.DB_USER     || 'habitflow_user',
  password: process.env.DB_PASSWORD || '',
  // Pool de conexiuni: max 10 conexiuni simultane
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// =====================================================
// UTILITĂȚI DE CRIPTARE AES-256-GCM
// Criptăm: email, titlu habit, descriere, mesaje, detalii audit
// Format stocat: hex_iv:hex_authTag:hex_ciphertext
// =====================================================

// Cheia AES-256 vine din variabila de mediu (64 chars hex = 32 bytes)
const ENCRYPTION_KEY = Buffer.from(
  (process.env.ENCRYPTION_KEY || '0'.repeat(64)), 'hex'
);

/**
 * Criptează un string cu AES-256-GCM
 * @param {string} text - Textul de criptat
 * @returns {string|null} - Textul criptat sau null dacă input gol
 */
function encrypt(text) {
  if (text === null || text === undefined || text === '') return null;
  
  // IV aleatoriu de 16 bytes pentru fiecare operație (securitate maximă)
  const iv        = crypto.randomBytes(16);
  const cipher    = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
  
  let encrypted   = cipher.update(String(text), 'utf8', 'hex');
  encrypted      += cipher.final('hex');
  
  // Auth tag = verificare integritate (previne manipularea datelor)
  const authTag   = cipher.getAuthTag();
  
  // Stocăm IV + authTag + ciphertext, separate prin ':'
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decriptează un string criptat cu AES-256-GCM
 * @param {string} encryptedText - Textul criptat (format iv:authTag:ciphertext)
 * @returns {string|null} - Textul original sau null dacă input gol/invalid
 */
function decrypt(encryptedText) {
  if (!encryptedText) return null;
  
  try {
    const parts   = encryptedText.split(':');
    if (parts.length !== 3) return encryptedText; // date necriptate (compatibilitate)
    
    const iv        = Buffer.from(parts[0], 'hex');
    const authTag   = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher  = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted   = decipher.update(encrypted, 'hex', 'utf8');
    decrypted      += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    // Dacă decriptarea eșuează, returnăm null (nu expunem date corupte)
    console.error('Decryption error:', err.message);
    return null;
  }
}

// =====================================================
// MIDDLEWARE
// =====================================================

// CORS - permite cereri de la frontend
// OPTIONS + optionsSuccessStatus: 200 rezolvă eroarea 405 la preflight
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 200,
}));
// Răspunde explicit la preflight OPTIONS pe orice rută
app.options('*', cors());

// Parsare JSON pentru body-ul cererilor
app.use(express.json({ limit: '1mb' }));

// Middleware pentru înregistrare cereri (development)
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// =====================================================
// MIDDLEWARE AUTENTIFICARE JWT
// =====================================================

/**
 * Verifică token JWT și atașează user la req.user
 * Folosit pe toate rutele protejate
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  // Token-ul vine în header: "Authorization: Bearer <token>"
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token lipsă' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    req.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid sau expirat' });
  }
}

/**
 * Verifică că utilizatorul are rol de admin
 * Folosit pe rutele de administrare
 */
function adminMiddleware(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acces interzis - necesită drepturi admin' });
  }
  next();
}

// =====================================================
// UTILITĂȚI
// =====================================================

/**
 * Înregistrează o acțiune în audit log
 * @param {object} params - { userId, action, targetType, targetId, details, ipAddress }
 */
async function logAction({ userId, action, targetType, targetId, details, ipAddress }) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId || null,
        action,
        targetType || null,
        targetId || null,
        details ? encrypt(JSON.stringify(details)) : null,
        ipAddress || null,
      ]
    );
  } catch (err) {
    // Log-ul de audit nu trebuie să întrerupă fluxul principal
    console.error('Audit log error:', err.message);
  }
}

/**
 * Mapează un rând din DB habits la obiect decriptat
 */
function mapHabit(row) {
  if (!row) return null;
  return {
    id:              row.id,
    userId:          row.user_id,
    username:        row.username || null,
    avatarColor:     row.avatar_color || '#6366f1',
    title:           decrypt(row.title),
    description:     decrypt(row.description),
    isPublic:        row.is_public,
    color:           row.color,
    icon:            row.icon,
    frequencyType:   row.frequency_type,
    frequencyValue:  row.frequency_value,
    targetTime:      row.target_time,
    likesCount:      parseInt(row.likes_count) || 0,
    userLiked:       row.user_liked || false,
    completionsToday: parseInt(row.completions_today) || 0,
    createdAt:       row.created_at,
  };
}

/**
 * Mapează un rând din DB messages la obiect decriptat
 */
function mapMessage(row) {
  if (!row) return null;
  return {
    id:          row.id,
    senderId:    row.sender_id,
    senderName:  row.sender_name || null,
    senderColor: row.sender_color || '#6366f1',
    receiverId:  row.receiver_id,
    habitId:     row.habit_id,
    habitTitle:  row.habit_title ? decrypt(row.habit_title) : null,
    content:     decrypt(row.content),
    isRead:      row.is_read,
    createdAt:   row.created_at,
  };
}

// =====================================================
// INIȚIALIZARE CONT ADMIN
// Creat automat la prima pornire dacă nu există
// =====================================================

async function initAdmin() {
  try {
    const result = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );
    
    if (result.rows.length === 0) {
      // Nu există admin - îl creăm
      const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@HabitFlow2024!';
      const hash = await bcrypt.hash(adminPassword, 12);
      
      await pool.query(
        `INSERT INTO users (username, email, password_hash, role, avatar_color)
         VALUES ($1, $2, $3, 'admin', '#ef4444')`,
        ['admin', encrypt('admin@habitflow.local'), hash]
      );
      
      console.log('✅ Cont admin creat: username=admin');
    } else {
      console.log('✅ Cont admin existent detectat');
    }
  } catch (err) {
    console.error('❌ Eroare inițializare admin:', err.message);
  }
}

// =====================================================
// RUTE: AUTENTIFICARE
// =====================================================

/**
 * POST /api/auth/register
 * Înregistrare utilizator nou
 * Body: { username, email, password }
 */
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  
  // Validare input
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email și parola sunt obligatorii' });
  }
  if (username.length < 3 || username.length > 50) {
    return res.status(400).json({ error: 'Username trebuie să aibă între 3 și 50 caractere' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Parola trebuie să aibă minim 6 caractere' });
  }
  
  try {
    // Verificăm dacă username-ul există deja
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username-ul este deja folosit' });
    }
    
    // Hashăm parola cu bcrypt (cost 12 = securitate bună + viteză acceptabilă)
    const passwordHash = await bcrypt.hash(password, 12);
    
    // Generăm o culoare de avatar aleatorie
    const colors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];
    
    // Inserăm utilizatorul (email criptat)
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, avatar_color)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, avatar_color, created_at`,
      [username.toLowerCase(), encrypt(email), passwordHash, avatarColor]
    );
    
    const user = result.rows[0];
    
    // Generăm token JWT (expiră în 7 zile)
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    
    // Log audit
    await logAction({
      userId: user.id,
      action: 'user.register',
      targetType: 'user',
      targetId: user.id,
      ipAddress: req.ip,
    });
    
    res.status(201).json({
      token,
      user: {
        id:          user.id,
        username:    user.username,
        role:        user.role,
        avatarColor: user.avatar_color,
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Eroare la înregistrare' });
  }
});

/**
 * POST /api/auth/login
 * Autentificare utilizator
 * Body: { username, password }
 */
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
  }
  
  try {
    // Căutăm utilizatorul după username
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Username sau parolă incorectă' });
    }
    
    const user = result.rows[0];
    
    // Verificăm dacă contul este blocat
    if (user.is_banned) {
      return res.status(403).json({ error: 'Contul tău a fost suspendat' });
    }
    
    // Comparăm parola cu hash-ul din baza de date
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      // Log tentativă eșuată
      await logAction({
        action: 'user.login_failed',
        details: { username },
        ipAddress: req.ip,
      });
      return res.status(401).json({ error: 'Username sau parolă incorectă' });
    }
    
    // Generăm token JWT
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '7d' }
    );
    
    // Log login reușit
    await logAction({
      userId: user.id,
      action: 'user.login',
      targetType: 'user',
      targetId: user.id,
      ipAddress: req.ip,
    });
    
    res.json({
      token,
      user: {
        id:          user.id,
        username:    user.username,
        role:        user.role,
        avatarColor: user.avatar_color,
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Eroare la autentificare' });
  }
});

/**
 * GET /api/auth/me
 * Returnează datele utilizatorului curent (din token)
 */
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, role, avatar_color, created_at FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizator negăsit' });
    }
    
    const user = result.rows[0];
    res.json({
      id:          user.id,
      username:    user.username,
      role:        user.role,
      avatarColor: user.avatar_color,
      createdAt:   user.created_at,
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// =====================================================
// RUTE: HABITUIRI
// =====================================================

/**
 * GET /api/habits
 * Returnează habiturile utilizatorului curent
 * Query: ?date=YYYY-MM-DD (pentru completări)
 */
app.get('/api/habits', authMiddleware, async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  
  try {
    const result = await pool.query(
      `SELECT 
         h.*,
         -- Număr de completări azi
         COUNT(DISTINCT hc.id) FILTER (
           WHERE DATE(hc.completed_at AT TIME ZONE 'UTC') = $2::date
         ) AS completions_today,
         -- Număr total like-uri
         COUNT(DISTINCT hl.id) AS likes_count
       FROM habits h
       LEFT JOIN habit_completions hc ON hc.habit_id = h.id AND hc.user_id = h.user_id
       LEFT JOIN habit_likes hl ON hl.habit_id = h.id
       WHERE h.user_id = $1 AND h.is_deleted = FALSE
       GROUP BY h.id
       ORDER BY h.created_at DESC`,
      [req.user.id, date]
    );
    
    res.json(result.rows.map(mapHabit));
  } catch (err) {
    console.error('Get habits error:', err);
    res.status(500).json({ error: 'Eroare la obținerea habiturilor' });
  }
});

/**
 * POST /api/habits
 * Creează un habit nou
 * Body: { title, description, isPublic, color, icon, frequencyType, frequencyValue, targetTime }
 */
app.post('/api/habits', authMiddleware, async (req, res) => {
  const {
    title, description, isPublic,
    color, icon,
    frequencyType, frequencyValue, targetTime
  } = req.body;
  
  if (!title || !frequencyType) {
    return res.status(400).json({ error: 'Titlul și tipul de frecvență sunt obligatorii' });
  }
  
  // Validare tip frecvență
  const validTypes = ['daily', 'times_per_day', 'weekly', 'times_per_week', 'hourly', 'interval_days'];
  if (!validTypes.includes(frequencyType)) {
    return res.status(400).json({ error: 'Tip de frecvență invalid' });
  }
  
  try {
    const result = await pool.query(
      `INSERT INTO habits 
         (user_id, title, description, is_public, color, icon, frequency_type, frequency_value, target_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        req.user.id,
        encrypt(title),               // Criptăm titlul
        description ? encrypt(description) : null, // Criptăm descrierea
        isPublic || false,
        color || '#6366f1',
        icon || '✓',
        frequencyType,
        frequencyValue || 1,
        targetTime || null,
      ]
    );
    
    const habit = result.rows[0];
    habit.likes_count = 0;
    habit.completions_today = 0;
    
    await logAction({
      userId: req.user.id,
      action: 'habit.create',
      targetType: 'habit',
      targetId: habit.id,
      ipAddress: req.ip,
    });
    
    res.status(201).json(mapHabit(habit));
  } catch (err) {
    console.error('Create habit error:', err);
    res.status(500).json({ error: 'Eroare la crearea habitului' });
  }
});

/**
 * PUT /api/habits/:id
 * Actualizează un habit existent
 */
app.put('/api/habits/:id', authMiddleware, async (req, res) => {
  const habitId = parseInt(req.params.id);
  const { title, description, isPublic, color, icon, frequencyType, frequencyValue, targetTime } = req.body;
  
  try {
    // Verificăm că habitului îi aparține utilizatorului
    const check = await pool.query(
      'SELECT id FROM habits WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [habitId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Habit negăsit' });
    }
    
    const result = await pool.query(
      `UPDATE habits SET
         title          = COALESCE($1, title),
         description    = COALESCE($2, description),
         is_public      = COALESCE($3, is_public),
         color          = COALESCE($4, color),
         icon           = COALESCE($5, icon),
         frequency_type = COALESCE($6, frequency_type),
         frequency_value= COALESCE($7, frequency_value),
         target_time    = COALESCE($8, target_time)
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [
        title       ? encrypt(title)       : null,
        description ? encrypt(description) : null,
        isPublic    !== undefined ? isPublic : null,
        color       || null,
        icon        || null,
        frequencyType  || null,
        frequencyValue || null,
        targetTime  || null,
        habitId,
        req.user.id,
      ]
    );
    
    const habit = result.rows[0];
    habit.likes_count = 0;
    habit.completions_today = 0;
    
    res.json(mapHabit(habit));
  } catch (err) {
    console.error('Update habit error:', err);
    res.status(500).json({ error: 'Eroare la actualizarea habitului' });
  }
});

/**
 * DELETE /api/habits/:id
 * Șterge un habit (soft delete - vizibil în panel admin)
 */
app.delete('/api/habits/:id', authMiddleware, async (req, res) => {
  const habitId = parseInt(req.params.id);
  
  try {
    const result = await pool.query(
      `UPDATE habits SET is_deleted = TRUE, deleted_by = $1, deleted_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND user_id = $3 AND is_deleted = FALSE
       RETURNING id`,
      [req.user.id, habitId, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Habit negăsit' });
    }
    
    await logAction({
      userId: req.user.id,
      action: 'habit.delete',
      targetType: 'habit',
      targetId: habitId,
      ipAddress: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Delete habit error:', err);
    res.status(500).json({ error: 'Eroare la ștergerea habitului' });
  }
});

/**
 * POST /api/habits/:id/complete
 * Marchează un habit ca completat
 * Body: { note } (opțional)
 */
app.post('/api/habits/:id/complete', authMiddleware, async (req, res) => {
  const habitId = parseInt(req.params.id);
  const { note, date } = req.body;

  try {
    const check = await pool.query(
      'SELECT id, frequency_type, frequency_value FROM habits WHERE id = $1 AND user_id = $2 AND is_deleted = FALSE',
      [habitId, req.user.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Habit negasit' });
    }

    // Daca s-a trimis o data specifica (completare retroactiva), o folosim
    // Altfel folosim momentul curent
    let completedAt;
    if (date) {
      // Validam formatul datei
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Format data invalid. Folositi YYYY-MM-DD' });
      }
      // Nu permitem completari in viitor
      const targetDate = new Date(date + 'T12:00:00Z');
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (targetDate > today) {
        return res.status(400).json({ error: 'Nu poti completa un habit in viitor' });
      }
      completedAt = date + 'T12:00:00Z'; // Miezul zilei UTC pentru date retroactive
    } else {
      completedAt = new Date().toISOString();
    }

    const result = await pool.query(
      `INSERT INTO habit_completions (habit_id, user_id, note, completed_at)
       VALUES ($1, $2, $3, $4)
       RETURNING id, completed_at`,
      [habitId, req.user.id, note ? encrypt(note) : null, completedAt]
    );

    res.status(201).json({
      id:          result.rows[0].id,
      completedAt: result.rows[0].completed_at,
    });
  } catch (err) {
    console.error('Complete habit error:', err);
    res.status(500).json({ error: 'Eroare la marcarea completarii' });
  }
});

/**
 * GET /api/habits/:id/completions
 * Returnează completările unui habit (pentru calendar)
 * Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
app.get('/api/habits/:id/completions', authMiddleware, async (req, res) => {
  const habitId = parseInt(req.params.id);
  const from = req.query.from || new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0];
  const to   = req.query.to   || new Date().toISOString().split('T')[0];
  
  try {
    const result = await pool.query(
      `SELECT id, completed_at, note
       FROM habit_completions
       WHERE habit_id = $1 AND user_id = $2
         AND completed_at >= $3::date AND completed_at <= ($4::date + interval '1 day')
       ORDER BY completed_at DESC`,
      [habitId, req.user.id, from, to]
    );
    
    res.json(result.rows.map(r => ({
      id:          r.id,
      completedAt: r.completed_at,
      note:        decrypt(r.note),
    })));
  } catch (err) {
    console.error('Get completions error:', err);
    res.status(500).json({ error: 'Eroare la obținerea completărilor' });
  }
});

/**
 * GET /api/calendar
 * Returnează un rezumat al completărilor pentru o lună (pentru calendar view)
 * Query: ?year=2024&month=1
 */
app.get('/api/calendar', authMiddleware, async (req, res) => {
  const year  = parseInt(req.query.year  || new Date().getFullYear());
  const month = parseInt(req.query.month || new Date().getMonth() + 1);
  
  try {
    // Obținem completările grupate pe zi
    const result = await pool.query(
      `SELECT 
         DATE(hc.completed_at AT TIME ZONE 'UTC') AS day,
         COUNT(*) AS total_completions,
         COUNT(DISTINCT hc.habit_id) AS habits_completed
       FROM habit_completions hc
       JOIN habits h ON h.id = hc.habit_id AND h.is_deleted = FALSE
       WHERE hc.user_id = $1
         AND EXTRACT(YEAR  FROM hc.completed_at) = $2
         AND EXTRACT(MONTH FROM hc.completed_at) = $3
       GROUP BY DATE(hc.completed_at AT TIME ZONE 'UTC')
       ORDER BY day`,
      [req.user.id, year, month]
    );
    
    // Transformăm în map: { "2024-01-15": { total: 3, habits: 2 } }
    const calendarData = {};
    for (const row of result.rows) {
      const dayStr = row.day.toISOString().split('T')[0];
      calendarData[dayStr] = {
        total:  parseInt(row.total_completions),
        habits: parseInt(row.habits_completed),
      };
    }
    
    res.json(calendarData);
  } catch (err) {
    console.error('Calendar error:', err);
    res.status(500).json({ error: 'Eroare la obținerea datelor calendar' });
  }
});

// =====================================================
// RUTE: FEED SOCIAL
// =====================================================

/**
 * GET /api/social/feed
 * Feed-ul social: habituiri publice ale tuturor utilizatorilor
 * Query: ?limit=20&offset=0
 */
app.get('/api/social/feed', authMiddleware, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '20'), 50);
  const offset = parseInt(req.query.offset || '0');
  
  try {
    const result = await pool.query(
      `SELECT 
         h.*,
         u.username,
         u.avatar_color,
         COUNT(DISTINCT hl.id) AS likes_count,
         -- Verificăm dacă utilizatorul curent a dat like
         BOOL_OR(hl.user_id = $1) AS user_liked,
         -- Completări azi (ale proprietarului)
         COUNT(DISTINCT hc.id) FILTER (
           WHERE DATE(hc.completed_at AT TIME ZONE 'UTC') = CURRENT_DATE
             AND hc.user_id = h.user_id
         ) AS completions_today
       FROM habits h
       JOIN users u ON u.id = h.user_id
       LEFT JOIN habit_likes hl ON hl.habit_id = h.id
       LEFT JOIN habit_completions hc ON hc.habit_id = h.id
       WHERE h.is_public = TRUE AND h.is_deleted = FALSE AND u.is_banned = FALSE
       GROUP BY h.id, u.username, u.avatar_color
       ORDER BY h.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    
    res.json(result.rows.map(mapHabit));
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: 'Eroare la obținerea feed-ului' });
  }
});

/**
 * POST /api/social/:habitId/like
 * Adaugă sau elimină un like pe un habit public
 */
app.post('/api/social/:habitId/like', authMiddleware, async (req, res) => {
  const habitId = parseInt(req.params.habitId);
  
  try {
    // Verificăm că habitul există și este public
    const check = await pool.query(
      'SELECT id, user_id FROM habits WHERE id = $1 AND is_public = TRUE AND is_deleted = FALSE',
      [habitId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Habit negăsit' });
    }
    
    // Verificăm dacă like-ul există deja
    const existing = await pool.query(
      'SELECT id FROM habit_likes WHERE habit_id = $1 AND user_id = $2',
      [habitId, req.user.id]
    );
    
    if (existing.rows.length > 0) {
      // Eliminăm like-ul (toggle)
      await pool.query('DELETE FROM habit_likes WHERE habit_id = $1 AND user_id = $2', [habitId, req.user.id]);
      res.json({ liked: false });
    } else {
      // Adăugăm like-ul
      await pool.query('INSERT INTO habit_likes (habit_id, user_id) VALUES ($1, $2)', [habitId, req.user.id]);
      res.json({ liked: true });
    }
  } catch (err) {
    console.error('Like error:', err);
    res.status(500).json({ error: 'Eroare la like' });
  }
});

// =====================================================
// RUTE: MESAJE DE ÎNCURAJARE
// =====================================================

/**
 * GET /api/messages
 * Returnează mesajele primite de utilizatorul curent
 */
app.get('/api/messages', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         m.*,
         u.username AS sender_name,
         u.avatar_color AS sender_color,
         h.title AS habit_title
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN habits h ON h.id = m.habit_id
       WHERE m.receiver_id = $1 AND m.is_deleted = FALSE
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    
    res.json(result.rows.map(mapMessage));
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Eroare la obținerea mesajelor' });
  }
});

/**
 * GET /api/messages/sent
 * Returnează mesajele trimise de utilizatorul curent
 */
app.get('/api/messages/sent', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         m.*,
         u.username AS sender_name,
         u.avatar_color AS sender_color,
         r.username AS receiver_name,
         h.title AS habit_title
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       LEFT JOIN habits h ON h.id = m.habit_id
       WHERE m.sender_id = $1 AND m.is_deleted = FALSE
       ORDER BY m.created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    
    // Adăugăm receiver_name la mapare
    res.json(result.rows.map(row => ({
      ...mapMessage(row),
      receiverName: row.receiver_name,
    })));
  } catch (err) {
    console.error('Get sent error:', err);
    res.status(500).json({ error: 'Eroare la obținerea mesajelor trimise' });
  }
});

/**
 * POST /api/messages
 * Trimite un mesaj de încurajare
 * Body: { receiverId, content, habitId }
 */
app.post('/api/messages', authMiddleware, async (req, res) => {
  const { receiverId, content, habitId } = req.body;
  
  if (!receiverId || !content) {
    return res.status(400).json({ error: 'Destinatarul și conținutul sunt obligatorii' });
  }
  if (content.length > 500) {
    return res.status(400).json({ error: 'Mesajul nu poate depăși 500 de caractere' });
  }
  if (receiverId === req.user.id) {
    return res.status(400).json({ error: 'Nu poți trimite mesaj ție însuți' });
  }
  
  try {
    // Verificăm că destinatarul există
    const receiver = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND is_banned = FALSE',
      [receiverId]
    );
    if (receiver.rows.length === 0) {
      return res.status(404).json({ error: 'Destinatarul nu a fost găsit' });
    }
    
    const result = await pool.query(
      `INSERT INTO messages (sender_id, receiver_id, habit_id, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [req.user.id, receiverId, habitId || null, encrypt(content)]
    );
    
    res.status(201).json({
      id:        result.rows[0].id,
      createdAt: result.rows[0].created_at,
    });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Eroare la trimiterea mesajului' });
  }
});

/**
 * PUT /api/messages/:id/read
 * Marchează un mesaj ca citit
 */
app.put('/api/messages/:id/read', authMiddleware, async (req, res) => {
  const msgId = parseInt(req.params.id);
  
  try {
    await pool.query(
      'UPDATE messages SET is_read = TRUE WHERE id = $1 AND receiver_id = $2',
      [msgId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * GET /api/messages/unread-count
 * Returnează numărul de mesaje necitite
 */
app.get('/api/messages/unread-count', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND is_read = FALSE AND is_deleted = FALSE',
      [req.user.id]
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

// =====================================================
// RUTE: ADMIN / MODERATOR
// =====================================================

/**
 * GET /api/admin/stats
 * Statistici generale (doar admin)
 */
app.get('/api/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [users, habits, messages, completions] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM users WHERE role != \'admin\''),
      pool.query('SELECT COUNT(*) FROM habits WHERE is_deleted = FALSE'),
      pool.query('SELECT COUNT(*) FROM messages WHERE is_deleted = FALSE'),
      pool.query('SELECT COUNT(*) FROM habit_completions WHERE completed_at > NOW() - INTERVAL \'24 hours\''),
    ]);
    
    res.json({
      totalUsers:            parseInt(users.rows[0].count),
      totalHabits:           parseInt(habits.rows[0].count),
      totalMessages:         parseInt(messages.rows[0].count),
      completionsLast24h:    parseInt(completions.rows[0].count),
    });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * GET /api/admin/users
 * Lista tuturor utilizatorilor (doar admin)
 */
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         u.id, u.username, u.role, u.is_banned, u.avatar_color, u.created_at,
         COUNT(DISTINCT h.id) AS habits_count,
         COUNT(DISTINCT m.id) AS messages_count
       FROM users u
       LEFT JOIN habits h ON h.user_id = u.id AND h.is_deleted = FALSE
       LEFT JOIN messages m ON m.sender_id = u.id AND m.is_deleted = FALSE
       GROUP BY u.id
       ORDER BY u.created_at DESC`
    );
    
    res.json(result.rows.map(u => ({
      id:           u.id,
      username:     u.username,
      role:         u.role,
      isBanned:     u.is_banned,
      avatarColor:  u.avatar_color,
      habitsCount:  parseInt(u.habits_count),
      messagesCount: parseInt(u.messages_count),
      createdAt:    u.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * PUT /api/admin/users/:id/ban
 * Blochează sau deblochează un utilizator
 */
app.put('/api/admin/users/:id/ban', authMiddleware, adminMiddleware, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { ban, reason } = req.body;
  
  try {
    // Nu putem bloca alt admin
    const check = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Utilizator negăsit' });
    if (check.rows[0].role === 'admin') return res.status(403).json({ error: 'Nu poți bloca un admin' });
    
    await pool.query(
      'UPDATE users SET is_banned = $1, ban_reason = $2 WHERE id = $3',
      [ban, ban ? encrypt(reason || 'Conținut inappropriate') : null, userId]
    );
    
    await logAction({
      userId: req.user.id,
      action: ban ? 'admin.user_ban' : 'admin.user_unban',
      targetType: 'user',
      targetId: userId,
      details: { reason },
      ipAddress: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * GET /api/admin/habits
 * Toate habiturile (inclusiv șterse) - doar admin
 */
app.get('/api/admin/habits', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT h.*, u.username, u.avatar_color,
         COUNT(DISTINCT hl.id) AS likes_count,
         0 AS completions_today
       FROM habits h
       JOIN users u ON u.id = h.user_id
       LEFT JOIN habit_likes hl ON hl.habit_id = h.id
       GROUP BY h.id, u.username, u.avatar_color
       ORDER BY h.created_at DESC
       LIMIT 200`
    );
    
    res.json(result.rows.map(row => ({
      ...mapHabit(row),
      isDeleted: row.is_deleted,
      deletedAt: row.deleted_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * DELETE /api/admin/habits/:id
 * Șterge forțat un habit (moderator)
 */
app.delete('/api/admin/habits/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const habitId = parseInt(req.params.id);
  
  try {
    await pool.query(
      `UPDATE habits SET is_deleted = TRUE, deleted_by = $1, deleted_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, habitId]
    );
    
    await logAction({
      userId: req.user.id,
      action: 'admin.habit_delete',
      targetType: 'habit',
      targetId: habitId,
      ipAddress: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * GET /api/admin/messages
 * Toate mesajele - doar admin
 */
app.get('/api/admin/messages', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.*, 
         s.username AS sender_name,
         r.username AS receiver_name
       FROM messages m
       JOIN users s ON s.id = m.sender_id
       JOIN users r ON r.id = m.receiver_id
       ORDER BY m.created_at DESC
       LIMIT 200`
    );
    
    res.json(result.rows.map(row => ({
      id:           row.id,
      senderName:   row.sender_name,
      receiverName: row.receiver_name,
      content:      decrypt(row.content),
      isDeleted:    row.is_deleted,
      createdAt:    row.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * DELETE /api/admin/messages/:id
 * Șterge un mesaj inappropriate
 */
app.delete('/api/admin/messages/:id', authMiddleware, adminMiddleware, async (req, res) => {
  const msgId = parseInt(req.params.id);
  
  try {
    await pool.query(
      `UPDATE messages SET is_deleted = TRUE, deleted_by = $1, deleted_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [req.user.id, msgId]
    );
    
    await logAction({
      userId: req.user.id,
      action: 'admin.message_delete',
      targetType: 'message',
      targetId: msgId,
      ipAddress: req.ip,
    });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * GET /api/admin/logs
 * Audit logs - doar admin
 * Query: ?limit=50&offset=0
 */
app.get('/api/admin/logs', authMiddleware, adminMiddleware, async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit  || '50'), 200);
  const offset = parseInt(req.query.offset || '0');
  
  try {
    const result = await pool.query(
      `SELECT al.*, u.username
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    
    res.json(result.rows.map(row => ({
      id:         row.id,
      username:   row.username || 'DELETED',
      action:     row.action,
      targetType: row.target_type,
      targetId:   row.target_id,
      details:    row.details ? decrypt(row.details) : null,
      ipAddress:  row.ip_address,
      createdAt:  row.created_at,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});


// =====================================================
// RUTE: PRIETENI
// =====================================================

/**
 * GET /api/friends
 * Lista prietenilor acceptati ai utilizatorului curent
 */
app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         f.id AS friendship_id,
         f.status,
         f.created_at,
         -- Returnam datele celuilalt utilizator (nu ale noastre)
         CASE WHEN f.requester_id = $1 THEN f.receiver_id  ELSE f.requester_id  END AS friend_id,
         CASE WHEN f.requester_id = $1 THEN ru.username    ELSE rq.username    END AS friend_username,
         CASE WHEN f.requester_id = $1 THEN ru.avatar_color ELSE rq.avatar_color END AS friend_color
       FROM friendships f
       JOIN users rq ON rq.id = f.requester_id
       JOIN users ru ON ru.id = f.receiver_id
       WHERE (f.requester_id = $1 OR f.receiver_id = $1)
         AND f.status = 'accepted'
       ORDER BY friend_username ASC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: 'Eroare la obtinerea prietenilor' });
  }
});

/**
 * GET /api/friends/requests
 * Cererile de prietenie primite (pending), asteptand acceptare
 */
app.get('/api/friends/requests', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         f.id AS friendship_id,
         f.created_at,
         u.id AS requester_id,
         u.username AS requester_username,
         u.avatar_color AS requester_color
       FROM friendships f
       JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get requests error:', err);
    res.status(500).json({ error: 'Eroare la obtinerea cererilor' });
  }
});

/**
 * GET /api/friends/sent
 * Cererile de prietenie trimise de utilizatorul curent (pending)
 */
app.get('/api/friends/sent', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
         f.id AS friendship_id,
         f.created_at,
         u.id AS receiver_id,
         u.username AS receiver_username,
         u.avatar_color AS receiver_color
       FROM friendships f
       JOIN users u ON u.id = f.receiver_id
       WHERE f.requester_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get sent requests error:', err);
    res.status(500).json({ error: 'Eroare la obtinerea cererilor trimise' });
  }
});

/**
 * GET /api/friends/status/:userId
 * Verifica statusul relatiei cu un utilizator specific
 * Returneaza: none | pending_sent | pending_received | accepted
 */
app.get('/api/friends/status/:userId', authMiddleware, async (req, res) => {
  const otherId = parseInt(req.params.userId);
  try {
    const result = await pool.query(
      `SELECT id, requester_id, status FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [req.user.id, otherId]
    );
    if (result.rows.length === 0) {
      return res.json({ status: 'none' });
    }
    const f = result.rows[0];
    if (f.status === 'accepted') return res.json({ status: 'accepted', friendshipId: f.id });
    if (f.status === 'pending') {
      const isSender = f.requester_id === req.user.id;
      return res.json({
        status: isSender ? 'pending_sent' : 'pending_received',
        friendshipId: f.id
      });
    }
    res.json({ status: 'none' });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * POST /api/friends/request/:userId
 * Trimite o cerere de prietenie catre un utilizator
 */
app.post('/api/friends/request/:userId', authMiddleware, async (req, res) => {
  const receiverId = parseInt(req.params.userId);

  if (receiverId === req.user.id) {
    return res.status(400).json({ error: 'Nu iti poti trimite cerere tie insuti' });
  }

  try {
    // Verificam ca utilizatorul destinatar exista
    const user = await pool.query(
      'SELECT id FROM users WHERE id = $1 AND is_banned = FALSE',
      [receiverId]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizatorul nu a fost gasit' });
    }

    // Verificam sa nu existe deja o relatie
    const existing = await pool.query(
      `SELECT id, status FROM friendships
       WHERE (requester_id = $1 AND receiver_id = $2)
          OR (requester_id = $2 AND receiver_id = $1)`,
      [req.user.id, receiverId]
    );
    if (existing.rows.length > 0) {
      const st = existing.rows[0].status;
      if (st === 'accepted') return res.status(409).json({ error: 'Esti deja prieten cu acest utilizator' });
      if (st === 'pending')  return res.status(409).json({ error: 'Exista deja o cerere de prietenie' });
    }

    const result = await pool.query(
      'INSERT INTO friendships (requester_id, receiver_id) VALUES ($1, $2) RETURNING id',
      [req.user.id, receiverId]
    );

    await logAction({
      userId: req.user.id,
      action: 'friend.request',
      targetType: 'user',
      targetId: receiverId,
      ipAddress: req.ip,
    });

    res.status(201).json({ friendshipId: result.rows[0].id });
  } catch (err) {
    console.error('Friend request error:', err);
    res.status(500).json({ error: 'Eroare la trimiterea cererii' });
  }
});

/**
 * PUT /api/friends/:id/accept
 * Accepta o cerere de prietenie primita
 */
app.put('/api/friends/:id/accept', authMiddleware, async (req, res) => {
  const friendshipId = parseInt(req.params.id);
  try {
    const result = await pool.query(
      `UPDATE friendships SET status = 'accepted'
       WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
       RETURNING id`,
      [friendshipId, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cerere negasita sau nu ai permisiunea' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * PUT /api/friends/:id/decline
 * Refuza o cerere de prietenie primita
 */
app.put('/api/friends/:id/decline', authMiddleware, async (req, res) => {
  const friendshipId = parseInt(req.params.id);
  try {
    await pool.query(
      `DELETE FROM friendships WHERE id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [friendshipId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * DELETE /api/friends/:id
 * Sterge o prietenie existenta (oricare din cei doi poate sterge)
 */
app.delete('/api/friends/:id', authMiddleware, async (req, res) => {
  const friendshipId = parseInt(req.params.id);
  try {
    await pool.query(
      `DELETE FROM friendships
       WHERE id = $1 AND (requester_id = $2 OR receiver_id = $2)`,
      [friendshipId, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Eroare server' });
  }
});

/**
 * GET /api/friends/search?q=username
 * Cauta utilizatori dupa username pentru a trimite cerere
 */
app.get('/api/friends/search', authMiddleware, async (req, res) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (q.length < 2) return res.json([]);

  try {
    const result = await pool.query(
      `SELECT 
         u.id, u.username, u.avatar_color,
         -- Includem statusul relatiei curente
         COALESCE(
           (SELECT status FROM friendships
            WHERE (requester_id = $2 AND receiver_id = u.id)
               OR (requester_id = u.id AND receiver_id = $2)
            LIMIT 1),
           'none'
         ) AS friendship_status,
         (SELECT id FROM friendships
          WHERE (requester_id = $2 AND receiver_id = u.id)
             OR (requester_id = u.id AND receiver_id = $2)
          LIMIT 1) AS friendship_id
       FROM users u
       WHERE u.username ILIKE $1
         AND u.id != $2
         AND u.is_banned = FALSE
         AND u.role != 'admin'
       ORDER BY u.username ASC
       LIMIT 10`,
      [`%${q}%`, req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Eroare la cautare' });
  }
});

/**
 * GET /api/friends/:friendId/habits
 * Habiturile publice ale unui prieten (pentru a da incurajari)
 */
app.get('/api/friends/:friendId/habits', authMiddleware, async (req, res) => {
  const friendId = parseInt(req.params.friendId);

  try {
    // Verificam ca sunt prieteni
    const friendship = await pool.query(
      `SELECT id FROM friendships
       WHERE ((requester_id = $1 AND receiver_id = $2)
           OR (requester_id = $2 AND receiver_id = $1))
         AND status = 'accepted'`,
      [req.user.id, friendId]
    );
    if (friendship.rows.length === 0) {
      return res.status(403).json({ error: 'Nu esti prieten cu acest utilizator' });
    }

    const result = await pool.query(
      `SELECT h.*, 
         COUNT(DISTINCT hl.id) AS likes_count,
         COUNT(DISTINCT hc.id) FILTER (
           WHERE DATE(hc.completed_at AT TIME ZONE 'UTC') = CURRENT_DATE
         ) AS completions_today
       FROM habits h
       LEFT JOIN habit_likes hl ON hl.habit_id = h.id
       LEFT JOIN habit_completions hc ON hc.habit_id = h.id AND hc.user_id = h.user_id
       WHERE h.user_id = $1 AND h.is_deleted = FALSE
       GROUP BY h.id
       ORDER BY h.created_at DESC`,
      [friendId]
    );

    res.json(result.rows.map(mapHabit));
  } catch (err) {
    console.error('Friend habits error:', err);
    res.status(500).json({ error: 'Eroare server' });
  }
});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'disconnected' });
  }
});

// =====================================================
// PORNIRE SERVER
// =====================================================

async function start() {
  try {
    // Așteptăm conexiunea la baza de date
    await pool.query('SELECT NOW()');
    console.log('✅ Conectat la PostgreSQL');
    
    // Inițializăm contul admin implicit
    await initAdmin();
    
    // Pornim serverul Express
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 HabitFlow API pornit pe portul ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Eroare la pornire:', err);
    process.exit(1);
  }
}

start();
