# Receipt Generator Backend API

A robust, secure, and high-performance Node.js backend API for generating and managing receipts with enhanced security, caching, and monitoring capabilities.

## 🚀 Features

- **🔐 Enhanced Security**: Rate limiting, input validation, security headers, and JWT authentication
- **⚡ High Performance**: Redis caching, database connection pooling, and optimized queries
- **📊 Monitoring**: Comprehensive logging with Winston, health checks, and performance metrics
- **🛡️ Input Validation**: Express-validator integration with custom validation rules
- **📝 API Documentation**: Built-in API documentation and endpoint descriptions
- **🔄 Graceful Shutdown**: Proper cleanup and resource management
- **🎯 Database Optimization**: Enhanced indexing and query optimization

## 🏗️ Architecture

```
src/
├── config/           # Database and configuration management
├── controllers/      # Route handlers and business logic
├── middleware/       # Authentication, security, and validation middleware
├── models/          # Mongoose schemas with enhanced indexing
├── services/        # Business logic and data processing
├── utils/           # Utilities, logging, caching, and error handling
├── mongoManager/    # Database connection management
└── uploads/         # File upload handling
```

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Database**: MongoDB with Mongoose ODM
- **Cache**: Redis
- **Authentication**: JWT with refresh tokens
- **Security**: Helmet, CORS, Rate Limiting
- **Validation**: Express-validator
- **Logging**: Winston
- **Documentation**: Built-in API docs
- **File Processing**: Puppeteer for receipt generation

## 🧩 Generic CRUD endpoints

This backend includes a lightweight, reusable Generic Controller + Service that exposes CRUD for any collection listed in `src/models/registry.js`, mounted automatically at both `/collection` and `/api/collection`.

- What you get: list, get-by-id, create (with upsert-by-id), update, delete
- Filtering: `?organization_id=...` support
- Pagination: `limit` and `skip` query params; default sort is `{ updatedAt: -1 }`
- Mixed ids: Works with numeric and string ids (e.g., `plan_settings`)

See the detailed guide: `docs/generic-controller.md`

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd receiptgenerator-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   Create a `.env` file in the root directory:
   ```env
   # Database
   connectionString=mongodb://localhost:27017/receipt_generator
   
   # JWT Secrets
   SECRET_KEY=your-secret-key-here
   REFRESH_SECRET_KEY=your-refresh-secret-key-here
   FORGET_PASSWORD=your-forget-password-secret
   FORGET_PASSWORD_KEY=your-forget-password-key
   
   # Email (Resend)
   resendKeyReceiptGeneratoreKey=your-resend-api-key
   
   # AWS (for file uploads)
   AWS_ACCESS_KEY_ID=your-aws-access-key
   AWS_SECRET_ACCESS_KEY=your-aws-secret-key
   AWS_REGION=us-east-1
   S3_BUCKET=your-s3-bucket-name
   
   # Paddle (Payment processing)
   PADDLE_VENDOR_AUTH_CODE=your-paddle-auth-code
   PADDLE_SANDBOX_ENDPOINT=https://sandbox-vendors.paddle.com/api/2.0
   
   # Telegram (Notifications)
   TELEGRAM_BOT_TOKEN=your-telegram-bot-token
   TELEGRAM_CHAT_ID=your-telegram-chat-id
   
   # Application
   NODE_ENV=development
   LOG_LEVEL=info
   baseDomainEndPoint=http://localhost:3030
   ```

4. **Start Redis Server**
   ```bash
   # On Windows
   redis-server
   
   # On macOS/Linux
   sudo service redis-server start
   ```

5. **Run the application**
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm run prod
   ```

## 🔧 Available Scripts

- `npm start` - Start with nodemon (development)
- `npm run dev` - Start with environment file
- `npm run prod` - Start in production mode
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run docs` - Generate API documentation
- `npm run security-check` - Run security audit

## 🔐 Security Features

### Rate Limiting
- **General API**: 100 requests per 15 minutes
- **Authentication**: 5 requests per 15 minutes
- **File Uploads**: 10 requests per hour

### Input Validation
- Email format validation
- Password strength requirements
- MongoDB ObjectId validation
- JSON field validation
- File upload restrictions

### Security Headers
- Content Security Policy (CSP)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/refresh` - Refresh JWT token
- `POST /api/auth/logout` - User logout
- `POST /api/auth/forget-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### Receipts
- `GET /api/receipts` - Get all receipts (with pagination)
- `GET /api/receipts/:id` - Get receipt by ID
- `POST /api/receipts` - Create new receipt
- `PUT /api/receipts/:id` - Update receipt
- `DELETE /api/receipts/:id` - Delete receipt

### User Receipts
- `GET /api/user-receipts` - Get user's receipts
- `GET /api/user-receipts/favorites` - Get user's favorite receipts
- `POST /api/user-receipts` - Create user receipt
- `PUT /api/user-receipts/:id` - Update user receipt
- `DELETE /api/user-receipts/:id` - Delete user receipt

### Users (Admin Only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Dashboard
- `GET /api/dashboard/stats` - Get dashboard statistics
- `GET /api/dashboard/analytics` - Get analytics data

### System
- `GET /api/health` - Health check
- `GET /api/docs` - API documentation

## 🗄️ Database Schema

### Users Collection
```javascript
{
  firstName: String,
  lastName: String,
  userName: String (unique, required),
  email: String (unique, required),
  password: String (hashed),
  role: String,
  plan: String (required),
  isActive: Boolean,
  isDeleted: Boolean,
  // ... other fields
}
```

### Receipts Collection
```javascript
{
  receiptTitle: String (required),
  receiptDesign: String (required),
  receiptCategoryId: ObjectId (ref: ReceiptCategories),
  logo: String,
  receiptMapping: String (JSON),
  receiptImage: String,
  receiptSettings: String (JSON),
  isActive: Boolean,
  isDeleted: Boolean,
  // ... timestamps
}
```

### ReceiptByUser Collection
```javascript
{
  receiptTitle: String (required),
  receiptDesign: String,
  receiptCategoryId: ObjectId,
  receiptDetailsData: String (JSON),
  paymentType: String (enum),
  isFavorite: Boolean,
  userId: ObjectId (ref: Users),
  // ... other fields
}
```

## 🔍 Database Indexes

### Performance Optimizations
- **Compound indexes** for common query patterns
- **Text indexes** for search functionality
- **Single field indexes** for filtering
- **Soft delete indexes** for data management

### Key Indexes
```javascript
// Users
{ userName: 1 } (unique)
{ email: 1 } (unique)
{ createdAt: 1, isDeleted: 1 }

// Receipts
{ receiptCategoryId: 1, isActive: 1, isDeleted: 1 }
{ createdAt: -1, isDeleted: 1 }
{ receiptTitle: 'text' }

// ReceiptByUser
{ userId: 1, isDeleted: 1, createdAt: -1 }
{ userId: 1, isFavorite: 1, isDeleted: 1 }
```

## 🚀 Performance Features

### Caching Strategy
- **Redis caching** for frequently accessed data
- **TTL-based expiration** for cache management
- **Cache invalidation** on data updates
- **Function-level caching** for expensive operations

### Database Optimization
- **Connection pooling** with configurable pool size
- **Query optimization** with proper indexing
- **Aggregation pipelines** for complex queries
- **Soft deletes** for data integrity

## 📝 Logging

### Log Levels
- **ERROR**: Application errors and exceptions
- **WARN**: Security events and warnings
- **INFO**: General application events
- **DEBUG**: Detailed debugging information

### Log Categories
- HTTP requests and responses
- Database operations
- Authentication events
- Security events
- Performance metrics

## 🔧 Configuration

### Environment Variables
All configuration is managed through environment variables for security and flexibility.

### Development vs Production
- **Development**: Detailed logging, auto-index creation
- **Production**: Optimized logging, manual index management

## 🐳 Docker Support

The application includes Docker configuration for easy deployment:

```bash
# Build image
docker build -t receipt-generator-backend .

# Run container
docker run -p 3031:3031 receipt-generator-backend
```

## 📈 Monitoring

### Health Checks
- Database connectivity
- Redis connectivity
- Application status
- Memory usage
- Uptime statistics

### Performance Metrics
- Request/response times
- Database query performance
- Cache hit/miss ratios
- Memory usage patterns

## 🔒 Security Best Practices

1. **Environment Variables**: All secrets stored in environment variables
2. **Input Validation**: Comprehensive validation for all inputs
3. **Rate Limiting**: Protection against abuse and DDoS
4. **CORS Configuration**: Restricted to allowed origins
5. **Security Headers**: Protection against common attacks
6. **JWT Management**: Secure token handling with refresh mechanism
7. **Password Hashing**: Bcrypt for password security
8. **SQL Injection Protection**: Mongoose ODM protection
9. **XSS Protection**: Input sanitization and output encoding

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run linting: `npm run lint`
6. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation at `/api/docs`
- Review the health check at `/api/health`

## 🔄 Changelog

### Version 1.0.0
- Initial release with enhanced security and performance
- Comprehensive input validation
- Redis caching implementation
- Enhanced database indexing
- Structured logging with Winston
- Rate limiting and security headers
- API documentation
- Health monitoring
- Graceful shutdown handling 