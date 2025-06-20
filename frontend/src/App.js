import React, { useState } from 'react';
import './App.css';

function App() {
  const [fileData, setFileData] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        let parsedData = [];

        if (file.name.endsWith('.csv')) {
          parsedData = text
            .trim()
            .split('\n')
            .map((line) => {
              const [origin, destination, transport] = line.split(',');
              return { origin: origin.trim(), destination: destination.trim(), transport: transport.trim() };
            });
        } else {
          parsedData = JSON.parse(text);
        }

        setFileData(parsedData);
        setLoading(true);

        // 🔁 Placeholder: backend not connected yet
        const response = await fetch('/api/calculate-co2', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData),
        });

        const resultData = await response.json();
        setResults(resultData);
        setLoading(false);
      } catch (error) {
        console.error('Error reading file or calling API:', error);
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="App">
      <h1>CO₂ Transport Calculator</h1>
      <input type="file" accept=".csv,.json" onChange={handleFileUpload} />
      {loading && <p>Calculating...</p>}
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
