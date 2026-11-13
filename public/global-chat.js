// ==========================================
// MUSIFYSTAR GLOBAL CHAT SYSTEM
// MusifyStar Cyber-Dark & Neon Cyan Music Aesthetic
// Integrated with Neon PostgreSQL Primary Database
// Strict Anti-DevTools & Anti-Tampering Security
// ==========================================

(function() {
    'use strict';

    // Anti-DevTools Console Warning Banner
    try {
        console.log(
            '%c[MUSIFYSTAR SECURITY PROTOCOL]%c\nSistem Chat Global terlindungi oleh enkripsi server & verifikasi PostgreSQL primer.\nPeringatan: Dilarang keras manipulasi token, penyalahgunaan console, atau inspeksi injeksi skrip (Self-XSS).',
            'background: #0f172a; color: #38bdf8; font-size: 14px; font-weight: bold; padding: 6px 10px; border-radius: 6px; border: 1px solid #0284c7;',
            'color: #f59e0b; font-size: 11px; font-weight: normal; margin-top: 4px;'
        );
    } catch (e) {}

    // Clean up any stale legacy device cache
    try { localStorage.removeItem('musifystar_sent_chat_ids'); } catch (e) {}

    var GlobalChat = {
        isOpen: false,
        pollInterval: null,
        lastMessageCount: 0,
        messages: [],
        isSending: false,
        _userBubbleCache: {},

        CHAT_BUBBLE_STYLES: {
            'default': {
                id: 'default',
                name: 'Default',
                bg: '#222834',
                previewBg: '#1d6ff2',
                border: '#334155',
                textColor: '#f8fafc',
                metaColor: '#94a3b8',
                isLight: false
            },
            'kapibara': {
                id: 'kapibara',
                name: 'Kapibara',
                bg: '#cf9155',
                border: '#4f2c11',
                bottomBar: '#a86e38',
                textColor: '#261305',
                metaColor: '#4f2c11',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 36" class="w-12 h-7 pointer-events-none select-none overflow-visible"><ellipse cx="26" cy="22" rx="20" ry="12" fill="#b8793e" stroke="#4f2c11" stroke-width="2.2"/><ellipse cx="14" cy="22" rx="9" ry="8" fill="#9c622c" stroke="#4f2c11" stroke-width="2"/><circle cx="34" cy="11" r="4.5" fill="#9c622c" stroke="#4f2c11" stroke-width="2"/><path d="M21 19 Q25 21 29 19" stroke="#4f2c11" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="11" cy="20" r="1.6" fill="#4f2c11"/><path d="M10 25 Q13 27 16 25" stroke="#4f2c11" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
                bottomLeftSvg: `<svg viewBox="0 0 40 16" class="w-8 h-3.5 pointer-events-none select-none"><ellipse cx="12" cy="8" rx="7" ry="4.5" fill="#9c622c" stroke="#4f2c11" stroke-width="2"/><ellipse cx="28" cy="8" rx="7" ry="4.5" fill="#9c622c" stroke="#4f2c11" stroke-width="2"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 36 16" class="w-7 h-3.5 pointer-events-none select-none"><ellipse cx="18" cy="8" rx="8" ry="4.5" fill="#9c622c" stroke="#4f2c11" stroke-width="2"/></svg>`
            },
            'katak': {
                id: 'katak',
                name: 'Katak',
                bg: '#24b345',
                border: '#114a1e',
                bottomBar: '#e04f33',
                textColor: '#ffffff',
                metaColor: '#dcfce7',
                isLight: false,
                topLeftSvg: `<svg viewBox="0 0 36 30" class="w-8 h-6 pointer-events-none select-none overflow-visible"><circle cx="18" cy="15" r="11" fill="#24b345" stroke="#114a1e" stroke-width="2.4"/><circle cx="18" cy="15" r="7" fill="#ffffff"/><circle cx="19" cy="15" r="4" fill="#111827"/><circle cx="20.5" cy="13.5" r="1.4" fill="#ffffff"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 36 30" class="w-8 h-6 pointer-events-none select-none overflow-visible"><circle cx="18" cy="15" r="11" fill="#24b345" stroke="#114a1e" stroke-width="2.4"/><circle cx="18" cy="15" r="7" fill="#ffffff"/><circle cx="17" cy="15" r="4" fill="#111827"/><circle cx="18.5" cy="13.5" r="1.4" fill="#ffffff"/></svg>`,
                bottomLeftSvg: `<svg viewBox="0 0 32 14" class="w-6 h-3 pointer-events-none select-none"><path d="M4 8 Q10 2 18 8 Z" fill="#24b345" stroke="#114a1e" stroke-width="2"/></svg>`
            },
            'kucing_anjing': {
                id: 'kucing_anjing',
                name: 'Kucing dan anjing',
                bg: '#fff9db',
                border: '#784b2a',
                wavyBorder: true,
                textColor: '#2d1c10',
                metaColor: '#784b2a',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 64 38" class="w-12 h-7 pointer-events-none select-none overflow-visible"><path d="M10 28 L12 9 L23 17 Q30 15 37 17 L46 9 L48 28 Z" fill="#f59e0b" stroke="#6b3410" stroke-width="2.2" stroke-linejoin="round"/><path d="M14 13 L15 21 L21 17 Z" fill="#fde68a"/><path d="M44 13 L43 21 L37 17 Z" fill="#fde68a"/><line x1="27" y1="16" x2="27" y2="21" stroke="#b45309" stroke-width="2" stroke-linecap="round"/><line x1="31" y1="16" x2="31" y2="21" stroke="#b45309" stroke-width="2" stroke-linecap="round"/><circle cx="22" cy="23" r="2.1" fill="#2d1c10"/><circle cx="36" cy="23" r="2.1" fill="#2d1c10"/><ellipse cx="18" cy="25" rx="2.5" ry="1.4" fill="#fb7185" opacity="0.7"/><ellipse cx="40" cy="25" rx="2.5" ry="1.4" fill="#fb7185" opacity="0.7"/><path d="M26 25 Q29 28 32 25" stroke="#6b3410" stroke-width="1.8" fill="none" stroke-linecap="round"/><circle cx="49" cy="27" r="4" fill="#fde68a" stroke="#6b3410" stroke-width="2"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 64 38" class="w-12 h-7 pointer-events-none select-none overflow-visible"><ellipse cx="32" cy="23" rx="16" ry="11" fill="#bae6fd" stroke="#1e3a5f" stroke-width="2.2"/><ellipse cx="15" cy="22" rx="5" ry="8" transform="rotate(20 15 22)" fill="#7dd3fc" stroke="#1e3a5f" stroke-width="2"/><ellipse cx="49" cy="22" rx="5" ry="8" transform="rotate(-20 49 22)" fill="#7dd3fc" stroke="#1e3a5f" stroke-width="2"/><circle cx="26" cy="22" r="2.1" fill="#0f172a"/><circle cx="38" cy="22" r="2.1" fill="#0f172a"/><ellipse cx="32" cy="24" rx="2.5" ry="1.8" fill="#0f172a"/><circle cx="20" cy="28" r="4" fill="#e0f2fe" stroke="#1e3a5f" stroke-width="2"/></svg>`,
                bottomLeftSvg: `<svg viewBox="0 0 54 20" class="w-10 h-4 pointer-events-none select-none overflow-visible"><ellipse cx="14" cy="10" rx="7" ry="5" fill="#f59e0b" stroke="#6b3410" stroke-width="2"/><ellipse cx="30" cy="10" rx="7" ry="5" fill="#fbbf24" stroke="#6b3410" stroke-width="2"/><circle cx="12" cy="9" r="1.2" fill="#6b3410"/><circle cx="16" cy="9" r="1.2" fill="#6b3410"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 54 20" class="w-10 h-4 pointer-events-none select-none overflow-visible"><ellipse cx="24" cy="10" rx="7" ry="5" fill="#bae6fd" stroke="#1e3a5f" stroke-width="2"/><ellipse cx="40" cy="10" rx="7" ry="5" fill="#7dd3fc" stroke="#1e3a5f" stroke-width="2"/></svg>`
            },
            'tepuk_jidat': {
                id: 'tepuk_jidat',
                name: 'Tepuk jidat',
                bg: '#ffffff',
                border: '#1f2937',
                topBar: '#18181b',
                textColor: '#111827',
                metaColor: '#4b5563',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 52 38" class="w-11 h-7 pointer-events-none select-none overflow-visible"><circle cx="24" cy="22" r="14" fill="#ffffff" stroke="#18181b" stroke-width="2.3"/><path d="M11 18 Q24 8 37 18" fill="#18181b"/><path d="M14 23 Q22 17 28 22" fill="#ffffff" stroke="#18181b" stroke-width="2" stroke-linecap="round"/><line x1="30" y1="21" x2="35" y2="21" stroke="#18181b" stroke-width="2.2" stroke-linecap="round"/><line x1="39" y1="14" x2="39" y2="22" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 40 24" class="w-8 h-5 pointer-events-none select-none overflow-visible"><path d="M8 18 Q20 4 32 16 Z" fill="#ffffff" stroke="#18181b" stroke-width="2.2"/></svg>`
            },
            'pepe_hati': {
                id: 'pepe_hati',
                name: 'Pepe hati',
                bg: '#f3c1d3',
                border: '#5e233b',
                textColor: '#2d0f1b',
                metaColor: '#6b2843',
                isLight: true,
                topRightSvg: `<svg viewBox="0 0 36 32" class="w-7 h-6 pointer-events-none select-none overflow-visible"><path d="M18 28 C18 28 5 19 5 10 C5 5 9 2 14 2 C16.5 2 18 4 18 4 C18 4 19.5 2 22 2 C27 2 31 5 31 10 C31 19 18 28 18 28 Z" fill="#e11d48" stroke="#4c0519" stroke-width="2"/></svg>`,
                bottomLeftSvg: `<svg viewBox="0 0 56 38" class="w-11 h-7 pointer-events-none select-none overflow-visible"><ellipse cx="24" cy="23" rx="16" ry="12" fill="#65a30d" stroke="#1a2e05" stroke-width="2.2"/><circle cx="18" cy="12" r="5.5" fill="#65a30d" stroke="#1a2e05" stroke-width="2"/><circle cx="29" cy="12" r="5.5" fill="#65a30d" stroke="#1a2e05" stroke-width="2"/><circle cx="18" cy="12" r="3" fill="#ffffff"/><circle cx="29" cy="12" r="3" fill="#ffffff"/><circle cx="19" cy="12" r="1.5" fill="#000"/><circle cx="30" cy="12" r="1.5" fill="#000"/><path d="M14 24 Q24 29 33 24" stroke="#dc2626" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M40 28 C40 28 33 22 33 17 C33 14 35 12 38 12 C39.5 12 40 13.5 40 13.5 C40 13.5 40.5 12 42 12 C45 12 47 14 47 17 C47 22 40 28 40 28 Z" fill="#fb7185" stroke="#881337" stroke-width="1.8"/></svg>`
            },
            'babi_hiu': {
                id: 'babi_hiu',
                name: 'Babi dan hiu',
                bg: '#dceeff',
                border: '#34506b',
                textColor: '#102438',
                metaColor: '#34506b',
                isLight: true,
                bottomLeftSvg: `<svg viewBox="0 0 54 32" class="w-11 h-6 pointer-events-none select-none overflow-visible"><ellipse cx="26" cy="19" rx="16" ry="10" fill="#f9a8d4" stroke="#831843" stroke-width="2"/><polygon points="15,12 12,4 21,9" fill="#f472b6" stroke="#831843" stroke-width="1.8"/><polygon points="34,12 37,4 28,9" fill="#f472b6" stroke="#831843" stroke-width="1.8"/><ellipse cx="25" cy="20" rx="5.5" ry="3.8" fill="#f472b6" stroke="#831843" stroke-width="1.6"/><circle cx="23.5" cy="20" r="1" fill="#831843"/><circle cx="26.5" cy="20" r="1" fill="#831843"/><circle cx="18" cy="16" r="1.6" fill="#1f2937"/><circle cx="32" cy="16" r="1.6" fill="#1f2937"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 56 34" class="w-11 h-6 pointer-events-none select-none overflow-visible"><path d="M8 24 Q20 8 38 18 L48 10 L45 24 L50 28 L36 25 Q22 29 8 24 Z" fill="#60a5fa" stroke="#1e3a8a" stroke-width="2" stroke-linejoin="round"/><path d="M24 14 L28 4 L33 15 Z" fill="#60a5fa" stroke="#1e3a8a" stroke-width="2"/><path d="M12 24 Q22 21 32 25" fill="#eff6ff"/><circle cx="17" cy="19" r="1.8" fill="#0f172a"/></svg>`
            },
            'beruang_melet': {
                id: 'beruang_melet',
                name: 'Beruang melet',
                bg: '#ffd4e0',
                border: '#8c2246',
                bottomBar: '#e85d88',
                textColor: '#2e0b17',
                metaColor: '#8c2246',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 56 44" class="w-11 h-8 pointer-events-none select-none overflow-visible"><circle cx="14" cy="12" r="6" fill="#92400e" stroke="#451a03" stroke-width="2.2"/><circle cx="38" cy="12" r="6" fill="#92400e" stroke="#451a03" stroke-width="2.2"/><ellipse cx="26" cy="24" rx="16" ry="14" fill="#b45309" stroke="#451a03" stroke-width="2.2"/><ellipse cx="26" cy="26" rx="7" ry="5.5" fill="#fde68a"/><circle cx="20" cy="20" r="2.2" fill="#1c1917"/><circle cx="32" cy="20" r="2.2" fill="#1c1917"/><ellipse cx="26" cy="24" rx="2.5" ry="1.8" fill="#451a03"/><path d="M23 29 Q26 36 29 29 Z" fill="#fb7185" stroke="#881337" stroke-width="1.6"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 36 18" class="w-7 h-3.5 pointer-events-none select-none"><circle cx="24" cy="9" r="6" fill="#b45309" stroke="#451a03" stroke-width="2"/></svg>`
            },
            'doge': {
                id: 'doge',
                name: 'Doge',
                bg: '#fae29c',
                border: '#784e14',
                textColor: '#291903',
                metaColor: '#784e14',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 44" class="w-12 h-8 pointer-events-none select-none overflow-visible"><polygon points="14,16 11,4 22,11" fill="#d97706" stroke="#451a03" stroke-width="2"/><polygon points="36,16 39,4 28,11" fill="#d97706" stroke="#451a03" stroke-width="2"/><ellipse cx="25" cy="23" rx="15" ry="13" fill="#f59e0b" stroke="#451a03" stroke-width="2.2"/><ellipse cx="25" cy="26" rx="10" ry="7" fill="#fef3c7"/><circle cx="20" cy="20" r="2" fill="#1c1917"/><circle cx="30" cy="20" r="2" fill="#1c1917"/><ellipse cx="25" cy="24" rx="2.5" ry="1.8" fill="#1c1917"/><path d="M21 28 Q25 31 29 28" stroke="#451a03" stroke-width="1.8" fill="none"/><rect x="40" y="16" width="10" height="14" rx="4" fill="#fbbf24" stroke="#451a03" stroke-width="2"/><path d="M43 16 L43 10 Q46 8 48 12 L48 16 Z" fill="#fbbf24" stroke="#451a03" stroke-width="2"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 44 28" class="w-9 h-5 pointer-events-none select-none overflow-visible"><polygon points="12,20 15,6 24,18" fill="#f59e0b" stroke="#451a03" stroke-width="2"/><polygon points="26,20 31,6 38,18" fill="#f59e0b" stroke="#451a03" stroke-width="2"/></svg>`
            },
            'katak_ayam': {
                id: 'katak_ayam',
                name: 'Katak dan anak ayam',
                bg: '#8be0e8',
                border: '#1c5a63',
                textColor: '#09282e',
                metaColor: '#1c5a63',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 48 32" class="w-10 h-6 pointer-events-none select-none overflow-visible"><ellipse cx="24" cy="20" rx="14" ry="9" fill="#4ade80" stroke="#14532d" stroke-width="2"/><circle cx="17" cy="11" r="4.5" fill="#4ade80" stroke="#14532d" stroke-width="2"/><circle cx="31" cy="11" r="4.5" fill="#4ade80" stroke="#14532d" stroke-width="2"/><circle cx="17" cy="11" r="2" fill="#000"/><circle cx="31" cy="11" r="2" fill="#000"/><path d="M20 21 Q24 24 28 21" stroke="#14532d" stroke-width="1.8" fill="none"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 44 32" class="w-9 h-6 pointer-events-none select-none overflow-visible"><circle cx="22" cy="19" r="10" fill="#facc15" stroke="#713f12" stroke-width="2"/><circle cx="18" cy="17" r="1.6" fill="#000"/><circle cx="26" cy="17" r="1.6" fill="#000"/><polygon points="22,19 19,22 25,22" fill="#f97316"/></svg>`
            },
            'anjing_lapar': {
                id: 'anjing_lapar',
                name: 'Anjing lapar',
                bg: '#d9534f',
                border: '#571815',
                textColor: '#ffffff',
                metaColor: '#fee2e2',
                isLight: false,
                topLeftSvg: `<svg viewBox="0 0 56 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><ellipse cx="22" cy="22" rx="15" ry="13" fill="#fbbf24" stroke="#451a03" stroke-width="2.2"/><ellipse cx="11" cy="22" rx="5" ry="9" fill="#d97706" stroke="#451a03" stroke-width="2"/><circle cx="24" cy="17" r="2.2" fill="#000"/><path d="M26 22 L38 18 L34 29 L26 27 Z" fill="#ffffff" stroke="#451a03" stroke-width="1.8"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 36 28" class="w-7 h-5 pointer-events-none select-none overflow-visible"><path d="M10 22 Q22 4 30 12 Q26 22 14 24 Z" fill="#fbbf24" stroke="#451a03" stroke-width="2"/></svg>`
            },
            'dino': {
                id: 'dino',
                name: 'Dino',
                bg: '#9ce0f5',
                border: '#205266',
                textColor: '#0c2936',
                metaColor: '#205266',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 56 38" class="w-11 h-7 pointer-events-none select-none overflow-visible"><path d="M10 30 L10 14 Q10 6 22 6 L36 6 Q42 6 42 13 L30 16 L40 22 L26 26 Z" fill="#38bdf8" stroke="#0c4a6e" stroke-width="2.2" stroke-linejoin="round"/><polygon points="28,15 30,19 32,15" fill="#fff"/><polygon points="33,15 35,19 37,15" fill="#fff"/><circle cx="20" cy="11" r="2.2" fill="#0f172a"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 44 24" class="w-9 h-5 pointer-events-none select-none overflow-visible"><path d="M6 16 L28 16 L38 6 L34 20 L6 20 Z" fill="#38bdf8" stroke="#0c4a6e" stroke-width="2" stroke-linejoin="round"/></svg>`
            },
            'dachshund': {
                id: 'dachshund',
                name: 'Dachshund',
                bg: '#8c583a',
                border: '#3b1f0e',
                textColor: '#ffffff',
                metaColor: '#fde68a',
                isLight: false,
                topLeftSvg: `<svg viewBox="0 0 58 38" class="w-12 h-7 pointer-events-none select-none overflow-visible"><ellipse cx="28" cy="20" rx="14" ry="11" fill="#78350f" stroke="#291002" stroke-width="2.2"/><ellipse cx="14" cy="21" rx="9" ry="5.5" fill="#78350f" stroke="#291002" stroke-width="2"/><circle cx="7" cy="20" r="2.5" fill="#000"/><ellipse cx="33" cy="24" rx="5.5" ry="9" fill="#451a03" stroke="#291002" stroke-width="2"/><circle cx="23" cy="17" r="2" fill="#000"/></svg>`,
                bottomLeftSvg: `<svg viewBox="0 0 40 16" class="w-8 h-3.5 pointer-events-none select-none"><ellipse cx="16" cy="8" rx="6" ry="4.5" fill="#78350f" stroke="#291002" stroke-width="2"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 48 22" class="w-9 h-4 pointer-events-none select-none overflow-visible"><ellipse cx="18" cy="14" rx="6" ry="4.5" fill="#78350f" stroke="#291002" stroke-width="2"/><path d="M28 14 Q38 4 42 8" stroke="#78350f" stroke-width="4.5" stroke-linecap="round" fill="none"/></svg>`
            },
            'katak_lapar': {
                id: 'katak_lapar',
                name: 'Katak lapar',
                bg: '#eef5db',
                border: '#5c4023',
                bottomBar: '#8c6239',
                textColor: '#1f2912',
                metaColor: '#5c4023',
                isLight: true,
                bottomLeftSvg: `<svg viewBox="0 0 54 36" class="w-11 h-7 pointer-events-none select-none overflow-visible"><ellipse cx="24" cy="22" rx="15" ry="11" fill="#65a30d" stroke="#1a2e05" stroke-width="2.2"/><circle cx="17" cy="11" r="4.5" fill="#65a30d" stroke="#1a2e05" stroke-width="2"/><circle cx="29" cy="11" r="4.5" fill="#65a30d" stroke="#1a2e05" stroke-width="2"/><circle cx="17" cy="11" r="2" fill="#000"/><circle cx="29" cy="11" r="2" fill="#000"/><path d="M18 22 Q24 26 30 22" stroke="#1a2e05" stroke-width="2" fill="none"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 36 26" class="w-7 h-5 pointer-events-none select-none overflow-visible"><path d="M18 22 Q18 10 28 8 Q26 18 18 22 Z" fill="#84cc16" stroke="#1a2e05" stroke-width="1.8"/></svg>`
            },
            'screamer': {
                id: 'screamer',
                name: 'Screamer',
                bg: '#ff9e85',
                border: '#692414',
                textColor: '#2b0b04',
                metaColor: '#692414',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 52 44" class="w-10 h-8 pointer-events-none select-none overflow-visible"><ellipse cx="24" cy="24" rx="15" ry="14" fill="#ff9e85" stroke="#692414" stroke-width="2.2"/><ellipse cx="18" cy="26" rx="6" ry="9" fill="#450a0a" stroke="#692414" stroke-width="1.8"/><path d="M14 20 L22 20" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/><path d="M14 31 L22 31" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/><circle cx="26" cy="15" r="2.2" fill="#000"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 42 36" class="w-8 h-7 pointer-events-none select-none overflow-visible"><path d="M6 18 L26 6 L22 18 L28 28 Z" fill="#ff9e85" stroke="#692414" stroke-width="2.2" stroke-linejoin="round"/></svg>`
            },
            'panda_bambu': {
                id: 'panda_bambu',
                name: 'Panda bambu',
                bg: '#d8f3dc',
                border: '#1b4332',
                bottomBar: '#40916c',
                textColor: '#081c15',
                metaColor: '#1b4332',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 58 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><circle cx="14" cy="11" r="6" fill="#18181b"/><circle cx="38" cy="11" r="6" fill="#18181b"/><ellipse cx="26" cy="23" rx="16" ry="13" fill="#ffffff" stroke="#18181b" stroke-width="2.2"/><ellipse cx="19" cy="21" rx="4.5" ry="3.5" transform="rotate(-15 19 21)" fill="#18181b"/><ellipse cx="33" cy="21" rx="4.5" ry="3.5" transform="rotate(15 33 21)" fill="#18181b"/><circle cx="19.5" cy="20.5" r="1.4" fill="#ffffff"/><circle cx="32.5" cy="20.5" r="1.4" fill="#ffffff"/><ellipse cx="26" cy="25" rx="2.5" ry="1.8" fill="#18181b"/><ellipse cx="14" cy="25" rx="2.8" ry="1.5" fill="#fb7185" opacity="0.75"/><ellipse cx="38" cy="25" rx="2.8" ry="1.5" fill="#fb7185" opacity="0.75"/><rect x="44" y="8" width="5" height="24" rx="2" fill="#2d6a4f" stroke="#081c15" stroke-width="1.6"/><line x1="44" y1="16" x2="49" y2="16" stroke="#d8f3dc" stroke-width="1.5"/><line x1="44" y1="24" x2="49" y2="24" stroke="#d8f3dc" stroke-width="1.5"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 42 18" class="w-8 h-3.5 pointer-events-none select-none"><ellipse cx="14" cy="9" rx="6.5" ry="4.5" fill="#18181b"/><ellipse cx="28" cy="9" rx="6.5" ry="4.5" fill="#18181b"/><circle cx="14" cy="9" r="2" fill="#f472b6"/><circle cx="28" cy="9" r="2" fill="#f472b6"/></svg>`
            },
            'kelinci_wortel': {
                id: 'kelinci_wortel',
                name: 'Kelinci wortel',
                bg: '#ffe5d9',
                border: '#7f2b16',
                wavyBorder: true,
                textColor: '#3b1106',
                metaColor: '#7f2b16',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 46" class="w-12 h-8 pointer-events-none select-none overflow-visible"><ellipse cx="19" cy="12" rx="4.5" ry="11" transform="rotate(-10 19 12)" fill="#ffffff" stroke="#7f2b16" stroke-width="2"/><ellipse cx="19" cy="13" rx="2.2" ry="7" transform="rotate(-10 19 13)" fill="#fbcfe8"/><ellipse cx="31" cy="12" rx="4.5" ry="11" transform="rotate(10 31 12)" fill="#ffffff" stroke="#7f2b16" stroke-width="2"/><ellipse cx="31" cy="13" rx="2.2" ry="7" transform="rotate(10 31 13)" fill="#fbcfe8"/><ellipse cx="25" cy="28" rx="15" ry="12" fill="#ffffff" stroke="#7f2b16" stroke-width="2.2"/><circle cx="19" cy="26" r="2" fill="#291002"/><circle cx="31" cy="26" r="2" fill="#291002"/><ellipse cx="25" cy="29" rx="2.2" ry="1.5" fill="#fb7185"/><polygon points="36,32 52,22 48,35" fill="#f97316" stroke="#7f2b16" stroke-width="1.8" stroke-linejoin="round"/><path d="M50 24 L56 19 M51 27 L57 25" stroke="#16a34a" stroke-width="2.2" stroke-linecap="round"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 36 22" class="w-7 h-4 pointer-events-none select-none overflow-visible"><circle cx="22" cy="11" r="7" fill="#ffffff" stroke="#7f2b16" stroke-width="2"/></svg>`
            },
            'rubah_salju': {
                id: 'rubah_salju',
                name: 'Rubah salju',
                bg: '#ffedd5',
                border: '#7c2d12',
                bottomBar: '#ea580c',
                textColor: '#2a0f04',
                metaColor: '#7c2d12',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 58 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><polygon points="10,22 12,5 24,15" fill="#ea580c" stroke="#431407" stroke-width="2" stroke-linejoin="round"/><polygon points="42,22 40,5 28,15" fill="#ea580c" stroke="#431407" stroke-width="2" stroke-linejoin="round"/><ellipse cx="26" cy="24" rx="16" ry="12" fill="#f97316" stroke="#431407" stroke-width="2.2"/><path d="M12 25 Q26 36 40 25 Q33 21 26 28 Q19 21 12 25 Z" fill="#ffffff"/><circle cx="19" cy="21" r="2" fill="#1c1917"/><circle cx="33" cy="21" r="2" fill="#1c1917"/><circle cx="26" cy="27" r="2.3" fill="#1c1917"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 52 28" class="w-10 h-5 pointer-events-none select-none overflow-visible"><path d="M8 20 Q24 4 44 10 Q40 24 20 24 Z" fill="#f97316" stroke="#431407" stroke-width="2"/><path d="M32 8 Q44 10 41 18 Q34 17 32 8 Z" fill="#ffffff"/></svg>`
            },
            'koala_tidur': {
                id: 'koala_tidur',
                name: 'Koala mengantuk',
                bg: '#e2e8f0',
                border: '#334155',
                topBar: '#64748b',
                textColor: '#0f172a',
                metaColor: '#334155',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 42" class="w-12 h-8 pointer-events-none select-none overflow-visible"><circle cx="11" cy="16" r="8" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/><circle cx="11" cy="16" r="4.5" fill="#f1f5f9"/><circle cx="41" cy="16" r="8" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/><circle cx="41" cy="16" r="4.5" fill="#f1f5f9"/><ellipse cx="26" cy="24" rx="15" ry="12" fill="#cbd5e1" stroke="#1e293b" stroke-width="2.2"/><path d="M17 22 Q20 25 23 22" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M29 22 Q32 25 35 22" stroke="#1e293b" stroke-width="2" fill="none" stroke-linecap="round"/><ellipse cx="26" cy="24" rx="3.5" ry="5" fill="#334155"/><text x="45" y="14" fill="#2563eb" font-size="10" font-weight="900">Zzz</text></svg>`,
                bottomLeftSvg: `<svg viewBox="0 0 38 16" class="w-7 h-3.5 pointer-events-none select-none"><ellipse cx="14" cy="8" rx="6" ry="4.5" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/><ellipse cx="26" cy="8" rx="6" ry="4.5" fill="#94a3b8" stroke="#1e293b" stroke-width="2"/></svg>`
            },
            'pinguin_es': {
                id: 'pinguin_es',
                name: 'Pinguin es',
                bg: '#dff6ff',
                border: '#075985',
                bottomBar: '#38bdf8',
                textColor: '#082f49',
                metaColor: '#075985',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 54 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><ellipse cx="26" cy="24" rx="15" ry="13" fill="#1e293b" stroke="#0f172a" stroke-width="2.2"/><ellipse cx="26" cy="26" rx="11" ry="9.5" fill="#ffffff"/><circle cx="21" cy="21" r="2" fill="#0f172a"/><circle cx="31" cy="21" r="2" fill="#0f172a"/><polygon points="26,22 22,26 30,26" fill="#f59e0b"/><ellipse cx="17" cy="24" rx="2.5" ry="1.4" fill="#fb7185" opacity="0.8"/><ellipse cx="35" cy="24" rx="2.5" ry="1.4" fill="#fb7185" opacity="0.8"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 42 20" class="w-8 h-4 pointer-events-none select-none"><ellipse cx="14" cy="11" rx="6" ry="4" fill="#f59e0b" stroke="#78350f" stroke-width="1.8"/><ellipse cx="28" cy="11" rx="6" ry="4" fill="#f59e0b" stroke="#78350f" stroke-width="1.8"/></svg>`
            },
            'hamster_pipi': {
                id: 'hamster_pipi',
                name: 'Hamster kuaci',
                bg: '#fef9c3',
                border: '#854d0e',
                wavyBorder: true,
                textColor: '#3f2305',
                metaColor: '#854d0e',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 42" class="w-12 h-8 pointer-events-none select-none overflow-visible"><circle cx="14" cy="12" r="5.5" fill="#f59e0b" stroke="#78350f" stroke-width="2"/><circle cx="38" cy="12" r="5.5" fill="#f59e0b" stroke="#78350f" stroke-width="2"/><ellipse cx="26" cy="24" rx="17" ry="12" fill="#fcd34d" stroke="#78350f" stroke-width="2.2"/><circle cx="15" cy="26" r="7" fill="#fef3c7" stroke="#78350f" stroke-width="1.8"/><circle cx="37" cy="26" r="7" fill="#fef3c7" stroke="#78350f" stroke-width="1.8"/><circle cx="21" cy="20" r="2" fill="#1c1917"/><circle cx="31" cy="20" r="2" fill="#1c1917"/><ellipse cx="26" cy="25" rx="3" ry="4.5" fill="#451a03" stroke="#ffffff" stroke-width="1.2"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 38 16" class="w-7 h-3.5 pointer-events-none select-none"><ellipse cx="14" cy="8" rx="5.5" ry="4" fill="#fde68a" stroke="#78350f" stroke-width="1.8"/><ellipse cx="26" cy="8" rx="5.5" ry="4" fill="#fde68a" stroke="#78350f" stroke-width="1.8"/></svg>`
            },
            'naga_api': {
                id: 'naga_api',
                name: 'Naga api',
                bg: '#450a0a',
                border: '#f59e0b',
                bottomBar: '#dc2626',
                textColor: '#fef2f2',
                metaColor: '#fde68a',
                isLight: false,
                topLeftSvg: `<svg viewBox="0 0 62 44" class="w-12 h-8 pointer-events-none select-none overflow-visible"><polygon points="15,14 10,2 21,11" fill="#fbbf24" stroke="#78350f" stroke-width="1.8"/><polygon points="35,14 40,2 29,11" fill="#fbbf24" stroke="#78350f" stroke-width="1.8"/><ellipse cx="25" cy="24" rx="15" ry="12" fill="#dc2626" stroke="#fbbf24" stroke-width="2.2"/><circle cx="20" cy="21" r="2.2" fill="#fef08a"/><circle cx="30" cy="21" r="2.2" fill="#fef08a"/><path d="M40 22 Q52 14 58 22 Q50 30 40 25 Z" fill="#f97316" stroke="#fde047" stroke-width="1.8"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 48 26" class="w-9 h-5 pointer-events-none select-none overflow-visible"><path d="M6 18 Q22 18 34 8 L42 6 L38 16 L32 14 Q22 22 6 22 Z" fill="#dc2626" stroke="#fbbf24" stroke-width="1.8"/></svg>`
            },
            'kucing_hitam': {
                id: 'kucing_hitam',
                name: 'Kucing hitam',
                bg: '#2e1065',
                border: '#c084fc',
                bottomBar: '#581c87',
                textColor: '#faf5ff',
                metaColor: '#e9d5ff',
                isLight: false,
                topLeftSvg: `<svg viewBox="0 0 58 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><polygon points="12,20 12,4 24,14" fill="#18181b" stroke="#c084fc" stroke-width="2"/><polygon points="40,20 40,4 28,14" fill="#18181b" stroke="#c084fc" stroke-width="2"/><ellipse cx="26" cy="24" rx="15" ry="12" fill="#18181b" stroke="#c084fc" stroke-width="2.2"/><ellipse cx="20" cy="22" rx="3.5" ry="3" fill="#facc15"/><ellipse cx="32" cy="22" rx="3.5" ry="3" fill="#facc15"/><ellipse cx="20" cy="22" rx="1.2" ry="2.6" fill="#000"/><ellipse cx="32" cy="22" rx="1.2" ry="2.6" fill="#000"/><polygon points="26,25 24,28 28,28" fill="#f472b6"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 46 26" class="w-9 h-5 pointer-events-none select-none overflow-visible"><path d="M8 20 Q28 22 36 6" stroke="#18181b" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M8 20 Q28 22 36 6" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>`
            },
            'axolotl_pink': {
                id: 'axolotl_pink',
                name: 'Axolotl pink',
                bg: '#fce7f3',
                border: '#9d174d',
                textColor: '#500724',
                metaColor: '#9d174d',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 62 42" class="w-12 h-8 pointer-events-none select-none overflow-visible"><path d="M12 16 L4 9 M11 22 L3 20 M12 28 L5 30" stroke="#ec4899" stroke-width="3.5" stroke-linecap="round"/><path d="M44 16 L52 9 M45 22 L53 20 M44 28 L51 30" stroke="#ec4899" stroke-width="3.5" stroke-linecap="round"/><ellipse cx="28" cy="24" rx="16" ry="12" fill="#f9a8d4" stroke="#9d174d" stroke-width="2.2"/><circle cx="21" cy="22" r="2" fill="#1f2937"/><circle cx="35" cy="22" r="2" fill="#1f2937"/><path d="M24 26 Q28 29 32 26" stroke="#9d174d" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 36 30" class="w-7 h-6 pointer-events-none select-none overflow-visible"><circle cx="14" cy="18" r="5" fill="#bae6fd" stroke="#0284c7" stroke-width="1.6"/><circle cx="24" cy="10" r="3.5" fill="#bae6fd" stroke="#0284c7" stroke-width="1.5"/></svg>`
            },
            'burung_hantu': {
                id: 'burung_hantu',
                name: 'Burung hantu',
                bg: '#1e1b4b',
                border: '#818cf8',
                topBar: '#312e81',
                textColor: '#eef2ff',
                metaColor: '#c7d2fe',
                isLight: false,
                topLeftSvg: `<svg viewBox="0 0 58 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><ellipse cx="26" cy="23" rx="16" ry="13" fill="#78350f" stroke="#fde68a" stroke-width="2"/><circle cx="19" cy="21" r="6" fill="#fef3c7" stroke="#451a03" stroke-width="1.8"/><circle cx="33" cy="21" r="6" fill="#fef3c7" stroke="#451a03" stroke-width="1.8"/><circle cx="19" cy="21" r="3" fill="#0f172a"/><circle cx="33" cy="21" r="3" fill="#0f172a"/><polygon points="26,23 23,28 29,28" fill="#f59e0b"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 36 30" class="w-7 h-6 pointer-events-none select-none overflow-visible"><polygon points="18,4 21,12 29,12 22,17 25,25 18,20 11,25 14,17 7,12 15,12" fill="#facc15" stroke="#ca8a04" stroke-width="1.5"/></svg>`
            },
            'harimau_belang': {
                id: 'harimau_belang',
                name: 'Harimau kecil',
                bg: '#fed7aa',
                border: '#7c2d12',
                bottomBar: '#ea580c',
                textColor: '#290d02',
                metaColor: '#7c2d12',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 58 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><circle cx="13" cy="12" r="5.5" fill="#f97316" stroke="#1c1917" stroke-width="2"/><circle cx="39" cy="12" r="5.5" fill="#f97316" stroke="#1c1917" stroke-width="2"/><ellipse cx="26" cy="24" rx="16" ry="12" fill="#fb923c" stroke="#1c1917" stroke-width="2.2"/><line x1="26" y1="12" x2="26" y2="18" stroke="#1c1917" stroke-width="2.5" stroke-linecap="round"/><line x1="12" y1="22" x2="17" y2="22" stroke="#1c1917" stroke-width="2.2" stroke-linecap="round"/><line x1="35" y1="22" x2="40" y2="22" stroke="#1c1917" stroke-width="2.2" stroke-linecap="round"/><circle cx="20" cy="21" r="2" fill="#1c1917"/><circle cx="32" cy="21" r="2" fill="#1c1917"/><ellipse cx="26" cy="26" rx="6" ry="4.5" fill="#fff7ed"/><polygon points="26,24 23,27 29,27" fill="#fb7185"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 40 18" class="w-8 h-3.5 pointer-events-none select-none"><ellipse cx="14" cy="9" rx="6" ry="4.5" fill="#fb923c" stroke="#1c1917" stroke-width="2"/><ellipse cx="28" cy="9" rx="6" ry="4.5" fill="#fb923c" stroke="#1c1917" stroke-width="2"/></svg>`
            },
            'bebek_kuning': {
                id: 'bebek_kuning',
                name: 'Bebek karet',
                bg: '#fef08a',
                border: '#854d0e',
                bottomBar: '#38bdf8',
                textColor: '#3b2104',
                metaColor: '#713f12',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 56 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><path d="M23 11 Q26 4 30 9" stroke="#facc15" stroke-width="3" fill="none" stroke-linecap="round"/><ellipse cx="26" cy="24" rx="15" ry="12" fill="#facc15" stroke="#854d0e" stroke-width="2.2"/><circle cx="20" cy="21" r="2" fill="#0f172a"/><circle cx="32" cy="21" r="2" fill="#0f172a"/><ellipse cx="26" cy="26" rx="6.5" ry="3.5" fill="#f97316" stroke="#7c2d12" stroke-width="1.8"/></svg>`,
                topRightSvg: `<svg viewBox="0 0 42 32" class="w-8 h-6 pointer-events-none select-none overflow-visible"><circle cx="20" cy="19" r="9" fill="#fde047" stroke="#854d0e" stroke-width="1.8"/><circle cx="17" cy="17" r="1.5" fill="#000"/><polygon points="24,18 32,20 24,22" fill="#f97316"/></svg>`
            },
            'gurita_laut': {
                id: 'gurita_laut',
                name: 'Gurita laut',
                bg: '#f3e8ff',
                border: '#6b21a8',
                wavyBorder: true,
                textColor: '#2e1065',
                metaColor: '#6b21a8',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 56 42" class="w-11 h-8 pointer-events-none select-none overflow-visible"><ellipse cx="26" cy="22" rx="15" ry="13" fill="#c084fc" stroke="#581c87" stroke-width="2.2"/><circle cx="20" cy="21" r="2.2" fill="#1e1b4b"/><circle cx="32" cy="21" r="2.2" fill="#1e1b4b"/><circle cx="26" cy="26" r="3" fill="#581c87"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 52 24" class="w-10 h-4.5 pointer-events-none select-none overflow-visible"><path d="M8 18 Q16 4 24 18 Q32 4 40 18" stroke="#c084fc" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M8 18 Q16 4 24 18 Q32 4 40 18" stroke="#581c87" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`
            },
            'rusa_bambi': {
                id: 'rusa_bambi',
                name: 'Rusa hutan',
                bg: '#f5ebe0',
                border: '#582f0e',
                bottomBar: '#7f4f24',
                textColor: '#2b1605',
                metaColor: '#582f0e',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 44" class="w-12 h-8 pointer-events-none select-none overflow-visible"><path d="M18 14 L13 4 M15 8 L10 9 M34 14 L39 4 M37 8 L42 9" stroke="#78350f" stroke-width="2.6" stroke-linecap="round"/><ellipse cx="26" cy="25" rx="15" ry="12" fill="#b45309" stroke="#451a03" stroke-width="2.2"/><circle cx="18" cy="19" r="1.6" fill="#ffffff"/><circle cx="34" cy="19" r="1.6" fill="#ffffff"/><circle cx="20" cy="24" r="2" fill="#1c1917"/><circle cx="32" cy="24" r="2" fill="#1c1917"/><ellipse cx="26" cy="27" rx="3" ry="2" fill="#1c1917"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 38 24" class="w-7 h-4.5 pointer-events-none select-none overflow-visible"><path d="M12 18 Q18 6 30 8 Q26 20 12 18 Z" fill="#22c55e" stroke="#14532d" stroke-width="1.8"/></svg>`
            },
            'unicorn_pelangi': {
                id: 'unicorn_pelangi',
                name: 'Unicorn pelangi',
                bg: '#fdf4ff',
                border: '#86198f',
                wavyBorder: true,
                textColor: '#3b0764',
                metaColor: '#86198f',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 46" class="w-12 h-8 pointer-events-none select-none overflow-visible"><polygon points="26,2 21,16 31,16" fill="#facc15" stroke="#854d0e" stroke-width="1.8"/><ellipse cx="26" cy="27" rx="15" ry="12" fill="#ffffff" stroke="#86198f" stroke-width="2.2"/><path d="M11 22 Q6 16 14 14" stroke="#ec4899" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M41 22 Q46 16 38 14" stroke="#38bdf8" stroke-width="3.5" fill="none" stroke-linecap="round"/><circle cx="20" cy="25" r="2" fill="#3b0764"/><circle cx="32" cy="25" r="2" fill="#3b0764"/><ellipse cx="16" cy="28" rx="2.5" ry="1.4" fill="#f472b6"/><ellipse cx="36" cy="28" rx="2.5" ry="1.4" fill="#f472b6"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 46 24" class="w-9 h-4.5 pointer-events-none select-none overflow-visible"><path d="M8 18 Q24 4 40 18" stroke="#ec4899" stroke-width="3" fill="none"/><path d="M11 19 Q24 8 37 19" stroke="#facc15" stroke-width="3" fill="none"/><path d="M14 20 Q24 12 34 20" stroke="#38bdf8" stroke-width="3" fill="none"/></svg>`
            },
            'monyet_pisang': {
                id: 'monyet_pisang',
                name: 'Monyet pisang',
                bg: '#fef3c7',
                border: '#78350f',
                bottomBar: '#d97706',
                textColor: '#291002',
                metaColor: '#78350f',
                isLight: true,
                topLeftSvg: `<svg viewBox="0 0 60 42" class="w-12 h-8 pointer-events-none select-none overflow-visible"><circle cx="10" cy="22" r="5.5" fill="#92400e" stroke="#451a03" stroke-width="2"/><circle cx="10" cy="22" r="3" fill="#fde68a"/><circle cx="42" cy="22" r="5.5" fill="#92400e" stroke="#451a03" stroke-width="2"/><circle cx="42" cy="22" r="3" fill="#fde68a"/><ellipse cx="26" cy="23" rx="14" ry="12" fill="#92400e" stroke="#451a03" stroke-width="2.2"/><ellipse cx="26" cy="25" rx="10" ry="8" fill="#fde68a"/><circle cx="21" cy="21" r="2" fill="#1c1917"/><circle cx="31" cy="21" r="2" fill="#1c1917"/><path d="M22 27 Q26 30 30 27" stroke="#451a03" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M45 28 Q54 24 52 12 Q47 20 42 25 Z" fill="#facc15" stroke="#713f12" stroke-width="1.6"/></svg>`,
                bottomRightSvg: `<svg viewBox="0 0 44 24" class="w-8 h-4.5 pointer-events-none select-none overflow-visible"><path d="M8 18 Q28 20 34 8 Q38 4 32 4" stroke="#92400e" stroke-width="3.5" fill="none" stroke-linecap="round"/></svg>`
            }
        },

        getChatBubbleStyle(bubbleId) {
            var key = String(bubbleId || 'default').trim().toLowerCase();
            if (!key || key === 'none') key = 'default';
            return GlobalChat.CHAT_BUBBLE_STYLES[key] || GlobalChat.CHAT_BUBBLE_STYLES['default'];
        },

        // Render Mini Thumbnail for the 4-Column "Pilih gaya balon" Grid (Exact match to Screenshot)
        getChatBubbleThumbnailHtml(bubbleId) {
            var st = GlobalChat.getChatBubbleStyle(bubbleId);
            if (st.id === 'default') {
                return `
                <div class="w-[78px] h-[34px] rounded-full bg-[#1d6ff2] shadow-inner border border-blue-400/40 mx-auto my-2"></div>`;
            }
            var wavyCss = st.wavyBorder
                ? 'border: 2.5px dashed ' + st.border + '; box-shadow: 0 0 0 2px ' + st.bg + ', 0 3px 0 ' + st.border + ';'
                : 'border: 2.2px solid ' + st.border + ';' + (st.bottomBar ? (' border-bottom: 5px solid ' + st.bottomBar + ';') : '') + (st.topBar ? (' border-top: 5px solid ' + st.topBar + ';') : '');
            return `
            <div class="relative w-[80px] h-[36px] mx-auto my-2 flex items-center justify-center select-none">
                <div class="w-[74px] h-[30px] rounded-xl relative transition-transform" style="background: ${st.bg}; ${wavyCss}"></div>
                ${st.topLeftSvg ? `<div class="absolute -top-2.5 -left-1.5 scale-[0.68] origin-top-left z-10 pointer-events-none">${st.topLeftSvg}</div>` : ''}
                ${st.topRightSvg ? `<div class="absolute -top-2.5 -right-1.5 scale-[0.68] origin-top-right z-10 pointer-events-none">${st.topRightSvg}</div>` : ''}
                ${st.bottomLeftSvg ? `<div class="absolute -bottom-2 -left-1 scale-[0.68] origin-bottom-left z-10 pointer-events-none">${st.bottomLeftSvg}</div>` : ''}
                ${st.bottomRightSvg ? `<div class="absolute -bottom-2 -right-1 scale-[0.68] origin-bottom-right z-10 pointer-events-none">${st.bottomRightSvg}</div>` : ''}
            </div>`;
        },

        // Render Full Expandable Message Bubble with Character Mascots
        renderCharacterBubbleBox(bubbleId, opts) {
            opts = opts || {};
            var st = GlobalChat.getChatBubbleStyle(bubbleId);
            var isMe = Boolean(opts.isMe);
            var isPreview = Boolean(opts.isPreview);
            var contentHtml = opts.messageHtml || opts.bodyHtml || opts.innerHtml || '';

            if (!bubbleId || bubbleId === 'default' || bubbleId === 'none' || !GlobalChat.CHAT_BUBBLE_STYLES[bubbleId]) {
                if (isPreview) {
                    return `
                    <div class="relative bg-[#1d6ff2] text-white rounded-2xl px-4 py-2.5 shadow-md">
                        <div class="text-xs sm:text-[13.5px] leading-relaxed font-medium">${contentHtml}</div>
                    </div>`;
                }
                var defaultBoxClass = isMe
                    ? 'relative max-w-[85%] sm:max-w-[75%] bg-[#222834] border border-slate-700/70 text-slate-100 rounded-2xl px-4 py-2.5 shadow-md shadow-black/40'
                    : 'relative max-w-[85%] sm:max-w-[75%] bg-[#161a22] border border-slate-800 text-slate-200 rounded-2xl px-4 py-2.5 shadow-md shadow-black/40';
                return `
                <div class="${defaultBoxClass}">
                    ${contentHtml}
                </div>`;
            }

            var borderStyle = st.wavyBorder
                ? `background: ${st.bg}; border: 2.5px dashed ${st.border}; outline: 3px solid ${st.bg}; box-shadow: 0 4px 14px rgba(0,0,0,0.45); color: ${st.textColor};`
                : `background: ${st.bg}; border: 2.5px solid ${st.border}; ${st.bottomBar ? `border-bottom: 6px solid ${st.bottomBar};` : ''} ${st.topBar ? `border-top: 6px solid ${st.topBar};` : ''} box-shadow: 0 4px 14px rgba(0,0,0,0.45); color: ${st.textColor};`;

            if (isPreview) {
                return `
                <div class="relative my-2 mx-2">
                    ${st.topLeftSvg ? `<div class="absolute -top-4 -left-2.5 z-20 pointer-events-none">${st.topLeftSvg}</div>` : ''}
                    ${st.topRightSvg ? `<div class="absolute -top-4 -right-2.5 z-20 pointer-events-none">${st.topRightSvg}</div>` : ''}
                    ${st.bottomLeftSvg ? `<div class="absolute -bottom-2.5 -left-2 z-20 pointer-events-none">${st.bottomLeftSvg}</div>` : ''}
                    ${st.bottomRightSvg ? `<div class="absolute -bottom-2.5 -right-2 z-20 pointer-events-none">${st.bottomRightSvg}</div>` : ''}
                    <div class="relative z-10 rounded-2xl px-4 py-3" style="${borderStyle}">
                        <div class="text-xs sm:text-[13.5px] leading-relaxed font-semibold" style="color: ${st.textColor};">${contentHtml}</div>
                    </div>
                </div>`;
            }

            return `
            <div class="relative max-w-[85%] sm:max-w-[75%] my-1.5">
                ${st.topLeftSvg ? `<div class="absolute -top-4 -left-2.5 z-20 pointer-events-none">${st.topLeftSvg}</div>` : ''}
                ${st.topRightSvg ? `<div class="absolute -top-4 -right-2.5 z-20 pointer-events-none">${st.topRightSvg}</div>` : ''}
                ${st.bottomLeftSvg ? `<div class="absolute -bottom-2.5 -left-2 z-20 pointer-events-none">${st.bottomLeftSvg}</div>` : ''}
                ${st.bottomRightSvg ? `<div class="absolute -bottom-2.5 -right-2 z-20 pointer-events-none">${st.bottomRightSvg}</div>` : ''}
                <div class="relative z-10 rounded-2xl px-4 py-2.5" style="${borderStyle}">
                    ${contentHtml}
                </div>
            </div>`;
        },

        _isOwnedBubblesDrawerOpen: false,

        getOwnedChatBubblesList(u) {
            if (!u) u = GlobalChat.getCurrentUser() || {};
            var rawUnlocked = Array.isArray(u.unlockedDiamondChatBubbles) ? u.unlockedDiamondChatBubbles.slice() : [];
            var activeBubble = String(u.chatBubble || '').trim().toLowerCase();
            if (activeBubble && activeBubble !== 'default' && activeBubble !== 'none' && !rawUnlocked.includes(activeBubble)) {
                rawUnlocked.push(activeBubble);
            }
            var expiries = (u.diamondChatBubbleExpiries && typeof u.diamondChatBubbleExpiries === 'object') ? u.diamondChatBubbleExpiries : {};
            var items = [
                { bubbleId: 'default', name: 'Default', isPermanent: true, expiresAt: null }
            ];
            var seen = { 'default': true };
            rawUnlocked.forEach(function(idStr) {
                var cleanId = String(idStr || '').replace(/^dmcb_/, '').trim().toLowerCase();
                if (!cleanId || seen[cleanId] || !GlobalChat.CHAT_BUBBLE_STYLES[cleanId]) return;
                var expTs = expiries[cleanId] || null;
                if (expTs && Date.now() > Number(expTs)) return;
                seen[cleanId] = true;
                var st = GlobalChat.CHAT_BUBBLE_STYLES[cleanId];
                items.push({
                    bubbleId: cleanId,
                    name: st.name || cleanId,
                    isPermanent: !expTs,
                    expiresAt: expTs
                });
            });
            return items;
        },

        toggleOwnedBubblesDrawer(forceState) {
            var drawer = document.getElementById('global-chat-owned-bubbles-drawer');
            if (!drawer) return;
            if (typeof forceState === 'boolean') {
                GlobalChat._isOwnedBubblesDrawerOpen = forceState;
            } else {
                GlobalChat._isOwnedBubblesDrawerOpen = !GlobalChat._isOwnedBubblesDrawerOpen;
            }
            if (GlobalChat._isOwnedBubblesDrawerOpen) {
                GlobalChat.renderOwnedBubblesDrawer();
                drawer.classList.remove('hidden');
            } else {
                drawer.classList.add('hidden');
            }
            var topBtn = document.getElementById('global-chat-top-bubble-bag-btn');
            if (topBtn) {
                if (GlobalChat._isOwnedBubblesDrawerOpen) {
                    topBtn.classList.add('ring-2', 'ring-amber-400', 'bg-amber-500/30');
                } else {
                    topBtn.classList.remove('ring-2', 'ring-amber-400', 'bg-amber-500/30');
                }
            }
        },

        renderOwnedBubblesDrawer() {
            var drawer = document.getElementById('global-chat-owned-bubbles-drawer');
            var countEl = document.getElementById('global-chat-owned-bubbles-count');
            var u = GlobalChat.getCurrentUser() || {};
            var ownedList = GlobalChat.getOwnedChatBubblesList(u);
            var activeId = String(u.chatBubble || 'default').trim().toLowerCase() || 'default';
            if (activeId === 'none') activeId = 'default';

            if (countEl) {
                countEl.textContent = String(ownedList.length);
            }
            if (!drawer) return;

            drawer.innerHTML = `
                <div class="px-4 sm:px-6 py-3 bg-[#11141d] border-b border-amber-400/30 shadow-xl space-y-2.5 animate-fade-in">
                    <div class="flex items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                            <span class="w-6 h-6 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                                <i data-lucide="message-circle-heart" class="w-3.5 h-3.5"></i>
                            </span>
                            <div class="min-w-0">
                                <div class="text-xs font-extrabold text-white flex items-center gap-1.5">
                                    <span>Koleksi Gaya Balon Saya</span>
                                    <span class="px-1.5 py-0.2 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-black">${ownedList.length} Item</span>
                                </div>
                                <p class="text-[10px] text-slate-400 truncate">Klik item balon yang sudah kamu miliki di bawah untuk langsung mengganti gaya chat:</p>
                            </div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button type="button" onclick="GlobalChat.openBubbleStoreModal()" class="px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-pink-500 hover:from-amber-400 hover:to-pink-400 text-black font-black text-[10px] flex items-center gap-1 cursor-pointer active:scale-95 transition shadow-md">
                                <i data-lucide="shopping-bag" class="w-3 h-3"></i>
                                <span>+ Toko Balon</span>
                            </button>
                            <button type="button" onclick="GlobalChat.toggleOwnedBubblesDrawer(false)" class="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer">
                                <i data-lucide="chevron-up" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </div>

                    <div class="flex items-center gap-2.5 overflow-x-auto pb-1 pt-0.5 hide-scrollbar">
                        ${ownedList.map(function(item) {
                            var isEquipped = (activeId === item.bubbleId);
                            var durLabel = 'Permanen';
                            if (item.expiresAt) {
                                var remDays = Math.max(1, Math.ceil((Number(item.expiresAt) - Date.now()) / (24 * 60 * 60 * 1000)));
                                durLabel = remDays + ' Hari';
                            }
                            return `
                            <div onclick="GlobalChat.equipOwnedChatBubble('${GlobalChat.escapeJs(item.bubbleId)}')" class="shrink-0 w-[104px] p-2 rounded-2xl flex flex-col items-center justify-between gap-1 cursor-pointer transition-all select-none ${isEquipped ? 'bg-[#252836] border-2 border-emerald-400 shadow-lg shadow-emerald-500/10' : 'bg-[#191c26] hover:bg-[#222634] border border-white/10'}">
                                <div class="h-11 flex items-center justify-center w-full">
                                    ${GlobalChat.getChatBubbleThumbnailHtml(item.bubbleId)}
                                </div>
                                <div class="text-[11px] font-bold text-white truncate w-full text-center">${GlobalChat.escapeHtml(item.name)}</div>
                                <div class="text-[9px] font-extrabold ${isEquipped ? 'text-emerald-400' : 'text-amber-300/85'} flex items-center gap-1">
                                    ${isEquipped ? '<span>✓ Dipakai</span>' : `<span>Pakai • ${GlobalChat.escapeHtml(durLabel)}</span>`}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            `;
            if (window.lucide) lucide.createIcons();
        },

        async equipOwnedChatBubble(bubbleId) {
            var bId = String(bubbleId || 'default').trim().toLowerCase() || 'default';
            var u = GlobalChat.getCurrentUser();
            if (!u) return;

            // Optimistically update local user & re-render immediately
            var newVal = (bId === 'default' || bId === 'none') ? '' : bId;
            u.chatBubble = newVal;
            if (typeof Auth !== 'undefined' && Auth.currentUser) {
                Auth.currentUser.chatBubble = newVal;
                if (typeof Auth.saveUser === 'function') Auth.saveUser(Auth.currentUser);
            }
            if (GlobalChat._userBubbleCache) {
                if (u.id) GlobalChat._userBubbleCache[String(u.id)] = newVal;
                if (u.username) GlobalChat._userBubbleCache[String(u.username).toLowerCase().trim()] = newVal;
            }
            GlobalChat.renderOwnedBubblesDrawer();
            GlobalChat.renderMessagesList(GlobalChat.messages || [], false);

            try {
                var token = (typeof Profile !== 'undefined' && typeof Profile.getCurrentUserAuthToken === 'function')
                    ? Profile.getCurrentUserAuthToken()
                    : ((typeof Auth !== 'undefined' && Auth.token) ? Auth.token : (localStorage.getItem('musifystar_auth_token') || ''));
                var adminTok = (typeof Profile !== 'undefined' && typeof Profile.getAdminToken === 'function')
                    ? Profile.getAdminToken()
                    : (sessionStorage.getItem('musifystar_admin_token') || localStorage.getItem('musifystar_admin_token') || '');
                var headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token
                };
                if (adminTok) headers['x-admin-token'] = adminTok;

                var res = await fetch('/api/user-auth?action=buy_diamond_chat_bubble', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        action: 'buy_diamond_chat_bubble',
                        bubbleId: bId,
                        token: token,
                        userId: u.id || '',
                        originalId: u.originalId || '',
                        username: u.username || '',
                        email: u.email || u.rawEmail || ''
                    })
                });
                var data = await res.json();
                if (data && data.status && data.user) {
                    if (typeof Auth !== 'undefined' && Auth.currentUser) {
                        Object.assign(Auth.currentUser, data.user);
                        if (typeof Auth.saveUser === 'function') Auth.saveUser(Auth.currentUser);
                    }
                    GlobalChat.renderOwnedBubblesDrawer();
                    GlobalChat.renderMessagesList(GlobalChat.messages || [], false);
                    if (typeof showToast === 'function') {
                        var stName = (GlobalChat.CHAT_BUBBLE_STYLES[bId] && GlobalChat.CHAT_BUBBLE_STYLES[bId].name) ? GlobalChat.CHAT_BUBBLE_STYLES[bId].name : 'Default';
                        showToast('Gaya Balon "' + stName + '" aktif dipakai!');
                    }
                }
            } catch (e) {}
        },

        openBubbleStoreModal() {
            if (typeof Profile !== 'undefined' && typeof Profile.openDiamondTopupModal === 'function') {
                Profile.openDiamondTopupModal('gayabalon');
            }
        },

        // Verified Blue Checkmark + Admin Badge (Exclusively for jrnabil570@gmail.com)
        // Format: Admin first, blue checkmark right beside it on the right (Admin ✅)
        getAdminBlueCheckmarkHTML() {
            var checkmarkSvg = `
            <svg style="width: 12px; height: 12px;" class="shrink-0 inline-block align-middle ml-1" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" fill="#0095F6"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M16.707 8.293a1 1 0 0 1 0 1.414l-6 6a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L10 13.586l5.293-5.293a1 1 0 0 1 1.414 0z" fill="#FFFFFF"/>
            </svg>`;

            return `
            <span class="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700/80 text-slate-200 text-[10px] font-semibold tracking-wide shadow-sm select-none" title="Admin Terverifikasi Resmi">
                <span>Admin</span>
                ${checkmarkSvg}
            </span>`;
        },

        // Helper: Resolve Current User Identity
        getCurrentUser() {
            var u = (typeof Auth !== 'undefined' && Auth.currentUser) ? Auth.currentUser : null;
            if (!u) {
                try {
                    var raw = localStorage.getItem('musifystar_auth_user') || sessionStorage.getItem('musifystar_auth_user');
                    if (raw) u = JSON.parse(raw);
                } catch (e) {}
            }

            // Only mark as Master Admin if user email is strictly jrnabil570@gmail.com
            if (u) {
                var email = (u.email || u.rawEmail || '').toLowerCase().trim();
                var uid = String(u.id || u.userId || '');
                if (email === 'jrnabil570@gmail.com' || uid === '8589478687' || uid === 'u_1790196636099_622dc736') {
                    u.isAdmin = true;
                    u.isVerifiedAdmin = true;
                    u.badge = 'Admin';
                    if (!u.username) u.username = 'MusifyStar Official';
                    if (!u.email) u.email = 'jrnabil570@gmail.com';
                } else {
                    u.isAdmin = false;
                    u.isVerifiedAdmin = false;
                    u.badge = 'Member';
                }
            }

            return u;
        },

        // Open Global Chat Modal (Requires Active Login)
        open() {
            var u = GlobalChat.getCurrentUser();
            if (!u) {
                if (typeof showToast === 'function') {
                    showToast('Silakan login terlebih dahulu untuk mengakses Chat Global.');
                }
                if (typeof Auth !== 'undefined' && typeof Auth.openModal === 'function') {
                    Auth.openModal();
                }
                return;
            }

            var existing = document.getElementById('musifystar-global-chat-modal');
            if (existing) existing.remove();

            GlobalChat.isOpen = true;

            var modal = document.createElement('div');
            modal.id = 'musifystar-global-chat-modal';
            modal.className = 'fixed inset-0 z-[99999] bg-[#07090e] flex flex-col select-none overflow-hidden h-[100dvh] max-h-[100dvh] animate-fade-in';

            // Anti-DevTools & Anti-Inspection Protections on Chat Interface
            modal.oncontextmenu = function(e) {
                e.preventDefault();
                return false;
            };

            var handleKeyDown = function(e) {
                // Block F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U
                if (
                    e.key === 'F12' || 
                    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'J' || e.key === 'j' || e.key === 'C' || e.key === 'c')) ||
                    (e.ctrlKey && (e.key === 'u' || e.key === 'U'))
                ) {
                    e.preventDefault();
                    e.stopPropagation();
                    return false;
                }
                if (e.key === 'Escape' && GlobalChat.isOpen) {
                    GlobalChat.close();
                }
            };
            modal.addEventListener('keydown', handleKeyDown);
            window.addEventListener('keydown', handleKeyDown);
            modal._cleanupKeyDown = handleKeyDown;

            var isMasterAdmin = (u.email || u.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com';

            modal.innerHTML = `
            <!-- Chat Header (Sleek Dark Obsidian Full Screen Sticky Header) -->
            <div class="sticky top-0 z-20 px-4 sm:px-6 py-3.5 bg-[#141720] border-b border-slate-800/80 flex items-center justify-between shrink-0 shadow-md">
                <div class="flex items-center gap-3">
                    <button onclick="GlobalChat.close()" class="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 transition-all cursor-pointer" title="Kembali">
                        <i data-lucide="arrow-left" class="w-5 h-5"></i>
                    </button>
                    <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300 shadow-inner shrink-0">
                        <i data-lucide="message-square" class="w-5 h-5 text-sky-400"></i>
                    </div>
                    <div>
                        <div class="flex items-center gap-2">
                            <h2 class="text-base sm:text-lg font-bold text-slate-100 tracking-tight">Chat Global MusifyStar</h2>
                            <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[9px] font-semibold">
                                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                <span>LIVE</span>
                            </span>
                        </div>
                        <p class="text-[10px] sm:text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <i data-lucide="shield-check" class="w-3.5 h-3.5 text-sky-400"></i>
                            <span>Ruang Obrolan Komunitas Musik &bull; Terenkripsi</span>
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button id="global-chat-top-bubble-bag-btn" type="button" onclick="GlobalChat.toggleOwnedBubblesDrawer()" class="relative px-2.5 h-9 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 active:scale-95 flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-xs font-extrabold transition-all cursor-pointer" title="Koleksi Gaya Balon Saya (Klik untuk ganti gaya balon chat)">
                        <i data-lucide="message-circle-heart" class="w-4 h-4"></i>
                        <span class="hidden sm:inline">Balon Saya</span>
                        <span id="global-chat-owned-bubbles-count" class="px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[10px] font-black leading-tight">${GlobalChat.getOwnedChatBubblesList(u).length}</span>
                    </button>
                    <button onclick="GlobalChat.fetchMessages(false)" class="w-9 h-9 rounded-xl bg-slate-800/60 hover:bg-slate-700/80 border border-slate-700/50 active:scale-95 flex items-center justify-center text-slate-300 hover:text-white transition-all cursor-pointer" title="Segarkan Chat">
                        <i data-lucide="refresh-cw" class="w-4 h-4"></i>
                    </button>
                    <button onclick="GlobalChat.close()" class="w-9 h-9 rounded-xl bg-slate-800/60 hover:bg-rose-500/20 hover:border-rose-500/40 border border-slate-700/50 active:scale-95 flex items-center justify-center text-slate-300 hover:text-rose-400 transition-all cursor-pointer" title="Tutup Chat">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>

            <!-- Laci Cepat Koleksi Gaya Balon Saya di Atas Ruang Chat -->
            <div id="global-chat-owned-bubbles-drawer" class="${GlobalChat._isOwnedBubblesDrawerOpen ? '' : 'hidden'} relative z-20 shrink-0"></div>

            <!-- Chat Messages Stream (Deep Dark Background, Eye-Friendly, Scrollable) -->
            <div id="global-chat-stream" class="relative z-10 flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 hide-scrollbar bg-[#0c0e14]">
                <div id="global-chat-loading" class="text-center py-20 text-slate-500 space-y-2">
                    <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-slate-400"></i>
                    <p class="text-xs font-medium">Memuat pesan obrolan...</p>
                </div>
            </div>

            <!-- Chat Input Bottom Bar -->
            <div id="global-chat-bottom-bar" class="relative z-10 px-4 sm:px-6 py-3.5 bg-[#141720] border-t border-slate-800/80 shrink-0">
                ${GlobalChat.renderBottomBar(u, isMasterAdmin)}
            </div>`;

            // Click outside backdrop closes modal
            modal.onclick = function(e) {
                if (e.target === modal) {
                    GlobalChat.close();
                }
            };

            document.body.appendChild(modal);
            if (GlobalChat._isOwnedBubblesDrawerOpen) {
                GlobalChat.renderOwnedBubblesDrawer();
            }
            if (window.lucide) lucide.createIcons();
            if (typeof DynamicIsland !== 'undefined' && typeof DynamicIsland.updateState === 'function') {
                DynamicIsland.updateState();
            }

            // Fetch initial messages immediately
            GlobalChat.fetchMessages(false);

            // Start auto-poll every 2.5 seconds while open
            if (GlobalChat.pollInterval) clearInterval(GlobalChat.pollInterval);
            GlobalChat.pollInterval = setInterval(function() {
                if (GlobalChat.isOpen && document.getElementById('musifystar-global-chat-modal')) {
                    GlobalChat.fetchMessages(true);
                } else {
                    GlobalChat.close();
                }
            }, 2500);

            // Hide unread badge on header
            var badge = document.getElementById('global-chat-badge');
            if (badge) badge.classList.add('hidden');
        },

        // Close Global Chat Modal
        close() {
            GlobalChat.isOpen = false;
            if (GlobalChat.pollInterval) {
                clearInterval(GlobalChat.pollInterval);
                GlobalChat.pollInterval = null;
            }
            var modal = document.getElementById('musifystar-global-chat-modal');
            if (modal) {
                if (modal._cleanupKeyDown) {
                    window.removeEventListener('keydown', modal._cleanupKeyDown);
                }
                modal.remove();
            }
        },

        // Render Badges Sequence for Chat Messages & Inputs
        // Order: [Admin Checkmark (Admin Only)] [VIP Badge (If VIP Active)] [Rank Badge (Equipped / Elite)] [Border/Immortal Badge]
        getUserBadgesHTML(opts) {
            if (!opts) opts = {};
            var isAdmin = !!opts.isAdmin;
            var isVip = !!opts.isVip;
            var borderName = opts.borderName || '';
            var borderUrl = opts.borderUrl || '';
            var equippedBadge = opts.equippedBadge !== undefined ? opts.equippedBadge : '';
            var equippedBadgeTitle = opts.equippedBadgeTitle !== undefined ? opts.equippedBadgeTitle : '';
            var equippedBadgeIcon = opts.equippedBadgeIcon !== undefined ? opts.equippedBadgeIcon : '';
            var equippedBadgeColor = opts.equippedBadgeColor !== undefined ? opts.equippedBadgeColor : '';

            var badges = [];

            // 1. Admin + Centang Biru Badge (Hanya Admin)
            if (isAdmin) {
                badges.push(GlobalChat.getAdminBlueCheckmarkHTML());
            }

            // 2. Logo VIP (Hanya jika VIP Aktif)
            if (isVip) {
                if (typeof Auth !== 'undefined' && typeof Auth.getVipBadgeHTML === 'function') {
                    badges.push(Auth.getVipBadgeHTML('text-[8.5px] px-1.5 py-0.2'));
                } else {
                    badges.push(`
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-extrabold text-[8.5px] shadow-[0_0_8px_rgba(245,158,11,0.35)] border border-amber-300/60 select-none shrink-0 align-middle">
                        <svg class="w-2.5 h-2.5 shrink-0 fill-black text-black" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.3 8.87l5.378-2.689a.5.5 0 0 1 .7.574l-2.002 11.01a1 1 0 0 1-.985.821H5.609a1 1 0 0 1-.985-.821L2.622 6.755a.5.5 0 0 1 .7-.574l5.378 2.689z"/></svg>
                        <span>VIP</span>
                    </span>`);
                }
            }

            // 2.5 Badge Khusus Donatur / Top Supporter
            if (opts.donatur && typeof Auth !== 'undefined' && typeof Auth.getDonaturBadgeHTML === 'function') {
                var donHtml = Auth.getDonaturBadgeHTML(opts.donatur, 'text-[8px] px-1.5 py-0.2');
                if (donHtml) badges.push(donHtml);
            }

            // 3. Logo Rank Badge Custom yang Dipasang (atau Fallback Elite)
            if (equippedBadge !== 'badge_none') {
                if (typeof Auth !== 'undefined' && typeof Auth.getRankBadgePillHTML === 'function') {
                    if (equippedBadgeTitle || equippedBadge) {
                        badges.push(Auth.getRankBadgePillHTML(equippedBadge, equippedBadgeTitle, equippedBadgeIcon, equippedBadgeColor));
                    } else {
                        badges.push(Auth.getRankBadgePillHTML('badge_elite', 'Elite'));
                    }
                } else {
                    var displayTitle = equippedBadgeTitle || 'Elite';
                    var displayIcon = equippedBadgeIcon || '⚡';
                    var displayColor = equippedBadgeColor || '#a855f7';
                    badges.push(`
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[8.5px] leading-none font-black border shadow-sm select-none shrink-0 align-middle" style="background: rgba(18, 20, 28, 0.95); border-color: ${displayColor}; color: ${displayColor}; box-shadow: 0 0 8px ${displayColor}33;">
                        <span>${displayIcon}</span>
                        <span>${displayTitle}</span>
                    </span>`);
                }
            }

            // 4. Logo Border Frame / Custom Rank Badge (misal Immortal, Legend, Master, Platinum, dsb)
            if (borderName && borderName !== 'none' && borderName !== 'Tanpa Border') {
                var borderPill = GlobalChat.getBorderBadgeHTML(borderName, borderUrl, false);
                if (borderPill) badges.push(borderPill);
            }

            return badges.join(' ');
        },

        // Render Bottom Bar
        renderBottomBar(user, isMasterAdmin) {
            var username = (user && user.username) ? user.username : (isMasterAdmin ? 'MusifyStar Official' : 'Musisi');

            var isVipExpired = user ? (user.vipExpiresAt && Date.now() > user.vipExpiresAt) : false;
            var userIsVip = isMasterAdmin || (user && Boolean(user.isPremium || user.is_premium) && user.vipTier !== 'none' && !isVipExpired);
            var userBorderName = (typeof Auth !== 'undefined' && Auth.getBorderName && user) ? Auth.getBorderName(user) : (user ? (user.borderName || '') : '');
            var userBorderUrl = (typeof Auth !== 'undefined' && Auth.getBorderUrl && user) ? Auth.getBorderUrl(user) : (user ? (user.borderUrl || '') : '');

            var senderBadgesHTML = GlobalChat.getUserBadgesHTML({
                isAdmin: isMasterAdmin,
                isVip: userIsVip,
                borderName: userBorderName,
                borderUrl: userBorderUrl,
                equippedBadge: user ? (user.equippedBadge || '') : '',
                equippedBadgeTitle: user ? (user.equippedBadgeTitle || '') : '',
                equippedBadgeIcon: user ? (user.equippedBadgeIcon || '') : '',
                equippedBadgeColor: user ? (user.equippedBadgeColor || '') : '',
                donatur: user ? (user.donatur || null) : null
            });

            var userGlow = (user && user.nameGlow) ? user.nameGlow : '';
            var renderedSenderName = (typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && userGlow)
                ? Auth.renderUsernameWithGlow(username, userGlow)
                : GlobalChat.escapeHtml(username);

            return `
            <div class="space-y-1.5">
                <div class="flex items-center justify-between text-[11px] text-slate-400 px-1 select-none">
                    <span class="flex items-center gap-1.5 truncate flex-wrap">
                        <span class="text-slate-400">Mengirim sebagai:</span>
                        <b class="text-slate-200 font-semibold truncate">${renderedSenderName}</b>
                        ${senderBadgesHTML}
                    </span>
                    <span id="global-chat-char-count" class="font-mono text-[10px] text-slate-500">0/500</span>
                </div>
                <form onsubmit="event.preventDefault(); GlobalChat.sendMessage();" class="flex items-center gap-2">
                    <div class="relative flex-1">
                        <input 
                            type="text" 
                            id="global-chat-input" 
                            maxlength="500" 
                            autocomplete="off"
                            placeholder="Tulis pesan ke komunitas MusifyStar..." 
                            oninput="GlobalChat.updateCharCount(this)"
                            class="w-full px-4 py-2.5 sm:py-3 rounded-xl bg-[#1a1f29] border border-slate-700/80 focus:border-slate-500 text-slate-100 placeholder-slate-500 text-xs sm:text-sm font-sans focus:outline-none focus:ring-1 focus:ring-slate-500/20 transition-all shadow-inner"
                        />
                    </div>
                    <button 
                        type="submit" 
                        id="global-chat-send-btn" 
                        class="w-11 h-11 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-white flex items-center justify-center shrink-0 shadow-md transition-all cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                        title="Kirim pesan"
                    >
                        <i data-lucide="send" class="w-4 h-4 text-white"></i>
                    </button>
                </form>
            </div>`;
        },

        updateCharCount(el) {
            var counter = document.getElementById('global-chat-char-count');
            if (counter && el) {
                var len = el.value.length;
                counter.innerText = len + '/500';
                if (len >= 480) {
                    counter.className = 'font-mono text-[10px] text-rose-400 font-bold';
                } else {
                    counter.className = 'font-mono text-[10px] text-white/40';
                }
            }
        },

        incomingFriendRequests: [],
        friendUpdates: null,
        _profileModalPollTimer: null,
        _friendActionBusy: false,
        _friendActionSeq: 0,
        _currentModalProfile: null,
        _userGlowCache: {},

        isAdminIdentity(idStr, nameStr) {
            var cid = String(idStr || '').trim();
            var cname = String(nameStr || '').toLowerCase().trim();
            return (
                cid === '8589478687' ||
                cid === 'u_1790196636099_622dc736' ||
                cname === 'musifystar' ||
                cname === 'musifystar official'
            );
        },

        matchesIdentity(recId, recName, uid, uname) {
            var cleanRecId = String(recId || '').trim();
            var cleanUid = String(uid || '').trim();
            var cleanRecName = String(recName || '').toLowerCase().trim();
            var cleanUname = String(uname || '').toLowerCase().trim();
            if (GlobalChat.isAdminIdentity(cleanRecId, cleanRecName) && GlobalChat.isAdminIdentity(cleanUid, cleanUname)) {
                return true;
            }
            if (cleanRecId && cleanUid && cleanRecId === cleanUid) return true;
            if (cleanRecName && cleanUname && cleanRecName === cleanUname) return true;
            return false;
        },

        resolveLocalFriendStatus(targetId, targetName) {
            var me = GlobalChat.getCurrentUser();
            if (!me) return { status: 'none', reqId: '' };
            if (!Array.isArray(GlobalChat.friendUpdates)) return { status: 'loading', reqId: '' };

            var myId = String(me.id || me.userId || '').trim();
            var myName = String(me.username || '').trim();
            var allReqs = GlobalChat.friendUpdates;

            var outgoing = allReqs.find(function(r) {
                return GlobalChat.matchesIdentity(r.fromId, r.fromName, myId, myName) &&
                       GlobalChat.matchesIdentity(r.toId, r.toName, targetId, targetName);
            });
            var incoming = allReqs.find(function(r) {
                return GlobalChat.matchesIdentity(r.fromId, r.fromName, targetId, targetName) &&
                       GlobalChat.matchesIdentity(r.toId, r.toName, myId, myName);
            });

            if (outgoing && outgoing.status === 'accepted') return { status: 'accepted', reqId: outgoing.id };
            if (incoming && incoming.status === 'accepted') return { status: 'accepted', reqId: incoming.id };
            if (incoming && incoming.status === 'pending') return { status: 'incoming_pending', reqId: incoming.id };
            if (outgoing && outgoing.status === 'pending') return { status: 'outgoing_pending', reqId: outgoing.id };
            if (outgoing && outgoing.status === 'rejected') return { status: 'outgoing_rejected', reqId: outgoing.id };
            if (incoming && incoming.status === 'rejected') return { status: 'incoming_rejected', reqId: incoming.id };
            return { status: 'none', reqId: '' };
        },

        // Fetch Messages from Primary Neon PostgreSQL Database
        async fetchMessages(isBackground) {
            try {
                var headers = {};
                var u = GlobalChat.getCurrentUser();
                var myId = u ? String(u.id || u.userId || '') : '';
                var myName = u ? String(u.username || '') : '';
                var isMasterAdmin = u && ((u.email || u.rawEmail || '').toLowerCase().trim() === 'jrnabil570@gmail.com');
                
                if (isMasterAdmin) {
                    var adminToken = (typeof Profile !== 'undefined' && typeof Profile.getAdminToken === 'function') 
                        ? Profile.getAdminToken() 
                        : (sessionStorage.getItem('musifystar_admin_token') || localStorage.getItem('musifystar_admin_token') || '');
                    if (adminToken) headers['x-admin-token'] = adminToken;
                }

                var userToken = (typeof Auth !== 'undefined' && Auth.token) ? Auth.token : (localStorage.getItem('musifystar_auth_token') || '');
                if (userToken) {
                    headers['Authorization'] = 'Bearer ' + userToken;
                }
                if (myId) headers['X-User-Id'] = myId;
                if (myName) headers['X-User-Name'] = myName;

                var res = await fetch('/api/global-chat?myId=' + encodeURIComponent(myId) + '&myName=' + encodeURIComponent(myName) + '&t=' + Date.now(), {
                    headers: headers,
                    cache: 'no-store'
                });
                var data = await res.json();

                if (data && data.status && Array.isArray(data.messages)) {
                    var isNewMessage = data.messages.length > GlobalChat.lastMessageCount;
                    var prevReqCount = (GlobalChat.incomingFriendRequests || []).length;
                    GlobalChat.incomingFriendRequests = Array.isArray(data.incomingFriendRequests) ? data.incomingFriendRequests : [];
                    if (Array.isArray(data.friendUpdates)) {
                        GlobalChat.friendUpdates = data.friendUpdates;
                    }
                    var reqChanged = GlobalChat.incomingFriendRequests.length !== prevReqCount;
                    if (!GlobalChat._userGlowCache) GlobalChat._userGlowCache = {};
                    if (!GlobalChat._userBubbleCache) GlobalChat._userBubbleCache = {};
                    data.messages.forEach(function(m) {
                        if (m && m.nameGlow) {
                            if (m.userId) GlobalChat._userGlowCache[String(m.userId)] = m.nameGlow;
                            if (m.username) GlobalChat._userGlowCache[String(m.username).toLowerCase().trim()] = m.nameGlow;
                        }
                        if (m && m.chatBubble !== undefined) {
                            if (m.userId) GlobalChat._userBubbleCache[String(m.userId)] = m.chatBubble || '';
                            if (m.username) GlobalChat._userBubbleCache[String(m.username).toLowerCase().trim()] = m.chatBubble || '';
                        }
                    });
                    var msgSig = data.messages.map(function(m) {
                        return [m.id, m.username, m.avatar, m.borderUrl, m.borderName, m.equippedBadge, m.nameGlow, m.chatBubble, m.message].join(':');
                    }).join('|') + '||' + GlobalChat.incomingFriendRequests.length;
                    GlobalChat.messages = data.messages;
                    GlobalChat.lastMessageCount = data.messages.length;

                    if (!isBackground || msgSig !== GlobalChat._lastMessagesSig || reqChanged) {
                        GlobalChat._lastMessagesSig = msgSig;
                        GlobalChat.renderMessagesList(data.messages, isBackground ? (isNewMessage || reqChanged) : true);
                    }
                }
            } catch (e) {
                if (!isBackground) {
                    var stream = document.getElementById('global-chat-stream');
                    if (stream) {
                        stream.innerHTML = `
                        <div class="text-center py-20 text-rose-400 space-y-2">
                            <i data-lucide="alert-triangle" class="w-8 h-8 mx-auto"></i>
                            <p class="text-xs font-semibold">Gagal memuat pesan: ${GlobalChat.escapeHtml(e.message)}</p>
                            <button onclick="GlobalChat.fetchMessages(false)" class="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer">Coba Lagi</button>
                        </div>`;
                        if (window.lucide) lucide.createIcons();
                    }
                }
            }
        },

        // Render Messages in Stream (Strict Per-User Ownership)
        renderMessagesList(msgs, shouldScroll) {
            var stream = document.getElementById('global-chat-stream');
            if (!stream) return;

            var incomingBannerHtml = '';
            if (Array.isArray(GlobalChat.incomingFriendRequests) && GlobalChat.incomingFriendRequests.length > 0) {
                incomingBannerHtml = `
                <div class="mb-3 space-y-2">
                    ${GlobalChat.incomingFriendRequests.map(function(req) {
                        return `
                        <div class="p-3 rounded-2xl bg-gradient-to-r from-sky-500/20 via-indigo-500/15 to-purple-500/20 border border-sky-400/40 flex items-center justify-between gap-2 shadow-lg">
                            <div class="flex items-center gap-2.5 min-w-0">
                                <div class="w-8 h-8 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300 shrink-0 font-black text-xs overflow-hidden">
                                    ${req.fromAvatar ? `<img src="${req.fromAvatar}" class="w-full h-full object-cover" onerror="this.style.display='none'">` : GlobalChat.escapeHtml((req.fromName || 'U').charAt(0).toUpperCase())}
                                </div>
                                <div class="min-w-0">
                                    <p class="text-[11px] font-extrabold text-white truncate">@${GlobalChat.escapeHtml(req.fromName || 'Pengguna')} mengajak berteman</p>
                                    <p class="text-[9.5px] text-sky-300/90">Permintaan Pertemanan Musik</p>
                                </div>
                            </div>
                            <div class="flex items-center gap-1.5 shrink-0">
                                <button type="button" onclick="GlobalChat.respondFriendRequest('${GlobalChat.escapeJs(req.id)}', '${GlobalChat.escapeJs(req.fromId)}', '${GlobalChat.escapeJs(req.fromName)}', 'accepted')" class="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[10px] active:scale-95 transition-all cursor-pointer shadow">
                                    Terima
                                </button>
                                <button type="button" onclick="GlobalChat.respondFriendRequest('${GlobalChat.escapeJs(req.id)}', '${GlobalChat.escapeJs(req.fromId)}', '${GlobalChat.escapeJs(req.fromName)}', 'rejected')" class="px-2.5 py-1.5 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-200 font-black text-[10px] active:scale-95 transition-all cursor-pointer">
                                    Tolak
                                </button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            }

            if (msgs.length === 0) {
                stream.innerHTML = incomingBannerHtml + `
                <div class="text-center py-24 text-white/40 space-y-3">
                    <div class="w-14 h-14 rounded-3xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
                        <i data-lucide="message-square" class="w-7 h-7"></i>
                    </div>
                    <div>
                        <p class="text-sm font-bold text-white">Belum Ada Pesan</p>
                        <p class="text-xs text-white/50">Jadilah yang pertama menyapa komunitas musik MusifyStar!</p>
                    </div>
                </div>`;
                if (window.lucide) lucide.createIcons();
                return;
            }

            var u = GlobalChat.getCurrentUser();
            if (!u) return;

            var myId = String(u.id || u.userId || '');
            var myName = String(u.username || '').toLowerCase().trim();
            var myEmail = String(u.email || u.rawEmail || '').toLowerCase().trim();
            var isMasterAdmin = (myEmail === 'jrnabil570@gmail.com');

            var dateDivider = incomingBannerHtml + `
            <div class="flex justify-center my-3 select-none">
                <span class="px-3 py-1 rounded-full bg-slate-800/60 border border-slate-700/40 text-[10px] text-slate-400 font-sans tracking-wide">
                    Ruang Chat Global MusifyStar
                </span>
            </div>`;

            var messagesHtml = msgs.map(function(m) {
                var msgUserId = String(m.userId || '');
                var msgUsername = String(m.username || '').toLowerCase().trim();
                var msgEmail = String(m.email || '').toLowerCase().trim();

                // STRICT ACCOUNT OWNERSHIP:
                // A message is 'isMe' IF AND ONLY IF it was created by the currently logged-in account
                var isMe = false;
                if (myId && msgUserId && msgUserId === myId) {
                    isMe = true;
                } else if (isMasterAdmin && (msgUserId === '8589478687' || msgUserId === 'u_1790196636099_622dc736' || msgUserId === 'admin_1' || msgEmail === 'jrnabil570@gmail.com')) {
                    isMe = true;
                } else if (myEmail && msgEmail && msgEmail === myEmail) {
                    isMe = true;
                } else if (myName && msgUsername && msgUsername === myName) {
                    isMe = true;
                } else if (m.clientTempId && m.optimisticAuthorId === myId) {
                    isMe = true;
                }

                // Admin Centang Biru Detection:
                // Strictly true if email is jrnabil570@gmail.com, or user_id is 8589478687, or flagged as verified admin
                var isMsgAdmin = !!m.isVerifiedAdmin || !!m.isAdmin || (msgEmail === 'jrnabil570@gmail.com') || (msgUserId === '8589478687');
                var displayUsername = (isMe && u && u.username) ? u.username : (m.username || (isMsgAdmin ? 'MusifyStar Official' : 'Musisi'));
                var avatarColor = isMsgAdmin ? 'from-slate-700 to-slate-900 border border-slate-600/60' : (m.avatarColor || 'from-slate-700 to-slate-800');
                var initial = isMsgAdmin ? 'M' : (displayUsername.charAt(0).toUpperCase());
                var timeStr = GlobalChat.formatTime(m.createdAt);

                // Resolve avatar and border (if isMe, also fall back to current logged in user state)
                var userAvatar = m.avatar || m.avatar_url || (isMe ? (u.avatar || '') : '');
                var userBorderUrl = m.borderUrl || m.border_url || (isMe ? ((typeof Auth !== 'undefined' && Auth.getBorderUrl) ? Auth.getBorderUrl(u) : (u.borderUrl || '')) : '');
                var userBorderName = m.borderName || m.border_name || (isMe ? ((typeof Auth !== 'undefined' && Auth.getBorderName) ? Auth.getBorderName(u) : (u.borderName || '')) : '');
                if (!userBorderName && userBorderUrl) {
                    var bLow = userBorderUrl.toLowerCase();
                    if (bLow.includes('immortal') || bLow.includes('imortal')) userBorderName = 'Immortal';
                    else if (bLow.includes('legend')) userBorderName = 'Legend';
                    else if (bLow.includes('master')) userBorderName = 'Master';
                    else if (bLow.includes('platinum')) userBorderName = 'Platinum';
                    else userBorderName = 'VIP';
                }
                var userIsVip = !!m.isVip || !!m.is_vip || isMsgAdmin || (isMe && (!!u.isPremium || !!u.is_premium));
                var userVipTier = m.vipTier || m.vip_tier || (isMe ? (u.vipTier || '') : '');
                var userVipExpires = m.vipExpiresAt || m.vip_expires_at || (isMe ? (u.vipExpiresAt || 0) : 0);

                var eqBadge = isMe ? (u.equippedBadge !== undefined ? u.equippedBadge : (m.equippedBadge || '')) : (m.equippedBadge || '');
                var eqTitle = isMe ? (u.equippedBadgeTitle !== undefined ? u.equippedBadgeTitle : (m.equippedBadgeTitle || '')) : (m.equippedBadgeTitle || '');
                var eqIcon = isMe ? (u.equippedBadgeIcon !== undefined ? u.equippedBadgeIcon : (m.equippedBadgeIcon || '')) : (m.equippedBadgeIcon || '');
                var eqColor = isMe ? (u.equippedBadgeColor !== undefined ? u.equippedBadgeColor : (m.equippedBadgeColor || '')) : (m.equippedBadgeColor || '');
                var userNameGlow = (isMe && u && u.nameGlow)
                    ? u.nameGlow
                    : (m.nameGlow || (GlobalChat._userGlowCache && (GlobalChat._userGlowCache[msgUserId] || GlobalChat._userGlowCache[msgUsername])) || '');
                if (userNameGlow && GlobalChat._userGlowCache) {
                    if (msgUserId) GlobalChat._userGlowCache[msgUserId] = userNameGlow;
                    if (msgUsername) GlobalChat._userGlowCache[msgUsername] = userNameGlow;
                }
                var renderedDisplayUsername = (typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && userNameGlow)
                    ? Auth.renderUsernameWithGlow(displayUsername, userNameGlow)
                    : GlobalChat.escapeHtml(displayUsername);

                // Resolve Badges Sequence: [Admin Checkmark (Admin Only)] [VIP Badge (If VIP Active)] [Rank Badge] [Border/Immortal Badge]
                var userBadgesHtml = GlobalChat.getUserBadgesHTML({
                    isAdmin: isMsgAdmin,
                    isVip: userIsVip,
                    borderName: userBorderName,
                    borderUrl: userBorderUrl,
                    equippedBadge: eqBadge,
                    equippedBadgeTitle: eqTitle,
                    equippedBadgeIcon: eqIcon,
                    equippedBadgeColor: eqColor,
                    donatur: isMe ? (u.donatur || m.donatur || null) : (m.donatur || null)
                });

                // Avatar with border element
                var avatarHtml = GlobalChat.renderAvatarWithBorder({
                    userId: msgUserId,
                    username: displayUsername,
                    avatar: userAvatar,
                    avatarColor: avatarColor,
                    initial: initial,
                    borderUrl: userBorderUrl,
                    borderName: userBorderName,
                    isAdmin: isMsgAdmin,
                    isVip: userIsVip,
                    vipTier: userVipTier,
                    vipExpiresAt: userVipExpires,
                    nameGlow: userNameGlow
                });

                // Delete option: Master Admin can delete ANY message, or user can delete their own message
                var deleteBtn = (isMasterAdmin || isMe) ? `
                <button type="button" onclick="GlobalChat.deleteMessage(event, '${m.id}')" class="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-rose-400 active:scale-90 transition-all cursor-pointer inline-flex items-center justify-center shrink-0" title="Hapus pesan ini">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>` : '';

                var openProfileJs = `GlobalChat.showUserProfileModal('${GlobalChat.escapeJs(msgUserId)}', '${GlobalChat.escapeJs(displayUsername)}', '${GlobalChat.escapeJs(userAvatar)}', '${GlobalChat.escapeJs(userBorderUrl)}', '${GlobalChat.escapeJs(userBorderName)}', ${!!isMsgAdmin}, ${!!userIsVip}, '${GlobalChat.escapeJs(userVipTier)}', ${userVipExpires || 0}, '${GlobalChat.escapeJs(userNameGlow)}')`;

                var userChatBubble = (isMe && u && u.chatBubble !== undefined)
                    ? (u.chatBubble || '')
                    : (m.chatBubble || (GlobalChat._userBubbleCache && (GlobalChat._userBubbleCache[msgUserId] || GlobalChat._userBubbleCache[msgUsername])) || '');
                var bubbleStyleObj = (userChatBubble && userChatBubble !== 'default' && userChatBubble !== 'none' && GlobalChat.CHAT_BUBBLE_STYLES[userChatBubble])
                    ? GlobalChat.CHAT_BUBBLE_STYLES[userChatBubble]
                    : null;
                var nameWrapAttr = (bubbleStyleObj && bubbleStyleObj.isLight && userNameGlow)
                    ? 'class="px-2 py-0.5 rounded-md bg-black/75 inline-block"'
                    : '';
                var msgTextStyle = bubbleStyleObj
                    ? `color: ${bubbleStyleObj.textColor}; font-weight: 600;`
                    : '';
                var metaTextStyle = bubbleStyleObj
                    ? `color: ${bubbleStyleObj.metaColor}; font-weight: 700;`
                    : '';
                var nameColorStyle = (bubbleStyleObj && !userNameGlow)
                    ? `color: ${bubbleStyleObj.textColor}; font-weight: 800;`
                    : '';

                // ==========================================
                // 1. PESAN SAYA (AKUN INI SENDIRI: DI KANAN DENGAN AVATAR & BORDER)
                // ==========================================
                if (isMe) {
                    var statusSending = m.isSending ? `
                        <span class="inline-flex text-slate-400" title="Mengirim...">
                            <i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>
                        </span>
                    ` : '';

                    var myInnerBubbleHtml = `
                        <!-- Header Nama & Border Badge (Clickable to view own profile preview) -->
                        <div class="flex items-center justify-between gap-2 mb-1.5 select-none cursor-pointer" onclick="${openProfileJs}" title="Klik untuk lihat tampilan profil & border Anda">
                            <span class="text-xs font-semibold text-slate-200 hover:text-white transition-colors tracking-tight truncate max-w-[130px] sm:max-w-[170px]" style="${nameColorStyle}"><span ${nameWrapAttr}>${renderedDisplayUsername}</span></span>
                            <div class="flex items-center gap-1 shrink-0 flex-nowrap overflow-x-auto hide-scrollbar">
                                ${userBadgesHtml}
                            </div>
                        </div>

                        <!-- Message text -->
                        <p class="text-[13px] sm:text-[14px] leading-relaxed select-text break-words whitespace-pre-wrap font-sans text-slate-100 font-normal" style="${msgTextStyle}">${GlobalChat.escapeHtml(m.message)}</p>
                        
                        <!-- Meta Time & Delete Action -->
                        <div class="flex items-center justify-end gap-2 mt-1 select-none">
                            ${deleteBtn}
                            <span class="text-[10px] text-slate-400 font-mono" style="${metaTextStyle}">${timeStr}</span>
                            ${statusSending}
                        </div>`;

                    return `
                    <div class="flex justify-end items-end gap-3.5 sm:gap-4 w-full group my-3 sm:my-3.5 pl-6 sm:pl-14">
                        ${GlobalChat.renderCharacterBubbleBox(userChatBubble, { isMe: true, innerHtml: myInnerBubbleHtml })}

                        <!-- Avatar Saya dengan Border Frame Eksklusif (Berjarak Aman & Elegan) -->
                        <div class="shrink-0 mb-0.5 ${userBorderUrl ? 'ml-1 sm:ml-1.5' : ''}">
                            ${avatarHtml}
                        </div>
                    </div>`;
                }

                // ==========================================
                // 2. PESAN ORANG LAIN (DI KIRI DENGAN AVATAR & BORDER)
                // ==========================================
                var otherInnerBubbleHtml = `
                    <!-- Header Nama Pengirim & Admin Centang Biru & Border Badge -->
                    <div class="flex items-center justify-between gap-2 mb-1.5 select-none cursor-pointer" onclick="${openProfileJs}" title="Klik untuk lihat profil & border ${GlobalChat.escapeHtml(displayUsername)}">
                        <span class="text-xs font-semibold text-slate-200 hover:text-amber-300 transition-colors tracking-tight truncate max-w-[130px] sm:max-w-[170px]" style="${nameColorStyle}"><span ${nameWrapAttr}>${renderedDisplayUsername}</span></span>
                        <div class="flex items-center gap-1 shrink-0 flex-nowrap overflow-x-auto hide-scrollbar">
                            ${userBadgesHtml}
                        </div>
                    </div>

                    <!-- Isi Pesan -->
                    <p class="text-[13px] sm:text-[14px] leading-relaxed select-text break-words whitespace-pre-wrap font-sans text-slate-200 font-normal" style="${msgTextStyle}">${GlobalChat.escapeHtml(m.message)}</p>

                    <!-- Meta Waktu & Delete Button -->
                    <div class="flex items-center justify-end gap-2 mt-1 select-none">
                        ${deleteBtn}
                        <span class="text-[10px] text-slate-500 font-mono" style="${metaTextStyle}">${timeStr}</span>
                    </div>`;

                return `
                <div class="flex justify-start items-start gap-3.5 sm:gap-4 w-full group my-3 sm:my-3.5 pr-6 sm:pr-14">
                    <!-- Avatar Pengirim dengan Border Frame Eksklusif (Berjarak Aman & Elegan) -->
                    <div class="shrink-0 mt-0.5 ${userBorderUrl ? 'mr-1 sm:mr-1.5' : ''}">
                        ${avatarHtml}
                    </div>

                    ${GlobalChat.renderCharacterBubbleBox(userChatBubble, { isMe: false, innerHtml: otherInnerBubbleHtml })}
                </div>`;
            }).join('');

            stream.innerHTML = dateDivider + messagesHtml;
            if (window.lucide) lucide.createIcons();

            if (shouldScroll) {
                GlobalChat.scrollToBottom();
            }
        },

        scrollToBottom() {
            var stream = document.getElementById('global-chat-stream');
            if (stream) {
                setTimeout(function() {
                    stream.scrollTop = stream.scrollHeight;
                }, 50);
            }
        },

        // Send Message
        async sendMessage() {
            var input = document.getElementById('global-chat-input');
            if (!input) return;

            var text = input.value.trim();
            if (!text) return;

            var u = GlobalChat.getCurrentUser();
            var token = (typeof Auth !== 'undefined' && Auth.token) ? Auth.token : (localStorage.getItem('musifystar_auth_token') || '');

            if (!u || !token) {
                if (typeof showToast === 'function') {
                    showToast('Silakan login terlebih dahulu untuk mengirim pesan.');
                }
                GlobalChat.close();
                if (typeof Auth !== 'undefined') Auth.openModal();
                return;
            }

            var btn = document.getElementById('global-chat-send-btn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin text-white"></i>';
                if (window.lucide) lucide.createIcons();
            }

            var myId = String(u.id || u.userId || '');
            var myEmail = (u.email || u.rawEmail || '').toLowerCase().trim();
            var isMasterAdmin = (myEmail === 'jrnabil570@gmail.com' || myId === '8589478687' || myId === 'u_1790196636099_622dc736');
            var myUsername = u.username || (isMasterAdmin ? 'MusifyStar Official' : 'Musisi');

            // Only pass admin token if user is actually Master Admin
            var adminToken = '';
            if (isMasterAdmin) {
                adminToken = (typeof Profile !== 'undefined' && typeof Profile.getAdminToken === 'function') 
                    ? Profile.getAdminToken() 
                    : (sessionStorage.getItem('musifystar_admin_token') || localStorage.getItem('musifystar_admin_token') || '');
            }

            // OPTIMISTIC UPDATE: Message immediately appears on the RIGHT with sending status
            var tempId = 'temp_' + Date.now();
            var myBorderUrl = (typeof Auth !== 'undefined' && Auth.getBorderUrl) ? Auth.getBorderUrl(u) : (u.borderUrl || '');
            var myBorderName = (typeof Auth !== 'undefined' && Auth.getBorderName) ? Auth.getBorderName(u) : (u.borderName || '');
            var myIsVip = isMasterAdmin || !!u.isPremium || !!u.is_premium;
            var myVipTier = isMasterAdmin ? 'permanent' : (u.vipTier || (myIsVip ? 'permanent' : 'none'));
            var myVipExpires = u.vipExpiresAt || 0;

            var optimisticMessage = {
                id: tempId,
                clientTempId: tempId,
                optimisticAuthorId: myId,
                userId: myId,
                username: myUsername,
                avatar: u.avatar || '',
                borderUrl: myBorderUrl,
                borderName: myBorderName,
                isVip: myIsVip,
                vipTier: myVipTier,
                vipExpiresAt: myVipExpires,
                equippedBadge: u.equippedBadge || '',
                equippedBadgeTitle: u.equippedBadgeTitle || '',
                equippedBadgeIcon: u.equippedBadgeIcon || '',
                equippedBadgeColor: u.equippedBadgeColor || '',
                nameGlow: u.nameGlow || '',
                chatBubble: u.chatBubble || '',
                message: text,
                badge: isMasterAdmin ? 'Admin' : 'Member',
                isAdmin: isMasterAdmin,
                isVerifiedAdmin: isMasterAdmin,
                avatarColor: isMasterAdmin ? 'from-slate-700 to-slate-900 border border-slate-600/60' : 'from-slate-700 to-slate-800',
                createdAt: new Date().toISOString(),
                isSending: true
            };

            GlobalChat.messages.push(optimisticMessage);
            input.value = '';
            GlobalChat.updateCharCount(input);
            GlobalChat.renderMessagesList(GlobalChat.messages, true);

            try {
                var headers = {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                    'X-Auth-Token': token,
                    'X-User-Id': myId,
                    'X-User-Name': myUsername,
                    'X-User-Email': myEmail
                };
                if (adminToken) {
                    headers['X-Admin-Token'] = adminToken;
                }

                var res = await fetch('/api/global-chat', {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        message: text,
                        clientTempId: tempId
                    })
                });

                var data = await res.json();
                if (data && data.status && data.chat) {
                    // Replace optimistic message with confirmed database record
                    var idx = GlobalChat.messages.findIndex(function(m) {
                        return m.clientTempId === tempId || String(m.id) === String(tempId);
                    });
                    if (idx !== -1) {
                        GlobalChat.messages[idx] = data.chat;
                    } else {
                        GlobalChat.messages.push(data.chat);
                    }
                    GlobalChat.renderMessagesList(GlobalChat.messages, true);
                    GlobalChat.fetchMessages(true);
                } else {
                    // Revert optimistic message if server failed
                    GlobalChat.messages = GlobalChat.messages.filter(function(m) { return m.clientTempId !== tempId; });
                    GlobalChat.renderMessagesList(GlobalChat.messages, false);
                    input.value = text;
                    GlobalChat.updateCharCount(input);
                    if (typeof showToast === 'function') {
                        showToast(data.message || 'Gagal mengirim pesan');
                    }
                }
            } catch (e) {
                GlobalChat.messages = GlobalChat.messages.filter(function(m) { return m.clientTempId !== tempId; });
                GlobalChat.renderMessagesList(GlobalChat.messages, false);
                input.value = text;
                GlobalChat.updateCharCount(input);
                if (typeof showToast === 'function') {
                    showToast('Gagal mengirim: ' + e.message);
                }
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="send" class="w-4 h-4 sm:w-5 sm:h-5 text-white"></i>';
                    if (window.lucide) lucide.createIcons();
                }
            }
        },

        // Delete message (Admin or author) - Fast & Reliable Execution
        async deleteMessage(event, id) {
            if (event) {
                try {
                    event.stopPropagation();
                    event.preventDefault();
                } catch (e) {}
            }
            if (!id) return;

            var u = GlobalChat.getCurrentUser();
            var myEmail = u ? (u.email || u.rawEmail || '').toLowerCase().trim() : '';
            var myId = u ? String(u.id || u.userId || '') : '';
            var myUsername = u ? (u.username || '') : '';
            var isMasterAdmin = (myEmail === 'jrnabil570@gmail.com' || myId === '8589478687' || myId === 'u_1790196636099_622dc736');

            var adminToken = '';
            if (isMasterAdmin) {
                adminToken = (typeof Profile !== 'undefined' && typeof Profile.getAdminToken === 'function') 
                    ? Profile.getAdminToken() 
                    : (sessionStorage.getItem('musifystar_admin_token') || localStorage.getItem('musifystar_admin_token') || '');
            }

            var userToken = (typeof Auth !== 'undefined' && Auth.token) 
                ? Auth.token 
                : (localStorage.getItem('musifystar_auth_token') || sessionStorage.getItem('musifystar_auth_token') || '');

            var headers = {
                'X-User-Id': myId,
                'X-User-Email': myEmail,
                'X-User-Name': myUsername
            };
            if (userToken) {
                headers['Authorization'] = 'Bearer ' + userToken;
                headers['X-Auth-Token'] = userToken;
            }
            if (adminToken) {
                headers['x-admin-token'] = adminToken;
            }

            // Optimistic UI removal for instantaneous responsiveness
            var removedMsg = GlobalChat.messages.find(function(m) { return String(m.id) === String(id); });
            GlobalChat.messages = GlobalChat.messages.filter(function(m) { return String(m.id) !== String(id); });
            GlobalChat.renderMessagesList(GlobalChat.messages, false);

            try {
                var res = await fetch('/api/global-chat?id=' + encodeURIComponent(id), {
                    method: 'DELETE',
                    headers: headers
                });
                var data = await res.json();
                if (data && data.status) {
                    if (typeof showToast === 'function') {
                        showToast('Pesan berhasil dihapus.');
                    }
                    GlobalChat.fetchMessages(true);
                } else {
                    // Revert if rejected by server
                    if (removedMsg) {
                        GlobalChat.messages.push(removedMsg);
                        GlobalChat.renderMessagesList(GlobalChat.messages, false);
                    }
                    if (typeof showToast === 'function') {
                        showToast(data.message || 'Gagal menghapus pesan');
                    }
                }
            } catch (e) {
                if (removedMsg) {
                    GlobalChat.messages.push(removedMsg);
                    GlobalChat.renderMessagesList(GlobalChat.messages, false);
                }
                if (typeof showToast === 'function') {
                    showToast('Terjadi kesalahan saat menghapus pesan');
                }
            }
        },

        formatTime(dateStr) {
            if (!dateStr) return '';
            try {
                var d = new Date(dateStr);
                var hours = String(d.getHours()).padStart(2, '0');
                var minutes = String(d.getMinutes()).padStart(2, '0');
                return hours + ':' + minutes;
            } catch (e) {
                return '';
            }
        },

        escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        escapeJs(t) {
            if (!t) return '';
            return String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, ' ').replace(/\r/g, '');
        },

        renderAvatarWithBorder(data) {
            var avatar = data.avatar || '';
            var borderUrl = data.borderUrl || '';
            var initial = data.initial || 'M';
            var avatarColor = data.avatarColor || 'from-slate-700 to-slate-800';
            var username = data.username || 'Musisi';
            var hasBorder = !!borderUrl;

            // When user has an equipped border, provide a dedicated 44px container footprint
            // so border flourishes, horns, wings, or dragons do not invade or collide with chat bubbles.
            var containerSize = hasBorder ? 44 : 34;
            var innerCircleSize = hasBorder ? 34 : 34;
            var frameSize = 46;
            var scaleStyle = (hasBorder && typeof Auth !== 'undefined' && Auth.getBorderScaleStyle) ? Auth.getBorderScaleStyle(borderUrl) : '';

            var borderImg = hasBorder ? `
                <img src="${borderUrl}" 
                     class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-w-none object-contain z-10 select-none drop-shadow-[0_0_8px_rgba(245,158,11,0.55)]" 
                     style="width: ${frameSize}px; height: ${frameSize}px; ${scaleStyle}"
                     alt="Border">
            ` : '';

            var innerImg = avatar ? `
                <img src="${avatar}" 
                     class="w-full h-full rounded-full object-cover z-0" 
                     onerror="this.onerror=null; this.src='/logo.png';" 
                     alt="${GlobalChat.escapeHtml(username)}">
            ` : `
                <div class="w-full h-full rounded-full bg-gradient-to-tr ${avatarColor} flex items-center justify-center text-white font-black text-xs z-0 shadow-inner">
                    ${initial}
                </div>
            `;

            var clickAction = `GlobalChat.showUserProfileModal('${GlobalChat.escapeJs(data.userId || '')}', '${GlobalChat.escapeJs(username)}', '${GlobalChat.escapeJs(avatar)}', '${GlobalChat.escapeJs(borderUrl)}', '${GlobalChat.escapeJs(data.borderName || '')}', ${!!data.isAdmin}, ${!!data.isVip}, '${GlobalChat.escapeJs(data.vipTier || '')}', ${data.vipExpiresAt || 0}, '${GlobalChat.escapeJs(data.nameGlow || '')}')`;

            return `
            <div class="relative shrink-0 flex items-center justify-center cursor-pointer hover:scale-105 active:scale-95 transition-transform select-none" 
                 style="width: ${containerSize}px; height: ${containerSize}px;" 
                 onclick="${clickAction}" 
                 title="Lihat Profil & Border ${GlobalChat.escapeHtml(username)}">
                <div class="rounded-full overflow-hidden flex items-center justify-center shadow-md relative z-0 ring-1 ring-white/10"
                     style="width: ${innerCircleSize}px; height: ${innerCircleSize}px;">
                    ${innerImg}
                </div>
                ${borderImg}
            </div>
            `;
        },

        getBorderBadgeHTML(borderName, borderUrl, isVip) {
            if (borderName && borderName !== 'none' && borderName !== 'Tanpa Border') {
                var bLower = borderName.toLowerCase();
                var badgeClass = 'bg-amber-400/15 border-amber-400/30 text-amber-300';
                var icon = 'shield';
                if (bLower.includes('platinum')) {
                    badgeClass = 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300';
                } else if (bLower.includes('master')) {
                    badgeClass = 'bg-orange-500/15 border-orange-400/30 text-orange-300';
                } else if (bLower.includes('legend')) {
                    badgeClass = 'bg-yellow-500/15 border-yellow-400/30 text-yellow-300';
                } else if (bLower.includes('immortal') || bLower.includes('imortal')) {
                    badgeClass = 'bg-pink-500/15 border-pink-400/30 text-pink-300';
                }
                return `
                <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full border text-[9px] font-bold ${badgeClass} shadow-sm select-none" title="Border Frame: ${GlobalChat.escapeHtml(borderName)}">
                    <i data-lucide="${icon}" class="w-2.5 h-2.5"></i>
                    <span>${GlobalChat.escapeHtml(borderName)}</span>
                </span>`;
            } else if (isVip) {
                return (typeof Auth !== 'undefined' && Auth.getVipBadgeHTML) ? Auth.getVipBadgeHTML('text-[8.5px] px-1.5 py-0.2') : `
                <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-extrabold text-[8.5px] shadow-[0_0_8px_rgba(245,158,11,0.4)] border border-amber-300/50 select-none">
                    <svg class="w-2.5 h-2.5 shrink-0 fill-black text-black" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.3 8.87l5.378-2.689a.5.5 0 0 1 .7.574l-2.002 11.01a1 1 0 0 1-.985.821H5.609a1 1 0 0 1-.985-.821L2.622 6.755a.5.5 0 0 1 .7-.574l5.378 2.689z"/></svg>
                    <span>VIP</span>
                </span>`;
            }
            return '';
        },

        closeUserProfileModal() {
            if (GlobalChat._profileModalPollTimer) {
                clearInterval(GlobalChat._profileModalPollTimer);
                GlobalChat._profileModalPollTimer = null;
            }
            var existing = document.getElementById('chat-user-profile-modal');
            if (existing) existing.remove();
        },

        async sendFriendRequest(targetId, targetName) {
            var me = GlobalChat.getCurrentUser();
            if (!me) {
                if (typeof showToast === 'function') showToast('Silakan login terlebih dahulu untuk menambah teman.');
                return;
            }
            var myId = String(me.id || me.userId || '');
            var myName = String(me.username || '');
            var myAvatar = String(me.avatar || '');

            GlobalChat._friendActionBusy = true;
            GlobalChat._friendActionSeq = (GlobalChat._friendActionSeq || 0) + 1;

            // Optimistic UI update so it immediately shows Menunggu Konfirmasi without jumping
            if (GlobalChat._currentModalProfile) {
                GlobalChat._currentModalProfile.friendStatus = 'outgoing_pending';
                var container = document.getElementById('chat-profile-dynamic-body');
                if (container) {
                    container.innerHTML = GlobalChat.renderProfileDetailsContent(GlobalChat._currentModalProfile, false);
                    if (window.lucide) lucide.createIcons();
                }
            }

            try {
                var res = await fetch('/api/global-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': myId,
                        'X-User-Name': myName
                    },
                    body: JSON.stringify({
                        action: 'friend_request',
                        fromId: myId,
                        fromName: myName,
                        fromAvatar: myAvatar,
                        toId: targetId,
                        toName: targetName
                    })
                });
                var data = await res.json();
                GlobalChat._friendActionBusy = false;
                if (data && data.status) {
                    if (typeof showToast === 'function') showToast(data.message || 'Permintaan pertemanan terkirim!');
                    GlobalChat.refreshOpenProfileModal(targetId, targetName, true);
                } else {
                    if (typeof showToast === 'function') showToast((data && data.message) || 'Gagal mengirim permintaan pertemanan.');
                    GlobalChat.refreshOpenProfileModal(targetId, targetName, true);
                }
            } catch (e) {
                GlobalChat._friendActionBusy = false;
                if (typeof showToast === 'function') showToast('Gagal mengirim permintaan pertemanan.');
                GlobalChat.refreshOpenProfileModal(targetId, targetName, true);
            }
        },

        async removeFriendRequest(targetId, targetName, reqId) {
            var me = GlobalChat.getCurrentUser();
            if (!me) return;
            var myId = String(me.id || me.userId || '');
            var myName = String(me.username || '');

            GlobalChat._friendActionBusy = true;
            GlobalChat._friendActionSeq = (GlobalChat._friendActionSeq || 0) + 1;

            if (GlobalChat._currentModalProfile) {
                GlobalChat._currentModalProfile.friendStatus = 'none';
                GlobalChat._currentModalProfile.friendReqId = '';
                var container = document.getElementById('chat-profile-dynamic-body');
                if (container) {
                    container.innerHTML = GlobalChat.renderProfileDetailsContent(GlobalChat._currentModalProfile, false);
                    if (window.lucide) lucide.createIcons();
                }
            }

            try {
                var res = await fetch('/api/global-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': myId,
                        'X-User-Name': myName
                    },
                    body: JSON.stringify({
                        action: 'friend_remove',
                        reqId: reqId || '',
                        fromId: myId,
                        fromName: myName,
                        toId: targetId,
                        toName: targetName
                    })
                });
                var data = await res.json();
                GlobalChat._friendActionBusy = false;
                if (data && data.status) {
                    if (typeof showToast === 'function') showToast(data.message || 'Pertemanan dibatalkan.');
                    GlobalChat.fetchMessages(true);
                    GlobalChat.refreshOpenProfileModal(targetId, targetName, true);
                }
            } catch (e) {
                GlobalChat._friendActionBusy = false;
                GlobalChat.refreshOpenProfileModal(targetId, targetName, true);
            }
        },

        async respondFriendRequest(reqId, senderId, senderName, decision) {
            var me = GlobalChat.getCurrentUser();
            if (!me) return;
            var myId = String(me.id || me.userId || '');
            var myName = String(me.username || '');

            GlobalChat._friendActionBusy = true;
            GlobalChat._friendActionSeq = (GlobalChat._friendActionSeq || 0) + 1;

            // Optimistically remove from incomingFriendRequests banner
            if (Array.isArray(GlobalChat.incomingFriendRequests)) {
                GlobalChat.incomingFriendRequests = GlobalChat.incomingFriendRequests.filter(function(r) {
                    return r.id !== reqId && !GlobalChat.matchesIdentity(r.fromId, r.fromName, senderId, senderName);
                });
                if (GlobalChat.isOpen) {
                    GlobalChat.renderMessagesList(GlobalChat.messages || [], false);
                }
            }

            if (GlobalChat._currentModalProfile && GlobalChat.matchesIdentity(GlobalChat._currentModalProfile.id, GlobalChat._currentModalProfile.username, senderId, senderName)) {
                GlobalChat._currentModalProfile.friendStatus = decision === 'accepted' ? 'accepted' : 'incoming_rejected';
                var container = document.getElementById('chat-profile-dynamic-body');
                if (container) {
                    container.innerHTML = GlobalChat.renderProfileDetailsContent(GlobalChat._currentModalProfile, false);
                    if (window.lucide) lucide.createIcons();
                }
            }

            try {
                var res = await fetch('/api/global-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-Id': myId,
                        'X-User-Name': myName
                    },
                    body: JSON.stringify({
                        action: 'friend_respond',
                        reqId: reqId,
                        senderId: senderId,
                        senderName: senderName,
                        fromId: myId,
                        fromName: myName,
                        decision: decision
                    })
                });
                var data = await res.json();
                GlobalChat._friendActionBusy = false;
                if (data && data.status) {
                    if (typeof showToast === 'function') showToast(data.message || 'Status pertemanan diperbarui.');
                    GlobalChat.fetchMessages(true);
                    var openModal = document.getElementById('chat-user-profile-modal');
                    if (openModal) {
                        var tId = openModal.getAttribute('data-target-id') || '';
                        var tName = openModal.getAttribute('data-target-name') || '';
                        GlobalChat.refreshOpenProfileModal(tId, tName, true);
                    }
                }
            } catch (e) {
                GlobalChat._friendActionBusy = false;
                if (typeof showToast === 'function') showToast('Gagal memproses permintaan pertemanan.');
            }
        },

        renderProfileDetailsContent(p, isSelf) {
            var isTargetAdmin = Boolean(p.isAdmin || String(p.username || '').toLowerCase().trim() === 'musifystar' || String(p.id || '') === '8589478687');
            var isVipActive = Boolean(isTargetAdmin || p.isVip);

            // 1. Username + Verified / VIP
            var verifiedHtml = isTargetAdmin
                ? `<span class="inline-flex items-center shrink-0" style="margin-left: 2.5px; transform: translateY(-0.5px); line-height: 1;"><svg style="width: 14px; height: 14px;" class="shrink-0 block" viewBox="2 2 20 20" fill="none"><circle cx="12" cy="12" r="10" fill="#0095F6"/><path fill-rule="evenodd" clip-rule="evenodd" d="M16.707 8.293a1 1 0 0 1 0 1.414l-6 6a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L10 13.586l5.293-5.293a1 1 0 0 1 1.414 0z" fill="#FFFFFF"/></svg></span>`
                : '';
            var vipBadge = isVipActive && typeof Auth !== 'undefined' && Auth.getVipBadgeHTML ? Auth.getVipBadgeHTML('text-[7.5px]') : '';

            // 2. ID (Jika memakai Custom ID: sembunyikan ID utama & tampilkan Custom ID langsung tanpa teks "Custom ID")
            var fallbackNumericId = GlobalChat.derive10DigitId(p.username, isTargetAdmin);
            var rawOrigId = String(p.originalId || '').trim();
            var rawId = String(p.id || '').trim();
            var baseNumericId = isTargetAdmin
                ? '8589478687'
                : (/^\d{10}$/.test(rawOrigId) ? rawOrigId : (/^\d{10}$/.test(rawId) ? rawId : fallbackNumericId));
            var customIdText = String(p.customId || '').trim();
            if (!customIdText && rawId && !rawId.startsWith('u_') && rawId !== baseNumericId) {
                customIdText = rawId;
            }
            var hasCustomId = Boolean((isVipActive || isTargetAdmin) && customIdText && customIdText !== baseNumericId);
            var displayIdText = hasCustomId ? customIdText : baseNumericId;

            // 3. Logo Rank Badge
            var rankBadgeHtml = '';
            if (typeof Auth !== 'undefined' && Auth.getRankBadgePillHTML) {
                if (p.equippedBadgeTitle || p.equippedBadge) {
                    rankBadgeHtml = Auth.getRankBadgePillHTML(p.equippedBadge, p.equippedBadgeTitle, p.equippedBadgeIcon, p.equippedBadgeColor, 'text-[8px]');
                } else if (isTargetAdmin) {
                    rankBadgeHtml = Auth.getRankBadgePillHTML('badge_diamond', 'Diamond', 'gem', '#0284c7', 'text-[8px]');
                }
            }
            if (!rankBadgeHtml) {
                rankBadgeHtml = `<span class="text-slate-400 font-semibold text-[11px]">${isTargetAdmin ? '💎 Diamond' : 'Belum Terpasang'}</span>`;
            }

            // 4. Logo Border Immortal (if Admin or VIP)
            var showBorderRow = Boolean(isTargetAdmin || isVipActive);
            var borderDisplayName = isTargetAdmin ? (p.borderName && p.borderName !== 'Tanpa Border' ? p.borderName : 'Immortal') : (p.borderName && p.borderName !== 'Tanpa Border' ? p.borderName : 'VIP Border');
            var borderBadgeHtml = GlobalChat.getBorderBadgeHTML(borderDisplayName, p.borderUrl || (isTargetAdmin ? '/borders/Imortal.png' : ''), isVipActive) ||
                `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/35 text-amber-300 text-[9.5px] font-extrabold"><i data-lucide="shield" class="w-3 h-3 text-amber-400"></i> ${GlobalChat.escapeHtml(borderDisplayName)}</span>`;

            // 5. Logo Mega Supporter (Always for Admin, or if user has donatur activeBadge)
            var donaturObj = p.donatur;
            if (isTargetAdmin && (!donaturObj || !donaturObj.activeBadge)) {
                donaturObj = { activeBadge: { id: 'donatur_300k', title: 'Mega Supporter', icon: 'gem', color: '#a855f7' } };
            }
            var hasMegaSupporter = Boolean(isTargetAdmin || (donaturObj && (donaturObj.activeBadge || donaturObj.title)));
            var megaSupporterHtml = '';
            if (hasMegaSupporter) {
                if (typeof Auth !== 'undefined' && Auth.getDonaturBadgeHTML) {
                    megaSupporterHtml = Auth.getDonaturBadgeHTML(donaturObj, 'text-[8px]');
                }
                if (!megaSupporterHtml) {
                    megaSupporterHtml = `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-400/50 text-purple-300 text-[9px] font-black">💎 Mega Supporter</span>`;
                }
            }

            // 7. Status Pengguna Mendengarkan (Hari, Jam, Menit)
            var formattedListening = p.formattedListening || '0 Hari, 0 Jam, 0 Menit';

            // 8. Friend Request Section (Musik Tambah Teman)
            var friendSectionHtml = '';
            if (!isSelf) {
                var fStat = p.friendStatus || 'none';
                var tIdJs = GlobalChat.escapeJs(p.id || '');
                var tNameJs = GlobalChat.escapeJs(p.username || '');
                var reqIdJs = GlobalChat.escapeJs(p.friendReqId || '');

                if (fStat === 'loading') {
                    friendSectionHtml = `
                    <div class="p-2.5 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center gap-2 text-xs text-slate-400">
                        <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i>
                        <span>Memeriksa status pertemanan...</span>
                    </div>`;
                } else if (fStat === 'accepted') {
                    friendSectionHtml = `
                    <div class="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-between text-xs">
                        <span class="text-emerald-200 font-bold flex items-center gap-1.5">
                            <i data-lucide="user-check" class="w-4 h-4 text-emerald-400"></i>
                            <span>Status Pertemanan:</span>
                        </span>
                        <div class="flex items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-full bg-emerald-500/25 border border-emerald-400/50 text-emerald-300 font-black text-[10.5px]">✓ Sudah Berteman</span>
                            <button type="button" onclick="GlobalChat.removeFriendRequest('${tIdJs}', '${tNameJs}', '${reqIdJs}')" class="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-rose-500/30 text-white/70 hover:text-rose-200 text-[9.5px] font-bold cursor-pointer transition-colors" title="Hapus Pertemanan">Hapus</button>
                        </div>
                    </div>`;
                } else if (fStat === 'incoming_pending') {
                    friendSectionHtml = `
                    <div class="p-3 rounded-2xl bg-sky-500/15 border border-sky-400/45 space-y-2">
                        <div class="flex items-center justify-between text-xs">
                            <span class="text-sky-200 font-extrabold flex items-center gap-1.5">
                                <i data-lucide="user-plus" class="w-4 h-4 text-sky-400"></i>
                                <span>Permintaan Pertemanan Masuk</span>
                            </span>
                        </div>
                        <div class="grid grid-cols-2 gap-2">
                            <button type="button" onclick="GlobalChat.respondFriendRequest('${reqIdJs}', '${tIdJs}', '${tNameJs}', 'accepted')" class="py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md">
                                <i data-lucide="check" class="w-3.5 h-3.5"></i>
                                <span>Terima</span>
                            </button>
                            <button type="button" onclick="GlobalChat.respondFriendRequest('${reqIdJs}', '${tIdJs}', '${tNameJs}', 'rejected')" class="py-2 px-3 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 border border-rose-400/50 text-rose-200 font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer">
                                <i data-lucide="x" class="w-3.5 h-3.5"></i>
                                <span>Tolak</span>
                            </button>
                        </div>
                    </div>`;
                } else if (fStat === 'outgoing_pending') {
                    friendSectionHtml = `
                    <div class="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-400/40 flex items-center justify-between text-xs">
                        <span class="text-amber-200 font-bold flex items-center gap-1.5">
                            <i data-lucide="clock" class="w-4 h-4 text-amber-400"></i>
                            <span>Status Pertemanan:</span>
                        </span>
                        <div class="flex items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 font-extrabold text-[10px]">⏳ Menunggu Konfirmasi</span>
                            <button type="button" onclick="GlobalChat.removeFriendRequest('${tIdJs}', '${tNameJs}', '${reqIdJs}')" class="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-rose-500/30 text-white/70 hover:text-rose-200 text-[9.5px] font-bold cursor-pointer transition-colors" title="Batalkan permintaan">Batal</button>
                        </div>
                    </div>`;
                } else if (fStat === 'outgoing_rejected') {
                    friendSectionHtml = `
                    <div class="p-2.5 rounded-2xl bg-rose-500/15 border border-rose-400/45 flex items-center justify-between text-xs">
                        <span class="text-rose-200 font-bold flex items-center gap-1.5">
                            <i data-lucide="user-x" class="w-4 h-4 text-rose-400"></i>
                            <span>Status Pertemanan:</span>
                        </span>
                        <div class="flex items-center gap-1.5">
                            <span class="px-2.5 py-0.5 rounded-full bg-rose-500/25 border border-rose-400/50 text-rose-300 font-black text-[10.5px]">✕ Status: Ditolak</span>
                            <button type="button" onclick="GlobalChat.sendFriendRequest('${tIdJs}', '${tNameJs}')" class="px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/80 text-[9.5px] font-bold cursor-pointer" title="Kirim ulang permintaan pertemanan">Ulang</button>
                        </div>
                    </div>`;
                } else {
                    friendSectionHtml = `
                    <button type="button" id="chat-profile-friend-btn" onclick="GlobalChat.sendFriendRequest('${tIdJs}', '${tNameJs}')" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-sky-500/25 via-indigo-500/25 to-purple-500/25 hover:from-sky-500/35 hover:to-purple-500/35 border border-sky-400/45 text-sky-200 font-extrabold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer shadow-md">
                        <i data-lucide="user-plus" class="w-4 h-4 text-sky-400"></i>
                        <span>Tambah Teman Musik</span>
                    </button>`;
                }
            } else if (Array.isArray(GlobalChat.incomingFriendRequests) && GlobalChat.incomingFriendRequests.length > 0) {
                friendSectionHtml = `
                <div class="p-3 rounded-2xl bg-sky-500/15 border border-sky-400/40 space-y-2">
                    <p class="text-[11px] font-extrabold text-sky-300 flex items-center gap-1.5">
                        <i data-lucide="users" class="w-3.5 h-3.5"></i>
                        <span>Permintaan Pertemanan Masuk (${GlobalChat.incomingFriendRequests.length})</span>
                    </p>
                    <div class="space-y-1.5 max-h-28 overflow-y-auto hide-scrollbar">
                        ${GlobalChat.incomingFriendRequests.map(function(req) {
                            return `
                            <div class="flex items-center justify-between gap-2 bg-black/40 p-2 rounded-xl border border-white/10">
                                <span class="text-xs font-bold text-white truncate">@${GlobalChat.escapeHtml(req.fromName || 'Pengguna')}</span>
                                <div class="flex items-center gap-1 shrink-0">
                                    <button type="button" onclick="GlobalChat.respondFriendRequest('${GlobalChat.escapeJs(req.id)}', '${GlobalChat.escapeJs(req.fromId)}', '${GlobalChat.escapeJs(req.fromName)}', 'accepted')" class="px-2 py-1 rounded-lg bg-emerald-500 text-black font-black text-[10px] cursor-pointer">Terima</button>
                                    <button type="button" onclick="GlobalChat.respondFriendRequest('${GlobalChat.escapeJs(req.id)}', '${GlobalChat.escapeJs(req.fromId)}', '${GlobalChat.escapeJs(req.fromName)}', 'rejected')" class="px-2 py-1 rounded-lg bg-rose-500/30 border border-rose-400/50 text-rose-200 font-black text-[10px] cursor-pointer">Tolak</button>
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>`;
            }

            return `
                <!-- Details Card (Sesuai Spesifikasi Baru Tanpa Masa Berlaku VIP) -->
                <div class="p-3.5 rounded-2xl bg-black/55 border border-slate-700/70 space-y-2.5 text-xs text-left">
                    <!-- 1. Username -->
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-slate-400 text-[11px] shrink-0">Username:</span>
                        <div class="flex items-center gap-1.5 min-w-0 justify-end">
                            <span class="inline-flex items-center min-w-0">
                                <span class="font-black text-white truncate max-w-[140px]">${(typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && p.nameGlow) ? Auth.renderUsernameWithGlow(p.username, p.nameGlow) : GlobalChat.escapeHtml(p.username)}</span>
                                ${verifiedHtml}
                            </span>
                            ${vipBadge}
                        </div>
                    </div>

                    <!-- 2. ID (Jika memakai Custom ID, tampilkan Custom ID tanpa teks Custom ID & sembunyikan ID utama) -->
                    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5">
                        <span class="text-slate-400 text-[11px] shrink-0">ID:</span>
                        <div class="flex items-center gap-1.5 justify-end flex-wrap">
                            <span class="font-mono font-black text-amber-300 tracking-wider text-[11.5px]">${GlobalChat.escapeHtml(displayIdText)}</span>
                        </div>
                    </div>

                    <!-- 3. Logo Rank Badge -->
                    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5">
                        <span class="text-slate-400 text-[11px] shrink-0">Logo Rank Badge:</span>
                        <div class="flex items-center justify-end">${rankBadgeHtml}</div>
                    </div>

                    <!-- 4. Logo Border Immortal (Jika VIP / Admin) -->
                    ${showBorderRow ? `
                    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5">
                        <span class="text-slate-400 text-[11px] shrink-0">Logo Border ${isTargetAdmin ? 'Immortal' : ''}:</span>
                        <div class="flex items-center justify-end">${borderBadgeHtml}</div>
                    </div>
                    ` : ''}

                    <!-- 5. Logo Mega Supporter (Muncul jika pengguna punya / Admin) -->
                    ${hasMegaSupporter ? `
                    <div class="flex items-center justify-between gap-2 pt-1.5 border-t border-white/5">
                        <span class="text-slate-400 text-[11px] shrink-0">Logo Mega Supporter:</span>
                        <div class="flex items-center justify-end">${megaSupporterHtml}</div>
                    </div>
                    ` : ''}

                    <!-- 8. Status Pengguna Mendengarkan (Hari, Jam, Menit) -->
                    <div class="pt-1.5 border-t border-white/5 space-y-1">
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-slate-400 text-[11px] shrink-0">Status Mendengarkan:</span>
                            <span class="font-mono font-bold text-cyan-300 text-[10.5px]">${GlobalChat.escapeHtml(formattedListening)}</span>
                        </div>
                        ${p.currentTrack ? `
                        <div class="flex items-center gap-1.5 text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2 py-1 rounded-xl truncate">
                            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping shrink-0"></span>
                            <span class="truncate">🎵 ${GlobalChat.escapeHtml(p.currentTrack)}</span>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Friend Request Controls (Tambah Teman / Terima / Tolak / Status Ditolak) -->
                ${friendSectionHtml ? `<div class="pt-0.5">${friendSectionHtml}</div>` : ''}
            `;
        },

        async refreshOpenProfileModal(targetId, targetName, force) {
            var modal = document.getElementById('chat-user-profile-modal');
            if (!modal) return;
            if (GlobalChat._friendActionBusy && !force) return;

            var seqBefore = GlobalChat._friendActionSeq || 0;
            var me = GlobalChat.getCurrentUser();
            var myId = me ? String(me.id || me.userId || '') : '';
            var myName = me ? String(me.username || '') : '';
            var isSelf = GlobalChat.matchesIdentity(targetId, targetName, myId, myName);

            try {
                var url = '/api/global-chat?action=user_profile&targetId=' + encodeURIComponent(targetId || '') +
                          '&targetName=' + encodeURIComponent(targetName || '') +
                          '&myId=' + encodeURIComponent(myId) +
                          '&myName=' + encodeURIComponent(myName) +
                          '&t=' + Date.now();
                var res = await fetch(url, { cache: 'no-store' });
                var data = await res.json();
                // Ignore stale fetch if user clicked a friend button while this GET was in flight
                if (!force && (GlobalChat._friendActionBusy || (GlobalChat._friendActionSeq || 0) !== seqBefore)) {
                    return;
                }
                if (data && data.status && data.profile) {
                    if (Array.isArray(data.incomingFriendRequests)) {
                        GlobalChat.incomingFriendRequests = data.incomingFriendRequests;
                    }
                    if (Array.isArray(data.friendUpdates)) {
                        GlobalChat.friendUpdates = data.friendUpdates;
                    }
                    if (!data.profile.nameGlow && GlobalChat._currentModalProfile && GlobalChat._currentModalProfile.nameGlow) {
                        data.profile.nameGlow = GlobalChat._currentModalProfile.nameGlow;
                    }
                    if (data.profile.nameGlow) {
                        if (!GlobalChat._userGlowCache) GlobalChat._userGlowCache = {};
                        if (data.profile.id) GlobalChat._userGlowCache[String(data.profile.id)] = data.profile.nameGlow;
                        if (targetId) GlobalChat._userGlowCache[String(targetId)] = data.profile.nameGlow;
                        if (data.profile.username) GlobalChat._userGlowCache[String(data.profile.username).toLowerCase().trim()] = data.profile.nameGlow;
                    }
                    GlobalChat._currentModalProfile = data.profile;
                    var headerNameEl = document.getElementById('chat-profile-header-username');
                    if (headerNameEl && data.profile.username) {
                        headerNameEl.innerHTML = (typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && data.profile.nameGlow)
                            ? Auth.renderUsernameWithGlow(data.profile.username, data.profile.nameGlow)
                            : GlobalChat.escapeHtml(data.profile.username);
                    }
                    var container = document.getElementById('chat-profile-dynamic-body');
                    if (container) {
                        var nextHtml = GlobalChat.renderProfileDetailsContent(data.profile, isSelf);
                        if (container._lastRenderedHtml !== nextHtml) {
                            container._lastRenderedHtml = nextHtml;
                            container.innerHTML = nextHtml;
                            if (window.lucide) lucide.createIcons();
                        }
                    }
                }
            } catch (e) {}
        },

        derive10DigitId(seedName, isAdm) {
            if (isAdm) return '8589478687';
            var clean = String(seedName || 'musisi').toLowerCase().trim();
            if (clean === 'musifystar' || clean === 'musifystar official' || clean === 'nabil') return '8589478687';
            var h1 = 2166136261;
            var h2 = 16777619;
            for (var i = 0; i < clean.length; i++) {
                var c = clean.charCodeAt(i);
                h1 ^= c;
                h1 = Math.imul(h1, 16777619) >>> 0;
                h2 ^= (c + i * 31);
                h2 = Math.imul(h2, 1103515245) >>> 0;
            }
            var firstDigit = (h1 % 9) + 1;
            var restDigits = String((h1 ^ h2) >>> 0).padStart(9, '0').slice(0, 9);
            return String(firstDigit) + restDigits;
        },

        showUserProfileModal(userId, username, avatar, borderUrl, borderName, isAdmin, isVip, vipTier, vipExpiresAt, nameGlow) {
            GlobalChat.closeUserProfileModal();

            var me = GlobalChat.getCurrentUser();
            var myId = me ? String(me.id || me.userId || '') : '';
            var myName = me ? String(me.username || '').toLowerCase().trim() : '';
            var targetName = (username || '').toLowerCase().trim();
            var isSelf = GlobalChat.matchesIdentity(userId, username, myId, myName);

            var isTargetAdmin = Boolean(isAdmin || targetName === 'musifystar' || targetName === 'musifystar official' || String(userId) === '8589478687');
            var safeName = username || (isTargetAdmin ? 'MusifyStar' : 'Musisi');
            var safeAvatar = avatar || (isSelf && me ? (me.avatar || '') : '');
            var safeBorderUrl = borderUrl || (isTargetAdmin ? '/borders/Imortal.png' : '');
            var safeBorderName = borderName || (isTargetAdmin ? 'Immortal' : (isVip ? 'VIP Frame' : 'Tanpa Border'));
            var isVipActive = Boolean(isTargetAdmin || (isVip && (!vipExpiresAt || Date.now() <= Number(vipExpiresAt)) && vipTier !== 'none'));

            var rawInitialId = isSelf && me ? String(me.id || userId || '') : String(userId || '');
            var cleanInitialId = (rawInitialId && !rawInitialId.startsWith('u_'))
                ? rawInitialId
                : GlobalChat.derive10DigitId(safeName, isTargetAdmin);

            var matchedMsg = (GlobalChat.messages || []).find(function(m) {
                return GlobalChat.matchesIdentity(m.userId, m.username, userId || cleanInitialId, safeName) && m.nameGlow;
            });
            var initialNameGlow = String(
                nameGlow ||
                (isSelf && me && me.nameGlow ? me.nameGlow : '') ||
                (matchedMsg && matchedMsg.nameGlow ? matchedMsg.nameGlow : '') ||
                (GlobalChat._userGlowCache && (GlobalChat._userGlowCache[String(userId || '')] || GlobalChat._userGlowCache[String(cleanInitialId || '')] || GlobalChat._userGlowCache[targetName])) ||
                ''
            ).trim();
            if (initialNameGlow) {
                if (!GlobalChat._userGlowCache) GlobalChat._userGlowCache = {};
                if (userId) GlobalChat._userGlowCache[String(userId)] = initialNameGlow;
                if (cleanInitialId) GlobalChat._userGlowCache[String(cleanInitialId)] = initialNameGlow;
                if (targetName) GlobalChat._userGlowCache[targetName] = initialNameGlow;
            }

            var localFriendInfo = isSelf ? { status: 'none', reqId: '' } : GlobalChat.resolveLocalFriendStatus(cleanInitialId, safeName);

            var initialProfile = {
                id: cleanInitialId,
                customId: isSelf && me ? (me.customId || '') : '',
                originalId: isSelf && me ? (me.originalId || cleanInitialId) : cleanInitialId,
                username: safeName,
                avatar: safeAvatar,
                isAdmin: isTargetAdmin,
                isVip: isVipActive,
                borderName: safeBorderName,
                borderUrl: safeBorderUrl,
                equippedBadge: isSelf && me ? (me.equippedBadge || '') : (isTargetAdmin ? 'badge_diamond' : ''),
                equippedBadgeTitle: isSelf && me ? (me.equippedBadgeTitle || '') : (isTargetAdmin ? 'Diamond' : ''),
                equippedBadgeIcon: isSelf && me ? (me.equippedBadgeIcon || '') : (isTargetAdmin ? 'gem' : ''),
                equippedBadgeColor: isSelf && me ? (me.equippedBadgeColor || '') : (isTargetAdmin ? '#0284c7' : ''),
                nameGlow: initialNameGlow,
                donatur: isSelf && me ? (me.donatur || null) : null,
                globalStatsRank: isTargetAdmin ? 1 : null,
                formattedListening: isTargetAdmin ? '0 Hari, 14 Jam, 50 Menit' : 'Memuat durasi...',
                currentTrack: '',
                friendStatus: localFriendInfo.status,
                friendReqId: localFriendInfo.reqId
            };
            GlobalChat._currentModalProfile = initialProfile;

            var checkmarkSvg = isTargetAdmin ? GlobalChat.getAdminBlueCheckmarkHTML() : '';
            var subTitleText = isTargetAdmin ? 'Owner MusifyStar' : (isVipActive ? 'Member VIP MusifyStar' : 'Member MusifyStar');
            var headerUsernameHtml = (typeof Auth !== 'undefined' && Auth.renderUsernameWithGlow && initialNameGlow)
                ? Auth.renderUsernameWithGlow(safeName, initialNameGlow)
                : GlobalChat.escapeHtml(safeName);

            var modal = document.createElement('div');
            modal.id = 'chat-user-profile-modal';
            modal.setAttribute('data-target-id', String(userId || ''));
            modal.setAttribute('data-target-name', String(safeName || ''));
            modal.className = 'fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in select-none';
            modal.onclick = function(e) {
                if (e.target === modal) GlobalChat.closeUserProfileModal();
            };

            modal.innerHTML = `
                <div class="relative w-full max-w-sm bg-[#12151d] border border-slate-700/80 rounded-3xl p-5 shadow-2xl shadow-black/90 space-y-3.5 overflow-hidden max-h-[92dvh] overflow-y-auto hide-scrollbar">
                    <!-- Close button -->
                    <button onclick="GlobalChat.closeUserProfileModal()" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 active:scale-90 flex items-center justify-center text-white/70 hover:text-white transition-all cursor-pointer z-20" title="Tutup">
                        <i data-lucide="x" class="w-4 h-4"></i>
                    </button>

                    <!-- Decorative glow -->
                    <div class="absolute -top-12 -left-12 w-44 h-44 bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>

                    <div class="text-center pt-1 relative z-10">
                        <span class="text-[10px] uppercase tracking-widest text-slate-400 font-mono font-bold block mb-2.5">Tampilan Profil & Border</span>
                        
                        <!-- Grand Centered Avatar with Frame -->
                        <div class="relative w-28 h-28 mx-auto flex items-center justify-center my-1.5">
                            <div class="w-20 h-20 rounded-full overflow-hidden bg-black/90 flex items-center justify-center shadow-inner z-0 ring-2 ring-white/10">
                                ${safeAvatar ? `
                                    <img src="${safeAvatar}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='/logo.png';" alt="${GlobalChat.escapeHtml(safeName)}">
                                ` : `
                                    <div class="w-full h-full bg-gradient-to-tr from-slate-700 to-slate-800 flex items-center justify-center text-white font-black text-2xl">
                                        ${safeName.charAt(0).toUpperCase()}
                                    </div>
                                `}
                            </div>
                            ${safeBorderUrl ? `
                                <img src="${safeBorderUrl}" style="${typeof Auth !== 'undefined' && Auth.getBorderScaleStyle ? Auth.getBorderScaleStyle(safeBorderUrl) : ''}" class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[108px] h-[108px] max-w-none object-contain z-10 select-none drop-shadow-[0_0_18px_rgba(245,158,11,0.65)]" alt="" onerror="this.onerror=null; this.style.display='none';">
                            ` : ''}
                        </div>

                        <!-- Username & Status Header -->
                        <div class="mt-1.5">
                            <h3 class="text-base font-black text-white flex items-center justify-center gap-1.5 flex-wrap">
                                <span id="chat-profile-header-username">${headerUsernameHtml}</span>
                                ${checkmarkSvg}
                            </h3>
                            <p class="text-xs ${isTargetAdmin ? 'text-amber-300 font-bold' : 'text-slate-400'} mt-0.5">${subTitleText}</p>
                        </div>
                    </div>

                    <!-- Dynamic Profile & Friend Status Body -->
                    <div id="chat-profile-dynamic-body" class="space-y-3">
                        ${GlobalChat.renderProfileDetailsContent(initialProfile, isSelf)}
                    </div>

                    <!-- Action buttons -->
                    <div class="pt-1 space-y-2">
                        ${isSelf ? `
                        <button type="button" onclick="GlobalChat.closeUserProfileModal(); if(typeof Auth !== 'undefined') Auth.openBorderPickerModal();" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-yellow-500 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md shadow-amber-500/20">
                            <i data-lucide="shield" class="w-4 h-4"></i>
                            <span>Ganti Border Profil Saya</span>
                        </button>
                        ` : `
                        <button type="button" onclick="GlobalChat.closeUserProfileModal(); if(typeof Profile !== 'undefined') Profile.openVipPackagesModal();" class="w-full py-2.5 px-3 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:from-amber-500 hover:to-yellow-500 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer shadow-md shadow-amber-500/20">
                            <i data-lucide="crown" class="w-4 h-4 fill-black"></i>
                            <span>Beli VIP & Dapatkan Border Ini</span>
                        </button>
                        `}
                        <button type="button" onclick="GlobalChat.closeUserProfileModal()" class="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition-all cursor-pointer">
                            Tutup
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);
            if (window.lucide) lucide.createIcons();

            // Fetch live data immediately & poll while modal is open so friend status updates live
            GlobalChat.refreshOpenProfileModal(userId, safeName);
            GlobalChat._profileModalPollTimer = setInterval(function() {
                if (document.getElementById('chat-user-profile-modal')) {
                    GlobalChat.refreshOpenProfileModal(userId, safeName);
                } else {
                    GlobalChat.closeUserProfileModal();
                }
            }, 2500);
        }
    };

    // Expose GlobalChat
    window.GlobalChat = GlobalChat;

    // Listen for real-time user profile updates (Username, Avatar, Border, Equipped Badges)
    function handleUserProfileChange(e) {
        if (GlobalChat.isOpen) {
            var u = (e && e.detail && e.detail.user) || GlobalChat.getCurrentUser();
            var bottomBar = document.getElementById('global-chat-bottom-bar');
            if (bottomBar && u) {
                var myId = String(u.id || u.userId || '');
                var myEmail = (u.email || u.rawEmail || '').toLowerCase().trim();
                var isMasterAdmin = (myEmail === 'jrnabil570@gmail.com' || myId === '8589478687' || myId === 'u_1790196636099_622dc736');
                bottomBar.innerHTML = GlobalChat.renderBottomBar(u, isMasterAdmin);
            }
            // Re-render messages to reflect profile/badge change on own messages
            GlobalChat.renderMessagesList(GlobalChat.messages);
        }
    }

    window.addEventListener('musifystar:user_profile_updated', handleUserProfileChange);
    window.addEventListener('musifystar:user_badge_updated', handleUserProfileChange);
    window.addEventListener('musifystar:user_border_updated', handleUserProfileChange);

    // Periodically poll unread count when window is idle (every 60s)
    setInterval(function() {
        if (!GlobalChat.isOpen) {
            fetch('/api/global-chat?t=' + Date.now(), { cache: 'no-store' })
                .then(function(r) { return r.json(); })
                .then(function(d) {
                    if (d && d.status && Array.isArray(d.messages)) {
                        var badge = document.getElementById('global-chat-badge');
                        if (badge && d.messages.length > GlobalChat.lastMessageCount && GlobalChat.lastMessageCount > 0) {
                            badge.classList.remove('hidden');
                        }
                    }
                })
                .catch(function() {});
        }
    }, 60000);

})();
