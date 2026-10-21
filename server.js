/**
 * Optional Local Proxy Server (Không cần cài thư viện ngoài - Chạy bằng Node.js thuần)
 * 
 * Mục đích:
 * 1. Chạy static web server phục vụ file frontend (index.html, style.css, app.js).
 * 2. Làm Proxy trung gian chuyển tiếp request đến Coze API để giải quyết triệt để lỗi CORS
 *    và bảo mật API key nếu bạn không muốn lộ token ở frontend.
 * 
 * Cách chạy:
 *   node server.js
 * Sau đó mở trình duyệt tại: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Tự động nạp hoặc nạp lại file .env mỗi khi có thay đổi (Hot Reload không cần restart server)
const envPath = path.join(__dirname, '.env');
function reloadEnv() {
  let mtime = 0;
  if (fs.existsSync(envPath)) {
    try {
      const stats = fs.statSync(envPath);
      mtime = stats.mtimeMs;
      const envContent = fs.readFileSync(envPath, 'utf8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            process.env[key] = val;
          }
        }
      });
    } catch (e) {}
  }
  return mtime;
}
reloadEnv();

const PORT = process.env.PORT || 3000;
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  // CORS Headers cho mọi request nội bộ
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-config-updated-at, x-coze-host');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  // Endpoint kiểm tra nguồn cấu hình và thời gian sửa đổi gần nhất
  if (pathname === '/api/config' && req.method === 'GET') {
    const envMtime = reloadEnv();
    const hasEnv = fs.existsSync(envPath);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      hasEnv,
      envMtime,
      hasApiKey: !!process.env.COZE_API_KEY,
      hasBotId: !!process.env.COZE_BOT_ID,
      botId: process.env.COZE_BOT_ID || ''
    }));
    return;
  }

  // Endpoint Proxy cho Coze API: /api/coze
  if (pathname === '/api/coze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const envMtime = reloadEnv();
      const ENV_API_KEY = process.env.COZE_API_KEY || '';
      const ENV_BOT_ID = process.env.COZE_BOT_ID || '';

      let payload = {};
      try { payload = JSON.parse(body); } catch (e) {}

      // Lấy thời điểm cấu hình của người dùng trên Web (timestamp)
      const clientConfigUpdatedAt = Number(req.headers['x-config-updated-at'] || payload.config_updated_at || 0);

      // QUY TẮC CẬP NHẬT THEO THAO TÁC MỚI NHẤT:
      // 1. Nếu file .env sửa đổi MỚI HƠN thao tác người dùng lưu trên Web -> Ưu tiên dùng .env
      // 2. Nếu người dùng lưu trên Web MỚI HƠN file .env -> Ưu tiên dùng Web
      const isEnvNewer = envMtime > clientConfigUpdatedAt;

      const clientApiKey = req.headers['authorization'] ? req.headers['authorization'].replace(/^Bearer\s+/i, '').trim() : '';
      const clientBotId = (payload.bot_id || '').trim();

      let finalBotId = '';
      let finalApiKey = '';

      if (isEnvNewer) {
        finalBotId = ENV_BOT_ID || clientBotId;
        finalApiKey = ENV_API_KEY || clientApiKey;
      } else {
        finalBotId = clientBotId || ENV_BOT_ID;
        finalApiKey = clientApiKey || ENV_API_KEY;
      }

      payload.bot_id = finalBotId;
      const authHeader = finalApiKey ? `Bearer ${finalApiKey}` : '';
      const targetHost = req.headers['x-coze-host'] || 'api.coze.com';

      // Kiểm tra tính hợp lệ
      if (!payload.bot_id) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing bot_id', message: 'Chưa cấu hình Bot ID. Vui lòng thiết lập trong file .env hoặc nhập trong Cài đặt Bot.' }));
        return;
      }
      if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Missing API Key', message: 'Chưa cấu hình API Key. Vui lòng thiết lập trong file .env hoặc nhập trong Cài đặt Bot.' }));
        return;
      }

      // Hỗ trợ duy trì ngữ cảnh và lịch sử hội thoại (Coze conversation_id)
      const convId = requestUrl.searchParams.get('conversation_id') || payload.conversation_id || '';
      let targetPath = '/v3/chat';
      if (convId) {
        targetPath += `?conversation_id=${encodeURIComponent(convId)}`;
      }
      delete payload.conversation_id;

      const finalBody = JSON.stringify(payload);

      const proxyOptions = {
        hostname: targetHost,
        port: 443,
        path: targetPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
          'Content-Length': Buffer.byteLength(finalBody)
        }
      };

      const proxyReq = https.request(proxyOptions, (proxyRes) => {
        proxyRes.on('error', (err) => {
          console.error('Lỗi stream proxyRes:', err.message);
        });

        res.on('error', (err) => {
          console.error('Lỗi kết nối client res:', err.message);
        });

        res.on('close', () => {
          proxyReq.destroy();
        });

        // Stream phản hồi trực tiếp về frontend (Hỗ trợ SSE Streaming)
        res.writeHead(proxyRes.statusCode, {
          ...proxyRes.headers,
          'Access-Control-Allow-Origin': '*'
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        console.error('Lỗi Coze Proxy:', err.message);
        if (!res.headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
        }
      });

      proxyReq.write(finalBody);
      proxyReq.end();
    });
    return;
  }

  // Phục vụ Static Files (index.html, style.css, app.js)
  let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`500 Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Cổng ${PORT} đang được sử dụng bởi một tiến trình khác.`);
    console.error(`💡 Cách xử lý: Hãy tắt tiến trình cũ hoặc dùng lệnh: Stop-Process -Name node -Force\n`);
    process.exit(1);
  } else {
    console.error('Lỗi máy chủ:', err);
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log('==================================================');
  console.log(`🚀 Coze Chat Server đang chạy tại: http://localhost:${PORT}`);
  console.log(`📡 Proxy endpoint giải quyết CORS: http://localhost:${PORT}/api/coze`);
  console.log('==================================================');
});

process.on('uncaughtException', (err) => {
  console.error('Lỗi ngoại lệ Uncaught Exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('Lỗi Unhandled Rejection:', reason);
});
