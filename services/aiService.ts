import { Billboard, Client } from "../types";
import { logger } from "../utils/logger";

type AIOptions = {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
};

type AIProxyError = Error & {
  status?: number;
  details?: unknown;
};

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

const createAIError = (message: string, status?: number, details?: unknown): AIProxyError => {
  const error = new Error(message) as AIProxyError;
  error.name = 'AIProxyError';
  error.status = status;
  error.details = details;
  return error;
};

const logAIError = (message: string, error: unknown, context: Record<string, unknown> = {}) => {
  logger.warn(message, {
    ...context,
    error,
  });
};

// All AI calls are proxied through /api/ai — the GROQ API key never reaches the browser.
async function callAI(
  messages: Array<{ role: string; content: string }>,
  opts: AIOptions = {}
): Promise<string> {
  const payload = {
    messages,
    model: opts.model || DEFAULT_MODEL,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.max_tokens || 200,
    ...(opts.response_format ? { response_format: opts.response_format } : {}),
  };

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const responseText = await res.text();
    let errorMessage = `AI proxy error ${res.status}`;
    let details: unknown = responseText;

    try {
      const data = JSON.parse(responseText);
      details = data;
      if (data?.error) {
        errorMessage = `AI proxy error ${res.status}: ${data.error}`;
      }
    } catch {
      if (responseText) {
        errorMessage = `${errorMessage}: ${responseText}`;
      }
    }

    throw createAIError(errorMessage, res.status, {
      endpoint: '/api/ai',
      statusText: res.statusText,
      model: payload.model,
      messageCount: messages.length,
      details,
    });
  }

  const data = await res.json();
  return data.content || '';
}

export const generateBillboardDescription = async (billboard: Billboard): Promise<string> => {
  try {
    return await callAI(
      [{ role: 'user', content: `Write a catchy, premium 2-sentence marketing description for a billboard located at ${billboard.location} in ${billboard.town}. The billboard type is ${billboard.type}. Highlight visibility and traffic.` }],
      { temperature: 0.7, max_tokens: 100 }
    );
  } catch (e) {
    logAIError('AI Generation failed', e, { feature: 'generateBillboardDescription', billboardId: billboard.id });
    return `Premium billboard located at ${billboard.location} in ${billboard.town}. High visibility and traffic area.`;
  }
};

export const analyzeBillboardLocation = async (location: string, town: string): Promise<{ visibility: string; dailyTraffic: number; coordinates?: { lat: number; lng: number } }> => {
  try {
    const content = await callAI(
      [{
        role: 'user',
        content: `Analyze the location '${location}' in '${town}', Zimbabwe.
1. Provide a professional 2-sentence assessment of its advertising visibility.
2. Estimate a realistic average daily traffic count (integer).
3. Estimate the Latitude and Longitude coordinates for this location as accurately as possible.

Return ONLY a valid JSON object in this format:
{
  "visibility": "The assessment text...",
  "dailyTraffic": 15000,
  "coordinates": { "lat": -17.82, "lng": 31.05 }
}`,
      }],
      { temperature: 0.3, max_tokens: 200, response_format: { type: 'json_object' } }
    );
    const json = JSON.parse(content || '{}');
    return {
      visibility: json.visibility || 'Prime location with excellent exposure opportunities.',
      dailyTraffic: json.dailyTraffic || 5000,
      coordinates: json.coordinates,
    };
  } catch (e) {
    logAIError('AI Analysis failed', e, { feature: 'analyzeBillboardLocation', location, town });
    return { visibility: 'Strategic location with significant daily impressions.', dailyTraffic: 5000 };
  }
};

export const generateRentalProposal = async (client: Client, billboard: Billboard, cost: number): Promise<string> => {
  try {
    return await callAI(
      [{
        role: 'user',
        content: `Draft a professional, persuasive email proposal to ${client.contactPerson} from ${client.companyName} for renting a billboard at ${billboard.location} (${billboard.town}).
The monthly rate is $${cost}.
Focus on value, visibility, and partnership. Keep it under 100 words.`,
      }],
      { temperature: 0.7, max_tokens: 200 }
    );
  } catch (e) {
    logAIError('AI Proposal failed', e, {
      feature: 'generateRentalProposal',
      clientId: client.id,
      billboardId: billboard.id,
    });
    return `Dear ${client.contactPerson},\n\nWe are pleased to offer you a space at ${billboard.location}. The monthly rate is $${cost}.\n\nBest regards,\nDreambox Advertising`;
  }
};

export const generateGreeting = async (username: string): Promise<string> => {
  try {
    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    return await callAI(
      [{
        role: 'user',
        content: `Generate a short, professional, and motivating greeting for a user named "${username}" logging into an advertising management dashboard.
It is currently ${timeOfDay}. Keep it under 15 words. Don't use quotes.`,
      }],
      { temperature: 0.7, max_tokens: 50 }
    );
  } catch (e) {
    logAIError('AI Greeting failed', e, { feature: 'generateGreeting', username });
    return `Welcome back, ${username}.`;
  }
};

export const analyzeBusinessData = async (dataContext: string): Promise<string> => {
  try {
    return await callAI(
      [{
        role: 'user',
        content: `You are Dreambox AI, a highly intelligent business analyst for a Billboard Advertising company.
Analyze the provided data context and answer the user's specific question.
If the user asks for a summary, provide a concise strategic overview.
If the user asks a specific question (e.g., "How is Harare doing?"), use the data to answer specifically.
Keep the tone professional, encouraging, and data-driven. Keep the answer under 50 words unless asked for more detail.

Data Context: ${dataContext}`,
      }],
      { temperature: 0.7, max_tokens: 150 }
    );
  } catch (e) {
    logAIError('AI Business Analysis failed', e, { feature: 'analyzeBusinessData' });
    return 'Could not generate insights due to network or API limits.';
  }
};

export const fetchIndustryNews = async (): Promise<Array<{ title: string; summary: string; source?: string; date?: string; category?: string }>> => {
  const mockNews = [
    {
      title: 'Harare City Council Reviews Billboard Bylaws',
      summary: "Harare City Council has tabled new zoning regulations targeting digital and static billboards in the Central Business District, citing concerns over light pollution, visual clutter, and road safety hazards near major intersections.\n\nThe proposed bylaws would require all new billboard installations within 500 metres of residential zones to apply for a special use permit and submit a light-impact assessment. Existing operators have been given an 18-month grace period to comply.\n\nIndustry bodies including the Outdoor Advertising Association of Zimbabwe (OAAZ) have welcomed the move as an opportunity to formalise the sector, though smaller operators warn that compliance costs could force consolidation. The council is accepting public submissions until the end of the month.",
      source: 'Local Govt Digest',
      date: '2 days ago',
      category: 'Regulation',
    },
    {
      title: 'Econet Launches Massive OOH Campaign for 5G Rollout',
      summary: "Econet Wireless Zimbabwe has activated one of the largest outdoor advertising campaigns in the company's history, booking over 120 premium billboard sites across Harare, Bulawayo, and key highway corridors to promote its nationwide 5G network launch.\n\nThe campaign, developed in partnership with local creative agency Positive Outcomes, features bold visuals and QR codes linking to live 5G speed-test demos. Campaign spend is estimated at USD 1.8 million over a 90-day run — a record for OOH in the Zimbabwean market.\n\nMedia buyers say the activation signals a broader recovery in advertising expenditure as blue-chip brands return to high-visibility outdoor formats following two years of constrained budgets. Econet's media team indicated a second wave of rural activations is planned for Q2.",
      source: 'TechZim',
      date: '1 week ago',
      category: 'Promo Launch',
    },
    {
      title: 'Solar-Powered Billboards Gain Ground Across Zimbabwe',
      summary: 'Billboard operators are increasingly retrofitting sites with solar panels and battery storage to sidestep the country\'s chronic load-shedding schedule, which has made illuminated advertising unreliable after dark.\n\nDreambox Advertising and several competitors have reported operational cost reductions of 30–45% after switching to solar-hybrid systems on high-traffic LED units. The upfront capital cost — ranging from USD 4,000 to USD 12,000 per site — is typically recovered within 18 months through energy savings and reduced generator fuel costs.\n\nThe trend is drawing interest from international investors, with a South Africa-based infrastructure fund reportedly in talks to finance solar upgrades across 200+ sites in exchange for a revenue-sharing arrangement. Industry analysts say solar adoption could become a baseline requirement for premium inventory by 2027.',
      source: 'Green Energy ZW',
      date: '2 weeks ago',
      category: 'Industry',
    },
    {
      title: 'OK Zimbabwe Activates 60-Site National Festive Campaign',
      summary: "OK Zimbabwe has launched its most geographically broad billboard activation to date, securing 62 sites across all 10 provinces for its festive season promotional drive. The campaign promotes the retailer's 'Unbeatable Value' positioning and features localised messaging in Shona, Ndebele, and English.\n\nThe outdoor component is anchored by five supersites along the Harare-Beitbridge and Harare-Bulawayo corridors, which account for the highest December traffic volumes in the country. Creative executes across both static print and LED digital formats, with the LED units running dynamic pricing and promotional countdowns.\n\nOK Zimbabwe's marketing director said the brand deliberately shifted budget from broadcast radio toward OOH this cycle, citing measurably higher brand recall scores from last year's campaign evaluation. Total outdoor investment for the festive period has not been disclosed but is understood to be the largest in the chain's 60-year history.",
      source: 'AdFocus ZW',
      date: '3 days ago',
      category: 'Promo Launch',
    },
    {
      title: 'DOOH Advertising Spend Grows 28% Across Southern Africa',
      summary: 'Digital Out-of-Home advertising spend across Southern Africa grew 28% year-on-year in the last reported quarter, outpacing all other outdoor formats and closing the gap with online display advertising for the first time, according to a new report by the Out of Home Measurement Council of Southern Africa (OHMCSA).\n\nZimbabwe recorded the highest growth rate in the region at 41%, driven by new LED inventory entering the market in Harare\'s Avenues and Borrowdale commercial corridors. South Africa and Zambia followed at 33% and 27% respectively.\n\nThe report attributes the surge to brands seeking cost-effective reach as social media CPMs climb and ad-blocking adoption rises. Programmatic DOOH — allowing real-time audience targeting and dayparting — now accounts for 19% of regional DOOH bookings, up from just 6% two years ago. Analysts forecast the format will account for over half of DOOH revenue by 2028.',
      source: 'OHMCSA Media Report',
      date: '1 week ago',
      category: 'Industry',
    },
  ];

  try {
    const content = await callAI(
      [{
        role: 'user',
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
SUMMARY: [Write 2 concise paragraphs. Each paragraph should be 2 sentences. Cover: (1) what happened and the key facts, (2) why it matters and what happens next. Do NOT use bullet points or markdown.]
ENDITEM

Repeat exactly this format for all 5 items.`,
      }],
      { temperature: 0.65, max_tokens: 1200 }
    );

    const items: Array<{ title: string; summary: string; source?: string; date?: string; category?: string }> = [];
    const rawItems = content.split(/\bITEM\b/);
    for (const raw of rawItems) {
      if (!raw.trim()) continue;
      const title = raw.match(/TITLE:\s*(.+)/i)?.[1]?.trim();
      const date = raw.match(/DATE:\s*(.+)/i)?.[1]?.trim();
      const source = raw.match(/SOURCE:\s*(.+)/i)?.[1]?.trim();
      const category = raw.match(/CATEGORY:\s*(.+)/i)?.[1]?.trim();
      const summaryMatch = raw.match(/SUMMARY:\s*([\s\S]+?)(?=\nENDITEM|\bENDITEM|$)/i);
      const summary = summaryMatch?.[1]?.trim();
      if (title && summary) {
        items.push({ title, summary, source: source || 'Industry Update', date: date || 'Recent', category: category || 'Industry' });
      }
    }
    return items.length > 0 ? items.slice(0, 5) : mockNews;
  } catch (e) {
    logAIError('News fetch failed, using mock data', e, { feature: 'fetchIndustryNews' });
    return mockNews;
  }
};
