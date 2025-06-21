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
      let raw = [];

      // 1️⃣ Excel
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const buf = new Uint8Array(evt.target.result);
        const wb  = XLSX.read(buf, { type: 'array' });
        const sh  = wb.Sheets[wb.SheetNames[0]];
        raw = XLSX.utils.sheet_to_json(sh, { defval: '' });
      }
      // 2️⃣ CSV (with header row)
      else if (/\.csv$/i.test(file.name)) {
        const txt = evt.target.result.trim().split('\n');
        const keys = txt[0].split(',').map(k => k.trim());
        raw = txt.slice(1).map(line => {
          const vals = line.split(',').map(v => v.trim());
          return Object.fromEntries(keys.map((k,i) => [k, vals[i]]));
        });
      }
      // 3️⃣ JSON
      else {
        raw = JSON.parse(evt.target.result);
      }

      // normalize
      const payload = raw.map(r => ({
        from_location: r.from_location || r.origin,
        to_location:   r.to_location   || r.destination,
        mode:          r.mode          || r.transport,
        weight_kg:     Number(r.weight_kg ?? r.weight ?? 0)
      }));

      console.log('Sending payload:', payload);
      setLoading(true);

      try {
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResults(data.map(r => ({
          origin:      r.from_input,
          usedOrigin:  r.from_used,
          destination: r.to_input,
          usedDest:    r.to_used,
          transport:   r.mode,
          distanceKm:  r.distance_km,
          co2Grams:    (parseFloat(r.co2_kg) * 1000).toFixed(0)
        })));
      } catch (err) {
        console.error(err);
        alert(err.message || 'Upload/API error');
      } finally {
        setLoading(false);
      }
    };

    // pick read method
    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);

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
        <table>
          <thead>
            <tr>
              <th>From (used)</th>
              <th>To (used)</th>
              <th>Mode</th>
              <th>Distance (km)</th>
              <th>CO₂ (g)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r,i) => (
              <tr key={i}>
                <td>{r.origin} ↦ {r.usedOrigin}</td>
                <td>{r.destination} ↦ {r.usedDest}</td>
                <td>{r.transport}</td>
                <td>{r.distanceKm}</td>
                <td>{r.co2Grams}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default App;
