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
  firstName: string | null;
  canAccessEmplacement: (emplacementId?: string | null) => boolean;
}

// CRITIQUE #12 de l'audit : le comportement par défaut doit toujours être le plus
// restrictif (fail-closed), jamais le plus permissif. Un compte sans ligne explicite dans
// board_account_roles (ou en cas d'erreur réseau) est traité comme "residence" sans aucun
// emplacement autorisé — c'est-à-dire sans accès à rien de spécifique — plutôt que "patron"
// (accès total). Tous les comptes de confiance actuels (patron + les 4 comptes résidence)
// ont déjà une ligne explicite en base, donc ce changement ne bloque personne d'existant.
const BoardAccessContext = createContext<BoardAccessContextType>({
  role: 'residence',
  loading: true,
  allowedEmplacementIds: [],
  isPatron: false,
  isResidence: true,
  firstName: null,
  canAccessEmplacement: () => false,
});

export function BoardAccessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [role, setRole] = useState<BoardRole>('residence');
  const [allowedEmplacementIds, setAllowedEmplacementIds] = useState<string[]>([]);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadAccess = async () => {
      if (!user) {
        if (!cancelled) {
          setRole('residence');
          setAllowedEmplacementIds([]);
          setFirstName(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const { data: roleRow } = await supabase
          .from('board_account_roles')
          .select('role, first_name')
          .eq('user_id', user.id)
          .maybeSingle();

        const resolvedRole: BoardRole =
          roleRow?.role === 'patron' ? 'patron' : 'residence';

        if (!cancelled) {
          setRole(resolvedRole);
          setFirstName(roleRow?.first_name ?? null);
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
          // Fail-closed : en cas d'erreur (réseau, table absente...), ne jamais accorder
          // l'accès patron par défaut.
          setRole('residence');
          setAllowedEmplacementIds([]);
          setFirstName(null);
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
      firstName,
      canAccessEmplacement: (emplacementId?: string | null) => {
        if (isPatron) return true;
        if (!emplacementId) return false;
        return allowedSet.has(emplacementId);
      },
    };
  }, [allowedEmplacementIds, loading, role, firstName]);

  return (
    <BoardAccessContext.Provider value={value}>
      {children}
    </BoardAccessContext.Provider>
  );
}

export function useBoardAccess() {
  return useContext(BoardAccessContext);
}
