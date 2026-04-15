// import { Router } from 'express';
// import { spawn, execFileSync } from 'child_process';
// import { join, dirname } from 'path';
// import { fileURLToPath } from 'url';
// import { existsSync } from 'fs';

// const __dirname = dirname(fileURLToPath(import.meta.url));
// const binPath  = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe'  : 'yt-dlp');
// const ffmpegPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

// const router = Router();

// function safeFilename(title) {
//   return (title || 'video')
//     .replace(/[^\x20-\x7E]/g, '')
//     .replace(/[/\\:*?"<>|,;=]/g, '')
//     .replace(/\s+/g, ' ')
//     .trim()
//     .slice(0, 80) || 'video';
// }

// // Use yt-dlp to resolve the actual direct video+audio URLs (fast, no download)
// function resolveUrls(url, formatSelector) {
//   try {
//     const out = execFileSync(binPath, [
//       url,
//       '-f', formatSelector,
//       '--get-url',
//       '--no-warnings',
//       '--no-playlist',
//       '--no-check-certificate',
//       '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
//     ], { timeout: 30000 }).toString().trim();

//     const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
//     return lines; // [videoUrl] or [videoUrl, audioUrl]
//   } catch (e) {
//     throw new Error('Could not resolve video URL: ' + (e?.message || e));
//   }
// }

// router.get('/stream', (req, res) => {
//   const { url, title, format } = req.query;

//   if (!url) return res.status(400).json({ error: 'URL is required.' });
//   if (!existsSync(binPath))   return res.status(500).json({ error: 'yt-dlp not found.' });
//   if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });

//   try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }

//   const filename = safeFilename(title);
//   const formatSelector = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';

//   console.log(`[stream] Resolving URLs for: "${filename}" format="${formatSelector}"`);

//   let urls;
//   try {
//     urls = resolveUrls(url, formatSelector);
//   } catch (e) {
//     console.error('[resolve error]', e.message);
//     return res.status(500).json({ error: e.message });
//   }

//   if (!urls.length) return res.status(500).json({ error: 'No downloadable URL found.' });

//   console.log(`[stream] Got ${urls.length} URL(s), starting ffmpeg pipe...`);

//   // Set headers immediately — browser starts download right away
//   res.setHeader('Content-Disposition',
//     `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`
//   );
//   res.setHeader('Content-Type', 'video/mp4');
//   res.setHeader('Transfer-Encoding', 'chunked');

//   let ffmpegArgs;

//   if (urls.length === 1) {
//     // Single stream (already has audio) — just remux to mp4
//     ffmpegArgs = [
//       '-i', urls[0],
//       '-c', 'copy',
//       '-movflags', 'frag_keyframe+empty_moov+faststart',
//       '-f', 'mp4',
//       'pipe:1',
//     ];
//   } else {
//     // Separate video + audio — merge them
//     ffmpegArgs = [
//       '-i', urls[0],   // video
//       '-i', urls[1],   // audio
//       '-c:v', 'copy',
//       '-c:a', 'copy',
//       '-movflags', 'frag_keyframe+empty_moov+faststart',
//       '-f', 'mp4',
//       'pipe:1',
//     ];
//   }

//   const ffmpeg = spawn(ffmpegPath, ffmpegArgs);

//   // Pipe ffmpeg stdout directly to response — no temp file
//   ffmpeg.stdout.pipe(res);

//   ffmpeg.stderr.on('data', d => {
//     const line = d.toString().trim();
//     if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
//       console.log('[ffmpeg]', line);
//     }
//   });

//   ffmpeg.on('error', (err) => {
//     console.error('[ffmpeg error]', err.message);
//     if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed.' });
//     else res.end();
//   });

//   ffmpeg.on('close', (code) => {
//     console.log(`[stream] ffmpeg exited code=${code}`);
//     res.end();
//   });

//   req.on('close', () => {
//     console.log('[stream] Client disconnected, killing ffmpeg');
//     ffmpeg.kill('SIGKILL');
//   });
// });

// export default router;

import { Router } from 'express';
import { spawn, execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath    = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe'  : 'yt-dlp');
const ffmpegPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
const cookiesPath = join(__dirname, '..', 'bin', 'cookies.txt');

const router = Router();

function safeFilename(title) {
  return (title || 'video')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[/\\:*?"<>|,;=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'video';
}

// Client chain for URL resolution — same priority as downloader.js
// android_vr resolves direct URLs even on datacenter IPs
const STREAM_CLIENT_ATTEMPTS = [
  {
    name: 'android_vr',
    args: [
      '--extractor-args', 'youtube:player_client=android_vr',
      '--add-header', 'user-agent:Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
    ],
  },
  {
    name: 'tv_embedded',
    args: [
      '--extractor-args', 'youtube:player_client=tv_embedded,web',
      '--add-header', 'user-agent:Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1',
    ],
  },
  {
    name: 'mweb',
    args: [
      '--extractor-args', 'youtube:player_client=mweb',
      '--add-header', 'user-agent:Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36',
    ],
  },
  {
    name: 'ios',
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
];

function cookiesArgs() {
  return existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
}

function poTokenArgs() {
  const token = process.env.YT_PO_TOKEN;
  return token ? ['--extractor-args', `youtube:po_token=${token}`] : [];
}

// Resolve direct video/audio URLs via yt-dlp
// Tries multiple clients until one succeeds — critical for Render IPs
function resolveUrls(url, formatSelector) {
  const cookies = cookiesArgs();
  const poToken = poTokenArgs();

  const baseArgs = [
    url,
    '-f', formatSelector,
    '--get-url',
    '--no-warnings',
    '--no-playlist',
    '--no-check-certificate',
    ...cookies,
    ...poToken,
  ];

  // Detect if this is a YouTube URL to apply client attempts
  let isYouTube = false;
  try {
    const u = new URL(url);
    isYouTube = u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
  } catch { /* non-url, skip */ }

  const attempts = isYouTube ? STREAM_CLIENT_ATTEMPTS : [
    {
      name: 'default',
      args: [
        '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      ],
    },
  ];

  let lastError;

  for (const attempt of attempts) {
    try {
      console.log(`[stream] resolving with client: ${attempt.name}`);
      const out = execFileSync(binPath, [...baseArgs, ...attempt.args], {
        timeout: 45000,  // Slightly longer — Render cold start is slow
      }).toString().trim();

      const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        console.log(`[stream] resolved ${lines.length} URL(s) via ${attempt.name}`);
        return lines;
      }
    } catch (e) {
      lastError = e;
      const msg = (e?.message || e?.stderr || '').toLowerCase();
      console.error(`[stream] ${attempt.name} resolve failed:`, (e?.message || '').slice(0, 200));

      // Don't retry on unrecoverable errors
      if (msg.includes('video unavailable') || msg.includes('private video')) break;
    }
  }

  throw new Error('Could not resolve video URL: ' + (lastError?.message || 'all clients failed'));
}

router.get('/stream', (req, res) => {
  const { url, title, format } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required.' });
  if (!existsSync(binPath))    return res.status(500).json({ error: 'yt-dlp not found.' });
  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }

  const filename = safeFilename(title);
  const formatSelector = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';

  console.log(`[stream] Starting: "${filename}" | format="${formatSelector}"`);

  let urls;
  try {
    urls = resolveUrls(url, formatSelector);
  } catch (e) {
    console.error('[stream] resolve error:', e.message);
    return res.status(500).json({ error: e.message });
  }

  if (!urls.length) return res.status(500).json({ error: 'No downloadable URL found.' });

  console.log(`[stream] Got ${urls.length} URL(s), piping via ffmpeg...`);

  res.setHeader('Content-Disposition',
    `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`
  );
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  // Allows Vercel / CDN to stream without buffering the full file
  res.setHeader('X-Accel-Buffering', 'no');

  let ffmpegArgs;

  if (urls.length === 1) {
    // Single stream — remux to mp4
    ffmpegArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', urls[0],
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4',
      'pipe:1',
    ];
  } else {
    // Separate video + audio — merge
    ffmpegArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', urls[0],   // video
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', urls[1],   // audio
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4',
      'pipe:1',
    ];
  }

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, {
    // Prevent ffmpeg from inheriting Render's small pipe buffer limit
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Pipe ffmpeg stdout → response (no temp file)
  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
      console.log('[ffmpeg]', line);
    }
  });

  ffmpeg.on('error', (err) => {
    console.error('[ffmpeg error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed.' });
    else res.end();
  });

  ffmpeg.on('close', (code) => {
    console.log(`[stream] ffmpeg exited code=${code}`);
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => {
    console.log('[stream] Client disconnected, killing ffmpeg');
    ffmpeg.kill('SIGKILL');
  });
});

export default router;