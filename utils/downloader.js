import YTDlpWrapModule from 'yt-dlp-wrap';
const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { detectPlatform } from './platform.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

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

// Pick exact size from filesize only — never filesize_approx for display
function exactSize(fmt) {
  return fmt?.filesize || 0;
}

export async function getVideoInfo(url) {
  const ytDlp = getYtDlp();
  const platform = detectPlatform(url);
  const API = process.env.API_BASE_URL || 'http://localhost:3001';

  const args = [
    url,
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificate',
    '--skip-download',
    '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
  ];

  let raw;
  try {
    raw = await ytDlp.getVideoInfo(args);
  } catch (err) {
    throw new Error(err?.stderr || err?.message || String(err));
  }

  const title = raw.title || 'Untitled Video';
  const formats = raw.formats || [];

  // ── Separate video-only and audio-only streams ──────────────────────
  const videoOnly = formats.filter(f =>
    f.height &&
    f.vcodec && f.vcodec !== 'none' &&
    (!f.acodec || f.acodec === 'none') &&
    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
  );

  const combined = formats.filter(f =>
    f.height &&
    f.vcodec && f.vcodec !== 'none' &&
    f.acodec && f.acodec !== 'none' &&
    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
  );

  // Best audio-only stream (m4a preferred)
  const audioOnly = formats.filter(f =>
    f.acodec && f.acodec !== 'none' &&
    (!f.vcodec || f.vcodec === 'none') &&
    !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
  );

  // Pick the single best audio format yt-dlp would choose
  const bestAudio = audioOnly
    .filter(f => f.ext === 'm4a')
    .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
    ?? audioOnly.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

  const bestAudioSize = exactSize(bestAudio);

  // ── Build height map ────────────────────────────────────────────────
  // For each height, find the best video-only format (highest bitrate mp4 preferred)
  const heightMap = new Map();

  for (const f of [...videoOnly, ...combined]) {
    const existing = heightMap.get(f.height);

    // Prefer mp4 ext, then highest tbr/vbr
    const fScore = (f.ext === 'mp4' ? 100000 : 0) + (f.tbr || f.vbr || 0);
    const eScore = existing
      ? (existing.ext === 'mp4' ? 100000 : 0) + (existing.tbr || existing.vbr || 0)
      : -1;

    if (fScore > eScore) heightMap.set(f.height, f);
  }

  const heights = [...heightMap.keys()].sort((a, b) => b - a);

  console.log(`[info] Heights: ${heights.join(', ')} | bestAudio: ${formatSize(bestAudioSize) || 'unknown'}`);

  const qualities = heights.map(height => {
    const vfmt = heightMap.get(height);
    const isCombined = vfmt.acodec && vfmt.acodec !== 'none';

    // Size calculation:
    // - combined format: just its own size (already has audio)
    // - video-only: video size + best audio size
    const videoSize = exactSize(vfmt);
    let totalSize = 0;

    if (isCombined) {
      totalSize = videoSize;
    } else if (videoSize > 0 && bestAudioSize > 0) {
      totalSize = videoSize + bestAudioSize;
    } else if (videoSize > 0) {
      totalSize = videoSize;
    }

    const formatSelector = isCombined
      ? `best[height<=${height}][ext=mp4]/best[height<=${height}]`
      : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

    return {
      label: getQualityLabel(height),
      url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent(formatSelector)}`,
      ext: 'mp4',
      resolution: vfmt.width ? `${vfmt.width}×${height}` : undefined,
      size: formatSize(totalSize),   // undefined if no size data — shows nothing instead of wrong number
    };
  });

  if (qualities.length === 0) {
    qualities.push({
      label: 'Best Available',
      url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent('bestvideo+bestaudio/best')}`,
      ext: 'mp4',
    });
  }

  return {
    platform,
    title,
    thumbnail: getBestThumbnail(raw),
    author: raw.uploader || raw.channel || raw.creator || undefined,
    duration: formatDuration(raw.duration),
    qualities,
  };
}

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

// // function buildArgs(url, platform) {
// //   const args = [
// //     url,
// //     '--no-warnings',
// //     '--no-playlist',
// //     '--no-check-certificate',
// //     '--skip-download',
// //     '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
// //   ];

// //   if (platform === 'youtube') {
// //     // tv_embedded bypasses age restriction without cookies
// //     args.push('--extractor-args', 'youtube:player_client=tv_embedded,web');
// //   }

// //   if (platform === 'instagram' || platform === 'facebook') {
// //     // Instagram/Facebook need these headers to not block server IPs
// //     args.push(
// //       '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
// //       '--add-header', 'Accept-Language:en-us,en;q=0.5',
// //       '--add-header', 'Sec-Fetch-Mode:navigate',
// //     );
// //   }

// //   return args;
// // }

// function buildArgs(url, platform) {
//   const base = [
//     url,
//     '--no-warnings',
//     '--no-playlist',
//     '--no-check-certificate',
//     '--skip-download',
//     '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
//   ];

//   if (platform === 'youtube') {
//     // ios client bypasses age-restriction + bot detection best on server IPs
//     base.push('--extractor-args', 'youtube:player_client=ios,tv_embedded,web');
//   }

//   if (platform === 'instagram' || platform === 'facebook') {
//     base.push(
//       '--add-header', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
//       '--add-header', 'Accept-Language:en-us,en;q=0.5',
//       '--add-header', 'Sec-Fetch-Mode:navigate',
//     );
//   }

//   return base;
// }

// // export async function getVideoInfo(url) {
// //   const ytDlp = getYtDlp();
// //   const platform = detectPlatform(url);
// //   const API = process.env.API_BASE_URL || 'http://localhost:3001';

// //   let raw;
// //   try {
// //     raw = await ytDlp.getVideoInfo(buildArgs(url, platform));
// //   } catch (err) {
// //     throw new Error(err?.stderr || err?.message || String(err));
// //   }

// //   const title = raw.title || 'Untitled Video';
// //   const formats = raw.formats || [];

// //   const videoOnly = formats.filter(f =>
// //     f.height &&
// //     f.vcodec && f.vcodec !== 'none' &&
// //     (!f.acodec || f.acodec === 'none') &&
// //     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
// //   );

// //   const combined = formats.filter(f =>
// //     f.height &&
// //     f.vcodec && f.vcodec !== 'none' &&
// //     f.acodec && f.acodec !== 'none' &&
// //     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
// //   );

// //   const audioOnly = formats.filter(f =>
// //     f.acodec && f.acodec !== 'none' &&
// //     (!f.vcodec || f.vcodec === 'none') &&
// //     !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol)
// //   );

// //   const bestAudio = audioOnly
// //     .filter(f => f.ext === 'm4a')
// //     .sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0]
// //     ?? audioOnly.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

// //   const bestAudioSize = exactSize(bestAudio);

// //   const heightMap = new Map();
// //   for (const f of [...videoOnly, ...combined]) {
// //     const existing = heightMap.get(f.height);
// //     const fScore = (f.ext === 'mp4' ? 100000 : 0) + (f.tbr || f.vbr || 0);
// //     const eScore = existing ? (existing.ext === 'mp4' ? 100000 : 0) + (existing.tbr || existing.vbr || 0) : -1;
// //     if (fScore > eScore) heightMap.set(f.height, f);
// //   }

// //   const heights = [...heightMap.keys()].sort((a, b) => b - a);
// //   console.log(`[info] platform=${platform} heights=${heights.join(',')} audio=${formatSize(bestAudioSize) || 'none'}`);

// //   let qualities = heights.map(height => {
// //     const vfmt = heightMap.get(height);
// //     const isCombined = vfmt.acodec && vfmt.acodec !== 'none';
// //     const videoSize = exactSize(vfmt);
// //     const totalSize = isCombined ? videoSize : (videoSize > 0 && bestAudioSize > 0 ? videoSize + bestAudioSize : videoSize);

// //     const formatSelector = isCombined
// //       ? `best[height<=${height}][ext=mp4]/best[height<=${height}]`
// //       : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

// //     return {
// //       label: getQualityLabel(height),
// //       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent(formatSelector)}`,
// //       ext: 'mp4',
// //       resolution: vfmt.width ? `${vfmt.width}×${height}` : undefined,
// //       size: formatSize(totalSize),
// //     };
// //   });

// //   // Fallback for Instagram/Facebook/TikTok — often single combined stream
// //   if (qualities.length === 0) {
// //     const fallbacks = formats
// //       .filter(f => f.url && !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol))
// //       .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))
// //       .slice(0, 3);

// //     qualities = fallbacks.map((fmt, i) => ({
// //       label: fmt.format_note || (i === 0 ? 'Best Quality' : `Option ${i + 1}`),
// //       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent(fmt.format_id || 'best')}`,
// //       ext: fmt.ext || 'mp4',
// //       resolution: fmt.width && fmt.height ? `${fmt.width}×${fmt.height}` : undefined,
// //       size: formatSize(exactSize(fmt)),
// //     }));
// //   }

// //   if (qualities.length === 0) {
// //     qualities.push({
// //       label: 'Best Available',
// //       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent('bestvideo+bestaudio/best')}`,
// //       ext: 'mp4',
// //     });
// //   }

// //   return {
// //     platform,
// //     title,
// //     thumbnail: getBestThumbnail(raw),
// //     author: raw.uploader || raw.channel || raw.creator || undefined,
// //     duration: formatDuration(raw.duration),
// //     qualities,
// //   };
// // }

// export async function getVideoInfo(url) {
//   const ytDlp = getYtDlp();
//   const platform = detectPlatform(url);
//   const API = process.env.API_BASE_URL || 'http://localhost:3001';

//   let raw;

//   // First attempt
//   try {
//     raw = await ytDlp.getVideoInfo(buildArgs(url, platform));
//   } catch (firstErr) {
//     const msg = firstErr?.stderr || firstErr?.message || '';
//     console.error('[yt-dlp] first attempt failed:', msg.slice(0, 200));

//     // Retry with mweb client (works on many restricted videos)
//     if (platform === 'youtube') {
//       try {
//         console.log('[yt-dlp] retrying with mweb client...');
//         const retryArgs = [
//           url,
//           '--no-warnings',
//           '--no-playlist',
//           '--no-check-certificate',
//           '--skip-download',
//           '--extractor-args', 'youtube:player_client=mweb,web_creator',
//           '--add-header', 'user-agent:Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
//         ];
//         raw = await ytDlp.getVideoInfo(retryArgs);
//       } catch (secondErr) {
//         const msg2 = secondErr?.stderr || secondErr?.message || '';
//         throw new Error(msg2 || msg);
//       }
//     } else {
//       throw new Error(msg);
//     }
//   }

//   const title = raw.title || 'Untitled Video';
//   const formats = raw.formats || [];

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
//   console.log(`[info] platform=${platform} heights=${heights.join(',')} audio=${formatSize(bestAudioSize) || 'none'}`);

//   let qualities = heights.map(height => {
//     const vfmt = heightMap.get(height);
//     const isCombined = vfmt.acodec && vfmt.acodec !== 'none';
//     const videoSize = exactSize(vfmt);
//     const totalSize = isCombined
//       ? videoSize
//       : (videoSize > 0 && bestAudioSize > 0 ? videoSize + bestAudioSize : videoSize);

//     const formatSelector = isCombined
//       ? `best[height<=${height}][ext=mp4]/best[height<=${height}]`
//       : `bestvideo[height<=${height}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`;

//     return {
//       label: getQualityLabel(height),
//       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent(formatSelector)}`,
//       ext: 'mp4',
//       resolution: vfmt.width ? `${vfmt.width}×${height}` : undefined,
//       size: formatSize(totalSize),
//     };
//   });

//   if (qualities.length === 0) {
//     const fallbacks = formats
//       .filter(f => f.url && !['m3u8', 'm3u8_native', 'hls'].includes(f.protocol))
//       .sort((a, b) => (b.tbr || 0) - (a.tbr || 0))
//       .slice(0, 3);

//     qualities = fallbacks.map((fmt, i) => ({
//       label: fmt.format_note || (i === 0 ? 'Best Quality' : `Option ${i + 1}`),
//       url: `${API}/api/stream?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}&format=${encodeURIComponent(fmt.format_id || 'best')}`,
//       ext: fmt.ext || 'mp4',
//       resolution: fmt.width && fmt.height ? `${fmt.width}×${fmt.height}` : undefined,
//       size: formatSize(exactSize(fmt)),
//     }));
//   }

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