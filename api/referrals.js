const crypto = require('crypto');
const adminAuth = require('./admin-auth.js');
const storage = require('./storage.js');

const REFERRAL_CONFIG_FILE = 'referral_config.json';
const USERS_FILE = 'users.json';

const DEFAULT_REFERRAL_CONFIG = {
    isActive: true,
    enabled: true,
    // 1. Pengaturan jika pengguna BELUM VIP (Baru Pertama Dapat VIP dari Referral)
    newVipPreset: '7d',
    newVipDurationText: '7 Hari',
    newVipCustomText: '7 Hari',
    newVipDurationDays: 7,
    newVipDays: 7,
    newVipBorderPreset: 'border_platinum',
    newVipBorderCustomInput: 'Platinum',
    newVipBorderCustomText: 'Platinum',
    newVipAssignedBorder: 'border_platinum',
    newVipAllowedBorders: ['border_platinum', 'platinum'],
    unlockAllSettingsFeatures: true, // Semua fitur di Pengaturan terbuka semua, kecuali Border profil diatur Admin
    freeMaxInvites: 10,              // Batas maksimal undang teman untuk Pengguna Gratis (contoh: 10/10)
    freeMaxInvitesText: '10',

    // 2. Pengaturan jika pengguna SUDAH VIP (Perpanjang VIP / Masa Trial dari Referral)
    extendVipPreset: '7d',
    extendVipDurationText: '7 Hari',
    extendVipCustomText: '7 Hari',
    extendVipDurationDays: 7,
    extendVipDays: 7,
    extendVipBorderPreset: 'keep',
    extendVipBorderCustomInput: 'Pertahankan Border',
    extendVipBorderCustomText: 'Pertahankan Border',
    extendVipAssignedBorder: 'keep',
    extendVipAllowedBorders: ['keep'],
    vipMaxInvites: 35,               // Batas maksimal undang teman untuk Pengguna VIP (contoh: 35/35 atau 0 = Tanpa Batas)
    vipMaxInvitesText: '35',

    // 3. Pengaturan Poin & Bonus Teman yang Diundang
    pointsPerReferralPreset: '100',
    pointsPerReferral: 100,
    targetInvitesPreset: '1',
    targetInvitesForVip: 1,
    inviteeRewardEnabled: true,
    inviteeBonusPreset: '3d',
    inviteeBonusDaysText: '3 Hari',
    inviteeCustomText: '3 Hari',
    inviteeBonusDays: 3,
    inviteeBorderPreset: 'border_platinum',
    inviteeBorderCustomText: 'Platinum',
    inviteeAllowedBorders: ['border_platinum', 'platinum'],
    inviteeBonusPoints: 50,
    // 4. Pengaturan Format Kode Referral (Bisa Cuma Angka, Cuma Huruf, Campur Huruf & Angka, atau Ketik Bebas Persis)
    codeFormat: 'alphanumeric', // 'numeric' | 'alpha' | 'alphanumeric' | 'username_num' | 'custom'
    codePrefix: '',             // Kosong secara default agar tidak menambah karakter di depan/belakang tanpa diminta
    customGlobalCode: '',       // Jika diisi (misal: MUSIFYSTAR-STUDIO-MUSIK), kode dipakai PERSIS tanpa tambahan angka acak
    codeLength: 6,
    updatedAt: 1790000000000
};

const DONATUR_BADGES_CATALOG = [
    {
        id: 'badge_supporter',
        legacyId: 'donatur_supporter',
        tier: 'supporter',
        name: 'Supporter MusifyStar',
        title: 'Supporter MusifyStar',
        shortLabel: 'Supporter',
        icon: 'heart',
        minSupport: 1,
        color: '#34d399',
        borderColor: 'rgba(16,185,129,0.55)',
        bgGradient: 'linear-gradient(135deg, rgba(16,185,129,0.22), rgba(20,184,166,0.28))',
        label: '1x+ Berlangganan / Dukung MusifyStar',
        desc: 'Lencana kehormatan untuk pendukung setia yang telah berlangganan atau mendukung MusifyStar.'
    },
    {
        id: 'badge_top_supporter',
        legacyId: 'donatur_top',
        tier: 'top_supporter',
        name: 'Top Supporter',
        title: 'Top Supporter',
        shortLabel: 'Top Supporter',
        icon: 'award',
        minSupport: 2,
        color: '#fbbf24',
        borderColor: 'rgba(245,158,11,0.6)',
        bgGradient: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(234,179,8,0.3))',
        label: '2x+ Berlangganan / Paket 2 Bulan+',
        desc: 'Lencana kehormatan emas khusus bagi Top Supporter yang rutin berlangganan dan mendukung MusifyStar.'
    },
    {
        id: 'badge_mega_supporter',
        legacyId: 'donatur_mega',
        tier: 'mega_supporter',
        name: 'Mega Supporter',
        title: 'Mega Supporter',
        shortLabel: 'Mega Supporter',
        icon: 'gem',
        minSupport: 4,
        color: '#c084fc',
        borderColor: 'rgba(168,85,247,0.6)',
        bgGradient: 'linear-gradient(135deg, rgba(168,85,247,0.25), rgba(236,72,153,0.28))',
        label: '4x+ Berlangganan / Paket 5 Bulan+',
        desc: 'Lencana kehormatan berlian untuk pendukung utama dengan kontribusi tinggi di komunitas MusifyStar.'
    },
    {
        id: 'badge_sultan_donatur',
        legacyId: 'donatur_sultan',
        tier: 'sultan_donatur',
        name: 'Sultan Donatur MusifyStar',
        title: 'Sultan Donatur MusifyStar',
        shortLabel: 'Sultan Donatur',
        icon: 'crown',
        minSupport: 6,
        color: '#fb7185',
        borderColor: 'rgba(244,63,94,0.65)',
        bgGradient: 'linear-gradient(135deg, rgba(244,63,94,0.28), rgba(245,158,11,0.3))',
        label: '6x+ Berlangganan / Paket Sultan & Permanen',
        desc: 'Lencana kehormatan tertinggi kasta Sultan bagi Donatur paling dermawan di MusifyStar.'
    }
];

const STANDARD_BORDERS_MAP = {
    'none': { id: 'none', name: 'Tanpa Border', url: '' },
    'border_platinum': { id: 'border_platinum', name: 'Platinum', url: '/borders/Platinum.png' },
    'border_master': { id: 'border_master', name: 'Master', url: '/borders/Master.png' },
    'border_legend': { id: 'border_legend', name: 'Legend', url: '/borders/Legend.png' },
    'border_immortal': { id: 'border_immortal', name: 'Immortal', url: '/borders/Imortal.png' }
};

function parseDurationInput(rawText, fallbackDays = 7) {
    if (rawText === undefined || rawText === null) {
        return { days: fallbackDays, isPermanent: fallbackDays === 0, label: fallbackDays === 0 ? 'Permanen (Selamanya)' : `${fallbackDays} Hari` };
    }
    const s = String(rawText).trim().toLowerCase();
    if (!s) {
        return { days: fallbackDays, isPermanent: fallbackDays === 0, label: fallbackDays === 0 ? 'Permanen (Selamanya)' : `${fallbackDays} Hari` };
    }
    if (s === '0' || s.includes('permanen') || s.includes('permanent') || s.includes('selamanya') || s.includes('lifetime')) {
        return { days: 0, isPermanent: true, label: 'Permanen (Selamanya)' };
    }
    if (s === 'none' || s === 'tidak ada' || s === 'nonaktif') {
        return { days: -1, isPermanent: false, label: 'Tidak Ada (0 Hari)' };
    }

    const numMatch = s.match(/(\d+)/);
    if (numMatch) {
        const val = parseInt(numMatch[1], 10);
        if (val === 0) {
            return { days: 0, isPermanent: true, label: 'Permanen (Selamanya)' };
        }
        let days = val;
        if (s.includes('minggu') || s.includes('week') || s.endsWith('w')) {
            days = val * 7;
        } else if (s.includes('bulan') || s.includes('month') || s.endsWith('mo') || s.endsWith('b')) {
            days = val * 30;
        } else if (s.includes('tahun') || s.includes('year') || s.endsWith('y')) {
            days = val * 365;
        }
        return { days, isPermanent: false, label: `${days} Hari` };
    }

    return { days: fallbackDays, isPermanent: false, label: `${fallbackDays} Hari` };
}

function parseMaxInvitesInput(rawText, fallbackLimit = 10) {
    if (rawText === undefined || rawText === null) {
        return {
            maxInvites: fallbackLimit,
            isUnlimited: fallbackLimit <= 0,
            rawText: fallbackLimit <= 0 ? 'Tanpa Batas' : String(fallbackLimit),
            label: fallbackLimit <= 0 ? 'Tanpa Batas' : `${fallbackLimit} Teman`
        };
    }
    const s = String(rawText).trim().toLowerCase();
    if (!s) {
        return {
            maxInvites: fallbackLimit,
            isUnlimited: fallbackLimit <= 0,
            rawText: fallbackLimit <= 0 ? 'Tanpa Batas' : String(fallbackLimit),
            label: fallbackLimit <= 0 ? 'Tanpa Batas' : `${fallbackLimit} Teman`
        };
    }
    if (
        s === '0' ||
        s.includes('tanpa') ||
        s.includes('unlimited') ||
        s.includes('bebas') ||
        s.includes('tak terbatas') ||
        s.includes('tidak ada batas') ||
        s.includes('ga ada batas') ||
        s.includes('gak ada batas') ||
        s.includes('∞')
    ) {
        return {
            maxInvites: 0,
            isUnlimited: true,
            rawText: 'Tanpa Batas',
            label: 'Tanpa Batas'
        };
    }

    const numMatch = s.match(/(\d+)/);
    if (numMatch) {
        const val = parseInt(numMatch[1], 10);
        if (val <= 0) {
            return {
                maxInvites: 0,
                isUnlimited: true,
                rawText: 'Tanpa Batas',
                label: 'Tanpa Batas'
            };
        }
        return {
            maxInvites: val,
            isUnlimited: false,
            rawText: String(val),
            label: `${val} Teman`
        };
    }

    return {
        maxInvites: fallbackLimit,
        isUnlimited: fallbackLimit <= 0,
        rawText: fallbackLimit <= 0 ? 'Tanpa Batas' : String(fallbackLimit),
        label: fallbackLimit <= 0 ? 'Tanpa Batas' : `${fallbackLimit} Teman`
    };
}

function resolveUserInviteLimitInfo(user, configOverride = null) {
    const cfg = configOverride || readReferralConfigSync();
    const email = String(user?.rawEmail || user?.email || '').toLowerCase().trim();
    const isMaster = (email === 'jrnabil570@gmail.com');
    const isVipExpired = user?.vipExpiresAt && Date.now() > user.vipExpiresAt;
    const isTierActive = Boolean(user?.vipTier && user.vipTier !== 'none');
    const isUserVip = isMaster || (Boolean(user?.isPremium || user?.is_premium || isTierActive) && user?.vipTier !== 'none' && !isVipExpired);

    const freeInfo = parseMaxInvitesInput(cfg.freeMaxInvitesText !== undefined ? cfg.freeMaxInvitesText : cfg.freeMaxInvites, 10);
    const vipInfo = parseMaxInvitesInput(cfg.vipMaxInvitesText !== undefined ? cfg.vipMaxInvitesText : cfg.vipMaxInvites, 35);

    const activeInfo = isUserVip ? vipInfo : freeInfo;
    const referralCount = Math.max(0, Number(user?.referralCount) || 0);
    const maxInvites = activeInfo.maxInvites;
    const isUnlimited = activeInfo.isUnlimited || maxInvites <= 0;
    const isLimitReached = !isUnlimited && referralCount >= maxInvites;
    const remainingInvites = isUnlimited ? null : Math.max(0, maxInvites - referralCount);
    const ratioText = isUnlimited ? `${referralCount}/∞` : `${referralCount}/${maxInvites}`;
    const limitReachedText = isLimitReached
        ? `Mohon maaf Anda sudah mengundang teman ${referralCount}/${maxInvites} batas sudah tercapai`
        : '';

    return {
        isVip: isUserVip,
        userTypeLabel: isUserVip ? 'Pengguna VIP' : 'Pengguna Gratis',
        referralCount,
        maxInvites,
        isUnlimited,
        isLimitReached,
        remainingInvites,
        ratioText,
        limitLabel: activeInfo.label,
        limitReachedText,
        freeMaxInvites: freeInfo.maxInvites,
        freeMaxInvitesText: freeInfo.rawText,
        freeMaxInvitesLabel: freeInfo.label,
        freeIsUnlimited: freeInfo.isUnlimited,
        vipMaxInvites: vipInfo.maxInvites,
        vipMaxInvitesText: vipInfo.rawText,
        vipMaxInvitesLabel: vipInfo.label,
        vipIsUnlimited: vipInfo.isUnlimited
    };
}

function parseBorderConfigInput(preset, customInput, isExtend = false) {
    const p = String(preset || '').trim().toLowerCase();
    const c = String(customInput || '').trim().toLowerCase();

    // Handle 'keep' for VIP extension
    if (p === 'keep' || c.includes('pertahankan') || c.includes('tetap') || c.includes('keep') || c.includes('biarkan')) {
        return {
            preset: 'keep',
            assignedBorder: 'keep',
            assignedBorderName: 'Pertahankan Border',
            assignedBorderUrl: '',
            allowedBorders: ['keep'],
            label: 'Pertahankan Border'
        };
    }

    // Handle 'none' (Tanpa Border VIP)
    if (p === 'none' || c === 'none' || c.includes('tanpa') || c.includes('kosong') || c.includes('tidak')) {
        return {
            preset: 'none',
            assignedBorder: 'none',
            assignedBorderName: '',
            assignedBorderUrl: '',
            allowedBorders: ['none'],
            label: 'Tanpa Border'
        };
    }

    // Handle 'all' (Semua Border Terbuka)
    if (p === 'all' || c === 'all' || c.includes('semua') || c.includes('bebas') || c.includes('sultan')) {
        return {
            preset: 'all',
            assignedBorder: 'border_immortal',
            assignedBorderName: 'Immortal',
            assignedBorderUrl: '/borders/Imortal.png',
            allowedBorders: ['all'],
            label: 'Semua Border VIP'
        };
    }

    // Handle 'platinum_master'
    if (p === 'platinum_master') {
        return {
            preset: 'platinum_master',
            assignedBorder: 'border_platinum',
            assignedBorderName: 'Platinum',
            assignedBorderUrl: '/borders/Platinum.png',
            allowedBorders: ['border_platinum', 'border_master', 'platinum', 'master'],
            label: 'Platinum & Master'
        };
    }

    // Handle 'platinum_master_legend'
    if (p === 'platinum_master_legend') {
        return {
            preset: 'platinum_master_legend',
            assignedBorder: 'border_legend',
            assignedBorderName: 'Legend',
            assignedBorderUrl: '/borders/Legend.png',
            allowedBorders: ['border_platinum', 'border_master', 'border_legend', 'platinum', 'master', 'legend'],
            label: 'Platinum, Master & Legend'
        };
    }

    // Direct preset check when customInput doesn't override
    if ((p === 'border_platinum' || p === 'platinum') && (!c || c === 'platinum')) {
        return {
            preset: 'border_platinum',
            assignedBorder: 'border_platinum',
            assignedBorderName: 'Platinum',
            assignedBorderUrl: '/borders/Platinum.png',
            allowedBorders: ['border_platinum', 'platinum'],
            label: 'Platinum'
        };
    }
    if ((p === 'border_master' || p === 'master') && (!c || c === 'master')) {
        return {
            preset: 'border_master',
            assignedBorder: 'border_master',
            assignedBorderName: 'Master',
            assignedBorderUrl: '/borders/Master.png',
            allowedBorders: ['border_master', 'master'],
            label: 'Master'
        };
    }
    if ((p === 'border_legend' || p === 'legend') && (!c || c === 'legend')) {
        return {
            preset: 'border_legend',
            assignedBorder: 'border_legend',
            assignedBorderName: 'Legend',
            assignedBorderUrl: '/borders/Legend.png',
            allowedBorders: ['border_legend', 'legend'],
            label: 'Legend'
        };
    }
    if ((p === 'border_immortal' || p === 'immortal') && (!c || c === 'immortal')) {
        return {
            preset: 'border_immortal',
            assignedBorder: 'border_immortal',
            assignedBorderName: 'Immortal',
            assignedBorderUrl: '/borders/Imortal.png',
            allowedBorders: ['border_immortal', 'immortal'],
            label: 'Immortal'
        };
    }

    // Parse custom text input (can be comma-separated or single border name)
    const allowed = [];
    let primaryBorder = null;

    if (c.includes('platinum')) {
        allowed.push('border_platinum', 'platinum');
        if (!primaryBorder) primaryBorder = STANDARD_BORDERS_MAP['border_platinum'];
    }
    if (c.includes('master')) {
        allowed.push('border_master', 'master');
        if (!primaryBorder) primaryBorder = STANDARD_BORDERS_MAP['border_master'];
    }
    if (c.includes('legend')) {
        allowed.push('border_legend', 'legend');
        if (!primaryBorder) primaryBorder = STANDARD_BORDERS_MAP['border_legend'];
    }
    if (c.includes('immortal') || c.includes('imortal')) {
        allowed.push('border_immortal', 'immortal');
        if (!primaryBorder) primaryBorder = STANDARD_BORDERS_MAP['border_immortal'];
    }

    // Also check custom borders stored by Admin
    try {
        const customBorders = storage.readData('custom_borders.json', []);
        if (Array.isArray(customBorders)) {
            customBorders.forEach(cb => {
                if (!cb) return;
                const cbName = String(cb.name || '').toLowerCase();
                const cbId = String(cb.id || '').toLowerCase();
                if (c && (cbName === c || cbId === c || c.includes(cbName) || c.includes(cbId))) {
                    allowed.push(cb.id, cbName);
                    if (!primaryBorder) {
                        primaryBorder = { id: cb.id, name: cb.name, url: cb.url || `/api/borders?action=image&id=${encodeURIComponent(cb.id)}` };
                    }
                }
            });
        }
    } catch (e) {}

    if (allowed.length > 0 && primaryBorder) {
        return {
            preset: 'custom',
            assignedBorder: primaryBorder.id,
            assignedBorderName: primaryBorder.name,
            assignedBorderUrl: primaryBorder.url,
            allowedBorders: allowed,
            label: String(customInput || primaryBorder.name).trim()
        };
    }

    // Fallback default
    return isExtend ? {
        preset: 'keep',
        assignedBorder: 'keep',
        assignedBorderName: 'Pertahankan Border',
        assignedBorderUrl: '',
        allowedBorders: ['keep'],
        label: 'Pertahankan Border'
    } : {
        preset: 'border_platinum',
        assignedBorder: 'border_platinum',
        assignedBorderName: 'Platinum',
        assignedBorderUrl: '/borders/Platinum.png',
        allowedBorders: ['border_platinum', 'platinum'],
        label: 'Platinum'
    };
}

async function readReferralConfigAsync() {
    try {
        const data = await storage.readDataAsync(REFERRAL_CONFIG_FILE, DEFAULT_REFERRAL_CONFIG);
        if (!data || typeof data !== 'object') {
            return { ...DEFAULT_REFERRAL_CONFIG };
        }
        return { ...DEFAULT_REFERRAL_CONFIG, ...data };
    } catch (e) {
        return { ...DEFAULT_REFERRAL_CONFIG };
    }
}

function readReferralConfigSync() {
    try {
        const data = storage.readData(REFERRAL_CONFIG_FILE, DEFAULT_REFERRAL_CONFIG);
        if (!data || typeof data !== 'object') {
            return { ...DEFAULT_REFERRAL_CONFIG };
        }
        return { ...DEFAULT_REFERRAL_CONFIG, ...data };
    } catch (e) {
        return { ...DEFAULT_REFERRAL_CONFIG };
    }
}

async function writeReferralConfigAsync(config) {
    try {
        const merged = { ...DEFAULT_REFERRAL_CONFIG, ...(config || {}), updatedAt: Date.now() };
        await storage.writeDataAsync(REFERRAL_CONFIG_FILE, merged);
        return merged;
    } catch (e) {
        console.error('[REFERRALS] Failed to save referral config:', e.message);
        return null;
    }
}

function createRandomCodeString(format, length, user) {
    const len = Math.max(1, Math.min(16, parseInt(length, 10) || 4));
    const fmt = String(format || 'alphanumeric').toLowerCase().trim();
    const digits = '0123456789';
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const mixed = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    if (fmt === 'numeric' || fmt === 'angka' || fmt === 'numbers') {
        let out = '';
        for (let i = 0; i < len; i++) {
            out += digits.charAt(Math.floor(Math.random() * digits.length));
        }
        if (out.startsWith('0')) out = String(Math.floor(1 + Math.random() * 9)) + out.slice(1);
        return out;
    }

    if (fmt === 'alpha' || fmt === 'huruf' || fmt === 'letters') {
        let out = '';
        for (let i = 0; i < len; i++) {
            out += letters.charAt(Math.floor(Math.random() * letters.length));
        }
        return out;
    }

    if (fmt === 'username_num' || fmt === 'username') {
        const cleanName = String(user?.username || 'USER').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'MUSIF';
        const uidSuffix = Math.floor(1000 + Math.random() * 9000).toString();
        return `${cleanName}${uidSuffix}`;
    }

    // Default: 'alphanumeric' (Campur Huruf & Angka)
    let out = '';
    for (let i = 0; i < len; i++) {
        out += mixed.charAt(Math.floor(Math.random() * mixed.length));
    }
    return out;
}

// Parse kode ketikan Admin (contoh: "MUSIFYSTAR7192" -> prefix "MUSIFYSTAR" + 4 angka acak berbeda tiap pengguna)
function parseAdminCodeTemplate(rawInput, fallbackFormat = 'numeric', fallbackLength = 4) {
    const raw = String(rawInput || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!raw) {
        return {
            prefix: 'MUSIFYSTAR',
            codeFormat: fallbackFormat || 'numeric',
            codeLength: Math.max(1, Math.min(16, parseInt(fallbackLength, 10) || 4)),
            adminExactCode: ''
        };
    }

    // 1. Jika semua angka (contoh: "719284") -> murni angka acak sepanjang ketikan untuk pengguna lain
    if (/^\d+$/.test(raw)) {
        return {
            prefix: '',
            codeFormat: 'numeric',
            codeLength: Math.max(2, Math.min(16, raw.length)),
            adminExactCode: raw
        };
    }

    // 2. Jika diawali teks/huruf dan diakhiri angka (contoh: "MUSIFYSTAR7192" atau "MUSIFY-8899")
    // -> Di akun Admin kodenya persis "MUSIFYSTAR7192", sedangkan di pengguna lain depannya tetap "MUSIFYSTAR" dan bagian nomor "7192" diacak berbeda-beda!
    const trailingDigitsMatch = raw.match(/^(.*?)(\d+)$/);
    if (trailingDigitsMatch && trailingDigitsMatch[1].length > 0) {
        return {
            prefix: trailingDigitsMatch[1],
            codeFormat: 'numeric',
            codeLength: Math.max(1, Math.min(16, trailingDigitsMatch[2].length)),
            adminExactCode: raw
        };
    }

    // 3. Jika hanya huruf pendek (contoh: "KLMNPQ") dan mode huruf
    if (fallbackFormat === 'alpha' && /^[A-Z]{3,10}$/.test(raw) && !raw.includes('MUSIFY')) {
        return {
            prefix: '',
            codeFormat: 'alpha',
            codeLength: raw.length,
            adminExactCode: raw
        };
    }

    // 4. Jika teks awalan tanpa angka di belakang (contoh: "MUSIFYSTAR" atau "MUSIFYSTAR-STUDIO-MUSIK")
    // -> Tambahkan 4 angka acak berbeda untuk setiap pengguna agar setiap pengguna punya kode unik
    const numLen = Math.max(2, Math.min(16, parseInt(fallbackLength, 10) || 4));
    const firstRandom = createRandomCodeString('numeric', numLen);
    return {
        prefix: raw,
        codeFormat: 'numeric',
        codeLength: numLen,
        adminExactCode: `${raw}${firstRandom}`
    };
}

function generateReferralCodeForUser(user, allUsers = [], forceRegenerate = false, overrideConfig = null) {
    const cfg = overrideConfig || readReferralConfigSync();
    const usersArr = Array.isArray(allUsers) ? allUsers : [];

    // Jika user sudah punya kode dan tidak dipaksa regenerate, pastikan kodenya UNIK (tidak sama dengan pengguna lain)
    if (!forceRegenerate && user && user.referralCode && String(user.referralCode).trim().length >= 2) {
        const currentCode = String(user.referralCode).trim().toUpperCase();
        const isDuplicate = usersArr.some(other =>
            other &&
            other !== user &&
            String(other.id) !== String(user.id) &&
            String(other.referralCode || '').trim().toUpperCase() === currentCode
        );
        if (!isDuplicate) {
            user.referralCode = currentCode;
            return currentCode;
        }
        // Jika duplikat dengan pengguna lain: biarkan akun Master Admin tetap memakai kode utamanya, dan acak nomor untuk pengguna lain
        const userEmail = String(user.rawEmail || user.email || '').toLowerCase().trim();
        if (userEmail === 'jrnabil570@gmail.com') {
            user.referralCode = currentCode;
            return currentCode;
        }
    }

    let rawPrefix = (cfg.codePrefix !== undefined && cfg.codePrefix !== null) ? String(cfg.codePrefix).trim().toUpperCase() : '';
    let fmt = String(cfg.codeFormat || 'numeric').toLowerCase().trim();
    let len = Math.max(1, Math.min(16, parseInt(cfg.codeLength, 10) || 4));

    if (fmt === 'custom' || (rawPrefix && /\d+$/.test(rawPrefix))) {
        const parsed = parseAdminCodeTemplate(rawPrefix || cfg.customGlobalCode || 'MUSIFYSTAR7192', 'numeric', 4);
        rawPrefix = parsed.prefix;
        fmt = parsed.codeFormat;
        len = parsed.codeLength;
    }

    const prefix = (rawPrefix && rawPrefix !== 'MS-') ? rawPrefix : (rawPrefix === 'MS-' ? 'MUSIFYSTAR' : '');

    let candidate = `${prefix}${createRandomCodeString(fmt, len, user)}`;
    let attempt = 0;
    while (
        usersArr.some(u => u && u !== user && String(u.id) !== String(user?.id) && String(u.referralCode || '').trim().toUpperCase() === candidate) &&
        attempt < 100
    ) {
        attempt++;
        candidate = `${prefix}${createRandomCodeString(fmt, len, user)}`;
    }
    if (user) {
        user.referralCode = candidate;
    }
    return candidate;
}

function findCatalogBadge(identifier) {
    if (!identifier) return null;
    const key = String(identifier).trim().toLowerCase();
    return DONATUR_BADGES_CATALOG.find(b =>
        b.id.toLowerCase() === key ||
        (b.legacyId && b.legacyId.toLowerCase() === key) ||
        b.tier.toLowerCase() === key ||
        b.name.toLowerCase() === key
    ) || null;
}

function resolveUserDonaturInfo(user) {
    if (!user) {
        return {
            isDonatur: false,
            supportCount: 0,
            donaturTier: 'none',
            donaturBadgeId: '',
            donaturBadgeTitle: '',
            donaturBadgeColor: '',
            showDonaturBadge: false,
            activeBadge: null,
            unlockedBadges: []
        };
    }

    const email = String(user.rawEmail || user.email || '').toLowerCase().trim();
    const isMaster = (email === 'jrnabil570@gmail.com');

    // Calculate support count
    let supportCount = typeof user.supportCount === 'number' ? user.supportCount : 0;
    const isVipExpired = user.vipExpiresAt && Date.now() > user.vipExpiresAt;
    const isUserVip = isMaster || (Boolean(user.isPremium || user.is_premium || (user.vipTier && user.vipTier !== 'none')) && user.vipTier !== 'none' && !isVipExpired);

    if (isMaster && supportCount < 10) {
        supportCount = 10;
    } else if (supportCount === 0 && isUserVip && user.vipSource !== 'referral') {
        if (user.vipTier === 'permanent' || user.vipTier === 'lifetime' || user.vipTier === 'sultan') supportCount = 6;
        else if (user.vipTier === '5months') supportCount = 4;
        else if (user.vipTier === '2months') supportCount = 2;
        else supportCount = 1;
    }

    const manualBadgePref = user.supportBadge || user.donaturBadgeId || user.donaturTier || '';
    const forcedCatalog = (manualBadgePref && manualBadgePref !== 'auto' && manualBadgePref !== 'none')
        ? findCatalogBadge(manualBadgePref)
        : null;

    // Determine unlocked Donatur badges
    const unlockedBadges = DONATUR_BADGES_CATALOG.filter(b => {
        if (isMaster) return true;
        if (supportCount >= b.minSupport) return true;
        if (forcedCatalog && b.minSupport <= forcedCatalog.minSupport) return true;
        if (user.vipTier === 'permanent' && b.id === 'badge_sultan_donatur') return true;
        return false;
    });

    const isExplicitlyDisabled = (user.donaturTier === 'none' || user.supportBadge === 'none');
    const isDonatur = !isExplicitlyDisabled && (isMaster || supportCount > 0 || Boolean(forcedCatalog) || unlockedBadges.length > 0);

    if (!isDonatur) {
        return {
            isDonatur: false,
            supportCount: supportCount,
            donaturTier: 'none',
            donaturBadgeId: '',
            donaturBadgeTitle: '',
            donaturBadgeColor: '',
            showDonaturBadge: false,
            activeBadge: null,
            unlockedBadges: unlockedBadges
        };
    }

    const highestUnlocked = unlockedBadges[unlockedBadges.length - 1] || DONATUR_BADGES_CATALOG[0];
    const selectedBadgeObj = forcedCatalog || findCatalogBadge(user.equippedSupporterBadge) || highestUnlocked;
    const showDonaturBadge = user.showDonaturBadge !== false && user.equippedSupporterBadge !== 'none';

    const activeBadgeObj = showDonaturBadge ? {
        ...selectedBadgeObj,
        title: user.donaturBadgeTitle || selectedBadgeObj.title,
        shortLabel: user.donaturBadgeTitle || selectedBadgeObj.shortLabel || selectedBadgeObj.title,
        color: user.donaturBadgeColor || selectedBadgeObj.color
    } : null;

    return {
        isDonatur: true,
        supportCount: Math.max(1, supportCount),
        donaturTier: selectedBadgeObj.tier,
        donaturBadgeId: selectedBadgeObj.id,
        donaturBadgeTitle: activeBadgeObj ? activeBadgeObj.title : selectedBadgeObj.title,
        donaturBadgeColor: activeBadgeObj ? activeBadgeObj.color : selectedBadgeObj.color,
        showDonaturBadge: showDonaturBadge,
        activeBadge: activeBadgeObj,
        unlockedBadges: unlockedBadges
    };
}

function canReferralVipEquipBorder(user, borderObj) {
    if (!borderObj || borderObj.id === 'none' || !borderObj.isVip) return true;
    const email = String(user?.rawEmail || user?.email || '').toLowerCase().trim();
    if (email === 'jrnabil570@gmail.com') return true;

    // Only restrict if user got VIP from referral and has referralBorderRestricted
    if (!user || !user.referralBorderRestricted) return null; // null means use standard VIP tier check

    const config = readReferralConfigSync();
    const allowedList = (Array.isArray(user.referralAllowedBorders) && user.referralAllowedBorders.length > 0)
        ? user.referralAllowedBorders
        : (Array.isArray(config.newVipAllowedBorders) ? config.newVipAllowedBorders : ['border_platinum', 'platinum']);

    const normAllowed = allowedList.map(x => String(x || '').toLowerCase().trim());
    if (normAllowed.includes('all') || normAllowed.includes('semua')) return true;
    if (normAllowed.includes('none') || normAllowed.length === 0) return false;

    const bId = String(borderObj.id || '').toLowerCase().trim();
    const bName = String(borderObj.name || '').toLowerCase().trim();
    const bCat = String(borderObj.category || '').toLowerCase().trim();

    if (normAllowed.includes(bId) || (bName && normAllowed.includes(bName)) || (bCat && normAllowed.includes(bCat))) {
        return true;
    }
    if (bId.includes('platinum') && normAllowed.includes('platinum')) return true;
    if (bId.includes('master') && normAllowed.includes('master')) return true;
    if (bId.includes('legend') && normAllowed.includes('legend')) return true;
    if ((bId.includes('immortal') || bId.includes('imortal')) && (normAllowed.includes('immortal') || normAllowed.includes('imortal'))) return true;

    return false;
}

async function processReferralReward(referrer, invitee, dbUsers) {
    const config = await readReferralConfigAsync();
    if (config.isActive === false || config.enabled === false) {
        return { rewarded: false, message: 'Sistem referral sedang dinonaktifkan oleh Admin.' };
    }

    const limitInfo = resolveUserInviteLimitInfo(referrer, config);
    if (limitInfo.isLimitReached) {
        return {
            rewarded: false,
            limitReached: true,
            message: `Mohon maaf Anda sudah mengundang teman ${limitInfo.referralCount}/${limitInfo.maxInvites} batas sudah tercapai`
        };
    }

    const email = String(referrer.rawEmail || referrer.email || '').toLowerCase().trim();
    const isMaster = (email === 'jrnabil570@gmail.com');
    const isVipExpired = referrer.vipExpiresAt && Date.now() > referrer.vipExpiresAt;
    const isTierActive = Boolean(referrer.vipTier && referrer.vipTier !== 'none');
    const wasVip = isMaster || (Boolean(referrer.isPremium || referrer.is_premium || isTierActive) && referrer.vipTier !== 'none' && !isVipExpired);

    const pointsEarned = Number(config.pointsPerReferral) >= 0 ? Number(config.pointsPerReferral) : 100;
    referrer.referralCount = (Number(referrer.referralCount) || 0) + 1;
    referrer.referralPoints = (Number(referrer.referralPoints) || 0) + pointsEarned;
    referrer.referredUsers = Array.isArray(referrer.referredUsers) ? referrer.referredUsers : [];

    const targetInvites = Math.max(1, Number(config.targetInvitesForVip) || 1);
    const shouldGrantVipNow = (referrer.referralCount % targetInvites === 0);

    let rewardSummary = `+${pointsEarned} Poin Referral`;

    if (shouldGrantVipNow) {
        if (!wasVip) {
            // PENGGUNA BELUM VIP -> BARU PERTAMA DAPAT VIP DARI REFERRAL
            const rawNewDur = config.newVipCustomText || config.newVipDurationText || config.newVipDurationDays || 7;
            const durInfo = parseDurationInput(rawNewDur, 7);
            const rawNewBorderText = config.newVipBorderCustomText || config.newVipBorderCustomInput || 'Platinum';
            const borderInfo = parseBorderConfigInput(config.newVipBorderPreset, rawNewBorderText, false);

            if (durInfo.days >= 0) {
                referrer.isPremium = true;
                referrer.is_premium = true;
                referrer.isVip = true;
                referrer.is_vip = true;
                referrer.vipSource = 'referral';
                referrer.unlockAllSettingsFeatures = true;
                referrer.vipGrantedAt = Date.now();

                if (durInfo.isPermanent || durInfo.days === 0) {
                    referrer.vipTier = 'permanent';
                    referrer.vipExpiresAt = null;
                } else {
                    referrer.vipTier = '1month';
                    referrer.vipExpiresAt = Date.now() + (durInfo.days * 24 * 60 * 60 * 1000);
                }

                // Set Border according to Admin's Referral configuration
                referrer.referralBorderRestricted = !borderInfo.allowedBorders.includes('all');
                referrer.referralAllowedBorders = borderInfo.allowedBorders;

                if (borderInfo.assignedBorder === 'none' || !borderInfo.assignedBorder) {
                    referrer.border = '';
                    referrer.borderName = '';
                    referrer.borderUrl = '';
                } else if (borderInfo.assignedBorder !== 'keep') {
                    referrer.border = borderInfo.assignedBorder;
                    referrer.borderName = borderInfo.assignedBorderName;
                    referrer.borderUrl = borderInfo.assignedBorderUrl;
                }

                rewardSummary += ` + Akses VIP Baru (${durInfo.label}) & Border: ${borderInfo.label}`;
            }
        } else {
            // PENGGUNA SUDAH VIP -> PERPANJANG VIP / MASA TRIAL DARI REFERRAL
            const rawExtDur = config.extendVipCustomText || config.extendVipDurationText || config.extendVipDurationDays || 7;
            const durInfo = parseDurationInput(rawExtDur, 7);
            const rawExtBorderText = config.extendVipBorderCustomText || config.extendVipBorderCustomInput || 'Pertahankan Border';
            const borderInfo = parseBorderConfigInput(config.extendVipBorderPreset, rawExtBorderText, true);

            if (durInfo.days >= 0) {
                referrer.isPremium = true;
                referrer.is_premium = true;
                referrer.isVip = true;
                referrer.is_vip = true;

                if (durInfo.isPermanent || durInfo.days === 0 || referrer.vipTier === 'permanent') {
                    referrer.vipTier = 'permanent';
                    referrer.vipExpiresAt = null;
                    rewardSummary += ` + Upgrade VIP Permanen`;
                } else {
                    const baseExp = (referrer.vipExpiresAt && referrer.vipExpiresAt > Date.now()) ? referrer.vipExpiresAt : Date.now();
                    referrer.vipExpiresAt = baseExp + (durInfo.days * 24 * 60 * 60 * 1000);
                    rewardSummary += ` + Perpanjangan VIP (${durInfo.label})`;
                }

                // Update border if Admin configured extendVipBorderPreset !== 'keep'
                if (borderInfo.preset !== 'keep' && borderInfo.assignedBorder !== 'keep') {
                    if (referrer.vipSource === 'referral') {
                        referrer.referralBorderRestricted = !borderInfo.allowedBorders.includes('all');
                        referrer.referralAllowedBorders = borderInfo.allowedBorders;
                    }
                    if (borderInfo.assignedBorder === 'none') {
                        referrer.border = '';
                        referrer.borderName = '';
                        referrer.borderUrl = '';
                    } else if (borderInfo.assignedBorder) {
                        referrer.border = borderInfo.assignedBorder;
                        referrer.borderName = borderInfo.assignedBorderName;
                        referrer.borderUrl = borderInfo.assignedBorderUrl;
                    }
                }
            }
        }
    }

    // Also reward invitee (teman yang diundang) if configured
    let inviteeRewardSummary = '';
    if (invitee && config.inviteeRewardEnabled !== false) {
        const bonusPts = Number(config.inviteeBonusPoints) || 0;
        if (bonusPts > 0) {
            invitee.referralPoints = (Number(invitee.referralPoints) || 0) + bonusPts;
            inviteeRewardSummary += `+${bonusPts} Poin`;
        }
        const rawInvDur = config.inviteeCustomText || config.inviteeBonusDaysText || config.inviteeBonusDays || 3;
        const inviteeDur = parseDurationInput(rawInvDur, 3);
        if (inviteeDur.days > 0 || inviteeDur.isPermanent) {
            const invEmail = String(invitee.rawEmail || invitee.email || '').toLowerCase().trim();
            const invWasVip = (invEmail === 'jrnabil570@gmail.com') || (Boolean(invitee.isPremium || invitee.is_premium) && invitee.vipTier !== 'none' && (!invitee.vipExpiresAt || invitee.vipExpiresAt > Date.now()));
            const rawInvBorder = config.inviteeBorderCustomText || config.newVipBorderCustomText || config.newVipBorderCustomInput || 'Platinum';
            const borderInfo = parseBorderConfigInput(config.inviteeBorderPreset || config.newVipBorderPreset, rawInvBorder, false);

            invitee.isPremium = true;
            invitee.is_premium = true;
            invitee.isVip = true;
            invitee.is_vip = true;
            if (!invWasVip) {
                invitee.vipSource = 'referral';
                invitee.unlockAllSettingsFeatures = true;
                invitee.referralBorderRestricted = !borderInfo.allowedBorders.includes('all');
                invitee.referralAllowedBorders = borderInfo.allowedBorders;
                if (borderInfo.assignedBorder && borderInfo.assignedBorder !== 'none' && borderInfo.assignedBorder !== 'keep') {
                    invitee.border = borderInfo.assignedBorder;
                    invitee.borderName = borderInfo.assignedBorderName;
                    invitee.borderUrl = borderInfo.assignedBorderUrl;
                }
            }
            if (inviteeDur.isPermanent) {
                invitee.vipTier = 'permanent';
                invitee.vipExpiresAt = null;
            } else {
                if (!invitee.vipTier || invitee.vipTier === 'none') invitee.vipTier = '1month';
                const baseExp = (invWasVip && invitee.vipExpiresAt && invitee.vipExpiresAt > Date.now()) ? invitee.vipExpiresAt : Date.now();
                invitee.vipExpiresAt = baseExp + (inviteeDur.days * 24 * 60 * 60 * 1000);
            }
            inviteeRewardSummary += (inviteeRewardSummary ? ' & ' : '') + `Trial VIP ${inviteeDur.label}`;
        }
    }

    referrer.referredUsers.unshift({
        userId: invitee ? invitee.id : '',
        username: invitee ? invitee.username : 'Member Baru',
        avatar: invitee ? (invitee.avatar || '/logo.png') : '/logo.png',
        joinedAt: Date.now(),
        wasVipBefore: wasVip,
        rewardSummary: rewardSummary
    });

    return {
        rewarded: true,
        wasVip: wasVip,
        rewardSummary: rewardSummary,
        inviteeRewardSummary: inviteeRewardSummary
    };
}

async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');
    const method = req.method;
    let body = req.body || {};
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const action = String(req.query.action || body.action || 'get_info').trim().toLowerCase();

    try {
        const config = await readReferralConfigAsync();
        const usersDb = await storage.readDataAsync(USERS_FILE, { users: [], sessions: {} });
        usersDb.users = Array.isArray(usersDb.users) ? usersDb.users : [];

        // 1. PUBLIC / USER: GET REFERRAL & SUPPORTER INFO
        if (action === 'get_info' || action === 'info' || action === 'leaderboard') {
            const targetUserId = String(req.query.userId || body.userId || '').trim();
            const targetUsername = String(req.query.username || body.username || '').trim().toLowerCase();

            let dbModified = false;
            const seenCodes = new Set();
            // Prioritaskan akun Master Admin terlebih dahulu agar kodenya (misal MUSIFYSTAR7192) tetap miliknya, lalu pengguna lain yang duplikat otomatis diacak nomornya
            const sortedForCheck = [...usersDb.users].sort((a, b) => {
                const aMaster = String(a?.rawEmail || a?.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com' ? -1 : 0;
                const bMaster = String(b?.rawEmail || b?.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com' ? -1 : 0;
                return aMaster - bMaster;
            });
            sortedForCheck.forEach(u => {
                if (!u) return;
                const cur = String(u.referralCode || '').trim().toUpperCase();
                if (!cur || seenCodes.has(cur)) {
                    generateReferralCodeForUser(u, usersDb.users, true, config);
                    dbModified = true;
                }
                seenCodes.add(String(u.referralCode || '').trim().toUpperCase());
            });
            if (dbModified) {
                await storage.writeDataAsync(USERS_FILE, usersDb);
            }

            let myUser = null;
            if (targetUserId) {
                myUser = usersDb.users.find(u => String(u.id) === targetUserId || String(u.originalId) === targetUserId);
            }
            if (!myUser && targetUsername) {
                myUser = usersDb.users.find(u => u.username && u.username.toLowerCase() === targetUsername);
            }

            // Build Top Supporters & Top Referrers lists
            const supportersList = [];
            const referrersList = [];

            usersDb.users.forEach(u => {
                if (!u || !u.username) return;
                const dInfo = resolveUserDonaturInfo(u);
                const email = String(u.rawEmail || u.email || '').toLowerCase().trim();
                const isMaster = (email === 'jrnabil570@gmail.com');
                const isVipExpired = u.vipExpiresAt && Date.now() > u.vipExpiresAt;
                const isUserVip = isMaster || (Boolean(u.isPremium || u.is_premium || (u.vipTier && u.vipTier !== 'none')) && u.vipTier !== 'none' && !isVipExpired);

                if (dInfo.isDonatur) {
                    supportersList.push({
                        id: u.id,
                        username: u.username,
                        avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}`,
                        border: isUserVip ? (u.border || '') : '',
                        borderUrl: isUserVip ? (u.borderUrl || '') : '',
                        borderName: isUserVip ? (u.borderName || '') : '',
                        isVip: isUserVip,
                        vipTier: isMaster ? 'permanent' : (isUserVip ? (u.vipTier || '1month') : 'none'),
                        supportCount: dInfo.supportCount,
                        donaturTier: dInfo.donaturTier,
                        donaturBadgeId: dInfo.donaturBadgeId,
                        donaturBadgeTitle: dInfo.donaturBadgeTitle,
                        donaturBadgeColor: dInfo.donaturBadgeColor,
                        donatur: dInfo,
                        isMasterAdmin: isMaster
                    });
                }

                if ((Number(u.referralCount) || 0) > 0) {
                    referrersList.push({
                        id: u.id,
                        username: u.username,
                        avatar: u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(u.username)}`,
                        borderUrl: isUserVip ? (u.borderUrl || '') : '',
                        isVip: isUserVip,
                        referralCount: Number(u.referralCount) || 0,
                        referralPoints: Number(u.referralPoints) || 0
                    });
                }
            });

            supportersList.sort((a, b) => (b.supportCount - a.supportCount));
            referrersList.sort((a, b) => (b.referralCount - a.referralCount) || (b.referralPoints - a.referralPoints));

            const rawNewText = config.newVipBorderCustomText || config.newVipBorderCustomInput || 'Platinum';
            const rawExtText = config.extendVipBorderCustomText || config.extendVipBorderCustomInput || 'Pertahankan Border';
            const newBorderInfo = parseBorderConfigInput(config.newVipBorderPreset, rawNewText, false);
            const extBorderInfo = parseBorderConfigInput(config.extendVipBorderPreset, rawExtText, true);
            const newDurInfo = parseDurationInput(config.newVipCustomText || config.newVipDurationText || config.newVipDurationDays, 7);
            const extDurInfo = parseDurationInput(config.extendVipCustomText || config.extendVipDurationText || config.extendVipDurationDays, 7);
            const freeLimInfo = parseMaxInvitesInput(config.freeMaxInvitesText !== undefined ? config.freeMaxInvitesText : config.freeMaxInvites, 10);
            const vipLimInfo = parseMaxInvitesInput(config.vipMaxInvitesText !== undefined ? config.vipMaxInvitesText : config.vipMaxInvites, 35);

            const referredList = myUser && Array.isArray(myUser.referredUsers) ? myUser.referredUsers : [];
            const myLimitInfo = myUser ? resolveUserInviteLimitInfo(myUser, config) : resolveUserInviteLimitInfo(null, config);

            return res.json({
                status: true,
                config: {
                    ...config,
                    enabled: config.isActive !== false && config.enabled !== false,
                    newVipCustomText: config.newVipCustomText || config.newVipDurationText || newDurInfo.label,
                    newVipBorderCustomText: config.newVipBorderCustomText || config.newVipBorderCustomInput || newBorderInfo.label,
                    extendVipCustomText: config.extendVipCustomText || config.extendVipDurationText || extDurInfo.label,
                    extendVipBorderCustomText: config.extendVipBorderCustomText || config.extendVipBorderCustomInput || extBorderInfo.label,
                    newVipDurationLabel: newDurInfo.label,
                    newVipBorderLabel: newBorderInfo.label,
                    extendVipDurationLabel: extDurInfo.label,
                    extendVipBorderLabel: extBorderInfo.label,
                    freeMaxInvites: freeLimInfo.maxInvites,
                    freeMaxInvitesText: freeLimInfo.rawText,
                    freeMaxInvitesLabel: freeLimInfo.label,
                    freeIsUnlimited: freeLimInfo.isUnlimited,
                    vipMaxInvites: vipLimInfo.maxInvites,
                    vipMaxInvitesText: vipLimInfo.rawText,
                    vipMaxInvitesLabel: vipLimInfo.label,
                    vipIsUnlimited: vipLimInfo.isUnlimited
                },
                donaturCatalog: DONATUR_BADGES_CATALOG,
                supporterBadgesCatalog: DONATUR_BADGES_CATALOG,
                supporters: supportersList.slice(0, 50),
                topSupporters: supportersList.slice(0, 50),
                topReferrers: referrersList.slice(0, 30),
                allUsers: usersDb.users.filter(u => u && u.username).map(u => {
                    const uLim = resolveUserInviteLimitInfo(u, config);
                    return {
                        id: u.id,
                        username: u.username,
                        email: u.rawEmail || u.email || '',
                        referralCode: generateReferralCodeForUser(u, usersDb.users, false, config),
                        referralCount: Number(u.referralCount) || 0,
                        referralPoints: Number(u.referralPoints) || 0,
                        supportCount: Number(u.supportCount) || 0,
                        inviteLimit: uLim,
                        donatur: resolveUserDonaturInfo(u)
                    };
                }),
                myReferral: myUser ? {
                    referralCode: generateReferralCodeForUser(myUser, usersDb.users, false, config),
                    referralCount: Number(myUser.referralCount) || 0,
                    referralPoints: Number(myUser.referralPoints) || 0,
                    maxInvites: myLimitInfo.maxInvites,
                    isUnlimitedInvites: myLimitInfo.isUnlimited,
                    isLimitReached: myLimitInfo.isLimitReached,
                    remainingInvites: myLimitInfo.remainingInvites,
                    ratioText: myLimitInfo.ratioText,
                    limitLabel: myLimitInfo.limitLabel,
                    limitReachedText: myLimitInfo.limitReachedText,
                    userTypeLabel: myLimitInfo.userTypeLabel,
                    inviteLimit: myLimitInfo,
                    referredBy: myUser.referredBy || null,
                    referredByUsername: myUser.referredByUsername || '',
                    referredUsers: referredList,
                    invitedUsers: referredList,
                    vipSource: myUser.vipSource || 'standard',
                    referralBorderRestricted: Boolean(myUser.referralBorderRestricted),
                    referralAllowedBorders: Array.isArray(myUser.referralAllowedBorders) ? myUser.referralAllowedBorders : [],
                    donatur: resolveUserDonaturInfo(myUser)
                } : null
            });
        }

        // 2. USER ACTION: REDEEM / APPLY FRIEND'S REFERRAL CODE
        if (action === 'claim_code' || action === 'redeem_referral') {
            if (method !== 'POST') {
                return res.status(405).json({ status: false, message: 'Metode harus POST' });
            }
            const rawCode = String(body.referralCode || body.code || '').trim().toUpperCase();
            const targetUserId = String(body.userId || body.id || '').trim();
            const targetUsername = String(body.username || '').trim().toLowerCase();

            if (!rawCode) {
                return res.status(400).json({ status: false, message: 'Masukkan kode referral teman terlebih dahulu!' });
            }

            const inviteeIndex = usersDb.users.findIndex(u =>
                (targetUserId && (String(u.id) === targetUserId || String(u.originalId) === targetUserId)) ||
                (targetUsername && u.username && u.username.toLowerCase() === targetUsername)
            );
            if (inviteeIndex === -1) {
                return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu untuk memasukkan kode referral!' });
            }

            const invitee = usersDb.users[inviteeIndex];
            if (invitee.referredBy) {
                return res.status(400).json({ status: false, message: `Akun Anda sudah pernah menggunakan kode referral (@${invitee.referredByUsername || invitee.referredBy}) sebelumnya!` });
            }

            // Pastikan semua pengguna memiliki kode referral unik masing-masing
            const seenCodesClaim = new Set();
            usersDb.users.forEach(u => {
                if (!u) return;
                const c = String(u.referralCode || '').trim().toUpperCase();
                if (!c || seenCodesClaim.has(c)) {
                    generateReferralCodeForUser(u, usersDb.users, true, config);
                }
                seenCodesClaim.add(String(u.referralCode || '').trim().toUpperCase());
            });

            // TOLAK LANGSUNG jika pengguna mencoba memasukkan kode referral miliknya sendiri ("kode yang diatas")
            const inviteeOwnCode = String(invitee.referralCode || '').trim().toUpperCase();
            if (
                (inviteeOwnCode && rawCode === inviteeOwnCode) ||
                (invitee.username && rawCode.toLowerCase() === invitee.username.toLowerCase()) ||
                String(invitee.id) === rawCode
            ) {
                return res.status(400).json({
                    status: false,
                    message: 'Anda tidak dapat menggunakan kode referral milik Anda sendiri! Silakan bagikan kode tersebut ke teman Anda.'
                });
            }

            // Cari pengundang yang memiliki kode referral tersebut
            const referrerIndex = usersDb.users.findIndex(u =>
                u &&
                String(u.id) !== String(invitee.id) &&
                u.username.toLowerCase() !== invitee.username.toLowerCase() &&
                (String(u.referralCode || '').trim().toUpperCase() === rawCode || u.username.toLowerCase() === rawCode.toLowerCase() || String(u.id) === rawCode)
            );

            if (referrerIndex === -1) {
                return res.status(404).json({ status: false, message: `Kode referral "${rawCode}" tidak ditemukan. Pastikan kode referral teman Anda benar!` });
            }

            const referrer = usersDb.users[referrerIndex];
            if (String(referrer.id) === String(invitee.id) || referrer.username.toLowerCase() === invitee.username.toLowerCase()) {
                return res.status(400).json({ status: false, message: 'Anda tidak dapat menggunakan kode referral milik Anda sendiri!' });
            }

            // Cek apakah pengundang sudah mencapai batas maksimal undang teman (contoh: 10/10 untuk Gratis atau 35/35 untuk VIP)
            const refLimitInfo = resolveUserInviteLimitInfo(referrer, config);
            if (refLimitInfo.isLimitReached) {
                return res.status(400).json({
                    status: false,
                    limitReached: true,
                    message: `Mohon maaf, @${referrer.username} sudah mengundang teman ${refLimitInfo.referralCount}/${refLimitInfo.maxInvites} batas sudah tercapai!`
                });
            }

            // Prevent circular referral A <-> B
            if (referrer.referredBy && String(referrer.referredBy) === String(invitee.id)) {
                return res.status(400).json({ status: false, message: 'Tidak dapat menggunakan kode referral silang dengan pengguna yang Anda undang.' });
            }

            invitee.referredBy = referrer.id;
            invitee.referredByUsername = referrer.username;
            invitee.referredByCode = referrer.referralCode;
            invitee.referredAt = Date.now();

            const rewardResult = await processReferralReward(referrer, invitee, usersDb.users);
            usersDb.users[referrerIndex] = referrer;
            usersDb.users[inviteeIndex] = invitee;
            await storage.writeDataAsync(USERS_FILE, usersDb);

            const updatedRefLimit = resolveUserInviteLimitInfo(referrer, config);
            const limitNotice = updatedRefLimit.isLimitReached
                ? ` (Kuota undangan @${referrer.username} kini telah mencapai batas maksimal ${updatedRefLimit.referralCount}/${updatedRefLimit.maxInvites})`
                : '';

            return res.json({
                status: true,
                message: `🎉 Kode referral @${referrer.username} berhasil digunakan! ${rewardResult.inviteeRewardSummary ? `Anda mendapat bonus ${rewardResult.inviteeRewardSummary}. ` : ''}@${referrer.username} menerima ${rewardResult.rewardSummary}!${limitNotice}`,
                invitee: {
                    id: invitee.id,
                    username: invitee.username,
                    isPremium: invitee.isPremium,
                    vipTier: invitee.vipTier,
                    vipExpiresAt: invitee.vipExpiresAt,
                    vipSource: invitee.vipSource || 'standard',
                    referralBorderRestricted: Boolean(invitee.referralBorderRestricted),
                    referralAllowedBorders: invitee.referralAllowedBorders || [],
                    border: invitee.border || '',
                    borderName: invitee.borderName || '',
                    borderUrl: invitee.borderUrl || '',
                    referralPoints: invitee.referralPoints || 0,
                    referredBy: invitee.referredBy,
                    referredByUsername: invitee.referredByUsername
                }
            });
        }

        // 3. USER ACTION: EQUIP / TOGGLE DONATUR BADGE
        if (action === 'equip_donatur_badge' || action === 'equip_supporter_badge') {
            if (method !== 'POST') {
                return res.status(405).json({ status: false, message: 'Metode harus POST' });
            }
            const targetUserId = String(body.userId || body.id || '').trim();
            const targetUsername = String(body.username || '').trim().toLowerCase();
            const badgeId = String(body.badgeId || '').trim();
            const showBadge = body.showBadge !== false && badgeId !== 'none';

            const uIdx = usersDb.users.findIndex(u =>
                (targetUserId && (String(u.id) === targetUserId || String(u.originalId) === targetUserId)) ||
                (targetUsername && u.username && u.username.toLowerCase() === targetUsername)
            );
            if (uIdx === -1) {
                return res.status(404).json({ status: false, message: 'Pengguna tidak ditemukan' });
            }

            const user = usersDb.users[uIdx];
            const dInfo = resolveUserDonaturInfo(user);
            if (!dInfo.isDonatur) {
                return res.status(403).json({ status: false, message: 'Lencana Donatur terkunci! Berlangganan VIP atau dukung MusifyStar untuk membuka lencana ini.' });
            }

            if (!showBadge) {
                user.showDonaturBadge = false;
                user.equippedSupporterBadge = 'none';
            } else {
                const targetBadge = dInfo.unlockedBadges.find(b => b.id === badgeId || b.legacyId === badgeId || b.tier === badgeId);
                if (!targetBadge) {
                    return res.status(403).json({ status: false, message: 'Tingkatan Lencana Donatur ini belum terbuka untuk akun Anda.' });
                }
                user.donaturBadgeId = targetBadge.id;
                user.equippedSupporterBadge = targetBadge.id;
                user.donaturBadgeTitle = targetBadge.title;
                user.donaturBadgeColor = targetBadge.color;
                user.showDonaturBadge = true;
            }

            usersDb.users[uIdx] = user;
            await storage.writeDataAsync(USERS_FILE, usersDb);

            const updatedDonatur = resolveUserDonaturInfo(user);
            return res.json({
                status: true,
                message: user.showDonaturBadge ? `Lencana Kehormatan "${updatedDonatur.donaturBadgeTitle}" berhasil dipasang ke profil!` : 'Lencana Donatur disembunyikan dari profil.',
                donatur: updatedDonatur
            });
        }

        // 4. ADMIN ACTIONS (REQUIRE ADMIN TOKEN)
        const rawAuthHeader = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
        const adminToken = req.headers['x-admin-token'] || rawAuthHeader || body.adminToken || req.query.adminToken;
        if (!adminToken || !adminAuth.verifyToken(adminToken)) {
            return res.status(401).json({ status: false, message: 'Akses Ditolak: Token Admin tidak valid atau sesi kedaluwarsa.' });
        }

        // 4A. SAVE ADMIN REFERRAL CONFIGURATION
        if (action === 'admin_save_config') {
            const rawNewDur = body.newVipCustomText !== undefined ? body.newVipCustomText : (body.newVipDurationText !== undefined ? body.newVipDurationText : body.newVipDurationDays);
            const newDurInfo = parseDurationInput(rawNewDur, 7);

            const rawNewBorderText = body.newVipBorderCustomText !== undefined ? body.newVipBorderCustomText : body.newVipBorderCustomInput;
            const newBorderInfo = parseBorderConfigInput(body.newVipBorderPreset, rawNewBorderText, false);

            const rawExtDur = body.extendVipCustomText !== undefined ? body.extendVipCustomText : (body.extendVipDurationText !== undefined ? body.extendVipDurationText : body.extendVipDurationDays);
            const extDurInfo = parseDurationInput(rawExtDur, 7);

            const rawExtBorderText = body.extendVipBorderCustomText !== undefined ? body.extendVipBorderCustomText : body.extendVipBorderCustomInput;
            const extBorderInfo = parseBorderConfigInput(body.extendVipBorderPreset, rawExtBorderText, true);

            const rawInvDur = body.inviteeCustomText !== undefined ? body.inviteeCustomText : (body.inviteeBonusDaysText !== undefined ? body.inviteeBonusDaysText : body.inviteeBonusDays);
            const inviteeDurInfo = parseDurationInput(rawInvDur, 3);

            const rawInvBorderText = body.inviteeBorderCustomText !== undefined ? body.inviteeBorderCustomText : rawNewBorderText;
            const invBorderInfo = parseBorderConfigInput(body.inviteeBorderPreset || body.newVipBorderPreset, rawInvBorderText, false);

            const rawFreeMax = body.freeMaxInvitesText !== undefined ? body.freeMaxInvitesText : (body.freeMaxInvites !== undefined ? body.freeMaxInvites : config.freeMaxInvitesText);
            const freeMaxInfo = parseMaxInvitesInput(rawFreeMax, 10);

            const rawVipMax = body.vipMaxInvitesText !== undefined ? body.vipMaxInvitesText : (body.vipMaxInvites !== undefined ? body.vipMaxInvites : config.vipMaxInvitesText);
            const vipMaxInfo = parseMaxInvitesInput(rawVipMax, 35);

            const isEnabled = (body.enabled !== undefined) ? Boolean(body.enabled) : (body.isActive !== false);

            const updatedConfig = {
                ...config,
                isActive: isEnabled,
                enabled: isEnabled,
                // Belum VIP / Pengguna Gratis (Baru Pertama Dapat VIP)
                newVipPreset: String(body.newVipPreset || 'custom'),
                newVipDurationText: String(rawNewDur || newDurInfo.label),
                newVipCustomText: String(rawNewDur || newDurInfo.label),
                newVipDurationDays: newDurInfo.days,
                newVipDays: newDurInfo.days,
                newVipBorderPreset: String(newBorderInfo.preset || 'border_platinum'),
                newVipBorderCustomInput: String(rawNewBorderText || newBorderInfo.label),
                newVipBorderCustomText: String(rawNewBorderText || newBorderInfo.label),
                newVipAssignedBorder: newBorderInfo.assignedBorder,
                newVipAllowedBorders: newBorderInfo.allowedBorders,
                unlockAllSettingsFeatures: true,
                freeMaxInvites: freeMaxInfo.maxInvites,
                freeMaxInvitesText: freeMaxInfo.rawText,

                // Sudah VIP / Pengguna VIP (Perpanjang VIP / Masa Trial)
                extendVipPreset: String(body.extendVipPreset || 'custom'),
                extendVipDurationText: String(rawExtDur || extDurInfo.label),
                extendVipCustomText: String(rawExtDur || extDurInfo.label),
                extendVipDurationDays: extDurInfo.days,
                extendVipDays: extDurInfo.days,
                extendVipBorderPreset: String(extBorderInfo.preset || 'keep'),
                extendVipBorderCustomInput: String(rawExtBorderText || extBorderInfo.label),
                extendVipBorderCustomText: String(rawExtBorderText || extBorderInfo.label),
                extendVipAssignedBorder: extBorderInfo.assignedBorder,
                extendVipAllowedBorders: extBorderInfo.allowedBorders,
                vipMaxInvites: vipMaxInfo.maxInvites,
                vipMaxInvitesText: vipMaxInfo.rawText,

                // Poin & Target
                pointsPerReferralPreset: String(body.pointsPerReferralPreset || '100'),
                pointsPerReferral: Math.max(0, parseInt(body.pointsPerReferral, 10) || 100),
                targetInvitesPreset: String(body.targetInvitesPreset || '1'),
                targetInvitesForVip: Math.max(1, parseInt(body.targetInvitesForVip, 10) || 1),
                inviteeRewardEnabled: body.inviteeRewardEnabled !== false,
                inviteeBonusPreset: String(body.inviteeBonusPreset || '3d'),
                inviteeBonusDaysText: String(rawInvDur || inviteeDurInfo.label),
                inviteeCustomText: String(rawInvDur || inviteeDurInfo.label),
                inviteeBonusDays: Math.max(0, inviteeDurInfo.days),
                inviteeBorderPreset: String(invBorderInfo.preset || 'border_platinum'),
                inviteeBorderCustomText: String(rawInvBorderText || invBorderInfo.label),
                inviteeAllowedBorders: invBorderInfo.allowedBorders,
                inviteeBonusPoints: Math.max(0, parseInt(body.inviteeBonusPoints, 10) || 50),

                // Format Kode Referral (Cuma Angka, Cuma Huruf, Campur Huruf & Angka, Username+Angka, atau Kode Ketikan Persis)
                codeFormat: String(body.codeFormat || config.codeFormat || 'alphanumeric').toLowerCase().trim(),
                codePrefix: (body.codePrefix !== undefined) ? String(body.codePrefix).trim().toUpperCase() : (config.codePrefix !== undefined ? config.codePrefix : ''),
                customGlobalCode: (body.customGlobalCode !== undefined) ? String(body.customGlobalCode).trim().toUpperCase() : (config.customGlobalCode || ''),
                codeLength: Math.max(3, Math.min(16, parseInt(body.codeLength, 10) || config.codeLength || 6))
            };

            await writeReferralConfigAsync(updatedConfig);

            // Sync allowed borders to existing users whose VIP came from Referral + optionally regenerate all referral codes
            let syncedUsers = 0;
            const shouldRegenerateCodes = Boolean(body.regenerateAllCodes);
            usersDb.users.forEach(u => {
                if (!u) return;
                if (shouldRegenerateCodes) {
                    generateReferralCodeForUser(u, usersDb.users, true, updatedConfig);
                    syncedUsers++;
                }
                if (u.vipSource === 'referral') {
                    u.referralBorderRestricted = !newBorderInfo.allowedBorders.includes('all');
                    u.referralAllowedBorders = newBorderInfo.allowedBorders;
                    if (newBorderInfo.assignedBorder === 'none') {
                        u.border = '';
                        u.borderName = '';
                        u.borderUrl = '';
                    } else if (newBorderInfo.assignedBorder && newBorderInfo.assignedBorder !== 'keep') {
                        u.border = newBorderInfo.assignedBorder;
                        u.borderName = newBorderInfo.assignedBorderName;
                        u.borderUrl = newBorderInfo.assignedBorderUrl;
                    }
                    syncedUsers++;
                }
            });
            if (syncedUsers > 0) {
                await storage.writeDataAsync(USERS_FILE, usersDb);
            }

            return res.json({
                status: true,
                message: `Pengaturan Sistem Referral berhasil disimpan!${shouldRegenerateCodes ? ' Semua kode referral pengguna telah diperbarui sesuai format baru.' : ''}`,
                config: {
                    ...updatedConfig,
                    newVipDurationLabel: newDurInfo.label,
                    newVipBorderLabel: newBorderInfo.label,
                    extendVipDurationLabel: extDurInfo.label,
                    extendVipBorderLabel: extBorderInfo.label
                }
            });
        }

        // 4C. ADMIN SET / CHANGE REFERRAL CODE FREELY (FOR ONE USER OR ALL USERS WITH UNIQUE RANDOM NUMBERS PER USER)
        if (action === 'admin_set_referral_code') {
            const targetIdentifier = String(body.targetId || body.targetUser || body.username || body.userId || '').trim();
            const rawCustomCode = String(body.customCode || body.referralCode || '').trim().toUpperCase().replace(/\s+/g, '');
            const autoFormat = String(body.autoFormat || body.codeFormat || '').trim().toLowerCase();
            const lowerTargetCheck = targetIdentifier.toLowerCase().replace(/^@/, '');
            const isAllTarget = (
                targetIdentifier === '__ALL__' ||
                lowerTargetCheck === 'semua pengguna' ||
                lowerTargetCheck === 'semua' ||
                lowerTargetCheck === 'all' ||
                body.applyToAll === true
            );

            // Case 1: Terapkan ke Semua Pengguna -> Setiap pengguna mendapat kode UNIK yang berbeda-beda!
            // Contoh: jika Admin ketik "MUSIFYSTAR7192", maka di akun Admin kodenya "MUSIFYSTAR7192" dan di pengguna lain bagian nomornya ("7192") diacak berbeda-beda (misal "MUSIFYSTAR4829")
            if (isAllTarget) {
                const inputCodeOrPrefix = rawCustomCode || (body.codePrefix ? String(body.codePrefix).trim().toUpperCase().replace(/\s+/g, '') : '');
                if (inputCodeOrPrefix && !body.uniqueRandomPerUser) {
                    const tpl = parseAdminCodeTemplate(inputCodeOrPrefix, autoFormat || 'numeric', body.codeLength || 4);
                    const tempConfig = {
                        ...config,
                        codeFormat: tpl.codeFormat,
                        codePrefix: tpl.prefix,
                        customGlobalCode: '',
                        adminTemplateCode: tpl.adminCode || tpl.adminExactCode,
                        codeLength: tpl.codeLength
                    };
                    await writeReferralConfigAsync(tempConfig);

                    // Cari akun Admin utama agar mendapatkan persis kode yang diketik (contoh: MUSIFYSTAR7192),
                    // sedangkan seluruh pengguna lainnya mendapatkan nomor belakang yang diacak berbeda-beda!
                    let adminIdx = usersDb.users.findIndex(u => u && String(u.rawEmail || u.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com');
                    if (adminIdx === -1) adminIdx = 0;

                    const usedCodes = new Set();
                    if (usersDb.users[adminIdx]) {
                        usersDb.users[adminIdx].referralCode = tpl.adminExactCode;
                        usedCodes.add(tpl.adminExactCode);
                    }

                    usersDb.users.forEach((u, idx) => {
                        if (!u || idx === adminIdx) return;
                        let candidate = `${tpl.prefix}${createRandomCodeString(tpl.codeFormat, tpl.codeLength, u)}`;
                        let tries = 0;
                        while (usedCodes.has(candidate) && tries < 100) {
                            tries++;
                            candidate = `${tpl.prefix}${createRandomCodeString(tpl.codeFormat, tpl.codeLength, u)}`;
                        }
                        u.referralCode = candidate;
                        usedCodes.add(candidate);
                    });

                    await storage.writeDataAsync(USERS_FILE, usersDb);

                    const previewCodes = usersDb.users.slice(0, 3).map(u => `@${u.username}: ${u.referralCode}`).join(', ');
                    return res.json({
                        status: true,
                        message: `✅ Kode referral unik tiap pengguna berhasil diterapkan (${previewCodes})!`,
                        referralCode: tpl.adminExactCode,
                        config: tempConfig
                    });
                }

                // Jika Admin memilih Acak Berbeda untuk Semua Pengguna (Cuma Angka / Cuma Huruf / Campur / Prefix + Angka)
                const cleanPrefix = (body.codePrefix !== undefined) ? String(body.codePrefix).trim().toUpperCase().replace(/\s+/g, '') : (config.codePrefix || '');
                const tempConfig = {
                    ...config,
                    codeFormat: autoFormat || 'numeric',
                    codePrefix: cleanPrefix,
                    customGlobalCode: '',
                    codeLength: Math.max(2, Math.min(16, parseInt(body.codeLength, 10) || config.codeLength || 4))
                };
                await writeReferralConfigAsync(tempConfig);
                usersDb.users.forEach(u => {
                    if (u) generateReferralCodeForUser(u, usersDb.users, true, tempConfig);
                });
                await storage.writeDataAsync(USERS_FILE, usersDb);
                const previewCodes = usersDb.users.slice(0, 3).map(u => `@${u.username}: ${u.referralCode}`).join(', ');
                return res.json({
                    status: true,
                    message: `✅ Seluruh kode referral pengguna berhasil diacak berbeda-beda (${previewCodes})!`,
                    config: tempConfig
                });
            }

            if (!targetIdentifier) {
                return res.status(400).json({ status: false, message: 'Pilih "Semua Pengguna" atau pilih username pengguna yang ingin diubah kode referralnya!' });
            }

            const uIdx = usersDb.users.findIndex(u =>
                u && (
                    String(u.id).toLowerCase() === lowerTargetCheck ||
                    String(u.originalId || '').toLowerCase() === lowerTargetCheck ||
                    (u.username && u.username.toLowerCase() === lowerTargetCheck) ||
                    (u.email && u.email.toLowerCase() === lowerTargetCheck) ||
                    (u.rawEmail && u.rawEmail.toLowerCase() === lowerTargetCheck)
                )
            );

            if (uIdx === -1) {
                return res.status(404).json({ status: false, message: `Pengguna "${targetIdentifier}" tidak ditemukan.` });
            }

            const user = usersDb.users[uIdx];
            let finalCode = rawCustomCode;

            if (!finalCode && autoFormat) {
                const tempConfig = {
                    ...config,
                    codeFormat: autoFormat,
                    codePrefix: config.codePrefix || '',
                    customGlobalCode: '',
                    codeLength: Math.max(2, Math.min(16, parseInt(body.codeLength, 10) || 4))
                };
                finalCode = generateReferralCodeForUser(user, usersDb.users, true, tempConfig);
            }

            if (!finalCode || finalCode.length < 2) {
                return res.status(400).json({ status: false, message: 'Kode referral minimal harus terdiri dari 2 karakter (angka, huruf, atau kombinasi)!' });
            }

            // Simpan PERSIS sesuai ketikan Admin untuk pengguna tersebut
            user.referralCode = finalCode;
            usersDb.users[uIdx] = user;

            // Pastikan pengguna lain tidak memiliki kode yang sama persis (jika ada yang sama, acak nomor untuk pengguna lain tersebut)
            usersDb.users.forEach((other, idx) => {
                if (!other || idx === uIdx) return;
                if (String(other.referralCode || '').trim().toUpperCase() === finalCode) {
                    const tpl = parseAdminCodeTemplate(finalCode, 'numeric', 4);
                    generateReferralCodeForUser(other, usersDb.users, true, {
                        ...config,
                        codePrefix: tpl.prefix,
                        codeFormat: tpl.codeFormat,
                        codeLength: tpl.codeLength,
                        customGlobalCode: ''
                    });
                }
            });

            await storage.writeDataAsync(USERS_FILE, usersDb);

            return res.json({
                status: true,
                message: `✅ Kode referral untuk @${user.username} berhasil diubah menjadi: ${finalCode}`,
                referralCode: finalCode,
                user: {
                    id: user.id,
                    username: user.username,
                    referralCode: finalCode
                }
            });
        }

        // 4B. ADMIN SET / GRANT DONATUR & TOP SUPPORTER BADGE TO USER (OR ALL USERS)
        if (action === 'admin_set_donatur' || action === 'admin_set_supporter') {
            const rawTarget = String(body.targetId || body.targetUser || body.username || body.userId || '').trim();
            const targetIdentifier = rawTarget.toLowerCase().replace(/^@/, '');
            if (!targetIdentifier) {
                return res.status(400).json({ status: false, message: 'Pilih atau ketik username / ID pengguna target terlebih dahulu!' });
            }

            const rawTierOrBadge = String(body.supportBadge || body.donaturTier || 'auto').trim().toLowerCase();
            const supportCount = Math.max(0, parseInt(body.supportCount, 10) || 0);
            const customTitle = String(body.customTitle || '').trim();
            const customColor = String(body.customColor || '').trim();
            const isRevoke = (rawTierOrBadge === 'none' || rawTierOrBadge === 'revoke' || (rawTierOrBadge === 'auto' && supportCount === 0));

            let catalogItem = null;
            if (!isRevoke) {
                catalogItem = findCatalogBadge(rawTierOrBadge);
                if (!catalogItem) {
                    const effectiveCount = Math.max(1, supportCount);
                    const eligible = DONATUR_BADGES_CATALOG.filter(b => effectiveCount >= b.minSupport);
                    catalogItem = eligible[eligible.length - 1] || DONATUR_BADGES_CATALOG[0];
                }
            }

            const applyDonaturToUser = (user) => {
                if (isRevoke) {
                    user.donaturTier = 'none';
                    user.supportBadge = 'none';
                    user.supportCount = 0;
                    user.donaturBadgeId = '';
                    user.equippedSupporterBadge = 'none';
                    user.donaturBadgeTitle = '';
                    user.donaturBadgeColor = '';
                    user.showDonaturBadge = false;
                } else {
                    user.donaturTier = catalogItem.tier;
                    user.supportBadge = catalogItem.id;
                    user.supportCount = Math.max(catalogItem.minSupport, supportCount || 1);
                    user.donaturBadgeId = catalogItem.id;
                    user.equippedSupporterBadge = catalogItem.id;
                    user.donaturBadgeTitle = customTitle || catalogItem.title;
                    user.donaturBadgeColor = customColor || catalogItem.color;
                    user.showDonaturBadge = true;
                }
            };

            if (rawTarget === '__ALL__' || targetIdentifier === '__all__' || targetIdentifier === 'semua pengguna' || targetIdentifier === 'semua') {
                usersDb.users.forEach(u => {
                    if (u) applyDonaturToUser(u);
                });
                await storage.writeDataAsync(USERS_FILE, usersDb);
                return res.json({
                    status: true,
                    message: isRevoke
                        ? `Lencana Donatur pada seluruh pengguna (${usersDb.users.length} akun) telah dinonaktifkan.`
                        : `🏆 Lencana Kehormatan "${customTitle || catalogItem.title}" berhasil diberikan kepada seluruh pengguna (${usersDb.users.length} akun)!`
                });
            }

            const uIdx = usersDb.users.findIndex(u =>
                u && (
                    String(u.id).toLowerCase() === targetIdentifier ||
                    String(u.originalId || '').toLowerCase() === targetIdentifier ||
                    (u.username && u.username.toLowerCase() === targetIdentifier) ||
                    (u.email && u.email.toLowerCase() === targetIdentifier) ||
                    (u.rawEmail && u.rawEmail.toLowerCase() === targetIdentifier)
                )
            );

            if (uIdx === -1) {
                return res.status(404).json({ status: false, message: `Pengguna "${rawTarget}" tidak ditemukan.` });
            }

            const user = usersDb.users[uIdx];
            applyDonaturToUser(user);
            usersDb.users[uIdx] = user;
            await storage.writeDataAsync(USERS_FILE, usersDb);

            return res.json({
                status: true,
                message: isRevoke
                    ? `Lencana Donatur / Supporter pada @${user.username} telah dinonaktifkan.`
                    : `🏆 Lencana Kehormatan "${user.donaturBadgeTitle}" (${user.supportCount}x Dukungan) berhasil diberikan kepada @${user.username}!`,
                user: {
                    id: user.id,
                    username: user.username,
                    donatur: resolveUserDonaturInfo(user)
                }
            });
        }

        return res.status(400).json({ status: false, message: 'Action referral tidak dikenal' });
    } catch (err) {
        console.error('[REFERRALS API ERROR]:', err);
        return res.status(500).json({ status: false, message: 'Terjadi kesalahan server: ' + err.message });
    }
}

handler.readReferralConfigAsync = readReferralConfigAsync;
handler.readReferralConfigSync = readReferralConfigSync;
handler.generateReferralCodeForUser = generateReferralCodeForUser;
handler.ensureUserReferralCode = generateReferralCodeForUser;
handler.resolveUserDonaturInfo = resolveUserDonaturInfo;
handler.getUserDonaturInfo = resolveUserDonaturInfo;
handler.resolveUserInviteLimitInfo = resolveUserInviteLimitInfo;
handler.parseMaxInvitesInput = parseMaxInvitesInput;
handler.canReferralVipEquipBorder = canReferralVipEquipBorder;
handler.processReferralReward = processReferralReward;
handler.DONATUR_BADGES_CATALOG = DONATUR_BADGES_CATALOG;
handler.SUPPORTER_BADGES_CATALOG = DONATUR_BADGES_CATALOG;

module.exports = handler;
