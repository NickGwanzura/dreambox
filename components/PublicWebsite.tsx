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
  getCampaignGallery,
  getCompanyLogo,
  getCompanyProfile,
  getContracts,
  getHeroImageUrl,
  getPartnerLogos,
  subscribe,
} from '../services/mockData';
import {
  addCRMCompany,
  addCRMContact,
  addCRMOpportunity,
  findCompanyByName,
  findContactByEmail,
} from '../services/crmService';
import { Billboard, BillboardType, Contract } from '../types';

const HERO_VIDEO_URL = 'https://pub-14569e32d4434e8d9db6cbdfe16b96f4.r2.dev/videoplayback%20(2).mp4';

// No hardcoded demo logos — an empty list until the real, uploaded partner
// logos load from /api/public-profile. Showing placeholder brand logos
// (previously Coca-Cola, Pepsi, etc.) risked implying an endorsement that
// was never given.
const DEFAULT_PARTNER_LOGOS: { name: string; src: string }[] = [];


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

type PublicPage = 'home' | 'services' | 'locations' | 'faq' | 'contact' | 'privacy' | 'terms';

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
  privacy: {
    label: 'Legal',
    title: 'Privacy Policy',
    subtitle: 'How Dreambox Advertising collects, uses, and protects your personal information.',
  },
  terms: {
    label: 'Legal',
    title: 'Terms of Use',
    subtitle: 'The terms and conditions that govern your use of the Dreambox Advertising website.',
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
    a: 'Once artwork is approved and the site is booked, campaigns typically go live within 3 days. Our team handles printing, installation, and all logistics to get you up as fast as possible.',
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
  (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const billboardLink = (b: Billboard): string => `/billboard/${toSlug(b.name)}-${b.id.slice(-8)}`;

/** Extract a YouTube video ID from an img.youtube.com thumbnail URL */
const getYouTubeIdFromThumbnail = (url: string): string | null => {
  const m = url.match(/img\.youtube\.com\/vi\/([a-zA-Z0-9_-]+)\//);
  return m ? m[1] : null;
};

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
  if (path === '/privacy' || path === '/privacy-policy') return 'privacy';
  if (path === '/terms' || path === '/terms-of-use') return 'terms';
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
  const [logo, setLogo] = useState<string | null>(() => getCompanyLogo());
  const profile = getCompanyProfile();
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(() => getHeroImageUrl());
  const [partnerLogos, setPartnerLogos] = useState<{ name: string; src: string }[]>(() => {
    const stored = getPartnerLogos();
    return stored.length ? stored : DEFAULT_PARTNER_LOGOS;
  });
  const [campaignGallery, setCampaignGallery] = useState<{ src: string }[]>(() => getCampaignGallery());

  // Re-read logo, hero image, partner logos, and campaign gallery when mockData state changes
  useEffect(() => {
    const unsubscribe = subscribe(() => {
      setLogo(getCompanyLogo());
      setHeroImageUrl(getHeroImageUrl());
      const stored = getPartnerLogos();
      setPartnerLogos(stored.length ? stored : DEFAULT_PARTNER_LOGOS);
      setCampaignGallery(getCampaignGallery());
    });
    return () => unsubscribe();
  }, []);
  const [page, setPage] = useState<PublicPage>(() => getPageFromPath());
  const [form, setForm] = useState<EnquiryFormState>(EMPTY_ENQUIRY);
  const [enquiryStatus, setEnquiryStatus] = useState<'idle' | 'sent' | 'error'>('idle');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [cookieDismissed, setCookieDismissed] = useState(() => localStorage.getItem('db_cookie_ok') === '1');
  const [heroSlide, setHeroSlide] = useState(0);

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

    fetch('/api/public-profile')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data) {
          if (data.logo) {
            setLogo(data.logo);
          }
          if (data.heroImageUrl) {
            setHeroImageUrl(data.heroImageUrl);
          }
          if (data.partnerLogos) {
            try {
              const parsed = JSON.parse(data.partnerLogos);
              if (Array.isArray(parsed) && parsed.length) {
                setPartnerLogos(parsed);
              }
            } catch { /* ignore parse errors */ }
          }
          if (data.campaignGallery) {
            try {
              const parsed = JSON.parse(data.campaignGallery);
              if (Array.isArray(parsed) && parsed.length) {
                setCampaignGallery(parsed);
              }
            } catch { /* ignore parse errors */ }
          }
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
  };

  // Scroll to top AFTER React renders the new page content, not before.
  // The old approach called scrollTo before the DOM changed, which caused the
  // browser to clamp scroll position to the (shorter) new page height first,
  // making it appear to snap from the bottom before scrolling up.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  const availableSites = useMemo(
    () => getAvailableSites(billboards, contracts),
    [billboards, contracts]
  );
  useEffect(() => {
    if (availableSites.length <= 1) return;
    const t = setInterval(() => setHeroSlide(s => (s + 1) % availableSites.length), 4500);
    return () => clearInterval(t);
  }, [availableSites.length]);

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
  const shownAvailability = availableSites;
  const digitalAvailability = shownAvailability.filter(item => {
    const type = String(item.board.type || '').toLowerCase();
    return type.includes('led') || type.includes('digital');
  });
  const featuredDigitalSites = digitalAvailability.length
    ? digitalAvailability.slice(0, 3)
    : shownAvailability.filter(item => item.board.type === BillboardType.LED).slice(0, 3);

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
          Thank you — we've received your enquiry and will be in touch within 24 hours.
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
      <button type="submit" disabled={isSubmitting} className="inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40 disabled:from-slate-400 disabled:to-slate-400 disabled:translate-y-0 disabled:cursor-not-allowed sm:col-span-2">
        {isSubmitting ? 'Sending...' : 'Send Enquiry'} <Send size={16} />
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
              <a href="https://www.instagram.com/dreamboxadvertisingzw" className="inline-flex items-center gap-1.5 transition hover:text-white">
                <Instagram size={11} className="text-indigo-300" /> Instagram
              </a>
              <a href="https://www.facebook.com/dreamboxadvertisingzim" className="inline-flex items-center gap-1.5 transition hover:text-white">
                <Facebook size={11} className="text-indigo-300" /> Facebook
              </a>
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
              Get a Quote <ArrowRight size={14} />
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
                className="mt-1 inline-flex items-center justify-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40"
              >
                Get a Quote <ArrowRight size={14} />
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
          {(() => {
            const overlays = (
              <>
                <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.94)_0%,rgba(15,23,42,0.82)_45%,rgba(15,23,42,0.38)_100%)]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_70%_at_38%_52%,transparent_25%,rgba(2,6,23,0.72)_100%)]" />
                <div className="absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-slate-950/60 to-transparent" />
              </>
            );

            return (
              <>
                <div className="absolute inset-0 overflow-hidden">
                  <video
                    src={HERO_VIDEO_URL}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="absolute left-1/2 top-1/2 h-full w-full min-h-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover"
                  />
                </div>
                {overlays}
              </>
            );
          })()}

          {/* Location ticker strip — pulls from real billboard data */}
          {(() => {
            const locs = [...new Set(billboards.map(b => b.location).filter(Boolean))];
            if (!locs.length) return null;
            const items = [...locs, ...locs, ...locs];
            return (
              <div className="absolute inset-x-0 bottom-14 z-10 overflow-hidden border-y border-white/[0.05] py-2.5">
                <div className="flex animate-marquee whitespace-nowrap">
                  {items.map((loc, i) => (
                    <span key={i} className="mx-5 text-[9px] font-black uppercase tracking-[0.32em] text-white/[0.18]">
                      <span className="mr-5 text-indigo-400/30">◆</span>{loc}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
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
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-white/48">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              {shownAvailability.length > 0 && (() => {
                const item = shownAvailability[heroSlide % shownAvailability.length];
                return (
                  <div className="relative ml-auto" style={{ maxWidth: '400px' }}>
                    {/* Slide indicator dots */}
                    {shownAvailability.length > 1 && (
                      <div className="mb-3 flex justify-center gap-1.5">
                        {shownAvailability.map((_, i) => (
                          <button key={i} onClick={() => setHeroSlide(i)} className={`h-[3px] rounded-full transition-all duration-300 ${i === heroSlide % shownAvailability.length ? 'w-6 bg-white/60' : 'w-2 bg-white/20'}`} />
                        ))}
                      </div>
                    )}
                    <a
                      key={heroSlide}
                      href={item.board.id.startsWith('live-') ? '/contact' : billboardLink(item.board)}
                      onClick={item.board.id.startsWith('live-') ? navigate('contact') : undefined}
                      className="premium-dark-card premium-dark-card-hover group animate-soft-scale block"
                    >
                      <div className="relative h-52 overflow-hidden rounded-t-[inherit] bg-slate-800">
                        {item.board.imageUrl ? (
                          <img src={item.board.imageUrl} alt={item.board.name} loading="eager" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
                            <Building2 className="h-10 w-10 text-white/15" />
                            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/25">Photo coming soon</span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                        <span className="absolute left-4 top-4 rounded-md bg-indigo-500 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-white">
                          {item.board.type}
                        </span>
                        <span className={`absolute right-4 top-4 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${item.available ? 'bg-emerald-400 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
                          {item.label}
                        </span>
                        <span className="absolute bottom-4 left-4 right-4 text-lg font-black text-white">{item.board.name}</span>
                      </div>
                      <div className="p-5">
                        <p className="flex items-center gap-2 text-sm text-white/68">
                          <MapPin size={14} /> {item.board.location}, {item.board.town}
                        </p>
                        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
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
                        <div className="mt-4 flex items-center justify-between">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              setForm(prev => ({ ...prev, locationInterest: item.board.name, billboardType: String(item.board.type) }));
                              setPage('contact');
                              window.history.pushState(null, '', '/contact');
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className={`rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide transition hover:-translate-y-0.5 ${item.available ? 'bg-white text-slate-950 shadow-md hover:bg-indigo-50' : 'bg-slate-700 text-white/80 hover:bg-slate-600'}`}
                          >
                            {item.available ? 'Enquire' : 'Join Waitlist'}
                          </button>
                          <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide text-indigo-200">
                            Details <ArrowRight size={13} />
                          </span>
                        </div>
                      </div>
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>}

        {(page === 'home') && <section id="partners" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
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
                className="group flex h-28 animate-reveal-up items-center justify-center bg-white p-6 transition duration-300 hover:bg-indigo-50/60"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <img
                  src={partner.src}
                  alt={`${partner.name} logo`}
                  loading="lazy"
                  decoding="async"
                  className="max-h-12 max-w-full object-contain transition duration-300 group-hover:scale-110 group-hover:drop-shadow-md"
                />
              </div>
            ))}
          </div>
        </section>}

        {(page === 'home' || page === 'services') && <section id="digital-billboards" className="bg-slate-950 py-20 text-white">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:px-8">
            <div className="animate-reveal-up">
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-indigo-300">Digital billboards</p>
              <h2 className="mt-3 max-w-xl text-4xl font-black leading-[1.07] tracking-tight text-white sm:text-5xl">
                High-impact LED visibility for campaigns that need momentum.
              </h2>
              <p className="mt-5 max-w-lg text-[15px] leading-7 text-white/68">
                Digital billboard slots give your brand motion, frequency, and day-to-night presence at premium traffic points.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Rotating Slots', value: 'LED' },
                  { label: 'Flexible Bursts', value: 'Fast' },
                  { label: 'Night Visibility', value: '24/7' },
                ].map(item => (
                  <div key={item.label} className="premium-dark-card p-4">
                    <div className="text-2xl font-black text-white">{item.value}</div>
                    <div className="mt-1 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-200">{item.label}</div>
                  </div>
                ))}
              </div>
              <a
                href="/site-availability"
                onClick={navigate('locations')}
                className="mt-8 inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40"
              >
                View Digital Sites <ArrowRight size={15} />
              </a>
            </div>

            <div className="animate-soft-scale overflow-hidden rounded-md border border-white/10 bg-slate-900 shadow-2xl shadow-slate-950/30">
              <div className="relative h-80 overflow-hidden bg-slate-800 sm:h-[430px]">
                {(featuredDigitalSites[0]?.board.imageUrl || shownAvailability.find(s => s.board.imageUrl)?.board.imageUrl) ? (
                  <img
                    src={featuredDigitalSites[0]?.board.imageUrl || shownAvailability.find(s => s.board.imageUrl)?.board.imageUrl}
                    alt="Digital billboard campaign preview"
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover opacity-90 transition duration-700 hover:scale-105"
                  />
                ) : (
                  <div className="h-full bg-gradient-to-br from-indigo-900/50 via-slate-900 to-slate-950" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-200">Featured digital format</p>
                  <h3 className="mt-2 text-2xl font-black text-white">{featuredDigitalSites[0]?.board.name || 'Airport Road LED'}</h3>
                  <p className="mt-2 text-sm font-semibold text-white/70">
                    {featuredDigitalSites[0]?.label || 'Digital slots available'}
                  </p>
                </div>
              </div>
              <div className="grid divide-y divide-white/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                {(featuredDigitalSites.length ? featuredDigitalSites : shownAvailability.slice(0, 3)).slice(0, 3).map(item => (
                  <a
                    key={`${item.board.id}-digital-feature`}
                    href={item.board.id.startsWith('live-') ? '/contact' : billboardLink(item.board)}
                    className="group p-4 transition hover:bg-white/[0.06]"
                  >
                    <p className="truncate text-sm font-black text-white">{item.board.name}</p>
                    <p className="mt-1 text-xs font-semibold text-white/50">{item.monthlyRate ? `${money(item.monthlyRate)}/mo` : 'Quote'}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-indigo-200">
                      Details <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
                    </span>
                  </a>
                ))}
              </div>
            </div>
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
                className="group relative animate-reveal-up overflow-hidden rounded-2xl border border-slate-100 bg-white p-8 shadow-[0_2px_16px_rgba(15,23,42,0.06)] transition-all duration-500 hover:-translate-y-2 hover:border-indigo-100 hover:shadow-[0_24px_64px_rgba(99,102,241,0.10),0_4px_20px_rgba(15,23,42,0.08)]"
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
                  title: '3 day go-live',
                  body: 'Once artwork is approved and the site is booked, your campaign is printed, installed, and live within 3 days.',
                  stat: '3',
                  statLabel: 'days to live',
                  delay: 160,
                },
                {
                  num: '04',
                  icon: BarChart2,
                  title: 'Clear campaign records',
                  body: 'From booking to installation, your contracts, invoices, and key campaign milestones stay easy to reference.',
                  stat: '1',
                  statLabel: 'clear record',
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
                From shortlist to street in as little as 3 days, with a real team and live availability behind every step.
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

        {page === 'home' && <section id="industries" className="relative overflow-hidden bg-slate-950 py-20">
          <div className="mx-auto mb-14 max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="animate-reveal-up">
                <p className="mb-2 text-[11px] font-black uppercase tracking-[0.24em] text-indigo-400">Industries served</p>
                <h2 className="max-w-xs text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl">
                  Who we work with.
                </h2>
              </div>
              <p className="max-w-md animate-reveal-up animation-delay-100 text-[15px] leading-7 text-slate-400">
                Dreambox serves brands across every major sector active in the Zimbabwean market.
              </p>
            </div>
          </div>

          {/* Row 1 — left to right */}
          <div className="relative">
            <div className="flex animate-marquee gap-4 whitespace-nowrap">
              {['FMCG', 'Telecommunications', 'Banking and Finance', 'Real Estate', 'Retail', 'Government and NGO', 'Healthcare', 'Automotive', 'Hospitality and Tourism', 'Education', 'Insurance', 'Media and Entertainment',
                'FMCG', 'Telecommunications', 'Banking and Finance', 'Real Estate', 'Retail', 'Government and NGO', 'Healthcare', 'Automotive', 'Hospitality and Tourism', 'Education', 'Insurance', 'Media and Entertainment',
              ].map((industry, i) => (
                <span
                  key={i}
                  className="inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-6 py-3 text-[13px] font-semibold text-white/60 backdrop-blur-sm transition-colors duration-200 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-white"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>

          {/* Row 2 — right to left */}
          <div className="relative mt-4">
            <div className="flex animate-marquee-reverse gap-4 whitespace-nowrap">
              {['Automotive', 'Media and Entertainment', 'Real Estate', 'Healthcare', 'FMCG', 'Education', 'Banking and Finance', 'Retail', 'Insurance', 'Telecommunications', 'Government and NGO', 'Hospitality and Tourism',
                'Automotive', 'Media and Entertainment', 'Real Estate', 'Healthcare', 'FMCG', 'Education', 'Banking and Finance', 'Retail', 'Insurance', 'Telecommunications', 'Government and NGO', 'Hospitality and Tourism',
              ].map((industry, i) => (
                <span
                  key={i}
                  className="inline-flex shrink-0 items-center rounded-full border border-white/[0.06] bg-white/[0.025] px-6 py-3 text-[13px] font-semibold text-white/40 backdrop-blur-sm transition-colors duration-200 hover:border-indigo-500/40 hover:bg-indigo-500/10 hover:text-white/70"
                >
                  {industry}
                </span>
              ))}
            </div>
          </div>

          {/* edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-slate-950 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-slate-950 to-transparent" />
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

        {page === 'privacy' && <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="prose prose-slate max-w-none">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Legal</p>
              <p className="mt-1 text-sm text-slate-400">Last updated: June 2026</p>

              {[
                {
                  heading: '1. Who we are',
                  body: 'Dreambox Advertising (Private) Limited ("Dreambox", "we", "us") is an outdoor media company registered in Zimbabwe. Our registered address is 54 Brooke Village, Borrowdale Brooke, Harare. You can contact us at info@dreamboxadvertising.com or +263 778 018 909.',
                },
                {
                  heading: '2. Information we collect',
                  body: 'When you submit an enquiry through this website we collect the name, company, email address, phone number, and campaign details you provide. We also collect standard server logs (IP address, browser type, referring URL) to maintain site security and performance. We do not use third-party advertising trackers or sell data to third parties.',
                },
                {
                  heading: '3. How we use your information',
                  body: 'We use your contact details solely to respond to your enquiry, prepare quotations, and manage your advertising campaign. Internal records are maintained in our CRM system to ensure accurate invoicing and campaign tracking. We do not use your information for unsolicited marketing beyond the campaign you enquired about.',
                },
                {
                  heading: '4. Cookies',
                  body: 'This website uses a single functional cookie (db_cookie_ok) to record that you have acknowledged this notice. No advertising cookies, tracking pixels, or cross-site cookies are set. You can clear this cookie at any time through your browser settings.',
                },
                {
                  heading: '5. Data sharing',
                  body: 'We do not sell, rent, or share your personal data with third parties except where required by Zimbabwean law or a court order. Our website infrastructure is operated by hosting platform (cloud hosting) and Cloudflare (storage). Both process data only on our behalf and under confidentiality obligations.',
                },
                {
                  heading: '6. Data retention',
                  body: 'Enquiry and campaign records are retained for a minimum of five years to comply with Zimbabwean commercial and tax law. You may request deletion of pre-campaign enquiry data that has not resulted in a contract by contacting us in writing.',
                },
                {
                  heading: '7. Your rights',
                  body: 'You have the right to request access to, correction of, or deletion of your personal data held by us. To exercise these rights, please contact info@dreamboxadvertising.com. We will respond within 30 days.',
                },
                {
                  heading: '8. Security',
                  body: 'All data is transmitted over HTTPS. Access to our CRM is protected by password authentication. We review our security practices periodically and notify affected individuals of any breach as required by law.',
                },
                {
                  heading: '9. Changes to this policy',
                  body: 'We may update this Privacy Policy from time to time. The "Last updated" date at the top of this page will reflect any changes. Continued use of the website after a change constitutes acceptance of the updated policy.',
                },
                {
                  heading: '10. Contact',
                  body: 'Questions about this policy should be directed to info@dreamboxadvertising.com or by post to 54 Brooke Village, Borrowdale Brooke, Harare, Zimbabwe.',
                },
              ].map(section => (
                <div key={section.heading} className="mt-8 border-t border-slate-100 pt-8 first:border-0 first:pt-0">
                  <h2 className="text-base font-black text-slate-950">{section.heading}</h2>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{section.body}</p>
                </div>
              ))}

              <div className="mt-12 rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
                <p className="text-sm font-black text-indigo-900">Questions?</p>
                <p className="mt-1 text-sm leading-6 text-indigo-700">Email us at <a href="mailto:info@dreamboxadvertising.com" className="underline">info@dreamboxadvertising.com</a> and we will respond within 30 days.</p>
              </div>
            </div>
          </div>
        </section>}

        {page === 'terms' && <section className="bg-white py-16">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
            <div className="prose prose-slate max-w-none">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Legal</p>
              <p className="mt-1 text-sm text-slate-400">Last updated: June 2026</p>

              {[
                {
                  heading: '1. Acceptance of terms',
                  body: 'By accessing or using the Dreambox Advertising website (dreamboxadvertising.co.zw), you agree to be bound by these Terms of Use. If you do not agree, please do not use the website.',
                },
                {
                  heading: '2. Use of the website',
                  body: 'This website is provided for informational and commercial enquiry purposes. You may browse site listings, submit enquiries, and access public content. You must not use the website to submit false or misleading information, attempt to access restricted areas, scrape or reproduce content without permission, or engage in any conduct that disrupts the service.',
                },
                {
                  heading: '3. Enquiries and quotations',
                  body: 'Submitting an enquiry form does not constitute a binding contract. A campaign contract is only formed when both parties have signed a written agreement and a deposit has been received. Quoted rates are indicative and subject to site availability at the time of booking.',
                },
                {
                  heading: '4. Availability information',
                  body: 'Availability displayed on this website is calculated from our active contract database and is updated in real time. While we take care to keep this accurate, we do not guarantee that a site shown as available will remain available at the time your booking is confirmed.',
                },
                {
                  heading: '5. Intellectual property',
                  body: 'All content on this website, including text, photography, graphics, and the Dreambox brand mark, is the property of Dreambox Advertising (Pvt) Ltd or its licensors. You may not reproduce, distribute, or create derivative works without prior written consent.',
                },
                {
                  heading: '6. Limitation of liability',
                  body: 'To the extent permitted by Zimbabwean law, Dreambox Advertising is not liable for any indirect, incidental, or consequential loss arising from your use of this website or reliance on information displayed on it. Our total liability for any claim arising from the website is limited to ZWL 1.',
                },
                {
                  heading: '7. Third-party links',
                  body: 'This website may contain links to third-party websites. We are not responsible for the content, privacy practices, or accuracy of those sites. Links do not constitute an endorsement.',
                },
                {
                  heading: '8. Governing law',
                  body: 'These Terms of Use are governed by the laws of Zimbabwe. Any disputes arising from your use of this website shall be subject to the exclusive jurisdiction of the courts of Zimbabwe.',
                },
                {
                  heading: '9. Changes to these terms',
                  body: 'We may update these Terms of Use at any time. The "Last updated" date will reflect changes. Continued use of the website after changes are posted constitutes your acceptance of the revised terms.',
                },
                {
                  heading: '10. Contact',
                  body: 'For any questions regarding these terms, contact us at info@dreamboxadvertising.com or +263 778 018 909.',
                },
              ].map(section => (
                <div key={section.heading} className="mt-8 border-t border-slate-100 pt-8 first:border-0 first:pt-0">
                  <h2 className="text-base font-black text-slate-950">{section.heading}</h2>
                  <p className="mt-3 text-[15px] leading-7 text-slate-600">{section.body}</p>
                </div>
              ))}

              <div className="mt-12 rounded-2xl border border-indigo-100 bg-indigo-50 p-6">
                <p className="text-sm font-black text-indigo-900">Questions about these terms?</p>
                <p className="mt-1 text-sm leading-6 text-indigo-700">Email us at <a href="mailto:info@dreamboxadvertising.com" className="underline">info@dreamboxadvertising.com</a></p>
              </div>
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
                    className="inline-flex w-fit items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40"
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
                      <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950">
                        <Building2 className="h-10 w-10 text-white/15" />
                        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/25">Photo coming soon</span>
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
                        className={`rounded-md px-3 py-2 text-xs font-black uppercase tracking-wide transition hover:-translate-y-0.5 ${
                          item.available
                            ? 'bg-white text-slate-950 shadow-md shadow-slate-950/15 hover:bg-indigo-50 hover:shadow-lg hover:shadow-indigo-500/15'
                            : 'bg-slate-700 text-white/80 hover:bg-slate-600'
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
                {shownAvailability.slice(0, 4).map((item, idx) => (
                  <a
                    key={item.board.id}
                    href={item.board.id.startsWith('live-') ? '/contact' : billboardLink(item.board)}
                    onClick={item.board.id.startsWith('live-') ? navigate('contact') : undefined}
                    className="premium-dark-card premium-dark-card-hover group animate-reveal-up"
                    style={{ animationDelay: `${idx * 70}ms` }}
                  >
                    <div className="relative h-64 overflow-hidden bg-slate-800">
                      {item.board.imageUrl
                        ? <img src={item.board.imageUrl} alt={item.board.name} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                        : <div className="h-full bg-gradient-to-br from-indigo-900/40 to-slate-900" />}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />
                      <span className="absolute left-4 top-4 rounded-md bg-white/90 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-slate-950 backdrop-blur">
                        {item.board.type}
                      </span>
                      <div className="absolute bottom-4 left-4 right-4">
                        <h3 className="text-xl font-black text-white">{item.board.name}</h3>
                        <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-white/72">
                          <MapPin size={14} /> {item.board.town || 'Zimbabwe'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-5">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-white/55">{item.available ? 'Available' : 'On waitlist'}</span>
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
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-indigo-500 to-violet-500 px-5 py-3 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:-translate-y-0.5 hover:shadow-indigo-500/40"
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
            <h2 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Clients trust Dreambox.</h2>
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

        {(page === 'home' || page === 'services' || page === 'contact') && <section id="campaign-gallery" className="bg-slate-50 py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="animate-reveal-up">
                <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Previous campaigns</p>
                <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                  See how brands show up with Dreambox.
                </h2>
              </div>
              <p className="max-w-md animate-reveal-up animation-delay-100 text-sm leading-7 text-slate-600">
                A quick look at outdoor placements and campaign-ready locations before you send your brief.
              </p>
            </div>

            {campaignGallery.length > 0 ? (
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [column-fill:_balance]">
                {campaignGallery.map((img, index) => (
                  <div
                    key={index}
                    className="mb-4 break-inside-avoid overflow-hidden rounded-xl animate-reveal-up"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <img
                      src={img.src}
                      alt={`Campaign photo ${index + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full object-cover transition duration-500 hover:scale-[1.02] rounded-xl"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4 [column-fill:_balance]">
                {shownAvailability.filter(item => item.board.imageUrl).slice(0, 8).map((item, index) => (
                  <a
                    key={item.board.id}
                    href={item.board.id.startsWith('live-') ? '/site-availability' : billboardLink(item.board)}
                    onClick={item.board.id.startsWith('live-') ? navigate('locations') : undefined}
                    className="mb-4 break-inside-avoid group block overflow-hidden rounded-xl animate-reveal-up"
                    style={{ animationDelay: `${index * 60}ms` }}
                  >
                    <div className="relative overflow-hidden rounded-xl bg-slate-800">
                      <img
                        src={item.board.imageUrl!}
                        alt={`${item.board.name} billboard`}
                        loading="lazy"
                        decoding="async"
                        className="w-full object-cover transition duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                      <div className="absolute bottom-0 left-0 right-0 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 p-4">
                        <h3 className="text-sm font-black text-white">{item.board.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-indigo-200">
                          <MapPin size={10} /> {item.board.location || item.board.town}
                        </p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
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
                  <Send size={18} className="text-indigo-600" /> WhatsApp Dreambox
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
                  Send your target towns, dates, and budget on WhatsApp. Our team will help you choose available sites and move quickly toward a quote.
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
                  href="https://wa.me/263778018909?text=Hi%20Dreambox%2C%20I%27d%20like%20to%20start%20an%20outdoor%20advertising%20campaign."
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-7 py-4 text-sm font-black uppercase tracking-wide text-slate-950 shadow-xl shadow-slate-950/30 transition hover:-translate-y-0.5 hover:bg-indigo-50 lg:w-auto"
                >
                  Start Your Campaign <Send size={15} />
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
              {['Billboards', 'Digital OOH', 'Outdoor Media'].map(label => (
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
              {['Billboard Advertising', 'Digital Billboards'].map(label => (
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
              <a
                href="/site-availability"
                onClick={navigate('locations')}
                className="group inline-flex items-center gap-2 transition hover:text-white"
              >
                <ArrowRight size={12} className="-ml-5 text-indigo-300 opacity-0 transition-all duration-200 group-hover:ml-0 group-hover:opacity-100" />
                View Available Sites
              </a>
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
            <div className="flex items-center gap-4">
              <a href="/privacy" onClick={navigate('privacy')} className="transition hover:text-white">Privacy Policy</a>
              <span className="text-white/20">·</span>
              <a href="/terms" onClick={navigate('terms')} className="transition hover:text-white">Terms of Use</a>
            </div>
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
              <a href="/privacy" onClick={navigate('privacy')} className="font-semibold text-indigo-600 underline-offset-2 hover:underline">
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
