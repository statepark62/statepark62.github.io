# -*- coding: utf-8 -*-
"""
card.py — 천성인어 일일 학습 카드(PNG) 생성 모듈
JSON 데이터를 받아 1080x1350 SNS 규격 카드를 그린다. (외부 서비스·비용 없음)
"""
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

# ── 디자인 토큰 (웹 페이지와 동일한 디자인 언어) ──
PAPER = (246, 242, 233)   # 화지(和紙) 배경
DOT = (232, 226, 213)     # 배경 도트
INK = (38, 34, 28)        # 먹색
SOFT = (110, 101, 88)     # 연한 먹색
SHU = (190, 58, 52)       # 주색(朱色) — 낙관
LINE = (220, 211, 194)    # 괘선

SERIF = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"
SERIF_R = "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc"
JP, KR = 0, 1  # ttc 내 서체 인덱스

W, H = 1080, 1350
M = 64  # 바깥 여백

WEEKDAY_KO = ["월", "화", "수", "목", "금", "토", "일"]


def F(size, lang=KR, bold=True):
    return ImageFont.truetype(SERIF if bold else SERIF_R, size, index=lang)


def text_w(d, s, font):
    b = d.textbbox((0, 0), s, font=font)
    return b[2] - b[0]


def dashed_h(d, x1, x2, y, color=LINE, dash=10, gap=8, w=2):
    x = x1
    while x < x2:
        d.line([(x, y), (min(x + dash, x2), y)], fill=color, width=w)
        x += dash + gap


# ── QR 행렬 생성 (버전4-Q, 규격 직접 구현 — make_qr.py와 동일 로직) ──
def qr_matrix(url: str):
    N = 33
    EXP = [0] * 512
    LOG = [0] * 256
    x = 1
    for i in range(255):
        EXP[i] = x
        LOG[x] = i
        x <<= 1
        if x & 0x100:
            x ^= 0x11D
    for i in range(255, 512):
        EXP[i] = EXP[i - 255]

    def gmul(a, b):
        return 0 if (a == 0 or b == 0) else EXP[LOG[a] + LOG[b]]

    def rs(data, n_ec):
        g = [1]
        for i in range(n_ec):
            ng = [0] * (len(g) + 1)
            for j, c in enumerate(g):
                ng[j] ^= gmul(c, EXP[i])
                ng[j + 1] ^= c
            g = ng
        gen = g[::-1]
        rem = list(data) + [0] * n_ec
        for i in range(len(data)):
            f = rem[i]
            if f:
                for j in range(1, len(gen)):
                    rem[i + j] ^= gmul(gen[j], f)
        return rem[len(data):]

    db = url.encode()
    bits = "0100" + format(len(db), "08b") + "".join(format(b, "08b") for b in db)
    bits += "0" * min(4, 384 - len(bits))
    bits += "0" * ((8 - len(bits) % 8) % 8)
    pads = ["11101100", "00010001"]
    i = 0
    while len(bits) < 384:
        bits += pads[i % 2]
        i += 1
    cw = [int(bits[i:i + 8], 2) for i in range(0, 384, 8)]
    b1, b2 = cw[:24], cw[24:]
    e1, e2 = rs(b1, 26), rs(b2, 26)
    fin = []
    for i in range(24):
        fin += [b1[i], b2[i]]
    for i in range(26):
        fin += [e1[i], e2[i]]
    stream = "".join(format(c, "08b") for c in fin) + "0000000"

    Mx = [[0] * N for _ in range(N)]
    R = [[False] * N for _ in range(N)]

    def sr(r, c, v):
        Mx[r][c] = v
        R[r][c] = True

    def finder(r0, c0):
        for r in range(-1, 8):
            for c in range(-1, 8):
                rr, cc = r0 + r, c0 + c
                if 0 <= rr < N and 0 <= cc < N:
                    ins = 0 <= r <= 6 and 0 <= c <= 6
                    dk = ins and (r in (0, 6) or c in (0, 6) or (2 <= r <= 4 and 2 <= c <= 4))
                    sr(rr, cc, 1 if dk else 0)

    finder(0, 0)
    finder(0, N - 7)
    finder(N - 7, 0)
    for i in range(8, N - 8):
        sr(6, i, (i + 1) % 2)
        sr(i, 6, (i + 1) % 2)
    for r in range(-2, 3):
        for c in range(-2, 3):
            sr(26 + r, 26 + c, 1 if max(abs(r), abs(c)) != 1 else 0)
    sr(N - 8, 8, 1)

    fa = [(8, 0), (8, 1), (8, 2), (8, 3), (8, 4), (8, 5), (8, 7), (8, 8),
          (7, 8), (5, 8), (4, 8), (3, 8), (2, 8), (1, 8), (0, 8)]
    fb_pos = [(N - 1, 8), (N - 2, 8), (N - 3, 8), (N - 4, 8), (N - 5, 8),
              (N - 6, 8), (N - 7, 8),
              (8, N - 8), (8, N - 7), (8, N - 6), (8, N - 5), (8, N - 4),
              (8, N - 3), (8, N - 2), (8, N - 1)]
    for (r, c) in fa + fb_pos:
        R[r][c] = True

    pos = []
    col = N - 1
    up = True
    while col > 0:
        if col == 6:
            col -= 1
        rows = range(N - 1, -1, -1) if up else range(N)
        for r in rows:
            for c in (col, col - 1):
                if not R[r][c]:
                    pos.append((r, c))
        up = not up
        col -= 2
    for (r, c), b in zip(pos, stream):
        Mx[r][c] = int(b)

    mask = 0  # 고정 마스크 (판독 검증 완료)
    for r in range(N):
        for c in range(N):
            if not R[r][c] and (r + c) % 2 == 0:
                Mx[r][c] ^= 1
    fmt = (0b11 << 3) | mask
    v = fmt << 10
    g = 0b10100110111
    for i in range(14, 9, -1):
        if v >> i & 1:
            v ^= g << (i - 10)
    fbits = ((fmt << 10) | v) ^ 0b101010000010010
    seq = [(fbits >> (14 - i)) & 1 for i in range(15)]
    for (r, c), b in zip(fa, seq):
        Mx[r][c] = b
    for (r, c), b in zip(fb_pos, seq):
        Mx[r][c] = b
    return Mx


def make_card(data: dict, date_iso: str, weekday: int, issue_no: int,
              url: str, out_path: str):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)

    for y in range(0, H, 24):            # 배경 도트
        for x in range(0, W, 24):
            d.ellipse([x, y, x + 2, y + 2], fill=DOT)

    # ── 상단: 낙관 도장 + 표기 ──
    y = M
    seal = 118
    d.rectangle([M, y, M + seal, y + seal], outline=SHU, width=5)
    fs = F(38, JP)
    cols = ["天声", "人語"]                # 오른쪽 열부터 (도장 관례)
    for ci, col_txt in enumerate(cols):
        cx = M + seal - 34 - ci * 46
        for ri, ch in enumerate(col_txt):
            b = d.textbbox((0, 0), ch, font=fs)
            d.text((cx - (b[2] - b[0]) // 2, y + 16 + ri * 46 - b[1]), ch, font=fs, fill=SHU)

    tx = M + seal + 36
    d.text((tx, y + 6), "天声人語で学ぶ日本語", font=F(40, JP), fill=INK)
    ymd = date_iso.split("-")
    meta = f"第{issue_no}回  ·  {int(ymd[0])}년 {int(ymd[1])}월 {int(ymd[2])}일 ({WEEKDAY_KO[weekday]})"
    d.text((tx, y + 68), meta, font=F(30, KR, bold=False), fill=SOFT)
    d.line([(M, y + seal + 34), (W - M, y + seal + 34)], fill=INK, width=4)

    # ── 오늘의 주제 ──
    y = y + seal + 78
    topic = data["topic_ja"]
    size = 96
    while size > 48 and text_w(d, topic, F(size, JP)) > W - 2 * M:
        size -= 4
    ft = F(size, JP)
    d.text((M, y), topic, font=ft, fill=INK)
    bt = d.textbbox((M, y), topic, font=ft)
    d.text((M, bt[3] + 14), data["topic_ko"], font=F(36, KR, bold=False), fill=SOFT)

    # ── 단어장 ──
    y = bt[3] + 100
    tag_f = F(30, JP)
    tag = "語彙"
    tw_ = text_w(d, tag, tag_f)
    d.rectangle([M, y, M + tw_ + 40, y + 52], fill=INK)
    d.text((M + 20, y + 8), tag, font=tag_f, fill=PAPER)
    d.text((M + tw_ + 60, y + 12), "오늘의 단어 5", font=F(28, KR, bold=False), fill=SOFT)
    y += 84

    row_h = 118
    for v in data["vocab"][:5]:
        d.text((M, y), v["reading"], font=F(26, JP, bold=False), fill=SHU)
        d.text((M, y + 34), v["word"], font=F(52, JP), fill=INK)
        mean_f = F(34, KR, bold=False)
        mtxt = v["meaning_ko"]
        while text_w(d, mtxt, mean_f) > W - M - 480 and len(mtxt) > 4:
            mtxt = mtxt[:-2] + "…"
        d.text((480, y + 44), mtxt, font=mean_f, fill=INK)
        lv = v.get("level", "")
        if lv:
            lf = F(22, KR, bold=False)
            lw = text_w(d, lv, lf)
            lx = W - M - lw - 20
            d.rectangle([lx - 10, y + 48, lx + lw + 10, y + 84], outline=(51, 84, 122), width=2)
            d.text((lx, y + 52), lv, font=lf, fill=(51, 84, 122))
        dashed_h(d, M, W - M, y + row_h - 12)
        y += row_h

    # ── 하단: 안내 + QR ──
    fy = H - M - 150
    d.line([(M, fy), (W - M, fy)], fill=INK, width=4)
    q = qr_matrix(url)
    qm = 4
    qs = 33 * qm
    qx, qy = W - M - qs, fy + 24
    d.rectangle([qx - 8, qy - 8, qx + qs + 8, qy + qs + 8], fill=(255, 255, 255))
    for r in range(33):
        for c in range(33):
            if q[r][c]:
                d.rectangle([qx + c * qm, qy + r * qm,
                             qx + c * qm + qm - 1, qy + r * qm + qm - 1], fill=INK)
    d.text((M, fy + 30), "매일 아침, 칼럼 한 편으로 배우는 일본어", font=F(30, KR, bold=False), fill=INK)
    d.text((M, fy + 82), url.replace("https://", ""), font=F(26, KR, bold=False), fill=SOFT)

    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path)
    return out_path


if __name__ == "__main__":
    import json
    from datetime import date
    here = Path(__file__).parent
    data = json.loads((here / "sample_data.json").read_text(encoding="utf-8"))
    dt = date.fromisoformat(data["date"])
    make_card(data, data["date"], dt.weekday(), 1,
              "https://statepark62.github.io/tenseijingo/",
              str(here.parent / "tenseijingo" / "cards" / f"{data['date']}.png"))
    print("카드 생성 완료")
