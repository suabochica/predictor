import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '../players_rows.csv');
const tmpCsvPath = join(__dirname, '../.roster_tmp.csv');

const countries = process.argv.slice(2);
if (countries.length === 0) {
  console.error('Usage: node apps/fantasy/data/scripts/fetch_roster.mjs "Country1" "Country2"');
  process.exit(1);
}

const lines = readFileSync(csvPath, 'utf8').split('\n').filter(Boolean);
const headers = lines[0].split(',');
const idx = {
  id:       headers.indexOf('id'),
  name:     headers.indexOf('name'),
  position: headers.indexOf('position'),
  country:  headers.indexOf('country'),
};

const countrySet = new Set(countries);
const filteredLines = lines.slice(1).filter(line => {
  const cols = line.split(',');
  return countrySet.has(cols[idx.country]);
});

filteredLines.sort((a, b) => {
  const ca = a.split(',')[idx.country], cb = b.split(',')[idx.country];
  const na = a.split(',')[idx.name],   nb = b.split(',')[idx.name];
  return ca.localeCompare(cb) || na.localeCompare(nb);
});

writeFileSync(tmpCsvPath, [lines[0], ...filteredLines].join('\n') + '\n', 'utf8');

const players = filteredLines.map(line => {
  const cols = line.split(',');
  return {
    id:       parseInt(cols[idx.id], 10),
    name:     cols[idx.name],
    position: cols[idx.position],
    country:  cols[idx.country],
  };
});

console.log(JSON.stringify(players, null, 2));
