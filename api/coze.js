/**
 * Vercel Serverless Function: /api/coze
 * Proxy trung gian chuyển tiếp request đến Coze API (v3/chat)
 * - Hỗ trợ SSE Streaming thời gian thực
 * - Tự động nạp COZE_API_KEY và COZE_BOT_ID từ biến môi trường Vercel
 * - Giải quyết triệt để CORS
 */

const https = require('https');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-coze-host');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // Lấy dữ liệu body (hỗ trợ cả khi Vercel tự parse hoặc nhận stream)
  let payload = req.body;
  if (!payload || (typeof payload === 'object' && Object.keys(payload).length === 0 && !req.readableEnded)) {
    let raw = '';
    await new Promise((resolve) => {
      req.on('data', chunk => { raw += chunk; });
      req.on('end', resolve);
    });
    if (raw) {
      try { payload = JSON.parse(raw); } catch (e) { payload = {}; }
    }
  }

  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
  }

  if (!payload || typeof payload !== 'object') {
    payload = {};
  }

  // Đọc cấu hình từ biến môi trường Vercel
  const ENV_API_KEY = process.env.COZE_API_KEY || '';
  const ENV_BOT_ID = process.env.COZE_BOT_ID || '';

  if (!payload.bot_id && ENV_BOT_ID) {
    payload.bot_id = ENV_BOT_ID;
  }

  const authHeader = req.headers['authorization'] || (ENV_API_KEY ? `Bearer ${ENV_API_KEY}` : '');
  const targetHost = req.headers['x-coze-host'] || 'api.coze.com';

  if (!payload.bot_id) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Missing bot_id',
      message: 'Chưa cấu hình Bot ID. Vui lòng thiết lập biến môi trường COZE_BOT_ID trên Vercel hoặc nhập trong Cài đặt Bot.'
    }));
    return;
  }

  if (!authHeader) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      error: 'Missing API Key',
      message: 'Chưa cấu hình API Key. Vui lòng thiết lập biến môi trường COZE_API_KEY trên Vercel hoặc nhập trong Cài đặt Bot.'
    }));
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

  return new Promise((resolve) => {
    const proxyReq = https.request(proxyOptions, (proxyRes) => {
      proxyRes.on('error', (err) => {
        console.error('Lỗi stream proxyRes Vercel:', err.message);
      });

      res.on('error', (err) => {
        console.error('Lỗi kết nối client res Vercel:', err.message);
      });

      res.on('close', () => {
        proxyReq.destroy();
        resolve();
      });

      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive'
      });

      proxyRes.pipe(res);
      proxyRes.on('end', () => resolve());
    });

    proxyReq.on('error', (err) => {
      console.error('Lỗi Coze Proxy:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
      }
      resolve();
    });

    proxyReq.write(finalBody);
    proxyReq.end();
  });
};
