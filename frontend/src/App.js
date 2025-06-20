import React, { useState } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = event => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();

    reader.onload = async e => {
      try {
        const result = e.target.result;
        let parsedData = [];

        if (file.name.match(/\.(xlsx|xls)$/i)) {
          //1️⃣ Excel: Read array buffer and parse first sheet
          const data = new Uint8Array(result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          parsedData = XLSX.utils.sheet_to_json(sheet, {
            header: ['from_location', 'to_location', 'mode', 'weight_kg'],
            defval: ''
          });
        } else if (file.name.endsWith('.csv')) {
          // 2️⃣ CSV: Convert rows
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
        } else {
          // 3️⃣ JSON: Array of objects
          const json = JSON.parse(result);
          parsedData = json.map(r => ({
            from_location: r.origin,
            to_location: r.destination,
            mode: r.transport,
            weight_kg: Number(r.weight_kg) || 0
          }));
        }

        // 🔁 Send to backend
        setLoading(true);
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
        const data = await res.json();

        // Convert to display format
        const converted = data.map(r => ({
          origin: r.from_location,
          destination: r.to_location,
          transport: r.mode,
          distanceKm: r.distance_km,
          co2Grams: (parseFloat(r.co2_kg) * 1000).toFixed(0)
        }));
        setResults(converted);
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    // 🔄 Choose read method per type
    if (file.name.match(/\.(xlsx|xls)$/i)) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
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
