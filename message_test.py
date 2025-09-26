import requests

resp = requests.post(
    "http://localhost:6543/send",
    json={
        "phone": "67412231",
        "message": "DLLM呀，這是測試訊息 🚀",
        # "image_path": "assets\\favicon.png",
        # "pdf_path": "assets\\DiDi.pdf",
    },
)
print(resp.json())
