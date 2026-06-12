import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BarChart2,
  BarChart3,
  Building2,
  CheckCircle,
  Clock,
  DollarSign,
  Facebook,
  Globe2,
  Instagram,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Phone,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  getBillboards,
  getCompanyLogo,
  getCompanyProfile,
  getContracts,
  getHeroImageUrl,
  getPartnerLogos,
} from '../services/mockData';
import {
  addCRMCompany,
  addCRMContact,
  addCRMOpportunity,
  findCompanyByName,
  findContactByEmail,
} from '../services/crmService';
import { Billboard, BillboardType, Contract } from '../types';

const liveLogo =
  'https://static.wixstatic.com/media/33e2c5_fa30ae7289ea444186df47e4189fca0d~mv2.png/v1/crop/x_0,y_194,w_526,h_100/fill/w_678,h_136,fp_0.50_0.50,lg_1,q_85,enc_avif,quality_auto/IMG_9520__1_-removebg-preview.png';

const DEFAULT_PARTNER_LOGOS = [
  {
    name: 'Cardinal Properties',
    src: 'https://static.wixstatic.com/media/6d48c9_b05994263fed4b859517750397b8c30b~mv2.png/v1/fill/w_546,h_326,al_c,lg_1,q_85,enc_avif,quality_auto/Cardinal%20Properties%20Logo%20SQ.png',
  },
  {
    name: 'Clouds To You',
    src: 'https://static.wixstatic.com/media/6d48c9_03a536103d9a46e4a1cdb30f4f386f55~mv2.jpg/v1/fill/w_546,h_326,al_c,q_80,usm_0.66_1.00_0.01,enc_avif,quality_auto/Clouds%20to%20you%20logo%20Sq.jpg',
  },
  {
    name: 'Coca-Cola',
    src: 'https://static.wixstatic.com/media/6d48c9_cb4241c2dec5483d9587c8fa395bb4f9~mv2.jpg/v1/fill/w_546,h_326,al_c,lg_1,q_80,enc_avif,quality_auto/Coke%20logo%20sq.jpg',
  },
  {
    name: 'Colgate',
    src: 'https://static.wixstatic.com/media/6d48c9_5afcb36a36c44a27a58695b08a35acfa~mv2.jpg/v1/fill/w_546,h_326,al_c,lg_1,q_80,enc_avif,quality_auto/Colgate%20logo%20sq.jpg',
  },
  {
    name: 'National Foods',
    src: 'https://static.wixstatic.com/media/6d48c9_95cb0cc7425d45329afa4f2bfbc1bd7f~mv2.png/v1/fill/w_546,h_326,al_c,lg_1,q_85,enc_avif,quality_auto/NatFoods%20Logo%20Sq.png',
  },
  {
    name: 'Pepsi',
    src: 'https://static.wixstatic.com/media/6d48c9_f1e0ceacc8264d0b9666333f4cd583f1~mv2.jpg/v1/fill/w_546,h_326,al_c,lg_1,q_80,enc_avif,quality_auto/Pepsi%20logo%20sq.jpg',
  },
];

const liveLocationCards = [
  {
    name: 'MSASA',
    image: 'https://static.wixstatic.com/media/6d48c9_0af9ee7c9e304b5ea163ef08f62555b9~mv2.jpeg/v1/fill/w_520,h_390,al_c,q_80,enc_avif,quality_auto/WhatsApp%20Image%202025-05-03%20at%2010_55_26%20(1).jpeg',
  },
  {
    name: 'MADOKERO',
    image: 'https://static.wixstatic.com/media/6d48c9_da90a7e59ba64fd6990759dea14c05f6~mv2.jpeg/v1/fill/w_520,h_390,al_c,q_80,enc_avif,quality_auto/WhatsApp%20Image%202024-02-26%20at%2014_12_38.jpeg',
  },
  {
    name: 'AIRPORT RD',
    image: 'https://static.wixstatic.com/media/6d48c9_03971a6cc77f46bea990dbece4e44d99~mv2.jpg/v1/fill/w_520,h_390,al_c,q_80,enc_avif,quality_auto/Airport.jpg',
  },
  {
    name: 'NEWLANDS',
    image: 'https://static.wixstatic.com/media/6d48c9_964676760db84f56a413eb5a8c10c9b9~mv2.jpeg/v1/fill/w_520,h_390,al_c,q_80,enc_avif,quality_auto/WhatsApp%20Image%202025-05-03%20at%2010_55_25%20(1).jpeg',
  },
];

const testimonials = [
  {
    quote: 'Their team took the time to understand our advertising needs and crafted a customized outdoor strategy that drove real awareness.',
    name: 'Marketing Director',
    company: 'National Foods',
  },
  {
    quote: 'We highly recommend Dreambox for any business looking to make a lasting impact on Zimbabwean roads.',
    name: 'Brand Manager',
    company: 'Coca-Cola Zimbabwe',
  },
  {
    quote: 'Attention to detail and commitment to delivering results have made Dreambox our go-to outdoor media partner.',
    name: 'Operations Lead',
    company: 'Cardinal Properties',
  },
];

type PublicPage = 'home' | 'services' | 'locations' | 'faq' | 'contact';

const PAGE_META: Record<Exclude<PublicPage, 'home'>, { label: string; title: string; subtitle: string }> = {
  services: {
    label: 'What we offer',
    title: 'Services',
    subtitle: 'Billboard, airport, and digital outdoor media. Pick the canvas that fits your campaign.',
  },
  locations: {
    label: 'Network',
    title: 'Available Sites & Pricing',
    subtitle: 'Live availability and transparent monthly rates across the Dreambox network, calculated from active contracts.',
  },
  faq: {
    label: 'Answers',
    title: 'Frequently Asked Questions',
    subtitle: 'Straight answers about pricing, availability, production, and how campaigns go live.',
  },
  contact: {
    label: 'Get started',
    title: 'Contact Us',
    subtitle: 'Tell us your target towns, dates, and goals and we will prepare a client-ready quote.',
  },
};

const NAV_LINKS: { key: PublicPage; href: string; label: string }[] = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'services', href: '/services', label: 'Services' },
  { key: 'locations', href: '/site-availability', label: 'Sites & Pricing' },
  { key: 'faq', href: '/faq', label: 'FAQ' },
  { key: 'contact', href: '/contact', label: 'Contact' },
];

const FAQS = [
  {
    q: 'How much does billboard advertising cost in Zimbabwe?',
    a: 'Rates depend on the site, format, and side. Static billboard sides typically start around $450 per month, while LED digital boards are priced per rotating slot. Every card on our Sites and Pricing page shows its exact monthly rate with no hidden fees.',
  },
  {
    q: 'How do I know a billboard is actually available?',
    a: 'Availability on this website is calculated live from our active contracts. If a side or slot shows as available, it is genuinely open. You can enquire or join a waitlist directly from the site card.',
  },
  {
    q: 'What is the minimum campaign duration?',
    a: 'Most campaigns run between 3 and 12 months. We can accommodate shorter bursts for product launches and events. Tell us your dates and we will recommend the best option.',
  },
  {
    q: 'Who handles printing and installation?',
    a: 'Dreambox manages the full production chain: printing, installation, lighting checks, and ongoing maintenance for the life of your campaign. You supply print-ready artwork, or our team can assist with design.',
  },
  {
    q: 'How quickly can my campaign go live?',
    a: 'Once artwork is approved and the site is booked, campaigns typically go live within 7 to 14 days, depending on printing and installation scheduling.',
  },
  {
    q: 'Can I see a site before booking?',
    a: 'Yes. Every billboard has a public location page with photos, size, traffic data, and a map pin. We are happy to arrange an in-person site visit.',
  },
  {
    q: 'Do you offer digital (LED) billboard advertising?',
    a: 'Yes. Our LED sites sell rotating slots, so your brand shares the screen with a limited number of advertisers. Slot counts and per-slot rates are shown on each LED site card.',
  },
  {
    q: 'How does payment work?',
    a: 'Campaigns are invoiced monthly in USD. We accept bank transfer, cash, and EcoCash, and every invoice and receipt is tracked in our CRM so your statements are always accurate.',
  },
];

type AvailabilityItem = {
  board: Billboard;
  label: string;
  slotsFree: number;
  monthlyRate: number;
  priceSummary: string;
  available: boolean;
};

type EnquiryFormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  locationInterest: string;
  billboardType: string;
  campaignDuration: string;
  message: string;
  website: string;
};

const EMPTY_ENQUIRY: EnquiryFormState = {
  name: '',
  company: '',
  email: '',
  phone: '',
  locationInterest: '',
  billboardType: '',
  campaignDuration: '',
  message: '',
  website: '',
};

const LogoLockup: React.FC<{ logo?: string | null; inverted?: boolean }> = ({ logo, inverted = false }) => (
  <span className="flex items-center gap-3">
    {logo ? (
      <img
        src={logo}
        alt="Dreambox logo"
        className="h-10 w-auto max-w-[156px] object-contain"
      />
    ) : (
      <span className="flex h-10 w-10 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow-lg shadow-indigo-500/20">
        D
      </span>
    )}
    {!logo && (
      <span>
        <span className={`block text-base font-black leading-none ${inverted ? 'text-white' : 'text-slate-950'}`}>Dreambox</span>
        <span className={`block text-[10px] font-bold uppercase tracking-[0.18em] ${inverted ? 'text-indigo-200' : 'text-indigo-600'}`}>
          Advertising
        </span>
      </span>
    )}
  </span>
);

const toSlug = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const billboardLink = (b: Billboard): string => `/billboard/${toSlug(b.name)}-${b.id.slice(-8)}`;

const compactNumber = (value: number): string => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${Math.round(value / 1000)}K`;
  return value.toLocaleString();
};

const money = (value: number): string => `$${Math.round(value || 0).toLocaleString()}`;

const getPageFromPath = (): PublicPage => {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/services') return 'services';
  if (path === '/faq') return 'faq';
  if (path === '/contact') return 'contact';
  if (path === '/site-availability' || path === '/available-sites' || path === '/pricing') return 'locations';
  return 'home';
};

const getAvailableSites = (billboards: Billboard[], contracts: Contract[]): AvailabilityItem[] => {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const activeContractsFor = (billboardId: string): Contract[] =>
    contracts.filter(c =>
      c.billboardId === billboardId &&
      String(c.status || '').toLowerCase() === 'active' &&
      new Date(c.startDate) <= todayEnd &&
      new Date(c.endDate) >= todayStart
    );

  return billboards.map(board => {
    const active = activeContractsFor(board.id);

    if (board.type === BillboardType.Static) {
      const sideABooked = active.some(c => c.side === 'A' || c.side === 'Both');
      const sideBBooked = active.some(c => c.side === 'B' || c.side === 'Both');
      const availableSides = [
        !sideABooked ? 'Side A' : null,
        !sideBBooked ? 'Side B' : null,
      ].filter(Boolean) as string[];
      const availableRates = [
        !sideABooked ? board.sideARate || 0 : 0,
        !sideBBooked ? board.sideBRate || 0 : 0,
      ].filter(rate => rate > 0);
      const allRates = [board.sideARate || 0, board.sideBRate || 0].filter(rate => rate > 0);

      return {
        board,
        label: availableSides.length ? `${availableSides.join(' + ')} available` : 'Currently booked',
        slotsFree: availableSides.length,
        monthlyRate: availableRates.length ? Math.min(...availableRates) : allRates.length ? Math.min(...allRates) : 0,
        priceSummary: `A: ${board.sideARate ? money(board.sideARate) : 'Quote'} / B: ${board.sideBRate ? money(board.sideBRate) : 'Quote'}`,
        available: availableSides.length > 0,
      };
    }

    const total = board.totalSlots || 0;
    const occupiedSlots = new Set(
      active
        .filter(c => typeof c.slotNumber === 'number')
        .map(c => c.slotNumber as number)
    );
    const unnumbered = active.filter(c => typeof c.slotNumber !== 'number').length;
    const used = Math.min(total, occupiedSlots.size + unnumbered);
    const free = Math.max(0, total - used);
    return {
      board,
      label: free > 0 ? `${free} of ${total} slots available` : 'Currently booked',
      slotsFree: free,
      monthlyRate: board.ratePerSlot || 0,
      priceSummary: `${board.ratePerSlot ? money(board.ratePerSlot) : 'Quote'} / slot`,
      available: free > 0,
    };
  });
};

export const PublicWebsite: React.FC = () => {
  const [publicBillboards, setPublicBillboards] = useState<Billboard[]>(() => getBillboards());
  const billboards = publicBillboards;
  const contracts = getContracts();
  const logo = getCompanyLogo() || liveLogo;
  const profile = getCompanyProfile();
  const heroImageUrl = getHeroImageUrl();
  const storedPartnerLogos = getPartnerLogos();
  const partnerLogos = storedPartnerLogos.length ? storedPartnerLogos : DEFAULT_PARTNER_LOGOS;
  const [page, setPage] = useState<PublicPage>(() => getPageFromPath());
  const [form, setForm] = useState<EnquiryFormState>(EMPTY_ENQUIRY);
  const [enquiryStatus, setEnquiryStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cookieDismissed, setCookieDismissed] = useState(() => localStorage.getItem('db_cookie_ok') === '1');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/public-billboards')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && Array.isArray(data) && data.length) {
          setPublicBillboards(data);
        }
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, []);

  const navigate = (nextPage: PublicPage) => (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const path = nextPage === 'home' ? '/' : nextPage === 'locations' ? '/site-availability' : `/${nextPage}`;
    window.history.pushState(null, '', path);
    setPage(nextPage);
    setMobileNavOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const availableSites = useMemo(
    () => getAvailableSites(billboards, contracts),
    [billboards, contracts]
  );

  const stats = useMemo(() => {
    const towns = new Set(billboards.map(board => board.town).filter(Boolean));
    const traffic = billboards.reduce((sum, board) => sum + (board.dailyTraffic || 0), 0);

    return [
      { label: 'Managed Sites', value: billboards.length || 24 },
      { label: 'Active Towns', value: towns.size || 8 },
      { label: 'Open Placements', value: availableSites.filter(item => item.available).reduce((sum, item) => sum + item.slotsFree, 0) || 12 },
      { label: 'Daily Reach', value: traffic ? compactNumber(traffic) : '250K+' },
    ];
  }, [billboards, availableSites]);

  useEffect(() => {
    const handlePopState = () => setPage(getPageFromPath());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    document.title = page === 'home'
      ? 'Dreambox Advertising | Outdoor Media in Zimbabwe'
      : `${PAGE_META[page].title} | Dreambox Advertising`;
  }, [page]);

  const phone = profile?.phone || '+263 778 018 909';
  const email = profile?.email || 'info@dreamboxadvertising.com';
  const shownAvailability = availableSites.length ? availableSites : liveLocationCards.map((location, index) => ({
    board: {
      id: `live-${location.name}`,
      name: location.name,
      location: location.name,
      town: 'Harare',
      type: index === 2 ? BillboardType.LED : BillboardType.Static,
      width: index === 2 ? 6 : 12,
      height: index === 2 ? 3 : 3,
      imageUrl: location.image,
      coordinates: { lat: 0, lng: 0 },
      dailyTraffic: index === 2 ? 45000 : 28000 + index * 5000,
    },
    label: index === 2 ? 'Digital slots available' : 'Static placement available',
    slotsFree: index === 2 ? 4 : 1,
    monthlyRate: index === 2 ? 1200 : 850 + index * 150,
    priceSummary: index === 2 ? '$1,200 / slot' : `From $${850 + index * 150}/mo`,
    available: true,
  }));

  const createLocalLead = () => {
    const companyName = form.company.trim() || form.name.trim() || 'Website Enquiry';
    const contactName = form.name.trim() || 'Website Contact';
    const cleanEmail = form.email.trim().toLowerCase();
    const existingCompany = findCompanyByName(companyName);
    const company = existingCompany || addCRMCompany({
      name: companyName,
      industry: 'Advertising Prospect',
      website: '',
      streetAddress: '',
      city: '',
      country: 'Zimbabwe',
    });
    const existingContact = cleanEmail ? findContactByEmail(cleanEmail) : undefined;
    const contact = existingContact || addCRMContact({
      companyId: company.id,
      fullName: contactName,
      phone: form.phone.trim(),
      email: cleanEmail,
      isPrimary: true,
    });

    const selectedAvailability = shownAvailability.find(item => item.board.name === form.locationInterest);
    addCRMOpportunity({
      companyId: company.id,
      primaryContactId: contact.id,
      locationInterest: form.locationInterest || selectedAvailability?.board.town || 'Website enquiry',
      billboardType: form.billboardType || selectedAvailability?.board.type || 'Outdoor Media',
      campaignDuration: form.campaignDuration || 'To be confirmed',
      estimatedValue: selectedAvailability?.monthlyRate || undefined,
      status: 'new',
      stage: 'new_lead',
      leadSource: 'Website',
      callOutcomeNotes: form.message,
      nextFollowUpDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      createdBy: 'website',
    });
  };

  const submitEnquiry = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;
    const selectedAvailability = shownAvailability.find(item => item.board.name === form.locationInterest);

    setIsSubmitting(true);
    setEnquiryStatus('idle');

    try {
      const response = await fetch('/api/public-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          locationInterest: form.locationInterest || selectedAvailability?.board.name,
          billboardType: form.billboardType || selectedAvailability?.board.type,
          estimatedValue: selectedAvailability?.monthlyRate,
        }),
      });

      if (response.status === 400) {
        throw new Error('Validation failed');
      }

      if (!response.ok) throw new Error('Public lead API unavailable');

      setEnquiryStatus('sent');
      setForm(EMPTY_ENQUIRY);
    } catch {
      try {
        createLocalLead();
        setEnquiryStatus('sent');
        setForm(EMPTY_ENQUIRY);
      } catch {
        setEnquiryStatus('error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const EnquiryForm = ({ compact = false }: { compact?: boolean }) => (
    <form
      onSubmit={submitEnquiry}
      className={`premium-card grid gap-4 p-5 ${compact ? '' : 'sm:grid-cols-2'}`}
    >
      {enquiryStatus === 'sent' && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 sm:col-span-2">
          Enquiry captured. A new website lead has been added to the CRM.
        </div>
      )}
      {enquiryStatus === 'error' && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:col-span-2">
          Something went wrong. Please try again or contact us on WhatsApp.
        </div>
      )}
      <input name="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Name" aria-label="Name" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <input name="company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company" aria-label="Company" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <input name="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" required placeholder="Email" aria-label="Email" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <input name="phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" aria-label="Phone" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <select name="locationInterest" value={form.locationInterest} onChange={e => setForm({ ...form, locationInterest: e.target.value })} aria-label="Location interest" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
        <option value="">Location interest</option>
        {shownAvailability.slice(0, 12).map(item => (
          <option key={`${item.board.id}-${item.label}`} value={item.board.name}>{item.board.name} - {item.label}</option>
        ))}
      </select>
      <select name="billboardType" value={form.billboardType} onChange={e => setForm({ ...form, billboardType: e.target.value })} aria-label="Media type" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
        <option value="">Media type</option>
        <option value="Billboard Advertising">Billboard Advertising</option>
        <option value="Airport Advertising">Airport Advertising</option>
        <option value="Digital Billboard">Digital Billboard</option>
      </select>
      <input name="campaignDuration" value={form.campaignDuration} onChange={e => setForm({ ...form, campaignDuration: e.target.value })} placeholder="Campaign duration" aria-label="Campaign duration" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      {/* Honeypot field — hidden from real users */}
      <input
        name="website"
        value={form.website}
        onChange={e => setForm({ ...form, website: e.target.value })}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 opacity-0"
        style={{ position: 'absolute', left: '-9999px' }}
      />
      <textarea name="message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Campaign details" aria-label="Campaign details" rows={compact ? 4 : 5} className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 sm:col-span-2" />
      <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:bg-slate-400 disabled:cursor-not-allowed sm:col-span-2">
        {isSubmitting ? 'Sending...' : 'Create Website Lead'} <CheckCircle size={16} />
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 font-sans">
      <header className="fixed inset-x-0 top-0 z-50 bg-[#1e293b]/92 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <div className="hidden border-b border-white/[0.06] bg-slate-950/60 md:block">
          <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4 text-[11px] font-semibold text-white/55 sm:px-6 lg:px-8">
            <div className="flex items-center gap-6">
              <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 transition hover:text-white">
                <Phone size={11} className="text-indigo-300" /> {phone}
              </a>
              <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 transition hover:text-white">
                <Mail size={11} className="text-indigo-300" /> {email}
              </a>
              <span className="hidden items-center gap-1.5 lg:inline-flex">
                <Clock size={11} className="text-indigo-300" /> Mon&ndash;Fri, 8am&ndash;5pm CAT
              </span>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/dreamboxadvertisingzw" className="transition hover:text-white">Instagram</a>
              <a href="https://www.facebook.com/dreamboxadvertisingzim" className="transition hover:text-white">Facebook</a>
              <a href="https://wa.me/263778018909" className="inline-flex items-center gap-1.5 text-emerald-300/90 transition hover:text-emerald-200">
                <Send size={11} /> WhatsApp
              </a>
            </div>
          </div>
        </div>

        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Dreambox Advertising home">
            <LogoLockup logo={logo} inverted />
          </a>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-white/78 md:flex">
            {NAV_LINKS.map(link => (
              <a
                key={link.key}
                href={link.href}
                onClick={navigate(link.key)}
                aria-current={page === link.key ? 'page' : undefined}
                className={`group relative py-1 transition ${page === link.key ? 'text-white' : 'hover:text-white'}`}
              >
                {link.label}
                <span
                  className={`absolute inset-x-0 -bottom-1 h-0.5 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400 transition-transform duration-300 ${
                    page === link.key ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className="hidden rounded-md border border-white/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:border-white/40 hover:bg-white/10 sm:inline-flex"
            >
              Staff Login
            </a>
            <a
              href="https://wa.me/263778018909"
              className="hidden items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40 sm:inline-flex"
            >
              Book Appointment <ArrowRight size={14} />
            </a>
            <button
              type="button"
              onClick={() => setMobileNavOpen(open => !open)}
              aria-label={mobileNavOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileNavOpen}
              className="inline-flex items-center justify-center rounded-md border border-white/20 p-2.5 text-white transition hover:bg-white/10 md:hidden"
            >
              {mobileNavOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />

        {mobileNavOpen && (
          <nav className="border-t border-slate-700/50 bg-[#1e293b] px-4 py-4 md:hidden" aria-label="Mobile navigation">
            <div className="grid gap-1">
              {NAV_LINKS.map(link => (
                <a
                  key={link.key}
                  href={link.href}
                  onClick={navigate(link.key)}
                  aria-current={page === link.key ? 'page' : undefined}
                  className={`rounded-md px-3 py-3 text-sm font-semibold transition ${
                    page === link.key ? 'bg-indigo-500/15 text-white' : 'text-white/78 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {link.label}
                </a>
              ))}
              <a href="/login" className="rounded-md px-3 py-3 text-sm font-semibold text-white/78 transition hover:bg-white/5 hover:text-white">
                Staff Login
              </a>
              <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <a href={`tel:${phone}`} className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-3 text-xs font-bold text-white/78 transition hover:bg-white/5">
                  <Phone size={13} className="text-indigo-300" /> Call Us
                </a>
                <a href={`mailto:${email}`} className="inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-3 text-xs font-bold text-white/78 transition hover:bg-white/5">
                  <Mail size={13} className="text-indigo-300" /> Email Us
                </a>
              </div>
              <a
                href="https://wa.me/263778018909"
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:opacity-95"
              >
                Book Appointment <ArrowRight size={14} />
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        {page !== 'home' && (
          <section className="relative overflow-hidden bg-slate-950 pt-[72px] text-white md:pt-[108px]">
            <div className="absolute -right-24 -top-20 h-80 w-80 rounded-full bg-indigo-500/[0.12] blur-3xl" />
            <div className="absolute left-1/3 top-0 h-60 w-60 rounded-full bg-violet-500/[0.08] blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-400/50 to-transparent" />
            <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
              <nav className="animate-reveal-up text-[10px] font-black uppercase tracking-[0.2em] text-white/35" aria-label="Breadcrumb">
                <a href="/" onClick={navigate('home')} className="transition hover:text-white/70">Home</a>
                <span className="mx-2 text-white/20">/</span>
                <span className="text-indigo-300/80">{PAGE_META[page].label}</span>
              </nav>
              <h1 className="mt-3 animate-reveal-up animation-delay-100 text-4xl font-black leading-[1.08] tracking-tight sm:text-5xl">{PAGE_META[page].title}</h1>
              <p className="mt-4 max-w-xl animate-reveal-up animation-delay-200 text-sm leading-7 text-white/55 sm:text-[15px]">{PAGE_META[page].subtitle}</p>
            </div>
          </section>
        )}

        {page === 'home' && <section className="relative min-h-[94vh] overflow-hidden bg-slate-950 pt-[72px] text-white md:pt-[108px]">
          {heroImageUrl ? (
            <>
              <img
                src={heroImageUrl}
                alt="Hero background"
                loading="eager"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover animate-image-drift"
              />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.94)_0%,rgba(15,23,42,0.82)_45%,rgba(15,23,42,0.38)_100%)]" />
            </>
          ) : (
            <>
              {/* Depth gradient — base */}
              <div className="absolute inset-0 bg-[linear-gradient(155deg,#020617_0%,#0d1224_28%,#14103a_60%,#080c1e_100%)]" />
              {/* Radial glow — top-right indigo */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_85%_70%_at_74%_8%,rgba(99,102,241,0.30)_0%,transparent_62%)]" />
              {/* Radial glow — bottom-left violet */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_52%_at_6%_84%,rgba(109,40,217,0.20)_0%,transparent_58%)]" />
              {/* Animated orb — primary */}
              <div className="absolute right-[11%] top-[13%] h-[520px] w-[520px] animate-glow-pulse rounded-full bg-indigo-500/[0.11] blur-[140px]" />
              {/* Animated orb — secondary, offset phase */}
              <div className="absolute left-[4%] bottom-[22%] h-[380px] w-[380px] animate-glow-pulse rounded-full bg-violet-600/[0.09] blur-[110px]" style={{ animationDelay: '-4s' }} />
              {/* Subtle perspective grid */}
              <div className="hero-depth-grid absolute inset-0 opacity-[0.05]" />
            </>
          )}
          {/* Bottom fade to merge with next section */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
          <div className="relative mx-auto grid min-h-[calc(94vh-72px)] max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 md:min-h-[calc(94vh-108px)] lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex animate-reveal-up items-center gap-2 rounded-full border border-indigo-400/25 bg-white/[0.07] px-4 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-indigo-200 backdrop-blur-sm">
                <Sparkles size={11} className="text-indigo-300" />
                Zimbabwe&apos;s Outdoor Media Partner
              </div>
              <h1 className="max-w-3xl text-[2.6rem] font-black leading-[1.06] tracking-tight text-white sm:text-6xl lg:text-[4.5rem]">
                {'Outdoor media that puts your brand'.split(' ').map((word, index) => (
                  <span
                    key={index}
                    className="inline-block animate-reveal-up"
                    style={{ animationDelay: `${120 + index * 90}ms` }}
                  >
                    {word}&nbsp;
                  </span>
                ))}
                <span
                  className="inline-block animate-reveal-up bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-200 bg-clip-text text-transparent"
                  style={{ animationDelay: '660ms' }}
                >
                  in motion.
                </span>
              </h1>
              <p className="mt-6 max-w-lg animate-reveal-up animation-delay-200 text-[15px] leading-7 text-white/70 sm:text-base">
                Dreambox helps Zimbabwean brands choose visible billboard and digital outdoor placements, with clear pricing and a dedicated team behind every campaign.
              </p>
              <div className="mt-8 flex animate-reveal-up animation-delay-300 flex-col gap-3 sm:flex-row">
                <a
                  href="/site-availability"
                  onClick={navigate('locations')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-7 py-3.5 text-sm font-black uppercase tracking-wide text-slate-950 shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:bg-indigo-50"
                >
                  Explore Locations <MapPin size={15} />
                </a>
                <a
                  href="/contact"
                  onClick={navigate('contact')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white/[0.07] px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/[0.12]"
                >
                  Request a Quote <ArrowRight size={15} />
                </a>
              </div>
              <div className="mt-7 flex animate-reveal-up animation-delay-300 flex-wrap gap-x-6 gap-y-2.5">
                {['Verified, maintained sites', 'Transparent monthly rates', 'Response within 24 hours'].map(item => (
                  <span key={item} className="inline-flex items-center gap-2 text-xs font-semibold text-white/55">
                    <CheckCircle size={13} className="text-emerald-400/80" /> {item}
                  </span>
                ))}
              </div>
              <div className="mt-9 grid max-w-xl animate-reveal-up animation-delay-500 grid-cols-2 gap-2.5 sm:grid-cols-4">
                {stats.map(item => (
                  <div key={item.label} className="rounded-xl border border-white/[0.08] bg-white/[0.05] p-3.5 backdrop-blur-sm">
                    <div className="text-xl font-black text-white">{item.value}</div>
                    <div className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/38">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="ml-auto max-w-[380px] animate-soft-scale animation-delay-300 overflow-hidden rounded-2xl border border-white/[0.1] bg-white/[0.05] backdrop-blur-xl">
                {/* Shimmer line */}
                <div className="relative h-px overflow-hidden bg-white/10">
                  <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-indigo-300/60 to-transparent animate-line-sweep" />
                </div>
                {/* Billboard photo */}
                <div className="overflow-hidden">
                  <img src={liveLocationCards[0].image} alt="Dreambox billboard location preview" loading="eager" decoding="async" className="h-56 w-full object-cover opacity-90" />
                </div>
                {/* Content */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">Featured inventory</p>
                      <h2 className="mt-1.5 text-xl font-black leading-tight text-white">Live site availability</h2>
                      <p className="mt-1.5 text-sm leading-6 text-white/55">Browse every CRM billboard with side, slot, and pricing status.</p>
                    </div>
                    <div className="shrink-0 rounded-lg bg-emerald-400 px-3 py-2 text-center">
                      <div className="text-base font-black text-slate-950">{availableSites.filter(item => item.available).length || shownAvailability.length}</div>
                      <div className="text-[9px] font-black uppercase tracking-wide text-slate-800">Open</div>
                    </div>
                  </div>
                  <a
                    href="/site-availability"
                    onClick={navigate('locations')}
                    className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/[0.08] px-5 py-2.5 text-xs font-black uppercase tracking-wide text-white transition hover:bg-white/[0.14]"
                  >
                    View All Sites <ArrowRight size={13} />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>}

        {(page === 'home') && <section id="partners" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="animate-reveal-up">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Our valued partners</p>
              <h2 className="mt-2 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Trusted by great Zimbabwean brands.
              </h2>
            </div>
            <p className="animate-reveal-up animation-delay-100 text-sm text-slate-500 sm:max-w-xs sm:text-right">
              Brands that count on Dreambox for outdoor presence across Zimbabwe.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 sm:grid-cols-3">
            {partnerLogos.map((partner, index) => (
              <div
                key={partner.name}
                className="group flex h-28 animate-reveal-up items-center justify-center bg-white p-6 transition duration-300 hover:bg-slate-50"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <img
                  src={partner.src}
                  alt={`${partner.name} logo`}
                  loading="lazy"
                  decoding="async"
                  className="max-h-12 max-w-full object-contain opacity-50 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0"
                />
              </div>
            ))}
          </div>
        </section>}

        {(page === 'home' || page === 'services') && <section id="services" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="mb-14 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="animate-reveal-up">
              {page !== 'services' && <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-500">What we offer</p>}
              <h2 className="max-w-sm text-4xl font-black leading-[1.07] tracking-tight text-slate-950 sm:text-5xl">
                Where do you want to advertise?
              </h2>
            </div>
            <p className="max-w-md animate-reveal-up animation-delay-100 text-[15px] leading-7 text-slate-500">
              Dreambox delivers billboard and digital out-of-home placements that put your brand in front of the right audience.
            </p>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {[
              {
                icon: Target,
                num: '01',
                title: 'Billboard Advertising',
                body: 'Highly visual, brand-building outdoor media for campaigns that demand street-level attention across Zimbabwe\'s busiest corridors.',
                meta: 'Static roadside media',
                delay: 0,
              },
              {
                icon: Megaphone,
                num: '02',
                title: 'Digital Billboard',
                body: 'High-impact LED out-of-home placements with rotating slots, built for dominant, iconic visibility at premium intersections.',
                meta: 'LED & rotating slots',
                delay: 120,
              },
            ].map((service) => (
              <article
                key={service.title}
                className="group relative animate-reveal-up overflow-hidden rounded-2xl border border-slate-100 bg-white p-8 shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:border-indigo-100 hover:shadow-xl hover:shadow-indigo-500/[0.07]"
                style={{ animationDelay: `${service.delay}ms` }}
              >
                {/* Hover glow */}
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-indigo-500/[0.06] blur-3xl transition-opacity duration-500 opacity-0 group-hover:opacity-100" />
                {/* Top shimmer line */}
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/0 to-transparent transition-all duration-500 group-hover:via-indigo-400/60" />

                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100/80 transition-all duration-300 group-hover:bg-indigo-600 group-hover:text-white group-hover:ring-indigo-600">
                    <service.icon className="h-6 w-6 transition-transform duration-300 group-hover:scale-110" />
                  </div>
                  <span className="font-black text-slate-200 transition-colors duration-300 group-hover:text-indigo-200" style={{ fontSize: '2.5rem', lineHeight: 1 }}>
                    {service.num}
                  </span>
                </div>

                <h3 className="mt-7 text-2xl font-black leading-tight tracking-tight text-slate-950">{service.title}</h3>
                <p className="mt-3 text-[15px] leading-7 text-slate-500">{service.body}</p>

                <div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5">
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-500 transition-colors duration-300 group-hover:text-indigo-600">
                    {service.meta}
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-slate-400 transition-all duration-300 group-hover:border-indigo-200 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                    <ArrowRight size={13} className="transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>}

        {page === 'home' && <section id="why-dreambox" className="bg-slate-950 py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-16 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="animate-reveal-up">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-400">Why Dreambox</p>
                <h2 className="max-w-sm text-4xl font-black leading-[1.07] tracking-tight text-white sm:text-5xl">
                  Built for brands that need results.
                </h2>
              </div>
              <p className="max-w-md animate-reveal-up animation-delay-100 text-[15px] leading-7 text-slate-400">
                Every part of the Dreambox process is designed to remove guesswork and get your campaign visible faster.
              </p>
            </div>

            <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-4 rounded-2xl overflow-hidden">
              {[
                {
                  num: '01',
                  icon: CheckCircle,
                  title: 'Verified sites',
                  body: 'Every location is physically audited, photographed, and mapped. No phantom inventory or stale listings.',
                  stat: '100%',
                  statLabel: 'audited network',
                  delay: 0,
                },
                {
                  num: '02',
                  icon: DollarSign,
                  title: 'Transparent pricing',
                  body: 'Monthly rates are displayed on every site card. No negotiation theatre, no hidden production markups.',
                  stat: '$0',
                  statLabel: 'hidden fees',
                  delay: 80,
                },
                {
                  num: '03',
                  icon: Zap,
                  title: '7 to 14 day go-live',
                  body: 'Once artwork is approved and the site is booked, your campaign is printed, installed, and live within two weeks.',
                  stat: '14',
                  statLabel: 'days to live',
                  delay: 160,
                },
                {
                  num: '04',
                  icon: BarChart2,
                  title: 'CRM-tracked campaigns',
                  body: 'Every contract, invoice, and campaign milestone is logged in our system so your team always has a clear record.',
                  stat: '1',
                  statLabel: 'source of truth',
                  delay: 240,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="group relative animate-reveal-up bg-slate-950 p-8 transition-colors duration-300 hover:bg-slate-900"
                  style={{ animationDelay: `${item.delay}ms` }}
                >
                  {/* top accent line on hover */}
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/0 to-transparent transition-all duration-500 group-hover:via-indigo-500" />

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 transition-all duration-300 group-hover:bg-indigo-500 group-hover:text-white group-hover:ring-indigo-500">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <span className="font-black text-white/10 transition-colors duration-300 group-hover:text-indigo-500/30" style={{ fontSize: '2rem', lineHeight: 1 }}>
                      {item.num}
                    </span>
                  </div>

                  <div className="mt-8 border-b border-white/[0.06] pb-6">
                    <div className="text-4xl font-black tracking-tight text-white">{item.stat}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">{item.statLabel}</div>
                  </div>

                  <h3 className="mt-6 text-base font-black text-white">{item.title}</h3>
                  <p className="mt-2 text-[13px] leading-6 text-slate-400">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>}

        {page === 'home' && <section id="how-it-works" className="bg-white py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">How it works</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Book a campaign in three steps.
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
                From shortlist to street in as little as two weeks, with a real team and live availability behind every step.
              </p>
            </div>
            <div className="relative mt-12 grid gap-5 md:grid-cols-3">
              <div className="absolute inset-x-[16%] top-10 hidden h-px bg-gradient-to-r from-indigo-200 via-violet-300 to-indigo-200 md:block" aria-hidden="true" />
              {[
                { icon: MapPin, step: '01', title: 'Pick your site', body: 'Browse live availability and transparent rates across the network, then shortlist the placements that fit your audience.', delay: 'animation-delay-100' },
                { icon: Send, step: '02', title: 'Get your quote', body: 'Send an enquiry. Our team responds within 24 hours with a no-obligation, client-ready quotation.', delay: 'animation-delay-200' },
                { icon: Megaphone, step: '03', title: 'Go live', body: 'We handle printing, installation, and maintenance while you track your campaign from day one.', delay: 'animation-delay-300' },
              ].map(item => (
                <div key={item.step} className={`premium-card premium-card-hover relative animate-reveal-up ${item.delay} p-7 text-center`}>
                  <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-xl shadow-indigo-500/25 ring-4 ring-white">
                    <item.icon className="h-8 w-8" />
                    <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950 text-[10px] font-black text-white ring-2 ring-white">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="mt-6 text-lg font-black text-slate-950">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{item.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-10 text-center">
              <a
                href="/site-availability"
                onClick={navigate('locations')}
                className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-7 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-xl shadow-indigo-500/25 transition hover:-translate-y-0.5"
              >
                Start with Step One <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </section>}

        {page === 'home' && <section id="industries" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="animate-reveal-up">
              <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-500">Industries served</p>
              <h2 className="max-w-xs text-3xl font-black leading-tight tracking-tight text-slate-950 sm:text-4xl">
                Who we work with.
              </h2>
            </div>
            <p className="max-w-md animate-reveal-up animation-delay-100 text-[15px] leading-7 text-slate-500">
              Dreambox serves brands across every major category active in the Zimbabwean market.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              'FMCG', 'Telecommunications', 'Banking and Finance', 'Real Estate',
              'Retail', 'Government and NGO', 'Healthcare', 'Automotive',
              'Hospitality and Tourism', 'Education', 'Insurance', 'Media and Entertainment',
            ].map((industry, i) => (
              <span
                key={industry}
                className="animate-reveal-up rounded-full border border-slate-200 bg-white px-5 py-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {industry}
              </span>
            ))}
          </div>
        </section>}

        {page === 'faq' && <section id="faq" className="bg-white py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="space-y-3">
              {FAQS.map((faq, index) => (
                <details
                  key={faq.q}
                  className="premium-card group animate-reveal-up overflow-hidden"
                  style={{ animationDelay: `${index * 70}ms` }}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-sm font-black text-slate-950 transition hover:text-indigo-700 sm:text-base [&::-webkit-details-marker]:hidden">
                    {faq.q}
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100 transition-transform duration-300 group-open:rotate-45">
                      <Plus size={15} />
                    </span>
                  </summary>
                  <p className="border-t border-slate-100 p-5 text-sm leading-7 text-slate-600">{faq.a}</p>
                </details>
              ))}
            </div>
            <div className="premium-card mt-10 flex flex-col items-center gap-4 p-7 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <h3 className="text-base font-black text-slate-950">Still have a question?</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">Our team answers every enquiry within 24 hours.</p>
              </div>
              <a
                href="https://wa.me/263778018909"
                className="inline-flex shrink-0 items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5"
              >
                WhatsApp Us <Send size={14} />
              </a>
            </div>
          </div>
        </section>}

        {(page === 'home' || page === 'locations') && <section id="network" className="bg-slate-950 py-20 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
              <div>
                {page !== 'locations' && (
                  <>
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Network</p>
                    <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Available Sites & Prices</h2>
                  </>
                )}
                <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">
                  Every CRM billboard is listed here. Availability is calculated from active contracts, with side and LED slot status shown on each card.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {page === 'home' && (
                  <a
                    href="/site-availability"
                    onClick={navigate('locations')}
                    className="inline-flex w-fit items-center gap-2 rounded-md bg-indigo-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-indigo-400"
                  >
                    View All Sites <ArrowRight size={15} />
                  </a>
                )}
                <a
                  href="/locations"
                  className="inline-flex w-fit items-center gap-2 rounded-md border border-white/20 px-5 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-white/10"
                >
                  Open Map <Globe2 size={15} />
                </a>
              </div>
            </div>

            {shownAvailability.length > 0 ? (
              <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {shownAvailability.map((item, index) => (
                <a
                  key={`${item.board.id}-${item.label}`}
                  href={item.board.id.startsWith('live-') ? '/contact' : billboardLink(item.board)}
                  onClick={item.board.id.startsWith('live-') ? navigate('contact') : undefined}
                  className="premium-dark-card premium-dark-card-hover group animate-reveal-up"
                  style={{ animationDelay: `${(index % 6) * 80}ms` }}
                >
                  <div className="relative h-60 overflow-hidden bg-slate-800">
                    {item.board.imageUrl ? (
                      <img src={item.board.imageUrl} alt={item.board.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-3 bg-white">
                        <Building2 className="h-10 w-10 text-slate-200" />
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">Photo coming soon</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                    <span className="absolute left-4 top-4 rounded-md bg-indigo-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                      {item.board.type}
                    </span>
                    <span className={`absolute right-4 top-4 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${
                      item.available ? 'bg-emerald-400 text-slate-950' : 'bg-slate-200 text-slate-700'
                    }`}>
                      {item.label}
                    </span>
                    <span className="absolute bottom-4 left-4 right-4 text-lg font-black text-white">{item.board.name}</span>
                  </div>
                  <div className="p-5">
                    <p className="mt-2 flex items-center gap-2 text-sm text-white/68">
                      <MapPin size={14} /> {item.board.location}, {item.board.town}
                    </p>
                    <div className="mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">From</p>
                        <p className="mt-1 text-sm font-black text-white">
                          {item.monthlyRate ? money(item.monthlyRate) : 'Quote'}
                          {item.monthlyRate ? <span className="text-[10px] font-semibold text-white/45">/mo</span> : null}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">Size</p>
                        <p className="mt-1 text-sm font-black text-white">{item.board.width}x{item.board.height}m</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">Traffic</p>
                        <p className="mt-1 text-sm font-black text-white">{item.board.dailyTraffic ? compactNumber(item.board.dailyTraffic) : '-'}</p>
                      </div>
                    </div>
                    <div className="mt-4 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/38">Prices</p>
                      <p className="mt-1 text-xs font-bold text-white/78">{item.priceSummary}</p>
                    </div>
                    <div className="mt-5 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setForm(prev => ({
                            ...prev,
                            locationInterest: item.board.name,
                            billboardType: String(item.board.type),
                          }));
                          setPage('contact');
                          window.history.pushState(null, '', '/contact');
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide transition ${
                          item.available
                            ? 'bg-white text-slate-950 hover:bg-indigo-50'
                            : 'bg-slate-700 text-white hover:bg-slate-600'
                        }`}
                      >
                        {item.available ? 'Enquire' : 'Join Waitlist'}
                      </button>
                      <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-indigo-200">
                        Details <ArrowRight size={13} />
                      </span>
                    </div>
                  </div>
                </a>
                ))}
              </div>
            ) : (
              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {liveLocationCards.map(location => (
                  <a
                    key={location.name}
                    href="/locations"
                    className="premium-dark-card premium-dark-card-hover group animate-reveal-up"
                  >
                    <div className="relative h-64 overflow-hidden bg-slate-800">
                      <img src={location.image} alt={`${location.name} billboard location`} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />
                      <span className="absolute left-4 top-4 rounded-md bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-950 backdrop-blur">
                        Billboard Site
                      </span>
                      <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="text-xl font-black text-white">{location.name}</h3>
                        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white/72">
                          <MapPin size={14} /> Zimbabwe outdoor media
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-5">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/55">Location preview</span>
                      <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-indigo-200">
                        Explore <ArrowRight size={13} />
                      </span>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>}

        {(page === 'home' || page === 'locations') && <section id="pricing" className="bg-white py-20">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Our full service pricing</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Build ROI into your media campaign.
              </h2>
            </div>
            <div className="premium-card p-6">
              <p className="text-sm leading-7 text-slate-600">
                Creating ROI for your media campaign should be a primary aim. Dreambox positions its rates around strong media value for brands across Africa.
              </p>
              <p className="mt-4 text-sm leading-7 text-slate-600">
                Get in touch for service details, availability, and general enquiries.
              </p>
              <a
                href="https://wa.me/263778018909"
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-indigo-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
              >
                Get a Quotation <ArrowRight size={15} />
              </a>
            </div>
          </div>
        </section>}

        {(page === 'home' || page === 'services') && <section className="mx-auto grid max-w-7xl gap-5 px-4 py-20 sm:px-6 md:grid-cols-3 lg:px-8">
          {[
            { icon: ShieldCheck, title: 'Reliable Sites', body: 'Every placement is backed by maintained inventory and a team that follows through.' },
            { icon: Clock, title: 'Fast Turnaround', body: 'Move from location shortlist to quote, artwork, and installation with fewer handoffs.' },
            { icon: Users, title: 'Buyer Friendly', body: 'Public location pages make it easier to inspect placements before committing budget.' },
          ].map((item, index) => (
            <div key={item.title} className="premium-card premium-card-hover flex animate-reveal-up gap-4 p-6" style={{ animationDelay: `${index * 100}ms` }}>
              <item.icon className="mt-1 h-6 w-6 shrink-0 text-indigo-600" />
              <div>
                <h3 className="font-black text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.body}</p>
              </div>
            </div>
          ))}
        </section>}

        {(page === 'home') && <section className="bg-slate-950 py-20 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">What people are saying</p>
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Clients trust Dreambox Media.</h2>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {testimonials.map((item, index) => (
                <blockquote key={item.quote} className="premium-dark-card premium-dark-card-hover flex animate-reveal-up flex-col p-6" style={{ animationDelay: `${index * 100}ms` }}>
                  <div className="flex gap-1 text-amber-300" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, star) => (
                      <Star key={star} size={14} fill="currentColor" strokeWidth={0} />
                    ))}
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-7 text-white/78">&ldquo;{item.quote}&rdquo;</p>
                  <footer className="mt-5 border-t border-white/10 pt-4">
                    <p className="text-sm font-black text-white">{item.name}</p>
                    <p className="text-xs font-semibold text-indigo-200">{item.company}</p>
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>}

        <section id="contact" className="bg-white py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Get started</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Bring your next campaign to the streets.
              </h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-600">
                Tell us your target towns, dates, and campaign goal. The Dreambox team can recommend sites and prepare a client-ready quote.
              </p>
              <div className="mt-8 space-y-3 text-sm font-semibold text-slate-800">
                <a href={`tel:${phone}`} className="flex items-center gap-3 hover:text-slate-950">
                  <Phone size={18} className="text-indigo-600" /> {phone}
                </a>
                <a href={`mailto:${email}`} className="flex items-center gap-3 hover:text-slate-950">
                  <Mail size={18} className="text-indigo-600" /> {email}
                </a>
                <a href="https://wa.me/263778018909" className="flex items-center gap-3 hover:text-slate-950">
                  <Globe2 size={18} className="text-indigo-600" /> WhatsApp Dreambox
                </a>
              </div>
            </div>
            <EnquiryForm />
          </div>
        </section>
      </main>

      <section aria-label="Start a campaign" className="relative overflow-hidden bg-slate-950 px-4 pt-20 text-white sm:px-6 lg:px-8">
        <div className="relative mx-auto max-w-7xl">
          <div className="premium-accent-card p-8 sm:p-12">
            <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="relative grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-indigo-100">Ready when you are</p>
                <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-white sm:text-4xl">
                  Put your brand on Zimbabwe&apos;s busiest roads.
                </h2>
                <p className="mt-4 max-w-lg text-sm leading-7 text-white/75">
                  Send your target towns, dates, and budget. Every enquiry reaches our team as a tracked CRM lead &mdash; no forms lost, no follow-up missed.
                </p>
                <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2.5">
                  {['No-obligation quote', 'Response within 24 hours', 'Live availability before you commit'].map(item => (
                    <span key={item} className="inline-flex items-center gap-2 text-xs font-bold text-white/78">
                      <CheckCircle size={14} className="text-emerald-300" /> {item}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 lg:items-end">
                <a
                  href="/contact"
                  onClick={navigate('contact')}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-7 py-4 text-sm font-black uppercase tracking-wide text-slate-950 shadow-xl shadow-slate-950/30 transition hover:-translate-y-0.5 hover:bg-indigo-50 lg:w-auto"
                >
                  Start a Campaign <ArrowRight size={16} />
                </a>
                <a
                  href="https://wa.me/263778018909"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-white/30 bg-white/10 px-7 py-4 text-sm font-bold uppercase tracking-wide text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15 lg:w-auto"
                >
                  WhatsApp Us <Send size={15} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative overflow-hidden bg-slate-950 px-4 pb-10 pt-16 text-white sm:px-6 lg:px-8">
        <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute -bottom-32 left-8 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1.3fr_0.7fr_0.7fr_1fr]">
          <div className="max-w-md">
            <LogoLockup logo={logo} inverted />
            <p className="mt-5 max-w-sm text-sm leading-7 text-white/65">
              Outdoor advertising in Zimbabwe for brands that need their message seen, understood, and remembered.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {['Billboards', 'Airport Media', 'Digital OOH'].map(label => (
                <span key={label} className="rounded-md border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-100">
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-7 flex gap-2.5">
              {[
                { href: 'https://www.instagram.com/dreamboxadvertisingzw', label: 'Instagram', icon: Instagram },
                { href: 'https://www.facebook.com/dreamboxadvertisingzim', label: 'Facebook', icon: Facebook },
                { href: 'https://wa.me/263778018909', label: 'WhatsApp', icon: Send },
              ].map(social => (
                <a
                  key={social.label}
                  href={social.href}
                  aria-label={social.label}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-white/65 transition hover:-translate-y-0.5 hover:border-indigo-300/40 hover:bg-indigo-500/15 hover:text-white"
                >
                  <social.icon size={16} />
                </a>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">Explore</h3>
            <div className="mt-2.5 h-0.5 w-8 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
            <div className="mt-5 grid gap-3 text-sm font-semibold text-white/72">
              {NAV_LINKS.filter(link => link.key !== 'home').map(link => (
                <a
                  key={link.key}
                  href={link.href}
                  onClick={navigate(link.key)}
                  className="group inline-flex items-center gap-2 transition hover:text-white"
                >
                  <ArrowRight size={12} className="-ml-5 text-indigo-300 opacity-0 transition-all duration-200 group-hover:ml-0 group-hover:opacity-100" />
                  {link.label}
                </a>
              ))}
              <a href="/login" className="group inline-flex items-center gap-2 transition hover:text-white">
                <ArrowRight size={12} className="-ml-5 text-indigo-300 opacity-0 transition-all duration-200 group-hover:ml-0 group-hover:opacity-100" />
                Staff Login
              </a>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">Services</h3>
            <div className="mt-2.5 h-0.5 w-8 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
            <div className="mt-5 grid gap-3 text-sm font-semibold text-white/72">
              {['Billboard Advertising', 'Airport Advertising', 'Digital Billboards'].map(label => (
                <a
                  key={label}
                  href="/services"
                  onClick={navigate('services')}
                  className="group inline-flex items-center gap-2 transition hover:text-white"
                >
                  <ArrowRight size={12} className="-ml-5 text-indigo-300 opacity-0 transition-all duration-200 group-hover:ml-0 group-hover:opacity-100" />
                  {label}
                </a>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">Contact</h3>
            <div className="mt-2.5 h-0.5 w-8 rounded-full bg-gradient-to-r from-indigo-400 to-violet-400" />
            <div className="mt-5 grid gap-3 text-sm font-semibold text-white/72">
              <a href={`tel:${phone}`} className="inline-flex items-start gap-3 transition hover:text-white">
                <Phone size={16} className="mt-0.5 shrink-0 text-indigo-300" /> {phone}
              </a>
              <a href={`mailto:${email}`} className="inline-flex items-start gap-3 break-all transition hover:text-white">
                <Mail size={16} className="mt-0.5 shrink-0 text-indigo-300" /> {email}
              </a>
              <span className="inline-flex items-start gap-3">
                <MapPin size={16} className="mt-0.5 shrink-0 text-indigo-300" />
                <span>54 Brooke Village, Borrowdale Brooke, Harare</span>
              </span>
              <span className="inline-flex items-start gap-3">
                <Clock size={16} className="mt-0.5 shrink-0 text-indigo-300" /> Mon&ndash;Fri, 8am&ndash;5pm CAT
              </span>
            </div>
          </div>
        </div>

        <div className="relative mx-auto mt-12 max-w-7xl">
          <div className="h-px bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          <div className="flex flex-col gap-3 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; 2026 Dreambox Advertising (Pvt) Ltd. All rights reserved. Harare, Zimbabwe.</p>
            <p className="inline-flex items-center gap-2">
              <ShieldCheck size={13} className="text-emerald-400" /> Powered by Dreambox CRM
            </p>
            <p className="text-white/30">
              Built and maintained by{' '}
              <a
                href="https://spiritus.co.zw"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-white/50 transition hover:text-white"
              >
                Spiritus Systems
              </a>
            </p>
          </div>
        </div>
      </footer>

      {/* Cookie notice */}
      {!cookieDismissed && (
        <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-4xl items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-950/10 sm:items-center sm:gap-6 sm:rounded-xl sm:p-4">
            <div className="flex-1 text-[13px] leading-6 text-slate-600">
              <span className="font-black text-slate-950">We use cookies</span> to keep the site functional and understand how visitors use it. No advertising or third-party tracking.{' '}
              <a href="/privacy" className="font-semibold text-indigo-600 underline-offset-2 hover:underline">
                Privacy policy
              </a>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => { localStorage.setItem('db_cookie_ok', '1'); setCookieDismissed(true); }}
                className="rounded-lg bg-slate-950 px-4 py-2 text-xs font-black uppercase tracking-wide text-white transition hover:bg-slate-800"
              >
                Accept
              </button>
              <button
                onClick={() => { localStorage.setItem('db_cookie_ok', '1'); setCookieDismissed(true); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:bg-slate-50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
