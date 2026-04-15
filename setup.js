// import YTDlpWrapModule from 'yt-dlp-wrap';

// import { existsSync, mkdirSync } from 'fs';
// import { join, dirname } from 'path';
// import { fileURLToPath } from 'url';

// const __dirname = dirname(fileURLToPath(import.meta.url));
// const binDir = join(__dirname, 'bin');
// const binPath = join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
// const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;
// if (!existsSync(binDir)) {
//   mkdirSync(binDir, { recursive: true });
// }

// if (existsSync(binPath)) {
//   console.log('✅ yt-dlp already present at', binPath);
//   process.exit(0);
// }

// console.log('⬇️  Downloading yt-dlp binary to', binPath);

// try {
//   await YTDlpWrap.downloadFromGithub(binPath);
//   console.log('✅ yt-dlp downloaded successfully.');
// } catch (e) {
//   console.error('❌ Auto-download failed:', e.message);
//   console.error('');
//   console.error('👉 Manual fix:');
//   console.error('   1. Create folder: vidsave-server/bin/');
//   console.error('   2. Download from: https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe');
//   console.error('   3. Place at: vidsave-server/bin/yt-dlp.exe');
//   // Don't exit(1) — let npm install succeed anyway
// }
import YTDlpWrapModule from 'yt-dlp-wrap';
const YTDlpWrap = YTDlpWrapModule.default ?? YTDlpWrapModule;

import { existsSync, mkdirSync, chmodSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';
const binDir = join(__dirname, 'bin');

if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

// ── yt-dlp ────────────────────────────────────────────────────────────
const ytDlpPath = join(binDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');

if (existsSync(ytDlpPath)) {
  console.log('✅ yt-dlp already present');
} else {
  console.log('⬇️  Downloading yt-dlp...');
  try {
    await YTDlpWrap.downloadFromGithub(ytDlpPath);
    if (!isWin) chmodSync(ytDlpPath, '755');
    console.log('✅ yt-dlp downloaded');

  } catch (e) {
    console.error('❌ yt-dlp download failed:', e.message);
  }
}

// Always update yt-dlp to latest on deploy — fixes YouTube blocks
if (!isWin && existsSync(ytDlpPath)) {
  try {
    execSync(`${ytDlpPath} -U`, { stdio: 'pipe', timeout: 30000 });
    console.log('✅ yt-dlp updated to latest');
  } catch {
    console.log('ℹ️  yt-dlp update skipped');
  }
}

// ── ffmpeg ────────────────────────────────────────────────────────────
const ffmpegPath = join(binDir, isWin ? 'ffmpeg.exe' : 'ffmpeg');

if (existsSync(ffmpegPath)) {
  console.log('✅ ffmpeg already present');
} else if (isWin) {
  console.log('⚠️  Windows: place ffmpeg.exe manually in ./bin/');
} else {
  // 1. Try system ffmpeg (available if Render build command ran apt-get)
  try {
    const sys = execSync('which ffmpeg 2>/dev/null').toString().trim();
    if (sys) {
      execSync(`cp ${sys} ${ffmpegPath}`);
      chmodSync(ffmpegPath, '755');
      console.log('✅ ffmpeg copied from system:', sys);
    }
  } catch {
    // 2. Download static build — no apt-get needed
    console.log('⬇️  Downloading static ffmpeg for Linux...');
    try {
      await downloadStatic(
        'https://github.com/eugeneware/ffmpeg-static/releases/download/b6.0/ffmpeg-linux-x64',
        ffmpegPath
      );
      chmodSync(ffmpegPath, '755');
      console.log('✅ ffmpeg static binary ready');
    } catch (e) {
      console.error('❌ ffmpeg download failed:', e.message);
    }
  }
}

function downloadStatic(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 10) return reject(new Error('Too many redirects'));
    const file = createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'vidsave-setup' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadStatic(res.headers.location, dest, redirects + 1)
          .then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
      file.on('error', reject);
    }).on('error', reject);
  });
}