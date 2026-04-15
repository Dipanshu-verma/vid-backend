// Two separate YouTube frontends as fallback layers:
// 1. Invidious — races all instances in parallel, takes first winner
// 2. Piped    — different infrastructure, separate fallback if Invidious fails

const INVIDIOUS_INSTANCES = [
  'https://invidious.privacydev.net',
  'https://inv.nadeko.net',
  'https://invidious.nikkosphere.com',
  'https://yt.cdaut.de',
  'https://invidious.fdn.fr',
  'https://iv.melmac.space',
  'https://invidious.perennialte.ch',
  'https://invidious.io.lol',
  'https://yewtu.be',
  'https://invidious.flokinet.to',
  'https://invidious.tiekoetter.com',
  'https://inv.tux.pizza',
];

// Piped is a separate YouTube frontend with different instances/infra
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.in.projectsegfau.lt',
  'https://piped-api.privacy.com.de',
  'https://api.piped.yt',
  'https://pipedapi.adminforge.de',
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

// ── Invidious ─────────────────────────────────────────────────────────────────

async function fetchInvidious(instance, videoId) {
  const url = `${instance}/api/v1/videos/${videoId}?fields=title,author,lengthSeconds,videoThumbnails,adaptiveFormats,formatStreams`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vidsave/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  // Validate we actually got formats
  if (!data?.adaptiveFormats?.length && !data?.formatStreams?.length) {
    throw new Error('No formats in response');
  }
  return { instance, data };
}

function buildInvidiousQualities(data, instance, API) {
  const streamBase = `${API}/api/stream`;
  const qualities = [];

  const videoFormats = (data.adaptiveFormats || []).filter(f => f.type?.startsWith('video') && f.url && f.height);
  const audioFormats = (data.adaptiveFormats || []).filter(f => f.type?.startsWith('audio') && f.url);

  const bestAudio = audioFormats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

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
    const totalBytes = (parseInt(vfmt.contentLength) || 0) + (parseInt(bestAudio?.contentLength) || 0);
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

  // Combined stream fallback (up to 720p)
  if (qualities.length === 0) {
    for (const fmt of (data.formatStreams || []).filter(f => f.url && f.resolution)) {
      const height = parseInt(fmt.resolution) || 0;
      const params = new URLSearchParams({ videoUrl: fmt.url, audioUrl: '', title: data.title || 'video' });
      qualities.push({
        label: getQualityLabel(height) || fmt.resolution,
        url: `${streamBase}?${params.toString()}`,
        ext: 'mp4',
        resolution: fmt.resolution,
      });
    }
  }

  return qualities;
}

// Race all Invidious instances — whichever responds first and has formats wins
async function getFromInvidious(videoId, API) {
  console.log(`[invidious] racing ${INVIDIOUS_INSTANCES.length} instances...`);

  const result = await Promise.any(
    INVIDIOUS_INSTANCES.map(instance =>
      fetchInvidious(instance, videoId)
        .then(r => {
          console.log(`[invidious] winner: ${instance}`);
          return r;
        })
        .catch(e => {
          console.log(`[invidious] ${instance}: ${e.message?.slice(0, 60)}`);
          throw e;
        })
    )
  );

  return result;
}

// ── Piped ─────────────────────────────────────────────────────────────────────

async function fetchPiped(instance, videoId) {
  const res = await fetch(`${instance}/streams/${videoId}`, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; vidsave/1.0)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.videoStreams?.length && !data?.audioStreams?.length) {
    throw new Error('No streams in response');
  }
  return { instance, data };
}

function buildPipedQualities(data, API) {
  const streamBase = `${API}/api/stream`;
  const qualities = [];

  const videoStreams = (data.videoStreams || []).filter(s => s.url && s.height && !s.videoOnly === false || s.url && s.height);
  const audioStreams = (data.audioStreams || []).filter(s => s.url);
  const bestAudio = audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];

  // Piped marks video-only streams with videoOnly=true
  const videoOnly = videoStreams.filter(s => s.videoOnly);
  const combined  = videoStreams.filter(s => !s.videoOnly);

  const heightMap = new Map();
  for (const f of [...videoOnly, ...combined]) {
    const existing = heightMap.get(f.height);
    if (!existing || (f.bitrate || 0) > (existing.bitrate || 0)) {
      heightMap.set(f.height, f);
    }
  }

  const heights = [...heightMap.keys()].sort((a, b) => b - a);

  for (const height of heights) {
    const vfmt = heightMap.get(height);
    const audioUrl = vfmt.videoOnly ? (bestAudio?.url || '') : '';
    const params = new URLSearchParams({
      videoUrl: vfmt.url,
      audioUrl,
      title: data.title || 'video',
    });
    qualities.push({
      label: getQualityLabel(height),
      url: `${streamBase}?${params.toString()}`,
      ext: 'mp4',
      resolution: `${height}p`,
    });
  }

  return qualities;
}

async function getFromPiped(videoId, API) {
  console.log(`[piped] racing ${PIPED_INSTANCES.length} instances...`);

  const result = await Promise.any(
    PIPED_INSTANCES.map(instance =>
      fetchPiped(instance, videoId)
        .then(r => {
          console.log(`[piped] winner: ${instance}`);
          return r;
        })
        .catch(e => {
          console.log(`[piped] ${instance}: ${e.message?.slice(0, 60)}`);
          throw e;
        })
    )
  );

  return result;
}

// ── Public export ─────────────────────────────────────────────────────────────

export async function getVideoInfoFromInvidious(url) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Could not extract video ID from URL');

  const API = process.env.API_BASE_URL || 'http://localhost:3001';

  // Try Invidious first (races all instances in parallel)
  try {
    const { instance, data } = await getFromInvidious(videoId, API);
    const thumbnail = (data.videoThumbnails || [])
      .sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url;
    const qualities = buildInvidiousQualities(data, instance, API);

    if (qualities.length === 0) throw new Error('Invidious returned no usable formats');

    return {
      platform: 'youtube',
      title: data.title || 'Untitled Video',
      thumbnail: thumbnail?.startsWith('http') ? thumbnail : thumbnail ? `${instance}${thumbnail}` : undefined,
      author: data.author || undefined,
      duration: formatDuration(data.lengthSeconds),
      qualities,
      _source: 'invidious',
    };
  } catch (invErr) {
    console.warn('[invidious] all instances failed:', invErr?.errors?.map(e => e.message)?.join(', ') || invErr.message);
  }

  // Piped as second layer
  console.log('[piped] trying as fallback...');
  try {
    const { data } = await getFromPiped(videoId, API);
    const qualities = buildPipedQualities(data, API);

    if (qualities.length === 0) throw new Error('Piped returned no usable streams');

    const thumbnail = data.thumbnailUrl;

    return {
      platform: 'youtube',
      title: data.title || 'Untitled Video',
      thumbnail,
      author: data.uploader || undefined,
      duration: formatDuration(data.duration),
      qualities,
      _source: 'piped',
    };
  } catch (pipedErr) {
    console.error('[piped] all instances failed:', pipedErr?.errors?.map(e => e.message)?.join(', ') || pipedErr.message);
    throw new Error('All fallback sources (Invidious + Piped) failed');
  }
}
