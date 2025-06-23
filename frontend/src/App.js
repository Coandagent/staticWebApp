// frontend/src/App.js

import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';
import logo from './assets/logo.svg';

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
  Toast,
  ToastContainer,
  Badge,
} from 'react-bootstrap';
import {
  FaUpload,
  FaCalculator,
  FaDownload,
  FaTrash,
  FaExclamationCircle,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';

// Helper to validate uploaded data columns
function validateUploadColumns(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Uploaded file is empty or invalid');
  }
  const mapping = {
    from_location: ['from_location', 'from', 'origin', 'orig'],
    to_location:   ['to_location', 'to', 'destination', 'dest'],
    mode:          ['mode', 'transport', 'method'],
    weight_kg:     ['weight_kg', 'weight', 'weight (kg)', 'kg'],
    eu:            ['eu', 'in_eu', 'european_union', 'is_eu'],
    state:         ['state', 'state_code', 'province', 'region'],
  };
  const headers = Object.keys(data[0]).map(h => h.trim().toLowerCase());
  const missing = [], extra = [];
  for (const [key, aliases] of Object.entries(mapping)) {
    if (!aliases.some(a => headers.includes(a))) missing.push(key);
  }
  const allAliases = Object.values(mapping).flat();
  headers.forEach(h => {
    if (!allAliases.includes(h)) extra.push(h);
  });
  if (missing.length || extra.length) {
    let msg = '';
    if (missing.length) msg += `Missing columns: ${missing.join(', ')}`;
    if (extra.length) msg += ` Unexpected: ${extra.join(', ')}`;
    throw new Error(msg);
  }
  return true;
}

export default function App() {
  // Auth state
  const [user, setUser] = useState(null);
  useEffect(() => {
    fetch('/.auth/me')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setUser(data.clientPrincipal))
      .catch(() => setUser(null));
  }, []);

  // UI state
  const [rows, setRows]     = useState([{ from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const [results, setResults]         = useState([]);
  const [format, setFormat]           = useState('pdf');
  const [loading, setLoading]         = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast]             = useState({ show:false, message:'' });

  const showToast = message => {
    setToast({ show:true, message });
    setTimeout(() => setToast({ show:false, message:'' }), 7000);
  };

  // Row handlers
  const handleChange = (idx, field, value) => {
    const u = [...rows];
    u[idx][field] = value;
    u[idx].error   = '';
    setRows(u);
  };
  const addRow = () => setRows([...rows, { from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const removeRow = idx => setRows(rows.filter((_,i)=>i!==idx));

  // Manual validation
  const validate = () => {
    let ok = true;
    const u = rows.map(r => {
      const errs = [];
      if (!r.from)   errs.push('Origin');
      if (!r.to)     errs.push('Destination');
      if (!r.weight) errs.push('Weight');
      return { ...r, error: errs.join(', ') };
    });
    setRows(u);
    if (u.some(r=>r.error)) {
      showToast('Please fix input errors');
      ok = false;
    }
    return ok;
  };

  // API call
  const calculate = async payload => {
    setLoading(true);
    try {
      const res = await fetch('/api/calculate-co2',{
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
    const payload = rows.map(r=>({
      from_location: r.from,
      to_location:   r.to,
      mode:          r.mode,
      weight_kg:     Number(r.weight)||0,
      eu:            r.eu,
      state:         r.state.trim().toLowerCase(),
    }));
    calculate(payload);
  };

  // File upload handler (unchanged)
  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    setFileLoading(true);
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();
    reader.onload = async evt => {
      let parsed = [];
      try {
        if (/\.(xlsx|xls)$/i.test(file.name)) {
          const data = new Uint8Array(evt.target.result);
          const wb   = XLSX.read(data,{type:'array'});
          parsed     = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});
        } else if (/\.csv$/i.test(file.name)) {
          const text = evt.target.result;
          const lines= text.trim().split('\n');
          const keys = lines[0].split(',').map(h=>h.trim());
          parsed = lines.slice(1).map(row=>{
            const vals = row.split(',').map(v=>v.trim());
            return Object.fromEntries(keys.map((k,i)=>[k,vals[i]]));
          });
        } else {
          parsed = JSON.parse(evt.target.result);
          if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
        }
      } catch(err) {
        showToast(`Upload error: ${err.message}`);
        setFileLoading(false);
        e.target.value = '';
        return;
      }
      try {
        validateUploadColumns(parsed);
      } catch(err) {
        showToast(`Upload error: ${err.message}`);
        setFileLoading(false);
        e.target.value = '';
        return;
      }
      const payload = parsed.map(r=>({
        from_location: r.from_location||r.from||r.origin,
        to_location:   r.to_location  ||r.to  ||r.destination,
        mode:          r.mode         ||r.transport,
        weight_kg:     Number(r.weight_kg||r.weight)||0,
        eu:            String(r.eu).toLowerCase()==='yes' || r.eu===true,
        state:         (r.state||r.state_code||'').toLowerCase(),
      }));
      calculate(payload);
      e.target.value = '';
    };
    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else                                   reader.readAsText(file);
  };

  // Download / print (unchanged)
  const downloadReport = () => {
    if (!results.length) {
      showToast('No results to download');
      return;
    }
    if (['csv','xlsx'].includes(format)) {
      const wsData = [
        ['From','Used From','To','Used To','Mode','Distance','CO₂ (kg)','Error'],
        ...results.map(r=>[
          r.from_input, r.from_used,
          r.to_input,   r.to_used,
          r.mode,       r.distance_km,
          r.co2_kg,     r.error||''
        ]),
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Results');
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
      win.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8">
<title>CO₂ Report</title>
<style>
  body{font-family:'Segoe UI',sans-serif;margin:40px;position:relative}
  .watermark{position:absolute;top:30%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);
    font-size:120px;color:rgba(0,128,0,0.08);user-select:none}
  header{text-align:center;margin-bottom:40px}
  header h1{color:#006400;font-size:28px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th{background:#006400;color:#fff;padding:10px;text-align:left}
  td{border:1px solid #ddd;padding:8px}
  footer{margin-top:40px;font-size:12px;text-align:center;color:#888}
</style></head><body>
  <div class="watermark">CarbonRoute</div>
  <header><h1>CO₂ Transport Report</h1>
    <p>${new Date().toLocaleDateString()}</p></header>
  <table><thead><tr>
    <th>From</th><th>Used From</th><th>To</th><th>Used To</th>
    <th>Mode</th><th>Distance</th><th>CO₂ (kg)</th><th>Error</th>
  </tr></thead><tbody>
  ${results.map(r=>`
    <tr>
      <td>${r.from_input}</td><td>${r.from_used}</td>
      <td>${r.to_input}</td><td>${r.to_used}</td>
      <td>${r.mode}</td><td>${r.distance_km}</td><td>${r.co2_kg}</td>
      <td>${r.error||''}</td>
    </tr>`).join('')}
  </tbody></table>
  <footer>© ${new Date().getFullYear()} CarbonRoute</footer>
</body></html>`);
      win.document.close();
      win.focus();
      win.print();
    }
  };

  return (
    <>
      {/* Navbar */}
      <Navbar expand="lg" variant="light" className="shadow-sm bg-white py-3">
        <Container>
          <Navbar.Brand href="#">
            <img src={logo} alt="CarbonRoute" height="40" className="me-2" />
            <span className="fw-bold text-primary">CarbonRoute</span>
          </Navbar.Brand>
          <Navbar.Toggle />
          <Navbar.Collapse>
            <Nav className="ms-auto align-items-center">
              <Nav.Link href="#features" className="mx-3 text-dark">Features</Nav.Link>
              <Nav.Link href="#pricing"  className="mx-3 text-dark">Pricing</Nav.Link>
              <Nav.Link href="#contact"  className="mx-3 text-dark">Contact</Nav.Link>
              {user
                ? <Button variant="outline-primary" size="sm" onClick={()=>window.location.href='/.auth/logout'}>Logout</Button>
                : <Button variant="primary" size="sm" onClick={()=>window.location.href='/.auth/login/aad'}>Login</Button>
              }
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>

      {/* Hero */}
      <header className="hero bg-primary text-white text-center py-5">
        <Container>
          <h1 className="display-5 fw-bold">Mål. Reducér. Rapportér.</h1>
          <p className="lead mb-4">Nem CO₂-beregning for transport i overensstemmelse med EU's ESG-krav.</p>
          <Button variant="light" size="lg" className="me-2">Prøv Gratis</Button>
          <Button variant="outline-light" size="lg">Book Demo</Button>
        </Container>
      </header>

      {/* Features */}
      <Container className="my-5" id="features">
        <Row className="text-center mb-4">
          <h2 className="fw-bold">Kernefunktioner</h2>
          <p className="text-muted">Alt du behøver til CO₂-rapportering</p>
        </Row>
        <Row>
          {['Data Input', 'Automatisk Beregning', 'Rapporter & Eksport'].map((t,i)=>
            <Col md={4} className="mb-4" key={i}>
              <Card className="h-100 shadow-sm border-0">
                <Card.Body>
                  <Card.Title className="fw-bold text-primary">{t}</Card.Title>
                  <Card.Text className="text-muted">Beskrivelse af funktionen.</Card.Text>
                </Card.Body>
              </Card>
            </Col>
          )}
        </Row>
      </Container>

      {/* Calculator */}
      <Container className="my-5">
        <Card className="shadow-sm">
          <Card.Body>
            <Card.Title className="text-primary fw-bold">Transport CO₂ Calculator</Card.Title>
            <div className="mb-3 d-flex flex-wrap align-items-center">
              <Form.Control
                type="file"
                accept=".csv,.json,.xlsx,.xls"
                onChange={handleFileUpload}
                id="file-upload"
                style={{display:'none'}}
              />
              <Button as="label" htmlFor="file-upload" variant="outline-primary" className="me-2 mb-2">
                {fileLoading ? <Spinner animation="border" size="sm"/> : <FaUpload className="me-1"/>} Upload
              </Button>
              <Dropdown onSelect={setFormat} className="me-2 mb-2">
                <Dropdown.Toggle variant="outline-secondary">Format: {format.toUpperCase()}</Dropdown.Toggle>
                <Dropdown.Menu>
                  {['pdf','xlsx','csv'].map(f=>
                    <Dropdown.Item key={f} eventKey={f}>{f.toUpperCase()}</Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown>
              <Button variant="primary" onClick={downloadReport} className="mb-2">
                <FaDownload className="me-1"/> Download
              </Button>
            </div>

            {/* Table (desktop) */}
            <div className="d-none d-md-block">
              <Table bordered responsive className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>From</th><th>To</th><th>Mode</th><th>Weight</th><th>EU</th><th>State</th><th>Error</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>
                    <tr key={i} className={r.error ? 'table-danger' : ''}>
                      <td><Form.Control placeholder="City or Code" value={r.from}   onChange={e=>handleChange(i,'from',e.target.value)}/></td>
                      <td><Form.Control placeholder="City or Code" value={r.to}     onChange={e=>handleChange(i,'to',e.target.value)}/></td>
                      <td>
                        <Form.Select value={r.mode} onChange={e=>handleChange(i,'mode',e.target.value)}>
                          <option value="road">Road</option>
                          <option value="air">Air</option>
                          <option value="sea">Sea</option>
                        </Form.Select>
                      </td>
                      <td><Form.Control type="number" placeholder="0" value={r.weight} onChange={e=>handleChange(i,'weight',e.target.value)}/></td>
                      <td className="text-center"><Form.Check checked={r.eu} onChange={e=>handleChange(i,'eu',e.target.checked)}/></td>
                      <td><Form.Control placeholder="State-code" value={r.state} onChange={e=>handleChange(i,'state',e.target.value)}/></td>
                      <td>{r.error && <Badge bg="danger"><FaExclamationCircle className="me-1"/>{r.error}</Badge>}</td>
                      <td className="text-center"><Button variant="outline-danger" size="sm" onClick={()=>removeRow(i)}><FaTrash/></Button></td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>

            {/* Controls */}
            <Row className="mt-3">
              <Col><Button variant="outline-primary" onClick={addRow}><FaUpload className="me-1"/> Add Row</Button></Col>
              <Col className="text-end">
                <Button variant="primary" onClick={handleManualCalculate} disabled={loading}>
                  {loading
                    ? <><Spinner animation="border" size="sm" className="me-1"/>Calculating…</>
                    : <><FaCalculator className="me-1"/>Calculate</>
                  }
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Results */}
        {results.length > 0 && (
          <Card className="shadow-sm mt-4">
            <Card.Body>
              <Card.Title className="text-primary fw-bold">Results</Card.Title>
              <Table striped bordered hover responsive className="mt-3">
                <thead>
                  <tr>
                    <th>From (Used)</th><th>To (Used)</th><th>Mode</th><th>Distance</th><th>CO₂</th><th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r,i)=>
                    <tr key={i} className={r.error ? 'table-danger' : ''}>
                      <td>{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td>{r.to_input}   <small className="text-muted">({r.to_used})</small></td>
                      <td className="text-capitalize">{r.mode}</td>
                      <td>{r.distance_km}</td>
                      <td>{r.co2_kg}</td>
                      <td>{r.error && <Badge bg="danger"><FaExclamationCircle className="me-1"/>{r.error}</Badge>}</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}
      </Container>

      {/* Footer */}
      <footer className="bg-light text-center py-4">
        <Container>
          <p className="mb-2">© {new Date().getFullYear()} CarbonRoute</p>
          <Nav className="justify-content-center">
            <Nav.Link href="#" className="mx-2 text-muted">Om os</Nav.Link>
            <Nav.Link href="#" className="mx-2 text-muted">Support</Nav.Link>
            <Nav.Link href="#" className="mx-2 text-muted">Privacy</Nav.Link>
          </Nav>
        </Container>
      </footer>

      {/* Toast */}
      <ToastContainer position="bottom-end" className="p-3">
        <Toast show={toast.show} bg="light" onClose={()=>setToast({show:false,message:''})}>
          <Toast.Header><strong className="me-auto text-primary">Notice</strong></Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
}
