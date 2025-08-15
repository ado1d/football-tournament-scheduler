const http = require('http');
const fs = require('fs');
const path = require('path');

// Public assets directory for client files (HTML, CSS, JS) and uploaded logos
const publicDir = path.join(__dirname, 'public');
const uploadsDir = path.join(publicDir, 'uploads');
// Data directory stores tournament configurations (schedule, scoreboard, etc.)
const dataDir = path.join(__dirname, 'data');
const tournamentsFile = path.join(dataDir, 'tournaments.json');

// Ensure required directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
ensureDir(publicDir);
ensureDir(uploadsDir);
ensureDir(dataDir);

/**
 * Read the list of tournaments from disk. If no tournaments exist the
 * function returns an empty array. This file stores an array of
 * objects with `id`, `name` and `createdAt` properties.
 *
 * @returns {Array<{id:string,name:string,createdAt:string}>}
 */
function loadTournaments() {
  try {
    const data = fs.readFileSync(tournamentsFile, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return [];
  }
}

/**
 * Save the given list of tournaments to disk. The list should be an
 * array of objects with `id`, `name` and `createdAt` properties.
 *
 * @param {Array} list
 */
function saveTournaments(list) {
  try {
    fs.writeFileSync(tournamentsFile, JSON.stringify(list, null, 2));
  } catch (err) {
    console.error('Failed to save tournaments:', err);
  }
}

/**
 * Create a URL‑safe slug from a string. Lowercases the input and
 * replaces any non‑alphanumeric character with a hyphen. Multiple
 * hyphens are collapsed into one.
 *
 * @param {string} str
 * @returns {string}
 */
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a unique tournament ID based on the tournament name and
 * current timestamp. This ensures that two tournaments with the
 * same name will still have unique identifiers.
 *
 * @param {string} name
 * @returns {string}
 */
function generateTournamentId(name) {
  const slug = slugify(name);
  const ts = Date.now().toString(36);
  return `${slug}-${ts}`;
}

/**
 * Return the directory where the specified tournament's data is stored.
 *
 * @param {string} id
 * @returns {string}
 */
function getTournamentDir(id) {
  return path.join(dataDir, id);
}

/**
 * Paths to the schedule and scoreboard JSON files for a tournament.
 */
function getSchedulePath(id) {
  return path.join(getTournamentDir(id), 'schedule.json');
}
function getScoreboardPath(id) {
  return path.join(getTournamentDir(id), 'scoreboard.json');
}

/**
 * Generate a round‑robin schedule. See the previous implementation for details.
 * Each fixture includes an `id` computed from its round and match indices.
 *
 * @param {string[]} teams
 * @returns {Array<Array<{id: string, home: string, away: string}>>}
 */
function generateSchedule(teams) {
  const participants = teams.slice();
  if (participants.length % 2 === 1) participants.push(null);
  const n = participants.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const matches = [];
    for (let i = 0; i < n / 2; i++) {
      const home = participants[i];
      const away = participants[n - 1 - i];
      if (home && away) {
        matches.push({ id: `r${r}-m${i}`, home, away });
      }
    }
    rounds.push(matches);
    const last = participants.pop();
    participants.splice(1, 0, last);
  }
  return rounds;
}

/**
 * Create the initial scoreboard with statistical fields set to zero.
 * The `logos` argument is an optional object keyed by team name
 * pointing to a relative URL for each team's logo. If provided the
 * logo is stored alongside the statistics.
 *
 * @param {string[]} teams
 * @param {Object<string,string>} logos
 * @returns {Object}
 */
function createInitialScoreboard(teams, logos = {}) {
  const scoreboard = {};
  teams.forEach((team) => {
    scoreboard[team] = {
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      logo: logos[team] || null,
    };
  });
  return scoreboard;
}

/**
 * Save schedule JSON for a tournament.
 */
function saveSchedule(id, schedule) {
  ensureDir(getTournamentDir(id));
  try {
    fs.writeFileSync(getSchedulePath(id), JSON.stringify(schedule, null, 2));
  } catch (err) {
    console.error('Failed to save schedule:', err);
  }
}

/**
 * Load schedule for a tournament.
 */
function loadSchedule(id) {
  try {
    const data = fs.readFileSync(getSchedulePath(id), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/**
 * Save scoreboard for a tournament. Ensures knockout property exists.
 */
function saveScoreboard(id, data) {
  ensureDir(getTournamentDir(id));
  if (typeof data.knockout === 'undefined') data.knockout = null;
  try {
    fs.writeFileSync(getScoreboardPath(id), JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save scoreboard:', err);
  }
}

/**
 * Load scoreboard for a tournament.
 */
function loadScoreboard(id) {
  try {
    const data = fs.readFileSync(getScoreboardPath(id), 'utf8');
    return JSON.parse(data);
  } catch (err) {
    return null;
  }
}

/**
 * Apply a match result to a scoreboard object. Mutates the
 * scoreboard in place. Accepts an object with a `scoreboard` property.
 */
function applyMatchResult(data, home, away, homeScore, awayScore) {
  const ensureTeam = (team) => {
    if (!data.scoreboard[team]) {
      data.scoreboard[team] = {
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        logo: null,
      };
    }
  };
  ensureTeam(home);
  ensureTeam(away);
  const homeTeam = data.scoreboard[home];
  const awayTeam = data.scoreboard[away];
  homeTeam.played += 1;
  awayTeam.played += 1;
  homeTeam.goalsFor += homeScore;
  homeTeam.goalsAgainst += awayScore;
  awayTeam.goalsFor += awayScore;
  awayTeam.goalsAgainst += homeScore;
  homeTeam.goalDifference = homeTeam.goalsFor - homeTeam.goalsAgainst;
  awayTeam.goalDifference = awayTeam.goalsFor - awayTeam.goalsAgainst;
  if (homeScore > awayScore) {
    homeTeam.wins += 1;
    awayTeam.losses += 1;
    homeTeam.points += 3;
  } else if (homeScore < awayScore) {
    awayTeam.wins += 1;
    homeTeam.losses += 1;
    awayTeam.points += 3;
  } else {
    homeTeam.draws += 1;
    awayTeam.draws += 1;
    homeTeam.points += 1;
    awayTeam.points += 1;
  }
}

/**
 * Update (or create) a match result for a given tournament. The
 * scoreboard and results are recalculated from scratch to avoid
 * inconsistencies. Logos are preserved from the existing
 * scoreboard. Returns the updated scoreboard data or an error
 * message.
 *
 * @param {string} tournamentId
 * @param {Object} payload Contains id, home, away, homeScore, awayScore
 * @returns {{error?: string, data?: {scoreboard: Object, results: Array, knockout: any}}}
 */
function updateMatchResult(tournamentId, payload) {
  const data = loadScoreboard(tournamentId);
  if (!data) {
    return { error: 'No scoreboard found. Generate a schedule first.' };
  }
  const { id, home, away, homeScore, awayScore } = payload;
  if (!home || !away || home === away) {
    return { error: 'Invalid teams.' };
  }
  const hScore = parseInt(homeScore, 10);
  const aScore = parseInt(awayScore, 10);
  if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
    return { error: 'Scores must be non‑negative integers.' };
  }
  const matchId = id || `${home}-${away}`;
  // Remove existing result with same id if editing
  let existingIndex = -1;
  if (Array.isArray(data.results)) {
    existingIndex = data.results.findIndex((r) => r.id === matchId);
    if (existingIndex !== -1) {
      data.results.splice(existingIndex, 1);
    }
  } else {
    data.results = [];
  }
  data.results.push({ id: matchId, home, away, homeScore: hScore, awayScore: aScore });
  // Recalculate scoreboard. Gather teams from existing scoreboard and results
  const existingTeams = Object.keys(data.scoreboard || {});
  const teamSet = new Set(existingTeams);
  data.results.forEach((r) => {
    teamSet.add(r.home);
    teamSet.add(r.away);
  });
  const teams = Array.from(teamSet);
  const logos = {};
  // Preserve logos from existing scoreboard
  existingTeams.forEach((t) => {
    if (data.scoreboard[t] && data.scoreboard[t].logo) logos[t] = data.scoreboard[t].logo;
  });
  const newScoreboard = createInitialScoreboard(teams, logos);
  // Apply each result
  data.results.forEach((r) => {
    applyMatchResult({ scoreboard: newScoreboard }, r.home, r.away, r.homeScore, r.awayScore);
  });
  data.scoreboard = newScoreboard;
  saveScoreboard(tournamentId, data);
  return { data };
}

/**
 * Generate a knockout bracket (semi finals and final) for a
 * tournament. Requires the group stage to be complete and at least
 * four teams. Stores the bracket in the scoreboard.
 *
 * @param {string} tournamentId
 * @returns {{error?: string, knockout?: any}}
 */
function generatePlayoff(tournamentId) {
  const schedule = loadSchedule(tournamentId);
  const data = loadScoreboard(tournamentId);
  if (!schedule || !data) {
    return { error: 'No tournament data found.' };
  }
  if (data.knockout) {
    return { knockout: data.knockout };
  }
  // Count matches in schedule
  let totalMatches = 0;
  schedule.forEach((round) => {
    totalMatches += round.length;
  });
  if (!data.results || data.results.length < totalMatches) {
    return { error: 'Group stage is not yet complete.' };
  }
  const teams = Object.keys(data.scoreboard);
  if (teams.length < 4) {
    return { error: 'At least four teams are required for semi finals.' };
  }
  // Sort by points, goal difference, goals for
  const standings = teams.map((t) => ({ team: t, ...data.scoreboard[t] }));
  standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.localeCompare(b.team);
  });
  const top4 = standings.slice(0, 4).map((s) => s.team);
  const knockout = {
    semiFinals: [
      { id: 'sf1', home: top4[0], away: top4[3], homeScore: null, awayScore: null, winner: null },
      { id: 'sf2', home: top4[1], away: top4[2], homeScore: null, awayScore: null, winner: null },
    ],
    final: { id: 'final', home: null, away: null, homeScore: null, awayScore: null, winner: null },
  };
  data.knockout = knockout;
  saveScoreboard(tournamentId, data);
  return { knockout };
}

/**
 * Update a knockout match result for a tournament. If semi finals are
 * both decided the final pairing is automatically populated. If the
 * final is decided the winner is stored. In case of a draw the home
 * team advances by default (clients should avoid draws).
 *
 * @param {string} tournamentId
 * @param {Object} payload {id, homeScore, awayScore}
 * @returns {{error?: string, knockout?: any}}
 */
function updateKnockout(tournamentId, payload) {
  const data = loadScoreboard(tournamentId);
  if (!data || !data.knockout) {
    return { error: 'No knockout bracket found.' };
  }
  const { id, homeScore, awayScore } = payload;
  const h = parseInt(homeScore, 10);
  const a = parseInt(awayScore, 10);
  if (!id || isNaN(h) || isNaN(a) || h < 0 || a < 0) {
    return { error: 'Invalid knockout update payload.' };
  }
  let match;
  if (id === 'final') {
    match = data.knockout.final;
  } else {
    match = data.knockout.semiFinals.find((sf) => sf.id === id);
  }
  if (!match) {
    return { error: 'Match not found in knockout bracket.' };
  }
  match.homeScore = h;
  match.awayScore = a;
  if (h > a) {
    match.winner = match.home;
  } else if (h < a) {
    match.winner = match.away;
  } else {
    match.winner = match.home; // default winner on draw
  }
  // After semi finals set final teams
  if (id.startsWith('sf')) {
    const decided = data.knockout.semiFinals.every((sf) => sf.winner);
    if (decided && !data.knockout.final.home && !data.knockout.final.away) {
      data.knockout.final.home = data.knockout.semiFinals[0].winner;
      data.knockout.final.away = data.knockout.semiFinals[1].winner;
    }
  }
  // Save updated bracket
  saveScoreboard(tournamentId, data);
  return { knockout: data.knockout };
}

/**
 * Helper to parse JSON body of a request. Returns a promise.
 */
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const json = body ? JSON.parse(body) : {};
        resolve(json);
      } catch (err) {
        reject(err);
      }
    });
  });
}

/**
 * Decode a base64 data URL into a Buffer and determine the file extension.
 * Expects strings in the format `data:image/png;base64,<base64>`.
 * Returns `{ buffer, ext }` or null if the input is invalid.
 */
function decodeBase64Image(dataString) {
  if (!dataString) return null;
  const matches = dataString.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches || matches.length !== 3) {
    return null;
  }
  const mime = matches[1];
  const ext = mime.split('/')[1];
  const buffer = Buffer.from(matches[2], 'base64');
  return { buffer, ext };
}

/**
 * HTTP request handler. Routes incoming requests to the appropriate
 * operation based on the path and HTTP method. Supports tournament
 * management, match results, knockouts and static file serving.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function requestHandler(req, res) {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;
  const parts = pathname.split('/').filter((p) => p); // split path into components

  // Route: GET /tournaments -> list tournaments
  if (parts.length === 1 && parts[0] === 'tournaments' && method === 'GET') {
    const list = loadTournaments();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tournaments: list }));
    return;
  }
  // Route: POST /tournaments -> create new tournament
  if (parts.length === 1 && parts[0] === 'tournaments' && method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      const { name, teams } = payload;
      if (!name || !Array.isArray(teams) || teams.length < 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Tournament name and at least two teams are required.' }));
        return;
      }
      // Generate unique ID
      const id = generateTournamentId(name);
      // Prepare logos directory
      const tournamentUploadDir = path.join(uploadsDir, id);
      ensureDir(tournamentUploadDir);
      const teamNames = [];
      const logoMap = {};
      // Save each team logo
      for (const team of teams) {
        const teamName = String(team.name).trim();
        if (!teamName) continue;
        teamNames.push(teamName);
        if (team.logo) {
          const decoded = decodeBase64Image(team.logo);
          if (decoded) {
            const safeName = slugify(teamName);
            const filename = `${safeName}.${decoded.ext}`;
            const filePath = path.join(tournamentUploadDir, filename);
            fs.writeFileSync(filePath, decoded.buffer);
            logoMap[teamName] = `/uploads/${id}/${filename}`;
          }
        }
      }
      if (teamNames.length < 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'At least two valid team names are required.' }));
        return;
      }
      // Create tournament files
      const schedule = generateSchedule(teamNames);
      saveSchedule(id, schedule);
      const scoreboard = createInitialScoreboard(teamNames, logoMap);
      const scoreboardData = { scoreboard, results: [], knockout: null };
      saveScoreboard(id, scoreboardData);
      // Save tournament metadata
      const list = loadTournaments();
      list.push({ id, name, createdAt: new Date().toISOString() });
      saveTournaments(list);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, name }));
    } catch (err) {
      console.error(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
    }
    return;
  }
  // Routes under /tournaments/:id
  if (parts.length >= 2 && parts[0] === 'tournaments') {
    const tid = parts[1];
    // GET /tournaments/:id/schedule
    if (parts.length === 3 && parts[2] === 'schedule' && method === 'GET') {
      const schedule = loadSchedule(tid);
      if (!schedule) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Schedule not found.' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ schedule }));
      }
      return;
    }
    // GET /tournaments/:id/scoreboard
    if (parts.length === 3 && parts[2] === 'scoreboard' && method === 'GET') {
      const data = loadScoreboard(tid);
      if (!data) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Scoreboard not found.' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(data));
      }
      return;
    }
    // POST /tournaments/:id/update-score
    if (parts.length === 3 && parts[2] === 'update-score' && method === 'POST') {
      try {
        const payload = await parseRequestBody(req);
        const result = updateMatchResult(tid, payload);
        if (result.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, scoreboard: result.data.scoreboard, results: result.data.results }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
      }
      return;
    }
    // POST /tournaments/:id/generate-playoff
    if (parts.length === 3 && parts[2] === 'generate-playoff' && method === 'POST') {
      const result = generatePlayoff(tid);
      if (result.error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: result.error }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ knockout: result.knockout }));
      }
      return;
    }
    // GET /tournaments/:id/knockout
    if (parts.length === 3 && parts[2] === 'knockout' && method === 'GET') {
      const data = loadScoreboard(tid);
      if (!data || !data.knockout) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'No knockout bracket found.' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ knockout: data.knockout }));
      }
      return;
    }
    // POST /tournaments/:id/update-knockout
    if (parts.length === 3 && parts[2] === 'update-knockout' && method === 'POST') {
      try {
        const payload = await parseRequestBody(req);
        const result = updateKnockout(tid, payload);
        if (result.error) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: result.error }));
        } else {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ knockout: result.knockout }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload.' }));
      }
      return;
    }
  }
  // Static asset handling
  if (method === 'GET') {
    let filePath = pathname;
    if (filePath === '/' || filePath === '') {
      filePath = '/index.html';
    }
    const resolved = path.normalize(path.join(publicDir, filePath));
    // Prevent directory traversal outside of publicDir
    if (!resolved.startsWith(publicDir)) {
      res.writeHead(403);
      res.end('Access denied');
      return;
    }
    fs.readFile(resolved, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Not found');
      } else {
        const ext = path.extname(resolved).toLowerCase();
        const mime = getContentType(ext);
        res.writeHead(200, { 'Content-Type': mime });
        res.end(data);
      }
    });
    return;
  }
  // Default: not found
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
}

/**
 * Map file extensions to MIME types for static file serving.
 */
function getContentType(ext) {
  switch (ext) {
    case '.html': return 'text/html';
    case '.css': return 'text/css';
    case '.js': return 'application/javascript';
    case '.json': return 'application/json';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    default: return 'application/octet-stream';
  }
}

// Start the server
const port = process.env.PORT || 3000;
const server = http.createServer(requestHandler);
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});