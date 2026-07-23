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
toàn sân, **kể cả Boss**) · 💪 Tăng Lực (buff 1 tháp) · 🌫 Mê Trận (chậm toàn bộ) · 🧊
Phong Ấn (đóng băng nhóm) · 🌀 Dịch Chuyển (đưa mọi quái về xuất phát).

Mưa Lửa / Bão Sét gây thêm **10% máu ĐÃ MẤT** của mục tiêu (càng đánh lâu càng đau).

### Bản đồ (chọn ở menu chính)

| | Bản đồ | Đặc điểm |
|--|--------|----------|
| 🌋 | **Hố Tử Thần** | Đúng bản gốc: 3 sông dung nham chia cắt sân, mê cung ngắn hơn nhưng dễ chặn |
| 🏜 | **Miền Đất Chết** | 13×13 trống trải, không một dòng nham — tự do dựng mê cung dài nhất có thể |

### Chế độ & phím tắt

Vào game hiện **menu chính** để chọn bản đồ + chế độ (mở lại bằng nút **☰** góc trên phải):

- **☠ Sinh Tồn Vô Tận** — sinh tồn vô tận, khó dần (cày kỷ lục số đợt).
- **🗺 Chiến Dịch** — chơi qua các đợt liên tục, trụ hết 30 đợt là thắng.
- **⚔ Đối kháng** — tối đa **5 sân**, cùng chuỗi đợt quái đồng bộ, ai để 10 quái lọt
  trước thì thất thủ. Đấu với **AI** hoặc **người thật qua LAN** (`node server.js`).
  Bạn ở xa vẫn chơi được qua **LAN ảo ZeroTier** — xem `HUONGDAN-LAN-AO.md`.
  Phép nhánh đối kháng đánh thẳng sang sân đối thủ: 👹 Triệu Hồi thả 1 quái vào **ô
  ngẫu nhiên bất kỳ chưa xây** (kể cả ô đã bị quây kín), 🩸 Huyết Quỷ tăng tốc quái,
  🛡 Ma Giáp cộng máu, 🌎 Địa Chấn phá 1 tháp.
- Phím: `1–8` chọn tháp/bẫy · `Q W E …` thi triển phép · `Space` dừng · `Enter` vào đợt ·
  `F2` cây phép · `Esc`/chuột phải hủy. **Đổi phím tùy ý** ở nút **Cấu hình** (lưu lại máy).

### Kết nối lại khi đối kháng LAN (F5 / rớt mạng)

Mỗi người chơi có **phiên riêng**: lỡ nhấn **F5**, đóng nhầm tab, hay **rớt mạng** giữa
trận vẫn vào lại được. Máy chủ **giữ chỗ 60 giây** (không loại vội), người chơi mở lại
đúng địa chỉ máy chủ là **tự động kết nối lại** — sân (tháp/vàng/mạng/phép đã học) được
khôi phục và tiếp tục theo đợt hiện tại. Quá 60 giây không quay lại mới tính thất thủ.

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
