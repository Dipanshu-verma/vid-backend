// Invidious is an open-source YouTube frontend with public instances.
// Their servers handle YouTube auth — we just call their API.
// We maintain a list of instances and rotate through them on failure.

const INSTANCES = [
  'https://invidious.privacydev.net',
  'https://inv.nadeko.net',
  'https://invidious.nikkosphere.com',
  'https://yt.cdaut.de',
  'https://invidious.fdn.fr',
  'https://iv.melmac.space',
  'https://invidious.perennialte.ch',
];

function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1).split('?')[0];
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v');
  } catch { /**/ }
  return null;
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

function getQualityLabel(height) {
  if (height >= 2160) return `${height}p 4K`;
  if (height >= 1440) return `${height}p 2K`;
  if (height >= 1080) return `${height}p Full HD`;
  if (height >= 720)  return `${height}p HD`;
  return `${height}p`;
}

async function fetchFromInstance(instance, videoId) {
  const res = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,videoThumbnails,adaptiveFormats,formatStreams`, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': 'Mozilla/5.0' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${instance}`);
  return res.json();
}

function buildQualities(data, instance, videoId, API) {
  const streamBase = `${API}/api/stream`;
  const qualities = [];

  // adaptiveFormats = separate video + audio streams (higher quality, up to 4K)
  const videoFormats = (data.adaptiveFormats || []).filter(f =>
    f.type?.startsWith('video') && f.url && f.height
  );
  const audioFormats = (data.adaptiveFormats || []).filter(f =>
    f.type?.startsWith('audio') && f.url
  );

  // Pick best audio (highest bitrate m4a/mp4 preferred)
  const bestAudio = audioFormats
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  // Deduplicate video formats by height — keep highest bitrate per height
  const heightMap = new Map();
  for (const f of videoFormats) {
    const existing = heightMap.get(f.height);
    if (!existing || (f.bitrate || 0) > (existing.bitrate || 0)) {
      heightMap.set(f.height, f);
    }
  }

  const heights = [...heightMap.keys()].sort((a, b) => b - a);

  for (const height of heights) {
    const vfmt = heightMap.get(height);
    const totalBytes = (vfmt.contentLength || 0) + (bestAudio?.contentLength || 0);

    // Pass video + audio URLs directly to /api/stream — no yt-dlp needed
    const params = new URLSearchParams({
      videoUrl: vfmt.url,
      audioUrl: bestAudio?.url || '',
      title: data.title || 'video',
    });

    qualities.push({
      label: getQualityLabel(height),
      url: `${streamBase}?${params.toString()}`,
      ext: 'mp4',
      resolution: vfmt.width ? `${vfmt.width}×${height}` : `${height}p`,
      size: formatSize(totalBytes),
    });
  }

  // formatStreams = combined video+audio (up to 720p, simpler)
  // Use as fallback if no adaptive formats found
  if (qualities.length === 0) {
    const combined = (data.formatStreams || [])
      .filter(f => f.url && f.resolution)
      .sort((a, b) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0));

    for (const fmt of combined) {
      const height = parseInt(fmt.resolution) || 0;
      const params = new URLSearchParams({
        videoUrl: fmt.url,
        audioUrl: '',
        title: data.title || 'video',
      });

      qualities.push({
        label: getQualityLabel(height) || fmt.resolution,
        url: `${streamBase}?${params.toString()}`,
        ext: 'mp4',
        resolution: fmt.resolution,
        size: formatSize(fmt.contentLength || 0),
      });
    }
  }

  return qualities;
}

export async function getVideoInfoFromInvidious(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Could not extract video ID from URL');

  const API = process.env.API_BASE_URL || 'http://localhost:3001';
  let lastError;

  for (const instance of INSTANCES) {
    try {
      console.log(`[invidious] trying: ${instance}`);
      const data = await fetchFromInstance(instance, videoId);

      const thumbnail = (data.videoThumbnails || [])
        .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;

      const qualities = buildQualities(data, instance, videoId, API);

      if (qualities.length === 0) {
        console.warn(`[invidious] ${instance} returned no usable formats`);
        continue;
      }

      console.log(`[invidious] success: ${instance} | qualities: ${qualities.length}`);

      return {
        platform: 'youtube',
        title: data.title || 'Untitled Video',
        thumbnail: thumbnail?.startsWith('http') ? thumbnail : `${instance}${thumbnail}`,
        author: data.author || undefined,
        duration: formatDuration(data.lengthSeconds),
        qualities,
        _source: 'invidious',
      };

    } catch (err) {
      lastError = err;
      console.error(`[invidious] ${instance} failed:`, err.message?.slice(0, 100));
    }
  }

  throw new Error(`All Invidious instances failed: ${lastError?.message || 'unknown'}`);
}