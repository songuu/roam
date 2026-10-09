import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import type { Stop } from '../../shared/types';

export default function RouteMap({ stops }: { stops: Stop[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [tileFailed, setTileFailed] = useState(false);
  const points = stops.filter(stop => Number.isFinite(stop.lat) && Number.isFinite(stop.lon) && Math.abs(stop.lat) <= 90 && Math.abs(stop.lon) <= 180);
  useEffect(() => {
    if (!container.current || !points.length) return;
    setTileFailed(false);
    const map = L.map(container.current, { scrollWheelZoom: false, attributionControl: true });
    const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 });
    tiles.on('tileerror', () => setTileFailed(true));
    tiles.addTo(map);
    const coordinates = points.map(stop => [stop.lat, stop.lon] as L.LatLngTuple);
    points.forEach((stop, index) => {
      const icon = L.divIcon({ className: 'route-marker', html: `<span>${index + 1}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
      const popup = document.createElement('div');
      popup.textContent = `${index + 1}. ${stop.name} · ${stop.startTime}`;
      L.marker([stop.lat, stop.lon], { icon, title: stop.name }).bindPopup(popup).addTo(map);
    });
    L.polyline(coordinates, { color: '#315a45', weight: 3, opacity: .8, dashArray: '6 8' }).addTo(map);
    if (coordinates.length === 1) map.setView(coordinates[0], 13);
    else map.fitBounds(L.latLngBounds(coordinates), { padding: [30, 30], maxZoom: 14 });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); };
  // The source stops are stable within a day; a day switch rebuilds the map and its bounds.
  }, [stops]);

  return <section className="map-card paper-card"><div className="section-heading"><h3><MapPin size={17} />今日路线</h3><span>直线示意</span></div><div ref={container} className="route-map" aria-label="今日地点地图，路线为直线示意" />{tileFailed && <p className="map-fallback" role="status">地图底图暂时无法加载，地点顺序仍可在下方查看。</p>}<p className="map-disclaimer">连线仅展示地点顺序，实际道路与交通请以导航为准。</p><ol className="map-stop-list">{points.map(stop => <li key={stop.id}><a href={stop.mapUrl} target="_blank" rel="noopener noreferrer">{stop.name}</a></li>)}</ol>{!points.length && <p className="muted">暂未获得可展示的坐标。</p>}</section>;
}
