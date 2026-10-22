const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Simple .env parser
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    lines.forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let val = (match[2] || '').trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    });
  }
}
loadEnv();

const PORT = parseInt(process.env.PORT, 10) || 8080;
const LYZR_AGENT_ID = '6a951de7f54c69241a9a3d0c';
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.mp4': 'video/mp4',
  '.bin': 'application/octet-stream',
  '.svg': 'image/svg+xml',
};

// Natural language command parser for predefined simulation actions
function parseCommand(text) {
  if (!text) return null;
  const q = text.toLowerCase();
  
  // Depth targets
  const depthMatch = q.match(/(?:descend to|dive to|go to depth|set depth to|target depth)\s*(\d+)/i) ||
                     q.match(/(?:take me to|go to)\s*(\d+)\s*(?:m|meters)/i);
  if (depthMatch) {
    const d = parseInt(depthMatch[1], 10);
    if (!isNaN(d)) return { action: 'SET_TARGET_DEPTH', depth: Math.min(3000, Math.max(0, d)) };
  }
  
  if (/surface|go to surface|ascend to 0|rise to surface/i.test(q)) {
    return { action: 'GO_TO_SURFACE' };
  }
  
  // Named ocean locations
  if (/arabian sea/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'indian', locIndex: 0, name: 'India — Arabian Sea' };
  }
  if (/indian ocean/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'indian', locIndex: 1, name: 'Indian Ocean' };
  }
  if (/mariana/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'pacific', locIndex: 1, name: 'Mariana Trench' };
  }
  if (/great barrier|coral sea/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'pacific', locIndex: 0, name: 'Great Barrier Reef' };
  }
  if (/atlantic/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'atlantic', locIndex: 0, name: 'Atlantic Ocean' };
  }
  if (/pacific/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'pacific', locIndex: 0, name: 'Pacific Ocean' };
  }
  if (/mediterranean/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'mediterranean', locIndex: 0, name: 'Mediterranean Sea' };
  }
  if (/red sea/i.test(q)) {
    return { action: 'NAVIGATE_LOCATION', ocean: 'indian', locIndex: 2, name: 'Red Sea' };
  }

  // Coordinate navigation: "go to 15 N 72 E" or "15.0 N 72.5 E"
  const coordMatch = q.match(/([\d.]+)\s*([ns])\s*,?\s*([\d.]+)\s*([ew])/i);
  if (coordMatch) {
    let lat = parseFloat(coordMatch[1]) * (/s/i.test(coordMatch[2]) ? -1 : 1);
    let lon = parseFloat(coordMatch[3]) * (/w/i.test(coordMatch[4]) ? -1 : 1);
    return { action: 'NAVIGATE_COORDS', lat, lon };
  }

  // ROV directional movement commands
  if (/move forward|go forward/i.test(q)) return { action: 'ROV_MOVE', direction: 'forward', duration: 2000 };
  if (/move backward|go backward|move back/i.test(q)) return { action: 'ROV_MOVE', direction: 'backward', duration: 2000 };
  if (/move left|go left|strafe left/i.test(q)) return { action: 'ROV_MOVE', direction: 'left', duration: 2000 };
  if (/move right|go right|strafe right/i.test(q)) return { action: 'ROV_MOVE', direction: 'right', duration: 2000 };
  if (/rotate left|turn left/i.test(q)) return { action: 'ROV_MOVE', direction: 'rotateCCW', duration: 1500 };
  if (/rotate right|turn right/i.test(q)) return { action: 'ROV_MOVE', direction: 'rotateCW', duration: 1500 };
  if (/move up|ascend|go up/i.test(q)) return { action: 'ROV_MOVE', direction: 'up', duration: 2000 };
  if (/move down|descend|go down/i.test(q)) return { action: 'ROV_MOVE', direction: 'down', duration: 2000 };

  // Display panel commands
  if (/show waves|open waves|sea state|wave conditions/i.test(q)) return { action: 'OPEN_WAVES' };
  if (/show marine life|open marine life|creatures/i.test(q)) return { action: 'OPEN_MARINE_LIFE' };
  if (/show currents?|open currents?|current panel/i.test(q)) return { action: 'OPEN_CURRENT' };
  if (/show depth|depth panel|dive control/i.test(q)) return { action: 'OPEN_DEPTH' };
  if (/show temperature|temperature panel/i.test(q)) return { action: 'SHOW_SENSOR', sensor: 'temperature' };
  if (/show salinity|salinity panel/i.test(q)) return { action: 'SHOW_SENSOR', sensor: 'salinity' };
  if (/show oxygen|oxygen panel/i.test(q)) return { action: 'SHOW_SENSOR', sensor: 'oxygen' };
  if (/show weather|weather panel/i.test(q)) return { action: 'SHOW_SENSOR', sensor: 'weather' };
  if (/show storms?|nearby storms?/i.test(q)) return { action: 'SELECT_STORM' };
  if (/open analysis|show analysis|depth graph|temperature graph/i.test(q)) return { action: 'OPEN_ANALYZE' };
  if (/storm|take me to (?:the )?storm|nearest storm|explore storm/i.test(q)) return { action: 'SELECT_STORM' };
  if (/return to earth|back to earth|orbit/i.test(q)) return { action: 'RETURN_TO_EARTH' };
  
  return null;
}


// Fallback intelligent responder based strictly on live state context
function generateSimResponse(userMsg, context) {
  const q = userMsg.toLowerCase();
  const d = context.depth || 0;
  const loc = context.location || 'Global Ocean';
  const temp = context.temp !== undefined ? context.temp : 24.5;
  const sal = context.sal !== undefined ? context.sal : 35.0;
  const oxy = context.oxy !== undefined ? context.oxy : 6.2;
  const pres = context.pres !== undefined ? context.pres : 1;
  const cur = context.currentSpeed || 0;
  const curActive = !!context.currentActive;
  
  if (/how deep|what is my depth|current depth|depth/i.test(q)) {
    return `You are currently at ${Math.round(d)} meters depth at ${loc}. Hydrostatic pressure is approximately ${Math.round(pres)} atm.`;
  }
  if (/temperature|temp|how cold|how warm/i.test(q)) {
    return `The current water temperature at ${Math.round(d)}m depth is ${temp.toFixed(1)}°C. Temperature drops rapidly through the thermocline (100–1000m).`;
  }
  if (/salinity|sal/i.test(q)) {
    return `Measured salinity at this layer is ${sal.toFixed(1)} PSU. Typical open-ocean values range from 34 to 36 PSU.`;
  }
  if (/oxygen|o2/i.test(q)) {
    return `Dissolved oxygen concentration at ${Math.round(d)}m is ${oxy.toFixed(1)} mg/L.`;
  }
  if (/pressure/i.test(q)) {
    return `Ambient hydrostatic pressure at ${Math.round(d)}m is approximately ${Math.round(pres)} atm (increases by ~1 atm every 10 meters).`;
  }
  if (/current|flow/i.test(q)) {
    return curActive 
      ? `Ocean current is active: flowing at ${cur.toFixed(1)} knots. Notice particles and drifting marine life responding to the vector.`
      : `Current simulation is currently calm (0.0 kn). You can activate hydrodynamic currents from the Rover menu.`;
  }
  if (/organisms?|creatures?|fish|species|life|animals?|turtle|shark|jelly|angler/i.test(q)) {
    if (d < 80) return `In this sunlit epipelagic reef layer (${Math.round(d)}m), you can observe Blue Tangs, Yellow Tangs, Clownfish near reef structures, green sea turtles, and occasional reef sharks.`;
    if (d < 300) return `In the mid-water zone (${Math.round(d)}m), pelagic Yellowfin Tuna cruise swiftly and schools of Mackerel exhibit collective flocking behavior.`;
    if (d < 800) return `In the mesopelagic twilight zone (${Math.round(d)}m), sunlight is nearly extinguished. Moon jellyfish pulse gently with bioluminescent adaptations.`;
    return `In the bathypelagic midnight zone (${Math.round(d)}m), complete darkness reigns. Deep-sea Anglerfish utilize bioluminescent photophores to lure prey.`;
  }
  if (/storm|cyclone|typhoon|hurricane/i.test(q)) {
    return `Active storm tracking is enabled. Severe storms such as Cyclone Meera and Typhoon Solana influence wind speeds, wave heights, and barometric pressure.`;
  }
  if (/wave|sea state|height/i.test(q)) {
    return `Wave telemetry for ${loc}: Significant wave height is ${context.waveHeight || '1.8'}m with continuous hydrodynamic wave modeling.`;
  }
  if (/where am i|location|coordinates/i.test(q)) {
    return `You are currently stationed at ${loc} (Lat ${context.lat || 15}°, Lon ${context.lon || 68}°).`;
  }
  
  return `At ${loc} (${Math.round(d)}m depth): Temp ${temp.toFixed(1)}°C, Salinity ${sal.toFixed(1)} PSU, O₂ ${oxy.toFixed(1)} mg/L, Pressure ${Math.round(pres)} atm. Ask me about depth, marine life, ocean conditions, or give flight commands to the ROV.`;
}

// Forward request to Lyzr AI Agent API
function queryLyzrAgent(payload, apiKey, callback) {
  const bodyData = JSON.stringify({
    user_id: payload.user_id || 'oceanex-user',
    agent_id: LYZR_AGENT_ID,
    session_id: payload.session_id || 'oceanex-session-default',
    message: payload.message
  });

  const reqOptions = {
    hostname: 'agent-prod.studio.lyzr.ai',
    port: 443,
    path: '/v3/inference/chat/',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'Content-Length': Buffer.byteLength(bodyData)
    },
    timeout: 10000 // 10s timeout
  };

  const req = https.request(reqOptions, (res) => {
    let raw = '';
    res.on('data', chunk => { raw += chunk; });
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const json = JSON.parse(raw);
          const responseText = json.response || json.message || json.text || raw;
          callback(null, responseText);
        } catch (e) {
          callback(null, raw);
        }
      } else {
        callback(new Error(`Lyzr API returned status ${res.statusCode}: ${raw}`));
      }
    });
  });

  req.on('error', (err) => {
    callback(err);
  });

  req.on('timeout', () => {
    req.destroy();
    callback(new Error('Lyzr API request timed out'));
  });

  req.write(bodyData);
  req.end();
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Route: POST /api/ai/chat
  if (pathname === '/api/ai/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const userMsg = payload.message || '';
        const context = payload.context || {};
        const cmd = parseCommand(userMsg);

        const apiKey = (process.env.LYZR_API_KEY || '').trim();

        // Build comprehensive context prefix for AI
        const contextPrefix = `OCEANEX LIVE SIMULATION STATE:
Location: ${context.location || 'Indian Ocean'}
Coordinates: Lat ${context.lat || 15}°, Lon ${context.lon || 68}°
Depth: ${Math.round(context.depth || 0)}m
Target Depth: ${context.targetDepth ? Math.round(context.targetDepth) + 'm' : 'None'}
Temperature: ${context.temp !== undefined ? context.temp.toFixed(1) : '24.0'}°C
Salinity: ${context.sal !== undefined ? context.sal.toFixed(1) : '35.0'} PSU
Oxygen: ${context.oxy !== undefined ? context.oxy.toFixed(1) : '6.0'} mg/L
Pressure: ${context.pres !== undefined ? Math.round(context.pres) : '1'} atm
Current: ${context.currentActive ? (context.currentSpeed || 0).toFixed(1) + ' kn' : 'Calm / Off'}
Mode: ${context.mode || 'SPACE'}
Data Status: SIMULATED / DEMO

USER QUERY: ${userMsg}`;

        if (apiKey && apiKey.length > 5) {
          queryLyzrAgent({ ...payload, message: contextPrefix }, apiKey, (err, aiText) => {
            if (err) {
              console.warn('[Lyzr API fallback]:', err.message);
              const fallbackText = generateSimResponse(userMsg, context);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ response: fallbackText, command: cmd, source: 'simulation_assistant' }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ response: aiText, command: cmd, source: 'lyzr_ai' }));
            }
          });
        } else {
          // No API key set yet: provide rich simulation assistant response
          const simText = generateSimResponse(userMsg, context);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ response: simText, command: cmd, source: 'simulation_assistant' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body: ' + err.message }));
      }
    });
    return;
  }

  // Static File Serving
  if (pathname === '/' || pathname === '') pathname = '/Oceanex_Oceanix.html';
  const filePath = path.join(ROOT_DIR, decodeURIComponent(pathname));

  // Security: prevent directory traversal outside ROOT_DIR
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + pathname);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`OCEANEX server running on http://localhost:${PORT}/`);
  console.log(`Lyzr Agent ID: ${LYZR_AGENT_ID}`);
  console.log(`Lyzr API Key: ${process.env.LYZR_API_KEY ? 'Configured in .env' : 'Not configured (using simulation assistant fallback)'}`);
});
