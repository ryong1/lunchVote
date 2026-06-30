/* ==========================================
   1. 초기 설정 및 전역 변수
   ========================================== */
let isAdmin = false;
let timerInterval = null;
let tempMenus = [];
let selectedMin = 10; // 투표 제한 시간(분)
let selectedSec = 0;  // 투표 제한 시간(초)
let socket = null;

// 지도 상태
let kakaoMap = null;
let kakaoMarkers = [];
let kakaoInfo = null;
let lastPlaces = [];

// 모든 후보 동일 색 (분홍으로 통일)
const BAR_COLORS = [
    { fill: '#FFE3E3', edge: '#E89AAC' },
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

// socket.io 클라이언트가 로드된 경우에만 연결한다.
// (Node 서버가 아닌 VS Code Live Server(:5500) 등으로 열면 /socket.io/socket.io.js 가 없어 io 가 undefined)
if (typeof io !== 'undefined') {
    socket = io();
    socket.emit('joinRoom', roomId);
} else {
    console.error('[lunchVote] socket.io 를 불러오지 못했습니다. `npm start` 후 http://localhost:3000 으로 접속하세요. (Live Server(:5500)에서는 실시간 기능이 동작하지 않습니다.)');
    socket = { on() {}, emit() {} }; // 스크립트가 중단되지 않도록 안전한 스텁
}

/* ==========================================
   2. 소켓 이벤트 리스너 (실시간 업데이트)
   ========================================== */

socket.on('initData', (data) => {
    isAdmin = data.isAdmin;
    
    const adminBox = document.getElementById('admin-controls');
    if (adminBox) adminBox.style.display = isAdmin ? 'block' : 'none';
    if (isAdmin) requestAnimationFrame(syncTimeWheels);

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
    showToast(message);
});

/* ==========================================
   3. 메뉴 등록 로직
   ========================================== */

// 후보 추가 공통 로직 (직접 입력 / 맛집 검색 둘 다 사용)
function addMenu(name) {
    name = (name || '').trim();
    if (!name) return false;
    if (tempMenus.includes(name)) {
        showToast('이미 추가된 메뉴예요');
        return false;
    }
    tempMenus.push(name);
    renderTempList();
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
        showToast('메뉴를 2개 이상 추가해 주세요');
        return;
    }

    const totalSeconds = selectedMin * 60 + selectedSec;
    if (totalSeconds < 5) {
        showToast('투표 시간을 설정해 주세요');
        return;
    }

    console.log("투표 시작 시도:", { roomId, menus: tempMenus, seconds: totalSeconds });

    // 1. 서버에 데이터 전송
    socket.emit('startVoteSession', {
        roomId: roomId,
        menus: tempMenus,
        seconds: totalSeconds
    });

    

    // 2. 중요: 바로 showPage를 하지 않고 리스트 영역에 '로딩' 표시를 먼저 합니다.
    const listDiv = document.getElementById('menuList');
    if (listDiv) listDiv.innerHTML = '<p class="empty-info">서버와 통신 중...</p>';
    
    // 3. 페이지는 일단 이동시키되, 실제 그림은 서버 응답(updateData)이 올 때 그려집니다.
    showPage('view-main');

    // 4. 임시 데이터 비우기
    tempMenus = [];
    renderTempList();
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
        // 숨겨졌다 보일 때 지도 크기 재계산 + 휠 위치 동기화
        if (pageId === 'view-add') {
            requestAnimationFrame(syncTimeWheels);
            if (kakaoMap) {
                kakaoMap.relayout();
                if (lastPlaces.length) updateMapMarkers(lastPlaces);
            }
        }
    }
}

function render(data, isFinished = false) {
    const listDiv = document.getElementById('menuList');
    if (!listDiv) return;

    if (!data || !data.candidates || data.candidates.length === 0) {
        listDiv.innerHTML = '<p class="empty-info">방장이 메뉴를 등록 중입니다...</p>';
        return;
    }
    
    listDiv.innerHTML = '';
    const sorted = [...data.candidates];
    if (isFinished && data.votes) {
        sorted.sort((a, b) => (data.votes[b] || 0) - (data.votes[a] || 0));
    }

    const voteValues = data.votes ? Object.values(data.votes) : [];
    const maxVotes = Math.max(...voteValues, 0);
    const totalVotes = voteValues.reduce((sum, v) => sum + v, 0);

    // 참여 현황 요약
    const summary = document.createElement('div');
    summary.className = 'vote-summary';
    summary.textContent = isFinished ? `투표 종료 · 총 ${totalVotes}표` : `총 ${totalVotes}표`;
    listDiv.appendChild(summary);

    // 후보별 고유 색을 등록 순서로 고정 (정렬돼도 색 유지)
    const colorOf = {};
    data.candidates.forEach((m, i) => { colorOf[m] = BAR_COLORS[i % BAR_COLORS.length]; });

    sorted.forEach(menu => {
        const votes = (data.votes && data.votes[menu]) || 0;
        const isWinner = isFinished && votes === maxVotes && maxVotes > 0;
        const isMyVote = data.userVotes && data.userVotes[socket.id] === menu;
        // 막대 너비: 최다 득표를 100% 기준으로 환산
        const pct = maxVotes > 0 ? Math.round((votes / maxVotes) * 100) : 0;
        const share = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
        const c = colorOf[menu] || BAR_COLORS[0];

        const safeMenu = escapeHtml(menu);
        const div = document.createElement('div');
        div.className = `menu-item ${isWinner ? 'winner' : ''} ${isMyVote ? 'voted' : ''}`;
        div.style.cssText = `--fill:${c.fill};--edge:${c.edge}`;
        div.innerHTML = `
            <div class="menu-bar" style="width:${pct}%"></div>
            <div class="menu-row">
                <div class="menu-info">
                    <span class="menu-dot"></span>
                    <span class="menu-name">${safeMenu}</span>
                    <span class="vote-share">${share}%</span>
                </div>
                <div class="vote-section">
                    <span class="vote-count">${votes}표</span>
                    ${!isFinished ? `
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
        resultsDiv.innerHTML = head + places.map((p) => `
            <div class="search-item" data-name="${escapeHtml(p.name)}">
                <div class="search-name">${escapeHtml(p.name)}</div>
                <div class="search-addr">${escapeHtml(p.category || '')}${p.category && p.address ? ' · ' : ''}${escapeHtml(p.address || '')}</div>
            </div>
        `).join('');
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
            window.kakao.maps.load(initMap);
        };
        script.onerror = () => {
            console.error('[lunchVote] 카카오맵 SDK 로드 실패. ① 카카오 콘솔 Web 플랫폼에 http://localhost:3000 등록 ② JavaScript 키 확인');
            if (mapBox) mapBox.innerHTML = '<div class="map-msg">지도를 불러오지 못했습니다.<br>도메인 등록(http://localhost:3000)을 확인하세요.</div>';
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
            <select id="districtSelect" class="loc-select"></select>`;

        const prov = document.getElementById('provinceSelect');
        const dist = document.getElementById('districtSelect');
        const fillDistricts = (p, selected) => {
            dist.innerHTML = REGIONS[p].map((d) => `<option${d === selected ? ' selected' : ''}>${d}</option>`).join('');
        };
        const apply = () => { locInput.value = `${prov.value} ${dist.value}`; searchPlaces(); };

        fillDistricts('서울특별시', '강남구');
        prov.addEventListener('change', () => { fillDistricts(prov.value); apply(); });
        dist.addEventListener('change', apply);
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
    if (item && item.dataset.name != null) addMenu(item.dataset.name);
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