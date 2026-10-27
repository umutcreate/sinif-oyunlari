function showCurrentQuestion() {
    answered = false; currentQuestion = currentTestQuestions[questionIndex];
    const className = classes.find(c => Number(c.class_id) === currentGameClassId)?.class_name || '';
    message('questionMeta', `${className} · Soru ${questionIndex + 1} / ${currentTestQuestions.length}`);
    
    const type = currentQuestion.question_type, data = currentQuestion.question_data || {};
    let qText = data.question || '';
    
    // Boşluk doldurma (Inline Input) kontrolü
    const hasBlank = qText.includes('___') && !['multiple_choice', 'multiple_select', 'true_false', 'matching', 'word_order'].includes(type);
    
    const qtEl = $('questionText');
    if (qtEl) {
        qtEl.innerHTML = '';
        const textNode = document.createElement('span');
        if (hasBlank) {
            textNode.innerHTML = qText.replace(/_{3,}/g, '<input type="text" class="inline-input" id="inlineInput" autocomplete="off" placeholder="...">');
        } else {
            textNode.textContent = qText;
        }
        const ttsBtn = document.createElement('button'); ttsBtn.className = 'tts-btn'; ttsBtn.textContent = '🔊';
        ttsBtn.title = 'Sesli Oku'; ttsBtn.onclick = () => speakText(hasBlank ? qText.replace(/_{3,}/g, 'blank') : qText);
        qtEl.append(textNode, ttsBtn);
    }
    
    if($('progressFill')) $('progressFill').style.width = `${((questionIndex) / currentTestQuestions.length) * 100}%`;
    message('feedback', ''); if($('feedback')) $('feedback').className = '';
    $('nextButton')?.classList.add('hidden');
    
    const box = $('answers'); if (!box) return; box.replaceChildren();

    // 1. BOŞLUK DOLDURMA (Cümle İçi + Enter Tuşu)
    if (hasBlank) {
        box.className = '';
        const submit = document.createElement('button'); submit.className = 'primary w-full mt-3'; submit.textContent = 'Kontrol Et';
        const inlineInp = $('inlineInput');
        if (inlineInp) {
            inlineInp.addEventListener('keypress', (e) => { if (e.key === 'Enter') submit.click(); });
            setTimeout(() => inlineInp.focus(), 100);
        }
        submit.onclick = () => submitAnswer(inlineInp ? inlineInp.value.trim() : '', submit);
        box.appendChild(submit);
    }
    // 2. ÇOKTAN SEÇMELİ
    else if (type === 'multiple_choice') {
        box.className = 'answers-grid'; const styles = [{c:'mcq-blue',s:'▲'}, {c:'mcq-pink',s:'◆'}, {c:'mcq-yellow',s:'●'}, {c:'mcq-green',s:'■'}];
        (data.options || []).forEach((o, i) => {
            const btn = document.createElement('button'); btn.className = `mcq-btn ${styles[i % 4].c}`;
            btn.innerHTML = `<div class="shape">${styles[i % 4].s}</div> <span>${o.text}</span>`;
            btn.onclick = () => submitAnswer(o.id, btn); box.appendChild(btn);
        });
    } 
    // 3. ÇOKLU SEÇİM
    else if (type === 'multiple_select') {
        box.className = 'answers-grid'; const styles = [{c:'mcq-blue',s:'▲'}, {c:'mcq-pink',s:'◆'}, {c:'mcq-yellow',s:'●'}, {c:'mcq-green',s:'■'}];
        (data.options || []).forEach((o, i) => {
            const btn = document.createElement('button'); btn.className = `mcq-btn ${styles[i % 4].c}`; btn.dataset.val = o.id;
            btn.innerHTML = `<div class="shape">${styles[i % 4].s}</div> <span>${o.text}</span>`; btn.style.opacity = '0.7';
            btn.onclick = () => { if (answered) return; btn.classList.toggle('selected'); };
            box.appendChild(btn);
        });
        const submit = document.createElement('button'); submit.className = 'primary w-full mt-3'; submit.style.gridColumn = '1 / -1'; submit.textContent = 'Kontrol Et';
        submit.onclick = () => submitAnswer([...box.querySelectorAll('button.selected')].map(b => b.dataset.val), submit); box.appendChild(submit);
    } 
    // 4. DOĞRU / YANLIŞ
    else if (type === 'true_false') {
        box.className = 'answers-grid';
        const tBtn = document.createElement('button'); tBtn.className = 'mcq-btn mcq-blue'; tBtn.innerHTML = `<div class="shape">✓</div> <span>Doğru</span>`; tBtn.onclick = () => submitAnswer(true, tBtn);
        const fBtn = document.createElement('button'); fBtn.className = 'mcq-btn mcq-pink'; fBtn.innerHTML = `<div class="shape">✕</div> <span>Yanlış</span>`; fBtn.onclick = () => submitAnswer(false, fBtn);
        box.append(tBtn, fBtn);
    } 
    // 5. KELİME SIRALAMA
    else if (type === 'word_order') {
        box.className = ''; const words = [...(data.words || [])].sort(() => Math.random() - 0.5); const chosen = [];
        const sentenceBox = document.createElement('div'); sentenceBox.className = 'sentence-box'; sentenceBox.textContent = 'Kelimeleri sırasıyla seç...'; sentenceBox.style.color = '#94a3b8';
        const wordPool = document.createElement('div'); wordPool.className = 'word-pool';
        const renderSentence = () => {
            if(chosen.length === 0) { sentenceBox.textContent = 'Kelimeleri sırasıyla seç...'; sentenceBox.style.color = '#94a3b8'; } 
            else { sentenceBox.innerHTML = ''; chosen.forEach((item, i) => {
                const span = document.createElement('span'); span.className = 'sentence-word'; span.textContent = item.w;
                span.onclick = () => { if(answered) return; chosen.splice(i, 1); item.btn.disabled = false; renderSentence(); }; sentenceBox.appendChild(span);
            });}
        };
        words.forEach(w => {
            const btn = document.createElement('button'); btn.className = 'word-btn'; btn.textContent = w;
            btn.onclick = () => { if(answered) return; chosen.push({w: w, btn: btn}); btn.disabled = true; renderSentence(); }; wordPool.appendChild(btn);
        });
        const submit = document.createElement('button'); submit.className = 'primary w-full'; submit.textContent = 'Cümleyi Kontrol Et';
        submit.onclick = () => submitAnswer(chosen.map(x=>x.w).join(' '), submit); box.append(sentenceBox, wordPool, submit);
    } 
    // 6. EŞLEŞTİRME (YENİ DOKUN-BİRLEŞTİR)
    else if (type === 'matching') {
        box.className = '';
        const matchContainer = document.createElement('div'); matchContainer.className = 'match-container';
        const colLeft = document.createElement('div'); colLeft.className = 'match-col';
        const colRight = document.createElement('div'); colRight.className = 'match-col';
        const pairedList = document.createElement('div'); pairedList.className = 'paired-list';
        
        let leftItems = [...(data.pairs || [])].map(p => p.left).sort(() => Math.random() - 0.5);
        let rightItems = [...(data.pairs || [])].map(p => p.right).sort(() => Math.random() - 0.5);
        let activeLeft = null, activeRight = null, matches = [];
        
        const checkPair = () => {
            if (activeLeft && activeRight) {
                matches.push({left: activeLeft, right: activeRight});
                leftItems = leftItems.filter(x => x !== activeLeft); rightItems = rightItems.filter(x => x !== activeRight);
                activeLeft = null; activeRight = null;
            }
        };
        
        const renderMatching = () => {
            colLeft.replaceChildren(); colRight.replaceChildren(); pairedList.replaceChildren();
            leftItems.forEach(left => {
                const btn = document.createElement('button'); btn.className = 'match-btn'; btn.textContent = left;
                if(activeLeft === left) btn.classList.add('active');
                btn.onclick = () => { if(answered) return; activeLeft = left; checkPair(); renderMatching(); };
                colLeft.appendChild(btn);
            });
            rightItems.forEach(right => {
                const btn = document.createElement('button'); btn.className = 'match-btn'; btn.textContent = right;
                if(activeRight === right) btn.classList.add('active');
                btn.onclick = () => { if(answered) return; activeRight = right; checkPair(); renderMatching(); };
                colRight.appendChild(btn);
            });
            matches.forEach((m, idx) => {
                const item = document.createElement('div'); item.className = 'paired-item';
                item.innerHTML = `<span><strong>${m.left}</strong> ➔ <strong>${m.right}</strong></span>`;
                const del = document.createElement('button'); del.textContent = '✕';
                del.onclick = () => { if(answered) return; matches.splice(idx, 1); leftItems.push(m.left); rightItems.push(m.right); renderMatching(); };
                item.appendChild(del); pairedList.appendChild(item);
            });
        };
        
        renderMatching(); matchContainer.append(colLeft, colRight);
        const submit = document.createElement('button'); submit.className = 'primary w-full mt-3'; submit.textContent = 'Eşleştirmeleri Kontrol Et';
        submit.onclick = () => {
            if (leftItems.length > 0) return alert('Lütfen tüm kelimeleri eşleştirin.');
            submitAnswer(matches, submit);
        };
        box.append(matchContainer, pairedList, submit);
    } 
    // 7. DİĞERLERİ (Klasik Input - Enter Tuşu Destekli)
    else {
        box.className = 'input-group';
        const inp = document.createElement('input'); inp.type = 'text'; inp.placeholder = 'Cevabını buraya yaz...';
        const btn = document.createElement('button'); btn.className = 'primary'; btn.textContent = 'Kontrol Et';
        inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') btn.click(); });
        btn.onclick = () => submitAnswer(inp.value.trim(), btn); box.append(inp, btn);
        setTimeout(() => inp.focus(), 100);
    }
}
