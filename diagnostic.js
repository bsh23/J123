import axios from 'axios';

// --- CREDENTIALS PROVIDED ---
const CONFIG = {
  accessToken: 'EAAZAphZBPWU7wBQcSmygoGZBaBuFHbhJE5YXkGzOpQqhfmCKdu9gtUrYZBWZCdOaP4ECRb4G5nZCPWXImRyrLQSe03bpHVte9vdYE52knQXrh3YK8bu85WjJlCzVxnHjFWj8qJ5c9ZBCjH2Vcz5pdOjZARFu9RC8YrpJ7ZAESsgfRYDhdxo0jKZCGuoTMU7tEqOZCPfKAZDZD',
  phoneNumberId: '849028871635662',
  wabaId: '836736818917330',
  version: 'v17.0'
};

const recipientPhone = process.argv[2];

if (!recipientPhone) {
  console.error('\n❌ ERROR: Please provide a recipient phone number (with country code) as an argument.');
  console.error('Usage: node diagnostic.js <PHONE_NUMBER>');
  console.error('Example: node diagnostic.js 254712345678\n');
  process.exit(1);
}

console.log('\n🔍 --- STARTING DIAGNOSTICS FOR JOHNTECH VENDORS --- 🔍\n');

async function runDiagnostics() {
  try {
    // 1. CHECK TOKEN & PERMISSIONS
    console.log('1️⃣  Checking Access Token...');
    const debugUrl = `https://graph.facebook.com/debug_token?input_token=${CONFIG.accessToken}&access_token=${CONFIG.accessToken}`;
    try {
      const debugRes = await axios.get(debugUrl);
      const data = debugRes.data.data;
      
      if (data.is_valid) {
        console.log('   ✅ Token is VALID.');
        console.log(`   expires_at: ${new Date(data.expires_at * 1000).toLocaleString()}`);
        console.log(`   scopes: ${JSON.stringify(data.scopes)}`);
        
        if (!data.scopes.includes('whatsapp_business_messaging')) {
          console.warn('   ⚠️  WARNING: Token is missing "whatsapp_business_messaging" scope!');
        }
      } else {
        console.error('   ❌ Token is INVALID.');
        console.error('   Message:', data.error.message);
        return;
      }
    } catch (err) {
      console.error('   ❌ Failed to validate token:', err.response?.data || err.message);
      return;
    }

    // 2. CHECK PHONE NUMBER STATUS
    console.log('\n2️⃣  Checking Phone Number Status...');
    try {
      const phoneUrl = `https://graph.facebook.com/${CONFIG.version}/${CONFIG.phoneNumberId}`;
      const phoneRes = await axios.get(phoneUrl, {
        headers: { Authorization: `Bearer ${CONFIG.accessToken}` }
      });
      
      console.log('   ✅ Phone Number Found:');
      console.log(`   Display Name: ${phoneRes.data.display_phone_number}`);
      console.log(`   Quality Rating: ${phoneRes.data.quality_rating}`);
      console.log(`   Code Verification Status: ${phoneRes.data.code_verification_status}`); // Should be 'VERIFIED' or 'NOT_VERIFIED'
      
      if (phoneRes.data.code_verification_status !== 'VERIFIED') {
        console.warn('   ⚠️  WARNING: Phone number verification status is NOT "VERIFIED". You may need to verify it in the Meta Dashboard.');
      }
    } catch (err) {
      console.error('   ❌ Failed to fetch phone info. Check Phone Number ID.', err.response?.data || err.message);
    }

    // 3. CHECK BUSINESS ACCOUNT (WABA)
    console.log('\n3️⃣  Checking Business Account (WABA)...');
    try {
      const wabaUrl = `https://graph.facebook.com/${CONFIG.version}/${CONFIG.wabaId}`;
      const wabaRes = await axios.get(wabaUrl, {
        headers: { Authorization: `Bearer ${CONFIG.accessToken}` }
      });
      
      console.log('   ✅ Business Account Found:');
      console.log(`   Name: ${wabaRes.data.name}`);
      console.log(`   Status: ${wabaRes.data.account_review_status}`);
      console.log(`   Currency: ${wabaRes.data.currency}`);
    } catch (err) {
      console.error('   ❌ Failed to fetch WABA info.', err.response?.data || err.message);
    }

    // 4. TEST SENDING MESSAGE
    console.log(`\n4️⃣  Attempting to send TEST message to: ${recipientPhone}...`);
    try {
      const msgUrl = `https://graph.facebook.com/${CONFIG.version}/${CONFIG.phoneNumberId}/messages`;
      const msgRes = await axios.post(msgUrl, {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: '🔔 JohnTech Diagnostic Test Message: Connection Successful!' }
      }, {
        headers: { 
          Authorization: `Bearer ${CONFIG.accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('   ✅ Message Sent Successfully!');
      console.log(`   Message ID: ${msgRes.data.messages[0].id}`);
      console.log('   Check your WhatsApp to see if it arrived.');
    } catch (err) {
      console.error('   ❌ FAILED to send message.');
      console.error('   Error Data:', JSON.stringify(err.response?.data, null, 2));
    }

  } catch (err) {
    console.error('UNEXPECTED ERROR:', err);
  }
}

runDiagnostics();
