/**
 * CRM PDF Report Generation Service
 * Generates professional PDF reports for CRM data
 */

import jsPDF from 'jspdf';
import { 
  CRMOpportunity, 
  CRMCompany, 
  CRMContact, 
  CRMTouchpoint,
  CRMPipelineMetrics 
} from '../types';
import { 
  getCRMOpportunities, 
  getCRMCompanies, 
  getCRMContacts, 
  getCRMTouchpoints,
  getCRMPipelineMetrics,
  getCRMCompanyById,
  getCRMContactById
} from './crmService';
import { scoreAllLeads, getScoringSummary } from './leadScoring';
import { formatCurrency } from '../utils/sanitizers';

// ==========================================
// PDF CONFIGURATION
// ==========================================

const PDF_CONFIG = {
  colors: {
    primary: '#6366f1',      // Indigo 500
    secondary: '#3b82f6',    // Blue 500
    success: '#10b981',      // Emerald 500
    warning: '#f59e0b',      // Amber 500
    danger: '#ef4444',       // Red 500
    slate: '#64748b',        // Slate 500
    dark: '#1e293b',         // Slate 800
    light: '#f8fafc',        // Slate 50
  },
  fonts: {
    header: 20,
    subheader: 14,
    body: 10,
    small: 8,
  },
  margins: {
    top: 20,
    left: 20,
    right: 20,
    bottom: 30,
  }
};

// ==========================================
// PIPELINE REPORT
// ==========================================

export const generatePipelineReport = async (): Promise<void> => {
  const opportunities = getCRMOpportunities();
  const companies = getCRMCompanies();
  const metrics = getCRMPipelineMetrics();
  
  const doc = new jsPDF();
  let y = PDF_CONFIG.margins.top;
  
  // Header
  y = addHeader(doc, 'CRM Pipeline Report', y);
  y += 10;
  
  // Summary Section
  y = addSectionHeader(doc, 'Executive Summary', y);
  y += 5;
  
  const summaryData = [
    ['Total Opportunities:', opportunities.length.toString()],
    ['Pipeline Value:', formatCurrency(metrics.totalValue)],
    ['Weighted Pipeline:', formatCurrency(metrics.weightedValue)],
    ['Active Deals:', `${metrics.byStatus.new.count + metrics.byStatus.contacted.count + metrics.byStatus.qualified.count + metrics.byStatus.proposal.count + metrics.byStatus.negotiation.count}`],
    ['Won Deals:', metrics.byStatus.closed_won.count.toString()],
    ['Lost Deals:', metrics.byStatus.closed_lost.count.toString()],
    ['Win Rate:', `${metrics.conversionRates.overall}%`],
    ['Follow-ups Due:', metrics.followUpsRequired.toString()],
  ];
  
  summaryData.forEach(([label, value]) => {
    doc.setFontSize(PDF_CONFIG.fonts.body);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text(label, PDF_CONFIG.margins.left, y);
    doc.setTextColor(PDF_CONFIG.colors.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(value, PDF_CONFIG.margins.left + 50, y);
    doc.setFont('helvetica', 'normal');
    y += 7;
  });
  
  y += 10;
  
  // Status Breakdown
  if (y > 250) {
    doc.addPage();
    y = PDF_CONFIG.margins.top;
  }
  
  y = addSectionHeader(doc, 'Pipeline by Status', y);
  y += 5;
  
  const statusData = [
    ['New Leads', metrics.byStatus.new.count.toString(), formatCurrency(metrics.byStatus.new.value)],
    ['Contacted', metrics.byStatus.contacted.count.toString(), formatCurrency(metrics.byStatus.contacted.value)],
    ['Qualified', metrics.byStatus.qualified.count.toString(), formatCurrency(metrics.byStatus.qualified.value)],
    ['Proposal', metrics.byStatus.proposal.count.toString(), formatCurrency(metrics.byStatus.proposal.value)],
    ['Negotiation', metrics.byStatus.negotiation.count.toString(), formatCurrency(metrics.byStatus.negotiation.value)],
    ['Closed Won', metrics.byStatus.closed_won.count.toString(), formatCurrency(metrics.byStatus.closed_won.value)],
    ['Closed Lost', metrics.byStatus.closed_lost.count.toString(), formatCurrency(metrics.byStatus.closed_lost.value)],
  ];
  
  // Table header
  y = addTableHeader(doc, ['Status', 'Count', 'Value'], y);
  
  // Table rows
  statusData.forEach(([status, count, value]) => {
    if (y > 270) {
      doc.addPage();
      y = PDF_CONFIG.margins.top;
      y = addTableHeader(doc, ['Status', 'Count', 'Value'], y);
    }
    y = addTableRow(doc, [status, count, value], y);
  });
  
  y += 10;
  
  // Opportunities List
  if (opportunities.length > 0) {
    if (y > 200) {
      doc.addPage();
      y = PDF_CONFIG.margins.top;
    }
    
    y = addSectionHeader(doc, 'Opportunity Details', y);
    y += 5;
    
    opportunities.slice(0, 20).forEach((opp, index) => {
      if (y > 260) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
      }
      
      const company = getCRMCompanyById(opp.companyId);
      const contact = getCRMContactById(opp.primaryContactId);
      
      doc.setFontSize(PDF_CONFIG.fonts.body);
      doc.setTextColor(PDF_CONFIG.colors.primary);
      doc.setFont('helvetica', 'bold');
      doc.text(`${index + 1}. ${company?.name || 'Unknown Company'}`, PDF_CONFIG.margins.left, y);
      y += 6;
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(PDF_CONFIG.colors.dark);
      doc.setFontSize(PDF_CONFIG.fonts.small);
      
      const details = [
        `Status: ${opp.status} | Stage: ${opp.stage}`,
        `Contact: ${contact?.fullName || 'N/A'} (${contact?.email || 'N/A'})`,
        `Value: ${formatCurrency(opp.estimatedValue)} | Location: ${opp.locationInterest || 'N/A'}`,
        `Billboard Type: ${opp.billboardType || 'N/A'} | Attempts: ${opp.numberOfAttempts}`,
      ];
      
      details.forEach(detail => {
        doc.text(detail, PDF_CONFIG.margins.left + 5, y);
        y += 4;
      });
      
      y += 5;
    });
    
    if (opportunities.length > 20) {
      doc.setFontSize(PDF_CONFIG.fonts.small);
      doc.setTextColor(PDF_CONFIG.colors.slate);
      doc.setFont('helvetica', 'italic');
      doc.text(`... and ${opportunities.length - 20} more opportunities`, PDF_CONFIG.margins.left, y);
      doc.setFont('helvetica', 'normal');
    }
  }
  
  // Footer
  addFooter(doc);
  
  // Download
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`crm-pipeline-report-${dateStr}.pdf`);
};

// ==========================================
// LEAD SCORING REPORT
// ==========================================

export const generateLeadScoringReport = async (): Promise<void> => {
  const scores = scoreAllLeads();
  const summary = getScoringSummary();
  
  const doc = new jsPDF();
  let y = PDF_CONFIG.margins.top;
  
  // Header
  y = addHeader(doc, 'AI Lead Scoring Report', y);
  y += 10;
  
  // Summary
  y = addSectionHeader(doc, 'Scoring Summary', y);
  y += 5;
  
  const summaryData = [
    ['Total Leads Scored:', summary.totalScored.toString()],
    ['Average Score:', summary.averageScore.toString()],
    ['Hot Leads (80+):', summary.hotCount.toString()],
    ['Warm Leads (50-79):', summary.warmCount.toString()],
    ['Cold Leads (25-49):', summary.coldCount.toString()],
    ['Dead Leads (<25):', summary.deadCount.toString()],
    ['Needing Attention:', summary.leadsNeedingAttention.toString()],
  ];
  
  summaryData.forEach(([label, value]) => {
    doc.setFontSize(PDF_CONFIG.fonts.body);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text(label, PDF_CONFIG.margins.left, y);
    doc.setTextColor(PDF_CONFIG.colors.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(value, PDF_CONFIG.margins.left + 50, y);
    doc.setFont('helvetica', 'normal');
    y += 7;
  });
  
  y += 10;
  
  // Quality Distribution Chart (Simple Bar)
  if (y > 200) {
    doc.addPage();
    y = PDF_CONFIG.margins.top;
  }
  
  y = addSectionHeader(doc, 'Quality Distribution', y);
  y += 10;
  
  const distribution = [
    { label: 'Hot', count: summary.hotCount, color: PDF_CONFIG.colors.warning },
    { label: 'Warm', count: summary.warmCount, color: PDF_CONFIG.colors.primary },
    { label: 'Cold', count: summary.coldCount, color: PDF_CONFIG.colors.secondary },
    { label: 'Dead', count: summary.deadCount, color: PDF_CONFIG.colors.slate },
  ];
  
  const maxCount = Math.max(...distribution.map(d => d.count), 1);
  
  distribution.forEach(item => {
    const barWidth = (item.count / maxCount) * 100;
    
    doc.setFontSize(PDF_CONFIG.fonts.body);
    doc.setTextColor(PDF_CONFIG.colors.dark);
    doc.text(item.label, PDF_CONFIG.margins.left, y);
    doc.text(item.count.toString(), PDF_CONFIG.margins.left + 120, y);
    
    // Draw bar
    doc.setFillColor(item.color);
    doc.rect(PDF_CONFIG.margins.left + 30, y - 4, barWidth, 6, 'F');
    
    y += 10;
  });
  
  y += 10;
  
  // Lead Rankings
  if (scores.length > 0) {
    if (y > 200) {
      doc.addPage();
      y = PDF_CONFIG.margins.top;
    }
    
    y = addSectionHeader(doc, 'Lead Rankings (Top 20)', y);
    y += 5;
    
    y = addTableHeader(doc, ['Rank', 'Company', 'Score', 'Quality'], y);
    
    const rankedLeads = scores
      .map(score => {
        const opp = getCRMOpportunities().find(o => o.id === score.opportunityId);
        const company = opp ? getCRMCompanyById(opp.companyId) : null;
        return {
          companyName: company?.name || 'Unknown',
          score: score.totalScore,
          quality: score.quality,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
    
    rankedLeads.forEach((lead, index) => {
      if (y > 270) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
        y = addTableHeader(doc, ['Rank', 'Company', 'Score', 'Quality'], y);
      }
      
      const qualityColors: Record<string, string> = {
        hot: PDF_CONFIG.colors.warning,
        warm: PDF_CONFIG.colors.primary,
        cold: PDF_CONFIG.colors.secondary,
        dead: PDF_CONFIG.colors.slate,
      };
      
      y = addTableRow(
        doc, 
        [`${index + 1}`, lead.companyName, lead.score.toString(), lead.quality.toUpperCase()], 
        y,
        lead.quality === 'hot' ? PDF_CONFIG.colors.warning : undefined
      );
    });
  }
  
  // Footer
  addFooter(doc);
  
  // Download
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`lead-scoring-report-${dateStr}.pdf`);
};

// ==========================================
// ACTIVITY/OUTREACH REPORT
// ==========================================

export const generateOutreachReport = async (): Promise<void> => {
  const touchpoints = getCRMTouchpoints();
  const opportunities = getCRMOpportunities();
  const metrics = getCRMPipelineMetrics();
  
  const doc = new jsPDF();
  let y = PDF_CONFIG.margins.top;
  
  // Header
  y = addHeader(doc, 'Outreach Activity Report', y);
  y += 10;
  
  // Activity Summary
  y = addSectionHeader(doc, 'Activity Summary', y);
  y += 5;
  
  const activityData = [
    ['Total Touchpoints:', touchpoints.length.toString()],
    ['Calls Made:', metrics.activityMetrics.callsMade.toString()],
    ['Calls Connected:', metrics.activityMetrics.callsConnected.toString()],
    ['Emails Sent:', metrics.activityMetrics.emailsSent.toString()],
    ['Emails Opened:', metrics.activityMetrics.emailsOpened.toString()],
    ['Emails Replied:', metrics.activityMetrics.emailsReplied.toString()],
    ['Meetings Scheduled:', metrics.activityMetrics.meetingsScheduled.toString()],
    ['Meetings Completed:', metrics.activityMetrics.meetingsCompleted.toString()],
  ];
  
  activityData.forEach(([label, value]) => {
    doc.setFontSize(PDF_CONFIG.fonts.body);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text(label, PDF_CONFIG.margins.left, y);
    doc.setTextColor(PDF_CONFIG.colors.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(value, PDF_CONFIG.margins.left + 50, y);
    doc.setFont('helvetica', 'normal');
    y += 7;
  });
  
  y += 10;
  
  // Recent Activity
  if (touchpoints.length > 0) {
    if (y > 200) {
      doc.addPage();
      y = PDF_CONFIG.margins.top;
    }
    
    y = addSectionHeader(doc, 'Recent Activity (Last 30)', y);
    y += 5;
    
    const sortedTouchpoints = [...touchpoints]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 30);
    
    sortedTouchpoints.forEach((tp, index) => {
      if (y > 260) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
      }
      
      const opp = opportunities.find(o => o.id === tp.opportunityId);
      const company = opp ? getCRMCompanyById(opp.companyId) : null;
      const date = new Date(tp.createdAt).toLocaleDateString();
      
      doc.setFontSize(PDF_CONFIG.fonts.small);
      doc.setTextColor(PDF_CONFIG.colors.slate);
      doc.text(date, PDF_CONFIG.margins.left, y);
      
      doc.setTextColor(PDF_CONFIG.colors.dark);
      doc.text(`${tp.type.replace(/_/g, ' ')}`, PDF_CONFIG.margins.left + 25, y);
      
      const companyName = company?.name || 'Unknown';
      if (companyName.length > 25) {
        doc.text(companyName.substring(0, 25) + '...', PDF_CONFIG.margins.left + 70, y);
      } else {
        doc.text(companyName, PDF_CONFIG.margins.left + 70, y);
      }
      
      y += 5;
    });
  }
  
  // Footer
  addFooter(doc);
  
  // Download
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`outreach-activity-report-${dateStr}.pdf`);
};

// ==========================================
// OPPORTUNITY DETAIL REPORT
// ==========================================

export const generateOpportunityReport = async (opportunityId: string): Promise<void> => {
  const { getCRMOpportunityById, getTouchpointsByOpportunity, getTasksByOpportunity } = await import('./crmService');
  
  const opportunity = getCRMOpportunityById(opportunityId);
  if (!opportunity) return;
  
  const company = getCRMCompanyById(opportunity.companyId);
  const contact = getCRMContactById(opportunity.primaryContactId);
  const touchpoints = getTouchpointsByOpportunity(opportunityId);
  const tasks = getTasksByOpportunity(opportunityId);
  
  const doc = new jsPDF();
  let y = PDF_CONFIG.margins.top;
  
  // Header
  y = addHeader(doc, 'Opportunity Report', y);
  y += 10;
  
  // Company Info
  y = addSectionHeader(doc, 'Company Information', y);
  y += 5;
  
  const companyData = [
    ['Company Name:', company?.name || 'N/A'],
    ['Industry:', company?.industry || 'N/A'],
    ['Website:', company?.website || 'N/A'],
    ['Location:', `${company?.city || ''}, ${company?.country || ''}`],
    ['Primary Contact:', contact?.fullName || 'N/A'],
    ['Email:', contact?.email || 'N/A'],
    ['Phone:', contact?.phone || 'N/A'],
    ['Job Title:', contact?.jobTitle || 'N/A'],
  ];
  
  companyData.forEach(([label, value]) => {
    doc.setFontSize(PDF_CONFIG.fonts.body);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text(label, PDF_CONFIG.margins.left, y);
    doc.setTextColor(PDF_CONFIG.colors.dark);
    doc.text(value.length > 40 ? value.substring(0, 40) + '...' : value, PDF_CONFIG.margins.left + 40, y);
    y += 6;
  });
  
  y += 10;
  
  // Deal Details
  if (y > 200) {
    doc.addPage();
    y = PDF_CONFIG.margins.top;
  }
  
  y = addSectionHeader(doc, 'Deal Details', y);
  y += 5;
  
  const dealData = [
    ['Status:', opportunity.status],
    ['Stage:', opportunity.stage],
    ['Estimated Value:', formatCurrency(opportunity.estimatedValue)],
    ['Location Interest:', opportunity.locationInterest || 'N/A'],
    ['Billboard Type:', opportunity.billboardType || 'N/A'],
    ['Campaign Duration:', opportunity.campaignDuration || 'N/A'],
    ['Lead Source:', opportunity.leadSource || 'N/A'],
    ['Contact Attempts:', opportunity.numberOfAttempts.toString()],
    ['Created:', new Date(opportunity.createdAt).toLocaleDateString()],
    ['Last Contact:', opportunity.lastContactDate ? new Date(opportunity.lastContactDate).toLocaleDateString() : 'N/A'],
  ];
  
  dealData.forEach(([label, value]) => {
    doc.setFontSize(PDF_CONFIG.fonts.body);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text(label, PDF_CONFIG.margins.left, y);
    doc.setTextColor(PDF_CONFIG.colors.dark);
    doc.setFont('helvetica', 'bold');
    doc.text(value, PDF_CONFIG.margins.left + 40, y);
    doc.setFont('helvetica', 'normal');
    y += 6;
  });
  
  y += 10;
  
  // Activity History
  if (touchpoints.length > 0) {
    if (y > 200) {
      doc.addPage();
      y = PDF_CONFIG.margins.top;
    }
    
    y = addSectionHeader(doc, `Activity History (${touchpoints.length})`, y);
    y += 5;
    
    touchpoints.forEach((tp, index) => {
      if (y > 260) {
        doc.addPage();
        y = PDF_CONFIG.margins.top;
      }
      
      const date = new Date(tp.createdAt).toLocaleDateString();
      
      doc.setFontSize(PDF_CONFIG.fonts.small);
      doc.setTextColor(PDF_CONFIG.colors.slate);
      doc.text(date, PDF_CONFIG.margins.left, y);
      
      doc.setTextColor(PDF_CONFIG.colors.primary);
      doc.setFont('helvetica', 'bold');
      doc.text(tp.type.replace(/_/g, ' ').toUpperCase(), PDF_CONFIG.margins.left + 25, y);
      doc.setFont('helvetica', 'normal');
      
      if (tp.outcome) {
        doc.setTextColor(PDF_CONFIG.colors.dark);
        doc.text(`Outcome: ${tp.outcome}`, PDF_CONFIG.margins.left + 70, y);
      }
      
      y += 5;
      
      if (tp.content) {
        doc.setTextColor(PDF_CONFIG.colors.slate);
        const content = tp.content.length > 80 ? tp.content.substring(0, 80) + '...' : tp.content;
        doc.text(content, PDF_CONFIG.margins.left + 5, y);
        y += 5;
      }
      
      y += 3;
    });
  }
  
  // Footer
  addFooter(doc);
  
  // Download
  const dateStr = new Date().toISOString().split('T')[0];
  const companyName = (company?.name || 'opportunity').replace(/\s+/g, '-').toLowerCase();
  doc.save(`opportunity-report-${companyName}-${dateStr}.pdf`);
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

function addHeader(doc: jsPDF, title: string, y: number): number {
  // Logo/Brand
  doc.setFillColor(PDF_CONFIG.colors.primary);
  doc.circle(PDF_CONFIG.margins.left + 5, y - 3, 4, 'F');
  
  doc.setFontSize(PDF_CONFIG.fonts.header);
  doc.setTextColor(PDF_CONFIG.colors.dark);
  doc.setFont('helvetica', 'bold');
  doc.text('Dreambox', PDF_CONFIG.margins.left + 15, y);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_CONFIG.colors.slate);
  doc.setFontSize(PDF_CONFIG.fonts.small);
  doc.text('Billboard Advertising Platform', PDF_CONFIG.margins.left + 15, y + 5);
  
  // Title
  doc.setFontSize(PDF_CONFIG.fonts.header);
  doc.setTextColor(PDF_CONFIG.colors.dark);
  doc.setFont('helvetica', 'bold');
  doc.text(title, PDF_CONFIG.margins.left, y + 20);
  
  // Date
  doc.setFontSize(PDF_CONFIG.fonts.small);
  doc.setTextColor(PDF_CONFIG.colors.slate);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, PDF_CONFIG.margins.left, y + 28);
  
  // Line
  doc.setDrawColor(PDF_CONFIG.colors.slate);
  doc.setLineWidth(0.5);
  doc.line(PDF_CONFIG.margins.left, y + 32, 190, y + 32);
  
  return y + 40;
}

function addSectionHeader(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(PDF_CONFIG.fonts.subheader);
  doc.setTextColor(PDF_CONFIG.colors.primary);
  doc.setFont('helvetica', 'bold');
  doc.text(title, PDF_CONFIG.margins.left, y);
  
  doc.setDrawColor(PDF_CONFIG.colors.primary);
  doc.setLineWidth(0.5);
  doc.line(PDF_CONFIG.margins.left, y + 2, PDF_CONFIG.margins.left + doc.getTextWidth(title), y + 2);
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_CONFIG.colors.dark);
  
  return y;
}

function addTableHeader(doc: jsPDF, headers: string[], y: number): number {
  doc.setFillColor(PDF_CONFIG.colors.light);
  doc.rect(PDF_CONFIG.margins.left, y - 5, 170, 8, 'F');
  
  doc.setFontSize(PDF_CONFIG.fonts.small);
  doc.setTextColor(PDF_CONFIG.colors.dark);
  doc.setFont('helvetica', 'bold');
  
  let x = PDF_CONFIG.margins.left;
  headers.forEach((header, index) => {
    const colWidths = [30, 80, 30, 30];
    doc.text(header, x + 2, y);
    x += colWidths[index] || 40;
  });
  
  doc.setFont('helvetica', 'normal');
  return y + 8;
}

function addTableRow(doc: jsPDF, values: string[], y: number, highlightColor?: string): number {
  if (highlightColor) {
    doc.setTextColor(highlightColor);
  } else {
    doc.setTextColor(PDF_CONFIG.colors.dark);
  }
  
  doc.setFontSize(PDF_CONFIG.fonts.small);
  
  let x = PDF_CONFIG.margins.left;
  values.forEach((value, index) => {
    const colWidths = [30, 80, 30, 30];
    const displayValue = value.length > 30 ? value.substring(0, 30) + '...' : value;
    doc.text(displayValue, x + 2, y);
    x += colWidths[index] || 40;
  });
  
  doc.setTextColor(PDF_CONFIG.colors.dark);
  return y + 6;
}

function addFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    
    // Footer line
    doc.setDrawColor(PDF_CONFIG.colors.slate);
    doc.setLineWidth(0.3);
    doc.line(PDF_CONFIG.margins.left, 280, 190, 280);
    
    // Footer text
    doc.setFontSize(PDF_CONFIG.fonts.small);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text('Dreambox Advertising Platform', PDF_CONFIG.margins.left, 287);
    doc.text(`Page ${i} of ${pageCount}`, 170, 287);
    
    // Confidential
    doc.setFontSize(8);
    doc.setTextColor(PDF_CONFIG.colors.slate);
    doc.text('Confidential - Internal Use Only', PDF_CONFIG.margins.left, 292);
  }
}

// ==========================================
// BATCH EXPORT
// ==========================================

export const generateFullCRMReport = async (): Promise<void> => {
  const doc = new jsPDF();
  let y = PDF_CONFIG.margins.top;
  
  // Cover Page
  y = addHeader(doc, 'Complete CRM Report', y);
  y += 20;
  
  doc.setFontSize(16);
  doc.setTextColor(PDF_CONFIG.colors.primary);
  doc.setFont('helvetica', 'bold');
  doc.text('Comprehensive Business Intelligence', PDF_CONFIG.margins.left, y);
  y += 15;
  
  doc.setFontSize(PDF_CONFIG.fonts.body);
  doc.setTextColor(PDF_CONFIG.colors.dark);
  doc.setFont('helvetica', 'normal');
  doc.text('This report includes:', PDF_CONFIG.margins.left, y);
  y += 10;
  
  const sections = [
    '1. Pipeline Overview & Metrics',
    '2. Lead Scoring Analysis',
    '3. Outreach Activity Summary',
    '4. Opportunity Details',
    '5. Performance Analytics'
  ];
  
  sections.forEach(section => {
    doc.text(section, PDF_CONFIG.margins.left + 5, y);
    y += 7;
  });
  
  y += 10;
  doc.text(`Total Pages: Estimated 5-10`, PDF_CONFIG.margins.left, y);
  y += 7;
  doc.text(`Generated: ${new Date().toLocaleString()}`, PDF_CONFIG.margins.left, y);
  
  addFooter(doc);
  
  // Note: In a real implementation, you'd compile all sections into one PDF
  // For now, we'll download individual reports
  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`complete-crm-report-${dateStr}.pdf`);
  
  // Also generate individual reports
  await generatePipelineReport();
  await generateLeadScoringReport();
  await generateOutreachReport();
};
