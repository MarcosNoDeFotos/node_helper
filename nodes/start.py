from __future__ import annotations

from .base import BaseNode, ExecFire, NodeDef, NodeInstance, PortDef, ResolveContext, RouteType


class StartNode(BaseNode):
    definition = NodeDef(
        type="start",
        title="Start",
        description="Nodo inicial del proyecto. Dispara la primera ruta de ejecución.",
        inputs=[],
        outputs=[PortDef("next", "out", RouteType.EXEC)],
    )

    @classmethod
    def evaluate_output(
        cls,
        node: NodeInstance,
        output_port: str,
        *,
        ctx: ResolveContext,
    ):
        return None

    @classmethod
    def execute(
        cls,
        node: NodeInstance,
        *,
        triggered: bool,
        ctx: ResolveContext,
        fire: ExecFire,
        emit_console,
        emit_notification,
    ) -> None:
        fire.fire("next")