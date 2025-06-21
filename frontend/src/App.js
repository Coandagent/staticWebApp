import React, { useState } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async evt => {
      setLoading(true);
      try {
        const data = evt.target.result;
        let parsed = [];

        // 1️⃣ Excel
        if (/\.(xlsx|xls)$/i.test(file.name)) {
          const arr = new Uint8Array(data);
          const wb  = XLSX.read(arr, { type: 'array' });
          const sh  = wb.Sheets[wb.SheetNames[0]];
          parsed = XLSX.utils.sheet_to_json(sh, { defval: '' });
        }
        // 2️⃣ CSV
        else if (/\.csv$/i.test(file.name)) {
          const text = data.trim();
          const [hdr, ...lines] = text.split(/\r?\n/);
          const keys = hdr.split(',').map(k => k.trim());
          parsed = lines.map(line => {
            const vals = line.split(',').map(v => v.trim());
            return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
          });
        }
        // 3️⃣ JSON
        else {
          parsed = JSON.parse(data);
        }

        // normalize to API shape
        const payload = parsed.map(r => ({
          from_location:   r.from_location   || r.origin   || r.From   || r.Origin,
          to_location:     r.to_location     || r.destination || r.To   || r.Destination,
          mode:            r.mode            || r.transport || r.Mode || r.Transport,
          weight_kg:       Number(r.weight_kg ?? r.weight ?? r.Weight ?? 0)
        }));

        console.log('Sending payload to API:', payload);
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || `HTTP ${res.status}`);
        }
        const dataOut = await res.json();

        // prepare for display
        setResults(dataOut.map(r => ({
          origin:            r.from_input,
          matchedOrigin:     r.from_used,
          destination:       r.to_input,
          matchedDestination:r.to_used,
          transport:         r.mode,
          distanceKm:        r.distance_km,
          co2Grams:          (parseFloat(r.co2_kg) * 1000).toFixed(0)
        })));
      } catch (err) {
        console.error(err);
        alert(err.message || 'Error processing upload');
      } finally {
        setLoading(false);
      }
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);

    // allow re-upload same file
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
                <th>Matched Origin</th>
                <th>Destination</th>
                <th>Matched Destination</th>
                <th>Transport</th>
                <th>Distance (km)</th>
                <th>CO₂ (g)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r,i) => (
                <tr key={i}>
                  <td>{r.origin}</td>
                  <td>{r.matchedOrigin}</td>
                  <td>{r.destination}</td>
                  <td>{r.matchedDestination}</td>
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
