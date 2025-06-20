const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

let locationMap = {};

function loadData() {
  const text = fs.readFileSync(path.join(__dirname,'data','cities1000.txt'), 'utf8');
  const recs = parse(text, {
    delimiter: ';',
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true
  });
  recs.forEach(r => {
    locationMap[r.name] = { lat: parseFloat(r.latitude), lon: parseFloat(r.longitude) };
  });
  console.log('Loaded', Object.keys(locationMap).length, 'locations');
}

function lookupLocation(name) {
  const loc = locationMap[name];
  if (!loc) throw new Error(`Unknown location: ${name}`);
  return loc;
}

module.exports = { loadData, lookupLocation };
