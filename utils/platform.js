export function detectPlatform(url) {
  const lower = (url || '').toLowerCase();
  // Fixed: removed overly broad `lower.includes('youtube')` — was matching any URL
  // containing the word "youtube" even in unrelated contexts
  if (lower.includes('youtube.com') || lower.includes('youtu.be')) return 'youtube';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.watch')) return 'facebook';
  if (lower.includes('twitter.com') || lower.includes('x.com')) return 'twitter';
  return 'unknown';
}