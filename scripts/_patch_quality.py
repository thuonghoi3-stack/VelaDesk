# Patch: five quality/literature-backed strategies.
import io

p = "src/lib/quant/strategy/library.ts"
original = io.open(p, encoding="utf8").read()
s = original

# 1) five ports before the registry
reg_anchor = "// --------------------------------- registry ---------------------------------"
assert reg_anchor in s, "registry anchor missing"
if "portTsm" not in s:
    ports = open("scripts/_quality_ports_block.txt", encoding="utf8").read()
    s = s.replace(reg_anchor, ports + reg_anchor, 1)

# 2) PORTS record
old_rec = "  rsi7_momentum: portRsi7Momentum,\n};"
assert old_rec in s, "PORTS record anchor missing"
if "tsm: portTsm" not in s:
    s = s.replace(
        old_rec,
        "  rsi7_momentum: portRsi7Momentum,\n"
        "  tsm: portTsm,\n"
        "  high_52w: portHigh52w,\n"
        "  ma200_gravity: portMa200Gravity,\n"
        "  tom: portTom,\n"
        "  weinstein_s2: portWeinsteinS2,\n};",
    )

# 3) registry metas after rsi7_momentum entry
old_meta_tail = '''      "Exit: RSI cắt ngược lại 50 (signal flip)",
    ],
  },
];'''
assert old_meta_tail in s, "rsi7 meta anchor missing"
if 'id: "tsm"' not in s:
    metas = open("scripts/_quality_metas_block.txt", encoding="utf8").read()
    s = s.replace(old_meta_tail, old_meta_tail[: -len("];")] + metas)

if s != original:
    io.open(p, "w", encoding="utf8", newline="").write(s)
print("library patched")
