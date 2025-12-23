import organizationRoutes from '../src/routes/organizationRoutes.js';

try {
  console.log('organizationRoutes loaded:', typeof organizationRoutes === 'function' || typeof organizationRoutes === 'object');
} catch (e) {
  console.error('Failed to load organizationRoutes', e && e.stack ? e.stack : e);
  process.exit(1);
}
