// Test email case-insensitivity fix
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Create a function to test the email checking logic with our new case-insensitive approach
async function testEmailCaseInsensitivity() {
  try {
    // Connect to MongoDB using mongoose
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB...');
    
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');
    
    // Create a temporary email for testing
    const testEmail = 'TestEmailCase@example.com';
    const lowerEmail = testEmail.toLowerCase();
    
    // Create a test model
    const UserSchema = new mongoose.Schema({
      email: String,
      userName: String
    });
    
    const TestUser = mongoose.model('TestUser', UserSchema);
    
    // Clear any previous test data
    await TestUser.deleteMany({ email: { $regex: new RegExp(`^${testEmail}$`, 'i') } });
    
    // Create a user with lowercase email
    await TestUser.create({ email: lowerEmail, userName: 'test_user' });
    console.log(`Created test user with email: ${lowerEmail}`);
    
    // Test case-sensitive search (old approach)
    const caseSensitiveSearch = await TestUser.findOne({ email: testEmail });
    console.log('Case-sensitive search result:', caseSensitiveSearch ? 'Found' : 'Not found');
    
    // Test case-insensitive search (new approach)
    const caseInsensitiveSearch = await TestUser.findOne({ 
      email: { $regex: new RegExp(`^${testEmail}$`, 'i') } 
    });
    console.log('Case-insensitive search result:', caseInsensitiveSearch ? 'Found' : 'Not found');
    
    // Clean up
    await TestUser.deleteMany({ email: { $regex: new RegExp(`^${testEmail}$`, 'i') } });
    console.log('Test completed and data cleaned up');
    
    // Test the checkAlreadyExistUsernameEmail logic
    console.log('\nTesting checkAlreadyExistUsernameEmail function logic:');
    
    // Create a new test user
    await TestUser.create({ email: 'user@example.com', userName: 'testuser' });
    
    // Test variations of the email
    const testVariations = [
      'user@example.com',
      'User@example.com',
      'USER@example.com',
      'user@EXAMPLE.com'
    ];
    
    for (const email of testVariations) {
      // Build query using our new approach
      const query = { $or: [{ email: { $regex: new RegExp(`^${email}$`, 'i') } }] };
      
      const result = await TestUser.findOne(query);
      console.log(`Email "${email}" - Result:`, result ? 'Found' : 'Not found');
    }
    
    // Clean up
    await TestUser.deleteMany({});
    console.log('All test data cleaned up');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB connection closed');
  }
}

// Run the test
testEmailCaseInsensitivity();
