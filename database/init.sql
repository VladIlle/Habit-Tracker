-- =====================================================
-- HabitFlow - Schema PostgreSQL
-- Rulat automat la prima inițializare a containerului
-- =====================================================

-- Activăm extensia pgcrypto pentru funcții criptografice
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Activăm uuid-ossp pentru generare UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABELUL UTILIZATORILOR
-- Email-ul este criptat AES-256 la nivel de aplicație
-- Parola este hashată cu bcrypt (niciodată stocată în clar)
-- =====================================================
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(50)  UNIQUE NOT NULL,
    -- Email criptat AES-256-GCM (format: iv:authTag:ciphertext)
    email       TEXT         NOT NULL,
    -- Parola hashată cu bcrypt (cost factor 12)
    password_hash TEXT       NOT NULL,
    -- Rolul: 'user' sau 'admin'
    role        VARCHAR(20)  NOT NULL DEFAULT 'user',
    -- Utilizator blocat de moderator
    is_banned   BOOLEAN      NOT NULL DEFAULT FALSE,
    -- Motiv blocare (criptat)
    ban_reason  TEXT,
    -- Avatar (URL sau base64 mic)
    avatar_color VARCHAR(7)  DEFAULT '#6366f1',
    -- Timestamps
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABELUL HABITURILOR
-- title și description sunt criptate AES-256-GCM
-- Tipuri de frecvență suportate:
--   'daily'          - o dată pe zi
--   'times_per_day'  - de N ori pe zi
--   'weekly'         - o dată pe săptămână
--   'times_per_week' - de N ori pe săptămână
--   'hourly'         - la fiecare N ore
--   'interval_days'  - la fiecare N zile
-- =====================================================
CREATE TABLE IF NOT EXISTS habits (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Titlu criptat AES-256-GCM
    title            TEXT NOT NULL,
    -- Descriere criptată AES-256-GCM (opțional)
    description      TEXT,
    -- Vizibil în feed-ul social
    is_public        BOOLEAN NOT NULL DEFAULT FALSE,
    -- Culoare personalizată pentru card
    color            VARCHAR(7) DEFAULT '#6366f1',
    -- Icon emoji
    icon             VARCHAR(10) DEFAULT '✓',
    -- Tip frecvență (din lista de mai sus)
    frequency_type   VARCHAR(20) NOT NULL DEFAULT 'daily',
    -- Valoare numerică pentru frecvență (ex: 3 pentru "3 ori/zi")
    frequency_value  INTEGER NOT NULL DEFAULT 1,
    -- Ora țintă opțională (ex: 08:00 pentru "dimineața")
    target_time      TIME,
    -- Habituri șterse soft (vizibil doar pentru admin)
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    -- ID-ul adminului care a șters (pentru audit)
    deleted_by       INTEGER REFERENCES users(id),
    deleted_at       TIMESTAMP WITH TIME ZONE,
    -- Timestamps
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABELUL COMPLETĂRILOR DE HABITUIRI
-- Fiecare înregistrare = o completare a unui habit
-- nota este criptată AES-256-GCM
-- =====================================================
CREATE TABLE IF NOT EXISTS habit_completions (
    id           SERIAL PRIMARY KEY,
    habit_id     INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Notă opțională despre completare (criptată)
    note         TEXT,
    -- Data și ora completării
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABELUL MESAJELOR DE ÎNCURAJARE
-- content este criptat AES-256-GCM
-- Moderatorul poate șterge mesaje inappropriate
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
    id           SERIAL PRIMARY KEY,
    sender_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- Opțional: mesaj legat de un habit specific
    habit_id     INTEGER REFERENCES habits(id) ON DELETE SET NULL,
    -- Conținut mesaj criptat AES-256-GCM
    content      TEXT NOT NULL,
    -- Mesaj citit de receptor
    is_read      BOOLEAN NOT NULL DEFAULT FALSE,
    -- Ștergere soft de moderator
    is_deleted   BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_by   INTEGER REFERENCES users(id),
    deleted_at   TIMESTAMP WITH TIME ZONE,
    -- Timestamp
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABELUL LIKE-URILOR / ÎNCURAJĂRILOR PE HABITUIRI PUBLICE
-- Un utilizator poate da like o singură dată per habit
-- =====================================================
CREATE TABLE IF NOT EXISTS habit_likes (
    id         SERIAL PRIMARY KEY,
    habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Constrângere: un like per utilizator per habit
    UNIQUE(habit_id, user_id)
);

-- =====================================================
-- TABELUL LOGURILOR DE AUDIT
-- Înregistrează acțiunile importante (login, delete, ban etc.)
-- details este criptat AES-256-GCM pentru date sensibile
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id          SERIAL PRIMARY KEY,
    -- Utilizatorul care a efectuat acțiunea (NULL dacă cont șters)
    user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
    -- Tipul acțiunii (ex: 'user.login', 'habit.delete', 'user.ban')
    action      VARCHAR(100) NOT NULL,
    -- Tipul resursei afectate
    target_type VARCHAR(50),
    -- ID-ul resursei afectate
    target_id   INTEGER,
    -- Detalii suplimentare (criptate)
    details     TEXT,
    -- Adresa IP a clientului
    ip_address  INET,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- INDEXURI pentru performanță
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_habits_user_id       ON habits(user_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_habits_public         ON habits(is_public) WHERE is_public = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_completions_habit     ON habit_completions(habit_id);
CREATE INDEX IF NOT EXISTS idx_completions_user_date ON habit_completions(user_id, completed_at);
CREATE INDEX IF NOT EXISTS idx_messages_receiver     ON messages(receiver_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_messages_sender       ON messages(sender_id) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_date       ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user       ON audit_logs(user_id);

-- =====================================================
-- FUNCȚIE: actualizare automată updated_at
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger pentru habits
CREATE TRIGGER update_habits_updated_at
    BEFORE UPDATE ON habits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger pentru users
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- NOTĂ: Contul admin implicit va fi creat automat
-- de backend la prima pornire (server.js - initAdmin())
-- Username: admin
-- Parola: din variabila de mediu ADMIN_PASSWORD
-- =====================================================

-- =====================================================
-- TABELUL PRIETENII
-- status: 'pending' = cerere trimisa, asteptare
--         'accepted' = prietenie acceptata
--         'declined' = cerere refuzata
-- =====================================================
CREATE TABLE IF NOT EXISTS friendships (
    id           SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status       VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Nu pot exista doua cereri intre aceleasi doua persoane
    UNIQUE(requester_id, receiver_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_receiver  ON friendships(receiver_id);
CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);

CREATE TRIGGER update_friendships_updated_at
    BEFORE UPDATE ON friendships
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();