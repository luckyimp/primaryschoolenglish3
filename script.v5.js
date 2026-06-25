// ==========================================
// Edge TTS - fetch 调用（纯前端，无后端）
// ==========================================

async function edgeTTS(text, voice = 'zh-CN-XiaoxiaoNeural', speed = 1.0) {
    const response = await fetch('https://mstts.138308.xyz/v1/audio/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            input: text,
            voice: voice,
            speed: speed,
            pitch: "0",
            style: "general"
        })
    });
    if (!response.ok) throw new Error('Edge TTS 请求失败');
    return await response.blob();
}

// ==========================================
// 中文音频预加载缓存
// ==========================================
const chineseAudioCache = new Map();

async function preloadChineseAudio(words) {
    chineseAudioCache.clear();
    const tasks = words.map(item =>
        edgeTTS(item.cn)
            .then(blob => { chineseAudioCache.set(item.cn, blob); })
            .catch(e => { console.warn('Edge TTS 预加载失败:', item.cn, e.message); })
    );
    await Promise.allSettled(tasks);
    console.log(`Edge TTS 预加载完成: ${chineseAudioCache.size}/${words.length}`);
}

// ==========================================
// speakText - Edge TTS 按需加载，speechSynthesis 兜底
// ==========================================
function speakText(text, speed, callback) {
    speakTextFallback(text, speed, callback);
}

function speakTextFallback(text, speed, callback) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.voice = voices.find(v => v.lang === 'zh-CN') || voices.find(v => v.lang.startsWith('zh'));
    utterance.onend = callback;
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// speakSpelling - 本地 MP3 优先，speechSynthesis 兜底
// ==========================================
function speakSpelling(spellStr, speed, callback) {
    const letters = spellStr.split('-');
    let index = 0;
    const interval = parseInt(document.getElementById('spellInterval').value) || 0;

    function playNextLetter() {
        if (!isPlaying) return;

        if (index < letters.length) {
            const letter = letters[index].toLowerCase().trim();

            if (/^[a-z]$/.test(letter)) {
                const letterAudio = new Audio(`audio/${letter}.mp3`);
                letterAudio.playbackRate = speed;
                letterAudio.onended = () => { index++; setTimeout(playNextLetter, interval); };
                letterAudio.onerror = () => {
                    speakLetterFallback(letter, speed, () => { index++; setTimeout(playNextLetter, interval); });
                };
                letterAudio.play().catch(() => {
                    speakLetterFallback(letter, speed, () => { index++; setTimeout(playNextLetter, interval); });
                });
            } else {
                speakLetterFallback(letter, speed, () => { index++; setTimeout(playNextLetter, interval); });
            }
        } else {
            callback();
        }
    }

    window.speechSynthesis.cancel();
    playNextLetter();
}

function speakLetterFallback(letter, speed, callback) {
    const utterance = new SpeechSynthesisUtterance(letter);
    utterance.rate = speed;
    utterance.lang = 'en-US';
    utterance.onend = callback;
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 核心播放逻辑：单词音频 -> 逐个字母拼写 -> 中文
// ==========================================
function playWord(item, repeatTimes, speed, index) {
    if (!isPlaying) return;

    document.querySelectorAll('.word-item').forEach(el => el.classList.remove('highlight'));
    const currentEl = document.getElementById(`word-${index}`);
    if (currentEl) currentEl.classList.add('highlight');

    // 更新 Media Session 显示当前单词
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: item.word,
            artist: item.phonetic,
            album: '单词朗读'
        });
    }

    // 步骤1：播放有道词典单词发音
    audio.src = `https://dict.youdao.com/dictvoice?audio=${item.word}&type=2`;
    audio.playbackRate = speed;

    audio.onended = function () {
        if (!isPlaying) return;

        setTimeout(() => {
            speakSpelling(item.spell, speed, () => {
                if (!isPlaying) return;

                setTimeout(() => {
                    speakText(item.cn, speed, () => {
                        if (!isPlaying) return;

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
                                if ('mediaSession' in navigator) {
                                    navigator.mediaSession.playbackState = 'paused';
                                }
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

// ==========================================
// 开始/停止朗读
// ==========================================
function startReading() {
    stopReading();
    isPlaying = true;
    currentIndex = startFromIndex;
    currentRepeat = 0;

    // 注册 Media Session
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: '英语单词朗读',
            artist: '加载中...',
            album: '单词朗读'
        });
        navigator.mediaSession.playbackState = 'playing';
    }

    let repeatTimes = parseInt(document.getElementById('repeatCount').value);
    if (isNaN(repeatTimes) || repeatTimes < 1) repeatTimes = 1;
    if (repeatTimes > 10) repeatTimes = 10;

    const speed = parseFloat(document.getElementById('speedControl').value);

    if (document.getElementById('mergeMode').checked) {
        startReadingMerged(wordsData.slice(startFromIndex), repeatTimes, speed);
        return;
    }

    playWord(wordsData[currentIndex], repeatTimes, speed, currentIndex);
}

// ==========================================
// 合并模式 - 全部拼接到一个长文本，Edge TTS 一次合成
// ==========================================
function startReadingMerged(words, repeatTimes, speed) {
    const parts = [];
    for (const item of words) {
        for (let r = 0; r < repeatTimes; r++) {
            const spelled = item.spell.split('-').map(l => `, ${l}`).join('') + ',';
            parts.push(`${item.word}${spelled} ${item.cn}`);
        }
    }
    const fullText = parts.join(', ');

    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: '合并朗读',
            artist: `${words.length} 个单词`,
            album: '单词朗读'
        });
        navigator.mediaSession.playbackState = 'playing';
    }

    const startBtn = document.getElementById('startBtn');
    startBtn.textContent = '合成中...';
    startBtn.disabled = true;

    edgeTTS(fullText, 'zh-CN-XiaoxiaoNeural', speed)
        .then(blob => {
            if (!isPlaying) return;
            startBtn.textContent = '开始朗读';
            startBtn.disabled = false;

            const url = URL.createObjectURL(blob);
            const player = document.getElementById('audioPlayer');
            player.src = url;
            player.playbackRate = 1;
            player.onended = () => {
                URL.revokeObjectURL(url);
                isPlaying = false;
                document.querySelectorAll('.word-item').forEach(el => el.classList.remove('highlight'));
                if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                }
            };
            player.play().catch(() => {
                URL.revokeObjectURL(url);
                isPlaying = false;
            });
        })
        .catch(err => {
            console.error('合并朗读失败:', err);
            startBtn.textContent = '开始朗读';
            startBtn.disabled = false;
            isPlaying = false;
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
        });
}

function stopReading() {
    isPlaying = false;
    audio.pause();
    audio.currentTime = 0;
    window.speechSynthesis.cancel();
    if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
    }
    document.querySelectorAll('.word-item').forEach(el => el.classList.remove('highlight'));
}

// ==========================================
// 初始化与渲染
// ==========================================
function init(words) {
    wordsData = words;
    renderWords();
}

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
