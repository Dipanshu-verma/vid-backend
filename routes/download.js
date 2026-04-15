import { Router } from 'express';
import { getVideoInfo } from '../utils/downloader.js';

const router = Router();

function cleanUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/watch?v=${v}`;
    }
    if (u.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/watch?v=${u.pathname.slice(1)}`;
    }
    return rawUrl;
  } catch { return rawUrl; }
}

router.post('/download', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required.' });
  }

  try { new URL(url); } catch {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  const cleanedUrl = cleanUrl(url.trim());
  console.log(`[download] ${url.trim()} → ${cleanedUrl}`);

  try {
    const info = await getVideoInfo(cleanedUrl);
    return res.json(info);
  } catch (err) {
    const msg = err?.message || '';
    console.error('=== yt-dlp error ===');
    console.error(msg.slice(0, 500));
    console.error('====================');

    if (msg.includes('Unsupported URL')) {
      return res.status(422).json({ error: 'This URL is not supported.' });
    }
    if (msg.includes('binary not found') || msg.includes('ENOENT')) {
      return res.status(500).json({ error: 'yt-dlp binary not found. Run npm install.' });
    }
if (msg.includes('Please sign in') || msg.includes('Sign in')) {
  return res.status(422).json({ 
    error: 'This video requires a YouTube account to watch. Only publicly available videos can be downloaded.' 
  });
}
    // Never match on 'age', 'private', 'not available' — let retry logic handle those
    return res.status(500).json({
      error: 'Could not fetch video info. Try a different video or the link may be broken.',
      detail: msg.slice(0, 300),
    });
  }
});

export default router;