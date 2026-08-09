export type PulledCoreRecords = {
  invoices?: any[];
  billboards?: any[];
  contracts?: any[];
  clients?: any[];
};

type PulledRecordsHandler = (records: PulledCoreRecords) => void;
let handler: PulledRecordsHandler | null = null;

export function registerPulledRecordsHandler(next: PulledRecordsHandler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

export function publishPulledRecords(records: PulledCoreRecords): void {
  handler?.(records);
}
