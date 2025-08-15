
const tournamentListSection = document.getElementById('tournamentListSection');
const tournamentList = document.getElementById('tournamentList');
const refreshTournamentsBtn = document.getElementById('refreshTournamentsBtn');

const createTournamentSection = document.getElementById('createTournamentSection');
const tournamentNameInput = document.getElementById('tournamentName');
const teamsContainer = document.getElementById('teamsContainer');
const addTeamBtn = document.getElementById('addTeamBtn');
const createTournamentBtn = document.getElementById('createTournamentBtn');
const createError = document.getElementById('createError');

const currentTournamentSection = document.getElementById('currentTournamentSection');
const currentTournamentTitle = document.getElementById('currentTournamentTitle');
const backToListBtn = document.getElementById('backToListBtn');

const scheduleSection = document.getElementById('scheduleSection');
const scoreboardSection = document.getElementById('scoreboardSection');
const playoffSection = document.getElementById('playoffSection');
const scheduleContainer = document.getElementById('scheduleContainer');
const scoreboardTable = document.getElementById('scoreboardTable');
const playoffContainer = document.getElementById('playoffContainer');
const generatePlayoffBtn = document.getElementById('generatePlayoffBtn');

// Global state variables
let currentTournamentId = null;
let currentTournamentName = '';
let scheduleData = null;
let matchCount = 0;
let scoreboardData = null;

// Initialisation: populate tournament list and update remove button visibility
window.addEventListener('DOMContentLoaded', () => {
  updateRemoveButtons();
  loadTournamentList();
});

// Refresh tournaments list when the button is clicked
refreshTournamentsBtn.addEventListener('click', () => {
  loadTournamentList();
});

/**
 * Fetch the list of tournaments from the server and render them into
 * the tournament list section. Each tournament entry includes a
 * button to open that tournament. If no tournaments exist a
 * placeholder message is displayed.
 */
function loadTournamentList() {
  tournamentList.innerHTML = '';
  fetch('/tournaments')
    .then((res) => res.json())
    .then((data) => {
      if (!data || !Array.isArray(data.tournaments)) {
        tournamentList.innerHTML = '<li>Error loading tournaments.</li>';
        return;
      }
      if (data.tournaments.length === 0) {
        tournamentList.innerHTML = '<li>No tournaments found.</li>';
        return;
      }
      data.tournaments.forEach((t) => {
        const li = document.createElement('li');
        li.className = 'tournament-item';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'tournament-name';
        nameSpan.textContent = t.name;
        li.appendChild(nameSpan);
        const openBtn = document.createElement('button');
        openBtn.className = 'open-tournament-btn';
        openBtn.textContent = 'Open';
        openBtn.addEventListener('click', () => {
          openTournament(t.id, t.name);
        });
        li.appendChild(openBtn);
        tournamentList.appendChild(li);
      });
    })
    .catch((err) => {
      console.error(err);
      tournamentList.innerHTML = '<li>Error loading tournaments.</li>';
    });
}

/**
 * Create a new team input row. Each row contains a text input for
 * the team name, a file input for the logo and a remove button.
 * Removing a row updates the visibility of remove buttons.
 *
 * @returns {HTMLElement} The created row element.
 */
function createTeamRow() {
  const row = document.createElement('div');
  row.className = 'team-row';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'team-name-input';
  nameInput.placeholder = 'Team Name';
  const logoInput = document.createElement('input');
  logoInput.type = 'file';
  logoInput.accept = 'image/*';
  logoInput.className = 'team-logo-input';
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'remove-team-btn';
  removeBtn.textContent = 'Remove';
  removeBtn.addEventListener('click', () => {
    row.remove();
    updateRemoveButtons();
  });
  row.appendChild(nameInput);
  row.appendChild(logoInput);
  row.appendChild(removeBtn);
  return row;
}

/**
 * Update the visibility of remove buttons on team rows. If more than
 * one team row exists the remove buttons are shown; otherwise they
 * are hidden. Ensures the user cannot remove the last remaining row.
 */
function updateRemoveButtons() {
  const rows = teamsContainer.querySelectorAll('.team-row');
  rows.forEach((row) => {
    const btn = row.querySelector('.remove-team-btn');
    if (rows.length > 1) {
      btn.style.display = 'inline-block';
    } else {
      btn.style.display = 'none';
    }
  });
}

// Add another team row when requested
addTeamBtn.addEventListener('click', () => {
  const newRow = createTeamRow();
  teamsContainer.appendChild(newRow);
  updateRemoveButtons();
});

/**
 * Handle the creation of a new tournament. Gathers the tournament
 * name and team information (including logos). Validates that at
 * least two team names are provided. Logos are converted to
 * base64 data URLs. On success the tournament list is refreshed
 * and the new tournament is opened automatically.
 */
createTournamentBtn.addEventListener('click', async () => {
  createError.style.display = 'none';
  const name = tournamentNameInput.value.trim();
  if (!name) {
    createError.textContent = 'Please enter a tournament name.';
    createError.style.display = 'block';
    return;
  }
  const rows = teamsContainer.querySelectorAll('.team-row');
  const teamPromises = [];
  rows.forEach((row) => {
    const nameInput = row.querySelector('.team-name-input');
    const logoInput = row.querySelector('.team-logo-input');
    const teamName = nameInput.value.trim();
    if (teamName) {
      let promise;
      if (logoInput.files && logoInput.files[0]) {
        promise = readFileAsDataURL(logoInput.files[0])
          .then((dataUrl) => {
            return { name: teamName, logo: dataUrl };
          })
          .catch(() => {
            return { name: teamName, logo: null };
          });
      } else {
        promise = Promise.resolve({ name: teamName, logo: null });
      }
      teamPromises.push(promise);
    }
  });
  if (teamPromises.length < 2) {
    createError.textContent = 'Please enter at least two team names.';
    createError.style.display = 'block';
    return;
  }
  try {
    const teams = await Promise.all(teamPromises);
    const res = await fetch('/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, teams }),
    });
    const data = await res.json();
    if (data.error) {
      createError.textContent = data.error;
      createError.style.display = 'block';
    } else {
      // Reset form: clear tournament name and rebuild single empty team row
      tournamentNameInput.value = '';
      teamsContainer.innerHTML = '<h3>Teams</h3>';
      const firstRow = createTeamRow();
      teamsContainer.appendChild(firstRow);
      updateRemoveButtons();
      // Refresh tournament list and open the new tournament
      loadTournamentList();
      openTournament(data.id, data.name);
    }
  } catch (err) {
    console.error(err);
    createError.textContent = 'An error occurred while creating the tournament.';
    createError.style.display = 'block';
  }
});

/**
 * Convert a File object to a base64 data URL. Returns a promise
 * which resolves with the data URL or rejects on error.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Open a specific tournament by ID. Sets the current tournament
 * context, hides the list and create sections, shows the current
 * tournament section and loads the schedule and scoreboard. Any
 * previous state is reset.
 *
 * @param {string} id
 * @param {string} name
 */
function openTournament(id, name) {
  currentTournamentId = id;
  currentTournamentName = name;
  scheduleData = null;
  matchCount = 0;
  scoreboardData = null;
  // Update UI
  currentTournamentTitle.textContent = `Tournament: ${name}`;
  tournamentListSection.style.display = 'none';
  createTournamentSection.style.display = 'none';
  currentTournamentSection.style.display = 'block';
  // Clear previous contents
  scheduleContainer.innerHTML = '';
  scoreboardTable.innerHTML = '';
  playoffContainer.innerHTML = '';
  scheduleSection.style.display = 'none';
  scoreboardSection.style.display = 'none';
  playoffSection.style.display = 'none';
  // Fetch data
  loadSchedule();
  loadScoreboard();
}

// Handle returning to the tournament list
backToListBtn.addEventListener('click', () => {
  currentTournamentId = null;
  currentTournamentName = '';
  scheduleData = null;
  matchCount = 0;
  scoreboardData = null;
  scheduleContainer.innerHTML = '';
  scoreboardTable.innerHTML = '';
  playoffContainer.innerHTML = '';
  scheduleSection.style.display = 'none';
  scoreboardSection.style.display = 'none';
  playoffSection.style.display = 'none';
  tournamentListSection.style.display = 'block';
  createTournamentSection.style.display = 'block';
  currentTournamentSection.style.display = 'none';
  loadTournamentList();
});

/**
 * Load the round‑robin schedule for the current tournament and render
 * it. If the request fails a message is logged. Once loaded the
 * schedule section is displayed.
 */
function loadSchedule() {
  if (!currentTournamentId) return;
  fetch(`/tournaments/${currentTournamentId}/schedule`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || data.error) {
        console.error(data && data.error);
        return;
      }
      scheduleData = data.schedule;
      matchCount = computeMatchCount(scheduleData);
      renderSchedule(scheduleData);
      scheduleSection.style.display = 'block';
    })
    .catch((err) => console.error(err));
}

/**
 * Load the scoreboard for the current tournament. When loaded the
 * scoreboard is rendered, the schedule is updated to reflect any
 * recorded results, and the playoff section is updated accordingly.
 */
function loadScoreboard() {
  if (!currentTournamentId) return;
  fetch(`/tournaments/${currentTournamentId}/scoreboard`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || data.error) {
        console.error(data && data.error);
        return;
      }
      scoreboardData = data;
      renderScoreboard(data.scoreboard);
      scoreboardSection.style.display = 'block';
      updateScheduleFromScoreboard();
      updatePlayoffSection();
    })
    .catch((err) => console.error(err));
}

/**
 * Render the schedule into the schedule container. Each match row
 * includes inputs for entering scores and a button to submit or
 * edit those scores. Logos are included when available. Button
 * handlers call the appropriate API endpoints using the current
 * tournament ID.
 *
 * @param {Array<Array<{id: string, home: string, away: string}>>} schedule
 */
function renderSchedule(schedule) {
  scheduleContainer.innerHTML = '';
  if (!schedule) return;
  schedule.forEach((round, roundIndex) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'round';
    const header = document.createElement('div');
    header.className = 'round-header';
    header.textContent = `Round ${roundIndex + 1}`;
    roundDiv.appendChild(header);
    round.forEach((match) => {
      const matchDiv = document.createElement('div');
      matchDiv.className = 'match';
      matchDiv.dataset.id = match.id;
      matchDiv.dataset.hasResult = 'false';
      matchDiv.dataset.editing = 'false';
      // Team labels with logos when available
      const teamsEl = document.createElement('div');
      teamsEl.className = 'teams';
      if (scoreboardData && scoreboardData.scoreboard) {
        const h = scoreboardData.scoreboard[match.home];
        const a = scoreboardData.scoreboard[match.away];
        const hLogo = h && h.logo ? `<img src="${h.logo}" class="team-logo" alt="${escapeHtml(match.home)} logo">` : '';
        const aLogo = a && a.logo ? `<img src="${a.logo}" class="team-logo" alt="${escapeHtml(match.away)} logo">` : '';
        teamsEl.innerHTML = `${hLogo}${escapeHtml(match.home)} vs ${aLogo}${escapeHtml(match.away)}`;
      } else {
        teamsEl.textContent = `${match.home} vs ${match.away}`;
      }
      matchDiv.appendChild(teamsEl);
      // Inputs and submit/edit button
      const inputsDiv = document.createElement('div');
      inputsDiv.className = 'result-inputs';
      const homeInput = document.createElement('input');
      homeInput.type = 'number';
      homeInput.min = '0';
      homeInput.placeholder = '0';
      const awayInput = document.createElement('input');
      awayInput.type = 'number';
      awayInput.min = '0';
      awayInput.placeholder = '0';
      const button = document.createElement('button');
      button.textContent = 'Submit';
      button.className = 'submit-result-btn';
      button.addEventListener('click', () => {
        const hasResult = matchDiv.dataset.hasResult === 'true';
        const editing = matchDiv.dataset.editing === 'true';
        if (!hasResult) {
          const hVal = homeInput.value.trim();
          const aVal = awayInput.value.trim();
          if (hVal === '' || aVal === '') {
            alert('Please enter scores for both teams.');
            return;
          }
          const hScore = parseInt(hVal, 10);
          const aScore = parseInt(aVal, 10);
          if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
            alert('Scores must be non‑negative integers.');
            return;
          }
          button.disabled = true;
          homeInput.disabled = true;
          awayInput.disabled = true;
          fetch(`/tournaments/${currentTournamentId}/update-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: match.id, home: match.home, away: match.away, homeScore: hScore, awayScore: aScore }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error) {
                alert(data.error);
                button.disabled = false;
                homeInput.disabled = false;
                awayInput.disabled = false;
              } else {
                matchDiv.dataset.hasResult = 'true';
                matchDiv.dataset.editing = 'false';
                button.textContent = 'Edit';
                button.disabled = false;
                loadScoreboard();
              }
            })
            .catch((err) => {
              console.error(err);
              alert('An error occurred while submitting the result.');
              button.disabled = false;
              homeInput.disabled = false;
              awayInput.disabled = false;
            });
        } else {
          if (!editing) {
            matchDiv.dataset.editing = 'true';
            button.textContent = 'Save';
            homeInput.disabled = false;
            awayInput.disabled = false;
          } else {
            const hVal = homeInput.value.trim();
            const aVal = awayInput.value.trim();
            if (hVal === '' || aVal === '') {
              alert('Please enter scores for both teams.');
              return;
            }
            const hScore = parseInt(hVal, 10);
            const aScore = parseInt(aVal, 10);
            if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
              alert('Scores must be non‑negative integers.');
              return;
            }
            button.disabled = true;
            homeInput.disabled = true;
            awayInput.disabled = true;
            fetch(`/tournaments/${currentTournamentId}/update-score`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: match.id, home: match.home, away: match.away, homeScore: hScore, awayScore: aScore }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.error) {
                  alert(data.error);
                  button.disabled = false;
                  homeInput.disabled = false;
                  awayInput.disabled = false;
                } else {
                  matchDiv.dataset.hasResult = 'true';
                  matchDiv.dataset.editing = 'false';
                  button.textContent = 'Edit';
                  button.disabled = false;
                  loadScoreboard();
                }
              })
              .catch((err) => {
                console.error(err);
                alert('An error occurred while submitting the result.');
                button.disabled = false;
                homeInput.disabled = false;
                awayInput.disabled = false;
              });
          }
        }
      });
      inputsDiv.appendChild(homeInput);
      inputsDiv.appendChild(document.createTextNode(' - '));
      inputsDiv.appendChild(awayInput);
      inputsDiv.appendChild(button);
      matchDiv.appendChild(inputsDiv);
      roundDiv.appendChild(matchDiv);
    });
    scheduleContainer.appendChild(roundDiv);
  });
}

/**
 * Render the scoreboard as a table. Teams are sorted by points,
 * then goal difference, then goals scored. The first row is
 * highlighted by CSS. Logos appear before team names when
 * available.
 *
 * @param {Object} scoreboard The scoreboard data from the server.
 */
function renderScoreboard(scoreboard) {
  const rows = Object.keys(scoreboard).map((team) => {
    return { team, ...scoreboard[team] };
  });
  // Sort standings
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.team.localeCompare(b.team);
  });
  let html = '<thead><tr>';
  html += '<th>Team</th>';
  html += '<th>Played</th>';
  html += '<th>Wins</th>';
  html += '<th>Draws</th>';
  html += '<th>Losses</th>';
  html += '<th>GF</th>';
  html += '<th>GA</th>';
  html += '<th>GD</th>';
  html += '<th>Points</th>';
  html += '</tr></thead><tbody>';
  rows.forEach((row) => {
    html += '<tr>';
    const logoHtml = row.logo ? `<img src="${row.logo}" class="team-logo" alt="${escapeHtml(row.team)} logo">` : '';
    html += `<td>${logoHtml}${escapeHtml(row.team)}</td>`;
    html += `<td>${row.played}</td>`;
    html += `<td>${row.wins}</td>`;
    html += `<td>${row.draws}</td>`;
    html += `<td>${row.losses}</td>`;
    html += `<td>${row.goalsFor}</td>`;
    html += `<td>${row.goalsAgainst}</td>`;
    html += `<td>${row.goalDifference}</td>`;
    html += `<td>${row.points}</td>`;
    html += '</tr>';
  });
  html += '</tbody>';
  scoreboardTable.innerHTML = html;
}

/**
 * Escape HTML special characters to prevent injection. Converts
 * characters &, <, >, ", ' into their corresponding HTML entities.
 *
 * @param {string} unsafe
 * @returns {string}
 */
function escapeHtml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Compute the total number of matches in a schedule. Sums the
 * lengths of all rounds. Returns zero if the schedule is null.
 *
 * @param {Array} schedule
 * @returns {number}
 */
function computeMatchCount(schedule) {
  let count = 0;
  if (!schedule) return count;
  schedule.forEach((round) => {
    count += round.length;
  });
  return count;
}

/**
 * Update the schedule view based on existing recorded results. It
 * iterates through scoreboardData.results and populates the input
 * values, disables editing and updates the button text to "Edit".
 */
function updateScheduleFromScoreboard() {
  if (!scoreboardData || !scheduleData) return;
  if (!Array.isArray(scoreboardData.results)) return;
  scoreboardData.results.forEach((result) => {
    const matchEl = scheduleContainer.querySelector(`[data-id="${result.id}"]`);
    if (!matchEl) return;
    const inputs = matchEl.querySelectorAll('input[type="number"]');
    if (inputs.length === 2) {
      inputs[0].value = result.homeScore;
      inputs[1].value = result.awayScore;
      inputs[0].disabled = true;
      inputs[1].disabled = true;
    }
    const button = matchEl.querySelector('button');
    if (button) {
      button.textContent = 'Edit';
      button.disabled = false;
    }
    matchEl.dataset.hasResult = 'true';
    matchEl.dataset.editing = 'false';
  });
}

/**
 * Determine whether to show the knockout generation button or the
 * bracket itself. If a knockout bracket exists it is rendered,
 * otherwise the generate button is displayed only when the group
 * stage is complete and there are at least four teams.
 */
function updatePlayoffSection() {
  if (!scheduleData || !scoreboardData) {
    playoffSection.style.display = 'none';
    return;
  }
  if (scoreboardData.knockout) {
    playoffSection.style.display = 'block';
    generatePlayoffBtn.style.display = 'none';
    renderPlayoff(scoreboardData.knockout);
    return;
  }
  const completed = Array.isArray(scoreboardData.results) && scoreboardData.results.length === matchCount;
  const enoughTeams = Object.keys(scoreboardData.scoreboard || {}).length >= 4;
  if (completed && enoughTeams) {
    playoffSection.style.display = 'block';
    generatePlayoffBtn.style.display = 'block';
    playoffContainer.innerHTML = '';
  } else {
    playoffSection.style.display = 'none';
    generatePlayoffBtn.style.display = 'none';
  }
}

// Create playoffs when the button is clicked
generatePlayoffBtn.addEventListener('click', () => {
  if (!currentTournamentId) return;
  fetch(`/tournaments/${currentTournamentId}/generate-playoff`, { method: 'POST' })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) {
        alert(data.error);
      } else {
        scoreboardData.knockout = data.knockout;
        updatePlayoffSection();
      }
    })
    .catch((err) => {
      console.error(err);
      alert('An error occurred while generating playoffs.');
    });
});

/**
 * Render the knockout bracket. Displays semi‑finals and final with
 * inputs for entering and editing scores. Automatically updates the
 * bracket when results are entered and shows the champion after the
 * final is complete.
 *
 * @param {Object} knockout The knockout structure returned from the server.
 */
function renderPlayoff(knockout) {
  playoffContainer.innerHTML = '';
  if (!knockout) return;
  // Helper to create a knockout match element
  const createKnockoutMatch = (match) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'match';
    wrapper.dataset.id = match.id;
    wrapper.dataset.hasResult = match.homeScore !== null && match.awayScore !== null ? 'true' : 'false';
    wrapper.dataset.editing = 'false';
    const teamsEl = document.createElement('div');
    teamsEl.className = 'teams';
    if (scoreboardData && scoreboardData.scoreboard) {
      const h = scoreboardData.scoreboard[match.home];
      const a = scoreboardData.scoreboard[match.away];
      const hLogo = h && h.logo ? `<img src="${h.logo}" class="team-logo" alt="${escapeHtml(match.home)} logo">` : '';
      const aLogo = a && a.logo ? `<img src="${a.logo}" class="team-logo" alt="${escapeHtml(match.away)} logo">` : '';
      teamsEl.innerHTML = `${hLogo}${escapeHtml(match.home)} vs ${aLogo}${escapeHtml(match.away)}`;
    } else {
      teamsEl.textContent = `${match.home} vs ${match.away}`;
    }
    wrapper.appendChild(teamsEl);
    const inputsDiv = document.createElement('div');
    inputsDiv.className = 'result-inputs';
    const homeInput = document.createElement('input');
    homeInput.type = 'number';
    homeInput.min = '0';
    homeInput.placeholder = '0';
    const awayInput = document.createElement('input');
    awayInput.type = 'number';
    awayInput.min = '0';
    awayInput.placeholder = '0';
    if (match.homeScore !== null) homeInput.value = match.homeScore;
    if (match.awayScore !== null) awayInput.value = match.awayScore;
    if (wrapper.dataset.hasResult === 'true') {
      homeInput.disabled = true;
      awayInput.disabled = true;
    }
    const btn = document.createElement('button');
    btn.className = 'submit-result-btn';
    btn.textContent = wrapper.dataset.hasResult === 'true' ? 'Edit' : 'Submit';
    btn.addEventListener('click', () => {
      const hasResult = wrapper.dataset.hasResult === 'true';
      const editing = wrapper.dataset.editing === 'true';
      if (!hasResult) {
        const hVal = homeInput.value.trim();
        const aVal = awayInput.value.trim();
        if (hVal === '' || aVal === '') {
          alert('Please enter scores for both teams.');
          return;
        }
        const hScore = parseInt(hVal, 10);
        const aScore = parseInt(aVal, 10);
        if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
          alert('Scores must be non‑negative integers.');
          return;
        }
        btn.disabled = true;
        homeInput.disabled = true;
        awayInput.disabled = true;
        fetch(`/tournaments/${currentTournamentId}/update-knockout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: match.id, homeScore: hScore, awayScore: aScore }),
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.error) {
              alert(data.error);
              btn.disabled = false;
              homeInput.disabled = false;
              awayInput.disabled = false;
            } else {
              scoreboardData.knockout = data.knockout;
              wrapper.dataset.hasResult = 'true';
              wrapper.dataset.editing = 'false';
              btn.textContent = 'Edit';
              btn.disabled = false;
              renderPlayoff(scoreboardData.knockout);
            }
          })
          .catch((err) => {
            console.error(err);
            alert('An error occurred while submitting the result.');
            btn.disabled = false;
            homeInput.disabled = false;
            awayInput.disabled = false;
          });
      } else {
        if (!editing) {
          wrapper.dataset.editing = 'true';
          btn.textContent = 'Save';
          homeInput.disabled = false;
          awayInput.disabled = false;
        } else {
          const hVal = homeInput.value.trim();
          const aVal = awayInput.value.trim();
          if (hVal === '' || aVal === '') {
            alert('Please enter scores for both teams.');
            return;
          }
          const hScore = parseInt(hVal, 10);
          const aScore = parseInt(aVal, 10);
          if (isNaN(hScore) || isNaN(aScore) || hScore < 0 || aScore < 0) {
            alert('Scores must be non‑negative integers.');
            return;
          }
          btn.disabled = true;
          homeInput.disabled = true;
          awayInput.disabled = true;
          fetch(`/tournaments/${currentTournamentId}/update-knockout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: match.id, homeScore: hScore, awayScore: aScore }),
          })
            .then((res) => res.json())
            .then((data) => {
              if (data.error) {
                alert(data.error);
                btn.disabled = false;
                homeInput.disabled = false;
                awayInput.disabled = false;
              } else {
                scoreboardData.knockout = data.knockout;
                wrapper.dataset.hasResult = 'true';
                wrapper.dataset.editing = 'false';
                btn.textContent = 'Edit';
                btn.disabled = false;
                renderPlayoff(scoreboardData.knockout);
              }
            })
            .catch((err) => {
              console.error(err);
              alert('An error occurred while submitting the result.');
              btn.disabled = false;
              homeInput.disabled = false;
              awayInput.disabled = false;
            });
        }
      }
    });
    inputsDiv.appendChild(homeInput);
    inputsDiv.appendChild(document.createTextNode(' - '));
    inputsDiv.appendChild(awayInput);
    inputsDiv.appendChild(btn);
    wrapper.appendChild(inputsDiv);
    return wrapper;
  };
  // Semi‑finals heading
  const sfHeading = document.createElement('h4');
  sfHeading.textContent = 'Semi‑Finals';
  playoffContainer.appendChild(sfHeading);
  knockout.semiFinals.forEach((sf) => {
    const row = createKnockoutMatch(sf);
    playoffContainer.appendChild(row);
  });
  // Final heading and match
  if (knockout.final && knockout.final.home && knockout.final.away) {
    const finalHeading = document.createElement('h4');
    finalHeading.textContent = 'Final';
    playoffContainer.appendChild(finalHeading);
    const finalRow = createKnockoutMatch(knockout.final);
    playoffContainer.appendChild(finalRow);
    if (knockout.final.winner) {
      const champ = document.createElement('div');
      champ.className = 'champion';
      champ.textContent = `Champion: ${knockout.final.winner}`;
      champ.style.marginTop = '0.5rem';
      champ.style.fontWeight = 'bold';
      playoffContainer.appendChild(champ);
    }
  }
}