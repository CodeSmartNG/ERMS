import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// --- Leaflet Icon Fix ---
// This prevents the "Cannot read properties of undefined" error in Vite builds
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;
// ------------------------

const SEVERITY_COLOR = {
  LOW: '#3b82f6',      // Blue
  MEDIUM: '#f59e0b',   // Amber
  HIGH: '#ef4444',     // Red
  CRITICAL: '#7f1d1d', // Dark Red
};

export default function IncidentMap({ incidents = [] }) {
  // Nigeria Center Point
  const center = [9.0820, 8.6753];

  // Filter out any incidents without valid GPS coordinates
  const validIncidents = incidents.filter(
    (inc) => inc.location?.lat && inc.location?.lng
  );

  return (
    <div className="h-[500px] w-full rounded-xl overflow-hidden border border-slate-200">
      <MapContainer center={center} zoom={6} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {validIncidents.map((inc) => (
          <CircleMarker
            key={inc._id}
            center={[inc.location.lat, inc.location.lng]}
            pathOptions={{
              color: SEVERITY_COLOR[inc.severity] || '#ef4444',
              fillColor: SEVERITY_COLOR[inc.severity] || '#ef4444',
              fillOpacity: 0.7,
              weight: 2,
              radius: inc.severity === 'CRITICAL' ? 12 : inc.severity === 'HIGH' ? 9 : 6,
            }}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">{inc.title}</p>
                <p className="text-xs text-slate-500">{inc.type.replace(/_/g, ' ')}</p>
                <p className="text-xs"><strong>Severity:</strong> {inc.severity}</p>
                <p className="text-xs"><strong>Status:</strong> {inc.status}</p>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(inc.occurredAt).toLocaleString()}</p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}