const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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
    const { timeout, adminId, ...safeData } = room;
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

/** 분 단위 입력을 안전한 범위로 보정한다. */
function sanitizeMinutes(minutes) {
    const n = Math.floor(Number(minutes));
    if (!Number.isFinite(n) || n <= 0) return LIMITS.defaultMinutes;
    return Math.min(Math.max(n, LIMITS.minMinutes), LIMITS.maxMinutes);
}

io.on('connection', (socket) => {
    console.log('사용자 접속:', socket.id);

    // 1. 방 입장
    socket.on('joinRoom', (roomId) => {
        if (typeof roomId !== 'string' || !roomId) return;
        socket.join(roomId);
        socket.data.roomId = roomId;

        if (!rooms[roomId]) {
            rooms[roomId] = {
                candidates: [],
                votes: {},
                userVotes: {},
                endTime: null,
                isFinished: false,
                adminId: socket.id,
            };
        }

        socket.emit('initData', {
            isAdmin: rooms[roomId].adminId === socket.id,
            roomData: getSafeRoomData(rooms[roomId]),
        });

        io.to(roomId).emit('updateData', getSafeRoomData(rooms[roomId]));
    });

    // 2. 투표 세션 시작
    socket.on('startVoteSession', ({ roomId, menus, minutes } = {}) => {
        const room = rooms[roomId];
        if (!room || room.adminId !== socket.id) return;

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

        const duration = sanitizeMinutes(minutes) * 60000;
        room.endTime = Date.now() + duration;
        room.isFinished = false;

        if (room.timeout) clearTimeout(room.timeout);

        room.timeout = setTimeout(() => {
            room.isFinished = true;
            const finishData = getSafeRoomData(room);
            io.to(roomId).emit('finishVote', finishData);
            io.to(roomId).emit('updateData', finishData);
        }, duration);

        const updateData = getSafeRoomData(room);
        io.to(roomId).emit('timerUpdated', room.endTime);
        io.to(roomId).emit('updateData', updateData);

        console.log(`[${roomId}] 투표 시작 완료`);
    });

    // 3. 투표 로직 (클릭 시마다 발생)
    socket.on('castVote', ({ roomId, menuName } = {}) => {
        const room = rooms[roomId];
        if (!room || room.isFinished) return;
        // 등록된 후보가 아니면 무시 (임의 키 주입 방지)
        if (!Object.prototype.hasOwnProperty.call(room.votes, menuName)) return;

        const previousVote = room.userVotes[socket.id];

        if (previousVote === menuName) {
            room.votes[menuName] = Math.max(0, (room.votes[menuName] || 0) - 1);
            delete room.userVotes[socket.id];
        } else {
            if (previousVote) {
                room.votes[previousVote] = Math.max(0, (room.votes[previousVote] || 0) - 1);
            }
            room.votes[menuName] = (room.votes[menuName] || 0) + 1;
            room.userVotes[socket.id] = menuName;
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
