import React, { useState, useRef } from 'react';
import { Container, Row, Col, Form, Button, Table, Dropdown, DropdownButton, Spinner } from 'react-bootstrap';
import { FaUpload, FaDownload, FaPlus, FaTrash, FaCalculator, FaFileCsv, FaFileExcel, FaFilePdf } from 'react-icons/fa';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import * as XLSX from 'xlsx';

function App() {
  const fileInputRef = useRef(null);
  const [rows, setRows] = useState([
    { id: 1, from: '', to: '', mode: '', weight: 0, eu: false, state: '' }
  ]);
  const [results, setResults] = useState([]);
  const [format, setFormat] = useState('PDF');
  const [loadingFile, setLoadingFile] = useState(false);
  const [loadingCalc, setLoadingCalc] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);

  const nextId = useRef(2);

  const handleFileInputClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isJSON = fileName.endsWith('.json');
    const isXLSX = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    if (!isCSV && !isJSON && !isXLSX) {
      toast.error('Unsupported file type. Please upload a CSV, JSON, or Excel file.');
      return;
    }
    setLoadingFile(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (isCSV) {
          // Parse CSV content
          const text = event.target.result;
          const lines = text.split(/\r?\n/);
          if (lines.length <= 1) {
            throw new Error('CSV file is empty or missing data');
          }
          // Use first line as header
          const headers = lines[0].split(',');
          const dataRows = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const values = line.split(',');
            const rowObj = {};
            headers.forEach((header, index) => {
              const key = header.trim().toLowerCase();
              rowObj[key] = values[index] !== undefined ? values[index].trim() : '';
            });
            dataRows.push(rowObj);
          }
          processImportedData(dataRows);
        } else if (isJSON) {
          const text = event.target.result;
          const jsonData = JSON.parse(text);
          if (!Array.isArray(jsonData)) {
            throw new Error('JSON file must contain an array of objects');
          }
          if (jsonData.length === 0) {
            throw new Error('JSON data is empty');
          }
          // Convert all keys to lowercase for consistency
          const dataRows = jsonData.map(obj => {
            const normalized = {};
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                normalized[key.toLowerCase()] = obj[key];
              }
            }
            return normalized;
          });
          processImportedData(dataRows);
        } else if (isXLSX) {
          const arrayBuffer = event.target.result;
          const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const dataRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (dataRows.length === 0) {
            throw new Error('Excel sheet is empty or missing data');
          }
          // Convert keys to lowercase
          const normalizedRows = dataRows.map(obj => {
            const normalized = {};
            for (const key in obj) {
              if (obj.hasOwnProperty(key)) {
                normalized[key.toLowerCase()] = obj[key];
              }
            }
            return normalized;
          });
          processImportedData(normalizedRows);
        }
      } catch (error) {
        console.error(error);
        toast.error('Error processing file: ' + error.message);
        setLoadingFile(false);
      }
    };
    reader.onloadend = () => {
      setLoadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };
    // Read file based on type
    if (isXLSX) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const processImportedData = (dataRows) => {
    // Validate and map imported data to rows state format
    const requiredKeys = ['from', 'to', 'mode', 'weight', 'eu', 'state'];
    const importedRows = [];
    dataRows.forEach((obj, idx) => {
      // Check all required keys present
      for (const key of requiredKeys) {
        if (!(key in obj)) {
          throw new Error('Missing required field "' + key + '" in data row ' + (idx + 1));
        }
      }
      // Create row object
      const row = {
        id: nextId.current++,
        from: obj.from || '',
        to: obj.to || '',
        mode: obj.mode || '',
        weight: obj.weight !== undefined && obj.weight !== null ? obj.weight : 0,
        eu: (obj.eu === true || obj.eu === 'true' || obj.eu === 1 || obj.eu === 'Yes') ? true : false,
        state: obj.state || ''
      };
      // Convert weight to number if possible
      if (typeof row.weight === 'string') {
        const num = parseFloat(row.weight);
        if (!isNaN(num)) {
          row.weight = num;
        }
      }
      importedRows.push(row);
    });
    if (importedRows.length === 0) {
      throw new Error('No valid data found in file');
    }
    setRows(importedRows);
    setResults([]); // clear any previous results
    toast.success('File loaded successfully. ' + importedRows.length + ' rows imported.');
  };

  const handleAddRow = () => {
    setRows(prevRows => [
      ...prevRows,
      { id: nextId.current++, from: '', to: '', mode: '', weight: 0, eu: false, state: '' }
    ]);
  };

  const handleRemoveRow = (id) => {
    setRows(prevRows => prevRows.filter(row => row.id !== id));
  };

  const handleInputChange = (index, field, value) => {
    setRows(prevRows => {
      const newRows = [...prevRows];
      if (field === 'eu') {
        newRows[index].eu = value;
      } else if (field === 'weight') {
        // Allow empty string or numeric value
        if (value === '') {
          newRows[index].weight = '';
        } else {
          const num = parseFloat(value);
          newRows[index].weight = isNaN(num) ? newRows[index].weight : num;
        }
      } else {
        newRows[index][field] = value;
      }
      return newRows;
    });
  };

  const handleCalculate = () => {
    // Basic validation before calculate
    if (rows.length === 0) {
      toast.error('No data to calculate.');
      return;
    }
    for (const row of rows) {
      if (!row.from || !row.to || !row.mode || (row.weight === '' || row.weight === null)) {
        toast.error('Please fill in all fields before calculating.');
        return;
      }
    }
    setLoadingCalc(true);
    try {
      const calcResults = rows.map(row => {
        // Ideally, perform distance and CO2 calculation here
        return {
          from: row.from,
          fromUsed: '', // placeholder for standardized name if any
          to: row.to,
          toUsed: '',
          mode: row.mode,
          distance: '',
          co2: ''
        };
      });
      setResults(calcResults);
    } catch (error) {
      console.error(error);
      toast.error('Error during calculation: ' + error.message);
    } finally {
      setLoadingCalc(false);
    }
  };

  const handleDownload = () => {
    if (results.length === 0) {
      toast.error('No results to download. Please run Calculate first.');
      return;
    }
    const fmt = format.toUpperCase();
    if (fmt === 'PDF') {
      setLoadingDownload(true);
      import('jspdf').then(jsPDFModule => {
        const { default: jsPDF } = jsPDFModule;
        import('jspdf-autotable').then(() => {
          try {
            const doc = new jsPDF({ unit: 'pt', format: 'a4' });
            // Title
            doc.text('CO2 Emissions Report', 40, 50);
            // Prepare table data
            const head = [['From (Used)', 'To (Used)', 'Mode', 'Distance (km)', 'CO2 (kg)']];
            const body = results.map(res => {
              const fromCell = res.from + ' (' + (res.fromUsed || '') + ')';
              const toCell = res.to + ' (' + (res.toUsed || '') + ')';
              const distanceCell = res.distance !== undefined && res.distance !== null ? String(res.distance) : '';
              const co2Cell = res.co2 !== undefined && res.co2 !== null ? String(res.co2) : '';
              return [fromCell, toCell, res.mode, distanceCell, co2Cell];
            });
            doc.autoTable({
              head: head,
              body: body,
              startY: 70
            });
            doc.save('CO2_Report.pdf');
          } catch (error) {
            console.error(error);
            toast.error('Failed to generate PDF: ' + error.message);
          } finally {
            setLoadingDownload(false);
          }
        });
      });
    } else if (fmt === 'CSV') {
      try {
        // Build CSV content
        const header = ['From Input','From Used','To Input','To Used','Mode','Distance (km)','CO2 (kg)'];
        let csvContent = header.join(',') + '\n';
        for (const res of results) {
          const row = [
            res.from || '',
            res.fromUsed || '',
            res.to || '',
            res.toUsed || '',
            res.mode || '',
            res.distance !== undefined && res.distance !== null ? res.distance : '',
            res.co2 !== undefined && res.co2 !== null ? res.co2 : ''
          ];
          // Quote fields if needed
          const csvRow = row.map(field => {
            const str = String(field);
            if (str.includes('"')) {
              return '"' + str.replace(/"/g, '""') + '"';
            } else if (str.includes(',') || str.includes('\n') || str.includes('\r')) {
              return '"' + str + '"';
            } else {
              return str;
            }
          }).join(',');
          csvContent += csvRow + '\n';
        }
        // Trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'CO2_Report.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error(error);
        toast.error('Failed to generate CSV: ' + error.message);
      }
    } else if (fmt === 'XLSX') {
      try {
        const wb = XLSX.utils.book_new();
        const sheetData = [];
        // header
        sheetData.push(['From Input','From Used','To Input','To Used','Mode','Distance (km)','CO2 (kg)']);
        for (const res of results) {
          sheetData.push([
            res.from || '',
            res.fromUsed || '',
            res.to || '',
            res.toUsed || '',
            res.mode || '',
            res.distance !== undefined && res.distance !== null ? res.distance : '',
            res.co2 !== undefined && res.co2 !== null ? res.co2 : ''
          ]);
        }
        const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
        XLSX.utils.book_append_sheet(wb, worksheet, 'Results');
        XLSX.writeFile(wb, 'CO2_Report.xlsx');
      } catch (error) {
        console.error(error);
        toast.error('Failed to generate XLSX: ' + error.message);
      }
    }
  };

  return (
    <Container fluid className="p-3">
      <h1 className="mb-4">Coandagent ESG CO2 Dashboard</h1>
      <Row className="mb-3">
        <Col xs={12} sm="auto" className="mb-2">
          <input
            type="file"
            accept=".csv,.json,.xlsx,.xls"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
            disabled={loadingFile || loadingCalc || loadingDownload}
          />
          <Button variant="primary" onClick={handleFileInputClick} disabled={loadingFile || loadingCalc || loadingDownload}>
            {loadingFile ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" /> : <FaUpload className="me-1" />}
            {loadingFile ? 'Uploading...' : 'Upload File'}
          </Button>
        </Col>
        <Col xs={12} sm="auto" className="mb-2">
          <DropdownButton
            id="formatDropdown"
            title={`Format: ${format}`}
            variant="secondary"
            onSelect={(eventKey) => { if (eventKey) setFormat(eventKey); }}
            disabled={loadingFile || loadingCalc || loadingDownload}
          >
            <Dropdown.Item eventKey="PDF"><FaFilePdf className="me-2" />PDF</Dropdown.Item>
            <Dropdown.Item eventKey="CSV"><FaFileCsv className="me-2" />CSV</Dropdown.Item>
            <Dropdown.Item eventKey="XLSX"><FaFileExcel className="me-2" />Excel</Dropdown.Item>
          </DropdownButton>
        </Col>
        <Col xs={12} sm="auto" className="mb-2">
          <Button variant="success" onClick={handleDownload} disabled={loadingFile || loadingCalc || loadingDownload || results.length === 0}>
            {loadingDownload ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" /> : <FaDownload className="me-1" />}
            {loadingDownload ? 'Generating...' : 'Download Report'}
          </Button>
        </Col>
      </Row>

      <h5 className="mb-3">Transport CO2 Calculator</h5>
      <Table bordered responsive size="sm">
        <thead>
          <tr>
            <th>From</th>
            <th>To</th>
            <th>Mode</th>
            <th>Weight (kg)</th>
            <th>EU</th>
            <th>State</th>
            <th>Error</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td><Form.Control type="text" value={row.from} onChange={(e) => handleInputChange(index, 'from', e.target.value)} placeholder="Origin" /></td>
              <td><Form.Control type="text" value={row.to} onChange={(e) => handleInputChange(index, 'to', e.target.value)} placeholder="Destination" /></td>
              <td>
                <Form.Select value={row.mode} onChange={(e) => handleInputChange(index, 'mode', e.target.value)}>
                  <option value="" disabled>Select mode</option>
                  <option value="Road">Road</option>
                  <option value="Air">Air</option>
                  <option value="Sea">Sea</option>
                  <option value="Rail">Rail</option>
                </Form.Select>
              </td>
              <td><Form.Control type="number" value={row.weight} onChange={(e) => handleInputChange(index, 'weight', e.target.value)} /></td>
              <td className="text-center">
                <Form.Check type="checkbox" checked={row.eu} onChange={(e) => handleInputChange(index, 'eu', e.target.checked)} aria-label="EU" />
              </td>
              <td><Form.Control type="text" value={row.state} onChange={(e) => handleInputChange(index, 'state', e.target.value)} placeholder="State code" /></td>
              <td className="text-center">
                <Button variant="danger" size="sm" onClick={() => handleRemoveRow(row.id)}>
                  <FaTrash />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Row className="mt-3">
        <Col xs={12} sm="auto" className="mb-2">
          <Button variant="success" onClick={handleAddRow} disabled={loadingFile || loadingCalc || loadingDownload}>
            <FaPlus className="me-1" /> Add Row
          </Button>
        </Col>
        <Col xs={12} sm="auto" className="mb-2 ms-sm-auto">
          <Button variant="primary" onClick={handleCalculate} disabled={loadingFile || loadingCalc || loadingDownload}>
            {loadingCalc ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" /> : <FaCalculator className="me-1" />}
            {loadingCalc ? 'Calculating...' : 'Calculate'}
          </Button>
        </Col>
      </Row>

      {results.length > 0 && (
        <div className="mt-5">
          <h5 className="mb-3">Results</h5>
          <Table bordered responsive size="sm">
            <thead>
              <tr>
                <th>From (Used)</th>
                <th>To (Used)</th>
                <th>Mode</th>
                <th>Distance (km)</th>
                <th>CO2 (kg)</th>
              </tr>
            </thead>
            <tbody>
              {results.map((res, idx) => (
                <tr key={idx}>
                  <td>{res.from}{' '}({res.fromUsed})</td>
                  <td>{res.to}{' '}({res.toUsed})</td>
                  <td>{res.mode}</td>
                  <td>{res.distance}</td>
                  <td>{res.co2}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <ToastContainer />
    </Container>
  );
}

export default App;
