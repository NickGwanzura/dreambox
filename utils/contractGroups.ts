import { Contract, Invoice } from '../types';

export const getContractGroupId = (contract: Contract) => contract.masterContractId || contract.id;

export const getContractGroupAllLines = (contract: Contract, contracts: Contract[]) => {
  const groupId = getContractGroupId(contract);
  return contracts.filter(c => getContractGroupId(c) === groupId);
};

export const invoiceTouchesContractLine = (invoice: Invoice, contractId: string) =>
  invoice.contractId === contractId || (invoice.items || []).some(item => item.contractLineId === contractId);
