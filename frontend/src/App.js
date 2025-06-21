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
  Col
} from 'react-bootstrap';
import { FaUpload, FaCalculator, FaDownload, FaTrash } from 'react-icons/fa';

export default function App() {
  const [rows, setRows] = useState([
    { from: '', to: '', mode: 'road', weight: '', eu: true, state: '' }
  ]);
  const [results, setResults] = useState([]);
  const [format, setFormat] = useState('pdf');
  const [loading, setLoading] = useState(false);

  const handleChange = (idx, field, value) => {
    const updated = [...rows];
    updated[idx][field] = value;
    setRows(updated);
  };

  const addRow = () => {
    setRows([...rows, { from: '', to: '', mode: 'road', weight: '', eu: true, state: '' }]);
  };

  const removeRow = idx => setRows(rows.filter((_, i) => i !== idx));

  const calculate = async () => {
    setLoading(true);
    const payload = rows.map(r => ({
      from_location: r.from,
      to_location:   r.to,
      mode:          r.mode,
      weight_kg:     Number(r.weight) || 0,
      eu:            r.eu,
      state:         r.state.trim().toLowerCase()
    }));
    try {
      const res = await fetch('/api/calculate-co2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  const downloadReport = () => {
    // TODO: generate and download report in selected format
    alert(`Preparing your report as ${format.toUpperCase()}...`);
  };

  return (
    <>
      <Navbar bg="light" expand="lg" className="shadow-sm">
        <Container>
          <Navbar.Brand className="fw-bold">Coandagent ESG CO₂ Dashboard</Navbar.Brand>
          <Nav className="ms-auto align-items-center">
            <Dropdown onSelect={setFormat} className="me-3">
              <Dropdown.Toggle variant="outline-secondary">
                Format: {format.toUpperCase()}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {['pdf','xlsx','csv'].map(f => (
                  <Dropdown.Item key={f} eventKey={f}>
                    {f.toUpperCase()}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
            <Button variant="primary" onClick={downloadReport}>
              <FaDownload className="me-1" /> Download Report
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
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><Form.Control placeholder="City" value={r.from} onChange={e => handleChange(i,'from',e.target.value)} /></td>
                    <td><Form.Control placeholder="City" value={r.to} onChange={e => handleChange(i,'to',e.target.value)} /></td>
                    <td>
                      <Form.Select value={r.mode} onChange={e => handleChange(i,'mode',e.target.value)}>
                        <option value="road">Road</option>
                        <option value="air">Air</option>
                        <option value="sea">Sea</option>
                      </Form.Select>
                    </td>
                    <td><Form.Control type="number" placeholder="0" value={r.weight} onChange={e => handleChange(i,'weight',e.target.value)} /></td>
                    <td className="text-center"><Form.Check type="checkbox" checked={r.eu} onChange={e => handleChange(i,'eu',e.target.checked)} /></td>
                    <td><Form.Control placeholder="State" value={r.state} onChange={e => handleChange(i,'state',e.target.value)} /></td>
                    <td className="text-center"><Button variant="outline-danger" size="sm" onClick={() => removeRow(i)}><FaTrash /></Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Row className="mt-3">
              <Col><Button variant="success" onClick={addRow}><FaUpload className="me-1" /> Add Row</Button></Col>
              <Col className="text-end"><Button variant="primary" onClick={calculate} disabled={loading}><FaCalculator className="me-1" />{loading ? 'Calculating…' : 'Calculate'}</Button></Col>
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
                    <th>From (Used)</th><th>To (Used)</th><th>Mode</th><th>Distance (km)</th><th>CO₂ (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td>{r.from_input} <small className="text-muted">({r.from_used})</small></td>
                      <td>{r.to_input} <small className="text-muted">({r.to_used})</small></td>
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
