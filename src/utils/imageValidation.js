/**
 * Image validation utility
 * Validates image buffers for type, size, and format
 */

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg', 
  'image/png',
  'image/gif'
];

const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif'
];

/**
 * Validates an image buffer
 * @param {Object} options - Validation options
 * @param {Buffer} options.buffer - Image buffer
 * @param {string} options.mimetype - MIME type
 * @param {number} options.size - File size in bytes
 * @param {number} options.maxSize - Maximum allowed size in bytes
 * @returns {Object} - { ok: boolean, message?: string }
 */
export function validateImageBuffer({ buffer, mimetype, size, maxSize }) {
  try {
    // Check if buffer exists
    if (!buffer || !Buffer.isBuffer(buffer)) {
      return { ok: false, message: 'Invalid or missing image data' };
    }

    // Check file size
    if (!size || size <= 0) {
      return { ok: false, message: 'Invalid file size' };
    }

    if (maxSize && size > maxSize) {
      const maxMB = (maxSize / (1024 * 1024)).toFixed(1);
      const actualMB = (size / (1024 * 1024)).toFixed(1);
      return { ok: false, message: `File size ${actualMB}MB exceeds maximum allowed size of ${maxMB}MB` };
    }

    // Check MIME type
    if (!mimetype || !ALLOWED_MIME_TYPES.includes(mimetype.toLowerCase())) {
      return { ok: false, message: 'Invalid file type. Only JPG, JPEG, PNG, and GIF images are allowed' };
    }

    // Basic buffer validation - check for common image signatures
    if (buffer.length < 8) {
      return { ok: false, message: 'File appears to be corrupted or invalid' };
    }

    // Check image signatures
    const isValidImage = validateImageSignature(buffer, mimetype);
    if (!isValidImage) {
      return { ok: false, message: 'File does not appear to be a valid image' };
    }

    return { ok: true };
  } catch (error) {
    console.error('Error validating image:', error);
    return { ok: false, message: 'Failed to validate image' };
  }
}

/**
 * Validates image file signature against MIME type
 * @param {Buffer} buffer - Image buffer
 * @param {string} mimetype - Expected MIME type
 * @returns {boolean} - True if signature matches
 */
function validateImageSignature(buffer, mimetype) {
  if (!buffer || buffer.length < 8) {
    return false;
  }

  const signature = buffer.subarray(0, 8);
  
  switch (mimetype.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      // JPEG signature: FF D8 FF
      return signature[0] === 0xFF && signature[1] === 0xD8 && signature[2] === 0xFF;
    
    case 'image/png':
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      return signature[0] === 0x89 && 
             signature[1] === 0x50 && 
             signature[2] === 0x4E && 
             signature[3] === 0x47 && 
             signature[4] === 0x0D && 
             signature[5] === 0x0A && 
             signature[6] === 0x1A && 
             signature[7] === 0x0A;
    
    case 'image/gif':
      // GIF signature: 47 49 46 38 (GIF8)
      return signature[0] === 0x47 && 
             signature[1] === 0x49 && 
             signature[2] === 0x46 && 
             signature[3] === 0x38;
    
    default:
      return false;
  }
}

/**
 * Gets file extension from filename
 * @param {string} filename - Original filename
 * @returns {string} - File extension (lowercase)
 */
export function getFileExtension(filename) {
  if (!filename) return '';
  const ext = filename.toLowerCase().split('.').pop();
  return ext ? `.${ext}` : '';
}

/**
 * Checks if file extension is allowed
 * @param {string} filename - Original filename
 * @returns {boolean} - True if extension is allowed
 */
export function isAllowedExtension(filename) {
  const ext = getFileExtension(filename);
  return ALLOWED_EXTENSIONS.includes(ext);
}

export default {
  validateImageBuffer,
  getFileExtension,
  isAllowedExtension,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS
};