const dns = require('dns');
if (dns.setDefaultResultOrder) {
  try { dns.setDefaultResultOrder('ipv4first'); } catch (e) {}
}
const https = require('https');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const storage = require('./storage.js');

// Reusable strict IPv4 HTTPS Agent to prevent Linux/Cloud Run IPv6 blackhole timeouts
const ipv4Agent = new https.Agent({
  family: 4,
  keepAlive: true,
  maxSockets: 80,
  timeout: 10000,
  noDelay: true
});

// Memory & persistent cache for audio stream URLs (valid 15 minutes so signed tokens never expire)
const ytCache = new Map();
const inFlightRequests = new Map();
const CACHE_TTL = 15 * 60 * 1000;

function normalizeAudioUrl(url) {
  if (!url || typeof url !== 'string') return '';
  return url.replace(/\.savetube\.vip\/file\//i, '.savetube.vip/media/');
}

try {
  const parsed = storage.readData('stream_cache.json', {});
  if (parsed && typeof parsed === 'object') {
    const now = Date.now();
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.expireAt > now && v.data && v.data.audio) {
        v.data.audio = normalizeAudioUrl(v.data.audio);
        if (v.expireAt - now > CACHE_TTL) {
          v.expireAt = now + CACHE_TTL;
        }
        ytCache.set(k, v);
      }
    }
  }
} catch (e) {}

function persistCache() {
  try {
    const obj = {};
    const now = Date.now();
    for (const [k, v] of ytCache.entries()) {
      if (v && v.expireAt > now && v.data && v.data.audio) {
        v.data.audio = normalizeAudioUrl(v.data.audio);
        obj[k] = v;
      }
    }
    storage.writeData('stream_cache.json', obj);
  } catch (e) {}
}

// Multi-source fast extractors - Active high-speed SaveTube CDNs ordered by latency
let SAVETUBE_CDNS = [
  "cdn403.savetube.vip",
  "cdn401.savetube.vip",
  "cdn405.savetube.vip",
  "cdn406.savetube.vip",
  "cdn400.savetube.vip",
  "cdn402.savetube.vip",
  "cdn404.savetube.vip",
  "cdn407.savetube.vip",
  "cdn408.savetube.vip"
];

// Dynamically promote winning CDN to top of the list for sub-600ms future requests
function promoteCdn(winnerCdn) {
  if (!winnerCdn) return;
  const idx = SAVETUBE_CDNS.indexOf(winnerCdn);
  if (idx > 0) {
    SAVETUBE_CDNS.splice(idx, 1);
    SAVETUBE_CDNS.unshift(winnerCdn);
  }
}

// Demote failing CDN to the back of the list
function demoteCdn(failingCdn) {
  if (!failingCdn) return;
  const idx = SAVETUBE_CDNS.indexOf(failingCdn);
  if (idx >= 0 && idx < SAVETUBE_CDNS.length - 1) {
    SAVETUBE_CDNS.splice(idx, 1);
    SAVETUBE_CDNS.push(failingCdn);
  }
}

// Resolve multiple candidate video IDs from YouTube Music & YouTube Search
async function resolveCandidateVideoIds(query, excludeSet = new Set()) {
  const candidates = [];
  if (!query) return candidates;
  const clean = String(query).trim();

  // 1. Direct Regex match for YouTube & YouTube Music URLs or direct 11-char video ID
  if (excludeSet.size === 0) {
    const directIdPatterns = [
      /(?:youtube\.com\/(?:watch\?.*v=|embed\/|shorts\/|v\/)|youtu\.be\/|music\.youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/
    ];

    for (const pattern of directIdPatterns) {
      const match = clean.match(pattern);
      if (match && match[1] && !excludeSet.has(match[1])) {
        candidates.push(match[1]);
        return candidates;
      }
    }
  }

  // 2. YouTube Music Search API
  try {
    const payload = {
      context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
      query: clean,
      params: 'EgWKAQIIAWoSEAQQAxAFEAkQChAVEBAQERAO'
    };
    const { data } = await axios.post('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', payload, {
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      httpsAgent: ipv4Agent,
      timeout: 4500
    });
    const jsonStr = JSON.stringify(data);
    const matches = [...jsonStr.matchAll(/\"videoId\":\"([a-zA-Z0-9_-]{11})\"/g)];
    for (const m of matches) {
      if (m && m[1] && !excludeSet.has(m[1]) && !candidates.includes(m[1])) {
        candidates.push(m[1]);
        if (candidates.length >= 4) break;
      }
    }
  } catch (e) {}

  // 3. YouTube HTML Scrape Fallback (essential for DJ remixes, breakbeat, & user uploads)
  if (candidates.length < 3) {
    try {
      const res = await axios.get(`https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        httpsAgent: ipv4Agent,
        timeout: 4500
      });
      const matches = [...String(res.data || '').matchAll(/\/watch\?v=([a-zA-Z0-9_-]{11})/g)];
      for (const m of matches) {
        if (m && m[1] && !excludeSet.has(m[1]) && !candidates.includes(m[1])) {
          candidates.push(m[1]);
          if (candidates.length >= 5) break;
        }
      }
    } catch (e) {}
  }

  return candidates;
}

async function resolveToVideoId(query, excludeId = null) {
  const excludeSet = new Set();
  if (excludeId) excludeSet.add(excludeId);
  const list = await resolveCandidateVideoIds(query, excludeSet);
  return list.length > 0 ? list[0] : null;
}

async function getDownload(url, title, artist, forceRefresh = false, preferredQuality = '128') {
  const normQuality = ['64', '128', '320'].includes(String(preferredQuality || '').trim())
    ? String(preferredQuality).trim()
    : '128';

  let idMatch = await resolveToVideoId(url);

  if (!idMatch && (title || url)) {
    idMatch = await resolveToVideoId((title ? title + ' ' + (artist || '') : url));
  }

  if (!idMatch) {
    console.error("[EXTRACT] Invalid URL or could not resolve query to video ID:", url);
    return null;
  }

  const cacheKey = normQuality === '128' ? idMatch : `${idMatch}_${normQuality}`;

  if (forceRefresh) {
    ytCache.delete(cacheKey);
    ytCache.delete(idMatch);
  } else {
    // Check cache first (instant 0ms response)
    const cached = ytCache.get(cacheKey);
    if (cached && cached.expireAt > Date.now() && cached.data && cached.data.audio) {
      cached.data.audio = normalizeAudioUrl(cached.data.audio);
      return cached.data;
    }
  }

  // Deduplicate in-flight requests for the same video ID + quality
  if (inFlightRequests.has(cacheKey)) {
    return await inFlightRequests.get(cacheKey);
  }

  const extractionPromise = (async () => {
    try {
      const triedIds = new Set([idMatch]);
      let result = await executeExtraction(idMatch, normQuality);

      // If primary extraction fails on the specific ID, resolve metadata via oembed and try up to 3 alternative candidate IDs
      if (!result) {
        let trackTitle = title;
        let trackArtist = artist;

        if (!trackTitle) {
          try {
            const oembedRes = await axios.get(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${idMatch}&format=json`, {
              timeout: 3000,
              httpsAgent: ipv4Agent
            });
            if (oembedRes.data && oembedRes.data.title) {
              trackTitle = oembedRes.data.title;
              trackArtist = (oembedRes.data.author_name || '').replace(/\s*-\s*Topic$/i, '');
            }
          } catch (eOe) {}
        }

        if (trackTitle || trackArtist) {
          try {
            const rawQuery = ((trackTitle || '') + ' ' + (trackArtist || '')).replace(/[-–|]/g, ' ').replace(/\s+/g, ' ').trim();
            if (rawQuery) {
              // First search exact query (crucial for DJ Remixes/Breakbeat), then fallback to 'audio'
              let altCandidates = await resolveCandidateVideoIds(rawQuery, triedIds);
              if (altCandidates.length === 0) {
                altCandidates = await resolveCandidateVideoIds(rawQuery + ' audio', triedIds);
              }
              for (const altId of altCandidates.slice(0, 3)) {
                if (!altId || triedIds.has(altId)) continue;
                triedIds.add(altId);
                console.log(`[EXTRACT] Trying alternative track ID for "${rawQuery}": ${altId}`);
                result = await executeExtraction(altId, normQuality);
                if (result && result.audio) {
                  result.audio = normalizeAudioUrl(result.audio);
                  ytCache.set(cacheKey, { data: result, expireAt: Date.now() + CACHE_TTL });
                  persistCache();
                  break;
                }
              }
            }
          } catch (eAlt) {}
        }
      }

      if (!result) {
        console.warn("[EXTRACT] All extraction methods failed for ID:", idMatch);
      }

      return result;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, extractionPromise);
  return await extractionPromise;
}

// Backup Extractor 2: Piped / Invidious Direct Audio Stream Resolver
async function tryPipedBackupExtractor(idMatch, preferredQuality = '128') {
  const pipedInstances = [
    'https://pipedapi.kavin.rocks',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me'
  ];
  for (const instance of pipedInstances) {
    try {
      const res = await axios.get(`${instance}/streams/${idMatch}`, {
        httpsAgent: ipv4Agent,
        timeout: 4500,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      const audioStreams = res.data?.audioStreams;
      if (Array.isArray(audioStreams) && audioStreams.length > 0) {
        // Sort by bitrate descending
        const sorted = audioStreams.filter(s => s && s.url && s.url.startsWith('http')).sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        if (sorted.length > 0) {
          const dur = Number(res.data?.duration || 0);
          const durStr = dur > 0 ? `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, '0')}` : '';
          return {
            duration: durStr,
            audio: sorted[0].url,
            bitrate: preferredQuality,
            source: `piped:${instance}`
          };
        }
      }
    } catch (e) {}
  }
  throw new Error('Piped backup extractor unavailable');
}

async function executeExtraction(idMatch, preferredQuality = '128') {
  const fullUrl = "https://www.youtube.com/watch?v=" + idMatch;
  let videoUnavailableAbort = false;
  const qualityOrder = preferredQuality === '64'
    ? ['64', '128', '320']
    : preferredQuality === '320'
      ? ['320', '128', '64']
      : ['128', '64', '320'];
  const cacheKey = preferredQuality === '128' ? idMatch : `${idMatch}_${preferredQuality}`;

  // Single CDN extractor with IPv4 enforcement, key sharing, and multi-quality fallback
  async function trySavetube(cdn, customTimeout = 7000) {
    if (videoUnavailableAbort) {
      throw new Error('Video unavailable');
    }
    const api = axios.create({
      headers: {
        "content-type": "application/json",
        "origin": "https://ytshortdown.com",
        "referer": "https://ytshortdown.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      },
      httpsAgent: ipv4Agent,
      timeout: customTimeout
    });

    const infoResponse = await api.post(`https://${cdn}/v2/info`, { url: fullUrl });
    if (infoResponse?.data?.status === false && /unavailable|private|removed|not available/i.test(infoResponse?.data?.message || '')) {
      videoUnavailableAbort = true;
      const unavailErr = new Error(infoResponse.data.message || 'Video unavailable');
      unavailErr.isVideoUnavailable = true;
      throw unavailErr;
    }
    const encryptedData = infoResponse?.data?.data;
    if (!encryptedData) {
      demoteCdn(cdn);
      throw new Error(`No data from ${cdn}`);
    }

    const encrypted = Buffer.from(encryptedData, "base64");
    const decipher = crypto.createDecipheriv("aes-128-cbc",
      Buffer.from("C5D58EF67A7584E4A29F6C35BBC4EB12", "hex"),
      encrypted.slice(0, 16)
    );

    const decryptedBuffer = Buffer.concat([
      decipher.update(encrypted.slice(16)),
      decipher.final()
    ]);

    const decrypted = JSON.parse(decryptedBuffer.toString());
    
    // Order by user's selected streaming quality (64kbps Hemat Kuota, 128kbps Standar, 320kbps High Audio Quality)
    let audioUrl = null;
    let activeBitrate = preferredQuality;
    for (const q of qualityOrder) {
      try {
        const downloadRes = await api.post(`https://${cdn}/download`, {
          id: idMatch,
          downloadType: "audio",
          quality: q,
          key: decrypted.key
        }, {
          timeout: customTimeout
        });
        audioUrl = downloadRes.data?.data?.downloadUrl || downloadRes.data?.downloadUrl;
        if (audioUrl && audioUrl.startsWith("http")) {
          activeBitrate = q;
          break;
        }
      } catch (errQ) {}
    }

    // If download failed on this CDN but we have decrypted.key, try download on alternate CDNs immediately!
    if (!audioUrl || !audioUrl.startsWith("http")) {
      const otherCdns = SAVETUBE_CDNS.filter(c => c !== cdn);
      for (const altCdn of otherCdns.slice(0, 3)) {
        try {
          const downloadRes = await axios.post(`https://${altCdn}/download`, {
            id: idMatch,
            downloadType: "audio",
            quality: qualityOrder[0] || "128",
            key: decrypted.key
          }, {
            headers: {
              "content-type": "application/json",
              "origin": "https://ytshortdown.com",
              "referer": "https://ytshortdown.com/",
              "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            httpsAgent: ipv4Agent,
            timeout: 5000
          });
          audioUrl = downloadRes.data?.data?.downloadUrl || downloadRes.data?.downloadUrl;
          if (audioUrl && audioUrl.startsWith("http")) {
            activeBitrate = qualityOrder[0] || "128";
            promoteCdn(altCdn);
            break;
          }
        } catch (eAltDl) {}
      }
    }

    if (!audioUrl || !audioUrl.startsWith("http")) {
      demoteCdn(cdn);
      throw new Error(`No audio URL from ${cdn}`);
    }

    audioUrl = normalizeAudioUrl(audioUrl);
    promoteCdn(cdn);

    const dur = decrypted.duration || 0;
    let durStr = '';
    if (dur >= 3600) {
      const h = Math.floor(dur / 3600);
      const m = Math.floor((dur % 3600) / 60);
      const s = dur % 60;
      durStr = `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    } else {
      durStr = `${Math.floor(dur / 60)}:${(dur % 60).toString().padStart(2, "0")}`;
    }
    return {
      duration: durStr,
      audio: audioUrl,
      bitrate: activeBitrate,
      source: `savetube:${cdn}`
    };
  }

  // Concurrent racing across top CDNs with fast early returns
  const primaryCDNs = SAVETUBE_CDNS.slice(0, 4);
  const secondaryCDNs = SAVETUBE_CDNS.slice(4);

  const primaryPromises = primaryCDNs.map(cdn => trySavetube(cdn, 6500));

  let delayedSecondary = null;
  if (secondaryCDNs.length > 0) {
    delayedSecondary = new Promise((resolve, reject) => {
      const timer = setTimeout(async () => {
        if (videoUnavailableAbort) {
          return reject(new Error('Video unavailable'));
        }
        try {
          const secRes = await Promise.any([
            ...secondaryCDNs.map(cdn => trySavetube(cdn, 7500)),
            tryPipedBackupExtractor(idMatch, preferredQuality)
          ]);
          resolve(secRes);
        } catch (errSec) {
          reject(errSec);
        }
      }, 900);
      primaryPromises.forEach(p => p.then(() => clearTimeout(timer)).catch(() => {}));
    });
  }

  const allAttempts = delayedSecondary ? [...primaryPromises, delayedSecondary] : primaryPromises;

  try {
    const winner = await Promise.any(allAttempts);
    winner.audio = normalizeAudioUrl(winner.audio);
    ytCache.set(cacheKey, { data: winner, expireAt: Date.now() + CACHE_TTL });
    persistCache();
    return winner;
  } catch (err) {
    if (videoUnavailableAbort) {
      return null;
    }
    // Retry once with remaining CDNs + Piped backup after short pause
    try {
      await new Promise(r => setTimeout(r, 300));
      const retryAttempts = [
        ...SAVETUBE_CDNS.slice(0, 4).map(cdn => trySavetube(cdn, 6500)),
        tryPipedBackupExtractor(idMatch, preferredQuality)
      ];
      const retryWinner = await Promise.any(retryAttempts);
      retryWinner.audio = normalizeAudioUrl(retryWinner.audio);
      ytCache.set(cacheKey, { data: retryWinner, expireAt: Date.now() + CACHE_TTL });
      persistCache();
      return retryWinner;
    } catch (eRetry) {}

    return null;
  }
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ status: false, message: 'Method not allowed' }); return; }

    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    const url = (body.query || body.url || '').trim();
    const title = (body.title || '').trim();
    const artist = (body.artist || '').trim();
    const forceRefresh = Boolean(body.refresh);
    const rawQuality = String(body.quality || body.bitrate || '128').trim();
    const preferredQuality = ['64', '128', '320'].includes(rawQuality) ? rawQuality : '128';

    if (!url && !title) { res.status(400).json({ status: false, message: 'Parameter query wajib diisi' }); return; }

    try {
        let audioData = await getDownload(url, title, artist, forceRefresh, preferredQuality);

        if (audioData && audioData.audio) {
            return res.status(200).json({
                status: true,
                result: {
                    duration: audioData.duration || null,
                    bitrate: audioData.bitrate || preferredQuality,
                    download: { audio: normalizeAudioUrl(audioData.audio) }
                }
            });
        }

        res.status(503).json({ status: false, error: "Layanan audio sedang padat, silakan coba lagu lain atau ulangi kembali." });
    } catch (err) {
        res.status(500).json({ status: false, error: "Gagal memproses audio stream" });
    }
};
