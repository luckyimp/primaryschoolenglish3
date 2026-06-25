const CACHE_NAME = 'word-reader-v4';

const urlsToCache = [
    './',
    'index.html',
    'styles.css',
    'script.js',
    'manifest.json'
];

const audioFiles = [];
for (let c = 97; c <= 122; c++) {
    audioFiles.push(`audio/${String.fromCharCode(c)}.mp3`);
}

// 安装时缓存核心文件 + 字母音频
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll([...urlsToCache, ...audioFiles]))
    );
});

// 动态缓存：按需缓存访问过的网页
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                // 如果缓存里有，直接返回缓存
                if (response) {
                    return response;
                }
                
                // 如果缓存里没有（比如点开了 unit1.html），就去网络请求
                return fetch(event.request).then(
                    response => {
                        // 检查是否是有效的响应
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // 复制一份响应存入缓存，下次再点这个网页就能离线打开了
                        let responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                            
                        return response;
                    }
                );
            })
    );
});
