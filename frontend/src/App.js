// frontend/src/App.js

// ──────────────────────────────────────────────────────────────────────────────
//  Install these first:
//    npm install bootstrap react-bootstrap react-icons xlsx recharts
// ──────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import {
  FaUserPlus,
  FaRoute,
  FaChartLine,
  FaHandshake,
  FaTruck,
  FaShip,
  FaPlane,
  FaUpload,
  FaCalculator,
  FaDownload,
  FaTrash,
  FaExclamationCircle,
  FaChevronLeft,
  FaChevronRight
} from 'react-icons/fa';
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
  Carousel,
  Spinner,
  Toast,
  ToastContainer,
  Badge,
  Modal
} from 'react-bootstrap';

import * as XLSX from 'xlsx';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

// --- helper to validate uploaded data columns with aliases ---
function validateUploadColumns(data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Uploaded file is empty or invalid');
  }
  const mapping = {
    from_location: ['from_location','from','origin','orig'],
    to_location:   ['to_location','to','destination','dest'],
    mode:          ['mode','transport','method'],
    weight_kg:     ['weight_kg','weight','weight (kg)','kg'],
    eu:            ['eu','in_eu','european_union','is_eu'],
    state:         ['state','state_code','province','region']
  };
  const headers = Object.keys(data[0]).map(h => h.trim().toLowerCase());
  const missing = [];
  const extra = [];
  Object.entries(mapping).forEach(([key, aliases]) => {
    if (!aliases.some(a => headers.includes(a))) {
      missing.push(`${key} (aliases: ${aliases.join(', ')})`);
    }
  });
  const allAliases = Object.values(mapping).flat();
  headers.forEach(h => {
    if (!allAliases.includes(h)) extra.push(h);
  });
  if (missing.length || extra.length) {
    let msg = '';
    if (missing.length) msg += '**Missing columns:**\n' + missing.map(m => `• ${m}`).join('\n');
    if (extra.length) msg += (msg ? '\n\n' : '') + '**Unexpected columns:**\n' + extra.map(e => `• ${e}`).join('\n');
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

  // UI state
  const [rows, setRows] = useState([{ from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const [results, setResults] = useState([]);
  const [format, setFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast] = useState({ show:false, message:'' });
  const [showLoginModal, setShowLoginModal] = useState(false);
// above everything in App():
const [view, setView] = useState('calculator');         // "calculator" or "history"
const [historyGroups, setHistoryGroups] = useState({}); // { [year]: { [month]: [entries]}}
const [selectedGroup, setSelectedGroup] = useState(null);
// where selectedGroup is either null or { year, month }

  const showToast = message => {
    setToast({ show:true, message });
    setTimeout(() => setToast({ show:false, message:'' }), 7000);
  };

  // fetch auth info once
  useEffect(() => {
    fetch('/.auth/me')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setUser(data.clientPrincipal))
      .catch(() => setUser(null));
  }, []);

  // Row handlers
  const handleChange = (idx, field, value) => {
    const u = [...rows];
    u[idx][field] = value;
    u[idx].error = '';
    setRows(u);
  };
  const addRow = () => setRows([...rows, { from:'', to:'', mode:'road', weight:'', eu:true, state:'', error:'' }]);
  const removeRow = idx => setRows(rows.filter((_, i) => i !== idx));

  // Validate inputs
  const validate = () => {
    let ok = true;
    const u = rows.map(r => {
      const errs = [];
      if (!r.from) errs.push('Origin required');
      if (!r.to) errs.push('Destination required');
      if (!r.weight) errs.push('Weight required');
      return { ...r, error: errs.join(', ') };
    });
    setRows(u);
    if (u.some(r => r.error)) {
      showToast('Please fix input errors');
      ok = false;
    }
    return ok;
  };

  // Fetch saved history
const handleViewHistory = async () => {
  setLoading(true);
  try {
    const res = await fetch('/api/GetCo2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([]),
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    // 2a) Group by year/month
    const groups = {};
    for (const entry of data) {
      // use a timestamp field or rowKey
      const ts = entry.timestamp || entry.rowKey || new Date().toISOString();
      const d  = new Date(ts);
      const yr = d.getFullYear();
      const mo = d.toLocaleString('default', { month: 'long' });
      groups[yr]         = groups[yr] || {};
      groups[yr][mo]     = groups[yr][mo] || [];
      groups[yr][mo].push(entry);
    }

    setHistoryGroups(groups);
    setSelectedGroup(null);
    setView('history');
  } catch (e) {
    showToast(e.message);
  } finally {
    setLoading(false);
  }
};

  // Calculate & Save
  const handleCalculateAndSave = async () => {
    if (!validate()) return;
    const payload = rows.map(r => ({
      from_location: r.from,
      to_location:   r.to,
      mode:          r.mode,
      weight_kg:     Number(r.weight) || 0,
      eu:            r.eu,
      state:         r.state.trim().toLowerCase()
    }));
    setLoading(true);
    try {
      // 1) Calculate
      const calcRes = await fetch('/api/calculate-co2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!calcRes.ok) throw new Error(await calcRes.text());
      const calcResults = await calcRes.json();
      setResults(calcResults);

      // 2) Save
      await fetch('/api/SaveCo2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results: calcResults })
      });

      showToast('Beregnet og gemt!');
    } catch (e) {
      showToast(e.message);
    } finally {
      setLoading(false);
      setFileLoading(false);
    }
  };

  // Calculate only (for file upload path)
  const calculateOnly = async payload => {
    setLoading(true);
    try {
      const res = await fetch('/api/calculate-co2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      setResults(await res.json());
    } catch (e) {
      showToast(e.message);
    } finally {
      setLoading(false);
      setFileLoading(false);
    }
  };

  // File upload handler
  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    setFileLoading(true);
    const ext = file.name.split('.').pop().toLowerCase();
    const reader = new FileReader();

    reader.onload = async ev => {
      let parsed = [];
      try {
        if (/\.(xlsx|xls)$/i.test(file.name)) {
          const data = new Uint8Array(ev.target.result);
          const wb = XLSX.read(data, { type: 'array' });
          parsed = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
        } else if (/\.csv$/i.test(file.name)) {
          const text = ev.target.result;
          const lines = text.trim().split('\n');
          const keys = lines[0].split(',').map(h => h.trim());
          parsed = lines.slice(1).map(row => {
            const vals = row.split(',').map(v => v.trim());
            return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
          });
        } else {
          parsed = JSON.parse(ev.target.result);
          if (!Array.isArray(parsed)) throw new Error('JSON must be an array');
        }
      } catch (err) {
        showToast(`Upload error:\n${err.message}\n\n${exampleSnippet(ext)}`);
        setFileLoading(false);
        e.target.value = '';
        return;
      }

      try {
        validateUploadColumns(parsed);
      } catch (err) {
        showToast(`Upload error:\n${err.message}\n\n${exampleSnippet(ext)}`);
        setFileLoading(false);
        e.target.value = '';
        return;
      }

      const payload = parsed.map(r => ({
        from_location: r.from_location || r.from || r.origin,
        to_location:   r.to_location   || r.to   || r.destination,
        mode:          r.mode         || r.transport,
        weight_kg:     Number(r.weight_kg || r.weight) || 0,
        eu:            String(r.eu).toLowerCase() === 'yes' || r.eu === true,
        state:         (r.state || r.state_code || '').toLowerCase()
      }));

      calculateOnly(payload);
      e.target.value = '';
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  // Download / Print report
  const downloadReport = () => {
    if (!results.length) {
      showToast('No results to download');
      return;
    }
    if (['csv','xlsx'].includes(format)) {
      const wsData = [
        ['From','Used From','To','Used To','Mode','Distance','CO₂ (kg)','Error'],
        ...results.map(r => [
          r.from_input, r.from_used,
          r.to_input, r.to_used,
          r.mode, r.distance_km,
          r.co2_kg, r.error || ''
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Results');
      const wbout = XLSX.write(wb, { bookType: format, type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `co2-results.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const win = window.open('', '_blank');
      win.document.write(`
<!DOCTYPE html><html><head><meta charset="utf-8"><title>CO₂ Report</title><style>
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
  <header><h1>CO₂ Transport Report</h1><p>${new Date().toLocaleDateString()}</p></header>
  <table><thead><tr>
    <th>From</th><th>Used From</th><th>To</th><th>Used To</th>
    <th>Mode</th><th>Distance</th><th>CO₂ (kg)</th><th>Error</th>
  </tr></thead><tbody>
  ${results.map(r => `
    <tr>
      <td>${r.from_input}</td><td>${r.from_used}</td>
      <td>${r.to_input}</td><td>${r.to_used}</td>
      <td>${r.mode}</td><td>${r.distance_km}</td><td>${r.co2_kg}</td><td>${r.error||''}</td>
    </tr>`).join('')}
  </tbody></table>
  <footer>© ${new Date().getFullYear()} CarbonRoute</footer>
</body></html>`);
      win.document.close();
      win.focus();
      win.print();
    }
  };

  // Dummy stats for chart
  const statsData = [
    { name:'Jan', emissions:400 },
    { name:'Feb', emissions:320 },
    { name:'Mar', emissions:450 },
    { name:'Apr', emissions:380 },
    { name:'May', emissions:500 },
    { name:'Jun', emissions:430 },
  ];

  return (
    <>
      {/* Login Modal */}
      <Modal show={showLoginModal} onHide={() => setShowLoginModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Log ind for at prøve gratis</Modal.Title></Modal.Header>
        <Modal.Body>
          <p>Log ind med din Microsoft-konto for at prøve vores CO₂-calculator gratis.</p>
          <Button variant="primary" onClick={() => window.location.href = '/.auth/login/aad?post_login_redirect=/'}>Log ind med Microsoft</Button>
        </Modal.Body>
      </Modal>

      {/* Navbar */}
      <Navbar expand="lg" variant="dark" className="brand-navbar shadow-sm">
        <Container fluid>
          <Navbar.Brand className="d-flex align-items-center">
            <img src={logo} alt="CarbonRoute" height="60" className="me-3"/>
            <span className="h4 mb-0">CarbonRoute ESG CO₂ Dashboard</span>
          </Navbar.Brand>
          <Nav className="ms-auto d-flex align-items-center">
            {user ? (
              <>
                <span className="me-3">Hello, {user.userDetails}</span>
                <Button variant="outline-light" size="sm" onClick={() => window.location.href='/.auth/logout'}>Logout</Button>
              </>
            ) : (
              <Button variant="outline-light" size="sm" onClick={() => setShowLoginModal(true)}>Login</Button>
            )}
          </Nav>
        </Container>
      </Navbar>

      {/* Hero Section */}
      <header className="hero bg-primary text-white text-center py-5">
        <Container>
          <h1 className="display-4 fw-bold">Mål. Reducér. Rapportér.</h1>
          <p className="lead mb-4">Nem CO₂-beregning for transport i overensstemmelse med EU's ESG-krav — vej, sø og luft.</p>
          {user ? (
            <Button variant="light" size="lg" className="me-2" onClick={handleViewHistory} disabled={loading}>
              {loading ? <><Spinner size="sm" className="me-1"/>Henter…</> : 'Vis beregninger'}
            </Button>
          ) : (
            <Button variant="light" size="lg" className="me-2" onClick={() => setShowLoginModal(true)}>Prøv Gratis</Button>
          )}
        </Container>
      </header>

      {/* Calculator Section */}
      <Container className="my-5">
        <Card className="shadow-sm">
          <Card.Body>
            <Card.Title className="text-success">Transport CO₂ Calculator</Card.Title>

            {/* Upload & Controls */}
            <div className="mb-3 d-flex flex-wrap align-items-center">
              <Form.Control
                type="file"
                accept=".csv,.json,.xlsx,.xls"
                onChange={handleFileUpload}
                id="file-upload"
                style={{ display:'none' }}
              />
              <Button as="label" htmlFor="file-upload" variant="outline-success" className="me-2 mb-2">
                {fileLoading ? <Spinner animation="border" size="sm"/> : <FaUpload className="me-1"/>}
                Upload File
              </Button>
              <Dropdown onSelect={setFormat} className="me-2 mb-2">
                <Dropdown.Toggle variant="outline-secondary">
                  Format: {format.toUpperCase()}
                </Dropdown.Toggle>
                <Dropdown.Menu>
                  {['pdf','xlsx','csv'].map(f =>
                    <Dropdown.Item key={f} eventKey={f}>{f.toUpperCase()}</Dropdown.Item>
                  )}
                </Dropdown.Menu>
              </Dropdown>
              <Button variant="success" onClick={downloadReport} className="mb-2">
                <FaDownload className="me-1"/> Download Report
              </Button>
            </div>

            {/* Desktop input table */}
            <div className="d-none d-md-block">
              <Table bordered responsive className="align-middle brand-table">
                <thead className="table-light">
                  <tr>
                    <th>From</th><th>To</th><th>Mode</th><th>Weight (kg)</th>
                    <th>EU</th><th>State</th><th>Error</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r,i) => (
                    <tr key={i} className={r.error?'table-danger':''}>
                      <td><Form.Control placeholder="City or Code" value={r.from} onChange={e=>handleChange(i,'from',e.target.value)}/></td>
                      <td><Form.Control placeholder="City or Code" value={r.to}   onChange={e=>handleChange(i,'to',e.target.value)}/></td>
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
                  ))}
                </tbody>
              </Table>
            </div>

            {/* Mobile input cards */}
            <div className="d-block d-md-none">
              {rows.map((r,i) => (
                <Card key={i} className="mb-3 brand-card-mobile">
                  <Card.Body>
                    <Form.Control className="mb-2" placeholder="From" value={r.from} onChange={e=>handleChange(i,'from',e.target.value)}/>
                    <Form.Control className="mb-2" placeholder="To"   value={r.to}   onChange={e=>handleChange(i,'to',e.target.value)}/>
                    <Form.Select className="mb-2" value={r.mode} onChange={e=>handleChange(i,'mode',e.target.value)}>
                      <option value="road">Road</option>
                      <option value="air">Air</option>
                      <option value="sea">Sea</option>
                    </Form.Select>
                    <Form.Control className="mb-2" type="number" placeholder="Weight (kg)" value={r.weight} onChange={e=>handleChange(i,'weight',e.target.value)}/>
                    <div className="d-flex align-items-center mb-2">
                      <Form.Check className="me-2" checked={r.eu} onChange={e=>handleChange(i,'eu',e.target.checked)}/>
                      <small>In EU</small>
                    </div>
                    <Form.Control className="mb-2" placeholder="State" value={r.state} onChange={e=>handleChange(i,'state',e.target.value)}/>
                    {r.error && <Badge bg="danger" className="d-block mb-2">{r.error}</Badge>}
                    <div className="text-end"><Button variant="outline-danger" size="sm" onClick={()=>removeRow(i)}><FaTrash/></Button></div>
                  </Card.Body>
                </Card>
              ))}
            </div>

            <Row className="mt-3">
              <Col><Button variant="outline-success" onClick={addRow}><FaUpload className="me-1"/> Add Row</Button></Col>
              <Col className="text-end">
                <Button variant="success" onClick={handleCalculateAndSave} disabled={loading}>
                  {loading ? <><Spinner size="sm" className="me-1"/>Calculating…</> : <><FaCalculator className="me-1"/>Calculate & Save</>}
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {/* Results Table */}
        {results.length > 0 && (
          <Card className="shadow-sm mt-4">
            <Card.Body>
              <Card.Title className="text-success">Results</Card.Title>
              <Table striped bordered hover responsive className="mt-3 brand-table">
                <thead>
                  <tr>
                    <th>From (Used)</th><th>To (Used)</th><th>Mode</th><th>Distance (km)</th><th>CO₂ (kg)</th><th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r,i) => (
                    <tr key={i} className={r.error?'table-danger':''}>
                      <td>{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td>{r.to_input} <small className="text-muted">({r.to_used})</small></td>
                      <td className="text-capitalize">{r.mode}</td>
                      <td>{r.distance_km}</td>
                      <td>{r.co2_kg}</td>
                      <td>{r.error && <Badge bg="danger"><FaExclamationCircle className="me-1"/>{r.error}</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}
      </Container>


    {/* History drill-down view */}
    {view === 'history' && (
      <Container className="my-5">
        <Button variant="secondary" onClick={() => setView('calculator')}>
          ← Back to Calculator
        </Button>

        {!selectedGroup && (
          <>
            <h2 className="mt-4">Saved Calculations</h2>
            {Object.entries(historyGroups).map(([year, months]) => (
              <div key={year} className="mb-3">
                <h4>{year}</h4>
                {Object.keys(months).map(month => (
                  <Badge
                    key={month}
                    bg="primary"
                    className="me-2 mb-1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedGroup({ year, month })}
                  >
                    {month} ({months[month].length})
                  </Badge>
                ))}
              </div>
            ))}
          </>
        )}

        {selectedGroup && (
          <>
            <Button variant="link" onClick={() => setSelectedGroup(null)}>
              ← Back to overview
            </Button>
            <h3 className="mt-3">
              {selectedGroup.month} {selectedGroup.year}
            </h3>
            <Table striped bordered hover responsive className="mt-2">
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Mode</th>
                  <th>Distance</th>
                  <th>CO₂</th>
                </tr>
              </thead>
              <tbody>
                {historyGroups[selectedGroup.year][selectedGroup.month].map((r, i) => (
                  <tr key={i}>
                    <td>{r.from_input}</td>
                    <td>{r.to_input}</td>
                    <td>{r.mode}</td>
                    <td>{r.distance_km}</td>
                    <td>{r.co2_kg}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </>
        )}
      </Container>
    )}



      {/* Feature Cards */}
      <Container className="my-5" id="features">
        <Row className="text-center mb-4">
          <h2 className="fw-bold">Kernefunktioner</h2>
          <p className="text-muted">Alt du behøver til CO₂-rapportering</p>
        </Row>
        <Row>
          <Col md={4} className="mb-4">
            <Card className="h-100 shadow-sm border-0">
              <Card.Body>
                <Card.Title className="fw-bold text-primary">Bruger-venlig Input</Card.Title>
                <Card.Text className="text-muted">
                  Indtast start- og slutdestination med autocomplete, vægt og transporttype – vi guider dig!
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} className="mb-4">
            <Card className="h-100 shadow-sm border-0">
              <Card.Body>
                <Card.Title className="fw-bold text-primary">Automatisk Beregning</Card.Title>
                <Card.Text className="text-muted">
                  Klik beregn, så bruger vi GHG-protokollen og opdaterede emissionsfaktorer for præcise resultater.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
          <Col md={4} className="mb-4">
            <Card className="h-100 shadow-sm border-0">
              <Card.Body>
                <Card.Title className="fw-bold text-primary">Rapporter & Eksport</Card.Title>
                <Card.Text className="text-muted">
                  Download rapporter i PDF/Excel eller del data med dit team direkte fra platformen.
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>

      {/* Carousel */}
      <Container className="my-5">
        <h2 className="fw-bold text-center mb-4">Din rejse som leverandør</h2>
        <Carousel
          controls
          indicators={false}
          interval={null}
          prevIcon={<FaChevronLeft size={32} className="text-success" />}
          nextIcon={<FaChevronRight size={32} className="text-success" />}
          className="pb-4"
        >
          {[
            { icon:<FaUserPlus size={48} className="text-success"/>, title:'Opret konto', desc:'Gratis konto på 30 sekunder – kom i gang uden binding.' },
            { icon:<FaRoute size={48} className="text-success"/>, title:'Indtast data', desc:'Vælg transporttype, indtast rute & vægt – vi guider dig.' },
            { icon:<FaChartLine size={48} className="text-success"/>, title:'Se resultater', desc:'Interaktive grafer & tal for CO₂-udledning.' },
            { icon:<FaHandshake size={48} className="text-success"/>, title:'Del med kunder', desc:'Share PDF/Excel med eget logo – styrk tilliden.' },
            { icon:<FaTruck size={48} className="text-success"/>, title:'Optimer ruter', desc:'Identificér CO₂-tunge ruter & reducer omkostninger.' },
            { icon:<FaShip size={48} className="text-success"/>, title:'Multimodal', desc:'Overblik over vej, skib & luft i ét dashboard.' },
            { icon:<FaPlane size={48} className="text-success"/>, title:'Skaler til Pro', desc:'White-label rapporter, API-adgang & support.' }
          ]
            .reduce((slides, step, i, arr) => { if (i % 2 === 0) slides.push(arr.slice(i, i+2)); return slides; }, [])
            .map((pair, idx) => (
              <Carousel.Item key={idx}>
                <Row className="justify-content-center g-4">
                  {pair.map((step, j) => (
                    <Col xs={12} md={6} key={j}>
                      <Card className="text-center border-0 shadow-sm p-4">
                        {step.icon}
                        <Card.Title className="mt-2 fw-bold">{step.title}</Card.Title>
                        <Card.Text className="text-muted">{step.desc}</Card.Text>
                      </Card>
                    </Col>
                  ))}
                </Row>
              </Carousel.Item>
            ))}
        </Carousel>
      </Container>

      {/* Statistics */}
      <section className="py-5 bg-white">
        <Container>
          <h2 className="text-center mb-4">Månedlige Udsendelser</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={statsData} margin={{ top:5, right:20, bottom:5, left:0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis label={{ value:'kg CO₂', angle:-90, position:'insideLeft' }}/>
              <Tooltip />
              <Line type="monotone" dataKey="emissions" stroke="#2a8f64" strokeWidth={3} dot={{ r:5 }}/>
            </LineChart>
          </ResponsiveContainer>
        </Container>
      </section>

      {/* Toast */}
      <ToastContainer position="bottom-end" className="p-3">
        <Toast show={toast.show} bg="light" onClose={()=>setToast({show:false,message:''})}>
          <Toast.Header><strong className="me-auto text-success">Notice</strong></Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      {/* Footer */}
      <footer className="bg-white py-4 text-center brand-footer">
        <small className="text-muted">© {new Date().getFullYear()} CarbonRoute – Mål. Reducér. Rapportér.</small>
      </footer>
    </>
  );
}
