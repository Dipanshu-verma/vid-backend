// import YTDlpWrapModule from 'yt-dlp-wrap';
// const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;

// import { join, dirname } from 'path';
// import { fileURLToPath } from 'url';
// import { existsSync } from 'fs';
// import { detectPlatform } from './platform.js';

// const __dirname = dirname(fileURLToPath(import.meta.url));
// const binPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

// function getYtDlp() {
//   if (!existsSync(binPath)) throw new Error('yt-dlp binary not found.');
//   return new YTDlpWrap(binPath);
// }

// function formatDuration(seconds) {
//   if (!seconds || seconds <= 0) return undefined;
//   const h = Math.floor(seconds / 3600);
//   const m = Math.floor((seconds % 3600) / 60);
//   const s = Math.floor(seconds % 60);
//   if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
//   return `${m}:${String(s).padStart(2, '0')}`;
// }

// function formatSize(bytes) {
//   if (!bytes || bytes <= 0) return undefined;
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
//   if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
//   return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
// }

// function getBestThumbnail(info) {
//   if (info.thumbnails?.length > 0) {
//     return [...info.thumbnails]
//       .filter(t => t.url)
//       .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
//   }
//   return info.thumbnail || undefined;
// }

// function getQualityLabel(height) {
//   if (height >= 2160) return `${height}p 4K`;
//   if (height >= 1440) return `${height}p 2K`;
//   if (height >= 1080) return `${height}p Full HD`;
//   if (height >= 720)  return `${height}p HD`;
//   if (height >= 480)  return `${height}p`;
//   if (height >= 360)  return `${height}p`;
//   return `${height}p`;
// }

// // Pick exact size from filesize only — never filesize_approx for display
// function exactSize(fmt) {
//   return fmt?.filesize || 0;
// }

// export async function getVideoInfo(url) {
//   const ytDlp = getYtDlp();
//   const platform = detectPlatform(url);
//   const API = process.env.API_BASE_URL || 'http://localhost:3001';

//   const args = [
//     url,
//     '--no-warnings',
//     '--no-playlist',
//     '--no-check-certificate',
//     '--skip-download',
//     '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
//   ];

//   let raw;
//   try {
//     raw = await ytDlp.getVideoInfo(args);
//   } catch (err) {
//     throw new Error(err?.stderr || err?.message || String(err));
//   }

//   const title = raw.title || 'Untitled Video';
//   const formats = raw.formats || [];

//   // ── Separate video-only and audio-only streams ──────────────────────
//   const videoOnly = formats.filter(f =>
//     f.height &&
//     f.vcodec && f.vcodec !== 'none' &&
//     (!f.acodec || f.acodec === 'none') &&
//     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//   );

//   const combined = formats.filter(f =>
//     f.height &&
//     f.vcodec && f.vcodec !== 'none' &&
//     f.acodec && f.acodec !== 'none' &&
//     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//   );

//   // Best audio-only stream (m4a preferred)
//   const audioOnly = formats.filter(f =>
//     f.acodec && f.acodec !== 'none' &&
//     (!f.vcodec || f.vcodec === 'none') &&
//     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//   );

//   // Pick the single best audio format yt-dlp would choose
//   const bestAudio = audioOnly
//     .filter(f => f.ext === 'm4a')
//     .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
//     ?? audioOnly.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

//   const bestAudioSize = exactSize(bestAudio);

//   // ── Build height map ────────────────────────────────────────────────
//   // For each height, find the best video-only format (highest bitrate mp4 preferred)
//   const heightMap = new Map();

//   for (const f of [...videoOnly, ...combined]) {
//     const existing = heightMap.get(f.height);

//     // Prefer mp4 ext, then highest tbr/vbr
//     const fScore = (f.ext === 'mp4' ? 100000 : 0) + (f.tbr || f.vbr || 0);
//     const eScore = existing
//       ? (existing.ext === 'mp4' ? 100000 : 0) + (existing.tbr || existing.vbr || 0)
//       : -1;

//     if (fScore > eScore) heightMap.set(f.height, f);
//   }

//   const heights = [...heightMap.keys()].sort((a, b) => b - a);

//   console.log(`[info] Heights: ${heights.join(', ')} | bestAudio: ${formatSize(bestAudioSize) || 'unknown'}`);

//   const qualities = heights.map(height => {
//     const vfmt = heightMap.get(height);
//     const isCombined = vfmt.acodec && vfmt.acodec !== 'none';

//     // Size calculation:
//     // - combined format: just its own size (already has audio)
//     // - video-only: video size + best audio size
//     const videoSize = exactSize(vfmt);
//     let totalSize = 0;

//     if (isCombined) {
//       totalSize = videoSize;
//     } else if (videoSize > 0 && bestAudioSize > 0) {
//       totalSize = videoSize + bestAudioSize;
//     } else if (videoSize > 0) {
//       totalSize = videoSize;
//     }

//     const formatSelector = isCombined
//       ? `best[height<=${height}][ext=mp4]/best[height<=${height}]`
//       : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

//     return {
//       label: getQualityLabel(height),
//       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent(formatSelector)}`,
//       ext: 'mp4',
//       resolution: vfmt.width ? `${vfmt.width}×${height}` : undefined,
//       size: formatSize(totalSize),   // undefined if no size data — shows nothing instead of wrong number
//     };
//   });

//   if (qualities.length === 0) {
//     qualities.push({
//       label: 'Best Available',
//       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent('bestvideo+bestaudio/best')}`,
//       ext: 'mp4',
//     });
//   }

//   return {
//     platform,
//     title,
//     thumbnail: getBestThumbnail(raw),
//     author: raw.uploader || raw.channel || raw.creator || undefined,
//     duration: formatDuration(raw.duration),
//     qualities,
//   };
// }


// import YTDlpWrapModule from 'yt-dlp-wrap';
// const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;

// import { join, dirname } from 'path';
// import { fileURLToPath } from 'url';
// import { existsSync } from 'fs';
// import { detectPlatform } from './platform.js';

// const __dirname = dirname(fileURLToPath(import.meta.url));
// const isWin = process.platform === 'win32';
// const binPath = join(__dirname, '..', 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');

// function getYtDlp() {
//   if (!existsSync(binPath)) throw new Error('yt-dlp binary not found.');
//   return new YTDlpWrap(binPath);
// }

// function formatDuration(seconds) {
//   if (!seconds || seconds <= 0) return undefined;
//   const h = Math.floor(seconds / 3600);
//   const m = Math.floor((seconds % 3600) / 60);
//   const s = Math.floor(seconds % 60);
//   if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
//   return `${m}:${String(s).padStart(2, '0')}`;
// }

// function formatSize(bytes) {
//   if (!bytes || bytes <= 0) return undefined;
//   if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
//   if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
//   return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
// }

// function getBestThumbnail(info) {
//   if (info.thumbnails?.length > 0) {
//     return [...info.thumbnails]
//       .filter(t => t.url)
//       .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
//   }
//   return info.thumbnail || undefined;
// }

// function getQualityLabel(height) {
//   if (height >= 2160) return `${height}p 4K`;
//   if (height >= 1440) return `${height}p 2K`;
//   if (height >= 1080) return `${height}p Full HD`;
//   if (height >= 720)  return `${height}p HD`;
//   if (height >= 480)  return `${height}p`;
//   if (height >= 360)  return `${height}p`;
//   return `${height}p`;
// }

// function exactSize(fmt) {
//   return fmt?.filesize || 0;
// }

// function baseArgs(url) {
//   return [
//     url,
//     '--no-warnings',
//     '--no-playlist',
//     '--no-check-certificate',
//     '--skip-download',
//   ];
// }

// // YouTube client attempts for INFO FETCH — web first gets ALL formats including 4K
// const YT_INFO_ATTEMPTS = [
//   {
//     name: 'web',
//     args: [
//       '--extractor-args', 'youtube:player_client=web',
//       '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//     ],
//   },
//   {
//     name: 'tv_embedded',
//     args: [
//       '--extractor-args', 'youtube:player_client=tv_embedded,web',
//       '--add-header', 'user-agent:Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
//     ],
//   },
//   {
//     name: 'android',
//     args: [
//       '--extractor-args', 'youtube:player_client=android',
//       '--add-header', 'user-agent:com.google.android.youtube/19.30.36 (Linux; U; Android 11) gzip',
//     ],
//   },
//   {
//     name: 'ios',
//     args: [
//       '--extractor-args', 'youtube:player_client=ios',
//       '--add-header', 'user-agent:com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
//     ],
//   },
// ];

// function buildQualities(formats, url, title, API) {
//   const videoOnly = formats.filter(f =>
//     f.height && f.vcodec && f.vcodec !== 'none' &&
//     (!f.acodec || f.acodec === 'none') &&
//     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//   );

//   const combined = formats.filter(f =>
//     f.height && f.vcodec && f.vcodec !== 'none' &&
//     f.acodec && f.acodec !== 'none' &&
//     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//   );

//   const audioOnly = formats.filter(f =>
//     f.acodec && f.acodec !== 'none' &&
//     (!f.vcodec || f.vcodec === 'none') &&
//     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
//   );

//   const bestAudio = audioOnly
//     .filter(f => f.ext === 'm4a')
//     .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
//     ?? audioOnly.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

//   const bestAudioSize = exactSize(bestAudio);
//   const heightMap = new Map();

//   for (const f of [...videoOnly, ...combined]) {
//     const existing = heightMap.get(f.height);
//     const fScore = (f.ext === 'mp4' ? 100000 : 0) + (f.tbr || f.vbr || 0);
//     const eScore = existing
//       ? (existing.ext === 'mp4' ? 100000 : 0) + (existing.tbr || existing.vbr || 0)
//       : -1;
//     if (fScore > eScore) heightMap.set(f.height, f);
//   }

//   const heights = [...heightMap.keys()].sort((a, b) => b - a);
//   console.log(`[info] heights=${heights.join(',')} audio=${formatSize(bestAudioSize) || 'none'}`);

//   // Always add "Best Quality" at top — works regardless of client used in stream
//   const streamBase = `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;

//   const qualities = [{
//     label: 'Best Quality',
//     url: `${streamBase}&format=${encodeURIComponent('bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best')}`,
//     ext: 'mp4',
//     resolution: undefined,
//     size: undefined,
//   }];

//   for (const height of heights) {
//     const vfmt = heightMap.get(height);
//     const isCombined = vfmt.acodec && vfmt.acodec !== 'none';
//     const videoSize = exactSize(vfmt);
//     const totalSize = isCombined
//       ? videoSize
//       : (videoSize > 0 && bestAudioSize > 0 ? videoSize + bestAudioSize : videoSize);

//     // Broad format selector with multiple fallbacks
//     const formatSelector = isCombined
//       ? `best[height<=${height}][ext=mp4]/best[height<=${height}]/best`
//       : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;

//     qualities.push({
//       label: getQualityLabel(height),
//       url: `${streamBase}&format=${encodeURIComponent(formatSelector)}`,
//       ext: 'mp4',
//       resolution: vfmt.width ? `${vfmt.width}×${height}` : undefined,
//       // size: formatSize(totalSize),
//     });
//   }

//   // Non-YouTube fallback (Instagram/Facebook/TikTok single streams)
//   if (heights.length === 0) {
//     const fallbacks = formats
//       .filter(f => f.url && !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol))
//       .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))
//       .slice(0, 3);

//     for (const [i, fmt] of fallbacks.entries()) {
//       qualities.push({
//         label: fmt.format_note || (i === 0 ? 'Best Quality' : `Option ${i + 1}`),
//         url: `${streamBase}&format=${encodeURIComponent(fmt.format_id || 'best')}`,
//         ext: fmt.ext || 'mp4',
//         resolution: fmt.width && fmt.height ? `${fmt.width}×${fmt.height}` : undefined,
//         size: formatSize(exactSize(fmt)),
//       });
//     }
//   }

//   return qualities;
// }

// export async function getVideoInfo(url) {
//   const ytDlp = getYtDlp();
//   const platform = detectPlatform(url);
//   const API = process.env.API_BASE_URL || 'http://localhost:3001';

//   let raw;
//   let lastError;
//   let successClient = 'unknown';

//   if (platform === 'youtube') {
//     for (const attempt of YT_INFO_ATTEMPTS) {
//       try {
//         console.log(`[yt-dlp] trying client: ${attempt.name}`);
//         raw = await ytDlp.getVideoInfo([...baseArgs(url), ...attempt.args]);
//         successClient = attempt.name;
//         console.log(`[yt-dlp] success with client: ${attempt.name} | formats: ${raw.formats?.length || 0}`);
//         break;
//       } catch (err) {
//         lastError = err;
//         const msg = err?.stderr || err?.message || '';
//         console.error(`[yt-dlp] ${attempt.name} failed:`, msg.slice(0, 150));
//       }
//     }
//     if (!raw) throw new Error(lastError?.stderr || lastError?.message || 'All YouTube clients failed');

//   } else {
//     const extraHeaders = (platform === 'instagram' || platform === 'facebook') ? [
//       '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//       '--add-header', 'Accept-Language:en-us,en;q=0.5',
//       '--add-header', 'Sec-Fetch-Mode:navigate',
//       '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
//     ] : [
//       '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
//     ];

//     try {
//       raw = await ytDlp.getVideoInfo([...baseArgs(url), ...extraHeaders]);
//     } catch (err) {
//       throw new Error(err?.stderr || err?.message || String(err));
//     }
//   }

//   const title = raw.title || 'Untitled Video';
//   const formats = raw.formats || [];
//   const qualities = buildQualities(formats, url, title, API);

//   return {
//     platform,
//     title,
//     thumbnail: getBestThumbnail(raw),
//     author: raw.uploader || raw.channel || raw.creator || undefined,
//     duration: formatDuration(raw.duration),
//     qualities,
//   };
// }
import YTDlpWrapModule from 'yt-dlp-wrap';
const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { detectPlatform } from './platform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const binPath = join(__dirname, '..', 'bin', isWin ? 'yt-dlp.exe' : 'yt-dlp');
const cookiesPath = join(__dirname, '..', 'bin', 'cookies.txt');

function getYtDlp() {
  if (!existsSync(binPath)) throw new Error('yt-dlp binary not found.');
  return new YTDlpWrap(binPath);
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return undefined;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return undefined;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getBestThumbnail(info) {
  if (info.thumbnails?.length > 0) {
    return [...info.thumbnails]
      .filter(t => t.url)
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
  }
  return info.thumbnail || undefined;
}

function getQualityLabel(height) {
  if (height >= 2160) return `${height}p 4K`;
  if (height >= 1440) return `${height}p 2K`;
  if (height >= 1080) return `${height}p Full HD`;
  if (height >= 720)  return `${height}p HD`;
  if (height >= 480)  return `${height}p`;
  if (height >= 360)  return `${height}p`;
  return `${height}p`;
}

function exactSize(fmt) {
  // filesize_approx is often available even when filesize isn't
  return fmt?.filesize || fmt?.filesize_approx || 0;
}

function baseArgs(url) {
  return [
    url,
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificate',
    '--skip-download',
  ];
}

// Cookies args — injected if cookies.txt exists (set YOUTUBE_COOKIES_B64 on Render)
function cookiesArgs() {
  if (existsSync(cookiesPath)) {
    return ['--cookies', cookiesPath];
  }
  return [];
}

// PO Token args — set YT_PO_TOKEN env var on Render if needed
// Format: "visitor_data=Cgt...,po_token=MnQ..."
function poTokenArgs() {
  const token = process.env.YT_PO_TOKEN;
  if (token) {
    return ['--extractor-args', `youtube:po_token=${token}`];
  }
  return [];
}

// Client attempt chain — ordered by datacenter-friendliness
// android_vr & mweb use InnerTube endpoints that Render IPs aren't blocked on
const YT_INFO_ATTEMPTS = [
  {
    name: 'android_vr',       // Best for datacenter IPs — VR client is lightly restricted
    args: [
      '--extractor-args', 'youtube:player_client=android_vr',
      '--add-header', 'user-agent:Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
    ],
  },
  {
    name: 'tv_embedded',      // TV embedded client — no bot checks
    args: [
      '--extractor-args', 'youtube:player_client=tv_embedded,web',
      '--add-header', 'user-agent:Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    ],
  },
  {
    name: 'mweb',             // Mobile web — lighter fingerprinting
    args: [
      '--extractor-args', 'youtube:player_client=mweb',
      '--add-header', 'user-agent:Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    ],
  },
  {
    name: 'ios',              // iOS client — often gets 4K formats
    args: [
      '--extractor-args', 'youtube:player_client=ios',
      '--add-header', 'user-agent:com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)',
    ],
  },
  {
    name: 'android',
    args: [
      '--extractor-args', 'youtube:player_client=android',
      '--add-header', 'user-agent:com.google.android.youtube/19.30.36 (Linux; U; Android 11) gzip',
    ],
  },
  {
    name: 'web',              // Fallback — most likely to be blocked on Render
    args: [
      '--extractor-args', 'youtube:player_client=web',
      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    ],
  },
];

function buildQualities(formats, url, title, API) {
  const videoOnly = formats.filter(f =>
    f.height && f.vcodec && f.vcodec !== 'none' &&
    (!f.acodec || f.acodec === 'none') &&
    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
  );

  const combined = formats.filter(f =>
    f.height && f.vcodec && f.vcodec !== 'none' &&
    f.acodec && f.acodec !== 'none' &&
    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
  );

  const audioOnly = formats.filter(f =>
    f.acodec && f.acodec !== 'none' &&
    (!f.vcodec || f.vcodec === 'none') &&
    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
  );

  const bestAudio = audioOnly
    .filter(f => f.ext === 'm4a')
    .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
    ?? audioOnly.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

  const bestAudioSize = exactSize(bestAudio);

  // Deduplicate by height — prefer mp4, then highest bitrate
  const heightMap = new Map();
  for (const f of [...videoOnly, ...combined]) {
    const existing = heightMap.get(f.height);
    const fScore = (f.ext === 'mp4' ? 100000 : 0) + (f.tbr || f.vbr || 0);
    const eScore = existing
      ? (existing.ext === 'mp4' ? 100000 : 0) + (existing.tbr || existing.vbr || 0)
      : -1;
    if (fScore > eScore) heightMap.set(f.height, f);
  }

  const heights = [...heightMap.keys()].sort((a, b) => b - a);
  console.log(`[info] heights=${heights.join(',')} audio=${formatSize(bestAudioSize) || 'none'}`);

  const streamBase = `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;

  // Always include "Best Quality" as first option — yt-dlp picks the best available at stream time
  const qualities = [{
    label: 'Best Quality',
    url: `${streamBase}&format=${encodeURIComponent('bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best')}`,
    ext: 'mp4',
    resolution: undefined,
    size: undefined,
  }];

  for (const height of heights) {
    const vfmt = heightMap.get(height);
    const isCombined = vfmt.acodec && vfmt.acodec !== 'none';
    const videoSize = exactSize(vfmt);
    const totalSize = isCombined
      ? videoSize
      : (videoSize > 0 && bestAudioSize > 0 ? videoSize + bestAudioSize : videoSize);

    // Broad format selector with fallbacks — works across clients
    const formatSelector = isCombined
      ? `best[height<=${height}][ext=mp4]/best[height<=${height}]/best`
      : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;

    qualities.push({
      label: getQualityLabel(height),
      url: `${streamBase}&format=${encodeURIComponent(formatSelector)}`,
      ext: 'mp4',
      resolution: vfmt.width ? `${vfmt.width}×${height}` : `${height}p`,
      size: formatSize(totalSize),  // Show approximate size
    });
  }

  // Non-YouTube fallback (Instagram / TikTok / Facebook — single stream URLs)
  if (heights.length === 0) {
    const fallbacks = formats
      .filter(f => f.url && !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol))
      .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))
      .slice(0, 5);

    for (const [i, fmt] of fallbacks.entries()) {
      qualities.push({
        label: fmt.format_note || (i === 0 ? 'Best Quality' : `Option ${i + 1}`),
        url: `${streamBase}&format=${encodeURIComponent(fmt.format_id || 'best')}`,
        ext: fmt.ext || 'mp4',
        resolution: fmt.width && fmt.height ? `${fmt.width}×${fmt.height}` : undefined,
        size: formatSize(exactSize(fmt)),
      });
    }
  }

  return qualities;
}

export async function getVideoInfo(url) {
  const ytDlp = getYtDlp();
  const platform = detectPlatform(url);
  const API = process.env.API_BASE_URL || 'http://localhost:3001';

  const cookies = cookiesArgs();
  const poToken = poTokenArgs();

  let raw;
  let lastError;

  if (platform === 'youtube') {
    for (const attempt of YT_INFO_ATTEMPTS) {
      try {
        console.log(`[yt-dlp] trying client: ${attempt.name} | cookies=${cookies.length > 0} | poToken=${poToken.length > 0}`);

        const args = [
          ...baseArgs(url),
          ...attempt.args,
          ...cookies,
          ...poToken,
          // These flags help avoid bot detection
          '--no-cache-dir',
          '--extractor-args', attempt.args.find(a => a.startsWith('youtube:player_client'))
            ? '' // already set above
            : `youtube:skip=hls,dash`,
        ].filter(Boolean).filter((a, i, arr) => {
          // Deduplicate --extractor-args — only keep first occurrence per key
          if (a === '--extractor-args') {
            return arr.indexOf('--extractor-args') === i;
          }
          return true;
        });

        raw = await ytDlp.getVideoInfo([
          ...baseArgs(url),
          ...attempt.args,
          ...cookies,
          ...poToken,
        ]);

        console.log(`[yt-dlp] success: ${attempt.name} | formats: ${raw.formats?.length || 0}`);
        break;
      } catch (err) {
        lastError = err;
        const msg = (err?.stderr || err?.message || '').toLowerCase();
        console.error(`[yt-dlp] ${attempt.name} failed:`, (err?.stderr || err?.message || '').slice(0, 200));

        // Skip remaining attempts if it's a known unrecoverable error
        if (msg.includes('video unavailable') || msg.includes('private video')) {
          break;
        }
      }
    }

    if (!raw) {
      const errMsg = lastError?.stderr || lastError?.message || 'All YouTube clients failed';
      throw new Error(errMsg);
    }

  } else {
    // Non-YouTube platforms (Instagram, TikTok, Twitter, Facebook, etc.)
    const extraHeaders = (platform === 'instagram' || platform === 'facebook') ? [
      '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '--add-header', 'Accept-Language:en-us,en;q=0.5',
      '--add-header', 'Sec-Fetch-Mode:navigate',
      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    ] : [
      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    ];

    try {
      raw = await ytDlp.getVideoInfo([
        ...baseArgs(url),
        ...extraHeaders,
        ...cookies,
      ]);
    } catch (err) {
      throw new Error(err?.stderr || err?.message || String(err));
    }
  }

  const title = raw.title || 'Untitled Video';
  const formats = raw.formats || [];
  const qualities = buildQualities(formats, url, title, API);

  return {
    platform,
    title,
    thumbnail: getBestThumbnail(raw),
    author: raw.uploader || raw.channel || raw.creator || undefined,
    duration: formatDuration(raw.duration),
    qualities,
  };
}