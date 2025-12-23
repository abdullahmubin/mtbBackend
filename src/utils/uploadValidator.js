// Allow configuring max profile image size via environment variable MAX_PROFILE_IMAGE_BYTES
// Fallback to 5 MB to be more permissive by default for profile images
const DEFAULT_MAX_SIZE = process.env.MAX_PROFILE_IMAGE_BYTES ? Number(process.env.MAX_PROFILE_IMAGE_BYTES) : (5 * 1024 * 1024);
const DEFAULT_ALLOWED_TYPES = process.env.ALLOWED_PROFILE_IMAGE_TYPES ? process.env.ALLOWED_PROFILE_IMAGE_TYPES.split(',').map(s=>s.trim()) : ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageBuffer({ buffer, mimetype, size, maxSize = DEFAULT_MAX_SIZE, allowedTypes = DEFAULT_ALLOWED_TYPES }) {
  if (!buffer || !mimetype) return { ok: false, message: 'No file uploaded' };
  if (!allowedTypes.includes(mimetype)) return { ok: false, message: 'Invalid file type' };
  if (size > maxSize) return { ok: false, message: `File size exceeds limit of ${maxSize} bytes` };
  return { ok: true };
}

export { DEFAULT_MAX_SIZE, DEFAULT_ALLOWED_TYPES };
