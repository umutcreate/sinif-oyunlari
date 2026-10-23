// Supabase Yapılandırması (Aynı kaldı)
const SUPABASE_URL = 'https://jqsblnpimzfmdwdlynuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EsAdPppgttY3lI0Sjh_EPA_VQgtypJd';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TEACHER_UID = '914715bb-edbd-48cd-aa74-7d02ca8cade4';

let classes = [], tests = [], currentTestQuestions = [], currentQuestion = null;
let questionIndex = 0, score = 0, streak = 0, answered = false;
let gameToken = 0, currentGameClassId = null, currentGameTestId = null, currentScoreAttemptId = null;

const $ = id => document.getElementById(id);
function showPage(page) {
    $('game').classList.toggle('hidden', page !== 'game');
    $('teacher').classList.toggle('hidden', page !== 'teacher');
    $('gameNav').classList.toggle('active', page === 'game');
    $('teacherNav').classList.toggle('active', page === 'teacher');
}

// Başlangıç Yüklemeleri
async function init() {
    const { data, error } = await db.rpc('get_class_list');
    if (!error) {
        classes = data || [];
        const s = $('gameClass');
        s.innerHTML = '<option value="">Sınıf seç</option>';
        classes.forEach(c => s.add(new Option(c.class_name, c.class_id)));
    }
    await loadLeaderboard();
}

$('gameClass').addEventListener('change', async () => {
    const cid = Number($('gameClass').value), s = $('gameTest');
    s.innerHTML = '<option value="">Testler yükleniyor...</option>';
    s.disabled = true;
    if (!cid) return;
    const { data } = await db.rpc('get_class_tests', { selected_class_id: cid });
    s.innerHTML = '<option value="">Test seç</option>';
    if (data?.length) {
        data.forEach(t => s.add(new Option(t.test_name, t.test_id)));
        s.disabled = false;
    } else {
        s.innerHTML = '<option value="">Test atanmamış</option>';
    }
});

async function startGame() {
    const cid = Number($('gameClass').value), tid = Number($('gameTest').value);
    if (!cid || !tid) return alert('Sınıf ve test seçin.');
    await loadGame(cid, tid, null);
}

async function loadGame(cid, tid, attemptId) {
    gameToken++; const token = gameToken;
    currentGameClassId = cid; currentGameTestId = tid; currentScoreAttemptId = attemptId;
    questionIndex = 0; score = 0; streak = 0; answered = false;
    
    $('gameSetup').classList.add('hidden');
    $('leaderboardCard').classList.add('hidden');
    $('quiz').classList.remove('hidden');
    $('score').textContent = '0';
    $('streakCount').textContent = '0';
    
    const { data, error } = await db.rpc('get_assigned_test_questions', { selected_test_id: tid, selected_class_id: cid });
    if (token !== gameToken || error) return;
    currentTestQuestions = data.map(q => ({...q, question_data: typeof q.question_data === 'string' ? JSON.parse(q.question_data) : q.question_data}));
    showCurrentQuestion();
}

// UI YENİLEMESİ: Eğlenceli Soru Ekranı
function showCurrentQuestion() {
    answered = false;
    currentQuestion = currentTestQuestions[questionIndex];
    const className = classes.find(c => Number(c.class_id) === currentGameClassId)?.class_name || '';
    
    $('questionMeta').textContent = `${className} · Soru ${questionIndex + 1} / ${currentTestQuestions.length}`;
    $('questionText').textContent = currentQuestion.question_data?.question || '';
    $('progressFill').style.width = `${((questionIndex) / currentTestQuestions.length) * 100}%`;
    $('feedback').textContent = '';
    $('nextButton').classList.add('hidden');
    
    const box = $('answers');
    box.replaceChildren();
    
    const type = currentQuestion.question_type;
    const data = currentQuestion.question_data || {};

    if (['multiple_choice', 'multiple_select'].includes(type)) {
        // KAHOOT TARZI 4'LÜ GRID
        box.className = 'answers-grid';
        const styles = [
            { c: 'mcq-blue', s: '▲' }, { c: 'mcq-pink', s: '◆' }, 
            { c: 'mcq-yellow', s: '●' }, { c: 'mcq-green', s: '■' }
        ];
        (data.options || []).forEach((o, i) => {
            const btn = document.createElement('button');
            const style = styles[i % 4];
            btn.className = `mcq-btn ${style.c}`;
            btn.innerHTML = `<div class="shape">${style.s}</div> <span>${o.text}</span>`;
            btn.onclick = () => submitAnswer(o.id, btn);
            box.appendChild(btn);
        });
    } else {
        // DİĞER SORU TİPLERİ İÇİN (Fill in blanks vb.) INPUT + BUTON
        box.className = 'input-group';
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = 'Cevabını buraya yaz...';
        
        const btn = document.createElement('button');
        btn.className = 'primary';
        btn.textContent = 'Kontrol et';
        btn.onclick = () => submitAnswer(inp.value.trim(), btn);
        
        box.append(inp, btn);
    }
}

async function submitAnswer(answer, button) {
    if (answered || !answer) return;
    answered = true;
    
    let result, isCorrect;
    if (currentScoreAttemptId) {
        const res = await db.rpc('submit_class_score_answer', { p_attempt_id: currentScoreAttemptId, p_test_question_id: currentQuestion.id, p_submitted_answer: answer });
        result = res.data?.[0] || res.data;
    } else {
        const res = await db.rpc('check_assigned_test_answer', { selected_test_id: currentGameTestId, selected_class_id: currentGameClassId, selected_test_question_id: currentQuestion.id, submitted_answer: answer });
        result = res.data?.[0] || res.data;
    }

    isCorrect = result?.is_correct === true;
    
    if (isCorrect) {
        score += Number(result.points_awarded || currentQuestion.points || 10);
        streak++;
        $('score').textContent = score;
        $('streakCount').textContent = streak;
        button.style.transform = 'scale(1.05)';
        setTimeout(() => button.style.transform = 'scale(1)', 200);
    } else {
        streak = 0;
        $('streakCount').textContent = streak;
        button.style.opacity = '0.5';
    }
    
    $('progressFill').style.width = `${((questionIndex + 1) / currentTestQuestions.length) * 100}%`;
    $('nextButton').classList.remove('hidden');
}

async function nextQuestion() {
    if (questionIndex + 1 >= currentTestQuestions.length) {
        if (currentScoreAttemptId) {
            await db.rpc('finish_class_score_attempt', { p_attempt_id: currentScoreAttemptId });
            currentScoreAttemptId = null;
            await loadLeaderboard();
        }
        resetGameView();
    } else {
        questionIndex++;
        showCurrentQuestion();
    }
}

function resetGameView() {
    $('quiz').classList.add('hidden');
    $('gameSetup').classList.remove('hidden');
    $('leaderboardCard').classList.remove('hidden');
    gameToken++;
}

// UI YENİLEMESİ: Podyum Liderlik Tablosu
async function loadLeaderboard() {
    const { data } = await db.rpc('get_class_leaderboard');
    const box = $('leaderboard');
    box.replaceChildren();
    
    if (!data || !data.length) {
        box.innerHTML = '<p style="text-align:center; color:#64748b">Henüz sıralama yok.</p>';
        return;
    }

    // Podyum Konteyneri (İlk 3)
    const podium = document.createElement('div');
    podium.className = 'podium-container';
    
    const top3 = [data[1], data[0], data[2]]; // 2, 1, 3 sıralaması (Görsel dizilim)
    
    top3.forEach((row, i) => {
        if (!row) return;
        const step = document.createElement('div');
        const realRank = i === 1 ? 1 : (i === 0 ? 2 : 3);
        step.className = `podium-step step-${realRank}`;
        
        step.innerHTML = `
            ${realRank === 1 ? '<div class="crown">👑</div>' : ''}
            <div class="podium-name">
                <div>${row.class_name}</div>
                <div class="podium-score">${row.total_points} puan</div>
            </div>
            ${realRank}
        `;
        podium.appendChild(step);
    });
    box.appendChild(podium);

    // Geri Kalanlar Listesi (4 ve sonrası)
    if (data.length > 3) {
        const list = document.createElement('div');
        list.className = 'lb-list';
        data.slice(3).forEach((row, idx) => {
            const tr = document.createElement('div');
            tr.className = 'lb-row';
            tr.innerHTML = `
                <div><span class="lb-rank">${idx + 4}</span> ${row.class_name}</div>
                <div style="color:#8b5cf6">${row.completed_attempts} test</div>
                <div>${row.total_points}</div>
            `;
            list.appendChild(tr);
        });
        box.appendChild(list);
    }
}

// Başlatıcı
init();
