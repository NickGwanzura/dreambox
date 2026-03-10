# Supabase Helpers Usage Guide

## Overview

New comprehensive helper utilities have been added for pulling data from Supabase. These include:

- **Generic fetch utilities** for any table
- **Entity-specific helpers** for common operations
- **React hooks** for easy data fetching
- **Realtime subscriptions** for live updates
- **Bulk operations** for importing/exporting
- **Data sync manager UI component**

---

## Quick Start

### 1. Import the helpers

```typescript
import { 
  fetchAll, 
  fetchById, 
  useSupabaseQuery,
  checkSupabaseHealth 
} from './services/storage';
```

### 2. Check connection

```typescript
const health = await checkSupabaseHealth();
if (health.connected) {
  console.log('Supabase is connected!');
} else {
  console.log('Error:', health.error);
}
```

---

## Fetch Helpers

### Generic Fetch All

```typescript
import { fetchAll } from './services/storage';

// Fetch all records from any table
const { data, count, error, hasMore } = await fetchAll('billboards', {
  limit: 100,
  orderBy: 'created_at',
  orderDirection: 'desc',
  page: 1
});

// With filters
const { data: activeBillboards } = await fetchAll('billboards', {
  filters: { status: 'Active' }
});
```

### Fetch by ID

```typescript
import { fetchById } from './services/storage';

const { data: billboard, error } = await fetchById('billboards', 'billboard-123');
```

### Fetch by Field

```typescript
import { fetchByField } from './services/storage';

const { data: clientContracts } = await fetchByField(
  'contracts', 
  'client_id', 
  'client-456'
);
```

### Search Records

```typescript
import { searchRecords } from './services/storage';

const { data: searchResults } = await searchRecords(
  'clients',
  ['company_name', 'contact_person', 'email'], // fields to search
  'Acme Corp' // search term
);
```

---

## Entity-Specific Helpers

Pre-built helpers for common entities:

```typescript
import {
  fetchUsersFromSupabase,
  fetchBillboardsFromSupabase,
  fetchClientsFromSupabase,
  fetchContractsFromSupabase,
  fetchInvoicesFromSupabase,
  fetchTasksFromSupabase,
  fetchMaintenanceLogsFromSupabase,
  fetchExpensesFromSupabase,
} from './services/storage';

// Fetch all users
const { data: users } = await fetchUsersFromSupabase();

// Fetch billboards
const { data: billboards } = await fetchBillboardsFromSupabase({ limit: 50 });

// Search clients
const { data: clients } = await fetchClientsFromSupabase('search term');

// Fetch invoices by status
const { data: pendingInvoices } = await fetchInvoicesFromSupabase('Pending');

// Fetch tasks for a user
const { data: myTasks } = await fetchTasksFromSupabase('user-id-123', 'Todo');

// Fetch maintenance logs for a billboard
const { data: logs } = await fetchMaintenanceLogsFromSupabase('billboard-123');
```

---

## React Hooks

### useSupabaseQuery Hook

Fetch data with automatic loading states:

```typescript
import { useSupabaseQuery } from './services/storage';

function BillboardList() {
  const { data, loading, error, hasMore, refetch } = useSupabaseQuery(
    'billboards',  // table name
    { limit: 20, orderBy: 'name' },  // options
    []  // dependencies (refetch when these change)
  );

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      {data.map(billboard => (
        <div key={billboard.id}>{billboard.name}</div>
      ))}
      <button onClick={refetch}>Refresh</button>
    </div>
  );
}
```

### useSupabaseRealtime Hook

Subscribe to realtime updates:

```typescript
import { useSupabaseRealtime } from './services/storage';

function LiveBillboardList() {
  const { data: billboards, isSubscribed } = useSupabaseRealtime(
    'billboards',
    { enabled: true }  // or { filter: 'status=eq.Active' }
  );

  return (
    <div>
      <div>Subscribed: {isSubscribed ? 'Yes' : 'No'}</div>
      {billboards.map(b => (
        <div key={b.id}>{b.name}</div>
      ))}
    </div>
  );
}
```

---

## Realtime Subscriptions

Manual subscription management:

```typescript
import { subscribeToTable } from './services/storage';

// Subscribe to changes
const unsubscribe = subscribeToTable(
  'billboards',
  {
    onInsert: (newRecord) => console.log('Inserted:', newRecord),
    onUpdate: (updatedRecord) => console.log('Updated:', updatedRecord),
    onDelete: (deletedRecord) => console.log('Deleted:', deletedRecord),
  },
  'status=eq.Active'  // optional filter
);

// Later, unsubscribe
unsubscribe();
```

---

## Bulk Operations

### Bulk Insert

```typescript
import { bulkInsert } from './services/storage';

const newBillboards = [
  { name: 'Billboard 1', location: 'Highway A1' },
  { name: 'Billboard 2', location: 'Highway B2' },
];

const { data, error } = await bulkInsert('billboards', newBillboards);
```

### Bulk Update

```typescript
import { bulkUpdate } from './services/storage';

const updates = [
  { id: '1', status: 'Maintenance' },
  { id: '2', status: 'Available' },
];

const { data, error } = await bulkUpdate('billboards', updates);
```

### Bulk Delete

```typescript
import { bulkDelete } from './services/storage';

const { error, deletedCount } = await bulkDelete(
  'billboards', 
  ['id-1', 'id-2', 'id-3']
);
```

---

## Backup & Export

### Export All Data

```typescript
import { exportAllData } from './services/storage';

const { data, error } = await exportAllData();

// Download as JSON file
const blob = new Blob([JSON.stringify(data, null, 2)], { 
  type: 'application/json' 
});
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
a.click();
```

### Get Database Stats

```typescript
import { getDatabaseStats } from './services/storage';

const stats = await getDatabaseStats();
console.log('Total records:', stats.totalRecords);
console.log('Billboards:', stats.tables.billboards);
console.log('Clients:', stats.tables.clients);
```

---

## Data Sync Manager Component

A pre-built UI component for managing cloud sync:

```typescript
import { DataSyncManager } from './components/DataSyncManager';

function SettingsPage() {
  return (
    <div>
      <h1>Settings</h1>
      <DataSyncManager />
    </div>
  );
}
```

This component provides:
- One-click sync from cloud
- Visual sync status for each table
- Export to JSON backup
- Database statistics
- Connection health indicator

It's now available in **Settings → Cloud Sync** tab.

---

## Complete Example: Data Fetching Component

```typescript
import React, { useState } from 'react';
import { 
  useSupabaseQuery, 
  searchRecords,
  checkSupabaseHealth 
} from '../services/storage';
import { useToast } from './ToastProvider';

export const ClientDirectory: React.FC = () => {
  const { showToast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);

  // Use the hook for initial load
  const { 
    data: clients, 
    loading, 
    error, 
    refetch 
  } = useSupabaseQuery(
    'clients',
    { limit: 50, orderBy: 'company_name' },
    []
  );

  const handleSearch = async () => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const result = await searchRecords(
      'clients',
      ['company_name', 'contact_person', 'email'],
      searchTerm
    );

    if (result.error) {
      showToast('Search failed: ' + result.error, 'error');
    } else {
      setSearchResults(result.data);
    }
    setIsSearching(false);
  };

  const handleSync = async () => {
    const health = await checkSupabaseHealth();
    if (!health.connected) {
      showToast('Not connected to cloud', 'error');
      return;
    }

    await refetch();
    showToast('Data refreshed from cloud', 'success');
  };

  const displayClients = searchResults.length > 0 ? searchResults : clients;

  if (loading) return <div>Loading clients...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search clients..."
          className="flex-1 px-4 py-2 border rounded-lg"
        />
        <button onClick={handleSearch} disabled={isSearching}>
          {isSearching ? 'Searching...' : 'Search'}
        </button>
        <button onClick={handleSync}>Sync</button>
      </div>

      <div className="grid gap-2">
        {displayClients.map((client) => (
          <div key={client.id} className="p-4 border rounded-lg">
            <h3>{client.company_name}</h3>
            <p>{client.contact_person}</p>
            <p>{client.email}</p>
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## Error Handling

All helpers return consistent error handling:

```typescript
const { data, error, count, hasMore } = await fetchAll('billboards');

if (error) {
  // Handle error
  console.error('Failed to fetch:', error);
  return;
}

// Use data
console.log(`Found ${count} billboards`);
```

---

## TypeScript Types

```typescript
import type { 
  SyncOptions, 
  SyncResult, 
  RealtimeCallbacks 
} from './services/storage';

// Define your entity type
interface Billboard {
  id: string;
  name: string;
  location: string;
  status: 'Active' | 'Rented' | 'Maintenance';
}

// Use with generics
const result = await fetchAll<Billboard>('billboards');
// result.data is typed as Billboard[]
```

---

## File Structure

```
services/storage/
├── index.ts              # Main exports
├── supabaseHelpers.ts    # All helper functions
├── localStorage.ts       # Local storage utilities
└── realtimeSync.ts       # Realtime sync utilities

components/
└── DataSyncManager.tsx   # UI component for sync management
```

---

## Best Practices

1. **Always check for errors** after fetch operations
2. **Use the React hooks** for components - they handle loading states
3. **Implement pagination** for large datasets using `page` and `limit`
4. **Use filters** on the server side rather than filtering client-side
5. **Subscribe to realtime** for collaborative features
6. **Export backups regularly** using the `exportAllData` function
