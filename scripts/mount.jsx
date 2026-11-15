import './domsetup.mjs';
const errors = []; console.error = (...a) => { errors.push(a.join(' ').slice(0,200)); };
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import App from '../src/App.jsx';


const root = createRoot(document.getElementById('root'));
const text = () => document.body.textContent;
const click = async (el) => act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
const wait = async (ms=50) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
const check = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) process.exitCode = 1; };

await act(async () => { root.render(React.createElement(App)); });
await wait(200);
check(text().includes('FieldShift') && text().includes('Local Soil & Market Discretion Preserved'), 'header + badge render');
check(document.querySelectorAll('.fs-pin').length === 1 || document.querySelector('.leaflet-container'), 'leaflet map mounted with divIcon marker');
check(text().includes('Adaptation Signal') && text().includes('Extreme Heat Months'), 'Tab 1 renders (KPIs + Adaptation Signal)');
check(text().includes('illustrative data'), 'fallback banner shown when offline');

const tabBtn = (label) => [...document.querySelectorAll('nav button')].find(b => b.textContent.includes(label));
await click(tabBtn('Crop Fit')); await wait();
check(text().includes('What NASA POWER can and cannot see') && document.querySelectorAll('h3').length >= 12, 'Tab 2: amber boundary callout + 12 crop cards');
await click(tabBtn('Economics')); await wait();
check(document.querySelectorAll('tbody tr').length === 12 && text().includes('National baselines, not your contracts'), 'Tab 3: 12 econ rows + disclaimer');
const before = text().match(/-?\$[\d,]+\/ha/g)?.[0];
await click([...document.querySelectorAll('button')].find(b => b.textContent.trim() === '> 100 km')); await wait();
check(text().includes('(High risk)'), 'Tab 3: >100 km flags potato perishability risk');
await click(tabBtn('Rotation')); await wait(100);
check(text().includes('Current Baseline') && text().includes('Climate & Pest Resilience Focus') && text().includes('Water-Smart') && text().includes('Profit & Nitrogen'), 'Tab 4: baseline + 3 strategy cards');
check(text().includes('Verify on Your Field') && text().includes('livestock grazing'), 'Tab 4: checklist + scope note');
const pillKansas = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Kansas Dryland'));
await click(pillKansas); await wait(150);
check(text().includes('dryland regime detected') && text().includes('Winter Wheat'), 'Preset click -> Kansas dryland, baseline = winter wheat');
const sel = document.querySelector('aside select');
check(sel.value === 'winter_wheat', 'current-crop dropdown follows preset');
console.log(errors.length ? 'console.error output:\n' + [...new Set(errors)].join('\n') : 'no console errors');
process.exit(process.exitCode ?? 0);
