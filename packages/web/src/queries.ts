import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api.ts";

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: api.settings });
export const useAccounts = () => useQuery({ queryKey: ["accounts"], queryFn: api.accounts });
export const useImportedAccounts = () =>
  useQuery({ queryKey: ["importedAccounts"], queryFn: api.importedAccounts });
export const useBalanceHistory = (days = 90) =>
  useQuery({ queryKey: ["balanceHistory", days], queryFn: () => api.balanceHistory(days) });
export const useSummary = (month?: string) =>
  useQuery({ queryKey: ["summary", month ?? "current"], queryFn: () => api.summary(month) });
export const useGoals = () => useQuery({ queryKey: ["goals"], queryFn: api.goals });
export const useAllocations = () => useQuery({ queryKey: ["allocations"], queryFn: api.allocations });
export const useScheduled = () => useQuery({ queryKey: ["scheduled"], queryFn: api.scheduled });
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: api.categories, staleTime: Infinity });
export const useRules = () => useQuery({ queryKey: ["rules"], queryFn: api.rules });
export const useTellerConfig = () => useQuery({ queryKey: ["tellerConfig"], queryFn: api.tellerConfig });

export const useTransactions = (params: Record<string, string | number | undefined>) =>
  useQuery({ queryKey: ["transactions", params], queryFn: () => api.transactions(params) });

/** Invalidate everything that depends on the underlying financial data. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return () =>
    qc.invalidateQueries({
      predicate: (q) =>
        [
          "settings",
          "accounts",
          "importedAccounts",
          "balanceHistory",
          "summary",
          "goals",
          "allocations",
          "scheduled",
          "transactions",
          "tellerConfig",
        ].includes(q.queryKey[0] as string),
    });
}

export function useSync() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: api.sync, onSuccess: refresh });
}

export function useUpdateSettings() {
  const refresh = useRefreshAll();
  return useMutation({ mutationFn: api.updateSettings, onSuccess: refresh });
}
