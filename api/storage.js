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
            max: 6,
            idleTimeoutMillis: 8000,
            connectionTimeoutMillis: 15000,
            keepAlive: true,
            allowExitOnIdle: true
        });

        // Essential error listeners on pg.Pool AND checked-out pg.Client instances to catch abrupt PgBouncer disconnects without crashing Node.js
        pool.on('error', () => {
            // Silently recycle idle connections dropped by Supabase PgBouncer
        });
        pool.on('connect', (client) => {
            if (client && typeof client.on === 'function') {
                client.on('error', () => {
                    // Prevent unhandled error event on active client if PgBouncer resets socket
                });
            }
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
            console.warn('[Supabase PostgreSQL] Table init notice:', sanitizeLog(err));
        });
    } catch (e) {
        console.warn('[Supabase PostgreSQL] Pool init notice:', sanitizeLog(e));
    }
}

// Track last known PostgreSQL updated_at timestamp per key for multi-instance cache coherence
const memoryUpdatedAt = new Map();
const memoryLastCheckedAt = new Map();
const inFlightFetches = new Map();

// Single-flight & debounced write state to prevent PgBouncer connection saturation
const inFlightWrites = new Map();
const pendingWritePayloads = new Map();
const debounceTimers = new Map();
const lastPostgresWriteAt = new Map();

// High-frequency telemetry/cache keys that should be debounced instead of hammering PostgreSQL on every request
const DEBOUNCED_WRITE_INTERVALS = {
    'stream_cache.json': 120000,          // 2 minutes (ephemeral 15m stream cache)
    '.analytics_data.json': 25000,        // 25 seconds (heartbeat telemetry)
    '.ip_activity_monitor.json': 25000,   // 25 seconds (live visitor radar)
    '.security_events_log.json': 10000    // 10 seconds
};

function saveLocalBackupSilently(key, payloadToSave) {
    try {
        const diskPaths = [
            path.join(__dirname, key),
            path.join(__dirname, '..', key)
        ];
        const rawJson = JSON.stringify(payloadToSave, null, 2);
        for (const dp of diskPaths) {
            try { fs.writeFileSync(dp, rawJson); } catch (e) {}
        }
    } catch (e) {}
}

// Execute a pool query with 1 automatic retry on transient PgBouncer disconnect/timeout
async function queryWithRetry(sql, params = []) {
    if (!pool) return null;
    try {
        return await pool.query(sql, params);
    } catch (err) {
        const msg = String(err?.message || err || '').toLowerCase();
        const isTransient =
            msg.includes('connection terminated') ||
            msg.includes('timeout') ||
            msg.includes('econnreset') ||
            msg.includes('socket hang up') ||
            msg.includes('client has encountered a connection error');
        if (isTransient) {
            await new Promise(r => setTimeout(r, 350));
            return await pool.query(sql, params);
        }
        throw err;
    }
}

// Load data directly from PostgreSQL into memory cache (with single-flight deduplication)
async function fetchFromPostgres(key) {
    if (!pool) return null;
    if (inFlightFetches.has(key)) {
        return inFlightFetches.get(key);
    }
    const fetchPromise = (async () => {
        try {
            const res = await queryWithRetry('SELECT data, updated_at FROM app_storage WHERE key = $1', [key]);
            memoryLastCheckedAt.set(key, Date.now());
            if (res && res.rows && res.rows.length > 0) {
                const row = res.rows[0];
                if (!inFlightWrites.has(key) && !pendingWritePayloads.has(key)) {
                    memoryStore.set(key, row.data);
                    if (row.updated_at) {
                        memoryUpdatedAt.set(key, new Date(row.updated_at).getTime());
                    }
                }
                return memoryStore.get(key) || row.data;
            } else {
                memoryUpdatedAt.set(key, -1);
            }
        } catch (err) {
            // Fallback silently to RAM / local disk if PgBouncer is momentarily busy
        } finally {
            inFlightFetches.delete(key);
        }
        return null;
    })();
    inFlightFetches.set(key, fetchPromise);
    return fetchPromise;
}

// Persist data into Supabase PostgreSQL (with single-flight coalescing & atomic multi-instance merge for users.json)
async function writeToPostgres(key, data) {
    // Always keep local disk backup and RAM updated immediately with the newest payload
    memoryStore.set(key, data);
    memoryLastCheckedAt.set(key, Date.now());
    saveLocalBackupSilently(key, data);

    if (!pool) return true;

    // If a write for this exact key is already in progress, store the newest payload so the active loop flushes it before resolving
    if (inFlightWrites.has(key)) {
        pendingWritePayloads.set(key, data);
        return inFlightWrites.get(key);
    }

    const writePromise = (async () => {
        let currentData = data;
        try {
            while (currentData !== undefined) {
                let payloadToSave = currentData;

                if (key === 'users.json' && currentData && typeof currentData === 'object' && Array.isArray(currentData.users)) {
                    const deletedIdsRaw = Array.isArray(currentData._deletedUserIds) ? currentData._deletedUserIds : [];
                    const deletedTokensRaw = Array.isArray(currentData._deletedTokens) ? currentData._deletedTokens : [];
                    const deletedSet = new Set(deletedIdsRaw.map(x => String(x || '').toLowerCase().trim()).filter(Boolean));
                    const deletedTokSet = new Set(deletedTokensRaw.map(x => String(x || '').trim()).filter(Boolean));

                    const cleanCopy = {
                        users: Array.isArray(currentData.users) ? [...currentData.users] : [],
                        sessions: (currentData.sessions && typeof currentData.sessions === 'object') ? { ...currentData.sessions } : {}
                    };

                    try {
                        const existingRes = await queryWithRetry('SELECT data FROM app_storage WHERE key = $1', ['users.json']);
                        if (existingRes && existingRes.rows && existingRes.rows.length > 0 && existingRes.rows[0].data) {
                            const dbData = existingRes.rows[0].data;
                            const dbUsers = Array.isArray(dbData.users) ? dbData.users : [];
                            const dbSessions = (dbData.sessions && typeof dbData.sessions === 'object') ? dbData.sessions : {};

                            for (const oldU of dbUsers) {
                                if (!oldU || typeof oldU !== 'object') continue;
                                const oldId = String(oldU.id || '').toLowerCase().trim();
                                const oldOrigId = String(oldU.originalId || '').toLowerCase().trim();
                                const oldName = String(oldU.username || '').toLowerCase().trim();
                                const oldEmail = String(oldU.rawEmail || oldU.email || '').toLowerCase().trim();

                                if (
                                    (oldId && deletedSet.has(oldId)) ||
                                    (oldOrigId && deletedSet.has(oldOrigId)) ||
                                    (oldName && deletedSet.has(oldName)) ||
                                    (oldEmail && deletedSet.has(oldEmail))
                                ) {
                                    continue;
                                }

                                const existingIdx = cleanCopy.users.findIndex(newU => {
                                    if (!newU || typeof newU !== 'object') return false;
                                    const nId = String(newU.id || '').toLowerCase().trim();
                                    const nOrigId = String(newU.originalId || '').toLowerCase().trim();
                                    const nName = String(newU.username || '').toLowerCase().trim();
                                    const nEmail = String(newU.rawEmail || newU.email || '').toLowerCase().trim();
                                    if (oldOrigId && (nOrigId === oldOrigId || nId === oldOrigId)) return true;
                                    if (oldId && (nId === oldId || nOrigId === oldId)) return true;
                                    if (oldEmail && nEmail && oldEmail === nEmail) return true;
                                    if (oldName && nName && oldName === nName) return true;
                                    return false;
                                });

                                if (existingIdx === -1) {
                                    cleanCopy.users.push(oldU);
                                } else {
                                    const targetU = cleanCopy.users[existingIdx];
                                    if (oldU.passwordHash && !targetU.passwordHash) {
                                        targetU.passwordHash = oldU.passwordHash;
                                        targetU.passwordSalt = oldU.passwordSalt || targetU.passwordSalt;
                                    }
                                    if (oldU.googleId && !targetU.googleId) {
                                        targetU.googleId = oldU.googleId;
                                    }
                                    if (oldU.rawEmail && !targetU.rawEmail) {
                                        targetU.rawEmail = oldU.rawEmail;
                                    }
                                }
                            }

                            for (const [tok, sess] of Object.entries(dbSessions)) {
                                if (deletedTokSet.has(tok)) continue;
                                if (!cleanCopy.sessions[tok] && sess) {
                                    const sUid = String(typeof sess.userId === 'object' ? (sess.userId?.id || '') : (sess.userId || '')).toLowerCase().trim();
                                    if (!sUid || !deletedSet.has(sUid)) {
                                        cleanCopy.sessions[tok] = sess;
                                    }
                                }
                            }
                        }
                    } catch (mergeErr) {}

                    payloadToSave = cleanCopy;
                }

                // If a newer payload arrived while we were merging, skip straight to the newer payload
                if (pendingWritePayloads.has(key)) {
                    currentData = pendingWritePayloads.get(key);
                    pendingWritePayloads.delete(key);
                    continue;
                }

                const res = await queryWithRetry(
                    `INSERT INTO app_storage (key, data, updated_at) VALUES ($1, $2, NOW())
                     ON CONFLICT (key) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
                     RETURNING updated_at`,
                    [key, JSON.stringify(payloadToSave)]
                );

                if (!pendingWritePayloads.has(key)) {
                    memoryStore.set(key, payloadToSave);
                    saveLocalBackupSilently(key, payloadToSave);
                }
                const nowMs = Date.now();
                memoryLastCheckedAt.set(key, nowMs);
                lastPostgresWriteAt.set(key, nowMs);
                if (res && res.rows && res.rows[0] && res.rows[0].updated_at) {
                    memoryUpdatedAt.set(key, new Date(res.rows[0].updated_at).getTime());
                }

                if (pendingWritePayloads.has(key)) {
                    currentData = pendingWritePayloads.get(key);
                    pendingWritePayloads.delete(key);
                } else {
                    currentData = undefined;
                }
            }
            return true;
        } catch (err) {
            const msg = sanitizeLog(err);
            if (!/timeout|terminated/i.test(msg)) {
                console.warn(`[Supabase PostgreSQL] Write notice for key "${key}":`, msg);
            }
            return false;
        } finally {
            inFlightWrites.delete(key);
            if (pendingWritePayloads.has(key)) {
                const nextPayload = pendingWritePayloads.get(key);
                pendingWritePayloads.delete(key);
                writeToPostgres(key, nextPayload).catch(() => {});
            }
        }
    })();

    inFlightWrites.set(key, writePromise);
    return writePromise;
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
 * IMPORTANT: Never pollute memoryStore with defaultValue when PostgreSQL hasn't finished loading the key yet.
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

    if (defaultValue !== undefined) {
        if (memoryUpdatedAt.get(key) === -1) {
            memoryStore.set(key, defaultValue);
        }
        return defaultValue;
    }

    return null;
}

/**
 * Write accessor (updates live RAM memory state immediately in 0ms and persists to Supabase PostgreSQL with smart debouncing for high-frequency keys)
 */
function writeData(filename, data) {
    const key = normalizeKey(filename);

    // 1. Immediately update active memory state (0ms latency for client)
    memoryStore.set(key, data);
    memoryLastCheckedAt.set(key, Date.now());

    // 2. Check if this is a high-frequency telemetry/cache key that should be debounced
    const debounceMs = DEBOUNCED_WRITE_INTERVALS[key] || 0;
    if (debounceMs > 0) {
        saveLocalBackupSilently(key, data);
        const lastWrite = lastPostgresWriteAt.get(key) || 0;
        const elapsed = Date.now() - lastWrite;

        if (elapsed >= debounceMs && !inFlightWrites.has(key)) {
            lastPostgresWriteAt.set(key, Date.now());
            if (pool) {
                writeToPostgres(key, data).catch(() => {});
            }
        } else if (!debounceTimers.has(key)) {
            const waitTime = Math.max(2000, debounceMs - elapsed);
            const timer = setTimeout(() => {
                debounceTimers.delete(key);
                const latestData = memoryStore.get(key);
                if (latestData !== undefined && pool) {
                    lastPostgresWriteAt.set(key, Date.now());
                    writeToPostgres(key, latestData).catch(() => {});
                }
            }, waitTime);
            if (timer && typeof timer.unref === 'function') timer.unref();
            debounceTimers.set(key, timer);
        }
        return true;
    }

    // 3. Standard keys persist immediately
    if (pool) {
        writeToPostgres(key, data).catch(() => {});
    }

    return true;
}

// Direct preload of all remote state from Supabase PostgreSQL into RAM at startup
// Excludes large binary image keys (border_img_%) and volatile stream_cache so core state loads in <50ms
let initPromise = null;
let isInitialized = false;
async function initStorageEngine() {
    if (pool) {
        try {
            const now = Date.now();
            const res = await queryWithRetry("SELECT key, data, updated_at FROM app_storage WHERE key NOT LIKE 'border_img_%' AND key != 'stream_cache.json'");
            if (res && res.rows) {
                for (const row of res.rows) {
                    memoryStore.set(row.key, row.data);
                    memoryLastCheckedAt.set(row.key, now);
                    if (row.updated_at) {
                        memoryUpdatedAt.set(row.key, new Date(row.updated_at).getTime());
                    }
                }
                console.log(`[Supabase PostgreSQL] Cloud DB active: Loaded ${res.rows.length} keys directly into live RAM memory cache.`);
            }
            isInitialized = true;
        } catch (e) {
            console.warn('[Supabase PostgreSQL] Initial load notice:', sanitizeLog(e));
        }
    }
    isInitialized = true;
}
initPromise = initStorageEngine().catch(() => { isInitialized = true; });

async function waitForInit(timeoutMs = 2000) {
    if (isInitialized || !initPromise) return;
    try {
        await Promise.race([
            initPromise,
            new Promise(resolve => setTimeout(resolve, timeoutMs))
        ]);
    } catch (e) {}
}

// Async direct read from storage (verifies updated_at in PostgreSQL with smart TTL so requests stay ultra-fast)
async function readDataAsync(filename, defaultValue) {
    const key = normalizeKey(filename);
    await waitForInit(1800);

    const now = Date.now();
    const lastChecked = memoryLastCheckedAt.get(key) || 0;
    // Use 45s TTL for read-heavy config keys, 6s TTL for users.json to prevent connection floods while keeping multi-instance sync
    const cacheTtlMs = (key === 'users.json') ? 4000 : 45000;
    if (cacheTtlMs > 0 && memoryStore.has(key) && (now - lastChecked < cacheTtlMs)) {
        return memoryStore.get(key);
    }

    if (pool) {
        try {
            const dbCheckPromise = (async () => {
                if (memoryStore.has(key) && memoryUpdatedAt.has(key)) {
                    // Lightweight 8-byte primary key header check (avoids transferring large TOAST JSONB unless changed)
                    const metaRes = await queryWithRetry('SELECT updated_at FROM app_storage WHERE key = $1', [key]);
                    memoryLastCheckedAt.set(key, Date.now());
                    if (metaRes && metaRes.rows && metaRes.rows.length > 0) {
                        const dbUpdatedAt = metaRes.rows[0].updated_at ? new Date(metaRes.rows[0].updated_at).getTime() : 0;
                        if (dbUpdatedAt && dbUpdatedAt === memoryUpdatedAt.get(key)) {
                            return memoryStore.get(key);
                        }
                    } else if (memoryUpdatedAt.get(key) === -1) {
                        return memoryStore.get(key);
                    }
                }
                return await fetchFromPostgres(key);
            })();

            const freshData = memoryStore.has(key)
                ? await Promise.race([
                    dbCheckPromise,
                    new Promise(resolve => setTimeout(() => resolve(memoryStore.get(key)), 2200))
                ])
                : await dbCheckPromise;

            if (freshData !== null && freshData !== undefined) {
                return freshData;
            }
        } catch (e) {}
    }

    if (memoryStore.has(key)) {
        return memoryStore.get(key);
    }

    const localData = loadLocalFallbackFile(key);
    if (localData !== undefined) {
        return localData;
    }

    if (defaultValue !== undefined) {
        if (memoryUpdatedAt.get(key) === -1) {
            memoryStore.set(key, defaultValue);
        }
        return defaultValue;
    }

    return null;
}

// Async direct write to storage (updates RAM and persists to Supabase PostgreSQL)
async function writeDataAsync(filename, data) {
    const key = normalizeKey(filename);
    memoryStore.set(key, data);
    memoryLastCheckedAt.set(key, Date.now());
    if (key === '.analytics_data.json') {
        saveLocalBackupSilently(key, data);
        const lastWrite = lastPostgresWriteAt.get(key) || 0;
        if (Date.now() - lastWrite >= 8000 && !inFlightWrites.has(key) && pool) {
            lastPostgresWriteAt.set(key, Date.now());
            await Promise.race([
                writeToPostgres(key, data).catch(() => {}),
                new Promise(resolve => setTimeout(resolve, 2500))
            ]);
            return true;
        }
        return writeData(key, data);
    }
    if (DEBOUNCED_WRITE_INTERVALS[key]) {
        return writeData(key, data);
    }
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


