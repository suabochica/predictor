import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = join(__dirname, '../players_rows.csv');

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
const players = lines.slice(1)
  .map(line => {
    const cols = line.split(',');
    return {
      id:       parseInt(cols[idx.id], 10),
      name:     cols[idx.name],
      position: cols[idx.position],
      country:  cols[idx.country],
    };
  })
  .filter(p => countrySet.has(p.country))
  .sort((a, b) => a.country.localeCompare(b.country) || a.name.localeCompare(b.name));

console.log(JSON.stringify(players, null, 2));
