// ==========================================
// 1. SUPABASE 雲端連線與帳號管理
// ==========================================
const SUPABASE_URL = 'https://ogcscxxiemcjsuxmgrfr.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9nY3NjeHhpZW1janN1eG1ncmZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1NzM5OTIsImV4cCI6MjEwNjE0OTk5Mn0.ZxybKrxdVwNdOZHnhy6tc-Xc7qFQgx7oE8YSFyOiCgs';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let PLAYER_ID = localStorage.getItem('calculus_player_id');
if (!PLAYER_ID) {
    PLAYER_ID = 'player_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('calculus_player_id', PLAYER_ID);
}

// ==========================================
// 2. 遊戲核心狀態與永久歷史紀錄變數
// ==========================================
let gold = 0;
let balls = [];
let ballValue = 1.0;
let spawnIntervalTime = 10000;
let correctAnswersCount = 0;
let unlockedLevels = 1;

let quizStats = {
    totalAnswered: 0,
    totalCorrect: 0,
    wrongQuestions: []
};

let prestigeData = {
    multiplier: 1.0,
    answerGrowthFactor: 1.4, // 預設初始答對成長倍率
    count: 0
};

function updatePlayerDisplay() {
    const userEl = document.getElementById('user-display');
    if (userEl) userEl.innerText = `目前玩家: ${PLAYER_ID}`;
}

// ==========================================
// 3. 本機快取備份與雲端同步 (Supabase)
// ==========================================
function saveGameLocally() {
    const saveData = {
        gold, unlockedLevels, ballValue, spawnIntervalTime,
        quizStats, prestigeData, correctAnswersCount
    };
    localStorage.setItem('calculus_save_' + PLAYER_ID, JSON.stringify(saveData));
}

function loadGameLocally() {
    try {
        const saved = localStorage.getItem('calculus_save_' + PLAYER_ID);
        if (saved) {
            const data = JSON.parse(saved);
            gold = data.gold || 0;
            unlockedLevels = data.unlockedLevels || 1;
            ballValue = data.ballValue || 1.0;
            spawnIntervalTime = data.spawnIntervalTime || 10000;
            quizStats = data.quizStats || { totalAnswered: 0, totalCorrect: 0, wrongQuestions: [] };
            prestigeData = data.prestigeData || { multiplier: 1.0, answerGrowthFactor: 1.4, count: 0 };
            correctAnswersCount = data.correctAnswersCount || 0;
            return true;
        }
    } catch (e) {
        console.error("讀取本機暫存失敗", e);
    }
    return false;
}

async function loadGame() {
    loadGameLocally();
    updatePlayerDisplay();
    updateLevelBoundaries();
    updateUI();

    try {
        const { data, error } = await supabaseClient
            .from('player_saves')
            .select('*')
            .eq('user_id', PLAYER_ID)
            .single();

        if (!error && data) {
            console.log("成功從雲端同步進度！");
            gold = data.gold || gold;
            unlockedLevels = data.level || unlockedLevels;
            ballValue = data.ball_value || ballValue;
            spawnIntervalTime = data.spawn_interval || spawnIntervalTime;
            quizStats.totalAnswered = data.total_answered || quizStats.totalAnswered;
            quizStats.totalCorrect = data.total_correct || quizStats.totalCorrect;
            quizStats.wrongQuestions = data.wrong_questions || quizStats.wrongQuestions;
            if (data.prestige_data) prestigeData = data.prestige_data;

            clearInterval(spawnerTimer);
            spawnerTimer = setInterval(spawnBall, spawnIntervalTime);
            updateLevelBoundaries();
            updateUI();
            saveGameLocally();
        }
    } catch (err) {
        console.log("使用本機快取模式運行");
    }
}

async function saveGameToCloud() {
    saveGameLocally();

    try {
        await supabaseClient
            .from('player_saves')
            .upsert({
                user_id: PLAYER_ID,
                level: unlockedLevels,
                gold: gold,
                ball_value: ballValue,
                spawn_interval: spawnIntervalTime,
                total_answered: quizStats.totalAnswered,
                total_correct: quizStats.totalCorrect,
                wrong_questions: quizStats.wrongQuestions,
                prestige_data: prestigeData,
                update_at: new Date()
            }, { onConflict: 'user_id' });
    } catch (err) {
        console.error("雲端存檔失敗，已安全保留於本機");
    }
}

// ==========================================
// 4. 登入視窗控制介面
// ==========================================
function openLoginModal() {
    document.getElementById('username-input').value = PLAYER_ID;
    document.getElementById('login-modal').style.display = 'flex';
}

function closeLoginModal() {
    document.getElementById('login-modal').style.display = 'none';
}

function saveUsername() {
    let inputVal = document.getElementById('username-input').value.trim();
    if (inputVal) {
        PLAYER_ID = inputVal;
        localStorage.setItem('calculus_player_id', PLAYER_ID);
        closeLoginModal();
        loadGame();
        alert(`已成功切換至玩家: ${PLAYER_ID}`);
    } else {
        alert('代號不能為空！');
    }
}

// ==========================================
// 5. MATTER.JS 物理引擎與 8 層樓關卡設定
// ==========================================
const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;

const engine = Engine.create();
const world = engine.world;
engine.gravity.y = 1;

const container = document.getElementById('game-container');
const width = container.clientWidth;
const viewHeight = container.clientHeight;

const totalLevels = 8;
const levelHeight = 700;
const worldHeight = totalLevels * levelHeight;

const render = Render.create({
    element: container,
    engine: engine,
    options: {
        width: width,
        height: viewHeight,
        wireframes: false,
        background: '#1a1a1a'
    }
});

Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

Render.lookAt(render, {
    min: { x: 0, y: 0 },
    max: { x: width, y: viewHeight }
});

const leftWall = Bodies.rectangle(0, worldHeight / 2, 20, worldHeight, { isStatic: true, render: { fillStyle: '#333' } });
const rightWall = Bodies.rectangle(width, worldHeight / 2, 20, worldHeight, { isStatic: true, render: { fillStyle: '#333' } });
Composite.add(world, [leftWall, rightWall]);

for (let level = 0; level < totalLevels; level++) {
    let startY = level * levelHeight;
    if (level % 2 === 0) {
        let cols = 9;
        let spacingX = (width - 60) / (cols - 1);
        for (let row = 0; row < 7; row++) {
            for (let col = 0; col < cols; col++) {
                let x = 30 + col * spacingX + (row % 2) * (spacingX / 2);
                if (x < width - 20) {
                    let y = startY + 80 + row * 85;
                    let peg = Bodies.circle(x, y, 11, { isStatic: true, restitution: 0.85, render: { fillStyle: '#2c2c2c' } });
                    Composite.add(world, peg);
                }
            }
        }
    } else {
        for (let row = 0; row < 4; row++) {
            let xPos = (row % 2 === 0) ? width * 0.35 : width * 0.65;
            let slope = Bodies.rectangle(xPos, startY + 120 + row * 140, width * 0.5, 15, {
                isStatic: true,
                angle: (row % 2 === 0) ? 0.28 : -0.28,
                render: { fillStyle: '#333' }
            });
            Composite.add(world, slope);
        }
    }
}

let checkpointSensors = [];
let bottomDestructors = [];
let levelBottomBodies = [];

function updateLevelBoundaries() {
    levelBottomBodies.forEach(body => Composite.remove(world, body));
    levelBottomBodies = [];
    checkpointSensors = [];
    bottomDestructors = [];

    for (let level = 0; level < totalLevels; level++) {
        let startY = level * levelHeight;

        if (level < unlockedLevels - 1) {
            let blueSensor = Bodies.rectangle(width / 2, startY + levelHeight - 25, width - 40, 20, {
                isStatic: true, isSensor: true, render: { fillStyle: '#3498db' }
            });
            checkpointSensors.push(blueSensor);
            levelBottomBodies.push(blueSensor);
            Composite.add(world, blueSensor);
        } else if (level === unlockedLevels - 1) {
            let redBar = Bodies.rectangle(width / 2, startY + levelHeight - 25, width - 40, 20, {
                isStatic: true, render: { fillStyle: '#e74c3c' }
            });
            bottomDestructors.push(redBar);
            levelBottomBodies.push(redBar);
            Composite.add(world, redBar);
            break;
        }
    }
}

// ==========================================
// 6. 相機控制與觸控滑動
// ==========================================
let currentCameraY = 0;
let maxScroll = worldHeight - viewHeight;

function scrollCameraTo(newY) {
    currentCameraY = Math.max(0, Math.min(newY, maxScroll));
    Render.lookAt(render, {
        min: { x: 0, y: currentCameraY },
        max: { x: width, y: currentCameraY + viewHeight }
    });
}
function scrollCamera(direction) { scrollCameraTo(currentCameraY + direction * viewHeight); }

let isDragging = false, startTouchY = 0, startCameraY = 0;
container.addEventListener('touchstart', (e) => { isDragging = true; startTouchY = e.touches[0].clientY; startCameraY = currentCameraY; }, { passive: true });
container.addEventListener('touchmove', (e) => { if (!isDragging) return; scrollCameraTo(startCameraY + (startTouchY - e.touches[0].clientY)); }, { passive: true });
container.addEventListener('touchend', () => { isDragging = false; });
container.addEventListener('mousedown', (e) => { isDragging = true; startTouchY = e.clientY; startCameraY = currentCameraY; });
window.addEventListener('mousemove', (e) => { if (!isDragging) return; scrollCameraTo(startCameraY + (startTouchY - e.clientY)); });
window.addEventListener('mouseup', () => { isDragging = false; });

// ==========================================
// 7. 球體生成與互動
// ==========================================
function spawnBall() {
    let x = width / 2 + (Math.random() * 30 - 15);
    let ball = Bodies.circle(x, 20, 12, { restitution: 0.85, render: { fillStyle: '#ffffff' } });
    Composite.add(world, ball);
    balls.push(ball);
}

let spawnerTimer = setInterval(spawnBall, spawnIntervalTime);

Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        let bodyA = pair.bodyA, bodyB = pair.bodyB;
        checkpointSensors.forEach(sensor => {
            if ((bodyA === sensor && balls.includes(bodyB)) || (bodyB === sensor && balls.includes(bodyA))) {
                let ball = balls.includes(bodyA) ? bodyA : bodyB;
                if (!ball.touchedCheckpoints) ball.touchedCheckpoints = [];
                if (!ball.touchedCheckpoints.includes(sensor)) {
                    ball.touchedCheckpoints.push(sensor);
                    gold += ballValue * prestigeData.multiplier;
                    updateUI();
                }
            }
        });
        bottomDestructors.forEach(destructor => {
            if ((bodyA === destructor && balls.includes(bodyB)) || (bodyB === destructor && balls.includes(bodyA))) {
                let ball = balls.includes(bodyA) ? bodyA : bodyB;
                gold += ballValue * prestigeData.multiplier;
                updateUI();
                Composite.remove(world, ball);
                balls = balls.filter(b => b !== ball);
            }
        });
    });
});

function formatNumber(num) {
    return num >= 1e6 ? num.toExponential(2).toUpperCase() : num.toFixed(2);
}

function updateUI() {
    const goldEl = document.getElementById('gold-display');
    if (goldEl) goldEl.innerText = formatNumber(gold);
    const statusEl = document.getElementById('status-display');
    if (statusEl) {
        statusEl.innerHTML = `已解鎖關卡: ${unlockedLevels}/${totalLevels} | 球價值: $${formatNumber(ballValue * prestigeData.multiplier)} | 速度: ${(spawnIntervalTime / 1000).toFixed(1)}s`;
    }
}

// ==========================================
// 8. 題庫與答題系統 (精準保護 LaTeX 指令)
// ==========================================
let quizData = [], currentQuestionIndex = 0, shuffledIndices = [], shufflePointer = 0, roundCount = 0;

async function loadQuizData() {
    try {
        let response = await fetch('questions.json');
        let rawData = await response.json();
        
        // 安全清洗函式：只針對 text 殘骸與錯誤化學式反斜線進行修正，保留 \int, \frac 等正確指令
        const cleanText = (text) => {
            if (!text) return '';
            return text
                .replace(/\\?text\{?(kg|N|m|s|g|cm|mm|rad|deg)\b\}?/gi, '$1')
                .replace(/\\?text\{?(m\/s\^?2?)\b\}?/gi, '$1')
                .replace(/\\?text\{([^}]+)\}/g, '$1')
                .replace(/\btext(?=kg|N|m|s)/gi, '')
                // 僅修復被誤加反斜線的單一化學元素符號 (例如 \O_2 -> O_2)，不影響 \int 或 \frac
                .replace(/\\([A-Z])([a-z]?)(?=_|\d)/g, '$1$2');
        };

        quizData = rawData.map(item => ({
            q: cleanText(item.q),
            options: item.options.map(opt => cleanText(opt)),
            answer: item.answer
        }));

        if (quizData.length > 0) {
            initShuffledIndices();
            loadRandomQuestion();
        }
    } catch (e) {
        console.error("題庫載入錯誤", e);
        document.getElementById('question-text').innerText = "請確認已建立 questions.json 題庫";
    }
}

function initShuffledIndices() {
    shuffledIndices = Array.from({ length: quizData.length }, (_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    shufflePointer = 0;
    roundCount++;
}

function loadRandomQuestion() {
    if (quizData.length === 0) return;
    if (shufflePointer >= shuffledIndices.length) {
        initShuffledIndices();
        if (roundCount > 1) {
            gold += ballValue * 5 * prestigeData.multiplier;
            updateUI();
        }
    }
    currentQuestionIndex = shuffledIndices[shufflePointer++];
    let qObj = quizData[currentQuestionIndex];

    document.getElementById('question-text').innerHTML = qObj.q;
    let optionsArea = document.getElementById('options-area');
    optionsArea.innerHTML = '';

    qObj.options.forEach((opt, index) => {
        let btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.innerHTML = opt;
        btn.onclick = () => checkAnswer(index);
        optionsArea.appendChild(btn);
    });

    if (typeof renderMathInElement === 'function') {
        renderMathInElement(document.getElementById('control-panel'), {
            delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }],
            throwOnError: false
        });
    }
}

function checkAnswer(selectedIndex) {
    if (quizData.length === 0) return;
    let qObj = quizData[currentQuestionIndex];
    let feedback = document.getElementById('feedback');

    quizStats.totalAnswered++;

    if (selectedIndex === qObj.answer) {
        quizStats.totalCorrect++;
        correctAnswersCount++;

        if (correctAnswersCount % 10 === 0 && unlockedLevels < totalLevels) {
            unlockedLevels++;
            updateLevelBoundaries();
            feedback.innerText = `太神啦！成功解鎖第 ${unlockedLevels} 層新關卡！🎉`;
        } else {
            let rewardType = Math.random() > 0.5 ? 'value' : 'speed';
            
            if (rewardType === 'value') {
                let growthFactor = prestigeData.answerGrowthFactor || 1.4;
                ballValue *= growthFactor;
                feedback.innerText = `答對！隨機獎勵：球價值以 x${growthFactor.toFixed(4)} 成長！📈`;
            } else {
                spawnIntervalTime *= 0.94;
                if (spawnIntervalTime < 200) spawnIntervalTime = 200;
                clearInterval(spawnerTimer);
                spawnerTimer = setInterval(spawnBall, spawnIntervalTime);
                feedback.innerText = "答對！隨機獎勵：球的生產速度加快！⚡";
            }
        }
    } else {
        quizStats.wrongQuestions.push({
            question: qObj.q,
            options: qObj.options,
            correctAnswer: qObj.options[qObj.answer],
            userAnswer: qObj.options[selectedIndex]
        });

        ballValue = Math.max(0.1, ballValue * 0.9);
        spawnIntervalTime *= 1.06;
        clearInterval(spawnerTimer);
        spawnerTimer = setInterval(spawnBall, spawnIntervalTime);

        feedback.innerText = "答錯囉！懲罰：球價值下降 ＆ 生產減速！❌";
    }

    updateUI();
    saveGameToCloud();

    setTimeout(() => {
        feedback.innerText = "";
        loadRandomQuestion();
    }, 2000);
}

// ==========================================
// 9. 錯題本檢視與數據統計
// ==========================================
function openErrorLogModal() {
    const container = document.getElementById('error-list-container');
    
    let total = quizStats.totalAnswered || 0;
    let correct = quizStats.totalCorrect || 0;
    let rate = total > 0 ? ((correct / total) * 100).toFixed(1) : '0.0';

    document.getElementById('stat-total').innerText = total;
    document.getElementById('stat-correct').innerText = correct;
    document.getElementById('stat-rate').innerText = rate + '%';

    let errors = quizStats.wrongQuestions || [];
    if (errors.length === 0) {
        container.innerHTML = '<p style="color: #b2bec3; text-align: center; padding: 20px;">太棒了！目前沒有累積錯題紀錄。</p>';
    } else {
        let html = '';
        errors.forEach((item, index) => {
            html += `
                <div style="background: #1f1f1f; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #e74c3c;">
                    <div style="font-weight: bold; margin-bottom: 6px;">Q${index + 1}: ${item.question}</div>
                    <div style="color: #e74c3c; font-size: 0.9rem; margin-bottom: 4px;">❌ 你的選擇: ${item.userAnswer}</div>
                    <div style="color: #2ecc71; font-size: 0.9rem;">✅ 正確答案: ${item.correctAnswer}</div>
                </div>
            `;
        });
        container.innerHTML = html;
    }
    
    document.getElementById('error-modal').style.display = 'flex';
}

function closeErrorLogModal() { 
    document.getElementById('error-modal').style.display = 'none'; 
}

// ==========================================
// 10. 轉生系統 (原本的倍率 + (log10(x) / 100))
// ==========================================
function triggerPrestige() {
    if (quizStats.totalAnswered < 50) {
        alert(`還需回答 ${50 - quizStats.totalAnswered} 題才能解鎖 Prestige。`);
        return;
    }

    let x = gold;
    let logVal = Math.log10(Math.max(x, 1));
    
    // 取得原本的倍率
    let currentFactor = prestigeData.answerGrowthFactor || 1.4;
    
    // 公式：原本的倍率 + (log10(x) / 100)
    let customGrowth = currentFactor + (logVal / 100);
    
    prestigeData.answerGrowthFactor = customGrowth;
    prestigeData.count++;

    gold = 0;
    unlockedLevels = 1;
    correctAnswersCount = 0;
    ballValue = 1.0;
    spawnIntervalTime = 10000;
    clearInterval(spawnerTimer);
    spawnerTimer = setInterval(spawnBall, spawnIntervalTime);
    updateLevelBoundaries();
    saveGameToCloud();

    alert(`👑 轉生成功！原本倍率 (${currentFactor.toFixed(4)}) + 額外成長 (${(logVal / 100).toFixed(4)}) ＝ 新答題倍率：x${prestigeData.answerGrowthFactor.toFixed(4)}`);
    updateUI();
}

// 啟動遊戲
loadQuizData();
loadGame();
