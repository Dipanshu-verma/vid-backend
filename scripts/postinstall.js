import YTDlpWrapModule from 'yt-dlp-wrap';
const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, '..', 'bin');
const binPath = join(binDir, 'yt-dlp');

if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

if (existsSync(binPath)) {
  console.log('yt-dlp already exists, skipping.');
  process.exit(0);
}

console.log('Downloading yt-dlp binary...');
YTDlpWrap.downloadFromGithub(binPath)
  .then(() => console.log('yt-dlp ready at', binPath))
  .catch(err => { console.error('Failed to download yt-dlp:', err); process.exit(1); });