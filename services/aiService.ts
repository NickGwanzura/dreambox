
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
  // Fallback Mock Data — full-length articles
  const mockNews = [
    {
      title: "Harare City Council Reviews Billboard Bylaws",
      summary: "Harare City Council has tabled new zoning regulations targeting digital and static billboards in the Central Business District, citing concerns over light pollution, visual clutter, and road safety hazards near major intersections.\n\nThe proposed bylaws would require all new billboard installations within 500 metres of residential zones to apply for a special use permit and submit a light-impact assessment. Existing operators have been given an 18-month grace period to comply.\n\nIndustry bodies including the Outdoor Advertising Association of Zimbabwe (OAAZ) have welcomed the move as an opportunity to formalise the sector, though smaller operators warn that compliance costs could force consolidation. The council is accepting public submissions until the end of the month.",
      source: "Local Govt Digest",
      date: "2 days ago",
      category: "Regulation"
    },
    {
      title: "Econet Launches Massive OOH Campaign for 5G Rollout",
      summary: "Econet Wireless Zimbabwe has activated one of the largest outdoor advertising campaigns in the company's history, booking over 120 premium billboard sites across Harare, Bulawayo, and key highway corridors to promote its nationwide 5G network launch.\n\nThe campaign, developed in partnership with local creative agency Positive Outcomes, features bold visuals and QR codes linking to live 5G speed-test demos. Campaign spend is estimated at USD 1.8 million over a 90-day run — a record for OOH in the Zimbabwean market.\n\nMedia buyers say the activation signals a broader recovery in advertising expenditure as blue-chip brands return to high-visibility outdoor formats following two years of constrained budgets. Econet's media team indicated a second wave of rural activations is planned for Q2.",
      source: "TechZim",
      date: "1 week ago",
      category: "Promo Launch"
    },
    {
      title: "Solar-Powered Billboards Gain Ground Across Zimbabwe",
      summary: "Billboard operators are increasingly retrofitting sites with solar panels and battery storage to sidestep the country's chronic load-shedding schedule, which has made illuminated advertising unreliable after dark.\n\nDreambox Advertising and several competitors have reported operational cost reductions of 30–45% after switching to solar-hybrid systems on high-traffic LED units. The upfront capital cost — ranging from USD 4,000 to USD 12,000 per site — is typically recovered within 18 months through energy savings and reduced generator fuel costs.\n\nThe trend is drawing interest from international investors, with a South Africa-based infrastructure fund reportedly in talks to finance solar upgrades across 200+ sites in exchange for a revenue-sharing arrangement. Industry analysts say solar adoption could become a baseline requirement for premium inventory by 2027.",
      source: "Green Energy ZW",
      date: "2 weeks ago",
      category: "Industry"
    },
    {
      title: "OK Zimbabwe Activates 60-Site National Festive Campaign",
      summary: "OK Zimbabwe has launched its most geographically broad billboard activation to date, securing 62 sites across all 10 provinces for its festive season promotional drive. The campaign promotes the retailer's 'Unbeatable Value' positioning and features localised messaging in Shona, Ndebele, and English.\n\nThe outdoor component is anchored by five supersites along the Harare-Beitbridge and Harare-Bulawayo corridors, which account for the highest December traffic volumes in the country. Creative executes across both static print and LED digital formats, with the LED units running dynamic pricing and promotional countdowns.\n\nOK Zimbabwe's marketing director said the brand deliberately shifted budget from broadcast radio toward OOH this cycle, citing measurably higher brand recall scores from last year's campaign evaluation. Total outdoor investment for the festive period has not been disclosed but is understood to be the largest in the chain's 60-year history.",
      source: "AdFocus ZW",
      date: "3 days ago",
      category: "Promo Launch"
    },
    {
      title: "DOOH Advertising Spend Grows 28% Across Southern Africa",
      summary: "Digital Out-of-Home advertising spend across Southern Africa grew 28% year-on-year in the last reported quarter, outpacing all other outdoor formats and closing the gap with online display advertising for the first time, according to a new report by the Out of Home Measurement Council of Southern Africa (OHMCSA).\n\nZimbabwe recorded the highest growth rate in the region at 41%, driven by new LED inventory entering the market in Harare's Avenues and Borrowdale commercial corridors. South Africa and Zambia followed at 33% and 27% respectively.\n\nThe report attributes the surge to brands seeking cost-effective reach as social media CPMs climb and ad-blocking adoption rises. Programmatic DOOH — allowing real-time audience targeting and dayparting — now accounts for 19% of regional DOOH bookings, up from just 6% two years ago. Analysts forecast the format will account for over half of DOOH revenue by 2028.",
      source: "OHMCSA Media Report",
      date: "1 week ago",
      category: "Industry"
    },
  ];

  if (!groq) return mockNews;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "user",
          content: `Generate 5 realistic, detailed news articles covering:
- Billboard/Outdoor advertising industry news in Zimbabwe and Southern Africa
- Major companies launching advertising campaigns or promos on billboards (retail, telco, FMCG, banking)
- OOH industry trends, new technology, or regulatory changes

Return ONLY in this exact plain text format (no markdown, no asterisks, no bullet points):

ITEM
TITLE: [Compelling news headline]
DATE: [e.g. 2 days ago / 1 week ago]
SOURCE: [Realistic publication name]
CATEGORY: [one of: Promo Launch, Industry, Regulation, Technology]
SUMMARY: [Write a full 3-paragraph article. Each paragraph is 2-3 sentences. Cover: (1) what happened and context, (2) key details/numbers/quotes, (3) industry implications or what happens next. Do NOT use bullet points or line breaks within the summary — write it as flowing prose paragraphs separated by a blank line.]
ENDITEM

Repeat exactly this format for all 5 items.`
        }
      ],
      model: "llama-3.1-70b-versatile",
      temperature: 0.65,
      max_tokens: 2500,
    });

    const text = chatCompletion.choices[0]?.message?.content || '';
    const items: Array<{ title: string; summary: string; source?: string; date?: string; category?: string }> = [];

    // Split on ITEM boundaries, handling both "ITEM\n" and "\nITEM"
    const rawItems = text.split(/\bITEM\b/);
    for (const raw of rawItems) {
      if (!raw.trim()) continue;

      const title = raw.match(/TITLE:\s*(.+)/i)?.[1]?.trim();
      const date = raw.match(/DATE:\s*(.+)/i)?.[1]?.trim();
      const source = raw.match(/SOURCE:\s*(.+)/i)?.[1]?.trim();
      const category = raw.match(/CATEGORY:\s*(.+)/i)?.[1]?.trim();

      // Capture everything from SUMMARY: until ENDITEM (multi-line aware)
      const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]+?)(?=\nENDITEM|\bENDITEM|$)/i);
      const summary = summaryMatch?.[1]?.trim();

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
