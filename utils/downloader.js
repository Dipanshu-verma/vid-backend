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

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return undefined;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export async function getVideoInfo(url) {
  const platform = detectPlatform(url);
  const API = process.env.API_BASE_URL || 'http://localhost:3001';

  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set on server.');

  const headers = {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
  };

  let endpoint = '';
  let params = '';

// if (platform === 'instagram') {
//     const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
//     if (!match) throw new Error('Could not extract Instagram shortcode');
//     const shortcode = match[2];
//     endpoint = '/instagram/v3/media/post/details';
//     params = `?shortcode=${shortcode}&renderableFormats=144p,240p,360p,480p,720p,1080p`;
//   } else if (platform === 'facebook') {
//     endpoint = '/facebook/v3/post/details';
//     params = `?url=${encodeURIComponent(url)}&renderableFormats=144p,240p,360p,480p,720p,1080p`;
if (platform === 'instagram') {
  // Fixed — strip query params before matching shortcode
  const cleanUrl = url.split('?')[0];
  const match = cleanUrl.match(/\/(?:p|reel|tv|reels)\/([A-Za-z0-9_-]+)/);
  if (!match) throw new Error('Could not extract Instagram shortcode');
  const shortcode = match[1];
  endpoint = '/instagram/v3/media/post/details';
  params = `?shortcode=${shortcode}&renderableFormats=720p,1080p,highres&fields=contents,metadata`;

} else if (platform === 'facebook') {
  endpoint = '/facebook/v3/post/details';
  params = `?url=${encodeURIComponent(url)}&renderableFormats=720p,1080p,highres&fields=contents,metadata`;
  } else if (platform === 'tiktok') {
    endpoint = '/tiktok/v3/post/details';
    params = `?url=${encodeURIComponent(url)}`;
} else if (platform === 'youtube') {
    const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (!match) throw new Error('Could not extract YouTube video ID');
    const videoId = match[1];
    endpoint = '/youtube/v3/video/details';
    params = `?videoId=${videoId}&renderableFormats=720p,1080p,1440p,2160p&urlAccess=normal`;
//    params = `?videoId=${videoId}&renderableFormats=144p,240p,360p,480p,720p,1080p,1440p,2160p&urlAccess=normal`;
  } else if (platform === 'twitter') {
    endpoint = '/twitter/v3/post/details';
    params = `?url=${encodeURIComponent(url)}`;
  } else {
    throw new Error('Unsupported platform. Supported: YouTube, Instagram, Facebook, TikTok, Twitter.');
  }

  console.log(`[rapidapi] ${platform} → ${endpoint}`);

  const res = await fetch(
    `https://${RAPIDAPI_HOST}${endpoint}${params}`,
    { headers, signal: AbortSignal.timeout(30000) }
  );

  const data = await res.json();
  console.log(`[rapidapi] status: ${res.status}`);

  if (!res.ok) throw new Error(data.message || `RapidAPI error: ${res.status}`);

  const title = data.metadata?.title || data.metadata?.author?.name || 'Video';
  const thumbnail = data.metadata?.thumbnailUrl || data.metadata?.thumbnail || '';
  const author = data.metadata?.author?.name || undefined;

//  const contents = data.contents?.[0] || {};
//  const renderableVideos = contents.renderableVideos || [];
//  const videos = contents.videos || [];
//
//  const qualities = [];
//
//  // renderableVideos — already merged video+audio
//for (const v of renderableVideos) {
//    if (!v.renderConfig?.executionUrl) continue;
//    qualities.push({
//      label: v.label || v.metadata?.quality_label || 'Best Quality',
//      url: v.renderConfig.executionUrl, // this is the execution URL
//      ext: 'mp4',
//      resolution: v.metadata?.quality_label || v.label,
//      size: undefined,
//    });
//  }
//
//  // Direct video URLs fallback
//  if (qualities.length === 0) {
//    for (const v of videos) {
//      if (!v.url) continue;
//      const streamUrl = `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&videoUrl=${encodeURIComponent(v.url)}`;
//      qualities.push({
//        label: v.label || v.metadata?.quality_label || 'Best Quality',
//        url: streamUrl,
//        ext: 'mp4',
//        resolution: v.metadata?.quality_label || v.label,
//        size: v.metadata?.content_length_text || undefined,
//      });
//    }
//  }

const contents = data.contents?.[0] || {};
  const renderableVideos = contents.renderableVideos || [];
  const videos = contents.videos || [];

  const qualities = [];
  const seenLabels = new Set();

  // Primary — renderableVideos (merged audio+video)
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
    });
  }

  // Fallback — direct video URLs (no audio merge needed for reels/posts)
  if (qualities.length === 0) {
    console.log('[rapidapi] no renderableVideos, trying direct videos fallback...');
    for (const v of videos) {
      if (!v.url) continue;
      const label = v.label || v.metadata?.quality_label || 'Best Quality';
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);
      qualities.push({
        label,
        url: v.url,
        ext: 'mp4',
        resolution: v.metadata?.quality_label || label,
        size: v.metadata?.content_length_text || undefined,
      });
    }
  }

  if (qualities.length === 0) {
    // Log full response for debugging
    console.error('[rapidapi] full response:', JSON.stringify(data).slice(0, 500));
    throw new Error('No qualities in RapidAPI response');
  }
  console.log(`[rapidapi] contents keys:`, Object.keys(contents));
    console.log(`[rapidapi] renderableVideos: ${renderableVideos.length} videos: ${videos.length}`);

  if (qualities.length === 0) throw new Error('No downloadable links found for this video.');

  console.log(`[rapidapi] ✓ found ${qualities.length} qualities`);

  return {
    platform,
    title,
    thumbnail,
    author,
    qualities,
    _source: 'rapidapi',
  };
}

// Dipanshu's rapid api code

// import { detectPlatform } from './platform.js';
//
// const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
// const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'social-media-video-downloader.p.rapidapi.com';
//
// export async function getVideoInfo(url) {
//   const platform = detectPlatform(url);
//
//   if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set on server.');
//
//   const headers = {
//     'x-rapidapi-key': RAPIDAPI_KEY,
//     'x-rapidapi-host': RAPIDAPI_HOST,
//   };
//
//   let endpoint = '';
//   let params = '';
//
//   if (platform === 'instagram') {
//     const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
//     if (!match) throw new Error('Could not extract Instagram shortcode');
//     const shortcode = match[2];
//     endpoint = '/instagram/v3/media/post/details';
//     params = `?shortcode=${shortcode}&renderableFormats=720p,1080p&fields=contents,metadata`;
//   } else if (platform === 'facebook') {
//     endpoint = '/facebook/v3/post/details';
//     params = `?url=${encodeURIComponent(url)}&renderableFormats=720p,1080p&fields=contents,metadata`;
//   } else if (platform === 'tiktok') {
//     endpoint = '/tiktok/v3/post/details';
//     params = `?url=${encodeURIComponent(url)}&fields=contents,metadata`;
//   } else if (platform === 'youtube') {
// //    const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
//   const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
//
//     if (!match) throw new Error('Could not extract YouTube video ID');
//     const videoId = match[1];
//     endpoint = '/youtube/v3/video/details';
//     params = `?videoId=${videoId}&renderableFormats=720p,1080p,1440p,2160p&urlAccess=normal&fields=contents,metadata`;
//   } else if (platform === 'twitter') {
//     endpoint = '/twitter/v3/post/details';
//     params = `?url=${encodeURIComponent(url)}&fields=contents,metadata`;
//   } else {
//     throw new Error('Unsupported platform. Supported: YouTube, Instagram, Facebook, TikTok, Twitter.');
//   }
//
//   console.log(`[rapidapi] ${platform} → ${endpoint}`);
//
//   const res = await fetch(
//     `https://${RAPIDAPI_HOST}${endpoint}${params}`,
//     { headers, signal: AbortSignal.timeout(90000) }
//   );
//
//   const data = await res.json();
//   console.log(`[rapidapi] status: ${res.status}`);
//
//   if (!res.ok) throw new Error(data.message || `RapidAPI error: ${res.status}`);
//
//   const title = data.metadata?.title || data.metadata?.author?.name || 'Video';
//   const thumbnail = data.metadata?.thumbnailUrl || data.metadata?.thumbnail || '';
//   const author = data.metadata?.author?.name || undefined;
//
//   const contents = data.contents?.[0] || {};
//   const renderableVideos = contents.renderableVideos || [];
//
//   const qualities = [];
//   const seenLabels = new Set();
//
//   // ONLY use renderableVideos — they have merged audio+video
//   // Direct videos array is skipped — no audio
//   for (const v of renderableVideos) {
//     if (!v.renderConfig?.executionUrl) continue;
//     const label = v.label || v.metadata?.quality_label || 'Best Quality';
//
//     // Deduplicate by label
//     if (seenLabels.has(label)) continue;
//     seenLabels.add(label);
//
//     qualities.push({
//       label,
//       url: v.renderConfig.executionUrl,
//       ext: 'mp4',
//       resolution: v.metadata?.quality_label || label,
//       size: v.metadata?.content_length_text || undefined,
//     });
//   }
//
//   if (qualities.length === 0) throw new Error('No downloadable links found for this video.');
//
//   console.log(`[rapidapi] ✓ found ${qualities.length} qualities`);
//
//   return {
//     platform,
//     title,
//     thumbnail,
//     author,
//     qualities,
//     _source: 'rapidapi',
//   };
// }
//


//
//// utils/downloader.js
//import { detectPlatform } from './platform.js';
//import { dirname, join } from 'path';
//import { fileURLToPath } from 'url';
//import { existsSync } from 'fs';
//import YTDlpWrapModule from 'yt-dlp-wrap';
//
//const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;
//
//const __dirname = dirname(fileURLToPath(import.meta.url));
//const isWin = process.platform === 'win32';
//const BIN_DIR = join(__dirname, '..', 'bin');
//const YTDLP_PATH = join(BIN_DIR, isWin ? 'yt-dlp.exe' : 'yt-dlp');
//const COOKIES_PATH = join(BIN_DIR, 'cookies.txt');
//
//const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
//const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'social-media-video-downloader.p.rapidapi.com';
//
///* ═════════════════════════════════════════════════════════════════
//   MAIN ENTRY — runs all methods until one succeeds
//   ═══════════════════════════════════════════════════════════════ */
//export async function getVideoInfo(url) {
//  const platform = detectPlatform(url);
//  const errors = [];
//
//  const methods = [
//    { name: 'RapidAPI',   fn: () => tryRapidAPI(url, platform) },
//    { name: 'yt-dlp',     fn: () => tryYtDlp(url, platform) },
//    { name: 'Cobalt',     fn: () => tryCobalt(url, platform) },
//    { name: 'Direct',     fn: () => tryDirect(url, platform) },
//  ];
//
//  for (const method of methods) {
//    try {
//      console.log(`[downloader] trying ${method.name}...`);
//      const result = await method.fn();
//      if (result?.qualities?.length > 0) {
//        console.log(`[downloader] ✅ ${method.name} success (${result.qualities.length} qualities)`);
//        return result;
//      }
//      throw new Error('No qualities returned');
//    } catch (err) {
//      const msg = err?.message?.slice(0, 200) || 'unknown error';
//      console.warn(`[downloader] ❌ ${method.name} failed: ${msg}`);
//      errors.push(`${method.name}: ${msg}`);
//    }
//  }
//
//  throw new Error(`All methods failed.\n${errors.join('\n')}`);
//}
//
///* ═════════════════════════════════════════════════════════════════
//   METHOD 1 — RapidAPI (your existing working flow)
//   ═══════════════════════════════════════════════════════════════ */
//async function tryRapidAPI(url, platform) {
//  if (!RAPIDAPI_KEY) throw new Error('RAPIDAPI_KEY not set');
//
//  const headers = {
//    'x-rapidapi-key': RAPIDAPI_KEY,
//    'x-rapidapi-host': RAPIDAPI_HOST,
//  };
//
//  let endpoint = '';
//  let params = '';
//
////  if (platform === 'instagram') {
////    const match = url.match(/\/(p|reel|tv)\/([A-Za-z0-9_-]+)/);
////    if (!match) throw new Error('Could not extract Instagram shortcode');
////    endpoint = '/instagram/v3/media/post/details';
////    params = `?shortcode=${match[2]}&renderableFormats=720p,1080p&fields=contents,metadata`;
////  } else if (platform === 'facebook') {
////    endpoint = '/facebook/v3/post/details';
////    params = `?url=${encodeURIComponent(url)}&renderableFormats=720p,1080p&fields=contents,metadata`;
//if (platform === 'instagram') {
//  // Fixed — strip query params before matching shortcode
//  const cleanUrl = url.split('?')[0];
//  const match = cleanUrl.match(/\/(?:p|reel|tv|reels)\/([A-Za-z0-9_-]+)/);
//  if (!match) throw new Error('Could not extract Instagram shortcode');
//  const shortcode = match[1];
//  endpoint = '/instagram/v3/media/post/details';
//  params = `?shortcode=${shortcode}&renderableFormats=720p,1080p,highres&fields=contents,metadata`;
//
//} else if (platform === 'facebook') {
//  endpoint = '/facebook/v3/post/details';
//  params = `?url=${encodeURIComponent(url)}&renderableFormats=720p,1080p,highres&fields=contents,metadata`;
//  } else if (platform === 'tiktok') {
//    endpoint = '/tiktok/v3/post/details';
//    params = `?url=${encodeURIComponent(url)}&fields=contents,metadata`;
//  } else if (platform === 'youtube') {
//    const match = url.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/);
//    if (!match) throw new Error('Could not extract YouTube video ID');
//    endpoint = '/youtube/v3/video/details';
//    params = `?videoId=${match[1]}&renderableFormats=720p,1080p,1440p,2160p&urlAccess=normal&fields=contents,metadata`;
//  } else if (platform === 'twitter') {
//    endpoint = '/twitter/v3/post/details';
//    params = `?url=${encodeURIComponent(url)}&fields=contents,metadata`;
//  } else {
//    throw new Error('Unsupported platform for RapidAPI');
//  }
//
//  const res = await fetch(`https://${RAPIDAPI_HOST}${endpoint}${params}`, {
//    headers,
//    signal: AbortSignal.timeout(45000),
//  });
//
//  const data = await res.json();
//  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
//
//  const title = data.metadata?.title || data.metadata?.author?.name || 'Video';
//  const thumbnail = data.metadata?.thumbnailUrl || data.metadata?.thumbnail || '';
//  const author = data.metadata?.author?.name;
//  const renderableVideos = data.contents?.[0]?.renderableVideos || [];
//
//  const qualities = [];
//  const seen = new Set();
//  for (const v of renderableVideos) {
//    if (!v.renderConfig?.executionUrl) continue;
//    const label = v.label || v.metadata?.quality_label || 'Best Quality';
//    if (seen.has(label)) continue;
//    seen.add(label);
//    qualities.push({
//      label,
//      url: v.renderConfig.executionUrl,
//      ext: 'mp4',
//      resolution: v.metadata?.quality_label || label,
//      size: v.metadata?.content_length_text || undefined,
//    });
//  }
//
//  if (qualities.length === 0) throw new Error('No qualities in RapidAPI response');
//
//  return { platform, title, thumbnail, author, qualities, _source: 'rapidapi' };
//}
//
///* ═════════════════════════════════════════════════════════════════
//   METHOD 2 — yt-dlp (self-hosted, always works for YT)
//   ═══════════════════════════════════════════════════════════════ */
//async function tryYtDlp(url, platform) {
//  if (!existsSync(YTDLP_PATH)) throw new Error('yt-dlp binary not found at ' + YTDLP_PATH);
//
//  const ytDlp = new YTDlpWrap(YTDLP_PATH);
//
//  const args = [
//    url,
//    '--dump-single-json',
//    '--no-warnings',
//    '--no-playlist',
//    '--no-check-certificate',
//    '-f', 'best[ext=mp4][acodec!=none][vcodec!=none]/best[acodec!=none]/best',
//  ];
//
//  // Use cookies if available (helps with YouTube bot detection)
//  if (existsSync(COOKIES_PATH)) {
//    args.push('--cookies', COOKIES_PATH);
//  }
//
//  // YouTube-specific client fallback chain (bypasses bot detection)
//  if (platform === 'youtube') {
//    args.push('--extractor-args', 'youtube:player_client=android_vr,tv_embedded,mweb,ios,android,web');
//  }
//
//  const stdout = await new Promise((resolve, reject) => {
//    let buffer = '';
//    const proc = ytDlp.exec(args);
//    const timer = setTimeout(() => {
//      try { proc.ytDlpProcess?.kill(); } catch {}
//      reject(new Error('yt-dlp timed out (60s)'));
//    }, 60000);
//
//    proc.on('ytDlpEvent', () => {});
//    proc.ytDlpProcess?.stdout?.on('data', (chunk) => { buffer += chunk.toString(); });
//    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
//    proc.on('close', (code) => {
//      clearTimeout(timer);
//      if (code !== 0 && !buffer) return reject(new Error(`yt-dlp exited with code ${code}`));
//      resolve(buffer);
//    });
//  });
//
//  let info;
//  try {
//    info = JSON.parse(stdout);
//  } catch {
//    throw new Error('yt-dlp returned invalid JSON');
//  }
//
//  const title = info.title || 'Video';
//  const thumbnail = info.thumbnail || '';
//  const author = info.uploader || info.channel;
//
//  // Build qualities from formats with both video + audio
//  const merged = (info.formats || [])
//    .filter(f => f.url && f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')
//    .filter(f => f.ext === 'mp4' || f.ext === 'webm')
//    .sort((a, b) => (b.height || 0) - (a.height || 0));
//
//  const qualities = [];
//  const seen = new Set();
//  for (const f of merged) {
//    const label = f.height ? `${f.height}p` : (f.format_note || 'Best Quality');
//    if (seen.has(label)) continue;
//    seen.add(label);
//    qualities.push({
//      label,
//      url: f.url,
//      ext: f.ext || 'mp4',
//      resolution: label,
//      size: f.filesize ? `${(f.filesize / 1024 / 1024).toFixed(1)} MB` : undefined,
//    });
//    if (qualities.length >= 4) break;
//  }
//
//  // Fallback: use top-level URL if formats empty
//  if (qualities.length === 0 && info.url) {
//    qualities.push({
//      label: 'Best Quality',
//      url: info.url,
//      ext: info.ext || 'mp4',
//      resolution: info.height ? `${info.height}p` : 'Best',
//    });
//  }
//
//  if (qualities.length === 0) throw new Error('No usable formats from yt-dlp');
//
//  return { platform, title, thumbnail, author, qualities, _source: 'ytdlp' };
//}
//
///* ═════════════════════════════════════════════════════════════════
//   METHOD 3 — Cobalt.tools (free public API, no key)
//   ═══════════════════════════════════════════════════════════════ */
//async function tryCobalt(url, platform) {
//  const res = await fetch('https://api.cobalt.tools/api/json', {
//    method: 'POST',
//    headers: {
//      'Content-Type': 'application/json',
//      'Accept': 'application/json',
//      'User-Agent': 'Mozilla/5.0',
//    },
//    body: JSON.stringify({
//      url,
//      vQuality: '720',
//      vCodec: 'h264',
//      isAudioOnly: false,
//      filenamePattern: 'classic',
//    }),
//    signal: AbortSignal.timeout(20000),
//  });
//
//  if (!res.ok) throw new Error(`Cobalt HTTP ${res.status}`);
//  const data = await res.json();
//
//  if (data.status === 'error') throw new Error(data.text || 'Cobalt error');
//  if (!data.url) throw new Error('No URL from Cobalt');
//
//  return {
//    platform,
//    title: 'Video',
//    thumbnail: '',
//    author: undefined,
//    qualities: [{
//      label: 'Best Quality',
//      url: data.url,
//      ext: 'mp4',
//      resolution: '720p',
//    }],
//    _source: 'cobalt',
//  };
//}
//
///* ═════════════════════════════════════════════════════════════════
//   METHOD 4 — Direct HTML extraction (last resort, zero deps)
//   ═══════════════════════════════════════════════════════════════ */
//async function tryDirect(url, platform) {
//  const res = await fetch(url, {
//    headers: {
//      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//      'Accept': 'text/html,application/xhtml+xml',
//      'Accept-Language': 'en-US,en;q=0.9',
//    },
//    signal: AbortSignal.timeout(15000),
//  });
//
//  if (!res.ok) throw new Error(`HTTP ${res.status}`);
//  const html = await res.text();
//
//  // Try og:video meta
//  const ogMatch =
//    html.match(/<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i) ||
//    html.match(/<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i) ||
//    html.match(/<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i);
//
//  // Try <video src> or <source src>
//  const videoTagMatch = html.match(/<video[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/i);
//  const sourceTagMatch = html.match(/<source[^>]+src=["']([^"']+\.(?:mp4|webm|m3u8)[^"']*)["']/i);
//
//  // Last resort: regex sweep for any video URL in inline scripts
//  const regexMatch = html.match(/https?:\/\/[^"'\s\\]+?\.(?:mp4|m3u8|webm)(?:\?[^"'\s\\]*)?/i);
//
//  const titleMatch =
//    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
//    html.match(/<title>([^<]+)<\/title>/i);
//
//  const thumbMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
//
//  const videoUrl = ogMatch?.[1] || videoTagMatch?.[1] || sourceTagMatch?.[1] || regexMatch?.[0];
//  if (!videoUrl) throw new Error('No video URL found in page');
//
//  // Resolve relative URLs
//  const absUrl = new URL(videoUrl, url).toString();
//
//  return {
//    platform,
//    title: titleMatch?.[1]?.trim() || 'Video',
//    thumbnail: thumbMatch?.[1] || '',
//    author: undefined,
//    qualities: [{
//      label: 'Best Quality',
//      url: absUrl,
//      ext: absUrl.includes('.webm') ? 'webm' : 'mp4',
//      resolution: 'Best',
//    }],
//    _source: 'direct',
//  };
//}