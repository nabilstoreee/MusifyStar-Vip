const axios = require('axios');
const analytics = require('./analytics.js');

function parseYTDuration(subRuns, accLabel, fixedCols) {
    const fixedText = fixedCols?.[0]?.musicResponsiveListItemFixedColumnRenderer?.text?.runs?.[0]?.text;
    if (fixedText && /^(\d+[:\.])+\d+$/.test(fixedText.trim())) {
        return fixedText.trim().replace(/\./g, ':');
    }

    if (Array.isArray(subRuns)) {
        for (let i = subRuns.length - 1; i >= 0; i--) {
            const txt = (subRuns[i]?.text || '').trim();
            if (/^(\d{1,2}[\.:])+\d{2}$/.test(txt)) {
                return txt.replace(/\./g, ':');
            }
        }
    }

    if (accLabel) {
        let hours = 0, mins = 0, secs = 0;
        const hMatch = accLabel.match(/(\d+)\s*(?:jam|hours?|hrs?|h)/i);
        const mMatch = accLabel.match(/(\d+)\s*(?:menit|minutes?|mins?|m)/i);
        const sMatch = accLabel.match(/(\d+)\s*(?:detik|seconds?|secs?|s)/i);
        if (hMatch) hours = parseInt(hMatch[1], 10);
        if (mMatch) mins = parseInt(mMatch[1], 10);
        if (sMatch) secs = parseInt(sMatch[1], 10);

        if (hours > 0 || mins > 0 || secs > 0) {
            if (hours > 0) {
                return hours + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
            } else {
                return mins + ':' + String(secs).padStart(2, '0');
            }
        }
    }

    return '';
}

function findAllKeys(arr, key, results) {
    if (arr === null || typeof arr !== 'object') return;
    if (arr[key] !== undefined) results.push(arr[key]);
    Object.values(arr).forEach(v => findAllKeys(v, key, results));
}

function toHDThumbnail(url, videoId) {
    if (!url && videoId) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    if (!url) return '';
    let hd = String(url);
    if (hd.includes('googleusercontent.com') || hd.includes('ggpht.com') || hd.includes('ytimg.com')) {
        if (/=w\d+-h\d+/i.test(hd)) {
            hd = hd.replace(/=w\d+-h\d+[^?#]*/i, '=w800-h800-l90-rj');
        } else if (/=s\d+/i.test(hd)) {
            hd = hd.replace(/=s\d+[^?#]*/i, '=s800-c-k-c0x00ffffff-no-rj');
        } else if (/=w\d+/i.test(hd)) {
            hd = hd.replace(/=w\d+[^?#]*/i, '=w800-h800-l90-rj');
        }
    }
    if (hd.includes('i.ytimg.com/vi/') || hd.includes('img.youtube.com/vi/')) {
        hd = hd.split('?')[0];
        hd = hd.replace(/(hqdefault|mqdefault|sddefault|default)\.jpg/i, 'hqdefault.jpg');
    }
    return hd;
}

function parseDurationToSeconds(durStr) {
    if (!durStr || typeof durStr !== 'string') return 0;
    const parts = durStr.trim().replace(/\./g, ':').split(':').map(n => parseInt(n, 10) || 0);
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    return parts[0] || 0;
}

function normalizeAlphaNum(str) {
    return String(str || '')
        .toLowerCase()
        .replace(/a\.k\.a\.?/g, 'aka')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function isMixedOrOffTopicTrack(title, artist, durationSec, rawQuery) {
    const tLow = String(title || '').toLowerCase();
    const aLow = String(artist || '').toLowerCase();
    const qLow = String(rawQuery || '').toLowerCase();
    const combinedNorm = normalizeAlphaNum(title + ' ' + artist);
    const queryNorm = normalizeAlphaNum(rawQuery);

    // 1. Block known third-party spam channels that mix other artists' songs inside their videos
    if (/\b(melia\s*funky|meita\s*fvnky)\b/i.test(aLow) || /\b(melia\s*funky|meita\s*fvnky)\b/i.test(tLow)) {
        return true;
    }

    // 2. Block unrequested DJ / Remix / AMV / Wedding / Karaoke / Oplosan / Campursari mixes
    const userAskedDjOrRemix = /\b(dj|remix|breakbeat|jedag\s*jedug|koplo|campursari|amv|karaoke|wedding|live)\b/i.test(qLow);
    if (!userAskedDjOrRemix) {
        if (/\b(dj|remix|breakbeat|jedag\s*jedug|amv|kimi\s*no\s*nawa|anime|karaoke|oplosan|campursari|wedding|parodi)\b/i.test(tLow)) {
            return true;
        }
        if (/\b(dj\s+|verzzme)\b/i.test(aLow)) {
            return true;
        }
    }

    // 3. Enforce artist match so other singers (e.g. Happy Asmara, New Syaqila) don't appear when searching for a specific artist (e.g. NDX AKA)
    if (/\bndx\b/i.test(queryNorm)) {
        if (!/\bndx\b/i.test(combinedNorm)) {
            return true;
        }
    } else if (/\bfull\s*album\b/i.test(qLow)) {
        const beforeFullAlbum = normalizeAlphaNum(qLow.split(/\bfull\s*album\b/i)[0] || '');
        const artistTokens = beforeFullAlbum.split(/\s+/).filter(w => w.length >= 3 && !['lagu', 'musik', 'video', 'terbaru', 'viral'].includes(w));
        if (artistTokens.length > 0) {
            const hasArtistMatch = artistTokens.some(tok => combinedNorm.includes(tok));
            if (!hasArtistMatch) {
                return true;
            }
        }
    }

    return false;
}

function normalizeTrackDedupKey(title, artist) {
    const cleanTitle = String(title || '')
        .toLowerCase()
        .replace(/a\.k\.a\.?/g, 'aka')
        .replace(/\(.*?\)|\[.*?\]/g, ' ')
        .replace(/\b(official\s*(music\s*)?(video|audio|lyric|mv)|lirik|lyrics|hd|4k|terbaru|viral|202\d)\b/gi, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    const cleanArtist = String(artist || '')
        .toLowerCase()
        .replace(/a\.k\.a\.?/g, 'aka')
        .replace(/\b(official|topic|vevo|music|records|channel)\b/gi, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
    return (cleanTitle || String(title || '').toLowerCase().trim()) + '::' + cleanArtist;
}

function deduplicateTracks(list) {
    const seenIds = new Set();
    const seenKeys = new Set();
    const out = [];
    for (const item of (list || [])) {
        const vid = String(item.videoId || item.id || '').trim();
        if (!vid || seenIds.has(vid)) continue;
        const key = normalizeTrackDedupKey(item.title, item.artist);
        if (key && seenKeys.has(key)) continue;
        seenIds.add(vid);
        if (key) seenKeys.add(key);
        out.push(item);
    }
    return out;
}

function computeRelevanceScore(item, rawQuery) {
    let score = 0;
    const tLow = String(item.title || '').toLowerCase();
    const aLow = String(item.artist || '').toLowerCase();
    const qLow = String(rawQuery || '').toLowerCase().trim();
    const isFullAlbumQuery = /\bfull\s*album\b/i.test(qLow);
    const qTokens = normalizeAlphaNum(qLow).split(/\s+/).filter(w => w.length >= 2);
    const combinedNorm = normalizeAlphaNum(item.title + ' ' + item.artist);

    for (const tok of qTokens) {
        if (combinedNorm.includes(tok)) score += 15;
    }

    if (isFullAlbumQuery) {
        if (/\bfull\s*album\b/i.test(tLow)) score += 60;
        if (item.durationSec >= 1200) score += 80; // >= 20 mins true full album
        else if (item.durationSec >= 600) score += 50; // >= 10 mins
        else if (item.durationSec < 360) score -= 40; // penalize short single clips when searching full album
    } else {
        if (item.artistId && item.artistId.startsWith('UC')) score += 30;
        if (item.albumId && item.albumId.startsWith('MPRE')) score += 25;
        if (/\b(official|vevo|topic|records|music)\b/i.test(aLow)) score += 20;
    }

    return score;
}

async function fetchYoutube(query, type) {
    const payload = {
        context: {
            client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' }
        },
        query: query
    };

    if (type === 'songs') {
        payload.params = 'EgWKAQIIAWoSEAQQAxAFEAkQChAVEBAQERAO';
    } else if (type === 'videos') {
        payload.params = 'EgWKAQIQAWoSEAQQAxAFEAkQChAVEBAQERAO';
    } else if (type === 'albums') {
        payload.params = 'EgWKAQIYAWoSEAQQAxAFEAkQChAVEBAQERAO';
    } else if (type === 'artists') {
        payload.params = 'EgWKAQIgAWoKEAoQCRADEAA=';
    } else if (type === 'playlists') {
        payload.params = 'EgWKAQIoAWoSEAQQAxAFEAkQChAVEBAQERAO';
    }

    const { data } = await axios.post('https://music.youtube.com/youtubei/v1/search?prettyPrint=false', payload, {
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://music.youtube.com'
        },
        timeout: 15000
    });

    return data;
}

function parseVideosFromYTData(data, rawQuery) {
    const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
    const parsed = [];
    for (const tab of tabs) {
        const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
        for (const section of sections) {
            const shelf = section?.musicShelfRenderer;
            const items = shelf?.contents || section?.itemSectionRenderer?.contents || [];
            for (const item of items) {
                const r = item?.musicResponsiveListItemRenderer;
                if (!r) continue;
                const cols = r.flexColumns || [];
                const titleRuns = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                const title = titleRuns.map(x => x.text).join('');
                const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                let artist = '', artistId = '', duration = '';
                for (const run of subRuns) {
                    const text = run.text || '';
                    const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
                    if (browseId.startsWith('UC') && !artistId) {
                        artistId = browseId;
                    }
                    if (!artist && text && text !== '•' && text !== 'Video') artist = text;
                }
                const accLabel = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.accessibility?.accessibilityData?.label || '';
                const fixedCols = r.fixedColumns || [];
                duration = parseYTDuration(subRuns, accLabel, fixedCols);
                const durationSec = parseDurationToSeconds(duration);
                const videoId = r?.playlistItemData?.videoId || '';
                if (!videoId) continue;
                const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                const rawThumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
                if (!rawThumb) continue;
                const thumbnail = toHDThumbnail(rawThumb, videoId);
                const vObj = {
                    id: videoId,
                    videoId,
                    title,
                    artist: artist || 'YouTube Music',
                    artistId,
                    duration: duration || '3:30',
                    durationSec,
                    thumbnail,
                    cover: thumbnail,
                    url: `https://youtube.com/watch?v=${videoId}`
                };
                vObj.relevanceScore = computeRelevanceScore(vObj, rawQuery);
                parsed.push(vObj);
            }
        }
    }
    return parsed;
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        if (res.status) return res.status(200).send('OK');
        return;
    }

    const query = String(req.query.query || '').trim();
    const type = String(req.query.type || 'all').trim(); // all, songs, playlists

    if (!query) return res.status(400).json({ status: false, creator: 'Nanzz', message: 'Parameter query diperlukan' });

    const isFullAlbumQuery = /\bfull\s*album\b/i.test(query);
    const artistFullAlbumQuery = isFullAlbumQuery
        ? ((query.split(/\bfull\s*album\b/i)[0] || '').trim() + ' full album').trim()
        : '';

    // Only record search if explicitly flagged as real user search from search bar
    if (req.query?.userSearch === '1' || req.query?.isUserSearch === '1' || req.headers?.['x-user-search'] === '1') {
        try { analytics.recordSearch(query); } catch (e) {}
    }

    let urlVid = '';
    if (query.includes('youtube.com/') || query.includes('youtu.be/')) {
        urlVid = query.match(/[?&]v=([^&]+)/)?.[1] || query.match(/youtu\.be\/([^?]+)/)?.[1] || '';
    }

    if (urlVid && (type === 'all' || type === 'songs')) {
        try {
            const p = {
                context: { client: { clientName: 'WEB_REMIX', clientVersion: '1.20240101.00.00', hl: 'id', gl: 'ID' } },
                videoId: urlVid
            };
            const r = await axios.post('https://music.youtube.com/youtubei/v1/next?prettyPrint=false', p, { timeout: 15000 });
            const item = r.data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer?.contents?.[0]?.playlistPanelVideoRenderer;
            
            if (item && item.videoId === urlVid) {
                const title = (item.title?.runs || []).map(r => r.text).join('');
                const artist = (item.longBylineText?.runs || []).map(r => r.text).join('');
                const durationText = (item.lengthText?.runs || []).map(r => r.text).join('');
                const thumbs = item.thumbnail?.thumbnails || [];
                const rawThumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
                const thumbnail = toHDThumbnail(rawThumb, urlVid);
                
                let duration = '';
                const durMatch = durationText.match(/(\d+):(\d+)/);
                if (durMatch) duration = durMatch[1] + ':' + durMatch[2];
                else if (durationText) duration = durationText.replace('.', ':');

                return res.json({
                    status: true,
                    creator: 'Nanzz',
                    result: {
                        query,
                        totalSongs: 1,
                        songs: [{ title, videoId: urlVid, thumbnail, url: `https://music.youtube.com/watch?v=${urlVid}`, artist: artist, artistId: '', album: '', albumId: '', duration }],
                        albums: [], playlists: [], artists: []
                    }
                });
            }
        } catch (e) {
            console.error('Error fetching single url:', e.message);
        }
    }

    try {
        let songs = [];
        let videos = [];
        let albums = [];
        let playlists = [];
        let artists = [];

        const tasks = [];
        if (type === 'all' || type === 'songs') tasks.push(fetchYoutube(query, 'songs').then(data => ({ type: 'songs', data })).catch(() => ({ type: 'songs', data: null })));
        if (type === 'all' || type === 'videos') {
            tasks.push(fetchYoutube(query, 'videos').then(data => ({ type: 'videos', data })).catch(() => ({ type: 'videos', data: null })));
            if (isFullAlbumQuery && artistFullAlbumQuery && artistFullAlbumQuery.toLowerCase() !== query.toLowerCase()) {
                tasks.push(fetchYoutube(artistFullAlbumQuery, 'videos').then(data => ({ type: 'videos_extra', data })).catch(() => ({ type: 'videos_extra', data: null })));
            }
        }
        if (type === 'all' || type === 'albums') tasks.push(fetchYoutube(query, 'albums').then(data => ({ type: 'albums', data })).catch(() => ({ type: 'albums', data: null })));
        if (type === 'all' || type === 'playlists') tasks.push(fetchYoutube(query, 'playlists').then(data => ({ type: 'playlists', data })).catch(() => ({ type: 'playlists', data: null })));
        if (type === 'all' || type === 'artists') tasks.push(fetchYoutube(query, 'artists').then(data => ({ type: 'artists', data })).catch(() => ({ type: 'artists', data: null })));

        const results = await Promise.all(tasks);
        let rawVideosCombined = [];

        for (const resObj of results) {
            const data = resObj.data;
            if (!data) continue;

            if (resObj.type === 'videos' || resObj.type === 'videos_extra') {
                rawVideosCombined = rawVideosCombined.concat(parseVideosFromYTData(data, query));
            } else if (resObj.type === 'albums') {
                const items = [];
                findAllKeys(data, 'musicResponsiveListItemRenderer', items);
                findAllKeys(data, 'musicTwoRowItemRenderer', items);
                findAllKeys(data, 'musicCardShelfRenderer', items);
                const seen = {};
                for (const item of items) {
                    const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
                    if (!browseId || seen[browseId]) continue;
                    seen[browseId] = true;
                    let title = '', subtitle = '', thumbs = [];
                    if (item.flexColumns) {
                        title = (item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('');
                        subtitle = (item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('');
                        thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                    } else if (item.title?.runs) {
                        title = item.title.runs.map(r => r.text).join('');
                        subtitle = (item.subtitle?.runs || []).map(r => r.text).join('');
                        thumbs = item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                    } else continue;
                    const rawThumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
                    const thumb = toHDThumbnail(rawThumb);
                    let artist = subtitle;
                    const m = subtitle.match(/^(Album|Single|EP)\s*[•]\s*(.+?)(?:\s*[•]\s*(\d{4}))?$/i);
                    if (m) artist = m[2].trim();
                    albums.push({ id: browseId, title, artist: artist || 'Album', cover: thumb });
                }
            } else if (resObj.type === 'playlists') {
                const items = [];
                findAllKeys(data, 'musicResponsiveListItemRenderer', items);
                findAllKeys(data, 'musicTwoRowItemRenderer', items);
                findAllKeys(data, 'musicCardShelfRenderer', items);

                const seen = {};
                for (const item of items) {
                    const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId || '';
                    if (!browseId || seen[browseId]) continue;
                    seen[browseId] = true;

                    let title = '', subtitle = '', thumbs = [];

                    if (item.flexColumns) {
                        title = (item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('');
                        subtitle = (item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('');
                        thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                    } else if (item.title?.runs) {
                        title = item.title.runs.map(r => r.text).join('');
                        subtitle = (item.subtitle?.runs || []).map(r => r.text).join('');
                        thumbs = item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                    } else continue;

                    const rawThumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
                    const thumb = toHDThumbnail(rawThumb);

                    const m = subtitle.match(/^(Album|Single|EP)\s*[•]\s*(.+?)\s*[•]\s*(\d{4})/i);
                    if (m) {
                        albums.push({ id: browseId, title, artist: m[2].trim(), albumType: m[1], year: m[3], cover: thumb });
                    } else {
                        playlists.push({ id: browseId, title, artist: subtitle || 'Playlist', cover: thumb });
                    }
                }
            } else if (resObj.type === 'artists') {
                const items = [];
                findAllKeys(data, 'musicResponsiveListItemRenderer', items);
                findAllKeys(data, 'musicTwoRowItemRenderer', items);
                findAllKeys(data, 'musicCardShelfRenderer', items);
                const seen = {};
                for (const item of items) {
                    const browseId = item?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || item?.title?.runs?.[0]?.navigationEndpoint?.watchEndpoint?.videoId || '';
                    if (!browseId || seen[browseId]) continue;
                    seen[browseId] = true;
                    let title = '', subtitle = '', thumbs = [];
                    if (item.flexColumns) {
                        title = (item.flexColumns[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('');
                        subtitle = (item.flexColumns[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || []).map(r => r.text).join('');
                        thumbs = item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                    } else if (item.title?.runs) {
                        title = item.title.runs.map(r => r.text).join('');
                        subtitle = item.subtitle.runs.map(r => r.text).join('');
                        thumbs = item.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails || item.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                    } else continue;
                    const rawArtistThumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
                    const thumb = toHDThumbnail(rawArtistThumb);
                    if (subtitle.toLowerCase().includes('artist') || subtitle.toLowerCase().includes('monthly audience') || subtitle.toLowerCase().includes('pendengar') || subtitle.toLowerCase().includes('audiens') || subtitle.toLowerCase().includes('subscriber')) {
                        artists.push({ id: browseId, title: title, artist: subtitle, cover: thumb });
                    }
                }
                artists.sort((a, b) => {
                    const qLower = query.toLowerCase().trim();
                    const aIsMain = a.title.toLowerCase().trim() === qLower;
                    const bIsMain = b.title.toLowerCase().trim() === qLower;
                    const aAud = a.artist.includes('audiens') || a.artist.includes('jt');
                    const bAud = b.artist.includes('audiens') || b.artist.includes('jt');
                    if (aIsMain && aAud && (!bIsMain || !bAud)) return -1;
                    if (bIsMain && bAud && (!aIsMain || !aAud)) return 1;
                    if (aIsMain && !bIsMain) return -1;
                    if (bIsMain && !aIsMain) return 1;
                    if (aAud && !bAud) return -1;
                    if (bAud && !aAud) return 1;
                    return 0;
                });
            } else if (resObj.type === 'songs') {
                const tabs = data?.contents?.tabbedSearchResultsRenderer?.tabs || [];
                const allParsedSongs = [];
                for (const tab of tabs) {
                    const sections = tab?.tabRenderer?.content?.sectionListRenderer?.contents || [];
                    for (const section of sections) {
                        const shelf = section?.musicShelfRenderer;
                        const items = shelf?.contents || section?.itemSectionRenderer?.contents || [];
                        for (const item of items) {
                            const r = item?.musicResponsiveListItemRenderer;
                            if (!r) continue;
                            const cols = r.flexColumns || [];
                            const titleRuns = cols[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                            const title = titleRuns.map(x => x.text).join('');
                            
                            const subRuns = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs || [];
                            let artist = '', artistId = '', album = '', albumId = '', duration = '';
                            for (const run of subRuns) {
                                const text = run.text || '';
                                const browseId = run?.navigationEndpoint?.browseEndpoint?.browseId || '';
                                if (browseId.startsWith('UC')) { artist = text; artistId = browseId; }
                                else if (browseId.startsWith('MPRE')) { album = text; albumId = browseId; }
                            }

                            const accLabel = cols[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.accessibility?.accessibilityData?.label || '';
                            const fixedCols = r.fixedColumns || [];
                            duration = parseYTDuration(subRuns, accLabel, fixedCols);
                            const durationSec = parseDurationToSeconds(duration);

                            const t = subRuns[0]?.text || '';
                            if (t === 'Video') continue;

                            const videoId = r?.playlistItemData?.videoId || '';
                            const thumbs = r?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails || [];
                            const rawSongThumb = thumbs.length ? thumbs[thumbs.length - 1].url : '';
                            if (!videoId || !rawSongThumb) continue;
                            const thumbnail = toHDThumbnail(rawSongThumb, videoId);

                            const sObj = {
                                title,
                                videoId,
                                thumbnail,
                                url: `https://music.youtube.com/watch?v=${videoId}`,
                                artist: artist || (subRuns[1]?.text || ''),
                                artistId,
                                album: album || '',
                                albumId,
                                duration,
                                durationSec
                            };
                            sObj.relevanceScore = computeRelevanceScore(sObj, query);
                            allParsedSongs.push(sObj);
                        }
                    }
                }
                const filteredSongs = allParsedSongs.filter(s => !isMixedOrOffTopicTrack(s.title, s.artist, s.durationSec, query));
                songs = deduplicateTracks(
                    (filteredSongs.length > 0 ? filteredSongs : allParsedSongs).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
                );
            }
        }

        if (rawVideosCombined.length > 0) {
            let filteredVideos = rawVideosCombined.filter(v => !isMixedOrOffTopicTrack(v.title, v.artist, v.durationSec, query));
            if (isFullAlbumQuery) {
                const longFullAlbums = filteredVideos.filter(v => v.durationSec >= 600 || /\bfull\s*album\b/i.test(v.title));
                if (longFullAlbums.length >= 2) {
                    filteredVideos = longFullAlbums;
                }
            }
            videos = deduplicateTracks(
                (filteredVideos.length > 0 ? filteredVideos : rawVideosCombined).sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            );
        }

        return res.json({
            status: true,
            creator: 'Nanzz',
            result: { query, totalSongs: songs.length, songs, videos, albums, playlists, artists }
        });

    } catch (err) {
        return res.status(500).json({ status: false, creator: 'Nanzz', message: err.message });
    }
};
