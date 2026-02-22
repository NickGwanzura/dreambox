
import { GoogleGenAI } from "@google/genai";
import { Billboard, Client } from "../types";

declare var process: any;

// Safe access to API Key for browser environments
const getApiKey = () => {
  try {
    // Check if process exists (Node/Polyfill) and has env
    if (typeof process !== 'undefined' && process.env && process.env.API_KEY) {
      return process.env.API_KEY;
    }
  } catch (e) {
    // Ignore error if process is not defined
  }
  return '';
};

const apiKey = getApiKey();
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const generateBillboardDescription = async (billboard: Billboard): Promise<string> => {
  if (!ai) return `Premium billboard located at ${billboard.location} in ${billboard.town}. High visibility and traffic area.`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Write a catchy, premium 2-sentence marketing description for a billboard located at ${billboard.location} in ${billboard.town}. The billboard type is ${billboard.type}. Highlight visibility and traffic.`,
    });
    return response.text || "High visibility location perfect for your brand.";
  } catch (e) {
    console.warn("AI Generation failed:", e);
    return "Premium advertising space available in high-traffic area.";
  }
};

export const analyzeBillboardLocation = async (location: string, town: string): Promise<{ visibility: string, dailyTraffic: number, coordinates?: { lat: number, lng: number } }> => {
    if (!ai) return { visibility: "High visibility potential in a key strategic area.", dailyTraffic: 5000 };

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Analyze the location '${location}' in '${town}', Zimbabwe. 
            1. Provide a professional 2-sentence assessment of its advertising visibility.
            2. Estimate a realistic average daily traffic count (integer).
            3. Estimate the Latitude and Longitude coordinates for this location as accurately as possible.
            
            Return ONLY a valid JSON object in this format:
            { 
              "visibility": "The assessment text...", 
              "dailyTraffic": 15000,
              "coordinates": { "lat": -17.82, "lng": 31.05 }
            }`,
            config: { responseMimeType: 'application/json' }
        });
        
        const json = JSON.parse(response.text || '{}');
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
  if (!ai) return `Dear ${client.contactPerson},\n\nWe are pleased to offer you a space at ${billboard.location}. The monthly rate is $${cost}.\n\nBest regards,\nDreambox Advertising`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Draft a professional, persuasive email proposal to ${client.contactPerson} from ${client.companyName} for renting a billboard at ${billboard.location} (${billboard.town}). 
        The monthly rate is $${cost}. 
        Focus on value, visibility, and partnership. Keep it under 100 words.`,
    });
    return response.text || "Proposal generation failed.";
  } catch (e) {
    console.warn("AI Proposal failed:", e);
    return "Error generating proposal. Please try again later.";
  }
};

export const generateGreeting = async (username: string): Promise<string> => {
    if (!ai) return `Welcome back, ${username}. Ready to manage your fleet?`;
    
    try {
        const hour = new Date().getHours();
        const timeOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Generate a short, professional, and motivating greeting for a user named "${username}" logging into an advertising management dashboard. 
            It is currently ${timeOfDay}. Keep it under 15 words. Don't use quotes.`,
        });
        return response.text || `Good ${timeOfDay}, ${username}. Let's get to work.`;
    } catch (e) {
        return `Welcome back, ${username}.`;
    }
};

export const analyzeBusinessData = async (dataContext: string): Promise<string> => {
    if (!ai) return "AI Analysis unavailable. Please check your API Key configuration.";

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `You are Dreambox AI, a highly intelligent business analyst for a Billboard Advertising company. 
            Analyze the provided data context and answer the user's specific question. 
            If the user asks for a summary, provide a concise strategic overview.
            If the user asks a specific question (e.g., "How is Harare doing?"), use the data to answer specifically.
            Keep the tone professional, encouraging, and data-driven. Keep the answer under 50 words unless asked for more detail.
            
            Data Context: ${dataContext}`,
        });
        return response.text || "I couldn't analyze the data at this moment.";
    } catch (e) {
        return "Could not generate insights due to network or API limits.";
    }
}

export const fetchIndustryNews = async (): Promise<Array<{ title: string; summary: string; source?: string; date?: string }>> => {
    // Fallback Mock Data
    const mockNews = [
        { title: "Harare City Council Reviews Billboard Bylaws", summary: "New zoning regulations proposed for digital billboards in the CBD to reduce light pollution.", source: "Local Govt", date: "2 days ago" },
        { title: "Econet Launches Massive OOH Campaign", summary: "Telecommunications giant dominates skyline with new 5G rollout advertisements across major highways.", source: "TechZim", date: "1 week ago" },
        { title: "Solar-Powered Billboards Trend Rising", summary: "Operators switching to renewable energy to combat load shedding and reduce operational costs.", source: "Green Energy ZW", date: "2 weeks ago" }
    ];

    if (!ai) return mockNews;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Find 3 recent news items, developments, or trends regarding Billboard Advertising, Outdoor Media, or Marketing in Zimbabwe.
            
            Return the output in this specific plain text format for easy parsing (do not use markdown formatting like ** or *):
            
            ITEM
            TITLE: [Insert Title Here]
            DATE: [Insert Relative Date, e.g., 2 days ago]
            SOURCE: [Insert Source Name]
            SUMMARY: [Insert short summary]
            ENDITEM
            
            Repeat for 3 items.`,
            config: {
                tools: [{googleSearch: {}}],
            }
        });

        const text = response.text || '';
        const items: Array<{ title: string; summary: string; source?: string; date?: string }> = [];
        
        const rawItems = text.split('ITEM');
        for (const raw of rawItems) {
            if (!raw.trim()) continue;
            
            const title = raw.match(/TITLE:\s*(.+)/i)?.[1]?.trim();
            const date = raw.match(/DATE:\s*(.+)/i)?.[1]?.trim();
            const source = raw.match(/SOURCE:\s*(.+)/i)?.[1]?.trim();
            const summary = raw.match(/SUMMARY:\s*(.+)/i)?.[1]?.trim();

            if (title && summary) {
                items.push({ 
                    title, 
                    summary, 
                    source: source || 'Industry Update', 
                    date: date || 'Recent' 
                });
            }
        }

        return items.length > 0 ? items.slice(0, 3) : mockNews;
    } catch (e) {
        console.warn("News fetch failed, using mock data", e);
        return mockNews;
    }
};
