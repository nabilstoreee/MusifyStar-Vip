// MusifyStar - Global Stats & Leaderboard Module
// Menampilkan Papan Peringkat Pendengar Teratas, Pamer Border Profil, & Lagu Terpopuler Global

(function() {
    'use strict';

    var GlobalStats = {
        activeTab: 'leaderboard', // 'leaderboard' | 'songs' | 'community'
        timeframe: 'all',         // 'all' | '30d' | '7d'
        rankRange: 'all',         // 'all' | '6-25' | '26-50' | '51-75' | '76-100'
        cachedData: {},
        loading: false,
        pollTimer: null,

        setRankRange(rangeId) {
            this.rankRange = rangeId || 'all';
            this.renderCurrentTab();
        },

        escapeJs(str) {
            if (!str) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        },

        openUserCard(userId, username, avatar, borderUrl, borderName, isAdmin, isVip) {
            if (typeof GlobalChat !== 'undefined' && typeof GlobalChat.showUserProfileModal === 'function') {
                GlobalChat.showUserProfileModal(userId, username, avatar, borderUrl, borderName, !!isAdmin, !!isVip, 'permanent', 0);
            }
        },

        getVerifiedIconHTML(info, sizePx) {
            if (!info) return '';
            var uname = (info.username || '').toLowerCase().trim();
            var isVer = Boolean(info.isVerified || info.isMasterAdmin || uname === 'musifystar' || uname === 'nabil');
            if (!isVer) return '';
            var sz = sizePx || 13;
            return `<span class="inline-flex items-center justify-center shrink-0 select-none self-center" title="Akun Terverifikasi Resmi (Centang Biru)" style="margin-left: 2.5px; transform: translateY(-0.5px); line-height: 1;"><svg style="width: ${sz}px; height: ${sz}px;" class="shrink-0 block drop-shadow-[0_0_5px_rgba(0,149,246,0.5)]" viewBox="2 2 20 20" fill="none"><circle cx="12" cy="12" r="10" fill="#0095F6"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.707 8.293a1 1 0 0 1 0 1.414l-6 6a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L10 13.586l5.293-5.293a1 1 0 0 1 1.414 0z" fill="#FFFFFF"/></svg></span>`;
        },

        getUserDisplayInfo(item, myUser) {
            if (!item) return { username: '', avatar: '', borderUrl: '', borderName: '', isVip: false, isVerified: false, isMasterAdmin: false, equippedBadge: '', equippedBadgeTitle: '', equippedBadgeIcon: '', equippedBadgeColor: '', isMe: false };
            myUser = myUser || ((typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser : null);
            var isMe = false;
            var myUname = '';
            var myEmail = '';
            var myId = '';
            var isMasterAdminUser = false;
            if (myUser) {
                myUname = (myUser.username || '').toLowerCase().trim();
                myEmail = (myUser.email || myUser.rawEmail || '').toLowerCase().trim();
                myId = String(myUser.id || '').trim();
                var itemUname = (item.username || '').toLowerCase().trim();
                var itemId = String(item.id || '').trim();
                isMasterAdminUser = (myEmail === 'jrnabil570@gmail.com' || myUname === 'musifystar');
                if ((itemId && myId && itemId === myId) || (itemUname && myUname && itemUname === myUname) || (item.isMasterAdmin && isMasterAdminUser)) {
                    isMe = true;
                }
            }

            if (isMe && myUser) {
                var isVipExpired = myUser.vipExpiresAt && Date.now() > myUser.vipExpiresAt;
                var isMasterAdmin = Boolean(isMasterAdminUser || myUser.isMasterAdmin || item.isMasterAdmin);
                var isUserVip = isMasterAdmin || (Boolean(myUser.isPremium || myUser.is_premium || (myUser.vipTier && myUser.vipTier !== 'none')) && !isVipExpired);
                var isUserVerified = Boolean(isMasterAdmin || myUser.isVerified || item.isVerified || myUname === 'musifystar');

                var url = (typeof Auth !== 'undefined' && typeof Auth.getBorderUrl === 'function')
                    ? Auth.getBorderUrl(myUser)
                    : (myUser.borderUrl || '');
                var name = (typeof Auth !== 'undefined' && typeof Auth.getBorderName === 'function')
                    ? Auth.getBorderName(myUser)
                    : (myUser.borderName || '');

                return {
                    username: myUser.username || item.username || '',
                    avatar: myUser.avatar || item.avatar || '/logo.png',
                    borderUrl: url || '',
                    borderName: name || '',
                    isVip: isUserVip,
                    isVerified: isUserVerified,
                    isMasterAdmin: isMasterAdmin,
                    equippedBadge: myUser.equippedBadge || item.equippedBadge || '',
                    equippedBadgeTitle: myUser.equippedBadgeTitle || item.equippedBadgeTitle || '',
                    equippedBadgeIcon: myUser.equippedBadgeIcon || item.equippedBadgeIcon || '',
                    equippedBadgeColor: myUser.equippedBadgeColor || item.equippedBadgeColor || '',
                    nameGlow: myUser.nameGlow || item.nameGlow || '',
                    donatur: myUser.donatur || item.donatur || null,
                    isMe: true
                };
            }

            var itemUnameClean = (item.username || '').toLowerCase().trim();
            var itemMaster = Boolean(item.isMasterAdmin || itemUnameClean === 'musifystar' || itemUnameClean === 'nabil');
            var itemVip = Boolean(itemMaster || item.isVip || item.is_vip || (item.vipTier && item.vipTier !== 'none'));
            var itemVerified = Boolean(itemMaster || item.isVerified || itemUnameClean === 'musifystar');

            return {
                username: item.username || '',
                avatar: item.avatar || '/logo.png',
                borderUrl: item.borderUrl || '',
                borderName: item.borderName || '',
                isVip: itemVip,
                isVerified: itemVerified,
                isMasterAdmin: itemMaster,
                equippedBadge: item.equippedBadge || '',
                equippedBadgeTitle: item.equippedBadgeTitle || '',
                equippedBadgeIcon: item.equippedBadgeIcon || '',
                equippedBadgeColor: item.equippedBadgeColor || '',
                nameGlow: item.nameGlow || '',
                donatur: item.donatur || null,
                isMe: false
            };
        },

        // Resolve border for any leaderboard user in real-time
        getUserDisplayBorder(item, myUser) {
            var info = this.getUserDisplayInfo(item, myUser);
            return { borderUrl: info.borderUrl, borderName: info.borderName, isMe: info.isMe };
        },

        // Real-time handler called when user profile (name, avatar, badges) changes
        onUserProfileUpdated(user) {
            if (!user) return;
            var myUname = (user.username || '').toLowerCase().trim();
            var myId = String(user.id || '').trim();

            if (this.cachedData && typeof this.cachedData === 'object') {
                var self = this;
                Object.keys(this.cachedData).forEach(function(tf) {
                    var cached = self.cachedData[tf];
                    if (cached && Array.isArray(cached.leaderboard)) {
                        cached.leaderboard.forEach(function(it) {
                            var match = (it.id && myId && String(it.id).trim() === myId) ||
                                        (it.username && (it.username || '').toLowerCase().trim() === myUname);
                            if (match) {
                                it.username = user.username;
                                it.avatar = user.avatar;
                                it.borderUrl = user.borderUrl || '';
                                it.borderName = user.borderName || '';
                                it.isVip = user.isVip;
                                it.isVerified = Boolean(user.isVerified || user.isMasterAdmin || myUname === 'musifystar');
                                it.equippedBadge = user.equippedBadge || '';
                                it.equippedBadgeTitle = user.equippedBadgeTitle || '';
                                it.equippedBadgeIcon = user.equippedBadgeIcon || '';
                                it.equippedBadgeColor = user.equippedBadgeColor || '';
                                it.nameGlow = user.nameGlow || '';
                            }
                        });
                    }
                });
            }

            if (document.getElementById('global-stats-modal')) {
                this.renderCurrentTab();
            }
        },

        // Real-time handler called when user equips or changes border
        onUserBorderChanged(newBorderUrl, newBorderName) {
            var myUser = (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser : null;
            if (!myUser) return;
            this.onUserProfileUpdated(myUser);
        },

        buildLeaderboardSig(lb) {
            if (!Array.isArray(lb)) return '';
            return lb.map(function(x) {
                return [
                    x.id,
                    x.rank,
                    x.username,
                    x.avatar,
                    x.borderUrl,
                    x.borderName,
                    x.formattedDuration,
                    x.totalPlays,
                    x.equippedBadge,
                    x.nameGlow || '',
                    x.isOnline ? 1 : 0
                ].join(':');
            }).join('|');
        },

        startLivePolling() {
            this.stopLivePolling();
            var self = this;
            this.pollTimer = setInterval(function() {
                var modal = document.getElementById('global-stats-modal');
                if (!modal) {
                    self.stopLivePolling();
                    return;
                }
                // Background silent poll without disrupting scroll or user interaction
                self.fetchData(self.timeframe, true, true).then(function(newData) {
                    if (document.getElementById('global-stats-modal') && newData) {
                        var liveBadge = document.getElementById('gs-live-badge-text');
                        if (liveBadge && newData.liveActiveCount !== undefined) {
                            liveBadge.textContent = newData.liveActiveCount > 0 ? (newData.liveActiveCount + ' Online') : 'Live';
                        }
                        var sig = self.buildLeaderboardSig(newData.leaderboard);
                        if (self.lastLeaderboardSig !== sig) {
                            self.lastLeaderboardSig = sig;
                            self.renderCurrentTab();
                        }
                    }
                });
            }, 12000);
        },

        stopLivePolling() {
            if (this.pollTimer) {
                clearInterval(this.pollTimer);
                this.pollTimer = null;
            }
        },

        async fetchData(timeframe, force, isSilent) {
            timeframe = timeframe || this.timeframe || 'all';
            if (!force && this.cachedData[timeframe]) {
                return this.cachedData[timeframe];
            }

            this.loading = true;
            if (!isSilent) this.updateLoadingState(true);

            try {
                var res = await fetch('/api/global-stats?timeframe=' + encodeURIComponent(timeframe) + '&t=' + Date.now());
                var data = await res.json();
                if (data && data.status) {
                    this.cachedData[timeframe] = data;
                    this.loading = false;
                    if (!isSilent) this.updateLoadingState(false);
                    return data;
                }
            } catch(e) {
                console.error('[GlobalStats] Fetch error:', e);
            }

            this.loading = false;
            if (!isSilent) this.updateLoadingState(false);
            return this.cachedData[timeframe] || null;
        },

        updateLoadingState(isLoading) {
            var refreshBtn = document.getElementById('gs-refresh-btn');
            if (refreshBtn) {
                if (isLoading) refreshBtn.classList.add('animate-spin');
                else refreshBtn.classList.remove('animate-spin');
            }
        },

        openModal(initialTab) {
            if (initialTab) this.activeTab = initialTab;

            var existing = document.getElementById('global-stats-modal');
            if (existing) existing.remove();

            var modal = document.createElement('div');
            modal.id = 'global-stats-modal';
            modal.className = 'fixed inset-0 z-[700] bg-[#07090e] flex flex-col select-none overflow-hidden h-[100dvh] max-h-[100dvh] animate-fade-in';

            modal.innerHTML = `
                <!-- Full Page Sticky Header (Compact Championship Gradient) -->
                <div class="pt-3.5 pb-2.5 px-3.5 shrink-0 border-b border-white/10 shadow-xl transition-all flex items-center justify-between" style="background: linear-gradient(180deg, rgba(18, 22, 34, 0.96) 0%, rgba(9, 12, 18, 0.98) 100%); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px);">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <button type="button" onclick="GlobalStats.closeModal()" class="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white flex items-center justify-center active:scale-95 transition-all cursor-pointer shrink-0 shadow-sm" title="Kembali">
                            <i data-lucide="arrow-left" class="w-4 h-4"></i>
                        </button>
                        <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-400 via-yellow-400 to-amber-500 flex items-center justify-center text-black shadow-md shadow-amber-500/30 shrink-0">
                            <i data-lucide="trophy" class="w-4 h-4 fill-black stroke-black"></i>
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <h1 class="text-sm sm:text-base font-black text-white tracking-tight leading-tight truncate">Global Stats & Leaderboard</h1>
                                <span id="gs-live-indicator" class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-500/20 border border-emerald-500/35 text-[9px] font-mono font-bold text-emerald-400">
                                    <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span id="gs-live-badge-text">Live</span>
                                </span>
                            </div>
                            <p class="text-white/50 text-[10.5px] leading-tight truncate">Papan peringkat pendengar & pamer border profil</p>
                        </div>
                    </div>

                    <div class="flex items-center shrink-0">
                        <button id="gs-refresh-btn" onclick="GlobalStats.refreshData()" class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white/80 hover:text-white flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm" title="Segarkan Data">
                            <i data-lucide="rotate-cw" class="w-4.5 h-4.5"></i>
                        </button>
                    </div>
                </div>

                <!-- Main Navigation Tabs (Compact Segmented Glass Pills) -->
                <div class="px-3 py-1.5 border-b border-white/10 bg-[#0c0f18]/90 backdrop-blur-xl flex items-center justify-center shrink-0">
                    <div class="max-w-xl w-full flex items-center gap-1 p-0.5 rounded-xl bg-black/60 border border-white/10 shadow-inner">
                        <button onclick="GlobalStats.switchTab('leaderboard')" id="gs-tab-leaderboard" class="flex-1 py-1.5 px-2 rounded-lg font-black text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${this.activeTab === 'leaderboard' ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black shadow-amber-500/25' : 'text-white/60 hover:text-white hover:bg-white/5'}">
                            <i data-lucide="award" class="w-3 h-3"></i>
                            <span>Papan Peringkat</span>
                        </button>
                        <button onclick="GlobalStats.switchTab('songs')" id="gs-tab-songs" class="flex-1 py-1.5 px-2 rounded-lg font-black text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm ${this.activeTab === 'songs' ? 'bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white shadow-rose-500/25' : 'text-white/60 hover:text-white hover:bg-white/5'}">
                            <i data-lucide="flame" class="w-3 h-3"></i>
                            <span>Top 20 Lagu Terpopuler</span>
                        </button>
                    </div>
                </div>

                <!-- Full Page Scrollable Body -->
                <div id="gs-scroll-container" class="flex-1 overflow-y-auto overscroll-contain hide-scrollbar p-3 sm:p-4 max-w-xl mx-auto w-full pb-28">
                    <div id="global-stats-content" class="space-y-3">
                        <div class="py-12 flex flex-col items-center justify-center gap-3 text-white/60">
                            <i data-lucide="loader-2" class="w-6 h-6 text-amber-400 animate-spin"></i>
                            <span class="text-xs font-medium">Memuat statistik global & peringkat...</span>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            if (typeof DynamicIsland !== 'undefined' && typeof DynamicIsland.updateState === 'function') {
                DynamicIsland.updateState();
            }
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                try { window.lucide.createIcons(); } catch(e){}
            }

            this.cachedData = {};
            this.loadAndRender(true);
            this.startLivePolling();
        },

        closeModal() {
            this.stopLivePolling();
            var modal = document.getElementById('global-stats-modal');
            if (modal) modal.remove();
        },

        switchTab(tab) {
            this.activeTab = (tab === 'songs') ? 'songs' : 'leaderboard';
            var tabs = ['leaderboard', 'songs'];
            var self = this;
            tabs.forEach(function(t) {
                var btn = document.getElementById('gs-tab-' + t);
                if (!btn) return;
                if (t === self.activeTab) {
                    if (t === 'leaderboard') {
                        btn.className = 'flex-1 py-1.5 px-2 rounded-lg font-black text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black shadow-amber-500/25 active:scale-95';
                    } else if (t === 'songs') {
                        btn.className = 'flex-1 py-1.5 px-2 rounded-lg font-black text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm bg-gradient-to-r from-rose-500 via-pink-500 to-rose-600 text-white shadow-rose-500/25 active:scale-95';
                    }
                } else {
                    btn.className = 'flex-1 py-1.5 px-2 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer text-white/60 hover:text-white hover:bg-white/5 active:scale-95';
                }
            });
            this.renderCurrentTab();
        },

        setTimeframe(tf) {
            this.timeframe = tf;
            this.loadAndRender(true);
        },

        async refreshData() {
            await this.fetchData(this.timeframe, true);
            this.renderCurrentTab();
        },

        async loadAndRender(force) {
            var data = await this.fetchData(this.timeframe, force);
            if (!data) {
                var container = document.getElementById('global-stats-content');
                if (container) {
                    container.innerHTML = `
                        <div class="text-center py-12 text-rose-400 space-y-2">
                            <i data-lucide="alert-circle" class="w-8 h-8 mx-auto"></i>
                            <p class="text-xs font-semibold">Gagal memuat data statistik global. Coba lagi beberapa saat.</p>
                            <button onclick="GlobalStats.refreshData()" class="mt-2 px-4 py-1.5 rounded-xl bg-white/10 text-white text-xs hover:bg-white/20 cursor-pointer">Coba Ulang</button>
                        </div>
                    `;
                    if (window.lucide && typeof window.lucide.createIcons === 'function') {
                        try { window.lucide.createIcons(); } catch(e){}
                    }
                }
                return;
            }

            // Update live listeners counter
            var liveBadge = document.getElementById('gs-live-badge-text');
            if (liveBadge && data.liveActiveCount !== undefined) {
                liveBadge.textContent = data.liveActiveCount > 0 ? (data.liveActiveCount + ' Online') : 'Live';
            }

            this.lastLeaderboardSig = this.buildLeaderboardSig(data.leaderboard);
            this.renderCurrentTab();
        },

        renderCurrentTab() {
            var container = document.getElementById('global-stats-content');
            if (!container) return;

            var data = this.cachedData[this.timeframe];
            if (!data) return;

            var scrollEl = document.getElementById('gs-scroll-container');
            var savedScroll = scrollEl ? scrollEl.scrollTop : 0;

            if (this.activeTab === 'songs') {
                container.innerHTML = this.getTopSongsHTML(data);
            } else {
                container.innerHTML = this.getLeaderboardHTML(data);
            }

            if (scrollEl) {
                scrollEl.scrollTop = savedScroll;
            }

            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                try { window.lucide.createIcons(); } catch(e){}
            }
        },

        // 1. LEADERBOARD HTML RENDERER
        getLeaderboardHTML(data) {
            var lb = data.leaderboard || [];
            var top3 = lb.slice(0, 3);
            var rest = lb.slice(3);

            var tf = this.timeframe;
            var tfButtons = `
                <div class="flex items-center justify-between gap-1 p-0.5 rounded-xl bg-black/60 border border-white/10 backdrop-blur-xl text-[10px] sm:text-[10.5px] font-semibold shadow-inner">
                    <button onclick="GlobalStats.setTimeframe('all')" class="flex-1 py-1 px-2 rounded-lg transition-all cursor-pointer active:scale-95 ${tf === 'all' ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-extrabold shadow-sm shadow-amber-500/20' : 'text-white/60 hover:text-white hover:bg-white/5'}">
                        Sepanjang Waktu
                    </button>
                    <button onclick="GlobalStats.setTimeframe('30d')" class="flex-1 py-1 px-2 rounded-lg transition-all cursor-pointer active:scale-95 ${tf === '30d' ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-extrabold shadow-sm shadow-amber-500/20' : 'text-white/60 hover:text-white hover:bg-white/5'}">
                        30 Hari Terakhir
                    </button>
                    <button onclick="GlobalStats.setTimeframe('7d')" class="flex-1 py-1 px-2 rounded-lg transition-all cursor-pointer active:scale-95 ${tf === '7d' ? 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-extrabold shadow-sm shadow-amber-500/20' : 'text-white/60 hover:text-white hover:bg-white/5'}">
                        7 Hari Terakhir
                    </button>
                </div>
            `;

            // Identify current logged in user's position
            var myUser = (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser : null;
            var myRankItem = null;
            if (myUser && myUser.username) {
                var myUname = (myUser.username || '').toLowerCase().trim();
                var myEmail = (myUser.email || myUser.rawEmail || '').toLowerCase().trim();
                var myId = String(myUser.id || '').trim();
                var isMasterAdminUser = (myEmail === 'jrnabil570@gmail.com');
                myRankItem = lb.find(function(item) {
                    var itemUname = (item.username || '').toLowerCase().trim();
                    var itemId = String(item.id || '').trim();
                    return (itemId && myId && itemId === myId) || 
                           (itemUname === myUname) ||
                           (item.isMasterAdmin && isMasterAdminUser);
                });
            }

            var myRankCard = '';
            if (myUser) {
                var myRankNum = myRankItem ? ('#' + myRankItem.rank) : '#-';
                var myDuration = myRankItem ? myRankItem.formattedDuration : '0 Menit';
                var myPlays = myRankItem ? myRankItem.totalPlays : 0;
                var myInfo = this.getUserDisplayInfo(myRankItem || myUser, myUser);

                myRankCard = `
                    <div class="relative overflow-hidden p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-sky-500/10 via-purple-500/10 to-amber-500/10 border border-white/15 backdrop-blur-2xl shadow-md">
                        <!-- Ambient aura behind personal rank -->
                        <div class="absolute -top-10 -right-10 w-28 h-28 rounded-full bg-gradient-to-br from-sky-400/20 via-indigo-500/15 to-transparent blur-2xl pointer-events-none"></div>

                        <div class="flex items-center justify-between gap-3 relative z-10">
                            <div class="flex items-center gap-3 min-w-0 flex-1">
                                <!-- Avatar with Border Frame (36px avatar + 48px border) -->
                                <div class="relative flex items-center justify-center shrink-0" style="width: 48px; height: 48px;">
                                    <div class="rounded-full overflow-hidden bg-black/90 ${myInfo.borderUrl ? '' : 'ring-1 ring-white/20'} shadow-sm flex items-center justify-center" style="width: 36px; height: 36px;">
                                        <img src="${myInfo.avatar}" class="w-full h-full object-cover rounded-full" onerror="this.src='/logo.png'" />
                                    </div>
                                    ${myInfo.borderUrl ? `
                                    <img src="${myInfo.borderUrl}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_8px_rgba(245,158,11,0.5)]" style="width: 48px; height: 48px; ${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(myInfo.borderUrl) : ''}" onerror="this.style.display='none';" />
                                    ` : ''}
                                </div>

                                <div class="min-w-0 flex-1 flex flex-col justify-center space-y-1">
                                    <!-- Row 1: Rank Pill & Border Badge -->
                                    <div class="flex items-center gap-1.5 flex-wrap leading-none">
                                        <span class="text-[9px] font-mono text-sky-400 uppercase tracking-wider font-extrabold flex items-center gap-1" style="font-size: 9px;">
                                            <i data-lucide="award" class="w-2.5 h-2.5 text-sky-400"></i> PERINGKAT KAMU
                                        </span>
                                        <span class="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/40 px-1.5 py-0.5 rounded-full font-mono font-black" style="font-size: 9px;">${myRankNum}</span>
                                        ${myInfo.borderName ? `<span class="text-[9px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1" style="font-size: 8.5px;"><i data-lucide="shield" class="w-2.5 h-2.5 text-amber-400"></i> ${myInfo.borderName}</span>` : ''}
                                    </div>

                                    <!-- Row 2: Username + Verified Blue Checkmark & VIP Badge -->
                                    <div class="flex items-center gap-1.5 flex-wrap leading-tight">
                                        <span class="inline-flex items-center max-w-full">
                                            <h4 class="text-white font-black text-xs sm:text-sm truncate leading-none">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && myInfo.nameGlow) ? Auth.renderUsernameWithGlow('@' + myInfo.username, myInfo.nameGlow) : ('@' + myInfo.username)}</h4>
                                            ${this.getVerifiedIconHTML(myInfo, 13)}
                                        </span>
                                        ${myInfo.isVip ? (typeof Auth !== 'undefined' && Auth.getVipBadgeHTML ? Auth.getVipBadgeHTML('text-[7.5px]') : '') : ''}
                                    </div>

                                    <!-- Row 2b: Rank Badge (Diamond) side-by-side with Mega Supporter below -->
                                    ${((myInfo.donatur && myInfo.donatur.activeBadge) || myInfo.equippedBadgeTitle || myInfo.equippedBadge) ? `
                                    <div class="flex items-center gap-1.5 flex-wrap leading-none pt-0.5">
                                        ${myInfo.equippedBadgeTitle || myInfo.equippedBadge ? (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML ? Auth.getRankBadgePillHTML(myInfo.equippedBadge, myInfo.equippedBadgeTitle, myInfo.equippedBadgeIcon, myInfo.equippedBadgeColor, 'text-[7.5px]') : '') : ''}
                                        ${myInfo.donatur && typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML ? Auth.getDonaturBadgeHTML(myInfo.donatur, 'text-[7.5px]') : ''}
                                    </div>
                                    ` : ''}

                                    <!-- Row 3: Duration & Played Songs -->
                                    <div class="flex items-center gap-2 text-[10px] text-white/70 font-medium leading-none pt-0.5" style="font-size: 10px;">
                                        <span class="flex items-center gap-1 text-amber-300 font-mono font-bold">
                                            <i data-lucide="clock" class="w-2.5 h-2.5 text-amber-400"></i> ${myDuration}
                                        </span>
                                        <span class="text-white/30">&bull;</span>
                                        <span class="text-white/60">${myPlays} lagu diputar</span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex flex-col gap-1.5 shrink-0">
                                <button onclick="if(typeof Auth !== 'undefined' && Auth.openBorderPickerModal) Auth.openBorderPickerModal();" class="text-[10px] px-2.5 py-1 rounded-lg bg-amber-400/15 hover:bg-amber-400/25 text-amber-300 font-bold border border-amber-400/30 shrink-0 cursor-pointer active:scale-95 transition-all text-center flex items-center justify-center gap-1 shadow-sm" style="font-size: 10px;">
                                    <i data-lucide="shield" class="w-2.5 h-2.5"></i> Border
                                </button>
                                <button onclick="if(typeof Auth !== 'undefined') Auth.openUserProfileModal();" class="text-[10px] px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white font-bold border border-white/20 shrink-0 cursor-pointer active:scale-95 transition-all text-center shadow-sm" style="font-size: 10px;">
                                    Profil
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                myRankCard = `
                    <div class="p-3 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-transparent border border-white/10 backdrop-blur-xl flex items-center justify-between gap-3 text-xs shadow-sm">
                        <div class="flex items-center gap-2.5 min-w-0">
                            <div class="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0 shadow-sm">
                                <i data-lucide="sparkles" class="w-4 h-4"></i>
                            </div>
                            <div class="min-w-0 space-y-0.5">
                                <p class="text-white font-black text-xs">Pamerkan Durasi & Border Profilmu</p>
                                <p class="text-[10px] text-white/50 leading-relaxed" style="font-size: 10px;">Masuk ke akun untuk mencatat durasi musik & border di leaderboard!</p>
                            </div>
                        </div>
                        <button onclick="GlobalStats.closeModal(); if(typeof Auth !== 'undefined') Auth.toggleTopDropdown();" class="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-400 to-yellow-400 text-black font-extrabold text-[11px] shrink-0 cursor-pointer active:scale-95 transition-all shadow-sm">
                            Masuk
                        </button>
                    </div>
                `;
            }

            // =========================================================================
            // BAGIAN ATAS GARIS: JUARA 1, 2, 3 (PODIUM UTAMA) + JUARA 4 & 5 (ELITE TOP 5)
            // =========================================================================
            var first = lb[0] || null;
            var second = lb[1] || null;
            var third = lb[2] || null;
            var fourth = lb[3] || null;
            var fifth = lb[4] || null;

            var u1 = first ? this.getUserDisplayInfo(first, myUser) : null;
            var u2 = second ? this.getUserDisplayInfo(second, myUser) : null;
            var u3 = third ? this.getUserDisplayInfo(third, myUser) : null;
            var u4 = fourth ? this.getUserDisplayInfo(fourth, myUser) : null;
            var u5 = fifth ? this.getUserDisplayInfo(fifth, myUser) : null;

            var self = this;

            // Helper for Top 4 & Top 5 Elite Cards (Still ABOVE the horizontal divider line)
            var renderTop4And5Card = function(rankNum, itemObj, uInfo) {
                var badgeColor = rankNum === 4
                    ? 'from-sky-400 to-indigo-500 text-black border-sky-200 ring-sky-400/50'
                    : 'from-purple-400 to-pink-500 text-black border-purple-200 ring-purple-400/50';
                var cardBorder = rankNum === 4
                    ? 'border-sky-400/30 bg-gradient-to-br from-sky-500/12 via-[#0e1320]/90 to-black/80'
                    : 'border-purple-400/30 bg-gradient-to-br from-purple-500/12 via-[#0e1320]/90 to-black/80';
                var pillTone = rankNum === 4
                    ? 'text-sky-300 bg-sky-500/20 border-sky-400/35'
                    : 'text-purple-300 bg-purple-500/20 border-purple-400/35';

                if (itemObj && uInfo) {
                    var clickCardJs = `GlobalStats.openUserCard('${self.escapeJs(itemObj.id || '')}', '${self.escapeJs(uInfo.username)}', '${self.escapeJs(uInfo.avatar)}', '${self.escapeJs(uInfo.borderUrl)}', '${self.escapeJs(uInfo.borderName)}', ${!!uInfo.isMasterAdmin}, ${!!uInfo.isVip})`;
                    return `
                        <div onclick="${clickCardJs}" class="flex-1 min-w-0 p-2.5 rounded-2xl border ${cardBorder} backdrop-blur-xl shadow-md flex items-center gap-2.5 relative overflow-hidden cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all">
                            <div class="relative flex items-center justify-center shrink-0" style="width: 44px; height: 44px;">
                                <div class="rounded-full overflow-hidden bg-black/90 ${uInfo.borderUrl ? '' : 'ring-1 ring-white/20'} flex items-center justify-center" style="width: 32px; height: 32px;">
                                    <img src="${uInfo.avatar}" class="w-full h-full object-cover rounded-full" onerror="this.src='/logo.png'" />
                                </div>
                                ${uInfo.borderUrl ? `
                                <img src="${uInfo.borderUrl}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" style="width: 42px; height: 42px; ${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(uInfo.borderUrl) : ''}" onerror="this.style.display='none';" />
                                ` : ''}
                                <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 z-30 rounded-full bg-gradient-to-tr ${badgeColor} font-black flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.95)] border-2 border-[#07090e] ring-1 font-mono" style="width: 16px; height: 16px; font-size: 8.5px; line-height: 1;">${rankNum}</span>
                            </div>
                            <div class="min-w-0 flex-1 flex flex-col justify-center space-y-0.5">
                                <div class="flex items-center justify-between gap-1">
                                    <span class="px-1.5 py-0.5 rounded-md border ${pillTone} font-black font-mono uppercase leading-none" style="font-size: 8px;">🏅 JUARA ${rankNum}</span>
                                    <span class="text-amber-300 font-mono font-black truncate" style="font-size: 9.5px;">${itemObj.formattedDuration}</span>
                                </div>
                                <div class="flex items-center gap-1 flex-wrap leading-tight pt-0.5">
                                    <span class="inline-flex items-center max-w-full">
                                        <h5 class="text-white font-black text-xs truncate max-w-[85px] sm:max-w-[110px] leading-none">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && uInfo.nameGlow) ? Auth.renderUsernameWithGlow(uInfo.username, uInfo.nameGlow) : uInfo.username}</h5>
                                        ${self.getVerifiedIconHTML(uInfo, 12)}
                                    </span>
                                    ${uInfo.isVip && typeof Auth !== 'undefined' && Auth.getVipBadgeHTML ? Auth.getVipBadgeHTML('text-[7px]') : ''}
                                </div>
                                ${((uInfo.donatur && uInfo.donatur.activeBadge) || uInfo.equippedBadgeTitle || uInfo.equippedBadge) ? `
                                <div class="flex items-center gap-1 flex-wrap leading-none pt-0.5">
                                    ${uInfo.equippedBadgeTitle || uInfo.equippedBadge ? (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML ? Auth.getRankBadgePillHTML(uInfo.equippedBadge, uInfo.equippedBadgeTitle, uInfo.equippedBadgeIcon, uInfo.equippedBadgeColor, 'text-[7px]') : '') : ''}
                                    ${uInfo.donatur && typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML ? Auth.getDonaturBadgeHTML(uInfo.donatur, 'text-[7px]') : ''}
                                </div>
                                ` : ''}
                                <div class="flex items-center gap-1 text-white/50 truncate" style="font-size: 8.5px;">
                                    ${uInfo.borderName ? `<span class="text-amber-300 font-semibold">${uInfo.borderName}</span> &bull; ` : ''}
                                    <span>${itemObj.totalPlays} lagu</span>
                                </div>
                            </div>
                        </div>
                    `;
                }

                // Open slot for Juara 4 / Juara 5 when not yet occupied
                return `
                    <div class="flex-1 min-w-0 p-2.5 rounded-2xl border border-dashed border-white/15 bg-white/[0.025] flex items-center gap-2.5">
                        <div class="relative flex items-center justify-center shrink-0" style="width: 42px; height: 42px;">
                            <div class="rounded-full bg-white/[0.05] border border-white/15 flex items-center justify-center text-white/30" style="width: 30px; height: 30px;">
                                <i data-lucide="user" class="w-3.5 h-3.5"></i>
                            </div>
                            <span class="absolute -bottom-1 left-1/2 -translate-x-1/2 z-20 rounded-full bg-gradient-to-tr ${badgeColor} font-black flex items-center justify-center shadow border-2 border-[#07090e] font-mono" style="width: 16px; height: 16px; font-size: 8.5px; line-height: 1;">${rankNum}</span>
                        </div>
                        <div class="min-w-0 flex-1 space-y-0.5">
                            <div class="flex items-center justify-between gap-1">
                                <span class="px-1.5 py-0.5 rounded-md border ${pillTone} font-black font-mono uppercase leading-none" style="font-size: 8px;">🏅 JUARA ${rankNum}</span>
                                <span class="text-white/40 font-mono font-bold" style="font-size: 9px;">0 Menit</span>
                            </div>
                            <p class="text-white/60 font-bold truncate pt-0.5" style="font-size: 10.5px;">Menunggu Pendengar</p>
                            <p class="text-white/35 truncate" style="font-size: 8.5px;">Putar musik untuk klaim #${rankNum}</p>
                        </div>
                    </div>
                `;
            };

            var podiumHTML = `
                <div class="pt-4 pb-1 space-y-3">
                    <!-- PODIUM 1 - 2 - 3 -->
                    <div class="flex items-end justify-center gap-2 sm:gap-3">
                        
                        <!-- PODIUM #2: Perak (Silver) -->
                        ${second && u2 ? `
                        <div onclick="GlobalStats.openUserCard('${this.escapeJs(second.id || '')}', '${this.escapeJs(u2.username)}', '${this.escapeJs(u2.avatar)}', '${this.escapeJs(u2.borderUrl)}', '${this.escapeJs(u2.borderName)}', ${!!u2.isMasterAdmin}, ${!!u2.isVip})" class="flex-1 flex flex-col items-center max-w-[112px] sm:max-w-[125px] text-center cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all">
                            <div class="relative mb-3.5 flex items-center justify-center" style="width: 50px; height: 50px;">
                                <div class="rounded-full overflow-hidden bg-black/90 ${u2.borderUrl ? '' : 'ring-2 ring-slate-300'} shadow-sm flex items-center justify-center" style="width: 36px; height: 36px;">
                                    <img src="${u2.avatar}" class="w-full h-full object-cover rounded-full" onerror="this.src='/logo.png'" />
                                </div>
                                ${u2.borderUrl ? `
                                <img src="${u2.borderUrl}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_6px_rgba(203,213,225,0.6)]" style="width: 48px; height: 48px; ${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(u2.borderUrl) : ''}" onerror="this.style.display='none';" />
                                ` : ''}
                                <span class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-30 rounded-full bg-gradient-to-tr from-slate-300 via-white to-slate-200 text-black font-black flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.95)] border-2 border-[#07090e] ring-1 ring-slate-300 font-mono" style="width: 18px; height: 18px; font-size: 9px; line-height: 1;">2</span>
                            </div>
                            <div class="relative z-20 flex flex-col items-center w-full px-0.5 space-y-1">
                                <div class="inline-flex items-center justify-center max-w-full">
                                    <h5 class="text-[11px] font-black text-white truncate leading-none" style="font-size: 11px;">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && u2.nameGlow) ? Auth.renderUsernameWithGlow(u2.username, u2.nameGlow) : u2.username}</h5>
                                    ${this.getVerifiedIconHTML(u2, 12)}
                                </div>
                                ${u2.isVip ? `
                                <div class="flex items-center justify-center shrink-0">
                                    ${typeof Auth !== 'undefined' && Auth.getVipBadgeHTML ? Auth.getVipBadgeHTML('text-[7px]') : ''}
                                </div>
                                ` : ''}
                                ${((u2.donatur && u2.donatur.activeBadge) || u2.equippedBadgeTitle || u2.equippedBadge) ? `
                                <div class="flex items-center justify-center gap-1 whitespace-nowrap shrink-0">
                                    ${u2.equippedBadgeTitle || u2.equippedBadge ? (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML ? Auth.getRankBadgePillHTML(u2.equippedBadge, u2.equippedBadgeTitle, u2.equippedBadgeIcon, u2.equippedBadgeColor, 'text-[7px]') : '') : ''}
                                    ${u2.donatur && typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML ? Auth.getDonaturBadgeHTML(u2.donatur, 'text-[7px]') : ''}
                                </div>
                                ` : ''}
                                ${u2.borderName ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-slate-400/20 text-slate-200 border border-slate-400/30 text-[8px] font-bold leading-none" style="font-size: 8px;">Border: ${u2.borderName}</span>` : ''}
                                <span class="text-[9.5px] text-slate-300 font-mono font-bold pt-0.5" style="font-size: 9.5px;">${second.formattedDuration}</span>
                            </div>
                            <div class="w-full h-10 sm:h-11 mt-2 rounded-t-lg bg-gradient-to-t from-slate-900 via-slate-800/80 to-slate-700/60 border-t-2 border-slate-300 flex flex-col items-center justify-center shadow-sm">
                                <span class="text-[9.5px] font-black text-slate-200" style="font-size: 9.5px;">🥈 JUARA 2</span>
                                <span class="text-[8px] text-slate-400 font-mono mt-0.5" style="font-size: 8px;">${second.totalPlays} lagu</span>
                            </div>
                        </div>
                        ` : `
                        <div class="flex-1 flex flex-col items-center max-w-[112px] sm:max-w-[125px] text-center opacity-75">
                            <div class="relative mb-3.5 flex items-center justify-center" style="width: 56px; height: 56px;">
                                <div class="rounded-full bg-white/[0.04] border border-dashed border-slate-400/40 flex items-center justify-center text-slate-400/50" style="width: 36px; height: 36px;">
                                    <i data-lucide="user" class="w-4 h-4"></i>
                                </div>
                                <span class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-30 rounded-full bg-slate-300 text-black font-black flex items-center justify-center shadow border-2 border-[#07090e] font-mono" style="width: 18px; height: 18px; font-size: 9px; line-height: 1;">2</span>
                            </div>
                            <div class="flex flex-col items-center w-full px-0.5 space-y-1">
                                <h5 class="text-[10.5px] font-bold text-white/50 truncate w-full text-center" style="font-size: 10.5px;">Belum Terisi</h5>
                                <span class="text-[9px] text-slate-400/60 font-mono font-bold" style="font-size: 9px;">0 Menit</span>
                            </div>
                            <div class="w-full h-10 sm:h-11 mt-2 rounded-t-lg bg-gradient-to-t from-slate-900/70 to-slate-800/40 border-t-2 border-slate-400/50 flex flex-col items-center justify-center">
                                <span class="text-[9.5px] font-black text-slate-300" style="font-size: 9.5px;">🥈 JUARA 2</span>
                                <span class="text-[8px] text-slate-400/60 font-mono mt-0.5" style="font-size: 8px;">0 lagu</span>
                            </div>
                        </div>
                        `}

                        <!-- PODIUM #1: Emas (Gold) - Elevated -->
                        ${first && u1 ? `
                        <div onclick="GlobalStats.openUserCard('${this.escapeJs(first.id || '')}', '${this.escapeJs(u1.username)}', '${this.escapeJs(u1.avatar)}', '${this.escapeJs(u1.borderUrl)}', '${this.escapeJs(u1.borderName)}', ${!!u1.isMasterAdmin}, ${!!u1.isVip})" class="flex-1 flex flex-col items-center max-w-[128px] sm:max-w-[142px] text-center z-10 cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all">
                            <!-- Crown Badge clearly elevated above Immortal border crest -->
                            <div class="mb-1 z-30 flex items-center justify-center">
                                <div class="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-[#090c14]/95 border border-amber-400/70 shadow-[0_0_10px_rgba(245,158,11,0.65)] animate-bounce">
                                    <svg style="width: 13px; height: 13px;" class="fill-amber-400 text-amber-300 shrink-0" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.3 8.87l5.378-2.689a.5.5 0 0 1 .7.574l-2.002 11.01a1 1 0 0 1-.985.821H5.609a1 1 0 0 1-.985-.821L2.622 6.755a.5.5 0 0 1 .7-.574l5.378 2.689z"/></svg>
                                </div>
                            </div>
                            <div class="relative mb-3.5 flex items-center justify-center" style="width: 60px; height: 60px;">
                                <div class="rounded-full overflow-hidden bg-black/90 ${u1.borderUrl ? '' : 'ring-2 ring-amber-400'} shadow-[0_0_15px_rgba(245,158,11,0.5)] flex items-center justify-center" style="width: 44px; height: 44px;">
                                    <img src="${u1.avatar}" class="w-full h-full object-cover rounded-full" onerror="this.src='/logo.png'" />
                                </div>
                                ${u1.borderUrl ? `
                                <img src="${u1.borderUrl}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]" style="width: 58px; height: 58px; ${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(u1.borderUrl) : ''}" onerror="this.style.display='none';" />
                                ` : ''}
                                <span class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-30 rounded-full bg-gradient-to-tr from-amber-500 via-yellow-300 to-amber-400 text-black font-black flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.95)] border-2 border-[#07090e] ring-1 ring-amber-300 font-mono" style="width: 20px; height: 20px; font-size: 10px; line-height: 1;">1</span>
                            </div>
                            <div class="relative z-20 flex flex-col items-center w-full px-0.5 space-y-1">
                                <div class="inline-flex items-center justify-center max-w-full">
                                    <h5 class="text-xs sm:text-[13px] font-black text-white truncate leading-none">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && u1.nameGlow) ? Auth.renderUsernameWithGlow(u1.username, u1.nameGlow) : u1.username}</h5>
                                    ${this.getVerifiedIconHTML(u1, 13)}
                                </div>
                                ${u1.isVip ? `
                                <div class="flex items-center justify-center shrink-0">
                                    ${typeof Auth !== 'undefined' && Auth.getVipBadgeHTML ? Auth.getVipBadgeHTML('text-[7.5px]') : ''}
                                </div>
                                ` : ''}
                                ${((u1.donatur && u1.donatur.activeBadge) || u1.equippedBadgeTitle || u1.equippedBadge) ? `
                                <div class="flex items-center justify-center gap-1 whitespace-nowrap shrink-0">
                                    ${u1.equippedBadgeTitle || u1.equippedBadge ? (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML ? Auth.getRankBadgePillHTML(u1.equippedBadge, u1.equippedBadgeTitle, u1.equippedBadgeIcon, u1.equippedBadgeColor, 'text-[7px]') : '') : ''}
                                    ${u1.donatur && typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML ? Auth.getDonaturBadgeHTML(u1.donatur, 'text-[7px]') : ''}
                                </div>
                                ` : ''}
                                ${u1.borderName ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[8px] font-extrabold leading-none" style="font-size: 8px;">Border: ${u1.borderName}</span>` : ''}
                                <span class="text-[10px] text-amber-300 font-mono font-black pt-0.5" style="font-size: 10px;">${first.formattedDuration}</span>
                            </div>
                            <div class="w-full h-12 sm:h-14 mt-2 rounded-t-lg bg-gradient-to-t from-amber-950 via-amber-800/80 to-amber-500/40 border-t-2 border-amber-400 flex flex-col items-center justify-center shadow-md">
                                <span class="text-[10px] font-black text-amber-300 flex items-center gap-0.5" style="font-size: 10px;">🥇 JUARA 1</span>
                                <span class="text-[8px] text-amber-200/80 font-mono mt-0.5" style="font-size: 8px;">${first.totalPlays} Lagu Diputar</span>
                            </div>
                        </div>
                        ` : ''}

                        <!-- PODIUM #3: Perunggu (Bronze) -->
                        ${third && u3 ? `
                        <div onclick="GlobalStats.openUserCard('${this.escapeJs(third.id || '')}', '${this.escapeJs(u3.username)}', '${this.escapeJs(u3.avatar)}', '${this.escapeJs(u3.borderUrl)}', '${this.escapeJs(u3.borderName)}', ${!!u3.isMasterAdmin}, ${!!u3.isVip})" class="flex-1 flex flex-col items-center max-w-[112px] sm:max-w-[125px] text-center cursor-pointer hover:brightness-110 active:scale-[0.98] transition-all">
                            <div class="relative mb-3.5 flex items-center justify-center" style="width: 50px; height: 50px;">
                                <div class="rounded-full overflow-hidden bg-black/90 ${u3.borderUrl ? '' : 'ring-2 ring-amber-700/60'} shadow-sm flex items-center justify-center" style="width: 36px; height: 36px;">
                                    <img src="${u3.avatar}" class="w-full h-full object-cover rounded-full" onerror="this.src='/logo.png'" />
                                </div>
                                ${u3.borderUrl ? `
                                <img src="${u3.borderUrl}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_6px_rgba(180,83,9,0.5)]" style="width: 48px; height: 48px; ${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(u3.borderUrl) : ''}" onerror="this.style.display='none';" />
                                ` : ''}
                                <span class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-30 rounded-full bg-gradient-to-tr from-amber-800 via-amber-600 to-amber-700 text-white font-black flex items-center justify-center shadow-[0_2px_6px_rgba(0,0,0,0.95)] border-2 border-[#07090e] ring-1 ring-amber-500 font-mono" style="width: 18px; height: 18px; font-size: 9px; line-height: 1;">3</span>
                            </div>
                            <div class="relative z-20 flex flex-col items-center w-full px-0.5 space-y-1">
                                <div class="inline-flex items-center justify-center max-w-full">
                                    <h5 class="text-[11px] font-black text-white truncate leading-none" style="font-size: 11px;">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && u3.nameGlow) ? Auth.renderUsernameWithGlow(u3.username, u3.nameGlow) : u3.username}</h5>
                                    ${this.getVerifiedIconHTML(u3, 12)}
                                </div>
                                ${u3.isVip ? `
                                <div class="flex items-center justify-center shrink-0">
                                    ${typeof Auth !== 'undefined' && Auth.getVipBadgeHTML ? Auth.getVipBadgeHTML('text-[7px]') : ''}
                                </div>
                                ` : ''}
                                ${((u3.donatur && u3.donatur.activeBadge) || u3.equippedBadgeTitle || u3.equippedBadge) ? `
                                <div class="flex items-center justify-center gap-1 whitespace-nowrap shrink-0">
                                    ${u3.equippedBadgeTitle || u3.equippedBadge ? (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML ? Auth.getRankBadgePillHTML(u3.equippedBadge, u3.equippedBadgeTitle, u3.equippedBadgeIcon, u3.equippedBadgeColor, 'text-[7px]') : '') : ''}
                                    ${u3.donatur && typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML ? Auth.getDonaturBadgeHTML(u3.donatur, 'text-[7px]') : ''}
                                </div>
                                ` : ''}
                                ${u3.borderName ? `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-700/20 text-amber-300 border border-amber-700/30 text-[8px] font-bold leading-none" style="font-size: 8px;">Border: ${u3.borderName}</span>` : ''}
                                <span class="text-[9.5px] text-amber-400 font-mono font-bold pt-0.5" style="font-size: 9.5px;">${third.formattedDuration}</span>
                            </div>
                            <div class="w-full h-9 sm:h-10 mt-2 rounded-t-lg bg-gradient-to-t from-stone-900 via-amber-950/80 to-amber-900/50 border-t-2 border-amber-700/60 flex flex-col items-center justify-center shadow-sm">
                                <span class="text-[9.5px] font-black text-amber-400" style="font-size: 9.5px;">🥉 JUARA 3</span>
                                <span class="text-[8px] text-amber-300/60 font-mono mt-0.5" style="font-size: 8px;">${third.totalPlays} lagu</span>
                            </div>
                        </div>
                        ` : `
                        <div class="flex-1 flex flex-col items-center max-w-[112px] sm:max-w-[125px] text-center opacity-80">
                            <div class="relative mb-3.5 flex items-center justify-center" style="width: 56px; height: 56px;">
                                <div class="rounded-full bg-white/[0.04] border border-dashed border-amber-600/45 flex items-center justify-center text-amber-500/50" style="width: 36px; height: 36px;">
                                    <i data-lucide="user" class="w-4 h-4"></i>
                                </div>
                                <span class="absolute -bottom-1.5 left-1/2 -translate-x-1/2 z-30 rounded-full bg-gradient-to-tr from-amber-800 via-amber-600 to-amber-700 text-white font-black flex items-center justify-center shadow border-2 border-[#07090e] ring-1 ring-amber-500 font-mono" style="width: 18px; height: 18px; font-size: 9px; line-height: 1;">3</span>
                            </div>
                            <div class="flex flex-col items-center w-full px-0.5 space-y-1">
                                <h5 class="text-[10.5px] font-bold text-white/55 truncate w-full text-center" style="font-size: 10.5px;">Menunggu #3</h5>
                                <span class="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-700/15 text-amber-400/70 border border-amber-700/30 font-bold leading-none" style="font-size: 8px;">Slot Terbuka</span>
                                <span class="text-[9px] text-amber-400/70 font-mono font-bold pt-0.5" style="font-size: 9px;">0 Menit</span>
                            </div>
                            <div class="w-full h-9 sm:h-10 mt-2 rounded-t-lg bg-gradient-to-t from-stone-900 via-amber-950/70 to-amber-900/40 border-t-2 border-amber-700/60 flex flex-col items-center justify-center shadow-sm">
                                <span class="text-[9.5px] font-black text-amber-400" style="font-size: 9.5px;">🥉 JUARA 3</span>
                                <span class="text-[8px] text-amber-300/60 font-mono mt-0.5" style="font-size: 8px;">0 lagu</span>
                            </div>
                        </div>
                        `}
                    </div>

                    <!-- BARIS ELITE JUARA 4 & JUARA 5 (TETAP DI ATAS GARIS PEMISAH) -->
                    <div class="grid grid-cols-2 gap-2 pt-1">
                        ${renderTop4And5Card(4, fourth, u4)}
                        ${renderTop4And5Card(5, fifth, u5)}
                    </div>
                </div>
            `;

            // =========================================================================
            // GARIS PEMISAH & DAFTAR PERINGKAT JUARA 6 SAMPAI 100 (DI BAWAH GARIS)
            // =========================================================================
            var activeRange = this.rankRange || 'all';
            var startRank = 6;
            var endRank = 100;
            if (activeRange === '6-25') { startRank = 6; endRank = 25; }
            else if (activeRange === '26-50') { startRank = 26; endRank = 50; }
            else if (activeRange === '51-75') { startRank = 51; endRank = 75; }
            else if (activeRange === '76-100') { startRank = 76; endRank = 100; }

            var rangeTabs = [
                { id: 'all', label: 'Semua (6–100)' },
                { id: '6-25', label: 'Juara 6–25' },
                { id: '26-50', label: 'Juara 26–50' },
                { id: '51-75', label: 'Juara 51–75' },
                { id: '76-100', label: 'Juara 76–100' }
            ];

            var rows6To100 = [];
            for (var r = startRank; r <= endRank; r++) {
                var item = lb[r - 1] || null;
                if (item) {
                    var ui = self.getUserDisplayInfo(item, myUser);
                    var clickRowJs = `GlobalStats.openUserCard('${self.escapeJs(item.id || '')}', '${self.escapeJs(ui.username)}', '${self.escapeJs(ui.avatar)}', '${self.escapeJs(ui.borderUrl)}', '${self.escapeJs(ui.borderName)}', ${!!ui.isMasterAdmin}, ${!!ui.isVip})`;
                    rows6To100.push(`
                        <div onclick="${clickRowJs}" class="py-2.5 px-3 rounded-xl ${ui.isMe ? 'bg-sky-500/10 border-sky-400/40 shadow-sm' : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10'} border flex items-center justify-between gap-3 transition-all cursor-pointer active:scale-[0.99]">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <span class="px-2 py-1 rounded-lg bg-amber-400/15 border border-amber-400/35 text-amber-300 font-black font-mono shrink-0 text-center" style="min-width: 36px; font-size: 10px;">#${r}</span>
                                
                                <!-- Avatar with Border Frame (32px avatar + 42px border) -->
                                <div class="relative flex items-center justify-center shrink-0 mr-0.5" style="width: 44px; height: 44px;">
                                    <div class="rounded-full overflow-hidden bg-black/90 ${ui.borderUrl ? '' : 'ring-1 ring-white/15'} flex items-center justify-center" style="width: 32px; height: 32px;">
                                        <img src="${ui.avatar}" class="w-full h-full object-cover rounded-full" onerror="this.src='/logo.png'" />
                                    </div>
                                    ${ui.borderUrl ? `
                                    <img src="${ui.borderUrl}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_6px_rgba(245,158,11,0.5)]" style="width: 42px; height: 42px; ${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(ui.borderUrl) : ''}" onerror="this.style.display='none';" />
                                    ` : ''}
                                </div>

                                <div class="min-w-0 flex-1 relative z-20 flex flex-col justify-center space-y-0.5">
                                    <div class="flex items-center gap-1.5 flex-wrap leading-tight">
                                        <span class="inline-flex items-center max-w-full">
                                            <h5 class="text-white font-bold text-xs truncate max-w-[125px] leading-none">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && ui.nameGlow) ? Auth.renderUsernameWithGlow(ui.username, ui.nameGlow) : ui.username}</h5>
                                            ${self.getVerifiedIconHTML(ui, 12)}
                                        </span>
                                        <span class="px-1.5 py-0.5 rounded bg-white/10 text-white/80 font-mono font-bold" style="font-size: 8px;">JUARA ${r}</span>
                                        ${ui.isVip ? ((typeof Auth !== 'undefined' && Auth.getVipBadgeHTML) ? Auth.getVipBadgeHTML('text-[7px]') : '<span class="text-[7.5px] bg-amber-400/20 text-amber-300 border border-amber-400/30 px-1 py-0.5 rounded font-black font-mono">VIP</span>') : ''}
                                        ${item.isOnline ? '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Sedang Mendengarkan"></span>' : ''}
                                    </div>
                                    ${((ui.donatur && ui.donatur.activeBadge) || ui.equippedBadgeTitle || ui.equippedBadge) ? `
                                    <div class="flex items-center gap-1 flex-wrap leading-none pt-0.5">
                                        ${ui.equippedBadgeTitle || ui.equippedBadge ? (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML ? Auth.getRankBadgePillHTML(ui.equippedBadge, ui.equippedBadgeTitle, ui.equippedBadgeIcon, ui.equippedBadgeColor, 'text-[7px]') : `<span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold border" style="font-size: 8px; border-color: ${ui.equippedBadgeColor || '#38bdf8'}; color: ${ui.equippedBadgeColor || '#38bdf8'};">${ui.equippedBadgeTitle}</span>`) : ''}
                                        ${ui.donatur && typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML ? Auth.getDonaturBadgeHTML(ui.donatur, 'text-[7px]') : ''}
                                    </div>
                                    ` : ''}
                                    <div class="flex items-center gap-1.5 text-[9.5px] text-white/50 truncate leading-none pt-0.5" style="font-size: 9.5px;">
                                        ${ui.borderName ? `<span class="text-amber-300 font-medium">Border: ${ui.borderName}</span> &bull; ` : ''}
                                        <span>${item.totalPlays} lagu diputar</span>
                                    </div>
                                </div>
                            </div>

                            <div class="text-right shrink-0">
                                <span class="text-xs font-black text-amber-300 font-mono">${item.formattedDuration}</span>
                            </div>
                        </div>
                    `);
                } else {
                    rows6To100.push(`
                        <div class="py-2 px-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.07] flex items-center justify-between gap-3 transition-all">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <span class="px-2 py-1 rounded-lg bg-white/[0.05] border border-white/10 text-white/60 font-black font-mono shrink-0 text-center" style="min-width: 36px; font-size: 10px;">#${r}</span>
                                <div class="rounded-full bg-white/[0.04] border border-dashed border-white/15 flex items-center justify-center text-white/30 shrink-0" style="width: 32px; height: 32px;">
                                    <i data-lucide="award" class="w-3.5 h-3.5"></i>
                                </div>
                                <div class="min-w-0 flex-1 flex flex-col justify-center">
                                    <div class="flex items-center gap-1.5">
                                        <span class="text-white/75 font-bold text-xs">Juara ${r}</span>
                                        <span class="px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-300/75 border border-amber-400/20 font-mono font-bold" style="font-size: 8px;">PERINGKAT #${r}</span>
                                    </div>
                                    <span class="text-white/35 truncate" style="font-size: 9px;">Slot peringkat terbuka &bull; Putar lagu untuk klaim posisi #${r}</span>
                                </div>
                            </div>
                            <div class="text-right shrink-0">
                                <span class="text-white/40 font-mono font-bold" style="font-size: 10px;">0 Menit</span>
                            </div>
                        </div>
                    `);
                }
            }

            var restHTML = `
                <div class="pt-2 space-y-3">
                    <!-- GARIS PEMISAH ANTARA JUARA 1-5 (ATAS) & JUARA 6-100 (BAWAH) -->
                    <div class="relative py-1 flex items-center justify-center">
                        <div class="w-full border-t-2 border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.15)]"></div>
                        <span class="absolute px-3 py-0.5 rounded-full bg-[#0b0e17] border border-amber-400/40 text-amber-300 font-black uppercase tracking-wider shadow-md" style="font-size: 9px;">
                            🏆 DAFTAR JUARA 6 SAMPAI 100
                        </span>
                    </div>

                    <!-- Filter Rentang Cepat Juara 6 - 100 -->
                    <div class="flex items-center gap-1 overflow-x-auto hide-scrollbar pb-0.5">
                        ${rangeTabs.map(function(rt) {
                            var isAct = activeRange === rt.id;
                            return `<button type="button" onclick="GlobalStats.setRankRange('${rt.id}')" class="px-2.5 py-1 rounded-lg font-extrabold shrink-0 transition-all cursor-pointer active:scale-95 ${isAct ? 'bg-amber-400 text-black shadow-sm' : 'bg-white/[0.05] text-white/60 hover:text-white border border-white/10'}" style="font-size: 9.5px;">${rt.label}</button>`;
                        }).join('')}
                    </div>

                    <div class="flex items-center justify-between text-[10px] font-bold text-white/50 px-2 uppercase tracking-wider" style="font-size: 10px;">
                        <span>Urutan Juara ${startRank} – ${endRank}</span>
                        <span>Total Durasi</span>
                    </div>

                    <div class="space-y-1.5">
                        ${rows6To100.join('')}
                    </div>
                </div>
            `;

            return `
                <div class="space-y-3.5">
                    ${tfButtons}
                    ${myRankCard}
                    ${podiumHTML}
                    ${restHTML}
                </div>
            `;
        },

        // 2. TOP SONGS RENDERER
        getTopSongsHTML(data) {
            var songs = data.topSongs || [];
            if (songs.length === 0) {
                return `
                    <div class="text-center py-16 text-white/50 space-y-3">
                        <div class="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/30">
                            <i data-lucide="music" class="w-6 h-6"></i>
                        </div>
                        <p class="text-xs font-semibold">Belum ada lagu yang tercatat dalam periode ini.</p>
                        <p class="text-[11px] text-white/40">Putar lagu kesukaanmu untuk memulai tangga lagu global!</p>
                    </div>
                `;
            }

            return `
                <div class="space-y-2.5">
                    <div class="p-2.5 sm:p-3 rounded-2xl bg-gradient-to-r from-rose-500/15 via-pink-500/10 to-amber-500/10 border border-rose-500/25 flex items-center justify-between shadow-sm">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300 shrink-0">
                                <i data-lucide="flame" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <h4 class="text-xs sm:text-[13px] font-black text-white">Top 20 Lagu Paling Banyak Diputar</h4>
                                <p class="text-[9.5px] text-white/50 mt-0.5">Berdasarkan statistik frekuensi putar real-time</p>
                            </div>
                        </div>
                        <span class="text-[8.5px] bg-rose-500/20 text-rose-300 border border-rose-500/40 px-2 py-0.5 rounded-full font-mono font-extrabold uppercase tracking-wider">TRENDING</span>
                    </div>

                    <div class="space-y-1.5">
                        ${songs.map(function(s, idx) {
                            var rankBadge = idx === 0 
                                ? '<span class="w-5 h-5 rounded-md bg-amber-400 text-black font-black text-[10.5px] flex items-center justify-center shadow-sm shadow-amber-400/20 font-mono">1</span>' 
                                : (idx === 1 
                                    ? '<span class="w-5 h-5 rounded-md bg-slate-300 text-black font-black text-[10.5px] flex items-center justify-center shadow-sm font-mono">2</span>' 
                                    : (idx === 2 
                                        ? '<span class="w-5 h-5 rounded-md bg-amber-700 text-white font-black text-[10.5px] flex items-center justify-center shadow-sm font-mono">3</span>' 
                                        : '<span class="w-5 text-center text-[10.5px] text-white/40 font-mono font-bold">#' + (s.rank || (idx + 1)) + '</span>'));
                            
                            var cover = s.image || (s.id ? `https://i.ytimg.com/vi/${s.id}/hqdefault.jpg` : '/logo.png');
                            var songObjStr = encodeURIComponent(JSON.stringify(s));

                            return `
                            <div class="py-2 px-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 flex items-center justify-between gap-2.5 transition-all group shadow-sm active:scale-[0.99]">
                                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                                    <div class="shrink-0 flex items-center justify-center">
                                        ${rankBadge}
                                    </div>
                                    <div class="relative w-10 h-10 rounded-lg overflow-hidden bg-black/80 shrink-0 border border-white/15 shadow-sm">
                                        <img src="${cover}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" onerror="this.src='/logo.png'" />
                                        <button onclick="GlobalStats.playSong('${songObjStr}')" class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity cursor-pointer">
                                            <i data-lucide="play" class="w-4 h-4 fill-white"></i>
                                        </button>
                                    </div>
                                    <div class="min-w-0 flex-1">
                                        <h5 class="text-white font-bold text-xs truncate group-hover:text-amber-300 transition-colors">${s.title}</h5>
                                        <p class="text-[10px] text-white/50 truncate mt-0.5">${s.artist || 'MusifyStar'}</p>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2 shrink-0">
                                    <div class="text-right">
                                        <span class="text-[11px] font-black text-rose-300 font-mono">${s.count}x</span>
                                        <span class="text-[8.5px] text-white/40 block leading-none mt-0.5">diputar</span>
                                    </div>
                                    <button onclick="GlobalStats.playSong('${songObjStr}')" class="w-7 h-7 rounded-full bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 border border-rose-500/30 flex items-center justify-center transition-all cursor-pointer active:scale-95 shadow-sm" title="Putar Lagu Ini">
                                        <i data-lucide="play" class="w-3 h-3 fill-rose-300"></i>
                                    </button>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        },

        playSong(encodedSongStr) {
            try {
                var s = JSON.parse(decodeURIComponent(encodedSongStr));
                if (typeof Player !== 'undefined' && Player.playTrack) {
                    Player.playTrack({
                        id: s.id,
                        title: s.title,
                        artist: s.artist,
                        image: s.image,
                        duration: s.duration,
                        album: s.album
                    });
                }
            } catch(e) {
                console.error('[GlobalStats] Play song error:', e);
            }
        },

        // 3. COMMUNITY PLATFORM STATS RENDERER
        getCommunityStatsHTML(data) {
            var liveCount = data.liveActiveCount || 0;
            var totalHours = data.totalCommunityHours || '35.6';
            var totalPlays = data.totalPlays || 480;
            var totalMembers = data.totalMembers || 6;
            var devices = data.devices || {};

            return `
                <div class="space-y-4">
                    <!-- Banner Overview -->
                    <div class="p-4 rounded-3xl bg-gradient-to-r from-sky-500/20 via-indigo-500/20 to-purple-500/20 border border-sky-400/30 shadow-xl space-y-3">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-mono uppercase tracking-wider text-sky-400 font-bold">Ringkasan Komunitas</span>
                            <span class="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Sistem Realtime
                            </span>
                        </div>
                        <h3 class="text-base font-black text-white leading-tight">MusifyStar Music Streaming Community</h3>
                        <p class="text-xs text-white/60 leading-relaxed">Seluruh pemutaran lagu dan durasi mendengarkan diperbarui secara langsung (real-time). Bersainglah di leaderboard dengan mendengarkan musik favoritmu!</p>
                    </div>

                    <!-- 4 Grid Stats Cards -->
                    <div class="grid grid-cols-2 gap-2.5">
                        <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                            <span class="text-[10px] text-white/50 uppercase tracking-wider font-mono">Pendengar Aktif</span>
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-xl font-black text-emerald-400 font-mono">${liveCount}</span>
                                <span class="text-[10px] text-emerald-400/80 font-bold">Online</span>
                            </div>
                            <p class="text-[9.5px] text-white/40">Sedang memutar musik detik ini</p>
                        </div>

                        <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                            <span class="text-[10px] text-white/50 uppercase tracking-wider font-mono">Total Durasi</span>
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-xl font-black text-amber-300 font-mono">${totalHours}</span>
                                <span class="text-[10px] text-amber-300/80 font-bold">Jam</span>
                            </div>
                            <p class="text-[9.5px] text-white/40">Waktu bersama menikmati musik</p>
                        </div>

                        <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                            <span class="text-[10px] text-white/50 uppercase tracking-wider font-mono">Total Pemutaran</span>
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-xl font-black text-rose-400 font-mono">${totalPlays}</span>
                                <span class="text-[10px] text-rose-400/80 font-bold">Plays</span>
                            </div>
                            <p class="text-[9.5px] text-white/40">Lagu berhasil diputar</p>
                        </div>

                        <div class="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-1">
                            <span class="text-[10px] text-white/50 uppercase tracking-wider font-mono">Anggota Terdaftar</span>
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-xl font-black text-sky-400 font-mono">${totalMembers}</span>
                                <span class="text-[10px] text-sky-400/80 font-bold">Akun</span>
                            </div>
                            <p class="text-[9.5px] text-white/40">Bergabung di MusifyStar</p>
                        </div>
                    </div>

                    <!-- Perangkat Digunakan -->
                    <div class="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
                        <h4 class="text-xs font-bold text-white flex items-center gap-1.5">
                            <i data-lucide="smartphone" class="w-3.5 h-3.5 text-sky-400"></i> Platform & Perangkat Pendengar
                        </h4>
                        <div class="space-y-1.5 text-xs">
                            <div class="flex items-center justify-between text-white/70 text-[11px]">
                                <span>Aplikasi Android (APK)</span>
                                <span class="font-mono text-emerald-400 font-bold">${devices.android_apk || 0}</span>
                            </div>
                            <div class="flex items-center justify-between text-white/70 text-[11px]">
                                <span>PWA Chrome / Mobile Web</span>
                                <span class="font-mono text-amber-400 font-bold">${devices.pwa_chrome || 0}</span>
                            </div>
                            <div class="flex items-center justify-between text-white/70 text-[11px]">
                                <span>Desktop / Browser Web</span>
                                <span class="font-mono text-sky-400 font-bold">${devices.desktop_web || 0}</span>
                            </div>
                            <div class="flex items-center justify-between text-white/70 text-[11px]">
                                <span>Safari iOS</span>
                                <span class="font-mono text-purple-400 font-bold">${devices.safari_ios || 0}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    };

    // Auto-listen to Real-time Profile, Border & User Changes across the app
    window.addEventListener('musifystar:user_profile_updated', function(e) {
        if (typeof GlobalStats !== 'undefined' && typeof GlobalStats.onUserProfileUpdated === 'function') {
            var u = (e && e.detail && e.detail.user) || (typeof Auth !== 'undefined' ? Auth.currentUser : null);
            if (u) GlobalStats.onUserProfileUpdated(u);
        }
    });

    window.addEventListener('musifystar:user_badge_updated', function(e) {
        if (typeof GlobalStats !== 'undefined' && typeof GlobalStats.onUserProfileUpdated === 'function') {
            var u = (e && e.detail && e.detail.user) || (typeof Auth !== 'undefined' ? Auth.currentUser : null);
            if (u) GlobalStats.onUserProfileUpdated(u);
        }
    });

    window.addEventListener('musifystar:user_border_updated', function(e) {
        if (typeof GlobalStats !== 'undefined' && typeof GlobalStats.onUserBorderChanged === 'function') {
            var d = (e && e.detail) || {};
            GlobalStats.onUserBorderChanged(d.borderUrl || '', d.borderName || '');
        }
    });

    window.addEventListener('storage', function(e) {
        if (e.key === 'musifystar_auth_user' && e.newValue) {
            try {
                var u = JSON.parse(e.newValue);
                if (typeof GlobalStats !== 'undefined' && typeof GlobalStats.onUserBorderChanged === 'function') {
                    GlobalStats.onUserBorderChanged(u.borderUrl || '', u.borderName || '');
                }
            } catch(err) {}
        }
    });

    window.GlobalStats = GlobalStats;
})();
