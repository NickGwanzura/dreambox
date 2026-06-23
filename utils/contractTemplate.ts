import { Billboard, Client, CompanyProfile, Contract, BillboardType } from '../types';
import { VAT_RATE, formatVatPercent } from '../services/constants';
import { getCRMCompanies } from '../services/crmService';

export const CONTRACT_TEMPLATE_PLACEHOLDERS = [
  { key: 'contract_number', label: 'Contract reference (the contract ID, e.g. C-1234)' },
  { key: 'contract_date', label: 'Date the contract is issued' },
  { key: 'company_name', label: 'Your company name' },
  { key: 'company_address', label: 'Your registered address' },
  { key: 'advertiser_name', label: 'Client company name' },
  { key: 'advertiser_address', label: 'Client address (falls back to "[address on file]")' },
  { key: 'billboard_name', label: 'Billboard name' },
  { key: 'billboard_location', label: 'Billboard location' },
  { key: 'billboard_type', label: 'Static or LED' },
  { key: 'billboard_size', label: 'Dimensions (e.g. 6m x 7m)' },
  { key: 'rate_block', label: 'Auto-generated rate paragraph (rate, slots, total)' },
  { key: 'monthly_rate', label: 'Monthly rate (formatted, no VAT)' },
  { key: 'total_contract_value', label: 'Total contract value (with VAT if applicable)' },
  { key: 'start_date', label: 'Contract start date' },
  { key: 'end_date', label: 'Contract end date' },
  { key: 'duration_description', label: 'Human duration (e.g. "12 months")' },
  { key: 'company_signatory', label: 'Person signing for the company' },
  { key: 'company_signatory_title', label: 'Signatory job title' },
  { key: 'governing_law', label: 'Governing jurisdiction (e.g. Zimbabwe)' },
] as const;

export const DEFAULT_CONTRACT_TEMPLATE = `ADVERTISING CONTRACT No {{contract_number}}

This Advertising Contract ("the Agreement") is made and entered into as of {{contract_date}}, by and between

{{company_name}}, located at {{company_address}}, hereinafter referred to as "the Company,"

and

{{advertiser_name}}, located at {{advertiser_address}}, hereinafter referred to as "the Advertiser."

WHEREAS the Company has agreed to lease advertising space to the Advertiser, the parties hereby agree to the following terms and conditions:

{{rate_block}}

• Neither party shall be liable to the other for failure or delay in the performance of a required obligation if such failure or delay is caused by a strike, riot, fire, flood, natural disaster, or any similar cause beyond the reasonable control of the party. However, the party experiencing such conditions must provide prompt written notice, and if the condition continues for thirty (30) days, either party may terminate the agreement upon written notice to the other.

• The Advertiser {{advertiser_name}} will provide the artwork for the billboards.

• The Advertiser {{advertiser_name}} indemnifies the Company against any claims of defamation, objectionability, offensiveness, or injury to any person arising from the advertisement.

The parties agree to the following additional terms:

• The Company shall arrange for the display of the above advertisement on its media as stated above for a period of {{duration_description}}, starting from {{start_date}}, till {{end_date}}.

• The Company shall, at the Advertiser's request and expense (Video Creation), place the advertisement on the media and substitute it with new or further advertisements as requested by the Advertiser. The Company will maintain the media in good order and repair. However, the Company will not be liable for any loss or damage to the advertisement unless it is due to the Company's negligence or wrongful act.

• The Company reserves the right to reject or require revisions to the advertisement if it considers it defamatory, objectionable, indecent, offensive, or contrary to its policies.

• If the Company fails to display the advertisement within a reasonable time or breaches the conditions of the agreement and fails to remedy the breach within 30 days of receiving written notice from the Advertiser, {{advertiser_name}} may terminate the contract.

• If the Advertiser fails to pay the rental fee or fulfill its payment obligations after receiving written notice from the Company, the Company may terminate the contract.

• Unless terminated through written notice by either party at least thirty (30) days prior to the expiry of the initial hire period, the agreement shall automatically continue in force.

• In the case of premature termination, the Advertiser must provide at least one (1) month's prior written notice of intention to cancel the contract.

• One (1) month prior to the expiry of the contract, the Company shall inform {{advertiser_name}} of the expiration. Both parties will discuss the renewal terms, including media consideration and any required amendments.

• Neither party shall assign this agreement or any rights and obligations without the prior consent of the other party.

• Any disputes arising from this Agreement shall be settled amicably through negotiation. If negotiation fails, either party may submit the dispute to arbitration in accordance with the Arbitration Act (Chapter 7:02). The arbitration award shall be final and binding, and the Agreement shall be governed by the laws of {{governing_law}}.

LIMITATION OF LIABILITY AND LEGAL RECOURSE

The Company shall not be held liable for any injury, physical harm, or property damage resulting from the billboards, including but not limited to structural failures, accidents, or environmental hazards. All responsibility for the maintenance, safety, and structural integrity of the billboards shall rest solely with the Company's designated vendors, owners, and operators of the billboard sites. Any claims arising from such occurrences must be directed exclusively to the responsible vendors or owners, who are required to ensure compliance with all applicable safety regulations, industry standards, and legal requirements.

• The parties agree to provide their respective "domicilium citandi et executandi" (domicile address) for all purposes under this Agreement. The Company's address is {{company_address}}, and the Advertiser's address is {{advertiser_address}}.

• Any party may vary their domicile address within {{governing_law}} by providing written notice to the other party.

• All notices given under this agreement shall be in writing. A notice delivered by hand or transmitted by facsimile shall be deemed received on the first business day after delivery or transmission.

• Each party shall bear its own costs for negotiating, drafting, preparing, and implementing this Agreement.

• In case of any conflict between the provisions of this Agreement and its appendices, the provisions of this Agreement shall take precedence.

Accepted for and on behalf of {{company_name}}:

Signature: _______________________________________
Name: {{company_signatory}}
Designation: {{company_signatory_title}}
Date: _____________________

Accepted for and on behalf of {{advertiser_name}}:

Signature: _______________________________________
Name: _______________________________________
Designation: _______________________________________
Date: _____________________`;

function money(n: number): string {
  return `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

import { calculateContractMonths } from './contractDate';

function monthsBetween(start: string, end: string): number {
  return calculateContractMonths(start, end);
}

function buildRateBlock(contract: Contract, billboard: Billboard | undefined, advertiser: string, vatRate: number = VAT_RATE): string {
  const monthly = money(contract.monthlyRate);
  const sizeStr = billboard ? `${billboard.width}m x ${billboard.height}m` : '';
  const typeLabel = billboard?.type === BillboardType.LED ? 'digital' : 'static';
  const detail = contract.details || '';
  const vatNote = contract.hasVat ? `VAT-inclusive, ${formatVatPercent(vatRate)}` : 'VAT not included';

  let placement: string;
  if (billboard?.type === BillboardType.LED) {
    const slotLabel = contract.slotNumber ? `slot ${contract.slotNumber}` : 'one rotating slot';
    placement = `for ${slotLabel} on the ${sizeStr} ${typeLabel} billboard located at ${billboard.location}`;
  } else if (billboard) {
    placement = `for ${detail || 'the rental'} on the ${sizeStr} ${typeLabel} billboard located at ${billboard.location}`;
  } else {
    placement = `for ${detail || 'the agreed placement'}`;
  }

  const oneOffs: string[] = [];
  if (contract.installationCost > 0) oneOffs.push(`${money(contract.installationCost)} installation fee`);
  if ((contract.productionCost ?? 0) > 0) oneOffs.push(`${money(contract.productionCost ?? 0)} production fee (one-time)`);
  if (contract.printingCost > 0) oneOffs.push(`${money(contract.printingCost)} printing cost`);

  const lines: string[] = [];
  lines.push(`• The Advertiser ${advertiser} shall pay ${monthly} per month (${vatNote}) ${placement}.`);
  if (oneOffs.length > 0) {
    lines.push(`• Additional one-time charges: ${oneOffs.join('; ')}.`);
  }
  lines.push(`• Total contract value: ${money(contract.totalContractValue)} (${vatNote}).`);

  return lines.join('\n');
}

export interface TemplateData {
  contract_number: string;
  contract_date: string;
  company_name: string;
  company_address: string;
  advertiser_name: string;
  advertiser_address: string;
  billboard_name: string;
  billboard_location: string;
  billboard_type: string;
  billboard_size: string;
  rate_block: string;
  monthly_rate: string;
  total_contract_value: string;
  start_date: string;
  end_date: string;
  duration_description: string;
  company_signatory: string;
  company_signatory_title: string;
  governing_law: string;
}

export function buildTemplateData(
  contract: Contract,
  client: Client,
  billboard: Billboard | undefined,
  company: CompanyProfile,
  overrides?: Partial<TemplateData>
): TemplateData {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const months = monthsBetween(contract.startDate, contract.endDate);
  const companyAddress = [company.address, company.city, company.country].filter(Boolean).join(', ') || '[address]';
  // Prefer address from the client record; fall back to CRM if not set
  const clientCountry = client.country || 'Zimbabwe';
  const clientAddress = [client.streetAddress, client.city, clientCountry].filter(Boolean).join(', ');
  const crmCompany = (client.streetAddress || client.city) ? null : getCRMCompanies().find(c => c.name.toLowerCase() === client.companyName.toLowerCase());
  const advertiserAddress = clientAddress || [crmCompany?.streetAddress, crmCompany?.city, crmCompany?.country].filter(Boolean).join(', ') || '[address on file]';

  const base: TemplateData = {
    contract_number: contract.id,
    contract_date: today,
    company_name: company.name || 'The Company',
    company_address: companyAddress,
    advertiser_name: client.companyName,
    advertiser_address: advertiserAddress,
    billboard_name: billboard?.name || 'the Billboard',
    billboard_location: billboard?.location || '',
    billboard_type: billboard?.type || 'Static',
    billboard_size: billboard ? `${billboard.width}m x ${billboard.height}m` : '',
    rate_block: buildRateBlock(contract, billboard, client.companyName, company.vatRate ?? VAT_RATE),
    monthly_rate: money(contract.monthlyRate),
    total_contract_value: money(contract.totalContractValue),
    start_date: contract.startDate,
    end_date: contract.endDate,
    duration_description: months > 0 ? `${months} month${months === 1 ? '' : 's'}` : 'the agreed term',
    company_signatory: '',
    company_signatory_title: 'Director',
    governing_law: company.country || 'Zimbabwe',
  };

  return { ...base, ...(overrides || {}) };
}

export function substituteTemplate(template: string, data: TemplateData): string {
  const lookup = data as unknown as Record<string, string>;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = lookup[key];
    return v !== undefined ? v : `{{${key}}}`;
  });
}

export function resolveContractTemplate(company: CompanyProfile): string {
  const trimmed = company.contractTemplate?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_CONTRACT_TEMPLATE;
}
