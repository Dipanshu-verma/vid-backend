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
import { Router } from 'express';
import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { Readable } from 'stream'; // ← Fixed: needed for Readable.fromWeb()

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
    const decodedUrl = decodeURIComponent(url);
    console.log('[proxy] fetching:', decodedUrl.slice(0, 80));

    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'video/mp4,video/*,*/*',
        'Accept-Encoding': 'identity',
      },
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) throw new Error(`CDN returned HTTP ${response.status}`);

    const contentLength = response.headers.get('content-length');
    const contentType = response.headers.get('content-type') || 'video/mp4';

    console.log(`[proxy] size: ${contentLength} type: ${contentType}`);

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Fixed: response.body is a Web ReadableStream (Node 18+ fetch API)
    // Must use Readable.fromWeb() to convert to Node.js stream before piping
    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);
    nodeStream.on('error', (e) => {
      console.error('[proxy] stream error:', e.message);
      if (!res.writableEnded) res.end();
    });

  } catch (e) {
    console.error('[proxy] error:', e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

// On-demand render for a specific video quality
router.post('/render', async (req, res) => {
  const { hashId, quality } = req.body;
  if (!hashId) return res.status(400).json({ error: 'hashId required' });

  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'social-media-video-downloader.p.rapidapi.com';

  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY not set' });

  try {
    console.log(`[render] getting execution URL for hashId: ${hashId} quality: ${quality}`);

    const renderRes = await fetch(
      `https://${RAPIDAPI_HOST}/youtube/utils/renderable?hashId=${encodeURIComponent(hashId)}&quality=${encodeURIComponent(quality || '720p')}`,
      {
        headers: {
          'x-rapidapi-key': RAPIDAPI_KEY,
          'x-rapidapi-host': RAPIDAPI_HOST,
        },
        signal: AbortSignal.timeout(15000),
      }
    );

    const renderData = await renderRes.json();
    console.log('[render] renderable status:', renderRes.status);

    const executionUrl = renderData.renderConfig?.executionUrl;
    if (!executionUrl) {
      console.error('[render] no executionUrl:', JSON.stringify(renderData).slice(0, 200));
      return res.status(500).json({ error: 'No execution URL from API' });
    }

    const execRes = await fetch(executionUrl, { signal: AbortSignal.timeout(15000) });
    const execData = await execRes.json();
    console.log('[render] job queued:', execData.renderId);

    res.json({
      renderId: execData.renderId,
      sseStatusUrl: execData.sseStatusUrl,
    });
  } catch (e) {
    console.error('[render] error:', e.message);
    res.status(500).json({ error: e.message });
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

    // Fixed: use Readable.fromWeb() for Node 18+ fetch response body
    const nodeStream = Readable.fromWeb(response.body);

    for await (const chunk of nodeStream) {
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

// Extract MP3 audio from any video URL via ffmpeg
router.get('/audio', (req, res) => {
  const { videoUrl, title } = req.query;

  if (!videoUrl) return res.status(400).json({ error: 'videoUrl required' });
  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found' });

  const filename = safeFilename(title || 'audio');
  console.log(`[audio] extracting audio: "${filename}"`);

  res.setHeader('Content-Disposition',
    `attachment; filename="${filename}.mp3"; filename*=UTF-8''${encodeURIComponent(filename + '.mp3')}`);
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('X-Accel-Buffering', 'no');

  const reconnect = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '10'];

  const ffmpegArgs = [
    ...reconnect,
    '-i', decodeURIComponent(videoUrl),
    '-vn',           // Remove video
    '-acodec', 'copy', // Copy audio as-is — no re-encoding needed
    '-f', 'mp3',
    'pipe:1',
  ];

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  ffmpeg.stdout.pipe(res);

  ffmpeg.stderr.on('data', d => {
    const line = d.toString().trim();
    if (line.includes('time=') || line.includes('Error')) {
      console.log('[audio ffmpeg]', line);
    }
  });

  ffmpeg.on('error', err => {
    console.error('[audio] error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'ffmpeg failed' });
    else res.end();
  });

  ffmpeg.on('close', code => {
    console.log(`[audio] done code=${code}`);
    if (!res.writableEnded) res.end();
  });

  req.on('close', () => ffmpeg.kill('SIGKILL'));
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

//import { Router } from 'express';
//import { spawn } from 'child_process';
//import { join, dirname } from 'path';
//import { fileURLToPath } from 'url';
//import { existsSync } from 'fs';
//
//const __dirname = dirname(fileURLToPath(import.meta.url));
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
//// Proxy CDN download — avoids CORS/expiry issues
//router.get('/proxy', async (req, res) => {
//  const { url, filename } = req.query;
//  if (!url) return res.status(400).json({ error: 'url required' });
//
//  try {
//    const decodedUrl = decodeURIComponent(url);
//    console.log('[proxy] fetching:', decodedUrl.slice(0, 80));
//
//    const response = await fetch(decodedUrl, {
//      headers: {
//        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
//        'Accept': 'video/mp4,video/*,*/*',
//        'Accept-Encoding': 'identity',
//      },
//      signal: AbortSignal.timeout(120000),
//    });
//
//    if (!response.ok) throw new Error(`CDN returned HTTP ${response.status}`);
//
//    const contentLength = response.headers.get('content-length');
//    const contentType = response.headers.get('content-type') || 'video/mp4';
//
//    console.log(`[proxy] size: ${contentLength} type: ${contentType}`);
//
//    res.setHeader('Content-Type', 'video/mp4');
//    res.setHeader('Content-Disposition', `attachment; filename="${filename || 'video.mp4'}"`);
//    if (contentLength) res.setHeader('Content-Length', contentLength);
//    res.setHeader('Accept-Ranges', 'bytes');
//    res.setHeader('Cache-Control', 'no-cache');
//    res.setHeader('Access-Control-Allow-Origin', '*');
//
//    response.body.pipe(res);
//    response.body.on('error', (e) => {
//      console.error('[proxy] stream error:', e.message);
//      res.end();
//    });
//  } catch (e) {
//    console.error('[proxy] error:', e.message);
//    if (!res.headersSent) res.status(500).json({ error: e.message });
//  }
//});
//
//// On-demand render for a specific video quality
//router.post('/render', async (req, res) => {
//  const { hashId, quality } = req.body;
//  if (!hashId) return res.status(400).json({ error: 'hashId required' });
//
//  const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
//  const RAPIDAPI_HOST = process.env.RAPIDAPI_HOST || 'social-media-video-downloader.p.rapidapi.com';
//
//  if (!RAPIDAPI_KEY) return res.status(500).json({ error: 'RAPIDAPI_KEY not set' });
//
//  try {
//    console.log(`[render] getting execution URL for hashId: ${hashId} quality: ${quality}`);
//
//    // Get renderable config for this specific video+quality
//    const renderRes = await fetch(
//      `https://${RAPIDAPI_HOST}/youtube/utils/renderable?hashId=${encodeURIComponent(hashId)}&quality=${encodeURIComponent(quality || '720p')}`,
//      {
//        headers: {
//          'x-rapidapi-key': RAPIDAPI_KEY,
//          'x-rapidapi-host': RAPIDAPI_HOST,
//        },
//        signal: AbortSignal.timeout(15000),
//      }
//    );
//
//    const renderData = await renderRes.json();
//    console.log('[render] renderable status:', renderRes.status);
//
//    const executionUrl = renderData.renderConfig?.executionUrl;
//    if (!executionUrl) {
//      console.error('[render] no executionUrl:', JSON.stringify(renderData).slice(0, 200));
//      return res.status(500).json({ error: 'No execution URL from API' });
//    }
//
//    // Trigger the render job
//    const execRes = await fetch(executionUrl, { signal: AbortSignal.timeout(15000) });
//    const execData = await execRes.json();
//    console.log('[render] job queued:', execData.renderId);
//
//    res.json({
//      renderId: execData.renderId,
//      sseStatusUrl: execData.sseStatusUrl,
//    });
//  } catch (e) {
//    console.error('[render] error:', e.message);
//    res.status(500).json({ error: e.message });
//  }
//});
//
//// Poll RapidAPI render status via SSE
//router.get('/render-status', async (req, res) => {
//  const { statusUrl } = req.query;
//  if (!statusUrl) return res.status(400).json({ error: 'statusUrl required' });
//
//  try {
//    console.log(`[render-status] polling: ${statusUrl}`);
//    const response = await fetch(statusUrl, {
//      headers: { 'Accept': 'text/event-stream' },
//      signal: AbortSignal.timeout(120000),
//    });
//
//    let buffer = '';
//    const reader = response.body;
//
//    for await (const chunk of reader) {
//      buffer += chunk.toString();
//      const lines = buffer.split('\n');
//      buffer = lines.pop();
//
//      for (const line of lines) {
//        if (!line.startsWith('data:')) continue;
//        try {
//          const data = JSON.parse(line.slice(5).trim());
//          console.log(`[render-status] status: ${data.status} progress: ${data.progress}`);
//          if (data.status === 'done' && data.output?.url) {
//            console.log('[render-status] ✓ render complete');
//            return res.json({ url: data.output.url });
//          }
//          if (data.status === 'error' || data.status === 'failed') {
//            return res.status(500).json({ error: 'Render failed' });
//          }
//        } catch {}
//      }
//    }
//    res.status(500).json({ error: 'Render timeout or no output' });
//  } catch (e) {
//    console.error('[render-status] error:', e.message);
//    res.status(500).json({ error: e.message });
//  }
//});
//
//// Stream video via ffmpeg
//router.get('/stream', (req, res) => {
//  const { title, videoUrl, audioUrl } = req.query;
//
//  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });
//  if (!videoUrl) return res.status(400).json({ error: 'videoUrl is required.' });
//
//  const filename = safeFilename(title);
//  console.log(`[stream] direct mode | title="${filename}" | audio=${!!audioUrl}`);
//
//  const urls = audioUrl ? [videoUrl, audioUrl] : [videoUrl];
//  streamViaFfmpeg(req, res, urls, filename);
//});
//
//function streamViaFfmpeg(req, res, urls, filename) {
//  const reconnect = ['-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '10'];
//
//  let ffmpegArgs;
//  if (urls.length === 1) {
//    ffmpegArgs = [
//      ...reconnect, '-i', urls[0],
//      '-c', 'copy',
//      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
//      '-f', 'mp4', 'pipe:1',
//    ];
//  } else {
//    ffmpegArgs = [
//      ...reconnect, '-i', urls[0],
//      ...reconnect, '-i', urls[1],
//      '-c:v', 'copy', '-c:a', 'copy',
//      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
//      '-f', 'mp4', 'pipe:1',
//    ];
//  }
//
//  res.setHeader('Content-Disposition', `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`);
//  res.setHeader('Content-Type', 'video/mp4');
//  res.setHeader('Transfer-Encoding', 'chunked');
//  res.setHeader('X-Accel-Buffering', 'no');
//  res.setHeader('Cache-Control', 'no-cache');
//  res.setHeader('Connection', 'keep-alive');
//  res.setHeader('Keep-Alive', 'timeout=300');
//
//  const ffmpeg = spawn(ffmpegPath, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
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
