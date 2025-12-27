// Configuration for API Credentails and Environment Variables

// Google Gemini API Key
// MUST BE SET IN ENVIRONMENT VARIABLES
export const GOOGLE_API_KEY = process.env.API_KEY || '';

// Facebook / WhatsApp Business API Credentials
// Replaced with specific credentials provided
// Domain: whatsapp.johntechvendorsltd.co.ke
export const FACEBOOK_CONFIG = {
  APP_ID: process.env.FB_APP_ID || '1804882224239548',
  APP_SECRET: process.env.FB_APP_SECRET || '5444a89d5cbf3ce81e8aa985268390b5',
  ACCESS_TOKEN: process.env.FB_ACCESS_TOKEN || 'EAAZAphZBPWU7wBQT7Y3mmkG7lbOhb2MgO0CZBZBfDFJhoSlcDD3QaRZAOW3OZAwyVOpuBmyEJzZBO6Id33MMMtsBZBq3jm78GeLi71H2ZCw26d6INUtZCSrfqFgZAwZAESTsDpHB51lwEGmvTsn20qBjtQPQKuX0ApygP12SHZAm1Qszfd8DNBndmnUWZAV3aKs2qTQjEDEAZDZD',
  VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN || 'johntech_verify_token',
  PHONE_NUMBER_ID: process.env.FB_PHONE_NUMBER_ID || '849028871635662',
  BUSINESS_ACCOUNT_ID: process.env.FB_BUSINESS_ACCOUNT_ID || '',
  // This is the URL configured in Meta Developer Dashboard
  WEBHOOK_URL: 'https://whatsapp.johntechvendorsltd.co.ke/webhook'
};

export const BUSINESS_DETAILS = {
  LOCATION: "Thika Road Kihunguro Behind Shell Petrol Station",
  DELIVERY_REGION_FREE: "Kiambu region",
  ADMIN_CONTACT_NAME: "JohnTech Admin"
};