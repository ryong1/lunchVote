/* ==========================================
   1. 초기 설정 및 전역 변수
   ========================================== */
const socket = io();
let isAdmin = false;
let timerInterval = null;
let tempMenus = [];

/** HTML 특수문자를 이스케이프해 XSS를 방지한다. */
function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const urlParams = new URLSearchParams(window.location.search);
let roomId = urlParams.get('room');

if (!roomId) {
    roomId = Math.random().toString(36).substring(2, 8);
    window.history.pushState({}, '', `?room=${roomId}`);
}

socket.emit('joinRoom', roomId);

/* ==========================================
   2. 소켓 이벤트 리스너 (실시간 업데이트)
   ========================================== */

socket.on('initData', (data) => {
    isAdmin = data.isAdmin;
    
    const adminBox = document.getElementById('admin-controls');
    if (adminBox) adminBox.style.display = isAdmin ? 'block' : 'none';

    const linkPreview = document.getElementById('currentLink');
    if (linkPreview) linkPreview.innerText = window.location.href;

    const room = data.roomData;
    const hasCandidates = room && room.candidates && room.candidates.length > 0;

    if (hasCandidates) {
        if (room.endTime) startLocalTimer(room.endTime);
        render(room, room.isFinished);
        showPage('view-main');
    } else {
        if (isAdmin) {
            showPage('view-add');
        } else {
            showPage('view-main');
            render(null); 
        }
    }
});

// ⭐ 핵심 수정: 서버에서 데이터가 오면 그때 확실히 페이지를 전환하고 그립니다.
socket.on('updateData', (data) => {
    console.log("서버로부터 데이터 수신 성공:", data);
    
    if (data && data.candidates && data.candidates.length > 0) {
        // 데이터가 있을 때만 렌더링하고 페이지 전환
        render(data, data.isFinished);
        showPage('view-main'); 
    } else {
        render(data);
    }
});

socket.on('timerUpdated', (endTime) => {
    startLocalTimer(endTime);
});

socket.on('finishVote', (data) => {
    if (timerInterval) clearInterval(timerInterval);
    const display = document.getElementById('timer-display');
    if (display) display.innerText = "투표 종료";
    render(data, true);
});

// 방장 권한을 인계받았을 때 (기존 방장 이탈)
socket.on('adminGranted', () => {
    isAdmin = true;
    const adminBox = document.getElementById('admin-controls');
    if (adminBox) adminBox.style.display = 'block';
});

// 서버 측 검증 실패 등 오류 알림
socket.on('voteError', (message) => {
    alert(message);
});

/* ==========================================
   3. 메뉴 등록 로직
   ========================================== */

function addMenuToList() {
    const input = document.getElementById('menuInput');
    const menuName = input.value.trim();
    if (!menuName) return;
    if (tempMenus.includes(menuName)) {
        alert('이미 리스트에 있는 메뉴입니다!');
        return;
    }
    tempMenus.push(menuName);
    renderTempList();
    input.value = '';
    input.focus();
}

function renderTempList() {
    const listDiv = document.getElementById('tempMenuList');
    const countSpan = document.getElementById('temp-count');
    if (countSpan) countSpan.innerText = tempMenus.length;

    if (tempMenus.length === 0) {
        listDiv.innerHTML = `<p class="empty-msg" style="color: var(--text-light); font-size: 13px; text-align: center; width: 100%; padding: 20px 0;">추가된 메뉴가 없습니다.</p>`;
        return;
    }

    listDiv.innerHTML = tempMenus.map((menu, index) => `
        <div class="temp-menu-item">
            <span class="temp-menu-name">${escapeHtml(menu)}</span>
            <div class="btn-remove-temp" data-index="${index}">&times;</div>
        </div>
    `).join('');
}

function removeTempMenu(index) {
    tempMenus.splice(index, 1);
    renderTempList();
}

// ⭐ 핵심 수정: 버튼 클릭 시 동작
function submitFinalVote() {
    if (tempMenus.length < 2) {
        alert('최소 2개 이상의 메뉴를 추가해주세요!');
        return;
    }

    const timeInput = document.getElementById('timeInput');
    const minutes = (timeInput && timeInput.value > 0) ? parseInt(timeInput.value) : 10;
    
    console.log("투표 시작 시도:", { roomId, menus: tempMenus, minutes });

    // 1. 서버에 데이터 전송
    socket.emit('startVoteSession', {
        roomId: roomId,
        menus: tempMenus,
        minutes: minutes
    });

    

    // 2. 중요: 바로 showPage를 하지 않고 리스트 영역에 '로딩' 표시를 먼저 합니다.
    const listDiv = document.getElementById('menuList');
    if (listDiv) listDiv.innerHTML = '<p class="empty-info">서버와 통신 중... 🚀</p>';
    
    // 3. 페이지는 일단 이동시키되, 실제 그림은 서버 응답(updateData)이 올 때 그려집니다.
    showPage('view-main');

    // 4. 임시 데이터 비우기
    tempMenus = [];
    renderTempList();
    if (timeInput) timeInput.value = ''; 
}

/* ==========================================
   4. 투표 및 렌더링
   ========================================== */

function castVote(menuName) {
    socket.emit('castVote', { roomId, menuName });
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
        window.scrollTo(0, 0);
    }
}

function render(data, isFinished = false) {
    const listDiv = document.getElementById('menuList');
    if (!listDiv) return;

    if (!data || !data.candidates || data.candidates.length === 0) {
        listDiv.innerHTML = '<p class="empty-info">방장이 메뉴를 등록 중입니다... 🍱</p>';
        return;
    }
    
    listDiv.innerHTML = '';
    const sorted = [...data.candidates];
    if (isFinished && data.votes) {
        sorted.sort((a, b) => (data.votes[b] || 0) - (data.votes[a] || 0));
    }

    const maxVotes = data.votes ? Math.max(...Object.values(data.votes), 0) : 0;
    
    sorted.forEach(menu => {
        const votes = (data.votes && data.votes[menu]) || 0;
        const isWinner = isFinished && votes === maxVotes && maxVotes > 0;
        const isMyVote = data.userVotes && data.userVotes[socket.id] === menu;
        
        const safeMenu = escapeHtml(menu);
        const div = document.createElement('div');
        div.className = `menu-item ${isWinner ? 'winner' : ''}`;
        div.innerHTML = `
            <div class="menu-info">
                <span class="menu-name">${isWinner ? '👑 ' : ''}${safeMenu}</span>
                <span class="vote-count">${votes}표</span>
            </div>
            <div class="vote-section">
                ${!isFinished ? `
                    <button class="btn-vote ${isMyVote ? '' : 'active'}" data-menu="${safeMenu}">
                        ${isMyVote ? '취소' : '투표'}
                    </button>
                ` : ''}
            </div>
        `;
        listDiv.appendChild(div);
    });
}

/* ==========================================
   5. 기타 기능
   ========================================== */

function startLocalTimer(endTime) {
    if (timerInterval) clearInterval(timerInterval);
    const display = document.getElementById('timer-display');
    if (!display) return;
    const update = () => {
        const diff = endTime - Date.now();
        if (diff <= 0) {
            clearInterval(timerInterval);
            display.innerText = "00:00";
            return;
        }
        const min = String(Math.floor(diff / 60000)).padStart(2, '0');
        const sec = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        display.innerText = `${min}:${sec}`;
    };
    update();
    timerInterval = setInterval(update, 1000);
}

async function copyToClipboard() {
    try {
        await navigator.clipboard.writeText(window.location.href);
        alert("링크가 복사되었습니다!");
    } catch (err) { alert("복사 실패"); }
}

async function nativeShare() {
    if (navigator.share) {
        try {
            await navigator.share({ title: '오늘 뭐 먹지?', url: window.location.href });
        } catch (err) { }
    } else { copyToClipboard(); }
}

function searchPlaces() {
    const query = document.getElementById('mapSearchInput').value;
    if (query) alert(`'${query}' 검색 준비 중...`);
}

/* ==========================================
   6. 이벤트 위임 (동적 요소 처리)
   ========================================== */

// 투표 버튼 클릭 (data-menu 는 브라우저가 엔티티를 디코딩해 원본 메뉴명을 돌려줌)
document.getElementById('menuList').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-vote');
    if (btn && btn.dataset.menu != null) castVote(btn.dataset.menu);
});

// 임시 메뉴 삭제 버튼
document.getElementById('tempMenuList').addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-remove-temp');
    if (btn && btn.dataset.index != null) removeTempMenu(Number(btn.dataset.index));
});

// Enter 키로 메뉴 추가 (UX 개선)
document.getElementById('menuInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addMenuToList();
    }
});