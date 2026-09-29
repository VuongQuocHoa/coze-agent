# Coze AI Chatbot (Web Agent Tinh Gọn & Thực Dụng)

Giao diện web chat hiện đại dành cho Chatbot Coze, xây dựng hoàn toàn bằng **HTML, CSS và JavaScript thuần**, zero-dependency (không cần cài thêm thư viện npm nặng nề). Ứng dụng hỗ trợ giao thức SSE Streaming thời gian thực, tự động giải quyết CORS và sẵn sàng triển khai lên môi trường web công khai (Render, Vercel, Cloudflare...).

---

## 📁 Cấu trúc dự án

```
coze-agent/
├── index.html       # Giao diện chính (Sidebar, Header, Khung chat, Modal Cài đặt)
├── style.css        # CSS tùy chỉnh thanh cuộn, hiệu ứng 3 chấm và Markdown
├── app.js           # Xử lý sự kiện, lưu lịch sử và đọc SSE Stream thời gian thực
├── server.js        # Server Node.js kiêm Proxy bảo mật API Token và chống CORS
├── package.json     # Cấu hình khởi chạy chuẩn Node.js
├── .env.example     # File mẫu cấu hình biến môi trường
├── .gitignore       # Bỏ qua các file bí mật khi đẩy lên Git
└── README.md        # Tài liệu hướng dẫn sử dụng và triển khai
```

---

## ⚡ Các tính năng chính

1. **Giao diện Chat hiện đại & Responsive**:
   - Sidebar quản lý các đoạn chat, nút **"Đoạn chat mới"**, xóa lịch sử.
   - Tin nhắn phân biệt màu rõ ràng: **Người dùng** (xanh dương, căn phải) và **Bot** (nền tối, căn trái).
   - Tự động cuộn xuống dưới cùng (`scrollToBottom`) khi có chữ mới.

2. **Hỗ trợ Markdown & Nút kết nối Google Sheets**:
   - Tự động định dạng in đậm, danh sách số, bảng biểu.
   - Tô màu mã nguồn (Syntax Highlighting) và nút **"Sao chép" (Copy)** 1-click.
   - **Tự động chuyển đổi liên kết OAuth Google Sheets** thành nút bấm trực quan để người dùng xác thực ghi đơn hàng.

3. **Kết nối Coze API Streaming thời gian thực**:
   - Nhận phản hồi theo luồng **Server-Sent Events (SSE)** giúp chữ hiển thị mượt mà.
   - Đã xử lý triệt để lỗi lặp chữ (deduplication giữa `delta` và `completed`).

4. **Bảo mật và Triển khai linh hoạt**:
   - Hỗ trợ biến môi trường `COZE_API_KEY` và `COZE_BOT_ID` ở phía server (khách truy cập web công khai không cần phải tự nhập token).
   - Cung cấp sẵn Modal cài đặt nhanh nếu người dùng muốn tự đổi Bot ID/Token cá nhân.

---

## 🚀 Cách chạy cục bộ (Localhost)

1. **(Tùy chọn)** Cấu hình biến môi trường:
   Sao chép file `.env.example` thành `.env` và điền thông tin:
   ```bash
   cp .env.example .env
   ```
2. Khởi chạy máy chủ:
   ```bash
   node server.js
   ```
   hoặc:
   ```bash
   npm start
   ```
3. Mở trình duyệt tại: **[http://localhost:3000](http://localhost:3000)**.

---

## 🌐 Triển khai lên Web công khai (Miễn phí 24/7 với Render.com)

1. **Đẩy mã nguồn lên GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: Coze agent ready for deploy"
   # Tạo repository mới trên github.com và chạy:
   git branch -M main
   git remote add origin https://github.com/TÊN_GITHUB/TÊN_REPO.git
   git push -u origin main
   ```

2. **Tạo Web Service trên [Render.com](https://render.com)**:
   - Đăng nhập Render, chọn **New +** -> **Web Service**.
   - Kết nối với Repository GitHub vừa tạo.
   - **Build Command**: để trống (hoặc `npm install` - không có thư viện nên chạy ngay lập tức).
   - **Start Command**: `node server.js`
   - Mục **Environment Variables** (Biến môi trường), thêm 2 biến:
     - `COZE_API_KEY`: Điền Personal Access Token của bạn (`pat_...`)
     - `COZE_BOT_ID`: Điền ID của Bot trên Coze (`7...`)
   - Bấm **Deploy Web Service**.

Sau 1-2 phút, Render sẽ cấp cho bạn một đường link HTTPS công khai (ví dụ: `https://ten-du-an.onrender.com`). Bất kỳ ai truy cập vào link này đều có thể chat và tương tác với Bot ngay lập tức!
