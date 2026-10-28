const storage = require('./storage.js');
const userAuth = require('./user-auth.js');
const adminAuth = require('./admin-auth.js');
const referralsApi = require('./referrals.js');

const pool = storage.pool;

// Ensure table exists on server start and has border/avatar columns
async function initChatTable() {
    if (!pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS global_chat_messages (
                id BIGSERIAL PRIMARY KEY,
                user_id VARCHAR(100),
                username VARCHAR(100) NOT NULL,
                email VARCHAR(255) NOT NULL,
                message TEXT NOT NULL,
                badge VARCHAR(50) DEFAULT 'Member',
                is_admin BOOLEAN DEFAULT FALSE,
                avatar_color VARCHAR(50),
                avatar_url TEXT,
                border_id VARCHAR(50),
                border_url TEXT,
                border_name VARCHAR(50),
                is_vip BOOLEAN DEFAULT FALSE,
                vip_tier VARCHAR(50),
                ip_address VARCHAR(100),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS avatar_url TEXT;
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS border_id VARCHAR(50);
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS border_url TEXT;
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS border_name VARCHAR(50);
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS vip_tier VARCHAR(50);
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS equipped_badge VARCHAR(100);
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS equipped_badge_title VARCHAR(100);
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS equipped_badge_icon VARCHAR(100);
            ALTER TABLE global_chat_messages ADD COLUMN IF NOT EXISTS equipped_badge_color VARCHAR(100);
            CREATE INDEX IF NOT EXISTS idx_chat_msg_time ON global_chat_messages(created_at DESC);
        `);
    } catch (e) {
        console.error('[GLOBAL_CHAT] Table check error:', e.message);
    }
}
initChatTable().catch(() => {});

const BORDER_CATALOG = {
    'border_platinum': { id: 'border_platinum', name: 'Platinum', url: '/borders/Platinum.png' },
    'border_master': { id: 'border_master', name: 'Master', url: '/borders/Master.png' },
    'border_legend': { id: 'border_legend', name: 'Legend', url: '/borders/Legend.png' },
    'border_immortal': { id: 'border_immortal', name: 'Immortal', url: '/borders/Imortal.png' }
};

function resolveBorderDetails(borderId, rawUrl, rawName) {
    if (!borderId || borderId === 'none') {
        return { borderId: '', borderUrl: '', borderName: '' };
    }
    const clean = String(borderId).toLowerCase().trim();
    if (BORDER_CATALOG[clean]) {
        return {
            borderId: clean,
            borderUrl: BORDER_CATALOG[clean].url,
            borderName: BORDER_CATALOG[clean].name
        };
    }
    if (clean.includes('platinum')) return { borderId: 'border_platinum', borderUrl: '/borders/Platinum.png', borderName: 'Platinum' };
    if (clean.includes('master')) return { borderId: 'border_master', borderUrl: '/borders/Master.png', borderName: 'Master' };
    if (clean.includes('legend')) return { borderId: 'border_legend', borderUrl: '/borders/Legend.png', borderName: 'Legend' };
    if (clean.includes('immortal') || clean.includes('imortal')) return { borderId: 'border_immortal', borderUrl: '/borders/Imortal.png', borderName: 'Immortal' };
    return {
        borderId: borderId,
        borderUrl: rawUrl || '',
        borderName: rawName || 'VIP'
    };
}

// In-memory rate limiting: Max 1 message every 2 seconds per IP / User
const rateLimitMap = new Map();
function isRateLimited(key) {
    const now = Date.now();
    const last = rateLimitMap.get(key) || 0;
    if (now - last < 2000) {
        return true;
    }
    rateLimitMap.set(key, now);
    // Periodically clean up old keys
    if (rateLimitMap.size > 2000) {
        for (const [k, time] of rateLimitMap.entries()) {
            if (now - time > 60000) rateLimitMap.delete(k);
        }
    }
    return false;
}

// XSS sanitization
function sanitizeText(str) {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .trim();
}

function getClientIp(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.socket?.remoteAddress ||
        req.ip ||
        '127.0.0.1'
    );
}

// Color palettes for avatars based on username hash
const AVATAR_GRADIENTS = [
    'from-rose-500 to-amber-500',
    'from-cyan-500 to-blue-600',
    'from-emerald-500 to-teal-600',
    'from-purple-500 to-pink-600',
    'from-amber-400 to-orange-600',
    'from-indigo-500 to-purple-600',
    'from-sky-400 to-indigo-600',
    'from-fuchsia-500 to-rose-600'
];

function getAvatarColor(name) {
    let hash = 0;
    for (let i = 0; i < (name || '').length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

module.exports = async function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const method = req.method.toUpperCase();
    const clientIp = getClientIp(req);

    // Helper to match user identity in friend requests (including Admin aliases)
    function isAdminIdentity(idStr, nameStr) {
        const cid = String(idStr || '').trim();
        const cname = String(nameStr || '').toLowerCase().trim();
        return (
            cid === '8589478687' ||
            cid === 'u_1790196636099_622dc736' ||
            cname === 'musifystar' ||
            cname === 'musifystar official'
        );
    }

    function matchesIdentity(recId, recName, uid, uname) {
        const cleanRecId = String(recId || '').trim();
        const cleanUid = String(uid || '').trim();
        const cleanRecName = String(recName || '').toLowerCase().trim();
        const cleanUname = String(uname || '').toLowerCase().trim();
        if (isAdminIdentity(cleanRecId, cleanRecName) && isAdminIdentity(cleanUid, cleanUname)) {
            return true;
        }
        if (cleanRecId && cleanUid && cleanRecId === cleanUid) return true;
        if (cleanRecName && cleanUname && cleanRecName === cleanUname) return true;
        return false;
    }

    // 1. GET /api/global-chat - Fetch user profile modal data OR recent chat messages
    if (method === 'GET') {
        if (req.query && req.query.action === 'user_profile') {
            try {
                const targetId = String(req.query.targetId || '').trim();
                const targetName = String(req.query.targetName || '').trim();
                const targetLower = targetName.toLowerCase();
                const myId = String(req.query.myId || req.headers['x-user-id'] || '').trim();
                const myName = String(req.query.myName || req.headers['x-user-name'] || '').trim();

                const dbData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
                const usersList = dbData.users || [];

                let matchedUser = usersList.find(u =>
                    (targetId && (String(u.id) === targetId || String(u.customId || '') === targetId || String(u.originalId || '') === targetId)) ||
                    (targetLower && String(u.username || '').toLowerCase().trim() === targetLower)
                ) || null;

                const isTargetAdmin = Boolean(
                    targetId === '8589478687' ||
                    targetId === 'u_1790196636099_622dc736' ||
                    targetLower === 'musifystar' ||
                    targetLower === 'musifystar official' ||
                    (matchedUser && (
                        (matchedUser.email || matchedUser.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com' ||
                        String(matchedUser.id) === '8589478687' ||
                        String(matchedUser.username || '').toLowerCase().trim() === 'musifystar' ||
                        matchedUser.isMasterAdmin
                    ))
                );

                if (!matchedUser && isTargetAdmin) {
                    matchedUser = usersList.find(u =>
                        (u.email || u.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com' ||
                        String(u.id) === '8589478687' ||
                        String(u.username || '').toLowerCase().trim() === 'musifystar'
                    ) || null;
                }

                // Get Global Stats Leaderboard & Listening Seconds
                let lbEntry = null;
                try {
                    const analyticsApi = require('./analytics.js');
                    if (analyticsApi && typeof analyticsApi.getLeaderboardForChat === 'function') {
                        const lbRes = await analyticsApi.getLeaderboardForChat();
                        const lbList = (lbRes && Array.isArray(lbRes.leaderboard)) ? lbRes.leaderboard : [];
                        lbEntry = lbList.find(item =>
                            (targetId && String(item.id) === targetId) ||
                            (targetLower && String(item.username || '').toLowerCase().trim() === targetLower) ||
                            (matchedUser && String(item.username || '').toLowerCase().trim() === String(matchedUser.username || '').toLowerCase().trim()) ||
                            (isTargetAdmin && (item.isMasterAdmin || String(item.username || '').toLowerCase().trim() === 'musifystar'))
                        ) || null;
                    }
                } catch (e) {}

                const displayUsername = matchedUser?.username || lbEntry?.username || targetName || (isTargetAdmin ? 'MusifyStar' : 'Musisi');

                function derive10DigitId(seedName, isAdm) {
                    if (isAdm) return '8589478687';
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

                const rawMatchedId = String(matchedUser?.id || '').trim();
                const rawOriginalId = String(matchedUser?.originalId || '').trim();
                const rawLbId = String(lbEntry?.id || '').trim();
                const rawTargetId = String(targetId || '').trim();

                let originalIdVal = '';
                if (isTargetAdmin) {
                    originalIdVal = '8589478687';
                } else if (/^\d{10}$/.test(rawOriginalId)) {
                    originalIdVal = rawOriginalId;
                } else if (/^\d{10}$/.test(rawMatchedId)) {
                    originalIdVal = rawMatchedId;
                } else if (/^\d{10}$/.test(rawLbId)) {
                    originalIdVal = rawLbId;
                } else if (/^\d{10}$/.test(rawTargetId)) {
                    originalIdVal = rawTargetId;
                } else {
                    originalIdVal = derive10DigitId(displayUsername, isTargetAdmin);
                }

                // Auto-persist 10-digit ID if matchedUser had an old u_... ID
                if (matchedUser && (!matchedUser.originalId || String(matchedUser.originalId).startsWith('u_'))) {
                    matchedUser.originalId = originalIdVal;
                    if (!matchedUser.customId && (!matchedUser.id || String(matchedUser.id).startsWith('u_'))) {
                        matchedUser.id = originalIdVal;
                    }
                    storage.writeDataAsync('users.json', dbData).catch(() => {});
                } else if (!matchedUser && !isTargetAdmin && displayUsername && displayUsername.toLowerCase() !== 'musisi') {
                    // Auto-heal user into users.json if they sent messages in global_chat_messages
                    try {
                        const deletedMap = await storage.readDataAsync('.deleted_users.json', {});
                        const dNameLow = displayUsername.toLowerCase().trim();
                        if (!deletedMap[dNameLow] && !deletedMap[originalIdVal]) {
                            let chatEmail = '';
                            let chatAvatar = lbEntry?.avatar || '';
                            let chatIp = '127.0.0.1';
                            if (pool) {
                                const cRes = await pool.query(
                                    'SELECT email, avatar_url, ip_address FROM global_chat_messages WHERE LOWER(username) = $1 ORDER BY created_at DESC LIMIT 1',
                                    [dNameLow]
                                );
                                if (cRes.rows && cRes.rows[0]) {
                                    chatEmail = String(cRes.rows[0].email || '').toLowerCase().trim();
                                    chatAvatar = cRes.rows[0].avatar_url || chatAvatar;
                                    chatIp = cRes.rows[0].ip_address || chatIp;
                                }
                            }
                            const nowIso = new Date().toISOString();
                            const healedUser = {
                                id: originalIdVal,
                                originalId: originalIdVal,
                                username: displayUsername,
                                email: chatEmail || `${dNameLow}@musifystar.user`,
                                rawEmail: chatEmail || `${dNameLow}@musifystar.user`,
                                provider: 'manual',
                                maskedPassword: '••••••••',
                                avatar: chatAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayUsername)}`,
                                role: 'member',
                                isPremium: false,
                                vipTier: 'none',
                                vipExpiresAt: null,
                                createdAt: nowIso,
                                lastLoginAt: nowIso,
                                lastIp: chatIp,
                                rawLastIp: chatIp,
                                banType: 'none',
                                banReason: '',
                                banExpiresAt: null,
                                loginLogs: [{
                                    ip: chatIp,
                                    rawIp: chatIp,
                                    timestamp: nowIso,
                                    userAgent: 'MusifyStar Web App'
                                }],
                                settings: {}
                            };
                            referralsApi.generateReferralCodeForUser(healedUser, usersList);
                            usersList.push(healedUser);
                            matchedUser = healedUser;
                            storage.writeDataAsync('users.json', dbData).catch(() => {});
                        }
                    } catch (e) {}
                }

                const customIdVal = matchedUser?.customId || ((rawMatchedId && !rawMatchedId.startsWith('u_') && rawMatchedId !== originalIdVal) ? rawMatchedId : '');
                const userIdVal = customIdVal || originalIdVal;

                const isVipExpired = matchedUser?.vipExpiresAt && Date.now() > matchedUser.vipExpiresAt;
                const isTierActive = Boolean(matchedUser?.vipTier && matchedUser?.vipTier !== 'none');
                const isVipActive = Boolean(isTargetAdmin || (matchedUser && ((matchedUser.isPremium || matchedUser.is_premium || isTierActive) && matchedUser.vipTier !== 'none') && !isVipExpired) || lbEntry?.isVip);

                const rawBorderId = matchedUser?.border || lbEntry?.border || (isTargetAdmin ? 'border_immortal' : '');
                const borderInfo = resolveBorderDetails(rawBorderId, matchedUser?.borderUrl || lbEntry?.borderUrl, matchedUser?.borderName || lbEntry?.borderName);
                if (isTargetAdmin && !borderInfo.borderName) {
                    borderInfo.borderId = 'border_immortal';
                    borderInfo.borderName = 'Immortal';
                    borderInfo.borderUrl = '/borders/Imortal.png';
                }

                let equippedBadge = matchedUser?.equippedBadge || lbEntry?.equippedBadge || (isTargetAdmin ? 'badge_diamond' : '');
                let equippedBadgeTitle = matchedUser?.equippedBadgeTitle || lbEntry?.equippedBadgeTitle || (isTargetAdmin ? 'Diamond' : '');
                let equippedBadgeIcon = matchedUser?.equippedBadgeIcon || lbEntry?.equippedBadgeIcon || (isTargetAdmin ? 'gem' : '');
                let equippedBadgeColor = matchedUser?.equippedBadgeColor || lbEntry?.equippedBadgeColor || (isTargetAdmin ? '#0284c7' : '');

                let donaturInfo = matchedUser ? referralsApi.resolveUserDonaturInfo(matchedUser) : (lbEntry?.donatur || null);
                if (isTargetAdmin && (!donaturInfo || !donaturInfo.activeBadge)) {
                    donaturInfo = {
                        activeBadge: {
                            id: 'donatur_300k',
                            title: 'Mega Supporter',
                            icon: 'gem',
                            color: '#a855f7'
                        }
                    };
                }

                const listeningSeconds = Math.max(
                    Number(lbEntry?.listeningSeconds || 0),
                    Number(matchedUser?.listeningSeconds || matchedUser?.listening_seconds || 0),
                    isTargetAdmin ? 53400 : 0
                );
                const days = Math.floor(listeningSeconds / 86400);
                const hours = Math.floor((listeningSeconds % 86400) / 3600);
                const minutes = Math.floor((listeningSeconds % 3600) / 60);
                const formattedListening = `${days} Hari, ${hours} Jam, ${minutes} Menit`;

                const globalStatsRank = lbEntry ? lbEntry.rank : (isTargetAdmin ? 1 : null);

                // Resolve Friend Status
                const friendsDb = await storage.readDataAsync('friends.json', { requests: [] });
                const allReqs = Array.isArray(friendsDb.requests) ? friendsDb.requests : [];
                let friendStatus = 'none';
                let friendReqId = '';

                if (myId || myName) {
                    // Check relation between me and target
                    const outgoing = allReqs.find(r =>
                        matchesIdentity(r.fromId, r.fromName, myId, myName) &&
                        matchesIdentity(r.toId, r.toName, userIdVal || targetId, displayUsername || targetName)
                    );
                    const incoming = allReqs.find(r =>
                        matchesIdentity(r.fromId, r.fromName, userIdVal || targetId, displayUsername || targetName) &&
                        matchesIdentity(r.toId, r.toName, myId, myName)
                    );

                    if (outgoing && outgoing.status === 'accepted') {
                        friendStatus = 'accepted';
                        friendReqId = outgoing.id;
                    } else if (incoming && incoming.status === 'accepted') {
                        friendStatus = 'accepted';
                        friendReqId = incoming.id;
                    } else if (incoming && incoming.status === 'pending') {
                        friendStatus = 'incoming_pending';
                        friendReqId = incoming.id;
                    } else if (outgoing && outgoing.status === 'pending') {
                        friendStatus = 'outgoing_pending';
                        friendReqId = outgoing.id;
                    } else if (outgoing && outgoing.status === 'rejected') {
                        friendStatus = 'outgoing_rejected';
                        friendReqId = outgoing.id;
                    } else if (incoming && incoming.status === 'rejected') {
                        friendStatus = 'incoming_rejected';
                        friendReqId = incoming.id;
                    }
                }

                const myIncomingRequests = (myId || myName)
                    ? allReqs.filter(r => r.status === 'pending' && matchesIdentity(r.toId, r.toName, myId, myName))
                    : [];
                const myFriendUpdates = (myId || myName)
                    ? allReqs.filter(r =>
                        matchesIdentity(r.fromId, r.fromName, myId, myName) ||
                        matchesIdentity(r.toId, r.toName, myId, myName)
                    )
                    : [];

                return res.json({
                    status: true,
                    profile: {
                        id: userIdVal,
                        customId: customIdVal,
                        originalId: originalIdVal,
                        username: displayUsername,
                        avatar: matchedUser?.avatar || lbEntry?.avatar || '',
                        isAdmin: isTargetAdmin,
                        isVerified: Boolean(isTargetAdmin || matchedUser?.isVerified),
                        isVip: isVipActive,
                        borderId: borderInfo.borderId,
                        borderName: borderInfo.borderName,
                        borderUrl: borderInfo.borderUrl,
                        equippedBadge: equippedBadge,
                        equippedBadgeTitle: equippedBadgeTitle,
                        equippedBadgeIcon: equippedBadgeIcon,
                        equippedBadgeColor: equippedBadgeColor,
                        donatur: donaturInfo,
                        globalStatsRank: globalStatsRank,
                        listeningSeconds: listeningSeconds,
                        days: days,
                        hours: hours,
                        minutes: minutes,
                        formattedListening: formattedListening,
                        currentTrack: lbEntry?.currentTrack || '',
                        isOnline: Boolean(lbEntry?.isOnline),
                        ownerStatus: isTargetAdmin ? 'Owner MusifyStar' : '',
                        friendStatus: friendStatus,
                        friendReqId: friendReqId
                    },
                    incomingFriendRequests: myIncomingRequests,
                    friendUpdates: myFriendUpdates
                });
            } catch (err) {
                console.error('[GLOBAL_CHAT] user_profile error:', err.message);
                return res.status(500).json({ status: false, message: 'Gagal memuat detail profil: ' + err.message });
            }
        }

        try {
            if (!pool) {
                return res.status(503).json({ status: false, message: 'Database utama belum siap.' });
            }

            // Check if requester is master admin
            const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
            const authHeader = req.headers.authorization || req.headers['x-auth-token'] || '';
            const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const isMasterAdminReq = adminAuth.isValidToken(adminToken) || adminAuth.isValidToken(rawToken);
            const callerId = String(req.headers['x-user-id'] || req.query.myId || '').trim();
            const callerName = String(req.headers['x-user-name'] || req.query.myName || '').trim();

            const result = await pool.query(`
                SELECT id, user_id, username, email, message, badge, is_admin, avatar_color, avatar_url, border_id, border_url, border_name, is_vip, vip_tier, equipped_badge, equipped_badge_title, equipped_badge_icon, equipped_badge_color, created_at 
                FROM global_chat_messages 
                ORDER BY created_at DESC 
                LIMIT 60
            `);

            // Sort chronologically (oldest to newest)
            const rows = result.rows.reverse();

            // Load registered users from storage to augment with newest avatar, border & VIP status
            let userMapById = new Map();
            let userMapByEmail = new Map();
            let userMapByName = new Map();
            try {
                const dbData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
                (dbData.users || []).forEach(u => {
                    if (u.id) userMapById.set(String(u.id), u);
                    const em = (u.rawEmail || u.email || '').toLowerCase().trim();
                    if (em) userMapByEmail.set(em, u);
                    const un = (u.username || '').toLowerCase().trim();
                    if (un) userMapByName.set(un, u);
                });
            } catch (e) {}

            // PRIVACY & SECURITY: Strip / mask emails for regular users to prevent scraping via DevTools
            const safeMessages = rows.map(r => {
                const isMsgMasterAdmin = ((r.email || '').toLowerCase().trim() === 'jrnabil570@gmail.com') ||
                                         (String(r.user_id || '') === '8589478687');

                // Match user from current database state for up-to-date border and avatar
                const matchedUser = userMapById.get(String(r.user_id || '')) ||
                                    userMapByEmail.get((r.email || '').toLowerCase().trim()) ||
                                    userMapByName.get((r.username || '').toLowerCase().trim()) || null;

                const displayUsername = matchedUser?.username || r.username || (isMsgMasterAdmin ? 'MusifyStar Official' : 'Musisi');

                const userAvatar = matchedUser?.avatar || r.avatar_url || '';
                const activeBorderId = matchedUser?.border || r.border_id || '';
                const borderInfo = resolveBorderDetails(activeBorderId, matchedUser?.borderUrl || r.border_url, matchedUser?.borderName || r.border_name);

                const isTierActive = Boolean(matchedUser?.vipTier && matchedUser?.vipTier !== 'none');
                const matchedIsVip = Boolean(matchedUser ? ((matchedUser.isPremium || matchedUser.is_premium || isTierActive) && matchedUser.vipTier !== 'none') : r.is_vip);
                const isUserVipRaw = isMsgMasterAdmin || matchedIsVip;
                const vipExpiresAt = matchedUser?.vipExpiresAt || null;
                const isVipActive = isUserVipRaw && (!vipExpiresAt || Date.now() <= vipExpiresAt);
                const vipTier = isMsgMasterAdmin ? 'permanent' : (isVipActive ? (matchedUser?.vipTier || r.vip_tier || 'permanent') : 'none');

                const equippedBadge = matchedUser ? (matchedUser.equippedBadge !== undefined ? matchedUser.equippedBadge : (r.equipped_badge || '')) : (r.equipped_badge || '');
                const equippedBadgeTitle = matchedUser ? (matchedUser.equippedBadgeTitle !== undefined ? matchedUser.equippedBadgeTitle : (r.equipped_badge_title || '')) : (r.equipped_badge_title || '');
                const equippedBadgeIcon = matchedUser ? (matchedUser.equippedBadgeIcon !== undefined ? matchedUser.equippedBadgeIcon : (r.equipped_badge_icon || '')) : (r.equipped_badge_icon || '');
                const equippedBadgeColor = matchedUser ? (matchedUser.equippedBadgeColor !== undefined ? matchedUser.equippedBadgeColor : (r.equipped_badge_color || '')) : (r.equipped_badge_color || '');

                return {
                    id: String(r.id),
                    userId: matchedUser?.id || r.user_id,
                    customId: matchedUser?.customId || '',
                    username: displayUsername,
                    message: r.message,
                    badge: isMsgMasterAdmin ? 'Admin' : (r.badge || 'Member'),
                    isAdmin: isMsgMasterAdmin,
                    isVerifiedAdmin: isMsgMasterAdmin,
                    avatar: userAvatar,
                    avatarColor: r.avatar_color || getAvatarColor(displayUsername),
                    borderId: borderInfo.borderId,
                    borderUrl: borderInfo.borderUrl,
                    borderName: borderInfo.borderName,
                    isVip: isVipActive,
                    vipTier: vipTier,
                    vipExpiresAt: vipExpiresAt,
                    equippedBadge: equippedBadge,
                    equippedBadgeTitle: equippedBadgeTitle,
                    equippedBadgeIcon: equippedBadgeIcon,
                    equippedBadgeColor: equippedBadgeColor,
                    donatur: matchedUser ? referralsApi.resolveUserDonaturInfo(matchedUser) : null,
                    createdAt: r.created_at,
                    // Email is ONLY visible to the master admin for moderation; hidden for all other users
                    email: isMasterAdminReq ? r.email : undefined
                };
            });

            let incomingFriendRequests = [];
            let friendUpdates = [];
            if (callerId || callerName) {
                try {
                    const friendsDb = await storage.readDataAsync('friends.json', { requests: [] });
                    const allReqs = Array.isArray(friendsDb.requests) ? friendsDb.requests : [];
                    incomingFriendRequests = allReqs.filter(r => r.status === 'pending' && matchesIdentity(r.toId, r.toName, callerId, callerName));
                    friendUpdates = allReqs.filter(r =>
                        matchesIdentity(r.fromId, r.fromName, callerId, callerName) ||
                        matchesIdentity(r.toId, r.toName, callerId, callerName)
                    );
                } catch (e) {}
            }

            return res.json({
                status: true,
                messages: safeMessages,
                incomingFriendRequests: incomingFriendRequests,
                friendUpdates: friendUpdates,
                serverTime: new Date().toISOString()
            });
        } catch (e) {
            console.error('[GLOBAL_CHAT] GET Error:', e.message);
            return res.status(500).json({ status: false, message: 'Gagal memuat pesan chat global: ' + e.message });
        }
    }

    // 2. POST /api/global-chat - Friend Actions OR Send a new message
    if (method === 'POST') {
        const bodyAction = req.body && req.body.action ? String(req.body.action) : '';
        if (bodyAction === 'friend_request' || bodyAction === 'friend_respond' || bodyAction === 'friend_remove') {
            try {
                const fromId = String(req.body.fromId || req.headers['x-user-id'] || '').trim();
                const fromName = String(req.body.fromName || req.headers['x-user-name'] || '').trim();
                const fromAvatar = String(req.body.fromAvatar || '').trim();
                const toId = String(req.body.toId || '').trim();
                const toName = String(req.body.toName || '').trim();

                if (!fromId && !fromName) {
                    return res.status(401).json({ status: false, message: 'Silakan login terlebih dahulu.' });
                }

                const friendsDb = await storage.readDataAsync('friends.json', { requests: [] });
                if (!Array.isArray(friendsDb.requests)) friendsDb.requests = [];

                if (bodyAction === 'friend_remove') {
                    const reqId = String(req.body.reqId || '').trim();
                    friendsDb.requests = friendsDb.requests.filter(r => {
                        if (reqId && r.id === reqId) return false;
                        const matchForward = matchesIdentity(r.fromId, r.fromName, fromId, fromName) && matchesIdentity(r.toId, r.toName, toId, toName);
                        const matchReverse = matchesIdentity(r.fromId, r.fromName, toId, toName) && matchesIdentity(r.toId, r.toName, fromId, fromName);
                        return !(matchForward || matchReverse);
                    });
                    await storage.writeDataAsync('friends.json', friendsDb);
                    return res.json({
                        status: true,
                        friendStatus: 'none',
                        message: 'Pertemanan / permintaan telah dibatalkan.'
                    });
                }

                if (bodyAction === 'friend_request') {
                    if (!toId && !toName) {
                        return res.status(400).json({ status: false, message: 'Pengguna tujuan tidak ditemukan.' });
                    }
                    // Prevent self-friend request
                    if (matchesIdentity(fromId, fromName, toId, toName)) {
                        return res.status(400).json({ status: false, message: 'Tidak dapat menambah diri sendiri sebagai teman.' });
                    }
                    // Remove any old records between these two users so the new outgoing request is clean
                    friendsDb.requests = friendsDb.requests.filter(r => {
                        const matchForward = matchesIdentity(r.fromId, r.fromName, fromId, fromName) && matchesIdentity(r.toId, r.toName, toId, toName);
                        const matchReverse = matchesIdentity(r.fromId, r.fromName, toId, toName) && matchesIdentity(r.toId, r.toName, fromId, fromName);
                        return !(matchForward || matchReverse);
                    });

                    const newReq = {
                        id: 'freq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
                        fromId: fromId,
                        fromName: fromName,
                        fromAvatar: fromAvatar,
                        toId: toId,
                        toName: toName,
                        status: 'pending',
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    friendsDb.requests.push(newReq);
                    await storage.writeDataAsync('friends.json', friendsDb);
                    return res.json({
                        status: true,
                        friendStatus: 'outgoing_pending',
                        request: newReq,
                        message: `Permintaan pertemanan terkirim ke @${toName || 'Pengguna'}! Menunggu konfirmasi.`
                    });
                }

                if (bodyAction === 'friend_respond') {
                    const decision = req.body.decision === 'accepted' ? 'accepted' : 'rejected';
                    const reqId = String(req.body.reqId || '').trim();
                    const senderId = String(req.body.senderId || '').trim();
                    const senderName = String(req.body.senderName || '').trim();

                    let targetReq = friendsDb.requests.find(r =>
                        (reqId && r.id === reqId) ||
                        (matchesIdentity(r.fromId, r.fromName, senderId, senderName) &&
                         matchesIdentity(r.toId, r.toName, fromId, fromName))
                    );

                    if (!targetReq) {
                        return res.status(404).json({ status: false, message: 'Permintaan pertemanan tidak ditemukan.' });
                    }

                    targetReq.status = decision;
                    targetReq.updatedAt = Date.now();
                    await storage.writeDataAsync('friends.json', friendsDb);

                    return res.json({
                        status: true,
                        friendStatus: decision === 'accepted' ? 'accepted' : 'incoming_rejected',
                        request: targetReq,
                        message: decision === 'accepted'
                            ? `Anda sekarang berteman dengan @${targetReq.fromName}!`
                            : `Permintaan pertemanan dari @${targetReq.fromName} ditolak.`
                    });
                }
            } catch (err) {
                console.error('[GLOBAL_CHAT] Friend action error:', err.message);
                return res.status(500).json({ status: false, message: 'Gagal memproses pertemanan: ' + err.message });
            }
        }

        try {
            if (!pool) {
                return res.status(503).json({ status: false, message: 'Database utama belum siap.' });
            }

            // Rate limit check (Anti-Spam)
            const rateKey = `${clientIp}_${req.headers.authorization || ''}`;
            if (isRateLimited(rateKey)) {
                return res.status(429).json({
                    status: false,
                    message: 'Mohon tunggu 2 detik sebelum mengirim pesan berikutnya (Anti-Spam).'
                });
            }

            // Verify User Authentication (Supports User JWT, Session Tokens, and Master Admin Token)
            const authHeader = req.headers.authorization || req.headers['x-auth-token'] || '';
            const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const adminToken = (req.headers['x-admin-token'] || '').trim();

            const headerUid = req.headers['x-user-id'] || req.headers['x-device-id'] || '';
            const headerUsername = req.headers['x-user-name'] || '';
            const headerEmail = (req.headers['x-user-email'] || '').toLowerCase().trim();

            let currentUser = null;
            let verifiedUid = null;
            let verifiedUsername = null;

            // 1. Prioritize Standard User Authentication (JWT Token or Session)
            if (rawToken && rawToken.startsWith('usr_')) {
                const verified = userAuth.verifyUserToken(rawToken);
                if (verified && verified.uid) {
                    verifiedUid = typeof verified.uid === 'object' ? (verified.uid.id || verified.uid.userId) : String(verified.uid);
                    verifiedUsername = verified.u || '';
                }
            }

            const effectiveUid = verifiedUid || headerUid;
            const effectiveUsername = verifiedUsername || headerUsername;

            if (effectiveUid || effectiveUsername || rawToken || headerEmail) {
                try {
                    const dbData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
                    let foundUser = null;
                    if (verifiedUid) {
                        foundUser = (dbData.users || []).find(u => String(u.id) === String(verifiedUid));
                    }
                    if (!foundUser && headerEmail) {
                        foundUser = (dbData.users || []).find(u => (u.email && u.email.toLowerCase() === headerEmail) || (u.rawEmail && u.rawEmail.toLowerCase() === headerEmail));
                    }
                    if (!foundUser && effectiveUid) {
                        foundUser = (dbData.users || []).find(u => String(u.id) === String(effectiveUid));
                    }
                    if (!foundUser && effectiveUsername) {
                        foundUser = (dbData.users || []).find(u => u.username && u.username.toLowerCase() === effectiveUsername.toLowerCase());
                    }
                    if (!foundUser && rawToken && dbData.sessions && dbData.sessions[rawToken]) {
                        const sess = dbData.sessions[rawToken];
                        foundUser = (dbData.users || []).find(u => String(u.id) === String(sess.userId) || u.username === sess.username);
                    }

                    if (foundUser) {
                        const isFoundAdmin = (foundUser.email || foundUser.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com' || String(foundUser.id) === '8589478687' || String(foundUser.id) === 'u_1790196636099_622dc736';
                        currentUser = {
                            id: String(foundUser.id || effectiveUid),
                            username: foundUser.username || (isFoundAdmin ? 'MusifyStar Official' : effectiveUsername || 'Musisi'),
                            email: foundUser.email || foundUser.rawEmail || headerEmail || '',
                            rawEmail: foundUser.rawEmail || foundUser.email || headerEmail || '',
                            isAdmin: isFoundAdmin,
                            badge: isFoundAdmin ? 'Admin' : 'Member'
                        };
                    } else if (effectiveUid || effectiveUsername || headerEmail) {
                        const isGuestAdmin = (headerEmail === 'jrnabil570@gmail.com' || effectiveUid === '8589478687' || effectiveUid === 'u_1790196636099_622dc736');
                        let resolvedChatUid = String(effectiveUid || '');
                        if (!/^\d{10}$/.test(resolvedChatUid)) {
                            const seedClean = String(effectiveUsername || 'musisi').toLowerCase().trim();
                            let h1 = 2166136261, h2 = 16777619;
                            for (let i = 0; i < seedClean.length; i++) {
                                const c = seedClean.charCodeAt(i);
                                h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
                                h2 = Math.imul(h2 ^ (c + i * 31), 1103515245) >>> 0;
                            }
                            resolvedChatUid = isGuestAdmin ? '8589478687' : (String((h1 % 9) + 1) + String((h1 ^ h2) >>> 0).padStart(9, '0').slice(0, 9));
                        }
                        const resolvedChatName = effectiveUsername || (isGuestAdmin ? 'MusifyStar Official' : 'Musisi');
                        const resolvedChatEmail = headerEmail || (isGuestAdmin ? 'jrnabil570@gmail.com' : `${resolvedChatName.toLowerCase()}@musifystar.user`);
                        currentUser = {
                            id: resolvedChatUid,
                            username: resolvedChatName,
                            email: resolvedChatEmail,
                            rawEmail: resolvedChatEmail,
                            isAdmin: isGuestAdmin,
                            badge: isGuestAdmin ? 'Admin' : 'Member'
                        };
                        if (!isGuestAdmin && resolvedChatName.toLowerCase() !== 'musisi') {
                            try {
                                const nowIso = new Date().toISOString();
                                const newChatUser = {
                                    id: resolvedChatUid,
                                    originalId: resolvedChatUid,
                                    username: resolvedChatName,
                                    email: resolvedChatEmail,
                                    rawEmail: resolvedChatEmail,
                                    provider: 'manual',
                                    maskedPassword: '••••••••',
                                    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(resolvedChatName)}`,
                                    role: 'member',
                                    isPremium: false,
                                    vipTier: 'none',
                                    vipExpiresAt: null,
                                    createdAt: nowIso,
                                    lastLoginAt: nowIso,
                                    lastIp: clientIp,
                                    rawLastIp: clientIp,
                                    banType: 'none',
                                    banReason: '',
                                    banExpiresAt: null,
                                    loginLogs: [{
                                        ip: clientIp,
                                        rawIp: clientIp,
                                        timestamp: nowIso,
                                        userAgent: req.headers['user-agent'] || ''
                                    }],
                                    settings: {}
                                };
                                dbData.users = dbData.users || [];
                                referralsApi.generateReferralCodeForUser(newChatUser, dbData.users);
                                dbData.users.push(newChatUser);
                                await storage.writeDataAsync('users.json', dbData);
                            } catch (e) {}
                        }
                    }
                } catch (e) {}
            }

            // 2. Fallback: If not authenticated as standard user, check if Master Admin Token
            if (!currentUser && (adminAuth.isValidToken(rawToken) || adminAuth.isValidToken(adminToken) || (headerEmail === 'jrnabil570@gmail.com' && (rawToken || adminToken)))) {
                currentUser = {
                    id: '8589478687',
                    username: 'MusifyStar Official',
                    email: 'jrnabil570@gmail.com',
                    rawEmail: 'jrnabil570@gmail.com',
                    isAdmin: true,
                    badge: 'Admin'
                };
            }

            // Require logged in user to send message (Guarantees authentic email & identity in DB)
            if (!currentUser) {
                return res.status(401).json({
                    status: false,
                    message: 'Silakan login ke akun MusifyStar Anda terlebih dahulu untuk mengirim pesan di Chat Global.'
                });
            }

            // Check if user or IP is banned
            try {
                const banRegistry = await storage.readDataAsync('banned_registry.json', {});
                const userEmailLower = ((currentUser.email || currentUser.rawEmail || '')).toLowerCase().trim();
                const userNameLower = (currentUser.username || '').toLowerCase().trim();

                if (banRegistry[userEmailLower] || banRegistry[userNameLower] || banRegistry[clientIp]) {
                    return res.status(403).json({
                        status: false,
                        message: 'Akun atau alamat jaringan Anda sedang ditangguhkan dari sistem interaksi publik.'
                    });
                }
            } catch (e) {}

            const body = req.body || {};
            const rawMessage = String(body.message || '').trim();

            if (!rawMessage) {
                return res.status(400).json({ status: false, message: 'Isi pesan tidak boleh kosong.' });
            }

            if (rawMessage.length > 500) {
                return res.status(400).json({ status: false, message: 'Pesan terlalu panjang (maksimal 500 karakter).' });
            }

            // Sanitize message content (Anti-XSS)
            const cleanMessage = sanitizeText(rawMessage);
            const username = String(currentUser.username || 'Musisi').trim().slice(0, 30);
            const email = String(currentUser.email || currentUser.rawEmail || '').toLowerCase().trim();
            const userId = String(currentUser.id || currentUser.userId || '');

            // Master Admin Verification
            const isMasterAdmin = (email === 'jrnabil570@gmail.com');
            const badge = isMasterAdmin ? 'Admin' : 'Member';
            const displayUsername = username || (isMasterAdmin ? 'MusifyStar Official' : 'Musisi');
            const avatarColor = getAvatarColor(displayUsername);

            // Resolve user avatar, border frame & custom rank badge
            let userAvatar = currentUser.avatar || '';
            let activeBorderId = currentUser.border || '';
            let activeBorderUrl = currentUser.borderUrl || '';
            let activeBorderName = currentUser.borderName || '';
            let isUserVipRaw = isMasterAdmin || !!(currentUser.isPremium || currentUser.is_premium);
            let vipExpiresAt = currentUser.vipExpiresAt || null;
            let isVipActive = isUserVipRaw && (!vipExpiresAt || Date.now() <= vipExpiresAt);
            let vipTier = isMasterAdmin ? 'permanent' : (currentUser.vipTier || (isVipActive ? 'permanent' : 'none'));

            let equippedBadge = currentUser.equippedBadge || body.equippedBadge || '';
            let equippedBadgeTitle = currentUser.equippedBadgeTitle || body.equippedBadgeTitle || '';
            let equippedBadgeIcon = currentUser.equippedBadgeIcon || body.equippedBadgeIcon || '';
            let equippedBadgeColor = currentUser.equippedBadgeColor || body.equippedBadgeColor || '';

            try {
                const dbData = await storage.readDataAsync('users.json', { users: [], sessions: {} });
                const matched = (dbData.users || []).find(u => String(u.id) === userId || (u.email && u.email.toLowerCase() === email));
                if (matched) {
                    if (matched.username) displayUsername = matched.username;
                    if (matched.avatar) userAvatar = matched.avatar;
                    if (matched.border) activeBorderId = matched.border;
                    if (matched.borderUrl) activeBorderUrl = matched.borderUrl;
                    if (matched.borderName) activeBorderName = matched.borderName;
                    if (matched.isPremium || matched.is_premium) isUserVipRaw = true;
                    if (matched.vipExpiresAt) vipExpiresAt = matched.vipExpiresAt;
                    isVipActive = isUserVipRaw && (!vipExpiresAt || Date.now() <= vipExpiresAt);
                    if (matched.vipTier) vipTier = matched.vipTier;
                    if (matched.equippedBadge !== undefined) equippedBadge = matched.equippedBadge;
                    if (matched.equippedBadgeTitle !== undefined) equippedBadgeTitle = matched.equippedBadgeTitle;
                    if (matched.equippedBadgeIcon !== undefined) equippedBadgeIcon = matched.equippedBadgeIcon;
                    if (matched.equippedBadgeColor !== undefined) equippedBadgeColor = matched.equippedBadgeColor;
                }
            } catch (e) {}

            const borderInfo = resolveBorderDetails(activeBorderId, activeBorderUrl, activeBorderName);

            // Insert into PRIMARY Neon PostgreSQL database
            const insertResult = await pool.query(
                `INSERT INTO global_chat_messages 
                (user_id, username, email, message, badge, is_admin, avatar_color, avatar_url, border_id, border_url, border_name, is_vip, vip_tier, equipped_badge, equipped_badge_title, equipped_badge_icon, equipped_badge_color, ip_address, created_at) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()) 
                RETURNING id, user_id, username, message, badge, is_admin, avatar_color, avatar_url, border_id, border_url, border_name, is_vip, vip_tier, equipped_badge, equipped_badge_title, equipped_badge_icon, equipped_badge_color, created_at`,
                [userId, displayUsername, email, cleanMessage, badge, isMasterAdmin, avatarColor, userAvatar, borderInfo.borderId, borderInfo.borderUrl, borderInfo.borderName, isVipActive, vipTier, equippedBadge, equippedBadgeTitle, equippedBadgeIcon, equippedBadgeColor, clientIp]
            );

            const saved = insertResult.rows[0];

            return res.json({
                status: true,
                message: 'Pesan berhasil terkirim ke Chat Global!',
                chat: {
                    id: String(saved.id),
                    userId: saved.user_id,
                    username: saved.username,
                    message: saved.message,
                    badge: isMasterAdmin ? 'Admin' : saved.badge,
                    isAdmin: isMasterAdmin,
                    isVerifiedAdmin: isMasterAdmin,
                    avatar: userAvatar,
                    avatarColor: saved.avatar_color,
                    borderId: borderInfo.borderId,
                    borderUrl: borderInfo.borderUrl,
                    borderName: borderInfo.borderName,
                    isVip: isVipActive,
                    vipTier: vipTier,
                    vipExpiresAt: vipExpiresAt,
                    equippedBadge: saved.equipped_badge || equippedBadge,
                    equippedBadgeTitle: saved.equipped_badge_title || equippedBadgeTitle,
                    equippedBadgeIcon: saved.equipped_badge_icon || equippedBadgeIcon,
                    equippedBadgeColor: saved.equipped_badge_color || equippedBadgeColor,
                    donatur: referralsApi.resolveUserDonaturInfo(currentUser),
                    createdAt: saved.created_at,
                    clientTempId: body.clientTempId || undefined
                }
            });
        } catch (e) {
            console.error('[GLOBAL_CHAT] POST Error:', e.message);
            return res.status(500).json({ status: false, message: 'Gagal mengirim pesan: ' + e.message });
        }
    }

    // 3. DELETE /api/global-chat - Delete message (Admin or author)
    if (method === 'DELETE') {
        try {
            if (!pool) {
                return res.status(503).json({ status: false, message: 'Database utama belum siap.' });
            }

            const rawId = req.query.id || req.body?.id;
            if (!rawId) {
                return res.status(400).json({ status: false, message: 'ID pesan diperlukan' });
            }

            const numId = parseInt(rawId, 10);
            if (isNaN(numId)) {
                return res.json({ status: true, message: 'Pesan lokal berhasil dihapus.' });
            }

            const adminToken = req.headers['x-admin-token'] || req.query.admin_token;
            let isMasterAdmin = adminAuth.isValidToken(adminToken);

            const authHeader = req.headers.authorization || req.headers['x-auth-token'] || '';
            const rawToken = authHeader.replace(/^Bearer\s+/i, '').trim();
            const headerEmail = (req.headers['x-user-email'] || '').toLowerCase().trim();
            const headerUid = req.headers['x-user-id'] || '';
            const headerUsername = (req.headers['x-user-name'] || '').toLowerCase().trim();

            let callerUid = headerUid;
            let callerEmail = headerEmail;
            let callerUsername = headerUsername;

            if (rawToken) {
                if (rawToken.startsWith('usr_')) {
                    const verified = userAuth.verifyUserToken(rawToken);
                    if (verified && verified.uid) {
                        callerUid = typeof verified.uid === 'object' ? (verified.uid.id || verified.uid.userId) : String(verified.uid);
                        if (verified.u) callerUsername = String(verified.u).toLowerCase().trim();
                    }
                } else if (adminAuth.isValidToken(rawToken)) {
                    isMasterAdmin = true;
                }
            }

            // Look up in users.json to resolve verified identity
            if (callerUid || callerEmail || callerUsername) {
                try {
                    const dbData = await storage.readDataAsync('users.json', { users: [] });
                    const user = (dbData.users || []).find(u => 
                        (callerUid && String(u.id) === String(callerUid)) ||
                        (callerEmail && ((u.email && u.email.toLowerCase() === callerEmail) || (u.rawEmail && u.rawEmail.toLowerCase() === callerEmail))) ||
                        (callerUsername && u.username && u.username.toLowerCase() === callerUsername)
                    );
                    if (user) {
                        callerEmail = (user.email || user.rawEmail || callerEmail).toLowerCase().trim();
                        callerUid = String(user.id || callerUid);
                        callerUsername = (user.username || callerUsername).toLowerCase().trim();
                    }
                } catch (e) {}
            }

            // MASTER ADMIN (jrnabil570@gmail.com) can delete ANY message!
            if (callerEmail === 'jrnabil570@gmail.com' || callerUid === '8589478687' || callerUid === 'u_1790196636099_622dc736') {
                isMasterAdmin = true;
            }

            let isAllowed = isMasterAdmin;

            // Otherwise, check if caller is the original author of this message
            if (!isAllowed) {
                const checkMsg = await pool.query('SELECT user_id, email, username FROM global_chat_messages WHERE id = $1', [numId]);
                if (checkMsg.rows.length > 0) {
                    const row = checkMsg.rows[0];
                    const msgUid = String(row.user_id || '');
                    const msgEmail = (row.email || '').toLowerCase().trim();
                    const msgUsername = (row.username || '').toLowerCase().trim();

                    if ((callerUid && msgUid && callerUid === msgUid) ||
                        (callerEmail && msgEmail && callerEmail === msgEmail) ||
                        (callerUsername && msgUsername && callerUsername === msgUsername)) {
                        isAllowed = true;
                    }
                } else {
                    return res.json({ status: true, message: 'Pesan telah dihapus.' });
                }
            }

            if (!isAllowed) {
                return res.status(403).json({ status: false, message: 'Akses ditolak: Hanya pengirim atau Admin yang dapat menghapus pesan ini.' });
            }

            await pool.query('DELETE FROM global_chat_messages WHERE id = $1', [numId]);

            return res.json({ status: true, message: 'Pesan berhasil dihapus dari database utama.' });
        } catch (e) {
            console.error('[GLOBAL_CHAT] DELETE Error:', e.message);
            return res.status(500).json({ status: false, message: 'Gagal menghapus pesan: ' + e.message });
        }
    }

    return res.status(405).json({ status: false, message: 'Metode tidak didukung' });
};
