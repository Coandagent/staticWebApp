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
  FaUpload,
  FaDownload,
  FaQuestionCircle,
  FaCalculator,
  FaTrash,
  FaExclamationCircle,
  FaChevronLeft,
  FaChevronRight,
  FaMapMarkerAlt,
  FaWeight,
  FaCheckCircle,
  FaTimesCircle,
  FaFileCsv,
  FaFileExcel,
  FaFileCode
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
  Modal,
  ListGroup
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
  const [rows, setRows] = useState([
    { segments: [{ from: '', to: '', mode: 'road', weight: '', eu: true, state: '', error: '' }], error: '' }
  ]);
  const [results, setResults] = useState([]);
  const [format, setFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  // History view state
  const [view, setView] = useState('calculator'); // "calculator" or "history"
  const [historyGroups, setHistoryGroups] = useState({});
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Dummy stats for chart
  const statsData = [
    { name: 'Jan', emissions: 400 },
    { name: 'Feb', emissions: 320 },
    { name: 'Mar', emissions: 450 },
    { name: 'Apr', emissions: 380 },
    { name: 'May', emissions: 500 },
    { name: 'Jun', emissions: 430 },
  ];

  // Toast helper
  const showToast = message => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 7000);
  };

  // Fetch auth info once
  useEffect(() => {
    fetch('/.auth/me')
      .then(res => { if (!res.ok) throw new Error(); return res.json(); })
      .then(data => setUser(data.clientPrincipal))
      .catch(() => setUser(null));
  }, []);

  // Segment handlers
  const handleSegmentChange = (rowIdx, segIdx, field, value) => {
    const allRows = [...rows];
    allRows[rowIdx].segments[segIdx][field] = value;
    allRows[rowIdx].segments[segIdx].error = '';
    setRows(allRows);
  };

  const addSegment = rowIdx => {
    const allRows = [...rows];
    allRows[rowIdx].segments.push({ from: '', to: '', mode: 'road', weight: '', eu: true, state: '', error: '' });
    setRows(allRows);
  };

  const removeSegment = (rowIdx, segIdx) => {
    const allRows = [...rows];
    allRows[rowIdx].segments.splice(segIdx, 1);
    setRows(allRows);
  };

  const addRow = () => {
    setRows([...rows, { segments: [{ from: '', to: '', mode: 'road', weight: '', eu: true, state: '', error: '' }], error: '' }]);
  };

  const removeRow = idx => {
    setRows(rows.filter((_, i) => i !== idx));
  };

  // Validate inputs
  const validate = () => {
    let ok = true;
    const updated = rows.map(row => {
      const errs = [];
      row.segments.forEach(seg => {
        if (!seg.from) errs.push('From required');
        if (!seg.to) errs.push('To required');
        if (!seg.weight) errs.push('Weight required');
      });
      return { ...row, error: errs.join(', ') };
    });
    setRows(updated);
    if (updated.some(r => r.error)) {
      showToast('Please fix input errors');
      ok = false;
    }
    return ok;
  };

  // View history handler
  const handleViewHistory = async () => {
    setLoading(true);
    try {
      // Fetch all entries for this user
      const res = await fetch('/api/GetCo2', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();
      const groups = {};

      data.forEach(entry => {
        // 1) assign a unique id (rowKey/timestamp) for delete
        entry.id = entry.timestamp || entry.rowKey;

        // 2) parse the timestamp into year/month/day buckets
        const ts = entry.timestamp || entry.rowKey || new Date().toISOString();
        const d = new Date(ts);
        const yr = d.getFullYear();
        const mo = d.toLocaleString('default', { month: 'long' });
        const day = d.getDate();

        // 3) accumulate into groups[year][month][day]
        if (!groups[yr]) groups[yr] = {};
        if (!groups[yr][mo]) groups[yr][mo] = {};
        if (!groups[yr][mo][day]) groups[yr][mo][day] = [];
        groups[yr][mo][day].push(entry);
      });

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
    const payload = rows.flatMap(row =>
      row.segments.map(seg => ({
        from_location: seg.from,
        to_location: seg.to,
        mode: seg.mode,
        weight_kg: Number(seg.weight) || 0,
        eu: Boolean(seg.eu),
        state: (seg.state || '').trim().toLowerCase()
      }))
    );
    setLoading(true);
    try {
      const calcRes = await fetch('/api/calculate-co2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!calcRes.ok) throw new Error(await calcRes.text());
      const calcResults = await calcRes.json();
      setResults(calcResults);

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

// Replace your existing calculateOnly with this:
const calculateOnly = async (rawRows) => {
  const payload = rawRows.flatMap(row =>
    row.segments.map(seg => ({
      from_location: seg.from,
      to_location: seg.to,
      mode: seg.mode,
      weight_kg: Number(seg.weight) || 0,
      eu: Boolean(seg.eu),
      state: (seg.state || '').trim().toLowerCase()
    }))
  );

  setLoading(true);
  try {
    // 1) calculate
    const calcRes = await fetch('/api/calculate-co2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!calcRes.ok) throw new Error(await calcRes.text());
    const calcResults = await calcRes.json();
    setResults(calcResults);

    // 2) save
    const saveRes = await fetch('/api/SaveCo2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: calcResults })
    });
    if (!saveRes.ok) throw new Error(await saveRes.text());

    showToast('Beregnet og gemt!');
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

      const payloadRows = parsed.map(r => ({
        from: r.from_location || r.from || r.origin,
        to:   r.to_location   || r.to   || r.destination,
        mode: r.mode || r.transport,
        weight: Number(r.weight_kg || r.weight) || 0,
        eu:    String(r.eu).toLowerCase() === 'yes' || r.eu === true,
        state: (r.state || r.state_code || '').toLowerCase()
      }));
      calculateOnly([{ segments: payloadRows }]);
      e.target.value = '';
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  // Download / Print report
  const downloadReport = () => {
    const dataToExport =
      view === 'history' && selectedGroup && selectedGroup.day
        ? historyGroups[selectedGroup.year][selectedGroup.month][selectedGroup.day]
        : results;

    if (!dataToExport || dataToExport.length === 0) {
      showToast('Ingen resultater at downloade');
      return;
    }

    if (['csv','xlsx'].includes(format)) {
      const wsData = [
        ['From','To','Mode','Distance','CO₂ (kg)'],
        ...dataToExport.map(r => [
          r.from_input ?? r.from_location,
          r.to_input   ?? r.to_location,
          r.mode,
          r.distance_km,
          r.co2_kg
        ])
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Report');
      const wbout = XLSX.write(wb, { bookType: format, type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `co2-report.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      const win = window.open('', '_blank');
      win.document.write(
        `<!doctype html><html><head><meta charset="utf-8"><title>CO₂-rapport</title>
        <style>body{font-family:sans-serif;margin:40px}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#004080;color:white}</style>
        </head><body><h1>CO₂ Report</h1><p>${new Date().toLocaleDateString()}</p>
        <table><thead><tr><th>From</th><th>To</th><th>Mode</th><th>Distance</th><th>CO₂ (kg)</th></tr></thead><tbody>
        ${dataToExport.map(r =>
          `<tr><td>${r.from_input ?? r.from_location}</td><td>${r.to_input ?? r.to_location}</td><td>${r.mode}</td><td>${r.distance_km}</td><td>${r.co2_kg}</td></tr>`
        ).join('')}
        </tbody></table></body></html>`
      );
      win.document.close();
      win.print();
    }
  };

  // DELETE helper: stops propagation, confirms, calls DELETE, updates state
  const handleDeleteEntry = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm('Er du sikker på, at du vil slette denne beregning?')) return;

    try {
      const res = await fetch('/api/GetCo2', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (!res.ok) throw new Error(await res.text());

      setHistoryGroups(prev => {
        const { year, month, day } = selectedGroup;
        const filtered = prev[year][month][day].filter(r => r.id !== id);
        return {
          ...prev,
          [year]: {
            ...prev[year],
            [month]: {
              ...prev[year][month],
              [day]: filtered
            }
          }
        };
      });
      showToast('Slettet!');
    } catch (err) {
      showToast(`Kunne ikke slette: ${err.message}`);
    }
  };

  return (
    <>
      {/* Login Modal */}
      <Modal show={showLoginModal} onHide={() => setShowLoginModal(false)} centered>
        <Modal.Header closeButton><Modal.Title>Log ind for at prøve gratis</Modal.Title></Modal.Header>
        <Modal.Body>
          <p>Log ind med din Microsoft-konto for at prøve vores CO₂-calculator gratis.</p>
          <Button variant="primary" onClick={() => window.location.href = '/.auth/login/aad?post_login_redirect=/'}>
            Log ind med Microsoft
          </Button>
        </Modal.Body>
      </Modal>

{/* Guide / FAQ Modal */}
<Modal show={showGuide} onHide={() => setShowGuide(false)} size="lg" centered>
  <Modal.Header closeButton>
    <Modal.Title>
      <FaQuestionCircle className="text-success me-2" />
      Kom godt i gang
    </Modal.Title>
  </Modal.Header>
  <Modal.Body>
    {/* 1) Manuel indtastning */}
    <Row className="mb-4">
      <Col xs={2} className="text-center">
        <FaRoute size={36} className="text-primary" />
      </Col>
      <Col xs={10}>
        <h5>1) Manuel indtastning</h5>
        <p>
          Opret ét eller flere segmenter for hver rejse. Klik{' '}
          <Badge bg="secondary">+ Tilføj segment</Badge> for at tilføje flere.
        </p>
        <ListGroup variant="flush">
          <ListGroup.Item><FaMapMarkerAlt className="me-2 text-secondary" /><strong>Fra:</strong> Afsendelsessted</ListGroup.Item>
          <ListGroup.Item><FaMapMarkerAlt className="me-2 text-secondary" /><strong>Til:</strong> Destination</ListGroup.Item>
          <ListGroup.Item><FaTruck className="me-2 text-secondary" /><strong>Transporttype:</strong> <code>vej</code>, <code>luft</code>, <code>sø</code></ListGroup.Item>
          <ListGroup.Item><FaWeight className="me-2 text-secondary" /><strong>Vægt (kg):</strong> Gods’ vægt</ListGroup.Item>
          <ListGroup.Item><FaCheckCircle className="me-2 text-secondary" /><strong>EU:</strong> Marker hvis inden for EU</ListGroup.Item>
          <ListGroup.Item><FaTimesCircle className="me-2 text-secondary" /><strong>Region:</strong> Valgfri stat/provinskode</ListGroup.Item>
        </ListGroup>
      </Col>
    </Row>
    <hr/>

    {/* 2) Upload fil */}
    <Row className="mb-4">
      <Col xs={2} className="text-center">
        <FaFileCsv size={36} className="text-success" />
      </Col>
      <Col xs={10}>
        <h5>2) Upload fil</h5>
        <p>Understøttede formater: CSV, Excel eller JSON. Eksempler:</p>
        <h6><FaFileCsv className="me-2" />CSV</h6>
        <pre className="bg-light p-2 rounded">
from_location,to_location,mode,weight_kg,eu,state{"\n"}
Copenhagen,Berlin,road,100,yes,DE
        </pre>
        <h6><FaFileExcel className="me-2" />Excel (XLSX/XLS)</h6>
        <pre className="bg-light p-2 rounded">
from_location | to_location | mode | weight_kg | eu | state{"\n"}
Copenhagen     | Berlin      | road | 100       | yes| DE
        </pre>
        <h6><FaFileCode className="me-2" />JSON</h6>
        <pre className="bg-light p-2 rounded">
[{"{"}"from_location":"Copenhagen","to_location":"Berlin","mode":"road","weight_kg":100,"eu":true,"state":"DE"{"}"}]
        </pre>
        <p>Hver række eller objekt bliver til ét segment – du kan have flere i samme fil.</p>
      </Col>
    </Row>
    <hr/>

    {/* 3) Download & rapport */}
    <Row className="mb-4">
      <Col xs={2} className="text-center">
        <FaCheckCircle size={36} className="text-success" />
      </Col>
      <Col xs={10}>
        <h5>3) Download & rapport</h5>
        <p>
          Vælg format (PDF, XLSX eller CSV) i dropdown, og klik på{' '}
          <Badge bg="success"><FaDownload /></Badge> for at gemme din rapport.
        </p>
      </Col>
    </Row>
    <hr/>

    {/* 4) Find & administrer gemte beregninger */}
    <Row>
      <Col xs={2} className="text-center">
        <FaChartLine size={36} className="text-primary" />
      </Col>
      <Col xs={10}>
        <h5>4) Find gemte beregninger</h5>
        <ol>
          <li>Tryk på “Vis beregninger” i topmenuen for at åbne historikken.</li>
          <li>Vælg år, derefter måned, og til sidst dato for at se præcis de beregninger.</li>
          <li>Brug skraldespands-ikonet ud for en række til at slette netop den beregning.</li>
        </ol>
      </Col>
    </Row>
  </Modal.Body>
  <Modal.Footer>
    <Button variant="secondary" onClick={() => setShowGuide(false)}>Luk</Button>
  </Modal.Footer>
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
                <span className="me-3">Hej, {user.userDetails}</span>
                <Button variant="outline-light" size="sm" onClick={() => window.location.href='/.auth/logout'}>
                  Log ud
                </Button>
              </>
            ) : (
              <Button variant="outline-light" size="sm" onClick={() => setShowLoginModal(true)}>
                Log ind
              </Button>
            )}
          </Nav>
        </Container>
      </Navbar>


      {/* Hero Section */}
      <header className="hero bg-primary text-white text-center py-5">
        <Container>
          <h1 className="display-4 fw-bold">Mål. Reducér. Rapportér.</h1>
          <p className="lead mb-4">
            Nem CO₂-beregning for transport i overensstemmelse med EU's ESG-krav — vej, sø og luft.
          </p>
          <p className="lead mb-4">
          Denne platform beregner udelukkende transport-CO₂ (Scope 3, kategori 4 & 9) i henhold til EU’s CSRD/ESRS. Hurtig, præcis og           omkostningseffektiv dokumentation af vej-, sø- og lufttransport direkte til din ESG-rapport.
</p>
          <div className="d-flex justify-content-center gap-2">
            {user ? (
              <>
                <Button
                  variant="light"
                  size="lg"
                  onClick={handleViewHistory}
                  disabled={loading}
                >
                  {loading
                    ? <>
                        <Spinner size="sm" className="me-1" />
                        Henter…
                      </>
                    : 'Vis beregninger'}
                </Button>
                <Button
                  variant="outline-light"
                  size="lg"
                  onClick={() => setShowGuide(true)}
                >
                  Guide
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="light"
                  size="lg"
                  onClick={() => setShowLoginModal(true)}
                >
                  Prøv Gratis
                </Button>
                <Button
                  variant="outline-light"
                  size="lg"
                  onClick={() => setShowGuide(true)}
                >
                  Guide
                </Button>
              </>
            )}
          </div>
        </Container>
      </header>

      {/* Calculator Section */}
      <Container className="my-5">
        <Card className="shadow-sm">
          <Card.Body>
            <Card.Title className="text-success">Transport CO₂ Calculator</Card.Title>

            {/* Upload & Controls */}
            <div className="mb-3 d-flex flex-wrap align-items-center">
              <Form.Control type="file" accept=".csv,.json,.xlsx,.xls" onChange={handleFileUpload} id="file-upload" style={{ display:'none' }} />
              <Button as="label" htmlFor="file-upload" variant="outline-success" className="me-2 mb-2">
                {fileLoading ? <Spinner animation="border" size="sm"/> : <FaUpload className="me-1"/>}
                Upload fil
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
                <FaDownload className="me-1"/> Download Rapport
              </Button>
              <Button variant="outline-primary" className="mb-2 ms-auto" onClick={addRow}>
                <FaCalculator className="me-1"/> Tilføj ny rejse
              </Button>
            </div>

            {/* Desktop Journeys */}
            <div className="d-none d-md-block">
              {rows.map((row, ri) => (
                <div key={ri} className="mb-4">
                  <div className="d-flex justify-content-end mb-2">
                    {rows.length > 1 && (
                      <Button variant="outline-danger" size="sm" onClick={() => removeRow(ri)}>
                        Fjern rejse
                      </Button>
                    )}
                  </div>
                  <Table bordered responsive className="align-middle brand-table">
                    <thead className="table-light">
                      <tr>
                        <th>#</th><th>From</th><th>To</th><th>Mode</th><th>Vægt (kg)</th><th>EU</th><th>State</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {row.segments.map((seg, si) => (
                        <tr key={si}>
                          <td>{si+1}</td>
                          <td>
                            <Form.Control
                              placeholder="From"
                              value={seg.from}
                              onChange={e => handleSegmentChange(ri, si, 'from', e.target.value)}
                            />
                          </td>
                          <td>
                            <Form.Control
                              placeholder="To"
                              value={seg.to}
                              onChange={e => handleSegmentChange(ri, si, 'to', e.target.value)}
                            />
                          </td>
                          <td>
                            <Form.Select
                              value={seg.mode}
                              onChange={e => handleSegmentChange(ri, si, 'mode', e.target.value)}
                            >
                              <option value="road">Road</option>
                              <option value="air">Air</option>
                              <option value="sea">Sea</option>
                            </Form.Select>
                          </td>
                          <td>
                            <Form.Control
                              type="number"
                              placeholder="0"
                              value={seg.weight}
                              onChange={e => handleSegmentChange(ri, si, 'weight', e.target.value)}
                            />
                          </td>
                          <td className="text-center">
                            <Form.Check
                              checked={seg.eu}
                              onChange={e => handleSegmentChange(ri, si, 'eu', e.target.checked)}
                            />
                          </td>
                          <td>
                            <Form.Control
                              placeholder="State"
                              value={seg.state}
                              onChange={e => handleSegmentChange(ri, si, 'state', e.target.value)}
                            />
                          </td>
                          <td className="text-center">
                            {row.segments.length > 1 && (
                              <Button variant="outline-danger" size="sm" onClick={() => removeSegment(ri, si)}>
                                <FaTrash/>
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={8} className="text-end">
                          <Button size="sm" onClick={() => addSegment(ri)}>+ Tilføj segment</Button>
                        </td>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
              ))}
            </div>

            {/* Mobile input cards */}
            <div className="d-block d-md-none">
              {rows.map((row, ri) => (
                <Card key={ri} className="mb-3 brand-card-mobile">
                  <Card.Body>
                    <h6>Journey {ri + 1}
                      {rows.length > 1 && (
                        <Button variant="link" size="sm" className="text-danger float-end" onClick={() => removeRow(ri)}>
                          Remove Journey
                        </Button>
                      )}
                    </h6>
                    {row.segments.map((seg, si) => (
                      <div key={si} className="mb-3 p-2 border rounded">
                        <strong>Segment {si + 1}</strong>
                        <Form.Control
                          className="mb-2"
                          placeholder="From"
                          value={seg.from}
                          onChange={e => handleSegmentChange(ri, si, 'from', e.target.value)}
                        />
                        <Form.Control
                          className="mb-2"
                          placeholder="To"
                          value={seg.to}
                          onChange={e => handleSegmentChange(ri, si, 'to', e.target.value)}
                        />
                        <Form.Select
                          className="mb-2"
                          value={seg.mode}
                          onChange={e => handleSegmentChange(ri, si, 'mode', e.target.value)}
                        >
                          <option value="road">Road</option>
                          <option value="air">Air</option>
                          <option value="sea">Sea</option>
                        </Form.Select>
                        <Form.Control
                          className="mb-2"
                          type="number"
                          placeholder="Weight (kg)"
                          value={seg.weight}
                          onChange={e => handleSegmentChange(ri, si, 'weight', e.target.value)}
                        />
                        <div className="d-flex align-items-center mb-2">
                          <Form.Check
                            className="me-2"
                            checked={seg.eu}
                            onChange={e => handleSegmentChange(ri, si, 'eu', e.target.checked)}
                          />
                          <small>In EU</small>
                        </div>
                        <Form.Control
                          className="mb-2"
                          placeholder="State"
                          value={seg.state}
                          onChange={e => handleSegmentChange(ri, si, 'state', e.target.value)}
                        />
                        {row.segments.length > 1 && (
                          <Button variant="outline-danger" size="sm" onClick={() => removeSegment(ri, si)}>
                            Remove Segment
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button size="sm" onClick={() => addSegment(ri)}>+ Add Segment</Button>
                  </Card.Body>
                </Card>
              ))}
            </div>

            {/* Calculate & Save */}
            <div className="text-end">
              <Button variant="success" onClick={handleCalculateAndSave} disabled={loading}>
                {loading ? <><Spinner size="sm" className="me-1"/>Beregner…</> : 'Beregning & Gem'}
              </Button>
            </div>
          </Card.Body>
        </Card>

        {/* Results Table */}
        {results.length > 0 && (
          <Card className="shadow-sm mt-4">
            <Card.Body>
              <Card.Title className="text-success">Resultater</Card.Title>
              <Table striped bordered hover responsive className="mt-3 brand-table">
                <thead>
                  <tr>
                    <th>From (Used)</th>
                    <th>To (Used)</th>
                    <th>Mode</th>
                    <th>Distance (km)</th>
                    <th>Weight (kg)</th>
                    <th>EU</th>
                    <th>State</th>
                    <th>CO₂ (kg)</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className={r.error ? 'table-danger' : ''}>
                      <td>{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td>{r.to_input} <small className="text-muted">({r.to_used})</small></td>
                      <td className="text-capitalize">{r.mode}</td>
                      <td>{r.distance_km}</td>
                      <td>{r.weight_kg}</td>
                      <td>{r.eu ? 'Yes' : 'No'}</td>
                      <td>{r.state?.toUpperCase() ?? ''}</td>
                      <td>{r.co2_kg}</td>
                      <td>
                        {r.error && (
                          <Badge bg="danger">
                            <FaExclamationCircle className="me-1" />
                            {r.error}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card.Body>
          </Card>
        )}
      </Container>

      {/* History drill-down */}
      {view === 'history' && (
        <Container className="my-5">
          <Button variant="secondary" onClick={() => setView('calculator')}>
            ← Back to Calculator
          </Button>

          {!selectedGroup ? (
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
                      {month}
                    </Badge>
                  ))}
                </div>
              ))}
            </>
          ) : !selectedGroup.day ? (
            <>
              <Button variant="link" onClick={() => setSelectedGroup(null)}>
                ← Back to Years
              </Button>
              <h3 className="mt-3">
                {selectedGroup.month} {selectedGroup.year}
              </h3>
              {Object.entries(historyGroups[selectedGroup.year][selectedGroup.month]).map(
                ([day, entries]) => (
                  <Badge
                    key={day}
                    bg="secondary"
                    className="me-2 mb-1"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedGroup({ ...selectedGroup, day })}
                  >
                    {day} ({entries.length})
                  </Badge>
                )
              )}
            </>
          ) : (
            <>
              <Button
                variant="link"
                onClick={() =>
                  setSelectedGroup({ year: selectedGroup.year, month: selectedGroup.month })
                }
              >
                ← Back to {selectedGroup.month}
              </Button>
              <h3 className="mt-3">
                {selectedGroup.day} {selectedGroup.month} {selectedGroup.year}
              </h3>
              <Table striped bordered hover responsive className="mt-2 brand-table">
                <thead>
                  <tr>
                    <th></th> {/* delete-column header */}
                    <th>From (Used)</th>
                    <th>To (Used)</th>
                    <th>Mode</th>
                    <th>Distance (km)</th>
                    <th>Weight (kg)</th>
                    <th>EU</th>
                    <th>State</th>
                    <th>CO₂ (kg)</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {historyGroups[selectedGroup.year][selectedGroup.month][selectedGroup.day].map(
                    (r, i) => (
                      <tr key={r.id} className={r.error ? 'table-danger' : ''}>
                        <td className="text-center">
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={e => handleDeleteEntry(e, r.id)}
                          >
                            <FaTrash />
                          </Button>
                        </td>
                        <td>
                          {r.from_input}{' '}
                          <small className="text-muted">({r.from_used})</small>
                        </td>
                        <td>
                          {r.to_input}{' '}
                          <small className="text-muted">({r.to_used})</small>
                        </td>
                        <td className="text-capitalize">{r.mode}</td>
                        <td>{r.distance_km}</td>
                        <td>{r.weight_kg}</td>
                        <td>{r.eu ? 'Yes' : 'No'}</td>
                        <td>{r.state?.toUpperCase() ?? ''}</td>
                        <td>{r.co2_kg}</td>
                        <td>
                          {r.error && (
                            <Badge bg="danger">
                              <FaExclamationCircle className="me-1" />
                              {r.error}
                            </Badge>
                          )}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </Table>
            </>
          )}
        </Container>
      )}

      {/* Feature Cards */}
      <Container className="my-5" id="features">
  <Row className="text-center mb-4">
    <h2 className="fw-bold">Hvorfor vælge os?</h2>
    <p className="text-muted">
      Den hurtigste, billigste og mest præcise måde at dokumentere transport-CO₂ i din ESG-rapport.
    </p>
  </Row>
  <Row>
    {/* 1) Specialiseret transport-CO₂ */}
    <Col md={4} className="mb-4">
      <Card className="h-100 shadow-sm border-0">
        <Card.Body>
          <Card.Title className="fw-bold text-primary">Specialiseret Transport-CO₂</Card.Title>
          <Card.Text className="text-muted">
            Udelukkende Scope 3, kategori 4 & 9 – indgående og udgående ruter.  
            Klar til CSRD/ESRS uden overflødige data.
          </Card.Text>
        </Card.Body>
      </Card>
    </Col>

    {/* 2) Spar tid og undgå fejl */}
    <Col md={4} className="mb-4">
      <Card className="h-100 shadow-sm border-0">
        <Card.Body>
          <Card.Title className="fw-bold text-primary">Spar Tid & Undgå Fejl</Card.Title>
          <Card.Text className="text-muted">
            Indtast manuelt eller bulk-upload CSV/Excel/JSON.  
            Fra rådata til CO₂-tal på få minutter – ingen flere regnearkskatastrofer.
          </Card.Text>
        </Card.Body>
      </Card>
    </Col>

    {/* 3) Audit-ready rapporter */}
    <Col md={4} className="mb-4">
      <Card className="h-100 shadow-sm border-0">
        <Card.Body>
          <Card.Title className="fw-bold text-primary">Audit-Ready Rapporter</Card.Title>
          <Card.Text className="text-muted">
            Download PDF, XLSX eller CSV med GHG-protokol og ISO 14083-metode.  
            Undgå revisionsbemærkninger og dokumentér compliance med ét klik.
          </Card.Text>
        </Card.Body>
      </Card>
    </Col>
  </Row>
</Container>

      {/* Carousel */}

{/* Sådan virker det */}
<Container className="my-5">
  <h2 className="fw-bold text-center mb-4">Sådan virker det</h2>
  {/* 1) Define your steps as a variable */}
  {(() => {
    const items = [
      {
        icon: <FaUserPlus size={48} className="text-success"/>,
        title: 'Opret konto',
        desc: 'Få adgang på 30 sekunder – ingen binding'
      },
      {
        icon: <FaRoute size={48} className="text-success"/>,
        title: 'Indtast data',
        desc: 'Vælg transportform, rute og vægt'
      },
      {
        icon: <FaChartLine size={48} className="text-success"/>,
        title: 'Se resultat',
        desc: 'Få CO₂-tal og afstand med det samme'
      },
      {
        icon: <FaDownload size={48} className="text-success"/>,
        title: 'Eksportér',
        desc: 'Download PDF, Excel eller CSV'
      },
      {
        icon: <FaTruck size={48} className="text-success"/>,
        title: 'Optimer',
        desc: 'Find CO₂-tunge ruter og spar omkostninger'
      },
      {
        icon: <FaHandshake size={48} className="text-success"/>,
        title: 'Del rapport',
        desc: 'Del med kunder eller kolleger'
      }
    ];

    // 2) Chunk into pairs and render
    const chunks = items.reduce((rows, item, i, arr) => {
      if (i % 2 === 0) rows.push([ item, arr[i + 1] ]);
      return rows;
    }, []);

    return (
      <Carousel
        controls
        indicators={false}
        interval={null}
        prevIcon={<FaChevronLeft size={32} className="text-success" />}
        nextIcon={<FaChevronRight size={32} className="text-success" />}
        className="pb-4"
      >
        {chunks.map((pair, idx) => (
          <Carousel.Item key={idx}>
            <Row className="justify-content-center g-4">
              {pair.map((step, j) => step && (
                <Col xs={12} md={6} key={j}>
                  <Card className="text-center border-0 shadow-sm p-4">
                    {step.icon}
                    <Card.Title className="mt-2 fw-bold">{step.title}</Card.Title>
                    <Card.Text>{step.desc}</Card.Text>
                  </Card>
                </Col>
              ))}
            </Row>
          </Carousel.Item>
        ))}
      </Carousel>
    );
  })()}
</Container>

{/* Emissions-trend */}
<section className="py-5 bg-white">
  <Container>
    <h2 className="text-center mb-2">Din CO₂-trend</h2>
    <p className="text-center text-muted mb-4">
      Følg udviklingen måned for måned og få indsigt i, hvor meget du kan reducere.
    </p>
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={statsData}
        margin={{ top: 10, right: 30, bottom: 5, left: 0 }}
      >
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" />
        <YAxis
          label={{ value: 'kg CO₂', angle: -90, position: 'insideLeft', offset: 10 }}
        />
        <Tooltip 
          formatter={(value) => `${value} kg`} 
          contentStyle={{ borderRadius: 8, backgroundColor: '#f9f9f9' }} 
        />
        <Line
          type="monotone"
          dataKey="emissions"
          stroke="#2a8f64"
          strokeWidth={3}
          dot={{ r: 6, strokeWidth: 2, fill: '#fff' }}
          activeDot={{ r: 8 }}
          isAnimationActive={true}
          animationDuration={1500}
          animationEasing="ease-out"
        />
      </LineChart>
    </ResponsiveContainer>
    <div className="text-center mt-3">
      <strong>
        Sidste måned udledte du {statsData[statsData.length - 1].emissions} kg CO₂.
      </strong>
      <p className="small text-muted">
        Brug denne indsigt til at optimere dine ruter og skære unødvendige emissioner væk.
      </p>
    </div>
  </Container>
</section>


      {/* Toast */}
      <ToastContainer position="bottom-end" className="p-3">
        <Toast show={toast.show} bg="light" onClose={() => setToast({show:false,message:''})}>
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
