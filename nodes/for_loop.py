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
    ValidationError,
)


class ForNode(BaseNode):
    definition = NodeDef(
        type="for",
        title="for",
        description="Bucle for: dispara la salida de ejecución en cada iteración.",
        inputs=[
            PortDef("exec_in", "in", RouteType.EXEC, required=True),
            PortDef("start", "in", RouteType.INT, required=False),
            PortDef("end", "in", RouteType.INT, required=True),
            PortDef("step", "in", RouteType.INT, required=False),
        ],
        outputs=[PortDef("exec_each", "out", RouteType.EXEC)],
        config_fields=[
            ConfigField(
                key="start",
                label="Inicio (si no hay conexión)",
                type="int",
                default=0,
            ),
            ConfigField(
                key="end",
                label="Fin (si no hay conexión)",
                type="int",
                default=5,
                required=True,
            ),
            ConfigField(
                key="step",
                label="Incremento (si no hay conexión)",
                type="int",
                default=1,
            ),
        ],
    )

    @classmethod
    def validate_instance(cls, node: NodeInstance, *, get_incoming_edge, get_def) -> list[ValidationError]:
        # 'end' es requerido: si no hay conexión, debe existir config
        end_edge = get_incoming_edge(node.id, "end")
        if end_edge is None and node.config.get("end") is None:
            return [ValidationError(node_id=node.id, message="El puerto 'end' es obligatorio")]
        return []

    @classmethod
    def evaluate_output(cls, node: NodeInstance, output_port: str, *, ctx: ResolveContext) -> Any:
        raise ValueError("for no tiene salidas de datos")

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
        start = ctx.input_value(node, cls.definition.inputs[1], default=node.config.get("start", 0))
        end = ctx.input_value(node, cls.definition.inputs[2], default=node.config.get("end"))
        step = ctx.input_value(node, cls.definition.inputs[3], default=node.config.get("step", 1))

        if end is None:
            raise ValueError("Falta 'end'")

        start_i = int(start)
        end_i = int(end)
        step_i = int(step)
        if step_i == 0:
            raise ValueError("'step' no puede ser 0")

        for _ in range(start_i, end_i, step_i):
            fire.fire("exec_each")
