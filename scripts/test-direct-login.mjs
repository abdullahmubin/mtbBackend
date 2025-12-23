// Comprehensive test for tenant login using the actual login function
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { login } from '../src/services/authService.js';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Set default JWT secrets if not in .env
process.env.JWT_SECRET = process.env.JWT_SECRET || 'tcoi_jwt_secret_2023';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'tcoi_refresh_secret_2023';

async function testLoginDirectly() {
  try {
    console.log('Starting direct login test...');
    
    // Connect to MongoDB
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB using connection string:', uri);
    
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');
    
    // Test tenant login
    console.log('\nTesting tenant login for sarah.williams@example.com...');
    try {
      const loginResult = await login({
        email: 'sarah.williams@example.com',
        password: 'sarah.williams@example.com'
      });
      
      console.log('✅ Login successful!');
      console.log('- Token received:', !!loginResult.token);
      console.log('- User info:', loginResult.userInfo);
      
      // Verify this is a tenant login
      if (loginResult.userInfo && loginResult.userInfo.isTenant) {
        console.log('\n✅ CONFIRMATION: This is a tenant login!');
      } else {
        console.log('\n⚠️ WARNING: Login succeeded but not as a tenant!');
      }
    } catch (loginError) {
      console.error('❌ Login failed:', loginError.message);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('MongoDB connection closed');
  }
}

// Run the test
testLoginDirectly();
