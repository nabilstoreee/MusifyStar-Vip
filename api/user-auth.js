const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch (e) {}
const adminAuth = require('./admin-auth.js');
const storage = require('./storage.js');
const Security = require('./security.js');
const referralsApi = require('./referrals.js');

const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'musifystar_user_secret_key_v2_sign_98741';

function generate10DigitUserId(existingUsers) {
    let newId = '';
    let isUnique = false;
    let attempts = 0;
    const usersArr = Array.isArray(existingUsers) ? existingUsers : [];
    while (!isUnique && attempts < 500) {
        attempts++;
        const first = Math.floor(Math.random() * 9 + 1).toString();
        let rest = '';
        for (let i = 0; i < 9; i++) {
            rest += Math.floor(Math.random() * 10).toString();
        }
        newId = first + rest;
        if (!usersArr.some(u => u && String(u.id || u.userId) === newId)) {
            isUnique = true;
        }
    }
    return newId;
}

function parseDurationToMs(durationStr) {
    const d = String(durationStr || '').toLowerCase().trim();
    if (!d || d === 'permanent' || d === 'permanen' || d === 'lifetime' || d === 'selamanya') {
        return null;
    }
    const hourMatch = d.match(/^(\d+)\s*(jam|hours?|h)$/);
    if (hourMatch) return parseInt(hourMatch[1]) * 60 * 60 * 1000;

    const dayMatch = d.match(/^(\d+)\s*(hari|days?|d)$/);
    if (dayMatch) return parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;

    const weekMatch = d.match(/^(\d+)\s*(minggu|weeks?|w)$/);
    if (weekMatch) return parseInt(weekMatch[1]) * 7 * 24 * 60 * 60 * 1000;

    const monthMatch = d.match(/^(\d+)\s*(bulan|months?|mo)$/);
    if (monthMatch) return parseInt(monthMatch[1]) * 30 * 24 * 60 * 60 * 1000;

    const yearMatch = d.match(/^(\d+)\s*(tahun|years?|y)$/);
    if (yearMatch) return parseInt(yearMatch[1]) * 365 * 24 * 60 * 60 * 1000;

    const num = parseInt(d);
    if (!isNaN(num) && num > 0) return num * 24 * 60 * 60 * 1000;

    return 7 * 24 * 60 * 60 * 1000;
}

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
}

function createSignedUserToken(userId, username) {
    const canonicalUid = typeof userId === 'object' && userId !== null ? (userId.id || userId.userId || String(userId)) : String(userId);
    const canonicalUser = typeof username === 'string' ? username : '';
    const payload = {
        uid: canonicalUid,
        u: canonicalUser,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days
    };
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', USER_JWT_SECRET).update(payloadStr).digest('base64url');
    return `usr_${payloadStr}.${signature}`;
}

function verifyUserToken(token) {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;

    if (cleanToken.startsWith('usr_')) {
        const parts = cleanToken.slice(4).split('.');
        if (parts.length === 2) {
            const [payloadStr, signature] = parts;
            try {
                const expectedSig = crypto.createHmac('sha256', USER_JWT_SECRET).update(payloadStr).digest('base64url');
                if (safeCompare(signature, expectedSig)) {
                    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
                    if (payload && payload.uid && payload.exp && Math.floor(Date.now() / 1000) < payload.exp) {
                        return payload;
                    }
                }
            } catch (e) {}
        }
    }
    return null;
}

function getUserIdFromToken(token, db) {
    if (!token || typeof token !== 'string') return null;
    const cleanToken = token.replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return null;
    const verified = verifyUserToken(cleanToken);
    if (verified && verified.uid) {
        if (typeof verified.uid === 'object' && verified.uid !== null) {
            return verified.uid.id || verified.uid.userId || String(verified.uid);
        }
        return String(verified.uid);
    }
    if (db && db.sessions && db.sessions[cleanToken]) {
        const sess = db.sessions[cleanToken];
        return typeof sess.userId === 'object' && sess.userId !== null ? (sess.userId.id || sess.userId.userId) : sess.userId;
    }
    return null;
}

function resolveUserVipStatus(user) {
    if (!user) return { isPremium: false, vipTier: 'none', vipExpiresAt: null };
    const email = (user.rawEmail || user.email || '').toLowerCase().trim();
    const isMaster = (email === 'jrnabil570@gmail.com');
    if (isMaster) {
        return { isPremium: true, vipTier: 'permanent', vipExpiresAt: null };
    }
    const isVipExpired = user.vipExpiresAt && Date.now() > user.vipExpiresAt;
    const isTierActive = Boolean(user.vipTier && user.vipTier !== 'none');
    const isPremium = Boolean((user.isPremium || user.is_premium || isTierActive) && user.vipTier !== 'none' && !isVipExpired);
    const vipTier = isPremium ? (user.vipTier || 'permanent') : 'none';
    const vipExpiresAt = isPremium ? (user.vipExpiresAt || null) : null;
    return { isPremium, vipTier, vipExpiresAt };
}

// Ban registry async persistence helpers
async function readBanRegistryAsync() {
    try {
        const data = await storage.readDataAsync('.ban_registry.json', {});
        return (data && typeof data === 'object') ? data : {};
    } catch (e) {
        return {};
    }
}

async function writeBanRegistryAsync(registry) {
    try {
        await storage.writeDataAsync('.ban_registry.json', registry || {});
    } catch (e) {
        console.error('Failed to write ban registry to Neon PostgreSQL:', e.message);
    }
}

function readBanRegistrySync() {
    try {
        const data = storage.readData('.ban_registry.json', {});
        return (data && typeof data === 'object') ? data : {};
    } catch (e) {
        return {};
    }
}

// Banned IPs async persistence helpers
async function readBannedIpsAsync() {
    try {
        const data = await storage.readDataAsync('.banned_ips.json', {});
        return (data && typeof data === 'object') ? data : {};
    } catch (e) {
        return {};
    }
}

async function writeBannedIpsAsync(ipsMap) {
    try {
        await storage.writeDataAsync('.banned_ips.json', ipsMap || {});
    } catch (e) {
        console.error('Failed to write banned IPs to Neon PostgreSQL:', e.message);
    }
}

function readBannedIpsSync() {
    try {
        const data = storage.readData('.banned_ips.json', {});
        return (data && typeof data === 'object') ? data : {};
    } catch (e) {
        return {};
    }
}

function getIpBanStatus(ip, bannedMap) {
    if (!ip) return { isIpBanned: false };
    const banned = bannedMap || readBannedIpsSync();
    let cleanIp = String(ip).trim().toLowerCase().replace(/^::ffff:/, '');
    if (cleanIp === '::1' || cleanIp === 'localhost') cleanIp = '127.0.0.1';

    let matchKey = Object.keys(banned).find(k => {
        let cleanK = k.trim().toLowerCase().replace(/^::ffff:/, '');
        if (cleanK === '::1' || cleanK === 'localhost') cleanK = '127.0.0.1';
        if (!cleanK) return false;
        return cleanK === cleanIp || cleanIp.startsWith(cleanK) || cleanK.startsWith(cleanIp);
    });

    if (!matchKey) return { isIpBanned: false };

    const rec = banned[matchKey];
    if (rec.banType === 'temporary' && rec.banExpiresAt) {
        if (new Date(rec.banExpiresAt).getTime() <= Date.now()) {
            delete banned[matchKey];
            writeBannedIpsAsync(banned).catch(() => {});
            return { isIpBanned: false };
        }
    }

    let durText = rec.banDurationDays ? `${rec.banDurationDays} Hari` : '';
    if (rec.banDurationDays === 1) durText = '1 Hari 24 Jam';
    else if (rec.banDurationDays === 365) durText = '1 Tahun 365 Hari';

    return {
        isIpBanned: true,
        ip: rec.ip || ip,
        banType: rec.banType || 'permanent',
        banReason: rec.banReason || 'Alamat IP Anda telah diblokir secara khusus oleh administrator.',
        banExpiresAt: rec.banExpiresAt || null,
        banDurationDays: rec.banDurationDays || null,
        banDurationText: durText,
        createdAt: rec.createdAt
    };
}

// User Ban Status resolution with anti-tamper cross-check
function getUserBanStatus(user, banRegistry) {
    if (!user) {
        return { isBanned: false, isWarning: false, banType: 'none', banReason: '', banExpiresAt: null, banDurationText: '' };
    }

    const emailKey = (user.rawEmail || user.email || '').toLowerCase().trim();
    if (emailKey === 'jrnabil570@gmail.com') {
        user.banType = 'none';
        user.banReason = '';
        user.banExpiresAt = null;
        user.banDurationDays = null;
        return { isBanned: false, isWarning: false, banType: 'none', banReason: '', banExpiresAt: null, banDurationText: '' };
    }

    // Cross-check anti-tamper ban registry
    try {
        const regMap = banRegistry || readBanRegistrySync();
        const reg = (user.id && regMap[user.id]) ||
                    (user.username && regMap[user.username.toLowerCase()]) ||
                    (emailKey && regMap[emailKey]);
        if (reg && reg.banType && reg.banType !== 'none') {
            let isStillActive = true;
            if (reg.banType === 'temporary' && reg.banExpiresAt) {
                if (new Date(reg.banExpiresAt).getTime() <= Date.now()) {
                    isStillActive = false;
                }
            }
            if (isStillActive) {
                user.banType = reg.banType;
                user.banReason = reg.banReason || user.banReason;
                user.banExpiresAt = reg.banExpiresAt || user.banExpiresAt;
                user.banDurationDays = reg.banDurationDays || user.banDurationDays;
            } else {
                user.banType = 'none';
                user.banReason = '';
                user.banExpiresAt = null;
                user.banDurationDays = null;
            }
        }
    } catch(e) {}

    if (!user.banType || user.banType === 'none') {
        return { isBanned: false, isWarning: false, banType: 'none', banReason: '', banExpiresAt: null, banDurationText: '' };
    }

    if (user.banType === 'permanent') {
        return {
            isBanned: true,
            isWarning: false,
            banType: 'permanent',
            banDurationText: 'Permanen',
            banReason: user.banReason || 'Akun Anda telah diblokir secara permanen oleh administrator karena pelanggaran.',
            banExpiresAt: null
        };
    }

    if (user.banType === 'temporary') {
        if (user.banExpiresAt && new Date(user.banExpiresAt).getTime() > Date.now()) {
            let durText = user.banDurationDays ? `${user.banDurationDays} Hari` : '';
            if (user.banDurationDays === 1) durText = '1Hari 24Jam';
            else if (user.banDurationDays === 5) durText = '5Hari';
            else if (user.banDurationDays === 7) durText = '7Hari';
            else if (user.banDurationDays === 10) durText = '10Hari';
            else if (user.banDurationDays === 20) durText = '20Hari';
            else if (user.banDurationDays === 30) durText = '1Bulan 30Hari';
            else if (user.banDurationDays === 60) durText = '2Bulan 60Hari';
            else if (user.banDurationDays === 365) durText = '1Tahun 365Hari';
            else if (user.banDurationDays === 730) durText = '2Tahun 730Hari';
            else if (user.banDurationDays === 1095) durText = '3Tahun 1095Hari';
            else if (user.banDurationDays === 1460) durText = '4Tahun 1460Hari';
            else if (user.banDurationDays === 1825) durText = '5Tahun 1825Hari';
            else if (user.banDurationDays === 3650) durText = '10Tahun 3650Hari';
            else if (user.banDurationDays === 10950) durText = '30Tahun 10950Hari';
            else if (user.banDurationDays === 14600) durText = '40Tahun 14600Hari';
            else if (user.banDurationDays === 18250) durText = '50Tahun 18250Hari';
            else if (user.banDurationDays === 32850) durText = '90Tahun 32850Hari';
            else if (user.banDurationDays === 36500) durText = '100Tahun 36500Hari';

            if (!durText && user.banExpiresAt) {
                const diffMs = new Date(user.banExpiresAt).getTime() - Date.now();
                const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
                durText = `${diffDays} Hari`;
            }

            return {
                isBanned: true,
                isWarning: false,
                banType: 'temporary',
                banDurationText: durText || 'Sementara',
                banDurationDays: user.banDurationDays || null,
                banReason: user.banReason || 'Akun Anda sedang diblokir sementara oleh administrator.',
                banExpiresAt: user.banExpiresAt
            };
        } else {
            return { isBanned: false, isWarning: false, banType: 'none', banReason: '', banExpiresAt: null, banDurationText: '' };
        }
    }

    if (user.banType === 'warning') {
        return {
            isBanned: false,
            isWarning: true,
            banType: 'warning',
            banDurationText: 'Peringatan Akun',
            banReason: user.banReason || 'Peringatan Akun dari Administrator.',
            banExpiresAt: user.banExpiresAt || null
        };
    }

    return { isBanned: false, isWarning: false, banType: 'none', banReason: '', banExpiresAt: null, banDurationText: '' };
}

let lastKnownValidUsersDb = null;

// Direct Database Async Fetcher (Neon PostgreSQL Primary)
async function readDbAsync(banRegistry) {
    try {
        let data = await storage.readDataAsync('users.json', null);
        if ((!data || !Array.isArray(data.users) || data.users.length === 0) && typeof storage.fetchFromPostgres === 'function') {
            const freshPg = await storage.fetchFromPostgres('users.json');
            if (freshPg && Array.isArray(freshPg.users) && freshPg.users.length > 0) {
                data = freshPg;
            }
        }
        if ((!data || !Array.isArray(data.users) || data.users.length === 0) && lastKnownValidUsersDb && Array.isArray(lastKnownValidUsersDb.users) && lastKnownValidUsersDb.users.length > 0) {
            data = JSON.parse(JSON.stringify(lastKnownValidUsersDb));
        }
        if (!data || !Array.isArray(data.users) || data.users.length === 0) {
            try {
                const fs = require('fs');
                const path = require('path');
                const diskCandidates = [
                    path.join(__dirname, 'users.json'),
                    path.join(__dirname, '..', 'users.json')
                ];
                for (const dp of diskCandidates) {
                    if (fs.existsSync(dp)) {
                        const parsed = JSON.parse(fs.readFileSync(dp, 'utf8'));
                        if (parsed && Array.isArray(parsed.users) && parsed.users.length > 0) {
                            data = parsed;
                            break;
                        }
                    }
                }
            } catch(e) {}
        }

        const isFallbackEmpty = !data || !Array.isArray(data.users) || data.users.length === 0;
        const result = (data && typeof data === 'object') ? data : { users: [], sessions: {} };
        if (!Array.isArray(result.users)) result.users = [];
        if (!result.sessions || typeof result.sessions !== 'object') result.sessions = {};
        if (isFallbackEmpty) {
            result._isFallbackEmpty = true;
        } else {
            delete result._isFallbackEmpty;
            lastKnownValidUsersDb = JSON.parse(JSON.stringify(result));
        }

        // Anti-Tamper Ban Registry Verification & Auto 10-Digit ID Migration
        const regMap = banRegistry || await readBanRegistryAsync();
        let dbModified = false;
        if (result.users && Array.isArray(result.users)) {
            result.users.forEach(u => {
                if (u) {
                    const isMaster = (u.rawEmail || u.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com';
                    const baseId = u.originalId || u.id;
                    const isTenDigits = typeof baseId === 'string' && /^\d{10}$/.test(baseId);
                    if (!isTenDigits || (isMaster && baseId !== '8589478687')) {
                        const oldId = u.id;
                        const newId = isMaster ? '8589478687' : generate10DigitUserId(result.users);
                        u.originalId = newId;
                        if (!u.customId) {
                            u.id = newId;
                        }
                        dbModified = true;
                        if (oldId && result.sessions) {
                            Object.keys(result.sessions).forEach(tok => {
                                const sess = result.sessions[tok];
                                if (sess && (sess.userId === oldId || (sess.userId && sess.userId.id === oldId))) {
                                    sess.userId = u.customId || newId;
                                }
                            });
                        }
                    }

                    if (!u.originalId) {
                        u.originalId = u.id;
                    }

                    // Check Custom ID Trial Expiration
                    if (u.customId && u.customIdExpiresAt && Date.now() > u.customIdExpiresAt) {
                        u.customId = null;
                        u.customIdExpiresAt = null;
                        u.isCustomIdTrial = false;
                        u.customIdLabel = null;
                        if (u.originalId) {
                            u.id = u.originalId;
                        }
                        dbModified = true;
                    } else if (u.customId) {
                        u.id = u.customId;
                    }
                    const emailKey = (u.rawEmail || u.email || '').toLowerCase();
                    const reg = regMap[u.id] ||
                                (u.username && regMap[u.username.toLowerCase()]) ||
                                (emailKey && regMap[emailKey]);
                    if (reg && reg.banType && reg.banType !== 'none') {
                        let isStillBanned = true;
                        if (reg.banType === 'temporary' && reg.banExpiresAt) {
                            if (new Date(reg.banExpiresAt).getTime() <= Date.now()) {
                                isStillBanned = false;
                            }
                        }
                        if (isStillBanned) {
                            u.banType = reg.banType;
                            u.banReason = reg.banReason || u.banReason;
                            u.banExpiresAt = reg.banExpiresAt || u.banExpiresAt;
                            u.banDurationDays = reg.banDurationDays || u.banDurationDays;
                        } else {
                            u.banType = 'none';
                            u.banReason = '';
                            u.banExpiresAt = null;
                            u.banDurationDays = null;
                        }
                    }
                }
            });
        }
        if (dbModified && !result._isFallbackEmpty) {
            await writeDbAsync(result);
        }
        return result;
    } catch (e) {
        console.error('readDbAsync error:', e.message);
        if (lastKnownValidUsersDb) return JSON.parse(JSON.stringify(lastKnownValidUsersDb));
        return { users: [], sessions: {}, _isFallbackEmpty: true };
    }
}

// Direct Database Async Saver (Neon PostgreSQL Primary)
async function writeDbAsync(data) {
    try {
        if (!data || (data._isFallbackEmpty && (!Array.isArray(data.users) || data.users.length === 0) && lastKnownValidUsersDb && lastKnownValidUsersDb.users.length > 0)) {
            console.warn('[user-auth] Prevented overwriting users.json with fallback empty DB state');
            return;
        }
        const cleanData = {
            users: data.users || [],
            sessions: data.sessions || {}
        };
        if (Array.isArray(data._deletedUserIds) && data._deletedUserIds.length > 0) {
            cleanData._deletedUserIds = data._deletedUserIds;
        }
        if (Array.isArray(data._deletedTokens) && data._deletedTokens.length > 0) {
            cleanData._deletedTokens = data._deletedTokens;
        }
        lastKnownValidUsersDb = {
            users: JSON.parse(JSON.stringify(cleanData.users)),
            sessions: JSON.parse(JSON.stringify(cleanData.sessions))
        };
        await storage.writeDataAsync('users.json', cleanData);
    } catch (e) {
        console.error('writeDbAsync error:', e.message);
    }
}

function deriveDeterministic10DigitId(seedName) {
    const clean = String(seedName || 'musisi').toLowerCase().trim();
    if (clean === 'musifystar' || clean === 'musifystar official' || clean === 'nabil') return '8589478687';
    let h1 = 2166136261;
    let h2 = 16777619;
    for (let i = 0; i < clean.length; i++) {
        const c = clean.charCodeAt(i);
        h1 ^= c;
        h1 = Math.imul(h1, 16777619) >>> 0;
        h2 ^= (c + i * 31);
        h2 = Math.imul(h2, 1103515245) >>> 0;
    }
    const firstDigit = (h1 % 9) + 1;
    const restDigits = String((h1 ^ h2) >>> 0).padStart(9, '0').slice(0, 9);
    return String(firstDigit) + restDigits;
}

async function readDeletedUsersAsync() {
    try {
        const data = await storage.readDataAsync('.deleted_users.json', {});
        return (data && typeof data === 'object') ? data : {};
    } catch (e) {
        return {};
    }
}

async function writeDeletedUsersAsync(map) {
    try {
        await storage.writeDataAsync('.deleted_users.json', map || {});
    } catch (e) {}
}

function hashPassword(password, salt) {
    salt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
    return { hash, salt };
}

function verifyPassword(password, hash, salt) {
    if (!password || !hash) return false;
    try {
        if (!salt) {
            const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
            return safeCompare(hash, legacyHash);
        }
        const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
        if (safeCompare(hash, verifyHash)) return true;
        // Fallback in case hash was legacy sha256 with salt present
        const fallbackSha = crypto.createHash('sha256').update(password).digest('hex');
        return safeCompare(hash, fallbackSha);
    } catch (e) {
        return false;
    }
}

function maskIp(ip) {
    if (!ip) return '127.0.***.***';
    const parts = ip.split('.');
    if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.***.***`;
    }
    return ip.substring(0, Math.min(ip.length, 6)) + '***';
}

function maskEmail(email) {
    if (!email) return '';
    const atIndex = email.indexOf('@');
    if (atIndex <= 1) return email;
    const name = email.substring(0, atIndex);
    const domain = email.substring(atIndex);
    const maskedName = name[0] + '***' + (name.length > 2 ? name[name.length - 1] : '');
    return maskedName + domain;
}

function maskPassword(pw) {
    return '••••••••';
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const list = forwarded.split(',');
        if (list.length > 0 && list[0].trim()) {
            return list[0].trim().replace(/^::ffff:/, '');
        }
    }
    const realIp = req.headers['x-real-ip'];
    if (realIp) return String(realIp).trim().replace(/^::ffff:/, '');
    const sockIp = req.socket && req.socket.remoteAddress;
    if (sockIp) return String(sockIp).trim().replace(/^::ffff:/, '');
    return '127.0.0.1';
}

// ==========================================
// GMAIL SMTP & REAL-TIME EMAIL OTP SYSTEM
// ==========================================
const SMTP_CONFIG_FILE = '.smtp_config.json';
const OTP_CODES_FILE = '.otp_codes.json';

async function readSmtpConfigAsync() {
    const envEmail = String(process.env.SMTP_USER || process.env.GMAIL_USER || 'jrnabil570@gmail.com').trim();
    const envPass = String(process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
    const defaultCfg = {
        enabled: Boolean(envPass),
        smtpEmail: envEmail,
        appPassword: envPass,
        senderName: 'MusifyStar StudioMusik',
        requireOtpOnRegister: true,
        requireOtpOnReset: true,
        updatedAt: null
    };
    try {
        const saved = await storage.readDataAsync(SMTP_CONFIG_FILE, null);
        if (saved && typeof saved === 'object') {
            return {
                enabled: saved.enabled !== undefined ? Boolean(saved.enabled) : defaultCfg.enabled,
                smtpEmail: String(saved.smtpEmail || defaultCfg.smtpEmail).trim(),
                appPassword: String(saved.appPassword || defaultCfg.appPassword).replace(/\s+/g, ''),
                senderName: String(saved.senderName || defaultCfg.senderName).trim(),
                requireOtpOnRegister: saved.requireOtpOnRegister !== undefined ? Boolean(saved.requireOtpOnRegister) : true,
                requireOtpOnReset: saved.requireOtpOnReset !== undefined ? Boolean(saved.requireOtpOnReset) : true,
                updatedAt: saved.updatedAt || null
            };
        }
    } catch (e) {}
    return defaultCfg;
}

async function writeSmtpConfigAsync(cfg) {
    await storage.writeDataAsync(SMTP_CONFIG_FILE, cfg);
}

async function readOtpStoreAsync() {
    try {
        const store = await storage.readDataAsync(OTP_CODES_FILE, {});
        if (store && typeof store === 'object' && !Array.isArray(store)) {
            const now = Date.now();
            Object.keys(store).forEach(k => {
                if (!store[k] || !store[k].expiresAt || (store[k].expiresAt + 60 * 60 * 1000) < now) {
                    delete store[k];
                }
            });
            return store;
        }
    } catch (e) {}
    return {};
}

async function writeOtpStoreAsync(store) {
    await storage.writeDataAsync(OTP_CODES_FILE, store || {});
}

function generate6DigitOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function sendGmailSmtpNative({ smtpEmail, cleanPass, senderName, toEmail, subjectTitle, htmlBody, inlineAttachments }) {
    const tls = require('tls');
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (err, val) => {
            if (settled) return;
            settled = true;
            try { socket.destroy(); } catch (e) {}
            if (err) reject(err);
            else resolve(val);
        };

        const socket = tls.connect({
            host: 'smtp.gmail.com',
            port: 465,
            servername: 'smtp.gmail.com',
            rejectUnauthorized: true
        });

        socket.setTimeout(20000, () => {
            finish(new Error('Koneksi ke server SMTP Gmail timeout (20 detik).'));
        });

        socket.on('error', (err) => {
            finish(new Error('Koneksi SMTP gagal: ' + (err.message || String(err))));
        });

        let buffer = '';
        let step = 0;

        const processResponse = (code, fullText) => {
            if (step === 0) {
                if (code !== 220) return finish(new Error('SMTP greeting gagal: ' + fullText));
                step = 1;
                socket.write('EHLO musifystar.web.id\r\n');
            } else if (step === 1) {
                if (code !== 250) return finish(new Error('SMTP EHLO gagal: ' + fullText));
                step = 2;
                socket.write('AUTH LOGIN\r\n');
            } else if (step === 2) {
                if (code !== 334) return finish(new Error('SMTP AUTH LOGIN gagal: ' + fullText));
                step = 3;
                socket.write(Buffer.from(smtpEmail, 'utf8').toString('base64') + '\r\n');
            } else if (step === 3) {
                if (code !== 334) return finish(new Error('SMTP Username ditolak: ' + fullText));
                step = 4;
                socket.write(Buffer.from(cleanPass, 'utf8').toString('base64') + '\r\n');
            } else if (step === 4) {
                if (code !== 235) return finish(new Error('Sandi Aplikasi Gmail (16 huruf) ditolak oleh Google: ' + fullText));
                step = 5;
                socket.write(`MAIL FROM:<${smtpEmail}>\r\n`);
            } else if (step === 5) {
                if (code !== 250) return finish(new Error('SMTP MAIL FROM gagal: ' + fullText));
                step = 6;
                socket.write(`RCPT TO:<${toEmail}>\r\n`);
            } else if (step === 6) {
                if (code !== 250) return finish(new Error('Alamat email tujuan ditolak: ' + fullText));
                step = 7;
                socket.write('DATA\r\n');
            } else if (step === 7) {
                if (code !== 354) return finish(new Error('SMTP DATA gagal: ' + fullText));
                step = 8;
                const encodedSubject = '=?UTF-8?B?' + Buffer.from(subjectTitle, 'utf8').toString('base64') + '?=';
                const safeSenderName = '=?UTF-8?B?' + Buffer.from(senderName, 'utf8').toString('base64') + '?=';
                const base64Html = Buffer.from(htmlBody, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
                const msgId = `<${Date.now()}.${Math.random().toString(36).slice(2)}@musifystar.web.id>`;

                let mimeMessage = '';
                if (Array.isArray(inlineAttachments) && inlineAttachments.length > 0) {
                    const boundary = '----=_MusifyStar_Rel_' + Date.now().toString(36);
                    const parts = [
                        `From: ${safeSenderName} <${smtpEmail}>`,
                        `To: <${toEmail}>`,
                        `Subject: ${encodedSubject}`,
                        `Message-ID: ${msgId}`,
                        `Date: ${new Date().toUTCString()}`,
                        `MIME-Version: 1.0`,
                        `Content-Type: multipart/related; boundary="${boundary}"`,
                        ``,
                        `--${boundary}`,
                        `Content-Type: text/html; charset=UTF-8`,
                        `Content-Transfer-Encoding: base64`,
                        ``,
                        base64Html
                    ];
                    for (const att of inlineAttachments) {
                        if (!att || !att.base64Data) continue;
                        const cleanB64 = String(att.base64Data).replace(/\s+/g, '').replace(/(.{76})/g, '$1\r\n');
                        const cType = att.contentType || 'image/png';
                        const fName = att.filename || 'qris.png';
                        const cid = att.cid || 'qris_musifystar_official';
                        parts.push(
                            `--${boundary}`,
                            `Content-Type: ${cType}; name="${fName}"`,
                            `Content-Transfer-Encoding: base64`,
                            `Content-ID: <${cid}>`,
                            `Content-Disposition: inline; filename="${fName}"`,
                            ``,
                            cleanB64
                        );
                    }
                    parts.push(`--${boundary}--`, `.`);
                    mimeMessage = parts.join('\r\n') + '\r\n';
                } else {
                    mimeMessage = [
                        `From: ${safeSenderName} <${smtpEmail}>`,
                        `To: <${toEmail}>`,
                        `Subject: ${encodedSubject}`,
                        `Message-ID: ${msgId}`,
                        `Date: ${new Date().toUTCString()}`,
                        `MIME-Version: 1.0`,
                        `Content-Type: text/html; charset=UTF-8`,
                        `Content-Transfer-Encoding: base64`,
                        ``,
                        base64Html,
                        `.`
                    ].join('\r\n') + '\r\n';
                }
                socket.write(mimeMessage);
            } else if (step === 8) {
                if (code !== 250) return finish(new Error('Gagal mengirim isi email: ' + fullText));
                step = 9;
                try { socket.write('QUIT\r\n'); } catch (e) {}
                finish(null, true);
            }
        };

        socket.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let lines = buffer.split('\r\n');
            buffer = lines.pop();
            let collected = [];
            for (const line of lines) {
                if (!line) continue;
                collected.push(line);
                if (/^\d{3} /.test(line)) {
                    const code = parseInt(line.slice(0, 3), 10);
                    const fullText = collected.join(' | ');
                    collected = [];
                    processResponse(code, fullText);
                }
            }
        });
    });
}

async function sendEmailOtp(toEmail, otpCode, purpose, username) {
    const cfg = await readSmtpConfigAsync();
    const smtpEmail = String(cfg.smtpEmail || '').trim();
    const cleanPass = String(cfg.appPassword || '').replace(/\s+/g, '');
    const senderName = String(cfg.senderName || 'MusifyStar StudioMusik').trim();

    if (!smtpEmail || !cleanPass) {
        throw new Error('Sandi Aplikasi Gmail (16 huruf) belum diatur di Panel Admin.');
    }

    const isReset = purpose === 'reset';
    const isTest = purpose === 'test';
    const subjectTitle = isTest
        ? `[TES OTP] Kode Verifikasi MusifyStar: ${otpCode}`
        : isReset
            ? `${otpCode} adalah Kode Reset Password MusifyStar Anda`
            : `Copy Kode Otp Anda Dibawah Untuk Pendaftaran Akun MusifyStar`;

    const purposeHeading = isTest
        ? 'Tes Pengiriman Email OTP Real-Time'
        : isReset
            ? 'Permintaan Reset Password Akun'
            : 'Verifikasi Keamanan Login Akun';

    const greetingName = username ? `@${username}` : toEmail;

    const htmlBody = `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #0d0f17; color: #ffffff; border-radius: 20px; overflow: hidden; border: 1px solid rgba(255,255,255,0.12);">
        <div style="background: linear-gradient(135deg, #e11d48 0%, #7c3aed 100%); padding: 24px 20px; text-align: center;">
            <div style="font-size: 22px; font-weight: 900; letter-spacing: 1px; color: #ffffff;">MUSIFYSTAR</div>
            <div style="font-size: 11px; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 2px; margin-top: 4px;">StudioMusik &bull; Sistem Keamanan OTP</div>
        </div>
        <div style="padding: 28px 24px; text-align: center;">
            <div style="font-size: 16px; font-weight: 700; color: #38bdf8; margin-bottom: 8px;">${purposeHeading}</div>
            <p style="font-size: 13px; color: #cbd5e1; line-height: 1.6; margin: 0 0 20px;">
                Halo <strong style="color: #ffffff;">${greetingName}</strong>,<br/>
                Gunakan 6 digit kode OTP di bawah ini untuk melanjutkan proses di <strong>MusifyStar</strong>:
            </p>
            <div style="background: #161926; border: 2px dashed #38bdf8; border-radius: 16px; padding: 18px 12px; margin: 0 auto 20px; max-width: 280px;">
                <div style="font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #facc15; font-family: monospace;">${otpCode}</div>
            </div>
            <p style="font-size: 11px; color: #94a3b8; line-height: 1.5; margin: 0;">
                Kode ini berlaku selama <strong>1menit 60detik</strong>. Jangan berikan kode ini kepada siapa pun termasuk pihak yang mengaku admin. jika ingin kode verifikasi otp tidak masuk Inbox spam teken tombol <strong>Report not spam</strong>
            </p>
        </div>
        <div style="background: #090a10; padding: 14px 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.06);">
            <strong>&copy; ${new Date().getFullYear()} ${senderName} &bull; Developer : Nabil Assihidiqi</strong>
        </div>
    </div>`;

    if (nodemailer && typeof nodemailer.createTransport === 'function') {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: smtpEmail,
                    pass: cleanPass
                }
            });

            await transporter.sendMail({
                from: `"${senderName}" <${smtpEmail}>`,
                to: toEmail,
                subject: subjectTitle,
                text: `Kode OTP MusifyStar Anda adalah: ${otpCode}. Berlaku selama 1 menit (60 detik).`,
                html: htmlBody
            });
            return true;
        } catch (nmErr) {
            console.warn('[OTP SMTP] Fallback ke Native TLS SMTP:', nmErr.message);
        }
    }

    await sendGmailSmtpNative({
        smtpEmail,
        cleanPass,
        senderName,
        toEmail,
        subjectTitle,
        htmlBody
    });

    return true;
}

// ==========================================
// VIP FREE TRIAL EXPIRATION & EMAIL BILLING INVOICE
// ==========================================
function resolveQrisImageForEmail(pCfg) {
    try {
        const rawB64 = (pCfg && pCfg.qrisBase64) || (pCfg && typeof pCfg.qrisUrl === 'string' && pCfg.qrisUrl.startsWith('data:image/') ? pCfg.qrisUrl : null);
        if (rawB64 && typeof rawB64 === 'string') {
            const m = rawB64.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
            if (m) {
                const ext = m[1].includes('jpeg') || m[1].includes('jpg') ? 'jpg' : 'png';
                return {
                    cid: 'qris_musifystar_official',
                    filename: `QRIS-MusifyStar.${ext}`,
                    contentType: m[1],
                    base64Data: m[2],
                    buffer: Buffer.from(m[2], 'base64')
                };
            }
        }
        const customQrisPath = path.join(__dirname, '..', 'public', 'qris_custom.png');
        const defaultQrisPath = path.join(__dirname, '..', 'public', 'qris.png');
        const chosenPath = fs.existsSync(customQrisPath) ? customQrisPath : (fs.existsSync(defaultQrisPath) ? defaultQrisPath : null);
        if (chosenPath) {
            const buf = fs.readFileSync(chosenPath);
            if (buf && buf.length > 0) {
                const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
                const mime = isJpeg ? 'image/jpeg' : 'image/png';
                const ext = isJpeg ? 'jpg' : 'png';
                return {
                    cid: 'qris_musifystar_official',
                    filename: `QRIS-MusifyStar.${ext}`,
                    contentType: mime,
                    base64Data: buf.toString('base64'),
                    buffer: buf
                };
            }
        }
    } catch (e) {
        console.warn('[TRIAL INVOICE] Gagal membaca file QRIS untuk lampiran email:', e.message);
    }
    return null;
}

async function sendTrialInvoiceEmail(user, invoice, paymentConfig) {
    const cfg = await readSmtpConfigAsync();
    if (!cfg.appPassword) {
        throw new Error('App Password Gmail SMTP belum dikonfigurasi di Admin Panel.');
    }

    const smtpEmail = (cfg.smtpEmail || 'jrnabil570@gmail.com').trim();
    const cleanPass = String(cfg.appPassword).replace(/\s+/g, '');
    const senderName = cfg.senderName || 'MusifyStar StudioMusik';
    const toEmail = String(user.rawEmail || user.email || '').trim().toLowerCase();
    if (!toEmail || !toEmail.includes('@') || toEmail.includes('***')) {
        throw new Error('Alamat email pengguna tidak valid untuk pengiriman tagihan.');
    }

    const pCfg = paymentConfig || {};
    const ewEnabled = pCfg.ewalletsEnabled !== false;
    const ew = pCfg.ewallets || {};
    const qrisHolder = pCfg.qrisHolder || 'NABIL (MusifyStar Official)';
    const invId = invoice.invoiceId || ('INV-TRIAL-' + Date.now());
    const pkgName = invoice.packageName || 'Paket 1 Bulan VIP';
    const amountNum = Number(invoice.amount) || 10000;
    const amountFormatted = 'Rp ' + amountNum.toLocaleString('id-ID');
    const durationText = invoice.duration || '30 Hari';
    const trialDays = invoice.trialDurationDays || user.trialDurationDays || 7;
    const createdDate = new Date(invoice.createdAt || Date.now()).toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let rawAdminWa = String(pCfg.adminWhatsapp || '6281234567890').replace(/[^0-9]/g, '');
    if (rawAdminWa.startsWith('0')) rawAdminWa = '62' + rawAdminWa.slice(1);
    if (!rawAdminWa) rawAdminWa = '6281234567890';
    const waConfirmText = encodeURIComponent(
        `Halo Admin MusifyStar! Saya sudah Scan QRIS dan ingin Lanjut Perpanjang VIP.\n\n` +
        `• Username: @${user.username}\n` +
        `• User ID: ${user.id}\n` +
        `• Email: ${toEmail}\n` +
        `• No. Tagihan: ${invId}\n` +
        `• Paket: ${pkgName} (${durationText})\n` +
        `• Total Transfer: ${amountFormatted}\n\n` +
        `Berikut saya lampirkan bukti pembayarannya. Mohon diperpanjang otomatis ya Admin!`
    );
    const waConfirmUrl = `https://wa.me/${rawAdminWa}?text=${waConfirmText}`;

    let ewalletHtmlRows = '';
    if (ewEnabled) {
        if (ew.gopay && ew.gopay.enabled !== false && ew.gopay.number) {
            ewalletHtmlRows += `
            <tr>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #38bdf8; font-weight: 800;">GoPay</td>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #ffffff; font-family: monospace; font-weight: 800; font-size: 13px;">${ew.gopay.number}</td>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; font-size: 11px; text-align: right;">a.n ${ew.gopay.holder || qrisHolder}</td>
            </tr>`;
        }
        if (ew.dana && ew.dana.enabled !== false && ew.dana.number) {
            ewalletHtmlRows += `
            <tr>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #60a5fa; font-weight: 800;">DANA</td>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #ffffff; font-family: monospace; font-weight: 800; font-size: 13px;">${ew.dana.number}</td>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; font-size: 11px; text-align: right;">a.n ${ew.dana.holder || qrisHolder}</td>
            </tr>`;
        }
        if (ew.ovo && ew.ovo.enabled !== false && ew.ovo.number) {
            ewalletHtmlRows += `
            <tr>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #c084fc; font-weight: 800;">OVO</td>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #ffffff; font-family: monospace; font-weight: 800; font-size: 13px;">${ew.ovo.number}</td>
                <td style="padding: 9px 12px; border-bottom: 1px solid rgba(255,255,255,0.08); color: #cbd5e1; font-size: 11px; text-align: right;">a.n ${ew.ovo.holder || qrisHolder}</td>
            </tr>`;
        }
    }

    const qrisAttachment = resolveQrisImageForEmail(pCfg);
    const hasEwalletRows = Boolean(ewEnabled && ewalletHtmlRows);

    const rawNote = invoice.note || 'Masa aktif Percobaan VIP (Free Trial) Anda telah berakhir. Silakan selesaikan pembayaran tagihan untuk kembali mengaktifkan akses penuh VIP MusifyStar.';
    const cleanNote = hasEwalletRows
        ? rawNote
        : rawNote.replace(/\s*atau\s+E-Wallet\s*\(GoPay\s*\/\s*DANA\s*\/\s*OVO\)/gi, '').replace(/GoPay\s*\/\s*DANA\s*\/\s*OVO/gi, 'QRIS Resmi');

    const subjectTitle = `[Tagihan VIP MusifyStar] Masa Percobaan VIP ${trialDays} Hari Telah Berakhir (${invId})`;

    const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; background: #0b0d14; color: #f8fafc; border-radius: 18px; overflow: hidden; border: 1px solid rgba(250, 204, 21, 0.3);">
        <div style="background: linear-gradient(135deg, #eab308, #f59e0b, #7c3aed); padding: 24px 22px; text-align: center;">
            <div style="display: inline-block; padding: 4px 12px; border-radius: 999px; background: rgba(0,0,0,0.35); color: #fef08a; font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px;">TAGIHAN RESMI VIP MUSIFYSTAR</div>
            <h2 style="margin: 0; font-size: 21px; font-weight: 900; color: #ffffff; letter-spacing: 0.3px;">Masa Percobaan VIP Anda Telah Habis</h2>
            <p style="margin: 6px 0 0; font-size: 12px; color: rgba(255,255,255,0.92);">Invoice ID: <strong>${invId}</strong> &bull; ${createdDate}</p>
        </div>
        <div style="padding: 24px 22px;">
            <p style="font-size: 14px; color: #e2e8f0; margin-top: 0; line-height: 1.6;">
                Halo <strong>@${user.username}</strong>,<br>
                Terima kasih telah mencoba <strong>Percobaan VIP Gratis (${trialDays} Hari)</strong> di <strong>MusifyStar</strong>. Masa aktif percobaan VIP Anda kini telah berakhir dan status akun serta border profil VIP telah dinonaktifkan sementara.
            </p>
            <div style="background: rgba(250, 204, 21, 0.07); border: 1px solid rgba(250, 204, 21, 0.35); border-radius: 14px; padding: 16px; margin: 18px 0;">
                <div style="font-size: 11px; color: #fde047; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 10px;">RINCIAN TAGIHAN PERPANJANGAN VIP</div>
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr>
                        <td style="padding: 5px 0; color: #94a3b8;">Akun Pengguna</td>
                        <td style="padding: 5px 0; color: #ffffff; font-weight: 700; text-align: right;">@${user.username} (ID: ${user.id})</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; color: #94a3b8;">Paket Langganan</td>
                        <td style="padding: 5px 0; color: #ffffff; font-weight: 700; text-align: right;">${pkgName} (${durationText})</td>
                    </tr>
                    <tr>
                        <td style="padding: 5px 0; color: #94a3b8;">Status Tagihan</td>
                        <td style="padding: 5px 0; color: #f87171; font-weight: 800; text-align: right;">BELUM DIBAYAR (UNPAID)</td>
                    </tr>
                    <tr style="border-top: 1px dashed rgba(255,255,255,0.15);">
                        <td style="padding: 10px 0 4px; color: #fde047; font-weight: 800; font-size: 14px;">Total Tagihan</td>
                        <td style="padding: 10px 0 4px; color: #facc15; font-weight: 900; font-size: 20px; text-align: right;">${amountFormatted}</td>
                    </tr>
                </table>
            </div>

            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 16px; padding: 16px; margin-bottom: 18px; text-align: center;">
                <div style="font-size: 11px; color: #38bdf8; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 6px;">METODE PEMBAYARAN RESMI MUSIFYSTAR</div>
                <p style="font-size: 12px; color: #cbd5e1; margin: 0 0 12px; line-height: 1.5;">
                    Silakan scan <strong>Barcode QRIS Resmi (${qrisHolder})</strong> di bawah ini sebesar <strong style="color: #facc15;">${amountFormatted}</strong>${hasEwalletRows ? ' atau transfer melalui E-Wallet di bawah:' : ':'}
                </p>

                ${qrisAttachment ? `
                <div style="background: #ffffff; padding: 12px; border-radius: 14px; display: inline-block; max-width: 280px; width: 100%; box-sizing: border-box; margin: 0 auto 12px; box-shadow: 0 8px 25px rgba(0,0,0,0.4);">
                    <div style="font-size: 10px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;">QRIS RESMI: ${qrisHolder}</div>
                    <img src="cid:qris_musifystar_official" alt="QRIS MusifyStar" style="width: 100%; max-width: 250px; height: auto; border-radius: 8px; display: block; margin: 0 auto;" />
                    <div style="font-size: 11px; font-weight: 800; color: #059669; margin-top: 6px;">Nominal: ${amountFormatted}</div>
                </div>
                ` : ''}

                ${hasEwalletRows ? `
                <div style="text-align: left; margin-top: 8px;">
                    <div style="font-size: 10px; color: #fde047; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; margin-bottom: 6px;">TRANSFER E-WALLET (GOPAY / DANA / OVO):</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px; background: rgba(0,0,0,0.45); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; overflow: hidden;">
                        ${ewalletHtmlRows}
                    </table>
                </div>` : ''}

                <div style="margin-top: 14px;">
                    <a href="${waConfirmUrl}" target="_blank" style="display: inline-block; width: 100%; box-sizing: border-box; padding: 12px 16px; border-radius: 12px; background: linear-gradient(135deg, #10b981, #059669); color: #000000; font-weight: 900; font-size: 13px; text-decoration: none; text-align: center;">
                        Sudah Scan QRIS? Kirim Bukti TF ke WhatsApp Admin &rarr;
                    </a>
                </div>
            </div>

            <p style="font-size: 12px; color: #94a3b8; line-height: 1.5; margin: 0;">
                ${cleanNote}
            </p>
        </div>
        <div style="background: #07080d; padding: 14px 20px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px solid rgba(255,255,255,0.06);">
            <strong>&copy; ${new Date().getFullYear()} MusifyStar Official &bull; Developer : Nabil Assihidiqi</strong>
        </div>
    </div>`;

    if (nodemailer && typeof nodemailer.createTransport === 'function') {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                host: 'smtp.gmail.com',
                port: 465,
                secure: true,
                auth: {
                    user: smtpEmail,
                    pass: cleanPass
                }
            });

            const mailOpts = {
                from: `"${senderName}" <${smtpEmail}>`,
                to: toEmail,
                subject: subjectTitle,
                text: `Halo @${user.username}, Masa Percobaan VIP MusifyStar (${trialDays} Hari) Anda telah habis. Nomor Tagihan: ${invId}. Paket: ${pkgName} (${durationText}) sebesar ${amountFormatted}. Silakan scan QRIS di email ini atau buka aplikasi MusifyStar > menu VIP.`,
                html: htmlBody
            };
            if (qrisAttachment) {
                mailOpts.attachments = [{
                    filename: qrisAttachment.filename,
                    content: qrisAttachment.buffer,
                    contentType: qrisAttachment.contentType,
                    cid: 'qris_musifystar_official'
                }];
            }
            await transporter.sendMail(mailOpts);
            return true;
        } catch (nmErr) {
            console.warn('[TRIAL INVOICE SMTP] Fallback ke Native TLS SMTP:', nmErr.message);
        }
    }

    await sendGmailSmtpNative({
        smtpEmail,
        cleanPass,
        senderName,
        toEmail,
        subjectTitle,
        htmlBody,
        inlineAttachments: qrisAttachment ? [qrisAttachment] : []
    });

    return true;
}

async function checkAndProcessExpiredVipTrial(user, db, forceExpire = false) {
    if (!user || !user.isVipTrial) return false;
    const isExpired = forceExpire || (user.vipExpiresAt && Date.now() > user.vipExpiresAt);
    if (!isExpired) return false;

    let paymentConfig = {};
    try {
        const paymentConfigApi = require('./payment-config.js');
        if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
            paymentConfig = await paymentConfigApi.getPaymentConfig();
        }
    } catch (e) {}

    const trialCfg = (paymentConfig && paymentConfig.vipTrialConfig) || {};
    const invId = 'INV-VIP-' + Date.now().toString().slice(-6) + '-' + String(user.id || '').slice(-3);
    const invoiceObj = {
        invoiceId: invId,
        userId: user.id,
        username: user.username,
        email: user.rawEmail || user.email || '',
        packageId: trialCfg.invoicePackageId || 'pkg_1month',
        packageName: trialCfg.invoicePackageName || 'Paket 1 Bulan VIP',
        amount: Number(trialCfg.invoiceAmount) || 10000,
        duration: trialCfg.invoiceDuration || '30 Hari',
        trialDurationDays: user.trialDurationDays || trialCfg.durationDays || 7,
        note: trialCfg.invoiceNote || 'Masa aktif Percobaan VIP (Free Trial) Anda telah berakhir. Silakan selesaikan pembayaran tagihan melalui QRIS atau E-Wallet (GoPay / DANA / OVO) untuk kembali mengaktifkan akses penuh VIP MusifyStar.',
        status: 'unpaid',
        createdAt: new Date().toISOString(),
        emailSent: false,
        emailSentAt: null
    };

    // Cabut akses VIP Trial, Border, Efek Nama & Custom ID
    if (user.customId && user.originalId) {
        user.id = user.originalId;
        user.customId = null;
        user.customIdExpiresAt = null;
        user.isCustomIdTrial = false;
    }
    if (user.equippedBadge === 'badge_vip_sultan') {
        user.equippedBadge = '';
        user.equippedBadgeTitle = '';
        user.equippedBadgeIcon = '';
        user.equippedBadgeColor = '';
    }
    user.isPremium = false;
    user.vipTier = 'none';
    user.vipExpiresAt = null;
    user.isVipTrial = false;
    user.trialExpiredAt = new Date().toISOString();
    if (user.border) {
        user.lastTrialBorder = user.border;
        user.lastTrialBorderUrl = user.borderUrl;
        user.lastTrialBorderName = user.borderName;
    }
    user.border = '';
    user.borderUrl = '';
    user.borderName = '';
    user.nameGlow = '';
    user.hasUnpaidTrialInvoice = true;
    user.pendingTrialInvoice = invoiceObj;

    // Kirim email tagihan otomatis (atau saat dipaksa akhiri oleh Admin)
    if (forceExpire || trialCfg.autoSendEmailInvoice !== false) {
        try {
            await sendTrialInvoiceEmail(user, invoiceObj, paymentConfig);
            user.pendingTrialInvoice.emailSent = true;
            user.pendingTrialInvoice.emailSentAt = new Date().toISOString();
            delete user.pendingTrialInvoice.emailError;
        } catch (emailErr) {
            console.warn('[TRIAL INVOICE] Gagal kirim email tagihan otomatis ke', user.rawEmail || user.email, ':', emailErr.message);
            user.pendingTrialInvoice.emailError = emailErr.message;
        }
    }

    if (db) {
        await writeDbAsync(db);
    }
    return true;
}

let _lastTrialSweepAt = 0;
let _isSweepingTrials = false;
async function sweepAllExpiredVipTrials() {
    if (_isSweepingTrials) return;
    const now = Date.now();
    if (now - _lastTrialSweepAt < 45000) return;
    _lastTrialSweepAt = now;
    _isSweepingTrials = true;
    try {
        const db = await readDbAsync();
        const users = Array.isArray(db.users) ? db.users : [];
        let anyExpired = false;
        for (const u of users) {
            if (u && u.isVipTrial && u.vipExpiresAt && now > u.vipExpiresAt) {
                const processed = await checkAndProcessExpiredVipTrial(u, null, false);
                if (processed) anyExpired = true;
            }
        }
        if (anyExpired) {
            await writeDbAsync(db);
        }
    } catch (e) {
        console.warn('[AUTO TRIAL SWEEP] Error:', e.message);
    } finally {
        _isSweepingTrials = false;
    }
}

// Jalankan pengecekan otomatis di background setiap 60 detik agar saat masa Trial VIP habis (meskipun pengguna sedang tutup aplikasi), Email Tagihan + QRIS langsung terkirim otomatis
if (!global.__musifyStarTrialAutoSweepTimer) {
    global.__musifyStarTrialAutoSweepTimer = setInterval(() => {
        sweepAllExpiredVipTrials().catch(() => {});
    }, 60 * 1000);
    if (typeof global.__musifyStarTrialAutoSweepTimer.unref === 'function') {
        global.__musifyStarTrialAutoSweepTimer.unref();
    }
}

module.exports = async (req, res) => {
    // Anti-Cache & CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token, x-user-id, x-user-name, x-user-email');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Trigger background check non-blocking jika sudah >45 detik
    sweepAllExpiredVipTrials().catch(() => {});

    try {
        const action = (req.query.action || req.body?.action || '').toLowerCase();
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch (e) { body = {}; }
        }
        body = body || {};

        // Always read fresh from Neon PostgreSQL
        const banRegistry = await readBanRegistryAsync();
        const bannedIps = await readBannedIpsAsync();
        const db = await readDbAsync(banRegistry);
        const clientIp = getClientIp(req);

        // ==========================================
        // 1. ADMIN ACTIONS (Requires Admin Token)
        // ==========================================
        if (action.startsWith('admin_')) {
            const adminToken = req.headers['x-admin-token'] || body.adminToken || req.query.adminToken;
            if (!adminToken || !adminAuth.verifyToken(adminToken)) {
                return res.status(401).json({ status: false, message: 'Akses Ditolak: Token admin tidak valid atau sesi berakhir' });
            }

            // GET ALL USERS WITH LOGIN LOGS, IP, PASSWORD SENSOR & BAN STATUS
            if (action === 'admin_get_users' || action === 'admin_list_users') {
                // Auto-heal any active users from global_chat_messages who were not yet synced into users.json
                try {
                    if (storage.pool) {
                        const deletedMap = await readDeletedUsersAsync();
                        const chatUsersRes = await storage.pool.query(
                            `SELECT DISTINCT ON (LOWER(username)) user_id, username, email, avatar_url, border_id, border_url, border_name, is_vip, vip_tier, ip_address, created_at
                             FROM global_chat_messages
                             WHERE username IS NOT NULL AND username != ''
                             ORDER BY LOWER(username), created_at DESC`
                        );
                        let healedAny = false;
                        for (const row of (chatUsersRes.rows || [])) {
                            const cName = String(row.username || '').trim();
                            const cNameLow = cName.toLowerCase();
                            const cEmail = String(row.email || '').trim().toLowerCase();
                            const cUid = String(row.user_id || '').trim();
                            if (!cName || cNameLow === 'musisi' || cNameLow === 'musifystar official' || cNameLow === 'musifystar') continue;
                            if (deletedMap[cNameLow] || (cEmail && deletedMap[cEmail]) || (cUid && deletedMap[cUid.toLowerCase()])) continue;

                            const existsInDb = db.users.some(u => {
                                if (!u) return false;
                                if (u.username && u.username.toLowerCase().trim() === cNameLow) return true;
                                if (cEmail && ((u.rawEmail && u.rawEmail.toLowerCase().trim() === cEmail) || (u.email && u.email.toLowerCase().trim() === cEmail))) return true;
                                if (cUid && /^\d{10}$/.test(cUid) && (String(u.id) === cUid || String(u.originalId) === cUid)) return true;
                                return false;
                            });

                            if (!existsInDb) {
                                const resolvedId = /^\d{10}$/.test(cUid) ? cUid : deriveDeterministic10DigitId(cName);
                                const nowIso = row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString();
                                const rawIp = row.ip_address || '127.0.0.1';
                                const healedUser = {
                                    id: resolvedId,
                                    originalId: resolvedId,
                                    username: cName,
                                    email: cEmail || `${cNameLow}@musifystar.user`,
                                    rawEmail: cEmail || `${cNameLow}@musifystar.user`,
                                    maskedPassword: '••••••••',
                                    avatar: row.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(cName)}`,
                                    border: row.border_id || '',
                                    borderUrl: row.border_url || '',
                                    borderName: row.border_name || '',
                                    role: 'member',
                                    isPremium: Boolean(row.is_vip),
                                    vipTier: row.is_vip ? (row.vip_tier || '1month') : 'none',
                                    vipExpiresAt: null,
                                    createdAt: nowIso,
                                    lastLoginAt: nowIso,
                                    lastIp: maskIp(rawIp),
                                    rawLastIp: rawIp,
                                    banType: 'none',
                                    banReason: '',
                                    banExpiresAt: null,
                                    loginLogs: [{
                                        ip: maskIp(rawIp),
                                        rawIp: rawIp,
                                        timestamp: nowIso,
                                        userAgent: 'MusifyStar Web App'
                                    }],
                                    settings: {}
                                };
                                referralsApi.generateReferralCodeForUser(healedUser, db.users);
                                db.users.push(healedUser);
                                healedAny = true;
                            }
                        }
                        if (healedAny) {
                            await writeDbAsync(db);
                        }
                    }
                } catch (healErr) {
                    console.warn('[admin_get_users] Chat user heal notice:', healErr.message);
                }

                let anyTrialExpiredInList = false;
                for (const u of (db.users || [])) {
                    if (u && u.isVipTrial && u.vipExpiresAt && Date.now() > u.vipExpiresAt) {
                        await checkAndProcessExpiredVipTrial(u, null, false);
                        anyTrialExpiredInList = true;
                    }
                }
                if (anyTrialExpiredInList) {
                    await writeDbAsync(db);
                }

                const userList = db.users.map(u => {
                    const banStatus = getUserBanStatus(u, banRegistry);
                    const isMaster = (u.rawEmail || u.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com';
                    const isVipExpired = u.vipExpiresAt && Date.now() > u.vipExpiresAt;
                    const isTierActive = Boolean(u.vipTier && u.vipTier !== 'none');
                    const isUserPremium = isMaster || (Boolean(u.isPremium || u.is_premium || isTierActive) && u.vipTier !== 'none' && !isVipExpired);
                    const userTier = isMaster ? 'permanent' : (isUserPremium ? (u.vipTier || 'permanent') : 'none');
                    return {
                        id: u.id,
                        originalId: u.originalId || u.id,
                        customId: u.customId || null,
                        username: u.username,
                        email: u.rawEmail || u.email,
                        provider: u.provider || (u.googleId ? 'google' : 'manual'),
                        avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}`,
                        createdAt: u.createdAt,
                        lastLoginAt: u.lastLoginAt || u.createdAt,
                        lastIp: u.rawLastIp || u.lastIp || '127.0.0.1',
                        maskedPassword: '••••••••',
                        isPremium: isUserPremium,
                        vipTier: userTier,
                        vipExpiresAt: isUserPremium ? (u.vipExpiresAt || null) : null,
                        border: isUserPremium ? (u.border || '') : '',
                        borderUrl: isUserPremium ? (u.borderUrl || '') : '',
                        borderName: isUserPremium ? (u.borderName || '') : '',
                        vipSource: u.vipSource || 'standard',
                        isVipTrial: Boolean(u.isVipTrial && isUserPremium),
                        hasClaimedVipTrial: Boolean(u.hasClaimedVipTrial),
                        trialClaimedAt: u.trialClaimedAt || null,
                        trialExpiredAt: u.trialExpiredAt || null,
                        trialDurationDays: u.trialDurationDays || null,
                        trialBorderAccess: u.trialBorderAccess || 'platinum',
                        trialAllowedFeatures: u.trialAllowedFeatures || null,
                        hasUnpaidTrialInvoice: Boolean(u.hasUnpaidTrialInvoice),
                        pendingTrialInvoice: u.pendingTrialInvoice || null,
                        referralBorderRestricted: Boolean(u.referralBorderRestricted),
                        referralAllowedBorders: Array.isArray(u.referralAllowedBorders) ? u.referralAllowedBorders : [],
                        referralCode: referralsApi.generateReferralCodeForUser(u, db.users),
                        referralCount: Number(u.referralCount) || 0,
                        referralPoints: Number(u.referralPoints) || 0,
                        supportCount: Number(u.supportCount) || 0,
                        donatur: referralsApi.resolveUserDonaturInfo(u),
                        banType: u.banType || 'none',
                        banReason: u.banReason || '',
                        banExpiresAt: u.banExpiresAt || null,
                        banStatus: banStatus,
                        loginLogs: (u.loginLogs || []).map(l => ({
                            ip: l.rawIp || l.ip || '127.0.0.1',
                            timestamp: l.timestamp,
                            userAgent: l.userAgent
                        }))
                    };
                });

                return res.json({ status: true, users: userList });
            }

            // ADMIN SET VIP & BORDER ACCESS FOR ANY USER
            if (action === 'admin_set_vip') {
                const targetId = String(body.targetId || body.userId || body.id || '').trim();
                const targetUsername = String(body.username || '').trim().toLowerCase();
                const targetEmail = String(body.email || '').trim().toLowerCase();
                const vipTier = String(body.vipTier || 'none').toLowerCase(); // '1month', '5months', 'permanent', 'none'
                const isPremium = vipTier !== 'none';

                let userIndex = -1;
                if (targetId) {
                    userIndex = db.users.findIndex(u => u.id === targetId || (u.id && u.id.toLowerCase() === targetId.toLowerCase()));
                }
                if (userIndex === -1 && targetEmail) {
                    userIndex = db.users.findIndex(u =>
                        (u.email && u.email.toLowerCase() === targetEmail) ||
                        (u.rawEmail && u.rawEmail.toLowerCase() === targetEmail)
                    );
                }
                if (userIndex === -1 && targetUsername) {
                    userIndex = db.users.findIndex(u => u.username && u.username.toLowerCase() === targetUsername);
                }

                if (userIndex === -1) {
                    return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
                }

                const user = db.users[userIndex];
                user.isPremium = isPremium;
                user.is_premium = isPremium;
                user.isVip = isPremium;
                user.is_vip = isPremium;
                user.vipTier = vipTier;
                user.vipGrantedAt = isPremium ? Date.now() : null;
                if (isPremium) {
                    user.vipSource = 'admin';
                    user.referralBorderRestricted = false;
                    user.supportCount = (Number(user.supportCount) || 0) + 1;
                }

                const customDays = parseInt(body.durationDays, 10);
                if (vipTier === 'permanent' || customDays === 0) {
                    user.vipExpiresAt = null; // Selamanya
                } else if (!isNaN(customDays) && customDays > 0) {
                    user.vipExpiresAt = Date.now() + (customDays * 24 * 60 * 60 * 1000);
                } else if (vipTier === 'trial' || vipTier === '1week') {
                    user.vipExpiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 hari trial
                } else if (vipTier === '1month') {
                    user.vipExpiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 hari
                } else if (vipTier === '2months') {
                    user.vipExpiresAt = Date.now() + (60 * 24 * 60 * 60 * 1000); // 60 hari
                } else if (vipTier === '5months') {
                    user.vipExpiresAt = Date.now() + (150 * 24 * 60 * 60 * 1000); // 150 hari
                } else if (vipTier === 'permanent') {
                    user.vipExpiresAt = null; // Selamanya
                } else {
                    user.isPremium = false;
                    user.is_premium = false;
                    user.isVip = false;
                    user.is_vip = false;
                    user.vipTier = 'none';
                    user.vipExpiresAt = null;
                    user.vipGrantedAt = null;
                    user.border = '';
                    user.borderUrl = '';
                    user.borderName = '';
                }

                // Admin direct border assignment (optional)
                const targetBorder = body.border !== undefined ? body.border : body.borderId;
                if (targetBorder !== undefined) {
                    const borderMap = {
                        'border_platinum': { name: 'Platinum', url: '/borders/Platinum.png' },
                        'border_master': { name: 'Master', url: '/borders/Master.png' },
                        'border_legend': { name: 'Legend', url: '/borders/Legend.png' },
                        'border_immortal': { name: 'Immortal', url: '/borders/Imortal.png' }
                    };
                    if (borderMap[targetBorder]) {
                        user.border = targetBorder;
                        user.borderUrl = borderMap[targetBorder].url;
                        user.borderName = borderMap[targetBorder].name;
                    } else if (targetBorder === 'none' || targetBorder === '') {
                        user.border = '';
                        user.borderUrl = '';
                        user.borderName = '';
                    }
                } else if (vipTier === '1month' && (user.border === 'border_legend' || user.border === 'border_immortal')) {
                    user.border = 'border_platinum';
                    user.borderUrl = '/borders/Platinum.png';
                    user.borderName = 'Platinum';
                } else if (vipTier === '2months' && user.border === 'border_immortal') {
                    user.border = 'border_legend';
                    user.borderUrl = '/borders/Legend.png';
                    user.borderName = 'Legend';
                }

                db.users[userIndex] = user;
                await writeDbAsync(db);

                // Kirim pesan otomatis ke Kotak Masuk Pesan Admin pengguna jika VIP aktif
                if (isPremium) {
                    try {
                        const messagesApi = require('./messages.js');
                        if (messagesApi && typeof messagesApi.sendVipWelcomeMessage === 'function') {
                            await messagesApi.sendVipWelcomeMessage(user.id, user.username, vipTier);
                        }
                    } catch (mErr) {
                        console.error('[AUTH] Gagal mengirim pesan otomatis VIP:', mErr.message);
                    }
                }

                const tierName = vipTier === '1month' 
                    ? 'VIP 1 Bulan (Border Platinum & Master + Semua Fitur)' 
                    : (vipTier === '2months'
                        ? 'VIP 2 Bulan (Border Platinum, Master, Legend + Semua Fitur)'
                        : (vipTier === '5months' 
                            ? 'VIP 5 Bulan (Border Platinum, Master, Legend, Immortal + Semua Fitur)' 
                            : (vipTier === 'permanent' 
                                ? 'VIP Permanen (Semua Border & Fitur Premium)' 
                                : 'Non-VIP (Gratis)')));

                return res.json({
                    status: true,
                    message: isPremium ? `Hak akses ${tierName} berhasil diberikan kepada @${user.username}!` : `Status VIP pengguna @${user.username} telah dinonaktifkan.`,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.rawEmail || user.email,
                        isPremium: user.isPremium,
                        vipTier: user.vipTier,
                        vipExpiresAt: user.vipExpiresAt,
                        border: user.border,
                        borderUrl: user.borderUrl,
                        borderName: user.borderName
                    }
                });
            }

            // BAN / WARN / UNBAN USER
            if (action === 'admin_ban_user') {
                const targetId = String(body.targetId || body.userId || body.id || '').trim();
                const targetUsername = String(body.username || '').trim().toLowerCase();
                const targetEmail = String(body.email || '').trim().toLowerCase();
                const targetIp = String(body.ip || '').trim().toLowerCase();

                const banType = String(body.banType || 'none').toLowerCase();
                const durationDays = Number(body.durationDays || 0);
                const banReason = String(body.banReason || '').trim();

                let userIndex = -1;

                if (targetId) {
                    userIndex = db.users.findIndex(u => u.id === targetId || u.id.toLowerCase() === targetId.toLowerCase());
                    if (userIndex === -1) {
                        userIndex = db.users.findIndex(u => u.id.toLowerCase().includes(targetId.toLowerCase()));
                    }
                } else if (targetUsername) {
                    userIndex = db.users.findIndex(u => u.username && u.username.toLowerCase() === targetUsername);
                } else if (targetEmail) {
                    userIndex = db.users.findIndex(u =>
                        (u.email && u.email.toLowerCase() === targetEmail) ||
                        (u.rawEmail && u.rawEmail.toLowerCase() === targetEmail)
                    );
                } else if (targetIp) {
                    userIndex = db.users.findIndex(u =>
                        (u.lastIp || '').toLowerCase().includes(targetIp) ||
                        (u.rawLastIp || '').toLowerCase().includes(targetIp) ||
                        (u.loginLogs || []).some(l => (l.ip || '').toLowerCase().includes(targetIp) || (l.rawIp || '').toLowerCase().includes(targetIp))
                    );
                }

                if (userIndex === -1) {
                    const queryInfo = targetId ? `User ID "${targetId}"` : targetUsername ? `Username "@${targetUsername}"` : targetEmail ? `Email "${targetEmail}"` : targetIp ? `IP "${targetIp}"` : 'kriteria tersebut';
                    return res.status(404).json({ status: false, message: `Pengguna dengan ${queryInfo} tidak ditemukan.` });
                }

                const user = db.users[userIndex];
                user.banType = banType;
                if (banType === 'none') {
                    user.banReason = '';
                    user.banExpiresAt = null;
                    user.banDurationDays = null;
                } else {
                    user.banReason = banReason || 'Akun Anda telah diblokir atau diberikan sanksi oleh administrator.';
                }

                if (banType === 'temporary' && durationDays > 0) {
                    const expires = new Date();
                    expires.setDate(expires.getDate() + durationDays);
                    user.banExpiresAt = expires.toISOString();
                    user.banDurationDays = durationDays;
                } else {
                    user.banExpiresAt = null;
                    user.banDurationDays = null;
                }

                // Update Ban Registry for Anti-Tamper Protection
                const userEmail = (user.rawEmail || user.email || '').toLowerCase();
                if (banType === 'none') {
                    delete banRegistry[user.id];
                    if (user.username) delete banRegistry[user.username.toLowerCase()];
                    if (userEmail) delete banRegistry[userEmail];
                } else {
                    const regObj = {
                        userId: user.id,
                        username: user.username,
                        email: userEmail,
                        banType: user.banType,
                        banReason: user.banReason,
                        banExpiresAt: user.banExpiresAt,
                        banDurationDays: user.banDurationDays,
                        updatedAt: new Date().toISOString()
                    };
                    banRegistry[user.id] = regObj;
                    if (user.username) banRegistry[user.username.toLowerCase()] = regObj;
                    if (userEmail) banRegistry[userEmail] = regObj;
                }
                await writeBanRegistryAsync(banRegistry);

                // If user is banned, invalidate their active sessions
                if (banType === 'permanent' || banType === 'temporary') {
                    Object.keys(db.sessions).forEach(tok => {
                        if (db.sessions[tok] && (db.sessions[tok].userId === user.id || db.sessions[tok].userId?.id === user.id)) {
                            db.sessions[tok].banned = true;
                        }
                    });
                }

                db.users[userIndex] = user;
                await writeDbAsync(db);

                const freshBanStatus = getUserBanStatus(user, banRegistry);
                return res.json({
                    status: true,
                    message: banType === 'none' ? 'Sanksi akun berhasil dicabut / di-unban' : `Sanksi berhasil diterapkan (${user.banType})`,
                    banStatus: freshBanStatus,
                    user: {
                        id: user.id,
                        username: user.username,
                        banType: user.banType,
                        banReason: user.banReason,
                        banExpiresAt: user.banExpiresAt
                    }
                });
            }

            // UNBAN USER (Explicit Action)
            if (action === 'admin_unban_user') {
                const targetId = String(body.targetId || body.userId || body.id || '').trim();
                const targetUsername = String(body.username || '').trim().toLowerCase();
                const targetEmail = String(body.email || '').trim().toLowerCase();

                let userIndex = -1;
                if (targetId) {
                    userIndex = db.users.findIndex(u => u.id === targetId || u.id.toLowerCase() === targetId.toLowerCase());
                } else if (targetUsername) {
                    userIndex = db.users.findIndex(u => u.username && u.username.toLowerCase() === targetUsername);
                } else if (targetEmail) {
                    userIndex = db.users.findIndex(u =>
                        (u.email && u.email.toLowerCase() === targetEmail) ||
                        (u.rawEmail && u.rawEmail.toLowerCase() === targetEmail)
                    );
                }

                if (userIndex !== -1) {
                    const user = db.users[userIndex];
                    user.banType = 'none';
                    user.banReason = '';
                    user.banExpiresAt = null;
                    user.banDurationDays = null;
                    db.users[userIndex] = user;

                    const userEmail = (user.rawEmail || user.email || '').toLowerCase();
                    delete banRegistry[user.id];
                    if (user.username) delete banRegistry[user.username.toLowerCase()];
                    if (userEmail) delete banRegistry[userEmail];
                    await writeBanRegistryAsync(banRegistry);
                    await writeDbAsync(db);
                } else {
                    if (targetId) delete banRegistry[targetId];
                    if (targetUsername) delete banRegistry[targetUsername];
                    if (targetEmail) delete banRegistry[targetEmail];
                    await writeBanRegistryAsync(banRegistry);
                }

                return res.json({ status: true, message: 'Akun berhasil di-unban dan dipulihkan sepenuhnya.' });
            }

            // DELETE USER (Admin can delete ANY account directly, whether active or banned)
            if (action === 'admin_delete_user') {
                const targetId = String(body.targetId || body.userId || body.id || '').trim();
                const targetUsername = String(body.username || '').trim().toLowerCase();
                const targetEmail = String(body.email || '').trim().toLowerCase();

                if (!targetId && !targetUsername && !targetEmail) {
                    return res.status(400).json({ status: false, message: 'Identitas target pengguna wajib diisi' });
                }

                let userIndex = -1;
                if (targetId) {
                    userIndex = db.users.findIndex(u => u.id === targetId || (u.id && u.id.toLowerCase() === targetId.toLowerCase()));
                }
                if (userIndex === -1 && targetUsername) {
                    userIndex = db.users.findIndex(u => u.username && u.username.toLowerCase() === targetUsername);
                }
                if (userIndex === -1 && targetEmail) {
                    userIndex = db.users.findIndex(u =>
                        (u.email && u.email.toLowerCase() === targetEmail) ||
                        (u.rawEmail && u.rawEmail.toLowerCase() === targetEmail)
                    );
                }

                let deletedUsername = targetUsername || targetId;
                const deletedIdentifiers = [targetId, targetUsername, targetEmail].filter(Boolean);

                if (userIndex !== -1) {
                    const deletedUser = db.users[userIndex];
                    deletedUsername = deletedUser.username || deletedUsername;
                    const uId = deletedUser.id;
                    const uOrigId = deletedUser.originalId;
                    if (uId) deletedIdentifiers.push(uId);
                    if (uOrigId) deletedIdentifiers.push(uOrigId);
                    if (deletedUser.username) deletedIdentifiers.push(deletedUser.username.toLowerCase());
                    if (deletedUser.email) deletedIdentifiers.push(deletedUser.email.toLowerCase());
                    if (deletedUser.rawEmail) deletedIdentifiers.push(deletedUser.rawEmail.toLowerCase());

                    db.users.splice(userIndex, 1);

                    // Clean all sessions
                    Object.keys(db.sessions).forEach(tok => {
                        if (db.sessions[tok] && (db.sessions[tok].userId === uId || db.sessions[tok].userId?.id === uId || db.sessions[tok].userId === targetId)) {
                            delete db.sessions[tok];
                        }
                    });

                    // Clean ban registry
                    if (uId) delete banRegistry[uId];
                    if (deletedUser.username) delete banRegistry[deletedUser.username.toLowerCase()];
                    if (deletedUser.email) delete banRegistry[deletedUser.email.toLowerCase()];
                    if (deletedUser.rawEmail) delete banRegistry[deletedUser.rawEmail.toLowerCase()];
                }

                // Record deleted identifiers so auto-heal doesn't resurrect intentionally deleted users
                try {
                    const deletedMap = await readDeletedUsersAsync();
                    deletedIdentifiers.forEach(k => {
                        const cleanK = String(k || '').toLowerCase().trim();
                        if (cleanK) deletedMap[cleanK] = Date.now();
                    });
                    await writeDeletedUsersAsync(deletedMap);
                } catch (e) {}

                // Also purge from ban registry directly if was registered under ID / username / email
                if (targetId) delete banRegistry[targetId];
                if (targetUsername) delete banRegistry[targetUsername];
                if (targetEmail) delete banRegistry[targetEmail];

                db._deletedUserIds = deletedIdentifiers;
                await writeBanRegistryAsync(banRegistry);
                await writeDbAsync(db);

                return res.json({ status: true, message: `Akun @${deletedUsername} berhasil dihapus permanen dari sistem.` });
            }

            // BAN IP ADDRESS (BLACKLIST)
            if (action === 'admin_ban_ip') {
                const targetIp = String(body.ip || '').trim().replace(/^::ffff:/, '');
                const banType = String(body.banType || 'permanent').toLowerCase();
                const durationDays = Number(body.durationDays || 0);
                const banReason = String(body.banReason || '').trim() || 'Alamat IP ini diblacklist oleh administrator.';

                if (!targetIp) {
                    return res.status(400).json({ status: false, message: 'Alamat IP target wajib diisi' });
                }

                let expiresAt = null;
                if (banType === 'temporary' && durationDays > 0) {
                    const exp = new Date();
                    exp.setDate(exp.getDate() + durationDays);
                    expiresAt = exp.toISOString();
                }

                bannedIps[targetIp] = {
                    ip: targetIp,
                    banType: banType,
                    banReason: banReason,
                    banExpiresAt: expiresAt,
                    banDurationDays: durationDays,
                    createdAt: new Date().toISOString()
                };

                await writeBannedIpsAsync(bannedIps);
                return res.json({ status: true, message: `Alamat IP ${targetIp} berhasil diblokir (${banType})`, record: bannedIps[targetIp] });
            }

            // UNBAN IP ADDRESS
            if (action === 'admin_unban_ip') {
                const targetIp = String(body.ip || '').trim().replace(/^::ffff:/, '');
                if (!targetIp) {
                    return res.status(400).json({ status: false, message: 'Alamat IP target wajib diisi' });
                }

                let deleted = false;
                Object.keys(bannedIps).forEach(k => {
                    if (k === targetIp || k.toLowerCase() === targetIp.toLowerCase()) {
                        delete bannedIps[k];
                        deleted = true;
                    }
                });

                await writeBannedIpsAsync(bannedIps);
                return res.json({ status: true, message: deleted ? `Alamat IP ${targetIp} berhasil di-unban` : 'Alamat IP tidak ditemukan di blacklist' });
            }

            // GET BANNED IPS LIST
            if (action === 'admin_get_banned_ips') {
                return res.json({ status: true, bannedIps: bannedIps });
            }

            // GET GMAIL SMTP OTP CONFIG
            if (action === 'admin_get_smtp_config') {
                const cfg = await readSmtpConfigAsync();
                const hasPass = Boolean(cfg.appPassword && cfg.appPassword.length >= 8);
                const maskedPass = hasPass
                    ? cfg.appPassword.slice(0, 2) + '••••••••••••' + cfg.appPassword.slice(-2)
                    : '';
                return res.json({
                    status: true,
                    config: {
                        enabled: Boolean(cfg.enabled && hasPass),
                        smtpEmail: cfg.smtpEmail || 'jrnabil570@gmail.com',
                        senderName: cfg.senderName || 'MusifyStar StudioMusik',
                        hasAppPassword: hasPass,
                        maskedPassword: maskedPass,
                        requireOtpOnRegister: cfg.requireOtpOnRegister !== false,
                        requireOtpOnReset: cfg.requireOtpOnReset !== false,
                        updatedAt: cfg.updatedAt || null
                    }
                });
            }

            // SAVE GMAIL SMTP OTP CONFIG
            if (action === 'admin_save_smtp_config') {
                const currentCfg = await readSmtpConfigAsync();
                const smtpEmail = String(body.smtpEmail || currentCfg.smtpEmail || 'jrnabil570@gmail.com').trim().toLowerCase();
                const rawInputPass = String(body.appPassword !== undefined ? body.appPassword : '').replace(/\s+/g, '');
                const finalPass = rawInputPass ? rawInputPass : String(currentCfg.appPassword || '').replace(/\s+/g, '');
                const senderName = String(body.senderName || currentCfg.senderName || 'MusifyStar StudioMusik').trim();
                const enabled = body.enabled !== undefined ? Boolean(body.enabled) : Boolean(finalPass);
                const requireOtpOnRegister = body.requireOtpOnRegister !== undefined ? Boolean(body.requireOtpOnRegister) : true;
                const requireOtpOnReset = body.requireOtpOnReset !== undefined ? Boolean(body.requireOtpOnReset) : true;

                if (!smtpEmail || !smtpEmail.includes('@')) {
                    return res.status(400).json({ status: false, message: 'Alamat Email Gmail pengirim tidak valid.' });
                }
                if (enabled && (!finalPass || finalPass.length < 12)) {
                    return res.status(400).json({ status: false, message: 'Masukkan 16 huruf Sandi Aplikasi (App Password) Google terlebih dahulu.' });
                }

                const newCfg = {
                    enabled: enabled,
                    smtpEmail: smtpEmail,
                    appPassword: finalPass,
                    senderName: senderName,
                    requireOtpOnRegister: requireOtpOnRegister,
                    requireOtpOnReset: requireOtpOnReset,
                    updatedAt: new Date().toISOString()
                };
                await writeSmtpConfigAsync(newCfg);

                return res.json({
                    status: true,
                    message: enabled
                        ? 'Konfigurasi Email OTP (Gmail SMTP) berhasil disimpan & diaktifkan!'
                        : 'Konfigurasi Email OTP disimpan (Status: Nonaktif).',
                    config: {
                        enabled: Boolean(newCfg.enabled && newCfg.appPassword),
                        smtpEmail: newCfg.smtpEmail,
                        senderName: newCfg.senderName,
                        hasAppPassword: Boolean(newCfg.appPassword),
                        maskedPassword: newCfg.appPassword ? (newCfg.appPassword.slice(0, 2) + '••••••••••••' + newCfg.appPassword.slice(-2)) : '',
                        requireOtpOnRegister: newCfg.requireOtpOnRegister,
                        requireOtpOnReset: newCfg.requireOtpOnReset,
                        updatedAt: newCfg.updatedAt
                    }
                });
            }

            // TEST GMAIL SMTP OTP EMAIL
            if (action === 'admin_test_smtp') {
                const cfg = await readSmtpConfigAsync();
                const targetEmail = String(body.testEmail || cfg.smtpEmail || 'jrnabil570@gmail.com').trim().toLowerCase();
                if (!targetEmail || !targetEmail.includes('@')) {
                    return res.status(400).json({ status: false, message: 'Masukkan email tujuan tes yang valid.' });
                }
                const testOtp = generate6DigitOtp();
                try {
                    await sendEmailOtp(targetEmail, testOtp, 'test', 'AdminMusifyStar');
                    return res.json({
                        status: true,
                        message: `Berhasil! Email Tes OTP (${testOtp}) telah dikirim real-time ke ${targetEmail}. Silakan cek kotak masuk!`
                    });
                } catch (err) {
                    return res.status(400).json({
                        status: false,
                        message: 'Gagal mengirim email OTP: ' + (err.message || 'Periksa kembali 16 huruf Sandi Aplikasi Google Anda.')
                    });
                }
            }

            // ADMIN: GET VIP TRIALS, INVOICES & PAYMENT CONFIG
            if (action === 'admin_get_vip_trials') {
                let anyExpired = false;
                for (const u of (db.users || [])) {
                    if (u && u.isVipTrial && u.vipExpiresAt && Date.now() > u.vipExpiresAt) {
                        await checkAndProcessExpiredVipTrial(u, null, false);
                        anyExpired = true;
                    }
                }
                if (anyExpired) {
                    await writeDbAsync(db);
                }

                let paymentConfig = {};
                try {
                    const paymentConfigApi = require('./payment-config.js');
                    if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                        paymentConfig = await paymentConfigApi.getPaymentConfig();
                    }
                } catch (e) {}

                const allUsers = (db.users || []).filter(Boolean).map(u => ({
                    id: u.id,
                    originalId: u.originalId || u.id,
                    username: u.username,
                    email: u.rawEmail || u.email || '',
                    avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}`,
                    border: u.border || '',
                    borderUrl: u.borderUrl || '',
                    borderName: u.borderName || '',
                    lastTrialBorder: u.lastTrialBorder || '',
                    lastTrialBorderUrl: u.lastTrialBorderUrl || '',
                    lastTrialBorderName: u.lastTrialBorderName || '',
                    isPremium: Boolean(u.isPremium),
                    vipTier: u.vipTier || 'none',
                    vipExpiresAt: u.vipExpiresAt || null,
                    vipSource: u.vipSource || 'standard',
                    isVipTrial: Boolean(u.isVipTrial),
                    hasClaimedVipTrial: Boolean(u.hasClaimedVipTrial),
                    trialClaimedAt: u.trialClaimedAt || null,
                    trialExpiredAt: u.trialExpiredAt || null,
                    trialDurationDays: u.trialDurationDays || null,
                    trialBorderAccess: u.trialBorderAccess || 'platinum',
                    trialAllowedFeatures: u.trialAllowedFeatures || null,
                    hasUnpaidTrialInvoice: Boolean(u.hasUnpaidTrialInvoice),
                    pendingTrialInvoice: u.pendingTrialInvoice || null,
                    createdAt: u.createdAt || null,
                    lastLoginAt: u.lastLoginAt || null
                }));

                return res.json({
                    status: true,
                    paymentConfig: paymentConfig,
                    vipTrialConfig: paymentConfig.vipTrialConfig || {},
                    users: allUsers
                });
            }

            // ADMIN: SEND OR RESEND TRIAL BILLING INVOICE EMAIL TO USER (AND TERMINATE ANY ACTIVE TRIAL)
            if (action === 'admin_send_trial_invoice') {
                const targetId = String(body.userId || body.targetId || '').trim();
                const targetUsername = String(body.username || '').replace(/^@/, '').trim().toLowerCase();
                const user = (db.users || []).find(u => u && (
                    (targetId && (String(u.id) === targetId || String(u.originalId) === targetId || String(u.customId) === targetId)) ||
                    (targetUsername && (u.username || '').toLowerCase() === targetUsername)
                ));
                if (!user) {
                    return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan.' });
                }

                let paymentConfig = {};
                try {
                    const paymentConfigApi = require('./payment-config.js');
                    if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                        paymentConfig = await paymentConfigApi.getPaymentConfig();
                    }
                } catch (e) {}
                const trialCfg = paymentConfig.vipTrialConfig || {};

                const customAmount = Number(body.amount) || (user.pendingTrialInvoice && user.pendingTrialInvoice.amount) || Number(trialCfg.invoiceAmount) || 10000;
                const customPkgName = String(body.packageName || (user.pendingTrialInvoice && user.pendingTrialInvoice.packageName) || trialCfg.invoicePackageName || 'Paket 1 Bulan VIP').trim();
                const customDuration = String(body.duration || (user.pendingTrialInvoice && user.pendingTrialInvoice.duration) || trialCfg.invoiceDuration || '30 Hari').trim();
                const customNote = String(body.note || (user.pendingTrialInvoice && user.pendingTrialInvoice.note) || trialCfg.invoiceNote || '').trim();

                if (user.customId && user.originalId) {
                    user.id = user.originalId;
                    user.customId = null;
                    user.customIdExpiresAt = null;
                    user.isCustomIdTrial = false;
                }
                if (user.equippedBadge === 'badge_vip_sultan') {
                    user.equippedBadge = '';
                    user.equippedBadgeTitle = '';
                    user.equippedBadgeIcon = '';
                    user.equippedBadgeColor = '';
                }

                const invoiceObj = {
                    invoiceId: (user.pendingTrialInvoice && user.pendingTrialInvoice.invoiceId) || ('INV-VIP-' + Date.now().toString().slice(-6) + '-' + String(user.id).slice(-3)),
                    userId: user.id,
                    username: user.username,
                    email: user.rawEmail || user.email || '',
                    packageId: trialCfg.invoicePackageId || 'pkg_1month',
                    packageName: customPkgName,
                    amount: customAmount,
                    duration: customDuration,
                    trialDurationDays: user.trialDurationDays || trialCfg.durationDays || 7,
                    note: customNote,
                    status: 'unpaid',
                    createdAt: new Date().toISOString(),
                    emailSent: false,
                    emailSentAt: null
                };

                // Pastikan status Trial berakhir saat tagihan email dikirim/dikirim ulang agar tidak bentrok dengan TRIAL AKTIF
                user.isPremium = false;
                user.vipTier = 'none';
                user.vipExpiresAt = null;
                user.isVipTrial = false;
                user.hasClaimedVipTrial = true;
                user.trialExpiredAt = user.trialExpiredAt || new Date().toISOString();
                if (user.border) {
                    user.lastTrialBorder = user.border;
                    user.lastTrialBorderUrl = user.borderUrl;
                    user.lastTrialBorderName = user.borderName;
                }
                user.border = '';
                user.borderUrl = '';
                user.borderName = '';
                user.nameGlow = '';
                user.hasUnpaidTrialInvoice = true;
                user.pendingTrialInvoice = invoiceObj;

                try {
                    await sendTrialInvoiceEmail(user, invoiceObj, paymentConfig);
                    user.pendingTrialInvoice.emailSent = true;
                    user.pendingTrialInvoice.emailSentAt = new Date().toISOString();
                    delete user.pendingTrialInvoice.emailError;
                    await writeDbAsync(db);
                    return res.json({
                        status: true,
                        message: `Masa Trial diakhiri & Email Tagihan VIP (${invoiceObj.invoiceId} - Rp ${customAmount.toLocaleString('id-ID')}) beserta foto QRIS berhasil dikirim ke ${user.rawEmail || user.email}!`,
                        invoice: user.pendingTrialInvoice,
                        user: {
                            id: user.id,
                            originalId: user.originalId || user.id,
                            customId: null,
                            username: user.username,
                            isPremium: false,
                            vipTier: 'none',
                            vipExpiresAt: null,
                            isVipTrial: false,
                            border: '',
                            borderUrl: '',
                            borderName: '',
                            nameGlow: '',
                            hasUnpaidTrialInvoice: true,
                            pendingTrialInvoice: user.pendingTrialInvoice
                        }
                    });
                } catch (err) {
                    user.pendingTrialInvoice.emailError = err.message;
                    await writeDbAsync(db);
                    return res.status(400).json({
                        status: false,
                        message: `Masa Trial diakhiri, namun gagal mengirim email ke ${user.rawEmail || user.email}: ${err.message}`
                    });
                }
            }

            // ADMIN: MANAGE USER VIP TRIAL (GRANT TRIAL, EXPIRE & BILL NOW, MARK PAID, RESET TRIAL)
            if (action === 'admin_manage_user_trial') {
                const subAction = String(body.subAction || '').toLowerCase().trim();
                const targetId = String(body.userId || body.targetId || '').trim();
                const targetUsername = String(body.username || '').replace(/^@/, '').trim().toLowerCase();
                const user = (db.users || []).find(u => u && (
                    (targetId && (String(u.id) === targetId || String(u.originalId) === targetId || String(u.customId) === targetId)) ||
                    (targetUsername && (u.username || '').toLowerCase() === targetUsername)
                ));
                if (!user) {
                    return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan.' });
                }

                let paymentConfig = {};
                try {
                    const paymentConfigApi = require('./payment-config.js');
                    if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                        paymentConfig = await paymentConfigApi.getPaymentConfig();
                    }
                } catch (e) {}
                const trialCfg = paymentConfig.vipTrialConfig || {};

                if (subAction === 'grant_trial') {
                    const days = Math.max(1, Math.min(3650, Number(body.durationDays) || Number(trialCfg.durationDays) || 7));
                    const bAccess = String(body.borderAccess || trialCfg.borderAccess || 'platinum').toLowerCase();
                    const mergedFeatures = Object.assign(
                        {
                            liquidGlassIos27: true,
                            nameGlow: true,
                            customId: true,
                            vipAvatar: true,
                            dynamicIsland: true,
                            highAudio: true,
                            backgroundPlay: true,
                            keepScreenAwake: true,
                            swipeGestures: true,
                            vipSultanBadge: true
                        },
                        trialCfg.allowedFeatures || {},
                        (body.allowedFeatures && typeof body.allowedFeatures === 'object') ? body.allowedFeatures : {}
                    );
                    user.isPremium = true;
                    user.vipTier = bAccess === 'all' ? 'permanent' : (bAccess === 'platinum_master_legend' ? '2months' : '1month');
                    user.vipGrantedAt = Date.now();
                    user.vipExpiresAt = Date.now() + (days * 24 * 3600 * 1000);
                    user.vipSource = 'trial';
                    user.isVipTrial = true;
                    user.hasClaimedVipTrial = true;
                    user.trialClaimedAt = new Date().toISOString();
                    user.trialExpiredAt = null;
                    user.trialDurationDays = days;
                    user.trialBorderAccess = bAccess;
                    user.trialAllowedFeatures = mergedFeatures;
                    user.hasUnpaidTrialInvoice = false;
                    user.pendingTrialInvoice = null;
                    if (mergedFeatures.customId === false && user.customId) {
                        user.id = user.originalId || user.id;
                        user.customId = null;
                        user.customIdExpiresAt = null;
                        user.isCustomIdTrial = false;
                    }
                    if (mergedFeatures.nameGlow === false && user.nameGlow) {
                        user.nameGlow = '';
                    }
                    if (mergedFeatures.vipSultanBadge === false && user.equippedBadge === 'badge_vip_sultan') {
                        user.equippedBadge = '';
                        user.equippedBadgeTitle = '';
                        user.equippedBadgeIcon = '';
                        user.equippedBadgeColor = '';
                    }
                    if (bAccess === 'none') {
                        user.border = '';
                        user.borderUrl = '';
                        user.borderName = '';
                    } else if (!user.border) {
                        user.border = 'border_platinum';
                        user.borderUrl = '/borders/Platinum.png';
                        user.borderName = 'Platinum';
                    }
                    await writeDbAsync(db);
                    return res.json({
                        status: true,
                        message: `Percobaan VIP (${days} Hari) berhasil diaktifkan untuk @${user.username}!`,
                        user: {
                            id: user.id,
                            originalId: user.originalId || user.id,
                            customId: user.customId || null,
                            username: user.username,
                            isPremium: true,
                            vipTier: user.vipTier,
                            vipExpiresAt: user.vipExpiresAt,
                            vipSource: 'trial',
                            isVipTrial: true,
                            trialDurationDays: user.trialDurationDays,
                            trialBorderAccess: user.trialBorderAccess,
                            trialAllowedFeatures: user.trialAllowedFeatures,
                            nameGlow: user.nameGlow || '',
                            border: user.border || '',
                            borderUrl: user.borderUrl || '',
                            borderName: user.borderName || '',
                            hasUnpaidTrialInvoice: false,
                            pendingTrialInvoice: null
                        }
                    });
                }

                if (subAction === 'expire_and_bill') {
                    user.isVipTrial = true;
                    user.hasClaimedVipTrial = true;
                    await checkAndProcessExpiredVipTrial(user, db, true);
                    const emailOk = user.pendingTrialInvoice && user.pendingTrialInvoice.emailSent;
                    return res.json({
                        status: true,
                        message: emailOk
                            ? `Masa Trial @${user.username} diakhiri & Email Tagihan (${user.pendingTrialInvoice.invoiceId}) beserta foto QRIS berhasil dikirim ke ${user.rawEmail || user.email}!`
                            : `Masa Trial @${user.username} diakhiri (Email belum terkirim: ${user.pendingTrialInvoice?.emailError || 'cek konfigurasi SMTP'}).`,
                        user: {
                            id: user.id,
                            originalId: user.originalId || user.id,
                            customId: null,
                            username: user.username,
                            isPremium: false,
                            vipTier: 'none',
                            vipExpiresAt: null,
                            isVipTrial: false,
                            border: '',
                            borderUrl: '',
                            borderName: '',
                            nameGlow: '',
                            hasUnpaidTrialInvoice: true,
                            pendingTrialInvoice: user.pendingTrialInvoice
                        }
                    });
                }

                if (subAction === 'mark_paid' || subAction === 'auto_extend_vip') {
                    const extPkg = String(body.extendPackage || 'trial_same').toLowerCase().trim();
                    const extBorder = String(body.extendBorder || 'trial_border').toLowerCase().trim();
                    const trialDays = Number(user.trialDurationDays) || (user.pendingTrialInvoice && parseInt(user.pendingTrialInvoice.duration)) || Number(trialCfg.durationDays) || 7;
                    const trialPkgName = (user.pendingTrialInvoice && user.pendingTrialInvoice.packageName) || trialCfg.invoicePackageName || `Paket ${trialDays} Hari VIP`;

                    let chosenTier = '1month';
                    let chosenDurationLabel = '1 Bulan (30 Hari)';
                    let durationMs = 30 * 24 * 3600 * 1000;

                    if (extPkg === 'trial_same' || extPkg === 'trial' || extPkg === 'trial_current') {
                        durationMs = trialDays * 24 * 3600 * 1000;
                        chosenDurationLabel = `${trialDays} Hari (${trialPkgName})`;
                        chosenTier = (user.trialBorderAccess === 'all') ? 'permanent' : (user.trialBorderAccess === 'platinum_master_legend' ? '5months' : '1month');
                    } else if (extPkg === '1week' || extPkg === '7days') {
                        chosenTier = '1month';
                        chosenDurationLabel = '7 Hari (Paket Mingguan)';
                        durationMs = 7 * 24 * 3600 * 1000;
                    } else if (extPkg === '1month' || extPkg === '30days') {
                        chosenTier = '1month';
                        chosenDurationLabel = '1 Bulan (30 Hari)';
                        durationMs = 30 * 24 * 3600 * 1000;
                    } else if (extPkg === '5months' || extPkg === '150days') {
                        chosenTier = '5months';
                        chosenDurationLabel = '5 Bulan (150 Hari)';
                        durationMs = 150 * 24 * 3600 * 1000;
                    } else if (extPkg === 'permanent' || extPkg === 'lifetime') {
                        chosenTier = 'permanent';
                        chosenDurationLabel = 'Permanen (Lifetime)';
                        durationMs = null;
                    }

                    // Tentukan Border VIP yang dipasang saat perpanjang otomatis
                    let finalBorderId = 'border_platinum';
                    let finalBorderName = 'Platinum';
                    let finalBorderUrl = '/borders/Platinum.png';

                    if (extBorder === 'trial_border') {
                        if (user.border) {
                            finalBorderId = user.border;
                            finalBorderName = user.borderName || 'Platinum';
                            finalBorderUrl = user.borderUrl || '/borders/Platinum.png';
                        } else if (user.lastTrialBorder) {
                            finalBorderId = user.lastTrialBorder;
                            finalBorderName = user.lastTrialBorderName || 'Platinum';
                            finalBorderUrl = user.lastTrialBorderUrl || '/borders/Platinum.png';
                        } else if (user.trialBorderAccess === 'all') {
                            finalBorderId = 'border_immortal';
                            finalBorderName = 'Immortal';
                            finalBorderUrl = '/borders/Imortal.png';
                            chosenTier = 'permanent';
                        } else if (user.trialBorderAccess === 'platinum_master_legend') {
                            finalBorderId = 'border_legend';
                            finalBorderName = 'Legend';
                            finalBorderUrl = '/borders/Legend.png';
                            if (chosenTier === '1month') chosenTier = '5months';
                        } else if (user.trialBorderAccess === 'platinum_master') {
                            finalBorderId = 'border_master';
                            finalBorderName = 'Master';
                            finalBorderUrl = '/borders/Master.png';
                        } else if (user.trialBorderAccess === 'none') {
                            finalBorderId = '';
                            finalBorderName = '';
                            finalBorderUrl = '';
                        }
                    } else if (extBorder === 'border_platinum' || extBorder === 'platinum') {
                        finalBorderId = 'border_platinum';
                        finalBorderName = 'Platinum';
                        finalBorderUrl = '/borders/Platinum.png';
                    } else if (extBorder === 'border_master' || extBorder === 'master') {
                        finalBorderId = 'border_master';
                        finalBorderName = 'Master';
                        finalBorderUrl = '/borders/Master.png';
                    } else if (extBorder === 'border_legend' || extBorder === 'legend') {
                        finalBorderId = 'border_legend';
                        finalBorderName = 'Legend';
                        finalBorderUrl = '/borders/Legend.png';
                        if (chosenTier === '1month') chosenTier = '5months';
                    } else if (extBorder === 'border_immortal' || extBorder === 'immortal') {
                        finalBorderId = 'border_immortal';
                        finalBorderName = 'Immortal';
                        finalBorderUrl = '/borders/Imortal.png';
                        chosenTier = 'permanent';
                    } else if (extBorder === 'all') {
                        finalBorderId = 'border_immortal';
                        finalBorderName = 'Immortal';
                        finalBorderUrl = '/borders/Imortal.png';
                        chosenTier = 'permanent';
                    } else if (extBorder === 'none') {
                        finalBorderId = '';
                        finalBorderName = '';
                        finalBorderUrl = '';
                    }

                    user.isPremium = true;
                    user.is_premium = true;
                    user.isVip = true;
                    user.vipTier = chosenTier;
                    user.vipGrantedAt = Date.now();
                    user.vipExpiresAt = durationMs ? (Date.now() + durationMs) : null;
                    user.vipSource = 'paid';
                    user.isVipTrial = false;
                    user.hasUnpaidTrialInvoice = false;
                    user.border = finalBorderId;
                    user.borderName = finalBorderName;
                    user.borderUrl = finalBorderUrl;

                    if (user.pendingTrialInvoice) {
                        user.pendingTrialInvoice.status = 'paid';
                        user.pendingTrialInvoice.waitingAdminApproval = false;
                        user.pendingTrialInvoice.paidAt = new Date().toISOString();
                        user.pendingTrialInvoice.paidMethod = user.pendingTrialInvoice.paymentMethod || 'QRIS (Dikonfirmasi Admin)';
                        user.pendingTrialInvoice.extendedDuration = chosenDurationLabel;
                    }
                    await writeDbAsync(db);

                    try {
                        const messagesApi = require('./messages.js');
                        if (messagesApi && typeof messagesApi.sendVipWelcomeMessage === 'function') {
                            await messagesApi.sendVipWelcomeMessage(user.id, user.username, chosenTier, chosenDurationLabel);
                        }
                    } catch (e) {}

                    return res.json({
                        status: true,
                        message: `✅ VIP @${user.username} berhasil diperpanjang otomatis (${chosenDurationLabel}) & Tagihan telah LUNAS/dihapus!`,
                        user: {
                            id: user.id,
                            username: user.username,
                            isPremium: true,
                            vipTier: user.vipTier,
                            vipExpiresAt: user.vipExpiresAt,
                            vipSource: 'paid',
                            isVipTrial: false,
                            hasUnpaidTrialInvoice: false,
                            pendingTrialInvoice: user.pendingTrialInvoice,
                            border: user.border,
                            borderUrl: user.borderUrl,
                            borderName: user.borderName
                        }
                    });
                }

                if (subAction === 'cancel_renewal' || subAction === 'decline_renewal') {
                    user.isVipTrial = false;
                    user.hasUnpaidTrialInvoice = false;
                    if (user.vipSource === 'trial') {
                        user.isPremium = false;
                        user.vipTier = 'none';
                        user.vipExpiresAt = null;
                        user.vipSource = 'standard';
                        user.border = '';
                        user.borderUrl = '';
                        user.borderName = '';
                    }
                    if (user.pendingTrialInvoice) {
                        user.pendingTrialInvoice.status = 'declined';
                        user.pendingTrialInvoice.waitingAdminApproval = false;
                        user.pendingTrialInvoice.declinedAt = new Date().toISOString();
                    }
                    await writeDbAsync(db);
                    return res.json({
                        status: true,
                        message: `Tagihan @${user.username} telah dihapus (Tidak Lanjut Perpanjang VIP).`,
                        user: {
                            id: user.id,
                            username: user.username,
                            isPremium: Boolean(user.isPremium),
                            vipTier: user.vipTier || 'none',
                            vipExpiresAt: user.vipExpiresAt || null,
                            isVipTrial: false,
                            hasUnpaidTrialInvoice: false,
                            pendingTrialInvoice: user.pendingTrialInvoice
                        }
                    });
                }

                if (subAction === 'reset_trial') {
                    user.isVipTrial = false;
                    user.hasClaimedVipTrial = false;
                    user.trialClaimedAt = null;
                    user.trialExpiredAt = null;
                    user.hasUnpaidTrialInvoice = false;
                    user.pendingTrialInvoice = null;
                    if (user.vipSource === 'trial') {
                        user.isPremium = false;
                        user.vipTier = 'none';
                        user.vipExpiresAt = null;
                        user.vipSource = 'standard';
                    }
                    await writeDbAsync(db);
                    return res.json({
                        status: true,
                        message: `Status klaim Trial & Tagihan untuk @${user.username} berhasil di-reset (pengguna bisa klaim trial ulang).`,
                        user: {
                            id: user.id,
                            username: user.username,
                            isPremium: Boolean(user.isPremium),
                            vipTier: user.vipTier || 'none',
                            vipExpiresAt: user.vipExpiresAt || null,
                            isVipTrial: false,
                            hasClaimedVipTrial: false,
                            hasUnpaidTrialInvoice: false,
                            pendingTrialInvoice: null
                        }
                    });
                }

                return res.status(400).json({ status: false, message: 'Sub-action tidak dikenal.' });
            }

            return res.status(400).json({ status: false, message: 'Action admin tidak dikenal' });
        }

        // PUBLIC OTP STATUS CHECK
        if (action === 'get_otp_status') {
            const cfg = await readSmtpConfigAsync();
            const active = Boolean(cfg.enabled && cfg.appPassword);
            return res.json({
                status: true,
                otpEnabled: active,
                requireOtpOnRegister: Boolean(active && cfg.requireOtpOnRegister !== false),
                requireOtpOnReset: Boolean(active && cfg.requireOtpOnReset !== false)
            });
        }

        // SEND LOGIN OTP (RESEND)
        if (action === 'send_login_otp' || action === 'send_register_otp') {
            const rawIdentifier = String(body.username || body.email || '').replace(/^@/, '').trim().toLowerCase();
            if (!rawIdentifier) {
                return res.status(400).json({ status: false, message: 'Masukkan Username atau Email terlebih dahulu' });
            }

            let user = (db.users || []).find(u => {
                if (!u) return false;
                const uName = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
                const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                const uMasked = String(u.email || '').trim().toLowerCase();
                return uName === rawIdentifier || uEmail === rawIdentifier || uMasked === rawIdentifier;
            });

            if (!user && (rawIdentifier === 'musifystar' || rawIdentifier === 'musifystar official')) {
                user = (db.users || []).find(u => {
                    if (!u) return false;
                    const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                    return uEmail === 'jrnabil570@gmail.com';
                });
            }

            if (!user) {
                return res.status(404).json({ status: false, message: 'Akun tidak ditemukan' });
            }

            const targetEmail = String(user.rawEmail || user.email || '').trim().toLowerCase();
            if (!targetEmail || !targetEmail.includes('@') || targetEmail.includes('***')) {
                return res.status(400).json({ status: false, message: 'Akun ini tidak memiliki alamat email valid untuk menerima OTP.' });
            }

            const otpStore = await readOtpStoreAsync();
            const key = `login_${targetEmail}`;
            const now = Date.now();

            const otpCode = generate6DigitOtp();
            try {
                await sendEmailOtp(targetEmail, otpCode, 'login', user.username);
            } catch (err) {
                return res.status(500).json({
                    status: false,
                    message: 'Gagal mengirim kode OTP ke email: ' + (err.message || 'Gangguan jaringan SMTP')
                });
            }

            const expAt = Date.now() + 60 * 1000;
            otpStore[key] = {
                code: otpCode,
                email: targetEmail,
                username: user.username,
                purpose: 'login',
                lastSentAt: Date.now(),
                expiresAt: expAt,
                attempts: 0
            };
            await writeOtpStoreAsync(otpStore);

            return res.json({
                status: true,
                otpSent: true,
                otpRequired: true,
                expiresAt: expAt,
                ttlSeconds: 60,
                email: targetEmail,
                maskedEmail: maskEmail(targetEmail),
                message: `Kode OTP 6 digit baru telah dikirim ulang ke ${targetEmail}!`
            });
        }

        // ==========================================
        // 2. USER ACTIONS (GET ME, LOGIN, REGISTER, ETC)
        // ==========================================

        // Check if current client IP is IP-Banned
        const ipBanCheck = Security.getIpBanStatus(clientIp, bannedIps);
        if (ipBanCheck.isIpBanned) {
            return res.status(403).json({
                status: false,
                ipBanned: true,
                banned: true,
                ban: {
                    isBanned: true,
                    isIpBanned: true,
                    ip: clientIp,
                    banType: ipBanCheck.banType,
                    banReason: ipBanCheck.banReason,
                    banExpiresAt: ipBanCheck.banExpiresAt,
                    banDurationDays: ipBanCheck.banDurationDays,
                    banDurationText: ipBanCheck.banDurationText
                },
                message: 'ALAMAT IP ANDA DIBLOKIR / DIBANNED KHUSUS OLEH ADMINISTRATOR'
            });
        }

        // POST /api/user-auth?action=report_tamper
        if (action === 'report_tamper') {
            const reason = (body && body.reason) || 'Percobaan manipulasi status VIP akun lewat DevTools / Console / Storage';
            const banResult = await Security.banIp(clientIp, reason, {
                userId: (body && body.userId) || '',
                username: (body && body.username) || '',
                detail: (body && body.detail) || ''
            });
            return res.status(403).json({
                status: false,
                ipBanned: true,
                banned: true,
                message: 'Alamat IP Anda telah diblokir secara permanen.',
                ban: banResult
            });
        }

        // GET /api/user-auth?action=check_account_ban
        if (action === 'check_account_ban') {
            const targetUsername = String(req.query.username || body.username || '').trim().toLowerCase();
            const targetEmail = String(req.query.email || body.email || '').trim().toLowerCase();
            const targetUserId = String(req.query.userId || body.userId || '').trim();

            if (ipBanCheck.isIpBanned) {
                return res.json({
                    status: true,
                    banned: true,
                    ipBanned: true,
                    ban: {
                        isBanned: true,
                        isIpBanned: true,
                        ip: clientIp,
                        banType: ipBanCheck.banType,
                        banReason: ipBanCheck.banReason,
                        banExpiresAt: ipBanCheck.banExpiresAt,
                        banDurationDays: ipBanCheck.banDurationDays,
                        banDurationText: ipBanCheck.banDurationText
                    }
                });
            }

            const user = db.users.find(u => {
                if (targetUserId && (u.id === targetUserId || u.id.toLowerCase() === targetUserId.toLowerCase())) return true;
                if (targetUsername && u.username && u.username.toLowerCase() === targetUsername) return true;
                if (targetEmail && ((u.rawEmail && u.rawEmail.toLowerCase() === targetEmail) || (u.email && u.email.toLowerCase() === targetEmail))) return true;
                return false;
            });

            // Direct check against ban registry
            const reg = (targetUserId && banRegistry[targetUserId]) ||
                        (targetUsername && banRegistry[targetUsername]) ||
                        (targetEmail && banRegistry[targetEmail]);
            if (reg && reg.banType && reg.banType !== 'none') {
                let isStillActive = true;
                if (reg.banType === 'temporary' && reg.banExpiresAt && new Date(reg.banExpiresAt).getTime() <= Date.now()) {
                    isStillActive = false;
                }
                if (isStillActive) {
                    const regBanStatus = getUserBanStatus(reg, banRegistry);
                    return res.json({
                        status: true,
                        banned: true,
                        unbanned: false,
                        ban: regBanStatus,
                        user: user ? { id: user.id, username: user.username } : { id: reg.userId || targetUserId, username: reg.username || targetUsername }
                    });
                }
            }

            if (!user) {
                return res.json({ status: false, banned: true, unbanned: false, message: 'Identitas akun tidak ditemukan' });
            }

            const banStatus = getUserBanStatus(user, banRegistry);
            return res.json({
                status: true,
                banned: banStatus.isBanned,
                unbanned: !banStatus.isBanned,
                ban: banStatus,
                user: { id: user.id, username: user.username }
            });
        }

        // GET /api/user-auth?action=me
        if (action === 'me' || (!action && req.method === 'GET')) {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
                          req.headers['x-auth-token'] ||
                          req.headers['x-token'] ||
                          req.query.token ||
                          (req.body && req.body.token);
            const fallbackUserId = String(req.headers['x-user-id'] || req.query.userId || '').trim();
            const rawFallbackUsername = String(req.headers['x-user-name'] || req.query.username || '').trim();
            const fallbackUsername = rawFallbackUsername.toLowerCase();
            const fallbackEmail = String(req.headers['x-user-email'] || req.query.email || '').trim().toLowerCase();

            const verifiedTok = verifyUserToken(token);
            let targetUserId = getUserIdFromToken(token, db);
            let user = null;

            if (targetUserId) {
                user = db.users.find(u => u && (String(u.id) === String(targetUserId) || String(u.originalId) === String(targetUserId)));
            }

            // Fallback claimed user
            if (!user && (fallbackUserId || fallbackUsername || fallbackEmail || (verifiedTok && verifiedTok.u))) {
                const lookupName = fallbackUsername || (verifiedTok && verifiedTok.u ? String(verifiedTok.u).toLowerCase().trim() : '');
                user = db.users.find(u => {
                    if (!u) return false;
                    if (fallbackUserId && (String(u.id) === fallbackUserId || (u.originalId && String(u.originalId) === fallbackUserId) || String(u.id).toLowerCase() === fallbackUserId.toLowerCase())) return true;
                    if (lookupName && u.username && u.username.toLowerCase() === lookupName) return true;
                    if (fallbackEmail && ((u.rawEmail && u.rawEmail.toLowerCase() === fallbackEmail) || (u.email && u.email.toLowerCase() === fallbackEmail))) return true;
                    return false;
                });
            }

            // Auto-heal manually registered or active session user if missing from users.json
            if (!user && (verifiedTok || (rawFallbackUsername && fallbackEmail && fallbackEmail.includes('@')))) {
                try {
                    const deletedMap = await readDeletedUsersAsync();
                    const healName = rawFallbackUsername || (verifiedTok && verifiedTok.u ? String(verifiedTok.u).trim() : '');
                    const healNameLow = healName.toLowerCase();
                    const healUid = String(fallbackUserId || (verifiedTok && verifiedTok.uid) || '').trim();
                    const isDeleted = (healNameLow && deletedMap[healNameLow]) ||
                                      (fallbackEmail && deletedMap[fallbackEmail]) ||
                                      (healUid && deletedMap[healUid.toLowerCase()]);
                    if (!isDeleted && healName && healNameLow !== 'guest' && healNameLow !== 'musisi') {
                        const isMasterHeal = (fallbackEmail === 'jrnabil570@gmail.com');
                        const resolvedId = isMasterHeal
                            ? '8589478687'
                            : (/^\d{10}$/.test(healUid) ? healUid : deriveDeterministic10DigitId(healName));
                        const nowIso = new Date().toISOString();
                        const maskedClientIp = maskIp(clientIp);
                        user = {
                            id: resolvedId,
                            originalId: resolvedId,
                            username: healName,
                            email: fallbackEmail || `${healNameLow}@musifystar.user`,
                            rawEmail: fallbackEmail || `${healNameLow}@musifystar.user`,
                            provider: 'manual',
                            maskedPassword: '••••••••',
                            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(healName)}`,
                            role: isMasterHeal ? 'admin' : 'member',
                            isPremium: isMasterHeal,
                            vipTier: isMasterHeal ? 'permanent' : 'none',
                            vipExpiresAt: null,
                            createdAt: nowIso,
                            lastLoginAt: nowIso,
                            lastIp: maskedClientIp,
                            rawLastIp: clientIp,
                            banType: 'none',
                            banReason: '',
                            banExpiresAt: null,
                            loginLogs: [{
                                ip: maskedClientIp,
                                rawIp: clientIp,
                                timestamp: nowIso,
                                userAgent: req.headers['user-agent'] || ''
                            }],
                            settings: {}
                        };
                        referralsApi.generateReferralCodeForUser(user, db.users);
                        db.users.push(user);
                        targetUserId = user.id;
                        delete db._isFallbackEmpty;
                        await writeDbAsync(db);
                    }
                } catch (healErr) {
                    console.warn('[action=me] Auto-heal user notice:', healErr.message);
                }
            }

            if (user) {
                if (!targetUserId && (verifiedTok || token || fallbackUserId || fallbackEmail)) {
                    targetUserId = user.id;
                }
                // Check if user has an expired trial custom ID
                if (user.customId && user.customIdExpiresAt && Date.now() > user.customIdExpiresAt) {
                    user.id = user.originalId || user.id;
                    user.customId = null;
                    user.customIdExpiresAt = null;
                    user.isCustomIdTrial = false;
                    await writeDbAsync(db);
                }

                const banStatus = getUserBanStatus(user, banRegistry);
                if (banStatus.isBanned) {
                    return res.json({
                        status: true,
                        authenticated: false,
                        banned: true,
                        ban: banStatus,
                        user: {
                            id: user.id,
                            originalId: user.originalId || user.id,
                            customId: user.customId || null,
                            username: user.username,
                            email: user.rawEmail || user.email,
                            rawEmail: user.rawEmail || user.email,
                            avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`,
                            createdAt: user.createdAt
                        },
                        message: banStatus.banReason || 'Akun Anda sedang diblokir oleh administrator.'
                    });
                }

                if (targetUserId) {
                    // Check if user's VIP Free Trial has expired -> auto-revert & send billing email
                    if (user.isVipTrial && user.vipExpiresAt && Date.now() > user.vipExpiresAt) {
                        await checkAndProcessExpiredVipTrial(user, db, false);
                    }

                    // Sync active VIP Trial allowedFeatures & borderAccess with latest Admin config
                    if (user.isVipTrial) {
                        try {
                            const paymentConfigApi = require('./payment-config.js');
                            if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                                const payCfg = await paymentConfigApi.getPaymentConfig();
                                if (payCfg && payCfg.vipTrialConfig) {
                                    user.trialAllowedFeatures = Object.assign({}, payCfg.vipTrialConfig.allowedFeatures || {});
                                    user.trialBorderAccess = payCfg.vipTrialConfig.borderAccess || user.trialBorderAccess || 'platinum';
                                    if (user.trialAllowedFeatures.customId === false && user.customId) {
                                        user.id = user.originalId || user.id;
                                        user.customId = null;
                                        user.customIdExpiresAt = null;
                                        user.isCustomIdTrial = false;
                                    }
                                    if (user.trialAllowedFeatures.nameGlow === false && user.nameGlow) {
                                        user.nameGlow = '';
                                    }
                                }
                            }
                        } catch (e) {}
                    }

                    const vipInfo = resolveUserVipStatus(user);
                    const isMasterAdmin = ((user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com');

                    if ((!isMasterAdmin && !vipInfo.isPremium) || (user.isVipTrial && user.trialAllowedFeatures && user.trialAllowedFeatures.nameGlow === false)) {
                        if (user.nameGlow) {
                            user.nameGlow = '';
                            await writeDbAsync(db);
                        }
                    }

                    if (isMasterAdmin) {
                        Security.addImmuneIp(clientIp);
                    }

                    const vipSig = Security.generateVipSignature(user.id, vipInfo.vipTier, vipInfo.vipExpiresAt);
                    const refreshedToken = !verifiedTok ? createSignedUserToken(user.id, user.username) : undefined;

                    return res.json({
                        status: true,
                        authenticated: true,
                        newToken: refreshedToken,
                        banned: false,
                        ban: banStatus,
                        clientIp: clientIp,
                        ip: clientIp,
                        user: {
                            id: user.id,
                            originalId: user.originalId || user.id,
                            customId: user.customId || null,
                            customIdExpiresAt: user.customIdExpiresAt || null,
                            isCustomIdTrial: Boolean(user.isCustomIdTrial),
                            username: user.username,
                            email: user.rawEmail || user.email,
                            rawEmail: user.rawEmail || user.email,
                            avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`,
                            border: user.border || '',
                            borderUrl: user.borderUrl || '',
                            borderName: user.borderName || '',
                            equippedBadge: user.equippedBadge || '',
                            equippedBadgeTitle: user.equippedBadgeTitle || '',
                            equippedBadgeIcon: user.equippedBadgeIcon || '',
                            equippedBadgeColor: user.equippedBadgeColor || '',
                            nameGlow: user.nameGlow || '',
                            isPremium: isMasterAdmin || vipInfo.isPremium,
                            vipTier: isMasterAdmin ? 'permanent' : vipInfo.vipTier,
                            vipExpiresAt: isMasterAdmin ? null : vipInfo.vipExpiresAt,
                            vipSource: user.vipSource || 'standard',
                            isVipTrial: Boolean(user.isVipTrial && vipInfo.isPremium),
                            hasClaimedVipTrial: Boolean(user.hasClaimedVipTrial),
                            trialClaimedAt: user.trialClaimedAt || null,
                            trialExpiredAt: user.trialExpiredAt || null,
                            trialDurationDays: user.trialDurationDays || null,
                            trialBorderAccess: user.trialBorderAccess || 'platinum',
                            trialAllowedFeatures: user.trialAllowedFeatures || null,
                            hasUnpaidTrialInvoice: Boolean(user.hasUnpaidTrialInvoice),
                            pendingTrialInvoice: user.pendingTrialInvoice || null,
                            referralBorderRestricted: Boolean(user.referralBorderRestricted),
                            referralAllowedBorders: Array.isArray(user.referralAllowedBorders) ? user.referralAllowedBorders : [],
                            referralCode: referralsApi.generateReferralCodeForUser(user, db.users),
                            referralCount: Number(user.referralCount) || 0,
                            referralPoints: Number(user.referralPoints) || 0,
                            referredBy: user.referredBy || null,
                            referredByUsername: user.referredByUsername || '',
                            supportCount: Number(user.supportCount) || 0,
                            donatur: referralsApi.resolveUserDonaturInfo(user),
                            vipSignature: vipSig,
                            role: isMasterAdmin ? 'admin' : 'member',
                            settings: user.settings || {},
                            createdAt: user.createdAt,
                            ip: clientIp,
                            lastIp: clientIp
                        }
                    });
                } else {
                    return res.json({
                        status: true,
                        authenticated: false,
                        unverifiedProbe: true,
                        banned: false,
                        ban: banStatus,
                        user: null
                    });
                }
            }

            // Direct ban registry check for claimed identifiers
            const reg = (fallbackUserId && banRegistry[fallbackUserId]) ||
                        (fallbackUsername && banRegistry[fallbackUsername]) ||
                        (fallbackEmail && banRegistry[fallbackEmail]);
            if (reg && reg.banType && reg.banType !== 'none') {
                let isStillActive = true;
                if (reg.banType === 'temporary' && reg.banExpiresAt && new Date(reg.banExpiresAt).getTime() <= Date.now()) {
                    isStillActive = false;
                }
                if (isStillActive) {
                    const regBanStatus = getUserBanStatus(reg, banRegistry);
                    return res.json({
                        status: true,
                        authenticated: false,
                        banned: true,
                        ban: regBanStatus,
                        user: {
                            id: reg.userId || fallbackUserId,
                            username: reg.username || fallbackUsername,
                            email: fallbackEmail
                        },
                        message: reg.banReason || 'Akun Anda sedang diblokir oleh administrator.'
                    });
                }
            }

            return res.json({ status: true, authenticated: false, banned: false, user: null });
        }

        // POST /api/user-auth?action=register
        if (action === 'register') {
            const username = String(body.username || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '').trim();

            if (!username) {
                return res.status(400).json({ status: false, message: 'Username wajib diisi' });
            }
            if (username.length < 3) {
                return res.status(400).json({ status: false, message: 'Username minimal 3 karakter' });
            }
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                return res.status(400).json({ status: false, message: 'Format email tidak valid' });
            }
            if (!password || password.length < 6) {
                return res.status(400).json({ status: false, message: 'Password minimal 6 karakter/huruf' });
            }

            if (db._isFallbackEmpty && typeof storage.fetchFromPostgres === 'function') {
                const retryDb = await storage.fetchFromPostgres('users.json');
                if (retryDb && Array.isArray(retryDb.users) && retryDb.users.length > 0) {
                    db.users = retryDb.users;
                    db.sessions = retryDb.sessions || {};
                    delete db._isFallbackEmpty;
                }
            }

            // Check if username or email already exists
            const existsUser = db.users.find(u => u && u.username && u.username.toLowerCase() === username.toLowerCase());
            if (existsUser) {
                return res.status(400).json({ status: false, message: 'Username sudah digunakan, silakan pilih yang lain' });
            }
            const existsEmail = db.users.find(u => u && ((u.rawEmail && u.rawEmail.toLowerCase() === email.toLowerCase()) || (u.email && u.email.toLowerCase() === email.toLowerCase())));
            if (existsEmail) {
                return res.status(400).json({ status: false, message: 'Email sudah terdaftar, silakan login' });
            }

            // Clear from deleted users registry if re-registering
            try {
                const deletedMap = await readDeletedUsersAsync();
                let modDel = false;
                if (deletedMap[username.toLowerCase()]) { delete deletedMap[username.toLowerCase()]; modDel = true; }
                if (deletedMap[email.toLowerCase()]) { delete deletedMap[email.toLowerCase()]; modDel = true; }
                if (modDel) await writeDeletedUsersAsync(deletedMap);
            } catch (e) {}

            const { hash, salt } = hashPassword(password);
            const nowIso = new Date().toISOString();
            const maskedClientIp = maskIp(clientIp);
            const isMasterReg = ((email || '').toLowerCase().trim() === 'jrnabil570@gmail.com');
            const newGeneratedId = isMasterReg ? '8589478687' : generate10DigitUserId(db.users);
            const newUser = {
                id: newGeneratedId,
                originalId: newGeneratedId,
                username: username,
                email: email,
                rawEmail: email,
                provider: 'manual',
                emailVerified: false,
                trustedDevices: [],
                passwordHash: hash,
                passwordSalt: salt,
                maskedPassword: '••••••••',
                avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(username)}`,
                role: isMasterReg ? 'admin' : 'member',
                isPremium: isMasterReg,
                vipTier: isMasterReg ? 'permanent' : 'none',
                vipExpiresAt: null,
                createdAt: nowIso,
                lastLoginAt: nowIso,
                lastIp: maskedClientIp,
                rawLastIp: clientIp,
                banType: 'none',
                banReason: '',
                banExpiresAt: null,
                loginLogs: [
                    {
                        ip: maskedClientIp,
                        rawIp: clientIp,
                        timestamp: nowIso,
                        userAgent: req.headers['user-agent'] || ''
                    }
                ],
                settings: (body.settings && typeof body.settings === 'object') ? body.settings : {}
            };

            db.users.forEach(u => {
                if (u && !u.referralCode) referralsApi.generateReferralCodeForUser(u, db.users);
            });
            referralsApi.generateReferralCodeForUser(newUser, db.users);

            // Process optional referralCode during registration
            const rawRefCode = String(body.referralCode || body.refCode || '').trim().toUpperCase();
            let referralBonusMsg = '';
            if (rawRefCode) {
                let refIndex = db.users.findIndex(u =>
                    u &&
                    (
                        String(u.referralCode || '').toUpperCase() === rawRefCode ||
                        (u.username && u.username.toLowerCase() === rawRefCode.toLowerCase()) ||
                        String(u.id) === rawRefCode
                    ) &&
                    !(referralsApi.resolveUserInviteLimitInfo && referralsApi.resolveUserInviteLimitInfo(u).isLimitReached)
                );
                if (refIndex === -1) {
                    refIndex = db.users.findIndex(u =>
                        u && (
                            String(u.referralCode || '').toUpperCase() === rawRefCode ||
                            (u.username && u.username.toLowerCase() === rawRefCode.toLowerCase()) ||
                            String(u.id) === rawRefCode
                        )
                    );
                }
                if (refIndex !== -1) {
                    const referrer = db.users[refIndex];
                    if (referrer.username.toLowerCase() !== newUser.username.toLowerCase()) {
                        try {
                            const refRes = await referralsApi.processReferralReward(referrer, newUser, db.users);
                            if (refRes && refRes.rewarded) {
                                newUser.referredBy = referrer.id;
                                newUser.referredByUsername = referrer.username;
                                newUser.referredByCode = referrer.referralCode;
                                newUser.referredAt = Date.now();
                                db.users[refIndex] = referrer;
                                referralBonusMsg = ` Bonus Referral dari @${referrer.username} aktif!`;
                            } else if (refRes && refRes.limitReached) {
                                referralBonusMsg = ` (${refRes.message})`;
                            }
                        } catch (refErr) {
                            console.error('[REGISTER REFERRAL ERROR]:', refErr.message);
                        }
                    }
                }
            }

            db.users.push(newUser);
            delete db._isFallbackEmpty;
            await writeDbAsync(db);

            return res.json({
                status: true,
                redirectToLogin: true,
                username: newUser.username,
                email: newUser.rawEmail || newUser.email,
                referralApplied: Boolean(newUser.referredBy),
                message: 'Akun @' + newUser.username + ' berhasil dibuat! Silakan masuk (Login) dengan akun Anda.' + referralBonusMsg
            });
        }

        // POST /api/user-auth?action=login
        if (action === 'login') {
            const username = String(body.username || '').trim();
            const email = String(body.email || '').trim().toLowerCase();
            const password = String(body.password || '').trim();
            const rememberMe = body.rememberMe !== false;

            if (!username && !email) {
                return res.status(400).json({ status: false, message: 'Username atau Email wajib diisi' });
            }
            if (!password || password.length < 6) {
                return res.status(400).json({ status: false, message: 'Password minimal 6 karakter/huruf' });
            }

            // If users database appears empty, retry fetching directly from PostgreSQL and local disk
            if (!db.users || db.users.length === 0) {
                if (typeof storage.fetchFromPostgres === 'function') {
                    try {
                        const retryPg = await storage.fetchFromPostgres('users.json');
                        if (retryPg && Array.isArray(retryPg.users) && retryPg.users.length > 0) {
                            db.users = retryPg.users;
                            db.sessions = retryPg.sessions || {};
                            delete db._isFallbackEmpty;
                        }
                    } catch(e) {}
                }
                if (!db.users || db.users.length === 0) {
                    try {
                        const fs = require('fs');
                        const p1 = path.join(__dirname, 'users.json');
                        const p2 = path.join(__dirname, '..', 'users.json');
                        const targetP = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
                        if (targetP) {
                            const diskParsed = JSON.parse(fs.readFileSync(targetP, 'utf8'));
                            if (diskParsed && Array.isArray(diskParsed.users)) {
                                db.users = diskParsed.users;
                                db.sessions = diskParsed.sessions || {};
                                delete db._isFallbackEmpty;
                            }
                        }
                    } catch(e) {}
                }
            }

            // Find user by username or email (flexible, case-insensitive, trimming)
            const cleanUsername = String(username || '').replace(/^@/, '').trim().toLowerCase();
            const cleanEmail = String(email || '').trim().toLowerCase();
            const cleanPw = String(password || '').trim();

            // 1. Try exact email match first
            let user = (db.users || []).find(u => {
                if (!u) return false;
                const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                const uMasked = String(u.email || '').trim().toLowerCase();
                return (cleanEmail && (uEmail === cleanEmail || uMasked === cleanEmail)) ||
                       (cleanUsername && cleanUsername.includes('@') && (uEmail === cleanUsername || uMasked === cleanUsername));
            });

            // 2. Try exact username match next
            if (!user && cleanUsername) {
                user = (db.users || []).find(u => {
                    if (!u) return false;
                    const uName = String(u.username || '').replace(/^@/, '').trim().toLowerCase();
                    return uName === cleanUsername;
                });
            }

            // 3. Try matching User ID or Custom ID or Referral Code
            if (!user && cleanUsername) {
                user = (db.users || []).find(u => {
                    if (!u) return false;
                    const uId = String(u.id || '').trim().toLowerCase();
                    const uOrigId = String(u.originalId || '').trim().toLowerCase();
                    const uCustomId = String(u.customId || '').trim().toLowerCase();
                    const uRef = String(u.referralCode || '').trim().toLowerCase();
                    return uId === cleanUsername || uOrigId === cleanUsername || uCustomId === cleanUsername || uRef === cleanUsername;
                });
            }

            // 4. Owner & Admin aliases: 'musifystar', 'musifystarofficial', 'musifystar official', 'nabil', 'admin'
            if (!user && (
                cleanUsername === 'musifystar' ||
                cleanUsername === 'musifystarofficial' ||
                cleanUsername === 'musifystar official' ||
                cleanUsername === 'admin' ||
                cleanUsername === 'nabil' ||
                cleanUsername === 'jrnabil' ||
                cleanUsername === 'owner'
            )) {
                user = (db.users || []).find(u => {
                    if (!u) return false;
                    const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                    return uEmail === 'jrnabil570@gmail.com';
                }) || (db.users || []).find(u => {
                    if (!u) return false;
                    const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                    return uEmail === 'musifystarofficial@gmail.com';
                }) || (db.users || []).find(u => {
                    if (!u) return false;
                    const uName = String(u.username || '').toLowerCase().trim();
                    return uName === 'musifystar' || uName === 'musifystarofficial';
                });
            }

            // 5. Self-heal Master Admin user if not yet in database
            if (!user && (
                cleanUsername === 'musifystar' ||
                cleanUsername === 'musifystarofficial' ||
                cleanUsername === 'musifystar official' ||
                cleanUsername === 'admin' ||
                cleanUsername === 'jrnabil570@gmail.com' ||
                cleanEmail === 'jrnabil570@gmail.com'
            )) {
                const { hash, salt } = hashPassword(password || 'MusifyStar7192');
                const nowIso = new Date().toISOString();
                user = {
                    id: '12345678910',
                    originalId: '8589478687',
                    customId: '12345678910',
                    username: 'MusifyStar',
                    email: 'jrnabil570@gmail.com',
                    rawEmail: 'jrnabil570@gmail.com',
                    provider: 'manual',
                    emailVerified: true,
                    trustedDevices: [],
                    passwordHash: hash,
                    passwordSalt: salt,
                    maskedPassword: '••••••••',
                    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=MusifyStar',
                    role: 'admin',
                    isPremium: true,
                    vipTier: 'permanent',
                    vipExpiresAt: null,
                    border: 'border_custom_1792838957300',
                    borderUrl: '/api/borders?action=image&id=border_custom_1792838957300&ext=png&s=116',
                    borderName: 'Immortal',
                    nameGlow: 'rainbow_prism',
                    referralCode: 'MUSIFYSTAR7192',
                    createdAt: nowIso,
                    lastLoginAt: nowIso,
                    lastIp: maskIp(clientIp),
                    rawLastIp: clientIp,
                    banType: 'none',
                    banReason: '',
                    banExpiresAt: null,
                    loginLogs: []
                };
                db.users.unshift(user);
                delete db._isFallbackEmpty;
                await writeDbAsync(db);
            }

            if (!user) {
                return res.status(401).json({ status: false, message: 'Akun tidak ditemukan. Silakan periksa kembali username/email atau daftar baru.' });
            }

            let isMatch = verifyPassword(password, user.passwordHash, user.passwordSalt);
            if (!isMatch && cleanPw !== password) {
                isMatch = verifyPassword(cleanPw, user.passwordHash, user.passwordSalt);
            }

            const isMasterUser = ((user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com') ||
                                 ((user.username || '').toLowerCase().trim() === 'musifystar');

            // Master admin password verification & fallback protection
            if (!isMatch && isMasterUser) {
                const envAdminPass = (process.env.ADMIN_PASSWORD || '').trim();
                if (
                    cleanPw === 'nabilmusikdevv' ||
                    cleanPw === 'nabilmusikdev' ||
                    (envAdminPass && (password === envAdminPass || cleanPw === envAdminPass))
                ) {
                    isMatch = true;
                    if (cleanPw === 'nabilmusikdevv') {
                        const newHashObj = hashPassword('nabilmusikdevv');
                        user.passwordHash = newHashObj.hash;
                        user.passwordSalt = newHashObj.salt;
                        await writeDbAsync(db);
                    }
                }
            }

            if (!isMatch) {
                return res.status(401).json({ status: false, message: 'Password salah. Silakan coba lagi atau gunakan fitur Lupa Password.' });
            }

            // Check if user is BANNED
            const banStatus = getUserBanStatus(user, banRegistry);
            if (banStatus.isBanned) {
                return res.json({
                    status: false,
                    banned: true,
                    ban: banStatus,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.rawEmail || user.email,
                        rawEmail: user.rawEmail || user.email
                    },
                    message: banStatus.banReason || 'Akun Anda sedang diblokir oleh administrator.'
                });
            }

            // OPSI A: Real-Time Email OTP Verification on Login (First Login / Untrusted Device)
            const smtpCfgLogin = await readSmtpConfigAsync();
            const deviceId = String(body.deviceId || '').trim();
            const targetLoginEmail = String(user.rawEmail || user.email || '').trim().toLowerCase();
            const trustedDevices = Array.isArray(user.trustedDevices) ? user.trustedDevices : [];
            const isDeviceTrusted = Boolean(user.emailVerified && deviceId && trustedDevices.includes(deviceId));

            if (smtpCfgLogin.enabled && smtpCfgLogin.appPassword && smtpCfgLogin.requireOtpOnRegister !== false && !isDeviceTrusted && targetLoginEmail && targetLoginEmail.includes('@') && !targetLoginEmail.includes('***')) {
                const inputOtp = String(body.otpCode || '').trim();
                const otpStore = await readOtpStoreAsync();
                const otpKey = `login_${targetLoginEmail}`;

                if (!inputOtp) {
                    const now = Date.now();
                    if (!otpStore[otpKey] || !otpStore[otpKey].lastSentAt || (now - otpStore[otpKey].lastSentAt) >= 5000 || Date.now() > otpStore[otpKey].expiresAt) {
                        const newOtp = generate6DigitOtp();
                        try {
                            await sendEmailOtp(targetLoginEmail, newOtp, 'login', user.username);
                            const expAt = Date.now() + 60 * 1000;
                            otpStore[otpKey] = {
                                code: newOtp,
                                email: targetLoginEmail,
                                username: user.username,
                                purpose: 'login',
                                lastSentAt: Date.now(),
                                expiresAt: expAt,
                                attempts: 0
                            };
                            await writeOtpStoreAsync(otpStore);
                        } catch (err) {
                            return res.status(500).json({
                                status: false,
                                message: 'Gagal mengirim kode OTP ke email Anda: ' + (err.message || 'Periksa alamat email Anda')
                            });
                        }
                    }
                    const currentExp = (otpStore[otpKey] && otpStore[otpKey].expiresAt) ? otpStore[otpKey].expiresAt : (Date.now() + 60 * 1000);
                    return res.json({
                        status: true,
                        otpSent: true,
                        otpRequired: true,
                        expiresAt: currentExp,
                        ttlSeconds: 60,
                        email: targetLoginEmail,
                        maskedEmail: maskEmail(targetLoginEmail),
                        message: `Kode OTP 6 digit telah dikirim ke email ${targetLoginEmail}!`
                    });
                }

                const record = otpStore[otpKey];
                if (!record || !record.code || Date.now() > record.expiresAt) {
                    return res.status(400).json({
                        status: false,
                        otpRequired: true,
                        otpExpired: true,
                        email: targetLoginEmail,
                        maskedEmail: maskEmail(targetLoginEmail),
                        message: 'Kode sudah kadaluarsa, silahkan coba lagi!'
                    });
                }
                if (record.code !== inputOtp) {
                    record.attempts = (record.attempts || 0) + 1;
                    if (record.attempts >= 5) {
                        delete otpStore[otpKey];
                    }
                    await writeOtpStoreAsync(otpStore);
                    return res.status(400).json({
                        status: false,
                        otpRequired: true,
                        email: targetLoginEmail,
                        maskedEmail: maskEmail(targetLoginEmail),
                        message: 'Kode OTP salah! Silakan periksa kembali 6 angka di kotak masuk email Anda.'
                    });
                }

                // OTP verified! Mark emailVerified = true and save deviceId as trusted device
                delete otpStore[otpKey];
                await writeOtpStoreAsync(otpStore);
                user.emailVerified = true;
                if (deviceId) {
                    const updatedTrusted = [deviceId, ...trustedDevices.filter(d => d !== deviceId)].slice(0, 20);
                    user.trustedDevices = updatedTrusted;
                }
            }

            // Record Login Log & IP
            const nowIso = new Date().toISOString();
            const maskedClientIp = maskIp(clientIp);
            user.lastLoginAt = nowIso;
            user.lastIp = maskedClientIp;
            user.rawLastIp = clientIp;
            user.maskedPassword = '••••••••';
            user.loginLogs = user.loginLogs || [];
            user.loginLogs.unshift({
                ip: maskedClientIp,
                rawIp: clientIp,
                timestamp: nowIso,
                userAgent: req.headers['user-agent'] || ''
            });
            if (user.loginLogs.length > 20) {
                user.loginLogs = user.loginLogs.slice(0, 20);
            }

            const token = createSignedUserToken(user.id, user.username);
            db.sessions = db.sessions || {};
            db.sessions[token] = {
                userId: user.id,
                createdAt: Date.now(),
                rememberMe: rememberMe
            };

            await writeDbAsync(db);

            const isMasterAdmin = ((user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com');
            if (isMasterAdmin) {
                Security.addImmuneIp(clientIp);
            }

            if (user.isVipTrial && user.vipExpiresAt && Date.now() > user.vipExpiresAt) {
                await checkAndProcessExpiredVipTrial(user, db, false);
            }

            if (user.isVipTrial) {
                try {
                    const paymentConfigApi = require('./payment-config.js');
                    if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                        const payCfg = await paymentConfigApi.getPaymentConfig();
                        if (payCfg && payCfg.vipTrialConfig) {
                            user.trialAllowedFeatures = Object.assign({}, payCfg.vipTrialConfig.allowedFeatures || {});
                            user.trialBorderAccess = payCfg.vipTrialConfig.borderAccess || user.trialBorderAccess || 'platinum';
                        }
                    }
                } catch (e) {}
            }

            const vipInfo = resolveUserVipStatus(user);
            const vipSig = Security.generateVipSignature(user.id, isMasterAdmin ? 'permanent' : vipInfo.vipTier, isMasterAdmin ? null : vipInfo.vipExpiresAt);

            return res.json({
                status: true,
                message: 'Login berhasil!',
                token: token,
                ban: banStatus,
                user: {
                    id: user.id,
                    originalId: user.originalId || user.id,
                    customId: user.customId || null,
                    customIdExpiresAt: user.customIdExpiresAt || null,
                    isCustomIdTrial: Boolean(user.isCustomIdTrial),
                    username: user.username,
                    email: user.rawEmail || user.email,
                    rawEmail: user.rawEmail || user.email,
                    avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`,
                    border: user.border || '',
                    borderUrl: user.borderUrl || '',
                    borderName: user.borderName || '',
                    equippedBadge: user.equippedBadge || '',
                    equippedBadgeTitle: user.equippedBadgeTitle || '',
                    equippedBadgeIcon: user.equippedBadgeIcon || '',
                    equippedBadgeColor: user.equippedBadgeColor || '',
                    nameGlow: ((!isMasterAdmin && !vipInfo.isPremium) || (user.isVipTrial && user.trialAllowedFeatures && user.trialAllowedFeatures.nameGlow === false)) ? '' : (user.nameGlow || ''),
                    isPremium: isMasterAdmin || vipInfo.isPremium,
                    vipTier: isMasterAdmin ? 'permanent' : vipInfo.vipTier,
                    vipExpiresAt: isMasterAdmin ? null : vipInfo.vipExpiresAt,
                    vipSource: user.vipSource || 'standard',
                    isVipTrial: Boolean(user.isVipTrial && vipInfo.isPremium),
                    hasClaimedVipTrial: Boolean(user.hasClaimedVipTrial),
                    trialClaimedAt: user.trialClaimedAt || null,
                    trialExpiredAt: user.trialExpiredAt || null,
                    trialDurationDays: user.trialDurationDays || null,
                    trialBorderAccess: user.trialBorderAccess || 'platinum',
                    trialAllowedFeatures: user.trialAllowedFeatures || null,
                    hasUnpaidTrialInvoice: Boolean(user.hasUnpaidTrialInvoice),
                    pendingTrialInvoice: user.pendingTrialInvoice || null,
                    referralBorderRestricted: Boolean(user.referralBorderRestricted),
                    referralAllowedBorders: Array.isArray(user.referralAllowedBorders) ? user.referralAllowedBorders : [],
                    referralCode: referralsApi.generateReferralCodeForUser(user, db.users),
                    referralCount: Number(user.referralCount) || 0,
                    referralPoints: Number(user.referralPoints) || 0,
                    referredBy: user.referredBy || null,
                    referredByUsername: user.referredByUsername || '',
                    supportCount: Number(user.supportCount) || 0,
                    donatur: referralsApi.resolveUserDonaturInfo(user),
                    vipSignature: vipSig,
                    role: isMasterAdmin ? 'admin' : 'member',
                    settings: user.settings || {},
                    createdAt: user.createdAt
                }
            });
        }

        // POST /api/user-auth?action=google_login
        if (action === 'google_login') {
            const email = String(body.email || '').trim().toLowerCase();
            const name = String(body.name || '').trim();
            const photoUrl = String(body.photoUrl || '').trim();
            const googleId = String(body.googleId || '').trim();

            if (!email || !email.includes('@')) {
                return res.status(400).json({ status: false, message: 'Email akun Google tidak valid' });
            }

            if (db._isFallbackEmpty && typeof storage.fetchFromPostgres === 'function') {
                const retryDb = await storage.fetchFromPostgres('users.json');
                if (retryDb && Array.isArray(retryDb.users) && retryDb.users.length > 0) {
                    db.users = retryDb.users;
                    db.sessions = retryDb.sessions || {};
                    delete db._isFallbackEmpty;
                }
            }

            const isMasterAdmin = (email === 'jrnabil570@gmail.com');

            // Find existing user by email or master admin ID/username
            let user = db.users.find(u => {
                if (!u) return false;
                if (u.rawEmail && u.rawEmail.toLowerCase().trim() === email) return true;
                if (u.email && u.email.toLowerCase().trim() === email) return true;
                if (u.email && u.email.toLowerCase().trim() === maskEmail(email).toLowerCase()) return true;
                if (isMasterAdmin && (u.originalId === '8589478687' || u.id === '8589478687' || u.id === '12345678910' || (u.username && u.username.toLowerCase() === 'musifystar'))) return true;
                return false;
            });

            if (!user && db._isFallbackEmpty) {
                return res.status(503).json({
                    status: false,
                    message: 'Server sedang menyinkronkan database. Silakan klik Lanjutkan dengan Google sekali lagi.'
                });
            }

            const nowIso = new Date().toISOString();
            const maskedClientIp = maskIp(clientIp);

            if (user) {
                // User already exists, preserve their custom username, avatar, border, badges & customId!
                if (!user.rawEmail) user.rawEmail = email;
                if (photoUrl && (!user.avatar || user.avatar.includes('dicebear'))) {
                    user.avatar = photoUrl;
                }
                if (googleId && !user.googleId) {
                    user.googleId = googleId;
                }
                if (user.provider !== 'google') {
                    user.googleLinked = true;
                }
            } else {
                // Generate a clean username from Google name or email
                let baseUsername = (name || email.split('@')[0])
                    .replace(/[^a-zA-Z0-9_]/g, '')
                    .trim()
                    .slice(0, 20);
                if (baseUsername.length < 3) baseUsername = 'user_' + Math.floor(1000 + Math.random() * 9000);

                let uniqueUsername = baseUsername;
                let counter = 1;
                while (db.users.some(u => u && u.username && u.username.toLowerCase() === uniqueUsername.toLowerCase())) {
                    uniqueUsername = `${baseUsername.slice(0, 15)}_${counter++}`;
                }

                // If email is jrnabil570@gmail.com, ensure proper role/username
                const finalUsername = isMasterAdmin ? 'MusifyStar' : uniqueUsername;
                const userId = isMasterAdmin ? '8589478687' : generate10DigitUserId(db.users);

                user = {
                    id: userId,
                    originalId: userId,
                    username: finalUsername,
                    email: isMasterAdmin ? 'jrnabil570@gmail.com' : maskEmail(email),
                    rawEmail: email,
                    avatar: photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(finalUsername)}`,
                    provider: 'google',
                    googleId: googleId || undefined,
                    role: isMasterAdmin ? 'admin' : 'member',
                    createdAt: nowIso
                };

                db.users.push(user);
            }

            // Check if user is BANNED
            const banStatus = getUserBanStatus(user, banRegistry);
            if (banStatus.isBanned) {
                return res.json({
                    status: false,
                    banned: true,
                    ban: banStatus,
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.rawEmail || user.email,
                        rawEmail: user.rawEmail || user.email
                    },
                    message: banStatus.banReason || 'Akun Anda sedang diblokir oleh administrator.'
                });
            }

            // Record Login Log & IP
            user.lastLoginAt = nowIso;
            user.lastIp = maskedClientIp;
            user.rawLastIp = clientIp;
            user.loginLogs = user.loginLogs || [];
            user.loginLogs.unshift({
                ip: maskedClientIp,
                rawIp: clientIp,
                timestamp: nowIso,
                provider: 'google',
                userAgent: req.headers['user-agent'] || ''
            });
            if (user.loginLogs.length > 20) {
                user.loginLogs = user.loginLogs.slice(0, 20);
            }

            const token = createSignedUserToken(user.id, user.username);
            db.sessions = db.sessions || {};
            db.sessions[token] = {
                userId: user.id,
                createdAt: Date.now(),
                rememberMe: true,
                provider: 'google'
            };

            await writeDbAsync(db);

            const isGoogleMasterAdmin = ((user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com');
            if (isGoogleMasterAdmin) {
                Security.addImmuneIp(clientIp);
            }

            if (user.isVipTrial && user.vipExpiresAt && Date.now() > user.vipExpiresAt) {
                await checkAndProcessExpiredVipTrial(user, db, false);
            }

            if (user.isVipTrial) {
                try {
                    const paymentConfigApi = require('./payment-config.js');
                    if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                        const payCfg = await paymentConfigApi.getPaymentConfig();
                        if (payCfg && payCfg.vipTrialConfig) {
                            user.trialAllowedFeatures = Object.assign({}, payCfg.vipTrialConfig.allowedFeatures || {});
                            user.trialBorderAccess = payCfg.vipTrialConfig.borderAccess || user.trialBorderAccess || 'platinum';
                        }
                    }
                } catch (e) {}
            }

            const vipInfo = resolveUserVipStatus(user);
            const vipSig = Security.generateVipSignature(user.id, isGoogleMasterAdmin ? 'permanent' : vipInfo.vipTier, isGoogleMasterAdmin ? null : vipInfo.vipExpiresAt);

            return res.json({
                status: true,
                message: 'Login Google berhasil!',
                token: token,
                ban: banStatus,
                user: {
                    id: user.id,
                    originalId: user.originalId || user.id,
                    customId: user.customId || null,
                    customIdExpiresAt: user.customIdExpiresAt || null,
                    isCustomIdTrial: Boolean(user.isCustomIdTrial),
                    username: user.username,
                    email: user.rawEmail || user.email,
                    rawEmail: user.rawEmail || user.email,
                    avatar: user.avatar,
                    border: user.border || '',
                    borderUrl: user.borderUrl || '',
                    borderName: user.borderName || '',
                    equippedBadge: user.equippedBadge || '',
                    equippedBadgeTitle: user.equippedBadgeTitle || '',
                    equippedBadgeIcon: user.equippedBadgeIcon || '',
                    equippedBadgeColor: user.equippedBadgeColor || '',
                    nameGlow: user.equippedNameGlow || user.nameGlow || '',
                    isPremium: isGoogleMasterAdmin || vipInfo.isPremium,
                    vipTier: isGoogleMasterAdmin ? 'permanent' : vipInfo.vipTier,
                    vipExpiresAt: isGoogleMasterAdmin ? null : vipInfo.vipExpiresAt,
                    vipSource: user.vipSource || 'standard',
                    isVipTrial: Boolean(user.isVipTrial && vipInfo.isPremium),
                    hasClaimedVipTrial: Boolean(user.hasClaimedVipTrial),
                    trialClaimedAt: user.trialClaimedAt || null,
                    trialExpiredAt: user.trialExpiredAt || null,
                    trialDurationDays: user.trialDurationDays || null,
                    trialBorderAccess: user.trialBorderAccess || 'platinum',
                    trialAllowedFeatures: user.trialAllowedFeatures || null,
                    hasUnpaidTrialInvoice: Boolean(user.hasUnpaidTrialInvoice),
                    pendingTrialInvoice: user.pendingTrialInvoice || null,
                    referralBorderRestricted: Boolean(user.referralBorderRestricted),
                    referralAllowedBorders: Array.isArray(user.referralAllowedBorders) ? user.referralAllowedBorders : [],
                    referralCode: referralsApi.generateReferralCodeForUser(user, db.users),
                    referralCount: Number(user.referralCount) || 0,
                    referralPoints: Number(user.referralPoints) || 0,
                    referredBy: user.referredBy || null,
                    referredByUsername: user.referredByUsername || '',
                    supportCount: Number(user.supportCount) || 0,
                    donatur: referralsApi.resolveUserDonaturInfo(user),
                    vipSignature: vipSig,
                    role: isGoogleMasterAdmin ? 'admin' : 'member',
                    settings: user.settings || {},
                    createdAt: user.createdAt
                }
            });
        }

        // POST /api/user-auth?action=update_profile
        if (action === 'update_profile') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            const targetUserId = getUserIdFromToken(token, db);
            if (!targetUserId) {
                return res.status(401).json({ status: false, message: 'Sesi login tidak valid atau sudah berakhir' });
            }
            const userIndex = db.users.findIndex(u => u && (
        u.id === targetUserId ||
        u.originalId === targetUserId ||
        u.customId === targetUserId ||
        (u.customId && String(u.customId).toLowerCase() === String(targetUserId).toLowerCase())
      ));
            if (userIndex === -1) {
                return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
            }

            const user = db.users[userIndex];
            const isMasterAdmin = (user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com';
            let vipInfo = resolveUserVipStatus(user);
            let isUserVip = vipInfo.isPremium;

            // Update username if provided
            if (body.username !== undefined) {
                const newUsername = String(body.username).trim();
                if (!newUsername || newUsername.length < 3) {
                    return res.status(400).json({ status: false, message: 'Username minimal 3 karakter' });
                }
                const exists = db.users.find(u => u.id !== user.id && u.username.toLowerCase() === newUsername.toLowerCase());
                if (exists) {
                    return res.status(400).json({ status: false, message: 'Username sudah digunakan orang lain' });
                }
                user.username = newUsername;
            }

            // Update email if provided
            if (body.email !== undefined) {
                const newEmail = String(body.email).trim().toLowerCase();
                if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
                    return res.status(400).json({ status: false, message: 'Format email tidak valid' });
                }
                const exists = db.users.find(u => u.id !== user.id && ((u.rawEmail && u.rawEmail.toLowerCase() === newEmail.toLowerCase()) || (u.email && u.email.toLowerCase() === newEmail.toLowerCase())));
                if (exists) {
                    return res.status(400).json({ status: false, message: 'Email sudah digunakan akun lain' });
                }
                user.email = newEmail;
                user.rawEmail = newEmail;
            }

            // Update avatar if provided
            if (body.avatar !== undefined) {
                user.avatar = body.avatar;
            }

            // Update border if provided
            if (body.border !== undefined) {
                const borderId = String(body.border || '').trim();
                let borderMap = {
                    'border_platinum': { name: 'Platinum', url: '/borders/Platinum.png', reqTier: '1month' },
                    'border_master': { name: 'Master', url: '/borders/Master.png', reqTier: '1month' },
                    'border_legend': { name: 'Legend', url: '/borders/Legend.png', reqTier: '2months' },
                    'border_immortal': { name: 'Immortal', url: '/borders/Imortal.png', reqTier: '5months' }
                };

                try {
                    const customBorders = await storage.readDataAsync('custom_borders.json', []);
                    if (Array.isArray(customBorders)) {
                        customBorders.forEach(cb => {
                            if (cb && cb.id) {
                                borderMap[cb.id] = {
                                    name: cb.name,
                                    url: cb.url || `/api/borders?action=image&id=${cb.id}&ext=png`,
                                    reqTier: cb.requiredTier || '1month',
                                    badge: cb.badge || cb.tier || 'VIP'
                                };
                            }
                        });
                    }
                } catch(e) {}

                if (!borderMap[borderId] && borderId && borderId !== 'none' && (borderId.startsWith('border_custom_') || body.borderUrl)) {
                    borderMap[borderId] = {
                        name: String(body.borderName || 'VIP Border').trim(),
                        url: String(body.borderUrl || `/api/borders?action=image&id=${borderId}&ext=png`).trim(),
                        reqTier: String(body.requiredTier || '1month').trim(),
                        badge: String(body.badge || 'VIP').trim()
                    };
                }

                if (borderId === 'none' || borderId === '') {
                    user.border = '';
                    user.borderUrl = '';
                    user.borderName = '';
                } else if (borderMap[borderId]) {
                    if (!isUserVip && !isMasterAdmin) {
                        return res.status(403).json({ status: false, message: 'Border profil khusus pengguna VIP!' });
                    }
                    // Jika akun sedang dalam mode Percobaan VIP (isVipTrial), terapkan batasan akses border Trial dari Admin
                    if (user.isVipTrial) {
                        const trialAccess = String(user.trialBorderAccess || 'platinum').toLowerCase();
                        const bNameLow = String(borderMap[borderId].name || '').toLowerCase();
                        const isPlat = borderId === 'border_platinum' || bNameLow.includes('platinum');
                        const isMast = borderId === 'border_master' || bNameLow.includes('master');
                        const isLeg = borderId === 'border_legend' || bNameLow.includes('legend');
                        let trialAllowed = false;
                        if (trialAccess === 'all') trialAllowed = true;
                        else if (trialAccess === 'platinum') trialAllowed = isPlat;
                        else if (trialAccess === 'platinum_master') trialAllowed = isPlat || isMast;
                        else if (trialAccess === 'platinum_master_legend') trialAllowed = isPlat || isMast || isLeg;
                        if (!trialAllowed) {
                            return res.status(403).json({
                                status: false,
                                message: `Border ${borderMap[borderId].name} dikunci untuk paket Percobaan VIP (Free Trial) sesuai pengaturan Admin! Upgrade ke VIP penuh untuk membuka semua border.`
                            });
                        }
                    } else if (!isMasterAdmin) {
                        if (user.vipSource === 'referral' && user.referralBorderRestricted) {
                            const refAllowed = referralsApi.canReferralVipEquipBorder(user, {
                                id: borderId,
                                name: borderMap[borderId].name,
                                isVip: true
                            });
                            if (!refAllowed) {
                                return res.status(403).json({
                                    status: false,
                                    message: `Border ${borderMap[borderId].name} dikunci oleh Admin untuk paket VIP Referral! Upgrade paket VIP reguler untuk membuka semua border.`
                                });
                            }
                        } else {
                            const tierRankMap = { 'none': 0, '1month': 1, '2months': 2, '5months': 3, 'permanent': 4, 'lifetime': 4, 'sultan': 4 };
                            const uRank = tierRankMap[String(user.vipTier || 'permanent').toLowerCase()] !== undefined ? tierRankMap[String(user.vipTier || 'permanent').toLowerCase()] : 4;
                            const reqRank = tierRankMap[String(borderMap[borderId].reqTier || '1month').toLowerCase()] !== undefined ? tierRankMap[String(borderMap[borderId].reqTier || '1month').toLowerCase()] : 1;
                            if (uRank < reqRank) {
                                return res.status(403).json({
                                    status: false,
                                    message: `Border ${borderMap[borderId].name} memerlukan Paket VIP lebih tinggi (${borderMap[borderId].badge || borderMap[borderId].reqTier})!`
                                });
                            }
                        }
                    }
                    user.border = borderId;
                    user.borderUrl = borderMap[borderId].url;
                    user.borderName = borderMap[borderId].name;
                }
            }

            // Update equipped custom rank badge if provided
            if (body.equippedBadge !== undefined) {
                const reqBadge = String(body.equippedBadge || '').trim();
                if (reqBadge === 'badge_vip_sultan' && user.isVipTrial) {
                    const tf = user.trialAllowedFeatures || {};
                    if (tf.vipSultanBadge === false) {
                        return res.status(403).json({
                            status: false,
                            message: 'Lencana VIP Sultan Member dikunci oleh Admin selama masa Percobaan VIP (Trial)! Upgrade ke VIP Penuh untuk membuka lencana ini.'
                        });
                    }
                }
                user.equippedBadge = reqBadge;
                user.equippedBadgeTitle = String(body.equippedBadgeTitle || '').trim();
                user.equippedBadgeIcon = String(body.equippedBadgeIcon || '').trim();
                user.equippedBadgeColor = String(body.equippedBadgeColor || '').trim();
            }

            // Update VIP Name Glow effect if provided (wajib VIP aktif & patuhi centang Trial Admin tanpa bypass Donatur)
            if (body.nameGlow !== undefined) {
                const rawGlow = String(body.nameGlow || '').trim().toLowerCase();
                const validGlows = ['', 'none', 'liquid_glass', 'cyber_neon', 'royal_gold', 'crimson_flame', 'emerald_aurora', 'galaxy_amethyst', 'rainbow_prism', 'ice_diamond'];
                if (rawGlow === '' || rawGlow === 'none') {
                    user.nameGlow = '';
                } else if (validGlows.includes(rawGlow)) {
                    if (user.isVipTrial) {
                        let globalNameGlowAllowed = true;
                        try {
                            const paymentConfigApi = require('./payment-config.js');
                            if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                                const payCfg = await paymentConfigApi.getPaymentConfig();
                                if (payCfg && payCfg.vipTrialConfig && payCfg.vipTrialConfig.allowedFeatures && payCfg.vipTrialConfig.allowedFeatures.nameGlow === false) {
                                    globalNameGlowAllowed = false;
                                }
                            }
                        } catch (e) {}
                        const tf = user.trialAllowedFeatures || {};
                        if (tf.nameGlow === false || !globalNameGlowAllowed) {
                            user.nameGlow = '';
                            return res.status(403).json({
                                status: false,
                                message: 'Fitur Efek Nama Berwarna dikunci oleh Admin pada masa Percobaan VIP (Trial)! Upgrade ke VIP Penuh untuk menggunakan efek nama ini.'
                            });
                        }
                    }
                    if (!isUserVip && !isMasterAdmin) {
                        user.nameGlow = '';
                        return res.status(403).json({
                            status: false,
                            message: 'Efek Nama Berwarna / Gradien Animasi khusus untuk Member VIP MusifyStar!'
                        });
                    }
                    user.nameGlow = rawGlow;
                }
            }

            // Update app settings if provided (e.g. homeTheme, navTheme, etc.)
            if (body.settings !== undefined && typeof body.settings === 'object') {
                user.settings = Object.assign({}, user.settings || {}, body.settings);
            }

            db.users[userIndex] = user;
            await writeDbAsync(db);

            isUserVip = !!user.isPremium || !!user.is_premium || isMasterAdmin;

            return res.json({
                status: true,
                message: 'Profil berhasil diperbarui!',
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.rawEmail || user.email,
                    avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.username)}`,
                    border: user.border || '',
                    borderUrl: user.borderUrl || '',
                    borderName: user.borderName || '',
                    equippedBadge: user.equippedBadge || '',
                    equippedBadgeTitle: user.equippedBadgeTitle || '',
                    equippedBadgeIcon: user.equippedBadgeIcon || '',
                    equippedBadgeColor: user.equippedBadgeColor || '',
                    nameGlow: user.nameGlow || '',
                    isPremium: vipInfo.isPremium,
                    vipTier: vipInfo.vipTier,
                    vipExpiresAt: vipInfo.vipExpiresAt,
                    vipSource: user.vipSource || 'standard',
                    isVipTrial: Boolean(user.isVipTrial && vipInfo.isPremium),
                    hasClaimedVipTrial: Boolean(user.hasClaimedVipTrial),
                    trialClaimedAt: user.trialClaimedAt || null,
                    trialExpiredAt: user.trialExpiredAt || null,
                    trialDurationDays: user.trialDurationDays || null,
                    trialBorderAccess: user.trialBorderAccess || 'platinum',
                    trialAllowedFeatures: user.trialAllowedFeatures || null,
                    hasUnpaidTrialInvoice: Boolean(user.hasUnpaidTrialInvoice),
                    pendingTrialInvoice: user.pendingTrialInvoice || null,
                    referralBorderRestricted: Boolean(user.referralBorderRestricted),
                    referralAllowedBorders: Array.isArray(user.referralAllowedBorders) ? user.referralAllowedBorders : [],
                    referralCode: referralsApi.generateReferralCodeForUser(user, db.users),
                    referralCount: Number(user.referralCount) || 0,
                    referralPoints: Number(user.referralPoints) || 0,
                    supportCount: Number(user.supportCount) || 0,
                    donatur: referralsApi.resolveUserDonaturInfo(user),
                    role: isMasterAdmin ? 'admin' : 'member',
                    settings: user.settings || {},
                    createdAt: user.createdAt
                }
            });
        }

        // POST /api/user-auth?action=update_password
        if (action === 'update_password') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            const targetUserId = getUserIdFromToken(token, db);
            if (!targetUserId) {
                return res.status(401).json({ status: false, message: 'Sesi login tidak valid' });
            }
            const user = db.users.find(u => u && (String(u.id) === String(targetUserId) || String(u.originalId) === String(targetUserId)));
            if (!user) {
                return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
            }

            const oldPassword = String(body.oldPassword || '').trim();
            const newPassword = String(body.newPassword || '').trim();

            if (oldPassword) {
                const isMatch = verifyPassword(oldPassword, user.passwordHash, user.passwordSalt);
                if (!isMatch) {
                    return res.status(400).json({ status: false, message: 'Password saat ini salah' });
                }
            }

            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ status: false, message: 'Password baru minimal 6 karakter/huruf' });
            }

            const { hash, salt } = hashPassword(newPassword);
            user.passwordHash = hash;
            user.passwordSalt = salt;
            user.maskedPassword = maskPassword(newPassword);
            user.updatedAt = new Date().toISOString();
            await writeDbAsync(db);

            return res.json({
                status: true,
                message: 'Password berhasil diubah!'
            });
        }

        if (action === 'forgot_password' || action === 'reset_password') {
            const rawIdentifier = String(body.email || body.username || '').replace(/^@/, '').trim().toLowerCase();
            const newPassword = String(body.newPassword || '').trim();

            if (!rawIdentifier) {
                return res.status(400).json({ status: false, message: 'Masukkan Email atau Username Anda' });
            }

            if (!newPassword || newPassword.length < 6) {
                return res.status(400).json({ status: false, message: 'Password baru minimal 6 karakter/huruf' });
            }

            // 1. Cari kecocokan persis berdasarkan Username atau Email terlebih dahulu (agar antar akun seperti MusifyStar & abil tidak pernah saling menimpa password)
            let user = (db.users || []).find(u => {
                if (!u) return false;
                const uName = String(u.username || '').trim().toLowerCase();
                const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                const uMasked = String(u.email || '').trim().toLowerCase();
                return uName === rawIdentifier || uEmail === rawIdentifier || uMasked === rawIdentifier;
            });

            // 2. Fallback khusus jika mengetik "musifystar official" untuk akun utama
            if (!user && (rawIdentifier === 'musifystar' || rawIdentifier === 'musifystar official')) {
                user = (db.users || []).find(u => {
                    if (!u) return false;
                    const uEmail = String(u.rawEmail || u.email || '').trim().toLowerCase();
                    return uEmail === 'jrnabil570@gmail.com';
                });
            }

            if (!user) {
                return res.status(404).json({ status: false, message: 'Akun dengan email/username tersebut tidak ditemukan' });
            }

            const { hash, salt } = hashPassword(newPassword);
            user.passwordHash = hash;
            user.passwordSalt = salt;
            user.maskedPassword = maskPassword(newPassword);
            user.updatedAt = new Date().toISOString();

            await writeDbAsync(db);

            return res.json({
                status: true,
                message: 'Password untuk akun @' + user.username + ' berhasil diperbarui! Silakan masuk dengan password baru Anda.'
            });
        }

        // POST /api/user-auth?action=delete_account
        if (action === 'delete_account') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            const targetUserId = getUserIdFromToken(token, db);
            if (!targetUserId) {
                return res.status(401).json({ status: false, message: 'Sesi login tidak valid atau sudah kedaluwarsa' });
            }
            const userIndex = db.users.findIndex(u => u.id === targetUserId);
            if (userIndex === -1) {
                return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
            }

            const deletedUser = db.users[userIndex];
            const delIds = [targetUserId, deletedUser.id, deletedUser.originalId, deletedUser.username, deletedUser.email, deletedUser.rawEmail].filter(Boolean);
            db.users.splice(userIndex, 1);

            // Invalidate all sessions of this user
            db.sessions = db.sessions || {};
            Object.keys(db.sessions).forEach(tok => {
                if (db.sessions[tok] && (db.sessions[tok].userId === targetUserId || db.sessions[tok].userId?.id === targetUserId)) {
                    delete db.sessions[tok];
                }
            });

            try {
                const deletedMap = await readDeletedUsersAsync();
                delIds.forEach(k => {
                    const cleanK = String(k || '').toLowerCase().trim();
                    if (cleanK) deletedMap[cleanK] = Date.now();
                });
                await writeDeletedUsersAsync(deletedMap);
            } catch (e) {}

            // Clean registry
            delete banRegistry[targetUserId];
            if (deletedUser.username) delete banRegistry[deletedUser.username.toLowerCase()];
            if (deletedUser.rawEmail) delete banRegistry[deletedUser.rawEmail.toLowerCase()];
            db._deletedUserIds = delIds;
            await writeBanRegistryAsync(banRegistry);
            await writeDbAsync(db);

            return res.json({ status: true, message: 'Akun Anda berhasil dihapus secara permanen.' });
        }

        // POST /api/user-auth?action=logout
        if (action === 'logout') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            db.sessions = db.sessions || {};
            if (token && db.sessions[token]) {
                delete db.sessions[token];
                db._deletedTokens = [token];
                await writeDbAsync(db);
            }
            return res.json({ status: true, message: 'Logout berhasil' });
        }

        // GET/POST /api/user-auth?action=get_custom_ids
        if (action === 'get_custom_ids') {
            let customIds = await storage.readDataAsync('custom_ids.json', []);
            if (!Array.isArray(customIds)) customIds = [];

            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.query.token;
            let targetUserId = getUserIdFromToken(token, db);
            const verified = verifyUserToken(token);
            let user = targetUserId ? db.users.find(u => u.id === targetUserId || u.originalId === targetUserId) : null;

            if (!user && verified) {
                user = db.users.find(u => 
                    (u.id && u.id === verified.uid) || 
                    (u.originalId && u.originalId === verified.uid) || 
                    (verified.u && (u.username || '').toLowerCase() === verified.u.toLowerCase())
                );
            }

            if (!user) {
                const fallbackU = String(req.query.username || req.headers['x-user-name'] || '').replace(/^@/, '').trim().toLowerCase();
                const fallbackId = String(req.query.userId || req.headers['x-user-id'] || '').trim();
                if (fallbackU || fallbackId) {
                    user = db.users.find(u => 
                        (fallbackId && (u.id === fallbackId || u.originalId === fallbackId)) ||
                        (fallbackU && (u.username || '').toLowerCase() === fallbackU)
                    );
                }
            }

            // Auto-revert any users whose customId trial has expired
            let dbChanged = false;
            db.users.forEach(u => {
                if (u.customId && u.customIdExpiresAt && Date.now() > u.customIdExpiresAt) {
                    u.id = u.originalId || u.id;
                    u.customId = null;
                    u.customIdExpiresAt = null;
                    u.isCustomIdTrial = false;
                    dbChanged = true;
                }
            });
            if (dbChanged) {
                await writeDbAsync(db);
            }

            // Mark which custom IDs are currently in use by other users or the current user
            const enhancedCustomIds = customIds.map(item => {
                const itemCidStr = String(item.customId || '').trim();
                const activeUser = db.users.find(u => {
                    const uCid = String(u.customId || '').trim();
                    if (uCid && uCid === itemCidStr) {
                        if (!u.customIdExpiresAt || Date.now() < u.customIdExpiresAt) {
                            return true;
                        }
                    }
                    return false;
                });

                const isUsedByCurrent = Boolean(user && activeUser && (activeUser.id === user.id || activeUser.originalId === user.originalId));
                const isUsedByOther = Boolean(activeUser && (!user || (activeUser.id !== user.id && activeUser.originalId !== user.originalId)));

                return {
                    ...item,
                    isEquippedByMe: isUsedByCurrent,
                    inUseByAnotherUser: isUsedByOther,
                    activeUserUsername: isUsedByOther ? (activeUser.username || 'pengguna lain') : (isUsedByCurrent ? (user.username || 'Anda') : null),
                    activeUserMasked: isUsedByOther ? (activeUser.username ? '@' + activeUser.username : 'Pengguna Lain') : null
                };
            });

            return res.json({
                status: true,
                customIds: enhancedCustomIds,
                currentUserCustomId: user ? (user.customId || null) : null,
                currentUserOriginalId: user ? (user.originalId || user.id) : null,
                currentUserCustomIdExpiresAt: user ? (user.customIdExpiresAt || null) : null,
                currentUserIsTrial: user ? Boolean(user.isCustomIdTrial) : false,
                user: user ? {
                    id: user.id,
                    originalId: user.originalId || user.id,
                    customId: user.customId || null,
                    customIdExpiresAt: user.customIdExpiresAt || null,
                    isCustomIdTrial: Boolean(user.isCustomIdTrial)
                } : null
            });
        }

        // POST /api/user-auth?action=add_custom_id (Admin only)
        if (action === 'add_custom_id') {
            const adminToken = req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            const targetUserId = getUserIdFromToken(token, db);
            const callerUser = targetUserId ? db.users.find(u => u.id === targetUserId || u.originalId === targetUserId) : null;
            const isAdmin = adminAuth.verifySessionToken(adminToken) || (callerUser && ((callerUser.rawEmail || callerUser.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com'));

            if (!isAdmin) {
                return res.status(403).json({ status: false, message: 'Hanya administrator yang dapat mempublikasikan Custom ID.' });
            }

            const customId = String(body.customId || '').trim();
            const targetUsername = String(body.targetUsername || '').replace(/^@/, '').trim();
            const duration = String(body.duration || '7days').trim().toLowerCase();

            if (!customId) {
                return res.status(400).json({ status: false, message: 'Custom ID wajib diisi' });
            }

            const durationMs = parseDurationToMs(duration);
            const isPermanent = (duration === 'permanent' || duration === 'permanen' || duration === 'lifetime' || durationMs === null);
            const expiresAt = isPermanent ? null : (Date.now() + durationMs);

            let customIds = await storage.readDataAsync('custom_ids.json', []);
            if (!Array.isArray(customIds)) customIds = [];

            const newEntry = {
                id: 'cid_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
                customId: customId,
                targetUsername: targetUsername,
                duration: duration,
                durationMs: durationMs,
                isPermanent: isPermanent,
                createdAt: new Date().toISOString()
            };

            const existingIdx = customIds.findIndex(c => String(c.customId) === customId);
            if (existingIdx !== -1) {
                customIds[existingIdx] = newEntry;
            } else {
                customIds.push(newEntry);
            }
            await storage.writeDataAsync('custom_ids.json', customIds);

            // Assign directly to target user if targetUsername provided
            let assignedUser = null;
            if (targetUsername) {
                const cleanUname = targetUsername.toLowerCase();
                const targetUser = db.users.find(u => (u.username || '').toLowerCase() === cleanUname);
                if (targetUser) {
                    targetUser.originalId = targetUser.originalId || targetUser.id;
                    targetUser.customId = customId;
                    targetUser.customIdExpiresAt = expiresAt;
                    targetUser.isCustomIdTrial = !isPermanent;
                    targetUser.id = customId;
                    assignedUser = targetUser.username;
                    await writeDbAsync(db);
                }
            }

            return res.json({
                status: true,
                message: isPermanent 
                    ? `Custom ID VIP "${customId}" berhasil dipublikasikan secara Permanen!` 
                    : `Custom ID VIP "${customId}" berhasil dipublikasikan sebagai Trial!`,
                customIdRecord: newEntry,
                assignedTo: assignedUser
            });
        }

        // POST /api/user-auth?action=delete_custom_id (Admin only)
        if (action === 'delete_custom_id') {
            const adminToken = req.headers['x-admin-token'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            const targetUserId = getUserIdFromToken(token, db);
            const callerUser = targetUserId ? db.users.find(u => u.id === targetUserId || u.originalId === targetUserId) : null;
            const isAdmin = adminAuth.verifySessionToken(adminToken) || (callerUser && ((callerUser.rawEmail || callerUser.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com'));

            if (!isAdmin) {
                return res.status(403).json({ status: false, message: 'Akses ditolak.' });
            }

            const targetIdToDelete = String(body.customId || body.id || '').trim();
            if (!targetIdToDelete) {
                return res.status(400).json({ status: false, message: 'ID tidak valid' });
            }

            let customIds = await storage.readDataAsync('custom_ids.json', []);
            if (!Array.isArray(customIds)) customIds = [];

            const recordToDelete = customIds.find(c => c.id === targetIdToDelete || String(c.customId) === targetIdToDelete);
            const targetCustomIdStr = recordToDelete ? String(recordToDelete.customId) : targetIdToDelete;

            customIds = customIds.filter(c => c.id !== targetIdToDelete && String(c.customId) !== targetIdToDelete);
            await storage.writeDataAsync('custom_ids.json', customIds);

            // Revert any users currently using this customId
            let revertedUsersCount = 0;
            db.users.forEach(u => {
                if (String(u.customId) === targetCustomIdStr) {
                    u.customId = null;
                    u.customIdExpiresAt = null;
                    u.isCustomIdTrial = false;
                    if (u.originalId) {
                        u.id = u.originalId;
                    }
                    revertedUsersCount++;
                }
            });
            if (revertedUsersCount > 0) {
                await writeDbAsync(db);
            }

            return res.json({
                status: true,
                message: `Custom ID VIP "${targetCustomIdStr}" berhasil dihapus (${revertedUsersCount} akun dikembalikan ke ID asal).`
            });
        }

        // POST /api/user-auth?action=equip_custom_id
        if (action === 'equip_custom_id') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            let targetUserId = getUserIdFromToken(token, db);
            const verified = verifyUserToken(token);
            let user = targetUserId ? db.users.find(u => u.id === targetUserId || u.originalId === targetUserId) : null;
            if (!user && verified) {
                user = db.users.find(u => (u.id && u.id === verified.uid) || (u.originalId && u.originalId === verified.uid) || (verified.u && (u.username || '').toLowerCase() === verified.u.toLowerCase()));
            }
            if (!user) {
                return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu' });
            }

            const vipInfo = resolveUserVipStatus(user);
            const isMasterAdmin = (user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com';
            if (!vipInfo.isPremium && !isMasterAdmin) {
                return res.status(403).json({ status: false, message: 'Fitur Custom ID khusus untuk Member VIP MusifyStar.' });
            }

            // Cek apakah pengguna sedang dalam masa Percobaan VIP (isVipTrial) dan fitur Custom ID tidak dicentang Admin
            if (user.isVipTrial) {
                let isCustomIdAllowedInTrial = true;
                try {
                    const paymentConfigApi = require('./payment-config.js');
                    if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                        const payCfg = await paymentConfigApi.getPaymentConfig();
                        if (payCfg && payCfg.vipTrialConfig && payCfg.vipTrialConfig.allowedFeatures) {
                            user.trialAllowedFeatures = Object.assign({}, payCfg.vipTrialConfig.allowedFeatures);
                        }
                    }
                } catch (e) {}
                if (user.trialAllowedFeatures && user.trialAllowedFeatures.customId === false) {
                    isCustomIdAllowedInTrial = false;
                }
                if (!isCustomIdAllowedInTrial) {
                    return res.status(403).json({
                        status: false,
                        message: 'Fitur Custom ID VIP dikunci oleh Admin selama masa Percobaan VIP (Free Trial)! Upgrade ke VIP Penuh untuk menggunakan Custom ID.'
                    });
                }
            }

            // Rule: jika user sedang menggunakan Trial ID yang belum habis, tidak boleh ganti sampai masa trial habis
            if (user.customId && user.customIdExpiresAt && Date.now() < user.customIdExpiresAt) {
                return res.status(400).json({
                    status: false,
                    message: `Anda sedang menggunakan Trial ID "${user.customId}". Tunggu masa trial habis sebelum dapat mengganti ID lain.`
                });
            }

            const requestedCustomId = String(body.customId || '').trim();
            if (!requestedCustomId) {
                return res.status(400).json({ status: false, message: 'Custom ID wajib dipilih' });
            }

            // CRITICAL RULE: Cek jika Custom ID ini sedang aktif digunakan oleh pengguna lain!
            const otherUserUsingThisId = db.users.find(u => {
                if (u.id === user.id || u.originalId === user.originalId) return false;
                const uCid = String(u.customId || '').trim();
                if (uCid && uCid === requestedCustomId) {
                    if (!u.customIdExpiresAt || Date.now() < u.customIdExpiresAt) {
                        return true;
                    }
                }
                return false;
            });

            if (otherUserUsingThisId) {
                const maskName = otherUserUsingThisId.username ? `@${otherUserUsingThisId.username}` : 'pengguna lain';
                return res.status(400).json({
                    status: false,
                    message: `Custom ID "${requestedCustomId}" sedang aktif digunakan oleh pengguna lain (${maskName}). Pengguna lain tidak bisa memakai ID yang sedang aktif dipakai.`
                });
            }

            let customIds = await storage.readDataAsync('custom_ids.json', []);
            if (!Array.isArray(customIds)) customIds = [];

            const record = customIds.find(c => String(c.customId) === requestedCustomId &&
                (!c.targetUsername || c.targetUsername.toLowerCase() === (user.username || '').toLowerCase()));

            if (!record && !isMasterAdmin) {
                return res.status(403).json({ status: false, message: 'Custom ID ini tidak tersedia untuk akun Anda.' });
            }

            const durationMs = record ? record.durationMs : null;
            const isPermanent = record ? record.isPermanent : true;
            const expiresAt = isPermanent ? null : (Date.now() + durationMs);

            user.originalId = user.originalId || user.id;
            user.customId = requestedCustomId;
            user.customIdExpiresAt = expiresAt;
            user.isCustomIdTrial = !isPermanent;
            user.id = requestedCustomId;

            await writeDbAsync(db);

            return res.json({
                status: true,
                message: `Custom ID VIP "${requestedCustomId}" berhasil dipasang!`,
                user: {
                    id: user.id,
                    originalId: user.originalId,
                    customId: user.customId,
                    customIdExpiresAt: user.customIdExpiresAt,
                    isCustomIdTrial: user.isCustomIdTrial
                }
            });
        }

        // POST /api/user-auth?action=revert_custom_id
        if (action === 'revert_custom_id') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            const targetUserId = getUserIdFromToken(token, db);
            if (!targetUserId) {
                return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu' });
            }

            const user = db.users.find(u => u.id === targetUserId || u.originalId === targetUserId);
            if (!user) {
                return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
            }

            user.customId = null;
            user.customIdExpiresAt = null;
            user.isCustomIdTrial = false;
            if (user.originalId) {
                user.id = user.originalId;
            }

            await writeDbAsync(db);

            return res.json({
                status: true,
                message: 'Berhasil kembali ke User ID asal!',
                user: {
                    id: user.id,
                    originalId: user.originalId,
                    customId: null
                }
            });
        }

        // POST /api/user-auth?action=claim_vip_trial (Pengguna Baru Klaim Percobaan VIP Gratis)
        if (action === 'claim_vip_trial') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            let targetUserId = getUserIdFromToken(token, db);
            const verified = verifyUserToken(token);
            let user = targetUserId ? db.users.find(u => u && (String(u.id) === String(targetUserId) || String(u.originalId) === String(targetUserId))) : null;
            if (!user && verified) {
                user = db.users.find(u => u && ((u.id && String(u.id) === String(verified.uid)) || (u.originalId && String(u.originalId) === String(verified.uid)) || (verified.u && (u.username || '').toLowerCase() === String(verified.u).toLowerCase())));
            }
            if (!user && body.userId) {
                user = db.users.find(u => u && (String(u.id) === String(body.userId) || String(u.originalId) === String(body.userId)));
            }
            if (!user) {
                return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu untuk mengklaim Percobaan VIP.' });
            }

            let paymentConfig = {};
            try {
                const paymentConfigApi = require('./payment-config.js');
                if (paymentConfigApi && typeof paymentConfigApi.getPaymentConfig === 'function') {
                    paymentConfig = await paymentConfigApi.getPaymentConfig();
                }
            } catch (e) {}

            const trialCfg = (paymentConfig && paymentConfig.vipTrialConfig) || {
                enabled: true,
                durationDays: 7,
                borderAccess: 'platinum',
                allowedFeatures: {
                    liquidGlassIos27: true,
                    nameGlow: true,
                    customId: true,
                    vipAvatar: true,
                    dynamicIsland: true,
                    highAudio: true,
                    backgroundPlay: true,
                    keepScreenAwake: true,
                    swipeGestures: true,
                    vipSultanBadge: true
                }
            };

            if (trialCfg.enabled === false) {
                return res.status(403).json({
                    status: false,
                    message: 'Program Percobaan VIP Pengguna Baru sedang dinonaktifkan sementara oleh Admin.'
                });
            }

            if (user.hasClaimedVipTrial) {
                return res.status(400).json({
                    status: false,
                    message: 'Akun Anda sudah pernah mengklaim Percobaan VIP Pengguna Baru sebelumnya (1x per akun).'
                });
            }

            const vipInfo = resolveUserVipStatus(user);
            if (vipInfo.isPremium && !user.isVipTrial) {
                return res.status(400).json({
                    status: false,
                    message: 'Akun Anda sudah berstatus Member VIP Aktif!'
                });
            }

            const durationDays = Math.max(1, Math.min(3650, Number(trialCfg.durationDays) || 7));
            const borderAccess = String(trialCfg.borderAccess || 'platinum').toLowerCase();
            const expiresAt = Date.now() + (durationDays * 24 * 3600 * 1000);

            user.isPremium = true;
            user.vipTier = borderAccess === 'all' ? 'permanent' : (borderAccess === 'platinum_master_legend' ? '2months' : '1month');
            user.vipGrantedAt = Date.now();
            user.vipExpiresAt = expiresAt;
            user.vipSource = 'trial';
            user.isVipTrial = true;
            user.hasClaimedVipTrial = true;
            user.trialClaimedAt = new Date().toISOString();
            user.trialExpiredAt = null;
            user.trialDurationDays = durationDays;
            user.trialBorderAccess = borderAccess;
            user.trialAllowedFeatures = trialCfg.allowedFeatures || {};
            user.hasUnpaidTrialInvoice = false;
            user.pendingTrialInvoice = null;

            if (user.trialAllowedFeatures.customId === false && user.customId) {
                user.id = user.originalId || user.id;
                user.customId = null;
                user.customIdExpiresAt = null;
                user.isCustomIdTrial = false;
            }
            if (user.trialAllowedFeatures.nameGlow === false && user.nameGlow) {
                user.nameGlow = '';
            }

            // Pasang Border Platinum otomatis jika user belum punya border dan akses border diizinkan
            if (!user.border && borderAccess !== 'none') {
                user.border = 'border_platinum';
                user.borderUrl = '/api/borders?action=image&id=border_platinum';
                user.borderName = 'Platinum';
            }

            await writeDbAsync(db);

            const borderLabelMap = {
                'platinum': 'Border Platinum',
                'platinum_master': 'Border Platinum & Master',
                'platinum_master_legend': 'Border Platinum, Master & Legend',
                'all': 'Semua Border VIP',
                'none': 'Fitur VIP (Tanpa Border)'
            };

            return res.json({
                status: true,
                message: `Selamat! Percobaan VIP Gratis selama ${durationDays} Hari (${borderLabelMap[borderAccess] || 'Border Platinum'}) berhasil diaktifkan! Saat masa trial berakhir, rincian tagihan akan dikirim ke email ${user.rawEmail || user.email}.`,
                user: {
                    id: user.id,
                    originalId: user.originalId || user.id,
                    username: user.username,
                    email: user.rawEmail || user.email,
                    isPremium: true,
                    vipTier: user.vipTier,
                    vipExpiresAt: user.vipExpiresAt,
                    vipSource: 'trial',
                    isVipTrial: true,
                    hasClaimedVipTrial: true,
                    trialClaimedAt: user.trialClaimedAt,
                    trialDurationDays: user.trialDurationDays,
                    trialBorderAccess: user.trialBorderAccess,
                    trialAllowedFeatures: user.trialAllowedFeatures,
                    hasUnpaidTrialInvoice: false,
                    pendingTrialInvoice: null,
                    border: user.border,
                    borderUrl: user.borderUrl,
                    borderName: user.borderName
                }
            });
        }

        // POST /api/user-auth?action=user_trial_invoice_action (Pengguna Scan QRIS -> WA Admin atau Pilih Tidak Lanjut Perpanjang)
        if (action === 'user_trial_invoice_action') {
            const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.body?.token;
            let targetUserId = getUserIdFromToken(token, db);
            const verified = verifyUserToken(token);
            let user = targetUserId ? db.users.find(u => u && (String(u.id) === String(targetUserId) || String(u.originalId) === String(targetUserId))) : null;
            if (!user && verified) {
                user = db.users.find(u => u && ((u.id && String(u.id) === String(verified.uid)) || (u.originalId && String(u.originalId) === String(verified.uid)) || (verified.u && (u.username || '').toLowerCase() === String(verified.u).toLowerCase())));
            }
            if (!user && body.userId) {
                user = db.users.find(u => u && (String(u.id) === String(body.userId) || String(u.originalId) === String(body.userId)));
            }
            if (!user) {
                return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu.' });
            }

            const subAction = String(body.subAction || '').toLowerCase().trim();

            if (subAction === 'confirm_qris_scan') {
                const chosenMethod = String(body.paymentMethod || 'QRIS').toUpperCase();
                if (!user.pendingTrialInvoice || typeof user.pendingTrialInvoice !== 'object') {
                    user.pendingTrialInvoice = {
                        invoiceId: body.invoiceId || ('INV-VIP-' + Date.now().toString().slice(-6)),
                        userId: user.id,
                        username: user.username,
                        email: user.rawEmail || user.email || '',
                        status: 'unpaid',
                        createdAt: new Date().toISOString()
                    };
                }
                user.pendingTrialInvoice.packageId = body.packageId || user.pendingTrialInvoice.packageId || 'pkg_1month';
                user.pendingTrialInvoice.packageName = body.packageName || user.pendingTrialInvoice.packageName || 'Paket 1 Bulan VIP';
                user.pendingTrialInvoice.amount = Number(body.amount) || Number(user.pendingTrialInvoice.amount) || 10000;
                user.pendingTrialInvoice.duration = body.duration || user.pendingTrialInvoice.duration || '30 Hari';
                user.pendingTrialInvoice.paymentMethod = chosenMethod;
                user.pendingTrialInvoice.waitingAdminApproval = true;
                user.pendingTrialInvoice.scannedAt = new Date().toISOString();
                user.pendingTrialInvoice.userChoice = 'continue';
                await writeDbAsync(db);

                return res.json({
                    status: true,
                    message: 'Status pembayaran telah tercatat! Mengarahkan ke WhatsApp Admin untuk pengiriman bukti transfer...',
                    user: {
                        id: user.id,
                        username: user.username,
                        hasUnpaidTrialInvoice: Boolean(user.hasUnpaidTrialInvoice),
                        pendingTrialInvoice: user.pendingTrialInvoice
                    }
                });
            }

            if (subAction === 'decline_renewal') {
                user.hasUnpaidTrialInvoice = false;
                user.isVipTrial = false;
                if (user.vipSource === 'trial') {
                    user.isPremium = false;
                    user.vipTier = 'none';
                    user.vipExpiresAt = null;
                    user.vipSource = 'standard';
                    user.border = '';
                    user.borderUrl = '';
                    user.borderName = '';
                }
                if (user.pendingTrialInvoice && typeof user.pendingTrialInvoice === 'object') {
                    user.pendingTrialInvoice.status = 'declined';
                    user.pendingTrialInvoice.waitingAdminApproval = false;
                    user.pendingTrialInvoice.userChoice = 'declined';
                    user.pendingTrialInvoice.declinedAt = new Date().toISOString();
                }
                await writeDbAsync(db);

                return res.json({
                    status: true,
                    message: 'Perpanjangan VIP dibatalkan. Tagihan telah dihapus dan akun Anda kembali menjadi akun reguler.',
                    user: {
                        id: user.id,
                        username: user.username,
                        isPremium: Boolean(user.isPremium),
                        vipTier: user.vipTier || 'none',
                        vipExpiresAt: user.vipExpiresAt || null,
                        isVipTrial: false,
                        hasUnpaidTrialInvoice: false,
                        pendingTrialInvoice: user.pendingTrialInvoice
                    }
                });
            }

            return res.status(400).json({ status: false, message: 'Sub-action tidak dikenal.' });
        }

        return res.status(400).json({ status: false, message: 'Action tidak dikenal' });
    } catch (err) {
        console.error('User-Auth Handler Error:', err);
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan server internal: ' + err.message });
    }
};

module.exports.verifyUserToken = verifyUserToken;
module.exports.createSignedUserToken = createSignedUserToken;
module.exports.getUserIdFromToken = getUserIdFromToken;
module.exports.getRegisteredUsers = async function() {
    try {
        const db = await readDbAsync();
        return db.users || [];
    } catch (e) {
        return [];
    }
};

