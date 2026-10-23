const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Auto-load .env configuration if not already loaded into process.env
try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const k = trimmed.slice(0, eqIdx).trim();
                    const v = trimmed.slice(eqIdx + 1).trim();
                    if (k && v) {
                        process.env[k] = v;
                    }
                }
            }
        });
    }
} catch (e) {}

// PostgreSQL Database URL with IPv4 Supabase Pooler (essential for Vercel Serverless & mobile networks)
const DEFAULT_POOLER_URL = 'postgresql://postgres.rmeduqophmocydbdbojd:l20sg6BZIqrXcSTT@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

let resolvedDbUrl = process.env.DATABASE_URL || DEFAULT_POOLER_URL;

// Auto-convert direct IPv6-only Supabase hostname to IPv4 Supabase pooler to prevent getaddrinfo ENOTFOUND on Vercel
if (resolvedDbUrl && resolvedDbUrl.includes('db.rmeduqophmocydbdbojd.supabase.co')) {
    resolvedDbUrl = resolvedDbUrl
        .replace('db.rmeduqophmocydbdbojd.supabase.co:5432', 'aws-0-us-east-1.pooler.supabase.com:6543')
        .replace('db.rmeduqophmocydbdbojd.supabase.co', 'aws-0-us-east-1.pooler.supabase.com:6543')
        .replace('postgres:l20sg6BZIqrXcSTT', 'postgres.rmeduqophmocydbdbojd:l20sg6BZIqrXcSTT');
}

const DATABASE_URL = resolvedDbUrl;

// Security Sanitizer: Strips out passwords and database host info from any log output
function sanitizeLog(err) {
    if (!err) return '';
    const raw = typeof err === 'string' ? err : (err.message || String(err));
    return raw.replace(/postgresql:\/\/[^@]+@/gi, 'postgresql://***:***@');
}

// In-memory cache kept in sync for ultra-fast 0ms response times
const memoryStore = new Map();

function normalizeKey(filename) {
    return path.basename(filename);
}

let pool = null;
if (DATABASE_URL) {
    try {
        pool = new Pool({
            connectionString: DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        // Essential error listener on pg.Pool to catch idle client disconnects and prevent crashing
        pool.on('error', (err) => {
            console.warn('[PostgreSQL Pool] Idle connection notice:', sanitizeLog(err));
        });

        // Auto-create storage table in PostgreSQL if not present
        pool.query(`
            CREATE TABLE IF NOT EXISTS app_storage (
                key VARCHAR(100) PRIMARY KEY,
                data JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
        `).then(() => {
            console.log('[Supabase PostgreSQL] Table verified & active as 100% EXCLUSIVE database.');
        }).catch(err => {
            console.error('[Supabase PostgreSQL] Table init error:', sanitizeLog(err));
        });
    } catch (e) {
        console.error('[Supabase PostgreSQL] Pool init error:', sanitizeLog(e));
    }
}

// Track last known PostgreSQL updated_at timestamp per key for multi-instance cache coherence
const memoryUpdatedAt = new Map();

// Load data directly from PostgreSQL into memory cache
async function fetchFromPostgres(key) {
    if (!pool) return null;
    try {
        const res = await pool.query('SELECT data, updated_at FROM app_storage WHERE key = $1', [key]);
        if (res.rows && res.rows.length > 0) {
            const row = res.rows[0];
            memoryStore.set(key, row.data);
            if (row.updated_at) {
                memoryUpdatedAt.set(key, new Date(row.updated_at).getTime());
            }
            return row.data;
        }
    } catch (err) {
        console.warn(`[Supabase PostgreSQL] Read notice for key "${key}":`, sanitizeLog(err));
    }
    return null;
}

// Persist data into Supabase PostgreSQL
async function writeToPostgres(key, data) {
    if (!pool) return true;
    try {
        const res = await pool.query(
            `INSERT INTO app_storage (key, data, updated_at) VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
             RETURNING updated_at`,
            [key, JSON.stringify(data)]
        );
        memoryStore.set(key, data);
        if (res.rows && res.rows[0] && res.rows[0].updated_at) {
            memoryUpdatedAt.set(key, new Date(res.rows[0].updated_at).getTime());
        }
        return true;
    } catch (err) {
        console.error(`[Supabase PostgreSQL] Error saving key "${key}":`, sanitizeLog(err));
        return false;
    }
}

function loadLocalFallbackFile(key) {
    const candidates = [
        path.join(__dirname, key),
        path.join(__dirname, '..', 'public', key),
        path.join(__dirname, '..', key)
    ];
    for (const filePath of candidates) {
        try {
            if (fs.existsSync(filePath)) {
                const raw = fs.readFileSync(filePath, 'utf8');
                const parsed = JSON.parse(raw);
                if (parsed !== null && parsed !== undefined) {
                    memoryStore.set(key, parsed);
                    return parsed;
                }
            }
        } catch (e) {}
    }
    return undefined;
}

/**
 * Synchronous read accessor (reads from live RAM memory mirror synced with Supabase PostgreSQL, with bundled file fallback)
 */
function readData(filename, defaultValue) {
    const key = normalizeKey(filename);

    if (memoryStore.has(key)) {
        return memoryStore.get(key);
    }

    const localData = loadLocalFallbackFile(key);

    if (pool) {
        fetchFromPostgres(key).catch(() => {});
    }

    if (localData !== undefined) {
        return localData;
    }

    return defaultValue !== undefined ? defaultValue : null;
}

/**
 * Write accessor (updates live RAM memory state and persists asynchronously to Supabase PostgreSQL)
 */
function writeData(filename, data) {
    const key = normalizeKey(filename);

    // 1. Immediately update active memory state (0ms latency for client)
    memoryStore.set(key, data);

    // 2. Persist to Supabase PostgreSQL cloud database
    if (pool) {
        writeToPostgres(key, data).catch(() => {});
    }

    return true;
}

// Direct preload of all remote state from Supabase PostgreSQL into RAM at startup
let initPromise = null;
let isInitialized = false;
async function initStorageEngine() {
    if (pool) {
        try {
            const res = await pool.query('SELECT key, data, updated_at FROM app_storage');
            for (const row of res.rows) {
                memoryStore.set(row.key, row.data);
                if (row.updated_at) {
                    memoryUpdatedAt.set(row.key, new Date(row.updated_at).getTime());
                }
            }
            isInitialized = true;
            console.log(`[Supabase PostgreSQL] Cloud DB active: Loaded ${res.rows.length} keys directly into live RAM memory cache.`);
        } catch (e) {
            console.warn('[Supabase PostgreSQL] Initial load notice:', sanitizeLog(e));
        }
    }
    isInitialized = true;
}
initPromise = initStorageEngine().catch(() => { isInitialized = true; });

async function waitForInit(timeoutMs = 2500) {
    if (isInitialized || !initPromise) return;
    try {
        await Promise.race([
            initPromise,
            new Promise(resolve => setTimeout(resolve, timeoutMs))
        ]);
    } catch (e) {}
}

// Async direct read from storage (verifies updated_at in PostgreSQL so multi-instance serverless functions never serve stale RAM)
async function readDataAsync(filename, defaultValue) {
    const key = normalizeKey(filename);
    await waitForInit(2500);

    if (pool) {
        try {
            if (memoryStore.has(key) && memoryUpdatedAt.has(key)) {
                // Lightweight 8-byte primary key header check (avoids transferring large TOAST JSONB unless changed)
                const metaRes = await pool.query('SELECT updated_at FROM app_storage WHERE key = $1', [key]);
                if (metaRes.rows && metaRes.rows.length > 0) {
                    const dbUpdatedAt = metaRes.rows[0].updated_at ? new Date(metaRes.rows[0].updated_at).getTime() : 0;
                    if (dbUpdatedAt && dbUpdatedAt === memoryUpdatedAt.get(key)) {
                        return memoryStore.get(key);
                    }
                }
            }
            const freshData = await fetchFromPostgres(key);
            if (freshData !== null && freshData !== undefined) {
                return freshData;
            }
        } catch (e) {
            console.warn(`[Supabase PostgreSQL] Fresh check fallback for "${key}":`, sanitizeLog(e));
        }
    }

    if (memoryStore.has(key)) {
        return memoryStore.get(key);
    }

    const localData = loadLocalFallbackFile(key);
    if (localData !== undefined) {
        return localData;
    }

    return defaultValue !== undefined ? defaultValue : null;
}

// Async direct write to storage (updates RAM and persists to Supabase PostgreSQL)
async function writeDataAsync(filename, data) {
    const key = normalizeKey(filename);
    memoryStore.set(key, data);
    return await writeToPostgres(key, data);
}

module.exports = {
    readData,
    writeData,
    readDataAsync,
    writeDataAsync,
    fetchFromPostgres,
    writeToPostgres,
    initStorageEngine,
    waitForInit,
    pool
};


