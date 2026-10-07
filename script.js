// ══════════════════════════════════
// STATE
// ══════════════════════════════════
const STORAGE_KEY = 'cbes-project-state-v1';

const state = {
  role: 'student',
  studentName: '',
  questions: [],
  answers: {},
  flags: new Set(),
  currentQ: 0,
  timer: null,
  timeLeft: 1800,
  examStart: null,
  tabSwitches: 0,
  copyAttempts: 0,
  securityLog: [],
  results: [],
  activeQuestions: [],
  config: {
    duration: 30,
    passScore: 60,
    code: '1234',
    tabSwitch: true,
    copyPaste: true,
    rightClick: true,
    shuffle: true,
    autoSubmit: true,
    fullscreen: false,
  }
};

// Default questions
const defaultQuestions = [
  { id:1, type:'mcq', text:'What is the value of π (pi) to two decimal places?', options:['3.12','3.14','3.16','3.18'], correct:'b', points:1 },
  { id:2, type:'mcq', text:'Which planet is closest to the Sun?', options:['Venus','Mars','Mercury','Earth'], correct:'c', points:1 },
  { id:3, type:'true-false', text:'The speed of light in a vacuum is approximately 300,000 km/s.', correct:'true', points:1 },
  { id:4, type:'mcq', text:'What is the chemical symbol for Gold?', options:['Go','Gd','Au','Ag'], correct:'c', points:2 },
  { id:5, type:'short', text:'Name the process by which plants make food using sunlight.', keywords:['photosynthesis'], points:2 },
  { id:6, type:'mcq', text:'Which data structure operates on LIFO (Last In First Out) principle?', options:['Queue','Stack','Tree','Graph'], correct:'b', points:1 },
  { id:7, type:'true-false', text:'HTML stands for HyperText Markup Language.', correct:'true', points:1 },
  { id:8, type:'mcq', text:'What is 15% of 200?', options:['25','30','35','20'], correct:'b', points:1 },
];

state.questions = [...defaultQuestions];
let correctAnswerKey = null;

function loadPersistentState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const saved = JSON.parse(raw);
    if (saved && typeof saved === 'object') {
      if (Array.isArray(saved.questions) && saved.questions.length) {
        state.questions = saved.questions;
      }
      if (saved.config && typeof saved.config === 'object') {
        state.config = { ...state.config, ...saved.config };
      }
      if (Array.isArray(saved.results)) {
        state.results = saved.results;
      }
    }
  } catch (error) {
    console.warn('Unable to restore project state:', error);
  }
}

function savePersistentState() {
  try {
    const payload = {
      questions: state.questions,
      results: state.results,
      config: state.config,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Unable to save project state:', error);
  }
}

// ══════════════════════════════════
// INIT
// ══════════════════════════════════
function init() {
  loadPersistentState();
  toggleTypeFields();
  updateAdminStats();
  renderQuestionsList();
}

// ══════════════════════════════════
// LOGIN
// ══════════════════════════════════
function switchRole(role) {
  state.role = role;
  document.querySelectorAll('.role-tab').forEach((t,i) => t.classList.toggle('active', i === (role==='student'?0:1)));
  document.getElementById('exam-select-wrap').style.display = role === 'student' ? 'block' : 'none';
}

function doLogin() {
  const name = document.getElementById('login-name').value.trim();
  const pass = document.getElementById('login-pass').value.trim();
  if (!name) return alert('Please enter your Matric number.');
  if (state.role === 'student') {
    if (pass !== state.config.code) return alert('Invalid access code. Try: 1234');
    state.studentName = name;
    startExam();
  } else {
    if (pass !== 'admin') return alert('Admin password: admin');
    showScreen('admin-screen');
    updateAdminStats();
  }
}

function logout() {
  clearInterval(state.timer);
  removeExamListeners();
  state.answers = {};
  state.flags = new Set();
  state.currentQ = 0;
  state.tabSwitches = 0;
  state.copyAttempts = 0;
  state.securityLog = [];
  document.getElementById('tab-count').textContent = '0';
  document.getElementById('copy-count').textContent = '0';
  showScreen('login-screen');
}

// ══════════════════════════════════
// SCREEN MANAGEMENT
// ══════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ══════════════════════════════════
// ADMIN
// ══════════════════════════════════
function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  btn.classList.add('active');
}

function toggleSetting(el) {
  el.classList.toggle('on');
  const map = { 'tog-tabswitch':'tabSwitch','tog-copypaste':'copyPaste','tog-rightclick':'rightClick','tog-shuffle':'shuffle','tog-autosubmit':'autoSubmit','tog-fullscreen':'fullscreen' };
  state.config[map[el.id]] = el.classList.contains('on');
  savePersistentState();
}

function saveConfig() {
  state.config.duration = parseInt(document.getElementById('cfg-duration').value) || 30;
  state.config.passScore = parseInt(document.getElementById('cfg-pass').value) || 60;
  state.config.code = document.getElementById('cfg-code').value || '1234';
  savePersistentState();
  alert('✅ Configuration saved!');
}

function updateAdminStats() {
  document.getElementById('stat-q').textContent = state.questions.length;
  document.getElementById('stat-taken').textContent = state.results.length;
  if (state.results.length) {
    const passes = state.results.filter(r => r.passed).length;
    document.getElementById('stat-pass').textContent = Math.round(passes/state.results.length*100)+'%';
    document.getElementById('stat-flags').textContent = state.results.reduce((a,r)=>a+(r.flags||0),0);
  }
  updateRecentActivity();
  updateResultsTable();
}

function updateRecentActivity() {
  const el = document.getElementById('recent-activity');
  if (!state.results.length) return;
  el.innerHTML = state.results.slice(-5).reverse().map(r => `
    <div class="q-item">
      <div class="q-num">${r.passed?'✓':'✗'}</div>
      <div class="q-content">
        <div class="q-text">${r.name}</div>
        <div class="q-meta">
          <span>Score: ${r.score}%</span>
          <span>Correct: ${r.correct}/${r.total}</span>
          <span>Flags: ${r.flags}</span>
        </div>
      </div>
      <div class="score-pill ${r.passed?'pass':'fail'}">${r.passed?'PASS':'FAIL'}</div>
    </div>
  `).join('');
}

function updateResultsTable() {
  const tbody = document.getElementById('results-tbody');
  if (!state.results.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);font-family:var(--mono);font-size:.8rem;padding:2rem">No results yet</td></tr>';
    return;
  }
  tbody.innerHTML = state.results.map((r,i) => `
    <tr>
      <td style="font-family:var(--mono);font-size:.75rem;color:var(--muted)">${i+1}</td>
      <td>${r.name}</td>
      <td><span class="score-pill ${r.passed?'pass':'fail'}">${r.score}%</span></td>
      <td style="font-family:var(--mono)">${r.correct}/${r.total}</td>
      <td style="font-family:var(--mono);font-size:.8rem;color:var(--muted)">${r.timeTaken}</td>
      <td class="flag-count">${r.flags > 0 ? '⚠️ '+r.flags : '—'}</td>
      <td><span class="score-pill ${r.passed?'pass':'fail'}">${r.passed?'PASSED':'FAILED'}</span></td>
    </tr>
  `).join('');
}

// ══════════════════════════════════
// QUESTION BUILDER
// ══════════════════════════════════
let selectedCorrect = null;
let selectedTF = null;
let qIdCounter = 100;

function setCorrect(letter) {
  selectedCorrect = letter;
  ['a','b','c','d'].forEach(l => {
    const m = document.getElementById('mark-'+l);
    m.textContent = l===letter ? '✓' : '○';
    m.classList.toggle('correct', l===letter);
  });
}

function setTF(val) {
  selectedTF = val;
  document.getElementById('tf-true').style.background = val==='true' ? 'rgba(0,229,160,.2)' : '';
  document.getElementById('tf-false').style.background = val==='false' ? 'rgba(255,77,77,.15)' : '';
}

function toggleTypeFields() {
  const type = document.getElementById('q-type').value;
  document.getElementById('mcq-options').style.display = type==='mcq' ? 'block' : 'none';
  document.getElementById('tf-options').style.display = type==='true-false' ? 'block' : 'none';
  document.getElementById('short-hint').style.display = type==='short' ? 'block' : 'none';
}

function resetQuestionBuilder() {
  document.getElementById('q-text').value = '';
  ['a','b','c','d'].forEach(l => {
    document.getElementById('opt-'+l).value = '';
    document.getElementById('mark-'+l).textContent = '○';
    document.getElementById('mark-'+l).classList.remove('correct');
  });
  document.getElementById('q-keywords').value = '';
  document.getElementById('q-points').value = '1';
  document.getElementById('q-type').value = 'mcq';
  selectedCorrect = null;
  selectedTF = null;
  toggleTypeFields();
}

function addQuestion() {
  const type = document.getElementById('q-type').value;
  const text = document.getElementById('q-text').value.trim();
  const points = parseInt(document.getElementById('q-points').value) || 1;
  if (!text) return alert('Please enter question text.');

  const q = { id: ++qIdCounter, type, text, points };

  if (type === 'mcq') {
    if (!selectedCorrect) return alert('Please mark a correct answer.');
    q.options = ['a','b','c','d'].map(l => document.getElementById('opt-'+l).value || 'Option '+l.toUpperCase());
    q.correct = selectedCorrect;
  } else if (type === 'true-false') {
    if (!selectedTF) return alert('Please select True or False as correct answer.');
    q.correct = selectedTF;
  } else {
    const kw = document.getElementById('q-keywords').value;
    q.keywords = kw.split(',').map(k=>k.trim().toLowerCase()).filter(Boolean);
  }

  state.questions.push(q);
  savePersistentState();
  renderQuestionsList();
  updateAdminStats();
  resetQuestionBuilder();
}

function deleteQuestion(id) {
  state.questions = state.questions.filter(q => q.id !== id);
  savePersistentState();
  renderQuestionsList();
  updateAdminStats();
}

function renderQuestionsList() {
  const el = document.getElementById('questions-list');
  if (!state.questions.length) {
    el.innerHTML = '<div class="q-item" style="opacity:.4"><div class="q-content"><div class="q-text" style="color:var(--muted)">No questions added yet.</div></div></div>';
    return;
  }
  el.innerHTML = state.questions.map((q,i) => `
    <div class="q-item">
      <div class="q-num">${i+1}</div>
      <div class="q-content">
        <div class="q-text">${q.text}</div>
        <div class="q-meta">
          <span>${q.type.toUpperCase()}</span>
          <span>${q.points} pt${q.points>1?'s':''}</span>
          ${q.type==='mcq' ? `<span>Answer: ${q.correct.toUpperCase()}</span>` : ''}
          ${q.type==='true-false' ? `<span>Answer: ${q.correct}</span>` : ''}
          ${q.type==='short' ? `<span>Keywords: ${(q.keywords||[]).join(', ')}</span>` : ''}
        </div>
      </div>
      <div class="q-actions">
        <div class="btn-icon" onclick="deleteQuestion(${q.id})">🗑</div>
      </div>
    </div>
  `).join('');
}

// ══════════════════════════════════
// EXAM
// ══════════════════════════════════
function startExam() {
  showScreen('exam-screen');
  document.getElementById('exam-title-display').textContent = document.getElementById('exam-select').selectedOptions[0].text;
  document.getElementById('student-name-display').textContent = state.studentName;

  // Shuffle if enabled
  let qs = [...state.questions];
  if (state.config.shuffle) qs = qs.sort(() => Math.random()-.5);
  state.activeQuestions = qs;

  state.currentQ = 0;
  state.answers = {};
  state.flags = new Set();
  state.examStart = Date.now();
  state.timeLeft = state.config.duration * 60;
  state.tabSwitches = 0;
  state.copyAttempts = 0;
  state.securityLog = [];

  renderNavGrid();
  renderCurrentQuestion();
  startTimer();
  applyAntiCheat();
}

function startTimer() {
  updateTimerDisplay();
  state.timer = setInterval(() => {
    state.timeLeft--;
    updateTimerDisplay();
    if (state.timeLeft <= 0) {
      clearInterval(state.timer);
      if (state.config.autoSubmit) submitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(state.timeLeft/60).toString().padStart(2,'0');
  const s = (state.timeLeft%60).toString().padStart(2,'0');
  const el = document.getElementById('exam-timer');
  el.textContent = `${m}:${s}`;
  el.className = 'exam-timer';
  if (state.timeLeft < 300) el.classList.add('warning');
  if (state.timeLeft < 60) el.classList.replace('warning','danger');
}

function renderCurrentQuestion() {
  const q = state.activeQuestions[state.currentQ];
  const total = state.activeQuestions.length;

  document.getElementById('q-counter').textContent = `Question ${state.currentQ+1} of ${total}`;
  document.getElementById('q-type-badge').textContent = q.type==='mcq'?'MCQ':q.type==='true-false'?'T/F':'Short';
  document.getElementById('q-pts-badge').textContent = `${q.points} pt${q.points>1?'s':''}`;
  document.getElementById('q-main-text').textContent = q.text;

  const area = document.getElementById('answer-area');

  if (q.type === 'mcq') {
    const opts = q.options || [];
    const letters = ['A','B','C','D'];
    const keys = ['a','b','c','d'];
    area.innerHTML = `<div class="options-list">${opts.map((o,i)=>`
      <button class="option-btn ${state.answers[q.id]===keys[i]?'selected':''}" onclick="selectMCQ('${keys[i]}', this, ${q.id})">
        <div class="opt-letter">${letters[i]}</div>
        <div class="opt-text">${o}</div>
      </button>
    `).join('')}</div>`;
  } else if (q.type === 'true-false') {
    area.innerHTML = `<div class="options-list">
      <button class="option-btn ${state.answers[q.id]==='true'?'selected':''}" onclick="selectTF('true', ${q.id})">
        <div class="opt-letter">T</div><div class="opt-text">True</div>
      </button>
      <button class="option-btn ${state.answers[q.id]==='false'?'selected':''}" onclick="selectTF('false', ${q.id})">
        <div class="opt-letter">F</div><div class="opt-text">False</div>
      </button>
    </div>`;
  } else {
    area.innerHTML = `<textarea class="text-answer" placeholder="Type your answer here..." oninput="saveTextAnswer(${q.id}, this.value)">${state.answers[q.id]||''}</textarea>`;
  }

  document.getElementById('btn-prev').disabled = state.currentQ === 0;
  document.getElementById('btn-next').style.display = state.currentQ < total-1 ? 'block' : 'none';
  document.getElementById('btn-submit').style.display = state.currentQ === total-1 ? 'block' : 'none';

  const flagBtn = document.getElementById('btn-flag');
  flagBtn.classList.toggle('flagged', state.flags.has(q.id));
  flagBtn.textContent = state.flags.has(q.id) ? '🚩 Flagged' : '🚩 Flag';

  updateNavGrid();
  updateProgress();
}

function selectMCQ(key, btn, qId) {
  document.querySelectorAll('.option-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  state.answers[qId] = key;
  updateNavGrid();
  updateProgress();
}

function selectTF(val, qId) {
  state.answers[qId] = val;
  renderCurrentQuestion();
}

function saveTextAnswer(qId, val) {
  state.answers[qId] = val;
  updateNavGrid();
  updateProgress();
}

function navigateQ(dir) {
  state.currentQ = Math.max(0, Math.min(state.activeQuestions.length-1, state.currentQ+dir));
  renderCurrentQuestion();
}

function goToQuestion(idx) {
  state.currentQ = idx;
  renderCurrentQuestion();
}

function flagQuestion() {
  const q = state.activeQuestions[state.currentQ];
  if (state.flags.has(q.id)) state.flags.delete(q.id);
  else state.flags.add(q.id);
  renderCurrentQuestion();
}

function renderNavGrid() {
  const grid = document.getElementById('q-nav-grid');
  grid.innerHTML = state.activeQuestions.map((_,i) =>
    `<div class="q-dot" id="qdot-${i}" onclick="goToQuestion(${i})">${i+1}</div>`
  ).join('');
}

function updateNavGrid() {
  state.activeQuestions.forEach((q,i) => {
    const dot = document.getElementById('qdot-'+i);
    if (!dot) return;
    dot.className = 'q-dot';
    if (i === state.currentQ) dot.classList.add('current');
    else if (state.flags.has(q.id)) dot.classList.add('flagged');
    else if (state.answers[q.id] !== undefined) dot.classList.add('answered');
  });
}

function updateProgress() {
  const answered = Object.keys(state.answers).length;
  document.getElementById('progress-answered').textContent = answered;
  document.getElementById('progress-total').textContent = state.activeQuestions.length;
}

// ══════════════════════════════════
// ANTI-CHEAT
// ══════════════════════════════════
function applyAntiCheat() {
  if (state.config.tabSwitch) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
  }
  if (state.config.copyPaste) {
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    document.addEventListener('cut', onCut);
    document.addEventListener('keydown', onKeydown);
  }
  if (state.config.rightClick) {
    document.addEventListener('contextmenu', onContextMenu);
  }
}

function removeExamListeners() {
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('blur', onWindowBlur);
  document.removeEventListener('copy', onCopy);
  document.removeEventListener('paste', onPaste);
  document.removeEventListener('cut', onCut);
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('contextmenu', onContextMenu);
}

function onVisibilityChange() {
  if (document.hidden && document.getElementById('exam-screen').classList.contains('active')) {
    flagCheating('tab-switch', 'Left exam tab / window hidden');
  }
}

function onWindowBlur() {
  if (document.getElementById('exam-screen').classList.contains('active')) {
    flagCheating('tab-switch', 'Window lost focus');
  }
}

function onCopy(e) { e.preventDefault(); flagCheating('copy', 'Attempted to copy text'); }
function onCut(e) { e.preventDefault(); flagCheating('copy', 'Attempted to cut text'); }
function onPaste(e) { e.preventDefault(); flagCheating('copy', 'Attempted to paste text'); }
function onContextMenu(e) { if (document.getElementById('exam-screen').classList.contains('active')) e.preventDefault(); }

function onKeydown(e) {
  if (!document.getElementById('exam-screen').classList.contains('active')) return;
  if ((e.ctrlKey||e.metaKey) && ['c','v','x','a','u','s'].includes(e.key.toLowerCase())) {
    e.preventDefault();
    flagCheating('copy', `Blocked keyboard shortcut: Ctrl+${e.key.toUpperCase()}`);
  }
  if (e.key === 'F12' || (e.ctrlKey && e.shiftKey && e.key==='I')) {
    e.preventDefault();
    flagCheating('devtools', 'Attempted to open DevTools');
  }
}

let overlayTimeout;
function flagCheating(type, message) {
  const ts = new Date().toLocaleTimeString();
  state.securityLog.push({ type, message, ts });

  if (type === 'tab-switch') {
    state.tabSwitches++;
    document.getElementById('tab-count').textContent = state.tabSwitches;
    const tabDot = document.getElementById('tab-dot');
    if (state.tabSwitches >= 3) { tabDot.className = 'sec-dot danger'; }
    else tabDot.className = 'sec-dot warn';
    showWarningOverlay(message, state.tabSwitches);
  } else if (type === 'copy') {
    state.copyAttempts++;
    document.getElementById('copy-count').textContent = state.copyAttempts;
  }
}

function showWarningOverlay(msg, count) {
  document.getElementById('overlay-msg').textContent = msg + ' This has been logged and will be visible in your result.';
  document.getElementById('overlay-count').textContent = count >= 3 ? `⚠️ WARNING: ${count} violations recorded. Further violations may result in disqualification.` : `Violation #${count} recorded.`;
  document.getElementById('cheat-overlay').classList.add('show');
  clearTimeout(overlayTimeout);
  overlayTimeout = setTimeout(dismissWarning, 8000);
}

function dismissWarning() {
  document.getElementById('cheat-overlay').classList.remove('show');
}

// ══════════════════════════════════
// SUBMIT & GRADE
// ══════════════════════════════════
function confirmSubmit() {
  const answered = Object.keys(state.answers).length;
  const total = state.activeQuestions.length;
  document.getElementById('submit-msg').textContent = `You have answered ${answered} of ${total} questions. Are you sure you want to submit?`;
  document.getElementById('submit-overlay').classList.add('show');
}

function submitExam() {
  document.getElementById('submit-overlay').classList.remove('show');
  document.getElementById('cheat-overlay').classList.remove('show');
  clearInterval(state.timer);
  removeExamListeners();

  const timeTaken = Math.round((Date.now() - state.examStart) / 1000);
  const mm = Math.floor(timeTaken/60).toString().padStart(2,'0');
  const ss = (timeTaken%60).toString().padStart(2,'0');

  let correct = 0, wrong = 0, skipped = 0;
  let totalPoints = 0, earnedPoints = 0;
  const reviewData = [];

  state.activeQuestions.forEach(q => {
    totalPoints += q.points;
    const ans = state.answers[q.id];
    let isCorrect = false;

    if (!ans) {
      skipped++;
      reviewData.push({ q, ans: null, isCorrect: false, skipped: true });
    } else if (q.type === 'mcq' || q.type === 'true-false') {
      isCorrect = ans === q.correct;
      if (isCorrect) { correct++; earnedPoints += q.points; }
      else wrong++;
      reviewData.push({ q, ans, isCorrect, skipped: false });
    } else {
      const kws = (q.keywords||[]);
      isCorrect = kws.length > 0 && kws.some(k => ans.toLowerCase().includes(k));
      if (isCorrect) { correct++; earnedPoints += q.points; }
      else wrong++;
      reviewData.push({ q, ans, isCorrect, skipped: false });
    }
  });

  const score = totalPoints > 0 ? Math.round(earnedPoints/totalPoints*100) : 0;
  const passed = score >= state.config.passScore;

  const result = {
    name: state.studentName,
    score,
    correct,
    wrong,
    total: state.activeQuestions.length,
    timeTaken: `${mm}:${ss}`,
    flags: state.tabSwitches + state.copyAttempts,
    passed,
  };

  state.results.push(result);
  savePersistentState();
  updateAdminStats();
  showResultsScreen(score, correct, wrong, skipped, passed, reviewData, mm, ss);
}

function showResultsScreen(score, correct, wrong, skipped, passed, reviewData, mm, ss) {
  showScreen('results-screen');

  document.getElementById('res-title').textContent = passed ? '🎉 Congratulations!' : 'Exam Completed';
  document.getElementById('res-sub').textContent = `${state.studentName} — ${passed?'You Passed!':'Keep practicing and try again.'} — Time: ${mm}:${ss}`;
  document.getElementById('res-correct').textContent = correct;
  document.getElementById('res-wrong').textContent = wrong;
  document.getElementById('res-skipped').textContent = skipped;
  document.getElementById('score-pct-text').textContent = score+'%';
  document.getElementById('score-pass-text').textContent = passed ? 'PASSED ✓' : 'FAILED ✗';

  const ring = document.getElementById('score-ring');
  const circum = 2 * Math.PI * 80;
  const offset = circum - (score/100)*circum;
  ring.style.stroke = passed ? 'url(#ring-grad)' : '#DC2626';
  setTimeout(() => ring.style.strokeDashoffset = offset, 100);

  if (state.securityLog.length) {
    document.getElementById('cheating-log').style.display = 'block';
    document.getElementById('cheat-items').innerHTML = state.securityLog.map(l => `
      <div class="cheat-item">
        <div class="cheat-icon">${l.type==='tab-switch'?'👁':'📋'}</div>
        <div>[${l.ts}] ${l.message}</div>
      </div>
    `).join('');
  } else {
    document.getElementById('cheating-log').style.display = 'none';
  }

  const letters = ['A','B','C','D'];
  const keys = ['a','b','c','d'];
  document.getElementById('review-list').innerHTML = reviewData.map((d,i) => {
    const cls = d.skipped ? 'skipped' : d.isCorrect ? 'correct' : 'wrong';
    let ansDisplay = '—', correctDisplay = '';
    if (d.q.type==='mcq') {
      const aIdx = keys.indexOf(d.ans);
      const cIdx = keys.indexOf(d.q.correct);
      ansDisplay = d.ans ? `${letters[aIdx]}. ${d.q.options[aIdx]||d.ans}` : '(skipped)';
      correctDisplay = `${letters[cIdx]}. ${d.q.options[cIdx]}`;
    } else if (d.q.type==='true-false') {
      ansDisplay = d.ans || '(skipped)';
      correctDisplay = d.q.correct;
    } else {
      ansDisplay = d.ans || '(skipped)';
      correctDisplay = (d.q.keywords||[]).join(', ');
    }
    return `
      <div class="review-item ${cls}">
        <div class="review-q">Q${i+1}. ${d.q.text}</div>
        <div class="review-answers">
          <div class="your-ans ${d.isCorrect?'ok':''}">Your Answer: ${ansDisplay}</div>
          ${!d.isCorrect ? `<div class="correct-ans">✓ Correct: ${correctDisplay}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ══════════════════════════════════
// START
// ══════════════════════════════════
init();
