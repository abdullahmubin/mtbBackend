// Intentionally throw an uncaught exception after a short delay to test crash handlers
console.log('Starting crash test - the process will throw an uncaught exception in 2s');
setTimeout(() => {
  // eslint-disable-next-line no-undef
  throw new Error('Crash test: intentional uncaught exception for logger verification');
}, 2000);
