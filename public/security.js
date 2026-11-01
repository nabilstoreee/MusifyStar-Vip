/**
 * MusifyStar Universal Security Engine v4.0 (Browser Anti-Tamper Watchdog + Node.js Server Firewall)
 * File ini mendukung 2 lingkungan sekaligus (Universal / Isomorphic):
 * 1. Browser Client (`public/security.js`) -> Menjalankan proteksi Anti-Tamper DevTools & verifikasi HMAC VIP.
 * 2. Server Node.js / Vercel (`api/security.js`) -> Menjalankan Firewall IP, Auto-Ban, & Monitor Aktivitas Admin.
 * Dengan arsitektur Universal ini, meskipun file tertukar saat di-upload ke GitHub/Vercel, tidak akan pernah
 * terjadi error "ReferenceError: window is not defined" di server maupun "require is not defined" di browser.
 */
(function () {
    'use strict';

    // =========================================================================
    // BAGIAN 1: LINGKUNGAN BROWSER (CLIENT-SIDE ANTI-TAMPER WATCHDOG)
    // =========================================================================
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        var _isTriggered = false;
        var _isSyncing = false;
        var _hasServerSynced = false;
        var _verifiedUid = null;
        var _verifiedVip = false;
        var _verifiedTier = 'none';
        var _verifiedSig = null;
        var _verifiedIsMaster = false;
        var _watchdogTimer = null;

        function isValidHexSignature(sig) {
            return typeof sig === 'string' && /^[a-f0-9]{64}$/i.test(sig.trim());
        }

        function stripSpoofedVipFromObject(userObj) {
            if (!userObj || typeof userObj !== 'object') return false;
            var changed = false;
            if (userObj.isPremium || userObj.is_premium || userObj.isVip || userObj.is_vip) {
                userObj.isPremium = false;
                userObj.is_premium = false;
                userObj.isVip = false;
                userObj.is_vip = false;
                changed = true;
            }
            if (userObj.vipTier && userObj.vipTier !== 'none') {
                userObj.vipTier = 'none';
                changed = true;
            }
            if (userObj.isVipTrial) {
                userObj.isVipTrial = false;
                changed = true;
            }
            if (userObj.nameGlow) {
                userObj.nameGlow = '';
                changed = true;
            }
            if (userObj.equippedBadge === 'badge_vip_sultan') {
                userObj.equippedBadge = '';
                userObj.equippedBadgeTitle = '';
                changed = true;
            }
            if (!_verifiedIsMaster) {
                var em = String(userObj.rawEmail || userObj.email || '').toLowerCase().trim();
                if (em === 'jrnabil570@gmail.com') {
                    userObj.email = 'member@musifystar.user';
                    userObj.rawEmail = 'member@musifystar.user';
                    userObj.role = 'member';
                    changed = true;
                }
                if (userObj.role === 'admin') {
                    userObj.role = 'member';
                    changed = true;
                }
            }
            return changed;
        }

        function resetUnauthorizedVipSettings() {
            try {
                var rawSettings = localStorage.getItem('musifystar_app_settings');
                if (rawSettings) {
                    var parsed = JSON.parse(rawSettings);
                    if (parsed && typeof parsed === 'object') {
                        var modified = false;
                        if (parsed.liquidGlassIos27 || parsed.liquidGlassIos26) {
                            parsed.liquidGlassIos27 = false;
                            parsed.liquidGlassIos26 = false;
                            modified = true;
                        }
                        if (parsed.dynamicIsland) {
                            parsed.dynamicIsland = false;
                            modified = true;
                        }
                        if (parsed.audioQuality === 'high') {
                            parsed.audioQuality = 'standard';
                            modified = true;
                        }
                        if (parsed.backgroundPlay) {
                            parsed.backgroundPlay = false;
                            modified = true;
                        }
                        if (parsed.keepScreenAwake) {
                            parsed.keepScreenAwake = false;
                            modified = true;
                        }
                        if (parsed.swipeGestures) {
                            parsed.swipeGestures = false;
                            modified = true;
                        }
                        if (modified) {
                            localStorage.setItem('musifystar_app_settings', JSON.stringify(parsed));
                        }
                    }
                }
                var rawBackup = localStorage.getItem('musifystar_theme_backup');
                if (rawBackup) {
                    var bkp = JSON.parse(rawBackup);
                    if (bkp && (bkp.liquidGlassIos27 || bkp.liquidGlassIos26)) {
                        bkp.liquidGlassIos27 = false;
                        bkp.liquidGlassIos26 = false;
                        localStorage.setItem('musifystar_theme_backup', JSON.stringify(bkp));
                    }
                }
                document.cookie = 'musify_liquid_ios26=0; max-age=31536000; path=/; SameSite=Lax';
                document.cookie = 'musify_liquid_ios27=0; max-age=31536000; path=/; SameSite=Lax';
            } catch (e) {}
        }

        var BrowserSecurity = {
            reportTamper: function(reason, detail) {
                if (_isTriggered) return;

                var targetUser = null;
                try {
                    targetUser = JSON.parse(localStorage.getItem('musifystar_auth_user') || 'null');
                } catch(e) {}

                if (_verifiedIsMaster) {
                    return;
                }

                _isTriggered = true;

                var payload = {
                    action: 'report_tamper',
                    reason: reason || 'Manipulasi status VIP akun via DevTools / Console / Storage',
                    detail: detail || '',
                    userId: targetUser ? (targetUser.id || targetUser.originalId) : '',
                    username: targetUser ? targetUser.username : ''
                };

                try {
                    if (navigator.sendBeacon) {
                        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                        navigator.sendBeacon('/api/security?action=report_tamper', blob);
                    } else {
                        fetch('/api/security?action=report_tamper', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            keepalive: true
                        }).catch(function(){});
                    }
                } catch(e) {}

                try {
                    localStorage.removeItem('musifystar_auth_user');
                    sessionStorage.removeItem('musifystar_auth_user');
                } catch(e) {}

                if (window.MusicPlayer) {
                    try {
                        if (typeof window.MusicPlayer.pause === 'function') window.MusicPlayer.pause();
                        if (window.MusicPlayer.sound && typeof window.MusicPlayer.sound.pause === 'function') window.MusicPlayer.sound.pause();
                    } catch(e) {}
                }

                BrowserSecurity.showLockdownScreen(reason);
            },

            showLockdownScreen: function(reason) {
                document.documentElement.innerHTML = [
                    '<!DOCTYPE html>',
                    '<html lang="id">',
                    '<head>',
                    '<meta charset="UTF-8">',
                    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
                    '<title>AKSES DITOLAK - IP DIBLOKIR</title>',
                    '<style>',
                    '* { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
                    'body { background: #06070a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }',
                    '.card { max-width: 520px; width: 100%; background: #0e111a; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 24px; padding: 32px 24px; text-align: center; box-shadow: 0 0 50px rgba(239, 68, 68, 0.25); }',
                    '.icon { width: 72px; height: 72px; background: rgba(239, 68, 68, 0.15); border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #ef4444; font-size: 32px; }',
                    'h1 { font-size: 20px; font-weight: 900; color: #ef4444; letter-spacing: 0.5px; margin-bottom: 8px; text-transform: uppercase; }',
                    'p.desc { font-size: 13px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin-bottom: 24px; }',
                    '.info-box { background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 16px; text-align: left; margin-bottom: 24px; font-size: 12px; }',
                    '.info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }',
                    '.info-row:last-child { margin-bottom: 0; }',
                    '.info-label { color: rgba(255, 255, 255, 0.4); }',
                    '.info-val { color: #f87171; font-family: monospace; font-weight: bold; }',
                    '.badge { display: inline-block; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: bold; }',
                    '</style>',
                    '</head>',
                    '<body>',
                    '<div class="card">',
                    '<div class="icon">🚫</div>',
                    '<h1>AKSES DITOLAK: IP DIBLOKIR</h1>',
                    '<p class="desc">Sistem mendeteksi percobaan pengubahan status akun VIP secara ilegal melalui DevTools / Console / Storage. Alamat IP dan perangkat Anda telah diblokir secara permanen dari server MusifyStar.</p>',
                    '<div class="info-box">',
                    '<div class="info-row"><span class="info-label">Status Akses:</span><span class="info-val">DIBLOKIR TOTAL (PERMANEN)</span></div>',
                    '<div class="info-row"><span class="info-label">Pelanggaran:</span><span class="info-val">' + (reason || 'Manipulasi Akun VIP Ilegal') + '</span></div>',
                    '</div>',
                    '<div class="badge">Proteksi Keamanan Anti-DevTools MusifyStar Aktif</div>',
                    '</div>',
                    '</body>',
                    '</html>'
                ].join('');
                throw new Error('Security Lockdown Activated');
            },

            registerServerUser: function(user) {
                _hasServerSynced = true;
                if (!user || typeof user !== 'object') {
                    _verifiedUid = null;
                    _verifiedVip = false;
                    _verifiedTier = 'none';
                    _verifiedSig = null;
                    _verifiedIsMaster = false;
                    return;
                }
                var email = String(user.rawEmail || user.email || '').toLowerCase().trim();
                var hasSig = isValidHexSignature(user.vipSignature);
                var isMaster = Boolean(email === 'jrnabil570@gmail.com' && hasSig);
                var isExpired = Boolean(user.vipExpiresAt && Date.now() > Number(user.vipExpiresAt));
                var isVip = isMaster || Boolean(
                    hasSig &&
                    (user.isPremium || user.is_premium) &&
                    user.vipTier &&
                    user.vipTier !== 'none' &&
                    !isExpired
                );

                _verifiedUid = String(user.id || user.originalId || '');
                _verifiedIsMaster = isMaster;
                _verifiedVip = isVip;
                _verifiedTier = isVip ? String(user.vipTier || '1month') : 'none';
                _verifiedSig = hasSig ? String(user.vipSignature).trim() : null;

                if (!isVip) {
                    resetUnauthorizedVipSettings();
                }
            },

            isVerifiedVip: function(user) {
                if (!user || typeof user !== 'object') return false;
                if (_hasServerSynced) {
                    if (_verifiedIsMaster) return true;
                    if (!_verifiedVip || !_verifiedSig) return false;
                    if (!isValidHexSignature(user.vipSignature) || String(user.vipSignature).trim() !== _verifiedSig) {
                        return false;
                    }
                    if (user.vipExpiresAt && Date.now() > Number(user.vipExpiresAt)) {
                        return false;
                    }
                    return Boolean((user.isPremium || user.is_premium) && user.vipTier && user.vipTier !== 'none');
                }
                if (!isValidHexSignature(user.vipSignature)) return false;
                if (user.vipExpiresAt && Date.now() > Number(user.vipExpiresAt)) return false;
                return Boolean((user.isPremium || user.is_premium) && user.vipTier && user.vipTier !== 'none');
            },

            isVerifiedMaster: function(user) {
                if (!user || typeof user !== 'object') return false;
                if (_hasServerSynced) return Boolean(_verifiedIsMaster);
                var email = String(user.rawEmail || user.email || '').toLowerCase().trim();
                return Boolean(email === 'jrnabil570@gmail.com' && isValidHexSignature(user.vipSignature));
            },

            verifyIntegrity: function() {
                if (_isTriggered) return;

                try {
                    if (_hasServerSynced && !_verifiedVip && !_verifiedIsMaster) {
                        var memoryTampered = false;
                        var storageTampered = false;

                        if (window.Auth && window.Auth.currentUser) {
                            var cu = window.Auth.currentUser;
                            var cuClaimedVip = Boolean(
                                cu.isPremium ||
                                cu.is_premium ||
                                cu.isVip ||
                                (cu.vipTier && cu.vipTier !== 'none') ||
                                String(cu.email || cu.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com'
                            );
                            if (cuClaimedVip) {
                                stripSpoofedVipFromObject(cu);
                                memoryTampered = true;
                            }
                        }

                        var raw = localStorage.getItem('musifystar_auth_user');
                        if (raw) {
                            var storedUser = JSON.parse(raw);
                            if (storedUser) {
                                var storedClaimedVip = Boolean(
                                    storedUser.isPremium ||
                                    storedUser.is_premium ||
                                    storedUser.isVip ||
                                    (storedUser.vipTier && storedUser.vipTier !== 'none') ||
                                    String(storedUser.email || storedUser.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com'
                                );
                                if (storedClaimedVip) {
                                    stripSpoofedVipFromObject(storedUser);
                                    localStorage.setItem('musifystar_auth_user', JSON.stringify(storedUser));
                                    storageTampered = true;
                                }
                            }
                        }

                        if (memoryTampered || storageTampered) {
                            resetUnauthorizedVipSettings();
                            if (window.Profile && typeof window.Profile.applySettings === 'function') {
                                try { window.Profile.applySettings(); } catch(e) {}
                            }
                            if (window.Auth && typeof window.Auth.updateHeaderUI === 'function') {
                                try { window.Auth.updateHeaderUI(); } catch(e) {}
                            }
                            if (window.Auth && typeof window.Auth.checkSession === 'function' && !_isSyncing) {
                                _isSyncing = true;
                                window.Auth.checkSession().finally(function() {
                                    setTimeout(function() { _isSyncing = false; }, 5000);
                                });
                            }
                        }
                    }
                } catch(e) {}
            },

            init: function() {
                window.addEventListener('storage', function(e) {
                    if (e.key === 'musifystar_auth_user' || e.key === 'musifystar_app_settings' || e.key === 'musifystar_theme_backup') {
                        BrowserSecurity.verifyIntegrity();
                    }
                });

                if (!_watchdogTimer) {
                    _watchdogTimer = setInterval(function() {
                        BrowserSecurity.verifyIntegrity();
                    }, 1500);
                }
            }
        };

        try {
            Object.freeze(BrowserSecurity);
        } catch (e) {}

        window.Security = BrowserSecurity;
        BrowserSecurity.init();
        return;
    }

    // =========================================================================
    // BAGIAN 2: LINGKUNGAN SERVER NODE.JS / VERCEL (FIREWALL & IP MONITOR)
    // =========================================================================
    if (typeof require === 'undefined' || typeof module === 'undefined') {
        return;
    }

    const crypto = require('crypto');
    const path = require('path');

    function requireApiModule(modName) {
        try {
            return require('./' + modName);
        } catch (e1) {
            try {
                return require(path.join(__dirname, 'api', modName));
            } catch (e2) {
                return require(path.join(__dirname, '..', 'api', modName));
            }
        }
    }

    const storage = requireApiModule('storage.js');

    const VIP_INTEGRITY_SECRET = process.env.VIP_SECRET || 'musifystar_vip_integrity_hmac_secret_2026_super_key';
    const BANNED_IPS_FILE = '.banned_ips.json';
    const SECURITY_EVENTS_FILE = '.security_events_log.json';
    const IP_ACTIVITY_FILE = '.ip_activity_monitor.json';
    const USERS_FILE = 'users.json';

    // In-memory real-time activity tracker (synced periodically to storage)
    const ipActivityMap = new Map();
    let securityEventsLog = [];
    let lastActivityPersistTime = 0;

    // Load persisted security events & IP activity on startup
    try {
        const savedEvents = storage.readData(SECURITY_EVENTS_FILE, []);
        if (Array.isArray(savedEvents)) {
            securityEventsLog = savedEvents.slice(0, 150);
        }
    } catch (e) {}

    try {
        const savedActivity = storage.readData(IP_ACTIVITY_FILE, {});
        if (savedActivity && typeof savedActivity === 'object') {
            Object.entries(savedActivity).forEach(([k, v]) => {
                if (k && v && typeof v === 'object') {
                    ipActivityMap.set(k, v);
                }
            });
        }
    } catch (e) {}

    // Async sync from PostgreSQL / persistent storage in background
    try {
        storage.readDataAsync(SECURITY_EVENTS_FILE, []).then(list => {
            if (Array.isArray(list) && list.length > securityEventsLog.length) {
                securityEventsLog = list.slice(0, 150);
            }
        }).catch(() => {});
        storage.readDataAsync(IP_ACTIVITY_FILE, {}).then(obj => {
            if (obj && typeof obj === 'object') {
                Object.entries(obj).forEach(([k, v]) => {
                    if (k && v && typeof v === 'object' && !ipActivityMap.has(k)) {
                        ipActivityMap.set(k, v);
                    }
                });
            }
        }).catch(() => {});
    } catch (e) {}

    // SHA-256 Hashes of Exempt / Immune Administrator IP Addresses and Subnets
    const IMMUNE_IP_HASHES = new Set([
        '9822b6fd8f7c14e83f3a8a893cb232628c5fb4aeacfec07ca5714407f9e530d8',
        '759fad1ccf96916d1677ea6b0e8c9930c414d4f7a6583a01262b346a9bafec0f',
        '7fe3d135013179b033fd221e811796ff3907c3ac50a7ed34f7b23ec4d210f930',
        '2e01bb988a00d929e551742f0239b7c729cb8bc653dc938528828faaa245a2bb',
        '05d5e60892adb0f6edf0522b0fc83f206200e5b4a8b0aab3651c4b8743f52e5b'
    ]);

    const DYNAMIC_IMMUNE_FILE = '.admin_immune_hashes.json';
    const DYNAMIC_IMMUNE_HASHES = new Set();

    try {
        const list = storage.readData(DYNAMIC_IMMUNE_FILE, []);
        if (Array.isArray(list)) {
            list.forEach(h => {
                if (typeof h === 'string' && h.length === 64) DYNAMIC_IMMUNE_HASHES.add(h);
            });
        }
    } catch (e) {}

    try {
        storage.readDataAsync(DYNAMIC_IMMUNE_FILE, []).then(list => {
            if (Array.isArray(list)) {
                list.forEach(h => {
                    if (typeof h === 'string' && h.length === 64) DYNAMIC_IMMUNE_HASHES.add(h);
                });
            }
        }).catch(() => {});
    } catch (e) {}

    function normalizeIp(ip) {
        if (!ip) return '127.0.0.1';
        let clean = String(ip).trim().toLowerCase().replace(/^::ffff:/, '');
        if (clean.includes(',')) {
            clean = clean.split(',')[0].trim().replace(/^::ffff:/, '');
        }
        if (clean === '::1' || clean === 'localhost') clean = '127.0.0.1';
        return clean;
    }

    function parseDeviceLabel(uaString) {
        if (!uaString) return 'Perangkat Tidak Diketahui';
        const ua = String(uaString);
        if (isBotOrScraper(ua)) return 'Bot / Scraper / Downloader';
        if (/curl\//i.test(ua)) return 'Terminal cURL / Script';
        let os = 'Perangkat Lain';
        if (/android/i.test(ua)) os = 'Android';
        else if (/iphone|ipad|ipod/i.test(ua)) os = 'iPhone / iOS';
        else if (/windows/i.test(ua)) os = 'Windows PC';
        else if (/macintosh|mac os x/i.test(ua)) os = 'Mac / macOS';
        else if (/linux/i.test(ua)) os = 'Linux PC';

        let browser = 'Browser';
        if (/edg\//i.test(ua)) browser = 'Edge';
        else if (/opr\/|opera/i.test(ua)) browser = 'Opera';
        else if (/chrome\/|crios\//i.test(ua)) browser = 'Chrome';
        else if (/firefox\/|fxios\//i.test(ua)) browser = 'Firefox';
        else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
        else if (/wv|webview/i.test(ua)) browser = 'APK WebView';

        return `${os} • ${browser}`;
    }

    function describeUserAction(req) {
        const rawPath = String(req.path || req.url || '/').toLowerCase();
        const rawUrl = String(req.url || '').toLowerCase();

        if (rawPath === '/' || rawPath === '/index.html') {
            return { label: 'Membuka Halaman Utama Website', category: 'page', isAsset: false };
        }
        if (rawPath.startsWith('/api/ytplay') || rawPath.startsWith('/api/ proxy-audio') || rawPath.includes('ytplay')) {
            return { label: 'Memutar Musik / Streaming Audio', category: 'music', isAsset: false };
        }
        if (rawPath.startsWith('/api/search')) {
            return { label: 'Mencari Lagu / Artis', category: 'search', isAsset: false };
        }
        if (rawPath.startsWith('/api/lyrics')) {
            return { label: 'Membaca Lirik Lagu', category: 'lyrics', isAsset: false };
        }
        if (rawPath.startsWith('/api/global-chat')) {
            return { label: 'Membuka / Mengirim Chat Global', category: 'chat', isAsset: false };
        }
        if (rawPath.startsWith('/api/user-auth')) {
            if (rawUrl.includes('login')) return { label: 'Login ke Akun Pengguna', category: 'auth', isAsset: false };
            if (rawUrl.includes('register')) return { label: 'Mendaftar Akun Baru', category: 'auth', isAsset: false };
            if (rawUrl.includes('redeem')) return { label: 'Menukar Kode Voucher / Poin VIP', category: 'vip', isAsset: false };
            if (rawUrl.includes('claim_vip_trial')) return { label: 'Klaim Trial VIP Pengguna Baru', category: 'vip', isAsset: false };
            if (rawUrl.includes('admin_')) return { label: 'Mengelola Panel Administrator', category: 'admin', isAsset: false };
            return { label: 'Sinkronisasi Profil & Status Akun', category: 'profile', isAsset: false };
        }
        if (rawPath.startsWith('/api/security')) {
            if (rawUrl.includes('report_tamper')) return { label: '🚨 Percobaan Manipulasi DevTools / VIP', category: 'tamper', isAsset: false };
            if (rawUrl.includes('admin_')) return { label: 'Memantau Keamanan & IP (Admin)', category: 'admin', isAsset: false };
            return { label: 'Verifikasi Keamanan Sistem', category: 'security', isAsset: false };
        }
        if (rawPath.startsWith('/api/feedback')) {
            return { label: 'Mengirim / Membaca Masukan & Saran', category: 'feedback', isAsset: false };
        }
        if (rawPath.startsWith('/api/analytics') || rawPath.startsWith('/api/global-stats')) {
            return { label: 'Sinkronisasi Statistik Pemutaran', category: 'stats', isAsset: false };
        }
        if (rawPath.startsWith('/api/')) {
            return { label: `Mengakses Fitur API (${rawPath})`, category: 'api', isAsset: false };
        }
        if (/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff|woff2|ttf|mp3|json)$/i.test(rawPath)) {
            return { label: 'Memuat Aset Tampilan Website', category: 'asset', isAsset: true };
        }
        return { label: `Mengakses Halaman (${rawPath.slice(0, 40)})`, category: 'page', isAsset: false };
    }

    function recordSecurityEvent(eventData = {}) {
        try {
            const entry = {
                id: 'sec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
                timestamp: new Date().toISOString(),
                ip: normalizeIp(eventData.ip || '0.0.0.0'),
                type: eventData.type || 'auto_ban',
                source: eventData.source || 'auto_system',
                category: eventData.category || 'Proteksi Sistem Otomatis',
                reason: eventData.reason || 'Pelanggaran keamanan terdeteksi oleh sistem.',
                path: eventData.path || '',
                userAgent: eventData.userAgent || '',
                deviceLabel: parseDeviceLabel(eventData.userAgent || ''),
                username: eventData.username || '',
                userId: eventData.userId || '',
                email: eventData.email || ''
            };
            securityEventsLog.unshift(entry);
            if (securityEventsLog.length > 150) {
                securityEventsLog = securityEventsLog.slice(0, 150);
            }
            storage.writeDataAsync(SECURITY_EVENTS_FILE, securityEventsLog).catch(() => {});
        } catch (e) {}
    }

    function persistActivityMonitorThrottled(force = false) {
        const now = Date.now();
        if (!force && now - lastActivityPersistTime < 15000) return;
        lastActivityPersistTime = now;
        try {
            const entries = Array.from(ipActivityMap.entries())
                .sort((a, b) => new Date(b[1].lastSeenAt || 0).getTime() - new Date(a[1].lastSeenAt || 0).getTime())
                .slice(0, 120);
            const obj = {};
            for (const [k, v] of entries) {
                obj[k] = v;
            }
            storage.writeDataAsync(IP_ACTIVITY_FILE, obj).catch(() => {});
        } catch (e) {}
    }

    function isImmuneIp(ip) {
        if (!ip) return false;
        const clean = normalizeIp(ip);
        if (!clean) return false;
        if (
            clean === '127.0.0.1' ||
            clean === '::1' ||
            clean === 'localhost' ||
            clean.startsWith('10.') ||
            clean.startsWith('192.168.') ||
            clean.startsWith('169.254.') ||
            /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(clean)
        ) return true;

        try {
            const fullHash = crypto.createHash('sha256').update(clean).digest('hex');
            if (IMMUNE_IP_HASHES.has(fullHash) || DYNAMIC_IMMUNE_HASHES.has(fullHash)) return true;

            if (clean.includes(':')) {
                const parts = clean.split(':');
                if (parts.length >= 4) {
                    const prefix = parts.slice(0, 4).join(':');
                    const prefixHash = crypto.createHash('sha256').update(prefix).digest('hex');
                    if (IMMUNE_IP_HASHES.has(prefixHash) || DYNAMIC_IMMUNE_HASHES.has(prefixHash)) return true;
                }
            }
        } catch(e) {}
        return false;
    }

    function addImmuneIp(ip) {
        if (!ip) return;
        const clean = normalizeIp(ip);
        if (!clean) return;
        let modified = false;
        try {
            const fullHash = crypto.createHash('sha256').update(clean).digest('hex');
            if (!DYNAMIC_IMMUNE_HASHES.has(fullHash)) {
                DYNAMIC_IMMUNE_HASHES.add(fullHash);
                modified = true;
            }
            if (clean.includes(':')) {
                const parts = clean.split(':');
                if (parts.length >= 4) {
                    const prefix = parts.slice(0, 4).join(':');
                    const prefixHash = crypto.createHash('sha256').update(prefix).digest('hex');
                    if (!DYNAMIC_IMMUNE_HASHES.has(prefixHash)) {
                        DYNAMIC_IMMUNE_HASHES.add(prefixHash);
                        modified = true;
                    }
                }
            }

            if (modified) {
                const arr = Array.from(DYNAMIC_IMMUNE_HASHES);
                storage.writeDataAsync(DYNAMIC_IMMUNE_FILE, arr).catch(() => {});
            }
        } catch(e) {}
    }

    function readBannedIpsSync() {
        let result = {};
        try {
            const data = storage.readData(BANNED_IPS_FILE, {});
            if (data && typeof data === 'object') result = data;
        } catch (e) {}

        let cleaned = false;
        for (const key of Object.keys(result)) {
            if (isImmuneIp(key)) {
                delete result[key];
                cleaned = true;
            }
        }
        if (cleaned) {
            writeBannedIpsAsync(result).catch(() => {});
        }

        return result;
    }

    async function readBannedIpsAsync() {
        let result = {};
        try {
            const data = await storage.readDataAsync(BANNED_IPS_FILE, {});
            if (data && typeof data === 'object') result = data;
        } catch (e) {}

        if (Object.keys(result).length === 0) {
            result = readBannedIpsSync();
        }

        let cleaned = false;
        for (const key of Object.keys(result)) {
            if (isImmuneIp(key)) {
                delete result[key];
                cleaned = true;
            }
        }
        if (cleaned) {
            await writeBannedIpsAsync(result);
        }

        return result;
    }

    async function writeBannedIpsAsync(ipsMap) {
        const safeMap = {};
        if (ipsMap && typeof ipsMap === 'object') {
            for (const [k, v] of Object.entries(ipsMap)) {
                if (!isImmuneIp(k)) {
                    safeMap[k] = v;
                }
            }
        }

        try {
            await storage.writeDataAsync(BANNED_IPS_FILE, safeMap);
        } catch (e) {
            console.error('[SECURITY] Error saving banned IPs to storage:', e.message);
        }
    }

    function getIpBanStatus(ip, bannedMap) {
        const cleanIp = normalizeIp(ip);
        if (!cleanIp || isImmuneIp(cleanIp)) {
            return { isIpBanned: false, immune: true };
        }

        const map = bannedMap || readBannedIpsSync();
        const matchKey = Object.keys(map).find(k => {
            let cleanK = normalizeIp(k);
            if (!cleanK || isImmuneIp(cleanK)) return false;
            return cleanK === cleanIp || (cleanK.length > 8 && cleanIp === cleanK);
        });

        if (!matchKey) return { isIpBanned: false };

        const rec = map[matchKey] || {};
        if (rec.banType === 'temporary' && rec.banExpiresAt) {
            if (new Date(rec.banExpiresAt).getTime() <= Date.now()) {
                delete map[matchKey];
                writeBannedIpsAsync(map).catch(() => {});
                return { isIpBanned: false };
            }
        }

        return {
            isIpBanned: true,
            ip: rec.ip || cleanIp,
            banType: rec.banType || 'permanent',
            banReason: rec.banReason || 'Alamat IP Anda telah diblokir secara permanen oleh sistem keamanan.',
            banExpiresAt: rec.banExpiresAt || null,
            banDurationDays: rec.banDurationDays || null,
            source: rec.source || 'auto_system',
            category: rec.category || 'Proteksi Keamanan Otomatis',
            blockedAttempts: Number(rec.blockedAttempts || 1),
            lastAttemptAt: rec.lastAttemptAt || rec.createdAt || new Date().toISOString(),
            createdAt: rec.createdAt || new Date().toISOString(),
            details: rec.details || {}
        };
    }

    function recordBlockedAttempt(ip, rawPath = '', ua = '') {
        try {
            const cleanIp = normalizeIp(ip);
            if (!cleanIp || isImmuneIp(cleanIp)) return;
            const map = readBannedIpsSync();
            const matchKey = Object.keys(map).find(k => normalizeIp(k) === cleanIp);
            if (matchKey && map[matchKey]) {
                const rec = map[matchKey];
                rec.blockedAttempts = Number(rec.blockedAttempts || 1) + 1;
                rec.lastAttemptAt = new Date().toISOString();
                rec.lastBlockedPath = rawPath || rec.lastBlockedPath || '';
                if (ua && (!rec.userAgent || rec.userAgent === '')) {
                    rec.userAgent = ua;
                    rec.deviceLabel = parseDeviceLabel(ua);
                }
                writeBannedIpsAsync(map).catch(() => {});
            }

            const act = ipActivityMap.get(cleanIp);
            if (act) {
                act.status = 'banned';
                act.statusLabel = 'Diblokir Sistem / Blacklist';
                act.blockedAttempts = Number(act.blockedAttempts || 0) + 1;
                act.lastSeenAt = new Date().toISOString();
                act.lastActionLabel = `🚫 Ditolak Firewall (${rawPath || '/'})`;
                persistActivityMonitorThrottled();
            }
        } catch (e) {}
    }

    function recordRequestActivity(req, cleanIp, isImmune = false, banCheck = null) {
        try {
            const ip = normalizeIp(cleanIp || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
            if (!ip) return;

            const rawPath = String(req.path || req.url || '/');
            const ua = String(req.headers['user-agent'] || '');
            const actionDesc = describeUserAction(req);

            const existing = ipActivityMap.get(ip);
            if (actionDesc.isAsset && existing) {
                existing.totalAssetRequests = Number(existing.totalAssetRequests || 0) + 1;
                return;
            }

            const nowMs = Date.now();
            const nowIso = new Date(nowMs).toISOString();

            let tokenUser = null;
            const tokenCandidate = req.headers['x-auth-token'] || req.headers['authorization'] || '';
            if (tokenCandidate && !tokenCandidate.startsWith('Basic ')) {
                try {
                    const UserAuth = requireApiModule('user-auth.js');
                    if (UserAuth && typeof UserAuth.verifyUserToken === 'function') {
                        tokenUser = UserAuth.verifyUserToken(tokenCandidate);
                    }
                } catch (e) {}
            }

            const record = existing || {
                ip: ip,
                firstSeenAt: nowIso,
                lastSeenAt: nowIso,
                totalRequests: 0,
                totalAssetRequests: 0,
                requestsPerMinute: 1,
                recentTimestamps: [],
                userAgent: ua,
                deviceLabel: parseDeviceLabel(ua),
                username: '',
                userId: '',
                email: '',
                isVip: false,
                isImmune: Boolean(isImmune),
                lastActionLabel: actionDesc.label,
                lastPath: rawPath,
                recentActions: [],
                violationCount: 0,
                blockedAttempts: 0,
                status: 'normal',
                statusLabel: 'Penggunaan Wajar & Aman',
                behaviorSummary: 'Menggunakan fitur website secara normal sesuai prosedur.'
            };

            record.lastSeenAt = nowIso;
            record.totalRequests = Number(record.totalRequests || 0) + 1;
            record.isImmune = Boolean(isImmune || isImmuneIp(ip));
            if (ua) {
                record.userAgent = ua;
                record.deviceLabel = parseDeviceLabel(ua);
            }

            if (tokenUser) {
                if (tokenUser.u) record.username = tokenUser.u;
                if (tokenUser.uid) record.userId = String(tokenUser.uid);
            }

            if (!Array.isArray(record.recentTimestamps)) record.recentTimestamps = [];
            record.recentTimestamps.push(nowMs);
            record.recentTimestamps = record.recentTimestamps.filter(t => nowMs - t < 60000);
            record.requestsPerMinute = record.recentTimestamps.length;

            if (!actionDesc.isAsset) {
                record.lastActionLabel = actionDesc.label;
                record.lastPath = rawPath;
                if (!Array.isArray(record.recentActions)) record.recentActions = [];
                const lastAct = record.recentActions[0];
                if (!lastAct || lastAct.label !== actionDesc.label || (nowMs - new Date(lastAct.time).getTime() > 2000)) {
                    record.recentActions.unshift({
                        label: actionDesc.label,
                        path: rawPath.slice(0, 80),
                        method: req.method || 'GET',
                        time: nowIso
                    });
                    if (record.recentActions.length > 8) {
                        record.recentActions = record.recentActions.slice(0, 8);
                    }
                }
            }

            const isBannedNow = (banCheck && banCheck.isIpBanned) || getIpBanStatus(ip).isIpBanned;
            if (isBannedNow) {
                record.status = 'banned';
                record.statusLabel = 'Terblokir Otomatis / Blacklist';
                record.behaviorSummary = (banCheck && banCheck.banReason) || 'Diblokir karena pelanggaran keamanan sistem.';
            } else if (record.isImmune) {
                record.status = 'admin';
                record.statusLabel = 'Admin / Immune (Terlindungi)';
                record.behaviorSummary = 'Koneksi Administrator Resmi (Memiliki kekebalan anti-blokir).';
            } else if (record.violationCount > 0 || record.requestsPerMinute > 95 || actionDesc.category === 'tamper') {
                record.status = 'suspicious';
                record.statusLabel = 'Aktivitas Mencurigakan / Pantau';
                if (actionDesc.category === 'tamper') {
                    record.behaviorSummary = 'Terdeteksi memicu sinyal manipulasi DevTools / inspeksi elemen.';
                } else if (record.requestsPerMinute > 95) {
                    record.behaviorSummary = `Frekuensi trafik sangat tinggi (${record.requestsPerMinute} req/menit) — indikasi spam atau bot.`;
                } else {
                    record.behaviorSummary = `Tercatat ${record.violationCount} peringatan aktivitas tidak wajar.`;
                }
            } else {
                record.status = 'normal';
                record.statusLabel = 'Menggunakan Website dengan Benar (Wajar)';
                record.behaviorSummary = `Aktivitas normal (${record.requestsPerMinute} req/mnt) • ${record.lastActionLabel}`;
            }

            ipActivityMap.set(ip, record);
            persistActivityMonitorThrottled();
        } catch (e) {}
    }

    async function banIp(ip, reason, extraDetails = {}) {
        const cleanIp = normalizeIp(ip);
        if (!cleanIp || cleanIp === '127.0.0.1' || cleanIp === 'localhost' || isImmuneIp(cleanIp)) {
            console.warn(`[SECURITY] Skipping immune / loopback IP ban: ${cleanIp}`);
            return { isIpBanned: false, skipped: true, immune: true };
        }

        const currentBanned = await readBannedIpsAsync();
        const existing = currentBanned[cleanIp] || {};
        const nowIso = new Date().toISOString();
        const source = extraDetails.source || existing.source || 'auto_system';
        const category = extraDetails.category || existing.category || 'Proteksi Sistem Otomatis';
        const ua = extraDetails.ua || extraDetails.userAgent || existing.userAgent || '';
        const rawPath = extraDetails.path || existing.path || '';

        currentBanned[cleanIp] = {
            ip: cleanIp,
            banType: extraDetails.banType || 'permanent',
            banReason: reason || 'Pelanggaran Keamanan: Percobaan manipulasi status akun VIP via DevTools / Scraper.',
            banExpiresAt: extraDetails.banExpiresAt || null,
            banDurationDays: extraDetails.banDurationDays || 0,
            source: source,
            category: category,
            path: rawPath,
            userAgent: ua,
            deviceLabel: parseDeviceLabel(ua),
            username: extraDetails.username || existing.username || '',
            userId: extraDetails.userId || existing.userId || '',
            email: extraDetails.email || existing.email || '',
            blockedAttempts: Number(existing.blockedAttempts || 0) + 1,
            lastAttemptAt: nowIso,
            createdAt: existing.createdAt || nowIso,
            details: { ...(existing.details || {}), ...extraDetails }
        };

        await writeBannedIpsAsync(currentBanned);

        const act = ipActivityMap.get(cleanIp) || {
            ip: cleanIp,
            firstSeenAt: nowIso,
            totalRequests: 1,
            requestsPerMinute: 1,
            recentActions: []
        };
        act.lastSeenAt = nowIso;
        act.status = 'banned';
        act.statusLabel = source === 'auto_system' ? 'Terblokir Otomatis oleh Sistem' : 'Diblokir Manual oleh Admin';
        act.behaviorSummary = currentBanned[cleanIp].banReason;
        act.violationCount = Number(act.violationCount || 0) + 1;
        act.blockedAttempts = currentBanned[cleanIp].blockedAttempts;
        if (extraDetails.username) act.username = extraDetails.username;
        if (extraDetails.userId) act.userId = extraDetails.userId;
        if (ua) {
            act.userAgent = ua;
            act.deviceLabel = parseDeviceLabel(ua);
        }
        ipActivityMap.set(cleanIp, act);
        persistActivityMonitorThrottled(true);

        recordSecurityEvent({
            ip: cleanIp,
            type: source === 'auto_system' ? 'auto_ban' : 'manual_ban',
            source: source,
            category: category,
            reason: currentBanned[cleanIp].banReason,
            path: rawPath,
            userAgent: ua,
            username: currentBanned[cleanIp].username,
            userId: currentBanned[cleanIp].userId,
            email: currentBanned[cleanIp].email
        });

        console.warn(`[SECURITY ALERT] IP BANNED (${source}): ${cleanIp} — Category: ${category} — Reason: ${reason}`);

        return {
            isIpBanned: true,
            ip: cleanIp,
            banType: currentBanned[cleanIp].banType,
            banReason: currentBanned[cleanIp].banReason,
            source: source,
            category: category
        };
    }

    function generateVipSignature(userId, vipTier, vipExpiresAt) {
        if (!userId) return '';
        const tier = String(vipTier || 'none').toLowerCase().trim();
        const exp = vipExpiresAt ? Number(vipExpiresAt) : 0;
        const payload = `uid:${userId}|tier:${tier}|exp:${exp}`;
        return crypto.createHmac('sha256', VIP_INTEGRITY_SECRET).update(payload).digest('hex');
    }

    function verifyVipSignature(userId, vipTier, vipExpiresAt, signature) {
        if (!userId || !signature) return false;
        const expected = generateVipSignature(userId, vipTier, vipExpiresAt);
        try {
            return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
        } catch (e) {
            return false;
        }
    }

    const FORBIDDEN_BOT_PATTERNS = [
        /getweb/i,
        /webget/i,
        /httrack/i,
        /teleport/i,
        /offline\s*explorer/i,
        /webcopier/i,
        /site-sucker/i,
        /sitesucker/i,
        /pagegrabber/i,
        /\bwget\b/i,
        /python-requests/i,
        /python-urllib/i,
        /aiohttp/i,
        /scrapy/i,
        /sqlmap/i,
        /nikto/i,
        /acunetix/i,
        /masscan/i,
        /dirbuster/i,
        /gobuster/i,
        /nmap/i,
        /zgrab/i,
        /censys/i,
        /burpcollaborator/i,
        /libwww-perl/i
    ];

    function isBotOrScraper(userAgent) {
        if (!userAgent) return false;
        const ua = String(userAgent).toLowerCase();
        for (const pattern of FORBIDDEN_BOT_PATTERNS) {
            if (pattern.test(ua)) return true;
        }
        return false;
    }

    function serveCorruptedDummyFile(res) {
        const dummyLengths = [0, 4, 8];
        const chosenLen = dummyLengths[Math.floor(Math.random() * dummyLengths.length)];
        const dummyBytes = chosenLen === 0 ? Buffer.alloc(0) : Buffer.from([0x00, 0xFF, 0x00, 0x00]);

        res.setHeader('Content-Type', 'application/octet-stream; charset=binary');
        res.setHeader('Content-Disposition', 'attachment; filename="data.bin"');
        res.setHeader('X-Content-Encoded', 'scrambled-zero');
        res.setHeader('X-Security-Checksum', crypto.randomBytes(16).toString('hex'));
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Content-Length', dummyBytes.length);
        res.status(200);
        return res.end(dummyBytes);
    }

    function getIpBannedHtmlPage(clientIp, banDetails = {}) {
        const reason = banDetails.banReason || 'Pelanggaran Keamanan: Percobaan manipulasi status akun VIP atau akses ilegal.';
        const dateStr = banDetails.createdAt ? new Date(banDetails.createdAt).toLocaleString('id-ID') : new Date().toLocaleString('id-ID');

        return `<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Akses Ditolak - Alamat IP Diblokir</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        body { background: #06070a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
        .card { max-width: 520px; width: 100%; background: #0e111a; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 24px; padding: 32px 24px; text-align: center; box-shadow: 0 0 50px rgba(239, 68, 68, 0.2); }
        .icon { width: 72px; height: 72px; background: rgba(239, 68, 68, 0.15); border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #ef4444; font-size: 32px; }
        h1 { font-size: 20px; font-weight: 900; color: #ef4444; letter-spacing: 0.5px; margin-bottom: 8px; text-transform: uppercase; }
        p.desc { font-size: 13px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin-bottom: 24px; }
        .info-box { background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 16px; text-align: left; margin-bottom: 24px; font-size: 12px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .info-row:last-child { margin-bottom: 0; }
        .info-label { color: rgba(255, 255, 255, 0.4); }
        .info-val { color: #f87171; font-family: monospace; font-weight: bold; }
        .warning-badge { display: inline-block; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">🚫</div>
        <h1>AKSES DITOLAK: IP DIBLOKIR</h1>
        <p class="desc">Sistem keamanan server MusifyStar mendeteksi percobaan manipulasi ilegal status akun VIP (DevTools / Console / Tampering) atau aktivitas unduhan scraper. Alamat IP dan perangkat Anda telah diblokir secara permanen.</p>
        
        <div class="info-box">
            <div class="info-row">
                <span class="info-label">Alamat IP Anda:</span>
                <span class="info-val">${clientIp || 'Terdeteksi'}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Status Blokir:</span>
                <span class="info-val">PERMANEN (SELAMANYA)</span>
            </div>
            <div class="info-row">
                <span class="info-label">Waktu Blokir:</span>
                <span class="info-val" style="color:#fff;">${dateStr}</span>
            </div>
            <div class="info-row" style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.1); padding-top: 8px;">
                <span class="info-label">Alasan:</span>
                <span class="info-val" style="color:#fca5a5; font-size:11px;">${reason}</span>
            </div>
        </div>

        <div class="warning-badge">Proteksi Keamanan Anti-Tamper MusifyStar Aktif</div>
    </div>
</body>
</html>`;
    }

    function verifyAdminRequest(req) {
        try {
            const adminAuth = requireApiModule('admin-auth.js');
            const token = req.headers['x-admin-token'] || req.query.adminToken || req.body?.adminToken || '';
            if (token && adminAuth && typeof adminAuth.verifyToken === 'function') {
                return adminAuth.verifyToken(token);
            }
        } catch (e) {}
        return false;
    }

    async function securityHandler(req, res) {
        const action = req.query.action || req.body?.action;
        const clientIp = normalizeIp(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
        const ua = String(req.headers['user-agent'] || '');

        if (action === 'report_tamper') {
            const body = req.body || {};
            const reason = body.reason || 'Percobaan manipulasi status VIP akun lewat DevTools / Console / Storage';
            const targetUserId = String(body.userId || '').trim();
            const targetUsername = String(body.username || '').trim();
            const targetEmail = String(body.email || body.rawEmail || '').toLowerCase().trim();

            if (isImmuneIp(clientIp) || targetEmail === 'jrnabil570@gmail.com' || targetUserId === '8589478687') {
                console.log(`[SECURITY] Tamper report bypassed for Master Admin: ${targetEmail || targetUsername} (IP: ${clientIp})`);
                return res.json({
                    status: true,
                    ipBanned: false,
                    banned: false,
                    message: 'Master Admin verified.'
                });
            }

            console.warn(`[SECURITY TAMPER ALERT] Tampering reported by client from IP ${clientIp}: ${reason} (User: ${targetUsername} / ${targetUserId})`);

            const banResult = await banIp(clientIp, reason, {
                source: 'auto_system',
                category: 'Manipulasi DevTools / Akun VIP',
                path: '/api/security?action=report_tamper',
                ua: ua,
                reportedAt: new Date().toISOString(),
                userId: targetUserId,
                username: targetUsername,
                email: targetEmail,
                tamperDetail: body.detail || ''
            });

            if (banResult.immune) {
                return res.json({
                    status: true,
                    ipBanned: false,
                    banned: false,
                    message: 'IP memiliki proteksi anti-blokir.'
                });
            }

            return res.status(403).json({
                status: false,
                ipBanned: true,
                banned: true,
                message: 'Alamat IP Anda telah diblokir secara permanen karena pelanggaran keamanan manipulasi status VIP.',
                ban: banResult
            });
        }

        if (action === 'check_ip') {
            const banCheck = getIpBanStatus(clientIp);
            return res.json({
                status: true,
                ip: clientIp,
                ipBanned: banCheck.isIpBanned,
                ban: banCheck
            });
        }

        if (action === 'admin_monitor') {
            if (!verifyAdminRequest(req)) {
                return res.status(401).json({ status: false, message: 'Sesi Administrator tidak valid atau kedaluwarsa.' });
            }

            const bannedMap = await readBannedIpsAsync();
            let usersMap = {};
            try {
                const rawUsers = await storage.readDataAsync(USERS_FILE, {});
                if (rawUsers && typeof rawUsers === 'object') usersMap = rawUsers;
            } catch (e) {}

            const ipToUsers = {};
            Object.values(usersMap).forEach(u => {
                if (!u || typeof u !== 'object') return;
                const uIp = normalizeIp(u.lastIp || u.registeredIp || '');
                if (uIp) {
                    if (!ipToUsers[uIp]) ipToUsers[uIp] = [];
                    const isExp = u.vipExpiresAt && Date.now() > Number(u.vipExpiresAt);
                    const isVip = Boolean(u.isPremium && u.vipTier && u.vipTier !== 'none' && !isExp);
                    ipToUsers[uIp].push({
                        id: u.id || '',
                        username: u.username || '',
                        displayName: u.displayName || u.username || '',
                        email: u.rawEmail || u.email || '',
                        isVip: isVip,
                        vipTier: u.vipTier || 'none',
                        lastLoginAt: u.lastLoginAt || null
                    });
                }
            });

            const bannedIpsList = Object.entries(bannedMap).map(([ipKey, item]) => {
                const clean = normalizeIp(item.ip || ipKey);
                const matchedUsers = ipToUsers[clean] || [];
                const primaryUser = matchedUsers[0] || null;
                const src = item.source || (item.details && item.details.source) || (String(item.banReason || '').toLowerCase().includes('administrator') ? 'admin_manual' : 'auto_system');
                let cat = item.category || (item.details && item.details.category) || '';
                if (!cat) {
                    const rLower = String(item.banReason || '').toLowerCase();
                    if (rLower.includes('devtools') || rLower.includes('vip') || rLower.includes('tamper')) cat = 'Manipulasi DevTools / VIP';
                    else if (rLower.includes('scraper') || rLower.includes('getweb') || rLower.includes('ripper')) cat = 'Unduhan Scraper / GetWeb';
                    else if (rLower.includes('curl')) cat = 'Akses Script cURL Eksternal';
                    else if (rLower.includes('traversal')) cat = 'Serangan Path Traversal';
                    else if (rLower.includes('sensitif') || rLower.includes('.env')) cat = 'Akses File Sensitif Server';
                    else if (src === 'admin_manual') cat = 'Sanksi Manual Administrator';
                    else cat = 'Proteksi Otomatis Firewall';
                }

                return {
                    ip: clean,
                    isIpv6: clean.includes(':'),
                    banType: item.banType || 'permanent',
                    banReason: item.banReason || 'Pelanggaran keamanan terdeteksi oleh sistem.',
                    banExpiresAt: item.banExpiresAt || null,
                    banDurationDays: item.banDurationDays || 0,
                    source: src,
                    category: cat,
                    path: item.path || (item.details && item.details.path) || item.lastBlockedPath || '',
                    userAgent: item.userAgent || (item.details && item.details.ua) || '',
                    deviceLabel: item.deviceLabel || parseDeviceLabel(item.userAgent || (item.details && item.details.ua) || ''),
                    username: item.username || (item.details && item.details.username) || (primaryUser ? primaryUser.username : ''),
                    userId: item.userId || (item.details && item.details.userId) || (primaryUser ? primaryUser.id : ''),
                    email: item.email || (primaryUser ? primaryUser.email : ''),
                    matchedUsers: matchedUsers,
                    blockedAttempts: Number(item.blockedAttempts || 1),
                    lastAttemptAt: item.lastAttemptAt || item.createdAt || new Date().toISOString(),
                    createdAt: item.createdAt || new Date().toISOString()
                };
            }).sort((a, b) => new Date(b.lastAttemptAt || b.createdAt || 0).getTime() - new Date(a.lastAttemptAt || a.createdAt || 0).getTime());

            Object.entries(ipToUsers).forEach(([uIp, uList]) => {
                if (!ipActivityMap.has(uIp) && uList.length > 0) {
                    const u = uList[0];
                    const isBanned = Boolean(bannedMap[uIp]);
                    const isImm = isImmuneIp(uIp);
                    ipActivityMap.set(uIp, {
                        ip: uIp,
                        firstSeenAt: u.lastLoginAt || new Date().toISOString(),
                        lastSeenAt: u.lastLoginAt || new Date().toISOString(),
                        totalRequests: 1,
                        requestsPerMinute: 0,
                        userAgent: '',
                        deviceLabel: 'Sesi Terdaftar',
                        username: u.username,
                        userId: u.id,
                        email: u.email,
                        isVip: u.isVip,
                        isImmune: isImm,
                        lastActionLabel: 'Login / Sesi Akun Terdaftar',
                        lastPath: '/api/user-auth',
                        recentActions: [{ label: 'Login / Sesi Akun Terdaftar', path: '/api/user-auth', method: 'POST', time: u.lastLoginAt || new Date().toISOString() }],
                        violationCount: isBanned ? 1 : 0,
                        blockedAttempts: isBanned ? Number(bannedMap[uIp]?.blockedAttempts || 1) : 0,
                        status: isBanned ? 'banned' : (isImm ? 'admin' : 'normal'),
                        statusLabel: isBanned ? 'Terblokir / Blacklist' : (isImm ? 'Admin / Immune' : 'Menggunakan Website dengan Benar (Wajar)'),
                        behaviorSummary: isBanned ? (bannedMap[uIp]?.banReason || 'IP Diblokir') : 'Pengguna terdaftar menggunakan aplikasi secara normal.'
                    });
                }
            });

            const activitiesList = Array.from(ipActivityMap.values()).map(act => {
                const clean = normalizeIp(act.ip);
                const matchedUsers = ipToUsers[clean] || [];
                const primaryUser = matchedUsers[0] || null;
                const banRec = bannedMap[clean];
                const isImm = Boolean(act.isImmune || isImmuneIp(clean));

                const nowMs = Date.now();
                const recentTs = Array.isArray(act.recentTimestamps) ? act.recentTimestamps.filter(t => nowMs - t < 60000) : [];
                const rpm = recentTs.length;

                let status = act.status || 'normal';
                let statusLabel = act.statusLabel || 'Menggunakan Website dengan Benar (Wajar)';
                let behaviorSummary = act.behaviorSummary || 'Menggunakan fitur website secara wajar.';

                if (banRec && !isImm) {
                    status = 'banned';
                    statusLabel = (banRec.source === 'admin_manual') ? 'Diblokir Manual oleh Admin' : 'Terblokir Otomatis oleh Sistem';
                    behaviorSummary = banRec.banReason || 'Alamat IP diblokir karena pelanggaran keamanan.';
                } else if (isImm) {
                    status = 'admin';
                    statusLabel = 'Admin / Immune (Terlindungi)';
                    behaviorSummary = 'Perangkat Administrator Resmi • Bebas dari blokir otomatis.';
                } else if (Number(act.violationCount || 0) > 0 || rpm > 95) {
                    status = 'suspicious';
                    statusLabel = 'Aktivitas Mencurigakan / Perlu Dipantau';
                } else {
                    status = 'normal';
                    statusLabel = 'Menggunakan Website dengan Benar (Wajar)';
                }

                return {
                    ip: clean,
                    isIpv6: clean.includes(':'),
                    firstSeenAt: act.firstSeenAt || act.lastSeenAt || new Date().toISOString(),
                    lastSeenAt: act.lastSeenAt || new Date().toISOString(),
                    totalRequests: Number(act.totalRequests || 1),
                    requestsPerMinute: rpm,
                    deviceLabel: act.deviceLabel || parseDeviceLabel(act.userAgent || ''),
                    userAgent: act.userAgent || '',
                    username: act.username || (primaryUser ? primaryUser.username : ''),
                    userId: act.userId || (primaryUser ? primaryUser.id : ''),
                    email: act.email || (primaryUser ? primaryUser.email : ''),
                    isVip: Boolean(act.isVip || (primaryUser && primaryUser.isVip)),
                    matchedUsers: matchedUsers,
                    isImmune: isImm,
                    lastActionLabel: act.lastActionLabel || 'Membuka Website',
                    lastPath: act.lastPath || '/',
                    recentActions: Array.isArray(act.recentActions) ? act.recentActions.slice(0, 8) : [],
                    violationCount: Number(act.violationCount || 0),
                    blockedAttempts: banRec ? Number(banRec.blockedAttempts || 1) : Number(act.blockedAttempts || 0),
                    status: status,
                    statusLabel: statusLabel,
                    behaviorSummary: behaviorSummary
                };
            }).sort((a, b) => new Date(b.lastSeenAt || 0).getTime() - new Date(a.lastSeenAt || 0).getTime());

            const autoBannedCount = bannedIpsList.filter(x => x.source !== 'admin_manual').length;
            const manualBannedCount = bannedIpsList.filter(x => x.source === 'admin_manual').length;
            const normalUsersCount = activitiesList.filter(x => x.status === 'normal' || x.status === 'admin').length;
            const suspiciousCount = activitiesList.filter(x => x.status === 'suspicious').length;
            const totalBlockedAttempts = bannedIpsList.reduce((acc, item) => acc + Number(item.blockedAttempts || 1), 0);

            return res.json({
                status: true,
                adminClientIp: clientIp,
                summary: {
                    totalBannedIps: bannedIpsList.length,
                    autoBannedCount: autoBannedCount,
                    manualBannedCount: manualBannedCount,
                    totalMonitoredIps: activitiesList.length,
                    normalUsersCount: normalUsersCount,
                    suspiciousCount: suspiciousCount,
                    totalBlockedAttempts: totalBlockedAttempts,
                    totalSecurityEvents: securityEventsLog.length
                },
                bannedIps: bannedIpsList,
                activities: activitiesList,
                securityEvents: securityEventsLog.slice(0, 100)
            });
        }

        if (action === 'admin_unban_ip') {
            if (!verifyAdminRequest(req)) {
                return res.status(401).json({ status: false, message: 'Sesi Administrator tidak valid.' });
            }
            const targetIp = normalizeIp(req.body?.ip || req.query.ip || '');
            if (!targetIp) {
                return res.status(400).json({ status: false, message: 'Alamat IP wajib diisi.' });
            }

            const currentBanned = await readBannedIpsAsync();
            let removed = false;
            Object.keys(currentBanned).forEach(k => {
                if (normalizeIp(k) === targetIp) {
                    delete currentBanned[k];
                    removed = true;
                }
            });
            await writeBannedIpsAsync(currentBanned);

            const act = ipActivityMap.get(targetIp);
            if (act) {
                act.status = 'normal';
                act.statusLabel = 'Menggunakan Website dengan Benar (Wajar)';
                act.behaviorSummary = 'Blokir IP telah dibuka oleh Administrator.';
                act.violationCount = 0;
                persistActivityMonitorThrottled(true);
            }

            recordSecurityEvent({
                ip: targetIp,
                type: 'unban',
                source: 'admin_manual',
                category: 'Pemulihan Akses IP (Unban)',
                reason: `Administrator membuka blokir alamat IP ${targetIp}.`
            });

            return res.json({
                status: true,
                removed: removed,
                message: `Blokir untuk alamat IP ${targetIp} berhasil dibuka! Pengguna dapat mengakses website kembali.`
            });
        }

        if (action === 'admin_ban_ip') {
            if (!verifyAdminRequest(req)) {
                return res.status(401).json({ status: false, message: 'Sesi Administrator tidak valid.' });
            }
            const targetIp = normalizeIp(req.body?.ip || '');
            const reason = String(req.body?.reason || 'Diblokir oleh Administrator karena penggunaan website tidak wajar / melanggar aturan.').trim();
            const banType = String(req.body?.banType || 'permanent').toLowerCase();
            const durationDays = Number(req.body?.durationDays || 0);

            if (!targetIp) {
                return res.status(400).json({ status: false, message: 'Alamat IP target wajib diisi.' });
            }
            if (isImmuneIp(targetIp)) {
                return res.status(400).json({ status: false, message: 'Alamat IP ini adalah IP Administrator (Immune) dan tidak dapat diblokir.' });
            }

            let expiresAt = null;
            if (banType === 'temporary' && durationDays > 0) {
                const exp = new Date();
                exp.setDate(exp.getDate() + durationDays);
                expiresAt = exp.toISOString();
            }

            const existingAct = ipActivityMap.get(targetIp);
            const result = await banIp(targetIp, reason, {
                source: 'admin_manual',
                category: 'Blokir Manual Administrator',
                banType: banType,
                banExpiresAt: expiresAt,
                banDurationDays: durationDays,
                ua: existingAct ? existingAct.userAgent : '',
                path: existingAct ? existingAct.lastPath : '',
                username: existingAct ? existingAct.username : '',
                userId: existingAct ? existingAct.userId : ''
            });

            return res.json({
                status: true,
                message: `Alamat IP ${targetIp} berhasil diblokir!`,
                ban: result
            });
        }

        if (action === 'admin_clear_events') {
            if (!verifyAdminRequest(req)) {
                return res.status(401).json({ status: false, message: 'Sesi Administrator tidak valid.' });
            }
            securityEventsLog = [];
            await storage.writeDataAsync(SECURITY_EVENTS_FILE, []);
            return res.json({ status: true, message: 'Riwayat log kejadian keamanan berhasil dibersihkan.' });
        }

        if (action === 'admin_reset_activity') {
            if (!verifyAdminRequest(req)) {
                return res.status(401).json({ status: false, message: 'Sesi Administrator tidak valid.' });
            }
            ipActivityMap.clear();
            await storage.writeDataAsync(IP_ACTIVITY_FILE, {});
            return res.json({ status: true, message: 'Data pemantauan aktivitas pengunjung berhasil direset.' });
        }

        return res.status(400).json({ status: false, message: 'Action tidak dikenal' });
    }

    const exportedSecurity = Object.assign(securityHandler, {
        normalizeIp,
        isImmuneIp,
        addImmuneIp,
        readBannedIpsSync,
        readBannedIpsAsync,
        writeBannedIpsAsync,
        getIpBanStatus,
        banIp,
        recordBlockedAttempt,
        recordRequestActivity,
        recordSecurityEvent,
        generateVipSignature,
        verifyVipSignature,
        isBotOrScraper,
        serveCorruptedDummyFile,
        getIpBannedHtmlPage,
        securityHandler
    });

    module.exports = exportedSecurity;
})();
