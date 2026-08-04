import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  CircleAlert,
  ImagePlus,
  LocateFixed,
  MapPin,
  RefreshCw,
  Send,
  ShieldAlert,
  Upload,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { Billboard, Contract, FieldReport, FieldReportDraft, FieldReportQueueItem, FieldReportType } from '../types';
import { getBillboards, getContracts } from '../services/mockData';
import { api, isConfigured } from '../services/apiClient';
import {
  createDraft,
  getQueue,
  getQueueStorageError,
  retryAll,
  submit,
  subscribe,
} from '../services/fieldReports';

const MAX_CAMERA_BYTES = 5 * 1024 * 1024;

interface FieldOperationsProps {
  /** Optional controlled source for an embedding screen; defaults to local app data. */
  billboards?: Billboard[];
  contracts?: Contract[];
}

interface Coordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

const MODE_CARDS: Array<{ type: FieldReportType; label: string; help: string; Icon: typeof MapPin; tone: string }> = [
  { type: 'CheckIn', label: 'Check In', help: 'Confirm you are at a site with GPS.', Icon: MapPin, tone: 'border-sky-300 bg-sky-50 text-sky-900' },
  { type: 'CampaignProof', label: 'Campaign Proof', help: 'Photograph an active campaign.', Icon: Camera, tone: 'border-indigo-300 bg-indigo-50 text-indigo-900' },
  { type: 'Issue', label: 'Report Issue', help: 'Flag a problem with notes or a photo.', Icon: AlertTriangle, tone: 'border-amber-300 bg-amber-50 text-amber-900' },
];

function browserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function queueSummary(queue: FieldReportQueueItem[]) {
  return {
    waiting: queue.filter(item => !item.terminal).length,
    needsAttention: queue.filter(item => item.terminal).length,
  };
}

function readableTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleString();
}

function errorFromGeolocation(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location permission was denied. Enable it in your browser settings, then try again.';
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Move to clearer signal and retry.';
    case error.TIMEOUT:
      return 'Location took too long. Try again while keeping the app open.';
    default:
      return 'We could not capture your location. Please try again.';
  }
}

function dataUrlForFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The photo could not be read. Please choose it again.'));
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error('The photo could not be read. Please choose it again.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Mobile-first field activity capture. It deliberately previews data URLs rather
 * than browser object URLs, so queued evidence can survive a reconnect/reload.
 */
export const FieldOperations: React.FC<FieldOperationsProps> = ({ billboards: suppliedBillboards, contracts: suppliedContracts }) => {
  const fileInputId = useId();
  const [mode, setMode] = useState<FieldReportType>('CheckIn');
  const [billboardId, setBillboardId] = useState('');
  const [contractId, setContractId] = useState('');
  const [note, setNote] = useState('');
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<'idle' | 'locating' | 'captured' | 'error'>('idle');
  const [online, setOnline] = useState(browserOnline);
  const [queue, setQueue] = useState<FieldReportQueueItem[]>(() => getQueue());
  const [recent, setRecent] = useState<FieldReport[]>([]);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const billboards = suppliedBillboards ?? getBillboards();
  const contracts = suppliedContracts ?? getContracts();
  const activeContracts = useMemo(
    () => contracts.filter(contract => contract.billboardId === billboardId && contract.status === 'Active'),
    [contracts, billboardId],
  );
  const queueState = queueSummary(queue);
  const storageWarning = getQueueStorageError();

  const addRecent = useCallback((reports: FieldReport[]) => {
    if (!reports.length) return;
    setRecent(current => {
      const byId = new Map(current.map(report => [report.id, report]));
      reports.forEach(report => byId.set(report.id, report));
      return [...byId.values()]
        .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
        .slice(0, 8);
    });
  }, []);

  const loadRecent = useCallback(async () => {
    if (!browserOnline() || !isConfigured()) return;
    try {
      const reports = await api.get<FieldReport[]>('/api/field-reports');
      setRecent(reports.slice(0, 8));
    } catch {
      // The offline queue is still useful when the recent-history request is unavailable.
    }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribe(setQueue);
    void loadRecent();
    const onOnline = () => {
      setOnline(true);
      void retryAll().then(result => {
        addRecent(result.submitted);
        void loadRecent();
      });
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [addRecent, loadRecent]);

  useEffect(() => {
    if (mode !== 'CampaignProof') setContractId('');
  }, [mode]);

  useEffect(() => {
    if (contractId && !activeContracts.some(contract => contract.id === contractId)) setContractId('');
  }, [activeContracts, contractId]);

  const captureLocation = useCallback(() => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationState('error');
      setLocationError('This browser does not support location capture. Use a supported mobile browser to check in.');
      return;
    }
    setLocationState('locating');
    navigator.geolocation.getCurrentPosition(
      position => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : undefined,
        });
        setLocationState('captured');
      },
      error => {
        setLocationState('error');
        setLocationError(errorFromGeolocation(error));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }, []);

  const onPhotoSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPhotoError(null);
    if (!file.type.startsWith('image/')) {
      setPhotoError('Choose an image file from your camera or photo library.');
      return;
    }
    if (file.size > MAX_CAMERA_BYTES) {
      setPhotoError('Choose a photo smaller than 5 MB.');
      return;
    }
    try {
      setPhotoDataUrl(await dataUrlForFile(file));
    } catch (error) {
      setPhotoError(error instanceof Error ? error.message : 'The photo could not be read.');
    }
  };

  const resetCapturedInputs = () => {
    setContractId('');
    setNote('');
    setCoordinates(null);
    setPhotoDataUrl(undefined);
    setPhotoError(null);
    setLocationError(null);
    setLocationState('idle');
  };

  const validateForm = (): string | null => {
    if (!billboardId) return 'Choose the billboard before submitting.';
    if (mode === 'CampaignProof' && !contractId) return 'Choose an active contract for campaign proof.';
    if (mode === 'CheckIn' && !coordinates) return 'Capture your location before checking in.';
    if (mode === 'Issue' && !note.trim() && !photoDataUrl) return 'Add a note or a photo so the issue can be assessed.';
    return null;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitMessage(null);
    const validationError = validateForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    try {
      const draft: FieldReportDraft = createDraft({
        type: mode,
        billboardId,
        contractId: mode === 'CampaignProof' ? contractId : undefined,
        note: note || undefined,
        photoDataUrl,
        latitude: coordinates?.latitude,
        longitude: coordinates?.longitude,
        accuracy: coordinates?.accuracy,
      });
      const result = await submit(draft);
      if (result.report) addRecent([result.report]);
      if (result.status === 'submitted') {
        setSubmitMessage(result.message || 'Field report submitted.');
        resetCapturedInputs();
      } else if (result.status === 'queued') {
        setSubmitMessage(result.message || 'Saved safely on this device and queued for retry.');
        resetCapturedInputs();
      } else {
        setSubmitError(result.message || 'The report needs attention before it can be submitted.');
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to capture this report.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryAll = async () => {
    setRetrying(true);
    setSubmitError(null);
    try {
      const result = await retryAll();
      addRecent(result.submitted);
      if (result.storageError) setSubmitError(result.storageError);
      else if (result.submitted.length) setSubmitMessage(`${result.submitted.length} queued report${result.submitted.length === 1 ? '' : 's'} submitted.`);
      else if (result.failed.length) setSubmitError('Some queued reports need correction before retrying.');
      else setSubmitMessage('Queued reports are still waiting for a connection or sign-in.');
      await loadRecent();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-3xl min-w-0 overflow-x-hidden px-4 pb-8 sm:px-6" aria-labelledby="field-operations-title">
      <header className="mb-5 pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">Field operations</p>
        <h2 id="field-operations-title" className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950 sm:text-3xl">Capture proof from the field</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Camera evidence and locations are saved to this device first, then submitted when the connection is ready.</p>
      </header>

      <div
        className={`mb-4 flex min-h-[44px] items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${online ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-950'}`}
        role="status"
        aria-live="polite"
      >
        {online ? <Wifi size={18} aria-hidden="true" /> : <WifiOff size={18} aria-hidden="true" />}
        <span className="min-w-0 flex-1 font-medium">{online ? 'Online — new reports will submit after evidence is saved.' : 'Offline — new reports will stay safely queued on this device.'}</span>
        {queueState.waiting > 0 && <span className="shrink-0 rounded-full bg-white/80 px-2 py-1 text-xs font-bold">{queueState.waiting} queued</span>}
      </div>

      {storageWarning && (
        <div className="mb-4 flex gap-3 rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950" role="alert">
          <ShieldAlert className="mt-0.5 shrink-0" size={19} aria-hidden="true" />
          <p><strong>Evidence is not safely stored yet.</strong> {storageWarning} Keep this screen open and free browser storage before trying again.</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="min-w-0 space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-bold text-slate-900">What are you reporting?</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {MODE_CARDS.map(({ type, label, help, Icon, tone }) => {
              const selected = mode === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setMode(type)}
                  aria-pressed={selected}
                  className={`min-h-[104px] rounded-2xl border-2 p-4 text-left transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 ${selected ? tone : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300'}`}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span className="mt-3 block text-base font-bold">{label}</span>
                  <span className="mt-1 block text-xs leading-5 opacity-80">{help}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label htmlFor="field-billboard" className="mb-2 block text-sm font-bold text-slate-900">Billboard <span aria-hidden="true">*</span></label>
          <select
            id="field-billboard"
            required
            value={billboardId}
            onChange={event => setBillboardId(event.target.value)}
            className="min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-950 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
          >
            <option value="">Select billboard…</option>
            {billboards.map(billboard => <option key={billboard.id} value={billboard.id}>{billboard.name} — {billboard.town}</option>)}
          </select>
        </div>

        {mode === 'CampaignProof' && (
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:p-5">
            <label htmlFor="field-contract" className="mb-2 block text-sm font-bold text-indigo-950">Active contract <span aria-hidden="true">*</span></label>
            <select
              id="field-contract"
              required
              value={contractId}
              disabled={!billboardId || !activeContracts.length}
              onChange={event => setContractId(event.target.value)}
              className="min-h-[48px] w-full rounded-xl border border-indigo-300 bg-white px-3 text-base text-slate-950 outline-none disabled:cursor-not-allowed disabled:bg-slate-100 focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
            >
              <option value="">{!billboardId ? 'Select a billboard first…' : activeContracts.length ? 'Select active contract…' : 'No active contracts for this billboard'}</option>
              {activeContracts.map(contract => <option key={contract.id} value={contract.id}>{contract.details || contract.id} · ends {contract.endDate}</option>)}
            </select>
            <p className="mt-2 text-xs leading-5 text-indigo-900">Campaign proof is always linked to the selected billboard’s active contract.</p>
          </div>
        )}

        {mode === 'CheckIn' && (
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 sm:p-5" aria-live="polite">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="font-bold text-sky-950">Location check-in <span aria-hidden="true">*</span></h3>
                {coordinates ? (
                  <p className="mt-1 text-sm text-sky-900">Location captured: {coordinates.latitude.toFixed(5)}, {coordinates.longitude.toFixed(5)}{coordinates.accuracy != null ? ` · ±${Math.round(coordinates.accuracy)} m` : ''}</p>
                ) : (
                  <p className="mt-1 text-sm text-sky-900">Capture your current GPS location to complete the check-in.</p>
                )}
              </div>
              <button
                type="button"
                onClick={captureLocation}
                disabled={locationState === 'locating'}
                className="inline-flex min-h-[48px] shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-sky-800 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sky-300"
              >
                <LocateFixed size={18} aria-hidden="true" />
                {locationState === 'locating' ? 'Finding location…' : coordinates ? 'Retry location' : 'Capture location'}
              </button>
            </div>
            {locationError && <p className="mt-3 rounded-xl bg-white/80 p-3 text-sm font-medium text-rose-800" role="alert">{locationError}</p>}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Photo evidence <span className="font-normal text-slate-500">(optional)</span></h3>
              <p className="mt-1 text-xs leading-5 text-slate-600">Use your camera or choose an image up to 5 MB. It stays on this device until safely uploaded.</p>
            </div>
            <label htmlFor={fileInputId} className="inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-900 hover:bg-slate-50 focus-within:ring-4 focus-within:ring-indigo-200">
              <ImagePlus size={18} aria-hidden="true" />
              {photoDataUrl ? 'Replace photo' : 'Take / choose photo'}
            </label>
            <input id={fileInputId} type="file" accept="image/*" capture="environment" className="sr-only" onChange={onPhotoSelected} />
          </div>
          {photoError && <p className="mt-3 text-sm font-medium text-rose-700" role="alert">{photoError}</p>}
          {photoDataUrl && (
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
              <img src={photoDataUrl} alt="Selected field evidence preview" className="max-h-72 w-full object-cover" />
              <button
                type="button"
                onClick={() => setPhotoDataUrl(undefined)}
                className="absolute right-3 top-3 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-slate-950/80 text-white hover:bg-slate-950 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white"
                aria-label="Remove selected photo"
              >
                <X size={19} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <label htmlFor="field-note" className="mb-2 block text-sm font-bold text-slate-900">Notes {mode === 'Issue' && <span className="font-normal text-slate-600">(required without a photo)</span>}</label>
          <textarea
            id="field-note"
            value={note}
            onChange={event => setNote(event.target.value)}
            maxLength={4000}
            rows={4}
            placeholder={mode === 'Issue' ? 'Describe what needs attention…' : 'Add context for the team (optional)…'}
            className="w-full resize-y rounded-xl border border-slate-300 px-3 py-3 text-base text-slate-950 outline-none focus:border-indigo-600 focus:ring-4 focus:ring-indigo-100"
          />
          <p className="mt-1 text-right text-xs text-slate-500">{note.length}/4000</p>
        </div>

        <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-6 sm:px-6">
          {submitError && <p className="mb-2 flex gap-2 text-sm font-medium text-rose-700" role="alert"><CircleAlert className="shrink-0" size={18} aria-hidden="true" />{submitError}</p>}
          {submitMessage && <p className="mb-2 flex gap-2 text-sm font-medium text-emerald-700" role="status"><CheckCircle2 className="shrink-0" size={18} aria-hidden="true" />{submitMessage}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-base font-bold text-white shadow-lg hover:bg-slate-800 disabled:cursor-wait disabled:opacity-70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300"
          >
            {submitting ? <RefreshCw className="animate-spin" size={19} aria-hidden="true" /> : <Send size={19} aria-hidden="true" />}
            {submitting ? 'Saving report…' : online ? 'Save and submit report' : 'Save report for retry'}
          </button>
        </div>
      </form>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="field-queue-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 id="field-queue-title" className="text-base font-bold text-slate-950">Queued reports</h3>
            <p className="mt-1 text-sm text-slate-600">{queueState.waiting ? `${queueState.waiting} waiting to submit` : 'Nothing waiting to submit'}{queueState.needsAttention ? ` · ${queueState.needsAttention} need correction` : ''}</p>
          </div>
          <button
            type="button"
            onClick={handleRetryAll}
            disabled={retrying || !queueState.waiting}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
          >
            {retrying ? <RefreshCw className="animate-spin" size={17} aria-hidden="true" /> : <Upload size={17} aria-hidden="true" />}
            Retry queued reports
          </button>
        </div>
        {queue.length > 0 && (
          <ul className="mt-4 divide-y divide-slate-100">
            {queue.slice(0, 8).map(item => (
              <li key={item.id} className="flex min-w-0 items-start gap-3 py-3 text-sm">
                {item.terminal ? <CircleAlert className="mt-0.5 shrink-0 text-rose-600" size={18} aria-hidden="true" /> : <RefreshCw className="mt-0.5 shrink-0 text-amber-600" size={18} aria-hidden="true" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{item.draft.type} · {billboards.find(billboard => billboard.id === item.draft.billboardId)?.name || 'Unknown billboard'}</p>
                  <p className={`mt-0.5 text-xs ${item.terminal ? 'text-rose-700' : 'text-slate-600'}`}>{item.lastError || `Captured ${readableTime(item.queuedAt)}`}</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-slate-500">{item.retryCount ? `${item.retryCount} retry${item.retryCount === 1 ? '' : 'ies'}` : 'Queued'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="field-recent-title">
        <h3 id="field-recent-title" className="text-base font-bold text-slate-950">Recent submissions</h3>
        {recent.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {recent.map(report => (
              <li key={report.id} className="flex min-w-0 items-center gap-3 py-3">
                <CheckCircle2 className="shrink-0 text-emerald-600" size={19} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{report.type} · {billboards.find(billboard => billboard.id === report.billboardId)?.name || report.billboardId}</p>
                  <p className="mt-0.5 text-xs text-slate-600">{readableTime(report.capturedAt)}{report.accuracy != null ? ` · ±${Math.round(report.accuracy)} m` : ''}</p>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{report.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-600">Recent submitted reports will appear here.</p>}
      </section>
    </section>
  );
};

export default FieldOperations;
