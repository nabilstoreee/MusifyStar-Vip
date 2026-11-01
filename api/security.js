/**
 * MusifyStar Client-Side Anti-Tamper & Security Watchdog v3.0
 * Melindungi integritas akun dari manipulasi DevTools / Console / LocalStorage pada PC & Browser.
 * Status VIP & fitur eksklusif sepenuhnya divalidasi oleh otoritas server dan tanda tangan kriptografis HMAC-SHA256.
 */
(function() {
    'use strict';

    // State rahasia di dalam Private Closure (tidak dapat dimodifikasi lewat DevTools Console)
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

    var Security = {
        // Laporkan tindakan tampering ke server & kunci layar hanya jika terverifikasi oleh server
        reportTamper: function(reason, detail) {
            if (_isTriggered) return;

            var targetUser = null;
            try {
                targetUser = JSON.parse(localStorage.getItem('musifystar_auth_user') || 'null');
            } catch(e) {}

            // Admin pemilik yang sah kebal terhadap report tamper
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
                    if (typeof MusicPlayer.pause === 'function') MusicPlayer.pause();
                    if (MusicPlayer.sound && typeof MusicPlayer.sound.pause === 'function') MusicPlayer.sound.pause();
                } catch(e) {}
            }

            Security.showLockdownScreen(reason);
        },

        // Tampilan Layar Kunci Blokir Permanen
        showLockdownScreen: function(reason) {
            document.documentElement.innerHTML = `
            <!DOCTYPE html>
            <html lang="id">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AKSES DITOLAK - IP DIBLOKIR</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                    body { background: #06070a; color: #fff; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                    .card { max-width: 520px; width: 100%; background: #0e111a; border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 24px; padding: 32px 24px; text-align: center; box-shadow: 0 0 50px rgba(239, 68, 68, 0.25); }
                    .icon { width: 72px; height: 72px; background: rgba(239, 68, 68, 0.15); border: 2px solid rgba(239, 68, 68, 0.4); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #ef4444; font-size: 32px; }
                    h1 { font-size: 20px; font-weight: 900; color: #ef4444; letter-spacing: 0.5px; margin-bottom: 8px; text-transform: uppercase; }
                    p.desc { font-size: 13px; color: rgba(255, 255, 255, 0.7); line-height: 1.6; margin-bottom: 24px; }
                    .info-box { background: rgba(0, 0, 0, 0.6); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; padding: 16px; text-align: left; margin-bottom: 24px; font-size: 12px; }
                    .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
                    .info-row:last-child { margin-bottom: 0; }
                    .info-label { color: rgba(255, 255, 255, 0.4); }
                    .info-val { color: #f87171; font-family: monospace; font-weight: bold; }
                    .badge { display: inline-block; background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 6px 14px; border-radius: 999px; font-size: 11px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">🚫</div>
                    <h1>AKSES DITOLAK: IP DIBLOKIR</h1>
                    <p class="desc">Sistem mendeteksi percobaan pengubahan status akun VIP secara ilegal melalui DevTools / Console / Storage. Alamat IP dan perangkat Anda telah diblokir secara permanen dari server MusifyStar.</p>
                    <div class="info-box">
                        <div class="info-row">
                            <span class="info-label">Status Akses:</span>
                            <span class="info-val">DIBLOKIR TOTAL (PERMANEN)</span>
                        </div>
                        <div class="info-row">
                            <span class="info-label">Pelanggaran:</span>
                            <span class="info-val">${reason || 'Manipulasi Akun VIP Ilegal'}</span>
                        </div>
                    </div>
                    <div class="badge">Proteksi Keamanan Anti-DevTools MusifyStar Aktif</div>
                </div>
            </body>
            </html>
            `;
            throw new Error('Security Lockdown Activated');
        },

        // Sinkronisasi status VIP sah yang terverifikasi langsung dari respons API Server
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

        // Validasi apakah objek user memiliki status VIP sah yang terverifikasi oleh server
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
            // Sebelum sinkronisasi pertama selesai, wajib memiliki vipSignature 64-hex dari server
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

        // Periksa integritas memori (Auth.currentUser) & localStorage secara berkala (1.5 detik)
        verifyIntegrity: function() {
            if (_isTriggered) return;

            try {
                // Jika sudah tersinkronisasi dengan server dan server menyatakan BUKAN VIP,
                // sapu bersih segala upaya pengubahan isPremium / vipTier / email admin lewat DevTools Console atau LocalStorage!
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

        // Inisialisasi pengawasan berkala & interceptor
        init: function() {
            window.addEventListener('storage', function(e) {
                if (e.key === 'musifystar_auth_user' || e.key === 'musifystar_app_settings' || e.key === 'musifystar_theme_backup') {
                    Security.verifyIntegrity();
                }
            });

            if (!_watchdogTimer) {
                _watchdogTimer = setInterval(function() {
                    Security.verifyIntegrity();
                }, 1500);
            }
        }
    };

    try {
        Object.freeze(Security);
    } catch (e) {}

    window.Security = Security;
    Security.init();
})();
