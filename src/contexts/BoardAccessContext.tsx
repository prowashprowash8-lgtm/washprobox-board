import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';

export type BoardRole = 'patron' | 'residence';

interface BoardAccessContextType {
  role: BoardRole;
  loading: boolean;
  allowedEmplacementIds: string[];
  isPatron: boolean;
  isResidence: boolean;
  canAccessEmplacement: (emplacementId?: string | null) => boolean;
}

const BoardAccessContext = createContext<BoardAccessContextType>({
  role: 'patron',
  loading: true,
  allowedEmplacementIds: [],
  isPatron: true,
  isResidence: false,
  canAccessEmplacement: () => true,
});

export function BoardAccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [role, setRole] = useState<BoardRole>('patron');
  const [allowedEmplacementIds, setAllowedEmplacementIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAccess = async () => {
      if (!user) {
        if (!cancelled) {
          setRole('patron');
          setAllowedEmplacementIds([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const { data: roleRow } = await supabase
          .from('board_account_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        const resolvedRole: BoardRole =
          roleRow?.role === 'residence' ? 'residence' : 'patron';

        if (!cancelled) {
          setRole(resolvedRole);
        }

        if (resolvedRole === 'residence') {
          const { data: accessRows } = await supabase
            .from('board_account_emplacements')
            .select('emplacement_id')
            .eq('user_id', user.id);

          if (!cancelled) {
            setAllowedEmplacementIds(
              (accessRows ?? [])
                .map((row: { emplacement_id?: string | null }) => row.emplacement_id ?? '')
                .filter(Boolean)
            );
          }
        } else if (!cancelled) {
          setAllowedEmplacementIds([]);
        }
      } catch {
        if (!cancelled) {
          // Fallback volontaire : ne pas verrouiller les comptes existants si la table n'est
          // pas encore créée. Une ligne board_account_roles en "residence" activera la restriction.
          setRole('patron');
          setAllowedEmplacementIds([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadAccess();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const value = useMemo<BoardAccessContextType>(() => {
    const isPatron = role === 'patron';
    const isResidence = role === 'residence';
    const allowedSet = new Set(allowedEmplacementIds);

    return {
      role,
      loading,
      allowedEmplacementIds,
      isPatron,
      isResidence,
      canAccessEmplacement: (emplacementId?: string | null) => {
        if (isPatron) return true;
        if (!emplacementId) return false;
        return allowedSet.has(emplacementId);
      },
    };
  }, [allowedEmplacementIds, loading, role]);

  return (
    <BoardAccessContext.Provider value={value}>
      {children}
    </BoardAccessContext.Provider>
  );
}

export function useBoardAccess() {
  return useContext(BoardAccessContext);
}
