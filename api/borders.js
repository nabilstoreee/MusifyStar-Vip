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

function attachScaleParamToUrl(url, scale) {
    if (!url || typeof url !== 'string') return '';
    const s = normalizeScaleValue(scale);
    // Remove any existing s= parameter first
    let clean = url.replace(/([?&])s=\d+(&?)/g, (match, p1, p2) => (p2 ? p1 : '')).replace(/[?&]$/, '');
    if (s === 100) return clean;
    const sep = clean.includes('?') ? '&' : '?';
    return `${clean}${sep}s=${s}`;
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

function deduplicateAndNormalizeCustomBorders(rawList, deletedIdsSet = new Set(), scalesMap = {}) {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set();
    const result = [];
    for (const item of rawList) {
        if (!item || !item.id || seen.has(item.id) || deletedIdsSet.has(item.id)) continue;
        seen.add(item.id);
        const resolvedScale = normalizeScaleValue(scalesMap[item.id] !== undefined ? scalesMap[item.id] : item.scale);
        // Normalize custom border URL so it works across both Vercel serverless and local containers
        let normalizedUrl = item.url || '';
        if (item.isCustom && item.imageBase64 && (!normalizedUrl || normalizedUrl.startsWith('/borders/border_'))) {
            let ext = 'png';
            if (item.file && item.file.includes('.')) {
                ext = item.file.split('.').pop().toLowerCase() || 'png';
            }
            normalizedUrl = `/api/borders?action=image&id=${item.id}&ext=${ext}`;
        }
        normalizedUrl = attachScaleParamToUrl(normalizedUrl, resolvedScale);
        result.push({
            ...item,
            scale: resolvedScale,
            url: normalizedUrl,
            isCustom: true
        });
    }
    return result;
}

function getCustomBorders() {
    try {
        const custom = storage.readData('custom_borders.json', []);
        const deleted = storage.readData('deleted_borders.json', []);
        const scalesMap = getBorderScalesMap();
        const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);
        return deduplicateAndNormalizeCustomBorders(custom, deletedSet, scalesMap);
    } catch (e) {
        return [];
    }
}

async function getCustomBordersAsync(forceFresh = false) {
    try {
        const memCustom = storage.readData('custom_borders.json', []);
        const deleted = await storage.readDataAsync('deleted_borders.json', []);
        const scalesMap = await getBorderScalesMapAsync();
        const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);

        let dbCustom = null;
        if (forceFresh && typeof storage.fetchFromPostgres === 'function') {
            dbCustom = await storage.fetchFromPostgres('custom_borders.json');
        }
        if (!Array.isArray(dbCustom)) {
            dbCustom = await storage.readDataAsync('custom_borders.json', []);
        }

        // Merge in-memory items first so recently updated scales or borders are never overwritten by stale DB reads
        const combined = [
            ...(Array.isArray(memCustom) ? memCustom : []),
            ...(Array.isArray(dbCustom) ? dbCustom : [])
        ];
        return deduplicateAndNormalizeCustomBorders(combined, deletedSet, scalesMap);
    } catch (e) {
        return [];
    }
}

async function saveCustomBordersAsync(list) {
    try {
        const deleted = await storage.readDataAsync('deleted_borders.json', []);
        const scalesMap = await getBorderScalesMapAsync();
        const deletedSet = new Set(Array.isArray(deleted) ? deleted : []);
        const cleanList = deduplicateAndNormalizeCustomBorders(list, deletedSet, scalesMap);
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

function applyScalesToSystemBorders(scalesMap = {}) {
    return BORDERS_LIST.map(b => {
        if (!b || b.id === 'none') return { ...b, scale: 100 };
        const s = normalizeScaleValue(scalesMap[b.id] !== undefined ? scalesMap[b.id] : b.scale);
        return {
            ...b,
            scale: s,
            url: attachScaleParamToUrl(b.url, s)
        };
    });
}

function getAllBorders() {
    const scalesMap = getBorderScalesMap();
    const custom = getCustomBorders();
    return [...applyScalesToSystemBorders(scalesMap), ...custom];
}

async function getAllBordersAsync(forceFresh = false) {
    const scalesMap = await getBorderScalesMapAsync();
    const custom = await getCustomBordersAsync(forceFresh);
    return [...applyScalesToSystemBorders(scalesMap), ...custom];
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

            // 1. Check in-memory borders first (0ms latency for immutable custom border IDs)
            let found = getAllBorders().find(b => (borderId && b.id === borderId) || (fileName && b.file === fileName));

            // 2. If not found in RAM (e.g. added on another serverless instance), fetch fresh from PostgreSQL
            if (!found || (!found.imageBase64 && found.isCustom)) {
                const all = await getAllBordersAsync(true);
                found = all.find(b => (borderId && b.id === borderId) || (fileName && b.file === fileName));
            }

            if (found) {
                if (found.imageBase64) {
                    let cleanBase64 = found.imageBase64;
                    let mimeType = 'image/png';
                    if (cleanBase64.includes('base64,')) {
                        const parts = cleanBase64.split('base64,');
                        const header = parts[0].toLowerCase();
                        cleanBase64 = parts[1].trim();
                        if (header.includes('jpeg') || header.includes('jpg')) mimeType = 'image/jpeg';
                        else if (header.includes('webp')) mimeType = 'image/webp';
                        else if (header.includes('gif')) mimeType = 'image/gif';
                        else if (header.includes('svg')) mimeType = 'image/svg+xml';
                    }
                    const buffer = Buffer.from(cleanBase64, 'base64');
                    res.setHeader('Content-Type', mimeType);
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    return res.status(200).send(buffer);
                }

                // Check static file on disk if exists
                if (found.file) {
                    const localPath = path.join(__dirname, '..', 'public', 'borders', found.file);
                    if (fs.existsSync(localPath)) {
                        const ext = path.extname(found.file).toLowerCase().replace('.', '') || 'png';
                        const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
                        res.setHeader('Content-Type', mime);
                        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                        return res.status(200).send(fs.readFileSync(localPath));
                    }
                }

                if (found.url && found.url.startsWith('data:image')) {
                    const parts = found.url.split('base64,');
                    const buffer = Buffer.from(parts[1], 'base64');
                    res.setHeader('Content-Type', 'image/png');
                    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                    return res.status(200).send(buffer);
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
        const all = await getAllBordersAsync(false);
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

            // Also save to local disk if writable as backup
            try {
                ensureBordersOnDisk();
                const bordersDir = path.join(__dirname, '..', 'public', 'borders');
                if (!fs.existsSync(bordersDir)) {
                    try { fs.mkdirSync(bordersDir, { recursive: true }); } catch (e) {}
                }
                const destPath = path.join(bordersDir, fileName);
                fs.writeFileSync(destPath, Buffer.from(base64Data, 'base64'));
            } catch (fsErr) {}

            // Always use universal API image endpoint so custom borders work on both Vercel serverless & local containers
            borderUrl = `/api/borders?action=image&id=${borderId}&ext=${ext}`;
        }

        if (!borderUrl) {
            return res.status(400).json({ status: false, message: 'Silakan pilih foto border dari galeri atau masukkan URL gambar.' });
        }

        const borderScale = normalizeScaleValue(body.scale);
        borderUrl = attachScaleParamToUrl(borderUrl, borderScale);

        const newBorder = {
            id: borderId,
            name: name,
            category: chosenCategory,
            file: fileName,
            url: borderUrl,
            scale: borderScale,
            imageBase64: imageBase64Saved,
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
            const scalesMap = await getBorderScalesMapAsync();
            scalesMap[borderId] = borderScale;
            await storage.writeDataAsync('border_scales.json', scalesMap);
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

    // POST /api/borders?action=update_scale (Admin adjust border size/scale)
    if (req.method === 'POST' && action === 'update_scale') {
        if (!checkAdminAuth()) {
            return res.status(403).json({ status: false, message: 'Akses ditolak: Hanya admin yang dapat mengatur ukuran border.' });
        }

        const borderId = String(req.body?.borderId || req.query.borderId || '').trim();
        const newScale = normalizeScaleValue(req.body?.scale !== undefined ? req.body.scale : req.query.scale);

        if (!borderId || borderId === 'none') {
            return res.status(400).json({ status: false, message: 'ID border tidak valid.' });
        }

        try {
            const scalesMap = await getBorderScalesMapAsync();
            scalesMap[borderId] = newScale;
            await storage.writeDataAsync('border_scales.json', scalesMap);

            const customList = await getCustomBordersAsync(true);
            const cIdx = customList.findIndex(b => b.id === borderId);
            if (cIdx !== -1) {
                customList[cIdx].scale = newScale;
                customList[cIdx].url = attachScaleParamToUrl(customList[cIdx].url, newScale);
                await saveCustomBordersAsync(customList);
            }

            const updatedAll = await getAllBordersAsync(false);
            const updatedBorder = updatedAll.find(b => b.id === borderId);

            // Sync updated borderUrl to any user currently wearing this border
            if (updatedBorder && updatedBorder.url) {
                try {
                    const db = await storage.readDataAsync('users.json', { users: [], sessions: {} });
                    let changedUsers = false;
                    if (Array.isArray(db.users)) {
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
                message: `Ukuran border "${updatedBorder ? updatedBorder.name : borderId}" disimpan ke ${newScale}%`,
                border: toClientBorder(updatedBorder),
                borders: toClientBordersList(updatedAll)
            });
        } catch (e) {
            return res.status(500).json({ status: false, message: 'Gagal menyimpan ukuran border: ' + e.message });
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

        // Clean up file if local
        if (target.file) {
            try {
                const targetPath = path.join(__dirname, '..', 'public', 'borders', target.file);
                if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            } catch (e) {}
        }

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
        const found = allBorders.find(b => b.id === borderId);
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

            // Sync ke userStats di analytics_data.json untuk konsistensi instan
            try {
                const analyticsData = storage.readData('analytics_data.json', {});
                if (analyticsData && analyticsData.userStats) {
                    const uKey = (user.username || '').toLowerCase();
                    if (analyticsData.userStats[uKey]) {
                        analyticsData.userStats[uKey].border = user.border;
                        analyticsData.userStats[uKey].borderUrl = user.borderUrl;
                        analyticsData.userStats[uKey].borderName = user.borderName;
                        await storage.writeDataAsync('analytics_data.json', analyticsData);
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
