import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  CheckCircle,
  Clock,
  Globe2,
  Mail,
  MapPin,
  Megaphone,
  Menu,
  Phone,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Users,
  X,
} from 'lucide-react';
import {
  getBillboards,
  getCompanyLogo,
  getCompanyProfile,
  getContracts,
} from '../services/mockData';
import {
  addCRMCompany,
  addCRMContact,
  addCRMOpportunity,
  findCompanyByName,
  findContactByEmail,
} from '../services/crmService';
import { Billboard, BillboardType, Contract } from '../types';

const heroImage =
  'https://static.wixstatic.com/media/6d48c9_e91e4e95c38c4e0d977a7973c2d23ae8~mv2.jpg/v1/fill/w_1200,h_900,al_c,q_85,enc_avif,quality_auto/6d48c9_e91e4e95c38c4e0d977a7973c2d23ae8~mv2.jpg';

const liveLogo =
  'https://static.wixstatic.com/media/33e2c5_fa30ae7289ea444186df47e4189fca0d~mv2.png/v1/crop/x_0,y_194,w_526,h_100/fill/w_678,h_136,fp_0.50_0.50,lg_1,q_85,enc_avif,quality_auto/IMG_9520__1_-removebg-preview.png';

const partnerLogos = [
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
  'Their team of experts took the time to understand our advertising needs and crafted a customized strategy.',
  'We highly recommend Dreambox Media for any business looking to make a lasting impact.',
  "Dreambox Media's attention to detail and commitment to delivering results have made them our go-to agency.",
];

type PublicPage = 'home' | 'services' | 'locations' | 'pricing' | 'contact';

const PAGE_META: Record<Exclude<PublicPage, 'home'>, { label: string; title: string; subtitle: string }> = {
  services: {
    label: 'What we offer',
    title: 'Services',
    subtitle: 'Billboard, airport, and digital outdoor media — pick the canvas that fits your campaign.',
  },
  locations: {
    label: 'Network',
    title: 'Available Sites & Prices',
    subtitle: 'Live availability across the Dreambox network, calculated from active contracts.',
  },
  pricing: {
    label: 'Rates',
    title: 'Pricing',
    subtitle: 'Transparent monthly rates on every site, with ROI built into your campaign.',
  },
  contact: {
    label: 'Get started',
    title: 'Contact Us',
    subtitle: 'Tell us your target towns, dates, and goals — we will prepare a client-ready quote.',
  },
};

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
};

const LogoLockup: React.FC<{ logo?: string | null; inverted?: boolean }> = ({ logo, inverted = false }) => (
  <span className="flex items-center gap-3">
    {logo ? (
      <span className={`flex h-12 w-40 items-center rounded-md px-3 py-2 ${
        inverted
          ? 'bg-white/[0.08] ring-1 ring-white/15 shadow-lg shadow-slate-950/20'
          : 'bg-white ring-1 ring-slate-200 shadow-lg shadow-slate-950/5'
      }`}>
        <img src={logo} alt="Dreambox logo" className="max-h-full w-full object-contain" />
      </span>
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
  if (path === '/pricing') return 'pricing';
  if (path === '/contact') return 'contact';
  if (path === '/site-availability' || path === '/available-sites') return 'locations';
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
  const [page, setPage] = useState<PublicPage>(() => getPageFromPath());
  const [form, setForm] = useState<EnquiryFormState>(EMPTY_ENQUIRY);
  const [enquiryStatus, setEnquiryStatus] = useState<'idle' | 'sent'>('idle');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  const visibleBoards = useMemo(
    () => billboards.filter(board => board.coordinates?.lat && board.coordinates?.lng).slice(0, 3),
    [billboards]
  );

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
      ? 'Dreambox Advertising — Outdoor Media in Zimbabwe'
      : `${PAGE_META[page].title} — Dreambox Advertising`;
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
    const selectedAvailability = shownAvailability.find(item => item.board.name === form.locationInterest);

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

      if (!response.ok) throw new Error('Public lead API unavailable');
    } catch {
      createLocalLead();
    }

    setEnquiryStatus('sent');
    setForm(EMPTY_ENQUIRY);
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
      <input name="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="Name" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <input name="company" value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} placeholder="Company" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <input name="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" required placeholder="Email" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <input name="phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <select name="locationInterest" value={form.locationInterest} onChange={e => setForm({ ...form, locationInterest: e.target.value })} className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
        <option value="">Location interest</option>
        {shownAvailability.slice(0, 12).map(item => (
          <option key={`${item.board.id}-${item.label}`} value={item.board.name}>{item.board.name} - {item.label}</option>
        ))}
      </select>
      <select name="billboardType" value={form.billboardType} onChange={e => setForm({ ...form, billboardType: e.target.value })} className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20">
        <option value="">Media type</option>
        <option value="Billboard Advertising">Billboard Advertising</option>
        <option value="Airport Advertising">Airport Advertising</option>
        <option value="Digital Billboard">Digital Billboard</option>
      </select>
      <input name="campaignDuration" value={form.campaignDuration} onChange={e => setForm({ ...form, campaignDuration: e.target.value })} placeholder="Campaign duration" className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20" />
      <textarea name="message" value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Campaign details" rows={compact ? 4 : 5} className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 sm:col-span-2" />
      <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-6 py-3 text-sm font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 sm:col-span-2">
        Create Website Lead <CheckCircle size={16} />
      </button>
    </form>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950 font-sans">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-700/50 bg-[#1e293b]/92 shadow-2xl shadow-slate-950/20 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3" aria-label="Dreambox Advertising home">
            <LogoLockup logo={logo} inverted />
          </a>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-white/78 md:flex">
            {([
              { key: 'home' as PublicPage, href: '/', label: 'Home' },
              { key: 'services' as PublicPage, href: '/services', label: 'Services' },
              { key: 'locations' as PublicPage, href: '/site-availability', label: 'Available Sites' },
              { key: 'pricing' as PublicPage, href: '/pricing', label: 'Pricing' },
              { key: 'contact' as PublicPage, href: '/contact', label: 'Contact' },
            ]).map(link => (
              <a
                key={link.key}
                href={link.href}
                onClick={navigate(link.key)}
                aria-current={page === link.key ? 'page' : undefined}
                className={page === link.key
                  ? 'border-b-2 border-indigo-400 pb-1 text-white'
                  : 'pb-1 hover:text-white'}
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <a
              href="/login"
              className="hidden rounded-md border border-white/20 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white transition hover:bg-white/10 sm:inline-flex"
            >
              Staff Login
            </a>
            <a
              href="https://wa.me/263778018909"
              className="hidden items-center gap-2 rounded-md bg-indigo-500 px-4 py-2.5 text-xs font-black uppercase tracking-wide text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 sm:inline-flex"
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

        {mobileNavOpen && (
          <nav className="border-t border-slate-700/50 bg-[#1e293b] px-4 py-4 md:hidden" aria-label="Mobile navigation">
            <div className="grid gap-1">
              {([
                { key: 'home' as PublicPage, href: '/', label: 'Home' },
                { key: 'services' as PublicPage, href: '/services', label: 'Services' },
                { key: 'locations' as PublicPage, href: '/site-availability', label: 'Available Sites' },
                { key: 'pricing' as PublicPage, href: '/pricing', label: 'Pricing' },
                { key: 'contact' as PublicPage, href: '/contact', label: 'Contact' },
              ]).map(link => (
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
              <a
                href="https://wa.me/263778018909"
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-4 py-3 text-xs font-black uppercase tracking-wide text-white transition hover:bg-indigo-400"
              >
                Book Appointment <ArrowRight size={14} />
              </a>
            </div>
          </nav>
        )}
      </header>

      <main>
        {page !== 'home' && (
          <section className="relative overflow-hidden bg-slate-950 pt-[72px] text-white">
            <div className="absolute -right-24 -top-28 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
            <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent" />
            <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
              <nav className="text-[11px] font-black uppercase tracking-[0.18em] text-white/45" aria-label="Breadcrumb">
                <a href="/" onClick={navigate('home')} className="hover:text-white">Home</a>
                <span className="mx-2 text-white/25">/</span>
                <span className="text-indigo-300">{PAGE_META[page].label}</span>
              </nav>
              <h1 className="mt-4 text-4xl font-black leading-tight sm:text-5xl">{PAGE_META[page].title}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/65 sm:text-base">{PAGE_META[page].subtitle}</p>
            </div>
          </section>
        )}

        {page === 'home' && <section className="relative min-h-[94vh] overflow-hidden bg-slate-950 pt-[72px] text-white">
          <img
            src={heroImage}
            alt="Premium outdoor billboard beside an urban roadway"
            className="absolute inset-0 h-full w-full object-cover animate-image-drift"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.94)_0%,rgba(15,23,42,0.82)_45%,rgba(15,23,42,0.38)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
          <div className="relative mx-auto grid min-h-[calc(94vh-72px)] max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8">
            <div className="max-w-3xl">
              <div className="mb-6 inline-flex animate-reveal-up items-center gap-2 rounded-full border border-indigo-300/30 bg-indigo-500/15 px-4 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-indigo-100 backdrop-blur">
                <Sparkles size={13} />
                Zimbabwe&apos;s Outdoor Media Partner
              </div>
              <h1 className="max-w-3xl animate-reveal-up animation-delay-100 text-4xl font-black leading-[1.04] tracking-tight text-white sm:text-6xl lg:text-7xl">
                Outdoor media that puts your brand{' '}
                <span className="bg-gradient-to-r from-indigo-300 via-violet-300 to-indigo-200 bg-clip-text text-transparent">in motion.</span>
              </h1>
              <p className="mt-6 max-w-xl animate-reveal-up animation-delay-200 text-base leading-7 text-white/82 sm:text-lg">
                Dreambox Advertising helps Zimbabwean brands choose visible billboard, airport, and digital outdoor placements with clear pricing and CRM-backed follow-up.
              </p>
              <div className="mt-8 flex animate-reveal-up animation-delay-300 flex-col gap-3 sm:flex-row">
                <a
                  href="/site-availability"
                  onClick={navigate('locations')}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-indigo-500 px-7 py-3.5 text-sm font-black uppercase tracking-wide text-white shadow-xl shadow-indigo-500/30 transition hover:-translate-y-0.5 hover:bg-indigo-400"
                >
                  Explore Locations <MapPin size={17} />
                </a>
                <a
                  href="/contact"
                  onClick={navigate('contact')}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-white/25 bg-white/10 px-7 py-3.5 text-sm font-bold uppercase tracking-wide text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/15"
                >
                  Request a Quote <ArrowRight size={17} />
                </a>
              </div>
              <div className="mt-7 flex animate-reveal-up animation-delay-300 flex-wrap gap-x-6 gap-y-2.5">
                {['Verified, maintained sites', 'Transparent monthly rates', 'Response within 24 hours'].map(item => (
                  <span key={item} className="inline-flex items-center gap-2 text-xs font-bold text-white/72">
                    <CheckCircle size={14} className="text-emerald-400" /> {item}
                  </span>
                ))}
              </div>
              <div className="mt-8 grid max-w-xl animate-reveal-up animation-delay-500 grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map(item => (
                  <div key={item.label} className="premium-dark-card premium-dark-card-hover p-3 backdrop-blur">
                    <div className="text-xl font-black text-white">{item.value}</div>
                    <div className="mt-1 text-[9px] font-black uppercase tracking-[0.14em] text-white/45">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="hidden lg:block">
              <div className="premium-dark-card ml-auto max-w-md animate-soft-scale animation-delay-300 p-5 backdrop-blur-xl">
                <div className="relative mb-4 h-px overflow-hidden bg-white/10">
                  <div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-indigo-300 to-transparent animate-line-sweep" />
                </div>
                <div className="overflow-hidden rounded-md bg-slate-900">
                  <img src={liveLocationCards[0].image} alt="Dreambox billboard location preview" className="h-64 w-full object-cover" />
                </div>
                <div className="mt-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-200">Featured inventory</p>
                    <h2 className="mt-2 text-2xl font-black text-white">Live site availability</h2>
                    <p className="mt-2 text-sm leading-6 text-white/62">Browse every CRM billboard and see side, slot, and pricing status before sending an enquiry.</p>
                  </div>
                  <div className="rounded-md bg-emerald-400 px-3 py-2 text-center text-slate-950">
                    <div className="text-lg font-black">{availableSites.filter(item => item.available).length || shownAvailability.length}</div>
                    <div className="text-[9px] font-black uppercase tracking-wide">Open</div>
                  </div>
                </div>
                <a
                  href="/site-availability"
                  onClick={navigate('locations')}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-white px-5 py-3 text-xs font-black uppercase tracking-wide text-slate-950 transition hover:bg-indigo-50"
                >
                  View All Sites <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>
        </section>}

        {page === 'home' && <section className="-mt-10 relative z-10 px-4 sm:hidden" aria-label="Dreambox network statistics">
          <div className="premium-card mx-auto grid max-w-7xl grid-cols-2 sm:grid-cols-4">
            {stats.map(item => (
              <div key={item.label} className="border-b border-r border-slate-100 p-5 last:border-r-0 sm:border-b-0">
                <div className="text-2xl font-black text-slate-950 sm:text-3xl">{item.value}</div>
                <div className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
              </div>
            ))}
          </div>
        </section>}

        {(page === 'home') && <section id="partners" className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
          <div className="premium-card animate-reveal-up p-5 sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">Our valued partners</p>
              <h2 className="mt-3 text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Trusted by great Zimbabwean brands.
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {partnerLogos.map(partner => (
                <div key={partner.name} className="premium-card premium-card-hover group flex h-24 items-center justify-center p-4">
                  <img src={partner.src} alt={`${partner.name} logo`} className="max-h-full max-w-full object-contain opacity-75 grayscale transition duration-300 group-hover:opacity-100 group-hover:grayscale-0" />
                </div>
              ))}
            </div>
          </div>
          </div>
        </section>}

        {(page === 'home' || page === 'services') && <section id="services" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
            <div>
              {page !== 'services' && <p className="text-xs font-black uppercase tracking-[0.2em] text-indigo-600">What we offer</p>}
              <h2 className="mt-3 max-w-xl text-3xl font-black leading-tight text-slate-950 sm:text-4xl">
                Where do you want to advertise?
              </h2>
            </div>
            <p className="max-w-2xl text-sm leading-7 text-slate-600 sm:text-base">
              Dreambox offers billboard advertising and related outdoor media services to help clients make their message understood.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              { icon: Target, title: 'Billboard Advertising', body: 'Highly visual, brand-building, cost-effective outdoor media for campaigns that need street-level attention.', meta: 'Static roadside media' },
              { icon: Building2, title: 'Airport Advertising', body: 'Showcase your brand to business and leisure travelers in high-intent airport environments.', meta: 'Travel audience reach' },
              { icon: Megaphone, title: 'Digital Billboard', body: 'High-impact digital out-of-home placements built for dominant, iconic campaign visibility.', meta: 'LED and rotating slots' },
            ].map((service, index) => (
              <article key={service.title} className="premium-card premium-card-hover group animate-reveal-up p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
                    <service.icon className="h-6 w-6" />
                  </div>
                  <span className="text-xs font-black text-slate-300">0{index + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-black text-slate-950">{service.title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">{service.body}</p>
                <div className="mt-5 border-t border-slate-100 pt-4 text-[10px] font-black uppercase tracking-[0.16em] text-indigo-600">
                  {service.meta}
                </div>
              </article>
            ))}
          </div>
        </section>}

        {(page === 'home' || page === 'locations' || page === 'pricing') && <section id="network" className="bg-slate-950 py-20 text-white">
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
                {(page === 'home' ? shownAvailability.slice(0, 6) : shownAvailability).map(item => (
                <a
                  key={`${item.board.id}-${item.label}`}
                  href={item.board.id.startsWith('live-') ? '/contact' : billboardLink(item.board)}
                  onClick={item.board.id.startsWith('live-') ? navigate('contact') : undefined}
                  className="premium-dark-card premium-dark-card-hover group animate-reveal-up"
                >
                  <div className="relative h-60 overflow-hidden bg-slate-800">
                    {item.board.imageUrl ? (
                      <img src={item.board.imageUrl} alt={item.board.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[linear-gradient(135deg,#334155,#0f172a)]">
                        <MapPin className="h-10 w-10 text-indigo-300" />
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
                      <img src={location.image} alt={`${location.name} billboard location`} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
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

        {(page === 'home' || page === 'pricing') && <section id="pricing" className="bg-white py-20">
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
          ].map(item => (
            <div key={item.title} className="premium-card premium-card-hover flex gap-4 p-6">
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
              {testimonials.map(quote => (
                <blockquote key={quote} className="premium-dark-card premium-dark-card-hover flex flex-col p-6">
                  <div className="flex gap-1 text-amber-300" aria-label="5 out of 5 stars">
                    {Array.from({ length: 5 }).map((_, star) => (
                      <Star key={star} size={14} fill="currentColor" strokeWidth={0} />
                    ))}
                  </div>
                  <p className="mt-4 flex-1 text-sm leading-7 text-white/78">&ldquo;{quote}&rdquo;</p>
                  <footer className="mt-5 flex items-center gap-2 border-t border-white/10 pt-4 text-[11px] font-black uppercase tracking-[0.16em] text-indigo-200">
                    <ShieldCheck size={14} className="text-emerald-400" /> Verified client review
                  </footer>
                </blockquote>
              ))}
            </div>
          </div>
        </section>}

        {(page === 'home' || page === 'services' || page === 'contact' || page === 'locations' || page === 'pricing') && <section id="contact" className="bg-white py-20">
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
        </section>}
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

      <footer className="relative overflow-hidden bg-slate-950 px-4 py-16 text-white sm:px-6 lg:px-8">
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
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">Explore</h3>
            <div className="mt-4 grid gap-3 text-sm font-semibold text-white/72">
              <a href="/services" onClick={navigate('services')} className="hover:text-white">Services</a>
              <a href="/site-availability" onClick={navigate('locations')} className="hover:text-white">Available Sites</a>
              <a href="/pricing" onClick={navigate('pricing')} className="hover:text-white">Pricing</a>
              <a href="/contact" onClick={navigate('contact')} className="hover:text-white">Contact</a>
              <a href="/login" className="hover:text-white">Staff Login</a>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">Socials</h3>
            <div className="mt-4 grid gap-3 text-sm font-semibold text-white/72">
              <a href="https://www.instagram.com/dreamboxadvertisingzw" className="hover:text-white">Instagram</a>
              <a href="https://www.facebook.com/dreamboxadvertisingzim" className="hover:text-white">Facebook</a>
              <a href="https://wa.me/263778018909" className="inline-flex items-center gap-2 hover:text-white">
                WhatsApp <Send size={14} />
              </a>
            </div>
          </div>
          <div>
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-indigo-200">Contact</h3>
            <div className="mt-4 grid gap-3 text-sm font-semibold text-white/72">
              <a href={`tel:${phone}`} className="inline-flex items-start gap-3 hover:text-white">
                <Phone size={16} className="mt-0.5 shrink-0 text-indigo-300" /> {phone}
              </a>
              <a href={`mailto:${email}`} className="inline-flex items-start gap-3 break-all hover:text-white">
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
        <div className="relative mx-auto mt-12 flex max-w-7xl flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/50 sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; 2026 Dreambox Advertising (Pvt) Ltd. All rights reserved.</p>
          <p className="inline-flex items-center gap-2">
            <ShieldCheck size={13} className="text-emerald-400" /> Powered by Dreambox CRM
          </p>
        </div>
      </footer>
    </div>
  );
};
