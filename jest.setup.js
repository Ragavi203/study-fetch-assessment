// This file sets up the Jest test environment
// Add any global mocks or setup code here

// Mock Next.js modules that aren't compatible with Jest
jest.mock('next/server', () => ({
  NextRequest: class NextRequest {},
  NextResponse: {
    json: jest.fn((data, options = {}) => ({
      status: options.status || 200,
      headers: options.headers || {},
      body: JSON.stringify(data)
    }))
  }
}));

// Set up environment variables for tests
process.env.JWT_SECRET = 'test-secret';
process.env.OPENAI_API_KEY = 'test-openai-key';