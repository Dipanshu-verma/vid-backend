//import YTDlpWrapModule from 'yt-dlp-wrap';
//const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;
//
//import { join, dirname } from 'path';
//import { fileURLToPath } from 'url';
//import { existsSync } from 'fs';
//import { detectPlatform } from './platform.js';
//import { getVideoInfoFromInvidious } from './invidious.js';
//
//const __dirname = dirname(fileURLToPath(import.meta.url));
//const isWin = process.platform === 'win32';
//const binPath = join(__dirname, '..', 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
//const cookiesPath = join(__dirname, '..', 'bin', 'cookies.txt');
//
//function getYtDlp() {
//  if (!existsSync(binPath)) throw new Error('yt-dlp binary not found.');
//  return new YTDlpWrap(binPath);
//}
//
//function formatDuration(seconds) {
//  if (!seconds || seconds <= 0) return undefined;
//  const h = Math.floor(seconds / 3600);
//  const m = Math.floor((seconds % 3600) / 60);
//  const s = Math.floor(seconds % 60);
//  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
//  return `${m}:${String(s).padStart(2, '0')}`;
//}
//
//function formatSize(bytes) {
//  if (!bytes || bytes <= 0) return undefined;
//  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
//  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
//  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
//}
//
//function getBestThumbnail(info) {
//  if (info.thumbnails?.length > 0) {
//    return [...info.thumbnails]
//      .filter(t => t.url)
//      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
//  }
//  return info.thumbnail || undefined;
//}
//
//function getQualityLabel(height) {
//  if (height >= 2160) return `${height}p 4K`;
//  if (height >= 1440) return `${height}p 2K`;
//  if (height >= 1080) return `${height}p Full HD`;
//  if (height >= 720)  return `${height}p HD`;
//  return `${height}p`;
//}
//
//function exactSize(fmt) {
//  return fmt?.filesize || fmt?.filesize_approx || 0;
//}
//
//function cookiesArgs() {
//  return existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
//}
//
//function buildExtractorArgs(playerClient, poToken) {
//  let val = `youtube:player_client=${playerClient}`;
//  if (poToken) val += `,po_token=${poToken}`;
//  return ['--extractor-args', val];
//}
//
//const YT_CLIENTS = [
//  { name: 'android_vr',  client: 'android_vr',  ua: 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' },
//  { name: 'tv_embedded', client: 'tv_embedded',  ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1' },
//  { name: 'mweb',        client: 'mweb',         ua: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36' },
//  { name: 'ios',         client: 'ios',          ua: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)' },
//  { name: 'android',     client: 'android',      ua: 'com.google.android.youtube/19.30.36 (Linux; U; Android 11) gzip' },
//  { name: 'web',         client: 'web',          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
//];
//
//function buildQualities(formats, url, title, API) {
//  const videoOnly = formats.filter(f =>
//    f.height && f.vcodec && f.vcodec !== 'none' &&
//    (!f.acodec || f.acodec === 'none') &&
//    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//  );
//  const combined = formats.filter(f =>
//    f.height && f.vcodec && f.vcodec !== 'none' &&
//    f.acodec && f.acodec !== 'none' &&
//    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//  );
//  const audioOnly = formats.filter(f =>
//    f.acodec && f.acodec !== 'none' &&
//    (!f.vcodec || f.vcodec === 'none') &&
//    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//  );
//
//  const bestAudio = audioOnly
//    .filter(f => f.ext === 'm4a')
//    .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
//    ?? audioOnly.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];
//
//  const bestAudioSize = exactSize(bestAudio);
//  const heightMap = new Map();
//
//  for (const f of [...videoOnly, ...combined]) {
//    const existing = heightMap.get(f.height);
//    const fScore = (f.ext === 'mp4' ? 100000 : 0) + (f.tbr || f.vbr || 0);
//    const eScore = existing ? (existing.ext === 'mp4' ? 100000 : 0) + (existing.tbr || existing.vbr || 0) : -1;
//    if (fScore > eScore) heightMap.set(f.height, f);
//  }
//
//  const heights = [...heightMap.keys()].sort((a, b) => b - a);
//  const streamBase = `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
//
//  const qualities = [{
//    label: 'Best Quality',
//    url: `${streamBase}&format=${encodeURIComponent('bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best')}`,
//    ext: 'mp4',
//    resolution: undefined,
//    size: undefined,
//  }];
//
//  for (const height of heights) {
//    const vfmt = heightMap.get(height);
//    const isCombined = vfmt.acodec && vfmt.acodec !== 'none';
//    const videoSize = exactSize(vfmt);
//    const totalSize = isCombined ? videoSize : (videoSize > 0 && bestAudioSize > 0 ? videoSize + bestAudioSize : videoSize);
//    const formatSelector = isCombined
//      ? `best[height<=${height}][ext=mp4]/best[height<=${height}]/best`
//      : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
//
//    qualities.push({
//      label: getQualityLabel(height),
//      url: `${streamBase}&format=${encodeURIComponent(formatSelector)}`,
//      ext: 'mp4',
//      resolution: vfmt.width ? `${vfmt.width}×${height}` : `${height}p`,
//      size: formatSize(totalSize),
//    });
//  }
//
//  return qualities;
//}
//
//async function getVideoInfoViaYtDlp(url, platform) {
//  const ytDlp = getYtDlp();
//  const API = process.env.API_BASE_URL || 'http://localhost:3001';
//  const poToken = process.env.YT_PO_TOKEN || null;
//  const cookies = cookiesArgs();
//
//  let raw;
//  let lastError;
//
//  if (platform === 'youtube') {
//    for (const attempt of YT_CLIENTS) {
//      try {
//        const args = [
//          url,
//          '--no-warnings',
//          '--no-playlist',
//          '--no-check-certificate',
//          '--skip-download',
//          ...buildExtractorArgs(attempt.client, poToken),
//          '--add-header', `user-agent:${attempt.ua}`,
//          ...cookies,
//        ];
//        console.log(`[yt-dlp] trying: ${attempt.name}`);
//        raw = await ytDlp.getVideoInfo(args);
//        console.log(`[yt-dlp] ✓ success: ${attempt.name} | formats: ${raw.formats?.length || 0}`);
//        break;
//      } catch (err) {
//        lastError = err;
//        const msg = (err?.stderr || err?.message || '').toLowerCase();
//        console.error(`[yt-dlp] ✗ ${attempt.name}:`, msg.slice(0, 120));
//        if (msg.includes('video unavailable') || msg.includes('private video') || msg.includes('has been removed')) break;
//      }
//    }
//    if (!raw) throw new Error(lastError?.stderr || lastError?.message || 'All yt-dlp clients failed');
//
//  } else {
//    const extraHeaders = ['instagram', 'facebook'].includes(platform) ? [
//      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//      '--add-header', 'Accept-Language:en-us,en;q=0.5',
//      '--add-header', 'Sec-Fetch-Mode:navigate',
//      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
//    ] : [
//      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
//    ];
//
//    raw = await ytDlp.getVideoInfo([
//      url, '--no-warnings', '--no-playlist', '--no-check-certificate', '--skip-download',
//      ...extraHeaders, ...cookies,
//    ]);
//  }
//
//  const title = raw.title || 'Untitled Video';
//  const qualities = buildQualities(raw.formats || [], url, title, API);
//
//  return {
//    platform,
//    title,
//    thumbnail: getBestThumbnail(raw),
//    author: raw.uploader || raw.channel || raw.creator || undefined,
//    duration: formatDuration(raw.duration),
//    qualities,
//    _source: 'ytdlp',
//  };
//}
//
//export async function getVideoInfo(url) {
//  const platform = detectPlatform(url);
//
//  // Non-YouTube: yt-dlp only
////if (platform === 'youtube') {
////  args.push(
////    '--extractor-args',
////    'youtube:player_client=ios,mweb;player_skip=webpage,configs'
////  );
////}
//
//  // YouTube: yt-dlp → Invidious → Piped
//  console.log('[downloader] YouTube detected, trying yt-dlp first...');
//
//  try {
//    const result = await getVideoInfoViaYtDlp(url, platform);
//    console.log('[downloader] ✓ yt-dlp path succeeded');
//    return result;
//  } catch (ytDlpErr) {
//    const msg = (ytDlpErr?.message || '').toLowerCase();
//
//    if (msg.includes('private video') || msg.includes('has been removed') || msg.includes('video unavailable')) {
//      throw ytDlpErr;
//    }
//
//    console.warn('[downloader] ✗ yt-dlp failed, trying Invidious/Piped fallback...');
//
//    try {
//      const result = await getVideoInfoFromInvidious(url);
//      console.log(`[downloader] ✓ fallback succeeded via ${result._source}`);
//      return result;
//    } catch (fallbackErr) {
//      console.error('[downloader] ✗ all sources failed');
//      // Throw yt-dlp error — more informative for debugging
//      throw ytDlpErr;
//    }
//  }
//}

import { detectPlatform } from './platform.js';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'social-media-video-downloader.p.rapidapi.com';

const NEW_RAPIDAPI_KEY = process.env.NEW_RAPIDAPI_KEY;
const NEW_RAPIDAPI_HOST = 'social-download-all-in-one.p.rapidapi.com';

// Cache
const cache = new Map();
const CACHE_TTL = 30 * 60 * 1000;

// ─── New API (social-download-all-in-one) ────────────────────────────────────
async function getVideoInfoFromNewAPI(url) {
  if (!NEW_RAPIDAPI_KEY) throw new Error('NEW_RAPIDAPI_KEY not set');

  console.log('[new-api] fetching:', url.slice(0, 60));

  const res = await fetch('https://social-download-all-in-one.p.rapidapi.com/v1/social/autolink', {
    method: 'POST',
    headers: {
      'x-rapidapi-key': NEW_RAPIDAPI_KEY,
      'x-rapidapi-host': NEW_RAPIDAPI_HOST,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(30000),
  });

  const data = await res.json();

  if (!res.ok || data.error) throw new Error(data.message || `New API error: ${res.status}`);
  if (!data.medias || data.medias.length === 0) throw new Error('No media found');

  const title = data.title || data.author || 'Video';
  const thumbnail = data.thumbnail || '';
  const author = data.author || undefined;
  const platform = data.source || detectPlatform(url);

  const qualities = [];
  const seenLabels = new Set();

// Filter only mp4 videos with audio merged
for (const m of data.medias) {
  if (m.type !== 'video') continue;
  if (!m.url) continue;
  if (!m.is_audio) continue; // skip video-only streams
  if (m.extension && m.extension !== 'mp4') continue;

  const label = m.quality || m.resolution || 'Best Quality';
  if (seenLabels.has(label)) continue;
  seenLabels.add(label);

  qualities.push({
    label,
    url: m.url,
    ext: 'mp4',
    resolution: m.resolution || label,
    size: m.size || undefined,
    _direct: true,
  });
}

  // If no video-with-audio found, try first video anyway
  if (qualities.length === 0) {
    const firstVideo = data.medias.find(m => m.type === 'video' && m.url);
    if (firstVideo) {
      qualities.push({
        label: firstVideo.quality || 'Best Quality',
        url: firstVideo.url,
        ext: firstVideo.extension || 'mp4',
        resolution: firstVideo.resolution || firstVideo.quality,
        _direct: true,
      });
    }
  }

  if (qualities.length === 0) throw new Error('No downloadable links found');

  console.log(`[new-api] ✓ found ${qualities.length} qualities for ${platform}`);

  return { platform, title, thumbnail, author, qualities, _source: 'new-api' };
}

// ─── Old RapidAPI (social-media-video-downloader) ────────────────────────────
async function getVideoInfoFromOldAPI(url, platform) {
  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set');

  const headers = {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
  };

  let endpoint = '';
  let params = '';

  if (platform === 'instagram') {
    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) throw new Error('Could not extract Instagram shortcode');
    endpoint = '/instagram/v3/media/post/details';
    params = `?shortcode=${match[2]}&renderableFormats=720p,1080p&fields=contents,metadata`;
  } else if (platform === 'facebook') {
    endpoint = '/facebook/v3/post/details';
    params = `?url=${encodeURIComponent(url)}&renderableFormats=720p,1080p&fields=contents,metadata`;
  } else if (platform === 'youtube') {
    const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
    if (!match) throw new Error('Could not extract YouTube video ID');
    endpoint = '/youtube/v3/video/details';
    params = `?videoId=${match[1]}&renderableFormats=720p,1080p&urlAccess=normal&fields=contents,metadata`;
  } else {
    throw new Error('Unsupported platform');
  }

  console.log(`[old-api] ${platform} → ${endpoint}`);

  const res = await fetch(
    `https://${RAPIDAPI_HOST}${endpoint}${params}`,
    { headers, signal: AbortSignal.timeout(90000) }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `RapidAPI error: ${res.status}`);

  const title = data.metadata?.title || data.metadata?.author?.name || 'Video';
  const thumbnail = data.metadata?.thumbnailUrl || data.metadata?.thumbnail || '';
  const author = data.metadata?.author?.name || undefined;

  const contents = data.contents?.[0] || {};
  const renderableVideos = contents.renderableVideos || [];

  const qualities = [];
  const seenLabels = new Set();

  for (const v of renderableVideos) {
    if (!v.renderConfig?.executionUrl) continue;
    const label = v.label || v.metadata?.quality_label || 'Best Quality';
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);
    qualities.push({
      label,
      url: v.renderConfig.executionUrl,
      ext: 'mp4',
      resolution: v.metadata?.quality_label || label,
      size: v.metadata?.content_length_text || undefined,
      _direct: false, // needs render job
    });
  }

  if (qualities.length === 0) throw new Error('No downloadable links found');

  console.log(`[old-api] ✓ found ${qualities.length} qualities`);

  return { platform, title, thumbnail, author, qualities, _source: 'old-api' };
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function getVideoInfo(url) {
  const platform = detectPlatform(url);

  // Check cache
  const cacheKey = url.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[cache] hit');
    return cached.data;
  }

  let result;

  // Try new API first
  try {
    result = await getVideoInfoFromNewAPI(url);
    console.log('[downloader] ✓ new API succeeded');
  } catch (e) {
    console.warn('[downloader] new API failed:', e.message, '→ trying old API...');
    try {
      result = await getVideoInfoFromOldAPI(url, platform);
      console.log('[downloader] ✓ old API succeeded');
    } catch (e2) {
      console.error('[downloader] both APIs failed:', e2.message);
      throw new Error('Could not fetch video info. Please try again later.');
    }
  }

  // Cache result
  cache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

//import { detectPlatform } from './platform.js';
//
//const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
//const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'social-media-video-downloader.p.rapidapi.com';
//
//export async function getVideoInfo(url) {
//  const platform = detectPlatform(url);
//
//  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set on server.');
//
//  const headers = {
//    'x-rapidapi-key': RAPIDAPI_KEY,
//    'x-rapidapi-host': RAPIDAPI_HOST,
//  };
//
//  let endpoint = '';
//  let params = '';
//
//  if (platform === 'instagram') {
//    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
//    if (!match) throw new Error('Could not extract Instagram shortcode');
//    const shortcode = match[2];
//    endpoint = '/instagram/v3/media/post/details';
//    params = `?shortcode=${shortcode}&renderableFormats=720p,1080p&fields=contents,metadata`;
//  } else if (platform === 'facebook') {
//    endpoint = '/facebook/v3/post/details';
//    params = `?url=${encodeURIComponent(url)}&renderableFormats=720p,1080p&fields=contents,metadata`;
//  } else if (platform === 'tiktok') {
//    endpoint = '/tiktok/v3/post/details';
//    params = `?url=${encodeURIComponent(url)}&fields=contents,metadata`;
//  } else if (platform === 'youtube') {
////    const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
//  const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
//
//    if (!match) throw new Error('Could not extract YouTube video ID');
//    const videoId = match[1];
//    endpoint = '/youtube/v3/video/details';
//    params = `?videoId=${videoId}&renderableFormats=720p,1080p,1440p,2160p&urlAccess=normal&fields=contents,metadata`;
//  } else if (platform === 'twitter') {
//    endpoint = '/twitter/v3/post/details';
//    params = `?url=${encodeURIComponent(url)}&fields=contents,metadata`;
//  } else {
//    throw new Error('Unsupported platform. Supported: YouTube, Instagram, Facebook, TikTok, Twitter.');
//  }
//
//  console.log(`[rapidapi] ${platform} → ${endpoint}`);
//
//  const res = await fetch(
//    `https://${RAPIDAPI_HOST}${endpoint}${params}`,
//    { headers, signal: AbortSignal.timeout(90000) }
//  );
//
//  const data = await res.json();
//  console.log(`[rapidapi] status: ${res.status}`);
//
//  if (!res.ok) throw new Error(data.message || `RapidAPI error: ${res.status}`);
//
//  const title = data.metadata?.title || data.metadata?.author?.name || 'Video';
//  const thumbnail = data.metadata?.thumbnailUrl || data.metadata?.thumbnail || '';
//  const author = data.metadata?.author?.name || undefined;
//
//  const contents = data.contents?.[0] || {};
//  const renderableVideos = contents.renderableVideos || [];
//
//  const qualities = [];
//  const seenLabels = new Set();
//
//  // ONLY use renderableVideos — they have merged audio+video
//  // Direct videos array is skipped — no audio
//  for (const v of renderableVideos) {
//    if (!v.renderConfig?.executionUrl) continue;
//    const label = v.label || v.metadata?.quality_label || 'Best Quality';
//
//    // Deduplicate by label
//    if (seenLabels.has(label)) continue;
//    seenLabels.add(label);
//
//    qualities.push({
//      label,
//      url: v.renderConfig.executionUrl,
//      ext: 'mp4',
//      resolution: v.metadata?.quality_label || label,
//      size: v.metadata?.content_length_text || undefined,
//    });
//  }
//
//  if (qualities.length === 0) throw new Error('No downloadable links found for this video.');
//
//  console.log(`[rapidapi] ✓ found ${qualities.length} qualities`);
//
//  return {
//    platform,
//    title,
//    thumbnail,
//    author,
//    qualities,
//    _source: 'rapidapi',
//  };
//}