# VidSave Backend

Express.js API server for VidSave — downloads video info from YouTube, Instagram, Facebook, TikTok, Twitter/X.

## Setup

```bash
npm install
npm run dev     # development (auto-restart on file change)
npm start       # production
```

## Environment Variables

Copy `.env` and update as needed:

```env
PORT=3001
CLIENT_URL=http://localhost:5173   # your frontend origin
```

For production, set `CLIENT_URL` to your deployed frontend URL.

## API

### `POST /api/download`
```json
// Request
{ "url": "https://youtube.com/watch?v=..." }

// Response
{
  "platform": "youtube",
  "title": "Video Title",
  "thumbnail": "https://...",
  "author": "Channel Name",
  "duration": "3:45",
  "qualities": [
    { "label": "1080p Full HD", "url": "https://...", "resolution": "1920×1080", "size": "45.2 MB", "ext": "mp4" },
    { "label": "720p HD", "url": "https://...", "resolution": "1280×720", "size": "22.1 MB", "ext": "mp4" }
  ]
}
```

### `GET /health`
Returns `{ "status": "ok" }` — use for uptime monitoring.

## Notes

- `yt-dlp` binary is downloaded automatically by `yt-dlp-exec` on `npm install`
- Keep it updated: `npx yt-dlp-exec --update`
- Rate limited to 20 requests/minute per IP
- YouTube signed URLs expire after ~6 hours (standard behaviour)
