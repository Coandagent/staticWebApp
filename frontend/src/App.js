// frontend/src/App.js

import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
  Container,
  Navbar,
  Nav,
  Button,
  Form,
  Table,
  Card,
  Dropdown,
  Row,
  Col,
  Spinner,
} from 'react-bootstrap';
import { FaUpload, FaCalculator, FaDownload, FaTrash } from 'react-icons/fa';
import * as XLSX from 'xlsx';

export default function App() {
  const [rows, setRows] = useState([
    { from: '', to: '', mode: 'road', weight: '', eu: true, state: '' }
  ]);
  const [results, setResults] = useState([]);
  const [format, setFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  const handleChange = (idx, field, value) => {
    const updated = [...rows];
    updated[idx][field] = value;
    setRows(updated);
  };

  const addRow = () =>
    setRows([...rows, { from: '', to: '', mode: 'road', weight: '', eu: true, state: '' }]);
  const removeRow = idx =>
    setRows(rows.filter((_, i) => i !== idx));

  const calculate = async (payload) => {
    setLoading(true);
    try {
      const res = await fetch('/api/calculate-co2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
      setFileLoading(false);
    }
  };

  const handleManualCalculate = () => {
    const payload = rows.map(r => ({
      from_location: r.from,
      to_location:   r.to,
      mode:          r.mode,
      weight_kg:     Number(r.weight) || 0,
      eu:            r.eu,
      state:         r.state.trim().toLowerCase(),
    }));
    calculate(payload);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileLoading(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      let parsed = [];
      const text = evt.target.result;

      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data, { type: 'array' });
        parsed     = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      } else if (/\.csv$/i.test(file.name)) {
        const lines = text.trim().split('\n');
        const keys  = lines[0].split(',').map(h => h.trim());
        parsed = lines.slice(1).map(row => {
          const vals = row.split(',').map(v => v.trim());
          return Object.fromEntries(keys.map((k,i) => [k, vals[i]]));
        });
      } else {
        parsed = JSON.parse(text);
      }

      const payload = parsed.map(r => ({
        from_location: r.from_location || r.from || r.origin,
        to_location:   r.to_location   || r.to   || r.destination,
        mode:          r.mode          || r.transport,
        weight_kg:     Number(r.weight_kg || r.weight) || 0,
        eu:            String(r.eu).toLowerCase() === 'yes',
        state:         (r.state || '').toLowerCase(),
      }));

      calculate(payload);
      e.target.value = '';
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else                                   reader.readAsText(file);
  };

  const downloadReport = () => {
    if (!results.length) {
      alert('No results to download.');
      return;
    }

    if (format === 'csv' || format === 'xlsx') {
      const wsData = [
        ['From','Used From','To','Used To','Mode','Distance_km','CO2_kg'],
        ...results.map(r => [
          r.from_input, r.from_used,
          r.to_input,   r.to_used,
          r.mode,       r.distance_km,
          r.co2_kg
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      const wbout = XLSX.write(wb, { bookType: format==='xlsx'?'xlsx':'csv', type:'array' });
      const blob  = new Blob([wbout], { type: 'application/octet-stream' });
      const a     = document.createElement('a');
      a.href      = URL.createObjectURL(blob);
      a.download  = `co2-results.${format}`;
      a.click();
    } else if (format === 'pdf') {
      const win = window.open('', '_blank');
      win.document.write('<html><head><title>CO₂ Report</title></head><body>');
      win.document.write('<h1>CO₂ Transport Report</h1>');
      win.document.write('<table border="1" style="width:100%;border-collapse:collapse;">');
      win.document.write('<tr><th>From</th><th>Used From</th><th>To</th><th>Used To</th><th>Mode</th><th>Distance</th><th>CO₂ (kg)</th></tr>');
      results.forEach(r => {
        win.document.write(`<tr>
          <td>${r.from_input}</td><td>${r.from_used}</td>
          <td>${r.to_input}</td><td>${r.to_used}</td>
          <td>${r.mode}</td><td>${r.distance_km}</td><td>${r.co2_kg}</td>
        </tr>`);
      });
      win.document.write('</table></body></html>');
      win.document.close();
      win.print();
    }
  };

  return (
    <>
      <Navbar bg="light" expand="lg" className="shadow-sm">
        <Container>
          <Navbar.Brand>Coandagent ESG CO₂ Dashboard</Navbar.Brand>
          <Nav className="ms-auto align-items-center">
            {/* Hidden file input */}
            <Form.Control
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              onChange={handleFileUpload}
              id="file-upload"
              style={{ display: 'none' }}
            />
            {/* Upload button */}
            <Button as="label" htmlFor="file-upload" variant="outline-primary" className="me-3">
              {fileLoading
                ? <Spinner animation="border" size="sm" />
                : <FaUpload className="me-1" />
              }
              Upload File
            </Button>

            {/* Format selector */}
            <Dropdown onSelect={setFormat} className="me-3">
              <Dropdown.Toggle variant="outline-secondary">
                Format: {format.toUpperCase()}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {['pdf','xlsx','csv'].map(f => (
                  <Dropdown.Item key={f} eventKey={f}>{f.toUpperCase()}</Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

            {/* Download report */}
            <Button variant="primary" onClick={downloadReport}>
              <FaDownload /> Download Report
            </Button>
          </Nav>
        </Container>
      </Navbar>

      <Container className="my-5">
        <Card className="shadow-sm mb-4">
          <Card.Body>
            <Card.Title>Transport CO₂ Calculator</Card.Title>
            <Table bordered responsive className="align-middle">
              <thead className="table-light">
                <tr>
                  <th>From</th><th>To</th><th>Mode</th>
                  <th>Weight (kg)</th><th>EU</th><th>State</th><th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i) => (
                  <tr key={i}>
                    <td><Form.Control placeholder="City" value={r.from} onChange={e=>handleChange(i,'from',e.target.value)} /></td>
                    <td><Form.Control placeholder="City" value={r.to} onChange={e=>handleChange(i,'to',e.target.value)} /></td>
                    <td>
                      <Form.Select value={r.mode} onChange={e=>handleChange(i,'mode',e.target.value)}>
                        <option value="road">Road</option>
                        <option value="air">Air</option>
                        <option value="sea">Sea</option>
                      </Form.Select>
                    </td>
                    <td><Form.Control type="number" placeholder="0" value={r.weight} onChange={e=>handleChange(i,'weight',e.target.value)} /></td>
                    <td className="text-center"><Form.Check type="checkbox" checked={r.eu} onChange={e=>handleChange(i,'eu',e.target.checked)} /></td>
                    <td><Form.Control placeholder="State" value={r.state} onChange={e=>handleChange(i,'state',e.target.value)} /></td>
                    <td className="text-center"><Button variant="outline-danger" size="sm" onClick={()=>removeRow(i)}><FaTrash /></Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Row className="mt-3">
              <Col><Button variant="success" onClick={addRow}><FaUpload className="me-1" /> Add Row</Button></Col>
              <Col className="text-end">
                <Button variant="primary" onClick={handleManualCalculate} disabled={loading}>
                  {loading ? 'Calculating…' : <><FaCalculator className="me-1" /> Calculate</>}
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {results.length > 0 && (
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title>Results</Card.Title>
              <Table striped bordered hover responsive className="mt-3">
                <thead>
                  <tr><th>From (Used)</th><th>To (Used)</th><th>Mode</th><th>Distance (km)</th><th>CO₂ (kg)</th></tr>
                </thead>
                <tbody>
                  {results.map((r,i) => (
                    <tr key={i}>
                      <td>{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td>{r.to_input}   <small className="text-muted">({r.to_used})</small></td>
                      <td className="text-capitalize">{r.mode}</td>
                      <td>{r.distance_km}</td>
                      <td>{r.co2_kg}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}
      </Container>

      <footer className="bg-light py-3 text-center">
        <small className="text-secondary">© {new Date().getFullYear()} Coandagent</small>
      </footer>
    </>
  );
}
