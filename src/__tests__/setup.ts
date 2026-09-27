// Test environment variables
process.env.ADMIN_API_KEY = "test-admin-key-12345";
process.env.NEXT_PUBLIC_ADMIN_API_KEY = "test-admin-key-12345";
process.env.STRIPE_SECRET_KEY = "sk_test_fake";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
process.env.CUSTOMER_APP_URL = "http://localhost:3001";
// Never the real licensing server: any call a test forgets to mock fails here instead.
process.env.LICENSING_SERVER_URL = "http://licensing-server.invalid";
