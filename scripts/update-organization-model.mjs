// Fix organization model in authService.js
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function modifyOrganizationModel() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.connectionString);
    console.log('Connected to MongoDB');
    
    // Create a new schema for organizations with Number type for _id
    const OrganizationSchema = new mongoose.Schema({
      _id: Number,
      organization_id: Number,
      name: String,
      ownerUserId: String,
      customer_id: String,
      plan: String,
      status: String
    }, { 
      timestamps: true,
      _id: false, // Disable automatic ObjectId generation
      strict: false // Allow other fields
    });
    
    // Register the model
    let OrganizationModel;
    try {
      // Try to get the model if it exists
      OrganizationModel = mongoose.model('Organizations');
    } catch (e) {
      // If not exists, create it
      OrganizationModel = mongoose.model('Organizations', OrganizationSchema);
    }
    
    // Check for organizations with numeric _id
    console.log('Checking existing organizations...');
    const organizations = await OrganizationModel.find().limit(5);
    
    if (organizations.length > 0) {
      console.log(`Found ${organizations.length} organizations:`);
      organizations.forEach(org => {
        console.log(`- ID: ${org._id}, Type: ${typeof org._id}, Name: ${org.name}, Plan: ${org.plan}`);
      });
    } else {
      console.log('No organizations found');
    }
    
    // Disconnect
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
    console.log('\nSchema modification completed. Make sure to update the model definition in:');
    console.log('1. src/models/organizations.js');
    console.log('2. src/services/authService.js');
    
  } catch (error) {
    console.error('Error:', error);
    
    // Ensure connection is closed
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

// Run the function
modifyOrganizationModel();
