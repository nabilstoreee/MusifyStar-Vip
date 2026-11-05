const fs = require('fs');
const path = require('path');
const adminAuth = require('./admin-auth.js');
const storage = require('./storage.js');

const PAYMENT_CONFIG_FILE = '.payment_config.json';

const DEFAULT_VIP_PACKAGES = [
    {
        id: 'pkg_1week',
        name: 'Paket Mingguan',
        duration: '7 Hari',
        price: 7000,
        originalPrice: 10000,
        discount: 'Hemat 30%',
        badge: 'Trial VIP',
        popular: false,
        active: true
    },
    {
        id: 'pkg_1month',
        name: 'Paket 1 Bulan',
        duration: '30 Hari',
        price: 19000,
        originalPrice: 35000,
        discount: 'Diskon 45%',
        badge: 'Platinum & Master',
        popular: true,
        active: true
    },
    {
        id: 'pkg_5months',
        name: 'Paket 5 Bulan',
        duration: '150 Hari',
        price: 69000,
        originalPrice: 150000,
        discount: 'Hemat 55%',
        badge: 'Legend & Immortal',
        popular: false,
        active: true
    },
    {
        id: 'pkg_permanent',
        name: 'Paket Permanen (Lifetime)',
        duration: 'Permanen (Selamanya)',
        price: 99000,
        originalPrice: 250000,
        discount: 'Hemat 60%',
        badge: 'Semua Border VIP',
        popular: false,
        active: true
    }
];

const DEFAULT_VIP_BENEFITS = [
    {
        id: 'ben_home_theme',
        number: 1,
        title: 'Bebas Semua Tema Home Screen',
        desc: 'Akses Playful, Neon, Spotify, Apple (Gratis hanya Classic)',
        icon: 'palette'
    },
    {
        id: 'ben_navbar_theme',
        number: 2,
        title: 'Bebas Semua Tema Nav Bar',
        desc: 'Akses Liquid Glass, Spotify, Apple, Neon, New Classic (Gratis hanya Classic)',
        icon: 'layout'
    },
    {
        id: 'ben_dynamic_island',
        number: 3,
        title: 'Dynamic Island Mini Player',
        desc: 'Island melayang interaktif di atas layar ala iOS saat musik diputar',
        icon: 'music'
    },
    {
        id: 'ben_chat',
        number: 4,
        title: 'IceBeats Chat & Kirim Lagu',
        desc: 'Ngobrol bersama teman dan bagikan musik favorit',
        icon: 'message-square'
    },
    {
        id: 'ben_borders',
        number: 5,
        title: 'Semua Border Animasi Profil Master',
        desc: 'Royal Crown, Crimson Wings, Flame Ring & Golden Shield',
        icon: 'layers'
    }
];

const crypto = require('crypto');
const USER_JWT_SECRET = process.env.USER_JWT_SECRET || 'musifystar_user_secret_key_v2_sign_98741';

const DEFAULT_EWALLETS = {
    gopay: {
        enabled: true,
        number: '081234567890',
        holder: 'NABIL (MusifyStar Official)',
        link: ''
    },
    dana: {
        enabled: true,
        number: '081234567890',
        holder: 'NABIL (MusifyStar Official)',
        link: ''
    },
    ovo: {
        enabled: true,
        number: '081234567890',
        holder: 'NABIL (MusifyStar Official)',
        link: ''
    }
};

const DEFAULT_DIAMOND_PACKAGES = [
    { id: 'dm_55', diamonds: 55, bonus: 10, price: 1800, hot: false, badgeColor: 'purple', iconType: 'single' },
    { id: 'dm_435', diamonds: 435, bonus: 115, price: 14000, hot: false, badgeColor: 'purple', iconType: 'double' },
    { id: 'dm_1310', diamonds: 1310, bonus: 340, price: 41927, hot: false, badgeColor: 'purple', iconType: 'triple' },
    { id: 'dm_3210', diamonds: 3210, bonus: 860, price: 102375, hot: false, badgeColor: 'purple', iconType: 'pile' },
    { id: 'dm_15380', diamonds: 15380, bonus: 4620, price: 490000, hot: false, badgeColor: 'purple', iconType: 'pile_lg' },
    { id: 'dm_36920', diamonds: 36920, bonus: 11080, price: 1176000, hot: true, badgeColor: 'purple', iconType: 'chest' },
    { id: 'dm_112300', diamonds: 112300, bonus: 33700, price: 3577000, hot: false, badgeColor: 'gold', iconType: 'chest_gold' }
];

const DEFAULT_DIAMOND_STAR_VIP_PACKAGES = [
    { id: 'star_7days', title: 'VIP 7 Hari (Border Platinum)', desc: 'Akses penuh fitur VIP + Border Platinum selama 7 hari', cost: 250, days: 7, tier: '1month', border: 'border_platinum', borderName: 'Platinum', borderUrl: '/borders/Platinum.png', enabled: true },
    { id: 'star_1month', title: 'VIP 1 Bulan (Border Platinum & Master)', desc: 'Akses penuh fitur VIP + Border Platinum & Master selama 30 hari', cost: 550, days: 30, tier: '1month', border: 'border_master', borderName: 'Master', borderUrl: '/borders/Master.png', enabled: true },
    { id: 'star_2months', title: 'VIP 2 Bulan (+Border Legend)', desc: 'Akses penuh fitur VIP + Border Legend selama 60 hari', cost: 1650, days: 60, tier: '2months', border: 'border_legend', borderName: 'Legend', borderUrl: '/borders/Legend.png', enabled: true },
    { id: 'star_5months', title: 'VIP 5 Bulan (+Border Immortal)', desc: 'Akses penuh fitur VIP + Border Immortal selama 150 hari', cost: 4000, days: 150, tier: '5months', border: 'border_immortal', borderName: 'Immortal', borderUrl: '/borders/Imortal.png', enabled: true },
    { id: 'star_permanent', title: 'VIP Permanen (Semua Border & Fitur Selamanya)', desc: 'Buka semua Border eksklusif & fitur VIP selamanya', cost: 15000, days: 0, tier: 'permanent', border: 'border_immortal', borderName: 'Immortal', borderUrl: '/borders/Imortal.png', enabled: true }
];

const DEFAULT_DIAMOND_SHOP_CUSTOM_IDS = [
    { id: 'dmid_88888888', customId: '88888888', title: 'ID Sultan Hoki 8x', desc: 'Musify ID Langka Angka Kembar 8', cost: 1200, days: 0, isPermanent: true, enabled: true },
    { id: 'dmid_99999999', customId: '99999999', title: 'ID King Immortal 9x', desc: 'Musify ID Eksklusif Angka Kembar 9', cost: 1500, days: 0, isPermanent: true, enabled: true },
    { id: 'dmid_77777777', customId: '77777777', title: 'ID Lucky Seven 7x', desc: 'Musify ID Spesial Jackpot 77777777', cost: 950, days: 0, isPermanent: true, enabled: true },
    { id: 'dmid_12345678', customId: '12345678', title: 'ID Urut Cantik 1-8', desc: 'Musify ID Cantik Berurutan', cost: 650, days: 30, isPermanent: false, enabled: true }
];

const DEFAULT_DIAMOND_SHOP_BORDERS = [
    { id: 'dmbd_platinum', borderId: 'border_platinum', name: 'Border Platinum VIP', url: '/borders/Platinum.png', badge: 'PLATINUM', cost: 300, days: 0, isPermanent: true, enabled: true },
    { id: 'dmbd_master', borderId: 'border_master', name: 'Border Master VIP', url: '/borders/Master.png', badge: 'MASTER', cost: 650, days: 0, isPermanent: true, enabled: true },
    { id: 'dmbd_legend', borderId: 'border_legend', name: 'Border Legend VIP', url: '/borders/Legend.png', badge: 'LEGEND', cost: 1400, days: 0, isPermanent: true, enabled: true },
    { id: 'dmbd_immortal', borderId: 'border_immortal', name: 'Border Immortal Sultan', url: '/borders/Imortal.png', badge: 'IMMORTAL', cost: 3200, days: 0, isPermanent: true, enabled: true }
];

const DEFAULT_VIP_TRIAL_CONFIG = {
    enabled: true,
    durationDays: 7,
    borderAccess: 'platinum', // 'platinum' | 'platinum_master' | 'platinum_master_legend' | 'all' | 'none'
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
    },
    autoSendEmailInvoice: true,
    invoicePackageId: 'pkg_1month',
    invoicePackageName: 'Paket 1 Bulan VIP',
    invoiceAmount: 10000,
    invoiceDuration: '30 Hari',
    invoiceNote: 'Masa aktif Percobaan VIP (Free Trial) Anda telah berakhir. Silakan selesaikan pembayaran tagihan melalui QRIS atau E-Wallet (GoPay / DANA / OVO) untuk kembali mengaktifkan akses penuh VIP MusifyStar.'
};

const DEFAULT_REWARDED_AD_CONFIG = {
    enabled: true,
    adsenseClientId: 'ca-pub-4386441636957031',
    adsenseSlotId: '',
    rewardDiamonds: 8,
    watchDurationSec: 15,
    maxClaimsPerDay: 5,
    customVideoUrl: '',
    customClickUrl: ''
};

const DEFAULT_PAYMENT_CONFIG = {
    qrisUrl: '/qris.png',
    qrisFilename: 'QRIS-MusifyStar-Nabil.png',
    qrisHolder: 'NABIL (MusifyStar Official)',
    adminWhatsapp: '6281234567890',
    ewalletsEnabled: true,
    ewallets: DEFAULT_EWALLETS,
    diamondPackages: DEFAULT_DIAMOND_PACKAGES,
    diamondStarVipPackages: DEFAULT_DIAMOND_STAR_VIP_PACKAGES,
    diamondShopCustomIds: DEFAULT_DIAMOND_SHOP_CUSTOM_IDS,
    diamondShopBorders: DEFAULT_DIAMOND_SHOP_BORDERS,
    rewardedAdConfig: DEFAULT_REWARDED_AD_CONFIG,
    vipTrialConfig: DEFAULT_VIP_TRIAL_CONFIG,
    accounts: [],
    packages: DEFAULT_VIP_PACKAGES,
    benefits: DEFAULT_VIP_BENEFITS,
    showAccounts: true,
    title: 'MusifyStar VIP Membership',
    description: 'Upgrade akun Anda sekarang untuk menikmati akses tak terbatas ke semua avatar, border eksklusif, serta audio Ultra HD bebas iklan.',
    note: 'Pembayaran instan didukung semua aplikasi Bank & E-Wallet (BCA, Mandiri, BRI, BNI, Dana, GoPay, OVO, ShopeePay, LinkAja).',
    updatedAt: new Date().toISOString()
};

async function isAdminAuthorized(req) {
    const adminToken = req.headers['x-admin-token'] || req.query.token || '';
    if (adminToken && adminAuth.isValidToken(adminToken)) {
        return true;
    }

    const rawAuth = req.headers.authorization || adminToken || '';
    const cleanToken = String(rawAuth).replace(/^Bearer\s+/i, '').trim();
    if (!cleanToken) return false;

    if (adminAuth.isValidToken(cleanToken)) {
        return true;
    }

    try {
        const usersData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
        let userId = null;

        if (cleanToken.startsWith('usr_')) {
            const parts = cleanToken.slice(4).split('.');
            if (parts.length === 2) {
                const [payloadStr, signature] = parts;
                const expectedSig = crypto.createHmac('sha256', USER_JWT_SECRET).update(payloadStr).digest('base64url');
                if (signature === expectedSig) {
                    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
                    if (payload && payload.uid && (!payload.exp || Math.floor(Date.now() / 1000) < payload.exp)) {
                        userId = typeof payload.uid === 'object' ? (payload.uid.id || payload.uid.userId) : String(payload.uid);
                    }
                }
            }
        }

        if (!userId && usersData.sessions && usersData.sessions[cleanToken]) {
            const s = usersData.sessions[cleanToken];
            userId = typeof s.userId === 'object' ? (s.userId.id || s.userId.userId) : String(s.userId);
        }

        if (userId && Array.isArray(usersData.users)) {
            const user = usersData.users.find(u => u && String(u.id || u.userId) === String(userId));
            if (user) {
                const email = String(user.email || user.rawEmail || '').toLowerCase().trim();
                if (user.role === 'admin' || email === 'jrnabil570@gmail.com') {
                    return true;
                }
            }
        }
    } catch (e) {
        console.error('[PAYMENT_CONFIG] Admin auth check error:', e.message);
    }

    return false;
}

async function getPaymentConfig() {
    try {
        const data = await storage.readDataAsync(PAYMENT_CONFIG_FILE, DEFAULT_PAYMENT_CONFIG);
        if (data && typeof data === 'object') {
            const cleanedAccounts = Array.isArray(data.accounts)
                ? data.accounts.filter(acc => {
                    if (!acc) return false;
                    const num = String(acc.accountNumber || '').trim();
                    if (num === '9012 3456 7890' || num === '0812 3456 7890') return false;
                    return Boolean(acc.bankName || acc.accountNumber);
                })
                : [];
            const rawEw = data.ewallets && typeof data.ewallets === 'object' ? data.ewallets : {};
            const mergedEwallets = {
                gopay: {
                    enabled: rawEw.gopay && rawEw.gopay.enabled !== undefined ? Boolean(rawEw.gopay.enabled) : DEFAULT_EWALLETS.gopay.enabled,
                    number: (rawEw.gopay && typeof rawEw.gopay.number === 'string') ? rawEw.gopay.number.trim() : DEFAULT_EWALLETS.gopay.number,
                    holder: (rawEw.gopay && typeof rawEw.gopay.holder === 'string') ? rawEw.gopay.holder.trim() : (data.qrisHolder || DEFAULT_EWALLETS.gopay.holder),
                    link: (rawEw.gopay && typeof rawEw.gopay.link === 'string') ? rawEw.gopay.link.trim() : ''
                },
                dana: {
                    enabled: rawEw.dana && rawEw.dana.enabled !== undefined ? Boolean(rawEw.dana.enabled) : DEFAULT_EWALLETS.dana.enabled,
                    number: (rawEw.dana && typeof rawEw.dana.number === 'string') ? rawEw.dana.number.trim() : DEFAULT_EWALLETS.dana.number,
                    holder: (rawEw.dana && typeof rawEw.dana.holder === 'string') ? rawEw.dana.holder.trim() : (data.qrisHolder || DEFAULT_EWALLETS.dana.holder),
                    link: (rawEw.dana && typeof rawEw.dana.link === 'string') ? rawEw.dana.link.trim() : ''
                },
                ovo: {
                    enabled: rawEw.ovo && rawEw.ovo.enabled !== undefined ? Boolean(rawEw.ovo.enabled) : DEFAULT_EWALLETS.ovo.enabled,
                    number: (rawEw.ovo && typeof rawEw.ovo.number === 'string') ? rawEw.ovo.number.trim() : DEFAULT_EWALLETS.ovo.number,
                    holder: (rawEw.ovo && typeof rawEw.ovo.holder === 'string') ? rawEw.ovo.holder.trim() : (data.qrisHolder || DEFAULT_EWALLETS.ovo.holder),
                    link: (rawEw.ovo && typeof rawEw.ovo.link === 'string') ? rawEw.ovo.link.trim() : ''
                }
            };
            const rawTrial = data.vipTrialConfig && typeof data.vipTrialConfig === 'object' ? data.vipTrialConfig : {};
            const rawFeat = rawTrial.allowedFeatures && typeof rawTrial.allowedFeatures === 'object' ? rawTrial.allowedFeatures : {};
            const mergedTrialConfig = {
                enabled: rawTrial.enabled !== undefined ? Boolean(rawTrial.enabled) : DEFAULT_VIP_TRIAL_CONFIG.enabled,
                durationDays: Math.max(1, Math.min(3650, Number(rawTrial.durationDays) || DEFAULT_VIP_TRIAL_CONFIG.durationDays)),
                borderAccess: ['platinum', 'master', 'legend', 'immortal', 'permanent', 'platinum_master', 'platinum_master_legend', 'platinum_master_legend_immortal', 'platinum_master_legend_immortal_permanent', 'all', 'none'].includes(String(rawTrial.borderAccess || '').toLowerCase())
                    ? String(rawTrial.borderAccess).toLowerCase()
                    : DEFAULT_VIP_TRIAL_CONFIG.borderAccess,
                allowedFeatures: {
                    liquidGlassIos27: rawFeat.liquidGlassIos27 !== undefined ? Boolean(rawFeat.liquidGlassIos27) : true,
                    nameGlow: rawFeat.nameGlow !== undefined ? Boolean(rawFeat.nameGlow) : true,
                    customId: rawFeat.customId !== undefined ? Boolean(rawFeat.customId) : true,
                    vipAvatar: rawFeat.vipAvatar !== undefined ? Boolean(rawFeat.vipAvatar) : true,
                    dynamicIsland: rawFeat.dynamicIsland !== undefined ? Boolean(rawFeat.dynamicIsland) : true,
                    highAudio: rawFeat.highAudio !== undefined ? Boolean(rawFeat.highAudio) : true,
                    backgroundPlay: rawFeat.backgroundPlay !== undefined ? Boolean(rawFeat.backgroundPlay) : true,
                    keepScreenAwake: rawFeat.keepScreenAwake !== undefined ? Boolean(rawFeat.keepScreenAwake) : true,
                    swipeGestures: rawFeat.swipeGestures !== undefined ? Boolean(rawFeat.swipeGestures) : true,
                    vipSultanBadge: rawFeat.vipSultanBadge !== undefined ? Boolean(rawFeat.vipSultanBadge) : true
                },
                autoSendEmailInvoice: rawTrial.autoSendEmailInvoice !== undefined ? Boolean(rawTrial.autoSendEmailInvoice) : true,
                invoicePackageId: String(rawTrial.invoicePackageId || DEFAULT_VIP_TRIAL_CONFIG.invoicePackageId).trim(),
                invoicePackageName: String(rawTrial.invoicePackageName || DEFAULT_VIP_TRIAL_CONFIG.invoicePackageName).trim(),
                invoiceAmount: Math.max(1000, Number(rawTrial.invoiceAmount) || DEFAULT_VIP_TRIAL_CONFIG.invoiceAmount),
                invoiceDuration: String(rawTrial.invoiceDuration || DEFAULT_VIP_TRIAL_CONFIG.invoiceDuration).trim(),
                invoiceNote: String(rawTrial.invoiceNote || DEFAULT_VIP_TRIAL_CONFIG.invoiceNote).trim()
            };
            // Otomatis sambungkan semua 35+ Border dari /api/borders agar Admin tinggal centang/atur harga
            let mergedShopBorders = Array.isArray(data.diamondShopBorders) && data.diamondShopBorders.length
                ? JSON.parse(JSON.stringify(data.diamondShopBorders))
                : JSON.parse(JSON.stringify(DEFAULT_DIAMOND_SHOP_BORDERS));
            try {
                const bordersApi = require('./borders.js');
                if (bordersApi && typeof bordersApi.getAllBordersAsync === 'function') {
                    const allSystemBorders = await bordersApi.getAllBordersAsync(false);
                    if (Array.isArray(allSystemBorders)) {
                        for (const sysB of allSystemBorders) {
                            if (!sysB || !sysB.id || sysB.id === 'none') continue;
                            const existingIdx = mergedShopBorders.findIndex(x => x && (String(x.borderId) === String(sysB.id) || String(x.id) === String(sysB.id)));
                            if (existingIdx === -1) {
                                const catLow = String(sysB.category || sysB.requiredTier || '').toLowerCase();
                                let defaultCost = 450;
                                if (catLow === 'platinum' || catLow === '1month') defaultCost = 300;
                                else if (catLow === 'master') defaultCost = 650;
                                else if (catLow === 'legend' || catLow === '2months') defaultCost = 1400;
                                else if (catLow === 'immortal' || catLow === '5months') defaultCost = 3200;
                                else if (catLow === 'permanent') defaultCost = 5000;
                                mergedShopBorders.push({
                                    id: 'dmbd_' + sysB.id,
                                    borderId: String(sysB.id),
                                    name: sysB.name || 'Border Profil',
                                    url: sysB.url || ('/borders/' + (sysB.file || 'Platinum.png')),
                                    file: sysB.file || '',
                                    scale: sysB.scale || 100,
                                    offsetY: sysB.offsetY || 0,
                                    offsetX: sysB.offsetX || 0,
                                    badge: String(sysB.badge || sysB.category || 'EKSKLUSIF').toUpperCase(),
                                    cost: defaultCost,
                                    days: 0,
                                    isPermanent: true,
                                    enabled: true
                                });
                            } else {
                                if (sysB.url) mergedShopBorders[existingIdx].url = sysB.url;
                                if (sysB.file) mergedShopBorders[existingIdx].file = sysB.file;
                                if (sysB.scale !== undefined) mergedShopBorders[existingIdx].scale = sysB.scale;
                                if (sysB.offsetY !== undefined) mergedShopBorders[existingIdx].offsetY = sysB.offsetY;
                                if (sysB.offsetX !== undefined) mergedShopBorders[existingIdx].offsetX = sysB.offsetX;
                            }
                        }
                    }
                }
            } catch (bErr) {
                console.warn('[PAYMENT_CONFIG] Auto-merge borders notice:', bErr.message);
            }

            const rawRewardedAd = (data.rewardedAdConfig && typeof data.rewardedAdConfig === 'object') ? data.rewardedAdConfig : {};
            const mergedRewardedAdConfig = {
                enabled: rawRewardedAd.enabled !== undefined ? Boolean(rawRewardedAd.enabled) : true,
                adsenseClientId: (rawRewardedAd.adsenseClientId && String(rawRewardedAd.adsenseClientId).trim()) ? String(rawRewardedAd.adsenseClientId).trim() : DEFAULT_REWARDED_AD_CONFIG.adsenseClientId,
                adsenseSlotId: rawRewardedAd.adsenseSlotId !== undefined ? String(rawRewardedAd.adsenseSlotId).trim() : DEFAULT_REWARDED_AD_CONFIG.adsenseSlotId,
                rewardDiamonds: Math.max(1, Number(rawRewardedAd.rewardDiamonds) || DEFAULT_REWARDED_AD_CONFIG.rewardDiamonds || 8),
                watchDurationSec: Math.max(5, Math.min(60, Number(rawRewardedAd.watchDurationSec) || DEFAULT_REWARDED_AD_CONFIG.watchDurationSec || 15)),
                maxClaimsPerDay: Math.max(1, Number(rawRewardedAd.maxClaimsPerDay) || DEFAULT_REWARDED_AD_CONFIG.maxClaimsPerDay || 5),
                customVideoUrl: rawRewardedAd.customVideoUrl !== undefined ? String(rawRewardedAd.customVideoUrl).trim() : '',
                customClickUrl: rawRewardedAd.customClickUrl !== undefined ? String(rawRewardedAd.customClickUrl).trim() : ''
            };

            return {
                qrisUrl: data.qrisUrl || (data.qrisBase64 ? data.qrisBase64 : '/qris.png'),
                qrisBase64: data.qrisBase64 || null,
                qrisFilename: data.qrisFilename || 'QRIS-MusifyStar-Nabil.png',
                qrisHolder: data.qrisHolder || 'NABIL (MusifyStar Official)',
                adminWhatsapp: data.adminWhatsapp || DEFAULT_PAYMENT_CONFIG.adminWhatsapp || '6281234567890',
                ewalletsEnabled: data.ewalletsEnabled !== undefined ? Boolean(data.ewalletsEnabled) : true,
                ewallets: mergedEwallets,
                diamondPackages: Array.isArray(data.diamondPackages) && data.diamondPackages.length ? data.diamondPackages : DEFAULT_DIAMOND_PACKAGES,
                diamondStarVipPackages: Array.isArray(data.diamondStarVipPackages) && data.diamondStarVipPackages.length ? data.diamondStarVipPackages : DEFAULT_DIAMOND_STAR_VIP_PACKAGES,
                diamondShopCustomIds: Array.isArray(data.diamondShopCustomIds) ? data.diamondShopCustomIds : DEFAULT_DIAMOND_SHOP_CUSTOM_IDS,
                diamondShopBorders: mergedShopBorders,
                rewardedAdConfig: mergedRewardedAdConfig,
                vipTrialConfig: mergedTrialConfig,
                accounts: cleanedAccounts,
                showAccounts: data.showAccounts !== false,
                packages: Array.isArray(data.packages) && data.packages.length ? data.packages : DEFAULT_VIP_PACKAGES,
                benefits: Array.isArray(data.benefits) && data.benefits.length ? data.benefits : DEFAULT_VIP_BENEFITS,
                title: data.title || DEFAULT_PAYMENT_CONFIG.title,
                description: data.description || DEFAULT_PAYMENT_CONFIG.description,
                note: data.note || DEFAULT_PAYMENT_CONFIG.note,
                updatedAt: data.updatedAt || new Date().toISOString()
            };
        }
    } catch (e) {
        console.error('[PAYMENT_CONFIG] Error reading config:', e.message);
    }
    return DEFAULT_PAYMENT_CONFIG;
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const action = req.query.action || (req.body && req.body.action);

    // GET /api/payment-config
    if (req.method === 'GET' || action === 'get') {
        const config = await getPaymentConfig();
        return res.json({ status: true, config });
    }

    // POST /api/payment-config?action=submit_confirmation (User kirim konfirmasi pembayaran VIP - Wajib Verifikasi Admin untuk Aktivasi VIP)
    if (req.method === 'POST' && action === 'submit_confirmation') {
        const body = req.body || {};
        const isAdminCaller = await isAdminAuthorized(req);
        const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || body.token;
        let username = body.username || 'Pengguna MusifyStar';
        let userEmail = body.email || '';
        let userId = body.userId || '';

        try {
            let foundUser = null;
            const usersData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
            const userAuth = require('./user-auth.js');
            const Security = require('./security.js');
            
            if (token) {
                const resolvedUid = userAuth.getUserIdFromToken(token, usersData);
                if (resolvedUid) {
                    foundUser = (usersData.users || []).find(x => x && (String(x.id) === String(resolvedUid) || String(x.originalId) === String(resolvedUid)));
                }
            }
            if (!foundUser && isAdminCaller && userId) {
                foundUser = (usersData.users || []).find(x => x && (String(x.id) === String(userId) || String(x.originalId) === String(userId)));
            }

            if (!foundUser && !isAdminCaller) {
                return res.status(401).json({ status: false, message: 'Sesi login tidak valid. Silakan login terlebih dahulu.' });
            }

            if (foundUser) {
                username = foundUser.username;
                userEmail = foundUser.rawEmail || foundUser.email;
                userId = foundUser.id;
            }

            // Tentukan tier VIP yang diajukan
            let chosenTier = '1month';
            let durationText = '1 Bulan (30 Hari)';
            let durationMs = 30 * 24 * 3600 * 1000;
            const pkgId = String(body.packageId || '').toLowerCase();
            const dur = String(body.duration || '').toLowerCase();
            const pName = String(body.packageName || '').toLowerCase();

            if (pkgId.includes('permanent') || dur.includes('permanen') || dur.includes('selamanya') || pName.includes('permanen')) {
                chosenTier = 'permanent';
                durationText = 'Permanen (Selamanya)';
                durationMs = null;
            } else if (pkgId.includes('5month') || dur.includes('150') || dur.includes('5 bulan') || pName.includes('5 bulan')) {
                chosenTier = '5months';
                durationText = '5 Bulan (150 Hari)';
                durationMs = 150 * 24 * 3600 * 1000;
            } else if (pkgId.includes('2month') || dur.includes('60') || dur.includes('2 bulan') || pName.includes('2 bulan')) {
                chosenTier = '2months';
                durationText = '2 Bulan (60 Hari)';
                durationMs = 60 * 24 * 3600 * 1000;
            } else if (pkgId.includes('1week') || dur.includes('7 hari') || pName.includes('mingguan')) {
                chosenTier = '1month';
                durationText = '7 Hari (Paket Mingguan)';
                durationMs = 7 * 24 * 3600 * 1000;
            } else {
                chosenTier = '1month';
                durationText = '1 Bulan (30 Hari)';
                durationMs = 30 * 24 * 3600 * 1000;
            }

            const chosenPaymentMethod = String(body.paymentMethod || 'QRIS').trim().toUpperCase();

            // KEAMANAN KETAT: Hanya Admin terautentikasi yang dapat langsung mengaktifkan status VIP!
            // Jika dipanggil oleh user biasa (atau lewat DevTools), hanya catat sebagai antrean konfirmasi menunggu persetujuan Admin.
            if (foundUser) {
                if (isAdminCaller) {
                    foundUser.isPremium = true;
                    foundUser.vipTier = chosenTier;
                    foundUser.vipGrantedAt = Date.now();
                    foundUser.vipExpiresAt = durationMs ? (Date.now() + durationMs) : null;
                    foundUser.vipSource = 'paid';
                    foundUser.isVipTrial = false;
                    foundUser.hasUnpaidTrialInvoice = false;
                    if (foundUser.pendingTrialInvoice && typeof foundUser.pendingTrialInvoice === 'object') {
                        foundUser.pendingTrialInvoice.status = 'paid';
                        foundUser.pendingTrialInvoice.paidAt = new Date().toISOString();
                        foundUser.pendingTrialInvoice.paidMethod = chosenPaymentMethod;
                    }
                } else {
                    if (foundUser.pendingTrialInvoice && typeof foundUser.pendingTrialInvoice === 'object') {
                        foundUser.pendingTrialInvoice.waitingAdminApproval = true;
                        foundUser.pendingTrialInvoice.paymentMethod = chosenPaymentMethod;
                        foundUser.pendingTrialInvoice.scannedAt = new Date().toISOString();
                    }
                }

                const uIdx = (usersData.users || []).findIndex(x => x && x.id === foundUser.id);
                if (uIdx !== -1) {
                    usersData.users[uIdx] = foundUser;
                    await storage.writeDataAsync('users.json', usersData);
                }
            }

            const ordersData = await storage.readDataAsync('vip_orders.json', { orders: [] });
            const newOrder = {
                id: 'ord_' + Date.now(),
                userId: userId,
                username: username,
                email: userEmail,
                packageId: body.packageId || 'pkg_1month',
                packageName: body.packageName || 'Paket Bulanan',
                amount: body.amount || 10000,
                duration: durationText,
                vipTier: chosenTier,
                paymentMethod: chosenPaymentMethod,
                invoiceId: body.invoiceId || null,
                proofBase64: body.proofBase64 ? body.proofBase64.substring(0, 500000) : null,
                notes: body.notes || '',
                status: isAdminCaller ? 'completed' : 'pending_admin_verification',
                createdAt: new Date().toISOString()
            };

            ordersData.orders = ordersData.orders || [];
            ordersData.orders.unshift(newOrder);
            if (ordersData.orders.length > 100) ordersData.orders = ordersData.orders.slice(0, 100);
            await storage.writeDataAsync('vip_orders.json', ordersData);

            if (isAdminCaller) {
                try {
                    const messagesApi = require('./messages.js');
                    if (messagesApi && typeof messagesApi.sendVipWelcomeMessage === 'function') {
                        await messagesApi.sendVipWelcomeMessage(userId, username, chosenTier, durationText);
                    }
                } catch (mErr) {
                    console.error('[PAYMENT_CONFIG] Error sending VIP welcome message:', mErr.message);
                }
            }

            const vipSig = foundUser ? Security.generateVipSignature(foundUser.id, foundUser.vipTier || 'none', foundUser.vipExpiresAt || null) : null;

            return res.json({
                status: true,
                message: isAdminCaller
                    ? `Pembayaran via ${chosenPaymentMethod} berhasil diverifikasi Admin & VIP aktif selama ${durationText}.`
                    : `Konfirmasi pembayaran via ${chosenPaymentMethod} telah tercatat dan menunggu verifikasi bukti transfer oleh Admin.`,
                order: newOrder,
                isVipActive: Boolean(foundUser && foundUser.isPremium),
                user: foundUser ? {
                    id: foundUser.id,
                    username: foundUser.username,
                    isPremium: Boolean(foundUser.isPremium),
                    vipTier: foundUser.vipTier || 'none',
                    vipExpiresAt: foundUser.vipExpiresAt || null,
                    vipSignature: vipSig,
                    isVipTrial: Boolean(foundUser.isVipTrial),
                    hasUnpaidTrialInvoice: Boolean(foundUser.hasUnpaidTrialInvoice)
                } : null
            });
        } catch(err) {
            console.error('[PAYMENT_CONFIG] Error saving order:', err.message);
            return res.status(500).json({ status: false, message: 'Gagal mengirim konfirmasi' });
        }
    }

    // POST /api/payment-config (Admin Update Config)
    if (req.method === 'POST') {
        const authorized = await isAdminAuthorized(req);
        if (!authorized) {
            return res.status(401).json({
                status: false,
                message: 'Akses ditolak: Token admin tidak valid atau kedaluwarsa'
            });
        }

        const body = req.body || {};
        const currentConfig = await getPaymentConfig();

        let updatedQrisUrl = currentConfig.qrisUrl;
        let updatedQrisBase64 = currentConfig.qrisBase64;

        // Reset to default QRIS if requested
        if (body.resetDefault) {
            const customPath = path.join(__dirname, '..', 'public', 'qris_custom.png');
            try {
                if (fs.existsSync(customPath)) fs.unlinkSync(customPath);
            } catch (e) {}
            updatedQrisUrl = '/qris.png';
            updatedQrisBase64 = null;
        } else if (body.qrisBase64 && typeof body.qrisBase64 === 'string') {
            updatedQrisBase64 = body.qrisBase64;
            updatedQrisUrl = body.qrisBase64; // Safe fallback for read-only serverless environment
            try {
                const matches = body.qrisBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                const buffer = matches ? Buffer.from(matches[2], 'base64') : Buffer.from(body.qrisBase64, 'base64');
                const targetPath = path.join(__dirname, '..', 'public', 'qris_custom.png');
                fs.writeFileSync(targetPath, buffer);
                updatedQrisUrl = `/qris_custom.png?v=${Date.now()}`;
            } catch (err) {
                console.warn('[PAYMENT_CONFIG] Local filesystem is read-only (EROFS). Storing QRIS in database via base64:', err.message);
                updatedQrisUrl = body.qrisBase64;
            }
        } else if (body.qrisUrl && typeof body.qrisUrl === 'string') {
            updatedQrisUrl = body.qrisUrl.trim();
        }

        // Parse packages if sent
        let updatedPackages = currentConfig.packages;
        if (Array.isArray(body.packages) && body.packages.length > 0) {
            updatedPackages = body.packages.map((pkg, idx) => ({
                id: pkg.id || `pkg_${Date.now()}_${idx}`,
                name: String(pkg.name || 'Paket VIP').trim(),
                duration: String(pkg.duration || '30 Hari').trim(),
                price: Number(pkg.price) || 10000,
                originalPrice: Number(pkg.originalPrice) || (Number(pkg.price) ? Number(pkg.price) * 1.5 : 15000),
                discount: String(pkg.discount || '').trim(),
                badge: String(pkg.badge || '').trim(),
                popular: !!pkg.popular,
                active: pkg.active !== false
            }));
        }

        // Parse benefits if sent
        let updatedBenefits = currentConfig.benefits;
        if (Array.isArray(body.benefits) && body.benefits.length > 0) {
            updatedBenefits = body.benefits.map((ben, idx) => ({
                id: ben.id || `ben_${Date.now()}_${idx}`,
                title: String(ben.title || 'Keuntungan VIP').trim(),
                desc: String(ben.desc || '').trim(),
                icon: String(ben.icon || 'shield-check').trim()
            }));
        }

        // Parse ewallets if sent
        let updatedEwallets = currentConfig.ewallets || DEFAULT_EWALLETS;
        if (body.ewallets && typeof body.ewallets === 'object') {
            const ew = body.ewallets;
            updatedEwallets = {
                gopay: {
                    enabled: ew.gopay && ew.gopay.enabled !== undefined ? Boolean(ew.gopay.enabled) : updatedEwallets.gopay.enabled,
                    number: (ew.gopay && typeof ew.gopay.number === 'string') ? ew.gopay.number.trim() : updatedEwallets.gopay.number,
                    holder: (ew.gopay && typeof ew.gopay.holder === 'string') ? ew.gopay.holder.trim() : updatedEwallets.gopay.holder,
                    link: (ew.gopay && typeof ew.gopay.link === 'string') ? ew.gopay.link.trim() : (updatedEwallets.gopay.link || '')
                },
                dana: {
                    enabled: ew.dana && ew.dana.enabled !== undefined ? Boolean(ew.dana.enabled) : updatedEwallets.dana.enabled,
                    number: (ew.dana && typeof ew.dana.number === 'string') ? ew.dana.number.trim() : updatedEwallets.dana.number,
                    holder: (ew.dana && typeof ew.dana.holder === 'string') ? ew.dana.holder.trim() : updatedEwallets.dana.holder,
                    link: (ew.dana && typeof ew.dana.link === 'string') ? ew.dana.link.trim() : (updatedEwallets.dana.link || '')
                },
                ovo: {
                    enabled: ew.ovo && ew.ovo.enabled !== undefined ? Boolean(ew.ovo.enabled) : updatedEwallets.ovo.enabled,
                    number: (ew.ovo && typeof ew.ovo.number === 'string') ? ew.ovo.number.trim() : updatedEwallets.ovo.number,
                    holder: (ew.ovo && typeof ew.ovo.holder === 'string') ? ew.ovo.holder.trim() : updatedEwallets.ovo.holder,
                    link: (ew.ovo && typeof ew.ovo.link === 'string') ? ew.ovo.link.trim() : (updatedEwallets.ovo.link || '')
                }
            };
        }

        let updatedDiamondPackages = currentConfig.diamondPackages || DEFAULT_DIAMOND_PACKAGES;
        if (Array.isArray(body.diamondPackages) && body.diamondPackages.length > 0) {
            updatedDiamondPackages = body.diamondPackages.map((dp, idx) => ({
                id: dp.id || `dm_${Date.now()}_${idx}`,
                diamonds: Math.max(1, Number(dp.diamonds) || 55),
                bonus: Math.max(0, Number(dp.bonus) || 0),
                price: Math.max(100, Number(dp.price) || 1800),
                hot: Boolean(dp.hot),
                badgeColor: dp.badgeColor || 'purple',
                iconType: dp.iconType || 'single'
            }));
        }

        let updatedDiamondStarVipPackages = currentConfig.diamondStarVipPackages || DEFAULT_DIAMOND_STAR_VIP_PACKAGES;
        if (Array.isArray(body.diamondStarVipPackages) && body.diamondStarVipPackages.length > 0) {
            const borderMap = {
                'border_platinum': { name: 'Platinum', url: '/borders/Platinum.png', tier: '1month' },
                'border_master': { name: 'Master', url: '/borders/Master.png', tier: '1month' },
                'border_legend': { name: 'Legend', url: '/borders/Legend.png', tier: '2months' },
                'border_immortal': { name: 'Immortal', url: '/borders/Imortal.png', tier: '5months' }
            };
            updatedDiamondStarVipPackages = body.diamondStarVipPackages.map((sp, idx) => {
                const bKey = String(sp.border || 'border_platinum').trim();
                const bInfo = borderMap[bKey] || { name: sp.borderName || 'Platinum', url: sp.borderUrl || '/borders/Platinum.png', tier: '1month' };
                const daysNum = Math.max(0, Number(sp.days) || 0);
                return {
                    id: sp.id || `star_${Date.now()}_${idx}`,
                    title: String(sp.title || 'Paket VIP Berlian').trim(),
                    desc: String(sp.desc || 'Akses penuh fitur VIP MusifyStar').trim(),
                    cost: Math.max(1, Number(sp.cost) || 250),
                    days: daysNum,
                    tier: daysNum === 0 ? 'permanent' : (sp.tier || bInfo.tier || '1month'),
                    border: bKey,
                    borderName: sp.borderName || bInfo.name,
                    borderUrl: sp.borderUrl || bInfo.url,
                    enabled: sp.enabled !== false
                };
            });
        }

        let updatedDiamondShopCustomIds = currentConfig.diamondShopCustomIds || DEFAULT_DIAMOND_SHOP_CUSTOM_IDS;
        if (Array.isArray(body.diamondShopCustomIds)) {
            updatedDiamondShopCustomIds = body.diamondShopCustomIds
                .filter(item => item && String(item.customId || '').trim().length >= 3)
                .map((item, idx) => {
                    const cid = String(item.customId || '').trim();
                    const daysNum = Math.max(0, Number(item.days) || 0);
                    return {
                        id: item.id || `dmid_${cid}_${idx}`,
                        customId: cid,
                        title: String(item.title || `Musify ID #${cid}`).trim(),
                        desc: String(item.desc || 'Musify ID Eksklusif Pilihan').trim(),
                        cost: Math.max(1, Number(item.cost) || 500),
                        days: daysNum,
                        isPermanent: item.isPermanent !== undefined ? Boolean(item.isPermanent) : (daysNum === 0),
                        enabled: item.enabled !== false
                    };
                });
        }

        let updatedDiamondShopBorders = currentConfig.diamondShopBorders || DEFAULT_DIAMOND_SHOP_BORDERS;
        if (Array.isArray(body.diamondShopBorders) && body.diamondShopBorders.length > 0) {
            updatedDiamondShopBorders = body.diamondShopBorders
                .filter(item => item && (item.url || item.borderId))
                .map((item, idx) => {
                    const daysNum = Math.max(0, Number(item.days) || 0);
                    return {
                        id: item.id || `dmbd_${Date.now()}_${idx}`,
                        borderId: String(item.borderId || `border_dm_${idx}`).trim(),
                        name: String(item.name || 'Border VIP').trim(),
                        url: String(item.url || '/borders/Platinum.png').trim(),
                        badge: String(item.badge || 'EKSKLUSIF').trim(),
                        cost: Math.max(1, Number(item.cost) || 300),
                        days: daysNum,
                        isPermanent: item.isPermanent !== undefined ? Boolean(item.isPermanent) : (daysNum === 0),
                        enabled: item.enabled !== false
                    };
                });
        }

        // Parse vipTrialConfig if sent
        let updatedTrialConfig = currentConfig.vipTrialConfig || DEFAULT_VIP_TRIAL_CONFIG;
        if (body.vipTrialConfig && typeof body.vipTrialConfig === 'object') {
            const tc = body.vipTrialConfig;
            const tf = tc.allowedFeatures && typeof tc.allowedFeatures === 'object' ? tc.allowedFeatures : (updatedTrialConfig.allowedFeatures || {});
            updatedTrialConfig = {
                enabled: tc.enabled !== undefined ? Boolean(tc.enabled) : updatedTrialConfig.enabled,
                durationDays: Math.max(1, Math.min(3650, Number(tc.durationDays) || updatedTrialConfig.durationDays || 7)),
                borderAccess: ['platinum', 'master', 'legend', 'immortal', 'permanent', 'platinum_master', 'platinum_master_legend', 'platinum_master_legend_immortal', 'platinum_master_legend_immortal_permanent', 'all', 'none'].includes(String(tc.borderAccess || '').toLowerCase())
                    ? String(tc.borderAccess).toLowerCase()
                    : updatedTrialConfig.borderAccess,
                allowedFeatures: {
                    liquidGlassIos27: tf.liquidGlassIos27 !== undefined ? Boolean(tf.liquidGlassIos27) : true,
                    nameGlow: tf.nameGlow !== undefined ? Boolean(tf.nameGlow) : true,
                    customId: tf.customId !== undefined ? Boolean(tf.customId) : true,
                    vipAvatar: tf.vipAvatar !== undefined ? Boolean(tf.vipAvatar) : true,
                    dynamicIsland: tf.dynamicIsland !== undefined ? Boolean(tf.dynamicIsland) : true,
                    highAudio: tf.highAudio !== undefined ? Boolean(tf.highAudio) : true,
                    backgroundPlay: tf.backgroundPlay !== undefined ? Boolean(tf.backgroundPlay) : true,
                    keepScreenAwake: tf.keepScreenAwake !== undefined ? Boolean(tf.keepScreenAwake) : true,
                    swipeGestures: tf.swipeGestures !== undefined ? Boolean(tf.swipeGestures) : true,
                    vipSultanBadge: tf.vipSultanBadge !== undefined ? Boolean(tf.vipSultanBadge) : true
                },
                autoSendEmailInvoice: tc.autoSendEmailInvoice !== undefined ? Boolean(tc.autoSendEmailInvoice) : updatedTrialConfig.autoSendEmailInvoice,
                invoicePackageId: tc.invoicePackageId !== undefined ? String(tc.invoicePackageId).trim() : updatedTrialConfig.invoicePackageId,
                invoicePackageName: tc.invoicePackageName !== undefined ? String(tc.invoicePackageName).trim() : updatedTrialConfig.invoicePackageName,
                invoiceAmount: Math.max(1000, Number(tc.invoiceAmount) || updatedTrialConfig.invoiceAmount || 10000),
                invoiceDuration: tc.invoiceDuration !== undefined ? String(tc.invoiceDuration).trim() : updatedTrialConfig.invoiceDuration,
                invoiceNote: tc.invoiceNote !== undefined ? String(tc.invoiceNote).trim() : updatedTrialConfig.invoiceNote
            };
        }

        let updatedRewardedAdConfig = currentConfig.rewardedAdConfig || DEFAULT_REWARDED_AD_CONFIG;
        if (body.rewardedAdConfig && typeof body.rewardedAdConfig === 'object') {
            const rac = body.rewardedAdConfig;
            updatedRewardedAdConfig = {
                enabled: rac.enabled !== undefined ? Boolean(rac.enabled) : true,
                adsenseClientId: (rac.adsenseClientId && String(rac.adsenseClientId).trim()) ? String(rac.adsenseClientId).trim() : (updatedRewardedAdConfig.adsenseClientId || DEFAULT_REWARDED_AD_CONFIG.adsenseClientId),
                adsenseSlotId: rac.adsenseSlotId !== undefined ? String(rac.adsenseSlotId).trim() : (updatedRewardedAdConfig.adsenseSlotId || ''),
                rewardDiamonds: Math.max(1, Number(rac.rewardDiamonds) || updatedRewardedAdConfig.rewardDiamonds || 8),
                watchDurationSec: Math.max(5, Math.min(60, Number(rac.watchDurationSec) || updatedRewardedAdConfig.watchDurationSec || 15)),
                maxClaimsPerDay: Math.max(1, Number(rac.maxClaimsPerDay) || updatedRewardedAdConfig.maxClaimsPerDay || 5),
                customVideoUrl: rac.customVideoUrl !== undefined ? String(rac.customVideoUrl).trim() : (updatedRewardedAdConfig.customVideoUrl || ''),
                customClickUrl: rac.customClickUrl !== undefined ? String(rac.customClickUrl).trim() : (updatedRewardedAdConfig.customClickUrl || '')
            };
        }

        const updatedConfig = {
            qrisUrl: updatedQrisUrl,
            qrisBase64: updatedQrisBase64,
            qrisFilename: (body.qrisFilename && typeof body.qrisFilename === 'string') ? body.qrisFilename.trim() : currentConfig.qrisFilename,
            qrisHolder: (body.qrisHolder && typeof body.qrisHolder === 'string') ? body.qrisHolder.trim() : currentConfig.qrisHolder,
            adminWhatsapp: (body.adminWhatsapp && typeof body.adminWhatsapp === 'string') ? body.adminWhatsapp.trim().replace(/[^0-9]/g, '') : (currentConfig.adminWhatsapp || '6281234567890'),
            ewalletsEnabled: body.ewalletsEnabled !== undefined ? Boolean(body.ewalletsEnabled) : (currentConfig.ewalletsEnabled !== false),
            ewallets: updatedEwallets,
            diamondPackages: updatedDiamondPackages,
            diamondStarVipPackages: updatedDiamondStarVipPackages,
            diamondShopCustomIds: updatedDiamondShopCustomIds,
            diamondShopBorders: updatedDiamondShopBorders,
            rewardedAdConfig: updatedRewardedAdConfig,
            vipTrialConfig: updatedTrialConfig,
            accounts: Array.isArray(body.accounts) ? body.accounts.map((acc, idx) => ({
                id: acc.id || `acc_${Date.now()}_${idx}`,
                bankName: String(acc.bankName || 'Bank').trim(),
                accountNumber: String(acc.accountNumber || '').trim(),
                accountHolder: String(acc.accountHolder || '').trim(),
                badge: String(acc.badge || 'Transfer').trim(),
                icon: String(acc.icon || 'credit-card').trim()
            })) : currentConfig.accounts,
            showAccounts: body.showAccounts !== undefined ? Boolean(body.showAccounts) : (currentConfig.showAccounts !== false),
            packages: updatedPackages,
            benefits: updatedBenefits,
            title: (body.title && typeof body.title === 'string') ? body.title.trim() : currentConfig.title,
            description: (body.description && typeof body.description === 'string') ? body.description.trim() : currentConfig.description,
            note: (body.note && typeof body.note === 'string') ? body.note.trim() : currentConfig.note,
            updatedAt: new Date().toISOString()
        };

        await storage.writeDataAsync(PAYMENT_CONFIG_FILE, updatedConfig);

        // Sinkronkan juga seluruh pengguna yang sedang berada di masa Percobaan VIP (isVipTrial)
        // agar perubahan centang fitur & akses border oleh Admin langsung berlaku real-time!
        try {
            const usersData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
            if (usersData && Array.isArray(usersData.users)) {
                let usersUpdated = false;
                const af = updatedTrialConfig.allowedFeatures || {};
                const ba = String(updatedTrialConfig.borderAccess || 'platinum').toLowerCase();
                for (const u of usersData.users) {
                    if (!u) continue;
                    const isMaster = String(u.email || u.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com';
                    if (!u.isPremium && !isMaster && u.nameGlow) {
                        u.nameGlow = '';
                        usersUpdated = true;
                    }
                    if (!u.isVipTrial) continue;
                    u.trialAllowedFeatures = Object.assign({}, af);
                    u.trialBorderAccess = ba;
                    if (af.customId === false && u.customId) {
                        u.id = u.originalId || u.id;
                        u.customId = null;
                        u.customIdExpiresAt = null;
                        u.isCustomIdTrial = false;
                    }
                    if (af.nameGlow === false && u.nameGlow) {
                        u.nameGlow = '';
                    }
                    if (af.vipSultanBadge === false && u.equippedBadge === 'badge_vip_sultan') {
                        u.equippedBadge = '';
                        u.equippedBadgeTitle = '';
                        u.equippedBadgeIcon = '';
                        u.equippedBadgeColor = '';
                    }
                    if (ba === 'none' && u.border) {
                        u.border = '';
                        u.borderUrl = '';
                        u.borderName = '';
                    }
                    if (u.settings && typeof u.settings === 'object') {
                        if (af.liquidGlassIos27 === false) {
                            u.settings.liquidGlassIos26 = false;
                            u.settings.liquidGlassIos27 = false;
                        }
                        if (af.dynamicIsland === false) u.settings.dynamicIsland = false;
                        if (af.highAudio === false && u.settings.audioQuality === 'high') u.settings.audioQuality = 'standard';
                        if (af.backgroundPlay === false) u.settings.backgroundPlay = false;
                        if (af.keepScreenAwake === false) u.settings.keepScreenAwake = false;
                        if (af.swipeGestures === false) u.settings.swipeGestures = false;
                    }
                    usersUpdated = true;
                }
                if (usersUpdated) {
                    await storage.writeDataAsync('users.json', usersData);
                }
            }
        } catch (syncErr) {
            console.error('[PAYMENT_CONFIG] Sync active trial users error:', syncErr.message);
        }

        return res.json({
            status: true,
            message: 'Konfigurasi Pembayaran (QRIS & GoPay/DANA/OVO), Trial VIP & Paket berhasil diperbarui!',
            config: updatedConfig
        });
    }

    return res.status(405).json({ status: false, message: 'Method not allowed' });
};

module.exports.getPaymentConfig = getPaymentConfig;

