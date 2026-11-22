"""Dice roller Set: roll types (from the Saga template, changed by the DM per Set), a shared tray and 3D rolls. See
docs/concepts/stages.md ("Dice roller") and domain/dice.py.

- Players and the DM (not viewers) act on it on the live Stage (SetType.act): add a roll type's dice to the tray,
  remove their own group, roll. The DM also clears the tray and picks, unseen, the number a die will land on
  (`forced`: never sent to players).
- A roll: the server draws every value (honouring the DM's picks), reads each group by its roll type, and sends a seed
  so every screen animates the same throw (the frontend lands each die on its value).
- Each die carries its owner's colour and dice style (RenderContext.members), so screens without the Saga's members
  (the live link) draw them right.
"""
import copy
import secrets
import time

from domain import dice as rules
from models import StageSet
from services.errors import BadRequest, Forbidden
from set_types.base import RenderContext, SetType

MAX_TRAY, MAX_HISTORY = 30, 6
TRAY_EDGES = ("bottom", "top", "left", "right")  # where the tray sits; dice are thrown from it


class DiceRoller(SetType):
    key = "dice"
    name = "Dice roller"
    default_size = (900, 520)

    def default_config(self) -> dict:
        return {"roll_types": rules.default_roll_types(), "tray": [], "next_id": 1, "roll": None, "history": [],
                "tray_edge": "bottom"}

    def initial_config(self, ctx: RenderContext) -> dict:
        starting = ctx.ruleset.saga_template.get("dice_rolls")
        return {**self.default_config(), "roll_types": copy.deepcopy(starting) if starting else rules.default_roll_types()}

    def normalize(self, config: dict | None) -> dict:
        return {**self.default_config(), **copy.deepcopy(config or {})}

    def validate_config(self, config: dict, current: dict | None = None) -> dict:
        result = self.normalize(current)
        for key, value in (config or {}).items():
            if key == "roll_types":
                try:
                    result[key] = rules.clean_roll_types(value)
                except rules.DiceError as exc:
                    raise BadRequest(str(exc)) from None
                known = {r["id"] for r in result[key]}
                result["tray"] = [d for d in result["tray"] if d["type_id"] in known]
            elif key == "tray_edge":
                if value not in TRAY_EDGES:
                    raise BadRequest(f"tray_edge: one of {list(TRAY_EDGES)}")
                result[key] = value
            else:
                raise BadRequest(f"Unknown setting '{key}': the tray changes through acts")
        return result

    # -- acts (players and the DM) ---------------------------------------------------

    def act(self, ctx: RenderContext, stage_set: StageSet, member_id: int, name: str, args: dict) -> None:
        config = self.normalize(stage_set.config)
        admin = ctx.viewer.is_admin
        tray = config["tray"]
        if name == "tray.add":
            roll_type = next((r for r in config["roll_types"] if r["id"] == args.get("type_id")), None)
            if roll_type is None:
                raise BadRequest("That roll isn't on this dice roller")
            count = sum(d["count"] for d in roll_type["dice"])
            if len(tray) + count > MAX_TRAY:
                raise BadRequest(f"At most {MAX_TRAY} dice in the tray: roll first")
            # The same roll again by the same member joins their group: its dice are read (summed) together
            same = next((d["group"] for d in tray if d["type_id"] == roll_type["id"] and d["member_id"] == member_id), None)
            group = same if same is not None else config["next_id"]
            if same is None:
                config["next_id"] += 1
            for line in roll_type["dice"]:
                for _ in range(line["count"]):
                    tray.append({"id": config["next_id"], "group": group, "type_id": roll_type["id"], "sides": line["sides"],
                                 "member_id": member_id, "forced": None})
                    config["next_id"] += 1
        elif name == "tray.remove":
            group = [d for d in tray if d["group"] == args.get("group")]
            if not group:
                raise BadRequest("Those dice aren't in the tray")
            if not admin and group[0]["member_id"] != member_id:
                raise Forbidden("Only whoever added them (or the DM) takes them back")
            config["tray"] = [d for d in tray if d["group"] != args.get("group")]
        elif name == "tray.clear":
            if not admin:
                raise Forbidden("The DM clears the tray")
            config["tray"] = []
        elif name == "tray.force":  # the DM's unseen pick of where a die lands
            if not admin:
                raise Forbidden("Only the DM picks")
            die = next((d for d in tray if d["id"] == args.get("die_id")), None)
            if die is None:
                raise BadRequest("That die isn't in the tray")
            value = args.get("value")
            if value is not None and (isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= die["sides"]):
                raise BadRequest(f"A d{die['sides']} lands on 1 to {die['sides']}")
            die["forced"] = value
        elif name == "roll.clear":  # the results and the rolled dice off the Set (kept in the history)
            config["roll"] = None
        elif name == "roll":
            if not tray:
                raise BadRequest("The tray is empty: add dice first")
            config["roll"] = self._roll(ctx, config, member_id)
            config["history"] = ([config["roll"]] + config["history"])[:MAX_HISTORY]
            config["tray"] = []
        else:
            raise BadRequest(f"Unknown act '{name}'")
        stage_set.config = config

    def _roll(self, ctx: RenderContext, config: dict, member_id: int) -> dict:
        types = {r["id"]: r for r in config["roll_types"]}
        groups: dict[int, list[dict]] = {}
        for die in config["tray"]:
            groups.setdefault(die["group"], []).append(die)
        out_groups = []
        for group_id, dice in groups.items():
            roll_type = types[dice[0]["type_id"]]
            values = [d["forced"] or rules.roll_value(d["sides"]) for d in dice]
            marks = rules.counted(roll_type["read"], roll_type.get("x", 0), values)
            owner = ctx.members.get(dice[0]["member_id"])
            per = sum(d["count"] for d in roll_type["dice"]) or 1
            times = max(1, len(dice) // per)
            out_groups.append({
                "group": group_id, "type_id": roll_type["id"], "name": roll_type["name"] + (f" ×{times}" if times > 1 else ""),
                "label": rules.label(roll_type), "times": times,
                "member": owner["name"], "color": owner["color"], "style": owner["style"],
                "dice": [{"id": d["id"], "sides": d["sides"], "value": v, "counted": m} for d, v, m in zip(dice, values, marks)],
                "result": rules.read_result(roll_type, values),
            })
        return {"id": secrets.randbelow(2**31), "seed": secrets.randbelow(2**31), "by": ctx.members.get(member_id)["name"],
                "groups": out_groups, "at": int(time.time())}

    # -- render ----------------------------------------------------------------

    def render(self, ctx: RenderContext, stage_set: StageSet, actors) -> dict:
        config = self.normalize(stage_set.config)
        admin = ctx.viewer.is_admin
        tray = []
        for die in config["tray"]:
            owner = ctx.members.get(die["member_id"])
            item = {"id": die["id"], "group": die["group"], "type_id": die["type_id"], "sides": die["sides"],
                    "member_id": die["member_id"], "member": owner["name"], "color": owner["color"], "style": owner["style"]}
            if admin:
                item["forced"] = die["forced"]  # the DM's pick: players never get it
            tray.append(item)
        return {"roll_types": [{**r, "label": rules.label(r)} for r in config["roll_types"]], "tray": tray,
                "tray_edge": config["tray_edge"],
                "roll": config["roll"], "history": config["history"][1:] if config["roll"] else config["history"]}
