from pathlib import Path
import argparse
import hashlib
import json
import re
import struct

import pefile
from unicorn import Uc, UC_ARCH_X86, UC_MODE_32, UC_HOOK_CODE
from unicorn.x86_const import *

parser = argparse.ArgumentParser()
parser.add_argument("--game-exe", type=Path, required=True)
parser.add_argument("--fixtures", type=Path, required=True)
parser.add_argument("--report", type=Path, default=Path("patch-test-report.json"))
args = parser.parse_args()
FIX = args.fixtures
GAME = args.game_exe
BASE, CAVE, STACK, DATA = 0x400000, 0x2000000, 0x3000000, 0x4000000
SENTINEL = 0x2000C00
raw = GAME.read_bytes()
pe = pefile.PE(data=raw)
mapped = pe.get_memory_mapped_image()
catalog = (FIX / "catalog.bin").read_bytes()
hit = (FIX / "hit.bin").read_bytes()
loot = (FIX / "loot.bin").read_bytes()
rarity = (FIX / "rarity.bin").read_bytes()
crest = (FIX / "crest.bin").read_bytes()
results = []


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def dword(value):
    return struct.pack("<I", value & 0xFFFFFFFF)


def read32(uc, address):
    return struct.unpack("<I", uc.mem_read(address, 4))[0]


def write32(uc, address, value):
    uc.mem_write(address, dword(value))


def redirect(source, target, length=6):
    return b"\xE9" + dword(target - source - 5) + b"\x90" * (length - 5)


def machine():
    uc = Uc(UC_ARCH_X86, UC_MODE_32)
    uc.mem_map(BASE, (len(mapped) + 4095) & ~4095)
    uc.mem_write(BASE, mapped)
    uc.mem_map(CAVE, 0x10000)
    uc.mem_write(CAVE, hit)
    uc.mem_write(CAVE + 0x400, loot)
    uc.mem_write(CAVE + 0x800, crest)
    uc.mem_write(CAVE + 0x1000, catalog)
    uc.mem_map(STACK, 0x20000)
    uc.mem_map(DATA, 0x40000)
    uc.reg_write(UC_X86_REG_MXCSR, 0x1F80)
    return uc


def return_from_call(uc, arg_bytes, result=0):
    sp = uc.reg_read(UC_X86_REG_ESP)
    target = read32(uc, sp)
    uc.reg_write(UC_X86_REG_ESP, sp + 4 + arg_bytes)
    uc.reg_write(UC_X86_REG_EAX, result)
    uc.reg_write(UC_X86_REG_ECX, 0xBAD00001)
    uc.reg_write(UC_X86_REG_EDX, 0xBAD00002)
    uc.reg_write(UC_X86_REG_XMM0, 0xDEADBEEF)
    uc.reg_write(UC_X86_REG_EIP, target)


def test_signatures():
    check(hashlib.sha256(raw).hexdigest().upper() == "FC0F248BDC42BCFAF9C8D679F99A707FA8D20DC570F2B16203F1403EC9B58087", "EXE hash")
    for address, expected in ((0x451ED0, "558bec566a00"), (0x61FE8F, "83c704ff4de0"), (0x48EC12, "8b4d0c"), (0x61FC15, "0f2f45c40f8370020000")):
        check(pe.get_data(address - BASE, len(bytes.fromhex(expected))) == bytes.fromhex(expected), "Original instruction signature")
    check(len(hit) < 0x400 and len(loot) < 0x400 and len(crest) < 0x400 and len(catalog) <= 0xE000, "Allocation bounds")
    results.append({"test": "binary_signatures", "passed": True})


def test_hit(current, proposed, maximum, expected, triggers):
    uc = machine()
    uc.mem_write(0x451ED0, redirect(0x451ED0, CAVE))
    sp = STACK + 0x18000
    write32(uc, sp, SENTINEL)
    write32(uc, sp + 4, proposed)
    write32(uc, DATA + 0xF8, current)
    uc.reg_write(UC_X86_REG_ESP, sp)
    uc.reg_write(UC_X86_REG_ECX, DATA)
    preserved = {UC_X86_REG_EBP: 0x12340000, UC_X86_REG_EBX: 0x23450000,
                 UC_X86_REG_ESI: 0x34560000, UC_X86_REG_EDI: 0x45670000}
    for register, value in preserved.items():
        uc.reg_write(register, value)

    def on_code(uc, address, size, user):
        if address == 0x450A10:
            check(uc.reg_read(UC_X86_REG_ECX) == DATA, "Max HP this pointer")
            check(read32(uc, uc.reg_read(UC_X86_REG_ESP) + 4) == 0, "Max HP argument")
            return_from_call(uc, 4, maximum)

    uc.hook_add(UC_HOOK_CODE, on_code)
    uc.emu_start(0x451ED0, SENTINEL, count=500)
    check(uc.reg_read(UC_X86_REG_EIP) == SENTINEL, "HP setter returned")
    check(read32(uc, DATA + 0xF8) == expected, f"HP {current}->{proposed}: expected {expected}")
    check(read32(uc, CAVE + 0xF004) == triggers, "Hit counter")
    check(uc.reg_read(UC_X86_REG_ESP) == sp + 8, "HP stack balance")
    for register, value in preserved.items():
        check(uc.reg_read(register) == value, "HP callee-saved register")
    results.append({"test": "enemy_hp", "current": current, "proposed": proposed, "result": expected, "passed": True})


def parse_catalog():
    areas = {}
    count = struct.unpack_from("<I", catalog)[0]
    for i in range(count):
        area, length, minimum, pointer = struct.unpack_from("<4I", catalog, 4 + i * 16)
        entries = [struct.unpack_from("<2I", catalog, pointer - CAVE - 0x1000 + j * 8) for j in range(length)]
        check(entries == sorted(entries) and minimum == entries[0][0], "Catalog order and minimum")
        areas[area] = entries
    table_path = GAME.parent / "Media/D3D11/Majo/csv_en/item/equip_table.lse"
    encoded = table_path.read_bytes()
    decoded = bytes(b ^ ((i + encoded[-1]) & 255) for i, b in enumerate(encoded[:-1]))
    ids = {int(m.group(1)) for m in re.finditer(rb"(?m)^(\d+),", decoded)}
    check({200001, 212035} <= ids, "Fallback and target equipment exist")
    check(all(item in ids for entries in areas.values() for rank, item in entries), "All loot IDs exist")
    results.append({"test": "catalog_ids", "areas": count, "entries": sum(map(len, areas.values())), "passed": True})
    return areas


def test_loot(area, rank, entries, pick_last=False, hp=0, dungeon=True, remaining=2):
    uc = machine()
    uc.mem_write(0x61FE8F, redirect(0x61FE8F, CAVE + 0x400))
    frame, sp = STACK + 0x18000, STACK + 0x17004
    enemy, iterator, dungeon_ptr, vector, manager, random_ptr = (DATA, DATA + 0x400, DATA + 0x1000, DATA + 0x30000, DATA + 0x31000, DATA + 0x32000)
    write32(uc, iterator, enemy)
    write32(uc, enemy + 0xF8, hp)
    write32(uc, enemy + 0x6C, rank)
    write32(uc, 0xABB3BC, dungeon_ptr if dungeon else 0)
    write32(uc, dungeon_ptr + 0x1DC84, area)
    write32(uc, 0xABB348, random_ptr)
    write32(uc, frame - 0x44, vector)
    write32(uc, frame - 0x1C, manager)
    write32(uc, frame - 0x20, remaining)
    saved = {UC_X86_REG_EAX: 0x23456789, UC_X86_REG_ECX: 0x34567890, UC_X86_REG_EDX: 0x45678901,
             UC_X86_REG_EBX: 0x56789012, UC_X86_REG_EBP: frame, UC_X86_REG_ESI: 0x67890123,
             UC_X86_REG_EDI: iterator, UC_X86_REG_ESP: sp}
    for register, value in saved.items():
        uc.reg_write(register, value)
    uc.reg_write(UC_X86_REG_EFLAGS, 0x247)
    float_registers = {UC_X86_REG_MXCSR: 0x1F80, UC_X86_REG_FPCW: 0x37F,
                       UC_X86_REG_FPSW: 0, UC_X86_REG_FPTAG: 0xFFF0,
                       UC_X86_REG_FP0: (0x8000000000000000, 0x3FFF),
                       UC_X86_REG_FP1: (0xC000000000000000, 0x4000)}
    for index in range(8):
        float_registers[UC_X86_REG_XMM0 + index] = 0x11223344556677889900AABBCCDDEEFF + index
    for register, value in float_registers.items():
        uc.reg_write(register, value)
    float_expected = {register: uc.reg_read(register) for register in float_registers}
    eligible = [] if entries is None else [item for entry_rank, item in entries if entry_rank <= max(rank, entries[0][0])]
    expected_item = (eligible[-1] if pick_last else eligible[0]) if eligible and dungeon else 200001
    calls = []

    def on_code(uc, address, size, user):
        stack = uc.reg_read(UC_X86_REG_ESP)
        if address == 0x611180:
            check(uc.reg_read(UC_X86_REG_ECX) == random_ptr, "RNG this pointer")
            minimum, maximum = struct.unpack("<2I", uc.mem_read(stack + 4, 8))
            check(minimum == 0 and maximum == len(eligible) - 1, "RNG inclusive bounds")
            calls.append("rng")
            return_from_call(uc, 8, maximum if pick_last else minimum)
        elif address == 0x62E610:
            check(uc.reg_read(UC_X86_REG_ECX) == vector, "Result vector this pointer")
            record = struct.unpack("<3I", uc.mem_read(read32(uc, stack + 4), 12))
            check(record == (expected_item, 3, 1), "Legendary result record")
            calls.append("result")
            return_from_call(uc, 4)
        elif address == 0x5045E0:
            check(uc.reg_read(UC_X86_REG_ECX) == manager, "Item manager this pointer")
            arguments = struct.unpack("<4I", uc.mem_read(stack + 4, 16))
            check(arguments == (expected_item, 3, 0xFFFFFFFF, 1), "Legendary equipment generation arguments")
            uc.reg_write(UC_X86_REG_FP0, (0x9000000000000000, 0x4004))
            uc.reg_write(UC_X86_REG_FPCW, 0x27F)
            calls.append("equipment")
            return_from_call(uc, 16)

    uc.hook_add(UC_HOOK_CODE, on_code)
    uc.emu_start(0x61FE8F, 0x61FE95, count=3000)
    check(uc.reg_read(UC_X86_REG_EIP) == 0x61FE95, "Loot continuation address")
    expected_calls = ([] if hp > 0 else (["rng"] if eligible and dungeon else []) + ["result", "equipment"])
    check(calls == expected_calls, "Exactly one result and equipment for defeated enemies")
    check(read32(uc, CAVE + 0xF000) == (0 if hp > 0 else 1), "Loot counter")
    for register, value in saved.items():
        check(uc.reg_read(register) == (value + 4 if register == UC_X86_REG_EDI else value), f"Loot register {register} restored")
    check(read32(uc, frame - 0x20) == remaining - 1, "Original enemy loop decrement")
    check(bool(uc.reg_read(UC_X86_REG_EFLAGS) & 0x40) == (remaining == 1), "Original loop ZF")
    for register, value in float_expected.items():
        check(uc.reg_read(register) == value, f"SSE/x87 register {register} restored")
    results.append({"test": "bonus_loot", "area": area, "rank": rank, "pick_last": pick_last, "hp": hp, "item": None if hp > 0 else expected_item, "passed": True})


def test_crest(roll, hp=0, bonus=False):
    uc = machine()
    uc.mem_write(0x61FC15, redirect(0x61FC15, CAVE + 0x800, 10))
    if bonus:
        uc.mem_write(0x61FE8F, redirect(0x61FE8F, CAVE + 0x400))
    frame, sp = STACK + 0x18000, STACK + 0x17004
    enemy, iterator, vector, manager = DATA, DATA + 0x400, DATA + 0x30000, DATA + 0x31000
    write32(uc, iterator, enemy)
    write32(uc, enemy + 0xF8, hp)
    write32(uc, enemy + 0x5C, 212035)
    write32(uc, enemy + 0x60, 2)
    write32(uc, frame - 0x44, vector)
    write32(uc, frame - 0x1C, manager)
    write32(uc, frame - 0x20, 2)
    uc.mem_write(frame - 0x3C, struct.pack('<f', 3.0))
    write32(uc, 0xABB3BC, 0)
    uc.reg_write(UC_X86_REG_ESP, sp)
    uc.reg_write(UC_X86_REG_EBP, frame)
    uc.reg_write(UC_X86_REG_EDI, iterator)
    uc.reg_write(UC_X86_REG_EBX, 0x12345678)
    uc.reg_write(UC_X86_REG_XMM0, struct.unpack('<I', struct.pack('<f', float(roll)))[0])
    records, generated, calls = [], [], []

    def on_code(uc, address, size, user):
        stack = uc.reg_read(UC_X86_REG_ESP)
        if address == 0x62E610:
            check(uc.reg_read(UC_X86_REG_ECX) == vector, 'Target result vector')
            records.append(struct.unpack('<3I', uc.mem_read(read32(uc, stack + 4), 12)))
            calls.append('result')
            return_from_call(uc, 4)
        elif address == 0x505480:
            check(uc.reg_read(UC_X86_REG_ECX) == manager, 'Target item-type manager')
            check(read32(uc, stack + 4) == 212035, 'Native item-type query')
            calls.append('type')
            return_from_call(uc, 4, 2)
        elif address == 0x5045E0:
            check(uc.reg_read(UC_X86_REG_ECX) == manager, 'Target equipment manager')
            generated.append(struct.unpack('<4I', uc.mem_read(stack + 4, 16)))
            calls.append('equipment')
            return_from_call(uc, 16)
        elif address == 0x611180:
            raise AssertionError('Target hook must not add random rerolls')

    uc.hook_add(UC_HOOK_CODE, on_code)
    uc.emu_start(0x61FC15, 0x61FE95, count=1000)
    check(uc.reg_read(UC_X86_REG_EIP) == 0x61FE95, 'Target reaches native loop continuation')
    check(records == [(212035, 3, 1)] + ([(200001, 3, 1)] if bonus else []), 'Exactly one target record plus optional independent bonus')
    check(generated == [(212035, 3, 0xFFFFFFFF, 1)] + ([(200001, 3, 0xFFFFFFFF, 1)] if bonus else []), 'Target generated once, Legendary and identified')
    check(calls == ['result', 'type', 'equipment'] + (['result', 'equipment'] if bonus else []), 'Native fixed-drop call order')
    check(read32(uc, CAVE + 0xF008) == 1, 'Target counter')
    check(read32(uc, CAVE + 0xF000) == int(bonus), 'Independent bonus counter')
    check(read32(uc, frame - 0x20) == 1, 'Native loop decrements once')
    for register, expected in ((UC_X86_REG_ESP, sp), (UC_X86_REG_EBP, frame), (UC_X86_REG_EBX, 0x12345678), (UC_X86_REG_EDI, iterator + 4)):
        check(uc.reg_read(register) == expected, 'Target callee-saved state')
    results.append({'test': 'fixed_crest', 'roll': roll, 'hp': hp, 'bonus': bonus, 'passed': True})


def test_crest_passthrough(item, hp, roll, threshold):
    snapshots = []
    for enabled in (False, True):
        uc = machine()
        if enabled:
            uc.mem_write(0x61FC15, redirect(0x61FC15, CAVE + 0x800, 10))
        frame, sp, iterator = STACK + 0x18000, STACK + 0x17004, DATA + 0x400
        write32(uc, iterator, DATA)
        write32(uc, DATA + 0xF8, hp)
        write32(uc, DATA + 0x5C, item)
        uc.mem_write(frame - 0x50, bytes(range(16)))
        uc.mem_write(frame - 0x3C, struct.pack('<f', threshold))
        registers = {UC_X86_REG_ESP: sp, UC_X86_REG_EBP: frame, UC_X86_REG_EDI: iterator,
                     UC_X86_REG_EAX: 0x12345678, UC_X86_REG_EBX: 0x23456789,
                     UC_X86_REG_ECX: 0x34567890, UC_X86_REG_EDX: 0x45678901, UC_X86_REG_ESI: 0x56789012}
        for register, value in registers.items():
            uc.reg_write(register, value)
        uc.reg_write(UC_X86_REG_EFLAGS, 0x246)
        uc.reg_write(UC_X86_REG_XMM0, struct.unpack('<I', struct.pack('<f', roll))[0])
        def stop_at_branch(uc, address, size, user):
            if address in (0x61FC1F, 0x61FE8F):
                uc.emu_stop()
        uc.hook_add(UC_HOOK_CODE, stop_at_branch)
        uc.emu_start(0x61FC15, SENTINEL, count=100)
        check(uc.reg_read(UC_X86_REG_EIP) in (0x61FC1F, 0x61FE8F), 'Original drop decision reached')
        check(read32(uc, CAVE + 0xF008) == 0, 'No target for other or living enemies')
        snapshots.append((tuple(uc.reg_read(r) for r in list(registers) + [UC_X86_REG_EIP, UC_X86_REG_EFLAGS, UC_X86_REG_XMM0]), bytes(uc.mem_read(frame - 0x50, 16))))
    check(snapshots[0] == snapshots[1], 'Original probability branch, registers, flags and locals preserved')
    results.append({'test': 'crest_passthrough', 'item': item, 'hp': hp, 'roll': str(roll), 'threshold': threshold, 'passed': True})


def test_rarity():
    for original in range(4):
        uc = machine()
        frame, sp = STACK + 0x18000, STACK + 0x17000
        uc.reg_write(UC_X86_REG_EBP, frame)
        uc.reg_write(UC_X86_REG_ESP, sp)
        uc.reg_write(UC_X86_REG_ESI, DATA)
        uc.reg_write(UC_X86_REG_EAX, 0x23456789)
        write32(uc, frame + 0xC, original)
        uc.mem_write(0x48EC12, rarity)
        uc.emu_start(0x48EC12, 0x48EC1A, count=5)
        check(read32(uc, DATA + 0x10) == 3, "Rarity stored before stat generation")
        check(uc.reg_read(UC_X86_REG_ESP) == sp, "Rarity stack balance")
        check(uc.reg_read(UC_X86_REG_EDX) == 0x23456789, "Original following instruction")
        results.append({"test": "new_equipment_rarity", "original": original, "result": 3, "passed": True})


test_signatures()
for values in [(100, 99, 100, 0, 1), (100, 50, 100, 0, 1), (100, 0, 100, 0, 1),
               (100, -10, 100, 0, 1), (100, 100, 100, 100, 0), (50, 75, 100, 75, 0),
               (50, 500, 100, 100, 0), (0, 100, 100, 100, 0), (0, 0, 100, 0, 0),
               (0, -10, 100, 0, 0), (-5, 100, 100, 100, 0)]:
    test_hit(*values)
areas = parse_catalog()
for area, entries in areas.items():
    for rank in sorted({0, entries[0][0], entries[-1][0], 10000}):
        for last in (False, True):
            test_loot(area, rank, entries, pick_last=last)
test_loot(1001, 1, areas[1001], hp=50)
test_loot(1001, 1, areas[1001], hp=-1, remaining=1)
test_loot(99999, 1, None)
test_loot(1001, 1, areas[1001], dungeon=False)
test_rarity()
for roll in range(100):
    test_crest(roll)
test_crest(99, hp=-1)
test_crest(99, bonus=True)
for item, hp in ((0, 0), (200001, 0), (212035, 1), (212035, 101390)):
    for roll in (0.0, 3.0, 99.0, float('nan')):
        test_crest_passthrough(item, hp, roll, 3.0)
report = {"total": len(results), "passed": len(results), "areas": len(areas),
          "scope": "x86 emulation of generated patches and original HP setter/fixed-drop continuation; game allocator/result functions are ABI stubs, not live gameplay",
          "cases": results}
args.report.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(f"PASS: {len(results)} cases, {len(areas)} areas; HP boundaries, fixed target and original probability branches, loot IDs and rarity, ABI, stack, registers, x87/SSE preservation.")
print(report["scope"])
