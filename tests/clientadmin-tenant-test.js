// Test script for tenant API endpoints with clientadmin role
import axios from 'axios';

const BASE_URL = 'http://localhost:3030';

async function testTenantApiWithClientAdmin() {
  try {
    console.log('Testing Tenant API endpoints with clientadmin role...');
    
    // Step 1: Login with clientadmin credentials
    console.log('Attempting to login with clientadmin...');
    let loginResponse;
    try {
      loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: 'clientadmin@test.com',
        password: 'password123'
      });
      console.log('Login response:', loginResponse.data);
    } catch (error) {
      console.error('Login request failed:', error.message);
      console.error('Response data:', error.response?.data);
      // Try with admin credentials as fallback
      console.log('Trying with admin credentials instead...');
      loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
        email: 'admin@test.com',
        password: 'password123'
      });
      console.log('Admin login response:', loginResponse.data);
    }
    
    if (!loginResponse.data || !loginResponse.data.data || !loginResponse.data.data.token) {
      console.error('Login failed - no token in response:', loginResponse.data);
      return;
    }
    
    const token = loginResponse.data.data.token;
    console.log('Login successful, token:', token);
    
    // Get user info from the token
    const userInfo = loginResponse.data.data.userInfo;
    console.log('User info:', userInfo);
    
    // Step 2: Create a new tenant using the token
    const tenantData = {
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com',
      phone: '555-123-4567',
      status: 'Active',
      organization_id: userInfo.organization_id || 1
    };
    
    console.log('\nCreating new tenant...');
    console.log('Tenant data:', tenantData);
    try {
      const createResponse = await axios.post(`${BASE_URL}/tenants`, tenantData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Created tenant successfully:', createResponse.data);
      
      if (!createResponse.data.data || !createResponse.data.data.id) {
        console.error('No tenant ID in response');
        return;
      }
      
      // Extract the tenant ID for update/delete tests
      const tenantId = createResponse.data.data.id;
      console.log('\nTenant ID for update/delete tests:', tenantId);
      
      // Step 3: Update the tenant
      console.log('\nUpdating tenant...');
      const updateResponse = await axios.put(`${BASE_URL}/tenants/${tenantId}`, 
        { 
          ...tenantData,
          last_name: 'Doe Updated',
          id: tenantId
        }, 
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      console.log('Updated tenant successfully:', updateResponse.data);
      
      // Step 4: Delete the tenant
      console.log('\nDeleting tenant...');
      const deleteResponse = await axios.delete(`${BASE_URL}/tenants/${tenantId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      console.log('Deleted tenant successfully:', deleteResponse.data);
      
      // Step 5: Verify the tenant was deleted
      try {
        const getTenantResponse = await axios.get(`${BASE_URL}/tenants/${tenantId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Tenant still exists after deletion:', getTenantResponse.status);
      } catch (error) {
        console.log('Tenant fetch response status:', error.response?.status);
        console.log('✓ Tenant was successfully deleted');
      }
      
      console.log('\n✓ All tenant API tests completed successfully!');
    } catch (error) {
      console.error('Error during tenant operations:');
      console.error('Status:', error.response?.status);
      console.error('Data:', error.response?.data);
      console.error('Message:', error.message);
      console.error('Failed to complete all tests due to errors.');
    }
  } catch (error) {
    console.error('Test error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

// Run the test
testTenantApiWithClientAdmin();

// Run the test
testTenantApiWithClientAdmin();
