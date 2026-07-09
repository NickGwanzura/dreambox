import { Billboard, Client, Task, Contract } from "../types";
import { getToken } from "./apiClient";
import { logger } from "../utils/logger";

type AIOptions = {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string };
  provider?: 'groq' | 'deepseek';
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
    ...(opts.provider ? { provider: opts.provider } : {}),
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Abort if the server takes longer than 15s — prevents UI from hanging when
  // Groq is slow or Railway cold-starting.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);

  let res: Response;
  try {
    res = await fetch('/api/ai', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

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

export const estimateDailyViews = async (billboard: Billboard): Promise<{ dailyTraffic: number; description: string }> => {
  try {
    const locationInfo = [
      'Location: ' + billboard.location + ', ' + billboard.town + ', Zimbabwe',
      'Type: ' + billboard.type,
      'Dimensions: ' + billboard.width + 'x' + billboard.height + 'm',
      billboard.dailyTraffic ? 'Current estimate: ' + billboard.dailyTraffic + ' daily views' : 'No current traffic data',
    ].join('\n');

    const content = await callAI(
      [{
        role: 'user',
        content: 'You are a traffic analyst for Dreambox Advertising in Zimbabwe. Estimate daily views for this billboard.\n\n' +
          locationInfo + '\n\n' +
          'Consider: road classification (highway/arterial/urban), population density of the town/city, typical traffic patterns, pedestrian flow, and commercial activity.\n\n' +
          'Return ONLY a valid JSON object with:\n' +
          '{\n' +
          '  "dailyTraffic": <integer between 500 and 50000>,\n' +
          '  "description": "<one sentence explaining the estimate based on location factors>"\n' +
          '}',
      }],
      { temperature: 0.3, max_tokens: 150, response_format: { type: 'json_object' } }
    );
    const json = JSON.parse(content || '{}');
    return {
      dailyTraffic: json.dailyTraffic || billboard.dailyTraffic || 5000,
      description: json.description || 'Estimated based on location and traffic patterns.',
    };
  } catch (e) {
    logAIError('Daily view estimation failed', e, { feature: 'estimateDailyViews', billboardId: billboard.id });
    return {
      dailyTraffic: billboard.dailyTraffic || 5000,
      description: 'Average estimated daily views based on location.',
    };
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

export const generateRentalPackageProposal = async (
  client: Client,
  placements: Array<{ billboard: Billboard; details: string; monthlyRate: number }>
): Promise<string> => {
  const totalMonthly = placements.reduce((sum, item) => sum + (item.monthlyRate || 0), 0);
  const placementSummary = placements
    .map(item => `- ${item.billboard.name}: ${item.details} at ${item.billboard.location}, ${item.billboard.town} ($${item.monthlyRate}/mo)`)
    .join('\n');

  try {
    return await callAI(
      [{
        role: 'user',
        content: `Draft a professional, persuasive email proposal to ${client.contactPerson} from ${client.companyName} for a multi-site billboard advertising package.
Placements:
${placementSummary}

Total monthly package rate: $${totalMonthly}.
Focus on reach, visibility across multiple locations, and partnership. Keep it under 130 words.`,
      }],
      { temperature: 0.7, max_tokens: 240 }
    );
  } catch (e) {
    logAIError('AI Package Proposal failed', e, {
      feature: 'generateRentalPackageProposal',
      clientId: client.id,
      billboardIds: placements.map(item => item.billboard.id),
    });
    return `Dear ${client.contactPerson},\n\nWe are pleased to offer ${client.companyName} a multi-site billboard package covering ${placements.map(item => item.billboard.location).join(', ')}. The total monthly package rate is $${totalMonthly}.\n\nBest regards,\nDreambox Advertising`;
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
      { temperature: 0.65, max_tokens: 2000 }
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

export type DailyBriefingContext = {
  user: { firstName: string; email: string; role: string };
  myTasks: Pick<Task, 'title' | 'priority' | 'status' | 'dueDate'>[];
  expiringContracts: Pick<Contract, 'id' | 'details' | 'endDate' | 'billboardId'>[];
  overdueInvoiceCount: number;
  upcomingBillingCount: number;
  totalActiveContracts: number;
};

export type DailyBriefingResult = {
  text: string;
  actions: string[];
};

export const generateDailyBriefing = async (ctx: DailyBriefingContext): Promise<DailyBriefingResult> => {
  const today = new Date().toISOString().split('T')[0];
  const todayTs = Date.now();

  const overdueTasks = ctx.myTasks.filter(t => t.status !== 'Done' && t.dueDate < today);
  const dueTodayTasks = ctx.myTasks.filter(t => t.status !== 'Done' && t.dueDate === today);
  const upcomingTasks = ctx.myTasks.filter(t => t.status !== 'Done' && t.dueDate > today);

  const taskLines = [
    ...overdueTasks.map(t => `OVERDUE: "${t.title}" (${t.priority} priority, was due ${t.dueDate})`),
    ...dueTodayTasks.map(t => `DUE TODAY: "${t.title}" (${t.priority} priority)`),
    ...upcomingTasks.slice(0, 3).map(t => `UPCOMING: "${t.title}" (due ${t.dueDate})`),
  ];

  const contractLines = ctx.expiringContracts.map(c => {
    const daysLeft = Math.ceil((new Date(c.endDate).getTime() - todayTs) / 86_400_000);
    return `Contract ${c.id} (${c.details}) expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} on ${c.endDate}`;
  });

  const contextBlock = [
    `User: ${ctx.user.firstName} | Role: ${ctx.user.role}`,
    `Today: ${today}`,
    '',
    taskLines.length > 0 ? `Tasks:\n${taskLines.join('\n')}` : 'Tasks: None assigned',
    '',
    contractLines.length > 0 ? `Expiring contracts (within 30 days):\n${contractLines.join('\n')}` : 'No contracts expiring soon',
    '',
    `System: ${ctx.overdueInvoiceCount} overdue invoice(s), ${ctx.upcomingBillingCount} billing(s) due this week, ${ctx.totalActiveContracts} active contracts total`,
  ].join('\n');

  const fallbackText = overdueTasks.length > 0
    ? `${ctx.user.firstName}, you have ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} and ${ctx.expiringContracts.length} contract${ctx.expiringContracts.length !== 1 ? 's' : ''} expiring soon. Review your task list and follow up on renewals today.`
    : ctx.expiringContracts.length > 0
      ? `${ctx.user.firstName}, ${ctx.expiringContracts.length} contract${ctx.expiringContracts.length !== 1 ? 's are' : ' is'} expiring within 30 days. Reach out to those clients about renewals.`
      : `${ctx.user.firstName}, everything looks on track today. Keep an eye on upcoming tasks and contract renewals.`;

  const fallbackActions: string[] = [
    ...overdueTasks.map(t => `Complete overdue task: "${t.title}"`),
    ...dueTodayTasks.map(t => `Complete task due today: "${t.title}"`),
    ...(ctx.expiringContracts.length > 0 ? [`Follow up on ${ctx.expiringContracts.length} expiring contract${ctx.expiringContracts.length !== 1 ? 's' : ''}`] : []),
    ...(ctx.overdueInvoiceCount > 0 ? [`Collect ${ctx.overdueInvoiceCount} overdue invoice${ctx.overdueInvoiceCount !== 1 ? 's' : ''}`] : []),
  ].slice(0, 4);

  const fallback: DailyBriefingResult = { text: fallbackText, actions: fallbackActions };

  try {
    const raw = await callAI(
      [
        {
          role: 'system',
          content: `You are a concise daily briefing assistant for Dreambox Advertising, a billboard advertising company in Zimbabwe.
Give each staff member a short, personal, actionable morning briefing based on their data.
Return ONLY a valid JSON object with exactly this shape:
{
  "text": "2–3 sentences of natural prose addressing the user by first name. Prioritise overdue items. Be specific and encouraging.",
  "actions": ["Action item 1", "Action item 2", "Action item 3"]
}
actions must be 2–4 specific, concrete tasks ordered by urgency. Start each with a verb. No bullet points inside the strings.`,
        },
        {
          role: 'user',
          content: `Generate my daily briefing based on this data:\n\n${contextBlock}`,
        },
      ],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.6, max_tokens: 280, response_format: { type: 'json_object' } }
    );
    const parsed = JSON.parse(raw);
    return {
      text: typeof parsed.text === 'string' && parsed.text ? parsed.text : fallbackText,
      actions: Array.isArray(parsed.actions) ? parsed.actions.filter((a: unknown) => typeof a === 'string').slice(0, 5) : fallbackActions,
    };
  } catch (e) {
    logAIError('Daily briefing failed', e, { feature: 'generateDailyBriefing', user: ctx.user.email });
    return fallback;
  }
};

export type BIAnalysisContext = {
  totalMRR: number;
  occupancyPct: number;
  expiring30Count: number;
  atRiskClientCount: number;
  overdueInvoiceCount: number;
  overdueAmount: number;
  vacantBoardCount: number;
  totalBoards: number;
  conversionRate: number;
  pipelineValue: number;
  topRecommendations: Array<{ priority: string; title: string }>;
  estNetProfit: number;
  expenseRatio: number;
};

export const generateBIAnalysis = async (ctx: BIAnalysisContext): Promise<string> => {
  const contextBlock = [
    `Monthly Recurring Revenue: $${ctx.totalMRR.toLocaleString()}`,
    `Estimated Net Profit: $${ctx.estNetProfit.toLocaleString()} (expense ratio ${ctx.expenseRatio}%)`,
    `Portfolio Occupancy: ${ctx.occupancyPct}% (${ctx.vacantBoardCount} of ${ctx.totalBoards} boards vacant)`,
    `Contracts expiring in 30 days: ${ctx.expiring30Count}`,
    `At-risk client accounts: ${ctx.atRiskClientCount}`,
    `Overdue invoices: ${ctx.overdueInvoiceCount} (${ctx.overdueAmount > 0 ? `$${ctx.overdueAmount.toLocaleString()} outstanding` : '$0'})`,
    `Sales pipeline value: $${ctx.pipelineValue.toLocaleString()}`,
    `Quote-to-payment conversion rate: ${ctx.conversionRate}%`,
    ctx.topRecommendations.length > 0
      ? `Top issues flagged:\n${ctx.topRecommendations.slice(0, 5).map(r => `  [${r.priority.toUpperCase()}] ${r.title}`).join('\n')}`
      : 'No issues flagged',
  ].join('\n');

  try {
    return await callAI(
      [
        {
          role: 'system',
          content: `You are a senior business strategist for Dreambox Advertising, a billboard advertising company in Zimbabwe.
Analyse the provided business metrics and deliver a sharp, honest 3–4 sentence strategic assessment.
Cover: (1) the most pressing risk, (2) the biggest revenue opportunity right now, (3) one specific action to take this week.
Be direct, data-specific, and commercial. No fluff. No bullet points. Write as flowing prose.`,
        },
        {
          role: 'user',
          content: `Analyse these metrics and give me a strategic assessment:\n\n${contextBlock}`,
        },
      ],
      { provider: 'deepseek', model: 'deepseek-chat', temperature: 0.5, max_tokens: 200 }
    );
  } catch (e) {
    logAIError('BI analysis failed', e, { feature: 'generateBIAnalysis' });
    return '';
  }
};
