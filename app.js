const SUPABASE_URL = 'https://jqsblnpimzfmdwdlynuh.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EsAdPppgttY3lI0Sjh_EPA_VQgtypJd';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const TEACHER_UID = '914715bb-edbd-48cd-aa74-7d02ca8cade4';

let classes = [], questionPool = [], tests = [], draftQuestions = [], currentTestQuestions = [], currentQuestion = null;
let questionIndex = 0, score = 0, streak = 0, answered = false, loadingQuestion = false, gameToken = 0;
let currentGameClassId = null, currentGameTestId = null, currentScoreAttemptId = null;
let activeScoreSessionId = null, activeScoreSessionCode = null;

const typeLabels = {
    multiple_choice: 'Çoktan seçmeli', true_false: 'Doğru / Yanlış', fill_in_the_blanks: 'Boşluk doldurma',
    word_order: 'Kelime sıralama', matching: 'Eşleştirme', multiple_select: 'Birden fazla doğru seçenek',
    sentence_completion: 'Cümle tamamlama', short_answer: 'Kısa cevap', translation: 'Çeviri', error_correction: 'Hata düzeltme'
};

const $ = id => document.getElementById(id);
function message(id, text) { if ($(id)) $(id).textContent = text; }

function showPage(page) {
    $('game')?.classList.toggle('hidden', page !== 'game');
    $('teacher')?.classList.toggle('hidden', page !== 'teacher');
    $('gameNav')?.classList.toggle('active', page === 'game');
    $('teacherNav')?.classList.toggle('active', page === 'teacher');
}

function fillSelect(id, items, placeholder) {
    const s = $(id);
    if (!s) return;
    s.replaceChildren();
    if (placeholder) { const o = document.createElement('option'); o.value = ''; o.textContent = placeholder; s.appendChild(o); }
    items.forEach(x => { const o = document.createElement('option'); o.value = x.class_id; o.textContent = x.class_name; s.appendChild(o); });
}

// --- INITIALIZATION & AUTH ---
async function init() {
    await loadClasses();
    await checkSession();
    await loadLeaderboard();
    renderNewQuestionFields();
}

async function loadClasses() {
    const { data, error } = await db.rpc('get_class_list');
    if (error) { message('globalMessage', 'Sınıflar yüklenemedi.'); console.error(error); return; }
    classes = data || [];
    fillSelect('gameClass', classes, 'Sınıf seç');
}

async function checkSession() {
    const { data } = await db.auth.getSession();
    updateTeacherView(data.session?.user?.id === TEACHER_UID);
}

function updateTeacherView(on) {
    $('loginCard')?.classList.toggle('hidden', on);
    $('adminPanel')?.classList.toggle('hidden', !on);
    if (on && classes.length) loadAdminData();
    if (!on) {
        activeScoreSessionId = null; activeScoreSessionCode = null;
        message('teacherSessionStatus', 'Aktif oturum yok.');
        if($('closeScoreSessionButton')) $('closeScoreSessionButton').disabled = true;
    }
}

$('loginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    message('loginMessage', 'Giriş yapılıyor...');
    const { data, error } = await db.auth.signInWithPassword({ email: $('email').value, password: $('password').value });
    if (error) { message('loginMessage', 'Giriş başarısız. Bilgileri kontrol et.'); return; }
    if (data.user?.id !== TEACHER_UID) {
        await db.auth.signOut();
        message('loginMessage', 'Bu hesap yetkili değil.');
        updateTeacherView(false); return;
    }
    message('loginMessage', '');
    updateTeacherView(true);
});

async function logout() { await db.auth.signOut(); updateTeacherView(false); message('loginMessage', 'Çıkış yapıldı.'); }

async function loadAdminData() {
    await loadQuestions();
    await loadTests();
    populateScoreSessionSelectors();
    await loadLeaderboard();
    await loadSessionHistory();
}

// --- TEACHER: QUESTION BANK ---
async function loadQuestions() {
    const { data, error } = await db.from('questions').select('id,class_id,question_text,option_a,option_b,option_c,option_d,correct_answer,created_at').order('id', { ascending: false });
    if (error) return console.error(error);
    questionPool = data || [];
    message('questionPoolCount', `${questionPool.length} soru`);
    renderQuestionList();
    renderQuestionPicker();
}

function renderQuestionList() {
    const list = $('questionList'); 
    if (!list) return; // Güvenlik kontrolü
    list.replaceChildren();
    
    if (!questionPool.length) { list.innerHTML = '<div style="color:var(--muted)">Henüz soru yok.</div>'; return; }
    questionPool.forEach(q => {
        const item = document.createElement('div');
        item.style = 'padding:15px; border:2px solid #e2e8f0; border-radius:12px; background:white;';
        item.innerHTML = `<p style="font-weight:800; margin:0 0 10px;">${q.question_text}</p>
            <div style="font-size:14px; color:#64748b; margin-bottom:10px;">A: ${q.option_a} | B: ${q.option_b} | C: ${q.option_c} | D: ${q.option_d} <br><strong style="color:var(--green)">Doğru: ${q.correct_answer}</strong></div>`;
        const actions = document.createElement('div'); actions.style.display = 'flex'; actions.style.gap = '10px';
        const eBtn = document.createElement('button'); eBtn.className = 'secondary'; eBtn.textContent = 'Düzenle'; eBtn.onclick = () => editQuestion(q);
        const dBtn = document.createElement('button'); dBtn.className = 'danger'; dBtn.textContent = 'Sil'; dBtn.onclick = () => deleteQuestion(q.id);
        actions.append(eBtn, dBtn); item.appendChild(actions); list.appendChild(item);
    });
}

function renderQuestionPicker(selected = []) {
    const box = $('testQuestionPicker'); 
    if (!box) return;
    box.replaceChildren();
    
    if (!questionPool.length) { box.innerHTML = '<div style="color:var(--muted)">Önce soru havuzuna soru ekle.</div>'; return; }
    questionPool.forEach(q => {
        const l = document.createElement('label'); l.style = 'display:flex; gap:10px; padding:10px; border-bottom:1px solid #e2e8f0; cursor:pointer; align-items:center;';
        const i = document.createElement('input'); i.type = 'checkbox'; i.name = 'testQuestion'; i.value = q.id; i.checked = selected.includes(Number(q.id));
        const s = document.createElement('div'); s.innerHTML = `<strong>${q.question_text}</strong> <small style="display:block; color:#64748b;">Doğru: ${q.correct_answer}</small>`;
        l.append(i, s); box.appendChild(l);
    });
}

$('questionForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    message('saveMessage', 'Kaydediliyor...');
    const id = $('questionId').value;
    const r = {
        question_text: $('questionInput').value.trim(), option_a: $('optionA').value.trim(),
        option_b: $('optionB').value.trim(), option_c: $('optionC').value.trim(),
        option_d: $('optionD').value.trim(), correct_answer: $('correctAnswer').value
    };
    const result = id ? await db.from('questions').update(r).eq('id', Number(id)) : await db.from('questions').insert({...r, class_id: classes[0]?.class_id || null});
    if (result.error) { message('saveMessage', 'Hata: ' + result.error.message); return; }
    message('saveMessage', 'Soru kaydedildi.');
    resetQuestionForm(); await loadQuestions();
});

function editQuestion(q) {
    if (!$('questionId')) return;
    $('questionId').value = q.id; $('questionInput').value = q.question_text;
    $('optionA').value = q.option_a; $('optionB').value = q.option_b; $('optionC').value = q.option_c; $('optionD').value = q.option_d;
    $('correctAnswer').value = q.correct_answer; $('formTitle').textContent = 'Soruyu düzenle';
    $('questionForm').scrollIntoView({ behavior: 'smooth' });
}
function resetQuestionForm() { $('questionForm')?.reset(); if($('questionId')) $('questionId').value = ''; message('formTitle', 'Çoktan seçmeli soru ekle'); message('saveMessage', ''); }

async function deleteQuestion(id) {
    if (tests.some(t => t.question_ids?.includes(Number(id)))) return alert('Bu soru bir testte kullanılıyor. Önce ilgili testten kaldır.');
    if (!confirm('Silmek istiyor musun?')) return;
    const { error } = await db.from('questions').delete().eq('id', id);
    if (error) alert(error.message); else { await loadQuestions(); await loadTests(); }
}

// --- TEACHER: TEST EDITOR (DRAFTS) ---
$('newQuestionType')?.addEventListener('change', renderNewQuestionFields);
function renderNewQuestionFields() {
    const type = $('newQuestionType')?.value, box = $('newQuestionFields'); 
    if (!box) return; 
    box.replaceChildren();
    
    const add = (label, id, placeholder = '', kind = 'text') => {
        const l = document.createElement('label'); l.textContent = label; l.style = "display:block; font-weight:bold; margin:10px 0 5px;";
        const i = document.createElement(kind === 'textarea' ? 'textarea' : 'input'); i.id = id; i.placeholder = placeholder; i.style = "width:100%; padding:10px; border-radius:8px; border:2px solid #e2e8f0; margin-bottom:10px;";
        if (kind !== 'textarea') i.type = kind; else i.style.minHeight = "80px";
        box.append(l, i); return i;
    };
    add('Soru metni', 'draftPrompt', 'Soru metnini yaz...', 'textarea');
    if (['multiple_choice', 'multiple_select'].includes(type)) {
        add('Seçenekler (her satıra bir seçenek)', 'draftOptions', 'A) ...\nB) ...\nC) ...\nD) ...', 'textarea');
        add('Doğru cevap', 'draftCorrect', type === 'multiple_select' ? 'A,C' : 'B');
    } else if (type === 'true_false') {
        const l = document.createElement('label'); l.textContent = 'Doğru cevap'; l.style = "display:block; font-weight:bold; margin:10px 0 5px;";
        const s = document.createElement('select'); s.id = 'draftCorrect'; s.style="width:100%; padding:10px; border-radius:8px; border:2px solid #e2e8f0;";
        s.add(new Option('Doğru', 'true')); s.add(new Option('Yanlış', 'false'));
        box.append(l, s);
    } else if (['fill_in_the_blanks', 'sentence_completion', 'short_answer', 'translation', 'error_correction'].includes(type)) {
        add('Doğru cevap', 'draftCorrect', 'Birden fazla kabul edilen cevabı | ile ayır');
    } else if (type === 'word_order') {
        add('Karışık kelimeler (virgülle ayır)', 'draftWords', 'I, study, English, every day');
        add('Doğru cümle', 'draftCorrect', 'I study English every day.');
    } else if (type === 'matching') {
        add('Eşleştirmeler (her satır sol | sağ)', 'draftPairs', 'wake up | uyanmak\nhave breakfast | kahvaltı yapmak', 'textarea');
        add('Doğru cevap (boş bırakılabilir)', 'draftCorrect', 'A-1, B-2');
    }
    add('Açıklama (isteğe bağlı)', 'draftExplanation', 'Kısa açıklama', 'textarea');
    add('Puan', 'draftPoints', '10', 'number'); 
    if($('draftPoints')) $('draftPoints').value = '10';
}

function parseOptions(text) {
    return text.split('\n').map(x => x.trim()).filter(Boolean).map((t, i) => {
        const m = t.match(/^([A-D])\s*[).:-]\s*(.*)$/i);
        return { id: m ? m[1].toUpperCase() : String.fromCharCode(65 + i), text: m ? m[2] : t };
    });
}

function addQuestionToDraft() {
    const type = $('newQuestionType')?.value, prompt = $('draftPrompt')?.value.trim();
    if (!prompt) return alert('Soru metnini yaz.');
    let data = { question: prompt }, answer = null;
    const val = id => $(id)?.value.trim() || '';
    
    if (['multiple_choice', 'multiple_select'].includes(type)) {
        data.options = parseOptions(val('draftOptions'));
        if (data.options.length < 2) return alert('En az iki seçenek gir.');
        const raw = val('draftCorrect');
        answer = type === 'multiple_select' ? raw.split(/[,|]/).map(x => x.trim().toUpperCase()).filter(Boolean) : raw.toUpperCase();
    } else if (type === 'true_false') { answer = val('draftCorrect') === 'true'; }
    else if (type === 'word_order') {
        data.words = val('draftWords').split(',').map(x => x.trim()).filter(Boolean); answer = val('draftCorrect');
        if (data.words.length < 2 || !answer) return alert('Kelime listesini ve doğru cümleyi gir.');
    } else if (type === 'matching') {
        data.pairs = val('draftPairs').split('\n').map(line => line.split('|').map(x => x.trim())).filter(a => a.length === 2 && a[0] && a[1]).map(([left, right]) => ({ left, right }));
        answer = val('draftCorrect') || data.pairs.map(p => ({ left: p.left, right: p.right }));
        if (data.pairs.length < 2) return alert('En az iki eşleştirme gir.');
    } else {
        const raw = val('draftCorrect');
        answer = ['fill_in_the_blanks', 'sentence_completion'].includes(type) ? raw.split('|').map(x => x.trim()).filter(Boolean) : raw;
        if (!raw) return alert('Doğru cevabı gir.');
    }
    
    draftQuestions.push({ id: 'q_' + Date.now(), type, question: data.question, question_data: data, correct_answer: answer, explanation: val('draftExplanation'), points: Math.max(1, Number(val('draftPoints')) || 10) });
    renderDraftQuestions(); clearQuestionDraftForm(false);
}

function renderDraftQuestions() {
    const box = $('draftQuestionList'); 
    if (!box) return;
    box.replaceChildren();
    
    if (!draftQuestions.length) { box.innerHTML = '<div style="color:var(--muted)">Henüz yeni soru eklenmedi.</div>'; return; }
    draftQuestions.forEach((q, i) => {
        const d = document.createElement('div'); d.style = 'padding:10px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;';
        d.innerHTML = `<div><strong>${i + 1}. ${q.question}</strong><br><small style="color:#64748b">${typeLabels[q.type]} · ${q.points} Puan</small></div>`;
        const a = document.createElement('button'); a.className = 'danger'; a.textContent = 'Kaldır'; a.onclick = () => { draftQuestions.splice(i, 1); renderDraftQuestions(); };
        d.appendChild(a); box.appendChild(d);
    });
}
function clearQuestionDraftForm(repaint = true) { if($('newQuestionType')) $('newQuestionType').value = 'multiple_choice'; renderNewQuestionFields(); if (repaint) renderDraftQuestions(); }

// --- TEACHER: TEST MANAGEMENT ---
$('testForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('testName').value.trim(), id = $('testId').value;
    const selected = [...document.querySelectorAll('input[name="testQuestion"]:checked')].map(x => Number(x.value));
    if (!selected.length && !draftQuestions.length) return message('testSaveMessage', 'Teste en az bir soru ekle.');
    
    message('testSaveMessage', 'Test kaydediliyor...');
    const meta = { name, description: $('testDescription').value.trim(), level: $('testLevel').value, topic: $('testTopic').value.trim(), language: $('testLanguage').value, duration_minutes: Math.max(1, Number($('testDuration').value) || 15), total_points: draftQuestions.reduce((s, q) => s + q.points, 0) + selected.length * 10, updated_at: new Date().toISOString() };
    let tid = id ? Number(id) : null;
    const result = id ? await db.from('tests').update(meta).eq('id', tid) : await db.from('tests').insert(meta).select('id').single();
    if (result.error) return message('testSaveMessage', 'Test kaydedilemedi: ' + result.error.message);
    if (!id) tid = Number(result.data.id);
    
    await db.from('test_questions').delete().eq('test_id', tid);
    const rows = [
        ...selected.map((qid, i) => ({ test_id: tid, question_id: qid, position: i + 1, question_type: 'multiple_choice', points: 10, question_data: {} })),
        ...draftQuestions.map((q, i) => ({ test_id: tid, question_id: null, position: selected.length + i + 1, question_type: q.type, question_data: q.question_data, correct_answer: q.correct_answer, explanation: q.explanation, points: q.points }))
    ];
    const { error: ie } = await db.from('test_questions').insert(rows);
    if (ie) return message('testSaveMessage', 'Sorular eklenemedi: ' + ie.message);
    
    message('testSaveMessage', `“${name}” başarıyla kaydedildi.`);
    resetTestForm(); await loadTests();
});

function resetTestForm() { $('testForm')?.reset(); if($('testId')) $('testId').value = ''; if($('testDuration')) $('testDuration').value = '15'; message('testFormTitle', 'Yeni test oluştur'); draftQuestions = []; renderDraftQuestions(); renderQuestionPicker(); clearQuestionDraftForm(false); message('testSaveMessage', ''); }

async function loadTests() {
    const { data, error } = await db.from('tests').select('id,name,description,created_at,level,topic,language,duration_minutes,total_points').order('id', { ascending: false });
    if (error) return console.error(error);
    tests = [];
    for (const t of (data || [])) {
        const [{ data: qs }, { data: cts }] = await Promise.all([ db.from('test_questions').select('*').eq('test_id', t.id).order('position'), db.from('class_tests').select('class_id').eq('test_id', t.id) ]);
        tests.push({ ...t, questions: qs || [], question_ids: (qs || []).filter(x => x.question_id !== null).map(x => Number(x.question_id)), question_count: (qs || []).length, class_ids: (cts || []).map(x => Number(x.class_id)) });
    }
    renderTestList();
}

function renderTestList() {
    const list = $('testList'); 
    if (!list) return;
    list.replaceChildren();
    
    if (!tests.length) { list.innerHTML = '<div style="color:var(--muted)">Henüz test yok.</div>'; return; }
    tests.forEach(t => {
        const d = document.createElement('div'); d.style = 'padding:15px; border:2px solid #e2e8f0; border-radius:12px; background:white;';
        d.innerHTML = `<h3 style="margin:0 0 5px;">${t.name}</h3><p style="color:#64748b; font-size:14px; margin:0 0 15px;">${t.level} · ${t.topic || 'Genel'} · ${t.question_count} Soru</p>`;
        
        const checks = document.createElement('div'); checks.style = 'display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px; background:#f8fafc; padding:10px; border-radius:8px;';
        classes.forEach(c => {
            const l = document.createElement('label'); l.style = 'display:flex; gap:5px; cursor:pointer;';
            const i = document.createElement('input'); i.type = 'checkbox'; i.name = 'assign-' + t.id; i.value = c.class_id; i.checked = t.class_ids.includes(Number(c.class_id));
            l.append(i, document.createTextNode(c.class_name)); checks.appendChild(l);
        });
        
        const a = document.createElement('div'); a.style = 'display:flex; gap:10px; flex-wrap:wrap;';
        const asBtn = document.createElement('button'); asBtn.className = 'primary'; asBtn.textContent = 'Atamaları Kaydet'; asBtn.onclick = () => saveTestAssignments(t.id);
        const edBtn = document.createElement('button'); edBtn.className = 'secondary'; edBtn.textContent = 'Düzenle'; edBtn.onclick = () => editTest(t);
        const exBtn = document.createElement('button'); exBtn.className = 'secondary'; exBtn.textContent = 'JSON İndir'; exBtn.onclick = () => downloadTest(t);
        const delBtn = document.createElement('button'); delBtn.className = 'danger'; delBtn.textContent = 'Sil'; delBtn.onclick = () => deleteTest(t.id);
        a.append(asBtn, edBtn, exBtn, delBtn); d.append(checks, a); list.appendChild(d);
    });
}

async function saveTestAssignments(id) {
    const selected = [...document.querySelectorAll(`input[name="assign-${id}"]:checked`)].map(x => Number(x.value));
    await db.from('class_tests').delete().eq('test_id', id);
    if (selected.length) await db.from('class_tests').insert(selected.map(class_id => ({ test_id: id, class_id })));
    alert('Sınıf atamaları güncellendi.'); await loadTests(); await loadClassTests();
}

function editTest(t) {
    if (!$('testId')) return;
    $('testId').value = t.id; $('testName').value = t.name; $('testDescription').value = t.description || '';
    $('testLevel').value = t.level || 'A1'; $('testTopic').value = t.topic || ''; $('testLanguage').value = t.language || 'en';
    $('testDuration').value = t.duration_minutes || 15; message('testFormTitle', 'Testi düzenle');
    renderQuestionPicker(t.question_ids);
    draftQuestions = (t.questions || []).filter(q => q.question_id === null).map(q => ({ id: 'db_' + q.id, type: q.question_type, question: q.question_data?.question || '', question_data: q.question_data || {}, correct_answer: q.correct_answer, explanation: q.explanation || '', points: q.points || 10 }));
    renderDraftQuestions(); $('testEditorCard')?.scrollIntoView({ behavior: 'smooth' });
}

async function deleteTest(id) {
    if (!confirm('Testi silmek istiyor musun?')) return;
    await db.from('tests').delete().eq('id', id);
    await loadTests(); await loadClassTests();
}

// --- JSON TOOLS ---
function toJsonTest(t) {
    const qs = (t.questions || []).sort((a, b) => a.position - b.position).map((q, i) => {
        if (q.question_id !== null) {
            const old = questionPool.find(x => Number(x.id) === Number(q.question_id));
            return { id: 'q' + (i + 1), type: 'multiple_choice', question: old?.question_text || q.question_data?.question || '', options: [{ id: 'A', text: old?.option_a || '' }, { id: 'B', text: old?.option_b || '' }, { id: 'C', text: old?.option_c || '' }, { id: 'D', text: old?.option_d || '' }], correct_answer: old?.correct_answer || 'A', explanation: q.explanation || '', points: q.points || 10 };
        }
        return { id: 'q' + (i + 1), type: q.question_type, question: q.question_data?.question || '', ...Object.fromEntries(Object.entries(q.question_data || {}).filter(([k]) => k !== 'question')), correct_answer: q.correct_answer, explanation: q.explanation || '', points: q.points || 10 };
    });
    return { schema_version: '1.0', test: { title: t.name, description: t.description || '', level: t.level || 'A1', topic: t.topic || '', language: t.language || 'en', duration_minutes: t.duration_minutes || 15, questions: qs } };
}
function downloadBlob(filename, text) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function downloadTest(t) { downloadBlob((t.name || 'test').replace(/[^a-z0-9-_]+/gi, '_') + '.json', JSON.stringify(toJsonTest(t), null, 2)); }
function exportSelectedTest() { const t = tests.find(x => Number(x.id) === Number($('testId')?.value)); if (t) downloadTest(t); else message('jsonMessage', 'Önce kaydedilmiş bir testi aç.'); }
function downloadJsonTemplate() {
    const sample = { schema_version: '1.0', test: { title: 'Örnek Test', questions: [{ id: 'q1', type: 'multiple_choice', question: 'Örnek Soru', options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }], correct_answer: 'A', points: 10 }] } };
    if($('jsonPreview')) $('jsonPreview').value = JSON.stringify(sample, null, 2); downloadBlob('ornek-test.json', JSON.stringify(sample, null, 2)); message('jsonMessage', 'Örnek indirildi.');
}
function validateJson(obj) { const t = obj?.test; if (!t || !t.title || !Array.isArray(t.questions) || !t.questions.length) throw Error('JSON geçersiz.'); return t; }
function importJsonFile() {
    const f = $('importFile')?.files?.[0]; if (!f) return message('jsonMessage', 'Dosya seçin.');
    const r = new FileReader(); r.onload = () => { if($('jsonPreview')) $('jsonPreview').value = String(r.result || ''); importJsonText(); }; r.readAsText(f);
}
async function importJsonText() {
    try {
        const t = validateJson(JSON.parse($('jsonPreview')?.value || '{}'));
        if($('testId')) $('testId').value = ''; 
        if($('testName')) $('testName').value = t.title; 
        if($('testDescription')) $('testDescription').value = t.description || ''; 
        if($('testLevel')) $('testLevel').value = t.level || 'A1'; 
        if($('testTopic')) $('testTopic').value = t.topic || ''; 
        if($('testDuration')) $('testDuration').value = t.duration_minutes || 15;
        
        draftQuestions = t.questions.map((q, i) => ({ id: 'import_' + i, type: q.type, question: q.question, question_data: Object.fromEntries(Object.entries(q).filter(([k]) => !['id', 'type', 'correct_answer', 'explanation', 'points'].includes(k))), correct_answer: q.correct_answer, explanation: q.explanation || '', points: Math.max(1, Number(q.points) || 10) }));
        document.querySelectorAll('input[name="testQuestion"]').forEach(i => i.checked = false); renderDraftQuestions(); message('testFormTitle', 'İçe aktarılan testi kaydet');
        $('testEditorCard')?.scrollIntoView(); message('jsonMessage', `${t.title} yüklendi. Testi Kaydet'e basın.`);
    } catch (e) { message('jsonMessage', 'Hata: ' + e.message); }
}

// --- GAME FLOW ---
$('gameClass')?.addEventListener('change', loadClassTests);
async function loadClassTests() {
    const cid = Number($('gameClass').value), s = $('gameTest');
    if (!s) return;
    s.innerHTML = '<option value="">Testler yükleniyor...</option>'; s.disabled = true;
    if (!cid) return;
    const { data } = await db.rpc('get_class_tests', { selected_class_id: cid });
    s.innerHTML = '<option value="">Test seç</option>';
    if (data?.length) { data.forEach(t => s.add(new Option(t.test_name, t.test_id))); s.disabled = false; message('gameSetupMessage', ''); } 
    else { s.innerHTML = '<option value="">Test atanmamış</option>'; message('gameSetupMessage', 'Bu sınıfa atanmış test yok.'); }
}

async function startGame() {
    const cid = Number($('gameClass')?.value), tid = Number($('gameTest')?.value);
    if (!cid || !tid) return alert('Sınıf ve test seçin.');
    await loadGame(cid, tid, null);
}

async function loadGame(cid, tid, attemptId) {
    gameToken++; const token = gameToken;
    currentGameClassId = cid; currentGameTestId = tid; currentScoreAttemptId = attemptId;
    questionIndex = 0; score = 0; streak = 0; answered = false;
    
    $('gameSetup')?.classList.add('hidden'); $('leaderboardCard')?.classList.add('hidden'); $('quiz')?.classList.remove('hidden');
    message('score', '0'); message('streakCount', '0'); message('feedback', '');
    
    const { data, error } = await db.rpc('get_assigned_test_questions', { selected_test_id: tid, selected_class_id: cid });
    if (token !== gameToken || error) return;
    currentTestQuestions = (data || []).map(q => ({ ...q, question_data: typeof q.question_data === 'string' ? JSON.parse(q.question_data) : q.question_data }));
    if (!currentTestQuestions.length) { message('questionText', 'Soru yok.'); return; }
    showCurrentQuestion();
}

function showCurrentQuestion() {
    answered = false;
    currentQuestion = currentTestQuestions[questionIndex];
    const className = classes.find(c => Number(c.class_id) === currentGameClassId)?.class_name || '';
    
    message('questionMeta', `${className} · Soru ${questionIndex + 1} / ${currentTestQuestions.length}`);
    message('questionText', currentQuestion.question_data?.question || '');
    if($('progressFill')) $('progressFill').style.width = `${((questionIndex) / currentTestQuestions.length) * 100}%`;
    message('feedback', ''); if($('feedback')) $('feedback').className = '';
    $('nextButton')?.classList.add('hidden');
    
    const box = $('answers'); 
    if (!box) return;
    box.replaceChildren();
    
    const type = currentQuestion.question_type, data = currentQuestion.question_data || {};

    if (type === 'multiple_choice') {
        box.className = 'answers-grid';
        const styles = [{c:'mcq-blue',s:'▲'}, {c:'mcq-pink',s:'◆'}, {c:'mcq-yellow',s:'●'}, {c:'mcq-green',s:'■'}];
        (data.options || []).forEach((o, i) => {
            const btn = document.createElement('button'); btn.className = `mcq-btn ${styles[i % 4].c}`;
            btn.innerHTML = `<div class="shape">${styles[i % 4].s}</div> <span>${o.text}</span>`;
            btn.onclick = () => submitAnswer(o.id, btn); box.appendChild(btn);
        });
    } 
    else if (type === 'multiple_select') {
        box.className = 'answers-grid';
        const styles = [{c:'mcq-blue',s:'▲'}, {c:'mcq-pink',s:'◆'}, {c:'mcq-yellow',s:'●'}, {c:'mcq-green',s:'■'}];
        (data.options || []).forEach((o, i) => {
            const btn = document.createElement('button'); btn.className = `mcq-btn ${styles[i % 4].c}`; btn.dataset.val = o.id;
            btn.innerHTML = `<div class="shape">${styles[i % 4].s}</div> <span>${o.text}</span>`; btn.style.opacity = '0.6';
            btn.onclick = () => { if (answered) return; btn.classList.toggle('selected'); btn.style.opacity = btn.classList.contains('selected') ? '1' : '0.6'; };
            box.appendChild(btn);
        });
        const submit = document.createElement('button'); submit.className = 'primary w-full mt-3'; submit.style.gridColumn = '1 / -1'; submit.textContent = 'Kontrol Et';
        submit.onclick = () => submitAnswer([...box.querySelectorAll('button.selected')].map(b => b.dataset.val), submit);
        box.appendChild(submit);
    }
    else if (type === 'true_false') {
        box.className = 'answers-grid';
        const tBtn = document.createElement('button'); tBtn.className = 'mcq-btn mcq-blue'; tBtn.innerHTML = `<div class="shape">✓</div> <span>Doğru</span>`; tBtn.onclick = () => submitAnswer(true, tBtn);
        const fBtn = document.createElement('button'); fBtn.className = 'mcq-btn mcq-pink'; fBtn.innerHTML = `<div class="shape">✕</div> <span>Yanlış</span>`; fBtn.onclick = () => submitAnswer(false, fBtn);
        box.append(tBtn, fBtn);
    }
    else if (type === 'word_order') {
        box.className = '';
        const words = [...(data.words || [])].sort(() => Math.random() - 0.5); const chosen = [];
        const sentenceBox = document.createElement('div'); sentenceBox.className = 'sentence-box'; sentenceBox.textContent = 'Kelimeleri sırasıyla seç...'; sentenceBox.style.color = '#94a3b8';
        const wordPool = document.createElement('div'); wordPool.className = 'word-pool';
        
        const renderSentence = () => {
            if(chosen.length === 0) { sentenceBox.textContent = 'Kelimeleri sırasıyla seç...'; sentenceBox.style.color = '#94a3b8'; } 
            else { sentenceBox.innerHTML = ''; chosen.forEach((item, i) => {
                    const span = document.createElement('span'); span.className = 'sentence-word'; span.textContent = item.w;
                    span.onclick = () => { if(answered) return; chosen.splice(i, 1); item.btn.disabled = false; renderSentence(); };
                    sentenceBox.appendChild(span);
            });}
        };

        words.forEach(w => {
            const btn = document.createElement('button'); btn.className = 'word-btn'; btn.textContent = w;
            btn.onclick = () => { if(answered) return; chosen.push({w: w, btn: btn}); btn.disabled = true; renderSentence(); };
            wordPool.appendChild(btn);
        });
        const submit = document.createElement('button'); submit.className = 'primary w-full'; submit.textContent = 'Cümleyi Kontrol Et';
        submit.onclick = () => submitAnswer(chosen.map(x=>x.w).join(' '), submit); box.append(sentenceBox, wordPool, submit);
    }
    else if (type === 'matching') {
        box.className = '';
        (data.pairs || []).forEach(p => {
            const row = document.createElement('div'); row.className = 'match-row';
            const left = document.createElement('div'); left.className = 'match-left'; left.textContent = p.left;
            const sel = document.createElement('select'); sel.dataset.left = p.left; sel.add(new Option('Seçim yap...', ''));
            (data.pairs || []).map(x => x.right).sort(() => Math.random() - 0.5).forEach(r => sel.add(new Option(r, r)));
            row.append(left, sel); box.appendChild(row);
        });
        const submit = document.createElement('button'); submit.className = 'primary w-full mt-3'; submit.textContent = 'Eşleştirmeleri Kontrol Et';
        submit.onclick = () => submitAnswer([...box.querySelectorAll('select')].map(s => ({left: s.dataset.left, right: s.value})), submit); box.appendChild(submit);
    }
    else {
        box.className = 'input-group';
        const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Cevabını buraya yaz...';
        const btn = document.createElement('button'); btn.className = 'primary'; btn.textContent = 'Kontrol et';
        btn.onclick = () => submitAnswer(inp.value.trim(), btn); box.append(inp, btn);
    }
}

async function submitAnswer(answer, button) {
    if (answered || answer === null || answer === '' || (Array.isArray(answer) && !answer.length)) return;
    answered = true;
    
    let data, error;
    if (currentScoreAttemptId) { ({ data, error } = await db.rpc('submit_class_score_answer', { p_attempt_id: currentScoreAttemptId, p_test_question_id: currentQuestion.id, p_submitted_answer: answer })); } 
    else { ({ data, error } = await db.rpc('check_assigned_test_answer', { selected_test_id: currentGameTestId, selected_class_id: currentGameClassId, selected_test_question_id: currentQuestion.id, submitted_answer: answer })); }

    if (error) { answered = false; message('feedback', error.code === '23505' ? 'Zaten cevaplanmış.' : 'Hata, tekrar dene.'); return; }

    const result = Array.isArray(data) ? data[0] : data;
    const isCorrect = result?.is_correct === true;
    const fb = $('feedback');

    if (isCorrect) {
        const earned = currentScoreAttemptId ? Number(result.points_awarded || 0) : Number(currentQuestion.points || 10);
        score += earned; streak++;
        message('score', score); message('streakCount', streak);
        button.style.transform = 'scale(1.05)'; setTimeout(() => button.style.transform = 'scale(1)', 200);
        if(fb) { fb.textContent = `Doğru cevap! +${earned} puan.`; fb.style.color = 'var(--green-dark)'; }
    } else {
        streak = 0; message('streakCount', streak); button.style.opacity = '0.5';
        if(fb) { fb.textContent = 'Yanlış cevap. ' + (result?.correct_answer ? 'Doğru: ' + formatAnswer(result.correct_answer) : ''); fb.style.color = '#dc2626'; }
    }
    if (result?.explanation && fb) fb.textContent += ' ' + result.explanation;
    
    if($('progressFill')) $('progressFill').style.width = `${((questionIndex + 1) / currentTestQuestions.length) * 100}%`;
    $('nextButton')?.classList.remove('hidden');
    message('nextButton', questionIndex === currentTestQuestions.length - 1 ? 'Sonuçları Gör ➔' : 'Sonraki Soru ➔');
}

function formatAnswer(a) {
    if (typeof a === 'string') return a;
    if (typeof a === 'boolean') return a ? 'Doğru' : 'Yanlış';
    if (Array.isArray(a)) return a.map(x => typeof x === 'object' ? `${x.left} ➔ ${x.right}` : x).join(', ');
    return JSON.stringify(a);
}

async function nextQuestion() {
    if (loadingQuestion) return; loadingQuestion = true;
    try {
        if (questionIndex + 1 >= currentTestQuestions.length) {
            if (currentScoreAttemptId) { await db.rpc('finish_class_score_attempt', { p_attempt_id: currentScoreAttemptId }); currentScoreAttemptId = null; await loadLeaderboard(); }
            message('questionText', 'Test tamamlandı!'); 
            if($('answers')) $('answers').replaceChildren();
            const fb = $('feedback'); if(fb) { fb.textContent = `Tebrikler! Toplam: ${score} Puan`; fb.style.color = 'var(--green-dark)'; }
            $('nextButton')?.classList.add('hidden');
            const done = document.createElement('button'); done.className = 'secondary w-full'; done.textContent = 'Ana Ekrana Dön'; done.onclick = resetGameView; $('answers')?.appendChild(done);
        } else { questionIndex++; showCurrentQuestion(); }
    } finally { loadingQuestion = false; }
}

function resetGameView() { $('quiz')?.classList.add('hidden'); $('gameSetup')?.classList.remove('hidden'); $('leaderboardCard')?.classList.remove('hidden'); gameToken++; }

// --- TEACHER: SESSIONS & LEADERBOARD ---
function populateScoreSessionSelectors() {
    const cs = $('scoreSessionClass'), ts = $('scoreSessionTest');
    if (cs) { cs.replaceChildren(new Option('Sınıf seç', '')); classes.forEach(c => cs.add(new Option(c.class_name, c.class_id))); }
    if (ts) { ts.replaceChildren(new Option('Test seç', '')); tests.forEach(t => ts.add(new Option(t.name, t.id))); }
}

async function startScoreSession() {
    const cid = Number($('scoreSessionClass')?.value), tid = Number($('scoreSessionTest')?.value);
    if (!cid || !tid) return message('teacherSessionStatus', 'Sınıf ve test seçin.');
    if($('startScoreSessionButton')) $('startScoreSessionButton').disabled = true; 
    message('teacherSessionStatus', 'Başlatılıyor...');
    
    try {
        const { data: sData } = await db.rpc('start_class_score_session', { p_class_id: cid, p_test_id: tid });
        const session = Array.isArray(sData) ? sData[0] : sData;
        const { data: aData } = await db.rpc('start_class_score_attempt_for_teacher', { p_session_id: session.session_id });
        const attempt = Array.isArray(aData) ? aData[0] : aData;
        
        activeScoreSessionId = session.session_id; currentScoreAttemptId = attempt.attempt_id;
        if($('closeScoreSessionButton')) $('closeScoreSessionButton').disabled = false; 
        $('teacherSessionMessage')?.classList.remove('hidden');
        message('teacherSessionMessage', 'Puanlı oturum aktif. Test tahtada açıldı.');
        message('teacherSessionStatus', `Oturum: ${classes.find(c => c.class_id == cid)?.class_name} · ${tests.find(t => t.id == tid)?.name}`);
        showPage('game'); await loadGame(cid, tid, attempt.attempt_id);
    } finally { if($('startScoreSessionButton')) $('startScoreSessionButton').disabled = false; }
}

async function closeScoreSession() {
    if (!activeScoreSessionId) return;
    await db.rpc('close_class_score_session', { p_session_id: activeScoreSessionId });
    activeScoreSessionId = null; 
    if($('closeScoreSessionButton')) $('closeScoreSessionButton').disabled = true; 
    $('teacherSessionMessage')?.classList.add('hidden');
    message('teacherSessionStatus', 'Oturum kapatıldı.'); await loadLeaderboard();
}

async function loadLeaderboard() {
    const { data } = await db.rpc('get_class_leaderboard');
    const boxes = [$('leaderboard'), $('teacherLeaderboard')].filter(Boolean);
    if (boxes.length === 0) return;
    
    boxes.forEach(box => {
        box.replaceChildren();
        if (!data || !data.length) { box.innerHTML = '<p style="text-align:center; color:#64748b">Henüz sıralama yok.</p>'; return; }
        
        const podium = document.createElement('div'); podium.className = 'podium-container';
        const top3 = [data[1], data[0], data[2]];
        top3.forEach((row, i) => {
            if (!row) return; const realRank = i === 1 ? 1 : (i === 0 ? 2 : 3);
            const step = document.createElement('div'); step.className = `podium-step step-${realRank}`;
            step.innerHTML = `${realRank === 1 ? '<div class="crown">👑</div>' : ''}<div class="podium-name"><div>${row.class_name}</div><div class="podium-score">${row.total_points} Puan</div></div>${realRank}`;
            podium.appendChild(step);
        });
        box.appendChild(podium);

        if (data.length > 3) {
            const list = document.createElement('div'); list.className = 'lb-list';
            data.slice(3).forEach((row, idx) => {
                const tr = document.createElement('div'); tr.className = 'lb-row';
                tr.innerHTML = `<div><span class="lb-rank">${idx + 4}</span> ${row.class_name}</div><div style="color:var(--blue)">${row.completed_attempts} Test</div><div>${row.total_points} Puan</div>`;
                list.appendChild(tr);
            });
            box.appendChild(list);
        }
    });
}

async function loadSessionHistory() {
    const box = $('sessionHistory'); 
    if (!box) return; 
    box.replaceChildren();
    
    const filter = $('historyFilter')?.value || 'all';
    const { data } = await db.rpc('get_class_score_session_history');
    const rows = (data || []).filter(r => filter === 'all' || (filter === 'active' ? r.is_active : !r.is_active));
    if (!rows.length) { box.innerHTML = '<div style="color:var(--muted)">Kayıt bulunamadı.</div>'; return; }
    rows.forEach(r => {
        const d = document.createElement('div'); d.style = 'padding:15px; border:2px solid #e2e8f0; border-radius:12px; display:flex; justify-content:space-between; align-items:center; background:white;';
        d.innerHTML = `<div><strong style="font-size:18px;">${r.class_name} · ${r.test_name}</strong><br><small style="color:#64748b">${formatHistoryDate(r.created_at)} | Tamamlanan: ${r.completed_attempts}</small><br><span style="background:${r.is_active ? '#dcfce7' : '#e2e8f0'}; color:${r.is_active ? '#166534' : '#475569'}; padding:4px 8px; border-radius:8px; font-size:12px; font-weight:bold; display:inline-block; margin-top:8px;">${r.is_active ? 'Aktif' : 'Kapatıldı'}</span></div><div style="text-align:right;"><div style="font-size:24px; font-weight:900; color:var(--navy);">${r.total_points}</div><small style="color:#64748b">Kazanılan Puan</small></div>`;
        box.appendChild(d);
    });
}

function formatHistoryDate(value) { if (!value) return '—'; const d = new Date(value); return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }); }

// --- ADMIN TABS ---
document.querySelectorAll('.admin-tab').forEach(btn => btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    
    // 1. İlgili panelleri gizle/göster (HTML5 niteliği yerine CSS sınıfını kullanarak)
    document.querySelectorAll('[data-admin-tab-panel]').forEach(panel => {
        panel.classList.toggle('hidden', panel.dataset.adminTabPanel !== tab);
    });
    
    // 2. Buton tasarımlarını aktifleştir/pasifleştir
    document.querySelectorAll('.admin-tab').forEach(b => {
        const act = b.dataset.tab === tab; 
        b.classList.toggle('active', act);
        if(act) { 
            b.style.background = 'white'; 
            b.style.borderColor = 'white'; 
            b.style.color = 'var(--navy)'; 
        } else { 
            b.style.background = 'transparent'; 
            b.style.borderColor = 'transparent'; 
            b.style.color = '#cbd5e1'; 
        }
    });
    
    // 3. İlgili sekmeye geçildiğinde verileri tazele
    if (tab === 'history') loadSessionHistory();
    if (tab === 'overview') loadLeaderboard();
}));
$('historyFilter')?.addEventListener('change', loadSessionHistory);

init();
