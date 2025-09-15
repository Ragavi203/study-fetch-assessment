# Vercel Deployment Checklist

This document provides a step-by-step guide for deploying the StudyFetch AI Tutor to Vercel.

## Pre-Deployment Steps

1. **Set up a PostgreSQL Database**
   - Create a PostgreSQL database (using Vercel Postgres, Supabase, Neon, or similar)
   - Note the database connection URL for the next steps

2. **Configure Environment Variables**
   - Prepare the following environment variables:
     ```
     DATABASE_URL=postgresql://username:password@host:port/database
     JWT_SECRET=your-secure-random-string
     OPENAI_API_KEY=sk-...  # If using OpenAI
     ```

3. **Run Local Production Test**
   - Build the project locally to catch any issues:
     ```bash
     npm run build
     ```
   - Test the production build:
     ```bash
     npm run start
     ```

## Deployment Steps

1. **Connect Repository to Vercel**
   - Log in to [Vercel](https://vercel.com)
   - Import your GitHub repository
   - Select the StudyFetch project

2. **Configure Project Settings**
   - Framework Preset: Next.js
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Install Command: `npm install`

3. **Set Environment Variables**
   - Add all the environment variables from the pre-deployment step
   - Ensure DATABASE_URL is properly configured for production

4. **Configure Edge Functions**
   - Enable Edge Functions for API routes that use streaming:
     ```js
     export const runtime = 'edge';
     ```
   - Check `next.config.js` for proper edge configuration

5. **Deploy**
   - Click "Deploy" and wait for the build to complete

## Post-Deployment Verification

1. **Check Application Status**
   - Verify the application is running correctly
   - Test PDF uploading and viewing

2. **Verify Database Connectivity**
   - Check that the application can connect to the database
   - Verify user registration and login functionality

3. **Test Critical Features**
   - PDF annotation and persistence
   - Chat with AI tutoring
   - Voice interaction (if implemented)
   - Server-Sent Events for streaming responses

4. **Run Database Migration**
   - Apply Prisma migrations to the production database:
     ```bash
     npx prisma migrate deploy --preview-feature
     ```

5. **Monitor Error Logs**
   - Check Vercel logs for any errors
   - Set up error monitoring (e.g., Sentry) if needed

## Troubleshooting Common Issues

1. **Database Connection Issues**
   - Verify the database URL is correct
   - Check that the database user has proper permissions
   - Ensure the database is accessible from Vercel's IP range

2. **Environment Variable Problems**
   - Double-check all environment variables are set correctly
   - Verify no typos in variable names

3. **Edge Function Limitations**
   - Remember Edge Functions have size and runtime limitations
   - Use regular Node.js runtime for heavy operations

4. **PDF Processing Issues**
   - Ensure PDF storage is configured correctly
   - Check file upload limits

## Performance Optimization

1. **Enable Caching**
   - Configure caching headers for static assets
   - Use SWR for client-side data fetching

2. **Optimize Images**
   - Use Next.js Image component
   - Configure image optimization in `next.config.js`

3. **Analytics and Monitoring**
   - Set up Vercel Analytics
   - Configure monitoring for Edge Functions