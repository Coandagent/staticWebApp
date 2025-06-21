import React, { useState } from 'react';
import './App.css';
import * as XLSX from 'xlsx';

export default function App() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleFile = e => {
    const file = e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = async evt => {
      let rows = [];
      // Excel
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type:'array' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval:'' });
      }
      // CSV
      else if (/\.csv$/i.test(file.name)) {
        const txt = evt.target.result.trim();
        const [hdr,...lns] = txt.split('\n');
        const keys = hdr.split(',').map(k=>k.trim());
        rows = lns.map(l=>{
          const vals = l.split(',').map(v=>v.trim());
          return Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
        });
      }
      // JSON
      else {
        rows = JSON.parse(evt.target.result);
      }

      const payload = rows.map(r=>({
        from_location: r.from_location||r.origin,
        to_location:   r.to_location  ||r.destination,
        mode:          r.mode         ||r.transport,
        weight_kg:     Number(r.weight_kg||r.weight||0)
      }));

      setLoading(true);
      try {
        const res = await fetch('/api/calculate-co2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setResults(data.map(r=>({
          origin:      r.from_input,
          usedFrom:    r.from_used,
          destination: r.to_input,
          usedTo:      r.to_used,
          mode:        r.mode,
          distance:    r.distance_km,
          co2g:        (parseFloat(r.co2_kg)*1000).toFixed(0)
        })));
      } catch(err) {
        alert(err.message);
      } finally {
        setLoading(false);
      }
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) rd.readAsArrayBuffer(file);
    else rd.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="App">
      <h1>CO₂ Transport Calculator</h1>
      <input type="file" accept=".csv,.json,.xlsx,.xls" onChange={handleFile} />
      {loading && <p>Calculating…</p>}
      {results.length>0 && (
        <table>
          <thead>
            <tr>
              <th>Origin (used)</th><th>Dest (used)</th>
              <th>Mode</th><th>Dist km</th><th>CO₂ g</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r,i)=>(
              <tr key={i}>
                <td>{r.origin} ({r.usedFrom})</td>
                <td>{r.destination} ({r.usedTo})</td>
                <td>{r.mode}</td>
                <td>{r.distance}</td>
                <td>{r.co2g}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
