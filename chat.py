import os
import sys
import json
import re
import requests

# Tự động nạp file .env nếu có (không cần thư viện bên ngoài)
env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip().strip("'\""))

# ==============================================================
# CẤU HÌNH THÔNG TIN BOT COZE
# (Được nạp tự động từ .env hoặc biến môi trường)
# ==============================================================
COZE_API_KEY = os.getenv("COZE_API_KEY", "")
COZE_BOT_ID  = os.getenv("COZE_BOT_ID", "")
USER_ID      = "user_python_agent"
CURRENT_CONVERSATION_ID = None

def ask_coze(prompt: str) -> str:
    """
    Gửi câu hỏi đến Coze API và in câu trả lời chạy từng từ (stream) ra màn hình.
    Tự động ghi nhớ toàn bộ ngữ cảnh các câu hỏi trước đó.
    """
    global CURRENT_CONVERSATION_ID
    url = "https://api.coze.com/v3/chat"
    if CURRENT_CONVERSATION_ID:
        url += f"?conversation_id={CURRENT_CONVERSATION_ID}"

    headers = {
        "Authorization": f"Bearer {COZE_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "bot_id": COZE_BOT_ID,
        "user_id": USER_ID,
        "stream": True,
        "additional_messages": [
            {
                "role": "user",
                "content": prompt,
                "content_type": "text"
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, json=payload, stream=True)
        response.raise_for_status()

        current_event = ""
        full_answer = []

        for line in response.iter_lines():
            if not line:
                continue

            decoded_line = line.decode("utf-8").strip()

            # Bắt tên sự kiện SSE
            if decoded_line.startswith("event:"):
                current_event = decoded_line.replace("event:", "").strip()
                continue

            if not decoded_line.startswith("data:"):
                continue

            data_str = decoded_line.replace("data:", "", 1).strip()
            if data_str == "[DONE]":
                break

            try:
                event_data = json.loads(data_str)
                if not isinstance(event_data, dict):
                    continue

                # Lưu conversation_id để ghi nhớ ngữ cảnh cho lượt chat tiếp theo
                if event_data.get("conversation_id"):
                    CURRENT_CONVERSATION_ID = event_data.get("conversation_id")

                # Bỏ qua các gói tin kỹ thuật nội bộ (verbose, generate_answer_finish, v.v.)
                msg_type = event_data.get("type")
                content = event_data.get("content", "")
                if msg_type == "verbose" or "generate_answer_finish" in str(content):
                    continue

                # Chỉ in ra màn hình các từ trong câu trả lời (type: answer)
                is_answer = msg_type == "answer" or (not msg_type and event_data.get("role") == "assistant")
                if current_event == "conversation.message.delta" and is_answer:
                    if content:
                        text_chunk = str(content)
                        # Loại bỏ token cancel_oauth và các chuỗi ủy quyền hệ thống
                        text_chunk = re.sub(r'cancel_oauth[a-zA-Z0-9_\-]+', '', text_chunk)
                        text_chunk = re.sub(r'授权后即代表[^\n]*', '', text_chunk)
                        if text_chunk:
                            sys.stdout.write(text_chunk)
                            sys.stdout.flush()
                            full_answer.append(text_chunk)

            except (json.JSONDecodeError, AttributeError, TypeError):
                continue

        print()  # Xuống dòng khi bot trả lời xong
        return "".join(full_answer)

    except requests.exceptions.RequestException as e:
        print(f"\n❌ Lỗi kết nối Coze API: {e}")
        return ""

if __name__ == "__main__":
    print("=" * 60)
    print("🤖 CHATBOT COZE - BẢN 1 FILE PYTHON DUY NHẤT")
    print("Gõ câu hỏi và nhấn Enter. Gõ 'exit' hoặc 'quit' để thoát.")
    print("=" * 60)

    if not COZE_API_KEY or not COZE_BOT_ID or "pat_xxx" in COZE_API_KEY or "7xxx" in COZE_BOT_ID:
        print("⚠️ Chú ý: Hãy mở file '.env' và điền COZE_API_KEY cùng COZE_BOT_ID của bạn!\n")

    print("\n🤖 Bot: Chào bạn! Tôi có thể giúp gì cho bạn hôm nay? Nếu bạn đang có nhu cầu đặt hàng, xin vui lòng cung cấp cho tôi các thông tin sau:\n")
    print("1. Tên khách hàng:")
    print("2. Số điện thoại:")
    print("3. Địa chỉ nhận hàng:")
    print("4. Tên sản phẩm:\n")
    print("Cảm ơn bạn!")

    while True:
        try:
            user_input = input("\n👤 Bạn: ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit", "thoat"]:
                print("Tạm biệt bạn!")
                break

            print("🤖 Bot: ", end="", flush=True)
            ask_coze(user_input)

        except KeyboardInterrupt:
            print("\nĐã dừng chương trình.")
            break
