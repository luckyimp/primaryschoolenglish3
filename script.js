// ==========================================
// PWA 后台音频保活机制
// ==========================================
let audioContext;
let dummySource;
let keepAliveAudio;

function initKeepAlive() {
    if (audioContext) return;
    
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.1, audioContext.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = 0;
        }
        
        dummySource = audioContext.createBufferSource();
        dummySource.buffer = buffer;
        dummySource.loop = true;
        dummySource.connect(audioContext.destination);
        dummySource.start(0);
        
        // 锁屏后 AudioContext 可能被系统 suspend，监听到后自动恢复
        audioContext.onstatechange = () => {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
        };
        
        console.log('后台保活机制已启动');
    } catch (e) {
        console.error('保活机制启动失败:', e);
    }
}

function stopKeepAlive() {
    if (dummySource) {
        try { dummySource.stop(0); } catch (e) {}
        dummySource.disconnect();
        dummySource = null;
    }
    if (audioContext) {
        audioContext.onstatechange = null;
        audioContext.close().catch(() => {});
        audioContext = null;
    }
}


// 辅助函数：用浏览器自带语音朗读中文
function speakText(text, speed, callback) {
    window.speechSynthesis.cancel(); 
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.voice = voices.find(v => v.lang === 'zh-CN') || voices.find(v => v.lang.startsWith('zh'));
    utterance.onend = callback;
    window.speechSynthesis.speak(utterance);
}

// 辅助函数：逐个字母朗读拼写，完全自己控制节奏
function speakSpelling(spellStr, speed, callback) {
    const letters = spellStr.split('-'); // 拆分成字母数组
    let index = 0;

    // 获取用户输入的拼读间隔时间，默认50
    const interval = parseInt(document.getElementById('spellInterval').value) || 0;

    function speakNextLetter() {
        if (!isPlaying) return; // 如果中途被停止，直接中断

        if (index < letters.length) {
            const letter = letters[index];
            const utterance = new SpeechSynthesisUtterance(letter);
            utterance.rate = speed;
            utterance.lang = 'en-US';
            utterance.voice = voices.find(v => v.lang === 'en-US') || voices.find(v => v.lang.startsWith('en'));
            
            // 读完一个字母后的回调
            utterance.onend = () => {
                if (!isPlaying) return;
                index++;
                // 核心：使用用户设置的间隔时间
                setTimeout(speakNextLetter, interval); 
            };
            
            window.speechSynthesis.speak(utterance);
        } else {
            // 所有字母读完，执行原有逻辑
            callback();
        }
    }

    window.speechSynthesis.cancel();
    speakNextLetter(); // 开始读第一个字母
}

// 3. 核心播放逻辑：单词音频 -> 逐个字母拼写 -> 中文
function playWord(item, repeatTimes, speed, index) {
    if (!isPlaying) return;

    document.querySelectorAll('.word-item').forEach(el => el.classList.remove('highlight'));
    const currentEl = document.getElementById(`word-${index}`);
    if (currentEl) currentEl.classList.add('highlight');

    // 步骤1：播放有道词典单词发音
    audio.src = `https://dict.youdao.com/dictvoice?audio=${item.word}&type=2`;
    audio.playbackRate = speed;
    
    audio.onended = function() {
        if (!isPlaying) return;
        
        // 步骤2：单词音频播完，延时 300ms 调用逐字母拼写
        setTimeout(() => {
            speakSpelling(item.spell, speed, () => {
                if (!isPlaying) return;
                
                // 步骤3：拼写播完，延时 300ms 读中文
                setTimeout(() => {
                    speakText(item.cn, speed, () => {
                        if (!isPlaying) return;
                        
                        // 步骤4：中文播完，判断是否需要重复或读下一个
                        currentRepeat++;
                        if (currentRepeat >= repeatTimes) {
                            currentRepeat = 0;
                            currentIndex++;
                            
                            if (currentIndex < wordsData.length) {
                                setTimeout(() => {
                                    playWord(wordsData[currentIndex], repeatTimes, speed, currentIndex);
                                }, 500);
                            } else {
                                console.log("全部朗读完毕");
                                isPlaying = false;
                                document.querySelectorAll('.word-item').forEach(el => el.classList.remove('highlight'));
                            }
                        } else {
                            setTimeout(() => {
                                playWord(item, repeatTimes, speed, index);
                            }, 300);
                        }
                    });
                }, 300);
            });
        }, 300);
    };
    
    audio.play();
}

function playSingleWordAudio(word) {
    isPlaying = false; 
    window.speechSynthesis.cancel();
    audio.pause();
    audio.currentTime = 0;
    
    audio.src = `https://dict.youdao.com/dictvoice?audio=${word}&type=2`;
    audio.playbackRate = parseFloat(document.getElementById('speedControl').value);
    audio.play();
}

function startReading() {
    stopReading(); 
    initKeepAlive(); 
    isPlaying = true;
    currentIndex = startFromIndex; 
    currentRepeat = 0;
    
    // 确保重复次数在 1-10 之间
    let repeatTimes = parseInt(document.getElementById('repeatCount').value);
    if (isNaN(repeatTimes) || repeatTimes < 1) repeatTimes = 1;
    if (repeatTimes > 10) repeatTimes = 10;
    
    const speed = parseFloat(document.getElementById('speedControl').value);
    
    playWord(wordsData[currentIndex], repeatTimes, speed, currentIndex);
}

function stopReading() {
    isPlaying = false;
    audio.pause();
    audio.currentTime = 0;
    window.speechSynthesis.cancel();
    stopKeepAlive();
    document.querySelectorAll('.word-item').forEach(el => el.classList.remove('highlight'));
}

// 初始化函数
function init(words) {
    wordsData = words;
    renderWords();
}

// 全局变量
let wordsData = [];
let isPlaying = false;
let currentIndex = 0;
let currentRepeat = 0;
let startFromIndex = 0; 
let voices = [];
let audio = document.getElementById('audioPlayer');

window.speechSynthesis.onvoiceschanged = () => {
    voices = window.speechSynthesis.getVoices();
};

// 2. 渲染单词列表到页面上
function renderWords() {
    const wordListContainer = document.getElementById('wordListContainer');
    wordListContainer.innerHTML = '';
    
    wordsData.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'word-item';
        div.id = `word-${index}`;
        div.innerHTML = `
            <strong>${item.word}</strong><br>
            <span style="color:#666; font-size:12px">${item.spell}</span><br>
            <span style="color:#0078d4">${item.phonetic}</span> ${item.cn}
        `;
        
        div.onclick = () => {
            playSingleWordAudio(item.word);
            startFromIndex = index;
            document.querySelectorAll('.word-item').forEach(el => el.classList.remove('selected'));
            div.classList.add('selected');
        };
        
        wordListContainer.appendChild(div);
    });
    
    document.getElementById('word-0').classList.add('selected');
}
