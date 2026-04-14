import YTDlpWrapModule from 'yt-dlp-wrap';

import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, 'bin');
const binPath = join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;
if (!existsSync(binDir)) {
  mkdirSync(binDir, { recursive: true });
}

if (existsSync(binPath)) {
  console.log('✅ yt-dlp already present at', binPath);
  process.exit(0);
}

console.log('⬇️  Downloading yt-dlp binary to', binPath);

try {
  await YTDlpWrap.downloadFromGithub(binPath);
  console.log('✅ yt-dlp downloaded successfully.');
} catch (e) {
  console.error('❌ Auto-download failed:', e.message);
  console.error('');
  console.error('👉 Manual fix:');
  console.error('   1. Create folder: vidsave-server/bin/');
  console.error('   2. Download from: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
  console.error('   3. Place at: vidsave-server/bin/yt-dlp.exe');
  // Don't exit(1) — let npm install succeed anyway
}