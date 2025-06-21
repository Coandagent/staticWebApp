// frontend/src/App.js

import React, { useState } from 'react';
import './App.css';
import * as XLSX from 'xlsx';
// Use relative paths for your local UI components
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';

export default function App() {
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
        parsed     = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      } else if (/\.csv$/i.test(file.name)) {
        const txt            = evt.target.result.trim();
        const [hdr, ...rows] = txt.split('\n');
        const keys           = hdr.split(',').map(h => h.trim());
        parsed               = rows.map(r => {
          const vals = r.split(',').map(v => v.trim());
          return Object.fromEntries(keys.map((k,i) => [k, vals[i]]));
        });
      } else {
        parsed = JSON.parse(evt.target.result);
      }

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
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResults(data.map(r => ({
          origin:      r.from_input,
          usedFrom:    r.from_used,
          destination: r.to_input,
          usedTo:      r.to_used,
          transport:   r.mode,
          distanceKm:  r.distance_km,
          co2Grams:    (parseFloat(r.co2_kg) * 1000).toFixed(0)
        })));
      } catch (err) {
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
    <div className="min-h-screen bg-neutral-50 p-6">
      <nav className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-extrabold text-green-800">
          Coandagent ESG Transport CO₂ Dashboard
        </h1>
        <Button variant="outline">
          Download Full ESG Report
        </Button>
      </nav>

      <section className="mb-6">
        <Card className="mb-4">
          <CardContent className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div>
              <h2 className="text-xl font-semibold">Upload Data</h2>
              <p className="text-sm text-gray-600">Supports CSV, Excel, JSON</p>
            </div>
            <input
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              onChange={handleFileUpload}
              className="block w-full md:w-auto text-sm text-gray-700 
                         file:mr-4 file:py-2 file:px-4 file:rounded-full 
                         file:border-0 file:text-sm file:font-semibold 
                         file:bg-green-100 file:text-green-800 
                         hover:file:bg-green-200"
            />
          </CardContent>
        </Card>
        {loading && (
          <p className="text-center text-gray-700">⏳ Calculating…</p>
        )}
      </section>

      {results.length > 0 && (
        <Card>
          <CardContent>
            <h2 className="text-lg font-semibold mb-4">Results</h2>
            <div className="overflow-auto">
              <table className="min-w-full table-auto whitespace-nowrap">
                <thead className="bg-green-200">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium">From</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">To</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Mode</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">Distance (km)</th>
                    <th className="px-4 py-2 text-right text-sm font-medium">CO₂ (g)</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r,i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-green-50'}>
                      <td className="px-4 py-2 text-sm">
                        {r.origin} <span className="text-gray-500">({r.usedFrom})</span>
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {r.destination} <span className="text-gray-500">({r.usedTo})</span>
                      </td>
                      <td className="px-4 py-2 text-sm capitalize">{r.transport}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{r.distanceKm}</td>
                      <td className="px-4 py-2 text-sm text-right font-mono">{r.co2Grams}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <footer className="mt-8 text-center text-gray-500 text-xs">
        © {new Date().getFullYear()} Coandagent. All rights reserved.
      </footer>
    </div>
  );
}
