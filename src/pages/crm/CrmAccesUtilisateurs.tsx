import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import CrmUtilisateurs from './CrmUtilisateurs';
import GerantsResidences from '../GerantsResidences';
import styles from './accesUtilisateurs.module.css';

type Tab = 'crm' | 'gerants';

export default function CrmAccesUtilisateurs() {
  const [searchParams, setSearchParams] = useSearchParams();

  const tab: Tab = searchParams.get('tab') === 'gerants' ? 'gerants' : 'crm';

  const setTab = useCallback(
    (next: Tab) => {
      if (next === 'gerants') {
        setSearchParams({ tab: 'gerants' }, { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams]
  );

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t && t !== 'gerants' && t !== 'crm') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className={styles.wrap}>
      <h1 className={styles.pageTitle}>Utilisateurs &amp; accès</h1>
      <p className={styles.pageSubtitle}>
        Comptes <strong>CRM</strong> (planning, tournée, laveries) et comptes <strong>board</strong> (gérants /
        résidences, accès aux emplacements).
      </p>

      <div className={styles.tabs} role="tablist" aria-label="Type de comptes">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'crm'}
          className={`${styles.tab} ${tab === 'crm' ? styles.tabActive : ''}`}
          onClick={() => setTab('crm')}
        >
          Comptes CRM
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'gerants'}
          className={`${styles.tab} ${tab === 'gerants' ? styles.tabActive : ''}`}
          onClick={() => setTab('gerants')}
        >
          Gérants de résidences
        </button>
      </div>

      <div className={styles.panel} role="tabpanel">
        {tab === 'crm' ? <CrmUtilisateurs embedded /> : <GerantsResidences embedded />}
      </div>
    </div>
  );
}
