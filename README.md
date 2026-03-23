<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ywfDf4-VW_WND9-XAilYddgRfBYlAIu0

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set your environment variables in `.env.local`:
   `VITE_SUPABASE_URL=...`
   `VITE_SUPABASE_ANON_KEY=...`
   `GROQ_API_KEY=...`
3. Run the app:
   `npm run dev`

## AI Setup

The app's AI features call the server-side proxy at [`api/ai.ts`](/Users/itai/Desktop/SYS/dreambox/api/ai.ts), which expects `GROQ_API_KEY` to be available in the environment. On Vercel, add `GROQ_API_KEY` to your production environment before deploying.
