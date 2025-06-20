import React, { useState } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
      console.log('📦 FileReader finished loading');
      try {
        const result = e.target.result;
        let parsedData = [];

        if (file.name.match(/\.(xlsx|xls)$/i)) {
          const data = new Uint8Array(result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          parsedData = XLSX.utils.sheet_to_json(sheet, {
            header: ['from_location', 'to_location', 'mode', 'weight_kg'],
            defval: ''
          });
          console.log('Parsed Excel:', parsedData);
        } else if (file.name.endsWith('.csv')) {
          const text = result.trim();
          parsedData = text.split('\n').map(line => {
            const [o, d, m, w] = line.split(',').map(x => x.trim());
            return {
              from_location: o,
              to_location: d,
              mode: m,
              weight_kg: Number(w) || 0
            };
          });
          console.log('Parsed CSV:', parsedData);
        } else {
          const json = JSON.parse(result);
          parsedData = json.map(r => ({
            from_location: r.origin,
            to_location: r.destination,
            mode: r.transport,
            weight_kg: Number(r.weight_kg) || 0
          }));
          console.log('Parsed JSON:', parsedData);
        }

        console.log('Sending payload to API:', parsedData);
        setLoading(true);

        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error('API error:', res.status, errText);
          setLoading(false);
          return;
        }

        const data = await res.json();
        console.log('API returned:', data);

        const converted = data.map(r => ({
          origin: r.from_location,
          destination: r.to_location,
          transport: r.mode,
          distanceKm: r.distance_km,
          co2Grams: (parseFloat(r.co2_kg) * 1000).toFixed(0)
        }));
        setResults(converted);

      } catch (err) {
        console.error('Processing error:', err);
      } finally {
        setLoading(false);
      }
    };

    if (file.name.match(/\.(xlsx|xls)$/i)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }

    // Reset value to allow re-selecting same file :contentReference[oaicite:4]{index=4}
    event.target.value = null;
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
