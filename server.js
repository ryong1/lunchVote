const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

// .env 로드 (Node 22+ 내장). 파일 없으면 무시.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* .env 없음 */ }

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/** 쿠키 문자열에서 vid 추출 */
function readVid(cookie) {
    const m = (cookie || '').match(/(?:^|;\s*)vid=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

// 투표자 식별 쿠키(vid) 발급 — 새로고침해도 유지되어 1인 1표를 보장
app.use((req, res, next) => {
    if (!readVid(req.headers.cookie)) {
        const vid = 'v_' + crypto.randomBytes(12).toString('hex');
        res.setHeader('Set-Cookie', `vid=${vid}; Path=/; Max-Age=31536000; SameSite=Lax`);
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// 맛집 검색 프록시 (카카오 로컬 키워드 검색). REST 키는 서버에만 보관.
app.get('/api/search', async (req, res) => {
    const query = (req.query.query || '').toString().trim();
    const location = (req.query.location || '').toString().trim();
    const rect = (req.query.rect || '').toString();
    const hasRect = /^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(rect);

    // rect(지도 범위)가 있으면 그 안에서 검색어로만 검색(지역명 무시), 없으면 지역+검색어
    let keyword;
    if (hasRect) {
        keyword = query || '맛집';
    } else {
        keyword = [location, query].filter(Boolean).join(' ').trim();
        if (location && !query) keyword = location + ' 맛집';
    }
    if (!keyword) return res.json({ places: [] });

    const key = process.env.KAKAO_REST_KEY;
    if (!key) return res.status(500).json({ error: 'KAKAO_REST_KEY 가 설정되지 않았습니다.' });

    try {
        const url = 'https://dapi.kakao.com/v2/local/search/keyword.json'
            + '?query=' + encodeURIComponent(keyword)
            + '&category_group_code=FD6&size=12' // FD6 = 음식점
            + (hasRect ? '&rect=' + encodeURIComponent(rect) : '');
        const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
        if (!r.ok) return res.status(502).json({ error: '카카오 API 응답 오류', status: r.status });

        const data = await r.json();
        const places = (data.documents || []).map((d) => ({
            name: d.place_name,
            address: d.road_address_name || d.address_name || '',
            category: (d.category_name || '').split('>').pop().trim(),
            url: d.place_url,
            lat: parseFloat(d.y),  // 위도
            lng: parseFloat(d.x),  // 경도
        }));
        res.json({ places });
    } catch (err) {
        console.error('맛집 검색 실패:', err);
        res.status(500).json({ error: '검색 처리 중 오류' });
    }
});

// 지도 SDK용 JavaScript 키 전달 (도메인 제한이 걸린 클라이언트 키)
app.get('/api/config', (req, res) => {
    res.json({ kakaoJsKey: process.env.KAKAO_JS_KEY || '' });
});

// 지도 범위(rect) 내 음식점 검색 — "이 지역에서 검색"
app.get('/api/nearby', async (req, res) => {
    const rect = (req.query.rect || '').toString();
    // rect = swLng,swLat,neLng,neLat (숫자 4개)
    if (!/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/.test(rect)) {
        return res.status(400).json({ error: 'rect(좌표 4개)가 필요합니다.' });
    }
    const key = process.env.KAKAO_REST_KEY;
    if (!key) return res.status(500).json({ error: 'KAKAO_REST_KEY 미설정' });

    try {
        const url = 'https://dapi.kakao.com/v2/local/search/category.json'
            + '?category_group_code=FD6&size=15&rect=' + encodeURIComponent(rect);
        const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
        if (!r.ok) return res.status(502).json({ error: '카카오 API 응답 오류', status: r.status });

        const data = await r.json();
        const places = (data.documents || []).map((d) => ({
            name: d.place_name,
            address: d.road_address_name || d.address_name || '',
            category: (d.category_name || '').split('>').pop().trim(),
            url: d.place_url,
            lat: parseFloat(d.y),
            lng: parseFloat(d.x),
        }));
        res.json({ places });
    } catch (err) {
        console.error('지역 검색 실패:', err);
        res.status(500).json({ error: '검색 처리 중 오류' });
    }
});

// 좌표 → 지역명 변환 (현재 위치 버튼용)
app.get('/api/region', async (req, res) => {
    const x = (req.query.x || '').toString();
    const y = (req.query.y || '').toString();
    if (!x || !y) return res.status(400).json({ error: '좌표가 필요합니다.' });

    const key = process.env.KAKAO_REST_KEY;
    if (!key) return res.status(500).json({ error: 'KAKAO_REST_KEY 가 설정되지 않았습니다.' });

    try {
        const url = 'https://dapi.kakao.com/v2/local/geo/coord2regioncode.json'
            + '?x=' + encodeURIComponent(x) + '&y=' + encodeURIComponent(y);
        const r = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` } });
        if (!r.ok) return res.status(502).json({ error: '카카오 API 응답 오류' });

        const data = await r.json();
        const docs = data.documents || [];
        const doc = docs.find((d) => d.region_type === 'H') || docs[0];
        const region = doc
            ? [doc.region_1depth_name, doc.region_2depth_name, doc.region_3depth_name].filter(Boolean).join(' ')
            : '';
        res.json({ region });
    } catch (err) {
        console.error('지역 변환 실패:', err);
        res.status(500).json({ error: '지역 변환 중 오류' });
    }
});

// DB 대신 사용할 메모리 저장소
const rooms = {};

// 입력 제한값
const LIMITS = {
    minMenus: 2,
    maxMenus: 20,
    maxMenuLength: 30,
    minMinutes: 1,
    maxMinutes: 180,
    defaultMinutes: 10,
};

/**
 * 전송 시 클라이언트에 노출하면 안 되는 내부 필드(timeout, adminId)를 제거한다.
 * - timeout: 순환 참조 객체라 직렬화 시 에러를 유발
 * - adminId: 방장의 socket id 노출 방지
 */
function getSafeRoomData(room) {
    if (!room) return null;
    // userVotes(voterId 키)는 브로드캐스트하지 않음 — 내 투표는 initData의 myVote로만 전달
    const { timeout, adminId, userVotes, ...safeData } = room;
    return safeData;
}

/**
 * 클라이언트가 보낸 메뉴 목록을 검증/정규화한다.
 * 문자열 trim, 빈 값 제거, 중복 제거, 길이 제한 적용.
 * @returns {string[]|null} 유효하면 정규화된 배열, 아니면 null
 */
function sanitizeMenus(menus) {
    if (!Array.isArray(menus)) return null;

    const seen = new Set();
    const cleaned = [];
    for (const item of menus) {
        if (typeof item !== 'string') continue;
        const name = item.trim().slice(0, LIMITS.maxMenuLength);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        cleaned.push(name);
        if (cleaned.length >= LIMITS.maxMenus) break;
    }

    return cleaned.length >= LIMITS.minMenus ? cleaned : null;
}

/**
 * 투표 지속 시간을 초 단위로 보정한다.
 * seconds 우선, 없으면 minutes(하위호환), 둘 다 없으면 기본 10분.
 * 범위: 5초 ~ 3시간.
 */
function sanitizeDuration(seconds, minutes) {
    let s = Math.floor(Number(seconds));
    if (!Number.isFinite(s) || s <= 0) {
        const m = Math.floor(Number(minutes));
        s = (Number.isFinite(m) && m > 0) ? m * 60 : LIMITS.defaultMinutes * 60;
    }
    return Math.min(Math.max(s, 5), 180 * 60);
}

io.on('connection', (socket) => {
    console.log('사용자 접속:', socket.id);

    // 1. 방 입장
    socket.on('joinRoom', (payload) => {
        // 하위호환: 문자열(roomId)만 와도 처리
        const roomId = typeof payload === 'string' ? payload : (payload && payload.roomId);
        const rawVoterId = (payload && typeof payload === 'object') ? payload.voterId : null;
        if (typeof roomId !== 'string' || !roomId) return;

        // 식별자 우선순위: 서버 쿠키(vid) > 클라 localStorage(voterId) > socket.id
        const cookieVid = readVid(socket.handshake.headers.cookie);
        const voterId = cookieVid
            || ((typeof rawVoterId === 'string' && rawVoterId) ? rawVoterId.slice(0, 64) : socket.id);

        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.voterId = voterId;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                candidates: [],
                votes: {},
                userVotes: {},
                links: {},
                endTime: null,
                isFinished: false,
                timeUp: false,
                adminId: socket.id,
            };
        }

        socket.emit('initData', {
            isAdmin: rooms[roomId].adminId === socket.id,
            roomData: getSafeRoomData(rooms[roomId]),
            myVote: rooms[roomId].userVotes[voterId] || null, // 이전에 투표한 항목
        });

        io.to(roomId).emit('updateData', getSafeRoomData(rooms[roomId]));
    });

    // 2. 투표 세션 시작
    socket.on('startVoteSession', ({ roomId, menus, seconds, minutes, links } = {}) => {
        const room = rooms[roomId];
        if (!room) return;

        // 진행 중인 투표가 있으면 방장만, 없으면(종료/대기/시작 전) 누구나 시작 가능
        const active = room.candidates.length > 0 && !room.isFinished && !room.timeUp;
        const isRoomAdmin = room.adminId === socket.id;
        if (active && !isRoomAdmin) return;
        if (!isRoomAdmin) {
            room.adminId = socket.id; // 새 투표를 연 사람이 방장
            socket.emit('adminGranted');
        }

        const cleanMenus = sanitizeMenus(menus);
        if (!cleanMenus) {
            socket.emit('voteError', `메뉴는 최소 ${LIMITS.minMenus}개 이상 입력해야 합니다.`);
            return;
        }

        room.candidates = cleanMenus;
        room.votes = {};
        room.userVotes = {};
        cleanMenus.forEach((menu) => {
            room.votes[menu] = 0;
        });

        // 후보별 링크 { map, dir } (http/https URL만 허용)
        const cleanLinks = {};
        if (links && typeof links === 'object') {
            const isUrl = (v) => typeof v === 'string' && /^https?:\/\//.test(v);
            cleanMenus.forEach((menu) => {
                const e = links[menu];
                if (e && typeof e === 'object') {
                    const out = {};
                    if (isUrl(e.map)) out.map = e.map;
                    if (isUrl(e.dir)) out.dir = e.dir;
                    if (typeof e.cat === 'string' && e.cat) out.cat = e.cat.slice(0, 40);
                    if (Number.isFinite(e.lat) && Number.isFinite(e.lng)) { out.lat = e.lat; out.lng = e.lng; }
                    if (out.map || out.dir || out.cat || out.lat) cleanLinks[menu] = out;
                }
            });
        }
        room.links = cleanLinks;

        const duration = sanitizeDuration(seconds, minutes) * 1000;
        room.endTime = Date.now() + duration;
        room.isFinished = false;
        room.timeUp = false;

        if (room.timeout) clearTimeout(room.timeout);

        room.timeout = setTimeout(() => {
            room.timeUp = true; // 시간 종료(대기) — 방장이 종료를 눌러야 확정
            const d = getSafeRoomData(room);
            io.to(roomId).emit('timeUp', d);
            io.to(roomId).emit('updateData', d);
        }, duration);

        const updateData = getSafeRoomData(room);
        io.to(roomId).emit('timerUpdated', room.endTime);
        io.to(roomId).emit('updateData', updateData);

        console.log(`[${roomId}] 투표 시작 완료`);
    });

    // 2-1. 투표 시간 연장 (방장)
    socket.on('extendVote', ({ roomId, seconds } = {}) => {
        const room = rooms[roomId];
        if (!room || room.adminId !== socket.id) return;
        if (!room.candidates.length) return; // 진행할 후보가 있어야 함

        const duration = sanitizeDuration(seconds) * 1000;
        room.endTime = Date.now() + duration;
        room.isFinished = false; // 투표 재개 (표는 유지)
        room.timeUp = false;

        if (room.timeout) clearTimeout(room.timeout);
        room.timeout = setTimeout(() => {
            room.timeUp = true; // 시간 종료(대기) — 방장이 종료를 눌러야 확정
            const d = getSafeRoomData(room);
            io.to(roomId).emit('timeUp', d);
            io.to(roomId).emit('updateData', d);
        }, duration);

        const updateData = getSafeRoomData(room);
        io.to(roomId).emit('timerUpdated', room.endTime);
        io.to(roomId).emit('updateData', updateData);

        console.log(`[${roomId}] 투표 연장`);
    });

    // 2-2. 투표 종료 확정 (방장만)
    socket.on('endVote', ({ roomId } = {}) => {
        const room = rooms[roomId];
        if (!room || room.adminId !== socket.id) return;
        if (room.timeout) clearTimeout(room.timeout);
        room.isFinished = true;
        room.timeUp = false;
        const d = getSafeRoomData(room);
        io.to(roomId).emit('finishVote', d);
        io.to(roomId).emit('updateData', d);
        console.log(`[${roomId}] 투표 종료 확정`);
    });

    // 3. 투표 로직 (클릭 시마다 발생)
    socket.on('castVote', ({ roomId, menuName } = {}) => {
        const room = rooms[roomId];
        if (!room || room.isFinished || room.timeUp) return;
        // 등록된 후보가 아니면 무시 (임의 키 주입 방지)
        if (!Object.prototype.hasOwnProperty.call(room.votes, menuName)) return;

        // 재접속해도 같은 사람으로 인식 (쿠키 vid 우선)
        const voterId = socket.data.voterId || readVid(socket.handshake.headers.cookie) || socket.id;
        const previousVote = room.userVotes[voterId];

        if (previousVote === menuName) {
            room.votes[menuName] = Math.max(0, (room.votes[menuName] || 0) - 1);
            delete room.userVotes[voterId];
        } else {
            if (previousVote) {
                room.votes[previousVote] = Math.max(0, (room.votes[previousVote] || 0) - 1);
            }
            room.votes[menuName] = (room.votes[menuName] || 0) + 1;
            room.userVotes[voterId] = menuName;
        }

        io.to(roomId).emit('updateData', getSafeRoomData(room));
    });

    // 4. 접속 해제: 방장 이탈 시 인계, 빈 방 정리
    socket.on('disconnect', async () => {
        console.log('접속 해제:', socket.id);

        const roomId = socket.data.roomId;
        const room = roomId && rooms[roomId];
        if (!room) return;

        if (room.adminId !== socket.id) return;

        // 방에 남아있는 다른 소켓을 찾아 방장 인계
        const remaining = (await io.in(roomId).fetchSockets()).filter((s) => s.id !== socket.id);

        if (remaining.length > 0) {
            const nextAdmin = remaining[0];
            room.adminId = nextAdmin.id;
            io.to(nextAdmin.id).emit('adminGranted');
            console.log(`[${roomId}] 방장 인계: ${socket.id} -> ${nextAdmin.id}`);
        } else {
            // 아무도 없으면 방과 타이머 정리 (메모리 누수 방지)
            if (room.timeout) clearTimeout(room.timeout);
            delete rooms[roomId];
            console.log(`[${roomId}] 방 정리됨`);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`서버가 성공적으로 실행되었습니다: http://localhost:${PORT}`);
});
