// Test the login function in authService directly
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Import the necessary models and services manually
async function testLoginFunction() {
  try {
    // Connect to MongoDB using mongoose
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    // Import the authService module
    const authServicePath = path.join(__dirname, '..', 'src', 'services', 'authService.js');
    const authService = await import(authServicePath);
    
    // Test login with Sarah Williams
    const email = 'sarah.williams@example.com';
    const password = 'sarah.williams@example.com'; // This is what we set in our test script
    
    console.log(`\nTesting login for ${email} with password '${password}'`);
    
    try {
      // Call the login function
      const result = await authService.login(email, password, true);
      
      console.log('Login successful!');
      console.log('- Token:', result.token ? 'Generated' : 'None');
      console.log('- User:', result.user ? `${result.user.first_name} ${result.user.last_name}` : 'None');
      console.log('- User Type:', result.userType);
      
      console.log('\n✅ AUTHENTICATION SUCCESSFUL: The login function works correctly');
    } catch (error) {
      console.error('Login error:', error.message);
      console.log('\n❌ AUTHENTICATION FAILED: The login function encountered an error');
      
      // If there's a specific error we know how to fix, do it
      if (error.message.includes('Cannot read properties of undefined (reading \'findOne\')')) {
        console.log('This is likely due to the organization model issue. Check model imports in authService.js');
      }
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close the MongoDB connection
    await mongoose.disconnect();
    console.log('MongoDB connection closed');
  }
}

// Run the test
testLoginFunction();
