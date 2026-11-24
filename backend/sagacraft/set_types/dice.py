"""Dice roller Set: roll types (from the Saga template, changed by the DM per Set), each member's tray, and 3D rolls
that stay on the Set. See docs/concepts/stages.md ("Dice roller") and domain/dice.py.

- Who can roll (`rollers`: None, everyone who sees it; or some groups and members; the DM always) acts on it on the live
  Stage (SetType.act): add a roll type's dice to their own tray, take one back, roll their tray, clear their row (their
  waiting dice and their rolls). The DM also clears every row, hides the rolled 3D dice for everyone (`rolled_hidden`:
  the results stay; a new roll shows them again) and picks, unseen, the number a die will land on (`forced`: never sent
  to players).
- A member's tray is theirs: players get only their own waiting dice (the DM gets everyone's).
- A roll: the server draws every value (honouring the DM's picks), reads each group by its roll type, and sends a seed
  so every screen animates the same throw (the frontend lands each die on its value). Rolls stay (a row each) until
  cleared; at most MAX_ROLLS (MAX_ROLLED dice), the oldest go.
- Each die carries its owner's colour and dice style (RenderContext.members), so screens without the Saga's members
  (the live link) draw them right.
- An action's dice (plan 37: the Saga's setting "roll an action's dice") land here too, rolled by the server when the
  action ran: a roll in the dice of the character's player, its result named after the action and its formula.
"""
import copy
import secrets
import time

from domain import dice as rules
from domain.visibility import can_see
from models import StageSet
from services.errors import BadRequest, Forbidden
from set_types.base import RenderContext, SetType, TemplateRefs

MAX_TRAY = 30  # one member's waiting dice
MAX_ROLLS, MAX_ROLLED = 12, 60  # rolls kept on the Set, and their dice
TRAY_EDGES = ("bottom", "top", "left", "right")  # where the tray sits; dice are thrown from it
MIN_SPEED, MAX_SPEED, INSTANT = 0.5, 5.0, 5.5  # the throw's speed (1: as first made); INSTANT: no animation
MIN_SIZE, MAX_SIZE = 0.6, 1.8


class DiceRoller(SetType):
    key = "dice"
    template_settings = ("roll_types", "speed", "dice_size", "tray_edge", "rollers")
    name = "Dice roller"
    default_size = (900, 520)

    def default_config(self) -> dict:
        return {"roll_types": rules.default_roll_types(), "tray": [], "next_id": 1, "rolls": [], "rollers": None,
                "rolled_hidden": False, "tray_edge": "bottom", "speed": 2.0, "dice_size": 1.0}

    def initial_config(self, ctx: RenderContext) -> dict:
        starting = ctx.ruleset.saga_template.get("dice_rolls")
        return {**self.default_config(), "roll_types": copy.deepcopy(starting) if starting else rules.default_roll_types()}

    def normalize(self, config: dict | None) -> dict:
        config = {**self.default_config(), **copy.deepcopy(config or {})}
        # Before rolls stayed: one shown roll and a history
        old = config.pop("roll", None)
        config.pop("history", None)
        if old and not config["rolls"]:
            config["rolls"] = [{**old, "member_id": None}]
        return config

    # -- Saga templates (plan 41): who rolls, by member group key or name (members are the Saga's) -------------

    def template_config(self, config: dict, refs: TemplateRefs) -> dict:
        out = super().template_config(config, refs)
        if isinstance(out.get("rollers"), dict):
            out["rollers"] = {"groups": refs.names_of("member_group", out["rollers"].get("groups"))}
        return out

    def config_from_template(self, ctx: RenderContext, settings: dict, refs: TemplateRefs) -> dict:
        settings = dict(settings) if isinstance(settings, dict) else {}
        if isinstance(settings.get("rollers"), dict):
            settings["rollers"] = {"groups": refs.ids_of("member_group", settings["rollers"].get("groups")), "members": []}
        return super().config_from_template(ctx, settings, refs)

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
            elif key in ("speed", "dice_size"):
                low, high = (MIN_SPEED, INSTANT) if key == "speed" else (MIN_SIZE, MAX_SIZE)
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not low <= value <= high:
                    raise BadRequest(f"{key}: {low} to {high}")
                result[key] = round(float(value), 2)
            elif key == "rollers":  # None: everyone who sees it; else some groups and members (the DM always)
                result[key] = None if value is None else _visibility(value)
            elif key == "tray_edge":
                if value not in TRAY_EDGES:
                    raise BadRequest(f"tray_edge: one of {list(TRAY_EDGES)}")
                result[key] = value
            else:
                raise BadRequest(f"Unknown setting '{key}': the tray changes through acts")
        return result

    # -- acts (players and the DM) ---------------------------------------------------

    def can_roll(self, ctx: RenderContext, config: dict) -> bool:
        viewer = ctx.viewer
        if viewer.is_admin:
            return True
        if viewer.role != "player":
            return False
        return config["rollers"] is None or can_see(viewer, config["rollers"])

    def act(self, ctx: RenderContext, stage_set: StageSet, member_id: int, name: str, args: dict) -> None:
        config = self.normalize(stage_set.config)
        admin = ctx.viewer.is_admin
        tray = config["tray"]
        mine = [d for d in tray if d["member_id"] == member_id]
        if name in ("tray.add", "tray.take", "roll") and not self.can_roll(ctx, config):
            raise Forbidden("You don't roll on this dice roller")
        if name == "tray.add":
            roll_type = next((r for r in config["roll_types"] if r["id"] == args.get("type_id")), None)
            if roll_type is None:
                raise BadRequest("That roll isn't on this dice roller")
            count = sum(d["count"] for d in roll_type["dice"])
            if len(mine) + count > MAX_TRAY:
                raise BadRequest(f"At most {MAX_TRAY} dice at once: roll first")
            # The same roll again joins your group of it: its dice are read (summed) together
            same = next((d["group"] for d in mine if d["type_id"] == roll_type["id"]), None)
            group = same if same is not None else config["next_id"]
            if same is None:
                config["next_id"] += 1
            for line in roll_type["dice"]:
                for _ in range(line["count"]):
                    tray.append({"id": config["next_id"], "group": group, "type_id": roll_type["id"], "sides": line["sides"],
                                 "member_id": member_id, "forced": None})
                    config["next_id"] += 1
        elif name == "tray.take":  # one of a roll type back out of your tray (its last dice)
            roll_type = next((r for r in config["roll_types"] if r["id"] == args.get("type_id")), None)
            ours = [d for d in mine if d["type_id"] == args.get("type_id")]
            if roll_type is None or not ours:
                raise BadRequest("None of those to take back")
            per = sum(d["count"] for d in roll_type["dice"]) or 1
            gone = {d["id"] for d in ours[-per:]}
            config["tray"] = [d for d in tray if d["id"] not in gone]
        elif name == "tray.remove":
            group = [d for d in tray if d["group"] == args.get("group")]
            if not group:
                raise BadRequest("Those dice aren't in the tray")
            if not admin and group[0]["member_id"] != member_id:
                raise Forbidden("Only whoever added them (or the DM) takes them back")
            config["tray"] = [d for d in tray if d["group"] != args.get("group")]
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
        elif name == "roll":  # your own tray
            if not mine:
                raise BadRequest("Your tray is empty: add dice first")
            config["rolls"].append(self._roll(ctx, config, mine, member_id))
            config["tray"] = [d for d in tray if d["member_id"] != member_id]
            config["rolled_hidden"] = False  # a new row: every rolled die shows again
            _keep_latest(config)
        elif name == "clear":  # your row: your waiting dice and your rolls
            config["tray"] = [d for d in tray if d["member_id"] != member_id]
            config["rolls"] = [r for r in config["rolls"] if r.get("member_id") != member_id]
        elif name == "clear.all":
            if not admin:
                raise Forbidden("The DM clears every row")
            config["tray"], config["rolls"], config["rolled_hidden"] = [], [], False
        elif name == "rolls.hide":  # the DM hides (or shows) the rolled 3D dice for everyone; the results stay
            if not admin:
                raise Forbidden("The DM hides the rolled dice")
            config["rolled_hidden"] = bool(args.get("hidden", True))
        else:
            raise BadRequest(f"Unknown act '{name}'")
        stage_set.config = config

    def action_rolled(self, ctx: RenderContext, stage_set: StageSet, roll: dict) -> bool:
        """An action's dice, already rolled (their values the action's): thrown here in their owner's dice, one result
        per formula ("Short rest (1d8 + con)": its value), on a row of their owner's."""
        config = self.normalize(stage_set.config)
        owner = ctx.members.get(roll["member_id"])
        groups, thrown = [], 0
        for formula in roll.get("formulas") or []:
            # Dice the tray can draw (a d3 can't be thrown), and not too many at once
            dice = [d for d in formula.get("dice") or [] if d.get("sides") in rules.SIDES][:max(0, MAX_TRAY - thrown)]
            if not dice:
                continue
            thrown += len(dice)
            group_id = config["next_id"]
            config["next_id"] += 1
            out_dice = []
            for die in dice:
                out_dice.append({"id": config["next_id"], "sides": die["sides"], "value": int(die["value"]), "counted": True})
                config["next_id"] += 1
            groups.append({"group": group_id, "type_id": "action", "name": f"{roll['action']} ({formula['formula']})",
                           "label": formula["formula"], "times": 1, "member": owner["name"], "color": owner["color"],
                           "style": owner["style"], "dice": out_dice, "result": formula["value"]})
        if not groups:
            return False
        config["rolls"].append({"id": secrets.randbelow(2**31), "seed": secrets.randbelow(2**31), "member_id": roll["member_id"],
                                "by": owner["name"], "color": owner["color"], "groups": groups, "at": int(time.time())})
        config["rolled_hidden"] = False
        _keep_latest(config)
        stage_set.config = config
        return True

    def _roll(self, ctx: RenderContext, config: dict, dice_in: list[dict], member_id: int) -> dict:
        types = {r["id"]: r for r in config["roll_types"]}
        groups: dict[int, list[dict]] = {}
        for die in dice_in:
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
        me = ctx.members.get(member_id)
        return {"id": secrets.randbelow(2**31), "seed": secrets.randbelow(2**31), "member_id": member_id, "by": me["name"],
                "color": me["color"], "groups": out_groups, "at": int(time.time())}

    # -- render ----------------------------------------------------------------

    def render(self, ctx: RenderContext, stage_set: StageSet, actors) -> dict:
        config = self.normalize(stage_set.config)
        admin = ctx.viewer.is_admin
        tray = []
        for die in config["tray"]:
            if not admin and die["member_id"] != ctx.viewer.member_id:
                continue  # someone else's roll in the making: theirs
            owner = ctx.members.get(die["member_id"])
            item = {"id": die["id"], "group": die["group"], "type_id": die["type_id"], "sides": die["sides"],
                    "member_id": die["member_id"], "member": owner["name"], "color": owner["color"], "style": owner["style"]}
            if admin:
                item["forced"] = die["forced"]  # the DM's pick: players never get it
            tray.append(item)
        out = {"roll_types": [{**r, "label": rules.label(r)} for r in config["roll_types"]], "tray": tray,
               "tray_edge": config["tray_edge"], "speed": config["speed"], "dice_size": config["dice_size"],
               "rolls": config["rolls"], "rolled_hidden": config["rolled_hidden"], "can_roll": self.can_roll(ctx, config)}
        if admin:
            out["rollers"] = config["rollers"]
        return out


def _keep_latest(config: dict) -> None:
    """The latest rolls only (and not too many dice on the Set): the oldest go."""
    while len(config["rolls"]) > MAX_ROLLS or (
            len(config["rolls"]) > 1 and sum(len(g["dice"]) for r in config["rolls"] for g in r["groups"]) > MAX_ROLLED):
        config["rolls"].pop(0)


def _visibility(value) -> dict:
    """Some groups and members (ids; ids from elsewhere simply never match a viewer)."""
    if not isinstance(value, dict):
        raise BadRequest("rollers: {groups, members}")
    out = {}
    for key in ("groups", "members"):
        ids = value.get(key, [])
        if not isinstance(ids, list) or any(isinstance(i, bool) or not isinstance(i, int) for i in ids):
            raise BadRequest(f"rollers.{key}: a list of ids")
        out[key] = sorted(set(ids))
    return out
