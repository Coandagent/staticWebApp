// frontend/src/App.js

import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css'; // <-- Custom branding styles
import logo from './assets/logo.svg'; // <-- Your green-themed logo

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
  FaTruck,
  FaShip,
  FaPlane,
} from 'react-icons/fa';
import * as XLSX from 'xlsx';

// --- helper to validate uploaded data columns with aliases ---
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
    if (!aliases.some(a => headers.includes(a))) {
      missing.push(`${key} (aliases: ${aliases.join(', ')})`);
    }
  }
  const allAliases = Object.values(mapping).flat();
  headers.forEach(h => {
    if (!allAliases.includes(h)) extra.push(h);
  });
  if (missing.length || extra.length) {
    let msg = '';
    if (missing.length) {
      msg += '**Missing columns:**\n' + missing.map(m => `• ${m}`).join('\n');
    }
    if (extra.length) {
      if (msg) msg += '\n\n';
      msg += '**Unexpected columns:**\n' + extra.map(e => `• ${e}`).join('\n');
    }
    throw new Error(msg);
  }
  return true;
}

function exampleSnippet(ext) {
  switch (ext) {
    case 'csv':
      return (
        '**Example CSV format:**\n' +
        'from_location,to_location,mode,weight_kg,eu,state\n' +
        'Copenhagen,Berlin,road,100,yes,BE\n'
      );
    case 'xlsx':
    case 'xls':
      return (
        '**Example Excel headers (first row):**\n' +
        'from_location | to_location | mode | weight_kg | eu | state\n' +
        '(then data rows beneath)\n'
      );
    case 'json':
      return (
        '**Example JSON format:**\n' +
        '[\n' +
        '  { "from_location": "Copenhagen", "to_location": "Berlin", "mode": "road", "weight_kg": 100, "eu": true, "state": "BE" }\n' +
        ']\n'
      );
    default:
      return '';
  }
}

export default function App() {
  // auth state
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetch('/.auth/me')
      .then(res => {
        if (!res.ok) throw new Error('Not logged in');
        return res.json();
      })
      .then(data => setUser(data.clientPrincipal))
      .catch(() => setUser(null));
  }, []);

  // UI state
  const [rows, setRows]               = useState([{ from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const [results, setResults]         = useState([]);
  const [format, setFormat]           = useState('pdf');
  const [loading, setLoading]         = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast]             = useState({ show:false, message:'' });

  const showToast = message => {
    setToast({ show:true, message });
    setTimeout(() => setToast({ show:false, message:'' }), 7000);
  };

  // handle rows
  const handleChange = (idx, field, value) => {
    const u = [...rows];
    u[idx][field] = value;
    u[idx].error   = '';
    setRows(u);
  };
  const addRow = () => setRows([...rows, { from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const removeRow = idx => setRows(rows.filter((_,i)=>i!==idx));

  // manual validation
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

  // call API
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

  // file upload
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
        showToast(`Upload error:\n${err.message}\n\n${exampleSnippet(ext)}`);
        setFileLoading(false);
        e.target.value = '';
        return;
      }

      try {
        validateUploadColumns(parsed);
      } catch(err) {
        showToast(`Upload error:\n${err.message}\n\n${exampleSnippet(ext)}`);
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

  // download / print
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
    font-size:120px;color:rgba(0,64,128,0.08);user-select:none}
  header{text-align:center;margin-bottom:40px}
  header h1{color:#004080;font-size:28px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  th{background:#004080;color:#fff;padding:10px;text-align:left}
  td{border:1px solid #ddd;padding:8px}
  footer{margin-top:40px;font-size:12px;text-align:center;color#888}
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
      <Navbar expand="lg" variant="dark" className="brand-navbar shadow-sm">
        <Container fluid>
          <Navbar.Brand className="d-flex align-items-center">
            <img src={logo} alt="CarbonRoute" height="30" className="me-2"/> CarbonRoute ESG CO₂ Dashboard
          </Navbar.Brand>
          <Nav className="ms-auto d-flex align-items-center">
            {user ? (
              <>
                <span className="me-3">Hello, {user.userDetails}</span>
                <Button variant="outline-light" size="sm" onClick={()=>window.location.href='/.auth/logout'}>Logout</Button>
              </>
            ) : (
              <Button variant="outline-light" size="sm" onClick={()=>window.location.href='/.auth/login/aad'}>Login</Button>
            )}
          </Nav>
        </Container>
      </Navbar>

      {/* Hero */}
      <header className="hero position-relative overflow-hidden text-center bg-gradient-primary text-white py-5">
        <Container>
          <h1 className="display-4 fw-bold mb-3">Mål. Reducér. Rapportér.</h1>
          <p className="lead mb-4">Nem CO₂-beregning for transport – vej, sø og luft – i overensstemmelse med EU’s ESG-krav.</p>
          <Button variant="light" size="lg" className="me-2 shadow-sm">Prøv Gratis</Button>
          <Button variant="outline-light" size="lg" className="shadow-sm">Book Demo</Button>
        </Container>
        <div className="hero-overlay position-absolute top-0 start-0 w-100 h-100" />
      </header>

      {/* Feature Cards */}
      <Container id="features" className="py-5">
        <Row className="text-center mb-5">
          <h2 className="fw-bold">Kernefunktioner</h2>
          <p className="text-muted">Alt du behøver til CO₂-rapportering på ét sted</p>
        </Row>
        <Row>
          <Col md={4} className="mb-4">
            <Card className="h-100 border-0 shadow-sm hover-shadow-lg">
              <Card.Body className="text-center">
                <FaTruck size={48} className="text-primary mb-3" />
                <Card.Title className="fw-bold">Data Input</Card.Title>
                <Card.Text className="text-muted">Trinvis formular med forklaringer og autoudfyldelse via Azure Maps.</Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} className="mb-4">
            <Card className="h-100 border-0 shadow-sm hover-shadow-lg">
              <Card.Body className="text-center">
                <FaShip size={48} className="text-primary mb-3" />
                <Card.Title className="fw-bold">Automatisk Beregning</Card.Title>
                <Card.Text className="text-muted">Serverless beregningsmotor med Haversine-formel og GHG-faktorer.</Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} className="mb-4">
            <Card className="h-100 border-0 shadow-sm hover-shadow-lg">
              <Card.Body className="text-center">
                <FaPlane size={48} className="text-primary mb-3" />
                <Card.Title className="fw-bold">Rapporter & Eksport</Card.Title>
                <Card.Text className="text-muted">Gem, grupper, og eksporter dine CO₂-data til PDF, XLSX eller CSV.</Card.Text>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Calculator Section */}
      <Container className="py-5">
        <Card className="shadow-sm border-0">
          <Card.Body>
            <Card.Title className="text-success mb-4">Transport CO₂ Calculator</Card.Title>

            {/* Upload & Controls */}
            <div className="d-flex flex-wrap align-items-center mb-4">
              <Form.Control type="file" accept=".csv,.json,.xlsx,.xls"
                onChange={handleFileUpload} id="file-upload" style={{display:'none'}} />
              <Button as="label" htmlFor="file-upload"
                variant="outline-success" className="me-3 mb-2">
                {fileLoading ? <Spinner animation="border" size="sm"/> : <FaUpload className="me-1"/>}
                Upload File
              </Button>
              <Dropdown onSelect={setFormat} className="me-3 mb-2">
                <Dropdown.Toggle variant="outline-secondary">
                  Format: {format.toUpperCase()}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {['pdf','xlsx','csv'].map(f=>
                    <Dropdown.Item key={f} eventKey={f}>{f.toUpperCase()}</Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown>
              <Button variant="success" onClick={downloadReport} className="mb-2">
                <FaDownload className="me-1"/> Download Report
              </Button>
            </div>

            {/* Desktop table */}
            <div className="d-none d-md-block">
              <Table bordered responsive hover className="align-middle">
                <thead className="table-light">
                  <tr>
                    <th>From</th><th>To</th><th>Mode</th><th>Weight (kg)</th>
                    <th>EU</th><th>State</th><th>Error</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i)=>(
                    <tr key={i} className={r.error?'table-danger':''}>
                      <td><Form.Control placeholder="City or Code" value={r.from}
                        onChange={e=>handleChange(i,'from',e.target.value)}/></td>
                      <td><Form.Control placeholder="City or Code" value={r.to}
                        onChange={e=>handleChange(i,'to',e.target.value)}/></td>
                      <td><Form.Select value={r.mode}
                        onChange={e=>handleChange(i,'mode',e.target.value)}>
                          <option value="road">Road</option>
                          <option value="air">Air</option>
                          <option value="sea">Sea</option>
                        </Form.Select></td>
                      <td><Form.Control type="number" placeholder="0" value={r.weight}
                        onChange={e=>handleChange(i,'weight',e.target.value)}/></td>
                      <td className="text-center"><Form.Check checked={r.eu}
                        onChange={e=>handleChange(i,'eu',e.target.checked)}/></td>
                      <td><Form.Control placeholder="State-code" value={r.state}
                        onChange={e=>handleChange(i,'state',e.target.value)}/></td>
                      <td>{r.error && <Badge bg="danger">
                        <FaExclamationCircle className="me-1"/>{r.error}
                      </Badge>}</td>
                      <td className="text-center"><Button variant="outline-danger" size="sm"
                        onClick={()=>removeRow(i)}><FaTrash/></Button></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>

            {/* Mobile stacked */}
            <div className="d-block d-md-none">
              {rows.map((r,i)=>(
                <Card key={i} className="mb-3 shadow-sm">
                  <Card.Body>
                    <Form.Group className="mb-2">
                      <Form.Label>From</Form.Label>
                      <Form.Control placeholder="City or Code" value={r.from}
                        onChange={e=>handleChange(i,'from',e.target.value)}/>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label>To</Form.Label>
                      <Form.Control placeholder="City or Code" value={r.to}
                        onChange={e=>handleChange(i,'to',e.target.value)}/>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label>Mode</Form.Label>
                      <Form.Select value={r.mode}
                        onChange={e=>handleChange(i,'mode',e.target.value)}>
                        <option value="road">Road</option>
                        <option value="air">Air</option>
                        <option value="sea">Sea</option>
                      </Form.Select>
                    </Form.Group>
                    <Form.Group className="mb-2">
                      <Form.Label>Weight (kg)</Form.Label>
                      <Form.Control type="number" placeholder="0" value={r.weight}
                        onChange={e=>handleChange(i,'weight',e.target.value)}/>
                    </Form.Group>
                    <Form.Group className="mb-2 d-flex align-items-center">
                      <Form.Check label="EU" checked={r.eu}
                        onChange={e=>handleChange(i,'eu',e.target.checked)}/>
                      <Form.Control placeholder="State-code" value={r.state}
                        onChange={e=>handleChange(i,'state',e.target.value)}
                        className="ms-3"/>
                    </Form.Group>
                    {r.error && <Badge bg="danger" className="mb-2">
                      <FaExclamationCircle className="me-1"/>{r.error}
                    </Badge>}
                    <Button variant="outline-danger" size="sm" onClick={()=>removeRow(i)}>
                      <FaTrash className="me-1"/>Remove
                    </Button>
                  </Card.Body>
                </Card>
              ))}
            </div>

            <Row className="mt-4">
              <Col>
                <Button variant="outline-success" onClick={addRow}>
                  <FaUpload className="me-1"/> Add Row
                </Button>
              </Col>
              <Col className="text-end">
                <Button variant="success" onClick={handleManualCalculate} disabled={loading}>
                  {loading
                    ? <><Spinner animation="border" size="sm" className="me-1"/>Calculating…</>
                    : <><FaCalculator className="me-1"/>Calculate</>
                  }
                </Button>
              </Col>
            </Row>

          </Card.Body>
        </Card>

        {/* Results Table */}
        {results.length>0 && (
          <Card className="shadow-sm mt-4">
            <Card.Body>
              <Card.Title className="text-success mb-3">Results</Card.Title>
              <Table striped bordered hover responsive className="align-middle">
                <thead>
                  <tr>
                    <th>From (Used)</th><th>To (Used)</th><th>Mode</th>
                    <th>Distance (km)</th><th>CO₂ (kg)</th><th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r,i)=>(
                    <tr key={i} className={r.error?'table-danger':''}>
                      <td>{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td>{r.to_input} <small className="text-muted">({r.to_used})</small></td>
                      <td className="text-capitalize">{r.mode}</td>
                      <td>{r.distance_km}</td>
                      <td>{r.co2_kg}</td>
                      <td>{r.error && <Badge bg="danger">
                        <FaExclamationCircle className="me-1"/>{r.error}
                      </Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}
      </Container>

      {/* Toast */}
      <ToastContainer position="bottom-end" className="p-3">
        <Toast show={toast.show} bg="light"
          onClose={()=>setToast({show:false,message:''})}>
          <Toast.Header><strong className="me-auto text-success">Notice</strong></Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      {/* Footer */}
      <footer className="bg-light py-4 text-center">
        <Container>
          <small className="text-muted">
            © {new Date().getFullYear()} CarbonRoute – Mål. Reducér. Rapportér.
          </small>
        </Container>
      </footer>
    </>
  );
}
