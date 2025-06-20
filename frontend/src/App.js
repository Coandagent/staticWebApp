import React, { useState } from 'react';
import './App.css';

function App() {
  // Removed unused fileData
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const text = e.target.result.trim();
        let parsedData = [];

        if (file.name.endsWith('.csv')) {
          parsedData = text.split('\n').map(line => {
            const [origin, destination, transport, weight] = line.split(',').map(x => x.trim());
            return {
              from_location: origin,
              to_location: destination,
              mode: transport,
              weight_kg: Number(weight) || 0
            };
          });
        } else {
          parsedData = JSON.parse(text).map(r => ({
            from_location: r.origin,
            to_location: r.destination,
            mode: r.transport,
            weight_kg: Number(r.weight_kg) || 0
          }));
        }

        setLoading(true);
        const res = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
        const data = await res.json();

        // Convert kg to grams for display
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
    reader.readAsText(file);
  };

  return (
    <div className="App">
      <h1>CO₂ Transport Calculator</h1>
      <input type="file" accept=".csv,.json" onChange={handleFileUpload} />
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
