# Patch: ichiV1_plus entry-only port (HA Ichimoku 20/60/120/30 + EMA fan).
import io

# ---- types.ts ----
p = "src/lib/quant/types.ts"
s = io.open(p, encoding="utf8").read()
if "ichiv1_plus" not in s:
    old2 = '  | "e0v1e"; // NFI-family long scalper (EWO + CTI dip buys)'
    assert old2 in s, "e0v1e anchor missing"
    s = s.replace(old2, old2 + '\n  | "ichiv1_plus"; // HA Ichimoku fan scalper (entry-only port)')
    io.open(p, "w", encoding="utf8", newline="").write(s)
print("types ok")

# ---- library.ts ----
p = "src/lib/quant/strategy/library.ts"
s = io.open(p, encoding="utf8").read()

# port function before registry
reg_anchor = "// --------------------------------- registry ---------------------------------"
assert reg_anchor in s, "registry anchor missing"
if "portIchiv1Plus" not in s:
    port = open("scripts/_ichiv1_port_block.txt", encoding="utf8").read()
    s = s.replace(reg_anchor, port + reg_anchor, 1)

# PORTS record
old_rec = "  sma_cross: portSmaCross,"
if old_rec in s:
    s = s.replace(old_rec, "  e0v1e: portE0v1e,")
old_rec2 = "  e0v1e: portE0v1e,"
assert old_rec2 in s
if "ichiv1_plus: portIchiv1Plus" not in s:
    s = s.replace(old_rec2, old_rec2 + "\n  ichiv1_plus: portIchiv1Plus,")

# registry meta: insert after e0v1e meta
old_meta_tail = '''      "Exit gốc là fastk/profit-lock — desk chạy reversion class (TP + time stop)",
    ],
  },'''
assert old_meta_tail in s, "e0v1e meta anchor missing"
if 'id: "ichiv1_plus"' not in s:
    meta = open("scripts/_ichiv1_meta_block.txt", encoding="utf8").read()
    s = s.replace(old_meta_tail, old_meta_tail[: -len("  },")] + meta)

io.open(p, "w", encoding="utf8", newline="").write(s)
print("library ok")
