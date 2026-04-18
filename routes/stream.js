////// import { Router } from 'express';
////// import { spawn, execFileSync } from 'child_process';
////// import { join, dirname } from 'path';
////// import { fileURLToPath } from 'url';
////// import { existsSync } from 'fs';
////
////// const __dirname = dirname(fileURLToPath(import.meta.url));
////// const binPath  = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe'  : 'yt-dlp');
////// const ffmpegPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
////
////// const router = Router();
////
////// function safeFilename(title) {
//////   return (title || 'video')
//////     .replace(/[^\x20-\x7E]/g, '')
//////     .replace(/[/\\:*?"<>|,;=]/g, '')
//////     .replace(/\s+/g, ' ')
//////     .trim()
//////     .slice(0, 80) || 'video';
////// }
////
////// // Use yt-dlp to resolve the actual direct video+audio URLs (fast, no download)
////// function resolveUrls(url, formatSelector) {
//////   try {
//////     const out = execFileSync(binPath, [
//////       url,
//////       '-f', formatSelector,
//////       '--get-url',
//////       '--no-warnings',
//////       '--no-playlist',
//////       '--no-check-certificate',
//////       '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
//////     ], { timeout: 30000 }).toString().trim();
////
//////     const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
//////     return lines; // [videoUrl] or [videoUrl, audioUrl]
//////   } catch (e) {
//////     throw new Error('Could not resolve video URL: ' + (e?.message || e));
//////   }
////// }
////
////// router.get('/stream', (req, res) => {
//////   const { url, title, format } = req.query;
////
//////   if (!url) return res.status(400).json({ error: 'URL is required.' });
//////   if (!existsSync(binPath))   return res.status(500).json({ error: 'yt-dlp not found.' });
//////   if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });
////
//////   try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }
////
//////   const filename = safeFilename(title);
//////   const formatSelector = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
////
//////   console.log(`[stream] Resolving URLs for: "${filename}" format="${formatSelector}"`);
////
//////   let urls;
//////   try {
//////     urls = resolveUrls(url, formatSelector);
//////   } catch (e) {
//////     console.error('[resolve error]', e.message);
//////     return res.status(500).json({ error: e.message });
//////   }
////
//////   if (!urls.length) return res.status(500).json({ error: 'No downloadable URL found.' });
////
//////   console.log(`[stream] Got ${urls.length} URL(s), starting ffmpeg pipe...`);
////
//////   // Set headers immediately — browser starts download right away
//////   res.setHeader('Content-Disposition',
//////     `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`
//////   );
//////   res.setHeader('Content-Type', 'video/mp4');
//////   res.setHeader('Transfer-Encoding', 'chunked');
////
//////   let ffmpegArgs;
////
//////   if (urls.length === 1) {
//////     // Single stream (already has audio) — just remux to mp4
//////     ffmpegArgs = [
//////       '-i', urls[0],
//////       '-c', 'copy',
//////       '-movflags', 'frag_keyframe+empty_moov+faststart',
//////       '-f', 'mp4',
//////       'pipe:1',
//////     ];
//////   } else {
//////     // Separate video + audio — merge them
//////     ffmpegArgs = [
//////       '-i', urls[0],   // video
//////       '-i', urls[1],   // audio
//////       '-c:v', 'copy',
//////       '-c:a', 'copy',
//////       '-movflags', 'frag_keyframe+empty_moov+faststart',
//////       '-f', 'mp4',
//////       'pipe:1',
//////     ];
//////   }
////
//////   const ffmpeg = spawn(ffmpegPath, ffmpegArgs);
////
//////   // Pipe ffmpeg stdout directly to response — no temp file
//////   ffmpeg.stdout.pipe(res);
////
//////   ffmpeg.stderr.on('data', d => {
//////     const line = d.toString().trim();
//////     if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
//////       console.log('[ffmpeg]', line);
//////     }
//////   });
////
//////   ffmpeg.on('error', (err) => {
//////     console.error('[ffmpeg error]', err.message);
//////     if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed.' });
//////     else res.end();
//////   });
////
//////   ffmpeg.on('close', (code) => {
//////     console.log(`[stream] ffmpeg exited code=${code}`);
//////     res.end();
//////   });
////
//////   req.on('close', () => {
//////     console.log('[stream] Client disconnected, killing ffmpeg');
//////     ffmpeg.kill('SIGKILL');
//////   });
////// });
////
////// export default router;
////
////import { Router } from 'express';
////import { spawn, execFileSync } from 'child_process';
////import { join, dirname } from 'path';
////import { fileURLToPath } from 'url';
////import { existsSync } from 'fs';
////
////const __dirname = dirname(fileURLToPath(import.meta.url));
////const binPath    = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
////const ffmpegPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
////const cookiesPath = join(__dirname, '..', 'bin', 'cookies.txt');
////
////const router = Router();
////
////function safeFilename(title) {
////  return (title || 'video')
////    .replace(/[^\x20-\x7E]/g, '')
////    .replace(/[/\\:*?"<>|,;=]/g, '')
////    .replace(/\s+/g, ' ')
////    .trim()
////    .slice(0, 80) || 'video';
////}
////
////function cookiesArgs() {
////  return existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
////}
////
////function buildExtractorArgs(playerClient, poToken) {
////  let val = `youtube:player_client=${playerClient}`;
////  if (poToken) val += `,po_token=${poToken}`;
////  return ['--extractor-args', val];
////}
////
////const YT_CLIENTS = [
////  { name: 'android_vr',  client: 'android_vr',  ua: 'com.google.android.apps.youtube.vr.oculus/1.56.21 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip' },
////  { name: 'tv_embedded', client: 'tv_embedded',  ua: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/538.1 (KHTML, like Gecko) Version/6.0 TV Safari/538.1' },
////  { name: 'mweb',        client: 'mweb',         ua: 'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36' },
////  { name: 'ios',         client: 'ios',          ua: 'com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X;)' },
////  { name: 'android',     client: 'android',      ua: 'com.google.android.youtube/19.30.36 (Linux; U; Android 11) gzip' },
////  { name: 'web',         client: 'web',          ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
////];
////
////// Resolve YouTube URL → direct stream URLs via yt-dlp (used when Invidious was NOT the source)
////function resolveViaYtDlp(url, formatSelector) {
////  const cookies = cookiesArgs();
////  const poToken = process.env.YT_PO_TOKEN || null;
////
////  let isYouTube = false;
////  try {
////    const u = new URL(url);
////    isYouTube = u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be');
////  } catch { /**/ }
////
////  const clients = isYouTube ? YT_CLIENTS : [{
////    name: 'default', client: null,
////    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
////  }];
////
////  let lastError;
////
////  for (const attempt of clients) {
////    try {
////      const args = [
////        url,
////        '-f', formatSelector,
////        '--get-url',
////        '--no-warnings',
////        '--no-playlist',
////        '--no-check-certificate',
////        '--add-header', `user-agent:${attempt.ua}`,
////        ...cookies,
////      ];
////
////      if (isYouTube && attempt.client) {
////        args.push(...buildExtractorArgs(attempt.client, poToken));
////      }
////
////      console.log(`[stream] yt-dlp resolve: ${attempt.name}`);
////      const out = execFileSync(binPath, args, { timeout: 45000 }).toString().trim();
////      const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
////
////      if (lines.length > 0) {
////        console.log(`[stream] resolved ${lines.length} URL(s) via ${attempt.name}`);
////        return lines;
////      }
////    } catch (e) {
////      lastError = e;
////      const msg = (e?.message || '').toLowerCase();
////      console.error(`[stream] ${attempt.name} failed:`, (e?.message || '').slice(0, 150));
////      if (msg.includes('video unavailable') || msg.includes('private video')) break;
////    }
////  }
////
////  throw new Error('Could not resolve video URL: ' + (lastError?.message || 'all clients failed'));
////}
////
////// Shared ffmpeg pipe logic
////function streamViaFfmpeg(req, res, urls, title) {
////  const filename = safeFilename(title);
////
////  res.setHeader('Content-Disposition',
////    `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`
////  );
////  res.setHeader('Content-Type', 'video/mp4');
////  res.setHeader('Transfer-Encoding', 'chunked');
////  res.setHeader('X-Accel-Buffering', 'no');
////
////  const reconnectArgs = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5'];
////
////  let ffmpegArgs;
////
////if (urls.length === 1) {
////  ffmpegArgs = [
////    '-i', urls[0],
////    '-c', 'copy',
////    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
////    '-f', 'mp4',
////    'pipe:1',
////  ];
////} else {
////  ffmpegArgs = [
////    '-i', urls[0],
////    '-i', urls[1],
////    '-c:v', 'copy',
////    '-c:a', 'copy',
////    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
////    '-f', 'mp4',
////    'pipe:1',
////  ];
////}
////
////  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
////
////  ffmpeg.stdout.pipe(res);
////
////  ffmpeg.stderr.on('data', d => {
////    const line = d.toString().trim();
////    if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
////      console.log('[ffmpeg]', line);
////    }
////  });
////
////  ffmpeg.on('error', err => {
////    console.error('[ffmpeg error]', err.message);
////    if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed.' });
////    else res.end();
////  });
////
////  ffmpeg.on('close', code => {
////    console.log(`[stream] ffmpeg exited code=${code}`);
////    if (!res.writableEnded) res.end();
////  });
////
////  req.on('close', () => {
////    console.log('[stream] client disconnected, killing ffmpeg');
////    ffmpeg.kill('SIGKILL');
////  });
////}
////
////router.get('/stream', (req, res) => {
////  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });
////
////  const { url, title, format, videoUrl, audioUrl } = req.query;
////
////  // ── Direct mode (Invidious) ───────────────────────────────────────────────
////  // Invidious already resolved stream URLs — skip yt-dlp entirely
////  if (videoUrl) {
////    console.log(`[stream] direct mode | audio=${!!audioUrl}`);
////    const urls = audioUrl ? [videoUrl, audioUrl] : [videoUrl];
////    return streamViaFfmpeg(req, res, urls, title);
////  }
////
////  // ── yt-dlp resolve mode (YouTube direct URL) ─────────────────────────────
////  if (!url) return res.status(400).json({ error: 'URL or videoUrl is required.' });
////  if (!existsSync(binPath)) return res.status(500).json({ error: 'yt-dlp not found.' });
////
////  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }
////
////  const formatSelector = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
////  console.log(`[stream] yt-dlp mode | format="${formatSelector}"`);
////
////  let urls;
////  try {
////    urls = resolveViaYtDlp(url, formatSelector);
////  } catch (e) {
////    console.error('[stream] resolve error:', e.message);
////    return res.status(500).json({ error: e.message });
////  }
////
////  if (!urls.length) return res.status(500).json({ error: 'No downloadable URL found.' });
////
////  streamViaFfmpeg(req, res, urls, title);
////});
////
////export default router;
//
//
import { Router } from 'express';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ffmpegPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

const router = Router();

function safeFilename(title) {
  return (title || 'video')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[/\\:*?"<>|,;=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'video';
}

// Proxy CDN download — avoids CORS/expiry issues
router.get('/proxy', async (req, res) => {
  const { url, filename } = req.query;
  if (!url) return res.status(400).json({ error: 'url required' });

  try {
    console.log('[proxy] downloading:', decodeURIComponent(url).slice(0, 80));
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');

    response.body.pipe(res);
    response.body.on('error', () => res.end());
  } catch (e) {
    console.error('[proxy] error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// Poll RapidAPI render status via SSE
router.get('/render-status', async (req, res) => {
  const { statusUrl } = req.query;
  if (!statusUrl) return res.status(400).json({ error: 'statusUrl required' });

  try {
    console.log(`[render-status] polling: ${statusUrl}`);
    const response = await fetch(statusUrl, {
      headers: { 'Accept': 'text/event-stream' },
      signal: AbortSignal.timeout(120000),
    });

    let buffer = '';
    const reader = response.body;

    for await (const chunk of reader) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          console.log(`[render-status] status: ${data.status} progress: ${data.progress}`);
          if (data.status === 'done' && data.output?.url) {
            console.log('[render-status] ✓ render complete');
            return res.json({ url: data.output.url });
          }
          if (data.status === 'error' || data.status === 'failed') {
            return res.status(500).json({ error: 'Render failed' });
          }
        } catch {}
      }
    }
    res.status(500).json({ error: 'Render timeout or no output' });
  } catch (e) {
    console.error('[render-status] error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Stream video via ffmpeg
router.get('/stream', (req, res) => {
  const { title, videoUrl, audioUrl } = req.query;

  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });
  if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required.' });

  const filename = safeFilename(title);
  console.log(`[stream] direct mode | title="${filename}" | audio=${!!audioUrl}`);

  const urls = audioUrl ? [videoUrl, audioUrl] : [videoUrl];
  streamViaFfmpeg(req, res, urls, filename);
});

function streamViaFfmpeg(req, res, urls, filename) {
  const reconnect = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '10'];

  let ffmpegArgs;
  if (urls.length === 1) {
    ffmpegArgs = [
      ...reconnect, '-i', urls[0],
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4', 'pipe:1',
    ];
  } else {
    ffmpegArgs = [
      ...reconnect, '-i', urls[0],
      ...reconnect, '-i', urls[1],
      '-c:v', 'copy', '-c:a', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4', 'pipe:1',
    ];
  }

  res.setHeader('Content-Disposition', `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`);
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Keep-Alive', 'timeout=300');

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
      console.log('[ffmpeg]', line);
    }
  });

  ffmpeg.on('error', err => {
    console.error('[ffmpeg error]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed.' });
    else res.end();
  });

  ffmpeg.on('close', code => {
    console.log(`[stream] ffmpeg done code=${code}`);
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => {
    console.log('[stream] client disconnected');
    ffmpeg.kill('SIGKILL');
  });
}

export default router;
//
//import { Router } from 'express';
//import { spawn, execFileSync } from 'child_process';
//import { join, dirname } from 'path';
//import { fileURLToPath } from 'url';
//import { existsSync, createReadStream, unlinkSync, statSync } from 'fs';
//import { tmpdir } from 'os';
//import { randomBytes } from 'crypto';
//
//const __dirname = dirname(fileURLToPath(import.meta.url));
//const binPath    = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
//const ffmpegPath = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
//
//const router = Router();
//
//function safeFilename(title) {
//  return (title || 'video')
//    .replace(/[^\x20-\x7E]/g, '')
//    .replace(/[/\\:*?"<>|,;=]/g, '')
//    .replace(/\s+/g, ' ')
//    .trim()
//    .slice(0, 80) || 'video';
//}
//
//function resolveUrls(url, formatSelector) {
//  const cookiesPath = join(__dirname, '..', 'bin', 'cookies.txt');
//  const cookiesArgs = existsSync(cookiesPath) ? ['--cookies', cookiesPath] : [];
//
//  try {
//    const out = execFileSync(binPath, [
//      url,
//      '-f', formatSelector,
//      '--get-url',
//      '--no-warnings',
//      '--no-playlist',
//      '--no-check-certificate',
//      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
//      ...cookiesArgs,
//    ], { timeout: 30000 }).toString().trim();
//    return out.split('\n').map(l => l.trim()).filter(Boolean);
//  } catch (e) {
//    throw new Error('Could not resolve video URL: ' + (e?.message || e));
//  }
//}
//
//router.get('/stream', (req, res) => {
//  const { url, title, format, videoUrl, audioUrl } = req.query;
//
//  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });
//
//  const filename = safeFilename(title);
//
//  // Direct mode — Invidious/Cobalt already resolved URLs
//  if (videoUrl) {
//    console.log(`[stream] direct mode | audio=${!!audioUrl}`);
//    const urls = audioUrl ? [videoUrl, audioUrl] : [videoUrl];
//    return streamViaFfmpeg(req, res, urls, filename);
//  }
//
//  if (!url) return res.status(400).json({ error: 'URL is required.' });
//  if (!existsSync(binPath)) return res.status(500).json({ error: 'yt-dlp not found.' });
//
//  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }
//
//  const formatSelector = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';
//  console.log(`[stream] Resolving: "${filename}" format="${formatSelector}"`);
//
//  let urls;
//  try {
//    urls = resolveUrls(url, formatSelector);
//  } catch (e) {
//    console.error('[resolve error]', e.message);
//    return res.status(500).json({ error: e.message });
//  }
//
//  if (!urls.length) return res.status(500).json({ error: 'No URL found.' });
//  console.log(`[stream] Got ${urls.length} URL(s)`);
//
//  streamViaFfmpeg(req, res, urls, filename);
//});
//
//function streamViaFfmpeg(req, res, urls, filename) {
//  // Use fragmented MP4 streaming — no temp file, starts immediately
//  // This avoids Cloudflare's 30s timeout
//  const reconnect = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '10'];
//
//  let ffmpegArgs;
//  if (urls.length === 1) {
//    ffmpegArgs = [
//      ...reconnect, '-i', urls[0],
//      '-c', 'copy',
//      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
//      '-f', 'mp4',
//      'pipe:1',
//    ];
//  } else {
//    ffmpegArgs = [
//      ...reconnect, '-i', urls[0],
//      ...reconnect, '-i', urls[1],
//      '-c:v', 'copy',
//      '-c:a', 'copy',
//      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
//      '-f', 'mp4',
//      'pipe:1',
//    ];
//  }
//
//  res.setHeader('Content-Disposition',
//    `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`
//  );
////  res.setHeader('Content-Type', 'video/mp4');
////  res.setHeader('Transfer-Encoding', 'chunked');
////  res.setHeader('X-Accel-Buffering', 'no');
////  res.setHeader('Cache-Control', 'no-cache');
//res.setHeader('Content-Type', 'video/mp4');
//res.setHeader('Transfer-Encoding', 'chunked');
//res.setHeader('X-Accel-Buffering', 'no');
//res.setHeader('Cache-Control', 'no-cache');
//res.setHeader('Connection', 'keep-alive');
//res.setHeader('Keep-Alive', 'timeout=300');
//
//  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
//
//  ffmpeg.stdout.pipe(res);
//
//  ffmpeg.stderr.on('data', d => {
//    const line = d.toString().trim();
//    if (line.includes('time=') || line.includes('Error') || line.includes('error')) {
//      console.log('[ffmpeg]', line);
//    }
//  });
//
//  ffmpeg.on('error', err => {
//    console.error('[ffmpeg error]', err.message);
//    if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed.' });
//    else res.end();
//  });
//
//  ffmpeg.on('close', code => {
//    console.log(`[stream] ffmpeg done code=${code}`);
//    if (!res.writableEnded) res.end();
//  });
//
//  req.on('close', () => {
//    console.log('[stream] client disconnected');
//    ffmpeg.kill('SIGKILL');
//  });
//}
//
//export default router;