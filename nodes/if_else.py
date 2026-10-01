from __future__ import annotations

from typing import Any

from .base import (
    BaseNode,
    ConfigField,
    ExecFire,
    NodeDef,
    NodeInstance,
    PortDef,
    ResolveContext,
    RouteType,
)


class IfElseNode(BaseNode):
    definition = NodeDef(
        type="if_else",
        title="if-else",
        description=(
            "Ejecuta una ruta u otra según condiciones booleanas. "
            "Modo 'Constante' ejecuta al lanzar el proyecto. "
            "Modo 'ruta de ejecución' solo reacciona al disparo de entrada de ejecución."
        ),
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC, required=False),
            PortDef("if", "in", RouteType.BOOLEAN, required=False),
            PortDef("else", "in", RouteType.BOOLEAN, required=False),
        ],
        outputs=[
            PortDef("exec_if", "out", RouteType.EXEC),
            PortDef("exec_else", "out", RouteType.EXEC),
        ],
        config_fields=[
            ConfigField(
                key="mode",
                label="Modo de ejecución",
                type="select",
                default="constant",
                required=True,
                options=[
                    {"label": "Constante", "value": "constant"},
                    {"label": "Ruta de ejecución", "value": "exec"},
                ],
            ),
            ConfigField(
                key="if",
                label="Valor IF (si no hay conexión)",
                type="boolean",
                default=False,
            ),
            ConfigField(
                key="else",
                label="Valor ELSE (si no hay conexión)",
                type="boolean",
                default=True,
            ),
        ],
    )

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        raise ValueError("if-else no expone salidas de datos")

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
        mode = (node.config.get("mode") or "constant").lower()
        if mode == "exec" and not triggered:
            return

        cond_if = bool(ctx.input_value(node, cls.definition.inputs[1], default=False))
        cond_else = bool(ctx.input_value(node, cls.definition.inputs[2], default=True))

        if cond_if:
            fire.fire("exec_if")
        elif cond_else:
            fire.fire("exec_else")
