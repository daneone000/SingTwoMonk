# Sinh Tử Môn — Bản Local (tái tạo bản gốc ZingPlay)

Bản dựng lại chạy trên trình duyệt của game thủ thành **Sinh Tử Môn** (VNG/ZingPlay) —
huyền thoại từng thống trị quán net Việt Nam **2008–2012**, phong cách *"custom map
Tower Defense của Warcraft 3"*.

> ⚠️ **Không phải source gốc.** Game gốc là sản phẩm độc quyền của VNG, không có mã
> nguồn công khai. Đây là bản **tái tạo (clone) độc lập**, thiết kế bám theo **trang
> hướng dẫn chính thức play.zing.vn** (khôi phục từ Wayback Machine). Không dùng bất
> kỳ tài nguyên nào của bản gốc — đồ hoạ vẽ 100% bằng Canvas.

## Chạy game

Không cần cài đặt. Hai cách:

```bash
./run.sh                 # tự chọn cổng trống rồi mở trình duyệt (mặc định 8090)
```
hoặc mở thẳng `index.html` (double-click). *(Lưu ý: cổng 8080 trên máy đang bị một
API khác chiếm — dùng 8090.)*

## Đây là Tower Defense kiểu **MÊ CUNG** (đúng bản gốc)

Khác với TD đường cố định: bản đồ gồm ô **Đất** (xây được, quái đi được) và **Nước**
(cấm). Quái **luôn tự tìm đường ngắn nhất** từ cổng **SINH** → cổng **TỬ**. Bạn xây
tháp để **tạo mê cung** ép quái đi vòng cho tháp bắn lâu hơn — nhưng **không được bịt
kín hoàn toàn** đường đi (ô chặn kín sẽ báo đỏ, không cho đặt).

**Để 10 quái lọt về đích là THUA** (đúng luật gốc).

### Tháp (5) & Bẫy (2)

| | Tên | Đánh | Vai trò |
|--|-----|------|---------|
| 🔥 | Tháp Lửa | chỉ **BỘ** | Nổ lan (AoE) + thiêu đốt |
| ❄ | Tháp Băng | BAY+BỘ | Làm chậm |
| ☠ | Tháp Độc | BAY+BỘ | Nhiễm độc cộng dồn, bỏ qua giáp |
| ⚡ | Tháp Sét | BAY+BỘ | Sét lan nhiều mục tiêu |
| ✦ | Tháp Năng Lượng | BAY+BỘ | Sát thương đơn cực mạnh (đắt) |
| 🕸 | Bẫy Dính | BỘ | Vùng làm chậm, **không chặn đường** |
| 🌀 | Bẫy Hút | BỘ | Hút & giữ chân quái, **không chặn đường** |

Nâng cấp tối đa **cấp 5**. Bán hoàn **½ giá** đã đầu tư.

### Quái: **Bộ** và **Bay**

Quái **Bộ** đi theo mê cung; quái **Bay** bay thẳng bỏ qua mê cung — chỉ tháp
"BAY+BỘ" mới bắn được. Mỗi đợt một loại quái. Cứ **10 đợt** có **1 đợt Boss**.

### Phép thuật (dùng **Điểm Kỹ Năng** — nhận khi giết quái)

Bấm nút phép rồi chọn mục tiêu trên bản đồ:

🌋 Mưa Lửa (ST nhóm quái bộ) · 🌩 Bão Sét (ST nhóm quái bay) · ☝ Nhất Dương Chỉ
(giết ngay 1 quái / -25% máu Boss) · 🟣 Khói Độc (đám khói DoT) · 🗡 Kiếm Thần (ST
toàn sân, trừ Boss) · 💪 Tăng Lực (buff 1 tháp) · 🌫 Mê Trận (chậm toàn bộ) · 🧊
Phong Ấn (đóng băng nhóm) · 🌀 Dịch Chuyển (đưa mọi quái về xuất phát).

### Chế độ & phím tắt

- **☠ Hố Tử Thần** — sinh tồn vô tận, khó dần (cày kỷ lục số đợt).
- **🗺 Chiến Dịch** — chơi qua các đợt liên tục.
- Phím: `1–7` chọn tháp/bẫy · `Space` dừng · `Enter` vào đợt · `Esc`/chuột phải hủy.

## Cấu trúc mã nguồn

```
SinhTuMon/
├── index.html          # khung UI
├── css/style.css       # giao diện (theme ZingPlay cổ)
├── js/
│   ├── config.js       # bản đồ Đất/Nước, tháp/bẫy 5 cấp, quái bộ/bay, phép, sinh đợt
│   ├── entities.js     # Enemy / Tower / Trap / Projectile + hiệu ứng
│   ├── game.js         # flow-field pathfinding, luật "không chặn kín", phép, vòng lặp, render
│   └── main.js         # HUD, cửa hàng, thanh phép, điều khiển
├── run.sh · README.md
```

Thuần HTML5 Canvas + JavaScript, **không thư viện ngoài**, chạy offline. Mọi thông số
cân bằng (tháp/quái/phép/độ khó) nằm trong `js/config.js`.
