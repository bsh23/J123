// Configuration for API Credentails and Environment Variables

// Google Gemini API Key
export const GOOGLE_API_KEY = process.env.API_KEY || '';

// Facebook / WhatsApp Business API Credentials
// Replace these strings with your actual credentials before deploying to VPS
// Domain: Whatsapp.johntechvendorsltd.co.ke
export const FACEBOOK_CONFIG = {
  APP_ID: process.env.FB_APP_ID || '',
  APP_SECRET: process.env.FB_APP_SECRET || '',
  ACCESS_TOKEN: process.env.FB_ACCESS_TOKEN || 'EAAZAphZBPWU7wBQcSmygoGZBaBuFHbhJE5YXkGzOpQqhfmCKdu9gtUrYZBWZCdOaP4ECRb4G5nZCPWXImRyrLQSe03bpHVte9vdYE52knQXrh3YK8bu85WjJlCzVxnHjFWj8qJ5c9ZBCjH2Vcz5pdOjZARFu9RC8YrpJ7ZAESsgfRYDhdxo0jKZCGuoTMU7tEqOZCPfKAZDZD',
  VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token',
  PHONE_NUMBER_ID: process.env.FB_PHONE_NUMBER_ID || '849028871635662',
  BUSINESS_ACCOUNT_ID: process.env.FB_BUSINESS_ACCOUNT_ID || '',
  // This is the URL you will configure in Meta Developer Dashboard
  WEBHOOK_URL: 'https://Whatsapp.johntechvendorsltd.co.ke/webhook'
};

export const BUSINESS_DETAILS = {
  LOCATION: "Thika Road Kihunguro Behind Shell Petrol Station",
  DELIVERY_REGION_FREE: "Kiambu region",
  ADMIN_CONTACT_NAME: "JohnTech Admin"
};