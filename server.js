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

// Tự động nạp file .env nếu có (không cần thư viện bên ngoài)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  });
}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  // Endpoint Proxy cho Coze API: /api/coze
  if (pathname === '/api/coze' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Đọc token và bot_id từ biến môi trường của máy chủ nếu frontend không truyền lên
      const ENV_API_KEY = process.env.COZE_API_KEY || '';
      const ENV_BOT_ID = process.env.COZE_BOT_ID || '';

      let payload = {};
      try { payload = JSON.parse(body); } catch (e) {}

      if (!payload.bot_id && ENV_BOT_ID) {
        payload.bot_id = ENV_BOT_ID;
      }

      const authHeader = req.headers['authorization'] || (ENV_API_KEY ? `Bearer ${ENV_API_KEY}` : '');
      const targetHost = req.headers['x-coze-host'] || 'api.coze.com';

      // Kiểm tra tính hợp lệ
      if (!payload.bot_id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing bot_id', message: 'Chưa cấu hình Bot ID. Vui lòng thiết lập biến môi trường COZE_BOT_ID trên máy chủ hoặc nhập trong Cài đặt Bot.' }));
        return;
      }
      if (!authHeader) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing API Key', message: 'Chưa cấu hình API Key. Vui lòng thiết lập biến môi trường COZE_API_KEY trên máy chủ hoặc nhập trong Cài đặt Bot.' }));
        return;
      }

      const finalBody = JSON.stringify(payload);

      const proxyOptions = {
        hostname: targetHost,
        port: 443,
        path: '/v3/chat',
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
