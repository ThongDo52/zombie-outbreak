# Hướng dẫn nhanh (tiếng Việt)

Bản tóm tắt cho những thay đổi lớn: chơi online, 6 role, shop mua súng, zombie mới. Chi tiết đầy đủ (tiếng Anh) nằm trong `README.md`.

## 1. Vì sao trước đây chỉ chơi được qua LAN

Phòng co-op chạy trong trình duyệt của chủ phòng và bạn bè nối thẳng vào bằng WebRTC. Kiểu nối thẳng này chỉ chắc chắn chạy khi cùng Wi-Fi; mạng 4G, mạng công ty, trường học và nhiều router gia đình chặn nó. Trước đây game không có đường dự phòng nên khác mạng là không vào được.

Bây giờ game tự thử theo thứ tự:

1. **Nối thẳng (WebRTC)** — nhanh nhất, dùng khi hai mạng cho phép.
2. **Qua TURN** — nếu bạn có cấu hình (không bắt buộc).
3. **Qua relay online** — một server WebSocket nhỏ chỉ chuyển tiếp gói tin. Mạng nào mở được trang web là dùng được. Trận đấu vẫn chạy trong trình duyệt của chủ phòng, relay không biết gì về game hay ví.

Người vào phòng thử cách 1 và cách 3 cùng lúc; sau khoảng 4 giây nếu nối thẳng chưa xong thì dùng relay. Thanh trạng thái dưới game ghi rõ đang đi đường nào.

## 2. Bật relay: chọn 1 trong 3 cách

**A. Bạn bè mở link dev/preview của bạn — không cần cài gì.**
`bun run dev` đã chạy sẵn relay. Ai mở cùng địa chỉ với bạn (link preview của Arc Studio, hoặc một tunnel như `cloudflared tunnel --url http://localhost:5173`) đều tạo phòng và vào phòng được từ mọi mạng. Game chỉ online khi máy bạn còn chạy `bun run dev`.

**B. Trang đã deploy + Cloudflare Worker miễn phí (khuyên dùng).**

```
bunx wrangler login
bun run relay:deploy
```

Wrangler in ra địa chỉ dạng `https://zombie-outbreak-relay.<tên bạn>.workers.dev`. Thêm vào `.env` rồi build lại:

```
VITE_RELAY_URL=wss://zombie-outbreak-relay.<tên bạn>.workers.dev/relay
```

Kiểm tra: mở `https://<worker của bạn>/health` phải thấy `{"ok":true,...}`. Lưu ý: Worker này chưa được deploy thử lần nào, nên lần đầu hãy coi như chạy thử.

**C. Tự chạy relay trên server có Bun (VPS, Render, Fly, Railway, Docker).**

```
bun run relay
```

Đặt sau HTTPS rồi set `VITE_RELAY_URL=wss://<server của bạn>/relay`.

Trong game: **Play together → Test my connection** cho biết relay có trả lời hay không.

## 3. Sáu role

| Role | Vai trò | Kỹ năng 1 (Shift/Space) | Kỹ năng 2 (E / chuột phải) |
|---|---|---|---|
| Bulwark | Tank, máu +50% | Khiên: giảm 70% sát thương, kéo zombie về mình | Dậm đất: gây sát thương, hất văng, choáng, +30 giáp |
| Striker | Sát thương | Overdrive: bắn nhanh và mạnh hơn | Lựu đạn |
| Runner | Trinh sát, chạy nhanh nhất | Lướt (không bị đánh trúng) | Bẫy điện làm chậm |
| Medic | Hỗ trợ | Hồi máu cả đội | Trạm hồi máu |
| Deadshot | Bắn tỉa | Deadeye: chính xác tuyệt đối, +80% sát thương, xuyên khiên | Đánh dấu mục tiêu: nhận thêm 40% sát thương |
| Warlock | Thuật sư triệu hồi | Gọi 2 sói linh hồn đi theo chiến đấu | Gọi golem đá hút zombie và gây choáng |

Mỗi role còn có một nội tại, một khẩu súng khởi đầu miễn phí đạn và một kệ súng riêng trong shop.

## 4. Shop thay cho súng rơi

- Giết zombie nhận xu; qua wave và qua chapter có thưởng thêm. Trong co-op cả đội cùng nhận.
- Bấm **B** để mở shop: mua súng theo role, nâng cấp súng (3 cấp, mỗi cấp +25% sát thương), mua đạn và máu. Chơi một mình thì game tạm dừng khi mở shop.
- Giá và số xu chỉnh trong `src/game/shop.ts`.

## 5. Zombie mới

Shielder (khiên chắn đạn phía trước), Leaper (nhảy vồ), Screamer (hét làm cả đàn hung hăng và gọi thêm runner), Brood (chết thì nở ra bầy Mite), Mortar (bắn pháo vòng qua tường xuống vùng được đánh dấu). Tỉ lệ xuất hiện chỉnh trong `src/game/waves.ts`, chỉ số trong `src/game/config.ts`.

## 6. Đưa game lên GitHub Pages

GitHub Pages host được **trang game** miễn phí, nhưng chỉ phát file tĩnh, không chạy được server. File `.github/workflows/deploy.yml` tự build bằng Vite và đăng trang mỗi lần bạn push lên nhánh `main`.

1. Đưa project lên một repo GitHub bằng git hoặc GitHub Desktop (gói miễn phí thì repo phải public). File `.env` nằm trong `.gitignore` nên không bị đưa lên. Nếu bạn upload bằng kéo-thả trên web thì tự kiểm tra đừng đưa `.env`, `.circle/`, `recovery_file*` lên.
2. Trong repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → tab Variables**: thêm các giá trị `VITE_...` trong `.env` của bạn (địa chỉ contract, và `VITE_RELAY_URL` khi đã có relay). Các giá trị này nằm công khai trong trang, nên tuyệt đối không thêm `DESCENT_OPERATOR_KEY` hay private key nào.
4. Push lên `main` (hoặc bấm chạy workflow trong tab **Actions**). Game nằm ở `https://<tên bạn>.github.io/<tên repo>/`.

Chạy được trên GitHub Pages: chơi một mình, role, shop, ví và các shop USDC (khi đã đặt địa chỉ contract), co-op cùng Wi-Fi.
Cần host ở nơi khác: relay để co-op khác mạng (ví dụ Cloudflare Worker ở mục 2B, rồi đặt `VITE_RELAY_URL`), và server cho Endless Descent (đặt `VITE_COOP_URL`).

Workflow này chưa được chạy lần nào: lần push đầu tiên chính là lần chạy thử.

## 7. Việc cần làm sau khi tải về

```
bun install
bun run check      # lint + typecheck: chưa chạy được ở nơi viết code này, hãy chạy một lần
bun run dev
```
