# Chơi Sinh Tử Môn với bạn bè Ở XA (LAN ảo qua ZeroTier)

Chế độ **Đối kháng → Mạng LAN** cần mọi người ở cùng một mạng LAN. Nếu bạn bè
**không ngồi cùng phòng/cùng router**, ta dùng **ZeroTier** để tạo một **LAN ảo**:
mọi máy (dù ở đâu trên Internet) nhận một IP ảo và "thấy nhau" như đang chung LAN.

> Mỗi người trong nhóm (bạn + tất cả bạn bè) đều phải cài ZeroTier và vào **cùng một Network ID**.
> Trên máy chủ, ZeroTier **đã được cài sẵn** (node address in ra khi chạy `zerotier-cli info`).

---

## A. NGƯỜI LÀM CHỦ PHÒNG (chạy server + tạo mạng ảo)

### 1) Tạo mạng ảo (một lần duy nhất)
1. Vào **https://my.zerotier.com/** → đăng ký/đăng nhập (miễn phí, tối đa 25 thiết bị).
2. Bấm **Create A Network**. Bạn sẽ có một **Network ID** 16 ký tự, ví dụ `8056c2e21c000001`.
3. Mở network vừa tạo, phần **Settings**: để **Access Control = Private** (mặc định) cho an toàn.

### 2) Cho máy chủ vào mạng ảo
```bash
sudo zerotier-cli join <NETWORK_ID>        # ví dụ: sudo zerotier-cli join 8056c2e21c000001
```
Sau đó **vào lại trang my.zerotier.com → network của bạn → mục Members**: tìm máy vừa xuất hiện,
**tick vào ô Auth** để cho phép (và có thể đặt tên cho dễ nhớ).

### 3) Xem IP ảo được cấp
```bash
sudo zerotier-cli listnetworks
```
Cột cuối là IP ảo, ví dụ `192.168.191.10/24` hoặc `10.147.20.10/24`. **Nhớ IP này.**

### 4) Chạy server game
```bash
cd ~/Desktop/SinhTuMon
node server.js          # hoặc ./run.sh
```
Cửa sổ server sẽ tự in ra dòng **"Bạn bè Ở XA qua LAN ẢO (VPN) mở: http://<IP-ảo>:8090/"**.
→ **Gửi đúng địa chỉ đó** (kèm **Network ID**) cho bạn bè.

### 5) Vào game
- Trên máy chủ mở `http://localhost:8090/`.
- Chọn **⚔ → tab 🌐 Mạng LAN → Vào phòng**. Bạn là chủ phòng; bấm **Bắt đầu** khi đủ ≥2 người.

---

## B. BẠN BÈ (join từ xa)

### 1) Cài ZeroTier
- **Linux (Debian/Kali/Ubuntu):**
  ```bash
  curl -s https://install.zerotier.com | sudo bash
  ```
- **Windows / macOS:** tải bộ cài tại **https://www.zerotier.com/download/** rồi cài như phần mềm thường.

### 2) Vào cùng mạng ảo (dùng Network ID chủ phòng gửi)
- **Linux:**
  ```bash
  sudo zerotier-cli join <NETWORK_ID>
  ```
- **Windows/macOS:** mở app ZeroTier ở khay hệ thống → **Join Network** → dán **Network ID**.

### 3) Chờ chủ phòng duyệt
Chủ phòng vào my.zerotier.com **tick Auth** cho máy bạn thì bạn mới có IP ảo.

### 4) Vào game
Mở trình duyệt tới **địa chỉ chủ phòng đã gửi**, ví dụ `http://192.168.191.10:8090/`
→ chọn **⚔ → tab 🌐 Mạng LAN → Vào phòng**. Đợi chủ phòng bấm **Bắt đầu**.

> Trong tab Mạng LAN, nếu hiện **"✅ Máy chủ LAN sẵn sàng"** là nối được. Nếu hiện cảnh báo,
> kiểm tra lại: đã mở đúng địa chỉ IP-ảo:8090 chưa, chủ phòng đã chạy `node server.js` chưa,
> cả hai đã được **Auth** trong cùng Network ID chưa.

---

## C. Kiểm tra nhanh & xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `zerotier-cli listnetworks` báo `ACCESS_DENIED` | Chủ phòng chưa **tick Auth** cho máy bạn trên my.zerotier.com |
| Không thấy IP ảo (cột cuối trống) | Chờ vài giây sau khi được Auth; hoặc `sudo systemctl restart zerotier-one` |
| Ping thử: `ping <IP-ảo-chủ-phòng>` | Nếu ping được mà web không vào → server chưa chạy hoặc sai cổng |
| Server không in dòng "LAN ẢO" | Interface `zt*` chưa lên — kiểm tra `sudo zerotier-cli listnetworks` có `OK` chưa, rồi **khởi động lại server** |
| Muốn dừng mạng ảo | `sudo zerotier-cli leave <NETWORK_ID>` |

**Bảo mật:** để network ở chế độ **Private** và chỉ Auth đúng máy bạn bè. Bất kỳ ai có Network ID mà
bạn Auth mới vào được. Cổng 8090 chỉ mở trong mạng ảo, không lộ ra Internet công cộng.
