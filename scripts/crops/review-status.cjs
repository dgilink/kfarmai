#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ROOT } = require('./shared.cjs');

const file = path.join(ROOT, 'data', 'crops_mvp.json');
if (!fs.existsSync(file)) {
  console.error('data/crops_mvp.json not found. Run: node scripts/crops/seed-crops.cjs');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const tables = ['crops', 'crop_variants', 'crop_conditions', 'crop_calendar', 'crop_images', 'pest_disease_items'];
for (const table of tables) {
  const rows = data[table] || [];
  const counts = rows.reduce((acc, row) => {
    const status = row.status || 'none';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  console.log(`${table}: ${JSON.stringify(counts)}`);
}
