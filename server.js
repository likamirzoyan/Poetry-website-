const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', true);

const ipVisitCounts = {};
const visitLogs = [];

app.use(async (req, res, next) => {
  if (req.path.endsWith('.css') || req.path.endsWith('.ico') || req.path.endsWith('.png')) {
    return next();
  }

  let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  if (clientIp.includes(',')) {
    clientIp = clientIp.split(',')[0].trim();
  }

  // If testing locally on localhost, fetch your REAL public IP from ipify
  if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || !clientIp) {
    try {
      const myIpResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 3000 });
      clientIp = myIpResponse.data.ip;
    } catch (e) {
      clientIp = '37.252.80.1'; // Backup Armenian IP if fetch fails
    }
  }

  ipVisitCounts[clientIp] = (ipVisitCounts[clientIp] || 0) + 1;

  let geoData = {
    city: 'Unknown City',
    region: 'Unknown Region',
    country: 'Unknown Country',
    org: 'Unknown ISP'
  };

  try {
    // Fetch geolocation using ipapi.co
    const response = await axios.get(`https://ipapi.co/${clientIp}/json/`, { timeout: 4000 });
    if (response.data && !response.data.error) {
      geoData = {
        city: response.data.city || 'Unknown City',
        region: response.data.region || 'Unknown Region',
        country: response.data.country_name || 'Unknown Country',
        org: response.data.org || 'Unknown ISP'
      };
    }
  } catch (error) {}

  const logEntry = {
    ip: clientIp,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    city: geoData.city,
    region: geoData.region,
    country: geoData.country,
    org: geoData.org,
    visitNumber: ipVisitCounts[clientIp]
  };

  visitLogs.unshift(logEntry);
  if (visitLogs.length > 500) visitLogs.pop();

  console.log('\n================ NEW VISITOR ================');
  console.log(`Time:        ${logEntry.timestamp}`);
  console.log(`Location:    ${logEntry.city}, ${logEntry.region}, ${logEntry.country}`);
  console.log(`IP Address:  ${logEntry.ip}`);
  console.log(`Total Hits:  ${logEntry.visitNumber} times from this IP`);
  console.log(`Page:        ${logEntry.path}`);
  console.log('=============================================\n');

  next();
});

// Serve static HTML/CSS files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Admin stats page route
app.get('/admin-stats', (req, res) => {
  let tableRows = visitLogs.map(log => `
    <tr>
      <td>${new Date(log.timestamp).toLocaleString()}</td>
      <td><strong>${log.city}</strong>, ${log.country}</td>
      <td><code>${log.ip}</code></td>
      <td>Hit #${log.visitNumber}</td>
      <td><code>${log.path}</code></td>
      <td>${log.org}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Site Analytics Dashboard</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 20px; background: #0f172a; color: #f8fafc; }
        h1 { margin-bottom: 5px; }
        p { color: #94a3b8; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; background: #1e293b; border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #334155; }
        th { background: #334155; color: #38bdf8; text-transform: uppercase; font-size: 12px; }
        tr:hover { background: #0f172a; }
        code { background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #f43f5e; }
      </style>
    </head>
    <body>
      <h1>Private Analytics Log</h1>
      <p>Real-time location logs and IP visit frequencies.</p>
      <table>
        <thead>
          <tr>
            <th>Timestamp</th>
            <th>Location</th>
            <th>IP Address</th>
            <th>Frequency</th>
            <th>Page Requested</th>
            <th>ISP / Network</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="6">No visits recorded yet.</td></tr>'}
        </tbody>
      </table>
    </body>
    </html>
  `;
  res.send(html);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`View live stats at http://localhost:${PORT}/admin-stats`);
});