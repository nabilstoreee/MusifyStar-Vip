const fs = require('fs');
const path = require('path');
const storage = require('./storage.js');
const userAuth = require('./user-auth.js');
const adminAuth = require('./admin-auth.js');

const BORDERS_LIST = [
    {
        id: 'none',
        name: 'Tanpa Border',
        file: '',
        url: '',
        isVip: false,
        tier: 'Gratis',
        requiredTier: 'none',
        color: '#a1a1aa',
        badge: 'Default',
        desc: 'Tampilan avatar melingkar standar tanpa bingkai tambahan.'
    },
    {
        id: 'border_platinum',
        name: 'Platinum',
        file: 'Platinum.png',
        url: '/borders/Platinum.png',
        isVip: true,
        tier: '1 Bulan+',
        requiredTier: '1month',
        color: '#38bdf8',
        badge: '1 Bulan+',
        desc: 'Bingkai Platinum naga api cyber. Terbuka untuk Paket 1 Bulan, 5 Bulan & Permanen.'
    },
    {
        id: 'border_master',
        name: 'Master',
        file: 'Master.png',
        url: '/borders/Master.png',
        isVip: true,
        tier: '1 Bulan+',
        requiredTier: '1month',
        color: '#f97316',
        badge: '1 Bulan+',
        desc: 'Bingkai Master mahkota emas membara. Terbuka untuk Paket 1 Bulan, 5 Bulan & Permanen.'
    },
    {
        id: 'border_legend',
        name: 'Legend',
        file: 'Legend.png',
        url: '/borders/Legend.png',
        isVip: true,
        tier: '2 Bulan+',
        requiredTier: '2months',
        color: '#eab308',
        badge: '2 Bulan+',
        desc: 'Sayap emas kemegahan kerajaan Legenda. Khusus Paket 2 Bulan, 5 Bulan & Permanen.'
    },
    {
        id: 'border_immortal',
        name: 'Immortal',
        file: 'Imortal.png',
        url: '/borders/Imortal.png',
        isVip: true,
        tier: '5 Bulan+',
        requiredTier: '5months',
        color: '#ec4899',
        badge: '5 Bulan+',
        desc: 'Kasta tertinggi Immortal Mahkota Dewa Musik. Khusus Paket 5 Bulan & Permanen.'
    }
];

// Pastikan file gambar ada di public/borders (aman untuk lingkungan read-only serverless/container)
function ensureBordersOnDisk() {
    try {
        const bordersDir = path.join(__dirname, '..', 'public', 'borders');
        if (!fs.existsSync(bordersDir)) {
            try { fs.mkdirSync(bordersDir, { recursive: true }); } catch (e) {}
        }
        ['Imortal.png', 'Legend.png', 'Master.png', 'Platinum.png'].forEach(f => {
            try {
                const rootFile = path.join(__dirname, '..', f);
                const targetFile = path.join(bordersDir, f);
                if (fs.existsSync(rootFile) && !fs.existsSync(targetFile)) {
                    fs.copyFileSync(rootFile, targetFile);
                }
            } catch (e) {}
        });
        const immTarget = path.join(bordersDir, 'Immortal.png');
        const imTarget = path.join(bordersDir, 'Imortal.png');
        if (fs.existsSync(imTarget) && !fs.existsSync(immTarget)) {
            try { fs.copyFileSync(imTarget, immTarget); } catch (e) {}
        }
    } catch (e) {
        // Read-only filesystem is safely handled
    }
}

ensureBordersOnDisk();

function normalizeScaleValue(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return 100;
    return Math.max(50, Math.min(180, Math.round(num)));
}

function normalizeOffsetYValue(val) {
    if (val === undefined || val === null || val === '') return 0;
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.max(-45, Math.min(45, Math.round(num)));
}

function normalizeOffsetXValue(val) {
    if (val === undefined || val === null || val === '') return 0;
    const num = Number(val);
    if (!Number.isFinite(num)) return 0;
    return Math.max(-45, Math.min(45, Math.round(num)));
}

function attachScaleParamToUrl(url, scale, offsetY = 0, offsetX = 0) {
    if (!url || typeof url !== 'string') return '';
    const s = normalizeScaleValue(scale);
    const y = normalizeOffsetYValue(offsetY);
    const x = normalizeOffsetXValue(offsetX);
    // Remove any existing s=, y=, and x= parameters first
    let clean = url
        .replace(/([?&])s=\d+(&?)/g, (match, p1, p2) => (p2 ? p1 : ''))
        .replace(/([?&])y=-?\d+(&?)/g, (match, p1, p2) => (p2 ? p1 : ''))
        .replace(/([?&])x=-?\d+(&?)/g, (match, p1, p2) => (p2 ? p1 : ''))
        .replace(/[?&]+$/, '');
    const params = [];
    if (s !== 100) params.push(`s=${s}`);
    if (y !== 0) params.push(`y=${y}`);
    if (x !== 0) params.push(`x=${x}`);
    if (params.length === 0) return clean;
    const sep = clean.includes('?') ? '&' : '?';
    return `${clean}${sep}${params.join('&')}`;
}

function getBorderScalesMap() {
    try {
        const map = storage.readData('border_scales.json', {});
        return (map && typeof map === 'object') ? map : {};
    } catch (e) {
        return {};
    }
}

async function getBorderScalesMapAsync() {
    try {
        const map = await storage.readDataAsync('border_scales.json', {});
        return (map && typeof map === 'object') ? map : {};
    } catch (e) {
        return {};
    }
}

function getBorderOffsetsMap() {
    try {
        const map = storage.readData('border_offsets.json', {});
        return (map && typeof map === 'object') ? map : {};
    } catch (e) {
        return {};
    }
}

async function getBorderOffsetsMapAsync() {
    try {
        const map = await storage.readDataAsync('border_offsets.json', {});
        return (map && typeof map === 'object') ? map : {};
    } catch (e) {
        return {};
    }
}

function getBorderOffsetsXMap() {
    try {
        const map = storage.readData('border_offsets_x.json', {});
        return (map && typeof map === 'object') ? map : {};
    } catch (e) {
        return {};
    }
}

async function getBorderOffsetsXMapAsync() {
    try {
        const map = await storage.readDataAsync('border_offsets_x.json', {});
        return (map && typeof map === 'object') ? map : {};
    } catch (e) {
        return {};
    }
}

// In-memory binary image cache for instant 0ms custom border image serving
const borderImageBufferCache = new Map();
let lastKnownCustomBorders = [];

function decodeBase64Image(rawBase64) {
    if (!rawBase64 || typeof rawBase64 !== 'string') return null;
    try {
        let cleanBase64 = rawBase64.trim();
        let mimeType = 'image/png';
        let ext = 'png';
        if (cleanBase64.includes('base64,')) {
            const parts = cleanBase64.split('base64,');
            const header = parts[0].toLowerCase();
            cleanBase64 = parts[1].trim();
            if (header.includes('jpeg') || header.includes('jpg')) { mimeType = 'image/jpeg'; ext = 'jpg'; }
            else if (header.includes('webp')) { mimeType = 'image/webp'; ext = 'webp'; }
            else if (header.includes('gif')) { mimeType = 'image/gif'; ext = 'gif'; }
            else if (header.includes('svg')) { mimeType = 'image/svg+xml'; ext = 'svg'; }
        }
        const buffer = Buffer.from(cleanBase64, 'base64');
        if (buffer.length > 0) {
            return { buffer, mimeType, ext };
        }
    } catch (e) {}
    return null;
}

function deduplicateAndNormalizeCustomBorders(rawList, deletedIdsSet = new Set(), scalesMap = {}, offsetsMap = {}, offsetsXMap = {}) {
    if (!Array.isArray(rawList)) return [];
    const seenMap = new Map();
    const result = [];
    for (const item of rawList) {
        if (!item || !item.id || deletedIdsSet.has(item.id)) continue;
        if (seenMap.has(item.id)) {
            const existing = seenMap.get(item.id);
            if (!existing.imageBase64 && item.imageBase64) {
                existing.imageBase64 = item.imageBase64;
            }
            continue;
        }
        const resolvedScale = normalizeScaleValue(scalesMap[item.id] !== undefined ? scalesMap[item.id] : item.scale);
        const resolvedOffsetY = normalizeOffsetYValue(offsetsMap[item.id] !== undefined ? offsetsMap[item.id] : item.offsetY);
        const resolvedOffsetX = normalizeOffsetXValue(offsetsXMap[item.id] !== undefined ? offsetsXMap[item.id] : item.offsetX);

        // Cache decoded image in RAM buffer cache for 0ms serving
        if (item.imageBase64 && typeof item.imageBase64 === 'string' && !borderImageBufferCache.has(item.id)) {
            const decoded = decodeBase64Image(item.imageBase64);
            if (decoded) {
                borderImageBufferCache.set(item.id, { buffer: decoded.buffer, mimeType: decoded.mimeType });
            }
        }

        // Normalize custom border URL so it works across both Vercel serverless and local containers
        let normalizedUrl = item.url || '';
        const isCustomItem = Boolean(item.isCustom || String(item.id).startsWith('border_custom_'));
        if (isCustomItem && (!normalizedUrl || normalizedUrl.startsWith('/borders/border_'))) {
            let ext = 'png';
            if (item.file && item.file.includes('.')) {
                ext = item.file.split('.').pop().toLowerCase() || 'png';
            }
            normalizedUrl = `/api/borders?action=image&id=${item.id}&ext=${ext}`;
        }
        normalizedUrl = attachScaleParamToUrl(normalizedUrl, resolvedScale, resolvedOffsetY, resolvedOffsetX);
        const normalizedObj = {
            ...item,
            scale: resolvedScale,
            offsetY: resolvedOffsetY,
            offsetX: resolvedOffsetX,
            url: normalizedUrl,
            hasStoredImage: true,
            isCustom: true
        };
        seenMap.set(item.id, normalizedObj);
        result.push(normalizedObj);
    }
    return result;
}

function getCustomBorders() {
    try {
        const custom = storage.readData('custom_borders.json', null);
        const deleted = storage.readData('deleted_borders.json', []);
        const scalesMap = getBorderScalesMap();
        const offsetsMap = getBorderOffsetsMap();
        const offsetsXMap = getBorderOffsetsXMap();
        const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);
        const sourceList = (Array.isArray(custom) && custom.length > 0) ? custom : lastKnownCustomBorders;
        const normalized = deduplicateAndNormalizeCustomBorders(sourceList, deletedSet, scalesMap, offsetsMap, offsetsXMap);
        if (normalized.length > 0) {
            lastKnownCustomBorders = normalized;
        }
        return normalized;
    } catch (e) {
        return lastKnownCustomBorders;
    }
}

async function getCustomBordersAsync(forceFresh = false) {
    try {
        const memCustom = storage.readData('custom_borders.json', null);
        const [deleted, scalesMap, offsetsMap, offsetsXMap, dbCustom] = await Promise.all([
            (forceFresh && typeof storage.fetchFromPostgres === 'function')
                ? storage.fetchFromPostgres('deleted_borders.json').then(r => Array.isArray(r) ? r : storage.readDataAsync('deleted_borders.json', []))
                : storage.readDataAsync('deleted_borders.json', []),
            getBorderScalesMapAsync(),
            getBorderOffsetsMapAsync(),
            getBorderOffsetsXMapAsync(),
            (forceFresh && typeof storage.fetchFromPostgres === 'function')
                ? storage.fetchFromPostgres('custom_borders.json').then(r => Array.isArray(r) ? r : storage.readDataAsync('custom_borders.json', []))
                : storage.readDataAsync('custom_borders.json', [])
        ]);
        const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);

        // Prioritize dbCustom when available so cross-instance updates & imageBase64 are authoritative
        const combined = (Array.isArray(dbCustom) && dbCustom.length > 0)
            ? [...dbCustom, ...(Array.isArray(memCustom) ? memCustom : [])]
            : [...(Array.isArray(memCustom) ? memCustom : []), ...lastKnownCustomBorders];
        const normalized = deduplicateAndNormalizeCustomBorders(combined, deletedSet, scalesMap, offsetsMap, offsetsXMap);
        if (normalized.length > 0 || (Array.isArray(dbCustom) && dbCustom.length === 0 && lastKnownCustomBorders.length === 0)) {
            lastKnownCustomBorders = normalized;
        }
        return normalized;
    } catch (e) {
        return getCustomBorders();
    }
}

async function saveCustomBordersAsync(list) {
    try {
        const [deleted, scalesMap, offsetsMap, offsetsXMap] = await Promise.all([
            storage.readDataAsync('deleted_borders.json', []),
            getBorderScalesMapAsync(),
            getBorderOffsetsMapAsync(),
            getBorderOffsetsXMapAsync()
        ]);
        const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);
        const cleanList = deduplicateAndNormalizeCustomBorders(list, deletedSet, scalesMap, offsetsMap, offsetsXMap);
        lastKnownCustomBorders = cleanList;
        await storage.writeDataAsync('custom_borders.json', cleanList);
        return true;
    } catch (e) {
        console.error('[BORDERS] Error saving custom borders:', e.message);
        return false;
    }
}

function toClientBorder(b) {
    if (!b) return b;
    const { imageBase64, ...rest } = b;
    return rest;
}

function toClientBordersList(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const b of list) {
        if (!b || !b.id || seen.has(b.id)) continue;
        seen.add(b.id);
        out.push(toClientBorder(b));
    }
    return out;
}

function applyScalesToSystemBorders(scalesMap = {}, offsetsMap = {}, offsetsXMap = {}) {
    return BORDERS_LIST.map(b => {
        if (!b || b.id === 'none') return { ...b, scale: 100, offsetY: 0, offsetX: 0 };
        const s = normalizeScaleValue(scalesMap[b.id] !== undefined ? scalesMap[b.id] : b.scale);
        const y = normalizeOffsetYValue(offsetsMap[b.id] !== undefined ? offsetsMap[b.id] : b.offsetY);
        const x = normalizeOffsetXValue(offsetsXMap[b.id] !== undefined ? offsetsXMap[b.id] : b.offsetX);
        return {
            ...b,
            scale: s,
            offsetY: y,
            offsetX: x,
            url: attachScaleParamToUrl(b.url, s, y, x)
        };
    });
}

function getAllBorders() {
    const scalesMap = getBorderScalesMap();
    const offsetsMap = getBorderOffsetsMap();
    const offsetsXMap = getBorderOffsetsXMap();
    const custom = getCustomBorders();
    return [...applyScalesToSystemBorders(scalesMap, offsetsMap, offsetsXMap), ...custom];
}

async function getAllBordersAsync(forceFresh = false) {
    const [scalesMap, offsetsMap, offsetsXMap, custom] = await Promise.all([
        getBorderScalesMapAsync(),
        getBorderOffsetsMapAsync(),
        getBorderOffsetsXMapAsync(),
        getCustomBordersAsync(forceFresh)
    ]);
    return [...applyScalesToSystemBorders(scalesMap, offsetsMap, offsetsXMap), ...custom];
}

const TIER_RANKS = {
    'none': 0,
    'free': 0,
    '1month': 1,
    '1': 1,
    'platinum': 1,
    'master': 1,
    '2months': 2,
    '2': 2,
    '3months': 2,
    'legend': 2,
    '5months': 3,
    '5': 3,
    'immortal': 3,
    'imortal': 3,
    'permanent': 4,
    'lifetime': 4,
    'sultan': 4
};

function canUserEquipBorder(user, borderObj, isAdminSession = false) {
    if (!borderObj || borderObj.id === 'none') return true;

    // Master Admin email (jrnabil570@gmail.com) always has full access
    const userEmail = (user.rawEmail || user.email || '').toLowerCase().trim();
    if (userEmail === 'jrnabil570@gmail.com') return true;

    const isVip = !!user.isPremium || !!user.is_premium;
    if (!isVip) {
        return borderObj.isVip === false || borderObj.requiredTier === 'none';
    }

    // Check expiration if set
    if (user.vipExpiresAt && Date.now() > user.vipExpiresAt) {
        return false;
    }

    // If user's VIP came from Referral and has Admin-configured Border restrictions, enforce Admin's Referral Border rules
    if (user.vipSource === 'referral' && user.referralBorderRestricted) {
        try {
            const referralsApi = require('./referrals.js');
            const refCheck = referralsApi.canReferralVipEquipBorder(user, borderObj);
            if (typeof refCheck === 'boolean') return refCheck;
        } catch (e) {}
    }

    const userTier = String(user.vipTier || 'permanent').toLowerCase();
    const reqTier = String(borderObj.requiredTier || (borderObj.isVip ? '1month' : 'none')).toLowerCase();

    // Specific legacy mapping fallback
    if (userTier === '1month' && (borderObj.id === 'border_platinum' || borderObj.id === 'border_master' || borderObj.category === 'platinum' || borderObj.category === 'master' || reqTier === '1month')) return true;
    if (userTier === '2months' && (borderObj.id === 'border_platinum' || borderObj.id === 'border_master' || borderObj.id === 'border_legend' || borderObj.category === 'legend' || reqTier === '1month' || reqTier === '2months')) return true;
    if (userTier === '5months' && (borderObj.id === 'border_platinum' || borderObj.id === 'border_master' || borderObj.id === 'border_legend' || borderObj.id === 'border_immortal' || borderObj.category === 'immortal' || reqTier === '1month' || reqTier === '2months' || reqTier === '5months')) return true;
    if (userTier === 'permanent' || userTier === 'lifetime' || userTier === 'sultan') return true;

    // Numerical rank comparison
    const userRank = TIER_RANKS[userTier] !== undefined ? TIER_RANKS[userTier] : 4;
    const reqRank = TIER_RANKS[reqTier] !== undefined ? TIER_RANKS[reqTier] : 1;

    return userRank >= reqRank;
}

module.exports = async function handler(req, res) {
    const action = req.query.action || (req.body && req.body.action) || 'list';

    // Serve image endpoint (Safe for read-only / serverless / container environment)
    if (action === 'image' || action === 'raw_image') {
        try {
            const borderId = String(req.query.id || req.query.borderId || '').trim();
            const fileName = String(req.query.file || '').trim();

            // 1. Check dedicated in-memory binary buffer cache first (0.01ms latency)
            if (borderId && borderImageBufferCache.has(borderId)) {
                const cached = borderImageBufferCache.get(borderId);
                res.setHeader('Content-Type', cached.mimeType || 'image/png');
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                return res.status(200).send(cached.buffer);
            }

            // 2. Check static files in /public/borders/ on disk directly (0.1ms latency)
            const bordersDir = path.join(__dirname, '..', 'public', 'borders');
            const diskCandidates = [];
            if (borderId) {
                diskCandidates.push(path.join(bordersDir, `${borderId}.png`));
                diskCandidates.push(path.join(bordersDir, `${borderId}.webp`));
                diskCandidates.push(path.join(bordersDir, `${borderId}.jpg`));
                diskCandidates.push(path.join(bordersDir, `${borderId}.gif`));
            }
            if (fileName) {
                diskCandidates.push(path.join(bordersDir, path.basename(fileName)));
            }
            let found = getAllBorders().find(b => (borderId && b.id === borderId) || (fileName && b.file === fileName));
            if (found && found.file) {
                diskCandidates.push(path.join(bordersDir, path.basename(found.file)));
            }
            for (const candidatePath of diskCandidates) {
                if (fs.existsSync(candidatePath)) {
                    const ext = path.extname(candidatePath).toLowerCase().replace('.', '') || 'png';
                    const mimeType = ext === 'jpg' ? 'image/jpeg' : (ext === 'svg' ? 'image/svg+xml' : `image/${ext}`);
                    const buffer = fs.readFileSync(candidatePath);
                    if (borderId) borderImageBufferCache.set(borderId, { buffer, mimeType });
                    res.setHeader('Content-Type', mimeType);
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    return res.status(200).send(buffer);
                }
            }

            // 3. Fetch individual border_img_<borderId> row from PostgreSQL (~300KB single image instead of full list)
            if (borderId) {
                const imgRow = await storage.readDataAsync(`border_img_${borderId}`, null);
                if (imgRow && imgRow.imageBase64) {
                    const decoded = decodeBase64Image(imgRow.imageBase64);
                    if (decoded) {
                        borderImageBufferCache.set(borderId, { buffer: decoded.buffer, mimeType: decoded.mimeType });
                        try {
                            if (!fs.existsSync(bordersDir)) fs.mkdirSync(bordersDir, { recursive: true });
                            fs.writeFileSync(path.join(bordersDir, `${borderId}.${decoded.ext}`), decoded.buffer);
                            if (imgRow.file) fs.writeFileSync(path.join(bordersDir, path.basename(imgRow.file)), decoded.buffer);
                        } catch (e) {}
                        res.setHeader('Content-Type', decoded.mimeType);
                        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                        return res.status(200).send(decoded.buffer);
                    }
                }
            }

            // 4. Fallback: check full borders list if not yet found
            if (!found) {
                const all = await getAllBordersAsync(true);
                found = all.find(b => (borderId && b.id === borderId) || (fileName && b.file === fileName));
            }

            if (found) {
                if (found.imageBase64) {
                    const decoded = decodeBase64Image(found.imageBase64);
                    if (decoded) {
                        if (borderId) borderImageBufferCache.set(borderId, { buffer: decoded.buffer, mimeType: decoded.mimeType });
                        res.setHeader('Content-Type', decoded.mimeType);
                        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                        return res.status(200).send(decoded.buffer);
                    }
                }
                if (found.file) {
                    const localPath = path.join(bordersDir, path.basename(found.file));
                    if (fs.existsSync(localPath)) {
                        const ext = path.extname(found.file).toLowerCase().replace('.', '') || 'png';
                        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                        const buffer = fs.readFileSync(localPath);
                        if (borderId) borderImageBufferCache.set(borderId, { buffer, mimeType: mime });
                        res.setHeader('Content-Type', mime);
                        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                        return res.status(200).send(buffer);
                    }
                }
            }
        } catch (imgErr) {
            console.error('[BORDERS] Error serving border image:', imgErr.message);
        }
        return res.status(404).send('Border image not found');
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // GET /api/borders (list borders)
    if (req.method === 'GET' || action === 'list' || action === 'list_all') {
        ensureBordersOnDisk();
        let all;
        try {
            all = await Promise.race([
                getAllBordersAsync(false),
                new Promise(resolve => setTimeout(() => resolve(getAllBorders()), 3000))
            ]);
        } catch (e) {
            all = getAllBorders();
        }
        return res.json({
            status: true,
            borders: toClientBordersList(all)
        });
    }

    // Check admin authorization helper
    const checkAdminAuth = () => {
        const adminToken = req.headers['x-admin-token'] || req.body?.adminToken || req.query.token;
        if (adminToken && adminAuth.isValidToken(adminToken)) return true;
        const userHeader = req.headers.authorization || req.headers['x-user-token'] || '';
        const token = userHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.token;
        if (token) {
            try {
                const db = storage.readData('users.json', { users: [], sessions: {} });
                const uId = userAuth.getUserIdFromToken(token, db);
                const u = (db.users || []).find(x => x.id === uId);
                if (u) {
                    const email = (u.rawEmail || u.email || '').toLowerCase().trim();
                    if (email === 'jrnabil570@gmail.com') return true;
                }
            } catch (e) {}
        }
        return false;
    };

    // POST /api/borders?action=add_border (Admin add photo border)
    if (req.method === 'POST' && action === 'add_border') {
        if (!checkAdminAuth()) {
            return res.status(403).json({ status: false, message: 'Akses ditolak: Hanya admin yang dapat menambah border profile.' });
        }

        const body = req.body || {};
        const name = String(body.name || '').trim();
        if (!name) {
            return res.status(400).json({ status: false, message: 'Nama border wajib diisi.' });
        }

        const rawCategory = String(body.category || '').toLowerCase().trim();
        const rawTier = String(body.vipTier || body.requiredTier || rawCategory || '1month').toLowerCase();

        let chosenTier = '1month';
        let chosenCategory = 'platinum';

        if (rawTier === 'immortal' || rawTier === 'imortal' || rawTier === '5months' || rawTier === '5') {
            chosenTier = '5months';
            chosenCategory = 'immortal';
        } else if (rawTier === 'legend' || rawTier === '2months' || rawTier === '2' || rawTier === '3months') {
            chosenTier = '2months';
            chosenCategory = 'legend';
        } else if (rawTier === 'master') {
            chosenTier = '1month';
            chosenCategory = 'master';
        } else if (rawTier === 'permanent' || rawTier === 'lifetime' || rawTier === 'sultan') {
            chosenTier = 'permanent';
            chosenCategory = 'permanent';
        } else {
            chosenTier = '1month';
            chosenCategory = 'platinum';
        }

        if (rawCategory && ['platinum', 'master', 'legend', 'immortal', 'permanent'].includes(rawCategory)) {
            chosenCategory = rawCategory;
        } else if (name.toLowerCase().includes('immortal') || name.toLowerCase().includes('imortal')) {
            chosenCategory = 'immortal';
        } else if (name.toLowerCase().includes('legend')) {
            chosenCategory = 'legend';
        } else if (name.toLowerCase().includes('master')) {
            chosenCategory = 'master';
        } else if (name.toLowerCase().includes('platinum')) {
            chosenCategory = 'platinum';
        }

        const tierMeta = {
            '1month': { 
                label: chosenCategory === 'master' ? 'Master (1 Bulan+)' : 'Platinum (1 Bulan+)', 
                badge: chosenCategory === 'master' ? 'Master' : 'Platinum', 
                color: chosenCategory === 'master' ? '#f97316' : '#38bdf8', 
                desc: 'Terbuka untuk Paket 1 Bulan, 2 Bulan, 5 Bulan & Permanen.' 
            },
            '2months': { 
                label: 'Legend (2 Bulan+)', 
                badge: 'Legend', 
                color: '#eab308', 
                desc: 'Terbuka untuk Paket 2 Bulan, 5 Bulan & Permanen.' 
            },
            '5months': { 
                label: 'Immortal (5 Bulan+)', 
                badge: 'Immortal', 
                color: '#ec4899', 
                desc: 'Terbuka untuk Paket 5 Bulan & Permanen.' 
            },
            'permanent': { 
                label: 'VIP Permanen', 
                badge: 'Permanen', 
                color: '#f59e0b', 
                desc: 'Khusus Member VIP Permanen (Lifetime Sultan).' 
            }
        }[chosenTier] || {
            label: '1 Bulan+', badge: '1 Bulan+', color: '#38bdf8', desc: 'Terbuka untuk VIP'
        };

        const borderId = 'border_custom_' + Date.now();
        let borderUrl = String(body.url || body.imageUrl || '').trim();
        let fileName = '';
        let imageBase64Saved = null;

        // If Base64 image is uploaded
        if (body.imageBase64 && typeof body.imageBase64 === 'string') {
            let ext = 'png';
            let base64Data = body.imageBase64.trim();
            if (base64Data.includes('base64,')) {
                const parts = base64Data.split('base64,');
                const header = parts[0].toLowerCase();
                base64Data = parts[1].trim();
                if (header.includes('jpeg') || header.includes('jpg')) ext = 'jpg';
                else if (header.includes('webp')) ext = 'webp';
                else if (header.includes('gif')) ext = 'gif';
                else if (header.includes('svg')) ext = 'svg';
                else ext = 'png';
            }
            imageBase64Saved = `data:image/${ext};base64,${base64Data}`;
            const safeName = (name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase().substring(0, 20)) || 'custom';
            fileName = `border_${safeName}_${Date.now()}.${ext}`;

            const imgBuffer = Buffer.from(base64Data, 'base64');
            const mimeType = ext === 'jpg' ? 'image/jpeg' : (ext === 'svg' ? 'image/svg+xml' : `image/${ext}`);
            borderImageBufferCache.set(borderId, { buffer: imgBuffer, mimeType });

            // Also save to local disk if writable as backup
            try {
                ensureBordersOnDisk();
                const bordersDir = path.join(__dirname, '..', 'public', 'borders');
                if (!fs.existsSync(bordersDir)) {
                    try { fs.mkdirSync(bordersDir, { recursive: true }); } catch (e) {}
                }
                fs.writeFileSync(path.join(bordersDir, fileName), imgBuffer);
                fs.writeFileSync(path.join(bordersDir, `${borderId}.${ext}`), imgBuffer);
            } catch (fsErr) {}

            // Persist individual border image row in PostgreSQL so custom_borders.json stays ultra-lightweight (~2KB)
            await storage.writeDataAsync(`border_img_${borderId}`, {
                id: borderId,
                file: fileName,
                imageBase64: imageBase64Saved
            });

            // Always use universal API image endpoint so custom borders work on both Vercel serverless & local containers
            borderUrl = `/api/borders?action=image&id=${borderId}&ext=${ext}`;
        }

        if (!borderUrl) {
            return res.status(400).json({ status: false, message: 'Silakan pilih foto border dari galeri atau masukkan URL gambar.' });
        }

        const borderScale = normalizeScaleValue(body.scale);
        const borderOffsetY = normalizeOffsetYValue(body.offsetY);
        const borderOffsetX = normalizeOffsetXValue(body.offsetX);
        borderUrl = attachScaleParamToUrl(borderUrl, borderScale, borderOffsetY, borderOffsetX);

        const newBorder = {
            id: borderId,
            name: name,
            category: chosenCategory,
            file: fileName,
            url: borderUrl,
            scale: borderScale,
            offsetY: borderOffsetY,
            offsetX: borderOffsetX,
            hasStoredImage: Boolean(imageBase64Saved),
            isVip: true,
            tier: tierMeta.label,
            requiredTier: chosenTier,
            color: body.color || tierMeta.color,
            badge: tierMeta.badge,
            desc: String(body.desc || body.description || `${name} eksklusif. ${tierMeta.desc}`).trim(),
            isCustom: true,
            createdAt: Date.now()
        };

        try {
            const [scalesMap, offsetsMap, offsetsXMap] = await Promise.all([
                getBorderScalesMapAsync(),
                getBorderOffsetsMapAsync(),
                getBorderOffsetsXMapAsync()
            ]);
            scalesMap[borderId] = borderScale;
            offsetsMap[borderId] = borderOffsetY;
            offsetsXMap[borderId] = borderOffsetX;
            await Promise.all([
                storage.writeDataAsync('border_scales.json', scalesMap),
                storage.writeDataAsync('border_offsets.json', offsetsMap),
                storage.writeDataAsync('border_offsets_x.json', offsetsXMap)
            ]);
        } catch (e) {}

        // Force fresh read from PostgreSQL before appending so no borders from other instances are ever lost
        const customList = await getCustomBordersAsync(true);
        customList.push(newBorder);
        await saveCustomBordersAsync(customList);

        const updatedAll = await getAllBordersAsync(false);

        return res.json({
            status: true,
            message: `Border profile "${name}" (Ukuran ${borderScale}%) berhasil ditambahkan & disimpan otomatis!`,
            border: toClientBorder(newBorder),
            borders: toClientBordersList(updatedAll)
        });
    }

    // POST /api/borders?action=update_scale (Admin adjust border size/scale & vertical/horizontal position offsetY/offsetX)
    if (req.method === 'POST' && (action === 'update_scale' || action === 'update_offset')) {
        if (!checkAdminAuth()) {
            return res.status(403).json({ status: false, message: 'Akses ditolak: Hanya admin yang dapat mengatur ukuran/posisi border.' });
        }

        const borderId = String(req.body?.borderId || req.query.borderId || '').trim();
        const hasScaleInput = req.body?.scale !== undefined || req.query.scale !== undefined;
        const hasOffsetYInput = req.body?.offsetY !== undefined || req.query.offsetY !== undefined;
        const hasOffsetXInput = req.body?.offsetX !== undefined || req.query.offsetX !== undefined;

        if (!borderId || borderId === 'none') {
            return res.status(400).json({ status: false, message: 'ID border tidak valid.' });
        }

        try {
            const [rawScalesMap, rawOffsetsMap, rawOffsetsXMap] = await Promise.all([
                getBorderScalesMapAsync(),
                getBorderOffsetsMapAsync(),
                getBorderOffsetsXMapAsync()
            ]);
            const scalesMap = { ...rawScalesMap };
            const offsetsMap = { ...rawOffsetsMap };
            const offsetsXMap = { ...rawOffsetsXMap };

            const customList = getCustomBorders();
            const cIdx = customList.findIndex(b => b.id === borderId);

            const currentScale = scalesMap[borderId] !== undefined
                ? normalizeScaleValue(scalesMap[borderId])
                : (cIdx !== -1 ? normalizeScaleValue(customList[cIdx].scale) : 100);
            const currentOffsetY = offsetsMap[borderId] !== undefined
                ? normalizeOffsetYValue(offsetsMap[borderId])
                : (cIdx !== -1 ? normalizeOffsetYValue(customList[cIdx].offsetY) : 0);
            const currentOffsetX = offsetsXMap[borderId] !== undefined
                ? normalizeOffsetXValue(offsetsXMap[borderId])
                : (cIdx !== -1 ? normalizeOffsetXValue(customList[cIdx].offsetX) : 0);

            const newScale = hasScaleInput
                ? normalizeScaleValue(req.body?.scale !== undefined ? req.body.scale : req.query.scale)
                : currentScale;
            const newOffsetY = hasOffsetYInput
                ? normalizeOffsetYValue(req.body?.offsetY !== undefined ? req.body.offsetY : req.query.offsetY)
                : currentOffsetY;
            const newOffsetX = hasOffsetXInput
                ? normalizeOffsetXValue(req.body?.offsetX !== undefined ? req.body.offsetX : req.query.offsetX)
                : currentOffsetX;

            scalesMap[borderId] = newScale;
            offsetsMap[borderId] = newOffsetY;
            offsetsXMap[borderId] = newOffsetX;

            await Promise.all([
                storage.writeDataAsync('border_scales.json', scalesMap),
                storage.writeDataAsync('border_offsets.json', offsetsMap),
                storage.writeDataAsync('border_offsets_x.json', offsetsXMap)
            ]);

            if (cIdx !== -1) {
                customList[cIdx].scale = newScale;
                customList[cIdx].offsetY = newOffsetY;
                customList[cIdx].offsetX = newOffsetX;
                customList[cIdx].url = attachScaleParamToUrl(customList[cIdx].url, newScale, newOffsetY, newOffsetX);
                lastKnownCustomBorders = customList;
                storage.writeData('custom_borders.json', customList);
            }

            const updatedAll = getAllBorders();
            const updatedBorder = updatedAll.find(b => b.id === borderId);

            // Sync updated borderUrl to any user currently wearing this border in RAM & background DB
            if (updatedBorder && updatedBorder.url) {
                try {
                    const db = await storage.readDataAsync('users.json', { users: [], sessions: {} });
                    let changedUsers = false;
                    if (db && Array.isArray(db.users)) {
                        db.users.forEach(u => {
                            if (u && u.border === borderId) {
                                u.borderUrl = updatedBorder.url;
                                changedUsers = true;
                            }
                        });
                    }
                    if (changedUsers) {
                        await storage.writeDataAsync('users.json', db);
                    }
                } catch (e) {}
            }

            return res.json({
                status: true,
                message: `Pengaturan border "${updatedBorder ? updatedBorder.name : borderId}" disimpan (Ukuran ${newScale}%)`,
                border: toClientBorder(updatedBorder),
                borders: toClientBordersList(updatedAll)
            });
        } catch (e) {
            return res.status(500).json({ status: false, message: 'Gagal menyimpan ukuran/posisi border: ' + e.message });
        }
    }

    // POST /api/borders?action=delete_border (Admin delete custom border)
    if (req.method === 'POST' && action === 'delete_border') {
        if (!checkAdminAuth()) {
            return res.status(403).json({ status: false, message: 'Akses ditolak: Hanya admin yang dapat menghapus border profile.' });
        }

        const borderId = String(req.body?.borderId || req.query.borderId || '').trim();
        if (!borderId) {
            return res.status(400).json({ status: false, message: 'ID border tidak valid.' });
        }

        let customList = await getCustomBordersAsync(true);
        const target = customList.find(b => b.id === borderId);
        if (!target) {
            return res.status(404).json({ status: false, message: 'Border kustom tidak ditemukan atau merupakan border bawaan sistem.' });
        }

        borderImageBufferCache.delete(borderId);

        // Clean up file if local
        try {
            const bordersDir = path.join(__dirname, '..', 'public', 'borders');
            if (target.file) {
                const targetPath = path.join(bordersDir, path.basename(target.file));
                if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            }
            const idPath = path.join(bordersDir, `${borderId}.png`);
            if (fs.existsSync(idPath)) fs.unlinkSync(idPath);
        } catch (e) {}

        // Record deleted border ID so no warm serverless instance can ever resurrect it
        try {
            const deleted = await storage.readDataAsync('deleted_borders.json', []);
            const deletedList = Array.isArray(deleted) ? deleted : [];
            if (!deletedList.includes(borderId)) {
                deletedList.push(borderId);
                await storage.writeDataAsync('deleted_borders.json', deletedList);
            }
        } catch (e) {}

        customList = customList.filter(b => b.id !== borderId);
        lastKnownCustomBorders = customList;
        await saveCustomBordersAsync(customList);

        const updatedAll = [...BORDERS_LIST, ...customList];

        return res.json({
            status: true,
            message: `Border profile "${target.name}" berhasil dihapus.`,
            borders: toClientBordersList(updatedAll)
        });
    }

    // POST /api/borders?action=equip
    if (req.method === 'POST' && action === 'equip') {
        const authHeader = req.headers.authorization || req.headers['x-user-token'] || '';
        const cleanToken = authHeader.replace(/^Bearer\s+/i, '').trim() || req.body?.token;
        const adminToken = req.headers['x-admin-token'] || req.body?.adminToken;
        const isAdminSession = !!(adminToken && adminAuth.isValidToken(adminToken));

        const borderId = String(req.body?.borderId || '').trim();
        const allBorders = await getAllBordersAsync();
        let found = allBorders.find(b => b.id === borderId);

        // Fallback if custom border was passed with client metadata before DB sync
        if (!found && borderId && (borderId.startsWith('border_custom_') || req.body?.borderUrl)) {
            found = {
                id: borderId,
                name: String(req.body?.borderName || 'VIP Border').trim(),
                url: String(req.body?.borderUrl || `/api/borders?action=image&id=${borderId}&ext=png`).trim(),
                isVip: true,
                requiredTier: String(req.body?.requiredTier || '1month').trim(),
                category: String(req.body?.category || 'platinum').trim(),
                tier: String(req.body?.tier || 'VIP').trim(),
                badge: String(req.body?.badge || 'VIP').trim(),
                isCustom: true
            };
        }

        if (!found) {
            return res.status(400).json({ status: false, message: 'Border profil tidak valid' });
        }

        try {
            const db = await storage.readDataAsync('users.json', { users: [], sessions: {} });
            
            let userId = null;
            if (cleanToken) {
                userId = userAuth.getUserIdFromToken(cleanToken, db);
            }
            if (!userId && req.body?.userId) {
                userId = req.body.userId;
            }
            if (!userId && req.body?.email) {
                const targetEmail = String(req.body.email).toLowerCase().trim();
                const matched = (db.users || []).find(u => (u.email && u.email.toLowerCase() === targetEmail) || (u.rawEmail && u.rawEmail.toLowerCase() === targetEmail));
                if (matched) userId = matched.id;
            }
            if (!userId && req.body?.username) {
                const targetUsername = String(req.body.username).toLowerCase().trim();
                const matched = (db.users || []).find(u => u.username && u.username.toLowerCase() === targetUsername);
                if (matched) userId = matched.id;
            }

            if (!userId && !isAdminSession) {
                return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu untuk memasang border profil' });
            }

            let userIndex = (db.users || []).findIndex(u => u && (
                u.id === userId ||
                u.originalId === userId ||
                u.customId === userId ||
                (u.customId && String(u.customId).toLowerCase() === String(userId).toLowerCase())
            ));
            if (userIndex === -1 && isAdminSession) {
                // If admin session but user id not matched, locate master admin user
                userIndex = (db.users || []).findIndex(u => (u.email && u.email.toLowerCase().trim() === 'jrnabil570@gmail.com') || (u.rawEmail && u.rawEmail.toLowerCase().trim() === 'jrnabil570@gmail.com'));
            }

            if (userIndex === -1) {
                return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan di database' });
            }

            const user = db.users[userIndex];
            const isMasterAdmin = ((user.rawEmail || user.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com');

            // Check permissions
            if (found.isVip && !isMasterAdmin) {
                const allowed = canUserEquipBorder(user, found, isAdminSession);
                if (!allowed) {
                    const isVip = !!user.isPremium || !!user.is_premium;
                    if (!isVip) {
                        return res.status(403).json({
                            status: false,
                            isLocked: true,
                            message: `Border ${found.name} khusus Member VIP! Buka paket VIP Anda sekarang.`
                        });
                    } else {
                        return res.status(403).json({
                            status: false,
                            isLocked: true,
                            message: `Border ${found.name} memerlukan Paket VIP ${found.tier || found.badge || 'lebih tinggi'}! Paket Anda saat ini belum membukanya.`
                        });
                    }
                }
            }

            // Simpan border yang dipilih ke seluruh record akun yang sama
            const nextBorderId = found.id === 'none' ? '' : found.id;
            const nextBorderUrl = found.url || '';
            const nextBorderName = found.name;
            const targetEmail = (user.rawEmail || user.email || '').toLowerCase().trim();
            (db.users || []).forEach(u => {
                if (!u) return;
                const uEmail = (u.rawEmail || u.email || '').toLowerCase().trim();
                if (
                    u.id === user.id ||
                    (user.originalId && (u.id === user.originalId || u.originalId === user.originalId)) ||
                    (user.customId && u.customId === user.customId) ||
                    (targetEmail && uEmail === targetEmail)
                ) {
                    u.border = nextBorderId;
                    u.borderUrl = nextBorderUrl;
                    u.borderName = nextBorderName;
                }
            });
            await storage.writeDataAsync('users.json', db);

            // Sync ke userStats di analytics_data.json di background
            try {
                const analyticsData = storage.readData('analytics_data.json', {});
                if (analyticsData && analyticsData.userStats) {
                    const uKey = (user.username || '').toLowerCase();
                    if (analyticsData.userStats[uKey]) {
                        analyticsData.userStats[uKey].border = user.border;
                        analyticsData.userStats[uKey].borderUrl = user.borderUrl;
                        analyticsData.userStats[uKey].borderName = user.borderName;
                        storage.writeData('analytics_data.json', analyticsData);
                    }
                }
            } catch (e) {}

            return res.json({
                status: true,
                message: found.id === 'none' ? 'Border profil dilepas, menggunakan avatar standar.' : `Border ${found.name} berhasil dipasang ke profil Anda!`,
                border: user.border,
                borderUrl: user.borderUrl,
                borderName: user.borderName,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.rawEmail || user.email,
                    avatar: user.avatar,
                    border: user.border,
                    borderUrl: user.borderUrl,
                    borderName: user.borderName,
                    isPremium: isMasterAdmin || !!user.isPremium || !!user.is_premium,
                    vipTier: user.vipTier || (isMasterAdmin ? 'permanent' : 'none'),
                    vipExpiresAt: user.vipExpiresAt || null
                }
            });
        } catch (e) {
            console.error('[BORDERS] Equip error:', e);
            return res.status(500).json({ status: false, message: 'Gagal memperbarui border profil: ' + e.message });
        }
    }

    return res.status(405).json({ status: false, message: 'Method not allowed' });
};
