import axios from 'axios';

const CONFIG = {
  // Your provided Token
  token: 'EAAZAphZBPWU7wBQcSmygoGZBaBuFHbhJE5YXkGzOpQqhfmCKdu9gtUrYZBWZCdOaP4ECRb4G5nZCPWXImRyrLQSe03bpHVte9vdYE52knQXrh3YK8bu85WjJlCzVxnHjFWj8qJ5c9ZBCjH2Vcz5pdOjZARFu9RC8YrpJ7ZAESsgfRYDhdxo0jKZCGuoTMU7tEqOZCPfKAZDZD',
  // Your provided Phone ID
  phoneId: '849028871635662' 
};

console.log('\n🔍 Checking WhatsApp Number Status...\n');

const checkStatus = async () => {
  try {
    const url = `https://graph.facebook.com/v17.0/${CONFIG.phoneId}?fields=display_phone_number,quality_rating,code_verification_status,name_status`;
    
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${CONFIG.token}` }
    });

    const data = response.data;

    console.log('✅ CONNECTION SUCCESSFUL');
    console.log('-------------------------');
    console.log(`📞 Display Name:      ${data.display_phone_number}`);
    console.log(`🌟 Quality Rating:    ${data.quality_rating} (Green/High is good)`);
    console.log(`🔐 Verification:      ${data.code_verification_status}`);
    console.log(`📝 Name Status:       ${data.name_status}`);
    console.log('-------------------------');

    if (data.code_verification_status !== 'VERIFIED') {
      console.log('⚠️  WARNING: This number is NOT fully verified yet. It might not be able to send messages.');
    } else {
      console.log('🚀 The number is ACTIVE and READY.');
    }

  } catch (error) {
    console.log('❌ CHECK FAILED');
    if (error.response) {
      console.log(`HTTP Status: ${error.response.status}`);
      console.log('Error Message:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log(error.message);
    }
  }
  console.log('\n');
};

checkStatus();