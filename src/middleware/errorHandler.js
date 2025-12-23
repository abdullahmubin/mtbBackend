/**
 * Global error handler middleware for Express
 * This middleware catches all errors that are passed to next() throughout the application
 */
import logger from '../utils/logger.js';

export const globalErrorHandler = (err, req, res, next) => {
  // Log the error for debugging
  logger.error('Global error caught', err);
  
  // Default status code is 500 (Internal Server Error)
  const statusCode = err.statusCode || 500;
  
  // Create a standardized error response
  const errorResponse = {
    status: "Error",
    statusCode: statusCode,
    message: err.message || "An unexpected error occurred",
    // Include stack trace in development, but not in production
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  };

  // Send the error response
  res.status(statusCode).json(errorResponse);
};

export default globalErrorHandler;
