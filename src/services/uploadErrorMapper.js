export function mapUploadError(error){
  if(!error) return { status: 500, code: 'unknown', message: 'Upload error' };
  if(/Unsupported file type/i.test(error.message)) return { status: 415, code: 'unsupported_type', message: 'Unsupported file type. Allowed types: pdf, png, jpeg.' };
  if(/File too large/i.test(error.message)) return { status: 413, code: 'too_large', message: 'Uploaded file is too large.' };
  return { status: 500, code: 'unknown', message: error.message || 'Upload error' };
}

export default { mapUploadError };
