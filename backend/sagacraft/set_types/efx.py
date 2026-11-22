"""EFX Sets: a Stage's environment, drawn in layers. They're connected: the Stage has one environment (picked in
Build's Stage panel or switched live from EFX Controls) and every EFX Set of the Stage shows its own layer of it.

- EFX - Far background, EFX - Near background, EFX - Foreground: the layer's effects (the frontend animates them);
  new ones go to the back (far, then near) or the front (fore), cover the screen (interface) or the other Sets
  (canvas), and have no frame. They never catch clicks (the frontend lets them through).
- EFX - Controls (the DM's: hidden from players when added): the environments to switch to, in one click.
See docs/concepts/efx.md.
"""
from domain.efx import LAYER_NAMES
from services.errors import BadRequest
from set_types.base import RenderContext, SetType

FULL_SCREEN = {"anchor": "center", "width": 100, "height": 100, "x": 0, "y": 0}


class EfxLayerSet(SetType):
    layer = ""
    default_size = (1600, 900)
    backdrop = True
    default_transparent = True
    default_screen = FULL_SCREEN

    def render(self, ctx: RenderContext, stage_set, actors) -> dict:
        env_id = stage_set.stage.environment_id
        content = {"layer": self.layer, **ctx.efx.layer(env_id, self.layer)}
        if ctx.viewer.is_admin:
            env = ctx.efx.environment(env_id)
            content["environment"] = {"id": env.id, "name": env.name} if env else None
        return content


class EfxFar(EfxLayerSet):
    key, name, layer, depth = "efx_far", f"EFX - {LAYER_NAMES['far']}", "far", 0


class EfxNear(EfxLayerSet):
    key, name, layer, depth = "efx_near", f"EFX - {LAYER_NAMES['near']}", "near", 1


class EfxFore(EfxLayerSet):
    key, name, layer, depth = "efx_fore", f"EFX - {LAYER_NAMES['fore']}", "fore", 3


class EfxControls(SetType):
    key, name = "efx_controls", "EFX - Controls"
    default_size = (420, 150)
    depth = 4
    private = True
    default_screen = {"anchor": "top-right", "width": 30, "height": 26, "x": 0, "y": 6}

    def command(self, ctx: RenderContext, stage_set, name: str, args: dict):
        if name != "environment.show":  # {environment_id: id or null}
            raise BadRequest(f"Unknown command '{name}'")
        env_id = args.get("environment_id")
        if env_id is not None and ctx.efx.environment(env_id) is None:
            raise BadRequest("Not one of this Saga's environments")
        stage_set.stage.environment_id = env_id
        return None

    def render(self, ctx: RenderContext, stage_set, actors) -> dict:
        if not ctx.viewer.is_admin:
            return {}
        return {"current": stage_set.stage.environment_id, "environments": ctx.efx.choices()}
