// frontend/src/App.js

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
      let parsed = [];

      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const sh   = wb.Sheets[wb.SheetNames[0]];
        parsed     = XLSX.utils.sheet_to_json(sh, { defval: '' });
      } else if (/\.csv$/i.test(file.name)) {
        const txt           = evt.target.result.trim();
        const [hdr,...rows] = txt.split('\n');
        const keys          = hdr.split(',').map(h=>h.trim());
        parsed              = rows.map(r=>{
          const vals = r.split(',').map(v=>v.trim());
          return Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
        });
      } else {
        parsed = JSON.parse(evt.target.result);
      }

      // Normalize and enforce eu flag
      const payload = parsed.map(r => ({
        from_location: r.from_location || r.origin,
        to_location:   r.to_location   || r.destination,
        mode:          r.mode          || r.transport,
        weight_kg:     Number(r.weight_kg || r.weight) || 0,
        eu:            String(r.eu).toLowerCase() === 'yes',
        state:         (r.state || '').toLowerCase()
      }));

      setLoading(true);
      try {
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers:{ 'Content-Type':'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResults(data.map(r=>({
          origin:     r.from_input,
          usedFrom:   r.from_used,
          destination:r.to_input,
          usedTo:     r.to_used,
          transport:  r.mode,
          distanceKm: r.distance_km,
          co2Grams:   (parseFloat(r.co2_kg)*1000).toFixed(0)
        })));
      } catch(err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);

    e.target.value = '';
  };

  return (
    <div className="App">
      <h1>CO₂ Transport Calculator</h1>
      <p>
        <strong>Input requirements:</strong><br/>
        – A column <code>eu</code> with “yes” or “no” (MANDATORY)<br/>
        – (Optional) A column <code>state</code> for subdivision code
      </p>
      <input type="file" accept=".csv,.json,.xlsx,.xls" onChange={handleFileUpload}/>
      {loading && <p>Calculating…</p>}
      {results.length>0 && (
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
            {results.map((r,i)=>(
              <tr key={i}>
                <td>{r.origin} ({r.usedFrom})</td>
                <td>{r.destination} ({r.usedTo})</td>
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
