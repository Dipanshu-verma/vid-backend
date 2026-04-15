import { mkdirSync, existsSync, chmodSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const binDir = join(__dirname, '..', 'bin');
const binPath = join(binDir, 'yt-dlp');

if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

if (existsSync(binPath)) {
  console.log('yt-dlp already exists, skipping.');
  process.exit(0);
}

console.log('Downloading yt-dlp binary...');

const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

execSync(`curl -L "${url}" -o "${binPath}"`, { stdio: 'inherit' });
chmodSync(binPath, 0o755);

console.log('yt-dlp ready at', binPath);