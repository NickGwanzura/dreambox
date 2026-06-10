import React, { useState, useEffect } from 'react';
import { Clock, Send, CheckCircle, XCircle, AlertCircle, RefreshCw, Plus, FileText } from 'lucide-react';
import { QuotationEvent } from '../../types';
import { fetchQuotationEvents } from '../../services/mockData';

interface Props {
  invoiceId: string;
}

const EVENT_ICONS: Record<string, any> = {
  created: Plus,
  sent: Send,
  accepted: CheckCircle,
  rejected: XCircle,
  expired: AlertCircle,
  converted: RefreshCw,
  viewed: FileText,
  edited: Clock,
};

const EVENT_COLORS: Record<string, string> = {
  created: 'bg-slate-100 text-slate-700',
  sent: 'bg-indigo-100 text-indigo-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  converted: 'bg-purple-100 text-purple-700',
  viewed: 'bg-blue-100 text-blue-700',
  edited: 'bg-slate-100 text-slate-700',
};

export const QuotationTimeline: React.FC<Props> = ({ invoiceId }) => {
  const [events, setEvents] = useState<QuotationEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchQuotationEvents(invoiceId).then(data => {
      setEvents(data);
      setLoading(false);
    });
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Activity Timeline</h4>
        <div className="space-y-3 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <div className="w-8 h-8 bg-slate-100 rounded-full" />
              <div className="flex-1 space-y-1">
                <div className="h-3 bg-slate-100 rounded w-1/3" />
                <div className="h-2 bg-slate-100 rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 p-6">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-2">Activity Timeline</h4>
        <p className="text-sm text-slate-900 italic">No activity recorded yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-6">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 mb-4">Activity Timeline</h4>
      <div className="relative space-y-4">
        {events.map((event, idx) => {
          const Icon = EVENT_ICONS[event.type] || Clock;
          const colorClass = EVENT_COLORS[event.type] || 'bg-slate-100 text-slate-700';
          const date = new Date(event.createdAt);
          const dateStr = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          return (
            <div key={event.id} className="flex gap-3 relative">
              {idx !== events.length - 1 && (
                <div className="absolute left-4 top-8 bottom-[-16px] w-px bg-slate-200" />
              )}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${colorClass}`}>
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-slate-800 capitalize">{event.type.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-slate-900">{dateStr} at {timeStr}</span>
                </div>
                {event.details && (
                  <p className="text-xs text-slate-900 mt-0.5">{event.details}</p>
                )}
                {event.actorEmail && (
                  <p className="text-[10px] text-slate-900 mt-0.5">by {event.actorEmail}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
