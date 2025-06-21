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
      const name = file.name.toLowerCase();

      // 1️⃣ Excel
      if (/\.(xlsx|xls)$/.test(name)) {
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        const sh   = wb.Sheets[wb.SheetNames[0]];
        parsed = XLSX.utils.sheet_to_json(sh, { defval: '' });
      }
      // 2️⃣ CSV
      else if (/\.csv$/.test(name)) {
        const text = evt.target.result.trim();
        const [hdr, ...lines] = text.split('\n');
        const keys = hdr.split(',').map(h => h.trim());
        parsed = lines.map(line => {
          const vals = line.split(',').map(v => v.trim());
          return Object.fromEntries(keys.map((k,i) => [k, vals[i]]));
        });
      }
      // 3️⃣ JSON
      else {
        parsed = JSON.parse(evt.target.result);
      }

      // normalize to API shape
      const payload = parsed.map(r => ({
        from_location: r.from_location || r.origin,
        to_location:   r.to_location   || r.destination,
        mode:          r.mode          || r.transport,
        weight_kg:     Number(r.weight_kg ?? r.weight ?? 0)
      }));

      console.log('Sending payload to API:', payload);
      setLoading(true);
      try {
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        // format for display
        setResults(
          data.map(r => ({
            originInput:   r.from_input,
            originUsed:    r.from_used,
            destInput:     r.to_input,
            destUsed:      r.to_used,
            transport:     r.mode,
            distanceKm:    r.distance_km,
            co2Grams:      (parseFloat(r.co2_kg) * 1000).toFixed(0),
            error:         r.error
          }))
        );
      } catch (err) {
        console.error('Error:', err);
        alert(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (/\.(xlsx|xls)$/.test(file.name)) reader.readAsArrayBuffer(file);
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
        <div>
          <h2>Results</h2>
          <table>
            <thead>
              <tr>
                <th>Origin (in)</th>
                <th>Origin (used)</th>
                <th>Destination (in)</th>
                <th>Destination (used)</th>
                <th>Mode</th>
                <th>Distance (km)</th>
                <th>CO₂ (g)</th>
                <th>Error?</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r,i) => (
                <tr key={i}>
                  <td>{r.originInput}</td>
                  <td>{r.originUsed}</td>
                  <td>{r.destInput}</td>
                  <td>{r.destUsed}</td>
                  <td>{r.transport}</td>
                  <td>{r.distanceKm}</td>
                  <td>{r.co2Grams}</td>
                  <td>{r.error || ''}</td>
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
