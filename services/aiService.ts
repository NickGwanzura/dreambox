
import { Groq } from "groq-sdk";
import { Billboard, Client } from "../types";

declare var process: any;

// Safe access to API Key for browser environments
const getApiKey = () => {
  try {
    // Check if process exists (Node/Polyfill) and has env
    if (typeof process !== 'undefined' && process.env && process.env.GROQ_API_KEY) {
      return process.env.GROQ_API_KEY;
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  return '';
};

const apiKey = getApiKey();
const groq = apiKey ? new Groq({ apiKey }) : null;

export const generateBillboardDescription = async (billboard: Billboard): Promise<string> => {
  if (!groq) return `Premium billboard located at ${billboard.location} in ${billboard.town}. High visibility and traffic area.`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Write a catchy, premium 2-sentence marketing description for a billboard located at ${billboard.location} in ${billboard.town}. The billboard type is ${billboard.type}. Highlight visibility and traffic.`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.7,
      max_tokens: 100,
    });
    return chatCompletion.choices[0]?.message?.content || "High visibility location perfect for your brand.";
  } catch (e) {
    console.warn("AI Generation failed:", e);
    return "Premium advertising space available in high-traffic area.";
  }
};

export const analyzeBillboardLocation = async (location: string, town: string): Promise<{ visibility: string, dailyTraffic: number, coordinates?: { lat: number, lng: number } }> => {
  if (!groq) return { visibility: "High visibility potential in a key strategic area.", dailyTraffic: 5000 };

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Analyze the location '${location}' in '${town}', Zimbabwe. 
1. Provide a professional 2-sentence assessment of its advertising visibility.
2. Estimate a realistic average daily traffic count (integer).
3. Estimate the Latitude and Longitude coordinates for this location as accurately as possible.

Return ONLY a valid JSON object in this format:
{ 
  "visibility": "The assessment text...", 
  "dailyTraffic": 15000,
  "coordinates": { "lat": -17.82, "lng": 31.05 }
}`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: "json_object" }
    });
    
    const json = JSON.parse(chatCompletion.choices[0]?.message?.content || '{}');
    return {
      visibility: json.visibility || "Prime location with excellent exposure opportunities.",
      dailyTraffic: json.dailyTraffic || 5000,
      coordinates: json.coordinates
    };
  } catch (e) {
    console.warn("AI Analysis failed:", e);
    return { visibility: "Strategic location with significant daily impressions.", dailyTraffic: 5000 };
  }
};

export const generateRentalProposal = async (client: Client, billboard: Billboard, cost: number): Promise<string> => {
  if (!groq) return `Dear ${client.contactPerson},\n\nWe are pleased to offer you a space at ${billboard.location}. The monthly rate is $${cost}.\n\nBest regards,\nDreambox Advertising`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Draft a professional, persuasive email proposal to ${client.contactPerson} from ${client.companyName} for renting a billboard at ${billboard.location} (${billboard.town}). 
The monthly rate is $${cost}. 
Focus on value, visibility, and partnership. Keep it under 100 words.`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.7,
      max_tokens: 200,
    });
    return chatCompletion.choices[0]?.message?.content || "Proposal generation failed.";
  } catch (e) {
    console.warn("AI Proposal failed:", e);
    return "Error generating proposal. Please try again later.";
  }
};

export const generateGreeting = async (username: string): Promise<string> => {
  if (!groq) return `Welcome back, ${username}. Ready to manage your fleet?`;
  
  try {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
    
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Generate a short, professional, and motivating greeting for a user named "${username}" logging into an advertising management dashboard. 
It is currently ${timeOfDay}. Keep it under 15 words. Don't use quotes.`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.7,
      max_tokens: 50,
    });
    return chatCompletion.choices[0]?.message?.content || `Good ${timeOfDay}, ${username}. Let's get to work.`;
  } catch (e) {
    return `Welcome back, ${username}.`;
  }
};

export const analyzeBusinessData = async (dataContext: string): Promise<string> => {
  if (!groq) return "AI Analysis unavailable. Please check your API Key configuration.";

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `You are Dreambox AI, a highly intelligent business analyst for a Billboard Advertising company. 
Analyze the provided data context and answer the user's specific question. 
If the user asks for a summary, provide a concise strategic overview.
If the user asks a specific question (e.g., "How is Harare doing?"), use the data to answer specifically.
Keep the tone professional, encouraging, and data-driven. Keep the answer under 50 words unless asked for more detail.

Data Context: ${dataContext}`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.7,
      max_tokens: 150,
    });
    return chatCompletion.choices[0]?.message?.content || "I couldn't analyze the data at this moment.";
  } catch (e) {
    return "Could not generate insights due to network or API limits.";
  }
}

export const fetchIndustryNews = async (): Promise<Array<{ title: string; summary: string; source?: string; date?: string; category?: string }>> => {
  // Fallback Mock Data — 5 items covering industry + promos
  const mockNews = [
    { title: "Harare City Council Reviews Billboard Bylaws", summary: "New zoning regulations proposed for digital billboards in the CBD to reduce light pollution and improve urban aesthetics.", source: "Local Govt", date: "2 days ago", category: "Regulation" },
    { title: "Econet Launches Massive OOH Campaign", summary: "Telecommunications giant dominates skyline with new 5G rollout advertisements across major highways and urban centres.", source: "TechZim", date: "1 week ago", category: "Promo Launch" },
    { title: "Solar-Powered Billboards Trend Rising", summary: "Operators switching to renewable energy to combat load shedding and reduce operational costs by up to 40%.", source: "Green Energy ZW", date: "2 weeks ago", category: "Industry" },
    { title: "OK Zimbabwe Runs National Festive Campaign", summary: "Retail chain activates 60+ billboard sites nationwide for their end-of-year promotional drive with record ad spend.", source: "AdFocus ZW", date: "3 days ago", category: "Promo Launch" },
    { title: "Digital OOH Spend Grows 28% in Southern Africa", summary: "DOOH advertising budgets surge as brands shift from print to programmable LED formats for real-time campaign delivery.", source: "Media Report", date: "1 week ago", category: "Industry" },
  ];

  if (!groq) return mockNews;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Generate 5 realistic, current news items covering:
- Billboard/Outdoor advertising industry news in Zimbabwe and Southern Africa
- Major companies launching advertising campaigns or promos on billboards (retail, telco, FMCG, banking)
- OOH industry trends, new technology, or regulatory changes

Return ONLY in this exact plain text format (no markdown, no asterisks):

ITEM
TITLE: [News headline]
DATE: [e.g. 2 days ago / 1 week ago]
SOURCE: [Publication name]
CATEGORY: [one of: Promo Launch, Industry, Regulation, Technology]
SUMMARY: [2-sentence summary of the news]
ENDITEM

Repeat for all 5 items.`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.6,
      max_tokens: 700,
    });

    const text = chatCompletion.choices[0]?.message?.content || '';
    const items: Array<{ title: string; summary: string; source?: string; date?: string; category?: string }> = [];

    const rawItems = text.split('ITEM');
    for (const raw of rawItems) {
      if (!raw.trim()) continue;

      const title = raw.match(/TITLE:\s*(.+)/i)?.[1]?.trim();
      const date = raw.match(/DATE:\s*(.+)/i)?.[1]?.trim();
      const source = raw.match(/SOURCE:\s*(.+)/i)?.[1]?.trim();
      const category = raw.match(/CATEGORY:\s*(.+)/i)?.[1]?.trim();
      const summary = raw.match(/SUMMARY:\s*(.+)/i)?.[1]?.trim();

      if (title && summary) {
        items.push({
          title,
          summary,
          source: source || 'Industry Update',
          date: date || 'Recent',
          category: category || 'Industry',
        });
      }
    }

    return items.length > 0 ? items.slice(0, 5) : mockNews;
  } catch (e) {
    console.warn("News fetch failed, using mock data", e);
    return mockNews;
  }
};
