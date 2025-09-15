# StudyFetch AI Tutor - PDF Learning Assistant

## Project Overview
StudyFetch AI Tutor is an interactive learning platform that helps students understand PDF documents through a split-screen interface. Users can chat with an AI tutor about the document while the AI highlights and annotates relevant parts of the PDF in real-time.

## Deliverables Checklist

✅ Complete source code in this GitHub repository
✅ Setup instructions (below and in GITHUB-SETUP.md)
✅ .env.example file with required environment variables
✅ Basic documentation (this README and additional .md files)
✅ Deployed public demo on Vercel (see link in Deployment section)

## Features

### 1. Authentication
- Email/password signup and login
- Secure session management using JWT
- Password hashing with bcrypt

### 2. PDF Viewer
- Split-screen layout with PDF view and chat interface
- PDF upload and storage
- Basic navigation (page turning with UI and keyboard controls)
- AI-controlled annotations and highlights

### 3. AI Tutor Integration
- Real-time chat interface
- Voice input/output capability
- Chat history persistence
- AI can reference and control PDF viewing (change pages)
- AI can highlight/circle important content in the PDF
- Context-aware responses based on PDF content

### 4. Database Integration
- User data and authentication
- PDF metadata and storage
- Chat history persistence
- Tracking conversation context

## Tech Stack
- Next.js 14+ (App Router)
- Prisma with PostgreSQL
- OpenAI for the LLM integration
- Web Speech API for voice input/output
- Tailwind CSS for styling
- Fabric.js for PDF annotations

## Getting Started

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database
- OpenAI API key

### Installation

1. Clone the repository
```bash
git clone https://github.com/your-username/study-fetch-assessment.git
cd study-fetch-assessment
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
   - Copy `.env.example` to `.env`
   - Fill in your database details and API keys

```bash
cp .env.example .env
```

4. Set up the database
```bash
npx prisma migrate dev
```

5. Run the development server
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) to see the application

## Deployment

This application is deployed on Vercel. You can view the live demo at:
[https://study-fetch-assessment.vercel.app](https://study-fetch-assessment.vercel.app)
(Note: Update this URL with your actual Vercel deployment URL before submitting)

To deploy your own instance:

1. Push your code to GitHub (see GITHUB-SETUP.md for details)
2. Connect your repository to Vercel 
3. Set up the required environment variables in the Vercel dashboard
4. Deploy!

For detailed Vercel deployment instructions, see [VERCEL-DEPLOYMENT.md](VERCEL-DEPLOYMENT.md)

## Environment Variables

| Variable | Description |
|----------|-------------|
| DATABASE_URL | PostgreSQL connection string |
| JWT_SECRET | Secret key for JWT token generation |
| OPENAI_API_KEY | API key for OpenAI services |
| NODE_ENV | Environment (development/production) |
| NEXT_PUBLIC_API_URL | Base URL for API endpoints |

## Project Structure

```
├── prisma/                # Database schema and migrations
├── public/                # Static files and PDF uploads
├── src/
│   ├── app/               # Next.js App Router pages
│   │   ├── api/           # API endpoints
│   │   │   ├── auth/      # Authentication endpoints
│   │   │   ├── chat/      # Chat and AI functionality
│   │   │   └── pdf/       # PDF handling endpoints
│   │   ├── dashboard/     # User dashboard page
│   │   ├── login/         # Login page
│   │   ├── pdf/           # PDF viewer page
│   │   └── signup/        # Signup page
│   ├── components/        # React components
│   ├── lib/               # Utility functions
│   └── types/             # TypeScript types
├── .env.example           # Example environment variables
└── README.md              # Project documentation
```

## Additional Notes

- The PDF viewer uses React PDF Viewer for rendering
- AI annotations are rendered with Fabric.js canvas overlays
- Voice input uses the browser's Web Speech API
- The system stores chats with annotations for future reference
