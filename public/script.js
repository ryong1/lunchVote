/* ==========================================
   1. 초기 설정 및 전역 변수
   ========================================== */
let isAdmin = false;
let timerInterval = null;
let tempMenus = [];
let menuLinks = {}; // 후보명 → 카카오맵 링크
let selectedMin = 10; // 투표 제한 시간(분)
let selectedSec = 0;  // 투표 제한 시간(초)
let socket = null;

// 지도 상태
let kakaoReady = false;
let kakaoMap = null;           // 검색(투표 만들기) 지도
let kakaoMarkers = [];
let kakaoInfo = null;
let lastPlaces = [];
let voteMap = null;            // 투표 화면 지도 (후보 위치)
let voteMarkers = [];
let voteInfo = null;
let lastVoteData = null;

// 막대는 무채색 (뉴브루탈리즘)
const BAR_COLORS = [
    { fill: '#ECECEC', edge: '#1A1A1A' },
];

// 시/도 → 시군구 (PC용 셀렉트박스)
const REGIONS = {
    '서울특별시': ['종로구','중구','용산구','성동구','광진구','동대문구','중랑구','성북구','강북구','도봉구','노원구','은평구','서대문구','마포구','양천구','강서구','구로구','금천구','영등포구','동작구','관악구','서초구','강남구','송파구','강동구'],
    '부산광역시': ['중구','서구','동구','영도구','부산진구','동래구','남구','북구','해운대구','사하구','금정구','강서구','연제구','수영구','사상구','기장군'],
    '대구광역시': ['중구','동구','서구','남구','북구','수성구','달서구','달성군','군위군'],
    '인천광역시': ['중구','동구','미추홀구','연수구','남동구','부평구','계양구','서구','강화군','옹진구'],
    '광주광역시': ['동구','서구','남구','북구','광산구'],
    '대전광역시': ['동구','중구','서구','유성구','대덕구'],
    '울산광역시': ['중구','남구','동구','북구','울주군'],
    '세종특별자치시': ['세종특별자치시'],
    '경기도': ['수원시','성남시','의정부시','안양시','부천시','광명시','평택시','동두천시','안산시','고양시','과천시','구리시','남양주시','오산시','시흥시','군포시','의왕시','하남시','용인시','파주시','이천시','안성시','김포시','화성시','광주시','양주시','포천시','여주시','연천군','가평군','양평군'],
    '강원특별자치도': ['춘천시','원주시','강릉시','동해시','태백시','속초시','삼척시','홍천군','횡성군','영월군','평창군','정선군','철원군','화천군','양구군','인제군','고성군','양양군'],
    '충청북도': ['청주시','충주시','제천시','보은군','옥천군','영동군','증평군','진천군','괴산군','음성군','단양군'],
    '충청남도': ['천안시','공주시','보령시','아산시','서산시','논산시','계룡시','당진시','금산군','부여군','서천군','청양군','홍성군','예산군','태안군'],
    '전북특별자치도': ['전주시','군산시','익산시','정읍시','남원시','김제시','완주군','진안군','무주군','장수군','임실군','순창군','고창군','부안군'],
    '전라남도': ['목포시','여수시','순천시','나주시','광양시','담양군','곡성군','구례군','고흥군','보성군','화순군','장흥군','강진군','해남군','영암군','무안군','함평군','영광군','장성군','완도군','진도군','신안군'],
    '경상북도': ['포항시','경주시','김천시','안동시','구미시','영주시','영천시','상주시','문경시','경산시','의성군','청송군','영양군','영덕군','청도군','고령군','성주군','칠곡군','예천군','봉화군','울진군','울릉군'],
    '경상남도': ['창원시','진주시','통영시','사천시','김해시','밀양시','거제시','양산시','의령군','함안군','창녕군','고성군','남해군','하동군','산청군','함양군','거창군','합천군'],
    '제주특별자치도': ['제주시','서귀포시'],
};

// 비차단 토스트 알림 (alert 대체)
let toastTimer = null;
function showToast(message) {
    let el = document.getElementById('toast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'toast';
        el.className = 'toast';
        document.body.appendChild(el);
    }
    el.textContent = message;
    void el.offsetWidth; // 재실행 시 애니메이션 리셋
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// 카테고리(또는 메뉴명)에서 음식 이모지 추론
function catToIcon(text) {
    const c = String(text || '');
    if (!c) return '🍴';
    const has = (...ks) => ks.some((k) => c.includes(k));
    if (has('커피', '카페')) return '☕';
    if (has('디저트', '베이커리', '빵', '케이크', '제과')) return '🍰';
    if (has('치킨', '닭')) return '🍗';
    if (has('피자')) return '🍕';
    if (has('버거', '햄버거')) return '🍔';
    if (has('초밥', '스시', '회', '횟집', '해산물', '수산', '물회')) return '🍣';
    if (has('우동', '라멘', '라면', '국수', '면', '소바', '쌀국수')) return '🍜';
    if (has('돈까스', '돈가스', '카츠')) return '🍱';
    if (has('중식', '중국', '짜장', '짬뽕', '마라')) return '🥡';
    if (has('떡볶이', '분식', '김밥')) return '🌶️';
    if (has('고기', '구이', '삼겹', '갈비', '바베큐', 'BBQ', '정육', '곱창', '족발', '보쌈')) return '🍖';
    if (has('국밥', '탕', '찌개', '전골', '해장', '국', '죽')) return '🍲';
    if (has('파스타', '스테이크', '이탈리', '양식', '브런치')) return '🍝';
    if (has('한식', '백반', '가정', '비빔', '쌈')) return '🍚';
    if (has('술', '포차', '호프', '주점', '이자카야', '바')) return '🍺';
    if (has('샐러드', '샌드위치')) return '🥗';
    return '🍴';
}

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

// 재접속해도 유지되는 투표자 식별자 (브라우저에 저장 → 나갔다 들어와도 같은 사람)
let voterId;
try {
    voterId = localStorage.getItem('voterId');
    if (!voterId) {
        voterId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('voterId', voterId);
    }
} catch (e) {
    voterId = 'v_' + Math.random().toString(36).slice(2);
}

let myVote = null; // 내가 투표한 항목

// socket.io 클라이언트가 로드된 경우에만 연결한다.
// (Node 서버가 아닌 VS Code Live Server(:5500) 등으로 열면 /socket.io/socket.io.js 가 없어 io 가 undefined)
if (typeof io !== 'undefined') {
    socket = io();
    socket.emit('joinRoom', { roomId, voterId });
} else {
    console.error('[lunchVote] socket.io 를 불러오지 못했습니다. `npm start` 후 http://localhost:3000 으로 접속하세요. (Live Server(:5500)에서는 실시간 기능이 동작하지 않습니다.)');
    socket = { on() {}, emit() {} }; // 스크립트가 중단되지 않도록 안전한 스텁
}

/* ==========================================
   2. 소켓 이벤트 리스너 (실시간 업데이트)
   ========================================== */

socket.on('initData', (data) => {
    isAdmin = data.isAdmin;
    myVote = data.myVote || null; // 재접속 시 이전 투표 복원

    // 시간 설정(휠)은 누구나 새 투표를 만들 수 있도록 항상 표시
    const adminBox = document.getElementById('admin-controls');
    if (adminBox) adminBox.style.display = 'block';
    requestAnimationFrame(syncTimeWheels);

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

// 시간만 종료(대기) — 방장이 연장/종료 결정
socket.on('timeUp', (data) => {
    if (timerInterval) clearInterval(timerInterval);
    render(data, false);
});

// 방장 권한을 인계받았을 때 (기존 방장 이탈)
socket.on('adminGranted', () => {
    isAdmin = true;
    const adminBox = document.getElementById('admin-controls');
    if (adminBox) adminBox.style.display = 'block';
});

// 서버 측 검증 실패 등 오류 알림
socket.on('voteError', (message) => {
    showToast(message);
});

/* ==========================================
   3. 메뉴 등록 로직
   ========================================== */

// 후보 추가 공통 로직 (직접 입력 / 맛집 검색 둘 다 사용)
function addMenu(name, mapUrl, dirUrl, cat, lat, lng) {
    name = (name || '').trim();
    if (!name) return false;
    if (tempMenus.includes(name)) {
        showToast('이미 추가된 메뉴예요');
        return false;
    }
    tempMenus.push(name);
    const la = parseFloat(lat), ln = parseFloat(lng);
    if (mapUrl || dirUrl || cat || (la && ln)) {
        menuLinks[name] = {
            map: mapUrl || '', dir: dirUrl || '', cat: cat || '',
            lat: la || null, lng: ln || null,
        };
    }
    renderTempList();

    // 추가 피드백: 카운트 배지 톡 + 토스트
    const badge = document.getElementById('temp-count');
    if (badge) { badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop'); }
    showToast(`'${name}' 추가됨`);
    return true;
}

function addMenuToList() {
    const input = document.getElementById('menuInput');
    if (addMenu(input.value)) {
        input.value = '';
        input.focus();
    }
}

function renderTempList() {
    const listDiv = document.getElementById('tempMenuList');
    const countSpan = document.getElementById('temp-count');
    if (countSpan) countSpan.innerText = tempMenus.length;

    // 시작 버튼: 메뉴 2개 이상일 때만 활성화 + 안내 문구
    const submitBtn = document.getElementById('submitBtn');
    if (submitBtn) {
        const ready = tempMenus.length >= 2;
        submitBtn.disabled = !ready;
        submitBtn.textContent = ready
            ? '이 메뉴들로 투표 시작하기'
            : `메뉴 ${2 - tempMenus.length}개 더 추가해 주세요`;
    }

    if (tempMenus.length === 0) {
        listDiv.innerHTML = `<p class="empty-msg">추가된 메뉴가 없습니다.</p>`;
        return;
    }

    listDiv.innerHTML = tempMenus.map((menu, index) => {
        const cat = (menuLinks[menu] && menuLinks[menu].cat) || '';
        return `
        <div class="temp-menu-item">
            <span class="temp-menu-name"><span class="temp-emoji">${catToIcon(cat || menu)}</span> ${escapeHtml(menu)}</span>
            <div class="btn-remove-temp" data-index="${index}">&times;</div>
        </div>`;
    }).join('');
}

function removeTempMenu(index) {
    const removed = tempMenus[index];
    tempMenus.splice(index, 1);
    if (removed) delete menuLinks[removed];
    renderTempList();
}

// ⭐ 핵심 수정: 버튼 클릭 시 동작
function submitFinalVote() {
    if (tempMenus.length < 2) {
        showToast('메뉴를 2개 이상 추가해 주세요');
        return;
    }

    const totalSeconds = selectedMin * 60 + selectedSec;
    if (totalSeconds < 5) {
        showToast('투표 시간을 설정해 주세요');
        return;
    }

    console.log("투표 시작 시도:", { roomId, menus: tempMenus, seconds: totalSeconds });

    // 후보별 지도 링크 추려서 함께 전송
    const links = {};
    tempMenus.forEach((m) => { if (menuLinks[m]) links[m] = menuLinks[m]; });

    // 1. 서버에 데이터 전송
    socket.emit('startVoteSession', {
        roomId: roomId,
        menus: tempMenus,
        seconds: totalSeconds,
        links: links
    });

    

    // 2. 중요: 바로 showPage를 하지 않고 리스트 영역에 '로딩' 표시를 먼저 합니다.
    const listDiv = document.getElementById('menuList');
    if (listDiv) listDiv.innerHTML = '<p class="empty-info">서버와 통신 중...</p>';
    
    // 3. 페이지는 일단 이동시키되, 실제 그림은 서버 응답(updateData)이 올 때 그려집니다.
    showPage('view-main');

    // 4. 임시 데이터 비우기
    tempMenus = [];
    menuLinks = {};
    renderTempList();
}

/* ==========================================
   4. 투표 및 렌더링
   ========================================== */

function castVote(menuName) {
    socket.emit('castVote', { roomId, menuName });
    // 서버 로직과 동일하게 내 투표 상태를 즉시 반영(같은 항목=취소)
    myVote = (myVote === menuName) ? null : menuName;
}

// 투표 시간 연장 (방장)
function extendVote(minutes) {
    socket.emit('extendVote', { roomId, seconds: minutes * 60 });
    const panel = document.getElementById('extend-panel');
    if (panel) panel.style.display = 'none';
    showToast(`${minutes}분 연장됐어요`);
}

// 투표 종료 확정 (방장)
function endVote() {
    socket.emit('endVote', { roomId });
    const panel = document.getElementById('extend-panel');
    if (panel) panel.style.display = 'none';
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
        // 숨겨졌다 보일 때 지도 크기 재계산 + 휠 위치 동기화
        if (pageId === 'view-add') {
            requestAnimationFrame(syncTimeWheels);
            if (kakaoMap) {
                kakaoMap.relayout();
                if (lastPlaces.length) updateMapMarkers(lastPlaces);
            }
        }
        if (pageId === 'view-main' && voteMap && lastVoteData) {
            requestAnimationFrame(() => updateVoteMap(lastVoteData));
        }
    }
}

function render(data, isFinished = false) {
    const listDiv = document.getElementById('menuList');
    if (!listDiv) return;

    const finished = !!(isFinished || (data && data.isFinished)); // 방장이 확정
    const timeUp = !!(data && data.timeUp) && !finished;           // 시간만 종료(대기)
    const closed = finished || timeUp;                              // 투표 마감 상태

    // 진행 중인 투표 여부
    const active = !!(data && data.candidates && data.candidates.length > 0) && !closed;
    // "+ 투표 등록": 방장은 항상, 비방장은 투표 진행 중일 때만 숨김(종료 후/대기 전엔 표시)
    const addBtn = document.querySelector('.btn-add-top');
    if (addBtn) addBtn.style.display = (isAdmin || !active) ? '' : 'none';

    // 마감 시 카운트다운만 숨기고 카드(공유 링크)는 유지, 시간종료 시 방장에게 패널
    const timerBox = document.querySelector('.timer-container');
    if (timerBox) timerBox.style.display = closed ? 'none' : '';
    if (closed && timerInterval) clearInterval(timerInterval);
    const extendPanel = document.getElementById('extend-panel');
    if (extendPanel) extendPanel.style.display = (timeUp && isAdmin) ? 'block' : 'none';
    listDiv.classList.toggle('finished', closed);

    if (!data || !data.candidates || data.candidates.length === 0) {
        listDiv.innerHTML = '<p class="empty-info">방장이 메뉴를 등록 중입니다...</p>';
        const mc = document.getElementById('vote-map-card');
        if (mc) mc.style.display = 'none';
        return;
    }

    updateVoteMap(data); // 후보 위치 지도

    listDiv.innerHTML = '';
    const sorted = [...data.candidates];
    if (closed && data.votes) {
        sorted.sort((a, b) => (data.votes[b] || 0) - (data.votes[a] || 0));
    }

    const voteValues = data.votes ? Object.values(data.votes) : [];
    const maxVotes = Math.max(...voteValues, 0);
    const totalVotes = voteValues.reduce((sum, v) => sum + v, 0);

    // 참여 현황 요약
    const summary = document.createElement('div');
    summary.className = 'vote-summary';
    summary.textContent = closed ? `투표 종료 · 총 ${totalVotes}표` : `총 ${totalVotes}표`;
    listDiv.appendChild(summary);

    // 확정 시 우승 발표 배너
    if (finished && maxVotes > 0) {
        const winners = data.candidates.filter((m) => (data.votes[m] || 0) === maxVotes);
        const winnerDir = (winners.length === 1 && data.links && data.links[winners[0]])
            ? data.links[winners[0]].dir : '';
        const banner = document.createElement('div');
        banner.className = 'result-banner';
        banner.innerHTML = `
            <div class="result-info">
                <span class="result-tag">${winners.length > 1 ? '공동 1위' : '최종 1위'}</span>
                <span class="result-name">👑 ${winners.map(escapeHtml).join(', ')}</span>
            </div>
            ${winnerDir ? `<a class="banner-dir" href="${escapeHtml(winnerDir)}" target="_blank" rel="noopener">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
                길찾기
            </a>` : ''}
        `;
        listDiv.appendChild(banner);
    }

    // 후보별 고유 색을 등록 순서로 고정 (정렬돼도 색 유지)
    const colorOf = {};
    data.candidates.forEach((m, i) => { colorOf[m] = BAR_COLORS[i % BAR_COLORS.length]; });

    sorted.forEach((menu, idx) => {
        const rank = idx + 1;
        const votes = (data.votes && data.votes[menu]) || 0;
        const isWinner = finished && votes === maxVotes && maxVotes > 0;
        const isMyVote = !closed && (myVote === menu);
        // 막대 너비: 최다 득표를 100% 기준으로 환산
        const pct = maxVotes > 0 ? Math.round((votes / maxVotes) * 100) : 0;
        const c = colorOf[menu] || BAR_COLORS[0];
        // 마감되면 모든 막대를 회색으로
        const fill = closed ? '#DBDBDB' : c.fill;
        const edge = closed ? '#BDBDBD' : c.edge;
        const link = (data.links && data.links[menu]) || null;

        const safeMenu = escapeHtml(menu);
        const div = document.createElement('div');
        div.className = `menu-item ${isWinner ? 'winner' : ''} ${isMyVote ? 'voted' : ''}`;
        div.style.cssText = `--fill:${fill};--edge:${edge}`;
        div.innerHTML = `
            <div class="menu-bar" style="width:${pct}%"></div>
            <div class="menu-row">
                <div class="menu-info">
                    ${closed
                        ? `<span class="rank ${rank === 1 ? 'rank-1' : ''}">${rank}</span>`
                        : `<span class="menu-emoji">${catToIcon((link && link.cat) || menu)}</span>`}
                    <span class="menu-name">${safeMenu}</span>
                </div>
                <div class="vote-section">
                    ${link && link.map
                        ? `<a class="map-link" href="${escapeHtml(link.map)}" target="_blank" rel="noopener" aria-label="지도에서 보기">
                               <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                           </a>`
                        : ''}
                    ${!closed ? `
                        <button class="btn-vote ${isMyVote ? 'voted' : 'active'}" data-menu="${safeMenu}">
                            ${isMyVote ? '취소' : '투표'}
                        </button>
                    ` : ''}
                </div>
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
        showToast('링크가 복사되었어요');
    } catch (err) { showToast('복사에 실패했어요'); }
}

async function nativeShare() {
    if (navigator.share) {
        try {
            await navigator.share({ title: '오늘 뭐 먹지?', url: window.location.href });
        } catch (err) { }
    } else { copyToClipboard(); }
}

async function searchPlaces() {
    const input = document.getElementById('mapSearchInput');
    const locInput = document.getElementById('locationInput');
    const resultsDiv = document.getElementById('search-results');
    const query = input.value.trim();
    const location = (locInput ? locInput.value : '').trim();
    if (!query && !location) return;

    const isRecommend = !query; // 검색어 없으면 지역 추천 모드

    resultsDiv.innerHTML = '<p class="empty-msg">검색 중...</p>';
    try {
        const params = new URLSearchParams();
        if (query) params.set('query', query);
        if (location) params.set('location', location);
        const res = await fetch('/api/search?' + params.toString());
        if (!res.ok) throw new Error('서버 오류');
        const data = await res.json();
        let places = data.places || [];
        if (isRecommend) places = places.slice(0, 5); // 추천은 상위 5곳

        updateMapMarkers(places);

        if (places.length === 0) {
            resultsDiv.innerHTML = '<p class="empty-msg">검색 결과가 없습니다.</p>';
            return;
        }

        const head = isRecommend && location
            ? `<div class="search-head">${escapeHtml(location)} 추천 맛집 ${places.length}곳</div>`
            : '';
        resultsDiv.innerHTML = head + places.map((p) => {
            const mapUrl = p.url || ''; // 카카오맵 상세(지도)
            const dirUrl = (p.lat && p.lng) // 길찾기
                ? `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lng}`
                : '';
            return `
            <div class="search-item" data-name="${escapeHtml(p.name)}" data-url="${escapeHtml(mapUrl)}" data-dir="${escapeHtml(dirUrl)}" data-cat="${escapeHtml(p.category || '')}" data-lat="${p.lat || ''}" data-lng="${p.lng || ''}">
                <div class="search-name">${escapeHtml(p.name)}</div>
                <div class="search-addr">${escapeHtml(p.category || '')}${p.category && p.address ? ' · ' : ''}${escapeHtml(p.address || '')}</div>
            </div>`;
        }).join('');
    } catch (err) {
        resultsDiv.innerHTML = '<p class="empty-msg">검색에 실패했습니다. 잠시 후 다시 시도해 주세요.</p>';
    }
}

/* ==========================================
   6. 카카오 지도
   ========================================== */

// 서버에서 JS 키를 받아 카카오맵 SDK 를 동적 로드
async function loadKakaoMap() {
    const mapBox = document.getElementById('map');
    try {
        const res = await fetch('/api/config');
        const { kakaoJsKey } = await res.json();
        if (!kakaoJsKey) {
            if (mapBox) mapBox.innerHTML = '<div class="map-msg">지도를 보려면 KAKAO_JS_KEY 설정이 필요합니다.</div>';
            return;
        }
        const script = document.createElement('script');
        script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${kakaoJsKey}&autoload=false`;
        script.onload = () => {
            if (!window.kakao || !window.kakao.maps) {
                if (mapBox) mapBox.innerHTML = '<div class="map-msg">지도 SDK 로드 실패<br>(도메인 등록을 확인하세요)</div>';
                return;
            }
            window.kakao.maps.load(() => {
                kakaoReady = true;
                initMap();      // 검색 지도
                initVoteMap();  // 투표 화면 지도
                if (lastVoteData) updateVoteMap(lastVoteData);
            });
        };
        script.onerror = () => {
            console.error('[lunchVote] 카카오맵 SDK 로드 실패. 카카오 콘솔 Web 플랫폼에 사이트 도메인 등록 + JavaScript 키 확인');
            if (mapBox) mapBox.innerHTML = '<div class="map-msg">지도를 불러오지 못했습니다.<br>카카오 도메인 등록을 확인하세요.</div>';
        };
        document.head.appendChild(script);
    } catch (err) {
        if (mapBox) mapBox.innerHTML = '<div class="map-msg">지도를 불러오지 못했습니다.</div>';
    }
}

function initMap() {
    const container = document.getElementById('map');
    if (!container) return;
    container.innerHTML = '';
    kakaoMap = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(37.4979, 127.0276), // 강남 기본
        level: 5,
    });
    kakaoInfo = new kakao.maps.InfoWindow({ zIndex: 1 });
    if (lastPlaces.length) updateMapMarkers(lastPlaces); // 이미 검색한 결과 반영
}

function initVoteMap() {
    const container = document.getElementById('voteMap');
    if (!container) return;
    voteMap = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(37.4979, 127.0276),
        level: 5,
    });
    voteInfo = new kakao.maps.InfoWindow({ zIndex: 1 });
}

// 투표 화면: 후보 식당 좌표로 마커 표시. 좌표 있는 후보가 없으면 지도 카드 숨김.
function updateVoteMap(data) {
    lastVoteData = data;
    const cardEl = document.getElementById('vote-map-card');
    const links = (data && data.links) || {};
    const pts = (data && data.candidates ? data.candidates : [])
        .map((name) => ({ name, ...(links[name] || {}) }))
        .filter((p) => p.lat && p.lng);

    if (!cardEl) return;
    if (pts.length === 0) { cardEl.style.display = 'none'; return; }
    cardEl.style.display = '';

    if (!kakaoReady || !voteMap) return; // SDK 준비되면 다시 호출됨

    voteMarkers.forEach((m) => m.setMap(null));
    voteMarkers = [];
    if (voteInfo) voteInfo.close();

    const bounds = new kakao.maps.LatLngBounds();
    pts.forEach((p) => {
        const pos = new kakao.maps.LatLng(p.lat, p.lng);
        const marker = new kakao.maps.Marker({ position: pos, map: voteMap });
        kakao.maps.event.addListener(marker, 'click', () => {
            voteInfo.setContent(`<div class="map-iw">${escapeHtml(p.name)}</div>`);
            voteInfo.open(voteMap, marker);
        });
        voteMarkers.push(marker);
        bounds.extend(pos);
    });
    voteMap.relayout();
    voteMap.setBounds(bounds);
}

// 검색 결과 좌표로 마커 갱신 + 화면 맞춤
function updateMapMarkers(places) {
    lastPlaces = places;
    if (!kakaoMap || !window.kakao) return;

    kakaoMarkers.forEach((m) => m.setMap(null));
    kakaoMarkers = [];
    if (kakaoInfo) kakaoInfo.close();

    const pts = (places || []).filter((p) => p.lat && p.lng);
    if (pts.length === 0) return;

    const bounds = new kakao.maps.LatLngBounds();
    pts.forEach((p) => {
        const pos = new kakao.maps.LatLng(p.lat, p.lng);
        const marker = new kakao.maps.Marker({ position: pos, map: kakaoMap });
        kakao.maps.event.addListener(marker, 'click', () => {
            kakaoInfo.setContent(`<div class="map-iw">${escapeHtml(p.name)}</div>`);
            kakaoInfo.open(kakaoMap, marker);
        });
        kakaoMarkers.push(marker);
        bounds.extend(pos);
    });

    kakaoMap.relayout();
    kakaoMap.setBounds(bounds);
}

// 기기 판별 후 위치 입력 UI 구성 (모바일=GPS / PC=시·군구 셀렉트)
function setupLocation() {
    const controls = document.getElementById('location-controls');
    const locInput = document.getElementById('locationInput');
    if (!controls || !locInput) return;

    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    if (isMobile) {
        controls.innerHTML = `
            <button onclick="useCurrentLocation()" class="btn-sub btn-loc">현재 위치로 추천</button>
            <div id="loc-label" class="loc-label">현재 지역: ${escapeHtml(locInput.value)}</div>`;
    } else {
        const provinces = Object.keys(REGIONS);
        const provOpts = provinces.map((p) => `<option${p === '서울특별시' ? ' selected' : ''}>${p}</option>`).join('');
        controls.innerHTML = `
            <select id="provinceSelect" class="loc-select">${provOpts}</select>
            <select id="districtSelect" class="loc-select"></select>
            <input id="dongInput" type="text" class="loc-dong" placeholder="동 입력 (선택, 예: 역삼동)">`;

        const prov = document.getElementById('provinceSelect');
        const dist = document.getElementById('districtSelect');
        const dong = document.getElementById('dongInput');
        const fillDistricts = (p, selected) => {
            dist.innerHTML = REGIONS[p].map((d) => `<option${d === selected ? ' selected' : ''}>${d}</option>`).join('');
        };
        const setLoc = () => {
            locInput.value = [prov.value, dist.value, dong.value.trim()].filter(Boolean).join(' ');
        };
        const apply = () => { setLoc(); searchPlaces(); };

        fillDistricts('서울특별시', '강남구');
        setLoc();
        prov.addEventListener('change', () => { fillDistricts(prov.value); apply(); });
        dist.addEventListener('change', apply);
        dong.addEventListener('input', setLoc);
        dong.addEventListener('change', apply);
        dong.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    }

    searchPlaces(); // 기본 지역 추천 맛집 바로 표시
}

// 현재 위치(GPS) → 지역명으로 변환해 지역 입력칸 채우기
function useCurrentLocation() {
    const locInput = document.getElementById('locationInput');
    if (!navigator.geolocation) {
        showToast('이 브라우저에서는 위치 기능을 쓸 수 없어요');
        return;
    }
    const prev = locInput.value;
    locInput.value = '위치 확인 중...';
    navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
            const { latitude, longitude } = pos.coords;
            const res = await fetch(`/api/region?x=${longitude}&y=${latitude}`);
            const data = await res.json();
            locInput.value = data.region || prev;
            const label = document.getElementById('loc-label');
            if (label) label.innerText = `현재 지역: ${locInput.value}`;
            searchPlaces(); // 위치 잡히면 바로 주변 추천
        } catch (err) {
            locInput.value = prev;
            showToast('지역 정보를 가져오지 못했어요');
        }
    }, () => {
        locInput.value = prev;
        showToast('위치 권한이 거부되었거나 가져오지 못했어요');
    });
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

// 맛집 검색 결과 클릭 → 후보 리스트에 추가 (data-name 은 브라우저가 디코딩해 원본 반환)
document.getElementById('search-results').addEventListener('click', (e) => {
    const item = e.target.closest('.search-item');
    if (item && item.dataset.name != null) addMenu(item.dataset.name, item.dataset.url, item.dataset.dir, item.dataset.cat, item.dataset.lat, item.dataset.lng);
});

// Enter 키로 맛집 검색
document.getElementById('mapSearchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        searchPlaces();
    }
});

// 투표 제한 시간 — 휴대폰 타이머식 분/초 휠 피커
const WHEEL_ITEM_H = 36;
let syncTimeWheels = () => {};

function setupTimeWheels() {
    const defs = [
        { el: document.getElementById('wheelMin'), count: 100, get: () => selectedMin, set: (v) => { selectedMin = v; } },
        { el: document.getElementById('wheelSec'), count: 60, get: () => selectedSec, set: (v) => { selectedSec = v; } },
    ];
    const syncers = [];

    defs.forEach(({ el, count, get, set }) => {
        if (!el) return;
        let html = '<div class="wheel-spacer"></div>';
        for (let i = 0; i < count; i++) html += `<div class="wheel-item">${String(i).padStart(2, '0')}</div>`;
        html += '<div class="wheel-spacer"></div>';
        el.innerHTML = html;

        const items = el.querySelectorAll('.wheel-item');
        const highlight = (idx) => items.forEach((it, i) => it.classList.toggle('is-selected', i === idx));

        let t;
        el.addEventListener('scroll', () => {
            const idx = Math.max(0, Math.min(count - 1, Math.round(el.scrollTop / WHEEL_ITEM_H)));
            highlight(idx);
            clearTimeout(t);
            t = setTimeout(() => set(idx), 90);
        });

        // 보일 때 현재값 위치로 스크롤 (display:none 상태에선 scrollTop 적용 안 되므로 따로 호출)
        syncers.push(() => { el.scrollTop = get() * WHEEL_ITEM_H; highlight(get()); });
    });

    syncTimeWheels = () => syncers.forEach((fn) => fn());
}

// 초기화
loadKakaoMap();
setupLocation();
setupTimeWheels();
renderTempList(); // 시작 버튼 초기 상태(비활성) 반영