(function() {
'use strict';

const chatContainer = document.getElementById('chat-container');
const msgInput = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');
const statusDot = document.getElementById('status');
const fileBtn = document.getElementById('file-btn');
const fileInput = document.getElementById('file-input');
const imagePreview = document.getElementById('image-preview');
const previewImg = document.getElementById('preview-img');
const previewClose = document.getElementById('preview-close');
const uploadPreview = document.getElementById('upload-preview');
const cancelUpload = document.getElementById('cancel-upload');

let ws = null;
let myUserId = null;
let reconnectTimer = null;
let pendingUpload = null;

function formatTime(ts) {
    const d = new Date(typeof ts === 'number' ? ts * 1000 : Date.now());
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function renderSegment(seg) {
    var div = document.createElement('div');
    switch (seg.type) {
        case 'text':
            div.className = 'msg-segment text';
            div.textContent = seg.data.text || '';
            break;
        case 'image':
            div.className = 'msg-segment image';
            var img = document.createElement('img');
            img.src = seg.data.file || seg.data.url || '';
            img.alt = 'Image';
            img.onclick = function() {
                previewImg.src = img.src;
                imagePreview.classList.remove('hidden');
            };
            img.onerror = function() {
                var fallback = document.createElement('a');
                fallback.href = img.src;
                fallback.target = '_blank';
                fallback.textContent = '[Image: ' + (seg.data.file || 'link') + ']';
                fallback.style.color = '#7c7cff';
                div.innerHTML = '';
                div.appendChild(fallback);
            };
            div.appendChild(img);
            if (seg.data.name) {
                var name = document.createElement('div');
                name.className = 'image-filename';
                name.textContent = seg.data.name;
                div.appendChild(name);
            }
            break;
        case 'at':
            div.className = 'msg-segment at';
            div.textContent = '@' + (seg.data.user_id || seg.data.qq || 'unknown');
            break;
        case 'reply':
            div.className = 'msg-segment reply';
            div.textContent = '[Reply to: ' + (seg.data.id || 'unknown') + ']';
            break;
        case 'audio':
            div.className = 'msg-segment audio';
            var audio = document.createElement('audio');
            audio.controls = true;
            audio.src = seg.data.file || seg.data.url || '';
            div.appendChild(audio);
            break;
        case 'raw':
            if (seg.data && seg.data.platform === 'webchat') {
                renderWebchatSegment(div, seg.data.type, seg.data.data);
            } else {
                div.className = 'msg-segment text';
                div.textContent = '[unsupported: ' + seg.type + ']';
                div.style.color = '#888';
            }
            break;
        default:
            div.className = 'msg-segment text';
            div.textContent = seg.data.text || seg.data.content || '';
            div.style.color = '#888';
    }
    return div;
}

function renderWebchatSegment(container, type, data) {
    container.className = 'msg-segment';
    switch (type) {
        case 'image':
            container.classList.add('image');
            var img = document.createElement('img');
            img.src = (data || {}).file || (data || {}).url || '';
            img.alt = 'Image';
            img.onclick = function() {
                previewImg.src = img.src;
                imagePreview.classList.remove('hidden');
            };
            img.onerror = function() {
                container.innerHTML = '<a href="' + img.src + '" target="_blank" style="color:#7c7cff">[Image]</a>';
            };
            container.appendChild(img);
            break;
        case 'audio':
        case 'record':
            container.classList.add('audio');
            var audio = document.createElement('audio');
            audio.controls = true;
            audio.src = (data || {}).file || (data || {}).url || '';
            container.appendChild(audio);
            break;
        case 'video':
            var video = document.createElement('video');
            video.controls = true;
            video.style.maxWidth = '240px';
            video.style.maxHeight = '240px';
            video.style.borderRadius = '8px';
            video.src = (data || {}).file || (data || {}).url || '';
            container.appendChild(video);
            break;
        case 'file':
            var link = document.createElement('a');
            link.href = (data || {}).url || (data || {}).file || '';
            link.target = '_blank';
            link.style.color = '#7c7cff';
            link.textContent = '[File: ' + ((data || {}).name || 'download') + ']';
            container.appendChild(link);
            break;
        default:
            container.classList.add('text');
            container.textContent = '[webchat:' + type + ']';
            container.style.color = '#888';
    }
}

function appendMessage(type, content, extra) {
    extra = extra || {};
    var div = document.createElement('div');
    div.className = 'msg ' + type;

    if (extra.sender) {
        var sender = document.createElement('div');
        sender.className = 'sender';
        sender.textContent = extra.sender;
        div.appendChild(sender);
    }

    if (extra.segments && extra.segments.length > 0) {
        for (var i = 0; i < extra.segments.length; i++) {
            div.appendChild(renderSegment(extra.segments[i]));
        }
    } else if (content) {
        var textDiv = document.createElement('div');
        textDiv.className = 'msg-segment text';
        textDiv.textContent = content;
        div.appendChild(textDiv);
    }

    var time = document.createElement('div');
    time.className = 'time';
    time.textContent = formatTime(extra.time);
    div.appendChild(time);

    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function appendSystemMsg(text) {
    var div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function buildSegmentsFromInput() {
    var segments = [];
    var text = msgInput.value.trim();
    if (text) {
        segments.push({ type: 'text', data: { text: text } });
    }
    if (pendingUpload) {
        segments.push({
            type: 'image',
            data: {
                file: pendingUpload.dataUrl,
                name: pendingUpload.name
            }
        });
    }
    return segments;
}

function sendMessage() {
    var segments = buildSegmentsFromInput();
    if (segments.length === 0 || !ws || ws.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: 'message', segments: segments }));

    msgInput.focus();
    var content = msgInput.value.trim();
    appendMessage('user', content, {
        sender: 'You',
        time: Date.now() / 1000,
        segments: segments
    });

    msgInput.value = '';
    msgInput.style.height = 'auto';
    clearPendingUpload();
}

function clearPendingUpload() {
    pendingUpload = null;
    fileInput.value = '';
    uploadPreview.classList.add('hidden');
}

function handleFileSelect(file) {
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        pendingUpload = {
            name: file.name,
            size: file.size,
            dataUrl: e.target.result
        };

        var previewContent = '';
        if (file.type.startsWith('image/')) {
            previewContent = '<img src="' + e.target.result + '" class="upload-preview-thumb" alt="preview">';
        }
        uploadPreview.innerHTML = previewContent +
            '<span class="upload-preview-name">' + file.name + ' (' + formatFileSize(file.size) + ')</span>' +
            '<button id="cancel-upload" class="cancel-upload">&times;</button>';
        uploadPreview.classList.remove('hidden');

        document.getElementById('cancel-upload').addEventListener('click', clearPendingUpload);
    };
    reader.readAsDataURL(file);
}

function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(proto + '//' + location.host);

    ws.onopen = function() {
        statusDot.className = 'status connected';
        statusDot.title = 'Connected';
        msgInput.disabled = false;
        sendBtn.disabled = false;
        fileBtn.style.opacity = '1';
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    };

    ws.onmessage = function(e) {
        try {
            var data = JSON.parse(e.data);
            if (data.type === 'connected') {
                myUserId = data.userId;
                appendSystemMsg('Connected as #' + data.userId);
            } else if (data.type === 'reply') {
                var content = data.content || '';
                appendMessage('bot', content, {
                    sender: 'Bot',
                    time: Date.now() / 1000,
                    segments: data.segments || []
                });
            }
        } catch (err) {
            console.error('Parse error:', err);
        }
    };

    ws.onclose = function() {
        statusDot.className = 'status disconnected';
        statusDot.title = 'Disconnected';
        msgInput.disabled = true;
        sendBtn.disabled = true;
        fileBtn.style.opacity = '0.4';
        appendSystemMsg('Disconnected. Reconnecting...');
        reconnectTimer = setTimeout(connect, 3000);
    };

    ws.onerror = function() {
        ws.close();
    };
}

sendBtn.addEventListener('click', sendMessage);

msgInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

msgInput.addEventListener('input', function() {
    msgInput.style.height = 'auto';
    msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
});

msgInput.addEventListener('paste', function(e) {
    var items = (e.clipboardData || window.clipboardData).items;
    for (var i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault();
            handleFileSelect(items[i].getAsFile());
            return;
        }
    }
});

fileBtn.addEventListener('click', function() {
    fileInput.click();
});

fileInput.addEventListener('change', function() {
    if (fileInput.files && fileInput.files.length > 0) {
        handleFileSelect(fileInput.files[0]);
    }
});

previewClose.addEventListener('click', function() {
    imagePreview.classList.add('hidden');
});

imagePreview.addEventListener('click', function(e) {
    if (e.target === imagePreview) {
        imagePreview.classList.add('hidden');
    }
});

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        imagePreview.classList.add('hidden');
    }
});

connect();
})();
