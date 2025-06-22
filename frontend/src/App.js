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

export default function App() {
  const [rows, setRows] = useState([
    { from: '', to: '', mode: 'road', weight: '', eu: true, state: '', error: '' },
  ]);
  const [results, setResults] = useState([]);
  const [format, setFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [toast, setToast] = useState({ show: false, message: '' });

  const showToast = message => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 4000);
  };

  const handleChange = (idx, field, value) => {
    const updated = [...rows];
    updated[idx][field] = value;
    updated[idx].error = '';
    setRows(updated);
  };

  const addRow = () =>
    setRows([
      ...rows,
      { from: '', to: '', mode: 'road', weight: '', eu: true, state: '', error: '' },
    ]);
  const removeRow = idx => setRows(rows.filter((_, i) => i !== idx));

  const validate = () => {
    let valid = true;
    const updated = rows.map(r => {
      const errs = [];
      if (!r.from) errs.push('Origin required');
      if (!r.to) errs.push('Destination required');
      if (!r.weight) errs.push('Weight required');
      return { ...r, error: errs.join(', ') };
    });
    setRows(updated);
    if (updated.some(r => r.error)) {
      showToast('Please fix input errors');
      valid = false;
    }
    return valid;
  };

  const calculate = async payload => {
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
      showToast(err.message);
    } finally {
      setLoading(false);
      setFileLoading(false);
    }
  };

  const handleManualCalculate = () => {
    if (!validate()) return;
    const payload = rows.map(r => ({
      from_location: r.from,
      to_location: r.to,
      mode: r.mode,
      weight_kg: Number(r.weight) || 0,
      eu: r.eu,
      state: r.state.trim().toLowerCase(),
    }));
    calculate(payload);
  };

  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (!file) return;
    setFileLoading(true);

    const reader = new FileReader();
    reader.onload = async evt => {
      let parsed = [];
      const text = evt.target.result;
      if (/\.(xlsx|xls)$/i.test(file.name)) {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        parsed = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      } else if (/\.csv$/i.test(file.name)) {
        const lines = text.trim().split('\n');
        const keys = lines[0].split(',').map(h => h.trim());
        parsed = lines.slice(1).map(row => {
          const vals = row.split(',').map(v => v.trim());
          return Object.fromEntries(keys.map((k, i) => [k, vals[i]]));
        });
      } else {
        parsed = JSON.parse(text);
      }

      const payload = parsed.map(r => ({
        from_location: r.from_location || r.from || r.origin,
        to_location: r.to_location || r.to || r.destination,
        mode: r.mode || r.transport,
        weight_kg: Number(r.weight_kg || r.weight) || 0,
        eu: String(r.eu).toLowerCase() === 'yes',
        state: (r.state || '').toLowerCase(),
      }));

      calculate(payload);
      e.target.value = '';
    };

    if (/\.(xlsx|xls)$/i.test(file.name)) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const downloadReport = () => {
    if (!results.length) {
      showToast('No results to download');
      return;
    }
    // ... CSV / XLSX / PDF logic unchanged ...
  };

  return (
    <>
      <Navbar bg="light" expand="lg" className="shadow-sm">
        <Container>
          <Navbar.Brand>Coandagent ESG CO₂ Dashboard</Navbar.Brand>
          <Nav className="ms-auto align-items-center">
            <Form.Control
              type="file"
              accept=".csv,.json,.xlsx,.xls"
              onChange={handleFileUpload}
              id="file-upload"
              style={{ display: 'none' }}
            />
            <Button
              as="label"
              htmlFor="file-upload"
              variant="outline-primary"
              className="me-3"
            >
              {fileLoading ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <FaUpload className="me-1" />
              )}
              Upload File
            </Button>

            <Dropdown onSelect={setFormat} className="me-3">
              <Dropdown.Toggle variant="outline-secondary">
                Format: {format.toUpperCase()}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {['pdf', 'xlsx', 'csv'].map(f => (
                  <Dropdown.Item key={f} eventKey={f}>
                    {f.toUpperCase()}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>

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
                  <th>From</th>
                  <th>To</th>
                  <th>Mode</th>
                  <th>Weight (kg)</th>
                  <th>EU</th>
                  <th>State</th>
                  <th>Error</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={r.error ? 'table-danger' : ''}>
                    <td>
                      <Form.Control
                        placeholder="City or Code"
                        value={r.from}
                        onChange={e => handleChange(i, 'from', e.target.value)}
                      />
                    </td>
                    <td>
                      <Form.Control
                        placeholder="City or Code"
                        value={r.to}
                        onChange={e => handleChange(i, 'to', e.target.value)}
                      />
                    </td>
                    <td>
                      <Form.Select
                        value={r.mode}
                        onChange={e => handleChange(i, 'mode', e.target.value)}
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
                        value={r.weight}
                        onChange={e => handleChange(i, 'weight', e.target.value)}
                      />
                    </td>
                    <td className="text-center">
                      <Form.Check
                        type="checkbox"
                        checked={r.eu}
                        onChange={e => handleChange(i, 'eu', e.target.checked)}
                      />
                    </td>
                    <td>
                      <Form.Control
                        placeholder="State-code"
                        value={r.state}
                        onChange={e => handleChange(i, 'state', e.target.value)}
                      />
                    </td>
                    <td>
                      {r.error && (
                        <Badge bg="danger">
                          <FaExclamationCircle className="me-1" />
                          {r.error}
                        </Badge>
                      )}
                    </td>
                    <td className="text-center">
                      <Button
                        variant="outline-danger"
                        size="sm"
                        onClick={() => removeRow(i)}
                      >
                        <FaTrash />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <Row className="mt-3">
              <Col>
                <Button variant="success" onClick={addRow}>
                  <FaUpload className="me-1" /> Add Row
                </Button>
              </Col>
              <Col className="text-end">
                <Button
                  variant="primary"
                  onClick={handleManualCalculate}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Spinner
                        animation="border"
                        size="sm"
                        className="me-1"
                      />
                      Calculating…
                    </>
                  ) : (
                    <>
                      <FaCalculator className="me-1" /> Calculate
                    </>
                  )}
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
                  <tr>
                    <th>From (Used)</th>
                    <th>To (Used)</th>
                    <th>Mode</th>
                    <th>Distance (km)</th>
                    <th>CO₂ (kg)</th>
                    <th>Error</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className={r.error ? 'table-danger' : ''}>
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

      <ToastContainer position="bottom-end" className="p-3">
        <Toast
          bg="warning"
          show={toast.show}
          onClose={() => setToast({ show: false, message: '' })}
          delay={4000}
          autohide
        >
          <Toast.Header>
            <FaExclamationCircle className="me-2 text-danger" />
            <strong className="me-auto">Error</strong>
          </Toast.Header>
          <Toast.Body>{toast.message}</Toast.Body>
        </Toast>
      </ToastContainer>

      <footer className="bg-light py-3 text-center">
        <small className="text-secondary">
          © {new Date().getFullYear()} Coandagent
        </small>
      </footer>
    </>
  );
}
