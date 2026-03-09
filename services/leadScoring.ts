/**
 * AI Lead Qualification Scoring Engine
 * 
 * Scores leads based on:
 * - Company Fit (industry, size, presence)
 * - Deal Potential (budget, duration, location alignment)
 * - Engagement (email opens, call connects, responses)
 * - Intent Signals (proposal requests, site visits)
 * - Recency & Velocity (response time, activity frequency)
 */

import {
  CRMOpportunity,
  CRMCompany,
  CRMContact,
  CRMTouchpoint,
  TouchpointType,
  TouchpointOutcome,
  TouchpointSentiment,
  OpportunityStage,
  OpportunityStatus,
} from '../types';
import {
  getCRMOpportunities,
  getCRMCompanyById,
  getCRMContactById,
  getTouchpointsByOpportunity,
  getCRMTasks,
} from './crmService';

// ==========================================
// SCORING CONFIGURATION
// ==========================================

export interface ScoringWeights {
  companyFit: number;      // 25% - Industry match, company quality
  dealPotential: number;   // 25% - Budget size, deal value
  engagement: number;      // 25% - Response rate, interaction quality
  intentSignals: number;   // 15% - Buying signals, urgency indicators
  recency: number;         // 10% - Last activity, velocity
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  companyFit: 0.25,
  dealPotential: 0.25,
  engagement: 0.25,
  intentSignals: 0.15,
  recency: 0.10,
};

// High-value industries for billboard advertising
const HIGH_VALUE_INDUSTRIES = [
  'automotive', 'real estate', 'retail', 'telecommunications',
  'banking', 'finance', 'insurance', 'beverages', 'alcohol',
  'entertainment', 'media', 'hospitality', 'tourism', 'fashion',
  'consumer goods', 'electronics', 'technology', 'healthcare',
];

// Medium-value industries
const MEDIUM_VALUE_INDUSTRIES = [
  'construction', 'manufacturing', 'logistics', 'transportation',
  'education', 'professional services', 'consulting', 'legal',
  'accounting', 'marketing', 'advertising',
];

// ==========================================
// LEAD SCORE TYPES
// ==========================================

export type LeadQuality = 'hot' | 'warm' | 'cold' | 'dead';

export interface LeadScore {
  opportunityId: string;
  totalScore: number;           // 0-100
  quality: LeadQuality;
  confidence: number;           // 0-1 (scoring confidence)
  
  // Breakdown
  factors: {
    companyFit: number;         // 0-25
    dealPotential: number;      // 0-25
    engagement: number;         // 0-25
    intentSignals: number;      // 0-15
    recency: number;            // 0-10
  };
  
  // Insights
  insights: LeadInsight[];
  
  // Recommendations
  recommendations: LeadRecommendation[];
  
  // Metadata
  calculatedAt: string;
  version: string;
}

export interface LeadInsight {
  type: 'positive' | 'negative' | 'neutral' | 'warning' | 'opportunity';
  category: string;
  message: string;
  impact: number;               // Score impact (-10 to +10)
}

export interface LeadRecommendation {
  priority: 'critical' | 'high' | 'medium' | 'low';
  action: string;
  description: string;
  expectedImpact: string;
  autoTrigger?: boolean;        // Can be auto-executed
}

export interface LeadScoreHistory {
  opportunityId: string;
  scores: Array<{
    score: number;
    quality: LeadQuality;
    date: string;
    triggerEvent: string;
  }>;
}

// ==========================================
// SCORING ENGINE
// ==========================================

export const calculateLeadScore = (
  opportunity: CRMOpportunity,
  company?: CRMCompany,
  primaryContact?: CRMContact,
  touchpoints?: CRMTouchpoint[],
  weights: ScoringWeights = DEFAULT_WEIGHTS
): LeadScore => {
  const now = new Date();
  const insights: LeadInsight[] = [];
  const recommendations: LeadRecommendation[] = [];
  
  // Fetch related data if not provided
  const oppCompany = company || getCRMCompanyById(opportunity.companyId);
  const oppContact = primaryContact || getCRMContactById(opportunity.primaryContactId);
  const oppTouchpoints = touchpoints || getTouchpointsByOpportunity(opportunity.id);
  
  // Calculate individual factors
  const companyFitScore = calculateCompanyFit(opportunity, oppCompany, oppContact, insights, recommendations);
  const dealPotentialScore = calculateDealPotential(opportunity, insights, recommendations);
  const engagementScore = calculateEngagement(opportunity, oppTouchpoints, insights, recommendations);
  const intentScore = calculateIntentSignals(opportunity, oppTouchpoints, insights, recommendations);
  const recencyScore = calculateRecency(opportunity, oppTouchpoints, insights, recommendations);
  
  // Weighted total
  const totalScore = Math.round(
    companyFitScore * weights.companyFit +
    dealPotentialScore * weights.dealPotential +
    engagementScore * weights.engagement +
    intentScore * weights.intentSignals +
    recencyScore * weights.recency
  );
  
  // Determine quality tier
  const quality = determineQualityTier(totalScore, opportunity.status);
  
  // Calculate confidence based on data completeness
  const confidence = calculateConfidence(opportunity, oppCompany, oppContact, oppTouchpoints);
  
  // Generate AI insights based on patterns
  generateAIInsights(opportunity, oppTouchpoints, insights, totalScore);
  
  return {
    opportunityId: opportunity.id,
    totalScore: Math.min(100, Math.max(0, totalScore)),
    quality,
    confidence,
    factors: {
      companyFit: Math.round(companyFitScore * weights.companyFit),
      dealPotential: Math.round(dealPotentialScore * weights.dealPotential),
      engagement: Math.round(engagementScore * weights.engagement),
      intentSignals: Math.round(intentScore * weights.intentSignals),
      recency: Math.round(recencyScore * weights.recency),
    },
    insights,
    recommendations: recommendations.slice(0, 5), // Top 5 recommendations
    calculatedAt: now.toISOString(),
    version: '2.0',
  };
};

// ==========================================
// FACTOR CALCULATIONS
// ==========================================

const calculateCompanyFit = (
  opportunity: CRMOpportunity,
  company?: CRMCompany,
  contact?: CRMContact,
  insights?: LeadInsight[],
  recommendations?: LeadRecommendation[]
): number => {
  let score = 50; // Base score
  
  // Industry scoring
  if (company?.industry) {
    const industry = company.industry.toLowerCase();
    
    if (HIGH_VALUE_INDUSTRIES.some(i => industry.includes(i))) {
      score += 20;
      insights?.push({
        type: 'positive',
        category: 'Industry',
        message: `High-value industry: ${company.industry}`,
        impact: 5,
      });
    } else if (MEDIUM_VALUE_INDUSTRIES.some(i => industry.includes(i))) {
      score += 10;
      insights?.push({
        type: 'neutral',
        category: 'Industry',
        message: `Medium-value industry: ${company.industry}`,
        impact: 2,
      });
    } else {
      insights?.push({
        type: 'neutral',
        category: 'Industry',
        message: `Industry: ${company.industry}`,
        impact: 0,
      });
    }
  } else {
    score -= 10;
    recommendations?.push({
      priority: 'medium',
      action: 'Research company industry',
      description: 'Add industry information to better assess company fit',
      expectedImpact: '+5 to +15 points',
    });
  }
  
  // Website quality indicator
  if (company?.website) {
    score += 5;
    insights?.push({
      type: 'positive',
      category: 'Digital Presence',
      message: 'Company has established website',
      impact: 2,
    });
  }
  
  // Contact completeness
  if (contact) {
    if (contact.email && contact.phone) {
      score += 10;
      insights?.push({
        type: 'positive',
        category: 'Contact Quality',
        message: 'Complete contact information available',
        impact: 3,
      });
    } else if (contact.email || contact.phone) {
      score += 5;
      recommendations?.push({
        priority: 'low',
        action: 'Complete contact details',
        description: `Add ${contact.phone ? 'email address' : 'phone number'} for ${contact.fullName}`,
        expectedImpact: '+3 points',
      });
    }
    
    // LinkedIn presence
    if (contact.linkedinUrl) {
      score += 5;
      insights?.push({
        type: 'positive',
        category: 'Contact Quality',
        message: 'LinkedIn profile available for outreach',
        impact: 2,
      });
    }
    
    // Job title relevance
    if (contact.jobTitle) {
      const title = contact.jobTitle.toLowerCase();
      if (title.includes('marketing') || title.includes('brand') || title.includes('cmo')) {
        score += 10;
        insights?.push({
          type: 'positive',
          category: 'Decision Maker',
          message: `Marketing decision maker: ${contact.jobTitle}`,
          impact: 5,
        });
      } else if (title.includes('director') || title.includes('manager') || title.includes('head')) {
        score += 5;
        insights?.push({
          type: 'positive',
          category: 'Decision Maker',
          message: `Senior position: ${contact.jobTitle}`,
          impact: 3,
        });
      }
    }
  }
  
  return Math.min(100, score);
};

const calculateDealPotential = (
  opportunity: CRMOpportunity,
  insights?: LeadInsight[],
  recommendations?: LeadRecommendation[]
): number => {
  let score = 40; // Base score
  
  // Deal value scoring
  if (opportunity.estimatedValue) {
    const value = opportunity.estimatedValue;
    
    if (value >= 50000) {
      score += 30;
      insights?.push({
        type: 'positive',
        category: 'Deal Value',
        message: `High-value deal: $${value.toLocaleString()}`,
        impact: 8,
      });
    } else if (value >= 20000) {
      score += 20;
      insights?.push({
        type: 'positive',
        category: 'Deal Value',
        message: `Good deal value: $${value.toLocaleString()}`,
        impact: 5,
      });
    } else if (value >= 5000) {
      score += 10;
      insights?.push({
        type: 'neutral',
        category: 'Deal Value',
        message: `Moderate deal value: $${value.toLocaleString()}`,
        impact: 2,
      });
    } else {
      score += 5;
    }
  } else {
    recommendations?.push({
      priority: 'high',
      action: 'Qualify budget',
      description: 'No estimated deal value set - request budget information',
      expectedImpact: '+10 to +20 points',
    });
  }
  
  // Campaign duration
  if (opportunity.campaignDuration) {
    const duration = opportunity.campaignDuration.toLowerCase();
    
    if (duration.includes('12') || duration.includes('year')) {
      score += 15;
      insights?.push({
        type: 'positive',
        category: 'Campaign Duration',
        message: 'Long-term campaign commitment indicated',
        impact: 5,
      });
    } else if (duration.includes('6')) {
      score += 10;
      insights?.push({
        type: 'positive',
        category: 'Campaign Duration',
        message: '6+ month campaign duration',
        impact: 3,
      });
    } else if (duration.includes('3')) {
      score += 5;
    }
  }
  
  // Billboard type specificity
  if (opportunity.billboardType) {
    score += 5;
    insights?.push({
      type: 'positive',
      category: 'Product Interest',
      message: `Specific interest: ${opportunity.billboardType}`,
      impact: 2,
    });
  }
  
  // Location interest
  if (opportunity.locationInterest) {
    score += 5;
    insights?.push({
      type: 'positive',
      category: 'Location',
      message: `Target location: ${opportunity.locationInterest}`,
      impact: 2,
    });
  }
  
  // Pipeline stage progression bonus
  const stageScores: Record<OpportunityStage, number> = {
    new_lead: 0,
    initial_contact: 5,
    discovery_call: 10,
    site_survey: 20,
    proposal_sent: 25,
    negotiation: 30,
    contract_pending: 35,
    closed_won: 0, // Already won
    closed_lost: 0, // Already lost
    nurture: 0,
  };
  
  score += stageScores[opportunity.stage] || 0;
  
  if (opportunity.stage === 'proposal_sent') {
    insights?.push({
      type: 'positive',
      category: 'Pipeline Progress',
      message: 'Proposal sent - strong buying signal',
      impact: 5,
    });
  }
  
  return Math.min(100, score);
};

const calculateEngagement = (
  opportunity: CRMOpportunity,
  touchpoints: CRMTouchpoint[],
  insights?: LeadInsight[],
  recommendations?: LeadRecommendation[]
): number => {
  let score = 30; // Base score
  
  if (touchpoints.length === 0) {
    recommendations?.push({
      priority: 'critical',
      action: 'Make first contact',
      description: 'No engagement recorded - initiate outreach immediately',
      expectedImpact: '+20 to +40 points',
    });
    return score;
  }
  
  // Total interactions
  const totalInteractions = touchpoints.length;
  score += Math.min(15, totalInteractions * 3);
  
  // Response rate calculation
  const outboundEmails = touchpoints.filter(t => t.type === 'email_sent').length;
  const emailReplies = touchpoints.filter(t => t.type === 'email_replied').length;
  const responseRate = outboundEmails > 0 ? emailReplies / outboundEmails : 0;
  
  if (responseRate >= 0.5) {
    score += 20;
    insights?.push({
      type: 'positive',
      category: 'Email Engagement',
      message: `Excellent response rate: ${Math.round(responseRate * 100)}%`,
      impact: 6,
    });
  } else if (responseRate >= 0.3) {
    score += 10;
    insights?.push({
      type: 'positive',
      category: 'Email Engagement',
      message: `Good response rate: ${Math.round(responseRate * 100)}%`,
      impact: 3,
    });
  } else if (outboundEmails > 3 && responseRate === 0) {
    score -= 10;
    insights?.push({
      type: 'warning',
      category: 'Email Engagement',
      message: 'Multiple emails sent with no response',
      impact: -5,
    });
    recommendations?.push({
      priority: 'high',
      action: 'Switch channel',
      description: 'Try phone call or LinkedIn - email not getting responses',
      expectedImpact: '+15 points',
    });
  }
  
  // Call connection rate
  const callsMade = touchpoints.filter(t => t.type === 'call_made').length;
  const callsConnected = touchpoints.filter(t => t.type === 'call_connected').length;
  
  if (callsConnected > 0) {
    score += 15;
    insights?.push({
      type: 'positive',
      category: 'Call Engagement',
      message: `${callsConnected} successful call${callsConnected > 1 ? 's' : ''} completed`,
      impact: 5,
    });
  } else if (callsMade >= 3) {
    insights?.push({
      type: 'warning',
      category: 'Call Engagement',
      message: `${callsMade} calls made, no connection yet`,
      impact: -2,
    });
  }
  
  // Meeting engagement
  const meetingsCompleted = touchpoints.filter(t => t.type === 'meeting_completed').length;
  const meetingsScheduled = touchpoints.filter(t => t.type === 'meeting_scheduled').length;
  const noShows = touchpoints.filter(t => t.type === 'meeting_no_show').length;
  
  if (meetingsCompleted > 0) {
    score += 20;
    insights?.push({
      type: 'positive',
      category: 'Meeting Engagement',
      message: `${meetingsCompleted} meeting${meetingsCompleted > 1 ? 's' : ''} completed`,
      impact: 7,
    });
  }
  
  if (noShows > 0) {
    score -= 10 * noShows;
    insights?.push({
      type: 'negative',
      category: 'Meeting Engagement',
      message: `${noShows} meeting no-show${noShows > 1 ? 's' : ''} recorded`,
      impact: -5,
    });
  }
  
  // Sentiment analysis
  const positiveSentiments = touchpoints.filter(t => t.sentiment === 'positive').length;
  const negativeSentiments = touchpoints.filter(t => t.sentiment === 'negative').length;
  const buyingSignals = touchpoints.filter(t => t.sentiment === 'buying_signal').length;
  
  if (buyingSignals > 0) {
    score += 15;
    insights?.push({
      type: 'positive',
      category: 'Sentiment',
      message: `${buyingSignals} buying signal${buyingSignals > 1 ? 's' : ''} detected`,
      impact: 5,
    });
  }
  
  if (positiveSentiments > negativeSentiments) {
    score += 5;
  } else if (negativeSentiments > positiveSentiments) {
    score -= 5;
  }
  
  return Math.min(100, Math.max(0, score));
};

const calculateIntentSignals = (
  opportunity: CRMOpportunity,
  touchpoints: CRMTouchpoint[],
  insights?: LeadInsight[],
  recommendations?: LeadRecommendation[]
): number => {
  let score = 30; // Base score
  
  // Check for specific intent signals in touchpoints
  const proposalRequests = touchpoints.filter(t => 
    t.outcome === 'proposal_requested' || 
    (t.content?.toLowerCase().includes('quote') || t.content?.toLowerCase().includes('proposal'))
  ).length;
  
  if (proposalRequests > 0) {
    score += 25;
    insights?.push({
      type: 'positive',
      category: 'Intent',
      message: 'Explicit proposal/quote request received',
      impact: 8,
    });
  }
  
  // Site survey intent
  if (opportunity.stage === 'site_survey' || opportunity.stage === 'proposal_sent') {
    score += 20;
    insights?.push({
      type: 'positive',
      category: 'Intent',
      message: 'Advanced to site survey or proposal stage',
      impact: 6,
    });
  }
  
  // Urgency indicators
  const urgencyKeywords = ['urgent', 'asap', 'this week', 'immediately', 'soon', 'quick'];
  const hasUrgency = touchpoints.some(t => 
    urgencyKeywords.some(kw => t.content?.toLowerCase().includes(kw))
  );
  
  if (hasUrgency) {
    score += 15;
    insights?.push({
      type: 'positive',
      category: 'Urgency',
      message: 'Urgency keywords detected in communications',
      impact: 5,
    });
  }
  
  // Budget discussion
  const budgetMentions = touchpoints.filter(t => 
    t.content?.toLowerCase().includes('budget') ||
    t.content?.toLowerCase().includes('price') ||
    t.content?.toLowerCase().includes('cost')
  ).length;
  
  if (budgetMentions > 0) {
    score += 10;
    insights?.push({
      type: 'positive',
      category: 'Intent',
      message: 'Budget/pricing discussed',
      impact: 3,
    });
  }
  
  // Follow-up required outcome
  const followUpsNeeded = touchpoints.filter(t => t.outcome === 'follow_up_required').length;
  if (followUpsNeeded > 0) {
    recommendations?.push({
      priority: 'high',
      action: 'Follow up on pending items',
      description: `${followUpsNeeded} follow-up${followUpsNeeded > 1 ? 's' : ''} required from previous conversations`,
      expectedImpact: '+10 points',
    });
  }
  
  return Math.min(100, score);
};

const calculateRecency = (
  opportunity: CRMOpportunity,
  touchpoints: CRMTouchpoint[],
  insights?: LeadInsight[],
  recommendations?: LeadRecommendation[]
): number => {
  let score = 50; // Base score
  
  if (touchpoints.length === 0) {
    // No activity - penalize based on lead age
    const leadAge = daysSince(opportunity.createdAt);
    if (leadAge > 7) {
      score -= 30;
      recommendations?.push({
        priority: 'critical',
        action: 'Reach out immediately',
        description: `Lead is ${leadAge} days old with no activity`,
        expectedImpact: '+25 points',
      });
    }
    return Math.max(0, score);
  }
  
  // Most recent activity
  const mostRecent = touchpoints[0]; // Already sorted by date desc
  const daysSinceLastActivity = daysSince(mostRecent.createdAt);
  
  if (daysSinceLastActivity <= 1) {
    score += 30;
    insights?.push({
      type: 'positive',
      category: 'Recency',
      message: 'Active today',
      impact: 5,
    });
  } else if (daysSinceLastActivity <= 3) {
    score += 20;
    insights?.push({
      type: 'positive',
      category: 'Recency',
      message: 'Active within last 3 days',
      impact: 3,
    });
  } else if (daysSinceLastActivity <= 7) {
    score += 10;
  } else if (daysSinceLastActivity <= 14) {
    score -= 10;
    insights?.push({
      type: 'warning',
      category: 'Recency',
      message: `No activity for ${daysSinceLastActivity} days`,
      impact: -3,
    });
  } else {
    score -= 30;
    insights?.push({
      type: 'negative',
      category: 'Recency',
      message: `Stale lead - ${daysSinceLastActivity} days since last activity`,
      impact: -7,
    });
    recommendations?.push({
      priority: 'high',
      action: 'Re-engage lead',
      description: 'Send re-engagement email or make a call',
      expectedImpact: '+15 points',
    });
  }
  
  // Response velocity (time between outbound and inbound)
  const responseVelocities: number[] = [];
  for (let i = 0; i < touchpoints.length - 1; i++) {
    const current = touchpoints[i];
    const next = touchpoints[i + 1];
    
    if (current.direction === 'outbound' && next.direction === 'inbound') {
      const responseTime = hoursBetween(next.createdAt, current.createdAt);
      responseVelocities.push(responseTime);
    }
  }
  
  if (responseVelocities.length > 0) {
    const avgResponseTime = responseVelocities.reduce((a, b) => a + b, 0) / responseVelocities.length;
    
    if (avgResponseTime <= 24) {
      score += 20;
      insights?.push({
        type: 'positive',
        category: 'Velocity',
        message: 'Very responsive - replies within 24 hours',
        impact: 5,
      });
    } else if (avgResponseTime <= 72) {
      score += 10;
      insights?.push({
        type: 'positive',
        category: 'Velocity',
        message: 'Good response time - replies within 3 days',
        impact: 3,
      });
    }
  }
  
  return Math.min(100, Math.max(0, score));
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

const determineQualityTier = (score: number, status: OpportunityStatus): LeadQuality => {
  if (status === 'closed_won') return 'hot';
  if (status === 'closed_lost') return 'dead';
  
  if (score >= 80) return 'hot';
  if (score >= 50) return 'warm';
  if (score >= 25) return 'cold';
  return 'dead';
};

const calculateConfidence = (
  opportunity: CRMOpportunity,
  company?: CRMCompany,
  contact?: CRMContact,
  touchpoints?: CRMTouchpoint[]
): number => {
  let confidence = 0.5; // Base confidence
  
  // Data completeness boosts confidence
  if (company?.industry) confidence += 0.1;
  if (company?.website) confidence += 0.05;
  if (contact?.email && contact?.phone) confidence += 0.1;
  if (contact?.jobTitle) confidence += 0.05;
  if (opportunity.estimatedValue) confidence += 0.1;
  if (touchpoints && touchpoints.length >= 3) confidence += 0.1;
  
  return Math.min(1, confidence);
};

const generateAIInsights = (
  opportunity: CRMOpportunity,
  touchpoints: CRMTouchpoint[],
  insights: LeadInsight[],
  totalScore: number
): void => {
  // Pattern detection
  const emailTouchpoints = touchpoints.filter(t => t.type.startsWith('email_'));
  const callTouchpoints = touchpoints.filter(t => t.type.startsWith('call_'));
  
  // Channel preference detection
  if (emailTouchpoints.length > callTouchpoints.length * 2 && emailTouchpoints.length >= 5) {
    insights.push({
      type: 'neutral',
      category: 'AI Pattern',
      message: 'Lead prefers email communication',
      impact: 0,
    });
  } else if (callTouchpoints.length > emailTouchpoints.length && callTouchpoints.length >= 3) {
    insights.push({
      type: 'neutral',
      category: 'AI Pattern',
      message: 'Lead is responsive to phone calls',
      impact: 0,
    });
  }
  
  // Best time analysis (simplified)
  if (touchpoints.length >= 5) {
    const successfulInteractions = touchpoints.filter(t => 
      t.outcome === 'successful' || t.type === 'email_replied' || t.type === 'call_connected'
    );
    
    if (successfulInteractions.length >= 3) {
      insights.push({
        type: 'opportunity',
        category: 'AI Insight',
        message: 'Multiple successful interactions - high conversion potential',
        impact: 3,
      });
    }
  }
  
  // Risk assessment
  if (totalScore < 40 && opportunity.numberOfAttempts >= 5) {
    insights.push({
      type: 'warning',
      category: 'AI Risk Assessment',
      message: 'Low engagement despite multiple attempts - consider deprioritizing',
      impact: -5,
    });
  }
};

// ==========================================
// BATCH OPERATIONS
// ==========================================

export const scoreAllLeads = (): LeadScore[] => {
  const opportunities = getCRMOpportunities();
  return opportunities.map(opp => calculateLeadScore(opp));
};

export const getHotLeads = (threshold: number = 75): LeadScore[] => {
  return scoreAllLeads().filter(s => s.totalScore >= threshold);
};

export const getLeadsNeedingAttention = (): LeadScore[] => {
  const scores = scoreAllLeads();
  return scores.filter(s => {
    // Leads with declining scores or critical recommendations
    const hasCriticalRec = s.recommendations.some(r => r.priority === 'critical');
    const isStale = s.factors.recency < 3;
    return hasCriticalRec || (isStale && s.quality !== 'dead');
  });
};

export const getLeadScoreRankings = (): Array<{
  opportunityId: string;
  companyName: string;
  score: number;
  quality: LeadQuality;
}> => {
  const scores = scoreAllLeads();
  
  return scores
    .map(s => {
      const opp = getCRMOpportunities().find(o => o.id === s.opportunityId);
      const company = opp ? getCRMCompanyById(opp.companyId) : undefined;
      return {
        opportunityId: s.opportunityId,
        companyName: company?.name || 'Unknown',
        score: s.totalScore,
        quality: s.quality,
      };
    })
    .sort((a, b) => b.score - a.score);
};

// ==========================================
// SCORING HISTORY
// ==========================================

const SCORE_HISTORY_KEY = 'crm_lead_score_history';

export const saveScoreHistory = (opportunityId: string, score: LeadScore): void => {
  try {
    const stored = localStorage.getItem(SCORE_HISTORY_KEY);
    const history: Record<string, LeadScoreHistory> = stored ? JSON.parse(stored) : {};
    
    if (!history[opportunityId]) {
      history[opportunityId] = { opportunityId, scores: [] };
    }
    
    history[opportunityId].scores.push({
      score: score.totalScore,
      quality: score.quality,
      date: score.calculatedAt,
      triggerEvent: 'manual_calculation',
    });
    
    // Keep only last 50 scores per lead
    if (history[opportunityId].scores.length > 50) {
      history[opportunityId].scores = history[opportunityId].scores.slice(-50);
    }
    
    localStorage.setItem(SCORE_HISTORY_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Error saving score history:', e);
  }
};

export const getScoreHistory = (opportunityId: string): LeadScoreHistory | undefined => {
  try {
    const stored = localStorage.getItem(SCORE_HISTORY_KEY);
    const history: Record<string, LeadScoreHistory> = stored ? JSON.parse(stored) : {};
    return history[opportunityId];
  } catch (e) {
    return undefined;
  }
};

export const getScoreTrend = (opportunityId: string): 'improving' | 'declining' | 'stable' | 'unknown' => {
  const history = getScoreHistory(opportunityId);
  if (!history || history.scores.length < 2) return 'unknown';
  
  const recent = history.scores.slice(-3);
  const avgRecent = recent.reduce((a, b) => a + b.score, 0) / recent.length;
  
  const older = history.scores.slice(-6, -3);
  if (older.length === 0) return 'stable';
  
  const avgOlder = older.reduce((a, b) => a + b.score, 0) / older.length;
  
  const diff = avgRecent - avgOlder;
  if (diff > 5) return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
};

// ==========================================
// UTILITIES
// ==========================================

const daysSince = (dateString: string): number => {
  const date = new Date(dateString);
  const now = new Date();
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
};

const hoursBetween = (date1: string, date2: string): number => {
  const d1 = new Date(date1).getTime();
  const d2 = new Date(date2).getTime();
  return Math.abs(d1 - d2) / (1000 * 60 * 60);
};

// ==========================================
// AUTO-SCORING INTEGRATION
// ==========================================

/**
 * Should be called whenever a touchpoint is added
 * This will update the lead score in real-time
 */
export const recalculateScoreOnActivity = (opportunityId: string): LeadScore => {
  const opportunity = getCRMOpportunities().find(o => o.id === opportunityId);
  if (!opportunity) {
    throw new Error(`Opportunity ${opportunityId} not found`);
  }
  
  const score = calculateLeadScore(opportunity);
  saveScoreHistory(opportunityId, score);
  
  return score;
};

/**
 * Get scoring summary for dashboard
 */
export const getScoringSummary = () => {
  const scores = scoreAllLeads();
  const activeOpportunities = scores.filter(s => s.quality !== 'dead');
  
  return {
    totalScored: scores.length,
    hotCount: scores.filter(s => s.quality === 'hot').length,
    warmCount: scores.filter(s => s.quality === 'warm').length,
    coldCount: scores.filter(s => s.quality === 'cold').length,
    deadCount: scores.filter(s => s.quality === 'dead').length,
    averageScore: activeOpportunities.length > 0
      ? Math.round(activeOpportunities.reduce((a, b) => a + b.totalScore, 0) / activeOpportunities.length)
      : 0,
    leadsNeedingAttention: scores.filter(s => 
      s.recommendations.some(r => ['critical', 'high'].includes(r.priority))
    ).length,
  };
};
