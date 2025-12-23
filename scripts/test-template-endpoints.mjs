// This script will check the API endpoints for email and SMS templates

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Initialize path for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file if present
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const API_URL = process.env.VITE_API_URL || 'http://localhost:5000/api';

// Function to call API endpoints
async function testApiEndpoint(endpoint, description) {
  console.log(`Testing ${description} (${endpoint})...`);
  try {
    const response = await fetch(`${API_URL}${endpoint}`);
    const data = await response.json();
    
    console.log(`Status: ${response.status}`);
    console.log(`Response data:`, data);
    
    if (data && Array.isArray(data.data)) {
      console.log(`Found ${data.data.length} items`);
    } else if (data && data.data) {
      console.log(`Response has data property but it's not an array:`, data.data);
    } else {
      console.log(`Response doesn't have expected data structure`);
    }
    
    console.log('-------------------------------------------');
    return { success: response.status === 200, data };
  } catch (error) {
    console.error(`Error testing ${description}:`, error.message);
    console.log('-------------------------------------------');
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('Starting API endpoint tests...');
  
  // Test email templates endpoint
  await testApiEndpoint('/email-templates', 'Email Templates');
  
  // Test SMS templates endpoint
  await testApiEndpoint('/sms-templates', 'SMS Templates');
  
  // Test email automations endpoint
  await testApiEndpoint('/email-automations', 'Email Automations');
  
  // Test SMS automations endpoint
  await testApiEndpoint('/sms-automations', 'SMS Automations');
  
  // Test collections endpoint to check if our collections are registered
  await testApiEndpoint('/collections', 'Collections List');
  
  console.log('API tests completed');
}

runTests().catch(console.error);
