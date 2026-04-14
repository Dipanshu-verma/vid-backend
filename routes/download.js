import { Router } from 'express';
import { getVideoInfo } from '../utils/downloader.js';

const router = Router();

router.post('/download', async (req, res) => {
  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid URL is required.' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  try {
    const info = await getVideoInfo(url.trim());
    return res.json(info);
  } catch (err) {
    console.error('=== yt-dlp error ===');
    console.error(err?.message || err);
    console.error('====================');

    const msg = err?.message || '';

    if (msg.includes('not available') || msg.includes('private')) {
      return res.status(422).json({ error: 'This video is private or unavailable.' });
    }
    if (msg.includes('age')) {
      return res.status(422).json({ error: 'Age-restricted content cannot be downloaded.' });
    }
    if (msg.includes('Unsupported URL')) {
      return res.status(422).json({ error: 'This URL is not supported. Try YouTube, Instagram, Facebook, TikTok or Twitter.' });
    }
    if (msg.includes('binary not found') || msg.includes('ENOENT')) {
      return res.status(500).json({ error: 'yt-dlp binary not found. Run npm install again.' });
    }

    return res.status(500).json({
      error: 'Could not fetch video info. The video may be restricted or unavailable.',
      detail: msg.slice(0, 300),
    });
  }
});

export default router;