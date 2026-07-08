import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../../supabaseClient';
import styles from './accueil.module.css';

// Point coloré fait en CSS (pas une image) : évite les soucis de chargement des icônes
// par défaut de Leaflet avec Vite (marqueur "cassé").
const laverieIcon = L.divIcon({
  className: 'laverie-marker',
  html: `<div style="
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #1C69D3;
    border: 3px solid #fff;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
  "></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
  tooltipAnchor: [0, -9],
});

type StatRow = { label: string; value: number; color: string };
type LaverieMapPoint = { id: string; nom: string; ville: string | null; latitude: number; longitude: number };

const FRANCE_CENTER: [number, number] = [46.6, 2.3];

export default function CrmAccueil() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatRow[]>([]);
  const [laveriesMap, setLaveriesMap] = useState<LaverieMapPoint[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      const [lav, inter, cmd, pros, lavPoints] = await Promise.all([
        supabase.from('laveries').select('*', { count: 'exact', head: true }),
        supabase.from('interventions').select('*', { count: 'exact', head: true }),
        supabase.from('commandes').select('*', { count: 'exact', head: true }),
        supabase.from('prospects').select('*', { count: 'exact', head: true }),
        supabase
          .from('laveries')
          .select('id, nom, ville, latitude, longitude')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null),
      ]);
      if (!alive) return;
      setStats([
        { label: 'Laveries', value: lav.count ?? 0, color: '#1C69D3' },
        { label: 'Interventions', value: inter.count ?? 0, color: '#7C3AED' },
        { label: 'Commandes', value: cmd.count ?? 0, color: '#D97706' },
        { label: 'Prospects', value: pros.count ?? 0, color: '#059669' },
      ]);
      setLaveriesMap((lavPoints.data ?? []) as LaverieMapPoint[]);
      setLoading(false);
    };
    load();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div>
      <h1 className={styles.title}>Accueil CRM</h1>
      {loading ? (
        <p style={{ color: '#666' }}>Chargement...</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16 }}>
            {stats.map((s) => (
              <div key={s.label} style={{ background: '#fff', border: '1px solid #EEE', borderRadius: 12, padding: 16 }}>
                <p style={{ margin: 0, color: '#666', fontSize: 13 }}>{s.label}</p>
                <p style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 700, color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          <h2 className={styles.mapTitle}>Carte des laveries</h2>
          <div className={styles.mapWrap}>
            <MapContainer center={FRANCE_CENTER} zoom={6} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {laveriesMap.map((l) => (
                <Marker
                  key={l.id}
                  position={[l.latitude, l.longitude]}
                  icon={laverieIcon}
                  eventHandlers={{ click: () => navigate(`/crm/laveries/${l.id}`) }}
                >
                  <Tooltip>
                    {l.nom}
                    {l.ville ? ` — ${l.ville}` : ''}
                  </Tooltip>
                </Marker>
              ))}
            </MapContainer>
          </div>
          {laveriesMap.length === 0 && (
            <p style={{ color: '#999', fontSize: 13, marginTop: 8 }}>
              Aucune laverie géolocalisée pour le moment.
            </p>
          )}
        </>
      )}
    </div>
  );
}
