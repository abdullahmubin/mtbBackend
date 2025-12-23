// Check for case sensitivity issues in email comparison
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function checkEmailCaseSensitivity() {
  let client = null;
  
  try {
    // Connect directly to MongoDB using MongoClient
    const uri = process.env.connectionString;
    console.log('Connecting to MongoDB...');
    
    client = new MongoClient(uri);
    await client.connect();
    console.log('Connected to MongoDB');
    
    // Use the 'test' database
    const db = client.db('test');
    
    // Get the users collection
    const usersCollection = db.collection('users');
    
    // Count total users
    const totalUsers = await usersCollection.countDocuments();
    console.log(`Total users in database: ${totalUsers}`);
    
    // Check for the specific email
    const testEmail = "adminclientPro@gmail.com";
    console.log(`Checking for email: ${testEmail}`);
    
    // Check exact match (case sensitive)
    const exactMatch = await usersCollection.findOne({ email: testEmail });
    console.log(`Exact match found: ${exactMatch ? 'Yes' : 'No'}`);
    
    // Check case-insensitive match
    const caseInsensitiveMatch = await usersCollection.findOne({ 
      email: { $regex: new RegExp(`^${testEmail}$`, 'i') } 
    });
    console.log(`Case-insensitive match found: ${caseInsensitiveMatch ? 'Yes' : 'No'}`);
    
    if (caseInsensitiveMatch) {
      console.log(`Found case variation: "${caseInsensitiveMatch.email}"`);
    }
    
    // List all emails for review
    console.log("\nListing emails that might be similar:");
    const similarEmails = await usersCollection.find({ 
      email: { $regex: new RegExp(testEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } 
    }).toArray();
    
    similarEmails.forEach(user => {
      console.log(`- ${user.email}`);
    });
    
    // Check for potential duplicates by email normalization
    console.log("\nChecking for potential duplicate emails (case-insensitive):");
    const allEmails = await usersCollection.find({}, { projection: { email: 1 } }).toArray();
    const emailMap = {};
    const duplicates = [];
    
    allEmails.forEach(user => {
      if (!user.email) return;
      
      const normalizedEmail = user.email.toLowerCase();
      
      if (emailMap[normalizedEmail]) {
        duplicates.push({
          normalized: normalizedEmail,
          variations: [
            ...emailMap[normalizedEmail],
            user.email
          ]
        });
      } else {
        emailMap[normalizedEmail] = [user.email];
      }
    });
    
    if (duplicates.length > 0) {
      console.log("Found potential duplicate emails (different case):");
      duplicates.forEach(dup => {
        console.log(`- Normalized: ${dup.normalized}`);
        console.log(`  Variations: ${dup.variations.join(', ')}`);
      });
    } else {
      console.log("No duplicate emails with different case found");
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB connection closed');
    }
  }
}

// Run the function
checkEmailCaseSensitivity();
