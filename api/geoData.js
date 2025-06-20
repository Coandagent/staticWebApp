const fs = require('fs'), path = require('path');
const { parse } = require('csv-parse/sync');
const cityIndex = new Map(), airportIndex = new Map(), portIndex = new Map();

function loadData() {
  // Load cities
  const tsv = fs.readFileSync(path.join(__dirname,'data/cities1000.txt'),'utf8');
  for(const line of tsv.split('\n')) {
    const cols = line.split('\t');
    if(cols.length<9) continue;
    const [ , name, , , lat, lon, , , country ] = cols;
    cityIndex.set(`${name.toLowerCase()},${country.toLowerCase()}`,{lat:+lat,lon:+lon});
  }
  // Load airports
  const airCsv = fs.readFileSync(path.join(__dirname,'data/airports.csv'),'utf8');
  parse(airCsv,{columns:true}).forEach(a=>{
    airportIndex.set(a.iata_code.toLowerCase(),{lat:+a.latitude_deg,lon:+a.longitude_deg});
    airportIndex.set(a.name.toLowerCase(),{lat:+a.latitude_deg,lon:+a.longitude_deg});
  });
  // Load ports
  const portCsv = fs.readFileSync(path.join(__dirname,'data/seaports.csv'),'utf8');
  parse(portCsv,{columns:true}).forEach(p=>{
    portIndex.set(p.UNLOCODE.toLowerCase(),{lat:+p.Latitude,lon:+p.Longitude});
    portIndex.set(p.Name.toLowerCase(),{lat:+p.Latitude,lon:+p.Longitude});
  });
}

function lookupLocation(input) {
  const key = input.trim().toLowerCase();
  if(airportIndex.has(key)) return airportIndex.get(key);
  if(portIndex.has(key)) return portIndex.get(key);
  if(cityIndex.has(key)) return cityIndex.get(key);
  const cityKey = Array.from(cityIndex.keys()).find(k=>k.startsWith(key+','));
  if(cityKey) return cityIndex.get(cityKey);
  throw new Error(`Unknown location: ${input}`);
}

module.exports = {loadData, lookupLocation};
