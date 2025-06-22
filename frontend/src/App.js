// frontend/src/App.js

import React, { useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import {
  Container, Navbar, Nav, Button, Form, Table, Card,
  Dropdown, Row, Col, Spinner, Toast, ToastContainer, Badge,
} from 'react-bootstrap';
import {
  FaUpload, FaCalculator, FaDownload, FaTrash, FaExclamationCircle,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';

// --- helper to validate uploaded data columns ---
function validateUploadColumns(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('File is empty or invalid JSON/CSV/Excel');
  }
  const got     = Object.keys(data[0]).map(k => k.trim().toLowerCase());
  const want    = ['from_location','to_location','mode','weight_kg','eu','state'];
  const missing = want.filter(k => !got.includes(k));
  const extra   = got.filter(k => !want.includes(k));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`Missing columns: ${missing.join(', ')}`);
    if (extra.length)   parts.push(`Unexpected columns: ${extra.join(', ')}`);
    parts.push('Expected headers: ' + want.map(h => `"${h}"`).join(', '));
    throw new Error(parts.join('; '));
  }
}

// --- build PDF HTML helper ---
function buildPdfHtml(results) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>CO₂ Transport Report</title>
  <style>
    body { font-family:'Segoe UI',sans-serif; margin:40px; position:relative; }
    .watermark {
      position:absolute; top:30%; left:50%;
      transform:translate(-50%,-50%) rotate(-30deg);
      font-size:120px; color:rgba(0,64,128,0.08); user-select:none;
    }
    header { text-align:center; margin-bottom:40px; }
    header h1 { color:#004080; font-size:28px; margin:0; }
    table { width:100%; border-collapse:collapse; margin-top:20px; }
    th { background:#004080; color:#fff; padding:10px; text-align:left; }
    td { border:1px solid #ddd; padding:8px; }
    footer { margin-top:40px; font-size:12px; text-align:center; color:#888; }
  </style>
</head>
<body>
  <div class="watermark">Coandagent</div>
  <header><h1>CO₂ Transport Report</h1><p>${new Date().toLocaleDateString()}</p></header>
  <table>
    <thead>
      <tr>
        <th>From</th><th>Used From</th><th>To</th><th>Used To</th>
        <th>Mode</th><th>Distance (km)</th><th>CO₂ (kg)</th><th>Error</th>
      </tr>
    </thead>
    <tbody>
      ${results.map(r => `
        <tr>
          <td>${r.from_input}</td><td>${r.from_used}</td>
          <td>${r.to_input}</td><td>${r.to_used}</td>
          <td>${r.mode}</td><td>${r.distance_km}</td><td>${r.co2_kg}</td>
          <td>${r.error || ''}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <footer>© ${new Date().getFullYear()} Coandagent · All rights reserved</footer>
</body>
</html>;
}

export default function App() {
  const [rows, setRows]               = useState([{ from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const [results, setResults]         = useState([]);
  const [format, setFormat]           = useState('pdf');
  const [loading, setLoading]         = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast]             = useState({ show:false, message:null });

  const showToast = message => {
    setToast({ show:true, message });
    setTimeout(() => setToast({ show:false, message:null }), 4000);
  };

  const handleChange = (idx, field, value) => {
    const u = [...rows];
    u[idx][field] = value;
    u[idx].error   = '';
    setRows(u);
  };

  const addRow = () =>
    setRows([...rows, { from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);

  const removeRow = idx =>
    setRows(rows.filter((_,i)=>i!==idx));

  const validate = () => {
    let valid = true;
    const u = rows.map(r => {
      const errs = [];
      if (!r.from)   errs.push('Origin required');
      if (!r.to)     errs.push('Destination required');
      if (!r.weight) errs.push('Weight required');
      return { ...r, error: errs.join(', ') };
    });
    setRows(u);
    if (u.some(r=>r.error)) {
      showToast('Please fix input errors');
      valid = false;
    }
    return valid;
  };

  const calculate = async payload => {
    setLoading(true);
    try {
      const res = await fetch('/api/calculate-co2', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setResults(await res.json());
    } catch(err) {
      showToast(err.message);
    } finally {
      setLoading(false);
      setFileLoading(false);
    }
  };

  const handleManualCalculate = () => {
    if (!validate()) return;
    calculate(rows.map(r=>({
      from_location: r.from,
      to_location:   r.to,
      mode:          r.mode,
      weight_kg:     Number(r.weight)||0,
      eu:            r.eu,
      state:         r.state.trim().toLowerCase(),
    })));
  };

  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    setFileLoading(true);

    const reader = new FileReader();
    reader.onload = async evt => {
      let parsed = [];
      const text = evt.target.result;

      // Excel
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const data = new Uint8Array(evt.target.result);
        const wb   = XLSX.read(data,{ type:'array' });
        parsed     = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{ defval:'' });
      }
      // CSV
      else if (/\.csv$/i.test(file.name)) {
        try {
          const lines = text.trim().split('\n');
          const keys  = lines[0].split(',').map(h=>h.trim());
          parsed = lines.slice(1).map(row=>{
            const vals = row.split(',').map(v=>v.trim());
            return Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
          });
        } catch {
          showToast(
            <div>
              <p><strong>Upload error:</strong> Could not parse CSV.</p>
              <pre style={{ whiteSpace:'pre-wrap' }}>
from_location,to_location,mode,weight_kg,eu,state
Paris,Berlin,air,10,yes,de
   
            </div>
          );
          setFileLoading(false);
          e.target.value = '';
          return;
        }
      }
      // JSON
      else {
        try {
          parsed = JSON.parse(text);
        } catch {
          showToast(
            <div>
              <p><strong>Upload error:</strong> Invalid JSON.</p>
              <pre style={{ whiteSpace:'pre-wrap' }}>
[
  {"from_location":"Paris","to_location":"Berlin","mode":"air","weight_kg":10,"eu":true,"state":"de"}
]
              </pre>
            </div>
          );
          setFileLoading(false);
          e.target.value = '';
          return;
        }
      }

      // Column validation
      try {
        validateUploadColumns(parsed);
      } catch(err) {
        showToast(
          <div>
            <p><strong>Upload error:</strong> {err.message}</p>
            <pre style={{ whiteSpace:'pre-wrap' }}>
from_location,to_location,mode,weight_kg,eu,state
Paris,Berlin,air,10,yes,de
            </pre>
          </div>
        );
        setFileLoading(false);
        e.target.value = '';
        return;
      }

      // Map & API call
      const payload = parsed.map(r=>({
        from_location: r.from_location||r.from||r.origin,
        to_location:   r.to_location  ||r.to  ||r.destination,
        mode:          r.mode         ||r.transport,
        weight_kg:     Number(r.weight_kg||r.weight)||0,
        eu:            String(r.eu).toLowerCase()==='yes',
        state:         (r.state||'').toLowerCase(),
      }));
      calculate(payload);
      e.target.value = '';
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else                                   reader.readAsText(file);
  };

  const downloadReport = () => {
    if (!results.length) {
      showToast('No results to download');
      return;
    }
    if (format==='csv'||format==='xlsx') {
      const wsData = [
        ['From','Used From','To','Used To','Mode','Distance (km)','CO₂ (kg)','Error'],
        ...results.map(r=>[
          r.from_input, r.from_used,
          r.to_input,   r.to_used,
          r.mode,       r.distance_km,
          r.co2_kg,     r.error||''
        ]),
      ];
      const ws    = XLSX.utils.aoa_to_sheet(wsData);
      const wb    = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      const wbout = XLSX.write(wb,{bookType:format,type:'array'});
      const blob  = new Blob([wbout],{type:'application/octet-stream'});
      const a     = document.createElement('a');
      a.href      = URL.createObjectURL(blob);
      a.download  = `co2-results.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const win = window.open('','_blank');
      win.document.write(buildPdfHtml(results));
      win.document.close();
      win.focus();
      win.print();
    }
  };

  return (
    <>
      <Navbar bg="light" expand="lg" className="shadow-sm">
        <Container fluid>
          <Navbar.Brand>Coandagent ESG CO₂ Dashboard</Navbar.Brand>
          <Nav className="ms-auto d-flex flex-wrap align-items-center">
            <Form.Control
              type="file" accept=".csv,.json,.xlsx,.xls"
              onChange={handleFileUpload} id="file-upload"
              style={{display:'none'}}
            />
            <Button as="label" htmlFor="file-upload" variant="outline-primary" className="m-1">
              {fileLoading
                ? <Spinner animation="border" size="sm"/>
                : <FaUpload className="me-1"/>}
              Upload File
            </Button>
            <Dropdown onSelect={setFormat} className="m-1">
              <Dropdown.Toggle variant="outline-secondary">
                Format: {format.toUpperCase()}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {['pdf','xlsx','csv'].map(f =>
                  <Dropdown.Item key={f} eventKey={f}>{f.toUpperCase()}</Dropdown.Item>
                )}
              </Dropdown.Menu>
            </Dropdown>
            <Button variant="primary" onClick={downloadReport} className="m-1">
              <FaDownload/> Download Report
            </Button>
          </Nav>
        </Container>
      </Navbar>

      <Container className="my-4">
        <Card className="shadow-sm mb-4">
          <Card.Body>
            <Card.Title>Transport CO₂ Calculator</Card.Title>
            <Table bordered responsive className="align-middle responsive-table">
              <thead className="table-light">
                <tr>
                  <th>From</th><th>To</th><th>Mode</th><th>Weight (kg)</th>
                  <th>EU</th><th>State</th><th>Error</th><th></th>
                </tr>
              </thead>
              <tbody>{
                rows.map((r,i)=>
                  <tr key={i} className={r.error?'table-danger':''}>
                    <td data-label="From">
                      <Form.Control
                        placeholder="City or Code"
                        value={r.from}
                        onChange={e=>handleChange(i,'from',e.target.value)}
                      />
                    </td>
                    <td data-label="To">
                      <Form.Control
                        placeholder="City or Code"
                        value={r.to}
                        onChange={e=>handleChange(i,'to',e.target.value)}
                      />
                    </td>
                    <td data-label="Mode">
                      <Form.Select
                        value={r.mode}
                        onChange={e=>handleChange(i,'mode',e.target.value)}
                      >
                        <option value="road">Road</option>
                        <option value="air">Air</option>
                        <option value="sea">Sea</option>
                      </Form.Select>
                    </td>
                    <td data-label="Weight">
                      <Form.Control
                        type="number"
                        placeholder="0"
                        value={r.weight}
                        onChange={e=>handleChange(i,'weight',e.target.value)}
                      />
                    </td>
                    <td data-label="EU" className="text-center">
                      <Form.Check
                        type="checkbox"
                        checked={r.eu}
                        onChange={e=>handleChange(i,'eu',e.target.checked)}
                      />
                    </td>
                    <td data-label="State">
                      <Form.Control
                        placeholder="State-code"
                        value={r.state}
                        onChange={e=>handleChange(i,'state',e.target.value)}
                      />
                    </td>
                    <td data-label="Error">
                      {r.error && (
                        <Badge bg="danger"><FaExclamationCircle className="me-1"/> {r.error}</Badge>
                      )}
                    </td>
                    <td data-label="">
                      <Button variant="outline-danger" size="sm" onClick={()=>removeRow(i)}>
                        <FaTrash/>
                      </Button>
                    </td>
                  </tr>
                )
              }</tbody>
            </Table>

            <Row className="mt-3">
              <Col xs={12} sm="auto" className="mb-2">
                <Button variant="success" onClick={addRow}>
                  <FaUpload className="me-1"/> Add Row
                </Button>
              </Col>
              <Col xs={12} sm="auto" className="ms-sm-auto">
                <Button variant="primary" onClick={handleManualCalculate} disabled={loading}>
                  {loading
                    ? <><Spinner animation="border" size="sm" className="me-1"/> Calculating…</>
                    : <><FaCalculator className="me-1"/> Calculate</>}
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {results.length>0 && (
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title>Results</Card.Title>
              <Table striped bordered hover responsive className="mt-3 responsive-table">
                <thead>
                  <tr>
                    <th>From (Used)</th><th>To (Used)</th><th>Mode</th>
                    <th>Distance (km)</th><th>CO₂ (kg)</th><th>Error</th>
                  </tr>
                </thead>
                <tbody>{
                  results.map((r,i)=>
                    <tr key={i} className={r.error?'table-danger':''}>
                      <td data-label="From (Used)">{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td data-label="To (Used)">{r.to_input} <small className="text-muted">({r.to_used})</small></td>
                      <td data-label="Mode" className="text-capitalize">{r.mode}</td>
                      <td data-label="Distance">{r.distance_km}</td>
                      <td data-label="CO₂">{r.co2_kg}</td>
                      <td data-label="Error">
                        {r.error && (
                          <Badge bg="danger"><FaExclamationCircle className="me-1"/> {r.error}</Badge>
                        )}
                      </td>
                    </tr>
                  )
                }</tbody>
              </Table>
            </Card.Body>
          </Card>
        )}
      </Container>

      <ToastContainer position="bottom-end" className="p-3">
        <Toast
          bg="warning" show={toast.show}
          onClose={()=>setToast({ show:false, message:null })}
          delay={4000} autohide
        >
          <Toast.Header>
            <FaExclamationCircle className="me-2 text-danger"/>
            <strong className="me-auto">Error</strong>
          </Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      <footer className="bg-light py-3 text-center">
        <small className="text-secondary">© {new Date().getFullYear()} Coandagent</small>
      </footer>
    </>
  );
}
