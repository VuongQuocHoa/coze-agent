import requests

# Đường dẫn API bạn muốn gọi (thay bằng API thực tế của bạn)
url = "https://example.com"
headers = {
    "Authorization": "Bearer YOUR_API_KEY_HERE"
}

try:
    response = requests.get(url, headers=headers)
    
    # 1. Kiểm tra xem API có trả về các thông tin quota trong Header không
    # Tên header có thể thay đổi tùy thuộc vào từng nhà cung cấp dịch vụ (ví dụ: GitHub, OpenAI, Google)
    total_quota = response.headers.get("x-ratelimit-limit")
    remaining_quota = response.headers.get("x-ratelimit-remaining")
    reset_time = response.headers.get("x-ratelimit-reset")
    
    print("--- KIỂM TRA QUOTA ---")
    if remaining_quota:
        print(f"Tổng quota cho phép: {total_quota}")
        print(f"Số lượt còn lại: {remaining_quota}")
        print(f"Thời gian reset (Timestamp): {reset_time}")
    else:
        print("API này không trả về thông tin quota qua Header, hoặc tên Header khác biệt.")
        # Bạn có thể in toàn bộ header ra để kiểm tra xem họ đặt tên là gì:
        # print(response.headers)

except Exception as e:
    print(f"Có lỗi xảy ra khi gọi API: {e}")
