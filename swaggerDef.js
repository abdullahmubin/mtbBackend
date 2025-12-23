// Swagger/OpenAPI base definition and source globs
// Used both at runtime and by `npm run docs`

const pkgVersion = process.env.npm_package_version || '1.0.0';

const definition = {
  openapi: '3.0.3',
  info: {
    title: 'TCOI Backend API',
    description: 'OpenAPI documentation for the TCOI backend (Express).',
    version: pkgVersion,
  },
  servers: [
    { url: 'http://localhost:3031', description: 'Local (Docker/default)' },
    { url: 'http://localhost:3030', description: 'Local (alt)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          statusCode: { type: 'integer', example: 400 },
          message: { type: 'string', example: 'Bad Request' },
          details: { type: 'object' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'JWT access token' },
          refreshToken: { type: 'string' },
        },
      },
      Receipt: {
        type: 'object',
        properties: {
          _id: { type: 'string' },
          title: { type: 'string' },
          amount: { type: 'number' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

const apis = [
  './src/controllers/**/*.js',
  './src/routes/**/*.js',
  './src/docs/**/*.js',
  './index.js',
];

export default { definition, apis };
