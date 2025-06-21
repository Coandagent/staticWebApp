import React, { useState } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let parsed = [];

      // 1️⃣ Excel (.xlsx/.xls)
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const sh   = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(sh, { defval: '' });
      }
      // 2️⃣ CSV (comma-separated with header)
      else if (/\.csv$/i.test(file.name)) {
        const text = evt.target.result.trim();
        const [hdr, ...lines] = text.split('\n');
        const keys = hdr.split(',').map(h => h.trim());
        parsed = lines.map(line => {
          const vals = line.split(',').map(v => v.trim());
          return Object.fromEntries(keys.map((k,i) => [k, vals[i]]));
        });
      }
      // 3️⃣ JSON (array of objects)
      else {
        parsed = JSON.parse(evt.target.result);
      }

      // Normalize to API shape
      const payload = parsed.map(r => ({
        from_location: r.from_location || r.origin,
        to_location:   r.to_location   || r.destination,
        mode:          r.mode          || r.transport,
        weight_kg:     Number(r.weight_kg ?? r.weight ?? 0),
      }));

      console.log('Sending payload to API:', payload);
      setLoading(true);

      try {
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        // Format for display
        const view = data.map(r => ({
          origin:      r.from_location,
          destination: r.to_location,
          transport:   r.mode,
          distanceKm:  r.distance_km,
          co2Grams:    (parseFloat(r.co2_kg) * 1000).toFixed(0),
        }));
        setResults(view);
      } catch (err) {
        console.error('Upload / API error:', err);
        alert(err.message || 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    // Read file correctly
    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);

    // Allow re-selecting same file
    e.target.value = '';
  };

  return (
    <div className="App">
      <h1>CO₂ Transport Calculator</h1>
      <input
        type="file"
        accept=".csv,.json,.xlsx,.xls"
        onChange={handleFileUpload}
      />
      {loading && <p>Calculating…</p>}
      {results.length > 0 && (
        <div>
          <h2>Results</h2>
          <table>
            <thead>
              <tr>
                <th>Origin</th>
                <th>Destination</th>
                <th>Transport</th>
                <th>Distance (km)</th>
                <th>CO₂ (g)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.origin}</td>
                  <td>{r.destination}</td>
                  <td>{r.transport}</td>
                  <td>{r.distanceKm}</td>
                  <td>{r.co2Grams}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default App;
