import { Router } from 'express';
import { spawn, execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath  = join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe'  : 'yt-dlp');
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

// Use yt-dlp to resolve the actual direct video+audio URLs (fast, no download)
function resolveUrls(url, formatSelector) {
  try {
    const out = execFileSync(binPath, [
      url,
      '-f', formatSelector,
      '--get-url',
      '--no-warnings',
      '--no-playlist',
      '--no-check-certificate',
      '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0',
    ], { timeout: 30000 }).toString().trim();

    const lines = out.split('\n').map(l => l.trim()).filter(Boolean);
    return lines; // [videoUrl] or [videoUrl, audioUrl]
  } catch (e) {
    throw new Error('Could not resolve video URL: ' + (e?.message || e));
  }
}

router.get('/stream', (req, res) => {
  const { url, title, format } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required.' });
  if (!existsSync(binPath))   return res.status(500).json({ error: 'yt-dlp not found.' });
  if (!existsSync(ffmpegPath)) return res.status(500).json({ error: 'ffmpeg not found.' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }

  const filename = safeFilename(title);
  const formatSelector = format || 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best';

  console.log(`[stream] Resolving URLs for: "${filename}" format="${formatSelector}"`);

  let urls;
  try {
    urls = resolveUrls(url, formatSelector);
  } catch (e) {
    console.error('[resolve error]', e.message);
    return res.status(500).json({ error: e.message });
  }

  if (!urls.length) return res.status(500).json({ error: 'No downloadable URL found.' });

  console.log(`[stream] Got ${urls.length} URL(s), starting ffmpeg pipe...`);

  // Set headers immediately — browser starts download right away
  res.setHeader('Content-Disposition',
    `attachment; filename="${filename}.mp4"; filename*=UTF-8''${encodeURIComponent(filename + '.mp4')}`
  );
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Transfer-Encoding', 'chunked');

  let ffmpegArgs;

  if (urls.length === 1) {
    // Single stream (already has audio) — just remux to mp4
    ffmpegArgs = [
      '-i', urls[0],
      '-c', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4',
      'pipe:1',
    ];
  } else {
    // Separate video + audio — merge them
    ffmpegArgs = [
      '-i', urls[0],   // video
      '-i', urls[1],   // audio
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-movflags', 'frag_keyframe+empty_moov+faststart',
      '-f', 'mp4',
      'pipe:1',
    ];
  }

  const ffmpeg = spawn(ffmpegPath, ffmpegArgs);

  // Pipe ffmpeg stdout directly to response — no temp file
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
    res.end();
  });

  req.on('close', () => {
    console.log('[stream] Client disconnected, killing ffmpeg');
    ffmpeg.kill('SIGKILL');
  });
});

export default router;